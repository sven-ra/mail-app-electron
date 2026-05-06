import React, { useState, useEffect } from 'react';
import AppHeader from './components/AppHeader.jsx';
import LoginForm from './components/LoginForm.jsx';
import InboxPanel from './components/InboxPanel.jsx';
import EmailContent from './components/EmailContent.jsx';
import './styles/main.css';
import styles from './App.module.css';

const EMPTY_CONFIG = { host: '', username: '', password: '' };
const LAST_SELECTED_EMAIL_UID_PREFIX = 'lastSelectedEmailUid:';
const FOLDERS = [
  { key: 'inbox', label: 'INBOX' },
  { key: 'drafts', label: 'drafts' },
  { key: 'sent', label: 'sent' },
  { key: 'junk', label: 'junk' },
  { key: 'bin', label: 'bin' },
  { key: 'archive', label: 'archive' },
];

function App() {
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [status, setStatus] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(FOLDERS[0].key);
  const [mailboxMap, setMailboxMap] = useState({});

  useEffect(() => {
    async function loadConfig() {
      try {
        const saved = await window.electronAPI.getConfig();
        if (saved.host && saved.username && saved.password) {
          setConfig(saved);
          handleLogin(saved);
        } else {
          if (saved.host) setConfig((c) => ({ ...c, host: saved.host }));
          if (saved.username) setConfig((c) => ({ ...c, username: saved.username }));
          if (saved.password) setConfig((c) => ({ ...c, password: saved.password }));
        }
      } catch (e) {
        setStatus('Error loading config: ' + e.message);
      }
    }
    loadConfig();
  }, []);

  async function handleLogin(loginConfig) {
    if (!loginConfig.host || !loginConfig.username || !loginConfig.password) {
      setStatus('Please fill in all fields.');
      return;
    }

    setStatus('Saving config...');
    setSelectedEmail(null);
    setSelectedFolder(FOLDERS[0].key);

    try {
      await window.electronAPI.saveConfig(loginConfig);
      setStatus('Connecting to IMAP...');

      const nextMailboxMap = await window.electronAPI.listMailboxes(loginConfig);
      setMailboxMap(nextMailboxMap || {});
      await loadFolder(FOLDERS[0].key, loginConfig, nextMailboxMap);

      setLoggedIn(true);
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  }

  async function handleLogout() {
    try {
      await window.electronAPI.clearConfig();
      setConfig(EMPTY_CONFIG);
      setEmails([]);
      setSelectedEmail(null);
      FOLDERS.forEach((folder) => {
        localStorage.removeItem(getFolderUidStorageKey(folder.key));
      });
      setStatus('Logged out.');
      setLoggedIn(false);
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  }

  function getFolderUidStorageKey(folderKey) {
    return `${LAST_SELECTED_EMAIL_UID_PREFIX}${folderKey}`;
  }

  async function loadFolder(folderKey, configOverride, mailboxMapOverride) {
    const effectiveConfig = configOverride || config;
    const effectiveMailboxMap = mailboxMapOverride || mailboxMap;
    const folderLabel = FOLDERS.find((folder) => folder.key === folderKey)?.label || folderKey;
    setStatus(`Loading ${folderLabel}...`);
    setSelectedEmail(null);

    const folderEmails = await window.electronAPI.fetchFolderEmails(
      effectiveConfig,
      folderKey,
      effectiveMailboxMap
    );
    const sortedEmails = folderEmails.slice().reverse();
    setEmails(sortedEmails);

    const storageKey = getFolderUidStorageKey(folderKey);
    const savedUid = localStorage.getItem(storageKey);

    if (savedUid) {
      const matchingEmail = sortedEmails.find((email) => String(email.uid) === savedUid);
      if (matchingEmail) {
        await handleSelectEmail(matchingEmail, effectiveConfig, folderKey, effectiveMailboxMap);
        return;
      }
      localStorage.removeItem(storageKey);
    }

    setStatus(`Loaded ${folderEmails.length} emails from ${folderLabel}.`);
  }

  async function handleSelectFolder(folderKey) {
    setSelectedFolder(folderKey);

    try {
      await loadFolder(folderKey);
    } catch (e) {
      setEmails([]);
      setSelectedEmail(null);
      setStatus('Error: ' + e.message);
    }
  }

  async function handleSelectEmail(email, configOverride, folderKeyOverride, mailboxMapOverride) {
    if (!email.uid) {
      localStorage.removeItem(getFolderUidStorageKey(folderKeyOverride || selectedFolder));
      setSelectedEmail({ error: 'Error: no UID available for this email.' });
      return;
    }

    setStatus('Fetching email content...');
    setSelectedEmail({ loading: true });

    try {
      const folderKey = folderKeyOverride || selectedFolder;
      const content = await window.electronAPI.fetchFolderEmail(
        configOverride || config,
        folderKey,
        email.uid,
        mailboxMapOverride || mailboxMap
      );
      setSelectedEmail(content);
      localStorage.setItem(getFolderUidStorageKey(folderKey), String(email.uid));
      setStatus('Email loaded.');
    } catch (e) {
      setSelectedEmail({ error: 'Error loading email: ' + e.message });
      setStatus('Error loading email.');
    }
  }

  function handleConfigChange(field, value) {
    setConfig((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className={styles.app}>
      <AppHeader loggedIn={loggedIn} onLogout={handleLogout} />

      {!loggedIn && (
        <LoginForm
          config={config}
          onConfigChange={handleConfigChange}
          onConnect={() => handleLogin(config)}
        />
      )}

      <div className={styles.status}>{status}</div>

      {loggedIn && (
        <main className={styles.mainLayout}>
          <section className={styles.foldersSection}>
            <h2>Folders</h2>
            <ul className={styles.folderList}>
              {FOLDERS.map((folder) => (
                <li key={folder.key}>
                  <button
                    type="button"
                    className={`${styles.folderButton} ${
                      selectedFolder === folder.key ? styles.folderButtonActive : ''
                    }`}
                    onClick={() => handleSelectFolder(folder.key)}
                  >
                    {folder.label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <InboxPanel
            title={FOLDERS.find((folder) => folder.key === selectedFolder)?.label || 'INBOX'}
            emails={emails}
            onSelectEmail={handleSelectEmail}
          />
          <section className={styles.contentSection}>
            <h2>Content</h2>
            <EmailContent email={selectedEmail} />
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
