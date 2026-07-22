import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildKnowledgeGraph,
  buildLiveDocument,
  limitPrimaryTags,
  resolveDocument,
  stripPageMarkers,
  splitDocumentByPage,
} from './workbench.js'

test('ghép Markdown theo thứ tự trang khi OCR hoàn tất lệch thứ tự', () => {
  const markdown = buildLiveDocument([
    { number: 2, status: 'done', markdown: 'Trang hai' },
    { number: 1, status: 'done', markdown: 'Trang một' },
  ])
  assert.ok(markdown.indexOf('Trang một') < markdown.indexOf('Trang hai'))
})

test('giữ placeholder, lỗi từng trang và thay bằng bản final khi ready', () => {
  const job = {
    status: 'processing',
    pages: [
      { number: 1, status: 'done', markdown: '# Đã xong' },
      { number: 2, status: 'processing' },
      { number: 3, status: 'error', error: 'Ảnh bị mờ' },
    ],
    combined_markdown: '# Bản cuối',
  }
  const live = resolveDocument(job)
  assert.match(live, /Trang 2 đang được/)
  assert.doesNotMatch(live, />\s*\[!PROCESSING\]/)
  assert.match(live, /Ảnh bị mờ/)
  assert.equal(resolveDocument({ ...job, status: 'ready' }), '# Bản cuối')
})

test('tách bản final thành section để deep link tới từng trang', () => {
  const sections = splitDocumentByPage('<!-- page:1 -->\n\nMột\n\n---\n\n<!-- page:2 -->\n\nHai')
  assert.deepEqual(sections, [{ number: 1, text: 'Một' }, { number: 2, text: 'Hai' }])
})

test('ẩn marker phân trang nội bộ khỏi Markdown hiển thị cho người dùng', () => {
  const markdown = '<!-- page:1 -->\n\nMột\n\n---\n\n<!-- page:2 -->\n\nHai'
  const visible = stripPageMarkers(markdown)
  assert.doesNotMatch(visible, /<!--\s*page:/)
  assert.equal(visible, 'Một\n\n---\n\nHai')
  assert.equal(stripPageMarkers('<!-- page:1 -->\n\n    indented code'), '    indented code')
})

test('graph loại trùng không phân biệt hoa thường và có layout deterministic', () => {
  const metadata = {
    title: 'Cơ học',
    category: 'Học tập',
    topics: ['Vật lý', 'vật LÝ', 'Năng lượng'],
    tags: ['ôn tập', 'ÔN TẬP', 'Vật lý'],
  }
  const first = buildKnowledgeGraph(metadata)
  const second = buildKnowledgeGraph(metadata)
  assert.deepEqual(first, second)
  assert.deepEqual(first.topics, ['Năng lượng', 'Vật lý'])
  assert.deepEqual(first.tags, ['ôn tập'])
  assert.equal(first.nodes[0].type, 'category')
  assert.equal(first.nodes[0].label, 'Học tập')
  assert.equal(first.edges.length, 4)
  assert.ok(first.edges.every((edge) => edge.from === 'category'))
})

test('chỉ giữ ba tags chủ đạo theo thứ tự đầu vào', () => {
  assert.deepEqual(limitPrimaryTags(['OCR', 'ocr', 'ghi-chú', 'học-tập', 'dư-thừa']), ['OCR', 'ghi-chú', 'học-tập'])
})
