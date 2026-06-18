import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/updater', () => ({
  isTauriRuntime: () => true,
  checkForUpdate: vi.fn(),
  installUpdate: vi.fn(),
}))

import { type AvailableUpdate, checkForUpdate, installUpdate } from '../lib/updater'
import { useUpdateStore } from './use-update-store'

const mockedCheck = vi.mocked(checkForUpdate)
const mockedInstall = vi.mocked(installUpdate)

/** A minimal available update (5.0.0 → 6.0.0) for the tests. */
function fakeUpdate(): AvailableUpdate {
  return {
    version: '6.0.0',
    currentVersion: '5.0.0',
    notes: 'Nouveautés v6',
    date: undefined,
    handle: {} as AvailableUpdate['handle'],
  }
}

describe('useUpdateStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUpdateStore.setState({
      phase: 'idle',
      available: null,
      downloaded: 0,
      total: 0,
      error: null,
    })
  })

  it('surfaces an available update from a silent launch check', async () => {
    mockedCheck.mockResolvedValue(fakeUpdate())
    await useUpdateStore.getState().check()
    const state = useUpdateStore.getState()
    expect(state.phase).toBe('available')
    expect(state.available?.version).toBe('6.0.0')
  })

  it('stays idle when a silent check is up to date', async () => {
    mockedCheck.mockResolvedValue(null)
    await useUpdateStore.getState().check()
    expect(useUpdateStore.getState().phase).toBe('idle')
  })

  it('confirms up-to-date on a manual check', async () => {
    mockedCheck.mockResolvedValue(null)
    await useUpdateStore.getState().check(true)
    expect(useUpdateStore.getState().phase).toBe('up-to-date')
  })

  it('stays silent when a launch check fails', async () => {
    mockedCheck.mockRejectedValue(new Error('offline'))
    await useUpdateStore.getState().check()
    const state = useUpdateStore.getState()
    expect(state.phase).toBe('idle')
    expect(state.error).toBeNull()
  })

  it('surfaces an error on a manual check failure', async () => {
    mockedCheck.mockRejectedValue(new Error('network down'))
    await useUpdateStore.getState().check(true)
    const state = useUpdateStore.getState()
    expect(state.phase).toBe('error')
    expect(state.error).toBe('network down')
  })

  it('installs the available update', async () => {
    mockedInstall.mockResolvedValue()
    useUpdateStore.setState({ phase: 'available', available: fakeUpdate() })
    await useUpdateStore.getState().install()
    expect(mockedInstall).toHaveBeenCalledOnce()
  })

  it('does nothing on install without an available update', async () => {
    await useUpdateStore.getState().install()
    expect(mockedInstall).not.toHaveBeenCalled()
  })

  it('resets to idle on dismiss', () => {
    useUpdateStore.setState({ phase: 'available', available: fakeUpdate() })
    useUpdateStore.getState().dismiss()
    const state = useUpdateStore.getState()
    expect(state.phase).toBe('idle')
    expect(state.available).toBeNull()
  })
})
