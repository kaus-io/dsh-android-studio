import { StringDecoder } from 'node:string_decoder';

interface RunnerEvent { stream: 'stdout' | 'stderr'; text: string }
interface RunnerOptions {
  cwd?: string;
  signal?: AbortSignal;
  onOutput?: (event: RunnerEvent) => void;
  env?: Record<string, string | undefined>;
  stdin?: string;
  timeoutMs?: number;
}
interface RunnerResult { exitCode: number; signal: any; stdout: string; stderr: string }
export interface Runner {
  (argv: string[], options?: RunnerOptions): Promise<RunnerResult>;
}
interface SubprocessProvider {
  resolveExecutable(name: string, env?: any, signal?: AbortSignal): Promise<string>;
  spawn(spec: any): any;
}

/** Execute argv through Harness's managed subprocess provider, never through a shell. */
export function createRunner(subprocess: SubprocessProvider, { active = new Set<any>(), maxOutput = 262144 }: { active?: Set<any>; maxOutput?: number } = {}): Runner {
  return async function run(argv, { cwd, signal, onOutput = () => {}, env, stdin, timeoutMs = 120000 }: RunnerOptions = {}) {
    signal?.throwIfAborted();
    if (!Array.isArray(argv) || !argv.length || argv.some(x => typeof x !== 'string' || x.includes('\0'))) throw new Error('Invalid process argv');
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(new Error('Process deadline exceeded')); }, Math.min(Math.max(timeoutMs, 1000), 3600000));
    timer.unref?.();
    let child: any;
    try {
      const executable = await subprocess.resolveExecutable(argv[0]!, env, controller.signal);
      child = subprocess.spawn({
        argv: [executable, ...argv.slice(1)], cwd, env,
        signal: controller.signal, graceMs: 3000,
        stdio: { stdin: stdin === undefined ? 'ignore' : { data: stdin }, stdout: 'pipe', stderr: 'pipe' },
      });
      active.add(child);
      const outputs: Record<string, string> = { stdout: '', stderr: '' };
      const readers = (['stdout', 'stderr'] as const).map(async channel => {
        const decoder = new StringDecoder('utf8');
        const consume = (text: string) => {
          if (!text) return;
          outputs[channel] = (outputs[channel]! + text).slice(-maxOutput);
          onOutput({ stream: channel, text });
        };
        try {
          if (child[channel]) for await (const bytes of child[channel]) consume(decoder.write(Buffer.from(bytes)));
          consume(decoder.end());
        } catch (error) { child.terminate(); throw error; }
      });
      // Always drain streams and the managed process, including on failure/cancellation.
      const settled: any[] = await Promise.allSettled([child.done, ...readers]);
      const rejected = settled.find(item => item.status === 'rejected');
      if (rejected) throw rejected.reason;
      if (timedOut) throw new Error(`Process timed out after ${timeoutMs} ms`);
      signal?.throwIfAborted();
      const outcome = settled[0]!.value;
      return { exitCode: outcome.exitCode, signal: outcome.signal, ...outputs } as RunnerResult;
    } finally {
      // done may settle before managed descendants exit. Keep cancellation and
      // ownership live until the provider confirms whole-range quiescence.
      try {
        if (child) await child.waitForExit();
        if (timedOut) throw new Error(`Process timed out after ${timeoutMs} ms`);
        signal?.throwIfAborted();
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (child) active.delete(child);
      }
    }
  };
}
