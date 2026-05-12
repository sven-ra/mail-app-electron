import type { FolderDefinition, FolderKey, MailboxConfig } from '../types/mail';

export const EMPTY_CONFIG: MailboxConfig = {
  host: '',
  username: '',
  password: '',
  smtpHost: '',
  smtpSecure: true,
  smtpUsername: '',
  smtpPassword: '',
  smtpUseImapCredentials: true,
  smtpAuthMode: 'password',
  smtpClientId: '',
  smtpClientSecret: '',
  smtpRefreshToken: '',
  smtpAccessToken: '',
  smtpOAuthUser: '',
};
export const ALL_MAILBOXES_ID = '__all_mailboxes__';
export const LAST_SELECTED_EMAIL_UID_PREFIX = 'lastSelectedEmailUid:';
export const LAST_SELECTED_MAILBOX_ID_KEY = 'lastSelectedMailboxId';
export const LAST_SELECTED_FOLDER_KEY = 'lastSelectedFolder';
export const INBOX_WIDTH_STORAGE_KEY = 'inboxPanelWidth';
export const FOLDERS_PANEL_WIDTH_STORAGE_KEY = 'foldersPanelWidth';
export const THEME_STORAGE_KEY = 'themeMode';
export const EMAIL_PAGE_SIZE = 50;
export const FOLDER_COUNT_KEYS: FolderKey[] = ['inbox', 'junk', 'drafts', 'bin'];
export const FOLDERS: FolderDefinition[] = [
  { key: 'inbox', label: 'INBOX' },
  { key: 'drafts', label: 'drafts' },
  { key: 'sent', label: 'sent' },
  { key: 'junk', label: 'junk' },
  { key: 'bin', label: 'bin' },
  { key: 'archive', label: 'archive' },
];

export function getFolderUidStorageKey(mailboxId: string, folderKey: string): string {
  return `${LAST_SELECTED_EMAIL_UID_PREFIX}${mailboxId}:${folderKey}`;
}

export function mailboxToFormConfig(mailbox: MailboxConfig | null | undefined): MailboxConfig {
  if (!mailbox) {
    return { ...EMPTY_CONFIG };
  }
  return {
    ...EMPTY_CONFIG,
    host: mailbox.host || '',
    username: mailbox.username || '',
    password: mailbox.password || '',
    smtpHost: mailbox.smtpHost || '',
    smtpSecure: true,
    smtpUsername: mailbox.smtpUsername || '',
    smtpPassword: mailbox.smtpPassword || '',
    smtpUseImapCredentials:
      mailbox.smtpUseImapCredentials === undefined ? false : Boolean(mailbox.smtpUseImapCredentials),
    smtpAuthMode: mailbox.smtpAuthMode === 'oauth2' ? 'oauth2' : 'password',
    smtpClientId: mailbox.smtpClientId || '',
    smtpClientSecret: mailbox.smtpClientSecret || '',
    smtpRefreshToken: mailbox.smtpRefreshToken || '',
    smtpAccessToken: mailbox.smtpAccessToken || '',
    smtpOAuthUser: mailbox.smtpOAuthUser || '',
  };
}
