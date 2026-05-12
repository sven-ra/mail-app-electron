const { app, BrowserWindow, ipcMain, safeStorage, Menu, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const Imap = require('imap');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const { simpleParser } = require('mailparser');
const crypto = require('node:crypto');
let libmime = null;
try {
  libmime = require('libmime');
} catch (e) {
  libmime = null;
}

const store = new Store();
const PASSWORD_SCHEME_SAFE = 'safe:v1:';
const PASSWORD_SCHEME_FALLBACK = 'fallback:v1:';
const PASSWORD_FALLBACK_SALT = 'mail-electron-password-salt';

let mainWindow;

function openSettingsView() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('open-settings');
}

function buildAppMenu() {
  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              {
                label: 'Settings...',
                accelerator: 'Command+,',
                click: openSettingsView,
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      role: 'editMenu',
    },
    {
      role: 'viewMenu',
    },
    {
      role: 'windowMenu',
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getFallbackKey() {
  return crypto.scryptSync(app.getPath('userData'), PASSWORD_FALLBACK_SALT, 32);
}

function encryptPassword(password) {
  if (!password) return '';

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(password);
    return PASSWORD_SCHEME_SAFE + encrypted.toString('base64');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getFallbackKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PASSWORD_SCHEME_FALLBACK + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptPassword(storedPassword) {
  if (!storedPassword) return '';

  if (storedPassword.startsWith(PASSWORD_SCHEME_SAFE)) {
    const raw = storedPassword.slice(PASSWORD_SCHEME_SAFE.length);
    const encrypted = Buffer.from(raw, 'base64');
    return safeStorage.decryptString(encrypted);
  }

  if (storedPassword.startsWith(PASSWORD_SCHEME_FALLBACK)) {
    const raw = storedPassword.slice(PASSWORD_SCHEME_FALLBACK.length);
    const data = Buffer.from(raw, 'base64');
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getFallbackKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  throw new Error('Unsupported password format');
}

function isEncryptedPassword(value) {
  if (!value) return true;
  return (
    value.startsWith(PASSWORD_SCHEME_SAFE) ||
    value.startsWith(PASSWORD_SCHEME_FALLBACK)
  );
}

const OPTIONAL_ENCRYPTED_STRING_KEYS = [
  'smtpPassword',
  'smtpClientSecret',
  'smtpRefreshToken',
  'smtpAccessToken',
];

function encryptOptionalSecret(value) {
  if (!value) return '';
  return encryptPassword(value);
}

function decryptOptionalSecret(value) {
  if (!value) return '';
  if (!isEncryptedPassword(value)) return value;
  return decryptPassword(value);
}

function serializeConfig(config = {}) {
  const next = { ...config };
  next.password = encryptPassword(config.password || '');
  OPTIONAL_ENCRYPTED_STRING_KEYS.forEach((key) => {
    next[key] = config[key] ? encryptOptionalSecret(String(config[key])) : '';
  });
  return next;
}

function deserializeConfig(config = {}) {
  const next = { ...config };
  next.password = decryptOptionalSecret(config.password || '');
  OPTIONAL_ENCRYPTED_STRING_KEYS.forEach((key) => {
    next[key] = decryptOptionalSecret(config[key] || '');
  });
  return next;
}

function serializeConfigList(configs = []) {
  return configs.map((config) => serializeConfig(config));
}

function deserializeConfigList(configs = []) {
  return configs.map((config) => deserializeConfig(config));
}

function migrateLegacyPlainTextConfigs() {
  const singleConfig = store.get('imapConfig');
  if (singleConfig?.password && !isEncryptedPassword(singleConfig.password)) {
    store.set('imapConfig', serializeConfig(singleConfig));
  }

  const listConfigs = store.get('imapConfigs');
  if (Array.isArray(listConfigs)) {
    const hasPlainText = listConfigs.some(
      (config) => config?.password && !isEncryptedPassword(config.password)
    );
    if (hasPlainText) {
      store.set('imapConfigs', serializeConfigList(listConfigs));
    }
  }
}

function isHttpHttpsMailtoUrl(urlString) {
  if (typeof urlString !== 'string' || !urlString.trim()) return false;
  try {
    const u = new URL(urlString.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function shouldOpenExternalInsteadOfNavigating(currentUrl, navigationUrl) {
  if (!isHttpHttpsMailtoUrl(navigationUrl)) return false;
  try {
    const next = new URL(navigationUrl);
    if (next.protocol === 'mailto:') return true;
    const cur = new URL(currentUrl);
    if (cur.protocol === 'file:') return next.protocol === 'http:' || next.protocol === 'https:';
    if (cur.protocol === 'http:' || cur.protocol === 'https:') {
      return next.origin !== cur.origin;
    }
    return false;
  } catch {
    return isHttpHttpsMailtoUrl(navigationUrl);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpHttpsMailtoUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // `will-navigate` is main-frame only. HTML mail uses an iframe; subframe navigations
  // must be handled with `will-frame-navigate` or links load inside the app.
  mainWindow.webContents.on('will-frame-navigate', (event) => {
    const navigationUrl = event.url;
    if (!isHttpHttpsMailtoUrl(navigationUrl)) return;

    if (!event.isMainFrame) {
      event.preventDefault();
      void shell.openExternal(navigationUrl);
      return;
    }

    const currentUrl = mainWindow.webContents.getURL();
    if (!shouldOpenExternalInsteadOfNavigating(currentUrl, navigationUrl)) return;
    event.preventDefault();
    void shell.openExternal(navigationUrl);
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  migrateLegacyPlainTextConfigs();
  buildAppMenu();
  createWindow();
});

function closeAllPooledConnections() {
  imapPool.forEach((entry) => {
    clearPoolIdleTimer(entry);
    if (entry.imap) {
      try {
        entry.imap.end();
      } catch {}
    }
  });
  imapPool.clear();
}

app.on('before-quit', () => {
  closeAllPooledConnections();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: get saved IMAP config
ipcMain.handle('get-config', () => {
  return deserializeConfig(store.get('imapConfig') || {});
});

// IPC: save IMAP config
ipcMain.handle('save-config', (event, config) => {
  store.set('imapConfig', serializeConfig(config));
  return true;
});

ipcMain.handle('get-mailbox-configs', () => {
  return deserializeConfigList(store.get('imapConfigs') || []);
});

ipcMain.handle('save-mailbox-configs', (event, configs) => {
  store.set('imapConfigs', serializeConfigList(configs || []));
  return true;
});

// IPC: clear saved IMAP config
ipcMain.handle('clear-config', () => {
  store.delete('imapConfig');
  store.delete('imapConfigs');
  closeAllPooledConnections();
  return true;
});

ipcMain.handle('set-unread-badge-count', (event, rawCount) => {
  const n = Number(rawCount);
  const count = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  try {
    return app.setBadgeCount(count);
  } catch {
    return false;
  }
});

ipcMain.handle('open-external-url', async (event, rawUrl) => {
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!isHttpHttpsMailtoUrl(url)) return false;
  await shell.openExternal(url);
  return true;
});

// Persistent IMAP connection pool: keyed by host|username so each mailbox
// reuses one TCP+TLS+LOGIN session across IPC calls. Connections idle-close
// after POOL_IDLE_MS of inactivity, and transparently reconnect on next use.
const POOL_IDLE_MS = 90_000;
const imapPool = new Map();

function getPoolKey(config) {
  const host = String(config?.host || '').toLowerCase();
  const user = String(config?.username || '').toLowerCase();
  return `${host}|${user}`;
}

function clearPoolIdleTimer(entry) {
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }
}

function schedulePoolIdleTimeout(entry) {
  clearPoolIdleTimer(entry);
  entry.idleTimer = setTimeout(() => {
    if (entry.imap) {
      try {
        entry.imap.end();
      } catch {}
    }
  }, POOL_IDLE_MS);
}

function teardownPoolEntry(entry) {
  clearPoolIdleTimer(entry);
  entry.imap = null;
  entry.currentBox = null;
  entry.currentBoxReadOnly = null;
}

function createImapConnection(config) {
  return new Promise((resolve, reject) => {
    function attempt(useTls) {
      const imap = new Imap({
        user: config.username,
        password: config.password,
        host: config.host,
        port: useTls ? 993 : 143,
        tls: useTls,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 10000,
      });
      let settled = false;
      imap.once('ready', () => {
        if (settled) return;
        settled = true;
        resolve(imap);
      });
      imap.once('error', (err) => {
        if (settled) return;
        if (useTls) {
          settled = true;
          attempt(false);
        } else {
          settled = true;
          reject(err);
        }
      });
      imap.connect();
    }
    attempt(true);
  });
}

function withImapConnection(config, task) {
  const key = getPoolKey(config);
  let entry = imapPool.get(key);
  if (!entry) {
    entry = {
      imap: null,
      readyPromise: null,
      currentBox: null,
      currentBoxReadOnly: null,
      queue: Promise.resolve(),
      idleTimer: null,
    };
    imapPool.set(key, entry);
  }

  async function ensureConnected() {
    if (entry.imap && entry.imap.state !== 'disconnected') {
      return entry.imap;
    }
    if (!entry.readyPromise) {
      entry.readyPromise = createImapConnection(config)
        .then((imap) => {
          entry.imap = imap;
          entry.currentBox = null;
          entry.currentBoxReadOnly = null;
          const cleanup = () => {
            if (entry.imap === imap) {
              teardownPoolEntry(entry);
            }
          };
          imap.once('end', cleanup);
          imap.once('close', cleanup);
          imap.on('error', () => {
            if (entry.imap === imap) {
              try {
                imap.end();
              } catch {}
              teardownPoolEntry(entry);
            }
          });
          return imap;
        })
        .finally(() => {
          entry.readyPromise = null;
        });
    }
    return entry.readyPromise;
  }

  const run = entry.queue.then(async () => {
    clearPoolIdleTimer(entry);
    const imap = await ensureConnected();
    try {
      return await task(imap, entry);
    } finally {
      schedulePoolIdleTimeout(entry);
    }
  });

  entry.queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function openBoxOnConnection(imap, entry, mailboxPath, readOnly) {
  return new Promise((resolve, reject) => {
    imap.openBox(mailboxPath, readOnly, (err, box) => {
      if (err) {
        entry.currentBox = null;
        entry.currentBoxReadOnly = null;
        return reject(err);
      }
      entry.currentBox = mailboxPath;
      entry.currentBoxReadOnly = readOnly;
      resolve(box);
    });
  });
}

// Standalone connection used only for one-off operations that should not
// join the pool (e.g. listing mailbox folders before a mailbox is registered).
async function getDiscoveryImapConnection(config) {
  return createImapConnection(config);
}

function decodeSubject(subject) {
  if (!subject) return '(no subject)';
  if (!libmime || typeof libmime.decodeWords !== 'function') return subject;
  try {
    return libmime.decodeWords(subject);
  } catch (e) {
    return subject;
  }
}

function normalizeMessageId(value) {
  if (!value) return '';
  const cleaned = String(value).trim().replace(/^<|>$/g, '');
  return cleaned;
}

function normalizeReferences(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => normalizeMessageId(item)).filter(Boolean);
  }
  return String(value)
    .split(/\s+/)
    .map((item) => normalizeMessageId(item))
    .filter(Boolean);
}

function addressListText(addr) {
  if (!addr) return '';
  if (typeof addr.text === 'string' && addr.text) return addr.text;
  if (Array.isArray(addr.value)) {
    return addr.value
      .map((v) => {
        if (v.name && v.address) return `${v.name} <${v.address}>`;
        return v.address || '';
      })
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

function stripAngleBrackets(value) {
  if (!value) return '';
  return String(value).trim().replace(/^<|>$/g, '');
}

function serializeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((att) => ({
    contentId: stripAngleBrackets(att.contentId),
    cid: stripAngleBrackets(att.cid),
    contentType: att.contentType || 'application/octet-stream',
    filename: att.filename || '',
    related: att.related === true,
    contentDisposition: att.contentDisposition || '',
    size: Number.isFinite(att.size) ? att.size : (att.content ? att.content.length : 0),
    dataBase64: att.content ? att.content.toString('base64') : '',
  }));
}

const MAILBOX_DETECTION_RULES = {
  inbox: {
    attrs: ['\\inbox'],
    names: ['inbox'],
  },
  drafts: {
    attrs: ['\\drafts'],
    names: ['drafts', 'draft'],
  },
  sent: {
    attrs: ['\\sent'],
    names: ['sent', 'sent items', 'sent mail', 'sent messages'],
  },
  junk: {
    attrs: ['\\junk', '\\spam'],
    names: ['junk', 'spam', 'bulk mail'],
  },
  bin: {
    attrs: ['\\trash', '\\deleted'],
    names: ['trash', 'bin', 'deleted', 'deleted items'],
  },
  archive: {
    attrs: ['\\archive', '\\all'],
    names: ['archive', 'all mail'],
  },
};

function flattenBoxes(boxes, parentPath = '') {
  const entries = [];

  Object.entries(boxes || {}).forEach(([name, details]) => {
    const delimiter = details.delimiter || '/';
    const fullPath = parentPath ? `${parentPath}${delimiter}${name}` : name;
    entries.push({
      path: fullPath,
      lowerPath: fullPath.toLowerCase(),
      attrs: (details.attribs || []).map((attr) => String(attr).toLowerCase()),
    });

    if (details.children) {
      entries.push(...flattenBoxes(details.children, fullPath));
    }
  });

  return entries;
}

function detectMailboxMap(boxes) {
  const entries = flattenBoxes(boxes);
  const resolved = {};

  Object.entries(MAILBOX_DETECTION_RULES).forEach(([folderKey, rule]) => {
    const attrMatch = entries.find((entry) =>
      entry.attrs.some((attr) => rule.attrs.includes(attr))
    );
    if (attrMatch) {
      resolved[folderKey] = attrMatch.path;
      return;
    }

    const nameMatch = entries.find((entry) =>
      rule.names.includes(entry.lowerPath.split(/[/.]/).pop())
    );
    if (nameMatch) {
      resolved[folderKey] = nameMatch.path;
    }
  });

  if (!resolved.inbox) {
    resolved.inbox = 'INBOX';
  }

  return resolved;
}

async function discoverMailboxes(config) {
  const imap = await getDiscoveryImapConnection(config);

  return new Promise((resolve, reject) => {
    imap.getBoxes((err, boxes) => {
      imap.end();
      if (err) {
        reject(new Error('Failed to list mailboxes: ' + err.message));
        return;
      }

      resolve(detectMailboxMap(boxes));
    });
  });
}

function getMailboxPath(folderKey, mailboxMap) {
  const folderPath = mailboxMap?.[folderKey];
  if (folderPath) {
    return folderPath;
  }

  if (folderKey === 'inbox') {
    return 'INBOX';
  }

  throw new Error(`No mailbox found for folder "${folderKey}"`);
}

// IPC: discover mailbox paths by logical folder key
ipcMain.handle('list-mailboxes', async (event, config) => {
  return discoverMailboxes(config);
});

// IPC: fetch folder headers (subject + date + uid). Header-only fetch keeps the
// payload tiny — full bodies are loaded lazily by fetch-folder-email when a
// row is selected.
ipcMain.handle('fetch-folder-emails', async (event, config, folderKey, mailboxMap = {}, options = {}) => {
  const mailboxPath = getMailboxPath(folderKey, mailboxMap);
  const limit = Math.max(1, Number(options.limit) || 50);
  const beforeUid = Number(options.beforeUid) || null;

  return withImapConnection(config, async (imap, entry) => {
    let box;
    try {
      box = await openBoxOnConnection(imap, entry, mailboxPath, true);
    } catch (err) {
      throw new Error(`Failed to open ${mailboxPath}: ` + err.message);
    }

    const total = box.messages.total;
    if (total === 0) {
      return { emails: [], hasMore: false, total };
    }

    return new Promise((resolve, reject) => {
      const emails = [];
      let totalFetched = 0;
      let processedCount = 0;
      let fetchDone = false;
      let resolved = false;
      let hasMore = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ emails, hasMore, total });
        }
      }, 15000);

      function settle(err, value) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(value);
      }

      function checkDone() {
        if (fetchDone && processedCount === totalFetched) {
          settle(null, { emails, hasMore, total });
        }
      }

      function startFetch(fetch) {
        fetch.on('message', (msg) => {
          totalFetched++;
          const chunks = [];
          let uid = null;
          let flags = [];

          msg.once('attributes', (attrs) => {
            uid = attrs.uid;
            flags = attrs.flags || [];
          });

          msg.on('body', (stream) => {
            stream.on('data', (chunk) => chunks.push(chunk));
          });

          msg.once('end', () => {
            try {
              const rawHeaders = Buffer.concat(chunks);
              const headers = Imap.parseHeader(rawHeaders.toString('utf8'));
              const subject = decodeSubject(headers.subject?.[0] || '(no subject)');
              const dateStr = headers.date?.[0] || null;
              const parsedDate = dateStr ? new Date(dateStr) : null;
              const hasValidDate = parsedDate && !Number.isNaN(parsedDate.getTime());
              const date = hasValidDate ? parsedDate.toLocaleString() : 'No date';
              const dateRaw = hasValidDate ? parsedDate.toISOString() : '';
              const from = decodeSubject(headers.from?.[0] || '');
              const messageId = normalizeMessageId(headers['message-id']?.[0] || '');
              const inReplyTo = normalizeMessageId(headers['in-reply-to']?.[0] || '');
              const references = normalizeReferences(headers['references'] || []);
              emails.push({
                uid,
                subject,
                date,
                dateRaw,
                from,
                isUnread: !flags.includes('\\Seen'),
                previewLines: [],
                messageId,
                inReplyTo,
                references,
              });
            } catch (e) {
              emails.push({
                uid,
                subject: '(parse error)',
                date: 'No date',
                isUnread: !flags.includes('\\Seen'),
                previewLines: [],
              });
            }
            processedCount++;
            checkDone();
          });

          msg.once('error', () => {
            processedCount++;
            checkDone();
          });
        });

        fetch.once('error', (err) => settle(new Error('Fetch error: ' + err.message)));

        fetch.once('end', () => {
          fetchDone = true;
          checkDone();
        });
      }

      if (beforeUid) {
        const lastOlderUid = beforeUid - 1;
        if (lastOlderUid < 1) {
          settle(null, { emails: [], hasMore: false, total });
          return;
        }

        imap.search([['UID', `1:${lastOlderUid}`]], (searchErr, uids) => {
          if (searchErr) {
            settle(new Error('Search error: ' + searchErr.message));
            return;
          }

          const sortedUids = (uids || []).slice().sort((a, b) => Number(a) - Number(b));
          const selectedUids = sortedUids.slice(-limit);
          hasMore = sortedUids.length > selectedUids.length;

          if (!selectedUids.length) {
            settle(null, { emails: [], hasMore: false, total });
            return;
          }

          startFetch(imap.fetch(selectedUids, { bodies: 'HEADER' }));
        });
        return;
      }

      const start = Math.max(1, total - limit + 1);
      const range = `${start}:${total}`;
      hasMore = start > 1;
      startFetch(imap.seq.fetch(range, { bodies: 'HEADER' }));
    });
  });
});

ipcMain.handle('fetch-folder-unread-count', async (event, config, folderKey, mailboxMap = {}) => {
  const mailboxPath = getMailboxPath(folderKey, mailboxMap);

  return withImapConnection(config, async (imap, entry) => {
    try {
      await openBoxOnConnection(imap, entry, mailboxPath, true);
    } catch (err) {
      throw new Error(`Failed to open ${mailboxPath}: ` + err.message);
    }

    return new Promise((resolve, reject) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        reject(new Error('Timeout fetching unread count'));
      }, 15000);

      imap.search(['UNSEEN'], (searchErr, uids) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        if (searchErr) {
          reject(new Error('Search error: ' + searchErr.message));
          return;
        }
        resolve((uids || []).length);
      });
    });
  });
});

// IPC: fetch full email content by UID from selected folder
ipcMain.handle('fetch-folder-email', async (event, config, folderKey, uid, mailboxMap = {}) => {
  const mailboxPath = getMailboxPath(folderKey, mailboxMap);

  return withImapConnection(config, async (imap, entry) => {
    try {
      await openBoxOnConnection(imap, entry, mailboxPath, true);
    } catch (err) {
      throw new Error(`Failed to open ${mailboxPath}: ` + err.message);
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      function finish(err, result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(result);
      }

      const timer = setTimeout(() => finish(new Error('Timeout fetching email')), 15000);

      const fetch = imap.fetch(uid, { bodies: '' });
      let gotMessage = false;

      fetch.on('message', (msg) => {
        gotMessage = true;
        const chunks = [];
        let bodyDone = false;

        function parseAndResolve() {
          if (bodyDone) return;
          bodyDone = true;
          const rawMessageBuffer = Buffer.concat(chunks);

          simpleParser(rawMessageBuffer)
            .then((parsed) => {
              finish(null, {
                subject: parsed.subject || '(no subject)',
                date: parsed.date ? parsed.date.toLocaleString() : 'No date',
                from: parsed.from ? parsed.from.text : '',
                to: parsed.to ? parsed.to.text : '',
                cc: addressListText(parsed.cc),
                bcc: addressListText(parsed.bcc),
                replyTo: addressListText(parsed.replyTo),
                messageId: parsed.messageId ? String(parsed.messageId) : '',
                inReplyTo: normalizeMessageId(parsed.inReplyTo),
                references: normalizeReferences(parsed.references),
                text: parsed.text || '',
                html: parsed.html || '',
                attachments: serializeAttachments(parsed.attachments),
              });
            })
            .catch((e) => finish(new Error('Parse error: ' + e.message)));
        }

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.once('end', () => parseAndResolve());
        });

        msg.once('end', () => parseAndResolve());
        msg.once('error', (err) => finish(new Error('Message error: ' + err.message)));
      });

      fetch.once('error', (err) => finish(new Error('Fetch error: ' + err.message)));

      fetch.once('end', () => {
        if (!gotMessage) {
          finish(new Error('No message found for UID ' + uid));
        }
      });
    });
  });
});

// IPC: fetch full RFC822 source by UID (no mailparser — bytes as received from IMAP)
ipcMain.handle('fetch-folder-email-raw', async (event, config, folderKey, uid, mailboxMap = {}) => {
  const mailboxPath = getMailboxPath(folderKey, mailboxMap);

  return withImapConnection(config, async (imap, entry) => {
    try {
      await openBoxOnConnection(imap, entry, mailboxPath, true);
    } catch (err) {
      throw new Error(`Failed to open ${mailboxPath}: ` + err.message);
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      function finish(err, result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(result);
      }

      const timer = setTimeout(() => finish(new Error('Timeout fetching email')), 15000);

      const fetch = imap.fetch(uid, { bodies: '' });
      let gotMessage = false;

      fetch.on('message', (msg) => {
        gotMessage = true;
        const chunks = [];
        let bodyDone = false;

        function resolveRaw() {
          if (bodyDone) return;
          bodyDone = true;
          const rawMessageBuffer = Buffer.concat(chunks);
          finish(null, { rawBase64: rawMessageBuffer.toString('base64') });
        }

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.once('end', () => resolveRaw());
        });

        msg.once('end', () => resolveRaw());
        msg.once('error', (err) => finish(new Error('Message error: ' + err.message)));
      });

      fetch.once('error', (err) => finish(new Error('Fetch error: ' + err.message)));

      fetch.once('end', () => {
        if (!gotMessage) {
          finish(new Error('No message found for UID ' + uid));
        }
      });
    });
  });
});

function getFromAddress(config) {
  const authMode = config.smtpAuthMode === 'oauth2' ? 'oauth2' : 'password';
  const mirrorImap = config.smtpUseImapCredentials === true && authMode === 'password';
  const candidates = mirrorImap
    ? [config.smtpOAuthUser, config.username, config.smtpUsername]
    : [config.smtpOAuthUser, config.smtpUsername, config.username];
  for (let i = 0; i < candidates.length; i++) {
    const trimmed = String(candidates[i] || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function createSmtpTransport(config) {
  const smtpHost = String(config.smtpHost || '').trim();
  if (!smtpHost) {
    throw new Error('SMTP host is not configured.');
  }
  const secure = true;
  const port = 465;
  const authMode = config.smtpAuthMode === 'oauth2' ? 'oauth2' : 'password';
  let auth;
  if (authMode === 'oauth2') {
    auth = {
      type: 'OAuth2',
      user: getFromAddress(config),
      clientId: String(config.smtpClientId || '').trim(),
      clientSecret: String(config.smtpClientSecret || ''),
      refreshToken: String(config.smtpRefreshToken || ''),
      accessToken: String(config.smtpAccessToken || ''),
    };
    if (!auth.user) {
      throw new Error('OAuth2 user is not configured.');
    }
    if (!auth.clientId) {
      throw new Error('OAuth2 client ID is not configured.');
    }
  } else {
    const mirrorImap = config.smtpUseImapCredentials === true;
    const user = mirrorImap
      ? String(config.username || '').trim()
      : String(config.smtpUsername || config.username || '').trim();
    const pass = mirrorImap
      ? String(config.password || '')
      : String(config.smtpPassword || config.password || '');
    auth = {
      user,
      pass,
    };
  }
  return nodemailer.createTransport({
    host: smtpHost,
    port,
    secure,
    auth,
    tls: { rejectUnauthorized: false },
  });
}

function appendRawToSent(config, rawBuffer) {
  const mailboxMap = config.mailboxMap || {};
  if (!mailboxMap.sent) {
    return Promise.resolve('Sent folder is not mapped; message was sent but not saved to Sent.');
  }
  const sentPath = getMailboxPath('sent', mailboxMap);
  return withImapConnection(config, (imap) =>
    new Promise((resolve) => {
      imap.append(rawBuffer, { mailbox: sentPath, flags: ['Seen'] }, (err) => {
        if (err) resolve('Could not append to Sent: ' + err.message);
        else resolve('');
      });
    })
  );
}

ipcMain.handle('send-mail', async (event, rawConfig, payload = {}) => {
  const config = deserializeConfig(rawConfig || {});
  const from = getFromAddress(config);
  if (!from) {
    throw new Error('From address is missing.');
  }
  const transporter = createSmtpTransport(config);

  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const mailData = {
    from,
    to: payload.to || '',
    cc: payload.cc || undefined,
    bcc: payload.bcc || undefined,
    subject: payload.subject || '',
    text: payload.text || undefined,
    html: payload.html || undefined,
    inReplyTo: payload.inReplyTo || undefined,
    references: Array.isArray(payload.references)
      ? payload.references.join(' ')
      : payload.references || undefined,
    attachments: attachments
      .filter((a) => a && a.contentBase64)
      .map((a) => ({
        filename: a.filename || 'attachment',
        content: Buffer.from(String(a.contentBase64), 'base64'),
        contentType: a.contentType || 'application/octet-stream',
      })),
  };

  let mimeNode;
  try {
    mimeNode = new MailComposer(mailData).compile();
  } catch (e) {
    throw new Error('Failed to compose message: ' + e.message);
  }

  const envelope = mimeNode.getEnvelope();
  if (!envelope.to || !envelope.to.length) {
    throw new Error('No recipients defined.');
  }

  const rawMessage = await new Promise((resolve, reject) => {
    mimeNode.build((err, message) => {
      if (err) reject(err);
      else resolve(message);
    });
  });

  const info = await transporter.sendMail({ raw: rawMessage, envelope });

  let sentWarning = '';
  try {
    const w = await appendRawToSent(config, rawMessage);
    if (w) sentWarning = w;
  } catch (e) {
    sentWarning = 'Could not append to Sent: ' + e.message;
  }

  return { ok: true, messageId: info.messageId, sentWarning };
});

ipcMain.handle('set-folder-email-read-state', async (event, rawConfig, folderKey, uid, mailboxMap = {}, isRead) => {
  const config = deserializeConfig(rawConfig || {});
  const mailboxPath = getMailboxPath(folderKey, mailboxMap);
  const uidNum = Number(uid);
  if (!Number.isFinite(uidNum)) {
    throw new Error('Invalid UID');
  }

  return withImapConnection(config, async (imap, entry) => {
    try {
      await openBoxOnConnection(imap, entry, mailboxPath, false);
    } catch (err) {
      throw new Error(`Failed to open ${mailboxPath}: ` + err.message);
    }

    return new Promise((resolve, reject) => {
      const callback = (err) => {
        if (err) reject(err);
        else resolve(true);
      };
      if (isRead) {
        imap.addFlags(uidNum, '\\Seen', callback);
      } else {
        imap.delFlags(uidNum, '\\Seen', callback);
      }
    });
  });
});

ipcMain.handle('move-folder-email', async (event, rawConfig, sourceFolderKey, uid, mailboxMap = {}, targetFolderKey) => {
  const config = deserializeConfig(rawConfig || {});
  const sourcePath = getMailboxPath(sourceFolderKey, mailboxMap);
  const destPath = getMailboxPath(targetFolderKey, mailboxMap);
  const uidNum = Number(uid);
  if (!Number.isFinite(uidNum)) {
    throw new Error('Invalid UID');
  }

  return withImapConnection(config, async (imap, entry) => {
    try {
      await openBoxOnConnection(imap, entry, sourcePath, false);
    } catch (err) {
      throw new Error(`Failed to open ${sourcePath}: ` + err.message);
    }

    return new Promise((resolve, reject) => {
      imap.move(uidNum, destPath, (moveErr) => {
        if (moveErr) reject(moveErr);
        else resolve(true);
      });
    });
  });
});
