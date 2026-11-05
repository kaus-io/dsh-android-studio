import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createRunner } from './runner.js';

function provider() {
  const calls = [];
  const process = {
    stdout: Readable.from([Buffer.from('hello '), Buffer.from('世界')]),
    stderr: Readable.from(['warning']),
    done: Promise.resolve({ exitCode: 0, signal: null }),
    terminate() { calls.push('terminate'); },
    async waitForExit() { calls.push('wait'); return true; },
  };
  return { calls, process, async resolveExecutable(name) { calls.push(name); return '/usr/bin/' + name; }, spawn(spec) { calls.push(spec); return process; } };
}

test('runner uses managed argv, stdin and bounded output, then awaits exit', async () => {
  const p = provider();
  const active = new Set();
  const seen = [];
  const result = await createRunner(p, { active, maxOutput: 6 })(['adb', 'pair', 'localhost:1234'], { cwd: '/project', stdin: '123456\n', onOutput: text => seen.push(text) });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'llo 世界');
  assert.equal(result.stderr, 'arning');
  assert.deepEqual(p.calls[1].argv, ['/usr/bin/adb', 'pair', 'localhost:1234']);
  assert.deepEqual(p.calls[1].stdio.stdin, { data: '123456\n' });
  assert.equal(active.size, 0);
  assert.equal(p.calls.at(-1), 'wait');
  assert.ok(seen.map(event => event.text).join('').includes('世界'));
});

test('pre-aborted runner never resolves or spawns a process', async () => {
  const p = provider();
  await assert.rejects(createRunner(p)(['adb'], { cwd: '/project', signal: AbortSignal.abort(new Error('cancelled')) }), /cancelled/);
  assert.equal(p.calls.length, 0);
});

test('failed process is drained, failure remains visible', async () => {
  const p = provider();
  p.process.done = Promise.resolve({ exitCode: 7, signal: null });
  const result = await createRunner(p)(['adb', 'devices'], { cwd: '/project' });
  assert.equal(result.exitCode, 7);
  assert.equal(p.calls.at(-1), 'wait');
});

test('invalid argv refuses spawn', async () => {
  const p = provider();
  await assert.rejects(createRunner(p)(['adb', '\0bad'], { cwd: '/project' }), /argv/);
  assert.equal(p.calls.length, 0);
});
