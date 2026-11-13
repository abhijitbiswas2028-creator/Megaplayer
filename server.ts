import 'dotenv/config';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initDatabase } from './src/server/db.ts';
import { authMiddleware } from './src/server/auth.ts';
import { authRouter } from './src/server/routes/auth-routes.ts';
import { videoRouter } from './src/server/routes/video-routes.ts';
import { userRouter } from './src/server/routes/user-routes.ts';
import { adminRouter } from './src/server/routes/admin-routes.ts';
import { repairLibraryThumbnails } from './src/server/video-cache.ts';
import { mongoEnabled, connectMongo, migrateSqlite, mongo } from './src/server/mongo/store.ts';
import { mongoAuth, mongoAuthRouter } from './src/server/mongo/auth.ts';
import { mongoRouter } from './src/server/mongo/routes.ts';
import { mongoAdminRouter } from './src/server/mongo/admin.ts';
import { thumbnailRouter } from './src/server/mongo/thumbnails.ts';

// Process guards for graceful streaming lifecycle
process.on('unhandledRejection', (reason) => {
  if (reason instanceof Error && (reason.name === 'AbortError' || /abort/i.test(reason.message))) {
    return; // Normal stream abort on client disconnect or seek
  }
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  if (err.name === 'AbortError' || /abort/i.test(err.message)) {
    return; // Normal stream abort on client disconnect or seek
  }
  console.error('Uncaught Exception:', err);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const app = express();

// SQLite is retained as the migration source and local-development fallback.
initDatabase();

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// CORS support for Vercel and cross-origin frontend clients
app.use((req: Request, res: Response, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Serve thumbnails with strict no-cache headers so client browsers always receive updated thumbnails
app.use('/thumbnails', (req: Request, res: Response, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}, express.static(path.resolve(__dirname, 'public/thumbnails'), {
  etag: false,
  maxAge: 0,
  lastModified: false,
}));

app.use(express.static(path.resolve(__dirname, 'public'), {
  maxAge: '1h',
  etag: true,
}));

// Trust proxy for secure cookies behind reverse proxies/Cloud Run
app.set('trust proxy', 1);

if (mongoEnabled) app.use('/media/thumbnails', thumbnailRouter);

// Attach session / auth state
app.use(mongoEnabled ? mongoAuth : authMiddleware);

// API Routes
if (mongoEnabled) {
  app.use('/api/v1/auth', mongoAuthRouter);
  app.use('/api/v1/admin', mongoAdminRouter);
  app.use('/api/v1', mongoRouter);
} else {
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/videos', videoRouter);
  app.use('/api/v1', userRouter);
  app.use('/api/v1/admin', adminRouter);
}
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    if (mongoEnabled) await mongo().command({ping:1});
    res.json({status:'ok', platform:'MEGA STREAM X', database:mongoEnabled?'mongodb':'sqlite', timestamp:new Date().toISOString(), version:'1.1.0'});
  } catch { res.status(503).json({status:'unavailable',database:'mongodb'}); }
});
app.use('/api', (_req,res) => {res.status(404).json({error:'API route not found'});});
app.use((error: any, _req: Request, res: Response, next: express.NextFunction) => {
  if (res.headersSent) { next(error); return; }
  const status = error.code === 11000 ? 409 : error.status || 500;
  console.error('Request failed:', error.name, error.code || status);
  res.status(status).json({error:status===409?'A record with these details already exists.':status===400?error.message:'The service could not complete this request. Please retry.'});
});

// Vite Middleware for Full-stack Dev Mode or Production Static Serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (mongoEnabled) { await connectMongo(); await migrateSqlite(db); }

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> MEGA STREAM X Server running on http://0.0.0.0:${PORT}`);
    void repairLibraryThumbnails().catch(() => console.warn('Thumbnail repair could not start'));
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup failure:', err instanceof Error ? err.name : 'Unknown error');
  process.exit(1);
});
