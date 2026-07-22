import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test } from 'vitest'
import { LanguageProvider } from '../lib/i18n'
import WorkbenchShell, { Pipeline } from './WorkbenchShell'

describe('interface language toggle', () => {
  beforeEach(() => localStorage.clear())

  test('switches workstation labels to English and persists the choice', async () => {
    render(
      <LanguageProvider>
        <MemoryRouter>
          <WorkbenchShell
            health={{ demo_mode: false }}
            phase="ready"
            processedPages={1}
            totalPages={2}
            left={<Pipeline phase="ready" />}
            center={<div>OCR content stays unchanged</div>}
            right={<div>Metadata</div>}
          />
        </MemoryRouter>
      </LanguageProvider>,
    )

    expect(screen.getByText('Sẵn sàng kiểm tra')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'EN' }))

    expect(screen.getByText('Ready to review')).toBeInTheDocument()
    expect(screen.getByText('Review draft')).toBeInTheDocument()
    expect(screen.getByText('OCR content stays unchanged')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(localStorage.getItem('omniscribe.language')).toBe('en'))
  })
})
