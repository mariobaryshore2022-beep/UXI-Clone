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

  async updateSensorLocation(sensorId, data) {
    const res = await fetch(`${this.baseUrl}/sensors/${encodeURIComponent(sensorId)}/location`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
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
  },

  async getSimpleViewItems(pillar = null) {
    const url = pillar ? `${this.baseUrl}/simple-view/items?pillar=${pillar}` : `${this.baseUrl}/simple-view/items`;
    const res = await fetch(url);
    return await res.json();
  },

  async createSimpleViewItem(data) {
    const res = await fetch(`${this.baseUrl}/simple-view/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async updateSimpleViewItem(id, data) {
    const res = await fetch(`${this.baseUrl}/simple-view/items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async deleteSimpleViewItem(id) {
    const res = await fetch(`${this.baseUrl}/simple-view/items/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    return await res.json();
  },

  async resetSimpleViewItems() {
    const res = await fetch(`${this.baseUrl}/simple-view/reset`, {
      method: 'POST'
    });
    return await res.json();
  },

  async setSimpleViewPreset(preset = 'aruba') {
    const res = await fetch(`${this.baseUrl}/simple-view/preset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset })
    });
    return await res.json();
  },

  async sendSensorCommand(sensorId, action, params = {}) {
    const res = await fetch(`${this.baseUrl}/sensors/${encodeURIComponent(sensorId)}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params })
    });
    return await res.json();
  },

  async createTest(data) {
    const res = await fetch(`${this.baseUrl}/tests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async updateTest(id, data) {
    const res = await fetch(`${this.baseUrl}/tests/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async deleteTest(id) {
    const res = await fetch(`${this.baseUrl}/tests/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    return await res.json();
  },

  async getGlobalThresholds() {
    const res = await fetch(`${this.baseUrl}/settings/thresholds`);
    return await res.json();
  },

  async updateGlobalThresholds(data) {
    const res = await fetch(`${this.baseUrl}/settings/thresholds`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async executeRemoteTerminal(sensorId, command, timeoutMs = 8000) {
    const res = await fetch(`${this.baseUrl}/sensors/${encodeURIComponent(sensorId)}/terminal/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, timeout_ms: timeoutMs })
    });
    return await res.json();
  },

  async getTerminalHistory(sensorId) {
    const res = await fetch(`${this.baseUrl}/sensors/${encodeURIComponent(sensorId)}/terminal/history`);
    return await res.json();
  },

  async getGroups() {
    const res = await fetch(`${this.baseUrl}/groups`);
    return await res.json();
  },

  async createGroup(data) {
    const res = await fetch(`${this.baseUrl}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async updateGroup(id, data) {
    const res = await fetch(`${this.baseUrl}/groups/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async deleteGroup(id) {
    const res = await fetch(`${this.baseUrl}/groups/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    return await res.json();
  },

  async resetGroups() {
    const res = await fetch(`${this.baseUrl}/groups/reset`, {
      method: 'POST'
    });
    return await res.json();
  }
};

