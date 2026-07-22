import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('./graph/GraphPreview', () => ({
  default: ({ graph }) => <div data-testid="graph-result">{graph.nodes.map((node) => node.label).join('|')}</div>,
}))

import { KnowledgeGraph } from './Inspector'

const metadata = { title: 'Mới', summary: '', document_type: 'notes', category: 'Test', tags: [], topics: [] }

describe('KnowledgeGraph request lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('debounce 400ms và hủy request cũ khi nội dung đổi', async () => {
    const signals = []
    globalThis.fetch = vi.fn((_url, options) => {
      signals.push(options.signal)
      return new Promise(() => {})
    })
    const { rerender } = render(<KnowledgeGraph jobId="job" markdown="one" metadata={metadata} ready />)
    await act(() => vi.advanceTimersByTimeAsync(400))
    expect(fetch).toHaveBeenCalledTimes(1)
    rerender(<KnowledgeGraph jobId="job" markdown="two" metadata={metadata} ready />)
    expect(signals[0].aborted).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(399))
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  test('response cũ không ghi đè graph mới', async () => {
    const resolvers = []
    globalThis.fetch = vi.fn(() => new Promise((resolve) => resolvers.push(resolve)))
    const { rerender } = render(<KnowledgeGraph jobId="job" markdown="one" metadata={metadata} ready />)
    await act(() => vi.advanceTimersByTimeAsync(400))
    rerender(<KnowledgeGraph jobId="job" markdown="two" metadata={metadata} ready />)
    await act(() => vi.advanceTimersByTimeAsync(400))
    await act(async () => {
      resolvers[1]({ ok: true, json: async () => ({ center_id: 'category:new', nodes: [{ id: 'category:new', label: 'Graph mới', type: 'category' }], edges: [], warnings: [] }) })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('Graph mới')).toBeInTheDocument()
    await act(async () => {
      resolvers[0]({ ok: true, json: async () => ({ center_id: 'category:old', nodes: [{ id: 'category:old', label: 'Graph cũ', type: 'category' }], edges: [], warnings: [] }) })
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.queryByText('Graph cũ')).not.toBeInTheDocument()
  })
})
