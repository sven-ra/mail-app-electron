import React from 'react';
import styles from './styles.module.css';
import EmailRowContextMenu from '../email-row-context-menu';
import { FOLDERS } from '../../mail/constants';
import { formatInboxRowDate } from '../../mail/formatDate';
import { decodeHeaderValue, getSenderDisplayName } from '../../mail/plaintextThread';
import type { EmailListItem, FolderKey } from '../../types/mail';

type InboxEmailRowProps = {
  email: EmailListItem;
  selectedEmailUid: string | null;
  onSelectEmail: (email: EmailListItem) => void;
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

function InboxEmailRow({
  email,
  selectedEmailUid,
  onSelectEmail,
  showMailboxAttribution,
  mailboxUsernameById,
  onReplyEmail,
  onReplyAllEmail,
  onForwardEmail,
  onMarkEmailAsUnread,
  onMoveEmailToJunk,
  onDeleteEmail,
  onArchiveEmail,
}: InboxEmailRowProps) {
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
  const rawFolderKey = email.folderKey as FolderKey | undefined;
  const attributionFolderKey: FolderKey | undefined = email.isThreadInjectedFromSent
    ? 'inbox'
    : rawFolderKey;
  const folderLabel = attributionFolderKey
    ? FOLDERS.find((folder) => folder.key === attributionFolderKey)?.label
    : undefined;
  const mailboxUsername =
    email.mailboxId && mailboxUsernameById ? mailboxUsernameById[email.mailboxId] : '';
  const showAccountSuffix =
    Boolean(showMailboxAttribution && folderLabel && mailboxUsername);
  const senderDisplayName = getSenderDisplayName(decodeHeaderValue(email.from), {
    bareEmailDisplay: 'full',
  });

  return (
    <EmailRowContextMenu
      onReply={() => onReplyEmail(email)}
      onReplyAll={() => onReplyAllEmail(email)}
      onForward={() => onForwardEmail(email)}
      onMarkAsUnread={() => onMarkEmailAsUnread(email)}
      onMoveToJunk={() => onMoveEmailToJunk(email)}
      onDelete={() => onDeleteEmail(email)}
      onArchive={() => onArchiveEmail(email)}
    >
      <button
        type="button"
        className={`${styles.itemButton} ${isActive ? styles.itemButtonActive : ''}`}
        data-selection-uid={rowEmailUid}
        onClick={() => onSelectEmail(email)}
      >
        <div className={styles.rowDate}>{formatInboxRowDate(email.dateRaw || email.date)}</div>
        <div className={styles.rowSender}>
          {email.isUnread && (
            <svg className={styles.unreadDotIcon} viewBox="0 0 8 8" aria-hidden="true" focusable="false">
              <circle cx="4" cy="4" r="4" fill="#0a66ff" />
            </svg>
          )}
          <span className={styles.rowSenderName}>{senderDisplayName}</span>
          {showAccountSuffix ? (
            <span className={styles.rowSenderAccount}>
              {folderLabel}
              {' \u2013 '}
              {mailboxUsername}
            </span>
          ) : null}
        </div>
        <div className={styles.rowSubject}>{email.subject}</div>
        <div className={styles.rowPreview}>{previewText}</div>
      </button>
    </EmailRowContextMenu>
  );
}

export default InboxEmailRow;
