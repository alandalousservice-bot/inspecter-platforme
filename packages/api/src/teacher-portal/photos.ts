import express, { type Express, type RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { z } from 'zod';
import sharp from 'sharp';
import { ApiError } from '../http/api-error.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';
import { requireTeacher, requireTeacherCsrf } from './auth.js';
import { appendPortalAudit } from './audit.js';
import { parse } from './contracts.js';

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 4096 * 4096;
export function validatePhoto(bytes: Buffer, type: string): void {
  const invalid = () => { throw new ApiError(400, 'INVALID_PHOTO', 'اختر صورة PNG أو JPEG لا تتجاوز 2 ميغابايت و4096 بكسل.'); };
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) invalid();
  let width = 0; let height = 0;
  if (type === 'image/png' && bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR') {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
    if (bytes.length < 45 || bytes.toString('ascii', bytes.length - 8, bytes.length - 4) !== 'IEND') invalid();
  } else if (type === 'image/jpeg' && bytes.length > 4 && bytes.readUInt16BE(0) === 0xffd8 && bytes.readUInt16BE(bytes.length - 2) === 0xffd9) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) invalid();
      const marker = bytes[offset + 1]!; offset += 2;
      if (marker === 0xd9 || marker === 0xda) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) invalid();
      if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) { height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break; }
      offset += length;
    }
  } else invalid();
  if (width < 1 || height < 1 || width > 4096 || height > 4096) invalid();
}

export async function sanitizePhoto(bytes: Buffer, type: string): Promise<Buffer> {
  validatePhoto(bytes, type);
  try {
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: MAX_PHOTO_PIXELS, sequentialRead: true });
    const metadata = await image.metadata();
    if ((type === 'image/png' ? metadata.format !== 'png' : metadata.format !== 'jpeg')
      || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096
      || metadata.width * metadata.height > MAX_PHOTO_PIXELS || (metadata.pages ?? 1) !== 1) throw new Error('Invalid image');
    // Full decode happens at toBuffer; no keepMetadata/withMetadata: EXIF/GPS/XMP are stripped.
    const output = image.rotate().timeout({ seconds: 5 });
    const sanitized = await (type === 'image/png' ? output.png({ compressionLevel: 9 }) : output.jpeg({ quality: 85 })).toBuffer({ resolveWithObject: true });
    if (sanitized.info.width > 4096 || sanitized.info.height > 4096 || sanitized.data.length > MAX_PHOTO_BYTES) throw new Error('Image limit');
    return sanitized.data;
  } catch {
    throw new ApiError(400, 'INVALID_PHOTO', 'تعذر قراءة الصورة بأمان. اختر صورة PNG أو JPEG سليمة ضمن الحدود.');
  }
}

export interface PrivatePhotoStore { put(key: string, bytes: Buffer): Promise<void>; get(key: string): Promise<Buffer>; discardUncommitted(key: string): Promise<void> }
export class LocalPrivatePhotoStore implements PrivatePhotoStore {
  constructor(private readonly directory: string | undefined = process.env.PRIVATE_ASSET_DIR) {}
  private async path(key: string): Promise<string> {
    if (!this.directory || !isAbsolute(this.directory) || !z.string().uuid().safeParse(key).success) throw new ApiError(503, 'PHOTO_STORAGE_UNAVAILABLE', 'رفع الصور غير متاح مؤقتًا.');
    const directory = resolve(this.directory); const rel = relative(resolve(process.cwd()), directory);
    if (!rel.startsWith('..') && !isAbsolute(rel)) throw new ApiError(503, 'PHOTO_STORAGE_UNAVAILABLE', 'رفع الصور غير متاح مؤقتًا.');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if ((await lstat(directory)).isSymbolicLink() || resolve(await realpath(directory)) !== directory) throw new ApiError(503, 'PHOTO_STORAGE_UNAVAILABLE', 'رفع الصور غير متاح مؤقتًا.');
    return join(directory, key);
  }
  async put(key: string, bytes: Buffer) { await writeFile(await this.path(key), bytes, { flag: 'wx', mode: 0o600 }); }
  async get(key: string) { const path = await this.path(key); if ((await lstat(path)).isSymbolicLink()) throw new ApiError(404, 'NOT_FOUND', 'الصورة غير متاحة.'); return readFile(path); }
  async discardUncommitted(key: string) { await unlink(await this.path(key)); }
}

export function registerTeacherPhotos(app: Express, database: PrismaClient, inspector: RequestHandler, store: PrivatePhotoStore = new LocalPrivatePhotoStore()) {
  app.post('/api/v1/teacher/photo', requireTeacher(database), express.raw({ type: ['image/png', 'image/jpeg'], limit: MAX_PHOTO_BYTES }), async (request, response) => {
    requireTeacherCsrf(request);
    if (!Buffer.isBuffer(request.body)) throw new ApiError(400, 'INVALID_PHOTO', 'اختر صورة PNG أو JPEG.');
    const type = request.headers['content-type']?.split(';')[0] ?? '';
    const sanitized = await sanitizePhoto(request.body, type); const key = randomUUID();
    await store.put(key, sanitized);
    let committed = false;
    try {
      const photo = await database.$transaction(async (tx) => {
        const teacherId = response.locals.teacherId as string;
        await tx.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${teacherId}::uuid FOR UPDATE`;
        const teacher = await tx.teacher.findUnique({ where: { id: teacherId } });
        if (!teacher || teacher.recordStatus !== 'ACTIVE' || teacher.archivedAt) throw new ApiError(401, 'UNAUTHENTICATED', 'يلزم تسجيل الدخول.');
        const prior = await tx.teacherPhoto.findFirst({ where: { teacherId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { createdAt: true } });
        // PostgreSQL now() is transaction-start time; a waiting transaction can predate the prior replacement.
        // Monotonic milliseconds prevent UUID tie-breaking from selecting an older uploaded asset.
        const createdAt = new Date(Math.max(Date.now(), (prior?.createdAt.getTime() ?? 0) + 1));
        const result = await tx.teacherPhoto.create({ data: { teacherId, storageKey: key, contentType: type, byteLength: sanitized.length, sanitizationVersion: 1, createdAt } });
        await appendPortalAudit(tx, response, teacher, 'TEACHER_PHOTO_REPLACED', result.id, {}, teacherId);
        return result;
      });
      committed = true;
      response.status(201).json({ data: { photoId: photo.id } });
    } finally { if (!committed) await store.discardUncommitted(key); }
  });
  const send = async (teacherId: string, response: express.Response) => {
    const photo = await database.teacherPhoto.findFirst({ where: { teacherId, sanitizationVersion: 1 }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    if (!photo) throw new ApiError(404, 'NOT_FOUND', 'الصورة غير متاحة.');
    const bytes = await store.get(photo.storageKey);
    response.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': photo.contentType, 'Content-Disposition': 'inline', 'Content-Security-Policy': "default-src 'none'" }); response.send(bytes);
  };
  app.get('/api/v1/teacher/photo', requireTeacher(database), async (request, response) => {
    // The avatar uses a bounded cache revision, never a caller-selected Teacher identity.
    parse(z.object({ v: z.string().regex(/^\d{1,10}$/u).optional() }).strict(), request.query);
    await send(response.locals.teacherId as string, response);
  });
  app.get('/api/v1/teachers/:id/photo', inspector, async (request, response) => {
    const id = parse(z.string().uuid(), request.params.id);
    const teacher = await database.teacher.findUnique({ where: { id }, select: { districtId: true } });
    if (!teacher) throw new ApiError(404, 'NOT_FOUND', 'الصورة غير متاحة.');
    await requireInspectorDistrictMembership(database, response.locals.inspectorId as string, teacher.districtId);
    await send(id, response);
  });
}
