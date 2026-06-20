import { FileIcon, FolderIcon } from '@react-symbols/icons/utils'
import { lastPathSegment } from '../../lib/path'

/** Render size of the file/folder type icons (px), matching the status column. */
const ICON_SIZE = 16

/**
 * A file-type icon (VSCode "Symbols" set, via {@link FileIcon}) resolved from the
 * file name — `autoAssign` also recognises whole names like `biome.json`,
 * `tsconfig.json` or `Cargo.toml`. Decorative: the row's accessible name comes
 * from its path.
 */
export function FileTypeIcon({ name }: { name: string }) {
  return (
    <span className="file-type-icon" aria-hidden="true">
      <FileIcon fileName={name} autoAssign width={ICON_SIZE} height={ICON_SIZE} />
    </span>
  )
}

/**
 * A folder-type icon resolved from the folder name (named folders like `src`,
 * `.github`, `components` get their own icon; others fall back to the default).
 * For a compacted chain (`features/review`) the last segment drives the icon.
 */
export function FolderTypeIcon({ name }: { name: string }) {
  return (
    <span className="file-type-icon" aria-hidden="true">
      <FolderIcon folderName={lastPathSegment(name)} width={ICON_SIZE} height={ICON_SIZE} />
    </span>
  )
}
