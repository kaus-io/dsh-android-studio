import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCurrentSession, reconcileModule, chooseDevice, runBlockedReason, wizardSteps, wizardError, wizardRequest, suggestSignedOutput, artifactRows, mergeJobFrame, UI_OUTPUT_LIMIT } from './ui-model.js';

const project = { root: '/project', modules: [
  { path: ':app', defaultVariant: 'Bugly_off_Jiagu_off_Debug' },
  { path: ':demo', defaultVariant: 'Debug' },
] };
const ready = [{ serial: 'usb-1', state: 'device' }];
const selection = { project, modulePath: ':app', variant: 'Bugly_off_Jiagu_off_Debug', devices: ready, serial: 'usb-1' };
const signed = { mode: 'signed', modulePath: ':app', variant: selection.variant, format: 'apk', skipResource: false, keystore: '/keys/release.jks', alias: 'release', output: '/project/release-signed.apk', storePassword: 'store-secret', keyPassword: 'key-secret' };

test('current project follows the main-view session, never an arbitrary unrelated chat', () => {
  const list = { byId: { a: { id: 'a', retainedBy: {} }, b: { id: 'b', retainedBy: { mainView: 1 } } } };
  assert.equal(selectCurrentSession(list, 'a'), 'b');
  assert.equal(selectCurrentSession({ byId: { a: list.byId.a } }), '');
  assert.equal(selectCurrentSession({ byId: { a: list.byId.a } }, 'a'), 'a');
  assert.equal(selectCurrentSession(list, 'missing'), 'b');
  assert.equal(selectCurrentSession({ byId: {} }, 'a'), '');
});

test('App changes restore each module variant rather than sharing an unrelated text field', () => {
  const start = reconcileModule(project, {});
  assert.equal(start.modulePath, ':app');
  assert.equal(start.variant, selection.variant);
  const next = reconcileModule(project, { ...start, modulePath: ':demo', variant: '', variantsByModule: { ':app': 'Bugly_off_Jiagu_off_Release' } });
  assert.equal(next.variant, 'Debug');
  const back = reconcileModule(project, { ...next, modulePath: '', variantsByModule: { ...next.variantsByModule, ':app': 'Bugly_off_Jiagu_off_Release' } });
  assert.equal(back.variant, 'Bugly_off_Jiagu_off_Release');
  assert.equal(reconcileModule(project, { modulePath: ':app', variant: '', variantsByModule: { ':app': 'Bugly_off_Jiagu_off_Release' } }).variant, 'Bugly_off_Jiagu_off_Release');
  assert.deepEqual(reconcileModule({ modules: [] }, next), { modulePath: '', variant: '', variantsByModule: {} });
});

test('a remembered device never redirects to another device after disconnect', () => {
  assert.equal(chooseDevice(ready), 'usb-1');
  assert.equal(chooseDevice([...ready, { serial: 'usb-2', state: 'device' }]), '');
  assert.equal(chooseDevice([{ serial: 'usb-2', state: 'device' }], 'usb-1'), 'usb-1');
  assert.equal(chooseDevice([{ serial: 'usb-1', state: 'offline' }], 'usb-1'), 'usb-1');
  assert.equal(chooseDevice([]), '');
});

test('Run gives actionable disabled reasons and only accepts online explicit Debug configuration', () => {
  assert.equal(runBlockedReason(selection), null);
  assert.equal(runBlockedReason({ ...selection, project: null }), 'reason.projectLoading');
  assert.equal(runBlockedReason({ ...selection, modulePath: ':removed' }), 'reason.noModule');
  assert.equal(runBlockedReason({ ...selection, variant: '' }), 'reason.noVariant');
  assert.equal(runBlockedReason({ ...selection, variant: 'Bugly_on_Jiagu_off_Debug' }), 'reason.unsafeVariant');
  assert.equal(runBlockedReason({ ...selection, variant: 'Release' }), 'reason.debugOnly');
  assert.equal(runBlockedReason({ ...selection, job: { status: 'stopping' } }), 'reason.busy');
  assert.equal(runBlockedReason({ ...selection, busy: true }), 'reason.busy');
  assert.equal(runBlockedReason({ ...selection, serial: '' }), 'reason.noDevice');
  assert.equal(runBlockedReason({ ...selection, devices: [] }), 'reason.deviceUnavailable');
});

test('wizard stages do not execute commands and unsigned packaging has no signing fields', () => {
  assert.deepEqual(wizardSteps('build'), ['target', 'review']);
  assert.deepEqual(wizardSteps('signed'), ['target', 'signing', 'review']);
  assert.deepEqual(wizardSteps('existing'), ['artifact', 'signing', 'review']);
  const form = { mode: 'build', modulePath: ':app', variant: selection.variant, format: 'aab' };
  assert.equal(wizardError(form, project), null);
  assert.deepEqual(wizardRequest(form), { action: 'build', module: ':app', variant: selection.variant, format: 'aab', skipResource: false });
});

test('signed wizard submits one Host-owned build/sign job rather than a client-side continuation', () => {
  assert.equal(wizardError(signed, project), null);
  assert.deepEqual(wizardRequest(signed), { action: 'package', module: ':app', variant: selection.variant, format: 'apk', skipResource: false, keystore: signed.keystore, alias: signed.alias, storePassword: signed.storePassword, keyPassword: signed.keyPassword, output: signed.output });
});

test('sign-this-artifact carries its exact source and format, not hidden state from another tab', () => {
  const form = { ...signed, mode: 'existing', modulePath: undefined, variant: undefined, artifact: '/project/app.aab', format: 'aab', output: '/project/app-signed.aab' };
  assert.equal(wizardError(form, project), null);
  assert.deepEqual(wizardRequest(form), { action: 'sign', artifact: form.artifact, format: 'aab', keystore: signed.keystore, alias: signed.alias, storePassword: signed.storePassword, keyPassword: signed.keyPassword, output: form.output });
  assert.equal(suggestSignedOutput('/project/app.aab'), '/project/app-signed.aab');
});

test('signing wizard validates secret references and prevents obvious original-output overwrite', () => {
  assert.equal(wizardError({ ...signed, storePassword: '' }, project), 'wizard.noPassword');
  assert.equal(wizardError({ ...signed, keyPassword: 'x'.repeat(1025) }, project), 'wizard.noPassword');
  assert.equal(wizardError({ ...signed, alias: ';shell' }, project), 'wizard.noAlias');
  assert.equal(wizardError({ ...signed, output: '/project/out.zip' }, project), 'wizard.noOutput');
  assert.equal(wizardError({ ...signed, mode: 'existing', artifact: '/project/app.apk', output: '/project/x/../app.apk' }, project), 'wizard.sameOutput');
  assert.equal(wizardError({ ...signed, mode: 'existing', artifact: '/project/app.aab' }, project), 'wizard.noArtifact');
  assert.equal(wizardError({ ...signed, variant: 'Bugly_on_Jiagu_on_Release' }, project), 'reason.unsafeVariant');
});

test('artifact cards include only actual APK/AAB outputs, not metadata paths or keystores', () => {
  const value = { metadata: '/project/output-metadata.json', keystore: '/keys/release.jks', artifacts: [
    { path: '/project/app.apk', size: 42, metadata: '/project/output-metadata.json', format: 'apk', fresh: true },
    { path: '/project/noise.json' },
  ] };
  const rows = artifactRows(value);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { path: '/project/app.apk', format: 'apk', variant: '', size: 42, applicationId: '', verified: false, fresh: true, reused: false });
  assert.equal(artifactRows({ action: 'sign', artifact: '/project/original.apk', output: '/project/signed.apk', verified: true })[0].path, '/project/signed.apk');
  assert.deepEqual(artifactRows({ output: '/project/old.apk', verified: false }), []);
});

test('job observation merges bounded plain text, byte cursors and terminal result', () => {
  const job = { id: 'android-1', status: 'running' };
  const initial = mergeJobFrame({ job, output: '', cursor: 0 }, { job, output: { chunks: [{ at: 0, text: '构建\n' }], next: 7, lossy: false }, result: null });
  assert.equal(initial.output, '构建\n');
  assert.equal(initial.cursor, 7);
  const duplicate = mergeJobFrame(initial, { job, output: { chunks: [{ at: 0, text: '构建\n' }], next: 7 } });
  assert.equal(duplicate.output, initial.output);
  const done = mergeJobFrame(duplicate, { job: { ...job, status: 'completed' }, output: { chunks: [{ at: 7, text: 'OK\n' }], next: 10 }, result: { artifacts: [{ path: '/project/app.apk' }] } });
  assert.equal(done.output, '构建\nOK\n');
  assert.equal(done.result.artifacts[0].path, '/project/app.apk');
  assert.equal(done.job.status, 'completed');
  assert.equal(mergeJobFrame(done, { job: { id: 'foreign' } }), done);
});

test('job frame handles overlapping UTF8 chunks and preserves result on null refresh', () => {
  const current = { job: { id: 'android-1' }, output: '构建', cursor: 6, result: { verified: true }, lossy: false };
  const next = mergeJobFrame(current, { job: current.job, output: { chunks: [{ at: 0, text: '构建完成' }], next: 12 }, result: null });
  assert.equal(next.output, '构建完成');
  assert.deepEqual(next.result, { verified: true });
  const limited = mergeJobFrame({}, { output: { chunks: [{ text: 'x'.repeat(UI_OUTPUT_LIMIT + 5) }], next: UI_OUTPUT_LIMIT + 5 } });
  assert.equal(limited.output.length, UI_OUTPUT_LIMIT);
  assert.equal(limited.lossy, true);
});
