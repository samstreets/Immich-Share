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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

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
      view_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    )
  `);

  // Migrate old schemas
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

  // Migrate access_logs
  const logCols = db.prepare("PRAGMA table_info(access_logs)").all().map(c => c.name);
  if (!logCols.includes('action')) {
    db.exec(`ALTER TABLE access_logs ADD COLUMN action TEXT DEFAULT 'view'`);
  }
  if (!logCols.includes('share_name')) {
    db.exec(`ALTER TABLE access_logs ADD COLUMN share_name TEXT`);
  }

  // Create default admin if none exists
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admin_users').get();
  if (adminCount.count === 0) {
    // Use env var only on very first boot to set initial password, then it's DB-only
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin';
    const hash = bcrypt.hashSync(defaultPassword, 12);
    db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run('admin', hash);
    console.log(`✅ Default admin created (username: admin). Change the password in Settings immediately!`);
  }

  // Default settings — all empty, user must configure via Settings UI
  // Only fallback to env vars on first boot so existing deployments aren't broken
  const defaults = {
    immich_url: '',
    immich_api_key: '',
    external_url: `http://localhost:${process.env.PORT || 3000}`,
    app_name: 'Immich Share',
    allowed_origins: '',
  };

  for (const [key, value] of Object.entries(defaults)) {
    const existing = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
    if (!existing) {
      // On first boot, seed from env vars if present so existing deployments work
      let seedValue = value;
      if (key === 'immich_url' && process.env.IMMICH_URL) seedValue = process.env.IMMICH_URL;
      if (key === 'immich_api_key' && process.env.IMMICH_API_KEY) seedValue = process.env.IMMICH_API_KEY;
      if (key === 'external_url' && process.env.EXTERNAL_URL) seedValue = process.env.EXTERNAL_URL;
      if (key === 'allowed_origins' && process.env.ALLOWED_ORIGINS) seedValue = process.env.ALLOWED_ORIGINS;
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, seedValue || value);
    }
  }

  console.log('✅ Database initialized');
}

module.exports = { getDb, initDb };