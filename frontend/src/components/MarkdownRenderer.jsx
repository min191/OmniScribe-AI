import { Component } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { stripPageMarkers } from '../lib/workbench'

class MarkdownBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return <pre className="markdown-fallback">{this.props.markdown}</pre>
    }
    return this.props.children
  }
}

export default function MarkdownRenderer({ markdown }) {
  const visibleMarkdown = stripPageMarkers(markdown)
  return (
    <MarkdownBoundary markdown={visibleMarkdown}>
      <article className="markdown-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
          components={{
            a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
            table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
          }}
        >
          {visibleMarkdown}
        </ReactMarkdown>
      </article>
    </MarkdownBoundary>
  )
}
