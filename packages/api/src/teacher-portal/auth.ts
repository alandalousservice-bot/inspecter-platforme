import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Express, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../http/api-error.js';
import { hashPassword, verifyPassword } from '../identity/password.js';
import { requireAuthenticatedMutationCsrf } from '../identity/auth-routes.js';
import { requireInspectorDistrictMembership } from '../policy/district-access.js';
import { createPublicSubmissionRateLimiter } from '../intake/rate-limit.js';
import { parse } from './contracts.js';
import { appendPortalAudit } from './audit.js';

export const TEACHER_TTL_MS = 8 * 60 * 60 * 1000;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
function cookie(request: Request, key: string): string | undefined {
  const value = request.headers.cookie?.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${key}=`))?.slice(key.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : undefined;
}
const csrfFor = (token: string) => createHmac('sha256', token).update('teacher-portal-csrf-v1').digest('base64url');
function writeCookies(response: Response, session?: string, expires?: Date) {
  const opts = { sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production' };
  response.cookie('teacher_csrf', session ? csrfFor(session) : randomToken(), { ...opts, path: '/', ...(expires ? { expires } : {}) });
  if (session && expires) response.cookie('teacher_session', session, { ...opts, httpOnly: true, path: '/api/v1/teacher', expires });
}
export function requireTeacherCsrf(request: Request, authenticated = true) {
  const stored = cookie(request, 'teacher_csrf'); const sent = request.headers['x-csrf-token'];
  const token = cookie(request, 'teacher_session'); const expected = authenticated && token ? csrfFor(token) : stored;
  if (!stored || typeof sent !== 'string' || !expected || sent.length !== expected.length
    || stored.length !== expected.length || !timingSafeEqual(Buffer.from(sent), Buffer.from(expected))
    || !timingSafeEqual(Buffer.from(stored), Buffer.from(expected))) {
    throw new ApiError(403, 'CSRF_FAILED', 'تعذر التحقق من الطلب.');
  }
}

export function requireTeacher(database: PrismaClient, clock = () => new Date()): RequestHandler {
  return async (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    const token = cookie(request, 'teacher_session');
    const session = token ? await database.teacherSession.findUnique({ where: { tokenHash: tokenHash(token) }, include: { account: { include: { teacher: true } } } }) : null;
    if (!session || session.revokedAt || session.expiresAt <= clock() || session.account.status !== 'ACTIVE'
      || session.account.teacher.recordStatus !== 'ACTIVE' || session.account.teacher.archivedAt) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'يلزم تسجيل الدخول.');
    }
    response.locals.teacherId = session.account.teacherId;
    response.locals.teacherAccountId = session.accountId;
    response.locals.teacherSessionId = session.id;
    next();
  };
}

export function registerTeacherAuth(app: Express, database: PrismaClient, inspector: RequestHandler) {
  // Reuse the established trusted IP limiter; mapping is internal and never changes request.url or logs credentials.
  const rateLimit = createPublicSubmissionRateLimiter();
  const authLimit: RequestHandler = (request, response, next) => {
    const proxy = Object.create(request) as Request;
    Object.defineProperty(proxy, 'path', { value: '/api/v1/public/districts/auth/submissions' });
    rateLimit(proxy, response, next);
  };
  app.get('/api/v1/teacher/auth/csrf', (_request, response) => { response.setHeader('Cache-Control', 'no-store'); writeCookies(response); response.json({ data: { ready: true } }); });
  app.post('/api/v1/teachers/:id/account-invitation', inspector, async (request, response) => {
    requireAuthenticatedMutationCsrf(request);
    const id = parse(z.string().uuid(), request.params.id);
    const input = parse(z.object({ email: z.string().email().max(254).transform((s) => s.trim().toLowerCase()), identityConfirmed: z.literal(true) }).strict(), request.body);
    const token = randomToken();
    await database.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${id}::uuid FOR UPDATE`;
      const teacher = await tx.teacher.findUnique({ where: { id }, include: { account: true } });
      if (!teacher) throw new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
      await requireInspectorDistrictMembership(tx, response.locals.inspectorId as string, teacher.districtId);
      if (teacher.account || teacher.recordStatus !== 'ACTIVE' || teacher.archivedAt) throw new ApiError(409, 'ACCOUNT_UNAVAILABLE', 'تعذر إنشاء الدعوة.');
      await tx.teacherInvitation.updateMany({ where: { teacherId: id, consumedAt: null }, data: { consumedAt: new Date() } });
      await tx.teacherInvitation.create({ data: { teacherId: id, districtId: teacher.districtId, inspectorId: response.locals.inspectorId as string,
        loginEmail: input.email, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + TEACHER_TTL_MS) } });
      await appendPortalAudit(tx, response, teacher, 'TEACHER_INVITATION_ISSUED', id);
    });
    response.setHeader('Cache-Control', 'no-store'); response.status(201).json({ data: { activationToken: token } });
  });
  app.post('/api/v1/teacher/auth/activate', authLimit, async (request, response) => {
    requireTeacherCsrf(request, false);
    const input = parse(z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u), password: z.string().min(12).max(128) }).strict(), request.body);
    const passwordHash = await hashPassword(input.password);
    await database.$transaction(async (tx) => {
      const invite = await tx.teacherInvitation.findUnique({ where: { tokenHash: tokenHash(input.token) } });
      if (!invite) throw new ApiError(400, 'ACTIVATION_FAILED', 'الدعوة غير متاحة.');
      await tx.$queryRaw`SELECT id FROM "Teacher" WHERE id = ${invite.teacherId}::uuid FOR UPDATE`;
      const teacher = await tx.teacher.findUnique({ where: { id: invite.teacherId } });
      if (!teacher || teacher.districtId !== invite.districtId || teacher.recordStatus !== 'ACTIVE' || teacher.archivedAt) throw new ApiError(400, 'ACTIVATION_FAILED', 'الدعوة غير متاحة.');
      await requireInspectorDistrictMembership(tx, invite.inspectorId, invite.districtId);
      const issuer = await tx.inspector.findUnique({ where: { id: invite.inspectorId }, select: { status: true } });
      if (issuer?.status !== 'ACTIVE') throw new ApiError(400, 'ACTIVATION_FAILED', 'الدعوة غير متاحة.');
      const claimed = await tx.teacherInvitation.updateMany({ where: { id: invite.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
      if (claimed.count !== 1) throw new ApiError(400, 'ACTIVATION_FAILED', 'الدعوة غير متاحة.');
      if (await tx.teacherAccount.findFirst({ where: { OR: [{ teacherId: teacher.id }, { loginEmail: invite.loginEmail }] } })) throw new ApiError(400, 'ACTIVATION_FAILED', 'الدعوة غير متاحة.');
      await tx.teacherAccount.create({ data: { teacherId: teacher.id, loginEmail: invite.loginEmail, passwordHash } });
      await appendPortalAudit(tx, response, teacher, 'TEACHER_ACCOUNT_ACTIVATED', teacher.id, {}, teacher.id);
    });
    response.status(201).json({ data: { activated: true } });
  });
  app.post('/api/v1/teacher/auth/login', authLimit, async (request, response) => {
    requireTeacherCsrf(request, false);
    const input = parse(z.object({ email: z.string().email().max(254).transform((s) => s.trim().toLowerCase()), password: z.string().min(1).max(128) }).strict(), request.body);
    const account = await database.teacherAccount.findUnique({ where: { loginEmail: input.email }, include: { teacher: true } });
    const valid = await verifyPassword(input.password, account?.passwordHash);
    if (!valid || !account || account.status !== 'ACTIVE' || account.teacher.recordStatus !== 'ACTIVE' || account.teacher.archivedAt) throw new ApiError(401, 'LOGIN_FAILED', 'تعذر تسجيل الدخول.');
    const token = randomToken(); const createdAt = new Date(); const expiresAt = new Date(createdAt.getTime() + TEACHER_TTL_MS);
    await database.teacherSession.create({ data: { accountId: account.id, tokenHash: tokenHash(token), createdAt, expiresAt } });
    writeCookies(response, token, expiresAt); response.setHeader('Cache-Control', 'no-store'); response.json({ data: { authenticated: true } });
  });
  app.post('/api/v1/teacher/auth/logout', requireTeacher(database), async (request, response) => {
    requireTeacherCsrf(request);
    await database.teacherSession.update({ where: { id: response.locals.teacherSessionId as string }, data: { revokedAt: new Date() } });
    const opts = { sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production' };
    response.clearCookie('teacher_session', { ...opts, httpOnly: true, path: '/api/v1/teacher' });
    response.clearCookie('teacher_csrf', { ...opts, path: '/' }); response.json({ data: { loggedOut: true } });
  });
}
