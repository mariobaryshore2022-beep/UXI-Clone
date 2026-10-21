-- ============================================================================
-- UXI Sensor Clone - Database Schema (PostgreSQL)
-- Supports both native PostgreSQL 15/16/17 and @electric-sql/pglite WASM
-- ============================================================================

-- Sensors (Hardware sensors or Software agents)
CREATE TABLE IF NOT EXISTS sensors (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    mode VARCHAR(32) NOT NULL DEFAULT 'sensor', -- 'sensor' (dedicated radio) or 'agent' (passive/app)
    status VARCHAR(32) NOT NULL DEFAULT 'online', -- 'online', 'offline', 'testing', 'degraded', 'triage'
    ip_address VARCHAR(45),
    mac_address VARCHAR(18),
    firmware_version VARCHAR(32) DEFAULT '2.4.0-uxi',
    hardware_model VARCHAR(128) DEFAULT 'Intel N100 / AX210',
    last_seen TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    current_network_name VARCHAR(128),
    current_stage VARCHAR(64) DEFAULT 'idle',
    cycle_count INT DEFAULT 0,
    groups JSONB DEFAULT '["HQ-Campus", "Floor-3-Wireless"]'::jsonb,
    hardware_info JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Networks configured per sensor (1 Ethernet + up to 3 Wi-Fi SSIDs)
CREATE TABLE IF NOT EXISTS networks (
    id VARCHAR(64) PRIMARY KEY,
    sensor_id VARCHAR(64) REFERENCES sensors(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'wifi', -- 'wifi' or 'ethernet'
    ssid VARCHAR(64),
    bssid VARCHAR(18),
    band VARCHAR(16) DEFAULT '5GHz', -- '2.4GHz', '5GHz', '6GHz'
    channel INT DEFAULT 36,
    security VARCHAR(32) DEFAULT 'wpa2-psk',
    is_dhcp BOOLEAN DEFAULT TRUE,
    static_ip VARCHAR(45),
    static_gateway VARCHAR(45),
    static_dns VARCHAR(45),
    proxy_enabled BOOLEAN DEFAULT FALSE,
    proxy_url VARCHAR(256),
    force_pings_with_proxy BOOLEAN DEFAULT TRUE,
    disable_external BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Test Definitions & Service Templates
CREATE TABLE IF NOT EXISTS test_definitions (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    template VARCHAR(64) NOT NULL, -- 'generic_tcp', 'webserver', 'voip_mos', 'telnet', 'iperf3', 'dns_resolution'
    target VARCHAR(256) NOT NULL,
    port INT DEFAULT 443,
    is_external BOOLEAN DEFAULT TRUE,
    interval_seconds INT DEFAULT 300,
    thresholds JSONB DEFAULT '{"max_latency_ms": 150, "min_mos": 3.8, "min_throughput_mbps": 40, "max_dhcp_ms": 2000, "max_dns_ms": 100}'::jsonb,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Time-Series Test Results
CREATE TABLE IF NOT EXISTS test_results (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sensor_id VARCHAR(64) REFERENCES sensors(id) ON DELETE CASCADE,
    network_id VARCHAR(64),
    test_id VARCHAR(64),
    stage VARCHAR(64) NOT NULL, -- 'ap_scan', 'association', 'dhcp', 'gateway', 'primary_dns', 'secondary_dns', 'external_http', 'service_test'
    success BOOLEAN NOT NULL,
    duration_ms FLOAT DEFAULT 0.0,
    metrics JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_test_results_sensor_time ON test_results (sensor_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_test_results_stage ON test_results (stage);

-- Wi-Fi Telemetry (AP environment, BSSID, RSSI, channel utilization, QBSS client count)
CREATE TABLE IF NOT EXISTS wifi_telemetry (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sensor_id VARCHAR(64) REFERENCES sensors(id) ON DELETE CASCADE,
    bssid VARCHAR(18) NOT NULL,
    ssid VARCHAR(64) NOT NULL,
    channel INT NOT NULL,
    band VARCHAR(16) NOT NULL, -- '2.4GHz', '5GHz', '6GHz'
    rssi INT NOT NULL, -- dBm (e.g. -58)
    snr INT DEFAULT 35,
    noise INT DEFAULT -92,
    channel_utilization INT DEFAULT 28, -- percentage (0-100)
    client_count INT DEFAULT 14,
    vendor_ap_name VARCHAR(128),
    vendor VARCHAR(64) DEFAULT 'Aruba', -- 'Aruba', 'Cisco', 'Mist', 'Extreme'
    security VARCHAR(32) DEFAULT 'wpa2-psk',
    is_connected BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_wifi_telemetry_sensor ON wifi_telemetry (sensor_id, timestamp DESC);

-- Issues (Threshold Violations and Test Failures - Blue convention in UXI)
CREATE TABLE IF NOT EXISTS issues (
    id VARCHAR(64) PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    sensor_id VARCHAR(64) REFERENCES sensors(id) ON DELETE CASCADE,
    network_id VARCHAR(64),
    test_id VARCHAR(64),
    type VARCHAR(32) NOT NULL, -- 'threshold_violation' or 'test_failure'
    severity VARCHAR(32) NOT NULL DEFAULT 'major', -- 'minor', 'major', 'critical'
    title VARCHAR(256) NOT NULL,
    description TEXT,
    metric_name VARCHAR(64),
    observed_value FLOAT,
    threshold_value FLOAT,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active' or 'resolved'
    incident_id VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_issues_status ON issues (status);

-- Incidents (AIOps Correlated Issues - Red convention in UXI)
CREATE TABLE IF NOT EXISTS incidents (
    id VARCHAR(64) PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'open', -- 'open', 'investigating', 'resolved'
    title VARCHAR(256) NOT NULL,
    summary TEXT,
    impact_scope VARCHAR(128),
    affected_networks JSONB DEFAULT '[]'::jsonb,
    affected_sensors JSONB DEFAULT '[]'::jsonb,
    issue_codes JSONB DEFAULT '[]'::jsonb,
    issue_count INT DEFAULT 1,
    severity VARCHAR(32) DEFAULT 'critical'
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status);

-- Automated Triage Reports (Root-cause replay, traceroute, raw command output, packet capture)
CREATE TABLE IF NOT EXISTS triage_reports (
    id VARCHAR(64) PRIMARY KEY,
    issue_id VARCHAR(64),
    sensor_id VARCHAR(64) REFERENCES sensors(id) ON DELETE CASCADE,
    network_id VARCHAR(64),
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    failure_step VARCHAR(64) NOT NULL,
    root_cause_analysis TEXT,
    command_output TEXT,
    traceroute_hops JSONB DEFAULT '[]'::jsonb,
    dora_trace JSONB DEFAULT '{}'::jsonb,
    pcap_filename VARCHAR(256),
    pcap_size_kb INT DEFAULT 0,
    ethernet_comparison JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_triage_issue ON triage_reports (issue_id);

-- System Audit Log
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    action VARCHAR(64) NOT NULL,
    actor VARCHAR(64) DEFAULT 'system',
    details JSONB DEFAULT '{}'::jsonb
);
