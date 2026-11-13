import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { megaAdapter } from './mega-adapter.ts';
import { parseByteRange } from './utils/range.ts';

/** Seekable decrypted stream for ffmpeg; no video cache or user session required. */
export async function withMegaThumbnailSource<T>(url: string, size: number, work: (source: string) => Promise<T>): Promise<T> {
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Video size is unavailable');
  const route = `/${randomUUID()}`;
  const server = http.createServer((req, res) => {
    if (req.url !== route || !['GET', 'HEAD'].includes(req.method || '')) {
      res.writeHead(404).end();
      return;
    }
    const parsed = req.headers.range ? parseByteRange(req.headers.range, size) : null;
    if (parsed?.type === 'unsatisfiable') {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    const range = parsed?.type === 'valid' ? parsed.range : { start: 0, end: size - 1 };
    res.statusCode = parsed?.type === 'valid' ? 206 : 200;
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', range.end - range.start + 1);
    if (parsed?.type === 'valid') res.setHeader('Content-Range', parsed.contentRange);
    if (req.method === 'HEAD') { res.end(); return; }
    const session = megaAdapter.createStream(url, range, size);
    res.on('close', session.cleanup);
    session.stream.on('error', () => { res.destroy(); session.cleanup(); });
    session.stream.pipe(res);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as { port: number };
    return await work(`http://127.0.0.1:${address.port}${route}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
