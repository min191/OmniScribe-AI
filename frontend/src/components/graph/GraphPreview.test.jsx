import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { describe, expect, test, vi } from 'vitest'
import { buildMetadataGraph } from '../../lib/graphModel'
import GraphPreview from './GraphPreview'

const graph = buildMetadataGraph({ title: 'Demo', category: 'Học tập', topics: ['Vật lý'], tags: ['ocr'] })

describe('GraphPreview', () => {
  test('compact và Explorer dùng chung world coordinates, preview vẫn chọn được node', async () => {
    render(<GraphPreview graph={graph} loading={false} depth={1} includeTags onDepthChange={() => {}} onTagsChange={() => {}} />)
    await screen.findByRole('button', { name: 'Tài liệu hiện tại: Demo' })
    await userEvent.click(screen.getByRole('button', { name: 'Chủ đề: Vật lý' }))
    expect(screen.getByText('Chủ đề · Vật lý')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mở graph' }))
    await waitFor(() => {
      const currentNodes = screen.getAllByRole('button', { name: 'Tài liệu hiện tại: Demo' })
      expect(currentNodes).toHaveLength(2)
      expect(currentNodes[0].getAttribute('transform')).toBe(currentNodes[1].getAttribute('transform'))
    })
  })

  test('hover làm mờ node không liên quan', async () => {
    render(<GraphPreview graph={graph} loading={false} depth={1} includeTags onDepthChange={() => {}} onTagsChange={() => {}} />)
    const category = await screen.findByRole('button', { name: 'Danh mục: Học tập' })
    fireEvent.pointerEnter(category)
    expect(screen.getByRole('button', { name: 'Chủ đề: Vật lý' })).toHaveClass('dimmed')
  })

  test('dialog đổi depth/tags, đóng Escape và trả focus', async () => {
    const onDepthChange = vi.fn()
    const onTagsChange = vi.fn()
    render(<GraphPreview graph={graph} loading={false} depth={1} includeTags onDepthChange={onDepthChange} onTagsChange={onTagsChange} />)
    const open = screen.getByRole('button', { name: 'Mở graph' })
    await userEvent.click(open)
    const dialog = screen.getByRole('dialog')
    await userEvent.selectOptions(screen.getByLabelText('Độ sâu'), '2')
    await userEvent.click(screen.getByLabelText('Hiện tags'))
    expect(onDepthChange).toHaveBeenCalledWith(2)
    expect(onTagsChange).toHaveBeenCalledWith(false)
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(open).toHaveFocus())
  })

  test('dialog tìm kiếm và lọc node theo loại', async () => {
    render(<GraphPreview graph={graph} loading={false} depth={1} includeTags onDepthChange={() => {}} onTagsChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mở graph' }))
    const search = screen.getByPlaceholderText('Tìm theo tên node…')
    await userEvent.type(search, 'vat ly{Enter}')
    expect(screen.getByRole('heading', { name: 'Vật lý' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Chủ đề' }))
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Chủ đề: Vật lý' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Vật lý' })).toBeInTheDocument()
  })

  test('click vùng trống clear selection và Local/Global chỉ đổi projection', async () => {
    const chainGraph = {
      center_id: 'a',
      nodes: [
        { id: 'a', label: 'A', type: 'document', current: true, degree: 1, exists: true },
        { id: 'b', label: 'B', type: 'note', degree: 2, exists: true },
        { id: 'c', label: 'C', type: 'note', degree: 1, exists: true },
      ],
      edges: [{ source: 'a', target: 'b', type: 'wikilink' }, { source: 'b', target: 'c', type: 'wikilink' }],
    }
    const { container } = render(<GraphPreview graph={chainGraph} loading={false} depth={1} includeTags onDepthChange={() => {}} onTagsChange={() => {}} />)
    const previewCanvas = screen.getByRole('group', { name: 'Local graph của tài liệu' })
    await new Promise((resolve) => setTimeout(resolve, 220))
    const camera = container.querySelector('.local-graph.compact .graph-world')
    const cameraBeforePan = camera.getAttribute('transform')
    fireEvent.pointerDown(previewCanvas, { pointerId: 2, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(previewCanvas, { pointerId: 2, clientX: 90, clientY: 70 })
    fireEvent.pointerUp(previewCanvas, { pointerId: 2, clientX: 90, clientY: 70 })
    expect(camera.getAttribute('transform')).toBe(cameraBeforePan)
    fireEvent.pointerDown(previewCanvas, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(previewCanvas, { pointerId: 1, clientX: 10, clientY: 10 })
    expect(screen.getByText('Chọn một node để xem chi tiết')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Mở graph' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Note: C' })).not.toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Global' }))
    expect(within(dialog).getByRole('button', { name: 'Note: C' })).toBeInTheDocument()
  })

  test('selection không làm mờ graph và stale selection không làm graph tối', async () => {
    const chainGraph = {
      center_id: 'a',
      nodes: [
        { id: 'a', label: 'A', type: 'document', current: true, degree: 1, exists: true },
        { id: 'b', label: 'B', type: 'note', degree: 2, exists: true },
        { id: 'c', label: 'C', type: 'note', degree: 1, exists: true },
      ],
      edges: [{ source: 'a', target: 'b', type: 'wikilink' }, { source: 'b', target: 'c', type: 'wikilink' }],
    }
    const { container, rerender } = render(<GraphPreview graph={chainGraph} loading={false} depth={2} includeTags onDepthChange={() => {}} onTagsChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mở graph' }))
    const dialog = screen.getByRole('dialog')
    const nodeC = within(dialog).getByRole('button', { name: 'Note: C' })
    expect(nodeC).not.toHaveClass('dimmed')
    expect(container.querySelectorAll('.local-graph-edges .dimmed')).toHaveLength(0)

    await userEvent.click(nodeC)
    const withoutC = { ...chainGraph, nodes: chainGraph.nodes.slice(0, 2), edges: chainGraph.edges.slice(0, 1) }
    rerender(<GraphPreview graph={withoutC} loading={false} depth={2} includeTags onDepthChange={() => {}} onTagsChange={() => {}} />)
    await waitFor(() => expect(container.querySelectorAll('.local-node.dimmed, .local-graph-edges .dimmed')).toHaveLength(0))
  })

  test('chỉ mở open_uri từ detail action, không mở khi chọn hoặc kéo node', async () => {
    const graphWithUri = buildMetadataGraph({ title: 'Demo', category: 'Học tập', topics: ['Vật lý'], tags: [] })
    graphWithUri.nodes.find((node) => node.id === 'topic:vat-ly').open_uri = 'obsidian://open?vault=Demo&file=Vat-ly'
    render(<GraphPreview graph={graphWithUri} loading={false} depth={1} includeTags onDepthChange={() => {}} onTagsChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mở graph' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Chủ đề: Vật lý' }))
    expect(within(dialog).getByRole('link', { name: 'Mở trong Obsidian' })).toHaveAttribute('href', 'obsidian://open?vault=Demo&file=Vat-ly')
  })

  test('dialog vẫn mở khi component chạy trong React StrictMode', async () => {
    render(
      <StrictMode>
        <GraphPreview graph={graph} loading={false} depth={1} includeTags onDepthChange={() => {}} onTagsChange={() => {}} />
      </StrictMode>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Mở graph' }))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
  })
})
