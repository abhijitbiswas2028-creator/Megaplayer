import { API, File as MegaFile, decrypt as megaDecrypt } from 'megajs';
import { parseMegaUrl } from './utils/mega-url.ts';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, PassThrough, Transform } from 'node:stream';
import { createResilientStream } from './resilient-stream.ts';

export interface MegaFileMetadata {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  isVideo: boolean;
  sanitizedUrl: string;
}

export interface StreamSession {
  stream: NodeJS.ReadableStream;
  cleanup: () => void;
  contentLength: number;
}

export interface StorageNodeInfo {
  storageUrl: string;
  key: any;
  size: number;
  expires: number;
}

const VIDEO_EXTENSIONS: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.ts': 'video/mp2t',
  '.avi': 'video/x-msvideo',
};

export function getMimeTypeFromFilename(filename: string): { mimeType: string; isVideo: boolean } {
  const ext = path.extname(filename).toLowerCase();
  const mimeType = VIDEO_EXTENSIONS[ext] || 'application/octet-stream';
  return {
    mimeType,
    isVideo: mimeType.startsWith('video/'),
  };
}

// Persistent shared API instance with HTTP keepalive for fast connection reuse
const sharedMegaApi = new API(true);

// In-memory cache for resolved MEGA storage node URLs to eliminate repeated metadata API calls on seek
const storageUrlCache = new Map<string, StorageNodeInfo>();
const inFlightStorageRequests = new Map<string, Promise<StorageNodeInfo>>();

export async function getMegaStorageInfo(validUrl: string): Promise<StorageNodeInfo> {
  const cached = storageUrlCache.get(validUrl);
  if (cached && Date.now() < cached.expires) {
    return cached;
  }

  const inFlight = inFlightStorageRequests.get(validUrl);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async () => {
    try {
      const file = MegaFile.fromURL(validUrl, { api: sharedMegaApi });
      return await new Promise<StorageNodeInfo>((resolve, reject) => {
        sharedMegaApi.request({ a: 'g', g: 1, ssl: 2, p: file.downloadId } as any, (err: any, response: any) => {
          if (err) return reject(err);
          if (typeof response?.g !== 'string' || !response.g.startsWith('http')) {
            return reject(new Error('MEGA servers returned invalid storage node response'));
          }
          const info: StorageNodeInfo = {
            storageUrl: response.g,
            key: file.key,
            size: typeof response.s === 'number' ? response.s : 0,
            expires: Date.now() + 30 * 60 * 1000, // 30 minutes
          };
          storageUrlCache.set(validUrl, info);
          resolve(info);
        });
      });
    } finally {
      inFlightStorageRequests.delete(validUrl);
    }
  })();

  inFlightStorageRequests.set(validUrl, promise);
  return promise;
}

export class MegaAdapter {
  /**
   * Validate a MEGA share link and extract its remote attributes without full download
   */
  async resolveLink(rawUrl: string): Promise<MegaFileMetadata> {
    const parsed = parseMegaUrl(rawUrl);
    if (!parsed.isValid || !parsed.id) {
      throw new Error(parsed.errorMessage || 'Invalid MEGA URL');
    }

    // Connect to MEGA API via megajs File.fromURL
    const validUrl = parsed.fileUrl || rawUrl.replace('/embed/', '/file/');
    const megaFile = MegaFile.fromURL(validUrl);
    
    // Set a 15-second timeout for attribute loading
    const loadPromise = new Promise<void>((resolve, reject) => {
      megaFile.loadAttributes((err: Error | null) => {
        if (err) return reject(err);
        resolve();
      });
    });

    let timeout: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('MEGA metadata request timed out after 15s')), 15000);
    });

    try { await Promise.race([loadPromise, timeoutPromise]); }
    finally { clearTimeout(timeout!); }

    const name = megaFile.name || `mega-file-${parsed.id}.mp4`;
    const size = typeof megaFile.size === 'number' ? megaFile.size : 0;
    const { mimeType, isVideo } = getMimeTypeFromFilename(name);

    return {
      id: parsed.id,
      name,
      size,
      mimeType,
      isVideo,
      sanitizedUrl: parsed.sanitizedUrl || `https://mega.nz/file/${parsed.id}`,
    };
  }

  /**
   * Create an authenticated byte-range stream from MEGA or local sample
   */
  createStream(
    rawUrlOrPath: string,
    range?: { start: number; end: number },
    totalSize?: number
  ): StreamSession {
    // Check if it's a local filesystem file (e.g. bundled sample video)
    if (fs.existsSync(rawUrlOrPath)) {
      const start = range?.start ?? 0;
      const end = range?.end ?? (fs.statSync(rawUrlOrPath).size - 1);
      const fileStream = fs.createReadStream(rawUrlOrPath, {
        start,
        end,
        highWaterMark: 512 * 1024, // 512KB chunks for butter-smooth streaming
      });
      return {
        stream: fileStream,
        cleanup: () => {
          fileStream.destroy();
        },
        contentLength: end - start + 1,
      };
    }

    // MEGA remote stream
    const validUrl = rawUrlOrPath.replace('/embed/', '/file/');
    const start = range?.start ?? 0;
    const end = range?.end ?? (totalSize ? totalSize - 1 : undefined);

    return createResilientStream((offset, lastByte) => {
      const outStream = new PassThrough();
      const controller = new AbortController();
      let activeBody: Readable | undefined;
      let decStream: any;
      let skipStream: Transform | undefined;

      const cleanup = () => {
        if (!controller.signal.aborted) {
          controller.abort();
        }
        if (activeBody) {
          activeBody.destroy();
          activeBody = undefined;
        }
        if (decStream) {
          decStream.destroy();
          decStream = undefined;
        }
        if (skipStream) {
          skipStream.destroy();
          skipStream = undefined;
        }
        if (!outStream.destroyed) {
          outStream.destroy();
        }
      };

      (async () => {
        try {
          const { storageUrl, key } = await getMegaStorageInfo(validUrl);
          if (controller.signal.aborted) return;

          const apiStart = offset - (offset % 16);
          const skip = offset - apiStart;
          const rangeEnd = lastByte !== undefined && lastByte >= 0 ? lastByte : undefined;
          const fetchUrl = rangeEnd !== undefined
            ? `${storageUrl}/${apiStart}-${rangeEnd}`
            : `${storageUrl}/${apiStart}`;

          const res = await fetch(fetchUrl, { signal: controller.signal });
          if (!res.ok) {
            if (res.status === 401 || res.status === 403 || res.status === 404) {
              storageUrlCache.delete(validUrl);
            }
            throw new Error(`MEGA storage node returned HTTP ${res.status}`);
          }
          if (!res.body) {
            throw new Error('MEGA storage node returned empty response body');
          }

          activeBody = Readable.fromWeb(res.body as any);
          decStream = megaDecrypt(key, { start: apiStart, disableVerification: true });

          activeBody.on('error', (err: any) => {
            if (!controller.signal.aborted && !outStream.destroyed) {
              outStream.destroy(err);
            }
          });
          decStream.on('error', (err: any) => {
            if (!controller.signal.aborted && !outStream.destroyed) {
              outStream.destroy(err);
            }
          });

          if (skip > 0) {
            let skipped = 0;
            skipStream = new Transform({
              transform(chunk, _enc, callback) {
                if (skipped < skip) {
                  const toSkip = Math.min(chunk.length, skip - skipped);
                  skipped += toSkip;
                  if (chunk.length > toSkip) {
                    callback(null, chunk.subarray(toSkip));
                  } else {
                    callback();
                  }
                } else {
                  callback(null, chunk);
                }
              },
            });
            skipStream.on('error', (err: any) => {
              if (!controller.signal.aborted && !outStream.destroyed) {
                outStream.destroy(err);
              }
            });
            activeBody.pipe(decStream).pipe(skipStream).pipe(outStream);
          } else {
            activeBody.pipe(decStream).pipe(outStream);
          }
        } catch (err: any) {
          if (!controller.signal.aborted && !outStream.destroyed) {
            outStream.destroy(err);
          }
        }
      })();

      return {
        stream: outStream,
        cleanup,
      };
    }, start, end);
  }
}

export const megaAdapter = new MegaAdapter();
