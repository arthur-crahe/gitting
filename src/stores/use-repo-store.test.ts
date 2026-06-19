import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/git', () => ({
  openRepo: vi.fn(),
  readStatus: vi.fn(),
  stageFile: vi.fn(),
  unstageFile: vi.fn(),
  diffUnstaged: vi.fn(),
  diffStaged: vi.fn(),
}))

import {
  openRepo,
  type RepoInfo,
  type RepoStatus,
  readStatus,
  stageFile,
  unstageFile,
} from '../lib/git'
import { useRepoStore } from './use-repo-store'

const mockedOpen = vi.mocked(openRepo)
const mockedStatus = vi.mocked(readStatus)
const mockedStage = vi.mocked(stageFile)
const mockedUnstage = vi.mocked(unstageFile)

const INFO: RepoInfo = { root: '/repo', name: 'repo', branch: 'main' }
const STATUS: RepoStatus = {
  unstaged: [{ path: 'src/a.ts', kind: 'modified' }],
  staged: [{ path: 'src/b.ts', kind: 'added' }],
}

describe('useRepoStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRepoStore.setState({ phase: 'empty', info: null, status: null, error: null })
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
