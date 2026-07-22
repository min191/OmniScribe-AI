import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { buildMetadataGraph } from '../lib/graphModel'
import { EMPTY_METADATA, limitPrimaryTags } from '../lib/workbench'
import { useI18n } from '../lib/i18n'
import { Panel } from './WorkbenchShell'

const GraphPreview = lazy(() => import('./graph/GraphPreview'))
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

function listValue(values) {
  return Array.isArray(values) ? values.join(', ') : ''
}

function parseList(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function preference(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : JSON.parse(value)
  } catch {
    return fallback
  }
}

export function KnowledgeGraph({ jobId, markdown, metadata, ready }) {
  const { t } = useI18n()
  const [depth, setDepthState] = useState(() => preference('omniscribe.graph.depth', 1))
  const [includeTags, setIncludeTagsState] = useState(() => preference('omniscribe.graph.tags', true))
  const [graph, setGraph] = useState(() => buildMetadataGraph(ready ? metadata : {}))
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  function setDepth(value) {
    setDepthState(value)
    localStorage.setItem('omniscribe.graph.depth', JSON.stringify(value))
  }

  function setIncludeTags(value) {
    setIncludeTagsState(value)
    localStorage.setItem('omniscribe.graph.tags', JSON.stringify(value))
  }

  useEffect(() => {
    const fallback = buildMetadataGraph(ready ? metadata : {}, includeTags)
    if (!ready || !jobId) {
      setGraph(fallback)
      return undefined
    }
    const controller = new AbortController()
    const currentRequest = ++requestId.current
    const timeout = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`${API_BASE}/api/jobs/${jobId}/graph-preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ markdown, metadata, depth, include_tags: includeTags }),
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.detail || t('graph.readFailed'))
        if (currentRequest === requestId.current) setGraph(result)
      } catch (error) {
        if (error.name !== 'AbortError' && currentRequest === requestId.current) {
          setGraph({ ...fallback, vault_available: false, warnings: [error.message] })
        }
      } finally {
        if (currentRequest === requestId.current) setLoading(false)
      }
    }, 400)
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [depth, includeTags, jobId, markdown, metadata, ready, t])

  if (!graph.nodes.length) {
    return (
      <div className="graph-empty">
        <span aria-hidden="true">◇—◇</span>
        <strong>{t('graph.empty')}</strong>
        <p>{t('graph.emptyHelp')}</p>
      </div>
    )
  }
  return (
    <Suspense fallback={<div className="graph-loading" role="status">{t('graph.loading')}</div>}>
      <GraphPreview
        jobId={jobId}
        graph={graph}
        loading={loading}
        depth={depth}
        includeTags={includeTags}
        onDepthChange={setDepth}
        onTagsChange={setIncludeTags}
      />
    </Suspense>
  )
}

export default function Inspector({
  jobId,
  markdown = '',
  metadata = EMPTY_METADATA,
  ready = false,
  onChange = () => {},
  onSave,
  saving = false,
  exportResult,
}) {
  const { t } = useI18n()
  return (
    <>
      <Panel code="B1" title="Metadata" note={ready ? t('inspector.editable') : t('inspector.waitReady')} className="metadata-panel">
        <fieldset disabled={!ready} className={!ready ? 'metadata-fields is-disabled' : 'metadata-fields'}>
          <legend className="visually-hidden">{t('inspector.documentMetadata')}</legend>
          <label>{t('inspector.title')}<input value={metadata.title} onChange={(event) => onChange('title', event.target.value)} placeholder={t('inspector.noTitle')} /></label>
          <label>{t('inspector.summary')}<textarea rows="3" value={metadata.summary} onChange={(event) => onChange('summary', event.target.value)} placeholder={t('inspector.noSummary')} /></label>
          <div className="field-pair">
            <label>{t('inspector.type')}<input value={metadata.document_type} onChange={(event) => onChange('document_type', event.target.value)} /></label>
            <label>{t('inspector.category')}<input value={metadata.category} onChange={(event) => onChange('category', event.target.value)} placeholder={t('inspector.uncategorized')} /></label>
          </div>
          <label>Tags<input value={listValue(metadata.tags)} onChange={(event) => onChange('tags', limitPrimaryTags(parseList(event.target.value)))} placeholder={t('inspector.tagsPlaceholder')} /><small className="field-hint">{t('inspector.tagsHint')}</small></label>
          <label>{t('inspector.topics')}<input value={listValue(metadata.topics)} onChange={(event) => onChange('topics', parseList(event.target.value))} placeholder={t('inspector.topicsPlaceholder')} /></label>
        </fieldset>
      </Panel>

      <Panel code="B2" title={t('inspector.graphPreview')} note={t('inspector.localGraph')} className="graph-panel">
        <KnowledgeGraph jobId={jobId} markdown={markdown} metadata={metadata} ready={ready} />
      </Panel>

      <Panel code="B3" title="Obsidian" note={exportResult ? t('inspector.saved') : t('inspector.publish')} className="save-panel">
        {exportResult ? (
          <div className="export-result" role="status">
            <span aria-hidden="true">✓</span>
            <div><strong>{t('inspector.savedVault')}</strong><small>{exportResult.note_path}</small></div>
            {exportResult.open_uri && <a className="machine-button primary" href={exportResult.open_uri}>{t('inspector.openObsidian')}</a>}
            {exportResult.demo_vault && <p>{t('inspector.demoVault')}</p>}
          </div>
        ) : (
          <>
            <p className="save-copy">{t('inspector.saveHelp')}</p>
            <button className="machine-button primary" type="button" onClick={onSave} disabled={!ready || saving || !metadata.title.trim()}>
              {saving ? t('inspector.saving') : t('inspector.save')}
            </button>
          </>
        )}
      </Panel>
    </>
  )
}
