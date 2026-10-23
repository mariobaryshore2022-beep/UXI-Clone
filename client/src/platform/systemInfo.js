const os = require('os');
const { execSync } = require('child_process');
const fs = require('fs');

/**
 * Pulse UX Sensor - Real Platform & Hardware Telemetry Extractor
 * Gathers genuine network interfaces, MAC addresses, default gateway, and hardware specs.
 */
class SystemInfo {
  static getNetworkDetails() {
    const interfaces = os.networkInterfaces();
    let bestIface = null;
    let fallbackIface = null;

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (name === 'lo' || name.startsWith('veth') || name.startsWith('docker') || name.startsWith('br-')) {
        continue;
      }

      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          const candidate = {
            interface: name,
            ip: addr.address,
            mac: addr.mac,
            netmask: addr.netmask
          };

          if (name.startsWith('eth') || name.startsWith('en') || name.startsWith('wl')) {
            bestIface = candidate;
            break;
          } else if (!fallbackIface) {
            fallbackIface = candidate;
          }
        }
      }
      if (bestIface) break;
    }

    const chosen = bestIface || fallbackIface || {
      interface: 'eth0',
      ip: '127.0.0.1',
      mac: '00:00:00:00:00:00',
      netmask: '255.255.255.0'
    };

    const gateway = SystemInfo.getDefaultGateway();
    const dnsServers = SystemInfo.getDnsServers();

    return {
      activeInterface: chosen.interface,
      ipAddress: chosen.ip,
      macAddress: chosen.mac,
      netmask: chosen.netmask,
      gateway: gateway || '192.168.1.1',
      dnsServers: dnsServers.length > 0 ? dnsServers : ['8.8.8.8', '1.1.1.1']
    };
  }

  static getDefaultGateway() {
    try {
      if (os.platform() === 'linux') {
        const output = execSync('ip route show default 2>/dev/null', { timeout: 1500 }).toString();
        const match = output.match(/via\s+([0-9.]+)/);
        if (match) return match[1];
      } else if (os.platform() === 'darwin') {
        const output = execSync('route -n get default 2>/dev/null', { timeout: 1500 }).toString();
        const match = output.match(/gateway:\s+([0-9.]+)/);
        if (match) return match[1];
      }
    } catch {}
    return null;
  }

  static getDnsServers() {
    const servers = [];
    try {
      if (fs.existsSync('/etc/resolv.conf')) {
        const content = fs.readFileSync('/etc/resolv.conf', 'utf8');
        const matches = content.matchAll(/^nameserver\s+([0-9.]+)/gm);
        for (const match of matches) {
          servers.push(match[1]);
        }
      }
    } catch {}
    return servers;
  }

  static getHardwareDetails() {
    const cpus = os.cpus();
    const cpuModel = cpus && cpus.length > 0 ? cpus[0].model.trim() : 'Generic CPU';
    const totalMemGb = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;
    const freeMemMb = Math.round(os.freemem() / (1024 * 1024));

    return {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel,
      cpuCores: cpus.length,
      totalMemGb: `${totalMemGb} GB`,
      freeMemMb: `${freeMemMb} MB`,
      loadAvg: os.loadavg(),
      uptimeSeconds: Math.round(os.uptime()),
      hardwareModel: `${os.hostname()} (${os.arch()} • ${cpuModel.split('@')[0].trim()})`
    };
  }
}

module.exports = SystemInfo;
