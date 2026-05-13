import React from 'react';
import Button from '../button';
import styles from './styles.module.css';
import type { FolderDefinition, FolderKey, MailboxConfig } from '../../types/mail';

type MailboxFolderSidebarProps = {
  mailboxes: MailboxConfig[];
  selectedMailboxId: string | null;
  selectedFolder: FolderKey;
  folderCountsByMailbox: Record<string, Record<string, number>>;
  allFolderCount: number;
  folderCountKeys: FolderKey[];
  folders: FolderDefinition[];
  allMailboxesId: string;
  onSelectAllMailboxes: () => void;
  onSelectFolder: (mailboxId: string, folderKey: FolderKey) => void;
};

function MailboxFolderSidebar({
  mailboxes,
  selectedMailboxId,
  selectedFolder,
  folderCountsByMailbox,
  allFolderCount,
  folderCountKeys,
  folders,
  allMailboxesId,
  onSelectAllMailboxes,
  onSelectFolder,
}: MailboxFolderSidebarProps) {
  return (
    <section className={styles.foldersSection}>
      <div className={styles.mailboxGroup}>
        <Button
          type="button"
          size="md"
          variant={['ghost', 'rounded']}
          labelClassName={styles.folderButtonLabel}
          className={`${styles.folderNavButton} ${
            selectedMailboxId === allMailboxesId ? styles.folderButtonActive : ''
          }`}
          onClick={onSelectAllMailboxes}
        >
          all inboxes
          {allFolderCount > 0 && <span>{allFolderCount}</span>}
        </Button>
      </div>
      {mailboxes.map((mailbox) => (
        <div key={mailbox.id} className={styles.mailboxGroup}>
          <h3 id={`mailbox-heading-${mailbox.id}`} className={styles.mailboxTitle}>
            {mailbox.username}
          </h3>
          <nav className={styles.folderNav} aria-labelledby={`mailbox-heading-${mailbox.id}`}>
            {folders.map((folder) => {
              const isActive = selectedMailboxId === mailbox.id && selectedFolder === folder.key;
              const folderCount = folderCountsByMailbox[mailbox.id]?.[folder.key];
              const shouldShowFolderCount =
                folderCountKeys.includes(folder.key) &&
                Number.isFinite(folderCount) &&
                folderCount > 0;
              return (
                <Button
                  key={`${mailbox.id}:${folder.key}`}
                  type="button"
                  size="md"
                  variant={['ghost', 'rounded']}
                  labelClassName={styles.folderButtonLabel}
                  className={`${styles.folderNavButton} ${isActive ? styles.folderButtonActive : ''}`}
                  onClick={() => onSelectFolder(mailbox.id, folder.key)}
                >
                  {folder.label}
                  {shouldShowFolderCount && <span>{folderCount}</span>}
                </Button>
              );
            })}
          </nav>
        </div>
      ))}
    </section>
  );
}

export default MailboxFolderSidebar;
