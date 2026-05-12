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

interface ElectronApi {
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
  sendMail: (config: MailboxConfig, payload: SendMailPayload) => Promise<SendMailResult>;
  moveFolderEmail: (
    config: MailboxConfig,
    sourceFolderKey: string,
    uid: string | number,
    mailboxMap: MailboxMap,
    targetFolderKey: string
  ) => Promise<boolean>;
  onOpenSettings: (callback: () => void) => OpenSettingsUnsubscribe;
}

declare global {
  interface Window {
    electronAPI?: ElectronApi;
  }
}

export {};
