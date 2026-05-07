import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useEvent } from 'react-use';
import LoginForm from './components/LoginForm.jsx';
import InboxPanel from './components/InboxPanel.jsx';
import EmailContent from './components/EmailContent.jsx';
import './styles/main.css';
import styles from './App.module.css';

const EMPTY_CONFIG = { host: '', username: '', password: '' };
const LAST_SELECTED_EMAIL_UID_PREFIX = 'lastSelectedEmailUid:';
const LAST_SELECTED_MAILBOX_ID_KEY = 'lastSelectedMailboxId';
const LAST_SELECTED_FOLDER_KEY = 'lastSelectedFolder';
const INBOX_WIDTH_STORAGE_KEY = 'inboxPanelWidth';
const THEME_STORAGE_KEY = 'themeMode';
const FOLDER_COUNT_KEYS = ['junk', 'drafts', 'bin'];
const FOLDERS = [
  { key: 'inbox', label: 'INBOX' },
  { key: 'drafts', label: 'drafts' },
  { key: 'sent', label: 'sent' },
  { key: 'junk', label: 'junk' },
  { key: 'bin', label: 'bin' },
  { key: 'archive', label: 'archive' },
];

function getMailboxId(config) {
  return `${config.username}:${config.host}`;
}

function getEmailThreadKey(email, fallbackKey) {
  return email.messageId || email.inReplyTo || fallbackKey;
}

function groupEmailsByThread(emails) {
  const idToThreadId = new Map();
  const threads = new Map();

  emails.forEach((email, index) => {
    const ids = [email.messageId, email.inReplyTo, ...(email.references || [])].filter(Boolean);
    const existingThreadId = ids.find((id) => idToThreadId.has(id));
    const fallbackThreadId = getEmailThreadKey(email, `uid:${email.uid || index}`);
    const threadId = existingThreadId ? idToThreadId.get(existingThreadId) : fallbackThreadId;

    if (!threads.has(threadId)) {
      threads.set(threadId, { id: threadId, emails: [] });
    }

    threads.get(threadId).emails.push(email);
    ids.forEach((id) => idToThreadId.set(id, threadId));
  });

  return Array.from(threads.values()).map((thread) => ({
    ...thread,
    emails: thread.emails
      .slice()
      .sort((a, b) => Number(b.uid || 0) - Number(a.uid || 0)),
  }));
}

function App() {
  const FOLDERS_WIDTH = 220;
  const RESIZER_WIDTH = 12;
  const MAIN_LAYOUT_GAP = 16;
  const MIN_INBOX_WIDTH = 240;
  const MIN_CONTENT_WIDTH = 320;
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [mailboxes, setMailboxes] = useState([]);
  const [selectedMailboxId, setSelectedMailboxId] = useState(null);
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [selectedEmailUid, setSelectedEmailUid] = useState(null);
  const [status, setStatus] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(FOLDERS[0].key);
  const [currentPage, setCurrentPage] = useState('inbox');
  const [folderCountsByMailbox, setFolderCountsByMailbox] = useState({});
  const [selectedSettingsMailboxId, setSelectedSettingsMailboxId] = useState(null);
  const [inboxWidth, setInboxWidth] = useState(() => {
    const value = Number(localStorage.getItem(INBOX_WIDTH_STORAGE_KEY));
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
    return 420;
  });
  const [isResizingInbox, setIsResizingInbox] = useState(false);
  const [themeMode, setThemeMode] = useState(() => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'dark' || storedTheme === 'light') {
      return storedTheme;
    }
    return 'light';
  });
  const resizeCleanupRef = useRef(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const resizeMaxWidthRef = useRef(0);
  const threadGroups = useMemo(() => groupEmailsByThread(emails), [emails]);
  const validFolderKeys = useMemo(() => new Set(FOLDERS.map((folder) => folder.key)), []);

  useEffect(
    () => () => {
      if (resizeCleanupRef.current) {
        resizeCleanupRef.current();
      }
    },
    []
  );

  useEffect(() => {
    if (!window.electronAPI?.onOpenSettings) return undefined;
    const unsubscribe = window.electronAPI.onOpenSettings(() => {
      handleOpenSettings();
    });
    return unsubscribe;
  }, [selectedMailboxId, mailboxes]);

  useEffect(() => {
    localStorage.setItem(INBOX_WIDTH_STORAGE_KEY, String(inboxWidth));
  }, [inboxWidth]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  function handleToggleThemeMode() {
    setThemeMode((currentThemeMode) => (currentThemeMode === 'dark' ? 'light' : 'dark'));
  }

  useEvent('keydown', (event) => {
    if (!event.shiftKey) return;
    if (event.key !== 'm' && event.key !== 'M') return;
    handleToggleThemeMode();
  });

  useEffect(() => {
    async function loadConfigs() {
      try {
        const storedConfigs = await window.electronAPI.getMailboxConfigs();
        let nextMailboxes = storedConfigs || [];

        if (!nextMailboxes.length) {
          const saved = await window.electronAPI.getConfig();
          if (saved.host && saved.username && saved.password) {
            nextMailboxes = [saved];
          } else {
            if (saved.host) setConfig((c) => ({ ...c, host: saved.host }));
            if (saved.username) setConfig((c) => ({ ...c, username: saved.username }));
            if (saved.password) setConfig((c) => ({ ...c, password: saved.password }));
          }
        }

        if (!nextMailboxes.length) return;

        const resolvedMailboxes = await Promise.all(
          nextMailboxes.map(async (mailboxConfig) => {
            const mailboxMap =
              mailboxConfig.mailboxMap || (await window.electronAPI.listMailboxes(mailboxConfig));
            return { ...mailboxConfig, mailboxMap, id: getMailboxId(mailboxConfig) };
          })
        );

        setMailboxes(resolvedMailboxes);
        await window.electronAPI.saveMailboxConfigs(resolvedMailboxes);
        const savedMailboxId = localStorage.getItem(LAST_SELECTED_MAILBOX_ID_KEY);
        const savedFolder = localStorage.getItem(LAST_SELECTED_FOLDER_KEY);
        const initialMailbox =
          resolvedMailboxes.find((mailbox) => mailbox.id === savedMailboxId) || resolvedMailboxes[0];
        const initialFolder = validFolderKeys.has(savedFolder) ? savedFolder : FOLDERS[0].key;
        setSelectedMailboxId(initialMailbox.id);
        setSelectedFolder(initialFolder);
        setLoggedIn(true);
        await Promise.all(
          resolvedMailboxes.map((mailbox) => refreshMailboxFolderCounts(mailbox).catch(() => undefined))
        );
        await loadFolder(initialMailbox.id, initialFolder, resolvedMailboxes);
      } catch (e) {
        setStatus('Error loading config: ' + e.message);
      }
    }
    loadConfigs();
  }, []);

  function getFolderUidStorageKey(mailboxId, folderKey) {
    return `${LAST_SELECTED_EMAIL_UID_PREFIX}${mailboxId}:${folderKey}`;
  }

  async function persistMailboxes(nextMailboxes) {
    setMailboxes(nextMailboxes);
    await window.electronAPI.saveMailboxConfigs(nextMailboxes);
  }

  async function refreshMailboxFolderCounts(mailbox, folderKeys = FOLDER_COUNT_KEYS) {
    const nextEntries = await Promise.all(
      folderKeys.map(async (folderKey) => {
        const folderEmails = await window.electronAPI.fetchFolderEmails(
          mailbox,
          folderKey,
          mailbox.mailboxMap || {}
        );
        return [folderKey, folderEmails.length];
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

  async function handleAddMailbox(loginConfig) {
    if (!loginConfig.host || !loginConfig.username || !loginConfig.password) {
      setStatus('Please fill in all fields.');
      return;
    }

    try {
      await window.electronAPI.saveConfig(loginConfig);
      setStatus('Connecting to IMAP...');

      const nextMailboxMap = await window.electronAPI.listMailboxes(loginConfig);
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
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  }

  async function handleLogout() {
    try {
      const mailboxIds = mailboxes.map((mailbox) => mailbox.id);
      await window.electronAPI.clearConfig();
      setConfig(EMPTY_CONFIG);
      setMailboxes([]);
      setSelectedMailboxId(null);
      setEmails([]);
      setSelectedEmail(null);
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
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  }

  async function loadFolder(mailboxId, folderKey, mailboxOverride, options = {}) {
    const { resetSelection = true, restoreSelectionFromStorage = true, showLoadedStatus = true } =
      options;
    const sourceMailboxes = mailboxOverride || mailboxes;
    const mailbox = sourceMailboxes.find((item) => item.id === mailboxId);
    if (!mailbox) {
      throw new Error('Mailbox not found');
    }
    const folderLabel = FOLDERS.find((folder) => folder.key === folderKey)?.label || folderKey;
    setStatus(`Loading ${folderLabel}...`);
    if (resetSelection) {
      setSelectedEmail(null);
      setSelectedEmailUid(null);
    }

    const folderEmails = await window.electronAPI.fetchFolderEmails(
      mailbox,
      folderKey,
      mailbox.mailboxMap || {}
    );
    const sortedEmails = folderEmails
      .slice()
      .sort((a, b) => Number(b.uid || 0) - Number(a.uid || 0));
    setEmails(sortedEmails);
    if (FOLDER_COUNT_KEYS.includes(folderKey)) {
      setFolderCountsByMailbox((current) => ({
        ...current,
        [mailbox.id]: {
          ...(current[mailbox.id] || {}),
          [folderKey]: sortedEmails.length,
        },
      }));
    }

    if (restoreSelectionFromStorage) {
      const storageKey = getFolderUidStorageKey(mailbox.id, folderKey);
      const savedUid = localStorage.getItem(storageKey);

      if (savedUid) {
        const matchingEmail = sortedEmails.find((email) => String(email.uid) === savedUid);
        if (matchingEmail) {
          await handleSelectEmail(matchingEmail, mailbox, folderKey);
          return;
        }
        localStorage.removeItem(storageKey);
      }
    }

    if (showLoadedStatus) {
      setStatus(`Loaded ${folderEmails.length} emails from ${folderLabel}.`);
    }
  }

  async function handleSelectFolder(mailboxId, folderKey) {
    setSelectedMailboxId(mailboxId);
    setSelectedFolder(folderKey);
    localStorage.setItem(LAST_SELECTED_MAILBOX_ID_KEY, mailboxId);
    localStorage.setItem(LAST_SELECTED_FOLDER_KEY, folderKey);

    try {
      await loadFolder(mailboxId, folderKey);
    } catch (e) {
      setEmails([]);
      setSelectedEmail(null);
      setStatus('Error: ' + e.message);
    }
  }

  useEffect(() => {
    if (!loggedIn || currentPage !== 'inbox' || !selectedMailboxId || !selectedFolder) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      loadFolder(selectedMailboxId, selectedFolder, undefined, {
        resetSelection: false,
        restoreSelectionFromStorage: false,
        showLoadedStatus: false,
      }).catch((e) => {
        setStatus('Error: ' + e.message);
      });
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loggedIn, currentPage, selectedMailboxId, selectedFolder, mailboxes]);

  async function handleSelectEmail(email, mailboxOverride, folderKeyOverride) {
    const mailbox =
      mailboxOverride || mailboxes.find((item) => item.id === selectedMailboxId) || null;
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
    setSelectedEmailUid(String(email.uid));
    setSelectedEmail({ loading: true });

    try {
      const folderKey = folderKeyOverride || selectedFolder;
      const content = await window.electronAPI.fetchFolderEmail(
        mailbox,
        folderKey,
        email.uid,
        mailbox.mailboxMap || {}
      );
      setSelectedEmail(content);
      localStorage.setItem(getFolderUidStorageKey(mailbox.id, folderKey), String(email.uid));
      setStatus('Email loaded.');
    } catch (e) {
      setSelectedEmail({ error: 'Error loading email: ' + e.message });
      setStatus('Error loading email.');
    }
  }

  function handleConfigChange(field, value) {
    setConfig((current) => ({ ...current, [field]: value }));
  }

  function handleSelectSettingsMailbox(mailbox) {
    setSelectedSettingsMailboxId(mailbox.id);
    setConfig({
      host: mailbox.host || '',
      username: mailbox.username || '',
      password: mailbox.password || '',
    });
  }

  async function handleOpenInbox(mailboxId, folderKey) {
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
        const fallbackFolder = validFolderKeys.has(savedFolder) ? savedFolder : FOLDERS[0].key;
        await handleSelectFolder(fallbackMailbox.id, fallbackFolder);
      }
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  }

  function handleOpenSettings() {
    setCurrentPage('settings');
    if (!selectedMailboxId) return;
    const mailbox = mailboxes.find((item) => item.id === selectedMailboxId);
    if (!mailbox) return;
    handleSelectSettingsMailbox(mailbox);
  }

  function handleStartInboxResize(event) {
    event.preventDefault();
    const handle = event.currentTarget;
    const layout = handle.closest('main');
    if (!layout) return;

    const maxInboxWidth = Math.max(
      MIN_INBOX_WIDTH,
      layout.clientWidth -
        FOLDERS_WIDTH -
        RESIZER_WIDTH -
        MIN_CONTENT_WIDTH -
        MAIN_LAYOUT_GAP * 3
    );
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = inboxWidth;
    resizeMaxWidthRef.current = maxInboxWidth;
    setIsResizingInbox(true);

    function handlePointerMove(moveEvent) {
      const deltaX = moveEvent.clientX - resizeStartXRef.current;
      const nextWidth = Math.min(
        resizeMaxWidthRef.current,
        Math.max(MIN_INBOX_WIDTH, resizeStartWidthRef.current + deltaX)
      );
      setInboxWidth(nextWidth);
    }

    function handlePointerUp() {
      setIsResizingInbox(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      resizeCleanupRef.current = null;
    }

    handle.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    resizeCleanupRef.current = handlePointerUp;
  }

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
        <main
          className={`${styles.mainLayout} ${isResizingInbox ? styles.mainLayoutResizing : ''}`}
          style={{
            gridTemplateColumns: `${FOLDERS_WIDTH}px ${inboxWidth}px ${RESIZER_WIDTH}px minmax(0, 1fr)`,
          }}
        >
          <section className={styles.foldersSection}>
            {mailboxes.map((mailbox) => (
              <div key={mailbox.id} className={styles.mailboxGroup}>
                <h3 className={styles.mailboxTitle}>{mailbox.username}</h3>
                <ul className={styles.folderList}>
                  {FOLDERS.map((folder) => {
                    const isActive =
                      selectedMailboxId === mailbox.id && selectedFolder === folder.key;
                    return (
                      <li key={`${mailbox.id}:${folder.key}`}>
                        <button
                          type="button"
                          className={`${styles.folderButton} ${
                            isActive ? styles.folderButtonActive : ''
                          }`}
                          onClick={() => handleSelectFolder(mailbox.id, folder.key)}
                        >
                          <span className={styles.folderButtonContent}>
                            <span>{folder.label}</span>
                            {FOLDER_COUNT_KEYS.includes(folder.key) &&
                              Number.isFinite(folderCountsByMailbox[mailbox.id]?.[folder.key]) && (
                                <span>{folderCountsByMailbox[mailbox.id][folder.key]}</span>
                              )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
          <InboxPanel
            title={FOLDERS.find((folder) => folder.key === selectedFolder)?.label || 'INBOX'}
            threadGroups={threadGroups}
            selectedEmailUid={selectedEmailUid}
            onSelectEmail={handleSelectEmail}
          />
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize list column"
            className={styles.columnResizer}
            onPointerDown={handleStartInboxResize}
          />
          <section className={styles.contentSection}>
            <EmailContent email={selectedEmail} />
          </section>
        </main>
      )}

      {loggedIn && currentPage === 'settings' && (
        <main className={styles.settingsLayout}>
          <section className={styles.settingsSection}>
            <button type="button" className={styles.folderButton} onClick={() => handleOpenInbox()}>
              Close settings
            </button>
            <h2>Add mailbox</h2>
            <LoginForm
              config={config}
              onConfigChange={handleConfigChange}
              onConnect={() => handleAddMailbox(config)}
            />
          </section>
          <section className={styles.mailboxSection}>
            <h2>Mailboxes</h2>
            <ul className={styles.mailboxList}>
              {mailboxes.map((mailbox) => (
                <li
                  key={mailbox.id}
                  className={`${styles.mailboxListItem} ${
                    selectedSettingsMailboxId === mailbox.id ? styles.mailboxListItemActive : ''
                  }`}
                >
                  <button
                    type="button"
                    className={styles.mailboxSelectButton}
                    onClick={() => handleSelectSettingsMailbox(mailbox)}
                  >
                    {mailbox.username}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
