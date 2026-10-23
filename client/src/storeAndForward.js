const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

class StoreAndForward {
  constructor(serverUrl, queueFilePath) {
    this.serverUrl = serverUrl;
    this.queueFilePath = queueFilePath || path.join(__dirname, '../../.data/sensor_queue.json');
    this.isFlushing = false;
    this.ensureDir();
  }

  ensureDir() {
    const dir = path.dirname(this.queueFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  readQueue() {
    try {
      if (!fs.existsSync(this.queueFilePath)) return [];
      const content = fs.readFileSync(this.queueFilePath, 'utf8');
      return JSON.parse(content) || [];
    } catch {
      return [];
    }
  }

  writeQueue(items) {
    try {
      fs.writeFileSync(this.queueFilePath, JSON.stringify(items, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to write local queue:', err.message);
    }
  }

  enqueue(endpoint, payload) {
    const queue = this.readQueue();
    queue.push({
      id: `sf-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      endpoint,
      payload
    });
    this.writeQueue(queue);
    console.log(`[Store-and-Forward] Buffered item to local queue (Queue size: ${queue.length})`);
  }

  async send(endpoint, payload) {
    const url = `${this.serverUrl}${endpoint}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000)
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      // Check if we have buffered items to flush
      this.flushQueue();
      return await response.json();
    } catch (err) {
      console.warn(`[Store-and-Forward] Server unreachable (${err.message}). Buffering payload locally.`);
      this.enqueue(endpoint, payload);
      return null;
    }
  }

  async get(endpoint) {
    const url = `${this.serverUrl}${endpoint}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) {
        return await response.json();
      }
    } catch {}
    return null;
  }


  async flushQueue() {
    if (this.isFlushing) return;
    const queue = this.readQueue();
    if (queue.length === 0) return;

    this.isFlushing = true;
    console.log(`[Store-and-Forward] Attempting to flush ${queue.length} buffered item(s) to server...`);

    const remaining = [];
    for (const item of queue) {
      try {
        const url = `${this.serverUrl}${item.endpoint}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
          signal: AbortSignal.timeout(3000)
        });

        if (!response.ok) {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    this.writeQueue(remaining);
    this.isFlushing = false;
    if (remaining.length === 0) {
      console.log('[Store-and-Forward] Local buffer completely flushed to server.');
    } else {
      console.log(`[Store-and-Forward] ${remaining.length} item(s) remain buffered.`);
    }
  }
}

module.exports = StoreAndForward;
