import React, { useCallback, useMemo, useState } from 'react';
import type { UIEvent } from 'react';
import styles from './styles.module.css';
import InboxEmailRow from '../inbox-email-row';
import {
  buildVisibleInboxEmails,
  findThreadIdForEmail,
  pickVisibleInboxNeighbor,
  shouldExpandThreadForEmail,
} from '../../mail/inboxListNavigation';
import { useColumnArrowNavigation } from '../../hooks/useColumnArrowNavigation';
import { useInboxListDeleteShortcut } from '../../hooks/useInboxListDeleteShortcut';
import { useScrollToDataAttribute } from '../../hooks/useScrollToDataAttribute';
import type { EmailListItem, ThreadGroup } from '../../types/mail';

type InboxPanelProps = {
  title: string;
  threadGroups: ThreadGroup[];
  selectedEmailUid: string | null;
  isColumnFocused?: boolean;
  onSelectEmail: (email: EmailListItem) => void;
  onLoadMore?: () => void;
  isLoadingMore: boolean;
  showMailboxAttribution?: boolean;
  mailboxUsernameById?: Record<string, string>;
  onReplyEmail: (email: EmailListItem) => void;
  onReplyAllEmail: (email: EmailListItem) => void;
  onForwardEmail: (email: EmailListItem) => void;
  onMarkEmailAsUnread: (email: EmailListItem) => void;
  onMoveEmailToJunk: (email: EmailListItem) => void;
  onDeleteEmail: (email: EmailListItem) => void;
  onArchiveEmail: (email: EmailListItem) => void;
};

function InboxPanel({
  title,
  threadGroups,
  selectedEmailUid,
  isColumnFocused = false,
  onSelectEmail,
  onLoadMore,
  isLoadingMore,
  showMailboxAttribution,
  mailboxUsernameById,
  onReplyEmail,
  onReplyAllEmail,
  onForwardEmail,
  onMarkEmailAsUnread,
  onMoveEmailToJunk,
  onDeleteEmail,
  onArchiveEmail,
}: InboxPanelProps) {
  const [expandedThreadIds, setExpandedThreadIds] = useState<Set<string>>(() => new Set());

  const visibleEmails = useMemo(
    () => buildVisibleInboxEmails(threadGroups, expandedThreadIds, selectedEmailUid),
    [threadGroups, expandedThreadIds, selectedEmailUid]
  );

  function toggleThread(threadId: string): void {
    setExpandedThreadIds((current) => {
      const next = new Set(current);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return next;
    });
  }

  const expandThreadForEmail = useCallback((email: EmailListItem) => {
    if (!shouldExpandThreadForEmail(threadGroups, email)) return;
    const threadId = findThreadIdForEmail(threadGroups, email);
    if (!threadId) return;
    setExpandedThreadIds((current) => {
      if (current.has(threadId)) return current;
      const next = new Set(current);
      next.add(threadId);
      return next;
    });
  }, [threadGroups]);

  function handleScroll(event: UIEvent<HTMLElement>): void {
    if (!onLoadMore) return;

    const element = event.currentTarget;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceFromBottom <= 24) {
      onLoadMore();
    }
  }

  const resolveNeighbor = useCallback(
    (direction: 'up' | 'down') => pickVisibleInboxNeighbor(visibleEmails, selectedEmailUid, direction),
    [visibleEmails, selectedEmailUid]
  );

  const handleNavigate = useCallback(
    (email: EmailListItem) => {
      expandThreadForEmail(email);
      void onSelectEmail(email);
    },
    [expandThreadForEmail, onSelectEmail]
  );

  useColumnArrowNavigation({
    enabled: isColumnFocused,
    resolveNeighbor,
    onNavigate: handleNavigate,
  });

  useInboxListDeleteShortcut({
    enabled: isColumnFocused,
    threadGroups,
    selectedEmailUid,
    onDeleteEmail,
  });

  useScrollToDataAttribute({
    enabled: isColumnFocused,
    attribute: 'data-selection-uid',
    value: selectedEmailUid,
  });

  return (
    <section className={styles.inboxSection} data-inbox-panel onScroll={handleScroll}>
      {/* <h2>{title}</h2> */}
      <ul className={styles.list}>
        {threadGroups.map((thread) => {
          const firstEmail = thread.emails[0];
          if (!firstEmail) {
            return null;
          }

          const hasMoreEmails = thread.emails.length > 1;
          const isExpanded = expandedThreadIds.has(thread.id);
          const remainingEmails = isExpanded ? thread.emails.slice(1) : [];
          const isThreadActive = thread.emails.some(
            (email) =>
              selectedEmailUid &&
              (email.selectionUid || String(email.uid)) === String(selectedEmailUid)
          );

          return (
            <li
              key={thread.id}
              className={`${styles.threadItem} ${isThreadActive ? styles.threadItemActive : ''}`}
            >
              <div className={styles.threadSummary}>
                <button
                  type="button"
                  className={styles.arrowButton}
                  onClick={() => hasMoreEmails && toggleThread(thread.id)}
                  aria-label={isExpanded ? 'Collapse thread' : 'Expand thread'}
                  disabled={!hasMoreEmails}
                >
                  {hasMoreEmails ? (isExpanded ? '▾' : '▸') : ''}
                </button>
                <InboxEmailRow
                  email={firstEmail}
                  selectedEmailUid={selectedEmailUid}
                  onSelectEmail={onSelectEmail}
                  showMailboxAttribution={showMailboxAttribution}
                  mailboxUsernameById={mailboxUsernameById}
                  onReplyEmail={onReplyEmail}
                  onReplyAllEmail={onReplyAllEmail}
                  onForwardEmail={onForwardEmail}
                  onMarkEmailAsUnread={onMarkEmailAsUnread}
                  onMoveEmailToJunk={onMoveEmailToJunk}
                  onDeleteEmail={onDeleteEmail}
                  onArchiveEmail={onArchiveEmail}
                />
              </div>

              {isExpanded && (
                <ul className={styles.threadList}>
                  {remainingEmails.map((email) => (
                    <li
                      key={email.selectionUid || email.uid || `${email.date}-${email.subject}`}
                      className={styles.item}
                    >
                      <InboxEmailRow
                        email={email}
                        selectedEmailUid={selectedEmailUid}
                        onSelectEmail={onSelectEmail}
                        showMailboxAttribution={showMailboxAttribution}
                        mailboxUsernameById={mailboxUsernameById}
                        onReplyEmail={onReplyEmail}
                        onReplyAllEmail={onReplyAllEmail}
                        onForwardEmail={onForwardEmail}
                        onMarkEmailAsUnread={onMarkEmailAsUnread}
                        onMoveEmailToJunk={onMoveEmailToJunk}
                        onDeleteEmail={onDeleteEmail}
                        onArchiveEmail={onArchiveEmail}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {isLoadingMore && (
        <div className={styles.loadingMoreIndicator} aria-hidden="true">
          <span />
        </div>
      )}
    </section>
  );
}

export default InboxPanel;
