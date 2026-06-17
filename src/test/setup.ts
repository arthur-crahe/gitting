import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Unmount React trees and reset the DOM after each test.
afterEach(() => {
  cleanup()
})
