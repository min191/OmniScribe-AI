import { describe, expect, test } from 'vitest'
import {
  buildMetadataGraph,
  compactNeighborhood,
  connectionsForNode,
  filterGraph,
  neighborIds,
  nodeRadius,
  searchNodeIds,
} from './graphModel'

describe('graph model', () => {
  test('giữ category làm center và giới hạn tags', () => {
    const graph = buildMetadataGraph({ title: 'Demo', category: 'Học tập', topics: ['Vật lý'], tags: ['a', 'b', 'c', 'd'] })
    expect(graph.nodes[0].id).toBe(graph.center_id)
    expect(graph.nodes.filter((node) => node.type === 'tag')).toHaveLength(3)
    expect(graph.edges[0]).toMatchObject({ source: graph.center_id, type: 'category' })
  })

  test('node degree cao lớn hơn nhưng vẫn giữ glyph nhỏ', () => {
    expect(nodeRadius({ type: 'note', degree: 9 })).toBeGreaterThan(nodeRadius({ type: 'note', degree: 1 }))
    expect(nodeRadius({ type: 'note', degree: 10000 })).toBe(14)
  })

  test('tìm đúng neighborhood cho hover', () => {
    const graph = buildMetadataGraph({ title: 'Demo', category: 'Test', topics: ['A'], tags: ['B'] })
    const neighbors = neighborIds(graph, 'current:metadata')
    expect(neighbors).toContain(graph.center_id)
    expect(neighbors).toContain('topic:a')
  })

  test('preview lấy toàn bộ direct neighborhood không giới hạn sáu node', () => {
    const graph = buildMetadataGraph({ title: 'Demo', category: 'Test', topics: ['A', 'B', 'C'], tags: ['x', 'y', 'z'] })
    const compact = compactNeighborhood(graph)
    expect(compact.nodes).toHaveLength(8)
    expect(compact.nodes.some((node) => node.current)).toBe(true)
    expect(compact.nodes.some((node) => node.type === 'category')).toBe(true)
    expect(compact.hidden_count).toBe(0)
    expect(compact.counts).toMatchObject({ notes: 1, topics: 3, tags: 3, categories: 1 })
  })

  test('filter bỏ cả node lẫn dangling edges nhưng luôn giữ current/category', () => {
    const graph = buildMetadataGraph({ title: 'Demo', category: 'Test', topics: ['A'], tags: ['B'] })
    const filtered = filterGraph(graph, { notes: false, topics: true, tags: false })
    expect(filtered.nodes.map((node) => node.id)).toEqual([graph.center_id, 'current:metadata', 'topic:a'])
    expect(filtered.edges.every((edge) => filtered.nodes.some((node) => node.id === edge.source) && filtered.nodes.some((node) => node.id === edge.target))).toBe(true)
  })

  test('search không phân biệt dấu và connection giữ loại edge', () => {
    const graph = buildMetadataGraph({ title: 'Điện trường', category: 'Vật lý', topics: ['Năng lượng'], tags: [] })
    expect(searchNodeIds(graph, 'dien truong')).toEqual(['current:metadata'])
    expect(connectionsForNode(graph, 'current:metadata').map((item) => item.type)).toEqual(['category', 'topic'])
  })
})
