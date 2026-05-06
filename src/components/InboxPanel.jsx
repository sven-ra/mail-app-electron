import React, { useState } from 'react';
import styles from './InboxPanel.module.css';

function InboxPanel({ title, threadGroups, selectedEmailUid, onSelectEmail }) {
  const [expandedThreadIds, setExpandedThreadIds] = useState(() => new Set());

  function toggleThread(threadId) {
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

  function formatRowDate(dateValue) {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';

    const now = new Date();
    const isSameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (isSameDay) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleDateString();
  }

  function renderEmailRow(email) {
    const previewLines = email.previewLines || [];
    const previewText = previewLines
      .filter((line) => {
        if (!line) return false;
        const trimmedLine = line.trim();
        return !trimmedLine.startsWith('>') && !trimmedLine.startsWith('&gt;');
      })
      .join(' ');
    const isActive = selectedEmailUid && String(email.uid) === String(selectedEmailUid);

    return (
      <button
        type="button"
        className={`${styles.itemButton} ${isActive ? styles.itemButtonActive : ''}`}
        onClick={() => onSelectEmail(email)}
      >
        <div className={styles.rowDate}>{formatRowDate(email.dateRaw || email.date)}</div>
        <div className={styles.rowSender}>{email.from || ''}</div>
        <div className={styles.rowSubject}>{email.subject}</div>
        <div className={styles.rowPreview}>{previewText}</div>
      </button>
    );
  }

  return (
    <section className={styles.inboxSection}>
      <h2>{title}</h2>
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
            (email) => selectedEmailUid && String(email.uid) === String(selectedEmailUid)
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
                {renderEmailRow(firstEmail)}
              </div>

              {isExpanded && (
                <ul className={styles.threadList}>
                  {remainingEmails.map((email) => (
                    <li key={email.uid || `${email.date}-${email.subject}`} className={styles.item}>
                      {renderEmailRow(email)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default InboxPanel;
