/** `dsh-resource://file/...` address parsing and display helpers. */

/** Parts of a file resource address. */
export interface FileAddress {
  readonly sessionId: string
  readonly path: string
}

const PREFIX = 'dsh-resource://file/'

/** Parse a file resource address without touching a filesystem. */
export function parseFileAddress(address: string): FileAddress | null {
  if (!address.startsWith(PREFIX)) return null
  const query = address.search(/[?#]/)
  const body = address.slice(PREFIX.length, query === -1 ? undefined : query)
  const segments = body.split('/')
  const scope = segments[0]
  if (scope === 'session') {
    const [, id, ...rest] = segments
    if (id === undefined || id === '' || rest.length === 0) return null
    try {
      return { sessionId: decodeURIComponent(id), path: rest.map(decodeURIComponent).join('/') }
    } catch {
      return null
    }
  }
  if (scope === 'absolute') {
    try {
      return { sessionId: '', path: `/${segments.slice(1).map(decodeURIComponent).join('/')}` }
    } catch {
      return null
    }
  }
  return null
}

/** Last path segment, for the reader's title row. */
export function fileNameOf(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return path.slice(slash + 1)
}

/** Directory part of a path, without its trailing separator. */
export function directoryOf(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return slash <= 0 ? path : path.slice(0, slash)
}
