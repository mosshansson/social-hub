const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

// Common email provider presets
const PROVIDER_PRESETS = {
  'gmail': {
    name: 'Gmail',
    imap: { host: 'imap.gmail.com', port: 993, tls: true },
    smtp: { host: 'smtp.gmail.com', port: 587, secure: false },
    note: 'Requires App Password (enable 2FA first)',
    folders: {
      sent: '[Gmail]/Sent Mail',
      drafts: '[Gmail]/Drafts',
      trash: '[Gmail]/Trash',
      spam: '[Gmail]/Spam',
      archive: '[Gmail]/All Mail',
      starred: '[Gmail]/Starred'
    }
  },
  'outlook': {
    name: 'Outlook/Hotmail',
    imap: { host: 'outlook.office365.com', port: 993, tls: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    note: 'Use your regular password or App Password',
    folders: {
      sent: 'Sent',
      drafts: 'Drafts',
      trash: 'Deleted',
      spam: 'Junk',
      archive: 'Archive'
    }
  },
  'yahoo': {
    name: 'Yahoo Mail',
    imap: { host: 'imap.mail.yahoo.com', port: 993, tls: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 587, secure: false },
    note: 'Requires App Password',
    folders: {
      sent: 'Sent',
      drafts: 'Draft',
      trash: 'Trash',
      spam: 'Bulk Mail',
      archive: 'Archive'
    }
  },
  'icloud': {
    name: 'iCloud Mail',
    imap: { host: 'imap.mail.me.com', port: 993, tls: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    note: 'Requires App-Specific Password',
    folders: {
      sent: 'Sent Messages',
      drafts: 'Drafts',
      trash: 'Deleted Messages',
      spam: 'Junk',
      archive: 'Archive'
    }
  },
  'custom': {
    name: 'Custom IMAP/SMTP',
    imap: { host: '', port: 993, tls: true },
    smtp: { host: '', port: 587, secure: false },
    note: 'Enter your server details manually',
    folders: {
      sent: 'Sent',
      drafts: 'Drafts',
      trash: 'Trash',
      spam: 'Spam',
      archive: 'Archive'
    }
  }
};

class EmailClient {
  constructor(config) {
    this.config = config;
    this.imap = null;
    this.transporter = null;
    this.connected = false;
    this.currentBox = null;
    this.folderCache = null;
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
          this.folderCache = flatList;
          resolve(flatList);
        }
      });
    });
  }

  // Find special folder path
  findSpecialFolder(type) {
    const providerFolders = PROVIDER_PRESETS[this.config.provider]?.folders || {};
    const defaultPath = providerFolders[type];
    
    if (!this.folderCache) return defaultPath;
    
    // Try to find the folder
    const searchNames = {
      trash: ['Trash', 'Deleted', 'Deleted Items', 'Deleted Messages', '[Gmail]/Trash'],
      archive: ['Archive', 'All Mail', '[Gmail]/All Mail'],
      spam: ['Spam', 'Junk', 'Junk E-mail', 'Bulk Mail', '[Gmail]/Spam'],
      sent: ['Sent', 'Sent Items', 'Sent Messages', 'Sent Mail', '[Gmail]/Sent Mail'],
      drafts: ['Drafts', 'Draft', '[Gmail]/Drafts']
    };
    
    const names = searchNames[type] || [defaultPath];
    for (const name of names) {
      const found = this.folderCache.find(f => 
        f.path.toLowerCase() === name.toLowerCase() ||
        f.name.toLowerCase() === name.toLowerCase()
      );
      if (found) return found.path;
    }
    
    return defaultPath;
  }

  // Open a mailbox
  async openBox(folder, readOnly = false) {
    if (!this.isConnected()) {
      throw new Error('Not connected');
    }
    
    return new Promise((resolve, reject) => {
      this.imap.openBox(folder, readOnly, (err, box) => {
        if (err) reject(err);
        else {
          this.currentBox = folder;
          resolve(box);
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
        
        this.currentBox = folder;
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
                
                let fromText = 'Unknown';
                let fromFull = 'Unknown';
                let fromEmail = '';
                if (parsed.from && parsed.from.value && parsed.from.value.length > 0) {
                  const sender = parsed.from.value[0];
                  fromText = sender.name || sender.address || 'Unknown';
                  fromFull = parsed.from.text || fromText;
                  fromEmail = sender.address || '';
                } else if (parsed.from && parsed.from.text) {
                  fromText = parsed.from.text;
                  fromFull = fromText;
                }

                let emailDate = null;
                if (parsed.date) {
                  emailDate = parsed.date;
                } else if (parsed.headers && parsed.headers.get('date')) {
                  try {
                    emailDate = new Date(parsed.headers.get('date'));
                  } catch(e) {}
                }
                
                if (!emailDate || isNaN(new Date(emailDate).getTime())) {
                  emailDate = attributes?.date || new Date();
                }

                let textContent = parsed.text || '';
                let htmlContent = parsed.html || '';
                
                if (!textContent && htmlContent) {
                  textContent = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                }

                // Extract reply-to
                let replyTo = fromEmail;
                if (parsed.replyTo && parsed.replyTo.value && parsed.replyTo.value.length > 0) {
                  replyTo = parsed.replyTo.value[0].address || fromEmail;
                }

                const emailData = {
                  seqno,
                  uid: attributes?.uid,
                  id: parsed.messageId || `msg-${seqno}`,
                  from: fromText,
                  fromFull: fromFull,
                  fromEmail: fromEmail,
                  replyTo: replyTo,
                  to: parsed.to?.text || '',
                  cc: parsed.cc?.text || '',
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
                resolveEmail({
                  seqno,
                  uid: attributes?.uid,
                  id: `msg-${seqno}`,
                  from: 'Unknown',
                  fromFull: 'Unknown',
                  fromEmail: '',
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
            const emails = await Promise.all(emailPromises);
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
  async sendEmail(options) {
    if (!this.transporter) {
      throw new Error('Not connected');
    }

    const mailOptions = {
      from: this.config.email,
      to: options.to,
      cc: options.cc || '',
      bcc: options.bcc || '',
      subject: options.subject,
      text: options.text,
      html: options.html || options.text,
      inReplyTo: options.inReplyTo || '',
      references: options.references || ''
    };

    const result = await this.transporter.sendMail(mailOptions);
    return result;
  }

  // Mark as read
  async markAsRead(uid, folder = null) {
    if (!this.isConnected()) return false;
    
    if (folder && folder !== this.currentBox) {
      await this.openBox(folder, false);
    }
    
    return new Promise((resolve, reject) => {
      this.imap.addFlags(uid, ['\\Seen'], (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  // Mark as unread
  async markAsUnread(uid, folder = null) {
    if (!this.isConnected()) return false;
    
    if (folder && folder !== this.currentBox) {
      await this.openBox(folder, false);
    }
    
    return new Promise((resolve, reject) => {
      this.imap.delFlags(uid, ['\\Seen'], (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  // Star email
  async starEmail(uid, folder = null) {
    if (!this.isConnected()) return false;
    
    if (folder && folder !== this.currentBox) {
      await this.openBox(folder, false);
    }
    
    return new Promise((resolve, reject) => {
      this.imap.addFlags(uid, ['\\Flagged'], (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  // Unstar email
  async unstarEmail(uid, folder = null) {
    if (!this.isConnected()) return false;
    
    if (folder && folder !== this.currentBox) {
      await this.openBox(folder, false);
    }
    
    return new Promise((resolve, reject) => {
      this.imap.delFlags(uid, ['\\Flagged'], (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  // Move email to folder
  async moveEmail(uid, destFolder, srcFolder = null) {
    if (!this.isConnected()) return false;
    
    if (srcFolder && srcFolder !== this.currentBox) {
      await this.openBox(srcFolder, false);
    }
    
    return new Promise((resolve, reject) => {
      this.imap.move(uid, destFolder, (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  // Copy email to folder
  async copyEmail(uid, destFolder, srcFolder = null) {
    if (!this.isConnected()) return false;
    
    if (srcFolder && srcFolder !== this.currentBox) {
      await this.openBox(srcFolder, false);
    }
    
    return new Promise((resolve, reject) => {
      this.imap.copy(uid, destFolder, (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  // Archive email (move to archive folder)
  async archiveEmail(uid, srcFolder = null) {
    const archiveFolder = this.findSpecialFolder('archive');
    if (!archiveFolder) {
      throw new Error('Archive folder not found');
    }
    return this.moveEmail(uid, archiveFolder, srcFolder);
  }

  // Move to trash
  async trashEmail(uid, srcFolder = null) {
    const trashFolder = this.findSpecialFolder('trash');
    if (!trashFolder) {
      throw new Error('Trash folder not found');
    }
    return this.moveEmail(uid, trashFolder, srcFolder);
  }

  // Mark as spam
  async spamEmail(uid, srcFolder = null) {
    const spamFolder = this.findSpecialFolder('spam');
    if (!spamFolder) {
      throw new Error('Spam folder not found');
    }
    return this.moveEmail(uid, spamFolder, srcFolder);
  }

  // Permanently delete email
  async deleteEmail(uid, folder = null) {
    if (!this.isConnected()) return false;
    
    if (folder && folder !== this.currentBox) {
      await this.openBox(folder, false);
    }
    
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
