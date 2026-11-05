/** Pure interaction rules shared by the browser artifact and Node regression tests. */
export const UI_OUTPUT_LIMIT = 192000;
export const UI_RUNNING = ['running', 'queued', 'stopping'];
/** Read-only observations use the silent Host endpoint, never the logged slash command. */
export const OBSERVE_ACTIONS = new Set(['project', 'devices', 'jobs', 'status', 'artifacts', 'logcat']);
export const OBSERVE_PATH = '/android-workbench/observe';
export const ACTION_PATH = '/android-workbench/action';
export const SIGN_PATH = '/android-workbench/sign';
export const SECRET_LIMIT = 1024;
export const MENU_INITIAL = { open: false, pinned: false, focusWithin: false, pending: null };

/**
 * Click-owned menu state. Opening is an explicit user gesture: pointer enter and
 * leave never open or schedule anything, so a menu cannot appear by accident.
 */
export function menuReducer(state, event) {
  const type = event?.type;
  if (['blur', 'outside', 'escape', 'choose', 'disable'].includes(type)) return { ...MENU_INITIAL };
  if (type === 'focus') return { ...state, focusWithin: true };
  if (type === 'keyboard') return { ...state, open: true, pinned: true, pending: null };
  if (type === 'click') return state.open && state.pinned ? { ...MENU_INITIAL } : { ...state, open: true, pinned: true, pending: null };
  // Legacy hover events are inert; they are kept as accepted no-ops.
  if (['enter', 'leave', 'open-delay', 'close-delay'].includes(type)) return state;
  return state;
}

export function selectCurrentSession(list, preferredId = '') {
  const rows = Object.values(list?.byId ?? {});
  const current = rows.filter(row => (row.retainedBy?.mainView ?? 0) > 0);
  if (current.length === 1) return current[0].id;
  // Do not silently borrow an unrelated chat's authority or working directory.
  return preferredId && list?.byId?.[preferredId] ? preferredId : '';
}

/** Project discovery returns only Android application modules; unknown/empty projects stay invisible. */
export function showSessionToolbar(project) {
  return Array.isArray(project?.modules) && project.modules.length > 0;
}

/** Distinct conversation cards must never share a mutable selection cache entry. */
export function sessionSelectionKey(sessionId, root) {
  if (typeof sessionId !== 'string' || !sessionId || typeof root !== 'string' || !root) throw new TypeError('A session id and project root are required');
  return JSON.stringify([sessionId, root]);
}

/** Geometry uses the viewport, not the resident toolbar's small height. */
export function popupGeometry(anchor, viewport, desiredWidth = 350, desiredHeight = 420) {
  const margin = 8, gap = 6;
  const viewportWidth = Math.max(1, Number(viewport.width) || 1);
  const viewportHeight = Math.max(1, Number(viewport.height) || 1);
  const width = Math.min(Math.max(1, desiredWidth), Math.max(1, viewportWidth - margin * 2));
  const left = Math.max(Math.min(margin, viewportWidth - width), Math.min(anchor.left, viewportWidth - width - margin));
  const below = Math.max(0, viewportHeight - anchor.bottom - gap - margin);
  const above = Math.max(0, anchor.top - gap - margin);
  const useBelow = below >= Math.min(160, desiredHeight) || below >= above;
  const maxHeight = Math.min(desiredHeight, Math.max(1, useBelow ? below : above), Math.max(1, viewportHeight - margin * 2));
  const preferredTop = useBelow ? anchor.bottom + gap : anchor.top - gap - maxHeight;
  const top = Math.max(Math.min(margin, viewportHeight - maxHeight), Math.min(preferredTop, viewportHeight - maxHeight - margin));
  return { left, top, width, maxHeight };
}

export const SELECTION_STORAGE_KEY = 'android-workbench.selection.v1';
export const SELECTION_STORAGE_LIMIT = 32;
const LONG_FIELD = 4096;

/**
 * Only non-secret selection state may ever be persisted. This whitelist drops
 * passwords, unknown fields and oversized values, so a corrupt or hostile
 * storage entry cannot reintroduce a credential into the UI.
 */
export function sanitizeSelection(value) {
  const source = value && typeof value === 'object' ? value : {};
  const text = (input, limit) => (typeof input === 'string' ? input.slice(0, limit) : undefined);
  const result = {};
  const modulePath = text(source.modulePath, 256);
  if (modulePath) result.modulePath = modulePath;
  const variant = text(source.variant, 128);
  if (variant) result.variant = variant;
  const serial = text(source.serial, 256);
  if (serial) result.serial = serial;
  const keystore = text(source.keystore, LONG_FIELD);
  if (keystore) result.keystore = keystore;
  const alias = text(source.alias, 128);
  if (alias) result.alias = alias;
  if (source.variantsByModule && typeof source.variantsByModule === 'object') {
    const variants = {};
    for (const [key, item] of Object.entries(source.variantsByModule).slice(0, 64)) if (typeof item === 'string' && key.length <= 256) variants[key] = item.slice(0, 128);
    if (Object.keys(variants).length) result.variantsByModule = variants;
  }
  if (Array.isArray(source.wireless)) {
    const recent = [...new Set(source.wireless.filter(item => typeof item === 'string' && /^[A-Za-z0-9._:\[\]-]{1,256}$/.test(item)))].slice(0, 8);
    if (recent.length) result.wireless = recent;
  }
  if (Array.isArray(source.keystores)) {
    const recent = [...new Set(source.keystores.filter(item => typeof item === 'string' && item && item.length <= LONG_FIELD))].slice(0, 8);
    if (recent.length) result.keystores = recent;
  }
  return result;
}

export function isUnsafeVariant(variant) {
  return /(?:bugly|jiagu)[_-]?on/i.test(String(variant));
}

export function reconcileModule(project, selection = {}) {
  const modules = Array.isArray(project?.modules) ? project.modules : [];
  const selected = modules.find(item => item.path === selection.modulePath) ?? modules[0];
  const variantsByModule = { ...(selection.variantsByModule ?? {}) };
  if (!selected) return { modulePath: '', variant: '', variantsByModule: {} };
  const remembered = selected.path === selection.modulePath && selection.variant?.trim() ? selection.variant : variantsByModule[selected.path];
  const variant = typeof remembered === 'string' && remembered.trim() ? remembered : selected.defaultVariant ?? '';
  if (variant) variantsByModule[selected.path] = variant;
  return { modulePath: selected.path, variant, variantsByModule };
}

/** Compose the explicit ADB Wi-Fi target from the IP and port fields. */
export function wirelessAddress(host, port = '5555') {
  const value = String(host ?? '').trim();
  if (!value) return '';
  if (/:\d+$/.test(value)) return value;
  const digits = String(port ?? '').replace(/[^0-9]/g, '').slice(0, 5) || '5555';
  return value + ':' + digits;
}

/** adb reports wireless transports as ip:port or an mDNS service name. */
export function isWirelessSerial(serial) {
  return typeof serial === 'string' && (/:\d+$/.test(serial) || /_adb-tls-connect\._tcp$/.test(serial));
}

export function chooseDevice(devices, previousSerial = '') {
  // Keep an explicit target even while missing/offline; never redirect Run to a different phone.
  if (previousSerial) return previousSerial;
  const ready = (devices ?? []).filter(device => device.state === 'device');
  return ready.length === 1 ? ready[0].serial : '';
}

export function runBlockedReason({ project, modulePath, variant, serial, devices = [], busy, job } = {}) {
  if (!project) return 'reason.projectLoading';
  if (!project.modules?.some(module => module.path === modulePath)) return 'reason.noModule';
  if (!variant?.trim()) return 'reason.noVariant';
  if (isUnsafeVariant(variant)) return 'reason.unsafeVariant';
  if (!/Debug$/.test(variant)) return 'reason.debugOnly';
  if (busy || UI_RUNNING.includes(job?.status)) return 'reason.busy';
  if (!serial) return 'reason.noDevice';
  if (!devices.some(device => device.serial === serial && device.state === 'device')) return 'reason.deviceUnavailable';
  return null;
}

export function wizardSteps(mode) {
  if (mode === 'build') return ['target', 'review'];
  return mode === 'existing' ? ['artifact', 'signing', 'review'] : ['target', 'signing', 'review'];
}

export function wizardError(wizard = {}, project) {
  if (!['build', 'signed', 'existing'].includes(wizard.mode)) return 'wizard.invalidMode';
  if (!['apk', 'aab'].includes(wizard.format)) return 'wizard.invalidFormat';
  if (wizard.mode !== 'existing') {
    if (!project?.modules?.some(module => module.path === wizard.modulePath)) return 'reason.noModule';
    if (!/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(wizard.variant ?? '')) return 'reason.noVariant';
    if (isUnsafeVariant(wizard.variant)) return 'reason.unsafeVariant';
  } else if (typeof wizard.artifact !== 'string' || !wizard.artifact.trim() || !new RegExp(`\\.${wizard.format}$`, 'i').test(wizard.artifact)) return 'wizard.noArtifact';
  if (wizard.mode === 'build') return null;
  if (!wizard.keystore?.trim()) return 'wizard.noKeystore';
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(wizard.alias ?? '')) return 'wizard.noAlias';
  for (const password of [wizard.storePassword, wizard.keyPassword]) {
    if (typeof password !== 'string' || !password || password.length > SECRET_LIMIT || password.includes('\0')) return 'wizard.noPassword';
  }
  if (!wizard.output?.trim() || !new RegExp(`\\.${wizard.format}$`, 'i').test(wizard.output)) return 'wizard.noOutput';
  if (/[\x00-\x1f]/.test(wizard.output)) return 'wizard.noOutput';
  if (wizard.mode === 'existing' && normalizeUiPath(wizard.output) === normalizeUiPath(wizard.artifact)) return 'wizard.sameOutput';
  return null;
}

function normalizeUiPath(value) {
  // UI guard only; the Host enforces canonical paths, symlinks and exclusive publication.
  const parts = String(value).replaceAll('\\', '/').split('/');
  const stack = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..' && stack.length && stack.at(-1) !== '..') stack.pop();
    else stack.push(part);
  }
  return (String(value).startsWith('/') ? '/' : '') + stack.join('/');
}

export function wizardRequest(wizard) {
  const target = { module: wizard.modulePath?.trim() ?? '', variant: wizard.variant?.trim() ?? '', format: wizard.format, skipResource: wizard.skipResource === true };
  if (wizard.mode === 'build') return { action: 'build', ...target };
  const signing = { keystore: wizard.keystore.trim(), alias: wizard.alias.trim(), storePassword: wizard.storePassword, keyPassword: wizard.keyPassword, output: wizard.output.trim() };
  return wizard.mode === 'existing'
    ? { action: 'sign', artifact: wizard.artifact.trim(), format: wizard.format, ...signing }
    : { action: 'package', ...target, ...signing };
}

export function suggestSignedOutput(artifact) {
  return String(artifact ?? '').replace(/\.(apk|aab)$/i, '-signed.$1');
}

export function artifactRows(value) {
  const candidates = Array.isArray(value?.artifacts) ? value.artifacts : [];
  const result = new Map();
  for (const item of candidates) {
    if (typeof item?.path !== 'string' || !/\.(apk|aab)$/i.test(item.path) || /[\x00-\x1f]/.test(item.path)) continue;
    const format = /\.aab$/i.test(item.path) ? 'aab' : 'apk';
    result.set(item.path, { path: item.path, format, variant: item.variant ?? value.variant ?? '', size: Number.isFinite(item.size) ? item.size : null, applicationId: item.applicationId ?? '', verified: item.verified === true, fresh: item.fresh === true, reused: item.reused === true });
  }
  if (typeof value?.output === 'string' && /\.(apk|aab)$/i.test(value.output) && value.verified === true && !/[\x00-\x1f]/.test(value.output)) {
    result.set(value.output, { ...(result.get(value.output) ?? {}), path: value.output, format: /\.aab$/i.test(value.output) ? 'aab' : 'apk', variant: value.variant ?? '', size: result.get(value.output)?.size ?? null, verified: true });
  }
  return [...result.values()].slice(0, 64);
}

export function mergeJobFrame(current = {}, frame = {}) {
  if (current.job?.id && frame.job?.id && current.job.id !== frame.job.id) return current;
  const cursor = Number.isSafeInteger(current.cursor) ? current.cursor : 0;
  const next = Number.isSafeInteger(frame.output?.next) ? frame.output.next : cursor;
  const chunks = Array.isArray(frame.output?.chunks) ? frame.output.chunks : [];
  let addition = '';
  if (next > cursor) for (const chunk of chunks) {
    if (typeof chunk.text !== 'string') continue;
    const overlap = Number.isSafeInteger(chunk.at) && !frame.output?.lossy ? Math.max(0, cursor - chunk.at) : 0;
    const bytes = new TextEncoder().encode(chunk.text);
    addition += new TextDecoder().decode(bytes.subarray(Math.min(overlap, bytes.length)));
  }
  const combined = (current.output ?? '') + addition;
  return {
    job: frame.job ? { ...(current.job ?? {}), ...frame.job } : current.job ?? null,
    output: combined.slice(-UI_OUTPUT_LIMIT),
    cursor: Math.max(cursor, next),
    result: frame.result === null || frame.result === undefined ? current.result ?? null : frame.result,
    lossy: Boolean(current.lossy || frame.output?.lossy || combined.length > UI_OUTPUT_LIMIT),
  };
}
