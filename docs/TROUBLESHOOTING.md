# Troubleshooting Guide — MEGA STREAM X

### 1. MEGA Link Returns "Decryption key missing"
- **Cause**: The submitted link lacks the hash fragment (e.g. `https://mega.nz/file/ABCDEF` instead of `https://mega.nz/file/ABCDEF#xyz123`).
- **Fix**: Open MEGA in your browser, click "Export link", make sure "Include decryption key" is checked, and copy the full URL.

### 2. HTTP 509 Bandwidth Limit Reached
- **Cause**: MEGA free accounts have a periodic transfer limit (usually 5GB per IP per 6 hours).
- **Fix**: The platform handles this error and notifies the player. In production, use an authorized MEGA Pro account or let bandwidth reset.

### 3. Video Seeking Returns HTTP 416 (Range Not Satisfiable)
- **Cause**: The client requested a byte range beyond the file length.
- **Fix**: The built-in range parser validates bounds against the total file size and clamps the end byte automatically. Ensure metadata was properly retrieved.

### 4. Player Codec Compatibility
- **Format**: The platform is optimized for MP4 (H.264 video + AAC audio).
- **MKV / QuickTime**: Modern browsers may lack native hardware decoders for high-profile HEVC or AC3 audio inside MKV containers. Re-encode source videos with FFmpeg:
  ```bash
  ffmpeg -i input.mkv -c:v libx264 -crf 22 -preset fast -c:a aac -b:a 192k output.mp4
  ```
