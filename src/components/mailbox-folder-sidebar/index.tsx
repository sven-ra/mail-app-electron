import React, { useCallback, useMemo } from 'react';
import Button from '../button';
import styles from './styles.module.css';
import {
  applyFolderSidebarEntry,
  buildFolderSidebarEntries,
  findActiveFolderSidebarEntry,
  getFolderSidebarNavKey,
  pickFolderSidebarNeighbor,
} from '../../mail/folderSidebar';
import { useColumnArrowNavigation } from '../../hooks/useColumnArrowNavigation';
import { useScrollToDataAttribute } from '../../hooks/useScrollToDataAttribute';
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
  isColumnFocused?: boolean;
  onSelectAllMailboxes: () => void;
  onSelectFolder: (mailboxId: string, folderKey: FolderKey) => void;
};

function FolderUnreadCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className={styles.folderUnreadCount}>[{count}]</span>;
}

function MailboxFolderSidebar({
  mailboxes,
  selectedMailboxId,
  selectedFolder,
  folderCountsByMailbox,
  allFolderCount,
  folderCountKeys,
  folders,
  allMailboxesId,
  isColumnFocused = false,
  onSelectAllMailboxes,
  onSelectFolder,
}: MailboxFolderSidebarProps) {
  const sidebarEntries = useMemo(
    () => buildFolderSidebarEntries(mailboxes, folders),
    [mailboxes, folders]
  );

  const activeEntry = useMemo(
    () => findActiveFolderSidebarEntry(sidebarEntries, selectedMailboxId, selectedFolder, allMailboxesId),
    [sidebarEntries, selectedMailboxId, selectedFolder, allMailboxesId]
  );

  const resolveNeighbor = useCallback(
    (direction: 'up' | 'down') =>
      pickFolderSidebarNeighbor(
        sidebarEntries,
        selectedMailboxId,
        selectedFolder,
        allMailboxesId,
        direction
      ),
    [sidebarEntries, selectedMailboxId, selectedFolder, allMailboxesId]
  );

  const handleNavigate = useCallback(
    (entry: (typeof sidebarEntries)[number]) => {
      applyFolderSidebarEntry(entry, { onSelectAllMailboxes, onSelectFolder });
    },
    [onSelectAllMailboxes, onSelectFolder]
  );

  useColumnArrowNavigation({
    enabled: isColumnFocused,
    resolveNeighbor,
    onNavigate: handleNavigate,
  });

  useScrollToDataAttribute({
    enabled: isColumnFocused,
    attribute: 'data-folder-nav-key',
    value: activeEntry ? getFolderSidebarNavKey(activeEntry, allMailboxesId) : null,
  });

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
          data-folder-nav-key={getFolderSidebarNavKey({ type: 'all' }, allMailboxesId)}
          onClick={onSelectAllMailboxes}
        >
          all inboxes
          <FolderUnreadCount count={allFolderCount} />
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
              const tracksUnreadCount = folderCountKeys.includes(folder.key);
              const showUnreadCount =
                tracksUnreadCount && Number.isFinite(folderCount) && folderCount > 0;
              return (
                <Button
                  key={`${mailbox.id}:${folder.key}`}
                  type="button"
                  size="md"
                  variant={['ghost', 'rounded']}
                  labelClassName={styles.folderButtonLabel}
                  className={`${styles.folderNavButton} ${isActive ? styles.folderButtonActive : ''}`}
                  data-folder-nav-key={getFolderSidebarNavKey(
                    { type: 'mailbox', mailboxId: mailbox.id, folderKey: folder.key },
                    allMailboxesId
                  )}
                  onClick={() => onSelectFolder(mailbox.id, folder.key)}
                >
                  {folder.label}
                  {showUnreadCount ? <FolderUnreadCount count={folderCount} /> : null}
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
