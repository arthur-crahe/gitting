import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'

/**
 * An update offered by the configured endpoint, narrowed to what the UI needs
 * plus the live {@link Update} handle used to download and install it.
 */
export interface AvailableUpdate {
  /** Version offered by the endpoint (e.g. `"6.0.0"`). */
  readonly version: string
  /** Version currently running. */
  readonly currentVersion: string
  /** Release notes from `latest.json`'s `notes` field, if any. */
  readonly notes: string | undefined
  /** RFC 3339 publication date, if any. */
  readonly date: string | undefined
  /** Live handle used to drive the download/install. */
  readonly handle: Update
}

/** Byte progress of an in-flight update download. */
export interface DownloadProgress {
  /** Bytes downloaded so far. */
  readonly downloaded: number
  /** Total bytes to download, or `0` when the server sent no length. */
  readonly total: number
}

/**
 * Queries the updater endpoint.
 *
 * @returns the available update, or `null` when already up to date.
 * @throws if the endpoint is unreachable or the response is invalid.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  const update = await check()
  if (!update) {
    return null
  }
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body,
    date: update.date,
    handle: update,
  }
}

/**
 * Downloads and installs an update — reporting byte progress — then restarts
 * the app. On Windows the installer exits the process; {@link relaunch} brings
 * it back. On success the app restarts, so code after this call may not run.
 *
 * @param update - the update returned by {@link checkForUpdate}.
 * @param onProgress - called on download start, on each chunk, and on finish.
 */
export async function installUpdate(
  update: AvailableUpdate,
  onProgress: (progress: DownloadProgress) => void,
): Promise<void> {
  let downloaded = 0
  let total = 0
  await update.handle.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? 0
        onProgress({ downloaded, total })
        break
      case 'Progress':
        downloaded += event.data.chunkLength
        onProgress({ downloaded, total })
        break
      case 'Finished':
        onProgress({ downloaded: total, total })
        break
    }
  })
  await relaunch()
}
