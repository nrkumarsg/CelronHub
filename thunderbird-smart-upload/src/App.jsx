import React, { useState } from 'react';
import SmartUploadPanel from './components/upload/SmartUploadPanel';

export default function App() {
  const [statusMsg, setStatusMsg] = useState('');
  const [isError, setIsError] = useState(false);

  // Handle file selection / upload with dual attachment mode ('attachment' or 'body')
  const handleSelectFile = async (selectedFile, mode = 'attachment') => {
    setIsError(false);
    setStatusMsg(mode === 'body' ? 'Inserting file content into email body...' : 'Attaching file to Thunderbird email draft...');

    try {
      // Check if browser/messenger compose API is available (Thunderbird context)
      const tbMessenger = typeof messenger !== 'undefined' ? messenger : (typeof browser !== 'undefined' ? browser : null);

      if (tbMessenger && tbMessenger.tabs && tbMessenger.compose) {
        // This tool now runs in its own detached window (see background.js),
        // so "currentWindow" here is the tool's window, not the compose
        // window — the compose tab id is passed in via the URL instead.
        const composeTabIdParam = new URLSearchParams(window.location.search).get('composeTabId');
        let activeTab = composeTabIdParam ? { id: Number(composeTabIdParam) } : null;

        if (!activeTab) {
          const tabs = await tbMessenger.tabs.query({ active: true, currentWindow: true });
          activeTab = tabs && tabs.length > 0 ? tabs[0] : null;
        }

        if (activeTab && activeTab.id) {
          if (mode === 'body') {
            // Insert directly into Email Body Content
            const details = await tbMessenger.compose.getComposeDetails(activeTab.id);
            let insertedHtml = '';

            if (selectedFile.type && selectedFile.type.startsWith('image/')) {
              // Convert image to Data URL for inline body insertion
              const reader = new FileReader();
              const dataUrl = await new Promise((resolve) => {
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(selectedFile);
              });
              insertedHtml = `<div style="margin: 12px 0;"><img src="${dataUrl}" alt="${selectedFile.name}" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" /></div><br/>`;
            } else {
              insertedHtml = `<div style="padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin: 10px 0; font-family: sans-serif;">📎 <strong>File Attachment:</strong> ${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)</div><br/>`;
            }

            const currentBody = details.body || '';
            const updatedBody = currentBody + insertedHtml;

            await tbMessenger.compose.setComposeDetails(activeTab.id, { body: updatedBody });
            setStatusMsg(`Successfully inserted "${selectedFile.name}" into email content!`);
          } else {
            // Attach as standard email file attachment
            await tbMessenger.compose.addAttachment(activeTab.id, {
              file: selectedFile
            });
            setStatusMsg(`Successfully attached "${selectedFile.name}" to email attachments!`);
          }

          setTimeout(() => {
            window.close();
          }, 1200);
          return;
        }
      }

      // Standalone browser preview fallback
      console.log('[Smart Upload Thunderbird] Standalone preview file selected:', selectedFile, mode);
      setStatusMsg(`[Preview Mode] "${selectedFile.name || 'Selected File'}" processed (${mode}).`);
    } catch (err) {
      console.error('[Smart Upload Thunderbird] Attachment error:', err);
      setIsError(true);
      setStatusMsg(`Attachment Error: ${err.message || err}`);
    }
  };

  return (
    <div style={{ width: '820px', height: '600px', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#ffffff', color: '#0f172a', margin: 0, padding: 0 }}>
      {/* Top Banner Status (if any) */}
      {statusMsg && (
        <div style={{ padding: '6px 12px', fontSize: '0.75rem', textAlign: 'center', fontWeight: 600, backgroundColor: isError ? '#dc2626' : '#4f46e5', color: '#ffffff' }}>
          {statusMsg}
        </div>
      )}

      {/* Embedded Smart Upload Panel */}
      <div style={{ flex: 1, position: 'relative', width: '820px', height: '600px', overflow: 'hidden' }}>
        <SmartUploadPanel
          isOpen={true}
          onClose={() => window.close()}
          onSelect={handleSelectFile}
          documentType="thunderbird"
          accept="*"
        />
      </div>
    </div>
  );
}
