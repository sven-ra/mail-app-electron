import React from 'react';
import styles from './InboxPanel.module.css';
import type { EmailListItem } from '../types/mail';

function formatRowDate(dateValue: string | undefined): string {
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

type InboxEmailRowProps = {
  email: EmailListItem;
  selectedEmailUid: string | null;
  onSelectEmail: (email: EmailListItem) => void;
};

function InboxEmailRow({ email, selectedEmailUid, onSelectEmail }: InboxEmailRowProps) {
  const previewLines = email.previewLines || [];
  const previewText = previewLines
    .filter((line) => {
      if (!line) return false;
      const trimmedLine = line.trim();
      return !trimmedLine.startsWith('>') && !trimmedLine.startsWith('&gt;');
    })
    .join(' ');
  const rowEmailUid = email.selectionUid || String(email.uid);
  const isActive = selectedEmailUid && rowEmailUid === String(selectedEmailUid);

  return (
    <button
      type="button"
      className={`${styles.itemButton} ${isActive ? styles.itemButtonActive : ''}`}
      onClick={() => onSelectEmail(email)}
    >
      <div className={styles.rowDate}>{formatRowDate(email.dateRaw || email.date)}</div>
      <div className={styles.rowSender}>
        {email.isUnread && (
          <svg className={styles.unreadDotIcon} viewBox="0 0 8 8" aria-hidden="true" focusable="false">
            <circle cx="4" cy="4" r="4" fill="#0a66ff" />
          </svg>
        )}
        <span>{email.from || ''}</span>
      </div>
      <div className={styles.rowSubject}>{email.subject}</div>
      <div className={styles.rowPreview}>{previewText}</div>
    </button>
  );
}

export default InboxEmailRow;
