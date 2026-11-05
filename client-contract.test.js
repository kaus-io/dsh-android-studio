import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const text = name => fs.readFile(path.join(root, name), 'utf8');

test('the shipped browser artifact bundles both halves of Android Studio', async () => {
  const client = await text('client.js');
  const manifest = JSON.parse(await text('package.json'));
  assert.ok(client.startsWith(`// Android Studio ${manifest.version}.`));
  assert.ok(client.includes(`window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}`));
  assert.ok(client.includes('UI_RUNNING'), 'The shared interaction model must be bundled');
  assert.ok(client.includes('@local/dsh-android-studio/code-reader'), 'The merged code reader must be bundled');
  assert.ok(client.includes('androidStudioCodeReader'), 'The merged reader keeps its own locale namespace');
  assert.ok(client.includes('sidebar.right.tab.document'), 'The merged reader registers a document body');
  assert.ok(!client.includes('/* ANDROID_WORKBENCH_MODEL */'));
  assert.ok(!client.includes('/* ANDROID_WORKBENCH_LOCALES */'));
});

test('the plugin uses real Harness slots, one React identity and only DSH theme tokens', async () => {
  const client = await text('client.js');
  const source = await text('client.view.js');
  const manifest = JSON.parse(await text('package.json'));
  assert.equal((source.match(/import \* as React from 'react'/g) || []).length, 1);
  assert.ok(!/require\(\s*['"]react['"]\s*\)/.test(source), 'The programmatic React factory is now an import');
  assert.ok(source.includes("'conversation.session.header.utilities'"), 'Toolbar must live in the right-aligned utilities seat');
  assert.ok(source.includes("id: 'android-studio-session-toolbar'"));
  assert.ok(!/ctx\.slots\.inject\(['"](?:main|sidebar\.panellist)['"]/.test(source), 'No separate workbench page may be required');
  assert.ok(!source.includes('layout.selectPanel'), 'Card operations must not navigate out of the conversation');
  assert.ok(!source.includes('selectCurrentSession(') && !source.includes('useSessions('), 'Each card must use its own exact sessionId');
  assert.ok(/function SessionToolbar\(/.test(source));
  assert.ok(/sessionId:\s*props\.sessionId/.test(source));
  assert.ok(!/selectionCache\.(?:get|set)\(root\b/.test(source), 'Selections must be isolated per card, even on the same project');
  assert.ok(!source.includes('onPointerEnter'), 'Menus must not open on hover');
  assert.ok(!source.includes('open-delay'), 'No hover timers may remain');
  assert.ok(source.includes('awb2-keystores-'), 'The panel offers remembered keystores');
  assert.ok(source.includes("t('buildAndSign')") && source.includes('signReady'), 'Signed builds reuse one config from the panel');
  assert.ok(source.includes('SIGN_PATH'), 'UI passwords travel only through the one-shot signing endpoint');
  assert.ok(!source.includes('storePasswordEnv'), 'The UI never asks for environment-variable names');
  assert.ok((source.match(/autoComplete: 'new-password'/g) || []).length >= 2, 'Passwords are masked inputs');
  const cacheWrites = [...source.matchAll(/selectionCache\.set\([^\n]*/g)].map(match => match[0]);
  assert.ok(cacheWrites.length >= 3);
  assert.ok(cacheWrites.every(line => !/storePassword|keyPassword/.test(line)), 'Passwords must never enter the selection cache');
  assert.ok(source.includes("keystore || ''") && source.includes('keystores'), 'Keystore and alias are remembered per session');
  assert.ok(source.includes('panelMode: true'), 'Build must open a panel, not a list of options');
  assert.ok(source.includes('awb2-fieldrow') && source.includes('awb2-seg'), 'The build panel carries target/variant/format controls');
  assert.ok(!source.includes("t('buildApk')"), 'No plain build-option list may remain');
  assert.ok(source.includes('fetch(OBSERVE_PATH'), 'Read-only polling must use the silent endpoint');
  assert.ok(source.includes('OBSERVE_ACTIONS.has(args.action)') && source.includes('ACTION_PATH'), 'Observations and mutations use distinct silent endpoints');
  assert.ok(!source.includes('ctx.remote.commands.execute') && !source.includes('remote.commands'), 'No toolbar action or task cancellation may enter the chat-logged command lifecycle');
  assert.ok(source.includes('fetch(ACTION_PATH'), 'Sidebar cancellation also uses the explicit action endpoint');
  assert.equal(manifest.name, '@local/dsh-android-studio');
  assert.ok(!/document\.body|sessionStorage|window\.confirm|<iframe/.test(source));
  assert.ok(!/localStorage\.(?:setItem|getItem)\(\s*(?!SELECTION_STORAGE_KEY)/.test(source), 'Only the dedicated selection key may use browser storage');
  /* The Android half owns this rule; the reader carries its own syntax palette. */
  const variables = [...source.matchAll(/var\((--[^,)\s]+)/g)].map(match => match[1]);
  assert.ok(variables.length > 0);
  assert.ok(variables.every(variable => variable.startsWith('--dsw-')));
});

test('sidebar services are declared in inject before property access', async () => {
  const source = await text('client.view.js');
  const match = source.match(/export const inject = \[([^\]]*)\]/);
  assert.ok(match, 'The browser plugin must declare its Cordis service dependencies');
  for (const service of ['sidebarRightTabs', 'sidebarRight']) assert.ok(match[1].includes(`'${service}'`), `Missing service dependency: ${service}`);
});

test('the merged entry wires both halves and the reader service', async () => {
  const entry = await text('src/client.tsx');
  assert.ok(entry.includes("from '../client.view.js'"));
  assert.ok(entry.includes("from './reader/plugin.tsx'"));
  assert.ok(entry.includes('applyAndroid') && entry.includes('applyCodeReader'));
  const reader = await text('src/reader/plugin.tsx');
  assert.ok(reader.includes("'documentPreviews'"));
  const manifest = JSON.parse(await text('package.json'));
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-documentpreview'));
});

test('all literal UI labels resolve in balanced English and Chinese dictionaries', async () => {
  const dictionaries = {};
  for (const id of ['en', 'zh']) {
    const locale = JSON.parse(await text(`locale/${id}.json`));
    assert.ok(locale.meta.title && locale.meta.description);
    dictionaries[id] = locale.ui;
  }
  assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries.zh).sort());
  const source = await text('client.view.js');
  for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]\s*[,)]/g)) {
    const key = match[1];
    assert.ok(Object.hasOwn(dictionaries.en, key), `Missing English UI label: ${key}`);
    assert.ok(Object.hasOwn(dictionaries.zh, key), `Missing Chinese UI label: ${key}`);
  }
});

test('task output targets the right sidebar and Gradle sync has feedback', async () => {
  const source = await text('client.view.js');
  assert.ok(source.includes('syncOpen && h(SyncDialog'), 'the sync confirmation dialog must be rendered');
  assert.ok(source.includes('onSync: runSync'), 'confirming the dialog must start the Gradle sync');
  assert.ok(source.includes('if (reveal) openTasksTab();'), 'new jobs must open the tasks sidebar');
  assert.ok(source.includes("useState('logcat')"), 'the card tool window keeps only logcat/artifacts');
  assert.ok(!source.includes("['build', 'run', 'logcat', 'artifacts']"), 'build/run output must not remain in the card');
  assert.ok(source.includes('openTasksTab = () => {'), 'the tasks opener must be assigned before type registration');
});

test('the merged reader uses a compact Xcode-style surface', async () => {
  const reader = await text('src/reader/view/CodeReader.tsx');
  const styles = await text('src/reader/view/styles.ts');
  assert.ok(!reader.includes('function Minimap'), 'the minimap is removed');
  assert.ok(!reader.includes('dcr_statusbar'), 'the status bar is removed');
  assert.ok(!reader.includes('dcr_fileTab'), 'the file tab is removed');
  assert.ok(!reader.includes('dcr_guide'), 'indent guides are removed');
  assert.ok(!styles.includes('.dcr_minimap'), 'no minimap styles');
  assert.ok(!styles.includes('--dcr-status-bg'), 'no status bar colour');
  assert.ok(styles.includes('--dcr-syn-keyword:#ad3da4'), 'Xcode Light keyword colour');
  assert.ok(styles.includes('--dcr-syn-keyword:#fc5fa3'), 'Xcode Dark keyword colour');
  assert.ok(reader.includes('dcr_fileName'), 'the jump bar keeps a compact file name');
});

test('runtime exports and linked distribution resources exist without install scripts', async () => {
  const manifest = JSON.parse(await text('package.json'));
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(manifest.exports['./client'], './client.js');
  assert.equal(manifest.exports['./locale/*.json'], './locale/*.json');
  assert.equal(manifest.exports['./icon'], './icon.svg');
  assert.ok(!manifest.scripts?.preinstall && !manifest.scripts?.postinstall);
  for (const file of ['index.js', 'runner.js', 'android.js', 'client.js', 'client.view.js', 'ui-model.js', 'build-client.mjs', 'src/client.tsx', 'src/reader/plugin.tsx', 'tsconfig.json', 'icon.svg', 'locale/en.json', 'locale/zh.json', 'cordis.patch.yml']) assert.ok((await fs.stat(path.join(root, file))).isFile());
});
