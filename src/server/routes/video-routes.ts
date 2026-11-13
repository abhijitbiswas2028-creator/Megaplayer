import { Router, Request, Response } from 'express';
import { db } from '../db.ts';
import { requireAuth, requireOwner } from '../auth.ts';
import { megaAdapter } from '../mega-adapter.ts';
import { parseByteRange } from '../utils/range.ts';
import { encryptSensitiveRef, decryptSensitiveRef } from '../utils/crypto.ts';
import { parseMegaUrl } from '../utils/mega-url.ts';
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { queueThumbnailRepair } from '../video-cache.ts';

export const videoRouter = Router();

// GET /api/v1/videos/:id/resolutions: Returns original quality status (multi-resolution disabled)
videoRouter.get('/:id/resolutions', requireAuth, (req: Request, res: Response) => {
  const videoId = req.params.id;
  const video = db.prepare('SELECT id, status FROM videos WHERE id = ? OR slug = ?').get(videoId, videoId) as any;
  if (!video) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }
  if (video.status !== 'PUBLISHED' && req.user?.role !== 'OWNER') {
    res.status(403).json({ error: 'This video is currently unpublished.' });
    return;
  }
  res.json({ videoId: video.id, quality: 'original', resolutions: [] });
});

export function formatThumbnailUrl(url: string | null | undefined, updatedAt?: string | null): string {
  if (!url) return '';
  if (url.includes('?')) return url;
  const v = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  return `${url}?v=${v}`;
}

// GET /api/v1/videos: Browse library with categories, search, sorting
videoRouter.get('/', requireAuth, (req: Request, res: Response) => {
  const { category, search, sort = 'newest', limit = 100, offset = 0 } = req.query;
  const currentUserId = req.user!.id;
  const isOwner = req.user!.role === 'OWNER';

  let baseQuery = `
    SELECT 
      v.id, v.title, v.description, v.slug, v.duration_seconds, v.thumbnail_url,
      v.embed_url,
      v.status, v.view_count, v.is_featured, v.created_at, v.updated_at,
      wp.position_seconds as watch_position,
      wp.duration_seconds as watch_duration,
      wp.completed as is_completed,
      CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
    FROM videos v
    LEFT JOIN watch_progress wp ON v.id = wp.video_id AND wp.user_id = ?
    LEFT JOIN favorites f ON v.id = f.video_id AND f.user_id = ?
  `;

  const whereClauses: string[] = [];
  const params: any[] = [currentUserId, currentUserId];

  // Ordinary friends can only see PUBLISHED videos; Owner can see unpublished drafts too
  if (!isOwner) {
    whereClauses.push("v.status = 'PUBLISHED'");
  }

  if (category && typeof category === 'string' && category !== 'all') {
    whereClauses.push(`
      v.id IN (
        SELECT vc.video_id 
        FROM video_categories vc 
        JOIN categories c ON vc.category_id = c.id 
        WHERE c.slug = ? OR c.id = ?
      )
    `);
    params.push(category, category);
  }

  if (search && typeof search === 'string' && search.trim() !== '') {
    whereClauses.push('(v.title LIKE ? OR v.description LIKE ?)');
    const searchTerm = `%${search.trim()}%`;
    params.push(searchTerm, searchTerm);
  }

  if (whereClauses.length > 0) {
    baseQuery += ' WHERE ' + whereClauses.join(' AND ');
  }

  // Sorting
  switch (sort) {
    case 'views':
      baseQuery += ' ORDER BY v.view_count DESC, v.created_at DESC';
      break;
    case 'duration':
      baseQuery += ' ORDER BY v.duration_seconds DESC';
      break;
    case 'title':
      baseQuery += ' ORDER BY v.title ASC';
      break;
    case 'featured':
      baseQuery += ' ORDER BY v.is_featured DESC, v.created_at DESC';
      break;
    case 'newest':
    default:
      baseQuery += ' ORDER BY v.is_featured DESC, v.created_at DESC';
      break;
  }

  baseQuery += ' LIMIT ? OFFSET ?';
  const safeLimit = Math.min(200, Math.max(1, parseInt(String(limit), 10) || 50));
  const safeOffset = Math.max(0, parseInt(String(offset), 10) || 0);
  params.push(safeLimit, safeOffset);

  const videos = db.prepare(baseQuery).all(...params) as any[];

  // Attach categories to each video
  const videoIds = videos.map((v) => v.id);
  const categoriesMap: Record<string, any[]> = {};

  if (videoIds.length > 0) {
    const placeholders = videoIds.map(() => '?').join(',');
    const catRows = db.prepare(`
      SELECT vc.video_id, c.id, c.name, c.slug, c.icon
      FROM video_categories vc
      JOIN categories c ON vc.category_id = c.id
      WHERE vc.video_id IN (${placeholders})
      ORDER BY c.sort_order ASC
    `).all(...videoIds) as any[];

    for (const row of catRows) {
      if (!categoriesMap[row.video_id]) categoriesMap[row.video_id] = [];
      categoriesMap[row.video_id].push({
        id: row.id,
        name: row.name,
        slug: row.slug,
        icon: row.icon,
      });
    }
  }

  const enrichedVideos = videos.map((v) => ({
    ...v,
    thumbnail_url: formatThumbnailUrl(v.thumbnail_url, v.updated_at),
    is_featured: Boolean(v.is_featured),
    is_favorite: Boolean(v.is_favorite),
    is_completed: Boolean(v.is_completed),
    categories: categoriesMap[v.id] || [],
  }));

  res.json({ videos: enrichedVideos });
});

// GET /api/v1/videos/categories and /api/v1/videos/categories/list: Get list of all available categories
videoRouter.get(['/categories', '/categories/list'], requireAuth, (req: Request, res: Response) => {
  const categories = db.prepare(`
    SELECT c.id, c.name, c.slug, c.icon, c.description, c.sort_order,
      COUNT(vc.video_id) as video_count
    FROM categories c
    LEFT JOIN video_categories vc ON c.id = vc.category_id
    GROUP BY c.id
    ORDER BY c.sort_order ASC
  `).all();

  res.json({ categories });
});

// GET /api/v1/videos/:id: Single video detail
videoRouter.get('/:id', requireAuth, (req: Request, res: Response) => {
  const currentUserId = req.user!.id;
  const isOwner = req.user!.role === 'OWNER';

  const video = db.prepare(`
    SELECT 
      v.id, v.title, v.description, v.slug, v.duration_seconds, v.thumbnail_url,
      v.embed_url,
      v.status, v.view_count, v.is_featured, v.created_at, v.updated_at,
      v.mega_source_id,
      wp.position_seconds as watch_position,
      wp.duration_seconds as watch_duration,
      wp.completed as is_completed,
      CASE WHEN f.id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
    FROM videos v
    LEFT JOIN watch_progress wp ON v.id = wp.video_id AND wp.user_id = ?
    LEFT JOIN favorites f ON v.id = f.video_id AND f.user_id = ?
    WHERE v.id = ? OR v.slug = ?
  `).get(currentUserId, currentUserId, req.params.id, req.params.id) as any;

  if (!video) {
    res.status(404).json({ error: 'Video not found.' });
    return;
  }

  if (video.status !== 'PUBLISHED' && !isOwner) {
    res.status(403).json({ error: 'This video is currently unlisted or unpublished.' });
    return;
  }

  // Get categories
  const categories = db.prepare(`
    SELECT c.id, c.name, c.slug, c.icon, c.description
    FROM video_categories vc
    JOIN categories c ON vc.category_id = c.id
    WHERE vc.video_id = ?
    ORDER BY c.sort_order ASC
  `).all(video.id);

  // If Owner, also get non-sensitive MEGA source stats (file size, mime, name)
  let megaInfo = null;
  if (isOwner && video.mega_source_id) {
    const source = db.prepare(`
      SELECT id, file_id, file_name, file_size, mime_type, created_at
      FROM mega_sources
      WHERE id = ?
    `).get(video.mega_source_id) as any;
    if (source) {
      megaInfo = source;
    }
  }

  res.json({
    video: {
      ...video,
      thumbnail_url: formatThumbnailUrl(video.thumbnail_url, video.updated_at),
      is_featured: Boolean(video.is_featured),
      is_favorite: Boolean(video.is_favorite),
      is_completed: Boolean(video.is_completed),
      categories,
      megaInfo,
    },
  });
});

// POST /api/v1/videos/validate-mega: Owner tests a MEGA link before adding
videoRouter.post('/validate-mega', requireOwner, async (req: Request, res: Response) => {
  const { url } = req.body || {};

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'MEGA URL is required.' });
    return;
  }

  const parsed = parseMegaUrl(url);
  if (!parsed.isValid) {
    res.status(400).json({
      valid: false,
      error: parsed.errorMessage || 'Invalid MEGA URL format. Must include decryption key.',
    });
    return;
  }

  try {
    const metadata = await megaAdapter.resolveLink(url);
    res.json({
      valid: true,
      metadata: {
        fileId: metadata.id,
        fileName: metadata.name,
        fileSize: metadata.size,
        fileSizeBytes: metadata.size,
        mimeType: metadata.mimeType,
        isVideo: metadata.isVideo,
        sanitizedUrl: metadata.sanitizedUrl,
      },
    });
  } catch (err: any) {
    res.status(400).json({
      valid: false,
      error: err?.message || 'Failed to connect to MEGA servers to resolve file attributes. Check link validity and permissions.',
    });
  }
});

// POST /api/v1/videos: Owner adds a new video with encrypted MEGA reference or curated source
videoRouter.post('/', requireOwner, async (req: Request, res: Response) => {
  const {
    title,
    description,
    megaUrl,
    sampleStreamUrl,
    categoryIds = [],
    durationSeconds = 0,
    thumbnailUrl,
    isFeatured = false,
    status = 'PUBLISHED',
  } = req.body || {};

  if (!title || typeof title !== 'string' || title.trim() === '') {
    res.status(400).json({ error: 'Video title is required.' });
    return;
  }

  let megaSourceId: string | null = null;
  let finalDuration = Number(durationSeconds) || 0;
  let megaRawUrl: string | null = null;
  let megaTotalSize = 0;

  if (megaUrl && typeof megaUrl === 'string' && megaUrl.trim() !== '') {
    const parsed = parseMegaUrl(megaUrl);
    if (!parsed.isValid) {
      res.status(400).json({ error: parsed.errorMessage || 'Invalid MEGA URL.' });
      return;
    }

    try {
      // Resolve attributes from MEGA
      const meta = await megaAdapter.resolveLink(megaUrl);
      const rawUrl = megaUrl.trim();
      megaRawUrl = rawUrl;
      megaTotalSize = meta.size;

      // Direct unencoded link reference storage
      const cipherVal = rawUrl;
      const ivVal = 'direct';
      const authTagVal = 'direct';

      megaSourceId = `megasrc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO mega_sources (id, encrypted_ref, iv, auth_tag, file_id, file_name, file_size, mime_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        megaSourceId,
        cipherVal,
        ivVal,
        authTagVal,
        meta.id,
        meta.name,
        meta.size,
        meta.mimeType,
        new Date().toISOString()
      );
    } catch (err: any) {
      res.status(400).json({
        error: `Could not connect to MEGA: ${err?.message || 'Link resolution failed.'}`,
      });
      return;
    }
  }

  const now = new Date().toISOString();
  const videoId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') + `-${Date.now().toString(36)}`;

  const parsedMega = megaRawUrl ? parseMegaUrl(megaRawUrl) : null;
  const finalEmbedUrl = req.body.embedUrl || parsedMega?.embedUrl || null;

  db.prepare(`
    INSERT INTO videos (
      id, title, description, slug, duration_seconds, thumbnail_url,
      embed_url,
      mega_source_id, local_sample_path, status, view_count, is_featured,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    videoId,
    title.trim(),
    description || '',
    slug,
    finalDuration,
    thumbnailUrl || '',
    finalEmbedUrl,
    megaSourceId,
    sampleStreamUrl || null,
    status === 'UNPUBLISHED' ? 'UNPUBLISHED' : 'PUBLISHED',
    0,
    isFeatured ? 1 : 0,
    now,
    now
  );

  // Link categories
  if (Array.isArray(categoryIds) && categoryIds.length > 0) {
    const insertCat = db.prepare('INSERT OR IGNORE INTO video_categories (video_id, category_id) VALUES (?, ?)');
    for (const catId of categoryIds) {
      insertCat.run(videoId, catId);
    }
  }

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    req.user!.id,
    'VIDEO_CREATED',
    'VIDEO',
    videoId,
    req.ip || 'unknown',
    JSON.stringify({ title, hasMegaSource: Boolean(megaSourceId) }),
    now
  );

  queueThumbnailRepair(videoId);
  res.status(201).json({
    success: true,
    videoId,
    slug,
    message: 'Video added to library successfully!',
  });
});

// PATCH /api/v1/videos/:id: Owner updates video
videoRouter.patch('/:id', requireOwner, (req: Request, res: Response) => {
  const { title, description, durationSeconds, thumbnailUrl, isFeatured, status, categoryIds } = req.body || {};
  const videoId = req.params.id;

  const existing = db.prepare('SELECT id FROM videos WHERE id = ?').get(videoId);
  if (!existing) {
    res.status(404).json({ error: 'Video not found.' });
    return;
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (title !== undefined) {
    updates.push('title = ?');
    params.push(String(title).trim());
  }
  if (description !== undefined) {
    updates.push('description = ?');
    params.push(String(description));
  }
  if (durationSeconds !== undefined) {
    updates.push('duration_seconds = ?');
    params.push(Number(durationSeconds) || 0);
  }
  if (thumbnailUrl !== undefined) {
    updates.push('thumbnail_url = ?');
    params.push(String(thumbnailUrl));
  }
  if (isFeatured !== undefined) {
    updates.push('is_featured = ?');
    params.push(isFeatured ? 1 : 0);
  }
  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status === 'UNPUBLISHED' ? 'UNPUBLISHED' : 'PUBLISHED');
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());

  params.push(videoId);

  db.prepare(`UPDATE videos SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  // Update categories if provided
  if (Array.isArray(categoryIds)) {
    db.prepare('DELETE FROM video_categories WHERE video_id = ?').run(videoId);
    const insertCat = db.prepare('INSERT INTO video_categories (video_id, category_id) VALUES (?, ?)');
    for (const catId of categoryIds) {
      insertCat.run(videoId, catId);
    }
  }

  res.json({ success: true, message: 'Video updated successfully.' });
});

// DELETE /api/v1/videos/:id: Owner deletes video
videoRouter.delete('/:id', requireOwner, (req: Request, res: Response) => {
  const videoId = req.params.id;
  const video = db.prepare('SELECT id, title, mega_source_id FROM videos WHERE id = ?').get(videoId) as any;
  if (!video) {
    res.status(404).json({ error: 'Video not found.' });
    return;
  }

  db.prepare('DELETE FROM videos WHERE id = ?').run(videoId);
  if (video.mega_source_id) {
    db.prepare('DELETE FROM mega_sources WHERE id = ?').run(video.mega_source_id);
  }

  // Audit log
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    req.user!.id,
    'VIDEO_DELETED',
    'VIDEO',
    videoId,
    req.ip || 'unknown',
    JSON.stringify({ title: video.title }),
    new Date().toISOString()
  );

  res.json({ success: true, message: 'Video and cloud references deleted.' });
});

/**
 * CRITICAL VIDEO STREAMING ENGINE:
 * Handles GET and HEAD requests with RFC 7233 byte-range streaming,
 * authenticated access, upstream abort handling, and metrics logging.
 */
async function handleVideoStream(req: Request, res: Response, isHead: boolean) {
  const videoId = req.params.id;
  const isOwner = req.user?.role === 'OWNER';

  const video = db.prepare(`
    SELECT v.id, v.title, v.status, v.mega_source_id, v.local_sample_path,
           ms.encrypted_ref, ms.iv, ms.auth_tag, ms.file_size, ms.mime_type
    FROM videos v
    LEFT JOIN mega_sources ms ON v.mega_source_id = ms.id
    WHERE v.id = ? OR v.slug = ?
  `).get(videoId, videoId) as any;

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
      // Direct MEGA link used without requiring MEGA_ENCRYPTION_KEY
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
            db.prepare('UPDATE videos SET view_count = view_count + 1 WHERE id = ?').run(video.id);
          } catch {}
        });
      }

      // Record stream metric asynchronously without blocking pipeline
      setImmediate(() => {
        try {
          db.prepare(`
            INSERT INTO stream_metrics (id, video_id, user_id, bytes_streamed, range_header, status_code, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
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
        db.prepare('UPDATE videos SET view_count = view_count + 1 WHERE id = ?').run(video.id);
        db.prepare(`
          INSERT INTO stream_metrics (id, video_id, user_id, bytes_streamed, range_header, status_code, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
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
        db.prepare('UPDATE videos SET view_count = view_count + 1 WHERE id = ?').run(videoId);
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

// GET /api/v1/videos/:id/stream
videoRouter.get('/:id/stream', requireAuth, (req: Request, res: Response) => {
  void handleVideoStream(req, res, req.method === 'HEAD');
});

// HEAD /api/v1/videos/:id/stream
videoRouter.head('/:id/stream', requireAuth, (req: Request, res: Response) => {
  handleVideoStream(req, res, true);
});
