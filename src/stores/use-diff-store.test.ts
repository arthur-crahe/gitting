import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/git', () => ({
  diffUnstaged: vi.fn(),
  diffStaged: vi.fn(),
}))

import { type DiffFile, diffStaged, diffUnstaged, type RepoStatus } from '../lib/git'
import { useDiffStore } from './use-diff-store'

const mockedUnstaged = vi.mocked(diffUnstaged)
const mockedStaged = vi.mocked(diffStaged)

/** A modified file with one delete + one add, so its magnitude is `+1 −1`. */
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
      lines: [
        { kind: 'delete', oldNo: 1, newNo: null, content: 'old' },
        { kind: 'add', oldNo: null, newNo: 1, content: 'new' },
      ],
    },
  ],
}

/** Let queued microtasks (the async load fired by reconcile/select) settle. */
async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
  }
}

describe('useDiffStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUnstaged.mockResolvedValue([])
    mockedStaged.mockResolvedValue([])
    useDiffStore.getState().reset()
  })

  it('loads both sections in one read and derives per-file counts', async () => {
    mockedUnstaged.mockResolvedValue([FILE_A])
    mockedStaged.mockResolvedValue([{ ...FILE_A, path: 'src/b.ts' }])

    await useDiffStore.getState().load('/repo')

    const s = useDiffStore.getState()
    expect(mockedUnstaged).toHaveBeenCalledWith('/repo')
    expect(mockedStaged).toHaveBeenCalledWith('/repo')
    expect(s.counts.unstaged['src/a.ts']).toEqual({ add: 1, del: 1 })
    expect(s.counts.staged['src/b.ts']).toEqual({ add: 1, del: 1 })
  })

  it('resolves the open file from the loaded sections, with no extra backend call', async () => {
    const fileB = { ...FILE_A, path: 'src/b.ts' }
    mockedUnstaged.mockResolvedValue([FILE_A, fileB])
    await useDiffStore.getState().load('/repo')

    useDiffStore.getState().select('/repo', { section: 'unstaged', path: 'src/a.ts' })
    expect(useDiffStore.getState().diff).toEqual(FILE_A)
    useDiffStore.getState().select('/repo', { section: 'unstaged', path: 'src/b.ts' })

    const s = useDiffStore.getState()
    expect(s.diff).toEqual(fileB)
    expect(s.phase).toBe('ready')
    // Switching files is a pure cache lookup — the section was read once.
    expect(mockedUnstaged).toHaveBeenCalledTimes(1)
  })

  it('keeps a null diff when the path is absent from the section', async () => {
    await useDiffStore.getState().load('/repo')
    useDiffStore.getState().select('/repo', { section: 'unstaged', path: 'gone.ts' })

    const s = useDiffStore.getState()
    expect(s.phase).toBe('ready')
    expect(s.diff).toBeNull()
  })

  it('shows loading for a file picked before the load lands, then resolves it', async () => {
    let resolve: (files: DiffFile[]) => void = () => {}
    mockedUnstaged.mockImplementation(() => new Promise((res) => (resolve = res)))

    const loading = useDiffStore.getState().load('/repo')
    useDiffStore.getState().select('/repo', { section: 'unstaged', path: 'src/a.ts' })
    expect(useDiffStore.getState().phase).toBe('loading')

    resolve([FILE_A])
    await loading
    const s = useDiffStore.getState()
    expect(s.phase).toBe('ready')
    expect(s.diff).toEqual(FILE_A)
  })

  it('surfaces a load failure in the panel when a file is open', async () => {
    useDiffStore.setState({ selected: { section: 'unstaged', path: 'src/a.ts' } })
    mockedUnstaged.mockRejectedValue(new Error('boom'))

    await useDiffStore.getState().load('/repo')

    const s = useDiffStore.getState()
    expect(s.phase).toBe('error')
    expect(s.error).toBe('boom')
    expect(s.diff).toBeNull()
  })

  it('discards a superseded load so the latest wins', async () => {
    let resolveFirst: (files: DiffFile[]) => void = () => {}
    mockedUnstaged
      .mockImplementationOnce(() => new Promise((res) => (resolveFirst = res)))
      .mockResolvedValueOnce([FILE_A])

    const first = useDiffStore.getState().load('/repo')
    const second = useDiffStore.getState().load('/repo')
    await second
    // The stale first load resolves last; it must not overwrite the second.
    resolveFirst([])
    await first

    expect(useDiffStore.getState().counts.unstaged['src/a.ts']).toEqual({ add: 1, del: 1 })
  })

  it('reuses the prior LineDelta object for an unchanged path across loads', async () => {
    mockedUnstaged.mockResolvedValue([FILE_A])
    await useDiffStore.getState().load('/repo')
    const first = useDiffStore.getState().counts.unstaged['src/a.ts']

    await useDiffStore.getState().load('/repo')
    const second = useDiffStore.getState().counts.unstaged['src/a.ts']

    // Same counts → same object, so the row's selector stays referentially stable.
    expect(second).toBe(first)
  })

  it('reconcile follows a validated file into the archive while the queue is not empty', async () => {
    mockedStaged.mockResolvedValue([FILE_A])
    mockedUnstaged.mockResolvedValue([{ ...FILE_A, path: 'src/other.ts' }])
    useDiffStore.setState({ selected: { section: 'unstaged', path: 'src/a.ts' } })
    const status: RepoStatus = {
      unstaged: [{ path: 'src/other.ts', kind: 'modified' }],
      staged: [{ path: 'src/a.ts', kind: 'modified' }],
    }

    useDiffStore.getState().reconcile('/repo', status)
    await flush()

    const s = useDiffStore.getState()
    expect(s.selected).toEqual({ section: 'staged', path: 'src/a.ts' })
    expect(s.diff).toEqual(FILE_A)
  })

  it('reconcile clears the panel when validating the last file burns down the queue', async () => {
    mockedStaged.mockResolvedValue([FILE_A])
    useDiffStore.setState({
      selected: { section: 'unstaged', path: 'src/a.ts' },
      diff: FILE_A,
      phase: 'ready',
    })
    const status: RepoStatus = { unstaged: [], staged: [{ path: 'src/a.ts', kind: 'modified' }] }

    useDiffStore.getState().reconcile('/repo', status)
    // The selection clears synchronously so the empty pane shows the completion beat.
    expect(useDiffStore.getState().selected).toBeNull()
    await flush()
    expect(useDiffStore.getState().diff).toBeNull()
  })

  it('reconcile closes the panel when the file is gone from both sections', async () => {
    useDiffStore.setState({
      selected: { section: 'unstaged', path: 'src/a.ts' },
      diff: FILE_A,
      phase: 'ready',
    })

    useDiffStore.getState().reconcile('/repo', { unstaged: [], staged: [] })
    expect(useDiffStore.getState().selected).toBeNull()
    await flush()
    expect(useDiffStore.getState().diff).toBeNull()
  })

  it('reconcile re-reads fresh content when the file stays in its section', async () => {
    const edited: DiffFile = { ...FILE_A, hunks: [] }
    mockedUnstaged.mockResolvedValue([edited])
    useDiffStore.setState({
      selected: { section: 'unstaged', path: 'src/a.ts' },
      diff: FILE_A,
      phase: 'ready',
    })
    const status: RepoStatus = { unstaged: [{ path: 'src/a.ts', kind: 'modified' }], staged: [] }

    useDiffStore.getState().reconcile('/repo', status)
    await flush()

    const s = useDiffStore.getState()
    expect(s.selected).toEqual({ section: 'unstaged', path: 'src/a.ts' })
    expect(s.diff).toEqual(edited)
  })

  it('reset clears the selection, counts and section cache', async () => {
    mockedUnstaged.mockResolvedValue([FILE_A])
    await useDiffStore.getState().load('/repo')
    useDiffStore.getState().select('/repo', { section: 'unstaged', path: 'src/a.ts' })

    useDiffStore.getState().reset()
    const s = useDiffStore.getState()
    expect(s.selected).toBeNull()
    expect(s.diff).toBeNull()
    expect(s.phase).toBe('idle')
    expect(s.counts.unstaged).toEqual({})

    // The dropped cache makes the next selection fall back to loading.
    useDiffStore.getState().select('/repo', { section: 'unstaged', path: 'src/a.ts' })
    expect(useDiffStore.getState().phase).toBe('loading')
  })

  it('select re-fetches and recovers after a failed initial load', async () => {
    // The initial eager load fails with nothing selected — silent, cache null.
    mockedUnstaged.mockRejectedValueOnce(new Error('boom'))
    mockedStaged.mockRejectedValueOnce(new Error('boom'))
    await useDiffStore.getState().load('/repo')
    expect(useDiffStore.getState().phase).toBe('idle')

    // The next read succeeds: clicking a file must trigger a load and resolve it,
    // rather than parking forever on "loading".
    mockedUnstaged.mockResolvedValue([FILE_A])
    mockedStaged.mockResolvedValue([])
    useDiffStore.getState().select('/repo', { section: 'unstaged', path: 'src/a.ts' })
    expect(useDiffStore.getState().phase).toBe('loading')
    await flush()

    const s = useDiffStore.getState()
    expect(s.phase).toBe('ready')
    expect(s.diff).toEqual(FILE_A)
  })

  it('commits the healthy section when only the other section fails to read', async () => {
    mockedUnstaged.mockResolvedValue([FILE_A])
    mockedStaged.mockRejectedValue(new Error('staged boom'))
    useDiffStore.setState({ selected: { section: 'unstaged', path: 'src/a.ts' } })

    await useDiffStore.getState().load('/repo')

    const s = useDiffStore.getState()
    // The unstaged read succeeded, so its counts + the open file's diff stand,
    // undisturbed by the staged section's failure.
    expect(s.counts.unstaged['src/a.ts']).toEqual({ add: 1, del: 1 })
    expect(s.phase).toBe('ready')
    expect(s.diff).toEqual(FILE_A)
  })

  it('errors the panel only when the open file is in the failed section', async () => {
    mockedUnstaged.mockResolvedValue([FILE_A])
    mockedStaged.mockRejectedValue(new Error('staged boom'))
    useDiffStore.setState({ selected: { section: 'staged', path: 'src/x.ts' } })

    await useDiffStore.getState().load('/repo')

    const s = useDiffStore.getState()
    expect(s.phase).toBe('error')
    expect(s.error).toBe('staged boom')
    // The healthy unstaged section's counts still loaded.
    expect(s.counts.unstaged['src/a.ts']).toEqual({ add: 1, del: 1 })
  })
})
