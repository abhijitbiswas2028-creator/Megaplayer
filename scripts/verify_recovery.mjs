import assert from 'node:assert/strict';
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ baseURL: process.env.PLAYBACK_TEST_URL || 'http://localhost:3001' });
const page = await context.newPage();
const checks = [];
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/api/v1/progress/**', route => route.fulfill({ json: { success: true } }));
try {
  await context.request.post('/api/v1/auth/quick-demo-login', { data: { role: 'FRIEND' } });
  const { videos } = await (await context.request.get('/api/v1/videos?limit=200')).json();
  let video;
  for (const candidate of videos) {
    const data = await (await context.request.get(`/api/v1/videos/${candidate.id}/resolutions`)).json();
    if (data.streamVariant === 'faststart' && data.resolutions.some(r => r.id === '360p' && r.available)) { video = candidate; break; }
  }
  assert.ok(video, 'A cached video with a 360p rendition is required');
  await page.goto('/');
  const play = page.getByRole('button', { name: `Play ${video.title}`, exact: true }).first();
  await play.waitFor();
  let streamRequests = 0;
  page.on('request', request => { if (request.url().includes('/stream?')) streamRequests++; });
  await play.hover();
  await page.waitForTimeout(500);
  assert.equal(streamRequests, 0, 'Hover must not download the video');
  checks.push('Hover does not start video downloads');
  await play.click();
  await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0.2);
  await page.locator('video').evaluate(v => { v.muted = true; v.currentTime = 20; });
  await page.waitForFunction(() => !document.querySelector('video')?.seeking);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const pausedAt = await page.locator('video').evaluate(v => v.currentTime);
  await page.getByRole('button', { name: 'Video resolution', exact: true }).click();
  await page.getByRole('button', { name: '360p Data Saver', exact: true }).click();
  await page.waitForFunction(() => {
    const v = document.querySelector('video'); return v?.readyState >= 2 && !v.seeking && v.currentTime >= 19;
  });
  await page.waitForTimeout(500);
  const switched = await page.locator('video').evaluate(v => ({ paused: v.paused, time: v.currentTime }));
  assert.equal(switched.paused, true, 'A quality switch must preserve paused state');
  assert.ok(Math.abs(switched.time - pausedAt) < 0.5);
  checks.push('Quality switch preserves position and paused state');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(t => document.querySelector('video')?.currentTime > t + 0.5, pausedAt);
  const before = await page.locator('video').evaluate(v => v.currentTime);
  // Emit the browser's network-error event; server retry tests inject real stream failures.
  const requestsBefore = streamRequests;
  await page.locator('video').evaluate(v => {
    Object.defineProperty(v, 'error', { configurable: true, value: { code: 2 } });
    v.dispatchEvent(new Event('error'));
    delete v.error;
  });
  await page.waitForFunction(t => document.querySelector('video')?.currentTime > t + 2, before, { timeout: 15_000 });
  assert.ok(streamRequests > requestsBefore, 'Automatic recovery must request the stream again');
  checks.push('Network-error recovery reloads and resumes without losing position');
  const manualBefore = await page.locator('video').evaluate(v => v.currentTime);
  await page.locator('video').evaluate(v => {
    Object.defineProperty(v, 'error', { configurable: true, value: { code: 4 } });
    v.dispatchEvent(new Event('error'));
    delete v.error;
  });
  await page.getByRole('button', { name: 'Retry Connection', exact: true }).click();
  await page.waitForFunction(t => document.querySelector('video')?.currentTime > t + 0.5, manualBefore);
  checks.push('Manual retry preserves playback position');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Close video player', exact: true }).click({ force: true });
  assert.equal(await page.locator('video').count(), 0);
  checks.push('Player closes on mobile viewport');
  assert.deepEqual(errors, []);
} finally {
  await context.request.post('/api/v1/auth/logout');
  await browser.close();
  fs.writeFileSync('docs/recovery-audit.json', JSON.stringify({ date: new Date().toISOString(), checks, errors }, null, 2));
  console.log(checks);
}
