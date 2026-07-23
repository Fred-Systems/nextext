import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import React from 'react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error: error } }
  render() {
    if (this.state.error) {
      const msg = this.state.error.stack || String(this.state.error);
      /* Write to the external error div so it's always visible */
      const errEl = document.getElementById('nx-boot-error');
      if (errEl) { errEl.style.display = 'block'; errEl.style.pointerEvents = 'auto'; errEl.innerHTML = '<pre style="color:#ff6b6b;padding:16px;font-size:12px;white-space:pre-wrap;word-break:break-all;background:#0B141A;min-height:100vh;">' + msg + '</pre>'; }
      return <pre style={{ color: '#ff6b6b', padding: 16, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {msg}
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
