import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';

export interface DownloadAttempt {
  stream: Readable;
  cleanup: () => void;
}

/** Resume failed downloads at the next unread byte, without duplicating data. */
export function createResilientStream(
  open: (start: number, end: number | undefined) => DownloadAttempt,
  start: number,
  end?: number,
  options: { retries?: number; idleTimeoutMs?: number; retryDelayMs?: number } = {},
) {
  const controller = new AbortController();
  let active: DownloadAttempt | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanupAttempt = () => {
    clearTimeout(timer);
    if (active) {
      active.stream.on('error', () => {});
      active.stream.destroy();
      active.cleanup();
      active = undefined;
    }
  };
  const stream = Readable.from((async function* () {
    let offset = start;
    let failures = 0;
    while (!controller.signal.aborted && (end === undefined || offset <= end)) {
      try {
        active = open(offset, end);
        active.stream.on('error', () => {});
        const iterator = active.stream[Symbol.asyncIterator]();
        while (!controller.signal.aborted) {
          // Count only time waiting for upstream, never downstream backpressure.
          timer = setTimeout(() => active?.stream.destroy(new Error('Cloud stream stalled')),
            options.idleTimeoutMs ?? 20_000);
          let next: IteratorResult<Buffer>;
          try { next = await iterator.next(); } finally { clearTimeout(timer); }
          if (next.done) break;
          const chunk = Buffer.from(next.value);
          const remaining = end === undefined ? chunk.length : end - offset + 1;
          const data = chunk.subarray(0, remaining);
          offset += data.length;
          yield data;
          if (end !== undefined && offset > end) return;
        }
        if (end !== undefined && offset <= end) throw new Error('Cloud stream ended before all bytes arrived');
        return;
      } catch (error) {
        if (controller.signal.aborted) return;
        // Quota exhaustion and unavailable files cannot be fixed by immediate retries.
        if (/bandwidth limit|quota|not found|access denied|ENOENT/i.test(String(error)) ||
            failures++ >= (options.retries ?? 2)) throw error;
      } finally {
        cleanupAttempt();
      }
      await delay((options.retryDelayMs ?? 500) * failures, undefined, { signal: controller.signal });
    }
  })(), { objectMode: false, highWaterMark: 512 * 1024 });
  const cleanup = () => {
    controller.abort();
    cleanupAttempt();
    stream.destroy();
  };
  stream.once('close', cleanup);
  return { stream, cleanup, contentLength: end === undefined ? 0 : end - start + 1 };
}
