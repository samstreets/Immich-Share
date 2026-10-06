'use strict';

/**
 * Notification dispatcher — email (nodemailer) + webhook (HTTP POST).
 *
 * Called after a successful upload so the share owner is informed.
 * All errors are caught and logged; notifications must never crash a request.
 */

const { getDb } = require('./db');
const { assertSafeWebhookUrl } = require('./urlGuard');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  for (const r of rows) s[r.key] = r.value;
  return s;
}

// ── Email ─────────────────────────────────────────────────────────────────────

async function sendEmail({ to, subject, text, html }) {
  const settings = getSettings();
  const host = settings.smtp_host;
  const port = parseInt(settings.smtp_port || '587', 10);
  const user = settings.smtp_user;
  const pass = settings.smtp_pass;
  const from = settings.smtp_from || user;
  const secure = settings.smtp_secure === '1';

  if (!host || !to) {
    console.log('[notify] Email skipped — SMTP not configured or no recipient');
    return;
  }

  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    console.error('[notify] nodemailer not installed — run npm install');
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });

  try {
    await transporter.sendMail({ from, to, subject, text, html });
    console.log(`[notify] Email sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`[notify] Email failed to ${to}: ${err.message}`);
  }
}

// ── Webhook ───────────────────────────────────────────────────────────────────

async function fireWebhook(url, payload, secret) {
  if (!url) return;

  const fetch = require('node-fetch');
  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'ImmichShare/1.0',
  };

  // Optional HMAC-SHA256 signature header (matches GitHub webhook style)
  if (secret) {
    const crypto = require('crypto');
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    headers['X-ImmichShare-Signature'] = `sha256=${sig}`;
  }

  try {
    await assertSafeWebhookUrl(url);
    const res = await fetch(url, { method: 'POST', headers, body, timeout: 10000, redirect: 'manual' });
    console.log(`[notify] Webhook ${url} → HTTP ${res.status}`);
  } catch (err) {
    console.error(`[notify] Webhook ${url} failed: ${err.message}`);
  }
}

// ── Events ────────────────────────────────────────────────────────────────────

// event name → { setting toggle, email subject/lines builder }
const EVENTS = {
  upload: {
    setting: 'notify_on_upload',
    title: (share) => `New upload to "${share.name}"`,
    lines: (share, ctx) => [
      ['File', ctx.filename || 'unknown'],
      ['Asset ID', ctx.assetId || 'unknown'],
      ['IP', ctx.ip || 'unknown'],
    ],
    intro: (share) => `A new file was uploaded to your share "${share.name}".`,
  },
  first_view: {
    setting: 'notify_on_first_view',
    title: (share) => `"${share.name}" was opened for the first time`,
    lines: (share, ctx) => [['IP', ctx.ip || 'unknown'], ['User agent', ctx.userAgent || 'unknown']],
    intro: (share) => `Someone opened your share "${share.name}" for the first time.`,
  },
  view_limit_reached: {
    setting: 'notify_on_view_limit',
    title: (share) => `"${share.name}" reached its view limit`,
    lines: (share) => [['Views', `${share.view_count} / ${share.max_views}`]],
    intro: (share) => `Your share "${share.name}" reached its view limit and has been disabled.`,
  },
  password_failed: {
    setting: 'notify_on_password_failed',
    title: (share) => `Failed password attempt on "${share.name}"`,
    lines: (share, ctx) => [['IP', ctx.ip || 'unknown'], ['User agent', ctx.userAgent || 'unknown']],
    intro: (share) => `Someone entered the wrong password for your share "${share.name}".`,
  },
  expiry_reminder: {
    setting: 'notify_on_expiry_reminder',
    title: (share) => `"${share.name}" expires soon`,
    lines: (share, ctx) => [
      ['Expires', ctx.expiresAt || share.expires_at || 'unknown'],
      ['Time left', ctx.timeLeft || 'unknown'],
    ],
    intro: (share) => `Your share "${share.name}" is about to expire. Edit it in the admin panel to extend it.`,
  },
  expired: {
    setting: 'notify_on_expired',
    title: (share) => `"${share.name}" has expired`,
    lines: (share, ctx) => [['Expired', ctx.expiresAt || share.expires_at || 'unknown']],
    intro: (share) => `Your share "${share.name}" has expired.`,
  },
};

function buildShareUrl(settings, share) {
  const externalUrl = (settings.external_url || '').replace(/\/$/, '');
  return `${externalUrl}/s/${share.slug || share.id}`;
}

/**
 * Generic notifier. Sends to the per-share email/webhook, the admin email
 * (settings.notify_admin_email) and the global webhook, provided the event
 * is enabled in settings. Never throws.
 *
 * @param {string} event   key of EVENTS
 * @param {object} share   Full share row from DB
 * @param {object} ctx     event-specific context (ip, userAgent, filename, ...)
 */
async function notifyEvent(event, share, ctx = {}) {
  try {
    const def = EVENTS[event];
    if (!def) return;

    const settings = getSettings();
    // upload defaults to on for backwards compatibility; others default to off
    const enabled = settings[def.setting] === undefined ? event === 'upload' : settings[def.setting] === '1';
    if (!enabled) return;

    const appName = settings.app_name || 'Immich Share';
    const shareUrl = buildShareUrl(settings, share);
    const title = def.title(share);
    const rows = def.lines(share, ctx);

    const subject = `[${appName}] ${title}`;
    const text = [def.intro(share), '', ...rows.map(([k, v]) => `${k}: ${v}`), `Share URL: ${shareUrl}`, '', `— ${appName}`].join('\n');
    const html = `
    <div style="font-family:sans-serif;max-width:520px">
      <h2 style="color:#c4a44a">${esc(title)}</h2>
      <p>${esc(def.intro(share))}</p>
      <table style="border-collapse:collapse;width:100%">
        ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#666;width:100px">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join('')}
      </table>
      <p style="margin-top:16px">
        <a href="${esc(shareUrl)}" style="background:#c4a44a;color:#0d0a00;padding:8px 18px;border-radius:999px;text-decoration:none;font-weight:700">
          View Share →
        </a>
      </p>
      <p style="color:#999;font-size:0.8em;margin-top:20px">Sent by ${esc(appName)}</p>
    </div>`;

    const payload = {
      event,
      share: { id: share.id, slug: share.slug, name: share.name, url: shareUrl },
      details: Object.fromEntries(rows.map(([k, v]) => [k.toLowerCase().replace(/\s+/g, '_'), v])),
      timestamp: new Date().toISOString(),
    };
    // Keep the original upload payload shape for existing webhook consumers
    if (event === 'upload') {
      payload.upload = { assetId: ctx.assetId, filename: ctx.filename, ip: ctx.ip };
    }

    const emails = [...new Set([share.notify_email, settings.notify_admin_email].filter(Boolean))];

    await Promise.allSettled([
      ...emails.map(to => sendEmail({ to, subject, text, html })),
      share.webhook_url ? fireWebhook(share.webhook_url, payload, null) : Promise.resolve(),
      settings.global_webhook_url
        ? fireWebhook(settings.global_webhook_url, payload, settings.global_webhook_secret)
        : Promise.resolve(),
    ]);
  } catch (err) {
    console.error(`[notify] ${event} notification failed: ${err.message}`);
  }
}

/** Back-compat wrapper used by upload routes. */
function notifyUpload(share, ctx) {
  return notifyEvent('upload', share, ctx);
}

module.exports = { notifyEvent, notifyUpload, sendEmail, fireWebhook };
