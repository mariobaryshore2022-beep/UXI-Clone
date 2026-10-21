/**
 * Sensor Detailed Test History & Historical Metric Trend Charts
 */

let selectedSensorId = null;
let currentStageFilter = 'all';
let historyListenersAttached = false;
const historyResultsCache = new Map();

async function initSensorHistoryView() {
  const selectEl = document.getElementById('select-history-sensor');
  if (!selectEl) return;

  try {
    const sensors = await API.getSensors();
    if (!sensors || sensors.length === 0) return;

    // Populate dropdown
    const currentVal = selectEl.value;
    selectEl.innerHTML = sensors.map(s => `
      <option value="${s.id}">
        ${s.name} (${s.ip_address || '192.168.64.4'})
      </option>
    `).join('');

    // Restore or default selected sensor
    if (selectedSensorId && sensors.some(s => s.id === selectedSensorId)) {
      selectEl.value = selectedSensorId;
    } else if (currentVal && sensors.some(s => s.id === currentVal)) {
      selectEl.value = currentVal;
      selectedSensorId = currentVal;
    } else {
      selectEl.value = sensors[0].id;
      selectedSensorId = sensors[0].id;
    }

    if (!historyListenersAttached) {
      selectEl.addEventListener('change', () => {
        selectedSensorId = selectEl.value;
        loadSensorHistoryData(selectedSensorId);
      });

      // Filter pills
      document.querySelectorAll('.history-filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          document.querySelectorAll('.history-filter-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          currentStageFilter = pill.getAttribute('data-filter') || 'all';
          loadSensorHistoryData(selectedSensorId);
        });
      });

      // Close modal on escape key or clicking backdrop
      const modal = document.getElementById('modal-metrics-viewer');
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeMetricsModal();
        });
      }
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMetricsModal();
      });

      historyListenersAttached = true;
    }

    // Load initial data
    await loadSensorHistoryData(selectedSensorId);
  } catch (err) {
    console.error('Failed to init sensor history view:', err);
  }
}

async function loadSensorHistoryData(sensorId) {
  if (!sensorId) return;
  try {
    const data = await API.getSensorHistory(sensorId, 100, currentStageFilter);
    if (!data) return;

    // 1. Update Sensor Info Banner
    const infoName = document.getElementById('hist-sensor-name');
    const infoMeta = document.getElementById('hist-sensor-meta');
    const infoStage = document.getElementById('hist-sensor-stage');

    if (infoName) infoName.innerText = data.sensor.name;
    if (infoMeta) infoMeta.innerText = `${data.sensor.hardware_model || 'Linux VM'} • IP: ${data.sensor.ip_address || '192.168.64.4'} • Mode: ${(data.sensor.mode || 'dedicated').toUpperCase()}`;
    if (infoStage) infoStage.innerText = `Active Network: ${data.sensor.current_network_name || 'Wired-Ethernet (eth0)'} (${(data.sensor.current_stage || 'idle').toUpperCase()})`;

    // 2. Update KPI Summary Cards
    const kpiMos = document.getElementById('hist-kpi-mos');
    const kpiLatency = document.getElementById('hist-kpi-latency');
    const kpiDns = document.getElementById('hist-kpi-dns');
    const kpiThroughput = document.getElementById('hist-kpi-throughput');
    const kpiCount = document.getElementById('hist-kpi-count');

    if (kpiMos) kpiMos.innerText = data.summary.avgMos;
    if (kpiLatency) kpiLatency.innerText = `${data.summary.avgLatencyMs} ms`;
    if (kpiDns) kpiDns.innerText = `${data.summary.avgDnsMs} ms`;
    if (kpiThroughput) kpiThroughput.innerText = `${data.summary.avgThroughputMbps} Mbps`;
    if (kpiCount) kpiCount.innerText = `${data.summary.totalTests} tests (${data.summary.successRate}% Pass)`;

    // 3. Render Trend Charts
    renderMosTrendChart('chart-mos-trend', data.timeSeries);
    renderLatencyTrendChart('chart-latency-trend', data.timeSeries);

    // 4. Render Historical Test Results Table
    renderHistoryTable(data.results);
  } catch (err) {
    console.error('Failed to load sensor history:', err);
  }
}

// Render VoIP Quality (MOS) & SLA Line Chart
function renderMosTrendChart(containerId, timeSeries = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const mosPoints = timeSeries.filter(p => p.mos !== null);

  if (mosPoints.length < 2) {
    container.innerHTML = `
      <div style="height: 180px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 0.8rem;">
        Accumulating chronological MOS data points from Kali sensor... (${mosPoints.length} recorded)
      </div>
    `;
    return;
  }

  const width = 600;
  const height = 180;
  const padding = { top: 25, right: 35, bottom: 30, left: 45 };

  // Scale: MOS from 2.0 to 5.0
  const minMos = 2.0;
  const maxMos = 5.0;

  const getX = (idx) => padding.left + (idx / (mosPoints.length - 1)) * (width - padding.left - padding.right);
  const getY = (val) => padding.top + (1 - (val - minMos) / (maxMos - minMos)) * (height - padding.top - padding.bottom);

  // Path data
  const points = mosPoints.map((p, idx) => `${getX(idx).toFixed(1)},${getY(p.mos).toFixed(1)}`).join(' ');
  const slaY = getY(3.8); // 3.8 SLA Line

  // Area path
  const firstX = getX(0);
  const lastX = getX(mosPoints.length - 1);
  const bottomY = height - padding.bottom;
  const areaPath = `M ${firstX},${bottomY} L ${points.split(' ').join(' L ')} L ${lastX},${bottomY} Z`;

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 180px; overflow: visible;">
      <defs>
        <linearGradient id="mosAreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
        </linearGradient>
      </defs>

      <!-- Y Grid lines -->
      <line x1="${padding.left}" y1="${getY(4.5)}" x2="${width - padding.right}" y2="${getY(4.5)}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3"/>
      <text x="${padding.left - 8}" y="${getY(4.5) + 4}" fill="#64748b" font-size="10" font-family="monospace" text-anchor="end">4.5</text>

      <line x1="${padding.left}" y1="${slaY}" x2="${width - padding.right}" y2="${slaY}" stroke="rgba(245,158,11,0.6)" stroke-dasharray="4,4"/>
      <text x="${width - padding.right + 4}" y="${slaY + 3}" fill="#f59e0b" font-size="9" font-family="monospace">SLA 3.8</text>

      <line x1="${padding.left}" y1="${getY(3.0)}" x2="${width - padding.right}" y2="${getY(3.0)}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3"/>
      <text x="${padding.left - 8}" y="${getY(3.0) + 4}" fill="#64748b" font-size="10" font-family="monospace" text-anchor="end">3.0</text>

      <!-- Shaded Area -->
      <path d="${areaPath}" fill="url(#mosAreaGradient)"/>

      <!-- Value Line -->
      <polyline points="${points}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 6px rgba(16,185,129,0.5));"/>

      <!-- Point markers -->
      ${mosPoints.map((p, idx) => `
        <circle cx="${getX(idx)}" cy="${getY(p.mos)}" r="4" fill="#0b0f19" stroke="#10b981" stroke-width="2">
          <title>${new Date(p.timestamp).toLocaleTimeString()}: MOS ${p.mos} (${p.test_name})</title>
        </circle>
      `).join('')}

      <!-- Time axis endpoints -->
      <text x="${padding.left}" y="${height - 8}" fill="#64748b" font-size="10" font-family="monospace">${new Date(mosPoints[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>
      <text x="${width - padding.right}" y="${height - 8}" fill="#64748b" font-size="10" font-family="monospace" text-anchor="end">${new Date(mosPoints[mosPoints.length - 1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</text>
    </svg>
  `;
}

// Render Latency & DNS Response Time Chart
function renderLatencyTrendChart(containerId, timeSeries = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const validPoints = timeSeries.filter(p => p.latency_ms !== null || p.dns_ms !== null);

  if (validPoints.length < 2) {
    container.innerHTML = `
      <div style="height: 180px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 0.8rem;">
        Accumulating latency & DNS timing points... (${validPoints.length} recorded)
      </div>
    `;
    return;
  }

  const width = 600;
  const height = 180;
  const padding = { top: 25, right: 35, bottom: 30, left: 45 };

  const values = validPoints.map(p => p.latency_ms || p.dns_ms || 10);
  const maxVal = Math.max(80, Math.ceil(Math.max(...values) * 1.25));

  const getX = (idx) => padding.left + (idx / (validPoints.length - 1)) * (width - padding.left - padding.right);
  const getY = (val) => padding.top + (1 - (val / maxVal)) * (height - padding.top - padding.bottom);

  const points = validPoints.map((p, idx) => {
    const val = p.latency_ms || p.dns_ms || 10;
    return `${getX(idx).toFixed(1)},${getY(val).toFixed(1)}`;
  }).join(' ');

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 180px; overflow: visible;">
      <defs>
        <linearGradient id="latencyAreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#00f2fe" stop-opacity="0.0"/>
        </linearGradient>
      </defs>

      <!-- Y Grid lines -->
      <line x1="${padding.left}" y1="${getY(maxVal / 2)}" x2="${width - padding.right}" y2="${getY(maxVal / 2)}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3"/>
      <text x="${padding.left - 8}" y="${getY(maxVal / 2) + 4}" fill="#64748b" font-size="10" font-family="monospace" text-anchor="end">${Math.round(maxVal / 2)}ms</text>

      <!-- Line -->
      <polyline points="${points}" fill="none" stroke="#00f2fe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 6px rgba(0,242,254,0.4));"/>

      <!-- Points -->
      ${validPoints.map((p, idx) => {
        const val = p.latency_ms || p.dns_ms || 10;
        return `
          <circle cx="${getX(idx)}" cy="${getY(val)}" r="3.5" fill="#0b0f19" stroke="#00f2fe" stroke-width="2">
            <title>${p.test_name}: ${val}ms</title>
          </circle>
        `;
      }).join('')}

      <!-- Time axis endpoints -->
      <text x="${padding.left}" y="${height - 8}" fill="#64748b" font-size="10" font-family="monospace">${new Date(validPoints[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>
      <text x="${width - padding.right}" y="${height - 8}" fill="#64748b" font-size="10" font-family="monospace" text-anchor="end">${new Date(validPoints[validPoints.length - 1].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</text>
    </svg>
  `;
}

// Render Historical Results Table
function renderHistoryTable(results = []) {
  const tbody = document.getElementById('tbody-sensor-history');
  if (!tbody) return;

  historyResultsCache.clear();

  if (results.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted); font-size: 0.85rem;">No test results recorded for selected stage filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = results.map(r => {
    historyResultsCache.set(r.id, r);

    let metricSummary = '';
    const m = r.metrics || {};
    if (m.mos !== undefined) {
      metricSummary = `MOS: <strong class="text-emerald">${parseFloat(m.mos).toFixed(2)}</strong> (Jitter: ${m.jitter_ms || 0}ms, Loss: ${m.packet_loss_pct || 0}%)`;
    } else if (m.dns_lookup_time_ms !== undefined) {
      metricSummary = `DNS: <strong class="text-cyan">${m.dns_lookup_time_ms}ms</strong> (${m.resolver || 'Core'})`;
    } else if (m.throughput_mbps !== undefined) {
      metricSummary = `Throughput: <strong class="text-emerald">${m.throughput_mbps} Mbps</strong>`;
    } else if (m.latency_ms !== undefined) {
      metricSummary = `Latency: <strong class="text-cyan">${m.latency_ms}ms</strong>`;
    } else if (m.dhcp_lease_time_ms !== undefined) {
      metricSummary = `DHCP DORA: <strong class="text-amber">${m.dhcp_lease_time_ms}ms</strong>`;
    } else {
      metricSummary = `Duration: ${Math.round(r.duration_ms)}ms`;
    }

    const timeAgo = formatTimeAgo(new Date(r.timestamp));

    return `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 0.75rem; white-space: nowrap;">
          ${new Date(r.timestamp).toLocaleTimeString()}
          <span style="display:block; font-size: 0.65rem; color: var(--text-muted);">${timeAgo}</span>
        </td>
        <td><strong>${r.test_name || r.stage.replace('_', ' ').toUpperCase()}</strong></td>
        <td><span class="badge badge-cyan-outline" style="font-size: 0.65rem;">${r.stage.toUpperCase()}</span></td>
        <td>
          <span class="badge ${r.success ? 'badge-success' : 'badge-red-outline'}">
            ${r.success ? 'PASS' : 'FAIL'}
          </span>
        </td>
        <td style="font-family: var(--font-mono); font-weight: 600;">${Math.round(r.duration_ms)} ms</td>
        <td style="font-size: 0.78rem;">${metricSummary}</td>
        <td>
          <button class="btn btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.7rem;" onclick="openResultMetricsById(${r.id})">JSON</button>
        </td>
      </tr>
    `;
  }).join('');
}

function openResultMetricsById(id) {
  const result = historyResultsCache.get(id);
  const metrics = result ? (result.metrics || {}) : {};
  const modal = document.getElementById('modal-metrics-viewer');
  const title = document.getElementById('modal-metrics-title');
  const jsonPre = document.getElementById('modal-metrics-json');

  if (modal && jsonPre) {
    if (title) title.innerText = `Raw Telemetry Metrics - ${result?.test_name || 'Test Result'} #${id}`;
    jsonPre.innerText = JSON.stringify(metrics, null, 2);
    modal.style.display = 'flex';
  } else {
    alert(`Test Result #${id} Metrics:\n\n${JSON.stringify(metrics, null, 2)}`);
  }
}

function closeMetricsModal() {
  const modal = document.getElementById('modal-metrics-viewer');
  if (modal) modal.style.display = 'none';
}

function selectAndFocusSensorHistory(sensorId) {
  const selectEl = document.getElementById('select-history-sensor');
  if (selectEl) {
    selectEl.value = sensorId;
    selectedSensorId = sensorId;
    loadSensorHistoryData(sensorId);
    const histSection = document.getElementById('sensor-historical-analytics');
    if (histSection) {
      histSection.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
