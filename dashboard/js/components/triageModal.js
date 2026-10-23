/**
 * Automated Triage & Root Cause Inspector Component
 */
let currentTriageData = null;

function renderTriageList(reports = [], onSelectCallback) {
  const listContainer = document.getElementById('triage-reports-list');
  if (!listContainer) return;

  if (reports.length === 0) {
    listContainer.innerHTML = `<div class="card-subtitle" style="padding: 1rem;">No triage sessions recorded yet.</div>`;
    return;
  }

  listContainer.innerHTML = reports.map((report, idx) => `
    <div class="triage-item-card ${idx === 0 ? 'active' : ''}" data-id="${report.id}">
      <div class="triage-item-stage">${report.failure_step || 'DIAGNOSTIC'}</div>
      <div style="font-size: 0.8rem; font-weight: 600; margin: 0.2rem 0;">${report.sensor_name || report.sensor_id}</div>
      <div class="triage-item-time">${new Date(report.timestamp).toLocaleTimeString()}</div>
    </div>
  `).join('');

  // Attach click events
  listContainer.querySelectorAll('.triage-item-card').forEach(card => {
    card.addEventListener('click', () => {
      listContainer.querySelectorAll('.triage-item-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const id = card.getAttribute('data-id');
      const selected = reports.find(r => r.id === id);
      if (selected && onSelectCallback) onSelectCallback(selected);
    });
  });

  // Select first by default
  if (reports.length > 0 && onSelectCallback) {
    onSelectCallback(reports[0]);
  }
}

function displayTriageDetails(report) {
  currentTriageData = report;

  const titleEl = document.getElementById('triage-viewer-title');
  const metaEl = document.getElementById('triage-viewer-meta');
  const rootCauseText = document.getElementById('triage-root-cause-text');
  const terminalOutput = document.getElementById('triage-terminal-output');
  const hopsContainer = document.getElementById('hops-timeline');

  if (titleEl) titleEl.innerText = `ROOT CAUSE: ${report.failure_step?.toUpperCase()} STAGE`;
  if (metaEl) metaEl.innerText = `Captured on ${report.sensor_name || report.sensor_id} at ${new Date(report.timestamp).toLocaleString()}`;
  if (rootCauseText) rootCauseText.innerText = report.root_cause_analysis || 'Diagnostic replay completed with no hard failures.';
  if (terminalOutput) terminalOutput.innerText = report.command_output || '$ _';

  // Render hops
  if (hopsContainer) {
    const hops = report.traceroute_hops || [];
    if (hops.length === 0) {
      hopsContainer.innerHTML = `<div class="card-subtitle">No traceroute hops captured for this session.</div>`;
    } else {
      hopsContainer.innerHTML = hops.map(h => `
        <div class="hop-row">
          <span class="hop-num">#${h.hop}</span>
          <span class="hop-ip">${h.ip}</span>
          <span class="hop-name">${h.name || 'unresolved'} (${h.asn || 'AS-LOCAL'})</span>
          <span class="hop-rtt">${h.rtt_ms} ms</span>
        </div>
      `).join('');
    }
  }
}

// Export triage as plain text
function setupTriageActions() {
  const exportBtn = document.getElementById('btn-export-triage');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!currentTriageData) return alert('No triage report selected');
      const text = `
=== PULSE UX AUTOMATED TRIAGE REPORT ===
Session ID: ${currentTriageData.id}
Sensor: ${currentTriageData.sensor_id}
Failure Step: ${currentTriageData.failure_step}
Timestamp: ${currentTriageData.timestamp}

ROOT CAUSE ANALYSIS:
${currentTriageData.root_cause_analysis}

COMMAND OUTPUT:
${currentTriageData.command_output}
      `.trim();

      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pulse_ux_triage_${currentTriageData.id}.txt`;
      a.click();
    });
  }

  const pcapBtn = document.getElementById('btn-download-pcap');
  if (pcapBtn) {
    pcapBtn.addEventListener('click', () => {
      if (!currentTriageData) return alert('No triage report selected');
      window.location.href = `/api/triage/${encodeURIComponent(currentTriageData.id)}/pcap`;
    });
  }
}
