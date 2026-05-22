class PacketTracer {
  constructor(app) {
    this.app = app;
    this.modal = document.getElementById('packetTracerModal');
    this.srcSelect = document.getElementById('ptSourceSelect');
    this.dstSelect = document.getElementById('ptDestSelect');
    this.protoSelect = document.getElementById('ptProtoSelect');
    this.btnTrace = document.getElementById('ptBtnTrace');
    this.closeBtn = document.getElementById('ptCloseBtn');
    this.hopsContainer = document.getElementById('ptHopsContainer');
    this.detailsContainer = document.getElementById('ptDetailsContainer');
    this.hopsInfo = document.getElementById('ptTraceHopsInfo');

    this.traceData = [];
    this.init();
  }

  init() {
    if (this.closeBtn) {
      this.closeBtn.onclick = () => {
        this.modal.classList.add('hidden');
      };
    }

    const btnOpen = document.getElementById('btnOpenPacketTracer');
    if (btnOpen) {
      btnOpen.onclick = () => {
        this.openTracer();
      };
    }

    if (this.btnTrace) {
      this.btnTrace.onclick = () => {
        this.executeTrace();
      };
    }
  }

  openTracer() {
    if (!this.app.canvas) return;
    this.modal.classList.remove('hidden');
    this.populateDropdowns();
    this.clearTrace();
  }

  populateDropdowns() {
    this.srcSelect.innerHTML = '';
    this.dstSelect.innerHTML = '';

    const nodes = this.app.canvas.nodes || [];
    if (nodes.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '-- No Nodes Available --';
      this.srcSelect.appendChild(opt.cloneNode(true));
      this.dstSelect.appendChild(opt);
      return;
    }

    nodes.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.textContent = `${n.id} (${n.name || n.role})`;
      this.srcSelect.appendChild(opt.cloneNode(true));
      this.dstSelect.appendChild(opt);
    });

    // Pick defaults
    if (nodes.length > 1) {
      this.srcSelect.selectedIndex = 0;
      this.dstSelect.selectedIndex = nodes.length - 1;
    }
  }

  clearTrace() {
    this.hopsContainer.innerHTML = `
      <div style="color:#6b21a8;font-style:italic;text-align:center;margin-top:40px;font-size:0.7rem;">
        Select source/destination endpoints and trigger trace simulation to view hop logs...
      </div>
    `;
    this.detailsContainer.innerHTML = `
      <div style="color:#6b21a8;font-style:italic;text-align:center;margin-top:40px;font-size:0.7rem;">
        Select any simulated hop block on the left to inspect detailed L2/L3 routing structures...
      </div>
    `;
    this.hopsInfo.textContent = 'Hops: 0';
  }

  executeTrace() {
    const srcId = this.srcSelect.value;
    const dstId = this.dstSelect.value;
    const protocol = this.protoSelect.value;

    if (srcId === dstId) {
      this.app.showToast("Source and Destination cannot be the same device!", "warning");
      return;
    }

    const srcNode = this.app.canvas.nodes.find(n => n.id === srcId);
    const dstNode = this.app.canvas.nodes.find(n => n.id === dstId);
    if (!srcNode || !dstNode) return;

    this.clearTrace();
    this.app.showToast("Packet Trace Simulation started!", "success");

    // 1. Resolve path via Dijkstra
    const path = this.app.canvas.solveDijkstraPath(srcId, dstId);
    
    // Spawn glowing trace animation particle
    if (path && path.length > 1) {
      const firstSrc = this.app.canvas.nodes.find(n => n.id === path[0]);
      const firstTgt = this.app.canvas.nodes.find(n => n.id === path[1]);
      this.app.canvas.spawnPacket(firstSrc, firstTgt, 'trace', path);
      this.generateHopLogs(path, protocol, srcNode, dstNode);
    } else {
      this.generateDropLogs(srcNode, dstNode, protocol);
    }
  }

  generateHopLogs(path, protocol, srcNode, dstNode) {
    this.hopsContainer.innerHTML = '';
    this.hopsInfo.textContent = `Hops: ${path.length - 1}`;
    
    this.traceData = [];

    path.forEach((nodeId, idx) => {
      const node = this.app.canvas.nodes.find(n => n.id === nodeId);
      const isSrc = idx === 0;
      const isDst = idx === path.length - 1;

      let actionTitle = '';
      let logColor = '#c084fc';
      let details = {};

      if (isSrc) {
        actionTitle = `🟢 ORIGINATING: ${node.id} (${node.name})`;
        logColor = '#22c55e';
        details = {
          layer1: `Physical: Egress interface selected: copper port Gig0/1. Status: UP.`,
          layer2: `Data Link (Ethernet): Encapsulating payload. MAC: 52:54:00:12:34:0${idx} -> Broadcast/Next-Hop ARP entry.`,
          layer3: `Network (IPv4): IP packet prepared. Src: ${node.ip || '192.168.1.10'} -> Dst: ${dstNode.ip || '192.168.10.50'}. TTL: 64. Protocol: ${protocol}`,
          layer4: this.getLayer4Details(protocol, true)
        };
      } else if (isDst) {
        actionTitle = `🎯 DESTINATION REACHED: ${node.id} (${node.name})`;
        logColor = '#e9d5ff';
        details = {
          layer1: `Physical: Ingress interface copper port Gig0/1 received frame successfully.`,
          layer2: `Data Link (Ethernet): Frame decoded. Destination MAC matches local controller hardware interface.`,
          layer3: `Network (IPv4): Destination IP matches local IP ${node.ip}. Handing off to Layer 4 listener.`,
          layer4: this.getLayer4Details(protocol, false)
        };
      } else {
        const isFirewall = node.role.toLowerCase().includes('firewall');
        const isRouter = node.role.toLowerCase().includes('router');
        const isSwitch = node.role.toLowerCase().includes('switch');

        if (isFirewall) {
          actionTitle = `🛡️ FIREWALL FORWARDING: ${node.id} (${node.name})`;
          logColor = '#ef4444';
          details = {
            layer1: `Physical: Received frame on security interface Gig0/2 (outside).`,
            layer2: `Data Link (Ethernet): Inner framing integrity validated. Decapsulated IPv4 payload.`,
            layer3: `Network (Security Policy): Inspected headers. Src: ${srcNode.ip} -> Dst: ${dstNode.ip}. DMZ/Inside Zone rules lookup matched Rule #10: (ALLOW TCP ANY). Packet permitted.`,
            layer4: `Stateful Inspection: Session table updated. Forwarding packet to egress zone interface Gig0/1.`
          };
        } else if (isRouter) {
          actionTitle = `⚡ LAYER-3 ROUTING DECISION: ${node.id} (${node.name})`;
          logColor = '#38bdf8';
          details = {
            layer1: `Physical: Ingress electrical signal decoded on interface Gig0/2.`,
            layer2: `Data Link (Ethernet): Decapsulated 802.3 Ethernet frame. Frame Check Sequence (FCS) valid.`,
            layer3: `Network (Routing Table): Evaluated best route match. Destination ${dstNode.ip} matches subnet via Gateway Gig0/1 (Next-Hop resolved). Decrementing TTL to ${64 - idx}.`,
            layer4: `ICMP Payload / Transit: Layer 4 untouched during transit routing.`
          };
        } else {
          actionTitle = `🔗 LAYER-2 SWITCH FORWARDING: ${node.id} (${node.name})`;
          logColor = '#a855f7';
          details = {
            layer1: `Physical: Frame ingress on fast ethernet port Gig0/${idx + 1}.`,
            layer2: `Data Link (Switching CAM): CAM lookup for destination MAC. Match found on port Gig0/${idx + 2}. Switching frame across silicon fabric.`,
            layer3: `Network (Transit): Layer 3 headers uninspected by Layer 2 switch.`,
            layer4: `Payload Transit: Layer 4 frames passed transparently.`
          };
        }
      }

      this.traceData.push({
        id: nodeId,
        title: actionTitle,
        color: logColor,
        details: details
      });

      // Render step block
      const card = document.createElement('div');
      card.className = 'shortcut-section';
      card.style.borderColor = logColor;
      card.style.cursor = 'pointer';
      card.style.background = 'rgba(24,12,48,0.15)';
      card.style.padding = '10px';
      card.style.borderRadius = '4px';
      card.style.transition = 'all 0.2s';
      card.style.boxShadow = `0 0 10px rgba(168,85,247,0.02)`;

      card.innerHTML = `
        <div style="font-weight:700;font-size:0.68rem;color:${logColor};display:flex;justify-content:space-between;align-items:center;">
          <span>${actionTitle}</span>
          <span style="font-size:0.55rem;color:#8b5cf6;">HOP ${idx}</span>
        </div>
        <div style="font-size:0.6rem;color:#e9d5ff;margin-top:4px;">
          ${isSrc ? 'Spawning packet onto physical network link.' : (isDst ? 'Packet processed successfully at application endpoint.' : 'Inspecting headers and switching packet frame forward.')}
        </div>
      `;

      card.onclick = () => {
        // Highlight active card
        document.querySelectorAll('#ptHopsContainer .shortcut-section').forEach(c => {
          c.style.background = 'rgba(24,12,48,0.15)';
          c.style.boxShadow = 'none';
        });
        card.style.background = 'rgba(168,85,247,0.08)';
        card.style.boxShadow = `0 0 15px rgba(168,85,247,0.15)`;

        this.decodeHopDetails(details, node);
      };

      this.hopsContainer.appendChild(card);

      // Auto select the first hop
      if (idx === 0) {
        card.click();
      }
    });
  }

  generateDropLogs(srcNode, dstNode, protocol) {
    this.hopsContainer.innerHTML = '';
    this.hopsInfo.textContent = 'Hops: DROPPED';

    const card = document.createElement('div');
    card.className = 'shortcut-section';
    card.style.borderColor = '#ef4444';
    card.style.background = 'rgba(239,68,68,0.08)';
    card.style.padding = '12px';
    card.style.borderRadius = '4px';
    
    card.innerHTML = `
      <div style="font-weight:700;font-size:0.75rem;color:#ef4444;">
        ❌ PACKET DROPPED (NO ROUTE FOUND)
      </div>
      <div style="font-size:0.62rem;color:#f87171;margin-top:6px;line-height:1.3;">
        The simulation engine attempted to route ${protocol} from <strong>${srcNode.id}</strong> to <strong>${dstNode.id}</strong> but failed.
      </div>
      <div style="font-size:0.58rem;color:#ef4444;margin-top:8px;font-family:var(--font-mono);border-top:1px dashed rgba(239,68,68,0.3);padding-top:6px;">
        Reason: Missing physical interface cabling link or strict network segmentation zone isolation. No active Dijkstra path exists!
      </div>
    `;
    this.hopsContainer.appendChild(card);

    this.detailsContainer.innerHTML = `
      <div style="border:1px solid rgba(239,68,68,0.3);border-radius:4px;padding:12px;background:rgba(239,68,68,0.04);display:flex;flex-direction:column;gap:8px;">
        <span style="font-weight:700;font-size:0.7rem;color:#ef4444;">🛡️ SEGMENTATION INTEGRITY SHIELD</span>
        <p style="font-size:0.6rem;color:#fca5a5;line-height:1.4;margin:0;">
          Digital twin zoning guards isolated systems from direct raw communication.
        </p>
        <span style="font-size:0.58rem;color:#ef4444;font-family:var(--font-mono);margin-top:6px;">
          DIAGNOSTIC HINTS:<br>
          1. Connect interface cables between the two network segments.<br>
          2. Check that intermediate switches are cabled back to the Core switches.<br>
          3. Ensure firewalls are configured to permit routing between zones.
        </span>
      </div>
    `;
  }

  getLayer4Details(protocol, isOrigin) {
    switch (protocol) {
      case 'ICMP':
        return isOrigin ? 
          `ICMP Header: Type 8 (Echo Request), Code 0. Identifier: 0x03E8. Sequence: 1` :
          `ICMP Response: Type 0 (Echo Reply), Code 0. Ping roundtrip successful. Status: ONLINE.`;
      case 'TCP_SYN':
        return isOrigin ?
          `TCP Segment: SrcPort: 54930 -> DstPort: 80. Flags: 0x02 (SYN). WinSize: 64240. Options: MSS` :
          `TCP Handshake: Target port 80 responded with Flags: 0x12 (SYN-ACK). Connection state: ESTABLISHING.`;
      case 'MODBUS':
        return isOrigin ?
          `Modbus TCP Frame: Transaction ID: 125, Protocol ID: 0, Length: 6. Unit ID: 1, Function Code: 03 (Read Holding Registers). RefAddr: 40001, Count: 2` :
          `Modbus TCP Response: Transaction ID: 125. Length: 7. Unit ID: 1, Function Code: 03. ByteCount: 4. Data payload: [0x01, 0x9A, 0x00, 0x2C] (Telemetry synced).`;
      case 'OSPF':
        return isOrigin ?
          `OSPF Header: Version 2, Type 1 (Hello Packet). Router ID: 10.1.1.1. Area ID: 0.0.0.0. Mask: 255.255.255.0` :
          `OSPF Link State: Neighbors synchronized. Link State Database (LSDB) updated. Converged Area 0 state.`;
      case 'HTTP':
        return isOrigin ?
          `HTTP Request: GET /index.html HTTP/1.1\\r\\nHost: enterprise.local\\r\\nUser-Agent: WebBrowser/1.0\\r\\n\\r\\n` :
          `HTTP Response: HTTP/1.1 200 OK\\r\\nContent-Type: text/html\\r\\nServer: Apache/2.4\\r\\nContent-Length: 1422\\r\\n\\r\\n(Document delivered).`;
      default:
        return 'Unknown Protocol payload.';
    }
  }

  decodeHopDetails(details, node) {
    this.detailsContainer.innerHTML = `
      <div style="border:1px solid rgba(168,85,247,0.3);border-radius:4px;padding:8px 12px;background:rgba(168,85,247,0.08);margin-bottom:8px;">
        <span style="font-weight:700;font-size:0.75rem;color:#c084fc;display:block;">🔎 STACK LAYER DECODER</span>
        <span style="font-size:0.55rem;color:#a855f7;font-family:var(--font-mono);">${node.id} (${node.name})</span>
      </div>
      
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="shortcut-section" style="border-color:rgba(168,85,247,0.25);padding:8px;background:rgba(10,5,20,0.7);box-shadow:none;">
          <span style="font-size:0.58rem;font-weight:700;color:#c084fc;display:block;margin-bottom:3px;">LAYER 1 (PHYSICAL PORT)</span>
          <span style="font-size:0.6rem;color:#e9d5ff;font-family:var(--font-mono);line-height:1.2;">${details.layer1 || 'N/A'}</span>
        </div>
        
        <div class="shortcut-section" style="border-color:rgba(168,85,247,0.25);padding:8px;background:rgba(10,5,20,0.7);box-shadow:none;">
          <span style="font-size:0.58rem;font-weight:700;color:#c084fc;display:block;margin-bottom:3px;">LAYER 2 (DATA LINK / MAC)</span>
          <span style="font-size:0.6rem;color:#e9d5ff;font-family:var(--font-mono);line-height:1.2;">${details.layer2 || 'N/A'}</span>
        </div>
        
        <div class="shortcut-section" style="border-color:rgba(168,85,247,0.25);padding:8px;background:rgba(10,5,20,0.7);box-shadow:none;">
          <span style="font-size:0.58rem;font-weight:700;color:#c084fc;display:block;margin-bottom:3px;">LAYER 3 (NETWORK / IP)</span>
          <span style="font-size:0.6rem;color:#e9d5ff;font-family:var(--font-mono);line-height:1.2;">${details.layer3 || 'N/A'}</span>
        </div>
        
        <div class="shortcut-section" style="border-color:rgba(168,85,247,0.25);padding:8px;background:rgba(10,5,20,0.7);box-shadow:none;">
          <span style="font-size:0.58rem;font-weight:700;color:#c084fc;display:block;margin-bottom:3px;">LAYER 4 (APPLICATION / payload)</span>
          <span style="font-size:0.6rem;color:#e9d5ff;font-family:var(--font-mono);line-height:1.2;">${details.layer4 || 'N/A'}</span>
        </div>
      </div>
    `;
  }
}
