import { File as MegaFile } from 'megajs';
import { parseMegaUrl } from './utils/mega-url.ts';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

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
    const megaFile = MegaFile.fromURL(rawUrl);
    
    // Set a 15-second timeout for attribute loading
    const loadPromise = new Promise<void>((resolve, reject) => {
      megaFile.loadAttributes((err: Error | null) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('MEGA metadata request timed out after 15s')), 15000);
    });

    await Promise.race([loadPromise, timeoutPromise]);

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
      const fileStream = fs.createReadStream(rawUrlOrPath, { start, end });
      return {
        stream: fileStream,
        cleanup: () => {
          fileStream.destroy();
        },
        contentLength: end - start + 1,
      };
    }

    // MEGA remote stream
    const megaFile = MegaFile.fromURL(rawUrlOrPath);
    const start = range?.start ?? 0;
    const end = range?.end ?? (totalSize ? totalSize - 1 : undefined);

    const downloadStream = megaFile.download({
      start,
      end,
      maxConnections: 2,
    });

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      try {
        if ('destroy' in downloadStream && typeof (downloadStream as any).destroy === 'function') {
          (downloadStream as any).destroy();
        } else if ('end' in downloadStream && typeof (downloadStream as any).end === 'function') {
          (downloadStream as any).end();
        }
      } catch {
        // Safe ignore
      }
    };

    const calculatedLength = end !== undefined ? end - start + 1 : 0;

    return {
      stream: downloadStream as unknown as NodeJS.ReadableStream,
      cleanup,
      contentLength: calculatedLength,
    };
  }
}

export const megaAdapter = new MegaAdapter();
