import { API, File as MegaFile } from 'megajs';
import { createDecipheriv } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { inspectThumbnail } from './thumbnail.ts';

const run = promisify(execFile);

/** Decode a single chunked attribute response for exactly the requested file handle.
 * Protocol: https://github.com/meganz/sdk/blob/master/src/fileattributefetch.cpp.
 */
export function decryptMegaPreview(response: Buffer, handle: Buffer, fileKey: Buffer) {
  if (handle.length !== 8 || fileKey.length !== 32 || response.length < 28
    || !response.subarray(0, 8).equals(handle) || response.readUInt32LE(8) !== response.length - 12
    || (response.length - 12) % 16 !== 0) throw new Error('Invalid MEGA preview response');
  const key = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) key[i] = fileKey[i] ^ fileKey[i + 16];
  const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16));
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(response.subarray(12)), decipher.final()]);
}

async function readPreview(response: globalThis.Response) {
  if (!response.ok || !response.body) throw new Error(`MEGA preview HTTP ${response.status}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 8 * 1024 * 1024) throw new Error('MEGA preview exceeds size limit');
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel(); }
}

/** Recover a preview attached to this exact MEGA file without downloading video data. */
export async function recoverMegaPreview(source: string, destination: string) {
  const api = new API(true);
  const file = MegaFile.fromURL(source.replace('/embed/', '/file/'), { api });
  const request = async (payload: Record<string, unknown>): Promise<any> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([api.request(payload as any), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('MEGA preview metadata timed out')), 20000);
      })]);
    } finally { clearTimeout(timer); }
  };
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temp = await fs.mkdtemp(path.join(path.dirname(destination), '.preview-'));
  try {
    const metadata = await request({ a: 'g', p: file.downloadId });
    for (const type of [1, 0]) {
      const match = new RegExp(`(?:^|/)\\d+:${type}\\*([\\w-]+)`).exec(metadata.fa || '');
      if (!match) continue;
      try {
        const handle = Buffer.from(match[1], 'base64url');
        const location = await request({ a: 'ufa', fah: match[1], r: 1, ssl: 2, v: 3 });
        const url = new URL(location.p);
        if (url.protocol !== 'https:') throw new Error('Invalid MEGA preview URL');
        const response = await fetch(url, { method: 'POST', body: handle, signal: AbortSignal.timeout(20000) });
        const data = await readPreview(response);
        const plain = decryptMegaPreview(data, handle, file.key!);
        const original = path.join(temp, 'original.bin');
        const candidate = path.join(temp, `${type}.jpg`);
        await fs.writeFile(original, plain);
        await run('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-i', original,
          '-frames:v', '1', '-vf', "scale=w='min(960,iw)':h=-2", '-q:v', '2', '-threads', '1', candidate],
        { timeout: 10000, maxBuffer: 1024 * 1024 });
        const quality = await inspectThumbnail(candidate);
        if (!quality.usable) continue;
        await fs.rename(candidate, destination);
        return type === 1 ? 'preview' : 'thumbnail';
      } catch { /* Try the alternate preview if this one is unavailable or invalid. */ }
    }
    throw new Error('No clear MEGA preview is available');
  } finally {
    api.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
}
