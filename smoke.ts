/**
 * Workspace smoke test for the merged Android Studio browser half.
 *
 * Loads the generated bundle the way the browser module loader does, applies it
 * to a fake Client context, checks that both halves registered their Harness
 * seats, and renders the code-reader body once with a minimal React shim.
 * Not a browser test and not a preview page.
 *
 * The fake services and React shim are intentionally dynamic, so their
 * boundaries are typed loosely; the assertions below are the real contract.
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/** 浏览器模块表里注册的插件模块。 / The plugin module registered with the browser module table. */
interface ModuleDefinition {
  id: string
  factory: (require: (id: string) => unknown) => ClientExports
}

/** 客户端模块导出的 `apply` / `inject` 面。 / The `apply` / `inject` face a client module exports. */
interface ClientExports {
  apply: (ctx: unknown) => void
  inject: string[]
}

type AnyProps = Record<string, any>

/** 遍历渲染树时的计数结果。 / Counts collected while walking the rendered tree. */
interface WalkResult {
  rows: number
  text: string
  nodes: number
}

const here = path.dirname(fileURLToPath(import.meta.url))
const entry = path.join(here, 'client.js')

const storage = new Map<string, unknown>()
let captured: ModuleDefinition | undefined
;(globalThis as unknown as { window?: unknown }).window = {
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener() {},
  removeEventListener() {},
  localStorage: {
    getItem(key: string) {
      return storage.has(key) ? storage.get(key) : null
    },
    setItem(key: string, value: unknown) {
      storage.set(key, String(value))
    },
  },
  getSelection() {
    return null
  },
  __ModuleLoader__: {
    load(definition: ModuleDefinition) {
      captured = definition
    },
  },
}

await import(entry)

if (captured === undefined) throw new Error('module loader was not called')
if (captured.id !== '@kaus-io/dsh-android-studio') throw new Error(`unexpected module id: ${captured.id}`)

/* ------------------------------------------------------------ React shim */

const element = (type: unknown, props: AnyProps | null): unknown => ({ type, props: props ?? {} })

const React = {
  createElement(type: unknown, props: AnyProps | null, ...children: unknown[]): unknown {
    return element(type, { ...(props ?? {}), ...(children.length === 0 ? {} : { children: children.length === 1 ? children[0] : children }) })
  },
  Fragment: Symbol.for('react.fragment'),
  memo(component: unknown): unknown {
    return component
  },
  useMemo(factory: () => unknown): unknown {
    return factory()
  },
  useCallback(fn: unknown): unknown {
    return fn
  },
  useRef(initial: unknown): { current: unknown } {
    return { current: initial }
  },
  useState(initial: unknown): unknown {
    return [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}]
  },
  useReducer(reducer: unknown, initial: unknown): unknown {
    return [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}]
  },
  useEffect(): void {},
  useLayoutEffect(): void {},
  useDeferredValue(value: unknown): unknown {
    return value
  },
}
const jsxRuntime = { jsx: element, jsxs: element, Fragment: React.Fragment }

const exports = captured.factory((id) => {
  if (id === 'react') return React
  if (id === 'react/jsx-runtime') return jsxRuntime
  throw new Error(`unexpected require: ${id}`)
})

/* --------------------------------------------------------------- context */

const effects: Array<{ label: string; dispose: () => void }> = []
const registrations = { previews: [] as AnyProps[], slots: [] as AnyProps[], tabs: [] as AnyProps[], locales: [] as unknown[][] }
const translate = (key: string, params?: Record<string, unknown>): string => {
  if (params === undefined) return key
  return key.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`))
}

const ctx = {
  effect(factory: () => () => void, label: string) {
    effects.push({ label, dispose: factory() })
  },
  inject(services: string[], callback: (ctx: unknown) => void) {
    callback(ctx)
  },
  locale: {
    register(...args: unknown[]) {
      registrations.locales.push(args)
      return () => {}
    },
    bind() {
      return translate
    },
  },
  slots: {
    inject(key: string, callback: () => void) {
      if (typeof key !== 'string') throw new Error('slot key must be a string')
      callback()
      return () => {}
    },
    register(options: AnyProps, component: unknown) {
      if (typeof options?.name !== 'string') throw new Error('slot registration needs a name')
      registrations.slots.push({ options, component })
      return () => {}
    },
  },
  documentPreviews: {
    register(definition: AnyProps) {
      registrations.previews.push(definition)
      return () => {}
    },
  },
  sidebarRightTabs: {
    register(definition: AnyProps) {
      registrations.tabs.push(definition)
      return () => {}
    },
  },
  sidebarRight: {
    openTab() {},
  },
}

if (!Array.isArray(exports.inject)) throw new Error('merged inject face is missing')
for (const service of ['documentPreviews', 'slots', 'locale', 'sidebarRightTabs', 'sidebarRight']) {
  if (!exports.inject.includes(service)) throw new Error(`merged inject is missing ${service}`)
}
if (typeof exports.apply !== 'function') throw new Error('apply is not exported')

exports.apply(ctx)

/* -------------------------------------------------------------- assertions */

if (!registrations.locales.some((args) => args[0] === 'androidWorkbench')) throw new Error('Android locale namespace missing')
if (!registrations.locales.some((args) => args[0] === 'androidStudioCodeReader')) throw new Error('reader locale namespace missing')

const toolbar = registrations.slots.find((slot) => slot.options.name === 'conversation.session.header.utilities')
if (toolbar === undefined) throw new Error('Android session toolbar was not registered')
if (toolbar.options.id !== 'android-studio-session-toolbar') throw new Error('unexpected toolbar id')

const tasks = registrations.slots.find((slot) => slot.options.name === 'sidebar.right.pane.tab')
if (tasks === undefined) throw new Error('Android tasks tab body was not registered')
if (!registrations.tabs.some((tab) => tab.kind === 'androidTasks')) throw new Error('Android tasks tab type was not registered')

const preview = registrations.previews[0]
if (preview === undefined) throw new Error('code reader preview was not registered')
if (preview.id !== '@kaus-io/dsh-android-studio/code-reader') throw new Error(`unexpected reader id: ${preview.id}`)
if (preview.priority !== 'extension' || preview.loading !== 'text-pages' || preview.wrap !== true) throw new Error('reader preview metadata is wrong')
if (!preview.extensions.includes('kt') || !preview.extensions.includes('java')) throw new Error('reader extensions are incomplete')

const body = registrations.slots.find((slot) => slot.options.name === 'sidebar.right.tab.document')
if (body === undefined) throw new Error('code reader document body was not registered')
if (body.options.key !== preview.id) throw new Error('reader body key must match the preview id')

/* -------------------------------------------------------------- one render */

const code = [
  'package demo',
  '',
  'class Point(val x: Int) {',
  '    fun distance(other: Point): Int {',
  '        return x - other.x',
  '    }',
  '}',
].join('\n')
const address = 'dsh-resource://file/session/s1/demo/Point.kt'
const tree = body.component({
  resourceAddress: address,
  content: { kind: 'text', text: code, pages: [{ offset: 1, lines: 7, text: code }], eof: true },
  wrap: false,
  scrollportRef() {},
  useTabInfo: () => ({ tab: { id: 't1', contentId: address, title: 'Point.kt', navigation: { params: undefined, revision: 0 } } }),
  t: translate,
})

function walk(node: any, depth = 0): WalkResult {
  if (depth > 40) return { rows: 0, text: '', nodes: 0 }
  if (node === null || node === undefined || typeof node === 'boolean') return { rows: 0, text: '', nodes: 0 }
  if (typeof node === 'string' || typeof node === 'number') return { rows: 0, text: String(node), nodes: 1 }
  if (Array.isArray(node)) {
    let rows = 0
    let text = ''
    let nodes = 0
    for (const child of node) {
      const result = walk(child, depth + 1)
      rows += result.rows
      text += result.text
      nodes += result.nodes
    }
    return { rows, text, nodes }
  }
  const { type, props } = node
  if (type === React.Fragment) return walk(props.children, depth + 1)
  if (typeof type === 'function') return walk(type(props), depth + 1)
  if (typeof type === 'string') {
    let rows = type === 'div' && props.className === 'dcr_row' ? 1 : 0
    let text = ''
    let nodes = 1
    if (props.children !== undefined) {
      const result = walk(props.children, depth + 1)
      rows += result.rows
      text += result.text
      nodes += result.nodes
    }
    return { rows, text, nodes }
  }
  return { rows: 0, text: '', nodes: 0 }
}

const rendered = walk(tree)
if (rendered.rows !== 7) throw new Error(`expected 7 rendered reader rows, got ${rendered.rows}`)
if (!rendered.text.includes('Point') || !rendered.text.includes('distance')) throw new Error('rendered text lost the source')

console.log('android-studio smoke: OK')
console.log(`  inject: ${exports.inject.length} services; slots: ${registrations.slots.length}; tabs: ${registrations.tabs.length}`)
console.log(`  reader preview: ${preview.id} (${preview.extensions.length} extensions); rows: ${rendered.rows}`)
