const { app, BrowserWindow, ipcMain, safeStorage, Menu } = require('electron');
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
  return true;
});

// Helper: connect to IMAP (auto-detect TLS)
async function getImapConnection(config) {
  const makeConn = (useTls) => new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.username,
      password: config.password,
      host: config.host,
      port: useTls ? 993 : 143,
      tls: useTls,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
    });
    imap.once('ready', () => resolve(imap));
    imap.once('error', (err) => reject(err));
    imap.connect();
  });

  try {
    return await makeConn(true);
  } catch (err) {
    return await makeConn(false);
  }
}

function parseInboxHeaders(buf) {
  // Fast fallback parser for header-only fetches.
  const headers = Imap.parseHeader(buf.toString('utf8'));
  const subject = headers.subject?.[0] || '(no subject)';
  const dateStr = headers.date?.[0] || null;
  const from = headers.from?.[0] || '';
  return { subject, dateStr, from };
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

function getPreviewLines(text) {
  if (!text) return [];
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
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
  const imap = await getImapConnection(config);

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

// IPC: fetch folder headers (subject + date + uid)
ipcMain.handle('fetch-folder-emails', async (event, config, folderKey, mailboxMap = {}, options = {}) => {
  const imap = await getImapConnection(config);
  const mailboxPath = getMailboxPath(folderKey, mailboxMap);
  const limit = Math.max(1, Number(options.limit) || 50);
  const beforeUid = Number(options.beforeUid) || null;

  return new Promise((resolve, reject) => {
    const emails = [];
    let totalFetched = 0;
    let processedCount = 0;
    let fetchDone = false;
    let resolved = false;
    let hasMore = false;
    let total = 0;

    function checkDone() {
      if (resolved) return;
      if (fetchDone && processedCount === totalFetched) {
        resolved = true;
        imap.end();
        resolve({ emails, hasMore, total });
      }
    }

    function startFetch(fetch) {
      fetch.on('message', (msg, seqno) => {
        totalFetched++;
        let messageDone = false;
        let chunks = [];
        let uid = null;
        let flags = [];

        msg.once('attributes', (attrs) => {
          uid = attrs.uid;
          flags = attrs.flags || [];
        });

        async function processMessage() {
          if (messageDone) return;
          messageDone = true;
          try {
            const rawHeaders = Buffer.concat(chunks);
            const parsed = await simpleParser(rawHeaders, {
              skipHtmlToText: true,
              skipTextToHtml: true,
              skipImageLinks: true,
              skipTextLinks: true,
              skipHtml: true,
            });
            const fallback = parseInboxHeaders(rawHeaders);
            const subject = decodeSubject(parsed.subject || fallback.subject);
            const dateValue = parsed.date || fallback.dateStr;
            const date = dateValue ? new Date(dateValue).toLocaleString() : 'No date';
            const dateRaw = dateValue ? new Date(dateValue).toISOString() : '';
            const from =
              parsed.from?.value?.[0]?.name ||
              parsed.from?.value?.[0]?.address ||
              parsed.from?.text ||
              fallback.from ||
              '';
            const previewLines = getPreviewLines(parsed.text);
            const messageId = normalizeMessageId(parsed.messageId);
            const inReplyTo = normalizeMessageId(parsed.inReplyTo);
            const references = normalizeReferences(parsed.references);
            emails.push({
              uid,
              subject,
              date,
              dateRaw,
              from,
              isUnread: !flags.includes('\\Seen'),
              previewLines,
              messageId,
              inReplyTo,
              references,
            });
          } catch (e) {
            emails.push({ uid, subject: '(parse error)', date: 'No date', isUnread: !flags.includes('\\Seen') });
          }
          processedCount++;
          checkDone();
        }

        msg.on('body', (stream, info) => {
          stream.on('data', (chunk) => chunks.push(chunk));
        });

        msg.once('end', () => processMessage());
        msg.once('error', () => processMessage());
      });

      fetch.once('error', (err) => {
        if (!resolved) {
          resolved = true;
          imap.end();
          reject(new Error('Fetch error: ' + err.message));
        }
      });

      fetch.once('end', () => {
        fetchDone = true;
        checkDone();
      });
    }

    imap.openBox(mailboxPath, true, (err, box) => {
      if (err) {
        imap.end();
        return reject(new Error(`Failed to open ${mailboxPath}: ` + err.message));
      }

      total = box.messages.total;
      if (total === 0) {
        imap.end();
        return resolve({ emails: [], hasMore: false, total });
      }

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          imap.end();
          resolve({ emails, hasMore, total });
        }
      }, 15000);

      if (beforeUid) {
        const lastOlderUid = beforeUid - 1;
        if (lastOlderUid < 1) {
          resolved = true;
          imap.end();
          return resolve({ emails: [], hasMore: false, total });
        }

        imap.search([['UID', `1:${lastOlderUid}`]], (searchErr, uids) => {
          if (searchErr) {
            if (!resolved) {
              resolved = true;
              imap.end();
              reject(new Error('Search error: ' + searchErr.message));
            }
            return;
          }

          const sortedUids = (uids || []).slice().sort((a, b) => Number(a) - Number(b));
          const selectedUids = sortedUids.slice(-limit);
          hasMore = sortedUids.length > selectedUids.length;

          if (!selectedUids.length) {
            resolved = true;
            imap.end();
            resolve({ emails: [], hasMore: false, total });
            return;
          }

          startFetch(imap.fetch(selectedUids, { bodies: '' }));
        });
        return;
      }

      const start = Math.max(1, total - limit + 1);
      const range = `${start}:${total}`;
      hasMore = start > 1;
      startFetch(imap.seq.fetch(range, { bodies: '' }));
    });
  });
});

ipcMain.handle('fetch-folder-unread-count', async (event, config, folderKey, mailboxMap = {}) => {
  const imap = await getImapConnection(config);
  const mailboxPath = getMailboxPath(folderKey, mailboxMap);

  return new Promise((resolve, reject) => {
    let resolved = false;

    function finish(err, count) {
      if (resolved) return;
      resolved = true;
      imap.end();
      if (err) reject(err);
      else resolve(count);
    }

    imap.openBox(mailboxPath, true, (err) => {
      if (err) {
        finish(new Error(`Failed to open ${mailboxPath}: ` + err.message));
        return;
      }

      imap.search(['UNSEEN'], (searchErr, uids) => {
        if (searchErr) {
          finish(new Error('Search error: ' + searchErr.message));
          return;
        }
        finish(null, (uids || []).length);
      });

      setTimeout(() => {
        finish(new Error('Timeout fetching unread count'));
      }, 15000);
    });
  });
});

// IPC: fetch full email content by UID from selected folder
ipcMain.handle('fetch-folder-email', async (event, config, folderKey, uid, mailboxMap = {}) => {
  const imap = await getImapConnection(config);
  const mailboxPath = getMailboxPath(folderKey, mailboxMap);

  return new Promise((resolve, reject) => {
    let collected = false;

    function finish(err, result) {
      if (collected) return;
      collected = true;
      imap.end();
      if (err) reject(err);
      else resolve(result);
    }

    imap.openBox(mailboxPath, true, (err, box) => {
      if (err) {
        return finish(new Error(`Failed to open ${mailboxPath}: ` + err.message));
      }

      const fetch = imap.fetch(uid, { bodies: '' });
      let gotMessage = false;

      fetch.on('message', (msg, seqno) => {
        gotMessage = true;
        let chunks = [];
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

        msg.on('body', (stream, info) => {
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.once('end', () => parseAndResolve());
        });

        msg.once('end', () => parseAndResolve());
        msg.once('error', (err) => finish(new Error('Message error: ' + err.message)));
      });

      fetch.once('error', (err) => {
        finish(new Error('Fetch error: ' + err.message));
      });

      fetch.once('end', () => {
        if (!gotMessage) {
          finish(new Error('No message found for UID ' + uid));
        }
      });

      setTimeout(() => {
        if (!collected) {
          finish(new Error('Timeout fetching email'));
        }
      }, 15000);
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
  return getImapConnection(config).then(
    (imap) =>
      new Promise((resolve) => {
        imap.append(rawBuffer, { mailbox: sentPath, flags: ['Seen'] }, (err) => {
          imap.end();
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

ipcMain.handle('move-folder-email', async (event, rawConfig, sourceFolderKey, uid, mailboxMap = {}, targetFolderKey) => {
  const config = deserializeConfig(rawConfig || {});
  const imap = await getImapConnection(config);
  const sourcePath = getMailboxPath(sourceFolderKey, mailboxMap);
  const destPath = getMailboxPath(targetFolderKey, mailboxMap);

  return new Promise((resolve, reject) => {
    imap.openBox(sourcePath, false, (err) => {
      if (err) {
        imap.end();
        reject(new Error(`Failed to open ${sourcePath}: ` + err.message));
        return;
      }
      const uidNum = Number(uid);
      if (!Number.isFinite(uidNum)) {
        imap.end();
        reject(new Error('Invalid UID'));
        return;
      }
      imap.move(uidNum, destPath, (moveErr) => {
        imap.end();
        if (moveErr) reject(moveErr);
        else resolve(true);
      });
    });
  });
});
