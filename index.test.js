import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setImmediate as immediate } from 'node:timers/promises';
import { Readable } from 'node:stream';
import { createRunner } from './runner.js';
import { AndroidWorkbench } from './android.js';
import { HarnessAndroidService, apply, inject, parameters, validateRequest } from './index.js';

// These adapters follow the inspected Host jobs/tools/commands contracts. No
// real Harness service, ADB, Gradle, device, keystore or secret is used.
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function onAbort(signal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
}

function fakeContext(root, { mode = 'workspace-write', approval = 'rejected' } = {}) {
  const calls = [];
  const records = new Map();
  const registrations = { commands: [], tools: [] };
  const cleanups = [];
  const events = new Map();
  let controllers = 0;
  let sequence = 0;
  const owned = (id, owner) => {
    const record = records.get(id);
    if (!record || record.spec.owner !== owner) throw new Error('Foreign or unknown fake job');
    return record;
  };
  const view = record => ({
    id: record.id, kind: record.spec.kind, label: record.spec.label,
    owner: record.spec.owner, status: record.status,
    startedAt: 1, output: { total: record.total, earliest: 0 },
  });
  const ctx = {
    calls, records, registrations,
    on(name, listener) {
      const listeners = events.get(name) ?? new Set();
      events.set(name, listeners);
      listeners.add(listener);
      const dispose = () => listeners.delete(listener);
      cleanups.push(dispose);
      return dispose;
    },
    async emit(name, payload) {
      for (const listener of events.get(name) ?? []) await listener(payload);
    },
    effect(effect) {
      const cleanup = effect();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
      return () => {};
    },
    async cleanup() {
      for (const cleanup of cleanups.reverse()) await cleanup();
    },
    workingDirectory: {
      async ensure(agent, signal) {
        calls.push(['ensure', agent, signal]);
        signal?.throwIfAborted();
        return root;
      },
    },
    sandboxPolicy: {
      resolve(request) { calls.push(['policy', request]); return { mode, workspaceRoot: root }; },
    },
    approval: {
      async request(request) { calls.push(['approval', request]); return approval; },
    },
    subprocess: {
      resolveExecutable() { assert.fail('Adapter test must never resolve a native executable'); },
      spawn() { assert.fail('Adapter test must never spawn a native process'); },
    },
    jobs: {
      attachController(name) {
        calls.push(['attachController', name]);
        controllers++;
        return () => { calls.push(['detachController', name]); controllers--; };
      },
      start(spec) {
        assert.ok(controllers > 0, 'Job controller must be attached before starting work');
        assert.equal(spec.kind, 'android');
        assert.equal(typeof spec.owner, 'string');
        assert.equal(typeof spec.label, 'string');
        assert.equal(spec.outputLimitBytes, 262144);
        assert.equal(typeof spec.run, 'function');
        const id = `android-test-${++sequence}`;
        const record = { id, spec, chunks: [], total: 0, status: 'running' };
        calls.push(['start', spec]);
        const hooks = spec.run({
          id,
          append(text, options = {}) {
            if (record.appendFailure) throw record.appendFailure;
            assert.equal(typeof text, 'string');
            assert.ok(['stdout', 'stderr', 'log', undefined].includes(options.channel));
            record.chunks.push({ at: record.total, text, ...options });
            record.total += Buffer.byteLength(text);
          },
          updateProgress() {},
        });
        assert.equal(typeof hooks.cancel, 'function');
        assert.ok(hooks.done instanceof Promise);
        record.hooks = hooks;
        record.done = hooks.done.then(outcome => {
          assert.ok(['completed', 'killed', 'failed'].includes(outcome.status));
          if (outcome.result !== undefined) assert.equal(typeof outcome.result, 'string');
          record.status = outcome.status;
          record.outcome = outcome;
          return outcome;
        });
        records.set(id, record);
        return id;
      },
      get(id, owner) { calls.push(['get', id, owner]); return view(owned(id, owner)); },
      readAt(id, from, owner) {
        calls.push(['readAt', id, from, owner]);
        assert.ok(Number.isSafeInteger(from) && from >= 0);
        const record = owned(id, owner);
        return { chunks: record.chunks.filter(c => c.at + Buffer.byteLength(c.text) > from), next: record.total, lossy: false };
      },
      kill(id, owner, reason) {
        calls.push(['kill', id, owner, reason]);
        const record = owned(id, owner);
        if (!['running', 'stopping'].includes(record.status)) return 'already-finished';
        record.hooks.cancel(reason);
        record.status = 'stopping';
        return 'requested';
      },
    },
    commands: {
      register(definition) {
        registrations.commands.push(definition);
        return () => { calls.push(['unregisterCommand', definition.name]); };
      },
    },
    tools: {
      register(definition) {
        registrations.tools.push(definition);
        return () => { calls.push(['unregisterTool', definition.name]); };
      },
    },
  };
  return ctx;
}

async function fixture(t, options = {}) {
  const temporary = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temporary, 'android-index-test-'));
  // Isolate the test process's environment so redaction/core construction never
  // reads real signing passwords, pairing codes or other Host environment data.
  const originalEnvironment = process.env;
  process.env = { ANDROID_TEST_TOKEN: 'fake-test-only-token' };
  const ctx = fakeContext(root, options);
  const service = new HarnessAndroidService(ctx);
  const detach = ctx.jobs.attachController('index-test');
  const coreCalls = [];
  t.mock.method(AndroidWorkbench.prototype, 'execute', async function(args, context) {
    coreCalls.push({ args, context, root: this.root, run: this.run });
    return options.core ? options.core(args, context, this) : { action: args.action, root: this.root };
  });
  t.after(async () => {
    await service.dispose();
    await ctx.cleanup();
    detach();
    process.env = originalEnvironment;
    // Validate the exact resolved temporary target before deleting it.
    const resolved = await fs.realpath(root);
    assert.equal(path.dirname(resolved), temporary);
    assert.match(path.basename(resolved), /^android-index-test-/);
    await fs.rm(resolved, { recursive: true });
  });
  const agent = { id: 'session-owner', session: { id: 'session-owner' } };
  return { ctx, service, coreCalls, root, agent };
}

function builtArtifact(root, format = 'apk', overrides = {}) {
  return { action: 'build', module: ':app', variant: 'Debug', format,
    artifacts: [{ path: path.join(root, `app-debug.${format}`), format, variant: 'debug', fresh: true }],
    warnings: ['fake build warning'], ...overrides };
}

async function packageFixture(t, options = {}) {
  const state = await fixture(t, { mode: 'danger-full-access', ...options });
  process.env.ANDROID_STORE_PASSWORD = 'fake-store-only';
  process.env.ANDROID_KEY_PASSWORD = 'fake-key-only';
  await fs.writeFile(path.join(state.root, 'test-key.jks'), 'fake keystore fixture, never parsed');
  const request = { action: 'package', projectRoot: state.root, module: ':app', variant: 'Debug', format: 'apk',
    keystore: 'test-key.jks', alias: 'release', output: 'signed.apk' };
  return { ...state, request };
}

function assertSchema(node) {
  assert.equal(typeof node, 'object');
  const allowed = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'description', 'title', 'default', 'examples']);
  for (const key of Object.keys(node)) assert.ok(allowed.has(key), `Unsupported Native schema keyword: ${key}`);
  if (node.type) assert.ok(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(node.type));
  for (const child of Object.values(node.properties ?? {})) assertSchema(child);
  for (const child of node.oneOf ?? []) assertSchema(child);
  if (node.items) assertSchema(node.items);
  if (node.additionalProperties !== undefined) assert.equal(typeof node.additionalProperties, 'boolean');
  for (const name of node.required ?? []) assert.ok(Object.hasOwn(node.properties, name));
}

test('request adapter rejects raw process, source/permission and plaintext-secret fields', () => {
  for (const input of [null, [], {}, { action: 'shell' }, { action: 'project', source: 'ui' }, { action: 'devices', command: 'adb' }, { action: 'build', args: ['assemble'] }, { action: 'sign', password: 'fake' }, { action: 'devices', sandbox_permissions: 'danger-full-access' }, { action: 'status', from: -1 }, { action: 'status', from: 0.5 }, { action: 'build', format: 'zip' }, { action: 'build', skipResource: 'true' }, { action: 'project', module: '\0bad' }]) {
    assert.throws(() => validateRequest(input));
  }
  const input = { action: 'status', jobId: 'android-id', from: 0 };
  assert.deepEqual(validateRequest(input), input);
  assert.notEqual(validateRequest(input), input);
});

test('missing agent and pre-aborted calls perform no lookup, permission request or work', async t => {
  const { ctx, service, coreCalls, agent } = await fixture(t);
  await assert.rejects(service.execute({ action: 'project' }), /live session/);
  await assert.rejects(service.execute({ action: 'devices' }, { agent, signal: AbortSignal.abort(new Error('test aborted')) }), /test aborted/);
  assert.equal(coreCalls.length, 0);
  assert.equal(ctx.calls.some(c => ['ensure', 'approval', 'start'].includes(c[0])), false);
});

test('project/artifact reads use the exact session directory, no native approval or job', async t => {
  const { ctx, service, agent, coreCalls, root } = await fixture(t, { mode: 'read-only' });
  for (const action of ['project', 'artifacts']) {
    const result = await service.execute({ action }, { agent });
    assert.deepEqual(result, { action, root });
  }
  assert.equal(coreCalls.length, 2);
  assert.equal(ctx.calls.filter(c => c[0] === 'ensure').every(c => c[1] === agent && c[2] instanceof AbortSignal), true);
  assert.equal(ctx.calls.some(c => ['policy', 'approval', 'start'].includes(c[0])), false);
});

for (const outcome of ['rejected', 'cancelled', 'unavailable']) {
  test(`native model operation is fail-closed for approval outcome ${outcome}`, async t => {
    const { ctx, service, agent, coreCalls } = await fixture(t, { approval: outcome });
    await assert.rejects(service.execute({ action: 'devices' }, { agent, callId: 'tool-call' }), new RegExp(outcome));
    assert.equal(coreCalls.length, 0);
    assert.equal(ctx.records.size, 0);
    const ask = ctx.calls.find(c => c[0] === 'approval')[1];
    assert.equal(ask.agent, agent);
    assert.equal(ask.callId, 'tool-call');
    assert.equal(ask.toolName, 'android_workbench');
    assert.ok(ask.signal instanceof AbortSignal);
    assert.deepEqual(ctx.calls.find(c => c[0] === 'policy')[1], { session: agent.session });
  });
}

test('an allowed-once native short operation runs once without a background job', async t => {
  const { ctx, service, agent, coreCalls } = await fixture(t, { approval: 'allowed-once' });
  assert.equal((await service.execute({ action: 'devices' }, { agent })).action, 'devices');
  assert.equal(coreCalls.length, 1);
  assert.equal(ctx.calls.filter(c => c[0] === 'approval').length, 1);
  assert.equal(ctx.records.size, 0);
});

test('Full Access and trusted human source bypass approval, not input validation', async t => {
  const { ctx, service, agent, coreCalls } = await fixture(t, { mode: 'danger-full-access' });
  await service.execute({ action: 'devices' }, { agent });
  await service.execute({ action: 'connect', address: 'localhost:5555' }, { agent, source: 'ui' });
  await assert.rejects(service.execute({ action: 'devices', source: 'ui' }, { agent }), /Unknown Android request field/);
  assert.equal(coreCalls.length, 2);
  assert.equal(ctx.calls.filter(c => c[0] === 'policy').length, 1);
  assert.equal(ctx.calls.some(c => c[0] === 'approval'), false);
});

test('long work starts exactly one owned job, preserves root call identity and output/result shape', async t => {
  const value = { action: 'build', artifacts: [{ path: '/fake/app.apk' }] };
  const { ctx, agent, coreCalls } = await fixture(t, { mode: 'danger-full-access', core: async (_args, { onOutput }) => {
    onOutput({ stream: 'stderr', text: 'test warning' });
    return value;
  } });
  apply(ctx);
  const tool = ctx.registrations.tools[0];
  const receipt = await tool.execute({ action: 'build', module: ':app', variant: 'Debug' }, { agent, callId: 'nested-call', rootCallId: 'root-call', signal: new AbortController().signal });
  assert.deepEqual(Object.keys(receipt).sort(), ['jobId', 'status']);
  assert.equal(receipt.status, 'running');
  const record = ctx.records.get(receipt.jobId);
  assert.equal(record.spec.owner, agent.id);
  assert.deepEqual(record.spec.toolCall, { callId: 'nested-call', rootCallId: 'root-call' });
  const terminal = await record.done;
  assert.deepEqual(terminal, { status: 'completed', result: JSON.stringify(value) });
  assert.equal(coreCalls.length, 1);
  assert.ok(record.chunks.some(c => c.text.includes('test warning')));
  assert.equal(ctx.calls.filter(c => c[0] === 'start').length, 1);
});

test('status/cancel refuse foreign and non-workbench jobs before consulting the registry', async t => {
  const { ctx, service, agent } = await fixture(t, { mode: 'danger-full-access' });
  const receipt = await service.execute({ action: 'build' }, { agent });
  await ctx.records.get(receipt.jobId).done;
  const start = ctx.calls.length;
  for (const action of ['status', 'cancel']) {
    await assert.rejects(service.execute({ action, jobId: receipt.jobId }, { agent: { id: 'another-session' }, source: 'ui' }), /foreign/);
    await assert.rejects(service.execute({ action, jobId: 'bash-other-job' }, { agent }), /foreign/);
    await assert.rejects(service.execute({ action }, { agent }), /jobId is required/);
  }
  assert.deepEqual(ctx.calls.slice(start), []);
});

test('status passes id/cursor/owner in exact jobs API order and bounds observer output', async t => {
  const value = { artifact: 'app.apk' };
  const { ctx, service, agent } = await fixture(t, { mode: 'danger-full-access', core: async (_args, { onOutput }) => { onOutput('x'.repeat(40000)); return value; } });
  const receipt = await service.execute({ action: 'build' }, { agent });
  await ctx.records.get(receipt.jobId).done;
  const result = await service.execute({ action: 'status', jobId: receipt.jobId, from: 12 }, { agent });
  assert.deepEqual(ctx.calls.at(-2), ['get', receipt.jobId, agent.id]);
  assert.deepEqual(ctx.calls.at(-1), ['readAt', receipt.jobId, 12, agent.id]);
  assert.equal(result.job.status, 'completed');
  assert.deepEqual(result.result, value);
  assert.equal(result.output.lossy, true);
  assert.ok(result.output.chunks.reduce((n, c) => n + c.text.length, 0) <= 32000);
  assert.equal(result.output.next, ctx.records.get(receipt.jobId).total);
});

test('cancel supplies owner/reason, aborts the producer once, and returns registry status', async t => {
  const started = deferred();
  const { ctx, service, agent, coreCalls } = await fixture(t, { mode: 'danger-full-access', core: async (_args, { signal }) => {
    started.resolve();
    await onAbort(signal);
    signal.throwIfAborted();
  } });
  const receipt = await service.execute({ action: 'run' }, { agent });
  await started.promise;
  assert.deepEqual(await service.execute({ action: 'cancel', jobId: receipt.jobId }, { agent }), { status: 'requested' });
  assert.deepEqual(ctx.calls.at(-1), ['kill', receipt.jobId, agent.id, 'Android operation cancelled by caller']);
  assert.equal((await ctx.records.get(receipt.jobId).done).status, 'killed');
  assert.equal(coreCalls.length, 1);
});

test('caller cancellation after the job receipt does not kill detached background work', async t => {
  const release = deferred();
  const signal = new AbortController();
  const { ctx, service, agent, coreCalls } = await fixture(t, { mode: 'danger-full-access', core: async () => { await release.promise; return { done: true }; } });
  const receipt = await service.execute({ action: 'build' }, { agent, signal: signal.signal });
  signal.abort();
  assert.equal(coreCalls[0].context.signal.aborted, false);
  release.resolve();
  assert.equal((await ctx.records.get(receipt.jobId).done).status, 'completed');
});

test('project lock prevents duplicate mutations, not observation, and releases after settlement', async t => {
  const release = deferred();
  const { ctx, service, agent, coreCalls } = await fixture(t, { mode: 'danger-full-access', core: async args => {
    if (args.action === 'build') await release.promise;
    return { action: args.action };
  } });
  const receipt = await service.execute({ action: 'build' }, { agent });
  try {
    await assert.rejects(service.execute({ action: 'install', serial: 'fake', apk: 'app.apk' }, { agent }), /already active/);
    assert.deepEqual(await service.execute({ action: 'project' }, { agent }), { action: 'project' });
    assert.equal(coreCalls.filter(c => c.args.action === 'build').length, 1);
  } finally { release.resolve(); }
  await ctx.records.get(receipt.jobId).done;
  assert.equal((await service.execute({ action: 'stop', serial: 'fake', packageName: 'com.fake.app' }, { agent })).action, 'stop');
});

test('dispose aborts and waits for a short operation asynchronous cleanup', async t => {
  const started = deferred();
  const release = deferred();
  const { service, agent } = await fixture(t, { core: async (_args, { signal }) => {
    started.resolve();
    await onAbort(signal);
    await release.promise;
    signal.throwIfAborted();
  } });
  const operation = service.execute({ action: 'project' }, { agent });
  const observed = operation.then(() => 'success', error => error.message);
  await started.promise;
  let settled = false;
  const disposing = service.dispose().then(() => { settled = true; });
  try {
    await immediate();
    assert.equal(settled, false, 'Unload must wait for short-operation cleanup');
  } finally { release.resolve(); }
  await disposing;
  assert.match(await observed, /unloaded/);
  assert.equal(service.pending.size, 0);
  await assert.rejects(service.execute({ action: 'project' }, { agent }), /unloaded|unloading/);
});

test('dispose kills owned long jobs, terminates managed children, and drains cleanup', async t => {
  const started = deferred();
  const release = deferred();
  const { ctx, service, agent } = await fixture(t, { mode: 'danger-full-access', core: async (_args, { signal }) => {
    started.resolve();
    await onAbort(signal);
    await release.promise;
    signal.throwIfAborted();
  } });
  const receipt = await service.execute({ action: 'build' }, { agent });
  await started.promise;
  const childCalls = [];
  service.active.add({ terminate() { childCalls.push('terminate'); }, async waitForExit() { childCalls.push('wait'); await release.promise; return true; } });
  let settled = false;
  const disposing = service.dispose().then(() => { settled = true; });
  try {
    await immediate();
    assert.equal(settled, false);
    assert.deepEqual(childCalls, ['terminate', 'wait']);
    assert.ok(ctx.calls.some(c => c[0] === 'kill' && c[1] === receipt.jobId && c[2] === agent.id && c[3] === 'Android plugin unloaded'));
  } finally { release.resolve(); }
  await disposing;
  assert.equal((await ctx.records.get(receipt.jobId).done).status, 'killed');
  assert.equal(service.pending.size, 0);
  assert.equal(service.ownedJobs.size, 0);
  assert.equal(service.jobContexts.size, 0);
});

test('runner stays cancellable and registered until the managed process range is quiescent', async t => {
  const enteringExitWait = deferred();
  const release = deferred();
  let terminated = 0;
  const { ctx, service, agent } = await fixture(t, { core: async (_args, { signal }, core) => core.run(['fake-adb'], { cwd: core.root, signal }) });
  const child = {
    stdout: undefined, stderr: undefined,
    done: Promise.resolve({ exitCode: 0, signal: null }),
    terminate() { terminated++; release.resolve(); },
    async waitForExit() { enteringExitWait.resolve(); await release.promise; return true; },
  };
  ctx.subprocess.resolveExecutable = async () => '/fake/adb';
  ctx.subprocess.spawn = spec => {
    spec.signal.addEventListener('abort', () => child.terminate(), { once: true });
    return child;
  };
  const operation = service.execute({ action: 'project' }, { agent });
  const observed = operation.then(() => undefined, () => undefined);
  await enteringExitWait.promise;
  const stillTracked = service.active.has(child);
  const disposing = service.dispose();
  try {
    await immediate();
    assert.equal(stillTracked, true, 'The handle must stay active throughout waitForExit, not just child.done');
    assert.ok(terminated > 0, 'Unload must still be able to terminate the managed range');
  } finally {
    release.resolve();
    await observed;
    await disposing;
  }
});

function fakeManagedProvider({ pendingTopLevel = false, stdout = [] } = {}) {
  const entered = deferred();
  const range = deferred();
  const topLevel = deferred();
  const calls = [];
  const child = {
    stdout: Readable.from(stdout), stderr: Readable.from([]),
    done: pendingTopLevel ? topLevel.promise : Promise.resolve({ exitCode: 0, signal: null }),
    terminate() {
      calls.push('terminate');
      topLevel.resolve({ exitCode: null, signal: 'SIGTERM' });
      range.resolve();
    },
    async waitForExit() { entered.resolve(); await range.promise; return true; },
  };
  const subprocess = {
    async resolveExecutable() { return '/fake/adb'; },
    spawn(spec) { spec.signal.addEventListener('abort', () => child.terminate(), { once: true }); return child; },
  };
  return { subprocess, child, calls, entered, release: range.resolve };
}

test('runner forwards cancellation during descendant exit wait and never returns false success', async () => {
  const provider = fakeManagedProvider();
  const active = new Set();
  const controller = new AbortController();
  const operation = createRunner(provider.subprocess, { active })(['fake-adb'], { cwd: '/fake', signal: controller.signal });
  const rejected = assert.rejects(operation, /cancel while waiting/);
  try {
    await provider.entered.promise;
    assert.equal(active.has(provider.child), true);
    controller.abort(new Error('cancel while waiting'));
    await rejected;
    assert.equal(provider.calls.length, 1);
    assert.equal(active.size, 0);
  } finally { provider.release(); }
});

test('runner keeps its deadline armed while waiting for managed descendants', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const provider = fakeManagedProvider();
  const active = new Set();
  const operation = createRunner(provider.subprocess, { active })(['fake-adb'], { cwd: '/fake', timeoutMs: 1000 });
  const rejected = assert.rejects(operation, /timed out after 1000/);
  try {
    await provider.entered.promise;
    t.mock.timers.tick(1000);
    await rejected;
    assert.equal(provider.calls.length, 1);
    assert.equal(active.size, 0);
  } finally { provider.release(); }
});

test('runner immediately terminates a child when output observation fails', async () => {
  const provider = fakeManagedProvider({ pendingTopLevel: true, stdout: ['test output'] });
  const active = new Set();
  try {
    await assert.rejects(createRunner(provider.subprocess, { active })(['fake-adb'], {
      cwd: '/fake', onOutput() { throw new Error('fake observer failed'); },
    }), /fake observer failed/);
    assert.equal(provider.calls.length, 1);
    assert.equal(active.size, 0);
  } finally { provider.release(); }
});

test('failed job-output appends clear pending work without an unhandled finally rejection', async t => {
  const release = deferred();
  const { ctx, service, agent } = await fixture(t, { mode: 'danger-full-access', core: async () => { await release.promise; return { done: true }; } });
  const receipt = await service.execute({ action: 'build' }, { agent });
  const record = ctx.records.get(receipt.jobId);
  record.appendFailure = new Error('fake output ring failed');
  const rejected = assert.rejects(record.done, /fake output ring failed/);
  release.resolve();
  await rejected;
  await immediate();
  assert.equal(service.pending.size, 0);
  assert.equal(service.locks.size, 0);
});

test('registered command and Native tool enter the same service implementation with trusted source metadata', async t => {
  const { ctx, agent } = await fixture(t);
  const calls = [];
  t.mock.method(HarnessAndroidService.prototype, 'execute', async function(args, context) {
    calls.push({ service: this, args, context });
    return { action: args.action, marker: 'shared' };
  });
  apply(ctx);
  const command = ctx.registrations.commands[0];
  const tool = ctx.registrations.tools[0];
  const signal = new AbortController().signal;
  const input = { action: 'devices' };
  const human = await command.handler({ agent, rawInput: JSON.stringify(input), signal });
  const model = await tool.execute(input, { agent, signal, callId: 'call', rootCallId: 'root' });
  assert.equal(calls[0].service, calls[1].service);
  assert.deepEqual(calls.map(c => c.args), [input, input]);
  assert.equal(calls[0].context.source, 'ui');
  assert.equal(calls[1].context.source, undefined, 'Tool adapter must not supply the trusted UI bypass');
  assert.equal(calls[1].context.agent, agent);
  assert.equal(calls[1].context.signal, signal);
  assert.equal(calls[1].context.callId, 'call');
  assert.equal(calls[1].context.rootCallId, 'root');
  assert.deepEqual(JSON.parse(human.text), { ok: true, value: model });
  assert.equal(human.kind, 'success');
  assert.equal(command.recordInput, false);
});

test('Native definition and output conform to the inspected tool schema contract', async t => {
  const { ctx } = await fixture(t);
  apply(ctx);
  const tool = ctx.registrations.tools[0];
  assert.equal(tool.name, 'android_workbench');
  assert.equal(typeof tool.description, 'string');
  assert.equal(typeof tool.execute, 'function');
  assert.equal(tool.parameters, parameters);
  assertSchema(tool.parameters);
  assertSchema(tool.output.schema);
  assert.deepEqual(tool.output.render({}, { jobId: 'android-test', status: 'running' }), [{ type: 'text', text: '{"jobId":"android-test","status":"running"}' }]);
  assert.equal(Object.hasOwn(tool.parameters.properties, 'source'), false);
  assert.equal(Object.hasOwn(tool.parameters.properties, 'password'), false);
  assert.equal(tool.isConcurrencySafe({ action: 'project' }), true);
  assert.equal(tool.isConcurrencySafe({ action: 'status' }), true);
  assert.equal(tool.isConcurrencySafe({ action: 'run' }), false);
  assert.ok(inject.includes('jobs') && inject.includes('subprocess') && inject.includes('approval') && inject.includes('sandboxPolicy'));
});

test('agent disposal clears only its Android job/result references', async t => {
  const { ctx, agent } = await fixture(t, { mode: 'danger-full-access' });
  let instance;
  const originalExecute = HarnessAndroidService.prototype.execute;
  t.mock.method(HarnessAndroidService.prototype, 'execute', async function(...args) {
    instance = this;
    return originalExecute.apply(this, args);
  });
  apply(ctx);
  const tool = ctx.registrations.tools[0];
  const signal = new AbortController().signal;
  const first = await tool.execute({ action: 'build' }, { agent, signal, callId: 'first' });
  await ctx.records.get(first.jobId).done;
  const other = { id: 'other-owner', session: { id: 'other-owner' } };
  const second = await tool.execute({ action: 'build' }, { agent: other, signal, callId: 'second' });
  await ctx.records.get(second.jobId).done;
  assert.equal(instance.ownedJobs.size, 2);
  assert.equal(instance.results.size, 2);
  await ctx.emit('agent/disposed', { agent });
  assert.equal(instance.ownedJobs.has(first.jobId), false);
  assert.equal(instance.results.has(first.jobId), false);
  assert.equal(instance.jobContexts.has(first.jobId), false);
  assert.equal(instance.jobContexts.has(second.jobId), true);
  assert.equal(instance.ownedJobs.get(second.jobId), other.id);
  assert.equal(instance.results.has(second.jobId), true);
  assert.equal((await tool.execute({ action: 'status', jobId: second.jobId }, { agent: other, signal })).job.owner, other.id);
  await assert.rejects(tool.execute({ action: 'status', jobId: first.jobId }, { agent, signal }), /foreign/);
});

test('registered UI commands cannot grant permissions to a later model invocation', async t => {
  const { ctx, agent, coreCalls } = await fixture(t, { mode: 'read-only', approval: 'rejected' });
  apply(ctx);
  const signal = new AbortController().signal;
  const input = { action: 'devices' };
  const result = await ctx.registrations.commands[0].handler({ agent, rawInput: JSON.stringify(input), signal });
  assert.equal(result.kind, 'success');
  assert.equal(coreCalls.length, 1);
  await assert.rejects(ctx.registrations.tools[0].execute(input, { agent, signal, callId: 'model' }), /not authorized/);
  assert.equal(coreCalls.length, 1);
  assert.equal(ctx.calls.filter(c => c[0] === 'approval').length, 1);
});

test('JSON parse failures never echo an accidentally pasted secret into command results', async t => {
  const { ctx, agent, coreCalls } = await fixture(t);
  apply(ctx);
  const signal = new AbortController().signal;
  const marker = 'NeverLogMe';
  const result = await ctx.registrations.commands[0].handler({ agent, rawInput: marker, signal });
  assert.equal(result.kind, 'error');
  assert.equal(result.text.includes(marker), false, 'Syntax errors must not persist raw input fragments');
  assert.equal(coreCalls.length, 0);
});

test('command errors redact configured fake secrets and malformed input never reaches the service', async t => {
  const { ctx, agent, coreCalls } = await fixture(t);
  apply(ctx);
  const command = ctx.registrations.commands[0];
  const signal = new AbortController().signal;
  for (const rawInput of ['{invalid', 'x'.repeat(16385), '{"action":"devices","source":"ui"}']) {
    assert.equal((await command.handler({ agent, rawInput, signal })).kind, 'error');
  }
  assert.equal(coreCalls.length, 0);
  t.mock.method(HarnessAndroidService.prototype, 'execute', async () => { throw new Error('fake-test-only-token'); });
  const failure = await command.handler({ agent, rawInput: '{"action":"project"}', signal });
  assert.deepEqual(failure, { kind: 'error', text: '[REDACTED]' });
});

test('package serializes one build and one sign in the same detached job, using only its exact artifact', async t => {
  const built = deferred();
  const release = deferred();
  const state = await packageFixture(t, { core: async (args, { signal }, core) => {
    if (args.action === 'build') { built.resolve(); await release.promise; signal.throwIfAborted(); return builtArtifact(core.root); }
    assert.equal(args.action, 'sign');
    return { action: 'sign', format: 'apk', output: path.resolve(core.root, args.output), verified: true };
  } });
  const { ctx, service, request, agent, coreCalls, root } = state;
  const caller = new AbortController();
  const receipt = await service.execute({ ...request, skipResource: true }, { agent, signal: caller.signal, callId: 'package-call', rootCallId: 'root-package' });
  await built.promise;
  assert.equal(coreCalls.length, 1);
  assert.deepEqual(coreCalls[0].args, { action: 'build', module: ':app', variant: 'Debug', format: 'apk', skipResource: true });
  caller.abort(new Error('UI navigated away'));
  release.resolve();
  const record = ctx.records.get(receipt.jobId);
  assert.equal((await record.done).status, 'completed');
  assert.equal(ctx.calls.filter(call => call[0] === 'start').length, 1);
  assert.deepEqual(record.spec.toolCall, { callId: 'package-call', rootCallId: 'root-package' });
  assert.deepEqual(coreCalls.map(call => call.args.action), ['build', 'sign']);
  assert.equal(coreCalls[0].context.signal, coreCalls[1].context.signal);
  assert.equal(coreCalls[1].args.artifact, path.join(root, 'app-debug.apk'));
  assert.equal(coreCalls[1].args.keystore, 'test-key.jks');
  assert.equal(Object.hasOwn(coreCalls[1].args, 'projectRoot'), false);
  const status = await service.execute({ action: 'status', jobId: receipt.jobId }, { agent });
  assert.deepEqual(status.result, { action: 'package', module: ':app', variant: 'Debug', format: 'apk',
    artifacts: [{ path: path.join(root, 'signed.apk'), format: 'apk', verified: true }],
    output: path.join(root, 'signed.apk'), verified: true, warnings: ['fake build warning'] });
  assert.deepEqual(service.jobContexts.get(receipt.jobId), { root, action: 'package', module: ':app', variant: 'Debug', format: 'apk' });
  const summary = record.chunks.map(chunk => chunk.text).join('');
  assert.match(summary, /Android package completed\./);
  assert.ok(summary.includes(path.join(root, 'signed.apk')));
  assert.equal(summary.includes('"verified"'), false, 'Structured JSON is not appended to the log');
  assert.equal(summary.includes('fake-store-only'), false);
  assert.equal(summary.includes('test-key.jks'), false);
});

test('package supports AAB and forwards only signing references, not raw environment values', async t => {
  const { ctx, service, request, agent, coreCalls, root } = await packageFixture(t, { core: async (args, _context, core) => args.action === 'build'
    ? builtArtifact(core.root, 'aab')
    : { action: 'sign', format: 'aab', output: path.resolve(core.root, args.output), verified: true } });
  const receipt = await service.execute({ ...request, format: 'aab', output: 'release.aab', storePasswordEnv: 'ANDROID_STORE_PASSWORD', keyPasswordEnv: 'ANDROID_KEY_PASSWORD' }, { agent });
  await ctx.records.get(receipt.jobId).done;
  assert.deepEqual(coreCalls[1].args, { action: 'sign', format: 'aab', artifact: path.join(root, 'app-debug.aab'), output: 'release.aab', keystore: 'test-key.jks', alias: 'release', storePasswordEnv: 'ANDROID_STORE_PASSWORD', keyPasswordEnv: 'ANDROID_KEY_PASSWORD' });
  assert.equal(JSON.stringify(coreCalls.map(call => call.args)).includes('fake-store-only'), false);
  assert.equal(service.results.get(receipt.jobId).format, 'aab');
});

test('package build failure never signs and releases the project lock', async t => {
  const { ctx, service, request, agent, coreCalls, root } = await packageFixture(t, { core: async () => { throw new Error('fake Gradle failure'); } });
  const receipt = await service.execute(request, { agent });
  assert.equal((await ctx.records.get(receipt.jobId).done).status, 'failed');
  assert.deepEqual(coreCalls.map(call => call.args.action), ['build']);
  assert.match(service.results.get(receipt.jobId).error, /Gradle failure/);
  assert.equal(service.locks.has(root), false);
});

test('package cancellation during build never signs even if the core returns a result after abort', async t => {
  const entered = deferred();
  const { ctx, service, request, agent, coreCalls } = await packageFixture(t, { core: async (_args, { signal }, core) => {
    entered.resolve(); await onAbort(signal); return builtArtifact(core.root);
  } });
  const receipt = await service.execute(request, { agent });
  await entered.promise;
  await service.execute({ action: 'cancel', jobId: receipt.jobId }, { agent });
  assert.equal((await ctx.records.get(receipt.jobId).done).status, 'killed');
  assert.deepEqual(coreCalls.map(call => call.args.action), ['build']);
});

test('package ambiguity refuses signing and preserves only the current build artifacts for explicit selection', async t => {
  const { ctx, service, request, agent, coreCalls, root } = await packageFixture(t, { core: async (_args, _context, core) => {
    const result = builtArtifact(core.root);
    return { ...result, artifacts: [...result.artifacts, { ...result.artifacts[0], path: path.join(core.root, 'another-debug.apk') }] };
  } });
  const receipt = await service.execute(request, { agent });
  assert.equal((await ctx.records.get(receipt.jobId).done).status, 'failed');
  assert.deepEqual(coreCalls.map(call => call.args.action), ['build']);
  const result = service.results.get(receipt.jobId);
  assert.match(result.error, /choose one explicitly from the artifact cards/);
  assert.deepEqual(result.artifacts.map(artifact => artifact.path), [path.join(root, 'app-debug.apk'), path.join(root, 'another-debug.apk')]);
  assert.equal(Object.hasOwn(result, 'keystore'), false);
  assert.equal(Object.hasOwn(result, 'storePasswordEnv'), false);
});

test('package refuses wrong module, variant, format and escaping build artifacts before signing', async t => {
  const cases = [
    { module: ':other' }, { variant: 'Release' }, { format: 'aab' },
    { artifacts: [] },
    { artifacts: [{ path: '/outside/app.apk', format: 'apk', variant: 'debug' }] },
    { artifacts: [{ path: '/outside/app.aab', format: 'aab', variant: 'debug' }] },
    { artifacts: [{ path: '/outside/app.apk', format: 'apk', variant: 'release' }] },
  ];
  for (const [index, overrides] of cases.entries()) await t.test(String(index), async st => {
    const { ctx, service, request, agent, coreCalls } = await packageFixture(st, { core: async (_args, _context, core) => builtArtifact(core.root, 'apk', overrides) });
    const receipt = await service.execute(request, { agent });
    assert.equal((await ctx.records.get(receipt.jobId).done).status, 'failed');
    assert.deepEqual(coreCalls.map(call => call.args.action), ['build']);
  });
});

test('package checks signing fields, environment references and output extension before starting a job or build', async t => {
  const { ctx, service, request, agent, coreCalls } = await packageFixture(t);
  const cases = [
    { keystore: '' }, { alias: '' }, { output: '' }, { output: 'signed.aab' },
    { storePasswordEnv: 'fake-store-only' }, { keyPasswordEnv: 'PASSWORD' }, { storePasswordEnv: 'ANDROID_NOT_SET' },
    { artifact: 'old.apk' }, { apk: 'old.apk' }, { serial: 'unneeded-device' },
  ];
  for (const change of cases) await assert.rejects(service.execute({ ...request, ...change }, { agent }));
  for (const name of ['keystore', 'alias', 'output']) {
    const missing = { ...request }; delete missing[name];
    await assert.rejects(service.execute(missing, { agent }));
  }
  assert.equal(coreCalls.length, 0);
  assert.equal(ctx.records.size, 0);
});

test('package preflight reads metadata only and refuses existing output, missing keystore and unsafe paths before build', async t => {
  const { ctx, service, request, agent, coreCalls, root } = await packageFixture(t);
  await fs.writeFile(path.join(root, 'existing.apk'), 'must not overwrite');
  await fs.mkdir(path.join(root, 'not-a-keystore'));
  await fs.symlink(root, path.join(root, 'linked-output'));
  for (const change of [{ output: 'existing.apk' }, { keystore: 'missing-key.jks' }, { keystore: 'not-a-keystore' }, { output: '../escape.apk' }, { output: 'linked-output/app.apk' }]) {
    await assert.rejects(service.execute({ ...request, ...change }, { agent }));
  }
  assert.equal(await fs.readFile(path.join(root, 'existing.apk'), 'utf8'), 'must not overwrite');
  assert.equal(coreCalls.length, 0);
  assert.equal(ctx.records.size, 0);
});

test('package keeps built artifacts after signing failure and never reports verified success', async t => {
  const { ctx, service, request, agent, coreCalls } = await packageFixture(t, { core: async (args, _context, core) => {
    if (args.action === 'build') return builtArtifact(core.root);
    throw new Error('signing rejected fake-store-only');
  } });
  const receipt = await service.execute(request, { agent });
  assert.equal((await ctx.records.get(receipt.jobId).done).status, 'failed');
  assert.deepEqual(coreCalls.map(call => call.args.action), ['build', 'sign']);
  const result = service.results.get(receipt.jobId);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.verified, undefined);
  assert.match(result.error, /\[REDACTED\]/);
});

test('jobs is read-only, owner-fenced, newest-first and limited to 20 safe contexts', async t => {
  const { ctx, service, agent, root } = await fixture(t, { mode: 'read-only' });
  const ids = [];
  for (let i = 0; i < 25; i++) {
    const receipt = await service.execute({ action: 'build', module: ':app', variant: 'Debug', keystore: 'private-key-path', storePasswordEnv: 'ANDROID_PRIVATE_PASSWORD' }, { agent, source: 'ui' });
    ids.push(receipt.jobId); await ctx.records.get(receipt.jobId).done;
  }
  const other = { id: 'other-session', session: { id: 'other-session' } };
  const foreign = await service.execute({ action: 'build' }, { agent: other, source: 'ui' });
  await ctx.records.get(foreign.jobId).done;
  const before = ctx.calls.length;
  const result = await service.execute({ action: 'jobs', projectRoot: '/irrelevant-old-root' }, { agent });
  assert.deepEqual(result.jobs.map(job => job.id), ids.slice(-20).reverse());
  assert.equal(result.jobs.every(job => job.owner === agent.id), true);
  assert.deepEqual(result.jobs[0].context, { root, action: 'build', module: ':app', variant: 'Debug', format: 'apk' });
  assert.equal(ctx.calls.slice(before).every(call => call[0] === 'get' && call[2] === agent.id), true);
  assert.equal(JSON.stringify(result).includes('private-key-path'), false);
  assert.equal(JSON.stringify(result).includes('ANDROID_PRIVATE_PASSWORD'), false);
  result.jobs[0].context.root = '/mutated-client-copy';
  assert.equal(service.jobContexts.get(ids.at(-1)).root, root);
});

test('jobs tolerates removed registry jobs, removes stale references and preserves other owners', async t => {
  const { ctx, service, agent } = await fixture(t, { mode: 'danger-full-access' });
  const first = await service.execute({ action: 'build' }, { agent });
  await ctx.records.get(first.jobId).done;
  ctx.records.delete(first.jobId);
  const foreign = { id: 'foreign', session: { id: 'foreign' } };
  const second = await service.execute({ action: 'build' }, { agent: foreign });
  await ctx.records.get(second.jobId).done;
  const result = await service.execute({ action: 'jobs' }, { agent });
  assert.deepEqual(result, { jobs: [] });
  assert.equal(service.ownedJobs.has(first.jobId), false);
  assert.equal(service.jobContexts.has(first.jobId), false);
  assert.equal(service.results.has(first.jobId), false);
  assert.equal(service.ownedJobs.get(second.jobId), foreign.id);
});

test('expected projectRoot mismatch aborts before native approval, core or job creation', async t => {
  const { ctx, service, agent, coreCalls } = await fixture(t, { mode: 'read-only' });
  for (const action of ['devices', 'run', 'build', 'package', 'sign', 'artifacts']) {
    await assert.rejects(service.execute({ action, projectRoot: '/a-different-project' }, { agent }), /Project root changed/);
  }
  assert.equal(coreCalls.length, 0);
  assert.equal(ctx.records.size, 0);
  assert.equal(ctx.calls.some(call => ['approval', 'policy', 'start'].includes(call[0])), false);
});

test('matching expected projectRoot is a guard, never a core argument or workspace switch', async t => {
  const { ctx, service, agent, coreCalls, root } = await fixture(t, { mode: 'danger-full-access' });
  await service.execute({ action: 'devices', projectRoot: root }, { agent });
  assert.deepEqual(coreCalls[0].args, { action: 'devices' });
  assert.equal(coreCalls[0].root, root);
  await service.execute({ action: 'project', projectRoot: '/ignored-for-project-read' }, { agent });
  assert.deepEqual(coreCalls[1].args, { action: 'project' });
  assert.equal(ctx.calls.every(call => call[0] !== 'set'), true);
});

test('package requires native authority without letting UI requests grant later model permissions', async t => {
  const { ctx, service, request, agent, coreCalls } = await packageFixture(t, { mode: 'read-only', approval: 'rejected' });
  await assert.rejects(service.execute(request, { agent }), /not authorized/);
  assert.equal(ctx.records.size, 0);
  assert.equal(coreCalls.length, 0);
  assert.equal(ctx.calls.filter(call => call[0] === 'approval').length, 1);
});

test('concurrent package preflights still start only one job in a project', async t => {
  const release = deferred();
  const { ctx, service, request, agent, coreCalls } = await packageFixture(t, { core: async (args, _context, core) => {
    if (args.action === 'build') { await release.promise; return builtArtifact(core.root); }
    return { format: 'apk', output: path.resolve(core.root, args.output), verified: true };
  } });
  try {
    const attempts = await Promise.allSettled([service.execute(request, { agent }), service.execute(request, { agent })]);
    assert.equal(attempts.filter(attempt => attempt.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter(attempt => attempt.status === 'rejected' && /already active/.test(attempt.reason.message)).length, 1);
    assert.equal(ctx.records.size, 1);
    assert.deepEqual(coreCalls.map(call => call.args.action), ['build']);
  } finally { release.resolve(); }
  await Promise.all([...ctx.records.values()].map(record => record.done));
  assert.deepEqual(coreCalls.map(call => call.args.action), ['build', 'sign']);
});

test('package cancellation while signing waits for core cleanup and cannot report verified success', async t => {
  const entered = deferred();
  const cleanup = deferred();
  const { ctx, service, request, agent, coreCalls, root } = await packageFixture(t, { core: async (args, { signal }, core) => {
    if (args.action === 'build') return builtArtifact(core.root);
    entered.resolve(); await onAbort(signal); await cleanup.promise;
    return { format: 'apk', output: path.resolve(core.root, args.output), verified: true };
  } });
  const receipt = await service.execute(request, { agent });
  await entered.promise;
  await service.execute({ action: 'cancel', jobId: receipt.jobId }, { agent });
  const record = ctx.records.get(receipt.jobId);
  try {
    await immediate();
    assert.equal(record.status, 'stopping');
    assert.equal(service.locks.get(root), receipt.jobId);
  } finally { cleanup.resolve(); }
  assert.equal((await record.done).status, 'killed');
  assert.equal(service.results.get(receipt.jobId).verified, undefined);
  assert.deepEqual(coreCalls.map(call => call.args.action), ['build', 'sign']);
  assert.equal(service.locks.has(root), false);
});

test('package rejects unverified or unexpected signed output without inventing success', async t => {
  for (const kind of ['unverified', 'wrong-output', 'wrong-format']) await t.test(kind, async st => {
    const { ctx, service, request, agent } = await packageFixture(st, { core: async (args, _context, core) => {
      if (args.action === 'build') return builtArtifact(core.root);
      return { format: kind === 'wrong-format' ? 'aab' : 'apk', output: path.resolve(core.root, kind === 'wrong-output' ? 'unexpected.apk' : args.output), verified: kind !== 'unverified' };
    } });
    const receipt = await service.execute(request, { agent });
    assert.equal((await ctx.records.get(receipt.jobId).done).status, 'failed');
    assert.equal(service.results.get(receipt.jobId).verified, undefined);
    assert.equal(service.results.get(receipt.jobId).artifacts.length, 1);
  });
});

test('package failures redact overlapping signing secrets without leaving a suffix in result or log', async t => {
  const { ctx, service, request, agent } = await packageFixture(t, { core: async () => { throw new Error('fake-shared-secret-longer'); } });
  process.env.ANDROID_STORE_PASSWORD = 'fake-shared-secret';
  process.env.ANDROID_KEY_PASSWORD = 'fake-shared-secret-longer';
  const receipt = await service.execute(request, { agent });
  const record = ctx.records.get(receipt.jobId);
  await record.done;
  assert.equal(service.results.get(receipt.jobId).error, '[REDACTED]');
  assert.equal(record.chunks.some(chunk => chunk.text.includes('-longer')), false);
});
