import { realpath, lstat, stat } from "node:fs/promises";
import path from "node:path";
import { AndroidWorkbench } from "./android.js";
import { createRunner } from "./runner.js";
const inject = ["commands", "tools", "subprocess", "jobs", "workingDirectory", "sandboxPolicy", "approval", "agents", "webServer", "connection"];
const ACTIONS = ["project", "sync", "devices", "connect", "disconnect", "pair", "logcat", "install", "uninstall", "stop", "run", "build", "package", "artifacts", "sign", "jobs", "status", "cancel"];
const READS = /* @__PURE__ */ new Set(["project", "artifacts", "jobs", "status"]);
const OBSERVE_ACTIONS = /* @__PURE__ */ new Set(["project", "devices", "jobs", "status", "artifacts", "logcat"]);
const OBSERVE_PATH = "/android-workbench/observe";
const ACTION_PATH = "/android-workbench/action";
const UI_ACTIONS = /* @__PURE__ */ new Set(["sync", "connect", "disconnect", "run", "build", "cancel"]);
const SIGN_PATH = "/android-workbench/sign";
const SIGN_ACTIONS = /* @__PURE__ */ new Set(["package", "sign"]);
const OBSERVE_BODY_LIMIT = 65536;
const LONG = /* @__PURE__ */ new Set(["run", "build", "package", "sign", "sync"]);
const PACKAGE_FIELDS = /* @__PURE__ */ new Set(["action", "projectRoot", "module", "variant", "format", "skipResource", "keystore", "alias", "storePasswordEnv", "keyPasswordEnv", "output"]);
const FIELDS = {
  action: { type: "string", enum: ACTIONS, description: "project statically discovers App modules; sync runs the Gradle wrapper tasks listing to capture real variants; devices lists ADB devices; run builds, installs and starts a Debug app; build produces APK/AAB; package builds then signs its single exact artifact; sign signs an existing artifact; jobs lists this session\u2019s latest Android jobs; status/cancel use jobId." },
  projectRoot: { type: "string", description: "Expected canonical project root from project; mismatches abort rather than changing the workspace. Omit for project/jobs/status/cancel." },
  module: { type: "string", description: "Exact Gradle App module path from project, e.g. :app-hanna." },
  variant: { type: "string", description: "Exact variant/task suffix. Defaults to the module safe Debug variant. Upload/hardening on-flavors are not supported." },
  serial: { type: "string", description: "Explicit ADB serial for device-specific actions; select a device whose state is device." },
  address: { type: "string", description: "Explicit host:port for connect/disconnect/pair; disconnect never targets all devices." },
  pairingCodeEnv: { type: "string", description: "ANDROID_* environment-variable name containing the wireless pairing code, never the code itself." },
  apk: { type: "string", description: "Existing APK path within the selected session project, for install." },
  packageName: { type: "string", description: "Exact installed applicationId for uninstall/stop. Uninstall removes that app and its data." },
  format: { type: "string", enum: ["apk", "aab"], description: "Build artifact format; default apk." },
  skipResource: { type: "boolean", description: "Explicitly exclude the selected module generateTeyesResourceMain task only when that resource task is missing." },
  artifact: { type: "string", description: "Existing APK/AAB path within the project to sign." },
  output: { type: "string", description: "New signed artifact path within the project. Existing files and in-place signing are refused." },
  keystore: { type: "string", description: "Existing local keystore path, read-only; may be outside the project." },
  alias: { type: "string", description: "Keystore key alias for signing." },
  storePasswordEnv: { type: "string", description: "ANDROID_* environment-variable name containing the store password; defaults to ANDROID_STORE_PASSWORD." },
  keyPasswordEnv: { type: "string", description: "ANDROID_* environment-variable name containing the key password; defaults to ANDROID_KEY_PASSWORD." },
  jobId: { type: "string", description: "Job id returned by run/build/package/sign or listed by jobs in this session." },
  from: { type: "integer", description: "Output byte cursor for status; default 0. Continue with output.next." }
};
const parameters = { type: "object", properties: FIELDS, required: ["action"], additionalProperties: false };
function validateRequest(args) {
  if (!args || typeof args !== "object" || Array.isArray(args) || !ACTIONS.includes(args.action)) throw new Error("Unknown Android action");
  for (const [key, value] of Object.entries(args)) {
    const spec = FIELDS[key];
    if (!spec) throw new Error("Unknown Android request field");
    if (spec.type === "integer" ? !Number.isSafeInteger(value) || value < 0 : typeof value !== spec.type) throw new Error(`Invalid Android field: ${key}`);
    if (typeof value === "string" && (value.length > 4096 || /[\x00-\x1f]/.test(value))) throw new Error(`Invalid Android field: ${key}`);
    if (spec.enum && !spec.enum.includes(value)) throw new Error(`Invalid Android field: ${key}`);
  }
  if (args.action === "package") {
    for (const key of Object.keys(args)) if (!PACKAGE_FIELDS.has(key)) throw new Error("Unsupported field for package; its source artifact comes only from this build");
  }
  return { ...args };
}
function validatePackage(args, credentials) {
  if (typeof args.keystore !== "string" || !args.keystore.trim()) throw new Error("A keystore path is required for package");
  if (typeof args.alias !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(args.alias)) throw new Error("A valid key alias is required for package");
  if (typeof args.output !== "string" || !args.output.trim()) throw new Error("A new signed output path is required for package");
  const format = args.format ?? "apk";
  if (path.extname(args.output).toLowerCase() !== `.${format}`) throw new Error("Signed output extension must match the selected package format");
  if (credentials) return;
  for (const name of [args.storePasswordEnv ?? "ANDROID_STORE_PASSWORD", args.keyPasswordEnv ?? "ANDROID_KEY_PASSWORD"]) {
    if (!/^ANDROID_[A-Z0-9_]+$/.test(name)) throw new Error("Signing credentials must reference ANDROID_* environment variable names");
    if (typeof process.env[name] !== "string" || !process.env[name]) throw new Error(`Required environment variable ${name} is not set`);
  }
}
async function preflightPackage(core, root, args, signal) {
  signal.throwIfAborted();
  const output = await core._inside(root, args.output, { exists: false, mutable: true });
  try {
    await lstat(output);
    throw new Error("Signing output already exists; choose a new file before packaging");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const keystore = await stat(path.resolve(root, args.keystore));
  if (!keystore.isFile()) throw new Error("Keystore must be a regular file");
  signal.throwIfAborted();
}
function jobContext(root, args) {
  const result = { root, action: args.action };
  for (const key of ["module", "variant", "format", "serial"]) if (args[key] !== void 0) result[key] = args[key];
  if (["build", "package"].includes(args.action) && result.format === void 0) result.format = "apk";
  return result;
}
function successSummary(action, value) {
  const paths = /* @__PURE__ */ new Set();
  for (const artifact of value?.artifacts ?? []) if (typeof artifact?.path === "string") paths.add(artifact.path);
  if (typeof value?.output === "string") paths.add(value.output);
  return redact(`
Android ${action} completed.
${[...paths].slice(0, 64).join("\n")}${paths.size ? "\n" : ""}`).slice(0, 12e3);
}
class PackageError extends Error {
  constructor(message, result) {
    super(message);
    this.packageResult = result;
  }
}
function safeMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function json(value) {
  return JSON.stringify(value);
}
function redact(text) {
  let result = String(text);
  const secrets = Object.entries(process.env).filter(([key, value]) => value && /^ANDROID_/.test(key) && /PASSWORD|SECRET|TOKEN|PAIR.*CODE/i.test(key)).map(([, value]) => value).sort((a, b) => b.length - a.length);
  for (const value of secrets) result = result.split(value).join("[REDACTED]");
  return result;
}
class HarnessAndroidService {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = /* @__PURE__ */ new Set();
    this.pending = /* @__PURE__ */ new Set();
    this.results = /* @__PURE__ */ new Map();
    this.ownedJobs = /* @__PURE__ */ new Map();
    this.jobContexts = /* @__PURE__ */ new Map();
    this.locks = /* @__PURE__ */ new Map();
    this.disposed = false;
    this.lifetime = new AbortController();
    this.run = createRunner(ctx.subprocess, { active: this.active });
  }
  async execute(input, { agent, signal, source = "tool", callId, rootCallId, credentials } = {}) {
    const { projectRoot, ...args } = validateRequest(input);
    signal = signal ? AbortSignal.any([signal, this.lifetime.signal]) : this.lifetime.signal;
    signal.throwIfAborted();
    if (this.disposed) throw new Error("Android workbench is unloading");
    if (!agent) throw new Error("Choose a live session first");
    if (args.action === "jobs") {
      const jobs = [];
      for (const [id2, owner] of [...this.ownedJobs].reverse()) {
        if (owner !== agent.id) continue;
        const context = this.jobContexts.get(id2);
        if (!context) continue;
        try {
          jobs.push({ ...this.ctx.jobs.get(id2, agent.id), context: { ...context } });
        } catch {
          this.ownedJobs.delete(id2);
          this.jobContexts.delete(id2);
          this.results.delete(id2);
        }
        if (jobs.length === 20) break;
      }
      return { jobs };
    }
    if (args.action === "status" || args.action === "cancel") {
      if (!args.jobId) throw new Error("jobId is required");
      if (this.ownedJobs.get(args.jobId) !== agent.id) throw new Error("Unknown or foreign Android job");
      if (args.action === "cancel") return { status: this.ctx.jobs.kill(args.jobId, agent.id, "Android operation cancelled by caller") };
      const job = this.ctx.jobs.get(args.jobId, agent.id);
      const output = this.ctx.jobs.readAt(args.jobId, args.from ?? 0, agent.id);
      let budget = 32e3;
      const chunks = [];
      for (const chunk of [...output.chunks].reverse()) {
        if (budget <= 0) break;
        const text = chunk.text.slice(-budget);
        budget -= text.length;
        chunks.unshift({ ...chunk, text });
      }
      return { job, output: { ...output, chunks, lossy: output.lossy || output.chunks.reduce((n, c) => n + c.text.length, 0) > 32e3 }, result: this.results.get(args.jobId) ?? null };
    }
    const root = await realpath(await this.ctx.workingDirectory.ensure(agent, signal));
    if (args.action !== "project" && projectRoot !== void 0 && projectRoot !== root) throw new Error("Project root changed; refresh the current project before running this operation");
    if (args.action === "package") validatePackage(args, credentials);
    if (!READS.has(args.action) && source !== "ui") {
      const policy = this.ctx.sandboxPolicy.resolve({ session: agent.session });
      if (policy.mode !== "danger-full-access") {
        const outcome = await this.ctx.approval.request({
          agent,
          toolName: "android_workbench",
          callId,
          signal,
          reason: `Android ${args.action} in ${root}; module=${args.module ?? "-"} variant=${args.variant ?? "safe Debug default"} device=${args.serial ?? args.address ?? "-"} package=${args.packageName ?? "-"} artifact=${args.artifact ?? args.apk ?? "-"} output=${args.output ?? "-"}. Native ADB/Gradle/signing requires host-device access and may write SDK/Gradle caches outside the workspace. Allow this exact operation once?`,
          displayReason: { en: `Allow Android ${args.action} with native host/device access for this operation?`, zh: `\u662F\u5426\u5141\u8BB8\u672C\u6B21 Android ${args.action} \u4F7F\u7528\u4E3B\u673A/\u8BBE\u5907\u6743\u9650\uFF1FGradle/ADB \u53EF\u80FD\u5199\u5165\u5DE5\u4F5C\u533A\u5916\u7684\u7F13\u5B58\u3002` }
        });
        if (outcome !== "allowed-once") throw new Error(`Android operation not authorized (${outcome})`);
      }
    }
    signal?.throwIfAborted();
    if (this.disposed) throw new Error("Android workbench is unloading");
    if (this.locks.has(root) && !["project", "devices", "artifacts", "logcat"].includes(args.action)) throw new Error("An Android build/package/sign/run is already active in this project; wait or cancel it first");
    const core = new AndroidWorkbench({ root, run: this.run, env: process.env });
    if (args.action === "package") {
      const preflight = preflightPackage(core, root, args, signal);
      this.pending.add(preflight);
      try {
        await preflight;
      } finally {
        this.pending.delete(preflight);
      }
    }
    signal.throwIfAborted();
    if (this.disposed) throw new Error("Android workbench is unloading");
    if (this.locks.has(root) && LONG.has(args.action)) throw new Error("An Android build/package/sign/run is already active in this project; wait or cancel it first");
    if (!LONG.has(args.action)) {
      const operation = core.execute(args, { signal });
      this.pending.add(operation);
      try {
        return await operation;
      } finally {
        this.pending.delete(operation);
      }
    }
    const controller = new AbortController();
    let id;
    id = this.ctx.jobs.start({
      kind: "android",
      owner: agent.id,
      label: `Android ${args.action}: ${args.module ?? args.artifact ?? ""} ${args.variant ?? ""}`.trim(),
      outputLimitBytes: 262144,
      ...source === "tool" && callId ? { toolCall: { callId, rootCallId: rootCallId ?? callId } } : {},
      run: (job) => {
        this.locks.set(root, job.id);
        const promise = Promise.resolve().then(async () => {
          try {
            const operationContext = { signal: controller.signal, credentials, onOutput: (text) => job.append(redact(typeof text === "string" ? text : text.text ?? ""), { channel: "log" }) };
            const value = args.action === "package" ? await this.package(core, args, operationContext, job) : await core.execute(args, operationContext);
            controller.signal.throwIfAborted();
            this.results.set(job.id, value);
            job.append(successSummary(args.action, value), { channel: "log" });
            return { status: "completed", result: json(value) };
          } catch (error) {
            const message = redact(safeMessage(error)).slice(0, 4e3);
            this.results.set(job.id, error instanceof PackageError ? { ...error.packageResult, error: message } : { error: message });
            job.append(`
${message}
`, { channel: "stderr" });
            return { status: controller.signal.aborted ? "killed" : "failed", detail: message };
          } finally {
            if (this.locks.get(root) === job.id) this.locks.delete(root);
          }
        });
        this.pending.add(promise);
        promise.then(() => this.pending.delete(promise), () => this.pending.delete(promise));
        return { cancel: () => controller.abort(new Error("Android operation cancelled")), done: promise };
      }
    });
    this.ownedJobs.set(id, agent.id);
    this.jobContexts.set(id, jobContext(root, args));
    if (this.results.size > 64) this.results.delete(this.results.keys().next().value);
    return { jobId: id, status: "running" };
  }
  async package(core, args, context, job) {
    const { signal } = context;
    const format = args.format ?? "apk";
    const buildArgs = { action: "build", format };
    for (const key of ["module", "variant", "skipResource"]) if (args[key] !== void 0) buildArgs[key] = args[key];
    job.updateProgress(`Building ${format.toUpperCase()}`);
    const built = await core.execute(buildArgs, context);
    signal.throwIfAborted();
    if (!built || built.action !== "build" || built.format !== format || typeof built.module !== "string" || typeof built.variant !== "string" || args.module !== void 0 && built.module !== args.module || args.variant !== void 0 && built.variant !== args.variant || !Array.isArray(built.artifacts)) throw new Error("Build returned no exact package result; signing was not started");
    const buildResult = { action: "package", module: built.module, variant: built.variant, format, artifacts: built.artifacts.slice(0, 64), warnings: built.warnings ?? [] };
    if (built.artifacts.length !== 1) throw new PackageError("Packaging requires exactly one artifact; choose one explicitly from the artifact cards and sign it separately", buildResult);
    const artifact = built.artifacts[0];
    const lowerFirst = (value) => value[0]?.toLowerCase() + value.slice(1);
    if (!artifact || typeof artifact.path !== "string" || artifact.format !== format || path.extname(artifact.path).toLowerCase() !== `.${format}` || typeof artifact.variant !== "string" || lowerFirst(artifact.variant) !== lowerFirst(built.variant)) throw new PackageError("Build artifact does not match the exact requested package variant/format; signing was not started", buildResult);
    const relative = path.relative(core.root, artifact.path);
    if (!path.isAbsolute(artifact.path) || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new PackageError("Build artifact is outside the current project; signing was not started", buildResult);
    const signArgs = { action: "sign", format, artifact: artifact.path, output: args.output, keystore: args.keystore, alias: args.alias };
    for (const key of ["storePasswordEnv", "keyPasswordEnv"]) if (args[key] !== void 0) signArgs[key] = args[key];
    signal.throwIfAborted();
    job.updateProgress(`Signing ${format.toUpperCase()}`);
    let signed;
    try {
      signed = await core.execute(signArgs, context);
      signal.throwIfAborted();
      if (!signed || signed.verified !== true || signed.format !== format || signed.output !== path.resolve(core.root, args.output)) throw new Error("Signing did not verify the expected output");
    } catch (error) {
      if (signal.aborted) throw error;
      throw new PackageError(safeMessage(error), buildResult);
    }
    return { action: "package", module: built.module, variant: built.variant, format, artifacts: [{ path: signed.output, format, verified: true }], output: signed.output, verified: true, warnings: built.warnings ?? [] };
  }
  async dispose() {
    this.disposed = true;
    this.lifetime.abort(new Error("Android plugin unloaded"));
    for (const [id, owner] of this.ownedJobs) {
      try {
        this.ctx.jobs.kill(id, owner, "Android plugin unloaded");
      } catch {
      }
    }
    for (const child of this.active) child.terminate();
    await Promise.allSettled([...this.pending, ...[...this.active].map((child) => child.waitForExit())]);
    this.results.clear();
    this.ownedJobs.clear();
    this.jobContexts.clear();
  }
}
function sendJson(res, status, value) {
  if (res.writableEnded || res.destroyed) return void 0;
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
  return void 0;
}
function readBody(req, limit, signal) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    const cleanup = () => {
      req.off("data", data);
      req.off("end", end);
      req.off("aborted", aborted);
      signal?.removeEventListener("abort", cancelled);
    };
    const finish = (failure, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (failure) reject(failure);
      else resolve(value);
    };
    const data = (chunk) => {
      size += chunk.length;
      if (size > limit) {
        finish(new Error("Android request is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    };
    const end = () => finish(null, Buffer.concat(chunks).toString("utf8"));
    const error = (failure) => finish(failure);
    const aborted = () => finish(new Error("Android request was aborted"));
    const cancelled = () => finish(signal.reason ?? new Error("Android request was cancelled"));
    req.on("data", data);
    req.on("end", end);
    req.on("error", error);
    req.on("aborted", aborted);
    req.once("close", () => req.off("error", error));
    signal?.addEventListener("abort", cancelled, { once: true });
    if (signal?.aborted) cancelled();
  });
}
function admitBrowser(service, req, res) {
  const connection = service.ctx.connection;
  if (!connection?.admit || !connection.browserPeer) {
    sendJson(res, 503, { ok: false, error: "Browser authentication is unavailable" });
    return false;
  }
  const admission = connection.admit(req);
  if (admission.rejection) {
    sendJson(res, admission.rejection, { ok: false, error: "Browser authentication required" });
    return false;
  }
  if (admission.peer?.id !== connection.browserPeer.id) {
    sendJson(res, 403, { ok: false, error: "This endpoint requires the authenticated browser" });
    return false;
  }
  return true;
}
const LOOPBACK_HOSTS = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
function sameLoopbackOrigin(origin, expected) {
  if (!origin) return true;
  try {
    const actual = new URL(origin);
    const target = new URL(expected);
    if (actual.protocol !== target.protocol) return false;
    if (actual.port !== target.port) return false;
    return LOOPBACK_HOSTS.has(actual.hostname) && LOOPBACK_HOSTS.has(target.hostname);
  } catch {
    return false;
  }
}
function createObserveHandler(service, originOf = () => "") {
  return async function observe(req, res) {
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort(new Error("Client closed the Android observation"));
    });
    try {
      if (req.method !== "POST") throw new Error("Android observation requires POST");
      if (req.headers["x-awb-observe"] !== "1") throw new Error("Missing Android observation header");
      const origin = originOf();
      if (origin && !sameLoopbackOrigin(req.headers.origin, origin)) throw new Error("Foreign origin");
      if (!admitBrowser(service, req, res)) return;
      const raw = await readBody(req, OBSERVE_BODY_LIMIT, controller.signal);
      let request;
      try {
        request = JSON.parse(raw);
      } catch {
        throw new Error("Invalid Android observation JSON");
      }
      if (!request || typeof request.sessionId !== "string" || !request.sessionId || request.sessionId.length > 256) throw new Error("A session id is required");
      const args = request.args;
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Invalid Android observation request");
      if (!OBSERVE_ACTIONS.has(args.action)) throw new Error("This Android observation is not read-only");
      const agent = service.ctx.agents.get(request.sessionId);
      if (!agent) return sendJson(res, 404, { ok: false, error: "Unknown session" });
      const value = await service.execute(args, { agent, signal: controller.signal, source: "ui" });
      return sendJson(res, 200, { ok: true, value });
    } catch (error) {
      if (res.writableEnded || res.destroyed) return void 0;
      return sendJson(res, 400, { ok: false, error: redact(safeMessage(error)).slice(0, 4e3) });
    }
  };
}
function createActionHandler(service, originOf = () => "") {
  return async function action(req, res) {
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort(new Error("Client closed the Android action"));
    });
    try {
      if (req.method !== "POST") throw new Error("Android action requires POST");
      if (req.headers["x-awb-action"] !== "1") throw new Error("Missing Android action header");
      if ((req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase() !== "application/json") throw new Error("Android action requires JSON");
      if (!req.headers.origin) throw new Error("Missing Android action origin");
      const origin = originOf();
      if (origin && !sameLoopbackOrigin(req.headers.origin, origin)) throw new Error("Foreign origin");
      if (!admitBrowser(service, req, res)) return;
      let request;
      try {
        request = JSON.parse(await readBody(req, OBSERVE_BODY_LIMIT, controller.signal));
      } catch {
        throw new Error("Invalid Android action JSON");
      }
      if (!request || typeof request !== "object" || Array.isArray(request) || Object.keys(request).some((key) => !["sessionId", "args"].includes(key))) throw new Error("Invalid Android action envelope");
      if (typeof request.sessionId !== "string" || !request.sessionId || request.sessionId.length > 256) throw new Error("A session id is required");
      const args = validateRequest(request.args);
      if (!UI_ACTIONS.has(args.action)) throw new Error("This action is not available through the toolbar endpoint");
      const agent = service.ctx.agents.get(request.sessionId);
      if (!agent) return sendJson(res, 404, { ok: false, error: "Unknown session" });
      const value = await service.execute(args, { agent, signal: controller.signal, source: "ui" });
      return sendJson(res, 200, { ok: true, value });
    } catch (error) {
      if (res.writableEnded || res.destroyed) return void 0;
      return sendJson(res, 400, { ok: false, error: redact(safeMessage(error)).slice(0, 4e3) });
    }
  };
}
function createSignHandler(service, originOf = () => "") {
  return async function sign(req, res) {
    const controller = new AbortController();
    const scrubValues = [];
    const scrub = (text) => {
      let out = String(text);
      for (const value of scrubValues) if (typeof value === "string" && value) out = out.split(value).join("[REDACTED]");
      return redact(out);
    };
    res.on("close", () => {
      if (!res.writableEnded) controller.abort(new Error("Client closed the Android signing request"));
    });
    try {
      if (req.method !== "POST") throw new Error("Android signing requires POST");
      if (req.headers["x-awb-observe"] !== "1") throw new Error("Missing Android signing header");
      const origin = originOf();
      if (origin && !sameLoopbackOrigin(req.headers.origin, origin)) throw new Error("Foreign origin");
      if (!admitBrowser(service, req, res)) return;
      let request;
      try {
        request = JSON.parse(await readBody(req, OBSERVE_BODY_LIMIT, controller.signal));
      } catch {
        throw new Error("Invalid Android signing JSON");
      }
      if (!request || typeof request.sessionId !== "string" || !request.sessionId || request.sessionId.length > 256) throw new Error("A session id is required");
      const args = request.args;
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Invalid Android signing request");
      if (!SIGN_ACTIONS.has(args.action)) throw new Error("This Android request is not a signing action");
      const credentials = request.credentials;
      if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) throw new Error("Signing credentials are required");
      if (typeof credentials.storePassword !== "string" || typeof credentials.keyPassword !== "string") throw new Error("Both signing passwords are required");
      for (const value2 of [credentials.storePassword, credentials.keyPassword]) {
        if (!value2 || value2.length > 1024 || value2.includes("\0")) throw new Error("Signing passwords must be non-empty strings without NUL characters");
      }
      scrubValues.push(credentials.storePassword, credentials.keyPassword);
      const agent = service.ctx.agents.get(request.sessionId);
      if (!agent) return sendJson(res, 404, { ok: false, error: "Unknown session" });
      const value = await service.execute(args, { agent, signal: controller.signal, source: "ui", credentials });
      return sendJson(res, 200, { ok: true, value });
    } catch (error) {
      if (res.writableEnded || res.destroyed) return void 0;
      return sendJson(res, 400, { ok: false, error: scrub(safeMessage(error)).slice(0, 4e3) });
    }
  };
}
function apply(ctx) {
  const service = new HarnessAndroidService(ctx);
  ctx.effect(() => () => service.dispose());
  ctx.effect(() => ctx.jobs.attachController("android-workbench"));
  const originOf = () => {
    try {
      return ctx.webServer.getOrigin();
    } catch {
      return "";
    }
  };
  if (ctx.webServer?.register) ctx.effect(() => {
    const routes = [
      ctx.webServer.register({ kind: "exact", path: OBSERVE_PATH, handler: createObserveHandler(service, originOf) }),
      ctx.webServer.register({ kind: "exact", path: ACTION_PATH, handler: createActionHandler(service, originOf) }),
      ctx.webServer.register({ kind: "exact", path: SIGN_PATH, handler: createSignHandler(service, originOf) })
    ];
    return () => {
      for (const dispose of routes.reverse()) dispose();
    };
  });
  ctx.on("agent/disposed", ({ agent }) => {
    for (const [id, owner] of service.ownedJobs) if (owner === agent.id) {
      service.ownedJobs.delete(id);
      service.results.delete(id);
      service.jobContexts.delete(id);
    }
  });
  ctx.effect(() => ctx.commands.register({
    name: "android-workbench",
    description: "Android \u5DE5\u4F5C\u53F0\uFF1AADB \u8BBE\u5907\u3001App \u7F16\u8BD1\u8FD0\u884C\u3001APK/AAB \u6253\u5305\u4E0E\u7B7E\u540D",
    // Even malformed input must not persist an accidentally pasted secret.
    recordInput: false,
    input: { hint: "JSON action and parameters (never enter passwords)" },
    handler: async ({ agent, rawInput, signal }) => {
      try {
        if (rawInput.length > 16384) throw new Error("Android request is too large");
        let args;
        try {
          args = JSON.parse(rawInput.trim() || '{"action":"project"}');
        } catch {
          throw new Error("Invalid Android request JSON");
        }
        const value = await service.execute(args, { agent, signal, source: "ui" });
        return { kind: "success", text: json({ ok: true, value }) };
      } catch (error) {
        return { kind: "error", text: redact(safeMessage(error)).slice(0, 4e3) };
      }
    }
  }));
  ctx.effect(() => ctx.tools.register({
    name: "android_workbench",
    description: "Manage ADB devices and Android App development in the current session project. project is static discovery without Gradle; run/build/package/sign return a jobId, jobs recovers this session\u2019s latest Android jobs, and status/cancel observe or stop one. Native host/device operations require Full Access or one-shot user approval; uninstall deletes app data. Passwords and pairing codes are accepted only by ANDROID_* environment-variable reference.",
    parameters,
    output: { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: json(value) }] },
    isConcurrencySafe: (args) => ["project", "artifacts", "jobs", "status"].includes(args?.action),
    execute: async (args, exec) => service.execute(args, { agent: exec.agent, signal: exec.signal, callId: exec.callId, rootCallId: exec.rootCallId })
  }));
}
export {
  ACTION_PATH,
  HarnessAndroidService,
  OBSERVE_ACTIONS,
  OBSERVE_PATH,
  SIGN_PATH,
  UI_ACTIONS,
  apply,
  createActionHandler,
  createObserveHandler,
  createSignHandler,
  inject,
  parameters,
  sameLoopbackOrigin,
  validateRequest
};
