import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Global error listener to capture any unhandled JS errors in Thunderbird
window.addEventListener('error', (e) => {
  const root = document.getElementById('root');
  if (root) {
    root.style.display = 'block';
    root.style.background = '#ffffff';
    root.style.color = '#dc2626';
    root.style.padding = '20px';
    root.innerHTML = '<h3 style="margin-top:0;">Smart Upload Extension Error:</h3><pre style="background:#f1f5f9;padding:12px;border-radius:6px;overflow:auto;font-size:12px;color:#991b1b;">' + (e.error?.stack || e.message || String(e)) + '</pre>';
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
    console.error("Smart Upload Thunderbird Extension Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: '#dc2626', backgroundColor: '#ffffff', fontFamily: 'sans-serif' }}>
          <h2>Smart Upload Tool Error</h2>
          <p style={{ color: '#64748b', fontSize: 14 }}>An error occurred while launching the tool:</p>
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
        <App />
      </ErrorBoundary>
    );
  } catch (err) {
    rootElement.innerHTML = '<div style="padding:20px;color:red;">Failed to render: ' + err.toString() + '</div>';
  }
}
