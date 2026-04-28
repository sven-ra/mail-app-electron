document.addEventListener('DOMContentLoaded', async () => {
  const hostInput = document.getElementById('host');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const connectBtn = document.getElementById('connectBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const statusDiv = document.getElementById('status');
  const inboxList = document.getElementById('inboxList');
  const emailContent = document.getElementById('emailContent');

  // Load saved config on startup
  let savedConfig = {};
  try {
    savedConfig = await window.electronAPI.getConfig();
    if (savedConfig.host) hostInput.value = savedConfig.host;
    if (savedConfig.username) usernameInput.value = savedConfig.username;
    if (savedConfig.password) passwordInput.value = savedConfig.password;
  } catch (e) {
    statusDiv.textContent = 'Error loading config: ' + e.message;
  }

  // Auto-login if all config fields are present
  if (savedConfig.host && savedConfig.username && savedConfig.password) {
    loadInbox(savedConfig);
  }

  connectBtn.addEventListener('click', async () => {
    const config = {
      host: hostInput.value.trim(),
      username: usernameInput.value.trim(),
      password: passwordInput.value,
    };

    if (!config.host || !config.username || !config.password) {
      statusDiv.textContent = 'Please fill in all fields.';
      return;
    }

    statusDiv.textContent = 'Saving config...';
    emailContent.innerHTML = '';

    try {
      await window.electronAPI.saveConfig(config);
      await loadInbox(config);
    } catch (e) {
      statusDiv.textContent = 'Error: ' + e.message;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      await window.electronAPI.clearConfig();
      document.getElementById('loginForm').style.display = '';
      logoutBtn.style.display = 'none';
      inboxList.innerHTML = '';
      emailContent.innerHTML = '';
      statusDiv.textContent = 'Logged out.';
    } catch (e) {
      statusDiv.textContent = 'Error: ' + e.message;
    }
  });

  async function loadInbox(config) {
    statusDiv.textContent = 'Connecting to IMAP...';
    inboxList.innerHTML = '';

    const emails = await window.electronAPI.fetchInbox(config);
    statusDiv.textContent = `Loaded ${emails.length} emails.`;

    document.getElementById('loginForm').style.display = 'none';
    logoutBtn.style.display = '';

    emails.reverse().forEach((email) => {
      const li = document.createElement('li');
      li.style.cursor = 'pointer';
      li.textContent = `${email.date} — ${email.subject}`;
      li.dataset.uid = email.uid;
      li.addEventListener('click', () => loadEmail(config, email.uid));
      inboxList.appendChild(li);
    });
  }

  async function loadEmail(config, uid) {
    if (!uid) {
      emailContent.textContent = 'Error: no UID available for this email.';
      return;
    }

    emailContent.innerHTML = 'Loading email...';
    statusDiv.textContent = 'Fetching email content...';

    try {
      const email = await window.electronAPI.fetchEmail(config, uid);
      statusDiv.textContent = 'Email loaded.';

      const subjectEl = document.createElement('h3');
      subjectEl.textContent = email.subject;

      const metaEl = document.createElement('div');
      metaEl.innerHTML = `<b>From:</b> ${escapeHtml(email.from)}<br><b>To:</b> ${escapeHtml(email.to)}<br><b>Date:</b> ${escapeHtml(email.date)}<br><hr>`;

      const bodyEl = document.createElement('pre');
      bodyEl.style.whiteSpace = 'pre-wrap';
      bodyEl.style.wordWrap = 'break-word';
      bodyEl.textContent = email.text || '(no plain text body)';

      emailContent.innerHTML = '';
      emailContent.appendChild(subjectEl);
      emailContent.appendChild(metaEl);
      emailContent.appendChild(bodyEl);
    } catch (e) {
      emailContent.textContent = 'Error loading email: ' + e.message;
      statusDiv.textContent = 'Error loading email.';
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
