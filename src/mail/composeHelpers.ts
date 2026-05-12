import type { LoadedEmailContent, MailboxConfig } from '../types/mail';
import {
  buildParticipantIdentity,
  decodeHeaderValue,
  getAddressForActions,
  inferSegmentRole,
  normalizeThreadOrder,
  parsePlaintextThread,
} from './plaintextThread';

const EMAIL_IN_TEXT = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gi;

/** Reply-To if present, otherwise From — decoded; falls back to first bare email if needed. */
export function getReplyMainRecipient(email: LoadedEmailContent): string {
  const raw = (email.replyTo || email.from || '').trim();
  const decoded = decodeHeaderValue(raw).trim();
  if (decoded) return decoded;
  const emails = extractEmailsFromHeader(email.replyTo || email.from || '');
  return emails[0] || '';
}

/**
 * Prefer the sender of the latest plain-text thread segment classified as incoming (`other`).
 * Falls back to envelope Reply-To / From when the thread is unsplit or has no incoming segment.
 */
export function getLatestIncomingReplyRecipient(email: LoadedEmailContent): string {
  const segments = normalizeThreadOrder(parsePlaintextThread(email.text || ''));
  if (segments.length >= 2) {
    const identity = buildParticipantIdentity(email);
    const roles = segments.map((segment) => inferSegmentRole(segment, identity));
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      if (roles[i] !== 'other') continue;
      const hint = String(segments[i].senderHint || '').trim();
      if (hint) {
        const decoded = decodeHeaderValue(hint).trim();
        if (decoded) return decoded;
        const bare = getAddressForActions(hint);
        if (bare) return bare;
      }
    }
  }
  return getReplyMainRecipient(email);
}

export function extractEmailsFromHeader(header: string): string[] {
  if (!header) return [];
  const matches = header.match(EMAIL_IN_TEXT);
  if (!matches || !matches.length) return [];
  return [...new Set(matches.map((addr) => addr.toLowerCase()))];
}

export function isSelfAddress(emailLower: string, mailbox: MailboxConfig): boolean {
  const u = (mailbox.username || '').trim().toLowerCase();
  if (!u) return false;
  if (emailLower === u) return true;
  if (extractEmailsFromHeader(mailbox.username || '').includes(emailLower)) return true;
  if (extractEmailsFromHeader(mailbox.smtpUsername || '').includes(emailLower)) return true;
  if (extractEmailsFromHeader(mailbox.smtpOAuthUser || '').includes(emailLower)) return true;
  return false;
}

export function withReplySubject(subject: string): string {
  const s = (subject || '').trim();
  if (!s) return 'Re: ';
  if (/^re:\s/i.test(s)) return s;
  return `Re: ${s}`;
}

export function withForwardSubject(subject: string): string {
  const s = (subject || '').trim();
  if (!s) return 'Fwd: ';
  if (/^fwd:\s/i.test(s)) return s;
  return `Fwd: ${s}`;
}

function uniqueRecipientEmails(headers: string[], mailbox: MailboxConfig): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const combined = headers.filter(Boolean).join(',');
  combined.split(',').forEach((part) => {
    const matches = part.match(EMAIL_IN_TEXT);
    if (!matches) return;
    matches.forEach((addr) => {
      const low = addr.toLowerCase();
      if (isSelfAddress(low, mailbox)) return;
      if (seen.has(low)) return;
      seen.add(low);
      out.push(addr);
    });
  });
  return out;
}

export function buildReplyCompose(email: LoadedEmailContent): {
  to: string;
  cc: string;
  subject: string;
  inReplyTo: string;
  references: string[];
} {
  const to = getLatestIncomingReplyRecipient(email);
  const originalId = (email.messageId || '').trim();
  const inReplyToInner = originalId.replace(/^<|>$/g, '');
  const refs = [...(email.references || [])];
  if (inReplyToInner && !refs.map((r) => r.replace(/^<|>$/g, '')).includes(inReplyToInner)) {
    refs.push(inReplyToInner);
  }

  return {
    to,
    cc: '',
    subject: withReplySubject(email.subject || ''),
    inReplyTo: originalId ? `<${inReplyToInner}>` : '',
    references: refs.map((r) => {
      const t = String(r).trim();
      if (!t) return '';
      return t.startsWith('<') ? t : `<${t.replace(/^<|>$/g, '')}>`;
    }).filter(Boolean),
  };
}

export function buildReplyAllCompose(
  email: LoadedEmailContent,
  mailbox: MailboxConfig
): { to: string; cc: string; subject: string; inReplyTo: string; references: string[] } {
  const base = buildReplyCompose(email);
  const parts = uniqueRecipientEmails(
    [email.replyTo || '', email.from || '', email.to || '', email.cc || ''],
    mailbox
  );
  const toAll = parts.join(', ');
  const main = getLatestIncomingReplyRecipient(email);
  return {
    ...base,
    to: toAll || main,
    cc: '',
  };
}

export function buildForwardCompose(email: LoadedEmailContent): {
  to: string;
  cc: string;
  subject: string;
  inReplyTo: string;
  references: string[];
  initialHtml: string;
} {
  const quotedText = email.text || '';
  const quotedHtml =
    email.html && String(email.html).trim()
      ? `<hr><blockquote>${email.html}</blockquote>`
      : `<hr><pre>${escapeHtml(quotedText)}</pre>`;

  return {
    to: '',
    cc: '',
    subject: withForwardSubject(email.subject || ''),
    inReplyTo: '',
    references: [],
    initialHtml: `<p></p>${quotedHtml}`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function referencesForSend(refs: string[]): string[] {
  return refs.map((r) => {
    const t = String(r).trim();
    if (!t) return '';
    if (t.startsWith('<')) return t;
    return `<${t.replace(/^<|>$/g, '')}>`;
  }).filter(Boolean);
}
