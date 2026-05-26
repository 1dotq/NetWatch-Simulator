class NetworkTwinCanvas {
  constructor(canvasId, onNodeSelect) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.onNodeSelect = onNodeSelect;

    this.nodes = [];
    this.links = [];
    this.particles = [];
    this.battleEffects = []; // [{nodeId, team, startTs, duration, particles[], nodeX, nodeY}]
    this.battleArcs    = []; // [{points[], startTs, duration}] — lightning bolt trails
    this.killChainPath    = [];  // [{x,y,nodeId,ts}] ordered attack path
    this.killChainVisible = false;
    this.blastRadiusData  = null;
    this.zeroDayNodes     = null;
    this.segmentationGaps = [];

    // Feature 13: Battle packets
    this.battlePackets        = [];   // [{srcX,srcY,dstX,dstY,t,color,speed}]
    this.battlePacketsVisible = false;

    // Feature 15: Stealth meters
    this.stealthLevels        = {};   // nodeId → 0-100
    this.stealthMetersVisible = false;

    // Feature 22: Idle traffic
    this.idleTrafficVisible   = true;

    // Transform parameters
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;

    // Dragging states
    this.isPanning = false;
    this.dragStart = { x: 0, y: 0 };
    this.selectedNode = null;
    this.hoveredNode = null;
    this.gridSnap = true; // Snap custom deployed elements cleanly to 40px grid by default
    this.draggedNode = null;

    this.loadReactorProject();
    this.setupListeners();
    this.resize();
    this.centerView();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  centerView() {
    if (this.canvas.width < 900) {
      this.scale = Math.max(0.15, (this.canvas.width - 20) / 950);
    } else {
      this.scale = 0.9;
    }
    this.panX = this.canvas.width / 2 - (450 * this.scale);
    this.panY = this.canvas.height / 2 - (380 * this.scale);
  }

  zoom(factor, mouseX, mouseY) {
    const oldScale = this.scale;
    this.scale = Math.max(0.15, Math.min(2.5, this.scale * factor));

    // Zoom to mouse cursor
    if (mouseX !== undefined && mouseY !== undefined) {
      const canvasMouseX = mouseX - this.canvas.offsetLeft;
      const canvasMouseY = mouseY - this.canvas.offsetTop;
      this.panX = canvasMouseX - (canvasMouseX - this.panX) * (this.scale / oldScale);
      this.panY = canvasMouseY - (canvasMouseY - this.panY) * (this.scale / oldScale);
    }
  }

  loadReactorProject() {
    this.nodes = [];
    this.links = [];
    this.particles = [];
    this.selectedNode = null;

    // IT Subnet nodes
    this.nodes.push({
      id: 'IT-GW', name: 'IT Enterprise Gateway', ip: '10.1.10.1', type: 'it', role: 'Router',
      x: 100, y: 150, status: 'stable', firmware: 'v12.4-Secure', os: 'Cisco IOS-XE'
    });
    this.nodes.push({
      id: 'CORP-AD', name: 'Active Directory Server', ip: '10.1.10.3', type: 'it', role: 'AD Server',
      x: 120, y: 50, status: 'stable', firmware: 'Win Server 2022', os: 'Windows NT'
    });
    this.nodes.push({
      id: 'SOC-WS', name: 'SOC Security Workstation', ip: '10.1.10.5', type: 'it', role: 'Workstation',
      x: 100, y: 280, status: 'stable', firmware: 'Arch Linux (Hardened)', os: 'Linux 6.6'
    });
    this.nodes.push({
      id: 'FW-01', name: 'Boundary NextGen Firewall', ip: '10.1.10.2', type: 'it', role: 'Firewall',
      x: 280, y: 150, status: 'stable', firmware: 'v7.2.1-Active', os: 'FortiOS'
    });
    this.nodes.push({
      id: 'ENG-WS', name: 'OT Engineering Console', ip: '10.1.20.10', type: 'it', role: 'Engineer Station',
      x: 350, y: 50, status: 'stable', firmware: 'Win11 Enterprise IoT', os: 'Windows 11', vulnerable: true
    });

    // OT Switch
    this.nodes.push({
      id: 'OT-SW', name: 'OT Industrial Switch', ip: '192.168.1.1', type: 'ot', role: 'Switch',
      x: 450, y: 150, status: 'stable', firmware: 'v5.4.2-OT', os: 'Hirschmann OS'
    });

    // HMI
    this.nodes.push({
      id: 'HMI-01', name: 'Main SCADA HMI Panel', ip: '192.168.1.10', type: 'ot', role: 'SCADA HMI',
      x: 430, y: 280, status: 'stable', firmware: 'Ignition Edge v8.1', os: 'Ubuntu Core'
    });

    // PLCs
    this.nodes.push({
      id: 'PLC-101', name: 'Feed PLC (Inlet Valve)', ip: '192.168.1.101', type: 'plc', role: 'Modbus PLC',
      x: 620, y: 60, status: 'stable', firmware: 'Allen-Bradley Logix5580', os: 'VxWorks'
    });
    this.nodes.push({
      id: 'PLC-102', name: 'Drain PLC (Outlet Valve)', ip: '192.168.1.102', type: 'plc', role: 'Modbus PLC',
      x: 620, y: 180, status: 'stable', firmware: 'Siemens S7-1500', os: 'Embedded RTOS'
    });
    this.nodes.push({
      id: 'PLC-103', name: 'Safety PLC (Relief Valve)', ip: '192.168.1.103', type: 'plc', role: 'Safety Controller',
      x: 620, y: 300, status: 'stable', firmware: 'Schneider Modicon M580', os: 'VxWorks'
    });

    // Field Assets
    this.nodes.push({
      id: 'V-101', name: 'Feed Valve Actuator V-101', ip: 'Slave ID: 0x0A', type: 'field', role: 'Actuator',
      x: 800, y: 60, status: 'stable', firmware: 'Modbus RTU Controller', os: 'ASIC Logic'
    });
    this.nodes.push({
      id: 'V-102', name: 'Drain Valve Actuator V-102', ip: 'Slave ID: 0x0B', type: 'field', role: 'Actuator',
      x: 800, y: 180, status: 'stable', firmware: 'Modbus RTU Controller', os: 'ASIC Logic'
    });
    this.nodes.push({
      id: 'XV-103', name: 'Safety Vent Valve XV-103', ip: 'Slave ID: 0x0C', type: 'field', role: 'Actuator',
      x: 800, y: 300, status: 'stable', firmware: 'Modbus RTU Controller', os: 'ASIC Logic'
    });
    this.nodes.push({
      id: 'T-300', name: 'Reactor Vessel Transmitter', ip: 'Slave ID: 0x0D', type: 'field', role: 'Sensor',
      x: 800, y: 400, status: 'stable', firmware: 'Modbus RTU Level Sensor', os: 'ASIC Logic'
    });

    const connect = (sourceId, targetId, encrypted = true) => {
      this.links.push({ sourceId, targetId, encrypted, status: 'normal' });
    };

    // Connections
    connect('IT-GW', 'FW-01');
    connect('IT-GW', 'SOC-WS');
    connect('IT-GW', 'CORP-AD');
    connect('FW-01', 'ENG-WS', false);
    connect('FW-01', 'OT-SW');
    connect('OT-SW', 'HMI-01');
    connect('OT-SW', 'PLC-101');
    connect('OT-SW', 'PLC-102');
    connect('OT-SW', 'PLC-103');
    connect('PLC-101', 'V-101', false);
    connect('PLC-102', 'V-102', false);
    connect('PLC-103', 'XV-103', false);
    connect('PLC-102', 'T-300', false);
    connect('PLC-103', 'T-300', false);

    if (this.onNodeSelect) this.onNodeSelect(null);
  }

  loadEnterpriseProject() {
    this.nodes = [];
    this.links = [];
    this.particles = [];
    this.selectedNode = null;

    // Multi-Vendor OSPF / BGP MPLS L3VPN Core Lab
    // Core Backbone Nodes (IT subnet category styles)
    this.nodes.push({
      id: 'PE-01', name: 'PE-01 (Cisco IOL)', ip: '1.1.1.1', type: 'it', role: 'Router',
      x: 280, y: 160, status: 'stable', firmware: 'Cisco IOSv 15.9(M)', os: 'Cisco IOL'
    });
    this.nodes.push({
      id: 'P-01', name: 'P-01 (Juniper cRPD)', ip: '2.2.2.2', type: 'it', role: 'Router',
      x: 480, y: 160, status: 'stable', firmware: 'Junos OS Evolved 23.4', os: 'Juniper cRPD'
    });
    this.nodes.push({
      id: 'PE-02', name: 'PE-02 (Arista cEOS)', ip: '3.3.3.3', type: 'it', role: 'Router',
      x: 680, y: 160, status: 'stable', firmware: 'Arista EOS 4.31.2F', os: 'Arista cEOS'
    });

    // Customer Edge Nodes (OT Category styles for clear zone rendering)
    this.nodes.push({
      id: 'CE-01', name: 'CE-01 (Cisco IOL)', ip: '192.168.1.10', type: 'ot', role: 'Router',
      x: 100, y: 280, status: 'stable', firmware: 'Cisco IOSv 15.9(M)', os: 'Cisco IOL'
    });
    this.nodes.push({
      id: 'CE-02', name: 'CE-02 (Arista cEOS)', ip: '192.168.2.10', type: 'ot', role: 'Router',
      x: 850, y: 280, status: 'stable', firmware: 'Arista EOS 4.31.2F', os: 'Arista cEOS'
    });

    // Next-Gen Security Boundary Firewall (PLC category color code)
    this.nodes.push({
      id: 'FW-01', name: 'FW-01 (Palo Alto)', ip: '10.1.10.1', type: 'plc', role: 'Firewall',
      x: 480, y: 320, status: 'stable', firmware: 'PAN-OS v11.0.2', os: 'Palo Alto PAN-OS'
    });

    const connect = (sourceId, targetId, encrypted = true) => {
      this.links.push({ sourceId, targetId, encrypted, status: 'normal' });
    };

    // Connections establishing MPLS L3VPN network path
    connect('CE-01', 'PE-01', false);
    connect('PE-01', 'P-01', true);
    connect('P-01', 'PE-02', true);
    connect('PE-02', 'CE-02', false);
    connect('PE-01', 'FW-01', false);
    connect('PE-02', 'FW-01', false);

    if (this.onNodeSelect) this.onNodeSelect(null);
  }

  loadPurdueProject() {
    this.nodes = [];
    this.links = [];
    this.particles = [];
    this.selectedNode = null;

    // Level 4 (Corporate IT)
    this.nodes.push({ id: 'IT-CORE-RT', name: 'IT Core Router', ip: '10.4.0.1', type: 'it', role: 'Router', x: 100, y: 70, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' });
    this.nodes.push({ id: 'IT-AD-SRV', name: 'IT Active Directory Server', ip: '10.4.0.10', type: 'it', role: 'AD Server', x: 200, y: 70, status: 'stable', firmware: 'Win Server 2022', os: 'Windows NT' });
    this.nodes.push({ id: 'ENT-HIST', name: 'Enterprise Historian', ip: '10.4.0.20', type: 'it', role: 'Server', x: 300, y: 70, status: 'stable', firmware: 'AVEVA Historian v2023', os: 'Windows NT' });

    // Level 3.5 (IDMZ)
    this.nodes.push({ id: 'IDMZ-FW', name: 'IT/OT Edge Firewall', ip: '10.35.0.1', type: 'it', role: 'Firewall', x: 200, y: 160, status: 'stable', firmware: 'FortiOS v7.4.1', os: 'FortiOS' });
    this.nodes.push({ id: 'JUMP-HOST', name: 'Windows Jump Host', ip: '10.35.0.10', type: 'it', role: 'Workstation', x: 100, y: 240, status: 'stable', firmware: 'Windows 11 IoT', os: 'Windows 11' });
    this.nodes.push({ id: 'PATCH-SRV', name: 'Patch Server', ip: '10.35.0.20', type: 'it', role: 'Server', x: 200, y: 240, status: 'stable', firmware: 'Apt-Cacher-NG v3.7', os: 'Ubuntu Server' });
    this.nodes.push({ id: 'OT-IDS', name: 'OT Security Monitor (IDS)', ip: '10.35.0.30', type: 'it', role: 'Workstation', x: 300, y: 240, status: 'stable', firmware: 'Security Onion v2.4', os: 'CentOS' });

    // Level 3 (Site Operations - OT Zone)
    this.nodes.push({ id: 'SITE-CORE-SW', name: 'Site Core Switch', ip: '10.3.0.2', type: 'ot', role: 'Switch', x: 460, y: 150, status: 'stable', firmware: 'Cisco Catalyst 9300', os: 'Cisco IOS-XE' });
    this.nodes.push({ id: 'SCADA-MASTER', name: 'SCADA Master', ip: '10.3.0.10', type: 'ot', role: 'SCADA HMI', x: 460, y: 60, status: 'stable', firmware: 'Ignition Edge v8.1', os: 'Ubuntu Core' });
    this.nodes.push({ id: 'EWS-ENG', name: 'Engineering Workstation', ip: '10.3.0.20', type: 'ot', role: 'Workstation', x: 560, y: 60, status: 'stable', firmware: 'Win11 Enterprise IoT', os: 'Windows 11' });
    this.nodes.push({ id: 'PLANT-HIST', name: 'Plant Historian', ip: '10.3.0.30', type: 'ot', role: 'Server', x: 660, y: 60, status: 'stable', firmware: 'AVEVA Historian v2023', os: 'Windows NT' });

    // Level 1/2 (Site Control - OT Zone)
    this.nodes.push({ id: 'CELL-SW-1', name: 'Cell Switch 1', ip: '10.2.1.1', type: 'ot', role: 'Switch', x: 560, y: 180, status: 'stable', firmware: 'Hirschmann OS v5.4', os: 'Hirschmann OS' });
    this.nodes.push({ id: 'CELL-SW-2', name: 'Cell Switch 2', ip: '10.2.2.1', type: 'ot', role: 'Switch', x: 560, y: 280, status: 'stable', firmware: 'Hirschmann OS v5.4', os: 'Hirschmann OS' });
    this.nodes.push({ id: 'PROC-PLC', name: 'Process PLC', ip: '10.2.1.10', type: 'plc', role: 'Modbus PLC', x: 680, y: 140, status: 'stable', firmware: 'Allen-Bradley Logix5580', os: 'VxWorks' });
    this.nodes.push({ id: 'SAFE-PLC', name: 'Safety PLC', ip: '10.2.1.20', type: 'plc', role: 'Safety Controller', x: 680, y: 220, status: 'stable', firmware: 'Schneider Modicon M580', os: 'VxWorks' });
    this.nodes.push({ id: 'RTU-CTRL', name: 'Remote Terminal Unit', ip: '10.2.2.10', type: 'plc', role: 'Modbus PLC', x: 680, y: 320, status: 'stable', firmware: 'Siemens S7-1500', os: 'Embedded RTOS' });

    // Level 0 (Field Devices - OT Zone)
    this.nodes.push({ id: 'FLOW-VALVE', name: 'Smart Flow Valve', ip: 'Slave 1', type: 'field', role: 'Actuator', x: 820, y: 50, status: 'stable', firmware: 'Modbus RTU v1.0', os: 'ASIC Logic' });
    this.nodes.push({ id: 'VFD-DRIVE', name: 'VFD Drive', ip: 'Slave 2', type: 'field', role: 'Actuator', x: 820, y: 90, status: 'stable', firmware: 'Modbus RTU v1.0', os: 'ASIC Logic' });
    this.nodes.push({ id: 'PRES-SENS', name: 'Pressure Sensor', ip: 'Slave 3', type: 'field', role: 'Sensor', x: 820, y: 130, status: 'stable', firmware: 'Modbus RTU v1.0', os: 'ASIC Logic' });
    this.nodes.push({ id: 'TEMP-SENS', name: 'Temperature Sensor', ip: 'Slave 4', type: 'field', role: 'Sensor', x: 820, y: 170, status: 'stable', firmware: 'Modbus RTU v1.0', os: 'ASIC Logic' });
    this.nodes.push({ id: 'LEVEL-SENS', name: 'Level Sensor', ip: 'Slave 5', type: 'field', role: 'Sensor', x: 820, y: 210, status: 'stable', firmware: 'Modbus RTU v1.0', os: 'ASIC Logic' });
    this.nodes.push({ id: 'ESTOP-RELAY', name: 'E-Stop Relay', ip: 'Slave 6', type: 'field', role: 'Sensor', x: 820, y: 260, status: 'stable', firmware: 'Modbus RTU v1.0', os: 'ASIC Logic' });
    this.nodes.push({ id: 'PUMP-A', name: 'Motorized Pump A', ip: 'Slave 7', type: 'field', role: 'Actuator', x: 820, y: 310, status: 'stable', firmware: 'Modbus RTU v1.0', os: 'ASIC Logic' });
    this.nodes.push({ id: 'PUMP-B', name: 'Motorized Pump B', ip: 'Slave 8', type: 'field', role: 'Actuator', x: 820, y: 350, status: 'stable', firmware: 'Modbus RTU v1.0', os: 'ASIC Logic' });
    this.nodes.push({ id: 'FLOW-METER', name: 'Flow Meter', ip: 'Slave 9', type: 'field', role: 'Sensor', x: 820, y: 390, status: 'stable', firmware: 'Modbus RTU v1.0', os: 'ASIC Logic' });

    const connect = (sourceId, targetId, encrypted = true) => {
      this.links.push({ sourceId, targetId, encrypted, status: 'normal' });
    };

    // Cabling Logic
    connect('IT-AD-SRV', 'IT-CORE-RT');
    connect('ENT-HIST', 'IT-CORE-RT');
    connect('IT-CORE-RT', 'IDMZ-FW');
    connect('JUMP-HOST', 'IDMZ-FW');
    connect('PATCH-SRV', 'IDMZ-FW');
    connect('OT-IDS', 'IDMZ-FW');
    connect('SITE-CORE-SW', 'IDMZ-FW');
    connect('SCADA-MASTER', 'SITE-CORE-SW');
    connect('EWS-ENG', 'SITE-CORE-SW');
    connect('PLANT-HIST', 'SITE-CORE-SW');
    connect('CELL-SW-1', 'SITE-CORE-SW');
    connect('CELL-SW-2', 'SITE-CORE-SW');
    connect('PROC-PLC', 'CELL-SW-1');
    connect('SAFE-PLC', 'CELL-SW-1');
    connect('RTU-CTRL', 'CELL-SW-2');
    connect('FLOW-VALVE', 'PROC-PLC', false);
    connect('VFD-DRIVE', 'PROC-PLC', false);
    connect('PRES-SENS', 'PROC-PLC', false);
    connect('TEMP-SENS', 'PROC-PLC', false);
    connect('LEVEL-SENS', 'PROC-PLC', false);
    connect('PUMP-A', 'RTU-CTRL', false);
    connect('PUMP-B', 'RTU-CTRL', false);
    connect('FLOW-METER', 'RTU-CTRL', false);
    connect('ESTOP-RELAY', 'SAFE-PLC', false);

    if (this.onNodeSelect) this.onNodeSelect(null);
  }

  loadBlankProject() {
    this.nodes = [];
    this.links = [];
    this.particles = [];
    this.selectedNode = null;
    if (this.onNodeSelect) this.onNodeSelect(null);
  }

  loadWaterTreatmentProject() {
    const nodes = [
      { id: 'PUMP-01', name: 'Intake Pump Controller', type: 'plc', role: 'Intake Pump Controller', x: 120, y: 140, ip: '10.2.10.101', os: 'VxWorks 7', status: 'stable' },
      { id: 'FILTER-01', name: 'Sand Filter RTU', type: 'plc', role: 'Sand Filter RTU', x: 280, y: 140, ip: '10.2.10.102', os: 'VxWorks 7', status: 'stable' },
      { id: 'CHLOR-01', name: 'Chlorine Dosing PLC', type: 'plc', role: 'Chlorine Dosing PLC', x: 440, y: 140, ip: '10.2.10.103', os: 'VxWorks 7', status: 'stable' },
      { id: 'RES-01', name: 'Reservoir Level RTU', type: 'plc', role: 'Reservoir Level RTU', x: 600, y: 140, ip: '10.2.10.104', os: 'VxWorks 7', status: 'stable' },
      { id: 'RTU-01', name: 'Field RTU Gateway', type: 'router', role: 'Field RTU Gateway', x: 360, y: 260, ip: '10.2.10.1', os: 'IEC 61131', status: 'stable' },
      { id: 'HMI-WT', name: 'SCADA HMI', type: 'workstation', role: 'SCADA HMI', x: 360, y: 380, ip: '10.2.20.5', os: 'Windows LTSC 2021', status: 'stable' },
      { id: 'FW-WT', name: 'OT Firewall', type: 'firewall', role: 'OT Firewall', x: 360, y: 490, ip: '10.2.1.1', os: 'FortiOS 7.x', status: 'stable' },
      { id: 'HIST-WT', name: 'PI Historian', type: 'workstation', role: 'PI Historian', x: 560, y: 380, ip: '10.2.20.20', os: 'OSIsoft PI Server 2023', status: 'stable' },
    ];
    const rawLinks = [
      { from: 'PUMP-01', to: 'RTU-01', protocol: 'MODBUS', speed: 100 },
      { from: 'FILTER-01', to: 'RTU-01', protocol: 'MODBUS', speed: 100 },
      { from: 'CHLOR-01', to: 'RTU-01', protocol: 'MODBUS', speed: 100 },
      { from: 'RES-01', to: 'RTU-01', protocol: 'DNP3', speed: 100 },
      { from: 'RTU-01', to: 'HMI-WT', protocol: 'OPC-UA', speed: 1000 },
      { from: 'HMI-WT', to: 'FW-WT', protocol: 'HTTPS', speed: 1000 },
      { from: 'HMI-WT', to: 'HIST-WT', protocol: 'OPC-DA', speed: 1000 },
    ];
    this.nodes = nodes;
    this.links = rawLinks.map(l => ({ ...l, sourceId: l.from, targetId: l.to, status: 'normal' }));
    this.particles = [];
    this.selectedNode = null;
    if (this.onNodeSelect) this.onNodeSelect(null);
  }

  loadPowerGridProject() {
    const nodes = [
      { id: 'SCADA-DMS', name: 'Energy Management System', type: 'workstation', role: 'SCADA HMI', x: 360, y: 80, ip: '10.3.20.10', os: 'OSIsoft PI 2023', status: 'stable' },
      { id: 'HMI-GRID', name: 'SCADA HMI Workstation', type: 'workstation', role: 'SCADA HMI Workstation', x: 560, y: 80, ip: '10.3.20.11', os: 'Windows LTSC 2021', status: 'stable' },
      { id: 'RELAY-01', name: 'Distance Protection Relay', type: 'sis', role: 'Distance Protection Relay', x: 140, y: 200, ip: '10.3.10.21', os: 'SEL-421 Firmware', status: 'stable' },
      { id: 'RELAY-02', name: 'Overcurrent Relay (Feeder B)', type: 'sis', role: 'Overcurrent Relay', x: 360, y: 200, ip: '10.3.10.22', os: 'SEL-351 Firmware', status: 'stable' },
      { id: 'RELAY-03', name: 'Bus Differential Relay', type: 'sis', role: 'Bus Differential Relay', x: 580, y: 200, ip: '10.3.10.23', os: 'GE D60 Firmware', status: 'stable' },
      { id: 'RTU-GRID', name: 'Substation RTU Gateway', type: 'router', role: 'Substation RTU Gateway', x: 360, y: 320, ip: '10.3.10.1', os: 'IEC 61850 / DNP3', status: 'stable' },
      { id: 'HIST-GRID', name: 'PI Historian (Grid)', type: 'workstation', role: 'PI Historian', x: 580, y: 380, ip: '10.3.20.50', os: 'OSIsoft PI Server', status: 'stable' },
      { id: 'FW-GRID', name: 'OT Perimeter Firewall', type: 'firewall', role: 'OT Firewall', x: 360, y: 450, ip: '10.3.1.1', os: 'Palo Alto PAN-OS', status: 'stable' },
      { id: 'CORP-JUMP', name: 'Jump Server / IT Bridge', type: 'workstation', role: 'Jump Server', x: 140, y: 450, ip: '10.3.1.20', os: 'Windows Server 2022', status: 'stable' },
      { id: 'ATK-GRID', name: 'Attacker Workstation', type: 'workstation', role: 'Attacker Workstation', x: 140, y: 560, ip: '10.3.1.99', os: 'Kali Linux 2024', status: 'compromised' },
    ];
    const rawLinks = [
      { from: 'RELAY-01', to: 'RTU-GRID', protocol: 'IEC-61850', speed: 100 },
      { from: 'RELAY-02', to: 'RTU-GRID', protocol: 'IEC-61850', speed: 100 },
      { from: 'RELAY-03', to: 'RTU-GRID', protocol: 'IEC-61850', speed: 100 },
      { from: 'RTU-GRID', to: 'SCADA-DMS', protocol: 'DNP3', speed: 1000 },
      { from: 'RTU-GRID', to: 'HMI-GRID', protocol: 'OPC-UA', speed: 1000 },
      { from: 'HMI-GRID', to: 'HIST-GRID', protocol: 'OPC-DA', speed: 1000 },
      { from: 'RTU-GRID', to: 'FW-GRID', protocol: 'HTTPS', speed: 1000 },
      { from: 'FW-GRID', to: 'CORP-JUMP', protocol: 'HTTPS', speed: 1000 },
      { from: 'ATK-GRID', to: 'CORP-JUMP', protocol: 'SSH', speed: 1000, status: 'active' },
    ];
    this.nodes = nodes;
    this.links = rawLinks.map(l => ({ ...l, sourceId: l.from, targetId: l.to, status: l.status || 'normal' }));
    this.particles = [];
    this.selectedNode = null;
    if (this.onNodeSelect) this.onNodeSelect(null);
  }

  loadLabTopology(topology) {
    this.nodes = [];
    this.links = [];
    this.particles = [];
    this.selectedNode = null;
    if (!topology) return;
    topology.nodes.forEach(n => {
      // Normalise status: 'online' → 'stable' so color logic works correctly
      const status = n.status === 'online' ? 'stable' : (n.status || 'stable');
      this.nodes.push({ ...n, name: n.name || n.label || n.id, status });
    });
    topology.links.forEach(l => {
      // Normalise from/to → sourceId/targetId, and string speeds → numeric Mbps
      const sourceId = l.sourceId || l.from;
      const targetId = l.targetId || l.to;
      const speed = this._parseSpeed(l.speed);
      this.links.push({ ...l, sourceId, targetId, speed, status: l.status || 'normal' });
    });
    if (this.onNodeSelect) this.onNodeSelect(null);
  }

  // Convert '100M' → 100, '1G' → 1000, '10G' → 10000, numeric passthrough
  _parseSpeed(s) {
    if (!s) return undefined;
    if (typeof s === 'number') return s;
    const str = String(s).toUpperCase();
    if (str.endsWith('G')) return parseFloat(str) * 1000;
    if (str.endsWith('M')) return parseFloat(str);
    return parseFloat(str) || undefined;
  }

  setupListeners() {
    const getCoords = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };

    // coordinate helpers are now defined as class methods

    // MouseDown / TouchStart
    const startDrag = (e) => {
      const coords = getCoords(e);
      const world = this.toWorld(coords.x, coords.y);
      const node = this.getDeviceAt(world.x, world.y);

      // Check if clicked a packet particle (Feature 24 - Wireshark-lite)
      if (this.particles && this.particles.length > 0) {
        const clickedPacket = this.particles.find(p => {
          const dx = p.x - world.x;
          const dy = p.y - world.y;
          return Math.sqrt(dx * dx + dy * dy) < 12; // 12px touch radius
        });

        if (clickedPacket) {
          window.appInstance.openPacketInspector(clickedPacket);
          e.preventDefault();
          return;
        }
      }

      // INTERCEPT FOR ACTIVE PLACEMENT / LINKING TOOL!
      if (window.appInstance && window.appInstance.activePlacementTool) {
        e.preventDefault();
        const tool = window.appInstance.activePlacementTool;

        if (tool === 'delete') {
          if (node) {
            window.appInstance.deleteCustomDevice(node);
          } else {
            const link = this.getLinkAt(world.x, world.y);
            if (link) {
              window.appInstance.deleteCustomLink(link);
            }
          }
          return;
        }

        if (tool === 'cable') {
          if (node) {
            if (!this.linkingSourceNode) {
              // Select first node for cabling
              this.linkingSourceNode = node;
              window.appInstance.orchestrator.logSystem(`Cabling: Connect wire starting from asset [${node.id}]...`, 'info');
            } else if (this.linkingSourceNode.id !== node.id) {
              // Link first node to second node!
              const exists = this.links.some(l =>
                (l.sourceId === this.linkingSourceNode.id && l.targetId === node.id) ||
                (l.sourceId === node.id && l.targetId === this.linkingSourceNode.id)
              );

              if (exists) {
                window.appInstance.orchestrator.logSystem(`Cabling error: A network link already connects these two devices!`, 'danger');
              } else {
                // Call UI interface selector prompt! (Feature 22)
                const srcNode = this.linkingSourceNode;
                const dstNode = node;
                window.appInstance.promptForCablingInterfaces(srcNode, dstNode, (srcInt, dstInt) => {
                  this.links.push({
                    sourceId: srcNode.id,
                    targetId: dstNode.id,
                    sourceInterface: srcInt,
                    targetInterface: dstInt,
                    status: 'normal',
                    speed: 100
                  });
                  window.appInstance.orchestrator.logSystem(`Cabling: Physical connection created between [${srcNode.id}] (${srcInt}) and [${dstNode.id}] (${dstInt}).`, 'success');
                  window.appInstance.saveState();
                  this.draw();
                });
                this.linkingSourceNode = null;
              }
              this.draw();
            }
          } else {
            // Cancel linking on empty space click
            this.linkingSourceNode = null;
          }
        } else {
          // Device deployment!
          window.appInstance.deployCustomDevice(tool, world.x, world.y);
        }
        return;
      }

      if (node) {
        this.draggedNode = node;
        this.selectedNode = node;
        this.onNodeSelect(node);
      } else {
        this.isPanning = true;
        this.dragStart = { x: coords.x - this.panX, y: coords.y - this.panY };
      }
    };

    // MouseMove / TouchMove
    const moveDrag = (e) => {
      const coords = getCoords(e);
      const world = this.toWorld(coords.x, coords.y);
      this.mouseWorldPos = world;

      if (this.draggedNode) {
        const snapSize = 40;
        if (this.gridSnap || (e && e.shiftKey)) {
          this.draggedNode.x = Math.round(world.x / snapSize) * snapSize;
          this.draggedNode.y = Math.round(world.y / snapSize) * snapSize;
        } else {
          this.draggedNode.x = world.x;
          this.draggedNode.y = world.y;
        }
      } else if (this.isPanning) {
        this.panX = coords.x - this.dragStart.x;
        this.panY = coords.y - this.dragStart.y;
      } else {
        this.hoveredNode = this.getDeviceAt(world.x, world.y);

        // Custom Cursor styling during active tools
        if (window.appInstance && window.appInstance.activePlacementTool) {
          this.canvas.style.cursor = window.appInstance.activePlacementTool === 'cable' ? 'crosshair' : 'copy';
        } else {
          this.canvas.style.cursor = this.hoveredNode ? 'pointer' : (this.isPanning ? 'grabbing' : 'grab');
        }
      }

      // Force redrawing the dashed link wire while moving the mouse!
      if (this.linkingSourceNode) {
        this.draw();
      }
    };

    // MouseUp / TouchEnd
    const stopDrag = () => {
      if (this.draggedNode && window.appInstance) {
        window.appInstance.saveState();
      }
      this.draggedNode = null;
      this.isPanning = false;
    };

    this.canvas.addEventListener('mousedown', startDrag);
    this.canvas.addEventListener('mousemove', moveDrag);
    this.canvas.addEventListener('mouseup', stopDrag);
    this.canvas.addEventListener('mouseleave', stopDrag);

    // Double-click cable link snip/repair controller (Double-Click Cable Interactivity!)
    this.canvas.addEventListener('dblclick', (e) => {
      const coords = getCoords(e);
      const world = this.toWorld(coords.x, coords.y);
      const link = this.getLinkAt(world.x, world.y);
      if (link) {
        if (link.status === 'offline') {
          link.status = 'normal';
          window.appInstance.orchestrator.logSystem(`Cable interface double-click: Physical link between [${link.sourceId}] and [${link.targetId}] repaired successfully.`, 'success');
        } else {
          link.status = 'offline';
          window.appInstance.orchestrator.logSystem(`Cable interface double-click: Snipped physical link between [${link.sourceId}] and [${link.targetId}] (Simulated Physical Severance).`, 'warning');
        }
        if (window.appInstance) {
          window.appInstance.saveState();
        }
        this.draw();
      }
    });

    this.canvas.addEventListener('touchstart', startDrag, { passive: true });
    this.canvas.addEventListener('touchmove', moveDrag, { passive: true });
    this.canvas.addEventListener('touchend', stopDrag);

    // Zoom listener
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      this.zoom(zoomFactor, e.clientX, e.clientY);
    }, { passive: false });

    // Handle zoom overlay buttons
    document.getElementById('btnZoomIn').onclick = () => this.zoom(1.15);
    document.getElementById('btnZoomOut').onclick = () => this.zoom(0.85);
    document.getElementById('btnResetZoom').onclick = () => {
      this.centerView();
      this.selectedNode = null;
      this.onNodeSelect?.(null);
      this.draw();
    };

    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.resize();
        this.draw();
      }, 100);
    });
  }

  // OSPF Dijkstra Path Routing Solver (Feature 26)
  solveDijkstraPath(sourceId, targetId) {
    const nodes = this.nodes;
    const links = this.links.filter(l => l.status !== 'offline' && l.status !== 'isolated');

    const dist = {};
    const prev = {};
    const queue = [];

    nodes.forEach(n => {
      dist[n.id] = Infinity;
      prev[n.id] = null;
      queue.push(n.id);
    });

    dist[sourceId] = 0;

    while (queue.length > 0) {
      queue.sort((a, b) => dist[a] - dist[b]);
      const u = queue.shift();

      if (u === targetId) break;
      if (dist[u] === Infinity) break;

      const neighbors = [];
      links.forEach(l => {
        if (l.sourceId === u) neighbors.push(l.targetId);
        else if (l.targetId === u) neighbors.push(l.sourceId);
      });

      neighbors.forEach(v => {
        if (queue.includes(v)) {
          const alt = dist[u] + 1;
          if (alt < dist[v]) {
            dist[v] = alt;
            prev[v] = u;
          }
        }
      });
    }

    const path = [];
    let curr = targetId;
    if (prev[curr] || curr === sourceId) {
      while (curr) {
        path.unshift(curr);
        curr = prev[curr];
      }
    }
    return path.length > 1 ? path : null;
  }

  // Trigger visual traffic particle flow along links
  spawnPacket(sourceNode, targetNode, type = 'normal', path = null) {
    const src = typeof sourceNode === 'string' ? this.nodes.find(n => n.id === sourceNode) : sourceNode;
    const dst = typeof targetNode === 'string' ? this.nodes.find(n => n.id === targetNode) : targetNode;
    if (!src || !dst) return;

    this.particles.push({
      x: src.x,
      y: src.y,
      source: src,
      target: dst,
      progress: 0,
      speed: 0.015 + Math.random() * 0.01,
      type: type, // normal, threat, mitigation
      path: path,
      currentHopIndex: 0
    });
  }

  update(speedDilation) {
    // Generate organic network chatter using OSPF dynamic pathing (Feature 26)
    const isEco = document.body.classList.contains('perf-mode-eco');
    const spawnThreshold = isEco ? 0.03 : 0.15;
    if (Math.random() < spawnThreshold * speedDilation && this.nodes.length > 1) {
      const src = this.nodes[Math.floor(Math.random() * this.nodes.length)];
      const tgt = this.nodes[Math.floor(Math.random() * this.nodes.length)];
      if (src && tgt && src.id !== tgt.id) {
        const path = this.solveDijkstraPath(src.id, tgt.id);
        if (path) {
          const firstSrc = this.nodes.find(n => n.id === path[0]);
          const firstTgt = this.nodes.find(n => n.id === path[1]);
          const isThreat = path.some(nodeId => {
            const n = this.nodes.find(d => d.id === nodeId);
            return n && n.status === 'compromised';
          });
          this.spawnPacket(firstSrc, firstTgt, isThreat ? 'threat' : 'normal', path);
        }
      }
    }

    // Update traffic particles statefully along network hops
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.progress += p.speed * speedDilation;

      if (p.progress >= 1.0) {
        if (p.path && p.currentHopIndex < p.path.length - 2) {
          p.currentHopIndex++;
          const nextSrcId = p.path[p.currentHopIndex];
          const nextTgtId = p.path[p.currentHopIndex + 1];
          const nextSrc = this.nodes.find(n => n.id === nextSrcId);
          const nextTgt = this.nodes.find(n => n.id === nextTgtId);
          if (nextSrc && nextTgt) {
            p.source = nextSrc;
            p.target = nextTgt;
            p.progress = 0;
            p.x = nextSrc.x;
            p.y = nextSrc.y;
          } else {
            this.particles.splice(i, 1);
          }
        } else {
          this.particles.splice(i, 1);
        }
      } else {
        // Linear interpolation for coordinate calculation
        p.x = p.source.x + (p.target.x - p.source.x) * p.progress;
        p.y = p.source.y + (p.target.y - p.source.y) * p.progress;
      }
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.scale, this.scale);

    // 0.5 Purdue Model Zone Overlay
    if (this.showPurdueOverlay) this.drawPurdueOverlay();

    // 1. Draw Network Subnet Borders
    this.drawSubnetGrid();

    // 1.2 Animated Sonar Radar Wave sweep line (Security Audit Scanner!)
    if (!this.scanLineX) this.scanLineX = 0;
    this.scanLineX = (this.scanLineX + 1.2) % 1050;
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(0, 212, 255, 0.07)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(this.scanLineX, 20);
    this.ctx.lineTo(this.scanLineX, 440);
    this.ctx.stroke();

    // scanner leading edge pulse glow
    this.ctx.fillStyle = 'rgba(0, 212, 255, 0.012)';
    this.ctx.fillRect(this.scanLineX - 55, 20, 55, 420);
    this.ctx.restore();

    // 1.5 Draw Metallic DIN rails cabinet mockups behind OT cabinet nodes (DIN Rails Upgrade!)
    this.drawDinRails();

    // 1.7 Draw Server Cabinet outlines behind IT server nodes (Server Cabinets Upgrade!)
    this.drawServerCabinets();

    // 1.8 Draw physical industrial plant components (Reactor tower and fluid flow pipes)
    this.drawPhysicalPlant();

    // 2. Draw Connections/Bridges
    this.links.forEach(link => {
      const src = this.nodes.find(n => n.id === link.sourceId);
      const tgt = this.nodes.find(n => n.id === link.targetId);
      if (src && tgt) {
        this.drawLink(src, tgt, link);
      }
    });

    // 3. Draw Packet Stream particles
    this.particles.forEach(p => {
      this.drawPacket(p);
    });

    // 3.5 Draw active linking wire if in cable placement mode
    if (this.linkingSourceNode && this.mouseWorldPos) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.linkingSourceNode.x, this.linkingSourceNode.y);
      this.ctx.lineTo(this.mouseWorldPos.x, this.mouseWorldPos.y);
      this.ctx.strokeStyle = '#6b9fe4';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // 4. Draw Device Nodes
    this.nodes.forEach(node => {
      this.drawNode(node);
    });

    // 4.5 Battle effect overlays (attack/defend flashes)
    this._drawBattleEffects();

    // 4.6 Evolution heat map overlay
    if (this.evolutionHeatMap) this._drawEvolutionHeatMap();

    // 4.7 Kill chain trail
    if (this.killChainVisible) this._drawKillChainTrail();

    // 4.8 Blast radius
    if (this.blastRadiusData) this._drawBlastRadius();

    // 4.9 Zero-day surface
    if (this.zeroDayNodes?.size) this._drawZeroDaySurface();

    // 4.91 Segmentation gaps
    if (this.segmentationGaps?.length) this._drawSegmentationGaps();

    // 4.92 Idle traffic animation (Feature 22)
    if (this.idleTrafficVisible) this._drawIdleTraffic();

    // 4.93 Battle packets (Feature 13)
    if (this.battlePacketsVisible) this._drawBattlePackets();

    // 4.94 Stealth meters (Feature 15)
    if (this.stealthMetersVisible) this._drawStealthMeters();

    // 5. Draw Interactive Hover Tooltips (Cisco Telemetry Overlay Upgrades!)
    if (this.hoveredNode) {
      this.drawHoverTooltip(this.hoveredNode);
    }

    this.ctx.restore();
  }

  drawPurdueOverlay() {
    const ctx = this.ctx;
    ctx.save();

    // Purdue Model levels drawn as horizontal bands across the canvas viewport
    const W = 1050, startX = 10;
    const levels = [
      { label: 'Level 5 — Enterprise Network / Cloud / Internet', y: 0, h: 55, bg: 'rgba(37,99,235,0.07)', border: 'rgba(37,99,235,0.25)' },
      { label: 'Level 4 — Business Logistics / Corporate IT', y: 55, h: 60, bg: 'rgba(99,102,241,0.07)', border: 'rgba(99,102,241,0.25)' },
      { label: 'Level 3 — Site Operations / MES / Historian', y: 115, h: 65, bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.22)' },
      { label: 'Level 3.5 — Industrial DMZ / Data Diode', y: 180, h: 45, bg: 'rgba(210,153,34,0.07)', border: 'rgba(210,153,34,0.30)', dashed: true },
      { label: 'Level 2 — SCADA / HMI / Supervisory Control', y: 225, h: 65, bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.22)' },
      { label: 'Level 1 — Basic Control / PLCs / RTUs / DCS', y: 290, h: 70, bg: 'rgba(248,81,73,0.06)', border: 'rgba(248,81,73,0.22)' },
      { label: 'Level 0 — Physical Process / Field Devices', y: 360, h: 80, bg: 'rgba(239,68,68,0.04)', border: 'rgba(239,68,68,0.18)' },
    ];

    levels.forEach(lv => {
      ctx.fillStyle = lv.bg;
      ctx.fillRect(startX, lv.y + 20, W, lv.h);

      ctx.strokeStyle = lv.border;
      ctx.lineWidth = 1;
      if (lv.dashed) ctx.setLineDash([6, 4]);
      else ctx.setLineDash([]);
      ctx.beginPath();
      ctx.rect(startX, lv.y + 20, W, lv.h);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = lv.border.replace(/[\d.]+\)$/, '0.85)');
      ctx.font = '700 8px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(lv.label, startX + 8, lv.y + 32);
    });

    ctx.restore();
  }

  drawSubnetGrid() {
    // Zone overlays disabled — topology-aware labs span both zones
    return;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '700 9px var(--font-sans), sans-serif';
    ctx.textAlign = 'center';

    // #20 — IT Zone gradient fill
    const itGrad = ctx.createLinearGradient(20, 20, 400, 20);
    itGrad.addColorStop(0, 'rgba(17,37,69,0.45)');
    itGrad.addColorStop(1, 'rgba(17,24,39,0.35)');
    ctx.strokeStyle = 'rgba(45, 125, 210, 0.22)';
    ctx.fillStyle = itGrad;
    ctx.lineWidth = 1;
    this.drawRoundedRect(20, 20, 380, 420, 10, true, true);

    // Inner border highlight at top of IT zone
    ctx.strokeStyle = 'rgba(45,125,210,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 21); ctx.lineTo(390, 21);
    ctx.stroke();

    ctx.fillStyle = '#6b9fe4';
    ctx.font = '700 9px var(--font-sans), sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('IT ENTERPRISE NETWORK ZONE', 210, 38);

    // #25 — IT zone watermark
    ctx.save();
    ctx.font = '700 28px var(--font-sans), sans-serif';
    ctx.fillStyle = 'rgba(100,159,228,0.04)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('IT ZONE', 210, 230);
    ctx.restore();

    // #20 — OT Zone gradient fill
    const otGrad = ctx.createLinearGradient(410, 20, 1010, 20);
    otGrad.addColorStop(0, 'rgba(30,14,69,0.45)');
    otGrad.addColorStop(1, 'rgba(14,20,40,0.35)');
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.20)';
    ctx.fillStyle = otGrad;
    this.drawRoundedRect(410, 20, 600, 420, 10, true, true);

    // Inner border highlight at top of OT zone
    ctx.strokeStyle = 'rgba(139,92,246,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(420, 21); ctx.lineTo(1000, 21);
    ctx.stroke();

    ctx.fillStyle = '#a78bfa';
    ctx.font = '700 9px var(--font-sans), sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OT INDUSTRIAL ICS NETWORK ZONE & PROCESS TWIN', 710, 38);

    // #25 — OT zone watermark
    ctx.save();
    ctx.font = '700 28px var(--font-sans), sans-serif';
    ctx.fillStyle = 'rgba(167,139,250,0.04)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OT ZONE', 710, 230);
    ctx.restore();

    ctx.restore();
  }

  drawPhysicalPlant() {
    if (!window.appInstance) return;
    const type = window.appInstance.activeProjectType;
    const ctx = this.ctx;

    // Only render when the default template physical-plant nodes are present.
    // Custom lab topologies don't have these nodes so the vessel + pipes would
    // float at wrong coordinates and overlap unrelated nodes.
    const hasReactorNodes = this.nodes.some(n => n.id === 'V-101' || n.id === 'T-300');
    const hasWaterNodes   = this.nodes.some(n => n.id === 'HMI-WT');
    if (type === 'reactor' && !hasReactorNodes) return;
    if (type === 'water'   && !hasWaterNodes)   return;

    if (type === 'reactor') {
      const sim = window.appInstance.sim;
      if (!sim) return;

      ctx.save();

      // 1. Define Reactor Vessel Dimensions & Coordinates
      const rx = 910;
      const ry = 50;
      const rw = 80;
      const rh = 360;

      // 2. Draw animated fluid inside the Reactor Vessel based on sim.level
      const liquidLevelHeight = (sim.level / 100) * (rh - 40);
      const liquidY = ry + rh - 20 - liquidLevelHeight;

      // Dynamic color matching temperature
      let liquidColor = 'rgba(45, 125, 210, 0.45)'; // Cyber Cyan
      let liquidGlow = 'rgba(45, 125, 210, 0.15)';
      if (sim.temp > 75) {
        liquidColor = 'rgba(239, 68, 68, 0.5)'; // Hot Red
        liquidGlow = 'rgba(239, 68, 68, 0.2)';
      } else if (sim.temp > 55) {
        liquidColor = 'rgba(245, 158, 11, 0.45)'; // Warning Amber
        liquidGlow = 'rgba(245, 158, 11, 0.18)';
      }

      // Draw Liquid Body
      if (liquidLevelHeight > 0) {
        ctx.fillStyle = liquidColor;
        ctx.beginPath();
        ctx.moveTo(rx + 6, liquidY);
        // Animated liquid surface waves
        const waveFreq = Date.now() / 200;
        const waveAmp = 2.5;
        for (let xOffset = 6; xOffset <= rw - 6; xOffset += 4) {
          const wx = rx + xOffset;
          const wy = liquidY + waveAmp * Math.sin(waveFreq + xOffset * 0.1);
          ctx.lineTo(wx, wy);
        }
        ctx.lineTo(rx + rw - 6, ry + rh - 20);
        ctx.lineTo(rx + 6, ry + rh - 20);
        ctx.closePath();
        ctx.fill();

        // Liquid Surface Glow highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rx + 6, liquidY);
        for (let xOffset = 6; xOffset <= rw - 6; xOffset += 4) {
          const wx = rx + xOffset;
          const wy = liquidY + waveAmp * Math.sin(waveFreq + xOffset * 0.1);
          ctx.lineTo(wx, wy);
        }
        ctx.stroke();
      }

      // Draw steam bubbles if boiling (temp > 50°C)
      if (sim.temp > 50 && liquidLevelHeight > 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        const bubbleCount = Math.floor((sim.temp - 40) / 4);
        for (let i = 0; i < bubbleCount; i++) {
          const bx = rx + 15 + ((Math.sin(Date.now() / 300 + i * 50) + 1) / 2) * (rw - 30);
          const by = liquidY + 10 + ((Math.cos(Date.now() / 200 + i * 150) + 1) / 2) * (liquidLevelHeight - 20);
          const br = 1 + (i % 3);
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 3. Draw Steel/Glass Reactor Vessel Tower Frame
      const vesselGrad = ctx.createLinearGradient(rx, ry, rx + rw, ry);
      vesselGrad.addColorStop(0, 'rgba(9,14,26,0.92)');
      vesselGrad.addColorStop(0.35, 'rgba(22,32,58,0.80)');
      vesselGrad.addColorStop(0.65, 'rgba(22,32,58,0.80)');
      vesselGrad.addColorStop(1, 'rgba(9,14,26,0.92)');
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 4;
      ctx.fillStyle = vesselGrad;
      this.drawRoundedRect(rx, ry, rw, rh, 16, true, true);

      // Elliptical dome caps (top and bottom)
      ctx.save();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 3;
      // Top dome
      ctx.beginPath();
      ctx.ellipse(rx + rw / 2, ry + 8, rw / 2 - 2, 16, 0, Math.PI, 0);
      ctx.stroke();
      // Bottom dome
      ctx.beginPath();
      ctx.ellipse(rx + rw / 2, ry + rh - 8, rw / 2 - 2, 16, 0, 0, Math.PI);
      ctx.stroke();
      ctx.restore();

      // Left nozzle stub at inlet connection point
      ctx.save();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(rx, ry + 80);
      ctx.lineTo(rx - 14, ry + 80);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#475569';
      ctx.beginPath();
      ctx.rect(rx - 18, ry + 76, 6, 8);
      ctx.stroke();
      ctx.restore();

      // Level ruler on right side
      ctx.save();
      ctx.strokeStyle = 'rgba(100,116,139,0.6)';
      ctx.lineWidth = 1;
      const rulerX = rx + rw + 6;
      const rulerTop = ry + 20;
      const rulerBot = ry + rh - 20;
      ctx.beginPath();
      ctx.moveTo(rulerX, rulerTop); ctx.lineTo(rulerX, rulerBot);
      ctx.stroke();
      ctx.fillStyle = 'rgba(100,116,139,0.7)';
      ctx.font = '500 5px Fira Code';
      ctx.textAlign = 'left';
      [100, 75, 50, 25].forEach(pct => {
        const ty2 = rulerBot - (pct / 100) * (rulerBot - rulerTop);
        ctx.beginPath();
        ctx.moveTo(rulerX - 3, ty2); ctx.lineTo(rulerX + 3, ty2);
        ctx.stroke();
        ctx.fillText(pct + '%', rulerX + 5, ty2 + 2);
      });
      ctx.restore();

      // Dynamic Pressure visual border overlay (Clean and Professional)
      if (sim.pressure > 1.8) {
        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1.5;
        this.drawRoundedRect(rx - 4, ry - 4, rw + 8, rh + 8, 20, true, false);
      }

      // Metal reinforcement rings (horizontal struts)
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.6)';
      ctx.lineWidth = 2.5;
      const strutsY = [ry + 90, ry + 180, ry + 270];
      strutsY.forEach(sy => {
        ctx.beginPath();
        ctx.moveTo(rx, sy);
        ctx.lineTo(rx + rw, sy);
        ctx.stroke();
      });

      // Vertical metal support beams
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.25, ry); ctx.lineTo(rx + rw * 0.25, ry + rh);
      ctx.moveTo(rx + rw * 0.75, ry); ctx.lineTo(rx + rw * 0.75, ry + rh);
      ctx.stroke();

      // Reactor Labels
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 8px var(--font-sans), sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('REACTOR T-300', rx + rw / 2, ry - 8);

      // Live telemetry display badge
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      this.drawRoundedRect(rx + 8, ry + 25, rw - 16, 42, 4, true, true);

      ctx.fillStyle = '#6b9fe4';
      ctx.font = '600 7px Fira Code';
      ctx.textAlign = 'left';
      ctx.fillText(`LVL: ${sim.level.toFixed(1)}%`, rx + 14, ry + 36);
      ctx.fillText(`TMP: ${sim.temp.toFixed(1)}C`, rx + 14, ry + 46);

      ctx.fillStyle = sim.pressure > 2.0 ? '#ef4444' : '#10b981';
      ctx.fillText(`PRS: ${sim.pressure.toFixed(2)}M`, rx + 14, ry + 56);

      // 4. Draw Animated Pipelines
      const pipes = [
        { id: 'inlet', label: 'INFLOW', fy: 60, ty: ry + 80, color: '#6b9fe4', active: sim.inletValve > 0, val: sim.inletValve },
        { id: 'outlet', label: 'OUTFLOW', fy: 180, ty: ry + 200, color: '#f59e0b', active: sim.outletValve > 0, val: sim.outletValve },
        { id: 'relief', label: 'RELIEF VENT', fy: 300, ty: ry + 120, color: '#ef4444', active: sim.reliefValve, val: sim.reliefValve ? 100 : 0 },
        { id: 'sensor', label: 'SENSE LOOP', fy: 400, ty: ry + 320, color: '#10b981', active: true, val: 50 }
      ];

      pipes.forEach(p => {
        const startX = 800;
        const endX = rx;
        const waveFreq = Date.now() / 200;
        const isHotInlet = p.id === 'inlet' && sim.temp > 65;

        const buildPipePath = () => {
          ctx.beginPath();
          if (isHotInlet) {
            ctx.moveTo(startX, p.fy);
            const steps = 30;
            for (let s = 0; s <= steps; s++) {
              const t2 = s / steps;
              const px2 = startX + (endX - startX) * t2;
              const py2 = p.fy + (p.ty - p.fy) * t2;
              const dx2 = endX - startX, dy2 = p.ty - p.fy;
              const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
              const nx2 = -dy2 / len2, ny2 = dx2 / len2;
              const wobble = 1.5 * Math.sin(waveFreq + px2 * 0.08);
              ctx.lineTo(px2 + nx2 * wobble, py2 + ny2 * wobble);
            }
          } else {
            ctx.moveTo(startX, p.fy);
            ctx.lineTo(endX, p.ty);
          }
        };

        if (isHotInlet) {
          const hotGrad = ctx.createLinearGradient(endX, p.ty, startX, p.fy);
          hotGrad.addColorStop(0, 'rgba(239,68,68,0.8)');
          hotGrad.addColorStop(1, 'rgba(245,158,11,0.6)');
          ctx.strokeStyle = hotGrad;
        } else {
          ctx.strokeStyle = '#334155';
        }
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        buildPipePath();
        ctx.stroke();

        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 6;
        buildPipePath();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.lineWidth = 3;
        buildPipePath();
        ctx.stroke();

        if (p.active) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2.5;
          ctx.save();
          buildPipePath();
          const flowShift = (Date.now() / 40) % 24;
          ctx.setLineDash([8, 8]);
          ctx.lineDashOffset = p.id === 'outlet' ? -flowShift : flowShift;
          ctx.stroke();
          ctx.restore();
        }

        ctx.fillStyle = '#64748b';
        ctx.font = '600 6px var(--font-sans), sans-serif';
        ctx.textAlign = 'center';
        const labelX = (startX + endX) / 2;
        const labelY = (p.fy + p.ty) / 2 - 6;
        ctx.fillText(p.label, labelX, labelY);

        ctx.save();
        ctx.font = '600 6px Fira Code';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const badgeLabel = p.val !== undefined ? `${Math.round(p.val)}%` : '–';
        const bw = ctx.measureText(badgeLabel).width + 6;
        const bmx = (startX + endX) / 2;
        const bmy = (p.fy + p.ty) / 2 + 4;
        ctx.fillStyle = 'rgba(9,14,26,0.82)';
        ctx.beginPath();
        ctx.roundRect(bmx - bw / 2, bmy - 5, bw, 10, 3);
        ctx.fill();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.fillText(badgeLabel, bmx, bmy);
        ctx.restore();

        if (p.active) {
          ctx.save();
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const dx2 = endX - startX, dy2 = p.ty - p.fy;
          const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
          const ux2 = dx2 / len2, uy2 = dy2 / len2;
          const cx2 = ux2 * Math.cos(Math.PI / 4) - uy2 * Math.sin(Math.PI / 4);
          const cy2 = ux2 * Math.sin(Math.PI / 4) + uy2 * Math.cos(Math.PI / 4);
          const cx3 = ux2 * Math.cos(-Math.PI / 4) - uy2 * Math.sin(-Math.PI / 4);
          const cy3 = ux2 * Math.sin(-Math.PI / 4) + uy2 * Math.cos(-Math.PI / 4);
          [0.25, 0.5, 0.75].forEach(frac => {
            const chx = startX + dx2 * frac;
            const chy = p.fy + dy2 * frac;
            ctx.beginPath();
            ctx.moveTo(chx - cx2 * 5, chy - cy2 * 5);
            ctx.lineTo(chx + ux2 * 5, chy + uy2 * 5);
            ctx.lineTo(chx - cx3 * 5, chy - cy3 * 5);
            ctx.stroke();
          });
          ctx.restore();
        }
      });

      ctx.restore();
    } else if (type === 'water') {
      const sim = window.appInstance.simWater;
      if (!sim) return;

      ctx.save();

      const rx = 910;
      const ry = 50;
      const rw = 80;
      const rh = 360;

      // Clean, premium design system for stacked Water Tower
      // Draw outer steel vessel
      const vesselGrad = ctx.createLinearGradient(rx, ry, rx + rw, ry);
      vesselGrad.addColorStop(0, 'rgba(13,20,38,0.95)');
      vesselGrad.addColorStop(0.35, 'rgba(28,38,62,0.85)');
      vesselGrad.addColorStop(0.65, 'rgba(28,38,62,0.85)');
      vesselGrad.addColorStop(1, 'rgba(13,20,38,0.95)');
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3.5;
      ctx.fillStyle = vesselGrad;
      this.drawRoundedRect(rx, ry, rw, rh, 12, true, true);

      // Stacked Chamber 1: Clarification (ry to ry + 90)
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx, ry + 90); ctx.lineTo(rx + rw, ry + 90);
      ctx.stroke();

      // Stacked Chamber 2: Filtration Bed (ry + 90 to ry + 180)
      ctx.beginPath();
      ctx.moveTo(rx, ry + 180); ctx.lineTo(rx + rw, ry + 180);
      ctx.stroke();

      // Stacked Chamber 3: Disinfection (ry + 180 to ry + 270)
      ctx.beginPath();
      ctx.moveTo(rx, ry + 270); ctx.lineTo(rx + rw, ry + 270);
      ctx.stroke();

      // 1. Draw Liquid in Clearwell Reservoir (Chamber 4 at bottom: ry + 270 to ry + rh)
      const resMaxH = rh - 270 - 15;
      const resH = (sim.reservoirLevel / 100) * resMaxH;
      const resY = ry + rh - 10 - resH;
      if (resH > 0) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.45)'; // Soft sky blue
        ctx.fillRect(rx + 4, resY, rw - 8, resH);

        // Fluid ripple surface
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const waveFreq = Date.now() / 150;
        ctx.moveTo(rx + 4, resY);
        for (let xo = 4; xo <= rw - 4; xo += 4) {
          ctx.lineTo(rx + xo, resY + 1.5 * Math.sin(waveFreq + xo * 0.15));
        }
        ctx.stroke();
      }

      // Draw layered filtration sand/coal inside Chamber 2 (ry + 90 to ry + 180)
      // Coal (top layer, dark grey)
      ctx.fillStyle = 'rgba(40, 48, 60, 0.85)';
      ctx.fillRect(rx + 4, ry + 105, rw - 8, 20);
      // Sand (middle layer, light gold/grey)
      ctx.fillStyle = 'rgba(160, 150, 130, 0.6)';
      ctx.fillRect(rx + 4, ry + 125, rw - 8, 25);
      // Gravel (bottom layer, textured pebbles)
      ctx.fillStyle = 'rgba(100, 105, 115, 0.7)';
      ctx.fillRect(rx + 4, ry + 150, rw - 8, 20);

      // Label details inside chambers
      ctx.fillStyle = '#64748b';
      ctx.font = '700 6.5px var(--font-sans), sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CLARIFIER', rx + rw / 2, ry + 18);
      ctx.fillText('FILTER BED', rx + rw / 2, ry + 101);
      ctx.fillText('CHLORINATOR', rx + rw / 2, ry + 192);
      ctx.fillText('RESERVOIR', rx + rw / 2, ry + 282);

      // Rotating mechanical mixer inside clarifier (animated by pump speed)
      ctx.save();
      ctx.translate(rx + rw / 2, ry + 50);
      const angle = (Date.now() / 1000) * (sim.pumpSpeed / 100) * 8;
      ctx.rotate(angle);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-25, 0); ctx.lineTo(25, 0);
      ctx.moveTo(0, -10); ctx.lineTo(0, 10);
      ctx.stroke();
      ctx.restore();

      // Reactor Tower Labels
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 8px var(--font-sans), sans-serif';
      ctx.fillText('WATER twin T-400', rx + rw / 2, ry - 8);

      // Live Telemetry Readout Board on Stack
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      this.drawRoundedRect(rx + 8, ry + 205, rw - 16, 46, 4, true, true);

      ctx.fillStyle = '#38bdf8';
      ctx.font = '600 6.5px Fira Code';
      ctx.textAlign = 'left';
      ctx.fillText(`FLOW: ${sim.rawFlow.toFixed(1)}L/s`, rx + 13, ry + 215);
      ctx.fillText(`TURB: ${sim.turbidity.toFixed(2)}N`, rx + 13, ry + 225);

      const clAlert = sim.chlorineLevel > 4.0 || sim.chlorineLevel < 0.5;
      ctx.fillStyle = clAlert ? '#ef4444' : '#10b981';
      ctx.fillText(`CL2 : ${sim.chlorineLevel.toFixed(2)}m`, rx + 13, ry + 235);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`pH  : ${sim.pH.toFixed(2)}`, rx + 13, ry + 245);

      // 4. Draw pipelines connecting from nearest canvas nodes to the water tower
      const wpipeZones = [
        { id: 'raw',    label: 'RAW INTAKE',    ty: ry + 50,       color: 'rgba(180,160,130,0.8)', active: sim.pumpSpeed > 0,  val: sim.pumpSpeed },
        { id: 'dose',   label: 'CL2 DOSING',    ty: ry + 195,      color: '#06b6d4',               active: sim.dosePump > 0,   val: sim.dosePump },
        { id: 'outlet', label: 'DISTRIBUTION',  ty: ry + rh - 30,  color: '#38bdf8',               active: sim.pumpSpeed > 5,  val: sim.reservoirLevel }
      ];
      const wCandidates = this.nodes.filter(n => n.x > 80 && n.x < rx - 10);
      const wUsed = new Set();
      const wpipes = wpipeZones.map(pz => {
        const sorted = [...wCandidates].sort((a, b) => Math.abs(a.y - pz.ty) - Math.abs(b.y - pz.ty));
        const pool  = sorted.slice(0, Math.max(2, Math.ceil(sorted.length * 0.35)));
        const avail = pool.filter(n => !wUsed.has(n.id));
        const src   = (avail.length > 0 ? avail : pool).reduce((best, n) => n.x > best.x ? n : best,
                        (avail.length > 0 ? avail : pool)[0]);
        if (src) wUsed.add(src.id);
        return { ...pz, sx: src ? src.x : 800, sy: src ? src.y : pz.ty };
      });

      wpipes.forEach(p => {
        const startX = p.sx, startY = p.sy;
        const endX = rx;

        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, p.ty);
        ctx.stroke();

        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 5.5;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, p.ty);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, p.ty);
        ctx.stroke();

        if (p.active) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2.2;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, p.ty);
          const wFlowShift = (Date.now() / 40) % 24;
          ctx.setLineDash([8, 8]);
          ctx.lineDashOffset = wFlowShift;
          ctx.stroke();
          ctx.restore();
        }

        const wmx = (startX + endX) / 2, wmy = (startY + p.ty) / 2;
        ctx.fillStyle = '#64748b';
        ctx.font = '600 6px var(--font-sans), sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.label, wmx, wmy - 7);

        // Small badge midpoint
        ctx.save();
        ctx.font = '600 6px Fira Code';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const badgeLabel = p.val !== undefined ? `${Math.round(p.val)}%` : '–';
        const bw = ctx.measureText(badgeLabel).width + 6;
        ctx.fillStyle = 'rgba(9,14,26,0.82)';
        ctx.beginPath();
        ctx.roundRect(wmx - bw / 2, wmy - 1, bw, 8, 2.5);
        ctx.fill();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.fillText(badgeLabel, wmx, wmy + 3);
        ctx.restore();
      });

      ctx.restore();
    } else if (type === 'grid') {
      const sim = window.appInstance.simGrid;
      if (!sim) return;
      const hasGridNodes = this.nodes.some(n => n.id === 'RTU-GRID' || n.id === 'RELAY-01');
      if (!hasGridNodes) return;

      ctx.save();

      const rx = 910;
      const ry = 50;
      const rw = 80;
      const rh = 360;

      // Draw custom beautiful Substation Panel
      const vesselGrad = ctx.createLinearGradient(rx, ry, rx + rw, ry);
      vesselGrad.addColorStop(0, 'rgba(10,15,30,0.95)');
      vesselGrad.addColorStop(0.35, 'rgba(20,28,48,0.85)');
      vesselGrad.addColorStop(0.65, 'rgba(20,28,48,0.85)');
      vesselGrad.addColorStop(1, 'rgba(10,15,30,0.95)');
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3.5;
      ctx.fillStyle = vesselGrad;
      this.drawRoundedRect(rx, ry, rw, rh, 12, true, true);

      // Section 1: Transformer Step-Up Winding Graphic (ry + 10 to ry + 90)
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx, ry + 100); ctx.lineTo(rx + rw, ry + 100);
      ctx.stroke();

      // Draw beautiful step-up transformer coils
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      // Left winding coil
      const cy1 = ry + 50;
      ctx.arc(rx + 28, cy1, 14, -Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      ctx.strokeStyle = '#38bdf8';
      ctx.beginPath();
      // Right winding coil
      ctx.arc(rx + 52, cy1, 14, -Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();

      // Electrical connection line between coils
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx + 42, cy1); ctx.lineTo(rx + 48, cy1);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '700 6.5px var(--font-sans), sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('XFR-300 GSU', rx + rw / 2, ry + 16);

      // Section 2: Real-time Interactive Breaker Status Switches (ry + 100 to ry + 230)
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
      ctx.beginPath();
      ctx.moveTo(rx, ry + 225); ctx.lineTo(rx + rw, ry + 225);
      ctx.stroke();

      ctx.fillText('BREAKERS', rx + rw / 2, ry + 112);

      const breakers = [
        { label: 'CB-1', active: sim.cb1, y: ry + 128 },
        { label: 'CB-2', active: sim.cb2, y: ry + 158 },
        { label: 'CB-3 (T)', active: sim.cb3, y: ry + 188 }
      ];

      breakers.forEach(b => {
        // Draw breaker bounding panel
        ctx.fillStyle = 'rgba(9,14,26,0.6)';
        ctx.strokeStyle = b.active ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)';
        ctx.lineWidth = 1;
        this.drawRoundedRect(rx + 10, b.y, rw - 20, 22, 4, true, true);

        // Indicator LED
        ctx.fillStyle = b.active ? '#10b981' : '#ef4444';
        ctx.beginPath();
        ctx.arc(rx + 22, b.y + 11, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.font = '700 6.5px Fira Code';
        ctx.textAlign = 'left';
        ctx.fillText(b.label, rx + 32, b.y + 14);

        ctx.font = '600 5px Fira Code';
        ctx.textAlign = 'right';
        ctx.fillStyle = b.active ? '#10b981' : '#ef4444';
        ctx.fillText(b.active ? 'CLOSED' : 'TRIPPED', rx + rw - 16, b.y + 14);
      });

      // Section 3: Distribution Lines (ry + 225 to ry + rh)
      ctx.fillStyle = '#64748b';
      ctx.font = '700 6.5px var(--font-sans), sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SUB-FEEDS', rx + rw / 2, ry + 238);

      // Draw high-tension pylon watermark inside Section 3
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx + rw / 2 - 15, ry + rh - 10);
      ctx.lineTo(rx + rw / 2, ry + 250);
      ctx.lineTo(rx + rw / 2 + 15, ry + rh - 10);
      ctx.moveTo(rx + rw / 2 - 20, ry + 270);
      ctx.lineTo(rx + rw / 2 + 20, ry + 270);
      ctx.moveTo(rx + rw / 2 - 15, ry + 290);
      ctx.lineTo(rx + rw / 2 + 15, ry + 290);
      ctx.stroke();

      // Power twin header
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 8px var(--font-sans), sans-serif';
      ctx.fillText('SUBSTATION twin', rx + rw / 2, ry - 8);

      // Dynamic electric flow animation in incoming line
      const gridPipeZones = [
        { ty: ry + 50,       color: '#f59e0b', label: 'GEN LINE', active: sim.genOutputMW > 5, val: sim.genOutputMW },
        { ty: ry + 140,      color: sim.cb1 ? '#10b981' : '#64748b', label: 'FEEDER A', active: sim.cb1 && !sim.blackout, val: sim.loadMW * 0.55 },
        { ty: ry + rh - 50,  color: sim.cb2 ? '#10b981' : '#64748b', label: 'FEEDER B', active: sim.cb2 && !sim.blackout, val: sim.loadMW * 0.45 }
      ];
      const gridCandidates = this.nodes.filter(n => n.x > 80 && n.x < rx - 10);
      const gridUsed = new Set();
      gridPipeZones.forEach(p => {
        const sorted = [...gridCandidates].sort((a, b) => Math.abs(a.y - p.ty) - Math.abs(b.y - p.ty));
        const pool  = sorted.slice(0, Math.max(2, Math.ceil(sorted.length * 0.35)));
        const avail = pool.filter(n => !gridUsed.has(n.id));
        const src   = (avail.length > 0 ? avail : pool).reduce((best, n) => n.x > best.x ? n : best,
                        (avail.length > 0 ? avail : pool)[0]);
        const sx = src ? src.x : 800;
        const sy = src ? src.y : p.ty;
        if (src) gridUsed.add(src.id);
        const ex = rx;
        ctx.strokeStyle = '#334155'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, p.ty); ctx.stroke();
        ctx.strokeStyle = '#475569'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, p.ty); ctx.stroke();
        if (p.active) {
          ctx.strokeStyle = p.color; ctx.lineWidth = 1.8;
          ctx.save(); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, p.ty);
          const speedFactor = p.val ? Math.min(25, p.val / 4) : 10;
          const fShift = (Date.now() / (40 - speedFactor)) % 24;
          ctx.setLineDash([5, 12]); ctx.lineDashOffset = fShift; ctx.stroke();
          ctx.restore();
        }
        const lmx = (sx + ex) / 2, lmy = (sy + p.ty) / 2;
        ctx.fillStyle = '#64748b'; ctx.font = '600 6px var(--font-sans), sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(p.label, lmx, lmy - 6);
      });

      // Digital Grid Readout Panel Overlay at bottom
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      this.drawRoundedRect(rx + 8, ry + 302, rw - 16, 46, 4, true, true);

      ctx.fillStyle = '#f59e0b';
      ctx.font = '600 6.5px Fira Code';
      ctx.textAlign = 'left';
      ctx.fillText(`FREQ: ${sim.frequency.toFixed(2)}Hz`, rx + 13, ry + 312);
      ctx.fillText(`VOLT: ${sim.voltage.toFixed(1)}kV`, rx + 13, ry + 322);
      ctx.fillText(`LOAD: ${sim.loadMW.toFixed(1)}MW`, rx + 13, ry + 332);
      ctx.fillText(`MVAR: ${sim.reactiveMVAR.toFixed(1)}`, rx + 13, ry + 342);

      ctx.restore();
    } else {
      // DEFAULT — Generic ICS / Campus / Purdue / Blank
      // Full industrial plant control panel with animated elements
      ctx.save();

      const rx = 905, ry = 42, rw = 90, rh = 370;
      const cx = rx + rw / 2;
      const now = Date.now();
      const flowShift = (now / 45) % 24;

      // Main panel vessel
      const panelGrad = ctx.createLinearGradient(rx, ry, rx + rw, ry);
      panelGrad.addColorStop(0, 'rgba(8,13,26,0.94)');
      panelGrad.addColorStop(0.4, 'rgba(16,24,46,0.88)');
      panelGrad.addColorStop(1, 'rgba(8,13,26,0.94)');
      ctx.strokeStyle = 'rgba(71,85,105,0.55)';
      ctx.lineWidth = 2.5;
      ctx.fillStyle = panelGrad;
      this.drawRoundedRect(rx, ry, rw, rh, 10, true, true);

      // Hyperbolic cooling tower silhouette (upper section)
      ctx.strokeStyle = 'rgba(71,85,105,0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 22, ry + 12);
      ctx.bezierCurveTo(cx - 11, ry + 40, cx - 11, ry + 65, cx - 28, ry + 88);
      ctx.lineTo(cx + 28, ry + 88);
      ctx.bezierCurveTo(cx + 11, ry + 65, cx + 11, ry + 40, cx + 22, ry + 12);
      ctx.closePath(); ctx.stroke();
      // Animated steam puffs
      const sp = (now / 1800) % (Math.PI * 2);
      [[cx - 12, ry + 6, 5], [cx + 2, ry + 3, 7], [cx + 14, ry + 7, 4]].forEach(([sx, sy, sr]) => {
        ctx.beginPath(); ctx.arc(sx, sy - 3 * Math.sin(sp + sx * 0.1), sr, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Horizontal zone dividers
      ctx.strokeStyle = 'rgba(71,85,105,0.35)';
      ctx.lineWidth = 1.2;
      [ry + 95, ry + 190, ry + 280].forEach(ly => {
        ctx.setLineDash([4, 3]); ctx.beginPath();
        ctx.moveTo(rx + 5, ly); ctx.lineTo(rx + rw - 5, ly); ctx.stroke();
        ctx.setLineDash([]);
      });

      // Zone labels
      ctx.fillStyle = 'rgba(100,116,139,0.55)';
      ctx.font = '700 5.5px var(--font-sans),sans-serif';
      ctx.textAlign = 'center';
      ['L3 SUPERVISORY', 'L2 CONTROL', 'L1 FIELD BUS', 'L0 PROCESS'].forEach((lbl, i) => {
        ctx.fillText(lbl, cx, ry + 106 + i * 95);
      });

      // Circular gauges (3 gauges in mid section)
      const gauges = [
        { x: cx - 26, y: ry + 155, label: 'P', val: 0.62 + 0.08 * Math.sin(now / 2800), color: '#f59e0b' },
        { x: cx,      y: ry + 155, label: 'T', val: 0.44 + 0.12 * Math.sin(now / 3500 + 1), color: '#ef4444' },
        { x: cx + 26, y: ry + 155, label: 'F', val: 0.78 + 0.06 * Math.sin(now / 2200 + 2), color: '#10b981' },
      ];
      gauges.forEach(g => {
        const gr = 10;
        // Gauge background
        ctx.strokeStyle = 'rgba(71,85,105,0.4)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(g.x, g.y, gr, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
        // Gauge fill
        ctx.strokeStyle = g.color; ctx.lineWidth = 2.5;
        ctx.shadowColor = g.color; ctx.shadowBlur = 5;
        ctx.beginPath(); ctx.arc(g.x, g.y, gr, Math.PI * 0.75, Math.PI * 0.75 + g.val * Math.PI * 1.5); ctx.stroke();
        ctx.shadowBlur = 0;
        // Needle
        const needleAngle = Math.PI * 0.75 + g.val * Math.PI * 1.5;
        ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(g.x, g.y);
        ctx.lineTo(g.x + Math.cos(needleAngle) * 7, g.y + Math.sin(needleAngle) * 7);
        ctx.stroke();
        // Label
        ctx.fillStyle = g.color; ctx.font = '700 5px Fira Code'; ctx.textAlign = 'center';
        ctx.fillText(g.label, g.x, g.y + gr + 6);
      });

      // PLC / RTU status indicators (lower section)
      const plcs = [
        { label: 'RTU-01', active: true  },
        { label: 'RTU-02', active: true  },
        { label: 'PLC-A',  active: (Math.sin(now / 4000) > -0.7) },
        { label: 'PLC-B',  active: true  },
      ];
      plcs.forEach((p, i) => {
        const px = rx + 10 + (i % 2) * 38;
        const py = ry + 295 + Math.floor(i / 2) * 18;
        ctx.fillStyle = 'rgba(9,14,26,0.6)';
        ctx.strokeStyle = p.active ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)';
        ctx.lineWidth = 1;
        this.drawRoundedRect(px, py, 32, 12, 3, true, true);
        // LED
        ctx.fillStyle = p.active ? '#10b981' : '#ef4444';
        ctx.shadowColor = p.active ? '#10b981' : '#ef4444'; ctx.shadowBlur = 4;
        ctx.beginPath(); ctx.arc(px + 7, py + 6, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#94a3b8'; ctx.font = '600 5px Fira Code'; ctx.textAlign = 'left';
        ctx.fillText(p.label, px + 13, py + 8.5);
      });

      // Animated flow ticker
      ctx.fillStyle = '#94a3b8'; ctx.font = '700 5.5px Fira Code'; ctx.textAlign = 'center';
      const flowVal = (42 + 8 * Math.sin(now / 2600)).toFixed(1);
      ctx.fillText(`FLOW: ${flowVal} L/s`, cx, ry + 348);
      ctx.fillText(`AETHERIS PLANT`, cx, ry - 8);

      // Panel header glint line
      ctx.strokeStyle = 'rgba(100,116,139,0.2)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(rx + 10, ry + 5); ctx.lineTo(rx + rw - 10, ry + 5); ctx.stroke();

      // SCADA pipes — dynamically routed to nearest canvas nodes per zone
      const pipeZones = [
        { ty: ry + 55,  color: '#f59e0b', label: 'PROC STEAM',     active: true },
        { ty: ry + 150, color: '#38bdf8', label: 'COOLING WATER',  active: true },
        { ty: ry + 245, color: '#10b981', label: 'DRAIN LINE',     active: (Math.sin(now / 5000) > 0) },
        { ty: ry + 335, color: '#a78bfa', label: 'INSTRUMENT AIR', active: true },
      ];
      // Nodes left of the plant panel are valid pipe origins
      const pipeCandidates = this.nodes.filter(n => n.x > 80 && n.x < rx - 10);
      const pipeUsed = new Set();
      pipeZones.forEach(p => {
        // Sort by Y proximity to this pipe's plant entry; among the closest 30% pick rightmost
        const sorted = [...pipeCandidates].sort((a, b) => Math.abs(a.y - p.ty) - Math.abs(b.y - p.ty));
        const pool   = sorted.slice(0, Math.max(3, Math.ceil(sorted.length * 0.3)));
        const avail  = pool.filter(n => !pipeUsed.has(n.id));
        const src    = (avail.length > 0 ? avail : pool).reduce((best, n) => n.x > best.x ? n : best,
                         (avail.length > 0 ? avail : pool)[0]);
        const sx = src ? src.x : 800;
        const sy = src ? src.y : p.ty;
        if (src) pipeUsed.add(src.id);
        const ex = rx;
        // Outer casing
        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 9; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, p.ty); ctx.stroke();
        ctx.strokeStyle = '#334155'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, p.ty); ctx.stroke();
        // Inner bore
        ctx.strokeStyle = 'rgba(9,14,26,0.9)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, p.ty); ctx.stroke();
        // Animated flow stripe
        if (p.active) {
          ctx.strokeStyle = p.color; ctx.lineWidth = 2.5;
          ctx.save(); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, p.ty);
          ctx.setLineDash([9, 8]); ctx.lineDashOffset = flowShift; ctx.stroke();
          ctx.restore();
        }
        // Pipe label at midpoint
        const midX = (sx + ex) / 2, midY = (sy + p.ty) / 2;
        ctx.fillStyle = 'rgba(100,116,139,0.6)'; ctx.font = '600 5.5px var(--font-sans),sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(p.label, midX, midY - 8);
        // Flow badge
        if (p.active) {
          ctx.save(); ctx.font = '600 5px Fira Code'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const bval = (60 + 20 * Math.sin(now / 3000 + p.ty * 0.01)).toFixed(0) + '%';
          const bw2  = ctx.measureText(bval).width + 6;
          ctx.fillStyle = 'rgba(9,14,26,0.85)';
          ctx.beginPath(); ctx.roundRect(midX - bw2 / 2, midY - 1, bw2, 9, 2); ctx.fill();
          ctx.strokeStyle = p.color; ctx.lineWidth = 0.6; ctx.stroke();
          ctx.fillStyle = p.color; ctx.fillText(bval, midX, midY + 4);
          ctx.restore();
        }
        // Joint circles at start and plant entry
        ctx.strokeStyle = 'rgba(71,85,105,0.55)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, p.ty, 5, 0, Math.PI * 2); ctx.stroke();
      });

      ctx.restore();
    }
  }

  drawRoundedRect(x, y, w, h, r, stroke = true, fill = false) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.arcTo(x + w, y, x + w, y + h, r);
    this.ctx.arcTo(x + w, y + h, x, y + h, r);
    this.ctx.arcTo(x, y + h, x, y, r);
    this.ctx.arcTo(x, y, x + w, y, r);
    this.ctx.closePath();
    if (fill) this.ctx.fill();
    if (stroke) this.ctx.stroke();
  }

  drawLink(src, tgt, link) {
    this.ctx.save();

    let isSnipped = link.status === 'offline';
    const isIsolated = link.status === 'isolated';

    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // #16 — Detect OT/process links
    const processProtos = ['MODBUS', 'DNP3', 'EtherNet/IP', 'OPC-UA'];
    const isProcessLink = link.protocol && processProtos.some(pp => link.protocol.includes(pp));

    // #16 — Reduce bezier curve for process links, use rounder caps
    const curveOffset = isProcessLink ? 0.06 : 0.18;
    const curve = Math.min(dist * curveOffset, isProcessLink ? 8 : 30);
    const mx = (src.x + tgt.x) / 2 - dy / dist * curve;
    const my = (src.y + tgt.y) / 2 + dx / dist * curve;

    if (isIsolated) {
      this.ctx.strokeStyle = '#ef4444';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([4, 4]);
    } else if (isSnipped) {
      this.ctx.strokeStyle = '#f87171';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([6, 6]);
    } else {
      // IMP-9: Traffic load colour coding
      const loadVal = link.speed ? link.speed / 100 : 0.2;
      const r = Math.floor(lerp(148, 239, Math.min(loadVal, 1)));
      const g = Math.floor(lerp(163, 68, Math.min(loadVal, 1)));
      const b = Math.floor(lerp(184, 68, Math.min(loadVal, 1)));
      this.ctx.strokeStyle = `rgba(${r},${g},${b},0.75)`;
      // #16 — Thicker process pipe links
      this.ctx.lineWidth = isProcessLink ? 3.5 : (1.5 + loadVal * 1.5);
      if (isProcessLink) this.ctx.lineCap = 'round';
      this.ctx.setLineDash([]);
    }

    // Encrypted link glow — accent cyan per design system
    if (link.encrypted && !isIsolated && !isSnipped) {
      this.ctx.shadowColor = 'rgba(0, 212, 255, 0.45)';
      this.ctx.shadowBlur = 6;
    }

    this.ctx.beginPath();
    this.ctx.moveTo(src.x, src.y);
    this.ctx.quadraticCurveTo(mx, my, tgt.x, tgt.y);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;

    // Draw snip lightning bolt icon in center
    if (isSnipped) {
      this.ctx.fillStyle = '#ef4444';
      this.ctx.font = '10px Inter';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('⚡', mx, my);
    }

    // #17 — Flow direction arrowhead on process links
    if (!isSnipped && !isIsolated && isProcessLink) {
      const t2 = 0.5;
      const ahx = (1 - t2) * (1 - t2) * src.x + 2 * (1 - t2) * t2 * mx + t2 * t2 * tgt.x;
      const ahy = (1 - t2) * (1 - t2) * src.y + 2 * (1 - t2) * t2 * my + t2 * t2 * tgt.y;
      const adx = tgt.x - src.x, ady = tgt.y - src.y;
      const alen = Math.sqrt(adx * adx + ady * ady);
      const aang = Math.atan2(ady, adx);
      this.ctx.save();
      this.ctx.fillStyle = this.ctx.strokeStyle;
      this.ctx.setLineDash([]);
      this.ctx.beginPath();
      this.ctx.moveTo(ahx + Math.cos(aang) * 6, ahy + Math.sin(aang) * 6);
      this.ctx.lineTo(ahx + Math.cos(aang + 2.4) * 6, ahy + Math.sin(aang + 2.4) * 6);
      this.ctx.lineTo(ahx + Math.cos(aang - 2.4) * 6, ahy + Math.sin(aang - 2.4) * 6);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
    }

    // IMP-11: Animated traffic data-dot flowing along active links
    // #18 — Dual flow dots for OT process links
    if (!isSnipped && !isIsolated && window.appInstance?.isPlaying) {
      this.ctx.setLineDash([]);
      if (isProcessLink) {
        // Two dots offset by 0.5
        [0, 0.5].forEach(offset => {
          const t2 = ((Date.now() / 2500 + offset) % 1);
          const bx = (1 - t2) * (1 - t2) * src.x + 2 * (1 - t2) * t2 * mx + t2 * t2 * tgt.x;
          const by = (1 - t2) * (1 - t2) * src.y + 2 * (1 - t2) * t2 * my + t2 * t2 * tgt.y;
          this.ctx.fillStyle = link.encrypted ? 'rgba(0,212,255,0.9)' : 'rgba(45,125,210,0.9)';
          this.ctx.beginPath();
          this.ctx.arc(bx, by, 3, 0, Math.PI * 2);
          this.ctx.fill();
        });
      } else {
        const t2 = ((Date.now() / 2500) % 1);
        const bx = (1 - t2) * (1 - t2) * src.x + 2 * (1 - t2) * t2 * mx + t2 * t2 * tgt.x;
        const by = (1 - t2) * (1 - t2) * src.y + 2 * (1 - t2) * t2 * my + t2 * t2 * tgt.y;
        this.ctx.fillStyle = link.encrypted ? 'rgba(0,212,255,0.85)' : 'rgba(45,125,210,0.85)';
        this.ctx.beginPath();
        this.ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // #19 — Protocol color stripe on all active links (thin 1px inner stroke)
    if (!isSnipped && !isIsolated) {
      const protoColors = {
        'MODBUS': '#f59e0b',
        'DNP3': '#fb923c',
        'EtherNet/IP': '#e879f9',
        'OPC-UA': '#a78bfa',
        'HTTPS': '#10b981'
      };
      let protoColor = '#64748b';
      if (link.protocol) {
        for (const [key, val] of Object.entries(protoColors)) {
          if (link.protocol.includes(key)) { protoColor = val; break; }
        }
      }
      this.ctx.save();
      this.ctx.strokeStyle = protoColor;
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([]);
      this.ctx.globalAlpha = 0.55;
      this.ctx.beginPath();
      this.ctx.moveTo(src.x, src.y);
      this.ctx.quadraticCurveTo(mx, my, tgt.x, tgt.y);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Draw interface port labels
    if ((link.sourceInterface || link.targetInterface) && dist > 60) {
      const ux = dx / dist;
      const uy = dy / dist;
      this.ctx.fillStyle = '#64748b';
      this.ctx.font = '7px Fira Code';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';

      if (link.sourceInterface) {
        const sx = src.x + ux * 32;
        const sy = src.y + uy * 32;
        this.ctx.fillText(link.sourceInterface, sx, sy - 6);
      }

      if (link.targetInterface) {
        const tx2 = tgt.x - ux * 32;
        const ty2 = tgt.y - uy * 32;
        this.ctx.fillText(link.targetInterface, tx2, ty2 - 6);
      }
    }

    // IMP-12: Speed badge label at midpoint for named links
    if (link.speed && dist > 80) {
      this.ctx.fillStyle = 'rgba(15,23,42,0.75)';
      this.ctx.fillRect(mx - 16, my - 7, 32, 12);
      this.ctx.fillStyle = '#94a3b8';
      this.ctx.font = '6px Fira Code';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      const spLabel = link.speed >= 1000 ? `${link.speed / 1000}G` : `${link.speed}M`;
      this.ctx.fillText(spLabel, mx, my);
    }

    // Traffic heat map — protocol label badge at link midpoint
    if (window.appInstance?.showTrafficHeatMap && link.protocol && dist > 70 && !isSnipped && !isIsolated) {
      const protoColors = { 'Modbus/TCP': '#f59e0b', 'OSPF/BGP': '#06b6d4', 'IPSec/TLS': '#10b981', 'OPC-UA': '#a78bfa', 'Ethernet': '#64748b', 'DNP3': '#fb923c', 'EtherNet/IP': '#e879f9' };
      const pc = protoColors[link.protocol] || '#64748b';
      const label = link.protocol;
      this.ctx.font = '700 6px sans-serif';
      const tw = this.ctx.measureText(label).width;
      const bx2 = mx - tw / 2 - 4, by2 = my + 10;
      this.ctx.fillStyle = 'rgba(13,17,23,0.88)';
      this.ctx.fillRect(bx2, by2, tw + 8, 11);
      this.ctx.strokeStyle = pc;
      this.ctx.lineWidth = 0.7;
      this.ctx.strokeRect(bx2, by2, tw + 8, 11);
      this.ctx.fillStyle = pc;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(label, mx, by2 + 5.5);
    }

    this.ctx.restore();
  }

  drawPacket(p) {
    this.ctx.save();
    let color = '#3b82f6';
    let size = 3.5;

    if (p.type === 'threat') {
      color = '#ef4444';
      size = 4;
    } else if (p.type === 'mitigation') {
      color = '#10b981';
      size = 4;
    } else if (p.type === 'dhcp') {
      color = '#4477d4';
      size = 3.8;
    } else if (p.type === 'ospf') {
      color = '#f59e0b';
      size = 3.0;
    } else if (p.type === 'modbus') {
      color = '#a855f7';
      size = 3.8;
    } else if (p.type === 'icmp') {
      color = '#10b981';
      size = 3.5;
    } else if (p.type === 'trace') {
      color = '#ffffff';
      size = 6.5;
    }

    // Subtle glow on trace packets only
    this.ctx.shadowBlur = p.type === 'trace' ? 6 : 0;
    this.ctx.shadowColor = p.type === 'trace' ? '#a78bfa' : color;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  drawNode(n) {
    this.ctx.save();

    const isSelected = this.selectedNode && this.selectedNode.id === n.id;
    const isHovered = this.hoveredNode && this.hoveredNode.id === n.id;

    // Node state color picker — design system palette
    let primaryColor = '#2D7DD2';
    let glowColor = 'rgba(45, 125, 210, 0.18)';

    if (n.status === 'compromised') {
      primaryColor = '#EF4444';
      glowColor = 'rgba(239, 68, 68, 0.35)';
    } else if (n.status === 'degraded') {
      primaryColor = '#F97316';
      glowColor = 'rgba(249, 115, 22, 0.28)';
    } else if (n.status === 'isolated') {
      primaryColor = '#F59E0B';
      glowColor = 'rgba(245, 158, 11, 0.22)';
    } else {
      switch (n.type) {
        case 'ot': primaryColor = '#8B5CF6'; glowColor = 'rgba(139, 92, 246, 0.15)'; break;
        case 'plc': primaryColor = '#10B981'; glowColor = 'rgba(16, 185, 129, 0.15)'; break;
        case 'field': primaryColor = '#475569'; glowColor = 'rgba(71, 85, 105, 0.12)'; break;
      }
    }

    // Dynamic micro-tremble glitch effect for compromised nodes
    let nx = n.x;
    let ny = n.y;
    if (n.status === 'compromised' && Math.random() > 0.8) {
      nx += (Math.random() - 0.5) * 3.5;
      ny += (Math.random() - 0.5) * 3.5;
    }

    // Selected/Hovered halo rings — design system pulse
    if (n.status === 'compromised') {
      const pulse = 1 + 0.15 * Math.sin(Date.now() / 180);
      this.ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
      this.ctx.shadowBlur = 12;
      this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, 28 * pulse, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }

    if (n.hasIpConflict) {
      const pulse = 1 + 0.1 * Math.sin(Date.now() / 100);
      this.ctx.strokeStyle = '#ef4444';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([2, 2]);
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, 24 * pulse, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // #4 — Solid selection ring + outer pulsing ring
    if (isSelected) {
      this.ctx.strokeStyle = '#2D7DD2';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([]);
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, 28, 0, Math.PI * 2);
      this.ctx.stroke();
      // Pulsing outer ring
      const pulseR = 32 + 2 * Math.sin(Date.now() / 200);
      this.ctx.strokeStyle = 'rgba(45,125,210,0.4)';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, pulseR, 0, Math.PI * 2);
      this.ctx.stroke();
    } else if (isHovered) {
      this.ctx.strokeStyle = '#3D5A80';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, 27, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // #5 — Heartbeat pulse for online (non-compromised, non-isolated) nodes
    if (n.status !== 'compromised' && n.status !== 'isolated') {
      const hbR = 27 + 1.5 * Math.sin(Date.now() / 800);
      this.ctx.strokeStyle = primaryColor;
      this.ctx.globalAlpha = 0.12;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, hbR, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.globalAlpha = 1.0;
    }

    // #2 — Radial gradient node background
    const nodeGrad = this.ctx.createRadialGradient(nx, ny, 0, nx, ny, 24);
    nodeGrad.addColorStop(0, 'rgba(30,41,59,0.97)');
    nodeGrad.addColorStop(1, 'rgba(9,14,26,0.97)');
    this.ctx.fillStyle = nodeGrad;
    this.ctx.strokeStyle = primaryColor;
    this.ctx.lineWidth = isSelected ? 2.5 : 1.5;
    this.ctx.beginPath();
    // #1 — Larger node radius: 24px
    this.ctx.arc(nx, ny, 24, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

    // #3 — Node type color accent arc (120° centered at bottom)
    this.ctx.save();
    this.ctx.strokeStyle = primaryColor;
    this.ctx.globalAlpha = 0.6;
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();
    // 120° arc centered at bottom (PI/2), spanning -60° to +60° from bottom
    this.ctx.arc(nx, ny, 24, Math.PI / 2 - Math.PI / 3, Math.PI / 2 + Math.PI / 3);
    this.ctx.stroke();
    this.ctx.restore();

    // Visual glowing LED blinking indicator for OSPF / traffic activity (Feature 10 & 16)
    // #1 — Updated LED offset for 24px radius
    if (n.status === 'compromised') {
      this.ctx.fillStyle = '#ef4444';
      this.ctx.beginPath();
      this.ctx.arc(nx + 16, ny - 16, 3, 0, Math.PI * 2);
      this.ctx.fill();
    } else {
      let isTrafficActive = Math.sin(Date.now() / 150 + nx) > 0.4;
      this.ctx.fillStyle = isTrafficActive ? '#10b981' : '#047857';
      this.ctx.beginPath();
      this.ctx.arc(nx + 16, ny - 16, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Call high-fidelity custom hardware vector rendering method (Icon Hardware Upgrades!)
    // #1 — Pass 24 as icon size (was 20)
    this.drawHardwareIcon(this.ctx, nx, ny, n.role || n.type, 24, primaryColor, n);

    // #7 — Pill label background for node ID
    this.ctx.font = '600 9px var(--font-sans), sans-serif';
    const idTextW = this.ctx.measureText(n.id).width;
    this.ctx.fillStyle = 'rgba(8,14,26,0.85)';
    this.ctx.strokeStyle = primaryColor;
    this.ctx.globalAlpha = 0.2;
    this.ctx.lineWidth = 0.8;
    this.ctx.beginPath();
    const pillW = idTextW + 10, pillH = 12;
    const pillX = nx - pillW / 2, pillY = ny + 24;
    if (this.ctx.roundRect) {
      this.ctx.roundRect(pillX, pillY, pillW, pillH, 6);
    } else {
      this.ctx.rect(pillX, pillY, pillW, pillH);
    }
    this.ctx.globalAlpha = 1.0;
    this.ctx.fill();
    this.ctx.stroke();

    // Metadata labels
    this.ctx.font = '600 9px var(--font-sans), sans-serif';
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.fillText(n.id, nx, ny + 34);

    // #6 — Scale-adaptive IP label hiding (hide below scale 0.45)
    if (this.scale >= 0.45) {
      this.ctx.font = '400 8px Fira Code';
      if (n.hasIpConflict) {
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fillText(n.ip + ' [!] CONFLICT', nx, ny + 44);
      } else {
        this.ctx.fillStyle = varColorText(n.status);
        this.ctx.fillText(n.ip, nx, ny + 44);
      }
    }

    // Note indicator: small amber dot top-right of node circle (#1 updated offset for r=24)
    if (n.note) {
      this.ctx.beginPath();
      this.ctx.arc(nx + 17, ny - 17, 4, 0, Math.PI * 2);
      this.ctx.fillStyle = '#f59e0b';
      this.ctx.fill();
      this.ctx.strokeStyle = '#0f172a';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }

    // IMP-49: Live annotation label (e.g. valve open%, level%)
    if (n._liveAnnotation) {
      this.ctx.fillStyle = 'rgba(15,23,42,0.85)';
      this.ctx.strokeStyle = '#6b9fe4';
      this.ctx.lineWidth = 0.8;
      this.drawRoundedRect(nx - 20, ny + 48, 40, 11, 3, true, true);
      this.ctx.fillStyle = '#6b9fe4';
      this.ctx.font = '700 7px Fira Code';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(n._liveAnnotation, nx, ny + 53.5);
    }

    // IMP-31: Search match highlight ring (updated radius for r=24)
    if (n._searchMatch === false) {
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, 26, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  addNode(node) {
    if (this.nodes.some(n => n.id === node.id)) return false;
    node.status = node.status || 'stable';
    node.firmware = node.firmware || 'v1.0.0-Active';
    node.os = node.os || 'Embedded OS';
    this.nodes.push(node);
    return true;
  }

  removeNode(nodeId) {
    const idx = this.nodes.findIndex(n => n.id === nodeId);
    if (idx === -1) return false;
    this.nodes.splice(idx, 1);
    this.links = this.links.filter(l => l.sourceId !== nodeId && l.targetId !== nodeId);
    this.particles = this.particles.filter(p => p.source.id !== nodeId && p.target.id !== nodeId);
    if (this.selectedNode && this.selectedNode.id === nodeId) {
      this.selectedNode = null;
      this.onNodeSelect(null);
    }
    return true;
  }

  addLink(sourceId, targetId, encrypted = false) {
    // Verify nodes exist
    if (!this.nodes.some(n => n.id === sourceId) || !this.nodes.some(n => n.id === targetId)) {
      return false;
    }
    if (this.links.some(l => (l.sourceId === sourceId && l.targetId === targetId) || (l.sourceId === targetId && l.targetId === sourceId))) {
      return false;
    }
    this.links.push({ sourceId, targetId, encrypted, status: 'normal' });
    return true;
  }

  removeLink(sourceId, targetId) {
    const originalLen = this.links.length;
    this.links = this.links.filter(l =>
      !((l.sourceId === sourceId && l.targetId === targetId) || (l.sourceId === targetId && l.targetId === sourceId))
    );
    return this.links.length < originalLen;
  }

  toWorld(screenX, screenY) {
    return {
      x: (screenX - this.panX) / this.scale,
      y: (screenY - this.panY) / this.scale
    };
  }

  getDeviceAt(worldX, worldY) {
    return this.nodes.find(n => {
      const dx = n.x - worldX;
      const dy = n.y - worldY;
      return Math.sqrt(dx * dx + dy * dy) < 25; // 25px radius
    });
  }

  getLinkAt(worldX, worldY) {
    return this.links.find(link => {
      const src = this.nodes.find(n => n.id === link.sourceId);
      const tgt = this.nodes.find(n => n.id === link.targetId);
      if (src && tgt) {
        const d = this.distToSegment({ x: worldX, y: worldY }, src, tgt);
        return d < 8; // 8px touch boundary
      }
      return false;
    });
  }

  distToSegment(p, v, w) {
    const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
    if (l2 === 0) return Math.sqrt((p.x - v.x) * (p.x - v.x) + (p.y - v.y) * (p.y - v.y));
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projection = {
      x: v.x + t * (w.x - v.x),
      y: v.y + t * (w.y - v.y)
    };
    return Math.sqrt((p.x - projection.x) * (p.x - projection.x) + (p.y - projection.y) * (p.y - projection.y));
  }

  clearTopology() {
    this.nodes = [];
    this.links = [];
    this.particles = [];
    this.selectedNode = null;
    this.onNodeSelect(null);
  }

  drawHardwareIcon(ctx, x, y, role, size, color, n) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;

    // Define helper to draw router arrows
    const drawArrow = (x1, y1, x2, y2) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - 4 * Math.cos(angle - Math.PI / 6), y2 - 4 * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - 4 * Math.cos(angle + Math.PI / 6), y2 - 4 * Math.sin(angle + Math.PI / 6));
      ctx.fill();
    };

    const roleLower = (role || '').toLowerCase();

    if (roleLower.includes('router')) {
      // Concentric circles with crosshair arrow routes (Cisco Style Router)
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.stroke();
      drawArrow(x - 14, y, x - 2, y);
      drawArrow(x + 14, y, x + 2, y);
      drawArrow(x, y - 14, x, y - 2);
      drawArrow(x, y + 14, x, y + 2);
    }
    else if (roleLower.includes('switch')) {
      // Wide Switch chassis with horizontal ethernet block shapes & swap arrows
      ctx.beginPath();
      ctx.rect(x - 15, y - 8, 30, 16);
      ctx.stroke();
      // Ethernet ports divider grid
      ctx.beginPath();
      ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y);
      ctx.moveTo(x - 5, y - 8); ctx.lineTo(x - 5, y + 8);
      ctx.moveTo(x + 5, y - 8); ctx.lineTo(x + 5, y + 8);
      ctx.stroke();
      // Small status LED dots
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(x - 11, y - 4, 1.5, 0, Math.PI * 2);
      ctx.arc(x - 1, y - 4, 1.5, 0, Math.PI * 2);
      ctx.arc(x + 9, y - 4, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    else if (roleLower.includes('firewall')) {
      // Brick pattern wall inside shield shape (Next-Generation Firewall)
      ctx.beginPath();
      ctx.moveTo(x, y - 15);
      ctx.quadraticCurveTo(x + 15, y - 15, x + 13, y + 3);
      ctx.quadraticCurveTo(x, y + 16, x, y + 16);
      ctx.quadraticCurveTo(x, y + 16, x - 13, y + 3);
      ctx.quadraticCurveTo(x - 15, y - 15, x, y - 15);
      ctx.closePath();
      ctx.stroke();

      // Draw brick joints
      ctx.beginPath();
      ctx.moveTo(x - 10, y - 6); ctx.lineTo(x + 10, y - 6);
      ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y);
      ctx.moveTo(x - 10, y + 6); ctx.lineTo(x + 10, y + 6);
      // Verticals
      ctx.moveTo(x - 4, y - 6); ctx.lineTo(x - 4, y);
      ctx.moveTo(x + 4, y - 6); ctx.lineTo(x + 4, y);
      ctx.moveTo(x, y); ctx.lineTo(x, y + 6);
      ctx.moveTo(x - 6, y); ctx.lineTo(x - 6, y + 6);
      ctx.moveTo(x + 6, y); ctx.lineTo(x + 6, y + 6);
      ctx.stroke();
    }
    else if (roleLower.includes('server') || roleLower.includes('directory')) {
      // Detailed Server Rack Frame
      ctx.beginPath();
      ctx.rect(x - 11, y - 15, 22, 30);
      ctx.stroke();
      // Draw drawers
      ctx.beginPath();
      ctx.rect(x - 8, y - 12, 16, 6);
      ctx.rect(x - 8, y - 3, 16, 6);
      ctx.rect(x - 8, y + 6, 16, 6);
      ctx.stroke();
      // Ports and drive activity LEDs
      ctx.fillStyle = '#6b9fe4';
      ctx.beginPath();
      ctx.arc(x - 5, y - 9, 1.2, 0, Math.PI * 2);
      ctx.arc(x - 5, y, 1.2, 0, Math.PI * 2);
      ctx.arc(x - 5, y + 9, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(x + 4, y - 9, 1, 0, Math.PI * 2);
      ctx.arc(x + 4, y, 1, 0, Math.PI * 2);
      ctx.arc(x + 4, y + 9, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    else if (roleLower.includes('workstation') || roleLower.includes('station') || roleLower.includes('ws') || roleLower.includes('pc')) {
      // High-end flat screen monitor and tower console
      ctx.beginPath();
      // Flat panel monitor outline
      ctx.rect(x - 14, y - 13, 22, 15);
      ctx.stroke();
      // Monitor base stand
      ctx.moveTo(x - 6, y + 2); ctx.lineTo(x - 6, y + 6);
      ctx.lineTo(x - 10, y + 6); ctx.lineTo(x - 2, y + 6);
      ctx.stroke();
      // Micro PC tower silhouette beside monitor
      ctx.beginPath();
      ctx.rect(x + 10, y - 13, 6, 20);
      ctx.stroke();
      // PC power LED
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(x + 13, y - 10, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    else if (roleLower.includes('hmi')) {
      // SCADA screen with visual dashboard layouts
      ctx.beginPath();
      ctx.rect(x - 15, y - 12, 30, 20);
      ctx.stroke();
      // Support stand
      ctx.moveTo(x - 5, y + 8); ctx.lineTo(x - 8, y + 12);
      ctx.lineTo(x + 8, y + 12); ctx.lineTo(x + 5, y + 8);
      ctx.stroke();
      // Graphic bars/grids inside screen
      ctx.beginPath();
      ctx.rect(x - 11, y - 8, 8, 12);
      ctx.stroke();
      // Telemetry dial shape
      ctx.beginPath();
      ctx.arc(x + 6, y - 2, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    else if (roleLower.includes('tank') || roleLower.includes('vessel') || roleLower.includes('t-300') || (n && n.id === 'T-300')) {
      // #9 — Cylindrical tank/vessel node
      ctx.beginPath();
      ctx.rect(x - 10, y - 12, 20, 22);
      ctx.stroke();
      // Top dome arc
      ctx.beginPath();
      ctx.arc(x, y - 12, 10, Math.PI, 0);
      ctx.stroke();
      // Bottom dome arc
      ctx.beginPath();
      ctx.arc(x, y + 10, 10, 0, Math.PI);
      ctx.stroke();
      // Level fill inside body
      const sim2 = window.appInstance?.sim;
      const lvl = sim2 ? sim2.level / 100 : 0.5;
      const bodyH = 22;
      const fillH = lvl * bodyH;
      // Temperature-based color
      const tmp = sim2 ? sim2.temp : 20;
      let fillC = 'rgba(45,125,210,0.5)';
      if (tmp > 75) fillC = 'rgba(239,68,68,0.5)';
      else if (tmp > 55) fillC = 'rgba(245,158,11,0.5)';
      ctx.save();
      ctx.fillStyle = fillC;
      ctx.beginPath();
      ctx.rect(x - 10, y - 12 + bodyH - fillH, 20, fillH);
      ctx.fill();
      ctx.restore();
    }
    else if (roleLower.includes('rtu') || roleLower.includes('field rtu')) {
      // #10 — RTU/Field instrument icon
      ctx.beginPath();
      ctx.rect(x - 11, y - 10, 22, 20);
      ctx.stroke();
      // Antenna
      ctx.beginPath();
      ctx.moveTo(x + 6, y - 10); ctx.lineTo(x + 6, y - 17);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 6, y - 17, 2, 0, Math.PI * 2);
      ctx.stroke();
      // Terminal screws (small squares at bottom)
      ctx.beginPath();
      ctx.rect(x - 9, y + 8, 4, 4);
      ctx.rect(x - 2, y + 8, 4, 4);
      ctx.stroke();
      // Wire stubs going down
      ctx.beginPath();
      ctx.moveTo(x - 7, y + 12); ctx.lineTo(x - 7, y + 16);
      ctx.moveTo(x, y + 12); ctx.lineTo(x, y + 16);
      ctx.stroke();
    }
    else if (roleLower.includes('sis') || roleLower.includes('safety')) {
      // #14 — SIS/Safety PLC with triangle warning border
      // Draw PLC body first
      ctx.beginPath();
      ctx.rect(x - 13, y - 14, 26, 28);
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(x - 9, y - 10, 18, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y - 6);
      ctx.stroke();
      ctx.beginPath();
      for (let i = -8; i <= 8; i += 4) {
        ctx.rect(x + i - 1.5, y + 4, 3, 5);
      }
      ctx.stroke();
      // Triangle warning border
      const ts = size * 1.1;
      ctx.save();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y - ts);
      ctx.lineTo(x + ts * 0.87, y + ts * 0.5);
      ctx.lineTo(x - ts * 0.87, y + ts * 0.5);
      ctx.closePath();
      ctx.stroke();
      // Exclamation mark
      ctx.fillStyle = '#fbbf24';
      ctx.font = '700 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', x, y + ts * 0.2);
      ctx.restore();
    }
    else if (roleLower.includes('dcs')) {
      // #12 — DCS controller icon: wide rack with 4 module slots
      ctx.beginPath();
      ctx.rect(x - 14, y - 12, 28, 24);
      ctx.stroke();
      const modColors = ['#10b981', '#6b9fe4', '#06b6d4', '#f59e0b'];
      const modW = 5, modH = 18;
      for (let i = 0; i < 4; i++) {
        const mx2 = x - 11 + i * 7;
        ctx.strokeStyle = modColors[i];
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(mx2, y - 9, modW, modH);
        ctx.stroke();
        // Colored top indicator
        ctx.fillStyle = modColors[i];
        ctx.beginPath();
        ctx.rect(mx2, y - 9, modW, 3);
        ctx.fill();
      }
      ctx.strokeStyle = color;
    }
    else if (roleLower.includes('historian')) {
      // #13 — Historian database icon: 3 stacked cylinders
      const discW = 14;
      [[y - 12, 6], [y - 4, 5], [y + 4, 4]].forEach(([cy, rh2]) => {
        ctx.beginPath();
        ctx.ellipse(x, cy, discW, rh2, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      // Body rects connecting first and last disc
      ctx.beginPath();
      ctx.moveTo(x - discW, y - 12); ctx.lineTo(x - discW, y + 4);
      ctx.moveTo(x + discW, y - 12); ctx.lineTo(x + discW, y + 4);
      ctx.stroke();
    }
    else if (roleLower.includes('vfd') || roleLower.includes('drive')) {
      // #15 — VFD/Drive waveform icon
      ctx.beginPath();
      ctx.rect(x - 12, y - 10, 24, 20);
      ctx.stroke();
      // AC sine wave: 3 periods across width
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const wStart = x - 10, wEnd = x + 10, wY = y;
      const periods = 3;
      for (let px2 = 0; px2 <= 20; px2++) {
        const xp = wStart + px2;
        const yp = wY + 5 * Math.sin((px2 / 20) * periods * Math.PI * 2);
        if (px2 === 0) ctx.moveTo(xp, yp); else ctx.lineTo(xp, yp);
      }
      ctx.stroke();
      ctx.restore();
    }
    else if (roleLower.includes('plc') || roleLower.includes('controller')) {
      // Modular industrial PLC block module with wire slot ports
      ctx.beginPath();
      ctx.rect(x - 13, y - 14, 26, 28);
      ctx.stroke();
      // Screen/display block
      ctx.beginPath();
      ctx.rect(x - 9, y - 10, 18, 8);
      ctx.stroke();
      // Screen text grid lines
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y - 6);
      ctx.stroke();
      // Wire slots rows
      ctx.beginPath();
      for (let i = -8; i <= 8; i += 4) {
        ctx.rect(x + i - 1.5, y + 4, 3, 5);
      }
      ctx.stroke();
      // #11 — PLC status LED strip (power=green, comms=blue, fault=red/grey)
      const ledColors = [
        '#10b981',  // power — green
        '#6b9fe4',  // comms — blue
        n && n.status === 'compromised' ? '#ef4444' : '#475569' // fault
      ];
      ledColors.forEach((lc, i) => {
        ctx.fillStyle = lc;
        ctx.beginPath();
        ctx.arc(x + 4 + i * 3.5, y - 13, 1.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    else if (roleLower.includes('actuator') || roleLower.includes('valve')) {
      // #8 — P&ID ISA bowtie butterfly valve
      // Left flange
      ctx.beginPath();
      ctx.rect(x - 14, y - 8, 4, 16);
      ctx.stroke();
      // Right flange
      ctx.beginPath();
      ctx.rect(x + 10, y - 8, 4, 16);
      ctx.stroke();
      // Horizontal pipe
      ctx.beginPath();
      ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y);
      ctx.stroke();
      // Bowtie disc: left triangle + right triangle
      const annPct = n && n._liveAnnotation ? (parseFloat(n._liveAnnotation) / 100) : 0;
      const discAlpha = 0.3 + (annPct > 0 ? annPct * 0.5 : 0);
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = discAlpha;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 8); ctx.lineTo(x - 8, y + 8); ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 8, y - 8); ctx.lineTo(x + 8, y + 8); ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 8); ctx.lineTo(x - 8, y + 8); ctx.lineTo(x, y);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 8, y - 8); ctx.lineTo(x + 8, y + 8); ctx.lineTo(x, y);
      ctx.closePath();
      ctx.stroke();
      // Stem
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x, y - 10);
      ctx.stroke();
      // Handwheel
      ctx.beginPath();
      ctx.arc(x, y - 13, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    else if (roleLower.includes('sensor') || roleLower.includes('meter')) {
      // Analog telemetry round pressure gauge dial
      ctx.beginPath();
      ctx.arc(x, y - 3, 11, 0, Math.PI * 2);
      ctx.stroke();
      // Stem adapter
      ctx.moveTo(x - 3, y + 8); ctx.lineTo(x - 3, y + 13);
      ctx.lineTo(x + 3, y + 13); ctx.lineTo(x + 3, y + 8);
      ctx.stroke();
      // Internal indicator pointer dial needle
      ctx.beginPath();
      ctx.moveTo(x, y - 3);
      ctx.lineTo(x + 6, y - 8);
      ctx.stroke();
    }
    else {
      // High contrast generic network card fallback
      ctx.beginPath();
      ctx.rect(x - 12, y - 12, 24, 24);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawDinRails() {
    // Draw visual cabinet DIN rails inside OT Subnet Boundary Area (Cabinet Cabinet mockups!)
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(71, 85, 105, 0.15)'; // steel grey rail trace
    this.ctx.lineWidth = 14;

    // Draw 3 metallic DIN rails horizontally across OT cabinet
    const railsY = [120, 220, 320];
    railsY.forEach(ry => {
      this.ctx.beginPath();
      this.ctx.moveTo(430, ry);
      this.ctx.lineTo(870, ry);
      this.ctx.stroke();

      // Inner mounting slot groove
      this.ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(430, ry);
      this.ctx.lineTo(870, ry);
      this.ctx.stroke();

      // Steel gray outer borders
      this.ctx.strokeStyle = 'rgba(71, 85, 105, 0.25)';
      this.ctx.lineWidth = 14;
    });

    this.ctx.restore();
  }

  drawServerCabinets() {
    // Draw visual server cabinets behind IT servers (Server Cabinets Upgrade!)
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(71, 85, 105, 0.1)';
    this.ctx.lineWidth = 1.5;

    // Draw server frame outlines inside IT Subnet Boundary Area
    const serversY = [120, 220, 320];
    serversY.forEach(sy => {
      this.ctx.beginPath();
      this.ctx.rect(40, sy - 20, 340, 40);
      this.ctx.stroke();

      // Draw grid lines inside server cabinets representing slots
      this.ctx.strokeStyle = 'rgba(71, 85, 105, 0.05)';
      this.ctx.beginPath();
      for (let x = 60; x < 380; x += 30) {
        this.ctx.moveTo(x, sy - 20);
        this.ctx.lineTo(x, sy + 20);
      }
      this.ctx.stroke();
    });

    this.ctx.restore();
  }

  drawHoverTooltip(n) {
    const ctx = this.ctx;
    ctx.save();

    // Position tooltip slightly above the node
    const tx = n.x + 25;
    const ty = n.y - 35;

    // Fluctuating CPU/RAM telemetry
    const seed = Date.now() / 1000 + n.x;
    const cpu = Math.floor(25 + Math.sin(seed) * 15 + (n.status === 'compromised' ? 40 : 0));
    const ram = Math.floor(45 + Math.cos(seed * 0.5) * 8);
    const uptime = Math.floor((Date.now() - (n.bootTime || Date.now() - 50000)) / 1000);
    const model = this.getHardwareModelName(n.role || n.type);
    const os = n.os || this.getHardwareOSName(n.role || n.type);

    const lines = [
      `ASSET: [${n.id}]`,
      `ROLE:  ${n.role || 'WORKSTATION'}`,
      `MODEL: ${model}`,
      `OS:    ${os}`,
      `IP:    ${n.ip || '0.0.0.0'}`,
      `CPU:   ${cpu}%  RAM: ${ram}%`,
      `UP:    ${uptime}s  OSPF: ${n.ospfState || 'N/A'}`
    ];

    // Draw tooltip backdrop card (glassmorphism)
    ctx.font = '700 7.5px Fira Code, monospace';
    let maxW = 0;
    lines.forEach(l => {
      const w = ctx.measureText(l).width;
      if (w > maxW) maxW = w;
    });

    const cardW = maxW + 16;
    const cardH = lines.length * 10 + 10;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = '#6b9fe4';
    ctx.lineWidth = 1;
    this.drawRoundedRect(tx, ty, cardW, cardH, 6, true, true);

    // Draw text lines
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    lines.forEach((l, idx) => {
      // Highlight asset header cyan
      if (idx === 0) ctx.fillStyle = '#6b9fe4';
      else if (idx === 5 && cpu > 70) ctx.fillStyle = '#f87171'; // Warning red for high cpu
      else ctx.fillStyle = '#cbd5e1';

      ctx.fillText(l, tx + 8, ty + 6 + idx * 10);
    });

    ctx.restore();
  }

  getHardwareModelName(role) {
    const r = (role || '').toLowerCase();
    if (r.includes('router')) return 'Cisco Catalyst 8300';
    if (r.includes('switch')) return 'Cisco Catalyst 9300';
    if (r.includes('firewall')) return 'Cisco Firepower 4110';
    if (r.includes('server') || r.includes('directory')) return 'Dell PowerEdge R750';
    if (r.includes('hmi')) return 'Industrial HMI Display';
    if (r.includes('plc') || r.includes('controller')) return 'Cisco Catalyst Industrial PLC';
    if (r.includes('actuator') || r.includes('valve')) return 'Rotork IQ3 Valve Controller';
    if (r.includes('sensor')) return 'Rosemount Telemetry Unit';
    return 'Generic Host Terminal';
  }

  getHardwareOSName(role) {
    const r = (role || '').toLowerCase();
    if (r.includes('router') || r.includes('switch')) return 'Cisco IOS-XE v17.9.3';
    if (r.includes('firewall')) return 'FortiOS / PAN-OS';
    if (r.includes('server') || r.includes('directory')) return 'Windows Server 2022';
    if (r.includes('plc') || r.includes('controller')) return 'Embedded VxWorks RTOS';
    if (r.includes('actuator') || r.includes('sensor')) return 'MicroPython Core v1.21';
    if (r.includes('workstation') || r.includes('station') || r.includes('engineer') || r.includes('pc')) return 'Windows 11 Enterprise';
    if (r.includes('hmi') || r.includes('scada')) return 'Windows LTSC 2021';
    if (r.includes('soc') || r.includes('security')) return 'Linux (Hardened)';
    return 'Linux / Generic Host';
  }

  // ── Battle Mode Visual Effects ─────────────────────────────────────────────

  flashBattleEffect(nodeId, team) {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return;
    this.battleEffects = this.battleEffects.filter(e => e.nodeId !== nodeId);

    const numP = 24;
    const particles = [];
    if (team === 'red') {
      for (let i = 0; i < numP; i++) {
        const a = (i / numP) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
        const speed = 55 + Math.random() * 90;
        particles.push({
          a, speed,
          r: 1.5 + Math.random() * 3.5,
          color: ['#ef4444','#f97316','#dc2626','#b91c1c','#fbbf24','#ff6b6b'][Math.floor(Math.random()*6)],
          lifespan: 0.45 + Math.random() * 0.5,
          delay:    Math.random() * 0.15,
          gravity:  18 + Math.random() * 25,
        });
      }
    } else {
      // Inward converging particles
      for (let i = 0; i < numP; i++) {
        const a = (i / numP) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const startR = 58 + Math.random() * 28;
        particles.push({
          a, startR,
          r: 1.5 + Math.random() * 2.5,
          color: ['#2d7dd2','#00d4ff','#60a5fa','#38bdf8','#7dd3fc'][Math.floor(Math.random()*5)],
          lifespan: 0.5 + Math.random() * 0.4,
          delay:    Math.random() * 0.1,
        });
      }
    }

    this.battleEffects.push({ nodeId, team, startTs: Date.now(), duration: 1900, particles, nodeX: node.x, nodeY: node.y });
  }

  addAttackArc(fromId, toId) {
    const from = this.nodes.find(n => n.id === fromId);
    const to   = this.nodes.find(n => n.id === toId);
    if (!from || !to) return;
    const points = this._genLightning(from.x, from.y, to.x, to.y, 4);
    this.battleArcs.push({ points, startTs: Date.now(), duration: 900 });
    this.flashBattleEffect(toId, 'red');
  }

  _genLightning(x1, y1, x2, y2, depth) {
    if (depth === 0) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    const perp = { x: -(y2 - y1), y: x2 - x1 };
    const len  = Math.sqrt(perp.x * perp.x + perp.y * perp.y) || 1;
    const disp = (Math.random() - 0.5) * len * 0.45;
    const mx = (x1 + x2) / 2 + (perp.x / len) * disp;
    const my = (y1 + y2) / 2 + (perp.y / len) * disp;
    return [
      ...this._genLightning(x1, y1, mx, my, depth - 1),
      ...this._genLightning(mx, my, x2, y2, depth - 1).slice(1),
    ];
  }

  // ── Kill Chain Trail ───────────────────────────────────────────────────────
  _drawKillChainTrail() {
    if (!this.killChainVisible || this.killChainPath.length < 2) return;
    const ctx  = this.ctx;
    const now  = Date.now();
    const path = this.killChainPath;

    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1];
      const to   = path[i];
      const age  = (now - to.ts) / 1000;
      const alpha = Math.max(0.1, Math.min(0.9, 1 - age * 0.05));

      ctx.save();
      ctx.strokeStyle = `rgba(239,68,68,${alpha})`;
      ctx.lineWidth   = 3;
      ctx.shadowBlur  = 14;
      ctx.shadowColor = '#ef4444';
      const dashOffset = (now / 60) % 20;
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = -dashOffset;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle    = 'rgba(239,68,68,0.9)';
      ctx.shadowBlur   = 6;
      ctx.shadowColor  = '#ef4444';
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      ctx.beginPath();
      ctx.arc(midX, midY, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font      = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i, midX, midY);
      ctx.restore();
    }

    path.forEach((pt, i) => {
      const pulse = 1 + 0.3 * Math.sin(now / 300 + i);
      ctx.save();
      ctx.strokeStyle = i === 0 ? 'rgba(251,191,36,0.8)' : i === path.length - 1 ? 'rgba(239,68,68,1)' : 'rgba(239,68,68,0.6)';
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 10;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 14 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  updateKillChainFromBattle(battle) {
    if (!battle?.red?.actionLog) return;
    const log = [...battle.red.actionLog].reverse();
    this.killChainPath = [];
    for (const entry of log) {
      if (entry.nodeId) {
        const node = this.nodes.find(n => n.id === entry.nodeId);
        if (node) this.killChainPath.push({ x: node.x, y: node.y, nodeId: node.id, ts: entry.ts });
      }
    }
  }

  // ── Blast Radius ───────────────────────────────────────────────────────────
  showBlastRadius(nodeId) {
    const adj = {};
    for (const n of this.nodes) adj[n.id] = [];
    for (const l of this.links) {
      const s = l.sourceId || l.source?.id || l.source;
      const t = l.targetId || l.target?.id || l.target;
      if (adj[s]) adj[s].push(t);
      if (adj[t]) adj[t].push(s);
    }
    const visited = new Set([nodeId]);
    const queue   = [nodeId];
    const depths  = { [nodeId]: 0 };
    while (queue.length) {
      const cur = queue.shift();
      for (const nb of (adj[cur] || [])) {
        if (!visited.has(nb)) {
          visited.add(nb); queue.push(nb);
          depths[nb] = depths[cur] + 1;
        }
      }
    }
    this.blastRadiusData = { origin: nodeId, depths };
  }

  clearBlastRadius() { this.blastRadiusData = null; }

  _drawBlastRadius() {
    if (!this.blastRadiusData) return;
    const ctx = this.ctx;
    const { origin, depths } = this.blastRadiusData;
    for (const [nid, depth] of Object.entries(depths)) {
      const node = this.nodes.find(n => n.id === nid);
      if (!node || nid === origin) continue;
      const alpha  = Math.max(0.05, 0.5 - depth * 0.1);
      const radius = 20 + depth * 4;
      ctx.save();
      const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius);
      const hue  = depth === 1 ? '239,68,68' : depth === 2 ? '251,146,60' : '250,204,21';
      grad.addColorStop(0, `rgba(${hue},${alpha * 1.5})`);
      grad.addColorStop(1, `rgba(${hue},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${hue},${alpha * 2})`;
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${alpha * 2})`;
      ctx.font      = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`+${depth}`, node.x, node.y + 26);
      ctx.restore();
    }
  }

  // ── Zero-Day Surface ───────────────────────────────────────────────────────
  _drawZeroDaySurface() {
    const ctx = this.ctx;
    const now = Date.now();
    for (const nodeId of this.zeroDayNodes) {
      const node = this.nodes.find(n => n.id === nodeId);
      if (!node) continue;
      const pulse = 0.5 + 0.5 * Math.sin(now / 400);
      ctx.save();
      ctx.strokeStyle = `rgba(251,191,36,${0.4 + pulse * 0.4})`;
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 16;
      ctx.shadowColor = '#fbbf24';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(node.x, node.y, 18 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(251,191,36,${0.08 + pulse * 0.08})`;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 18 + pulse * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(251,191,36,${0.6 + pulse * 0.3})`;
      ctx.font      = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ BLIND SPOT', node.x, node.y - 22);
      ctx.restore();
    }
  }

  // ── Segmentation Gaps ──────────────────────────────────────────────────────
  _drawSegmentationGaps() {
    const ctx = this.ctx;
    const now = Date.now();
    for (const gap of this.segmentationGaps) {
      if (!gap.via) continue;
      [gap.from, gap.via, gap.to].forEach((n, i) => {
        if (!n) return;
        ctx.save();
        ctx.strokeStyle = `rgba(251,191,36,0.6)`;
        ctx.lineWidth   = 2;
        ctx.shadowBlur  = 10;
        ctx.shadowColor = '#fbbf24';
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -(now / 80) % 20;
        if (i < 2) {
          const next = [gap.via, gap.to][i];
          if (next) {
            ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(next.x, next.y); ctx.stroke();
          }
        }
        ctx.restore();
      });
      if (gap.via) {
        ctx.save();
        ctx.fillStyle = 'rgba(251,191,36,0.9)';
        ctx.font      = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⚡NO FW', gap.via.x, gap.via.y + 28);
        ctx.restore();
      }
    }
  }

  _drawEvolutionHeatMap() {
    const ctx      = this.ctx;
    const heatMap  = this.evolutionHeatMap || {};
    const edgeMap  = this.evolutionEdgeMap || {};
    const maxHeat  = Math.max(...Object.values(heatMap), 1);

    // Draw hot edges first
    for (const [key, count] of Object.entries(edgeMap)) {
      const [fromId, toId] = key.split('→');
      const from = this.nodes.find(n => n.id === fromId);
      const to   = this.nodes.find(n => n.id === toId);
      if (!from || !to) continue;
      const alpha = Math.min(0.8, count / maxHeat * 0.9 + 0.1);
      ctx.save();
      ctx.strokeStyle = `rgba(239,68,68,${alpha})`;
      ctx.lineWidth   = 1.5 + (count / maxHeat) * 4;
      ctx.shadowBlur  = 12;
      ctx.shadowColor = '#ef4444';
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }

    // Draw node heat circles
    for (const [nodeId, count] of Object.entries(heatMap)) {
      const node = this.nodes.find(n => n.id === nodeId);
      if (!node) continue;
      const intensity = count / maxHeat;
      const radius    = 18 + intensity * 22;
      const alpha     = 0.12 + intensity * 0.25;
      ctx.save();
      const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, radius);
      grad.addColorStop(0, `rgba(239,68,68,${alpha * 2})`);
      grad.addColorStop(0.5, `rgba(239,68,68,${alpha})`);
      grad.addColorStop(1, 'rgba(239,68,68,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Heat count badge
      ctx.font      = 'bold 9px monospace';
      ctx.fillStyle = `rgba(255,180,180,${0.5 + intensity * 0.5})`;
      ctx.textAlign = 'center';
      ctx.fillText(`${count}×`, node.x, node.y - 20);
      ctx.restore();
    }
  }

  _drawBattleEffects() {
    if (!this.battleEffects.length && !this.battleArcs.length) return;
    const now = Date.now();
    const ctx  = this.ctx;

    // Prune expired
    this.battleEffects = this.battleEffects.filter(e => now - e.startTs < e.duration);
    this.battleArcs    = this.battleArcs.filter(a => now - a.startTs < a.duration);

    // Lightning arcs (drawn before nodes for depth)
    for (const arc of this.battleArcs) {
      const t = (now - arc.startTs) / arc.duration;
      const alpha = Math.sin(t * Math.PI) * 0.9;
      ctx.save();
      // Outer glow
      ctx.strokeStyle = `rgba(239,68,68,${alpha * 0.35})`;
      ctx.lineWidth = 5;
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      arc.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
      // Core
      ctx.strokeStyle = `rgba(255,180,180,${alpha * 0.95})`;
      ctx.lineWidth = 1.2;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      arc.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.restore();
    }

    // Node effects
    for (const e of this.battleEffects) {
      const t  = (now - e.startTs) / e.duration;
      const nx = e.nodeX, ny = e.nodeY;
      ctx.save();

      if (e.team === 'red') {
        // ── RED ATTACK EFFECT ──────────────────────────────────────
        const dt = e.duration / 1000; // seconds

        // 1. Initial flash burst (t < 0.12)
        if (t < 0.12) {
          const fa = (1 - t / 0.12);
          ctx.fillStyle = `rgba(255,80,80,${fa * 0.55})`;
          ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 30;
          ctx.beginPath(); ctx.arc(nx, ny, 35 * (1 - fa * 0.3), 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }

        // 2. Particles bursting outward
        for (const p of e.particles) {
          const localT = (t - p.delay) / p.lifespan;
          if (localT < 0 || localT > 1) continue;
          const dist = p.speed * localT * dt;
          const grav = p.gravity * (localT * dt) * (localT * dt);
          const px = nx + Math.cos(p.a) * dist;
          const py = ny + Math.sin(p.a) * dist + grav;
          const pa = (1 - localT) * (1 - localT); // quadratic fade
          ctx.globalAlpha = pa;
          ctx.shadowColor = p.color; ctx.shadowBlur = 6;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(px, py, p.r * (1 - localT * 0.4), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;

        // 3. Expanding concentric rings
        [{ baseR: 18, speed: 55, w: 2.5, a: 0.9 }, { baseR: 12, speed: 38, w: 1.2, a: 0.55 }, { baseR: 8, speed: 22, w: 0.7, a: 0.35 }].forEach(ring => {
          const r = ring.baseR + ring.speed * t * dt;
          const ra = (1 - t) * ring.a;
          ctx.strokeStyle = `rgba(239,68,68,${ra})`;
          ctx.lineWidth = ring.w;
          ctx.shadowColor = `rgba(239,68,68,${ra * 0.6})`; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.arc(nx, ny, r, 0, Math.PI * 2); ctx.stroke();
        });
        ctx.shadowBlur = 0;

        // 4. Glitch scan lines (t 0.05–0.35)
        if (t > 0.05 && t < 0.35) {
          const ga = (0.35 - t) / 0.3;
          const numLines = 5 + Math.floor(t * 12);
          for (let i = 0; i < numLines; i++) {
            const ly = ny - 28 + (i / numLines) * 56;
            const lw = 18 + Math.random() * 30;
            const lx = nx - lw / 2 + (Math.random() - 0.5) * 10;
            ctx.fillStyle = `rgba(239,68,68,${ga * (0.08 + Math.random() * 0.12)})`;
            ctx.fillRect(lx, ly, lw, 1 + Math.random() * 2);
          }
        }

        // 5. Crosshair targeting reticle
        const rSize = 22 + (1 - Math.min(1, t * 3)) * 16;
        const ra2 = Math.max(0, 1 - t * 1.4);
        ctx.strokeStyle = `rgba(239,68,68,${ra2 * 0.8})`;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(nx, ny, rSize, 0, Math.PI * 2); ctx.stroke();
        [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dx, dy]) => {
          ctx.beginPath();
          ctx.moveTo(nx + dx * (rSize + 4), ny + dy * (rSize + 4));
          ctx.lineTo(nx + dx * (rSize + 14), ny + dy * (rSize + 14));
          ctx.stroke();
        });
        ctx.shadowBlur = 0;

        // 6. "EXPLOITED" floating text
        if (t > 0.1 && t < 0.85) {
          const ta = Math.sin((t - 0.1) / 0.75 * Math.PI) * 0.9;
          const ty2 = ny - 40 - (t - 0.1) * 28;
          ctx.globalAlpha = ta;
          ctx.font = 'bold 8px "Fira Code", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ef4444';
          ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 10;
          ctx.fillText('EXPLOITED', nx, ty2);
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;

      } else {
        // ── BLUE DEFEND EFFECT ─────────────────────────────────────
        const dt = e.duration / 1000;

        // 1. Flash
        if (t < 0.1) {
          const fa = 1 - t / 0.1;
          ctx.fillStyle = `rgba(45,125,210,${fa * 0.45})`;
          ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 25;
          ctx.beginPath(); ctx.arc(nx, ny, 38, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }

        // 2. Particles converging inward
        for (const p of e.particles) {
          const localT = (t - p.delay) / p.lifespan;
          if (localT < 0 || localT > 1) continue;
          const startPx = nx + Math.cos(p.a) * p.startR;
          const startPy = ny + Math.sin(p.a) * p.startR;
          const px = startPx + (nx - startPx) * localT * localT; // ease in
          const py = startPy + (ny - startPy) * localT * localT;
          const pa = (1 - localT * 0.85);
          ctx.globalAlpha = pa;
          ctx.shadowColor = p.color; ctx.shadowBlur = 7;
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(px, py, p.r * (1 - localT * 0.5), 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;

        // 3. Hexagonal shield pattern
        if (t < 0.8) {
          const hexAlpha = Math.sin(t / 0.8 * Math.PI) * 0.75;
          const hexR = 42 - t * 18;
          ctx.strokeStyle = `rgba(45,125,210,${hexAlpha})`;
          ctx.lineWidth = 1.8;
          ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 10;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const ha = (i / 6) * Math.PI * 2 - Math.PI / 6;
            i === 0 ? ctx.moveTo(nx + Math.cos(ha) * hexR, ny + Math.sin(ha) * hexR)
                    : ctx.lineTo(nx + Math.cos(ha) * hexR, ny + Math.sin(ha) * hexR);
          }
          ctx.closePath(); ctx.stroke();
          // Inner hex
          ctx.strokeStyle = `rgba(0,212,255,${hexAlpha * 0.5})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const ha = (i / 6) * Math.PI * 2 - Math.PI / 6;
            const r2 = hexR * 0.6;
            i === 0 ? ctx.moveTo(nx + Math.cos(ha) * r2, ny + Math.sin(ha) * r2)
                    : ctx.lineTo(nx + Math.cos(ha) * r2, ny + Math.sin(ha) * r2);
          }
          ctx.closePath(); ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // 4. Contracting ring
        const ringR = 50 - t * 30;
        const ringA = (1 - t) * 0.8;
        ctx.strokeStyle = `rgba(45,125,210,${ringA})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(nx, ny, Math.max(0, ringR), 0, Math.PI * 2); ctx.stroke();

        // 5. Lock icon (t > 0.3)
        if (t > 0.3 && t < 0.9) {
          const la = Math.sin((t - 0.3) / 0.6 * Math.PI) * 0.95;
          ctx.globalAlpha = la;
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 8;
          // Lock body
          ctx.beginPath(); ctx.roundRect(nx - 7, ny - 2, 14, 11, 2); ctx.stroke();
          // Lock shackle
          ctx.beginPath();
          ctx.arc(nx, ny - 2, 5, Math.PI, 0);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // 6. "CONTAINED" floating text
        if (t > 0.12 && t < 0.88) {
          const ta = Math.sin((t - 0.12) / 0.76 * Math.PI) * 0.9;
          const ty2 = ny - 42 - (t - 0.12) * 22;
          ctx.globalAlpha = ta;
          ctx.font = 'bold 8px "Fira Code", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#22c55e';
          ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 10;
          ctx.fillText('CONTAINED', nx, ty2);
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }
  }

  // ── Feature 13: Battle Packets ──────────────────────────────────────────────
  spawnBattlePacket(srcNodeId, dstNodeId, color) {
    const src = this.nodes.find(n => n.id === srcNodeId);
    const dst = this.nodes.find(n => n.id === dstNodeId);
    if (!src || !dst) return;
    this.battlePackets.push({
      srcX: src.x, srcY: src.y, dstX: dst.x, dstY: dst.y,
      t: 0, color: color || '#ef4444', speed: 0.012 + Math.random() * 0.008,
    });
  }

  _drawBattlePackets() {
    const ctx = this.ctx;
    const now = Date.now();
    for (let i = this.battlePackets.length - 1; i >= 0; i--) {
      const p = this.battlePackets[i];
      p.t += p.speed;
      if (p.t >= 1) { this.battlePackets.splice(i, 1); continue; }
      const px = p.srcX + (p.dstX - p.srcX) * p.t;
      const py = p.srcY + (p.dstY - p.srcY) * p.t;
      const alpha = p.t < 0.1 ? p.t / 0.1 : p.t > 0.85 ? (1 - p.t) / 0.15 : 1;
      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2); ctx.fill();
      // Trailing fade dot
      const trailT = Math.max(0, p.t - 0.04);
      const tx2 = p.srcX + (p.dstX - p.srcX) * trailT;
      const ty2 = p.srcY + (p.dstY - p.srcY) * trailT;
      ctx.globalAlpha = alpha * 0.3;
      ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(tx2, ty2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // ── Feature 15: Stealth Meters ───────────────────────────────────────────────
  updateStealthOnAttack(nodeId) {
    if (!this.stealthLevels[nodeId]) this.stealthLevels[nodeId] = 100;
    this.stealthLevels[nodeId] = Math.max(0, this.stealthLevels[nodeId] - 15 - Math.random() * 10);
  }

  updateStealthOnDefend(nodeId) {
    if (!this.stealthLevels[nodeId]) this.stealthLevels[nodeId] = 50;
    this.stealthLevels[nodeId] = Math.min(100, this.stealthLevels[nodeId] + 10);
  }

  _drawStealthMeters() {
    const ctx = this.ctx;
    const now = Date.now();
    for (const node of this.nodes) {
      if (!this.stealthLevels[node.id]) this.stealthLevels[node.id] = 100;
      // Slowly recover stealth on non-compromised nodes
      if (node.status !== 'compromised') {
        this.stealthLevels[node.id] = Math.min(100, this.stealthLevels[node.id] + 0.02);
      } else {
        this.stealthLevels[node.id] = Math.max(0, this.stealthLevels[node.id] - 0.02);
      }
      const s = this.stealthLevels[node.id];
      const color = s > 70 ? '#22c55e' : s > 40 ? '#f59e0b' : '#ef4444';
      const nx = node.x, ny = node.y;
      const arcR = 18, arcY = ny + 42;
      const startA = Math.PI * 1.1, endA = Math.PI * 1.9;
      const fillA = startA + (endA - startA) * (s / 100);
      ctx.save();
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      // Background arc
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.arc(nx, arcY, arcR, startA, endA); ctx.stroke();
      // Fill arc
      ctx.strokeStyle = color;
      ctx.shadowColor = color; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(nx, arcY, arcR, startA, fillA); ctx.stroke();
      ctx.shadowBlur = 0;
      // Label
      ctx.fillStyle = color;
      ctx.font = '7px "Fira Code", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.85;
      ctx.fillText(Math.round(s), nx, arcY + 8);
      ctx.restore();
    }
  }

  // ── Feature 22: Idle Traffic ─────────────────────────────────────────────────
  _drawIdleTraffic() {
    if (!this.links.length) return;
    const ctx = this.ctx;
    const now = Date.now() / 1000;
    for (const link of this.links) {
      const src = this.nodes.find(n => n.id === link.sourceId);
      const tgt = this.nodes.find(n => n.id === link.targetId);
      if (!src || !tgt || link.status === 'offline') continue;
      const bw = link.bandwidth || 0.3;
      const speed = 0.08 + bw * 0.12;
      // Draw 3 evenly-spaced dots per link, offset by time
      for (let i = 0; i < 3; i++) {
        const offset = (i / 3);
        const t = ((now * speed + offset) % 1);
        const px = src.x + (tgt.x - src.x) * t;
        const py = src.y + (tgt.y - src.y) * t;
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }
}

function varColorText(status) {
  if (status === 'compromised') return '#ff0055';
  if (status === 'isolated') return '#ffaa00';
  return '#8a99ad';
}

// Linear interpolation helper for colour blending
function lerp(a, b, t) {
  return a + (b - a) * t;
}
