import {
  findSelectedIndex,
  pickVerticalNeighbor,
  type NavigationDirection,
} from './keyboard';
import type { FolderDefinition, FolderKey, MailboxConfig } from '../types/mail';

export type FolderSidebarEntry =
  | { type: 'all' }
  | { type: 'mailbox'; mailboxId: string; folderKey: FolderKey };

export function buildFolderSidebarEntries(
  mailboxes: MailboxConfig[],
  folders: FolderDefinition[]
): FolderSidebarEntry[] {
  const entries: FolderSidebarEntry[] = [{ type: 'all' }];
  for (const mailbox of mailboxes) {
    for (const folder of folders) {
      entries.push({ type: 'mailbox', mailboxId: mailbox.id, folderKey: folder.key });
    }
  }
  return entries;
}

export function getFolderSidebarNavKey(
  entry: FolderSidebarEntry,
  allMailboxesId: string
): string {
  if (entry.type === 'all') return `${allMailboxesId}:all`;
  return `${entry.mailboxId}:${entry.folderKey}`;
}

export function entryMatchesFolderSelection(
  entry: FolderSidebarEntry,
  selectedMailboxId: string | null,
  selectedFolder: FolderKey,
  allMailboxesId: string
): boolean {
  if (entry.type === 'all') return selectedMailboxId === allMailboxesId;
  return selectedMailboxId === entry.mailboxId && selectedFolder === entry.folderKey;
}

export function findActiveFolderSidebarEntry(
  entries: readonly FolderSidebarEntry[],
  selectedMailboxId: string | null,
  selectedFolder: FolderKey,
  allMailboxesId: string
): FolderSidebarEntry | undefined {
  return entries.find((entry) =>
    entryMatchesFolderSelection(entry, selectedMailboxId, selectedFolder, allMailboxesId)
  );
}

export function pickFolderSidebarNeighbor(
  entries: readonly FolderSidebarEntry[],
  selectedMailboxId: string | null,
  selectedFolder: FolderKey,
  allMailboxesId: string,
  direction: NavigationDirection
): FolderSidebarEntry | null {
  const selectedIndex = findSelectedIndex(entries, (entry) =>
    entryMatchesFolderSelection(entry, selectedMailboxId, selectedFolder, allMailboxesId)
  );
  return pickVerticalNeighbor(entries, selectedIndex, direction);
}

export function applyFolderSidebarEntry(
  entry: FolderSidebarEntry,
  handlers: {
    onSelectAllMailboxes: () => void;
    onSelectFolder: (mailboxId: string, folderKey: FolderKey) => void;
  }
): void {
  if (entry.type === 'all') {
    handlers.onSelectAllMailboxes();
    return;
  }
  handlers.onSelectFolder(entry.mailboxId, entry.folderKey);
}
