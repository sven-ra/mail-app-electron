import type {
  EmailListItem,
  MailboxConfig,
  MailboxMap,
  SendMailPayload,
  SendMailResult,
} from './mail';

type FetchFolderEmailsOptions = {
  limit?: number;
  beforeUid?: number;
};

type FetchFolderEmailsResponse = {
  emails: EmailListItem[];
  hasMore: boolean;
  total: number;
};

type OpenSettingsUnsubscribe = () => void;

export interface ElectronApi {
  getConfig: () => Promise<MailboxConfig>;
  saveConfig: (config: MailboxConfig) => Promise<boolean>;
  getMailboxConfigs: () => Promise<MailboxConfig[]>;
  saveMailboxConfigs: (configs: MailboxConfig[]) => Promise<boolean>;
  clearConfig: () => Promise<boolean>;
  listMailboxes: (config: MailboxConfig) => Promise<MailboxMap>;
  fetchFolderEmails: (
    config: MailboxConfig,
    folderKey: string,
    mailboxMap: MailboxMap,
    options?: FetchFolderEmailsOptions
  ) => Promise<FetchFolderEmailsResponse | EmailListItem[]>;
  fetchFolderUnreadCount: (
    config: MailboxConfig,
    folderKey: string,
    mailboxMap: MailboxMap
  ) => Promise<number>;
  fetchFolderEmail: (
    config: MailboxConfig,
    folderKey: string,
    uid: string | number,
    mailboxMap: MailboxMap
  ) => Promise<EmailListItem>;
  fetchFolderEmailRaw: (
    config: MailboxConfig,
    folderKey: string,
    uid: string | number,
    mailboxMap: MailboxMap
  ) => Promise<{ rawBase64: string }>;
  sendMail: (config: MailboxConfig, payload: SendMailPayload) => Promise<SendMailResult>;
  moveFolderEmail: (
    config: MailboxConfig,
    sourceFolderKey: string,
    uid: string | number,
    mailboxMap: MailboxMap,
    targetFolderKey: string
  ) => Promise<boolean>;
  setFolderEmailReadState: (
    config: MailboxConfig,
    folderKey: string,
    uid: string | number,
    mailboxMap: MailboxMap,
    isRead: boolean
  ) => Promise<boolean>;
  onOpenSettings: (callback: () => void) => OpenSettingsUnsubscribe;
  setUnreadBadgeCount: (count: number) => Promise<boolean>;
  openExternalUrl: (url: string) => Promise<boolean>;
  showEmailNotification: (payload: { title: string; body: string }) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI?: ElectronApi;
  }
}
