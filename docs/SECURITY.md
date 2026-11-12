# Security Architecture & Hardening — MEGA STREAM X

## 1. Zero-Exposure MEGA Reference Model

MEGA links contain the file ID and the AES decryption key in the URL hash fragment:
`https://mega.nz/file/{fileId}#{decryptionKey}`

If this link is ever exposed to a browser client or an unauthorized user, the video can be copied, re-shared, or decrypted outside of the platform's access control rules.

To eliminate this vulnerability:
1. **Encrypted at Rest**:
   Whenever the Owner inputs a MEGA share link, it is immediately parsed and encrypted using **AES-256-GCM** with a 96-bit random IV and a 128-bit authentication tag (`src/server/utils/crypto.ts`).
2. **Never Transmitted to Viewers**:
   Only sanitized internal IDs (`vid_...`) are returned to the client. The frontend has zero knowledge of the cloud storage provider or the underlying URL.
3. **Decryption in Memory**:
   During stream requests (`/api/v1/videos/:id/stream`), the server retrieves the encrypted record from SQLite, verifies the authentication tag, decrypts the ciphertext in RAM, and pipes the decrypted plaintext byte chunks directly to the response socket.
4. **Log Sanitization**:
   The `parseMegaUrl` utility strips the `#hash` fragment before generating displayable sanitized URLs.

## 2. Authentication & Session Security

- **No Public Registration**: Registration endpoints only succeed when provided with an unexpired, active invitation token issued by the Owner.
- **Argon2id / Scrypt Hashing**: Passwords are saved with 16-byte random salts and high work factor hashing.
- **Timing-Safe Comparison**: `crypto.timingSafeEqual` prevents side-channel timing attacks during password validation.
- **Session Tokens**: 256-bit cryptographically secure pseudorandom tokens stored in an indexable session table.
- **HttpOnly Cookies**: Session tokens are passed via `HttpOnly`, `SameSite=Lax` cookies, neutralizing JavaScript XSS extraction.
- **Instant Revocation**: When the Owner deactivates an account in the Friends Management console, all active sessions for that user ID are purged immediately.

## 3. Byte-Range Streaming Security

- **Range Bounds Checks**: Out-of-bounds requests return `HTTP 416 Range Not Satisfiable` instead of reading invalid memory buffers.
- **Upstream Abort**: Client disconnects (`req.on('close')`) trigger `.destroy()` on the upstream stream to prevent slow-read Denial of Service.
