import { collection } from './mongo/store.ts';
import { verifyPassword } from './utils/crypto.ts';

const PUBLIC_EXAMPLE_KEYS = new Set([
  'mega_stream_x_master_aes256_gcm_secret_key_change_in_production!',
  'mega-stream-x-master-secret-key-32bytes!!',
]);

/** Loud, non-fatal warnings for configuration that is unsafe on a public deployment. */
export async function warnIfInsecureConfiguration() {
  const key = process.env.MEGA_ENCRYPTION_KEY;
  if (!key || PUBLIC_EXAMPLE_KEYS.has(key)) {
    console.warn('[security] MEGA_ENCRYPTION_KEY is missing or uses the public example value. Set a private random secret.');
  }

  const seeded = [
    { email: 'owner@megastreamx.com', password: 'Owner12345!' },
    { email: 'friend@megastreamx.com', password: 'Friend12345!' },
  ];
  for (const { email, password } of seeded) {
    const user = await collection('users').findOne({ email, status: 'ACTIVE' });
    if (user && verifyPassword(password, user.password_hash, user.salt)) {
      console.warn(`[security] ${email} still uses the publicly documented default password. Change it before sharing the app.`);
    }
  }

  const plaintext = await collection('mega_sources').countDocuments({ $or: [{ iv: 'direct' }, { encrypted_ref: /^https?:/ }] });
  if (plaintext > 0) {
    console.warn(`[security] ${plaintext} MEGA source(s) are stored unencrypted. Run "npm run sources:encrypt" to encrypt them at rest.`);
  }
}

/** Removes expired sessions so the sessions collection does not grow forever. */
export function scheduleSessionCleanup(intervalMs = 60 * 60 * 1000) {
  const run = () =>
    void collection('sessions')
      .deleteMany({ expires_at: { $lte: new Date().toISOString() } })
      .catch(() => console.warn('[sessions] Expired session cleanup failed'));
  run();
  setInterval(run, intervalMs).unref();
}
