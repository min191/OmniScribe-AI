import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { routeEdge } from '../../lib/forceGraph'
import {
  compactNeighborhood,
  connectionsForNode,
  currentNodeId,
  edgeNodeId,
  filterGraph,
  localSubgraph,
  neighborIds,
  nodeRadius,
  searchNodeIds,
} from '../../lib/graphModel'
import { useI18n } from '../../lib/i18n'
import { usePersistentForceGraph } from './usePersistentForceGraph'

function useSize(ref, fallback) {
  const [size, setSize] = useState(fallback)
  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const update = () => setSize({ width: Math.max(240, element.clientWidth), height: Math.max(fallback.height, element.clientHeight) })
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [fallback.height, ref])
  return size
}

function typeLabel(node, t) {
  if (node.type === 'category') return t('graph.category')
  if (node.current) return t('graph.current')
  if (node.type === 'tag') return 'Tag'
  if (node.type === 'topic') return t('graph.topic')
  return t('graph.note')
}

function relationLabel(type, t) {
  return t(`graph.relation.${type || 'related'}`)
}

function splitLabel(label) {
  const value = String(label || '')
  if (value.length <= 22) return [value]
  const words = value.split(/\s+/)
  const lines = ['', '']
  for (const word of words) {
    const line = lines[0] && `${lines[0]} ${word}`.length > 22 ? 1 : 0
    lines[line] = `${lines[line]} ${word}`.trim()
  }
  if (!lines[1]) return [`${lines[0].slice(0, 21)}…`]
  if (lines[1].length > 22) lines[1] = `${lines[1].slice(0, 21)}…`
  return lines.filter(Boolean)
}

function NodeGlyph({ node }) {
  const radius = nodeRadius(node)
  return <circle className="node-glyph" r={radius} />
}

function NodeLabel({ node }) {
  const lines = splitLabel(node.label)
  const y = nodeRadius(node) + 14
  return (
    <text className="local-node-label" y={y} textAnchor="middle">
      {lines.map((line, index) => <tspan x="0" dy={index ? 12 : 0} key={`${line}-${index}`}>{line}</tspan>)}
    </text>
  )
}

function fittedView(nodes, size, focusId = '') {
  if (!nodes.length) return { x: size.width / 2, y: size.height / 2, scale: 1 }
  const focus = nodes.find((node) => node.id === focusId) || {
    x: nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length,
    y: nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length,
  }
  const halfWidth = Math.max(85, ...nodes.map((node) => Math.abs(node.x - focus.x) + 85))
  const halfHeight = Math.max(60, ...nodes.map((node) => Math.abs(node.y - focus.y) + 60))
  const width = halfWidth * 2
  const height = halfHeight * 2
  const scale = Math.min(1.6, Math.max(0.32, Math.min(size.width / width, size.height / height)))
  return {
    x: size.width / 2 - focus.x * scale,
    y: size.height / 2 - focus.y * scale,
    scale,
  }
}

function nearestNode(nodes, source, key) {
  const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key]
  if (!direction) return null
  return nodes
    .filter((node) => node.id !== source.id)
    .map((node) => ({ node, dx: node.x - source.x, dy: node.y - source.y }))
    .filter(({ dx, dy }) => dx * direction[0] + dy * direction[1] > 0)
    .sort((a, b) => (a.dx ** 2 + a.dy ** 2) - (b.dx ** 2 + b.dy ** 2))[0]?.node || null
}

function visibleLabels(nodes, graph, compact, scale, selectedId, hoveredId, searchMatches, visibleIds) {
  const labels = new Set([currentNodeId(graph), graph.center_id, selectedId, hoveredId, ...searchMatches].filter(Boolean))
  const pivot = hoveredId || selectedId || currentNodeId(graph)
  if (scale >= 0.72 || compact) {
    for (const id of neighborIds(graph, pivot)) labels.add(id)
    for (const node of nodes.filter((item) => visibleIds.has(item.id)).sort((a, b) => (b.degree || 0) - (a.degree || 0)).slice(0, compact ? 6 : 12)) labels.add(node.id)
  }
  if (scale >= 1.08) for (const id of visibleIds) labels.add(id)
  return labels
}

function GraphCanvas({ graph, world, controller, visibleIds, compact = false, selectedId, searchMatches = [], onSelect, cameraRevision = 0 }) {
  const { t } = useI18n()
  const wrapRef = useRef(null)
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const markerId = `graph-arrow-${useId().replace(/:/g, '')}`
  const [hoveredId, setHoveredId] = useState('')
  const [view, setView] = useState({ x: compact ? 160 : 450, y: compact ? 115 : 280, scale: 1 })
  const [cameraMoving, setCameraMoving] = useState(false)
  const fittedRef = useRef(false)
  const size = useSize(wrapRef, { width: compact ? 320 : 900, height: compact ? 230 : 560 })
  const byId = useMemo(() => new Map(world.nodes.map((node) => [node.id, node])), [world.nodes])
  const renderNodes = useMemo(() => world.nodes.filter((node) => visibleIds.has(node.id)), [visibleIds, world.nodes])
  const hasRenderNodes = renderNodes.length > 0
  const cameraNodesRef = useRef(renderNodes)
  const cameraSizeRef = useRef(size)
  const cameraFocusId = visibleIds.has(currentNodeId(graph)) ? currentNodeId(graph) : selectedId
  const cameraFocusRef = useRef(cameraFocusId)
  cameraNodesRef.current = renderNodes
  cameraSizeRef.current = size
  cameraFocusRef.current = cameraFocusId
  const labels = useMemo(
    () => visibleLabels(world.nodes, graph, compact, view.scale, selectedId, hoveredId, searchMatches, visibleIds),
    [compact, graph, hoveredId, searchMatches, selectedId, view.scale, visibleIds, world.nodes],
  )
  const emphasis = useMemo(() => {
    if (searchMatches.length) return new Set(searchMatches)
    return hoveredId ? neighborIds(graph, hoveredId) : new Set(visibleIds)
  }, [graph, hoveredId, searchMatches, visibleIds])

  useEffect(() => {
    if (!hasRenderNodes || fittedRef.current) return
    fittedRef.current = true
    const timeout = setTimeout(() => setView(fittedView(cameraNodesRef.current, cameraSizeRef.current, cameraFocusRef.current)), 160)
    return () => clearTimeout(timeout)
  }, [hasRenderNodes])

  useEffect(() => {
    if (!compact || !hasRenderNodes) return
    setView(fittedView(cameraNodesRef.current, size, cameraFocusRef.current))
  }, [compact, hasRenderNodes, size.height, size.width])

  useEffect(() => {
    if (!cameraRevision || !cameraNodesRef.current.length) return
    setCameraMoving(true)
    setView(fittedView(cameraNodesRef.current, cameraSizeRef.current, cameraFocusRef.current))
    const timeout = setTimeout(() => setCameraMoving(false), 180)
    return () => clearTimeout(timeout)
  }, [cameraRevision])

  function canvasPoint(event) {
    const rect = svgRef.current.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function graphPoint(event) {
    const point = canvasPoint(event)
    return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale }
  }

  function startPan(event) {
    svgRef.current.setPointerCapture?.(event.pointerId)
    dragRef.current = { mode: compact ? 'background' : 'pan', pointerId: event.pointerId, origin: canvasPoint(event), view, moved: false }
  }

  function startNodeDrag(event, node) {
    event.stopPropagation()
    svgRef.current.setPointerCapture?.(event.pointerId)
    const point = graphPoint(event)
    controller.beginDrag(node.id)
    dragRef.current = { mode: 'node', pointerId: event.pointerId, nodeId: node.id, origin: point, dx: point.x - node.x, dy: point.y - node.y, moved: false }
  }

  function movePointer(event) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.mode === 'pan' || drag.mode === 'background') {
      const point = canvasPoint(event)
      const dx = point.x - drag.origin.x
      const dy = point.y - drag.origin.y
      if (Math.hypot(dx, dy) > 3) drag.moved = true
      if (drag.mode === 'pan') setView({ ...drag.view, x: drag.view.x + dx, y: drag.view.y + dy })
    } else {
      const point = graphPoint(event)
      if (Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y) > 2) drag.moved = true
      controller.dragTo(drag.nodeId, point.x - drag.dx, point.y - drag.dy)
    }
  }

  function endPointer(event) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.mode === 'node') {
      controller.endDrag(drag.nodeId)
      if (drag.moved) {
        suppressClickRef.current = true
        requestAnimationFrame(() => { suppressClickRef.current = false })
      }
    }
    if ((drag.mode === 'pan' || drag.mode === 'background') && !drag.moved) onSelect('')
    dragRef.current = null
  }

  function zoom(factor, anchor = { x: size.width / 2, y: size.height / 2 }) {
    setView((current) => {
      const scale = Math.min(3.2, Math.max(0.28, current.scale * factor))
      const gx = (anchor.x - current.x) / current.scale
      const gy = (anchor.y - current.y) / current.scale
      return { x: anchor.x - gx * scale, y: anchor.y - gy * scale, scale }
    })
  }

  function resetCamera() {
    const focus = byId.get(cameraFocusId)
    setView(focus ? { x: size.width / 2 - focus.x, y: size.height / 2 - focus.y, scale: 1 } : fittedView(renderNodes, size))
  }

  function moveFocus(event, node) {
    const next = nearestNode(renderNodes, node, event.key)
    if (!next) return
    event.preventDefault()
    onSelect(next.id)
    requestAnimationFrame(() => [...(svgRef.current?.querySelectorAll('[data-node-id]') || [])].find((element) => element.dataset.nodeId === next.id)?.focus())
  }

  return (
    <div ref={wrapRef} className={compact ? 'local-graph compact' : 'local-graph expanded'}>
      {!compact && (
        <div className="graph-canvas-controls" role="group" aria-label={t('graph.controls')}>
          <button type="button" onClick={() => zoom(0.8)} aria-label={t('graph.zoomOut')}>−</button>
          <output>{Math.round(view.scale * 100)}%</output>
          <button type="button" onClick={() => zoom(1.25)} aria-label={t('graph.zoomIn')}>+</button>
          <button type="button" onClick={() => setView(fittedView(renderNodes, size, cameraFocusId))}>{t('graph.fit')}</button>
          <button type="button" onClick={resetCamera}>{t('graph.reset')}</button>
        </div>
      )}
      <svg
        ref={svgRef}
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="group"
        aria-label={t('graph.documentAria')}
        onPointerDown={startPan}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={compact ? undefined : (event) => { event.preventDefault(); zoom(event.deltaY < 0 ? 1.12 : 0.89, canvasPoint(event)) }}
      >
        <defs><marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0l8 4-8 4z" /></marker></defs>
        <g className={`graph-world ${cameraMoving ? 'camera-moving' : ''}`} transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          <g className="local-graph-edges">
            {world.edges.map((edge, index) => {
              const sourceId = edgeNodeId(edge.source)
              const targetId = edgeNodeId(edge.target)
              const source = byId.get(sourceId)
              const target = byId.get(targetId)
              if (!source || !target) return null
              const visible = visibleIds.has(sourceId) && visibleIds.has(targetId)
              const dimmed = visible && (!emphasis.has(sourceId) || !emphasis.has(targetId))
              return <path className={`edge-${edge.type || 'related'} ${visible ? '' : 'graph-hidden'} ${dimmed ? 'dimmed' : ''}`} markerEnd={edge.type === 'wikilink' ? `url(#${markerId})` : undefined} key={edge.id || `${sourceId}-${targetId}-${index}`} d={routeEdge(edge, source, target, world.nodes)} />
            })}
          </g>
          <g className="local-graph-nodes">
            {world.nodes.map((node) => {
              const visible = visibleIds.has(node.id)
              const selected = selectedId === node.id
              const dimmed = visible && !emphasis.has(node.id)
              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  className={`local-node ${node.type} ${node.current ? 'current' : ''} ${node.exists ? 'exists' : 'temporary'} ${selected ? 'selected' : ''} ${visible ? '' : 'graph-hidden'} ${dimmed ? 'dimmed' : ''}`}
                  transform={`translate(${node.x} ${node.y})`}
                  role={visible ? 'button' : undefined}
                  tabIndex={visible && selected ? 0 : -1}
                  aria-hidden={visible ? undefined : true}
                  aria-label={visible ? `${typeLabel(node, t)}: ${node.label}` : undefined}
                  onPointerDown={visible ? (event) => startNodeDrag(event, node) : undefined}
                  onPointerEnter={visible ? () => setHoveredId(node.id) : undefined}
                  onPointerLeave={visible ? () => setHoveredId('') : undefined}
                  onFocus={visible ? () => setHoveredId(node.id) : undefined}
                  onBlur={visible ? () => setHoveredId('') : undefined}
                  onClick={visible ? (event) => { event.stopPropagation(); if (!suppressClickRef.current) onSelect(node.id) } : undefined}
                  onKeyDown={visible ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.id) }
                    else moveFocus(event, node)
                  } : undefined}
                >
                  <NodeGlyph node={node} />
                  {visible && labels.has(node.id) && <NodeLabel node={node} />}
                </g>
              )
            })}
          </g>
        </g>
      </svg>
    </div>
  )
}

function GraphLegend() {
  const { t } = useI18n()
  return (
    <div className="graph-legend" aria-label={t('graph.legend')}>
      <span><i className="legend-node current" />{t('graph.current')}</span>
      <span><i className="legend-node note" />{t('graph.note')}</span>
      <span><i className="legend-node topic" />{t('graph.topic')}</span>
      <span><i className="legend-node tag" />Tag</span>
      <span><i className="legend-edge wikilink" />{t('graph.relation.wikilink')}</span>
    </div>
  )
}

function GraphNodeDetail({ graph, selected, onSelect }) {
  const { t } = useI18n()
  const connections = selected ? connectionsForNode(graph, selected.id) : []
  return (
    <aside className="graph-node-detail" aria-live="polite">
      {selected ? <>
        <span>{typeLabel(selected, t)}</span>
        <h3>{selected.label}</h3>
        <dl>
          <div><dt>{t('graph.links')}</dt><dd>{connections.length}</dd></div>
          <div><dt>{t('graph.status')}</dt><dd>{selected.exists ? t('graph.inVault') : t('graph.temporary')}</dd></div>
        </dl>
        {selected.path && <code>{selected.path}</code>}
        {connections.length > 0 && <div className="graph-connections"><h4>{t('graph.connections')}</h4>{connections.map(({ type, node }) => <button type="button" onClick={() => onSelect(node.id)} key={`${type}-${node.id}`}><span>{relationLabel(type, t)}</span>{node.label}</button>)}</div>}
        {selected.open_uri && <a className="machine-button primary" href={selected.open_uri}>{t('inspector.openObsidian')}</a>}
      </> : <p className="graph-detail-empty">{t('graph.selectHelp')}</p>}
    </aside>
  )
}

function GraphDialog({ graph, world, controller, initialSelectedId, depth, includeTags, onDepthChange, onTagsChange, onClose }) {
  const { t } = useI18n()
  const dialogRef = useRef(null)
  const [selectedId, setSelectedId] = useState(initialSelectedId || currentNodeId(graph))
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('local')
  const [filters, setFilters] = useState({ notes: true, topics: true, tags: includeTags })
  const [cameraRevision, setCameraRevision] = useState(0)
  const pivotId = selectedId || currentNodeId(graph)
  const modeGraph = useMemo(() => mode === 'local' ? localSubgraph(graph, pivotId, depth) : graph, [depth, graph, mode, pivotId])
  const visibleGraph = useMemo(() => filterGraph(modeGraph, { ...filters, tags: includeTags && filters.tags }), [filters, includeTags, modeGraph])
  const visibleIds = useMemo(() => new Set(visibleGraph.nodes.map((node) => node.id)), [visibleGraph.nodes])
  const matches = useMemo(() => searchNodeIds(visibleGraph, query), [query, visibleGraph])
  const selected = graph.nodes.find((node) => node.id === selectedId) || null

  useEffect(() => {
    if (selectedId && !graph.nodes.some((node) => node.id === selectedId)) setSelectedId('')
  }, [graph.nodes, selectedId])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal()
    } else dialog.setAttribute('open', '')
  }, [])

  function setGraphMode(value) {
    setMode(value)
    setCameraRevision((revision) => revision + 1)
  }

  function toggleFilter(key) {
    setFilters((current) => ({ ...current, [key]: !current[key] }))
  }

  function handleSearchKey(event) {
    if (event.key === 'Enter' && matches[0]) {
      event.preventDefault()
      setSelectedId(matches[0])
    }
  }

  return createPortal(
    <dialog ref={dialogRef} className="graph-dialog" onCancel={(event) => { event.preventDefault(); onClose() }} onClose={onClose}>
      <div className="graph-dialog-shell">
        <header>
          <div><span className="panel-code">B2 / {mode === 'local' ? 'LOCAL' : 'GLOBAL'}</span><h2>{t('graph.explorer')}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t('graph.close')}>×</button>
        </header>
        <div className="graph-explorer-toolbar">
          <div className="graph-mode-toggle" role="group" aria-label={t('graph.mode')}>
            <button type="button" className={mode === 'local' ? 'active' : ''} aria-pressed={mode === 'local'} onClick={() => setGraphMode('local')}>{t('graph.local')}</button>
            <button type="button" className={mode === 'global' ? 'active' : ''} aria-pressed={mode === 'global'} onClick={() => setGraphMode('global')}>{t('graph.global')}</button>
          </div>
          <label className="graph-search"><span className="visually-hidden">{t('graph.search')}</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleSearchKey} placeholder={t('graph.searchPlaceholder')} /><output>{query ? t('graph.resultCount', { count: matches.length }) : t('graph.nodeCount', { count: visibleGraph.nodes.length })}</output></label>
          <div className="graph-type-filters" aria-label={t('graph.filters')}>
            <button type="button" className={filters.notes ? 'active' : ''} aria-pressed={filters.notes} onClick={() => toggleFilter('notes')}>{t('graph.notes')}</button>
            <button type="button" className={filters.topics ? 'active' : ''} aria-pressed={filters.topics} onClick={() => toggleFilter('topics')}>{t('graph.topics')}</button>
          </div>
          <label>{t('graph.depth')}<select value={depth} onChange={(event) => onDepthChange(Number(event.target.value))}><option value="1">1</option><option value="2">2</option></select></label>
          <label className="graph-checkbox"><input type="checkbox" checked={includeTags} onChange={(event) => { onTagsChange(event.target.checked); setFilters((current) => ({ ...current, tags: event.target.checked })) }} /> {t('graph.showTags')}</label>
        </div>
        <div className="graph-explorer-body">
          <div className="graph-canvas-stage"><GraphCanvas graph={graph} world={world} controller={controller} visibleIds={visibleIds} selectedId={selectedId} searchMatches={matches} onSelect={setSelectedId} cameraRevision={cameraRevision} /><GraphLegend />{graph.truncated && <div className="graph-truncated" role="status">{t('graph.truncatedCount', { count: graph.nodes.length })}</div>}</div>
          <GraphNodeDetail graph={graph} selected={selected} onSelect={setSelectedId} />
        </div>
      </div>
    </dialog>,
    document.body,
  )
}

export default function GraphPreview({ graph, jobId = 'current-job', loading, depth, includeTags, onDepthChange, onTagsChange }) {
  const { t } = useI18n()
  const compactGraph = useMemo(() => compactNeighborhood(graph), [graph])
  const compactIds = useMemo(() => new Set(compactGraph.nodes.map((node) => node.id)), [compactGraph.nodes])
  const [selectedId, setSelectedId] = useState(currentNodeId(graph))
  const [open, setOpen] = useState(false)
  const openButtonRef = useRef(null)
  const { controller, world } = usePersistentForceGraph(graph, jobId)
  const selected = graph.nodes.find((node) => node.id === selectedId) || null

  useEffect(() => {
    if (selectedId && !graph.nodes.some((node) => node.id === selectedId)) setSelectedId('')
  }, [graph.nodes, selectedId])

  function close() {
    setOpen(false)
    requestAnimationFrame(() => openButtonRef.current?.focus())
  }

  return (
    <div className="graph-preview-shell" aria-busy={loading}>
      {graph.warnings?.length > 0 && <div className="graph-warning" role="status">{graph.warnings[0]}</div>}
      <GraphCanvas graph={graph} world={world} controller={controller} visibleIds={compactIds} compact selectedId={selectedId} onSelect={setSelectedId} />
      <div className="graph-preview-status"><span>{selected ? `${typeLabel(selected, t)} · ${selected.label}` : t('graph.selectHelp')}</span>{compactGraph.hidden_count > 0 && <small>{t('graph.moreNodes', { count: compactGraph.hidden_count })}</small>}</div>
      <button ref={openButtonRef} className="machine-button secondary full" type="button" onClick={() => setOpen(true)}>{t('graph.open')}</button>
      {open && <GraphDialog graph={graph} world={world} controller={controller} initialSelectedId={selectedId || currentNodeId(graph)} depth={depth} includeTags={includeTags} onDepthChange={onDepthChange} onTagsChange={onTagsChange} onClose={close} />}
    </div>
  )
}
