import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response, RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '../http/api-error.js';
import { validateBody } from '../http/validate-body.js';
import { verifyPassword } from './password.js';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_COOKIE = 'inspector_session';
const CSRF_COOKIE = 'inspector_csrf';
const CSRF_HEADER = 'x-csrf-token';
const SESSION_COOKIE_PATH = '/api/v1';
const LOGIN_SCHEMA = z.object({
  email: z.string().email(),
  password: z.string().min(1),
}).strict();

type AuthDatabase = Pick<PrismaClient, 'inspector' | 'session'>;

type SessionDatabase = Pick<PrismaClient, 'session'>;

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function readCookie(request: Request, name: string): string | undefined {
  const entry = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!entry) return undefined;
  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

function appendCookie(response: Response, name: string, value: string, options: {
  path: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAgeSeconds?: number;
}): void {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path}`, 'SameSite=Strict'];
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (isProduction()) parts.push('Secure');
  response.append('Set-Cookie', parts.join('; '));
}

function clearCookie(response: Response, name: string, path: string, httpOnly: boolean): void {
  appendCookie(response, name, '', { path, expires: new Date(0), maxAgeSeconds: 0, httpOnly });
}

function clearSessionCookies(response: Response): void {
  clearCookie(response, SESSION_COOKIE, SESSION_COOKIE_PATH, true);
  clearCookie(response, CSRF_COOKIE, '/', false);
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sessionCsrfToken(sessionToken: string): string {
  return createHmac('sha256', sessionToken).update('inspector-platform-csrf-v1').digest('base64url');
}

function matches(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function requireCsrf(request: Request, sessionToken?: string): void {
  const cookieToken = readCookie(request, CSRF_COOKIE);
  const headerToken = request.get(CSRF_HEADER);
  const expectedToken = sessionToken ? sessionCsrfToken(sessionToken) : cookieToken;
  if (!matches(cookieToken, expectedToken) || !matches(headerToken, expectedToken)) {
    throw new ApiError(403, 'FORBIDDEN', 'تعذر التحقق من الطلب.');
  }
}

function issuePreAuthenticationCsrf(response: Response): void {
  const csrfToken = randomBytes(32).toString('base64url');
  appendCookie(response, CSRF_COOKIE, csrfToken, { path: '/', maxAgeSeconds: SESSION_TTL_MS / 1000 });
}

function issueSessionCookies(response: Response, token: string, expiresAt: Date): void {
  const secondsRemaining = Math.max(0, (expiresAt.getTime() - Date.now()) / 1000);
  appendCookie(response, SESSION_COOKIE, token, {
    path: SESSION_COOKIE_PATH,
    expires: expiresAt,
    maxAgeSeconds: secondsRemaining,
    httpOnly: true,
  });
  appendCookie(response, CSRF_COOKIE, sessionCsrfToken(token), {
    path: '/',
    expires: expiresAt,
    maxAgeSeconds: secondsRemaining,
  });
}

function unauthenticated(): ApiError {
  return new ApiError(401, 'UNAUTHENTICATED', 'تعذر تسجيل الدخول بهذه البيانات.');
}

export function requireAuthenticatedInspector(database: SessionDatabase): RequestHandler {
  return async (request, response, next) => {
    try {
      const sessionToken = readCookie(request, SESSION_COOKIE);
      if (!sessionToken || !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) throw unauthenticated();
      const session = await database.session.findUnique({
        where: { tokenHash: tokenHash(sessionToken) },
        include: { inspector: true },
      });
      if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now() || session.inspector.status !== 'ACTIVE') {
        throw unauthenticated();
      }
      response.locals.inspectorId = session.inspector.id;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function registerAuthRoutes(app: Express, database: AuthDatabase): void {
  app.use('/api/v1/auth', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.post('/api/v1/auth/login', validateBody(LOGIN_SCHEMA), async (request, response) => {
    const existingToken = readCookie(request, SESSION_COOKIE);
    requireCsrf(request, existingToken);

    const { email, password } = request.body as z.infer<typeof LOGIN_SCHEMA>;
    const inspector = await database.inspector.findUnique({ where: { email } });
    const passwordIsValid = await verifyPassword(password, inspector?.passwordHash);
    if (!inspector || !passwordIsValid || inspector.status !== 'ACTIVE') throw unauthenticated();

    const sessionToken = randomBytes(32).toString('base64url');
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
    await database.session.create({
      data: {
        inspectorId: inspector.id,
        tokenHash: tokenHash(sessionToken),
        createdAt,
        expiresAt,
      },
    });

    issueSessionCookies(response, sessionToken, expiresAt);
    response.json({ data: { id: inspector.id, email: inspector.email } });
  });

  app.get('/api/v1/auth/me', async (request, response) => {
    const sessionToken = readCookie(request, SESSION_COOKIE);
    if (!sessionToken || !/^[A-Za-z0-9_-]{43}$/.test(sessionToken)) {
      clearCookie(response, SESSION_COOKIE, SESSION_COOKIE_PATH, true);
      issuePreAuthenticationCsrf(response);
      throw unauthenticated();
    }

    const session = await database.session.findUnique({
      where: { tokenHash: tokenHash(sessionToken) },
      include: { inspector: true },
    });
    if (
      !session
      || session.revokedAt !== null
      || session.expiresAt.getTime() <= Date.now()
      || session.inspector.status !== 'ACTIVE'
    ) {
      clearCookie(response, SESSION_COOKIE, SESSION_COOKIE_PATH, true);
      issuePreAuthenticationCsrf(response);
      throw unauthenticated();
    }

    const secondsRemaining = (session.expiresAt.getTime() - Date.now()) / 1000;
    appendCookie(response, CSRF_COOKIE, sessionCsrfToken(sessionToken), {
      path: '/',
      expires: session.expiresAt,
      maxAgeSeconds: secondsRemaining,
    });
    response.json({ data: { id: session.inspector.id, email: session.inspector.email } });
  });

  app.post('/api/v1/auth/logout', async (request, response) => {
    const sessionToken = readCookie(request, SESSION_COOKIE);
    requireCsrf(request, sessionToken);

    if (sessionToken && /^[A-Za-z0-9_-]{43}$/.test(sessionToken)) {
      const session = await database.session.findUnique({ where: { tokenHash: tokenHash(sessionToken) } });
      if (session && session.revokedAt === null) {
        await database.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      }
    }

    clearSessionCookies(response);
    response.json({ data: { loggedOut: true } });
  });
}
