import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/git', () => ({
  openRepo: vi.fn(),
  readStatus: vi.fn(),
  stageFile: vi.fn(),
  unstageFile: vi.fn(),
  stageFiles: vi.fn(),
  unstageFiles: vi.fn(),
  diffUnstaged: vi.fn(),
  diffStaged: vi.fn(),
}))

import {
  diffStaged,
  diffUnstaged,
  openRepo,
  type RepoInfo,
  type RepoStatus,
  readStatus,
  stageFile,
  stageFiles,
  unstageFile,
  unstageFiles,
} from '../lib/git'
import { useDiffStore } from './use-diff-store'
import { useRepoStore } from './use-repo-store'

const mockedOpen = vi.mocked(openRepo)
const mockedStatus = vi.mocked(readStatus)
const mockedStage = vi.mocked(stageFile)
const mockedUnstage = vi.mocked(unstageFile)
const mockedStageFiles = vi.mocked(stageFiles)
const mockedUnstageFiles = vi.mocked(unstageFiles)
const mockedDiffUnstaged = vi.mocked(diffUnstaged)
const mockedDiffStaged = vi.mocked(diffStaged)

const INFO: RepoInfo = { root: '/repo', name: 'repo', branch: 'main' }
const STATUS: RepoStatus = {
  unstaged: [{ path: 'src/a.ts', kind: 'modified' }],
  staged: [{ path: 'src/b.ts', kind: 'added' }],
}

describe('useRepoStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // open/refresh prime the diff store (both sections) — keep that read benign.
    mockedDiffUnstaged.mockResolvedValue([])
    mockedDiffStaged.mockResolvedValue([])
    useRepoStore.setState({
      phase: 'empty',
      info: null,
      status: null,
      error: null,
      pendingPaths: new Set(),
      reviewedHere: false,
    })
    useDiffStore.getState().reset()
  })

  it('starts empty', () => {
    const s = useRepoStore.getState()
    expect(s.phase).toBe('empty')
    expect(s.info).toBeNull()
    expect(s.status).toBeNull()
  })

  it('opens a repository and loads its status', async () => {
    mockedOpen.mockResolvedValue(INFO)
    mockedStatus.mockResolvedValue(STATUS)

    await useRepoStore.getState().open('/repo')

    const s = useRepoStore.getState()
    expect(s.phase).toBe('ready')
    expect(s.info).toEqual(INFO)
    expect(s.status).toEqual(STATUS)
    expect(s.error).toBeNull()
    expect(mockedOpen).toHaveBeenCalledWith('/repo')
    expect(mockedStatus).toHaveBeenCalledWith('/repo')
  })

  it('moves to error and clears state when opening fails', async () => {
    mockedOpen.mockRejectedValue(new Error('aucun dépôt git'))
    mockedStatus.mockResolvedValue(STATUS)

    await useRepoStore.getState().open('/nope')

    const s = useRepoStore.getState()
    expect(s.phase).toBe('error')
    expect(s.error).toBe('aucun dépôt git')
    expect(s.info).toBeNull()
    expect(s.status).toBeNull()
  })

  it('refresh re-reads the status of the open repository', async () => {
    useRepoStore.setState({ phase: 'ready', info: INFO, status: STATUS })
    const next: RepoStatus = { unstaged: [], staged: STATUS.staged }
    mockedStatus.mockResolvedValue(next)

    await useRepoStore.getState().refresh()

    expect(mockedStatus).toHaveBeenCalledWith('/repo')
    expect(useRepoStore.getState().status).toEqual(next)
  })

  it('refresh is a no-op when no repository is open', async () => {
    await useRepoStore.getState().refresh()
    expect(mockedStatus).not.toHaveBeenCalled()
  })

  it('keeps the repo open and surfaces the error when a refresh fails', async () => {
    useRepoStore.setState({ phase: 'ready', info: INFO, status: STATUS })
    mockedStatus.mockRejectedValue(new Error('lecture impossible'))

    await useRepoStore.getState().refresh()

    const s = useRepoStore.getState()
    expect(s.phase).toBe('ready')
    expect(s.status).toEqual(STATUS)
    expect(s.info).toEqual(INFO)
    expect(s.error).toBe('lecture impossible')
  })

  it('stage validates a file then re-reads the status', async () => {
    useRepoStore.setState({ phase: 'ready', info: INFO, status: STATUS })
    mockedStage.mockResolvedValue()
    const next: RepoStatus = { unstaged: [], staged: [{ path: 'src/a.ts', kind: 'modified' }] }
    mockedStatus.mockResolvedValue(next)

    await useRepoStore.getState().stage('src/a.ts')

    expect(mockedStage).toHaveBeenCalledWith('/repo', 'src/a.ts')
    expect(mockedStatus).toHaveBeenCalledWith('/repo')
    expect(useRepoStore.getState().status).toEqual(next)
  })

  it('unstage sends a file back then re-reads the status', async () => {
    useRepoStore.setState({ phase: 'ready', info: INFO, status: STATUS })
    mockedUnstage.mockResolvedValue()
    mockedStatus.mockResolvedValue(STATUS)

    await useRepoStore.getState().unstage('src/b.ts')

    expect(mockedUnstage).toHaveBeenCalledWith('/repo', 'src/b.ts')
    expect(mockedStatus).toHaveBeenCalledWith('/repo')
  })

  it('surfaces an index-write failure without closing the repo', async () => {
    useRepoStore.setState({ phase: 'ready', info: INFO, status: STATUS })
    mockedStage.mockRejectedValue(new Error('git introuvable'))

    await useRepoStore.getState().stage('src/a.ts')

    const s = useRepoStore.getState()
    expect(s.phase).toBe('ready')
    expect(s.info).toEqual(INFO)
    expect(s.error).toBe('git introuvable')
  })

  it('stage is a no-op when no repository is open', async () => {
    await useRepoStore.getState().stage('x')
    expect(mockedStage).not.toHaveBeenCalled()
  })

  it('reports a committed validate as true and a failed write as false', async () => {
    useRepoStore.setState({ phase: 'ready', info: INFO, status: STATUS })
    mockedStatus.mockResolvedValue(STATUS)
    mockedStage.mockResolvedValueOnce()
    await expect(useRepoStore.getState().stage('src/a.ts')).resolves.toBe(true)

    mockedStage.mockRejectedValueOnce(new Error('boom'))
    await expect(useRepoStore.getState().stage('src/a.ts')).resolves.toBe(false)
  })

  it('arms reviewedHere on a successful validate and resets it when a repo is opened', async () => {
    useRepoStore.setState({ phase: 'ready', info: INFO, status: STATUS, reviewedHere: false })
    mockedStage.mockResolvedValue()
    mockedStatus.mockResolvedValue({
      unstaged: [],
      staged: [{ path: 'src/a.ts', kind: 'modified' }],
    })

    await useRepoStore.getState().stage('src/a.ts')
    expect(useRepoStore.getState().reviewedHere).toBe(true)

    // Opening a repository clears the in-session flag, so a pre-staged repo can't
    // inherit a stale "reviewed" state and fire a false completion.
    mockedOpen.mockResolvedValue(INFO)
    mockedStatus.mockResolvedValue(STATUS)
    await useRepoStore.getState().open('/repo')
    expect(useRepoStore.getState().reviewedHere).toBe(false)
  })

  it('does not arm reviewedHere on an unstage (un-validating is not reviewing)', async () => {
    useRepoStore.setState({ phase: 'ready', info: INFO, status: STATUS, reviewedHere: false })
    mockedUnstage.mockResolvedValue()
    mockedStatus.mockResolvedValue(STATUS)

    await useRepoStore.getState().unstage('src/b.ts')
    expect(useRepoStore.getState().reviewedHere).toBe(false)
  })

  it('bulk-validates a section in one call and re-reads the status once', async () => {
    useRepoStore.setState({ phase: 'ready', info: INFO, status: STATUS })
    mockedStageFiles.mockResolvedValue()
    mockedStatus.mockResolvedValue({ unstaged: [], staged: STATUS.staged })

    const ok = await useRepoStore.getState().stageMany(['src/a.ts', 'src/x.ts'])

    expect(ok).toBe(true)
    expect(mockedStageFiles).toHaveBeenCalledWith('/repo', ['src/a.ts', 'src/x.ts'])
    expect(mockedStatus).toHaveBeenCalledTimes(1)
    expect(useRepoStore.getState().reviewedHere).toBe(true)
  })

  it('bulk-unvalidates a section in one call', async () => {
    useRepoStore.setState({ phase: 'ready', info: INFO, status: STATUS })
    mockedUnstageFiles.mockResolvedValue()
    mockedStatus.mockResolvedValue(STATUS)

    const ok = await useRepoStore.getState().unstageMany(['src/b.ts'])

    expect(ok).toBe(true)
    expect(mockedUnstageFiles).toHaveBeenCalledWith('/repo', ['src/b.ts'])
    // Un-validating is not reviewing, so the completion gate stays disarmed.
    expect(useRepoStore.getState().reviewedHere).toBe(false)
  })

  it('re-reads the status after a failed bulk write so a partial result is reflected', async () => {
    useRepoStore.setState({ phase: 'ready', info: INFO, status: STATUS })
    // A batched write can apply earlier files before a later chunk fails: the
    // store must refresh so the sidebar reflects what actually landed.
    mockedStageFiles.mockRejectedValue(new Error('échec partiel'))
    const partial: RepoStatus = { unstaged: [], staged: [{ path: 'src/a.ts', kind: 'modified' }] }
    mockedStatus.mockResolvedValue(partial)

    const ok = await useRepoStore.getState().stageMany(['src/a.ts', 'src/x.ts'])

    expect(ok).toBe(false)
    expect(mockedStatus).toHaveBeenCalledWith('/repo')
    expect(useRepoStore.getState().status).toEqual(partial)
    expect(useRepoStore.getState().error).toBe('échec partiel')
  })

  it('resets the diff store when a different repository is opened', async () => {
    mockedOpen.mockResolvedValue(INFO)
    mockedStatus.mockResolvedValue(STATUS)
    // A file from a previous repo is still open in the diff panel.
    useDiffStore.setState({
      selected: { section: 'unstaged', path: 'src/a.ts' },
      diff: null,
      phase: 'ready',
      error: null,
    })

    await useRepoStore.getState().open('/repo')

    // The switch must not leak the previous repo's selection into the new one.
    expect(useDiffStore.getState().selected).toBeNull()
    expect(useDiffStore.getState().phase).toBe('idle')
  })

  it('marks a file pending while its index write is in flight, then clears it', async () => {
    useRepoStore.setState({ phase: 'ready', info: INFO, status: STATUS })
    let resolveStage: () => void = () => {}
    mockedStage.mockImplementation(() => new Promise<void>((res) => (resolveStage = res)))
    mockedStatus.mockResolvedValue(STATUS)

    const pending = useRepoStore.getState().stage('src/a.ts')
    expect(useRepoStore.getState().pendingPaths.has('src/a.ts')).toBe(true)

    resolveStage()
    await pending
    expect(useRepoStore.getState().pendingPaths.has('src/a.ts')).toBe(false)
  })

  it('ignores a second write for a file already in flight', async () => {
    useRepoStore.setState({ phase: 'ready', info: INFO, status: STATUS })
    let resolveStage: () => void = () => {}
    mockedStage.mockImplementation(() => new Promise<void>((res) => (resolveStage = res)))
    mockedStatus.mockResolvedValue(STATUS)

    const first = useRepoStore.getState().stage('src/a.ts')
    void useRepoStore.getState().stage('src/a.ts')
    resolveStage()
    await first

    expect(mockedStage).toHaveBeenCalledTimes(1)
  })

  it('discards a superseded open result so the latest request wins', async () => {
    const SECOND: RepoInfo = { root: '/second', name: 'second', branch: 'main' }
    let resolveFirst: (info: RepoInfo) => void = () => {}
    mockedOpen
      .mockImplementationOnce(() => new Promise<RepoInfo>((res) => (resolveFirst = res)))
      .mockResolvedValueOnce(SECOND)
    mockedStatus.mockResolvedValue(STATUS)

    const first = useRepoStore.getState().open('/first')
    const second = useRepoStore.getState().open('/second')
    await second
    // The stale first call resolves last; it must not overwrite the second.
    resolveFirst(INFO)
    await first

    expect(useRepoStore.getState().info).toEqual(SECOND)
  })
})
