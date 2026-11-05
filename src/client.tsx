/**
 * Merged Android Studio browser entry.
 *
 * One module serves both halves: the existing Android workbench toolbar/tasks
 * UI and the IDE-grade code reader for Sidebar document previews. The module id
 * is still the package name, so the Host loads it exactly as before.
 */
import { apply as applyAndroid, inject as injectAndroid } from '../client.view.js'
import { applyCodeReader, inject as injectReader } from './reader/plugin.tsx'

/** Union of both halves' services; activation waits for all of them. */
export const inject: readonly string[] = [...new Set([...injectAndroid, ...injectReader])]

export function apply(ctx: Parameters<typeof applyCodeReader>[0]): void {
  applyAndroid(ctx as never)
  applyCodeReader(ctx)
}
