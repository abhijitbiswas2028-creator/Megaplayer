import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { decryptMegaPreview } from '../../src/server/mega-preview.ts';

function fixture() {
  const handle = Buffer.from('12345678');
  const fileKey = Buffer.from('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex');
  const plain = Buffer.alloc(32, 0x61);
  const cipher = createCipheriv('aes-128-cbc', Buffer.alloc(16, 0x10), Buffer.alloc(16));
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const header = Buffer.alloc(12);
  handle.copy(header);
  header.writeUInt32LE(encrypted.length, 8);
  return { handle, fileKey, plain, response: Buffer.concat([header, encrypted]) };
}

test('MEGA preview decrypts the requested file attribute with its own key', () => {
  const { handle, fileKey, plain, response } = fixture();
  assert.deepEqual(decryptMegaPreview(response, handle, fileKey), plain);
});

test('MEGA preview rejects a different file handle, truncated data, and invalid lengths', () => {
  const { handle, fileKey, response } = fixture();
  assert.throws(() => decryptMegaPreview(response, Buffer.from('87654321'), fileKey));
  assert.throws(() => decryptMegaPreview(response.subarray(0, 20), handle, fileKey));
  assert.throws(() => decryptMegaPreview(response, handle, Buffer.alloc(16)));
  const wrongLength = Buffer.from(response);
  wrongLength.writeUInt32LE(16, 8);
  assert.throws(() => decryptMegaPreview(wrongLength, handle, fileKey));
});
