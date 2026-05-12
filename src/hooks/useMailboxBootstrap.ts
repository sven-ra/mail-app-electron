import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { FOLDERS, LAST_SELECTED_FOLDER_KEY, LAST_SELECTED_MAILBOX_ID_KEY, mailboxToFormConfig } from '../mail/constants';
import { getMailboxId } from '../mail/threading';
import { mailApi } from '../services/mailApi';
import type { FolderKey, MailboxConfig } from '../types/mail';

type UseMailboxBootstrapArgs = {
  validFolderKeys: Set<string>;
  setConfig: Dispatch<SetStateAction<MailboxConfig>>;
  setMailboxes: Dispatch<SetStateAction<MailboxConfig[]>>;
  setSelectedMailboxId: Dispatch<SetStateAction<string | null>>;
  setSelectedFolder: Dispatch<SetStateAction<FolderKey>>;
  setLoggedIn: Dispatch<SetStateAction<boolean>>;
  refreshMailboxFolderCounts: (mailbox: MailboxConfig, folderKeys?: FolderKey[]) => Promise<void>;
  loadFolder: (
    mailboxId: string,
    folderKey: FolderKey,
    mailboxOverride?: MailboxConfig[],
    options?: {
      resetSelection?: boolean;
      restoreSelectionFromStorage?: boolean;
      showLoadedStatus?: boolean;
    }
  ) => Promise<void>;
  setStatus: Dispatch<SetStateAction<string>>;
};

export function useMailboxBootstrap({
  validFolderKeys,
  setConfig,
  setMailboxes,
  setSelectedMailboxId,
  setSelectedFolder,
  setLoggedIn,
  refreshMailboxFolderCounts,
  loadFolder,
  setStatus,
}: UseMailboxBootstrapArgs): void {
  const actionsRef = useRef({
    setConfig,
    setMailboxes,
    setSelectedMailboxId,
    setSelectedFolder,
    setLoggedIn,
    refreshMailboxFolderCounts,
    loadFolder,
    setStatus,
  });

  actionsRef.current = {
    setConfig,
    setMailboxes,
    setSelectedMailboxId,
    setSelectedFolder,
    setLoggedIn,
    refreshMailboxFolderCounts,
    loadFolder,
    setStatus,
  };

  useEffect(() => {
    let active = true;

    async function loadConfigs() {
      const latestActions = actionsRef.current;

      try {
        const storedConfigs = await mailApi.getMailboxConfigs();
        let nextMailboxes = storedConfigs || [];

        if (!nextMailboxes.length) {
          const saved = await mailApi.getConfig();
          if (saved.host && saved.username && saved.password) {
            nextMailboxes = [saved];
          } else if (active) {
            latestActions.setConfig(mailboxToFormConfig(saved));
          }
        }

        if (!nextMailboxes.length || !active) return;

        const resolvedMailboxes = await Promise.all(
          nextMailboxes.map(async (mailboxConfig) => {
            const mailboxMap = mailboxConfig.mailboxMap || (await mailApi.listMailboxes(mailboxConfig));
            return { ...mailboxConfig, mailboxMap, id: getMailboxId(mailboxConfig) };
          })
        );

        if (!active) return;

        latestActions.setMailboxes(resolvedMailboxes);
        await mailApi.saveMailboxConfigs(resolvedMailboxes);

        const savedMailboxId = localStorage.getItem(LAST_SELECTED_MAILBOX_ID_KEY);
        const savedFolder = localStorage.getItem(LAST_SELECTED_FOLDER_KEY);
        const initialMailbox =
          resolvedMailboxes.find((mailbox) => mailbox.id === savedMailboxId) || resolvedMailboxes[0];
        const initialFolder = (validFolderKeys.has(savedFolder || '') ? savedFolder : FOLDERS[0].key) as FolderKey;

        latestActions.setSelectedMailboxId(initialMailbox.id);
        latestActions.setSelectedFolder(initialFolder);
        latestActions.setLoggedIn(true);

        await Promise.all(
          resolvedMailboxes.map((mailbox) =>
            latestActions.refreshMailboxFolderCounts(mailbox).catch(() => undefined)
          )
        );

        await latestActions.loadFolder(initialMailbox.id, initialFolder, resolvedMailboxes);
      } catch (error) {
        if (!active) return;
        latestActions.setStatus('Error loading config: ' + (error as Error).message);
      }
    }

    loadConfigs();

    return () => {
      active = false;
    };
  }, [validFolderKeys]);
}
