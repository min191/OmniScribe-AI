function slug(value, fallback) {
  return String(value || fallback).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback
}

export function edgeNodeId(value) {
  return typeof value === 'object' ? value.id : value
}

export function currentNodeId(graph = {}) {
  return graph.nodes?.find((node) => node.current)?.id || graph.center_id || ''
}

function edgePriority(type) {
  return { category: 0, wikilink: 1, topic: 2, tag: 3 }[type] ?? 4
}

export function graphCounts(graph = {}) {
  return (graph.nodes || []).reduce((counts, node) => {
    const key = node.type === 'topic' ? 'topics' : node.type === 'tag' ? 'tags' : node.type === 'category' ? 'categories' : 'notes'
    counts[key] += 1
    return counts
  }, { notes: 0, topics: 0, tags: 0, categories: 0 })
}

export function localSubgraph(graph = {}, focusId = currentNodeId(graph), depth = 1) {
  if (!focusId || !graph.nodes?.length) return { ...graph, nodes: [], edges: [], focus_id: '', hidden_count: 0, counts: graphCounts(graph) }
  const adjacency = new Map((graph.nodes || []).map((node) => [node.id, new Set()]))
  for (const edge of graph.edges || []) {
    const source = edgeNodeId(edge.source)
    const target = edgeNodeId(edge.target)
    if (adjacency.has(source) && adjacency.has(target)) {
      adjacency.get(source).add(target)
      adjacency.get(target).add(source)
    }
  }
  const keep = new Set([focusId])
  let frontier = [focusId]
  for (let level = 0; level < Math.max(0, depth); level += 1) {
    const next = []
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) || []) {
        if (keep.has(neighbor)) continue
        keep.add(neighbor)
        next.push(neighbor)
      }
    }
    frontier = next
  }
  return {
    ...graph,
    nodes: (graph.nodes || []).filter((node) => keep.has(node.id)),
    edges: (graph.edges || []).filter((edge) => keep.has(edgeNodeId(edge.source)) && keep.has(edgeNodeId(edge.target))),
    focus_id: focusId,
    hidden_count: Math.max(0, graph.nodes.length - keep.size),
    counts: graphCounts(graph),
  }
}

export function compactNeighborhood(graph = {}) {
  return localSubgraph(graph, currentNodeId(graph), 1)
}

function nodeFilterType(node) {
  if (node.type === 'topic') return 'topics'
  if (node.type === 'tag') return 'tags'
  return 'notes'
}

export function filterGraph(graph = {}, filters = {}) {
  const focusId = currentNodeId(graph)
  const keep = new Set((graph.nodes || []).filter((node) => (
    node.id === focusId
    || node.id === graph.center_id
    || filters[nodeFilterType(node)] !== false
  )).map((node) => node.id))
  return {
    ...graph,
    nodes: (graph.nodes || []).filter((node) => keep.has(node.id)),
    edges: (graph.edges || []).filter((edge) => keep.has(edgeNodeId(edge.source)) && keep.has(edgeNodeId(edge.target))),
  }
}

export function normalizeGraphSearch(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, (letter) => letter === 'Đ' ? 'D' : 'd').toLocaleLowerCase('vi').trim()
}

export function searchNodeIds(graph = {}, query = '') {
  const normalized = normalizeGraphSearch(query)
  if (!normalized) return []
  return (graph.nodes || []).filter((node) => normalizeGraphSearch(node.label).includes(normalized)).map((node) => node.id)
}

export function connectionsForNode(graph = {}, nodeId) {
  const nodesById = new Map((graph.nodes || []).map((node) => [node.id, node]))
  return (graph.edges || []).flatMap((edge) => {
    const source = edgeNodeId(edge.source)
    const target = edgeNodeId(edge.target)
    const relatedId = source === nodeId ? target : target === nodeId ? source : ''
    const node = nodesById.get(relatedId)
    return node ? [{ type: edge.type || 'related', node }] : []
  }).sort((a, b) => edgePriority(a.type) - edgePriority(b.type) || a.node.label.localeCompare(b.node.label))
}

export function buildMetadataGraph(metadata = {}, includeTags = true) {
  const category = String(metadata.category || '').trim()
  const title = String(metadata.title || '').trim()
  const topics = [...new Set((metadata.topics || []).map(String).map((item) => item.trim()).filter(Boolean))]
  const tags = includeTags ? [...new Set((metadata.tags || []).slice(0, 3).map(String).map((item) => item.trim()).filter(Boolean))] : []
  if (!category && !title && !topics.length && !tags.length) {
    return { center_id: '', nodes: [], edges: [], truncated: false, vault_available: true, warnings: [] }
  }
  const centerId = `category:${slug(category, 'chua-phan-loai')}`
  const currentId = 'current:metadata'
  const nodes = [
    { id: centerId, label: category || 'Chưa phân loại', type: 'category', degree: 1, exists: false, current: false },
    { id: currentId, label: title || 'Tài liệu hiện tại', type: 'document', degree: 1 + topics.length + tags.length, exists: false, current: true },
  ]
  const edges = [{ source: centerId, target: currentId, type: 'category' }]
  for (const topic of topics) {
    const id = `topic:${slug(topic, 'topic')}`
    nodes.push({ id, label: topic, type: 'topic', degree: 1, exists: false, current: false })
    edges.push({ source: currentId, target: id, type: 'topic' })
  }
  for (const tag of tags) {
    const id = `tag:${slug(tag, 'tag')}`
    nodes.push({ id, label: tag, type: 'tag', degree: 1, exists: false, current: false })
    edges.push({ source: currentId, target: id, type: 'tag' })
  }
  return { center_id: centerId, nodes, edges, truncated: false, vault_available: true, warnings: [] }
}

export function nodeRadius(node, compact = false) {
  const base = node.current ? 8.5 : node.type === 'category' ? 7.5 : node.type === 'tag' ? 4.5 : 5.5
  const radius = base + Math.sqrt(Math.max(0, node.degree || 0)) * 0.85
  return Math.min(compact ? 12 : 14, Math.max(compact ? 5 : 5.5, radius))
}

export function neighborIds(graph, nodeId) {
  const result = new Set([nodeId])
  for (const edge of graph.edges) {
    const source = edgeNodeId(edge.source)
    const target = edgeNodeId(edge.target)
    if (source === nodeId) result.add(target)
    if (target === nodeId) result.add(source)
  }
  return result
}
