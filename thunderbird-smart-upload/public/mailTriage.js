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

  async function listRecentMessages(folder, maxItems) {
    const results = [];
    try {
      let page = await messenger.messages.list(folder);
      results.push(...page.messages);
      let guard = 0;
      while (page.id && results.length < maxItems && guard < 8) {
        page = await messenger.messages.continueList(page.id);
        results.push(...page.messages);
        guard++;
      }
    } catch (err) {
      console.error('[MailTriage] listRecentMessages failed for folder', folder && folder.path, err);
    }
    results.sort((a, b) => new Date(b.date) - new Date(a.date));
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
    const inboxFolder = (account.folders || []).find((f) => f.type === 'inbox');
    const sentFolder = (account.folders || []).find((f) => f.type === 'sent');

    const now = Date.now();
    const lookbackCutoff = now - options.lookbackDays * 86400000;
    const newCutoff = now - options.newReceivedDays * 86400000;

    const inboxMessages = inboxFolder ? await listRecentMessages(inboxFolder, options.maxMessagesPerFolder) : [];
    const sentMessages = sentFolder ? await listRecentMessages(sentFolder, options.maxMessagesPerFolder) : [];

    const recentInbox = inboxMessages.filter((m) => new Date(m.date).getTime() >= lookbackCutoff);
    const recentSent = sentMessages.filter((m) => new Date(m.date).getTime() >= lookbackCutoff);

    const newReceived = [];
    for (const m of recentInbox) {
      if (!m.read && new Date(m.date).getTime() >= newCutoff && !isIgnoredAddress(m.author)) {
        newReceived.push(toItem(m, account, 'inbox'));
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

    return { newReceived, unanswered, awaitingReply };
  }

  async function scanAllMailboxes(userOptions) {
    const options = Object.assign({}, DEFAULT_OPTIONS, userOptions || {});
    const accounts = await messenger.accounts.list(true);

    const aggregate = {
      newReceived: [],
      unanswered: [],
      awaitingReply: [],
      scannedAt: new Date().toISOString(),
      accountsScanned: [],
      options,
    };

    for (const account of accounts) {
      try {
        const result = await scanAccount(account, options);
        aggregate.newReceived.push(...result.newReceived);
        aggregate.unanswered.push(...result.unanswered);
        aggregate.awaitingReply.push(...result.awaitingReply);
        aggregate.accountsScanned.push(account.name);
      } catch (err) {
        console.error('[MailTriage] scanAccount failed for', account.name, err);
      }
    }

    aggregate.newReceived.sort((a, b) => new Date(b.date) - new Date(a.date));
    aggregate.unanswered.sort((a, b) => new Date(b.date) - new Date(a.date));
    aggregate.awaitingReply.sort((a, b) => b.daysWaiting - a.daysWaiting);

    return aggregate;
  }

  global.CelronMailTriage = { scanAllMailboxes, DEFAULT_OPTIONS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
