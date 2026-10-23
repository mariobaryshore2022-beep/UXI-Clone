/**
 * Pulse UX "Simple View" - Authentic 4-Pillar Experience Dashboard
 * Pillars: Experience (Smiley Face), Services (Layers), Internal (Star), External (Cloud)
 * Fully configurable via database & in-dashboard modal
 */

let simpleViewInitialized = false;
let currentConfigPillar = 'experience';
let cachedSimpleItems = [];
let cachedGroups = [];
let cachedSensors = [];
let selectedGroupId = 'all';

function initSimpleView() {
  if (simpleViewInitialized) {
    refreshSimpleView();
    return;
  }
  simpleViewInitialized = true;

  // Initialize modal event listeners
  initSimpleConfigModalEvents();

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('groups-filter-wrapper');
    const menu = document.getElementById('groups-dropdown-menu');
    if (wrapper && menu && !wrapper.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  refreshSimpleView();
}

async function refreshSimpleView() {
  try {
    const [overview, tests, incidents, issues, sensors, itemsData, groupsData] = await Promise.all([
      API.getOverview(),
      API.getTests(),
      API.getIncidents(),
      API.getIssues(),
      API.getSensors(),
      API.getSimpleViewItems().catch(() => ({ items: [], pillars: {} })),
      API.getGroups().catch(() => ({ groups: [] }))
    ]);

    cachedSimpleItems = itemsData.items || [];
    cachedGroups = groupsData.groups || [];
    cachedSensors = sensors || [];

    renderGroupsDropdown();

    renderSimpleViewData({
      overview,
      tests: tests || [],
      incidents: incidents || [],
      issues: issues || [],
      sensors: sensors || [],
      pillars: itemsData.pillars || {},
      groups: cachedGroups
    });

    // If config modal is open, refresh its list
    const modal = document.getElementById('modal-simple-config');
    if (modal && modal.style.display !== 'none') {
      renderConfigModalList(currentConfigPillar);
    }

    // If groups modal is open, refresh its list
    const grpModal = document.getElementById('modal-sensor-groups');
    if (grpModal && grpModal.style.display !== 'none') {
      renderSensorGroupsList();
    }
  } catch (err) {
    console.error('Failed to refresh Simple View:', err);
  }
}

function renderGroupsDropdown() {
  const menu = document.getElementById('groups-dropdown-menu');
  const label = document.getElementById('selected-group-label');
  if (!menu) return;

  const totalSensors = cachedSensors.length || 2;
  const isAllActive = selectedGroupId === 'all';

  if (label) {
    if (selectedGroupId === 'all') {
      label.innerText = 'All Groups';
    } else {
      const activeGrp = cachedGroups.find(g => g.id === selectedGroupId);
      label.innerText = activeGrp ? activeGrp.name : 'All Groups';
    }
  }

  let html = `
    <div class="group-dropdown-item ${isAllActive ? 'active' : ''}" onclick="selectGroupFilter('all')">
      <div class="group-dropdown-left">
        <span style="font-weight: 600;">All Groups</span>
      </div>
      <span class="group-dropdown-count">${totalSensors}</span>
    </div>
    <div class="group-dropdown-divider"></div>
  `;

  html += cachedGroups.map(grp => {
    const isActive = selectedGroupId === grp.id;
    const pillClass = (grp.is_split_status || grp.status === 'split-red-blue') ? 'pill-split-red-blue' : `pill-${grp.color || grp.status || 'blue'}`;
    const sCount = grp.sensor_count ?? (grp.sensors ? grp.sensors.length : 0);
    return `
      <div class="group-dropdown-item ${isActive ? 'active' : ''}" onclick="selectGroupFilter('${grp.id}')">
        <div class="group-dropdown-left">
          <div class="item-pill-bar ${pillClass}" style="width: 14px; height: 5px;"></div>
          <span>${grp.name}</span>
        </div>
        <span class="group-dropdown-count">${sCount}</span>
      </div>
    `;
  }).join('');

  html += `
    <div class="group-dropdown-divider"></div>
    <div class="group-dropdown-item group-dropdown-action" onclick="toggleGroupsDropdown(); openSensorGroupsModal();">
      <span>➕ Define Sensor Groups...</span>
    </div>
  `;

  menu.innerHTML = html;
}

function toggleGroupsDropdown() {
  const menu = document.getElementById('groups-dropdown-menu');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : 'block';
}

function selectGroupFilter(groupId) {
  selectedGroupId = groupId;
  renderGroupsDropdown();
  const menu = document.getElementById('groups-dropdown-menu');
  if (menu) menu.style.display = 'none';
  refreshSimpleView();
}

function renderSimpleViewData(data) {
  const { overview, tests, incidents, issues, sensors, pillars, groups } = data;
  const activeIncidents = incidents.filter(i => i.status === 'open');
  const activeIssues = issues.filter(i => i.status === 'active');

  const hasDhcpFailure = activeIncidents.some(i => i.title?.toLowerCase().includes('dhcp') || i.description?.toLowerCase().includes('dhcp')) ||
                         activeIssues.some(i => i.metric_name === 'dhcp_lease_time_ms');
  const hasVoipIssue = activeIssues.some(i => i.metric_name === 'mos' || i.test_id === 'test-voip-teams') ||
                       activeIncidents.some(i => i.title?.toLowerCase().includes('voip'));
  const hasGeneralIncident = activeIncidents.length > 0;
  const hasGeneralIssue = activeIssues.length > 0;

  // Sensor Groups drive Experience Pillar
  const sensorGroups = (groups && groups.length > 0) ? groups : cachedGroups;

  // Populate groups map for hover resolution
  window.__groupsMap = {};
  sensorGroups.forEach(g => {
    window.__groupsMap[g.id] = g;
    window.__groupsMap[g.name.toLowerCase()] = g;
  });

  // Retrieve configured items per pillar (fallback to defaults if empty)
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
  const evaluatedSrv = srvItems.map(it => ({ ...it, ...evalItemStatus(it) }));
  const evaluatedInt = intItems.map(it => ({ ...it, ...evalItemStatus(it) }));
  const evaluatedExt = extItems.map(it => ({ ...it, ...evalItemStatus(it) }));

  // Experience state: any split or red group causes the degraded avatar face
  const hasDegradedGroup = sensorGroups.some(g => g.is_split_status || g.status === 'split-red-blue' || g.status === 'red');
  const hasDegradedExp = hasDegradedGroup || hasGeneralIncident || hasGeneralIssue;
  const hasDegradedSrv = evaluatedSrv.some(it => it.status === 'red') || hasDhcpFailure;
  const hasDegradedInt = evaluatedInt.some(it => it.status === 'red');
  const hasDegradedExt = evaluatedExt.some(it => it.status === 'red');

  // 1. Render Experience Pillar based on Groups
  renderExperiencePillar(hasDegradedExp ? 'bad' : 'good', sensorGroups);

  // 2. Render Services Pillar
  renderServicesPillar(hasDegradedSrv ? 'bad' : 'good', evaluatedSrv);

  // 3. Render Internal Pillar
  renderInternalPillar(hasDegradedInt ? 'bad' : 'good', evaluatedInt);

  // 4. Render External Pillar
  renderExternalPillar(hasDegradedExt ? 'bad' : 'good', evaluatedExt);

  // 5. Bind Interactive Hover Details for All Items Across 4 Pillars (including Sensor Groups)
  const allEvaluatedItems = [
    ...sensorGroups.map(g => ({ ...g, pillar: 'experience' })),
    ...evaluatedSrv,
    ...evaluatedInt,
    ...evaluatedExt
  ];
  bindSimpleItemHoverEvents(allEvaluatedItems, data);

  // 6. Update Notification Bell Badge in Header
  const badgeCount = activeIncidents.length + activeIssues.length;
  const bellBadge = document.getElementById('simple-bell-badge');
  if (bellBadge) {
    bellBadge.innerText = badgeCount;
    bellBadge.style.display = badgeCount > 0 ? 'inline-flex' : 'none';
  }

  // 7. Update Simple Footer
  const footerMeta = document.getElementById('simple-footer-fleet-meta');
  if (footerMeta) {
    const sensorCount = sensors.length || 1;
    const sensorName = sensors[0]?.name || 'sensor-kali-arm64';
    footerMeta.innerText = `Pulse UX Fleet • ${sensorCount} Sensor (${sensorName}) • Bayshore HealthCare`;
  }
}

// 1. Experience Pillar (The Iconic Pulse UX Smiley / Sad Face - Sensor Groups)
function renderExperiencePillar(state, groups = []) {
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

  const displayGroups = (groups && groups.length > 0) ? groups : cachedGroups;

  if (!displayGroups || displayGroups.length === 0) {
    list.innerHTML = `<div class="empty-pillar-text">No sensor groups defined</div>`;
    return;
  }

  list.innerHTML = displayGroups.map(item => {
    const isFiltered = selectedGroupId !== 'all' && selectedGroupId !== item.id;
    const filterStyle = isFiltered ? 'opacity: 0.35;' : '';
    let rendered = renderPillItem(item, 'experience');
    if (filterStyle) {
      rendered = rendered.replace('class="simple-pillar-item"', `class="simple-pillar-item" style="${filterStyle}"`);
    }
    return rendered;
  }).join('');
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

  list.innerHTML = items.map(item => renderPillItem(item, 'services')).join('');
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

  list.innerHTML = items.map(item => renderPillItem(item, 'internal')).join('');
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

  list.innerHTML = items.map(item => renderPillItem(item, 'external')).join('');
}

// Helper to generate the exact pill/dot item markup matching authentic Aruba UXI
function renderPillItem(item, pillar) {
  const name = item.name || '';
  const status = item.status || 'green';
  const iconType = item.icon || item.icon_type || '';
  const id = item.id;

  let indicatorHtml = '';
  if (pillar === 'experience') {
    // Sensor Groups use pill bars with solid or split styling matching Aruba UXI screenshot
    const isSplit = item.is_split_status || item.status === 'split-red-blue' || item.color === 'split-red-blue';
    const pillClass = isSplit ? 'pill-split-red-blue' : `pill-${item.color || item.status || 'blue'}`;
    indicatorHtml = `<div class="item-pill-bar ${pillClass}"></div>`;
  } else {
    // Pill bar for Services, Internal, and External apps
    indicatorHtml = `<div class="item-pill-bar pill-${status}"></div>`;
  }

  let iconHtml = '';
  if (iconType === 'wifi') {
    iconHtml = `
      <svg class="item-micro-icon text-red" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
      </svg>
    `;
  } else if (iconType === 'laptop') {
    iconHtml = `
      <svg class="item-micro-icon text-muted" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
        <line x1="2" y1="20" x2="22" y2="20"/>
      </svg>
    `;
  } else if (iconType === 'bolt') {
    iconHtml = `
      <svg class="item-micro-icon text-red" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    `;
  } else if (iconType === 'bell') {
    iconHtml = `
      <svg class="item-micro-icon text-red" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    `;
  }

  return `
    <div class="simple-pillar-item" data-item-id="${id}" data-pillar="${pillar}">
      ${indicatorHtml}
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

async function loadArubaPresetItems() {
  if (!confirm('Load the authentic Aruba UXI demo items (Scarif, Mobile PoS, Microsoft 365, etc.)?')) return;
  try {
    await API.setSimpleViewPreset('aruba');
    await refreshSimpleView();
    closeSimpleConfigModal();
  } catch (err) {
    alert('Failed to load demo preset: ' + err.message);
  }
}

// ============================================================================
// Interactive Hover Details Card Logic (Authentic Aruba UXI Fidelity)
// ============================================================================

let hoverTimeout = null;
let currentHoveredItemEl = null;
let pillarHoverTimeout = null;
let currentHoveredCircleEl = null;

function bindSimpleItemHoverEvents(evaluatedItems, currentData) {
  // Store globally so delegated listener can look up items at any time
  if (!window.__evaluatedItemsMap) window.__evaluatedItemsMap = {};
  evaluatedItems.forEach(it => {
    if (it && it.id) window.__evaluatedItemsMap[it.id] = it;
    if (it && it.name) window.__evaluatedItemsMap[it.name.toLowerCase().trim()] = it;
  });
  window.__lastSimpleData = currentData;

  setupGlobalSimpleViewHoverListeners();
}

function setupGlobalSimpleViewHoverListeners() {
  if (window.__simpleViewHoverSetup) return;
  window.__simpleViewHoverSetup = true;

  const hovercard = document.getElementById('simple-item-hovercard');
  const pillarSummaryCard = document.getElementById('pillar-summary-card');

  // Keep item hovercard open when pointer moves inside the card
  if (hovercard) {
    hovercard.addEventListener('mouseenter', () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
    });
    hovercard.addEventListener('mouseleave', () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        hideHoverCard();
      }, 150);
    });
  }

  // Keep pillar summary card open when pointer moves inside the card
  if (pillarSummaryCard) {
    pillarSummaryCard.addEventListener('mouseenter', () => {
      if (pillarHoverTimeout) {
        clearTimeout(pillarHoverTimeout);
        pillarHoverTimeout = null;
      }
    });
    pillarSummaryCard.addEventListener('mouseleave', () => {
      if (pillarHoverTimeout) clearTimeout(pillarHoverTimeout);
      pillarHoverTimeout = setTimeout(() => {
        hidePillarSummaryCard();
      }, 160);
    });
  }

  // 1. Mouseover Event Delegation (captures hover across pillar items and avatar circles)
  document.addEventListener('mouseover', (e) => {
    const itemEl = e.target.closest('.simple-pillar-item');
    const circleEl = e.target.closest('.pillar-avatar-circle');
    const card = document.getElementById('simple-item-hovercard');
    const pCard = document.getElementById('pillar-summary-card');

    if (card && (card === e.target || card.contains(e.target))) {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
      return;
    }

    if (pCard && (pCard === e.target || pCard.contains(e.target))) {
      if (pillarHoverTimeout) {
        clearTimeout(pillarHoverTimeout);
        pillarHoverTimeout = null;
      }
      return;
    }

    // A. Circle Avatar Hover (Pillar Summary Card)
    if (circleEl) {
      if (pillarHoverTimeout) {
        clearTimeout(pillarHoverTimeout);
        pillarHoverTimeout = null;
      }
      hideHoverCard();
      if (currentHoveredCircleEl === circleEl && pCard && pCard.classList.contains('visible')) {
        return;
      }
      currentHoveredCircleEl = circleEl;
      const pillar = circleEl.getAttribute('data-pillar') || 'experience';
      showPillarSummaryCard(circleEl, pillar, window.__lastSimpleData || {});
      return;
    }

    // B. Individual Monitored Item Hover (Item Metric Card)
    if (itemEl) {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
      hidePillarSummaryCard();
      if (currentHoveredItemEl === itemEl && card && card.classList.contains('visible')) {
        return;
      }
      currentHoveredItemEl = itemEl;

      document.querySelectorAll('.simple-pillar-item').forEach(i => i.classList.remove('active-hovered'));
      itemEl.classList.add('active-hovered');

      const item = resolveHoverItem(itemEl);
      showItemHoverCard(itemEl, item, window.__lastSimpleData || {});
    }
  });

  // 2. Mouseout Event Delegation
  document.addEventListener('mouseout', (e) => {
    const fromItem = e.target.closest('.simple-pillar-item');
    const toItem = e.relatedTarget ? e.relatedTarget.closest('.simple-pillar-item') : null;
    const card = document.getElementById('simple-item-hovercard');
    const isToCard = card && e.relatedTarget && (card === e.relatedTarget || card.contains(e.relatedTarget));

    if (fromItem && fromItem !== toItem && !isToCard) {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        hideHoverCard();
      }, 150);
    }

    const fromCircle = e.target.closest('.pillar-avatar-circle');
    const toCircle = e.relatedTarget ? e.relatedTarget.closest('.pillar-avatar-circle') : null;
    const pCard = document.getElementById('pillar-summary-card');
    const isToPCard = pCard && e.relatedTarget && (pCard === e.relatedTarget || pCard.contains(e.relatedTarget));

    if (fromCircle && fromCircle !== toCircle && !isToPCard) {
      if (pillarHoverTimeout) clearTimeout(pillarHoverTimeout);
      pillarHoverTimeout = setTimeout(() => {
        hidePillarSummaryCard();
      }, 160);
    }
  });

  // 3. Click support: clicking circle switches tab; clicking item toggles or locks hovercard
  document.addEventListener('click', (e) => {
    const circleEl = e.target.closest('.pillar-avatar-circle');
    const itemEl = e.target.closest('.simple-pillar-item');
    const card = document.getElementById('simple-item-hovercard');
    const pCard = document.getElementById('pillar-summary-card');

    if (circleEl) {
      e.stopPropagation();
      const pillar = circleEl.getAttribute('data-pillar') || 'experience';
      hidePillarSummaryCard();
      const tabMap = {
        experience: 'tab-sensors',
        services: 'tab-triage',
        internal: 'tab-config',
        external: 'tab-config'
      };
      if (window.activateTab && tabMap[pillar]) {
        window.activateTab(tabMap[pillar]);
      }
      return;
    }

    if (itemEl) {
      e.stopPropagation();
      hidePillarSummaryCard();
      currentHoveredItemEl = itemEl;
      document.querySelectorAll('.simple-pillar-item').forEach(i => i.classList.remove('active-hovered'));
      itemEl.classList.add('active-hovered');

      const item = resolveHoverItem(itemEl);
      showItemHoverCard(itemEl, item, window.__lastSimpleData || {});
    } else {
      if (card && !card.contains(e.target)) {
        hideHoverCard();
      }
      if (pCard && !pCard.contains(e.target)) {
        hidePillarSummaryCard();
      }
    }
  });

  // 4. Dismissible via Escape key (WCAG 1.4.13)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideHoverCard();
      hidePillarSummaryCard();
    }
  });
}

function resolveHoverItem(itemEl) {
  const itemId = itemEl.getAttribute('data-item-id');
  const itemPillar = itemEl.getAttribute('data-pillar');
  const itemName = itemEl.querySelector('.item-name')?.innerText?.trim() || 'Item';

  // Sensor Group resolution
  if (itemPillar === 'experience') {
    if (itemId && window.__groupsMap?.[itemId]) {
      return { ...window.__groupsMap[itemId], pillar: 'experience' };
    }
    if (window.__groupsMap?.[itemName.toLowerCase()]) {
      return { ...window.__groupsMap[itemName.toLowerCase()], pillar: 'experience' };
    }
  }

  // 1. Try lookup by exact ID
  if (itemId && window.__evaluatedItemsMap?.[itemId]) {
    return window.__evaluatedItemsMap[itemId];
  }

  // 2. Try lookup by lower-case Name
  if (window.__evaluatedItemsMap?.[itemName.toLowerCase()]) {
    return window.__evaluatedItemsMap[itemName.toLowerCase()];
  }

  // 3. Resilient fallback: Derive from DOM directly
  const isRed = itemEl.querySelector('.pill-red') || itemEl.querySelector('.pill-split-red-blue') || itemEl.querySelector('[style*="rgb(231, 111, 81)"]') || itemEl.querySelector('[style*="#e76f51"]');
  const isYellow = itemEl.querySelector('.pill-yellow') || itemEl.querySelector('[style*="#e9c46a"]');
  const isBlue = itemEl.querySelector('.pill-blue') || itemEl.querySelector('[style*="#4f75ff"]');
  return {
    id: itemId || 'dyn-' + itemName,
    name: itemName,
    status: isRed ? 'red' : (isYellow ? 'yellow' : (isBlue ? 'blue' : 'green')),
    pillar: itemPillar || 'experience',
    target: '',
    test_type: itemPillar === 'experience' ? 'group' : 'service'
  };
}

function hideHoverCard() {
  const hovercard = document.getElementById('simple-item-hovercard');
  if (hovercard) {
    hovercard.classList.remove('visible');
    hovercard.style.display = 'none';
    hovercard.style.visibility = 'hidden';
  }
  document.querySelectorAll('.simple-pillar-item').forEach(i => i.classList.remove('active-hovered'));
  currentHoveredItemEl = null;
}

function showItemHoverCard(element, item, currentData) {
  const hovercard = document.getElementById('simple-item-hovercard');
  if (!hovercard) return;

  const details = generateItemHoverDetails(item, currentData);

  // 1. Accent color left border
  hovercard.style.borderLeftColor = details.accentColor;

  // 2. Title & Status Badge
  const titleEl = document.getElementById('shc-title');
  if (titleEl) titleEl.innerText = details.name;

  const badgeEl = document.getElementById('shc-status-badge');
  if (badgeEl) {
    badgeEl.className = `shc-status-badge ${details.badgeClass}`;
    badgeEl.innerText = details.badgeText;
  }

  // 3. Events Last 24H Total
  const eventsTotalEl = document.getElementById('shc-events-total');
  if (eventsTotalEl) eventsTotalEl.innerText = `Total: ${details.eventsTotal}`;

  // 4. Histogram Bars
  const hist = document.getElementById('shc-histogram');
  if (hist) {
    hist.innerHTML = details.histogramBars.map(b => 
      `<div class="shc-bar ${b.colorClass}" style="height: ${b.height}px;"></div>`
    ).join('');
  }

  // 5. Ongoing Issues / Incidents
  const ongoingBullet = document.getElementById('shc-ongoing-bullet');
  if (ongoingBullet) ongoingBullet.style.color = details.ongoingBulletColor;

  const ongoingCount = document.getElementById('shc-ongoing-count');
  if (ongoingCount) ongoingCount.innerText = details.ongoingCount;

  const ongoingDesc = document.getElementById('shc-ongoing-desc');
  if (ongoingDesc) ongoingDesc.innerText = details.ongoingDesc;

  const tagsContainer = document.getElementById('shc-ongoing-tags');
  if (tagsContainer) {
    tagsContainer.innerHTML = details.ongoingTags.map(t => 
      `<span class="shc-tag">${t}</span>`
    ).join('');
  }

  // 6. Latest Values Grid
  const grid = document.getElementById('shc-values-grid');
  if (grid) {
    grid.innerHTML = details.latestValues.map(row => `
      <div class="shc-row">
        <span class="shc-k">${row.label}</span>
        <span class="shc-v">${row.value}</span>
      </div>
    `).join('');
  }

  // 7. Make card block and visible immediately
  hovercard.style.display = 'block';
  hovercard.style.visibility = 'visible';
  hovercard.style.opacity = '1';

  // 8. Dynamic Positioning with Viewport Boundary Clamping
  const rect = element.getBoundingClientRect();
  const cardWidth = 290;
  const cardHeight = hovercard.offsetHeight || 370;

  // Align to right side of element
  let left = rect.right + 12;
  let top = rect.top - 6;

  // Flip inline to left if overflowing right edge
  if (left + cardWidth > window.innerWidth - 12) {
    left = Math.max(10, rect.left - cardWidth - 12);
  }

  // Push upwards if overflowing bottom edge
  if (top + cardHeight > window.innerHeight - 10) {
    top = Math.max(10, window.innerHeight - cardHeight - 10);
  }
  if (top < 10) top = 10;

  hovercard.style.left = `${Math.round(left)}px`;
  hovercard.style.top = `${Math.round(top)}px`;
  hovercard.classList.add('visible');
}

function generateItemHoverDetails(item, currentData) {
  const name = item.name || 'Monitored Item';
  const status = item.status || 'green';
  const pillar = item.pillar || 'services';
  const target = item.target || '';
  const testType = item.test_type || 'service';

  // Sensor Group Detail Card for Experience pillar
  if (pillar === 'experience') {
    const isSplit = item.is_split_status || item.status === 'split-red-blue' || item.color === 'split-red-blue';
    const isDegraded = isSplit || item.status === 'red' || item.color === 'red';
    const sCount = item.sensor_count ?? (item.sensors ? item.sensors.length : 1);
    const sensorList = (item.sensors && item.sensors.length) 
      ? item.sensors.map(s => s.name || s.id).join(', ')
      : 'sensor-kali-laptop2 (wlan0)';

    const groupAccent = isDegraded ? '#e76f51' : (item.color === 'green' ? '#65c18c' : (item.color === 'gray' ? '#64748b' : '#4f75ff'));
    const groupBadgeClass = isDegraded ? 'badge-red' : (item.color === 'green' ? 'badge-green' : (item.color === 'gray' ? 'badge-gray' : 'badge-blue'));

    const histBars = [];
    for (let h = 0; h < 24; h++) {
      let bHeight = (h % 3 === 0) ? 6 : 4;
      let bColor = 'bar-blue';
      if (isDegraded && (h >= 14 || h % 4 === 0)) {
        bHeight = 12 + (h % 5) * 2;
        bColor = 'bar-red';
      }
      histBars.push({ height: bHeight, colorClass: bColor });
    }

    return {
      name,
      status: item.status,
      pillar: 'experience',
      accentColor: groupAccent,
      badgeClass: groupBadgeClass,
      badgeText: `${sCount} SENSOR${sCount === 1 ? '' : 'S'}`,
      eventsTotal: isDegraded ? 188 : 42,
      histogramBars: histBars,
      ongoingCount: isDegraded ? 4 : 0,
      ongoingBulletColor: groupAccent,
      ongoingDesc: isDegraded
        ? '• Unexpected HTTPS status code & SSL error detected'
        : '• All assigned sensors operating within SLA',
      ongoingTags: isDegraded ? ['2 Sensors Affected', 'Wi-Fi 6 / 802.11ax', 'DHCP OK'] : ['Optimal SLA', 'Low Roaming Latency'],
      latestValues: [
        { label: 'Assigned Sensors', value: `${sCount} active` },
        { label: 'Member Fleet', value: sensorList },
        { label: 'Primary SSID', value: 'MariosWorld1UP (Ch 36)' },
        { label: 'Default Gateway', value: '192.168.1.1 (0.8ms)' },
        { label: 'DHCP Lease Time', value: '38 ms' },
        { label: 'DNS Resolution', value: '14 ms (AD-DNS)' },
        { label: 'Group SLA Uptime', value: isDegraded ? '91.4%' : '99.9%' }
      ]
    };
  }

  const isRed = status === 'red';
  const isYellow = status === 'yellow';
  const accentColor = isRed ? '#e76f51' : (isYellow ? '#e9c46a' : '#65c18c');
  const badgeClass = isRed ? 'badge-red' : (isYellow ? 'badge-yellow' : (status === 'gray' ? 'badge-gray' : 'badge-green'));
  const badgeText = isRed ? 'DEGRADED' : (isYellow ? 'WARNING' : (status === 'gray' ? 'DISABLED' : 'HEALTHY'));

  // 1. Events Last 24H & Sparkline
  let eventsTotal = 0;
  if (name.toLowerCase().includes('scarif') || (isRed && pillar === 'experience')) {
    eventsTotal = 123;

  } else if (isRed) {
    eventsTotal = Math.floor(40 + (name.length * 7) % 85);
  } else if (isYellow) {
    eventsTotal = Math.floor(15 + (name.length * 3) % 25);
  } else {
    eventsTotal = Math.floor((name.length * 2) % 12);
  }

  // Generate 24 hourly bars
  const histogramBars = [];
  for (let h = 0; h < 24; h++) {
    let barHeight = 4;
    let barColorClass = 'bar-gray';

    if (isRed) {
      const isSpike = (h >= 14 && h <= 22) || (h % 3 === 0);
      if (isSpike) {
        barHeight = Math.floor(10 + Math.sin(h * 0.8) * 12 + ((h * 13) % 15));
        barHeight = Math.max(8, Math.min(28, barHeight));
        barColorClass = 'bar-red';
      } else {
        barHeight = Math.max(3, (h % 5) * 2 + 2);
        barColorClass = 'bar-gray';
      }
    } else if (isYellow) {
      if (h >= 18 || h % 4 === 0) {
        barHeight = Math.floor(6 + (h % 5) * 3);
        barColorClass = 'bar-yellow';
      } else {
        barHeight = 3;
        barColorClass = 'bar-gray';
      }
    } else {
      barHeight = (h % 6 === 0) ? 6 : ((h % 2 === 0) ? 4 : 2);
      barColorClass = 'bar-green';
    }
    histogramBars.push({ height: barHeight, colorClass: barColorClass });
  }

  // 2. Ongoing Issues / Incidents
  let ongoingCount = isRed ? 1 : (isYellow ? 1 : 0);
  let ongoingBulletColor = accentColor;
  let ongoingDesc = '';
  let ongoingTags = [];

  if (name.toLowerCase().includes('scarif')) {
    ongoingDesc = '• Web application test failed to complete';
    ongoingTags = ['Cape', 'Microsoft Office Login and Logout'];
  } else if (name.toLowerCase().includes('pos') || name.toLowerCase().includes('mobile')) {
    ongoingDesc = '• Transaction API endpoint unreachable';
    ongoingTags = ['PoS Gateway', '504 Gateway Timeout'];
  } else if (name.toLowerCase().includes('dhcp')) {
    ongoingDesc = isRed ? '• DHCP lease negotiation timed out' : '• 4-Way DORA handshake successful';
    ongoingTags = isRed ? ['DORA Handshake', 'Timeout 2000ms'] : ['38ms Lease', '192.168.1.125'];
  } else if (name.toLowerCase().includes('gateway')) {
    ongoingDesc = isRed ? '• Gateway packet loss > SLA threshold' : '• Gateway ping latency within SLA';
    ongoingTags = ['192.168.1.1', isRed ? '100% Loss' : '3ms Latency'];
  } else if (name.toLowerCase().includes('office') || name.toLowerCase().includes('365')) {
    ongoingDesc = isRed ? '• Web application test failed to complete' : '• Web application test passed (HTTP 200)';
    ongoingTags = isRed ? ['Cape', 'Microsoft Office Login and Logout'] : ['HTTP 200', 'login.microsoftonline.com'];
  } else if (isRed) {
    ongoingDesc = '• Synthetic probe SLA threshold breached';
    ongoingTags = [target || 'Target SLA', 'Critical Alert'];
  } else if (isYellow) {
    ongoingDesc = '• Response latency elevated above baseline';
    ongoingTags = [target || 'Target SLA', 'Warning SLA'];
  } else {
    ongoingDesc = '• All synthetic probes operating within SLA';
    ongoingTags = ['0% Loss', 'Optimal'];
  }

  // 3. Latest Values
  let latestValues = [];
  const liveSensor = (currentData?.sensors && currentData.sensors[0]) || {};
  const liveIp = liveSensor.ip_address || '192.168.1.125';
  const liveGw = liveSensor.hardware_info?.gateway || '192.168.1.1';
  const liveMac = liveSensor.mac_address || '18:cc:18:d5:ed:a0';

  if (pillar === 'experience' || testType === 'network') {
    const isWired = name.toLowerCase().includes('wired') || name.toLowerCase().includes('eth0');
    if (isWired) {
      latestValues = [
        { label: 'Interface', value: 'eth0 (1000baseT)' },
        { label: 'IP Address', value: liveIp },
        { label: 'Gateway', value: liveGw },
        { label: 'MAC Address', value: liveMac },
        { label: 'MTU', value: '1500' },
        { label: 'Link State', value: 'UP (Full Duplex)' },
        { label: 'Last Seen', value: 'Just now' }
      ];
    } else {
      const ssid = name.toLowerCase().includes('scarif') ? 'Cape' : (target || 'Bayshore-Corp');
      latestValues = [
        { label: 'SSID', value: ssid },
        { label: 'RSSI', value: isRed ? '-34.9 dBm' : '-48.2 dBm' },
        { label: 'RX Rate', value: isRed ? '33.7 Mbps' : '144.0 Mbps' },
        { label: 'TX Rate', value: isRed ? '58.5 Mbps' : '288.0 Mbps' },
        { label: 'BSSID', value: '58:b6:33:3e:03:c8' },
        { label: 'Channel', value: isRed ? '6 (2.4 GHz)' : '36 (5 GHz)' },
        { label: 'Last Seen', value: isRed ? '16 minutes ago' : 'Just now' }
      ];
    }
  } else if (pillar === 'services' || testType === 'core_service') {
    if (name.toLowerCase().includes('dhcp')) {
      latestValues = [
        { label: 'Service', value: 'DHCPv4 (DORA)' },
        { label: 'Lease Time', value: '38 ms' },
        { label: 'Assigned IP', value: liveIp },
        { label: 'Subnet Mask', value: '255.255.255.0' },
        { label: 'Router/GW', value: liveGw },
        { label: 'DNS Server', value: liveGw },
        { label: 'Last Check', value: 'Just now' }
      ];
    } else if (name.toLowerCase().includes('gateway')) {
      latestValues = [
        { label: 'Gateway IP', value: liveGw },
        { label: 'Probe Method', value: 'ICMP & TCP' },
        { label: 'RTT Latency', value: '3.1 ms' },
        { label: 'Packet Loss', value: '0.0%' },
        { label: 'Jitter', value: '0.8 ms' },
        { label: 'Status', value: 'Reachable' },
        { label: 'Last Check', value: 'Just now' }
      ];
    } else if (name.toLowerCase().includes('dns')) {
      latestValues = [
        { label: 'Primary DNS', value: `${liveGw} (0 ms)` },
        { label: 'Secondary DNS', value: '8.8.8.8 (16 ms)' },
        { label: 'Query Type', value: 'A / AAAA' },
        { label: 'Lookup Latency', value: '16 ms' },
        { label: 'Status', value: 'Resolved' },
        { label: 'Last Check', value: 'Just now' }
      ];
    } else {
      latestValues = [
        { label: 'Target', value: target || 'Link Carrier' },
        { label: 'Interface', value: 'wlan0 / eth0' },
        { label: 'Status', value: isRed ? 'Degraded' : 'Active' },
        { label: 'Carrier', value: 'Carrier OK' },
        { label: 'Last Seen', value: 'Just now' }
      ];
    }
  } else {
    if (name.toLowerCase().includes('teams') || testType === 'voip_mos') {
      latestValues = [
        { label: 'Target', value: 'worldaz.tr.teams.microsoft.com' },
        { label: 'MOS Score', value: '4.4 (Excellent)' },
        { label: 'R-Factor', value: '92.6' },
        { label: 'Jitter', value: '2.1 ms' },
        { label: 'RTT Latency', value: '40 ms' },
        { label: 'Packet Loss', value: '0.0%' },
        { label: 'Last Run', value: 'Just now' }
      ];
    } else if (name.toLowerCase().includes('iperf') || testType === 'iperf3') {
      latestValues = [
        { label: 'Server', value: target || 'iperf.corp.internal:5201' },
        { label: 'Throughput', value: '201.9 Mbps' },
        { label: 'Retransmits', value: '3' },
        { label: 'TCP Window', value: '128 KB' },
        { label: 'Duration', value: '5.0 sec' },
        { label: 'SLA Pass', value: 'Yes (>75 Mbps)' },
        { label: 'Last Run', value: 'Just now' }
      ];
    } else if (name.toLowerCase().includes('slack')) {
      latestValues = [
        { label: 'Target', value: target || 'https://slack.com/api/api.test' },
        { label: 'HTTP Status', value: '200 OK' },
        { label: 'RTT Latency', value: '921 ms' },
        { label: 'DNS Lookup', value: '14 ms' },
        { label: 'TCP Connect', value: '24 ms' },
        { label: 'API Health', value: '100% (ok: true)' },
        { label: 'Last Run', value: 'Just now' }
      ];
    } else {
      latestValues = [
        { label: 'Target', value: target || 'Synthetic Target' },
        { label: 'HTTP Status', value: isRed ? '504 Timeout' : '200 OK' },
        { label: 'RTT Latency', value: isRed ? '1013 ms' : (isYellow ? '320 ms' : '48 ms') },
        { label: 'DNS Lookup', value: '18 ms' },
        { label: 'TCP Connect', value: '24 ms' },
        { label: 'Packet Loss', value: isRed ? '15%' : '0%' },
        { label: 'Last Probe', value: 'Just now' }
      ];
    }
  }

  return {
    name,
    status,
    pillar,
    accentColor,
    badgeClass,
    badgeText,
    eventsTotal,
    histogramBars,
    ongoingCount,
    ongoingBulletColor,
    ongoingDesc,
    ongoingTags,
    latestValues
  };
}

// Expose globals for onclick handlers
window.openSimpleConfigModal = openSimpleConfigModal;
window.closeSimpleConfigModal = closeSimpleConfigModal;
window.toggleSimpleItemStatus = toggleSimpleItemStatus;
window.deleteSimpleItem = deleteSimpleItem;
window.resetSimpleViewDefaults = resetSimpleViewDefaults;
window.loadArubaPresetItems = loadArubaPresetItems;

// ============================================================================
// Authentic Pillar Summary Card (Avatar Circle Hover Popover)
// ============================================================================

function hidePillarSummaryCard() {
  const pCard = document.getElementById('pillar-summary-card');
  if (pCard) {
    pCard.classList.remove('visible');
    pCard.style.display = 'none';
    pCard.style.visibility = 'hidden';
  }
  currentHoveredCircleEl = null;
}

function showPillarSummaryCard(circleEl, pillar, currentData) {
  const pCard = document.getElementById('pillar-summary-card');
  if (!pCard) return;

  const data = generatePillarSummaryData(pillar, currentData);

  // Status left border accent
  pCard.style.borderLeftColor = data.accentColor;

  // Header Title & Counts
  const titleEl = document.getElementById('psc-title');
  if (titleEl) titleEl.innerText = data.title;

  const totalEl = document.getElementById('psc-total-count');
  if (totalEl) totalEl.innerText = data.counts.total;

  const redEl = document.getElementById('psc-count-red');
  if (redEl) redEl.innerText = data.counts.red;

  const blueEl = document.getElementById('psc-count-blue');
  if (blueEl) blueEl.innerText = data.counts.blue;

  const greenEl = document.getElementById('psc-count-green');
  if (greenEl) greenEl.innerText = data.counts.green;

  const grayEl = document.getElementById('psc-count-gray');
  if (grayEl) grayEl.innerText = data.counts.gray;

  // Table Column Headers
  const colName = document.getElementById('psc-col-name');
  if (colName) colName.innerText = data.columns.name;

  const colNow = document.getElementById('psc-col-now');
  if (colNow) colNow.innerText = data.columns.now;

  const colHist = document.getElementById('psc-col-hist');
  if (colHist) colHist.innerText = data.columns.hist;

  // Table Rows Body
  const tableBody = document.getElementById('psc-table-body');
  if (tableBody) {
    tableBody.innerHTML = data.rows.map(row => {
      let trackInnerHtml = '';
      if (Array.isArray(row.barSegments)) {
        trackInnerHtml = row.barSegments.map(seg =>
          `<div class="psc-bar-fill" style="width: ${seg.width}%; background: ${seg.color};"></div>`
        ).join('');
      } else {
        trackInnerHtml = `<div class="psc-bar-fill" style="width: 100%; background: ${row.barColor || '#4f75ff'};"></div>`;
      }

      return `
        <div class="psc-row">
          <span class="psc-row-name" title="${row.name}">${row.name}</span>
          <div class="psc-row-now">
            <span class="psc-now-count">${row.count}</span>
            <div class="psc-bar-track">
              ${trackInnerHtml}
            </div>
          </div>
          <div class="psc-sparkline">
            ${renderPscSparkline(row.sparkPattern)}
          </div>
        </div>
      `;
    }).join('');
  }

  // Ongoing Issues Header & List
  const critCountEl = document.getElementById('psc-ongoing-crit-count');
  if (critCountEl) critCountEl.innerText = data.ongoing.critCount;

  const warnCountEl = document.getElementById('psc-ongoing-warn-count');
  if (warnCountEl) warnCountEl.innerText = data.ongoing.warnCount;

  const issuesList = document.getElementById('psc-issues-list');
  if (issuesList) {
    let issuesHtml = data.ongoing.issues.map(iss => `
      <div class="psc-issue-item">
        <div class="psc-issue-left">
          <span class="psc-dot dot-${iss.color}">●</span>
          <span>${iss.name}</span>
        </div>
        <span class="psc-issue-scope">${iss.scope}</span>
      </div>
    `).join('');

    if (data.ongoing.moreIssues) {
      issuesHtml += `<div class="psc-more-issues">${data.ongoing.moreIssues}</div>`;
    }
    issuesList.innerHTML = issuesHtml;
  }

  // Position and display
  pCard.style.display = 'block';
  pCard.style.visibility = 'visible';
  pCard.style.opacity = '1';

  const rect = circleEl.getBoundingClientRect();
  const cardWidth = 470;
  const cardHeight = pCard.offsetHeight || 390;

  // Position adjacent to circle
  let left = rect.right + 16;
  let top = rect.top;

  // Flip inline to left if overflowing viewport right edge
  if (left + cardWidth > window.innerWidth - 12) {
    left = Math.max(10, rect.left - cardWidth - 16);
  }

  // Push upwards if overflowing bottom edge
  if (top + cardHeight > window.innerHeight - 10) {
    top = Math.max(10, window.innerHeight - cardHeight - 10);
  }
  if (top < 10) top = 10;

  pCard.style.left = `${Math.round(left)}px`;
  pCard.style.top = `${Math.round(top)}px`;
  pCard.classList.add('visible');
}

function renderPscSparkline(pattern) {
  const bars = [];
  const barCount = 28;
  for (let i = 0; i < barCount; i++) {
    let color = '#4f75ff';
    let h = 4;
    if (pattern === 'emea') {
      const isRed = (i >= 0 && i <= 3) || (i >= 12 && i <= 15) || (i >= 22 && i <= 24);
      color = isRed ? '#e76f51' : '#4f75ff';
      h = isRed ? (12 + (i % 3) * 2) : (7 + (i % 4) * 2);
    } else if (pattern === 'na') {
      const isRed = (i % 5 === 0);
      color = isRed ? '#e76f51' : '#4f75ff';
      h = (i % 2 === 0) ? 6 : 4;
    } else if (pattern === 'apj') {
      const isRed = (i % 4 === 0);
      color = isRed ? '#e76f51' : '#4f75ff';
      h = 5;
    } else if (pattern === '6e') {
      color = '#4f75ff';
      h = (i < 20) ? 5 : 2;
    } else if (pattern === 'laptops') {
      const isRed = (i >= 2 && i <= 7) || (i >= 16 && i <= 19);
      color = isRed ? '#e76f51' : (i < 22 ? '#4f75ff' : '#282b34');
      h = isRed ? 7 : 5;
    } else if (pattern === 'android') {
      color = (i >= 6 && i <= 12) ? '#4f75ff' : '#65c18c';
      h = 4;
    } else if (pattern === 'staging') {
      color = '#475569';
      h = 3;
    } else if (pattern === 'red') {
      color = (i % 2 === 0) ? '#e76f51' : '#4f75ff';
      h = (i % 3 === 0) ? 12 : 6;
    } else if (pattern === 'green') {
      color = '#65c18c';
      h = (i % 4 === 0) ? 8 : 4;
    } else {
      color = '#4f75ff';
      h = (i % 3 === 0) ? 8 : 4;
    }
    bars.push(`<div class="psc-spark-bar" style="height: ${h}px; background: ${color};"></div>`);
  }
  return bars.join('');
}

function generatePillarSummaryData(pillar, currentData) {
  if (pillar === 'experience') {
    const groups = (cachedGroups && cachedGroups.length) ? cachedGroups : [
      { name: 'EMEA', sensor_count: 7, color: 'blue', status: 'blue' },
      { name: 'North America', sensor_count: 7, color: 'blue', status: 'blue' },
      { name: 'APJ', sensor_count: 3, color: 'blue', status: 'blue' },
      { name: '6E sensor', sensor_count: 1, color: 'blue', status: 'blue' },
      { name: 'Laptop Agents', sensor_count: 10, is_split_status: true, color: 'split-red-blue', status: 'split-red-blue' },
      { name: 'Android Agents', sensor_count: 6, color: 'green', status: 'green' },
      { name: 'staging', sensor_count: 3, color: 'gray', status: 'gray' }
    ];

    let totalSensors = 0;
    let redCount = 0;
    let blueCount = 0;
    let greenCount = 0;
    let grayCount = 0;

    const rows = groups.map(grp => {
      const isSplit = grp.is_split_status || grp.status === 'split-red-blue' || grp.color === 'split-red-blue';
      const count = grp.sensor_count ?? (grp.sensors ? grp.sensors.length : 1);
      totalSensors += count;

      let barSegments = null;
      let barColor = '#4f75ff';

      if (isSplit) {
        redCount += 1;
        blueCount += Math.max(1, count - 1);
        barSegments = [
          { width: 18, color: '#e76f51' },
          { width: 82, color: '#4f75ff' }
        ];
      } else if (grp.color === 'red' || grp.status === 'red') {
        redCount += count;
        barColor = '#e76f51';
      } else if (grp.color === 'green' || grp.status === 'green') {
        greenCount += count;
        barColor = '#65c18c';
      } else if (grp.color === 'gray' || grp.status === 'gray') {
        grayCount += count;
        barColor = '#64748b';
      } else {
        blueCount += count;
        barColor = '#4f75ff';
      }

      const nameLower = (grp.name || '').toLowerCase();
      const sparkPattern = nameLower.includes('laptop') ? 'laptops' :
                           nameLower.includes('emea') ? 'emea' :
                           nameLower.includes('north') ? 'na' :
                           nameLower.includes('6e') ? '6e' :
                           nameLower.includes('android') ? 'android' :
                           nameLower.includes('staging') ? 'staging' :
                           (isSplit ? 'laptops' : 'apj');

      return {
        name: grp.name,
        count,
        barSegments,
        barColor,
        sparkPattern
      };
    });

    return {
      title: 'All Sensors',
      accentColor: '#e76f51',
      counts: {
        total: totalSensors || 37,
        red: redCount || 1,
        blue: blueCount || 14,
        green: greenCount || 2,
        gray: grayCount || 20
      },
      columns: {
        name: 'GROUPS',
        now: 'SENSORS NOW',
        hist: 'LAST 24H'
      },
      rows,
      ongoing: {
        critCount: 4,
        warnCount: 188,
        issues: [
          { name: 'Unexpected HTTPS status code', scope: '2 Sensors  2 Networks', color: 'red' },
          { name: 'Unexpected HTTP status code', scope: '2 Sensors  2 Networks', color: 'red' },
          { name: 'SSL error', scope: '26 Sensors  33 Networks', color: 'blue' },
          { name: 'SSL error', scope: '26 Sensors  33 Networks', color: 'blue' },
          { name: 'High latency', scope: '16 Sensors  20 Networks', color: 'blue' }
        ],
        moreIssues: '... 14 other issues'
      }
    };
  }

  if (pillar === 'services') {
    return {
      title: 'All Services',
      accentColor: '#e76f51',
      counts: {
        total: 16,
        red: 1,
        blue: 3,
        green: 11,
        gray: 1
      },
      columns: {
        name: 'SERVICES',
        now: 'STATUS NOW',
        hist: 'LAST 24H'
      },
      rows: [
        { name: 'Wi-Fi 6E Associator', count: 3, barColor: '#4f75ff', sparkPattern: 'blue' },
        { name: 'Ethernet Interface', count: 1, barColor: '#65c18c', sparkPattern: 'green' },
        { name: 'DHCPv4 (DORA Handshake)', count: 1, barColor: '#e76f51', sparkPattern: 'red' },
        { name: 'Default Gateway (192.168.1.1)', count: 4, barColor: '#4f75ff', sparkPattern: 'blue' },
        { name: 'Corporate DNS (AD DNS)', count: 4, barColor: '#65c18c', sparkPattern: 'green' },
        { name: 'Public DNS (1.1.1.1 / 8.8.8.8)', count: 3, barColor: '#65c18c', sparkPattern: 'green' }
      ],
      ongoing: {
        critCount: 1,
        warnCount: 3,
        issues: [
          { name: 'DHCP lease negotiation timeout (>2000ms)', scope: '1 Sensor  1 Network', color: 'red' },
          { name: 'Corporate DNS resolution latency elevated', scope: '2 Sensors  2 Networks', color: 'blue' },
          { name: 'Default Gateway ICMP packet loss detected', scope: '1 Sensor  1 Network', color: 'blue' }
        ],
        moreIssues: null
      }
    };
  }

  if (pillar === 'internal') {
    return {
      title: 'All Internal Applications',
      accentColor: '#e76f51',
      counts: {
        total: 12,
        red: 1,
        blue: 2,
        green: 8,
        gray: 1
      },
      columns: {
        name: 'APPLICATIONS',
        now: 'HEALTH NOW',
        hist: 'LAST 24H'
      },
      rows: [
        { name: 'Bayshore EHR Patient Portal', count: 3, barColor: '#e76f51', sparkPattern: 'red' },
        { name: 'Clinical PACS Imaging DICOM', count: 2, barColor: '#4f75ff', sparkPattern: 'blue' },
        { name: 'Active Directory Kerberos', count: 2, barColor: '#65c18c', sparkPattern: 'green' },
        { name: 'Intranet Core API', count: 3, barColor: '#65c18c', sparkPattern: 'green' },
        { name: 'iPerf3 Bandwidth Server', count: 2, barColor: '#65c18c', sparkPattern: 'green' }
      ],
      ongoing: {
        critCount: 1,
        warnCount: 2,
        issues: [
          { name: 'EHR Patient Portal 504 Gateway Timeout', scope: '1 Sensor  2 Networks', color: 'red' },
          { name: 'PACS DICOM latency threshold breached (>300ms)', scope: '2 Sensors  2 Networks', color: 'blue' }
        ],
        moreIssues: null
      }
    };
  }

  // External (Cloud & SaaS)
  return {
    title: 'All External Services',
    accentColor: '#65c18c',
    counts: {
      total: 18,
      red: 0,
      blue: 2,
      green: 16,
      gray: 0
    },
    columns: {
      name: 'CLOUD SERVICES',
      now: 'HEALTH NOW',
      hist: 'LAST 24H'
    },
    rows: [
      { name: 'Microsoft 365 & Entra ID', count: 5, barColor: '#65c18c', sparkPattern: 'green' },
      { name: 'Teams VoIP Media Relays', count: 4, barColor: '#4f75ff', sparkPattern: 'blue' },
      { name: 'Google Workspace / Gmail', count: 3, barColor: '#65c18c', sparkPattern: 'green' },
      { name: 'Salesforce Health Cloud', count: 3, barColor: '#65c18c', sparkPattern: 'green' },
      { name: 'Slack Realtime API', count: 3, barColor: '#65c18c', sparkPattern: 'green' }
    ],
    ongoing: {
      critCount: 0,
      warnCount: 2,
      issues: [
        { name: 'Teams VoIP MOS score degraded (MOS 3.7)', scope: '1 Sensor  2 Networks', color: 'blue' },
        { name: 'Microsoft 365 OAuth latency spike', scope: '1 Sensor  1 Network', color: 'blue' }
      ],
      moreIssues: null
    }
  };
}

// ============================================================================
// Sensor Groups Management Modal Logic (Defining Groups of Sensors)
// ============================================================================

let currentEditingGroupId = null;

function openSensorGroupsModal() {
  const modal = document.getElementById('modal-sensor-groups');
  if (!modal) return;
  modal.style.display = 'flex';
  renderSensorGroupsList();
  renderSensorChecklist();
  startNewSensorGroup();
}

function closeSensorGroupsModal() {
  const modal = document.getElementById('modal-sensor-groups');
  if (modal) modal.style.display = 'none';
  refreshSimpleView();
}

function renderSensorGroupsList() {
  const container = document.getElementById('sensor-groups-list');
  if (!container) return;

  if (cachedGroups.length === 0) {
    container.innerHTML = `<div style="font-size: 0.8rem; color: #94a3b8; padding: 1rem 0;">No groups defined. Click "+ New Group" to create one.</div>`;
    return;
  }

  container.innerHTML = cachedGroups.map(grp => {
    const isSelected = currentEditingGroupId === grp.id;
    const isSplit = grp.is_split_status || grp.status === 'split-red-blue' || grp.color === 'split-red-blue';
    const pillClass = isSplit ? 'pill-split-red-blue' : `pill-${grp.color || grp.status || 'blue'}`;
    const sCount = grp.sensor_count ?? (grp.sensors ? grp.sensors.length : 0);
    const memberSensorsStr = (grp.sensors && grp.sensors.length) 
      ? grp.sensors.map(s => s.name || s.id).join(', ') 
      : 'No sensors assigned';

    return `
      <div class="group-card-item ${isSelected ? 'selected' : ''}" onclick="editSensorGroup('${grp.id}')">
        <div class="group-card-left">
          <div class="item-pill-bar ${pillClass}" style="width: 18px; height: 6px;"></div>
          <div class="group-card-info">
            <span class="group-card-name">${grp.name}</span>
            <span class="group-card-meta">${sCount} sensor${sCount === 1 ? '' : 's'} • ${memberSensorsStr}</span>
          </div>
        </div>
        <div class="group-card-actions">
          <button type="button" class="btn-card-action" onclick="event.stopPropagation(); deleteSensorGroup('${grp.id}')" title="Delete Group">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderSensorChecklist(selectedSensorIds = []) {
  const container = document.getElementById('group-sensors-checklist');
  if (!container) return;

  if (cachedSensors.length === 0) {
    container.innerHTML = `<div style="font-size: 0.78rem; color: #94a3b8; padding: 0.5rem;">No sensors found in fleet database.</div>`;
    return;
  }

  container.innerHTML = cachedSensors.map(sensor => {
    const isChecked = selectedSensorIds.includes(sensor.id);
    const ip = sensor.ip_address || sensor.ip || '192.168.1.x';
    const iface = sensor.interface || (sensor.wifi_card_detected ? 'wlan0' : 'eth0');
    const platform = sensor.platform || 'Linux';
    return `
      <label class="sensor-check-row">
        <input type="checkbox" name="sensor_member" value="${sensor.id}" ${isChecked ? 'checked' : ''}>
        <span class="sensor-check-name">${sensor.name || sensor.id}</span>
        <span class="sensor-check-meta">${ip} • ${iface} (${platform})</span>
      </label>
    `;
  }).join('');
}

function startNewSensorGroup() {
  currentEditingGroupId = null;
  const idEl = document.getElementById('group-edit-id');
  const nameEl = document.getElementById('group-input-name');
  const descEl = document.getElementById('group-input-desc');
  const statusEl = document.getElementById('group-input-status');
  const iconEl = document.getElementById('group-input-icon');
  const badgeEl = document.getElementById('editor-mode-badge');
  const titleEl = document.getElementById('editor-form-title');
  const btnEl = document.getElementById('btn-save-group');

  if (idEl) idEl.value = '';
  if (nameEl) nameEl.value = '';
  if (descEl) descEl.value = '';
  if (statusEl) statusEl.value = 'blue';
  if (iconEl) iconEl.value = 'none';
  if (badgeEl) {
    badgeEl.innerText = 'Creating New';
    badgeEl.style.background = 'rgba(56, 189, 248, 0.15)';
    badgeEl.style.color = '#38bdf8';
  }
  if (titleEl) titleEl.innerText = 'Create Sensor Group';
  if (btnEl) btnEl.innerText = 'Create Sensor Group';

  renderSensorChecklist([]);
  renderSensorGroupsList();
}

function editSensorGroup(groupId) {
  const grp = cachedGroups.find(g => g.id === groupId);
  if (!grp) return;

  currentEditingGroupId = groupId;
  const idEl = document.getElementById('group-edit-id');
  const nameEl = document.getElementById('group-input-name');
  const descEl = document.getElementById('group-input-desc');
  const statusEl = document.getElementById('group-input-status');
  const iconEl = document.getElementById('group-input-icon');
  const badgeEl = document.getElementById('editor-mode-badge');
  const titleEl = document.getElementById('editor-form-title');
  const btnEl = document.getElementById('btn-save-group');

  if (idEl) idEl.value = grp.id;
  if (nameEl) nameEl.value = grp.name || '';
  if (descEl) descEl.value = grp.description || '';
  if (statusEl) statusEl.value = grp.is_split_status ? 'split-red-blue' : (grp.color || grp.status || 'blue');
  if (iconEl) iconEl.value = grp.icon_type || 'none';
  if (badgeEl) {
    badgeEl.innerText = `Editing: ${grp.name}`;
    badgeEl.style.background = 'rgba(234, 179, 8, 0.15)';
    badgeEl.style.color = '#eab308';
  }
  if (titleEl) titleEl.innerText = 'Edit Sensor Group';
  if (btnEl) btnEl.innerText = 'Save Changes';

  const memberIds = (grp.sensors || []).map(s => s.id || s);
  renderSensorChecklist(memberIds);
  renderSensorGroupsList();
}

async function handleSaveSensorGroup(event) {
  if (event) event.preventDefault();

  const id = document.getElementById('group-edit-id')?.value;
  const name = document.getElementById('group-input-name')?.value?.trim();
  const description = document.getElementById('group-input-desc')?.value?.trim();
  const statusVal = document.getElementById('group-input-status')?.value || 'blue';
  const icon_type = document.getElementById('group-input-icon')?.value || 'none';

  if (!name) return;

  const is_split_status = statusVal === 'split-red-blue';
  const color = is_split_status ? 'split-red-blue' : statusVal;
  const status = is_split_status ? 'split-red-blue' : statusVal;

  const checkedSensors = Array.from(document.querySelectorAll('#group-sensors-checklist input[name="sensor_member"]:checked'))
    .map(cb => cb.value);

  const payload = {
    name,
    description,
    color,
    status,
    icon_type,
    is_split_status,
    sensor_ids: checkedSensors
  };

  try {
    if (id) {
      await API.updateGroup(id, payload);
    } else {
      await API.createGroup(payload);
    }

    const groupsRes = await API.getGroups();
    cachedGroups = groupsRes.groups || [];
    renderSensorGroupsList();
    startNewSensorGroup();
    refreshSimpleView();
  } catch (err) {
    console.error('Failed to save group:', err);
    alert('Failed to save sensor group: ' + err.message);
  }
}

async function deleteSensorGroup(groupId) {
  const grp = cachedGroups.find(g => g.id === groupId);
  const name = grp ? grp.name : 'this group';
  if (!confirm(`Are you sure you want to delete the sensor group "${name}"?`)) return;

  try {
    await API.deleteGroup(groupId);
    const groupsRes = await API.getGroups();
    cachedGroups = groupsRes.groups || [];
    if (currentEditingGroupId === groupId) {
      startNewSensorGroup();
    } else {
      renderSensorGroupsList();
    }
    refreshSimpleView();
  } catch (err) {
    console.error('Failed to delete group:', err);
    alert('Failed to delete sensor group: ' + err.message);
  }
}

async function resetSensorGroupsDefaults() {
  if (!confirm('Reset sensor groups to authentic Aruba UXI baseline (Laptop Agents, EMEA, APJ, North America, 6E sensor, etc.)?')) return;

  try {
    await API.resetGroups();
    const groupsRes = await API.getGroups();
    cachedGroups = groupsRes.groups || [];
    renderSensorGroupsList();
    startNewSensorGroup();
    refreshSimpleView();
  } catch (err) {
    console.error('Failed to reset groups:', err);
    alert('Failed to reset sensor groups: ' + err.message);
  }
}

function selectAllGroupSensors(checkAll) {
  const checkboxes = document.querySelectorAll('#group-sensors-checklist input[name="sensor_member"]');
  checkboxes.forEach(cb => cb.checked = checkAll);
}

// Expose globals for onclick handlers
window.openSensorGroupsModal = openSensorGroupsModal;
window.closeSensorGroupsModal = closeSensorGroupsModal;
window.startNewSensorGroup = startNewSensorGroup;
window.editSensorGroup = editSensorGroup;
window.deleteSensorGroup = deleteSensorGroup;
window.handleSaveSensorGroup = handleSaveSensorGroup;
window.resetSensorGroupsDefaults = resetSensorGroupsDefaults;
window.selectAllGroupSensors = selectAllGroupSensors;
window.toggleGroupsDropdown = toggleGroupsDropdown;
window.selectGroupFilter = selectGroupFilter;


