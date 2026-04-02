'use strict';

/**
 * Notification dispatcher — email (nodemailer) + webhook (HTTP POST).
 *
 * Called after a successful upload so the share owner is informed.
 * All errors are caught and logged; notifications must never crash a request.
 */

const { getDb } = require('./db');

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
    const res = await fetch(url, { method: 'POST', headers, body, timeout: 10000 });
    console.log(`[notify] Webhook ${url} → HTTP ${res.status}`);
  } catch (err) {
    console.error(`[notify] Webhook ${url} failed: ${err.message}`);
  }
}

// ── Main: notify on upload ────────────────────────────────────────────────────

/**
 * @param {object} share   Full share row from DB
 * @param {object} ctx     { assetId, filename, ip, appName, externalUrl }
 */
async function notifyUpload(share, ctx) {
  const settings = getSettings();
  const appName = settings.app_name || 'Immich Share';
  const externalUrl = (settings.external_url || '').replace(/\/$/, '');
  const shareUrl = share.slug
    ? `${externalUrl}/s/${share.slug}`
    : `${externalUrl}/s/${share.id}`;

  const subject = `[${appName}] New upload to "${share.name}"`;
  const text = [
    `A new file was uploaded to your share "${share.name}".`,
    '',
    `File: ${ctx.filename || 'unknown'}`,
    `Asset ID: ${ctx.assetId || 'unknown'}`,
    `IP: ${ctx.ip || 'unknown'}`,
    `Share URL: ${shareUrl}`,
    '',
    `— ${appName}`,
  ].join('\n');

  const html = `
    <div style="font-family:sans-serif;max-width:520px">
      <h2 style="color:#c4a44a">New upload to &ldquo;${share.name}&rdquo;</h2>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:6px 0;color:#666;width:100px">File</td><td style="padding:6px 0"><strong>${ctx.filename || '—'}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#666">Asset ID</td><td style="padding:6px 0;font-family:monospace;font-size:0.85em">${ctx.assetId || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#666">IP</td><td style="padding:6px 0;font-family:monospace">${ctx.ip || '—'}</td></tr>
      </table>
      <p style="margin-top:16px">
        <a href="${shareUrl}" style="background:#c4a44a;color:#0d0a00;padding:8px 18px;border-radius:999px;text-decoration:none;font-weight:700">
          View Share →
        </a>
      </p>
      <p style="color:#999;font-size:0.8em;margin-top:20px">Sent by ${appName}</p>
    </div>
  `;

  const webhookPayload = {
    event: 'upload',
    share: { id: share.id, slug: share.slug, name: share.name, url: shareUrl },
    upload: { assetId: ctx.assetId, filename: ctx.filename, ip: ctx.ip },
    timestamp: new Date().toISOString(),
  };

  // Run all notifications concurrently (errors are swallowed inside each fn)
  await Promise.allSettled([
    // Per-share email
    share.notify_email
      ? sendEmail({ to: share.notify_email, subject, text, html })
      : Promise.resolve(),

    // Per-share webhook
    share.webhook_url
      ? fireWebhook(share.webhook_url, webhookPayload, null)
      : Promise.resolve(),

    // Global webhook
    settings.global_webhook_url
      ? fireWebhook(settings.global_webhook_url, webhookPayload, settings.global_webhook_secret)
      : Promise.resolve(),
  ]);
}

module.exports = { notifyUpload, sendEmail, fireWebhook };
