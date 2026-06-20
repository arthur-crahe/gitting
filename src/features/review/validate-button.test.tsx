import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RowActions } from './row-context'
import { RowProvider } from './row-context'
import { ValidateButton } from './validate-button'

function renderWith(section: 'staged' | 'unstaged', act: RowActions['act']) {
  const actions: RowActions = { select: vi.fn(), act }
  return render(
    <Theme>
      <RowProvider value={actions}>
        <ValidateButton section={section} path="src/a.ts" />
      </RowProvider>
    </Theme>,
  )
}

describe('ValidateButton', () => {
  it('validates (stages) an unstaged file on click', () => {
    const act = vi.fn()
    renderWith('unstaged', act)
    fireEvent.click(screen.getByRole('button', { name: 'Valider src/a.ts' }))
    expect(act).toHaveBeenCalledWith('unstaged', 'src/a.ts')
  })

  it('un-validates (unstages) a staged file on click', () => {
    const act = vi.fn()
    renderWith('staged', act)
    fireEvent.click(screen.getByRole('button', { name: 'Dévalider src/a.ts' }))
    expect(act).toHaveBeenCalledWith('staged', 'src/a.ts')
  })

  it('stays out of the Tab order (the keyboard model validates via the list)', () => {
    renderWith('unstaged', vi.fn())
    expect(screen.getByRole('button', { name: 'Valider src/a.ts' })).toHaveAttribute(
      'tabindex',
      '-1',
    )
  })
})
