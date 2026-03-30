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

| Permission | Why it's needed |
|---|---|
| `album.read` | List and browse albums in the share creation UI |
| `asset.read` | Fetch asset metadata and serve thumbnails/previews/originals |
| `asset.download` | Proxy original file downloads to share viewers |
| `tag.read` | List tags so you can create tag-based shares |
| `asset.upload` | Required only if you enable **Allow Uploads** on a share — lets viewers contribute photos back to Immich |
| `album.addAsset` | Required only if you enable **Allow Uploads** — adds uploaded assets to the shared album |

> **Minimum for read-only shares:** `album.read`, `asset.read`, `asset.download`, `tag.read`
>
> **For upload-enabled shares, also add:** `asset.upload`, `album.addAsset`

> **Note:** If you are using an **admin** Immich account to generate the key, all permissions are granted by default and no scoping is required. Scoped permissions apply when generating a key from a non-admin account or when using Immich's fine-grained API key scopes (available in Immich v1.100+).

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



---

## License

MIT
