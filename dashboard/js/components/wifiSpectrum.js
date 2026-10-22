/**
 * Wi-Fi RF Multi-Band Spectrum Visualizer
 */
function renderWifiSpectrum(containerId, apList = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!apList || apList.length === 0) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem 1.5rem; text-align: center; background: rgba(0,0,0,0.2); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
        <div style="font-size: 2.2rem; margin-bottom: 0.75rem; opacity: 0.6;">📡</div>
        <h3 style="font-size: 1rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.35rem;">No Wireless Interfaces Detected</h3>
        <p style="font-size: 0.8rem; color: var(--text-muted); max-width: 540px; line-height: 1.5;">
          The active sensor (<strong>Kali-Linux-Sensor</strong>) is currently operating over <strong>Wired Ethernet (eth0)</strong>. 
          No wireless radios or external Wi-Fi adapters are present in this VM. Connect a compatible USB Wi-Fi adapter (e.g. MediaTek MT7921AU / Intel AX210) to monitor over-the-air RF spectrum and BSSIDs.
        </p>
      </div>
    `;
    return;
  }

  const bands = [
    {
      name: '2.4 GHz Band (802.11 b/g/n/ax)',
      channels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      filter: (ap) => ap.band === '2.4GHz' || ap.channel <= 14
    },
    {
      name: '5 GHz UNII-1 / UNII-2 / UNII-3 Band (802.11 a/n/ac/ax)',
      channels: [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 149, 153, 157, 161, 165],
      filter: (ap) => ap.band === '5GHz' || (ap.channel > 14 && ap.channel < 180)
    },
    {
      name: '6 GHz Wi-Fi 6E Band (UNII-5 to UNII-8)',
      channels: [1, 33, 37, 65, 69, 97, 101, 133, 165, 197],
      filter: (ap) => ap.band === '6GHz' || ap.channel >= 180
    }
  ];

  let html = '';

  bands.forEach(band => {
    const apsInBand = apList.filter(band.filter);

    html += `
      <div class="spectrum-band-row">
        <div class="band-header">
          <span class="band-title">${band.name}</span>
          <span class="card-subtitle">${apsInBand.length} BSSID(s) detected</span>
        </div>
        <div class="band-channels-track">
    `;

    // Render AP peaks
    apsInBand.forEach(ap => {
      const channelIndex = band.channels.indexOf(ap.channel);
      const positionPct = channelIndex !== -1 
        ? ((channelIndex + 0.5) / band.channels.length) * 100 
        : (Math.random() * 80 + 10);

      // Height based on RSSI (-40 is 100%, -90 is 20%)
      const rssi = ap.rssi || -70;
      const heightPct = Math.max(25, Math.min(95, Math.round(((rssi + 95) / 55) * 100)));

      let vendorClass = 'chip-pulse';
      let vendorColor = '#00f2fe';
      if (ap.vendor === 'Cisco') { vendorClass = 'chip-cisco'; vendorColor = '#00bceb'; }
      else if (ap.vendor === 'Mist') { vendorClass = 'chip-mist'; vendorColor = '#00c389'; }
      else if (ap.vendor === 'Extreme') { vendorClass = 'chip-extreme'; vendorColor = '#7c5295'; }
      else if (ap.vendor === 'Enterprise' || ap.vendor === 'Pulse AP') { vendorClass = 'chip-pulse'; vendorColor = '#00f2fe'; }

      html += `
        <div class="rf-signal-peak" 
             style="
               left: ${positionPct}%; 
               height: ${heightPct}%; 
               width: 54px; 
               transform: translateX(-50%);
               background: linear-gradient(180deg, ${vendorColor}cc 0%, rgba(0,0,0,0.4) 100%);
               border-color: ${vendorColor};
             "
             title="${ap.ssid} (${ap.vendor}) - Ch ${ap.channel} [${ap.rssi} dBm]">
          <span class="rf-peak-label">${ap.channel}</span>
        </div>
      `;
    });

    html += `
        </div>
        <div class="rf-channel-scale">
    `;

    band.channels.forEach(ch => {
      html += `<span class="scale-ch">${ch}</span>`;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}
