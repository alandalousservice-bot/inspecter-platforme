import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../dist/app.js';
import { createPublicSubmissionRateLimiter, resolvePublicClientIp } from '../dist/intake/rate-limit.js';

async function withServer(app, run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('client IP resolution ignores spoofable forwarding headers and trusts configured Cloudflare header only', () => {
  const request = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-forwarded-for': '198.51.100.77' },
  };
  assert.equal(resolvePublicClientIp(request, { NODE_ENV: 'test' }), '127.0.0.1');
  assert.equal(resolvePublicClientIp(request, { NODE_ENV: 'production', TRUSTED_CLIENT_IP_SOURCE: 'cloudflare' }), null);
  assert.equal(resolvePublicClientIp({ ...request, headers: { 'cf-connecting-ip': '203.0.113.9' } }, {
    NODE_ENV: 'production', TRUSTED_CLIENT_IP_SOURCE: 'cloudflare',
  }), '203.0.113.9');
  assert.equal(resolvePublicClientIp({ ...request, headers: { 'cf-connecting-ip': '203.0.113.9, 198.51.100.1' } }, {
    NODE_ENV: 'production', TRUSTED_CLIENT_IP_SOURCE: 'cloudflare',
  }), null);
  assert.equal(resolvePublicClientIp(request, { NODE_ENV: 'production' }), null);
});

test('public intake limiter counts all attempts, ignores X-Forwarded-For, and returns Retry-After', async () => {
  const app = createApp(undefined, {
    publicSubmissionRateLimiter: createPublicSubmissionRateLimiter({
      resolveClientIp: (request) => request.socket.remoteAddress,
    }),
  });
  await withServer(app, async (baseUrl) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/v1/public/districts/not-a-uuid/submissions`, {
        method: 'POST',
        headers: { 'x-forwarded-for': `198.51.100.${attempt + 1}`, 'content-type': 'application/json' },
        body: '{malformed-json',
      });
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.error.code, 'VALIDATION_ERROR');
    }
    const limited = await fetch(`${baseUrl}/api/v1/public/districts/not-a-uuid/submissions`, {
      method: 'POST', headers: { 'x-forwarded-for': '203.0.113.88' },
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after') !== null, true);
    const body = await limited.json();
    assert.equal(body.error.code, 'RATE_LIMITED');
    assert.equal(typeof body.error.requestId, 'string');
  });
});

test('missing reliable client IP fails closed with a generic temporary error', async () => {
  const app = createApp(undefined, {
    publicSubmissionRateLimiter: createPublicSubmissionRateLimiter({ resolveClientIp: () => null }),
  });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/public/districts/00000000-0000-4000-8000-000000000000/submissions`, {
      method: 'POST', headers: { 'x-forwarded-for': '198.51.100.12' },
    });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ['error']);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(typeof body.error.requestId, 'string');
  });
});
