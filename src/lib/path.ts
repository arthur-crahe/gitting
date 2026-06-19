/**
 * Helpers for repository-relative, `/`-separated paths, where the last segment
 * is the file name.
 */

/**
 * Last `/`-separated segment of a path — the file or directory name. Returns the
 * whole string when there is no separator, and `''` for a trailing separator.
 */
export function lastPathSegment(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? path : path.slice(slash + 1)
}

/**
 * Splits a path into its directory prefix (with the trailing `/`) and its file
 * name. A path with no separator yields an empty `dir`.
 */
export function splitPath(path: string): { dir: string; name: string } {
  const name = lastPathSegment(path)
  return { dir: path.slice(0, path.length - name.length), name }
}
