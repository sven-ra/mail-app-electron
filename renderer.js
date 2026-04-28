document.addEventListener('DOMContentLoaded', async () => {
  const hostInput = document.getElementById('host');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const connectBtn = document.getElementById('connectBtn');
  const statusDiv = document.getElementById('status');
  const inboxList = document.getElementById('inboxList');
  const emailContent = document.getElementById('emailContent');

  // Load saved config on startup
  try {
    const config = await window.electronAPI.getConfig();
    if (config.host) hostInput.value = config.host;
    if (config.username) usernameInput.value = config.username;
    if (config.password) passwordInput.value = config.password;
  } catch (e) {
    statusDiv.textContent = 'Error loading config: ' + e.message;
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
      statusDiv.textContent = 'Connecting to IMAP...';
      inboxList.innerHTML = '';

      const emails = await window.electronAPI.fetchInbox(config);
      statusDiv.textContent = `Loaded ${emails.length} emails.`;

      emails.reverse().forEach((email) => {
        const li = document.createElement('li');
        li.style.cursor = 'pointer';
        li.textContent = `${email.date} — ${email.subject}`;
        li.dataset.uid = email.uid;
        li.addEventListener('click', () => loadEmail(config, email.uid));
        inboxList.appendChild(li);
      });
    } catch (e) {
      statusDiv.textContent = 'Error: ' + e.message;
    }
  });

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
