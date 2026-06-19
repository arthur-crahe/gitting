import { describe, expect, it } from 'vitest'
import {
  clampWidth,
  DEFAULT_WIDTH,
  MAX_WIDTH,
  MIN_WIDTH,
  nextWidthForKey,
  STEP,
  widthFromDrag,
} from './resize-utils'

describe('clampWidth', () => {
  it('keeps an in-range width unchanged', () => {
    expect(clampWidth(DEFAULT_WIDTH)).toBe(DEFAULT_WIDTH)
  })

  it('clamps below the minimum and above the maximum', () => {
    expect(clampWidth(MIN_WIDTH - 100)).toBe(MIN_WIDTH)
    expect(clampWidth(MAX_WIDTH + 100)).toBe(MAX_WIDTH)
  })
})

describe('widthFromDrag', () => {
  it('adds the horizontal travel to the start width', () => {
    expect(widthFromDrag(300, 100, 140)).toBe(340)
    expect(widthFromDrag(300, 100, 60)).toBe(260)
  })

  it('clamps the result at both ends', () => {
    expect(widthFromDrag(MAX_WIDTH, 0, 500)).toBe(MAX_WIDTH)
    expect(widthFromDrag(MIN_WIDTH, 0, -500)).toBe(MIN_WIDTH)
  })
})

describe('nextWidthForKey', () => {
  it('steps left and right by STEP, clamped', () => {
    expect(nextWidthForKey('ArrowRight', 300)).toEqual({ width: 300 + STEP, handled: true })
    expect(nextWidthForKey('ArrowLeft', 300)).toEqual({ width: 300 - STEP, handled: true })
    expect(nextWidthForKey('ArrowLeft', MIN_WIDTH)).toEqual({ width: MIN_WIDTH, handled: true })
    expect(nextWidthForKey('ArrowRight', MAX_WIDTH)).toEqual({ width: MAX_WIDTH, handled: true })
  })

  it('jumps to the bounds on Home and End', () => {
    expect(nextWidthForKey('Home', 400)).toEqual({ width: MIN_WIDTH, handled: true })
    expect(nextWidthForKey('End', 400)).toEqual({ width: MAX_WIDTH, handled: true })
  })

  it('ignores any other key', () => {
    expect(nextWidthForKey('Enter', 400)).toEqual({ width: 400, handled: false })
    expect(nextWidthForKey('a', 400)).toEqual({ width: 400, handled: false })
  })
})
