import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../dist/app.js';
import { validateBody } from '../dist/http/validate-body.js';
import { z } from 'zod';

let server;
let baseUrl;

before(async () => {
  server = createApp((app) => {
    const privateTextSchema = z.object({ label: z.string() }).superRefine(({ label }, context) => {
      if (label.includes('@')) {
        context.addIssue({ code: 'custom', message: `Invalid value: ${label}`, path: ['label'] });
      }
    });
    app.post('/api/v1/test/validated', validateBody(privateTextSchema), (request, response) => response.json({ data: request.body }));
    app.post('/api/v1/test/private-error', () => {
      throw new Error('private email: person@example.test');
    });
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.close();
  await once(server, 'close');
});

describe('API foundation', () => {
  it('serves health with a correlation ID', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    const body = await response.json();
    const requestId = response.headers.get('x-request-id');

    assert.equal(response.status, 200);
    assert.equal(body.data.status, 'ok');
    assert.match(requestId, /^[0-9a-f-]{36}$/);
  });

  it('returns the common error envelope for unknown routes', async () => {
    const response = await fetch(`${baseUrl}/api/v1/missing`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.equal(body.error.requestId, response.headers.get('x-request-id'));
    assert.equal('stack' in body.error, false);
  });

  it('validates request JSON and does not echo submitted personal data', async () => {
    const privateValue = 'person@example.test';
    const response = await fetch(`${baseUrl}/api/v1/test/validated`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: privateValue }),
    });
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.equal(body.error.fields.label[0], 'قيمة غير صالحة.');
    assert.equal(body.error.requestId, response.headers.get('x-request-id'));
    assert.equal(rawBody.includes(privateValue), false);
  });

  it('returns a generic internal error without exposing exception details', async () => {
    const response = await fetch(`${baseUrl}/api/v1/test/private-error`, { method: 'POST' });
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    assert.equal(response.status, 500);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(rawBody.includes('person@example.test'), false);
    assert.equal(rawBody.includes('private email'), false);
  });

  it('normalizes malformed JSON into the common validation envelope', async () => {
    const response = await fetch(`${baseUrl}/api/v1/test/validated`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{invalid-json',
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.equal(body.error.requestId, response.headers.get('x-request-id'));
  });
});
