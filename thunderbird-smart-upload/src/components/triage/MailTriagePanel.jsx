import React, { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'celronMailTriage';

const TABS = [
  { key: 'todayUnread', label: 'Today & Unread' },
  { key: 'newReceived', label: 'New' },
  { key: 'unanswered', label: 'Unanswered' },
  { key: 'awaitingReply', label: 'Awaiting Reply' },
];

const EMPTY_DATA = { newReceived: [], unanswered: [], awaitingReply: [], todayUnread: [], scannedAt: null, accountsScanned: [] };

function getMessenger() {
  return typeof messenger !== 'undefined' ? messenger : (typeof browser !== 'undefined' ? browser : null);
}

function relativeTime(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function shortAddr(addr) {
  if (!addr) return '';
  const match = addr.match(/^(.*?)<.*>$/);
  return (match ? match[1] : addr).trim().replace(/^"|"$/g, '');
}

export default function MailTriagePanel() {
  const [data, setData] = useState(EMPTY_DATA);
  const [activeTab, setActiveTab] = useState('todayUnread');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [junkBusyKey, setJunkBusyKey] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const loadStored = useCallback(async () => {
    const tb = getMessenger();
    if (!tb || !tb.storage) return null;
    const stored = await tb.storage.local.get(STORAGE_KEY);
    return stored[STORAGE_KEY] || null;
  }, []);

  const runScan = useCallback(async () => {
    const tb = getMessenger();
    if (!tb || typeof CelronMailTriage === 'undefined') {
      setError('Mail scanning API is unavailable in this context.');
      return;
    }
    setScanning(true);
    setError('');
    try {
      const result = await CelronMailTriage.scanAllMailboxes();
      setData(result);
      await tb.storage.local.set({ [STORAGE_KEY]: result });

      const overdueAwaiting = result.awaitingReply.filter((a) => a.overdue).length;
      const actionableCount = result.unanswered.length + overdueAwaiting;
      if (tb.browserAction) {
        await tb.browserAction.setBadgeText({ text: actionableCount > 0 ? String(actionableCount) : '' });
        await tb.browserAction.setBadgeBackgroundColor({ color: '#dc2626' });
      }
    } catch (err) {
      console.error('[MailTriage] scan failed:', err);
      setError(err?.message || 'Scan failed.');
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const stored = await loadStored();
      // Cached scans from before the "Today & Unread" upgrade won't have this
      // field — treat that as stale and force a fresh scan instead of showing
      // an incomplete/empty tab.
      if (stored && Array.isArray(stored.todayUnread)) {
        setData(stored);
      } else {
        runScan();
      }
    })();
  }, [loadStored, runScan]);

  const openMessage = async (item) => {
    const tb = getMessenger();
    if (!tb || !tb.messageDisplay) return;
    try {
      await tb.messageDisplay.open({ messageId: item.id, location: 'tab' });
    } catch (err) {
      console.error('[MailTriage] Failed to open message:', err);
    }
  };

  const removeItemEverywhere = useCallback((persistedData, item) => {
    const next = { ...persistedData };
    Object.keys(next).forEach((key) => {
      if (Array.isArray(next[key])) {
        next[key] = next[key].filter((x) => !(x.id === item.id && x.accountId === item.accountId));
      }
    });
    return next;
  }, []);

  const moveToJunk = useCallback(async (item, evt) => {
    if (evt) evt.stopPropagation();
    const tb = getMessenger();
    if (!tb || !tb.messages) return;

    const itemKey = `${item.accountId}-${item.id}`;
    setJunkBusyKey(itemKey);
    setError('');
    try {
      // Flag as junk so Thunderbird's Bayesian filter learns from it.
      await tb.messages.update(item.id, { junk: true, read: true });

      // Physically move it into the account's Junk folder, if one exists.
      let junkPath = item.junkFolderPath;
      if (!junkPath && tb.accounts) {
        const accounts = await tb.accounts.list(true);
        const account = accounts.find((a) => a.id === item.accountId);
        const junkFolder = account && (account.folders || []).find((f) => f.type === 'junk');
        junkPath = junkFolder ? junkFolder.path : null;
      }
      if (junkPath && tb.messages.move) {
        await tb.messages.move([item.id], { accountId: item.accountId, path: junkPath });
      }

      setData((prev) => {
        const next = removeItemEverywhere(prev, item);
        tb.storage?.local.set({ [STORAGE_KEY]: next });
        return next;
      });
    } catch (err) {
      console.error('[MailTriage] Failed to move message to Junk:', err);
      setError(err?.message || 'Failed to move message to Junk.');
    } finally {
      setJunkBusyKey('');
    }
  }, [removeItemEverywhere]);

  const items = data[activeTab] || [];

  return (
    <div style={{ width: 440, height: 600, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#ffffff', color: '#0f172a', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#1e293b' }}>CEL-RON Mail Triage</h1>
          <button
            onClick={runScan}
            disabled={scanning}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 10px',
              borderRadius: 6,
              border: 'none',
              cursor: scanning ? 'default' : 'pointer',
              backgroundColor: scanning ? '#94a3b8' : '#4f46e5',
              color: '#ffffff',
            }}
          >
            {scanning ? 'Scanning...' : 'Scan All Mailboxes'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#64748b', margin: '6px 0 0' }}>
          {data.scannedAt ? `Last scanned ${relativeTime(data.scannedAt)}` : 'Not scanned yet'}
          {data.accountsScanned?.length ? ` · ${data.accountsScanned.length} mailbox(es)` : ''}
          {data.diagnostics?.length ? (
            <>
              {' · '}
              <span
                onClick={() => setShowDiagnostics((v) => !v)}
                style={{ color: '#4f46e5', cursor: 'pointer', textDecoration: 'underline' }}
              >
                {showDiagnostics ? 'hide' : 'show'} diagnostics
              </span>
            </>
          ) : null}
        </p>
        {error && <p style={{ fontSize: 11, color: '#dc2626', margin: '6px 0 0' }}>{error}</p>}
        {showDiagnostics && data.diagnostics?.length > 0 && (
          <div style={{
            marginTop: 8, padding: 8, background: '#0f172a', color: '#a5f3fc', borderRadius: 6,
            fontSize: 10, fontFamily: 'monospace', maxHeight: 160, overflowY: 'auto', whiteSpace: 'pre-wrap',
          }}>
            {data.diagnostics.map((d, i) => (
              <div key={i} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid #1e293b' }}>
                <strong>{d.accountName}</strong>{'\n'}
                {d.error ? (
                  <span style={{ color: '#fca5a5' }}>error: {d.error}</span>
                ) : (
                  <>
                    inbox: {d.inboxPath || 'NOT FOUND'} (recent {d.inboxFetched ?? '?'} + unread-query {d.unreadQueryFetched ?? '?'} = merged {d.inboxMerged ?? '?'}, unread {d.inboxUnreadFetched ?? '?'}){'\n'}
                    sent: {d.sentPath || 'NOT FOUND'} (fetched {d.sentFetched ?? '?'}){'\n'}
                    folders: {(d.folderNames || []).join(', ')}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: '10px 4px',
              fontSize: 12,
              fontWeight: 600,
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #4f46e5' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === tab.key ? '#4f46e5' : '#64748b',
              cursor: 'pointer',
            }}
          >
            {tab.label} ({(data[tab.key] || []).length})
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {items.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            {scanning ? 'Scanning mailboxes...' : 'Nothing here.'}
          </div>
        )}
        {items.map((item) => {
          const itemKey = `${item.accountId}-${item.id}`;
          const junkBusy = junkBusyKey === itemKey;
          return (
            <div
              key={itemKey}
              onClick={() => openMessage(item)}
              style={{
                padding: '10px 16px',
                borderBottom: '1px solid #f1f5f9',
                cursor: 'pointer',
                backgroundColor: (activeTab === 'newReceived' || activeTab === 'todayUnread') && !item.read ? '#f5f3ff' : '#ffffff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.subject}
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{relativeTime(item.date)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeTab === 'awaitingReply' ? `To: ${shortAddr((item.recipients || [])[0])}` : `From: ${shortAddr(item.author)}`}
                </span>
                <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{item.accountName}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {activeTab === 'awaitingReply' && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      backgroundColor: item.overdue ? '#fee2e2' : '#fef9c3',
                      color: item.overdue ? '#b91c1c' : '#854d0e',
                    }}>
                      waiting {item.daysWaiting}d{item.overdue ? ' · overdue' : ''}
                    </span>
                  )}
                  {activeTab === 'todayUnread' && item.isToday && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, backgroundColor: '#dbeafe', color: '#1d4ed8' }}>
                      today
                    </span>
                  )}
                  {activeTab === 'todayUnread' && item.isUnread && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, backgroundColor: '#f5f3ff', color: '#6d28d9' }}>
                      unread
                    </span>
                  )}
                </div>

                {(activeTab === 'todayUnread' || activeTab === 'newReceived' || activeTab === 'unanswered') && (
                  <button
                    onClick={(e) => moveToJunk(item, e)}
                    disabled={junkBusy}
                    title="Mark as Junk and move to the Junk folder"
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 5,
                      border: '1px solid #fca5a5',
                      backgroundColor: junkBusy ? '#fee2e2' : '#fff1f2',
                      color: '#b91c1c',
                      cursor: junkBusy ? 'default' : 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {junkBusy ? 'Moving…' : '🗑 Junk'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
