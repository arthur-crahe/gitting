/**
 * Normalizes an unknown thrown value — an IPC rejection (a serialized
 * `GitError` string), a JS `Error`, or anything else — into a displayable
 * message string. The single place error→message conversion happens across the
 * Rust boundary, shared by the stores.
 */
export function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
