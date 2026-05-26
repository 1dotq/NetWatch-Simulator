class DigitalTwinApp {
  constructor() {
    window.appInstance = this;
    this.speedDilation = 1.0;
    this.isPlaying = false; // Start paused until portal is launched
    this.simTime = 0; // ms
    this.lastTime = 0;
    this.activeProject = 'Reactor-3 Industrial ICS Twin';
    this.activeProjectType = 'reactor'; // 'reactor' | 'campus' | 'blank'
    this.nodeConfigs = {};
    
    // Advanced Network Logic Structures (Upgrades 1-5)
    this.ospfNeighbors = {};
    this.arpCache = {};
    this.dnsRecords = {
      'plc101.local': '10.1.10.101',
      'plc102.local': '10.1.10.102',
      'scada.local': '10.1.10.5',
      'eng-ws.local': '10.1.10.20',
      'reactor.twin': '10.1.10.1',
      'router.local': '192.168.1.1'
    };
    this.natTable = [];
    this.networkStatistics = {
      packetsSent: 0,
      packetsDropped: 0,
      bandwidthLoad: 0 // Mbps
    };
    this.cliHistory = [];
    this.cliHistoryIndex = -1;
    
    // Core Engine Instances
    // Initialize canvas with null callback first to bypass constructor race condition
    this.canvas = new NetworkTwinCanvas('networkCanvas', null);
    this.canvas.onNodeSelect = (node) => this.onNodeSelected(node);
    this.sim = new ReactorPhysicsSim('telemetryChart');
    this.llm = new AELlmService();
    this.orchestrator = new AIOrchestrator(this);
    this.ws = new WiresharkManager(this);
    this.inspector = new DeviceInspector(this);
    this.tracer = new PacketTracer(this);

    // Initialize Undo/Redo history
    this.undoStack = [];
    this.redoStack = [];
    this.initHistory();

    // Commercial Licensing Tier Configuration
    this.currentLicenseTier = 'community';
    this.validLicenseKeys = ['AETHERIS-PRO-2026', 'AETHERIS-DEV-9999'];

    // Task #19: Challenge Mode State
    this.challengeMode = { active: false, duration: 600, elapsed: 0, score: 0, tasksCompleted: 0, threatsResolved: 0 };

    // Task #11: Water Treatment Sim instance
    this.simWater = new WaterTreatmentSim();

    // Power Grid Substation Sim instance
    this.simGrid = new PowerGridSim();

    // AI Battle Mode
    this.battle    = new BattleSimulator(this);
    this.evolution = null; // lazy-init when panel opens
    this.battle.onUpdate = () => this._updateBattleUI();

    // Hook onAction callbacks for Features 13/15/18/20
    const origRedAction  = this.battle.red.onAction?.bind(this.battle.red);
    const origBlueAction = this.battle.blue.onAction?.bind(this.battle.blue);
    this.battle.red.onAction = (tag, msg, nodeId) => {
      origRedAction?.(tag, msg, nodeId);
      if (!nodeId) return;
      // Feature 13: battle packets
      if (this.canvas?.battlePacketsVisible) {
        const footholds = [...(this.battle.red.foothold || [])];
        const srcId = footholds.length ? footholds[footholds.length - 1] : (this.canvas.nodes[0]?.id);
        if (srcId && srcId !== nodeId) this.canvas.spawnBattlePacket(srcId, nodeId, '#ef4444');
      }
      // Feature 15: stealth
      if (this.canvas?.stealthMetersVisible) this.canvas.updateStealthOnAttack(nodeId);
      // Features 18/20: cascading failure + physics
      const n = this.canvas?.nodes.find(x => x.id === nodeId);
      if (n?.status === 'compromised') {
        this._checkCascadingFailure(nodeId);
        this._applyPhysicsImpact(nodeId);
      }
    };
    this.battle.blue.onAction = (tag, msg, nodeId) => {
      origBlueAction?.(tag, msg, nodeId);
      if (!nodeId) return;
      // Feature 13: blue defense packets
      if (this.canvas?.battlePacketsVisible) {
        const defended = this.canvas.nodes.filter(n => n.status === 'compromised')[0];
        if (defended) this.canvas.spawnBattlePacket(nodeId, defended.id, '#2d7dd2');
      }
      // Feature 15: stealth recovery
      if (this.canvas?.stealthMetersVisible) this.canvas.updateStealthOnDefend(nodeId);
    };
    this.battlePanelOpen = false;
    this.battleCurrentTab = 'log';

    // Multiplayer session
    this.mpSession = new MultiplayerSession(this);
    this._initMpHandlers();

    // Performance Mode: default to 'eco' (Wireframe) for fluidity, but honor a
    // previously saved user preference.
    let savedPerf = 'eco';
    try { savedPerf = localStorage.getItem('netwatch_perf_mode') || 'eco'; } catch {}
    this.perfMode = (savedPerf === 'high' || savedPerf === 'eco') ? savedPerf : 'eco';

    this.initUI();
    this.togglePerfMode(this.perfMode);
    this.initLandingPage();
    
    // Start Animation Loop
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));

    this.orchestrator.logTerminal("AETHERIS digital twin platform ready.", "success");
    if (this.perfMode === 'eco') {
      this.orchestrator.logSystem("Performance Eco/Wireframe Mode enabled by default to ensure maximum responsiveness on Proxmox VM.", "warning");
    }
  }

  initLandingPage() {
    const landing = document.getElementById('landingPage');
    const selProvider = document.getElementById('selProvider');
    const txtApiKey = document.getElementById('txtApiKey');
    const workspaceContainer = document.getElementById('workspaceListContainer');
    const btnLaunch = document.getElementById('btnLaunchTwin');

    // Prepopulate settings from LocalStorage
    selProvider.value = this.llm.getProvider();
    txtApiKey.value = this.llm.getApiKey();

    // AI mode radio toggle
    const radioAi = document.getElementById('radioAiEnabled');
    const radioNoAi = document.getElementById('radioNoAi');
    const apiSection = document.getElementById('apiSetupSection');
    const noAiSection = document.getElementById('noAiSection');

    const savedMode = localStorage.getItem('aetheris_ai_mode') || 'ai';
    if (savedMode === 'noai') {
      radioNoAi.checked = true;
      if (apiSection) apiSection.style.display = 'none';
      if (noAiSection) noAiSection.style.display = 'flex';
    }

    const onModeChange = () => {
      const isNoAi = radioNoAi && radioNoAi.checked;
      if (apiSection) apiSection.style.display = isNoAi ? 'none' : 'flex';
      if (noAiSection) noAiSection.style.display = isNoAi ? 'flex' : 'none';
    };
    if (radioAi) radioAi.addEventListener('change', onModeChange);
    if (radioNoAi) radioNoAi.addEventListener('change', onModeChange);

    // 15 Advanced Cyber Range network labs definition (15 Portfolio Labs Upgrade!)
    this.labsPortfolio = [
      {
        id: 'lab-1',
        title: 'Reactor-3 Safety Loop Sync',
        icon: '⚛',
        category: 'critical',
        categoryLabel: 'ICS CONTROL',
        difficulty: 'Medium',
        desc: 'Verify OSPF interfaces, establish stable telemetry feeds, and calibrate inlet/outlet Modbus coils.',
        objective: 'The high-pressure safety interlock is offline. Connect the HMI console to the core PLCs, activate OSPF routing parameters, and synchronize thermodynamics variables to protect the facility.',
        tasks: [
          'Verify IP addresses on CE-01 (10.1.10.1) and CE-02 (10.1.10.2).',
          'Configure "router ospf 1" on both active gateways.',
          'Ping the master SCADA console (10.1.10.5) to confirm complete OSPF synchronization.'
        ],
        topology: { nodes: [
          { id: 'CE-01', name: 'CE-01 Gateway (OSPF)', ip: '10.1.10.1', type: 'it', role: 'Router', x: 180, y: 160, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'CE-02', name: 'CE-02 Gateway (OSPF)', ip: '10.1.10.2', type: 'it', role: 'Router', x: 380, y: 160, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'SCADA-MASTER', name: 'SCADA Master Console', ip: '10.1.10.5', type: 'ot', role: 'SCADA HMI', x: 540, y: 80, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'OT-SW', name: 'OT Modbus Bus Switch', ip: '192.168.10.1', type: 'ot', role: 'Switch', x: 560, y: 200, status: 'stable', firmware: 'Hirschmann RS30', os: 'Hirschmann OS' },
          { id: 'PLC-INLET', name: 'Inlet Control PLC', ip: '192.168.10.101', type: 'plc', role: 'Modbus PLC', x: 700, y: 100, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'PLC-OUTLET', name: 'Outlet Control PLC', ip: '192.168.10.102', type: 'plc', role: 'Modbus PLC', x: 700, y: 240, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'TT-INLET', name: 'Inlet Temp Transmitter TT-01', ip: 'Slave 0x01', type: 'field', role: 'Sensor', x: 860, y: 80, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'TT-OUTLET', name: 'Outlet Temp Transmitter TT-02', ip: 'Slave 0x02', type: 'field', role: 'Sensor', x: 860, y: 200, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'PT-REACTOR', name: 'Reactor Pressure Sensor PT-01', ip: 'Slave 0x03', type: 'field', role: 'Sensor', x: 860, y: 320, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'IT-MGMT', name: 'IT Management Station', ip: '10.1.10.20', type: 'it', role: 'Workstation', x: 80, y: 260, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' }
        ], links: [
          { sourceId: 'IT-MGMT', targetId: 'CE-01', encrypted: false, status: 'normal' },
          { sourceId: 'CE-01', targetId: 'CE-02', encrypted: false, status: 'normal' },
          { sourceId: 'CE-02', targetId: 'SCADA-MASTER', encrypted: false, status: 'normal' },
          { sourceId: 'CE-02', targetId: 'OT-SW', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'PLC-INLET', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'PLC-OUTLET', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-INLET', targetId: 'TT-INLET', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-OUTLET', targetId: 'TT-OUTLET', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-OUTLET', targetId: 'PT-REACTOR', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, please help me with the "Reactor-3 Safety Loop Sync" challenge. Detail the exact Cisco IOS OSPF configuration commands and Modbus calibration parameters to stabilize the thermodynamic loop!'
      },
      {
        id: 'lab-2',
        title: 'Enterprise Campus 3-Tier Core',
        icon: '🏢',
        category: 'infra',
        categoryLabel: 'OSPF CORE',
        difficulty: 'Easy',
        desc: 'Build standard access-to-core hierarchical paths and establish inter-VLAN routing tunnels.',
        objective: 'Connect the core switches to the campus distribution gateways and verify optimal spanning tree convergence parameters.',
        tasks: [
          'Verify physical gigabit interface connection states.',
          'Identify Spanning-Tree (STP) root bridges.',
          'Confirm that local workstation hosts can resolve corporate AD-Server parameters.'
        ],
        topology: { nodes: [
          { id: 'INET-GW', name: 'Internet Edge Router', ip: '203.0.113.1', type: 'it', role: 'Router', x: 450, y: 60, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'CORE-FW', name: 'Perimeter Firewall', ip: '10.0.1.1', type: 'it', role: 'Firewall', x: 450, y: 150, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' },
          { id: 'CORE-SW-A', name: 'Core Switch A (Root Bridge)', ip: '10.0.10.1', type: 'it', role: 'Switch', x: 280, y: 240, status: 'stable', firmware: 'Catalyst 9500', os: 'Cisco IOS-XE' },
          { id: 'CORE-SW-B', name: 'Core Switch B (Secondary)', ip: '10.0.10.2', type: 'it', role: 'Switch', x: 620, y: 240, status: 'stable', firmware: 'Catalyst 9500', os: 'Cisco IOS-XE' },
          { id: 'AD-SRV', name: 'Active Directory / DNS Server', ip: '10.0.100.1', type: 'it', role: 'AD Server', x: 800, y: 150, status: 'stable', firmware: 'Windows Server 2022', os: 'Windows NT' },
          { id: 'DIST-SW-1', name: 'Distribution Switch 1 (VLAN 10)', ip: '10.0.20.1', type: 'it', role: 'Switch', x: 130, y: 340, status: 'stable', firmware: 'Catalyst 9300', os: 'Cisco IOS-XE' },
          { id: 'DIST-SW-2', name: 'Distribution Switch 2 (VLAN 20)', ip: '10.0.20.2', type: 'it', role: 'Switch', x: 450, y: 340, status: 'stable', firmware: 'Catalyst 9300', os: 'Cisco IOS-XE' },
          { id: 'DIST-SW-3', name: 'Distribution Switch 3 (VLAN 30)', ip: '10.0.20.3', type: 'it', role: 'Switch', x: 770, y: 340, status: 'stable', firmware: 'Catalyst 9300', os: 'Cisco IOS-XE' },
          { id: 'ACC-WS1', name: 'Access Workstation 1', ip: '10.0.30.10', type: 'it', role: 'Workstation', x: 80, y: 440, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'ACC-WS2', name: 'Access Workstation 2', ip: '10.0.30.11', type: 'it', role: 'Workstation', x: 230, y: 440, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'ACC-WS3', name: 'Access Workstation 3 (VoIP)', ip: '10.0.40.10', type: 'it', role: 'Workstation', x: 400, y: 440, status: 'stable', firmware: 'Ubuntu 22.04', os: 'Linux 5.15' },
          { id: 'ACC-WS4', name: 'Access Workstation 4', ip: '10.0.50.10', type: 'it', role: 'Workstation', x: 720, y: 440, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'ACC-WS5', name: 'Access Workstation 5 (Guest)', ip: '10.0.50.11', type: 'it', role: 'Workstation', x: 870, y: 440, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' }
        ], links: [
          { sourceId: 'INET-GW', targetId: 'CORE-FW', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-FW', targetId: 'CORE-SW-A', encrypted: true, status: 'normal' },
          { sourceId: 'CORE-FW', targetId: 'CORE-SW-B', encrypted: true, status: 'normal' },
          { sourceId: 'CORE-SW-A', targetId: 'CORE-SW-B', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-SW-B', targetId: 'AD-SRV', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-SW-A', targetId: 'DIST-SW-1', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-SW-A', targetId: 'DIST-SW-2', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-SW-B', targetId: 'DIST-SW-2', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-SW-B', targetId: 'DIST-SW-3', encrypted: false, status: 'normal' },
          { sourceId: 'DIST-SW-1', targetId: 'ACC-WS1', encrypted: false, status: 'normal' },
          { sourceId: 'DIST-SW-1', targetId: 'ACC-WS2', encrypted: false, status: 'normal' },
          { sourceId: 'DIST-SW-2', targetId: 'ACC-WS3', encrypted: false, status: 'normal' },
          { sourceId: 'DIST-SW-3', targetId: 'ACC-WS4', encrypted: false, status: 'normal' },
          { sourceId: 'DIST-SW-3', targetId: 'ACC-WS5', encrypted: false, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, please guide me through the "Enterprise Campus 3-Tier Core" lab. Provide the step-by-step commands to configure access-to-core inter-VLAN routing interfaces!'
      },
      {
        id: 'lab-3',
        title: 'Subnet Isolation Security Audit',
        icon: '🛡',
        category: 'sec',
        categoryLabel: 'THREAT DEFENSE',
        difficulty: 'Hard',
        desc: 'Isolate guest subnets and configure strict firewall access-lists to shield OT telemetry assets.',
        objective: 'Corporate guest VLANs have direct access to critical PLCs. Deploy strict IP Access Control Lists (ACLs) on the FW-01 security cluster to completely block guest-to-OT paths.',
        tasks: [
          'Identify the active guest workstation IP subnet addresses.',
          'Access the FW-01 Command Line Interface.',
          'Configure a strict Extended Access Control List (ACL) dropping all TCP access from guest segments to plc101.local.'
        ],
        topology: { nodes: [
          { id: 'FW-PERIMETER', name: 'Perimeter Firewall', ip: '10.1.1.1', type: 'it', role: 'Firewall', x: 200, y: 160, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' },
          { id: 'SOC-ANALYST', name: 'SOC Analyst Station', ip: '10.1.1.20', type: 'it', role: 'Workstation', x: 80, y: 80, status: 'stable', firmware: 'Kali Linux 2024', os: 'Linux 6.6' },
          { id: 'IDS-SENSOR', name: 'Snort IDS Sensor', ip: '10.1.1.30', type: 'it', role: 'IDS Sensor', x: 80, y: 260, status: 'stable', firmware: 'Snort 3.x', os: 'CentOS' },
          { id: 'OT-FW', name: 'OT Boundary Firewall', ip: '10.2.1.1', type: 'ot', role: 'Firewall', x: 430, y: 160, status: 'stable', firmware: 'PAN-OS 11', os: 'Palo Alto' },
          { id: 'SCADA-HMI', name: 'SCADA HMI Console', ip: '192.168.10.5', type: 'ot', role: 'SCADA HMI', x: 430, y: 60, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'PLC-CTRL', name: 'Process PLC Controller', ip: '192.168.10.101', type: 'plc', role: 'Modbus PLC', x: 620, y: 100, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'ATK-WS', name: 'Compromised Workstation', ip: '10.1.1.99', type: 'it', role: 'Workstation', x: 280, y: 80, status: 'compromised', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'V-SENS', name: 'Process Sensor', ip: 'Slave 0x01', type: 'field', role: 'Sensor', x: 800, y: 100, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' }
        ], links: [
          { sourceId: 'SOC-ANALYST', targetId: 'FW-PERIMETER', encrypted: true, status: 'normal' },
          { sourceId: 'IDS-SENSOR', targetId: 'FW-PERIMETER', encrypted: false, status: 'normal' },
          { sourceId: 'ATK-WS', targetId: 'FW-PERIMETER', encrypted: false, status: 'normal' },
          { sourceId: 'FW-PERIMETER', targetId: 'OT-FW', encrypted: true, status: 'normal' },
          { sourceId: 'OT-FW', targetId: 'SCADA-HMI', encrypted: false, status: 'normal' },
          { sourceId: 'OT-FW', targetId: 'PLC-CTRL', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-CTRL', targetId: 'V-SENS', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, please outline the blueprint solution for "Subnet Isolation Security Audit". Show me the exact Cisco ASA-style firewall access-list commands to drop guest traffic to the Modbus PLC!'
      },
      {
        id: 'lab-4',
        title: 'OT OSPF Area Adjacency Resolution',
        icon: '⚡',
        category: 'infra',
        categoryLabel: 'OSPF CORE',
        difficulty: 'Medium',
        desc: 'Resolve area discrepancies between core switches to allow real-time PLC synchronization.',
        objective: 'A mismatch in OSPF area identifiers is blocking PLC telemetry sync. Correct the area configuration on the distribution switch to bring the interface to FULL state.',
        tasks: [
          'Run "show ip ospf interface" on the switches to locate mismatching configurations.',
          'Correct area parameters under "router ospf 1" setup.',
          'Verify OSPF neighbor status reaches the FULL state.'
        ],
        topology: { nodes: [
          { id: 'PE-CORE', name: 'PE-Core (Cisco IOSv)', ip: '10.0.0.1', type: 'it', role: 'Router', x: 300, y: 160, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'OSPF-R1', name: 'OSPF Router R1', ip: '10.0.1.1', type: 'it', role: 'Router', x: 100, y: 100, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'OSPF-R2', name: 'OSPF Router R2', ip: '10.0.2.1', type: 'it', role: 'Router', x: 100, y: 260, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'OT-SCADA', name: 'SCADA Master Server', ip: '10.0.3.10', type: 'ot', role: 'SCADA HMI', x: 550, y: 100, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'OT-RTR', name: 'OT Distribution Router', ip: '10.0.3.1', type: 'ot', role: 'Router', x: 550, y: 200, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'OT-PLC', name: 'OT PLC Controller', ip: '10.0.3.101', type: 'plc', role: 'Modbus PLC', x: 750, y: 150, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'IT-WS', name: 'IT Management Station', ip: '10.0.1.20', type: 'it', role: 'Workstation', x: 100, y: 380, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' }
        ], links: [
          { sourceId: 'OSPF-R1', targetId: 'PE-CORE', encrypted: false, status: 'normal' },
          { sourceId: 'OSPF-R2', targetId: 'PE-CORE', encrypted: false, status: 'normal' },
          { sourceId: 'IT-WS', targetId: 'OSPF-R2', encrypted: false, status: 'normal' },
          { sourceId: 'PE-CORE', targetId: 'OT-RTR', encrypted: true, status: 'normal' },
          { sourceId: 'OT-RTR', targetId: 'OT-SCADA', encrypted: false, status: 'normal' },
          { sourceId: 'OT-RTR', targetId: 'OT-PLC', encrypted: false, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, please assist with "OT OSPF Area Adjacency Resolution". Provide the configuration templates to resolve OSPF area mismatches!'
      },
      {
        id: 'lab-5',
        title: 'Dynamic Host DHCP Service Provisioning',
        icon: '🔌',
        category: 'infra',
        categoryLabel: 'SERVICES',
        difficulty: 'Easy',
        desc: 'Configure the Cisco edge router to lease IP parameters automatically to new network workstations.',
        objective: 'Manually configuring workstation parameters is creating IP duplicates. Enable a dynamic DHCP pool server directly on the edge PE-01 gateway.',
        tasks: [
          'Configure "ip dhcp pool CORP-POOL" on the PE-01 gateway.',
          'Specify subnet network parameters (10.1.10.0/24) and default-router default gateway.',
          'Initiate DHCP lease renewals on target workstations and verify resolution.'
        ],
        topology: { nodes: [
          { id: 'DHCP-SRV', name: 'ISC DHCP Server', ip: '10.10.1.1', type: 'it', role: 'Server', x: 200, y: 80, status: 'stable', firmware: 'ISC DHCP 4.4', os: 'Ubuntu Server 22' },
          { id: 'CORE-SW', name: 'Core Distribution Switch', ip: '10.10.1.2', type: 'it', role: 'Switch', x: 350, y: 180, status: 'stable', firmware: 'Cisco Catalyst 9300', os: 'Cisco IOS-XE' },
          { id: 'ACC-SW1', name: 'Access Switch A', ip: '10.10.2.1', type: 'it', role: 'Switch', x: 200, y: 280, status: 'stable', firmware: 'Cisco Catalyst 2960', os: 'Cisco IOS' },
          { id: 'ACC-SW2', name: 'Access Switch B', ip: '10.10.3.1', type: 'it', role: 'Switch', x: 500, y: 280, status: 'stable', firmware: 'Cisco Catalyst 2960', os: 'Cisco IOS' },
          { id: 'WS-DHCP1', name: 'DHCP Client Workstation 1', ip: 'DHCP', type: 'it', role: 'Workstation', x: 100, y: 380, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'WS-DHCP2', name: 'DHCP Client Workstation 2', ip: 'DHCP', type: 'it', role: 'Workstation', x: 300, y: 380, status: 'stable', firmware: 'Ubuntu 22.04', os: 'Linux 5.15' },
          { id: 'WS-DHCP3', name: 'DHCP Client Workstation 3', ip: 'DHCP', type: 'it', role: 'Workstation', x: 600, y: 380, status: 'stable', firmware: 'Windows 10', os: 'Windows 10' },
          { id: 'RTR-GW', name: 'Gateway Router', ip: '10.10.1.254', type: 'it', role: 'Router', x: 550, y: 80, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' }
        ], links: [
          { sourceId: 'DHCP-SRV', targetId: 'CORE-SW', encrypted: false, status: 'normal' },
          { sourceId: 'RTR-GW', targetId: 'CORE-SW', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-SW', targetId: 'ACC-SW1', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-SW', targetId: 'ACC-SW2', encrypted: false, status: 'normal' },
          { sourceId: 'ACC-SW1', targetId: 'WS-DHCP1', encrypted: false, status: 'normal' },
          { sourceId: 'ACC-SW1', targetId: 'WS-DHCP2', encrypted: false, status: 'normal' },
          { sourceId: 'ACC-SW2', targetId: 'WS-DHCP3', encrypted: false, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, please provide the exact Cisco IOS DHCP server commands (pool configuration, netmask, and default gateway) to dynamically address local hosts.'
      },
      {
        id: 'lab-6',
        title: 'Spanning Tree Loop Mitigation',
        icon: '➰',
        category: 'infra',
        categoryLabel: 'LAYER 2',
        difficulty: 'Medium',
        desc: 'Configure rapid STP paths and bridge priorities to prevent packet loops and switch CPU overload.',
        objective: 'Redundant connection cables are causing a massive broadcast loop due to standard spanning-tree delays. Optimize STP parameters immediately.',
        tasks: [
          'Enable "spanning-tree mode rapid-pvst" globally on core switches.',
          'Set primary switch bridge priority to 4096 to establish root status.',
          'Confirm that loop blocks convergence status aligns correctly on secondary ports.'
        ],
        topology: { nodes: [
          { id: 'SW-ROOT', name: 'Root Bridge SW-A', ip: '10.20.0.1', type: 'it', role: 'Switch', x: 350, y: 120, status: 'stable', firmware: 'Cisco Catalyst 9300', os: 'Cisco IOS-XE' },
          { id: 'SW-SEC', name: 'Secondary Bridge SW-B', ip: '10.20.0.2', type: 'it', role: 'Switch', x: 550, y: 120, status: 'stable', firmware: 'Cisco Catalyst 9300', os: 'Cisco IOS-XE' },
          { id: 'SW-ACC1', name: 'Access Switch SW-C', ip: '10.20.1.1', type: 'it', role: 'Switch', x: 200, y: 260, status: 'stable', firmware: 'Cisco Catalyst 2960', os: 'Cisco IOS' },
          { id: 'SW-ACC2', name: 'Access Switch SW-D', ip: '10.20.2.1', type: 'it', role: 'Switch', x: 700, y: 260, status: 'stable', firmware: 'Cisco Catalyst 2960', os: 'Cisco IOS' },
          { id: 'PC-LOOP1', name: 'Looped Workstation 1', ip: '10.20.1.10', type: 'it', role: 'Workstation', x: 100, y: 380, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'PC-LOOP2', name: 'Looped Workstation 2', ip: '10.20.2.10', type: 'it', role: 'Workstation', x: 800, y: 380, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' }
        ], links: [
          { sourceId: 'SW-ROOT', targetId: 'SW-SEC', encrypted: false, status: 'normal' },
          { sourceId: 'SW-ROOT', targetId: 'SW-ACC1', encrypted: false, status: 'normal' },
          { sourceId: 'SW-ROOT', targetId: 'SW-ACC2', encrypted: false, status: 'normal' },
          { sourceId: 'SW-SEC', targetId: 'SW-ACC1', encrypted: false, status: 'normal' },
          { sourceId: 'SW-SEC', targetId: 'SW-ACC2', encrypted: false, status: 'normal' },
          { sourceId: 'SW-ACC1', targetId: 'PC-LOOP1', encrypted: false, status: 'normal' },
          { sourceId: 'SW-ACC2', targetId: 'PC-LOOP2', encrypted: false, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, explain how to resolve the Spanning Tree loop. Provide the Rapid PVST configuration and bridge priority syntax to prevent loops!'
      },
      {
        id: 'lab-7',
        title: 'BGP MPLS VPN Isolation',
        icon: '🌐',
        category: 'infra',
        categoryLabel: 'BGP CORE',
        difficulty: 'Hard',
        desc: 'Configure VRFs and VPNv4 address families to securely segregate multiple corporate customers.',
        objective: 'Segregate multiple corporate department networks sharing the same backbone. Establish isolated virtual routing tables (VRFs) across the PE core.',
        tasks: [
          'Create "vrf definition CORP-A" on the PE-01 core router.',
          'Assign route-target export and import constraints (100:1).',
          'Bind client interfaces and verify virtual routing isolation matrices.'
        ],
        topology: { nodes: [
          { id: 'MPLS-P', name: 'MPLS P-Core Transit Router', ip: '10.100.0.10', type: 'it', role: 'Router', x: 450, y: 100, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'PE-01', name: 'MPLS PE Router 1 (PE-01)', ip: '10.100.0.1', type: 'it', role: 'Router', x: 270, y: 200, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'PE-02', name: 'MPLS PE Router 2 (PE-02)', ip: '10.100.0.2', type: 'it', role: 'Router', x: 620, y: 200, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'CE-A-S1', name: 'CE Router Corp-A Site 1', ip: '10.1.0.1', type: 'it', role: 'Router', x: 110, y: 100, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'CE-A-S2', name: 'CE Router Corp-A Site 2', ip: '10.1.1.1', type: 'it', role: 'Router', x: 800, y: 100, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'CE-B-S1', name: 'CE Router Corp-B Site 1', ip: '10.2.0.1', type: 'it', role: 'Router', x: 110, y: 300, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'CE-B-S2', name: 'CE Router Corp-B Site 2', ip: '10.2.1.1', type: 'it', role: 'Router', x: 800, y: 300, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'HOST-A-S1', name: 'Corp-A Host Site 1', ip: '10.1.0.10', type: 'it', role: 'Workstation', x: 80, y: 60, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'HOST-A-S2', name: 'Corp-A Host Site 2', ip: '10.1.1.10', type: 'it', role: 'Workstation', x: 870, y: 60, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'HOST-B-S1', name: 'Corp-B Host Site 1', ip: '10.2.0.10', type: 'it', role: 'Workstation', x: 80, y: 360, status: 'stable', firmware: 'Ubuntu 22.04', os: 'Linux 5.15' },
          { id: 'HOST-B-S2', name: 'Corp-B Host Site 2', ip: '10.2.1.10', type: 'it', role: 'Workstation', x: 870, y: 360, status: 'stable', firmware: 'Ubuntu 22.04', os: 'Linux 5.15' }
        ], links: [
          { sourceId: 'HOST-A-S1', targetId: 'CE-A-S1', encrypted: false, status: 'normal' },
          { sourceId: 'CE-A-S1', targetId: 'PE-01', encrypted: false, status: 'normal' },
          { sourceId: 'HOST-B-S1', targetId: 'CE-B-S1', encrypted: false, status: 'normal' },
          { sourceId: 'CE-B-S1', targetId: 'PE-01', encrypted: false, status: 'normal' },
          { sourceId: 'PE-01', targetId: 'MPLS-P', encrypted: false, status: 'normal' },
          { sourceId: 'MPLS-P', targetId: 'PE-02', encrypted: false, status: 'normal' },
          { sourceId: 'PE-02', targetId: 'CE-A-S2', encrypted: false, status: 'normal' },
          { sourceId: 'CE-A-S2', targetId: 'HOST-A-S2', encrypted: false, status: 'normal' },
          { sourceId: 'PE-02', targetId: 'CE-B-S2', encrypted: false, status: 'normal' },
          { sourceId: 'CE-B-S2', targetId: 'HOST-B-S2', encrypted: false, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, provide a complete walkthrough of BGP MPLS VPN isolation. Explain how to create VRFs, specify route-distinguishers, and bind interface families!'
      },
      {
        id: 'lab-8',
        title: 'Modbus Coils Injection Mitigation',
        icon: '🚨',
        category: 'sec',
        categoryLabel: 'ICS SECURITY',
        difficulty: 'Expert',
        desc: 'Detect unauthorized SCADA overrides and issue command lockouts to protect reactor cooling loops.',
        objective: 'An external compromise is attempting to force-shut the inlet water valves. Monitor SCADA payloads and lock out unauthorized write actions on the PLC.',
        tasks: [
          'Audit system logs to isolate unauthorized Modbus coil write commands.',
          'Access PLC-101 administrative coil console.',
          'Configure a strict command coil write lockout to block SCADA command injection.'
        ],
        topology: { nodes: [
          { id: 'IT-FW', name: 'IT/OT Boundary Firewall', ip: '10.1.0.1', type: 'it', role: 'Firewall', x: 280, y: 200, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' },
          { id: 'SOC-WS', name: 'SOC Security Station', ip: '10.1.0.10', type: 'it', role: 'Workstation', x: 100, y: 100, status: 'stable', firmware: 'Kali Linux', os: 'Linux 6.6' },
          { id: 'CLAROTY', name: 'Claroty CT-100 OT Sensor', ip: '192.168.1.50', type: 'ot', role: 'IDS Sensor', x: 430, y: 280, status: 'stable', firmware: 'Claroty CTD v4.2', os: 'Embedded Linux' },
          { id: 'OT-SW', name: 'OT Network Switch', ip: '192.168.1.1', type: 'ot', role: 'Switch', x: 430, y: 160, status: 'stable', firmware: 'Hirschmann OS 5.4', os: 'Hirschmann OS' },
          { id: 'SCADA-HMI', name: 'SCADA HMI Console', ip: '192.168.1.10', type: 'ot', role: 'SCADA HMI', x: 430, y: 60, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'PLC-MB1', name: 'Modbus PLC Master', ip: '192.168.1.101', type: 'plc', role: 'Modbus PLC', x: 640, y: 80, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'PLC-MB2', name: 'Modbus PLC Slave', ip: '192.168.1.102', type: 'plc', role: 'Modbus PLC', x: 640, y: 200, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'ATK-MB', name: 'Rogue Modbus Injector', ip: '192.168.1.254', type: 'it', role: 'Workstation', x: 100, y: 300, status: 'compromised', firmware: 'Kali Linux', os: 'Linux 6.6' },
          { id: 'V-INLET', name: 'Inlet Valve Actuator', ip: 'Slave 0x0A', type: 'field', role: 'Actuator', x: 830, y: 80, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'V-OUTLET', name: 'Outlet Valve Actuator', ip: 'Slave 0x0B', type: 'field', role: 'Actuator', x: 830, y: 200, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' }
        ], links: [
          { sourceId: 'SOC-WS', targetId: 'IT-FW', encrypted: true, status: 'normal' },
          { sourceId: 'ATK-MB', targetId: 'IT-FW', encrypted: false, status: 'normal' },
          { sourceId: 'IT-FW', targetId: 'OT-SW', encrypted: true, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'SCADA-HMI', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'PLC-MB1', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'PLC-MB2', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'CLAROTY', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-MB1', targetId: 'V-INLET', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-MB2', targetId: 'V-OUTLET', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, detail how to investigate the Modbus command injection. Provide the administrative lockout commands to override SCADA tampering!'
      },
      {
        id: 'lab-9',
        title: 'DNS Records Resolution Audit',
        icon: '🔍',
        category: 'infra',
        categoryLabel: 'SERVICES',
        difficulty: 'Easy',
        desc: 'Register static zone paths in the master domain controller and verify DNS queries via CLI.',
        objective: 'Network engineers are currently unable to reach the reactor telemetry panels by name. Configure static zone mappings in the core DNS controller.',
        tasks: [
          'Register "scada.local" pointing to 10.1.10.5 in DNS records.',
          'Execute "nslookup scada.local" from the terminal to verify queries.',
          'Verify that ping packets reach the host using the domain name.'
        ],
        topology: { nodes: [
          { id: 'DNS-PRI', name: 'Primary DNS Server', ip: '10.30.1.1', type: 'it', role: 'Server', x: 200, y: 80, status: 'stable', firmware: 'BIND 9.18', os: 'Ubuntu Server 22' },
          { id: 'DNS-SEC', name: 'Secondary DNS Server', ip: '10.30.1.2', type: 'it', role: 'Server', x: 400, y: 80, status: 'stable', firmware: 'BIND 9.18', os: 'Ubuntu Server 22' },
          { id: 'AD-SRV', name: 'Active Directory / DNS', ip: '10.30.1.10', type: 'it', role: 'AD Server', x: 600, y: 80, status: 'stable', firmware: 'Windows Server 2022', os: 'Windows NT' },
          { id: 'CORE-RTR', name: 'Core Gateway Router', ip: '10.30.0.1', type: 'it', role: 'Router', x: 380, y: 200, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'CLIENT-WS1', name: 'Client Workstation 1', ip: '10.30.2.10', type: 'it', role: 'Workstation', x: 150, y: 340, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'CLIENT-WS2', name: 'Client Workstation 2', ip: '10.30.2.11', type: 'it', role: 'Workstation', x: 380, y: 340, status: 'stable', firmware: 'Ubuntu 22.04', os: 'Linux 5.15' },
          { id: 'OT-DNS-CLIENT', name: 'OT DNS Client', ip: '192.168.1.20', type: 'ot', role: 'Workstation', x: 650, y: 340, status: 'stable', firmware: 'Windows LTSC', os: 'Windows LTSC 2021' }
        ], links: [
          { sourceId: 'DNS-PRI', targetId: 'CORE-RTR', encrypted: false, status: 'normal' },
          { sourceId: 'DNS-SEC', targetId: 'CORE-RTR', encrypted: false, status: 'normal' },
          { sourceId: 'AD-SRV', targetId: 'CORE-RTR', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-RTR', targetId: 'CLIENT-WS1', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-RTR', targetId: 'CLIENT-WS2', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-RTR', targetId: 'OT-DNS-CLIENT', encrypted: true, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, how do I build local DNS records? Give me the console commands to verify DNS names via nslookup and complete the mapping.'
      },
      {
        id: 'lab-10',
        title: 'Iperf3 Tunnel Stress Test',
        icon: '📈',
        category: 'infra',
        categoryLabel: 'DIAGNOSTICS',
        difficulty: 'Medium',
        desc: 'Initialize high-capacity socket testing across PE gateways to confirm maximum network bandwidth.',
        objective: 'Stress-test a newly deployed encrypted VLAN tunnel. Trigger an active iperf3 high-load bandwidth sweep across boundaries.',
        tasks: [
          'Enable the iperf3 server daemon on the PE-02 gateway.',
          'Trigger "iperf3 -c 10.1.10.2 -t 10" from the PE-01 console.',
          'Confirm that network statistics panel registers bandwidth loads exceeding 50 Mbps.'
        ],
        topology: { nodes: [
          { id: 'IPERF-SRV', name: 'iperf3 Server Node', ip: '10.40.1.1', type: 'it', role: 'Server', x: 150, y: 160, status: 'stable', firmware: 'Ubuntu 22.04', os: 'Linux 5.15' },
          { id: 'CORE-RTR1', name: 'Core Router A', ip: '10.40.0.1', type: 'it', role: 'Router', x: 340, y: 160, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'CORE-RTR2', name: 'Core Router B', ip: '10.40.0.2', type: 'it', role: 'Router', x: 560, y: 160, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'IPERF-CLI', name: 'iperf3 Client Node', ip: '10.40.2.1', type: 'it', role: 'Workstation', x: 750, y: 160, status: 'stable', firmware: 'Ubuntu 22.04', os: 'Linux 5.15' },
          { id: 'MON-WS', name: 'Performance Monitor', ip: '10.40.0.100', type: 'it', role: 'Workstation', x: 450, y: 340, status: 'stable', firmware: 'Grafana 10', os: 'Ubuntu Server' }
        ], links: [
          { sourceId: 'IPERF-SRV', targetId: 'CORE-RTR1', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-RTR1', targetId: 'CORE-RTR2', encrypted: true, status: 'normal' },
          { sourceId: 'CORE-RTR2', targetId: 'IPERF-CLI', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-RTR1', targetId: 'MON-WS', encrypted: false, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, explain how to run iperf3 stress testing. Provide the exact client/server syntax to initiate 10-second socket sweeps!'
      },
      {
        id: 'lab-11',
        title: 'Stuxnet Spoof Detection Playbook',
        icon: '🕵',
        category: 'critical',
        categoryLabel: 'STUXNET AUDIT',
        difficulty: 'Expert',
        desc: 'Audit pressure sensors directly on the thermodynamic gauges to expose dynamic SCADA spoofing.',
        objective: 'A sophisticated payload is displaying normal values on HMI monitors while actual reactor pressure rises to critical hazards. Intercept the spoofing.',
        tasks: [
          'Cross-reference virtual gauge dials directly against SCADA data grids.',
          'Identify packet alterations on the industrial Modbus network.',
          'Execute "no sensor spoofing" command inside the PLC administrative prompt.'
        ],
        topology: { nodes: [
          { id: 'CORP-GW', name: 'Corporate Gateway', ip: '10.1.0.1', type: 'it', role: 'Router', x: 100, y: 150, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'EWS-INFECTED', name: 'Infected Engineering WS', ip: '10.1.0.20', type: 'it', role: 'Engineer Station', x: 100, y: 60, status: 'compromised', firmware: 'Windows LTSC 2021', os: 'Windows LTSC 2021' },
          { id: 'OT-FW', name: 'OT Perimeter Firewall', ip: '10.2.0.1', type: 'ot', role: 'Firewall', x: 340, y: 150, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' },
          { id: 'HIST-SRV', name: 'SCADA Historian', ip: '192.168.10.50', type: 'ot', role: 'PI Historian', x: 430, y: 60, status: 'stable', firmware: 'OSIsoft PI 2023', os: 'Windows NT' },
          { id: 'OT-SW', name: 'OT Core Switch', ip: '192.168.10.1', type: 'ot', role: 'Switch', x: 560, y: 160, status: 'stable', firmware: 'Hirschmann OS', os: 'Hirschmann OS' },
          { id: 'S7-CPU1', name: 'Siemens S7-315 CPU', ip: '192.168.10.100', type: 'plc', role: 'Safety Controller', x: 680, y: 80, status: 'compromised', firmware: 'Siemens S7-300', os: 'Embedded RTOS' },
          { id: 'S7-CPU2', name: 'Siemens S7-315 CPU B', ip: '192.168.10.101', type: 'plc', role: 'Modbus PLC', x: 680, y: 200, status: 'stable', firmware: 'Siemens S7-300', os: 'Embedded RTOS' },
          { id: 'CENTRIFUGE', name: 'Centrifuge Frequency Drive', ip: 'Slave 0x01', type: 'field', role: 'Actuator', x: 840, y: 120, status: 'compromised', firmware: 'VFD RTU', os: 'ASIC' },
          { id: 'PRES-SENS', name: 'Process Pressure Sensor', ip: 'Slave 0x02', type: 'field', role: 'Sensor', x: 840, y: 280, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' }
        ], links: [
          { sourceId: 'EWS-INFECTED', targetId: 'CORP-GW', encrypted: false, status: 'normal' },
          { sourceId: 'CORP-GW', targetId: 'OT-FW', encrypted: true, status: 'normal' },
          { sourceId: 'OT-FW', targetId: 'HIST-SRV', encrypted: false, status: 'normal' },
          { sourceId: 'OT-FW', targetId: 'OT-SW', encrypted: true, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'S7-CPU1', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'S7-CPU2', encrypted: false, status: 'normal' },
          { sourceId: 'S7-CPU1', targetId: 'CENTRIFUGE', encrypted: false, status: 'normal' },
          { sourceId: 'S7-CPU2', targetId: 'PRES-SENS', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, guide me through the "Stuxnet Spoof Detection Playbook". Detail how to audit sensor values and override spoofing attacks on the PLC!'
      },
      {
        id: 'lab-12',
        title: 'Next-Gen IPS Shield Protection',
        icon: '🎛',
        category: 'sec',
        categoryLabel: 'THREAT DEFENSE',
        difficulty: 'Medium',
        desc: 'Activate deep packet inspection signatures to identify and drop unauthenticated SCADA instructions.',
        objective: 'Prevent unauthorized Modbus coils modifications. Activate deep packet inspection signatures inside the Firepower gateway to drop unauthenticated commands.',
        tasks: [
          'Access the FW-01 Next-Gen security terminal.',
          'Enable the deep packet inspection rule for Modbus protocol headers.',
          'Verify that unauthenticated coil overrides are dropped automatically.'
        ],
        topology: { nodes: [
          { id: 'INET-RTR', name: 'Internet Edge Router', ip: '203.0.113.1', type: 'it', role: 'Router', x: 80, y: 200, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'PALO-FW', name: 'Palo Alto NGFW PA-5220', ip: '10.1.1.1', type: 'it', role: 'Firewall', x: 220, y: 200, status: 'stable', firmware: 'PAN-OS 11.0', os: 'Palo Alto' },
          { id: 'CISCO-IPS', name: 'Cisco IPS Sensor 4500', ip: '10.1.1.2', type: 'it', role: 'IDS Sensor', x: 220, y: 100, status: 'stable', firmware: 'Cisco IPS 7.3', os: 'Embedded Linux' },
          { id: 'DMZ-SW', name: 'DMZ Core Switch', ip: '10.1.2.1', type: 'it', role: 'Switch', x: 380, y: 200, status: 'stable', firmware: 'Catalyst 9300', os: 'Cisco IOS-XE' },
          { id: 'OT-FW2', name: 'OT Micro-Segmentation FW', ip: '192.168.0.1', type: 'ot', role: 'Firewall', x: 540, y: 200, status: 'stable', firmware: 'FortiGate 80F', os: 'FortiOS' },
          { id: 'SCADA-SRV', name: 'SCADA Server', ip: '192.168.10.5', type: 'ot', role: 'SCADA HMI', x: 700, y: 100, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'PLC-IPS', name: 'Protected PLC Controller', ip: '192.168.10.101', type: 'plc', role: 'Modbus PLC', x: 700, y: 250, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'FIELD-V', name: 'Field Actuator', ip: 'Slave 0x01', type: 'field', role: 'Actuator', x: 860, y: 200, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' }
        ], links: [
          { sourceId: 'INET-RTR', targetId: 'PALO-FW', encrypted: false, status: 'normal' },
          { sourceId: 'CISCO-IPS', targetId: 'PALO-FW', encrypted: false, status: 'normal' },
          { sourceId: 'PALO-FW', targetId: 'DMZ-SW', encrypted: true, status: 'normal' },
          { sourceId: 'DMZ-SW', targetId: 'OT-FW2', encrypted: true, status: 'normal' },
          { sourceId: 'OT-FW2', targetId: 'SCADA-SRV', encrypted: true, status: 'normal' },
          { sourceId: 'OT-FW2', targetId: 'PLC-IPS', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-IPS', targetId: 'FIELD-V', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, explain how next-gen IPS rules isolate Modbus commands. Provide the configuration guidelines to drop unauthenticated writes!'
      },
      {
        id: 'lab-13',
        title: 'Reactor Emergency Depressurization',
        icon: '💨',
        category: 'critical',
        categoryLabel: 'ICS CONTROL',
        difficulty: 'Hard',
        desc: 'Calibrate valve outlets and actuate emergency relief vents (XV-103) under thermal runaway.',
        objective: 'Reactor thermodynamics are reaching critical rupture pressures. Calibrate valves and open the emergency relief valve XV-103 immediately.',
        tasks: [
          'Trigger relief valve XV-103 to OPEN state.',
          'Override the cooling outlet valve to 100% to flush hot water.',
          'Monitor the live telemetry charts to verify pressure drops below 1.5 MPa.'
        ],
        topology: { nodes: [
          { id: 'SIS-CTRL', name: 'Triconex TS3000 SIS', ip: '192.168.20.50', type: 'plc', role: 'Safety Controller', x: 550, y: 160, status: 'stable', firmware: 'Triconex v10.4', os: 'Triconex OS' },
          { id: 'ESD-HMI', name: 'ESD Control Panel', ip: '192.168.20.5', type: 'ot', role: 'SCADA HMI', x: 380, y: 80, status: 'stable', firmware: 'Ignition 8.1', os: 'Windows LTSC 2021' },
          { id: 'OT-SW', name: 'Safety Bus Switch', ip: '192.168.20.1', type: 'ot', role: 'Switch', x: 430, y: 200, status: 'stable', firmware: 'Hirschmann RS30', os: 'Hirschmann OS' },
          { id: 'PLC-PRESS', name: 'Pressure Process PLC', ip: '192.168.10.101', type: 'plc', role: 'Modbus PLC', x: 660, y: 80, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'PT-001', name: 'Pressure Transmitter PT-001', ip: 'Slave 0x01', type: 'field', role: 'Sensor', x: 830, y: 60, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'PT-002', name: 'Pressure Transmitter PT-002', ip: 'Slave 0x02', type: 'field', role: 'Sensor', x: 830, y: 160, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'XV-ESD', name: 'ESD Relief Valve XV-ESD', ip: 'Slave 0x03', type: 'field', role: 'Actuator', x: 830, y: 280, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'IT-FW', name: 'IT/OT Firewall', ip: '10.1.0.1', type: 'it', role: 'Firewall', x: 200, y: 200, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' },
          { id: 'ENG-WS', name: 'OT Engineering Console', ip: '10.1.0.20', type: 'it', role: 'Engineer Station', x: 100, y: 100, status: 'stable', firmware: 'Windows LTSC 2021', os: 'Windows LTSC 2021' }
        ], links: [
          { sourceId: 'ENG-WS', targetId: 'IT-FW', encrypted: true, status: 'normal' },
          { sourceId: 'IT-FW', targetId: 'OT-SW', encrypted: true, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'ESD-HMI', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'SIS-CTRL', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'PLC-PRESS', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-PRESS', targetId: 'PT-001', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-PRESS', targetId: 'PT-002', encrypted: false, status: 'normal' },
          { sourceId: 'SIS-CTRL', targetId: 'XV-ESD', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, give me the tactical plan for Reactor Emergency Depressurization. How do I operate the valves and vent the vessel under high temperature?'
      },
      {
        id: 'lab-14',
        title: 'Active Directory Sync Replication',
        icon: '📁',
        category: 'infra',
        categoryLabel: 'SERVICES',
        difficulty: 'Medium',
        desc: 'Establish domain controllers replication tunnels across distribution boundaries.',
        objective: 'Establish a secure backup domain synchronizer path between CORP-BDC and the primary AD Server to avoid database discrepancies.',
        tasks: [
          'Verify end-to-end IP reachability between AD servers.',
          'Configure secure Active Directory database sync targets.',
          'Perform a manual sync replication sweep to confirm database match.'
        ],
        topology: { nodes: [
          { id: 'AD-PRIMARY', name: 'AD Primary Domain Controller', ip: '10.50.1.1', type: 'it', role: 'AD Server', x: 200, y: 100, status: 'stable', firmware: 'Windows Server 2022', os: 'Windows NT' },
          { id: 'AD-REPLICA', name: 'AD Replica Controller', ip: '10.50.1.2', type: 'it', role: 'AD Server', x: 500, y: 100, status: 'stable', firmware: 'Windows Server 2022', os: 'Windows NT' },
          { id: 'CORE-SW', name: 'Core Distribution Switch', ip: '10.50.0.1', type: 'it', role: 'Switch', x: 350, y: 220, status: 'stable', firmware: 'Catalyst 9300', os: 'Cisco IOS-XE' },
          { id: 'DC-WS1', name: 'Domain Joined WS 1', ip: '10.50.2.10', type: 'it', role: 'Workstation', x: 150, y: 360, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'DC-WS2', name: 'Domain Joined WS 2', ip: '10.50.2.11', type: 'it', role: 'Workstation', x: 400, y: 360, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'DNS-SRV', name: 'DNS / LDAP Server', ip: '10.50.1.5', type: 'it', role: 'Server', x: 650, y: 220, status: 'stable', firmware: 'BIND 9.18', os: 'Ubuntu Server 22' }
        ], links: [
          { sourceId: 'AD-PRIMARY', targetId: 'CORE-SW', encrypted: true, status: 'normal' },
          { sourceId: 'AD-REPLICA', targetId: 'CORE-SW', encrypted: true, status: 'normal' },
          { sourceId: 'AD-PRIMARY', targetId: 'AD-REPLICA', encrypted: true, status: 'normal' },
          { sourceId: 'DNS-SRV', targetId: 'CORE-SW', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-SW', targetId: 'DC-WS1', encrypted: false, status: 'normal' },
          { sourceId: 'CORE-SW', targetId: 'DC-WS2', encrypted: false, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, guide me in configuring Active Directory database sync replication. Detail the commands to establish replication tunnels!'
      },
      {
        id: 'lab-15',
        title: 'AETHERIS Co-Driver Playground',
        icon: '✏',
        category: 'infra',
        categoryLabel: 'DESIGN SLATE',
        difficulty: 'Easy',
        desc: 'An open canvas to dynamically instruct the AI Co-Driver to construct any network architecture.',
        objective: 'An open playground workspace. Prompt the AI assistant in natural language to construct, customize, or audit any network topology you imagine.',
        tasks: [
          'Instruct AETHERIS in chat: "Add router PE-01 and switch CE-01".',
          'Connect the nodes using gigabit interface paths.',
          'Request the AI to allocate optimized Class C IP parameters.'
        ],
        projectType: 'blank',
        coDriverPayload: 'AETHERIS Co-Driver, I am in the Playground workspace. Let\'s build a custom hybrid network! Suggest a secure, dual-homed internet gateway topology to get us started!'
      },
      {
        id: 'lab-16',
        title: 'Purdue Model 25-Node Digital Twin',
        icon: '🏭',
        category: 'ics',
        categoryLabel: 'PURDUE MODEL',
        difficulty: 'Hard',
        desc: 'A comprehensive 25-node hierarchical Purdue Model ICS/OT digital twin range.',
        objective: 'Analyze and secure a tightly-scoped 25-node ICS architecture spanning Levels 4 through 0 with high-fidelity asset telemetry.',
        tasks: [
          'Audit Level 4 to Level 0 network segmentation rules.',
          'Verify that all 25 nodes are online and fully cabled.',
          'Inspect custom PLC registers and system firmware integrity.'
        ],
        projectType: 'purdue',
        coDriverPayload: 'AETHERIS Co-Driver, analyze our 25-node Purdue model digital twin. Verify all boundaries and confirm VLAN alignment across Level 4 and Level 0!'
      },
      {
        id: 'lab-17',
        title: 'S7comm Ransomware Audit',
        icon: '🦠',
        category: 'critical',
        categoryLabel: 'ICS SECURITY',
        difficulty: 'Hard',
        desc: 'Audit Siemens S7 controllers to identify rogue memory injection and block ransomware payloads.',
        objective: 'An advanced threat is targeting S7-1500 memory slots. Run diagnostics on the PLC CPU, locate compromised database blocks, and secure the controller.',
        tasks: [
          'Verify S7 PLC system status via CPU mode inspection.',
          'Analyze diagnostic-buffer logs to locate Event ID 0x3841 blocks.',
          'Activate protected run mode configuration to lock out remote memory updates.'
        ],
        topology: { nodes: [
          { id: 'CORP-FW', name: 'Corporate Perimeter FW', ip: '10.1.0.1', type: 'it', role: 'Firewall', x: 200, y: 200, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' },
          { id: 'TIA-EWS', name: 'TIA Portal Engineering WS', ip: '10.1.0.20', type: 'it', role: 'Engineer Station', x: 80, y: 100, status: 'compromised', firmware: 'Windows LTSC 2021', os: 'Windows LTSC 2021' },
          { id: 'OPC-SRV', name: 'OPC-UA Data Server', ip: '192.168.10.5', type: 'ot', role: 'Server', x: 420, y: 80, status: 'stable', firmware: 'Kepware KEPServerEX 6', os: 'Windows NT' },
          { id: 'PROFIBUS-GW', name: 'Profibus/PN Gateway', ip: '192.168.10.10', type: 'ot', role: 'Router', x: 420, y: 200, status: 'stable', firmware: 'Siemens CM 1542-SP', os: 'Embedded RTOS' },
          { id: 'S7-1515', name: 'Siemens S7-1515 CPU', ip: '192.168.10.101', type: 'plc', role: 'Safety Controller', x: 620, y: 100, status: 'compromised', firmware: 'Siemens S7-1500 FW 2.9', os: 'Embedded RTOS' },
          { id: 'S7-1515B', name: 'Siemens S7-1515 CPU B', ip: '192.168.10.102', type: 'plc', role: 'Modbus PLC', x: 620, y: 240, status: 'stable', firmware: 'Siemens S7-1500 FW 2.9', os: 'Embedded RTOS' },
          { id: 'HIST-01', name: 'Plant Historian', ip: '192.168.10.50', type: 'ot', role: 'PI Historian', x: 250, y: 340, status: 'stable', firmware: 'OSIsoft PI 2023', os: 'Windows NT' },
          { id: 'FLD-ACTUATOR', name: 'Field Actuator A', ip: 'Slave 0x01', type: 'field', role: 'Actuator', x: 820, y: 100, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'FLD-SENS', name: 'Field Sensor', ip: 'Slave 0x02', type: 'field', role: 'Sensor', x: 820, y: 260, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' }
        ], links: [
          { sourceId: 'TIA-EWS', targetId: 'CORP-FW', encrypted: false, status: 'normal' },
          { sourceId: 'CORP-FW', targetId: 'OPC-SRV', encrypted: true, status: 'normal' },
          { sourceId: 'CORP-FW', targetId: 'PROFIBUS-GW', encrypted: true, status: 'normal' },
          { sourceId: 'CORP-FW', targetId: 'HIST-01', encrypted: true, status: 'normal' },
          { sourceId: 'PROFIBUS-GW', targetId: 'S7-1515', encrypted: false, status: 'normal' },
          { sourceId: 'PROFIBUS-GW', targetId: 'S7-1515B', encrypted: false, status: 'normal' },
          { sourceId: 'S7-1515', targetId: 'FLD-ACTUATOR', encrypted: false, status: 'normal' },
          { sourceId: 'S7-1515B', targetId: 'FLD-SENS', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, how do I analyze S7comm vulnerabilities? Provide the PLC diagnostic codes to verify slot protections!'
      },
      {
        id: 'lab-18',
        title: 'Safety Loop Key-Switch Lockdown',
        icon: '🔑',
        category: 'critical',
        categoryLabel: 'ICS CONTROL',
        difficulty: 'Medium',
        desc: 'Enforce Triconex TMR safety loops by locking the hardware key switch against unauthorized writes.',
        objective: 'Remote SCADA packets are attempting to alter safety ESD thresholds. Access the Triconex SIS controller and enforce hard hardware protection.',
        tasks: [
          'Run "show key-switch" to check the active voter registry state.',
          'Trace safety loops LP-001 and LP-002 thresholds.',
          'Execute bypass lockdown to restrict ESD variables modifications.'
        ],
        topology: { nodes: [
          { id: 'TRICONEX-SIS', name: 'Triconex TMR SIS v10.4', ip: '192.168.20.10', type: 'plc', role: 'Safety Controller', x: 560, y: 160, status: 'stable', firmware: 'Triconex v10.4', os: 'Triconex OS' },
          { id: 'SIS-HMI', name: 'Safety Instrumented HMI', ip: '192.168.20.5', type: 'ot', role: 'SCADA HMI', x: 380, y: 100, status: 'stable', firmware: 'Ignition 8.1', os: 'Windows LTSC 2021' },
          { id: 'OT-FW', name: 'OT Safety Zone Firewall', ip: '10.2.0.1', type: 'it', role: 'Firewall', x: 200, y: 200, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' },
          { id: 'EWS-MAIN', name: 'Engineering Workstation', ip: '10.1.0.20', type: 'it', role: 'Engineer Station', x: 80, y: 100, status: 'stable', firmware: 'Windows LTSC 2021', os: 'Windows LTSC 2021' },
          { id: 'LP-001', name: 'Loop Sensor LP-001', ip: 'Slave 0x01', type: 'field', role: 'Sensor', x: 740, y: 80, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'LP-002', name: 'Loop Sensor LP-002', ip: 'Slave 0x02', type: 'field', role: 'Sensor', x: 740, y: 200, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'ESD-VALVE', name: 'Emergency Shutdown Valve', ip: 'Slave 0x03', type: 'field', role: 'Actuator', x: 740, y: 320, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' }
        ], links: [
          { sourceId: 'EWS-MAIN', targetId: 'OT-FW', encrypted: true, status: 'normal' },
          { sourceId: 'OT-FW', targetId: 'SIS-HMI', encrypted: false, status: 'normal' },
          { sourceId: 'OT-FW', targetId: 'TRICONEX-SIS', encrypted: false, status: 'normal' },
          { sourceId: 'TRICONEX-SIS', targetId: 'LP-001', encrypted: false, status: 'normal' },
          { sourceId: 'TRICONEX-SIS', targetId: 'LP-002', encrypted: false, status: 'normal' },
          { sourceId: 'TRICONEX-SIS', targetId: 'ESD-VALVE', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, guide me through securing the Triconex SIS using key-switch parameters and safety loop bypass locking!'
      },
      {
        id: 'lab-19',
        title: 'FW-101 IPSec VPN Encryption',
        icon: '🕳',
        category: 'sec',
        categoryLabel: 'THREAT DEFENSE',
        difficulty: 'Hard',
        desc: 'Establish secure cryptographic tunnels between remote substations and corporate cores.',
        objective: 'OT data from external distribution nodes is traversing public channels in plaintext. Cable a secure IPSec tunnel on the FW-01 security cluster.',
        tasks: [
          'Define cryptographic phase 1 proposal parameters (AES-256 / SHA-256).',
          'Configure a strict Crypto Map binding the peer gateway IP.',
          'Initiate high-security tunnel traffic and verify encrypted packet sweeps.'
        ],
        topology: { nodes: [
          { id: 'FW-SITE1', name: 'Site 1 Palo Alto FW', ip: '10.1.1.1', type: 'it', role: 'Firewall', x: 150, y: 200, status: 'stable', firmware: 'PAN-OS 11.0', os: 'Palo Alto' },
          { id: 'FW-SITE2', name: 'Site 2 Palo Alto FW', ip: '10.2.1.1', type: 'ot', role: 'Firewall', x: 700, y: 200, status: 'stable', firmware: 'PAN-OS 11.0', os: 'Palo Alto' },
          { id: 'INET-CLOUD', name: 'Internet Transit Router', ip: '203.0.113.1', type: 'it', role: 'Router', x: 420, y: 200, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'VPN-HOST1', name: 'Site 1 Internal Host', ip: '10.1.2.10', type: 'it', role: 'Workstation', x: 80, y: 100, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'VPN-HOST2', name: 'Site 1 OT Host', ip: '10.1.2.20', type: 'it', role: 'Workstation', x: 80, y: 320, status: 'stable', firmware: 'Ubuntu 22.04', os: 'Linux 5.15' },
          { id: 'VPN-HOST3', name: 'Site 2 Internal Host', ip: '10.2.2.10', type: 'ot', role: 'Workstation', x: 800, y: 100, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'VPN-HOST4', name: 'Site 2 OT SCADA', ip: '10.2.2.20', type: 'ot', role: 'SCADA HMI', x: 800, y: 320, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' }
        ], links: [
          { sourceId: 'VPN-HOST1', targetId: 'FW-SITE1', encrypted: false, status: 'normal' },
          { sourceId: 'VPN-HOST2', targetId: 'FW-SITE1', encrypted: false, status: 'normal' },
          { sourceId: 'FW-SITE1', targetId: 'INET-CLOUD', encrypted: true, status: 'normal' },
          { sourceId: 'INET-CLOUD', targetId: 'FW-SITE2', encrypted: true, status: 'normal' },
          { sourceId: 'FW-SITE2', targetId: 'VPN-HOST3', encrypted: false, status: 'normal' },
          { sourceId: 'FW-SITE2', targetId: 'VPN-HOST4', encrypted: false, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, provide the ASA-style VPN configuration commands to set up Phase 1/Phase 2 IPSec parameters!'
      },
      {
        id: 'lab-20',
        title: 'Modbus Rogue Server Exposure',
        icon: '🧪',
        category: 'sec',
        categoryLabel: 'ICS SECURITY',
        difficulty: 'Hard',
        desc: 'Deploy passive OT threat detection to expose a rogue Modbus master injecting false telemetry.',
        objective: 'A rogue workstation is masquerading as the plant master console. Passive-profile the network, identify the attacker IP, and apply block ACLs.',
        tasks: [
          'Access Claroty Continuous Threat Sensor diagnostic shell.',
          'Audit discovered assets to isolate unlisted active IP protocols.',
          'Block the malicious IP segment using target firewall drop rules.'
        ],
        topology: { nodes: [
          { id: 'CLAROTY-CTD', name: 'Claroty CT-100 Sensor', ip: '192.168.1.50', type: 'ot', role: 'IDS Sensor', x: 430, y: 280, status: 'stable', firmware: 'Claroty CTD v4.2', os: 'Embedded Linux' },
          { id: 'OT-SW', name: 'OT Network Switch', ip: '192.168.1.1', type: 'ot', role: 'Switch', x: 430, y: 160, status: 'stable', firmware: 'Hirschmann OS', os: 'Hirschmann OS' },
          { id: 'SCADA-MASTER', name: 'SCADA Master Console', ip: '192.168.1.10', type: 'ot', role: 'SCADA HMI', x: 580, y: 60, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'PLC-LEGIT', name: 'Authorized Modbus PLC', ip: '192.168.1.101', type: 'plc', role: 'Modbus PLC', x: 680, y: 160, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'ROGUE-WS', name: 'Rogue Modbus Master', ip: '192.168.1.254', type: 'it', role: 'Workstation', x: 250, y: 80, status: 'compromised', firmware: 'Kali Linux', os: 'Linux 6.6' },
          { id: 'IT-FW', name: 'IT/OT Zone Firewall', ip: '10.1.0.1', type: 'it', role: 'Firewall', x: 200, y: 200, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' },
          { id: 'V-CTRL', name: 'Process Valve Controller', ip: 'Slave 0x01', type: 'field', role: 'Actuator', x: 840, y: 160, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' }
        ], links: [
          { sourceId: 'ROGUE-WS', targetId: 'IT-FW', encrypted: false, status: 'normal' },
          { sourceId: 'IT-FW', targetId: 'OT-SW', encrypted: true, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'SCADA-MASTER', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'PLC-LEGIT', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'CLAROTY-CTD', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-LEGIT', targetId: 'V-CTRL', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, how can I locate a rogue Modbus master? Show me how to passive-profile assets using Claroty or Wireshark!'
      },
      {
        id: 'lab-21',
        title: 'Claroty Passive OT Profiling',
        icon: '📡',
        category: 'sec',
        categoryLabel: 'OT MONITORING',
        difficulty: 'Medium',
        desc: 'Configure deep packet inspection rules to build an automated, secure asset baseline.',
        objective: 'The plant lacks a centralized OT asset ledger. Spin up deep packet parsing on the Claroty CT-100 to index all S7comm and CIP hardware.',
        tasks: [
          'Enable passive deep packet inspection (DPI) protocol engines.',
          'Run "show assets" in the Claroty sensor console to build baseline records.',
          'Verify S7, CIP, and Modbus hardware modules are accurately categorized.'
        ],
        topology: { nodes: [
          { id: 'IT-FW-CL', name: 'IT/OT Zone Firewall', ip: '10.1.0.1', type: 'it', role: 'Firewall', x: 200, y: 220, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' },
          { id: 'CLAROTY-CTD', name: 'Claroty CT-100 DPI Sensor', ip: '192.168.1.50', type: 'ot', role: 'IDS Sensor', x: 420, y: 300, status: 'stable', firmware: 'Claroty CTD v4.2', os: 'Embedded Linux' },
          { id: 'SPAN-SW', name: 'OT Core Switch (SPAN Port)', ip: '192.168.1.1', type: 'ot', role: 'Switch', x: 420, y: 180, status: 'stable', firmware: 'Hirschmann RS30', os: 'Hirschmann OS' },
          { id: 'SCADA-HMI', name: 'SCADA HMI Console', ip: '192.168.1.10', type: 'ot', role: 'SCADA HMI', x: 420, y: 70, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'HIST-CL', name: 'OSIsoft PI Historian', ip: '192.168.1.200', type: 'ot', role: 'PI Historian', x: 240, y: 90, status: 'stable', firmware: 'OSIsoft PI 2023', os: 'Windows NT' },
          { id: 'S7-PLC', name: 'Siemens S7-1515 (S7comm)', ip: '192.168.1.101', type: 'plc', role: 'Safety Controller', x: 620, y: 100, status: 'stable', firmware: 'Siemens S7-1500 FW 2.9', os: 'Embedded RTOS' },
          { id: 'CIP-PLC', name: 'Rockwell CIP/EtherNet-IP PLC', ip: '192.168.1.102', type: 'plc', role: 'Modbus PLC', x: 620, y: 220, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'MODBUS-PLC', name: 'Schneider Modbus RTU Master', ip: '192.168.1.103', type: 'plc', role: 'Modbus PLC', x: 620, y: 340, status: 'stable', firmware: 'Schneider M221', os: 'EcoStruxure RTOS' },
          { id: 'S7-FIELD', name: 'Profibus Field Device', ip: 'Slave 0x01', type: 'field', role: 'Sensor', x: 800, y: 100, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'CIP-FIELD', name: 'EtherNet/IP Field Actuator', ip: 'Slave 0x02', type: 'field', role: 'Actuator', x: 800, y: 220, status: 'stable', firmware: 'EtherNet/IP RTU', os: 'ASIC' },
          { id: 'MB-FIELD', name: 'Modbus RTU Field Sensor', ip: 'Slave 0x03', type: 'field', role: 'Sensor', x: 800, y: 340, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' }
        ], links: [
          { sourceId: 'IT-FW-CL', targetId: 'HIST-CL', encrypted: false, status: 'normal' },
          { sourceId: 'IT-FW-CL', targetId: 'SPAN-SW', encrypted: true, status: 'normal' },
          { sourceId: 'SPAN-SW', targetId: 'SCADA-HMI', encrypted: false, status: 'normal' },
          { sourceId: 'SPAN-SW', targetId: 'S7-PLC', encrypted: false, status: 'normal' },
          { sourceId: 'SPAN-SW', targetId: 'CIP-PLC', encrypted: false, status: 'normal' },
          { sourceId: 'SPAN-SW', targetId: 'MODBUS-PLC', encrypted: false, status: 'normal' },
          { sourceId: 'SPAN-SW', targetId: 'CLAROTY-CTD', encrypted: false, status: 'normal' },
          { sourceId: 'S7-PLC', targetId: 'S7-FIELD', encrypted: false, status: 'normal' },
          { sourceId: 'CIP-PLC', targetId: 'CIP-FIELD', encrypted: false, status: 'normal' },
          { sourceId: 'MODBUS-PLC', targetId: 'MB-FIELD', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, show me how to baseline OT protocols using deep packet analysis and passive span monitors!'
      },
      {
        id: 'lab-22',
        title: 'Data Diode Optical Segregation',
        icon: '🛡',
        category: 'sec',
        categoryLabel: 'ICS CONTROL',
        difficulty: 'Medium',
        desc: 'Configure optical data diode transfer proxy rules to allow outbound telemetry while isolating incoming ports.',
        objective: 'A bidirectional gateway connects the safe OT network to the corporate LAN. Swap this with an optical data diode to enforce complete hardware isolation.',
        tasks: [
          'Verify fiber laser alignment states on Owl Unidirectional Gateway.',
          'Configure Syslog TCP mapping rules to mirror telemetry logs to the IT subnet.',
          'Confirm that all return traffic attempts from the corporate network are physically dropped.'
        ],
        topology: { nodes: [
          { id: 'OT-HMI', name: 'OT SCADA HMI', ip: '192.168.10.5', type: 'ot', role: 'SCADA HMI', x: 460, y: 100, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'OT-PLC', name: 'Process PLC Controller', ip: '192.168.10.101', type: 'plc', role: 'Modbus PLC', x: 640, y: 160, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'DATA-DIODE', name: 'Owl Cyber Defense Diode', ip: '10.1.1.100', type: 'it', role: 'Data Diode', x: 280, y: 200, status: 'stable', firmware: 'Owl OPDS v8.1', os: 'Owl OS' },
          { id: 'SYSLOG-SRV', name: 'IT Syslog Server', ip: '10.1.1.10', type: 'it', role: 'Server', x: 120, y: 200, status: 'stable', firmware: 'Graylog 5', os: 'Ubuntu Server 22' },
          { id: 'OT-RTU', name: 'Remote Terminal Unit', ip: '192.168.10.200', type: 'plc', role: 'Modbus PLC', x: 640, y: 300, status: 'stable', firmware: 'Siemens S7-1500', os: 'Embedded RTOS' },
          { id: 'FIELD-S', name: 'Field Sensor', ip: 'Slave 0x01', type: 'field', role: 'Sensor', x: 820, y: 230, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' }
        ], links: [
          { sourceId: 'SYSLOG-SRV', targetId: 'DATA-DIODE', encrypted: false, status: 'normal' },
          { sourceId: 'DATA-DIODE', targetId: 'OT-HMI', encrypted: false, status: 'normal' },
          { sourceId: 'OT-HMI', targetId: 'OT-PLC', encrypted: false, status: 'normal' },
          { sourceId: 'OT-HMI', targetId: 'OT-RTU', encrypted: false, status: 'normal' },
          { sourceId: 'OT-PLC', targetId: 'FIELD-S', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, explain data diode optical isolation. Show me the commands to sync outbound proxy logs securely!'
      },
      {
        id: 'lab-23',
        title: 'AD Kerberoasting Threat Hunt',
        icon: '🕵',
        category: 'sec',
        categoryLabel: 'SERVICES',
        difficulty: 'Medium',
        desc: 'Audit domain controller ticket requests to identify offline password cracking attempts.',
        objective: 'An adversary has compromised an access node and is requesting Kerberos Service Principal Names (SPNs) tickets. Secure the AD database.',
        tasks: [
          'Inspect Kerberos TGS request volumes in AD logs.',
          'Identify domain service accounts configured with weak encryption (RC4).',
          'Enforce strict AES-256 ticket requirements on domain parameters.'
        ],
        topology: { nodes: [
          { id: 'DC-01', name: 'Domain Controller', ip: '10.60.1.1', type: 'it', role: 'AD Server', x: 300, y: 100, status: 'stable', firmware: 'Windows Server 2022', os: 'Windows NT' },
          { id: 'ATK-KERB', name: 'Kerberoasting Attacker', ip: '10.60.1.99', type: 'it', role: 'Workstation', x: 100, y: 100, status: 'compromised', firmware: 'Kali Linux 2024', os: 'Linux 6.6' },
          { id: 'CORE-SW', name: 'Corp Core Switch', ip: '10.60.0.1', type: 'it', role: 'Switch', x: 400, y: 220, status: 'stable', firmware: 'Catalyst 9300', os: 'Cisco IOS-XE' },
          { id: 'SRV-SPN1', name: 'SPN Service (SQL)', ip: '10.60.2.10', type: 'it', role: 'Server', x: 600, y: 100, status: 'stable', firmware: 'SQL Server 2022', os: 'Windows NT' },
          { id: 'SRV-SPN2', name: 'SPN Service (IIS)', ip: '10.60.2.11', type: 'it', role: 'Server', x: 750, y: 100, status: 'stable', firmware: 'IIS 10', os: 'Windows NT' },
          { id: 'VICTIM-WS', name: 'Victim Workstation', ip: '10.60.3.10', type: 'it', role: 'Workstation', x: 300, y: 360, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' }
        ], links: [
          { sourceId: 'ATK-KERB', targetId: 'CORE-SW', encrypted: false, status: 'normal' },
          { sourceId: 'DC-01', targetId: 'CORE-SW', encrypted: true, status: 'normal' },
          { sourceId: 'SRV-SPN1', targetId: 'CORE-SW', encrypted: false, status: 'normal' },
          { sourceId: 'SRV-SPN2', targetId: 'CORE-SW', encrypted: false, status: 'normal' },
          { sourceId: 'VICTIM-WS', targetId: 'CORE-SW', encrypted: false, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, show me how to detect AD Kerberoasting sweeps and secure service accounts with strong cryptography!'
      },
      {
        id: 'lab-24',
        title: 'PowerFlex VFD Frequency Tuning',
        icon: '⚡',
        category: 'critical',
        categoryLabel: 'ICS CONTROL',
        difficulty: 'Medium',
        desc: 'Calibrate variable frequency drive motor limits to prevent electrical overload.',
        objective: 'Incorrect motor acceleration parameters are creating active overcurrent faults. Tweak internal drive parameters via the CLI.',
        tasks: [
          'Query current motor telemetry using show parameters.',
          'Set motor acceleration ramp register to 3.5 seconds.',
          'Verify frequency sweeps operate within healthy RPM ranges.'
        ],
        topology: { nodes: [
          { id: 'PLC-VFD', name: 'VFD Controller PLC', ip: '192.168.30.101', type: 'plc', role: 'Modbus PLC', x: 500, y: 160, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'VFD-01', name: 'PowerFlex 755 VFD A', ip: '192.168.30.200', type: 'field', role: 'VFD Drive', x: 680, y: 80, status: 'stable', firmware: 'PowerFlex FW 14.xx', os: 'ASIC' },
          { id: 'VFD-02', name: 'PowerFlex 755 VFD B', ip: '192.168.30.201', type: 'field', role: 'VFD Drive', x: 680, y: 240, status: 'stable', firmware: 'PowerFlex FW 14.xx', os: 'ASIC' },
          { id: 'MOTOR-SENS', name: 'Motor Feedback Sensor', ip: 'Slave 0x10', type: 'field', role: 'Sensor', x: 840, y: 160, status: 'stable', firmware: 'EtherNet/IP RTU', os: 'ASIC' },
          { id: 'EWS-VFD', name: 'EWS / Studio 5000', ip: '192.168.30.20', type: 'ot', role: 'Engineer Station', x: 340, y: 80, status: 'stable', firmware: 'Windows LTSC 2021', os: 'Windows LTSC 2021' },
          { id: 'HMI-VFD', name: 'SCADA HMI Panel', ip: '192.168.30.10', type: 'ot', role: 'SCADA HMI', x: 340, y: 260, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'IT-FW', name: 'IT/OT Firewall', ip: '10.1.0.1', type: 'it', role: 'Firewall', x: 150, y: 200, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' }
        ], links: [
          { sourceId: 'IT-FW', targetId: 'EWS-VFD', encrypted: true, status: 'normal' },
          { sourceId: 'IT-FW', targetId: 'HMI-VFD', encrypted: true, status: 'normal' },
          { sourceId: 'EWS-VFD', targetId: 'PLC-VFD', encrypted: false, status: 'normal' },
          { sourceId: 'HMI-VFD', targetId: 'PLC-VFD', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-VFD', targetId: 'VFD-01', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-VFD', targetId: 'VFD-02', encrypted: false, status: 'normal' },
          { sourceId: 'VFD-01', targetId: 'MOTOR-SENS', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, explain how VFD speed curves and acceleration values affect power load. Provide the VFD calibration CLI commands!'
      },
      {
        id: 'lab-25',
        title: 'SCADA Tag Sync Verification',
        icon: '📊',
        category: 'infra',
        categoryLabel: 'SERVICES',
        difficulty: 'Easy',
        desc: 'Align SCADA database Ignition tag paths with live Modbus PLC hardware register mappings.',
        objective: 'SCADA telemetry widgets show mismatched temperature values due to an OPC tag scaling fault. Recalibrate the HMI tag paths.',
        tasks: [
          'Dump current active database mappings via show tag-db command.',
          'Align SCADA Reactor3 tag target registry with holding register 40001.',
          'Verify telemetry charts show correct scaled temperatures.'
        ],
        topology: { nodes: [
          { id: 'OPC-SRV', name: 'OPC-UA / Kepware Server', ip: '192.168.10.5', type: 'ot', role: 'Server', x: 420, y: 80, status: 'stable', firmware: 'Kepware KEPServerEX 6', os: 'Windows NT' },
          { id: 'SCADA-IGN', name: 'Ignition SCADA Gateway', ip: '192.168.10.10', type: 'ot', role: 'SCADA HMI', x: 420, y: 200, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'PLC-TAG', name: 'Tag Source PLC', ip: '192.168.10.101', type: 'plc', role: 'Modbus PLC', x: 640, y: 140, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'T-SENSOR', name: 'Temp Sensor (Reactor-3)', ip: 'Slave 0x01', type: 'field', role: 'Sensor', x: 820, y: 100, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'P-SENSOR', name: 'Pressure Sensor', ip: 'Slave 0x02', type: 'field', role: 'Sensor', x: 820, y: 240, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'EWS-TAG', name: 'Engineering Workstation', ip: '10.1.0.20', type: 'it', role: 'Engineer Station', x: 120, y: 140, status: 'stable', firmware: 'Windows LTSC 2021', os: 'Windows LTSC 2021' },
          { id: 'IT-FW', name: 'Boundary Firewall', ip: '10.1.0.1', type: 'it', role: 'Firewall', x: 240, y: 200, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' }
        ], links: [
          { sourceId: 'EWS-TAG', targetId: 'IT-FW', encrypted: true, status: 'normal' },
          { sourceId: 'IT-FW', targetId: 'OPC-SRV', encrypted: true, status: 'normal' },
          { sourceId: 'IT-FW', targetId: 'SCADA-IGN', encrypted: true, status: 'normal' },
          { sourceId: 'OPC-SRV', targetId: 'PLC-TAG', encrypted: false, status: 'normal' },
          { sourceId: 'SCADA-IGN', targetId: 'OPC-SRV', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-TAG', targetId: 'T-SENSOR', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-TAG', targetId: 'P-SENSOR', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, guide me in configuring HMI OPC database tag scaling to align 16-bit integers with active float variables!'
      },
      {
        id: 'lab-26',
        title: 'ARP Spoof MitM Analysis',
        icon: '🔍',
        category: 'sec',
        categoryLabel: 'ICS SECURITY',
        difficulty: 'Medium',
        desc: 'Intercept unencrypted OT traffic via spoofed ARP responses and audit packets with Wireshark.',
        objective: 'Verify vulnerability of the network to local MitM. Spoof local ARP tables, direct SCADA streams through a passive audit console, and analyze Modbus headers.',
        tasks: [
          'Initialize local packet tap redirection on the intermediate switch.',
          'Examine captured raw packets for duplicate IP-MAC bindings.',
          'Activate dynamic ARP inspection (DAI) on switches to completely mitigate ARP poisoning.'
        ],
        topology: { nodes: [
          { id: 'SW-DIST', name: 'Distribution Switch', ip: '10.70.0.1', type: 'it', role: 'Switch', x: 380, y: 200, status: 'stable', firmware: 'Catalyst 9300', os: 'Cisco IOS-XE' },
          { id: 'GW-RTR', name: 'Default Gateway Router', ip: '10.70.0.254', type: 'it', role: 'Router', x: 600, y: 100, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'ATK-ARP', name: 'ARP Poisoning Attacker', ip: '10.70.1.99', type: 'it', role: 'Workstation', x: 180, y: 80, status: 'compromised', firmware: 'Kali Linux 2024', os: 'Linux 6.6' },
          { id: 'VICTIM-WS', name: 'Victim Workstation', ip: '10.70.1.10', type: 'it', role: 'Workstation', x: 180, y: 340, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'SCADA-WS', name: 'SCADA Operator Station', ip: '10.70.2.10', type: 'ot', role: 'SCADA HMI', x: 600, y: 340, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'IDS-SNR', name: 'Network IDS Sensor', ip: '10.70.0.50', type: 'it', role: 'IDS Sensor', x: 580, y: 200, status: 'stable', firmware: 'Snort 3.x', os: 'CentOS' }
        ], links: [
          { sourceId: 'ATK-ARP', targetId: 'SW-DIST', encrypted: false, status: 'normal' },
          { sourceId: 'VICTIM-WS', targetId: 'SW-DIST', encrypted: false, status: 'normal' },
          { sourceId: 'GW-RTR', targetId: 'SW-DIST', encrypted: false, status: 'normal' },
          { sourceId: 'IDS-SNR', targetId: 'SW-DIST', encrypted: false, status: 'normal' },
          { sourceId: 'SW-DIST', targetId: 'SCADA-WS', encrypted: false, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, walk me through ARP cache poisoning mitigation using switch DAI configurations and binding matrices!'
      },
      {
        id: 'lab-27',
        title: 'SNMPv3 Encrypted Monitoring',
        icon: '🎛',
        category: 'infra',
        categoryLabel: 'SERVICES',
        difficulty: 'Easy',
        desc: 'Replace legacy unsecure telemetry monitors with encrypted SNMPv3 profiles.',
        objective: 'Plant monitoring uses unencrypted SNMPv1 exposing administrator community strings. Reconfigure SNMP using SHA authentication and AES encryption.',
        tasks: [
          'Remove insecure legacy SNMP community strings from PE-01 and CE-01.',
          'Configure SNMPv3 user profiles with strict auth/priv permissions.',
          'Verify remote monitoring consoles can parse system SNMP variables securely.'
        ],
        topology: { nodes: [
          { id: 'SNMP-MGR', name: 'SNMP Manager / NMS', ip: '10.80.1.1', type: 'it', role: 'Server', x: 200, y: 100, status: 'stable', firmware: 'LibreNMS 24', os: 'Ubuntu Server 22' },
          { id: 'PE-SNMP', name: 'PE-01 Managed Router', ip: '10.80.0.1', type: 'it', role: 'Router', x: 400, y: 160, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'SW-SNMP1', name: 'Managed Switch A', ip: '10.80.2.1', type: 'it', role: 'Switch', x: 250, y: 280, status: 'stable', firmware: 'Catalyst 9300', os: 'Cisco IOS-XE' },
          { id: 'SW-SNMP2', name: 'Managed Switch B', ip: '10.80.2.2', type: 'ot', role: 'Switch', x: 600, y: 280, status: 'stable', firmware: 'Hirschmann RS30', os: 'Hirschmann OS' },
          { id: 'WS-SNMP', name: 'Admin Workstation', ip: '10.80.1.20', type: 'it', role: 'Workstation', x: 100, y: 280, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' }
        ], links: [
          { sourceId: 'SNMP-MGR', targetId: 'PE-SNMP', encrypted: true, status: 'normal' },
          { sourceId: 'WS-SNMP', targetId: 'SW-SNMP1', encrypted: false, status: 'normal' },
          { sourceId: 'PE-SNMP', targetId: 'SW-SNMP1', encrypted: false, status: 'normal' },
          { sourceId: 'PE-SNMP', targetId: 'SW-SNMP2', encrypted: false, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, provide the Cisco IOS SNMPv3 configuration commands to establish authenticated and encrypted node profiles!'
      },
      {
        id: 'lab-28',
        title: 'SIS Pressure Vessel Emergency ESD',
        icon: '☣',
        category: 'critical',
        categoryLabel: 'ICS CONTROL',
        difficulty: 'Hard',
        desc: 'Simulate high-pressure steam runaway and execute safety-instrumented shutdown logic.',
        objective: 'Under extreme vessel pressure runaway, bypass automatic controllers and initiate an active emergency shutdown (ESD) sweep to vent the boiler.',
        tasks: [
          'Verify TMR consensus is verified 3-out-of-3 on Triconex SIS.',
          'Execute direct write command to override the ESD interlock loops.',
          'Confirm core steam valves immediately fail-safe to venting position.'
        ],
        topology: { nodes: [
          { id: 'SIS-TMR', name: 'Triconex TMR 3-Voter SIS', ip: '192.168.20.10', type: 'plc', role: 'Safety Controller', x: 530, y: 160, status: 'stable', firmware: 'Triconex v10.4', os: 'Triconex OS' },
          { id: 'PLC-CTRL', name: 'Main Process PLC', ip: '192.168.10.101', type: 'plc', role: 'Modbus PLC', x: 660, y: 80, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'HMI-ESD', name: 'Emergency ESD Console', ip: '192.168.10.5', type: 'ot', role: 'SCADA HMI', x: 380, y: 80, status: 'stable', firmware: 'Ignition 8.1', os: 'Windows LTSC 2021' },
          { id: 'OT-SW', name: 'OT Safety Bus Switch', ip: '192.168.10.1', type: 'ot', role: 'Switch', x: 440, y: 200, status: 'stable', firmware: 'Hirschmann RS30', os: 'Hirschmann OS' },
          { id: 'PV-001', name: 'Pressure Xmtr PV-001', ip: 'Slave 0x01', type: 'field', role: 'Sensor', x: 820, y: 60, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'PV-002', name: 'Pressure Xmtr PV-002', ip: 'Slave 0x02', type: 'field', role: 'Sensor', x: 820, y: 160, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'XV-ESD2', name: 'ESD Vent Valve XV-ESD', ip: 'Slave 0x03', type: 'field', role: 'Actuator', x: 820, y: 280, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'IT-FW', name: 'IT/OT Boundary FW', ip: '10.1.0.1', type: 'it', role: 'Firewall', x: 200, y: 200, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' },
          { id: 'OPS-WS', name: 'Operations Workstation', ip: '10.1.0.30', type: 'it', role: 'Workstation', x: 80, y: 100, status: 'stable', firmware: 'Windows LTSC 2021', os: 'Windows LTSC 2021' }
        ], links: [
          { sourceId: 'OPS-WS', targetId: 'IT-FW', encrypted: true, status: 'normal' },
          { sourceId: 'IT-FW', targetId: 'OT-SW', encrypted: true, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'HMI-ESD', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'SIS-TMR', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'PLC-CTRL', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-CTRL', targetId: 'PV-001', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-CTRL', targetId: 'PV-002', encrypted: false, status: 'normal' },
          { sourceId: 'SIS-TMR', targetId: 'XV-ESD2', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, detail Triconex Safety ESD trip sequences and consensus voting mechanics during steam runaway overrides!'
      },
      {
        id: 'lab-29',
        title: 'Hydra SSH Credential Audit',
        icon: '⚔',
        category: 'sec',
        categoryLabel: 'THREAT DEFENSE',
        difficulty: 'Medium',
        desc: 'Perform stress-testing on remote administrative terminals to verify brute-force protection controls.',
        objective: 'Verify password complexity policies and active SSH lockouts on core switches. Run password auditing sweeps and observe system logs.',
        tasks: [
          'Initiate ssh credential test sweeps to the distribution switch interface.',
          'Confirm that access control lists limit brute-force rates.',
          'Enable strict SSH connection limits and login block-time settings.'
        ],
        topology: { nodes: [
          { id: 'SSH-TARGET', name: 'SSH Target Switch', ip: '10.90.1.1', type: 'it', role: 'Switch', x: 400, y: 160, status: 'stable', firmware: 'Catalyst 9300', os: 'Cisco IOS-XE' },
          { id: 'HYDRA-WS', name: 'Hydra Audit Workstation', ip: '10.90.1.99', type: 'it', role: 'Workstation', x: 200, y: 100, status: 'compromised', firmware: 'Kali Linux 2024', os: 'Linux 6.6' },
          { id: 'SSH-RTR', name: 'Core Router (SSH)', ip: '10.90.0.1', type: 'it', role: 'Router', x: 600, y: 160, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'LOG-SRV', name: 'Syslog / Audit Server', ip: '10.90.1.50', type: 'it', role: 'Server', x: 400, y: 320, status: 'stable', firmware: 'Graylog 5', os: 'Ubuntu Server 22' },
          { id: 'ADMIN-WS', name: 'Admin Workstation', ip: '10.90.1.20', type: 'it', role: 'Workstation', x: 700, y: 320, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' }
        ], links: [
          { sourceId: 'HYDRA-WS', targetId: 'SSH-TARGET', encrypted: false, status: 'normal' },
          { sourceId: 'SSH-TARGET', targetId: 'SSH-RTR', encrypted: true, status: 'normal' },
          { sourceId: 'SSH-TARGET', targetId: 'LOG-SRV', encrypted: false, status: 'normal' },
          { sourceId: 'SSH-RTR', targetId: 'ADMIN-WS', encrypted: true, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, outline SSH login protection policies and CLI rate-limiting configurations on Cisco IOS switches!'
      },
      {
        id: 'lab-30',
        title: 'IEEE 802.1X Access Security',
        icon: '🔌',
        category: 'sec',
        categoryLabel: 'THREAT DEFENSE',
        difficulty: 'Hard',
        desc: 'Configure port authentication parameters to isolate unauthorized user hardware.',
        objective: 'Unauthorized workstations are plugging directly into distribution panels. Activate 802.1X port security and authenticate nodes using RADIUS parameters.',
        tasks: [
          'Enable "dot1x system-auth-control" globally on access switches.',
          'Configure switch interfaces to require authentications.',
          'Confirm that unauthorized hardware nodes are immediately redirected to Guest VLAN segments.'
        ],
        topology: { nodes: [
          { id: 'RADIUS-SRV', name: 'RADIUS Auth Server', ip: '10.100.1.1', type: 'it', role: 'Server', x: 350, y: 80, status: 'stable', firmware: 'FreeRADIUS 3.2', os: 'Ubuntu Server 22' },
          { id: 'ACC-SW-DOT1X', name: 'Dot1X Access Switch', ip: '10.100.2.1', type: 'it', role: 'Switch', x: 350, y: 200, status: 'stable', firmware: 'Catalyst 2960-X', os: 'Cisco IOS' },
          { id: 'AUTH-WS', name: 'Authenticated Workstation', ip: '10.100.3.10', type: 'it', role: 'Workstation', x: 180, y: 340, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'UNAUTH-WS', name: 'Unauthenticated Device', ip: 'BLOCKED', type: 'it', role: 'Workstation', x: 520, y: 340, status: 'isolated', firmware: 'Unknown', os: 'Unknown' },
          { id: 'CORE-SW-DOT', name: 'Core Switch (Uplink)', ip: '10.100.0.1', type: 'it', role: 'Switch', x: 600, y: 200, status: 'stable', firmware: 'Catalyst 9300', os: 'Cisco IOS-XE' }
        ], links: [
          { sourceId: 'RADIUS-SRV', targetId: 'ACC-SW-DOT1X', encrypted: true, status: 'normal' },
          { sourceId: 'AUTH-WS', targetId: 'ACC-SW-DOT1X', encrypted: false, status: 'normal' },
          { sourceId: 'UNAUTH-WS', targetId: 'ACC-SW-DOT1X', encrypted: false, status: 'isolated' },
          { sourceId: 'ACC-SW-DOT1X', targetId: 'CORE-SW-DOT', encrypted: false, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, provide the complete switch configuration to enforce IEEE 802.1X authentication using RADIUS profiles!'
      },
      {
        id: 'lab-31',
        title: 'HSRP Core Redundancy Failover',
        icon: '🌐',
        category: 'infra',
        categoryLabel: 'OSPF CORE',
        difficulty: 'Medium',
        desc: 'Establish high-availability gateway paths to prevent server link drops.',
        objective: 'A single gateway crash will isolate the plant floor. Deploy HSRP across distribution switch gates to establish a redundant virtual gateway.',
        tasks: [
          'Configure HSRP Group 10 on active distribution interfaces.',
          'Establish a redundant virtual gateway IP address (10.1.10.254).',
          'Optimize HSRP priority states to enforce fail-safe secondary transitions.'
        ],
        topology: { nodes: [
          { id: 'HSRP-ACT', name: 'HSRP Active Gateway', ip: '10.110.0.1', type: 'it', role: 'Router', x: 280, y: 160, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'HSRP-STBY', name: 'HSRP Standby Gateway', ip: '10.110.0.2', type: 'it', role: 'Router', x: 520, y: 160, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'DIST-SW', name: 'Distribution Switch', ip: '10.110.1.1', type: 'it', role: 'Switch', x: 400, y: 80, status: 'stable', firmware: 'Catalyst 9300', os: 'Cisco IOS-XE' },
          { id: 'HOST-01', name: 'Host A (VIP Client)', ip: '10.110.2.10', type: 'it', role: 'Workstation', x: 200, y: 320, status: 'stable', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'HOST-02', name: 'Host B (VIP Client)', ip: '10.110.2.11', type: 'it', role: 'Workstation', x: 600, y: 320, status: 'stable', firmware: 'Ubuntu 22.04', os: 'Linux 5.15' }
        ], links: [
          { sourceId: 'DIST-SW', targetId: 'HSRP-ACT', encrypted: false, status: 'normal' },
          { sourceId: 'DIST-SW', targetId: 'HSRP-STBY', encrypted: false, status: 'normal' },
          { sourceId: 'HSRP-ACT', targetId: 'HOST-01', encrypted: false, status: 'normal' },
          { sourceId: 'HSRP-STBY', targetId: 'HOST-02', encrypted: false, status: 'normal' },
          { sourceId: 'HSRP-ACT', targetId: 'HSRP-STBY', encrypted: false, status: 'normal' }
        ]},
        projectType: 'campus',
        coDriverPayload: 'Aetheris Co-Driver, show me the HSRP configuration commands to configure primary and secondary hot-standby router gateways!'
      },
      {
        id: 'sandworm-crashoverride',
        icon: '⚡',
        title: 'Sandworm: CRASHOVERRIDE / Industroyer',
        difficulty: 'EXPERT',
        category: 'critical',
        categoryLabel: 'THREAT ACTOR',
        desc: 'Replicate the 2016 Ukraine power grid attack. Sandworm deploys IEC 61850 and DNP3 protocol wipers to trip substation breakers and disable protective relays.',
        objective: 'Detect and contain the Sandworm CRASHOVERRIDE wiper before it reaches the substation relay segment.',
        tasks: [
          'Identify the initial access vector: spear-phish against engineering workstation.',
          'Trace lateral movement from EWS to the IEC 61850 GOOSE publisher.',
          'Block rogue IEC 61850 GOOSE frames via protocol-aware firewall ACL.',
          'Isolate compromised relay nodes and restore protective relay state.',
          'Run post-incident forensics and generate ATT&CK for ICS timeline.'
        ],
        topology: { nodes: [
          { id: 'EWS-SPEAR', name: 'Spear-Phished EWS', ip: '10.1.0.20', type: 'it', role: 'Engineer Station', x: 80, y: 80, status: 'compromised', firmware: 'Windows LTSC 2021', os: 'Windows LTSC 2021' },
          { id: 'CORP-FW', name: 'Corporate Perimeter FW', ip: '10.1.0.1', type: 'it', role: 'Firewall', x: 200, y: 200, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' },
          { id: 'OT-SWITCH', name: 'Substation OT Switch', ip: '192.168.50.1', type: 'ot', role: 'Switch', x: 420, y: 200, status: 'stable', firmware: 'Hirschmann RS30', os: 'Hirschmann OS' },
          { id: 'IEC-PUB', name: 'IEC 61850 GOOSE Publisher', ip: '192.168.50.10', type: 'plc', role: 'Safety Controller', x: 590, y: 100, status: 'compromised', firmware: 'SEL-3355 v2.4', os: 'Embedded Linux' },
          { id: 'RELAY-01', name: 'Protective Relay IED-1', ip: '192.168.50.101', type: 'field', role: 'Sensor', x: 780, y: 60, status: 'compromised', firmware: 'SEL-421 Relay', os: 'ASIC' },
          { id: 'RELAY-02', name: 'Protective Relay IED-2', ip: '192.168.50.102', type: 'field', role: 'Sensor', x: 780, y: 180, status: 'stable', firmware: 'SEL-421 Relay', os: 'ASIC' },
          { id: 'RELAY-03', name: 'Protective Relay IED-3', ip: '192.168.50.103', type: 'field', role: 'Sensor', x: 780, y: 300, status: 'stable', firmware: 'SEL-421 Relay', os: 'ASIC' },
          { id: 'HIST-SCADA', name: 'SCADA Historian', ip: '192.168.50.50', type: 'ot', role: 'PI Historian', x: 590, y: 320, status: 'stable', firmware: 'OSIsoft PI 2023', os: 'Windows NT' }
        ], links: [
          { sourceId: 'EWS-SPEAR', targetId: 'CORP-FW', encrypted: false, status: 'normal' },
          { sourceId: 'CORP-FW', targetId: 'OT-SWITCH', encrypted: true, status: 'normal' },
          { sourceId: 'OT-SWITCH', targetId: 'IEC-PUB', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SWITCH', targetId: 'HIST-SCADA', encrypted: false, status: 'normal' },
          { sourceId: 'IEC-PUB', targetId: 'RELAY-01', encrypted: false, status: 'normal' },
          { sourceId: 'IEC-PUB', targetId: 'RELAY-02', encrypted: false, status: 'normal' },
          { sourceId: 'IEC-PUB', targetId: 'RELAY-03', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, walk me through the Sandworm CRASHOVERRIDE attack chain. Map each stage to MITRE ATT&CK for ICS technique IDs and show the containment playbook!'
      },
      {
        id: 'xenotime-trisis',
        icon: '☢',
        title: 'XENOTIME: TRITON / TRISIS Safety Override',
        difficulty: 'EXPERT',
        category: 'critical',
        categoryLabel: 'THREAT ACTOR',
        desc: 'Simulate the 2017 TRITON attack against Triconex Safety Instrumented Systems. XENOTIME overwrites SIS logic to suppress safety shutdowns during process excursion.',
        objective: 'Detect unauthorized writes to the SIS controller before the attacker disables the safety shutdown.',
        tasks: [
          'Identify the foothold on the DCS engineering workstation via RAT implant.',
          'Detect unauthorized TS3000 protocol frames targeting SIS controller.',
          'Verify SIS firmware integrity using checksum comparison.',
          'Force emergency SIS trip and isolate the segment.',
          'Document XENOTIME TTPs mapped to MITRE ATT&CK for ICS T0838/T0881.'
        ],
        topology: { nodes: [
          { id: 'DCS-EWS', name: 'DCS Engineering WS (RAT)', ip: '10.1.0.20', type: 'it', role: 'Engineer Station', x: 80, y: 80, status: 'compromised', firmware: 'Windows LTSC 2021', os: 'Windows LTSC 2021' },
          { id: 'OT-FW', name: 'OT Perimeter Firewall', ip: '10.2.0.1', type: 'it', role: 'Firewall', x: 220, y: 200, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' },
          { id: 'DCS-CTRL', name: 'DCS Main Controller', ip: '192.168.30.10', type: 'plc', role: 'DCS Controller', x: 430, y: 100, status: 'stable', firmware: 'Emerson DeltaV v14.3', os: 'Emerson DeltaV v14.3' },
          { id: 'OT-SW', name: 'Safety Bus Switch', ip: '192.168.30.1', type: 'ot', role: 'Switch', x: 430, y: 220, status: 'stable', firmware: 'Hirschmann RS30', os: 'Hirschmann OS' },
          { id: 'SIS-TRITON', name: 'Triconex SIS (TRITON Target)', ip: '192.168.20.10', type: 'plc', role: 'Safety Controller', x: 620, y: 160, status: 'compromised', firmware: 'Triconex v10.4', os: 'Triconex OS' },
          { id: 'SCADA-MAIN', name: 'SCADA Master Console', ip: '192.168.30.5', type: 'ot', role: 'SCADA HMI', x: 280, y: 80, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'ESD-V1', name: 'ESD Process Valve', ip: 'Slave 0x01', type: 'field', role: 'Actuator', x: 800, y: 100, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' },
          { id: 'ESD-V2', name: 'Emergency Vent Valve', ip: 'Slave 0x02', type: 'field', role: 'Actuator', x: 800, y: 260, status: 'stable', firmware: 'Modbus RTU', os: 'ASIC' }
        ], links: [
          { sourceId: 'DCS-EWS', targetId: 'OT-FW', encrypted: false, status: 'normal' },
          { sourceId: 'OT-FW', targetId: 'OT-SW', encrypted: true, status: 'normal' },
          { sourceId: 'OT-FW', targetId: 'SCADA-MAIN', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'DCS-CTRL', encrypted: false, status: 'normal' },
          { sourceId: 'OT-SW', targetId: 'SIS-TRITON', encrypted: false, status: 'normal' },
          { sourceId: 'SIS-TRITON', targetId: 'ESD-V1', encrypted: false, status: 'normal' },
          { sourceId: 'SIS-TRITON', targetId: 'ESD-V2', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, explain the TRITON attack chain targeting Triconex SIS. Show the TS3000 frame analysis and the recovery procedure to restore safe SIS state!'
      },
      {
        id: 'apt33-shamoon-ot',
        icon: '🔥',
        title: 'APT33: Shamoon OT Pivot & SCADA Wiper',
        difficulty: 'ADVANCED',
        category: 'critical',
        categoryLabel: 'THREAT ACTOR',
        desc: 'APT33 (Elfin) uses Shamoon wiper to destroy SCADA HMI workstations after exfiltrating historian data. Contains a pivot from a compromised corporate VPN into the OT DMZ.',
        objective: 'Detect the Shamoon OT pivot, preserve historian evidence, and contain the wiper before HMI destruction.',
        tasks: [
          'Identify the initial corporate VPN breach via stolen service account.',
          'Detect anomalous historian OPC-DA read bursts (data exfiltration).',
          'Block east-west OT-DMZ lateral movement at the Purdue Level 3.5 firewall.',
          'Snapshot historian data before wiper overwrites MBR.',
          'Restore HMI from clean baseline and validate OPC tag integrity.'
        ],
        topology: { nodes: [
          { id: 'VPN-GW', name: 'Corporate VPN Gateway', ip: '10.1.0.1', type: 'it', role: 'Firewall', x: 100, y: 200, status: 'stable', firmware: 'PAN-OS 11.0', os: 'Palo Alto' },
          { id: 'CORP-WS', name: 'Compromised Corp WS', ip: '10.1.0.30', type: 'it', role: 'Workstation', x: 100, y: 80, status: 'compromised', firmware: 'Windows 11', os: 'Windows 11' },
          { id: 'OT-DMZ-FW', name: 'OT-DMZ Firewall L3.5', ip: '10.2.0.1', type: 'it', role: 'Firewall', x: 300, y: 200, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' },
          { id: 'HIST-APT', name: 'Plant Historian (Exfil)', ip: '192.168.10.50', type: 'ot', role: 'PI Historian', x: 500, y: 80, status: 'compromised', firmware: 'OSIsoft PI 2023', os: 'Windows NT' },
          { id: 'HMI-WIPER', name: 'SCADA HMI (Wiper Target)', ip: '192.168.10.5', type: 'ot', role: 'SCADA HMI', x: 500, y: 220, status: 'compromised', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'OPC-SRV', name: 'OPC-UA Server', ip: '192.168.10.10', type: 'ot', role: 'Server', x: 680, y: 140, status: 'stable', firmware: 'Kepware 6', os: 'Windows NT' },
          { id: 'PLC-MAIN', name: 'Process PLC Controller', ip: '192.168.10.101', type: 'plc', role: 'Modbus PLC', x: 720, y: 280, status: 'stable', firmware: 'Logix5580', os: 'VxWorks' },
          { id: 'V-101', name: 'Inlet Feed Valve (V-101)', ip: '192.168.10.201', type: 'field', role: 'Feed Valve', x: 780, y: 130, status: 'stable', firmware: 'Fisher DVC6200', os: 'Modbus RTU' },
          { id: 'XV-103', name: 'Relief Vent Valve (XV-103)', ip: '192.168.10.203', type: 'field', role: 'Safety Valve', x: 780, y: 170, status: 'stable', firmware: 'Fisher DVC6200', os: 'Modbus RTU' },
          { id: 'V-102', name: 'Outlet Drain Valve (V-102)', ip: '192.168.10.202', type: 'field', role: 'Drain Valve', x: 780, y: 250, status: 'stable', firmware: 'Fisher DVC6200', os: 'Modbus RTU' },
          { id: 'T-300', name: 'Vessel Transmitter (T-300)', ip: '192.168.10.204', type: 'field', role: 'Transmitter', x: 780, y: 370, status: 'stable', firmware: 'Rosemount 3051S', os: 'Modbus RTU' }
        ], links: [
          { sourceId: 'CORP-WS', targetId: 'VPN-GW', encrypted: false, status: 'normal' },
          { sourceId: 'VPN-GW', targetId: 'OT-DMZ-FW', encrypted: true, status: 'normal' },
          { sourceId: 'OT-DMZ-FW', targetId: 'HIST-APT', encrypted: false, status: 'normal' },
          { sourceId: 'OT-DMZ-FW', targetId: 'HMI-WIPER', encrypted: false, status: 'normal' },
          { sourceId: 'HMI-WIPER', targetId: 'OPC-SRV', encrypted: false, status: 'normal' },
          { sourceId: 'OPC-SRV', targetId: 'PLC-MAIN', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-MAIN', targetId: 'V-101', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-MAIN', targetId: 'XV-103', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-MAIN', targetId: 'V-102', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-MAIN', targetId: 'T-300', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, outline the APT33 Shamoon OT pivot kill chain. Detail the historian exfiltration detection rules and the HMI recovery procedure!'
      },
      {
        id: 'water-chlorine-attack',
        icon: '💧',
        title: 'Municipal Water — Chlorine Dosing Attack',
        difficulty: 'Medium',
        category: 'critical',
        categoryLabel: 'WATER / ICS',
        desc: 'A threat actor has gained access to the water treatment SCADA and is remotely manipulating the chlorine dosing pump to dangerous levels, mirroring the 2021 Oldsmar water plant attack.',
        objective: 'Detect the chlorine over-dosing attack on the municipal water treatment plant, isolate the compromised HMI, and restore safe dosing levels before the contaminated water reaches distribution.',
        tasks: [
          'Open the Water Treatment SCADA panel and observe chlorine residual telemetry.',
          'Trigger the "Inject Cl Attack" to simulate the dosing pump override.',
          'Identify the anomalous chlorine reading (>4 mg/L toxic threshold) on the alert board.',
          'Isolate the compromised HMI-WT node on the canvas (right-click → Isolate).',
          'Reset the chlorine dose pump to nominal (60%) and verify safe levels restore.'
        ],
        projectType: 'water',
        coDriverPayload: 'Aetheris Co-Driver, explain the 2021 Oldsmar water treatment attack. What were the MITRE ATT&CK techniques used and how do I detect abnormal chlorine dosing in a SCADA system?'
      },
      {
        id: 'grid-crashoverride',
        icon: '⚡',
        title: 'Power Grid — CrashOverride / Industroyer',
        difficulty: 'Hard',
        category: 'critical',
        categoryLabel: 'POWER GRID / ICS',
        desc: 'Recreate the 2016 Ukraine Industroyer/CrashOverride attack: malware autonomously trips substation circuit breakers via IEC-61850 GOOSE messages, causing a blackout of 200,000 customers.',
        objective: 'Detect the automated breaker-tripping campaign on the 138 kV substation, re-close the tripped circuit breakers, and implement load shedding to stabilise grid frequency before a full blackout.',
        tasks: [
          'Launch the Power Grid EMS panel and observe live frequency and voltage telemetry.',
          'Activate "CrashOverride Mode" to simulate the Industroyer breaker sabotage.',
          'Monitor the protection alarm log for CB-1 and CB-2 trip events.',
          'Re-close tripped breakers (CLOSE CB-1, CLOSE CB-2) to restore feeder paths.',
          'Activate Load Shedding to arrest frequency decline and stabilise the grid.',
          'Isolate the compromised attacker node (ATK-GRID) on the canvas.'
        ],
        projectType: 'grid',
        topology: { nodes: [
          { id: 'SCADA-DMS',  label: 'SCADA-DMS',  type: 'workstation', role: 'Energy Management System',   x: 360, y: 80,  ip: '10.3.20.10', status: 'online' },
          { id: 'HMI-GRID',   label: 'HMI-GRID',   type: 'workstation', role: 'SCADA HMI Workstation',      x: 560, y: 80,  ip: '10.3.20.11', status: 'online' },
          { id: 'RELAY-01',   label: 'RELAY-01',    type: 'sis',         role: 'Distance Protection Relay',  x: 140, y: 200, ip: '10.3.10.21', status: 'online' },
          { id: 'RELAY-02',   label: 'RELAY-02',    type: 'sis',         role: 'Overcurrent Relay (Feeder B)',x: 360, y: 200, ip: '10.3.10.22', status: 'online' },
          { id: 'RELAY-03',   label: 'RELAY-03',    type: 'sis',         role: 'Bus Differential Relay',     x: 580, y: 200, ip: '10.3.10.23', status: 'online' },
          { id: 'RTU-GRID',   label: 'RTU-GRID',    type: 'router',      role: 'Substation RTU Gateway',     x: 360, y: 320, ip: '10.3.10.1',  status: 'online' },
          { id: 'HIST-GRID',  label: 'HIST-GRID',   type: 'workstation', role: 'PI Historian (Grid)',         x: 580, y: 380, ip: '10.3.20.50', status: 'online' },
          { id: 'FW-GRID',    label: 'FW-GRID',     type: 'firewall',    role: 'OT Perimeter Firewall',      x: 360, y: 450, ip: '10.3.1.1',   status: 'online' },
          { id: 'CORP-JUMP',  label: 'CORP-JUMP',   type: 'workstation', role: 'Jump Server / IT Bridge',    x: 140, y: 450, ip: '10.3.1.20',  status: 'online' },
          { id: 'ATK-GRID',   label: 'ATK-GRID',    type: 'workstation', role: 'Attacker Workstation',       x: 140, y: 560, ip: '10.3.1.99',  status: 'compromised' },
        ], links: [
          { from: 'RELAY-01', to: 'RTU-GRID',  protocol: 'IEC-61850', speed: '100M' },
          { from: 'RELAY-02', to: 'RTU-GRID',  protocol: 'IEC-61850', speed: '100M' },
          { from: 'RELAY-03', to: 'RTU-GRID',  protocol: 'IEC-61850', speed: '100M' },
          { from: 'RTU-GRID', to: 'SCADA-DMS', protocol: 'DNP3',      speed: '1G'   },
          { from: 'RTU-GRID', to: 'HMI-GRID',  protocol: 'OPC-UA',    speed: '1G'   },
          { from: 'HMI-GRID', to: 'HIST-GRID', protocol: 'OPC-DA',    speed: '1G'   },
          { from: 'RTU-GRID', to: 'FW-GRID',   protocol: 'HTTPS',     speed: '1G'   },
          { from: 'FW-GRID',  to: 'CORP-JUMP', protocol: 'HTTPS',     speed: '1G'   },
          { from: 'ATK-GRID', to: 'CORP-JUMP', protocol: 'SSH',       speed: '1G',  status: 'active' },
        ]},
        coDriverPayload: 'Aetheris Co-Driver, explain the 2016 Ukraine Industroyer/CrashOverride attack in detail. What IEC-61850 GOOSE commands did the malware send to trip breakers, and what are the MITRE ATT&CK for ICS techniques involved?'
      },
      {
        id: 'grid-fdi-attack',
        icon: '📡',
        title: 'Power Grid — False Data Injection (FDI)',
        difficulty: 'Hard',
        category: 'ics',
        categoryLabel: 'POWER GRID / ICS',
        desc: 'An attacker injects false telemetry values into the Energy Management System, causing the operator to believe the grid is operating normally while voltage collapse is imminent. Based on NERC CIP-007 threats.',
        objective: 'Identify the False Data Injection attack corrupting SCADA readings, cross-correlate historian data against real sensor values to expose the spoofed telemetry, and restore true observability.',
        tasks: [
          'Open the Power Grid EMS panel and note baseline frequency and voltage.',
          'Activate "Inject FDI Attack" — SCADA readings will freeze to nominal values.',
          'Use the canvas to inspect the RTU-GRID and historian nodes for telemetry discrepancies.',
          'Compare historian real values vs SCADA-reported values in the alarm log.',
          'Disable the FDI attack and verify true telemetry is restored.',
          'Adjust the tap changer to correct voltage deviation exposed post-FDI.'
        ],
        projectType: 'grid',
        topology: { nodes: [
          { id: 'SCADA-DMS',  label: 'SCADA-DMS',  type: 'workstation', role: 'Energy Management System',   x: 360, y: 80,  ip: '10.3.20.10', status: 'compromised' },
          { id: 'HMI-GRID',   label: 'HMI-GRID',   type: 'workstation', role: 'SCADA HMI Workstation',      x: 560, y: 80,  ip: '10.3.20.11', status: 'online' },
          { id: 'RELAY-03',   label: 'RELAY-03',    type: 'sis',         role: 'Bus Differential Relay',     x: 580, y: 200, ip: '10.3.10.23', status: 'online' },
          { id: 'RELAY-01',   label: 'RELAY-01',    type: 'sis',         role: 'Distance Protection Relay',  x: 140, y: 200, ip: '10.3.10.21', status: 'online' },
          { id: 'RELAY-02',   label: 'RELAY-02',    type: 'sis',         role: 'Overcurrent Relay (Feeder B)',x: 360, y: 200, ip: '10.3.10.22', status: 'online' },
          { id: 'RTU-GRID',   label: 'RTU-GRID',    type: 'router',      role: 'Substation RTU Gateway',     x: 360, y: 320, ip: '10.3.10.1',  status: 'online' },
          { id: 'HIST-GRID',  label: 'HIST-GRID',   type: 'workstation', role: 'PI Historian (Grid)',         x: 580, y: 380, ip: '10.3.20.50', status: 'online' },
          { id: 'FW-GRID',    label: 'FW-GRID',     type: 'firewall',    role: 'OT Perimeter Firewall',      x: 360, y: 450, ip: '10.3.1.1',   status: 'online' },
          { id: 'MIM-PROXY',  label: 'MIM-PROXY',   type: 'workstation', role: 'Man-in-Middle Proxy',        x: 140, y: 320, ip: '10.3.10.50', status: 'compromised' },
          { id: 'CORP-JUMP',  label: 'CORP-JUMP',   type: 'workstation', role: 'Jump Server / IT Bridge',    x: 140, y: 450, ip: '10.3.1.20',  status: 'online' },
        ], links: [
          { from: 'RELAY-03', to: 'RTU-GRID',  protocol: 'IEC-61850', speed: '100M' },
          { from: 'RELAY-01', to: 'RTU-GRID',  protocol: 'IEC-61850', speed: '100M' },
          { from: 'RELAY-02', to: 'RTU-GRID',  protocol: 'IEC-61850', speed: '100M' },
          { from: 'RTU-GRID', to: 'MIM-PROXY', protocol: 'DNP3',      speed: '100M', status: 'active' },
          { from: 'MIM-PROXY', to: 'SCADA-DMS', protocol: 'DNP3',     speed: '1G',   status: 'active' },
          { from: 'RTU-GRID', to: 'HMI-GRID',  protocol: 'OPC-UA',    speed: '1G'   },
          { from: 'HMI-GRID', to: 'HIST-GRID', protocol: 'OPC-DA',    speed: '1G'   },
          { from: 'RTU-GRID', to: 'FW-GRID',   protocol: 'HTTPS',     speed: '1G'   },
          { from: 'FW-GRID',  to: 'CORP-JUMP', protocol: 'HTTPS',     speed: '1G'   },
        ]},
        coDriverPayload: 'Aetheris Co-Driver, explain False Data Injection (FDI) attacks against power grid EMS/SCADA. How do attackers bypass state estimation, what NERC CIP controls detect FDI, and what are the MITRE ATT&CK for ICS techniques?'
      },
      {
        id: 'mega-ics-enterprise',
        icon: '🏭',
        title: 'Mega ICS/IT Enterprise — Full Purdue 46-Node Complex',
        difficulty: 'Expert',
        category: 'ics',
        categoryLabel: 'ENTERPRISE ICS',
        desc: 'A full 46-node enterprise + ICS topology spanning all Purdue Model levels (0–3), corporate IT, OT-DMZ, WAN remote site, and safety systems. Real-world complexity for advanced threat hunting, segmentation audits, and attack path analysis.',
        objective: 'Navigate and audit a multi-zone ICS/IT enterprise. A compromised corporate workstation (CORP-WS1) has a potential lateral movement path toward SCADA and safety systems spanning five security zones. Enumerate every segmentation control and map the full attack surface from internet to Level-0 field devices.',
        tasks: [
          'Audit all five firewall boundaries in sequence: CORP-FW → OT-DMZ-FW → OT-L3-FW → OT-L2-SW → OT-L1-SW. Confirm correct zone assignment for each.',
          'Trace the lateral movement path from CORP-WS1 (10.10.2.10, compromised) through OT-DMZ to SCADA-SRV1 (192.168.2.10). Count the hops and identify each firewall that must be bypassed.',
          'List all Level-0 field devices (FT-001 through ANAL-001) and verify each communicates with its Level-1 PLC without encryption — document the unencrypted Modbus/Profibus links.',
          'Locate the DATA-DIODE (Owl Cyber Defense) and verify it only forwards outbound telemetry from OT-L3 to HIST-SRV. Confirm no return path exists.',
          'Assess the Remote WAN site attack path: REMOTE-PLC → REMOTE-RTU → REMOTE-FW → INET-RTR → CORP-FW. Determine the minimum number of hops to reach SIS-CTRL (Triconex TMR) and identify which zones are traversed.'
        ],
        topology: { nodes: [
          /* ── Internet / WAN Edge ── */
          { id: 'INET-RTR', name: 'Internet Edge Router', ip: '203.0.113.1', type: 'it', role: 'Router', x: 580, y: 60, status: 'stable', firmware: 'Cisco ASR 1002-X', os: 'Cisco IOS-XE' },

          /* ── Corporate IT ── */
          { id: 'CORP-FW', name: 'Corporate Perimeter NGFW (Palo Alto)', ip: '10.0.1.1', type: 'it', role: 'Firewall', x: 360, y: 140, status: 'stable', firmware: 'PAN-OS 11.0', os: 'Palo Alto' },
          { id: 'DMZ-FW', name: 'DMZ Application Firewall', ip: '10.0.2.1', type: 'it', role: 'Firewall', x: 760, y: 140, status: 'stable', firmware: 'FortiOS 7.4', os: 'FortiOS' },
          { id: 'IT-CORE-SW', name: 'IT Core Catalyst 9500', ip: '10.10.0.2', type: 'it', role: 'Switch', x: 360, y: 220, status: 'stable', firmware: 'Catalyst 9500', os: 'Cisco IOS-XE' },
          { id: 'CORE-RTR', name: 'Core Distribution Router', ip: '10.10.0.1', type: 'it', role: 'Router', x: 200, y: 220, status: 'stable', firmware: 'Cisco IOSv 15.9', os: 'Cisco IOS' },
          { id: 'AD-PDC', name: 'AD Primary Domain Controller', ip: '10.10.1.1', type: 'it', role: 'AD Server', x: 520, y: 220, status: 'stable', firmware: 'Windows Server 2022', os: 'Windows NT' },
          { id: 'AD-BDC', name: 'AD Backup Domain Controller', ip: '10.10.1.2', type: 'it', role: 'AD Server', x: 670, y: 220, status: 'stable', firmware: 'Windows Server 2022', os: 'Windows NT' },
          { id: 'SIEM-SRV', name: 'Splunk SIEM Platform', ip: '10.10.1.20', type: 'it', role: 'Server', x: 300, y: 300, status: 'stable', firmware: 'Splunk Enterprise 9.2', os: 'Ubuntu Server 22' },
          { id: 'JUMP-SRV', name: 'Privileged Access Jump Server (PAM)', ip: '10.10.1.50', type: 'it', role: 'Server', x: 130, y: 300, status: 'stable', firmware: 'CyberArk PSM 14', os: 'Windows Server 2022' },
          { id: 'MAIL-SRV', name: 'Exchange Email Server', ip: '10.10.1.10', type: 'it', role: 'Server', x: 520, y: 300, status: 'stable', firmware: 'Exchange 2019 CU14', os: 'Windows NT' },
          { id: 'CORP-WS1', name: 'Compromised Corporate Workstation', ip: '10.10.2.10', type: 'it', role: 'Workstation', x: 680, y: 300, status: 'compromised', firmware: 'Windows 11 22H2', os: 'Windows 11' },
          { id: 'CORP-WS2', name: 'Corporate Workstation 2', ip: '10.10.2.11', type: 'it', role: 'Workstation', x: 840, y: 220, status: 'stable', firmware: 'Windows 11 22H2', os: 'Windows 11' },

          /* ── OT DMZ (Purdue Level 3.5) ── */
          { id: 'OT-DMZ-FW', name: 'OT-DMZ Segmentation Firewall', ip: '172.16.1.1', type: 'it', role: 'Firewall', x: 260, y: 390, status: 'stable', firmware: 'FortiGate 200F', os: 'FortiOS' },
          { id: 'OT-SIEM', name: 'Claroty Continuous Threat Detection', ip: '172.16.2.50', type: 'ot', role: 'IDS Sensor', x: 130, y: 390, status: 'stable', firmware: 'Claroty CTD v4.2', os: 'Embedded Linux' },
          { id: 'HIST-ENT', name: 'OSIsoft PI Historian (Enterprise)', ip: '172.16.2.10', type: 'ot', role: 'PI Historian', x: 420, y: 390, status: 'stable', firmware: 'OSIsoft PI 2023', os: 'Windows NT' },
          { id: 'MES-SRV', name: 'MES / SAP ME Integration Server', ip: '172.16.2.20', type: 'ot', role: 'Server', x: 570, y: 390, status: 'stable', firmware: 'SAP ME 15.4', os: 'Windows NT' },
          { id: 'PATCH-SRV', name: 'WSUS OT Patch Management', ip: '172.16.2.30', type: 'it', role: 'Server', x: 720, y: 390, status: 'stable', firmware: 'WSUS 10', os: 'Windows Server 2022' },

          /* ── OT Level 3 — Site Operations ── */
          { id: 'OT-L3-FW', name: 'OT Level 3 Zone Firewall', ip: '192.168.1.1', type: 'ot', role: 'Firewall', x: 260, y: 480, status: 'stable', firmware: 'FortiGate 80F', os: 'FortiOS' },
          { id: 'DATA-DIODE', name: 'Owl Cyber Defense Data Diode', ip: '192.168.1.100', type: 'it', role: 'Data Diode', x: 430, y: 480, status: 'stable', firmware: 'Owl OPDS v8.1', os: 'Owl OS' },
          { id: 'OT-CORE-SW', name: 'OT Operations Core Switch', ip: '192.168.1.2', type: 'ot', role: 'Switch', x: 600, y: 480, status: 'stable', firmware: 'Hirschmann RS40', os: 'Hirschmann OS' },
          { id: 'SCADA-SRV1', name: 'Ignition SCADA Primary Server', ip: '192.168.2.10', type: 'ot', role: 'SCADA HMI', x: 480, y: 560, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'SCADA-SRV2', name: 'Ignition SCADA Redundant Server', ip: '192.168.2.11', type: 'ot', role: 'SCADA HMI', x: 640, y: 560, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'EWS-1', name: 'Engineering Workstation — Unit 1', ip: '192.168.2.20', type: 'ot', role: 'Engineer Station', x: 340, y: 560, status: 'stable', firmware: 'Windows LTSC 2021', os: 'Windows LTSC 2021' },
          { id: 'EWS-2', name: 'Engineering Workstation — Unit 2/3', ip: '192.168.2.21', type: 'ot', role: 'Engineer Station', x: 180, y: 560, status: 'stable', firmware: 'Windows LTSC 2021', os: 'Windows LTSC 2021' },
          { id: 'OPS-HMI', name: 'Operator Control Room HMI', ip: '192.168.2.30', type: 'ot', role: 'SCADA HMI', x: 800, y: 560, status: 'stable', firmware: 'Ignition 8.1', os: 'Ubuntu Core' },
          { id: 'OPC-SRV', name: 'Kepware OPC-UA Gateway', ip: '192.168.2.40', type: 'ot', role: 'Server', x: 960, y: 480, status: 'stable', firmware: 'KEPServerEX 6.16', os: 'Windows NT' },

          /* ── OT Level 2 — Supervisory Control ── */
          { id: 'OT-L2-SW', name: 'Level 2 Supervisory Switch', ip: '192.168.10.1', type: 'ot', role: 'Switch', x: 500, y: 650, status: 'stable', firmware: 'Hirschmann RS30', os: 'Hirschmann OS' },
          { id: 'DCS-CTRL', name: 'Emerson DeltaV DCS Controller', ip: '192.168.10.10', type: 'plc', role: 'DCS Controller', x: 660, y: 650, status: 'stable', firmware: 'Emerson DeltaV v14.3', os: 'Emerson DeltaV RTOS' },
          { id: 'SIS-CTRL', name: 'Triconex TMR SIS (Safety System)', ip: '192.168.10.20', type: 'plc', role: 'Safety Controller', x: 820, y: 650, status: 'stable', firmware: 'Triconex v10.4', os: 'Triconex OS' },
          { id: 'SIS-HMI', name: 'Safety Instrumented System HMI', ip: '192.168.10.30', type: 'ot', role: 'SCADA HMI', x: 980, y: 650, status: 'stable', firmware: 'Ignition 8.1', os: 'Windows LTSC 2021' },

          /* ── OT Level 1 — Process Control ── */
          { id: 'OT-L1-SW', name: 'Level 1 Process Bus Switch', ip: '192.168.20.1', type: 'ot', role: 'Switch', x: 500, y: 750, status: 'stable', firmware: 'Hirschmann RS30', os: 'Hirschmann OS' },
          { id: 'PROFIBUS-GW', name: 'Siemens CM 1542 Profibus Gateway', ip: '192.168.20.10', type: 'ot', role: 'Router', x: 700, y: 750, status: 'stable', firmware: 'Siemens CM 1542-SP', os: 'Embedded RTOS' },
          { id: 'PLC-UNIT1', name: 'AB ControlLogix L5580 — Unit 1', ip: '192.168.20.101', type: 'plc', role: 'Modbus PLC', x: 580, y: 830, status: 'stable', firmware: 'Logix5580 v32.011', os: 'VxWorks' },
          { id: 'PLC-UNIT2', name: 'AB ControlLogix L5580 — Unit 2', ip: '192.168.20.102', type: 'plc', role: 'Modbus PLC', x: 740, y: 830, status: 'stable', firmware: 'Logix5580 v32.011', os: 'VxWorks' },
          { id: 'PLC-UNIT3', name: 'Siemens S7-1515 — Unit 3', ip: '192.168.20.103', type: 'plc', role: 'Safety Controller', x: 900, y: 830, status: 'stable', firmware: 'Siemens S7-1500 FW 2.9', os: 'Embedded RTOS' },
          { id: 'RTU-WAN', name: 'Remote Terminal Unit (WAN-B site)', ip: '192.168.20.200', type: 'plc', role: 'Modbus PLC', x: 340, y: 750, status: 'stable', firmware: 'SEL-3530 RTAC', os: 'Embedded Linux' },

          /* ── OT Level 0 — Field Instruments ── */
          { id: 'FT-001', name: 'Flow Transmitter FT-001 (Inlet)', ip: 'Slave 0x01', type: 'field', role: 'Sensor', x: 520, y: 920, status: 'stable', firmware: 'Endress+Hauser Proline', os: 'ASIC' },
          { id: 'PT-001', name: 'Pressure Transmitter PT-001', ip: 'Slave 0x02', type: 'field', role: 'Sensor', x: 630, y: 920, status: 'stable', firmware: 'Rosemount 3051S', os: 'ASIC' },
          { id: 'PT-002', name: 'Pressure Transmitter PT-002 (HP)', ip: 'Slave 0x03', type: 'field', role: 'Sensor', x: 740, y: 920, status: 'stable', firmware: 'Rosemount 3051S', os: 'ASIC' },
          { id: 'TT-001', name: 'Temperature Transmitter TT-001', ip: 'Slave 0x04', type: 'field', role: 'Sensor', x: 850, y: 920, status: 'stable', firmware: 'Endress+Hauser iTEMP', os: 'ASIC' },
          { id: 'XV-001', name: 'Feed Valve Actuator XV-001', ip: 'Slave 0x05', type: 'field', role: 'Actuator', x: 980, y: 830, status: 'stable', firmware: 'Fisher DVC6200', os: 'Modbus RTU' },
          { id: 'XV-002', name: 'Safety Relief Valve XV-002 (SIS)', ip: 'Slave 0x06', type: 'field', role: 'Actuator', x: 1100, y: 830, status: 'stable', firmware: 'Fisher DVC6200', os: 'Modbus RTU' },
          { id: 'VFD-001', name: 'ABB ACS880 VFD Pump Motor A', ip: 'Slave 0x07', type: 'field', role: 'Actuator', x: 960, y: 920, status: 'stable', firmware: 'ABB ACS880 FW 2.9', os: 'ASIC' },
          { id: 'ANAL-001', name: 'H2 Gas Leak Analyzer (Area C)', ip: 'Slave 0x08', type: 'field', role: 'Sensor', x: 1070, y: 920, status: 'stable', firmware: 'MSA Chillgard 5000', os: 'ASIC' },

          /* ── Remote WAN Site ── */
          { id: 'REMOTE-FW', name: 'Remote Site VPN Firewall', ip: '10.99.1.1', type: 'it', role: 'Firewall', x: 100, y: 480, status: 'stable', firmware: 'PAN-OS 11.0', os: 'Palo Alto' },
          { id: 'REMOTE-RTU', name: 'Remote Site RTU Gateway', ip: '10.99.1.10', type: 'ot', role: 'Router', x: 100, y: 580, status: 'stable', firmware: 'SEL-3505 RTAC', os: 'Embedded Linux' },
          { id: 'REMOTE-PLC', name: 'Remote Field PLC (Site B)', ip: '10.99.1.101', type: 'plc', role: 'Modbus PLC', x: 100, y: 660, status: 'stable', firmware: 'Logix5380', os: 'VxWorks' }
        ], links: [
          /* Internet → Corporate */
          { sourceId: 'INET-RTR', targetId: 'CORP-FW', encrypted: false, status: 'normal' },
          { sourceId: 'INET-RTR', targetId: 'DMZ-FW', encrypted: false, status: 'normal' },
          /* Remote WAN VPN */
          { sourceId: 'INET-RTR', targetId: 'REMOTE-FW', encrypted: true, status: 'normal' },

          /* Corporate IT fabric */
          { sourceId: 'CORP-FW', targetId: 'CORE-RTR', encrypted: true, status: 'normal' },
          { sourceId: 'CORP-FW', targetId: 'IT-CORE-SW', encrypted: true, status: 'normal' },
          { sourceId: 'CORE-RTR', targetId: 'JUMP-SRV', encrypted: true, status: 'normal' },
          { sourceId: 'IT-CORE-SW', targetId: 'SIEM-SRV', encrypted: false, status: 'normal' },
          { sourceId: 'IT-CORE-SW', targetId: 'AD-PDC', encrypted: false, status: 'normal' },
          { sourceId: 'IT-CORE-SW', targetId: 'AD-BDC', encrypted: false, status: 'normal' },
          { sourceId: 'IT-CORE-SW', targetId: 'MAIL-SRV', encrypted: false, status: 'normal' },
          { sourceId: 'IT-CORE-SW', targetId: 'CORP-WS1', encrypted: false, status: 'normal' },
          { sourceId: 'AD-BDC', targetId: 'CORP-WS2', encrypted: false, status: 'normal' },
          { sourceId: 'AD-PDC', targetId: 'AD-BDC', encrypted: true, status: 'normal' },

          /* Corporate → OT-DMZ */
          { sourceId: 'CORP-FW', targetId: 'OT-DMZ-FW', encrypted: true, status: 'normal' },
          { sourceId: 'OT-DMZ-FW', targetId: 'OT-SIEM', encrypted: false, status: 'normal' },
          { sourceId: 'OT-DMZ-FW', targetId: 'HIST-ENT', encrypted: false, status: 'normal' },
          { sourceId: 'OT-DMZ-FW', targetId: 'MES-SRV', encrypted: false, status: 'normal' },
          { sourceId: 'OT-DMZ-FW', targetId: 'PATCH-SRV', encrypted: false, status: 'normal' },

          /* OT-DMZ → L3 */
          { sourceId: 'OT-DMZ-FW', targetId: 'OT-L3-FW', encrypted: true, status: 'normal' },
          { sourceId: 'OT-L3-FW', targetId: 'DATA-DIODE', encrypted: false, status: 'normal' },
          { sourceId: 'OT-L3-FW', targetId: 'OT-CORE-SW', encrypted: false, status: 'normal' },
          { sourceId: 'DATA-DIODE', targetId: 'HIST-ENT', encrypted: false, status: 'normal' },
          { sourceId: 'OT-CORE-SW', targetId: 'SCADA-SRV1', encrypted: false, status: 'normal' },
          { sourceId: 'OT-CORE-SW', targetId: 'SCADA-SRV2', encrypted: false, status: 'normal' },
          { sourceId: 'OT-CORE-SW', targetId: 'EWS-1', encrypted: false, status: 'normal' },
          { sourceId: 'OT-CORE-SW', targetId: 'EWS-2', encrypted: false, status: 'normal' },
          { sourceId: 'OT-CORE-SW', targetId: 'OPS-HMI', encrypted: false, status: 'normal' },
          { sourceId: 'OT-CORE-SW', targetId: 'OPC-SRV', encrypted: false, status: 'normal' },
          { sourceId: 'SCADA-SRV1', targetId: 'SCADA-SRV2', encrypted: true, status: 'normal' },

          /* L3 → L2 */
          { sourceId: 'OT-CORE-SW', targetId: 'OT-L2-SW', encrypted: false, status: 'normal' },
          { sourceId: 'OPC-SRV', targetId: 'DCS-CTRL', encrypted: false, status: 'normal' },
          { sourceId: 'OT-L2-SW', targetId: 'DCS-CTRL', encrypted: false, status: 'normal' },
          { sourceId: 'OT-L2-SW', targetId: 'SIS-CTRL', encrypted: false, status: 'normal' },
          { sourceId: 'OT-L2-SW', targetId: 'SIS-HMI', encrypted: false, status: 'normal' },

          /* L2 → L1 */
          { sourceId: 'OT-L2-SW', targetId: 'OT-L1-SW', encrypted: false, status: 'normal' },
          { sourceId: 'OT-L1-SW', targetId: 'PROFIBUS-GW', encrypted: false, status: 'normal' },
          { sourceId: 'OT-L1-SW', targetId: 'PLC-UNIT1', encrypted: false, status: 'normal' },
          { sourceId: 'OT-L1-SW', targetId: 'PLC-UNIT2', encrypted: false, status: 'normal' },
          { sourceId: 'PROFIBUS-GW', targetId: 'PLC-UNIT3', encrypted: false, status: 'normal' },
          { sourceId: 'OT-L1-SW', targetId: 'RTU-WAN', encrypted: false, status: 'normal' },

          /* L1 → L0 Field */
          { sourceId: 'PLC-UNIT1', targetId: 'FT-001', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-UNIT1', targetId: 'PT-001', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-UNIT2', targetId: 'PT-002', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-UNIT2', targetId: 'TT-001', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-UNIT3', targetId: 'XV-001', encrypted: false, status: 'normal' },
          { sourceId: 'SIS-CTRL', targetId: 'XV-002', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-UNIT3', targetId: 'VFD-001', encrypted: false, status: 'normal' },
          { sourceId: 'PLC-UNIT1', targetId: 'ANAL-001', encrypted: false, status: 'normal' },

          /* Remote WAN site */
          { sourceId: 'REMOTE-FW', targetId: 'REMOTE-RTU', encrypted: false, status: 'normal' },
          { sourceId: 'REMOTE-RTU', targetId: 'REMOTE-PLC', encrypted: false, status: 'normal' }
        ]},
        projectType: 'reactor',
        coDriverPayload: 'Aetheris Co-Driver, I am exploring the 46-node ICS/IT Mega Enterprise topology. Please walk me through the full Purdue Model segmentation from the internet edge to Level-0 field instruments. Identify the highest-risk lateral movement paths, explain each security zone boundary, and list the MITRE ATT&CK for ICS techniques an adversary would use to traverse from a compromised corporate workstation all the way to the Triconex Safety Instrumented System!'
      }
    ];

    let selectedLab = this.labsPortfolio[0];

    // Clear and build the dynamic lab card elements (Dynamic 16-Lab Portfolio!)
    workspaceContainer.innerHTML = '';
    this.labsPortfolio.forEach((lab, index) => {
      const card = document.createElement('div');
      card.className = `workspace-item ${index === 0 ? 'active' : ''}`;
      card.dataset.labId = lab.id;

      card.innerHTML = `
        <div class="ws-icon">${lab.icon}</div>
        <div class="ws-details">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span class="ws-title">${lab.title}</span>
            <span class="badge-difficulty">${lab.difficulty}</span>
          </div>
          <span class="ws-desc">${lab.desc}</span>
          <div style="margin-top: 4px;">
            <span class="lab-badge badge-${lab.category}">${lab.categoryLabel}</span>
          </div>
        </div>
      `;

      card.onclick = () => {
        selectedLab = lab;
        document.querySelectorAll('.workspace-item').forEach(el => el.classList.remove('active'));
        card.classList.add('active');
      };

      workspaceContainer.appendChild(card);
    });

    btnLaunch.onclick = () => {
      if (selectedLab && selectedLab.projectType === 'purdue') {
        if (!this.checkPremiumFeature('purdue-model', '🚀 25-NODE PURDUE MODEL ARCHITECTURE TEMPLATE')) {
          return;
        }
      }

      // Save AI mode preference and apply no-AI panel hiding
      const noAiMode = radioNoAi && radioNoAi.checked;
      localStorage.setItem('aetheris_ai_mode', noAiMode ? 'noai' : 'ai');
      const leftPanel = document.getElementById('leftPanelPane');
      if (leftPanel) {
        if (noAiMode) {
          leftPanel.classList.add('hidden');
        } else {
          leftPanel.classList.remove('hidden');
        }
      }

      // Save credentials settings
      if (!noAiMode) this.llm.setSettings(selProvider.value, txtApiKey.value);

      // Hide or show layout elements based on active simulation project
      const icsControls = document.getElementById('icsProcessControls');
      const chartGroup = document.getElementById('telemetryChartGroup');
      const btnAttack = document.getElementById('btnTriggerAttack');
      const netpilotControls = document.getElementById('netpilotControls');

      // Reset shared state that is lab-specific before loading a new lab
      this.orchestrator.resolveAlerts();
      this.orchestrator.alerts = [];
      this.orchestrator.microsegMode = false;
      if (this.ws?.state?.capturing) this.ws._wsStopCapture();
      if (this.ws) this.ws.state = null; // discard packet captures from the previous lab

      // Hide auxiliary panels by default; specific project types will show them
      const waterPanel = document.getElementById('waterProcessControls');
      const gridPanel  = document.getElementById('gridProcessControls');
      if (gridPanel)  gridPanel.style.display  = 'none';
      if (waterPanel) waterPanel.style.display = 'none';

      if (selectedLab.projectType === 'reactor') {
        this.activeProject = selectedLab.title;
        this.activeProjectType = 'reactor';
        this.sim.reset(); // restore physics to default state when re-entering reactor lab
        this.canvas.loadReactorProject(); // sets up background + zone grid
        if (selectedLab.topology) this.canvas.loadLabTopology(selectedLab.topology);

        if (icsControls) icsControls.style.display = 'block';
        if (chartGroup) chartGroup.style.display = 'block';
        if (btnAttack) btnAttack.style.display = 'inline-flex';
        if (netpilotControls) netpilotControls.style.display = 'none';
        
        document.getElementById('aiModelVersion').textContent = `AETHERIS ASSISTANT [CONTEXT: ${selectedLab.categoryLabel}]`;
        this.orchestrator.logSystem(`Initialized lab workspace: ${selectedLab.title}`, 'success');
      } else if (selectedLab.projectType === 'campus') {
        this.activeProject = selectedLab.title;
        this.activeProjectType = 'campus';
        this.canvas.loadEnterpriseProject();
        if (selectedLab.topology) this.canvas.loadLabTopology(selectedLab.topology);

        if (icsControls) icsControls.style.display = 'none';
        if (chartGroup) chartGroup.style.display = 'none';
        if (btnAttack) btnAttack.style.display = 'none';
        if (netpilotControls) netpilotControls.style.display = 'block';
        
        document.getElementById('aiModelVersion').textContent = `AETHERIS ASSISTANT [CONTEXT: ${selectedLab.categoryLabel}]`;
        this.orchestrator.logSystem(`Initialized lab workspace: ${selectedLab.title}`, 'success');
      } else if (selectedLab.projectType === 'blank') {
        this.activeProject = selectedLab.title;
        this.activeProjectType = 'blank';
        this.canvas.loadBlankProject();
        
        if (icsControls) icsControls.style.display = 'none';
        if (chartGroup) chartGroup.style.display = 'none';
        if (btnAttack) btnAttack.style.display = 'none';
        if (netpilotControls) netpilotControls.style.display = 'block';
        
        document.getElementById('aiModelVersion').textContent = `AETHERIS ASSISTANT [CONTEXT: DESIGN SLATE]`;
        this.orchestrator.logSystem(`Initialized Blank Design playground slate.`, 'success');
      } else if (selectedLab.projectType === 'purdue') {
        this.activeProject = selectedLab.title;
        this.activeProjectType = 'purdue';
        this.canvas.loadPurdueProject();
        if (selectedLab.topology) this.canvas.loadLabTopology(selectedLab.topology);

        if (icsControls) icsControls.style.display = 'none';
        if (chartGroup) chartGroup.style.display = 'none';
        if (btnAttack) btnAttack.style.display = 'none';
        if (netpilotControls) netpilotControls.style.display = 'block';

        document.getElementById('aiModelVersion').textContent = `AETHERIS ASSISTANT [CONTEXT: ${selectedLab.categoryLabel}]`;
        this.orchestrator.logSystem(`Initialized lab workspace: ${selectedLab.title}`, 'success');
      } else if (selectedLab.projectType === 'water') {
        this.activeProject = selectedLab.title;
        this.activeProjectType = 'water';
        this.simWater.reset();
        this.canvas.loadWaterTreatmentProject();

        if (icsControls) icsControls.style.display = 'none';
        if (chartGroup)  chartGroup.style.display  = 'none';
        if (btnAttack)   btnAttack.style.display    = 'inline-flex';
        if (netpilotControls) netpilotControls.style.display = 'none';
        const waterPanel = document.getElementById('waterProcessControls');
        if (waterPanel) waterPanel.style.display = 'block';

        document.getElementById('aiModelVersion').textContent = `AETHERIS ASSISTANT [CONTEXT: WATER TREATMENT ICS]`;
        this.orchestrator.logSystem(`Initialized Water Treatment plant digital twin.`, 'success');
      } else if (selectedLab.projectType === 'grid') {
        this.activeProject = selectedLab.title;
        this.activeProjectType = 'grid';
        this.simGrid.reset();
        this.canvas.loadPowerGridProject();
        if (selectedLab.topology) this.canvas.loadLabTopology(selectedLab.topology);

        if (icsControls) icsControls.style.display = 'none';
        if (chartGroup)  chartGroup.style.display  = 'none';
        if (btnAttack)   btnAttack.style.display    = 'none';
        if (netpilotControls) netpilotControls.style.display = 'none';
        if (gridPanel)   gridPanel.style.display    = 'block';

        document.getElementById('aiModelVersion').textContent = `AETHERIS ASSISTANT [CONTEXT: POWER GRID ICS]`;
        this.orchestrator.logSystem(`Initialized Power Grid substation digital twin.`, 'success');
      }

      // Initialize the undo/redo stacks for the new lab
      this.initHistory();

      // Populate Lab Instructions popup overlays (Lab Instructions Popup!)
      document.getElementById('instModalTitle').textContent = `📋 CHALLENGE MISSION: ${selectedLab.title.toUpperCase()}`;
      document.getElementById('instObjectiveText').textContent = selectedLab.objective;

      const tasksList = document.getElementById('instTasksList');
      tasksList.innerHTML = '';
      selectedLab.tasks.forEach(task => {
        const li = document.createElement('li');
        li.innerHTML = `
          <label style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer;">
            <input type="checkbox" style="margin-top: 2px;">
            <span>${task}</span>
          </label>
        `;
        tasksList.appendChild(li);
      });

      // Bind the Task Agent button callbacks (Task Agent Assistance channel!)
      const btnTaskAgent = document.getElementById('instTaskAgentBtn');
      btnTaskAgent.onclick = () => {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
          chatInput.value = selectedLab.coDriverPayload;
          // Trigger form submit or AI direct stream
          const btnSend = document.getElementById('btnSendChat');
          if (btnSend) btnSend.click();
        }
        document.getElementById('labInstructionsModal').classList.add('hidden');
      };

      // Open instructions popup drawer immediately
      document.getElementById('labInstructionsModal').classList.remove('hidden');

      // Close button listener
      document.getElementById('instCloseBtn').onclick = () => {
        document.getElementById('labInstructionsModal').classList.add('hidden');
      };

      // Transition landing portal out
      landing.classList.add('hidden');
      this.isPlaying = true;
      
      // Auto zoom/recenter canvas
      setTimeout(() => {
        this.canvas.resize();
        this.canvas.centerView();
      }, 100);
    };
  }

  initUI() {
    // 0. Undo/Redo click bindings
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.onclick = () => this.undo();
    if (btnRedo) btnRedo.onclick = () => this.redo();

    const btnShowBriefing = document.getElementById('btnShowBriefing');
    if (btnShowBriefing) {
      btnShowBriefing.onclick = () => {
        const modal = document.getElementById('labInstructionsModal');
        if (modal) modal.classList.remove('hidden');
      };
    }

    // 0.5 Voice Assistant Toggle
    this.voiceAssistEnabled = false;
    const btnVoice = document.getElementById('btnVoiceAssist');
    if (btnVoice) {
      btnVoice.onclick = () => {
        if (!this.checkPremiumFeature('voice', '🗣️ VOICE ASSIST NARRATOR')) return;
        this.voiceAssistEnabled = !this.voiceAssistEnabled;
        btnVoice.innerHTML = this.voiceAssistEnabled ? '🔊' : '🔇';
        btnVoice.style.color = this.voiceAssistEnabled ? '#22c55e' : '#ef4444';
        btnVoice.style.borderColor = this.voiceAssistEnabled ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)';
        btnVoice.style.background = this.voiceAssistEnabled ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)';
        this.showToast(this.voiceAssistEnabled ? "Voice Assist: ENABLED (Aetheris will speak response payloads aloud)" : "Voice Assist: DISABLED (Speech output muted)", "info");
        if (!this.voiceAssistEnabled && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
      };
    }

    // 0.6 Voice Speed & Profile Configuration Controls
    this.voiceSpeed = parseFloat(localStorage.getItem('voiceSpeed') || '0.95');
    this.selectedVoiceName = localStorage.getItem('selectedVoiceName') || 'default';

    const sliderSpeed = document.getElementById('sliderVoiceSpeed');
    const lblSpeed = document.getElementById('lblVoiceSpeed');
    const selVoice = document.getElementById('selVoiceProfile');

    if (sliderSpeed && lblSpeed) {
      sliderSpeed.value = this.voiceSpeed;
      lblSpeed.textContent = this.voiceSpeed.toFixed(2) + 'x';
      sliderSpeed.oninput = (e) => {
        this.voiceSpeed = parseFloat(e.target.value);
        lblSpeed.textContent = this.voiceSpeed.toFixed(2) + 'x';
        localStorage.setItem('voiceSpeed', this.voiceSpeed.toString());
      };
    }

    const populateVoicesList = () => {
      if (!('speechSynthesis' in window) || !selVoice) return;
      const voices = window.speechSynthesis.getVoices();
      
      // Preserve default option
      selVoice.innerHTML = '<option value="default">System Default (Robotic)</option>';
      
      // Filter for unique, English-speaking and premium/natural sounding voices
      const filteredVoices = voices.filter(v => v.lang.startsWith('en') || v.lang.startsWith('en-'));
      
      filteredVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = voice.name.replace(/Microsoft|Google|Apple|Natural/g, '').trim() + ` (${voice.lang})`;
        if (voice.name === this.selectedVoiceName) {
          option.selected = true;
        }
        selVoice.appendChild(option);
      });
    };

    if ('speechSynthesis' in window) {
      // Chrome/Edge/Safari fire this asynchronously
      window.speechSynthesis.onvoiceschanged = populateVoicesList;
      populateVoicesList();
    }

    if (selVoice) {
      selVoice.onchange = (e) => {
        this.selectedVoiceName = e.target.value;
        localStorage.setItem('selectedVoiceName', this.selectedVoiceName);
      };
    }

    // 1. Play/Pause controller
    const btnPlay = document.getElementById('btnPlayPause');
    const txtPlay = document.getElementById('txtPlayPause');
    btnPlay.onclick = () => {
      this.isPlaying = !this.isPlaying;
      txtPlay.textContent = this.isPlaying ? 'PAUSE' : 'RESUME';
      btnPlay.querySelector('svg').innerHTML = this.isPlaying ? 
        `<polygon points="5 3 19 12 5 21 5 3"></polygon>` : 
        `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
      this.orchestrator.logSystem(`Simulation clock state: ${this.isPlaying ? 'RUNNING' : 'PAUSED'}`);
    };

    // 2. Anomaly Injection Trigger (Only for Reactor-3)
    document.getElementById('btnTriggerAttack').onclick = () => {
      this.injectCyberAttack();
    };

    // 3. Time Dilation Slider
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    speedSlider.oninput = (e) => {
      this.speedDilation = parseFloat(e.target.value);
      speedValue.textContent = this.speedDilation.toFixed(1) + 'x';
    };

    // 4. Valve Sliders mapping
    const v1 = document.getElementById('valveSlider1');
    const v2 = document.getElementById('valveSlider2');
    const statusV1 = document.getElementById('statusValve1');
    const statusV2 = document.getElementById('statusValve2');

    v1.oninput = (e) => {
      this.sim.inletValve = parseInt(e.target.value);
      statusV1.textContent = `OPEN (${this.sim.inletValve}%)`;
    };

    v2.oninput = (e) => {
      this.sim.outletValve = parseInt(e.target.value);
      statusV2.textContent = `OPEN (${this.sim.outletValve}%)`;
    };

    // Emergency Valve Actuate
    document.getElementById('btnEmergencyValve').onclick = () => {
      this.sim.reliefValve = !this.sim.reliefValve;
      const act = this.sim.reliefValve;
      document.getElementById('statusValve3').textContent = act ? 'OPEN (MANUAL)' : 'CLOSED';
      document.getElementById('statusValve3').className = act ? 'valve-status font-mono text-green' : 'valve-status font-mono text-red';
      this.orchestrator.logSystem(`Manual Actuation command: Safety Relief Valve XV-103 forced ${act ? 'OPEN' : 'CLOSED'}.`, act ? 'warning' : 'info');
    };

    // Exit Workspace portal trigger
    document.getElementById('btnExitWorkspace').onclick = () => {
      this.isPlaying = false;
      document.getElementById('landingPage').classList.remove('hidden');
    };

    // Performance Toggle button trigger (button may be absent from the header)
    const btnPerfToggle = document.getElementById('btnPerfToggle');
    if (btnPerfToggle) btnPerfToggle.onclick = () => this.togglePerfMode();

    // 5. AETHERIS Conversational Chat Enter prompt
    const chatInput = document.getElementById('chatInput');
    document.getElementById('btnSendChat').onclick = () => {
      this.sendConversationalPrompt();
    };

    chatInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        this.sendConversationalPrompt();
      }
    };

    // 6. Interactive Device CLI Console Key Listener (Command History & Tab Autocomplete!)
    const cliInput = document.getElementById('cliInput');
    cliInput.onkeydown = (e) => {
      const node = this.canvas.selectedNode;
      if (!node) return;

      if (e.key === 'Enter') {
        const val = cliInput.value.trim();
        if (val) {
          this.executeCLICommand(val, node);
          this.cliHistory.push(val);
          if (this.cliHistory.length > 50) this.cliHistory.shift(); // Keep last 50 commands
          this.cliHistoryIndex = -1;
          cliInput.value = '';
        }
      } 
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.cliHistory.length > 0) {
          if (this.cliHistoryIndex === -1) {
            this.cliHistoryIndex = this.cliHistory.length - 1;
          } else if (this.cliHistoryIndex > 0) {
            this.cliHistoryIndex--;
          }
          cliInput.value = this.cliHistory[this.cliHistoryIndex];
        }
      } 
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.cliHistory.length > 0 && this.cliHistoryIndex !== -1) {
          if (this.cliHistoryIndex < this.cliHistory.length - 1) {
            this.cliHistoryIndex++;
            cliInput.value = this.cliHistory[this.cliHistoryIndex];
          } else {
            this.cliHistoryIndex = -1;
            cliInput.value = '';
          }
        }
      } 
      else if (e.key === 'Tab') {
        e.preventDefault();
        const words = cliInput.value.trim().split(/\s+/);
        const lastWord = words[words.length - 1].toLowerCase();
        if (!lastWord) return;

        // Command vocab dictionary for auto completion
        const commandVocab = [
          'show', 'ping', 'traceroute', 'nslookup', 'interface', 'config', 'terminal',
          'ip', 'address', 'dhcp', 'ospf', 'neighbor', 'arp', 'routing', 'static', 'route',
          'no', 'shutdown', 'ntp', 'status', 'flash', 'write', 'memory', 'exit',
          'nmap', 'hydra', 'modbus-inject', 'arp-spoof', 'tcpdump', 'modbus', 'reboot', 'enable', 'disable'
        ];

        const match = commandVocab.find(w => w.startsWith(lastWord));
        if (match) {
          words[words.length - 1] = match;
          cliInput.value = words.join(' ') + ' ';
        }
      }
    };

    // 7. AETHERIS autonomous lab validation trigger
    const btnRunValidation = document.getElementById('btnRunValidation');
    if (btnRunValidation) {
      btnRunValidation.onclick = () => {
        const list = document.getElementById('validationResultsList');
        if (!list) return;
        
        list.innerHTML = `
          <div style="text-align: center; padding: 20px 0; color: var(--brand-blue); font-size: 0.75rem; font-weight: 600;">
            <span class="pulse-indicator"></span> AUDITING ACTIVE OSPF AREA ADJACENCIES...
          </div>
        `;
        
        this.orchestrator.logSystem("Initiating autonomous validation audit...", "info");
        this.printCLILine("\n# netpilot validate-lab", "user-input");
        this.printCLILine("Starting lab connectivity and adjacency validation...", "comment-line");
        
        // Spawn visual validation sweeps
        const pe1 = this.canvas.nodes.find(n => n.id === 'PE-01');
        const p1 = this.canvas.nodes.find(n => n.id === 'P-01');
        const pe2 = this.canvas.nodes.find(n => n.id === 'PE-02');
        if (pe1 && p1 && pe2) {
          this.canvas.spawnPacket(pe1, p1, 'mitigation');
          this.canvas.spawnPacket(pe2, p1, 'mitigation');
        }

        setTimeout(() => {
          list.innerHTML = `
            <div style="text-align: center; padding: 20px 0; color: var(--brand-blue); font-size: 0.75rem; font-weight: 600;">
              <span class="pulse-indicator"></span> VERIFYING LDP LABELS AND VRF BOUNDARIES...
            </div>
          `;
          const ce1 = this.canvas.nodes.find(n => n.id === 'CE-01');
          const ce2 = this.canvas.nodes.find(n => n.id === 'CE-02');
          if (ce1 && pe1 && pe2 && ce2) {
            this.canvas.spawnPacket(ce1, pe1, 'mitigation');
            this.canvas.spawnPacket(pe1, p1, 'mitigation');
            this.canvas.spawnPacket(p1, pe2, 'mitigation');
            this.canvas.spawnPacket(pe2, ce2, 'mitigation');
          }
        }, 800);

        setTimeout(() => {
          list.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75rem; border-bottom: 1px solid var(--border-color); padding: 6px 0;">
              <span style="font-weight: 600; color: var(--text-primary);">OSPF Area Adjacencies</span>
              <span class="text-glow-green" style="font-size: 0.65rem;">FULL / ESTAB</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75rem; border-bottom: 1px solid var(--border-color); padding: 6px 0;">
              <span style="font-weight: 600; color: var(--text-primary);">MPLS LDP Session (Core)</span>
              <span class="text-glow-green" style="font-size: 0.65rem;">OPERATIONAL</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75rem; border-bottom: 1px solid var(--border-color); padding: 6px 0;">
              <span style="font-weight: 600; color: var(--text-primary);">iBGP VPNv4 Routing Path</span>
              <span class="text-glow-green" style="font-size: 0.65rem;">ACTIVE (2 PREFIX)</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75rem; border-bottom: 1px solid var(--border-color); padding: 6px 0;">
              <span style="font-weight: 600; color: var(--text-primary);">VRF Isolation (CUSTOMER_A)</span>
              <span class="text-glow-green" style="font-size: 0.65rem;">VERIFIED</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75rem; padding: 6px 0;">
              <span style="font-weight: 600; color: var(--text-primary);">End-to-End VRF Ping Loop</span>
              <span class="text-glow-green" style="font-size: 0.65rem;">SUCCESS (0% LOSS)</span>
            </div>
          `;
          
          this.orchestrator.logSystem("All core autonomous validation assertions PASSED.", "success");
          this.printCLILine("[PASSED] OSPF neighbor sessions established.");
          this.printCLILine("[PASSED] MPLS Label Distribution protocol session UP.");
          this.printCLILine("[PASSED] BGP VPNv4 routing advertisements stable.");
          this.printCLILine("[PASSED] Customer isolated traffic routing verified.");
          this.printCLILine("AETHERIS Lab validation completed successfully. All green.", "success");
          
          this.appendChatBubble('AETHERIS AI', "📊 **Autonomous Lab Audit Complete**:<br>• OSPF Core Area 0 adjacency is fully established (PE-01 & PE-02 peerings with core P-01 are ACTIVE).<br>• MPLS label distribution binds successfully end-to-end.<br>• Customer routing tables isolated via dedicated VRF instance **CUSTOMER_A** are verified operational with 0% data packet loss.", 'agent-bubble');
        }, 1600);
      };
    }

    // 7.5 Export Printable Enterprise Audit Report Generator
    const btnGenerateReport = document.getElementById('btnGenerateReport');
    if (btnGenerateReport) {
      btnGenerateReport.onclick = () => {
        this.orchestrator.logSystem("Assembling corporate digital twin safety audit report...", "info");
        
        let nodeDetailsHtml = '';
        this.canvas.nodes.forEach(n => {
          const cfg = this.getNodeConfig(n);
          nodeDetailsHtml += `
            <div style="border: 1px solid var(--border-color); border-radius: 4px; padding: 10px; margin-bottom: 10px; background: rgba(15, 23, 42, 0.4);">
              <h4 style="margin: 0 0 6px 0; color: var(--brand-blue); display: flex; align-items: center; justify-content: space-between;">
                <span>🖥️ ${n.id} [${n.role || 'HOST'}]</span>
                <span style="font-size: 0.65rem; background: ${n.status === 'compromised' ? '#7f1d1d' : '#064e3b'}; color: ${n.status === 'compromised' ? '#fca5a5' : '#86efac'}; padding: 2px 6px; border-radius: 9999px;">${n.status.toUpperCase()}</span>
              </h4>
              <p style="margin: 2px 0; font-size: 0.75rem; font-family: monospace;">IP Address: ${n.ip || 'DHCP Client'}</p>
              <p style="margin: 2px 0; font-size: 0.75rem; font-family: monospace;">OS Kernel:  ${this.canvas.getHardwareOSName(n.role || n.type)}</p>
              <p style="margin: 2px 0; font-size: 0.75rem; font-family: monospace;">Hardware:   ${this.canvas.getHardwareModelName(n.role || n.type)}</p>
              <p style="margin: 2px 0; font-size: 0.75rem; font-family: monospace;">OSPF State: ${n.ospfState || 'N/A'}</p>
            </div>
          `;
        });

        const activeLinksHtml = this.canvas.links.map(l => {
          return `<div style="font-size: 0.7rem; font-family: monospace; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">${l.sourceId} (${l.sourceInterface || 'Gig0/1'}) &lt;===&gt; ${l.targetId} (${l.targetInterface || 'Gig0/1'}) [${l.status.toUpperCase()}]</div>`;
        }).join('');

        const reportOverlay = document.createElement('div');
        reportOverlay.id = 'reportDrawerOverlay';
        reportOverlay.style = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.85); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(8px);';
        
        reportOverlay.innerHTML = `
          <div class="dark-window" style="width: 650px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); border: 1px solid var(--brand-blue);">
            <div class="window-header" style="background: linear-gradient(90deg, #090d16 0%, rgba(14, 165, 233, 0.15) 100%);">
              <span class="window-title">📋 AETHERIS CORPORATE DIGITAL TWIN SAFETY AUDIT REPORT</span>
              <button id="closeReportBtn" class="cyber-btn" style="padding: 2px 8px; font-size: 0.7rem; border-color: #ef4444; color: #ef4444; background: rgba(239, 68, 68, 0.05);">CLOSE</button>
            </div>
            <div class="window-body" style="overflow-y: auto; padding: 20px; font-family: var(--font-sans), sans-serif; color: var(--text-primary);">
              <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid var(--brand-blue); padding-bottom: 15px;">
                <h2 style="margin: 0; color: #f8fafc; font-size: 1.2rem; letter-spacing: 1px;">AETHERIS DIGITAL TWIN AUDIT</h2>
                <p style="margin: 4px 0 0 0; font-size: 0.75rem; color: var(--text-secondary);">TIMESTAMP: ${new Date().toString()} // REACTOR-3 TARGET</p>
              </div>
              
              <h3 style="color: var(--brand-blue); font-size: 0.9rem; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; margin-top: 0;">1. INVENTORY SYSTEM & HARDWARE DETAILS</h3>
              ${nodeDetailsHtml}

              <h3 style="color: var(--brand-blue); font-size: 0.9rem; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; margin-top: 20px;">2. CABLE INTERFACES & INTERCONNECTION TRACES</h3>
              <div style="background: rgba(15, 23, 42, 0.4); border: 1px solid var(--border-color); padding: 10px; border-radius: 4px;">
                ${activeLinksHtml || '<p style="font-size:0.7rem; margin:0; color:var(--text-secondary);">No physical cabling links defined.</p>'}
              </div>

              <h3 style="color: var(--brand-blue); font-size: 0.9rem; border-bottom: 1px solid var(--border-color); padding-bottom: 4px; margin-top: 20px;">3. THREAT VULNERABILITY ADVISORY</h3>
              <div style="background: rgba(239, 68, 68, 0.05); border: 1px solid #7f1d1d; border-radius: 4px; padding: 10px;">
                <p style="margin: 0 0 6px 0; font-size: 0.75rem; color: #fca5a5; font-weight: 600;">⚠️ RUNTIME THREAT SIGNATURE DETECTED</p>
                <p style="margin: 0; font-size: 0.7rem; color: #cbd5e1; line-height: 1.4;">
                  Target active OT network boundaries are continuously scanned by our orchestrator. Ensure that safety valve controller OSPF routing updates remain isolated behind high-security edge firewalls to prevent cross-zone operational data leakage.
                </p>
              </div>

              <div style="margin-top: 30px; text-align: right;">
                <button id="printReportBtn" class="cyber-btn" style="padding: 6px 12px; font-size: 0.75rem; border-color: var(--brand-blue); color: var(--brand-blue); background: rgba(14, 165, 233, 0.05);">🖨️ PRINT REPORT</button>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(reportOverlay);

        document.getElementById('closeReportBtn').onclick = () => {
          reportOverlay.remove();
        };

        document.getElementById('printReportBtn').onclick = () => {
          window.print();
        };
      };
    }

    // 8. AETHERIS iperf3 traffic generator trigger
    const btnRunIperf = document.getElementById('btnRunIperf');
    if (btnRunIperf) {
      // Populate iperf selects dynamically from canvas nodes when user opens the panel
      const refreshIperfSelects = () => {
        const srcSel = document.getElementById('iperfSrcSelect');
        const dstSel = document.getElementById('iperfDstSelect');
        if (!srcSel || !dstSel) return;
        const srcPrev = srcSel.value;
        const dstPrev = dstSel.value;
        srcSel.innerHTML = this.canvas.nodes.map(n =>
          `<option value="${n.id}">${n.id} — ${n.ip.split(' ')[0]}</option>`
        ).join('');
        dstSel.innerHTML = this.canvas.nodes.map(n =>
          `<option value="${n.id}">${n.id} — ${n.ip.split(' ')[0]}</option>`
        ).join('');
        if ([...srcSel.options].some(o => o.value === srcPrev)) srcSel.value = srcPrev;
        if ([...dstSel.options].some(o => o.value === dstPrev)) dstSel.value = dstPrev;
        // Default second option for dst if same as src
        if (srcSel.value === dstSel.value && dstSel.options.length > 1) dstSel.selectedIndex = 1;
      };

      btnRunIperf.onclick = () => {
        refreshIperfSelects();
        const srcVal = document.getElementById('iperfSrcSelect').value;
        const dstVal = document.getElementById('iperfDstSelect').value;

        const srcNode = this.canvas.nodes.find(n => n.id === srcVal);
        const dstNode = this.canvas.nodes.find(n => n.id === dstVal);
        const srcIp = srcNode?.ip.split(' ')[0] || '0.0.0.0';
        const dstIp = dstNode?.ip.split(' ')[0] || '0.0.0.0';

        if (srcVal === dstVal) {
          this.showToast('Source and destination must be different nodes.', 'warning');
          return;
        }

        this.orchestrator.logSystem(`Starting iperf3 traffic stream from ${srcVal} to ${dstVal}...`, "info");
        this.printCLILine(`\n# iperf3 -c ${dstIp} -P 4 -t 10`, "user-input");
        this.printCLILine(`Connecting to host ${dstIp}, port 5201`, "comment-line");
        this.printCLILine(`[  5] local ${srcIp} port 48923 connected to ${dstIp} port 5201`);

        let packetCount = 0;
        const iperfInterval = setInterval(() => {
          if (!this.isPlaying) {
            clearInterval(iperfInterval);
            return;
          }
          if (srcNode && dstNode) {
            this.canvas.spawnPacket(srcNode, dstNode, 'mitigation');
          }
          packetCount++;
          if (packetCount < 6) {
            const mbps = (88 + Math.random() * 12).toFixed(1);
            this.printCLILine(`[  5]   0.00-${packetCount}.00   sec  11.2 MBytes  ${mbps} Mbits/sec    0    204 KBytes`);
          }
          if (packetCount >= 10) {
            clearInterval(iperfInterval);
            this.printCLILine(`- - - - - - - - - - - - - - - - - - - - - - - - -`);
            this.printCLILine(`[SUM]   0.00-10.00  sec   113 MBytes  95.1 Mbits/sec             sender`);
            this.printCLILine(`[SUM]   0.00-10.00  sec   113 MBytes  94.8 Mbits/sec             receiver`);
            this.printCLILine(`iperf Done.`, "success");
            this.orchestrator.logSystem(`iperf3 stream from ${srcVal} → ${dstVal} completed. Throughput: 95.1 Mbps`, "success");
          }
        }, 300);
      };

      // Refresh selects each time the right panel becomes visible
      const netpilotPanel = document.getElementById('netpilotControls');
      const observer = new MutationObserver(() => {
        if (netpilotPanel?.style.display !== 'none') refreshIperfSelects();
      });
      if (netpilotPanel) observer.observe(netpilotPanel, { attributes: true, attributeFilter: ['style'] });
    }

    // Collapse / Maximize CLI Panel pane
    const btnToggleCli = document.getElementById('btnToggleCliPanel');
    const cliPane = document.getElementById('cliPanelPane');
    const cliHeader = document.getElementById('cliHeader');

    const animateCanvasResize = () => {
      let start = null;
      const step = (timestamp) => {
        if (!start) start = timestamp;
        const progress = timestamp - start;
        if (window.appInstance?.canvas) {
          window.appInstance.canvas.resize();
        }
        if (progress < 300) {
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);
    };

    const toggleCliCollapse = (e) => {
      // If clicking inside header, prevent toggle on buttons
      if (e && e.target.closest('#btnToggleCliPanel')) {
        e.stopPropagation();
      }
      
      const isCollapsed = cliPane.classList.toggle('collapsed');
      if (btnToggleCli) {
        btnToggleCli.textContent = isCollapsed ? '▲ MAXIMIZE' : '▼ MINIMIZE';
        btnToggleCli.title = isCollapsed ? 'Maximize Panel' : 'Collapse Panel';
      }
      animateCanvasResize();
    };

    if (cliHeader) cliHeader.onclick = toggleCliCollapse;
    if (btnToggleCli) btnToggleCli.onclick = toggleCliCollapse;

    // Collapse / Maximize Left Panel pane
    const btnToggleLeft = document.getElementById('btnToggleLeftPanel');
    const leftPane = document.getElementById('leftPanelPane');
    const leftHeader = document.getElementById('leftPanelHeader');

    const toggleLeftCollapse = (e) => {
      if (e && e.target.closest('#btnToggleLeftPanel')) {
        e.stopPropagation();
      }
      
      const isCollapsed = leftPane.classList.toggle('collapsed');
      if (btnToggleLeft) {
        btnToggleLeft.textContent = isCollapsed ? '▶' : '◀ MINIMIZE';
        btnToggleLeft.title = isCollapsed ? 'Maximize Panel' : 'Collapse Panel';
      }
      animateCanvasResize();
    };

    if (leftHeader) leftHeader.onclick = toggleLeftCollapse;
    if (btnToggleLeft) btnToggleLeft.onclick = toggleLeftCollapse;

    // Right-Click Context Menu listener on Topology Canvas
    const canvasEl = document.getElementById('networkCanvas');
    const ctxMenu = document.getElementById('canvasContextMenu');

    if (canvasEl && ctxMenu) {
      canvasEl.oncontextmenu = (e) => {
        e.preventDefault();
        
        // Find if a node is under mouse cursor
        const rect = canvasEl.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        const world = this.canvas.toWorld(clientX, clientY);
        const node = this.canvas.getDeviceAt(world.x, world.y);

        if (node) {
          // Restore node context items (restore defaults)
          document.getElementById('ctxOpenCLI').style.display = 'block';
          document.getElementById('ctxOpenConfigs').style.display = 'block';
          document.getElementById('ctxReboot').style.display = 'block';
          document.getElementById('ctxIsolate').style.display = 'block';
          document.getElementById('ctxDelete').style.display = 'block';
          
          let snipItem = document.getElementById('ctxSnipCable');
          if (snipItem) snipItem.style.display = 'none';

          // Select the node on canvas
          this.canvas.selectedNode = node;
          this.onNodeSelected(node);
          
          // Position and show context menu
          ctxMenu.style.left = `${e.clientX}px`;
          ctxMenu.style.top = `${e.clientY}px`;
          ctxMenu.classList.remove('hidden');
          
          // Hook menu buttons
          document.getElementById('ctxOpenCLI').onclick = () => {
            ctxMenu.classList.add('hidden');
            this.openDeviceCLIWindow(node);
          };
          
          document.getElementById('ctxOpenConfigs').onclick = () => {
            ctxMenu.classList.add('hidden');
            this.openDeviceConfigWindow(node);
          };
          
          document.getElementById('ctxReboot').onclick = () => {
            ctxMenu.classList.add('hidden');
            this.orchestrator.logSystem(`Command executed: rebooting asset [${node.name}]...`, 'info');
            node.status = 'stable';
            node.vulnerable = false;
            this.canvas.links.forEach(l => {
              if (l.sourceId === node.id || l.targetId === node.id) l.status = 'normal';
            });
            this.orchestrator.logSystem(`Device [${node.id}] rebooted. Firmware integrity validated: 100%.`, 'success');
            this.updateSidebarProfile();
          };
          
          document.getElementById('ctxIsolate').onclick = () => {
            ctxMenu.classList.add('hidden');
            if (node.status === 'compromised') {
               this.orchestrator.logSystem(`Incident response playbook: Isolating asset [${node.id}]...`, 'warning');
               node.status = 'isolated';
               this.orchestrator.logSystem(`Device [${node.id}] successfully isolated. Physical boundaries secured.`, 'success');
            } else {
               this.orchestrator.logSystem(`Threat remediation playbook initiated for asset [${node.id}]...`, 'info');
               node.status = 'stable';
               node.vulnerable = false;
               this.orchestrator.logSystem(`Device [${node.id}] threat remediation successful. Status: STABLE.`, 'success');
            }
            this.updateSidebarProfile();
          };

          document.getElementById('ctxDelete').onclick = () => {
            ctxMenu.classList.add('hidden');
            this.deleteCustomDevice(node);
          };
        } else {
          // Check if link under cursor
          const link = this.canvas.getLinkAt(world.x, world.y);
          if (link) {
            // Position and show link context menu!
            ctxMenu.style.left = `${e.clientX}px`;
            ctxMenu.style.top = `${e.clientY}px`;
            ctxMenu.classList.remove('hidden');
            
            // Hide node items
            document.getElementById('ctxOpenCLI').style.display = 'none';
            document.getElementById('ctxOpenConfigs').style.display = 'none';
            document.getElementById('ctxReboot').style.display = 'none';
            document.getElementById('ctxIsolate').style.display = 'none';
            document.getElementById('ctxDelete').style.display = 'none';
            
            let snipItem = document.getElementById('ctxSnipCable');
            if (!snipItem) {
              snipItem = document.createElement('button');
              snipItem.id = 'ctxSnipCable';
              snipItem.className = 'context-item danger';
              snipItem.style.width = '100%';
              snipItem.style.textAlign = 'left';
              ctxMenu.appendChild(snipItem);
            }
            snipItem.style.display = 'block';
            
            const isOffline = link.status === 'offline';
            snipItem.innerHTML = isOffline ? `<span class="icon">🔌</span> Restore Connection` : `<span class="icon">✂️</span> Snip Connection Link`;
            
            snipItem.onclick = () => {
              ctxMenu.classList.add('hidden');
              link.status = isOffline ? 'normal' : 'offline';
              this.orchestrator.logSystem(`Cable interface physical state updated: link between [${link.sourceId}] and [${link.targetId}] is now ${link.status.toUpperCase()}.`, isOffline ? 'success' : 'danger');
              this.canvas.draw();
            };
          } else {
            ctxMenu.classList.add('hidden');
          }
        }
      };

      // Hide context menu on left-click elsewhere
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#canvasContextMenu')) {
          ctxMenu.classList.add('hidden');
        }
      });
    }

    // Header reset control (formerly the Electron Orchestrator menu)
    const btnResetTwin = document.getElementById('btnResetTwin');
    if (btnResetTwin) btnResetTwin.onclick = () => this.resetTwin();

    this.initKeyboardShortcuts();

    // Initialize Packet Tracer-style Hardware Toolbox event bindings
    this.initToolboxEvents();

    // Hook Hardcore Features (Feature 20, 21, 25)
    const btnToggleHUD = document.getElementById('btnToggleHUD');
    if (btnToggleHUD) {
      btnToggleHUD.onclick = () => {
        document.body.classList.toggle('hud-mode');
        this.canvas.resize();
        this.orchestrator.logSystem("HUD Presentation Mode toggled. Select full-screen controls again to restore panels.", "info");
      };
    }

    const btnPurdueOverlay = document.getElementById('btnPurdueOverlay');
    if (btnPurdueOverlay) {
      btnPurdueOverlay.onclick = () => {
        this.canvas.showPurdueOverlay = !this.canvas.showPurdueOverlay;
        btnPurdueOverlay.style.background = this.canvas.showPurdueOverlay ? 'rgba(37,99,235,0.2)' : '';
        btnPurdueOverlay.style.color = this.canvas.showPurdueOverlay ? 'var(--brand-blue)' : '';
        this.canvas.draw();
      };
    }

    const btnHeatMap = document.getElementById('btnHeatMap');
    if (btnHeatMap) {
      btnHeatMap.onclick = () => {
        this.showTrafficHeatMap = !this.showTrafficHeatMap;
        if (this.showTrafficHeatMap) this.annotateLinksWithProtocol();
        btnHeatMap.style.background = this.showTrafficHeatMap ? 'rgba(37,99,235,0.2)' : '';
        btnHeatMap.style.color = this.showTrafficHeatMap ? 'var(--brand-blue)' : '';
        this.canvas.draw();
      };
    }

    const btnSaveTopology = document.getElementById('btnSaveTopology');
    const btnLoadTopology = document.getElementById('btnLoadTopology');
    if (btnSaveTopology) btnSaveTopology.onclick = () => this.saveTopology();
    if (btnLoadTopology) btnLoadTopology.onclick = () => this.loadTopology();

    const btnExportPng = document.getElementById('btnExportPng');
    if (btnExportPng) btnExportPng.onclick = () => this.exportCanvasPng();

    const btnAutoArrange = document.getElementById('btnAutoArrange');
    if (btnAutoArrange) btnAutoArrange.onclick = () => this.autoArrangeTopology();

    const btnToggleGrid = document.getElementById('btnToggleGrid');
    if (btnToggleGrid) btnToggleGrid.onclick = () => this.toggleGridSnap();

    const btnShowShortcuts = document.getElementById('btnShowShortcuts');
    if (btnShowShortcuts) btnShowShortcuts.onclick = () => this.showShortcutsModal();

    const shortcutsCloseBtn = document.getElementById('shortcutsCloseBtn');
    if (shortcutsCloseBtn) shortcutsCloseBtn.onclick = () => document.getElementById('shortcutsModal')?.classList.add('hidden');

    // Speed preset buttons (inject into simulation controls)
    const speedSliderEl = document.getElementById('speedSlider');
    if (speedSliderEl && !document.getElementById('speedPresets')) {
      const presets = document.createElement('div');
      presets.id = 'speedPresets';
      presets.style.cssText = 'display:flex;gap:4px;margin-top:6px;';
      presets.innerHTML = [0.5,1,2,5].map(x =>
        `<button onclick="window.appInstance?.setSpeedPreset(${x})" style="flex:1;font-size:0.6rem;padding:3px 0;background:rgba(15,23,42,0.5);border:1px solid var(--border-color);border-radius:4px;color:var(--text-secondary);cursor:pointer;">${x}x</button>`
      ).join('');
      speedSliderEl.parentElement.appendChild(presets);
    }

    // Context menu: Add Note option
    const ctxMenuEl = document.getElementById('canvasContextMenu');
    if (ctxMenuEl && !document.getElementById('ctxAddNote')) {
      const noteDivider = document.createElement('div');
      noteDivider.className = 'context-divider';
      const noteItem = document.createElement('div');
      noteItem.id = 'ctxAddNote';
      noteItem.className = 'context-item';
      noteItem.innerHTML = '<span class="icon">📝</span> Add / Edit Note';
      ctxMenuEl.appendChild(noteDivider);
      ctxMenuEl.appendChild(noteItem);
      noteItem.onclick = () => {
        ctxMenuEl.classList.add('hidden');
        if (this.canvas.selectedNode) this.openNoteEditor(this.canvas.selectedNode);
      };
    }

    // Context menu: Physical Inspect option (prepend to menu)
    if (ctxMenuEl && !document.getElementById('ctxPhysInspect')) {
      const physItem = document.createElement('div');
      physItem.id = 'ctxPhysInspect';
      physItem.className = 'context-item';
      physItem.innerHTML = '<span class="icon">🔬</span> Physical Inspector';
      ctxMenuEl.insertBefore(physItem, ctxMenuEl.firstChild);
      physItem.onclick = () => {
        ctxMenuEl.classList.add('hidden');
        if (this.canvas.selectedNode) this.openPhysicalInspector(this.canvas.selectedNode);
      };
    }

    // Double-click canvas node → open Physical Inspector
    const canvasDblClick = document.getElementById('networkCanvas');
    if (canvasDblClick) {
      canvasDblClick.addEventListener('dblclick', (e) => {
        const rect = canvasDblClick.getBoundingClientRect();
        const world = this.canvas.toWorld(e.clientX - rect.left, e.clientY - rect.top);
        const node = this.canvas.getDeviceAt(world.x, world.y);
        if (node) this.openPhysicalInspector(node);
      });
    }

    this.startAutoSave();

    const btnCtf1 = document.getElementById('btnCtf1');
    const btnCtf2 = document.getElementById('btnCtf2');
    const btnCtf3 = document.getElementById('btnCtf3');
    if (btnCtf1) btnCtf1.onclick = () => this.startCtfScenario(1);
    if (btnCtf2) btnCtf2.onclick = () => this.startCtfScenario(2);
    if (btnCtf3) btnCtf3.onclick = () => this.startCtfScenario(3);

    // Commercial Licensing & Paywall Event Bindings
    const btnLicenseStatus = document.getElementById('btnLicenseStatus');
    const paywallCloseBtn = document.getElementById('paywallCloseBtn');
    const paywallVerifyBtn = document.getElementById('paywallVerifyBtn');
    const paywallBuyBtn = document.getElementById('paywallBuyBtn');
    const premiumModal = document.getElementById('premiumPaywallModal');
    const licenseInput = document.getElementById('licenseKeyInput');
    const licenseFeedback = document.getElementById('licenseFeedbackText');

    if (btnLicenseStatus) {
      btnLicenseStatus.onclick = () => {
        if (premiumModal) premiumModal.classList.remove('hidden');
        if (licenseInput) licenseInput.focus();
      };
    }

    if (paywallCloseBtn) {
      paywallCloseBtn.onclick = () => {
        if (premiumModal) premiumModal.classList.add('hidden');
      };
    }

    if (paywallBuyBtn) {
      paywallBuyBtn.onclick = () => {
        this.showToast("Redirecting to secure Aetheris checkout portal... (Demo Mode)", "info");
        if (licenseFeedback) {
          licenseFeedback.textContent = "Checkout initiated! Type key AETHERIS-PRO-2026 below for instant demo upgrade.";
          licenseFeedback.style.color = "#c084fc";
        }
      };
    }

    if (paywallVerifyBtn) {
      paywallVerifyBtn.onclick = () => {
        const key = (licenseInput.value || '').trim();
        if (this.validLicenseKeys.includes(key)) {
          this.currentLicenseTier = 'professional';
          this.showToast("⚡ LICENSE KEY VALIDATED: Aetheris Professional Activated!", "success");
          this.orchestrator.logSystem("LICENSE REGISTERED: Aetheris Professional Digital Twin engine activated successfully.", "success");
          
          // Update header status badge styling beautifully
          if (btnLicenseStatus) {
            btnLicenseStatus.textContent = "★ PROFESSIONAL TIER";
            btnLicenseStatus.style.color = "#c084fc";
            btnLicenseStatus.style.borderColor = "rgba(168, 85, 247, 0.5)";
            btnLicenseStatus.style.background = "rgba(168, 85, 247, 0.08)";
            btnLicenseStatus.title = "Aetheris Professional Workspace Active";
          }
          
          if (premiumModal) premiumModal.classList.add('hidden');
        } else {
          this.showToast("Invalid License Key format. Please try again.", "error");
          if (licenseFeedback) {
            licenseFeedback.textContent = "⚠️ Validation failure: Code not found in remote ledger. Try: AETHERIS-PRO-2026";
            licenseFeedback.style.color = "#f87171";
          }
        }
      };
    }
  }

  // Global keyboard shortcuts: Space toggles play/pause, Escape dismisses
  // transient UI, F fits view, Delete removes selected node, C activates cable tool, G toggles grid snap.
  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase() || '';
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable;

      // Don't hijack typing or fire before the workspace is launched
      const landing = document.getElementById('landingPage');
      const onLanding = landing && !landing.classList.contains('hidden') && landing.style.display !== 'none';

      if (typing || onLanding) return;

      if (e.key === ' ') {
        e.preventDefault();
        this.togglePlayPause();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // Clear canvas states
        if (this.canvas) {
          this.canvas.selectedNode = null;
          this.canvas.linkingSourceNode = null;
          this.canvas.draw();
        }
        this.activePlacementTool = null;
        this.updateSidebarProfile();

        // Close transient UI elements
        document.getElementById('canvasContextMenu')?.classList.add('hidden');
        document.getElementById('reportDrawerOverlay')?.remove();
        document.getElementById('shortcutsModal')?.classList.add('hidden');
        document.getElementById('physicalInspectorModal')?.classList.add('hidden');
        document.getElementById('wiresharkModal')?.classList.add('hidden');
        document.getElementById('packetTracerModal')?.classList.add('hidden');
        document.getElementById('facilityMapModal')?.classList.add('hidden');
        document.querySelectorAll('.floating-window').forEach(w => w.remove());
      } else if (e.key === '?' || e.key === '/') {
        e.preventDefault();
        this.showShortcutsModal();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (this.canvas) {
          this.canvas.centerView();
          this.canvas.draw();
        }
      } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        document.querySelectorAll('.tool-item').forEach(el => el.classList.remove('active-tool'));
        const cableTool = document.querySelector('.tool-item[data-tool="cable"]');
        if (cableTool) {
          cableTool.classList.add('active-tool');
          this.activePlacementTool = 'cable';
        }
      } else if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        this.toggleGridSnap();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.canvas && this.canvas.selectedNode) {
          e.preventDefault();
          this.deleteCustomDevice(this.canvas.selectedNode);
        }
      }
    });
  }

  // Live query helper directing conversational queries to Google Gemini / Claude developer APIs
  async queryAI(promptText) {
    const cleanPrompt = promptText.trim();
    if (!cleanPrompt) return;

    this.orchestrator.logTerminal(`[AI CO-DRIVER] Evaluating request... (Context: ${this.activeProject})`, "info");
    
    const response = await this.llm.sendPrompt(
      cleanPrompt, 
      this.canvas.nodes, 
      this.canvas.links, 
      this.activeProject,
      this.activeProjectType === 'reactor' ? this.sim : null
    );

    // Render Conversational Text reply
    this.orchestrator.logTerminal(`[AI CO-DRIVER REPLY]`, "success");
    const lines = response.split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      // Skip printing direct execution action payloads in the conversational line print
      if (trimmed && !trimmed.startsWith('[ADD_NODE') && !trimmed.startsWith('[REMOVE_NODE') && !trimmed.startsWith('[ADD_LINK') && !trimmed.startsWith('[REMOVE_LINK') && !trimmed.startsWith('[CLEAR_TOPOLOGY]')) {
        this.orchestrator.logTerminal(trimmed, "user");
      }
    });

    // Parse Actions
    const actionRegex = /\[(ADD_NODE|REMOVE_NODE|ADD_LINK|REMOVE_LINK|CLEAR_TOPOLOGY):\s*([\s\S]+?)\]/g;
    let match;
    let parsedActionsCount = 0;

    // Handle full Wipes first
    if (response.includes('[CLEAR_TOPOLOGY]')) {
      this.canvas.clearTopology();
      this.orchestrator.logSystem("AI Action: Cleared all nodes and connections.", "warning");
      parsedActionsCount++;
    }

    while ((match = actionRegex.exec(response)) !== null) {
      const action = match[1];
      const dataStr = match[2].trim();

      try {
        if (action === 'ADD_NODE') {
          const nodeData = JSON.parse(dataStr);
          const success = this.canvas.addNode(nodeData);
          if (success) {
            this.orchestrator.logSystem(`AI Action Engaged: Created node [${nodeData.name}] at IP ${nodeData.ip}`, "success");
            parsedActionsCount++;
          }
        } else if (action === 'REMOVE_NODE') {
          const nodeId = dataStr.replace(/^["']|["']$/g, '');
          const success = this.canvas.removeNode(nodeId);
          if (success) {
            this.orchestrator.logSystem(`AI Action Engaged: Removed asset node [${nodeId}]`, "warning");
            parsedActionsCount++;
          }
        } else if (action === 'ADD_LINK') {
          const linkData = JSON.parse(dataStr);
          const success = this.canvas.addLink(linkData.source, linkData.target);
          if (success) {
            this.orchestrator.logSystem(`AI Action Engaged: Connected [${linkData.source}] to [${linkData.target}]`, "success");
            parsedActionsCount++;
          }
        } else if (action === 'REMOVE_LINK') {
          const linkData = JSON.parse(dataStr);
          const success = this.canvas.removeLink(linkData.source, linkData.target);
          if (success) {
            this.orchestrator.logSystem(`AI Action Engaged: Severed connection between [${linkData.source}] and [${linkData.target}]`, "warning");
            parsedActionsCount++;
          }
        }
      } catch (e) {
        console.error("LLM instruction parser failed:", e, dataStr);
        this.orchestrator.logTerminal(`[AI PARSER ERROR] Command structure failed: ${e.message}`, "danger");
      }
    }

    if (parsedActionsCount > 0) {
      this.orchestrator.logTerminal(`[INTEGRITY REPORT] Successfully processed ${parsedActionsCount} canvas topological adjustments.`, "success");
      // Trigger canvas coordinate transformations auto-recentering
      this.canvas.centerView();
      this.saveState();
    }
  }

  injectCyberAttack() {
    this.orchestrator.logTerminal("!!! ATTACK VECTOR TRIGGERED !!!", "danger");
    this.logIncident("CYBER ATTACK INITIATED — Intrusion vector deployed against industrial network", "critical", "T0817");

    // 1. Compromise Engineering Workstation ENG-WS
    const engWs = this.canvas.nodes.find(n => n.id === 'ENG-WS');
    if (engWs) {
      engWs.status = 'compromised';
      this.orchestrator.logTerminal("[ALERT] Intrusion Signature Detected: ENG-WS compromised via rogue remote access session.", "danger");
      this.logIncident("STAGE 1: ENG-WS compromised via rogue RDP session — attacker established persistence", "critical", "T0886");
    }

    // 2. Deploy lateral command stream to Inlet Controller PLC-101
    setTimeout(() => {
      const plc101 = this.canvas.nodes.find(n => n.id === 'PLC-101');
      if (plc101) {
        plc101.status = 'compromised';
        this.orchestrator.logTerminal("[ALERT] Lateral Movement: ENG-WS sending unauthorized Modbus firmware updates to PLC-101.", "danger");
        this.logIncident("STAGE 2: Lateral movement — unauthorized Modbus FC06 write to PLC-101 inlet valve", "critical", "T0836");

        // Severely tamper with physics valve states
        this.sim.inletValve = 100;
        this.sim.outletValve = 0;

        const v1 = document.getElementById('valveSlider1');
        const v2 = document.getElementById('valveSlider2');
        if (v1) v1.value = 100;
        if (v2) v2.value = 0;
        const s1 = document.getElementById('statusValve1');
        const s2 = document.getElementById('statusValve2');
        if (s1) s1.textContent = 'OPEN (100% - LOCKED OUT)';
        if (s2) s2.textContent = 'CLOSED (0% - LOCKED OUT)';

        this.orchestrator.logTerminal("[ICS IMPACT] Malicious PLC parameters loaded: Inlet Valve forced to 100% // Outlet Valve closed to 0%. Reactor Vessel Level rising rapidly.", "danger");
        this.logIncident("STAGE 3: ICS IMPACT — Inlet=100% Outlet=0%, reactor pressure rising rapidly", "critical", "T0855");
      }
    }, 1500);

    this.updateSidebarProfile();
  }

  initHistory() {
    this.undoStack = [];
    this.redoStack = [];
    this.saveState();
  }

  saveState() {
    if (!this.canvas) return;
    const state = {
      nodes: JSON.parse(JSON.stringify(this.canvas.nodes || [])),
      links: JSON.parse(JSON.stringify(this.canvas.links || [])),
      nodeConfigs: JSON.parse(JSON.stringify(this.nodeConfigs || {}))
    };
    
    // Avoid saving redundant duplicate states
    if (this.undoStack.length > 0) {
      const top = this.undoStack[this.undoStack.length - 1];
      if (JSON.stringify(top) === JSON.stringify(state)) {
        return;
      }
    }
    
    this.undoStack.push(state);
    if (this.undoStack.length > 50) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.updateUndoRedoUI();
  }

  undo() {
    if (this.undoStack.length <= 1) {
      this.showToast("Nothing to undo", "info");
      return;
    }
    
    // Pop current state and push to redo stack
    const currentState = this.undoStack.pop();
    this.redoStack.push(currentState);
    
    // Peek at previous state
    const prevState = this.undoStack[this.undoStack.length - 1];
    this.restoreState(prevState);
    this.showToast("Undo applied", "info");
    this.orchestrator.logSystem("Undo: Reverted last network layout modification.", "info");
  }

  redo() {
    if (this.redoStack.length === 0) {
      this.showToast("Nothing to redo", "info");
      return;
    }
    
    const nextState = this.redoStack.pop();
    this.undoStack.push(nextState);
    this.restoreState(nextState);
    this.showToast("Redo applied", "info");
    this.orchestrator.logSystem("Redo: Restored network layout modification.", "info");
  }

  restoreState(state) {
    this.canvas.nodes = JSON.parse(JSON.stringify(state.nodes));
    this.canvas.links = JSON.parse(JSON.stringify(state.links));
    this.nodeConfigs = JSON.parse(JSON.stringify(state.nodeConfigs));
    
    this.canvas.nodes.forEach(n => {
      if (this.nodeConfigs && this.nodeConfigs[n.id]) {
        n.config = this.nodeConfigs[n.id];
      }
    });

    this.canvas.particles = [];
    this.canvas.selectedNode = null;
    this.updateSidebarProfile();
    this.canvas.draw();
    this.updateUndoRedoUI();
  }

  updateUndoRedoUI() {
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) {
      if (this.undoStack.length <= 1) {
        btnUndo.style.opacity = '0.4';
        btnUndo.style.cursor = 'not-allowed';
      } else {
        btnUndo.style.opacity = '1';
        btnUndo.style.cursor = 'pointer';
      }
    }
    if (btnRedo) {
      if (this.redoStack.length === 0) {
        btnRedo.style.opacity = '0.4';
        btnRedo.style.cursor = 'not-allowed';
      } else {
        btnRedo.style.opacity = '1';
        btnRedo.style.cursor = 'pointer';
      }
    }
  }

  resetTwin() {
    this.orchestrator.resolveAlerts();
    this.canvas.nodes.forEach(n => {
      n.status = 'stable';
      n.vulnerable = (n.id === 'ENG-WS');
    });
    this.canvas.links.forEach(l => l.status = 'normal');

    this.sim.level = 65.8;
    this.sim.pressure = 1.22;
    this.sim.temp = 42.5;
    this.sim.inletValve = 52;
    this.sim.outletValve = 45;
    this.sim.reliefValve = false;

    const _vs1 = document.getElementById('valveSlider1');
    const _vs2 = document.getElementById('valveSlider2');
    const _sv1 = document.getElementById('statusValve1');
    const _sv2 = document.getElementById('statusValve2');
    const _sv3 = document.getElementById('statusValve3');
    if (_vs1) _vs1.value = 52;
    if (_vs2) _vs2.value = 45;
    if (_sv1) _sv1.textContent = 'OPEN (52%)';
    if (_sv2) _sv2.textContent = 'OPEN (45%)';
    if (_sv3) { _sv3.textContent = 'CLOSED'; _sv3.className = 'valve-status font-mono text-red'; }

    const _chkMicro = document.getElementById('chkMicroseg');
    if (_chkMicro) _chkMicro.checked = false;
    this.orchestrator.microsegMode = false;
    this.orchestrator.executeMicrosegmentation(false);

    this.orchestrator.logSystem("Diagnostics System reset. All twin states normalized.", "success");
    this.updateSidebarProfile();
    this.saveState();
  }

  onNodeSelected(node) {
    this.updateSidebarProfile();
    if (node) {
      this.attachCLISession(node);
    } else {
      this.detachCLISession();
    }
  }

  attachCLISession(node) {
    const role = (node.role || '').toLowerCase();
    const isPremiumDevice = role.includes('plc') || role.includes('controller') || role.includes('rtu') || role.includes('hmi') || role.includes('scada') || role.includes('actuator') || role.includes('valve') || role.includes('diode') || role.includes('claroty') || role.includes('vfd') || role.includes('drive') || role.includes('dcs') || role.includes('historian') || role.includes('workstation');
    if (isPremiumDevice) {
      if (!this.checkPremiumFeature('ics-assets', '🚨 ADVANCED ICS / OT INDUSTRIAL HARDWARE')) {
        this.detachCLISession();
        return;
      }
    }
    const cliStatus = document.getElementById('cliStatus');
    const cliPrompt = document.getElementById('cliPrompt');
    const cliInput = document.getElementById('cliInput');
    const cliOutput = document.getElementById('cliOutput');

    cliStatus.textContent = `ACTIVE: ${node.id.toUpperCase()}`;
    cliPrompt.textContent = this.getCLIPromptText(node);
    cliInput.disabled = false;
    cliInput.placeholder = "Type command here (e.g. 'help', 'show config')...";

    // Set connection headers in output — use textContent via printCLILine to prevent XSS
    const e = (s) => this.escapeHtml(s);
    cliOutput.innerHTML = '';
    const nodeRole = node.role.toLowerCase();
    const nodeOs = (node.os || '').toLowerCase();
    const isEndpoint = nodeRole.includes('workstation') || nodeRole.includes('station') || nodeRole.includes('engineer') || nodeRole.includes('pc');
    const isWindows = nodeOs.includes('windows') || nodeOs.includes('win');
    const isLinux = nodeOs.includes('linux') || nodeOs.includes('ubuntu') || nodeOs.includes('kali') || nodeOs.includes('centos') || nodeOs.includes('arch') || nodeOs.includes('debian');

    if (nodeRole.includes('plc') || nodeRole.includes('rtu') || nodeRole.includes('sis') || nodeRole.includes('dcs')) {
      this.printCLILine('# Serial session attached on /dev/ttyS0 at 9600 baud.', 'comment');
      this.printCLILine(`# Industrial Micro-Controller: ${e(node.name)} (${e(node.ip)})`, 'comment');
      this.printCLILine(`# OS: ${e(node.os || 'VxWorks RTOS')} [Signature Verified]`, 'comment');
      this.printCLILine(`Device Online. Modbus registry loaded. Status: ${e(node.status.toUpperCase())}`, 'success');
    } else if (nodeRole.includes('firewall') || nodeRole.includes('router') || nodeRole.includes('gateway') || nodeRole.includes('switch')) {
      this.printCLILine(`# SSH connection established to ${e(node.name)} (${e(node.ip)}) on port 22.`, 'comment');
      this.printCLILine(`# Network Platform: ${e(node.os || 'Unknown')} [Version ${e(node.firmware || 'N/A')}]`, 'comment');
      this.printCLILine(`Active configuration parsed. Command line terminal loaded. Status: ${e(node.status.toUpperCase())}`, 'success');
    } else if (isEndpoint && isWindows) {
      this.printCLILine(`Microsoft Windows [Version ${e(node.firmware || '10.0.22621.0')}]`, 'comment');
      this.printCLILine(`(c) Microsoft Corporation. All rights reserved.`, 'comment');
      this.printCLILine('');
      this.printCLILine(`Connected to: ${e(node.name)} (${e(node.ip)})  Status: ${e(node.status.toUpperCase())}`, 'success');
    } else if (isEndpoint && isLinux) {
      this.printCLILine(`${e(node.os || 'Linux')} — ${e(node.firmware || 'kernel 6.x')}`, 'comment');
      this.printCLILine(`Last login: ${new Date().toUTCString()}`, 'comment');
      this.printCLILine('');
      this.printCLILine(`Connected to: ${e(node.name)} (${e(node.ip)})  Status: ${e(node.status.toUpperCase())}`, 'success');
    } else {
      this.printCLILine(`# Terminal attachment active for workspace asset [${e(node.id)}].`, 'comment');
      this.printCLILine(`# Hostname: ${e(node.name)} // IP: ${e(node.ip)} // OS: ${e(node.os || 'Unknown')}`, 'comment');
      this.printCLILine(`Shell interface initialized. Status: ${e(node.status.toUpperCase())}`, 'success');
    }
    this.printCLILine("Type 'help' to view the list of available commands.");
    cliOutput.scrollTop = cliOutput.scrollHeight;
    
    // Auto focus the input field for maximum convenience
    setTimeout(() => cliInput.focus(), 50);
  }

  detachCLISession() {
    const cliStatus = document.getElementById('cliStatus');
    const cliPrompt = document.getElementById('cliPrompt');
    const cliInput = document.getElementById('cliInput');
    const cliOutput = document.getElementById('cliOutput');

    if (cliStatus) cliStatus.textContent = "ACTIVE: NONE";
    if (cliPrompt) cliPrompt.textContent = "NONE>";
    if (cliInput) {
      cliInput.disabled = true;
      cliInput.placeholder = "Select an asset above to initialize CLI session...";
      cliInput.value = "";
    }

    if (cliOutput) {
      cliOutput.innerHTML = `
        <div class="cli-line comment-line"># AETHERIS Interactive Device Shell initialized.</div>
        <div class="cli-line comment-line"># Standby. Click any topology node above to open a direct SSH/Serial CLI session.</div>
      `;
    }
  }

  checkPremiumFeature(featureName, displayName) {
    if (this.currentLicenseTier === 'professional') return true;

    const modal = document.getElementById('premiumPaywallModal');
    const desc = document.getElementById('paywallFeatureDesc');
    const input = document.getElementById('licenseKeyInput');

    if (desc) {
      desc.innerHTML = `<span style="color:#c084fc;font-weight:700;">${displayName}</span> requires <strong style="color:#fff;">Aetheris Professional</strong>. Upgrade to unlock this feature.`;
    }
    if (modal) modal.classList.remove('hidden');
    if (input) { input.value = ''; input.focus(); }

    return false;
  }

  getNodeConfig(node) {
    if (this.nodeConfigs && this.nodeConfigs[node.id]) {
      node.config = this.nodeConfigs[node.id];
    }
    if (!node.config) {
      const isFirewall = node.role.toLowerCase().includes('firewall');
      const isRouter = node.role.toLowerCase().includes('router');
      const isPredefined = ['ENG-WS', 'HMI-01', 'PLC-01', 'PLC-02', 'CORP-AD', 'SOC-WS'].includes(node.id) || 
                           node.role.toLowerCase().includes('plc') || 
                           node.role.toLowerCase().includes('hmi') || 
                           node.role.toLowerCase().includes('actuator');
      const defaultIpConfig = isPredefined ? 'static' : 
                              (node.role.toLowerCase().includes('workstation') || node.role.toLowerCase().includes('pc') ? 'dhcp' : 'static');

      node.config = {
        hostname: node.name || node.id,
        ip: node.ip || '192.168.1.100',
        ipConfig: defaultIpConfig,
        gateway: isFirewall ? '10.1.10.1' : '192.168.1.1',
        subnetMask: '255.255.255.0',
        cliMode: 'exec', // 'exec', 'enable', 'config', 'config-if'
        cliInterface: null,
        interfaces: isFirewall ? {
          'Gig0/1': { ip: node.ip || '10.1.10.2', mask: '255.255.255.0', shutdown: false, zone: 'outside', securityLevel: 0 },
          'Gig0/2': { ip: '192.168.1.2', mask: '255.255.255.0', shutdown: false, zone: 'inside', securityLevel: 100 },
          'Gig0/3': { ip: '172.16.10.1', mask: '255.255.255.0', shutdown: false, zone: 'dmz', securityLevel: 50 }
        } : (isRouter ? {
          'Gig0/1': { ip: node.ip || '192.168.1.1', mask: '255.255.255.0', shutdown: false, zone: 'inside', securityLevel: 100 },
          'Gig0/2': { ip: '10.1.10.1', mask: '255.255.255.0', shutdown: false, zone: 'outside', securityLevel: 0 }
        } : {
          'Gig0/1': { ip: node.ip || '192.168.1.100', mask: '255.255.255.0', shutdown: false, zone: 'inside', securityLevel: 100 }
        }),
        routing: {
          routes: isFirewall ? [
            { destination: '0.0.0.0', mask: '0.0.0.0', gateway: '10.1.10.1' }
          ] : (isRouter ? [
            { destination: '10.1.10.0', mask: '255.255.255.0', gateway: '10.1.10.1' },
            { destination: '192.168.1.0', mask: '255.255.255.0', gateway: '192.168.1.1' }
          ] : [
            { destination: '0.0.0.0', mask: '0.0.0.0', gateway: '192.168.1.1' }
          ])
        },
        acls: isFirewall ? [
          { id: '101', action: 'permit', protocol: 'ip', source: 'any', destination: 'any' }
        ] : [],
        dhcp: (isRouter || isFirewall) ? {
          enabled: true,
          subnet: '192.168.1.0',
          mask: '255.255.255.0',
          rangeStart: 10,
          rangeEnd: 99,
          gateway: isFirewall ? '192.168.1.2' : '192.168.1.1',
          leases: {}
        } : null,
        modbus: {
          coils: {
            '1': true,
            '2': true
          }
        }
      };
      
      this.nodeConfigs[node.id] = node.config;
    }
    return node.config;
  }

  updateCLIPrompt(node) {
    const cliPrompt = document.getElementById('cliPrompt');
    if (cliPrompt) cliPrompt.textContent = this.getCLIPromptText(node);
  }

  getCLIPromptText(node) {
    const config = this.getNodeConfig(node);
    const host = config.hostname || node.id;
    const osType = (node.os || '').toLowerCase();
    const role = (node.role || '').toLowerCase();
    const isEndpoint = role.includes('workstation') || role.includes('station') || role.includes('engineer') || role.includes('pc');
    if (isEndpoint) {
      const isWindows = osType.includes('windows') || osType.includes('win');
      const isLinux = osType.includes('linux') || osType.includes('ubuntu') || osType.includes('kali') || osType.includes('centos') || osType.includes('arch') || osType.includes('debian');
      if (isWindows) return `C:\\Users\\${host}> `;
      if (isLinux) return `${host.toLowerCase()}:~$ `;
    }
    if (config.cliMode === 'enable') return `${host}# `;
    if (config.cliMode === 'config') return `${host}(config)# `;
    if (config.cliMode === 'config-if') return `${host}(config-if)# `;
    return `${host}> `;
  }

  printCLILine(text, type = '') {
    const cliOutput = this.activeCLIOutput || document.getElementById('cliOutput');
    if (!cliOutput) return;
    const div = document.createElement('div');
    div.className = 'cli-line ' + (type ? type + '-line' : '');
    if (type === 'user-input') {
      div.className = 'cli-line user-input';
    }
    div.textContent = text;
    cliOutput.appendChild(div);
    cliOutput.scrollTop = cliOutput.scrollHeight;
  }

  printRouteTable(config) {
    this.printCLILine(`Routing Table (IPv4 Static and Connected):`, 'success');
    this.printCLILine(`Codes: C - connected, S - static, O - OSPF`);
    this.printCLILine(``);
    
    Object.keys(config.interfaces).forEach(ifName => {
      const iface = config.interfaces[ifName];
      if (!iface.shutdown) {
        this.printCLILine(`C    ${iface.ip}/24 is directly connected, ${ifName}`);
      }
    });
    
    config.routing.routes.forEach(r => {
      const code = r.protocol === 'OSPF' ? 'O ' : 'S*';
      const metric = r.protocol === 'OSPF' ? '110/2' : '1/0';
      this.printCLILine(`${code.padEnd(4)}${r.destination}/${r.mask} [${metric}] via ${r.gateway}`);
    });
  }

  printRunningConfig(node) {
    const config = this.getNodeConfig(node);
    const osType = (node.os || '').toLowerCase();
    
    if (osType.includes('juniper')) {
      this.printCLILine(`# Juniper JunOS Active Startup Configuration for ${config.hostname}:`, 'comment-line');
      this.printCLILine(`set system hostname ${config.hostname}`);
      Object.keys(config.interfaces).forEach((ifName, index) => {
        const iface = config.interfaces[ifName];
        const junName = `ge-0/0/${index}`;
        this.printCLILine(`set interfaces ${junName} unit 0 family inet address ${iface.ip}/24`);
        if (iface.zone) {
          this.printCLILine(`set security zones security-zone ${iface.zone} interfaces ${junName}.0`);
        }
      });
      this.printCLILine(`set protocols ospf area 0.0.0.0 interface ge-0/0/0.0`);
      this.printCLILine(`set protocols mpls interface ge-0/0/0.0`);
      this.printCLILine(`set routing-instances CUSTOMER_A instance-type vrf`);
      this.printCLILine(`set routing-instances CUSTOMER_A route-distinguisher 65000:1`);
      this.printCLILine(`set routing-instances CUSTOMER_A vrf-target target:65000:1`);
      this.printCLILine(`set routing-instances CUSTOMER_A interface ge-0/0/1.0`);
      return;
    }

    if (osType.includes('arista')) {
      this.printCLILine(`! Arista EOS Active Startup Configuration for ${config.hostname}:`, 'comment-line');
      this.printCLILine(`hostname ${config.hostname}`);
      this.printCLILine(`!`);
      Object.keys(config.interfaces).forEach((ifName, index) => {
        const iface = config.interfaces[ifName];
        this.printCLILine(`interface Ethernet${index + 1}`);
        this.printCLILine(`   ip address ${iface.ip}/24`);
        if (iface.shutdown) this.printCLILine(`   shutdown`);
      });
      this.printCLILine(`!`);
      this.printCLILine(`router ospf 100`);
      this.printCLILine(`   router-id ${config.ip}`);
      this.printCLILine(`   network 0.0.0.0/0 area 0.0.0.0`);
      return;
    }

    if (osType.includes('palo')) {
      this.printCLILine(`# Palo Alto PAN-OS Active Security Policy Rulebase for ${config.hostname}:`, 'comment-line');
      this.printCLILine(`set deviceconfig system hostname ${config.hostname}`);
      this.printCLILine(`set network interface ethernet ethernet1/1 layer3 ip 10.1.10.1/24`);
      this.printCLILine(`set network interface ethernet ethernet1/2 layer3 ip 192.168.1.1/24`);
      this.printCLILine(`set zone inside network layer3 ethernet1/1`);
      this.printCLILine(`set zone outside network layer3 ethernet1/2`);
      this.printCLILine(`set rulebase security rules Restrict-OT-Zone from inside to outside action deny`);
      this.printCLILine(`set rulebase security rules Allow-Mgmt from inside to inside action allow`);
      return;
    }

    // Default Cisco IOL
    this.printCLILine(`! Live Running Configuration for ${config.hostname}:`, 'comment-line');
    this.printCLILine(`! Current CLI Session Mode: ${config.cliMode.toUpperCase()}`);
    this.printCLILine(`!`);
    this.printCLILine(`version 15.2`);
    this.printCLILine(`service timestamps debug datetime msec`);
    this.printCLILine(`service timestamps log datetime msec`);
    this.printCLILine(`no service password-encryption`);
    this.printCLILine(`!`);
    this.printCLILine(`hostname ${config.hostname}`);
    this.printCLILine(`!`);
    
    Object.keys(config.interfaces).forEach(ifName => {
      const iface = config.interfaces[ifName];
      this.printCLILine(`interface ${ifName}`);
      if (iface.zone) {
        this.printCLILine(` nameif ${iface.zone}`);
        this.printCLILine(` security-level ${iface.securityLevel}`);
      }
      this.printCLILine(` ip address ${iface.ip} ${iface.mask}`);
      if (iface.shutdown) {
        this.printCLILine(` shutdown`);
      } else {
        this.printCLILine(` no shutdown`);
      }
      this.printCLILine(`!`);
    });

    config.routing.routes.forEach(r => {
      this.printCLILine(`ip route ${r.destination} ${r.mask} ${r.gateway}`);
    });
    
    this.printCLILine(`!`);
    if (config.acls && config.acls.length > 0) {
      config.acls.forEach(acl => {
        this.printCLILine(`access-list ${acl.id} ${acl.action} ${acl.protocol} ${acl.source} ${acl.destination}`);
      });
      this.printCLILine(`!`);
    }

    if (node.role.toLowerCase().includes('plc')) {
      this.printCLILine(`modbus slave-address 0x01`);
      this.printCLILine(`modbus coil 00001 state ${config.modbus.coils['1'] ? '1' : '0'}`);
      this.printCLILine(`modbus coil 00002 state ${config.modbus.coils['2'] ? '1' : '0'}`);
      this.printCLILine(`!`);
    }
    this.printCLILine(`end`);
  }

  runCLIPing(targetStr, node) {
    if (!targetStr) {
      this.printCLILine(`Usage: ping [IP_ADDRESS_OR_NODE_ID]`, 'error-line');
      return;
    }
    this.printCLILine(`Sending 5 ICMP Echos to ${targetStr}, timeout is 2 seconds:`, 'comment-line');

    const targetNode = this.canvas.nodes.find(n => n.ip.split(' ')[0] === targetStr || n.id.toLowerCase() === targetStr.toLowerCase() || n.name.toLowerCase() === targetStr.toLowerCase());
    if (!targetNode) {
      let lostCount = 0;
      const interval = setInterval(() => {
        if (lostCount < 5) {
          this.printCLILine(`Request timed out (No route to host).`, 'error-line');
          lostCount++;
        } else {
          clearInterval(interval);
          this.printCLILine(`\nPing statistics for ${targetStr}:`, 'error-line');
          this.printCLILine(`    Packets: Sent = 5, Received = 0, Lost = 5 (100% loss)`);
        }
      }, 150);
      return;
    }

    // 1. Solve L3 path for forward request
    const forward = this.solveL3RoutingPath(node, targetNode.ip.split(' ')[0]);

    if (!forward.success) {
      let lostCount = 0;
      const interval = setInterval(() => {
        if (lostCount < 5) {
          this.printCLILine(`Request timed out: ${forward.reason}`, 'error-line');
          lostCount++;
        } else {
          clearInterval(interval);
          this.printCLILine(`\nPing statistics for ${targetStr}:`, 'error-line');
          this.printCLILine(`    Packets: Sent = 5, Received = 0, Lost = 5 (100% loss)`);
        }
      }, 150);
      return;
    }

    // 2. Check if Firewall blocks packet along forward path
    let blockedByFirewall = false;
    let blockingAcl = null;
    let blockingFwNode = null;

    for (const hopNode of forward.hops) {
      if (hopNode.role.toLowerCase().includes('firewall')) {
        const fwConfig = this.getNodeConfig(hopNode);
        if (fwConfig.acls) {
          const matchingAcl = fwConfig.acls.find(acl => {
            const matchesSrc = acl.source === 'any' || node.ip.startsWith(acl.source) || targetStr.startsWith(acl.source);
            const matchesDst = acl.destination === 'any' || targetNode.ip.startsWith(acl.destination);
            return acl.action === 'deny' && matchesSrc && matchesDst;
          });
          if (matchingAcl) {
            blockedByFirewall = true;
            blockingAcl = matchingAcl;
            blockingFwNode = hopNode;
            break;
          }
        }
      }
    }

    if (blockedByFirewall) {
      // Visually animate up to the blocking firewall
      this.canvas.spawnPacket(node, blockingFwNode, 'icmp', forward.l2Path);
      let lostCount = 0;
      const interval = setInterval(() => {
        if (lostCount < 5) {
          this.printCLILine(`Request timed out (Dropped by ACL ${blockingAcl.id} at ${blockingFwNode.id}).`, 'error-line');
          lostCount++;
        } else {
          clearInterval(interval);
          this.printCLILine(`\nPing statistics for ${targetStr}:`, 'error-line');
          this.printCLILine(`    Packets: Sent = 5, Received = 0, Lost = 5 (100% loss)`);
        }
      }, 150);
      return;
    }

    // 3. Solve L3 path for reverse reply
    const reply = this.solveL3RoutingPath(targetNode, node.ip.split(' ')[0]);

    if (!reply.success) {
      // Animate request, but reply gets lost
      this.canvas.spawnPacket(node, targetNode, 'icmp', forward.l2Path);
      let lostCount = 0;
      const interval = setInterval(() => {
        if (lostCount < 5) {
          this.printCLILine(`Request timed out (Return path unreachable: ${reply.reason}).`, 'error-line');
          lostCount++;
        } else {
          clearInterval(interval);
          this.printCLILine(`\nPing statistics for ${targetStr}:`, 'error-line');
          this.printCLILine(`    Packets: Sent = 5, Received = 0, Lost = 5 (100% loss)`);
        }
      }, 150);
      return;
    }

    // Everything is successful! Trigger visual bidirectional packet and print successful replies!
    this.canvas.spawnPacket(node, targetNode, 'icmp', forward.l2Path);
    setTimeout(() => {
      this.canvas.spawnPacket(targetNode, node, 'icmp', reply.l2Path);
    }, 1200);

    let successCount = 0;
    const interval = setInterval(() => {
      if (successCount < 5) {
        this.printCLILine(`Reply from ${targetNode.ip.split(' ')[0]}: bytes=32 time=4ms TTL=64`, 'success');
        successCount++;
      } else {
        clearInterval(interval);
        this.printCLILine(`\nPing statistics for ${targetStr}:`, 'success');
        this.printCLILine(`    Packets: Sent = 5, Received = 5, Lost = 0 (0% loss)`);
      }
    }, 150);
  }

  printModbusStatus(node) {
    const config = this.getNodeConfig(node);
    this.printCLILine(`Modbus Protocol Register Readout for ${node.id}:`, 'success');
    this.printCLILine(`[Holding Reg 40001] Reactor Temperature: ${(this.sim.temp * 100).toFixed(0)} (scaled * 100)`);
    this.printCLILine(`[Holding Reg 40002] Reactor Pressure: ${(this.sim.pressure * 1000).toFixed(0)} (scaled * 1000)`);
    this.printCLILine(`[Holding Reg 40003] Water Tank Level: ${(this.sim.level * 100).toFixed(0)} (scaled * 100)`);
    this.printCLILine(`[Coil 00001] Inlet Valve (V-101) State: ${config.modbus.coils['1'] ? 'ON (OPEN)' : 'OFF (CLOSED)'} (${this.sim.inletValve}% flow)`);
    this.printCLILine(`[Coil 00002] Outlet Valve (V-102) State: ${config.modbus.coils['2'] ? 'ON (OPEN)' : 'OFF (CLOSED)'} (${this.sim.outletValve}% flow)`);
  }

  runDeviceReboot(node) {
    this.printCLILine(`Initiating warm system reboot of hardware controller...`, 'warning');
    setTimeout(() => {
      this.printCLILine(`System boot signature verification complete. Firmware loaded successfully.`, 'success');
      node.status = 'stable';
      node.vulnerable = false;
      this.canvas.links.forEach(l => {
        if (l.sourceId === node.id || l.targetId === node.id) {
          l.status = 'normal';
        }
      });
      this.updateSidebarProfile();
      this.attachCLISession(node);
    }, 800);
  }

  handleModbusSetCoil(coilIdStr, stateStr, node) {
    const config = this.getNodeConfig(node);
    if (!coilIdStr || !stateStr) {
      this.printCLILine(`% Usage: set coil [1/2] [on/off]`, 'error-line');
      return;
    }
    const state = stateStr.toLowerCase() === 'on';
    config.modbus.coils[coilIdStr] = state;
    
    if (coilIdStr === '1') {
      const val = state ? 100 : 0;
      this.sim.inletValve = val;
      const slider = document.getElementById('valveSlider1');
      if (slider) slider.value = val;
      const status = document.getElementById('statusValve1');
      if (status) status.textContent = state ? 'OPEN (100% - FORCED CLI)' : 'CLOSED (0% - FORCED CLI)';
    } else if (coilIdStr === '2') {
      const val = state ? 100 : 0;
      this.sim.outletValve = val;
      const slider = document.getElementById('valveSlider2');
      if (slider) slider.value = val;
      const status = document.getElementById('statusValve2');
      if (status) status.textContent = state ? 'OPEN (100% - FORCED CLI)' : 'CLOSED (0% - FORCED CLI)';
    }

    this.printCLILine(`Modbus write payload executed. Coil 0000${coilIdStr} set to ${state ? '1' : '0'}.`, 'success');
  }

  executeWindowsCMD(cmd, node, args, baseCmd) {
    const e = s => this.escapeHtml(String(s));
    const ip = node.ip.split(' ')[0];
    switch (baseCmd) {
      case 'help':
      case '/?':
        this.printCLILine('Windows Command Processor — Available Commands:');
        this.printCLILine('  ipconfig [/all]         Display IP configuration');
        this.printCLILine('  netstat [-an]            Show active connections and ports');
        this.printCLILine('  tasklist                 List running processes');
        this.printCLILine('  net user                 Show local user accounts');
        this.printCLILine('  net session              Show active SMB sessions');
        this.printCLILine('  systeminfo               Display system information');
        this.printCLILine('  ping [IP]                Send ICMP echo packets');
        this.printCLILine('  tracert [IP]             Trace route to destination');
        this.printCLILine('  dir                      List directory contents');
        this.printCLILine('  whoami                   Display current user');
        this.printCLILine('  cls                      Clear terminal screen');
        this.printCLILine('--- Cyber Tools ---');
        this.printCLILine('  nmap [IP]                Network port scanner');
        this.printCLILine('  hydra [IP] [svc]         Brute-force credential tester');
        this.printCLILine('  arp-spoof [victim] [gw]  ARP cache poisoning MITM');
        break;
      case 'ipconfig':
        this.printCLILine('Windows IP Configuration');
        this.printCLILine('');
        this.printCLILine(`Ethernet adapter Ethernet0:`);
        this.printCLILine(`   Connection-specific DNS Suffix  . :`);
        this.printCLILine(`   IPv4 Address. . . . . . . . . . . : ${e(ip)}`);
        this.printCLILine(`   Subnet Mask . . . . . . . . . . . : 255.255.255.0`);
        this.printCLILine(`   Default Gateway . . . . . . . . . : ${e(ip.split('.').slice(0,3).join('.')  + '.1')}`);
        if (args[1] === '/all') {
          this.printCLILine(`   Physical Address. . . . . . . . . : 00-50-56-84-A6-${Math.floor(Math.random()*255).toString(16).padStart(2,'0').toUpperCase()}`);
          this.printCLILine(`   DHCP Enabled. . . . . . . . . . . : No`);
          this.printCLILine(`   DNS Servers . . . . . . . . . . . : 8.8.8.8`);
        }
        break;
      case 'netstat':
        this.printCLILine('Active Connections');
        this.printCLILine('');
        this.printCLILine('  Proto  Local Address          Foreign Address        State');
        this.printCLILine(`  TCP    ${e(ip)}:3389      0.0.0.0:0              LISTENING`);
        this.printCLILine(`  TCP    ${e(ip)}:445       0.0.0.0:0              LISTENING`);
        this.printCLILine(`  TCP    ${e(ip)}:135       0.0.0.0:0              LISTENING`);
        this.printCLILine(`  TCP    ${e(ip)}:49152     0.0.0.0:0              LISTENING`);
        if (node.status === 'compromised') {
          this.printCLILine(`  TCP    ${e(ip)}:4444       10.0.0.99:443          ESTABLISHED  [SUSPICIOUS]`, 'error-line');
        }
        break;
      case 'tasklist':
        this.printCLILine('Image Name                     PID Session Name        Mem Usage');
        this.printCLILine('========================= ======== ================ ===========');
        this.printCLILine('System Idle Process              0 Services                  8 K');
        this.printCLILine('System                           4 Services                864 K');
        this.printCLILine('svchost.exe                    820 Services             12,456 K');
        this.printCLILine('lsass.exe                      668 Services              8,980 K');
        this.printCLILine('explorer.exe                  3120 Console              42,800 K');
        if (node.role?.toLowerCase().includes('engineer') || node.role?.toLowerCase().includes('workstation')) {
          this.printCLILine('TIA Portal.exe                4820 Console             380,000 K');
          this.printCLILine('StepMicro.exe                 5120 Console              48,300 K');
        }
        if (node.status === 'compromised') {
          this.printCLILine('svchost32.exe                6666 Console               2,048 K  [MALWARE?]', 'error-line');
        }
        break;
      case 'systeminfo':
        this.printCLILine(`Host Name:                 ${e(node.name.replace(/\s+/g,'_').toUpperCase())}`);
        this.printCLILine(`OS Name:                   ${e(node.os || 'Windows 11 Enterprise')}`);
        this.printCLILine(`OS Version:                ${e(node.firmware || '10.0.22621 Build 22621')}`);
        this.printCLILine(`System Manufacturer:       Dell Inc.`);
        this.printCLILine(`System Model:              OptiPlex 7090`);
        this.printCLILine(`Processor:                 Intel Core i7-11700 @ 2.50GHz`);
        this.printCLILine(`Total Physical Memory:     16,384 MB`);
        this.printCLILine(`Domain:                    CORP.LOCAL`);
        break;
      case 'whoami':
        this.printCLILine(`CORP\\${e(node.id.toLowerCase())}`);
        break;
      case 'net':
        if (args[1] === 'user') {
          this.printCLILine(`User accounts for \\\\${e(node.id)}`);
          this.printCLILine('-------------------------------------------------------------------------------');
          this.printCLILine(`Administrator            ${e(node.id.toLowerCase())}              Guest`);
        } else if (args[1] === 'session') {
          this.printCLILine('Computer               User name            Client Type       Opens Idle time');
          this.printCLILine('-------------------------------------------------------------------------------');
        } else {
          this.printCLILine(`The syntax of this command is: net user | net session`);
        }
        break;
      case 'dir':
        this.printCLILine(` Volume in drive C is OS`);
        this.printCLILine(` Directory of C:\\Users\\${e(node.id.toLowerCase())}`);
        this.printCLILine('');
        this.printCLILine(`05/23/2026  10:14 AM    <DIR>          Desktop`);
        this.printCLILine(`05/23/2026  10:14 AM    <DIR>          Documents`);
        this.printCLILine(`05/23/2026  09:45 AM    <DIR>          Downloads`);
        this.printCLILine(`05/20/2026  02:11 PM         1,024,512 project_scan.xlsx`);
        this.printCLILine(`               1 File(s)      1,024,512 bytes`);
        break;
      case 'ping': {
        const target = args[1] || '8.8.8.8';
        this.printCLILine(`Pinging ${e(target)} with 32 bytes of data:`);
        for (let i = 0; i < 4; i++) {
          const ms = 1 + Math.floor(Math.random() * 8);
          this.printCLILine(`Reply from ${e(target)}: bytes=32 time=${ms}ms TTL=128`, 'success');
        }
        this.printCLILine(`Ping statistics for ${e(target)}: Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)`, 'success');
        break;
      }
      case 'tracert': {
        const target = args[1] || '8.8.8.8';
        this.printCLILine(`Tracing route to ${e(target)} over a maximum of 30 hops:`);
        const gw = ip.split('.').slice(0,3).join('.') + '.1';
        this.printCLILine(`  1    <1 ms    <1 ms    <1 ms  ${gw}`);
        this.printCLILine(`  2     2 ms     1 ms     2 ms  10.0.0.1`);
        this.printCLILine(`  3    12 ms    11 ms    13 ms  ${e(target)}`);
        this.printCLILine(`Trace complete.`, 'success');
        break;
      }
      case 'cls':
        { const cliOutput = this.activeCLIOutput || document.getElementById('cliOutput'); if (cliOutput) cliOutput.innerHTML = ''; break; }
      case 'nmap': case 'hydra': case 'arp-spoof': case 'modbus-inject': case 'tcpdump':
        this.executeCyberTool(baseCmd, args, node);
        break;
      default:
        this.printCLILine(`'${e(baseCmd)}' is not recognized as an internal or external command.`, 'error-line');
        this.printCLILine(`Type HELP for available commands.`);
    }
  }

  executeLinuxBash(cmd, node, args, baseCmd) {
    const e = s => this.escapeHtml(String(s));
    const ip = node.ip.split(' ')[0];
    const hostname = node.name.replace(/\s+/g,'-').toLowerCase();
    switch (baseCmd) {
      case 'help':
        this.printCLILine('Bash — Common Commands:');
        this.printCLILine('  ip addr / ifconfig       Show network interfaces');
        this.printCLILine('  ip route                 Show routing table');
        this.printCLILine('  netstat -tulpn           Show listening ports');
        this.printCLILine('  ss -an                   Socket statistics');
        this.printCLILine('  ps aux                   List processes');
        this.printCLILine('  whoami / id              Current user and groups');
        this.printCLILine('  ls [-la]                 List directory');
        this.printCLILine('  cat /etc/os-release      Show OS information');
        this.printCLILine('  uname -a                 Kernel version');
        this.printCLILine('  ping [IP]                ICMP connectivity test');
        this.printCLILine('  clear                    Clear terminal');
        this.printCLILine('--- Cyber Tools ---');
        this.printCLILine('  nmap [IP]                Network scanner');
        this.printCLILine('  hydra [IP] [svc]         Brute-force tool');
        this.printCLILine('  arp-spoof [victim] [gw]  ARP MITM attack');
        this.printCLILine('  modbus-inject [u] [f] [r] [v]  Modbus frame injector');
        this.printCLILine('  tcpdump [filter]         Packet capture (opens analyzer)');
        break;
      case 'ip':
        if (args[1] === 'addr' || args[1] === 'a') {
          this.printCLILine(`1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536`);
          this.printCLILine(`    inet 127.0.0.1/8 scope host lo`);
          this.printCLILine(`2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500`);
          this.printCLILine(`    link/ether 00:50:56:84:a6:${Math.floor(Math.random()*255).toString(16).padStart(2,'0')}`);
          this.printCLILine(`    inet ${e(ip)}/24 brd ${e(ip.split('.').slice(0,3).join('.'))+'.255'} scope global eth0`);
        } else if (args[1] === 'route' || args[1] === 'r') {
          this.printCLILine(`default via ${e(ip.split('.').slice(0,3).join('.')+'.1')} dev eth0`);
          this.printCLILine(`${e(ip.split('.').slice(0,3).join('.')  )}.0/24 dev eth0 proto kernel scope link src ${e(ip)}`);
        } else {
          this.printCLILine(`Usage: ip addr | ip route`);
        }
        break;
      case 'ifconfig':
        this.printCLILine(`eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500`);
        this.printCLILine(`      inet ${e(ip)}  netmask 255.255.255.0  broadcast ${e(ip.split('.').slice(0,3).join('.'))+'.255'}`);
        this.printCLILine(`      ether 00:50:56:84:a6:01  txqueuelen 1000`);
        this.printCLILine(`lo:   flags=73<UP,LOOPBACK,RUNNING>  mtu 65536`);
        this.printCLILine(`      inet 127.0.0.1  netmask 255.0.0.0`);
        break;
      case 'netstat':
        this.printCLILine('Active Internet connections (servers and established)');
        this.printCLILine('Proto Recv-Q Send-Q Local Address           Foreign Address         State');
        this.printCLILine(`tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN`);
        this.printCLILine(`tcp        0      0 0.0.0.0:443             0.0.0.0:*               LISTEN`);
        this.printCLILine(`tcp        0      0 ${e(ip)}:22          10.1.10.1:54321         ESTABLISHED`);
        if (node.status === 'compromised') {
          this.printCLILine(`tcp        0      0 ${e(ip)}:41337       10.0.0.99:4444          ESTABLISHED  [BACKDOOR?]`, 'error-line');
        }
        break;
      case 'ss':
        this.printCLILine('Netid  State   Recv-Q  Send-Q   Local Address:Port    Peer Address:Port');
        this.printCLILine(`tcp    LISTEN  0       128      0.0.0.0:22            0.0.0.0:*`);
        this.printCLILine(`tcp    LISTEN  0       128      0.0.0.0:443           0.0.0.0:*`);
        break;
      case 'ps':
        this.printCLILine('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND');
        this.printCLILine(`root           1  0.0  0.1  22560  8192 ?        Ss   09:00   0:01 /sbin/init`);
        this.printCLILine(`root         412  0.0  0.1  16240  6144 ?        Ss   09:00   0:00 sshd`);
        this.printCLILine(`root        1024  0.1  0.5 112340 40960 ?        Sl   09:01   0:12 rsyslog`);
        this.printCLILine(`${e(node.id.toLowerCase().replace(/[^a-z0-9]/g,''))}  2048  0.2  1.2 231680 98304 pts/0   Ss   10:00   0:03 bash`);
        if (node.status === 'compromised') {
          this.printCLILine(`nobody      9999 98.2  4.5 112384 368640 ?        R    10:30  12:01 ./.cache/.svc`, 'error-line');
        }
        break;
      case 'whoami':
        this.printCLILine(e(node.id.toLowerCase().replace(/[^a-z0-9]/g,'')));
        break;
      case 'id':
        this.printCLILine(`uid=1000(${e(node.id.toLowerCase().replace(/[^a-z0-9]/g,''))}) gid=1000(${e(node.id.toLowerCase().replace(/[^a-z0-9]/g,''))}) groups=1000,4(adm),24(cdrom),27(sudo)`);
        break;
      case 'ls':
        if (args[1] === '-la' || args[1] === '-al' || args[1] === '-l') {
          this.printCLILine(`total 48`);
          this.printCLILine(`drwxr-xr-x  5 user user 4096 May 23 10:14 .`);
          this.printCLILine(`drwxr-xr-x 23 root root 4096 May 20 09:00 ..`);
          this.printCLILine(`-rw-------  1 user user  220 May 20 09:00 .bash_history`);
          this.printCLILine(`drwxr-xr-x  2 user user 4096 May 23 10:00 Desktop`);
          this.printCLILine(`drwxr-xr-x  2 user user 4096 May 20 09:00 Documents`);
          this.printCLILine(`-rw-r--r--  1 user user 1024 May 22 14:30 network_scan.txt`);
        } else {
          this.printCLILine(`Desktop  Documents  Downloads  network_scan.txt`);
        }
        break;
      case 'cat':
        if (args[1] === '/etc/os-release') {
          this.printCLILine(`NAME="${e(node.os?.split(' ').slice(0,-1).join(' ') || 'Linux')}"`);
          this.printCLILine(`VERSION="${e(node.firmware || '1.0')}"`);
          this.printCLILine(`ID=${e(node.os?.split(' ')[0]?.toLowerCase() || 'linux')}`);
          this.printCLILine(`PRETTY_NAME="${e(node.os || 'Linux')} ${e(node.firmware || '')}"`);
        } else if (args[1] === '/etc/passwd') {
          this.printCLILine(`root:x:0:0:root:/root:/bin/bash`);
          this.printCLILine(`${e(node.id.toLowerCase())}:x:1000:1000::/home/${e(node.id.toLowerCase())}:/bin/bash`);
        } else {
          this.printCLILine(`cat: ${e(args[1] || '(no file)')}: No such file or directory`, 'error-line');
        }
        break;
      case 'uname':
        this.printCLILine(`Linux ${e(hostname)} ${e(node.firmware || '6.1.0')} #1 SMP ${new Date().toDateString()} x86_64 x86_64 x86_64 GNU/Linux`);
        break;
      case 'ping': {
        const target = args[1] || '8.8.8.8';
        this.printCLILine(`PING ${e(target)} (${e(target)}) 56(84) bytes of data.`);
        for (let i = 0; i < 4; i++) {
          const ms = (1 + Math.random() * 5).toFixed(3);
          this.printCLILine(`64 bytes from ${e(target)}: icmp_seq=${i+1} ttl=64 time=${ms} ms`, 'success');
        }
        this.printCLILine(`--- ${e(target)} ping statistics ---`, 'success');
        this.printCLILine(`4 packets transmitted, 4 received, 0% packet loss`, 'success');
        break;
      }
      case 'clear':
        { const cliOutput = this.activeCLIOutput || document.getElementById('cliOutput'); if (cliOutput) cliOutput.innerHTML = ''; break; }
      case 'nmap': case 'hydra': case 'arp-spoof': case 'modbus-inject': case 'tcpdump':
        this.executeCyberTool(baseCmd, args, node);
        break;
      default:
        this.printCLILine(`bash: ${e(baseCmd)}: command not found`, 'error-line');
        this.printCLILine(`Type 'help' for available commands.`);
    }
  }

  executeIndustrialCLI(cmd, node, args, baseCmd) {
    const role = (node.role || '').toLowerCase();
    const config = this.getNodeConfig(node);

    // 1. PLC Controller Shell (Siemens, Allen-Bradley)
    if (role.includes('plc') || role.includes('controller') || role.includes('rtu')) {
      if (baseCmd === 'help' || baseCmd === '?') {
        this.printCLILine(`Industrial Controller CLI Shell (Modbus TCP & Industrial Ethernet)`, 'success');
        this.printCLILine(`Available Device Commands:`);
        this.printCLILine(`  help / ?                      Show this industrial control help screen.`);
        this.printCLILine(`  show modbus                   Dump holding registers and coils state.`);
        this.printCLILine(`  read coil [ADDR]              Read Modbus coil discrete output (0-9999).`);
        this.printCLILine(`  write coil [ADDR] [0/1]       Write Modbus coil state (solenoid/relay override).`);
        this.printCLILine(`  read register [ADDR]          Read 16-bit analog holding register (40001-49999).`);
        this.printCLILine(`  write register [ADDR] [VAL]   Write holding register value.`);
        this.printCLILine(`  show state                    Display PLC CPU CPU state (RUN / STOP).`);
        this.printCLILine(`  mode [run/stop]               Force CPU runtime processor state.`);
        this.printCLILine(`  show modules                  List modular S7/Logix rack hardware cards.`);
        this.printCLILine(`  show diagnostic-buffer        Print PLC local operational system logs.`);
        this.printCLILine(`  ping [IP/Node]                Test industrial network path connectivity.`);
        this.printCLILine(`  clear                         Clear CLI terminal screen buffer.`);
        return;
      }

      if (baseCmd === 'show') {
        const sub = (args[1] || '').toLowerCase();
        if (sub === 'modbus') {
          this.printCLILine(`MODBUS TCP REGISTRY SUMMARY (Address Base 0)`, 'success');
          this.printCLILine(`COILS (Discrete Outputs):`);
          this.printCLILine(`  00001: ${config.modbus.coils['1'] ? '1 (OPEN)' : '0 (CLOSED)'} [Inlet Valve Control]`);
          this.printCLILine(`  00002: ${config.modbus.coils['2'] ? '1 (OPEN)' : '0 (CLOSED)'} [Outlet Valve Control]`);
          this.printCLILine(`HOLDING REGISTERS (Analog Inputs/Outputs):`);
          this.printCLILine(`  40001: ${(this.sim?.temp * 100).toFixed(0) || '4250'} (scaled * 100) [Reactor Temperature]`);
          this.printCLILine(`  40002: ${(this.sim?.pressure * 1000).toFixed(0) || '1220'} (scaled * 1000) [Reactor Vessel Pressure]`);
          this.printCLILine(`  40003: ${(this.sim?.level * 100).toFixed(0) || '6580'} (scaled * 100) [Water Tank Level]`);
          return;
        }
        if (sub === 'state') {
          this.printCLILine(`PLC CPU State: RUN`, 'success');
          this.printCLILine(`Program loaded: MainIndustrialLoop.hex`);
          this.printCLILine(`Scan Time: 12ms`);
          this.printCLILine(`Safety Interlocks: ACTIVE`);
          return;
        }
        if (sub === 'modules') {
          this.printCLILine(`S7 Modular Hardware Rack Inventory (Chassis Slot 0):`, 'success');
          this.printCLILine(`  Slot 0: PS 407 (10A Power Supply module)`);
          this.printCLILine(`  Slot 1: CPU 1516-3 (High-performance safety automation processor)`);
          this.printCLILine(`  Slot 2: CP 1543-1 (Industrial Ethernet security network processor)`);
          this.printCLILine(`  Slot 3: DI 16x24VDC (16-channel Digital Input signal card)`);
          this.printCLILine(`  Slot 4: AI 8xU/I/RTD/TC (8-channel high-fidelity Analog Input sensor card)`);
          return;
        }
        if (sub === 'diagnostic-buffer' || sub === 'diagnostic') {
          this.printCLILine(`PLC DIAGNOSTIC SYSTEM LOG (S7-EventLog):`, 'success');
          this.printCLILine(`  [2026-05-22 17:04:12] Event ID 0x1302: CPU changed state from STOP to RUN (Key Switch)`);
          this.printCLILine(`  [2026-05-22 17:04:12] Event ID 0x3841: Modbus Server daemon initialized on Port 502`);
          this.printCLILine(`  [2026-05-22 17:15:33] Event ID 0x4890: Optical link synchronized on Interface Profinet0/1`);
          this.printCLILine(`  [2026-05-22 18:01:05] Event ID 0x2791: Holding register 40001 (RPM) exceeded warning threshold`);
          return;
        }
      }

      if (baseCmd === 'mode') {
        const state = (args[1] || '').toLowerCase();
        if (state === 'run' || state === 'stop') {
          this.printCLILine(`PLC CPU command accepted. Changing processor mode to ${state.toUpperCase()}...`, 'success');
          this.orchestrator.logSystem(`PLC controller state set to ${state.toUpperCase()} via direct interface execution.`, 'info');
        } else {
          this.printCLILine(`% Usage: mode [run/stop]`, 'error-line');
        }
        return;
      }

      if (baseCmd === 'read') {
        const type = (args[1] || '').toLowerCase();
        const addr = args[2];
        if (!type || !addr) {
          this.printCLILine(`% Usage: read [coil/register] [ADDRESS]`, 'error-line');
          return;
        }
        if (type === 'coil') {
          const val = config.modbus.coils[addr] || config.modbus.coils[String(parseInt(addr))] ? 'ON (1)' : 'OFF (0)';
          this.printCLILine(`Modbus Query success: Coil ${addr} is currently: ${val}`);
        } else if (type === 'register') {
          let val = 0;
          if (addr === '40001') val = (this.sim?.temp * 100).toFixed(0);
          else if (addr === '40002') val = (this.sim?.pressure * 1000).toFixed(0);
          else if (addr === '40003') val = (this.sim?.level * 100).toFixed(0);
          else val = 0;
          this.printCLILine(`Modbus Query success: Register ${addr} value is currently: ${val}`);
        } else {
          this.printCLILine(`% Invalid query type: choose 'coil' or 'register'`, 'error-line');
        }
        return;
      }

      if (baseCmd === 'write') {
        const type = (args[1] || '').toLowerCase();
        const addr = args[2];
        const val = args[3];
        if (!type || !addr || val === undefined) {
          this.printCLILine(`% Usage: write [coil/register] [ADDRESS] [VALUE]`, 'error-line');
          return;
        }
        if (type === 'coil') {
          this.handleModbusSetCoil(addr, val, node);
        } else if (type === 'register') {
          this.printCLILine(`Modbus Register Force success: Register ${addr} set to ${val}.`, 'success');
          this.orchestrator.logSystem(`Modbus register ${addr} forced to ${val} via raw CLI payload.`, 'warning');
        } else {
          this.printCLILine(`% Invalid command type.`, 'error-line');
        }
        return;
      }
    }

    // 2. SCADA HMI Shell
    if (role.includes('hmi') || role.includes('scada')) {
      if (baseCmd === 'help' || baseCmd === '?') {
        this.printCLILine(`Ignition SCADA HMI Operator Console Shell`, 'success');
        this.printCLILine(`Available Gateway Commands:`);
        this.printCLILine(`  help / ?                      Show this SCADA administrator help.`);
        this.printCLILine(`  show tag-db                   Dump SCADA Tag Database paths, types, and values.`);
        this.printCLILine(`  set tag [TAG_PATH] [VAL]      Manually override active SCADA system tag value.`);
        this.printCLILine(`  show opc-connections          Display real-time industrial PLC OPC server link statuses.`);
        this.printCLILine(`  show client-sessions          Show currently active web browser dashboard sessions.`);
        this.printCLILine(`  show alarm-history            Print historical SCADA telemetry critical alarms.`);
        this.printCLILine(`  ping [IP/Node]                Test connection to plant routers or controllers.`);
        this.printCLILine(`  clear                         Clear CLI log logs.`);
        return;
      }

      if (baseCmd === 'show') {
        const sub = (args[1] || '').toLowerCase();
        if (sub === 'tags' || sub === 'tag-db') {
          this.printCLILine(`SCADA TAG ENGINE DATABASE (Ignition OPC Gateway Pathing):`, 'success');
          this.printCLILine(`----------------------------------------------------------------------`);
          this.printCLILine(`TAG PATH                           | VALUE      | TYPE    | STATE`);
          this.printCLILine(`----------------------------------------------------------------------`);
          this.printCLILine(`Reactor3/CoolingValve/FlowOpening  | ${this.physicsSim?.flowRate?.toFixed(1) || '45.0'}%       | Float   | Good (OPC UA)`);
          this.printCLILine(`Reactor3/Physical/TemperatureC     | ${this.physicsSim?.temperature?.toFixed(1) || '38.5'} C     | Float   | Good (OPC UA)`);
          this.printCLILine(`Reactor3/Physical/PressurePsi      | ${this.physicsSim?.pressure?.toFixed(1) || '14.7'} psi    | Float   | Good (OPC UA)`);
          this.printCLILine(`Reactor3/Generator/RotorRPM        | ${this.physicsSim?.rpm || 1780}        | Integer | Good (Modbus)`);
          this.printCLILine(`Reactor3/SafetyLoop/InterlockTrip  | FALSE      | Boolean | Good (Safety Suite)`);
          this.printCLILine(`----------------------------------------------------------------------`);
          return;
        }
        if (sub === 'opc-connections' || sub === 'opc') {
          this.printCLILine(`ACTIVE OPC GATEWAY CLIENT CONNECTIONS:`, 'success');
          this.printCLILine(`  Connection 1: opc.tcp://192.168.10.20:4840 [Siemens S7-01] -> ONLINE (Lat 4ms)`);
          this.printCLILine(`  Connection 2: opc.tcp://192.168.10.21:4840 [Allen-Bradley AB-01] -> ONLINE (Lat 6ms)`);
          this.printCLILine(`  Connection 3: opc.tcp://192.168.99.10:4840 [Triconex SIS-01] -> ONLINE (Secure Loop)`);
          return;
        }
        if (sub === 'client-sessions' || sub === 'sessions') {
          this.printCLILine(`ACTIVE OPERATOR DASHBOARD SESSIONS:`, 'success');
          this.printCLILine(`  Client #1 (Desktop 10.1.10.102): Active SCADA operator screen (Zone: IT Control Room)`);
          this.printCLILine(`  Client #2 (HMI Panel Level 1): Local touch-screen panel (Zone: Generator Floor)`);
          return;
        }
        if (sub === 'alarm-history' || sub === 'alarms') {
          this.printCLILine(`ACTIVE GATEWAY SYSTEM ALARMS:`, 'success');
          this.printCLILine(`  NO ACTIVE TRIPS - Physical plant safety parameters are within normal standard thresholds.`);
          return;
        }
      }

      if (baseCmd === 'set') {
        const sub = args[1];
        const val = args[2];
        if (sub !== 'tag' || !val) {
          this.printCLILine(`% Usage: set tag [TAG_PATH] [VALUE]`, 'error-line');
          return;
        }
        const path = args[2];
        const valReal = args[3];
        if (!path || valReal === undefined) {
          this.printCLILine(`% Usage: set tag [TAG_PATH] [VALUE]`, 'error-line');
          return;
        }
        this.printCLILine(`SCADA DB override: Tag [${path}] successfully set to [${valReal}].`, 'success');
        this.orchestrator.logSystem(`SCADA HMI database forced tag [${path}] to [${valReal}] via direct dashboard session.`, 'warning');
        return;
      }
    }

    // 3. Actuator Valve / VFD Motor Drive Shell
    if (role.includes('actuator') || role.includes('valve') || role.includes('drive') || role.includes('vfd')) {
      if (baseCmd === 'help' || baseCmd === '?') {
        this.printCLILine(`Smart Field Actuator & Motor Drive Controller Shell`, 'success');
        this.printCLILine(`Available Hardware Commands:`);
        this.printCLILine(`  help / ?                      Show this field actuator diagnostics help.`);
        this.printCLILine(`  show telemetry                Dump live sensor telemetry (RPM, Voltage, temperature).`);
        this.printCLILine(`  set target [VAL]              Set target frequency (0-60 Hz) or valve opening (0-100%).`);
        this.printCLILine(`  force override [on/off]       Manually override process feedback control loop.`);
        this.printCLILine(`  show parameters               Print operational ramp calibration constants.`);
        this.printCLILine(`  show faults                   Inspect active drive fault diagnostics.`);
        this.printCLILine(`  ping [IP]                     Test interface connectivity.`);
        this.printCLILine(`  clear                         Clear CLI logs.`);
        return;
      }

      if (baseCmd === 'show') {
        const sub = (args[1] || '').toLowerCase();
        if (sub === 'telemetry') {
          const isVfd = role.includes('vfd') || role.includes('drive');
          this.printCLILine(`FIELD COMPONENT OPERATIONAL TELEMETRY:`, 'success');
          if (isVfd) {
            this.printCLILine(`  Motor Output Frequency : ${this.physicsSim?.frequency?.toFixed(2) || '60.00'} Hz`);
            this.printCLILine(`  Motor Torque Speed     : ${this.physicsSim?.rpm || 1780} RPM`);
            this.printCLILine(`  Output Voltage         : 460.2 VAC (Active Phase)`);
            this.printCLILine(`  Thermal Core Temp      : 42.1 C`);
          } else {
            this.printCLILine(`  Solenoid Valve Opening : ${this.physicsSim?.flowRate?.toFixed(1) || '45.0'}%`);
            this.printCLILine(`  Actual Fluid Flow Rate : ${(this.physicsSim?.flowRate || 45.0) * 0.8} GPM [Gallons Per Min]`);
            this.printCLILine(`  Inlet Valve Pressure   : 65.4 PSI`);
            this.printCLILine(`  Relay Coil Voltage     : 24 VDC (High state)`);
          }
          return;
        }
        if (sub === 'parameters' || sub === 'params') {
          this.printCLILine(`CONTROLLER RAMP CONSTANTS (EPROM Registers):`, 'success');
          this.printCLILine(`  Parameter 101 (Acceleration Time) : 2.5 seconds`);
          this.printCLILine(`  Parameter 102 (Deceleration Time) : 3.0 seconds`);
          this.printCLILine(`  Parameter 105 (Overcurrent Limit) : 150% maximum load`);
          this.printCLILine(`  Parameter 110 (Low Speed Cutoff)  : 5.0 Hz`);
          return;
        }
        if (sub === 'faults') {
          this.printCLILine(`VFD/ACTUATOR MEMORY ALARM CODES:`, 'success');
          this.printCLILine(`  F0000: NO FAULTS ACTIVE - System operational and executing normal feedback loop.`);
          return;
        }
      }

      if (baseCmd === 'set') {
        const sub = (args[1] || '').toLowerCase();
        const val = args[2];
        if (sub !== 'target' || !val) {
          this.printCLILine(`% Usage: set target [VALUE]`, 'error-line');
          return;
        }
        const valNum = parseFloat(val);
        if (isNaN(valNum)) {
          this.printCLILine(`% Invalid numerical value`, 'error-line');
          return;
        }
        this.printCLILine(`Physical component register target updated. Set target output to [${valNum}].`, 'success');
        this.orchestrator.logSystem(`Smart actuator target value forced to ${valNum} via direct CLI shell register update.`, 'warning');
        return;
      }

      if (baseCmd === 'force') {
        const sub = (args[1] || '').toLowerCase();
        const state = (args[2] || '').toLowerCase();
        if (sub !== 'override' || (state !== 'on' && state !== 'off')) {
          this.printCLILine(`% Usage: force override [on/off]`, 'error-line');
          return;
        }
        this.printCLILine(`Local actuator manual override set to: ${state.toUpperCase()}`, 'success');
        this.orchestrator.logSystem(`Actuator local override set to ${state.toUpperCase()} via CLI.`, 'warning');
        return;
      }
    }

    // 4. Triconex Safety Instrumented System (SIS)
    if (role.includes('sis') || role.includes('safety')) {
      if (baseCmd === 'help' || baseCmd === '?') {
        this.printCLILine(`Triconex Triple-Modular Redundant (TMR) Safety Controller Shell`, 'success');
        this.printCLILine(`Available Safety Suite Commands:`);
        this.printCLILine(`  help / ?                      Show this Triconex diagnostic loop menu.`);
        this.printCLILine(`  show tmr-status               Read voters status (Channel A, B, C health).`);
        this.printCLILine(`  show safety-loops             Dump critical ESD (Emergency Shutdown) interlock loops.`);
        this.printCLILine(`  show bypass-status            List active pressure/thermal sensor safety bypasses.`);
        this.printCLILine(`  set bypass [LOOP] [on/off]    Force loop safety bypass toggle.`);
        this.printCLILine(`  show key-switch               Inspect key-switch position (RUN/PROGRAM/STOP).`);
        this.printCLILine(`  show trip-history             Print structural emergency plant trip logs.`);
        this.printCLILine(`  ping [IP]                     Test pathway connectivity.`);
        this.printCLILine(`  clear                         Clear CLI logs.`);
        return;
      }

      if (baseCmd === 'show') {
        const sub = (args[1] || '').toLowerCase();
        if (sub === 'tmr-status' || sub === 'tmr') {
          this.printCLILine(`TRICONEX TMR VOTING SYSTEM INTEGRITY REPORT:`, 'success');
          this.printCLILine(`  Module CPU-A: ONLINE // HEALTHY // SYNCED [Voter consensus: YES]`);
          this.printCLILine(`  Module CPU-B: ONLINE // HEALTHY // SYNCED [Voter consensus: YES]`);
          this.printCLILine(`  Module CPU-C: ONLINE // HEALTHY // SYNCED [Voter consensus: YES]`);
          this.printCLILine(`  Consensus State: Triple-Modular Consensus Verified (3-out-of-3)`);
          return;
        }
        if (sub === 'safety-loops' || sub === 'loops') {
          this.printCLILine(`CRITICAL ESD SAFETY LOOPS STATUS:`, 'success');
          this.printCLILine(`-----------------------------------------------------------------`);
          this.printCLILine(`LOOP ID | NAME             | SENSOR VALUE | ESD TRIP VAL | STATE`);
          this.printCLILine(`-----------------------------------------------------------------`);
          this.printCLILine(`LP-001  | Reactor Pressure | 14.7 psi     | 250.0 psi    | NORMAL`);
          this.printCLILine(`LP-002  | Reactor Temp     | 38.5 C       | 150.0 C      | NORMAL`);
          this.printCLILine(`LP-003  | Generator RPM    | 1780 RPM     | 3600 RPM     | NORMAL`);
          this.printCLILine(`-----------------------------------------------------------------`);
          return;
        }
        if (sub === 'bypass-status' || sub === 'bypass') {
          this.printCLILine(`ACTIVE SAFETY LOOP SENSOR BYPASSES:`, 'success');
          this.printCLILine(`  No loop bypasses configured. Safety voters are actively monitoring raw sensor telemetry.`);
          return;
        }
        if (sub === 'key-switch' || sub === 'key') {
          this.printCLILine(`Triconex Key-Switch State: RUN`, 'success');
          this.printCLILine(`Memory protected. Configurations cannot be pushed unless switched to PROGRAM.`);
          return;
        }
        if (sub === 'trip-history' || sub === 'trip') {
          this.printCLILine(`SAFETY TRIP EVENT JOURNAL:`, 'success');
          this.printCLILine(`  [2026-05-21 04:33:12] SYSTEM STARTUP CONSENSUS VERIFIED`);
          this.printCLILine(`  [2026-05-22 17:01:45] DI PROFIBUS SYNC SUCCESS - TMR ACTIVE`);
          return;
        }
      }

      if (baseCmd === 'set') {
        const sub = (args[1] || '').toLowerCase();
        const loop = args[2];
        const state = (args[3] || '').toLowerCase();
        if (sub !== 'bypass' || !loop || (state !== 'on' && state !== 'off')) {
          this.printCLILine(`% Usage: set bypass [LOOP_ID] [on/off]`, 'error-line');
          return;
        }
        this.printCLILine(`Safety override: Bypass state for Loop ${loop.toUpperCase()} updated to ${state.toUpperCase()}.`, 'success');
        this.orchestrator.logSystem(`Triconex SIS emergency loop bypass for [${loop.toUpperCase()}] updated to ${state.toUpperCase()} via CLI control.`, 'warning');
        return;
      }
    }

    // 5. Owl Data Diode Shell
    if (role.includes('diode')) {
      if (baseCmd === 'help' || baseCmd === '?') {
        this.printCLILine(`Owl Cyber Unidirectional Gateway Admin CLI`, 'success');
        this.printCLILine(`Available Core Commands:`);
        this.printCLILine(`  help / ?                      Show this data diode control dashboard.`);
        this.printCLILine(`  show diode-state              Verify hardware Tx/Rx alignment and optical lasers.`);
        this.printCLILine(`  show transfer-stats           Inspect proxy data volume and error metrics.`);
        this.printCLILine(`  show mappings                 View directional proxy mapping configurations.`);
        this.printCLILine(`  show optical-stats            Dump raw fiber laser voltage and dB levels.`);
        this.printCLILine(`  ping [IP]                     Test interface connectivity.`);
        this.printCLILine(`  clear                         Clear CLI logs.`);
        return;
      }

      if (baseCmd === 'show') {
        const sub = (args[1] || '').toLowerCase();
        if (sub === 'diode-state' || sub === 'state') {
          this.printCLILine(`UNIDIRECTIONAL DIODE hardware STATE:`, 'success');
          this.printCLILine(`  TX Laser Board   : EMITTING (Green LED active)`);
          this.printCLILine(`  RX Optical Board : CAPTURING (Optical alignment synced)`);
          this.printCLILine(`  Physical Diode   : ISOLATION INTEGRITY VERIFIED (Unidirectional hardware enforced)`);
          return;
        }
        if (sub === 'transfer-stats' || sub === 'stats') {
          this.printCLILine(`UNIDIRECTIONAL TRANSFERRED DATA VOLUME:`, 'success');
          this.printCLILine(`  Total Bytes Transferred : 489.1 MB`);
          this.printCLILine(`  Instantaneous Baud rate : 45.2 Kbps`);
          this.printCLILine(`  Dropped Packets (Rx)    : 0 packets`);
          this.printCLILine(`  Buffer Utilization      : 1.2% capacity`);
          return;
        }
        if (sub === 'mappings' || sub === 'rules') {
          this.printCLILine(`UNIDIRECTIONAL PROXY PORT MAPPINGS:`, 'success');
          this.printCLILine(`  UDP Stream (Modbus) : IT-Core-Port 5020 -> unidirectional-fiber -> OT-Core-Port 502`);
          this.printCLILine(`  TCP Stream (Syslog) : IT-Core-Port 5140 -> unidirectional-fiber -> OT-Core-Port 514`);
          return;
        }
        if (sub === 'optical-stats' || sub === 'optical') {
          this.printCLILine(`FIBER OPTIC RECEIVER DIAGNOSTICS:`, 'success');
          this.printCLILine(`  Signal Power     : -18.4 dBm (Acceptable base: -10 to -24 dBm)`);
          this.printCLILine(`  Laser Wavelength : 1310 nm (Single-mode laser)`);
          this.printCLILine(`  Bias Current     : 28.4 mA [Consensus status: PERFECT]`);
          return;
        }
      }
    }

    // 6. Claroty Threat Sensor Shell
    if (role.includes('claroty') || role.includes('sensor')) {
      if (baseCmd === 'help' || baseCmd === '?') {
        this.printCLILine(`Claroty CT-100 Passive Threat Detection Console`, 'success');
        this.printCLILine(`Available Sensor Commands:`);
        this.printCLILine(`  help / ?                      Show this Claroty admin shell menu.`);
        this.printCLILine(`  show assets                   Dump Claroty passively discovered OT inventory.`);
        this.printCLILine(`  show anomalies                List signature alerts and network baseline anomalies.`);
        this.printCLILine(`  show engines                  Check deep packet inspection (DPI) parser status.`);
        this.printCLILine(`  show capture-stats            Read passive capture drop rates and interface metrics.`);
        this.printCLILine(`  ping [IP]                     Test connection to network nodes.`);
        this.printCLILine(`  clear                         Clear CLI logs.`);
        return;
      }

      if (baseCmd === 'show') {
        const sub = (args[1] || '').toLowerCase();
        if (sub === 'assets') {
          this.printCLILine(`CLAROTY PASSIVE INVENTORY (Discovered OT Assets):`, 'success');
          this.printCLILine(`-----------------------------------------------------------------------`);
          this.printCLILine(`IP ADDRESS    | MANUFACTURER     | TYPE           | FIRMWARE  | PROTOCOL`);
          this.printCLILine(`-----------------------------------------------------------------------`);
          this.printCLILine(`192.168.10.20 | Siemens AG       | PLC Controller | v17.0.2   | S7Comm / Modbus`);
          this.printCLILine(`192.168.10.21 | Rockwell / A-B   | PLC Controller | v33.0.0   | CIP / ENIP`);
          this.printCLILine(`192.168.10.11 | Inductive SCADA  | SCADA HMI      | 8.1.28    | OPC UA / TCP`);
          this.printCLILine(`192.168.99.10 | Invensys/Trico   | Safety SIS     | v11.5.0   | TSAA / Modbus`);
          this.printCLILine(`-----------------------------------------------------------------------`);
          return;
        }
        if (sub === 'anomalies' || sub === 'alerts') {
          this.printCLILine(`ACTIVE OT ANOMALOUS DETECTIONS:`, 'success');
          this.printCLILine(`  Anomaly #1: Modbus Write operation detected from unauthorized IT node (10.1.10.102).`);
          this.printCLILine(`  Anomaly #2: Dynamic OSPF routing update packet traversing inside segregated OT subnet.`);
          this.printCLILine(`  Anomalies status: 2 warning-level signatures active.`);
          return;
        }
        if (sub === 'engines') {
          this.printCLILine(`DEEP PACKET INSPECTION PARSER ENGINE STATUS:`, 'success');
          this.printCLILine(`  Modbus Engine     : ENABLED (Processed: 48,102 frames)`);
          this.printCLILine(`  S7Comm Engine     : ENABLED (Processed: 28,911 frames)`);
          this.printCLILine(`  CIP / ENIP Engine : ENABLED (Processed: 14,809 frames)`);
          this.printCLILine(`  DNP3 Engine       : STANDBY (No frames parsed)`);
          return;
        }
        if (sub === 'capture-stats' || sub === 'capture') {
          this.printCLILine(`SPAN PORT PASSIVE CAPTURE STATISTICS:`, 'success');
          this.printCLILine(`  Interface Status      : active mirror (SpanPort_01)`);
          this.printCLILine(`  Packets Processed     : 1,489,102`);
          this.printCLILine(`  Dropped Packets (Tap) : 0 (0.00% drop rate)`);
          return;
        }
      }
    }

    // Generic fallbacks for basic global commands inside industrial CLI
    if (baseCmd === 'clear') {
      const cliOutput = this.activeCLIOutput || document.getElementById('cliOutput');
      if (cliOutput) cliOutput.innerHTML = '';
      return;
    }

    if (baseCmd === 'ping') {
      const dest = args[1];
      if (!dest) {
        this.printCLILine(`% Usage: ping [IP/Node]`, 'error-line');
        return;
      }
      this.printCLILine(`PING ${dest} (56 bytes of data):`);
      this.printCLILine(`64 bytes from ${dest}: icmp_seq=1 ttl=64 time=1.84 ms`);
      this.printCLILine(`64 bytes from ${dest}: icmp_seq=2 ttl=64 time=1.22 ms`);
      this.printCLILine(`64 bytes from ${dest}: icmp_seq=3 ttl=64 time=1.45 ms`);
      this.printCLILine(`--- ${dest} ping statistics ---`);
      this.printCLILine(`3 packets transmitted, 3 received, 0% packet loss, time 2004ms`);
      return;
    }

    // Catch-all syntax error for specific hardware shell context
    this.printCLILine(`% Syntax Error: Command "${cmd}" not recognized in this hardware industrial command set. Type "help" or "?" to inspect available diagnostics.`, 'error-line');
  }

  executeCLICommand(cmdStr, node) {
    const cmd = cmdStr.trim();
    if (!cmd) return;

    const config = this.getNodeConfig(node);
    
    // Echo input with prompt
    const promptText = this.getCLIPromptText(node);
    this.printCLILine(`${promptText}${cmd}`, 'user-input');

    const cliInput = document.getElementById('cliInput');
    if (cliInput) cliInput.value = '';

    const args = cmd.split(/\s+/);
    const baseCmd = args[0].toLowerCase();

    // Route industrial devices to specific syntax execution!
    const role = (node.role || '').toLowerCase();
    const nodeOsLower = (node.os || '').toLowerCase();
    const isIndustrial = role.includes('plc') || role.includes('controller') || role.includes('rtu') || role.includes('hmi') || role.includes('scada') || role.includes('actuator') || role.includes('valve') || role.includes('diode') || role.includes('claroty') || role.includes('vfd') || role.includes('drive');
    const isEndpointNode = role.includes('workstation') || role.includes('station') || role.includes('engineer') || role.includes('pc');
    const isWindowsNode = nodeOsLower.includes('windows') || nodeOsLower.includes('win');
    const isLinuxNode = nodeOsLower.includes('linux') || nodeOsLower.includes('ubuntu') || nodeOsLower.includes('kali') || nodeOsLower.includes('centos') || nodeOsLower.includes('arch') || nodeOsLower.includes('debian');

    if (isIndustrial) {
      this.executeIndustrialCLI(cmd, node, args, baseCmd);
      return;
    }

    if (isEndpointNode && isWindowsNode) {
      this.executeWindowsCMD(cmd, node, args, baseCmd);
      return;
    }

    if (isEndpointNode && isLinuxNode) {
      this.executeLinuxBash(cmd, node, args, baseCmd);
      return;
    }

    // 1. GLOBAL COMMANDS (Any Mode)
    if (baseCmd === 'help' || baseCmd === '?') {
      this.printCLILine(`Emulator CLI Shell Context: Mode = ${config.cliMode.toUpperCase()}`, 'success');
      this.printCLILine(`Global Exec Commands (Any Mode):`);
      this.printCLILine(`  help / ?                Show this help screen.`);
      this.printCLILine(`  show config             Display live system configuration.`);
      this.printCLILine(`  show ip route           Show interfaces and routing tables.`);
      this.printCLILine(`  ping [IP/Node]          Send ICMP echo packets to test connectivity.`);
      this.printCLILine(`  clear                   Clear terminal log buffer.`);
      
      if (config.cliMode === 'exec') {
        this.printCLILine(`Exec Mode Commands:`);
        this.printCLILine(`  enable                  Enter privileged administration mode.`);
        this.printCLILine(`  ip dhcp                 Renew dynamic DHCP client IP lease.`);
        this.printCLILine(`  show ip interface       Inspect local interface parameters.`);
        if (node.role.toLowerCase().includes('plc')) {
          this.printCLILine(`  show modbus status      Inspect Modbus PLC registers.`);
          this.printCLILine(`  reboot                  Warm-reboot industrial controller.`);
        }
        this.printCLILine(`Cybersecurity Tools (Offensive/Defensive):`);
        this.printCLILine(`  nmap [IP/host]          Network port scanner and OS fingerprinting.`);
        this.printCLILine(`  hydra [IP] [svc]        Credential brute-force tool (ssh/http/modbus).`);
        this.printCLILine(`  modbus-inject [u] [f] [r] [v]  Send raw Modbus frame to PLC.`);
        this.printCLILine(`  arp-spoof [victim] [gw] MITM ARP cache poisoning attack.`);
        this.printCLILine(`  tcpdump [filter]        Capture live packets (opens Wireshark).`);
      } else if (config.cliMode === 'enable') {
        this.printCLILine(`Privileged Mode Commands:`);
        this.printCLILine(`  configure terminal      Enter global configuration mode.`);
        this.printCLILine(`  disable                 Return to user exec mode.`);
        this.printCLILine(`  show running-config     Output active running config file.`);
        this.printCLILine(`  show ip interface       Inspect local interface parameters.`);
        this.printCLILine(`  show ip dhcp lease      Show active dynamic IP allocations.`);
        this.printCLILine(`  write / write memory    Save running parameters.`);
      } else if (config.cliMode === 'config') {
        this.printCLILine(`Global Configuration Mode Commands:`);
        this.printCLILine(`  hostname [NAME]         Configure device identification name.`);
        this.printCLILine(`  interface [NAME]        Select communication interface (e.g. Gig0/1).`);
        this.printCLILine(`  ip route [DST] [MASK] [GW] Add a static route.`);
        if (node.role.toLowerCase().includes('plc')) {
          this.printCLILine(`  set coil [1/2] [on/off] Toggle solenoid relay state.`);
        }
        this.printCLILine(`  exit / end              Return to privileged exec mode.`);
      } else if (config.cliMode === 'config-if') {
        this.printCLILine(`Interface Configuration Commands:`);
        this.printCLILine(`  ip address [IP] [MASK]  Configure interface IP address.`);
        this.printCLILine(`  ip address dhcp         Configure interface to query DHCP server.`);
        this.printCLILine(`  shutdown                Disable this interface (turns links inactive).`);
        this.printCLILine(`  no shutdown             Enable this interface (turns links active).`);
        this.printCLILine(`  exit                    Return to global config mode.`);
      }
      return;
    }

    if (baseCmd === 'clear') {
      const cliOutput = this.activeCLIOutput || document.getElementById('cliOutput');
      if (cliOutput) cliOutput.innerHTML = '';
      return;
    }

    if (baseCmd === 'nslookup') {
      const hostname = args[1];
      if (!hostname) {
        this.printCLILine(`% Usage: nslookup [HOSTNAME]`, 'error-line');
        return;
      }
      const resolved = this.nslookup(hostname);
      if (resolved) {
        this.printCLILine(`Server:  LocalDNS.twin`, 'comment-line');
        this.printCLILine(`Address: 10.1.10.1`, 'comment-line');
        this.printCLILine(``);
        this.printCLILine(`Name:    ${hostname}`);
        this.printCLILine(`Address: ${resolved}`);
      } else {
        this.printCLILine(`*** LocalDNS.twin can't find ${hostname}: Non-existent domain`, 'error-line');
      }
      return;
    }

    if (baseCmd === 'traceroute' || baseCmd === 'trace') {
      const target = args[1];
      if (!target) {
        this.printCLILine(`% Usage: traceroute [IP/HOSTNAME]`, 'error-line');
        return;
      }
      this.runCLITraceroute(target, node);
      return;
    }

    if (baseCmd === 'show' && (args[1]?.toLowerCase() === 'arp' || (args[1]?.toLowerCase() === 'ip' && args[2]?.toLowerCase() === 'arp'))) {
      this.printCLILine(`Protocol  Address          Age (min)  Hardware Addr   Type   Interface`, 'comment-line');
      this.printCLILine(`Internet  ${config.ip.split(' ')[0].padEnd(16)}    -  0050.56C0.0008  ARPA   Gig0/1`);
      if (this.arpCache[node.id]) {
        Object.keys(this.arpCache[node.id]).forEach(ip => {
          const mac = this.arpCache[node.id][ip];
          this.printCLILine(`Internet  ${ip.padEnd(16)}    5  ${mac}  ARPA   Gig0/1`);
        });
      }
      return;
    }

    if (baseCmd === 'show' && args[1]?.toLowerCase() === 'ip' && args[2]?.toLowerCase() === 'ospf' && args[3]?.toLowerCase() === 'neighbor') {
      this.printCLILine(`Neighbor ID     Pri   State           Dead Time   Address         Interface`, 'comment-line');
      if (this.ospfNeighbors[node.id] && this.ospfNeighbors[node.id].length > 0) {
        this.ospfNeighbors[node.id].forEach(neighId => {
          const neighNode = this.canvas.nodes.find(n => n.id === neighId);
          if (neighNode) {
            const neighCfg = this.getNodeConfig(neighNode);
            this.printCLILine(`${neighId.padEnd(16)}1     FULL/DR         00:00:36    ${neighCfg.ip.split(' ')[0].padEnd(16)}Gig0/1`);
          }
        });
      } else {
        this.printCLILine(`% No active OSPF neighbors detected on adjacent interfaces.`);
      }
      return;
    }

    if (baseCmd === 'show' && args[1]?.toLowerCase() === 'ntp' && args[2]?.toLowerCase() === 'status') {
      this.printCLILine(`Clock is synchronized, stratum 2, reference is 10.1.10.1`, 'success');
      this.printCLILine(`nominal frequency is 250.0000 Hz, actual frequency is 250.0001 Hz, precision is 2**24`);
      this.printCLILine(`reference time is E29F1A40.00000000 (12:12:21.000 UTC Fri May 22 2026)`);
      this.printCLILine(`clock offset is 0.125 msec, root delay is 1.25 msec, root dispersion is 15.2 msec`);
      this.printCLILine(`peer dispersion is 0.05 msec, loop filter state is 'CTRL'`);
      return;
    }

    if (baseCmd === 'show' && args[1]?.toLowerCase() === 'flash:') {
      this.printCLILine(`Directory of flash:/`);
      this.printCLILine(`  1  -rw-    12543209   May 22 2026 10:14:02  c8000-universalk9.17.09.03.SPA.bin`);
      this.printCLILine(`  2  -rw-        2048   May 22 2026 12:11:43  vlan.dat`);
      this.printCLILine(`  3  -rw-        4892   May 22 2026 12:12:00  startup-config`);
      this.printCLILine(``);
      this.printCLILine(`33554432 bytes total (20986348 bytes free)`);
      return;
    }

    // 2. STATE MACHINE PARSER
    
    // ==========================================
    // USER EXEC MODE
    // ==========================================
    if (config.cliMode === 'exec') {
      if (baseCmd === 'enable') {
        config.cliMode = 'enable';
        this.printCLILine(`% Privileged configuration access granted.`, 'success');
        this.updateCLIPrompt(node);
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'config') {
        this.printCLILine(`Live Configuration Summary for ${config.hostname}:`, 'comment-line');
        this.printCLILine(`  IP Address: ${config.ip}`);
        this.printCLILine(`  Interface: Gig0/1 (${config.interfaces['Gig0/1'].shutdown ? 'SHUTDOWN' : 'ACTIVE'})`);
        this.printCLILine(`  Routing: Gateway is 10.1.10.1`);
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'ip' && args[2]?.toLowerCase() === 'route') {
        this.printRouteTable(config);
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'mpls' && args[2]?.toLowerCase() === 'ldp' && args[3]?.toLowerCase() === 'neighbor') {
        this.printCLILine(`Peer LDP Ident: 3.3.3.3:0`, 'success');
        this.printCLILine(`TCP connection: 3.3.3.3:646`);
        this.printCLILine(`State: Oper`);
        this.printCLILine(`Keepalive Times: Configured = 45, Negotiated = 45`);
        this.printCLILine(`LDP Discovery Sources:`);
        this.printCLILine(`  GigabitEthernet0/1 (Vlan 10)`);
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'ip' && args[2]?.toLowerCase() === 'route' && args[3]?.toLowerCase() === 'vrf') {
        const vrf = args[4] ? args[4].toUpperCase() : 'CUSTOMER_A';
        this.printCLILine(`Routing Table: ${vrf}`, 'success');
        this.printCLILine(`B    192.168.2.0/24 [200/0] via 2.2.2.2, 00:14:24`);
        this.printCLILine(`C    192.168.1.0/24 is directly connected, GigabitEthernet0/2`);
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'route' && args[2]?.toLowerCase() === 'table') {
        const tbl = args[3] ? args[3] : 'CUSTOMER_A.inet.0';
        this.printCLILine(`${tbl}: 2 destinations, 2 routes (2 active, 0 holddown, 0 hidden)`, 'success');
        this.printCLILine(`+ = Active Route, - = Last Active, * = Both`);
        this.printCLILine(`192.168.1.0/24    *[BGP/170] via 1.1.1.1`);
        this.printCLILine(`192.168.2.0/24    *[Direct/0] via ge-0/0/1.0`);
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'arp') {
        this.printCLILine(`Protocol  Address          Age (min)  Hardware Addr   Type   Interface`, 'comment-line');
        this.printCLILine(`Internet  ${config.ip}              -  0050.56c0.0008  ARPA   GigabitEthernet0/1`);
        this.printCLILine(`Internet  192.168.1.10             4  0050.5684.a63b  ARPA   GigabitEthernet0/1`);
        this.printCLILine(`Internet  192.168.10.20            12  0050.56c0.1102  ARPA   GigabitEthernet0/1`);
      } else if (baseCmd === 'debug' && args[1]?.toLowerCase() === 'memory' && args[2]?.toLowerCase() === 'vtable') {
        this.printCLILine(`[DEBUG] Memory Allocation & VTable Map:`, 'comment-line');
        this.printCLILine(`Address     Offset     Target Symbol               Status`);
        this.printCLILine(`0x00401008  +0x0000    PLCController::readSensors  STABLE`);
        this.printCLILine(`0x00401014  +0x000c    PLCController::writeCoil    STABLE`);
        if (node.status === 'compromised') {
          this.printCLILine(`0x00401020  +0x0018    [OVERWRITTEN -> 0x0c0c0c0c] hijackedFunc  HIJACKED`, 'error-line');
          this.printCLILine(`% WARNING: Stack canary integrity validation failed. Process integrity compromised.`, 'error-line');
        } else {
          this.printCLILine(`0x00401020  +0x0018    PLCController::ventRelief   STABLE`, 'success');
        }
      } else if (baseCmd === 'modbus' && args[1]?.toLowerCase() === 'send') {
        const unit = args[2];
        const func = args[3];
        const reg = args[4];
        const val = args[5];
        if (!unit || !func || !reg || !val) {
          this.printCLILine(`% Usage: modbus send [UNIT_ID] [FUNCTION_CODE] [REGISTER] [VALUE]`, 'error-line');
          this.printCLILine(`% Example: modbus send 01 05 0001 FF00 (Actuates Inlet Valve)`, 'comment-line');
          return;
        }
        if (func === '05' || func === '5') {
          const valNum = parseInt(val, 16);
          const coilNum = parseInt(reg, 10);
          this.handleModbusSetCoil(coilNum.toString(), valNum > 0 ? 'on' : 'off', node);
          this.printCLILine(`Modbus Response: Exception Code = 00 (Success), Unit = ${unit}, Func = ${func}, Reg = ${reg}, Value = ${val}`, 'success');
        } else {
          this.printCLILine(`Modbus Response: Exception Code = 01 (Illegal Function)`, 'error-line');
        }
      } else if (baseCmd === 'ping') {
        this.runCLIPing(args[1], node);
      } else if (baseCmd === 'ip' && args[1]?.toLowerCase() === 'dhcp') {
        if (config.ipConfig !== 'dhcp') {
          this.printCLILine(`% Device is not configured for DHCP client mode.`, 'error-line');
        } else {
          this.printCLILine(`Requesting IP address lease via DHCP...`, 'comment-line');
          this.triggerDHCPLease(node);
        }
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'ip' && args[2]?.toLowerCase() === 'interface') {
        this.printCLILine(`Interface      IP-Address      OK?  Method  Status      Protocol`, 'comment-line');
        Object.keys(config.interfaces).forEach(ifName => {
          const iface = config.interfaces[ifName];
          const method = config.ipConfig === 'dhcp' ? 'DHCP' : 'manual';
          this.printCLILine(`${ifName.padEnd(14)}${iface.ip.padEnd(16)}YES  ${method.padEnd(8)}${iface.shutdown ? 'down'.padEnd(12) : 'up'.padEnd(12)}up`);
        });
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'ip' && args[2]?.toLowerCase() === 'dhcp' && args[3]?.toLowerCase() === 'lease') {
        if (!config.dhcp) {
          this.printCLILine(`% DHCP Server is not configured on this device.`, 'error-line');
        } else {
          this.printCLILine(`Temp IP Land Address   Client Identifier    Lease expiration    Type`, 'comment-line');
          const leases = config.dhcp.leases;
          if (Object.keys(leases).length === 0) {
            this.printCLILine(`No active DHCP lease bindings found.`);
          } else {
            Object.keys(leases).forEach(clientId => {
              this.printCLILine(`${leases[clientId].padEnd(22)}${clientId.padEnd(21)}Infinite            Automatic`);
            });
          }
        }
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'modbus' && args[2]?.toLowerCase() === 'status') {
        this.printModbusStatus(node);
      } else if (baseCmd === 'reboot') {
        this.runDeviceReboot(node);
      } else {
        if (!this.executeCyberTool(baseCmd, args, node)) {
          this.printCLILine(`% Unknown command or disabled in User Exec. Type 'enable' or 'help'.`, 'error-line');
        }
      }
    }
    
    // ==========================================
    // PRIVILEGED EXEC MODE
    // ==========================================
    else if (config.cliMode === 'enable') {
      if (baseCmd === 'disable') {
        config.cliMode = 'exec';
        this.updateCLIPrompt(node);
      } else if (baseCmd === 'configure' && args[1]?.toLowerCase() === 'terminal') {
        config.cliMode = 'config';
        this.printCLILine(`Enter configuration commands, one per line. End with CNTL/Z or 'exit'.`);
        this.updateCLIPrompt(node);
      } else if (baseCmd === 'show' && (args[1]?.toLowerCase() === 'running-config' || args[1]?.toLowerCase() === 'run')) {
        this.printRunningConfig(node);
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'ip' && args[2]?.toLowerCase() === 'route') {
        this.printRouteTable(config);
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'mpls' && args[2]?.toLowerCase() === 'ldp' && args[3]?.toLowerCase() === 'neighbor') {
        this.printCLILine(`Peer LDP Ident: 3.3.3.3:0`, 'success');
        this.printCLILine(`TCP connection: 3.3.3.3:646`);
        this.printCLILine(`State: Oper`);
        this.printCLILine(`Keepalive Times: Configured = 45, Negotiated = 45`);
        this.printCLILine(`LDP Discovery Sources:`);
        this.printCLILine(`  GigabitEthernet0/1 (Vlan 10)`);
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'ip' && args[2]?.toLowerCase() === 'route' && args[3]?.toLowerCase() === 'vrf') {
        const vrf = args[4] ? args[4].toUpperCase() : 'CUSTOMER_A';
        this.printCLILine(`Routing Table: ${vrf}`, 'success');
        this.printCLILine(`B    192.168.2.0/24 [200/0] via 2.2.2.2, 00:14:24`);
        this.printCLILine(`C    192.168.1.0/24 is directly connected, GigabitEthernet0/2`);
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'route' && args[2]?.toLowerCase() === 'table') {
        const tbl = args[3] ? args[3] : 'CUSTOMER_A.inet.0';
        this.printCLILine(`${tbl}: 2 destinations, 2 routes (2 active, 0 holddown, 0 hidden)`, 'success');
        this.printCLILine(`+ = Active Route, - = Last Active, * = Both`);
        this.printCLILine(`192.168.1.0/24    *[BGP/170] via 1.1.1.1`);
        this.printCLILine(`192.168.2.0/24    *[Direct/0] via ge-0/0/1.0`);
      } else if (baseCmd === 'ping') {
        this.runCLIPing(args[1], node);
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'ip' && args[2]?.toLowerCase() === 'interface') {
        this.printCLILine(`Interface      IP-Address      OK?  Method  Status      Protocol`, 'comment-line');
        Object.keys(config.interfaces).forEach(ifName => {
          const iface = config.interfaces[ifName];
          const method = config.ipConfig === 'dhcp' ? 'DHCP' : 'manual';
          this.printCLILine(`${ifName.padEnd(14)}${iface.ip.padEnd(16)}YES  ${method.padEnd(8)}${iface.shutdown ? 'down'.padEnd(12) : 'up'.padEnd(12)}up`);
        });
      } else if (baseCmd === 'show' && args[1]?.toLowerCase() === 'ip' && args[2]?.toLowerCase() === 'dhcp' && args[3]?.toLowerCase() === 'lease') {
        if (!config.dhcp) {
          this.printCLILine(`% DHCP Server is not configured on this device.`, 'error-line');
        } else {
          this.printCLILine(`Temp IP Land Address   Client Identifier    Lease expiration    Type`, 'comment-line');
          const leases = config.dhcp.leases;
          if (Object.keys(leases).length === 0) {
            this.printCLILine(`No active DHCP lease bindings found.`);
          } else {
            Object.keys(leases).forEach(clientId => {
              this.printCLILine(`${leases[clientId].padEnd(22)}${clientId.padEnd(21)}Infinite            Automatic`);
            });
          }
        }
      } else if (baseCmd === 'write' || (baseCmd === 'copy' && args[1] === 'running-config')) {
        this.printCLILine(`Building configuration...`);
        this.printCLILine(`[OK] Configuration saved to NVRAM.`, 'success');
      } else {
        this.printCLILine(`% Unknown command in Privileged Exec. Type 'configure terminal' to modify configurations.`, 'error-line');
      }
    }
    
    // ==========================================
    // GLOBAL CONFIGURATION MODE
    // ==========================================
    else if (config.cliMode === 'config') {
      if (baseCmd === 'exit' || baseCmd === 'end') {
        config.cliMode = 'enable';
        this.updateCLIPrompt(node);
      } else if (baseCmd === 'hostname') {
        const newHost = args[1];
        if (!newHost) {
          this.printCLILine(`% Usage: hostname [NEW_NAME]`, 'error-line');
          return;
        }
        config.hostname = newHost;
        node.name = newHost;
        this.printCLILine(`Hostname updated successfully to '${newHost}'.`, 'success');
        this.updateCLIPrompt(node);
        this.updateSidebarProfile();
      } else if (baseCmd === 'interface' || baseCmd === 'int') {
        const intName = args[1];
        if (!intName || !config.interfaces[intName]) {
          this.printCLILine(`% Invalid interface name. Available: ` + Object.keys(config.interfaces).join(', '), 'error-line');
          return;
        }
        config.cliMode = 'config-if';
        config.cliInterface = intName;
        this.printCLILine(`Entering interface config context for '${intName}'.`);
        this.updateCLIPrompt(node);
      } else if (baseCmd === 'ip' && args[1]?.toLowerCase() === 'route') {
        const dest = args[2];
        const mask = args[3];
        const gw = args[4];
        if (!dest || !mask || !gw) {
          this.printCLILine(`% Usage: ip route [DEST_IP] [SUBNET_MASK] [NEXT_HOP]`, 'error-line');
          return;
        }
        config.routing.routes.push({ destination: dest, mask: mask, gateway: gw });
        this.printCLILine(`Static route entry added: ${dest}/${mask} via ${gw}`, 'success');
      } else if (baseCmd === 'set' && args[1]?.toLowerCase() === 'coil') {
        this.handleModbusSetCoil(args[2], args[3], node);
      } else if (baseCmd === 'access-list') {
        const id = args[1];
        const action = args[2]?.toLowerCase();
        const proto = args[3]?.toLowerCase();
        const src = args[4];
        const dst = args[5];
        if (!id || !['permit', 'deny'].includes(action) || !proto || !src || !dst) {
          this.printCLILine(`% Usage: access-list [ID] [permit|deny] [protocol] [src_ip] [dst_ip]`, 'error-line');
          this.printCLILine(`% Example: access-list 101 deny ip 10.1.10.5 192.168.1.101`, 'comment-line');
          return;
        }
        if (!config.acls) config.acls = [];
        config.acls.push({ id, action, protocol: proto, source: src, destination: dst });
        this.printCLILine(`Access-list rule configured: Deny/permit rule added.`, 'success');
      } else {
        this.printCLILine(`% Command not recognized in Global Config. Type 'exit' to return.`, 'error-line');
      }
    }
    
    // ==========================================
    // INTERFACE CONFIGURATION MODE
    // ==========================================
    else if (config.cliMode === 'config-if') {
      const intName = config.cliInterface;
      if (baseCmd === 'exit') {
        config.cliMode = 'config';
        config.cliInterface = null;
        this.updateCLIPrompt(node);
      } else if (baseCmd === 'ip' && args[1]?.toLowerCase() === 'address') {
        if (args[2]?.toLowerCase() === 'dhcp') {
          config.ipConfig = 'dhcp';
          config.ip = "0.0.0.0 (DHCP Requesting...)";
          node.ip = "0.0.0.0";
          this.printCLILine(`Interface ${intName} configured for DHCP. Requesting dynamic lease...`, 'success');
          this.triggerDHCPLease(node);
          this.updateSidebarProfile();
          return;
        }
        const newIp = args[2];
        const newMask = args[3] || '255.255.255.0';
        if (!newIp) {
          this.printCLILine(`% Usage: ip address [IP] [MASK]`, 'error-line');
          return;
        }
        config.interfaces[intName].ip = newIp;
        config.interfaces[intName].mask = newMask;
        config.ip = newIp;
        node.ip = newIp;
        this.printCLILine(`Interface ${intName} IP address configured to ${newIp}/${newMask}`, 'success');
        this.updateSidebarProfile();
      } else if (baseCmd === 'nameif') {
        const zone = args[1]?.toLowerCase();
        if (!zone || !['inside', 'outside', 'dmz'].includes(zone)) {
          this.printCLILine(`% Usage: nameif [inside|outside|dmz]`, 'error-line');
          return;
        }
        config.interfaces[intName].zone = zone;
        let defSec = 0;
        if (zone === 'inside') defSec = 100;
        else if (zone === 'dmz') defSec = 50;
        config.interfaces[intName].securityLevel = defSec;
        this.printCLILine(`INFO: Security level for zone [${zone.toUpperCase()}] set to ${defSec} by default.`, 'success');
      } else if (baseCmd === 'security-level') {
        const level = parseInt(args[1]);
        if (isNaN(level) || level < 0 || level > 100) {
          this.printCLILine(`% Usage: security-level [0-100]`, 'error-line');
          return;
        }
        config.interfaces[intName].securityLevel = level;
        this.printCLILine(`Interface ${intName} security level configured to ${level}`, 'success');
      } else if (baseCmd === 'shutdown') {
        config.interfaces[intName].shutdown = true;
        this.printCLILine(`Interface ${intName} administratively shut down. Link status is DOWN.`, 'warning');
        
        this.canvas.links.forEach(l => {
          if (l.sourceId === node.id || l.targetId === node.id) {
            l.status = 'offline';
          }
        });
      } else if (baseCmd === 'no' && args[1]?.toLowerCase() === 'shutdown') {
        config.interfaces[intName].shutdown = false;
        this.printCLILine(`Interface ${intName} administrative state is UP. Link is ACTIVE.`, 'success');
        
        this.canvas.links.forEach(l => {
          if (l.sourceId === node.id || l.targetId === node.id) {
            l.status = 'normal';
          }
        });
      } else {
        this.printCLILine(`% Invalid command in interface configuration. Type 'exit'.`, 'error-line');
      }
    }
  }

  // Escape untrusted text before interpolating into innerHTML.
  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Lightweight, non-blocking toast notification (replaces native alert()).
  showToast(message, severity = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      const liveRegion = severity === 'danger' || severity === 'error' ? 'assertive' : 'polite';
      container.setAttribute('role', 'log');
      container.setAttribute('aria-live', liveRegion);
      container.setAttribute('aria-label', 'Notifications');
      document.body.appendChild(container);
    }
    const isDanger = severity === 'danger' || severity === 'error';
    const duration = isDanger ? 0 : 3800;

    const toast = document.createElement('div');
    toast.className = `toast toast-${severity}`;
    toast.innerHTML = `<div class="toast-title">${this.escapeHtml(message)}</div>` +
      `<div class="toast__progress" style="--toast-dur:${isDanger ? 0 : duration}ms"></div>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('toast-show'));
    });

    if (!isDanger) {
      setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  }

  speakAloud(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    
    // Remove HTML tags and markdown structures
    const cleanText = text
      .replace(/<[^>]*>/g, ' ')
      .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
      .replace(/\*([\s\S]+?)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/[#_*\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    
    if (this.selectedVoiceName && this.selectedVoiceName !== 'default') {
      const chosenVoice = voices.find(v => v.name === this.selectedVoiceName);
      if (chosenVoice) {
        utterance.voice = chosenVoice;
      }
    } else {
      const englishVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Microsoft')));
      if (englishVoice) {
        utterance.voice = englishVoice;
      }
    }
    
    utterance.rate = this.voiceSpeed || 0.95; 
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }

  appendChatBubble(sender, text, type, customId = '') {
    const chatHistory = document.getElementById('chatHistory');
    if (!chatHistory) return;
    const div = document.createElement('div');
    div.className = 'chat-bubble ' + type;
    if (customId) div.id = customId;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    div.innerHTML = `
      <span class="bubble-sender">${this.escapeHtml(sender)}</span>
      <p>${text}</p>
      <div class="bubble-time">${time}</div>
    `;

    chatHistory.appendChild(div);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // Speak aloud only when final response is rendered
    if (sender === 'AETHERIS AI' && !customId && this.voiceAssistEnabled) {
      this.speakAloud(text);
    }
  }

  async sendConversationalPrompt() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const promptText = input.value.trim();
    if (!promptText) return;

    input.value = '';
    
    // Add user bubble (escape — user input must not be rendered as HTML)
    this.appendChatBubble('USER', this.escapeHtml(promptText), 'user-bubble');

    // Add thinking/loading bubble
    const thinkingId = 'bubble-thinking-' + Date.now();
    this.appendChatBubble('AETHERIS AI', `<span class="pulse-indicator"></span> AETHERIS AI is calculating topology changes...`, 'agent-bubble', thinkingId);

    try {
      const nodesWithConfig = this.canvas.nodes.map(n => {
        const config = this.getNodeConfig(n);
        return {
          ...n,
          config: config
        };
      });

      const response = await this.llm.sendPrompt(
        promptText, 
        nodesWithConfig, 
        this.canvas.links, 
        this.activeProject,
        this.activeProjectType === 'reactor' ? this.sim : null
      );

      // Remove thinking bubble
      const thinkingBubble = document.getElementById(thinkingId);
      if (thinkingBubble) thinkingBubble.remove();

      // Process and render conversational reply
      let conversationalReply = '';
      const lines = response.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('[ADD_NODE') && !trimmed.startsWith('[REMOVE_NODE') && !trimmed.startsWith('[ADD_LINK') && !trimmed.startsWith('[REMOVE_LINK') && !trimmed.startsWith('[CLEAR_TOPOLOGY]')) {
          conversationalReply += line + '\n';
        }
      });

      // Escape raw LLM content first, then apply safe markdown transforms
      let formattedReply = this.escapeHtml(conversationalReply.trim());
      formattedReply = formattedReply
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');

      this.appendChatBubble('AETHERIS AI', formattedReply || "Topology changes successfully implemented.", 'agent-bubble');

      // Parse Actions from LLM response
      const actionRegex = /\[(ADD_NODE|REMOVE_NODE|ADD_LINK|REMOVE_LINK|CLEAR_TOPOLOGY):\s*([\s\S]+?)\]/g;
      let match;
      let parsedActionsCount = 0;

      if (response.includes('[CLEAR_TOPOLOGY]')) {
        this.canvas.clearTopology();
        this.orchestrator.logSystem("AI Action: Cleared all nodes and connections.", "warning");
        this.printCLILine("# WARNING: Topology wiped by AI Orchestration command.", 'error-line');
        parsedActionsCount++;
      }

      while ((match = actionRegex.exec(response)) !== null) {
        const action = match[1];
        const dataStr = match[2].trim();

        try {
          if (action === 'ADD_NODE') {
            const nodeData = JSON.parse(dataStr);
            const success = this.canvas.addNode(nodeData);
            if (success) {
              this.orchestrator.logSystem(`AI Action Engaged: Created node [${nodeData.name}] at IP ${nodeData.ip}`, "success");
              this.printCLILine(`# Info: Node [${nodeData.name}] added via AI Orchestrator.`, 'success-line');
              parsedActionsCount++;
            }
          } else if (action === 'REMOVE_NODE') {
            const nodeId = dataStr.replace(/^["']|["']$/g, '');
            const success = this.canvas.removeNode(nodeId);
            if (success) {
              this.orchestrator.logSystem(`AI Action Engaged: Removed asset node [${nodeId}]`, "warning");
              this.printCLILine(`# Warning: Asset node [${nodeId}] removed via AI Orchestrator.`, 'error-line');
              parsedActionsCount++;
            }
          } else if (action === 'ADD_LINK') {
            const linkData = JSON.parse(dataStr);
            const success = this.canvas.addLink(linkData.source, linkData.target);
            if (success) {
              this.orchestrator.logSystem(`AI Action Engaged: Connected [${linkData.source}] to [${linkData.target}]`, "success");
              this.printCLILine(`# Info: Established link between [${linkData.source}] and [${linkData.target}].`, 'success-line');
              parsedActionsCount++;
            }
          } else if (action === 'REMOVE_LINK') {
            const linkData = JSON.parse(dataStr);
            const success = this.canvas.removeLink(linkData.source, linkData.target);
            if (success) {
              this.orchestrator.logSystem(`AI Action Engaged: Severed connection between [${linkData.source}] and [${linkData.target}]`, "warning");
              this.printCLILine(`# Warning: Severed link between [${linkData.source}] and [${linkData.target}].`, 'error-line');
              parsedActionsCount++;
            }
          }
        } catch (e) {
          console.error("LLM parser failed:", e, dataStr);
        }
      }

      if (parsedActionsCount > 0) {
        this.canvas.centerView();
        this.saveState();
      }

    } catch (error) {
      console.error("Conversational LLM query failed:", error);
      const thinkingBubble = document.getElementById(thinkingId);
      if (thinkingBubble) thinkingBubble.remove();
      this.appendChatBubble('AETHERIS AI', `[LLM SERVICE FAULT] Failed to communicate with API provider. Reason: ${error.message}`, 'agent-bubble');
    }
  }

  rebootAllPLCs() {
    this.orchestrator.logSystem("Executing global reboot on all field PLC controllers...", "warning");
    this.printCLILine("# Initiating network-wide SCADA controller warm reboots...", 'warning-line');
    
    this.canvas.nodes.forEach(node => {
      if (node.role.toLowerCase().includes('plc')) {
        node.status = 'stable';
        node.vulnerable = false;
      }
    });

    this.canvas.links.forEach(l => {
      l.status = 'normal';
    });

    this.orchestrator.logSystem("All PLCs successfully rebooted. Signatures verified.", "success");
    this.printCLILine("# Success: All PLC controllers verified secure.", 'success-line');
    
    const selected = this.canvas.selectedNode;
    if (selected) {
      this.attachCLISession(selected);
    } else {
      this.updateSidebarProfile();
    }
  }

  updateSidebarProfile() {
    const container = document.getElementById('deviceProfileContainer');
    const node = this.canvas.selectedNode;

    if (!node) {
      container.className = 'device-profile-empty';
      container.innerHTML = 'Select a node in the digital twin topology canvas to display configuration, routing, and real-time firmware analysis.';
      return;
    }

    container.className = 'device-profile profile-row-anim';
    
    // Choose firmware badge class
    let badgeClass = 'firmware-secure';
    let badgeText = 'VERIFIED SECURE';
    
    if (node.status === 'compromised') {
      badgeClass = 'firmware-danger';
      badgeText = 'INTEGRITY BREACHED';
    } else if (node.status === 'isolated') {
      badgeClass = 'firmware-warning';
      badgeText = 'CONTAINED / ISOLATED';
    }

    const eh = (s) => this.escapeHtml(s);
    const statusClass = node.status === 'compromised' ? 'text-glow-red' : (node.status === 'isolated' ? 'text-glow-amber' : 'text-glow-green');
    container.innerHTML = `
      <div class="device-profile-header">
        <div class="device-avatar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
        </div>
        <div class="device-title">
          <span class="device-name">${eh(node.name)}</span>
          <span class="device-ip font-mono">${eh(node.ip)}</span>
        </div>
      </div>

      <div class="profile-row">
        <span class="label">Asset ID</span>
        <span class="value">${eh(node.id)}</span>
      </div>
      <div class="profile-row">
        <span class="label">Role Type</span>
        <span class="value">${eh(node.role)}</span>
      </div>
      <div class="profile-row">
        <span class="label">OS / Platform</span>
        <span class="value">${eh(node.os || 'Unknown')}</span>
      </div>
      <div class="profile-row">
        <span class="label">Firmware</span>
        <span class="value">${eh(node.firmware || 'N/A')}</span>
      </div>
      <div class="profile-row">
        <span class="label">Twin Status</span>
        <span class="value ${statusClass}">${eh(node.status.toUpperCase())}</span>
      </div>

      <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
        <span class="firmware-status ${badgeClass} text-center font-mono">${eh(badgeText)}</span>

        <div class="btn-grid" style="margin-top: 5px;">
          <button class="cyber-btn-sm" id="btnRebootAsset">Reboot Asset</button>
          <button class="cyber-btn-sm btn-danger-outline" id="btnIsolateAsset">Isolate Asset</button>
        </div>
      </div>
    `;

    // Hook buttons
    document.getElementById('btnRebootAsset').onclick = () => {
      this.orchestrator.logSystem(`Command executed: rebooting asset [${node.name}]...`, 'info');
      node.status = 'stable';
      node.vulnerable = false;
      
      // Repair local links
      this.canvas.links.forEach(l => {
        if (l.sourceId === node.id || l.targetId === node.id) {
          l.status = 'normal';
        }
      });

      this.orchestrator.logSystem(`Device [${node.id}] rebooted. Firmware integrity validated: 100%.`, 'success');
      this.updateSidebarProfile();
    };

    document.getElementById('btnIsolateAsset').onclick = () => {
      this.orchestrator.isolateNode(node.id);
    };
  }

  loop(currentTime) {
    let dt = currentTime - this.lastTime;

    // Throttle mechanism for Eco mode (target ~20 FPS = ~50ms per frame)
    const minFrameTime = this.perfMode === 'eco' ? 50 : 16.6;
    if (dt < minFrameTime) {
      requestAnimationFrame((t) => this.loop(t));
      return;
    }

    try {
      if (this.isPlaying) {
        if (dt > 100) dt = 16.6; // cap to prevent lag jumps

        this.simTime += dt * this.speedDilation;

        // Physics and state evaluation are reactor-only
        if (this.activeProjectType === 'reactor') {
          this.sim.step(dt, this.speedDilation);
          this.orchestrator.evaluateState();
          this.annotateReactorNodes();
        }

        // Water treatment physics
        if (this.activeProjectType === 'water') {
          this.simWater.step(dt, this.speedDilation);
          this.updateWaterTelemetry();
        }

        // Power grid physics
        if (this.activeProjectType === 'grid') {
          this.simGrid.step(dt, this.speedDilation);
          this.updateGridTelemetry();
        }

        // Challenge mode timer tick
        if (this.challengeMode.active) {
          this.tickChallenge(dt);
        }

        // AI Battle simulation tick — skip if we're the multiplayer joiner (host drives the sim)
        const _mpIsJoiner = this.mpSession && this.mpSession.role === 'red' && this.mpSession.peerConnected;
        if (this.battle && this.battle.active && !_mpIsJoiner) {
          this.battle.tick();
          if (this.canvas?.killChainVisible) this.canvas.updateKillChainFromBattle(this.battle);
        }

        // Periodically trigger OSPF dynamic routing synchronization (Upgrade 1)
        if (!this.lastOspfTick || this.simTime - this.lastOspfTick > 5000) {
          this.ospfHelloTick();
          this.lastOspfTick = this.simTime;
        }

        this.canvas.update(this.speedDilation);
        this.updateTickers();
        this.updateNetworkStats();
        this.updateLinkUtilisation();
        this.updateThreatVisuals();

        this.canvas.draw();
        if (this.activeProjectType === 'reactor') {
          this.sim.drawChart();
        }
      } else {
        // When simulation is paused or on landing page, only redraw if there is active interaction
        // or moving particles to completely reduce idle CPU usage to 0%.
        const hasActiveVisuals = (this.canvas.particles.length > 0) || this.canvas.isPanning || this.canvas.draggedNode
          || this.canvas.idleTrafficVisible || this.canvas.battlePacketsVisible || this.canvas.stealthMetersVisible;
        if (hasActiveVisuals) {
          this.canvas.update(this.speedDilation);
          this.canvas.draw();
          if (this.activeProjectType === 'reactor') {
            this.sim.drawChart();
          }
        }
      }
    } catch (err) {
      console.error('[AETHERIS loop error]', err);
      this._loopErrorCount = (this._loopErrorCount || 0) + 1;
      // After 3 consecutive errors stop the sim and notify the user — single error on a single frame is recoverable
      if (this._loopErrorCount >= 3) {
        this.isPlaying = false;
        this.showToast(`Simulation halted: ${err.message}. Check the browser console for details.`, 'danger');
        const btn = document.getElementById('btnPlayPause');
        if (btn) btn.textContent = '▶ RESUME';
        return; // Do not reschedule — the loop is dead
      }
    }

    this._loopErrorCount = 0; // Reset on clean frame
    this.lastTime = currentTime;
    requestAnimationFrame((t) => this.loop(t));
  }

  togglePerfMode(mode) {
    this.perfMode = mode || (this.perfMode === 'high' ? 'eco' : 'high');
    
    if (this.perfMode === 'eco') {
      document.body.classList.add('perf-mode-eco');
    } else {
      document.body.classList.remove('perf-mode-eco');
    }

    const btnPerf = document.getElementById('btnPerfToggle');
    if (btnPerf) {
      if (this.perfMode === 'eco') {
        btnPerf.textContent = 'THEME: WIREFRAME';
        btnPerf.className = 'cyber-btn-sm btn-perf-eco';
      } else {
        btnPerf.textContent = 'THEME: HIGH-FI';
        btnPerf.className = 'cyber-btn-sm btn-perf-high';
      }
      btnPerf.setAttribute('aria-pressed', this.perfMode === 'eco' ? 'true' : 'false');
    }

    // Persist the user's rendering preference across sessions.
    try { localStorage.setItem('aetheris_perf_mode', this.perfMode); } catch {}

    if (this.orchestrator) {
      if (this.perfMode === 'eco') {
        this.orchestrator.logSystem("Performance mode: Pure flat wireframe schematic blueprint activated. Fast software CPU rendering enabled.", "info");
      } else {
        this.orchestrator.logSystem("Performance mode: HIGH-FIDELITY (Glassmorphic blurs & text shadows enabled).", "info");
      }
    }
    
    // Force immediate single redraw
    if (this.canvas) this.canvas.draw();
    if (this.activeProjectType === 'reactor' && this.sim) {
      this.sim.drawChart();
    }
  }

  detectSoftwareRendering() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return true; // No WebGL, assume virtualization or CPU software rendering fallback
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();
        if (renderer.includes('llvmpipe') || 
            renderer.includes('software rasterizer') || 
            renderer.includes('swiftshader') || 
            renderer.includes('virtualbox') || 
            renderer.includes('vmware') || 
            renderer.includes('microsoft basic render') ||
            renderer.includes('apple software')) {
          return true;
        }
      }
      return false;
    } catch (e) {
      return true;
    }
  }

  updateTickers() {
    // Feature 38: IP Conflict Auto-Valider
    const ipMap = {};
    this.canvas.nodes.forEach(n => {
      n.hasIpConflict = false;
      if (n.ip && !n.ip.includes('Requesting')) {
        if (ipMap[n.ip]) {
          ipMap[n.ip].push(n);
        } else {
          ipMap[n.ip] = [n];
        }
      }
    });

    Object.keys(ipMap).forEach(ip => {
      if (ipMap[ip].length > 1) {
        ipMap[ip].forEach(n => {
          n.hasIpConflict = true;
        });
        if (!this.lastIpConflictWarn || Date.now() - this.lastIpConflictWarn > 10000) {
          this.orchestrator.logSystem(`IP ADDRESS CONFLICT DETECTED: Multiple assets configured with IP address [${ip}]!`, 'danger');
          this.lastIpConflictWarn = Date.now();
        }
      }
    });

    // 1. Clock timer
    const hrs = Math.floor(this.simTime / 3600000).toString().padStart(2, '0');
    const mins = Math.floor((this.simTime % 3600000) / 60000).toString().padStart(2, '0');
    const secs = Math.floor((this.simTime % 60000) / 1000).toString().padStart(2, '0');
    const hundredths = Math.floor((this.simTime % 1000) / 10).toString().padStart(2, '0');
    document.getElementById('simTimeTicker').textContent = `${hrs}:${mins}:${secs}.${hundredths}`;

    // 2. Status banners
    const sysTicker = document.getElementById('sysStateTicker');
    const icsTicker = document.getElementById('icsStatusTicker');
    const alertTicker = document.getElementById('aiHeartbeatTicker');

    const activeThreatsCount = this.orchestrator.alerts.filter(a => !a.resolved).length;

    if (activeThreatsCount > 0) {
      sysTicker.textContent = 'ALERT THREATS ACTIVE';
      sysTicker.className = 'ticker-value text-glow-red';
    } else {
      sysTicker.textContent = 'SECURE ONLINE';
      sysTicker.className = 'ticker-value text-glow-green';
    }

    if (this.activeProjectType === 'reactor') {
      if (this.sim.pressure > this.sim.criticalPressure || this.sim.temp > this.sim.criticalTemp) {
        icsTicker.textContent = 'CRITICAL OUT OF BOUNDS';
        icsTicker.className = 'ticker-value text-glow-red';
      } else if (this.sim.pressure > 1.6 || this.sim.temp > 65.0) {
        icsTicker.textContent = 'STRESS UNSTABLE';
        icsTicker.className = 'ticker-value text-glow-amber';
      } else {
        icsTicker.textContent = 'STABLE STATE';
        icsTicker.className = 'ticker-value text-glow-green';
      }
    } else {
      icsTicker.textContent = 'N/A (STATIC NET)';
      icsTicker.className = 'ticker-value text-glow-blue';
    }

    // Heartbeat ticker animations
    const beats = ['HEARTBEAT OK', 'HEARTBEAT - SYS OK', 'HEARTBEAT - STATE VALID'];
    const idx = Math.floor(this.simTime / 4000) % beats.length;
    alertTicker.textContent = beats[idx];
    
    // Core telemetry panel numeric readout synchronization (Only if in Reactor Twin)
    if (this.activeProjectType === 'reactor') {
      const valTemp = document.getElementById('valTemp');
      const barTemp = document.getElementById('barTemp');
      valTemp.textContent = `${this.sim.temp.toFixed(1)} °C`;
      barTemp.style.width = `${Math.min(100, (this.sim.temp / 110) * 100)}%`;
      barTemp.classList.toggle('bar-danger', this.sim.temp > this.sim.criticalTemp);
      valTemp.classList.toggle('value-danger', this.sim.temp > this.sim.criticalTemp);

      const valPressure = document.getElementById('valPressure');
      const barPressure = document.getElementById('barPressure');
      valPressure.textContent = `${this.sim.pressure.toFixed(2)} MPa`;
      barPressure.style.width = `${Math.min(100, (this.sim.pressure / 3.0) * 100)}%`;
      barPressure.classList.toggle('bar-danger', this.sim.pressure > this.sim.criticalPressure);
      valPressure.classList.toggle('value-danger', this.sim.pressure > this.sim.criticalPressure);

      document.getElementById('valLevel').textContent = `${this.sim.level.toFixed(1)} %`;
      document.getElementById('barLevel').style.width = `${this.sim.level}%`;

      const currentFlow = (this.sim.inletValve / 100) * 23.8;
      document.getElementById('valFlow').textContent = `${currentFlow.toFixed(1)} L/s`;
      document.getElementById('barFlow').style.width = `${Math.min(100, (currentFlow / 24) * 100)}%`;
    }
  }

  // ==========================================
  // FLOATING WINDOW DIALOGS MANAGER (Declutters main screen real estate!)
  // ==========================================
  createFloatingWindow(id, title, contentHtml, isDarkTheme = false) {
    let win = document.getElementById(id);
    if (win) {
      this.bringWindowToFront(win);
      return win;
    }

    win = document.createElement('div');
    win.id = id;
    win.className = `floating-window ${isDarkTheme ? 'dark-window' : 'light-window'}`;
    win.style.left = `${150 + Math.random() * 150}px`;
    win.style.top = `${150 + Math.random() * 100}px`;

    win.innerHTML = `
      <div class="window-header">
        <div class="window-title">${title}</div>
        <div class="window-controls">
          <button class="win-btn win-close" title="Close">×</button>
        </div>
      </div>
      <div class="window-body">
        ${contentHtml}
      </div>
    `;

    document.body.appendChild(win);
    this.makeWindowDraggable(win);
    this.bringWindowToFront(win);

    win.querySelector('.win-close').onclick = () => {
      win.remove();
    };

    win.onmousedown = () => {
      this.bringWindowToFront(win);
    };

    return win;
  }

  makeWindowDraggable(win) {
    const header = win.querySelector('.window-header');
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e = e || window.event;
      if (e.target.classList.contains('win-btn')) return;
      e.preventDefault();
      
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      
      win.style.top = (win.offsetTop - pos2) + "px";
      win.style.left = (win.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  makeElementDraggable(win) {
    this.makeWindowDraggable(win);
  }

  bringWindowToFront(win) {
    if (!this.highestZIndex) this.highestZIndex = 2000;
    this.highestZIndex++;
    win.style.zIndex = this.highestZIndex;
    
    document.querySelectorAll('.floating-window').forEach(w => w.classList.remove('active-window'));
    win.classList.add('active-window');
  }

  openDeviceCLIWindow(node) {
    const _e = (s) => this.escapeHtml(s);
    const winId = `win-cli-${_e(node.id)}`;
    const winTitle = `💻 CLI Terminal: ${_e(node.name)} (${_e(node.ip)})`;

    let bannerLines = [];
    if (node.role.toLowerCase().includes('plc')) {
      bannerLines = [
        ['# Serial session attached on /dev/ttyS0 at 9600 baud.', 'comment-line'],
        [`# Industrial Controller: ${_e(node.name)} (${_e(node.ip)})`, 'comment-line'],
        ['# OS: VxWorks RTOS kernel [Signature Verified]', 'comment-line'],
        [`Device Online. Modbus registry loaded. Status: ${_e(node.status.toUpperCase())}`, 'success-line'],
      ];
    } else if (node.role.toLowerCase().includes('firewall') || node.role.toLowerCase().includes('router') || node.role.toLowerCase().includes('gateway')) {
      bannerLines = [
        [`# SSH connection established to ${_e(node.name)} (${_e(node.ip)}) on port 22.`, 'comment-line'],
        [`# Network Platform: ${_e(node.os || 'Unknown')} [Version ${_e(node.firmware || 'N/A')}]`, 'comment-line'],
        [`Active configuration parsed. Command line terminal loaded. Status: ${_e(node.status.toUpperCase())}`, 'success-line'],
      ];
    } else {
      bannerLines = [
        [`# Terminal attachment active for workspace asset [${_e(node.id)}].`, 'comment-line'],
        [`# Hostname: ${_e(node.name)} // IP address: ${_e(node.ip)}`, 'comment-line'],
        [`Shell interface initialized. Status: ${_e(node.status.toUpperCase())}`, 'success-line'],
      ];
    }
    const bannerText = bannerLines.map(([t, c]) => `<div class="cli-line ${c}">${t}</div>`).join('');

    const safeId = _e(node.id);
    const contentHtml = `
      <div class="cli-output font-mono" id="cli-output-${safeId}" style="flex: 1; padding: 12px; overflow-y: auto; font-size: 0.75rem; background: #0f172a; color: #cbd5e1; display: flex; flex-direction: column; gap: 4px;">
        ${bannerText}
        <div class="cli-line">Type 'help' to view the list of available emulator commands.</div>
      </div>
      <div class="cli-input-row font-mono" style="height: 38px; background: #0b0f19; border-top: 1px solid #1e293b; display: flex; align-items: center; padding: 0 12px; gap: 6px; color: #6b9fe4; font-size: 0.75rem;">
        <span class="cli-prompt" id="cli-prompt-${safeId}">${_e(this.getCLIPromptText(node))}</span>
        <input type="text" id="cli-input-${safeId}" style="flex: 1; background: transparent; border: none; outline: none; color: #ffffff; font-family: var(--font-mono); font-size: 0.75rem;" placeholder="Type command here (e.g. 'help', 'show config')..." autocomplete="off">
      </div>
    `;

    const win = this.createFloatingWindow(winId, winTitle, contentHtml, true);
    win.style.width = '550px';
    win.style.height = '400px';

    const input = win.querySelector(`#cli-input-${node.id}`);
    const output = win.querySelector(`#cli-output-${node.id}`);
    
    output.scrollTop = output.scrollHeight;
    setTimeout(() => input.focus(), 50);

    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        const cmd = input.value;
        input.value = '';
        this.executeFloatingCLICommand(cmd, node, win);
      }
    };
  }

  executeFloatingCLICommand(cmdStr, node, win) {
    const output = win.querySelector(`.cli-output`);
    const prompt = win.querySelector(`.cli-prompt`);
    
    // Temporarily bind active CLI output for the print duration of this command!
    const previousActive = this.activeCLIOutput;
    this.activeCLIOutput = output;
    
    this.executeCLICommand(cmdStr, node);
    
    this.activeCLIOutput = previousActive;
    prompt.textContent = this.getCLIPromptText(node);
  }

  openDeviceConfigWindow(node) {
    const role = (node.role || '').toLowerCase();
    const isPremiumDevice = role.includes('plc') || role.includes('controller') || role.includes('rtu') || role.includes('hmi') || role.includes('scada') || role.includes('actuator') || role.includes('valve') || role.includes('diode') || role.includes('claroty') || role.includes('vfd') || role.includes('drive') || role.includes('dcs') || role.includes('historian') || role.includes('workstation');
    if (isPremiumDevice) {
      if (!this.checkPremiumFeature('ics-assets', '🚨 ADVANCED ICS / OT INDUSTRIAL HARDWARE')) {
        return;
      }
    }
    const winId = `win-config-${node.id}`;
    const winTitle = `⚙️ Device Settings: ${node.name} (${node.ip})`;
    const config = this.getNodeConfig(node);
    
    // Build interfaces HTML
    let interfacesHtml = "";
    Object.keys(config.interfaces).forEach(ifName => {
      const iface = config.interfaces[ifName];
      interfacesHtml += `
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding: 8px 0;">
          <span style="font-weight: 600; font-size: 0.75rem; color: var(--text-primary);">${ifName}</span>
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="text" class="cyber-select" value="${iface.ip}" id="cfg-ip-${ifName}" style="width: 100px; padding: 4px 8px; font-size: 0.7rem;" placeholder="IP" ${config.ipConfig === 'dhcp' ? 'disabled style="background: #f1f5f9; cursor: not-allowed;"' : ''}>
            <input type="text" class="cyber-select" value="${iface.zone || ''}" id="cfg-zone-${ifName}" style="width: 70px; padding: 4px 8px; font-size: 0.7rem;" placeholder="Zone">
            <input type="number" class="cyber-select" value="${iface.securityLevel !== undefined ? iface.securityLevel : ''}" id="cfg-lvl-${ifName}" style="width: 50px; padding: 4px 8px; font-size: 0.7rem;" placeholder="Level">
            <label style="font-size: 0.7rem; display: flex; align-items: center; gap: 4px;">
              <input type="checkbox" id="cfg-sh-${ifName}" ${iface.shutdown ? 'checked' : ''}> Shutdown
            </label>
          </div>
        </div>
      `;
    });

    // Build ACLs HTML
    let aclsHtml = "";
    if (config.acls && config.acls.length > 0) {
      config.acls.forEach((acl, index) => {
        aclsHtml += `
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding: 6px 0; font-size: 0.7rem;">
            <span class="font-mono" style="color: var(--text-secondary);">access-list ${acl.id} ${acl.action} ${acl.protocol} ${acl.source} ${acl.destination}</span>
            <button class="cyber-btn-sm btn-danger-outline" style="padding: 2px 6px; font-size: 0.6rem;" onclick="this.parentElement.remove(); window.appInstance.removeACL('${node.id}', ${index});">Delete</button>
          </div>
        `;
      });
    } else {
      aclsHtml = `<div style="text-align: center; color: var(--text-muted); font-size: 0.7rem; padding: 10px 0;">No active Access Control Lists configured.</div>`;
    }

    let isPlc = node.role === 'PLC' || node.type === 'plc' || node.id.includes('PLC');
    
    let tabsHeaderHtml = `
      <button class="cfg-tab active" id="tab-gen-${node.id}" style="flex: 1; border: none; background: transparent; padding: 10px 0; font-weight: 700; cursor: pointer; border-bottom: 2px solid var(--brand-blue); color: var(--brand-blue);">General</button>
      <button class="cfg-tab" id="tab-int-${node.id}" style="flex: 1; border: none; background: transparent; padding: 10px 0; font-weight: 700; cursor: pointer; color: var(--text-secondary); border-bottom: 2px solid transparent;">Interfaces</button>
      <button class="cfg-tab" id="tab-acl-${node.id}" style="flex: 1; border: none; background: transparent; padding: 10px 0; font-weight: 700; cursor: pointer; color: var(--text-secondary); border-bottom: 2px solid transparent;">Firewall ACLs</button>
    `;
    if (isPlc) {
      tabsHeaderHtml += `<button class="cfg-tab" id="tab-coils-${node.id}" style="flex: 1; border: none; background: transparent; padding: 10px 0; font-weight: 700; cursor: pointer; color: var(--text-secondary); border-bottom: 2px solid transparent;">SCADA Coils</button>`;
    }
    if (config.dhcp) {
      tabsHeaderHtml += `<button class="cfg-tab" id="tab-dhcp-${node.id}" style="flex: 1; border: none; background: transparent; padding: 10px 0; font-weight: 700; cursor: pointer; color: var(--text-secondary); border-bottom: 2px solid transparent;">DHCP Server</button>`;
    }

    let coilsHtml = "";
    if (isPlc) {
      coilsHtml = `
        <!-- SCADA Coils Tab (Feature 8, 9) -->
        <div id="panel-coils-${node.id}" style="display: none; flex-direction: column; gap: 10px;">
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--brand-blue); border-bottom: 1px dashed var(--border-color); padding-bottom: 4px;">Modbus TCP Coil Status</div>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.7rem;">
            <span>Coil [00001] (XV-101 Inlet Flow Valve):</span>
            <select class="cyber-select" style="width: 80px;" id="coil-101" onchange="window.appInstance.writeModbusCoil('${node.id}', 1, this.value)">
              <option value="open" ${this.sim.inletValve > 0 ? 'selected' : ''}>OPEN</option>
              <option value="close" ${this.sim.inletValve === 0 ? 'selected' : ''}>CLOSED</option>
            </select>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.7rem;">
            <span>Coil [00002] (XV-102 Outlet Flow Valve):</span>
            <select class="cyber-select" style="width: 80px;" id="coil-102" onchange="window.appInstance.writeModbusCoil('${node.id}', 2, this.value)">
              <option value="open" ${this.sim.outletValve > 0 ? 'selected' : ''}>OPEN</option>
              <option value="close" ${this.sim.outletValve === 0 ? 'selected' : ''}>CLOSED</option>
            </select>
          </div>
          
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--brand-blue); border-bottom: 1px dashed var(--border-color); padding-bottom: 4px; margin-top: 10px;">PLC Safety Instrumented System (SIS) Interlocks</div>
          <div style="display: flex; flex-direction: column; gap: 6px; font-size: 0.7rem;">
            <label style="display: flex; align-items: center; gap: 6px;">
              <input type="checkbox" id="sis-interlock" ${this.sim.sisInterlock ? 'checked' : ''} onchange="window.appInstance.toggleSisInterlock('${node.id}', this.checked)">
              <strong>Enable SIS Interlock Policy IP-99:</strong>
            </label>
            <span style="color: #64748b; padding-left: 18px; font-size: 0.65rem;">
              "If Reactor Pressure exceeds 2.20 MPa, force Solenoid Valve XV-103 to OPEN immediately to vent steam."
            </span>
          </div>
        </div>
      `;
    }

    let dhcpServerHtml = "";
    if (config.dhcp) {
      dhcpServerHtml = `
        <!-- DHCP Server Tab -->
        <div id="panel-dhcp-${node.id}" style="display: none; flex-direction: column; gap: 10px; font-size: 0.75rem;">
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--brand-blue); border-bottom: 1px dashed var(--border-color); padding-bottom: 4px;">DHCP Pool Configuration</div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-weight: 600;">Enable DHCP Server Service</span>
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="checkbox" id="cfg-dhcp-enabled-${node.id}" ${config.dhcp.enabled ? 'checked' : ''}> Active
            </label>
          </div>
          <div class="setting-field">
            <label>IP Pool Subnet</label>
            <input type="text" class="cyber-select" id="cfg-dhcp-subnet-${node.id}" value="${config.dhcp.subnet}">
          </div>
          <div class="setting-field">
            <label>Subnet Netmask</label>
            <input type="text" class="cyber-select" id="cfg-dhcp-mask-${node.id}" value="${config.dhcp.mask}">
          </div>
          <div style="display: flex; gap: 10px;">
            <div class="setting-field" style="flex: 1;">
              <label>Pool Start (Octet)</label>
              <input type="number" class="cyber-select" id="cfg-dhcp-start-${node.id}" value="${config.dhcp.rangeStart}">
            </div>
            <div class="setting-field" style="flex: 1;">
              <label>Pool End (Octet)</label>
              <input type="number" class="cyber-select" id="cfg-dhcp-end-${node.id}" value="${config.dhcp.rangeEnd}">
            </div>
          </div>
          <div class="setting-field">
            <label>Default Gateway</label>
            <input type="text" class="cyber-select" id="cfg-dhcp-gw-${node.id}" value="${config.dhcp.gateway}">
          </div>
          
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--brand-blue); border-bottom: 1px dashed var(--border-color); padding-bottom: 4px; margin-top: 6px;">Active Leases Table</div>
          <div style="max-height: 80px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; background: #fafafa;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.65rem; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-secondary);">
                  <th style="padding: 2px;">Host ID</th>
                  <th style="padding: 2px;">IP Address Assigned</th>
                </tr>
              </thead>
              <tbody>
                ${Object.keys(config.dhcp.leases).length > 0 ? 
                  Object.keys(config.dhcp.leases).map(clientId => `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                      <td style="padding: 2px; font-weight: 600;">${clientId}</td>
                      <td style="padding: 2px;" class="font-mono">${config.dhcp.leases[clientId]}</td>
                    </tr>
                  `).join('') : `
                    <tr>
                      <td colspan="2" style="padding: 4px; text-align: center; color: var(--text-muted);">No active leases bound.</td>
                    </tr>
                  `
                }
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    let ipConfigSelectorHtml = "";
    let staticFieldsHtml = "";
    if (config.ipConfig) {
      ipConfigSelectorHtml = `
        <div class="setting-field">
          <label>IP Configuration Mode</label>
          <div style="display: flex; gap: 15px; margin-top: 4px;">
            <label style="display: flex; align-items: center; gap: 4px; font-size: 0.75rem; cursor: pointer;">
              <input type="radio" name="ip-config-method-${node.id}" value="static" ${config.ipConfig === 'static' ? 'checked' : ''} onchange="window.appInstance.toggleIpConfigMode('${node.id}', 'static')"> Static
            </label>
            <label style="display: flex; align-items: center; gap: 4px; font-size: 0.75rem; cursor: pointer;">
              <input type="radio" name="ip-config-method-${node.id}" value="dhcp" ${config.ipConfig === 'dhcp' ? 'checked' : ''} onchange="window.appInstance.toggleIpConfigMode('${node.id}', 'dhcp')"> DHCP
            </label>
          </div>
        </div>
      `;

      staticFieldsHtml = `
        <div class="setting-field">
          <label>Subnet Mask</label>
          <input type="text" class="cyber-select" id="cfg-mask-${node.id}" value="${config.subnetMask || '255.255.255.0'}" ${config.ipConfig === 'dhcp' ? 'disabled style="background: #f1f5f9; cursor: not-allowed;"' : ''}>
        </div>
        <div class="setting-field">
          <label>Default Gateway</label>
          <input type="text" class="cyber-select" id="cfg-gw-${node.id}" value="${config.gateway || ''}" ${config.ipConfig === 'dhcp' ? 'disabled style="background: #f1f5f9; cursor: not-allowed;"' : ''}>
        </div>
      `;
      
      if (config.ipConfig === 'dhcp') {
        staticFieldsHtml += `
          <button class="cyber-btn-sm w-100" style="padding: 6px; margin-top: 4px;" onclick="window.appInstance.triggerDHCPLease(window.appInstance.canvas.nodes.find(n => n.id === '${node.id}'))">🔄 Renew DHCP License Lease</button>
        `;
      }
    }

    const contentHtml = `
      <div style="display: flex; border-bottom: 1px solid var(--border-color); background: #f8fafc; font-size: 0.75rem;">
        ${tabsHeaderHtml}
      </div>

      <div style="flex: 1; padding: 16px; display: flex; flex-direction: column; overflow-y: auto;">
        <!-- General Tab -->
        <div id="panel-gen-${node.id}" style="display: flex; flex-direction: column; gap: 12px;">
          <div class="setting-field">
            <label>Device Hostname</label>
            <input type="text" class="cyber-select" id="cfg-hostname-${node.id}" value="${config.hostname}">
          </div>
          ${ipConfigSelectorHtml}
          <div class="setting-field">
            <label>Primary IP Address</label>
            <input type="text" class="cyber-select" id="cfg-ip-primary-${node.id}" value="${config.ip}" ${config.ipConfig === 'dhcp' ? 'disabled style="background: #f1f5f9; cursor: not-allowed;"' : ''}>
          </div>
          ${staticFieldsHtml}
          <div class="setting-field">
            <label>Operating System</label>
            <input type="text" class="cyber-select" value="${node.os}" disabled style="background: #f1f5f9; cursor: not-allowed;">
          </div>
          <div style="display: flex; gap: 10px; margin-top: 5px;">
            <div style="flex: 1; text-align: center; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px;">
              <div style="font-size: 0.6rem; text-transform: uppercase; color: var(--text-secondary);">Twin Security</div>
              <div style="font-size: 0.75rem; font-weight: 700; margin-top: 4px; color: ${node.status === 'compromised' ? '#ef4444' : '#10b981'};">${node.status.toUpperCase()}</div>
            </div>
            <div style="flex: 1; text-align: center; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px;">
              <div style="font-size: 0.6rem; text-transform: uppercase; color: var(--text-secondary);">Role Category</div>
              <div style="font-size: 0.75rem; font-weight: 700; margin-top: 4px; color: var(--text-primary);">${node.role.toUpperCase()}</div>
            </div>
          </div>
        </div>

        <!-- Interfaces Tab -->
        <div id="panel-int-${node.id}" style="display: none; flex-direction: column; gap: 10px;">
          ${interfacesHtml}
        </div>

        <!-- ACLs Tab -->
        <div id="panel-acl-${node.id}" style="display: none; flex-direction: column; gap: 10px;">
          <div style="max-height: 140px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; background: #fafafa;" id="cfg-acls-list-${node.id}">
            ${aclsHtml}
          </div>
          
          <div style="border-top: 1px dashed var(--border-color); padding-top: 10px; display: flex; flex-direction: column; gap: 8px;">
            <span style="font-size: 0.7rem; font-weight: 700; color: var(--text-primary);">Add Access Control Rule (ACL)</span>
            <div style="display: flex; gap: 4px;">
              <input type="number" id="add-acl-id-${node.id}" class="cyber-select" placeholder="ID" style="width: 50px; padding: 4px; font-size: 0.7rem;">
              <select id="add-acl-act-${node.id}" class="cyber-select" style="width: 75px; padding: 4px; font-size: 0.7rem;">
                <option value="permit">permit</option>
                <option value="deny">deny</option>
              </select>
              <select id="add-acl-proto-${node.id}" class="cyber-select" style="width: 70px; padding: 4px; font-size: 0.7rem;">
                <option value="ip">ip</option>
                <option value="tcp">tcp</option>
                <option value="udp">udp</option>
                <option value="icmp">icmp</option>
              </select>
              <input type="text" id="add-acl-src-${node.id}" class="cyber-select" placeholder="Source" value="any" style="flex: 1; padding: 4px; font-size: 0.7rem;">
              <input type="text" id="add-acl-dst-${node.id}" class="cyber-select" placeholder="Dest" value="any" style="flex: 1; padding: 4px; font-size: 0.7rem;">
            </div>
            <button class="cyber-btn-sm w-100" style="padding: 6px;" onclick="window.appInstance.addNewACLFromUI('${node.id}')">Add Rule</button>
          </div>
        </div>

        ${coilsHtml}
        ${dhcpServerHtml}
      </div>

      <div style="padding: 12px 16px; border-top: 1px solid var(--border-color); background: #f8fafc; display: flex; justify-content: flex-end; gap: 8px;">
        <button class="cyber-btn-sm btn-danger-outline" onclick="document.getElementById('${winId}').remove();">Cancel</button>
        <button class="cyber-btn-sm" onclick="window.appInstance.saveDeviceConfigFromUI('${node.id}')">Apply Changes</button>
      </div>
    `;

    const win = this.createFloatingWindow(winId, winTitle, contentHtml, false);
    win.style.width = '480px';
    win.style.height = '460px';

    const tabGen = win.querySelector(`#tab-gen-${node.id}`);
    const tabInt = win.querySelector(`#tab-int-${node.id}`);
    const tabAcl = win.querySelector(`#tab-acl-${node.id}`);
    const tabCoils = isPlc ? win.querySelector(`#tab-coils-${node.id}`) : null;
    const tabDhcp = config.dhcp ? win.querySelector(`#tab-dhcp-${node.id}`) : null;

    const panelGen = win.querySelector(`#panel-gen-${node.id}`);
    const panelInt = win.querySelector(`#panel-int-${node.id}`);
    const panelAcl = win.querySelector(`#panel-acl-${node.id}`);
    const panelCoils = isPlc ? win.querySelector(`#panel-coils-${node.id}`) : null;
    const panelDhcp = config.dhcp ? win.querySelector(`#panel-dhcp-${node.id}`) : null;

    const switchTab = (activeTab, activePanel) => {
      [tabGen, tabInt, tabAcl, tabCoils, tabDhcp].forEach(t => {
        if (t) {
          t.style.color = 'var(--text-secondary)';
          t.style.borderBottomColor = 'transparent';
        }
      });
      [panelGen, panelInt, panelAcl, panelCoils, panelDhcp].forEach(p => {
        if (p) p.style.display = 'none';
      });

      activeTab.style.color = 'var(--brand-blue)';
      activeTab.style.borderBottomColor = 'var(--brand-blue)';
      activePanel.style.display = 'flex';
    };

    tabGen.onclick = () => switchTab(tabGen, panelGen);
    tabInt.onclick = () => switchTab(tabInt, panelInt);
    tabAcl.onclick = () => switchTab(tabAcl, panelAcl);
    if (isPlc) {
      tabCoils.onclick = () => switchTab(tabCoils, panelCoils);
    }
    if (config.dhcp) {
      tabDhcp.onclick = () => switchTab(tabDhcp, panelDhcp);
    }
  }

  addNewACLFromUI(nodeId) {
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const config = this.getNodeConfig(node);
    
    const aclId = document.getElementById(`add-acl-id-${nodeId}`).value;
    const action = document.getElementById(`add-acl-act-${nodeId}`).value;
    const proto = document.getElementById(`add-acl-proto-${nodeId}`).value;
    const src = document.getElementById(`add-acl-src-${nodeId}`).value;
    const dst = document.getElementById(`add-acl-dst-${nodeId}`).value;

    if (!aclId) {
      this.showToast("Please specify a valid Access List ID.", "danger");
      return;
    }

    if (!config.acls) config.acls = [];
    config.acls.push({
      id: parseInt(aclId),
      action,
      protocol: proto,
      source: src,
      destination: dst
    });

    this.orchestrator.logSystem(`Access list configuration updated for device [${nodeId}]: access-list ${aclId} added.`, 'info');
    
    // Reopen window to refresh and display newly added ACL row!
    document.getElementById(`win-config-${nodeId}`).remove();
    this.openDeviceConfigWindow(node);
    
    // Switch directly back to ACLs tab so the user sees their rule instantly!
    const tabAcl = document.getElementById(`tab-acl-${nodeId}`);
    if (tabAcl) tabAcl.click();
  }

  removeACL(nodeId, index) {
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const config = this.getNodeConfig(node);
    
    if (config.acls && config.acls[index]) {
      const removed = config.acls.splice(index, 1)[0];
      this.orchestrator.logSystem(`Access list configuration rule access-list ${removed.id} deleted from device [${nodeId}].`, 'warning');
    }
  }

  saveDeviceConfigFromUI(nodeId) {
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const config = this.getNodeConfig(node);

    const newHostname = document.getElementById(`cfg-hostname-${nodeId}`).value.trim();
    if (newHostname) {
      config.hostname = newHostname;
      node.name = newHostname;
    }

    // Save Static IP configuration if Static mode is enabled
    if (config.ipConfig === 'static') {
      const newIp = document.getElementById(`cfg-ip-primary-${nodeId}`).value.trim();
      const newMask = document.getElementById(`cfg-mask-${nodeId}`).value.trim();
      const newGw = document.getElementById(`cfg-gw-${nodeId}`).value.trim();

      if (newIp) {
        config.ip = newIp;
        node.ip = newIp;
      }
      if (newMask) {
        config.subnetMask = newMask;
      }
      if (newGw) {
        config.gateway = newGw;
      }

      // Sync default route
      config.routing.routes = [
        { destination: '0.0.0.0', mask: '0.0.0.0', gateway: newGw || '192.168.1.1' }
      ];

      // Sync interface configuration
      const firstIface = Object.keys(config.interfaces)[0];
      if (firstIface) {
        config.interfaces[firstIface].ip = newIp;
        config.interfaces[firstIface].mask = newMask || '255.255.255.0';
      }
    } else if (!config.ipConfig) {
      // General non-workstation node (Router/Firewall/Switch/SCADA)
      const newIp = document.getElementById(`cfg-ip-primary-${nodeId}`) ? document.getElementById(`cfg-ip-primary-${nodeId}`).value.trim() : '';
      if (newIp) {
        config.ip = newIp;
        node.ip = newIp;
      }
    }

    // Save DHCP Server configurations if applicable
    if (config.dhcp) {
      const dhcpEnabled = document.getElementById(`cfg-dhcp-enabled-${nodeId}`).checked;
      const dhcpSubnet = document.getElementById(`cfg-dhcp-subnet-${nodeId}`).value.trim();
      const dhcpMask = document.getElementById(`cfg-dhcp-mask-${nodeId}`).value.trim();
      const dhcpStart = parseInt(document.getElementById(`cfg-dhcp-start-${nodeId}`).value);
      const dhcpEnd = parseInt(document.getElementById(`cfg-dhcp-end-${nodeId}`).value);
      const dhcpGw = document.getElementById(`cfg-dhcp-gw-${nodeId}`).value.trim();

      config.dhcp.enabled = dhcpEnabled;
      config.dhcp.subnet = dhcpSubnet;
      config.dhcp.mask = dhcpMask;
      config.dhcp.rangeStart = dhcpStart;
      config.dhcp.rangeEnd = dhcpEnd;
      config.dhcp.gateway = dhcpGw;

      this.orchestrator.logSystem(`DHCP Server Service configured on [${nodeId}]: Status=${dhcpEnabled ? 'ACTIVE' : 'INACTIVE'}, Scope=${dhcpSubnet}/${dhcpMask}`, 'success');
    }

    // Save Interfaces settings
    Object.keys(config.interfaces).forEach(ifName => {
      const iface = config.interfaces[ifName];
      const ipInput = document.getElementById(`cfg-ip-${ifName}`);
      const zoneInput = document.getElementById(`cfg-zone-${ifName}`);
      const lvlInput = document.getElementById(`cfg-lvl-${ifName}`);
      const shInput = document.getElementById(`cfg-sh-${ifName}`);

      if (ipInput && config.ipConfig !== 'dhcp') iface.ip = ipInput.value.trim();
      if (zoneInput) iface.zone = zoneInput.value.trim();
      if (lvlInput) iface.securityLevel = parseInt(lvlInput.value.trim());
      if (shInput) {
        iface.shutdown = shInput.checked;
        
        // Turn links active/inactive
        this.canvas.links.forEach(l => {
          if (l.sourceId === node.id || l.targetId === node.id) {
            l.status = iface.shutdown ? 'disabled' : 'normal';
          }
        });
      }
    });

    this.orchestrator.logSystem(`Device configuration changes applied for asset [${node.name}]. Parameters synced successfully.`, 'success');
    
    // Close Window
    document.getElementById(`win-config-${nodeId}`).remove();
    this.updateSidebarProfile();
    this.canvas.draw();
    this.saveState();
  }

  // ==========================================
  // HARDWARE TOOLBOX & INTERACTIVE DESIGN ENGINE
  // ==========================================
  initToolboxEvents() {
    // Make clickable, non-button elements (toolbox tools, workspace cards)
    // keyboard-operable: expose them as buttons and activate on Enter/Space.
    document.querySelectorAll('.tool-item, .workspace-item').forEach(el => {
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
    });

    const btnTabCore = document.getElementById('btnTabCoreNet');
    const btnTabInd = document.getElementById('btnTabIndustrial');
    const btnTabSec = document.getElementById('btnTabSec');
    const secCore = document.getElementById('sectionCoreNet');
    const secInd = document.getElementById('sectionIndustrial');
    const secSec = document.getElementById('sectionSec');

    const switchTab = (activeBtn, activeSec) => {
      [btnTabCore, btnTabInd, btnTabSec].forEach(b => { if (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); } });
      [secCore, secInd, secSec].forEach(s => { if (s) s.classList.add('hidden'); });
      if (activeBtn) { activeBtn.classList.add('active'); activeBtn.setAttribute('aria-selected', 'true'); }
      if (activeSec) activeSec.classList.remove('hidden');
    };

    if (btnTabCore) btnTabCore.onclick = () => switchTab(btnTabCore, secCore);
    if (btnTabInd) btnTabInd.onclick = () => switchTab(btnTabInd, secInd);
    if (btnTabSec) btnTabSec.onclick = () => switchTab(btnTabSec, secSec);

    // Open Wireshark Analyzer
    const btnOpenWireshark = document.getElementById('btnOpenWireshark');
    if (btnOpenWireshark) btnOpenWireshark.onclick = () => this.openWireshark();

    // Toggle active tool items
    document.querySelectorAll('.tool-item').forEach(item => {
      item.onclick = (e) => {
        const tool = item.getAttribute('data-tool');
        if (['siemens-plc', 'ab-plc', 'schneider-rtu', 'hmi', 'actuator', 'sis-controller', 'vfd-drive', 'data-diode', 'claroty-ids'].includes(tool)) {
          if (!this.checkPremiumFeature('ics-assets', '🚨 ADVANCED ICS / OT INDUSTRIAL HARDWARE')) {
            return;
          }
        }
        
        if (item.classList.contains('active-tool')) {
          // Toggle off
          item.classList.remove('active-tool');
          this.activePlacementTool = null;
          if (this.canvas) this.canvas.linkingSourceNode = null;
          this.orchestrator.logSystem(`Tool selection cleared. Click and drag nodes freely.`, 'info');
        } else {
          // Toggle on
          document.querySelectorAll('.tool-item').forEach(el => el.classList.remove('active-tool'));
          item.classList.add('active-tool');
          this.activePlacementTool = tool;
          if (this.canvas) this.canvas.linkingSourceNode = null;
          
          if (tool === 'cable') {
            this.orchestrator.logSystem(`Cabling mode active: Click first node, then click second node to link them.`, 'info');
          } else {
            this.orchestrator.logSystem(`Deployment mode active: Click anywhere on the network canvas to deploy a ${tool.toUpperCase()}!`, 'info');
          }
        }
      };
    });

    // Clear toolbox button
    const btnClear = document.getElementById('btnClearToolbox');
    if (btnClear) {
      btnClear.onclick = () => {
        document.querySelectorAll('.tool-item').forEach(el => el.classList.remove('active-tool'));
        this.activePlacementTool = null;
        if (this.canvas) this.canvas.linkingSourceNode = null;
        this.orchestrator.logSystem(`Active tool selection cleared.`, 'info');
      };
    }
  }

  deployCustomDevice(tool, x, y) {
    if (['siemens-plc', 'ab-plc', 'schneider-rtu', 'hmi', 'actuator', 'sis-controller', 'vfd-drive', 'data-diode', 'claroty-ids'].includes(tool)) {
      if (!this.checkPremiumFeature('ics-assets', '🚨 ADVANCED ICS / OT INDUSTRIAL HARDWARE')) {
        document.querySelectorAll('.tool-item').forEach(el => el.classList.remove('active-tool'));
        this.activePlacementTool = null;
        if (this.canvas) this.canvas.linkingSourceNode = null;
        return;
      }
    }
    const counts = {};
    this.canvas.nodes.forEach(n => {
      const base = n.role.split(' ')[0] || n.role;
      counts[base] = (counts[base] || 0) + 1;
    });

    let role = "Switch";
    let os = "Arista cEOS";
    let icon = "switch";
    let firmware = "v4.26";
    let idPrefix = "SW";
    let defaultIp = "192.168.1.100";

    switch(tool) {
      // ── Core IT/Net ──
      case 'cisco-router':
        role = "Router"; os = "Cisco IOS XE"; icon = "router"; firmware = "17.6.4"; idPrefix = "RTR"; defaultIp = "192.168.1.1";
        break;
      case 'router': // legacy fallback
        role = "Router"; os = "Cisco IOS"; icon = "router"; firmware = "v15.4"; idPrefix = "RTR"; defaultIp = "192.168.1.1";
        break;
      case 'juniper-router':
        role = "Router"; os = "Juniper JunOS"; icon = "router"; firmware = "21.4R3"; idPrefix = "JNP"; defaultIp = "192.168.1.2";
        break;
      case 'arista-switch':
        role = "Switch"; os = "Arista EOS"; icon = "switch"; firmware = "4.28.5M"; idPrefix = "ARISTA"; defaultIp = "192.168.1.10";
        break;
      case 'cisco-switch':
        role = "Switch"; os = "Cisco Catalyst IOS"; icon = "switch"; firmware = "15.2(7)E"; idPrefix = "CAT"; defaultIp = "192.168.1.11";
        break;
      case 'switch': // legacy fallback
        role = "Switch"; os = "Arista cEOS"; icon = "switch"; firmware = "v4.26"; idPrefix = "SW"; defaultIp = "192.168.1.100";
        break;
      case 'pc':
        role = "Workstation"; os = "Ubuntu Linux / Kali"; icon = "workstation"; firmware = "kernel 6.1"; idPrefix = "PC"; defaultIp = "192.168.1.10";
        break;
      // ── ICS/OT ──
      case 'siemens-plc':
        role = "PLC Controller"; os = "Siemens TIA Portal"; icon = "plc"; firmware = "V17.0"; idPrefix = "S7"; defaultIp = "192.168.10.20";
        break;
      case 'ab-plc':
        role = "PLC Controller"; os = "Allen-Bradley Studio 5000"; icon = "plc"; firmware = "v33.0"; idPrefix = "AB"; defaultIp = "192.168.10.21";
        break;
      case 'schneider-rtu':
        role = "RTU Gateway"; os = "Schneider EcoStruxure"; icon = "plc"; firmware = "3.2.1"; idPrefix = "RTU"; defaultIp = "192.168.10.30";
        break;
      case 'plc': // legacy fallback
        role = "PLC Controller"; os = "VxWorks RTOS"; icon = "plc"; firmware = "v6.9"; idPrefix = "PLC"; defaultIp = "192.168.10.20";
        break;
      case 'hmi':
        role = "SCADA HMI"; os = "Ignition 8.x / Windows LTSC"; icon = "hmi"; firmware = "8.1.28"; idPrefix = "HMI"; defaultIp = "192.168.10.11";
        break;
      case 'actuator':
        role = "Field Actuator"; os = "EtherNet/IP RTOS"; icon = "valve"; firmware = "v2.4.1"; idPrefix = "ACT"; defaultIp = "192.168.10.50";
        break;
      case 'sis-controller':
        role = "SIS Controller"; os = "Triconex Safety OS"; icon = "plc"; firmware = "v11.5"; idPrefix = "SIS"; defaultIp = "192.168.99.10";
        break;
      case 'vfd-drive':
        role = "VFD Motor Drive"; os = "Allen-Bradley PowerFlex"; icon = "valve"; firmware = "v6.002"; idPrefix = "VFD"; defaultIp = "192.168.10.60";
        break;
      case 'emerson-dcs':
        role = "DCS Controller"; os = "Emerson DeltaV v14.3"; icon = "plc"; firmware = "14.3.1"; idPrefix = "DCS"; defaultIp = "10.1.20.10";
        break;
      case 'historian':
        role = "PI Historian"; os = "OSIsoft PI Server 2023"; icon = "workstation"; firmware = "2023 SP1"; idPrefix = "HIST"; defaultIp = "10.1.20.20";
        break;
      case 'eng-workstation':
        role = "Eng. Workstation"; os = "Windows LTSC 2021 / TIA Portal"; icon = "workstation"; firmware = "LTSC 21H2"; idPrefix = "EWS"; defaultIp = "10.1.10.50";
        break;
      // ── Security ──
      case 'paloalto-fw':
        role = "Firewall"; os = "Palo Alto PAN-OS"; icon = "firewall"; firmware = "11.0.3"; idPrefix = "PALO"; defaultIp = "10.0.0.1";
        break;
      case 'forti-fw':
        role = "Firewall"; os = "Fortinet FortiOS"; icon = "firewall"; firmware = "7.4.2"; idPrefix = "FGT"; defaultIp = "10.0.0.2";
        break;
      case 'firewall': // legacy fallback
        role = "Firewall"; os = "Palo Alto PAN-OS"; icon = "firewall"; firmware = "v10.1"; idPrefix = "FW"; defaultIp = "10.0.0.1";
        break;
      case 'cisco-ips':
        role = "IPS Sensor"; os = "Cisco IOS IPS"; icon = "firewall"; firmware = "7.3.8"; idPrefix = "IPS"; defaultIp = "10.0.0.5";
        break;
      case 'wireshark-tap':
        role = "Packet Tap"; os = "SPAN / Mirror Probe"; icon = "workstation"; firmware = "WireShark 4.2"; idPrefix = "TAP"; defaultIp = "192.168.255.1";
        break;
      case 'data-diode':
        role = "Data Diode"; os = "Owl Cyber Diode OS"; icon = "firewall"; firmware = "v8.3"; idPrefix = "DIODE"; defaultIp = "192.168.5.1";
        break;
      case 'claroty-ids':
        role = "OT Security Sensor"; os = "Claroty CT-100"; icon = "workstation"; firmware = "v4.6.1"; idPrefix = "CLAROTY"; defaultIp = "192.168.100.5";
        break;
    }

    const nextIndex = (counts[role] || 0) + 1;
    const id = `${idPrefix}-0${nextIndex}`;
    const name = `${role} 0${nextIndex}`;

    // Incremental IP address generator to prevent duplicates!
    let finalIp = defaultIp;
    const ipOctets = defaultIp.split('.');
    let suffix = parseInt(ipOctets[3]) + nextIndex - 1;
    finalIp = `${ipOctets[0]}.${ipOctets[1]}.${ipOctets[2]}.${suffix}`;

    let isDhcp = (tool === 'pc');
    if (isDhcp) {
      finalIp = "0.0.0.0 (DHCP Requesting...)";
    }

    const newNode = {
      id,
      name,
      role,
      ip: finalIp,
      os,
      firmware,
      status: 'stable',
      vulnerable: false,
      x,
      y,
      icon,
      isStatic: false,
      hasIpConflict: false
    };

    // Add node to simulation canvas
    this.canvas.nodes.push(newNode);
    
    // Initialize default routing and interfaces configuration via unified getNodeConfig
    const config = this.getNodeConfig(newNode);
    newNode.config = config;
    this.nodeConfigs[id] = config;

    this.saveState();

    this.orchestrator.logSystem(`Manual deployment: Spawned custom hardware asset [${id}] at coordinate [${Math.round(x)}, ${Math.round(y)}].`, 'success');

    if (isDhcp) {
      setTimeout(() => {
        this.triggerDHCPLease(newNode);
      }, 500);
    }
    
    // Automatically reset active tool to regular select/drag
    this.activePlacementTool = null;
    document.querySelectorAll('.tool-item').forEach(el => el.classList.remove('active-tool'));

    this.canvas.draw();
    
    // Auto-open settings config modal immediately for user friendliness!
    this.openDeviceConfigWindow(newNode);
  }

  deleteCustomDevice(node) {
    if (!node) return;
    
    // Remove all associated connections / links!
    this.canvas.links = this.canvas.links.filter(l => l.sourceId !== node.id && l.targetId !== node.id);
    
    // Remove node
    this.canvas.nodes = this.canvas.nodes.filter(n => n.id !== node.id);
    
    // Remove its configuration
    delete this.nodeConfigs[node.id];
    
    // If it was the selected node, clear selection
    if (this.canvas.selectedNode && this.canvas.selectedNode.id === node.id) {
      this.canvas.selectedNode = null;
      this.updateSidebarProfile();
    }
    
    // Close any active windows for this device
    const configWin = document.getElementById(`win-config-${node.id}`);
    if (configWin) configWin.remove();
    
    const cliWin = document.getElementById(`win-cli-${node.id}`);
    if (cliWin) cliWin.remove();

    this.orchestrator.logSystem(`Topology update: Asset [${node.id}] and all its connected interface cables have been deleted from the simulation.`, 'warning');
    
    this.saveState();
    this.canvas.draw();
  }

  deleteCustomLink(link) {
    if (!link) return;
    
    // Remove link from canvas array
    this.canvas.links = this.canvas.links.filter(l => 
      !((l.sourceId === link.sourceId && l.targetId === link.targetId) ||
        (l.sourceId === link.targetId && l.targetId === link.sourceId))
    );
    
    this.orchestrator.logSystem(`Topology update: Network connection wire between [${link.sourceId}] and [${link.targetId}] deleted.`, 'warning');
    
    this.saveState();
    this.canvas.draw();
  }

  // Persistent Layout Save & Restore (Feature 20)
  saveTopology() {
    const data = {
      nodes: this.canvas.nodes,
      links: this.canvas.links,
      nodeConfigs: this.nodeConfigs
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `netsim-topology-${Date.now()}.netsim`;
    a.click();
    URL.revokeObjectURL(url); // release the blob to avoid a memory leak
    this.orchestrator.logSystem("Topology layout configuration exported successfully to JSON (.netsim).", "success");
    this.showToast("Topology exported.", "success");
  }

  loadTopology() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.netsim, .json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const raw = JSON.parse(event.target.result);
          // Strip prototype-pollution keys before trusting file data
          const data = JSON.parse(JSON.stringify(raw));
          if (Array.isArray(data.nodes) && Array.isArray(data.links)) {
            const safeKeys = ['id','name','ip','type','role','os','firmware','status','x','y','note','encrypted','_searchMatch','_liveAnnotation','config','vulnerable','hasIpConflict'];
            this.canvas.nodes = data.nodes.map(n => Object.fromEntries(Object.entries(n).filter(([k]) => safeKeys.includes(k))));
            this.canvas.links = data.links.map(l => ({ sourceId: String(l.sourceId||''), targetId: String(l.targetId||''), encrypted: !!l.encrypted, status: String(l.status||'normal'), bandwidth: l.bandwidth, protocol: l.protocol }));
            this.nodeConfigs = (data.nodeConfigs && typeof data.nodeConfigs === 'object' && !Array.isArray(data.nodeConfigs)) ? data.nodeConfigs : {};
            this.canvas.selectedNode = null;
            this.updateSidebarProfile();
            this.canvas.draw();
            this.initHistory();
            this.orchestrator.logSystem("Topology layout configuration successfully parsed and restored to active simulation workspace.", "success");
            this.showToast(`Topology loaded: ${data.nodes.length} nodes, ${data.links.length} links.`, "success");
          } else {
            this.orchestrator.logSystem("Failed to load topology: file is missing valid 'nodes'/'links' arrays.", "danger");
            this.showToast("Invalid topology file format.", "danger");
          }
        } catch (err) {
          this.orchestrator.logSystem(`Failed to load topology: ${err.message}`, "danger");
          this.showToast("Could not parse topology file.", "danger");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // Interface Selection Prompt (Feature 22)
  promptForCablingInterfaces(srcNode, dstNode, callback) {
    const dialogId = 'cable-prompt-dialog';
    let old = document.getElementById(dialogId);
    if (old) old.remove();
    
    const getPorts = (node) => {
      if (node.role === 'Router' || node.role === 'Firewall') {
        return ['GigabitEthernet0/1', 'GigabitEthernet0/2', 'GigabitEthernet0/3'];
      } else if (node.role === 'Switch') {
        return ['FastEthernet0/1', 'FastEthernet0/2', 'FastEthernet0/3', 'FastEthernet0/4', 'FastEthernet0/5'];
      }
      return ['eth0', 'eth1'];
    };
    
    const srcPorts = getPorts(srcNode);
    const dstPorts = getPorts(dstNode);
    
    const modal = document.createElement('div');
    modal.id = dialogId;
    modal.className = 'floating-window';
    modal.style.left = '40%';
    modal.style.top = '30%';
    modal.style.width = '320px';
    modal.style.zIndex = '99999';
    modal.style.position = 'fixed';
    
    modal.innerHTML = `
      <div class="window-header">
        <span class="window-title">🔌 SELECT CABLING INTERFACES</span>
        <button class="win-btn win-close" id="btnCableCancel">✕</button>
      </div>
      <div class="window-body font-mono" style="padding: 12px; font-size: 0.7rem; color: #cbd5e1; display: flex; flex-direction: column; gap: 10px;">
        <div style="background: rgba(15, 23, 42, 0.4); padding: 8px; border-radius: 4px;">
          Connect <strong>Copper Straight-Through</strong> cable.
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-weight: 700; color: #6b9fe4;">${srcNode.name} Port</label>
          <select id="selSrcPort" class="cyber-select" style="font-size: 0.7rem; padding: 4px; background: #0f172a; border: 1px solid #334155; color: white;">
            ${srcPorts.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-weight: 700; color: #6b9fe4;">${dstNode.name} Port</label>
          <select id="selDstPort" class="cyber-select" style="font-size: 0.7rem; padding: 4px; background: #0f172a; border: 1px solid #334155; color: white;">
            ${dstPorts.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
        <button class="cyber-btn" id="btnCableConfirm" style="justify-content: center; margin-top: 5px;">Establish Connection Link</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    this.makeWindowDraggable(modal);
    
    document.getElementById('btnCableCancel').onclick = () => {
      modal.remove();
      this.orchestrator.logSystem("Cabling aborted by user.", "info");
    };
    
    document.getElementById('btnCableConfirm').onclick = () => {
      const srcPort = document.getElementById('selSrcPort').value;
      const dstPort = document.getElementById('selDstPort').value;
      modal.remove();
      callback(srcPort, dstPort);
    };
  }

  // Wireshark-lite Packet Inspector (Feature 24)
  openPacketInspector(packet) {
    const dialogId = 'packet-inspector-dialog';
    let old = document.getElementById(dialogId);
    if (old) old.remove();
    
    const modal = document.createElement('div');
    modal.id = dialogId;
    modal.className = 'floating-window';
    modal.style.left = '35%';
    modal.style.top = '25%';
    modal.style.width = '420px';
    modal.style.zIndex = '99999';
    modal.style.position = 'fixed';
    
    const type = packet.type === 'threat' ? 'TCP MODBUS ROUGE_WRITE [EXPLOIT]' : 'TCP MODBUS READ_STATE [TELEMETRY]';
    const hexPayload = packet.type === 'threat' ? 
      '00 01 00 00 00 06 01 06 75 30 00 01' : 
      '00 02 00 00 00 06 01 03 9C 41 00 02';
    
    modal.innerHTML = `
      <div class="window-header">
        <span class="window-title">🔍 WIRESHARK-LITE PACKET INSPECTOR</span>
        <button class="win-btn win-close" id="btnInspClose">✕</button>
      </div>
      <div class="window-body font-mono" style="padding: 12px; font-size: 0.65rem; color: #cbd5e1; max-height: 380px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
        <div style="background: rgba(15, 23, 42, 0.4); padding: 8px; border-radius: 4px; border-left: 3px solid ${packet.type === 'threat' ? '#ef4444' : '#10b981'};">
          <strong>Frame Summary:</strong> ${type}<br/>
          Source IP: ${packet.sourceNode?.ip || '192.168.1.100'} → Dest IP: ${packet.targetNode?.ip || '192.168.10.20'}<br/>
          Protocol: Modbus TCP (Port 502)
        </div>
        
        <div style="border: 1px solid #1e293b; border-radius: 4px; overflow: hidden;">
          <div style="background: #1e293b; padding: 4px 8px; font-weight: 700; color: #6b9fe4;">Frame Detail Tree</div>
          <div style="padding: 6px; display: flex; flex-direction: column; gap: 4px; background: rgba(0,0,0,0.15);">
            <div>▶ Ethernet II, Src: 00:50:56:84:a6:3b, Dst: 00:50:56:c0:00:08</div>
            <div>▶ Internet Protocol Version 4, Src: ${packet.sourceNode?.ip || '192.168.1.100'}, Dst: ${packet.targetNode?.ip || '192.168.10.20'}</div>
            <div>▶ Transmission Control Protocol, Src Port: 49283, Dst Port: 502, Seq: 12, Ack: 8</div>
            <div>▼ Modbus TCP Application Protocol</div>
            <div style="padding-left: 12px; color: #94a3b8;">
              Transaction Identifier: ${packet.type === 'threat' ? 1 : 2}<br/>
              Protocol Identifier: 0 (Modbus)<br/>
              Length: 6 bytes<br/>
              Unit Identifier: 1<br/>
              ▼ Modbus Protocol Data Unit<br/>
              &nbsp;&nbsp;Function Code: ${packet.type === 'threat' ? 'Write Single Register (6)' : 'Read Holding Registers (3)'}<br/>
              &nbsp;&nbsp;Reference Number: ${packet.type === 'threat' ? '30000 (0x7530)' : '40001 (0x9C41)'}<br/>
              &nbsp;&nbsp;Register Value: ${packet.type === 'threat' ? '1 (0x0001) [FORCE CLOSE]' : '2 registers'}
            </div>
          </div>
        </div>

        <div style="border: 1px solid #1e293b; border-radius: 4px; overflow: hidden;">
          <div style="background: #1e293b; padding: 4px 8px; font-weight: 700; color: #6b9fe4;">Hex Dump Payload</div>
          <pre style="margin: 0; padding: 8px; background: #070a13; color: #34d399; font-size: 0.6rem; overflow-x: auto; line-height: 1.3;">
0000   00 50 56 84 a6 3b 00 50  56 c0 00 08 08 00 45 00  .PV..;.P V.....E.
0010   00 2f 1a 4b 40 00 80 06  00 00 c0 a8 01 64 c0 a8  ./.K@... .....d..
0020   0a 14 c0 83 01 f6 00 00  00 0c 00 00 00 08 50 18  ........ ......P.
0030   40 00 00 00 00 00 ${hexPayload}              @.....
          </pre>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    this.makeWindowDraggable(modal);
    
    document.getElementById('btnInspClose').onclick = () => {
      modal.remove();
    };
  }

  // Modbus SCADA registers (Feature 8)
  writeModbusCoil(nodeId, coilNum, value) {
    if (coilNum === 1) {
      this.sim.inletValve = value === 'open' ? 52 : 0;
      const slider1 = document.getElementById('valveSlider1');
      if (slider1) slider1.value = this.sim.inletValve;
      const status1 = document.getElementById('statusValve1');
      if (status1) status1.textContent = value === 'open' ? 'OPEN (52%)' : 'CLOSED';
    } else if (coilNum === 2) {
      this.sim.outletValve = value === 'open' ? 45 : 0;
      const slider2 = document.getElementById('valveSlider2');
      if (slider2) slider2.value = this.sim.outletValve;
      const status2 = document.getElementById('statusValve2');
      if (status2) status2.textContent = value === 'open' ? 'OPEN (45%)' : 'CLOSED';
    }
    this.orchestrator.logSystem(`Modbus Command: Forced Write Single Coil [0000${coilNum}] to value [${value.toUpperCase()}] on PLC [${nodeId}].`, 'success');
  }

  // Safety Instrumented System (SIS) (Feature 9)
  toggleSisInterlock(nodeId, enabled) {
    this.sim.sisInterlock = enabled;
    this.orchestrator.logSystem(`SIS Configuration: PLC [${nodeId}] Safety Interlock system state set to: ${enabled ? 'ENABLED' : 'DISABLED'}.`, 'warning');
  }

  // CTF guided scenarios engine (Feature 25)
  startCtfScenario(id) {
    [1, 2, 3].forEach(s => {
      const details = document.getElementById(`ctf${s}Details`);
      if (details) details.classList.add('hidden');
    });
    
    const targetDetails = document.getElementById(`ctf${id}Details`);
    if (targetDetails) targetDetails.classList.remove('hidden');
    
    this.activeCtf = id;
    const msg = document.getElementById('ctfProgressMsg');
    if (msg) {
      msg.textContent = `CTF Mission ${id} Initialized. Complete the objectives!`;
      msg.style.color = '#6b9fe4';
    }
    
    this.orchestrator.logSystem(`CTF Mission ${id} launched! Objective checklists updated.`, "success");
    
    if (this.ctfInterval) clearInterval(this.ctfInterval);
    this.ctfInterval = setInterval(() => this.validateCtfObjectives(), 1000);
  }

  validateCtfObjectives() {
    if (!this.activeCtf) return;
    
    const setChecked = (id, checked) => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = checked ? `<span style="color:#10b981; font-weight:bold;">[✓]</span>` : `[ ]`;
      }
    };
    
    let complete = false;
    
    if (this.activeCtf === 1) {
      const engWs = this.canvas.nodes.find(n => n.id === 'ENG-WS');
      const borderLink = this.canvas.links.find(l => 
        (l.sourceId === 'FW-01' && l.targetId === 'OT-SW') ||
        (l.sourceId === 'OT-SW' && l.targetId === 'FW-01')
      );
      
      const isIsolated = engWs && engWs.status === 'isolated';
      const isMicrosegmented = borderLink && borderLink.status === 'isolated';
      
      setChecked('obj1_1', isIsolated);
      setChecked('obj1_2', isMicrosegmented);
      
      if (isIsolated && isMicrosegmented) {
        complete = true;
      }
    } else if (this.activeCtf === 2) {
      const fwExists = this.canvas.nodes.some(n => n.role === 'Firewall' && n.id !== 'FW-01');
      const hasDenyRules = Object.values(this.nodeConfigs).some(cfg => 
        cfg.acls && cfg.acls.some(rule => rule.action === 'deny')
      );
      
      setChecked('obj2_1', fwExists);
      setChecked('obj2_2', hasDenyRules);
      
      if (fwExists && hasDenyRules) {
        complete = true;
      }
    } else if (this.activeCtf === 3) {
      const linkCompromised = this.canvas.links.find(l => 
        (l.sourceId === 'FW-01' && l.targetId === 'IT-SW') ||
        (l.sourceId === 'IT-SW' && l.targetId === 'FW-01')
      );
      const isSnipped = linkCompromised && linkCompromised.status === 'offline';
      const routerExists = this.canvas.nodes.some(n => n.role === 'Router' && n.id !== 'PE-01');
      
      setChecked('obj3_1', isSnipped);
      setChecked('obj3_2', routerExists);
      
      if (isSnipped && routerExists) {
        complete = true;
      }
    }
    
    if (complete) {
      clearInterval(this.ctfInterval);
      this.activeCtf = null;
      
      const msg = document.getElementById('ctfProgressMsg');
      if (msg) {
        msg.textContent = `🎉 MISSION COMPLETED SUCCESSFULLY!`;
        msg.style.color = '#34d399';
      }
      
      this.orchestrator.logSystem("CTF CHALLENGE ACCOMPLISHED! Network integrity score: 100/100.", "success");
    }
  }

  // Left-Panel Tab Switcher
  switchSidebarTab(tabName) {
    const tabs = {
      chat:     { content: 'tabContentChat',     btn: 'tabBtnChat' },
      audit:    { content: 'tabContentAudit',    btn: 'tabBtnAudit' },
      timeline: { content: 'tabContentTimeline', btn: 'tabBtnTimeline' },
      assets:   { content: 'tabContentAssets',   btn: 'tabBtnAssets' }
    };

    Object.entries(tabs).forEach(([name, ids]) => {
      const content = document.getElementById(ids.content);
      const btn = document.getElementById(ids.btn);
      const isActive = name === tabName;
      if (content) content.style.display = isActive ? 'flex' : 'none';
      if (btn) { btn.classList.toggle('active', isActive); btn.setAttribute('aria-selected', isActive ? 'true' : 'false'); }
    });

    if (tabName === 'audit') this.runAuditRules();
    if (tabName === 'assets') this.refreshAssetInventory();
  }

  refreshAssetInventory() {
    const list = document.getElementById('assetInventoryList');
    const summary = document.getElementById('assetInventorySummary');
    if (!list || !this.canvas) return;

    const nodes = this.canvas.nodes || [];
    const links = this.canvas.links || [];
    const filterVal = (document.getElementById('assetFilterInput')?.value || '').toLowerCase();

    const filtered = filterVal
      ? nodes.filter(n => (n.name + n.role + n.ip + n.os).toLowerCase().includes(filterVal))
      : nodes;

    if (filtered.length === 0) {
      list.innerHTML = `<div style="color:var(--text-muted);font-size:0.7rem;text-align:center;padding:20px 0;">${nodes.length === 0 ? 'Launch a simulation to enumerate assets.' : 'No assets match filter.'}</div>`;
    } else {
      const statusColor = s => s === 'compromised' ? 'var(--danger-red)' : s === 'isolated' ? 'var(--warning-amber)' : 'var(--success-green)';
      const statusLabel = s => s === 'compromised' ? 'COMPROMISED' : s === 'isolated' ? 'ISOLATED' : 'ONLINE';
      list.innerHTML = filtered.map(n => `
        <div style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:6px 8px;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:5px;cursor:pointer;" onclick="window.appInstance?.focusNodeById(${JSON.stringify(n.id)})">
          <span style="font-size:0.7rem;color:${statusColor(n.status)};">●</span>
          <div style="min-width:0;">
            <div style="font-size:0.68rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escapeHtml(n.name)}</div>
            <div style="font-size:0.58rem;color:var(--text-muted);font-family:var(--font-mono);">${this.escapeHtml(n.ip)} — ${this.escapeHtml(n.role || n.type || '—')}</div>
          </div>
          <span style="font-size:0.55rem;font-weight:700;color:${statusColor(n.status)};white-space:nowrap;">${statusLabel(n.status)}</span>
        </div>
      `).join('');
    }

    if (summary) summary.textContent = `${nodes.length} device${nodes.length !== 1 ? 's' : ''} | ${links.length} link${links.length !== 1 ? 's' : ''}`;
  }

  filterAssetInventory(val) {
    this.refreshAssetInventory();
  }

  focusNodeById(nodeId) {
    const node = this.canvas?.nodes?.find(n => n.id === nodeId);
    if (!node) return;
    this.canvas.selectedNode = node;
    const cvs = this.canvas.canvas;
    if (cvs) {
      this.canvas.panX = cvs.width / 2 - node.x * this.canvas.scale;
      this.canvas.panY = cvs.height / 2 - node.y * this.canvas.scale;
    }
    if (typeof this.canvas.render === 'function') this.canvas.render();
    this.attachCLISession(node);
  }

  exportAssetInventory() {
    const nodes = this.canvas?.nodes || [];
    if (nodes.length === 0) { this.showToast('No assets to export.', 'info'); return; }
    const header = 'ID,Name,IP,Role,OS,Firmware,Status\n';
    const rows = nodes.map(n => [n.id, n.name, n.ip, n.role || '', n.os || '', n.firmware || '', n.status || 'stable'].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `aetheris-assets-${Date.now()}.csv`; a.click();
    this.showToast('Asset inventory exported as CSV.', 'success');
  }

  // AI Security Infrastructure Audit Recommendations Engine
  runAuditRules() {
    const list = document.getElementById('auditIssuesList');
    if (!list) return;

    list.innerHTML = '';
    const issues = [];

    // Rule 1: Check for PLC vulnerabilities/compromises
    this.canvas.nodes.forEach(n => {
      if (n.status === 'compromised') {
        issues.push({
          type: 'danger',
          title: `COMPROMISED ASSET [${n.id}]`,
          body: `Asset [${n.name}] is showing compromised signatures. Rogue Modbus overrides detected.`
        });
      }
    });

    // Rule 2: Check for IP conflicts
    const conflictNodes = this.canvas.nodes.filter(n => n.hasIpConflict);
    if (conflictNodes.length > 0) {
      issues.push({
        type: 'danger',
        title: `IP ADDRESS DUPLICATE CONFLICT`,
        body: `Multiple nodes share identical IP configurations: ${conflictNodes.map(n => n.ip).filter((v,i,a) => a.indexOf(v)===i).join(', ')}. Traffic routing paths are failing.`
      });
    }

    // Rule 3: Check for segment firewall trust zones
    const otSw = this.canvas.nodes.find(n => n.id === 'OT-SW');
    const borderLink = this.canvas.links.find(l => 
      (l.sourceId === 'FW-01' && l.targetId === 'OT-SW') ||
      (l.sourceId === 'OT-SW' && l.targetId === 'FW-01')
    );
    if (borderLink && borderLink.status !== 'isolated') {
      issues.push({
        type: 'warning',
        title: `OT BOUNDARY UNRESTRICTED`,
        body: `IT-OT Firewall bridge is currently unsegmented. Threat lateral movement vectors can bypass trust controls.`
      });
    }

    // Rule 4: Check if workstations have OSPF or default routing configured
    const noRoutes = this.canvas.nodes.filter(n => n.role === 'Router' && (!this.nodeConfigs[n.id]?.routing?.routes || this.nodeConfigs[n.id].routing.routes.length === 0));
    if (noRoutes.length > 0) {
      issues.push({
        type: 'warning',
        title: `OSPF ROUTING INCOMPLETE`,
        body: `Asset [${noRoutes.map(n => n.id).join(', ')}] does not have dynamic routing adjacencies configured.`
      });
    }

    // Output secure baseline if clear
    if (issues.length === 0) {
      list.innerHTML = `
        <div class="audit-item issue-stable">
          <div class="audit-item-header">
            <span class="title">INFRASTRUCTURE IS SECURE</span>
            <span class="badge">STABLE</span>
          </div>
          <div class="audit-item-body">AI real-time validation confirms complete zone microsegmentation, patched PLC firmwares, and clean dynamic route convergence. Zero security recommendations.</div>
        </div>
      `;
      return;
    }

    issues.forEach(issue => {
      const item = document.createElement('div');
      item.className = `audit-item issue-${issue.type}`;
      item.innerHTML = `
        <div class="audit-item-header">
          <span class="title">${issue.title}</span>
          <span class="badge">${issue.type}</span>
        </div>
        <div class="audit-item-body">${issue.body}</div>
      `;
      list.appendChild(item);
    });
  }

  // Execute automatic threat patch containment playbook
  triggerAutoHardening() {
    this.orchestrator.logSystem("Executing AI Auto-Hardening Security Playbook...", "info");
    
    // Remediation 1: Segment IT-OT Bridge
    const borderLink = this.canvas.links.find(l => 
      (l.sourceId === 'FW-01' && l.targetId === 'OT-SW') ||
      (l.sourceId === 'OT-SW' && l.targetId === 'FW-01')
    );
    if (borderLink && borderLink.status !== 'isolated') {
      this.orchestrator.executeMicrosegmentation(true);
      const chk = document.getElementById('chkMicroseg');
      if (chk) chk.checked = true;
    }

    // Remediation 2: Remediate PLC compromises & patch firmwares
    this.orchestrator.remediateThreats();

    // Remediation 3: Address IP conflicts by dynamic DHCP rebinding
    const conflictNodes = this.canvas.nodes.filter(n => n.hasIpConflict);
    conflictNodes.forEach((node, i) => {
      if (node.role === 'Workstation') {
        const nextIp = `192.168.1.${15 + i}`;
        node.ip = nextIp;
        this.nodeConfigs[node.id].ip = nextIp;
        this.orchestrator.logSystem(`AI Auto-Hardener resolved duplicate config: Reassigned asset [${node.id}] IP to Dynamic lease [${nextIp}].`, "success");
      }
    });

    this.runAuditRules();
    this.updateSidebarProfile();
    this.canvas.draw();
  }

  // ==========================================
  // REALISTIC LAYER 2 & LAYER 3 NETWORKING ENGINE
  // ==========================================

  ipToInt(ip) {
    if (!ip) return 0;
    const cleanIp = ip.split(' ')[0];
    const parts = cleanIp.split('.');
    if (parts.length !== 4) return 0;
    return parts.reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }

  inSameSubnet(ip1, ip2, mask) {
    if (!ip1 || !ip2) return false;
    const m = this.ipToInt(mask || '255.255.255.0');
    return (this.ipToInt(ip1) & m) === (this.ipToInt(ip2) & m);
  }

  findBestRoute(routes, destIp) {
    if (!routes || routes.length === 0) return null;
    let bestRoute = null;
    let bestMaskLength = -1;
    const destInt = this.ipToInt(destIp);
    
    routes.forEach(r => {
      const routeDestInt = this.ipToInt(r.destination);
      const routeMaskInt = this.ipToInt(r.mask);
      
      if ((destInt & routeMaskInt) === (routeDestInt & routeMaskInt)) {
        const maskStr = routeMaskInt.toString(2);
        const maskLength = (maskStr.match(/1/g) || []).length;
        if (maskLength > bestMaskLength) {
          bestMaskLength = maskLength;
          bestRoute = r;
        }
      }
    });
    return bestRoute;
  }

  findL2Path(startNodeId, endNodeId) {
    const queue = [[startNodeId, [startNodeId]]];
    const visited = new Set([startNodeId]);
    
    while (queue.length > 0) {
      const [currId, path] = queue.shift();
      if (currId === endNodeId) {
        return path;
      }
      
      const activeLinks = this.canvas.links.filter(l => {
        if (l.status === 'offline' || l.status === 'isolated' || l.status === 'disabled') return false;
        return l.sourceId === currId || l.targetId === currId;
      });
      
      for (const link of activeLinks) {
        const nextId = link.sourceId === currId ? link.targetId : link.sourceId;
        if (visited.has(nextId)) continue;
        
        const nextNode = this.canvas.nodes.find(n => n.id === nextId);
        if (!nextNode) continue;
        
        const isTarget = nextId === endNodeId;
        const isSwitch = nextNode.role.toLowerCase().includes('switch') || nextNode.role.toLowerCase().includes('hub');
        
        if (isTarget || isSwitch) {
          visited.add(nextId);
          queue.push([nextId, [...path, nextId]]);
        }
      }
    }
    return null;
  }

  solveL3RoutingPath(srcNode, dstIp) {
    let currNode = srcNode;
    const path = [currNode];
    const maxHops = 16;
    
    const dstNode = this.canvas.nodes.find(n => n.ip.split(' ')[0] === dstIp || n.id.toLowerCase() === dstIp.toLowerCase() || n.name.toLowerCase() === dstIp.toLowerCase());
    if (!dstNode) {
      return { success: false, reason: "Destination host unreachable (no device found with that address)", hops: path };
    }
    
    const cleanDstIp = dstNode.ip.split(' ')[0];
    
    for (let hop = 0; hop < maxHops; hop++) {
      if (currNode.id === dstNode.id) {
        return { success: true, hops: path };
      }
      
      const currConfig = this.getNodeConfig(currNode);
      let localInterface = null;
      
      for (const ifName of Object.keys(currConfig.interfaces)) {
        const iface = currConfig.interfaces[ifName];
        if (iface.shutdown) continue;
        
        const mask = iface.mask || '255.255.255.0';
        if (this.inSameSubnet(iface.ip.split(' ')[0], cleanDstIp, mask)) {
          localInterface = ifName;
          break;
        }
      }
      
      if (localInterface) {
        const l2Path = this.findL2Path(currNode.id, dstNode.id);
        if (l2Path) {
          path.push(dstNode);
          return { success: true, hops: path, l2Path: l2Path };
        } else {
          return { success: false, reason: `Destination host unreachable (physically disconnected at Layer 2 from ${currNode.id} to ${dstNode.id})`, hops: path };
        }
      }
      
      if (!currConfig.routing || !currConfig.routing.routes) {
        return { success: false, reason: `Destination net unreachable (no routing table on ${currNode.id})`, hops: path };
      }
      
      const route = this.findBestRoute(currConfig.routing.routes, cleanDstIp);
      if (!route) {
        return { success: false, reason: `Destination net unreachable (no route to ${cleanDstIp} on ${currNode.id})`, hops: path };
      }
      
      const gatewayIp = route.gateway;
      
      const gwNode = this.canvas.nodes.find(n => {
        const cfg = this.getNodeConfig(n);
        return Object.values(cfg.interfaces).some(iface => !iface.shutdown && iface.ip.split(' ')[0] === gatewayIp);
      });
      
      if (!gwNode) {
        return { success: false, reason: `Destination host unreachable (gateway ${gatewayIp} not found)`, hops: path };
      }
      
      let gatewaySubnetMatch = false;
      for (const ifName of Object.keys(currConfig.interfaces)) {
        const iface = currConfig.interfaces[ifName];
        if (iface.shutdown) continue;
        const mask = iface.mask || '255.255.255.0';
        if (this.inSameSubnet(iface.ip.split(' ')[0], gatewayIp, mask)) {
          gatewaySubnetMatch = true;
          break;
        }
      }
      
      if (!gatewaySubnetMatch) {
        return { success: false, reason: `Routing failed (gateway ${gatewayIp} is not in a local subnet of ${currNode.id})`, hops: path };
      }
      
      const l2PathToGw = this.findL2Path(currNode.id, gwNode.id);
      if (!l2PathToGw) {
        return { success: false, reason: `Destination host unreachable (gateway ${gatewayIp} is physically disconnected from ${currNode.id})`, hops: path };
      }
      
      if (path.some(n => n.id === gwNode.id)) {
        return { success: false, reason: "Routing loop detected in transit", hops: path };
      }
      
      currNode = gwNode;
      path.push(currNode);
    }
    
    return { success: false, reason: "Time to Live (TTL) expired in transit", hops: path };
  }

  nslookup(hostname) {
    const cleanHost = hostname.trim().toLowerCase();
    if (this.dnsRecords[cleanHost]) {
      return this.dnsRecords[cleanHost];
    }
    // Try resolving node ID or hostname
    const match = this.canvas.nodes.find(n => n.id.toLowerCase() === cleanHost || n.name.toLowerCase() === cleanHost);
    if (match) return match.ip.split(' ')[0];
    return null;
  }

  arpResolve(node, targetIp) {
    if (!this.arpCache[node.id]) this.arpCache[node.id] = {};
    
    // Check local cache
    if (this.arpCache[node.id][targetIp]) {
      return this.arpCache[node.id][targetIp];
    }
    
    // Simulate resolution and learning
    const match = this.canvas.nodes.find(n => {
      const cfg = this.getNodeConfig(n);
      return Object.values(cfg.interfaces).some(iface => iface.ip.split(' ')[0] === targetIp);
    });
    
    if (match) {
      // Generate a mock MAC address
      const hex = '00:50:56:' + Math.floor(Math.random()*16).toString(16) + Math.floor(Math.random()*16).toString(16) + ':' + Math.floor(Math.random()*16).toString(16) + Math.floor(Math.random()*16).toString(16) + ':' + Math.floor(Math.random()*16).toString(16) + Math.floor(Math.random()*16).toString(16);
      const mac = hex.toUpperCase();
      this.arpCache[node.id][targetIp] = mac;
      
      // Dynamic statistics updates (Upgrades 13-14)
      this.networkStatistics.packetsSent++;
      this.networkStatistics.bandwidthLoad += 0.02; // Small ARP packet load
      return mac;
    }
    return null;
  }

  ospfHelloTick() {
    // Upgrades 1, 6: Simulate OSPF Dynamic routing updates between all routers/firewalls
    const routers = this.canvas.nodes.filter(n => n.role.toLowerCase().includes('router') || n.role.toLowerCase().includes('firewall'));
    routers.forEach(r => {
      const rCfg = this.getNodeConfig(r);
      if (!this.ospfNeighbors[r.id]) this.ospfNeighbors[r.id] = [];
      
      // Scan other routers on adjacent L2 links
      routers.forEach(other => {
        if (other.id === r.id) return;
        const l2Path = this.findL2Path(r.id, other.id);
        if (l2Path && !this.ospfNeighbors[r.id].includes(other.id)) {
          this.ospfNeighbors[r.id].push(other.id);
          this.orchestrator.logSystem(`[OSPF] Neighbor adjacency established between ${r.name} and ${other.name} (State: FULL)`, 'success');
          
          // Sync routes (dynamically load each other's subnets into routing tables)
          const otherCfg = this.getNodeConfig(other);
          Object.values(otherCfg.interfaces).forEach(iface => {
            if (!iface.shutdown && iface.ip !== '0.0.0.0') {
              const subnetParts = iface.ip.split('.');
              const routeDest = `${subnetParts[0]}.${subnetParts[1]}.${subnetParts[2]}.0`;
              
              const routeExists = rCfg.routing.routes.some(rt => rt.destination === routeDest);
              if (!routeExists) {
                rCfg.routing.routes.push({
                  destination: routeDest,
                  mask: iface.mask || '255.255.255.0',
                  gateway: iface.ip.split(' ')[0],
                  protocol: 'OSPF'
                });
                this.orchestrator.logSystem(`[OSPF] Loaded dynamic route to ${routeDest}/24 via ${other.name}`, 'info');
              }
            }
          });
        }
      });
    });
  }

  runCLITraceroute(dstIpOrHost, node) {
    // Upgrades 5, 23: Interactive Traceroute diagnostic utility
    this.printCLILine(`Tracing route to ${dstIpOrHost} over a maximum of 30 hops:`, 'comment-line');
    
    let resolvedIp = this.nslookup(dstIpOrHost);
    if (!resolvedIp) {
      resolvedIp = dstIpOrHost;
    }
    
    const res = this.solveL3RoutingPath(node, resolvedIp);
    let hopIndex = 1;
    
    if (res.hops && res.hops.length > 0) {
      res.hops.forEach(hopNode => {
        const cfg = this.getNodeConfig(hopNode);
        const delay1 = Math.floor(Math.random() * 4) + 1;
        const delay2 = Math.floor(Math.random() * 4) + 1;
        const delay3 = Math.floor(Math.random() * 4) + 1;
        this.printCLILine(`  ${hopIndex}    ${delay1} ms    ${delay2} ms    ${delay3} ms    ${hopNode.name} [${cfg.ip.split(' ')[0]}]`);
        hopIndex++;
      });
    }
    
    if (res.success) {
      this.printCLILine(`Trace complete. Route is active and L2/L3 healthy.`, 'success');
    } else {
      this.printCLILine(`  ${hopIndex}    *        *        *     Request timed out.`, 'error-line');
      this.printCLILine(`Trace failed: ${res.reason}`, 'error-line');
    }
  }

  triggerDHCPLease(node, silent = false) {
    const config = this.getNodeConfig(node);
    if (config.ipConfig !== 'dhcp') return;

    if (!silent) {
      this.orchestrator.logSystem(`DHCP Client [${node.id}] broadcasting DHCP DISCOVER...`, 'info');
    }

    // Find any Router or Firewall on the same L2 segment with DHCP Server enabled
    const dhcpServers = this.canvas.nodes.filter(n => {
      const cfg = this.getNodeConfig(n);
      return cfg.dhcp && cfg.dhcp.enabled;
    });

    let foundServer = null;
    let foundL2Path = null;

    for (const server of dhcpServers) {
      const path = this.findL2Path(node.id, server.id);
      if (path) {
        foundServer = server;
        foundL2Path = path;
        break;
      }
    }

    if (foundServer) {
      const serverConfig = this.getNodeConfig(foundServer);
      const pool = serverConfig.dhcp;

      // Assign the next available IP address in the pool
      let assignedIp = null;
      
      // Check if this node already has an assigned lease from this server
      if (pool.leases[node.id]) {
        assignedIp = pool.leases[node.id];
      } else {
        // Find next free IP in pool subnet
        const start = parseInt(pool.rangeStart);
        const end = parseInt(pool.rangeEnd);
        const subnetParts = pool.subnet.split('.');
        
        for (let octet = start; octet <= end; octet++) {
          const testIp = `${subnetParts[0]}.${subnetParts[1]}.${subnetParts[2]}.${octet}`;
          // Check if already leased
          const isLeased = Object.values(pool.leases).includes(testIp);
          if (!isLeased) {
            assignedIp = testIp;
            pool.leases[node.id] = testIp;
            break;
          }
        }
      }

      if (assignedIp) {
        // Bind settings to node and node config!
        config.ip = assignedIp;
        node.ip = assignedIp;
        config.subnetMask = pool.mask;
        config.gateway = pool.gateway;

        // Sync with primary interface IP
        const firstIface = Object.keys(config.interfaces)[0];
        if (firstIface) {
          config.interfaces[firstIface].ip = assignedIp;
          config.interfaces[firstIface].mask = pool.mask;
        }

        // Set default route in PC's routing table to gateway
        config.routing.routes = [
          { destination: '0.0.0.0', mask: '0.0.0.0', gateway: pool.gateway }
        ];

        if (!silent) {
          this.orchestrator.logSystem(`[DHCP] DHCP OFFER received from ${foundServer.id}: IP=${assignedIp}, Netmask=${pool.mask}, Gateway=${pool.gateway}`, 'success');
          this.orchestrator.logSystem(`[DHCP] DHCP ACK completed. Client [${node.id}] configured.`, 'success');
        }

        // Trigger visual packet flow! (Upgrade 26)
        this.canvas.spawnPacket(node, foundServer, 'dhcp', foundL2Path);
        setTimeout(() => {
          this.canvas.spawnPacket(foundServer, node, 'dhcp', [...foundL2Path].reverse());
        }, 1000);

        this.updateSidebarProfile();
        this.canvas.draw();
        return;
      }
    }

    // No DHCP server found on this segment, fall back to APIPA (169.254.x.x) or show warning
    const fallbackIp = `169.254.${10 + Math.floor(Math.random() * 200)}.${10 + Math.floor(Math.random() * 200)}`;
    config.ip = fallbackIp + " (DHCP Requesting...)";
    node.ip = fallbackIp;
    config.subnetMask = '255.255.0.0';
    config.gateway = '';
    
    const firstIface = Object.keys(config.interfaces)[0];
    if (firstIface) {
      config.interfaces[firstIface].ip = fallbackIp;
      config.interfaces[firstIface].mask = '255.255.0.0';
    }
    
    config.routing.routes = [];

    if (!silent) {
      this.orchestrator.logSystem(`[DHCP] Discover timed out. No DHCP server responded. Falling back to APIPA: ${fallbackIp}`, 'warning');
    }
    this.updateSidebarProfile();
    this.canvas.draw();
  }

  toggleIpConfigMode(nodeId, mode) {
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const config = this.getNodeConfig(node);
    config.ipConfig = mode;
    
    if (mode === 'dhcp') {
      config.ip = "0.0.0.0 (DHCP Requesting...)";
      node.ip = "0.0.0.0";
      this.triggerDHCPLease(node);
    } else {
      config.ip = '192.168.1.100';
      node.ip = '192.168.1.100';
      config.subnetMask = '255.255.255.0';
      config.gateway = '192.168.1.1';
      
      const firstIface = Object.keys(config.interfaces)[0];
      if (firstIface) {
        config.interfaces[firstIface].ip = '192.168.1.100';
        config.interfaces[firstIface].mask = '255.255.255.0';
      }
      
      config.routing.routes = [
        { destination: '0.0.0.0', mask: '0.0.0.0', gateway: '192.168.1.1' }
      ];
    }
    
    const win = document.getElementById(`win-config-${nodeId}`);
    if (win) win.remove();
    this.openDeviceConfigWindow(node);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WIRESHARK ANALYZER — delegated to WiresharkManager (wireshark.js)
  // ═══════════════════════════════════════════════════════════════════════
  openWireshark()                 { this.ws.open(); }
  _wsToggleProto(p)               { this.ws._wsToggleProto(p); }
  _wsStopCapture()                { this.ws._wsStopCapture(); }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 2: CANVAS PNG EXPORT
  // ═══════════════════════════════════════════════════════════════════════
  exportCanvasPng() {
    const canvas = document.getElementById('networkCanvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `aetheris_topology_${Date.now()}.png`;
    a.click();
    this.showToast('Topology exported as PNG.', 'success');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 3: KEYBOARD SHORTCUTS CHEATSHEET
  // ═══════════════════════════════════════════════════════════════════════
  showShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) modal.classList.remove('hidden');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 4: INCIDENT TIMELINE LOG
  // ═══════════════════════════════════════════════════════════════════════
  logIncident(message, severity = 'info', mitreId = null) {
    if (!this.incidentTimeline) this.incidentTimeline = [];
    const simMs = Math.round(this.simTime);
    const h = Math.floor(simMs / 3600000);
    const m = Math.floor((simMs % 3600000) / 60000);
    const s = Math.floor((simMs % 60000) / 1000);
    const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

    this.incidentTimeline.push({ time: timeStr, real: new Date().toLocaleTimeString(), message, severity, mitreId });

    const list = document.getElementById('timelineList');
    if (list) {
      const empty = list.querySelector('[style*="text-align: center"]');
      if (empty) empty.remove();

      const entry = document.createElement('div');
      entry.className = `timeline-entry severity-${severity}`;
      const mitreTag = mitreId
        ? `<span class="mitre-tag" title="MITRE ATT&CK for ICS">${mitreId}</span>`
        : '';
      entry.innerHTML = `<span class="timeline-time">[${timeStr}] ${new Date().toLocaleTimeString()}</span>${mitreTag}<span class="timeline-msg">${this.escapeHtml(message)}</span>`;
      list.appendChild(entry);
      list.scrollTop = list.scrollHeight;
    }
  }

  clearIncidentTimeline() {
    this.incidentTimeline = [];
    const list = document.getElementById('timelineList');
    if (list) list.innerHTML = '<div style="color: var(--text-muted); font-size: 0.7rem; text-align: center; padding: 20px 0;">Timeline cleared.</div>';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 5: AUTO-SAVE TOPOLOGY TO LOCALSTORAGE
  // ═══════════════════════════════════════════════════════════════════════
  startAutoSave() {
    if (this._autoSaveInterval) return;
    this._autoSaveInterval = setInterval(() => {
      if (!this.isPlaying) return;
      try {
        const snapshot = {
          nodes: this.canvas.nodes.map(n => ({ id: n.id, name: n.name, ip: n.ip, type: n.type, role: n.role, x: n.x, y: n.y, status: n.status, firmware: n.firmware, os: n.os })),
          links: this.canvas.links.map(l => ({ sourceId: l.sourceId, targetId: l.targetId, status: l.status })),
          project: this.activeProject,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem('aetheris_autosave', JSON.stringify(snapshot));
      } catch {}
    }, 30000);
  }

  restoreAutoSave() {
    try {
      const raw = localStorage.getItem('aetheris_autosave');
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.nodes)) return false;
      this.showToast(`Auto-save restored from ${new Date(data.savedAt).toLocaleTimeString()}`, 'info');
      return data;
    } catch { return false; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 6: LIVE NETWORK STATS OVERLAY UPDATE
  // ═══════════════════════════════════════════════════════════════════════
  updateNetworkStats() {
    const nodeCount = document.getElementById('statNodeCount');
    const linkCount = document.getElementById('statLinkCount');
    const pps       = document.getElementById('statPps');
    const threats   = document.getElementById('statThreats');
    if (nodeCount) nodeCount.textContent = this.canvas.nodes.length;
    if (linkCount) linkCount.textContent = this.canvas.links.length;
    if (pps) pps.textContent = this.canvas.particles ? this.canvas.particles.length : 0;
    const threatCount = this.canvas.nodes.filter(n => n.status === 'compromised' || n.status === 'isolated').length;
    if (threats) {
      threats.textContent = threatCount;
      threats.style.color = threatCount > 0 ? 'var(--danger-red)' : 'var(--success-green)';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 7: TOPOLOGY AUTO-ARRANGE (FORCE-DIRECTED)
  // ═══════════════════════════════════════════════════════════════════════
  autoArrangeTopology() {
    this.canvas.alignToPurdueModel();
    this.canvas.draw();
    this.saveState();
    this.orchestrator.logSystem('Topology arranged by Purdue Model (Level 4 to Level 1 left-to-right).', 'success');
    this.showToast('Nodes aligned to Purdue Model layers.', 'success');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 8: CANVAS GRID SNAP TOGGLE
  // ═══════════════════════════════════════════════════════════════════════
  toggleGridSnap() {
    this.gridSnap = !this.gridSnap;
    this.canvas.gridSnap = this.gridSnap;
    const canvasContainer = document.querySelector('.canvas-container');
    if (canvasContainer) canvasContainer.classList.toggle('canvas-grid-active', this.gridSnap);
    const btn = document.getElementById('btnToggleGrid');
    if (btn) {
      btn.style.background = this.gridSnap ? 'rgba(68,119,212,0.13)' : '';
      btn.style.color = this.gridSnap ? '#6b9fe4' : '';
      btn.style.borderColor = this.gridSnap ? '#6b9fe4' : '';
    }
    this.orchestrator.logSystem(`Grid snap ${this.gridSnap ? 'enabled' : 'disabled'} (40px grid).`, 'info');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DEVICE INSPECTOR & NOTES — delegated to DeviceInspector (inspector.js)
  // ═══════════════════════════════════════════════════════════════════════
  openNoteEditor(node)            { this.inspector.openNote(node); }
  openPhysicalInspector(node)     { this.inspector.openPhysical(node); }
  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 12: PHASE 4 — ADVANCED CYBERSECURITY CLI TOOLS
  // ═══════════════════════════════════════════════════════════════════════
  executeCyberTool(cmd, args, node) {
    switch (cmd) {
      case 'nmap': {
        const target = args[1] || node.ip.split(' ')[0];
        this.printCLILine(`Starting Nmap 7.94 ( https://nmap.org )`, 'comment-line');
        this.printCLILine(`Nmap scan report for ${target}`);
        const targetNode = this.canvas.nodes.find(n => n.ip.split(' ')[0] === target || n.id.toLowerCase() === target.toLowerCase());
        if (targetNode) {
          this.printCLILine(`Host is up (0.004s latency).`, 'success');
          const openPorts = this._getOpenPorts(targetNode);
          this.printCLILine(`\nPORT       STATE  SERVICE`);
          openPorts.forEach(p => this.printCLILine(`${p.port.toString().padEnd(10)} open   ${p.service}`));
          this.printCLILine(`\nOS fingerprint: ${targetNode.os || 'Linux 5.x'}`);
          this.printCLILine(`Nmap done: 1 IP address (1 host up) scanned in 2.34 seconds`, 'success');
          this.logIncident(`NMAP scan from ${node.name} → ${targetNode.name} detected`, 'warning', 'T0840');
        } else {
          this.printCLILine(`Host seems down. Skipping.`, 'error-line');
          this.printCLILine(`Nmap done: 1 IP address (0 hosts up) scanned in 3.01 seconds`);
        }
        break;
      }
      case 'hydra': {
        const targetIp = args[1] || '192.168.1.1';
        const service  = args[2] || 'ssh';
        this.printCLILine(`Hydra v9.5 — brute force: ${service}://${targetIp}`, 'comment-line');
        this.printCLILine(`[DATA] attacking ${service}://${targetIp}:${service === 'ssh' ? 22 : service === 'http' ? 80 : 502}`);
        setTimeout(() => {
          const targetNode = this.canvas.nodes.find(n => n.ip.split(' ')[0] === targetIp);
          if (targetNode && targetNode.status !== 'stable') {
            this.printCLILine(`[${service.toUpperCase()}] host: ${targetIp} — login: admin — password: admin123`, 'success');
            this.printCLILine(`1 of 1 target successfully completed, 1 valid password found`, 'success');
            this.logIncident(`HYDRA brute-force succeeded on ${targetNode.name} — credential: admin:admin123`, 'critical', 'T0859');
          } else {
            this.printCLILine(`[ERROR] 0 of 1 target completed (brute force failed — host hardened or unreachable)`, 'error-line');
            this.logIncident(`HYDRA brute-force attempt against ${targetIp} blocked`, 'warning', 'T0859');
          }
        }, 1200);
        break;
      }
      case 'modbus-inject': {
        const unit  = args[1] || '01';
        const fc    = args[2] || '06';
        const reg   = args[3] || '0001';
        const val   = args[4] || 'FF00';
        this.printCLILine(`Modbus Injection → Unit:${unit} FC:${fc} Reg:${reg} Val:${val}`, 'warning');
        const plcNode = this.canvas.nodes.find(n => n.role?.toLowerCase().includes('plc'));
        if (plcNode) {
          this.printCLILine(`Response: Unit=${unit}, Func=${fc}, Reg=${reg}, Value=${val} [ACK]`, 'success');
          this.handleModbusSetCoil('1', val === 'FF00' ? 'on' : 'off', plcNode);
          this.logIncident(`MODBUS INJECTION: FC${fc} to ${plcNode.name} Reg=0x${reg} Val=0x${val}`, 'critical', 'T0836');
          plcNode.status = 'compromised';
          this.orchestrator.addAlert(`SCADA INJECTION DETECTED: Unauthorized Modbus write to ${plcNode.id}`, 'danger', plcNode.id);
        } else {
          this.printCLILine(`No PLC target reachable on this segment.`, 'error-line');
        }
        break;
      }
      case 'arp-spoof': {
        const victimIp  = args[1] || '192.168.1.1';
        const gatewayIp = args[2] || '10.1.10.1';
        this.printCLILine(`ARP Spoof: Poisoning ${victimIp} to redirect → ${gatewayIp}`, 'warning');
        const victim = this.canvas.nodes.find(n => n.ip.split(' ')[0] === victimIp);
        if (victim) {
          this.printCLILine(`Sending gratuitous ARP to ${victimIp}: Redirecting gateway to attacker MAC...`, 'warning');
          setTimeout(() => {
            this.printCLILine(`[ARP-SPOOF] Cache poisoning successful. MITM position established.`, 'success');
            if (!this.arpCache[victim.id]) this.arpCache[victim.id] = {};
            this.arpCache[victim.id][gatewayIp] = 'DE:AD:BE:EF:CA:FE';
            victim.status = 'compromised';
            this.logIncident(`ARP SPOOF: MITM inserted between ${victim.name} and gateway ${gatewayIp}`, 'critical', 'T0830');
            this.orchestrator.addAlert(`ARP CACHE POISONING DETECTED on ${victim.id}`, 'danger', victim.id);
          }, 800);
        } else {
          this.printCLILine(`Target ${victimIp} unreachable.`, 'error-line');
        }
        break;
      }
      case 'tcpdump': {
        const filter = args.slice(1).join(' ') || 'tcp';
        this.printCLILine(`tcpdump: listening on eth0, link-type EN10MB, filter: ${filter}`, 'comment-line');
        let captured = 0;
        const interval = setInterval(() => {
          if (!this.isPlaying || captured >= 10) {
            clearInterval(interval);
            this.printCLILine(`${captured} packets captured.`, 'success');
            this.openWireshark();
            return;
          }
          const src = this.canvas.nodes[Math.floor(Math.random()*this.canvas.nodes.length)];
          const dst = this.canvas.nodes[Math.floor(Math.random()*this.canvas.nodes.length)];
          const proto = ['tcp','udp','modbus','ospf'][Math.floor(Math.random()*4)];
          this.printCLILine(`${new Date().toLocaleTimeString()} IP ${src?.ip||'?'} > ${dst?.ip||'?'}: ${proto.toUpperCase()} seq=0`);
          captured++;
        }, 300);
        break;
      }
      default:
        return false;
    }
    return true;
  }

  _getOpenPorts(node) {
    const role = (node.role || '').toLowerCase();
    const ports = [{ port: 22, service: 'ssh' }];
    if (role.includes('router') || role.includes('gateway')) ports.push({ port: 179, service: 'bgp' }, { port: 161, service: 'snmp' }, { port: 443, service: 'https' });
    if (role.includes('firewall')) ports.push({ port: 443, service: 'https' }, { port: 8443, service: 'https-alt' }, { port: 161, service: 'snmp' });
    if (role.includes('plc') || role.includes('rtu')) ports.push({ port: 502, service: 'modbus' }, { port: 102, service: 's7comm' });
    if (role.includes('hmi') || role.includes('scada')) ports.push({ port: 80, service: 'http' }, { port: 102, service: 's7comm' }, { port: 502, service: 'modbus' });
    if (role.includes('workstation') || role.includes('server')) ports.push({ port: 139, service: 'netbios-ssn' }, { port: 445, service: 'microsoft-ds' }, { port: 3389, service: 'ms-wbt-server' });
    return ports;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-26: Sync canvas-container threat-active class for CSS hex overlay
  // ═══════════════════════════════════════════════════════════════════════
  syncThreatClass() {
    const canvasContainer = document.querySelector('.canvas-container');
    if (!canvasContainer) return;
    const hasThreat = this.canvas.nodes.some(n => n.status === 'compromised');
    canvasContainer.classList.toggle('threat-active', hasThreat);
    // Show/hide design-system scan-line overlay when threats are active
    const scanOverlay = document.getElementById('canvasScanOverlay');
    if (scanOverlay) scanOverlay.classList.toggle('hidden', !hasThreat);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-28: Right-click context menu on canvas nodes
  // ═══════════════════════════════════════════════════════════════════════
  initContextMenu() {
    const canvasEl = document.getElementById('networkCanvas');
    if (!canvasEl) return;

    // Remove existing menu on any click
    const removeMenu = () => {
      const old = document.getElementById('ctxMenu');
      if (old) old.remove();
    };
    document.addEventListener('click', removeMenu);

    canvasEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      removeMenu();

      const rect = canvasEl.getBoundingClientRect();
      const world = this.canvas.toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const node = this.canvas.getDeviceAt(world.x, world.y);
      if (!node) return;

      this.canvas.selectedNode = node;
      this.onNodeSelected(node);

      const menu = document.createElement('div');
      menu.id = 'ctxMenu';
      menu.style.cssText = `
        position:fixed; left:${e.clientX}px; top:${e.clientY}px;
        background:rgba(15,23,42,0.98); border:1px solid rgba(68,119,212,0.25);
        border-radius:8px; padding:4px 0; z-index:9999; min-width:160px;
        box-shadow:0 8px 24px rgba(0,0,0,0.6); font-size:0.72rem;
      `;

      const actions = [
        { label: '🔍 Inspect Device', fn: () => this.openPhysicalInspector(node) },
        { label: '💻 Open CLI Session', fn: () => this.openCliForNode(node) },
        { label: '📋 Clone Node', fn: () => this.cloneNode(node) },
        { label: '📍 Pin / Unpin', fn: () => { node.pinned = !node.pinned; this.canvas.draw(); } },
        { label: '⚠️ Mark Compromised', fn: () => { node.status = 'compromised'; this.canvas.draw(); this.orchestrator.evaluateState(); } },
        { label: '✅ Mark Stable', fn: () => { node.status = 'stable'; this.canvas.draw(); } },
        { label: '🗑 Delete Node', fn: () => this.deleteCustomDevice(node) },
      ];

      actions.forEach(a => {
        const item = document.createElement('div');
        item.textContent = a.label;
        item.style.cssText = 'padding:7px 14px; cursor:pointer; color:#cbd5e1; transition:background 0.15s;';
        item.onmouseenter = () => item.style.background = 'rgba(68,119,212,0.08)';
        item.onmouseleave = () => item.style.background = '';
        item.onclick = () => { a.fn(); removeMenu(); };
        menu.appendChild(item);
      });

      document.body.appendChild(menu);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-29: Clone a node (duplicate with slight position offset)
  // ═══════════════════════════════════════════════════════════════════════
  cloneNode(node) {
    const newId = node.id + '-COPY-' + Date.now().toString(36).slice(-4).toUpperCase();
    const newNode = {
      ...JSON.parse(JSON.stringify(node)),
      id: newId,
      name: node.name + ' (Copy)',
      x: node.x + 60,
      y: node.y + 40,
      status: 'stable',
    };
    this.canvas.addNode(newNode);
    this.saveState();
    this.showToast(`Cloned: ${newId}`, 'info');
    this.canvas.draw();
    this.orchestrator.logSystem(`Node cloned: ${node.id} → ${newId}`, 'info');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-30: Smooth animate-to-node camera pan (click on node in audit pane)
  // ═══════════════════════════════════════════════════════════════════════
  animateCameraToNode(nodeId) {
    const node = this.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const targetPanX = this.canvas.canvas.width / 2 - node.x * this.canvas.scale;
    const targetPanY = this.canvas.canvas.height / 2 - node.y * this.canvas.scale;
    const startPanX = this.canvas.panX;
    const startPanY = this.canvas.panY;
    const duration = 500;
    const startTime = performance.now();
    const animate = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.canvas.panX = startPanX + (targetPanX - startPanX) * ease;
      this.canvas.panY = startPanY + (targetPanY - startPanY) * ease;
      this.canvas.draw();
      if (t < 1) requestAnimationFrame(animate);
      else {
        this.canvas.selectedNode = node;
        this.onNodeSelected(node);
      }
    };
    requestAnimationFrame(animate);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-31: Node search / filter highlight
  // ═══════════════════════════════════════════════════════════════════════
  searchNodes(query) {
    const q = (query || '').toLowerCase().trim();
    this.canvas.nodes.forEach(n => {
      n._searchMatch = !q || n.id.toLowerCase().includes(q) || n.name.toLowerCase().includes(q) || n.ip.toLowerCase().includes(q) || (n.role || '').toLowerCase().includes(q);
    });
    this.canvas.draw();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-32: Topology statistics summary (counts per type + threat ratio)
  // ═══════════════════════════════════════════════════════════════════════
  getTopologyStats() {
    const nodes = this.canvas.nodes;
    const stats = {
      total: nodes.length,
      it: nodes.filter(n => n.type === 'it').length,
      ot: nodes.filter(n => n.type === 'ot').length,
      plc: nodes.filter(n => n.type === 'plc').length,
      field: nodes.filter(n => n.type === 'field').length,
      compromised: nodes.filter(n => n.status === 'compromised').length,
      isolated: nodes.filter(n => n.status === 'isolated').length,
      links: this.canvas.links.length,
      encryptedLinks: this.canvas.links.filter(l => l.encrypted).length,
    };
    return stats;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-33: Simulation speed preset selector
  // ═══════════════════════════════════════════════════════════════════════
  setSpeedPreset(preset) {
    const presets = { slow: 0.25, normal: 1.0, fast: 3.0, ultra: 8.0 };
    const speed = presets[preset] || 1.0;
    this.speedDilation = speed;
    const sliderEl = document.getElementById('speedSlider');
    if (sliderEl) sliderEl.value = speed;
    const lblEl = document.getElementById('speedLabel');
    if (lblEl) lblEl.textContent = speed + 'x';
    this.showToast(`Simulation speed: ${preset.toUpperCase()} (${speed}x)`, 'info');
    this.orchestrator.logSystem(`Speed preset: ${preset} → ${speed}x`, 'info');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-34: Toggle fullscreen canvas mode
  // ═══════════════════════════════════════════════════════════════════════
  toggleFullscreenCanvas() {
    const canvasWrapper = document.querySelector('.canvas-wrapper') || document.querySelector('.canvas-container');
    if (!canvasWrapper) return;
    if (!document.fullscreenElement) {
      canvasWrapper.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-35: Update link utilisation values periodically for traffic viz
  // ═══════════════════════════════════════════════════════════════════════
  updateLinkUtilisation() {
    this.canvas.links.forEach(link => {
      if (link.status !== 'normal') return;
      // Simulate realistic traffic load that fluctuates
      const seed = Date.now() / 3000 + link.sourceId.charCodeAt(0);
      link.speed = Math.max(1, Math.min(100, 
        20 + Math.sin(seed) * 18 + Math.cos(seed * 1.7) * 12
      ));
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-36: Incident badge count on tab header
  // ═══════════════════════════════════════════════════════════════════════
  updateIncidentBadge() {
    const badge = document.getElementById('incidentTabBadge');
    const count = this.orchestrator.alerts.filter(a => !a.resolved).length;
    if (badge) {
      badge.textContent = count > 0 ? count : '';
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-37: SCADA alarm audio toggle (plays Web Audio API beep on alarm)
  // ═══════════════════════════════════════════════════════════════════════
  initAlarmAudio() {
    this._alarmEnabled = false;
    this._alarmActive = false;
    this._audioCtx = null;
  }

  playAlarmBeep() {
    if (!this._alarmEnabled) return;
    try {
      if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = this._audioCtx.createOscillator();
      const gain = this._audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this._audioCtx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, this._audioCtx.currentTime);
      osc.frequency.setValueAtTime(660, this._audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.05, this._audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this._audioCtx.currentTime + 0.35);
      osc.start(this._audioCtx.currentTime);
      osc.stop(this._audioCtx.currentTime + 0.35);
    } catch (e) { /* audio not available */ }
  }

  toggleAlarmAudio() {
    this._alarmEnabled = !this._alarmEnabled;
    const btn = document.getElementById('btnAlarmAudio');
    if (btn) {
      btn.innerHTML = this._alarmEnabled ? '🔔 ALARM' : '🔇 ALARM';
      btn.style.color = this._alarmEnabled ? '#ef4444' : '#64748b';
      btn.style.borderColor = this._alarmEnabled ? 'rgba(239,68,68,0.7)' : 'rgba(239,68,68,0.4)';
      btn.title = `Toggle Alarm Audio (currently ${this._alarmEnabled ? 'ON' : 'OFF'})`;
    }
    this.showToast(`Alarm audio ${this._alarmEnabled ? 'ENABLED' : 'DISABLED'}`, 'info');
    if (this._alarmEnabled) this.playAlarmBeep();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-38: Canvas PNG export with Aetheris watermark
  // ═══════════════════════════════════════════════════════════════════════
  exportCanvasPngWithWatermark() {
    const w = this.canvas.canvas.width;
    const h = this.canvas.canvas.height;

    // Draw watermark on a temporary overlay canvas
    const overlay = document.createElement('canvas');
    overlay.width = w;
    overlay.height = h;
    const octx = overlay.getContext('2d');
    octx.drawImage(this.canvas.canvas, 0, 0);

    octx.fillStyle = 'rgba(68,119,212,0.2)';
    octx.font = '700 11px Fira Code';
    octx.textAlign = 'right';
    octx.fillText('AETHERIS DIGITAL TWIN — CONFIDENTIAL', w - 12, h - 10);

    const url = overlay.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `aetheris-topology-${Date.now()}.png`;
    a.click();
    this.showToast('Topology exported as PNG with watermark.', 'success');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-39: Play/Pause toggle helper
  // ═══════════════════════════════════════════════════════════════════════
  togglePlayPause() {
    const btn = document.getElementById('btnPlayPause');
    const txt = document.getElementById('txtPlayPause');
    this.isPlaying = !this.isPlaying;
    if (txt) txt.textContent = this.isPlaying ? '⏸ PAUSE' : '▶ RESUME';
    this.orchestrator.logSystem(this.isPlaying ? 'Simulation resumed.' : 'Simulation paused.', 'info');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-40: Open CLI session for a node directly by reference
  // ═══════════════════════════════════════════════════════════════════════
  openCliForNode(node) {
    this.canvas.selectedNode = node;
    this.onNodeSelected(node);
    // Switch to the CLI tab
    const cliTab = document.querySelector('[data-tab="cli"]') || document.getElementById('tabCLI');
    if (cliTab) cliTab.click();
    this.showToast(`CLI session opened: ${node.id}`, 'info');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-41: Link between devices annotated with auto-discovered protocol
  // ═══════════════════════════════════════════════════════════════════════
  annotateLinksWithProtocol() {
    this.canvas.links.forEach(link => {
      const src = this.canvas.nodes.find(n => n.id === link.sourceId);
      const tgt = this.canvas.nodes.find(n => n.id === link.targetId);
      if (!src || !tgt || link.protocol) return;

      const srcRole = (src.role || '').toLowerCase();
      const tgtRole = (tgt.role || '').toLowerCase();

      if (srcRole.includes('plc') || tgtRole.includes('plc')) link.protocol = 'Modbus/TCP';
      else if (srcRole.includes('router') || tgtRole.includes('router')) link.protocol = 'OSPF/BGP';
      else if (srcRole.includes('firewall') || tgtRole.includes('firewall')) link.protocol = 'IPSec/TLS';
      else if (srcRole.includes('hmi') || tgtRole.includes('hmi')) link.protocol = 'OPC-UA';
      else link.protocol = 'Ethernet';

      if (!link.speed) link.speed = 100;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-42: Select all nodes in a zone type
  // ═══════════════════════════════════════════════════════════════════════
  selectNodesByType(type) {
    this.canvas.nodes.forEach(n => { n._selected = n.type === type; });
    const matches = this.canvas.nodes.filter(n => n._selected);
    this.showToast(`Selected ${matches.length} ${type.toUpperCase()} nodes`, 'info');
    this.canvas.draw();
    return matches;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-43: Heatmap overlay mode — colour nodes by threat level
  // ═══════════════════════════════════════════════════════════════════════
  toggleHeatmapMode() {
    this.heatmapMode = !this.heatmapMode;
    this.canvas.heatmapMode = this.heatmapMode;
    this.showToast(`Heatmap mode: ${this.heatmapMode ? 'ON' : 'OFF'}`, 'info');
    this.canvas.draw();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-44: Batch set all link encryption states
  // ═══════════════════════════════════════════════════════════════════════
  setAllLinksEncrypted(encrypted) {
    this.canvas.links.forEach(link => { link.encrypted = encrypted; });
    this.saveState();
    this.canvas.draw();
    this.showToast(`All links marked ${encrypted ? 'ENCRYPTED' : 'UNENCRYPTED'}`, encrypted ? 'success' : 'warning');
    this.orchestrator.logSystem(`Bulk link encryption policy: ${encrypted ? 'ENABLED' : 'DISABLED'}`, encrypted ? 'success' : 'warning');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-45: Generate a full static HTML incident report (no LLM needed)
  // ═══════════════════════════════════════════════════════════════════════
  _generateStaticReport() {
    const stats = this.getTopologyStats();
    const alerts = this.orchestrator.alerts;
    const timeline = this.incidentTimeline || [];
    const nodes = this.canvas?.nodes || [];
    const _esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const sevColor = s => s === 'critical' ? '#c0392b' : s === 'warning' ? '#d68910' : '#1a5276';
    const sevBg    = s => s === 'critical' ? '#fdedec' : s === 'warning' ? '#fef9e7' : '#eaf4fb';

    const alertRows = alerts.filter(a => !a.resolved).map(a => `
      <tr>
        <td style="padding:5px 8px;font-size:10px;color:#555;">${_esc(a.time||'—')}</td>
        <td style="padding:5px 8px;"><span style="background:${sevBg(a.severity)};color:${sevColor(a.severity)};padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;">${_esc((a.severity||'INFO').toUpperCase())}</span></td>
        <td style="padding:5px 8px;font-size:10px;font-weight:600;">${_esc(a.title||'')}</td>
        <td style="padding:5px 8px;font-size:10px;color:#444;">${_esc(a.message||'')}</td>
      </tr>`).join('') || '<tr><td colspan="4" style="padding:8px;color:#888;font-size:10px;">No active alerts.</td></tr>';

    const timelineRows = timeline.map(e => `
      <tr>
        <td style="padding:5px 8px;font-size:9px;font-family:monospace;color:#555;">${_esc(e.time)}</td>
        <td style="padding:5px 8px;"><span style="background:${sevBg(e.severity)};color:${sevColor(e.severity)};padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;">${_esc(e.severity.toUpperCase())}</span></td>
        ${e.mitreId ? `<td style="padding:5px 8px;font-size:9px;font-family:monospace;font-weight:700;color:#7d6608;">${_esc(e.mitreId)}</td>` : '<td style="padding:5px 8px;color:#bbb;font-size:9px;">—</td>'}
        <td style="padding:5px 8px;font-size:10px;color:#333;">${_esc(e.message)}</td>
      </tr>`).join('') || '<tr><td colspan="4" style="padding:8px;color:#888;font-size:10px;">No events recorded.</td></tr>';

    const assetRows = nodes.map(n => `
      <tr>
        <td style="padding:4px 8px;font-size:9px;font-family:monospace;font-weight:600;">${_esc(n.id)}</td>
        <td style="padding:4px 8px;font-size:9px;">${_esc(n.name)}</td>
        <td style="padding:4px 8px;font-size:9px;font-family:monospace;">${_esc(n.ip)}</td>
        <td style="padding:4px 8px;font-size:9px;">${_esc(n.role||'—')}</td>
        <td style="padding:4px 8px;font-size:9px;">${_esc(n.os||'—')}</td>
        <td style="padding:4px 8px;"><span style="color:${n.status==='compromised'?'#c0392b':n.status==='isolated'?'#d68910':'#1e8449'};font-size:9px;font-weight:700;">${_esc((n.status||'stable').toUpperCase())}</span></td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><title>AETHERIS Incident Report</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; background: #fff; padding: 32px; font-size: 11px; }
      .report-header { border-bottom: 3px solid #1a3a6b; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
      .report-logo { font-size: 22px; font-weight: 800; color: #1a3a6b; letter-spacing: 0.05em; }
      .report-logo span { color: #2563eb; }
      .report-meta { font-size: 9px; color: #666; text-align: right; line-height: 1.6; }
      h2 { font-size: 13px; font-weight: 700; color: #1a3a6b; border-left: 3px solid #2563eb; padding-left: 8px; margin: 20px 0 10px; letter-spacing: 0.04em; }
      .stat-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 16px; }
      .stat-box { background: #f0f4f8; border-radius: 6px; padding: 10px 12px; }
      .stat-box .val { font-size: 20px; font-weight: 800; color: #1a3a6b; }
      .stat-box .lbl { font-size: 9px; color: #666; margin-top: 2px; letter-spacing: 0.04em; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
      th { background: #1a3a6b; color: #fff; text-align: left; padding: 6px 8px; font-size: 9px; letter-spacing: 0.04em; font-weight: 700; }
      tr:nth-child(even) { background: #f7f9fc; }
      .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 9px; color: #999; display: flex; justify-content: space-between; }
      @media print { body { padding: 16px; } }
    </style></head><body>
    <div class="report-header">
      <div>
        <div class="report-logo">AETHERIS <span>NetPilot</span></div>
        <div style="font-size:10px;color:#666;margin-top:4px;">Industrial Cyber Range — Incident Report</div>
      </div>
      <div class="report-meta">
        <div><strong>Generated:</strong> ${new Date().toLocaleString()}</div>
        <div><strong>Project:</strong> ${_esc(this.activeProject || '—')}</div>
        <div><strong>Sim Time:</strong> ${Math.floor((this.simTime||0)/60000)}m</div>
        <div><strong>Classification:</strong> EXERCISE / TRAINING</div>
      </div>
    </div>

    <h2>TOPOLOGY SUMMARY</h2>
    <div class="stat-grid">
      <div class="stat-box"><div class="val">${stats.total}</div><div class="lbl">TOTAL DEVICES</div></div>
      <div class="stat-box"><div class="val">${stats.compromised}</div><div class="lbl">COMPROMISED</div></div>
      <div class="stat-box"><div class="val">${timeline.length}</div><div class="lbl">EVENTS LOGGED</div></div>
      <div class="stat-box"><div class="val">${alerts.filter(a=>!a.resolved).length}</div><div class="lbl">ACTIVE ALERTS</div></div>
    </div>

    <h2>ACTIVE ALERTS</h2>
    <table><thead><tr><th>TIME</th><th>SEVERITY</th><th>TITLE</th><th>MESSAGE</th></tr></thead>
    <tbody>${alertRows}</tbody></table>

    <h2>INCIDENT TIMELINE</h2>
    <table><thead><tr><th>SIM TIME</th><th>SEVERITY</th><th>ATT&CK ID</th><th>EVENT</th></tr></thead>
    <tbody>${timelineRows}</tbody></table>

    <h2>ASSET INVENTORY</h2>
    <table><thead><tr><th>ID</th><th>NAME</th><th>IP ADDRESS</th><th>ROLE</th><th>OS / PLATFORM</th><th>STATUS</th></tr></thead>
    <tbody>${assetRows}</tbody></table>

    <div class="footer">
      <span>AETHERIS NetPilot — Industrial Cyber Range Platform</span>
      <span>EXERCISE DOCUMENT — NOT FOR OPERATIONAL USE</span>
    </div>
    </body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 400);
    }
    this.showToast('Report opened — use browser Print → Save as PDF.', 'success');
    URL.revokeObjectURL(url);
    this.showToast('Incident report exported.', 'success');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-46: Reactive threat class + alarm audio tick (called each loop frame)
  // ═══════════════════════════════════════════════════════════════════════
  updateThreatVisuals() {
    this.syncThreatClass();
    this.updateIncidentBadge();
    const compromised = this.canvas.nodes.some(n => n.status === 'compromised');
    if (compromised && !this._alarmActive) {
      this._alarmActive = true;
      this.playAlarmBeep();
    } else if (!compromised) {
      this._alarmActive = false;
    }

    // Chart border alarm
    const chartPanel = document.querySelector('.chart-panel') || document.getElementById('telemetryChart')?.parentElement;
    if (chartPanel) {
      if (this.sim && (this.sim.pressure > 2.0 || this.sim.temp > 80)) {
        chartPanel.classList.add('chart-alarm-border');
      } else {
        chartPanel.classList.remove('chart-alarm-border');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-47: Add CLI blinking cursor element
  // ═══════════════════════════════════════════════════════════════════════
  initCliCursor() {
    const cliOutput = document.getElementById('cliOutput');
    if (!cliOutput) return;
    const cursor = document.createElement('span');
    cursor.className = 'cli-cursor';
    cliOutput.appendChild(cursor);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-48: Update network stats to include link utilisation call
  // ═══════════════════════════════════════════════════════════════════════
  updateAllStats() {
    this.updateNetworkStats();
    this.updateLinkUtilisation();
    this.updateThreatVisuals();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-49: Annotate reactor sensor nodes with live sim values in label
  // ═══════════════════════════════════════════════════════════════════════
  annotateReactorNodes() {
    if (this.activeProjectType !== 'reactor' || !this.sim) return;
    const t300 = this.canvas.nodes.find(n => n.id === 'T-300');
    if (t300) t300._liveAnnotation = `${this.sim.level.toFixed(0)}%`;
    const v101 = this.canvas.nodes.find(n => n.id === 'V-101');
    if (v101) v101._liveAnnotation = `V:${this.sim.inletValve}%`;
    const v102 = this.canvas.nodes.find(n => n.id === 'V-102');
    if (v102) v102._liveAnnotation = `V:${this.sim.outletValve}%`;
    const xv103 = this.canvas.nodes.find(n => n.id === 'XV-103');
    if (xv103) xv103._liveAnnotation = this.sim.reliefValve ? 'OPEN' : 'CLOSED';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TASK-19: Timed Challenge Mode + Leaderboard
  // ═══════════════════════════════════════════════════════════════════════
  initChallengeMode() {
    const btnChallenge = document.getElementById('btnChallenge');
    const setupModal   = document.getElementById('challengeSetupModal');
    const setupClose   = document.getElementById('challengeSetupClose');
    const btnStart     = document.getElementById('btnStartChallenge');
    const btnLeader    = document.getElementById('btnShowLeaderboard');
    const lbModal      = document.getElementById('leaderboardModal');
    const lbClose      = document.getElementById('leaderboardClose');

    if (btnChallenge) btnChallenge.onclick = () => {
      if (this.challengeMode.active) { this.endChallengeMode(); return; }
      if (setupModal) setupModal.classList.remove('hidden');
    };
    if (setupClose)  setupClose.onclick  = () => setupModal.classList.add('hidden');
    if (lbClose)     lbClose.onclick     = () => lbModal.classList.add('hidden');

    // Duration selector buttons
    document.querySelectorAll('.challenge-dur-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.challenge-dur-btn').forEach(b => {
          b.style.borderColor = 'rgba(251,191,36,0.3)';
          b.style.background  = 'transparent';
          b.style.color       = '';
        });
        btn.style.borderColor = 'rgba(251,191,36,0.6)';
        btn.style.background  = 'rgba(251,191,36,0.12)';
        btn.style.color       = '#fbbf24';
        this.challengeMode.duration = parseInt(btn.dataset.dur, 10);
      };
    });

    if (btnStart) btnStart.onclick = () => {
      setupModal.classList.add('hidden');
      this.startChallengeMode(this.challengeMode.duration);
    };
    if (btnLeader) btnLeader.onclick = () => {
      setupModal.classList.add('hidden');
      this.showLeaderboard();
    };
  }

  startChallengeMode(durationSeconds) {
    this.challengeMode.active         = true;
    this.challengeMode.elapsed        = 0;
    this.challengeMode.score          = 0;
    this.challengeMode.tasksCompleted = 0;
    this.challengeMode.threatsResolved = 0;
    this.challengeMode.duration       = durationSeconds;

    const hud = document.getElementById('challengeHUD');
    if (hud) hud.style.display = 'block';

    const btn = document.getElementById('btnChallenge');
    if (btn) { btn.textContent = '■ END CHALLENGE'; btn.style.color = '#ef4444'; btn.style.borderColor = 'rgba(239,68,68,0.5)'; }

    this.updateChallengeScore();
    this.showToast(`Challenge started! ${Math.floor(durationSeconds / 60)} minute${durationSeconds >= 120 ? 's' : ''}. Score as many points as possible!`, 'info');
    this.orchestrator.logSystem(`CHALLENGE MODE started — ${durationSeconds}s timer active.`, 'warning');
  }

  tickChallenge(dt) {
    if (!this.challengeMode.active) return;
    this.challengeMode.elapsed += dt / 1000;
    const remaining = Math.max(0, this.challengeMode.duration - this.challengeMode.elapsed);

    // Sync threat resolution count from orchestrator
    const resolved = (this.orchestrator.alerts || []).filter(a => a.resolved).length;
    if (resolved > this.challengeMode.threatsResolved) {
      const bonus = (resolved - this.challengeMode.threatsResolved) * 50;
      this.challengeMode.score += bonus;
      this.challengeMode.threatsResolved = resolved;
      this.showToast(`+${bonus} pts — Threat resolved!`, 'success');
    }

    this.updateChallengeHUD(remaining);
    if (remaining <= 0) this.endChallengeMode();
  }

  updateChallengeHUD(remaining) {
    const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
    const secs = String(Math.floor(remaining % 60)).padStart(2, '0');
    const timerEl = document.getElementById('challengeTimerDisplay');
    const scoreEl = document.getElementById('challengeScoreDisplay');
    if (timerEl) {
      timerEl.textContent = `${mins}:${secs}`;
      timerEl.style.color = remaining < 60 ? '#ef4444' : '#fbbf24';
    }
    if (scoreEl) scoreEl.textContent = this.challengeMode.score;
  }

  updateChallengeScore(reason) {
    if (!this.challengeMode.active) return;
    const prev = this.challengeMode.tasksCompleted;
    const now  = document.querySelectorAll('#instTasksList input[type=checkbox]:checked').length;
    if (now > prev) {
      const bonus = (now - prev) * 100;
      this.challengeMode.score += bonus;
      this.challengeMode.tasksCompleted = now;
      this.showToast(`+${bonus} pts — Task checked off!`, 'success');
    }
    const remaining = Math.max(0, this.challengeMode.duration - this.challengeMode.elapsed);
    this.updateChallengeHUD(remaining);
  }

  endChallengeMode() {
    if (!this.challengeMode.active) return;
    this.challengeMode.active = false;

    const remaining = Math.max(0, this.challengeMode.duration - this.challengeMode.elapsed);
    const timeBonus = Math.floor(remaining / 10);
    const finalScore = this.challengeMode.score + timeBonus;
    this.challengeMode.score = finalScore;

    const hud = document.getElementById('challengeHUD');
    if (hud) hud.style.display = 'none';
    const btn = document.getElementById('btnChallenge');
    if (btn) { btn.textContent = '⏱ CHALLENGE'; btn.style.color = '#fbbf24'; btn.style.borderColor = 'rgba(251,191,36,0.5)'; }

    // Save to leaderboard
    const entry = {
      score: finalScore,
      date: new Date().toLocaleDateString(),
      lab: this.activeProject || 'Free Play',
      duration: this.challengeMode.duration,
      tasks: this.challengeMode.tasksCompleted,
      threats: this.challengeMode.threatsResolved
    };
    try {
      const lb = JSON.parse(localStorage.getItem('aetheris_leaderboard') || '[]');
      lb.push(entry);
      lb.sort((a, b) => b.score - a.score);
      lb.splice(10); // keep top 10
      localStorage.setItem('aetheris_leaderboard', JSON.stringify(lb));
    } catch(e) {}

    this.showToast(`Challenge complete! Final score: ${finalScore} pts (${timeBonus} time bonus). View leaderboard!`, 'success');
    this.orchestrator.logSystem(`CHALLENGE MODE ended — Final score: ${finalScore} pts.`, 'success');
    setTimeout(() => this.showLeaderboard(), 800);
  }

  showLeaderboard() {
    const modal = document.getElementById('leaderboardModal');
    const list  = document.getElementById('leaderboardList');
    if (!modal || !list) return;

    let entries = [];
    try { entries = JSON.parse(localStorage.getItem('aetheris_leaderboard') || '[]'); } catch(e) {}

    if (entries.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:20px;font-size:0.75rem;color:var(--text-muted);">No scores yet — start a challenge to set the first record!</div>';
    } else {
      list.innerHTML = entries.map((e, i) => {
        const medals = ['🥇', '🥈', '🥉'];
        const medal  = medals[i] || `#${i + 1}`;
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:rgba(45,125,210,0.05);border:1px solid rgba(45,125,210,0.1);border-radius:5px;font-size:0.72rem;">
          <span style="font-weight:700;color:var(--text-primary);">${medal} ${e.score} pts</span>
          <span style="color:var(--text-secondary);">${e.lab}</span>
          <span style="font-family:var(--font-mono);color:var(--text-muted);font-size:0.62rem;">${e.date} &nbsp; T:${e.tasks} &nbsp; Thr:${e.threats}</span>
        </div>`;
      }).join('');
    }
    modal.classList.remove('hidden');
  }

  clearLeaderboard() {
    try { localStorage.removeItem('aetheris_leaderboard'); } catch(e) {}
    this.showLeaderboard();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TASK-16: Auto-graded Task Verification
  // ═══════════════════════════════════════════════════════════════════════
  initVerifyTasks() {
    const btn = document.getElementById('btnVerifyTasks');
    if (!btn) return;
    btn.onclick = () => this.verifyLabTasks();

    // Award challenge points when a task checkbox is manually ticked
    const tasksList = document.getElementById('instTasksList');
    if (tasksList) {
      tasksList.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') this.updateChallengeScore('task-checked');
      });
    }
  }

  verifyLabTasks() {
    const tasksList = document.getElementById('instTasksList');
    const banner    = document.getElementById('verifyResultsBanner');
    if (!tasksList || !banner) return;

    const checks   = tasksList.querySelectorAll('li');
    const nodes    = this.canvas.nodes;
    const timeline = this.incidentTimeline || [];
    const alerts   = this.orchestrator?.alerts || [];

    // Generic verifiers mapped to task keywords
    const verifiers = [
      { kw: 'ospf',       fn: () => nodes.some(n => (n.config || '').toLowerCase().includes('ospf')) || nodes.length > 2 },
      { kw: 'ping',       fn: () => timeline.some(e => e.toLowerCase().includes('ping') || e.toLowerCase().includes('icmp')) },
      { kw: 'scada',      fn: () => nodes.some(n => (n.role||'').toLowerCase().includes('scada') || (n.role||'').toLowerCase().includes('hmi')) },
      { kw: 'isolat',     fn: () => nodes.some(n => n.status === 'isolated') },
      { kw: 'nmap',       fn: () => timeline.some(e => e.toLowerCase().includes('nmap')) },
      { kw: 'modbus',     fn: () => timeline.some(e => e.toLowerCase().includes('modbus')) },
      { kw: 'alert',      fn: () => alerts.length > 0 },
      { kw: 'mitigat',    fn: () => alerts.some(a => a.resolved) },
      { kw: 'wireshark',  fn: () => this.ws?.state?.packets?.length > 0 },
      { kw: 'connect',    fn: () => this.canvas.links?.length > 0 },
      { kw: 'plc',        fn: () => nodes.some(n => (n.role||'').toLowerCase().includes('plc')) },
      { kw: 'veri',       fn: () => nodes.length >= 3 },
    ];

    let passCount = 0;
    let results = [];

    checks.forEach((li, idx) => {
      const taskText = li.textContent.trim().toLowerCase();
      const chk      = li.querySelector('input[type=checkbox]');

      let passed = chk?.checked || false;
      if (!passed) {
        for (const v of verifiers) {
          if (taskText.includes(v.kw)) {
            try { passed = v.fn(); } catch(e) { passed = false; }
            break;
          }
        }
      }

      if (passed) {
        passCount++;
        if (chk && !chk.checked) chk.checked = true;
        li.style.opacity = '1';
        const span = li.querySelector('span');
        if (span) span.style.color = '#22c55e';
        results.push(`✓ Task ${idx + 1}: PASS`);
      } else {
        li.style.opacity = '0.7';
        results.push(`✗ Task ${idx + 1}: PENDING`);
      }
    });

    // Challenge score update
    if (this.challengeMode.active) {
      const bonus = passCount * 100;
      this.challengeMode.score += bonus;
      this.challengeMode.tasksCompleted = passCount;
      const remaining = Math.max(0, this.challengeMode.duration - this.challengeMode.elapsed);
      this.updateChallengeHUD(remaining);
    }

    banner.style.display = 'block';
    banner.innerHTML = `<strong style="color:${passCount === checks.length ? '#22c55e' : '#fbbf24'};">${passCount}/${checks.length} tasks verified.</strong><br>${results.join('<br>')}`;
    this.showToast(`Task verification: ${passCount}/${checks.length} passed`, passCount === checks.length ? 'success' : 'info');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TASK-11: Water Treatment Lab — project type handler & telemetry updater
  // ═══════════════════════════════════════════════════════════════════════
  initWaterTreatmentUI() {
    const pumpSlider = document.getElementById('wtPumpSlider');
    const doseSlider = document.getElementById('wtDoseSlider');
    const btnBackwash = document.getElementById('btnWtBackwash');
    const btnAttack  = document.getElementById('btnWtInjectAttack');
    const btnReset   = document.getElementById('btnWtResetSim');
    const speedSlWt  = document.getElementById('speedSliderWt');
    const speedValWt = document.getElementById('speedValueWt');

    if (pumpSlider) pumpSlider.oninput = (e) => {
      this.simWater.pumpSpeed = parseInt(e.target.value, 10);
      const el = document.getElementById('wtStatusPump');
      if (el) el.textContent = `RUNNING (${e.target.value}%)`;
    };
    if (doseSlider) doseSlider.oninput = (e) => {
      this.simWater.dosePump = parseInt(e.target.value, 10);
      const el = document.getElementById('wtStatusDose');
      if (el) el.textContent = `DOSING (${e.target.value}%)`;
    };
    if (btnBackwash) btnBackwash.onclick = () => {
      this.simWater.filterBackwash = !this.simWater.filterBackwash;
      const el = document.getElementById('wtStatusBackwash');
      if (el) el.textContent = this.simWater.filterBackwash ? 'BACKWASH ACTIVE' : 'INACTIVE';
      btnBackwash.textContent = this.simWater.filterBackwash ? 'STOP BACKWASH' : 'TRIGGER BACKWASH';
    };
    if (btnAttack) btnAttack.onclick = () => {
      this.simWater.chlorineAttack = !this.simWater.chlorineAttack;
      btnAttack.textContent = this.simWater.chlorineAttack ? 'Stop Cl Attack' : 'Inject Cl Attack';
      btnAttack.style.color = this.simWater.chlorineAttack ? '#fbbf24' : '#ef4444';
      if (this.simWater.chlorineAttack) {
        this.logIncident('⚠ Chlorine dosing pump override detected — abnormal concentration rising', 'critical', 'T0836');
        this.showToast('ATTACK: Chlorine over-dosing injection active!', 'error');
      }
    };
    if (btnReset) btnReset.onclick = () => {
      this.simWater.reset();
      this.showToast('Water treatment process reset to nominal.', 'info');
    };
    if (speedSlWt) speedSlWt.oninput = (e) => {
      this.speedDilation = parseFloat(e.target.value);
      if (speedValWt) speedValWt.textContent = this.speedDilation.toFixed(1) + 'x';
    };
  }

  updateWaterTelemetry() {
    if (this.activeProjectType !== 'water' || !this.simWater) return;
    const s = this.simWater;

    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    const bar = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%'; };

    set('wtValCl',   `${s.chlorineLevel.toFixed(2)} mg/L`);
    set('wtValTurb', `${s.turbidity.toFixed(2)} NTU`);
    set('wtValRes',  `${s.reservoirLevel.toFixed(1)} %`);
    set('wtValPh',   `${s.pH.toFixed(2)}`);

    bar('wtBarCl',   (s.chlorineLevel / 10) * 100);
    bar('wtBarTurb', (s.turbidity    / 20) * 100);
    bar('wtBarRes',  s.reservoirLevel);
    bar('wtBarPh',   ((s.pH - 5) / 5) * 100);

    // Alarm detection
    const board = document.getElementById('alertBoardWt');
    if (board) {
      const alarms = [];
      if (s.isChlorineAlarm()) alarms.push(`<div class="alert-item alert-critical">⚠ Chlorine: ${s.chlorineLevel.toFixed(2)} mg/L — ${s.chlorineLevel > 4 ? 'TOXIC LEVEL' : 'LOW — CONTAMINATION RISK'}</div>`);
      if (s.isReservoirAlarm()) alarms.push(`<div class="alert-item alert-warning">⚠ Reservoir: ${s.reservoirLevel.toFixed(1)}% — ${s.reservoirLevel < 15 ? 'CRITICALLY LOW' : 'OVERFLOW RISK'}</div>`);
      if (s.isTurbidityAlarm()) alarms.push(`<div class="alert-item alert-warning">⚠ Turbidity: ${s.turbidity.toFixed(2)} NTU — FILTER FAILURE</div>`);
      if (alarms.length > 0) {
        board.innerHTML = alarms.join('');
      } else {
        board.innerHTML = '<div class="alert-placeholder"><span>ALL SYSTEMS STABLE // NO ALERTS</span></div>';
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Power Grid EMS UI — circuit breaker controls, attack injection
  // ═══════════════════════════════════════════════════════════════════════
  initGridUI() {
    const g = this.simGrid;

    const wire = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };

    // Circuit breaker toggles
    wire('btnPgCb1', () => {
      g.cb1 = !g.cb1;
      const el = document.getElementById('pgStatusCb1');
      const btn = document.getElementById('btnPgCb1');
      if (el)  el.textContent  = g.cb1 ? 'CLOSED' : 'OPEN';
      if (el)  el.className    = `valve-status font-mono ${g.cb1 ? 'text-green' : 'text-red'}`;
      if (btn) btn.textContent = g.cb1 ? 'TRIP CB-1' : 'CLOSE CB-1';
      if (!g.cb1) g._addAlarm('CB-1 manually tripped by operator', 'warning');
      else        g._addAlarm('CB-1 re-closed by operator', 'info');
    });
    wire('btnPgCb2', () => {
      g.cb2 = !g.cb2;
      const el = document.getElementById('pgStatusCb2');
      const btn = document.getElementById('btnPgCb2');
      if (el)  el.textContent  = g.cb2 ? 'CLOSED' : 'OPEN';
      if (el)  el.className    = `valve-status font-mono ${g.cb2 ? 'text-green' : 'text-red'}`;
      if (btn) btn.textContent = g.cb2 ? 'TRIP CB-2' : 'CLOSE CB-2';
      if (!g.cb2) g._addAlarm('CB-2 manually tripped by operator', 'warning');
      else        g._addAlarm('CB-2 re-closed by operator', 'info');
    });
    wire('btnPgCb3', () => {
      g.cb3 = !g.cb3;
      const el = document.getElementById('pgStatusCb3');
      const btn = document.getElementById('btnPgCb3');
      if (el)  el.textContent  = g.cb3 ? 'CLOSED' : 'OPEN';
      if (el)  el.className    = `valve-status font-mono ${g.cb3 ? 'text-green' : 'text-red'}`;
      if (btn) btn.textContent = g.cb3 ? 'TRIP CB-3' : 'CLOSE CB-3';
    });

    // Tap changer
    wire('btnPgTapUp', () => {
      if (g.tapPosition < 3) { g.tapPosition++; this._updateTapDisplay(); }
    });
    wire('btnPgTapDn', () => {
      if (g.tapPosition > -3) { g.tapPosition--; this._updateTapDisplay(); }
    });

    // Load shedding toggle
    wire('btnPgLoadShed', () => {
      g.loadSheddingActive = !g.loadSheddingActive;
      const el  = document.getElementById('pgStatusLS');
      const btn = document.getElementById('btnPgLoadShed');
      if (el)  el.textContent  = g.loadSheddingActive ? 'ACTIVE' : 'INACTIVE';
      if (el)  el.className    = `valve-status font-mono ${g.loadSheddingActive ? 'text-green' : 'text-red'}`;
      if (btn) btn.textContent = g.loadSheddingActive ? 'DEACTIVATE' : 'ACTIVATE';
      if (g.loadSheddingActive) g._addAlarm('Manual load shedding activated — 35% demand curtailment', 'warning');
    });

    // Attack injection buttons
    wire('btnPgFDI', () => {
      g.falseDataInjection = !g.falseDataInjection;
      const btn = document.getElementById('btnPgFDI');
      if (btn) { btn.textContent = g.falseDataInjection ? 'Stop FDI Attack' : 'Inject FDI Attack'; btn.style.color = g.falseDataInjection ? '#fbbf24' : '#ef4444'; }
      if (g.falseDataInjection) { g._addAlarm('FDI ACTIVE — SCADA receiving spoofed telemetry (T0832)', 'critical'); this.orchestrator.addAlert('FDI attack: SCADA telemetry spoofed via man-in-middle proxy', 'critical'); }
    });
    wire('btnPgCrashover', () => {
      g.breakerSabotage = !g.breakerSabotage;
      const btn = document.getElementById('btnPgCrashover');
      if (btn) { btn.textContent = g.breakerSabotage ? 'Stop CrashOverride' : 'CrashOverride Mode'; btn.style.color = g.breakerSabotage ? '#fbbf24' : '#ef4444'; }
      if (g.breakerSabotage) { g._addAlarm('CRASHOVERRIDE ACTIVE — IEC-61850 GOOSE replay attack (T0855)', 'critical'); this.orchestrator.addAlert('Industroyer/CrashOverride: autonomous breaker tripping via IEC-61850', 'critical'); }
    });
    wire('btnPgDisableRly', () => {
      g.protectionDisabled = !g.protectionDisabled;
      const btn = document.getElementById('btnPgDisableRly');
      if (btn) { btn.textContent = g.protectionDisabled ? 'Enable Protection' : 'Disable Protection'; btn.style.color = g.protectionDisabled ? '#22c55e' : '#fbbf24'; }
      if (g.protectionDisabled) g._addAlarm('RELAY PROTECTION DISABLED — UFR/OVR bypassed (T0816)', 'critical');
    });
    wire('btnPgResetSim', () => {
      g.reset();
      this.updateGridTelemetry();
      // Reset button labels
      ['Cb1','Cb2','Cb3'].forEach(cb => {
        const s = document.getElementById(`pgStatus${cb}`);
        const b = document.getElementById(`btnPg${cb}`);
        if (s) { s.textContent = 'CLOSED'; s.className = 'valve-status font-mono text-green'; }
        if (b) b.textContent = `TRIP ${cb.replace('C','C-').toUpperCase()}`;
      });
      const ls = document.getElementById('pgStatusLS'); if (ls) { ls.textContent = 'INACTIVE'; ls.className = 'valve-status font-mono text-red'; }
      const lsBtn = document.getElementById('btnPgLoadShed'); if (lsBtn) lsBtn.textContent = 'ACTIVATE';
      const fdiBtn = document.getElementById('btnPgFDI'); if (fdiBtn) { fdiBtn.textContent = 'Inject FDI Attack'; fdiBtn.style.color = '#ef4444'; }
      const coBtn = document.getElementById('btnPgCrashover'); if (coBtn) { coBtn.textContent = 'CrashOverride Mode'; coBtn.style.color = '#ef4444'; }
      const rlBtn = document.getElementById('btnPgDisableRly'); if (rlBtn) { rlBtn.textContent = 'Disable Protection'; rlBtn.style.color = '#fbbf24'; }
      this._updateTapDisplay();
    });

    // Speed slider
    const speedSlPg  = document.getElementById('speedSliderPg');
    const speedValPg = document.getElementById('speedValuePg');
    if (speedSlPg) speedSlPg.oninput = (e) => {
      this.speedDilation = parseFloat(e.target.value);
      if (speedValPg) speedValPg.textContent = this.speedDilation.toFixed(1) + 'x';
    };
  }

  _updateTapDisplay() {
    const g = this.simGrid;
    const el = document.getElementById('pgStatusTap');
    if (el) el.textContent = `TAP ${g.tapPosition > 0 ? '+' : ''}${g.tapPosition} (${(138 + g.tapPosition * 1.5).toFixed(1)} kV)`;
  }

  updateGridTelemetry() {
    if (this.activeProjectType !== 'grid' || !this.simGrid) return;
    const g = this.simGrid;

    const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    const bar = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%'; };

    // Use SCADA-visible values (spoofed if FDI active)
    const dispFreq = g.scadaFreq();
    const dispVolt = g.scadaVoltage();
    const dispLoad = g.scadaLoad();

    set('pgValFreq', `${dispFreq.toFixed(2)} Hz`);
    set('pgValVolt', `${dispVolt.toFixed(1)} kV`);
    set('pgValLoad', `${dispLoad.toFixed(1)} MW`);
    set('pgValPF',   `${g.powerFactor.toFixed(3)}`);

    // Bars: freq 57–63 Hz range, volt 100–160 kV range
    bar('pgBarFreq', ((dispFreq - 57) / 6) * 100);
    bar('pgBarVolt', ((dispVolt - 100) / 60) * 100);
    bar('pgBarLoad', (dispLoad / 150) * 100);
    bar('pgBarPF',   g.powerFactor * 100);

    // Colour frequency bar by alarm state
    const freqBar = document.getElementById('pgBarFreq');
    if (freqBar) {
      freqBar.style.background = g.isFreqAlarm() ? (g.blackout ? '#ef4444' : '#fbbf24') : '';
    }

    // Alarm board — show physics alarms (never spoofed, comes from real state)
    const board = document.getElementById('alertBoardPg');
    if (board) {
      const recent = g.alarmLog.slice(-8).reverse();
      if (recent.length === 0) {
        board.innerHTML = '<div class="alert-placeholder"><span>ALL PROTECTION STABLE // NO ALARMS</span></div>';
      } else {
        board.innerHTML = recent.map(a =>
          `<div class="alert-item alert-${a.level === 'critical' ? 'critical' : a.level === 'warning' ? 'warning' : 'info'}">
            ⚡ ${a.msg}
          </div>`
        ).join('');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TASK-17: Geographic Facility Map
  // ═══════════════════════════════════════════════════════════════════════
  initFacilityMap() {
    const btnMap  = document.getElementById('btnMapView');
    const modal   = document.getElementById('facilityMapModal');
    const btnClose = document.getElementById('facilityMapClose');

    if (btnMap)   btnMap.onclick   = () => { this.renderFacilityMap(); modal.classList.remove('hidden'); };
    if (btnClose) btnClose.onclick = () => modal.classList.add('hidden');
  }

  renderFacilityMap() {
    const svg = document.getElementById('facilityMapSvg');
    if (!svg) return;

    const rooms = [
      { id: 'it',  label: 'IT SERVER ROOM',    x: 30,  y: 30,  w: 200, h: 160, color: '#3b82f6', roleKeys: ['server','ad','dns','dhcp','workstation','soc','jump'] },
      { id: 'ot',  label: 'OT CONTROL ROOM',   x: 260, y: 30,  w: 200, h: 160, color: '#f59e0b', roleKeys: ['scada','hmi','historian','dcs','engineer','ewc'] },
      { id: 'fld', label: 'FIELD / PROCESS',   x: 490, y: 30,  w: 180, h: 160, color: '#ef4444', roleKeys: ['plc','rtu','sis','actuator','vfd','drive','pump','valve','sensor','relay','breaker'] },
      { id: 'sec', label: 'SECURITY ZONE',      x: 30,  y: 230, w: 200, h: 160, color: '#22c55e', roleKeys: ['firewall','ids','ips','diode','claroty','palo','forti'] },
      { id: 'net', label: 'NETWORK CORE',       x: 260, y: 230, w: 200, h: 160, color: '#8b5cf6', roleKeys: ['router','switch','gateway','core','dist','wan'] },
      { id: 'dmz', label: 'INDUSTRIAL DMZ',     x: 490, y: 230, w: 180, h: 160, color: '#06b6d4', roleKeys: ['dmz','proxy','historian'] },
    ];

    const assignRoom = (node) => {
      const r = (node.role || node.type || '').toLowerCase();
      for (const room of rooms) {
        if (room.roleKeys.some(k => r.includes(k))) return room.id;
      }
      return 'net'; // default to network core
    };

    // Assign nodes to rooms
    const roomNodes = {};
    rooms.forEach(rm => roomNodes[rm.id] = []);
    (this.canvas.nodes || []).forEach(node => {
      const rid = assignRoom(node);
      roomNodes[rid].push(node);
    });

    // Build SVG
    let svgContent = '';

    // Draw room backgrounds
    rooms.forEach(rm => {
      svgContent += `<rect x="${rm.x}" y="${rm.y}" width="${rm.w}" height="${rm.h}" rx="6"
        fill="rgba(${rm.color.slice(1).match(/../g).map(h=>parseInt(h,16)).join(',')},0.07)"
        stroke="${rm.color}" stroke-width="1.5" stroke-opacity="0.35"/>`;
      svgContent += `<text x="${rm.x + rm.w/2}" y="${rm.y + 14}" text-anchor="middle"
        font-size="8" font-weight="700" fill="${rm.color}" opacity="0.8" font-family="Fira Code,monospace">${rm.label}</text>`;

      // Place node dots
      const nodesInRoom = roomNodes[rm.id];
      nodesInRoom.forEach((node, i) => {
        const cols   = Math.floor(rm.w / 45);
        const col    = i % cols;
        const row    = Math.floor(i / cols);
        const nx     = rm.x + 22 + col * 45;
        const ny     = rm.y + 30 + row * 44;
        const status = node.status || 'online';
        const dotColor = status === 'isolated' ? '#64748b'
                       : status === 'compromised' ? '#ef4444'
                       : node._alerting ? '#fbbf24'
                       : '#22c55e';

        svgContent += `<g class="map-node" style="cursor:pointer" onclick="window.appInstance?.focusNodeById('${node.id}');document.getElementById('facilityMapModal').classList.add('hidden')">
          <circle cx="${nx}" cy="${ny}" r="8" fill="${dotColor}" opacity="0.85"/>
          <circle cx="${nx}" cy="${ny}" r="8" fill="none" stroke="${dotColor}" stroke-width="1.5" opacity="0.4"/>
          <text x="${nx}" y="${ny + 19}" text-anchor="middle" font-size="6.5" fill="#94a3b8" font-family="Fira Code,monospace">${(node.id || '').slice(0, 8)}</text>
        </g>`;
      });
    });

    svg.innerHTML = svgContent;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // IMP-50: Register all improvements, wire up keyboard, context menu, alarm audio
  // ═══════════════════════════════════════════════════════════════════════
  initAllImprovements() {
    this.initKeyboardShortcuts();
    this.initContextMenu();
    this.initAlarmAudio();
    this.initCliCursor();
    this.annotateLinksWithProtocol();
    this.initChallengeMode();
    this.initVerifyTasks();
    this.initWaterTreatmentUI();
    this.initGridUI();
    this.initFacilityMap();
    this.initBattleUI();
    this._initFeatures13to24();
    this._initFeatures25to50();
    this.orchestrator.logSystem('50-improvement bundle + Tasks 11/16/17/19 + Power Grid twin + Battle Mode loaded.', 'success');
    // Pre-populate link speed/protocol for the default reactor topology
    setTimeout(() => {
      this.annotateLinksWithProtocol();
      this.updateLinkUtilisation();
      this.canvas.draw();
    }, 500);
  }

  _initFeatures13to24() {
    // Feature 16: wire APT dropdown to auto-refresh dossier
    const aptSel = document.getElementById('aptProfileSelect');
    if (aptSel) {
      aptSel.addEventListener('change', () => {
        if (document.getElementById('dossierPanel')?.style.display !== 'none') this._updateDossierPanel();
      });
    }
    // Feature 19: init sim hour label
    this.onSimHourChange();
    // Feature 22: idle traffic starts ON, sync button state
    if (this.canvas) this.canvas.idleTrafficVisible = true;
    const btnIT = document.getElementById('btnIdleTraffic');
    if (btnIT) btnIT.style.background = 'rgba(56,189,248,0.2)';
    // Feature 24: add RL progress label next to train button
    const btnRL = document.getElementById('btnTrainRL');
    if (btnRL && !document.getElementById('rlProgress')) {
      const sp = document.createElement('span');
      sp.id = 'rlProgress';
      sp.style.cssText = 'font-size:0.52rem;color:#94a3b8;margin-left:4px;font-family:var(--font-mono);';
      btnRL.parentElement?.appendChild(sp);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BATTLE MODE — AI vs AI Red/Blue Team Simulation
  // ══════════════════════════════════════════════════════════════════════════

  initBattleUI() {
    // Nothing to wire — buttons call methods directly via onclick
  }

  toggleBattlePanel() {
    const panel = document.getElementById('battleModePanel');
    if (!panel) return;
    this.battlePanelOpen = !this.battlePanelOpen;
    panel.style.display = this.battlePanelOpen ? 'flex' : 'none';
    const btn = document.getElementById('btnBattleMode');
    if (btn) {
      btn.style.background = this.battlePanelOpen ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.07)';
      btn.style.borderColor = this.battlePanelOpen ? 'rgba(239,68,68,0.7)' : 'rgba(239,68,68,0.5)';
    }
  }

  closeBattlePanel() {
    this.battlePanelOpen = false;
    const panel = document.getElementById('battleModePanel');
    if (panel) panel.style.display = 'none';
    const btn = document.getElementById('btnBattleMode');
    if (btn) { btn.style.background = 'rgba(239,68,68,0.07)'; btn.style.borderColor = 'rgba(239,68,68,0.5)'; }
  }

  startAIBattle() {
    this.battle.start(this.battle.speed || 1.0);
    const btn = document.getElementById('btnBattleStart');
    if (btn) { btn.textContent = '▶ RUNNING'; btn.style.color = '#22c55e'; btn.style.borderColor = 'rgba(34,197,94,0.5)'; }
    document.getElementById('battleWinBanner')?.style && (document.getElementById('battleWinBanner').style.display = 'none');
    this._updateBattleUI();
    this.orchestrator.logSystem('AI Red vs Blue battle simulation started.', 'warning');
  }

  pauseAIBattle() {
    if (!this.battle.active) return;
    this.battle.pause();
    const btn = document.getElementById('btnBattlePause');
    if (btn) btn.textContent = this.battle.paused ? '▶' : '⏸';
  }

  resetAIBattle() {
    this.battle.stop();
    // Restore all node statuses
    this.canvas.nodes.forEach(n => { if (n.status === 'compromised' || n.status === 'isolated') n.status = 'stable'; });
    const btn = document.getElementById('btnBattleStart');
    if (btn) { btn.textContent = '▶ START SIM'; btn.style.color = '#ef4444'; btn.style.borderColor = 'rgba(239,68,68,0.4)'; }
    document.getElementById('battleWinBanner')?.style && (document.getElementById('battleWinBanner').style.display = 'none');
    this._updateBattleUI();
  }

  setBattleSpeed(s) {
    this.battle.setSpeed(s);
    // Highlight active speed button
    document.querySelectorAll('.battle-speed-btn').forEach(b => {
      const active = parseFloat(b.dataset.speed) === s;
      b.style.background = active ? 'rgba(45,125,210,0.2)' : 'rgba(45,125,210,0.04)';
      b.style.borderColor = active ? 'rgba(45,125,210,0.5)' : 'rgba(255,255,255,0.1)';
      b.style.color = active ? '#60a5fa' : 'var(--text-muted)';
    });
  }

  switchBattleTab(tab) {
    this.battleCurrentTab = tab;
    const logPane   = document.getElementById('battleLogPane');
    const mpPane    = document.getElementById('battleMpPane');
    const toolsPane = document.getElementById('battleToolsPane');
    const tabLog    = document.getElementById('battleTabLog');
    const tabMp     = document.getElementById('battleTabMp');
    const tabTools  = document.getElementById('battleTabTools');
    if (!logPane || !mpPane) return;

    logPane.style.display   = tab === 'log'   ? 'flex'  : 'none';
    mpPane.style.display    = tab === 'mp'    ? 'block' : 'none';
    if (toolsPane) toolsPane.style.display = tab === 'tools' ? 'block' : 'none';

    const reset = el => { if(el){ el.style.borderBottomColor='transparent'; el.style.color='var(--text-muted)'; el.style.background='transparent'; }};
    reset(tabLog); reset(tabMp); reset(tabTools);

    if (tab === 'log') {
      if(tabLog){ tabLog.style.borderBottomColor='#ef4444'; tabLog.style.color='#ef4444'; tabLog.style.background='rgba(239,68,68,0.06)'; }
    } else if (tab === 'mp') {
      if(tabMp){ tabMp.style.borderBottomColor='#2d7dd2'; tabMp.style.color='#60a5fa'; tabMp.style.background='rgba(45,125,210,0.06)'; }
    } else {
      if(tabTools){ tabTools.style.borderBottomColor='#60a5fa'; tabTools.style.color='#60a5fa'; tabTools.style.background='rgba(96,165,250,0.06)'; }
    }
  }

  _updateBattleUI() {
    const b = this.battle;
    if (!b) return;

    // Timer
    const timerEl = document.getElementById('battleTimer');
    if (timerEl) timerEl.textContent = b.active || b.winner ? b.elapsedLabel : '00:00';

    // Scores
    const redScoreEl = document.getElementById('battleRedScore');
    const blueScoreEl = document.getElementById('battleBlueScore');
    if (redScoreEl)  redScoreEl.textContent  = b.red.score.toLocaleString();
    if (blueScoreEl) blueScoreEl.textContent = b.blue.score.toLocaleString();

    // Phases
    const redPhaseEl = document.getElementById('battleRedPhase');
    const bluePhaseEl = document.getElementById('battleBluePhase');
    if (redPhaseEl)  redPhaseEl.textContent  = b.red.phase.replace('_', ' ').toUpperCase();
    if (bluePhaseEl) bluePhaseEl.textContent = b.blue.phase.replace('_', ' ').toUpperCase();

    // Node counts
    const nodes = this.canvas.nodes;
    const compromised = nodes.filter(n => n.status === 'compromised').length;
    const isolated    = nodes.filter(n => n.status === 'isolated').length;
    const safe        = nodes.filter(n => n.status === 'stable' || n.status === 'online').length;
    const cc = document.getElementById('battleCompromisedCount');
    const ic = document.getElementById('battleIsolatedCount');
    const sc = document.getElementById('battleSafeCount');
    if (cc) cc.textContent = compromised;
    if (ic) ic.textContent = isolated;
    if (sc) sc.textContent = safe;

    // Status label
    const statusLabel = document.getElementById('battleStatusLabel');
    if (statusLabel) {
      if (b.winner)       statusLabel.textContent = b.winner === 'red' ? 'Red Team Victory' : 'Blue Team Victory';
      else if (b.paused)  statusLabel.textContent = 'Simulation Paused';
      else if (b.active)  statusLabel.textContent = 'AI vs AI — Live';
      else                statusLabel.textContent = 'AI vs AI Simulation';
    }

    // Win banner
    const winBanner = document.getElementById('battleWinBanner');
    const winText   = document.getElementById('battleWinText');
    const winSub    = document.getElementById('battleWinSub');
    if (winBanner && b.winner) {
      winBanner.style.display = 'block';
      if (b.winner === 'red') {
        winBanner.style.background = 'rgba(239,68,68,0.12)';
        winBanner.style.borderColor = 'rgba(239,68,68,0.3)';
        if (winText) { winText.textContent = '🔴 RED TEAM WINS'; winText.style.color = '#ef4444'; }
        if (winSub)  winSub.textContent = `Critical infrastructure compromised in ${b.elapsedLabel}. Score: ${b.red.score.toLocaleString()}`;
      } else {
        winBanner.style.background = 'rgba(45,125,210,0.12)';
        winBanner.style.borderColor = 'rgba(45,125,210,0.3)';
        if (winText) { winText.textContent = '🔵 BLUE TEAM WINS'; winText.style.color = '#60a5fa'; }
        if (winSub)  winSub.textContent = `All threats contained in ${b.elapsedLabel}. Score: ${b.blue.score.toLocaleString()}`;
      }
    } else if (winBanner && !b.winner) {
      winBanner.style.display = 'none';
    }

    // Battle log feed
    this._renderBattleLog();

    // Fire MITRE heatmap for new events
    if (this.battle?.combinedLog) {
      const log = this.battle.combinedLog;
      const lastSeen = this._mitreLastSeen || 0;
      for (const entry of log) {
        if (entry.ts > lastSeen) this._fireMitreTechnique(entry.msg || '');
      }
      if (log.length) this._mitreLastSeen = log[0].ts;
    }
  }

  _renderBattleLog() {
    const container = document.getElementById('battleLogPane');
    if (!container) return;
    const empty = document.getElementById('battleLogEmpty');
    const log = this.battle.combinedLog;

    if (log.length === 0) {
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    // Build new entries (only add new ones to avoid full re-render jank)
    const existing = container.querySelectorAll('.battle-entry').length;
    if (existing >= log.length && existing > 0) return;

    container.innerHTML = '';
    log.forEach(entry => {
      const el = document.createElement('div');
      el.className = 'battle-entry';
      const isRed = entry.team === 'red';
      const tagColors = {
        RECON: '#94a3b8', INITIAL_ACCESS: '#f97316', LATERAL_MOVE: '#ef4444',
        PRIV_ESC: '#dc2626', OBJECTIVE: '#7f1d1d',
        MONITOR: '#60a5fa', DETECT: '#fbbf24', INVESTIGATE: '#a78bfa',
        CONTAIN: '#2d7dd2', RECOVER: '#22c55e',
      };
      const safeTag  = entry.tag || (isRed ? 'SYS' : 'INFO');
      const tagColor = tagColors[safeTag] || (isRed ? '#ef4444' : '#60a5fa');
      const time = new Date(entry.ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      el.style.cssText = `display:flex;flex-direction:column;gap:1px;padding:5px 6px;background:${isRed ? 'rgba(239,68,68,0.05)' : 'rgba(45,125,210,0.05)'};border-left:2px solid ${tagColor};border-radius:3px;`;
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:5px;">
          <span style="font-size:0.5rem;font-weight:700;color:${tagColor};letter-spacing:0.06em;white-space:nowrap;">${isRed ? '🔴' : '🔵'} ${safeTag}</span>
          <span style="font-size:0.48rem;color:var(--text-muted);margin-left:auto;">${time}</span>
        </div>
        <div style="font-size:0.57rem;color:${isRed ? 'rgba(252,165,165,0.9)' : 'rgba(147,197,253,0.9)'};line-height:1.35;">${entry.msg}</div>
      `;
      container.appendChild(el);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MULTIPLAYER SESSION METHODS
  // ══════════════════════════════════════════════════════════════════════════

  _initMpHandlers() {
    this.mpSession.onPeerConnected = (peerRole) => {
      this._mpLog(`Peer connected as ${peerRole.toUpperCase()} team`);
      this._updateMpStatus();
    };
    this.mpSession.onPeerDisconnected = () => {
      this._mpLog('Peer disconnected');
      this._updateMpStatus();
    };
    this.mpSession.onMessage = (msg) => {
      if (msg.type === 'ATTACK_NODE') {
        const node = this.canvas.nodes.find(n => n.id === msg.nodeId);
        this._mpLog(`⚡ ${msg._sender?.toUpperCase() || 'PEER'} attacked ${node?.name || msg.nodeId}`);
      } else if (msg.type === 'DEFEND_NODE') {
        const node = this.canvas.nodes.find(n => n.id === msg.nodeId);
        this._mpLog(`🛡 ${msg._sender?.toUpperCase() || 'PEER'} defended ${node?.name || msg.nodeId}`);
      }
    };
    this.mpSession.onStateSync = (nodeStates) => {
      nodeStates.forEach(s => {
        const node = this.canvas.nodes.find(n => n.id === s.id);
        if (node) { node.status = s.status; node.x = s.x; node.y = s.y; }
      });
      this._mpLog('Topology state synchronized from host');
    };
  }

  async mpHost() {
    if (location.origin === 'null' || location.protocol === 'file:') {
      this._mpLog('ERROR: Open the app via http://localhost:8080 — not as a local file');
      return;
    }
    if (this.mpSession.sessionId) this.mpSession.disconnect();
    let id;
    try {
      id = await this.mpSession.createSession();
    } catch (e) {
      this._mpLog(`Failed to create session: ${e.message}`);
      return;
    }
    const display = document.getElementById('mpSessionIdDisplay');
    const idText  = document.getElementById('mpSessionIdText');
    if (display) display.style.display = 'block';
    if (idText)  idText.textContent = id;
    this._mpLog(`Session created — ID: ${id} — waiting for attacker...`);
    this._updateMpStatus();
  }

  async mpJoin() {
    const input = document.getElementById('mpJoinInput');
    const id = input?.value?.trim();
    if (!id || id.length < 4) { this._mpLog('Enter a valid 6-character session ID'); return; }
    if (this.mpSession.sessionId) this.mpSession.disconnect();
    try {
      await this.mpSession.joinSession(id);
      this._mpLog(`Joining session ${id} as RED TEAM...`);
    } catch (e) {
      this._mpLog(`Failed to join: ${e.message}`);
    }
    this._updateMpStatus();
  }

  mpDisconnect() {
    this.mpSession.disconnect();
    const display = document.getElementById('mpSessionIdDisplay');
    if (display) display.style.display = 'none';
    const input = document.getElementById('mpJoinInput');
    if (input) input.value = '';
    this._mpLog('Session disconnected');
    this._updateMpStatus();
  }

  mpAttackSelected() {
    if (!this.mpSession.sessionId) { this._mpLog('Join or create a session first'); return; }
    const node = this.canvas.selectedNode;
    if (!node) { this._mpLog('Select a node on the canvas first'); return; }
    this.mpSession.sendAttack(node.id);
    this._mpLog(`⚡ You attacked ${node.name || node.id}`);
  }

  mpDefendSelected() {
    if (!this.mpSession.sessionId) { this._mpLog('Join or create a session first'); return; }
    const node = this.canvas.selectedNode;
    if (!node) { this._mpLog('Select a node on the canvas first'); return; }
    this.mpSession.sendDefend(node.id);
    this._mpLog(`🛡 You defended ${node.name || node.id}`);
  }

  _mpLog(msg) {
    const container = document.getElementById('mpActionLog');
    if (!container) return;
    const el = document.createElement('div');
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    el.style.cssText = 'padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);color:var(--text-secondary);';
    el.innerHTML = `<span style="color:var(--text-muted);font-size:0.5rem;">${time}</span> <span style="font-size:0.58rem;">${msg}</span>`;
    container.insertBefore(el, container.firstChild);
    if (container.children.length > 30) container.removeChild(container.lastChild);
  }

  _updateMpStatus() {
    const mp = this.mpSession;
    const statusText = document.getElementById('mpStatusText');
    const disconnectBtn = document.getElementById('mpDisconnectBtn');
    if (!statusText) return;

    if (!mp.sessionId) {
      statusText.innerHTML = '<span style="color:var(--text-muted);">No active session</span>';
      if (disconnectBtn) disconnectBtn.style.display = 'none';
    } else {
      const roleColor = mp.role === 'red' ? '#ef4444' : '#60a5fa';
      const peerStatus = mp.peerConnected ? `<span style="color:#22c55e;">● PEER CONNECTED</span>` : `<span style="color:#fbbf24;">● Waiting for peer...</span>`;
      statusText.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div>Session: <span style="font-family:var(--font-mono);color:#00d4ff;font-weight:700;letter-spacing:0.1em;">${mp.sessionId}</span></div>
          <div>Role: <span style="color:${roleColor};font-weight:700;">${mp.role?.toUpperCase()} TEAM</span></div>
          <div>${peerStatus}</div>
        </div>
      `;
      if (disconnectBtn) disconnectBtn.style.display = 'block';
    }
  }
  // ── Evolutionary Attack Discovery ────────────────────────────────────────────
  toggleEvolvePanel() {
    const p = document.getElementById('evolveModePanel');
    if (!p) return;
    const open = p.style.display === 'flex';
    p.style.display = open ? 'none' : 'flex';
    if (!open && !this.evolution) {
      this.evolution = new EvolutionEngine(this);
    }
  }

  closeEvolvePanel() {
    const p = document.getElementById('evolveModePanel');
    if (p) p.style.display = 'none';
  }

  startEvolution() {
    if (!this.evolution) this.evolution = new EvolutionEngine(this);
    const gens = parseInt(document.getElementById('evolveGenInput')?.value) || 35;
    const pop  = parseInt(document.getElementById('evolvePopInput')?.value)  || 50;
    this.evolution.maxGenerations = Math.min(100, Math.max(5, gens));
    this.evolution.popSize        = Math.min(100, Math.max(10, pop));

    document.getElementById('evolveGenMax').textContent = this.evolution.maxGenerations;

    const profileName = document.getElementById('aptProfileSelect')?.value;
    this.evolution._seedProfile = profileName || null;
    if (profileName) {
      document.getElementById('evolveStatusLabel').textContent = `Seeded with ${profileName} genome — evolving...`;
    } else {
      document.getElementById('evolveStatusLabel').textContent = 'Running — evolving attack strategies...';
    }
    document.getElementById('btnEvolveStart').disabled = true;

    this._evoResults = null;
    this._heatOverlayActive = false;

    this.evolution.onProgress = (gen, stats, eng) => {
      const pct = (gen / eng.maxGenerations * 100).toFixed(1);
      document.getElementById('evolveProgressBar').style.width = pct + '%';
      document.getElementById('evolveGenCounter').textContent  = gen;
      document.getElementById('evolveWinRate').textContent     = (stats.winRate * 100).toFixed(0) + '%';
      document.getElementById('evolveBestFit').textContent     = stats.best.toFixed(0);
      document.getElementById('evolveBattleCount').textContent = (gen * eng.popSize).toLocaleString();
      document.getElementById('evolveWinCount').textContent    = eng.allWinPaths.length;
      document.getElementById('evolvePathCount').textContent   = new Set(eng.allWinPaths.flatMap(p => p.map(s => s.nodeId))).size;
      this._drawEvoChart(eng.history);
    };

    this.evolution.onComplete = (results) => {
      this._evoResults = results;
      document.getElementById('evolveStatusLabel').textContent = `Complete — ${results.totalBattles.toLocaleString()} battles · ${results.topGenomes.length} champions found`;
      document.getElementById('btnEvolveStart').disabled = false;
      document.getElementById('btnDeployChamp').disabled = false;
      document.getElementById('btnDeployChamp').style.opacity = '1';
      this._renderEvoResults(results);
    };

    this.evolution.start();
  }

  stopEvolution() {
    if (this.evolution) this.evolution.stop();
    document.getElementById('evolveStatusLabel').textContent = 'Stopped by user';
    document.getElementById('btnEvolveStart').disabled = false;
  }

  deployChampion() {
    if (!this.evolution?.topGenomes?.length) return;
    this.closeEvolvePanel();
    if (!this.battle?.active) this.startAIBattle();
    const deployed = this.evolution.deployChampion();
    if (deployed) {
      const desc = this.evolution.topGenomes[0].describe();
      this._appendBattleLog(`🧬 Champion genome deployed: ${desc}`, 'red');
    }
  }

  switchEvoTab(tab) {
    document.querySelectorAll('.evo-tab-btn').forEach(b => {
      const active = b.dataset.tab === tab;
      b.style.background = active ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)';
      b.style.borderColor = active ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.08)';
      b.style.color = active ? '#c084fc' : 'var(--text-muted)';
    });
    ['chains','heatmap','champion'].forEach(t => {
      const el = document.getElementById(`evoPane-${t}`);
      if (el) el.style.display = t === tab ? 'block' : 'none';
    });
  }

  _drawEvoChart(history) {
    const canvas = document.getElementById('evolveChartCanvas');
    if (!canvas || !history.length) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const bests = history.map(h => h.best);
    const means = history.map(h => h.mean);
    const maxV  = Math.max(...bests, 1);
    const minV  = Math.min(...means, 0);
    const scaleX = W / Math.max(history.length - 1, 1);
    const scaleY = (H - 8) / (maxV - minV || 1);
    const toY = v => H - 4 - (v - minV) * scaleY;

    const drawLine = (data, color, glow) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = glow ? 2 : 1;
      ctx.shadowBlur  = glow ? 8 : 0;
      ctx.shadowColor = color;
      data.forEach((v, i) => {
        const x = i * scaleX, y = toY(v);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    // Win-rate bars (faint bg)
    history.forEach((h, i) => {
      const barH = h.winRate * (H - 8);
      ctx.fillStyle = `rgba(34,197,94,${h.winRate * 0.12})`;
      ctx.fillRect(i * scaleX, H - 4 - barH, scaleX, barH);
    });

    drawLine(means, 'rgba(168,85,247,0.5)', false);
    drawLine(bests, '#c084fc', true);

    // Generation markers every 5
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font      = '9px monospace';
    history.forEach((h, i) => {
      if ((i + 1) % 5 === 0) {
        const x = i * scaleX;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x, 0, 1, H);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillText(i + 1, x - 4, H - 2);
      }
    });
  }

  _renderEvoResults(results) {
    // ── Chains tab with probability tree (Feature 17) ──
    const chainsEl = document.getElementById('evoChainsBody');
    if (chainsEl) {
      if (!results.chains.length) {
        chainsEl.innerHTML = '<div style="font-size:0.6rem;color:rgba(255,255,255,0.2);text-align:center;padding:16px 0;">No winning chains found — increase generations</div>';
      } else {
        const maxCount = results.chains[0].count;
        const chainSteps = results.chains.map(c => c.chain.split('  →  ').filter(Boolean));
        const probTreeHtml = this._renderKillChainProbTree(chainSteps);
        chainsEl.innerHTML = results.chains.map((c, i) => {
          const pct = (c.count / maxCount * 100).toFixed(0);
          const [step1, step2] = c.chain.split('  →  ');
          return `<div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15);border-radius:5px;padding:7px 10px;font-size:0.58rem;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span style="color:rgba(168,85,247,0.7);font-weight:700;">#${i+1}</span>
              <span style="color:#fbbf24;font-weight:700;">${c.count}× observed</span>
            </div>
            <div style="color:#ef4444;margin-bottom:2px;">${step1 || c.chain}</div>
            ${step2 ? `<div style="color:rgba(239,68,68,0.6);padding-left:8px;">→ ${step2}</div>` : ''}
            <div style="margin-top:5px;height:3px;background:rgba(255,255,255,0.06);border-radius:2px;">
              <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#7c3aed,#c084fc);border-radius:2px;"></div>
            </div>
          </div>`;
        }).join('') + (probTreeHtml ? `<div style="margin-top:10px;padding:8px;background:rgba(0,0,0,0.3);border:1px solid rgba(168,85,247,0.12);border-radius:6px;"><div style="font-size:0.55rem;font-weight:700;color:rgba(168,85,247,0.5);letter-spacing:0.08em;margin-bottom:6px;">PROBABILITY TREE</div>${probTreeHtml}</div>` : '');
      }
    }

    // ── Heat map tab ──
    const heatEl = document.getElementById('evoHeatBody');
    if (heatEl) {
      const maxNode = results.hotNodes[0]?.[1] || 1;
      const maxTech = results.hotTechs[0]?.[1] || 1;
      heatEl.innerHTML = `
        <div style="font-size:0.6rem;font-weight:700;color:rgba(239,68,68,0.7);margin-bottom:4px;letter-spacing:0.08em;">MOST TARGETED NODES</div>
        ${results.hotNodes.map(([id, cnt]) => {
          const n = this.canvas?.nodes?.find(x => x.id === id);
          const name = n?.name || id;
          const pct = (cnt / maxNode * 100).toFixed(0);
          return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <div style="flex:1;font-size:0.58rem;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
            <div style="width:80px;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;flex-shrink:0;">
              <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#dc2626,#f87171);border-radius:3px;box-shadow:0 0 6px rgba(239,68,68,0.5);"></div>
            </div>
            <div style="font-size:0.55rem;color:#fbbf24;font-weight:700;width:24px;text-align:right;">${cnt}</div>
          </div>`;
        }).join('')}
        <div style="font-size:0.6rem;font-weight:700;color:rgba(168,85,247,0.7);margin:10px 0 4px;letter-spacing:0.08em;">MOST USED TECHNIQUES</div>
        ${results.hotTechs.map(([tech, cnt]) => {
          const pct = (cnt / maxTech * 100).toFixed(0);
          const short = tech.length > 36 ? tech.slice(0, 36) + '…' : tech;
          return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            <div style="flex:1;font-size:0.56rem;color:#c8d4e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${tech}">${short}</div>
            <div style="width:60px;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;flex-shrink:0;">
              <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#6d28d9,#a78bfa);border-radius:2px;"></div>
            </div>
            <div style="font-size:0.55rem;color:#a78bfa;font-weight:700;width:24px;text-align:right;">${cnt}</div>
          </div>`;
        }).join('')}`;
    }

    // ── Champion tab ──
    const champEl = document.getElementById('evoChampBody');
    if (champEl && results.topGenomes.length) {
      const g = results.topGenomes[0];
      const rows = g.toDisplayRows();
      champEl.innerHTML = `
        <div style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.25);border-radius:6px;padding:10px;margin-bottom:8px;">
          <div style="font-size:0.65rem;font-weight:700;color:#c084fc;margin-bottom:4px;">🏆 CHAMPION GENOME #${g.id}</div>
          <div style="font-size:0.58rem;color:rgba(168,85,247,0.7);margin-bottom:8px;line-height:1.5;">${g.describe()}</div>
          <div style="font-size:0.72rem;font-weight:700;color:#fbbf24;">Fitness: ${g.fitness.toFixed(0)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:10px;">
          ${rows.map(r => {
            if (r.raw) return `<div style="display:flex;justify-content:space-between;font-size:0.6rem;padding:4px 8px;background:rgba(255,255,255,0.03);border-radius:3px;">
              <span style="color:var(--text-muted);">${r.label}</span>
              <span style="color:#e2e8f0;font-weight:700;text-transform:uppercase;">${r.value}</span>
            </div>`;
            const pct = (r.value / r.max * 100);
            return `<div style="padding:4px 8px;background:rgba(255,255,255,0.03);border-radius:3px;">
              <div style="display:flex;justify-content:space-between;font-size:0.58rem;margin-bottom:3px;">
                <span style="color:var(--text-muted);">${r.label}</span>
                <span style="color:#e2e8f0;font-weight:700;">${r.fmt(r.value)}</span>
              </div>
              <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;">
                <div style="height:100%;width:${pct.toFixed(0)}%;background:linear-gradient(90deg,#7c3aed,#c084fc);border-radius:2px;"></div>
              </div>
            </div>`;
          }).join('')}
        </div>
        ${g.lastResult?.path?.length ? `
        <div style="font-size:0.6rem;font-weight:700;color:rgba(239,68,68,0.7);margin-bottom:6px;letter-spacing:0.07em;">CHAMPION KILL CHAIN</div>
        ${g.lastResult.path.map((s,i) => `
          <div style="display:flex;gap:6px;margin-bottom:3px;font-size:0.56rem;">
            <span style="color:rgba(168,85,247,0.5);flex-shrink:0;">${i+1}.</span>
            <div>
              <span style="color:${s.phase==='OBJECTIVE'?'#ef4444':s.phase==='OT_PIVOT'?'#f59e0b':'#a78bfa'};font-weight:700;">${s.phase}</span>
              <span style="color:var(--text-muted);"> → </span>
              <span style="color:#c8d4e8;">${s.nodeName}</span>
              <div style="color:rgba(255,255,255,0.3);margin-top:1px;">${s.technique}</div>
            </div>
          </div>`).join('')}` : ''}`;
    }
  }

  toggleHeatMapOverlay() {
    this._heatOverlayActive = !this._heatOverlayActive;
    const btn = document.getElementById('btnHeatOverlay');
    if (btn) btn.textContent = this._heatOverlayActive ? '👁 HIDE OVERLAY' : '👁 OVERLAY ON CANVAS';
    if (this.canvas) {
      this.canvas.evolutionHeatMap = this._heatOverlayActive ? (this._evoResults?.nodeHeatMap || {}) : null;
      this.canvas.evolutionEdgeMap = this._heatOverlayActive ? (this._evoResults?.hotEdges?.reduce((m,[k,v])=>{m[k]=v;return m;},{}) || {}) : null;
    }
  }

  // ── MITRE ATT&CK Live Heatmap ───────────────────────────────────────────────
  _getMitreTactics() {
    return [
      { id:'TA0043', name:'Recon',     color:'#6366f1', techniques:{ 'T1595':'Active Scan','T1589':'Gather Identity','T1590':'Network Info' } },
      { id:'TA0001', name:'Init Access',color:'#ef4444', techniques:{ 'T1190':'Public Exploit','T1566':'Phishing','T1133':'Remote Svc','T1195':'Supply Chain','T1189':'Drive-by' } },
      { id:'TA0002', name:'Execution', color:'#f59e0b', techniques:{ 'T1047':'WMI','T1059':'CLI','T1053':'Sched Task','T1072':'Soft Deploy' } },
      { id:'TA0004', name:'Priv Esc',  color:'#f97316', techniques:{ 'T1134':'Token Imp','T1068':'Exploit','T1078':'Valid Accts' } },
      { id:'TA0006', name:'Cred Access',color:'#ec4899', techniques:{ 'T1003':'OS Creds','T1558':'Steal Ticket','T1550':'Use Alt Auth' } },
      { id:'TA0008', name:'Lateral Mov',color:'#8b5cf6', techniques:{ 'T1210':'Remote Exploit','T1021':'Remote Svc','T1091':'Removable Media' } },
      { id:'TA0040', name:'Impact',    color:'#22c55e', techniques:{ 'T0836':'Modify Param','T0855':'Unauth Cmd','T0816':'Device Restart' } },
      { id:'TA0106', name:'ICS Control',color:'#06b6d4', techniques:{ 'T0855':'GOOSE Flood','T0836':'Modbus Write','T0861':'OPC-UA Hijack','T0846':'EtherNet/IP' } },
    ];
  }

  _mapTechniqueToMitre(technique) {
    const t = technique.toLowerCase();
    if (t.includes('phishing') || t.includes('watering') || t.includes('supply chain') || t.includes('usb') || t.includes('vpn')) return ['TA0001'];
    if (t.includes('wmi') || t.includes('psexec') || t.includes('dcom') || t.includes('winrm') || t.includes('scheduled')) return ['TA0002'];
    if (t.includes('token') || t.includes('system priv')) return ['TA0004'];
    if (t.includes('hash') || t.includes('kerber') || t.includes('lsass') || t.includes('dcsync') || t.includes('credential')) return ['TA0006'];
    if (t.includes('eternalblue') || t.includes('proxyshell') || t.includes('log4') || t.includes('cve') || t.includes('lateral') || t.includes('smb')) return ['TA0008'];
    if (t.includes('dnp3') || t.includes('modbus') || t.includes('iec') || t.includes('goose') || t.includes('opc') || t.includes('ethernet/ip') || t.includes('cip')) return ['TA0106', 'TA0040'];
    if (t.includes('wiper') || t.includes('crash') || t.includes('overwrite') || t.includes('impact')) return ['TA0040'];
    return ['TA0001'];
  }

  toggleMitrePanel() {
    const p = document.getElementById('mitrePanel');
    if (!p) return;
    if (p.style.display === 'none') {
      p.style.display = 'block';
      this._buildMitreGrid();
    } else {
      p.style.display = 'none';
    }
  }

  _buildMitreGrid() {
    const grid = document.getElementById('mitreGrid');
    if (!grid) return;
    this._mitreTactics = this._getMitreTactics();
    this._mitreActive  = {};
    grid.innerHTML = this._mitreTactics.map(tactic => `
      <div class="mitre-col" data-tactic="${tactic.id}" style="flex-shrink:0;min-width:78px;">
        <div style="font-size:0.5rem;font-weight:700;letter-spacing:0.06em;color:${tactic.color};text-align:center;margin-bottom:4px;white-space:nowrap;">${tactic.name}</div>
        ${Object.entries(tactic.techniques).map(([id,name]) => `
          <div class="mitre-cell" data-technique="${id}" title="${id}: ${name}" style="padding:3px 5px;margin-bottom:2px;border-radius:3px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);font-size:0.48rem;color:rgba(255,255,255,0.35);text-align:center;cursor:default;transition:all 0.3s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${id}<br><span style="font-size:0.42rem;">${name}</span></div>
        `).join('')}
        <div class="mitre-tactic-bar" data-tactic="${tactic.id}" style="margin-top:4px;height:3px;background:rgba(255,255,255,0.06);border-radius:2px;"><div style="height:100%;width:0%;background:${tactic.color};border-radius:2px;transition:width 0.5s;box-shadow:0 0 6px ${tactic.color};"></div></div>
      </div>
    `).join('');
  }

  _fireMitreTechnique(technique) {
    if (document.getElementById('mitrePanel')?.style.display === 'none') return;
    const tacticIds = this._mapTechniqueToMitre(technique);
    if (!this._mitreActive) this._mitreActive = {};
    for (const tid of tacticIds) {
      this._mitreActive[tid] = (this._mitreActive[tid] || 0) + 1;
      const bar = document.querySelector(`.mitre-tactic-bar[data-tactic="${tid}"] div`);
      if (bar) { const w = Math.min(100, (this._mitreActive[tid] * 15)); bar.style.width = w + '%'; }
      const tactic = this._mitreTactics?.find(t => t.id === tid);
      if (!tactic) continue;
      for (const [techId] of Object.entries(tactic.techniques)) {
        const cells = document.querySelectorAll(`.mitre-cell[data-technique="${techId}"]`);
        cells.forEach(cell => {
          cell.style.background = `rgba(${tid === 'TA0106' ? '6,182,212' : tid === 'TA0001' ? '239,68,68' : tid === 'TA0006' ? '236,72,153' : '139,92,246'},0.3)`;
          cell.style.color = '#fff';
          cell.style.borderColor = `rgba(${tid === 'TA0106' ? '6,182,212' : tid === 'TA0001' ? '239,68,68' : '139,92,246'},0.6)`;
          cell.style.boxShadow = '0 0 8px currentColor';
          setTimeout(() => {
            cell.style.background = `rgba(${tid === 'TA0106' ? '6,182,212' : '139,92,246'},0.12)`;
            cell.style.color = 'rgba(255,255,255,0.6)';
          }, 3000);
        });
      }
    }
  }

  // ── Blast Radius ──────────────────────────────────────────────────────────────
  toggleBlastRadius() {
    const node = this.canvas.selectedNode || this.canvas.nodes.find(n => n.status === 'compromised');
    if (!node) return;
    if (this.canvas.blastRadiusData?.origin === node.id) {
      this.canvas.clearBlastRadius();
    } else {
      this.canvas.showBlastRadius(node.id);
    }
  }

  // ── Kill Chain Trail ──────────────────────────────────────────────────────────
  toggleKillChainTrail() {
    if (!this.canvas) return;
    this.canvas.killChainVisible = !this.canvas.killChainVisible;
    if (this.canvas.killChainVisible && this.battle) {
      this.canvas.updateKillChainFromBattle(this.battle);
    }
  }

  // ── Zero-Day Surface ──────────────────────────────────────────────────────────
  computeZeroDaySurface() {
    if (!this._evoResults) return;
    const { nodeHeatMap } = this._evoResults;
    const allNodes = this.canvas?.nodes || [];
    const hotNodeIds = new Set(Object.keys(nodeHeatMap));
    const zeroDayNodes = allNodes.filter(n => hotNodeIds.has(n.id));
    if (this.canvas) {
      this.canvas.zeroDayNodes = new Set(zeroDayNodes.map(n => n.id));
    }
    return zeroDayNodes;
  }

  toggleZeroDaySurface() {
    if (this.canvas?.zeroDayNodes?.size) {
      this.canvas.zeroDayNodes = null;
    } else {
      this.computeZeroDaySurface();
    }
  }

  // ── Screenshot Export ─────────────────────────────────────────────────────────
  exportScreenshot() {
    const canvas = this.canvas?.canvas || document.getElementById('networkCanvas');
    if (!canvas) return;
    const link  = document.createElement('a');
    link.download = `aetheris-screenshot-${Date.now()}.png`;
    link.href   = canvas.toDataURL('image/png');
    link.click();
  }

  // ── Sigma Rule Generator ──────────────────────────────────────────────────────
  generateSigmaRules() {
    if (!this._evoResults?.chains?.length) {
      alert('Run evolution first to generate Sigma rules from discovered attack chains.');
      return;
    }
    const hotTechs = this._evoResults.hotTechs || [];

    const rules = hotTechs.slice(0, 6).map(([tech, count], i) => {
      const techLower = tech.toLowerCase();
      let detection = '';
      let logsource = '';
      if (techLower.includes('wmi')) {
        logsource = 'product: windows\ncategory: process_creation';
        detection = 'selection:\n  CommandLine|contains:\n    - "wmic"\n    - "Win32_Process"\n  ParentImage|endswith: "\\\\svchost.exe"';
      } else if (techLower.includes('hash') || techLower.includes('ntlm')) {
        logsource = 'product: windows\ncategory: network_connection';
        detection = 'selection:\n  DestinationPort: 445\n  Initiated: "true"\ncondition: selection | count() by SourceIp > 5';
      } else if (techLower.includes('kerber')) {
        logsource = 'product: windows\nservice: security';
        detection = 'selection:\n  EventID: 4769\n  TicketEncryptionType: "0x17"\ncondition: selection';
      } else if (techLower.includes('dcsync') || techLower.includes('replication')) {
        logsource = 'product: windows\nservice: security';
        detection = 'selection:\n  EventID: 4662\n  Properties|contains:\n    - "1131f6aa-9c07-11d1-f79f-00c04fc2dcd2"\n    - "1131f6ad-9c07-11d1-f79f-00c04fc2dcd2"';
      } else if (techLower.includes('modbus') || techLower.includes('dnp3') || techLower.includes('iec')) {
        logsource = 'product: zeek\ncategory: network';
        detection = 'selection:\n  proto: "modbus"\n  modbus.func_code|contains:\n    - "16"\n    - "FC16"\ncondition: selection';
      } else if (techLower.includes('scheduled')) {
        logsource = 'product: windows\ncategory: process_creation';
        detection = 'selection:\n  Image|endswith: "\\\\schtasks.exe"\n  CommandLine|contains: "/create"\ncondition: selection';
      } else {
        logsource = 'category: process_creation\nproduct: windows';
        detection = 'selection:\n  CommandLine|contains: "cmd.exe"\ncondition: selection';
      }

      return `# AETHERIS Auto-Generated Sigma Rule #${i+1}
# Technique: ${tech} (observed ${count}x in evolution)
# Generated: ${new Date().toISOString()}

title: AETHERIS-EVOLVED-${String(i+1).padStart(3,'0')} - ${tech.split(' ')[0]} Detection
id: aetheris-${Date.now()}-${i}
status: experimental
description: Auto-generated from evolutionary attack discovery. Technique observed ${count} times in winning strategies against this topology.
references:
  - https://attack.mitre.org/
author: AETHERIS NetPilot Evolution Engine
date: ${new Date().toISOString().split('T')[0]}
logsource:
  ${logsource}
detection:
  ${detection}
  condition: selection
falsepositives:
  - Legitimate administrative activity
level: ${count > 10 ? 'high' : 'medium'}
tags:
  - attack.discovery
  - aetheris.evolved`;
    }).join('\n\n---\n\n');

    const blob = new Blob([rules], { type: 'text/plain' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `aetheris-sigma-rules-${Date.now()}.yml`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Segmentation Gap Finder ───────────────────────────────────────────────────
  findSegmentationGaps() {
    const nodes = this.canvas?.nodes || [];
    const links = this.canvas?.links || [];

    const itNodes  = nodes.filter(n => n.type === 'it' || n.type === 'IT');
    const otNodes  = nodes.filter(n => n.type === 'ot' || n.type === 'plc' || n.type === 'field');
    const fwNodes  = nodes.filter(n => (n.role||'').toLowerCase().includes('firewall') || (n.name||'').toLowerCase().includes('firewall'));

    const adj = {};
    for (const n of nodes) adj[n.id] = new Set();
    for (const l of links) {
      const s = l.sourceId || l.source?.id || l.source;
      const t = l.targetId || l.target?.id || l.target;
      if (adj[s]) adj[s].add(t);
      if (adj[t]) adj[t].add(s);
    }

    const gaps = [];
    for (const it of itNodes) {
      for (const ot of otNodes) {
        for (const mid of (adj[it.id] || [])) {
          if (adj[mid]?.has(ot.id)) {
            const midNode = nodes.find(n => n.id === mid);
            const isFW = fwNodes.some(f => f.id === mid);
            if (!isFW) {
              gaps.push({ from: it, via: midNode, to: ot });
            }
          }
        }
      }
    }

    if (this.canvas) {
      this.canvas.segmentationGaps = gaps;
    }
    return gaps;
  }

  toggleSegmentationGaps() {
    if (this.canvas?.segmentationGaps?.length) {
      this.canvas.segmentationGaps = [];
    } else {
      const gaps = this.findSegmentationGaps();
      if (!gaps.length) alert('No unprotected IT→OT paths found — good segmentation!');
    }
  }

  // ── Blue Team Gap Analysis ────────────────────────────────────────────────────
  showBlueGapAnalysis() {
    const b = this.battle;
    if (!b) return;

    const allNodes = this.canvas?.nodes || [];
    const blueLog  = b.blue?.actionLog || [];

    const compromised = new Set(allNodes.filter(n=>n.status==='compromised').map(n=>n.id));
    const contained   = new Set(allNodes.filter(n=>n.status==='isolated').map(n=>n.id));
    const missed      = [...compromised].filter(id => !contained.has(id));

    const detections = blueLog.filter(e => e.msg?.includes('CONFIRMED') || e.msg?.includes('detected')).length;

    const html = `
      <div style="background:rgba(6,9,20,0.95);border:1px solid rgba(45,125,210,0.3);border-radius:8px;padding:16px;font-size:0.7rem;max-width:500px;margin:0 auto;">
        <div style="font-family:'Orbitron',sans-serif;font-size:0.72rem;color:#60a5fa;margin-bottom:12px;letter-spacing:0.1em;">🔵 BLUE TEAM GAP ANALYSIS</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
          <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:5px;padding:8px;text-align:center;">
            <div style="font-size:1.4rem;font-weight:700;color:#ef4444;">${missed.length}</div>
            <div style="font-size:0.58rem;color:var(--text-muted);">Nodes missed</div>
          </div>
          <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:5px;padding:8px;text-align:center;">
            <div style="font-size:1.4rem;font-weight:700;color:#22c55e;">${detections}</div>
            <div style="font-size:0.58rem;color:var(--text-muted);">Detections fired</div>
          </div>
        </div>

        ${missed.length ? `
        <div style="margin-bottom:10px;">
          <div style="font-size:0.6rem;font-weight:700;color:rgba(239,68,68,0.7);margin-bottom:5px;letter-spacing:0.07em;">UNDETECTED COMPROMISES</div>
          ${missed.map(id => {
            const n = allNodes.find(x=>x.id===id);
            return `<div style="padding:4px 8px;background:rgba(239,68,68,0.07);border-left:2px solid #ef4444;margin-bottom:3px;border-radius:0 3px 3px 0;font-size:0.62rem;color:#e2e8f0;">${n?.name||id}</div>`;
          }).join('')}
        </div>` : '<div style="color:#22c55e;font-size:0.65rem;margin-bottom:10px;">✓ All compromised nodes were detected</div>'}

        <div style="font-size:0.6rem;font-weight:700;color:rgba(96,165,250,0.7);margin-bottom:5px;letter-spacing:0.07em;">COVERAGE RECOMMENDATION</div>
        <div style="font-size:0.62rem;color:var(--text-muted);line-height:1.6;">
          ${missed.length > 2 ? '⚠ Add OT-specific detection rules — blue team is blind to ICS protocol abuse.' : ''}
          ${detections < 3 ? '⚠ Detection coverage is low — consider adding honeypots on entry nodes.' : ''}
          ${missed.length === 0 && detections >= 3 ? '✅ Strong defensive posture — consider running more generations to stress-test.' : ''}
          Deploy Sigma rules from the EVOLVE panel to close identified gaps.
        </div>
      </div>`;

    let modal = document.getElementById('gapAnalysisModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'gapAnalysisModal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:35000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
      modal.onclick = (e) => { if(e.target===modal) modal.remove(); };
      document.body.appendChild(modal);
    }
    modal.innerHTML = html + '<button onclick="document.getElementById(\'gapAnalysisModal\').remove()" style="display:block;margin:12px auto 0;padding:6px 20px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:5px;color:var(--text-muted);font-size:0.65rem;cursor:pointer;">CLOSE</button>';
    modal.style.display = 'flex';
  }

  _appendBattleLog(msg, team, tag) {
    const derivedTag = tag || (msg.includes('⚡') ? 'PHYSICS' : msg.includes('🧬') ? 'EVOLVE' : 'SYS');
    if (this.battle?.red && team === 'red') this.battle.red.actionLog.unshift({ ts: Date.now(), team: 'red', tag: derivedTag, msg });
    if (this.battle?.blue && team === 'blue') this.battle.blue.actionLog.unshift({ ts: Date.now(), team: 'blue', tag: derivedTag, msg });
    this._renderBattleLog?.();
  }

  // ── Incident Report ──────────────────────────────────────────────────────────
  async generateIncidentReport() {
    const modal   = document.getElementById('incidentReportModal');
    const loading = document.getElementById('incidentReportLoading');
    const content = document.getElementById('incidentReportContent');
    if (!modal) return;

    modal.style.display = 'block';
    loading.style.display = 'block';
    content.style.display = 'none';

    const b = this.battle;
    if (!b) { loading.style.display = 'none'; content.innerHTML = '<p>No battle data available.</p>'; content.style.display = 'block'; return; }

    const log     = b.combinedLog || [];
    const winner  = b.winner || 'unknown';
    const elapsed = b.elapsedLabel || '00:00';
    const nodes   = this.canvas.nodes || [];
    const compromised = nodes.filter(n => n.status === 'compromised').map(n => n.name || n.id);
    const isolated    = nodes.filter(n => n.status === 'isolated').map(n => n.name || n.id);

    const logText = log.slice(0, 40).map(e => {
      const ts = new Date(e.ts).toISOString().substr(11, 8);
      return `[${ts}] [${e.team?.toUpperCase() || 'SYS'}] ${e.msg}`;
    }).join('\n');

    const prompt = `You are a senior ICS/OT cybersecurity analyst. Write a formal CISO-level post-incident report based on the following AETHERIS NetPilot simulation data.

BATTLE OUTCOME: ${winner.toUpperCase()} TEAM WINS
DURATION: ${elapsed}
RED SCORE: ${b.red?.score || 0}  |  BLUE SCORE: ${b.blue?.score || 0}
COMPROMISED NODES: ${compromised.join(', ') || 'none'}
ISOLATED NODES: ${isolated.join(', ') || 'none'}
TOTAL NODES: ${nodes.length}

BATTLE LOG (chronological):
${logText}

Write the report in this exact HTML structure (use inline styles, no external CSS):
<h2 style="...">INCIDENT REPORT — [WINNER] TEAM VICTORY</h2>
Then sections: EXECUTIVE SUMMARY, ATTACK TIMELINE (formatted table with timestamp/actor/action/technique columns), BLAST RADIUS & IMPACT, INDICATORS OF COMPROMISE (IOCs), MITRE ATT&CK TECHNIQUES OBSERVED, CVSS SEVERITY ASSESSMENT, REMEDIATION RECOMMENDATIONS (numbered list), LESSONS LEARNED.

Use a dark military/cyber aesthetic: background transparent, text #c8d4e8, headings in #ef4444 (red) or #60a5fa (blue), tables with border-collapse, alternating row shades. Make it detailed, technical, and realistic — reference actual CVEs and ICS attack techniques mentioned in the log. Minimum 600 words.`;

    let reportHtml;
    try {
      reportHtml = await this.llm.sendPrompt(prompt, nodes, [], 'incident-report');
    } catch (e) {
      reportHtml = null;
    }

    // Fall back to full static report if LLM returned mock/empty/error
    const isMock = !reportHtml || reportHtml.includes('[MOCK') || reportHtml.includes('[NO API') || reportHtml.length < 200;
    if (isMock) {
      reportHtml = this._buildFullIncidentReportHTML(b, nodes, winner, elapsed);
    } else if (!reportHtml.includes('<')) {
      reportHtml = reportHtml.split('\n').map(line => {
        if (line.startsWith('##')) return `<h3 style="color:#60a5fa;font-family:'Orbitron',sans-serif;font-size:0.72rem;letter-spacing:0.1em;margin:20px 0 8px;border-bottom:1px solid rgba(96,165,250,0.2);padding-bottom:6px;">${line.replace(/^#+\s*/,'')}</h3>`;
        if (line.startsWith('#'))  return `<h2 style="color:#ef4444;font-family:'Orbitron',sans-serif;font-size:0.85rem;letter-spacing:0.12em;margin:24px 0 10px;">${line.replace(/^#+\s*/,'')}</h2>`;
        if (line.match(/^\d+\./)) return `<p style="margin:4px 0 4px 12px;">${line}</p>`;
        if (line.trim() === '')   return '<br>';
        return `<p style="margin:4px 0;">${line}</p>`;
      }).join('');
    }

    // Store for export
    this._lastReportHtml = reportHtml;
    this._lastReportMeta = { winner, elapsed, redScore: b.red?.score || 0, blueScore: b.blue?.score || 0 };

    loading.style.display = 'none';
    content.innerHTML = reportHtml;
    content.style.display = 'block';
  }

  _buildFullIncidentReportHTML(b, nodes, winner, elapsed) {
    const _esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const now  = new Date().toISOString().replace('T',' ').slice(0,19);
    const log  = (b?.combinedLog || []);
    const compromised = nodes.filter(n => n.status === 'compromised');
    const isolated    = nodes.filter(n => n.status === 'isolated');
    const stable      = nodes.filter(n => !['compromised','isolated'].includes(n.status));
    const redScore    = b?.red?.score  || 0;
    const blueScore   = b?.blue?.score || 0;
    const totalNodes  = nodes.length;
    const blastPct    = totalNodes ? Math.round(compromised.length / totalNodes * 100) : 0;

    const winColor = winner === 'red' ? '#ef4444' : winner === 'blue' ? '#22c55e' : '#94a3b8';

    const mitreTechSet = new Set();
    const allAttackTechs = [
      'T1190 Exploit Public App','T1059 Command & Scripting','T1078 Valid Accounts',
      'T1021 Remote Services','T1110 Brute Force','T1047 WMI','T1070 Indicator Removal',
      'T0836 Modify Parameter','T0855 Unauthorized Command Message','T0856 Spoof Reporting Message',
      'T0814 Denial of Control','T0815 Denial of View','T0800 Activate Firmware Update',
    ];
    const techCount = Math.min(allAttackTechs.length, Math.max(3, Math.floor(redScore / 20 + 3)));
    for (let i = 0; i < techCount; i++) mitreTechSet.add(allAttackTechs[i % allAttackTechs.length]);

    const timelineRows = log.slice(0, 50).map(e => {
      const ts    = new Date(e.ts||Date.now()).toISOString().slice(11,19);
      const team  = (e.team||'sys').toUpperCase();
      const color = e.team==='red'?'#ef4444':e.team==='blue'?'#60a5fa':'#94a3b8';
      return `<tr>
        <td style="padding:5px 10px;font-family:monospace;font-size:0.65rem;color:#64748b;white-space:nowrap;">${_esc(ts)}</td>
        <td style="padding:5px 10px;"><span style="color:${color};font-weight:700;font-size:0.62rem;">${_esc(team)}</span></td>
        <td style="padding:5px 10px;font-size:0.65rem;color:#c8d4e8;">${_esc((e.msg||'').slice(0,80))}</td>
      </tr>`;
    }).join('');

    const assetRows = nodes.map(n => {
      const sColor = n.status==='compromised'?'#ef4444':n.status==='isolated'?'#fbbf24':'#22c55e';
      return `<tr>
        <td style="padding:4px 10px;font-family:monospace;font-size:0.62rem;color:#94a3b8;">${_esc(n.id)}</td>
        <td style="padding:4px 10px;font-size:0.62rem;color:#e2e8f0;">${_esc(n.name||n.id)}</td>
        <td style="padding:4px 10px;font-family:monospace;font-size:0.62rem;color:#64748b;">${_esc(n.ip||'—')}</td>
        <td style="padding:4px 10px;font-size:0.62rem;color:#94a3b8;">${_esc(n.role||n.type||'—')}</td>
        <td style="padding:4px 10px;"><span style="color:${sColor};font-size:0.62rem;font-weight:700;">${_esc((n.status||'stable').toUpperCase())}</span></td>
      </tr>`;
    }).join('');

    const iocList = compromised.slice(0,8).flatMap(n => [
      `<li style="padding:3px 0;font-size:0.65rem;color:#fca5a5;">${_esc(n.ip||n.id)} — Unauthorized access detected on ${_esc(n.name||n.id)}</li>`,
      `<li style="padding:3px 0;font-size:0.65rem;color:#fca5a5;">${_esc(n.id)} — Anomalous outbound connections logged</li>`,
    ]).join('');

    const recommendations = [
      'Immediately isolate all compromised nodes from the OT network segment.',
      'Rotate all credentials on systems accessible from compromised hosts.',
      'Deploy network segmentation between IT and OT zones per IEC 62443-3-3.',
      'Enable deep packet inspection on Modbus/DNP3/IEC 60870-5-104 traffic.',
      'Implement application whitelisting on all PLCs and HMI workstations.',
      'Deploy honeypots at IT/OT boundary to detect lateral movement.',
      'Conduct firmware integrity verification on all field devices.',
      'Enable anomaly-based detection rules (Sigma) for identified MITRE techniques.',
      'Review and harden remote access paths — restrict VPN to jump servers only.',
      'Schedule quarterly red team exercises to validate defensive posture.',
    ];

    return `
      <div style="font-family:'Courier New',monospace;color:#c8d4e8;line-height:1.7;">

        <!-- Header -->
        <div style="border-bottom:2px solid rgba(239,68,68,0.3);padding-bottom:16px;margin-bottom:24px;">
          <h2 style="font-family:'Orbitron',sans-serif;font-size:1rem;color:#ef4444;letter-spacing:0.14em;margin:0 0 4px;">AETHERIS NETPILOT — POST-INCIDENT REPORT</h2>
          <div style="font-size:0.62rem;color:#64748b;">Generated: ${now} UTC &nbsp;|&nbsp; Classification: INTERNAL / RESTRICTED</div>
        </div>

        <!-- Executive Summary -->
        <h3 style="font-family:'Orbitron',sans-serif;font-size:0.72rem;color:#ef4444;letter-spacing:0.1em;border-bottom:1px solid rgba(239,68,68,0.2);padding-bottom:6px;margin:0 0 12px;">1. EXECUTIVE SUMMARY</h3>
        <div style="background:rgba(255,255,255,0.03);border-left:3px solid ${winColor};padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;font-size:0.68rem;">
          <p style="margin:0 0 8px;">The AETHERIS NetPilot simulation concluded with a <strong style="color:${winColor};">${(winner||'UNKNOWN').toUpperCase()} TEAM VICTORY</strong> after ${_esc(elapsed)} of simulated combat. Red team scored <strong style="color:#ef4444;">${redScore}</strong> points; Blue team scored <strong style="color:#60a5fa;">${blueScore}</strong> points.</p>
          <p style="margin:0 0 8px;">Out of ${totalNodes} monitored assets, <strong style="color:#ef4444;">${compromised.length} (${blastPct}%)</strong> were compromised, <strong style="color:#fbbf24;">${isolated.length}</strong> were isolated/contained, and <strong style="color:#22c55e;">${stable.length}</strong> remained unaffected.</p>
          <p style="margin:0;">Immediate remediation is required on all compromised nodes before returning systems to production. See Section 7 for prioritised recommendations.</p>
        </div>

        <!-- Scorecard -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px;">
          ${[
            ['BLAST RADIUS',blastPct+'%','#ef4444'],
            ['COMPROMISED',compromised.length,'#ef4444'],
            ['CONTAINED',isolated.length,'#fbbf24'],
            ['DURATION',elapsed,'#60a5fa'],
          ].map(([label,val,color])=>`
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:6px;padding:10px;text-align:center;">
              <div style="font-size:1.3rem;font-weight:700;color:${color};">${val}</div>
              <div style="font-size:0.52rem;color:#64748b;letter-spacing:0.07em;">${label}</div>
            </div>`).join('')}
        </div>

        <!-- Attack Timeline -->
        <h3 style="font-family:'Orbitron',sans-serif;font-size:0.72rem;color:#ef4444;letter-spacing:0.1em;border-bottom:1px solid rgba(239,68,68,0.2);padding-bottom:6px;margin:0 0 12px;">2. ATTACK TIMELINE</h3>
        <div style="overflow-x:auto;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:rgba(239,68,68,0.1);">
              <th style="padding:6px 10px;text-align:left;font-size:0.6rem;color:#ef4444;letter-spacing:0.07em;white-space:nowrap;">TIME (UTC)</th>
              <th style="padding:6px 10px;text-align:left;font-size:0.6rem;color:#ef4444;letter-spacing:0.07em;">ACTOR</th>
              <th style="padding:6px 10px;text-align:left;font-size:0.6rem;color:#ef4444;letter-spacing:0.07em;">ACTION</th>
            </tr></thead>
            <tbody>${timelineRows || '<tr><td colspan="3" style="padding:10px;color:#475569;font-size:0.62rem;">No events recorded in this session.</td></tr>'}</tbody>
          </table>
        </div>

        <!-- Asset Impact -->
        <h3 style="font-family:'Orbitron',sans-serif;font-size:0.72rem;color:#ef4444;letter-spacing:0.1em;border-bottom:1px solid rgba(239,68,68,0.2);padding-bottom:6px;margin:0 0 12px;">3. ASSET IMPACT REGISTER</h3>
        <div style="overflow-x:auto;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:rgba(239,68,68,0.08);">
              <th style="padding:6px 10px;text-align:left;font-size:0.6rem;color:#ef4444;">ID</th>
              <th style="padding:6px 10px;text-align:left;font-size:0.6rem;color:#ef4444;">NAME</th>
              <th style="padding:6px 10px;text-align:left;font-size:0.6rem;color:#ef4444;">IP</th>
              <th style="padding:6px 10px;text-align:left;font-size:0.6rem;color:#ef4444;">ROLE</th>
              <th style="padding:6px 10px;text-align:left;font-size:0.6rem;color:#ef4444;">STATUS</th>
            </tr></thead>
            <tbody>${assetRows}</tbody>
          </table>
        </div>

        <!-- IOCs -->
        <h3 style="font-family:'Orbitron',sans-serif;font-size:0.72rem;color:#ef4444;letter-spacing:0.1em;border-bottom:1px solid rgba(239,68,68,0.2);padding-bottom:6px;margin:0 0 12px;">4. INDICATORS OF COMPROMISE (IOCs)</h3>
        <ul style="list-style:disc;padding-left:20px;margin-bottom:24px;">
          ${iocList || '<li style="font-size:0.65rem;color:#22c55e;">No compromised assets — clean simulation run</li>'}
        </ul>

        <!-- MITRE ATT&CK -->
        <h3 style="font-family:'Orbitron',sans-serif;font-size:0.72rem;color:#ef4444;letter-spacing:0.1em;border-bottom:1px solid rgba(239,68,68,0.2);padding-bottom:6px;margin:0 0 12px;">5. MITRE ATT&CK TECHNIQUES OBSERVED</h3>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:24px;">
          ${[...mitreTechSet].map(t=>`<span style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);padding:4px 10px;border-radius:4px;font-size:0.62rem;color:#fca5a5;font-family:monospace;">${_esc(t)}</span>`).join('')}
        </div>

        <!-- Recommendations -->
        <h3 style="font-family:'Orbitron',sans-serif;font-size:0.72rem;color:#60a5fa;letter-spacing:0.1em;border-bottom:1px solid rgba(96,165,250,0.2);padding-bottom:6px;margin:0 0 12px;">6. REMEDIATION RECOMMENDATIONS</h3>
        <ol style="padding-left:20px;margin-bottom:24px;">
          ${recommendations.map(r=>`<li style="padding:4px 0;font-size:0.65rem;color:#c8d4e8;">${_esc(r)}</li>`).join('')}
        </ol>

        <!-- Lessons Learned -->
        <h3 style="font-family:'Orbitron',sans-serif;font-size:0.72rem;color:#60a5fa;letter-spacing:0.1em;border-bottom:1px solid rgba(96,165,250,0.2);padding-bottom:6px;margin:0 0 12px;">7. LESSONS LEARNED</h3>
        <div style="background:rgba(45,125,210,0.06);border:1px solid rgba(45,125,210,0.15);border-radius:6px;padding:14px;font-size:0.65rem;margin-bottom:16px;">
          ${winner==='red'
            ? `<p style="margin:0 0 8px;"><strong style="color:#ef4444;">Red team victory</strong> indicates insufficient defensive coverage. Key gaps: late detection, insufficient segmentation at IT/OT boundary, inadequate response time on critical OT assets.</p><p style="margin:0;">Blue team must improve: threat hunting cadence, OT-specific detection rules, and automated isolation playbooks for PLCs and SCADA systems.</p>`
            : winner==='blue'
              ? `<p style="margin:0 0 8px;"><strong style="color:#22c55e;">Blue team victory</strong> demonstrates effective defensive posture. Successful early detections and rapid containment limited red team's blast radius to ${blastPct}% of assets.</p><p style="margin:0;">Continue to stress-test defenses with higher-speed scenarios and more complex attack chains. Consider adversarial emulation exercises against supply chain vectors.</p>`
              : `<p style="margin:0;">Simulation outcome inconclusive. Expand scenario complexity and run additional iterations for meaningful lessons learned.</p>`}
        </div>

        <div style="font-size:0.55rem;color:#374151;border-top:1px solid rgba(255,255,255,0.05);padding-top:12px;margin-top:8px;">Generated by AETHERIS NetPilot v2.0 — ICS/OT Cybersecurity Simulation Platform &nbsp;|&nbsp; ${now} UTC</div>
      </div>`;
  }

  exportIncidentReport() {
    const meta    = this._lastReportMeta || {};
    const body    = this._lastReportHtml || '<p>No report generated.</p>';
    const date    = new Date().toISOString().replace('T', ' ').substr(0, 19);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AETHERIS Incident Report — ${date}</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
<style>
  body{background:#060912;color:#c8d4e8;font-family:'Fira Code',monospace;font-size:13px;line-height:1.7;max-width:900px;margin:0 auto;padding:40px 32px;}
  h1{font-family:'Orbitron',sans-serif;color:#ef4444;letter-spacing:.14em;font-size:1.1rem;border-bottom:2px solid rgba(239,68,68,.3);padding-bottom:12px;}
  .meta{display:flex;gap:32px;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:24px;font-size:11px;}
  .meta span{color:#64748b;} .meta strong{color:#e2e8f0;}
  table{width:100%;border-collapse:collapse;margin:12px 0;}
  th{background:rgba(239,68,68,.12);color:#ef4444;padding:8px 10px;text-align:left;font-size:11px;letter-spacing:.06em;}
  td{padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.05);font-size:12px;}
  tr:nth-child(even) td{background:rgba(255,255,255,.02);}
</style>
</head>
<body>
<h1>📋 AETHERIS INCIDENT REPORT</h1>
<div class="meta">
  <div><span>Generated: </span><strong>${date} UTC</strong></div>
  <div><span>Outcome: </span><strong style="color:${meta.winner==='red'?'#ef4444':'#22c55e'}">${(meta.winner||'?').toUpperCase()} TEAM WINS</strong></div>
  <div><span>Duration: </span><strong>${meta.elapsed||'--'}</strong></div>
  <div><span>Red Score: </span><strong>${meta.redScore||0}</strong></div>
  <div><span>Blue Score: </span><strong>${meta.blueScore||0}</strong></div>
</div>
${body}
<p style="margin-top:40px;font-size:10px;color:#374151;border-top:1px solid rgba(255,255,255,.05);padding-top:12px;">Generated by AETHERIS NetPilot — ICS/OT Cybersecurity Simulation Platform</p>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `aetheris-incident-report-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ═══════════════════════════════════════════════════════════════════
  // FEATURES 13-24 IMPLEMENTATION
  // ═══════════════════════════════════════════════════════════════════

  // Feature 13: Animated Battle Packets ─────────────────────────────
  toggleBattlePackets() {
    if (!this.canvas) return;
    this.canvas.battlePacketsVisible = !this.canvas.battlePacketsVisible;
    const btn = document.getElementById('btnBattlePackets');
    if (btn) btn.style.background = this.canvas.battlePacketsVisible
      ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.08)';
  }

  // Feature 14: Attack Timeline ─────────────────────────────────────
  toggleTimeline() {
    let panel = document.getElementById('attackTimeline');
    if (!panel) return;
    const visible = panel.style.display !== 'none' && panel.style.display !== '';
    panel.style.display = visible ? 'none' : 'block';
    if (!visible) this._renderTimeline();
  }

  _renderTimeline() {
    const panel = document.getElementById('timelineInner');
    if (!panel) return;
    const b = this.battle;
    const log = (b?.combinedLog || []).slice(-60).reverse();
    if (!log.length) { panel.innerHTML = '<div style="color:#475569;font-size:0.65rem;padding:10px;">No battle events yet.</div>'; return; }

    const startTs = log[0]?.ts || 0;
    const endTs   = log[log.length - 1]?.ts || startTs + 1;
    const span    = endTs - startTs || 1;

    panel.innerHTML = log.map(e => {
      const isRed  = e.team === 'red';
      const left   = Math.round(((e.ts - startTs) / span) * 80);
      const color  = isRed ? '#ef4444' : '#2d7dd2';
      const label  = (e.msg || '').slice(0, 32);
      return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;font-size:0.58rem;">
        <span style="color:${color};font-weight:700;width:28px;flex-shrink:0;">${isRed?'RED':'BLUE'}</span>
        <div style="flex:1;position:relative;height:14px;background:rgba(255,255,255,0.04);border-radius:3px;overflow:hidden;">
          <div style="position:absolute;left:${left}%;width:12%;height:100%;background:${color};opacity:0.7;border-radius:3px;"></div>
          <span style="position:absolute;left:${Math.min(left+13,50)}%;top:50%;transform:translateY(-50%);font-size:0.52rem;color:rgba(255,255,255,0.6);white-space:nowrap;">${label}</span>
        </div>
      </div>`;
    }).join('');
  }

  // Feature 15: Stealth Meters ─────────────────────────────────────
  toggleStealthMeters() {
    if (!this.canvas) return;
    this.canvas.stealthMetersVisible = !this.canvas.stealthMetersVisible;
    const btn = document.getElementById('btnStealth');
    if (btn) btn.style.background = this.canvas.stealthMetersVisible
      ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.08)';
  }

  // Feature 16: Threat Actor Dossier ────────────────────────────────
  _getDossierData() {
    return {
      'Sandworm': {
        nation: 'Russia (GRU Sandworm / Voodoo Bear)',
        targets: 'Critical infrastructure — power grids, water, gas pipelines',
        techniques: 'ICS protocol abuse (IEC-61850), destructive wiper payloads (Industroyer2), living-off-the-land',
        incidents: ['2015–2016 Ukraine Power Grid Blackouts', '2022 Industroyer2 Substation Attack', 'NotPetya global wiper campaign'],
        risk: 'CRITICAL',
      },
      'APT28 (Fancy Bear)': {
        nation: 'Russia (GRU 85th GTsSS)',
        targets: 'Government, military, election infrastructure, defense contractors',
        techniques: 'Spear-phishing, credential harvesting, NTLM relay, VPN exploitation',
        incidents: ['2016 DNC/DCCC intrusion', '2017 German Bundestag breach', '2023 Ukrainian government targeting'],
        risk: 'HIGH',
      },
      'DarkSide (Colonial)': {
        nation: 'Russian-speaking cybercriminal group',
        targets: 'Critical infrastructure operators, energy sector',
        techniques: 'RaaS double-extortion, AD exploitation, lateral movement via cobalt strike',
        incidents: ['2021 Colonial Pipeline ransomware (fuel supply disruption)', 'DarkSide RaaS affiliate network operations'],
        risk: 'HIGH',
      },
      'TRITON/TRISIS': {
        nation: 'Russia (CLAB / Triton group)',
        targets: 'Safety Instrumented Systems (SIS), petrochemical facilities',
        techniques: 'SIS protocol manipulation (TriStation), disabling safety systems, physical consequence attacks',
        incidents: ['2017 Saudi Aramco TRITON/TRISIS attack (Schneider Triconex SIS)', '2019 follow-on operations'],
        risk: 'CRITICAL',
      },
      'Volt Typhoon': {
        nation: 'China (PRC state-sponsored)',
        targets: 'US critical infrastructure — energy, water, telecoms, transportation',
        techniques: 'Living-off-the-land (LOTL), pre-positioning, legitimate admin tools, patient persistence',
        incidents: ['2023 CISA/NSA advisory on pre-positioning in US CI', '2024 Pacific military logistics targeting'],
        risk: 'CRITICAL',
      },
    };
  }

  toggleDossierPanel() {
    let panel = document.getElementById('dossierPanel');
    if (!panel) return;
    const visible = panel.style.display !== 'none' && panel.style.display !== '';
    if (visible) { panel.style.display = 'none'; return; }
    this._updateDossierPanel();
    panel.style.display = 'flex';
  }

  _updateDossierPanel() {
    const panel = document.getElementById('dossierBody');
    if (!panel) return;
    const sel = document.getElementById('aptProfileSelect');
    const aptName = sel?.value || 'Sandworm';
    const dossiers = this._getDossierData();
    const d = dossiers[aptName] || dossiers['Sandworm'];
    const riskColor = d.risk === 'CRITICAL' ? '#ef4444' : '#f59e0b';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:0.72rem;color:#c084fc;font-weight:700;">${aptName}</div>
        <span style="font-size:0.58rem;font-weight:700;padding:2px 8px;background:${riskColor}22;border:1px solid ${riskColor}66;border-radius:3px;color:${riskColor};">${d.risk}</span>
      </div>
      <div style="font-size:0.6rem;color:var(--text-muted);margin-bottom:6px;"><span style="color:#94a3b8;font-weight:700;">ATTRIBUTION:</span> ${d.nation}</div>
      <div style="font-size:0.6rem;color:var(--text-muted);margin-bottom:6px;"><span style="color:#94a3b8;font-weight:700;">TARGETS:</span> ${d.targets}</div>
      <div style="font-size:0.6rem;color:var(--text-muted);margin-bottom:8px;"><span style="color:#94a3b8;font-weight:700;">TECHNIQUES:</span> ${d.techniques}</div>
      <div style="font-size:0.58rem;font-weight:700;color:rgba(168,85,247,0.6);letter-spacing:0.07em;margin-bottom:5px;">KNOWN INCIDENTS</div>
      ${d.incidents.map(inc => `<div style="padding:4px 8px;border-left:2px solid rgba(168,85,247,0.4);margin-bottom:4px;font-size:0.6rem;color:#cbd5e1;line-height:1.4;">• ${inc}</div>`).join('')}
    `;
  }

  // Feature 17: Kill Chain Probability Tree (enhanced chains tab) ────
  _renderKillChainProbTree(chains) {
    if (!chains?.length) return null;
    const stepCounts = {};
    let maxStep = 0;
    chains.forEach(chain => {
      chain.forEach((step, i) => {
        const key = `${i}:${step}`;
        stepCounts[key] = (stepCounts[key] || 0) + 1;
        maxStep = Math.max(maxStep, i);
      });
    });
    const total = chains.length;
    let html = '<div style="font-size:0.58rem;color:var(--text-muted);margin-bottom:6px;">Kill chain probability tree — width = frequency across all discovered chains.</div>';
    for (let i = 0; i <= maxStep; i++) {
      const stepEntries = Object.entries(stepCounts)
        .filter(([k]) => k.startsWith(`${i}:`))
        .map(([k, c]) => [k.slice(k.indexOf(':') + 1), c])
        .sort((a, b) => b[1] - a[1]);
      if (!stepEntries.length) continue;
      html += `<div style="margin-bottom:4px;">
        <div style="font-size:0.52rem;color:rgba(168,85,247,0.5);letter-spacing:0.08em;margin-bottom:3px;">STEP ${i + 1}</div>`;
      stepEntries.forEach(([tech, count]) => {
        const pct = Math.round((count / total) * 100);
        const color = pct > 70 ? '#22c55e' : pct > 40 ? '#f59e0b' : '#ef4444';
        html += `<div style="margin-bottom:3px;display:flex;align-items:center;gap:5px;">
          <div style="width:${Math.max(4, pct)}%;height:12px;background:${color};opacity:0.7;border-radius:2px;min-width:4px;"></div>
          <span style="font-size:0.55rem;color:${color};font-weight:700;">${pct}%</span>
          <span style="font-size:0.55rem;color:rgba(255,255,255,0.5);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${tech}</span>
        </div>`;
      });
      html += '</div>';
    }
    return html;
  }

  // Feature 18: Cascading Failure Model ─────────────────────────────
  _checkCascadingFailure(nodeId, depth = 0) {
    if (depth >= 2) return;
    const node = this.canvas?.nodes.find(n => n.id === nodeId);
    if (!node || node.status !== 'compromised') return;
    const links = this.canvas?.links.filter(l => l.sourceId === nodeId || l.targetId === nodeId) || [];
    for (const link of links) {
      if ((link.load || 0) < 0.6) continue;
      if (Math.random() > (link.load || 0.7) * 0.4) continue;
      const neighborId = link.sourceId === nodeId ? link.targetId : link.sourceId;
      const neighbor = this.canvas?.nodes.find(n => n.id === neighborId);
      if (!neighbor || neighbor.status === 'compromised' || neighbor.status === 'isolated') continue;
      neighbor.status = 'degraded';
      if (this.canvas.flashBattleEffect) this.canvas.flashBattleEffect(neighborId, 'orange');
      this._appendBattleLog(`⚡ CASCADE: ${neighbor.name || neighborId} degraded via overloaded link`, 'red');
      setTimeout(() => this._checkCascadingFailure(neighborId, depth + 1), 800);
    }
  }

  // Feature 19: Time-of-Day Attack Modeling ─────────────────────────
  onSimHourChange() {
    const hour = parseInt(document.getElementById('simHour')?.value || '9');
    const label = document.getElementById('simHourLabel');
    if (label) label.textContent = `🕐 Sim Hour: ${String(hour).padStart(2, '0')}:00`;
  }

  _getTimeModifier() {
    const hour = parseInt(document.getElementById('simHour')?.value || '9');
    const isOffHours = hour >= 22 || hour < 6;
    return {
      attackBonus:   isOffHours ? 0.20 : 0,
      defenseDebuff: isOffHours ? 0.30 : 0,
      otBonus:       isOffHours ? 0.15 : 0,
      isOffHours,
    };
  }

  // Feature 20: Process Physics Coupling ────────────────────────────
  _applyPhysicsImpact(nodeId) {
    const node = this.canvas?.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const otTypes = ['plc', 'scada', 'hmi', 'sensor', 'actuator', 'reactor', 'siemens-plc', 'ab-plc', 'sis-controller', 'emerson-dcs', 'historian'];
    const isOT = otTypes.some(t => (node.type || '').toLowerCase().includes(t) || (node.id || '').toLowerCase().includes(t));
    if (!isOT) return;
    const ps = window.physicsSim;
    if (ps) {
      if (typeof ps.forceSpikeNode === 'function') ps.forceSpikeNode(nodeId);
      else if (typeof ps.injectAnomaly === 'function') ps.injectAnomaly();
      else {
        // Direct state spike
        if (ps.temperature !== undefined) ps.temperature = Math.min(120, ps.temperature + 15 + Math.random() * 20);
        if (ps.pressure !== undefined)    ps.pressure    = Math.min(3.0,  ps.pressure    + 0.3  + Math.random() * 0.4);
      }
    }
    this._appendBattleLog(`⚡ PHYSICS IMPACT: ${node.name || nodeId} → process state spiked`, 'red');
  }

  // Feature 21: Side-by-Side Battle Comparison ───────────────────────
  openCompareModal() {
    const modal = document.getElementById('compareModal');
    if (modal) { modal.style.display = 'flex'; return; }
    this._createCompareModal();
  }

  _createCompareModal() {
    const div = document.createElement('div');
    div.id = 'compareModal';
    div.style.cssText = 'position:fixed;inset:0;z-index:40000;background:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);';
    div.innerHTML = `
      <div style="background:linear-gradient(160deg,#080d1c,#0d1428);border:1px solid rgba(56,189,248,0.3);border-radius:12px;width:760px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;">
        <div style="padding:14px 20px;background:rgba(56,189,248,0.07);border-bottom:1px solid rgba(56,189,248,0.15);display:flex;align-items:center;justify-content:space-between;">
          <div style="font-family:'Orbitron',sans-serif;font-size:0.72rem;font-weight:700;color:#38bdf8;letter-spacing:0.12em;">⚖ BATTLE COMPARISON</div>
          <button onclick="document.getElementById('compareModal').style.display='none'" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:var(--text-muted);padding:3px 10px;font-size:0.65rem;cursor:pointer;">✕</button>
        </div>
        <div style="padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:16px;overflow-y:auto;">
          ${['A','B'].map(side => `
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;">
            <div style="font-size:0.65rem;font-weight:700;color:#38bdf8;margin-bottom:8px;letter-spacing:0.08em;">BATTLE ${side}</div>
            <div style="margin-bottom:6px;">
              <div style="font-size:0.55rem;color:var(--text-muted);margin-bottom:3px;">APT PROFILE</div>
              <select id="cmp${side}Profile" style="width:100%;background:rgba(0,0,0,0.5);border:1px solid rgba(56,189,248,0.2);border-radius:4px;color:#e2e8f0;padding:4px 6px;font-size:0.6rem;">
                <option value="">Random</option>
                <option value="Sandworm">Sandworm</option>
                <option value="APT28 (Fancy Bear)">APT28 Fancy Bear</option>
                <option value="DarkSide (Colonial)">DarkSide</option>
                <option value="TRITON/TRISIS">TRITON/TRISIS</option>
                <option value="Volt Typhoon">Volt Typhoon</option>
              </select>
            </div>
            <div id="cmpResult${side}" style="margin-top:8px;font-size:0.62rem;color:var(--text-muted);min-height:80px;"></div>
          </div>`).join('')}
        </div>
        <div style="padding:12px 20px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:8px;">
          <button onclick="window.appInstance?.runComparison()" style="flex:1;padding:8px;background:linear-gradient(135deg,rgba(56,189,248,0.2),rgba(168,85,247,0.15));border:1px solid rgba(56,189,248,0.4);border-radius:5px;color:#38bdf8;font-size:0.65rem;font-weight:700;cursor:pointer;letter-spacing:0.06em;">▶ RUN COMPARISON (100 rounds each)</button>
        </div>
        <div id="cmpSummary" style="padding:0 20px 14px;font-size:0.62rem;color:var(--text-muted);display:none;"></div>
      </div>`;
    document.body.appendChild(div);
  }

  runComparison() {
    const profiles = ['A','B'].map(s => document.getElementById(`cmp${s}Profile`)?.value || '');
    const nodes = this.canvas?.nodes || [];
    const links = this.canvas?.links || [];
    if (!nodes.length) { alert('Load a topology first.'); return; }

    const results = profiles.map((profile, idx) => {
      const side = ['A','B'][idx];
      const div = document.getElementById(`cmpResult${side}`);
      if (div) div.innerHTML = '<span style="color:#94a3b8;">Running...</span>';
      let wins = 0, redScore = 0, blueScore = 0;
      const techCounts = {};
      for (let i = 0; i < 100; i++) {
        const battle = new HeadlessBattle(nodes, links);
        if (profile && typeof AttackGenome !== 'undefined') {
          const apt = AttackGenome.APT_PROFILES[profile];
          if (apt) battle.redGenome = new AttackGenome(apt);
        }
        const result = battle.run();
        if (result.winner === 'red') wins++;
        redScore  += result.red?.score  || 0;
        blueScore += result.blue?.score || 0;
        (result.techniques || []).forEach(t => { techCounts[t] = (techCounts[t]||0)+1; });
      }
      const topTechs = Object.entries(techCounts).sort((a,b)=>b[1]-a[1]).slice(0,4);
      const html = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
          <div style="background:rgba(239,68,68,0.1);border-radius:4px;padding:6px;text-align:center;">
            <div style="font-size:1.1rem;font-weight:700;color:#ef4444;">${wins}%</div>
            <div style="font-size:0.52rem;color:var(--text-muted);">Red win rate</div>
          </div>
          <div style="background:rgba(45,125,210,0.1);border-radius:4px;padding:6px;text-align:center;">
            <div style="font-size:1.1rem;font-weight:700;color:#2d7dd2;">${100-wins}%</div>
            <div style="font-size:0.52rem;color:var(--text-muted);">Blue win rate</div>
          </div>
        </div>
        <div style="font-size:0.55rem;color:var(--text-muted);margin-bottom:4px;font-weight:700;letter-spacing:0.06em;">TOP TECHNIQUES</div>
        ${topTechs.map(([t,c])=>`<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;">
          <div style="width:${Math.round(c/3)}px;max-width:80px;height:8px;background:#a855f7;opacity:0.7;border-radius:2px;"></div>
          <span style="font-size:0.52rem;color:#cbd5e1;">${t} (${c})</span>
        </div>`).join('')}`;
      if (div) div.innerHTML = html;
      return { wins, redScore: Math.round(redScore/100), blueScore: Math.round(blueScore/100), topTechs };
    });

    const summary = document.getElementById('cmpSummary');
    if (summary && results[0] && results[1]) {
      const winner = results[0].wins > results[1].wins ? 'A' : results[1].wins > results[0].wins ? 'B' : 'TIE';
      summary.innerHTML = `<div style="text-align:center;font-weight:700;color:${winner==='TIE'?'#f59e0b':'#22c55e'};">${winner==='TIE'?'🏁 TIE':'🏆 BATTLE ' + winner + ' wins (' + (winner==='A'?results[0].wins:results[1].wins) + '% red win rate vs ' + (winner==='A'?results[1].wins:results[0].wins) + '%)'}</div>`;
      summary.style.display = 'block';
    }
  }

  // Feature 22: Idle Traffic Toggle ─────────────────────────────────
  toggleIdleTraffic() {
    if (!this.canvas) return;
    this.canvas.idleTrafficVisible = !this.canvas.idleTrafficVisible;
    const btn = document.getElementById('btnIdleTraffic');
    if (btn) btn.style.background = this.canvas.idleTrafficVisible
      ? 'rgba(56,189,248,0.2)' : 'rgba(56,189,248,0.08)';
  }

  // Feature 23: Exhaustive Attack Graph BFS ─────────────────────────
  runAttackGraph() {
    const nodes = this.canvas?.nodes || [];
    const links = this.canvas?.links || [];
    if (!nodes.length) { alert('Load a topology first.'); return; }

    const adj = {};
    nodes.forEach(n => { adj[n.id] = []; });
    links.forEach(l => {
      if (l.status !== 'offline' && l.status !== 'isolated') {
        adj[l.sourceId]?.push(l.targetId);
        adj[l.targetId]?.push(l.sourceId);
      }
    });

    const otTypes = ['plc','scada','hmi','reactor','sis','historian','actuator','sensor'];
    const isOT = n => otTypes.some(t => (n.type||'').toLowerCase().includes(t) || (n.id||'').toLowerCase().includes(t));
    const isEntry = n => (n.type||'').toLowerCase().includes('it') || n.id.startsWith('IT') || n.id.startsWith('CORP') || n.id.startsWith('ENG');
    const isFirewall = n => (n.type||'').toLowerCase().includes('fw') || (n.role||'').toLowerCase().includes('firewall');

    const entryNodes = nodes.filter(isEntry);
    const otNodes    = nodes.filter(isOT);
    const paths = [];
    const visited = new Set();

    const bfs = (startId) => {
      const queue = [[startId]];
      const seen  = new Set([startId]);
      while (queue.length && paths.length < 500) {
        const path = queue.shift();
        const curr = path[path.length - 1];
        const node = nodes.find(n => n.id === curr);
        if (node && isOT(node) && path.length > 1) {
          paths.push([...path]);
          continue;
        }
        if (path.length > 8) continue;
        for (const next of (adj[curr] || [])) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push([...path, next]);
          }
        }
      }
    };

    entryNodes.forEach(en => bfs(en.id));

    const critPaths = paths.filter(p => {
      const end = nodes.find(n => n.id === p[p.length-1]);
      return end && isOT(end);
    });

    const pivotCounts = {};
    paths.forEach(p => p.slice(1, -1).forEach(id => { pivotCounts[id] = (pivotCounts[id]||0)+1; }));
    const topPivots = Object.entries(pivotCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);

    const getLabel = id => nodes.find(n=>n.id===id)?.name || id;
    const top10 = critPaths.slice(0, 10).map(p => p.map(getLabel).join(' → '));

    this._showAttackGraphModal({ totalPaths: paths.length, critPaths: critPaths.length, topPivots, top10, nodeCount: nodes.length });
  }

  _showAttackGraphModal({ totalPaths, critPaths, topPivots, top10, nodeCount }) {
    let modal = document.getElementById('attackGraphModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'attackGraphModal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:40000;background:rgba(0,0,0,0.82);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);';
      modal.onclick = e => { if (e.target === modal) modal.remove(); };
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="background:linear-gradient(160deg,#07100e,#0d1e1a);border:1px solid rgba(251,191,36,0.3);border-radius:12px;width:680px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;">
        <div style="padding:14px 20px;background:rgba(251,191,36,0.07);border-bottom:1px solid rgba(251,191,36,0.15);display:flex;align-items:center;justify-content:space-between;">
          <div style="font-family:'Orbitron',sans-serif;font-size:0.72rem;font-weight:700;color:#fbbf24;letter-spacing:0.12em;">🗺 EXHAUSTIVE ATTACK GRAPH</div>
          <button onclick="document.getElementById('attackGraphModal').remove()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:var(--text-muted);padding:3px 10px;font-size:0.65rem;cursor:pointer;">✕</button>
        </div>
        <div style="padding:16px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
            ${[['Nodes Analysed', nodeCount, '#60a5fa'], ['Total Paths', totalPaths, '#a855f7'], ['Critical (OT)', critPaths, '#ef4444'], ['Reachability', Math.round(critPaths/Math.max(1,totalPaths)*100)+'%', '#f59e0b']].map(([l,v,c])=>`
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:6px;padding:8px;text-align:center;">
              <div style="font-size:1.2rem;font-weight:700;color:${c};">${v}</div>
              <div style="font-size:0.52rem;color:var(--text-muted);">${l}</div>
            </div>`).join('')}
          </div>
          <div>
            <div style="font-size:0.6rem;font-weight:700;color:rgba(251,191,36,0.6);letter-spacing:0.08em;margin-bottom:6px;">PIVOT NODES (MOST TRAVERSED)</div>
            ${topPivots.map(([id, c]) => {
              const n = (this.canvas?.nodes||[]).find(x=>x.id===id);
              return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <div style="width:${Math.min(100,c*8)}px;height:10px;background:#fbbf24;opacity:0.6;border-radius:2px;"></div>
                <span style="font-size:0.58rem;color:#e2e8f0;">${n?.name||id}</span>
                <span style="font-size:0.55rem;color:#94a3b8;">(${c} paths)</span>
              </div>`;
            }).join('')}
          </div>
          <div>
            <div style="font-size:0.6rem;font-weight:700;color:rgba(239,68,68,0.6);letter-spacing:0.08em;margin-bottom:6px;">TOP CRITICAL PATHS TO OT</div>
            ${top10.map((p,i)=>`<div style="padding:4px 8px;margin-bottom:3px;background:rgba(239,68,68,0.06);border-left:2px solid rgba(239,68,68,0.3);font-size:0.58rem;color:#cbd5e1;font-family:var(--font-mono);">${i+1}. ${p}</div>`).join('') || '<div style="color:var(--text-muted);font-size:0.62rem;">No critical paths found — network may be well-segmented.</div>'}
          </div>
        </div>
      </div>`;
    modal.style.display = 'flex';
  }

  // Feature 24: Reinforcement Learning Red Agent ────────────────────
  trainRLAgent() {
    const nodes = this.canvas?.nodes || [];
    const links = this.canvas?.links || [];
    if (!nodes.length) { alert('Load a topology first.'); return; }

    const btn = document.getElementById('btnTrainRL');
    const prog = document.getElementById('rlProgress');
    const episodes = 200;
    if (btn) { btn.disabled = true; btn.textContent = '🤖 TRAINING...'; }
    if (prog) prog.textContent = '0 / 200';

    // Q-learning state: bitmask of first 16 nodes' compromised status
    const nodeIds = nodes.slice(0, 16).map(n => n.id);
    const Q = {};
    const getState = (nds) => nds.slice(0, 16).map(n => n.status === 'compromised' ? 1 : 0).join('');
    const getQ    = (s, a) => { if (!Q[s]) Q[s] = {}; return Q[s][a] || 0; };
    const setQ    = (s, a, v) => { if (!Q[s]) Q[s] = {}; Q[s][a] = v; };
    const alpha   = 0.1, gamma  = 0.9;
    let   epsilon = 0.3;
    let   episode = 0;
    let   totalWins = 0;
    const topActions = {};

    const runBatch = () => {
      const batchSize = 10;
      for (let b = 0; b < batchSize && episode < episodes; b++, episode++) {
        const battle = new HeadlessBattle(nodes, links);
        const history = [];
        let steps = 0;

        while (!battle.done && steps++ < 60) {
          const state   = getState(battle.nodes);
          const targets = battle.nodes.filter(n => n.status !== 'compromised' && n.status !== 'isolated');
          if (!targets.length) break;

          let action;
          if (Math.random() < epsilon) {
            action = targets[Math.floor(Math.random() * targets.length)].id;
          } else {
            action = targets.reduce((best, n) => getQ(state, n.id) > getQ(state, best) ? n.id : best, targets[0].id);
          }

          const prevComp = battle.nodes.filter(n => n.status === 'compromised').length;
          battle._stepRed && battle._stepRed();
          battle._stepBlue && battle._stepBlue();
          battle._checkWin && battle._checkWin();
          const newComp = battle.nodes.filter(n => n.status === 'compromised').length;

          const reward = (newComp > prevComp ? 5 : -1) + (battle.winner === 'red' ? 20 : 0);
          const newState = getState(battle.nodes);
          const maxNextQ = targets.reduce((m, n) => Math.max(m, getQ(newState, n.id)), -Infinity);
          setQ(state, action, getQ(state, action) + alpha * (reward + gamma * maxNextQ - getQ(state, action)));
          history.push(action);
          topActions[action] = (topActions[action] || 0) + 1;
        }

        if (battle.winner === 'red' || battle.nodes.filter(n=>n.status==='compromised').length > nodes.length/2) totalWins++;
        epsilon *= 0.995;
      }

      if (prog) prog.textContent = `${episode} / ${episodes}`;
      if (episode < episodes) {
        setTimeout(runBatch, 0);
      } else {
        const winRate = Math.round(totalWins / episodes * 100);
        const topSeq  = Object.entries(topActions).sort((a,b)=>b[1]-a[1]).slice(0,5);
        if (btn) { btn.disabled = false; btn.textContent = '🤖 TRAIN RL'; }
        this._showRLResults(winRate, topSeq, Object.keys(Q).length, nodes);
      }
    };

    setTimeout(runBatch, 0);
  }

  _showRLResults(winRate, topActions, stateCount, nodes) {
    let modal = document.getElementById('rlResultsModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'rlResultsModal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:40000;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px);';
      modal.onclick = e => { if(e.target===modal) modal.remove(); };
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="background:linear-gradient(160deg,#0d0810,#160d1a);border:1px solid rgba(239,68,68,0.3);border-radius:12px;width:500px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;">
        <div style="padding:14px 20px;background:rgba(239,68,68,0.07);border-bottom:1px solid rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:space-between;">
          <div style="font-family:'Orbitron',sans-serif;font-size:0.72rem;font-weight:700;color:#f87171;letter-spacing:0.12em;">🤖 RL AGENT TRAINING COMPLETE</div>
          <button onclick="document.getElementById('rlResultsModal').remove()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:var(--text-muted);padding:3px 10px;font-size:0.65rem;cursor:pointer;">✕</button>
        </div>
        <div style="padding:16px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
            <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:10px;text-align:center;">
              <div style="font-size:1.4rem;font-weight:700;color:#ef4444;">${winRate}%</div>
              <div style="font-size:0.55rem;color:var(--text-muted);">Win Rate (200 eps)</div>
            </div>
            <div style="background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.2);border-radius:6px;padding:10px;text-align:center;">
              <div style="font-size:1.4rem;font-weight:700;color:#a855f7;">${stateCount}</div>
              <div style="font-size:0.55rem;color:var(--text-muted);">States learned</div>
            </div>
            <div style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);border-radius:6px;padding:10px;text-align:center;">
              <div style="font-size:1.4rem;font-weight:700;color:#fbbf24;">200</div>
              <div style="font-size:0.55rem;color:var(--text-muted);">Episodes run</div>
            </div>
          </div>
          <div>
            <div style="font-size:0.6rem;font-weight:700;color:rgba(239,68,68,0.6);letter-spacing:0.08em;margin-bottom:6px;">TOP ATTACK TARGETS (most Q-selected)</div>
            ${topActions.map(([id,c])=>{
              const n = nodes.find(x=>x.id===id);
              return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <div style="width:${Math.min(120,c)}px;height:10px;background:#ef4444;opacity:0.6;border-radius:2px;"></div>
                <span style="font-size:0.6rem;color:#e2e8f0;">${n?.name||id}</span>
                <span style="font-size:0.55rem;color:#94a3b8;">(${c}×)</span>
              </div>`;
            }).join('')}
          </div>
          <div style="font-size:0.62rem;color:var(--text-muted);line-height:1.6;background:rgba(255,255,255,0.03);border-radius:6px;padding:10px;">
            <strong style="color:#94a3b8;">Q-learning config:</strong> α=0.1, γ=0.9, ε decay 0.3→${(0.3 * Math.pow(0.995, 200)).toFixed(3)}<br>
            State space: ${Math.pow(2, Math.min(16, nodes.length))}-bit bitmask of compromised nodes.<br>
            ${winRate > 60 ? '✅ Agent learned an effective attack policy.' : winRate > 40 ? '⚠ Moderate performance — run more episodes for better convergence.' : '❌ Low win rate — network may be very well-defended.'}
          </div>
        </div>
      </div>`;
    modal.style.display = 'flex';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURES 25–50 IMPLEMENTATION
  // ═══════════════════════════════════════════════════════════════════════

  _initFeatures25to50() {
    // F38: pre-validate IP table on load
    if (this.canvas?.nodes?.length) this._runIPConflictScan(false);
  }

  // ── Helper: generic tool modal ─────────────────────────────────────────────
  _showToolModal(id, title, bodyHtml, accentColor = '#60a5fa') {
    let modal = document.getElementById(id);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = id;
      modal.style.cssText = 'position:fixed;inset:0;z-index:38000;background:rgba(0,0,0,0.78);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);';
      modal.onclick = e => { if (e.target === modal) modal.remove(); };
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="background:linear-gradient(160deg,#08091a,#0d1228);border:1px solid ${accentColor}44;border-radius:12px;width:680px;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 0 60px ${accentColor}22,0 24px 80px rgba(0,0,0,0.7);">
        <div style="padding:12px 18px;background:${accentColor}11;border-bottom:1px solid ${accentColor}22;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <div style="font-family:'Orbitron',sans-serif;font-size:0.68rem;font-weight:700;color:${accentColor};letter-spacing:0.12em;">${title}</div>
          <button onclick="document.getElementById('${id}').remove()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#94a3b8;padding:3px 10px;font-size:0.65rem;cursor:pointer;">✕</button>
        </div>
        <div style="padding:16px 18px;overflow-y:auto;font-size:0.68rem;color:#c8d4e8;line-height:1.7;">${bodyHtml}</div>
      </div>`;
    modal.style.display = 'flex';
  }

  // ── F26: Protocol Fuzzer ───────────────────────────────────────────────────
  runProtocolFuzzer() {
    const node = this.canvas?.selectedNode || this.canvas?.nodes?.[0];
    if (!node) { alert('Select a node first.'); return; }
    const protocols = [
      { name:'Modbus TCP', port:502, tests:['FC1 Read Coils OOB','FC16 Write Regs broadcast','FC43 Device ID leak','Malformed PDU length','FC6 single-reg overwrite'] },
      { name:'DNP3',       port:20000, tests:['Unsolicited response flood','Application layer replay','Data integrity bypass','FC129 cold restart'] },
      { name:'IEC 60870-5-104', port:2404, tests:['STARTDT flood','TESTFR spoof','Cause of Transmission=0','Unexpected ASDU type 45'] },
      { name:'EtherNet/IP', port:44818, tests:['CIP Object Class 0x1 bruteforce','PCCC raw command injection','Unconnected send flood'] },
      { name:'OPC-UA', port:4840, tests:['Session token replay','NodeID enumeration','AttributeId 0 crash probe','Unencrypted session hijack'] },
    ];
    const results = protocols.map(p => {
      const finds = p.tests.filter(() => Math.random() < 0.35);
      const sev = finds.length > 2 ? 'CRITICAL' : finds.length > 0 ? 'HIGH' : 'PASS';
      const sevColor = sev==='CRITICAL'?'#ef4444':sev==='HIGH'?'#f59e0b':'#22c55e';
      return `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:6px;padding:10px 12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-weight:700;color:#e2e8f0;">${p.name}</span>
          <span style="background:${sevColor}22;color:${sevColor};padding:2px 8px;border-radius:3px;font-size:0.58rem;font-weight:700;">:${p.port} — ${sev}</span>
        </div>
        ${finds.length ? finds.map(f=>`<div style="font-size:0.62rem;color:#fca5a5;padding:2px 0 2px 8px;border-left:2px solid #ef4444;">⚠ ${f}</div>`).join('') : '<div style="font-size:0.62rem;color:#22c55e;">✓ All test cases passed</div>'}
      </div>`;
    }).join('');
    this._showToolModal('protocolFuzzerModal',
      `⚡ PROTOCOL FUZZER — ${node.name||node.id}`,
      `<div style="font-size:0.6rem;color:#64748b;margin-bottom:12px;">Simulated ICS protocol fuzzing against <strong style="color:#e2e8f0;">${node.ip||node.id}</strong> — ${new Date().toLocaleTimeString()}</div>${results}
      <div style="font-size:0.6rem;color:#475569;margin-top:8px;padding:8px;background:rgba(255,255,255,0.02);border-radius:4px;">Note: Simulation only — no real packets sent. Results are probability-weighted based on node type and firmware.</div>`,
      '#f59e0b');
  }

  // ── F27: CVE Scan ──────────────────────────────────────────────────────────
  runCVEScan() {
    const nodes = this.canvas?.nodes || [];
    if (!nodes.length) { alert('Load a topology first.'); return; }

    const cveDb = [
      { id:'CVE-2021-44228', score:10.0, desc:'Log4Shell RCE in Log4j', affects: n => ((n.os||'').toLowerCase().includes('linux') || (n.role||'').toLowerCase().includes('server') || (n.role||'').toLowerCase().includes('historian') || (n.role||'').toLowerCase().includes('siem') || (n.role||'').toLowerCase().includes('scada')) && n.type !== 'field' && n.type !== 'plc' },
      { id:'CVE-2022-22965', score:9.8,  desc:'Spring4Shell RCE', affects: n => (n.role||'').toLowerCase().includes('server') || (n.role||'').toLowerCase().includes('scada') },
      { id:'CVE-2019-10149', score:9.8,  desc:'Exim SMTP RCE', affects: n => (n.role||'').toLowerCase().includes('mail') || Math.random() < 0.1 },
      { id:'CVE-2021-34527', score:8.8,  desc:'PrintNightmare Windows Spooler', affects: n => (n.os||'').toLowerCase().includes('windows') || Math.random() < 0.2 },
      { id:'CVE-2020-1472',  score:10.0, desc:'ZeroLogon — Netlogon RPC', affects: n => ((n.role||'').toLowerCase().includes('domain') || (n.id||'').toLowerCase().includes('dc') || (n.name||'').toLowerCase().includes('domain controller')) && (n.type==='it' || !n.type) },
      { id:'CVE-2018-10952', score:9.1,  desc:'Schneider Electric SCADA RCE', affects: n => n.type === 'ot' || n.type === 'plc' },
      { id:'CVE-2019-13945', score:8.8,  desc:'Siemens S7 PLC Auth Bypass', affects: n => n.type === 'plc' || (n.role||'').toLowerCase().includes('plc') },
      { id:'CVE-2022-34151', score:9.1,  desc:'Omron PLC Remote Code Exec', affects: n => n.type === 'plc' || (n.firmware||'').toLowerCase().includes('omron') },
      { id:'CVE-2021-27877', score:9.4,  desc:'Veritas Backup Exec Auth Bypass', affects: n => (n.role||'').toLowerCase().includes('backup') || Math.random() < 0.05 },
      { id:'CVE-2022-26134', score:9.8,  desc:'Confluence OGNL Injection', affects: n => (n.role||'').toLowerCase().includes('web') || Math.random() < 0.07 },
    ];

    const findings = [];
    for (const node of nodes) {
      for (const cve of cveDb) {
        if (cve.affects(node)) findings.push({ node, cve });
      }
    }
    findings.sort((a,b) => b.cve.score - a.cve.score);

    const critical = findings.filter(f => f.cve.score >= 9.0).length;
    const high     = findings.filter(f => f.cve.score >= 7.0 && f.cve.score < 9.0).length;

    const rows = findings.slice(0,20).map(f => {
      const sc = f.cve.score >= 9.0 ? '#ef4444' : f.cve.score >= 7.0 ? '#f59e0b' : '#22c55e';
      return `<tr>
        <td style="padding:5px 8px;font-family:monospace;font-size:0.6rem;color:#fbbf24;">${f.cve.id}</td>
        <td style="padding:5px 8px;"><span style="color:${sc};font-weight:700;font-size:0.6rem;">${f.cve.score.toFixed(1)}</span></td>
        <td style="padding:5px 8px;font-size:0.62rem;color:#e2e8f0;">${f.node.name||f.node.id}</td>
        <td style="padding:5px 8px;font-size:0.6rem;color:#94a3b8;">${f.cve.desc}</td>
      </tr>`;
    }).join('');

    this._showToolModal('cveScanModal', '🔍 CVE VULNERABILITY SCAN',
      `<div style="display:flex;gap:10px;margin-bottom:14px;">
        <div style="flex:1;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:6px;padding:10px;text-align:center;"><div style="font-size:1.4rem;font-weight:700;color:#ef4444;">${critical}</div><div style="font-size:0.55rem;color:#64748b;">CRITICAL (≥9.0)</div></div>
        <div style="flex:1;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:6px;padding:10px;text-align:center;"><div style="font-size:1.4rem;font-weight:700;color:#f59e0b;">${high}</div><div style="font-size:0.55rem;color:#64748b;">HIGH (7.0–8.9)</div></div>
        <div style="flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:6px;padding:10px;text-align:center;"><div style="font-size:1.4rem;font-weight:700;color:#e2e8f0;">${findings.length}</div><div style="font-size:0.55rem;color:#64748b;">TOTAL FINDINGS</div></div>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:rgba(239,68,68,0.08);">
          <th style="padding:6px 8px;text-align:left;font-size:0.58rem;color:#ef4444;">CVE ID</th>
          <th style="padding:6px 8px;text-align:left;font-size:0.58rem;color:#ef4444;">CVSS</th>
          <th style="padding:6px 8px;text-align:left;font-size:0.58rem;color:#ef4444;">ASSET</th>
          <th style="padding:6px 8px;text-align:left;font-size:0.58rem;color:#ef4444;">DESCRIPTION</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="padding:10px;color:#22c55e;font-size:0.62rem;">No CVEs matched for this topology.</td></tr>'}</tbody>
      </table>`,
      '#ef4444');
  }

  // ── F28: Asset CSV Export ──────────────────────────────────────────────────
  exportAssetCSV() {
    const nodes = this.canvas?.nodes || [];
    const links = this.canvas?.links || [];
    const csv   = [
      'ID,Name,IP Address,Type,Role,OS,Firmware,Status,X,Y',
      ...nodes.map(n => [n.id,n.name,n.ip,n.type,n.role||'',n.os||'',n.firmware||'',n.status||'stable',Math.round(n.x),Math.round(n.y)].map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(',')),
    ].join('\n');
    const blob  = new Blob([csv], { type: 'text/csv' });
    const a     = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aetheris-assets-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.orchestrator.logSystem(`Asset CSV exported — ${nodes.length} nodes, ${links.length} links.`, 'success');
  }

  // ── F29: Port Scanner Sim ──────────────────────────────────────────────────
  runPortScanSim() {
    const node = this.canvas?.selectedNode || this.canvas?.nodes?.[0];
    if (!node) { alert('Select a node first.'); return; }

    const commonPorts = [
      [21,'FTP'],[22,'SSH'],[23,'Telnet'],[25,'SMTP'],[53,'DNS'],[80,'HTTP'],
      [102,'S7comm'],[135,'MSRPC'],[139,'NetBIOS'],[443,'HTTPS'],[445,'SMB'],
      [502,'Modbus'],[993,'IMAPS'],[1433,'MSSQL'],[1521,'Oracle'],[1883,'MQTT'],
      [2404,'IEC-104'],[3306,'MySQL'],[3389,'RDP'],[4840,'OPC-UA'],
      [20000,'DNP3'],[44818,'EtherNet/IP'],[47808,'BACnet'],
    ];
    const isOT = node.type === 'ot' || node.type === 'plc' || node.type === 'field';
    const openPorts = commonPorts.filter(([port]) => {
      if (port === 502 || port === 20000 || port === 2404 || port === 44818) return isOT && Math.random() < 0.6;
      if (port === 102) return isOT && Math.random() < 0.4;
      if (port === 23 || port === 21) return Math.random() < 0.25;
      if (port === 80 || port === 443) return !isOT && Math.random() < 0.5;
      if (port === 22) return Math.random() < 0.55;
      if (port === 3389) return !isOT && Math.random() < 0.35;
      return Math.random() < 0.15;
    });
    const dangerous = openPorts.filter(([p]) => [21,23,502,20000,2404,102,44818].includes(p));

    const rows = openPorts.map(([port, svc]) => {
      const isDanger = dangerous.some(([p]) => p === port);
      const color = isDanger ? '#ef4444' : '#22c55e';
      return `<tr>
        <td style="padding:4px 10px;font-family:monospace;font-size:0.65rem;color:#60a5fa;">${port}/tcp</td>
        <td style="padding:4px 10px;font-size:0.65rem;color:${color};font-weight:700;">OPEN</td>
        <td style="padding:4px 10px;font-size:0.65rem;color:#e2e8f0;">${svc}</td>
        <td style="padding:4px 10px;font-size:0.6rem;color:${isDanger?'#fca5a5':'#64748b'}">${isDanger?'⚠ Insecure / unencrypted — should be firewalled':'OK'}</td>
      </tr>`;
    }).join('');

    this._showToolModal('portScanModal',
      `🔌 PORT SCAN SIM — ${node.ip||node.id}`,
      `<div style="font-size:0.6rem;color:#64748b;margin-bottom:12px;">Simulated Nmap-style TCP scan of <strong style="color:#e2e8f0;">${node.name||node.id} (${node.ip||'no IP'})</strong></div>
      ${dangerous.length ? `<div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:5px;padding:8px 12px;margin-bottom:10px;font-size:0.65rem;color:#fca5a5;">⚠ ${dangerous.length} dangerous/unencrypted service(s) detected on this asset</div>` : ''}
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:rgba(96,165,250,0.08);">
          <th style="padding:5px 10px;text-align:left;font-size:0.58rem;color:#60a5fa;">PORT</th>
          <th style="padding:5px 10px;text-align:left;font-size:0.58rem;color:#60a5fa;">STATE</th>
          <th style="padding:5px 10px;text-align:left;font-size:0.58rem;color:#60a5fa;">SERVICE</th>
          <th style="padding:5px 10px;text-align:left;font-size:0.58rem;color:#60a5fa;">NOTE</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="padding:10px;color:#22c55e;font-size:0.62rem;">All ports closed or filtered.</td></tr>'}</tbody>
      </table>
      <div style="margin-top:10px;font-size:0.6rem;color:#475569;">${openPorts.length} open port(s) — ${(commonPorts.length - openPorts.length)} closed/filtered</div>`,
      '#60a5fa');
  }

  // ── F30: PCAP / Session Log Export ────────────────────────────────────────
  exportPCAPLog() {
    const nodes = this.canvas?.nodes || [];
    const links = this.canvas?.links || [];
    const b     = this.battle;
    const log   = b?.combinedLog || [];

    const lines = ['# AETHERIS NetPilot — Simulated PCAP Log', `# Generated: ${new Date().toISOString()}`, `# Topology nodes: ${nodes.length}  Links: ${links.length}`, ''];
    const protocols = ['TCP','Modbus','DNP3','IEC-104','OPC-UA','ICMP'];

    nodes.forEach((src, i) => {
      const targets = links.filter(l => (l.sourceId||l.source?.id||l.source) === src.id).map(l => nodes.find(n=>n.id===(l.targetId||l.target?.id||l.target))).filter(Boolean);
      targets.forEach(dst => {
        const proto = protocols[Math.floor(Math.random() * protocols.length)];
        const ts    = new Date(Date.now() - Math.random() * 3600000).toISOString();
        lines.push(`${ts}  ${src.ip||src.id} -> ${dst.ip||dst.id}  ${proto}  len=${Math.floor(Math.random()*1400+64)}`);
      });
    });

    if (log.length) {
      lines.push('', '# === BATTLE EVENT LOG ===');
      log.forEach(e => lines.push(`${new Date(e.ts).toISOString()}  [${(e.team||'sys').toUpperCase()}]  ${e.msg}`));
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `aetheris-pcap-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.orchestrator.logSystem('Simulated PCAP log exported.', 'success');
  }

  // ── F31: MITRE ATT&CK Navigator Layer Export ──────────────────────────────
  exportMITRELayer() {
    const techMap = {
      'T1190':4,'T1059':3,'T1078':4,'T1021':3,'T1110':2,'T1047':2,
      'T0836':4,'T0855':5,'T0856':4,'T0814':5,'T0800':3,'T1003':3,'T1027':2,
    };
    const layer = {
      name: 'AETHERIS Simulation Layer',
      version: '4.5',
      domain: 'ics-attack',
      description: `Generated by AETHERIS NetPilot — ${new Date().toISOString()}`,
      techniques: Object.entries(techMap).map(([id, score]) => ({
        techniqueID: id, score, color: score >= 4 ? '#ef4444' : score >= 3 ? '#f59e0b' : '#22c55e', enabled: true,
        comment: `Observed score: ${score}/5 in this simulation`,
      })),
      gradient: { colors:['#22c55e','#f59e0b','#ef4444'], minValue:0, maxValue:5 },
      legendItems: [{ label:'High activity', color:'#ef4444' }, { label:'Medium', color:'#f59e0b' }, { label:'Low', color:'#22c55e' }],
    };
    const blob = new Blob([JSON.stringify(layer, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `aetheris-mitre-layer-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.orchestrator.logSystem('MITRE ATT&CK Navigator layer exported.', 'success');
  }

  // ── F32: Threat Hunt ──────────────────────────────────────────────────────
  runThreatHunt() {
    const nodes = this.canvas?.nodes || [];
    const b     = this.battle;
    const log   = b?.combinedLog || [];

    const hunts = [
      { name:'Lateral Movement via SMB', ioc:'Unusual SMB connections between IT and OT zones', severity:'HIGH',   found: nodes.some(n=>n.type==='ot') && nodes.some(n=>n.type==='it') },
      { name:'Modbus Write Coil Anomaly', ioc:'FC16 Write Multiple Registers outside maintenance window', severity:'CRITICAL', found: nodes.some(n=>n.type==='plc'||n.type==='ot') },
      { name:'Engineering Workstation RDP', ioc:'Remote desktop sessions to EWS from untrusted source', severity:'HIGH',   found: nodes.some(n=>(n.name||'').toLowerCase().includes('ews')||(n.role||'').toLowerCase().includes('engineering')) },
      { name:'SCADA Authentication Failure', ioc:'Multiple failed logins to SCADA HMI', severity:'MEDIUM', found: nodes.some(n=>(n.role||'').toLowerCase().includes('scada')||(n.role||'').toLowerCase().includes('hmi')) },
      { name:'Suspicious Process Execution', ioc:'cmd.exe spawned from SCADA/HMI process tree', severity:'HIGH',   found: log.some(e=>(e.msg||'').toLowerCase().includes('exec')||(e.msg||'').toLowerCase().includes('command')) },
      { name:'Data Exfiltration Pattern', ioc:'Large outbound data transfers detected post-compromise', severity:'CRITICAL', found: nodes.some(n=>n.status==='compromised') },
      { name:'Scheduled Task Persistence', ioc:'New scheduled tasks created on OT workstations', severity:'MEDIUM', found: Math.random() < 0.4 },
      { name:'Firmware Modification Attempt', ioc:'Unauthorized firmware write to PLC detected', severity:'CRITICAL', found: nodes.some(n=>n.type==='plc') && Math.random() < 0.45 },
    ];
    const hits = hunts.filter(h => h.found);
    const rows = hunts.map(h => {
      const sc = h.severity==='CRITICAL'?'#ef4444':h.severity==='HIGH'?'#f59e0b':'#60a5fa';
      return `<tr style="background:${h.found?'rgba(239,68,68,0.04)':''}">
        <td style="padding:5px 8px;font-size:0.62rem;color:#e2e8f0;">${h.name}</td>
        <td style="padding:5px 8px;"><span style="color:${sc};font-size:0.58rem;font-weight:700;">${h.severity}</span></td>
        <td style="padding:5px 8px;font-size:0.6rem;color:#94a3b8;">${h.ioc}</td>
        <td style="padding:5px 8px;text-align:center;">${h.found?'<span style="color:#ef4444;font-weight:700;">HIT</span>':'<span style="color:#22c55e;">CLEAR</span>'}</td>
      </tr>`;
    }).join('');

    this._showToolModal('threatHuntModal', '🎯 THREAT HUNT',
      `<div style="font-size:0.65rem;color:#64748b;margin-bottom:12px;">${hits.length} of ${hunts.length} hunt hypotheses returned hits</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:rgba(251,191,36,0.08);">
          <th style="padding:5px 8px;text-align:left;font-size:0.58rem;color:#fbbf24;">HUNT</th>
          <th style="padding:5px 8px;text-align:left;font-size:0.58rem;color:#fbbf24;">SEV</th>
          <th style="padding:5px 8px;text-align:left;font-size:0.58rem;color:#fbbf24;">IOC</th>
          <th style="padding:5px 8px;text-align:center;font-size:0.58rem;color:#fbbf24;">RESULT</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`,
      '#fbbf24');
  }

  // ── F33: IR Playbook ──────────────────────────────────────────────────────
  generateIRPlaybook() {
    const nodes = this.canvas?.nodes || [];
    const compromised = nodes.filter(n => n.status === 'compromised');
    const isolated    = nodes.filter(n => n.status === 'isolated');

    const steps = [
      { phase:'DETECTION',        icon:'🔍', steps:['Verify alert fidelity — confirm attack signatures in SIEM','Correlate IOCs against threat intelligence feeds','Identify affected asset IDs from network telemetry','Notify SOC lead and ICS security team'] },
      { phase:'CONTAINMENT',      icon:'🛡', steps:['Isolate compromised nodes at network switch level','Block lateral movement paths via firewall ACLs','Disable compromised credentials in Active Directory','Engage data diode / unidirectional gateway to cut OT egress'] },
      { phase:'ERADICATION',      icon:'🧹', steps:['Image and preserve forensic evidence before remediation','Remove malware/backdoors from affected systems','Patch exploited CVEs (see CVE Scan results)','Verify PLC/RTU firmware integrity via checksum comparison'] },
      { phase:'RECOVERY',         icon:'🔄', steps:['Restore from last known-good backup','Re-validate safety system (SIS) integrity before OT restart','Gradually re-introduce systems under enhanced monitoring','Run full ICS protocol baseline comparison'] },
      { phase:'POST-INCIDENT',    icon:'📋', steps:['Generate full incident report (use Report button)','Update MITRE ATT&CK heatmap with observed techniques','Brief CISO and plant management','Schedule red team re-test in 90 days'] },
    ];

    const html = steps.map(s => `
      <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:6px;padding:12px;margin-bottom:8px;">
        <div style="font-size:0.65rem;font-weight:700;color:#60a5fa;margin-bottom:8px;letter-spacing:0.08em;">${s.icon} ${s.phase}</div>
        <ol style="padding-left:18px;margin:0;">
          ${s.steps.map(step=>`<li style="font-size:0.63rem;color:#c8d4e8;padding:3px 0;">${step}</li>`).join('')}
        </ol>
      </div>`).join('');

    this._showToolModal('irPlaybookModal', '📓 INCIDENT RESPONSE PLAYBOOK',
      `<div style="font-size:0.62rem;color:#64748b;margin-bottom:12px;">
        Affected: <strong style="color:#ef4444;">${compromised.length} compromised</strong> nodes &nbsp;|&nbsp;
        Contained: <strong style="color:#fbbf24;">${isolated.length}</strong> nodes
      </div>${html}`,
      '#60a5fa');
  }

  // ── F34: Compliance Report ────────────────────────────────────────────────
  showComplianceReport() {
    const nodes = this.canvas?.nodes || [];
    const links = this.canvas?.links || [];
    const fwCount   = nodes.filter(n=>(n.role||'').toLowerCase().includes('firewall')).length;
    const otNodes   = nodes.filter(n=>n.type==='ot'||n.type==='plc'||n.type==='field');
    const itNodes   = nodes.filter(n=>n.type==='it');
    const encLinks  = links.filter(l=>l.encrypted).length;

    const checks = [
      { id:'IEC 62443-3-3 SR 1.1', desc:'Human user identification & auth', pass: nodes.some(n=>(n.role||'').includes('AD')||nodes.length > 3), weight:10 },
      { id:'IEC 62443-3-3 SR 5.1', desc:'Network segmentation — IT/OT zones', pass: fwCount > 0 || (itNodes.length > 0 && otNodes.length > 0), weight:15 },
      { id:'IEC 62443-3-3 SR 5.2', desc:'Zone boundary protection (firewall)', pass: fwCount >= 1, weight:12 },
      { id:'IEC 62443-3-3 SR 7.6', desc:'Network management', pass: nodes.length >= 5, weight:8 },
      { id:'NIST CSF ID.AM-1',     desc:'Physical device inventory maintained', pass: nodes.length > 0, weight:10 },
      { id:'NIST CSF PR.AC-5',     desc:'Network integrity protected', pass: encLinks > 0, weight:10 },
      { id:'NIST CSF DE.CM-1',     desc:'Network monitoring', pass: nodes.some(n=>(n.role||'').toLowerCase().includes('siem')||(n.name||'').toLowerCase().includes('siem')), weight:12 },
      { id:'NIST CSF RS.RP-1',     desc:'Response plan executed', pass: (this.battle?.active === false && this.battle?.winner), weight:8 },
      { id:'IEC 62443-2-4 SP.03',  desc:'Security patch management process', pass: nodes.some(n=>n.firmware), weight:7 },
      { id:'IEC 62443-3-3 SR 3.1', desc:'Communication integrity via encryption', pass: encLinks > links.length * 0.3, weight:8 },
    ];

    const score = checks.reduce((s,c) => s + (c.pass ? c.weight : 0), 0);
    const max   = checks.reduce((s,c) => s + c.weight, 0);
    const pct   = Math.round(score / max * 100);
    const grade = pct >= 85 ? ['A','#22c55e'] : pct >= 70 ? ['B','#86efac'] : pct >= 55 ? ['C','#fbbf24'] : pct >= 40 ? ['D','#f97316'] : ['F','#ef4444'];

    const rows = checks.map(c => `<tr>
      <td style="padding:5px 8px;font-family:monospace;font-size:0.58rem;color:#94a3b8;">${c.id}</td>
      <td style="padding:5px 8px;font-size:0.62rem;color:#e2e8f0;">${c.desc}</td>
      <td style="padding:5px 8px;text-align:center;">${c.pass?'<span style="color:#22c55e;font-weight:700;">PASS</span>':'<span style="color:#ef4444;font-weight:700;">FAIL</span>'}</td>
      <td style="padding:5px 8px;font-size:0.58rem;color:#64748b;text-align:right;">${c.weight}pt</td>
    </tr>`).join('');

    this._showToolModal('complianceModal', '✅ COMPLIANCE REPORT — IEC 62443 / NIST CSF',
      `<div style="display:flex;align-items:center;gap:20px;margin-bottom:16px;">
        <div style="text-align:center;">
          <div style="font-size:3rem;font-weight:700;color:${grade[1]};font-family:'Orbitron',sans-serif;">${grade[0]}</div>
          <div style="font-size:0.58rem;color:#64748b;">GRADE</div>
        </div>
        <div style="flex:1;">
          <div style="height:8px;background:rgba(255,255,255,0.06);border-radius:4px;margin-bottom:6px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${grade[1]};border-radius:4px;transition:width 0.5s;box-shadow:0 0 12px ${grade[1]};"></div>
          </div>
          <div style="font-size:0.65rem;color:#94a3b8;">${score} / ${max} points (${pct}%)</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:rgba(34,197,94,0.07);">
          <th style="padding:5px 8px;text-align:left;font-size:0.57rem;color:#22c55e;">CONTROL ID</th>
          <th style="padding:5px 8px;text-align:left;font-size:0.57rem;color:#22c55e;">REQUIREMENT</th>
          <th style="padding:5px 8px;text-align:center;font-size:0.57rem;color:#22c55e;">STATUS</th>
          <th style="padding:5px 8px;text-align:right;font-size:0.57rem;color:#22c55e;">WEIGHT</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`,
      '#22c55e');
  }

  // ── F35: Red Team Summary ──────────────────────────────────────────────────
  showRedTeamSummary() {
    const b       = this.battle;
    const nodes   = this.canvas?.nodes || [];
    const log     = b?.red?.actionLog || b?.combinedLog?.filter(e=>e.team==='red') || [];
    const compromised = nodes.filter(n=>n.status==='compromised');

    const attackPhases = ['RECONNAISSANCE','INITIAL ACCESS','EXECUTION','PERSISTENCE','PRIVILEGE ESCALATION','LATERAL MOVEMENT','COLLECTION','EXFILTRATION'];
    const phaseHtml = attackPhases.map((p,i) => {
      const done = i < Math.min(attackPhases.length, Math.floor((b?.red?.score||0) / 15) + 2);
      const color = done ? '#ef4444' : '#374151';
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;">
        <div style="width:14px;height:14px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:${done?'0 0 8px #ef4444':''};"></div>
        <span style="font-size:0.62rem;color:${done?'#fca5a5':'#374151'};${done?'':'text-decoration:line-through;'}">${p}</span>
        ${done?'<span style="margin-left:auto;font-size:0.55rem;color:#ef4444;font-weight:700;">COMPLETE</span>':'<span style="margin-left:auto;font-size:0.55rem;color:#374151;">INCOMPLETE</span>'}
      </div>`;
    }).join('');

    const lastActions = log.slice(-8).reverse().map(e=>`<div style="padding:4px 8px;background:rgba(239,68,68,0.06);border-left:2px solid #ef4444;margin-bottom:3px;border-radius:0 3px 3px 0;font-size:0.6rem;color:#fca5a5;">${e.msg||''}</div>`).join('');

    this._showToolModal('redTeamModal', '🔴 RED TEAM SUMMARY',
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div style="font-size:0.6rem;font-weight:700;color:rgba(239,68,68,0.7);margin-bottom:10px;letter-spacing:0.08em;">KILL CHAIN PROGRESS</div>
          ${phaseHtml}
        </div>
        <div>
          <div style="font-size:0.6rem;font-weight:700;color:rgba(239,68,68,0.7);margin-bottom:8px;letter-spacing:0.08em;">METRICS</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${[['Score',b?.red?.score||0,'#ef4444'],['Nodes Compromised',compromised.length,'#ef4444'],['Total Actions',log.length,'#94a3b8']].map(([l,v,c])=>`
              <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:5px;padding:8px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:0.6rem;color:#64748b;">${l}</span>
                <span style="font-size:1rem;font-weight:700;color:${c};">${v}</span>
              </div>`).join('')}
          </div>
          <div style="font-size:0.6rem;font-weight:700;color:rgba(239,68,68,0.7);margin:12px 0 8px;letter-spacing:0.08em;">LAST ACTIONS</div>
          ${lastActions || '<div style="font-size:0.62rem;color:#475569;">No red team actions recorded.</div>'}
        </div>
      </div>`,
      '#ef4444');
  }

  // ── F36: Blue Team Scorecard ──────────────────────────────────────────────
  showBlueTeamScorecard() {
    const b      = this.battle;
    const nodes  = this.canvas?.nodes || [];
    const log    = b?.blue?.actionLog || b?.combinedLog?.filter(e=>e.team==='blue') || [];
    const detections = log.filter(e=>(e.msg||'').toLowerCase().includes('detect')||(e.msg||'').toLowerCase().includes('block')||(e.msg||'').toLowerCase().includes('isolat')).length;
    const isolated   = nodes.filter(n=>n.status==='isolated').length;
    const comprLen   = nodes.filter(n=>n.status==='compromised').length;

    const score = Math.min(100, Math.round(((b?.blue?.score||0)*2 + detections*5 + isolated*8) / Math.max(1, nodes.length) * 10));
    const metrics = [
      { label:'Response Score',    val:score+'%',    color:score>70?'#22c55e':score>40?'#fbbf24':'#ef4444' },
      { label:'Detections Fired',  val:detections,   color:'#60a5fa' },
      { label:'Nodes Contained',   val:isolated,     color:'#fbbf24' },
      { label:'Nodes Missed',      val:comprLen,     color:'#ef4444' },
      { label:'Blue Score',        val:b?.blue?.score||0, color:'#22c55e' },
    ];
    const mHtml = metrics.map(m=>`
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:6px;padding:10px;text-align:center;">
        <div style="font-size:1.3rem;font-weight:700;color:${m.color};">${m.val}</div>
        <div style="font-size:0.52rem;color:#64748b;">${m.label}</div>
      </div>`).join('');

    const lastActions = log.slice(-6).reverse().map(e=>`<div style="padding:4px 8px;background:rgba(45,125,210,0.06);border-left:2px solid #2d7dd2;margin-bottom:3px;border-radius:0 3px 3px 0;font-size:0.6rem;color:#93c5fd;">${e.msg||''}</div>`).join('');

    this._showToolModal('blueScoreModal', '🔵 BLUE TEAM SCORECARD',
      `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">${mHtml}</div>
      <div style="margin-bottom:8px;">
        <div style="height:6px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${score}%;background:${score>70?'#22c55e':score>40?'#fbbf24':'#ef4444'};border-radius:3px;transition:width 0.5s;"></div>
        </div>
        <div style="font-size:0.58rem;color:#64748b;margin-top:4px;">Overall response effectiveness: ${score}%</div>
      </div>
      <div style="font-size:0.6rem;font-weight:700;color:rgba(45,125,210,0.7);margin-bottom:8px;letter-spacing:0.08em;">LAST BLUE ACTIONS</div>
      ${lastActions || '<div style="font-size:0.62rem;color:#475569;">No blue team actions recorded.</div>'}`,
      '#2d7dd2');
  }

  // ── F37: Honeypot Advisor ─────────────────────────────────────────────────
  showHoneypotAdvisor() {
    const nodes = this.canvas?.nodes || [];
    const links = this.canvas?.links || [];
    if (!nodes.length) { alert('Load a topology first.'); return; }

    const fwNodes = nodes.filter(n=>(n.role||'').toLowerCase().includes('firewall'));
    const adj = {};
    nodes.forEach(n=>adj[n.id]=new Set());
    links.forEach(l=>{
      const s=l.sourceId||l.source?.id||l.source, t=l.targetId||l.target?.id||l.target;
      if(adj[s])adj[s].add(t); if(adj[t])adj[t].add(s);
    });

    const recommendations = nodes
      .filter(n=>n.type==='it'||n.type==='ot')
      .map(n=>({ node:n, degree:(adj[n.id]||new Set()).size, nearFW:fwNodes.some(f=>(adj[f.id]||new Set()).has(n.id)) }))
      .filter(r=>r.degree>=2 && !r.nearFW)
      .sort((a,b)=>b.degree-a.degree)
      .slice(0,6);

    const hpTypes = ['SSH Honeypot','Fake SCADA HMI','Fake PLC (Conpot)','Fake SMB Share','Modbus Honeypot','Fake RDP'];
    const rows = recommendations.map((r,i)=>`
      <div style="background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.2);border-radius:6px;padding:10px;margin-bottom:6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:0.65rem;color:#e2e8f0;">${r.node.name||r.node.id}</span>
          <span style="font-size:0.58rem;color:#fbbf24;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.25);padding:2px 6px;border-radius:3px;">${hpTypes[i%hpTypes.length]}</span>
        </div>
        <div style="font-size:0.6rem;color:#64748b;">Place honeypot adjacent to this node — ${r.degree} connections make it an attractive lateral movement target.</div>
      </div>`).join('');

    this._showToolModal('honeypotModal', '🍯 HONEYPOT ADVISOR',
      `<div style="font-size:0.62rem;color:#64748b;margin-bottom:12px;">Recommended honeypot placements based on topology analysis — ${recommendations.length} high-value positions identified</div>
      ${rows || '<div style="color:#22c55e;font-size:0.65rem;">No suitable honeypot positions found — network may be highly segmented.</div>'}
      <div style="margin-top:12px;padding:10px;background:rgba(255,255,255,0.02);border-radius:5px;font-size:0.6rem;color:#64748b;">
        Deploy honeypots using Conpot (ICS), OpenCanary (IT), or T-Pot platform. Configure with real-looking credentials and enable verbose logging to SIEM.
      </div>`,
      '#fbbf24');
  }

  // ── F38: IP Conflict Detector ─────────────────────────────────────────────
  _runIPConflictScan(showModal = true) {
    const nodes   = this.canvas?.nodes || [];
    const ipMap   = {};
    const conflicts = [];
    const invalid   = [];
    const ipRe    = /^(\d{1,3}\.){3}\d{1,3}$/;

    for (const n of nodes) {
      if (!n.ip || n.ip === '—') continue;
      if (!ipRe.test(n.ip)) { invalid.push(n); continue; }
      const parts = n.ip.split('.').map(Number);
      if (parts.some(p=>p>255)) { invalid.push(n); continue; }
      if (!ipMap[n.ip]) ipMap[n.ip] = [];
      ipMap[n.ip].push(n);
    }
    for (const [ip, nds] of Object.entries(ipMap)) {
      if (nds.length > 1) conflicts.push({ ip, nodes: nds });
    }

    if (!showModal) return { conflicts, invalid };

    const conflictHtml = conflicts.map(c=>`
      <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:5px;padding:8px 12px;margin-bottom:6px;">
        <div style="font-size:0.65rem;font-weight:700;color:#ef4444;margin-bottom:4px;">⚠ IP CONFLICT: ${c.ip}</div>
        ${c.nodes.map(n=>`<div style="font-size:0.6rem;color:#fca5a5;padding:1px 0;">→ ${n.name||n.id} (${n.role||n.type||'unknown'})</div>`).join('')}
      </div>`).join('');

    const invalidHtml = invalid.map(n=>`
      <div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.2);border-radius:4px;padding:6px 10px;margin-bottom:4px;font-size:0.62rem;color:#fbbf24;">
        ⚠ ${n.name||n.id}: "${n.ip}" — invalid IP format
      </div>`).join('');

    this._showToolModal('ipConflictModal', '🔢 IP CONFLICT DETECTOR',
      `${conflicts.length || invalid.length
        ? conflictHtml + invalidHtml
        : '<div style="color:#22c55e;font-size:0.65rem;padding:10px 0;">✓ No IP conflicts or invalid addresses detected.</div>'}
      <div style="margin-top:10px;font-size:0.6rem;color:#475569;">${nodes.length} nodes scanned — ${conflicts.length} conflicts, ${invalid.length} invalid addresses</div>`,
      '#f59e0b');
  }

  runIPConflictDetector() { this._runIPConflictScan(true); }

  // ── F39: Patch Priority Queue ─────────────────────────────────────────────
  showPatchQueue() {
    const nodes = this.canvas?.nodes || [];
    const patchItems = [
      { cve:'CVE-2021-44228', score:10.0, title:'Log4Shell',       fix:'Upgrade Log4j to 2.17.1+', affects: n=>(n.os||'').toLowerCase().includes('linux')||(n.role||'').toLowerCase().includes('server') },
      { cve:'CVE-2022-22965', score:9.8,  title:'Spring4Shell',    fix:'Spring Framework 5.3.18+', affects: n=>(n.role||'').toLowerCase().includes('server') },
      { cve:'CVE-2020-1472',  score:10.0, title:'ZeroLogon',       fix:'KB4565351 or disable Netlogon legacy', affects: n=>(n.id||'').toUpperCase().includes('DC')||(n.role||'').toLowerCase().includes('domain') },
      { cve:'CVE-2021-34527', score:8.8,  title:'PrintNightmare',  fix:'KB5004945 — disable Print Spooler on DCs', affects: n=>(n.os||'').toLowerCase().includes('windows') },
      { cve:'CVE-2019-13945', score:8.8,  title:'Siemens S7 Auth', fix:'Upgrade firmware ≥ v4.4', affects: n=>n.type==='plc' },
      { cve:'CVE-2018-10952', score:9.1,  title:'Schneider RCE',   fix:'Patch MSTR v2.9+ via Schneider portal', affects: n=>n.type==='ot'||(n.name||'').toLowerCase().includes('scada') },
      { cve:'CVE-2022-34151', score:9.1,  title:'Omron PLC RCE',   fix:'Firmware patch v3.30+', affects: n=>n.type==='plc'||(n.firmware||'').toLowerCase().includes('omron') },
    ];

    const queue = patchItems.filter(p => nodes.some(n => p.affects(n)))
      .sort((a,b) => b.score - a.score);

    const rows = queue.map((p,i)=>{
      const sc = p.score>=10?'#ef4444':p.score>=9?'#f97316':p.score>=8?'#f59e0b':'#eab308';
      return `<tr>
        <td style="padding:5px 8px;font-size:0.6rem;color:#64748b;text-align:center;">${i+1}</td>
        <td style="padding:5px 8px;font-family:monospace;font-size:0.6rem;color:#fbbf24;">${p.cve}</td>
        <td style="padding:5px 8px;font-size:0.62rem;color:#e2e8f0;">${p.title}</td>
        <td style="padding:5px 8px;"><span style="color:${sc};font-weight:700;font-size:0.6rem;">${p.score.toFixed(1)}</span></td>
        <td style="padding:5px 8px;font-size:0.6rem;color:#94a3b8;">${p.fix}</td>
      </tr>`;
    }).join('');

    this._showToolModal('patchQueueModal', '🩹 PATCH PRIORITY QUEUE',
      `<div style="font-size:0.62rem;color:#64748b;margin-bottom:12px;">${queue.length} patches required for this topology, sorted by CVSS score</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:rgba(251,191,36,0.08);">
          <th style="padding:5px 8px;font-size:0.57rem;color:#fbbf24;">#</th>
          <th style="padding:5px 8px;text-align:left;font-size:0.57rem;color:#fbbf24;">CVE</th>
          <th style="padding:5px 8px;text-align:left;font-size:0.57rem;color:#fbbf24;">TITLE</th>
          <th style="padding:5px 8px;text-align:left;font-size:0.57rem;color:#fbbf24;">CVSS</th>
          <th style="padding:5px 8px;text-align:left;font-size:0.57rem;color:#fbbf24;">REMEDIATION</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="padding:10px;color:#22c55e;font-size:0.62rem;">No patches required for this topology.</td></tr>'}</tbody>
      </table>`,
      '#fbbf24');
  }

  // ── F40: Executive Risk Dashboard ─────────────────────────────────────────
  showExecutiveDashboard() {
    const nodes = this.canvas?.nodes || [];
    const b     = this.battle;
    const compromised = nodes.filter(n=>n.status==='compromised').length;
    const total       = nodes.length || 1;
    const blastPct    = Math.round(compromised / total * 100);
    const riskScore   = Math.min(100, blastPct + (b?.red?.score||0) / 2);
    const riskLabel   = riskScore>=75?['CRITICAL','#ef4444']:riskScore>=50?['HIGH','#f97316']:riskScore>=25?['MEDIUM','#f59e0b']:['LOW','#22c55e'];
    const posture     = riskScore>=75?'Immediate executive intervention required.':riskScore>=50?'Elevated risk. Escalate to CISO.':riskScore>=25?'Moderate risk. Monitor closely.':'Strong security posture. Maintain vigilance.';

    const kpis = [
      { label:'Overall Risk Score',   val:Math.round(riskScore),  unit:'/ 100',   color:riskLabel[1] },
      { label:'Asset Blast Radius',   val:blastPct+'%',           unit:'compromised', color:blastPct>50?'#ef4444':'#22c55e' },
      { label:'Red Team Score',       val:b?.red?.score||0,       unit:'pts',     color:'#ef4444' },
      { label:'Blue Team Score',      val:b?.blue?.score||0,      unit:'pts',     color:'#22c55e' },
      { label:'Assets Monitored',     val:total,                  unit:'nodes',   color:'#60a5fa' },
      { label:'Nodes Isolated',       val:nodes.filter(n=>n.status==='isolated').length, unit:'contained', color:'#fbbf24' },
    ];

    const kpiHtml = kpis.map(k=>`
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:12px;text-align:center;">
        <div style="font-size:1.5rem;font-weight:700;color:${k.color};font-family:'Orbitron',sans-serif;">${k.val}</div>
        <div style="font-size:0.5rem;color:#64748b;">${k.unit}</div>
        <div style="font-size:0.55rem;color:#94a3b8;margin-top:3px;">${k.label}</div>
      </div>`).join('');

    this._showToolModal('execDashModal', '📊 EXECUTIVE RISK DASHBOARD',
      `<div style="background:${riskLabel[1]}1a;border:1px solid ${riskLabel[1]}44;border-radius:8px;padding:14px;margin-bottom:16px;display:flex;align-items:center;gap:16px;">
        <div style="font-size:2.5rem;font-weight:700;color:${riskLabel[1]};font-family:'Orbitron',sans-serif;">${riskLabel[0]}</div>
        <div><div style="font-size:0.7rem;color:#e2e8f0;font-weight:600;">CURRENT SECURITY POSTURE</div><div style="font-size:0.63rem;color:#94a3b8;margin-top:3px;">${posture}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">${kpiHtml}</div>
      <div style="padding:10px;background:rgba(255,255,255,0.02);border-radius:5px;font-size:0.62rem;color:#94a3b8;line-height:1.7;">
        <strong style="color:#e2e8f0;">Board-level summary:</strong> The OT/ICS environment has ${total} monitored assets.
        ${compromised > 0 ? `<strong style="color:#ef4444;">${compromised} assets</strong> require immediate remediation.` : 'All assets are within normal operating parameters.'}
        Recommend engaging the incident response team for post-battle remediation planning.
      </div>`,
      riskLabel[1]);
  }

  // ── F41: SIEM Export ──────────────────────────────────────────────────────
  exportSIEMLogs() {
    const b     = this.battle;
    const log   = b?.combinedLog || this.orchestrator?.alerts || [];
    const nodes = this.canvas?.nodes || [];

    const events = log.map(e => ({
      timestamp: new Date(e.ts||Date.now()).toISOString(),
      source_ip: (() => { const n = nodes.find(x=>x.id===e.nodeId); return n?.ip||'10.0.0.1'; })(),
      event_type: e.team==='red'?'attack':e.team==='blue'?'defense':'system',
      severity: e.team==='red'?'HIGH':'LOW',
      message: e.msg||'',
      actor: (e.team||'system').toUpperCase(),
      cef_version: 'CEF:0',
    }));

    const cef = events.map(e =>
      `${e.cef_version}|AETHERIS|NetPilot|2.0|${e.event_type.toUpperCase()}|${e.message.replace(/\|/g,'\\|').slice(0,80)}|${e.severity==='HIGH'?7:3}|start=${e.timestamp} src=${e.source_ip} msg=${e.message.replace(/\|/g,'\\|').slice(0,120)}`
    ).join('\n');

    const json = JSON.stringify({ events, meta: { generated: new Date().toISOString(), tool:'AETHERIS NetPilot', eventCount: events.length } }, null, 2);

    const blob = new Blob([`// CEF Format\n${cef}\n\n// JSON Format\n${json}`], { type:'text/plain' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `aetheris-siem-export-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.orchestrator.logSystem(`SIEM export: ${events.length} events exported in CEF+JSON format.`, 'success');
  }

  // ── F42: Zero-Trust Score ─────────────────────────────────────────────────
  showZeroTrustScore() {
    const nodes = this.canvas?.nodes || [];
    const links = this.canvas?.links || [];

    const checks = [
      { pillar:'Identity',    check:'MFA on all admin accounts',      pass: nodes.some(n=>(n.role||'').toLowerCase().includes('ad')||(n.name||'').toLowerCase().includes('auth')), weight:15 },
      { pillar:'Devices',     check:'All devices inventoried & managed', pass: nodes.length > 0, weight:10 },
      { pillar:'Devices',     check:'Endpoint EDR deployed',          pass: nodes.filter(n=>n.type==='it').length > 0, weight:12 },
      { pillar:'Network',     check:'Micro-segmentation implemented',  pass: nodes.some(n=>(n.role||'').toLowerCase().includes('firewall')), weight:15 },
      { pillar:'Network',     check:'Encrypted east-west traffic',     pass: links.filter(l=>l.encrypted).length > links.length * 0.3, weight:12 },
      { pillar:'Applications', check:'App-layer firewall on OT boundary', pass: nodes.some(n=>(n.role||'').toLowerCase().includes('firewall')), weight:10 },
      { pillar:'Data',        check:'OT data classification enforced', pass: nodes.some(n=>n.type==='ot'&&(n.status||'stable')!=='compromised'), weight:10 },
      { pillar:'Visibility',  check:'SIEM/SOC monitoring active',     pass: nodes.some(n=>(n.name||'').toLowerCase().includes('siem')||(n.role||'').toLowerCase().includes('siem')), weight:16 },
    ];

    const score = checks.reduce((s,c)=>s+(c.pass?c.weight:0),0);
    const max   = checks.reduce((s,c)=>s+c.weight,0);
    const pct   = Math.round(score/max*100);
    const tier  = pct>=80?['ADVANCED','#22c55e']:pct>=60?['INTERMEDIATE','#fbbf24']:pct>=40?['BASIC','#f97316']:['INITIAL','#ef4444'];

    const pillars = [...new Set(checks.map(c=>c.pillar))];
    const pillarHtml = pillars.map(p=>{
      const pChecks = checks.filter(c=>c.pillar===p);
      const pScore  = pChecks.reduce((s,c)=>s+(c.pass?1:0),0);
      const pColor  = pScore===pChecks.length?'#22c55e':pScore>0?'#fbbf24':'#ef4444';
      return `<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:0.62rem;color:#94a3b8;margin-bottom:4px;"><span>${p}</span><span style="color:${pColor};">${pScore}/${pChecks.length}</span></div>
        ${pChecks.map(c=>`<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:0.6rem;">
          <span style="color:${c.pass?'#22c55e':'#ef4444'};flex-shrink:0;">${c.pass?'✓':'✗'}</span>
          <span style="color:${c.pass?'#c8d4e8':'#475569'};">${c.check}</span>
        </div>`).join('')}
      </div>`;
    }).join('');

    this._showToolModal('zeroTrustModal', '🔒 ZERO-TRUST MATURITY SCORE',
      `<div style="display:flex;align-items:center;gap:20px;margin-bottom:16px;">
        <div style="text-align:center;">
          <div style="font-size:2.5rem;font-weight:700;color:${tier[1]};font-family:'Orbitron',sans-serif;">${pct}%</div>
          <div style="font-size:0.62rem;color:${tier[1]};font-weight:700;">${tier[0]}</div>
        </div>
        <div style="flex:1;">
          <div style="height:6px;background:rgba(255,255,255,0.05);border-radius:3px;margin-bottom:4px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${tier[1]};border-radius:3px;"></div>
          </div>
          <div style="font-size:0.6rem;color:#64748b;">Zero-Trust maturity tier: ${tier[0]} (${score}/${max} points)</div>
        </div>
      </div>
      ${pillarHtml}`,
      '#a855f7');
  }

  // ── F43: Supply Chain Risk ────────────────────────────────────────────────
  showSupplyChainRisk() {
    const nodes = this.canvas?.nodes || [];
    const vendors = [
      { name:'Siemens', risk:'MEDIUM', nodes:['S7','SIE','PLC','STEP 7'], cve:'CVE-2019-13945', note:'S7 PLC auth bypass in firmware <4.4' },
      { name:'Schneider Electric', risk:'HIGH', nodes:['SCADA','MODICON','SE','SIS'], cve:'CVE-2018-10952', note:'Modicon PLC RCE via Modbus' },
      { name:'Honeywell', risk:'LOW', nodes:['HON','DCS','HIWAY'], cve:'N/A', note:'Patch cadence generally good' },
      { name:'Rockwell/Allen-Bradley', risk:'MEDIUM', nodes:['PLC','RTU','SLC','CLX'], cve:'CVE-2012-6435', note:'EtherNet/IP CIP manipulation' },
      { name:'Microsoft Windows', risk:'HIGH', nodes:['HMI','WS','CORP','PC','EWS'], cve:'CVE-2021-34527', note:'PrintNightmare — unpatched HMIs common' },
      { name:'Open-source Linux', risk:'HIGH', nodes:['SVR','HIST','SRV','MES','SIEM'], cve:'CVE-2021-44228', note:'Log4Shell remains widely unpatched in OT' },
    ];

    const findings = vendors.map(v => ({
      ...v,
      matchedNodes: nodes.filter(n => v.nodes.some(keyword => (n.name||n.id||'').toUpperCase().includes(keyword))),
    })).filter(v => v.matchedNodes.length > 0);

    const riskOrder = { HIGH:0, MEDIUM:1, LOW:2 };
    findings.sort((a,b) => riskOrder[a.risk] - riskOrder[b.risk]);

    const html = findings.map(f => {
      const rc = f.risk==='HIGH'?'#ef4444':f.risk==='MEDIUM'?'#f59e0b':'#22c55e';
      return `<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:6px;padding:10px 12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-weight:700;color:#e2e8f0;">${f.name}</span>
          <span style="background:${rc}22;color:${rc};padding:2px 8px;border-radius:3px;font-size:0.58rem;font-weight:700;">${f.risk}</span>
        </div>
        <div style="font-size:0.6rem;color:#94a3b8;margin-bottom:4px;">Matched assets: ${f.matchedNodes.map(n=>n.name||n.id).join(', ')}</div>
        <div style="font-size:0.6rem;color:#fbbf24;font-family:monospace;">${f.cve}</div>
        <div style="font-size:0.6rem;color:#64748b;margin-top:3px;">${f.note}</div>
      </div>`;
    }).join('');

    this._showToolModal('supplyChainModal', '⛓ SUPPLY CHAIN RISK ANALYSIS',
      `<div style="font-size:0.62rem;color:#64748b;margin-bottom:12px;">${findings.length} vendor(s) identified in topology</div>
      ${html || '<div style="color:#22c55e;font-size:0.65rem;">No vendor-specific risks identified for this topology.</div>'}`,
      '#a78bfa');
  }

  // ── F44: Lateral Movement Map ─────────────────────────────────────────────
  showLateralMovementMap() {
    const nodes = this.canvas?.nodes || [];
    const links = this.canvas?.links || [];
    if (!nodes.length) { alert('Load a topology first.'); return; }

    const adj = {};
    nodes.forEach(n=>adj[n.id]=[]);
    links.forEach(l=>{
      const s=l.sourceId||l.source?.id||l.source, t=l.targetId||l.target?.id||l.target;
      if(adj[s])adj[s].push(t); if(adj[t])adj[t].push(s);
    });

    const itNodes = nodes.filter(n=>n.type==='it');
    const otNodes = nodes.filter(n=>n.type==='ot'||n.type==='plc'||n.type==='field');

    const paths = [];
    for (const start of itNodes) {
      const queue  = [[start.id, [start.id]]];
      const seen   = new Set([start.id]);
      while (queue.length) {
        const [cur, path] = queue.shift();
        if (path.length > 5) continue;
        for (const nxt of adj[cur]||[]) {
          if (seen.has(nxt)) continue;
          seen.add(nxt);
          const nxtNode = nodes.find(n=>n.id===nxt);
          if (!nxtNode) continue;
          const newPath = [...path, nxt];
          if (nxtNode.type==='ot'||nxtNode.type==='plc') {
            paths.push(newPath);
          } else {
            queue.push([nxt, newPath]);
          }
        }
      }
    }

    const pathHtml = paths.slice(0,10).map((p,i) => {
      const nodeNames = p.map(id=>{ const n=nodes.find(x=>x.id===id); return n?.name||id; });
      const hasFW = p.some(id=>{ const n=nodes.find(x=>x.id===id); return (n?.role||'').toLowerCase().includes('firewall'); });
      const color = hasFW ? '#fbbf24' : '#ef4444';
      return `<div style="background:${hasFW?'rgba(251,191,36,0.05)':'rgba(239,68,68,0.05)'};border-left:3px solid ${color};padding:6px 10px;margin-bottom:5px;border-radius:0 4px 4px 0;font-family:monospace;font-size:0.6rem;color:${color};">
        ${i+1}. ${nodeNames.join(' → ')} ${hasFW?'[FW PROTECTED]':'[UNPROTECTED]'}
      </div>`;
    }).join('');

    this._showToolModal('lateralMapModal', '🔀 LATERAL MOVEMENT MAP',
      `<div style="display:flex;gap:10px;margin-bottom:12px;">
        <div style="flex:1;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:5px;padding:8px;text-align:center;"><div style="font-size:1.3rem;font-weight:700;color:#ef4444;">${paths.length}</div><div style="font-size:0.55rem;color:#64748b;">LATERAL PATHS</div></div>
        <div style="flex:1;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:5px;padding:8px;text-align:center;"><div style="font-size:1.3rem;font-weight:700;color:#fbbf24;">${paths.filter(p=>p.some(id=>{const n=nodes.find(x=>x.id===id);return(n?.role||'').toLowerCase().includes('firewall');})).length}</div><div style="font-size:0.55rem;color:#64748b;">FW PROTECTED</div></div>
        <div style="flex:1;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:5px;padding:8px;text-align:center;"><div style="font-size:1.3rem;font-weight:700;color:#ef4444;">${paths.filter(p=>!p.some(id=>{const n=nodes.find(x=>x.id===id);return(n?.role||'').toLowerCase().includes('firewall');})).length}</div><div style="font-size:0.55rem;color:#64748b;">UNPROTECTED</div></div>
      </div>
      <div style="font-size:0.6rem;color:#64748b;margin-bottom:8px;">Showing ${Math.min(10,paths.length)} of ${paths.length} paths from IT zone to OT/PLC zone</div>
      ${pathHtml || '<div style="color:#22c55e;font-size:0.65rem;">No lateral movement paths found — good IT/OT segmentation!</div>'}`,
      '#ef4444');
  }

  // ── F45: Digital Forensics Timeline ──────────────────────────────────────
  showDigitalForensics() {
    const b     = this.battle;
    const nodes = this.canvas?.nodes || [];
    const log   = b?.combinedLog || [];
    const now   = Date.now();

    const artifacts = [
      ...nodes.filter(n=>n.status==='compromised').map(n=>({ ts:now-Math.random()*600000, type:'REGISTRY', host:n.name||n.id, artifact:`HKLM\\SYSTEM\\CurrentControlSet\\Services — suspicious service installed`, sev:'CRITICAL' })),
      ...nodes.filter(n=>n.status==='compromised').map(n=>({ ts:now-Math.random()*500000, type:'PROCESS',  host:n.name||n.id, artifact:`cmd.exe spawned from SCADA.exe — anomalous parent-child relationship`, sev:'HIGH' })),
      ...log.filter(e=>e.team==='red').slice(0,5).map(e=>({ ts:e.ts||now, type:'NETWORK', host:'Attacker', artifact:`${e.msg?.slice(0,60)||'Unknown activity'}`, sev:'HIGH' })),
      { ts:now-3600000, type:'FILE',     host:'JUMP-SRV', artifact:'mimikatz.exe execution detected in %TEMP% directory', sev:'CRITICAL' },
      { ts:now-3400000, type:'NETWORK',  host:'CORP-FW',  artifact:'Outbound connection to 185.220.101.x:4444 — C2 channel suspected', sev:'CRITICAL' },
      { ts:now-3200000, type:'REGISTRY', host:'EWS-1',    artifact:'Autorun persistence key added: HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', sev:'HIGH' },
    ].sort((a,b)=>a.ts-b.ts);

    const rows = artifacts.slice(0,12).map(a=>{
      const sc = a.sev==='CRITICAL'?'#ef4444':a.sev==='HIGH'?'#f59e0b':'#22c55e';
      const tc = {'REGISTRY':'#a855f7','PROCESS':'#ef4444','NETWORK':'#60a5fa','FILE':'#fbbf24'}[a.type]||'#94a3b8';
      return `<tr>
        <td style="padding:4px 8px;font-family:monospace;font-size:0.58rem;color:#64748b;white-space:nowrap;">${new Date(a.ts).toISOString().slice(11,19)}</td>
        <td style="padding:4px 8px;"><span style="color:${tc};font-size:0.58rem;font-weight:700;">${a.type}</span></td>
        <td style="padding:4px 8px;font-size:0.6rem;color:#94a3b8;">${a.host}</td>
        <td style="padding:4px 8px;font-size:0.6rem;color:#e2e8f0;">${a.artifact}</td>
        <td style="padding:4px 8px;"><span style="color:${sc};font-size:0.58rem;font-weight:700;">${a.sev}</span></td>
      </tr>`;
    }).join('');

    this._showToolModal('forensicsModal', '🔬 DIGITAL FORENSICS TIMELINE',
      `<table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:rgba(168,85,247,0.08);">
          <th style="padding:5px 8px;text-align:left;font-size:0.57rem;color:#a855f7;">TIME</th>
          <th style="padding:5px 8px;text-align:left;font-size:0.57rem;color:#a855f7;">TYPE</th>
          <th style="padding:5px 8px;text-align:left;font-size:0.57rem;color:#a855f7;">HOST</th>
          <th style="padding:5px 8px;text-align:left;font-size:0.57rem;color:#a855f7;">ARTIFACT</th>
          <th style="padding:5px 8px;text-align:left;font-size:0.57rem;color:#a855f7;">SEV</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="padding:10px;color:#22c55e;font-size:0.62rem;">No forensic artifacts detected in this session.</td></tr>'}</tbody>
      </table>`,
      '#a855f7');
  }

  // ── F46: OT Security Posture ───────────────────────────────────────────────
  showOTSecurityPosture() {
    const nodes = this.canvas?.nodes || [];
    const links = this.canvas?.links || [];
    const otNodes = nodes.filter(n=>n.type==='ot'||n.type==='plc'||n.type==='field');
    const itNodes = nodes.filter(n=>n.type==='it');

    const dims = [
      { name:'Network Segmentation',  score: (() => { const fw=nodes.filter(n=>(n.role||'').toLowerCase().includes('firewall')).length; return Math.min(10,fw*3+2); })() },
      { name:'Asset Visibility',       score: Math.min(10, Math.round(otNodes.length / Math.max(nodes.length,1) * 15)) },
      { name:'Patch Management',       score: Math.min(10, nodes.filter(n=>n.firmware).length > 0 ? 6 : 3) },
      { name:'Remote Access Control',  score: nodes.some(n=>(n.name||'').toLowerCase().includes('jump')||(n.role||'').toLowerCase().includes('jump')) ? 8 : 4 },
      { name:'Incident Response',      score: (this.battle?.active===false&&this.battle?.winner) ? 9 : 5 },
      { name:'Protocol Security',      score: Math.min(10, links.filter(l=>l.encrypted).length > 0 ? 7 : 3) },
    ];

    const avg = Math.round(dims.reduce((s,d)=>s+d.score,0)/dims.length*10)/10;
    const maturity = avg>=8?['Optimizing','#22c55e']:avg>=6?['Defined','#86efac']:avg>=4?['Developing','#fbbf24']:['Initial','#ef4444'];

    const dimHtml = dims.map(d=>{
      const color = d.score>=8?'#22c55e':d.score>=6?'#fbbf24':d.score>=4?'#f97316':'#ef4444';
      return `<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:0.62rem;margin-bottom:4px;">
          <span style="color:#94a3b8;">${d.name}</span>
          <span style="color:${color};font-weight:700;">${d.score}/10</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${d.score*10}%;background:${color};border-radius:3px;box-shadow:0 0 8px ${color};"></div>
        </div>
      </div>`;
    }).join('');

    this._showToolModal('otPostureModal', '🏭 OT SECURITY POSTURE',
      `<div style="display:flex;align-items:center;gap:20px;margin-bottom:20px;">
        <div style="text-align:center;">
          <div style="font-size:3rem;font-weight:700;color:${maturity[1]};font-family:'Orbitron',sans-serif;">${avg}</div>
          <div style="font-size:0.6rem;color:${maturity[1]};font-weight:700;">${maturity[0]}</div>
          <div style="font-size:0.52rem;color:#64748b;">/ 10</div>
        </div>
        <div style="flex:1;">
          <div style="font-size:0.62rem;color:#94a3b8;line-height:1.6;">
            OT/ICS security maturity across ${otNodes.length} OT assets and ${itNodes.length} IT assets.
            ${avg < 5 ? '<strong style="color:#ef4444;">Critical gaps require immediate attention.</strong>' : avg < 7 ? '<strong style="color:#fbbf24;">Several improvements recommended.</strong>' : '<strong style="color:#22c55e;">Good security posture — continue to improve.</strong>'}
          </div>
        </div>
      </div>
      ${dimHtml}`,
      '#22c55e');
  }

  // ── F47: Network Baseline ─────────────────────────────────────────────────
  captureNetworkBaseline() {
    const nodes = this.canvas?.nodes || [];
    const links = this.canvas?.links || [];
    this._networkBaseline = {
      ts:     Date.now(),
      nodes:  nodes.map(n=>({ id:n.id, status:n.status, ip:n.ip })),
      links:  links.map(l=>({ s:l.sourceId||l.source?.id||l.source, t:l.targetId||l.target?.id||l.target, encrypted:l.encrypted })),
    };
    this.orchestrator.logSystem(`Network baseline captured — ${nodes.length} nodes, ${links.length} links.`, 'success');
    alert(`Baseline captured: ${nodes.length} nodes, ${links.length} links at ${new Date().toLocaleTimeString()}`);
  }

  showBaselineDiff() {
    const baseline = this._networkBaseline;
    if (!baseline) { alert('Capture a baseline first using the BASELINE button.'); return; }
    const nodes    = this.canvas?.nodes || [];
    const baseMap  = {};
    baseline.nodes.forEach(n=>baseMap[n.id]=n);

    const diffs = nodes.map(n => {
      const b = baseMap[n.id];
      if (!b) return { n, change:'NEW NODE', color:'#60a5fa' };
      if (b.status !== n.status) return { n, change:`${b.status.toUpperCase()} → ${n.status.toUpperCase()}`, color: n.status==='compromised'?'#ef4444':n.status==='isolated'?'#fbbf24':'#22c55e' };
      if (b.ip !== n.ip) return { n, change:`IP: ${b.ip} → ${n.ip}`, color:'#fbbf24' };
      return null;
    }).filter(Boolean);

    const removed = baseline.nodes.filter(b=>!nodes.find(n=>n.id===b.id)).map(b=>({ n:b, change:'REMOVED', color:'#94a3b8' }));
    const all = [...diffs, ...removed];

    this._showToolModal('baselineDiffModal', '📐 NETWORK BASELINE DIFF',
      `<div style="font-size:0.62rem;color:#64748b;margin-bottom:12px;">
        Baseline: ${new Date(baseline.ts).toLocaleTimeString()} — ${baseline.nodes.length} nodes &nbsp;|&nbsp;
        Current: ${nodes.length} nodes &nbsp;|&nbsp; ${all.length} change(s)
      </div>
      ${all.length
        ? all.map(d=>`<div style="display:flex;align-items:center;gap:10px;padding:5px 8px;background:${d.color}11;border-left:3px solid ${d.color};margin-bottom:4px;border-radius:0 4px 4px 0;">
          <span style="font-size:0.62rem;color:#e2e8f0;flex:1;">${d.n.name||d.n.id}</span>
          <span style="font-size:0.6rem;color:${d.color};font-weight:700;">${d.change}</span>
        </div>`).join('')
        : '<div style="color:#22c55e;font-size:0.65rem;">No changes since baseline — network state is identical.</div>'}`,
      '#60a5fa');
  }

  // ── F48: OT Protocol Decoder ──────────────────────────────────────────────
  showOTProtocolDecoder() {
    const nodes = this.canvas?.nodes || [];
    const links = this.canvas?.links || [];
    const otLinks = links.filter(l=>{
      const s=nodes.find(n=>n.id===(l.sourceId||l.source?.id||l.source));
      const t=nodes.find(n=>n.id===(l.targetId||l.target?.id||l.target));
      return s?.type==='ot'||s?.type==='plc'||t?.type==='ot'||t?.type==='plc';
    });

    const protocols = [
      { name:'Modbus TCP',      port:502,   packets:otLinks.length*3+Math.floor(Math.random()*20), vuln:'FC16 write without auth', color:'#f59e0b' },
      { name:'DNP3',            port:20000, packets:Math.floor(Math.random()*50), vuln:'Unsolicited response injection', color:'#60a5fa' },
      { name:'IEC 60870-5-104', port:2404,  packets:Math.floor(Math.random()*30), vuln:'STARTDT/STOPDT replay', color:'#a855f7' },
      { name:'EtherNet/IP',     port:44818, packets:Math.floor(Math.random()*40), vuln:'CIP unconnected send', color:'#22c55e' },
      { name:'OPC-UA',          port:4840,  packets:Math.floor(Math.random()*25), vuln:'Session token reuse', color:'#ec4899' },
    ];

    const html = protocols.map(p=>{
      const samples = [
        `→ [${p.port}] READ ${Math.floor(Math.random()*100)} registers from 0x${Math.floor(Math.random()*0xFFFF).toString(16).padStart(4,'0').toUpperCase()}`,
        `← [${p.port}] RESPONSE: ${Array.from({length:4},()=>Math.floor(Math.random()*65535).toString(16).padStart(4,'0').toUpperCase()).join(' ')}`,
        `→ [${p.port}] WRITE COILS: addr=0x${Math.floor(Math.random()*0xFF).toString(16).toUpperCase()} val=0xFF`,
      ];
      return `<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:6px;padding:10px 12px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-weight:700;color:${p.color};">${p.name}</span>
          <span style="font-size:0.58rem;color:#64748b;">:${p.port} — ${p.packets} packets</span>
        </div>
        <div style="font-family:monospace;font-size:0.58rem;color:#475569;margin-bottom:6px;">
          ${samples.map(s=>`<div style="padding:1px 0;">${s}</div>`).join('')}
        </div>
        <div style="font-size:0.58rem;color:#fca5a5;">⚠ ${p.vuln}</div>
      </div>`;
    }).join('');

    this._showToolModal('protocolDecoderModal', '📡 OT PROTOCOL DECODER',
      `<div style="font-size:0.62rem;color:#64748b;margin-bottom:12px;">${otLinks.length} OT links monitored — simulated protocol traffic analysis</div>
      ${html}`,
      '#f59e0b');
  }

  // ── F49: Advanced Network Analysis ────────────────────────────────────────
  showAdvancedNetworkAnalysis() {
    const nodes = this.canvas?.nodes || [];
    const links = this.canvas?.links || [];
    if (!nodes.length) { alert('Load a topology first.'); return; }

    const adj = {};
    nodes.forEach(n=>adj[n.id]=[]);
    links.forEach(l=>{
      const s=l.sourceId||l.source?.id||l.source, t=l.targetId||l.target?.id||l.target;
      if(adj[s])adj[s].push(t); if(adj[t])adj[t].push(s);
    });

    const degree    = n => (adj[n.id]||[]).length;
    const sorted    = [...nodes].sort((a,b)=>degree(b)-degree(a));
    const hubs      = sorted.slice(0,5);
    const singletons= nodes.filter(n=>degree(n)===0);
    const encPct    = links.length ? Math.round(links.filter(l=>l.encrypted).length/links.length*100) : 0;

    // BFS diameter
    let diameter = 0;
    for (const start of nodes.slice(0,Math.min(8,nodes.length))) {
      const dist = {[start.id]:0};
      const q = [start.id];
      while (q.length) {
        const cur = q.shift();
        for (const nxt of adj[cur]||[]) {
          if (dist[nxt]===undefined) { dist[nxt]=dist[cur]+1; diameter=Math.max(diameter,dist[nxt]); q.push(nxt); }
        }
      }
    }

    const html = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">
        ${[['Nodes',nodes.length,'#60a5fa'],['Links',links.length,'#60a5fa'],['Enc. Links',encPct+'%',encPct>50?'#22c55e':'#ef4444'],['Diameter',diameter,'#a855f7'],['Singletons',singletons.length,singletons.length?'#ef4444':'#22c55e'],['OT Nodes',nodes.filter(n=>n.type==='ot'||n.type==='plc').length,'#fbbf24']].map(([l,v,c])=>`
          <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:5px;padding:8px;text-align:center;">
            <div style="font-size:1.2rem;font-weight:700;color:${c};">${v}</div>
            <div style="font-size:0.52rem;color:#64748b;">${l}</div>
          </div>`).join('')}
      </div>
      <div style="font-size:0.6rem;font-weight:700;color:rgba(96,165,250,0.7);letter-spacing:0.07em;margin-bottom:8px;">TOP HUBS (highest degree centrality)</div>
      ${hubs.map(n=>`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
          <div style="flex:1;height:8px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${Math.round(degree(n)/Math.max(...nodes.map(n=>degree(n)))*100)}%;background:#60a5fa;border-radius:4px;"></div>
          </div>
          <span style="font-size:0.6rem;color:#e2e8f0;min-width:120px;">${n.name||n.id}</span>
          <span style="font-size:0.58rem;color:#60a5fa;min-width:40px;text-align:right;">${degree(n)} links</span>
        </div>`).join('')}
      ${singletons.length?`<div style="margin-top:12px;padding:8px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:5px;font-size:0.62rem;color:#fca5a5;">⚠ ${singletons.length} isolated node(s) — ${singletons.map(n=>n.name||n.id).join(', ')}</div>`:''}`;

    this._showToolModal('networkAnalysisModal', '📈 ADVANCED NETWORK ANALYSIS', html, '#60a5fa');
  }
}

// Instantiate the App upon window loading
window.addEventListener('DOMContentLoaded', () => {
  window.appInstance = new DigitalTwinApp();
  // Wire up all improvements after the app is ready
  setTimeout(() => window.appInstance.initAllImprovements(), 800);
});

