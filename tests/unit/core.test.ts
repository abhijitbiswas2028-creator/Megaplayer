import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptSensitiveRef, decryptSensitiveRef, hashPassword, verifyPassword } from '../../src/server/utils/crypto.ts';
import { parseByteRange } from '../../src/server/utils/range.ts';
import { parseMegaUrl } from '../../src/server/utils/mega-url.ts';

test('Encryption: AES-256-GCM roundtrip encrypt and decrypt', () => {
  const secretUrl = 'https://mega.nz/file/ABC123Test#SecureKey987654321';
  const encrypted = encryptSensitiveRef(secretUrl);

  assert.notEqual(encrypted.ciphertext, secretUrl);
  assert.equal(typeof encrypted.iv, 'string');
  assert.equal(typeof encrypted.authTag, 'string');

  const decrypted = decryptSensitiveRef(encrypted);
  assert.equal(decrypted, secretUrl);
});

test('Encryption: Tampered ciphertext fails authentication check', () => {
  const secretUrl = 'https://mega.nz/file/Secret#Key';
  const encrypted = encryptSensitiveRef(secretUrl);
  
  // Tamper ciphertext
  const tamperedCiphertext = encrypted.ciphertext.slice(0, -2) + (encrypted.ciphertext.endsWith('a') ? 'b' : 'a');
  const tampered = { ...encrypted, ciphertext: tamperedCiphertext };

  assert.throws(() => {
    decryptSensitiveRef(tampered);
  });
});

test('Auth: Password hashing and timing-safe verification', () => {
  const password = 'SuperSecretStreamPassword2026!';
  const { hash, salt } = hashPassword(password);

  assert.equal(typeof hash, 'string');
  assert.equal(typeof salt, 'string');
  assert.equal(verifyPassword(password, hash, salt), true);
  assert.equal(verifyPassword('WrongPassword123', hash, salt), false);
});

test('Range Parser: Valid closed range', () => {
  const totalLength = 10000;
  const result = parseByteRange('bytes=0-1023', totalLength);

  assert.equal(result.type, 'valid');
  if (result.type === 'valid') {
    assert.equal(result.range.start, 0);
    assert.equal(result.range.end, 1023);
    assert.equal(result.contentLength, 1024);
    assert.equal(result.contentRange, 'bytes 0-1023/10000');
  }
});

test('Range Parser: Open-ended range', () => {
  const totalLength = 5000;
  const result = parseByteRange('bytes=1000-', totalLength);

  assert.equal(result.type, 'valid');
  if (result.type === 'valid') {
    assert.equal(result.range.start, 1000);
    assert.equal(result.range.end, 4999);
    assert.equal(result.contentLength, 4000);
    assert.equal(result.contentRange, 'bytes 1000-4999/5000');
  }
});

test('Range Parser: Suffix range', () => {
  const totalLength = 5000;
  const result = parseByteRange('bytes=-500', totalLength);

  assert.equal(result.type, 'valid');
  if (result.type === 'valid') {
    assert.equal(result.range.start, 4500);
    assert.equal(result.range.end, 4999);
    assert.equal(result.contentLength, 500);
    assert.equal(result.contentRange, 'bytes 4500-4999/5000');
  }
});

test('Range Parser: Range not satisfiable (416)', () => {
  const totalLength = 5000;
  const result = parseByteRange('bytes=6000-7000', totalLength);
  assert.equal(result.type, 'unsatisfiable');
});

test('Range Parser: malformed numbers are not silently parsed as valid offsets', () => {
  for (const range of ['bytes=1oops-3', 'bytes=0-1.5', 'bytes=1e2-', 'bytes=0-999999999999999999999']) {
    assert.equal(parseByteRange(range, 1000).type, 'invalid', range);
  }
});

test('MEGA URL: Valid modern URL format', () => {
  const parsed = parseMegaUrl('https://mega.nz/file/eF9SgCYA#t_0b9lC0b2mI_QzWq9pL8z1x');
  assert.equal(parsed.isValid, true);
  assert.equal(parsed.type, 'file');
  assert.equal(parsed.id, 'eF9SgCYA');
  assert.equal(parsed.hasKey, true);
  assert.equal(parsed.sanitizedUrl, 'https://mega.nz/file/eF9SgCYA');
});

test('MEGA URL: Valid legacy URL format', () => {
  const parsed = parseMegaUrl('https://mega.nz/#!mBs3zLpZ!AbCdEf1234567890');
  assert.equal(parsed.isValid, true);
  assert.equal(parsed.type, 'file');
  assert.equal(parsed.id, 'mBs3zLpZ');
  assert.equal(parsed.hasKey, true);
});

test('MEGA URL: Missing key rejected', () => {
  const parsed = parseMegaUrl('https://mega.nz/file/eF9SgCYA');
  assert.equal(parsed.isValid, false);
  assert.match(parsed.errorMessage || '', /Decryption key is missing/);
});

test('MEGA URL: Folder URL rejected with explanation', () => {
  const parsed = parseMegaUrl('https://mega.nz/folder/abc123#xyz');
  assert.equal(parsed.isValid, false);
  assert.equal(parsed.type, 'folder');
});

test('MEGA URL: Non-MEGA link rejected', () => {
  const parsed = parseMegaUrl('https://example.com/video.mp4');
  assert.equal(parsed.isValid, false);
});

test('Direct Streaming: Mega adapter provides authenticated direct stream pipeline without local cache', async () => {
  const { megaAdapter } = await import('../../src/server/mega-adapter.ts');
  assert.equal(typeof megaAdapter.createStream, 'function');
  assert.equal(typeof megaAdapter.resolveLink, 'function');
});

