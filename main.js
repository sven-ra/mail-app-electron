const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const Imap = require('imap');

const store = new Store();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
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

// Helper: try to connect with or without TLS
function tryImapConnection(config, useTls) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.username,
      password: config.password,
      host: config.host,
      port: useTls ? 993 : 143,
      tls: useTls,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
    });

    imap.once('ready', () => {
      resolve(imap);
    });

    imap.once('error', (err) => {
      reject(err);
    });

    imap.connect();
  });
}

// IPC: fetch inbox headers (subject + date only)
ipcMain.handle('fetch-inbox', async (event, config) => {
  let imap;

  // Auto-detect TLS: try TLS on 993 first, then fallback to 143
  try {
    imap = await tryImapConnection(config, true);
  } catch (err) {
    try {
      imap = await tryImapConnection(config, false);
    } catch (err2) {
      throw new Error(`Connection failed (tried TLS and non-TLS): ${err2.message}`);
    }
  }

  return new Promise((resolve, reject) => {
    const emails = [];
    let totalFetched = 0;
    let processedCount = 0;
    let fetchDone = false;
    let resolved = false;

    function checkDone() {
      if (resolved) return;
      console.log(`[IMAP] checkDone: fetchDone=${fetchDone}, processed=${processedCount}, totalFetched=${totalFetched}`);
      if (fetchDone && processedCount === totalFetched) {
        resolved = true;
        console.log(`[IMAP] Resolving with ${emails.length} emails`);
        imap.end();
        resolve(emails);
      }
    }

    imap.openBox('INBOX', true, (err, box) => {
      if (err) {
        imap.end();
        return reject(new Error(`Failed to open INBOX: ${err.message}`));
      }

      const total = box.messages.total;
      if (total === 0) {
        imap.end();
        return resolve([]);
      }

      const start = Math.max(1, total - 49);
      const range = `${start}:${total}`;
      console.log(`[IMAP] Total messages: ${total}, fetching range: ${range}`);

      console.log(`[IMAP] Starting seq.fetch with range: ${range}`);
      const fetch = imap.seq.fetch(range, {
        bodies: 'HEADER',
      });
      console.log(`[IMAP] Fetch object created: ${typeof fetch}`);

      fetch.on('message', (msg, seqno) => {
        console.log(`[IMAP] Got message event for seqno=${seqno}`);
        totalFetched++;
        let messageDone = false;
        let chunks = [];

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

        function processMessage() {
          if (messageDone) return;
          messageDone = true;
          try {
            const parsed = parseHeaders(Buffer.concat(chunks));
            let subject = parsed.subject || '(no subject)';
            subject = decodeMimeWord(subject);
            const dateStr = parsed.date || null;
            const date = dateStr ? new Date(dateStr).toLocaleString() : 'No date';
            emails.push({ subject, date });
            console.log(`[IMAP] Parsed msg ${seqno}: subject="${subject}", date="${date}"`);
          } catch (e) {
            console.log(`[IMAP] Parse error for msg ${seqno}:`, e.message);
            emails.push({ subject: '(parse error)', date: 'No date' });
          }
          processedCount++;
          checkDone();
        }

        msg.on('body', (stream, info) => {
          console.log(`[IMAP] Body stream started for msg ${seqno}`);
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.once('end', () => {
            console.log(`[IMAP] Stream end for msg ${seqno}`);
            processMessage();
          });
        });

        msg.once('end', () => {
          console.log(`[IMAP] Msg end for ${seqno}`);
          processMessage();
        });

        msg.once('error', (err) => {
          console.log(`[IMAP] Msg error for ${seqno}:`, err.message);
          processMessage();
        });
      });

      fetch.once('error', (err) => {
        console.log(`[IMAP] Fetch error:`, err.message);
        if (!resolved) {
          resolved = true;
          imap.end();
          reject(new Error(`Fetch error: ${err.message}`));
        }
      });

      fetch.once('end', () => {
        fetchDone = true;
        console.log(`[IMAP] Fetch end signal. totalFetched=${totalFetched}, processed=${processedCount}`);
        checkDone();
      });

      // Safety timeout: if nothing resolves in 15s, force resolve
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.log(`[IMAP] Timeout: forcing resolve with ${emails.length} emails`);
          imap.end();
          resolve(emails);
        }
      }, 15000);
    });
  });
});
