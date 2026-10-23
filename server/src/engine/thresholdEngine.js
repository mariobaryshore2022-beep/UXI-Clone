const { query } = require('../db');

/**
 * Threshold Engine: Evaluates test results against configured limits
 * Raises or resolves Issues (Threshold Violations & Test Failures)
 */
async function evaluateResult(sensorId, networkId, testId, stage, success, durationMs, metrics = {}) {
  try {
    const issuesToCreate = [];

    // 1. Stage-specific Core Thresholds
    if (stage === 'dhcp') {
      const dhcpMs = metrics.dhcp_lease_time_ms || durationMs || 0;
      const thresholdMs = 2000;
      if (!success) {
        issuesToCreate.push({
          type: 'test_failure',
          severity: 'critical',
          metric: 'dhcp_lease_time_ms',
          observed: dhcpMs,
          threshold: thresholdMs,
          title: 'DHCP Lease Acquisition Failed',
          description: `DHCP client received no response (DORA incomplete) on network ${networkId}.`
        });
      } else if (dhcpMs > thresholdMs) {
        issuesToCreate.push({
          type: 'threshold_violation',
          severity: 'major',
          metric: 'dhcp_lease_time_ms',
          observed: dhcpMs,
          threshold: thresholdMs,
          title: 'High DHCP Lease Time',
          description: `DHCP lease took ${Math.round(dhcpMs)} ms (threshold: ${thresholdMs} ms).`
        });
      }
    } else if (stage === 'primary_dns' || stage === 'secondary_dns') {
      const dnsMs = metrics.dns_lookup_time_ms || durationMs || 0;
      const thresholdMs = 100;
      if (!success) {
        issuesToCreate.push({
          type: 'test_failure',
          severity: 'critical',
          metric: 'dns_lookup_time_ms',
          observed: dnsMs,
          threshold: thresholdMs,
          title: `${stage === 'primary_dns' ? 'Primary' : 'Secondary'} DNS Resolution Failed`,
          description: `DNS query failed to resolve target host within timeout.`
        });
      } else if (dnsMs > thresholdMs) {
        issuesToCreate.push({
          type: 'threshold_violation',
          severity: 'minor',
          metric: 'dns_lookup_time_ms',
          observed: dnsMs,
          threshold: thresholdMs,
          title: 'Elevated DNS Lookup Latency',
          description: `DNS lookup took ${Math.round(dnsMs)} ms (threshold: ${thresholdMs} ms).`
        });
      }
    } else if (stage === 'gateway') {
      const gwMs = metrics.latency_ms || durationMs || 0;
      const loss = metrics.packet_loss_pct || 0;
      if (!success || loss >= 50) {
        issuesToCreate.push({
          type: 'test_failure',
          severity: 'critical',
          metric: 'gateway_latency_ms',
          observed: gwMs,
          threshold: 50,
          title: 'Default Gateway Unreachable',
          description: `Default gateway did not respond to ICMP/ARP packets (loss: ${loss}%).`
        });
      }
    } else if (stage === 'service_test') {
      // Check VoIP MOS
      if (metrics.mos !== undefined) {
        const mos = parseFloat(metrics.mos);
        const minMos = 3.8;
        if (mos < minMos) {
          issuesToCreate.push({
            type: 'threshold_violation',
            severity: mos < 3.2 ? 'critical' : 'major',
            metric: 'mos',
            observed: mos,
            threshold: minMos,
            title: 'Degraded VoIP Quality (MOS Below Threshold)',
            description: `Calculated ITU-T G.107 MOS score was ${mos.toFixed(2)} (threshold: ${minMos}). High jitter (${metrics.jitter_ms || 0} ms) or loss (${metrics.packet_loss_pct || 0}%).`
          });
        }
      }

      // Check HTTP latency / status
      if (metrics.http_status !== undefined) {
        if (metrics.http_status >= 400 || !success) {
          issuesToCreate.push({
            type: 'test_failure',
            severity: 'major',
            metric: 'http_status',
            observed: metrics.http_status,
            threshold: 200,
            title: `HTTP Service Returned Error ${metrics.http_status}`,
            description: `Web transaction failed with status code ${metrics.http_status}.`
          });
        }
      }

      // Check Throughput
      if (metrics.throughput_mbps !== undefined) {
        const mbps = parseFloat(metrics.throughput_mbps);
        const minThroughput = 40;
        if (mbps < minThroughput) {
          issuesToCreate.push({
            type: 'threshold_violation',
            severity: 'minor',
            metric: 'throughput_mbps',
            observed: mbps,
            threshold: minThroughput,
            title: 'Throughput Below Minimum Threshold',
            description: `Measured throughput was ${mbps.toFixed(1)} Mbps (threshold: ${minThroughput} Mbps).`
          });
        }
      }
    }

    // Persist any issues detected
    for (const issue of issuesToCreate) {
      const issueId = `iss-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await query(`
        INSERT INTO issues (id, sensor_id, network_id, test_id, type, severity, title, description, metric_name, observed_value, threshold_value, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
      `, [
        issueId,
        sensorId,
        networkId,
        testId || null,
        issue.type,
        issue.severity,
        issue.title,
        issue.description,
        issue.metric,
        issue.observed,
        issue.threshold
      ]);
    }

    // Auto-resolve active issues when test metrics recover and operate within SLA
    if (issuesToCreate.length === 0 && success) {
      const resolvedRes = await query(`
        UPDATE issues 
        SET status = 'resolved', resolved_at = NOW() 
        WHERE sensor_id = $1 
          AND status = 'active' 
          AND (
            ($2::varchar IS NOT NULL AND test_id = $2)
            OR (metric_name ILIKE '%' || $3 || '%' OR title ILIKE '%' || $3 || '%')
          )
        RETURNING id, incident_id
      `, [sensorId, testId || null, stage]);

      // Auto-resolve any correlated parent incidents whose child issues are all resolved
      if (resolvedRes.rows.length > 0) {
        await query(`
          UPDATE incidents 
          SET status = 'resolved', resolved_at = NOW()
          WHERE id IN (
            SELECT inc.id FROM incidents inc
            LEFT JOIN issues iss ON iss.incident_id = inc.id AND iss.status = 'active'
            WHERE (inc.status = 'open' OR inc.status = 'investigating')
            GROUP BY inc.id
            HAVING count(iss.id) = 0
          )
        `);
      }
    }

    return issuesToCreate;
  } catch (err) {
    console.error('Error evaluating threshold:', err);
    return [];
  }
}

module.exports = { evaluateResult };
