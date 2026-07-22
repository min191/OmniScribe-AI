import { createRoot } from 'react-dom/client'
import GraphPreview from './components/graph/GraphPreview'
import { LanguageProvider } from './lib/i18n'
import './index.css'

const nodes = Array.from({ length: 80 }, (_, index) => ({
  id: `note:${index}`,
  label: index === 0 ? 'Quantum Field Notes' : `Vault concept ${String(index).padStart(2, '0')}`,
  type: index === 0 ? 'document' : index % 13 === 0 ? 'category' : index % 7 === 0 ? 'tag' : index % 5 === 0 ? 'topic' : 'note',
  current: index === 0,
  exists: index % 6 !== 0,
  degree: index === 0 ? 14 : 1 + (index % 8),
  open_uri: index % 9 === 0 ? `obsidian://open?vault=Demo&file=Concept-${index}` : undefined,
}))
const edges = []
for (let index = 1; index < nodes.length; index += 1) {
  edges.push({ id: `edge:${index}`, source: `note:${index < 14 ? 0 : Math.floor((index - 1) / 2)}`, target: `note:${index}`, type: index % 9 === 0 ? 'wikilink' : index % 7 === 0 ? 'tag' : index % 5 === 0 ? 'category' : 'topic' })
}
const graph = { center_id: 'note:13', nodes, edges, truncated: false, warnings: [] }

function Fixture() {
  return (
    <LanguageProvider>
      <main style={{ minHeight: '100dvh', padding: '32px', background: '#d8d3c7' }}>
        <section className="panel graph-panel" style={{ width: 'min(380px, 100%)', margin: '0 auto' }}>
          <header className="panel-header"><div><span className="panel-code">B2</span><h2>Knowledge graph</h2></div><span className="panel-note">Local depth 1</span></header>
          <div className="panel-body"><GraphPreview jobId="visual-80" graph={graph} loading={false} depth={2} includeTags onDepthChange={() => {}} onTagsChange={() => {}} /></div>
        </section>
      </main>
    </LanguageProvider>
  )
}

createRoot(document.getElementById('root')).render(<Fixture />)
