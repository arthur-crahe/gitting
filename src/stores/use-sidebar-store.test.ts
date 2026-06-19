import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_WIDTH, MAX_WIDTH, MIN_WIDTH } from '../features/review/resize-utils'
import { initialWidth, useSidebarStore } from './use-sidebar-store'

const KEY = 'gitting.sidebarWidth'

describe('useSidebarStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useSidebarStore.setState({ width: DEFAULT_WIDTH })
  })

  describe('initialWidth', () => {
    it('returns a valid stored width', () => {
      localStorage.setItem(KEY, '400')
      expect(initialWidth()).toBe(400)
    })

    it('clamps an out-of-range stored width', () => {
      localStorage.setItem(KEY, '9999')
      expect(initialWidth()).toBe(MAX_WIDTH)
      localStorage.setItem(KEY, '10')
      expect(initialWidth()).toBe(MIN_WIDTH)
    })

    it('falls back to the default for a corrupt or absent value', () => {
      localStorage.setItem(KEY, 'nope')
      expect(initialWidth()).toBe(DEFAULT_WIDTH)
      localStorage.removeItem(KEY)
      expect(initialWidth()).toBe(DEFAULT_WIDTH)
    })
  })

  it('setWidth clamps and persists', () => {
    useSidebarStore.getState().setWidth(420)
    expect(useSidebarStore.getState().width).toBe(420)
    expect(localStorage.getItem(KEY)).toBe('420')

    useSidebarStore.getState().setWidth(9999)
    expect(useSidebarStore.getState().width).toBe(MAX_WIDTH)
    expect(localStorage.getItem(KEY)).toBe(String(MAX_WIDTH))
  })

  it('reset restores the default width', () => {
    useSidebarStore.getState().setWidth(500)
    useSidebarStore.getState().reset()
    expect(useSidebarStore.getState().width).toBe(DEFAULT_WIDTH)
    expect(localStorage.getItem(KEY)).toBe(String(DEFAULT_WIDTH))
  })
})
