import type {
  EmailListItem,
  FetchFolderEmailsResponse,
  MailboxConfig,
  ThreadGroup,
} from '../types/mail';

function getEmailThreadKey(email: EmailListItem, fallbackKey: string): string {
  return email.messageId || email.inReplyTo || fallbackKey;
}

function normalizeConversationToken(value: unknown): string {
  if (!value) return '';
  return String(value).trim().replace(/^<|>$/g, '').toLowerCase();
}

function getEmailConversationTokens(email: EmailListItem): string[] {
  return [email.messageId, email.inReplyTo, ...(email.references || [])]
    .map((value) => normalizeConversationToken(value))
    .filter(Boolean);
}

function getEmailTimestamp(email: EmailListItem): number {
  const rawDate = email?.dateRaw || email?.date || '';
  const parsed = Date.parse(rawDate);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function hasSharedConversationToken(emailA: EmailListItem, emailB: EmailListItem): boolean {
  const tokensA = getEmailConversationTokens(emailA);
  if (!tokensA.length) return false;
  const tokensB = new Set(getEmailConversationTokens(emailB));
  return tokensA.some((token) => tokensB.has(token));
}

export function getMailboxId(config: MailboxConfig): string {
  return `${config.username}:${config.host}`;
}

export function buildConversationIndex(emails: EmailListItem[]): {
  tokens: Set<string>;
  inboxEmails: EmailListItem[];
} {
  const tokens = new Set<string>();
  emails.forEach((email) => {
    getEmailConversationTokens(email).forEach((token) => tokens.add(token));
  });
  return { tokens, inboxEmails: emails };
}

export function isEmailRelatedToConversation(
  email: EmailListItem,
  conversationIndex: { tokens: Set<string>; inboxEmails: EmailListItem[] } | null | undefined
): boolean {
  if (!conversationIndex) return false;
  const tokens = getEmailConversationTokens(email);
  if (!tokens.length) return false;
  const tokenMatch = tokens.some((token) => conversationIndex.tokens.has(token));
  if (!tokenMatch) return false;

  const relatedInboxEmails = (conversationIndex.inboxEmails || []).filter((inboxEmail) =>
    hasSharedConversationToken(email, inboxEmail)
  );
  if (!relatedInboxEmails.length) return false;

  const sentTime = getEmailTimestamp(email);
  if (!Number.isFinite(sentTime)) return false;

  const latestInboxTime = relatedInboxEmails.reduce((latest, inboxEmail) => {
    const inboxTime = getEmailTimestamp(inboxEmail);
    return Number.isFinite(inboxTime) ? Math.max(latest, inboxTime) : latest;
  }, Number.NEGATIVE_INFINITY);

  if (!Number.isFinite(latestInboxTime)) return true;
  return sentTime > latestInboxTime;
}

export function compareEmailsByRecency(a: EmailListItem, b: EmailListItem): number {
  const aTime = Date.parse(a?.dateRaw || '');
  const bTime = Date.parse(b?.dateRaw || '');
  const hasATime = Number.isFinite(aTime);
  const hasBTime = Number.isFinite(bTime);
  if (hasATime && hasBTime && aTime !== bTime) {
    return bTime - aTime;
  }
  return Number(b?.uid || 0) - Number(a?.uid || 0);
}

export function getEmailSelectionKey(
  email: Pick<EmailListItem, 'selectionUid' | 'uid' | 'folderKey' | 'mailboxId'>
): string {
  if (email.selectionUid) return String(email.selectionUid);
  return `${email.mailboxId}:${email.folderKey}:${email.uid}`;
}

export function groupEmailsByThread(emails: EmailListItem[]): ThreadGroup[] {
  const idToThreadId = new Map<string, string>();
  const threads = new Map<string, ThreadGroup>();

  emails.forEach((email, index) => {
    const ids = [email.messageId, email.inReplyTo, ...(email.references || [])].filter(Boolean);
    const existingThreadId = ids.find((id) => idToThreadId.has(id));
    const fallbackThreadId = getEmailThreadKey(email, `uid:${email.uid || index}`);
    const threadId = existingThreadId ? idToThreadId.get(existingThreadId) : fallbackThreadId;

    if (!threads.has(threadId)) {
      threads.set(threadId, { id: threadId, emails: [] });
    }

    threads.get(threadId).emails.push(email);
    ids.forEach((id) => idToThreadId.set(id, threadId));
  });

  return Array.from(threads.values()).map((thread: ThreadGroup) => ({
    ...thread,
    emails: thread.emails.slice().sort(compareEmailsByRecency),
  }));
}

/** Next inbox thread to open after removing the current one (same mailbox as `loaded`); never another message in the same thread. */
export function pickNeighborEmailForMove(
  emails: EmailListItem[],
  loaded: Pick<EmailListItem, 'uid' | 'folderKey' | 'mailboxId' | 'selectionUid'>,
  mailboxId: string,
  isAllMailboxesView: boolean
): EmailListItem | null {
  const mbId = String(loaded.mailboxId || mailboxId);
  const list = isAllMailboxesView ? emails.filter((e) => String(e.mailboxId) === mbId) : emails;
  const threads = groupEmailsByThread(list);
  const selectedKey = loaded.selectionUid
    ? String(loaded.selectionUid)
    : `${mbId}:${loaded.folderKey}:${loaded.uid}`;

  function emailMatches(e: EmailListItem): boolean {
    const k = e.selectionUid
      ? String(e.selectionUid)
      : `${e.mailboxId}:${e.folderKey}:${e.uid}`;
    if (k === selectedKey) return true;
    return (
      String(e.uid) === String(loaded.uid) &&
      e.folderKey === loaded.folderKey &&
      String(e.mailboxId) === mbId
    );
  }

  for (let ti = 0; ti < threads.length; ti++) {
    const thread = threads[ti];
    if (!thread.emails.some(emailMatches)) continue;

    const nextThread = threads[ti + 1];
    if (nextThread?.emails[0]) return nextThread.emails[0];

    const prevThread = threads[ti - 1];
    if (prevThread?.emails[0]) return prevThread.emails[0];

    return null;
  }
  return null;
}

export function getFolderEmailResult(
  value: FetchFolderEmailsResponse | EmailListItem[] | null | undefined
): FetchFolderEmailsResponse {
  if (Array.isArray(value)) {
    return { emails: value, hasMore: false, total: value.length };
  }
  return {
    emails: value?.emails || [],
    hasMore: Boolean(value?.hasMore),
    total: Number(value?.total) || 0,
  };
}

export function withMailboxEmailMeta(
  email: EmailListItem,
  mailboxId: string,
  folderKey: string
): EmailListItem {
  const uidPart = email?.uid != null ? String(email.uid) : 'no-uid';
  return {
    ...email,
    mailboxId,
    folderKey,
    selectionUid: `${mailboxId}:${folderKey}:${uidPart}`,
  };
}
