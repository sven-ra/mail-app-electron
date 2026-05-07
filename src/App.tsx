import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEvent } from 'react-use';
import LoginForm from './components/LoginForm';
import InboxPanel from './components/InboxPanel';
import EmailContentView from './components/EmailContentView';
import MailboxFolderSidebar from './components/MailboxFolderSidebar';
import SettingsScreen from './components/SettingsScreen';
import './styles/main.css';
import styles from './App.module.css';
import {
  ALL_MAILBOXES_ID,
  EMAIL_PAGE_SIZE,
  EMPTY_CONFIG,
  FOLDER_COUNT_KEYS,
  FOLDERS,
  LAST_SELECTED_FOLDER_KEY,
  LAST_SELECTED_MAILBOX_ID_KEY,
  getFolderUidStorageKey,
} from './mail/constants';
import {
  buildConversationIndex,
  compareEmailsByRecency,
  getFolderEmailResult,
  getMailboxId,
  groupEmailsByThread,
  isEmailRelatedToConversation,
  withMailboxEmailMeta,
} from './mail/threading';
import { mailApi } from './services/mailApi';
import { useFolderPolling } from './hooks/useFolderPolling';
import { useInboxResize } from './hooks/useInboxResize';
import { useMailboxBootstrap } from './hooks/useMailboxBootstrap';
import { useThemeMode } from './hooks/useThemeMode';
import type {
  EmailListItem,
  FolderCountsByMailbox,
  FolderKey,
  InboxPaginationState,
  MailboxConfig,
  SelectedEmailState,
} from './types/mail';

type PageType = 'inbox' | 'settings';

type LoadFolderOptions = {
  resetSelection?: boolean;
  restoreSelectionFromStorage?: boolean;
  showLoadedStatus?: boolean;
};

function App() {
  const [config, setConfig] = useState<MailboxConfig>(EMPTY_CONFIG);
  const [mailboxes, setMailboxes] = useState<MailboxConfig[]>([]);
  const [selectedMailboxId, setSelectedMailboxId] = useState<string | null>(null);
  const [emails, setEmails] = useState<EmailListItem[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<SelectedEmailState>(null);
  const [selectedEmailUid, setSelectedEmailUid] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<FolderKey>(FOLDERS[0].key);
  const [currentPage, setCurrentPage] = useState<PageType>('inbox');
  const [folderCountsByMailbox, setFolderCountsByMailbox] = useState<FolderCountsByMailbox>({});
  const [selectedSettingsMailboxId, setSelectedSettingsMailboxId] = useState<string | null>(null);
  const [inboxPagination, setInboxPagination] = useState<InboxPaginationState>({
    hasMore: false,
    isLoadingMore: false,
  });

  const selectedFolderRef = useRef<{ mailboxId: string | null; folderKey: FolderKey }>({
    mailboxId: null,
    folderKey: FOLDERS[0].key,
  });
  const isLoadingMoreRef = useRef(false);
  const loadedEmailLimitRef = useRef(EMAIL_PAGE_SIZE);

  const { isResizingInbox, handleStartInboxResize, layoutColumnStyle } = useInboxResize();
  const { toggleThemeMode } = useThemeMode();

  const threadGroups = useMemo(() => groupEmailsByThread(emails), [emails]);
  const validFolderKeys = useMemo(() => new Set(FOLDERS.map((folder) => folder.key)), []);
  const allFolderCount = useMemo(() => {
    const allMailboxesFolderKey = FOLDERS[0].key;
    if (!FOLDER_COUNT_KEYS.includes(allMailboxesFolderKey)) return 0;
    return mailboxes.reduce((total, mailbox) => {
      const count = folderCountsByMailbox[mailbox.id]?.[allMailboxesFolderKey];
      if (!Number.isFinite(count)) return total;
      return total + count;
    }, 0);
  }, [folderCountsByMailbox, mailboxes]);

  useEffect(() => {
    selectedFolderRef.current = { mailboxId: selectedMailboxId, folderKey: selectedFolder };
  }, [selectedMailboxId, selectedFolder]);

  useEffect(() => {
    const unsubscribe = mailApi.onOpenSettings(() => {
      handleOpenSettings();
    });
    return unsubscribe;
  }, [selectedMailboxId, mailboxes]);

  useEvent('keydown', (event) => {
    if (event.key === 'Escape' && loggedIn && currentPage === 'settings') {
      handleOpenInbox();
      return;
    }
    if (!event.shiftKey) return;
    if (event.key !== 'm' && event.key !== 'M') return;
    toggleThemeMode();
  });

  async function persistMailboxes(nextMailboxes: MailboxConfig[]): Promise<void> {
    setMailboxes(nextMailboxes);
    await mailApi.saveMailboxConfigs(nextMailboxes);
  }

  async function refreshMailboxFolderCounts(
    mailbox: MailboxConfig,
    folderKeys: FolderKey[] = FOLDER_COUNT_KEYS
  ): Promise<void> {
    const nextEntries = await Promise.all(
      folderKeys.map(async (folderKey) => {
        const unreadCount = await mailApi.fetchFolderUnreadCount(
          mailbox,
          folderKey,
          mailbox.mailboxMap || {}
        );
        return [folderKey, unreadCount];
      })
    );

    setFolderCountsByMailbox((current) => ({
      ...current,
      [mailbox.id]: {
        ...(current[mailbox.id] || {}),
        ...Object.fromEntries(nextEntries),
      },
    }));
  }

  async function handleAddMailbox(loginConfig: MailboxConfig): Promise<void> {
    if (!loginConfig.host || !loginConfig.username || !loginConfig.password) {
      setStatus('Please fill in all fields.');
      return;
    }

    try {
      await mailApi.saveConfig(loginConfig);
      setStatus('Connecting to IMAP...');

      const nextMailboxMap = await mailApi.listMailboxes(loginConfig);
      const nextMailbox = {
        ...loginConfig,
        mailboxMap: nextMailboxMap || {},
        id: getMailboxId(loginConfig),
      };
      const deduped = mailboxes.filter((mailbox) => mailbox.id !== nextMailbox.id);
      const nextMailboxes = [...deduped, nextMailbox];
      await persistMailboxes(nextMailboxes);
      setSelectedMailboxId(nextMailbox.id);
      setSelectedFolder(FOLDERS[0].key);
      await refreshMailboxFolderCounts(nextMailbox);
      await loadFolder(nextMailbox.id, FOLDERS[0].key, nextMailboxes);
      setLoggedIn(true);
      setCurrentPage('inbox');
      setConfig(EMPTY_CONFIG);
    } catch (error) {
      setStatus('Error: ' + (error as Error).message);
    }
  }

  async function handleLogout(): Promise<void> {
    try {
      const mailboxIds = mailboxes.map((mailbox) => mailbox.id);
      await mailApi.clearConfig();
      setConfig(EMPTY_CONFIG);
      setMailboxes([]);
      setSelectedMailboxId(null);
      setEmails([]);
      setSelectedEmail(null);
      setInboxPagination({ hasMore: false, isLoadingMore: false });
      isLoadingMoreRef.current = false;
      loadedEmailLimitRef.current = EMAIL_PAGE_SIZE;
      setFolderCountsByMailbox({});
      localStorage.removeItem(LAST_SELECTED_MAILBOX_ID_KEY);
      localStorage.removeItem(LAST_SELECTED_FOLDER_KEY);
      mailboxIds.forEach((mailboxId) => {
        FOLDERS.forEach((folder) => {
          localStorage.removeItem(getFolderUidStorageKey(mailboxId, folder.key));
        });
      });
      setStatus('Logged out.');
      setLoggedIn(false);
      setCurrentPage('inbox');
    } catch (error) {
      setStatus('Error: ' + (error as Error).message);
    }
  }

  async function loadFolder(
    mailboxId: string,
    folderKey: FolderKey,
    mailboxOverride?: MailboxConfig[],
    options: LoadFolderOptions = {}
  ): Promise<void> {
    const { resetSelection = true, restoreSelectionFromStorage = true, showLoadedStatus = true } =
      options;
    const sourceMailboxes = mailboxOverride || mailboxes;
    const requestedFolderKey = mailboxId === ALL_MAILBOXES_ID ? FOLDERS[0].key : folderKey;
    const folderLabel =
      FOLDERS.find((folder) => folder.key === requestedFolderKey)?.label || requestedFolderKey;

    setStatus(`Loading ${folderLabel}...`);
    if (resetSelection) {
      setSelectedEmail(null);
      setSelectedEmailUid(null);
    }

    const requestedLimit = resetSelection
      ? EMAIL_PAGE_SIZE
      : Math.max(EMAIL_PAGE_SIZE, loadedEmailLimitRef.current);
    const isAllMailboxes = mailboxId === ALL_MAILBOXES_ID;
    const mailbox = sourceMailboxes.find((item) => item.id === mailboxId);
    if (!isAllMailboxes && !mailbox) {
      throw new Error('Mailbox not found');
    }

    let sortedEmails: EmailListItem[] = [];
    let hasMore = false;

    if (isAllMailboxes) {
      const allResults = await Promise.all(
        sourceMailboxes.map(async (item: MailboxConfig) => {
          const folderResult = getFolderEmailResult(
            await mailApi.fetchFolderEmails(item, requestedFolderKey, item.mailboxMap || {}, {
              limit: requestedLimit,
            })
          );
          const requestedFolderEmails = folderResult.emails.map((email) => ({
            ...withMailboxEmailMeta(email, item.id, requestedFolderKey),
            isThreadInjectedFromSent: false,
          }));
          let mergedEmails = requestedFolderEmails;
          if (requestedFolderKey === 'inbox') {
            try {
              const sentResult = getFolderEmailResult(
                await mailApi.fetchFolderEmails(item, 'sent', item.mailboxMap || {}, {
                  limit: requestedLimit,
                })
              );
              const conversationIndex = buildConversationIndex(folderResult.emails);
              const relatedSentEmails = sentResult.emails
                .filter((email) => isEmailRelatedToConversation(email, conversationIndex))
                .map((email) => ({
                  ...withMailboxEmailMeta(email, item.id, 'sent'),
                  isThreadInjectedFromSent: true,
                }));
              mergedEmails = [...requestedFolderEmails, ...relatedSentEmails];
            } catch {
              mergedEmails = requestedFolderEmails;
            }
          }
          return {
            mailboxId: item.id,
            hasMore: folderResult.hasMore,
            emails: mergedEmails,
          };
        })
      );
      sortedEmails = allResults
        .flatMap((result) => result.emails)
        .sort((a, b) => Number(b.uid || 0) - Number(a.uid || 0));
      hasMore = false;
    } else {
      const folderResult = getFolderEmailResult(
        await mailApi.fetchFolderEmails(mailbox, requestedFolderKey, mailbox.mailboxMap || {}, {
          limit: requestedLimit,
        })
      );
      const requestedFolderEmails = folderResult.emails.map((email) => ({
        ...withMailboxEmailMeta(email, mailbox.id, requestedFolderKey),
        isThreadInjectedFromSent: false,
      }));

      if (requestedFolderKey === 'inbox') {
        let relatedSentEmails: EmailListItem[] = [];
        try {
          const sentResult = getFolderEmailResult(
            await mailApi.fetchFolderEmails(mailbox, 'sent', mailbox.mailboxMap || {}, {
              limit: requestedLimit,
            })
          );
          const inboxConversationIndex = buildConversationIndex(folderResult.emails);
          relatedSentEmails = sentResult.emails
            .filter((email) => isEmailRelatedToConversation(email, inboxConversationIndex))
            .map((email) => ({
              ...withMailboxEmailMeta(email, mailbox.id, 'sent'),
              isThreadInjectedFromSent: true,
            }));
        } catch {
          relatedSentEmails = [];
        }

        sortedEmails = [...requestedFolderEmails, ...relatedSentEmails].sort(compareEmailsByRecency);
      } else {
        sortedEmails = requestedFolderEmails.slice().sort(compareEmailsByRecency);
      }
      hasMore = folderResult.hasMore;
      if (FOLDER_COUNT_KEYS.includes(requestedFolderKey)) {
        const unreadCount = await mailApi.fetchFolderUnreadCount(
          mailbox,
          requestedFolderKey,
          mailbox.mailboxMap || {}
        );
        setFolderCountsByMailbox((current) => ({
          ...current,
          [mailbox.id]: {
            ...(current[mailbox.id] || {}),
            [requestedFolderKey]: unreadCount,
          },
        }));
      }
    }

    setEmails(sortedEmails);
    loadedEmailLimitRef.current = Math.max(EMAIL_PAGE_SIZE, sortedEmails.length);
    isLoadingMoreRef.current = false;
    setInboxPagination({ hasMore, isLoadingMore: false });

    if (restoreSelectionFromStorage && !isAllMailboxes) {
      const storageKey = getFolderUidStorageKey(mailbox.id, requestedFolderKey);
      const savedUid = localStorage.getItem(storageKey);

      if (savedUid) {
        const matchingEmail = sortedEmails.find(
          (email) => email.mailboxId === mailbox.id && String(email.uid) === savedUid
        );
        if (matchingEmail) {
          await handleSelectEmail(matchingEmail, mailbox, folderKey);
          return;
        }
        localStorage.removeItem(storageKey);
      }
    }

    if (showLoadedStatus) {
      setStatus(`Loaded ${sortedEmails.length} emails from ${folderLabel}.`);
    }
  }

  async function handleLoadMoreEmails(): Promise<void> {
    if (selectedMailboxId === ALL_MAILBOXES_ID) return;
    if (isLoadingMoreRef.current || !inboxPagination.hasMore) return;

    const mailboxId = selectedMailboxId;
    const folderKey = selectedFolder;
    const mailbox = mailboxes.find((item) => item.id === mailboxId);
    if (!mailbox) return;

    const oldestUid = emails.reduce((oldest, email) => {
      const uid = Number(email.uid);
      if (!Number.isFinite(uid)) return oldest;
      if (!oldest) return uid;
      return Math.min(oldest, uid);
    }, 0);

    if (!oldestUid) {
      setInboxPagination({ hasMore: false, isLoadingMore: false });
      return;
    }

    isLoadingMoreRef.current = true;
    setInboxPagination((current) => ({ ...current, isLoadingMore: true }));

    try {
      const folderResult = getFolderEmailResult(
        await mailApi.fetchFolderEmails(mailbox, folderKey, mailbox.mailboxMap || {}, {
          limit: EMAIL_PAGE_SIZE,
          beforeUid: oldestUid,
        })
      );
      const selectedFolderSnapshot = selectedFolderRef.current;
      if (
        selectedFolderSnapshot.mailboxId !== mailboxId ||
        selectedFolderSnapshot.folderKey !== folderKey
      ) {
        isLoadingMoreRef.current = false;
        return;
      }

      setEmails((currentEmails: EmailListItem[]) => {
        const emailsByUid = new Map(
          currentEmails.map((email) => [String(email.selectionUid || email.uid), email])
        );
        folderResult.emails.forEach((email) => {
          const withMeta = withMailboxEmailMeta(email, mailbox.id, folderKey);
          emailsByUid.set(String(withMeta.selectionUid || withMeta.uid), {
            ...withMeta,
            isThreadInjectedFromSent: false,
          });
        });
        const nextEmails = Array.from(emailsByUid.values()).sort(compareEmailsByRecency);
        loadedEmailLimitRef.current = Math.max(EMAIL_PAGE_SIZE, nextEmails.length);
        return nextEmails;
      });
      setInboxPagination({ hasMore: folderResult.hasMore, isLoadingMore: false });
      isLoadingMoreRef.current = false;
    } catch (error) {
      const selectedFolderSnapshot = selectedFolderRef.current;
      if (
        selectedFolderSnapshot.mailboxId === mailboxId &&
        selectedFolderSnapshot.folderKey === folderKey
      ) {
        setStatus('Error: ' + (error as Error).message);
        setInboxPagination((current) => ({ ...current, isLoadingMore: false }));
        isLoadingMoreRef.current = false;
      }
    }
  }

  async function handleSelectFolder(mailboxId: string, folderKey: FolderKey): Promise<void> {
    setSelectedMailboxId(mailboxId);
    setSelectedFolder(folderKey);
    localStorage.setItem(LAST_SELECTED_MAILBOX_ID_KEY, mailboxId);
    localStorage.setItem(LAST_SELECTED_FOLDER_KEY, folderKey);

    try {
      await loadFolder(mailboxId, folderKey);
    } catch (error) {
      setEmails([]);
      setSelectedEmail(null);
      setStatus('Error: ' + (error as Error).message);
    }
  }

  async function handleSelectAllMailboxes(): Promise<void> {
    if (!mailboxes.length) return;
    const inboxFolderKey = FOLDERS[0].key;
    setSelectedMailboxId(ALL_MAILBOXES_ID);
    setSelectedFolder(inboxFolderKey);
    localStorage.setItem(LAST_SELECTED_FOLDER_KEY, inboxFolderKey);

    try {
      await loadFolder(ALL_MAILBOXES_ID, inboxFolderKey);
    } catch (error) {
      setEmails([]);
      setSelectedEmail(null);
      setStatus('Error: ' + (error as Error).message);
    }
  }

  async function handleSelectEmail(
    email: EmailListItem,
    mailboxOverride?: MailboxConfig | null,
    folderKeyOverride?: FolderKey
  ): Promise<void> {
    const mailboxId = email.mailboxId || selectedMailboxId;
    const mailbox = mailboxOverride || mailboxes.find((item) => item.id === mailboxId) || null;
    if (!mailbox) {
      setSelectedEmail({ error: 'Error: mailbox is not selected.' });
      return;
    }

    if (!email.uid) {
      localStorage.removeItem(getFolderUidStorageKey(mailbox.id, folderKeyOverride || selectedFolder));
      setSelectedEmailUid(null);
      setSelectedEmail({ error: 'Error: no UID available for this email.' });
      return;
    }

    setStatus('Fetching email content...');
    setSelectedEmailUid(email.selectionUid || String(email.uid));
    setSelectedEmail({ loading: true });

    try {
      const folderKey = (folderKeyOverride || email.folderKey || selectedFolder) as FolderKey;
      const content = await mailApi.fetchFolderEmail(
        mailbox,
        folderKey,
        email.uid,
        mailbox.mailboxMap || {}
      );
      setSelectedEmail({
        ...content,
        folderKey,
        mailboxId: mailbox.id,
        selectionUid: email.selectionUid || String(email.uid),
        isThreadInjectedFromSent: Boolean(email.isThreadInjectedFromSent),
      });
      localStorage.setItem(getFolderUidStorageKey(mailbox.id, folderKey), String(email.uid));
      setStatus('Email loaded.');
    } catch (error) {
      setSelectedEmail({ error: 'Error loading email: ' + (error as Error).message });
      setStatus('Error loading email.');
    }
  }

  function handleConfigChange(field: keyof MailboxConfig, value: string): void {
    setConfig((current) => ({ ...current, [field]: value }));
  }

  function handleSelectSettingsMailbox(mailbox: MailboxConfig): void {
    setSelectedSettingsMailboxId(mailbox.id);
    setConfig({
      host: mailbox.host || '',
      username: mailbox.username || '',
      password: mailbox.password || '',
    });
  }

  async function handleOpenInbox(mailboxId?: string, folderKey?: FolderKey): Promise<void> {
    setCurrentPage('inbox');
    try {
      if (mailboxId && folderKey) {
        await handleSelectFolder(mailboxId, folderKey);
        return;
      }

      if (selectedMailboxId) {
        await handleSelectFolder(selectedMailboxId, selectedFolder);
        return;
      }

      if (mailboxes.length) {
        const savedMailboxId = localStorage.getItem(LAST_SELECTED_MAILBOX_ID_KEY);
        const savedFolder = localStorage.getItem(LAST_SELECTED_FOLDER_KEY);
        const fallbackMailbox =
          mailboxes.find((mailbox) => mailbox.id === savedMailboxId) || mailboxes[0];
        const fallbackFolder = (validFolderKeys.has((savedFolder || '') as FolderKey)
          ? savedFolder
          : FOLDERS[0].key) as FolderKey;
        await handleSelectFolder(fallbackMailbox.id, fallbackFolder);
      }
    } catch (error) {
      setStatus('Error: ' + (error as Error).message);
    }
  }

  function handleOpenSettings() {
    setCurrentPage('settings');
    if (!selectedMailboxId) return;
    const mailbox = mailboxes.find((item) => item.id === selectedMailboxId);
    if (!mailbox) return;
    handleSelectSettingsMailbox(mailbox);
  }

  async function handleRemoveMailbox(mailboxId: string): Promise<void> {
    const nextMailboxes = mailboxes.filter((mailbox) => mailbox.id !== mailboxId);
    await persistMailboxes(nextMailboxes);

    setFolderCountsByMailbox((current) => {
      const next = { ...current };
      delete next[mailboxId];
      return next;
    });

    FOLDERS.forEach((folder) => {
      localStorage.removeItem(getFolderUidStorageKey(mailboxId, folder.key));
    });

    const removedSelectedInbox = selectedMailboxId === mailboxId;
    const nextSelectedSettingsMailbox = nextMailboxes[0] || null;
    setSelectedSettingsMailboxId(nextSelectedSettingsMailbox ? nextSelectedSettingsMailbox.id : null);
    setConfig({
      host: nextSelectedSettingsMailbox?.host || '',
      username: nextSelectedSettingsMailbox?.username || '',
      password: nextSelectedSettingsMailbox?.password || '',
    });

    if (!removedSelectedInbox) {
      setStatus('Mailbox removed.');
      return;
    }

    if (!nextSelectedSettingsMailbox) {
      setSelectedMailboxId(null);
      setEmails([]);
      setSelectedEmail(null);
      setSelectedEmailUid(null);
      localStorage.removeItem(LAST_SELECTED_MAILBOX_ID_KEY);
      localStorage.removeItem(LAST_SELECTED_FOLDER_KEY);
      setStatus('Mailbox removed.');
      return;
    }

    const nextMailboxId = nextSelectedSettingsMailbox.id;
    const nextFolderKey = (validFolderKeys.has(selectedFolder) ? selectedFolder : FOLDERS[0].key) as FolderKey;
    setSelectedMailboxId(nextMailboxId);
    localStorage.setItem(LAST_SELECTED_MAILBOX_ID_KEY, nextMailboxId);
    localStorage.setItem(LAST_SELECTED_FOLDER_KEY, nextFolderKey);
    if (currentPage === 'inbox') {
      await handleSelectFolder(nextMailboxId, nextFolderKey);
    } else {
      setStatus('Mailbox removed.');
    }
  }

  useMailboxBootstrap({
    validFolderKeys,
    setConfig,
    setMailboxes,
    setSelectedMailboxId,
    setSelectedFolder,
    setLoggedIn,
    refreshMailboxFolderCounts,
    loadFolder,
    setStatus,
  });

  useFolderPolling({
    enabled: loggedIn && currentPage === 'inbox',
    selectedMailboxId,
    selectedFolder,
    mailboxes,
    onPoll: () =>
      loadFolder(selectedMailboxId, selectedFolder, undefined, {
        resetSelection: false,
        restoreSelectionFromStorage: false,
        showLoadedStatus: false,
      }),
    onError: (error) => {
      setStatus('Error: ' + error.message);
    },
  });

  return (
    <div className={styles.app}>
      {!loggedIn && (
        <LoginForm
          config={config}
          onConfigChange={handleConfigChange}
          onConnect={() => handleAddMailbox(config)}
        />
      )}

      <div className={styles.status}>{status}</div>

      {loggedIn && currentPage === 'inbox' && (
        <main className={`${styles.mainLayout} ${isResizingInbox ? styles.mainLayoutResizing : ''}`} style={layoutColumnStyle}>
          <MailboxFolderSidebar
            mailboxes={mailboxes}
            selectedMailboxId={selectedMailboxId}
            selectedFolder={selectedFolder}
            folderCountsByMailbox={folderCountsByMailbox}
            allFolderCount={allFolderCount}
            folderCountKeys={FOLDER_COUNT_KEYS}
            folders={FOLDERS}
            allMailboxesId={ALL_MAILBOXES_ID}
            onSelectAllMailboxes={handleSelectAllMailboxes}
            onSelectFolder={handleSelectFolder}
          />
          <InboxPanel
            title={FOLDERS.find((folder) => folder.key === selectedFolder)?.label || 'INBOX'}
            threadGroups={threadGroups}
            selectedEmailUid={selectedEmailUid}
            onSelectEmail={handleSelectEmail}
            onLoadMore={handleLoadMoreEmails}
            isLoadingMore={inboxPagination.isLoadingMore}
          />
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize list column"
            className={styles.columnResizer}
            onPointerDown={handleStartInboxResize}
          />
          <section className={styles.contentSection}>
            <EmailContentView email={selectedEmail} />
          </section>
        </main>
      )}

      {loggedIn && currentPage === 'settings' && (
        <SettingsScreen
          config={config}
          onConfigChange={handleConfigChange}
          onAddMailbox={() => handleAddMailbox(config)}
          onCloseSettings={() => handleOpenInbox()}
          mailboxes={mailboxes}
          selectedSettingsMailboxId={selectedSettingsMailboxId}
          onSelectSettingsMailbox={handleSelectSettingsMailbox}
          onRemoveMailbox={handleRemoveMailbox}
        />
      )}
    </div>
  );
}

export default App;
