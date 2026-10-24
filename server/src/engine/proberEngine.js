const dns = require('dns').promises;
const net = require('net');
const { query } = require('../db');
const { broadcastEvent } = require('../routes/sse');
const { correlateIncidents } = require('./incidentEngine');

/**
 * Pulse UX Active Prober Engine
 * Actively tests monitored synthetic targets (HTTP/Web, DNS, TCP) in real time.
 * Detects reachability failures, ENOTFOUND, HTTP errors, and updates Simple View health.
 */

async function probeTarget(target, testType = 'webserver') {
  if (!target || typeof target !== 'string') {
    return { success: true, latencyMs: 20 };
  }

  const cleanTarget = target.trim();

  // 1. Extract Hostname and Protocol
  let hostname = cleanTarget;
  let port = 80;
  let isHttps = false;

  if (cleanTarget.startsWith('https://')) {
    isHttps = true;
    port = 443;
    hostname = cleanTarget.replace('https://', '').split('/')[0].split(':')[0];
  } else if (cleanTarget.startsWith('http://')) {
    isHttps = false;
    port = 80;
    hostname = cleanTarget.replace('http://', '').split('/')[0].split(':')[0];
  } else if (cleanTarget.includes(':')) {
    const parts = cleanTarget.split(':');
    hostname = parts[0];
    port = parseInt(parts[1], 10) || 80;
  } else {
    hostname = cleanTarget.split('/')[0];
  }

  // 2. DNS Resolution Step (Fails immediately on fake or invalid domains)
  const dnsStart = Date.now();
  let ipResolved = null;
  try {
    const lookupRes = await Promise.race([
      dns.lookup(hostname),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DNS query timeout')), 4000))
    ]);
    ipResolved = lookupRes.address;
  } catch (dnsErr) {
    const durationMs = Date.now() - dnsStart;
    return {
      success: false,
      latencyMs: durationMs,
      httpStatus: 0,
      dnsResolved: false,
      error: `DNS resolution failed: ${dnsErr.code || dnsErr.message} (${hostname})`
    };
  }

  // If testType is explicitly DNS resolution, we can return success now
  if (testType === 'dns_resolution') {
    return {
      success: true,
      latencyMs: Date.now() - dnsStart,
      dnsResolved: true,
      ipResolved
    };
  }

  // 3. HTTP / Webserver Probing
  if (testType === 'webserver' || testType === 'http' || cleanTarget.startsWith('http') || port === 80 || port === 443) {
    const probeUrl = cleanTarget.startsWith('http') ? cleanTarget : `${isHttps ? 'https' : 'http'}://${cleanTarget}`;
    const httpStart = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(probeUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Pulse-UX-Synthetic-Prober/2.4' }
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - httpStart;

      if (response.status >= 400) {
        return {
          success: false,
          latencyMs,
          httpStatus: response.status,
          dnsResolved: true,
          ipResolved,
          error: `HTTP transaction returned error status ${response.status} (${response.statusText})`
        };
      }

      return {
        success: true,
        latencyMs,
        httpStatus: response.status,
        dnsResolved: true,
        ipResolved
      };
    } catch (httpErr) {
      clearTimeout(timeout);
      const latencyMs = Date.now() - httpStart;
      return {
        success: false,
        latencyMs,
        httpStatus: 0,
        dnsResolved: true,
        ipResolved,
        error: `HTTP connection failed: ${httpErr.message}`
      };
    }
  }

  // 4. Generic TCP Socket Probe
  return new Promise((resolve) => {
    const socketStart = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(4000);

    socket.connect(port, hostname, () => {
      const latencyMs = Date.now() - socketStart;
      socket.destroy();
      resolve({
        success: true,
        latencyMs,
        dnsResolved: true,
        ipResolved
      });
    });

    socket.on('error', (sockErr) => {
      socket.destroy();
      resolve({
        success: false,
        latencyMs: Date.now() - socketStart,
        dnsResolved: true,
        ipResolved,
        error: `TCP connect to ${hostname}:${port} failed: ${sockErr.code || sockErr.message}`
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        success: false,
        latencyMs: 4000,
        dnsResolved: true,
        ipResolved,
        error: `TCP connect to ${hostname}:${port} timed out (>4000ms)`
      });
    });
  });
}

function isProbeableTarget(target) {
  if (!target || typeof target !== 'string') return false;
  const t = target.trim();
  if (t.startsWith('http://') || t.startsWith('https://')) return true;
  if (t.includes(' ')) return false; // Descriptive mock label with spaces, not a network hostname/URL
  if (t.includes('.') || t.includes(':')) return true;
  return false;
}

/**
 * Execute probe for a single monitored item, record results, and raise/resolve issues
 */
async function probeItem(item) {
  if (!item || !item.target || item.is_enabled === false) return;
  const cleanTarget = item.target.trim();
  if (!isProbeableTarget(cleanTarget)) return;

  // Don't fail baseline intranet demo endpoints if running in an environment without corporate split-horizon DNS
  if ((cleanTarget.includes('.internal') || cleanTarget.includes('.corp') || cleanTarget.startsWith('10.')) && item.id.startsWith('int-')) {
    return;
  }

  const probeRes = await probeTarget(item.target, item.test_type);
  const newStatus = probeRes.success ? 'green' : 'red';
  const issueId = `iss-probe-${item.id}`;

  try {
    // 1. Update simple_view_items status in database
    await query(`
      UPDATE simple_view_items 
      SET status = $1 
      WHERE id = $2
    `, [newStatus, item.id]);

    // 2. Fetch active sensor to associate result
    const sensorRes = await query(`SELECT id FROM sensors WHERE status = 'online' ORDER BY last_seen DESC LIMIT 1`);
    const sensorId = sensorRes.rows[0]?.id || 'sensor-kali-laptop2';

    // 3. Record Time-Series Test Result
    await query(`
      INSERT INTO test_results (sensor_id, network_id, test_id, stage, success, duration_ms, metrics, error_message)
      VALUES ($1, $2, $3, 'service_test', $4, $5, $6, $7)
    `, [
      sensorId,
      'Corporate-WiFi',
      `test-${item.id}`,
      probeRes.success,
      probeRes.latencyMs || 0,
      JSON.stringify({
        target: item.target,
        http_status: probeRes.httpStatus || 0,
        latency_ms: probeRes.latencyMs || 0,
        dns_resolved: probeRes.dnsResolved,
        ip_resolved: probeRes.ipResolved,
        error: probeRes.error || null
      }),
      probeRes.error || null
    ]);

    // 4. Handle Issue Creation or Resolution
    if (!probeRes.success) {
      await query(`
        INSERT INTO issues (id, sensor_id, network_id, test_id, type, severity, title, description, metric_name, observed_value, threshold_value, status, created_at)
        VALUES ($1, $2, $3, $4, 'test_failure', 'critical', $5, $6, 'http_status', $7, 200, 'active', NOW())
        ON CONFLICT (id) DO UPDATE SET 
          title = $5, 
          description = $6, 
          observed_value = $7, 
          status = 'active',
          resolved_at = NULL
      `, [
        issueId,
        sensorId,
        'Corporate-WiFi',
        `test-${item.id}`,
        `Probing Failed: ${item.name} (${item.target})`,
        probeRes.error || `Synthetic probe failed for ${item.name} (${item.target})`,
        probeRes.httpStatus || 0
      ]);

      // Correlate with incident engine
      await correlateIncidents();
    } else {
      // Auto-resolve previous issue if probe now succeeds
      await query(`
        UPDATE issues 
        SET status = 'resolved', resolved_at = NOW() 
        WHERE id = $1 AND status = 'active'
      `, [issueId]);
    }

    // 5. Notify Frontend via Server-Sent Events (SSE)
    broadcastEvent('simple_view_updated', {
      itemId: item.id,
      name: item.name,
      target: item.target,
      status: newStatus,
      error: probeRes.error || null
    });

    broadcastEvent('test_result', {
      testId: `test-${item.id}`,
      success: probeRes.success
    });

    console.log(`[Pulse UX Prober] Probed '${item.name}' (${item.target}) -> ${newStatus.toUpperCase()} (${probeRes.latencyMs}ms) ${probeRes.error ? '[' + probeRes.error + ']' : ''}`);
  } catch (dbErr) {
    console.error(`[Pulse UX Prober] DB error processing probe result for ${item.id}:`, dbErr.message);
  }

  return probeRes;
}

/**
 * Probe all enabled items in simple_view_items
 */
async function probeAllMonitoredItems() {
  try {
    const res = await query(`
      SELECT * FROM simple_view_items 
      WHERE target IS NOT NULL AND target != '' AND is_enabled = true
      ORDER BY order_index ASC
    `);

    if (res.rows.length === 0) return;

    for (const item of res.rows) {
      // Probe sequentially or small batches to prevent socket exhaustion
      await probeItem(item);
    }
  } catch (err) {
    console.error('[Pulse UX Prober] Error probing monitored items:', err.message);
  }
}

let proberInterval = null;

function startProberLoop(intervalMs = 25000) {
  if (proberInterval) clearInterval(proberInterval);
  
  // Run initial probe pass after 2 seconds
  setTimeout(() => {
    probeAllMonitoredItems();
  }, 2000);

  proberInterval = setInterval(() => {
    probeAllMonitoredItems();
  }, intervalMs);

  console.log(`[Pulse UX Prober] Active synthetic prober loop started (every ${intervalMs / 1000}s).`);
}

module.exports = {
  probeTarget,
  probeItem,
  probeAllMonitoredItems,
  startProberLoop
};
