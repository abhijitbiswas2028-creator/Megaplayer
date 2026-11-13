import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, PassThrough } from 'node:stream';
import { createResilientStream } from '../../src/server/resilient-stream.ts';

const options = { retryDelayMs: 1, idleTimeoutMs: 30 };
async function collect(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

test('Cloud retry resumes after a broken connection without duplicated or missing bytes', async () => {
  const offsets: number[] = [];
  let cleaned = 0;
  const session = createResilientStream((start) => {
    offsets.push(start);
    return { stream: Readable.from((async function* () {
      if (offsets.length === 1) { yield Buffer.from('012'); throw new Error('Connection reset'); }
      yield Buffer.from('3456789');
    })()), cleanup: () => { cleaned++; } };
  }, 0, 9, options);
  assert.equal(await collect(session.stream), '0123456789');
  assert.deepEqual(offsets, [0, 3]);
  assert.equal(cleaned, 2);
});

test('Cloud retry detects a short response and resumes an unaligned range', async () => {
  const offsets: number[] = [];
  const session = createResilientStream(start => {
    offsets.push(start);
    return { stream: Readable.from([Buffer.from(offsets.length === 1 ? 'ab' : 'cde')]), cleanup() {} };
  }, 17, 21, options);
  assert.equal(await collect(session.stream), 'abcde');
  assert.deepEqual(offsets, [17, 19]);
});

test('Cloud retry times out stalled requests and has a bounded retry budget', async () => {
  let attempts = 0;
  let cleaned = 0;
  const session = createResilientStream(() => {
    attempts++;
    return { stream: new PassThrough(), cleanup() { cleaned++; } };
  }, 0, 9, options);
  await assert.rejects(collect(session.stream), /stalled/);
  assert.equal(attempts, 3);
  assert.equal(cleaned, 3);
});

test('Closing a player cancels the active upstream and prevents retries', async () => {
  let attempts = 0;
  let cleaned = 0;
  const session = createResilientStream(() => {
    attempts++;
    const stream = new PassThrough();
    stream.write(Buffer.from('a'));
    return { stream, cleanup() { cleaned++; } };
  }, 0, 9, options);
  await new Promise<void>(resolve => session.stream.once('data', () => { session.cleanup(); resolve(); }));
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(attempts, 1);
  assert.equal(cleaned, 1);
});

test('MEGA bandwidth quota errors are surfaced without repeated downloads', async () => {
  let attempts = 0;
  const session = createResilientStream(() => {
    attempts++;
    return { stream: Readable.from((async function* () { throw new Error('Bandwidth limit reached'); })()), cleanup() {} };
  }, 0, 9, options);
  await assert.rejects(collect(session.stream), /Bandwidth limit/);
  assert.equal(attempts, 1);
});

test('Single-byte ranges do not leak excess SDK download bytes', async () => {
  const session = createResilientStream(() => ({ stream: Readable.from([Buffer.from('abc')]), cleanup() {} }), 0, 0);
  assert.equal(await collect(session.stream), 'a');
});
