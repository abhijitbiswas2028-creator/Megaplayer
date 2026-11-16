import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMegaUrl } from '../../src/server/utils/mega-url.ts';

const canonical = 'https://mega.nz/file/example#abcdefghi';
test('normalizes share, embed, iframe and legacy links for playback', () => {
  for (const input of [canonical, '  ' + canonical + '  ', canonical.replace('/file/', '/embed/'), `<iframe src="${canonical.replace('/file/', '/embed/')}"></iframe>`, 'https://mega.nz/#!example!abcdefghi']) {
    assert.equal(parseMegaUrl(input).fileUrl, canonical);
    assert.equal(parseMegaUrl(input).isValid, true);
  }
});
test('accepts separately shared keys without replacing an embedded key', () => {
  for (const input of ['https://mega.nz/file/example', 'https://mega.nz/file/example#', 'https://mega.nz/#!example', 'https://mega.nz/#!example!']) {
    assert.equal(parseMegaUrl(input, ' #abcdefghi ').fileUrl, canonical);
  }
  assert.equal(parseMegaUrl(canonical, 'differentkey').fileUrl, canonical);
  assert.equal(parseMegaUrl('https://mega.nz/file/example', 'invalid key').isValid, false);
});
test('rejects missing keys, folders and unrelated domains', () => {
  for (const input of ['', 'https://mega.nz/file/example', 'https://mega.nz/folder/example#abcdefghi', 'https://mega.nz.evil.test/file/example#abcdefghi']) {
    assert.equal(parseMegaUrl(input).isValid, false);
  }
});
