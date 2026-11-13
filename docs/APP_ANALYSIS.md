# Megaplayer runtime analysis — 2026-11-13

The development app is running on port 3000. Local health check returned HTTP 200 with `status: ok`.

Preview: https://silver-space-telegram-g4wjx5xgqjqqfwxv5-3000.app.github.dev

## Confirmed working

- Chromium loaded the application and its 72-video catalog.
- Development auto-login created an owner session. Anonymous catalog access returned HTTP 401.
- All 72 catalog thumbnail URLs returned HTTP 200, an image content type, and nonempty bodies. This verifies image delivery, not the visual quality or provenance of every thumbnail.
- Desktop layout at 1440 × 1000 had no horizontal page overflow.
- No uncaught browser JavaScript exceptions or console errors were recorded during the tested flow.

## Findings

### 1. The first search after loading the application is ignored

**Confirmed in Chromium twice.** Searching for `zz_no_matching_video_audit_zz` left 72 cards visible and sent no search request. Changing the query a second time sent the request and correctly showed zero cards and the empty state.

Cause: `src/App.tsx:147–155` skips the first filter-effect invocation when `isInitialLoadRef.current` is true. The initial invocation runs before authentication and does not clear the guard. Because `currentUser` is not an effect dependency, authentication does not consume that guard; the first real search does. The same guard also appears to affect the first category or sort change, though these interactions were not separately exercised.

Suggested fix: tie the initial-load guard to completion of authenticated catalog loading, or restructure the effect so the first user filter change always fetches results. Add a browser regression for the first search after a fresh page load.

### 2. Thumbnail quality still needs attention

The loaded grid still includes purple-pattern, countdown, blue silhouette, and warning-screen previews. Some may be actual introductory frames, but they are poor scene previews. The preceding repair fixed three detected images; it did not resolve every visually poor thumbnail.

`src/server/thumbnail.ts:11–31` evaluates brightness, variation, and color distribution. These checks can accept colorful patterns or text screens. A successful HTTP image response does not establish that a thumbnail represents a useful scene.

The startup repair again reported `vid_mega_ur0h0b6a` unavailable. Its source remains unresolved.

Suggested next step: identify the remaining poor previews, compare later original-video frames, and improve rejection of pattern/slate images without rejecting normal blue-lit scenes.

### 3. Opening details can start an unnecessary video download

**Source-review finding; not browser-verified in this run.** `src/components/video/VideoDetailModal.tsx:34–48` inserts a `rel=preload`, `as=fetch` link for the full stream URL. Despite its comment, this requests a body rather than just headers. There is no cleanup of the inserted link on close. This can consume bandwidth before Play and leave unnecessary preload links behind.

Suggested fix: remove the stream preload, or use an explicitly bounded/cancellable metadata operation where needed.

### 4. The MEGA status indicator is hard-coded

**Source-review finding.** `src/components/layout/Sidebar.tsx:127–140` always renders ONLINE; it does not reflect upstream availability. The interface showed ONLINE while the thumbnail worker reported an unavailable source. This label is not evidence that every video is playable.

## Scope and retained artifacts

Browser verification stopped at the first confirmed broken interaction (search), following the verification workflow. Mobile layout, sorting, category navigation, and sampled playback/seeking were not completed in this run. Previous test/build results are not substitutes for those checks.

Temporary browser tools were installed under `/tmp/megaplayer-browser-check`; project dependencies were unchanged. Evidence is in `/tmp/megaplayer-analysis/report.json`, `search-diagnosis.json`, and the screenshots in that directory. The verification sessions were logged out. Application source was not changed during this analysis; only this report was added. The development server remains running as requested.
