import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

window.onerror = (msg, src, line, col, err) => {
  const el = document.getElementById('root')
  if (el) el.innerHTML = '<pre style="color:#ff6b6b;padding:16px;font-size:12px;white-space:pre-wrap;word-break:break-all;">' + msg + '\n' + (err && err.stack || '') + '</pre>'
}
window.onunhandledrejection = (e) => {
  const el = document.getElementById('root')
  if (el) el.innerHTML = '<pre style="color:#ff6b6b;padding:16px;font-size:12px;white-space:pre-wrap;word-break:break-all;">Unhandled: ' + (e.reason && e.reason.stack || e.reason) + '</pre>'
}

import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error: error } }
  render() {
    if (this.state.error) {
      return <pre style={{ color: '#ff6b6b', padding: 16, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {this.state.error.stack || String(this.state.error)}
      </pre>
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
