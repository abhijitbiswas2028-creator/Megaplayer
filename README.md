# MEGA STREAM X — Private Cloud Video Streaming Platform

**MEGA STREAM X** is a private, invitation-only personal video streaming platform. It connects with MEGA cloud storage to retrieve, decrypt, and progressively stream videos via authenticated HTTP byte-range (RFC 7233) requests directly to authorized viewers with zero exposure of raw cloud links or keys.

---

## 🌟 Key Features

1. **Authenticated Byte-Range Cloud Streaming (RFC 7233)**:
   - Progressive streaming supporting `HTTP 206 Partial Content` and `HTTP 416 Range Not Satisfiable`.
   - Handles seeking (`bytes=start-end`), pause, and mid-file scrubbing smoothly.
   - Upstream client-disconnect cancellation: aborts upstream MEGA data streams when user closes or pauses player, preventing leaked memory or wasted bandwidth.
   - Decrypted in-memory on the fly; no full downloads stored on disk.

2. **Zero-Leak MEGA Security Architecture**:
   - Complete MEGA references and decryption keys are encrypted at rest using **AES-256-GCM** with an environment-managed master key.
   - Viewers access videos solely through internal random UUIDs (`/api/v1/videos/:id/stream`).
   - Raw MEGA links, keys, or hashes are never returned to frontend clients or printed in logs.

3. **Role-Based Access Control & Invitation System**:
   - No open public registration.
   - **OWNER**: Full administrative dashboard, MEGA link validation, catalog editor, friend invitation issuer, user account deactivation, and telemetry monitoring.
   - **FRIEND**: Authorized viewing, custom playlists, favorites, and per-user watch progress tracking.
   - Single-use or bounded cryptographically random invitation tokens with expiration.

4. **Custom Cinema Video Player**:
   - Video.js & HTML5 high-performance streaming engine.
   - Keyboard navigation: `Space` (Play/Pause), `Left/Right` (10s seek), `Up/Down` (Volume), `F` (Fullscreen), `M` (Mute), `C` (Subtitles), `Esc` (Exit/Close).
   - Speed selector (`0.5x`, `0.75x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`).
   - Picture-in-Picture (PiP).
   - Auto-hiding HUD and buffer indicator.
   - Automatic resume playback prompt.

5. **Personalization & Watch State**:
   - Debounced progress sync every 5 seconds.
   - Dedicated *Continue Watching* view with progress percentages.
   - Complete chronological *Watch History*.
   - Personal *Favorites* and custom *Playlists*.

---

## 🚀 Quick Start

### 1. Development Mode

```bash
# Install dependencies
npm install

# Run database tests
npm test

# Start full-stack development server (Express API + Vite SPA)
npm run dev
```

Visit `http://localhost:3000` in your browser.

### 2. Default Seeded Test Credentials

- **Owner Account**:
  - Email: `owner@megastreamx.com`
  - Password: `Owner12345!`
- **Friend Account**:
  - Email: `friend@megastreamx.com`
  - Password: `Friend12345!`
- **Seeded VIP Invitation Token**:
  - Code: `MSX-VIP-INVITE-2026`

*Note: You can also use the one-click "Demo: Owner / Friend" toggle button in the top navigation bar to switch personas instantly during testing.*

---

## 🔒 Security Architecture

Detailed security specifications can be found in [`docs/SECURITY.md`](docs/SECURITY.md).

- **Encryption at rest**: AES-256-GCM with authenticated tag validation (`src/server/utils/crypto.ts`).
- **Password security**: Scrypt with per-user cryptographic salts and constant-time equality checks.
- **Session management**: Secure `HttpOnly`, `SameSite=Lax` cookies.
- **Audit logs**: Chronological tracking of logins, video additions, status updates, and invitations.

---

## 🐳 Docker & VPS Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for full deployment instructions with Docker Compose and Nginx reverse proxy.

```bash
docker compose up -d --build
```

### Video thumbnail repair

Install `ffmpeg` and `ffprobe` on the server. On startup, the server checks local thumbnails and repairs missing, dark, or flat-color images one video at a time. New videos use the same repair queue. The extractor probes the original duration and compares frames near 10%, 50%, and 90% of the timeline, with additional timestamps if necessary. MEGA video data is streamed by byte range and is not saved to a video cache.

Run `npm run thumbnails:repair` to repair the library immediately, or `npm run thumbnails:repair -- VIDEO_ID` for one video. Add `--force` to replace an otherwise acceptable preview. A successful repair versions the thumbnail URL and updates the actual duration. Failed extraction preserves the current preview and is reported; it never generates a synthetic poster. The command exits with a nonzero status if any repair fails.
