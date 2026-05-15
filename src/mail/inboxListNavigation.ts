import {
  findSelectedIndex,
  pickVerticalNeighbor,
  type NavigationDirection,
} from './keyboard';
import { getEmailSelectionKey } from './threading';
import type { EmailListItem, ThreadGroup } from '../types/mail';

export function buildVisibleInboxEmails(
  threadGroups: readonly ThreadGroup[],
  expandedThreadIds: ReadonlySet<string>,
  selectedEmailUid: string | null
): EmailListItem[] {
  const visible: EmailListItem[] = [];
  for (const thread of threadGroups) {
    const first = thread.emails[0];
    if (!first) continue;
    visible.push(first);
    const selectedInThread =
      selectedEmailUid != null &&
      thread.emails.some((email) => getEmailSelectionKey(email) === String(selectedEmailUid));
    const showRest =
      (expandedThreadIds.has(thread.id) || selectedInThread) && thread.emails.length > 1;
    if (showRest) {
      visible.push(...thread.emails.slice(1));
    }
  }
  return visible;
}

export function pickVisibleInboxNeighbor(
  visibleEmails: readonly EmailListItem[],
  selectedEmailUid: string | null,
  direction: NavigationDirection
): EmailListItem | null {
  const selectedIndex = findSelectedIndex(visibleEmails, (email) =>
    selectedEmailUid != null
      ? getEmailSelectionKey(email) === String(selectedEmailUid)
      : false
  );
  return pickVerticalNeighbor(visibleEmails, selectedIndex, direction);
}

export function findEmailBySelectionUid(
  threadGroups: readonly ThreadGroup[],
  selectedEmailUid: string
): EmailListItem | null {
  const key = String(selectedEmailUid);
  for (const thread of threadGroups) {
    const match = thread.emails.find((email) => getEmailSelectionKey(email) === key);
    if (match) return match;
  }
  return null;
}

export function findThreadIdForEmail(
  threadGroups: readonly ThreadGroup[],
  email: EmailListItem
): string | null {
  const emailKey = getEmailSelectionKey(email);
  const thread = threadGroups.find((group) =>
    group.emails.some((item) => getEmailSelectionKey(item) === emailKey)
  );
  return thread?.id ?? null;
}

export function shouldExpandThreadForEmail(
  threadGroups: readonly ThreadGroup[],
  email: EmailListItem
): boolean {
  const threadId = findThreadIdForEmail(threadGroups, email);
  if (!threadId) return false;
  const thread = threadGroups.find((group) => group.id === threadId);
  const first = thread?.emails[0];
  if (!first) return false;
  return getEmailSelectionKey(first) !== getEmailSelectionKey(email);
}
