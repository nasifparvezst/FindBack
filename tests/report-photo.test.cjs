const test = require('node:test');
const assert = require('node:assert/strict');
const { reportPhotoBlob } = require('../.test-build/report-photo.js');

test('security photo: compressed images decode to exact bytes without a network/data fetch', async () => {
  const bytes = Buffer.from([0, 255, 128, 42]);
  for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
    const blob = reportPhotoBlob(`data:${mime};base64,${bytes.toString('base64')}`);
    assert.equal(blob.type, mime);
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()), bytes);
  }
});
test('security photo: disallowed formats, malformed data and oversized payloads are rejected', () => {
  for (const value of ['https://example.com/photo.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,', 'data:image/png;base64,a', 'data:image/png;base64,%%%']) assert.throws(() => reportPhotoBlob(value));
  const oversized = 'data:image/png;base64,' + Buffer.alloc(2_097_153).toString('base64');
  assert.throws(() => reportPhotoBlob(oversized), /under 2 MB/);
});
