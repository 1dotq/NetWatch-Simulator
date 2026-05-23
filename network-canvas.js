class NetworkTwinCanvas {
  constructor(canvasId, onNodeSelect) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.onNodeSelect = onNodeSelect;

    this.nodes = [];
    this.links = [];
    this.particles = [];
    
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
    this.scale = 0.9;
    this.panX = this.canvas.width / 2 - 350;
    this.panY = this.canvas.height / 2 - 250;
  }

  zoom(factor, mouseX, mouseY) {
    const oldScale = this.scale;
    this.scale = Math.max(0.4, Math.min(2.5, this.scale * factor));
    
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
          return Math.sqrt(dx*dx + dy*dy) < 12; // 12px touch radius
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

    // 1. Draw Network Subnet Borders
    this.drawSubnetGrid();

    // 1.2 Animated Sonar Radar Wave sweep line (Security Audit Scanner!)
    if (!this.scanLineX) this.scanLineX = 0;
    this.scanLineX = (this.scanLineX + 1.2) % 1050;
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(this.scanLineX, 20);
    this.ctx.lineTo(this.scanLineX, 440);
    this.ctx.stroke();

    // scanner leading edge pulse glow
    this.ctx.fillStyle = 'rgba(56, 189, 248, 0.015)';
    this.ctx.fillRect(this.scanLineX - 60, 20, 60, 420);
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
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // 4. Draw Device Nodes
    this.nodes.forEach(node => {
      this.drawNode(node);
    });

    // 5. Draw Interactive Hover Tooltips (Cisco Telemetry Overlay Upgrades!)
    if (this.hoveredNode) {
      this.drawHoverTooltip(this.hoveredNode);
    }

    this.ctx.restore();
  }

  drawSubnetGrid() {
    // Draw visual zoning dividers (IT Zone vs. OT Zone) (Cisco UX Hardening)
    this.ctx.save();
    this.ctx.font = '700 9px var(--font-sans), sans-serif';
    this.ctx.textAlign = 'center';
    
    // IT Subnet Boundary Area (Upgrade 2)
    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)'; // Sky-blue border trace
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.6)'; // High contrast dark slate fill
    this.ctx.lineWidth = 1;
    this.drawRoundedRect(20, 20, 380, 420, 10, true, true);
    this.ctx.fillStyle = '#38bdf8'; // Cyan text for IT Zone
    this.ctx.fillText('IT ENTERPRISE NETWORK ZONE', 210, 38);

    // OT ICS Boundary Area (Upgrade 2)
    this.ctx.strokeStyle = 'rgba(139, 92, 246, 0.25)'; // Purple OT border trace
    this.ctx.fillStyle = 'rgba(21, 16, 42, 0.65)'; // High contrast deep purple-slate fill
    this.drawRoundedRect(410, 20, 600, 420, 10, true, true);
    this.ctx.fillStyle = '#a78bfa'; // Purple text for OT Zone
    this.ctx.fillText('OT INDUSTRIAL ICS NETWORK ZONE & PROCESS TWIN', 710, 38);

    this.ctx.restore();
  }

  drawPhysicalPlant() {
    // Only render for Reactor projects
    if (!window.appInstance || window.appInstance.activeProjectType !== 'reactor') return;

    const sim = window.appInstance.sim;
    if (!sim) return;

    const ctx = this.ctx;
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
    let liquidColor = 'rgba(14, 165, 233, 0.4)'; // Cyber Cyan
    let liquidGlow = 'rgba(14, 165, 233, 0.15)';
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
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    this.drawRoundedRect(rx, ry, rw, rh, 16, true, true);

    // Dynamic Pressure Glow aura overlay on tank
    if (sim.pressure > 1.8) {
      const pPulse = 1 + 0.05 * Math.sin(Date.now() / 50);
      ctx.strokeStyle = `rgba(239, 68, 68, ${0.3 + 0.1 * Math.sin(Date.now() / 100)})`;
      ctx.lineWidth = 3 * pPulse;
      this.drawRoundedRect(rx - 4, ry - 4, rw + 8, rh + 8, 20, false, true);
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

    // Vertical metal support beams (structural aesthetics)
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

    // Live telemetry display badge directly on the Reactor Tower
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    this.drawRoundedRect(rx + 8, ry + 25, rw - 16, 42, 4, true, true);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '600 7px Fira Code';
    ctx.textAlign = 'left';
    ctx.fillText(`LVL: ${sim.level.toFixed(1)}%`, rx + 14, ry + 36);
    ctx.fillText(`TMP: ${sim.temp.toFixed(1)}C`, rx + 14, ry + 46);
    
    ctx.fillStyle = sim.pressure > 2.0 ? '#ef4444' : '#10b981';
    ctx.fillText(`PRS: ${sim.pressure.toFixed(2)}M`, rx + 14, ry + 56);

    // 4. Draw Animated Pipelines/Tubes linking Field Actuators to Reactor Vessel
    const pipes = [
      { id: 'inlet', label: 'INFLOW', fy: 60, ty: ry + 80, color: '#38bdf8', active: sim.inletValve > 0, val: sim.inletValve },
      { id: 'outlet', label: 'OUTFLOW', fy: 180, ty: ry + 200, color: '#f59e0b', active: sim.outletValve > 0, val: sim.outletValve },
      { id: 'relief', label: 'RELIEF VENT', fy: 300, ty: ry + 120, color: '#ef4444', active: sim.reliefValve, val: sim.reliefValve ? 100 : 0 },
      { id: 'sensor', label: 'SENSE LOOP', fy: 400, ty: ry + 320, color: '#10b981', active: true, val: 50 }
    ];

    pipes.forEach(p => {
      const startX = 800;
      const endX = rx;
      
      // Draw metallic pipeline background cylinder
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(startX, p.fy);
      ctx.lineTo(endX, p.ty);
      ctx.stroke();

      // Outer metallic steel shine
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(startX, p.fy);
      ctx.lineTo(endX, p.ty);
      ctx.stroke();

      // Core pipeline inner channel
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(startX, p.fy);
      ctx.lineTo(endX, p.ty);
      ctx.stroke();

      // Flow Animation inside inner channel
      if (p.active) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX, p.fy);
        ctx.lineTo(endX, p.ty);
        const flowShift = (Date.now() / 40) % 24;
        ctx.setLineDash([8, 8]);
        ctx.lineDashOffset = p.id === 'outlet' ? -flowShift : flowShift;
        ctx.stroke();
        ctx.restore();
      }

      // Small pipe labels
      ctx.fillStyle = '#64748b';
      ctx.font = '600 6px var(--font-sans), sans-serif';
      ctx.textAlign = 'center';
      const labelX = (startX + endX) / 2;
      const labelY = (p.fy + p.ty) / 2 - 6;
      ctx.fillText(p.label, labelX, labelY);
    });

    ctx.restore();
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
    const dist = Math.sqrt(dx*dx + dy*dy);

    // IMP-8: Bezier curve control point perpendicular offset for aesthetic curved links
    const curve = Math.min(dist * 0.18, 30);
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
      this.ctx.lineWidth = 1.5 + loadVal * 1.5;
      this.ctx.setLineDash([]);
    }

    // IMP-10: Encrypted link glow
    if (link.encrypted && !isIsolated && !isSnipped) {
      this.ctx.shadowColor = 'rgba(16, 185, 129, 0.4)';
      this.ctx.shadowBlur = 5;
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

    // IMP-11: Animated traffic data-dot flowing along active links
    if (!isSnipped && !isIsolated && window.appInstance?.isPlaying) {
      const t2 = ((Date.now() / 600) % 1);
      const bx = (1-t2)*(1-t2)*src.x + 2*(1-t2)*t2*mx + t2*t2*tgt.x;
      const by = (1-t2)*(1-t2)*src.y + 2*(1-t2)*t2*my + t2*t2*tgt.y;
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = link.encrypted ? 'rgba(16,185,129,0.9)' : 'rgba(56,189,248,0.8)';
      this.ctx.beginPath();
      this.ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
      this.ctx.fill();
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
      this.ctx.fillText(`${link.speed}Mbps`, mx, my);
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
      color = '#0ea5e9';
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

    // Advanced glow effect on packets (Upgrades 20, 26)
    this.ctx.shadowBlur = p.type === 'trace' ? 18 : 8;
    this.ctx.shadowColor = p.type === 'trace' ? '#c084fc' : color;
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

    // Node state color picker
    let primaryColor = '#3b82f6';
    let glowColor = 'rgba(59, 130, 246, 0.15)';
    
    if (n.status === 'compromised') {
      primaryColor = '#ef4444';
      glowColor = 'rgba(239, 68, 68, 0.3)';
    } else if (n.status === 'isolated') {
      primaryColor = '#f59e0b';
      glowColor = 'rgba(245, 158, 11, 0.2)';
    } else {
      switch (n.type) {
        case 'ot': primaryColor = '#8b5cf6'; glowColor = 'rgba(139, 92, 246, 0.15)'; break;
        case 'plc': primaryColor = '#10b981'; glowColor = 'rgba(16, 185, 129, 0.15)'; break;
        case 'field': primaryColor = '#64748b'; glowColor = 'rgba(100, 116, 139, 0.1)'; break;
      }
    }

    // Dynamic micro-tremble glitch effect for compromised nodes
    let nx = n.x;
    let ny = n.y;
    if (n.status === 'compromised' && Math.random() > 0.8) {
      nx += (Math.random() - 0.5) * 3.5;
      ny += (Math.random() - 0.5) * 3.5;
    }

    // Selected/Hovered halo rings (clean slate-blue design)
    if (n.status === 'compromised') {
      const pulse = 1 + 0.12 * Math.sin(Date.now() / 150);
      this.ctx.strokeStyle = glowColor;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, 22 * pulse, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    if (n.hasIpConflict) {
      const pulse = 1 + 0.1 * Math.sin(Date.now() / 100);
      this.ctx.strokeStyle = '#ef4444';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([2, 2]);
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, 20 * pulse, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    if (isSelected) {
      this.ctx.strokeStyle = '#3b82f6';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 2]);
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, 24, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    } else if (isHovered) {
      this.ctx.strokeStyle = '#64748b';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, 22, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Semi-transparent glass circle backdrop card (Cisco UX style)
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    this.ctx.strokeStyle = primaryColor;
    this.ctx.lineWidth = isSelected ? 2.5 : 1.5;
    this.ctx.beginPath();
    this.ctx.arc(nx, ny, 20, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

    // Visual glowing LED blinking indicator for OSPF / traffic activity (Feature 10 & 16)
    if (n.status === 'compromised') {
      this.ctx.fillStyle = '#ef4444';
      this.ctx.beginPath();
      this.ctx.arc(nx + 13, ny - 13, 3, 0, Math.PI * 2);
      this.ctx.fill();
    } else {
      let isTrafficActive = Math.sin(Date.now() / 150 + nx) > 0.4;
      this.ctx.fillStyle = isTrafficActive ? '#10b981' : '#047857';
      this.ctx.beginPath();
      this.ctx.arc(nx + 13, ny - 13, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Call high-fidelity custom hardware vector rendering method (Icon Hardware Upgrades!)
    this.drawHardwareIcon(this.ctx, nx, ny, n.role || n.type, 20, primaryColor, n);

    // Metadata labels
    this.ctx.font = '600 9px var(--font-sans), sans-serif';
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.fillText(n.id, nx, ny + 30);

    this.ctx.font = '400 8px Fira Code';
    if (n.hasIpConflict) {
      this.ctx.fillStyle = '#ef4444';
      this.ctx.fillText(n.ip + ' [!] CONFLICT', nx, ny + 40);
    } else {
      this.ctx.fillStyle = varColorText(n.status);
      this.ctx.fillText(n.ip, nx, ny + 40);
    }

    // Note indicator: small amber dot top-right of node circle
    if (n.note) {
      this.ctx.beginPath();
      this.ctx.arc(nx + 14, ny - 14, 4, 0, Math.PI * 2);
      this.ctx.fillStyle = '#f59e0b';
      this.ctx.fill();
      this.ctx.strokeStyle = '#0f172a';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }

    // IMP-49: Live annotation label (e.g. valve open%, level%)
    if (n._liveAnnotation) {
      this.ctx.fillStyle = 'rgba(15,23,42,0.85)';
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 0.8;
      this.drawRoundedRect(nx - 20, ny + 44, 40, 11, 3, true, true);
      this.ctx.fillStyle = '#38bdf8';
      this.ctx.font = '700 7px Fira Code';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(n._liveAnnotation, nx, ny + 49.5);
    }

    // IMP-31: Search match highlight ring
    if (n._searchMatch === false) {
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, 22, 0, Math.PI * 2);
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
      return Math.sqrt(dx*dx + dy*dy) < 25; // 25px radius
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
    const l2 = (v.x - w.x)*(v.x - w.x) + (v.y - w.y)*(v.y - w.y);
    if (l2 === 0) return Math.sqrt((p.x - v.x)*(p.x - v.x) + (p.y - v.y)*(p.y - v.y));
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projection = {
      x: v.x + t * (w.x - v.x),
      y: v.y + t * (w.y - v.y)
    };
    return Math.sqrt((p.x - projection.x)*(p.x - projection.x) + (p.y - projection.y)*(p.y - projection.y));
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
      ctx.fillStyle = '#38bdf8';
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
    } 
    else if (roleLower.includes('actuator') || roleLower.includes('valve')) {
      // Double flange butterfly pipeline valve
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 8); ctx.lineTo(x - 14, y + 8);
      ctx.lineTo(x - 10, y + 8); ctx.lineTo(x - 10, y - 8);
      ctx.closePath();
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(x + 14, y - 8); ctx.lineTo(x + 14, y + 8);
      ctx.lineTo(x + 10, y + 8); ctx.lineTo(x + 10, y - 8);
      ctx.closePath();
      ctx.stroke();
      
      // Center flow block
      ctx.beginPath();
      ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
      // Top handwheel selector
      ctx.moveTo(x, y - 6); ctx.lineTo(x, y - 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y - 12, 3, 0, Math.PI * 2);
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
    const os = this.getHardwareOSName(n.role || n.type);

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
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    this.drawRoundedRect(tx, ty, cardW, cardH, 6, true, true);
    
    // Draw text lines
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    lines.forEach((l, idx) => {
      // Highlight asset header cyan
      if (idx === 0) ctx.fillStyle = '#38bdf8';
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
    if (r.includes('firewall')) return 'ASA-OS v9.18';
    if (r.includes('server') || r.includes('directory')) return 'Windows Server 2022';
    if (r.includes('plc') || r.includes('controller')) return 'Embedded VxWorks RTOS';
    if (r.includes('actuator') || r.includes('sensor')) return 'MicroPython Core v1.21';
    return 'Ubuntu Linux 22.04 LTS';
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
