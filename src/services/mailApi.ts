import type { EmailListItem, MailboxConfig, MailboxMap, SendMailPayload, SendMailResult } from '../types/mail';

type FolderEmailsOptions = { limit?: number; beforeUid?: number };
type FolderEmailsResponse = {
  emails: EmailListItem[];
  hasMore: boolean;
  total: number;
};

function getElectronApi() {
  if (!window.electronAPI) {
    throw new Error('Electron API is not available.');
  }
  return window.electronAPI;
}

function callApiMethod(methodName: string, ...args: unknown[]): unknown {
  const api = getElectronApi();
  const method = (api as unknown as Record<string, unknown>)[methodName];
  if (typeof method !== 'function') {
    throw new Error(`Electron API method "${methodName}" is not available.`);
  }
  return (method as (...methodArgs: unknown[]) => unknown)(...args);
}

export const mailApi = {
  getMailboxConfigs(): Promise<MailboxConfig[]> {
    return callApiMethod('getMailboxConfigs') as Promise<MailboxConfig[]>;
  },
  getConfig(): Promise<MailboxConfig> {
    return callApiMethod('getConfig') as Promise<MailboxConfig>;
  },
  saveMailboxConfigs(configs: MailboxConfig[]): Promise<boolean> {
    return callApiMethod('saveMailboxConfigs', configs) as Promise<boolean>;
  },
  listMailboxes(config: MailboxConfig): Promise<MailboxMap> {
    return callApiMethod('listMailboxes', config) as Promise<MailboxMap>;
  },
  saveConfig(config: MailboxConfig): Promise<boolean> {
    return callApiMethod('saveConfig', config) as Promise<boolean>;
  },
  clearConfig(): Promise<boolean> {
    return callApiMethod('clearConfig') as Promise<boolean>;
  },
  fetchFolderEmails(
    mailboxConfig: MailboxConfig,
    folderKey: string,
    mailboxMap: MailboxMap,
    options?: FolderEmailsOptions
  ): Promise<FolderEmailsResponse | EmailListItem[]> {
    return callApiMethod(
      'fetchFolderEmails',
      mailboxConfig,
      folderKey,
      mailboxMap,
      options
    ) as Promise<FolderEmailsResponse | EmailListItem[]>;
  },
  fetchFolderUnreadCount(
    mailboxConfig: MailboxConfig,
    folderKey: string,
    mailboxMap: MailboxMap
  ): Promise<number> {
    return callApiMethod('fetchFolderUnreadCount', mailboxConfig, folderKey, mailboxMap) as Promise<number>;
  },
  fetchFolderEmail(
    mailboxConfig: MailboxConfig,
    folderKey: string,
    uid: number | string,
    mailboxMap: MailboxMap
  ): Promise<EmailListItem> {
    return callApiMethod('fetchFolderEmail', mailboxConfig, folderKey, uid, mailboxMap) as Promise<EmailListItem>;
  },
  sendMail(mailboxConfig: MailboxConfig, payload: SendMailPayload): Promise<SendMailResult> {
    return callApiMethod('sendMail', mailboxConfig, payload) as Promise<SendMailResult>;
  },
  moveFolderEmail(
    mailboxConfig: MailboxConfig,
    sourceFolderKey: string,
    uid: number | string,
    mailboxMap: MailboxMap,
    targetFolderKey: string
  ): Promise<boolean> {
    return callApiMethod(
      'moveFolderEmail',
      mailboxConfig,
      sourceFolderKey,
      uid,
      mailboxMap,
      targetFolderKey
    ) as Promise<boolean>;
  },
  onOpenSettings(handler: () => void): (() => void) | undefined {
    const api = window.electronAPI;
    if (!api || typeof api.onOpenSettings !== 'function') return undefined;
    return api.onOpenSettings(handler);
  },
};
