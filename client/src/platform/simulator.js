const { calculateMos } = require('../tests/voipMos');

/**
 * High-Fidelity Network & Telemetry Simulator
 * Used for development, Mac testing, and automated demonstration.
 */
class Simulator {
  constructor() {
    this.injectFault = null;
  }

  setFault(fault) {
    this.injectFault = fault;
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 1. AP Scan
  async scanWifi() {
    await this.sleep(200);
    if (process.env.ENABLE_MOCK_WIFI === 'true') {
      return [
        {
          bssid: '00:1A:1E:84:3A:90',
          ssid: 'Corp-Enterprise',
          channel: 48,
          band: '5GHz',
          rssi: -52 + Math.floor(Math.random() * 6 - 3),
          snr: 38,
          channel_utilization: 24 + Math.floor(Math.random() * 8),
          client_count: 16 + Math.floor(Math.random() * 5),
          vendor_ap_name: 'HQ-AP555-Floor3-East',
          vendor: 'Aruba',
          security: '802.1x-enterprise',
          is_connected: true
        }
      ];
    }
    // Real behavior: No Wi-Fi adapter on VM -> No BSSIDs in range
    return [];
  }

  // 2. Association Timing
  async associate(ssid) {
    await this.sleep(150);
    const duration = 42 + Math.floor(Math.random() * 30);
    return {
      success: true,
      durationMs: duration,
      output: `wpa_state=COMPLETED\naddress=00:1a:1e:84:3a:90\nssid=${ssid}\nfreq=5240`
    };
  }

  // 3. DHCP DORA Timing
  async allocateDhcp() {
    await this.sleep(200);
    if (this.injectFault === 'dhcp_timeout') {
      return {
        success: false,
        durationMs: 4200,
        output: 'DHCPDISCOVER on wlan1 to 255.255.255.255 port 67 interval 8\nNo DHCPOFFERS received.'
      };
    }

    const duration = 380 + Math.floor(Math.random() * 220);
    return {
      success: true,
      durationMs: duration,
      leaseTimeMs: duration,
      ip: '10.10.30.85',
      gateway: '10.10.30.1',
      output: `DHCPOFFER of 10.10.30.85 from 10.10.30.1\nDHCPACK of 10.10.30.85 from 10.10.30.1\nbound to 10.10.30.85`
    };
  }

  // 4. Gateway Ping
  async pingGateway(gw = '10.10.30.1') {
    await this.sleep(100);
    const latency = 1.4 + (Math.random() * 1.2);
    return {
      success: true,
      latencyMs: parseFloat(latency.toFixed(2)),
      packetLossPct: 0
    };
  }

  // 5. DNS Resolution
  async resolveDns(resolver, domain = 'arubanetworks.com') {
    await this.sleep(100);
    if (this.injectFault === 'dns_failure' && resolver === '10.10.1.10') {
      return {
        success: false,
        durationMs: 2500,
        error: 'connection timed out; no servers could be reached'
      };
    }

    const duration = 9 + Math.floor(Math.random() * 18);
    return {
      success: true,
      durationMs: duration,
      ip: '199.19.0.1'
    };
  }

  // 6. External HTTP
  async testExternalHttp(url = 'https://www.google.com/generate_204') {
    await this.sleep(150);
    const latency = 38 + Math.floor(Math.random() * 25);
    return {
      success: true,
      httpStatus: 200,
      latencyMs: latency
    };
  }

  // 7. VoIP Teams MOS
  async testVoipTeams() {
    await this.sleep(250);
    let rtt = 36 + Math.floor(Math.random() * 16);
    let jitter = 1.8 + (Math.random() * 1.5);
    let loss = 0;

    if (this.injectFault === 'voip_jitter') {
      rtt = 165;
      jitter = 38.5;
      loss = 5.2;
    }

    const mosResult = calculateMos(rtt, jitter, loss);
    return {
      success: mosResult.mos >= 3.8,
      durationMs: rtt,
      metrics: {
        latency_ms: rtt,
        jitter_ms: parseFloat(jitter.toFixed(1)),
        packet_loss_pct: loss,
        mos: mosResult.mos,
        r_factor: mosResult.rFactor,
        rating: mosResult.rating
      }
    };
  }

  // 8. Webserver (Salesforce / Slack)
  async testWebserver(name, url) {
    await this.sleep(200);
    const latency = 125 + Math.floor(Math.random() * 45);
    return {
      success: true,
      durationMs: latency,
      metrics: {
        http_status: 200,
        latency_ms: latency,
        ssl_days_remaining: 88
      }
    };
  }

  // 9. Throughput (iPerf3)
  async testThroughput() {
    await this.sleep(300);
    const speed = 185.5 + (Math.random() * 40 - 20);
    return {
      success: true,
      durationMs: 5000,
      metrics: {
        throughput_mbps: parseFloat(speed.toFixed(1)),
        retransmits: Math.floor(Math.random() * 4)
      }
    };
  }

  // 10. Generate Synthetic Triage Report
  generateTriage(stage, networkName) {
    return {
      failure_step: stage,
      root_cause_analysis: `Automated triage replayed ${stage} step on wlan1 and confirmed failure. Uplink trace indicates gateway reached, but upstream DHCP/DNS server did not reply within SLA threshold.`,
      command_output: `[TRIAGE EXECUTION] Replaying step ${stage} on network ${networkName}...
$ iw dev wlan1 link
Connected to 00:1a:1e:84:3a:90 (SSID: Corp-Enterprise, RSSI: -54 dBm, Ch: 48)
$ dhclient -v -d -1 wlan1
Listening on LPF/wlan1/e4:5f:01:bc:39:10
DHCPDISCOVER on wlan1 to 255.255.255.255 port 67 interval 4
DHCPDISCOVER on wlan1 to 255.255.255.255 port 67 interval 8
[TIMEOUT] No response from 10.10.30.1.
[ETHERNET CROSS-CHECK] Re-running over eth0: DORA completed in 4,120ms.
[CONCLUSION] Root cause: Upstream DHCP relay / IP pool exhaustion (affects both Wi-Fi and wired networks).`,
      traceroute_hops: [
        { hop: 1, ip: '10.10.30.1', name: 'gw-vlan30.corp.internal', rtt_ms: 1.5, asn: 'AS-INTERNAL' },
        { hop: 2, ip: '10.10.0.1', name: 'core-sw01.corp.internal', rtt_ms: 2.2, asn: 'AS-INTERNAL' },
        { hop: 3, ip: '64.104.12.1', name: 'edge-isp.net', rtt_ms: 12.4, asn: 'AS109' }
      ],
      dora_trace: {
        discover_tx: 3,
        offers_rx: 0,
        status: 'starvation'
      },
      pcap_filename: `triage_${Date.now()}.pcap`,
      pcap_size_kb: 124,
      ethernet_comparison: {
        wired_iface: 'eth0',
        wired_reproduced: true,
        summary: 'Wired interface reproduced identical failure; RF layer eliminated as root cause.'
      }
    };
  }
}

module.exports = Simulator;
