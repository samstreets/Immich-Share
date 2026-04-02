require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { initDb, getDb } = require('./db');
const authRoutes = require('./routes/auth');
const shareRoutes = require('./routes/shares');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const proxyRoutes = require('./routes/proxy');
const { startWatcher } = require('./watcher');
const { startCleanup } = require('./cleanup');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Dynamic CORS
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    try {
      const db = getDb();
      const row = db.prepare("SELECT value FROM settings WHERE key = 'allowed_origins'").get();
      const raw = row?.value?.trim() || '';
      if (!raw) return callback(null, true);
      const allowed = raw.split('\n').map(u => u.trim()).filter(Boolean);
      if (allowed.includes('*') || allowed.includes(origin)) return callback(null, true);
      return callback(new Error('CORS: origin ' + origin + ' not allowed'));
    } catch {
      return callback(null, true);
    }
  },
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.includes('/upload'),
  handler: (req, res) =>
    res.status(429).json({ error: 'Too many requests, please try again later.' }),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many login attempts, please try again later.' }),
});

app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);
app.use('/api/public/verify', authLimiter);
app.use('/api/public/token-access', authLimiter);

const jsonParser = express.json({ limit: '10mb' });
app.use('/api/auth',                   jsonParser);
app.use('/api/shares',                 jsonParser);
app.use('/api/admin',                  jsonParser);
app.use('/api/public/verify',          jsonParser);
app.use('/api/public/token-access',    jsonParser);
app.use('/api/public/info',            jsonParser);
app.use('/api/public/content',         jsonParser);
app.use('/api/public/upload-assemble', jsonParser);

// Init database
initDb();

// Start background jobs
startWatcher();
startCleanup();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/proxy', proxyRoutes);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('Immich Share running on port ' + PORT);
  console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
});

module.exports = app;