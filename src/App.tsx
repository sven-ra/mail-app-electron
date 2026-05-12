import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEvent } from 'react-use';
import LoginForm from './components/login-form';
import InboxPanel from './components/inbox-panel';
import EmailContentView from './components/email-content-view';
import MailboxFolderSidebar from './components/mailbox-folder-sidebar';
import SettingsScreen from './components/settings-screen';
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
  mailboxToFormConfig,
} from './mail/constants';
import {
  buildConversationIndex,
  compareEmailsByRecency,
  getFolderEmailResult,
  getMailboxId,
  groupEmailsByThread,
  isEmailRelatedToConversation,
  pickNeighborEmailForMove,
  withMailboxEmailMeta,
} from './mail/threading';
import {
  buildForwardCompose,
  buildReplyAllCompose,
  buildReplyCompose,
  referencesForSend,
} from './mail/composeHelpers';
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
  LoadedEmailContent,
  MailboxConfig,
  OutboundAttachmentInput,
  SelectedEmailState,
  SendMailPayload,
} from './types/mail';

type PageType = 'inbox' | 'settings';

type LoadFolderOptions = {
  resetSelection?: boolean;
  restoreSelectionFromStorage?: boolean;
  showLoadedStatus?: boolean;
};

const COMPOSE_INITIAL = {
  to: '',
  cc: '',
  subject: '',
  inReplyTo: '',
  references: [] as string[],
};

type ComposeState = typeof COMPOSE_INITIAL;

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
  const [compose, setCompose] = useState<ComposeState>({ ...COMPOSE_INITIAL });
  const [composeBodyResetKey, setComposeBodyResetKey] = useState(0);
  const [composeInitialBodyHtml, setComposeInitialBodyHtml] = useState('<p></p>');
  const [composeAttachments, setComposeAttachments] = useState<{ id: string; file: File }[]>([]);

  const selectedFolderRef = useRef<{ mailboxId: string | null; folderKey: FolderKey }>({
    mailboxId: null,
    folderKey: FOLDERS[0].key,
  });
  const isLoadingMoreRef = useRef(false);
  const loadedEmailLimitRef = useRef(EMAIL_PAGE_SIZE);
  const emailsCacheRef = useRef<Map<string, EmailListItem[]>>(new Map());

  function getEmailCacheKey(mailboxId: string, folderKey: string): string {
    return `${mailboxId}:${folderKey}`;
  }

  function invalidateEmailCache(mailboxId: string, folderKey?: string): void {
    const cache = emailsCacheRef.current;
    if (folderKey) {
      cache.delete(getEmailCacheKey(mailboxId, folderKey));
      cache.delete(getEmailCacheKey(ALL_MAILBOXES_ID, folderKey));
      return;
    }
    Array.from(cache.keys()).forEach((key) => {
      if (key.startsWith(`${mailboxId}:`) || key.startsWith(`${ALL_MAILBOXES_ID}:`)) {
        cache.delete(key);
      }
    });
  }

  const { isResizingInbox, handleStartInboxResize, layoutColumnStyle } = useInboxResize();
  const { toggleThemeMode } = useThemeMode();

  const threadGroups = useMemo(() => groupEmailsByThread(emails), [emails]);
  const validFolderKeys = useMemo(() => new Set(FOLDERS.map((folder) => folder.key)), []);
  const mailboxUsernameById = useMemo(
    () => Object.fromEntries(mailboxes.map((mailbox) => [mailbox.id, mailbox.username])),
    [mailboxes]
  );
  const contentMailbox = useMemo(() => {
    if (!selectedEmail || selectedEmail.loading || selectedEmail.error) return null;
    const loaded = selectedEmail as LoadedEmailContent;
    const id =
      loaded.mailboxId ||
      (selectedMailboxId && selectedMailboxId !== ALL_MAILBOXES_ID ? selectedMailboxId : null);
    if (!id) return null;
    return mailboxes.find((mailbox) => mailbox.id === id) || null;
  }, [selectedEmail, selectedMailboxId, mailboxes]);
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
    const count = loggedIn ? Math.max(0, Math.floor(allFolderCount)) : 0;
    void mailApi.setUnreadBadgeCount(count);
  }, [allFolderCount, loggedIn]);

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
      setSelectedEmailUid(null);
      setCompose({ ...COMPOSE_INITIAL });
      setComposeAttachments([]);
      setInboxPagination({ hasMore: false, isLoadingMore: false });
      isLoadingMoreRef.current = false;
      loadedEmailLimitRef.current = EMAIL_PAGE_SIZE;
      emailsCacheRef.current.clear();
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

  async function mergeSentIntoInboxList(
    cacheKey: string,
    targetSelectionMailboxId: string,
    mailboxesToMergeFrom: MailboxConfig[],
    baseEmails: EmailListItem[],
    requestedLimit: number
  ): Promise<void> {
    try {
      const sentResults = await Promise.all(
        mailboxesToMergeFrom.map(async (item) => {
          try {
            const result = getFolderEmailResult(
              await mailApi.fetchFolderEmails(item, 'sent', item.mailboxMap || {}, {
                limit: requestedLimit,
              })
            );
            return { mailbox: item, emails: result.emails };
          } catch {
            return { mailbox: item, emails: [] };
          }
        })
      );

      const sentInjected: EmailListItem[] = [];
      sentResults.forEach(({ mailbox: item, emails }) => {
        const inboxForMailbox = baseEmails.filter((email) => email.mailboxId === item.id);
        const conversationIndex = buildConversationIndex(inboxForMailbox);
        emails
          .filter((email) => isEmailRelatedToConversation(email, conversationIndex))
          .forEach((email) => {
            sentInjected.push({
              ...withMailboxEmailMeta(email, item.id, 'sent'),
              isThreadInjectedFromSent: true,
            });
          });
      });

      if (!sentInjected.length) return;

      const merged = [...baseEmails, ...sentInjected].sort(compareEmailsByRecency);
      emailsCacheRef.current.set(cacheKey, merged);

      const current = selectedFolderRef.current;
      if (current.mailboxId === targetSelectionMailboxId && current.folderKey === 'inbox') {
        setEmails(merged);
        loadedEmailLimitRef.current = Math.max(EMAIL_PAGE_SIZE, merged.length);
      }
    } catch {
      // Background merge failures are non-fatal.
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
    const cacheKey = getEmailCacheKey(mailboxId, requestedFolderKey);
    const cached = emailsCacheRef.current.get(cacheKey);
    const isStillCurrent = (): boolean => {
      const current = selectedFolderRef.current;
      return current.mailboxId === mailboxId && current.folderKey === folderKey;
    };

    if (resetSelection) {
      setSelectedEmail(null);
      setSelectedEmailUid(null);
      if (cached) {
        setEmails(cached);
        loadedEmailLimitRef.current = Math.max(EMAIL_PAGE_SIZE, cached.length);
        if (showLoadedStatus) setStatus(`Refreshing ${folderLabel}...`);
      } else {
        setEmails([]);
        setStatus(`Loading ${folderLabel}...`);
      }
    } else if (showLoadedStatus) {
      setStatus(`Refreshing ${folderLabel}...`);
    }

    const requestedLimit = resetSelection
      ? EMAIL_PAGE_SIZE
      : Math.max(EMAIL_PAGE_SIZE, loadedEmailLimitRef.current);
    const isAllMailboxes = mailboxId === ALL_MAILBOXES_ID;
    const mailbox = sourceMailboxes.find((item) => item.id === mailboxId);
    if (!isAllMailboxes && !mailbox) {
      throw new Error('Mailbox not found');
    }

    let baseEmails: EmailListItem[] = [];
    let hasMore = false;

    if (!isAllMailboxes && mailbox && FOLDER_COUNT_KEYS.includes(requestedFolderKey)) {
      void mailApi
        .fetchFolderUnreadCount(mailbox, requestedFolderKey, mailbox.mailboxMap || {})
        .then((unreadCount) => {
          setFolderCountsByMailbox((current) => ({
            ...current,
            [mailbox.id]: {
              ...(current[mailbox.id] || {}),
              [requestedFolderKey]: unreadCount,
            },
          }));
        })
        .catch(() => undefined);
    }

    if (isAllMailboxes) {
      const allInboxResults = await Promise.all(
        sourceMailboxes.map(async (item: MailboxConfig) => {
          const folderResult = getFolderEmailResult(
            await mailApi.fetchFolderEmails(item, requestedFolderKey, item.mailboxMap || {}, {
              limit: requestedLimit,
            })
          );
          return folderResult.emails.map((email) => ({
            ...withMailboxEmailMeta(email, item.id, requestedFolderKey),
            isThreadInjectedFromSent: false,
          }));
        })
      );
      baseEmails = allInboxResults.flat().sort(compareEmailsByRecency);
      hasMore = false;
    } else if (mailbox) {
      const folderResult = getFolderEmailResult(
        await mailApi.fetchFolderEmails(mailbox, requestedFolderKey, mailbox.mailboxMap || {}, {
          limit: requestedLimit,
        })
      );
      baseEmails = folderResult.emails
        .map((email) => ({
          ...withMailboxEmailMeta(email, mailbox.id, requestedFolderKey),
          isThreadInjectedFromSent: false,
        }))
        .slice()
        .sort(compareEmailsByRecency);
      hasMore = folderResult.hasMore;
    }

    emailsCacheRef.current.set(cacheKey, baseEmails);
    loadedEmailLimitRef.current = Math.max(EMAIL_PAGE_SIZE, baseEmails.length);

    if (isStillCurrent()) {
      setEmails(baseEmails);
      isLoadingMoreRef.current = false;
      setInboxPagination({ hasMore, isLoadingMore: false });
    }

    if (requestedFolderKey === 'inbox') {
      const mailboxesToMergeFrom = isAllMailboxes ? sourceMailboxes : mailbox ? [mailbox] : [];
      if (mailboxesToMergeFrom.length) {
        void mergeSentIntoInboxList(
          cacheKey,
          mailboxId,
          mailboxesToMergeFrom,
          baseEmails,
          requestedLimit
        );
      }
    }

    if (restoreSelectionFromStorage && !isAllMailboxes && mailbox) {
      const storageKey = getFolderUidStorageKey(mailbox.id, requestedFolderKey);
      const savedUid = localStorage.getItem(storageKey);

      if (savedUid) {
        const matchingEmail = baseEmails.find(
          (email) => email.mailboxId === mailbox.id && String(email.uid) === savedUid
        );
        if (matchingEmail) {
          await handleSelectEmail(matchingEmail, mailbox, folderKey);
          return;
        }
        localStorage.removeItem(storageKey);
      }
    }

    if (showLoadedStatus && isStillCurrent()) {
      setStatus(`Loaded ${baseEmails.length} emails from ${folderLabel}.`);
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
        emailsCacheRef.current.set(getEmailCacheKey(mailbox.id, folderKey), nextEmails);
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

  async function handleSelectAllMailboxes(folderKey: FolderKey = FOLDERS[0].key): Promise<void> {
    if (!mailboxes.length) return;
    setSelectedMailboxId(ALL_MAILBOXES_ID);
    setSelectedFolder(folderKey);
    localStorage.setItem(LAST_SELECTED_MAILBOX_ID_KEY, ALL_MAILBOXES_ID);
    localStorage.setItem(LAST_SELECTED_FOLDER_KEY, folderKey);

    try {
      await loadFolder(ALL_MAILBOXES_ID, folderKey);
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
        uid: email.uid,
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

  function bumpComposeBody(html: string): void {
    setComposeInitialBodyHtml(html);
    setComposeBodyResetKey((key) => key + 1);
  }

  useEffect(() => {
    if (selectedEmail === null) {
      setCompose({ ...COMPOSE_INITIAL });
      bumpComposeBody('<p></p>');
      setComposeAttachments([]);
      return;
    }
    if (selectedEmail.loading || selectedEmail.error || !contentMailbox) {
      return;
    }
    const loaded = selectedEmail as LoadedEmailContent;
    const next = buildReplyCompose(loaded);
    setCompose({ ...COMPOSE_INITIAL, ...next });
    bumpComposeBody('<p></p>');
    setComposeAttachments([]);
  }, [selectedEmail, contentMailbox]);

  function handleToolbarReply(): void {
    if (!contentMailbox || !selectedEmail || selectedEmail.loading || selectedEmail.error) return;
    const loaded = selectedEmail as LoadedEmailContent;
    const next = buildReplyCompose(loaded);
    setCompose({ ...COMPOSE_INITIAL, ...next });
    bumpComposeBody('<p></p>');
  }

  function handleToolbarReplyAll(): void {
    if (!contentMailbox || !selectedEmail || selectedEmail.loading || selectedEmail.error) return;
    const loaded = selectedEmail as LoadedEmailContent;
    const next = buildReplyAllCompose(loaded, contentMailbox);
    setCompose({ ...COMPOSE_INITIAL, ...next });
    bumpComposeBody('<p></p>');
  }

  function handleToolbarForward(): void {
    if (!selectedEmail || selectedEmail.loading || selectedEmail.error) return;
    const loaded = selectedEmail as LoadedEmailContent;
    const { initialHtml, ...rest } = buildForwardCompose(loaded);
    setCompose({ ...COMPOSE_INITIAL, ...rest });
    bumpComposeBody(initialHtml);
  }

  function handleComposeFieldChange(field: 'to' | 'cc' | 'subject', value: string): void {
    setCompose((current) => ({ ...current, [field]: value }));
  }

  function handleAddComposeAttachments(files: File[]): void {
    setComposeAttachments((current) => [
      ...current,
      ...files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
      })),
    ]);
  }

  function handleRemoveComposeAttachment(id: string): void {
    setComposeAttachments((current) => current.filter((item) => item.id !== id));
  }

  async function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleComposerSend(body: { html: string; text: string }): Promise<void> {
    if (!contentMailbox) {
      setStatus('No mailbox selected.');
      return;
    }
    const smtpHost = (contentMailbox.smtpHost || '').trim();
    if (!smtpHost) {
      setStatus('SMTP host is not configured. Open settings and set outgoing mail.');
      return;
    }
    if (!compose.to.trim()) {
      setStatus('To is required.');
      return;
    }
    try {
      const attachments: OutboundAttachmentInput[] = await Promise.all(
        composeAttachments.map(async (item) => ({
          filename: item.file.name,
          contentType: item.file.type || 'application/octet-stream',
          contentBase64: await readFileAsBase64(item.file),
        }))
      );
      const payload: SendMailPayload = {
        to: compose.to.trim(),
        cc: compose.cc.trim() || undefined,
        subject: compose.subject,
        text: body.text,
        html: body.html,
        inReplyTo: compose.inReplyTo.trim() || undefined,
        references: compose.references.length ? referencesForSend(compose.references) : undefined,
        attachments: attachments.length ? attachments : undefined,
      };
      const result = await mailApi.sendMail(contentMailbox, payload);
      setComposeAttachments([]);
      setCompose({ ...COMPOSE_INITIAL });
      bumpComposeBody('<p></p>');
      setStatus(result.sentWarning ? `Sent. ${result.sentWarning}` : 'Sent.');
    } catch (error) {
      setStatus('Send failed: ' + (error as Error).message);
    }
  }

  async function handleMessageMove(target: 'archive' | 'bin'): Promise<void> {
    if (!selectedEmail || selectedEmail.loading || selectedEmail.error) return;
    const loaded = selectedEmail as LoadedEmailContent;
    const mailboxId = loaded.mailboxId || (selectedMailboxId !== ALL_MAILBOXES_ID ? selectedMailboxId : null);
    const mailbox = mailboxId ? mailboxes.find((item) => item.id === mailboxId) : null;
    if (!mailbox || !loaded.uid || !loaded.folderKey) return;
    const neighbor = pickNeighborEmailForMove(
      emails,
      loaded,
      mailbox.id,
      selectedMailboxId === ALL_MAILBOXES_ID
    );
    setStatus(target === 'archive' ? 'Archiving…' : 'Moving to Bin…');
    try {
      await mailApi.moveFolderEmail(
        mailbox,
        loaded.folderKey,
        loaded.uid,
        mailbox.mailboxMap || {},
        target
      );
      localStorage.removeItem(getFolderUidStorageKey(mailbox.id, loaded.folderKey));
      invalidateEmailCache(mailbox.id, loaded.folderKey);
      invalidateEmailCache(mailbox.id, target);
      setSelectedEmail(null);
      setSelectedEmailUid(null);
      setStatus(target === 'archive' ? 'Archived.' : 'Moved to Bin.');
      const folderMailboxId = selectedMailboxId === ALL_MAILBOXES_ID ? ALL_MAILBOXES_ID : mailbox.id;
      await loadFolder(folderMailboxId, selectedFolder, undefined, {
        resetSelection: false,
        restoreSelectionFromStorage: false,
        showLoadedStatus: true,
      });
      if (neighbor?.uid != null) {
        const neighborMailbox =
          mailboxes.find((item) => item.id === neighbor.mailboxId) || mailbox;
        const neighborFolder = (neighbor.folderKey || selectedFolder) as FolderKey;
        await handleSelectEmail(neighbor, neighborMailbox, neighborFolder);
      }
    } catch (error) {
      setStatus('Error: ' + (error as Error).message);
    }
  }

  function handleConfigChange(field: keyof MailboxConfig, value: string | boolean): void {
    setConfig((current) => ({ ...current, [field]: value }));
  }

  function handleSelectSettingsMailbox(mailbox: MailboxConfig): void {
    setSelectedSettingsMailboxId(mailbox.id);
    setConfig(mailboxToFormConfig(mailbox));
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
        const fallbackFolder = (validFolderKeys.has((savedFolder || '') as FolderKey)
          ? savedFolder
          : FOLDERS[0].key) as FolderKey;
        if (savedMailboxId === ALL_MAILBOXES_ID) {
          await handleSelectFolder(ALL_MAILBOXES_ID, fallbackFolder);
        } else {
          const fallbackMailbox =
            mailboxes.find((mailbox) => mailbox.id === savedMailboxId) || mailboxes[0];
          await handleSelectFolder(fallbackMailbox.id, fallbackFolder);
        }
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

    invalidateEmailCache(mailboxId);

    FOLDERS.forEach((folder) => {
      localStorage.removeItem(getFolderUidStorageKey(mailboxId, folder.key));
    });

    const removedSelectedInbox = selectedMailboxId === mailboxId;
    const nextSelectedSettingsMailbox = nextMailboxes[0] || null;
    setSelectedSettingsMailboxId(nextSelectedSettingsMailbox ? nextSelectedSettingsMailbox.id : null);
    setConfig(mailboxToFormConfig(nextSelectedSettingsMailbox));

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
            showMailboxAttribution={selectedMailboxId === ALL_MAILBOXES_ID}
            mailboxUsernameById={mailboxUsernameById}
          />
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize list column"
            className={styles.columnResizer}
            onPointerDown={handleStartInboxResize}
          />
          <section className={styles.contentSection}>
            <EmailContentView
              email={selectedEmail}
              mailbox={contentMailbox}
              composeTo={compose.to}
              composeCc={compose.cc}
              composeSubject={compose.subject}
              onComposeChange={handleComposeFieldChange}
              composeBodyResetKey={composeBodyResetKey}
              composeInitialBodyHtml={composeInitialBodyHtml}
              onSend={handleComposerSend}
              attachmentItems={composeAttachments.map((item) => ({ id: item.id, name: item.file.name }))}
              onAddAttachments={handleAddComposeAttachments}
              onRemoveAttachment={handleRemoveComposeAttachment}
              sendDisabled={!(contentMailbox?.smtpHost || '').trim()}
              onReply={handleToolbarReply}
              onReplyAll={handleToolbarReplyAll}
              onForward={handleToolbarForward}
              onArchive={() => handleMessageMove('archive')}
              onDelete={() => handleMessageMove('bin')}
            />
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
