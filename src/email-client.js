const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

// Common email provider presets
const PROVIDER_PRESETS = {
  'gmail': {
    name: 'Gmail',
    imap: { host: 'imap.gmail.com', port: 993, tls: true },
    smtp: { host: 'smtp.gmail.com', port: 587, secure: false },
    note: 'Requires App Password (enable 2FA first)'
  },
  'outlook': {
    name: 'Outlook/Hotmail',
    imap: { host: 'outlook.office365.com', port: 993, tls: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    note: 'Use your regular password or App Password'
  },
  'yahoo': {
    name: 'Yahoo Mail',
    imap: { host: 'imap.mail.yahoo.com', port: 993, tls: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 587, secure: false },
    note: 'Requires App Password'
  },
  'icloud': {
    name: 'iCloud Mail',
    imap: { host: 'imap.mail.me.com', port: 993, tls: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    note: 'Requires App-Specific Password'
  },
  'custom': {
    name: 'Custom IMAP/SMTP',
    imap: { host: '', port: 993, tls: true },
    smtp: { host: '', port: 587, secure: false },
    note: 'Enter your server details manually'
  }
};

class EmailClient {
  constructor(config) {
    this.config = config;
    this.imap = null;
    this.transporter = null;
    this.connected = false;
  }

  // Test connection
  async testConnection() {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: this.config.email,
        password: this.config.password,
        host: this.config.imap.host,
        port: this.config.imap.port,
        tls: this.config.imap.tls,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000
      });

      const timeout = setTimeout(() => {
        try { imap.end(); } catch(e) {}
        reject({ success: false, error: 'Connection timeout' });
      }, 15000);

      imap.once('ready', () => {
        clearTimeout(timeout);
        imap.end();
        resolve({ success: true });
      });

      imap.once('error', (err) => {
        clearTimeout(timeout);
        reject({ success: false, error: err.message });
      });

      imap.connect();
    });
  }

  // Connect to IMAP
  async connect() {
    return new Promise((resolve, reject) => {
      this.imap = new Imap({
        user: this.config.email,
        password: this.config.password,
        host: this.config.imap.host,
        port: this.config.imap.port,
        tls: this.config.imap.tls,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000,
        keepalive: {
          interval: 10000,
          idleInterval: 300000,
          forceNoop: true
        }
      });

      this.imap.once('ready', () => {
        this.connected = true;
        
        // Setup SMTP transporter
        this.transporter = nodemailer.createTransport({
          host: this.config.smtp.host,
          port: this.config.smtp.port,
          secure: this.config.smtp.secure,
          auth: {
            user: this.config.email,
            pass: this.config.password
          }
        });
        
        resolve({ success: true });
      });

      this.imap.once('error', (err) => {
        this.connected = false;
        reject({ success: false, error: err.message });
      });

      this.imap.once('end', () => {
        this.connected = false;
      });

      this.imap.connect();
    });
  }

  // Disconnect
  disconnect() {
    if (this.imap) {
      try {
        this.imap.end();
      } catch (e) {
        // Ignore
      }
      this.connected = false;
    }
  }

  // Check if connected
  isConnected() {
    return this.connected && this.imap && this.imap.state === 'authenticated';
  }

  // Get mailboxes/folders
  async getMailboxes() {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }
    
    return new Promise((resolve, reject) => {
      this.imap.getBoxes((err, boxes) => {
        if (err) reject(err);
        else {
          // Flatten the mailbox structure
          const flatList = [];
          const processBoxes = (boxes, prefix = '') => {
            for (const [name, box] of Object.entries(boxes)) {
              const fullName = prefix ? `${prefix}${box.delimiter}${name}` : name;
              flatList.push({
                name: name,
                path: fullName,
                delimiter: box.delimiter,
                flags: box.attribs || [],
                children: box.children ? Object.keys(box.children) : []
              });
              if (box.children) {
                processBoxes(box.children, fullName);
              }
            }
          };
          processBoxes(boxes);
          resolve(flatList);
        }
      });
    });
  }

  // Get emails from a folder
  async getEmails(folder = 'INBOX', limit = 100) {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      this.imap.openBox(folder, true, async (err, box) => {
        if (err) {
          reject(err);
          return;
        }

        const total = box.messages.total;
        if (total === 0) {
          resolve([]);
          return;
        }

        const start = Math.max(1, total - limit + 1);
        const range = `${start}:${total}`;
        
        const emailPromises = [];
        
        const fetch = this.imap.seq.fetch(range, {
          bodies: '',
          struct: true
        });

        fetch.on('message', (msg, seqno) => {
          // Create a promise for each message
          const emailPromise = new Promise((resolveEmail) => {
            let buffer = '';
            let attributes = null;

            msg.on('body', (stream) => {
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
            });

            msg.once('attributes', (attrs) => {
              attributes = attrs;
            });

            msg.once('end', async () => {
              try {
                const parsed = await simpleParser(buffer);
                
                // Extract sender name/email properly
                let fromText = 'Unknown';
                let fromFull = 'Unknown';
                if (parsed.from && parsed.from.value && parsed.from.value.length > 0) {
                  const sender = parsed.from.value[0];
                  fromText = sender.name || sender.address || 'Unknown';
                  fromFull = parsed.from.text || fromText;
                } else if (parsed.from && parsed.from.text) {
                  fromText = parsed.from.text;
                  fromFull = fromText;
                }

                // Handle date properly
                let emailDate = null;
                if (parsed.date) {
                  emailDate = parsed.date;
                } else if (parsed.headers && parsed.headers.get('date')) {
                  try {
                    emailDate = new Date(parsed.headers.get('date'));
                  } catch(e) {}
                }
                
                // Fallback to internal date from IMAP
                if (!emailDate || isNaN(new Date(emailDate).getTime())) {
                  emailDate = attributes?.date || new Date();
                }

                // Get text content
                let textContent = parsed.text || '';
                let htmlContent = parsed.html || '';
                
                // If no text but has HTML, create text from HTML
                if (!textContent && htmlContent) {
                  textContent = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                }

                const emailData = {
                  seqno,
                  uid: attributes?.uid,
                  id: parsed.messageId || `msg-${seqno}`,
                  from: fromText,
                  fromFull: fromFull,
                  to: parsed.to?.text || '',
                  subject: parsed.subject || '(No Subject)',
                  date: emailDate,
                  text: textContent,
                  html: htmlContent,
                  flags: attributes?.flags || [],
                  isRead: attributes?.flags?.includes('\\Seen') || false,
                  isStarred: attributes?.flags?.includes('\\Flagged') || false,
                  hasAttachments: (parsed.attachments || []).length > 0,
                  attachments: (parsed.attachments || []).map(a => ({
                    filename: a.filename || 'attachment',
                    size: a.size || 0,
                    contentType: a.contentType || 'application/octet-stream'
                  }))
                };

                resolveEmail(emailData);
              } catch (e) {
                console.error('Parse error for message', seqno, ':', e.message);
                // Return a minimal email object on parse error
                resolveEmail({
                  seqno,
                  uid: attributes?.uid,
                  id: `msg-${seqno}`,
                  from: 'Unknown',
                  fromFull: 'Unknown',
                  subject: '(Could not parse email)',
                  date: attributes?.date || new Date(),
                  text: '',
                  html: '',
                  flags: attributes?.flags || [],
                  isRead: attributes?.flags?.includes('\\Seen') || false,
                  isStarred: false,
                  hasAttachments: false,
                  attachments: []
                });
              }
            });
          });

          emailPromises.push(emailPromise);
        });

        fetch.once('error', (err) => {
          reject(err);
        });

        fetch.once('end', async () => {
          try {
            // Wait for all emails to be parsed
            const emails = await Promise.all(emailPromises);
            
            // Sort by date descending (newest first)
            emails.sort((a, b) => {
              const dateA = new Date(a.date);
              const dateB = new Date(b.date);
              if (isNaN(dateA.getTime())) return 1;
              if (isNaN(dateB.getTime())) return -1;
              return dateB - dateA;
            });
            
            resolve(emails);
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  }

  // Send email
  async sendEmail(to, subject, text, html = null) {
    if (!this.transporter) {
      throw new Error('Not connected');
    }

    const mailOptions = {
      from: this.config.email,
      to,
      subject,
      text,
      html: html || text
    };

    return this.transporter.sendMail(mailOptions);
  }

  // Mark as read
  async markAsRead(uid) {
    if (!this.isConnected()) return false;
    
    return new Promise((resolve, reject) => {
      this.imap.addFlags(uid, ['\\Seen'], (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  // Mark as unread
  async markAsUnread(uid) {
    if (!this.isConnected()) return false;
    
    return new Promise((resolve, reject) => {
      this.imap.delFlags(uid, ['\\Seen'], (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  // Star/unstar email
  async toggleStar(uid, starred) {
    if (!this.isConnected()) return false;
    
    return new Promise((resolve, reject) => {
      const method = starred ? 'addFlags' : 'delFlags';
      this.imap[method](uid, ['\\Flagged'], (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  // Delete email (move to trash)
  async deleteEmail(uid) {
    if (!this.isConnected()) return false;
    
    return new Promise((resolve, reject) => {
      this.imap.addFlags(uid, ['\\Deleted'], (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.imap.expunge((err) => {
          if (err) reject(err);
          else resolve(true);
        });
      });
    });
  }
}

module.exports = { EmailClient, PROVIDER_PRESETS };
