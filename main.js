const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const Imap = require('imap');
const { simpleParser } = require('mailparser');

const store = new Store();

let mainWindow;

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

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: get saved IMAP config
ipcMain.handle('get-config', () => {
  return store.get('imapConfig') || {};
});

// IPC: save IMAP config
ipcMain.handle('save-config', (event, config) => {
  store.set('imapConfig', config);
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

function decodeMimeWord(str) {
  return str.replace(/=\?([\w-]+)\?(Q|B)\?([^?]+)\?=/gi, (match, charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === 'Q') {
        const decoded = text.replace(/_/g, ' ')
          .replace(/=([0-9A-F]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));
        return decoded;
      } else if (encoding.toUpperCase() === 'B') {
        const decoded = Buffer.from(text.replace(/[^A-Za-z0-9+\/=]/g, ''), 'base64').toString();
        return decoded;
      }
    } catch (e) {
      return match;
    }
    return match;
  });
}

function parseHeaders(buf) {
  const text = buf.toString('utf8');
  const lines = text.split(/\r?\n/);
  const headers = {};
  let currentKey = null;

  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (currentKey) {
        headers[currentKey] = (headers[currentKey] || '') + line;
      }
    } else {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        currentKey = match[1].toLowerCase();
        headers[currentKey] = match[2];
      } else {
        currentKey = null;
      }
    }
  }
  return headers;
}

// IPC: fetch inbox headers (subject + date + uid)
ipcMain.handle('fetch-inbox', async (event, config) => {
  const imap = await getImapConnection(config);

  return new Promise((resolve, reject) => {
    const emails = [];
    let totalFetched = 0;
    let processedCount = 0;
    let fetchDone = false;
    let resolved = false;

    function checkDone() {
      if (resolved) return;
      if (fetchDone && processedCount === totalFetched) {
        resolved = true;
        imap.end();
        resolve(emails);
      }
    }

    imap.openBox('INBOX', true, (err, box) => {
      if (err) {
        imap.end();
        return reject(new Error('Failed to open INBOX: ' + err.message));
      }

      const total = box.messages.total;
      if (total === 0) {
        imap.end();
        return resolve([]);
      }

      const start = Math.max(1, total - 49);
      const range = `${start}:${total}`;
      const fetch = imap.seq.fetch(range, { bodies: 'HEADER' });

      fetch.on('message', (msg, seqno) => {
        totalFetched++;
        let messageDone = false;
        let chunks = [];
        let uid = null;

        msg.once('attributes', (attrs) => {
          uid = attrs.uid;
        });

        function processMessage() {
          if (messageDone) return;
          messageDone = true;
          try {
            const parsed = parseHeaders(Buffer.concat(chunks));
            let subject = parsed.subject || '(no subject)';
            subject = decodeMimeWord(subject);
            const dateStr = parsed.date || null;
            const date = dateStr ? new Date(dateStr).toLocaleString() : 'No date';
            emails.push({ uid, subject, date });
          } catch (e) {
            emails.push({ uid, subject: '(parse error)', date: 'No date' });
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

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          imap.end();
          resolve(emails);
        }
      }, 15000);
    });
  });
});

// IPC: fetch full email content by UID
ipcMain.handle('fetch-email', async (event, config, uid) => {
  const imap = await getImapConnection(config);

  return new Promise((resolve, reject) => {
    let collected = false;

    function finish(err, result) {
      if (collected) return;
      collected = true;
      imap.end();
      if (err) reject(err);
      else resolve(result);
    }

    imap.openBox('INBOX', true, (err, box) => {
      if (err) {
        return finish(new Error('Failed to open INBOX: ' + err.message));
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
          simpleParser(Buffer.concat(chunks))
            .then((parsed) => {
              finish(null, {
                subject: parsed.subject || '(no subject)',
                date: parsed.date ? parsed.date.toLocaleString() : 'No date',
                from: parsed.from ? parsed.from.text : '',
                to: parsed.to ? parsed.to.text : '',
                text: parsed.text || '',
                html: parsed.html || '',
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
