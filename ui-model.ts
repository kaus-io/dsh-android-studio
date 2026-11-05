/** Pure interaction rules shared by the browser artifact and Node regression tests. */
export const UI_OUTPUT_LIMIT = 192000;
export const UI_RUNNING: readonly string[] = ['running', 'queued', 'stopping'];
/** Read-only observations use the silent Host endpoint, never the logged slash command. */
export const OBSERVE_ACTIONS = new Set(['project', 'devices', 'jobs', 'status', 'artifacts', 'logcat']);
export const OBSERVE_PATH = '/android-workbench/observe';
export const ACTION_PATH = '/android-workbench/action';
export const SIGN_PATH = '/android-workbench/sign';
export const SECRET_LIMIT = 1024;
export const MENU_INITIAL = { open: false, pinned: false, focusWithin: false, pending: null };

/** Task metadata attached to a Host job. */
export interface JobContext {
  root?: string;
  action?: string;
  module?: string;
  variant?: string;
  format?: string;
  serial?: string;
  [key: string]: unknown;
}

/** A Host background task as seen by the browser. */
export interface Job {
  id: string;
  status: string;
  context?: JobContext;
  [key: string]: unknown;
}

/** One ADB transport entry. */
export interface Device {
  serial: string;
  state?: string;
  model?: string;
  product?: string;
  [key: string]: unknown;
}

/** One Android application module from the static project scan. */
export interface ProjectModule {
  path: string;
  variants?: readonly string[];
  defaultVariant?: string;
  [key: string]: unknown;
}

/** Static project discovery payload. */
export interface Project {
  root?: string;
  modules?: ProjectModule[] | null;
  [key: string]: unknown;
}

/** Non-secret per-session selection state (also the persisted whitelist shape). */
export interface SelectionState {
  modulePath?: string;
  variant?: string;
  variantsByModule?: Record<string, string>;
  serial?: string;
  keystore?: string;
  alias?: string;
  wireless?: string[];
  keystores?: string[];
}

/** Resolved App/variant selection for one project. */
export interface ModuleSelection {
  modulePath: string;
  variant: string;
  variantsByModule: Record<string, string>;
}

/** Fixed-position popup geometry inside the viewport. */
export interface PopupPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/** Anchored element geometry (a DOMRect is accepted). */
export interface AnchorRect {
  left: number;
  top: number;
  bottom: number;
  width?: number;
  height?: number;
}

export interface ViewportSize {
  width?: number | string;
  height?: number | string;
}

/** Click-owned menu state. */
export interface MenuState {
  open: boolean;
  pinned: boolean;
  focusWithin: boolean;
  pending: string | null;
}

export interface MenuEvent {
  type?: string;
}

/** Signing wizard form shared by the panel, the wizard and the request builder. */
export interface WizardForm {
  mode?: string;
  format?: string;
  modulePath?: string;
  variant?: string;
  artifact?: string;
  keystore?: string;
  alias?: string;
  storePassword?: string;
  keyPassword?: string;
  output?: string;
  skipResource?: boolean;
  [key: string]: unknown;
}

/** Allow-listed payload sent to the Host action/sign routes. */
export interface WizardRequest {
  action: string;
  module?: string;
  variant?: string;
  format?: string;
  skipResource?: boolean;
  keystore?: string;
  alias?: string;
  storePassword?: string;
  keyPassword?: string;
  output?: string;
  artifact?: string;
}

/** Artifact observation payload (fields are validated at runtime). */
export interface ArtifactFeed {
  [key: string]: unknown;
  artifacts?: unknown[];
  output?: unknown;
  verified?: unknown;
  variant?: string;
}

/** One sanitized artifact card row. */
export interface ArtifactRow {
  path: string;
  format: string;
  variant: string;
  size: number | null;
  applicationId?: string;
  verified?: boolean;
  fresh?: boolean;
  reused?: boolean;
}

/** One session row used to pick the current conversation. */
export interface SessionRow {
  id: string;
  retainedBy?: { mainView?: number };
}

export interface SessionList {
  byId?: Record<string, SessionRow>;
}

/** One incremental output chunk from the status stream. */
export interface JobChunk {
  text?: string;
  at?: number;
}

/** Accumulated job output frame kept by the browser. */
export interface JobFrame {
  job: Partial<Job> | null;
  output: string;
  cursor: number;
  result: any;
  lossy: boolean;
}

/** Incremental status response that is merged into a frame. */
export interface JobFramePatch {
  job?: Partial<Job>;
  output?: { next?: number; chunks?: JobChunk[]; lossy?: boolean };
  result?: any;
}

export interface RunBlockedInput {
  project?: Project | null;
  modulePath?: string;
  variant?: string;
  serial?: string;
  devices?: Device[];
  busy?: boolean;
  job?: Partial<Job> | null;
}

/**
 * Click-owned menu state. Opening is an explicit user gesture: pointer enter and
 * leave never open or schedule anything, so a menu cannot appear by accident.
 */
export function menuReducer(state: MenuState, event: MenuEvent | null | undefined): MenuState {
  const type = event?.type as string;
  if (['blur', 'outside', 'escape', 'choose', 'disable'].includes(type)) return { ...MENU_INITIAL };
  if (type === 'focus') return { ...state, focusWithin: true };
  if (type === 'keyboard') return { ...state, open: true, pinned: true, pending: null };
  if (type === 'click') return state.open && state.pinned ? { ...MENU_INITIAL } : { ...state, open: true, pinned: true, pending: null };
  // Legacy hover events are inert; they are kept as accepted no-ops.
  if (['enter', 'leave', 'open-delay', 'close-delay'].includes(type)) return state;
  return state;
}

export function selectCurrentSession(list: SessionList | null | undefined, preferredId = ''): string {
  const rows = Object.values(list?.byId ?? {});
  const current = rows.filter(row => (row.retainedBy?.mainView ?? 0) > 0);
  if (current.length === 1) return current[0]!.id;
  // Do not silently borrow an unrelated chat's authority or working directory.
  return preferredId && list?.byId?.[preferredId] ? preferredId : '';
}

/** Project discovery returns only Android application modules; unknown/empty projects stay invisible. */
export function showSessionToolbar(project: Project | null | undefined): boolean {
  return Array.isArray(project?.modules) && project.modules.length > 0;
}

/** Distinct conversation cards must never share a mutable selection cache entry. */
export function sessionSelectionKey(sessionId: string | null | undefined, root: string | null | undefined): string {
  if (typeof sessionId !== 'string' || !sessionId || typeof root !== 'string' || !root) throw new TypeError('A session id and project root are required');
  return JSON.stringify([sessionId, root]);
}

/** Geometry uses the viewport, not the resident toolbar's small height. */
export function popupGeometry(anchor: AnchorRect, viewport: ViewportSize, desiredWidth = 350, desiredHeight = 420): PopupPosition {
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
export function sanitizeSelection(value: unknown): SelectionState {
  const source: Record<string, unknown> = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const text = (input: unknown, limit: number): string | undefined => (typeof input === 'string' ? input.slice(0, limit) : undefined);
  const result: SelectionState = {};
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
    const variants: Record<string, string> = {};
    for (const [key, item] of Object.entries(source.variantsByModule as Record<string, unknown>).slice(0, 64)) if (typeof item === 'string' && key.length <= 256) variants[key] = item.slice(0, 128);
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

export function isUnsafeVariant(variant: unknown): boolean {
  return /(?:bugly|jiagu)[_-]?on/i.test(String(variant));
}

export function reconcileModule(project: Project | null | undefined, selection: SelectionState = {}): ModuleSelection {
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
export function wirelessAddress(host: unknown, port: unknown = '5555'): string {
  const value = String(host ?? '').trim();
  if (!value) return '';
  if (/:\d+$/.test(value)) return value;
  const digits = String(port ?? '').replace(/[^0-9]/g, '').slice(0, 5) || '5555';
  return value + ':' + digits;
}

/** adb reports wireless transports as ip:port or an mDNS service name. */
export function isWirelessSerial(serial: unknown): boolean {
  return typeof serial === 'string' && (/:\d+$/.test(serial) || /_adb-tls-connect\._tcp$/.test(serial));
}

export function chooseDevice(devices: Device[] | null | undefined, previousSerial = ''): string {
  // Keep an explicit target even while missing/offline; never redirect Run to a different phone.
  if (previousSerial) return previousSerial;
  const ready = (devices ?? []).filter(device => device.state === 'device');
  return ready.length === 1 ? ready[0]!.serial : '';
}

export function runBlockedReason({ project, modulePath, variant, serial, devices = [], busy, job }: RunBlockedInput = {}): string | null {
  if (!project) return 'reason.projectLoading';
  if (!project.modules?.some(module => module.path === modulePath)) return 'reason.noModule';
  if (!variant?.trim()) return 'reason.noVariant';
  if (isUnsafeVariant(variant)) return 'reason.unsafeVariant';
  if (!/Debug$/.test(variant)) return 'reason.debugOnly';
  if (busy || UI_RUNNING.includes(job?.status as string)) return 'reason.busy';
  if (!serial) return 'reason.noDevice';
  if (!devices.some(device => device.serial === serial && device.state === 'device')) return 'reason.deviceUnavailable';
  return null;
}

export function wizardSteps(mode?: string): string[] {
  if (mode === 'build') return ['target', 'review'];
  return mode === 'existing' ? ['artifact', 'signing', 'review'] : ['target', 'signing', 'review'];
}

export function wizardError(wizard: WizardForm = {}, project?: Project | null): string | null {
  if (!['build', 'signed', 'existing'].includes(wizard.mode as string)) return 'wizard.invalidMode';
  if (!['apk', 'aab'].includes(wizard.format as string)) return 'wizard.invalidFormat';
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
  if (!wizard.output?.trim() || !new RegExp(`\\.${wizard.format}$`, 'i').test(wizard.output as string)) return 'wizard.noOutput';
  if (/[\x00-\x1f]/.test(wizard.output as string)) return 'wizard.noOutput';
  if (wizard.mode === 'existing' && normalizeUiPath(wizard.output) === normalizeUiPath(wizard.artifact)) return 'wizard.sameOutput';
  return null;
}

function normalizeUiPath(value: unknown) {
  // UI guard only; the Host enforces canonical paths, symlinks and exclusive publication.
  const parts = String(value).replaceAll('\\', '/').split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..' && stack.length && stack.at(-1) !== '..') stack.pop();
    else stack.push(part);
  }
  return (String(value).startsWith('/') ? '/' : '') + stack.join('/');
}

export function wizardRequest(wizard: WizardForm): WizardRequest {
  const target = { module: wizard.modulePath?.trim() ?? '', variant: wizard.variant?.trim() ?? '', format: wizard.format, skipResource: wizard.skipResource === true };
  if (wizard.mode === 'build') return { action: 'build', ...target };
  const signing = { keystore: wizard.keystore!.trim(), alias: wizard.alias!.trim(), storePassword: wizard.storePassword, keyPassword: wizard.keyPassword, output: wizard.output!.trim() };
  return wizard.mode === 'existing'
    ? { action: 'sign', artifact: wizard.artifact!.trim(), format: wizard.format, ...signing }
    : { action: 'package', ...target, ...signing };
}

export function suggestSignedOutput(artifact: unknown): string {
  return String(artifact ?? '').replace(/\.(apk|aab)$/i, '-signed.$1');
}

export function artifactRows(value: ArtifactFeed | null | undefined): ArtifactRow[] {
  const candidates: any[] = Array.isArray(value?.artifacts) ? value.artifacts as any[] : [];
  const result = new Map<string, ArtifactRow>();
  for (const item of candidates) {
    if (typeof item?.path !== 'string' || !/\.(apk|aab)$/i.test(item.path) || /[\x00-\x1f]/.test(item.path)) continue;
    const format = /\.aab$/i.test(item.path) ? 'aab' : 'apk';
    result.set(item.path, { path: item.path, format, variant: item.variant ?? value!.variant ?? '', size: Number.isFinite(item.size) ? item.size : null, applicationId: item.applicationId ?? '', verified: item.verified === true, fresh: item.fresh === true, reused: item.reused === true });
  }
  if (typeof value?.output === 'string' && /\.(apk|aab)$/i.test(value.output) && value.verified === true && !/[\x00-\x1f]/.test(value.output)) {
    result.set(value.output, { ...(result.get(value.output) ?? {}), path: value.output, format: /\.aab$/i.test(value.output) ? 'aab' : 'apk', variant: value.variant ?? '', size: result.get(value.output)?.size ?? null, verified: true });
  }
  return [...result.values()].slice(0, 64);
}

export function mergeJobFrame(current: Partial<JobFrame> = {}, frame: JobFramePatch = {}): JobFrame {
  if (current.job?.id && frame.job?.id && current.job.id !== frame.job.id) return current as JobFrame;
  const cursor = Number.isSafeInteger(current.cursor) ? current.cursor as number : 0;
  const next = Number.isSafeInteger(frame.output?.next) ? frame.output!.next as number : cursor;
  const chunks: JobChunk[] = Array.isArray(frame.output?.chunks) ? frame.output!.chunks as JobChunk[] : [];
  let addition = '';
  if (next > cursor) for (const chunk of chunks) {
    if (typeof chunk.text !== 'string') continue;
    const overlap = Number.isSafeInteger(chunk.at) && !frame.output?.lossy ? Math.max(0, cursor - (chunk.at as number)) : 0;
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
