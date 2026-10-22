const { query } = require('../db');
const { dispatchWebhook } = require('./webhookDispatcher');

/**
 * AIOps Incident Engine:
 * Groups active issues across networks, sensors, and services into high-level Incidents.
 * In Pulse UX, Issues are Blue (isolated threshold breaches), Incidents are Red (correlated environmental impacts).
 */
async function correlateIncidents() {
  try {
    // 1. Fetch unassigned active issues
    const unassigned = await query(`
      SELECT * FROM issues 
      WHERE status = 'active' AND incident_id IS NULL 
      ORDER BY created_at ASC
    `);

    if (unassigned.rows.length === 0) return [];

    const groupedByNetwork = {};
    for (const issue of unassigned.rows) {
      const key = issue.network_id || issue.sensor_id;
      if (!groupedByNetwork[key]) groupedByNetwork[key] = [];
      groupedByNetwork[key].push(issue);
    }

    const createdIncidents = [];

    for (const [key, issues] of Object.entries(groupedByNetwork)) {
      if (issues.length >= 2 || issues.some(i => i.severity === 'critical')) {
        const incidentId = `inc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const sensorIds = [...new Set(issues.map(i => i.sensor_id))];
        const networkIds = [...new Set(issues.map(i => i.network_id).filter(Boolean))];
        const issueCodes = [...new Set(issues.map(i => i.metric_name || i.type))];

        const title = issues.length >= 2
          ? `Correlated Outage on ${networkIds[0] || sensorIds[0]} (${issues[0].title})`
          : `Critical Service Impact: ${issues[0].title}`;

        const summary = `${issues.length} active issue(s) detected affecting ${sensorIds.length} sensor(s). Leading indicator: ${issues[0].description}`;

        await query(`
          INSERT INTO incidents (id, status, title, summary, impact_scope, affected_networks, affected_sensors, issue_codes, issue_count, severity)
          VALUES ($1, 'open', $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          incidentId,
          title,
          summary,
          networkIds.join(', ') || 'Local Interface',
          JSON.stringify(networkIds),
          JSON.stringify(sensorIds),
          JSON.stringify(issueCodes),
          issues.length,
          issues.some(i => i.severity === 'critical') ? 'critical' : 'major'
        ]);

        // Link issues to this incident
        for (const issue of issues) {
          await query(`UPDATE issues SET incident_id = $1 WHERE id = $2`, [incidentId, issue.id]);
        }

        const incidentObj = {
          id: incidentId,
          title,
          summary,
          affected_networks: networkIds,
          affected_sensors: sensorIds,
          issue_count: issues.length
        };

        createdIncidents.push(incidentObj);

        // Notify Webhooks
        await dispatchWebhook('incident_opened', incidentObj);
      }
    }

    return createdIncidents;
  } catch (err) {
    console.error('Error correlating incidents:', err);
    return [];
  }
}

module.exports = { correlateIncidents };
