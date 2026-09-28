import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import { test } from 'node:test';

test('web and API artifacts build independently', () => {
  assert.ok(existsSync('packages/web/dist/index.html'));
  assert.ok(existsSync('packages/api/dist/main.js'));
});

test('API process starts and responds to HTTP', async () => {
  const port = 30000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, ['packages/api/dist/main.js'], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  try {
    let response;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (child.exitCode !== null) throw new Error('API exited during startup');
      try {
        response = await fetch(`http://127.0.0.1:${port}/`);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.ok(response, 'API did not start');
    assert.equal(response.status, 404);
  } finally {
    child.kill();
    if (child.exitCode === null) await once(child, 'exit');
  }
});
