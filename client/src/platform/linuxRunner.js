const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Linux System Command Runner
 * Executes native networking tools: iw, wpa_cli, dhclient, ping, mtr, iperf3, tcpdump
 */
class LinuxRunner {
  constructor(iface, mgmtIface) {
    this.iface = iface || 'wlan1';
    this.mgmtIface = mgmtIface || 'eth0';
  }

  async runCommand(cmd, timeoutMs = 8000) {
    try {
      const { stdout, stderr } = await execPromise(cmd, { timeout: timeoutMs });
      return { success: true, stdout, stderr, code: 0 };
    } catch (err) {
      return { success: false, stdout: err.stdout || '', stderr: err.stderr || err.message, code: err.code || 1 };
    }
  }

  // 1. iw dev scan
  async scanWifi() {
    const res = await this.runCommand(`sudo iw dev ${this.iface} scan`);
    if (!res.success) throw new Error(res.stderr || 'iw scan failed');

    // Parse BSSIDs, SSIDs, Signal, Channel
    const bssids = [];
    const blocks = res.stdout.split('BSS ');
    for (const block of blocks) {
      if (!block.trim()) continue;
      const bssidMatch = block.match(/^([0-9a-fA-F:]{17})/);
      const ssidMatch = block.match(/SSID: (.*)/);
      const signalMatch = block.match(/signal: (-?[0-9.]+) dBm/);
      const freqMatch = block.match(/freq: ([0-9]+)/);

      if (bssidMatch) {
        const freq = freqMatch ? parseInt(freqMatch[1], 10) : 2412;
        const channel = freq > 5000 ? Math.floor((freq - 5000) / 5) : Math.floor((freq - 2407) / 5);
        const band = freq > 5900 ? '6GHz' : (freq > 4900 ? '5GHz' : '2.4GHz');

        bssids.push({
          bssid: bssidMatch[1],
          ssid: ssidMatch ? ssidMatch[1].trim() : '<Hidden>',
          rssi: signalMatch ? Math.round(parseFloat(signalMatch[1])) : -70,
          channel,
          band,
          vendor: block.includes('Aruba') ? 'Aruba' : (block.includes('Cisco') ? 'Cisco' : 'Generic'),
          vendor_ap_name: `AP-${channel}`
        });
      }
    }
    return bssids;
  }

  // 2. wpa_supplicant association
  async associate(ssid, security = 'open', psk = '') {
    const start = Date.now();
    // Configure wpa_cli
    const cmd = security === 'open'
      ? `sudo wpa_cli -i ${this.iface} remove_network all && sudo wpa_cli -i ${this.iface} add_network && sudo wpa_cli -i ${this.iface} set_network 0 ssid '"${ssid}"' && sudo wpa_cli -i ${this.iface} set_network 0 key_mgmt NONE && sudo wpa_cli -i ${this.iface} select_network 0`
      : `sudo wpa_cli -i ${this.iface} remove_network all && sudo wpa_cli -i ${this.iface} add_network && sudo wpa_cli -i ${this.iface} set_network 0 ssid '"${ssid}"' && sudo wpa_cli -i ${this.iface} set_network 0 psk '"${psk}"' && sudo wpa_cli -i ${this.iface} select_network 0`;

    const res = await this.runCommand(cmd, 6000);
    const duration = Date.now() - start;

    return {
      success: res.success,
      durationMs: duration,
      output: res.stdout || res.stderr
    };
  }

  // 3. dhclient DORA lease
  async allocateDhcp() {
    const start = Date.now();
    const res = await this.runCommand(`sudo dhclient -v -1 -pf /run/dhclient.${this.iface}.pid ${this.iface}`, 10000);
    const duration = Date.now() - start;

    return {
      success: res.success,
      durationMs: duration,
      output: res.stdout || res.stderr
    };
  }

  // 4. Ping gateway or target
  async ping(target, count = 10) {
    const start = Date.now();
    const res = await this.runCommand(`ping -I ${this.iface} -c ${count} -W 1 ${target}`, 6000);
    const duration = Date.now() - start;

    // Parse packet loss and rtt
    let lossPct = 100;
    let avgLatency = duration;

    const lossMatch = res.stdout.match(/([0-9.]+)% packet loss/);
    if (lossMatch) lossPct = parseFloat(lossMatch[1]);

    const rttMatch = res.stdout.match(/rtt min\/avg\/max\/mdev = [0-9.]+\/([0-9.]+)\//);
    if (rttMatch) avgLatency = parseFloat(rttMatch[1]);

    return {
      success: res.success && lossPct < 50,
      latencyMs: avgLatency,
      packetLossPct: lossPct,
      output: res.stdout
    };
  }

  // 5. Diagnostic traceroute
  async traceroute(target) {
    const res = await this.runCommand(`mtr -r -c 1 -n ${target} || traceroute -n -m 8 ${target}`, 8000);
    return res.stdout || res.stderr;
  }

  // 6. Release & Deauthenticate
  async releaseAndDeauth() {
    await this.runCommand(`sudo dhclient -r ${this.iface} && sudo wpa_cli -i ${this.iface} disconnect`);
  }
}

module.exports = LinuxRunner;
