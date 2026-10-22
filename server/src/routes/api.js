const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { broadcastEvent } = require('./sse');
const { evaluateResult } = require('../engine/thresholdEngine');
const { correlateIncidents } = require('../engine/incidentEngine');

// 1. Overview & Experience Score
router.get('/overview', async (req, res) => {
  try {
    const sensorsRes = await query('SELECT count(*) as total, count(*) FILTER (WHERE status = \'online\' OR status = \'testing\') as online FROM sensors');
    const incidentsRes = await query('SELECT count(*) as count FROM incidents WHERE status = \'open\' OR status = \'investigating\'');
    const issuesRes = await query('SELECT count(*) as count FROM issues WHERE status = \'active\'');
    const testsRes = await query('SELECT count(*) as total, count(*) FILTER (WHERE success = true) as successful FROM test_results WHERE timestamp >= NOW() - INTERVAL \'1 hour\'');
    
    // Average MOS over last hour
    const mosRes = await query(`
      SELECT AVG((metrics->>'mos')::float) as avg_mos 
      FROM test_results 
      WHERE metrics->>'mos' IS NOT NULL AND timestamp >= NOW() - INTERVAL \'1 hour\'
    `);

    // Calculate Pulse UX Global Experience Score (0 - 100)
    const activeIncidents = parseInt(incidentsRes.rows[0].count, 10);
    const activeIssues = parseInt(issuesRes.rows[0].count, 10);
    const avgMos = parseFloat(mosRes.rows[0].avg_mos) || 4.25;

    let experienceScore = Math.round((avgMos / 5.0) * 100);
    if (activeIncidents > 0) experienceScore -= Math.min(30, activeIncidents * 15);
    if (activeIssues > 0) experienceScore -= Math.min(20, activeIssues * 4);
    experienceScore = Math.max(10, Math.min(100, experienceScore));

    res.json({
      experienceScore,
      rating: experienceScore >= 90 ? 'Optimal' : experienceScore >= 75 ? 'Good' : experienceScore >= 60 ? 'Degraded' : 'Poor',
      sensors: {
        total: parseInt(sensorsRes.rows[0].total, 10),
        online: parseInt(sensorsRes.rows[0].online, 10)
      },
      incidents: {
        activeCount: activeIncidents
      },
      issues: {
        activeCount: activeIssues
      },
      testsLastHour: {
        total: parseInt(testsRes.rows[0].total, 10),
        successful: parseInt(testsRes.rows[0].successful, 10),
        successRate: testsRes.rows[0].total > 0 
          ? Math.round((parseInt(testsRes.rows[0].successful, 10) / parseInt(testsRes.rows[0].total, 10)) * 100) 
          : 100
      },
      averageMos: avgMos.toFixed(2)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Sensors List & Status
router.get('/sensors', async (req, res) => {
  try {
    const sensors = await query('SELECT * FROM sensors ORDER BY name ASC');
    const networks = await query('SELECT * FROM networks WHERE is_active = true');

    const sensorsWithNetworks = sensors.rows.map(sensor => ({
      ...sensor,
      networks: networks.rows.filter(n => n.sensor_id === sensor.id)
    }));

    res.json(sensorsWithNetworks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2b. Sensor Detailed Test History
router.get('/sensors/:id/history', async (req, res) => {
  try {
    const sensorId = req.params.id;
    const limit = Math.min(200, parseInt(req.query.limit || '100', 10));
    const stage = req.query.stage;

    // 1. Get sensor metadata
    const sensorRes = await query('SELECT * FROM sensors WHERE id = $1', [sensorId]);
    if (sensorRes.rows.length === 0) {
      return res.status(404).json({ error: 'Sensor not found' });
    }
    const sensor = sensorRes.rows[0];

    // 2. Query historical test results
    let testQuery = `
      SELECT tr.*, td.name as test_name, td.template
      FROM test_results tr
      LEFT JOIN test_definitions td ON tr.test_id = td.id
      WHERE tr.sensor_id = $1
    `;
    const params = [sensorId];

    if (stage && stage !== 'all') {
      params.push(stage);
      testQuery += ` AND tr.stage = $2`;
    }

    testQuery += ` ORDER BY tr.timestamp DESC LIMIT ${limit}`;
    const results = await query(testQuery, params);

    // 3. Compute KPI summary for this sensor
    const kpiRes = await query(`
      SELECT 
        COUNT(*) as total_tests,
        COUNT(*) FILTER (WHERE success = true) as passed_tests,
        AVG((metrics->>'mos')::float) as avg_mos,
        AVG((metrics->>'latency_ms')::float) as avg_latency,
        AVG((metrics->>'dns_lookup_time_ms')::float) as avg_dns_time,
        AVG((metrics->>'dhcp_lease_time_ms')::float) as avg_dhcp_time,
        AVG((metrics->>'throughput_mbps')::float) as avg_throughput
      FROM test_results
      WHERE sensor_id = $1
    `, [sensorId]);

    const kpi = kpiRes.rows[0] || {};
    const totalTests = parseInt(kpi.total_tests, 10) || 0;
    const passedTests = parseInt(kpi.passed_tests, 10) || 0;
    const successRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 100;

    // 4. Build chronological time-series for trend charts
    const timeSeries = results.rows.slice().reverse().map(r => ({
      timestamp: r.timestamp,
      stage: r.stage,
      test_id: r.test_id,
      test_name: r.test_name || r.stage.replace('_', ' ').toUpperCase(),
      success: r.success,
      duration_ms: r.duration_ms,
      mos: r.metrics?.mos ? parseFloat(r.metrics.mos) : null,
      latency_ms: r.metrics?.latency_ms ? parseFloat(r.metrics.latency_ms) : null,
      dns_ms: r.metrics?.dns_lookup_time_ms ? parseFloat(r.metrics.dns_lookup_time_ms) : null,
      dhcp_ms: r.metrics?.dhcp_lease_time_ms ? parseFloat(r.metrics.dhcp_lease_time_ms) : null,
      throughput_mbps: r.metrics?.throughput_mbps ? parseFloat(r.metrics.throughput_mbps) : null
    }));

    res.json({
      sensor,
      summary: {
        totalTests,
        passedTests,
        successRate,
        avgMos: kpi.avg_mos ? parseFloat(kpi.avg_mos).toFixed(2) : '4.40',
        avgLatencyMs: kpi.avg_latency ? Math.round(parseFloat(kpi.avg_latency)) : 42,
        avgDnsMs: kpi.avg_dns_time ? Math.round(parseFloat(kpi.avg_dns_time)) : 14,
        avgDhcpMs: kpi.avg_dhcp_time ? Math.round(parseFloat(kpi.avg_dhcp_time)) : 380,
        avgThroughputMbps: kpi.avg_throughput ? parseFloat(kpi.avg_throughput).toFixed(1) : '175.0'
      },
      timeSeries,
      results: results.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Sensor Registration / Heartbeat
router.post('/sensors/register', async (req, res) => {
  try {
    const { id, name, mode, ip_address, mac_address, hardware_model, firmware_version, hardware_info } = req.body;
    
    if (!id || !name) {
      return res.status(400).json({ error: 'Sensor id and name required' });
    }

    await query(`
      INSERT INTO sensors (id, name, mode, ip_address, mac_address, hardware_model, firmware_version, hardware_info, last_seen, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'online')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        mode = EXCLUDED.mode,
        ip_address = EXCLUDED.ip_address,
        hardware_model = EXCLUDED.hardware_model,
        hardware_info = EXCLUDED.hardware_info,
        last_seen = NOW(),
        status = 'online'
    `, [
      id,
      name,
      mode || 'sensor',
      ip_address || '127.0.0.1',
      mac_address || '00:00:00:00:00:00',
      hardware_model || 'Ubuntu Linux Machine',
      firmware_version || '2.4.0-pulse',
      JSON.stringify(hardware_info || {})
    ]);

    broadcastEvent('sensor_updated', { id, status: 'online' });
    res.json({ status: 'ok', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3b. Update Sensor Map Coordinates & Location Metadata
router.put('/sensors/:id/location', async (req, res) => {
  try {
    const { id } = req.params;
    const { latitude, longitude, location_name, floor } = req.body;

    const lat = latitude !== undefined && latitude !== null && latitude !== '' ? parseFloat(latitude) : null;
    const lng = longitude !== undefined && longitude !== null && longitude !== '' ? parseFloat(longitude) : null;

    await query(`
      UPDATE sensors 
      SET latitude = $1, 
          longitude = $2, 
          location_name = COALESCE($3, location_name), 
          floor = COALESCE($4, floor)
      WHERE id = $5
    `, [lat, lng, location_name || null, floor || null, id]);

    broadcastEvent('sensor_location_updated', { id, latitude: lat, longitude: lng, location_name, floor });
    res.json({ status: 'ok', id, latitude: lat, longitude: lng, location_name, floor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Update Current Sensor Cycle Stage
router.post('/telemetry/stage', async (req, res) => {
  try {
    const { sensor_id, current_network_name, current_stage, cycle_count } = req.body;
    
    await query(`
      UPDATE sensors 
      SET current_network_name = $1, 
          current_stage = $2, 
          cycle_count = COALESCE($3, cycle_count),
          last_seen = NOW()
      WHERE id = $4
    `, [current_network_name, current_stage, cycle_count, sensor_id]);

    broadcastEvent('stage_change', { sensor_id, current_network_name, current_stage, cycle_count });
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Submit Test Results
router.post('/telemetry/results', async (req, res) => {
  try {
    const { sensor_id, network_id, test_id, stage, success, duration_ms, metrics, error_message } = req.body;

    const result = await query(`
      INSERT INTO test_results (sensor_id, network_id, test_id, stage, success, duration_ms, metrics, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      sensor_id,
      network_id || null,
      test_id || null,
      stage,
      Boolean(success),
      duration_ms || 0,
      JSON.stringify(metrics || {}),
      error_message || null
    ]);

    // Evaluate Threshold violations
    const createdIssues = await evaluateResult(sensor_id, network_id, test_id, stage, success, duration_ms, metrics);
    
    // Check for AIOps Incidents
    let createdIncidents = [];
    if (createdIssues.length > 0) {
      createdIncidents = await correlateIncidents();
    }

    const payload = {
      testResult: result.rows[0],
      issues: createdIssues,
      incidents: createdIncidents
    };

    broadcastEvent('test_result', payload);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Wi-Fi Telemetry Ingestion & Retrieval
router.post('/telemetry/wifi', async (req, res) => {
  try {
    const { sensor_id, scan_data } = req.body;
    if (!Array.isArray(scan_data)) {
      return res.status(400).json({ error: 'scan_data must be an array' });
    }

    for (const ap of scan_data) {
      await query(`
        INSERT INTO wifi_telemetry (sensor_id, bssid, ssid, channel, band, rssi, snr, channel_utilization, client_count, vendor_ap_name, vendor, security, is_connected)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        sensor_id,
        ap.bssid,
        ap.ssid || '<Hidden>',
        ap.channel || 1,
        ap.band || (ap.channel > 14 ? (ap.channel > 190 ? '6GHz' : '5GHz') : '2.4GHz'),
        ap.rssi || -70,
        ap.snr || 25,
        ap.channel_utilization || 20,
        ap.client_count || 10,
        ap.vendor_ap_name || null,
        ap.vendor || 'Enterprise',
        ap.security || 'wpa2-psk',
        Boolean(ap.is_connected)
      ]);
    }

    broadcastEvent('wifi_scan', { sensor_id, count: scan_data.length });
    res.json({ status: 'ok', ingested: scan_data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/telemetry/wifi', async (req, res) => {
  try {
    const sensorId = req.query.sensor_id;
    let queryText = `
      SELECT DISTINCT ON (bssid) * 
      FROM wifi_telemetry 
      ${sensorId ? 'WHERE sensor_id = $1' : ''}
      ORDER BY bssid, timestamp DESC
    `;
    const params = sensorId ? [sensorId] : [];
    const results = await query(queryText, params);
    res.json(results.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Issues & Incidents
router.get('/issues', async (req, res) => {
  try {
    const results = await query(`
      SELECT i.*, s.name as sensor_name 
      FROM issues i 
      LEFT JOIN sensors s ON i.sensor_id = s.id 
      ORDER BY i.created_at DESC 
      LIMIT 100
    `);
    res.json(results.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/incidents', async (req, res) => {
  try {
    const results = await query(`
      SELECT * FROM incidents 
      ORDER BY created_at DESC 
      LIMIT 50
    `);
    res.json(results.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Triage Reports
router.post('/triage', async (req, res) => {
  try {
    const { issue_id, sensor_id, network_id, failure_step, root_cause_analysis, command_output, traceroute_hops, dora_trace, pcap_filename, pcap_size_kb, ethernet_comparison } = req.body;
    const triageId = `triage-${Date.now()}`;

    await query(`
      INSERT INTO triage_reports (id, issue_id, sensor_id, network_id, failure_step, root_cause_analysis, command_output, traceroute_hops, dora_trace, pcap_filename, pcap_size_kb, ethernet_comparison)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      triageId,
      issue_id || null,
      sensor_id,
      network_id || null,
      failure_step,
      root_cause_analysis,
      command_output,
      JSON.stringify(traceroute_hops || []),
      JSON.stringify(dora_trace || {}),
      pcap_filename || null,
      pcap_size_kb || 0,
      JSON.stringify(ethernet_comparison || {})
    ]);

    broadcastEvent('triage_generated', { id: triageId, sensor_id, failure_step });
    res.json({ status: 'ok', triage_id: triageId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/triage', async (req, res) => {
  try {
    const results = await query(`
      SELECT t.*, s.name as sensor_name 
      FROM triage_reports t 
      LEFT JOIN sensors s ON t.sensor_id = s.id 
      ORDER BY t.timestamp DESC 
      LIMIT 20
    `);
    res.json(results.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/triage/:id', async (req, res) => {
  try {
    const results = await query('SELECT * FROM triage_reports WHERE id = $1', [req.params.id]);
    if (results.rows.length === 0) return res.status(404).json({ error: 'Triage report not found' });
    res.json(results.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Test Definitions & Thresholds
router.get('/tests', async (req, res) => {
  try {
    const results = await query('SELECT * FROM test_definitions ORDER BY name ASC');
    res.json(results.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Live Fault Simulator (Simulate Network Degradation to test UI, Triage, and Incidents)
router.post('/simulate-degradation', async (req, res) => {
  try {
    const { scenario } = req.body; // 'dhcp_timeout', 'dns_failure', 'voip_jitter', 'clear'

    if (scenario === 'dhcp_timeout') {
      const issueId = `iss-sim-${Date.now()}`;
      await query(`
        INSERT INTO issues (id, sensor_id, network_id, type, severity, title, description, metric_name, observed_value, threshold_value, status)
        VALUES ($1, 'sensor-kali-arm64', 'net-corp-5g', 'threshold_violation', 'critical', 'DHCP Lease Timeout on Kali Sensor', 'DHCP DORA cycle exceeded 4,100ms. Upstream DHCP relay queue clogged.', 'dhcp_time_ms', 4120, 2000, 'active')
      `, [issueId]);

      await correlateIncidents();

      // Create triage report
      const triageId = `triage-sim-${Date.now()}`;
      await query(`
        INSERT INTO triage_reports (id, issue_id, sensor_id, network_id, failure_step, root_cause_analysis, command_output, dora_trace)
        VALUES ($1, $2, 'sensor-kali-arm64', 'net-corp-5g', 'dhcp', 'DHCP server at 10.10.30.1 failed to answer DHCPDISCOVER within timeout.', '
[LIVE TRIAGE TRIGGERED] Replaying DHCP allocation cycle on Kali sensor...
$ iw dev wlan0 link
Connected to 00:1a:1e:84:3a:90 (SSID: Corp-Enterprise, RSSI: -54 dBm, Ch: 48)
$ dhclient -v -d -1 wlan0
Listening on LPF/wlan0/e4:5f:01:bc:39:10
DHCPDISCOVER on wlan0 to 255.255.255.255 port 67 interval 3
DHCPDISCOVER on wlan0 to 255.255.255.255 port 67 interval 8
DHCPDISCOVER on wlan0 to 255.255.255.255 port 67 interval 15
[ERROR] No DHCPOFFERS received.
[ETHERNET COMPARISON] eth0 test: DORA completed in 4,050ms. DHCP server pool exhaustion indicated.', '{"discover_sent": 3, "offers_received": 0, "status": "starvation"}'::jsonb)
      `, [triageId, issueId]);

      broadcastEvent('incident_opened', { title: 'DHCP Starvation Injected' });
      res.json({ status: 'ok', scenario: 'dhcp_timeout', triage_id: triageId });
    } else if (scenario === 'voip_jitter') {
      await query(`
        INSERT INTO issues (id, sensor_id, network_id, test_id, type, severity, title, description, metric_name, observed_value, threshold_value, status)
        VALUES ('iss-sim-voip', 'sensor-kali-arm64', 'net-corp-5g', 'test-voip-teams', 'threshold_violation', 'major', 'Critical VoIP MOS Drop (MOS 2.81)', 'Jitter reached 34.2 ms with 4.5% packet loss on 5GHz channel 48.', 'mos', 2.81, 3.8, 'active')
      `);
      await correlateIncidents();
      broadcastEvent('test_result', { status: 'voip_degradation' });
      res.json({ status: 'ok', scenario: 'voip_jitter' });
    } else if (scenario === 'clear') {
      await query('UPDATE issues SET status = \'resolved\', resolved_at = NOW() WHERE status = \'active\'');
      await query('UPDATE incidents SET status = \'resolved\', resolved_at = NOW() WHERE status = \'open\' OR status = \'investigating\'');
      broadcastEvent('issues_cleared', {});
      res.json({ status: 'ok', scenario: 'cleared' });
    } else {
      res.status(400).json({ error: 'Unknown scenario' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Admin Data Purge (Remove Dummy Data, keep only Kali sensor)
router.post('/admin/clean-dummy-data', async (req, res) => {
  try {
    console.log('[Admin] Purging all dummy data from database...');

    // 1. Delete all non-Kali sensors (cascades to their networks, test results, etc.)
    await query("DELETE FROM sensors WHERE id != 'sensor-kali-arm64'");

    // 2. Clear all Wi-Fi telemetry completely (no mock APs)
    await query("DELETE FROM wifi_telemetry");

    // 3. Clear old dummy incidents, issues, and triage reports
    await query("DELETE FROM incidents");
    await query("DELETE FROM issues WHERE sensor_id != 'sensor-kali-arm64'");
    await query("DELETE FROM triage_reports WHERE sensor_id != 'sensor-kali-arm64'");
    await query("DELETE FROM test_results WHERE sensor_id != 'sensor-kali-arm64'");

    // 4. Configure only the real Wired Ethernet network for Kali sensor
    await query("DELETE FROM networks");
    await query(`
      INSERT INTO networks (id, sensor_id, name, type, is_dhcp)
      VALUES 
      ('net-wired-eth0', 'sensor-kali-arm64', 'Wired-Ethernet (eth0)', 'ethernet', true)
      ON CONFLICT (id) DO UPDATE SET sensor_id = 'sensor-kali-arm64'
    `);

    // 5. Update Kali sensor metadata
    await query(`
      UPDATE sensors 
      SET groups = '["Kali-Linux-VM", "Lab-Sensor"]'::jsonb,
          hardware_model = 'Kali Linux (aarch64) Virtual Machine',
          current_network_name = 'Wired-Ethernet (eth0)',
          ip_address = '192.168.64.4'
      WHERE id = 'sensor-kali-arm64'
    `);

    // Broadcast UI updates
    broadcastEvent('sensor_updated', { id: 'sensor-kali-arm64' });
    broadcastEvent('issues_cleared', {});

    const remainingSensors = await query('SELECT id, name, status, ip_address, hardware_model FROM sensors');
    res.json({
      status: 'ok',
      message: 'All dummy data removed. Only Kali sensor remains.',
      sensors: remainingSensors.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Simple View Configurable Items API (4 Pillars)
// ============================================================================

// GET /api/simple-view/items (List all or filter by pillar)
router.get('/simple-view/items', async (req, res) => {
  try {
    const { pillar } = req.query;
    let sql = 'SELECT * FROM simple_view_items';
    const params = [];
    if (pillar) {
      sql += ' WHERE pillar = $1';
      params.push(pillar);
    }
    sql += ' ORDER BY pillar ASC, order_index ASC, created_at ASC';
    const result = await query(sql, params);

    // Also group by pillar for convenient frontend consumption
    const grouped = {
      experience: [],
      services: [],
      internal: [],
      external: []
    };
    result.rows.forEach(item => {
      if (grouped[item.pillar]) {
        grouped[item.pillar].push(item);
      }
    });

    res.json({
      items: result.rows,
      pillars: grouped
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/simple-view/items (Create a new item)
router.post('/simple-view/items', async (req, res) => {
  try {
    const { pillar, name, target, test_type, status, icon_type, is_enabled } = req.body;
    if (!pillar || !name) {
      return res.status(400).json({ error: 'Pillar and name are required' });
    }

    const id = `item-${pillar}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    
    // Find next order index
    const countRes = await query('SELECT COALESCE(MAX(order_index), 0) + 1 as next_idx FROM simple_view_items WHERE pillar = $1', [pillar]);
    const nextIdx = countRes.rows[0].next_idx;

    await query(`
      INSERT INTO simple_view_items (id, pillar, name, target, test_type, status, icon_type, is_enabled, order_index)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      id,
      pillar,
      name,
      target || '',
      test_type || 'webserver',
      status || 'green',
      icon_type || '',
      is_enabled !== undefined ? Boolean(is_enabled) : true,
      nextIdx
    ]);

    broadcastEvent('simple_view_updated', { action: 'create', id, pillar });
    res.status(201).json({ status: 'ok', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/simple-view/items/:id (Update an item)
router.put('/simple-view/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, target, test_type, status, icon_type, is_enabled, order_index } = req.body;

    const existing = await query('SELECT * FROM simple_view_items WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const cur = existing.rows[0];

    await query(`
      UPDATE simple_view_items
      SET name = $1,
          target = $2,
          test_type = $3,
          status = $4,
          icon_type = $5,
          is_enabled = $6,
          order_index = $7
      WHERE id = $8
    `, [
      name !== undefined ? name : cur.name,
      target !== undefined ? target : cur.target,
      test_type !== undefined ? test_type : cur.test_type,
      status !== undefined ? status : cur.status,
      icon_type !== undefined ? icon_type : cur.icon_type,
      is_enabled !== undefined ? Boolean(is_enabled) : cur.is_enabled,
      order_index !== undefined ? parseInt(order_index, 10) : cur.order_index,
      id
    ]);

    broadcastEvent('simple_view_updated', { action: 'update', id, pillar: cur.pillar });
    res.json({ status: 'ok', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/simple-view/items/:id (Delete an item)
router.delete('/simple-view/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT pillar FROM simple_view_items WHERE id = $1', [id]);
    const pillar = existing.rows[0]?.pillar;

    await query('DELETE FROM simple_view_items WHERE id = $1', [id]);
    broadcastEvent('simple_view_updated', { action: 'delete', id, pillar });
    res.json({ status: 'ok', deleted: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/simple-view/reset (Reset to default clean seed items)
router.post('/simple-view/reset', async (req, res) => {
  try {
    await query('DELETE FROM simple_view_items');
    const { seedData } = require('../db/seed');
    await seedData();
    broadcastEvent('simple_view_updated', { action: 'reset' });
    res.json({ status: 'ok', message: 'Simple view items reset to default' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
