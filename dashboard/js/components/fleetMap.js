/**
 * Pulse UX - Sensor Fleet Map & Geospatial Observability Component
 * Interactive dark-mode cartography with draggable pins, coordinate editing, and full drill-down.
 */

let fleetMapInstance = null;
let sensorMarkersMap = {};
let allFleetSensors = [];
let selectedSensorForDrilldown = null;
let isPinningMode = false;
let sensorToPinId = null;
let currentTileLayer = null;
let currentTileType = 'dark';

const TILE_PROVIDERS = {
  dark: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    className: 'dark-basemap',
    maxZoom: 19
  },
  esriDark: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 18
  }
};

/**
 * Initialize Fleet Map Tab & Leaflet Canvas
 */
async function initFleetMap() {
  const mapContainer = document.getElementById('fleet-map');
  if (!mapContainer) return;

  if (!fleetMapInstance) {
    // Default center (Toronto / Mississauga GTA HQ)
    fleetMapInstance = L.map('fleet-map', {
      center: [43.6532, -79.3832],
      zoom: 12,
      zoomControl: true
    });

    currentTileLayer = L.tileLayer(TILE_PROVIDERS.dark.url, TILE_PROVIDERS.dark).addTo(fleetMapInstance);

    // Map click handler for Pinning Mode
    fleetMapInstance.on('click', async (e) => {
      if (isPinningMode && sensorToPinId) {
        const { lat, lng } = e.latlng;
        await saveSensorCoordinates(sensorToPinId, lat, lng);
        exitPinningMode();
      }
    });

    // Wire floating buttons
    const btnRecenter = document.getElementById('btn-map-recenter');
    if (btnRecenter) {
      btnRecenter.addEventListener('click', recenterFleetMap);
    }

    const btnTileToggle = document.getElementById('btn-map-tile-toggle');
    if (btnTileToggle) {
      btnTileToggle.addEventListener('click', toggleMapTileLayer);
    }

    // Search filter input
    const searchInput = document.getElementById('map-sensor-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        filterFleetList(e.target.value.toLowerCase());
      });
    }

    // Status filter chips
    document.querySelectorAll('.map-stats-chips .status-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.map-stats-chips .status-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const filter = chip.getAttribute('data-filter');
        applyStatusFilter(filter);
      });
    });
  }

  // Ensure dimensions calculate correctly after tab switch
  setTimeout(() => {
    if (fleetMapInstance) fleetMapInstance.invalidateSize();
  }, 100);

  // Load sensors and populate markers
  await refreshFleetMapData();
}

/**
 * Fetch Sensors & Refresh Markers
 */
async function refreshFleetMapData() {
  try {
    const sensors = await API.getSensors();
    allFleetSensors = sensors || [];

    updateFleetListCounts(allFleetSensors);
    renderFleetSidebarList(allFleetSensors);
    renderMapMarkers(allFleetSensors);

    // If a sensor is currently inspected, update drawer
    if (selectedSensorForDrilldown) {
      const refreshed = allFleetSensors.find(s => s.id === selectedSensorForDrilldown.id);
      if (refreshed) showSensorDrilldown(refreshed);
    }
  } catch (err) {
    console.error('Failed to load fleet map data:', err);
  }
}

/**
 * Render Leaflet Markers for All Pinned Sensors
 */
function renderMapMarkers(sensors = []) {
  if (!fleetMapInstance) return;

  // Clear existing markers
  Object.values(sensorMarkersMap).forEach(marker => marker.remove());
  sensorMarkersMap = {};

  const validLatLngs = [];

  sensors.forEach(sensor => {
    const lat = sensor.latitude ? parseFloat(sensor.latitude) : 43.6532;
    const lng = sensor.longitude ? parseFloat(sensor.longitude) : -79.3832;

    const isDegraded = sensor.status === 'degraded' || sensor.status === 'triage';
    const markerColorClass = isDegraded ? 'marker-degraded' : 'marker-online';

    // Create high-res custom pulsing marker icon
    const customIcon = L.divIcon({
      className: 'pulse-custom-map-pin',
      html: `
        <div class="pin-beacon ${markerColorClass}">
          <div class="pin-ring"></div>
          <div class="pin-core">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ffffff" stroke-width="2.5">
              <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>
              <circle cx="12" cy="10" r="2.5" fill="#ffffff"/>
            </svg>
          </div>
          <div class="pin-label">${sensor.name || sensor.id}</div>
        </div>
      `,
      iconSize: [36, 46],
      iconAnchor: [18, 42],
      popupAnchor: [0, -42]
    });

    const marker = L.marker([lat, lng], {
      icon: customIcon,
      draggable: true,
      title: `${sensor.name} (Drag to reposition)`
    }).addTo(fleetMapInstance);

    // Handle marker click -> Open Drilldown Drawer
    marker.on('click', () => {
      showSensorDrilldown(sensor);
    });

    // Handle dragend -> Update sensor coordinates
    marker.on('dragend', async (e) => {
      const position = e.target.getLatLng();
      await saveSensorCoordinates(sensor.id, position.lat, position.lng);
    });

    sensorMarkersMap[sensor.id] = marker;
    validLatLngs.push([lat, lng]);
  });

  // Fit bounds if valid coordinates exist
  if (validLatLngs.length > 0 && !isPinningMode) {
    if (validLatLngs.length === 1) {
      fleetMapInstance.setView(validLatLngs[0], 14);
    } else {
      fleetMapInstance.fitBounds(validLatLngs, { padding: [50, 50], maxZoom: 15 });
    }
  }
}

/**
 * Render Left Sidebar Sensors List
 */
function renderFleetSidebarList(sensors = []) {
  const listContainer = document.getElementById('map-sensors-list');
  if (!listContainer) return;

  if (sensors.length === 0) {
    listContainer.innerHTML = `<div style="padding: 1.5rem; color: #64748b; text-align: center;">No sensors matching filter.</div>`;
    return;
  }

  listContainer.innerHTML = sensors.map(sensor => {
    const isOnline = sensor.status === 'online';
    const isDegraded = sensor.status === 'degraded' || sensor.status === 'triage';
    const statusClass = isDegraded ? 'status-red' : (isOnline ? 'status-green' : 'status-gray');
    const isSelected = selectedSensorForDrilldown && selectedSensorForDrilldown.id === sensor.id;
    const hasCoordinates = sensor.latitude !== null && sensor.latitude !== undefined;

    return `
      <div class="map-sensor-card ${isSelected ? 'selected' : ''}" data-sensor-id="${sensor.id}">
        <div class="map-card-top">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="status-indicator ${statusClass}"></span>
            <strong class="map-card-name">${sensor.name}</strong>
          </div>
          <span class="badge ${isOnline ? 'badge-cyan-outline' : 'badge-red-outline'}" style="font-size: 0.65rem;">
            ${sensor.status.toUpperCase()}
          </span>
        </div>

        <div class="map-card-location">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>${sensor.location_name || 'Bayshore HealthCare HQ'} • ${sensor.floor || 'Floor 3'}</span>
        </div>

        <div class="map-card-meta">
          <span>IP: ${sensor.ip_address || '192.168.64.4'}</span>
          <span>Stage: <strong style="color: #38bdf8;">${(sensor.current_stage || 'IDLE').toUpperCase()}</strong></span>
        </div>

        <div class="map-card-actions">
          <button class="btn-card-action btn-card-inspect" onclick="inspectSensorFromList('${sensor.id}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Inspect
          </button>
          <button class="btn-card-action btn-card-manual-loc" onclick="openManualLocationModal('${sensor.id}', event)" title="Manually Enter Coordinates & Facility">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="2.5"/></svg>
            Set Location
          </button>
          <button class="btn-card-action btn-card-pin" onclick="startPinningMode('${sensor.id}', event)" title="Click on map to drop pin">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            ${hasCoordinates ? 'Pin Map' : 'Drop Pin'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Filter Fleet List by Search String
 */
function filterFleetList(query) {
  if (!query) {
    renderFleetSidebarList(allFleetSensors);
    return;
  }
  const filtered = allFleetSensors.filter(s => {
    const nameMatch = (s.name || '').toLowerCase().includes(query);
    const locMatch = (s.location_name || '').toLowerCase().includes(query);
    const ipMatch = (s.ip_address || '').toLowerCase().includes(query);
    const floorMatch = (s.floor || '').toLowerCase().includes(query);
    return nameMatch || locMatch || ipMatch || floorMatch;
  });
  renderFleetSidebarList(filtered);
}

/**
 * Filter Fleet List by Status
 */
function applyStatusFilter(status) {
  if (status === 'all') {
    renderFleetSidebarList(allFleetSensors);
  } else if (status === 'online') {
    renderFleetSidebarList(allFleetSensors.filter(s => s.status === 'online'));
  } else if (status === 'degraded') {
    renderFleetSidebarList(allFleetSensors.filter(s => s.status === 'degraded' || s.status === 'triage'));
  }
}

function updateFleetListCounts(sensors = []) {
  const countAll = document.getElementById('count-map-all');
  const countOnline = document.getElementById('count-map-online');
  const countDegraded = document.getElementById('count-map-degraded');
  const fleetCountBadge = document.getElementById('map-fleet-count');

  const total = sensors.length;
  const online = sensors.filter(s => s.status === 'online').length;
  const degraded = sensors.filter(s => s.status === 'degraded' || s.status === 'triage').length;

  if (countAll) countAll.innerText = total;
  if (countOnline) countOnline.innerText = online;
  if (countDegraded) countDegraded.innerText = degraded;
  if (fleetCountBadge) fleetCountBadge.innerText = `${total} ${total === 1 ? 'SENSOR' : 'SENSORS'}`;
}

/**
 * Click from Sidebar -> Center Map & Open Drilldown Drawer
 */
function inspectSensorFromList(sensorId) {
  const sensor = allFleetSensors.find(s => s.id === sensorId);
  if (!sensor) return;

  const lat = sensor.latitude ? parseFloat(sensor.latitude) : 43.6532;
  const lng = sensor.longitude ? parseFloat(sensor.longitude) : -79.3832;

  if (fleetMapInstance) {
    fleetMapInstance.flyTo([lat, lng], 15, { duration: 1.2 });
  }

  showSensorDrilldown(sensor);

  // Update selected class in sidebar
  document.querySelectorAll('.map-sensor-card').forEach(card => {
    if (card.getAttribute('data-sensor-id') === sensorId) card.classList.add('selected');
    else card.classList.remove('selected');
  });
}

/**
 * Show Rich Drilldown Slide-Over Drawer
 */
function showSensorDrilldown(sensor) {
  selectedSensorForDrilldown = sensor;
  const drawer = document.getElementById('sensor-drilldown-drawer');
  if (!drawer) return;

  const lat = sensor.latitude !== null && sensor.latitude !== undefined ? parseFloat(sensor.latitude).toFixed(5) : '43.65320';
  const lng = sensor.longitude !== null && sensor.longitude !== undefined ? parseFloat(sensor.longitude).toFixed(5) : '-79.38320';
  const isOnline = sensor.status === 'online';

  drawer.style.display = 'block';
  drawer.innerHTML = `
    <div class="drawer-header">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="status-indicator ${isOnline ? 'status-green' : 'status-red'}" style="width: 10px; height: 10px;"></span>
        <div>
          <h3 class="drawer-title">${sensor.name}</h3>
          <span class="drawer-subtitle">${sensor.id} • Mode: ${sensor.mode.toUpperCase()}</span>
        </div>
      </div>
      <button class="drawer-close-btn" onclick="closeSensorDrilldown()">&times;</button>
    </div>

    <div class="drawer-body">
      <!-- Quick Telemetry Stats Cards -->
      <div class="drawer-stats-grid">
        <div class="drawer-stat-card">
          <span class="drawer-stat-label">EXPERIENCE QUALITY</span>
          <div class="drawer-stat-val text-emerald">4.40 <span style="font-size: 0.75rem; color: #94a3b8;">MOS</span></div>
          <span class="drawer-stat-sub">ITU-T G.107 Target &ge; 3.8</span>
        </div>
        <div class="drawer-stat-card">
          <span class="drawer-stat-label">CURRENT DIAGNOSTIC</span>
          <div class="drawer-stat-val text-cyan">${(sensor.current_stage || 'IDLE').toUpperCase()}</div>
          <span class="drawer-stat-sub">Cycle #${sensor.cycle_count || 1} • Wired eth0</span>
        </div>
      </div>

      <!-- Location & Floor Plan Section -->
      <div class="drawer-section">
        <div class="drawer-section-header">
          <h4 class="drawer-section-title">PHYSICAL LOCATION & FLOOR PLAN</h4>
          <div style="display: flex; gap: 6px;">
            <button class="btn-inline-action" onclick="openManualLocationModal('${sensor.id}')">Set Location</button>
            <button class="btn-inline-action" onclick="toggleEditLocationForm()">Inline Edit</button>
          </div>
        </div>
        <div class="drawer-info-grid">
          <div class="drawer-info-item">
            <span class="info-label">Facility / Site</span>
            <span class="info-val">${sensor.location_name || 'Bayshore HealthCare HQ'}</span>
          </div>
          <div class="drawer-info-item">
            <span class="info-label">Floor / Wing</span>
            <span class="info-val">${sensor.floor || 'Floor 3 - East Wing'}</span>
          </div>
          <div class="drawer-info-item">
            <span class="info-label">Coordinates (Lat, Lng)</span>
            <span class="info-val font-mono" id="drawer-coords-val">${lat}, ${lng}</span>
          </div>
          <div class="drawer-info-item">
            <span class="info-label">Pin Status</span>
            <span class="info-val" style="color: var(--pulse-emerald);">Pinned & Draggable</span>
          </div>
        </div>

        <!-- Inline Coordinate Edit Form (Hidden by default) -->
        <form id="drawer-location-form" class="drawer-edit-form" style="display: none;" onsubmit="saveDrawerLocation(event, '${sensor.id}')">
          <div class="form-row">
            <div class="form-group">
              <label>Latitude</label>
              <input type="number" step="any" id="input-drawer-lat" class="drawer-input" value="${lat}" required>
            </div>
            <div class="form-group">
              <label>Longitude</label>
              <input type="number" step="any" id="input-drawer-lng" class="drawer-input" value="${lng}" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Facility Name</label>
              <input type="text" id="input-drawer-loc" class="drawer-input" value="${sensor.location_name || 'Bayshore HealthCare HQ'}">
            </div>
            <div class="form-group">
              <label>Floor / Wing</label>
              <input type="text" id="input-drawer-floor" class="drawer-input" value="${sensor.floor || 'Floor 3 - East Wing'}">
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
            <button type="button" class="btn btn-secondary" onclick="toggleEditLocationForm()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Coordinates</button>
          </div>
        </form>
      </div>

      <!-- Network & Hardware Specification -->
      <div class="drawer-section">
        <h4 class="drawer-section-title">HARDWARE & NETWORK METRICS</h4>
        <div class="drawer-info-grid">
          <div class="drawer-info-item">
            <span class="info-label">IP Address</span>
            <span class="info-val font-mono">${sensor.ip_address || '192.168.64.4'}</span>
          </div>
          <div class="drawer-info-item">
            <span class="info-label">MAC Address</span>
            <span class="info-val font-mono">${sensor.mac_address || 'e4:5f:01:bc:39:10'}</span>
          </div>
          <div class="drawer-info-item">
            <span class="info-label">Hardware Architecture</span>
            <span class="info-val">${sensor.hardware_info?.arch || 'arm64'} (${sensor.hardware_info?.cpus || 8} vCPUs)</span>
          </div>
          <div class="drawer-info-item">
            <span class="info-label">Firmware</span>
            <span class="info-val font-mono">${sensor.firmware_version || '2.4.0-pulse'}</span>
          </div>
        </div>
      </div>

      <!-- Direct Drill-Down Action Buttons -->
      <div class="drawer-action-buttons">
        <button class="btn btn-secondary drawer-btn-full" onclick="triggerSensorCycle('${sensor.id}', this)" style="border-color: #00f2fe; color: #00f2fe;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Dispatch Immediate Test Cycle
        </button>
        <button class="btn btn-primary drawer-btn-full" onclick="drillDownToSensorHistory('${sensor.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Drill Down to Sensor History & Metrics
        </button>
        <button class="btn btn-secondary drawer-btn-full" onclick="openRawMetricsModalForSensor('${sensor.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          View Raw Telemetry Payload
        </button>
      </div>
    </div>
  `;
}

function closeSensorDrilldown() {
  selectedSensorForDrilldown = null;
  const drawer = document.getElementById('sensor-drilldown-drawer');
  if (drawer) drawer.style.display = 'none';

  document.querySelectorAll('.map-sensor-card').forEach(card => card.classList.remove('selected'));
}

function toggleEditLocationForm() {
  const form = document.getElementById('drawer-location-form');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function saveDrawerLocation(e, sensorId) {
  e.preventDefault();
  const lat = parseFloat(document.getElementById('input-drawer-lat').value);
  const lng = parseFloat(document.getElementById('input-drawer-lng').value);
  const location_name = document.getElementById('input-drawer-loc').value.trim();
  const floor = document.getElementById('input-drawer-floor').value.trim();

  await saveSensorCoordinates(sensorId, lat, lng, location_name, floor);
  toggleEditLocationForm();
}

/**
 * Save Coordinates to Server API
 */
async function saveSensorCoordinates(sensorId, lat, lng, location_name = null, floor = null) {
  try {
    await API.updateSensorLocation(sensorId, {
      latitude: lat,
      longitude: lng,
      location_name,
      floor
    });

    // Update marker position
    if (sensorMarkersMap[sensorId]) {
      sensorMarkersMap[sensorId].setLatLng([lat, lng]);
    }

    // Refresh data
    await refreshFleetMapData();
  } catch (err) {
    alert('Failed to save coordinates: ' + err.message);
  }
}

/**
 * Start Interactive Pinning Mode
 */
function startPinningMode(sensorId, event) {
  if (event) event.stopPropagation();
  isPinningMode = true;
  sensorToPinId = sensorId;

  const mapEl = document.getElementById('fleet-map');
  if (mapEl) mapEl.style.cursor = 'crosshair';

  const sensor = allFleetSensors.find(s => s.id === sensorId);
  const toast = document.createElement('div');
  toast.id = 'pinning-toast';
  toast.className = 'map-pinning-toast';
  toast.innerHTML = `
    <span><strong>Pinning Mode:</strong> Click anywhere on the map to set location for <strong>${sensor?.name || sensorId}</strong></span>
    <button onclick="exitPinningMode()">Cancel</button>
  `;
  document.body.appendChild(toast);
}

function exitPinningMode() {
  isPinningMode = false;
  sensorToPinId = null;
  const mapEl = document.getElementById('fleet-map');
  if (mapEl) mapEl.style.cursor = '';

  const toast = document.getElementById('pinning-toast');
  if (toast) toast.remove();
}

/**
 * Recenter Map on Fleet Bounds
 */
function recenterFleetMap() {
  if (!fleetMapInstance || allFleetSensors.length === 0) return;
  const latlngs = allFleetSensors
    .filter(s => s.latitude && s.longitude)
    .map(s => [parseFloat(s.latitude), parseFloat(s.longitude)]);

  if (latlngs.length === 0) {
    fleetMapInstance.setView([43.6532, -79.3832], 12);
  } else if (latlngs.length === 1) {
    fleetMapInstance.setView(latlngs[0], 14);
  } else {
    fleetMapInstance.fitBounds(latlngs, { padding: [50, 50], maxZoom: 15 });
  }
}

/**
 * Toggle Map Tiles between Dark Matter and OSM
 */
function toggleMapTileLayer() {
  if (!fleetMapInstance) return;

  const types = ['dark', 'esriDark', 'osm', 'satellite'];
  const nextIdx = (types.indexOf(currentTileType) + 1) % types.length;
  currentTileType = types[nextIdx];

  const provider = TILE_PROVIDERS[currentTileType];
  if (currentTileLayer) currentTileLayer.remove();

  currentTileLayer = L.tileLayer(provider.url, provider).addTo(fleetMapInstance);

  const btn = document.getElementById('btn-map-tile-toggle');
  if (btn) {
    const labels = {
      dark: 'Dark Cyber',
      esriDark: 'Dark Canvas',
      osm: 'Street Map',
      satellite: 'Satellite'
    };
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
      ${labels[currentTileType]}
    `;
  }
}

/**
 * Drill-Down Action: Navigate to Sensor History Tab
 */
function drillDownToSensorHistory(sensorId) {
  // Activate tab-sensors
  const tabBtn = document.querySelector('.nav-tab[data-tab="tab-sensors"]');
  if (tabBtn) tabBtn.click();

  // Select sensor in historical viewer
  setTimeout(() => {
    const selectEl = document.getElementById('history-sensor-select');
    if (selectEl) {
      selectEl.value = sensorId;
      selectEl.dispatchEvent(new Event('change'));
    }
  }, 200);
}

/**
 * Drill-Down Action: Open Raw Telemetry Modal
 */
function openRawMetricsModalForSensor(sensorId) {
  const sensor = allFleetSensors.find(s => s.id === sensorId);
  const modal = document.getElementById('modal-metrics-viewer');
  const title = document.getElementById('modal-metrics-title');
  const jsonPre = document.getElementById('modal-metrics-json');

  if (modal && title && jsonPre && sensor) {
    title.innerText = `Raw Sensor Telemetry: ${sensor.name} (${sensor.id})`;
    jsonPre.innerText = JSON.stringify(sensor, null, 2);
    modal.style.display = 'flex';
  }
}

/**
 * Open Manually Set Location Modal
 */
function openManualLocationModal(sensorId = null, event = null) {
  if (event) event.stopPropagation();

  const modal = document.getElementById('modal-set-sensor-location');
  const select = document.getElementById('manual-loc-sensor-select');
  if (!modal || !select) return;

  // Populate sensor select dropdown
  select.innerHTML = allFleetSensors.map(s => `
    <option value="${s.id}">${s.name} (${s.id})</option>
  `).join('');

  const targetId = sensorId || (allFleetSensors.length > 0 ? allFleetSensors[0].id : null);
  if (targetId) {
    select.value = targetId;
    onManualLocationSensorChange(targetId);
  }

  modal.style.display = 'flex';
}

function closeManualLocationModal() {
  const modal = document.getElementById('modal-set-sensor-location');
  if (modal) modal.style.display = 'none';
}

function onManualLocationSensorChange(sensorId) {
  const sensor = allFleetSensors.find(s => s.id === sensorId);
  if (!sensor) return;

  const latInput = document.getElementById('manual-loc-lat');
  const lngInput = document.getElementById('manual-loc-lng');
  const locInput = document.getElementById('manual-loc-facility');
  const floorInput = document.getElementById('manual-loc-floor');

  if (latInput) latInput.value = sensor.latitude !== null && sensor.latitude !== undefined ? sensor.latitude : 43.6532;
  if (lngInput) lngInput.value = sensor.longitude !== null && sensor.longitude !== undefined ? sensor.longitude : -79.3832;
  if (locInput) locInput.value = sensor.location_name || 'Bayshore HealthCare HQ';
  if (floorInput) floorInput.value = sensor.floor || 'Floor 3 - East Wing';
}

function applyLocationPreset(lat, lng, facility, floor) {
  const latInput = document.getElementById('manual-loc-lat');
  const lngInput = document.getElementById('manual-loc-lng');
  const locInput = document.getElementById('manual-loc-facility');
  const floorInput = document.getElementById('manual-loc-floor');

  if (latInput) latInput.value = lat;
  if (lngInput) lngInput.value = lng;
  if (locInput) locInput.value = facility;
  if (floorInput) floorInput.value = floor;
}

function useBrowserGeolocation() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  const geoBtn = document.querySelector('.preset-chip-geo');
  const originalText = geoBtn ? geoBtn.innerText : '📍 Use My GPS';
  if (geoBtn) geoBtn.innerText = 'Acquiring GPS...';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (geoBtn) geoBtn.innerText = originalText;
      const lat = parseFloat(position.coords.latitude.toFixed(6));
      const lng = parseFloat(position.coords.longitude.toFixed(6));
      applyLocationPreset(lat, lng, 'Local Clinical Site (GPS)', 'Ground Floor');
    },
    (err) => {
      if (geoBtn) geoBtn.innerText = originalText;
      alert('Unable to retrieve GPS position: ' + err.message);
    },
    { timeout: 10000, enableHighAccuracy: true }
  );
}

function triggerPinFromModal() {
  const select = document.getElementById('manual-loc-sensor-select');
  const sensorId = select ? select.value : (allFleetSensors[0] ? allFleetSensors[0].id : null);
  closeManualLocationModal();
  if (sensorId) {
    startPinningMode(sensorId);
  }
}

async function handleManualLocationSubmit(e) {
  e.preventDefault();
  const select = document.getElementById('manual-loc-sensor-select');
  const sensorId = select ? select.value : null;
  if (!sensorId) return;

  const lat = parseFloat(document.getElementById('manual-loc-lat').value);
  const lng = parseFloat(document.getElementById('manual-loc-lng').value);
  const location_name = document.getElementById('manual-loc-facility').value.trim();
  const floor = document.getElementById('manual-loc-floor').value.trim();

  const saveBtn = document.getElementById('btn-save-manual-loc');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerText = 'Saving...';
  }

  try {
    await saveSensorCoordinates(sensorId, lat, lng, location_name, floor);
    closeManualLocationModal();

    // Focus map smoothly on new coordinates
    if (fleetMapInstance) {
      fleetMapInstance.flyTo([lat, lng], 15, { duration: 1.2 });
    }
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        Save Location
      `;
    }
  }
}

// Expose globals for onclick handlers
window.initFleetMap = initFleetMap;
window.refreshFleetMapData = refreshFleetMapData;
window.inspectSensorFromList = inspectSensorFromList;
window.startPinningMode = startPinningMode;
window.exitPinningMode = exitPinningMode;
window.closeSensorDrilldown = closeSensorDrilldown;
window.toggleEditLocationForm = toggleEditLocationForm;
window.saveDrawerLocation = saveDrawerLocation;
window.drillDownToSensorHistory = drillDownToSensorHistory;
window.openRawMetricsModalForSensor = openRawMetricsModalForSensor;
window.openManualLocationModal = openManualLocationModal;
window.closeManualLocationModal = closeManualLocationModal;
window.onManualLocationSensorChange = onManualLocationSensorChange;
window.applyLocationPreset = applyLocationPreset;
window.useBrowserGeolocation = useBrowserGeolocation;
window.triggerPinFromModal = triggerPinFromModal;
window.handleManualLocationSubmit = handleManualLocationSubmit;

