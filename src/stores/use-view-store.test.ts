import { beforeEach, describe, expect, it } from 'vitest'
import { useViewStore } from './use-view-store'

describe('useViewStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useViewStore.setState({ mode: 'list' })
  })

  it('defaults to the flat list', () => {
    expect(useViewStore.getState().mode).toBe('list')
  })

  it('sets the mode and persists the choice', () => {
    useViewStore.getState().setMode('tree')
    expect(useViewStore.getState().mode).toBe('tree')
    expect(localStorage.getItem('gitting.viewMode')).toBe('tree')

    useViewStore.getState().setMode('list')
    expect(useViewStore.getState().mode).toBe('list')
    expect(localStorage.getItem('gitting.viewMode')).toBe('list')
  })
})
