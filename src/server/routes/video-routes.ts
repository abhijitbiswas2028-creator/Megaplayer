import { Request, Response } from 'express';
import { collection, streamVideo, incrementViews } from '../mongo/store.ts';
import { megaAdapter } from '../mega-adapter.ts';
import { parseByteRange } from '../utils/range.ts';
import { decryptSensitiveRef } from '../utils/crypto.ts';
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';

export { mongoRouter as videoRouter } from '../mongo/routes.ts';

export function formatThumbnailUrl(url: string | null | undefined, updatedAt?: string | null): string {
  if (!url) return '';
  if (url.includes('?')) return url;
  const v = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  return `${url}?v=${v}`;
}

function recordView(id: string) {
  void incrementViews(id).catch(() => console.warn('Could not record view'));
}

function recordMetric(id: string, video_id: string, user_id: string, bytes_streamed: number, range_header: string, status_code: number, timestamp: string) {
  void collection('stream_metrics').insertOne({ id, video_id, user_id, bytes_streamed, range_header, status_code, timestamp }).catch(() => console.warn('Could not record stream metric'));
}

/**
 * CRITICAL VIDEO STREAMING ENGINE:
 * Handles GET and HEAD requests with RFC 7233 byte-range streaming,
 * authenticated access, upstream abort handling, and metrics logging.
 */
export async function handleVideoStream(req: Request, res: Response, isHead: boolean) {
  const videoId = req.params.id;
  const isOwner = req.user?.role === 'OWNER';

  const video = await streamVideo(videoId);

  if (!video) {
    res.status(404).send('Video not found');
    return;
  }

  if (video.status !== 'PUBLISHED' && !isOwner) {
    res.status(403).send('Video is currently unlisted');
    return;
  }

  // Determine stream source: Real decrypted MEGA link OR local sample stream
  let streamUrl: string | null = null;
  let totalSize: number = 0;
  let contentType: string = 'video/mp4';
  let isLocalFile = false;

  if (video.mega_source_id && video.encrypted_ref) {
    if (
      video.encrypted_ref.startsWith('http://') ||
      video.encrypted_ref.startsWith('https://') ||
      video.iv === 'direct'
    ) {
      streamUrl = video.encrypted_ref;
      totalSize = video.file_size || 0;
      contentType = video.mime_type || 'video/mp4';
    } else {
      try {
        streamUrl = decryptSensitiveRef({
          ciphertext: video.encrypted_ref,
          iv: video.iv,
          authTag: video.auth_tag,
        });
        totalSize = video.file_size || 0;
        contentType = video.mime_type || 'video/mp4';
      } catch (err) {
        console.warn('Decryption failed, checking for direct link fallback:', err);
        if (video.encrypted_ref.startsWith('http')) {
          streamUrl = video.encrypted_ref;
          totalSize = video.file_size || 0;
          contentType = video.mime_type || 'video/mp4';
        } else {
          res.status(500).send('Secure storage decryption failure');
          return;
        }
      }
    }
  } else if (video.local_sample_path && fs.existsSync(video.local_sample_path)) {
    streamUrl = video.local_sample_path;
    totalSize = fs.statSync(video.local_sample_path).size;
    contentType = 'video/mp4';
    isLocalFile = true;
  } else if (video.local_sample_path && /^https?:\/\//.test(video.local_sample_path)) {
    streamUrl = video.local_sample_path;
    contentType = 'video/mp4';
  }

  if (!streamUrl) {
    res.status(404).send('No valid streaming source found for this video');
    return;
  }

  const rangeHeader = req.headers.range;
  const isMegaLink =
    Boolean(video.mega_source_id) ||
    streamUrl.includes('mega.nz/') ||
    streamUrl.includes('mega.io/') ||
    streamUrl.includes('mega.co.nz/');

  // If streaming from a remote non-MEGA HTTP sample URL, proxy range
  if (!isLocalFile && !isMegaLink && (streamUrl.startsWith('http://') || streamUrl.startsWith('https://'))) {
    proxyHttpStream(streamUrl, rangeHeader, req, res, isHead, video.id);
    return;
  }

  // MEGA Range Streaming Pipeline
  try {
    const rangeResult = rangeHeader && totalSize > 0
      ? parseByteRange(rangeHeader, totalSize)
      : null;

    if (rangeResult && rangeResult.type === 'unsatisfiable') {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${rangeResult.totalLength}`);
      res.end();
      return;
    }

    if (rangeResult && rangeResult.type === 'valid') {
      const { range, contentLength, contentRange } = rangeResult;

      res.status(206);
      res.setHeader('Content-Range', contentRange);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', contentLength);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'private, no-store');

      if (isHead) {
        res.end();
        return;
      }

      const session = megaAdapter.createStream(streamUrl, range, totalSize);

      res.on('close', () => {
        session.cleanup();
      });

      session.stream.on('error', (err: any) => {
        const isClientAbort = req.destroyed || res.writableEnded || res.closed || /abort/i.test(err?.message || '');
        if (!isClientAbort) {
          console.error('MEGA stream pipeline error:', err?.message);
        }
        session.cleanup();
        if (!res.headersSent) {
          res.removeHeader('Content-Length');
          res.removeHeader('Content-Range');
          const isQuota = /509|bandwidth|quota/i.test(err?.message || '');
          res.status(isQuota ? 509 : 502).end();
        } else if (!res.writableEnded) {
          res.destroy();
        }
      });

      session.stream.pipe(res);

      // Increment view count asynchronously only on initial chunk
      const isInitialChunk = !rangeHeader || rangeHeader.includes('bytes=0-');
      if (isInitialChunk) {
        setImmediate(() => {
          try {
            recordView(video.id);
          } catch {}
        });
      }

      // Record stream metric asynchronously without blocking pipeline
      setImmediate(() => {
        try {
          recordMetric(
            `strm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            video.id,
            req.user?.id || 'anon',
            contentLength,
            rangeHeader || 'none',
            206,
            new Date().toISOString()
          );
        } catch {}
      });
      return;
    }

    // Full content request (no Range header)
    res.status(200);
    res.setHeader('Accept-Ranges', 'bytes');
    if (totalSize > 0) {
      res.setHeader('Content-Length', totalSize);
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store');

    if (isHead) {
      res.end();
      return;
    }

    const session = megaAdapter.createStream(streamUrl, undefined, totalSize);
    res.on('close', () => {
      session.cleanup();
    });

    session.stream.on('error', (err: any) => {
      const isClientAbort = req.destroyed || res.writableEnded || res.closed || /abort/i.test(err?.message || '');
      if (!isClientAbort) {
        console.error('MEGA stream error:', err?.message);
      }
      session.cleanup();
      if (!res.headersSent) {
        res.removeHeader('Content-Length');
        res.removeHeader('Content-Range');
        const isQuota = /509|bandwidth|quota/i.test(err?.message || '');
        res.status(isQuota ? 509 : 502).end();
      } else if (!res.writableEnded) {
        res.destroy();
      }
    });

    session.stream.pipe(res);

    // Increment view count and metrics asynchronously
    setImmediate(() => {
      try {
        recordView(video.id);
        recordMetric(
          `strm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          video.id,
          req.user?.id || 'anon',
          totalSize,
          'none',
          200,
          new Date().toISOString()
        );
      } catch {}
    });
  } catch (err: any) {
    console.error('Video stream handler caught error:', err);
    if (!res.headersSent) {
      res.removeHeader('Content-Length');
      res.removeHeader('Content-Range');
      res.status(500).send('Internal streaming failure');
    }
  }
}

function proxyHttpStream(
  targetUrl: string,
  rangeHeader: string | undefined,
  req: Request,
  res: Response,
  isHead: boolean,
  videoId: string
) {
  const parsedUrl = new URL(targetUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  const headers: Record<string, string> = {};
  if (rangeHeader) {
    headers['range'] = rangeHeader;
  }

  const upstreamReq = transport.request(
    targetUrl,
    {
      method: isHead ? 'HEAD' : 'GET',
      headers,
    },
    (upstreamRes) => {
      const statusCode = upstreamRes.statusCode || 200;
      res.status(statusCode);

      // Forward relevant headers
      const forwardedHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'last-modified',
        'etag',
      ];

      for (const h of forwardedHeaders) {
        if (upstreamRes.headers[h]) {
          res.setHeader(h, upstreamRes.headers[h] as string);
        }
      }

      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'private, no-cache');

      if (isHead) {
        upstreamRes.resume();
        res.end();
        return;
      }

      res.on('close', () => {
        upstreamReq.destroy();
      });

      upstreamRes.pipe(res);

      // Increment view count on successful start
      if (statusCode === 200 || (statusCode === 206 && (!rangeHeader || rangeHeader.includes('bytes=0-')))) {
        recordView(videoId);
      }
    }
  );

  upstreamReq.on('error', (err) => {
    console.error('Upstream proxy error:', err);
    if (!res.headersSent) {
      res.status(502).end('Upstream stream error');
    }
  });

  res.on('close', () => {
    upstreamReq.destroy();
  });

  upstreamReq.end();
}
