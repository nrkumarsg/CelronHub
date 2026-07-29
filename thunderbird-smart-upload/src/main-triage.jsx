import React from 'react';
import ReactDOM from 'react-dom/client';
import MailTriagePanel from './components/triage/MailTriagePanel';
import './index.css';

window.addEventListener('error', (e) => {
  const root = document.getElementById('root');
  if (root) {
    root.style.display = 'block';
    root.style.background = '#ffffff';
    root.style.color = '#dc2626';
    root.style.padding = '20px';
    root.innerHTML = '<h3 style="margin-top:0;">Mail Triage Error:</h3><pre style="background:#f1f5f9;padding:12px;border-radius:6px;overflow:auto;font-size:12px;color:#991b1b;">' + (e.error?.stack || e.message || String(e)) + '</pre>';
  }
});

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Mail Triage Extension Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: '#dc2626', backgroundColor: '#ffffff', fontFamily: 'sans-serif' }}>
          <h2>Mail Triage Error</h2>
          <p style={{ color: '#64748b', fontSize: 14 }}>An error occurred while launching the panel:</p>
          <pre style={{ backgroundColor: '#f8fafc', padding: 12, borderRadius: 6, overflow: 'auto', fontSize: 12, color: '#991b1b', border: '1px solid #fca5a5' }}>
            {this.state.error?.stack || this.state.error?.toString() || 'Unknown Error'}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  try {
    ReactDOM.createRoot(rootElement).render(
      <ErrorBoundary>
        <MailTriagePanel />
      </ErrorBoundary>
    );
  } catch (err) {
    rootElement.innerHTML = '<div style="padding:20px;color:red;">Failed to render: ' + err.toString() + '</div>';
  }
}
