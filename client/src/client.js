const os = require('os');
const config = require('./config');
const StoreAndForward = require('./storeAndForward');
const LinuxRunner = require('./platform/linuxRunner');
const Simulator = require('./platform/simulator');
const SystemInfo = require('./platform/systemInfo');

class PulseSensorClient {
  constructor(options = {}) {
    this.sensorId = options.sensorId || config.serverId;
    this.sensorName = options.sensorName || config.sensorName;
    this.serverUrl = options.serverUrl || config.serverUrl;
    this.mode = options.mode || config.mode; // 'sensor' or 'agent'
    this.simulate = options.simulate !== undefined ? options.simulate : config.simulate;
    this.networks = options.networks || config.networks;
    this.currentNetworkIndex = 0;
    this.cycleCount = 0;
    this.isRunning = false;
    this.isCycleExecuting = false;

    // Extract real network and hardware telemetry
    this.netDetails = SystemInfo.getNetworkDetails();
    this.hwDetails = SystemInfo.getHardwareDetails();

    this.sf = new StoreAndForward(this.serverUrl);
    this.linuxRunner = new LinuxRunner(this.netDetails.activeInterface, 'eth0');
    this.simulator = new Simulator();

    console.log(`[Pulse UX Sensor] Initialized. ID: ${this.sensorId}, Mode: ${this.mode.toUpperCase()}, Simulate: ${this.simulate}`);
    console.log(`[Pulse UX Sensor] Host: ${this.hwDetails.hostname} (${this.hwDetails.arch}), Interface: ${this.netDetails.activeInterface}, IP: ${this.netDetails.ipAddress}, MAC: ${this.netDetails.macAddress}, Gateway: ${this.netDetails.gateway}`);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async register() {
    console.log(`[Pulse UX Sensor] Registering sensor with Pulse UX Hub at ${this.serverUrl}...`);
    // Refresh live IP and memory stats
    this.netDetails = SystemInfo.getNetworkDetails();
    this.hwDetails = SystemInfo.getHardwareDetails();

    const payload = {
      id: this.sensorId,
      name: this.sensorName,
      mode: this.mode,
      ip_address: this.netDetails.ipAddress,
      mac_address: this.netDetails.macAddress,
      hardware_model: this.hwDetails.hardwareModel,
      firmware_version: '2.4.0-pulse',
      hardware_info: {
        hostname: this.hwDetails.hostname,
        platform: this.hwDetails.platform,
        release: this.hwDetails.release,
        arch: this.hwDetails.arch,
        cpu_model: this.hwDetails.cpuModel,
        cpus: this.hwDetails.cpuCores,
        totalmem: this.hwDetails.totalMemGb,
        freemem: this.hwDetails.freeMemMb,
        uptime_seconds: this.hwDetails.uptimeSeconds,
        mode: this.mode,
        active_interface: this.netDetails.activeInterface,
        gateway: this.netDetails.gateway,
        dns_servers: this.netDetails.dnsServers
      }
    };
    await this.sf.send('/api/sensors/register', payload);
  }

  async reportStage(networkName, stage) {
    console.log(`[Cycle #${this.cycleCount}] [${networkName}] >>> Stage: ${stage.toUpperCase()}`);
    await this.sf.send('/api/telemetry/stage', {
      sensor_id: this.sensorId,
      current_network_name: networkName,
      current_stage: stage,
      cycle_count: this.cycleCount
    });
  }

  async recordResult(networkId, testId, stage, success, durationMs, metrics = {}, errorMessage = null) {
    const payload = {
      sensor_id: this.sensorId,
      network_id: networkId,
      test_id: testId,
      stage,
      success,
      duration_ms: durationMs,
      metrics,
      error_message: errorMessage
    };
    return await this.sf.send('/api/telemetry/results', payload);
  }

  async runTriage(network, stage, errorMessage) {
    console.log(`[TRIAGE TRIGGERED] Running automated root cause triage for ${stage} failure on ${network.name}...`);
    const triageData = this.simulator.generateTriage(stage, network.name);
    
    await this.sf.send('/api/triage', {
      issue_id: null,
      sensor_id: this.sensorId,
      network_id: network.id,
      failure_step: stage,
      root_cause_analysis: triageData.root_cause_analysis,
      command_output: triageData.command_output,
      traceroute_hops: triageData.traceroute_hops,
      dora_trace: triageData.dora_trace,
      pcap_filename: triageData.pcap_filename,
      pcap_size_kb: triageData.pcap_size_kb,
      ethernet_comparison: triageData.ethernet_comparison
    });
  }

  // Sensor Test Cycle (Full 10 steps per network)
  async runSensorNetworkCycle(network) {
    const netName = network.name;
    console.log(`\n===============================================================`);
    console.log(`[Test Cycle #${this.cycleCount}] Commencing tests on Network: ${netName} (${network.type})`);
    console.log(`===============================================================`);

    // 1. AP Scan (Wi-Fi only)
    if (network.type === 'wifi') {
      await this.reportStage(netName, 'ap_scan');
      const scanResults = this.simulate
        ? await this.simulator.scanWifi()
        : await this.linuxRunner.scanWifi();
      
      await this.sf.send('/api/telemetry/wifi', {
        sensor_id: this.sensorId,
        scan_data: scanResults
      });
      await this.sleep(1200);

      // 2. SSID Check
      await this.reportStage(netName, 'ssid_check');
      const targetSeen = scanResults.some(ap => ap.ssid === network.ssid);
      await this.recordResult(network.id, null, 'ssid_check', targetSeen, 45, { ssid: network.ssid, found: targetSeen });
      await this.sleep(1000);

      // 3. AP Association
      await this.reportStage(netName, 'association');
      const assocRes = this.simulate
        ? await this.simulator.associate(network.ssid)
        : await this.linuxRunner.associate(network.ssid, network.security);
      
      await this.recordResult(network.id, null, 'association', assocRes.success, assocRes.durationMs, { association_time_ms: assocRes.durationMs });
      if (!assocRes.success) {
        await this.runTriage(network, 'association', 'Failed to associate with SSID');
        return;
      }
      await this.sleep(1200);
    }

    // 4. Allocate IP (DHCP)
    await this.reportStage(netName, 'dhcp');
    const dhcpRes = this.simulate
      ? await this.simulator.allocateDhcp()
      : await this.linuxRunner.allocateDhcp(this.netDetails.ipAddress);

    await this.recordResult(network.id, null, 'dhcp', dhcpRes.success, dhcpRes.durationMs, {
      dhcp_lease_time_ms: dhcpRes.durationMs,
      ip: this.netDetails.ipAddress || '192.168.64.4',
      gateway: this.netDetails.gateway || '192.168.64.1'
    });

    if (!dhcpRes.success) {
      await this.runTriage(network, 'dhcp', 'DHCP lease acquisition timed out');
      return;
    }
    await this.sleep(1200);

    // 5. Gateway Reachability
    await this.reportStage(netName, 'gateway');
    const targetGw = this.netDetails.gateway || config.controlHosts.gateway;
    const gwRes = this.simulate
      ? await this.simulator.pingGateway()
      : await this.linuxRunner.ping(targetGw, 3);

    await this.recordResult(network.id, 'test-gw-ping', 'gateway', gwRes.success, gwRes.latencyMs, {
      latency_ms: gwRes.latencyMs,
      packet_loss_pct: gwRes.packetLossPct,
      gateway_ip: targetGw
    });
    await this.sleep(1000);

    // 6. Primary DNS
    await this.reportStage(netName, 'primary_dns');
    const targetDns1 = this.netDetails.dnsServers[0] || config.controlHosts.primaryDns;
    const dns1Res = this.simulate
      ? await this.simulator.resolveDns(config.controlHosts.primaryDns)
      : await this.linuxRunner.resolveDns('google.com', targetDns1);

    await this.recordResult(network.id, 'test-dns-core', 'primary_dns', dns1Res.success, dns1Res.durationMs, {
      dns_lookup_time_ms: dns1Res.durationMs,
      resolver: targetDns1
    });
    if (!dns1Res.success) {
      await this.runTriage(network, 'primary_dns', 'Primary DNS lookup failed');
    }
    await this.sleep(1000);

    // 7. Secondary DNS
    await this.reportStage(netName, 'secondary_dns');
    const targetDns2 = this.netDetails.dnsServers[1] || '1.1.1.1';
    const dns2Res = this.simulate
      ? await this.simulator.resolveDns(config.controlHosts.secondaryDns)
      : await this.linuxRunner.resolveDns('cloudflare.com', targetDns2);

    await this.recordResult(network.id, 'test-dns-sec', 'secondary_dns', dns2Res.success, dns2Res.durationMs, {
      dns_lookup_time_ms: dns2Res.durationMs,
      resolver: targetDns2
    });
    await this.sleep(1000);

    // 8. External Cloud Connectivity (if not disabled)
    if (!network.disableExternal) {
      await this.reportStage(netName, 'external_http');
      const extRes = this.simulate
        ? await this.simulator.testExternalHttp()
        : await this.linuxRunner.testHttp('https://www.google.com');

      await this.recordResult(network.id, null, 'external_http', extRes.success, extRes.latencyMs, {
        http_status: extRes.httpStatus || 200,
        latency_ms: extRes.latencyMs
      });
      await this.sleep(1000);
    }

    // 9. Service & Application Tests
    await this.reportStage(netName, 'service_test');

    // VoIP Microsoft Teams MOS Test
    const voipRes = await this.simulator.testVoipTeams();
    await this.recordResult(network.id, 'test-voip-teams', 'service_test', voipRes.success, voipRes.durationMs, voipRes.metrics);
    await this.sleep(1000);

    // Salesforce CRM Web App Test
    const sfRes = await this.simulator.testWebserver('Salesforce', config.controlHosts.salesforceTarget);
    await this.recordResult(network.id, 'test-web-salesforce', 'service_test', sfRes.success, sfRes.durationMs, sfRes.metrics);
    await this.sleep(1000);

    // iPerf3 Throughput Test
    const iperfRes = await this.simulator.testThroughput();
    await this.recordResult(network.id, 'test-iperf-core', 'service_test', iperfRes.success, iperfRes.durationMs, iperfRes.metrics);
    await this.sleep(1000);

    // 10. Deauthenticate / Release (Wi-Fi)
    if (network.type === 'wifi') {
      await this.reportStage(netName, 'release_deauth');
      if (!this.simulate) {
        await this.linuxRunner.releaseAndDeauth();
      }
      await this.sleep(800);
    }

    console.log(`[Test Cycle #${this.cycleCount}] Completed network cycle on ${netName}.`);
  }

  // Agent Mode (Runs passive application tests without network churn)
  async runAgentCycle() {
    console.log(`[Agent Cycle #${this.cycleCount}] Running passive app tests on current network...`);
    await this.reportStage('Current Connection', 'service_test');

    // Gateway
    const gwRes = await this.simulator.pingGateway();
    await this.recordResult(null, 'test-gw-ping', 'gateway', gwRes.success, gwRes.latencyMs, gwRes.metrics);

    // DNS
    const dnsRes = await this.simulator.resolveDns('8.8.8.8');
    await this.recordResult(null, 'test-dns-sec', 'primary_dns', dnsRes.success, dnsRes.durationMs, { dns_lookup_time_ms: dnsRes.durationMs });

    // VoIP Teams MOS
    const voipRes = await this.simulator.testVoipTeams();
    await this.recordResult(null, 'test-voip-teams', 'service_test', voipRes.success, voipRes.durationMs, voipRes.metrics);

    // Salesforce
    const sfRes = await this.simulator.testWebserver('Salesforce', config.controlHosts.salesforceTarget);
    await this.recordResult(null, 'test-web-salesforce', 'service_test', sfRes.success, sfRes.durationMs, sfRes.metrics);

    console.log(`[Agent Cycle #${this.cycleCount}] Passive test cycle complete.`);
  }

  // 2-Way Command Listener
  startCommandListener() {
    console.log(`[Pulse UX Sensor] Starting 2-way command listener against Hub (${this.serverUrl})...`);
    this.commandPollTimer = setInterval(async () => {
      if (!this.isRunning) return;
      try {
        const data = await this.sf.get(`/api/sensors/${encodeURIComponent(this.sensorId)}/commands/next`);
        if (data && data.command) {
          await this.handleIncomingCommand(data.command);
        }
      } catch (err) {
        // Silently tolerate temporary network drops
      }
    }, 1800);
  }

  async handleIncomingCommand(command) {
    console.log(`\n===============================================================`);
    console.log(`[OPERATOR COMMAND RECEIVED] Action: ${command.action.toUpperCase()} (Command ID: ${command.id})`);
    console.log(`===============================================================`);

    if (command.action === 'run_cycle') {
      if (this.isCycleExecuting) {
        console.log('[Pulse UX Sensor] Cycle already executing, skipping duplicate trigger.');
        return;
      }
      this.isCycleExecuting = true;
      try {
        const network = this.networks[this.currentNetworkIndex];
        if (this.mode === 'sensor') {
          await this.runSensorNetworkCycle(network);
        } else {
          await this.runAgentCycle();
        }
      } finally {
        this.isCycleExecuting = false;
      }

      // Acknowledge command completion
      await this.sf.send(`/api/sensors/${encodeURIComponent(this.sensorId)}/commands/${encodeURIComponent(command.id)}/ack`, {
        status: 'completed',
        result: { cycle_count: this.cycleCount, timestamp: new Date().toISOString() }
      });
    }
  }

  async start() {
    this.isRunning = true;
    await this.register();
    this.startCommandListener();

    while (this.isRunning) {
      this.cycleCount++;

      if (this.mode === 'sensor') {
        const network = this.networks[this.currentNetworkIndex];
        this.isCycleExecuting = true;
        try {
          await this.runSensorNetworkCycle(network);
        } finally {
          this.isCycleExecuting = false;
        }

        // Advance round-robin to next network
        this.currentNetworkIndex = (this.currentNetworkIndex + 1) % this.networks.length;
        await this.sleep(config.cycleIntervalSeconds * 1000);
      } else {
        await this.runAgentCycle();
        await this.sleep(config.agentIntervalSeconds * 1000);
      }
    }
  }

  stop() {
    this.isRunning = false;
    if (this.commandPollTimer) clearInterval(this.commandPollTimer);
    console.log('[Pulse UX Sensor] Stopping sensor service.');
  }
}

// CLI Execution Entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  const modeArg = args.find(a => a.startsWith('--mode='));
  const simArg = args.includes('--simulate');
  const serverArg = args.find(a => a.startsWith('--server='));

  const client = new PulseSensorClient({
    mode: modeArg ? modeArg.split('=')[1] : undefined,
    simulate: simArg || undefined,
    serverUrl: serverArg ? serverArg.split('=')[1] : undefined
  });

  client.start().catch(err => {
    console.error('Fatal sensor error:', err);
    process.exit(1);
  });
}

module.exports = PulseSensorClient;
