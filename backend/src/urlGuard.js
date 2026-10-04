'use strict';

const dns = require('dns').promises;
const net = require('net');

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') ||
    v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
}

/**
 * Throws unless `raw` is an http(s) URL that does not resolve to a private,
 * loopback or link-local address. Set ALLOW_PRIVATE_WEBHOOKS=true to permit
 * LAN targets (e.g. a self-hosted automation server).
 */
async function assertSafeWebhookUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('Invalid webhook URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Webhook URL must use http or https');
  }
  if (process.env.ALLOW_PRIVATE_WEBHOOKS === 'true') return;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host)
    ? [{ address: host }]
    : await dns.lookup(host, { all: true }).catch(() => { throw new Error('Webhook host could not be resolved'); });
  for (const { address } of addrs) {
    if (isPrivateIp(address)) {
      throw new Error('Webhook URL resolves to a private or internal address (set ALLOW_PRIVATE_WEBHOOKS=true to allow)');
    }
  }
}

module.exports = { assertSafeWebhookUrl };
