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
      // Save credentials settings
      this.llm.setSettings(selProvider.value, txtApiKey.value);

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

      if (selectedLab.projectType === 'reactor') {
        this.activeProject = selectedLab.title;
        this.activeProjectType = 'reactor';
        this.sim.reset(); // restore physics to default state when re-entering reactor lab
        this.canvas.loadReactorProject();
        
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
        
        if (icsControls) icsControls.style.display = 'none';
        if (chartGroup) chartGroup.style.display = 'none';
        if (btnAttack) btnAttack.style.display = 'none';
        if (netpilotControls) netpilotControls.style.display = 'block';
        
        document.getElementById('aiModelVersion').textContent = `AETHERIS ASSISTANT [CONTEXT: ${selectedLab.categoryLabel}]`;
        this.orchestrator.logSystem(`Initialized lab workspace: ${selectedLab.title}`, 'success');
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

    // 0.5 Voice Assistant Toggle
    this.voiceAssistEnabled = false;
    const btnVoice = document.getElementById('btnVoiceAssist');
    if (btnVoice) {
      btnVoice.onclick = () => {
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
  }

  // Global keyboard shortcuts: Space toggles play/pause, Escape dismisses
  // transient UI (context menu, floating windows, report overlay).
  initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

      // Don't hijack typing or fire before the workspace is launched.
      const landing = document.getElementById('landingPage');
      const onLanding = landing && !landing.classList.contains('hidden') && landing.style.display !== 'none';

      if (e.key === ' ' && !typing && !onLanding) {
        e.preventDefault();
        document.getElementById('btnPlayPause')?.click();
      } else if (e.key === 'Escape') {
        document.getElementById('canvasContextMenu')?.classList.add('hidden');
        document.getElementById('reportDrawerOverlay')?.remove();
        document.getElementById('shortcutsModal')?.classList.add('hidden');
        document.getElementById('physicalInspectorModal')?.classList.add('hidden');
        document.getElementById('wiresharkModal')?.classList.add('hidden');
        document.getElementById('packetTracerModal')?.classList.add('hidden');
        document.querySelectorAll('.floating-window').forEach(w => w.remove());
      } else if (e.key === '?' && !typing && !onLanding) {
        e.preventDefault();
        this.showShortcutsModal();
      } else if (e.key === 'c' && !typing && !onLanding) {
        e.preventDefault();
        document.querySelectorAll('.tool-item').forEach(el => el.classList.remove('active-tool'));
        const cableTool = document.querySelector('.tool-item[data-tool="cable"]');
        if (cableTool) { cableTool.classList.add('active-tool'); this.activePlacementTool = 'cable'; }
      } else if (e.key === 'g' && !typing && !onLanding) {
        e.preventDefault();
        this.toggleGridSnap();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'z' && !typing && !onLanding) {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y' && !typing && !onLanding) {
        e.preventDefault();
        this.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && !onLanding) {
        if (this.canvas.selectedNode) {
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
    this.logIncident("CYBER ATTACK INITIATED — Intrusion vector deployed against industrial network", "critical");

    // 1. Compromise Engineering Workstation ENG-WS
    const engWs = this.canvas.nodes.find(n => n.id === 'ENG-WS');
    if (engWs) {
      engWs.status = 'compromised';
      this.orchestrator.logTerminal("[ALERT] Intrusion Signature Detected: ENG-WS compromised via rogue remote access session.", "danger");
      this.logIncident("STAGE 1: ENG-WS compromised via rogue RDP session — attacker established persistence", "critical");
    }

    // 2. Deploy lateral command stream to Inlet Controller PLC-101
    setTimeout(() => {
      const plc101 = this.canvas.nodes.find(n => n.id === 'PLC-101');
      if (plc101) {
        plc101.status = 'compromised';
        this.orchestrator.logTerminal("[ALERT] Lateral Movement: ENG-WS sending unauthorized Modbus firmware updates to PLC-101.", "danger");
        this.logIncident("STAGE 2: Lateral movement — unauthorized Modbus FC06 write to PLC-101 inlet valve", "critical");

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
        this.logIncident("STAGE 3: ICS IMPACT — Inlet=100% Outlet=0%, reactor pressure rising rapidly", "critical");
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
    const cliStatus = document.getElementById('cliStatus');
    const cliPrompt = document.getElementById('cliPrompt');
    const cliInput = document.getElementById('cliInput');
    const cliOutput = document.getElementById('cliOutput');

    cliStatus.textContent = `ACTIVE: ${node.id.toUpperCase()}`;
    cliPrompt.textContent = this.getCLIPromptText(node);
    cliInput.disabled = false;
    cliInput.placeholder = "Type command here (e.g. 'help', 'show config')...";

    // Set connection headers in output
    let bannerText = "";
    if (node.role.toLowerCase().includes('plc')) {
      bannerText = `
        <div class="cli-line comment-line"># Serial session attached on /dev/ttyS0 at 9600 baud.</div>
        <div class="cli-line comment-line"># Industrial Micro-Controller: ${node.name} (${node.ip})</div>
        <div class="cli-line comment-line"># OS: VxWorks RTOS kernel [Signature Verified]</div>
        <div class="cli-line success-line">Device Online. Modbus registry loaded. Status: ${node.status.toUpperCase()}</div>
      `;
    } else if (node.role.toLowerCase().includes('firewall') || node.role.toLowerCase().includes('router') || node.role.toLowerCase().includes('gateway')) {
      bannerText = `
        <div class="cli-line comment-line"># SSH connection established to ${node.name} (${node.ip}) on port 22.</div>
        <div class="cli-line comment-line"># Network Platform: ${node.os} [Version ${node.firmware}]</div>
        <div class="cli-line success-line">Active configuration parsed. Command line terminal loaded. Status: ${node.status.toUpperCase()}</div>
      `;
    } else {
      bannerText = `
        <div class="cli-line comment-line"># Terminal attachment active for workspace asset [${node.id}].</div>
        <div class="cli-line comment-line"># Hostname: ${node.name} // IP address: ${node.ip}</div>
        <div class="cli-line success-line">Shell interface initialized. Status: ${node.status.toUpperCase()}</div>
      `;
    }

    cliOutput.innerHTML = bannerText + `
      <div class="cli-line">Type 'help' to view the list of available emulator commands.</div>
    `;
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
    div.innerHTML = text;
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
      container.setAttribute('role', 'status');
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${severity}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
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
    const englishVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Microsoft')));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }
    
    utterance.rate = 0.95; // Slightly slower, highly premium natural cadence
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
      <span class="bubble-sender">${sender}</span>
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
      const response = await this.llm.sendPrompt(
        promptText, 
        this.canvas.nodes, 
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

      // Simple markdown parser helper for chat bubbles
      let formattedReply = conversationalReply.trim();
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

    container.innerHTML = `
      <div class="device-profile-header">
        <div class="device-avatar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
        </div>
        <div class="device-title">
          <span class="device-name">${node.name}</span>
          <span class="device-ip font-mono">${node.ip}</span>
        </div>
      </div>

      <div class="profile-row">
        <span class="label">Asset ID</span>
        <span class="value">${node.id}</span>
      </div>
      <div class="profile-row">
        <span class="label">Role Type</span>
        <span class="value">${node.role}</span>
      </div>
      <div class="profile-row">
        <span class="label">OS / Platform</span>
        <span class="value">${node.os}</span>
      </div>
      <div class="profile-row">
        <span class="label">Firmware</span>
        <span class="value">${node.firmware}</span>
      </div>
      <div class="profile-row">
        <span class="label">Twin Status</span>
        <span class="value ${node.status === 'compromised' ? 'text-glow-red' : (node.status === 'isolated' ? 'text-glow-amber' : 'text-glow-green')}">${node.status.toUpperCase()}</span>
      </div>

      <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
        <span class="firmware-status ${badgeClass} text-center font-mono">${badgeText}</span>
        
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
        }

        // Periodically trigger OSPF dynamic routing synchronization (Upgrade 1)
        if (!this.lastOspfTick || this.simTime - this.lastOspfTick > 5000) {
          this.ospfHelloTick();
          this.lastOspfTick = this.simTime;
        }

        this.canvas.update(this.speedDilation);
        this.updateTickers();
        this.updateNetworkStats();

        this.canvas.draw();
        if (this.activeProjectType === 'reactor') {
          this.sim.drawChart();
        }
      } else {
        // When simulation is paused or on landing page, only redraw if there is active interaction
        // or moving particles to completely reduce idle CPU usage to 0%.
        const hasActiveVisuals = (this.canvas.particles.length > 0) || this.canvas.isPanning || this.canvas.draggedNode;
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
    const winId = `win-cli-${node.id}`;
    const winTitle = `💻 CLI Terminal: ${node.name} (${node.ip})`;
    
    let bannerText = "";
    if (node.role.toLowerCase().includes('plc')) {
      bannerText = `
        <div class="cli-line comment-line"># Serial session attached on /dev/ttyS0 at 9600 baud.</div>
        <div class="cli-line comment-line"># Industrial Controller: ${node.name} (${node.ip})</div>
        <div class="cli-line comment-line"># OS: VxWorks RTOS kernel [Signature Verified]</div>
        <div class="cli-line success-line">Device Online. Modbus registry loaded. Status: ${node.status.toUpperCase()}</div>
      `;
    } else if (node.role.toLowerCase().includes('firewall') || node.role.toLowerCase().includes('router') || node.role.toLowerCase().includes('gateway')) {
      bannerText = `
        <div class="cli-line comment-line"># SSH connection established to ${node.name} (${node.ip}) on port 22.</div>
        <div class="cli-line comment-line"># Network Platform: ${node.os} [Version ${node.firmware}]</div>
        <div class="cli-line success-line">Active configuration parsed. Command line terminal loaded. Status: ${node.status.toUpperCase()}</div>
      `;
    } else {
      bannerText = `
        <div class="cli-line comment-line"># Terminal attachment active for workspace asset [${node.id}].</div>
        <div class="cli-line comment-line"># Hostname: ${node.name} // IP address: ${node.ip}</div>
        <div class="cli-line success-line">Shell interface initialized. Status: ${node.status.toUpperCase()}</div>
      `;
    }

    const contentHtml = `
      <div class="cli-output font-mono" id="cli-output-${node.id}" style="flex: 1; padding: 12px; overflow-y: auto; font-size: 0.75rem; background: #0f172a; color: #cbd5e1; display: flex; flex-direction: column; gap: 4px;">
        ${bannerText}
        <div class="cli-line">Type 'help' to view the list of available emulator commands.</div>
      </div>
      <div class="cli-input-row font-mono" style="height: 38px; background: #0b0f19; border-top: 1px solid #1e293b; display: flex; align-items: center; padding: 0 12px; gap: 6px; color: #38bdf8; font-size: 0.75rem;">
        <span class="cli-prompt" id="cli-prompt-${node.id}">${this.getCLIPromptText(node)}</span>
        <input type="text" id="cli-input-${node.id}" style="flex: 1; background: transparent; border: none; outline: none; color: #ffffff; font-family: var(--font-mono); font-size: 0.75rem;" placeholder="Type command here (e.g. 'help', 'show config')..." autocomplete="off">
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
          const data = JSON.parse(event.target.result);
          if (Array.isArray(data.nodes) && Array.isArray(data.links)) {
            this.canvas.nodes = data.nodes;
            this.canvas.links = data.links;
            this.nodeConfigs = (data.nodeConfigs && typeof data.nodeConfigs === 'object') ? data.nodeConfigs : {};
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
          <label style="font-weight: 700; color: #38bdf8;">${srcNode.name} Port</label>
          <select id="selSrcPort" class="cyber-select" style="font-size: 0.7rem; padding: 4px; background: #0f172a; border: 1px solid #334155; color: white;">
            ${srcPorts.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-weight: 700; color: #38bdf8;">${dstNode.name} Port</label>
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
          <div style="background: #1e293b; padding: 4px 8px; font-weight: 700; color: #38bdf8;">Frame Detail Tree</div>
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
          <div style="background: #1e293b; padding: 4px 8px; font-weight: 700; color: #38bdf8;">Hex Dump Payload</div>
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
      msg.style.color = '#38bdf8';
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
      timeline: { content: 'tabContentTimeline', btn: 'tabBtnTimeline' }
    };

    Object.entries(tabs).forEach(([name, ids]) => {
      const content = document.getElementById(ids.content);
      const btn = document.getElementById(ids.btn);
      const isActive = name === tabName;
      if (content) content.style.display = isActive ? 'flex' : 'none';
      if (btn) { btn.classList.toggle('active', isActive); btn.setAttribute('aria-selected', isActive ? 'true' : 'false'); }
    });

    if (tabName === 'audit') this.runAuditRules();
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
  logIncident(message, severity = 'info') {
    if (!this.incidentTimeline) this.incidentTimeline = [];
    const simMs = Math.round(this.simTime);
    const h = Math.floor(simMs / 3600000);
    const m = Math.floor((simMs % 3600000) / 60000);
    const s = Math.floor((simMs % 60000) / 1000);
    const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

    this.incidentTimeline.push({ time: timeStr, real: new Date().toLocaleTimeString(), message, severity });

    const list = document.getElementById('timelineList');
    if (list) {
      const empty = list.querySelector('[style*="text-align: center"]');
      if (empty) empty.remove();

      const entry = document.createElement('div');
      entry.className = `timeline-entry severity-${severity}`;
      entry.innerHTML = `<span class="timeline-time">[${timeStr}] ${new Date().toLocaleTimeString()}</span><span class="timeline-msg">${this.escapeHtml(message)}</span>`;
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
    const nodes = this.canvas.nodes;
    if (nodes.length === 0) return;

    const W = 850, H = 400;
    const centerX = W / 2, centerY = H / 2;

    // Group by type
    const itNodes  = nodes.filter(n => n.type === 'it');
    const otNodes  = nodes.filter(n => n.type === 'ot');
    const plcNodes = nodes.filter(n => n.type === 'plc');
    const fieldNodes = nodes.filter(n => n.type === 'field');
    const others   = nodes.filter(n => !['it','ot','plc','field'].includes(n.type));

    const place = (group, cx, cy, radius) => {
      const angle = (2 * Math.PI) / Math.max(group.length, 1);
      group.forEach((n, i) => {
        n.x = cx + Math.cos(angle * i - Math.PI/2) * radius;
        n.y = cy + Math.sin(angle * i - Math.PI/2) * radius;
        n.x = Math.max(60, Math.min(W - 60, n.x));
        n.y = Math.max(60, Math.min(H - 60, n.y));
      });
    };

    place(itNodes,   180, 200, 100);
    place(otNodes,   450, 200,  80);
    place(plcNodes,  680, 150, 100);
    place(fieldNodes,700, 320,  60);
    place(others,    450, 380,  80);

    this.canvas.draw();
    this.saveState();
    this.orchestrator.logSystem('Topology auto-arranged by network segment zones.', 'success');
    this.showToast('Nodes auto-arranged by segment.', 'success');
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
      btn.style.background = this.gridSnap ? 'rgba(56,189,248,0.15)' : '';
      btn.style.color = this.gridSnap ? '#38bdf8' : '';
      btn.style.borderColor = this.gridSnap ? '#38bdf8' : '';
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
          this.logIncident(`NMAP scan from ${node.name} → ${targetNode.name} detected`, 'warning');
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
            this.logIncident(`HYDRA brute-force succeeded on ${targetNode.name} — credential: admin:admin123`, 'critical');
          } else {
            this.printCLILine(`[ERROR] 0 of 1 target completed (brute force failed — host hardened or unreachable)`, 'error-line');
            this.logIncident(`HYDRA brute-force attempt against ${targetIp} blocked`, 'warning');
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
          this.logIncident(`MODBUS INJECTION: FC${fc} to ${plcNode.name} Reg=0x${reg} Val=0x${val}`, 'critical');
          plcNode.status = 'compromised';
          this.orchestrator.addAlert(`SCADA INJECTION DETECTED: Unauthorized Modbus write to ${plcNode.id}`, 'danger');
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
            this.logIncident(`ARP SPOOF: MITM inserted between ${victim.name} and gateway ${gatewayIp}`, 'critical');
            this.orchestrator.addAlert(`ARP CACHE POISONING DETECTED on ${victim.id}`, 'danger');
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
}

// Instantiate the App upon window loading
window.addEventListener('DOMContentLoaded', () => {
  window.appInstance = new DigitalTwinApp();
});
