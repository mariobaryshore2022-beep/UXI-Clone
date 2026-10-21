/**
 * HPE Aruba UXI "Simple View" - Authentic 4-Pillar Experience Dashboard
 * Pillars: Experience (Smiley Face), Services (Layers), Internal (Star), External (Cloud)
 */

let simpleViewInitialized = false;

function initSimpleView() {
  if (simpleViewInitialized) {
    refreshSimpleView();
    return;
  }
  simpleViewInitialized = true;
  refreshSimpleView();
}

async function refreshSimpleView() {
  try {
    const [overview, tests, incidents, issues, sensors] = await Promise.all([
      API.getOverview(),
      API.getTests(),
      API.getIncidents(),
      API.getIssues(),
      API.getSensors()
    ]);

    renderSimpleViewData({
      overview,
      tests: tests || [],
      incidents: incidents || [],
      issues: issues || [],
      sensors: sensors || []
    });
  } catch (err) {
    console.error('Failed to refresh Simple View:', err);
  }
}

function renderSimpleViewData(data) {
  const { overview, tests, incidents, issues, sensors } = data;
  const activeIncidents = incidents.filter(i => i.status === 'open');
  const activeIssues = issues.filter(i => i.status === 'active');

  const hasDhcpFailure = activeIncidents.some(i => i.title?.toLowerCase().includes('dhcp') || i.description?.toLowerCase().includes('dhcp')) ||
                         activeIssues.some(i => i.metric_name === 'dhcp_lease_time_ms');
  const hasVoipIssue = activeIssues.some(i => i.metric_name === 'mos' || i.test_id === 'test-voip-teams') ||
                       activeIncidents.some(i => i.title?.toLowerCase().includes('voip'));
  const hasGeneralIncident = activeIncidents.length > 0;
  const hasGeneralIssue = activeIssues.length > 0;

  // Determine Pillar States
  const hasDegradation = hasGeneralIncident || hasGeneralIssue || hasDhcpFailure || hasVoipIssue;
  
  let experienceState = hasDegradation ? 'bad' : 'good';
  let servicesState = hasDhcpFailure ? 'bad' : 'good';
  let internalState = (hasDhcpFailure || hasGeneralIncident) ? 'bad' : 'good';
  let externalState = hasVoipIssue ? 'bad' : 'good';

  // 1. Render Experience Pillar
  renderExperiencePillar(experienceState, overview, activeIncidents, activeIssues);

  // 2. Render Services Pillar
  renderServicesPillar(servicesState, hasDhcpFailure);

  // 3. Render Internal Pillar
  renderInternalPillar(internalState, tests, hasDhcpFailure);

  // 4. Render External Pillar
  renderExternalPillar(externalState, tests, hasVoipIssue);

  // 5. Update Notification Bell Badge in Header
  const badgeCount = activeIncidents.length + activeIssues.length;
  const bellBadge = document.getElementById('simple-bell-badge');
  if (bellBadge) {
    bellBadge.innerText = badgeCount;
    bellBadge.style.display = badgeCount > 0 ? 'inline-flex' : 'none';
  }

  // 6. Update Simple Footer
  const footerMeta = document.getElementById('simple-footer-fleet-meta');
  if (footerMeta) {
    const sensorCount = sensors.length || 1;
    const sensorName = sensors[0]?.name || 'Kali-Linux-Sensor';
    footerMeta.innerText = `Aruba SEEL • ${sensorCount} Sensor (${sensorName})`;
  }
}

// 1. Experience Pillar (The Iconic UXI Smiley / Sad Face)
function renderExperiencePillar(state, overview, incidents, issues) {
  const circle = document.getElementById('simple-circle-experience');
  const svg = document.getElementById('simple-face-svg');
  const list = document.getElementById('simple-list-experience');
  if (!circle || !svg || !list) return;

  circle.className = `pillar-avatar-circle circle-${state}`;

  if (state === 'bad') {
    // Sad Face (Matching Screenshot 1:1)
    svg.innerHTML = `
      <circle cx="36" cy="38" r="4.5" fill="#ffffff" />
      <circle cx="64" cy="38" r="4.5" fill="#ffffff" />
      <path d="M 32 66 Q 50 48 68 66" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" />
    `;

    list.innerHTML = `
      ${renderPillItem('Central-SEEL-DEMO', 'red', 'wifi')}
      ${renderPillItem('Competitive TME T...', 'red', 'bolt')}
      ${renderPillItem('Eric Lebel', 'red', 'bolt')}
      ${renderPillItem('Winnersh', 'red', 'bolt')}
      ${renderPillItem('Aruba RLA', 'green')}
    `;
  } else {
    // Happy Smiling Face
    svg.innerHTML = `
      <circle cx="36" cy="38" r="4.5" fill="#ffffff" />
      <circle cx="64" cy="38" r="4.5" fill="#ffffff" />
      <path d="M 32 54 Q 50 74 68 54" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" />
    `;

    list.innerHTML = `
      ${renderPillItem('Central-SEEL-DEMO', 'green', 'wifi')}
      ${renderPillItem('Competitive TME T...', 'green', 'bolt')}
      ${renderPillItem('Eric Lebel', 'green', 'bolt')}
      ${renderPillItem('Winnersh', 'green', 'bolt')}
      ${renderPillItem('Aruba RLA', 'green')}
    `;
  }
}

// 2. Services Pillar
function renderServicesPillar(state, hasDhcpFailure) {
  const circle = document.getElementById('simple-circle-services');
  const list = document.getElementById('simple-list-services');
  if (!circle || !list) return;

  circle.className = `pillar-avatar-circle circle-${state}`;

  list.innerHTML = `
    ${renderPillItem('Wi-Fi', 'red', 'wifi')}
    ${renderPillItem('Ethernet', 'green')}
    ${renderPillItem('DHCP', hasDhcpFailure ? 'red' : 'green')}
    ${renderPillItem('Gateway', hasDhcpFailure ? 'red' : 'green', hasDhcpFailure ? 'wifi' : '')}
    ${renderPillItem('DNS', 'green')}
  `;
}

// 3. Internal Pillar
function renderInternalPillar(state, tests, hasDhcpFailure) {
  const circle = document.getElementById('simple-circle-internal');
  const list = document.getElementById('simple-list-internal');
  if (!circle || !list) return;

  circle.className = `pillar-avatar-circle circle-${state}`;

  const isBad = state === 'bad';
  list.innerHTML = `
    ${renderPillItem('CRM Solution', isBad ? 'red' : 'green', isBad ? 'wifi' : '')}
    ${renderPillItem('File Server', isBad ? 'red' : 'green', isBad ? 'wifi' : '')}
    ${renderPillItem('AirWave 10', 'green')}
    ${renderPillItem('CPPM-Central-SEE...', 'green')}
    ${renderPillItem('ESXi Server', 'green')}
    ${renderPillItem('Lab Webserver', 'green')}
    ${renderPillItem('iPerf2-FACS', 'green')}
    ${renderPillItem('Airwave', 'gray')}
    ${renderPillItem('Clearpass', 'gray')}
    ${renderPillItem('EricLebel-Camera', 'gray')}
  `;
}

// 4. External Pillar
function renderExternalPillar(state, tests, hasVoipIssue) {
  const circle = document.getElementById('simple-circle-external');
  const list = document.getElementById('simple-list-external');
  if (!circle || !list) return;

  circle.className = `pillar-avatar-circle circle-${state}`;

  list.innerHTML = `
    ${renderPillItem('CNN', 'green')}
    ${renderPillItem('Dropbox', 'green')}
    ${renderPillItem('Facebook', 'green')}
    ${renderPillItem('Github', 'green')}
    ${renderPillItem('Google Drive', 'green')}
    ${renderPillItem('Google Mail', 'green')}
    ${renderPillItem('Hootsuite', 'green')}
    ${renderPillItem('LinkedIn', 'green')}
    ${renderPillItem('Netflix (Fast.com)', 'green')}
    ${renderPillItem('Office365', 'gray')}
  `;
}

// Helper to generate the exact pill item markup from Aruba UXI
function renderPillItem(name, status, iconType = '') {
  let iconHtml = '';
  if (iconType === 'wifi') {
    iconHtml = `
      <svg class="item-micro-icon text-red" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
      </svg>
    `;
  } else if (iconType === 'bolt') {
    iconHtml = `
      <svg class="item-micro-icon text-red" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    `;
  }

  return `
    <div class="simple-pillar-item" title="${name} (${status.toUpperCase()})">
      <div class="item-pill-bar pill-${status}"></div>
      <span class="item-name">${name}</span>
      ${iconHtml}
    </div>
  `;
}
