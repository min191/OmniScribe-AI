import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Inspector from './Inspector'
import WorkbenchShell, { Panel, Pipeline, StatusLamp } from './WorkbenchShell'
import { EMPTY_METADATA } from '../lib/workbench'
import { useI18n } from '../lib/i18n'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const MAX_FILES = 8
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png'])

function isAcceptedImage(file) {
  return ACCEPTED_TYPES.has(file.type) || /\.(jpe?g|png)$/i.test(file.name)
}

function makeFileItem(file) {
  return {
    id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
    file,
    preview: URL.createObjectURL(file),
  }
}

export default function Upload() {
  const { t } = useI18n()
  const [items, setItems] = useState([])
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const inputRef = useRef(null)
  const itemsRef = useRef([])
  const navigate = useNavigate()

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(setHealth)
      .catch(() => setHealth({ offline: true }))
  }, [])

  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), [])

  function addFiles(fileList) {
    const incoming = Array.from(fileList)
    const invalid = incoming.find((file) => !isAcceptedImage(file))
    if (invalid) return setError(t('upload.invalidImage', { name: invalid.name }))
    const tooLarge = incoming.find((file) => file.size > MAX_BYTES)
    if (tooLarge) return setError(t('upload.tooLarge', { name: tooLarge.name }))
    if (items.length + incoming.length > MAX_FILES) return setError(t('upload.tooMany', { max: MAX_FILES }))
    setItems((current) => [...current, ...incoming.map(makeFileItem)])
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function removeItem(id) {
    setItems((current) => {
      const removed = current.find((item) => item.id === id)
      if (removed) URL.revokeObjectURL(removed.preview)
      return current.filter((item) => item.id !== id)
    })
  }

  function moveItem(id, direction) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
      return next
    })
  }

  function dropOn(targetId) {
    if (!draggingId || draggingId === targetId) return
    setItems((current) => {
      const sourceIndex = current.findIndex((item) => item.id === draggingId)
      const targetIndex = current.findIndex((item) => item.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const next = [...current]
      const [moved] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
    setDraggingId(null)
  }

  async function startDigitizing() {
    if (!items.length || uploading) return
    setUploading(true)
    setError('')
    const formData = new FormData()
    items.forEach(({ file }) => formData.append('files', file, file.name))
    try {
      const response = await fetch(`${API_BASE}/api/jobs`, { method: 'POST', body: formData })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.detail || t('upload.startFailed'))
      navigate(`/jobs/${data.job_id}`)
    } catch (requestError) {
      setError(requestError.message)
      setUploading(false)
    }
  }

  const left = (
    <>
      <Panel code="A1" title={t('upload.source')} note={t('upload.imageCount', { count: items.length, max: MAX_FILES })}>
        {health?.demo_mode && <div className="machine-notice warning" role="status"><strong>{t('shell.demoMode')}</strong><span>{t('upload.demoHelp')}</span></div>}
        {health?.offline && <div className="machine-notice danger" role="alert"><strong>{t('shell.backendOffline')}</strong><span>{t('upload.offlineHelp')}</span></div>}
        <div
          className="compact-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files) }}
        >
          <input ref={inputRef} className="visually-hidden" type="file" multiple accept="image/jpeg,image/png" onChange={(event) => addFiles(event.target.files)} />
          <span className="registration-mark" aria-hidden="true">⌜ + ⌟</span>
          <strong>{items.length ? t('upload.addPages') : t('upload.dropImages')}</strong>
          <small>{t('upload.limits')}</small>
          <button className="machine-button secondary" type="button" onClick={() => inputRef.current?.click()}>{t('upload.choose')}</button>
        </div>
        {error && <div className="machine-notice danger" role="alert"><strong>{t('upload.cannotAdd')}</strong><span>{error}</span></div>}
      </Panel>

      <Panel code="A2" title={t('upload.queue')} note={items.length ? t('upload.reorder') : t('upload.empty')} className="queue-machine-panel">
        {items.length ? (
          <ol className="upload-queue">
            {items.map((item, index) => (
              <li
                className={draggingId === item.id ? 'queue-row dragging' : 'queue-row'}
                draggable
                key={item.id}
                onDragStart={() => setDraggingId(item.id)}
                onDragEnd={() => setDraggingId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropOn(item.id)}
              >
                <span className="folio">{String(index + 1).padStart(2, '0')}</span>
                <img src={item.preview} alt={t('upload.imagePreview', { page: index + 1, name: item.file.name })} />
                <span className="queue-copy" title={item.file.name}><strong>{item.file.name}</strong><small>{(item.file.size / 1024 / 1024).toFixed(1)} MB · {t('upload.waitUpload')}</small></span>
                <span className="queue-actions">
                  <button className="icon-button" type="button" onClick={() => moveItem(item.id, -1)} disabled={index === 0} aria-label={t('upload.moveUp', { name: item.file.name })}>↑</button>
                  <button className="icon-button" type="button" onClick={() => moveItem(item.id, 1)} disabled={index === items.length - 1} aria-label={t('upload.moveDown', { name: item.file.name })}>↓</button>
                  <button className="icon-button danger" type="button" onClick={() => removeItem(item.id)} aria-label={t('upload.remove', { name: item.file.name })}>×</button>
                </span>
              </li>
            ))}
          </ol>
        ) : <div className="queue-empty"><span>00</span><p>{t('upload.queueHelp')}</p></div>}
        <button className="machine-button primary" type="button" onClick={startDigitizing} disabled={!items.length || uploading || health?.offline}>
          {uploading ? t('upload.uploading') : `${t('upload.start')}${items.length ? t('upload.pageSuffix', { count: items.length }) : ''}`}
        </button>
      </Panel>

      <Panel code="A3" title="Pipeline" note={t('common.fiveSteps')}><Pipeline phase="upload" /></Panel>
    </>
  )

  const center = (
    <Panel code="M1" title={t('upload.liveOcr')} note={t('upload.waitingSource')} className="console-panel">
      <div className="console-toolbar" role="toolbar" aria-label={t('upload.viewMode')}>
        <button className="active" type="button">{t('common.markdown')}</button>
        <button type="button" disabled>{t('common.sourceImage')}</button>
        <button type="button" disabled>{t('common.preview')}</button>
        <button type="button" disabled>{t('common.edit')}</button>
        <button className="inspector-trigger" type="button" onClick={() => setInspectorOpen(true)}>{t('common.metadata')}</button>
      </div>
      <div className="raw-console empty-console">
        <div className="console-ruler" aria-hidden="true"><span>001</span><span>002</span><span>003</span><span>004</span></div>
        <div className="console-empty-copy">
          <StatusLamp tone="idle">{t('upload.consoleInactive')}</StatusLamp>
          <h1>{t('upload.markdownAppears')}</h1>
          <p>{t('upload.consoleHelp')}</p>
        </div>
      </div>
    </Panel>
  )

  return (
    <WorkbenchShell
      health={health}
      phase="upload"
      totalPages={items.length}
      left={left}
      center={center}
      right={<Inspector metadata={EMPTY_METADATA} />}
      inspectorOpen={inspectorOpen}
      onInspectorClose={() => setInspectorOpen(false)}
    />
  )
}
