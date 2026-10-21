const { query } = require('./index');

async function seedData() {
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
}

module.exports = { seedData };
