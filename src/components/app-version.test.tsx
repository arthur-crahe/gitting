import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('0.2.1'),
}))

import { AppVersion } from './app-version'

describe('AppVersion', () => {
  it('renders the running app version once resolved', async () => {
    render(<AppVersion />)
    expect(await screen.findByText('gitting v0.2.1')).toBeInTheDocument()
  })
})
