import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/git', () => ({
  diffUnstaged: vi.fn(),
  diffStaged: vi.fn(),
}))

import { type DiffFile, diffStaged, diffUnstaged, type RepoStatus } from '../lib/git'
import { useDiffStore } from './use-diff-store'

const mockedUnstaged = vi.mocked(diffUnstaged)
const mockedStaged = vi.mocked(diffStaged)

const FILE_A: DiffFile = {
  path: 'src/a.ts',
  changeKind: 'modified',
  oldMode: '100644',
  newMode: '100644',
  isBinary: false,
  hunks: [
    {
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      lines: [{ kind: 'context', oldNo: 1, newNo: 1, content: 'x' }],
    },
  ],
}

/** Let queued microtasks (the async select fired by reconcile) settle. */
async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useDiffStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDiffStore.setState({ selected: null, diff: null, phase: 'idle', error: null })
  })

  it('selects an unstaged file and loads its diff by path', async () => {
    mockedUnstaged.mockResolvedValue([FILE_A])

    await useDiffStore.getState().select('/repo', { section: 'unstaged', path: 'src/a.ts' })

    const s = useDiffStore.getState()
    expect(mockedUnstaged).toHaveBeenCalledWith('/repo')
    expect(s.phase).toBe('ready')
    expect(s.diff).toEqual(FILE_A)
    expect(s.selected).toEqual({ section: 'unstaged', path: 'src/a.ts' })
  })

  it('uses the staged command for a staged selection', async () => {
    mockedStaged.mockResolvedValue([FILE_A])

    await useDiffStore.getState().select('/repo', { section: 'staged', path: 'src/a.ts' })

    expect(mockedStaged).toHaveBeenCalledWith('/repo')
    expect(useDiffStore.getState().diff).toEqual(FILE_A)
  })

  it('keeps a null diff when the path is absent from the section', async () => {
    mockedUnstaged.mockResolvedValue([])

    await useDiffStore.getState().select('/repo', { section: 'unstaged', path: 'gone.ts' })

    const s = useDiffStore.getState()
    expect(s.phase).toBe('ready')
    expect(s.diff).toBeNull()
  })

  it('moves to error when the load fails', async () => {
    mockedUnstaged.mockRejectedValue(new Error('boom'))

    await useDiffStore.getState().select('/repo', { section: 'unstaged', path: 'src/a.ts' })

    const s = useDiffStore.getState()
    expect(s.phase).toBe('error')
    expect(s.error).toBe('boom')
    expect(s.diff).toBeNull()
  })

  it('discards a superseded selection so the latest wins', async () => {
    let resolveFirst: (files: DiffFile[]) => void = () => {}
    mockedUnstaged
      .mockImplementationOnce(() => new Promise<DiffFile[]>((res) => (resolveFirst = res)))
      .mockResolvedValueOnce([FILE_A])

    const first = useDiffStore.getState().select('/repo', { section: 'unstaged', path: 'src/a.ts' })
    const second = useDiffStore
      .getState()
      .select('/repo', { section: 'unstaged', path: 'src/a.ts' })
    await second
    // The stale first call resolves last; it must not overwrite the second.
    resolveFirst([])
    await first

    expect(useDiffStore.getState().diff).toEqual(FILE_A)
  })

  it('reconcile follows a file that moved from unstaged to staged', async () => {
    mockedStaged.mockResolvedValue([FILE_A])
    useDiffStore.setState({
      selected: { section: 'unstaged', path: 'src/a.ts' },
      diff: null,
      phase: 'ready',
      error: null,
    })
    const status: RepoStatus = {
      unstaged: [],
      staged: [{ path: 'src/a.ts', kind: 'modified' }],
    }

    useDiffStore.getState().reconcile('/repo', status)
    await flush()

    expect(mockedStaged).toHaveBeenCalledWith('/repo')
    expect(useDiffStore.getState().selected).toEqual({ section: 'staged', path: 'src/a.ts' })
    expect(useDiffStore.getState().diff).toEqual(FILE_A)
  })

  it('reconcile closes the panel when the file is gone', () => {
    useDiffStore.setState({
      selected: { section: 'unstaged', path: 'src/a.ts' },
      diff: FILE_A,
      phase: 'ready',
      error: null,
    })

    useDiffStore.getState().reconcile('/repo', { unstaged: [], staged: [] })

    const s = useDiffStore.getState()
    expect(s.selected).toBeNull()
    expect(s.diff).toBeNull()
  })
})
