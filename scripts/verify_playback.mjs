// Run against a development server with DISABLE_BACKGROUND_CACHE=1.
// PLAYWRIGHT_MODULE may point to a temporary Playwright installation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.PLAYBACK_TEST_URL || 'http://localhost:3001';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ baseURL });
const page = await context.newPage();
const report = { date: new Date().toISOString(), baseURL, videos: [], ui: {}, errors: [] };
page.on('pageerror', error => report.errors.push(error.message));
// Keep the verification from overwriting the viewer's actual watch history.
await page.route('**/api/v1/progress/**', route => route.fulfill({ json: { success: true } }));
async function advancing(after, timeout = 60_000) {
  await page.waitForFunction(t => {
    const v = document.querySelector('video');
    if (v?.error) throw new Error(`Media error ${v.error.code}: ${v.error.message}`);
    return v && v.currentTime > t + 0.5 && v.readyState >= 2 && v.videoWidth > 0;
  }, after, { timeout });
}
try {
  assert.equal((await context.request.post('/api/v1/auth/quick-demo-login', { data: { role: 'FRIEND' } })).status(), 200);
  const { videos } = await (await context.request.get('/api/v1/videos?limit=200')).json();
  await page.goto('/');
  await page.getByRole('button', { name: `Play ${videos[0].title}`, exact: true }).first().waitFor();
  for (const video of videos) {
    const row = { id: video.id, title: video.title, checks: {} };
    try {
      const thumbnail = await context.request.get(video.thumbnail_url);
      assert.equal(thumbnail.status(), 200);
      assert.match(thumbnail.headers()['content-type'], /^image\//);
      row.checks.thumbnail = true;
      const { streamVariant, resolutions } = await (await context.request.get(`/api/v1/videos/${video.id}/resolutions`)).json();
      const stream = `/api/v1/videos/${video.id}/stream?variant=${streamVariant}`;
      const head = await context.request.head(stream);
      assert.equal(head.status(), 200);
      const size = Number(head.headers()['content-length']);
      assert.ok(size > 0);
      row.checks.head = true;
      for (const [name, range, length] of [['firstByte', 'bytes=0-0', 1], ['middleRange', `bytes=${Math.floor(size / 2)}-${Math.floor(size / 2) + 1023}`, 1024], ['lastRange', 'bytes=-1024', 1024]]) {
        const response = await context.request.get(stream, { headers: { Range: range }, timeout: 90_000 });
        assert.equal(response.status(), 206, `${name}: HTTP ${response.status()}`);
        assert.equal((await response.body()).length, length);
        row.checks[name] = true;
      }
      assert.equal((await context.request.get(stream, { headers: { Range: `bytes=${size}-` } })).status(), 416);
      row.checks.invalidRange = true;
      const play = page.getByRole('button', { name: `Play ${video.title}`, exact: true }).first();
      await play.click();
      await page.locator('video').waitFor();
      await page.locator('video').evaluate(v => { v.muted = true; });
      await page.waitForFunction(() => Number.isFinite(document.querySelector('video')?.duration), null, { timeout: 90_000 });
      await page.locator('video').evaluate(v => { v.currentTime = 0; return v.play(); });
      await advancing(0);
      row.checks.browserStart = true;
      const duration = await page.locator('video').evaluate(v => v.duration);
      row.duration = duration;
      for (const [name, position] of [['browserMiddle', duration / 2], ['browserEnd', Math.max(0, duration - 3)]]) {
        await page.locator('video').evaluate((v, time) => { v.currentTime = time; return v.play(); }, position);
        await advancing(position);
        row.checks[name] = true;
      }
      // Exercise every published rendition through its range endpoint.
      row.checks.resolutions = [];
      for (const resolution of resolutions.filter(r => r.available && r.id !== 'auto')) {
        const response = await context.request.get(`${stream}&resolution=${resolution.id}`, { headers: { Range: 'bytes=0-1023' } });
        assert.equal(response.status(), 206);
        assert.equal((await response.body()).length, 1024);
        row.checks.resolutions.push(resolution.id);
      }
      row.passed = true;
    } catch (error) {
      row.passed = false;
      row.error = error.message;
    } finally {
      const close = page.getByRole('button', { name: 'Close video player', exact: true });
      if (await close.count()) await close.click({ force: true });
    }
    report.videos.push(row);
    fs.writeFileSync('docs/playback-audit.json', JSON.stringify(report, null, 2));
    console.log(`${row.passed ? 'PASS' : 'FAIL'} ${row.id}${row.error ? ': ' + row.error.split('\n')[0] : ''}`);
  }
} finally {
  await context.request.post('/api/v1/auth/logout');
  await browser.close();
  fs.writeFileSync('docs/playback-audit.json', JSON.stringify(report, null, 2));
}
if (report.videos.some(v => !v.passed) || report.errors.length) process.exitCode = 1;
console.log(`${report.videos.filter(v => v.passed).length}/${report.videos.length} videos passed browser playback and HTTP checks`);
