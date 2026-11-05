import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AndroidWorkbench } from './android.js';

const SAFE = 'Bugly_off_Jiagu_off_Debug';
const APP = 'com.example.built';
const DEVICE = 'usb-123';
const ok = (stdout = '', stderr = '') => ({ exitCode: 0, stdout, stderr });
const deviceList = (state = 'device') => `List of devices attached\n${DEVICE}\t${state} product:fixture model:Test_Phone transport_id:7\nsecond-device\tdevice product:other model:Other transport_id:8\n`;

async function fixture(t: any, build = 'plugins { id("com.android.application"); id("com.teyes.bugly.symbol"); id("com.teyes.kiwisec") }\nandroid { buildTypes { getByName("debug") {} } }'): Promise<any> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'android-workbench-test-'));
  const root = path.join(base, 'project');
  await fs.mkdir(root);
  t.after(async () => {
    const resolved = path.resolve(base);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.match(path.basename(resolved), /^android-workbench-test-/);
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const put = async (name: string, content = '') => {
    const file = path.resolve(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
    return file;
  };
  await put('settings.gradle.kts', 'include(":app-hanna")');
  await put('app-hanna/build.gradle.kts', build);
  await put('gradlew', 'never executed');
  const calls: any[] = [];
  let onCall: any;
  const run = async (argv: any[], options: any) => {
    calls.push({ argv: [...argv], options });
    assert.equal(options.cwd, root);
    assert.ok(Array.isArray(argv));
    assert.ok(argv.every(v => typeof v === 'string'));
    assert.ok(options.timeoutMs > 0);
    if (onCall) {
      const result = await onCall(argv, options);
      if (result !== undefined) return result;
    }
    if (argv[1] === 'devices') return ok(deviceList());
    if (argv.includes('resolve-activity')) return ok(`${APP}/.MainActivity\n`);
    if (argv.includes('start')) return ok(`Starting: Intent { cmp=${APP}/.MainActivity }\nStatus: ok\n`);
    if (path.basename(argv[0]) === 'zipalign' && !argv.includes('-c')) { await fs.copyFile(argv.at(-2)!, argv.at(-1)!); return ok(); }
    if (path.basename(argv[0]) === 'apksigner' && argv[1] === 'sign') { await fs.copyFile(argv.at(-1)!, argv[argv.indexOf('--out') + 1]); return ok(); }
    if (path.basename(argv[0]) === 'jarsigner' && argv.includes('-signedjar')) { await fs.copyFile(argv.at(-2)!, argv[argv.indexOf('-signedjar') + 1]); return ok(); }
    if (path.basename(argv[0]) === 'jarsigner' && argv.includes('-verify')) return ok('jar verified.\nWarning: self-signed certificate.');
    return ok('Success');
  };
  const env = { PATH: '/fixture/bin' };
  const core = (extra?: Record<string, string>) => new AndroidWorkbench({ root, run, env: { ...env, ...extra } });
  const apk = async ({ variant = 'bugly_off_Jiagu_off_Debug', names = ['app-hanna-bugly_off_-jiagu_off_-debug.apk'], folder = 'bugly_off_Jiagu_off_/debug', applicationId = APP, metadata = {} }: { variant?: string; names?: string[]; folder?: string; applicationId?: string; metadata?: Record<string, any> } = {}) => {
    const directory = `app-hanna/build/outputs/apk/${folder}`;
    for (const name of names) await put(`${directory}/${name}`, `APK-${name}`);
    const metaPath = await put(`${directory}/output-metadata.json`, JSON.stringify({ version: 3, artifactType: { type: 'APK' }, applicationId, variantName: variant, elements: names.map(outputFile => ({ outputFile, filters: [] })), ...metadata }));
    return { metadata: metaPath, paths: names.map(name => path.resolve(root, directory, name)) };
  };
  const signing = async (format = 'apk') => {
    await put(`unsigned.${format}`, 'original archive');
    await fs.writeFile(path.join(base, 'outside.keystore'), 'fake read-only keystore');
    await put('sdk/build-tools/35.0.0/zipalign');
    await put('sdk/build-tools/35.0.0/apksigner');
    return {
      action: 'sign', artifact: `unsigned.${format}`, output: `signed/result.${format}`, keystore: path.join(base, 'outside.keystore'), alias: 'release-key',
      storePasswordEnv: 'ANDROID_STORE_PASSWORD', keyPasswordEnv: 'ANDROID_KEY_PASSWORD',
    };
  };
  return { base, root, put, calls, core, apk, signing, set onCall(value: any) { onCall = value; } };
}

const rejectsCode = (promise: any, code: any) => assert.rejects(promise, (error: any) => error.code === code);

test('static settings/catalog discovery recognizes included Apps, literal dimensions, remaps, comments, and build types without runner', async t => {
  const f = await fixture(t);
  await f.put('settings.gradle.kts', `
    // include(":commented")
    include(":apps:demo", ":lib", ":vendor:excluded")
    project(":apps:demo").projectDir = file("applications/demo")
    includeBuild("composite")
  `);
  await f.put('gradle/libs.versions.toml', '[plugins]\nandroid-app = { id = "com.android.application", version = "9" }\n');
  await f.put('applications/demo/build.gradle.kts', `
    plugins { alias(libs.plugins.android.app) }
    android {
      flavorDimensions += listOf("channel", "server")
      productFlavors {
        create("free") { dimension = "channel" }
        create("paid") { dimension = "channel" }
        create("local") { dimension = "server" }
        create("remote") { dimension = "server" }
      }
      buildTypes { getByName("debug") {}; create("benchmark") {} }
    }
  `);
  await f.put('lib/build.gradle.kts', 'plugins { id("com.android.library") }');
  await f.put('vendor/excluded/build.gradle.kts', 'plugins { id("com.android.application") }');
  await f.put('not-included/build.gradle.kts', 'plugins { id("com.android.application") }');
  const result = await f.core().execute({ action: 'project' });
  assert.equal(result.root, f.root);
  assert.equal(result.modules.length, 1);
  const module = result.modules[0];
  assert.deepEqual(Object.keys(module).sort(), ['defaultVariant', 'directory', 'path', 'variants']);
  assert.equal(module.path, ':apps:demo');
  assert.equal(module.directory, path.join(f.root, 'applications/demo'));
  assert.ok(module.variants.includes('FreeLocalDebug'));
  assert.ok(module.variants.includes('PaidRemoteBenchmark'));
  assert.equal(module.variants.length, 12);
  assert.equal(module.defaultVariant, 'FreeLocalDebug');
  assert.ok(result.warnings.some((w: any) => /Static inference/.test(w)));
  assert.ok(result.warnings.some((w: any) => /Composite/.test(w)));
  assert.equal(f.calls.length, 0);
});

test('Groovy application plugin, includes and new File remapping are supported', async t => {
  const f = await fixture(t);
  await f.put('settings.gradle.kts', `include ':demo', ':commented'\nproject(':demo').projectDir = new File(rootDir, 'nested/demo')`);
  await f.put('nested/demo/build.gradle', `apply plugin: 'com.android.application'\nandroid { flavorDimensions 'tier'\nproductFlavors { free { dimension 'tier' }; paid { dimension 'tier' } }\nbuildTypes { debug {}; release {} } }`);
  const result = await f.core().execute({ action: 'project' });
  assert.equal(result.modules[0].path, ':demo');
  assert.deepEqual(result.modules[0].variants, ['FreeDebug', 'FreeRelease', 'PaidDebug', 'PaidRelease']);
  assert.equal(f.calls.length, 0);
});

test('Teyes convention plugin chooses explicit safe default, never aggregate Debug', async t => {
  const f = await fixture(t);
  const { modules, warnings } = await f.core().execute({ action: 'project' });
  assert.equal(modules[0].defaultVariant, SAFE);
  assert.deepEqual(modules[0].variants, [SAFE, 'Bugly_off_Jiagu_off_Release']);
  assert.ok(warnings.some((w: any) => /convention-plugin/.test(w)));
  for (const action of ['run', 'build']) {
    await rejectsCode(f.core().execute({ action, variant: 'Debug', serial: DEVICE }), 'UNSAFE_VARIANT');
  }
  assert.equal(f.calls.length, 0);
});

test('static scanner rejects escaping remaps and symlink modules, ignores computed includes', async t => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.base, 'escape'));
  await fs.symlink(path.join(f.base, 'escape'), path.join(f.root, 'linked'));
  await f.put('settings.gradle.kts', 'include(":escape", ":linked")\ninclude(":${dynamic}")\nproject(":escape").projectDir = file("../escape")');
  const result = await f.core().execute({ action: 'project' });
  assert.deepEqual(result.modules, []);
  assert.ok(result.warnings.some((w: any) => /Unsafe module/.test(w)));
  assert.ok(result.warnings.some((w: any) => /computed include/.test(w)));
  assert.equal(f.calls.length, 0);
});

test('computed flavor declarations do not turn into fabricated variants', async t => {
  const f = await fixture(t, 'plugins { id("com.android.application") }\nandroid { productFlavors { channels.forEach { create(it) {} } } }');
  const result = await f.core().execute({ action: 'project' });
  assert.deepEqual(result.modules[0].variants, []);
  assert.ok(result.warnings.some((w: any) => /computed product flavors/.test(w)));
});

test('devices parser returns exact stable JSON fields for online, offline and unauthorized devices', async t => {
  const f = await fixture(t);
  f.onCall = (argv: any) => argv[1] === 'devices' ? ok(`* daemon started successfully *\nList of devices attached\n${DEVICE}\tdevice product:fixture model:Test_Phone transport_id:7\noffline-usb\toffline\nunauthorized-usb\tunauthorized usb:1-2\n`) : undefined;
  const result = await f.core().execute({ action: 'devices' });
  assert.deepEqual(result.devices, [
    { serial: DEVICE, state: 'device', model: 'Test_Phone', product: 'fixture', transportId: '7' },
    { serial: 'offline-usb', state: 'offline', model: null, product: null, transportId: null },
    { serial: 'unauthorized-usb', state: 'unauthorized', model: null, product: null, transportId: null },
  ]);
  assert.deepEqual(f.calls[0].argv, ['adb', 'devices', '-l']);
});

test('strict validation rejects shell injection, unknown arguments, raw password and global disconnect before runner', async t => {
  const f = await fixture(t);
  const invalid = [
    { action: 'shell', command: 'id' }, { action: 'devices', extra: 'ignored?' },
    { action: 'run', module: ':app;id', serial: DEVICE }, { action: 'run', variant: 'Debug --init-script evil', serial: DEVICE },
    { action: 'stop', serial: DEVICE, packageName: 'com.example;reboot' },
    { action: 'stop', serial: 'usb;reboot', packageName: APP }, { action: 'logcat', serial: '-d' },
    { action: 'disconnect' }, { action: 'connect', address: 'host:5555;reboot' },
    { action: 'connect', address: '--help:5555' }, { action: 'connect', address: 'host:0' },
    { action: 'connect', address: 'host:65536' }, { action: 'pair', address: 'host:5555', pairingCodeEnv: 'HOME' },
    { action: 'pair', address: 'host:5555', pairingCodeEnv: 'ANDROID_BAD;CODE' },
    { action: 'build', format: 'zip' }, { action: 'build', skipResource: 'true' },
    { action: 'sign', storePassword: 'plaintext' },
  ];
  for (const args of invalid) await assert.rejects(f.core().execute(args), { code: 'INVALID_INPUT' });
  assert.equal(f.calls.length, 0);
});

test('wireless operations require one explicit address; pair secret uses only stdin and is redacted across chunk boundaries', async t => {
  const f = await fixture(t);
  const output: string[] = [];
  f.onCall = (argv: any, options: any) => {
    if (argv[1] === 'pair') {
      options.onOutput({ stream: 'stdout', text: 'code=12' });
      options.onOutput({ stream: 'stdout', text: '3456 done' });
      options.onOutput({ stream: 'stderr', text: '123456' });
      return ok('Successfully paired; echoed 123456', '123456');
    }
  };
  const core = f.core({ ANDROID_PAIRING_CODE: '123456' });
  await core.execute({ action: 'connect', address: '192.168.1.7:5555' });
  await core.execute({ action: 'disconnect', address: '[::1]:5555' });
  const result = await core.execute({ action: 'pair', address: 'phone.local:37123', pairingCodeEnv: 'ANDROID_PAIRING_CODE' }, { onOutput: (event: any) => output.push(event.text) });
  assert.deepEqual(f.calls.map((c: any) => c.argv), [
    ['adb', 'connect', '192.168.1.7:5555'], ['adb', 'disconnect', '[::1]:5555'], ['adb', 'pair', 'phone.local:37123'],
  ]);
  assert.equal(f.calls[2].options.stdin, '123456\n');
  assert.ok(!JSON.stringify(f.calls.map((c: any) => c.argv)).includes('123456'));
  assert.ok(!JSON.stringify(result).includes('123456'));
  assert.ok(!output.join('').includes('123456'));
  assert.match(output.join(''), /REDACTED/);
});

test('missing pairing environment and invalid code never invoke adb', async t => {
  const f = await fixture(t);
  await rejectsCode(f.core().execute({ action: 'pair', address: 'host:5555', pairingCodeEnv: 'ANDROID_PAIR' }), 'MISSING_SECRET');
  await rejectsCode(f.core({ ANDROID_PAIR: '12a456' }).execute({ action: 'pair', address: 'host:5555', pairingCodeEnv: 'ANDROID_PAIR' }), 'INVALID_INPUT');
  assert.equal(f.calls.length, 0);
});

test('logcat is bounded and does not clear logs; uninstall and stop use strict packages and explicit serial', async t => {
  const f = await fixture(t);
  await f.core().execute({ action: 'logcat', serial: DEVICE });
  await f.core().execute({ action: 'uninstall', serial: DEVICE, packageName: APP });
  await f.core().execute({ action: 'stop', serial: DEVICE, packageName: APP });
  const commands = f.calls.filter((c: any) => c.argv.includes('-s')).map((c: any) => c.argv);
  assert.deepEqual(commands, [
    ['adb', '-s', DEVICE, 'logcat', '-d', '-t', '200'],
    ['adb', '-s', DEVICE, 'uninstall', APP],
    ['adb', '-s', DEVICE, 'shell', 'am', 'force-stop', APP],
  ]);
});

test('install accepts exactly one explicit in-root APK and requires an online selected device', async t => {
  const f = await fixture(t);
  const file = await f.put('packages/my application.apk', 'apk');
  await f.core().execute({ action: 'install', serial: DEVICE, apk: 'packages/my application.apk' });
  assert.deepEqual(f.calls.at(-1).argv, ['adb', '-s', DEVICE, 'install', '-r', file]);
  await rejectsCode(f.core().execute({ action: 'install', apk: 'packages/my application.apk' }), 'INVALID_INPUT');
  await f.put('not-apk.txt', 'text');
  await rejectsCode(f.core().execute({ action: 'install', serial: DEVICE, apk: 'not-apk.txt' }), 'INVALID_INPUT');
  f.onCall = (argv: any) => argv[1] === 'devices' ? ok(deviceList('offline')) : undefined;
  await rejectsCode(f.core().execute({ action: 'install', serial: DEVICE, apk: file }), 'DEVICE_UNAVAILABLE');
});

test('APK input traversal and symlink escapes are rejected without running tools', async t => {
  const f = await fixture(t);
  const external = path.join(f.base, 'outside.apk');
  await fs.writeFile(external, 'outside');
  await fs.symlink(external, path.join(f.root, 'linked.apk'));
  for (const apk of ['../outside.apk', external, 'linked.apk']) await rejectsCode(f.core().execute({ action: 'install', apk, serial: DEVICE }), 'PATH_ESCAPE');
  assert.equal(f.calls.length, 0);
});

test('safe off/off default run builds exact task, validates fresh metadata applicationId, installs and resolves launcher', async t => {
  const f = await fixture(t);
  let produced: any;
  f.onCall = async (argv: any) => {
    if (argv[0] === path.join(f.root, 'gradlew')) { produced = await f.apk(); return ok('BUILD SUCCESSFUL'); }
  };
  const controller = new AbortController();
  const result = await f.core().execute({ action: 'run', serial: DEVICE }, { signal: controller.signal });
  const gradle = f.calls.find((c: any) => c.argv[0].endsWith('/gradlew'));
  assert.deepEqual(gradle.argv, [path.join(f.root, 'gradlew'), ':app-hanna:assembleBugly_off_Jiagu_off_Debug', '--console=plain', '--no-daemon']);
  assert.equal(gradle.options.signal, controller.signal);
  assert.equal(gradle.options.timeoutMs, 1_800_000);
  assert.equal(result.applicationId, APP);
  assert.equal(result.component, `${APP}/.MainActivity`);
  assert.equal(result.installed, true);
  assert.equal(result.launched, true);
  assert.equal(result.artifacts[0].fresh, true);
  assert.equal(result.artifacts[0].metadata, produced.metadata);
  assert.deepEqual(f.calls.find((c: any) => c.argv.includes('install')).argv, ['adb', '-s', DEVICE, 'install', '-r', produced.paths[0]]);
  assert.deepEqual(f.calls.find((c: any) => c.argv.includes('resolve-activity')).argv, ['adb', '-s', DEVICE, 'shell', 'pm', 'resolve-activity', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', APP]);
  assert.deepEqual(f.calls.at(-1).argv, ['adb', '-s', DEVICE, 'shell', 'am', 'start', '-W', '-n', `${APP}/.MainActivity`]);
  assert.ok(!f.calls.some((c: any) => c.argv.includes('monkey')));
});

test('manual full safe variant is supported and skipResource is only an explicit exclusion', async t => {
  const f = await fixture(t);
  const variant = 'CompanyFooBugly_off_Jiagu_off_Debug';
  f.onCall = async (argv: any) => { if (argv[0].endsWith('/gradlew')) { await f.apk({ variant: 'companyFooBugly_off_Jiagu_off_Debug' }); return ok(); } };
  await f.core().execute({ action: 'build', variant, skipResource: true });
  assert.deepEqual(f.calls[0].argv, [path.join(f.root, 'gradlew'), ':app-hanna:assemble' + variant, '--console=plain', '--no-daemon', '-x', ':app-hanna:generateTeyesResourceMain']);
  assert.equal(f.calls.length, 1);
});

test('all upload/hardening variants are forbidden for both run and build and release is never auto-installed', async t => {
  const f = await fixture(t);
  for (const action of ['run', 'build']) {
    for (const variant of ['Bugly_on_Jiagu_off_Debug', 'Bugly_off_Jiagu_on_Debug', 'Bugly_on_Jiagu_on_Release', 'Bugly_OFF_Bugly_on_Jiagu_off_Debug', 'Bugly_custom_Jiagu_off_Debug']) {
      await rejectsCode(f.core().execute({ action, variant, serial: DEVICE }), 'UNSAFE_VARIANT');
    }
  }
  await rejectsCode(f.core().execute({ action: 'run', variant: 'Bugly_off_Jiagu_off_Release', serial: DEVICE }), 'UNSAFE_VARIANT');
  assert.equal(f.calls.length, 0);
});

test('safe release build may return artifacts but never installs', async t => {
  const f = await fixture(t);
  f.onCall = async (argv: any) => { if (argv[0].endsWith('/gradlew')) { await f.apk({ variant: 'bugly_off_Jiagu_off_Release', folder: 'safe/release' }); return ok(); } };
  const result = await f.core().execute({ action: 'build', variant: 'Bugly_off_Jiagu_off_Release' });
  assert.equal(result.artifacts.length, 1);
  assert.equal(f.calls.length, 1);
  assert.ok(f.calls[0].argv[1].endsWith('Release'));
});

test('unchanged historical metadata and APKs are never reused even if future-dated', async t => {
  const f = await fixture(t);
  const previous = await f.apk();
  const future = new Date(Date.now() + 86400_000);
  for (const file of [...previous.paths, previous.metadata]) await fs.utimes(file, future, future);
  await rejectsCode(f.core().execute({ action: 'run', serial: DEVICE }), 'NO_FRESH_ARTIFACT');
  assert.ok(!f.calls.some((c: any) => c.argv.includes('install')));
});

test('rewritten metadata alone does not make an old APK fresh', async t => {
  const f = await fixture(t);
  const previous = await f.apk();
  const original = await fs.readFile(previous.metadata, 'utf8');
  f.onCall = async (argv: any) => { if (argv[0].endsWith('/gradlew')) { await fs.writeFile(previous.metadata, original + '\n'); return ok(); } };
  await rejectsCode(f.core().execute({ action: 'build' }), 'NO_FRESH_ARTIFACT');
});

test('wrong variant, hardened APKs and missing fresh matching outputs fail instead of choosing newest', async t => {
  for (const mode of ['wrong', 'hardened']) {
    await t.test(mode, async sub => {
      const f = await fixture(sub);
      f.onCall = async (argv: any) => {
        if (argv[0].endsWith('/gradlew')) { await f.apk(mode === 'wrong' ? { variant: 'someOtherDebug' } : { names: ['base-jiagu_signed.apk'] }); return ok(); }
      };
      await rejectsCode(f.core().execute({ action: 'run', serial: DEVICE }), 'NO_FRESH_ARTIFACT');
      assert.ok(!f.calls.some((c: any) => c.argv.includes('install')));
    });
  }
});

test('real AGP jiagu_off filenames survive artifacts/build/run while terminal hardened suffixes are excluded', async t => {
  const normal = 'app-hanna-bugly_off_-jiagu_off_-debug.apk';
  const hardened = ['bugly_off_Jiagu_off_Debug-jiagu.apk', 'bugly_off_Jiagu_off_Debug-jiagu_signed.apk', 'bugly_off_Jiagu_off_Debug-jiagu.signed.apk'];
  for (const action of ['artifacts', 'build', 'run']) {
    await t.test(action, async sub => {
      const f = await fixture(sub);
      const produce = () => f.apk({ names: [normal, ...hardened] });
      if (action === 'artifacts') await produce();
      else f.onCall = async (argv: any) => { if (argv[0].endsWith('/gradlew')) { await produce(); return ok(); } };
      const result = await f.core().execute({ action, variant: SAFE, ...(action === 'run' ? { serial: DEVICE } : {}) });
      assert.deepEqual(result.artifacts.map((a: any) => path.basename(a.path)), [normal]);
      if (action === 'artifacts') assert.equal(f.calls.length, 0);
      if (action === 'run') {
        assert.equal(result.launched, true);
        const installation = f.calls.find((c: any) => c.argv.includes('install'));
        assert.equal(path.basename(installation.argv.at(-1)), normal);
        assert.ok(!f.calls.some((c: any) => c.argv.includes('install-multiple')));
      }
    });
  }
});

test('split APK sets use install-multiple with all fresh non-jiagu outputs', async t => {
  const f = await fixture(t);
  let produced: any;
  f.onCall = async (argv: any) => { if (argv[0].endsWith('/gradlew')) { produced = await f.apk({ names: ['base.apk', 'split-arm64.apk', 'base-jiagu.apk'] }); return ok(); } };
  const result = await f.core().execute({ action: 'run', serial: DEVICE });
  assert.equal(result.artifacts.length, 2);
  assert.deepEqual(f.calls.find((c: any) => c.argv.includes('install-multiple')).argv, ['adb', '-s', DEVICE, 'install-multiple', '-r', ...produced.paths.slice(0, 2)]);
});

test('partial freshness in a split APK set cannot be installed', async t => {
  const f = await fixture(t);
  const previous = await f.apk({ names: ['base.apk', 'split-arm64.apk'] });
  f.onCall = async (argv: any) => {
    if (argv[0].endsWith('/gradlew')) {
      await fs.writeFile(previous.paths[0], 'fresh base');
      const metadata = JSON.parse(await fs.readFile(previous.metadata, 'utf8'));
      await fs.writeFile(previous.metadata, JSON.stringify({ ...metadata, invocation: 2 }));
      return ok();
    }
  };
  await rejectsCode(f.core().execute({ action: 'run', serial: DEVICE }), 'NO_FRESH_ARTIFACT');
  assert.ok(!f.calls.some((c: any) => c.argv.includes('install-multiple')));
});

test('ambiguous fresh APK metadata groups cannot be automatically installed', async t => {
  const f = await fixture(t);
  f.onCall = async (argv: any) => { if (argv[0].endsWith('/gradlew')) { await f.apk({ folder: 'one/debug' }); await f.apk({ folder: 'two/debug' }); return ok(); } };
  await rejectsCode(f.core().execute({ action: 'run', serial: DEVICE }), 'AMBIGUOUS_ARTIFACT');
});

test('metadata outputFile traversal, package injection, and build-output symlinks are rejected', async t => {
  for (const mode of ['traversal', 'package', 'symlink']) {
    await t.test(mode, async sub => {
      const f = await fixture(sub);
      f.onCall = async (argv: any) => {
        if (argv[0].endsWith('/gradlew')) {
          if (mode === 'traversal') await f.apk({ metadata: { elements: [{ outputFile: '../../../../elsewhere.apk' }] } });
          if (mode === 'package') await f.apk({ applicationId: 'com.example;reboot' });
          if (mode === 'symlink') {
            await fs.mkdir(path.join(f.root, 'app-hanna/build/outputs'), { recursive: true });
            await fs.symlink(f.base, path.join(f.root, 'app-hanna/build/outputs/apk'));
          }
          return ok();
        }
      };
      await assert.rejects(f.core().execute({ action: 'run', serial: DEVICE }));
      assert.ok(!f.calls.some((c: any) => c.argv.includes('install')));
    });
  }
});

test('pre-existing symlink build directory is rejected before Gradle', async t => {
  const f = await fixture(t);
  await fs.symlink(f.base, path.join(f.root, 'app-hanna/build'));
  await rejectsCode(f.core().execute({ action: 'build' }), 'PATH_ESCAPE');
  assert.equal(f.calls.length, 0);
});

test('no launcher, mismatched package or shell-metacharacter component never starts an activity', async t => {
  for (const launcher of ['No activity found\n', 'com.other/.MainActivity\n', `${APP}/.Main$IFS\n`]) {
    await t.test(launcher.trim(), async sub => {
      const f = await fixture(sub);
      f.onCall = async (argv: any) => {
        if (argv[0].endsWith('/gradlew')) { await f.apk(); return ok(); }
        if (argv.includes('resolve-activity')) return ok(launcher);
      };
      await rejectsCode(f.core().execute({ action: 'run', serial: DEVICE }), 'NO_LAUNCHER');
      assert.ok(!f.calls.some((c: any) => c.argv.includes('start')));
    });
  }
});

test('am start reported errors and unsuccessful status cannot report launch success', async t => {
  for (const launch of ['Error: activity missing\n', 'Status: timeout\n', '', 'Status: ok\nError: Permission denied\n']) {
    await t.test(JSON.stringify(launch), async sub => {
      const f = await fixture(sub);
      f.onCall = async (argv: any) => {
        if (argv[0].endsWith('/gradlew')) { await f.apk(); return ok(); }
        if (argv.includes('start')) return ok(launch);
      };
      await rejectsCode(f.core().execute({ action: 'run', serial: DEVICE }), 'LAUNCH_FAILED');
    });
  }
});

test('build only returns newly changed exact-variant AABs in standard bundle directory', async t => {
  const f = await fixture(t);
  const old = await f.put('app-hanna/build/outputs/bundle/bugly_off_Jiagu_off_Debug/old.aab', 'old');
  f.onCall = async (argv: any) => {
    if (argv[0].endsWith('/gradlew')) {
      await f.put('app-hanna/build/outputs/bundle/bugly_off_Jiagu_off_Debug/current.aab', 'fresh');
      await f.put('app-hanna/build/outputs/bundle/otherDebug/newer.aab', 'wrong variant');
      return ok();
    }
  };
  const result = await f.core().execute({ action: 'build', format: 'aab' });
  assert.deepEqual(result.artifacts.map((a: any) => path.basename(a.path)), ['current.aab']);
  assert.equal(result.artifacts[0].applicationId, null);
  assert.equal(result.artifacts[0].fresh, true);
  assert.equal(await fs.readFile(old, 'utf8'), 'old');
  assert.equal(f.calls[0].argv[1], ':app-hanna:bundle' + SAFE);
  assert.equal(f.calls.length, 1);
});

test('historical artifacts are explicit listings with fresh:false and no runner invocation', async t => {
  const f = await fixture(t);
  await f.apk();
  const result = await f.core().execute({ action: 'artifacts' });
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].fresh, false);
  assert.match(result.warnings[0], /Historical/);
  assert.equal(f.calls.length, 0);
});

test('SDK location reads only sdk.dir, decodes Java escaping and honors SDK environment fallback', async t => {
  const f = await fixture(t);
  await f.put('local.properties', 'other.password=not-output\nsdk.dir=sdk\\ with\\ spaces\n');
  await f.core({ ANDROID_HOME: '/ignored' }).execute({ action: 'devices' });
  assert.equal(f.calls[0].argv[0], path.join(f.root, 'sdk with spaces/platform-tools/adb'));
  const g = await fixture(t);
  await g.core({ ANDROID_SDK_ROOT: '/fixture/sdk' }).execute({ action: 'devices' });
  assert.equal(g.calls[0].argv[0], '/fixture/sdk/platform-tools/adb');
});

test('APK signing aligns, uses env-only credentials, verifies signature and alignment, and preserves input', async t => {
  const f = await fixture(t);
  const args = await f.signing('apk');
  const env = { ANDROID_HOME: path.join(f.root, 'sdk'), ANDROID_STORE_PASSWORD: 'store-super-secret', ANDROID_KEY_PASSWORD: 'key-super-secret' };
  const result = await f.core(env).execute(args);
  assert.equal(result.verified, true);
  assert.equal(result.output, path.join(f.root, args.output));
  assert.equal(await fs.readFile(result.output, 'utf8'), 'original archive');
  assert.equal(await fs.readFile(path.join(f.root, 'unsigned.apk'), 'utf8'), 'original archive');
  assert.deepEqual(f.calls.map((c: any) => [path.basename(c.argv[0]), c.argv[1]]), [['zipalign', '-P'], ['apksigner', 'sign'], ['apksigner', 'verify'], ['zipalign', '-c']]);
  const sign = f.calls[1];
  assert.equal(sign.argv[sign.argv.indexOf('--ks-pass') + 1], 'env:ANDROID_STORE_PASSWORD');
  assert.equal(sign.argv[sign.argv.indexOf('--key-pass') + 1], 'env:ANDROID_KEY_PASSWORD');
  assert.equal(sign.options.env.ANDROID_STORE_PASSWORD, env.ANDROID_STORE_PASSWORD);
  assert.equal(sign.options.env.ANDROID_KEY_PASSWORD, env.ANDROID_KEY_PASSWORD);
  assert.ok(!JSON.stringify(f.calls.map((c: any) => c.argv)).includes('super-secret'));
  assert.ok(!(await fs.readdir(f.root)).some(name => name.startsWith('.android-workbench-sign-')));
});

test('AAB signing uses jarsigner env refs and verifies before publishing', async t => {
  const f = await fixture(t);
  const args = await f.signing('aab');
  const result = await f.core({ JAVA_HOME: '/fixture/jdk', ANDROID_STORE_PASSWORD: 'store-secret', ANDROID_KEY_PASSWORD: 'key-secret' }).execute(args);
  assert.equal(result.verified, true);
  assert.equal(result.format, 'aab');
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].argv[0], '/fixture/jdk/bin/jarsigner');
  assert.ok(f.calls[0].argv.includes('-storepass:env'));
  assert.ok(f.calls[0].argv.includes('ANDROID_STORE_PASSWORD'));
  assert.ok(f.calls[0].argv.includes('-keypass:env'));
  assert.ok(!JSON.stringify(f.calls.map((c: any) => c.argv)).includes('store-secret'));
  assert.ok(f.calls[1].argv.includes('-verify'));
  assert.equal(f.calls[1].options.env.LC_ALL, 'C');
  assert.equal(await fs.readFile(path.join(f.root, 'unsigned.aab'), 'utf8'), 'original archive');
});

test('signing outputs reject overwrite, in-place, escaping paths and symlink parents without invoking tools', async t => {
  const f = await fixture(t);
  const args = await f.signing();
  const core = f.core({ ANDROID_HOME: path.join(f.root, 'sdk'), ANDROID_STORE_PASSWORD: 's3cret', ANDROID_KEY_PASSWORD: 's3cret2' });
  await f.put('exists.apk', 'must survive');
  await fs.symlink(f.base, path.join(f.root, 'outside-dir'));
  await fs.symlink(path.join(f.root, 'exists.apk'), path.join(f.root, 'linked.apk'));
  for (const output of ['exists.apk', 'unsigned.apk', '../outside.apk', 'outside-dir/new.apk', 'linked.apk']) await assert.rejects(core.execute({ ...args, output }));
  assert.equal(await fs.readFile(path.join(f.root, 'exists.apk'), 'utf8'), 'must survive');
  assert.equal(f.calls.length, 0);
});

test('signing credentials only accept ANDROID_* names and must exist', async t => {
  const f = await fixture(t);
  const args = await f.signing();
  await rejectsCode(f.core().execute({ ...args, storePasswordEnv: 'HOME' }), 'INVALID_INPUT');
  await rejectsCode(f.core().execute(args), 'MISSING_SECRET');
  await rejectsCode(f.core({ ANDROID_STORE_PASSWORD: 'store' }).execute(args), 'MISSING_SECRET');
  await rejectsCode(f.core({ ANDROID_STORE_PASSWORD: 'store', ANDROID_KEY_PASSWORD: 'key' }).execute({ ...args, alias: '-help' }), 'INVALID_INPUT');
  assert.equal(f.calls.length, 0);
});

test('signing diagnostics and runner exception messages redact all credential values', async t => {
  const f = await fixture(t);
  const args = await f.signing();
  const output: string[] = [];
  f.onCall = (argv: any, options: any) => {
    options.onOutput('store-');
    options.onOutput('secret key-secret');
    return { exitCode: 1, stdout: '', stderr: 'bad store-secret key-secret' };
  };
  await assert.rejects(f.core({ ANDROID_HOME: path.join(f.root, 'sdk'), ANDROID_STORE_PASSWORD: 'store-secret', ANDROID_KEY_PASSWORD: 'key-secret' }).execute(args, { onOutput: (e: any) => output.push(e.text) }), (error: any) => error.code === 'COMMAND_FAILED' && !/store-secret|key-secret/.test(error.message));
  assert.ok(!/store-secret|key-secret/.test(output.join('')));
  await assert.rejects(fs.stat(path.join(f.root, args.output)), { code: 'ENOENT' });
  assert.ok(!(await fs.readdir(f.root)).some(name => name.startsWith('.android-workbench-sign-')));
  f.onCall = () => { throw new Error('runner leaked store-secret'); };
  await assert.rejects(f.core({ ANDROID_HOME: path.join(f.root, 'sdk'), ANDROID_STORE_PASSWORD: 'store-secret', ANDROID_KEY_PASSWORD: 'key-secret' }).execute(args), (error: any) => error.code === 'RUNNER_FAILED' && !error.message.includes('store-secret'));
});

test('APK verification failure never publishes output or mutates input', async t => {
  const f = await fixture(t);
  const args = await f.signing();
  f.onCall = (argv: any) => argv[1] === 'verify' ? { exitCode: 1, stdout: '', stderr: 'DOES NOT VERIFY' } : undefined;
  await rejectsCode(f.core({ ANDROID_HOME: path.join(f.root, 'sdk'), ANDROID_STORE_PASSWORD: 'store', ANDROID_KEY_PASSWORD: 'key' }).execute(args), 'COMMAND_FAILED');
  await assert.rejects(fs.stat(path.join(f.root, args.output)), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(f.root, 'unsigned.apk'), 'utf8'), 'original archive');
});

test('unsigned AAB with jarsigner exit zero is not considered verified', async t => {
  const f = await fixture(t);
  const args = await f.signing('aab');
  f.onCall = (argv: any) => argv.includes('-verify') ? ok('jar is unsigned. (signatures missing or not parsable)') : undefined;
  await rejectsCode(f.core({ ANDROID_STORE_PASSWORD: 'store', ANDROID_KEY_PASSWORD: 'key' }).execute(args), 'SIGN_VERIFY_FAILED');
  await assert.rejects(fs.stat(path.join(f.root, args.output)), { code: 'ENOENT' });
});

test('exclusive signing publication refuses an output created while signing', async t => {
  const f = await fixture(t);
  const args = await f.signing('aab');
  f.onCall = async (argv: any) => {
    if (argv.includes('-verify')) { await f.put(args.output, 'concurrent writer'); return ok('jar verified.'); }
  };
  await rejectsCode(f.core({ ANDROID_STORE_PASSWORD: 'store', ANDROID_KEY_PASSWORD: 'key' }).execute(args), 'OUTPUT_EXISTS');
  assert.equal(await fs.readFile(path.join(f.root, args.output), 'utf8'), 'concurrent writer');
});

test('cancellation is propagated before any work and between commands without fallback', async t => {
  const f = await fixture(t);
  const first = new AbortController();
  first.abort();
  await assert.rejects(f.core().execute({ action: 'devices' }, { signal: first.signal }), { name: 'AbortError' });
  assert.equal(f.calls.length, 0);
  const second = new AbortController();
  f.onCall = (argv: any) => { if (argv[1] === 'devices') { second.abort(); return ok(deviceList()); } };
  await assert.rejects(f.core().execute({ action: 'run', serial: DEVICE }, { signal: second.signal }), { name: 'AbortError' });
  assert.equal(f.calls.length, 1);
});

test('nonzero Gradle exit never triggers install even with old outputs', async t => {
  const f = await fixture(t);
  await f.apk();
  f.onCall = (argv: any) => argv[0].endsWith('/gradlew') ? { exitCode: 1, stdout: '', stderr: 'build failed' } : undefined;
  await rejectsCode(f.core().execute({ action: 'run', serial: DEVICE }), 'COMMAND_FAILED');
  assert.ok(!f.calls.some((c: any) => c.argv.includes('install')));
});

test('plugin declarations with apply false are not Android application modules', async t => {
  const f = await fixture(t);
  await f.put('settings.gradle.kts', 'include(":id-only", ":alias-only", ":applied")');
  await f.put('gradle/libs.versions.toml', '[plugins]\nandroid-app = { id = "com.android.application", version = "9" }');
  await f.put('id-only/build.gradle.kts', 'plugins { id("com.android.application") version "9" apply false }');
  await f.put('alias-only/build.gradle.kts', 'plugins { alias(libs.plugins.android.app) apply false }');
  await f.put('applied/build.gradle.kts', 'plugins { id("com.android.library") apply false; alias(libs.plugins.android.app) }');
  const result = await f.core().execute({ action: 'project' });
  assert.deepEqual(result.modules.map((m: any) => m.path), [':applied']);
});

test('historical metadata adds an explicitly warned candidate but never enables upload variants', async t => {
  const f = await fixture(t);
  await f.apk({ variant: 'bugly_off_Jiagu_off_HistoricalDebug' });
  const result = await f.core().execute({ action: 'project' });
  assert.ok(result.modules[0].variants.includes('Bugly_off_Jiagu_off_HistoricalDebug'));
  assert.equal(result.modules[0].defaultVariant, SAFE);
  assert.ok(result.warnings.some((w: any) => /historical APK metadata/.test(w)));
  assert.equal(f.calls.length, 0);
});

test('Teyes off/off candidates preserve literal company/audio/command dimensions', async t => {
  const f = await fixture(t, `plugins { id("com.teyes.bugly.symbol"); id("com.teyes.kiwisec"); id("com.android.application") }
    android { flavorDimensions += listOf("company", "audio", "command")
      productFlavors { create("txz_") { dimension = "company" }; create("audio_1_") { dimension = "audio" }; create("command_empty_") { dimension = "command" } }
    }`);
  const result = await f.core().execute({ action: 'project' });
  assert.equal(result.modules[0].defaultVariant, 'Bugly_off_Jiagu_off_Txz_Audio_1_Command_empty_Debug');
  assert.ok(!result.modules[0].variants.includes(SAFE));
});

test('exact current assemble or package UP-TO-DATE evidence permits honest cached run', async t => {
  for (const task of ['assemble', 'package']) {
    await t.test(task, async sub => {
      const f = await fixture(sub);
      await f.apk();
      f.onCall = (argv: any) => argv[0].endsWith('/gradlew') ? ok(`> Task :app-hanna:${task}${SAFE} UP-TO-DATE\nBUILD SUCCESSFUL`) : undefined;
      const result = await f.core().execute({ action: 'run', serial: DEVICE });
      assert.equal(result.artifacts[0].fresh, false);
      assert.equal(result.artifacts[0].reused, true);
      assert.ok(result.warnings.some((w: any) => /UP-TO-DATE/.test(w)));
      assert.equal(result.launched, true);
    });
  }
});

test('non-exact, unrelated, FROM-CACHE or fake-prefix task lines never authorize historical reuse', async t => {
  const badEvidence = [
    `> Task :app-hanna:assembleDebug UP-TO-DATE`,
    `> Task :other:assemble${SAFE} UP-TO-DATE`,
    `> Task :app-hanna:assemble${SAFE} FROM-CACHE`,
    `message: > Task :app-hanna:assemble${SAFE} UP-TO-DATE`,
    `> Task :app-hanna:compile${SAFE}Kotlin UP-TO-DATE`,
    `> Task :app-hanna:assemble${SAFE} UP-TO-DATE extra`,
  ];
  for (const evidence of badEvidence) {
    await t.test(evidence, async sub => {
      const f = await fixture(sub);
      await f.apk();
      f.onCall = (argv: any) => argv[0].endsWith('/gradlew') ? ok(evidence) : undefined;
      await rejectsCode(f.core().execute({ action: 'run', serial: DEVICE }), 'NO_FRESH_ARTIFACT');
      assert.ok(!f.calls.some((c: any) => c.argv.includes('install')));
    });
  }
});

test('filtered ABI/density multi-APK outputs are not mistaken for install-multiple config splits', async t => {
  const f = await fixture(t);
  f.onCall = async (argv: any) => {
    if (argv[0].endsWith('/gradlew')) {
      await f.apk({ names: ['arm64.apk', 'x86.apk'], metadata: { elements: [
        { outputFile: 'arm64.apk', filters: [{ filterType: 'ABI', value: 'arm64-v8a' }] },
        { outputFile: 'x86.apk', filters: [{ filterType: 'ABI', value: 'x86_64' }] },
      ] } });
      return ok();
    }
  };
  await rejectsCode(f.core().execute({ action: 'run', serial: DEVICE }), 'UNSUPPORTED_APK_SET');
  assert.ok(!f.calls.some((c: any) => c.argv.includes('install-multiple')));
});

test('matching metadata must explicitly identify an APK artifact', async t => {
  const f = await fixture(t);
  f.onCall = async (argv: any) => { if (argv[0].endsWith('/gradlew')) { await f.apk({ metadata: { artifactType: { type: 'AAR' } } }); return ok(); } };
  await rejectsCode(f.core().execute({ action: 'build' }), 'INVALID_ARTIFACT');
});

test('APK signing defaults to named ANDROID_STORE_PASSWORD and ANDROID_KEY_PASSWORD and 16KB alignment', async t => {
  const f = await fixture(t);
  const args = await f.signing();
  delete args.storePasswordEnv;
  delete args.keyPasswordEnv;
  await f.core({ ANDROID_HOME: path.join(f.root, 'sdk'), ANDROID_STORE_PASSWORD: 'store-default', ANDROID_KEY_PASSWORD: 'key-default' }).execute(args);
  assert.deepEqual(f.calls[0].argv.slice(1, 4), ['-P', '16', '4']);
  assert.ok(f.calls[1].argv.includes('env:ANDROID_STORE_PASSWORD'));
  assert.ok(f.calls[1].argv.includes('env:ANDROID_KEY_PASSWORD'));
  assert.deepEqual(f.calls.at(-1).argv.slice(1, 5), ['-c', '-P', '16', '4']);
});

test('SDK tools that reject 16KB alignment fail explicitly without weakening alignment', async t => {
  const f = await fixture(t);
  const args = await f.signing();
  f.onCall = (argv: any) => path.basename(argv[0]) === 'zipalign' ? { exitCode: 1, stdout: '', stderr: 'unknown option -P' } : undefined;
  await rejectsCode(f.core({ ANDROID_HOME: path.join(f.root, 'sdk'), ANDROID_STORE_PASSWORD: 'store', ANDROID_KEY_PASSWORD: 'key' }).execute(args), 'COMMAND_FAILED');
  assert.equal(f.calls.length, 1);
  await assert.rejects(fs.stat(path.join(f.root, args.output)), { code: 'ENOENT' });
});

test('project text and output tree limits prevent unbounded scanning', async t => {
  const f = await fixture(t);
  await f.put('settings.gradle.kts', ' '.repeat(1024 * 1024 + 1));
  await rejectsCode(f.core().execute({ action: 'project' }), 'SCAN_LIMIT');
  assert.equal(f.calls.length, 0);
  const g = await fixture(t);
  await g.put('app-hanna/build/outputs/apk/' + 'nested/'.repeat(12) + 'unused.txt', 'x');
  await rejectsCode(g.core().execute({ action: 'build' }), 'SCAN_LIMIT');
  assert.equal(g.calls.length, 0);
});

test('stream redaction handles overlapping password prefixes without revealing the longer suffix', async t => {
  const f = await fixture(t);
  const output: string[] = [];
  f.onCall = (argv: any, options: any) => {
    if (argv[1] === 'devices') return undefined;
    options.onOutput('abc');
    options.onOutput('def');
    return ok('abcdef');
  };
  const result = await f.core({ ANDROID_STORE_PASSWORD: 'abc', ANDROID_KEY_PASSWORD: 'abcdef' }).execute({ action: 'logcat', serial: DEVICE }, { onOutput: (e: any) => output.push(e.text) });
  assert.equal(output.join(''), '[REDACTED]');
  assert.equal(result.stdout, '[REDACTED]');
});

test('log output redacts sensitive ANDROID_* variables even for non-sign actions', async t => {
  const f = await fixture(t);
  const output: string[] = [];
  f.onCall = (argv: any, options: any) => { if (argv[1] === 'devices') return undefined; options.onOutput('not-for-logs'); return ok('not-for-logs'); };
  const result = await f.core({ ANDROID_STORE_PASSWORD: 'not-for-logs' }).execute({ action: 'logcat', serial: DEVICE }, { onOutput: (e: any) => output.push(e.text) });
  assert.ok(!JSON.stringify(result).includes('not-for-logs'));
  assert.ok(!output.join('').includes('not-for-logs'));
});

test('sync lists real Gradle variants without executing assemble and filters on-flavors', async t => {
  const project = await fixture(t);
  project.onCall = (argv: any) => {
    assert.equal(path.basename(argv[0]), 'gradlew');
    assert.deepEqual(argv.slice(1), [':app-hanna:tasks', '--all', '-q', '--console=plain']);
    return ok([
      'app-hanna:assembleBugly_off_Jiagu_off_Debug',
      'app-hanna:assembleBugly_off_Jiagu_off_Release',
      'app-hanna:bundleBugly_off_Jiagu_off_Debug',
      'app-hanna:assembleBugly_on_Jiagu_on_Release',
      'app-hanna:installBugly_off_Jiagu_off_Debug',
    ].join('\n'));
  };
  const value = await project.core().execute({ action: 'sync', module: ':app-hanna' });
  assert.equal(value.action, 'sync');
  assert.equal(value.module, ':app-hanna');
  assert.deepEqual(value.variants, ['Bugly_off_Jiagu_off_Debug', 'Bugly_off_Jiagu_off_Release']);
  assert.deepEqual(value.refused, ['Bugly_on_Jiagu_on_Release']);
  assert.equal(value.tasks, 3);
});

test('sync without a module lists the whole project and refuses a missing wrapper', async t => {
  const project = await fixture(t);
  project.onCall = (argv: any) => { assert.deepEqual(argv.slice(1), ['tasks', '--all', '-q', '--console=plain']); return ok('assembleDebug\nassembleRelease\n'); };
  const value = await project.core().execute({ action: 'sync' });
  assert.equal(value.module, null);
  assert.deepEqual(value.variants, ['Debug', 'Release']);

  await fs.rm(path.join(project.root, 'gradlew'), { force: true });
  await rejectsCode(project.core().execute({ action: 'sync' }), 'MISSING_WRAPPER');
});
