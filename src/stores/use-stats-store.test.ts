import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/git', () => ({
  diffStats: vi.fn(),
}))

import { type DiffStats, diffStats } from '../lib/git'
import { useStatsStore } from './use-stats-store'

const mockedDiffStats = vi.mocked(diffStats)

const stats = (unstaged: DiffStats['unstaged'], staged: DiffStats['staged'] = []): DiffStats => ({
  unstaged,
  staged,
})

describe('useStatsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStatsStore.getState().reset()
  })

  it('indexes both sections by path', async () => {
    mockedDiffStats.mockResolvedValue(
      stats([{ path: 'a.ts', add: 3, del: 1 }], [{ path: 'b.ts', add: 0, del: 2 }]),
    )

    await useStatsStore.getState().load('/repo')

    const { stats: s } = useStatsStore.getState()
    expect(mockedDiffStats).toHaveBeenCalledWith('/repo')
    expect(s.unstaged['a.ts']).toEqual({ add: 3, del: 1 })
    expect(s.staged['b.ts']).toEqual({ add: 0, del: 2 })
  })

  it('reuses the prior FileStat object for an unchanged path, allocating only changed ones', async () => {
    mockedDiffStats.mockResolvedValue(
      stats([
        { path: 'a.ts', add: 3, del: 1 },
        { path: 'b.ts', add: 1, del: 0 },
      ]),
    )
    await useStatsStore.getState().load('/repo')
    const first = useStatsStore.getState().stats.unstaged

    // a.ts unchanged, b.ts changed: a's object must survive (stable row selector),
    // b's must be replaced.
    mockedDiffStats.mockResolvedValue(
      stats([
        { path: 'a.ts', add: 3, del: 1 },
        { path: 'b.ts', add: 5, del: 2 },
      ]),
    )
    await useStatsStore.getState().load('/repo')
    const second = useStatsStore.getState().stats.unstaged

    expect(second['a.ts']).toBe(first['a.ts'])
    expect(second['b.ts']).not.toBe(first['b.ts'])
    expect(second['b.ts']).toEqual({ add: 5, del: 2 })
  })

  it('discards a stale load so a slow previous read cannot overwrite newer counts', async () => {
    let resolveFirst: (value: DiffStats) => void = () => {}
    mockedDiffStats
      .mockImplementationOnce(() => new Promise<DiffStats>((res) => (resolveFirst = res)))
      .mockResolvedValueOnce(stats([{ path: 'new.ts', add: 9, del: 9 }]))

    const first = useStatsStore.getState().load('/repo')
    const second = useStatsStore.getState().load('/repo')
    await second
    resolveFirst(stats([{ path: 'stale.ts', add: 1, del: 1 }]))
    await first

    const { stats: s } = useStatsStore.getState()
    expect(s.unstaged['new.ts']).toEqual({ add: 9, del: 9 })
    expect(s.unstaged['stale.ts']).toBeUndefined()
  })

  it('reset bumps the token so an in-flight load from the previous repo cannot commit', async () => {
    let resolveLoad: (value: DiffStats) => void = () => {}
    mockedDiffStats.mockImplementationOnce(
      () => new Promise<DiffStats>((res) => (resolveLoad = res)),
    )

    const load = useStatsStore.getState().load('/old-repo')
    useStatsStore.getState().reset()
    resolveLoad(stats([{ path: 'old.ts', add: 4, del: 0 }]))
    await load

    const { stats: s } = useStatsStore.getState()
    expect(s.unstaged).toEqual({})
    expect(s.staged).toEqual({})
  })

  it('swallows a failed load, leaving the counts untouched', async () => {
    mockedDiffStats.mockResolvedValueOnce(stats([{ path: 'a.ts', add: 2, del: 0 }]))
    await useStatsStore.getState().load('/repo')

    mockedDiffStats.mockRejectedValueOnce(new Error('boom'))
    await expect(useStatsStore.getState().load('/repo')).resolves.toBeUndefined()

    expect(useStatsStore.getState().stats.unstaged['a.ts']).toEqual({ add: 2, del: 0 })
  })
})
