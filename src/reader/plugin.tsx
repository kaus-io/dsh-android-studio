/**
 * Code-reader half of the merged Android Studio plugin.
 *
 * The reader owns the right-Sidebar document preview for source suffixes. It
 * keeps its own implementation id, style tag and locale namespace.
 */
import type { ReactElement } from 'react'

import { REGISTERED_EXTENSIONS } from './engine/languages.ts'
import { en, zh } from './locale.ts'
import { CodeReader } from './view/CodeReader.tsx'
import { installStyles } from './view/styles.ts'

/** Implementation id inside the document-preview registry. */
export const READER_ID = '@kaus-io/dsh-android-studio/code-reader'
/** Locale namespace owned by the merged reader. */
export const READER_NS = 'androidStudioCodeReader'

const STYLE_ID = '@kaus-io/dsh-android-studio/CodeReader.css'

interface Translate {
  (key: string, params?: Readonly<Record<string, string | number>>): string
}

interface ReaderContext {
  effect(factory: () => (() => void) | void, label?: string): void
  inject?: (services: readonly string[], callback: (ctx: ReaderContext) => void) => void
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
    bind(namespace: string): Translate
  }
  documentPreviews?: {
    register(definition: {
      id: string
      extensions: readonly string[]
      priority?: 'builtin' | 'extension'
      title: () => string
      loading: 'text-pages' | 'bytes-complete' | 'renderer'
      wrap?: boolean
    }): () => void
  }
  slots?: {
    inject(key: string, callback: () => () => void): void
    register(options: Record<string, unknown>, component: (props: never) => ReactElement): () => void
  }
}

/** Services this half needs; merged into the plugin's activation list. */
export const inject = ['documentPreviews', 'slots', 'locale']

/** Register the reader once its services are available. */
function install(ctx: ReaderContext): void {
  const previews = ctx.documentPreviews
  const slots = ctx.slots
  if (previews === undefined || slots === undefined) return
  ctx.effect(() => installStyles(STYLE_ID), 'android-studio.reader: styles')
  ctx.effect(() => ctx.locale.register(READER_NS, { zh, en }), 'android-studio.reader: dictionaries')
  const t = ctx.locale.bind(READER_NS)
  ctx.effect(
    () =>
      previews.register({
        id: READER_ID,
        extensions: [...REGISTERED_EXTENSIONS],
        priority: 'extension',
        title: () => t('viewer.title'),
        loading: 'text-pages',
        wrap: true,
      }),
    'android-studio.reader: document viewer',
  )
  ctx.effect(
    () =>
      slots.inject('sidebar.right.tab.document', () =>
        slots.register({ name: 'sidebar.right.tab.document', key: READER_ID, locale: READER_NS }, CodeReader as (props: never) => ReactElement),
      ),
    'android-studio.reader: document body',
  )
}

/**
 * Install the reader. A running Host may still serve a cached client manifest
 * for this package from before the merge; waiting on the service through
 * `ctx.inject` keeps the reader available in that case too.
 */
export function applyCodeReader(ctx: ReaderContext): void {
  if (ctx.documentPreviews !== undefined) {
    install(ctx)
    return
  }
  if (typeof ctx.inject === 'function') {
    ctx.inject(['documentPreviews'], (inner) => install(inner))
    return
  }
  install(ctx)
}
