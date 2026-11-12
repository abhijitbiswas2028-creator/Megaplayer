import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase } from './src/server/db.ts';
import { authMiddleware } from './src/server/auth.ts';
import { authRouter } from './src/server/routes/auth-routes.ts';
import { videoRouter } from './src/server/routes/video-routes.ts';
import { userRouter } from './src/server/routes/user-routes.ts';
import { adminRouter } from './src/server/routes/admin-routes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();

// Initialize database schemas and seeds
initDatabase();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.resolve(__dirname, 'public')));

// Trust proxy for secure cookies behind reverse proxies/Cloud Run
app.set('trust proxy', 1);

// Attach session / auth state
app.use(authMiddleware);

// API Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/videos', videoRouter);
app.use('/api/v1', userRouter);
app.use('/api/v1/admin', adminRouter);

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    platform: 'MEGA STREAM X',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Vite Middleware for Full-stack Dev Mode or Production Static Serving
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

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
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup failure:', err);
  process.exit(1);
});
