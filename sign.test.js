import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createSignHandler, SIGN_PATH, validateRequest } from './index.js';

function fakeRequest(body, headers = {}) {
  const request = Readable.from([Buffer.from(body)]);
  request.method = 'POST';
  request.headers = { 'x-awb-observe': '1', ...headers };
  return request;
}

function fakeResponse() {
  const response = new EventEmitter();
  response.writableEnded = false;
  response.destroyed = false;
  response.writeHead = status => { response.status = status; };
  response.end = body => { response.writableEnded = true; response.body = JSON.parse(body); };
  return response;
}

const payload = extra => JSON.stringify({ sessionId: 'card-a', args: { action: 'sign', artifact: '/p/a.apk', keystore: '/k/r.jks', alias: 'release', output: '/p/s.apk' }, credentials: { storePassword: 'store-secret', keyPassword: 'key-secret' }, ...extra });

function service(calls, fail = null) {
  return {
    ctx: { agents: { get: id => (id === 'card-a' ? { id } : undefined) }, connection: { browserPeer: { id: 'browser' }, admit: () => ({ peer: { id: 'browser' } }) } },
    execute: async (args, context) => { calls.push({ args, context }); if (fail) throw new Error(fail); return { jobId: 'job-1', status: 'running' }; },
  };
}

test('the signing endpoint passes one-shot credentials to the same Host service', async () => {
  const calls = [];
  const handler = createSignHandler(service(calls), () => 'http://127.0.0.1:3080');
  const response = fakeResponse();
  await handler(fakeRequest(payload()), response);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, value: { jobId: 'job-1', status: 'running' } });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].context.credentials, { storePassword: 'store-secret', keyPassword: 'key-secret' });
  assert.equal(calls[0].context.source, 'ui');
  assert.equal(SIGN_PATH, '/android-workbench/sign');
});

test('only package and sign may use the credential channel', async () => {
  const calls = [];
  const handler = createSignHandler(service(calls));
  for (const action of ['project', 'run', 'build', 'install', 'uninstall', 'devices']) {
    const response = fakeResponse();
    await handler(fakeRequest(JSON.stringify({ sessionId: 'card-a', args: { action }, credentials: { storePassword: 'a', keyPassword: 'b' } })), response);
    assert.equal(response.status, 400, action);
  }
  assert.equal(calls.length, 0);
});

test('missing or malformed credentials never reach the service', async () => {
  const calls = [];
  const handler = createSignHandler(service(calls));
  const bodies = [
    JSON.stringify({ sessionId: 'card-a', args: { action: 'sign' } }),
    JSON.stringify({ sessionId: 'card-a', args: { action: 'sign' }, credentials: { storePassword: 'a' } }),
    JSON.stringify({ sessionId: 'card-a', args: { action: 'sign' }, credentials: { storePassword: '', keyPassword: 'b' } }),
    JSON.stringify({ sessionId: 'card-a', args: { action: 'sign' }, credentials: { storePassword: 'a', keyPassword: 'x'.repeat(1025) } }),
    JSON.stringify({ sessionId: 'card-a', args: { action: 'sign' }, credentials: { storePassword: 'a\0', keyPassword: 'b' } }),
  ];
  for (const body of bodies) {
    const response = fakeResponse();
    await handler(fakeRequest(body), response);
    assert.equal(response.status, 400, body.slice(0, 60));
    assert.equal(response.body.ok, false);
  }
  assert.equal(calls.length, 0);
});

test('the signing endpoint enforces header, origin and session exactly as observation does', async () => {
  const calls = [];
  const handler = createSignHandler(service(calls), () => 'http://127.0.0.1:3080');
  const noHeader = fakeResponse();
  await handler(fakeRequest(payload(), { 'x-awb-observe': '' }), noHeader);
  assert.equal(noHeader.status, 400);
  const foreign = fakeResponse();
  await handler(fakeRequest(payload(), { origin: 'https://evil.example' }), foreign);
  assert.equal(foreign.status, 400);
  const missing = fakeResponse();
  await handler(fakeRequest(JSON.stringify({ sessionId: 'gone', args: { action: 'sign' }, credentials: { storePassword: 'a', keyPassword: 'b' } })), missing);
  assert.equal(missing.status, 404);
  assert.equal(calls.length, 0);
});

test('passwords are redacted from signing errors returned to the browser', async () => {
  const handler = createSignHandler(service([], 'apksigner failed for store-secret while using key-secret'));
  const response = fakeResponse();
  await handler(fakeRequest(payload()), response);
  assert.equal(response.status, 400);
  assert.equal(response.body.error.includes('store-secret'), false);
  assert.equal(response.body.error.includes('key-secret'), false);
  assert.match(response.body.error, /\[REDACTED\]/);
});

test('the slash command still rejects credential fields from any caller', () => {
  assert.throws(() => validateRequest({ action: 'sign', credentials: { storePassword: 'a', keyPassword: 'b' } }), /Unknown Android request field/);
  assert.throws(() => validateRequest({ action: 'package', storePassword: 'a' }), /Unknown Android request field/);
});
