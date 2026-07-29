// Auto-opens the Smart Upload Tool popup whenever a new compose window appears.
messenger.windows.onCreated.addListener(async (win) => {
  if (win.type !== 'messageCompose') return;
  try {
    await messenger.composeAction.openPopup({ windowId: win.id });
  } catch (err) {
    console.error('[SmartUpload] Auto-open failed:', err);
  }
});

// --- CEL-RON Mail Triage: auto-scan all mailboxes on startup + periodically ---
const TRIAGE_ALARM_NAME = 'celron-mail-triage-scan';
const TRIAGE_SCAN_INTERVAL_MINUTES = 20;
const TRIAGE_STORAGE_KEY = 'celronMailTriage';

async function runMailTriageScan() {
  try {
    const stored = await messenger.storage.local.get(TRIAGE_STORAGE_KEY);
    const prevNewCount = (stored[TRIAGE_STORAGE_KEY] && stored[TRIAGE_STORAGE_KEY].newReceived.length) || 0;

    const result = await CelronMailTriage.scanAllMailboxes();
    await messenger.storage.local.set({ [TRIAGE_STORAGE_KEY]: result });

    const overdueAwaiting = result.awaitingReply.filter((a) => a.overdue).length;
    const actionableCount = result.unanswered.length + overdueAwaiting;
    await messenger.browserAction.setBadgeText({ text: actionableCount > 0 ? String(actionableCount) : '' });
    await messenger.browserAction.setBadgeBackgroundColor({ color: '#dc2626' });

    if (result.newReceived.length > prevNewCount && messenger.notifications) {
      try {
        await messenger.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'CEL-RON Mail Triage',
          message: `${result.newReceived.length} unread email(s) across your mailboxes.`,
        });
      } catch (notifyErr) {
        // notifications API may be unavailable on some platforms/builds
      }
    }
  } catch (err) {
    console.error('[MailTriage] scan failed:', err);
  }
}

messenger.runtime.onStartup.addListener(runMailTriageScan);
messenger.runtime.onInstalled.addListener(runMailTriageScan);

if (messenger.alarms) {
  messenger.alarms.create(TRIAGE_ALARM_NAME, { periodInMinutes: TRIAGE_SCAN_INTERVAL_MINUTES, delayInMinutes: 1 });
  messenger.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === TRIAGE_ALARM_NAME) runMailTriageScan();
  });
}
