import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createActionHandler, createObserveHandler, createSignHandler, HarnessAndroidService, ACTION_PATH, UI_ACTIONS } from './index.js';
import { AndroidWorkbench } from './android.js';
import os from 'node:os';

const ORIGIN = 'http://127.0.0.1:3080';
function request(payload: any, headers: Record<string, string | undefined> = {}, method = 'POST'): any {
  const req: any = Readable.from([Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload))]);
  req.method = method;
  req.headers = { 'x-awb-action': '1', 'content-type': 'application/json', origin: ORIGIN, ...headers };
  return req;
}
function response(): any {
  const res: any = new EventEmitter();
  res.writableEnded = false;
  res.destroyed = false;
  res.writeHead = (status: any) => { res.status = status; };
  res.end = (body: any) => { res.writableEnded = true; res.body = JSON.parse(body); };
  return res;
}
function fixture(execute?: any) {
  const calls: any[] = [];
  const agent = { id: 'android-card' };
  const service: any = {
    ctx: { agents: { get: (id: string) => id === agent.id ? agent : undefined }, connection: { browserPeer: { id: 'browser' }, admit: () => ({ peer: { id: 'browser' } }) }, commands: { execute: () => assert.fail('No command/chat writes allowed') } },
    async execute(args: any, context: any) { calls.push({ args, context }); return execute ? execute(args, context) : { jobId: 'job-1' }; },
  };
  return { calls, service, handler: createActionHandler(service, () => ORIGIN) };
}

test('all toolbar mutations call the same Host operation without a command/chat record', async () => {
  assert.equal(ACTION_PATH, '/android-workbench/action');
  const { calls, handler } = fixture();
  for (const action of UI_ACTIONS) {
    const res = response();
    await handler(request({ sessionId: 'android-card', args: { action } }), res);
    assert.equal(res.status, 200, action);
    assert.deepEqual(res.body, { ok: true, value: { jobId: 'job-1' } });
    const call = calls.at(-1);
    assert.equal(call.context.agent.id, 'android-card');
    assert.equal(call.context.source, 'ui');
    assert.ok(call.context.signal instanceof AbortSignal);
    assert.equal(call.args.action, action);
  }
});

test('action route cannot replace observation, credential signing or model-only device operations', async () => {
  const { calls, handler } = fixture();
  for (const action of ['project', 'devices', 'jobs', 'status', 'logcat', 'artifacts', 'package', 'sign', 'install', 'uninstall', 'stop', 'pair']) {
    const res = response();
    await handler(request({ sessionId: 'android-card', args: { action } }), res);
    assert.equal(res.status, 400, action);
  }
  assert.equal(calls.length, 0);
});

test('mutations reject forged authority, raw commands, secrets, bad sessions and cross-site requests', async () => {
  const { calls, handler } = fixture();
  const valid = { sessionId: 'android-card', args: { action: 'build' } };
  for (const payload of [
    { ...valid, source: 'ui' }, { ...valid, credentials: { storePassword: 'secret' } },
    { ...valid, args: { action: 'run', source: 'ui' } },
    { ...valid, args: { action: 'run', argv: ['sh'] } },
    { ...valid, args: { action: 'run', storePassword: 'secret' } },
    { ...valid, args: { action: 'arbitrary-shell' } },
    { ...valid, args: { action: 'build', module: 123 } },
    { ...valid, args: null }, { ...valid, args: [] },
    { args: valid.args }, [], 'not JSON',
  ]) {
    const res = response();
    await handler(request(payload), res);
    assert.equal(res.status, 400);
  }
  for (const headers of [{ 'x-awb-action': '' }, { 'content-type': 'text/plain' }, { 'content-type': 'application/json-not-really' }, { origin: '' }, { origin: 'https://foreign.example' }, { origin: 'http://localhost:9999' }]) {
    const res = response();
    await handler(request(valid, headers), res);
    assert.equal(res.status, 400);
  }
  const wrongMethod = response();
  await handler(request(valid, {}, 'GET'), wrongMethod);
  assert.equal(wrongMethod.status, 400);
  const unknown = response();
  await handler(request({ ...valid, sessionId: 'other' }), unknown);
  assert.equal(unknown.status, 404);
  assert.equal(calls.length, 0);
});

test('all UI routes reject unauthenticated requests, separate API/model Peers and unavailable auth', async () => {
  for (const createHandler of [createActionHandler, createObserveHandler, createSignHandler]) {
    for (const [admission, status] of [[{ rejection: 401 }, 401], [{ rejection: 403 }, 403], [{ peer: { id: 'model-api' } }, 403]]) {
      const { service, calls } = fixture();
      service.ctx.connection.admit = () => admission;
      const res = response();
      await createHandler(service, () => ORIGIN)(request({ sessionId: 'android-card', args: { action: 'build' } }, { 'x-awb-observe': '1' }), res);
      assert.equal(res.status, status);
      assert.equal(calls.length, 0);
    }
    const { service, calls } = fixture();
    delete service.ctx.connection;
    const res = response();
    await createHandler(service)(request({ sessionId: 'android-card', args: { action: 'build' } }, { 'x-awb-observe': '1' }), res);
    assert.equal(res.status, 503);
    assert.equal(calls.length, 0);
  }
});

test('oversized bodies and mid-upload disconnects cannot launch work or hang a request', async () => {
  const { handler, calls } = fixture();
  const large = request({ sessionId: 'android-card', args: { action: 'build', output: 'x'.repeat(65536) } });
  const largeRes = response();
  await handler(large, largeRes);
  assert.equal(largeRes.status, 400);
  assert.equal(large.destroyed, true);
  const stalled: any = new Readable({ read() {} });
  stalled.method = 'POST';
  stalled.headers = { 'x-awb-action': '1', 'content-type': 'application/json', origin: ORIGIN };
  const closedRes = response();
  const pending = handler(stalled, closedRes);
  closedRes.emit('close');
  await pending;
  stalled.emit('error', new Error('simulated socket ECONNRESET'));
  stalled.destroy();
  assert.equal(closedRes.status, 400);
  assert.equal(calls.length, 0);
});

test('UI cancellation still refuses a job owned by another live session', async () => {
  const { service: stub } = fixture();
  const killed: any[] = [];
  stub.ctx.jobs = { kill: (...args: any[]) => { killed.push(args); return 'killed'; } };
  const service = new HarnessAndroidService(stub.ctx);
  service.ownedJobs.set('foreign-job', 'another-session');
  const handler = createActionHandler(service, () => ORIGIN);
  const res = response();
  await handler(request({ sessionId: 'android-card', args: { action: 'cancel', jobId: 'foreign-job' } }), res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /foreign Android job/);
  assert.equal(killed.length, 0);
  // Avoid disposing the synthetic foreign record (the ownership fence is the subject).
  service.ownedJobs.clear();
  await service.dispose();
});

test('disconnect during a real short-operation service lifetime drains pending work', async t => {
  const { service: stub } = fixture();
  stub.ctx.workingDirectory = { ensure: async () => os.tmpdir() };
  const service = new HarnessAndroidService(stub.ctx);
  const original = AndroidWorkbench.prototype.execute;
  t.after(() => { AndroidWorkbench.prototype.execute = original; });
  const res = response();
  let cleaned = false;
  AndroidWorkbench.prototype.execute = (async (_args: any, { signal }: any) => {
    try {
      await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        res.emit('close');
      });
    } finally { cleaned = true; }
  }) as any;
  const handler = createActionHandler(service, () => ORIGIN);
  await handler(request({ sessionId: 'android-card', args: { action: 'connect', address: '127.0.0.1:5555' } }), res);
  assert.equal(res.status, 400);
  assert.equal(cleaned, true);
  assert.equal(service.pending.size, 0);
  assert.equal(service.active.size, 0);
  await service.dispose();
});

test('request cancellation aborts foreground work and failures are returned to the panel', async () => {
  const res = response();
  const { handler } = fixture(async (_args: any, { signal }: any) => {
    res.emit('close');
    assert.equal(signal.aborted, true);
    throw new Error('explicit operation failed');
  });
  await handler(request({ sessionId: 'android-card', args: { action: 'connect', address: '127.0.0.1:5555' } }), res);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /explicit operation failed/);
});
