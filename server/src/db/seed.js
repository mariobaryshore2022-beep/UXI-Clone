const { query } = require('./index');

async function seedData() {
  // Ensure location columns exist on sensors table
  try {
    await query(`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION DEFAULT 43.6532;`);
    await query(`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION DEFAULT -79.3832;`);
    await query(`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS location_name VARCHAR(128) DEFAULT 'Bayshore HealthCare HQ';`);
    await query(`ALTER TABLE sensors ADD COLUMN IF NOT EXISTS floor VARCHAR(32) DEFAULT 'Floor 3 - East Wing';`);
    await query(`
      UPDATE sensors 
      SET latitude = COALESCE(latitude, 43.6532),
          longitude = COALESCE(longitude, -79.3832),
          location_name = COALESCE(location_name, 'Bayshore HealthCare HQ'),
          floor = COALESCE(floor, 'Floor 3 - East Wing')
      WHERE id = 'sensor-kali-arm64'
    `);
  } catch (e) {
    console.warn('Migration for sensor location columns:', e.message);
  }

  // Ensure default test definitions exist for synthetic testing
  const existingTests = await query('SELECT count(*) as count FROM test_definitions');
  if (parseInt(existingTests.rows[0].count, 10) === 0) {
    console.log('Seeding baseline synthetic test definitions...');
    await query(`
      INSERT INTO test_definitions (id, name, template, target, port, is_external, interval_seconds, thresholds)
      VALUES
      ('test-gw-ping', 'Default Gateway Ping', 'generic_tcp', '10.10.30.1', 0, false, 60, '{"max_latency_ms": 15, "max_packet_loss_pct": 2}'::jsonb),
      ('test-dns-core', 'Primary DNS (Infoblox Core)', 'dns_resolution', '10.10.1.10', 53, false, 60, '{"max_dns_ms": 60}'::jsonb),
      ('test-dns-sec', 'Secondary DNS (Google 8.8.8.8)', 'dns_resolution', '8.8.8.8', 53, true, 120, '{"max_dns_ms": 80}'::jsonb),
      ('test-voip-teams', 'Microsoft Teams VoIP Call', 'voip_mos', 'worldaz.tr.teams.microsoft.com', 443, true, 180, '{"min_mos": 3.8, "max_jitter_ms": 15, "max_latency_ms": 120}'::jsonb),
      ('test-web-salesforce', 'Salesforce CRM Experience', 'webserver', 'https://login.salesforce.com', 443, true, 300, '{"max_latency_ms": 250, "min_ssl_days": 15}'::jsonb),
      ('test-web-slack', 'Slack Collaboration API', 'webserver', 'https://slack.com/api/api.test', 443, true, 300, '{"max_latency_ms": 180}'::jsonb),
      ('test-iperf-core', 'Branch Throughput Benchmark', 'iperf3', 'iperf.corp.internal', 5201, false, 600, '{"min_throughput_mbps": 75}'::jsonb)
    `);
  }

  // Ensure simple_view_items table exists
  await query(`
    CREATE TABLE IF NOT EXISTS simple_view_items (
      id VARCHAR(64) PRIMARY KEY,
      pillar VARCHAR(32) NOT NULL,
      name VARCHAR(128) NOT NULL,
      target VARCHAR(256),
      test_type VARCHAR(64) DEFAULT 'webserver',
      status VARCHAR(16) DEFAULT 'green',
      icon_type VARCHAR(32) DEFAULT '',
      is_enabled BOOLEAN DEFAULT TRUE,
      order_index INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const existingItems = await query('SELECT count(*) as count FROM simple_view_items');
  if (parseInt(existingItems.rows[0].count, 10) === 0) {
    console.log('Seeding baseline Simple View items across 4 pillars...');
    await query(`
      INSERT INTO simple_view_items (id, pillar, name, target, test_type, status, icon_type, is_enabled, order_index)
      VALUES
      -- Pillar 1: Experience (Monitored Networks & Sensors)
      ('exp-1', 'experience', 'Bayshore-Corporate-WiFi', 'Bayshore-Corp (5GHz)', 'network', 'green', 'wifi', true, 1),
      ('exp-2', 'experience', 'Wired-Ethernet (eth0)', 'eth0', 'network', 'green', '', true, 2),
      ('exp-3', 'experience', 'Clinical-Care-VLAN', 'VLAN 30 (10.10.30.0/24)', 'network', 'green', '', true, 3),
      ('exp-4', 'experience', 'Bayshore-Guest-Portal', 'Bayshore-Guest', 'network', 'green', 'bolt', true, 4),
      ('exp-5', 'experience', 'HQ-Ambulatory-Clinic', 'Site HQ-East', 'network', 'green', '', true, 5),

      -- Pillar 2: Services (Core Network Infrastructure)
      ('srv-1', 'services', 'Wi-Fi Association', '802.11 Link / wpa_supplicant', 'core_service', 'green', 'wifi', true, 1),
      ('srv-2', 'services', 'Ethernet Link', 'eth0 Carrier', 'core_service', 'green', '', true, 2),
      ('srv-3', 'services', 'DHCP (IP Allocation)', 'DORA 4-Way Handshake', 'core_service', 'green', '', true, 3),
      ('srv-4', 'services', 'Default Gateway', '192.168.64.1', 'core_service', 'green', '', true, 4),
      ('srv-5', 'services', 'DNS Resolution', 'Primary / Secondary', 'core_service', 'green', '', true, 5),

      -- Pillar 3: Internal (Enterprise Applications & Targets)
      ('int-1', 'internal', 'Bayshore EHR Portal', 'https://ehr.bayshore.internal', 'webserver', 'green', '', true, 1),
      ('int-2', 'internal', 'Pulse Core API', 'http://localhost:3000/api', 'webserver', 'green', '', true, 2),
      ('int-3', 'internal', 'Active Directory DNS', '10.10.1.10', 'generic_tcp', 'green', '', true, 3),
      ('int-4', 'internal', 'PACS Imaging Server', '10.10.20.50', 'generic_tcp', 'green', '', true, 4),
      ('int-5', 'internal', 'Internal ESXi Cluster', 'https://vcenter.bayshore.internal', 'webserver', 'green', '', true, 5),
      ('int-6', 'internal', 'Branch iPerf3 Server', 'iperf.corp.internal:5201', 'iperf3', 'green', '', true, 6),
      ('int-7', 'internal', 'Lab Telemetry Server', 'http://10.10.30.85:8080', 'generic_tcp', 'gray', '', true, 7),
      ('int-8', 'internal', 'Clinical Camera Feeds', 'rtsp://10.10.40.100', 'generic_tcp', 'gray', '', true, 8),

      -- Pillar 4: External (Cloud Services & SaaS)
      ('ext-1', 'external', 'Microsoft 365', 'https://login.microsoftonline.com', 'webserver', 'green', '', true, 1),
      ('ext-2', 'external', 'Teams VoIP (MOS)', 'worldaz.tr.teams.microsoft.com', 'voip_mos', 'green', '', true, 2),
      ('ext-3', 'external', 'Salesforce CRM', 'https://login.salesforce.com', 'webserver', 'green', '', true, 3),
      ('ext-4', 'external', 'Google Workspace', 'https://workspace.google.com', 'webserver', 'green', '', true, 4),
      ('ext-5', 'external', 'AWS Cloud Infrastructure', 'https://aws.amazon.com', 'webserver', 'green', '', true, 5),
      ('ext-6', 'external', 'Cloudflare 1.1.1.1', '1.1.1.1:53', 'generic_tcp', 'green', '', true, 6),
      ('ext-7', 'external', 'Slack API', 'https://slack.com/api', 'webserver', 'gray', '', true, 7),
      ('ext-8', 'external', 'GitHub Enterprise', 'https://github.com', 'webserver', 'green', '', true, 8)
    `);
  }

  // Ensure system_settings table exists
  await query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(64) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const existingSettings = await query("SELECT count(*) as count FROM system_settings WHERE key = 'global_thresholds'");
  if (parseInt(existingSettings.rows[0].count, 10) === 0) {
    await query(`
      INSERT INTO system_settings (key, value)
      VALUES ('global_thresholds', '{"max_dhcp_ms": 2000, "max_dns_ms": 100, "min_mos": 3.8, "min_throughput_mbps": 40, "webhook_url": ""}'::jsonb)
      ON CONFLICT (key) DO NOTHING;
    `);
  }

  // Ensure terminal_audit_logs table exists
  await query(`
    CREATE TABLE IF NOT EXISTS terminal_audit_logs (
      id VARCHAR(64) PRIMARY KEY,
      sensor_id VARCHAR(64) NOT NULL,
      command TEXT NOT NULL,
      output TEXT,
      exit_code INT DEFAULT 0,
      duration_ms INT DEFAULT 0,
      executed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

module.exports = { seedData };
