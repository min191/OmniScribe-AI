export const PAGE_SEPARATOR = '\n\n---\n\n'

export const EMPTY_METADATA = {
  title: '',
  summary: '',
  document_type: 'notes',
  category: '',
  tags: [],
  topics: [],
}

export function pageAnchor(number) {
  return `ocr-page-${number}`
}

export function stripPageMarkers(markdown = '') {
  const visible = markdown.replace(
    /^[ \t]*<!--\s*page:\d+\s*-->[ \t]*(?:\r?\n(?:[ \t]*\r?\n)*)?/gim,
    '',
  )
  return visible
    .replace(/^(?:[ \t]*\r?\n)+/, '')
    .replace(/(?:\r?\n[ \t]*)+$/, '')
}

export function pageDocumentSection(page) {
  if (page.status === 'done' && page.markdown?.trim()) {
    return page.markdown.trim()
  }
  if (page.status === 'error') {
    return `> [!ERROR] Trang ${page.number} không thể OCR\n> ${page.error || 'Không có thông tin lỗi.'}`
  }
  if (page.status === 'processing') {
    return `Trang ${page.number} đang được GLM OCR xử lý…`
  }
  return `> [!WAITING] Trang ${page.number} đang chờ xử lý.`
}

export function buildLiveDocument(pages = []) {
  return [...pages]
    .sort((a, b) => a.number - b.number)
    .map((page) => `<!-- page:${page.number} -->\n\n${pageDocumentSection(page)}`)
    .join(PAGE_SEPARATOR)
}

export function resolveDocument(job) {
  if (!job) return ''
  if (['ready', 'exporting', 'exported'].includes(job.status) && job.combined_markdown) {
    return job.combined_markdown
  }
  return buildLiveDocument(job.pages)
}

export function splitDocumentByPage(markdown = '', pages = []) {
  const matches = [...markdown.matchAll(/<!--\s*page:(\d+)\s*-->/g)]
  if (!matches.length) {
    return [{ number: pages[0]?.number || 1, text: markdown }]
  }
  return matches.map((match, index) => {
    const start = match.index + match[0].length
    const end = matches[index + 1]?.index ?? markdown.length
    const text = markdown.slice(start, end).replace(/^\s+|\s+$/g, '').replace(/\n\n---\s*$/, '').trim()
    return { number: Number(match[1]), text }
  })
}

function normalizeItems(items = []) {
  const seen = new Set()
  return items
    .map((item) => String(item).trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLocaleLowerCase('vi')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }))
}

export function limitPrimaryTags(items = []) {
  const seen = new Set()
  const tags = []
  for (const value of items) {
    const item = String(value).trim().replace(/^#+/, '')
    const key = item.toLocaleLowerCase('vi')
    if (item && !seen.has(key)) {
      seen.add(key)
      tags.push(item)
    }
    if (tags.length === 3) break
  }
  return tags
}

export function normalizeMetadata(metadata = {}) {
  return {
    ...EMPTY_METADATA,
    ...metadata,
    tags: limitPrimaryTags(metadata.tags || []),
  }
}

function ringPosition(index, count, radius, centerX, centerY, offset = -Math.PI / 2) {
  const angle = offset + (Math.PI * 2 * index) / Math.max(count, 1)
  return {
    x: Number((centerX + Math.cos(angle) * radius).toFixed(3)),
    y: Number((centerY + Math.sin(angle) * radius).toFixed(3)),
  }
}

export function buildKnowledgeGraph(metadata = {}) {
  const category = String(metadata.category || '').trim()
  const title = String(metadata.title || '').trim()
  const topics = normalizeItems(metadata.topics)
  const topicKeys = new Set(topics.map((item) => item.toLocaleLowerCase('vi')))
  const tags = normalizeItems(limitPrimaryTags(metadata.tags)).filter((item) => !topicKeys.has(item.toLocaleLowerCase('vi')))
  if (!category && !title && !topics.length && !tags.length) return { nodes: [], edges: [], topics, tags }

  const center = { id: 'category', type: 'category', label: category || 'Chưa phân loại', x: 160, y: 105 }
  const primaryItems = [
    ...(title ? [{ id: 'title', type: 'title', label: title }] : []),
    ...topics.map((label, index) => ({ id: `topic-${index}`, type: 'topic', label })),
  ]
  const primaryNodes = primaryItems.map((node, index) => ({
    ...node,
    ...ringPosition(index, primaryItems.length, 58, center.x, center.y, -Math.PI / 2),
  }))
  const tagNodes = tags.map((label, index) => ({
    id: `tag-${index}`,
    type: 'tag',
    label,
    ...ringPosition(index, tags.length, 82, center.x, center.y, 0),
  }))
  const nodes = [center, ...primaryNodes, ...tagNodes]
  const edges = nodes.slice(1).map((node) => ({ from: center.id, to: node.id }))
  return { nodes, edges, category: center.label, title, topics, tags }
}
