import { forceCollide, forceLink, forceManyBody, forceRadial, forceSimulation } from 'd3-force'
import { currentNodeId, edgeNodeId, nodeRadius } from './graphModel'

const GOLDEN_ANGLE = 2.399963229728653
const DEFAULT_CENTER = { x: 0, y: 0 }

export function stableHash(value = '') {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function edgeDistance(edge) {
  if (edge.type === 'wikilink') return 124
  if (edge.type === 'category') return 136
  return 100
}

export function edgeStrength(edge) {
  if (edge.type === 'wikilink') return 0.46
  if (edge.type === 'category') return 0.34
  if (edge.type === 'tag') return 0.56
  return 0.62
}

export function chargeStrength(node) {
  return Math.max(-260, Math.min(-90, -90 - Math.max(0, node.degree || 0) * 18))
}

export function labelFootprint(node) {
  const radius = nodeRadius(node)
  const width = Math.min(168, Math.max(42, String(node.label || '').length * 6.2 + 14))
  const height = String(node.label || '').length > 22 ? 34 : 21
  return {
    left: node.x - width / 2,
    right: node.x + width / 2,
    top: node.y + radius + 5,
    bottom: node.y + radius + 5 + height,
    width,
    height,
  }
}

function rectanglesOverlap(a, b, padding = 4) {
  return a.left < b.right + padding
    && a.right + padding > b.left
    && a.top < b.bottom + padding
    && a.bottom + padding > b.top
}

export function forceLabelCollision() {
  let nodes = []
  let strength = 0.34
  function force() {
    for (let index = 0; index < nodes.length; index += 1) {
      const a = nodes[index]
      const boxA = labelFootprint(a)
      for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
        const b = nodes[otherIndex]
        const boxB = labelFootprint(b)
        if (!rectanglesOverlap(boxA, boxB)) continue
        const overlapX = Math.min(boxA.right - boxB.left, boxB.right - boxA.left) + 4
        const overlapY = Math.min(boxA.bottom - boxB.top, boxB.bottom - boxA.top) + 4
        if (overlapX < overlapY) {
          const direction = a.x <= b.x ? 1 : -1
          const push = overlapX * strength * direction
          a.vx -= push
          b.vx += push
        } else {
          const sign = a.y <= b.y ? -1 : 1
          const push = overlapY * strength * sign
          a.vy += push
          b.vy -= push
        }
      }
    }
  }
  force.initialize = (value) => { nodes = value }
  force.strength = (value) => {
    if (value === undefined) return strength
    strength = value
    return force
  }
  return force
}

function normalizedEdges(graph) {
  return (graph.edges || []).map((edge, index) => ({
    ...edge,
    id: edge.id || `${edgeNodeId(edge.source)}|${edge.type || 'related'}|${edgeNodeId(edge.target)}|${index}`,
    source: edgeNodeId(edge.source),
    target: edgeNodeId(edge.target),
  }))
}

function neighborSeed(nodeId, graph, positions) {
  const edge = normalizedEdges(graph).find((item) => {
    const source = edgeNodeId(item.source)
    const target = edgeNodeId(item.target)
    return (source === nodeId && positions.has(target)) || (target === nodeId && positions.has(source))
  })
  if (!edge) return null
  const neighborId = edgeNodeId(edge.source) === nodeId ? edgeNodeId(edge.target) : edgeNodeId(edge.source)
  return positions.get(neighborId)
}

function seededPosition(node, index, graph, positions) {
  if (node.current) return { x: DEFAULT_CENTER.x, y: DEFAULT_CENTER.y }
  const neighbor = neighborSeed(node.id, graph, positions)
  const angle = ((stableHash(node.id) % 4096) / 4096) * Math.PI * 2
  if (neighbor) {
    const distance = 34 + (stableHash(`${node.id}:distance`) % 26)
    return { x: neighbor.x + Math.cos(angle) * distance, y: neighbor.y + Math.sin(angle) * distance }
  }
  const radius = 28 + Math.sqrt(index + 1) * 26
  return { x: DEFAULT_CENTER.x + Math.cos(index * GOLDEN_ANGLE + angle) * radius, y: DEFAULT_CENTER.y + Math.sin(index * GOLDEN_ANGLE + angle) * radius }
}

function hierarchyById(graph) {
  const nodes = graph.nodes || []
  const rootId = currentNodeId(graph)
  const adjacency = new Map(nodes.map((node) => [node.id, []]))
  for (const edge of graph.edges || []) {
    const source = edgeNodeId(edge.source)
    const target = edgeNodeId(edge.target)
    if (!adjacency.has(source) || !adjacency.has(target)) continue
    adjacency.get(source).push(target)
    adjacency.get(target).push(source)
  }
  for (const neighbors of adjacency.values()) neighbors.sort()
  const hierarchy = new Map()
  if (rootId && adjacency.has(rootId)) {
    hierarchy.set(rootId, { depth: 0, parentId: '' })
    const queue = [rootId]
    for (let index = 0; index < queue.length; index += 1) {
      const parentId = queue[index]
      const parent = hierarchy.get(parentId)
      for (const neighborId of adjacency.get(parentId)) {
        if (hierarchy.has(neighborId)) continue
        hierarchy.set(neighborId, { depth: parent.depth + 1, parentId })
        queue.push(neighborId)
      }
    }
  }
  for (const node of nodes) {
    if (!hierarchy.has(node.id)) hierarchy.set(node.id, { depth: 3, parentId: '' })
  }
  return hierarchy
}

function hierarchyRadius(node) {
  if (node.current || node.graphDepth === 0) return 0
  if (node.graphDepth === 1) return 125
  if (node.graphDepth === 2) return 225
  return Math.min(440, 300 + Math.max(0, node.graphDepth - 3) * 70 + stableHash(node.id) % 36)
}

function hierarchyStrength(node) {
  if (node.current || node.graphDepth === 0) return 0.72
  if (node.graphDepth === 1) return 0.13
  if (node.graphDepth === 2) return 0.1
  return 0.07
}

function graphSignature(graph) {
  const nodes = (graph.nodes || []).map((node) => node.id).sort().join(',')
  const edges = normalizedEdges(graph).map((edge) => `${edgeNodeId(edge.source)}>${edgeNodeId(edge.target)}:${edge.type || ''}`).sort().join(',')
  return `${nodes}::${edges}`
}

export class PersistentForceGraph {
  constructor(graph = { nodes: [], edges: [] }, options = {}) {
    this.listeners = new Set()
    this.nodesById = new Map()
    this.edges = []
    this.signature = ''
    this.draggedId = ''
    this.simulation = forceSimulation([])
      .velocityDecay(options.velocityDecay ?? 0.45)
      .alphaMin(options.alphaMin ?? 0.0015)
      .force('hierarchy', forceRadial(hierarchyRadius, DEFAULT_CENTER.x, DEFAULT_CENTER.y).strength(hierarchyStrength))
      .force('charge', forceManyBody().strength(chargeStrength).distanceMax(430))
      .force('collide', forceCollide().radius((node) => nodeRadius(node) + 5).strength(0.9).iterations(2))
      .force('labels', forceLabelCollision())
      .on('tick', () => this.emit())
    this.reconcile(graph)
  }

  reconcile(graph = { nodes: [], edges: [] }) {
    const previous = this.nodesById
    const next = new Map()
    const hierarchy = hierarchyById(graph)
    for (const [index, source] of (graph.nodes || []).entries()) {
      const graphPosition = hierarchy.get(source.id) || { depth: 3, parentId: '' }
      const existing = previous.get(source.id)
      if (existing) {
        Object.assign(existing, source, { graphDepth: graphPosition.depth, graphParentId: graphPosition.parentId })
        next.set(source.id, existing)
      } else {
        const seed = seededPosition(source, index, graph, next.size ? next : previous)
        next.set(source.id, { ...source, ...seed, graphDepth: graphPosition.depth, graphParentId: graphPosition.parentId, vx: 0, vy: 0, fx: null, fy: null })
      }
    }
    const links = normalizedEdges(graph).filter((edge) => next.has(edgeNodeId(edge.source)) && next.has(edgeNodeId(edge.target)))
    const nextSignature = graphSignature({ nodes: [...next.values()], edges: links })
    const topologyChanged = nextSignature !== this.signature
    this.nodesById = next
    this.edges = links
    this.signature = nextSignature
    const nodes = [...next.values()]
    this.simulation.nodes(nodes)
    this.simulation.force('link', forceLink(links).id((node) => node.id).distance(edgeDistance).strength(edgeStrength).iterations(2))
    if (topologyChanged && nodes.length) this.simulation.alpha(Math.max(this.simulation.alpha(), 0.42)).restart()
    if (!nodes.length) this.simulation.stop()
    this.emit()
    return this
  }

  subscribe(listener) {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  emit() {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) listener(snapshot)
  }

  snapshot() {
    return {
      nodes: [...this.nodesById.values()].map((node) => ({ ...node })),
      edges: this.edges.map((edge) => ({ ...edge, source: edgeNodeId(edge.source), target: edgeNodeId(edge.target) })),
    }
  }

  positions() {
    return new Map([...this.nodesById].map(([id, node]) => [id, { x: node.x, y: node.y, vx: node.vx, vy: node.vy, fx: node.fx, fy: node.fy }]))
  }

  manualTick(count = 1) {
    this.simulation.stop()
    this.simulation.tick(count)
    this.emit()
    return this.snapshot()
  }

  beginDrag(id) {
    const node = this.nodesById.get(id)
    if (!node) return
    this.draggedId = id
    node.fx = node.x
    node.fy = node.y
    this.simulation.alphaTarget(0.16).restart()
  }

  dragTo(id, x, y) {
    const node = this.nodesById.get(id)
    if (!node) return
    node.fx = x
    node.fy = y
    const direct = new Set([id])
    for (const edge of this.edges) {
      const source = edgeNodeId(edge.source)
      const target = edgeNodeId(edge.target)
      if (source === id) direct.add(target)
      if (target === id) direct.add(source)
    }
    for (const candidate of this.nodesById.values()) {
      if (!direct.has(candidate.id)) {
        candidate.vx *= 0.58
        candidate.vy *= 0.58
      }
    }
    this.emit()
  }

  endDrag(id) {
    const node = this.nodesById.get(id)
    if (!node) return
    node.fx = null
    node.fy = null
    this.draggedId = ''
    this.simulation.alpha(Math.max(this.simulation.alpha(), 0.32)).alphaTarget(0).restart()
  }

  dispose() {
    this.simulation.stop()
    this.listeners.clear()
  }
}

function clippedEndpoints(source, target) {
  const dx = target.x - source.x
  const dy = target.y - source.y
  const length = Math.max(1, Math.hypot(dx, dy))
  const ux = dx / length
  const uy = dy / length
  return {
    start: { x: source.x + ux * (nodeRadius(source) + 3), y: source.y + uy * (nodeRadius(source) + 3) },
    end: { x: target.x - ux * (nodeRadius(target) + 3), y: target.y - uy * (nodeRadius(target) + 3) },
  }
}

export function routeEdge(_edge, source, target) {
  const { start, end } = clippedEndpoints(source, target)
  return `M${start.x.toFixed(2)},${start.y.toFixed(2)} L${end.x.toFixed(2)},${end.y.toFixed(2)}`
}
