import React, { useState, useEffect } from 'react';

function App() {
  const [config, setConfig] = useState({ host: '', username: '', password: '' });
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
      setEmails(inbox.reverse());
      setStatus(`Loaded ${inbox.length} emails.`);
      setLoggedIn(true);
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  }

  async function handleLogout() {
    try {
      await window.electronAPI.clearConfig();
      setConfig({ host: '', username: '', password: '' });
      setEmails([]);
      setSelectedEmail(null);
      setStatus('Logged out.');
      setLoggedIn(false);
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  }

  async function handleSelectEmail(email) {
    if (!email.uid) {
      setSelectedEmail({ error: 'Error: no UID available for this email.' });
      return;
    }

    setStatus('Fetching email content...');
    setSelectedEmail({ loading: true });

    try {
      const content = await window.electronAPI.fetchEmail(config, email.uid);
      setSelectedEmail(content);
      setStatus('Email loaded.');
    } catch (e) {
      setSelectedEmail({ error: 'Error loading email: ' + e.message });
      setStatus('Error loading email.');
    }
  }

  return (
    <div>
      <table width="100%">
        <tbody>
          <tr>
            <td><h1>Email Viewer</h1></td>
            <td align="right" valign="top">
              {loggedIn && (
                <button onClick={handleLogout}>Logout</button>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {!loggedIn && (
        <div>
          <label>
            Host:{' '}
            <input
              type="text"
              value={config.host}
              onChange={(e) => setConfig({ ...config, host: e.target.value })}
            />
          </label>
          <br />
          <label>
            Username:{' '}
            <input
              type="text"
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
            />
          </label>
          <br />
          <label>
            Password:{' '}
            <input
              type="password"
              value={config.password}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
            />
          </label>
          <br />
          <button onClick={() => handleLogin(config)}>Save & Connect</button>
        </div>
      )}

      <div>{status}</div>

      {loggedIn && (
        <table width="100%">
          <tbody>
            <tr valign="top">
              <td width="40%">
                <h2>Inbox</h2>
                <ul>
                  {emails.map((email, i) => (
                    <li
                      key={i}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleSelectEmail(email)}
                    >
                      {email.date} — {email.subject}
                    </li>
                  ))}
                </ul>
              </td>
              <td width="60%">
                <h2>Content</h2>
                <EmailContent email={selectedEmail} />
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function EmailContent({ email }) {
  if (!email) return <div>Click an email to view content.</div>;
  if (email.loading) return <div>Loading email...</div>;
  if (email.error) return <div>{email.error}</div>;

  return (
    <div>
      <h3>{email.subject}</h3>
      <div>
        <b>From:</b> {escapeHtml(email.from)}
        <br />
        <b>To:</b> {escapeHtml(email.to)}
        <br />
        <b>Date:</b> {escapeHtml(email.date)}
        <br />
        <hr />
      </div>
      <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
        {email.text || '(no plain text body)'}
      </pre>
    </div>
  );
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

export default App;
