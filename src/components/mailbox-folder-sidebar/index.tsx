import React from 'react';
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
        <button
          type="button"
          className={`${styles.folderButton} ${
            selectedMailboxId === allMailboxesId ? styles.folderButtonActive : ''
          }`}
          onClick={onSelectAllMailboxes}
        >
          <span className={styles.folderButtonContent}>
            <span>all mailboxes</span>
            {allFolderCount > 0 && <span>{allFolderCount}</span>}
          </span>
        </button>
      </div>
      {mailboxes.map((mailbox) => (
        <div key={mailbox.id} className={styles.mailboxGroup}>
          <h3 className={styles.mailboxTitle}>{mailbox.username}</h3>
          <ul className={styles.folderList}>
            {folders.map((folder) => {
              const isActive = selectedMailboxId === mailbox.id && selectedFolder === folder.key;
              const folderCount = folderCountsByMailbox[mailbox.id]?.[folder.key];
              const shouldShowFolderCount =
                folderCountKeys.includes(folder.key) &&
                Number.isFinite(folderCount) &&
                folderCount > 0;
              return (
                <li key={`${mailbox.id}:${folder.key}`}>
                  <button
                    type="button"
                    className={`${styles.folderButton} ${isActive ? styles.folderButtonActive : ''}`}
                    onClick={() => onSelectFolder(mailbox.id, folder.key)}
                  >
                    <span className={styles.folderButtonContent}>
                      <span>{folder.label}</span>
                      {shouldShowFolderCount && <span>{folderCount}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

export default MailboxFolderSidebar;
