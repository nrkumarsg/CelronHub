// CEL-RON Mail Triage engine — plain script (no bundler) so it can be loaded
// both by the background page and by the triage popup via a classic <script> tag.
//
// Heuristic classification, no AI/network calls:
//   - New Received:  unread inbox messages from the last `newReceivedDays`.
//   - Unanswered:    inbox messages with no outgoing message (in any Sent
//                     folder) that references their Message-ID.
//   - Awaiting Reply: sent messages with no inbound message referencing
//                     their Message-ID — i.e. nobody has replied yet.
//
// Thread linkage is derived from the standard "In-Reply-To" / "References"
// headers, read via messenger.messages.getFull(). Scanning is bounded
// (lookbackDays / maxMessagesPerFolder) to keep it fast on large mailboxes —
// tune the constants below if your accounts are much larger or smaller.
(function (global) {
  const IGNORE_SENDER_REGEX = /(no[-_.]?reply|donotreply|do-not-reply|notifications?@|mailer-daemon|postmaster@|bounces?@)/i;

  const DEFAULT_OPTIONS = {
    lookbackDays: 14,             // how far back to consider messages for Unanswered/Awaiting Reply
    newReceivedDays: 3,           // how far back to consider messages for New Received
    awaitingReplyThresholdDays: 2, // days waiting before an "awaiting reply" item is flagged overdue
    maxMessagesPerFolder: 120,    // cap per account/folder to keep scans fast
  };

  function normalizeId(id) {
    if (!id) return '';
    return String(id).replace(/[<>]/g, '').trim();
  }

  function extractIdsFromHeaderValue(value) {
    if (!value) return [];
    const str = Array.isArray(value) ? value.join(' ') : String(value);
    const matches = str.match(/<[^>]+>/g) || [];
    return matches.map(normalizeId);
  }

  function isIgnoredAddress(addr) {
    return !!addr && IGNORE_SENDER_REGEX.test(addr);
  }

  // Newer Thunderbird versions report special folders via `specialUse`
  // (an array, e.g. ['inbox']) and may leave the older singular `type`
  // field unset. Some third-party/IMAP folders also just never populate
  // either — fall back to matching the folder name.
  function isFolderOfType(folder, type) {
    if (!folder) return false;
    if (folder.type === type) return true;
    if (Array.isArray(folder.specialUse) && folder.specialUse.includes(type)) return true;
    if (type === 'inbox' && /^inbox$/i.test(folder.name || '')) return true;
    if (type === 'sent' && /^sent/i.test(folder.name || '')) return true;
    if (type === 'junk' && /^(junk|spam)/i.test(folder.name || '')) return true;
    return false;
  }

  function findFolderOfType(folders, type) {
    return (folders || []).find((f) => isFolderOfType(f, type));
  }

  // messenger.messages.list() with no options returns messages in an
  // UNSPECIFIED default order (often folder/UID order, not date order).
  // On a long-lived IMAP inbox that's typically oldest-first, so capping at
  // maxItems without an explicit sort silently grabs the oldest messages —
  // missing all recent/unread mail entirely. Always request newest-first.
  async function listRecentMessages(folder, maxItems) {
    const results = [];
    try {
      let page = await messenger.messages.list(folder, { sortType: 'date', sortOrder: 'descending' });
      results.push(...page.messages);
      let guard = 0;
      while (page.id && results.length < maxItems && guard < 8) {
        page = await messenger.messages.continueList(page.id);
        results.push(...page.messages);
        guard++;
      }
    } catch (err) {
      // Older Thunderbird builds may not support the sort options — retry
      // once without them rather than losing the whole folder's messages.
      try {
        let page = await messenger.messages.list(folder);
        results.push(...page.messages);
        let guard = 0;
        while (page.id && results.length < maxItems && guard < 8) {
          page = await messenger.messages.continueList(page.id);
          results.push(...page.messages);
          guard++;
        }
      } catch (err2) {
        console.error('[MailTriage] listRecentMessages failed for folder', folder && folder.path, err2);
      }
    }
    results.sort((a, b) => new Date(b.date) - new Date(a.date));
    return results.slice(0, maxItems);
  }

  // Directly queries for unread messages so they're never missed just
  // because they fall outside the most-recent-N window used elsewhere —
  // e.g. an old unread newsletter sitting far down a huge inbox.
  async function listUnreadMessages(folder, maxItems) {
    const results = [];
    try {
      let page = await messenger.messages.query({ folder, unread: true });
      results.push(...page.messages);
      let guard = 0;
      while (page.id && results.length < maxItems && guard < 8) {
        page = await messenger.messages.continueList(page.id);
        results.push(...page.messages);
        guard++;
      }
    } catch (err) {
      console.error('[MailTriage] listUnreadMessages failed for folder', folder && folder.path, err);
    }
    return results.slice(0, maxItems);
  }

  async function getMessageIdLinks(message) {
    try {
      const full = await messenger.messages.getFull(message.id);
      const headers = (full && full.headers) || {};
      const inReplyTo = extractIdsFromHeaderValue(headers['in-reply-to']);
      const references = extractIdsFromHeaderValue(headers['references']);
      return [...new Set([...inReplyTo, ...references])];
    } catch (err) {
      return [];
    }
  }

  function toItem(m, account, kind) {
    return {
      id: m.id,
      accountId: account.id,
      accountName: account.name,
      subject: m.subject || '(no subject)',
      author: m.author,
      recipients: m.recipients,
      date: m.date instanceof Date ? m.date.toISOString() : m.date,
      read: m.read,
      kind,
      folder: m.folder && m.folder.path,
    };
  }

  async function scanAccount(account, options) {
    const inboxFolder = findFolderOfType(account.folders, 'inbox');
    const sentFolder = findFolderOfType(account.folders, 'sent');
    const junkFolder = findFolderOfType(account.folders, 'junk');

    const diagnostics = {
      accountName: account.name,
      folderNames: (account.folders || []).map((f) => `${f.name}[${f.type || (f.specialUse || []).join(',') || '?'}]`),
      inboxPath: inboxFolder ? inboxFolder.path : null,
      sentPath: sentFolder ? sentFolder.path : null,
    };

    const now = Date.now();
    const lookbackCutoff = now - options.lookbackDays * 86400000;
    const newCutoff = now - options.newReceivedDays * 86400000;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCutoff = todayStart.getTime();

    const recentMessages = inboxFolder ? await listRecentMessages(inboxFolder, options.maxMessagesPerFolder) : [];
    const unreadMessages = inboxFolder ? await listUnreadMessages(inboxFolder, options.maxMessagesPerFolder) : [];
    const sentMessages = sentFolder ? await listRecentMessages(sentFolder, options.maxMessagesPerFolder) : [];

    // Merge the "most recent N" fetch with a dedicated unread-only query so
    // unread mail is never missed just because it sits outside that window.
    const inboxById = new Map();
    for (const m of recentMessages) inboxById.set(m.id, m);
    for (const m of unreadMessages) inboxById.set(m.id, m);
    const inboxMessages = [...inboxById.values()].sort((a, b) => new Date(b.date) - new Date(a.date));

    diagnostics.inboxFetched = recentMessages.length;
    diagnostics.unreadQueryFetched = unreadMessages.length;
    diagnostics.inboxMerged = inboxMessages.length;
    diagnostics.inboxUnreadFetched = inboxMessages.filter((m) => !m.read).length;
    diagnostics.sentFetched = sentMessages.length;

    const recentInbox = inboxMessages.filter((m) => new Date(m.date).getTime() >= lookbackCutoff);
    const recentSent = sentMessages.filter((m) => new Date(m.date).getTime() >= lookbackCutoff);

    const newReceived = [];
    for (const m of recentInbox) {
      if (!m.read && new Date(m.date).getTime() >= newCutoff && !isIgnoredAddress(m.author)) {
        newReceived.push(toItem(m, account, 'inbox'));
      }
    }

    // Today & Unread: every inbox message received today, plus every unread
    // inbox message regardless of age (not limited to lookbackDays/newReceivedDays).
    const todayUnread = [];
    for (const m of inboxMessages) {
      if (isIgnoredAddress(m.author)) continue;
      const msgTime = new Date(m.date).getTime();
      const isToday = msgTime >= todayCutoff;
      const isUnread = !m.read;
      if (isToday || isUnread) {
        todayUnread.push({
          ...toItem(m, account, 'inbox'),
          isToday,
          isUnread,
          junkFolderPath: junkFolder ? junkFolder.path : null,
        });
      }
    }

    // IDs I have replied to (gathered from my own Sent messages' headers)
    const repliedToIds = new Set();
    for (const m of recentSent) {
      (await getMessageIdLinks(m)).forEach((id) => repliedToIds.add(id));
    }

    // IDs of my Sent messages that someone has replied to (gathered from inbound headers)
    const referencedByInbound = new Set();
    for (const m of recentInbox) {
      (await getMessageIdLinks(m)).forEach((id) => referencedByInbound.add(id));
    }

    const unanswered = [];
    for (const m of recentInbox) {
      if (isIgnoredAddress(m.author)) continue;
      const msgId = normalizeId(m.headerMessageId);
      if (msgId && !repliedToIds.has(msgId)) {
        unanswered.push(toItem(m, account, 'inbox'));
      }
    }

    const awaitingReply = [];
    for (const m of recentSent) {
      const recipients = m.recipients || [];
      if (recipients.length > 0 && recipients.every(isIgnoredAddress)) continue;
      const msgId = normalizeId(m.headerMessageId);
      if (msgId && !referencedByInbound.has(msgId)) {
        const daysWaiting = Math.floor((now - new Date(m.date).getTime()) / 86400000);
        awaitingReply.push({
          ...toItem(m, account, 'sent'),
          daysWaiting,
          overdue: daysWaiting >= options.awaitingReplyThresholdDays,
        });
      }
    }

    return { newReceived, unanswered, awaitingReply, todayUnread, diagnostics };
  }

  async function scanAllMailboxes(userOptions) {
    const options = Object.assign({}, DEFAULT_OPTIONS, userOptions || {});
    const accounts = await messenger.accounts.list(true);

    const aggregate = {
      newReceived: [],
      unanswered: [],
      awaitingReply: [],
      todayUnread: [],
      scannedAt: new Date().toISOString(),
      accountsScanned: [],
      diagnostics: [],
      options,
    };

    for (const account of accounts) {
      try {
        const result = await scanAccount(account, options);
        aggregate.newReceived.push(...result.newReceived);
        aggregate.unanswered.push(...result.unanswered);
        aggregate.awaitingReply.push(...result.awaitingReply);
        aggregate.todayUnread.push(...result.todayUnread);
        aggregate.accountsScanned.push(account.name);
        aggregate.diagnostics.push(result.diagnostics);
      } catch (err) {
        console.error('[MailTriage] scanAccount failed for', account.name, err);
        aggregate.diagnostics.push({ accountName: account.name, error: err?.message || String(err) });
      }
    }

    aggregate.newReceived.sort((a, b) => new Date(b.date) - new Date(a.date));
    aggregate.unanswered.sort((a, b) => new Date(b.date) - new Date(a.date));
    aggregate.awaitingReply.sort((a, b) => b.daysWaiting - a.daysWaiting);
    aggregate.todayUnread.sort((a, b) => new Date(b.date) - new Date(a.date));

    return aggregate;
  }

  global.CelronMailTriage = { scanAllMailboxes, DEFAULT_OPTIONS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
