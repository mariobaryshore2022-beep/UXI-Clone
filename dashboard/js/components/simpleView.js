/**
 * Pulse UX "Simple View" - Authentic 4-Pillar Experience Dashboard
 * Pillars: Experience (Smiley Face), Services (Layers), Internal (Star), External (Cloud)
 * Fully configurable via database & in-dashboard modal
 */

let simpleViewInitialized = false;
let currentConfigPillar = 'experience';
let cachedSimpleItems = [];

function initSimpleView() {
  if (simpleViewInitialized) {
    refreshSimpleView();
    return;
  }
  simpleViewInitialized = true;

  // Initialize modal event listeners
  initSimpleConfigModalEvents();

  refreshSimpleView();
}

async function refreshSimpleView() {
  try {
    const [overview, tests, incidents, issues, sensors, itemsData] = await Promise.all([
      API.getOverview(),
      API.getTests(),
      API.getIncidents(),
      API.getIssues(),
      API.getSensors(),
      API.getSimpleViewItems().catch(() => ({ items: [], pillars: {} }))
    ]);

    cachedSimpleItems = itemsData.items || [];

    renderSimpleViewData({
      overview,
      tests: tests || [],
      incidents: incidents || [],
      issues: issues || [],
      sensors: sensors || [],
      pillars: itemsData.pillars || {}
    });

    // If config modal is open, refresh its list
    const modal = document.getElementById('modal-simple-config');
    if (modal && modal.style.display !== 'none') {
      renderConfigModalList(currentConfigPillar);
    }
  } catch (err) {
    console.error('Failed to refresh Simple View:', err);
  }
}

function renderSimpleViewData(data) {
  const { overview, tests, incidents, issues, sensors, pillars } = data;
  const activeIncidents = incidents.filter(i => i.status === 'open');
  const activeIssues = issues.filter(i => i.status === 'active');

  const hasDhcpFailure = activeIncidents.some(i => i.title?.toLowerCase().includes('dhcp') || i.description?.toLowerCase().includes('dhcp')) ||
                         activeIssues.some(i => i.metric_name === 'dhcp_lease_time_ms');
  const hasVoipIssue = activeIssues.some(i => i.metric_name === 'mos' || i.test_id === 'test-voip-teams') ||
                       activeIncidents.some(i => i.title?.toLowerCase().includes('voip'));
  const hasGeneralIncident = activeIncidents.length > 0;
  const hasGeneralIssue = activeIssues.length > 0;

  // Retrieve configured items per pillar (fallback to defaults if empty)
  const expItems = pillars.experience || [];
  const srvItems = pillars.services || [];
  const intItems = pillars.internal || [];
  const extItems = pillars.external || [];

  // Determine item health dynamically based on active issues
  const evalItemStatus = (item) => {
    if (!item.is_enabled) return { status: 'gray', icon: '' };
    
    // Check if item correlates with any active incident or issue
    const nameLower = (item.name || '').toLowerCase();
    const targetLower = (item.target || '').toLowerCase();

    if (hasDhcpFailure && (nameLower.includes('dhcp') || nameLower.includes('gateway') || nameLower.includes('wi-fi') || targetLower.includes('dora'))) {
      return { status: 'red', icon: nameLower.includes('wi-fi') ? 'wifi' : 'bolt' };
    }
    if (hasVoipIssue && (nameLower.includes('voip') || nameLower.includes('teams') || targetLower.includes('teams'))) {
      return { status: 'red', icon: 'bolt' };
    }
    if (activeIncidents.some(inc => inc.title?.toLowerCase().includes(nameLower) || inc.description?.toLowerCase().includes(nameLower))) {
      return { status: 'red', icon: 'wifi' };
    }

    return { status: item.status || 'green', icon: item.icon_type || '' };
  };

  // Evaluate Pillar States
  const evaluatedExp = expItems.map(it => ({ ...it, ...evalItemStatus(it) }));
  const evaluatedSrv = srvItems.map(it => ({ ...it, ...evalItemStatus(it) }));
  const evaluatedInt = intItems.map(it => ({ ...it, ...evalItemStatus(it) }));
  const evaluatedExt = extItems.map(it => ({ ...it, ...evalItemStatus(it) }));

  const hasDegradedExp = evaluatedExp.some(it => it.status === 'red') || hasGeneralIncident || hasGeneralIssue;
  const hasDegradedSrv = evaluatedSrv.some(it => it.status === 'red') || hasDhcpFailure;
  const hasDegradedInt = evaluatedInt.some(it => it.status === 'red');
  const hasDegradedExt = evaluatedExt.some(it => it.status === 'red');

  // 1. Render Experience Pillar
  renderExperiencePillar(hasDegradedExp ? 'bad' : 'good', evaluatedExp);

  // 2. Render Services Pillar
  renderServicesPillar(hasDegradedSrv ? 'bad' : 'good', evaluatedSrv);

  // 3. Render Internal Pillar
  renderInternalPillar(hasDegradedInt ? 'bad' : 'good', evaluatedInt);

  // 4. Render External Pillar
  renderExternalPillar(hasDegradedExt ? 'bad' : 'good', evaluatedExt);

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
    const sensorName = sensors[0]?.name || 'sensor-kali-arm64';
    footerMeta.innerText = `Pulse UX Fleet • ${sensorCount} Sensor (${sensorName}) • Bayshore HealthCare`;
  }
}

// 1. Experience Pillar (The Iconic Pulse UX Smiley / Sad Face)
function renderExperiencePillar(state, items = []) {
  const circle = document.getElementById('simple-circle-experience');
  const svg = document.getElementById('simple-face-svg');
  const list = document.getElementById('simple-list-experience');
  if (!circle || !svg || !list) return;

  circle.className = `pillar-avatar-circle circle-${state}`;

  if (state === 'bad') {
    // Sad Face (Degraded Experience)
    svg.innerHTML = `
      <circle cx="36" cy="38" r="4.5" fill="#ffffff" />
      <circle cx="64" cy="38" r="4.5" fill="#ffffff" />
      <path d="M 32 66 Q 50 48 68 66" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" />
    `;
  } else {
    // Happy Smiling Face (Healthy Experience)
    svg.innerHTML = `
      <circle cx="36" cy="38" r="4.5" fill="#ffffff" />
      <circle cx="64" cy="38" r="4.5" fill="#ffffff" />
      <path d="M 32 54 Q 50 74 68 54" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" />
    `;
  }

  if (items.length === 0) {
    list.innerHTML = `<div class="empty-pillar-text">No networks configured</div>`;
    return;
  }

  list.innerHTML = items.map(item => renderPillItem(item.name, item.status, item.icon)).join('');
}

// 2. Services Pillar
function renderServicesPillar(state, items = []) {
  const circle = document.getElementById('simple-circle-services');
  const list = document.getElementById('simple-list-services');
  if (!circle || !list) return;

  circle.className = `pillar-avatar-circle circle-${state}`;

  if (items.length === 0) {
    list.innerHTML = `<div class="empty-pillar-text">No services configured</div>`;
    return;
  }

  list.innerHTML = items.map(item => renderPillItem(item.name, item.status, item.icon)).join('');
}

// 3. Internal Pillar
function renderInternalPillar(state, items = []) {
  const circle = document.getElementById('simple-circle-internal');
  const list = document.getElementById('simple-list-internal');
  if (!circle || !list) return;

  circle.className = `pillar-avatar-circle circle-${state}`;

  if (items.length === 0) {
    list.innerHTML = `<div class="empty-pillar-text">No internal apps configured</div>`;
    return;
  }

  list.innerHTML = items.map(item => renderPillItem(item.name, item.status, item.icon)).join('');
}

// 4. External Pillar
function renderExternalPillar(state, items = []) {
  const circle = document.getElementById('simple-circle-external');
  const list = document.getElementById('simple-list-external');
  if (!circle || !list) return;

  circle.className = `pillar-avatar-circle circle-${state}`;

  if (items.length === 0) {
    list.innerHTML = `<div class="empty-pillar-text">No cloud apps configured</div>`;
    return;
  }

  list.innerHTML = items.map(item => renderPillItem(item.name, item.status, item.icon)).join('');
}

// Helper to generate the exact pill item markup for Pulse UX
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

// ============================================================================
// Interactive Simple View Configuration Modal Logic
// ============================================================================

function openSimpleConfigModal() {
  const modal = document.getElementById('modal-simple-config');
  if (!modal) return;
  modal.style.display = 'flex';
  renderConfigModalList(currentConfigPillar);
}

function closeSimpleConfigModal() {
  const modal = document.getElementById('modal-simple-config');
  if (modal) modal.style.display = 'none';
  refreshSimpleView();
}

function initSimpleConfigModalEvents() {
  // Tab switching inside modal
  const tabBtns = document.querySelectorAll('.config-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const pillar = btn.getAttribute('data-pillar');
      currentConfigPillar = pillar;
      renderConfigModalList(pillar);
    });
  });

  // Add Item Form Submit
  const form = document.getElementById('form-add-simple-item');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('config-input-name').value.trim();
      const target = document.getElementById('config-input-target').value.trim();
      const test_type = document.getElementById('config-input-type').value;
      const status = document.getElementById('config-input-status').value;

      if (!name) return;

      const submitBtn = document.getElementById('btn-submit-item');
      if (submitBtn) submitBtn.disabled = true;

      try {
        await API.createSimpleViewItem({
          pillar: currentConfigPillar,
          name,
          target,
          test_type,
          status,
          icon_type: test_type === 'network' ? 'wifi' : '',
          is_enabled: true
        });

        // Clear input fields
        document.getElementById('config-input-name').value = '';
        document.getElementById('config-input-target').value = '';
        
        await refreshSimpleView();
      } catch (err) {
        alert('Failed to add item: ' + err.message);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
}

function renderConfigModalList(pillar) {
  const tbody = document.getElementById('config-items-tbody');
  const formTitle = document.getElementById('config-form-title');
  const pillarInput = document.getElementById('config-input-pillar');
  if (!tbody) return;

  const pillarTitles = {
    experience: 'Experience (Monitored Networks & Sites)',
    services: 'Core Services (Wi-Fi, DHCP, DNS, Gateway)',
    internal: 'Internal Applications (Intranet & EHR)',
    external: 'External Cloud Services & SaaS'
  };

  if (formTitle) formTitle.innerText = `Add Item to ${pillarTitles[pillar] || pillar}`;
  if (pillarInput) pillarInput.value = pillar;

  const items = cachedSimpleItems.filter(it => it.pillar === pillar);

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: #64748b; padding: 2rem;">
          No items configured in this pillar yet. Use the form above to add one.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map(item => `
    <tr>
      <td>
        <div style="display: flex; align-items: center; gap: 6px;">
          <div class="item-pill-bar pill-${item.status || 'green'}" style="height: 14px; width: 32px; border-radius: 3px;"></div>
          <span style="font-size: 0.7rem; font-family: var(--font-mono); color: #94a3b8;">${item.status}</span>
        </div>
      </td>
      <td><strong>${item.name}</strong></td>
      <td style="font-family: var(--font-mono); font-size: 0.75rem; color: #38bdf8;">${item.target || '--'}</td>
      <td><span class="badge badge-cyan-outline" style="font-size: 0.65rem;">${item.test_type || 'service'}</span></td>
      <td>
        <span style="color: ${item.is_enabled ? 'var(--pulse-emerald)' : 'var(--text-muted)'}; font-weight: 600;">
          ${item.is_enabled ? 'Active' : 'Disabled'}
        </span>
      </td>
      <td style="text-align: right;">
        <button class="btn-action-toggle" onclick="toggleSimpleItemStatus('${item.id}', '${item.status === 'green' ? 'red' : 'green'}')">
          ${item.status === 'green' ? 'Set Red' : 'Set Green'}
        </button>
        <button class="btn-action-del" onclick="deleteSimpleItem('${item.id}')" title="Delete item">
          Delete
        </button>
      </td>
    </tr>
  `).join('');
}

async function toggleSimpleItemStatus(id, newStatus) {
  try {
    await API.updateSimpleViewItem(id, { status: newStatus });
    await refreshSimpleView();
  } catch (err) {
    alert('Failed to update status: ' + err.message);
  }
}

async function deleteSimpleItem(id) {
  if (!confirm('Remove this item from the Simple View pillar?')) return;
  try {
    await API.deleteSimpleViewItem(id);
    await refreshSimpleView();
  } catch (err) {
    alert('Failed to delete item: ' + err.message);
  }
}

async function resetSimpleViewDefaults() {
  if (!confirm('Reset all 4 pillars to default clean Bayshore HealthCare items?')) return;
  try {
    await API.resetSimpleViewItems();
    await refreshSimpleView();
  } catch (err) {
    alert('Failed to reset: ' + err.message);
  }
}

// Expose globals for onclick handlers
window.openSimpleConfigModal = openSimpleConfigModal;
window.closeSimpleConfigModal = closeSimpleConfigModal;
window.toggleSimpleItemStatus = toggleSimpleItemStatus;
window.deleteSimpleItem = deleteSimpleItem;
window.resetSimpleViewDefaults = resetSimpleViewDefaults;
