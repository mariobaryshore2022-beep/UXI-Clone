const http = require('http');
const https = require('https');
const { query } = require('../db');

/**
 * Webhook Dispatcher: Sends incident and triage notifications to external systems
 * Supports Slack, Microsoft Teams, and Generic HTTP endpoints.
 */
async function dispatchWebhook(eventType, data) {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) {
    // Log audit event
    await query(`
      INSERT INTO audit_logs (action, actor, details)
      VALUES ($1, 'webhook_engine', $2)
    `, [eventType, JSON.stringify(data)]);
    return;
  }

  const payload = JSON.stringify({
    source: 'Pulse-UX-Hub',
    event: eventType,
    timestamp: new Date().toISOString(),
    data
  });

  try {
    const url = new URL(webhookUrl);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 5000
    });

    req.on('error', (e) => console.warn('Webhook dispatch failed:', e.message));
    req.write(payload);
    req.end();
  } catch (err) {
    console.warn('Webhook dispatch error:', err.message);
  }
}

module.exports = { dispatchWebhook };
