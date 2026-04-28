document.addEventListener('DOMContentLoaded', async () => {
  const hostInput = document.getElementById('host');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const connectBtn = document.getElementById('connectBtn');
  const statusDiv = document.getElementById('status');
  const inboxList = document.getElementById('inboxList');

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

    try {
      await window.electronAPI.saveConfig(config);
      statusDiv.textContent = 'Connecting to IMAP...';
      inboxList.innerHTML = '';

      const emails = await window.electronAPI.fetchInbox(config);
      statusDiv.textContent = `Loaded ${emails.length} emails.`;

      emails.reverse().forEach((email) => {
        const li = document.createElement('li');
        li.textContent = `${email.date} — ${email.subject}`;
        inboxList.appendChild(li);
      });
    } catch (e) {
      statusDiv.textContent = 'Error: ' + e.message;
    }
  });
});
