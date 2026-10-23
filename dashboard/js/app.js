/**
 * UXI Dashboard Master SPA Controller
 */
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initFaultSimulation();
  setupTriageActions();
  initEventSource();
  if (typeof initRemoteTerminal === 'function') {
    initRemoteTerminal();
  }

  // Initial Data Load
  if (typeof initSimpleView === 'function') {
    initSimpleView();
  }
  refreshAllData();

  // Periodic polling fallback (every 10s)
  setInterval(() => {
    refreshOverview();
    if (typeof refreshSimpleView === 'function') {
      refreshSimpleView();
    }
  }, 10000);
});

// 1. Navigation Tab Switching & Pulse UX View Buttons
function initNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panes = document.querySelectorAll('.tab-pane');
  const viewBtns = document.querySelectorAll('.pulse-view-btn, .aruba-view-btn');

  function activateTab(targetId) {
    tabs.forEach(t => {
      if (t.getAttribute('data-tab') === targetId) t.classList.add('active');
      else t.classList.remove('active');
    });

    viewBtns.forEach(btn => {
      if (btn.getAttribute('data-tab') === targetId) btn.classList.add('active');
      else btn.classList.remove('active');
    });

    panes.forEach(p => p.classList.remove('active'));
    const targetPane = document.getElementById(targetId);
    if (targetPane) {
      targetPane.classList.add('active');
    }

    // Refresh specific tab data on activation
    if (targetId === 'tab-simple' && typeof refreshSimpleView === 'function') refreshSimpleView();
    if (targetId === 'tab-map' && typeof initFleetMap === 'function') initFleetMap();
    if (targetId === 'tab-wifi') loadWifiEnvironment();
    if (targetId === 'tab-sensors') {
      loadSensors();
      if (typeof initSensorHistoryView === 'function') initSensorHistoryView();
    }
    if (targetId === 'tab-triage') loadTriageReports();
    if (targetId === 'tab-config') loadTestsConfig();
  }

  window.activateTab = activateTab;

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      activateTab(targetId);
    });
  });

  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      activateTab(targetId);
    });
  });
}

// 2. Real-Time Server-Sent Events (SSE)
function initEventSource() {
  const liveIndicator = document.getElementById('live-indicator');
  const evtSource = new EventSource('/api/events');

  evtSource.onopen = () => {
    if (liveIndicator) {
      liveIndicator.style.opacity = '1';
    }
  };

  evtSource.onerror = () => {
    if (liveIndicator) {
      liveIndicator.style.opacity = '0.5';
    }
  };

  evtSource.addEventListener('stage_change', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateCycleStepper(data.current_stage);
      updateSensorStageInTables(data.sensor_id, data.current_stage, data.current_network_name);
    } catch {}
  });

  evtSource.addEventListener('test_result', () => {
    refreshOverview();
    loadIncidentsAndIssues();
    if (typeof refreshSimpleView === 'function') refreshSimpleView();
    if (typeof loadSensorHistoryData === 'function' && typeof selectedSensorId !== 'undefined' && selectedSensorId) {
      loadSensorHistoryData(selectedSensorId);
    }
  });

  evtSource.addEventListener('wifi_scan', () => {
    loadWifiEnvironment();
  });

  evtSource.addEventListener('incident_opened', () => {
    refreshOverview();
    loadIncidentsAndIssues();
    if (typeof refreshSimpleView === 'function') refreshSimpleView();
  });

  evtSource.addEventListener('triage_generated', () => {
    loadTriageReports();
  });

  evtSource.addEventListener('issues_cleared', () => {
    refreshOverview();
    loadIncidentsAndIssues();
    if (typeof refreshSimpleView === 'function') refreshSimpleView();
  });

  evtSource.addEventListener('simple_view_updated', () => {
    if (typeof refreshSimpleView === 'function') refreshSimpleView();
  });

  evtSource.addEventListener('sensor_updated', () => {
    loadSensors();
    if (typeof refreshFleetMapData === 'function') refreshFleetMapData();
  });

  evtSource.addEventListener('sensor_location_updated', () => {
    loadSensors();
    if (typeof refreshFleetMapData === 'function') refreshFleetMapData();
  });

  evtSource.addEventListener('sensor_command', (e) => {
    try {
      const cmd = JSON.parse(e.data);
      console.log('[Pulse UX Hub SSE] Sensor command dispatched:', cmd);
    } catch {}
  });

  evtSource.addEventListener('sensor_command_ack', (e) => {
    try {
      const ack = JSON.parse(e.data);
      console.log('[Pulse UX Hub SSE] Sensor command ACK:', ack);
      showCommandToast(`Sensor ${ack.sensor_id} finished execution!`);
      loadSensors();
    } catch {}
  });

  evtSource.addEventListener('tests_updated', () => {
    loadTestsConfig();
  });

  evtSource.addEventListener('thresholds_updated', () => {
    loadGlobalThresholds();
  });
}

// 3. Data Loaders
async function refreshAllData() {
  await Promise.all([
    refreshOverview(),
    loadIncidentsAndIssues(),
    loadSensors(),
    loadWifiEnvironment(),
    loadTriageReports(),
    loadTestsConfig(),
    loadGlobalThresholds()
  ]);
  if (typeof initSensorHistoryView === 'function') {
    initSensorHistoryView();
  }
}

async function refreshOverview() {
  try {
    const selectedId = window.currentSelectedSensorId || 'all';
    const overview = await API.getOverview(selectedId);

    // Render Donut
    renderExperienceDonut('experience-donut-container', overview.experienceScore);

    // Rating Badge
    const ratingBadge = document.getElementById('badge-score-rating');
    if (ratingBadge) {
      ratingBadge.innerText = overview.rating.toUpperCase();
      ratingBadge.className = `badge ${overview.experienceScore >= 90 ? 'badge-success' : (overview.experienceScore >= 75 ? 'badge-cyan-outline' : 'badge-red-outline')}`;
    }

    // Counts
    const incidentsCountEl = document.getElementById('stat-incidents-count');
    const issuesCountEl = document.getElementById('stat-issues-count');
    const sensorsOnlineEl = document.getElementById('stat-sensors-online');
    const sensorsTotalEl = document.getElementById('stat-sensors-total');
    const avgMosEl = document.getElementById('stat-avg-mos');

    if (incidentsCountEl) incidentsCountEl.innerText = overview.incidents.activeCount;
    if (issuesCountEl) issuesCountEl.innerText = overview.issues.activeCount;
    if (sensorsOnlineEl) sensorsOnlineEl.innerText = overview.sensors.online;
    if (sensorsTotalEl) sensorsTotalEl.innerText = overview.sensors.total;
    if (avgMosEl) avgMosEl.innerText = overview.averageMos;

    // Adjust pillar bars dynamically
    const wifiVal = document.getElementById('pillar-wifi-val');
    const wifiBar = document.getElementById('pillar-wifi-bar');
    const coreVal = document.getElementById('pillar-core-val');
    const coreBar = document.getElementById('pillar-core-bar');

    if (overview.incidents.activeCount > 0) {
      if (coreVal) coreVal.innerText = '58%';
      if (coreBar) { coreBar.style.width = '58%'; coreBar.className = 'progress-bar-fill fill-amber'; }
    } else {
      if (coreVal) coreVal.innerText = '94%';
      if (coreBar) { coreBar.style.width = '94%'; coreBar.className = 'progress-bar-fill fill-emerald'; }
    }
  } catch (err) {
    console.error('Failed to load overview:', err);
  }
}

async function loadIncidentsAndIssues() {
  try {
    const selectedId = window.currentSelectedSensorId || 'all';
    const [incidents, issues] = await Promise.all([
      API.getIncidents(selectedId),
      API.getIssues(selectedId)
    ]);

    const container = document.getElementById('incidents-list-container');
    if (!container) return;

    if (incidents.length === 0 && issues.length === 0) {
      container.innerHTML = `<div class="card-subtitle" style="padding: 1.5rem; text-align: center;">No active incidents or issues. All systems operating within SLA.</div>`;
      return;
    }

    let html = '';

    // Render Red Incidents first
    incidents.filter(inc => inc.status === 'open' || inc.status === 'investigating').forEach(inc => {
      html += `
        <div class="incident-card" onclick="document.getElementById('btn-tab-triage').click()">
          <div class="incident-header">
            <span class="incident-title text-red">🚨 INCIDENT: ${inc.title}</span>
            <span class="incident-time">${new Date(inc.created_at).toLocaleTimeString()}</span>
          </div>
          <div class="incident-summary">${inc.summary}</div>
          <div class="incident-tags">
            <span class="incident-tag">${inc.impact_scope || 'HQ Wireless'}</span>
            <span class="incident-tag text-red">${inc.issue_count} Correlated Issues</span>
          </div>
        </div>
      `;
    });

    // Render Blue Issues
    issues.filter(iss => iss.status === 'active').forEach(iss => {
      html += `
        <div class="incident-card issue-item">
          <div class="incident-header">
            <span class="incident-title text-blue">⚠️ ISSUE: ${iss.title}</span>
            <span class="incident-time">${new Date(iss.created_at).toLocaleTimeString()}</span>
          </div>
          <div class="incident-summary">${iss.description}</div>
          <div class="incident-tags">
            <span class="incident-tag">${iss.sensor_name || iss.sensor_id}</span>
            <span class="incident-tag text-blue">Observed: ${iss.observed_value} (Limit: ${iss.threshold_value})</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    console.error('Failed to load incidents and issues:', err);
  }
}

async function loadSensors() {
  try {
    const sensors = await API.getSensors();

    // 1. Overview Table
    const tbody = document.getElementById('tbody-sensors-overview');
    if (tbody) {
      tbody.innerHTML = sensors.map(s => `
        <tr id="row-sensor-${s.id}">
          <td><strong>${s.name}</strong></td>
          <td><span class="badge ${s.mode === 'sensor' ? 'badge-cyan-outline' : 'badge-blue-outline'}">${s.mode.toUpperCase()}</span></td>
          <td><span class="badge ${s.status === 'online' ? 'badge-success' : 'badge-red-outline'}">${s.status.toUpperCase()}</span></td>
          <td id="net-sensor-${s.id}">${s.current_network_name || 'Corp-Enterprise-5G'}</td>
          <td><span class="badge badge-cyan-outline" id="stage-sensor-${s.id}">${(s.current_stage || 'idle').toUpperCase()}</span></td>
          <td>${s.hardware_model || 'Intel N100'}</td>
          <td>${new Date(s.last_seen || Date.now()).toLocaleTimeString()}</td>
          <td>
            <button class="btn btn-secondary" onclick="document.getElementById('btn-tab-sensors').click()">Inspect</button>
          </td>
        </tr>
      `).join('');
    }

    // 2. Sensors Cards Grid
    const cardsGrid = document.getElementById('sensors-cards-grid');
    if (cardsGrid) {
      cardsGrid.innerHTML = sensors.map(s => `
        <div class="card glass-card sensor-card" id="card-sensor-${s.id}">
          <div class="sensor-title-row">
            <div>
              <div class="sensor-name">${s.name}</div>
              <div class="sensor-hardware">${s.hardware_model || 'Linux Host'}</div>
            </div>
            <span class="badge ${s.status === 'online' ? 'badge-success' : 'badge-red-outline'}">${s.status.toUpperCase()}</span>
          </div>

          <div class="sensor-specs-grid">
            <div class="spec-item">
              <span class="spec-key">Mode</span>
              <span class="spec-val text-cyan">${s.mode.toUpperCase()}</span>
            </div>
            <div class="spec-item">
              <span class="spec-key">Cycle Count</span>
              <span class="spec-val" id="cycles-sensor-${s.id}">${s.cycle_count || 1}</span>
            </div>
            <div class="spec-item">
              <span class="spec-key">Active Network</span>
              <span class="spec-val text-emerald" id="card-net-${s.id}">${s.current_network_name || 'None'}</span>
            </div>
            <div class="spec-item">
              <span class="spec-key">Test Stage</span>
              <span class="spec-val text-amber" id="card-stage-${s.id}">${(s.current_stage || 'idle').toUpperCase()}</span>
            </div>
            <div class="spec-item">
              <span class="spec-key">IP Address</span>
              <span class="spec-val">${s.ip_address || '10.10.30.85'}</span>
            </div>
            <div class="spec-item">
              <span class="spec-key">MAC Address</span>
              <span class="spec-val">${s.mac_address || 'e4:5f:01:bc:39:10'}</span>
            </div>
          </div>

          <div class="card-footer" style="display:flex; justify-content:space-between; align-items:center; border-top: 1px solid var(--border-subtle); padding-top: 0.75rem; gap: 0.5rem; flex-wrap: wrap;">
            <span style="font-size: 0.72rem; color: var(--text-muted);">Firmware: ${s.firmware_version || '2.4.0-uxi'}</span>
            <div style="display: flex; gap: 0.5rem;">
              <button class="btn btn-secondary btn-sm" onclick="selectAndFocusSensorHistory('${s.id}')">View History</button>
              <button class="btn btn-secondary btn-sm" onclick="openRemoteTerminal('${s.id}', '${s.name}', '${s.ip_address || ''}')" style="border-color: #00f2fe; color: #00f2fe;" title="Open Remote Shell Console">&gt;_ Terminal</button>
              <button class="btn btn-secondary btn-sm btn-run-cycle" onclick="triggerSensorCycle('${s.id}', this)" title="Dispatch immediate test cycle to sensor">Run Cycle</button>
            </div>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load sensors:', err);
  }
}

async function loadWifiEnvironment() {
  try {
    const selectedId = window.currentSelectedSensorId || 'all';
    const apList = await API.getWifiTelemetry(selectedId);

    // Render RF spectrum visualizer
    renderWifiSpectrum('spectrum-chart-container', apList);

    // Render APs table
    const tbody = document.getElementById('tbody-wifi-aps');
    if (tbody) {
      if (apList.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="11" style="text-align: center; padding: 2.5rem; color: var(--text-muted); font-size: 0.85rem;">
              No wireless access points detected for this sensor.
            </td>
          </tr>
        `;
      } else {
        // Sort with connected AP first, then by RSSI descending
        const sorted = [...apList].sort((a, b) => {
          if (a.is_connected && !b.is_connected) return -1;
          if (!a.is_connected && b.is_connected) return 1;
          return (b.rssi || -100) - (a.rssi || -100);
        });

        tbody.innerHTML = sorted.map(ap => {
          const vLower = (ap.vendor || '').toLowerCase();
          let chipClass = 'chip-pulse';
          if (vLower.includes('ubiquiti') || vLower.includes('unifi')) chipClass = 'chip-ubnt';
          else if (vLower.includes('bell')) chipClass = 'chip-bell';
          else if (vLower.includes('cisco')) chipClass = 'chip-cisco';
          else if (vLower.includes('mist')) chipClass = 'chip-mist';
          else if (vLower.includes('extreme')) chipClass = 'chip-extreme';
          else if (vLower.includes('aruba')) chipClass = 'chip-aruba';

          return `
            <tr style="${ap.is_connected ? 'background: rgba(101, 193, 140, 0.08); border-left: 3px solid #65c18c;' : ''}">
              <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                  ${ap.is_connected ? '<span style="color: #65c18c; font-size: 0.85rem;" title="Currently Associated">●</span>' : ''}
                  <strong>${ap.ssid}</strong>
                </div>
              </td>
              <td style="font-family: var(--font-mono); font-size: 0.75rem;">${ap.bssid}</td>
              <td>
                <span class="legend-chip">
                  <span class="chip-color ${chipClass}"></span>
                  ${ap.vendor_ap_name || ap.vendor || 'Pulse AP'}
                </span>
              </td>
              <td><span class="badge badge-cyan-outline">${ap.band}</span></td>
              <td style="font-family: var(--font-mono); font-weight: 700;">Ch ${ap.channel}</td>
              <td style="font-family: var(--font-mono); color: ${ap.rssi >= -60 ? '#65c18c' : (ap.rssi >= -75 ? '#f39c12' : '#94a3b8')};">${ap.rssi} dBm</td>
              <td style="font-family: var(--font-mono);">${ap.snr || 32} dB</td>
              <td>${ap.channel_utilization || 24}%</td>
              <td>${ap.client_count || 12}</td>
              <td>${ap.security || 'wpa2-psk'}</td>
              <td>
                ${ap.is_connected ? '<span class="badge badge-success" style="font-weight: 700; background: rgba(101, 193, 140, 0.2); color: #65c18c; border: 1px solid #65c18c;">CONNECTED</span>' : '<span style="color:var(--text-muted); font-size:0.75rem;">Visible</span>'}
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load Wi-Fi environment:', err);
  }
}

async function loadTriageReports() {
  try {
    const selectedId = window.currentSelectedSensorId || 'all';
    const reports = await API.getTriageReports(selectedId);
    renderTriageList(reports, (selected) => {
      displayTriageDetails(selected);
    });
  } catch (err) {
    console.error('Failed to load triage reports:', err);
  }
}

let allTestsConfig = [];

async function loadTestsConfig() {
  try {
    const tests = await API.getTests();
    allTestsConfig = tests || [];
    const tbody = document.getElementById('tbody-tests-config');
    if (tbody) {
      if (allTestsConfig.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No synthetic tests configured. Click "+ Add Synthetic Test" above.</td></tr>`;
        return;
      }
      tbody.innerHTML = allTestsConfig.map(t => {
        let targetDisplay = `${t.target}${t.port ? ':' + t.port : ''}`;
        if (t.target === 'default_gateway' || t.target === 'gateway' || t.target === '$GATEWAY' || t.id === 'test-gw-ping') {
          targetDisplay = `<span class="badge badge-emerald-outline" style="font-size:0.75rem; letter-spacing:0; padding: 2px 8px; display: inline-flex; align-items: center;" title="Evaluated dynamically against each sensor's active default gateway">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px;"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Sensor Gateway (Dynamic)
          </span>`;
        }
        return `
        <tr id="row-test-${t.id}">
          <td><strong>${t.name}</strong></td>
          <td><span class="badge badge-cyan-outline">${t.template.toUpperCase()}</span></td>
          <td style="font-family: var(--font-mono); font-size: 0.78rem;">${targetDisplay}</td>
          <td>${t.interval_seconds}s</td>
          <td style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-secondary);">
            ${JSON.stringify(t.thresholds || {})}
          </td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 6px; justify-content: flex-end;">
              <button class="btn btn-secondary btn-sm" onclick="openTestEditorModal('${t.id}')" title="Edit Test">Edit</button>
              <button class="btn btn-outline-danger btn-sm" onclick="deleteTestConfig('${t.id}')" title="Delete Test">&times;</button>
            </div>
          </td>
        </tr>
      `;
      }).join('');
    }
  } catch (err) {
    console.error('Failed to load tests config:', err);
  }
}

async function loadGlobalThresholds() {
  try {
    const data = await API.getGlobalThresholds();
    if (!data) return;
    const d = document.getElementById('thresh-dhcp');
    const n = document.getElementById('thresh-dns');
    const m = document.getElementById('thresh-mos');
    const t = document.getElementById('thresh-throughput');
    const w = document.getElementById('webhook-url');

    if (d && data.max_dhcp_ms) d.value = data.max_dhcp_ms;
    if (n && data.max_dns_ms) n.value = data.max_dns_ms;
    if (m && data.min_mos) m.value = data.min_mos;
    if (t && data.min_throughput_mbps) t.value = data.min_throughput_mbps;
    if (w && data.webhook_url !== undefined) w.value = data.webhook_url;
  } catch (err) {
    console.error('Failed to load thresholds:', err);
  }
}

async function saveGlobalThresholds(e) {
  if (e) e.preventDefault();
  const btn = document.getElementById('btn-save-thresholds');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Saving...';
  }

  const payload = {
    max_dhcp_ms: parseInt(document.getElementById('thresh-dhcp').value, 10),
    max_dns_ms: parseInt(document.getElementById('thresh-dns').value, 10),
    min_mos: parseFloat(document.getElementById('thresh-mos').value),
    min_throughput_mbps: parseFloat(document.getElementById('thresh-throughput').value),
    webhook_url: document.getElementById('webhook-url').value.trim()
  };

  try {
    await API.updateGlobalThresholds(payload);
    showCommandToast('Global SLA Thresholds saved to database!');
    if (btn) {
      btn.innerText = 'Saved!';
      btn.style.borderColor = '#10b981';
      btn.style.color = '#10b981';
    }
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.innerText = 'Save Configuration';
        btn.style.borderColor = '';
        btn.style.color = '';
      }
    }, 2500);
  } catch (err) {
    alert('Failed to save thresholds: ' + err.message);
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Save Configuration';
    }
  }
}

function openTestEditorModal(testId = null) {
  const modal = document.getElementById('modal-test-editor');
  const heading = document.getElementById('test-modal-heading');
  const inputId = document.getElementById('input-test-id');
  const inputName = document.getElementById('input-test-name');
  const inputTemplate = document.getElementById('input-test-template');
  const inputTarget = document.getElementById('input-test-target');
  const inputPort = document.getElementById('input-test-port');
  const inputInterval = document.getElementById('input-test-interval');
  const inputLatency = document.getElementById('input-test-threshold-latency');
  const inputEnabled = document.getElementById('input-test-enabled');

  if (!modal) return;

  if (testId) {
    const test = allTestsConfig.find(t => t.id === testId);
    if (test) {
      if (heading) heading.innerText = 'Edit Synthetic Test';
      if (inputId) inputId.value = test.id;
      if (inputName) inputName.value = test.name;
      if (inputTemplate) inputTemplate.value = test.template;
      if (inputTarget) inputTarget.value = test.target;
      if (inputPort) inputPort.value = test.port || 443;
      if (inputInterval) inputInterval.value = test.interval_seconds || 180;
      if (inputLatency) inputLatency.value = test.thresholds?.max_latency_ms || 150;
      if (inputEnabled) inputEnabled.checked = test.is_enabled !== false;
    }
  } else {
    if (heading) heading.innerText = 'Add Synthetic Test';
    if (inputId) inputId.value = '';
    if (inputName) inputName.value = '';
    if (inputTemplate) inputTemplate.value = 'webserver';
    if (inputTarget) inputTarget.value = '';
    if (inputPort) inputPort.value = '443';
    if (inputInterval) inputInterval.value = '180';
    if (inputLatency) inputLatency.value = '150';
    if (inputEnabled) inputEnabled.checked = true;
  }

  modal.style.display = 'flex';
}

function closeTestEditorModal() {
  const modal = document.getElementById('modal-test-editor');
  if (modal) modal.style.display = 'none';
}

function setTestTargetToGateway() {
  const inputTarget = document.getElementById('input-test-target');
  const inputPort = document.getElementById('input-test-port');
  const inputTemplate = document.getElementById('input-test-template');
  const inputName = document.getElementById('input-test-name');
  if (inputTarget) inputTarget.value = 'default_gateway';
  if (inputPort) inputPort.value = '0';
  if (inputTemplate) inputTemplate.value = 'generic_tcp';
  if (inputName && !inputName.value) inputName.value = 'Sensor Default Gateway Ping';
}
window.setTestTargetToGateway = setTestTargetToGateway;

async function handleTestEditorSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('input-test-id').value;
  const name = document.getElementById('input-test-name').value.trim();
  const template = document.getElementById('input-test-template').value;
  const target = document.getElementById('input-test-target').value.trim();
  const port = parseInt(document.getElementById('input-test-port').value, 10) || 443;
  const interval_seconds = parseInt(document.getElementById('input-test-interval').value, 10) || 180;
  const max_latency_ms = parseInt(document.getElementById('input-test-threshold-latency').value, 10) || 150;
  const is_enabled = document.getElementById('input-test-enabled').checked;

  const payload = {
    name,
    template,
    target,
    port,
    interval_seconds,
    thresholds: { max_latency_ms },
    is_enabled
  };

  const saveBtn = document.getElementById('btn-save-test-editor');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerText = 'Saving...';
  }

  try {
    if (id) {
      await API.updateTest(id, payload);
      showCommandToast(`Synthetic test "${name}" updated!`);
    } else {
      await API.createTest(payload);
      showCommandToast(`New synthetic test "${name}" created!`);
    }
    closeTestEditorModal();
    await loadTestsConfig();
  } catch (err) {
    alert('Failed to save test: ' + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        Save Test
      `;
    }
  }
}

async function deleteTestConfig(testId) {
  const test = allTestsConfig.find(t => t.id === testId);
  const testName = test ? test.name : testId;
  if (!confirm(`Are you sure you want to delete synthetic test "${testName}"?`)) {
    return;
  }

  try {
    await API.deleteTest(testId);
    showCommandToast(`Test "${testName}" deleted.`);
    await loadTestsConfig();
  } catch (err) {
    alert('Failed to delete test: ' + err.message);
  }
}

window.loadGlobalThresholds = loadGlobalThresholds;
window.saveGlobalThresholds = saveGlobalThresholds;
window.openTestEditorModal = openTestEditorModal;
window.closeTestEditorModal = closeTestEditorModal;
window.handleTestEditorSubmit = handleTestEditorSubmit;
window.deleteTestConfig = deleteTestConfig;


// 4. Live Cycle Stepper Animations
function updateCycleStepper(stage) {
  const steps = document.querySelectorAll('.cycle-step');
  const stageOrder = [
    'ap_scan',
    'ssid_check',
    'association',
    'dhcp',
    'gateway',
    'primary_dns',
    'secondary_dns',
    'external_http',
    'service_test',
    'release_deauth'
  ];

  const currentIdx = stageOrder.indexOf(stage);

  steps.forEach(stepEl => {
    const stepName = stepEl.getAttribute('data-step');
    const idx = stageOrder.indexOf(stepName);

    stepEl.classList.remove('active', 'completed', 'failed');
    if (idx < currentIdx) {
      stepEl.classList.add('completed');
    } else if (idx === currentIdx) {
      stepEl.classList.add('active');
    }
  });
}

function updateSensorStageInTables(sensorId, stage, netName) {
  const stageEl = document.getElementById(`stage-sensor-${sensorId}`);
  const netEl = document.getElementById(`net-sensor-${sensorId}`);
  const cardStageEl = document.getElementById(`card-stage-${sensorId}`);
  const cardNetEl = document.getElementById(`card-net-${sensorId}`);

  if (stageEl) stageEl.innerText = (stage || 'idle').toUpperCase();
  if (netEl && netName) netEl.innerText = netName;
  if (cardStageEl) cardStageEl.innerText = (stage || 'idle').toUpperCase();
  if (cardNetEl && netName) cardNetEl.innerText = netName;
}

// 5. Fault Simulation Handlers
function initFaultSimulation() {
  const btnDhcp = document.getElementById('btn-sim-dhcp');
  const btnVoip = document.getElementById('btn-sim-voip');
  const btnClear = document.getElementById('btn-sim-clear');
  const saveBtn = document.getElementById('btn-save-thresholds');

  if (btnDhcp) {
    btnDhcp.addEventListener('click', async () => {
      btnDhcp.innerText = 'Triggering...';
      await API.simulateDegradation('dhcp_timeout');
      btnDhcp.innerText = 'DHCP Failure';
      refreshOverview();
      loadIncidentsAndIssues();
      loadTriageReports();
      if (typeof refreshSimpleView === 'function') refreshSimpleView();
    });
  }

  if (btnVoip) {
    btnVoip.addEventListener('click', async () => {
      btnVoip.innerText = 'Triggering...';
      await API.simulateDegradation('voip_jitter');
      btnVoip.innerText = 'VoIP Jitter';
      refreshOverview();
      loadIncidentsAndIssues();
      if (typeof refreshSimpleView === 'function') refreshSimpleView();
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', async () => {
      btnClear.innerText = 'Resolving...';
      await API.simulateDegradation('clear');
      btnClear.innerText = 'Resolve All';
      refreshOverview();
      loadIncidentsAndIssues();
      if (typeof refreshSimpleView === 'function') refreshSimpleView();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      alert('Threshold configuration saved successfully. Test definitions updated.');
    });
  }
}

// 6. Sensor Command Dispatcher
async function triggerSensorCycle(sensorId, btnEl) {
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerText = 'Dispatching...';
  }
  try {
    const res = await API.sendSensorCommand(sensorId, 'run_cycle');
    showCommandToast(`Test cycle command sent to sensor ${sensorId}!`);
    if (btnEl) {
      btnEl.innerText = 'Cycle Dispatched!';
      btnEl.style.borderColor = '#10b981';
      btnEl.style.color = '#10b981';
    }
    setTimeout(() => {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerText = 'Run Cycle';
        btnEl.style.borderColor = '';
        btnEl.style.color = '';
      }
    }, 3500);
  } catch (err) {
    alert('Failed to dispatch cycle: ' + err.message);
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.innerText = 'Run Cycle';
    }
  }
}

function showCommandToast(message) {
  const existing = document.getElementById('hub-command-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'hub-command-toast';
  toast.className = 'map-pinning-toast';
  toast.style.background = '#0a2540';
  toast.style.borderColor = '#00f2fe';
  toast.innerHTML = `
    <span style="display: flex; align-items: center; gap: 8px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00f2fe" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      <strong>Command:</strong> ${message}
    </span>
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast) toast.remove();
  }, 4000);
}

window.triggerSensorCycle = triggerSensorCycle;
window.showCommandToast = showCommandToast;
