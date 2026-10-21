/**
 * Dashboard API Client
 */
const API = {
  baseUrl: '/api',

  async getOverview() {
    const res = await fetch(`${this.baseUrl}/overview`);
    return await res.json();
  },

  async getSensors() {
    const res = await fetch(`${this.baseUrl}/sensors`);
    return await res.json();
  },

  async getSensorHistory(sensorId, limit = 100, stage = 'all') {
    const url = `${this.baseUrl}/sensors/${encodeURIComponent(sensorId)}/history?limit=${limit}&stage=${stage}`;
    const res = await fetch(url);
    return await res.json();
  },

  async getWifiTelemetry(sensorId = null) {
    const url = sensorId ? `${this.baseUrl}/telemetry/wifi?sensor_id=${sensorId}` : `${this.baseUrl}/telemetry/wifi`;
    const res = await fetch(url);
    return await res.json();
  },

  async getIssues() {
    const res = await fetch(`${this.baseUrl}/issues`);
    return await res.json();
  },

  async getIncidents() {
    const res = await fetch(`${this.baseUrl}/incidents`);
    return await res.json();
  },

  async getTriageReports() {
    const res = await fetch(`${this.baseUrl}/triage`);
    return await res.json();
  },

  async getTriageById(id) {
    const res = await fetch(`${this.baseUrl}/triage/${id}`);
    return await res.json();
  },

  async getTests() {
    const res = await fetch(`${this.baseUrl}/tests`);
    return await res.json();
  },

  async simulateDegradation(scenario) {
    const res = await fetch(`${this.baseUrl}/simulate-degradation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario })
    });
    return await res.json();
  }
};
