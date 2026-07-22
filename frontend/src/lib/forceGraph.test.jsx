import { describe, expect, test } from 'vitest'
import { edgeDistance, labelFootprint, PersistentForceGraph, routeEdge } from './forceGraph'
import { buildMetadataGraph, edgeNodeId, localSubgraph, nodeRadius } from './graphModel'

function graphFixture(count = 8) {
  const nodes = Array.from({ length: count }, (_, index) => ({
    id: `node:${index}`,
    label: `Knowledge node ${index}`,
    type: index === 0 ? 'document' : index % 7 === 0 ? 'tag' : index % 5 === 0 ? 'topic' : 'note',
    current: index === 0,
    exists: index % 3 !== 0,
    degree: index === 0 ? Math.min(count - 1, 12) : 2,
  }))
  const edges = []
  for (let index = 1; index < count; index += 1) {
    edges.push({ source: `node:${Math.max(0, Math.floor((index - 1) / 2))}`, target: `node:${index}`, type: index % 4 === 0 ? 'wikilink' : 'topic' })
  }
  return { center_id: 'node:0', nodes, edges }
}

function cloneGraph(graph) {
  return JSON.parse(JSON.stringify(graph))
}

function circleOverlaps(nodes) {
  for (let index = 0; index < nodes.length; index += 1) {
    for (let other = index + 1; other < nodes.length; other += 1) {
      if (Math.hypot(nodes[index].x - nodes[other].x, nodes[index].y - nodes[other].y) < nodeRadius(nodes[index]) + nodeRadius(nodes[other]) - 0.5) return true
    }
  }
  return false
}

function rectangleOverlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

describe('persistent force graph', () => {
  test('reconciles a new graph object by id without replacing world coordinates', () => {
    const graph = graphFixture(8)
    const controller = new PersistentForceGraph(graph)
    controller.manualTick(240)
    const before = controller.positions()
    controller.reconcile(cloneGraph(graph))
    const after = controller.positions()
    for (const id of before.keys()) expect(after.get(id)).toEqual(before.get(id))
    controller.dispose()
  })

  test('selection, filtering and local/global projections do not touch world positions', () => {
    const graph = graphFixture(30)
    const controller = new PersistentForceGraph(graph)
    controller.manualTick(500)
    const before = controller.positions()
    localSubgraph(graph, 'node:4', 1)
    localSubgraph(graph, 'node:4', 2)
    localSubgraph(graph, 'node:0', 30)
    const after = controller.positions()
    expect(after).toEqual(before)
    controller.dispose()
  })

  test('seeds new nodes beside an existing neighbor and removes stale links', () => {
    const graph = graphFixture(4)
    const controller = new PersistentForceGraph(graph)
    controller.manualTick(160)
    const expanded = cloneGraph(graph)
    expanded.nodes.push({ id: 'new', label: 'New neighbor', type: 'note', degree: 1 })
    expanded.edges.push({ source: 'node:1', target: 'new', type: 'wikilink' })
    controller.reconcile(expanded)
    const positions = controller.positions()
    expect(Math.hypot(positions.get('new').x - positions.get('node:1').x, positions.get('new').y - positions.get('node:1').y)).toBeLessThan(64)
    expanded.nodes = expanded.nodes.filter((node) => node.id !== 'node:2')
    expanded.edges = expanded.edges.filter((edge) => edge.source !== 'node:2' && edge.target !== 'node:2')
    controller.reconcile(expanded)
    const snapshot = controller.snapshot()
    expect(snapshot.nodes.some((node) => node.id === 'node:2')).toBe(false)
    expect(snapshot.edges.some((edge) => edgeNodeId(edge.source) === 'node:2' || edgeNodeId(edge.target) === 'node:2')).toBe(false)
    controller.dispose()
  })

  test.each([8, 30, 80])('settles %i nodes without glyph overlap', (count) => {
    const controller = new PersistentForceGraph(graphFixture(count))
    const { nodes } = controller.manualTick(count === 80 ? 900 : 560)
    expect(circleOverlaps(nodes)).toBe(false)
    controller.dispose()
  })

  test.each([8, 30, 80])('keeps visible label footprints separated for %i nodes', (count) => {
    const controller = new PersistentForceGraph(graphFixture(count))
    const { nodes } = controller.manualTick(count === 80 ? 1100 : 800)
    const boxes = nodes.map(labelFootprint)
    const overlaps = []
    for (let index = 0; index < boxes.length; index += 1) {
      for (let other = index + 1; other < boxes.length; other += 1) {
        if (rectangleOverlaps(boxes[index], boxes[other])) overlaps.push({
          pair: [nodes[index].id, nodes[other].id],
          x: Math.min(boxes[index].right, boxes[other].right) - Math.max(boxes[index].left, boxes[other].left),
          y: Math.min(boxes[index].bottom, boxes[other].bottom) - Math.max(boxes[index].top, boxes[other].top),
        })
      }
    }
    expect(overlaps).toEqual([])
    controller.dispose()
  })

  test('drag disturbs a connected node more than an unrelated node and release keeps motion', () => {
    const graph = {
      center_id: 'a',
      nodes: ['a', 'b', 'c', 'd'].map((id, index) => ({ id, label: id, type: 'note', current: id === 'a', degree: index < 2 ? 1 : 0 })),
      edges: [{ source: 'a', target: 'b', type: 'wikilink' }],
    }
    const controller = new PersistentForceGraph(graph)
    controller.manualTick(220)
    const before = controller.positions()
    controller.beginDrag('a')
    controller.dragTo('a', before.get('a').x + 150, before.get('a').y + 20)
    controller.manualTick(32)
    const dragged = controller.positions()
    const movement = (id) => Math.hypot(dragged.get(id).x - before.get(id).x, dragged.get(id).y - before.get(id).y)
    expect(movement('b')).toBeGreaterThan(movement('d'))
    controller.endDrag('a')
    const released = controller.positions().get('a')
    controller.manualTick(4)
    const continued = controller.positions().get('a')
    expect(Math.hypot(continued.x - released.x, continued.y - released.y)).toBeGreaterThan(0)
    controller.dispose()
  })

  test('settles into BFS rings and restores the current document to world origin', () => {
    const controller = new PersistentForceGraph(graphFixture(7))
    let snapshot = controller.manualTick(1000)
    const byId = new Map(snapshot.nodes.map((node) => [node.id, node]))
    const distance = (a, b = { x: 0, y: 0 }) => Math.hypot(a.x - b.x, a.y - b.y)
    const depthOneRadius = (distance(byId.get('node:1')) + distance(byId.get('node:2'))) / 2
    const depthTwoRadius = [3, 4, 5, 6].reduce((sum, index) => sum + distance(byId.get(`node:${index}`)), 0) / 4
    expect(distance(byId.get('node:0'))).toBeLessThan(8)
    expect(depthOneRadius).toBeGreaterThan(90)
    expect(depthTwoRadius).toBeGreaterThan(depthOneRadius + 45)
    expect(distance(byId.get('node:3'), byId.get('node:1'))).toBeLessThan(distance(byId.get('node:3'), byId.get('node:2')))

    const root = controller.positions().get('node:0')
    controller.beginDrag('node:0')
    controller.dragTo('node:0', root.x + 180, root.y + 70)
    controller.manualTick(12)
    controller.endDrag('node:0')
    snapshot = controller.manualTick(700)
    const restored = snapshot.nodes.find((node) => node.id === 'node:0')
    expect(distance(restored)).toBeLessThan(8)
    expect(Math.max(...snapshot.nodes.map((node) => Math.hypot(node.vx, node.vy)))).toBeLessThan(0.12)
    controller.dispose()
  })

  test('uses longer relationship distances and always renders a clipped straight edge', () => {
    const source = { id: 'a', x: 0, y: 0, type: 'note', degree: 1 }
    const target = { id: 'b', x: 160, y: 0, type: 'note', degree: 1 }
    const obstacle = { id: 'c', x: 80, y: 0, type: 'note', degree: 1 }
    const edge = { id: 'a-b', source: 'a', target: 'b', type: 'wikilink' }
    const path = routeEdge(edge, source, target, [source, target, obstacle])
    expect(path).toMatch(/^M[^Q]+ L/)
    expect(path).not.toContain('Q')
    expect(path).not.toContain('M0.00,0.00')
    expect(edgeDistance({ type: 'topic' })).toBe(100)
    expect(edgeDistance({ type: 'wikilink' })).toBe(124)
    expect(edgeDistance({ type: 'category' })).toBe(136)
  })
})

describe('local graph traversal', () => {
  test('returns induced depth 1 and depth 2 neighborhoods', () => {
    const graph = {
      center_id: 'a',
      nodes: ['a', 'b', 'c', 'd'].map((id) => ({ id, label: id, type: 'note' })),
      edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }, { source: 'c', target: 'd' }, { source: 'a', target: 'c' }],
    }
    expect(localSubgraph(graph, 'b', 1).nodes.map((node) => node.id)).toEqual(['a', 'b', 'c'])
    const depthTwo = localSubgraph(graph, 'b', 2)
    expect(depthTwo.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(depthTwo.edges).toHaveLength(4)
  })

  test('compact preview is all direct neighbors rather than a six-node slice', () => {
    const graph = buildMetadataGraph({ title: 'Demo', category: 'Test', topics: ['A', 'B', 'C', 'D'], tags: ['x', 'y', 'z'] })
    expect(localSubgraph(graph, 'current:metadata', 1).nodes).toHaveLength(9)
  })
})
