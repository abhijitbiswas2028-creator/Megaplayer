# Playback verification — 2026-11-13

Verified the flow: authenticated library → thumbnail → player → local cache or MEGA → browser decoding → seeking and recovery.

## Results

- **28/28 automated tests passed**, including HTTP ranges, HEAD, access control, missing sources, upstream failure responses, interrupted and truncated streams, stalled downloads, cancellation, quota errors, single-byte ranges, stable source selection, progress fields and FFmpeg metadata extraction.
- **24/24 catalog videos passed Chromium playback checks at the beginning, middle and near the end.** Each check required the playback clock to advance, a decoded video frame, and no media error.
- **24/24 thumbnails**, HEAD requests, first-byte/middle/suffix ranges and out-of-bounds responses passed.
- **18 available quality renditions** returned the requested MP4 byte ranges.
- Browser recovery checks passed: hover does not download video; quality switching preserves paused state and position; automatic recovery and manual retry preserve position; the player closes at a mobile viewport.
- No browser JavaScript exceptions were recorded.
- TypeScript (`npm run lint`), production build (`npm run build`) and `git diff --check` passed.

Detailed results: [catalog audit](playback-audit.json) and [recovery audit](recovery-audit.json).

## Fixes

- Cloud downloads retry from the next unread byte, with a bounded retry budget and timeout for stalled reads. Short streams are detected. Closing the player aborts in-flight cloud requests. Quota errors are not repeatedly retried by the server.
- Failed HTTP streams no longer retain an incorrect Content-Length or Content-Range. Partial failures terminate the connection rather than pretending the response completed.
- The player retries network errors, detects long stalls, and restores the playback timestamp. Quality changes preserve pause state and playback rate.
- Each playback session pins its source layout, preventing a newly created faststart MP4 from changing byte offsets between range requests.
- Removed full-video downloads triggered by hovering over cards.
- Background media processing is serialized, limits FFmpeg threads, checks disk space, avoids upscaling, and delays retrying failed jobs. HEAD and rejected ranges do not start background downloads.
- Missing local files return 404. Unpublished resolution metadata respects access control. Authenticated video responses use private cache headers. Malformed range numbers are rejected by the parser.

## Repeat the checks

```sh
npm test
npm run lint
npm run build
```

For browser verification, install Playwright and Chromium, then run a separate development server with background caching disabled so an audit does not download entire uncached videos:

```sh
PORT=3001 DISABLE_BACKGROUND_CACHE=1 npm run dev
# In another terminal, with Playwright available:
node scripts/verify_playback.mjs
node scripts/verify_recovery.mjs
```

`PLAYBACK_TEST_URL` overrides the default `http://localhost:3001`. `PLAYWRIGHT_MODULE` can point to an external Playwright module and `PLAYWRIGHT_BROWSERS_PATH` to its downloaded browsers. This run used temporary installations under `/tmp`; application dependencies were unchanged.

The browser scripts use the development friend login, intercept progress updates to preserve watch history, and log out afterward. Playback still increments normal view/stream metrics.

## Scope

These are sampled playback checks, not continuous full-length viewing of every video. Browser recovery tests simulate media network-error events; server regression tests inject actual broken, short and stalled streams. Alternate quality files were checked through HTTP ranges; the default source was decoded in Chromium. Safari, Firefox, real mobile devices, PiP and fullscreen were not exercised. MEGA availability and transfer quotas can still change independently of the app.
