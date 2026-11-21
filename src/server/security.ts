import type { Request, Response, NextFunction } from 'express';

/**
 * Explicit CORS allowlist. Reflecting every Origin while allowing credentials lets any
 * website read private API responses and perform actions with a viewer's session.
 *
 * Allowed origins:
 *  - same origin (Origin host equals the request host)
 *  - entries of CORS_ORIGINS (comma separated, e.g. "https://my-app.vercel.app")
 *  - http://localhost / 127.0.0.1 on any port outside production
 */
function configuredOrigins(): Set<string> {
  return new Set(
    (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean)
  );
}

export function isOriginAllowed(origin: string, req: Request): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.host === req.headers.host || parsed.host === req.headers['x-forwarded-host']) return true;
  if (configuredOrigins().has(parsed.origin)) return true;
  if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) return true;
  return false;
}

const warnedOrigins = new Set<string>();

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Vary', 'Origin');
    if (isOriginAllowed(origin, req)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
    } else {
      if (!warnedOrigins.has(origin) && warnedOrigins.size < 100) {
        warnedOrigins.add(origin);
        console.warn(`[cors] Rejected origin ${origin}. Add it to CORS_ORIGINS if it is your frontend.`);
      }
      // Block cross-site state-changing requests (CSRF via HTML forms bypasses preflight).
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.status(403).json({ error: 'Origin not allowed.' });
        return;
      }
    }
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Stream URLs may carry a session token; never leak full URLs to third parties.
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
}

/** Small fixed-window rate limiter for brute-force sensitive endpoints. */
export function rateLimit({ windowMs, max, message }: { windowMs: number; max: number; message: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of hits) if (value.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({ error: message });
      return;
    }
    next();
  };
}
