# 🖼️ Immich Share

A self-hosted web app that sits alongside your [Immich](https://immich.app) instance and lets you share albums or photos with anyone via a password-protected URL — no Immich account required.

## Features

- 🔒 **Password-protected shares** — each share has its own password
- 🔑 **Passwordless access** — generate a token-in-URL link (no password prompt)
- 📁 **Album or tag shares** — share a whole Immich album or assets by tag
- ⏱ **Expiry dates** — shares can auto-expire
- 👁 **Max view limits** — auto-disable a share after N views
- ⬇ **Optional downloads** — control whether viewers can download originals or a ZIP
- ⬆ **Optional uploads** — let viewers contribute photos back to the album (chunked, no file-size limit)
- 🏷 **Auto-tag uploads** — automatically apply Immich tags to every uploaded asset
- 👀 **Album watcher** — periodically tags new assets added to watched albums
- 🔗 **Custom slugs** — friendly URLs like `/s/summer-2024`
- 🌐 **External URL config** — set the public URL used in share links
- 🖼 **Lightbox viewer** — full-screen photo/video viewer with pinch-to-zoom, drag-to-pan, and keyboard navigation
- ✅ **Drag-to-select** — select multiple photos in the gallery and bulk-download as ZIP
- 📊 **Admin dashboard** — stats, per-share activity charts, access logs with export (CSV/JSON)
- 🔔 **Notifications** — email (SMTP) and webhook alerts on upload, per-share or global
- 🔐 **Two-factor authentication** — TOTP (Google Authenticator, Authy, etc.) for the admin login
- 🧹 **Scheduled cleanup** — auto-purge expired shares and orphaned upload chunks
- 📱 **Mobile-friendly admin** — responsive sidebar + bottom nav for phones
- 🐳 **Single Docker container** — easy to self-host

---

## Quick Start (Docker Compose)

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/immich-share.git
cd immich-share

# 2. Create your .env file
cp .env.example .env
# Edit .env — set JWT_SECRET at minimum

# 3. Start
docker compose up -d

# 4. Open http://localhost:3000
# Login: admin / admin  (change immediately in Settings!)
```

---

## Configuration

Settings can be configured via **environment variables** (seed on first boot) **or** the **admin UI → Settings** page at any time.

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | **Yes** | Long random string for signing admin tokens. Min 32 chars. |
| `IMMICH_URL` | No* | URL of your Immich instance, e.g. `http://192.168.1.100:2283` |
| `IMMICH_API_KEY` | No* | API key from Immich → Account Settings → API Keys |
| `EXTERNAL_URL` | No* | Public URL of this app — used in share links |
| `ADMIN_PASSWORD` | No | Default admin password (first run only, default: `admin`) |
| `PORT` | No | Port to listen on (default: `3000`) |
| `DB_PATH` | No | Path to SQLite database (default: `/app/data/app.db`) |
| `ALLOWED_ORIGINS` | No | Newline-separated list of allowed CORS origins (empty = allow all) |
| `SMTP_HOST` | No | SMTP server hostname for email notifications |
| `SMTP_PORT` | No | SMTP port (default: `587`) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_FROM` | No | From address for notification emails |
| `GLOBAL_WEBHOOK_URL` | No | Webhook URL fired on every upload across all shares |
| `GLOBAL_WEBHOOK_SECRET` | No | HMAC-SHA256 signing secret for the global webhook |
| `CLEANUP_INTERVAL_MS` | No | How often the cleanup job runs (default: 30 minutes) |
| `WATCH_INTERVAL_MS` | No | How often the album watcher runs (default: 5 minutes) |

*These can be set via the Settings UI after first boot.

---

## Getting an Immich API Key

1. Open your Immich web UI
2. Click your profile icon → **Account Settings**
3. Go to **API Keys** → **New API Key**
4. Copy the key and paste it into the Settings page (or `.env`)

### Required API Key Permissions

| Permission | Why it's needed |
|---|---|
| `album.read` | List and browse albums in the share creation UI |
| `album.statistics` | Fetch album asset counts for the admin UI |
| `albumAsset.create` | Add uploaded assets to the shared album |
| `asset.read` | Fetch asset metadata |
| `asset.view` | Serve thumbnails and preview images to share viewers |
| `asset.download` | Proxy original file downloads to share viewers |
| `tag.read` | List tags so you can create tag-based shares |
| `asset.upload` | *(upload-enabled shares)* Let viewers upload photos into Immich |
| `tag.asset` | *(upload tags / album watcher)* Apply tags to assets automatically |

> **Note:** An admin Immich account key has all permissions by default. Scoped permissions apply when using Immich v1.100+ fine-grained API keys.

<details>
<summary>Full Immich permission reference</summary>

| Scope | Permissions |
|---|---|
| `activity` | `activity.create` `activity.read` `activity.update` `activity.delete` `activity.statistics` |
| `apiKey` | `apiKey.create` `apiKey.read` `apiKey.update` `apiKey.delete` |
| `asset` | `asset.read` `asset.update` `asset.delete` `asset.statistics` `asset.share` `asset.view` `asset.download` `asset.upload` `asset.replace` `asset.copy` `asset.derive` `asset.edit.get` `asset.edit.create` `asset.edit.delete` |
| `album` | `album.create` `album.read` `album.update` `album.delete` `album.statistics` `album.share` `album.download` |
| `albumAsset` | `albumAsset.create` `albumAsset.delete` |
| `albumUser` | `albumUser.create` `albumUser.update` `albumUser.delete` |
| `auth` | `auth.changePassword` |
| `authDevice` | `authDevice.delete` |
| `archive` | `archive.read` |
| `backup` | `backup.list` `backup.download` `backup.upload` `backup.delete` |
| `duplicate` | `duplicate.read` `duplicate.delete` |
| `face` | `face.create` `face.read` `face.update` `face.delete` |
| `folder` | `folder.read` |
| `job` | `job.create` `job.read` |
| `library` | `library.create` `library.read` `library.update` `library.delete` `library.statistics` |
| `timeline` | `timeline.read` `timeline.download` |
| `maintenance` | `maintenance` |
| `map` | `map.read` `map.search` |
| `memory` | `memory.create` `memory.read` `memory.update` `memory.delete` `memory.statistics` |
| `memoryAsset` | `memoryAsset.create` `memoryAsset.delete` |
| `notification` | `notification.create` `notification.read` `notification.update` `notification.delete` |
| `partner` | `partner.create` `partner.read` `partner.update` `partner.delete` |
| `person` | `person.create` `person.read` `person.update` `person.delete` `person.statistics` `person.merge` `person.reassign` |
| `pinCode` | `pinCode.create` `pinCode.update` `pinCode.delete` |
| `plugin` | `plugin.create` `plugin.read` `plugin.update` `plugin.delete` |
| `server` | `server.about` `server.apkLinks` `server.storage` `server.statistics` `server.versionCheck` |
| `serverLicense` | `serverLicense.read` `serverLicense.update` `serverLicense.delete` |
| `session` | `session.create` `session.read` `session.update` `session.lock` |
| `sharedLink` | `sharedLink.create` `sharedLink.read` `sharedLink.update` `sharedLink.delete` |
| `stack` | `stack.create` `stack.read` `stack.update` `stack.delete` |
| `sync` | `sync.stream` |
| `syncCheckpoint` | `syncCheckpoint.read` `syncCheckpoint.update` `syncCheckpoint.delete` |
| `systemConfig` | `systemConfig.read` `systemConfig.update` |
| `systemMetadata` | `systemMetadata.read` `systemMetadata.update` |
| `tag` | `tag.create` `tag.read` `tag.update` `tag.delete` `tag.asset` |
| `user` | `user.read` `user.update` |
| `userLicense` | `userLicense.create` `userLicense.read` `userLicense.update` `userLicense.delete` |
| `userOnboarding` | `userOnboarding.read` `userOnboarding.update` `userOnboarding.delete` |
| `userPreference` | `userPreference.read` `userPreference.update` |
| `userProfileImage` | `userProfileImage.create` `userProfileImage.read` `userProfileImage.update` `userProfileImage.delete` |
| `queue` | `queue.read` `queue.update` |
| `queueJob` | `queueJob.create` `queueJob.read` `queueJob.update` `queueJob.delete` |
| `workflow` | `workflow.create` `workflow.read` `workflow.update` `workflow.delete` |
| `adminUser` | `adminUser.create` `adminUser.read` `adminUser.update` `adminUser.delete` |
| `adminSession` | `adminSession.read` |
| `adminAuth` | `adminAuth.unlinkAll` |

</details>

---

## Share Features

### Passwordless Access
Generate a static token-in-URL link for a share — visitors open the link and go straight to the gallery without a password prompt. Tokens can be generated or revoked at any time from the Shares admin page.

### Custom Slugs
Instead of `/s/<uuid>`, give a share a memorable URL like `/s/wedding-photos`. Slugs must be 3–60 lowercase alphanumeric characters or hyphens and must be unique.

### Max Views
Set a view limit on a share — it is automatically disabled once the limit is reached (checked every 30 minutes by the cleanup job).

### Upload Tags
When uploads are enabled, select one or more Immich tags to be automatically applied to every photo uploaded through that share.

### Album Watcher
For album shares, configure "watch tags" — the watcher runs every 5 minutes and applies those tags to any assets that have been newly added to the album since the last check.

### Notifications
Configure SMTP settings globally and set a per-share **notify email** to receive an alert whenever someone uploads a file. Webhooks (global or per-share) fire a signed JSON payload on each upload and can be used to trigger automations.

---

## Reverse Proxy (nginx example)

```nginx
server {
    listen 443 ssl;
    server_name share.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Required for large uploads and downloads
        proxy_buffering off;
        proxy_read_timeout 300s;
        client_max_body_size 0;
    }
}
```

---

## Local Development

### Prerequisites
- Node.js 20+
- An Immich instance

### Run locally

```bash
# Quickstart script (copies .env.example if no .env exists)
./dev.sh

# Or manually:

# Backend
cd backend
cp ../.env.example .env  # edit it — set JWT_SECRET at minimum
npm install
node src/index.js

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
# → http://localhost:5173 (proxies /api to :3000)
```

### Build Docker image locally

```bash
docker build -t immich-share .
docker run -p 3000:3000 \
  -e JWT_SECRET=change-me-to-something-long \
  -e IMMICH_URL=http://your-immich:2283 \
  -e IMMICH_API_KEY=your-key \
  -e EXTERNAL_URL=http://localhost:3000 \
  -v immich-share-data:/app/data \
  immich-share
```

---

## Data & Privacy

- All share metadata is stored in a local **SQLite** database at `/app/data/app.db`
- No photo data is stored — all media is proxied directly from your Immich instance
- Share passwords are **bcrypt-hashed** (cost factor 10)
- Admin passwords are bcrypt-hashed (cost factor 12)
- Share session tokens are HMAC-SHA256 signed, valid for 8 hours
- Webhook payloads are optionally HMAC-SHA256 signed (`X-ImmichShare-Signature: sha256=…`)
- Rate limiting is applied to auth, share-verify, and token-access endpoints

---

## License

MIT
