import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionSelectionKey, popupGeometry, showSessionToolbar } from './ui-model.ts';

test('ordinary, pending and unrecognized sessions have no Android toolbar', () => {
  for (const project of [undefined, null, {}, { modules: null }, { modules: [] }, { root: '/web-project', modules: [] }]) assert.equal(showSessionToolbar(project), false);
});

test('only a discovered Android App project mounts its toolbar and observers', () => {
  assert.equal(showSessionToolbar({ root: '/hanna', modules: [{ path: ':app-hanna' }] }), true);
  assert.equal(showSessionToolbar({ root: '/hanna', modules: [] }), false);
});

test('each card has an explicit session/project selection namespace', () => {
  assert.notEqual(sessionSelectionKey('card-a', '/project'), sessionSelectionKey('card-b', '/project'));
  assert.notEqual(sessionSelectionKey('card-a', '/project'), sessionSelectionKey('card-a', '/another-project'));
  assert.notEqual(sessionSelectionKey('a:b', 'c'), sessionSelectionKey('a', 'b:c'));
  assert.equal(sessionSelectionKey('card-a', '/project'), sessionSelectionKey('card-a', '/project'));
});

test('two simultaneous cards cannot overwrite each other’s App, device or variant', () => {
  const cache = new Map();
  const a = sessionSelectionKey('card-a', '/hanna');
  const b = sessionSelectionKey('card-b', '/hanna');
  cache.set(a, { modulePath: ':app-hanna', serial: 'phone-a', variant: 'Debug' });
  cache.set(b, { modulePath: ':app-camera-demo', serial: 'phone-b', variant: 'Release' });
  cache.set(a, { modulePath: ':app-mika', serial: 'phone-c', variant: 'Debug' });
  assert.deepEqual(cache.get(b), { modulePath: ':app-camera-demo', serial: 'phone-b', variant: 'Release' });
});

test('missing owner/project cannot silently become a shared global card key', () => {
  for (const [session, root] of [['', '/project'], ['card', ''], [undefined, '/project'], ['card', null]]) assert.throws(() => sessionSelectionKey(session, root), /required/);
});

test('a 30-pixel header does not constrain the hover popup height', () => {
  const geometry = popupGeometry({ left: 100, top: 40, bottom: 70, height: 30 }, { width: 1000, height: 800 });
  assert.deepEqual(geometry, { left: 100, top: 76, width: 350, maxHeight: 420 });
  assert.ok(geometry.maxHeight > 30);
});

test('floating inspectors clamp to a narrow viewport and flip above a bottom card', () => {
  const viewport = { width: 320, height: 600 };
  const geometry = popupGeometry({ left: 280, top: 540, bottom: 570 }, viewport, 800, 620);
  assert.equal(geometry.width, 304);
  assert.ok(geometry.left >= 0 && geometry.left + geometry.width <= viewport.width);
  assert.ok(geometry.top >= 0 && geometry.top + geometry.maxHeight <= viewport.height);
  assert.ok(geometry.top < 540);
});

test('all menu and inspector geometries remain inside their viewport', () => {
  for (const width of [120, 320, 800, 1920]) for (const height of [120, 400, 900]) for (const left of [-100, 0, width - 10, width + 40]) for (const top of [0, height / 2, height - 30, height + 60]) {
    const geometry = popupGeometry({ left, top, bottom: top + 30 }, { width, height }, 800, 620);
    assert.ok(geometry.left >= 0 && geometry.left + geometry.width <= width, JSON.stringify({ width, height, left, top, geometry }));
    assert.ok(geometry.top >= 0 && geometry.top + geometry.maxHeight <= height, JSON.stringify({ width, height, left, top, geometry }));
    assert.ok(geometry.width > 0 && geometry.maxHeight > 0);
  }
});

test('only non-secret selection state may be persisted', async () => {
  const { sanitizeSelection } = await import('./ui-model.ts');
  const stored = sanitizeSelection({ modulePath: ':app-hanna', variant: 'Debug', serial: '192.168.0.2:5555', keystore: '/keys/release.jks', alias: 'release', storePassword: 'secret-a', keyPassword: 'secret-b', credentials: { storePassword: 'x' }, variantsByModule: { ':app-hanna': 'Debug', ':app:odd': 42 }, keystores: ['/k/a.jks', '/k/a.jks', '/k/b.jks', 7] });
  assert.deepEqual(stored, { modulePath: ':app-hanna', variant: 'Debug', serial: '192.168.0.2:5555', keystore: '/keys/release.jks', alias: 'release', variantsByModule: { ':app-hanna': 'Debug' }, keystores: ['/k/a.jks', '/k/b.jks'] });
  assert.equal(JSON.stringify(stored).includes('secret'), false);
});

test('corrupt or oversized storage entries cannot escape the whitelist', async () => {
  const { sanitizeSelection } = await import('./ui-model.ts');
  assert.deepEqual(sanitizeSelection(null), {});
  assert.deepEqual(sanitizeSelection('nope'), {});
  assert.deepEqual(sanitizeSelection({ keystore: 123, alias: null }), {});
  assert.equal(sanitizeSelection({ variant: 'x'.repeat(500) }).variant!.length, 128);
  assert.equal(sanitizeSelection({ keystores: Array.from({ length: 20 }, (_, i) => '/k/' + i) }).keystores!.length, 8);
  assert.equal('variantsByModule' in sanitizeSelection({ variantsByModule: { a: 1 } }), false);
});

test('ADB Wi-Fi targets compose from IP and port without duplicating a port', async () => {
  const { wirelessAddress, isWirelessSerial } = await import('./ui-model.ts');
  assert.equal(wirelessAddress(' 192.168.1.23 ', '5555'), '192.168.1.23:5555');
  assert.equal(wirelessAddress('192.168.1.23', ''), '192.168.1.23:5555');
  assert.equal(wirelessAddress('192.168.1.23:7575', '5555'), '192.168.1.23:7575');
  assert.equal(wirelessAddress('', '5555'), '');
  assert.equal(wirelessAddress('  ', ''), '');
  assert.equal(isWirelessSerial('192.168.101.124:7575'), true);
  assert.equal(isWirelessSerial('adb-1A2B3C-xyz._adb-tls-connect._tcp'), true);
  assert.equal(isWirelessSerial('R5CT30ABCDE'), false);
  assert.equal(isWirelessSerial('emulator-5554'), false);
  assert.equal(isWirelessSerial(null), false);
});
