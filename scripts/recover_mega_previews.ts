import 'dotenv/config';
import path from 'node:path';
import { db } from '../src/server/db.ts';
import { decryptSensitiveRef } from '../src/server/utils/crypto.ts';
import { recoverMegaPreview } from '../src/server/mega-preview.ts';

const ids = process.argv.slice(2);
if (!ids.length) throw new Error('Specify the video IDs whose original MEGA previews should be restored');
for (const id of ids) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid video ID');
  const video = db.prepare(`SELECT ms.encrypted_ref,ms.iv,ms.auth_tag FROM videos v
    JOIN mega_sources ms ON v.mega_source_id=ms.id WHERE v.id=?`).get(id) as any;
  try {
    if (!video) throw new Error('Missing source');
    const source = video.iv === 'direct' || /^https?:/.test(video.encrypted_ref) ? video.encrypted_ref
      : decryptSensitiveRef({ciphertext:video.encrypted_ref,iv:video.iv,authTag:video.auth_tag});
    const type = await recoverMegaPreview(source, path.resolve('public/thumbnails', `${id}.jpg`));
    const now = new Date().toISOString();
    db.prepare('UPDATE videos SET thumbnail_url=?,updated_at=? WHERE id=?')
      .run(`/thumbnails/${id}.jpg?v=${Date.now()}`, now, id);
    console.log(`${id}: restored original MEGA ${type}`);
  } catch {
    console.warn(`${id}: no usable stored preview; existing thumbnail preserved`);
    process.exitCode = 1;
  }
}
