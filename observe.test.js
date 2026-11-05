import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createObserveHandler, OBSERVE_PATH, OBSERVE_ACTIONS, sameLoopbackOrigin } from './index.js';

function fakeRequest(body, headers = {}, method = 'POST') {
  const request = Readable.from([Buffer.from(body)]);
  request.method = method;
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

function fakeService(calls, agent = { id: 'card-a' }) {
  return {
    ctx: { agents: { get: id => (id === 'card-a' ? agent : undefined) }, connection: { browserPeer: { id: 'browser' }, admit: () => ({ peer: { id: 'browser' } }) } },
    execute: async (args, context) => { calls.push({ args, context }); return { ok: true, root: '/hanna' }; },
  };
}

test('read-only observations resolve the session agent without the logged slash command', async () => {
  const calls = [];
  const handler = createObserveHandler(fakeService(calls));
  const response = fakeResponse();
  await handler(fakeRequest(JSON.stringify({ sessionId: 'card-a', args: { action: 'project' } })), response);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, value: { ok: true, root: '/hanna' } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.action, 'project');
  assert.equal(calls[0].context.agent.id, 'card-a');
});

test('the observation endpoint cannot be used for mutations', async () => {
  const calls = [];
  const handler = createObserveHandler(fakeService(calls));
  for (const action of ['run', 'build', 'package', 'sign', 'install', 'uninstall', 'stop', 'connect', 'pair', 'cancel']) {
    const response = fakeResponse();
    await handler(fakeRequest(JSON.stringify({ sessionId: 'card-a', args: { action } })), response);
    assert.equal(response.status, 400, action);
    assert.equal(response.body.ok, false);
  }
  assert.equal(calls.length, 0);
  assert.ok(!OBSERVE_ACTIONS.has('run'));
  assert.equal(OBSERVE_PATH, '/android-workbench/observe');
});

test('unknown sessions, foreign origins, missing headers and malformed bodies are rejected', async () => {
  const calls = [];
  const handler = createObserveHandler(fakeService(calls), () => 'http://127.0.0.1:38163');
  const cases = [
    [{ sessionId: 'other', args: { action: 'project' } }, {}, 404],
    [{ sessionId: 'card-a', args: { action: 'project' } }, { origin: 'https://evil.example' }, 400],
  ];
  for (const [payload, headers, status] of cases) {
    const response = fakeResponse();
    await handler(fakeRequest(JSON.stringify(payload), headers), response);
    assert.equal(response.status, status);
  }
  for (const body of ['', 'not json', '[]', JSON.stringify({ args: { action: 'project' } })]) {
    const response = fakeResponse();
    await handler(fakeRequest(body), response);
    assert.equal(response.status, 400);
  }
  const noHeader = fakeResponse();
  await handler(fakeRequest(JSON.stringify({ sessionId: 'card-a', args: { action: 'project' } }), { 'x-awb-observe': '' }), noHeader);
  assert.equal(noHeader.status, 400);
  assert.equal(calls.length, 0);
});

test('an unknown session is a 404 and never reaches the service', async () => {
  const calls = [];
  const handler = createObserveHandler(fakeService(calls));
  const response = fakeResponse();
  await handler(fakeRequest(JSON.stringify({ sessionId: 'missing', args: { action: 'jobs' } })), response);
  assert.equal(response.status, 404);
  assert.equal(calls.length, 0);
});

test('the same GUI accepts localhost and 127.0.0.1 but rejects foreign origins', () => {
  assert.equal(sameLoopbackOrigin('', 'http://127.0.0.1:38163'), true);
  assert.equal(sameLoopbackOrigin('http://127.0.0.1:38163', 'http://127.0.0.1:38163'), true);
  assert.equal(sameLoopbackOrigin('http://localhost:38163', 'http://127.0.0.1:38163'), true);
  assert.equal(sameLoopbackOrigin('http://localhost:9999', 'http://127.0.0.1:38163'), false);
  assert.equal(sameLoopbackOrigin('https://127.0.0.1:38163', 'http://127.0.0.1:38163'), false);
  assert.equal(sameLoopbackOrigin('https://evil.example', 'http://127.0.0.1:38163'), false);
  assert.equal(sameLoopbackOrigin('null', 'http://127.0.0.1:38163'), false);
});
