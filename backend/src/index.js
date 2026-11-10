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
const { startLocalSync } = require('./localCache');

const app = express();
const PORT = process.env.PORT || 3000;

// Number of reverse proxies in front of this app (used for client IPs in rate
// limiting and access logs). Defaults to 1. Set TRUST_PROXY=0 when the port is
// exposed directly, otherwise clients can spoof X-Forwarded-For and dodge the
// rate limits.
const TRUST_PROXY = (process.env.TRUST_PROXY ?? '1').trim();
app.set('trust proxy',
  /^\d+$/.test(TRUST_PROXY) ? parseInt(TRUST_PROXY, 10)
    : TRUST_PROXY === 'true' ? true
    : TRUST_PROXY === 'false' ? false
    : TRUST_PROXY);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'blob:'],
      'media-src': ["'self'", 'blob:'],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-ancestors': ["'self'"],
    },
  },
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
      return callback(new Error('CORS: unable to read allowed origins'));
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
  // Uploads and media proxy requests have their own limiters below
  skip: (req) => req.path.includes('/upload') || req.path.startsWith('/proxy/'),
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

// Uploads are exempt from the general limiter (a large file is hundreds of
// chunk requests) but get their own, higher cap so they can't be abused freely.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many upload requests, please try again later.' }),
});

// Every thumbnail/preview in a gallery is a separate request, so a large album
// can easily exceed the general limit on a single page load. Media requests are
// cheap to count separately; this cap only guards against runaway abuse.
const mediaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.MEDIA_RATE_LIMIT || '30000', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many media requests, please try again later.' }),
});

app.use('/api/proxy', mediaLimiter);
app.use('/api/public/upload', uploadLimiter);
app.use('/api/public/upload-chunk', uploadLimiter);
app.use('/api/public/upload-assemble', uploadLimiter);
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
startLocalSync();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/proxy', proxyRoutes);

// Unknown API routes get a JSON 404 rather than the SPA shell
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

// Last-resort error handler: never leak stack traces, never leave a request hanging
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.path}: ${err.stack || err.message}`);
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : (err.type === 'entity.too.large' ? 'Request body too large' : 'Bad request'),
  });
});

// A stray rejection in a background job must not take the server down
process.on('unhandledRejection', (reason) => {
  console.error('[error] Unhandled promise rejection:', reason?.stack || reason);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Immich Share running on port ' + PORT);
  console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
});

module.exports = app;