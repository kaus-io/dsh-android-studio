import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { constants as FS } from 'node:fs';
import { isIP } from 'node:net';

const DEFAULT_VARIANT = 'Bugly_off_Jiagu_off_Debug';
const ACTIONS = new Set(['project', 'sync', 'devices', 'connect', 'disconnect', 'pair', 'logcat', 'install', 'uninstall', 'stop', 'run', 'build', 'artifacts', 'sign']);
const ARGUMENTS = new Set(['action', 'module', 'variant', 'serial', 'address', 'pairingCodeEnv', 'apk', 'packageName', 'format', 'skipResource', 'keystore', 'alias', 'storePasswordEnv', 'keyPasswordEnv', 'artifact', 'output']);
const SKIP = new Set(['build', '.git', '.gradle', '.idea', 'vendor', 'vendors', 'node_modules', 'third_party', 'third-party']);
const LIMITS = { text: 1024 * 1024, settings: 12, modules: 320, outputEntries: 2500, outputDepth: 10, variants: 128 };
const STATIC_WARNING = 'Static inference only: Gradle/settings/plugins are never executed; convention plugins, computed includes/flavors, variant filters and custom output directories may be missing. A literal variant can be entered manually; safety policy still applies.';

function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function check(value, re, label) {
  if (typeof value !== 'string' || !re.test(value)) fail('INVALID_INPUT', `Invalid ${label}`);
  return value;
}
function checkedPath(value, label = 'path') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value)) fail('INVALID_INPUT', `Invalid ${label}`);
  return value;
}
function within(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function moduleName(value) { return check(value, /^:[A-Za-z0-9_][A-Za-z0-9_-]*(?::[A-Za-z0-9_][A-Za-z0-9_-]*)*$/, 'module'); }
function packageName(value) { return check(value, /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/, 'packageName'); }
function serialName(value) { return check(value, /^[A-Za-z0-9][A-Za-z0-9_.:\[\]-]{0,255}$/, 'serial'); }
function variantName(value) { return check(value, /^[A-Za-z][A-Za-z0-9_]{0,127}$/, 'variant'); }
function cap(value) { return value ? value[0].toUpperCase() + value.slice(1) : value; }
function low(value) { return value ? value[0].toLowerCase() + value.slice(1) : value; }
function matchesVariant(actual, wanted) { return actual === wanted || actual === low(wanted); }
// Kiwisec emits <variant>-jiagu.apk; '-jiagu_off_' inside a normal AGP flavor name is not a hardened suffix.
function isHardenedApk(filename) { return /-jiagu(?:[-_.]signed)?\.apk$/i.test(path.basename(filename)); }
function fingerprint(stat) { return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':'); }
function aborted(signal) { signal?.throwIfAborted(); }
function addressName(value) {
  checkedPath(value, 'address');
  const match = /^(\[[0-9A-Fa-f:]+\]|[A-Za-z0-9][A-Za-z0-9.-]{0,252}):(\d{1,5})$/.exec(value);
  if (!match || +match[2] < 1 || +match[2] > 65535) fail('INVALID_INPUT', 'Address must be an explicit host:port or [IPv6]:port');
  const host = match[1];
  if (host.startsWith('[') ? isIP(host.slice(1, -1)) !== 6 : host.split('.').some(part => !part || part.startsWith('-') || part.endsWith('-'))) fail('INVALID_INPUT', 'Invalid address host');
  return value;
}

// Small lexer rather than evaluating Gradle. Comments and interpolated strings cannot become declarations.
function lex(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) { if (c === '\n') line++; i++; continue; }
    if (source.startsWith('//', i)) { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (source.startsWith('/*', i)) {
      i += 2;
      let depth = 1;
      while (i < source.length && depth) {
        if (source.startsWith('/*', i)) { depth++; i += 2; }
        else if (source.startsWith('*/', i)) { depth--; i += 2; }
        else { if (source[i] === '\n') line++; i++; }
      }
      continue;
    }
    if (c === '"' || c === "'") {
      const tokenLine = line;
      const triple = source.startsWith(c.repeat(3), i);
      const quote = triple ? c.repeat(3) : c;
      i += quote.length;
      let value = '';
      let literal = !triple;
      while (i < source.length && !source.startsWith(quote, i)) {
        if (source[i] === '\n') line++;
        if (source[i] === '$') literal = false;
        if (source[i] === '\\') {
          i++;
          const escaped = source[i++];
          if (escaped === c || escaped === '\\') value += escaped;
          else { value += `\\${escaped ?? ''}`; literal = false; }
        } else value += source[i++];
      }
      if (i >= source.length) literal = false;
      i += quote.length;
      tokens.push({ value, kind: literal ? 'string' : 'dynamic', line: tokenLine });
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(source.slice(i));
    if (word) { tokens.push({ value: word[0], kind: 'word', line }); i += word[0].length; }
    else { tokens.push({ value: c, kind: 'symbol', line }); i++; }
  }
  return tokens;
}
function closing(tokens, start, open = '(', close = ')') {
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    if (tokens[i].kind === 'symbol' && tokens[i].value === open) depth++;
    if (tokens[i].kind === 'symbol' && tokens[i].value === close && --depth === 0) return i;
  }
  return -1;
}
function literalArguments(tokens, index) {
  if (tokens[index]?.value === '(') {
    const end = closing(tokens, index);
    if (end < 0) return [];
    const args = tokens.slice(index + 1, end).filter(t => t.value !== ',');
    return args.every(t => t.kind === 'string') ? args.map(t => t.value) : [];
  }
  const line = tokens[index]?.line;
  const args = [];
  for (let i = index; i < tokens.length && tokens[i].line === line; i++) {
    if (tokens[i].kind === 'string') args.push(tokens[i].value);
    else if (tokens[i].value !== ',') break;
  }
  return args;
}
function block(tokens, name) {
  const index = tokens.findIndex((t, i) => t.kind === 'word' && t.value === name && tokens[i + 1]?.value === '{');
  if (index < 0) return [];
  const end = closing(tokens, index + 1, '{', '}');
  return end < 0 ? [] : tokens.slice(index + 2, end);
}
function namedBlocks(tokens) {
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let name;
    let open;
    if (['create', 'getByName', 'maybeCreate', 'named', 'register'].includes(t.value) && tokens[i + 1]?.value === '(' && tokens[i + 2]?.kind === 'string' && tokens[i + 3]?.value === ')' && tokens[i + 4]?.value === '{') {
      name = tokens[i + 2].value; open = i + 4;
    } else if (t.kind === 'word' && tokens[i - 1]?.value !== '.' && !['forEach', 'all', 'configureEach', 'if', 'for', 'when', 'configure'].includes(t.value) && tokens[i + 1]?.value === '{') { name = t.value; open = i + 1; }
    else if (t.value === '{') { const end = closing(tokens, i, '{', '}'); if (end >= 0) i = end; continue; }
    if (open !== undefined) {
      const end = closing(tokens, open, '{', '}');
      if (end < 0) break;
      result.push({ name, body: tokens.slice(open + 1, end) });
      i = end;
    }
  }
  return result;
}
function pluginIds(tokens, aliases) {
  const ids = new Set();
  const plugins = block(tokens, 'plugins');
  for (let i = 0; i < plugins.length; i++) {
    if (!['id', 'alias'].includes(plugins[i].value)) continue;
    const end = plugins[i + 1]?.value === '(' ? closing(plugins, i + 1) : i + 1;
    if (end < 0) continue;
    let applyFalse = false;
    for (let j = end + 1; j < plugins.length && !['id', 'alias'].includes(plugins[j].value); j++) {
      if (plugins[j].value === 'apply' && (plugins[j + 1]?.value === 'false' || (plugins[j + 1]?.value === '(' && plugins[j + 2]?.value === 'false'))) applyFalse = true;
    }
    if (applyFalse) continue;
    if (plugins[i].value === 'id') for (const id of literalArguments(plugins, i + 1)) ids.add(id);
    else {
      const alias = plugins.slice(i + 2, end).map(t => t.value).join('');
      if (aliases.has(alias)) ids.add(aliases.get(alias));
    }
  }
  for (let i = 0; i < tokens.length; i++) if (tokens[i].value === 'apply' && tokens[i + 1]?.value === 'plugin' && tokens[i + 2]?.value === ':' && tokens[i + 3]?.kind === 'string') ids.add(tokens[i + 3].value);
  return ids;
}
function inferVariants(tokens, ids, warnings, module) {
  const android = block(tokens, 'android');
  const buildTypes = [...new Set(['debug', 'release', ...namedBlocks(block(android, 'buildTypes')).map(b => b.name)])].filter(v => /^[A-Za-z][A-Za-z0-9_]*$/.test(v));
  const dimensions = [];
  for (let i = 0; i < android.length; i++) {
    if (android[i].value !== 'flavorDimensions') continue;
    let j = i + 1;
    while (['+', '='].includes(android[j]?.value)) j++;
    if (['listOf', 'mutableListOf'].includes(android[j]?.value)) j++;
    dimensions.push(...literalArguments(android, j));
  }
  const flavors = namedBlocks(block(android, 'productFlavors')).filter(b => /^[A-Za-z][A-Za-z0-9_]*$/.test(b.name)).map(b => {
    const index = b.body.findIndex(t => t.value === 'dimension');
    let i = index + 1;
    if (b.body[i]?.value === '=') i++;
    return { name: b.name, dimension: index >= 0 && b.body[i]?.kind === 'string' ? b.body[i].value : undefined };
  });
  const requiresBugly = ids.has('com.teyes.bugly.symbol') || flavors.some(f => /bugly/i.test(f.name));
  const requiresJiagu = ids.has('com.teyes.kiwisec') || flavors.some(f => /jiagu/i.test(f.name));
  let combinations = [''];
  if (flavors.length) {
    const order = [...new Set(dimensions.length ? dimensions : flavors.map(f => f.dimension).filter(Boolean))];
    if (!order.length) order.push('default');
    for (const flavor of flavors) if (!flavor.dimension && order.length === 1) flavor.dimension = order[0];
    if (flavors.some(f => !f.dimension || !order.includes(f.dimension))) {
      combinations = []; warnings.push(`${module}: non-literal or ambiguous flavor dimensions; enter the complete variant manually.`);
    } else for (const dimension of order) {
      const group = flavors.filter(f => f.dimension === dimension);
      combinations = combinations.flatMap(prefix => group.map(f => prefix + (prefix ? cap(f.name) : f.name)));
      if (combinations.length * buildTypes.length > LIMITS.variants) { combinations = []; warnings.push(`${module}: variant inference limit reached.`); break; }
    }
  } else if (block(android, 'productFlavors').length) {
    combinations = []; warnings.push(`${module}: computed product flavors cannot be inferred.`);
  }
  if (ids.has('com.teyes.bugly.symbol') || ids.has('com.teyes.kiwisec')) {
    warnings.push(`${module}: Teyes convention-plugin flavors are not evaluated; off/off candidates assume the known plugin dimension order before literal App dimensions. Confirm or enter the complete variant manually; aggregate assembleDebug is forbidden.`);
    const prefix = [...ids].flatMap(id => id === 'com.teyes.bugly.symbol' && !flavors.some(f => f.dimension === 'bugly') ? ['bugly_off_'] : id === 'com.teyes.kiwisec' && !flavors.some(f => f.dimension === 'jiagu') ? ['jiagu_off_'] : []).map((name, i) => i ? cap(name) : name).join('');
    if (prefix) combinations = combinations.map(combination => prefix + cap(combination));
  }
  const variants = combinations.flatMap(prefix => buildTypes.map(type => cap(prefix + cap(type))));
  const safe = variants.find(v => /Debug$/.test(v) && !/(bugly|jiagu)_on/i.test(v) && (!requiresBugly || /bugly_off/i.test(v)) && (!requiresJiagu || /jiagu_off/i.test(v)));
  return { variants, defaultVariant: safe ?? (requiresBugly || requiresJiagu ? DEFAULT_VARIANT : 'Debug'), requiresBugly, requiresJiagu };
}

/** Plain Node ESM Android core. The injected runner is the only process boundary.
 * execute rejects with Error {code}; no action installs or starts a device implicitly except explicit run/install.
 * onOutput receives {stream:'stdout'|'stderr', text:string}; all configured secret values are redacted.
 */
export class AndroidWorkbench {
  constructor({ root, run, env = process.env } = {}) {
    checkedPath(root, 'root');
    if (typeof run !== 'function') fail('INVALID_INPUT', 'An injected run(argv, options) function is required');
    this.root = path.resolve(root);
    this.run = run;
    this.env = { ...env };
  }

  async execute(args, { signal, onOutput = () => {}, credentials } = {}) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) fail('INVALID_INPUT', 'Arguments must be an object');
    for (const key of Object.keys(args)) if (!ARGUMENTS.has(key)) fail('INVALID_INPUT', `Unsupported argument: ${key}`);
    if (!ACTIONS.has(args.action)) fail('INVALID_INPUT', 'Unsupported action');
    for (const key of ARGUMENTS) {
      if (args[key] === undefined || key === 'action') continue;
      if (key === 'skipResource') { if (typeof args[key] !== 'boolean') fail('INVALID_INPUT', 'skipResource must be boolean'); }
      else if (typeof args[key] !== 'string' || !args[key] || args[key].length > 4096 || /[\x00-\x1f\x7f]/.test(args[key])) fail('INVALID_INPUT', `Invalid ${key}`);
    }
    if (args.module !== undefined) moduleName(args.module);
    if (args.variant !== undefined) variantName(args.variant);
    if (args.serial !== undefined) serialName(args.serial);
    if (args.address !== undefined) addressName(args.address);
    if (args.packageName !== undefined) packageName(args.packageName);
    if (args.format !== undefined && !['apk', 'aab'].includes(args.format)) fail('INVALID_INPUT', 'format must be apk or aab');
    aborted(signal);
    const root = await fs.realpath(this.root);
    if (!(await fs.stat(root)).isDirectory()) fail('INVALID_INPUT', 'root must be a directory');
    const secrets = Object.entries(this.env).filter(([name, value]) => /^ANDROID_/.test(name) && /(PASSWORD|PASS|SECRET|TOKEN|PAIR|CODE)/.test(name) && typeof value === 'string' && value.length > 0 && value.length <= 4096).map(([, value]) => value);
    const secret = name => {
      check(name, /^ANDROID_[A-Z0-9_]+$/, 'secret environment-variable name');
      const value = this.env[name];
      if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0')) fail('MISSING_SECRET', `Required environment variable ${name} is not set`);
      secrets.push(value);
      return value;
    };
    // UI-entered passwords reach this process only as a per-run child environment;
    // they are never logged, never persisted and never placed in argv.
    let provided = null;
    if (credentials && typeof credentials === 'object') {
      const storePassword = typeof credentials.storePassword === 'string' ? credentials.storePassword : '';
      const keyPassword = typeof credentials.keyPassword === 'string' ? credentials.keyPassword : '';
      if (storePassword || keyPassword) {
        for (const value of [storePassword, keyPassword]) {
          if (!value || value.length > 1024 || value.includes('\0')) fail('INVALID_SECRET', 'Signing passwords must be non-empty strings without NUL characters');
        }
        provided = { storePassword, keyPassword };
        secrets.push(storePassword, keyPassword);
      }
    }
    const redact = text => {
      let result = String(text ?? '');
      for (const value of [...secrets].sort((a, b) => b.length - a.length)) result = result.split(value).join('[REDACTED]');
      return result;
    };
    const sanitizeError = error => {
      if (!(error instanceof Error) || redact(error.message) === error.message) return error;
      return Object.assign(new Error(redact(error.message)), { name: error.name, ...(error.code === undefined ? {} : { code: error.code }) });
    };
    const context = { root, signal, args, secret, redact, credentials: provided };
    const invoke = async (argv, options = {}) => {
      aborted(signal);
      const buffers = { stdout: '', stderr: '' };
      const output = event => {
        const stream = event && typeof event === 'object' && event.stream === 'stderr' ? 'stderr' : 'stdout';
        const text = typeof event === 'string' || Buffer.isBuffer(event) ? String(event) : String(event?.text ?? event?.data ?? event?.chunk ?? '');
        buffers[stream] += text;
        const ordered = [...new Set(secrets)].sort((a, b) => b.length - a.length);
        const keep = Math.max(0, ...ordered.map(s => s.length - 1));
        const length = Math.max(0, buffers[stream].length - keep);
        let consumed = 0;
        let emitted = '';
        // Keep the raw tail until every possible longer secret is known; never emit part of a match.
        while (consumed < length) {
          const matched = ordered.find(value => buffers[stream].startsWith(value, consumed));
          if (matched) { emitted += '[REDACTED]'; consumed += matched.length; }
          else emitted += buffers[stream][consumed++];
        }
        if (emitted) onOutput({ stream, text: emitted });
        buffers[stream] = buffers[stream].slice(consumed);
      };
      let result;
      try {
        result = await this.run(argv, { cwd: root, signal, onOutput: output, env: { ...this.env, ...options.env }, timeoutMs: options.timeoutMs ?? 60_000, ...(options.stdin === undefined ? {} : { stdin: options.stdin }) });
        aborted(signal);
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw sanitizeError(error);
        fail('RUNNER_FAILED', redact(error?.message ?? 'Runner failed'));
      } finally {
        for (const stream of ['stdout', 'stderr']) if (buffers[stream]) onOutput({ stream, text: redact(buffers[stream]) });
      }
      if (!result || !Number.isInteger(result.exitCode)) fail('RUNNER_FAILED', 'Runner returned an invalid result');
      const safe = { exitCode: result.exitCode, stdout: redact(result.stdout), stderr: redact(result.stderr) };
      if (safe.exitCode !== 0) fail('COMMAND_FAILED', `${path.basename(argv[0])} exited ${safe.exitCode}${safe.stderr ? `: ${safe.stderr.slice(0, 1500)}` : ''}`);
      return safe;
    };
    context.invoke = invoke;
    try {
      switch (args.action) {
        case 'project': return await this._project(context);
        case 'devices': return await this._devices(context);
        case 'sign': return await this._sign(context);
        case 'sync': return await this._sync(context);
        case 'run': case 'build': case 'artifacts': return await this._build(context);
        default: return await this._deviceAction(context);
      }
    } catch (error) {
      throw sanitizeError(error);
    }
  }

  // All mutable project paths reject symlinks (even in-root links). Read inputs may resolve in-root links.
  async _inside(root, input, { exists = true, file = false, mutable = false } = {}) {
    checkedPath(input);
    const absolute = path.resolve(root, input);
    if (!within(root, absolute)) fail('PATH_ESCAPE', 'Path must remain inside project root');
    let current = root;
    for (const part of path.relative(root, absolute).split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      let stat;
      try { stat = await fs.lstat(current); }
      catch (error) { if (error.code === 'ENOENT' && !exists) continue; throw error; }
      if (stat.isSymbolicLink()) {
        const real = await fs.realpath(current);
        if (mutable || !within(root, real)) fail('PATH_ESCAPE', 'Symlink is not allowed for this project path');
      }
    }
    if (exists) {
      const real = await fs.realpath(absolute);
      if (!within(root, real)) fail('PATH_ESCAPE', 'Resolved path escapes project root');
      if (file && !(await fs.stat(real)).isFile()) fail('INVALID_INPUT', 'Expected a regular file');
      return real;
    }
    return absolute;
  }

  async _text(root, filename, optional = true) {
    try {
      const safe = await this._inside(root, filename, { file: true });
      const stat = await fs.stat(safe);
      if (stat.size > LIMITS.text) fail('SCAN_LIMIT', 'Static input exceeds size limit');
      return await fs.readFile(safe, 'utf8');
    } catch (error) { if (optional && error.code === 'ENOENT') return undefined; throw error; }
  }

  async _gradleFile(root, directory, basename) {
    for (const suffix of ['.gradle.kts', '.gradle']) {
      const filename = path.join(directory, basename + suffix);
      const text = await this._text(root, filename);
      if (text !== undefined) return { filename, tokens: lex(text) };
    }
    return undefined;
  }

  async _catalog(root, buildRoot) {
    const text = await this._text(root, path.join(buildRoot, 'gradle/libs.versions.toml'));
    const aliases = new Map();
    let plugins = false;
    for (const line of (text ?? '').split(/\r?\n/)) {
      if (/^\s*\[/.test(line)) { plugins = /^\s*\[plugins\]\s*(?:#.*)?$/.test(line); continue; }
      if (!plugins) continue;
      const match = /^\s*([A-Za-z0-9_.-]+)\s*=\s*\{[^\n]*\bid\s*=\s*["']([^"']+)["']/.exec(line);
      if (match) aliases.set(`libs.plugins.${match[1].replace(/[-_]/g, '.')}`, match[2]);
    }
    return aliases;
  }

  async _project(context, internal = false) {
    const { root, signal } = context;
    const warnings = [STATIC_WARNING];
    const modules = [];
    const visited = new Set();
    let count = 0;
    const visit = async (directory, prefix = '', depth = 0) => {
      aborted(signal);
      if (depth > 2 || count >= LIMITS.settings) { warnings.push('Included-build settings scan limit reached.'); return; }
      directory = await this._inside(root, directory, { mutable: true });
      if (visited.has(directory)) return;
      visited.add(directory); count++;
      const settings = await this._gradleFile(root, directory, 'settings');
      if (!settings) { if (depth === 0) warnings.push('No settings.gradle(.kts) found.'); return; }
      const aliases = await this._catalog(root, directory);
      const included = new Set();
      const remaps = new Map();
      const builds = [];
      const tokens = settings.tokens;
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].value === 'include') {
          const values = literalArguments(tokens, i + 1);
          if (!values.length) warnings.push('A computed include declaration was ignored.');
          values.forEach(v => { if (/^:?[A-Za-z0-9_][A-Za-z0-9_:-]*$/.test(v)) included.add(v.startsWith(':') ? v : ':' + v); });
        }
        if (tokens[i].value === 'includeBuild') builds.push(...literalArguments(tokens, i + 1));
        if (tokens[i].value === 'project' && tokens[i + 1]?.value === '(' && tokens[i + 2]?.kind === 'string' && tokens[i + 3]?.value === ')' && tokens[i + 4]?.value === '.' && tokens[i + 5]?.value === 'projectDir' && tokens[i + 6]?.value === '=') {
          const start = i + 7;
          if (tokens[start]?.value === 'file' && tokens[start + 1]?.value === '(' && tokens[start + 2]?.kind === 'string' && tokens[start + 3]?.value === ')') remaps.set(tokens[i + 2].value, tokens[start + 2].value);
          else if (['File', 'new'].includes(tokens[start]?.value)) {
            const index = tokens[start].value === 'new' ? start + 1 : start;
            if (tokens[index]?.value === 'File' && tokens[index + 1]?.value === '(' && ['rootDir', 'settingsDir'].includes(tokens[index + 2]?.value) && tokens[index + 3]?.value === ',' && tokens[index + 4]?.kind === 'string' && tokens[index + 5]?.value === ')') remaps.set(tokens[i + 2].value, tokens[index + 4].value);
            else warnings.push(`Unsupported projectDir remap: ${tokens[i + 2].value}`);
          } else warnings.push(`Unsupported projectDir remap: ${tokens[i + 2].value}`);
        }
      }
      let scanned = 0;
      for (const name of included) {
        aborted(signal);
        if (scanned++ >= LIMITS.modules) { warnings.push('Included-module scan limit reached.'); break; }
        moduleName(name);
        const relative = remaps.get(name) ?? name.slice(1).replaceAll(':', path.sep);
        if (relative.split(/[\\/]/).some(p => SKIP.has(p))) { warnings.push(`Skipped excluded module directory: ${name}`); continue; }
        try {
          const moduleDirectory = await this._inside(root, path.resolve(directory, relative), { mutable: true });
          const build = await this._gradleFile(root, moduleDirectory, 'build');
          if (!build) continue;
          const ids = pluginIds(build.tokens, aliases);
          if (!ids.has('com.android.application')) continue;
          const inferred = inferVariants(build.tokens, ids, warnings, prefix + name);
          const module = { path: prefix + name, directory: moduleDirectory, ...inferred };
          // Existing metadata contributes explicit historical candidates, never evidence of a new build.
          try {
            const outputs = await this._outputFiles(root, path.join(moduleDirectory, 'build/outputs/apk'));
            let historical = 0;
            for (const output of outputs.filter(f => path.basename(f.path) === 'output-metadata.json')) {
              let metadata;
              try { metadata = JSON.parse(await this._text(root, output.path, false)); }
              catch (error) { if (error instanceof SyntaxError) { warnings.push(`${name}: malformed historical APK metadata ignored.`); continue; } throw error; }
              if (metadata.artifactType?.type !== 'APK' || typeof metadata.variantName !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(metadata.variantName)) continue;
              const candidate = cap(metadata.variantName);
              if (!module.variants.includes(candidate)) { module.variants.push(candidate); historical++; }
            }
            if (historical) warnings.push(`${name}: ${historical} variant candidate(s) came from historical APK metadata, not an evaluated or current build.`);
          } catch (error) {
            if (['PATH_ESCAPE', 'SCAN_LIMIT'].includes(error.code)) warnings.push(`${name}: historical outputs not scanned because of unsafe paths or scan limits.`);
            else throw error;
          }
          const safeDefault = module.variants.find(candidate => {
            try { this._safeVariant(module, candidate, 'run'); return true; } catch { return false; }
          });
          if (safeDefault) module.defaultVariant = safeDefault;
          modules.push(module);
        } catch (error) {
          if (error.code === 'ENOENT') warnings.push(`Included module not found: ${name}`);
          else if (error.code === 'PATH_ESCAPE') warnings.push(`Unsafe module directory skipped: ${name}`);
          else throw error;
        }
      }
      if (builds.length) warnings.push('Composite includeBuild projects are not scanned or invoked from this root. Open the included build as a separate project root to work on its Apps.');
    };
    await visit(root);
    return { root, modules: internal ? modules : modules.map(({ requiresBugly, requiresJiagu, ...module }) => module), warnings: [...new Set(warnings)] };
  }

  async _sdk(context) {
    const text = await this._text(context.root, path.join(context.root, 'local.properties'));
    const match = /^\s*sdk\.dir\s*[=:]\s*(.*?)\s*$/m.exec(text ?? '');
    const decoded = match?.[1].replace(/\\u([0-9a-fA-F]{4})|\\(.)/g, (_, unicode, c) => unicode ? String.fromCharCode(parseInt(unicode, 16)) : c);
    const candidate = decoded || this.env.ANDROID_HOME || this.env.ANDROID_SDK_ROOT;
    return candidate ? path.resolve(context.root, checkedPath(candidate, 'SDK path')) : undefined;
  }

  async _tool(context, name) {
    const sdk = await this._sdk(context);
    const extension = process.platform === 'win32' ? (name === 'apksigner' ? '.bat' : '.exe') : '';
    if (name === 'adb') return sdk ? path.join(sdk, 'platform-tools', name + extension) : 'adb';
    if (name === 'jarsigner') {
      const home = this.env.JAVA_HOME;
      return home ? path.join(path.resolve(context.root, checkedPath(home, 'JAVA_HOME')), 'bin', name + extension) : 'jarsigner';
    }
    if (!sdk) fail('SDK_NOT_FOUND', 'Set sdk.dir in local.properties or ANDROID_HOME/ANDROID_SDK_ROOT for APK signing');
    const directory = path.join(sdk, 'build-tools');
    const entries = await fs.readdir(directory, { withFileTypes: true });
    if (entries.length > 100) fail('SCAN_LIMIT', 'Too many SDK build-tools directories');
    const versions = entries.filter(e => e.isDirectory() && /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?$/.test(e.name)).map(e => e.name).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      const candidate = path.join(directory, version, name + extension);
      try { if ((await fs.stat(candidate)).isFile()) return candidate; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    fail('TOOL_NOT_FOUND', `${name} is not available in SDK build-tools`);
  }

  async _devices(context) {
    const result = await context.invoke([await this._tool(context, 'adb'), 'devices', '-l']);
    const devices = [];
    for (const line of result.stdout.split(/\r?\n/)) {
      const match = /^(\S+)\s+(device|offline|unauthorized|recovery|sideload|bootloader|no permissions)(?:\s|$)(.*)$/.exec(line.trim());
      if (!match || !/^[A-Za-z0-9][A-Za-z0-9_.:\[\]-]{0,255}$/.test(match[1])) continue;
      const fields = Object.fromEntries([...match[3].matchAll(/(?:^|\s)(model|product|transport_id):([^\s]+)/g)].map(m => [m[1], m[2]]));
      devices.push({ serial: match[1], state: match[2], model: fields.model ?? null, product: fields.product ?? null, transportId: fields.transport_id ?? null });
    }
    return { devices };
  }

  async _online(context) {
    const serial = serialName(context.args.serial);
    const { devices } = await this._devices(context);
    const matches = devices.filter(d => d.serial === serial);
    if (matches.length !== 1 || matches[0].state !== 'device') fail('DEVICE_UNAVAILABLE', 'The explicitly selected serial must have device state');
    return serial;
  }

  async _deviceAction(context) {
    const { args, root, invoke, secret } = context;
    if (['connect', 'disconnect', 'pair'].includes(args.action)) {
      const address = addressName(args.address);
      let code;
      if (args.action === 'pair') {
        code = secret(args.pairingCodeEnv);
        if (!/^\d{6}$/.test(code)) fail('INVALID_INPUT', 'Pairing code must contain six digits');
      }
      const result = await invoke([await this._tool(context, 'adb'), args.action, address], code ? { stdin: code + '\n' } : {});
      if (/failed|unable to|cannot connect/i.test(result.stdout + result.stderr)) fail('ADB_FAILED', 'Wireless adb operation failed');
      return { action: args.action, address, ...result };
    }
    let apk;
    if (args.action === 'install') {
      apk = await this._inside(root, checkedPath(args.apk, 'apk'), { file: true });
      if (!/\.apk$/i.test(apk)) fail('INVALID_INPUT', 'install requires an explicit APK');
    }
    if (['uninstall', 'stop'].includes(args.action)) packageName(args.packageName);
    const serial = await this._online(context);
    const adb = await this._tool(context, 'adb');
    const command = args.action === 'logcat' ? ['logcat', '-d', '-t', '200']
      : args.action === 'install' ? ['install', '-r', apk]
        : args.action === 'uninstall' ? ['uninstall', args.packageName]
          : ['shell', 'am', 'force-stop', args.packageName];
    const result = await invoke([adb, '-s', serial, ...command], { timeoutMs: args.action === 'install' ? 180_000 : 60_000 });
    if (/\bFailure\b|^Error:/m.test(result.stdout + result.stderr)) fail('ADB_FAILED', 'adb operation reported failure');
    return { action: args.action, serial, ...result };
  }

  _safeVariant(module, variant, action) {
    variantName(variant);
    if (/(?:bugly|jiagu)_?on/i.test(variant)) fail('UNSAFE_VARIANT', 'Bugly upload and Jiagu variants are forbidden');
    for (const name of ['bugly', 'jiagu']) {
      if ((module[name === 'bugly' ? 'requiresBugly' : 'requiresJiagu'] || new RegExp(name, 'i').test(variant)) && !new RegExp(`${name}_off(?:_|Debug$|Release$)`, 'i').test(variant)) fail('UNSAFE_VARIANT', 'Only explicit bugly_off / jiagu_off variants are allowed');
    }
    if (action === 'run' && !/Debug$/.test(variant)) fail('UNSAFE_VARIANT', 'run only permits an explicit Debug variant; release is never installed automatically');
    if (!/(Debug|Release)$/.test(variant) && !module.variants.includes(variant)) fail('UNSAFE_VARIANT', 'Use a complete variant with an explicit build type');
  }

  /**
   * Android Studio-style sync without building: Gradle configures the project
   * and lists its task names, which carry the variant list. Only the built-in
   * `tasks` task is requested, so no assemble/bundle task runs.
   */
  async _sync(context) {
    const module = context.args.module === undefined ? null : moduleName(context.args.module);
    const wrapper = path.join(context.root, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
    try { if (!(await fs.stat(wrapper)).isFile()) fail('MISSING_WRAPPER', 'No Gradle wrapper file exists at the project root'); }
    catch (error) { if (error.code === 'ENOENT') fail('MISSING_WRAPPER', 'No Gradle wrapper file exists at the project root'); else throw error; }
    context.signal?.throwIfAborted();
    const argv = [wrapper, ...(module ? [`${module}:tasks`] : ['tasks']), '--all', '-q', '--console=plain'];
    const result = await context.invoke(argv, { timeoutMs: 240_000 });
    const names = new Set();
    for (const line of result.stdout.split(/\r?\n/)) {
      // `tasks --all` prefixes subproject tasks with their project path.
      const match = /^(?:[A-Za-z0-9_.-]+:)?(?:assemble|bundle)([A-Z][A-Za-z0-9_]*)$/.exec(line.trim());
      if (match) names.add(match[1]);
    }
    const variants = [];
    const refused = [];
    for (const variant of [...names].sort()) {
      if (!/(Debug|Release)$/.test(variant)) continue;
      if (/(?:bugly|jiagu)_?on/i.test(variant)) { refused.push(variant); continue; }
      variants.push(variant);
    }
    return { action: 'sync', module, variants, refused, tasks: names.size };
  }

  async _outputFiles(root, directory) {
    await this._inside(root, directory, { exists: false, mutable: true });
    const files = [];
    let count = 0;
    const visit = async (dir, depth) => {
      if (depth > LIMITS.outputDepth) fail('SCAN_LIMIT', 'Output directory nesting exceeds limit');
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); }
      catch (error) { if (error.code === 'ENOENT') return; throw error; }
      for (const entry of entries) {
        if (++count > LIMITS.outputEntries) fail('SCAN_LIMIT', 'Output scan exceeds entry limit');
        const filename = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) fail('PATH_ESCAPE', 'Symlinks are not allowed in build outputs');
        if (entry.isDirectory()) await visit(filename, depth + 1);
        else if (entry.isFile() && (entry.name === 'output-metadata.json' || /\.(apk|aab)$/i.test(entry.name))) {
          await this._inside(root, filename, { file: true, mutable: true });
          files.push({ path: filename, stat: await fs.stat(filename, { bigint: true }) });
        }
      }
    };
    await visit(directory, 0);
    return files;
  }

  async _collect(context, module, variant, format, before) {
    const directory = path.join(module.directory, 'build/outputs', format === 'apk' ? 'apk' : 'bundle');
    const files = await this._outputFiles(context.root, directory);
    const stats = new Map(files.map(f => [f.path, f.stat]));
    const fresh = filename => !before || before.get(filename) !== fingerprint(stats.get(filename));
    const artifacts = [];
    if (format === 'apk') {
      for (const entry of files.filter(f => path.basename(f.path) === 'output-metadata.json')) {
        const text = await this._text(context.root, entry.path, false);
        let metadata;
        try { metadata = JSON.parse(text); }
        catch { fail('INVALID_ARTIFACT', 'Malformed APK output-metadata.json'); }
        if (!matchesVariant(metadata.variantName, variant)) continue;
        if (metadata.artifactType?.type !== 'APK') fail('INVALID_ARTIFACT', 'Matching output metadata must declare artifactType.type APK');
        if (before && !fresh(entry.path)) continue;
        packageName(metadata.applicationId);
        if (!Array.isArray(metadata.elements) || !metadata.elements.length || metadata.elements.length > 64) fail('INVALID_ARTIFACT', 'Invalid APK metadata elements');
        for (const element of metadata.elements) {
          const name = checkedPath(element.outputFile, 'metadata outputFile');
          if (path.isAbsolute(name) || name.split(/[\\/]/).includes('..') || !/\.apk$/i.test(name)) fail('INVALID_ARTIFACT', 'Unsafe APK outputFile');
          if (isHardenedApk(name)) continue;
          const filename = await this._inside(context.root, path.join(path.dirname(entry.path), name), { file: true, mutable: true });
          if (!stats.has(filename)) fail('INVALID_ARTIFACT', 'APK referenced by metadata is outside scanned outputs');
          if (before && !fresh(filename)) continue;
          const stat = stats.get(filename);
          artifacts.push({ path: filename, format, variant: metadata.variantName, applicationId: metadata.applicationId, metadata: entry.path, filters: Array.isArray(element.filters) ? element.filters.filter(f => f && typeof f.filterType === 'string' && typeof f.value === 'string').map(f => ({ filterType: f.filterType, value: f.value })) : [], size: Number(stat.size), modifiedAt: new Date(Number(stat.mtimeMs)).toISOString(), fresh: Boolean(before) });
        }
      }
    } else {
      for (const entry of files.filter(f => /\.aab$/i.test(f.path))) {
        const relative = path.relative(directory, entry.path).split(path.sep);
        if (relative.length !== 2 || !matchesVariant(relative[0], variant) || !fresh(entry.path)) continue;
        artifacts.push({ path: entry.path, format, variant: low(variant), applicationId: null, metadata: null, filters: [], size: Number(entry.stat.size), modifiedAt: new Date(Number(entry.stat.mtimeMs)).toISOString(), fresh: Boolean(before) });
      }
    }
    return artifacts.sort((a, b) => a.path.localeCompare(b.path));
  }

  async _build(context) {
    const { args, root, invoke } = context;
    const project = await this._project(context, true);
    const name = moduleName(args.module ?? ':app-hanna');
    const module = project.modules.find(m => m.path === name);
    if (!module) fail('MODULE_NOT_FOUND', 'Select an included, statically recognized Android application module');
    const variant = args.variant ?? module.defaultVariant;
    const format = args.format ?? 'apk';
    this._safeVariant(module, variant, args.action);
    if (args.action === 'run' && format !== 'apk') fail('INVALID_INPUT', 'run requires APK format');
    if (args.action === 'artifacts') return { action: 'artifacts', module: name, variant, format, artifacts: await this._collect(context, module, variant, format), warnings: ['Historical output listing only; no artifact is selected by recency or installed automatically.'] };
    if (args.action === 'run') await this._online(context);
    // Snapshot every candidate before invoking Gradle: unchanged/up-to-date files are NOT this build's output.
    const outputDirectory = path.join(module.directory, 'build/outputs', format === 'apk' ? 'apk' : 'bundle');
    const before = new Map((await this._outputFiles(root, outputDirectory)).map(f => [f.path, fingerprint(f.stat)]));
    const gradlew = await this._inside(root, path.join(root, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), { file: true, mutable: true });
    const task = `${name}:${format === 'aab' ? 'bundle' : 'assemble'}${cap(variant)}`;
    const argv = [gradlew, task, '--console=plain', '--no-daemon'];
    if (args.skipResource === true) argv.push('-x', `${name}:generateTeyesResourceMain`);
    const buildResult = await invoke(argv, { timeoutMs: 30 * 60_000 });
    let artifacts = await this._collect(context, module, variant, format, before);
    const warnings = [];
    if (!artifacts.length) {
      const evidenceTasks = format === 'apk' ? [task, `${name}:package${cap(variant)}`] : [task, `${name}:sign${cap(variant)}Bundle`];
      const evidence = (buildResult.stdout + '\n' + buildResult.stderr).split(/\r?\n/).some(line => evidenceTasks.some(candidate => line.trim() === `> Task ${candidate} UP-TO-DATE`));
      if (evidence) {
        const current = new Map((await this._outputFiles(root, outputDirectory)).map(f => [f.path, fingerprint(f.stat)]));
        artifacts = (await this._collect(context, module, variant, format)).filter(artifact => before.has(artifact.path) && before.get(artifact.path) === current.get(artifact.path) && (!artifact.metadata || (before.has(artifact.metadata) && before.get(artifact.metadata) === current.get(artifact.metadata)))).map(artifact => ({ ...artifact, fresh: false, reused: true }));
        if (artifacts.length) warnings.push('Reused exact-variant outputs only because this invocation explicitly reported the exact assemble/package/bundle task UP-TO-DATE. These are not newly produced files.');
      }
    }
    if (!artifacts.length) fail('NO_FRESH_ARTIFACT', 'Build produced no fresh matching artifact or exact UP-TO-DATE task evidence; historical outputs are never guessed (a clean rebuild may be needed)');
    if (args.action === 'build') return { action: 'build', module: name, variant, format, artifacts, warnings };
    const groups = new Set(artifacts.map(a => a.metadata));
    const packages = new Set(artifacts.map(a => a.applicationId));
    if (groups.size !== 1 || packages.size !== 1) fail('AMBIGUOUS_ARTIFACT', 'More than one matching APK metadata group/applicationId; refusing to guess');
    // Do not install an incomplete split set when only some elements changed.
    const metadata = JSON.parse(await this._text(root, artifacts[0].metadata, false));
    const expected = metadata.elements.filter(e => !isHardenedApk(e.outputFile));
    if (expected.length !== artifacts.length) fail('NO_FRESH_ARTIFACT', 'Not every APK in the metadata set was produced or confirmed UP-TO-DATE by this invocation');
    if (expected.length > 1 && expected.some(element => Array.isArray(element.filters) && element.filters.length)) fail('UNSUPPORTED_APK_SET', 'Filtered multi-APK outputs may be mutually exclusive ABI/density APKs, not config splits. Choose an explicit APK and install it manually.');
    const serial = await this._online(context);
    const adb = await this._tool(context, 'adb');
    const install = await invoke([adb, '-s', serial, artifacts.length > 1 ? 'install-multiple' : 'install', '-r', ...artifacts.map(a => a.path)], { timeoutMs: 180_000 });
    if (/\bFailure\b|^Error:/m.test(install.stdout + install.stderr)) fail('ADB_FAILED', 'APK installation failed');
    const applicationId = packageName(artifacts[0].applicationId);
    const resolved = await invoke([adb, '-s', serial, 'shell', 'pm', 'resolve-activity', '--brief', '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER', applicationId]);
    const candidates = resolved.stdout.split(/\r?\n/).map(s => s.trim()).filter(s => /^[A-Za-z][A-Za-z0-9_.]*\/[A-Za-z_.][A-Za-z0-9_.]*$/.test(s));
    if (candidates.length !== 1 || candidates[0].split('/')[0] !== applicationId) fail('NO_LAUNCHER', 'No unique launcher component was resolved for the built applicationId');
    const component = candidates[0];
    const started = await invoke([adb, '-s', serial, 'shell', 'am', 'start', '-W', '-n', component]);
    const launchOutput = started.stdout + started.stderr;
    const launchStatus = /^\s*Status:\s*(\S+)/mi.exec(launchOutput);
    if (!launchStatus || launchStatus[1].toLowerCase() !== 'ok' || /^\s*(Error:|Exception)/mi.test(launchOutput)) fail('LAUNCH_FAILED', 'am start did not report a successful launch');
    return { action: 'run', module: name, variant, serial, applicationId, component, artifacts, installed: true, launched: true, warnings };
  }

  async _sign(context) {
    const { root, args, invoke, secret } = context;
    const input = await this._inside(root, checkedPath(args.artifact ?? args.apk, 'artifact'), { file: true });
    const format = path.extname(input).slice(1).toLowerCase();
    if (!['apk', 'aab'].includes(format) || (args.format && args.format !== format)) fail('INVALID_INPUT', 'Signing requires an APK or AAB with matching format');
    const keystorePath = path.resolve(root, checkedPath(args.keystore, 'keystore'));
    const keystore = await fs.realpath(keystorePath);
    if (!(await fs.stat(keystore)).isFile()) fail('INVALID_INPUT', 'keystore must be a regular file');
    const alias = check(args.alias, /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/, 'key alias');
    // A UI signing run supplies values; the agent tool can still only name host variables.
    let storeEnv; let keyEnv; let signEnv;
    if (context.credentials) {
      const nonce = crypto.randomBytes(8).toString('hex');
      storeEnv = 'AWB_STORE_' + nonce;
      keyEnv = 'AWB_KEY_' + nonce;
      signEnv = { [storeEnv]: context.credentials.storePassword, [keyEnv]: context.credentials.keyPassword };
    } else {
      storeEnv = args.storePasswordEnv ?? 'ANDROID_STORE_PASSWORD';
      keyEnv = args.keyPasswordEnv ?? 'ANDROID_KEY_PASSWORD';
      secret(storeEnv);
      secret(keyEnv);
    }
    const output = await this._inside(root, checkedPath(args.output, 'output'), { exists: false, mutable: true });
    if (path.extname(output).toLowerCase() !== `.${format}` || output === input || output === keystore) fail('INVALID_INPUT', 'Signing output must be a separate file with the same format');
    try { await fs.lstat(output); fail('OUTPUT_EXISTS', 'Signing output already exists; refusing to overwrite'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = await this._inside(root, path.dirname(output), { exists: false, mutable: true });
    await fs.mkdir(parent, { recursive: true });
    await this._inside(root, parent, { mutable: true });
    // Tools work only on fresh scratch paths. Publish exclusively after cryptographic verification.
    const temporary = await fs.mkdtemp(path.join(root, '.android-workbench-sign-'));
    try {
      const signed = path.join(temporary, `signed.${format}`);
      if (format === 'apk') {
        const zipalign = await this._tool(context, 'zipalign');
        const apksigner = await this._tool(context, 'apksigner');
        const aligned = path.join(temporary, 'aligned.apk');
        await invoke([zipalign, '-P', '16', '4', input, aligned]);
        await this._inside(root, aligned, { file: true, mutable: true });
        await invoke([apksigner, 'sign', '--ks', keystore, '--ks-key-alias', alias, '--ks-pass', `env:${storeEnv}`, '--key-pass', `env:${keyEnv}`, '--out', signed, aligned], signEnv ? { env: signEnv } : {});
        await this._inside(root, signed, { file: true, mutable: true });
        await invoke([apksigner, 'verify', '--verbose', '--print-certs', signed]);
        await invoke([zipalign, '-c', '-P', '16', '4', signed]);
      } else {
        const jarsigner = await this._tool(context, 'jarsigner');
        await invoke([jarsigner, '-keystore', keystore, '-storepass:env', storeEnv, '-keypass:env', keyEnv, '-signedjar', signed, input, alias], signEnv ? { env: signEnv } : {});
        await this._inside(root, signed, { file: true, mutable: true });
        const verification = await invoke([jarsigner, '-verify', '-verbose', '-certs', signed], { env: { LC_ALL: 'C', LANG: 'C' } });
        if (!/\bjar verified\./i.test(verification.stdout + verification.stderr) || /jar is unsigned/i.test(verification.stdout + verification.stderr)) fail('SIGN_VERIFY_FAILED', 'jarsigner did not verify the AAB signature');
      }
      if ((await fs.stat(signed)).size === 0) fail('SIGN_VERIFY_FAILED', 'Signing produced an empty file');
      aborted(context.signal);
      await this._inside(root, output, { exists: false, mutable: true });
      try { await fs.copyFile(signed, output, FS.COPYFILE_EXCL); }
      catch (error) { if (error.code === 'EEXIST') fail('OUTPUT_EXISTS', 'Signing output already exists; refusing to overwrite'); throw error; }
      return { action: 'sign', format, artifact: input, output, verified: true };
    } finally {
      // mkdtemp returns an absolute, owned child of the canonical root; never clean an unvalidated computed path.
      if (within(root, temporary) && path.basename(temporary).startsWith('.android-workbench-sign-')) {
        await this._inside(root, temporary, { mutable: true });
        await fs.rm(temporary, { recursive: true, force: true });
      }
    }
  }
}
