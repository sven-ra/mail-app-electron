export type FolderKey = 'inbox' | 'drafts' | 'sent' | 'junk' | 'bin' | 'archive';

export interface FolderDefinition {
  key: FolderKey;
  label: string;
}

export interface MailboxMap {
  [folderKey: string]: string;
}

export interface MailboxConfig {
  host: string;
  username: string;
  password: string;
  mailboxMap?: MailboxMap;
  id?: string;
  [key: string]: unknown;
}

export interface EmailAttachment {
  contentId?: string;
  cid?: string;
  contentType?: string;
  filename?: string;
  related?: boolean;
  contentDisposition?: string;
  size?: number;
  dataBase64?: string;
}

export interface EmailListItem {
  uid?: number | string;
  subject?: string;
  date?: string;
  dateRaw?: string;
  from?: string;
  to?: string;
  isUnread?: boolean;
  previewLines?: string[];
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  mailboxId?: string;
  folderKey?: string;
  selectionUid?: string;
  isThreadInjectedFromSent?: boolean;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  [key: string]: unknown;
}

export interface FetchFolderEmailsResponse {
  emails: EmailListItem[];
  hasMore: boolean;
  total: number;
}

export interface LoadedEmailContent extends EmailListItem {
  loading?: false;
  error?: undefined;
}

export interface EmailLoadingState {
  loading: true;
  error?: undefined;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  isThreadInjectedFromSent?: boolean;
}

export interface EmailErrorState {
  error: string;
  loading?: false;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  isThreadInjectedFromSent?: boolean;
}

export type SelectedEmailState = LoadedEmailContent | EmailLoadingState | EmailErrorState | null;

export interface ThreadGroup {
  id: string;
  emails: EmailListItem[];
}

export type FolderCountsByMailbox = Record<string, Record<string, number>>;

export interface InboxPaginationState {
  hasMore: boolean;
  isLoadingMore: boolean;
}

export interface PlaintextSegment {
  id: string;
  text: string;
  quoteDepth: number;
  hasBoundaryMarker: boolean;
  senderHint: string;
  dateHint: string;
}

export interface ParticipantIdentity {
  selfTokens: string[];
  otherTokens: string[];
}

export interface CidAttachmentEntry {
  dataUrl: string;
  filename: string;
  contentType: string;
}
