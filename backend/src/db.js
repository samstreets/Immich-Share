const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/app.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();

  // Admin users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      totp_secret TEXT,
      totp_enabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate admin_users: add TOTP columns if missing
  const adminCols = db.prepare("PRAGMA table_info(admin_users)").all().map(c => c.name);
  if (!adminCols.includes('totp_secret')) {
    db.exec(`ALTER TABLE admin_users ADD COLUMN totp_secret TEXT`);
    console.log('✅ admin_users.totp_secret column added');
  }
  if (!adminCols.includes('totp_enabled')) {
    db.exec(`ALTER TABLE admin_users ADD COLUMN totp_enabled INTEGER DEFAULT 0`);
    console.log('✅ admin_users.totp_enabled column added');
  }

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Shares table
  db.exec(`
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      immich_album_id TEXT,
      immich_tag_id TEXT,
      share_type TEXT NOT NULL DEFAULT 'album',
      password_hash TEXT NOT NULL,
      expires_at DATETIME,
      allow_download INTEGER DEFAULT 1,
      allow_upload INTEGER DEFAULT 0,
      show_metadata INTEGER DEFAULT 0,
      upload_tag_ids TEXT,
      view_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    )
  `);

  // Migrate shares columns
  const cols = db.prepare("PRAGMA table_info(shares)").all().map(c => c.name);

  if (!cols.includes('immich_tag_id')) {
    db.exec(`ALTER TABLE shares ADD COLUMN immich_tag_id TEXT`);
  }
  if (!cols.includes('allow_upload')) {
    db.exec(`ALTER TABLE shares ADD COLUMN allow_upload INTEGER DEFAULT 0`);
  }
  if (!cols.includes('slug')) {
    db.exec(`ALTER TABLE shares ADD COLUMN slug TEXT`);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_slug
      ON shares(slug) WHERE slug IS NOT NULL
    `);
  }
  if (!cols.includes('upload_tag_ids')) {
    db.exec(`ALTER TABLE shares ADD COLUMN upload_tag_ids TEXT`);
    console.log('✅ shares.upload_tag_ids column added');
  }
  if (!cols.includes('watch_tag_ids')) {
    db.exec(`ALTER TABLE shares ADD COLUMN watch_tag_ids TEXT`);
    console.log('✅ shares.watch_tag_ids column added');
  }
  if (!cols.includes('watch_last_seen_ids')) {
    db.exec(`ALTER TABLE shares ADD COLUMN watch_last_seen_ids TEXT`);
    console.log('✅ shares.watch_last_seen_ids column added');
  }
  // Passwordless access token (static token embedded in URL, no password needed)
  if (!cols.includes('access_token')) {
    db.exec(`ALTER TABLE shares ADD COLUMN access_token TEXT`);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_access_token
      ON shares(access_token) WHERE access_token IS NOT NULL
    `);
    console.log('✅ shares.access_token column added');
  }
  // Max views before auto-disable (null = unlimited)
  if (!cols.includes('max_views')) {
    db.exec(`ALTER TABLE shares ADD COLUMN max_views INTEGER`);
    console.log('✅ shares.max_views column added');
  }
  // Webhook URL called on each upload to this share
  if (!cols.includes('webhook_url')) {
    db.exec(`ALTER TABLE shares ADD COLUMN webhook_url TEXT`);
    console.log('✅ shares.webhook_url column added');
  }
  // Email address notified on each upload to this share
  if (!cols.includes('notify_email')) {
    db.exec(`ALTER TABLE shares ADD COLUMN notify_email TEXT`);
    console.log('✅ shares.notify_email column added');
  }

  // Share access logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS access_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      share_id TEXT NOT NULL,
      share_name TEXT,
      ip_address TEXT,
      user_agent TEXT,
      action TEXT DEFAULT 'view',
      accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (share_id) REFERENCES shares(id)
    )
  `);

  // Migrate access_logs columns
  const logCols = db.prepare("PRAGMA table_info(access_logs)").all().map(c => c.name);
  if (!logCols.includes('action')) {
    db.exec(`ALTER TABLE access_logs ADD COLUMN action TEXT DEFAULT 'view'`);
  }
  if (!logCols.includes('share_name')) {
    db.exec(`ALTER TABLE access_logs ADD COLUMN share_name TEXT`);
  }

  // Migrate: recreate access_logs with ON DELETE CASCADE if not already set.
  const fkInfo = db.prepare("PRAGMA foreign_key_list(access_logs)").all();
  const hasCascade = fkInfo.some(fk => fk.table === 'shares' && fk.on_delete === 'CASCADE');
  if (!hasCascade) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE access_logs_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        share_id TEXT NOT NULL,
        share_name TEXT,
        ip_address TEXT,
        user_agent TEXT,
        action TEXT DEFAULT 'view',
        accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE
      );
      INSERT INTO access_logs_new
        SELECT id, share_id, share_name, ip_address, user_agent, action, accessed_at
        FROM access_logs
        WHERE share_id IN (SELECT id FROM shares);
      DROP TABLE access_logs;
      ALTER TABLE access_logs_new RENAME TO access_logs;
    `);
    db.pragma('foreign_keys = ON');
    console.log('✅ access_logs migrated to ON DELETE CASCADE');
  }

  // Create default admin if none exists
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admin_users').get();
  if (adminCount.count === 0) {
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin';
    const hash = bcrypt.hashSync(defaultPassword, 12);
    db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('admin', hash);
    console.log(`✅ Default admin created (username: admin). Change the password in Settings immediately!`);
  }

  // Default settings — seed from env vars on first boot only
  const defaults = {
    immich_url: '',
    immich_api_key: '',
    external_url: `http://localhost:${process.env.PORT || 3000}`,
    app_name: 'Immich Share',
    allowed_origins: '',
    // Email / SMTP settings
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    smtp_from: '',
    smtp_secure: '0',
    // Global webhook (fired for all shares unless overridden per-share)
    global_webhook_url: '',
    global_webhook_secret: '',
    // Cleanup settings
    cleanup_expired_shares: '0',
    cleanup_chunk_max_age_hours: '24',
  };

  for (const [key, value] of Object.entries(defaults)) {
    const existing = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
    if (!existing) {
      let seedValue = value;
      if (key === 'immich_url' && process.env.IMMICH_URL) seedValue = process.env.IMMICH_URL;
      if (key === 'immich_api_key' && process.env.IMMICH_API_KEY) seedValue = process.env.IMMICH_API_KEY;
      if (key === 'external_url' && process.env.EXTERNAL_URL) seedValue = process.env.EXTERNAL_URL;
      if (key === 'allowed_origins' && process.env.ALLOWED_ORIGINS) seedValue = process.env.ALLOWED_ORIGINS;
      if (key === 'smtp_host' && process.env.SMTP_HOST) seedValue = process.env.SMTP_HOST;
      if (key === 'smtp_port' && process.env.SMTP_PORT) seedValue = process.env.SMTP_PORT;
      if (key === 'smtp_user' && process.env.SMTP_USER) seedValue = process.env.SMTP_USER;
      if (key === 'smtp_pass' && process.env.SMTP_PASS) seedValue = process.env.SMTP_PASS;
      if (key === 'smtp_from' && process.env.SMTP_FROM) seedValue = process.env.SMTP_FROM;
      if (key === 'global_webhook_url' && process.env.GLOBAL_WEBHOOK_URL) seedValue = process.env.GLOBAL_WEBHOOK_URL;
      if (key === 'global_webhook_secret' && process.env.GLOBAL_WEBHOOK_SECRET) seedValue = process.env.GLOBAL_WEBHOOK_SECRET;
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, seedValue || value);
    }
  }

  console.log('✅ Database initialized');
}

module.exports = { getDb, initDb };