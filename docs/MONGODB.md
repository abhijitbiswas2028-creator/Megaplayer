# MongoDB deployment and migration

Set `MONGODB_URI` and `MONGODB_DATABASE=megaplayer` privately on the Railway backend.
Use an Atlas database user with read/write permission on this database, and allow
Railway's outbound address in Atlas Network Access. Use the Atlas-provided URI;
URL-encode reserved characters in its password. Do not put the URI in Vercel or Git.
Keep `MEGA_ENCRYPTION_KEY` stable: newly added MEGA references are encrypted with it.

The Node server uses one connection pool. With no URI, SQLite remains active. With
a URI, startup connects to MongoDB, creates indexes, and migrates the existing
`DATABASE_PATH` (default `/app/data/mega_stream_x.db`) before listening. Keep the
existing Railway volume mounted for this first deployment. Use one backend replica
while migrating so no previous SQLite process continues receiving writes during
cutover. Avoid editing the library during this deployment.

Migration copies users, sessions, invitations, sources, videos, category mappings,
playlists, progress, favorites, audit logs, and metrics without changing IDs. It
checks imported IDs and writes a completion marker. Interrupted migrations resume
using insert-only upserts. Later starts never overwrite MongoDB with stale SQLite.
The SQLite source is retained; after cutover it is a pre-migration backup, not a
current replica. Do not remove MONGODB_URI as a rollback after new MongoDB writes
without first exporting those writes.

Thumbnail bytes are stored in a MongoDB collection, limited to 8 MB per file.
SHA-256 URLs identify immutable content. Browser/CDN cache headers, conditional
ETag responses, and a bounded 32 MB in-process image cache reduce repeated reads.
Original bundled previews recover generated thumbnails lost from ephemeral disk.
Newly generated previews are saved in MongoDB before updating video records.
Videos themselves continue streaming from MEGA using authenticated byte ranges.

## Verification

- `npm run lint`
- `npm run build`
- `MONGODB_URI= DATABASE_PATH=:memory: npm test` for existing SQLite behavior
- `npm run test:mongo` for an isolated real MongoDB server, API lifecycle, migration,
  thumbnails, cache behavior, playback ranges, permissions and invitation races.
  First run downloads a test MongoDB binary under `/tmp/megaplayer-mongodb-binaries`.
- `/api/health` must return `database: "mongodb"` after deployment.
- Verify all 72 production videos, categories, search, previews and sample streams.

`npm run thumbnails:repair` supports both backends. The older SQLite import and
repair scripts are legacy local tools; they must not be used to update a MongoDB
production catalog. Use the owner API for catalog updates.
