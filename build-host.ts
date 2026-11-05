/**
 * Build the Host half from TypeScript into the ESM `.js` files the profile loads.
 *
 * The three modules stay separate (no bundling): `index.js` keeps importing
 * `./android.js` and `./runner.js`, so a single module instance is shared with
 * anything that imports the same file. With `--check` nothing is written and
 * the committed files must match a fresh build.
 */
import { build } from 'esbuild'
import type { BuildResult } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 一个需要提交的生成产物。 / One committed generated artifact. */
interface Artifact {
  readonly file: string
  readonly text: string
}

const root = dirname(fileURLToPath(import.meta.url))
const check = process.argv.includes('--check')

const result: BuildResult = await build({
  absWorkingDir: root,
  entryPoints: ['index.ts', 'runner.ts', 'android.ts'],
  outdir: root,
  bundle: false,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  legalComments: 'none',
  logLevel: 'silent',
})

const artifacts: Artifact[] = (result.outputFiles ?? []).map(file => ({
  file: relative(root, file.path),
  text: file.text,
})).sort((a, b) => a.file.localeCompare(b.file))

if (artifacts.length !== 3) throw new Error(`expected 3 host artifacts, got ${artifacts.length}`)

if (check) {
  for (const artifact of artifacts) {
    const current = await readFile(join(root, artifact.file), 'utf8')
    if (current !== artifact.text) throw new Error(`${artifact.file} is stale; run node build-host.mjs`)
  }
  console.log(`host artifacts are current: ${artifacts.map(artifact => artifact.file).join(', ')}`)
} else {
  for (const artifact of artifacts) await writeFile(join(root, artifact.file), artifact.text, 'utf8')
  console.log(`built host: ${artifacts.map(artifact => artifact.file).join(', ')}`)
}
