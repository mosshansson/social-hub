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
        tlsOptions: { rejectUnauthorized: false }
      });

      imap.once('ready', () => {
        imap.end();
        resolve({ success: true });
      });

      imap.once('error', (err) => {
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
        tlsOptions: { rejectUnauthorized: false }
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

      this.imap.connect();
    });
  }

  // Disconnect
  disconnect() {
    if (this.imap) {
      this.imap.end();
      this.connected = false;
    }
  }

  // Get mailboxes/folders
  async getMailboxes() {
    return new Promise((resolve, reject) => {
      this.imap.getBoxes((err, boxes) => {
        if (err) reject(err);
        else resolve(boxes);
      });
    });
  }

  // Get emails from a folder
  async getEmails(folder = 'INBOX', limit = 50) {
    return new Promise((resolve, reject) => {
      this.imap.openBox(folder, true, (err, box) => {
        if (err) {
          reject(err);
          return;
        }

        const total = box.messages.total;
        const start = Math.max(1, total - limit + 1);
        const range = `${start}:${total}`;

        const emails = [];
        const fetch = this.imap.seq.fetch(range, {
          bodies: '',
          struct: true
        });

        fetch.on('message', (msg, seqno) => {
          let emailData = { seqno };
          
          msg.on('body', (stream) => {
            let buffer = '';
            stream.on('data', (chunk) => {
              buffer += chunk.toString('utf8');
            });
            stream.on('end', async () => {
              try {
                const parsed = await simpleParser(buffer);
                emailData = {
                  ...emailData,
                  id: parsed.messageId,
                  from: parsed.from?.text || 'Unknown',
                  to: parsed.to?.text || '',
                  subject: parsed.subject || '(No Subject)',
                  date: parsed.date,
                  text: parsed.text || '',
                  html: parsed.html || '',
                  attachments: (parsed.attachments || []).map(a => ({
                    filename: a.filename,
                    size: a.size,
                    contentType: a.contentType
                  }))
                };
              } catch (e) {
                console.error('Parse error:', e);
              }
            });
          });

          msg.once('attributes', (attrs) => {
            emailData.uid = attrs.uid;
            emailData.flags = attrs.flags;
            emailData.isRead = attrs.flags.includes('\\Seen');
            emailData.isStarred = attrs.flags.includes('\\Flagged');
          });

          msg.once('end', () => {
            emails.push(emailData);
          });
        });

        fetch.once('error', (err) => {
          reject(err);
        });

        fetch.once('end', () => {
          // Sort by date descending
          emails.sort((a, b) => new Date(b.date) - new Date(a.date));
          resolve(emails);
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
    return new Promise((resolve, reject) => {
      this.imap.addFlags(uid, ['\\Seen'], (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  // Mark as unread
  async markAsUnread(uid) {
    return new Promise((resolve, reject) => {
      this.imap.delFlags(uid, ['\\Seen'], (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  // Delete email
  async deleteEmail(uid) {
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
