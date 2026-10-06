import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { requestSchema, requireTenureEligibility } from '../dist/teacher-portal/contracts.js';
import { validatePhoto, sanitizePhoto, LocalPrivatePhotoStore } from '../dist/teacher-portal/photos.js';
import sharp from 'sharp';
import { withSyntheticGpsExif } from './fixtures/synthetic-photo.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

test('typed proposals reject arbitrary master/status/account writes and normalize NFC', () => {
  assert.equal(requestSchema.safeParse({ kind: 'CONTACT', payload: { districtId: 'untrusted' } }).success, false);
  assert.equal(requestSchema.safeParse({ kind: 'TRAINING', payload: { status: 'COMPLETED', verified: true } }).success, false);
  assert.equal(requestSchema.safeParse({ kind: 'WORKPLACE', payload: { institutionName: 'a\u0000b' } }).success, false);
  const value = requestSchema.parse({ kind: 'WORKPLACE', payload: { institutionName: '  e\u0301cole  ' } });
  assert.equal(value.payload.institutionName, 'école');
});
test('tenure requires verified completed training for trainee and never permits CONTRACT', () => {
  for (const status of [null, 'NOT_STARTED', 'IN_PROGRESS', 'INCOMPLETE', 'COMPLETED']) {
    assert.throws(() => requireTenureEligibility({ professionalStatus: 'TRAINEE', trainingStatus: status, trainingVerifiedAt: null }, 'TENURE_CONFIRMATION'));
  }
  assert.throws(() => requireTenureEligibility({ professionalStatus: 'CONTRACT', trainingStatus: 'COMPLETED', trainingVerifiedAt: new Date() }, 'TENURE_CONFIRMATION'));
  assert.doesNotThrow(() => requireTenureEligibility({ professionalStatus: 'TRAINEE', trainingStatus: 'COMPLETED', trainingVerifiedAt: new Date() }, 'TENURE_CONFIRMATION'));
  assert.doesNotThrow(() => requireTenureEligibility({ professionalStatus: 'CONTRACT', trainingStatus: null, trainingVerifiedAt: null }, 'GUIDANCE'));
});
test('photo validation rejects SVG, forged type, oversized bytes and pixel bombs', () => {
  assert.throws(() => validatePhoto(Buffer.from('<svg/>'), 'image/svg+xml'));
  assert.throws(() => validatePhoto(Buffer.from('<script>alert(1)</script>'), 'image/jpeg'));
  assert.throws(() => validatePhoto(Buffer.alloc(2097153), 'image/png'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0ncAAAAASUVORK5CYII=', 'base64');
  assert.doesNotThrow(() => validatePhoto(png, 'image/png'));
  png.writeUInt32BE(10000, 16); assert.throws(() => validatePhoto(png, 'image/png'));
});
test('private filesystem adapter fails closed for missing/root-relative/user paths and uses immutable generated keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'inspector-private-store-test-')); const store = new LocalPrivatePhotoStore(directory); const key = randomUUID();
  try {
    await assert.rejects(() => new LocalPrivatePhotoStore('').put(key, Buffer.from('x')));
    await assert.rejects(() => new LocalPrivatePhotoStore('.cache').put(key, Buffer.from('x')));
    await assert.rejects(() => store.put('../untrusted', Buffer.from('x')));
    await store.put(key, Buffer.from('synthetic-image')); assert.equal((await store.get(key)).toString(), 'synthetic-image');
    await assert.rejects(() => store.put(key, Buffer.from('replacement')));
    await store.discardUncommitted(key); await assert.rejects(() => store.get(key));
  } finally { await rm(directory, { recursive: true }); }
});

test('PHOTO-01 real PNG and JPEG decode/re-encode with matching output type', async () => {
  for (const format of ['png', 'jpeg']) {
    const bytes = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#ffffff' } })[format]().toBuffer();
    const sanitized = await sanitizePhoto(bytes, `image/${format}`);
    const metadata = await sharp(sanitized).metadata();
    assert.equal(metadata.format, format); assert.equal(metadata.width, 16); assert.equal(metadata.height, 12);
    assert.equal(metadata.exif, undefined); assert.equal(metadata.xmp, undefined);
  }
});
test('PHOTO-02 fake complete PNG/JPEG headers without decodable pixels are rejected', async () => {
  const fake = Buffer.alloc(45); Buffer.from([137,80,78,71,13,10,26,10]).copy(fake); fake.writeUInt32BE(13, 8); fake.write('IHDR', 12); fake.writeUInt32BE(1, 16); fake.writeUInt32BE(1, 20); fake.write('IEND', 37);
  assert.doesNotThrow(() => validatePhoto(fake, 'image/png'));
  await assert.rejects(() => sanitizePhoto(fake, 'image/png'));
  await assert.rejects(() => sanitizePhoto(Buffer.from([255,216,255,192,0,8,8,0,1,0,1,3,255,217]), 'image/jpeg'));
});
test('PHOTO-03 truncated pixels, malformed metadata and unsupported formats fail closed', async () => {
  const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#ff0000' } }).jpeg().toBuffer();
  await assert.rejects(() => sanitizePhoto(Buffer.concat([jpeg.subarray(0, jpeg.length - 40), Buffer.from([255,217])]), 'image/jpeg'));
  // APP1 declares bytes beyond the file: never treat malformed metadata as a valid photograph.
  await assert.rejects(() => sanitizePhoto(Buffer.concat([jpeg.subarray(0,2), Buffer.from([255,225,255,255,69,120,105,102,0,0]), jpeg.subarray(2)]), 'image/jpeg'));
  const webp = await sharp(jpeg).webp().toBuffer(); await assert.rejects(() => sanitizePhoto(webp, 'image/webp'));
});
test('PHOTO-04 decoded dimension/pixel and input byte limits are enforced', async () => {
  const bomb = await sharp({ create: { width: 4097, height: 4097, channels: 3, background: '#ffffff' } }).png().toBuffer();
  await assert.rejects(() => sanitizePhoto(bomb, 'image/png'));
  await assert.rejects(() => sanitizePhoto(Buffer.alloc(2097153), 'image/png'));
});
test('PHOTO-05 synthetic EXIF/GPS and orientation are removed from sanitized output', async () => {
  const jpeg = withSyntheticGpsExif(await sharp({ create: { width: 16, height: 12, channels: 3, background: '#ffffff' } }).jpeg().toBuffer());
  assert.equal((await sharp(jpeg).metadata()).orientation, 6);
  assert.ok((await sharp(jpeg).metadata()).exif);
  const sanitized = await sanitizePhoto(jpeg, 'image/jpeg'); const metadata = await sharp(sanitized).metadata();
  assert.equal(metadata.exif, undefined); assert.equal(metadata.orientation, undefined); assert.equal(metadata.xmp, undefined);
  assert.equal(sanitized.includes(Buffer.from('Exif\0\0')), false); assert.deepEqual([metadata.width, metadata.height], [12,16]);
});
