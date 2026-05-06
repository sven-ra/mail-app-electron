import React, { useState, useEffect, useMemo } from 'react';
import AppHeader from './components/AppHeader.jsx';
import LoginForm from './components/LoginForm.jsx';
import InboxPanel from './components/InboxPanel.jsx';
import EmailContent from './components/EmailContent.jsx';
import './styles/main.css';
import styles from './App.module.css';

const EMPTY_CONFIG = { host: '', username: '', password: '' };
const LAST_SELECTED_EMAIL_UID_PREFIX = 'lastSelectedEmailUid:';
const LAST_SELECTED_MAILBOX_ID_KEY = 'lastSelectedMailboxId';
const LAST_SELECTED_FOLDER_KEY = 'lastSelectedFolder';
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
  const [selectedSettingsMailboxId, setSelectedSettingsMailboxId] = useState(null);
  const threadGroups = useMemo(() => groupEmailsByThread(emails), [emails]);
  const validFolderKeys = useMemo(() => new Set(FOLDERS.map((folder) => folder.key)), []);

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

  async function loadFolder(mailboxId, folderKey, mailboxOverride) {
    const sourceMailboxes = mailboxOverride || mailboxes;
    const mailbox = sourceMailboxes.find((item) => item.id === mailboxId);
    if (!mailbox) {
      throw new Error('Mailbox not found');
    }
    const folderLabel = FOLDERS.find((folder) => folder.key === folderKey)?.label || folderKey;
    setStatus(`Loading ${folderLabel}...`);
    setSelectedEmail(null);
    setSelectedEmailUid(null);

    const folderEmails = await window.electronAPI.fetchFolderEmails(
      mailbox,
      folderKey,
      mailbox.mailboxMap || {}
    );
    const sortedEmails = folderEmails
      .slice()
      .sort((a, b) => Number(b.uid || 0) - Number(a.uid || 0));
    setEmails(sortedEmails);

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

    setStatus(`Loaded ${folderEmails.length} emails from ${folderLabel}.`);
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

  return (
    <div className={styles.app}>
      <AppHeader
        loggedIn={loggedIn}
        currentPage={currentPage}
        onOpenInbox={() => handleOpenInbox()}
        onOpenSettings={handleOpenSettings}
        onLogout={handleLogout}
      />

      {!loggedIn && (
        <LoginForm
          config={config}
          onConfigChange={handleConfigChange}
          onConnect={() => handleAddMailbox(config)}
        />
      )}

      <div className={styles.status}>{status}</div>

      {loggedIn && currentPage === 'inbox' && (
        <main className={styles.mainLayout}>
          <section className={styles.foldersSection}>
            <h2>Folders</h2>
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
                          {folder.label}
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
          <section className={styles.contentSection}>
            <h2>Content</h2>
            <EmailContent email={selectedEmail} />
          </section>
        </main>
      )}

      {loggedIn && currentPage === 'settings' && (
        <main className={styles.settingsLayout}>
          <section className={styles.settingsSection}>
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
                  <button
                    type="button"
                    onClick={() => handleOpenInbox(mailbox.id, FOLDERS[0].key)}
                    className={styles.folderButton}
                  >
                    INBOX
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
