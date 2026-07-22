import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import MarkdownRenderer from './MarkdownRenderer'

describe('MarkdownRenderer', () => {
  test('does not expose internal page markers in preview', () => {
    const { container } = render(<MarkdownRenderer markdown={'<!-- page:1 -->\n\n# Nội dung'} />)
    expect(screen.getByRole('heading', { name: 'Nội dung' })).toBeInTheDocument()
    expect(container).not.toHaveTextContent('<!-- page:1 -->')
  })
})
