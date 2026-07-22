import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

export function Panel({ code, title, note, children, className = '', as: Element = 'section' }) {
  return (
    <Element className={`machine-panel ${className}`.trim()}>
      <header className="panel-bar">
        <span className="panel-code">{code}</span>
        <h2>{title}</h2>
        {note && <span className="panel-note">{note}</span>}
      </header>
      <div className="panel-body">{children}</div>
    </Element>
  )
}

export function StatusLamp({ tone = 'idle', children }) {
  return <span className={`status-lamp ${tone}`}><i aria-hidden="true" />{children}</span>
}

export default function WorkbenchShell({
  health,
  phase = 'upload',
  processedPages = 0,
  totalPages = 0,
  left,
  center,
  right,
  inspectorOpen = false,
  onInspectorClose,
}) {
  const { language, setLanguage, t } = useI18n()
  const backendTone = health?.offline ? 'danger' : health ? (health.demo_mode ? 'warning' : 'success') : 'idle'
  const backendLabel = health?.offline ? t('shell.backendOffline') : health ? (health.demo_mode ? t('shell.demoMode') : t('shell.backendReady')) : t('shell.connecting')
  const progress = totalPages ? Math.round((processedPages / totalPages) * 100) : 0

  return (
    <main className="workbench-shell">
      <header className="machine-header">
        <Link className="machine-wordmark" to="/" aria-label={t('shell.home')}>
          <span className="wordmark-registration" aria-hidden="true">OS</span>
          <span>OMNISCRIBE <b>AI</b></span>
          <small>{t('brand.subtitle')}</small>
        </Link>
        <div className="machine-readouts" aria-label={t('shell.systemStatus')}>
          <StatusLamp tone={backendTone}>{backendLabel}</StatusLamp>
          <span className="header-readout"><small>{t('shell.phase')}</small>{t(`phase.${phase}`)}</span>
          <span className="header-readout"><small>{t('shell.pages')}</small>{processedPages}/{totalPages}</span>
          <span className="header-progress" aria-label={t('shell.progress', { progress })}>
            <i style={{ width: `${progress}%` }} />
            <b>{progress}%</b>
          </span>
          <div className="language-switch" role="group" aria-label={t('language.label')}>
            <button type="button" aria-pressed={language === 'vi'} onClick={() => setLanguage('vi')}>VI</button>
            <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
          </div>
        </div>
      </header>

      <div className="workbench-grid">
        <aside className="workbench-left" aria-label={t('shell.sourceWorkflow')}>{left}</aside>
        <section className="workbench-center" aria-label={t('shell.ocrDocument')}>{center}</section>
        <aside className={`workbench-right ${inspectorOpen ? 'is-open' : ''}`} aria-label={t('shell.metadataGraph')}>
          <button className="drawer-close icon-button" type="button" onClick={onInspectorClose} aria-label={t('shell.closeMetadata')}>×</button>
          {right}
        </aside>
        {inspectorOpen && <button className="drawer-scrim" type="button" onClick={onInspectorClose} aria-label={t('shell.closeMetadata')} />}
      </div>
    </main>
  )
}

export function Pipeline({ phase = 'upload' }) {
  const { t } = useI18n()
  const steps = [
    [t('pipeline.receive'), ['processing', 'organizing', 'ready', 'exporting', 'exported']],
    [t('pipeline.ocr'), ['organizing', 'ready', 'exporting', 'exported']],
    [t('pipeline.organize'), ['ready', 'exporting', 'exported']],
    [t('pipeline.review'), ['exporting', 'exported']],
    [t('pipeline.save'), ['exported']],
  ]
  const activeByPhase = { upload: 0, queued: 0, processing: 1, organizing: 2, ready: 3, exporting: 4, exported: 5, error: -1 }
  const active = activeByPhase[phase] ?? 0
  return (
    <ol className="pipeline-list">
      {steps.map(([label, completePhases], index) => {
        const done = completePhases.includes(phase)
        const current = index === active
        return (
          <li className={done ? 'done' : current ? 'current' : phase === 'error' ? 'failed' : ''} key={label}>
            <span aria-hidden="true">{done ? '✓' : String(index + 1).padStart(2, '0')}</span>
            <div><strong>{label}</strong><small>{done ? t('pipeline.done') : current ? t('pipeline.current') : phase === 'error' ? t('pipeline.interrupted') : t('pipeline.waiting')}</small></div>
          </li>
        )
      })}
    </ol>
  )
}
