require('dotenv').config();
const os = require('os');

module.exports = {
  serverId: process.env.SENSOR_ID || `sensor-${os.hostname().toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
  sensorName: process.env.SENSOR_NAME || `Ubuntu-${os.hostname()}`,
  serverUrl: process.env.SERVER_URL || 'http://localhost:3000',
  mode: process.env.SENSOR_MODE || 'sensor', // 'sensor' or 'agent'
  testInterface: process.env.TEST_INTERFACE || 'wlan1',
  managementInterface: process.env.MGMT_INTERFACE || 'eth0',
  simulate: process.env.SIMULATE === 'true' || os.platform() !== 'linux',
  cycleIntervalSeconds: parseInt(process.env.CYCLE_INTERVAL || '15', 10),
  agentIntervalSeconds: parseInt(process.env.AGENT_INTERVAL || '300', 10),
  
  // Configured networks for this sensor (Wired Ethernet eth0 on VM)
  networks: [
    {
      id: 'net-wired-eth0',
      name: 'Wired-Ethernet (eth0)',
      type: 'ethernet',
      isDhcp: true,
      disableExternal: false
    }
  ],

  // Control Targets
  controlHosts: {
    primaryDns: '10.10.1.10',
    secondaryDns: '8.8.8.8',
    dnsQueryTarget: 'pulseux.internal',
    gateway: '10.10.30.1',
    externalHttp: 'https://www.google.com/generate_204',
    teamsVoipTarget: 'worldaz.tr.teams.microsoft.com',
    salesforceTarget: 'https://login.salesforce.com',
    iperfServer: 'iperf.corp.internal'
  }
};
