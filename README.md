# 🖼️ Immich Share

A self-hosted web app that sits alongside your [Immich](https://immich.app) instance and lets you share albums or photos with anyone via a password-protected URL — no Immich account required.

## Features

- 🔒 **Password-protected shares** — each share has its own password
- 📁 **Album or asset shares** — share a whole Immich album or hand-pick assets
- ⏱ **Expiry dates** — shares can auto-expire
- ⬇ **Optional downloads** — control whether viewers can download originals
- ⬆ **Optional uploads** — let viewers contribute photos back to the album
- 🔗 **Custom external URL** — set the public URL used in share links
- 🖼 **Lightbox viewer** — full-screen photo/video viewer with keyboard navigation
- 📊 **Admin dashboard** — view stats, manage shares, test Immich connection
- 🐳 **Single Docker container** — easy to self-host

---

## Quick Start (Docker Compose)

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/immich-share.git
cd immich-share

# 2. Create your .env file
cp .env.example .env
# Edit .env — set IMMICH_URL, IMMICH_API_KEY, EXTERNAL_URL, JWT_SECRET

# 3. Start
docker compose up -d

# 4. Open http://localhost:3000
# Login: admin / admin  (change immediately in Settings!)
```

---

## Configuration

All settings can be configured via environment variables **or** the admin UI (Settings page).

| Variable | Required | Description |
|---|---|---|
| `IMMICH_URL` | Yes | URL of your Immich instance, e.g. `http://192.168.1.100:2283` |
| `IMMICH_API_KEY` | Yes | API key from Immich → Account Settings → API Keys |
| `EXTERNAL_URL` | Yes | Public URL of this app — used in share links |
| `JWT_SECRET` | Yes | Long random string for signing admin tokens |
| `ADMIN_PASSWORD` | No | Default admin password (first run only, default: `admin`) |
| `PORT` | No | Port to listen on (default: `3000`) |

---

## Getting an Immich API Key

1. Open your Immich web UI
2. Click your profile icon → **Account Settings**
3. Go to **API Keys** → **New API Key**
4. Copy the key and paste it into the Settings page (or `.env`)

### Required API Key Permissions

Immich API keys are scoped per-user. The key you provide needs the following permissions — these map directly to what Immich Share calls on your behalf:

#### Minimum permissions for read-only shares

| Permission | Why it's needed |
|---|---|
| `album.read` | List and browse albums in the share creation UI |
| `album.statistics` | Fetch album asset counts for the admin UI |
| `albumAsset.create` | Add uploaded assets to the shared album |
| `asset.read` | Fetch asset metadata |
| `asset.view` | Serve thumbnails and preview images to share viewers |
| `asset.download` | Proxy original file downloads to share viewers |
| `tag.read` | List tags so you can create tag-based shares |

#### Additional permissions for upload-enabled shares

| Permission | Why it's needed |
|---|---|
| `asset.upload` | Let viewers upload photos back into Immich |
| `tag.asset` | Apply auto-tags to assets uploaded through a share |

#### Additional permissions for the auto-tag watcher

| Permission | Why it's needed |
|---|---|
| `tag.asset` | Apply watch tags to newly added album assets |

> **Note:** If you are using an **admin** Immich account to generate the key, all permissions are granted by default and no scoping is required. Scoped permissions apply when generating a key from a non-admin account or when using Immich's fine-grained API key scopes (available in Immich v1.100+).

### Full permission reference

Below is the complete list of Immich API key permissions. Only the ones listed in the tables above are required by Immich Share — everything else can be left disabled.

<details>
<summary>Click to expand full permission list</summary>

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
| `session` | `session.create` `session.read` `session.update` `session.delete` `session.lock` |
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
        # Needed for large photo downloads
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

---

### Prerequisites
- Node.js 20+
- An Immich instance

### Run locally

```bash
# Backend
cd backend
npm install
cp ../.env.example .env  # edit it
node src/index.js

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
# → http://localhost:5173 (proxies API to :3000)
```

### Build Docker image locally

```bash
docker build -t immich-share .
docker run -p 3000:3000 \
  -e IMMICH_URL=http://your-immich:2283 \
  -e IMMICH_API_KEY=your-key \
  -e EXTERNAL_URL=http://localhost:3000 \
  -e JWT_SECRET=changeme \
  -v immich-share-data:/app/data \
  immich-share
```

---

## Data & Privacy

- All share metadata is stored in a local **SQLite** database at `/app/data/app.db`
- No photo data is stored — all media is proxied directly from your Immich instance
- Share passwords are **bcrypt-hashed** (cost factor 10–12)
- Admin passwords are bcrypt-hashed (cost factor 12)
- Rate limiting is applied to auth and share-verify endpoints

---

## License

MIT
