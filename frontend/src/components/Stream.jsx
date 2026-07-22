import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Inspector from './Inspector'
import MarkdownRenderer from './MarkdownRenderer'
import WorkbenchShell, { Panel, Pipeline, StatusLamp } from './WorkbenchShell'
import { EMPTY_METADATA, normalizeMetadata, pageAnchor, resolveDocument, splitDocumentByPage, stripPageMarkers } from '../lib/workbench'
import { useI18n } from '../lib/i18n'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const PAGE_STATUS = {
  queued: 'stream.status.queued',
  processing: 'stream.status.processing',
  done: 'stream.status.done',
  error: 'stream.status.error',
}

const PHASE_NOTE = {
  queued: 'stream.note.queued',
  processing: 'stream.note.processing',
  organizing: 'stream.note.organizing',
  ready: 'stream.note.ready',
  exporting: 'stream.note.exporting',
  exported: 'stream.note.exported',
  error: 'stream.note.error',
}

export default function Stream() {
  const { locale, t } = useI18n()
  const { jobId } = useParams()
  const [job, setJob] = useState(null)
  const [health, setHealth] = useState(null)
  const [metadata, setMetadata] = useState(EMPTY_METADATA)
  const [markdown, setMarkdown] = useState('')
  const [activePage, setActivePage] = useState(1)
  const [view, setView] = useState('markdown')
  const [connectionWarning, setConnectionWarning] = useState('')
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const statusRef = useRef('queued')

  function applySnapshot(snapshot) {
    setJob(snapshot)
    statusRef.current = snapshot.status
    if (snapshot.metadata) setMetadata(normalizeMetadata(snapshot.metadata))
    if (snapshot.combined_markdown) setMarkdown(snapshot.combined_markdown)
    if (snapshot.export_result) setExportResult(snapshot.export_result)
    if (snapshot.error) setError(snapshot.error)
  }

  useEffect(() => {
    let cancelled = false
    let events

    function handleEvent(event) {
      setJob((current) => {
        if (!current) return current
        const next = { ...current, pages: current.pages.map((page) => ({ ...page })) }
        if (event.type.startsWith('page.')) {
          const page = next.pages.find((item) => item.number === event.page)
          if (page) {
            if (event.type === 'page.ocr_started') page.status = 'processing'
            if (event.type === 'page.ocr_completed') {
              page.status = 'done'
              page.markdown = event.markdown
              page.error = null
            }
            if (event.type === 'page.ocr_failed') {
              page.status = 'error'
              page.error = event.error
            }
          }
          next.processed_pages = event.processed_pages ?? next.processed_pages
          next.status = 'processing'
        }
        if (event.type === 'document.organizing') next.status = 'organizing'
        if (event.type === 'document.ready') {
          next.status = 'ready'
          next.metadata = event.metadata
          next.combined_markdown = event.markdown
          setMetadata(normalizeMetadata(event.metadata))
          setMarkdown(event.markdown)
        }
        if (event.type === 'job.failed') {
          next.status = 'error'
          next.error = event.error
          setError(event.error)
        }
        if (event.type === 'export.started') next.status = 'exporting'
        if (event.type === 'export.failed') {
          next.status = 'ready'
          setError(event.error)
        }
        if (event.type === 'export.completed') {
          next.status = 'exported'
          next.export_result = event.result
          setExportResult(event.result)
        }
        statusRef.current = next.status
        return next
      })
    }

    async function load() {
      try {
        const response = await fetch(`${API_BASE}/api/jobs/${jobId}`)
        if (!response.ok) throw new Error(t('stream.notFound'))
        const snapshot = await response.json()
        if (!cancelled) applySnapshot(snapshot)
        if (!['exported', 'error'].includes(snapshot.status)) {
          events = new EventSource(`${API_BASE}/api/jobs/${jobId}/events?after=${snapshot.last_event_id || 0}`)
          events.onopen = () => setConnectionWarning('')
          events.onmessage = (message) => handleEvent(JSON.parse(message.data))
          events.onerror = async () => {
            if (['exported', 'error'].includes(statusRef.current)) return events.close()
            setConnectionWarning(t('stream.connectionLost'))
            try {
              const latest = await fetch(`${API_BASE}/api/jobs/${jobId}`).then((result) => result.json())
              if (!cancelled) applySnapshot(latest)
            } catch {
              // EventSource tự thử kết nối lại; snapshot là lớp phục hồi bổ sung.
            }
          }
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      }
    }

    load()
    return () => {
      cancelled = true
      events?.close()
    }
  }, [jobId, t])

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(setHealth)
      .catch(() => setHealth({ offline: true }))
  }, [])

  const ready = Boolean(job && ['ready', 'exporting', 'exported'].includes(job.status))
  const documentText = useMemo(() => ready ? markdown : resolveDocument(job), [job, markdown, ready])
  const visibleDocumentText = useMemo(() => stripPageMarkers(documentText), [documentText])
  const sections = useMemo(() => splitDocumentByPage(documentText, job?.pages), [documentText, job?.pages])

  function selectPage(number) {
    setActivePage(number)
    if (view === 'source') return
    if (view !== 'markdown') setView('markdown')
    requestAnimationFrame(() => document.getElementById(pageAnchor(number))?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  function updateMetadata(field, value) {
    setMetadata((current) => normalizeMetadata({ ...current, [field]: value }))
  }

  async function saveToObsidian() {
    setExporting(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/api/jobs/${jobId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown, metadata }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.detail || t('stream.saveFailed'))
      setExportResult(result)
      statusRef.current = 'exported'
      setJob((current) => ({ ...current, status: 'exported', export_result: result }))
    } catch (saveError) {
      setError(saveError.message)
      setJob((current) => ({ ...current, status: 'ready' }))
    } finally {
      setExporting(false)
    }
  }

  if (!job && !error) return <LoadingScreen />
  if (!job) return <FatalScreen message={error} />

  const selectedPage = job.pages.find((page) => page.number === activePage) || job.pages[0]
  const left = (
    <>
      <Panel code="A1" title={t('upload.source')} note={t('stream.readOnly')}>
        <dl className="job-summary">
          <div><dt>{t('stream.job')}</dt><dd title={job.job_id}>{job.job_id.slice(0, 8)}</dd></div>
          <div><dt>{t('stream.page')}</dt><dd>{job.total_pages}</dd></div>
          <div><dt>{t('stream.created')}</dt><dd>{new Date(job.created_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</dd></div>
        </dl>
        <Link className="machine-button secondary full" to="/">{t('stream.newDocument')}</Link>
      </Panel>

      <Panel code="A2" title={t('upload.queue')} note={`${job.processed_pages}/${job.total_pages}`} className="queue-machine-panel">
        <ol className="job-page-queue">
          {job.pages.map((page) => (
            <li key={page.number}>
              <button className={page.number === activePage ? 'job-page-row active' : 'job-page-row'} type="button" onClick={() => selectPage(page.number)} aria-current={page.number === activePage ? 'page' : undefined}>
                <span className="folio">{String(page.number).padStart(2, '0')}</span>
                <img src={`${API_BASE}/api/jobs/${jobId}/pages/${page.number}/image`} alt="" />
                <span className="queue-copy"><strong>{page.filename}</strong><small>{t(PAGE_STATUS[page.status])}</small></span>
                <StatusLamp tone={page.status === 'done' ? 'success' : page.status === 'error' ? 'danger' : page.status === 'processing' ? 'active' : 'idle'}>
                  <span className="visually-hidden">{t(PAGE_STATUS[page.status])}</span>
                </StatusLamp>
              </button>
              {page.error && <p className="page-error-copy">{page.error}</p>}
            </li>
          ))}
        </ol>
      </Panel>

      <Panel code="A3" title="Pipeline" note={t('common.fiveSteps')}><Pipeline phase={job.status} /></Panel>
    </>
  )

  const center = (
    <Panel code="M1" title={t('upload.liveOcr')} note={t(PHASE_NOTE[job.status])} className="console-panel">
      {(connectionWarning || error) && (
        <div className={`machine-notice ${error ? 'danger' : 'warning'} console-notice`} role={error ? 'alert' : 'status'}>
          <strong>{error ? t('stream.needsCheck') : t('stream.resyncing')}</strong><span>{error || connectionWarning}</span>
        </div>
      )}
      <div className="console-toolbar" role="toolbar" aria-label={t('upload.viewMode')}>
        <button className={view === 'markdown' ? 'active' : ''} type="button" onClick={() => setView('markdown')}>{t('common.markdown')}</button>
        <button className={view === 'source' ? 'active' : ''} type="button" onClick={() => setView('source')}>{t('common.sourceImage')}</button>
        <button className={view === 'preview' ? 'active' : ''} type="button" onClick={() => setView('preview')}>{t('common.preview')}</button>
        <button className={view === 'edit' ? 'active' : ''} type="button" onClick={() => setView('edit')} disabled={!ready}>{t('common.edit')}</button>
        <button className="inspector-trigger" type="button" onClick={() => setInspectorOpen(true)}>{t('common.metadata')}</button>
      </div>
      <div className={`console-viewport view-${view}`}>
        {view === 'markdown' && <RawMarkdownDocument sections={sections} activePage={activePage} processing={job.status === 'processing'} />}
        {view === 'source' && (
          <figure className="source-view">
            <img src={`${API_BASE}/api/jobs/${jobId}/pages/${selectedPage.number}/image`} alt={t('stream.sourceAlt', { page: selectedPage.number, name: selectedPage.filename })} />
            <figcaption>{t('stream.pageCaption', { page: selectedPage.number, name: selectedPage.filename })}</figcaption>
          </figure>
        )}
        {view === 'preview' && <div className="preview-paper"><MarkdownRenderer markdown={visibleDocumentText} /></div>}
        {view === 'edit' && <textarea className="markdown-editor" value={stripPageMarkers(markdown)} onChange={(event) => setMarkdown(event.target.value)} aria-label={t('stream.editAria')} spellCheck="false" />}
      </div>
    </Panel>
  )

  return (
    <WorkbenchShell
      health={health}
      phase={job.status}
      processedPages={job.processed_pages}
      totalPages={job.total_pages}
      left={left}
      center={center}
      right={<Inspector jobId={jobId} markdown={markdown} metadata={metadata} ready={ready} onChange={updateMetadata} onSave={saveToObsidian} saving={exporting} exportResult={exportResult} />}
      inspectorOpen={inspectorOpen}
      onInspectorClose={() => setInspectorOpen(false)}
    />
  )
}

function RawMarkdownDocument({ sections, activePage, processing }) {
  const { t } = useI18n()
  let lineNumber = 0
  return (
    <div className="raw-console" aria-label={t('stream.rawAria')}>
      {sections.map((section) => (
        <section className={`raw-page-section ${section.number === activePage ? 'active' : ''} ${processing ? 'scanning' : ''}`} id={pageAnchor(section.number)} key={section.number} tabIndex="-1">
          <div className="raw-page-label">PAGE {String(section.number).padStart(2, '0')}</div>
          {(section.text || ' ').split('\n').map((line) => {
            lineNumber += 1
            return <div className="code-line" key={`${section.number}-${lineNumber}`}><span aria-hidden="true">{String(lineNumber).padStart(3, '0')}</span><code>{line || ' '}</code></div>
          })}
        </section>
      ))}
    </div>
  )
}

function LoadingScreen() {
  const { t } = useI18n()
  return <main className="center-screen"><StatusLamp tone="active">{t('stream.opening')}</StatusLamp><p>{t('stream.loading')}</p></main>
}

function FatalScreen({ message }) {
  const { t } = useI18n()
  return <main className="center-screen"><h1>{t('stream.fatalTitle')}</h1><p>{message}</p><Link className="machine-button primary" to="/">{t('stream.backUpload')}</Link></main>
}
