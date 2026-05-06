import React, { useState, useEffect } from 'react';
import AppHeader from './components/AppHeader.jsx';
import LoginForm from './components/LoginForm.jsx';
import InboxPanel from './components/InboxPanel.jsx';
import EmailContent from './components/EmailContent.jsx';
import styles from './App.module.css';

const EMPTY_CONFIG = { host: '', username: '', password: '' };
const LAST_SELECTED_EMAIL_UID_KEY = 'lastSelectedEmailUid';

function App() {
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [status, setStatus] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

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

    try {
      await window.electronAPI.saveConfig(loginConfig);
      setStatus('Connecting to IMAP...');

      const inbox = await window.electronAPI.fetchInbox(loginConfig);
      const sortedInbox = inbox.reverse();
      setEmails(sortedInbox);
      const savedUid = localStorage.getItem(LAST_SELECTED_EMAIL_UID_KEY);

      if (savedUid) {
        const matchingEmail = sortedInbox.find((email) => String(email.uid) === savedUid);
        if (matchingEmail) {
          await handleSelectEmail(matchingEmail, loginConfig);
        } else {
          localStorage.removeItem(LAST_SELECTED_EMAIL_UID_KEY);
          setStatus(`Loaded ${inbox.length} emails.`);
        }
      } else {
        setStatus(`Loaded ${inbox.length} emails.`);
      }

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
      localStorage.removeItem(LAST_SELECTED_EMAIL_UID_KEY);
      setStatus('Logged out.');
      setLoggedIn(false);
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  }

  async function handleSelectEmail(email, configOverride) {
    if (!email.uid) {
      localStorage.removeItem(LAST_SELECTED_EMAIL_UID_KEY);
      setSelectedEmail({ error: 'Error: no UID available for this email.' });
      return;
    }

    setStatus('Fetching email content...');
    setSelectedEmail({ loading: true });

    try {
      const content = await window.electronAPI.fetchEmail(configOverride || config, email.uid);
      setSelectedEmail(content);
      localStorage.setItem(LAST_SELECTED_EMAIL_UID_KEY, String(email.uid));
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
          <InboxPanel emails={emails} onSelectEmail={handleSelectEmail} />
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
