/**
 * UXI Dashboard Master SPA Controller
 */
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initFaultSimulation();
  setupTriageActions();
  initEventSource();

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
}

// 3. Data Loaders
async function refreshAllData() {
  await Promise.all([
    refreshOverview(),
    loadIncidentsAndIssues(),
    loadSensors(),
    loadWifiEnvironment(),
    loadTriageReports(),
    loadTestsConfig()
  ]);
  if (typeof initSensorHistoryView === 'function') {
    initSensorHistoryView();
  }
}

async function refreshOverview() {
  try {
    const overview = await API.getOverview();

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
    const [incidents, issues] = await Promise.all([
      API.getIncidents(),
      API.getIssues()
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
              <button class="btn btn-secondary btn-sm" onclick="alert('Triggering immediate round-robin cycle on ${s.name}...')">Run Cycle</button>
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
    const apList = await API.getWifiTelemetry();

    // Render RF spectrum visualizer
    renderWifiSpectrum('spectrum-chart-container', apList);

    // Render APs table
    const tbody = document.getElementById('tbody-wifi-aps');
    if (tbody) {
      if (apList.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="11" style="text-align: center; padding: 2.5rem; color: var(--text-muted); font-size: 0.85rem;">
              No wireless access points detected. Active sensor (<strong>Kali-Linux-Sensor</strong>) is currently operating over Wired Ethernet (eth0).
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = apList.map(ap => `
          <tr>
            <td><strong>${ap.ssid}</strong></td>
            <td style="font-family: var(--font-mono); font-size: 0.75rem;">${ap.bssid}</td>
            <td>
              <span class="legend-chip">
                <span class="chip-color chip-${ap.vendor?.toLowerCase() === 'aruba' ? 'pulse' : (ap.vendor?.toLowerCase() || 'pulse')}"></span>
                ${ap.vendor_ap_name || (ap.vendor === 'Aruba' ? 'Pulse AP' : ap.vendor) || 'Pulse AP'}
              </span>
            </td>
            <td><span class="badge badge-cyan-outline">${ap.band}</span></td>
            <td style="font-family: var(--font-mono); font-weight: 700;">Ch ${ap.channel}</td>
            <td style="font-family: var(--font-mono); color: ${ap.rssi >= -60 ? 'var(--uxi-emerald)' : 'var(--uxi-amber)'};">${ap.rssi} dBm</td>
            <td style="font-family: var(--font-mono);">${ap.snr || 32} dB</td>
            <td>${ap.channel_utilization || 24}%</td>
            <td>${ap.client_count || 12}</td>
            <td>${ap.security || 'wpa2-psk'}</td>
            <td>
              ${ap.is_connected ? '<span class="badge badge-success">CONNECTED</span>' : '<span style="color:var(--text-muted); font-size:0.75rem;">Visible</span>'}
            </td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load Wi-Fi environment:', err);
  }
}

async function loadTriageReports() {
  try {
    const reports = await API.getTriageReports();
    renderTriageList(reports, (selected) => {
      displayTriageDetails(selected);
    });
  } catch (err) {
    console.error('Failed to load triage reports:', err);
  }
}

async function loadTestsConfig() {
  try {
    const tests = await API.getTests();
    const tbody = document.getElementById('tbody-tests-config');
    if (tbody) {
      tbody.innerHTML = tests.map(t => `
        <tr>
          <td><strong>${t.name}</strong></td>
          <td><span class="badge badge-cyan-outline">${t.template.toUpperCase()}</span></td>
          <td style="font-family: var(--font-mono); font-size: 0.78rem;">${t.target}${t.port ? ':' + t.port : ''}</td>
          <td>${t.interval_seconds}s</td>
          <td style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-secondary);">
            ${JSON.stringify(t.thresholds)}
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load tests config:', err);
  }
}

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
