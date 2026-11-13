import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extractThumbnail, inspectThumbnail, scoreFrame, thumbnailTimes } from '../../src/server/thumbnail.ts';
import { withMegaThumbnailSource } from '../../src/server/thumbnail-source.ts';

const run = promisify(execFile);

test('Blank, dark, white and blue images are rejected; short clip timestamps stay in range', () => {
  for (const color of [[0, 0, 0], [10, 10, 10], [255, 255, 255], [0, 0, 255], [20, 50, 120]]) {
    assert.equal(scoreFrame(Uint8Array.from(Array.from({ length: 96 * 54 }, () => color).flat())).usable, false);
  }
  assert.equal(scoreFrame(new Uint8Array()).usable, false);
  for (const duration of [0.04, 0.2, 2, 600]) {
    assert.ok(thumbnailTimes(duration).every(time => time >= 0 && time < duration));
  }
  assert.throws(() => thumbnailTimes(0));
});

for (const clearSection of [0, 1, 2]) {
  test(`Selects a real frame when only section ${clearSection + 1} of the video is clear`, async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumbnail-timeline-'));
    const source = path.join(dir, 'source.mp4');
    const destination = path.join(dir, 'preview.jpg');
    try {
      const inputs = [0, 1, 2].flatMap(section => ['-f', 'lavfi', '-i', section === clearSection
        ? 'testsrc2=s=160x90:r=10:d=2' : `color=c=${section === 0 ? 'black' : 'blue'}:s=160x90:r=10:d=2`]);
      await run('ffmpeg', ['-v', 'error', ...inputs, '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[out]',
        '-map', '[out]', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', source]);
      const result = clearSection === 2
        ? await withMegaThumbnailSource(source, (await fs.stat(source)).size, stream => extractThumbnail(stream, destination))
        : await extractThumbnail(source, destination);
      assert.ok(Math.abs(result.duration - 6) < 0.1);
      assert.ok(result.timestamp >= clearSection * 2 && result.timestamp < (clearSection + 1) * 2);
      assert.equal((await inspectThumbnail(destination)).usable, true);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
}

test('An all-blue or broken source never overwrites an existing thumbnail and cleans temporary frames', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumbnail-failure-'));
  const source = path.join(dir, 'blue.mp4');
  const destination = path.join(dir, 'preview.jpg');
  try {
    await fs.writeFile(destination, 'existing preview');
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10:d=1', '-c:v', 'libx264', '-threads', '1', source]);
    await assert.rejects(extractThumbnail(source, destination), /No clear video frame/);
    await assert.rejects(extractThumbnail(path.join(dir, 'missing.mp4'), destination));
    assert.equal(await fs.readFile(destination, 'utf8'), 'existing preview');
    assert.deepEqual((await fs.readdir(dir)).sort(), ['blue.mp4', 'preview.jpg']);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
