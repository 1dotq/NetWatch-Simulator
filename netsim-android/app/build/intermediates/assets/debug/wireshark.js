class WiresharkManager {
  constructor(app) {
    this.app = app;
    this.state = null;
  }

  open() {
    const modal = document.getElementById('wiresharkModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    if (!this.state) {
      this.state = {
        capturing: false,
        packets: [],
        filtered: [],
        filterText: '',
        activeProtocols: new Set(),
        selectedPacket: null,
        interval: null,
        counter: 0
      };
    }

    this._wsRebuildFilters();
    this._wsRenderList();
    this._wsUpdateStatus();

    const btnCapture = document.getElementById('wsBtnCapture');
    const btnClear   = document.getElementById('wsBtnClear');
    const btnExport  = document.getElementById('wsBtnExport');
    const btnClose   = document.getElementById('wsCloseBtn');
    const filterInput = document.getElementById('wsFilterInput');

    btnCapture.onclick = () => this._wsToggleCapture();
    btnClear.onclick   = () => { this.state.packets = []; this.state.counter = 0; this._wsRenderList(); this._wsUpdateStatus(); };
    btnExport.onclick  = () => this._wsExport();
    btnClose.onclick   = () => { modal.classList.add('hidden'); this._wsStopCapture(); };
    filterInput.oninput = (e) => { this.state.filterText = e.target.value.toLowerCase(); this._wsApplyFilter(); };

    document.getElementById('wsPacketListBody').onclick = (e) => {
      const row = e.target.closest('tr[data-idx]');
      if (!row) return;
      const idx = parseInt(row.dataset.idx);
      this.state.selectedPacket = this.state.filtered[idx];
      document.querySelectorAll('#wsPacketListBody tr').forEach(r => r.classList.remove('ws-selected'));
      row.classList.add('ws-selected');
      this._wsDecodePacket(this.state.selectedPacket);
    };
  }

  _wsProtoColor(proto) {
    const map = { TCP: '#3b82f6', UDP: '#8b5cf6', ICMP: '#10b981', MODBUS: '#f59e0b', OSPF: '#06b6d4', DHCP: '#ec4899', ARP: '#84cc16', BGP: '#f97316', TLS: '#a78bfa', HTTP: '#34d399', DNP3: '#fb923c', 'EtherNet/IP': '#e879f9', 'OPC-UA': '#a78bfa', 'IEC 61850': '#38bdf8' };
    return map[proto] || '#64748b';
  }

  // Pick two distinct random items from a pool; returns [null,null] if pool has <2 items
  _wsPairRandom(pool) {
    if (!pool || pool.length < 2) return [null, null];
    const i = Math.floor(Math.random() * pool.length);
    let j = Math.floor(Math.random() * pool.length);
    let attempts = 0;
    while (j === i && attempts++ < 12) j = Math.floor(Math.random() * pool.length);
    if (j === i) return [null, null];
    return [pool[i], pool[j]];
  }

  // Realistic byte-length range per protocol
  _wsProtoLen(proto) {
    const r = () => Math.floor(Math.random() * 100);
    const m = { OSPF: 68, MODBUS: 66, ARP: 28, DHCP: 300 + r(), BGP: 19 + Math.floor(Math.random()*180), TLS: 120 + Math.floor(Math.random()*800), HTTP: 200 + Math.floor(Math.random()*600), ICMP: 42 + Math.floor(Math.random()*32), TCP: 54 + Math.floor(Math.random()*200), UDP: 42 + Math.floor(Math.random()*100), DNP3: 28 + Math.floor(Math.random()*60), 'EtherNet/IP': 62 + Math.floor(Math.random()*80), 'OPC-UA': 80 + Math.floor(Math.random()*120), 'IEC 61850': 54 + Math.floor(Math.random()*40) };
    return m[proto] || (40 + Math.floor(Math.random() * 200));
  }

  _wsGeneratePacket() {
    const nodes = this.app.canvas.nodes.filter(n => n.status !== 'isolated');
    if (nodes.length < 2) return null;

    const labType = this.app.activeProjectType || 'reactor';

    // Role helpers
    const isRouter   = n => /router/i.test(n.role);
    const isFirewall = n => /firewall/i.test(n.role);
    const isPLC      = n => /plc|controller/i.test(n.role);
    const isHMI      = n => /hmi|scada/i.test(n.role);
    const isHost     = n => /workstation|station|server|directory|console/i.test(n.role);
    const isField    = n => /actuator|sensor|meter/i.test(n.role);

    const threats = nodes.filter(n => n.status === 'compromised');
    const isThreat = threats.length > 0 && Math.random() < 0.25;

    let src, dst, proto, info, len;

    // ── Threat packets ────────────────────────────────────────────────────────
    if (isThreat) {
      src = threats[Math.floor(Math.random() * threats.length)];
      if (labType === 'reactor') {
        // Rogue Modbus write toward a PLC or HMI
        const victims = nodes.filter(n => isPLC(n) || isHMI(n));
        dst = victims.length ? victims[Math.floor(Math.random() * victims.length)] : nodes.find(n => n !== src);
        proto = 'MODBUS';
        info = `Write Single Coil FC=06 Unit=01 Reg=7530 Val=FF00 [ROGUE WRITE]`;
        len = 66;
      } else {
        // Campus lateral movement — port scan / flood
        const others = nodes.filter(n => n !== src);
        dst = others[Math.floor(Math.random() * others.length)];
        proto = Math.random() < 0.6 ? 'TCP' : 'ICMP';
        const ports = [22, 23, 80, 443, 8080, 8443, 3389, 445];
        info = proto === 'TCP'
          ? `SYN Scan ${src.ip.split(' ')[0]}:${30000+Math.floor(Math.random()*10000)} → ${dst.ip.split(' ')[0]}:${ports[Math.floor(Math.random()*ports.length)]} [SYN] [SCAN]`
          : `Echo Request id=0x${Math.floor(Math.random()*65536).toString(16).padStart(4,'0')} [SWEEP]`;
        len = proto === 'TCP' ? 54 : 42;
      }

    // ── Normal packets ────────────────────────────────────────────────────────
    } else if (labType === 'reactor') {
      // ICS lab: Modbus-heavy + DNP3 + EtherNet/IP, no BGP/OSPF/TLS/HTTP
      const protos = ['MODBUS', 'MODBUS', 'MODBUS', 'DNP3', 'DNP3', 'EtherNet/IP', 'IEC 61850', 'TCP', 'ICMP', 'ARP', 'UDP'];
      proto = protos[Math.floor(Math.random() * protos.length)];

      const masters = nodes.filter(n => isHMI(n) || isHost(n));
      const slaves  = nodes.filter(n => isPLC(n) || isField(n));

      if (proto === 'MODBUS' || proto === 'DNP3' || proto === 'EtherNet/IP') {
        [src, dst] = (masters.length && slaves.length)
          ? [masters[Math.floor(Math.random()*masters.length)], slaves[Math.floor(Math.random()*slaves.length)]]
          : this._wsPairRandom(nodes);
      } else if (proto === 'ARP') {
        [src, dst] = this._wsPairRandom(nodes.filter(n => !isField(n)));
        if (!src) [src, dst] = this._wsPairRandom(nodes);
      } else {
        [src, dst] = this._wsPairRandom(nodes);
      }

    } else if (labType === 'campus') {
      // Campus/enterprise lab: topology-aware BGP/OSPF, no MODBUS/DHCP-from-routers
      const routers     = nodes.filter(n => isRouter(n));
      const coreRouters = nodes.filter(n => isRouter(n) && /^(PE|P)-/i.test(n.id));
      const peRouters   = nodes.filter(n => isRouter(n) && /^PE-/i.test(n.id));

      // Valid BGP peer pairs: follow actual topology links + PE↔PE iBGP
      const bgpPairs = [];
      this.app.canvas.links.forEach(link => {
        const s = nodes.find(n => n.id === link.sourceId);
        const d = nodes.find(n => n.id === link.targetId);
        if (s && d && isRouter(s) && isRouter(d)) bgpPairs.push([s, d]);
      });
      // PE↔PE iBGP full-mesh (not necessarily a direct data-plane link)
      for (let i = 0; i < peRouters.length; i++) {
        for (let j = i + 1; j < peRouters.length; j++) {
          const already = bgpPairs.some(p => (p[0] === peRouters[i] && p[1] === peRouters[j]) || (p[0] === peRouters[j] && p[1] === peRouters[i]));
          if (!already) bgpPairs.push([peRouters[i], peRouters[j]]);
        }
      }

      // Weighted pool — heavier on TCP/TLS since it's a campus network
      const protos = ['TCP', 'TCP', 'TCP', 'TLS', 'TLS', 'UDP', 'HTTP', 'ICMP', 'ARP'];
      if (coreRouters.length >= 2) protos.push('OSPF', 'OSPF');
      if (bgpPairs.length > 0) protos.push('BGP', 'BGP');
      proto = protos[Math.floor(Math.random() * protos.length)];

      if (proto === 'OSPF') {
        // Only between core (PE/P) routers — not CE or FW
        [src, dst] = this._wsPairRandom(coreRouters.length >= 2 ? coreRouters : routers);
        if (!src) [src, dst] = this._wsPairRandom(nodes);
      } else if (proto === 'BGP') {
        const pair = bgpPairs[Math.floor(Math.random() * bgpPairs.length)];
        [src, dst] = [pair[0], pair[1]];
      } else if (proto === 'ARP') {
        // ARP is link-local — draw from an actual topology link
        const activeLinks = this.app.canvas.links.filter(l => l.status !== 'isolated');
        const link = activeLinks[Math.floor(Math.random() * activeLinks.length)];
        const s = link && nodes.find(n => n.id === link.sourceId);
        const d = link && nodes.find(n => n.id === link.targetId);
        if (s && d) { src = s; dst = d; }
        else [src, dst] = this._wsPairRandom(nodes);
      } else {
        // TCP/UDP/TLS/HTTP/ICMP — any pair; routers don't DHCP
        [src, dst] = this._wsPairRandom(nodes);
      }

    } else {
      // Blank canvas — allow all protocols
      const protos = ['TCP', 'UDP', 'ICMP', 'OSPF', 'ARP', 'MODBUS', 'DHCP', 'BGP', 'TLS', 'HTTP'];
      proto = protos[Math.floor(Math.random() * protos.length)];
      [src, dst] = this._wsPairRandom(nodes);
    }

    if (!src || !dst) return null;

    // ── Build info string ─────────────────────────────────────────────────────
    const srcIP = src.ip.split(' ')[0];
    const dstIP = dst.ip.split(' ')[0];

    // ASN map for BGP (keyed by node ID prefix)
    const asnOf = n => n.id.startsWith('PE') ? (n.id === 'PE-01' ? 65001 : 65002) : n.id.startsWith('P') ? 65001 : n.id.startsWith('CE-01') ? 65100 : n.id.startsWith('CE-02') ? 65200 : 65000;
    const dstPorts = { TCP: [80, 443, 22, 8080, 8443, 3389], UDP: [53, 123, 514, 161, 500] };
    const tcpFlags = ['ACK', 'PSH ACK', 'SYN-ACK', 'FIN ACK'];
    const modbusFC = [['Read Coils', 'FC=01'], ['Read Holding Regs', 'FC=03'], ['Write Single Reg', 'FC=06']];
    const mfc = modbusFC[Math.floor(Math.random() * modbusFC.length)];
    const bgpTypes = ['KEEPALIVE', 'UPDATE', 'OPEN'];
    const bgpType = bgpTypes[Math.floor(Math.random() * bgpTypes.length)];
    const httpLines = ['GET / HTTP/1.1', 'GET /api/v1/status HTTP/1.1', 'POST /login HTTP/1.1', 'HTTP/1.1 200 OK', 'HTTP/1.1 404 Not Found'];
    const tlsTypes = ['Client Hello', 'Server Hello', 'Application Data', 'Certificate'];

    const dnp3Funcs = [['Read', '0x01'], ['Write', '0x02'], ['Direct Operate', '0x03'], ['Unsolicited Response', '0x82']];
    const dnp3fc = dnp3Funcs[Math.floor(Math.random() * dnp3Funcs.length)];
    const cipServices = [['Get_Attribute_Single', '0x0E'], ['Set_Attribute_Single', '0x10'], ['Read', '0x4C'], ['Write', '0x4D']];
    const cipSvc = cipServices[Math.floor(Math.random() * cipServices.length)];
    const opcUaMethods = ['ReadRequest', 'ReadResponse', 'WriteRequest', 'SubscribeRequest', 'PublishResponse'];
    const opcMethod = opcUaMethods[Math.floor(Math.random() * opcUaMethods.length)];

    const infoMap = {
      TCP:    `${srcIP}:${20000 + Math.floor(Math.random()*40000)} → ${dstIP}:${dstPorts.TCP[Math.floor(Math.random()*dstPorts.TCP.length)]} [${tcpFlags[Math.floor(Math.random()*tcpFlags.length)]}] Len=${Math.floor(Math.random()*1460)}`,
      UDP:    `${srcIP}:${20000 + Math.floor(Math.random()*40000)} → ${dstIP}:${dstPorts.UDP[Math.floor(Math.random()*dstPorts.UDP.length)]} Len=${Math.floor(Math.random()*512)}`,
      ICMP:   `Echo (ping) request id=0x${Math.floor(Math.random()*65536).toString(16).padStart(4,'0')} seq=${Math.floor(Math.random()*100)} TTL=${[64,128,255][Math.floor(Math.random()*3)]}`,
      OSPF:   `Hello Packet RouterID=${srcIP} AreaID=0.0.0.0 NetworkMask=255.255.255.252 Interval=10 Dead=40`,
      ARP:    `Who has ${dstIP}? Tell ${srcIP}`,
      MODBUS: `${mfc[0]} ${mfc[1]} Unit=01 Ref=0x${Math.floor(Math.random()*0xFFFF).toString(16).padStart(4,'0')} Cnt=${1+Math.floor(Math.random()*10)}`,
      DHCP:   `DHCP ${['Discover','Request','ACK'][Math.floor(Math.random()*3)]} XID=0x${Math.floor(Math.random()*0xFFFF).toString(16).padStart(4,'0')} → 255.255.255.255`,
      BGP:    `${bgpType} AS${asnOf(src)} → AS${asnOf(dst)}${bgpType==='UPDATE' ? ` NLRI=${srcIP.split('.').slice(0,3).join('.')}.0/24 NextHop=${srcIP}` : ' HoldTime=90'}`,
      TLS:    `TLSv1.3 ${tlsTypes[Math.floor(Math.random()*tlsTypes.length)]} ${srcIP}:${20000+Math.floor(Math.random()*40000)} → ${dstIP}:443`,
      HTTP:   `${httpLines[Math.floor(Math.random()*httpLines.length)]} Host: ${dstIP}`,
      DNP3:   `${dnp3fc[0]} FC=${dnp3fc[1]} Src=0x${Math.floor(Math.random()*0xFF).toString(16).padStart(2,'0')} Dst=0x${Math.floor(Math.random()*0xFF).toString(16).padStart(2,'0')} Obj=30v1 (Analog Input)`,
      'EtherNet/IP': `CIP ${cipSvc[0]} Service=${cipSvc[1]} ConnID=0x${Math.floor(Math.random()*0xFFFF).toString(16).padStart(4,'0')} OriginatorPort=44818`,
      'OPC-UA': `${opcMethod} SecChannel=0x${Math.floor(Math.random()*0xFFFF).toString(16).padStart(4,'0')} RequestID=${Math.floor(Math.random()*10000)}`,
      'IEC 61850': `GOOSE AppID=0x${Math.floor(Math.random()*0xFFFF).toString(16).padStart(4,'0')} DataSet=LLN0$GO$gcb${Math.floor(Math.random()*4)} StNum=${Math.floor(Math.random()*100)} SqNum=${Math.floor(Math.random()*1000)} Test=${Math.random()<0.1?'TRUE':'FALSE'}`,
    };

    info = info || infoMap[proto] || 'Data';
    len = len || this._wsProtoLen(proto);

    this.state.counter++;
    return {
      no: this.state.counter,
      time: (performance.now() / 1000).toFixed(6),
      src: srcIP,
      dst: dstIP,
      proto,
      len,
      info,
      isThreat,
      srcNode: src,
      dstNode: dst,
      rawHex: this._wsGenHex(len)
    };
  }

  _wsGenHex(len) {
    const bytes = [];
    for (let i = 0; i < Math.min(len, 48); i++) bytes.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
    return bytes;
  }

  _wsToggleCapture() {
    const btn = document.getElementById('wsBtnCapture');
    const badge = document.getElementById('wsCapturingBadge');
    if (this.state.capturing) {
      this._wsStopCapture();
      btn.textContent = '▶ CAPTURE';
      btn.style.color = '#22c55e';
      btn.style.borderColor = '#22c55e';
      badge.classList.add('hidden');
    } else {
      this.state.capturing = true;
      btn.textContent = '⏹ STOP';
      btn.style.color = '#ef4444';
      btn.style.borderColor = '#ef4444';
      badge.classList.remove('hidden');
      this.state.interval = setInterval(() => {
        if (!this.app.isPlaying) return;
        const count = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          const pkt = this._wsGeneratePacket();
          if (pkt) this.state.packets.push(pkt);
        }
        if (this.state.packets.length > 2000) this.state.packets = this.state.packets.slice(-2000);
        this._wsApplyFilter();
        const container = document.getElementById('wsPacketListContainer');
        if (container) container.scrollTop = container.scrollHeight;
      }, 350);
    }
  }

  _wsStopCapture() {
    if (this.state?.interval) { clearInterval(this.state.interval); this.state.interval = null; }
    if (this.state) this.state.capturing = false;
  }

  _wsApplyFilter() {
    const ft = this.state.filterText;
    const activeProto = [...this.state.activeProtocols];
    this.state.filtered = this.state.packets.filter(p => {
      if (activeProto.length && !activeProto.includes(p.proto)) return false;
      if (!ft) return true;
      return p.src.includes(ft) || p.dst.includes(ft) || p.proto.toLowerCase().includes(ft) || p.info.toLowerCase().includes(ft);
    });
    this._wsRenderList();
    this._wsUpdateStatus();
  }

  _wsRenderList() {
    const tbody = document.getElementById('wsPacketListBody');
    if (!tbody) return;
    const start = Math.max(0, this.state.filtered.length - 200);
    const visible = this.state.filtered.slice(start);
    const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    tbody.innerHTML = visible.map((p, i) => {
      const color = this._wsProtoColor(p.proto);
      const bg = p.isThreat ? 'background:rgba(239,68,68,0.08);' : '';
      return `<tr data-idx="${start + i}" style="cursor:pointer;${bg}border-bottom:1px solid rgba(30,41,59,0.5);" onmouseover="this.style.background='rgba(68,119,212,0.08)'" onmouseout="this.style.background='${p.isThreat ? 'rgba(239,68,68,0.08)' : ''}'">
        <td style="padding:3px 8px;color:#475569;">${p.no}</td>
        <td style="padding:3px 8px;color:#64748b;">${p.time}</td>
        <td style="padding:3px 8px;">${esc(p.src)}</td>
        <td style="padding:3px 8px;">${esc(p.dst)}</td>
        <td style="padding:3px 8px;"><span style="background:${color}22;color:${color};border:1px solid ${color}44;border-radius:3px;padding:1px 5px;font-size:0.58rem;font-weight:700;">${p.proto}</span></td>
        <td style="padding:3px 8px;color:#64748b;">${p.len}</td>
        <td style="padding:3px 8px;color:${p.isThreat ? '#ef4444' : '#94a3b8'};max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.info)}</td>
      </tr>`;
    }).join('');
  }

  _wsUpdateStatus() {
    const pkts = document.getElementById('wsStatusPackets');
    const filt = document.getElementById('wsStatusFiltered');
    if (pkts) pkts.textContent = `Packets: ${this.state.packets.length}`;
    if (filt) filt.textContent = `Displayed: ${this.state.filtered.length}`;
  }

  _wsRebuildFilters() {
    const container = document.getElementById('wsFilters');
    if (!container) return;
    const protos = ['TCP', 'UDP', 'ICMP', 'TLS', 'HTTP', 'OSPF', 'BGP', 'ARP', 'MODBUS', 'DHCP', 'DNP3', 'EtherNet/IP', 'OPC-UA', 'IEC 61850'];
    container.innerHTML = protos.map(p => {
      const color = this._wsProtoColor(p);
      return `<button onclick="window.appInstance.ws._wsToggleProto('${p}')" id="wsProto_${p}" style="padding:2px 7px;font-size:0.58rem;font-weight:700;border-radius:3px;border:1px solid ${color}44;background:${color}11;color:${color};cursor:pointer;">${p}</button>`;
    }).join('');
  }

  _wsToggleProto(proto) {
    if (this.state.activeProtocols.has(proto)) {
      this.state.activeProtocols.delete(proto);
      const btn = document.getElementById(`wsProto_${proto}`);
      if (btn) btn.style.opacity = '1';
    } else {
      this.state.activeProtocols.add(proto);
      const btn = document.getElementById(`wsProto_${proto}`);
      if (btn) { btn.style.opacity = '1'; btn.style.boxShadow = `0 0 6px ${this._wsProtoColor(proto)}66`; }
    }
    this._wsApplyFilter();
  }

  _wsDecodePacket(p) {
    if (!p) return;
    const tree = document.getElementById('wsDecodeTree');
    const hex  = document.getElementById('wsHexDump');
    if (!tree || !hex) return;

    const _esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const safeSrc = _esc(p.src);
    const safeDst = _esc(p.dst);

    // Stable random values seeded per packet number to prevent re-randomizing on every render
    const seed = p.no * 1013;
    const rnd  = (n) => Math.floor((seed * (n + 7) * 2654435761 >>> 0) % n);
    const srcMac = `00:50:56:84:a6:${rnd(256).toString(16).padStart(2,'0')}`;
    const dstMac = `00:50:56:c0:00:08`;
    const srcPort = 20000 + rnd(40000);
    const ttl = [64, 128, 255][rnd(3)];

    // Unique ID namespace per packet so collapsible state doesn't bleed between packets
    const uid = `wsd_${p.no}`;
    let secIdx = 0;

    // Build a collapsible tree section — clicking the header toggles the child panel
    const section = (color, label, summary, fields, startOpen = false) => {
      const id = `${uid}_s${secIdx++}`;
      return `<div style="margin-bottom:3px;">
        <div onclick="(function(el){const c=document.getElementById('${id}');const open=c.style.display!=='none';c.style.display=open?'none':'block';el.querySelector('.wst').textContent=open?'▶':'▼';})(this)"
             style="display:flex;align-items:baseline;gap:5px;padding:2px 4px;border-radius:3px;cursor:pointer;user-select:none;"
             onmouseover="this.style.background='rgba(68,119,212,0.07)'" onmouseout="this.style.background=''">
          <span class="wst" style="color:${color};font-size:0.68rem;width:9px;flex-shrink:0;">${startOpen ? '▼' : '▶'}</span>
          <span style="color:${color};font-weight:700;">${label}</span>
          <span style="color:#475569;font-size:0.6rem;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">${summary}</span>
        </div>
        <div id="${id}" style="display:${startOpen ? 'block' : 'none'};padding-left:14px;margin-top:1px;border-left:1px solid rgba(68,119,212,0.13);">
          ${fields}
        </div>
      </div>`;
    };

    const field = (k, v, vc = '#94a3b8') =>
      `<div style="display:flex;gap:8px;font-size:0.63rem;padding:1px 0;line-height:1.4;">
         <span style="color:#475569;min-width:130px;flex-shrink:0;">${k}:</span>
         <span style="color:${vc};font-family:var(--font-mono);">${v}</span>
       </div>`;

    const isArp = p.proto === 'ARP';
    const isGoose = p.proto === 'IEC 61850';
    const protoToIpNum = { TCP:6, UDP:17, ICMP:1, OSPF:89, TLS:6, HTTP:6, BGP:6, MODBUS:6, DHCP:17, DNP3:6, 'EtherNet/IP':6, 'OPC-UA':6, 'IEC 61850':0 };

    // ── Ethernet II layer ─────────────────────────────────────────────────────
    const ethType = isArp ? 'ARP (0x0806)' : isGoose ? 'IEC 61850 GOOSE (0x88B8)' : 'IPv4 (0x0800)';
    const ethFields = field('Destination', isGoose ? '01:0C:CD:01:00:01' : dstMac) + field('Source', srcMac) + field('Type', ethType);

    // ── Network layer ─────────────────────────────────────────────────────────
    let netSection;
    if (isGoose) {
      netSection = ''; // GOOSE has no IP layer — Ethernet multicast direct
    } else if (isArp) {
      const arpFields =
        field('Hardware type', 'Ethernet (1)') +
        field('Protocol type', 'IPv4 (0x0800)') +
        field('Hardware size', '6') + field('Protocol size', '4') +
        field('Opcode', '1 (request)') +
        field('Sender MAC', srcMac) + field('Sender IP', safeSrc) +
        field('Target MAC', '00:00:00:00:00:00') + field('Target IP', safeDst);
      netSection = section('#84cc16', 'Address Resolution Protocol (request)', `Who has ${safeDst}? Tell ${safeSrc}`, arpFields, true);
    } else {
      const ipFields =
        field('Version', '4') + field('Header Length', '20 bytes') +
        field('DSCP', '0x00 (CS0 / Default)') +
        field('Total Length', String(p.len)) +
        field('Identification', `0x${rnd(65535).toString(16).padStart(4,'0')}`) +
        field('Time to Live', String(ttl)) +
        field('Protocol', `${Object.keys(protoToIpNum).find(k => k === p.proto) || p.proto} (${protoToIpNum[p.proto] || '?'})`) +
        field('Header Checksum', `0x${rnd(65535).toString(16).padStart(4,'0')}`) +
        field('Source', safeSrc) + field('Destination', safeDst);
      netSection = section('#6b9fe4', 'Internet Protocol Version 4', `Src: ${safeSrc}  Dst: ${safeDst}`, ipFields, true);
    }

    // ── Transport / Application layer ─────────────────────────────────────────
    let transportSection = '';
    const protoColor = this._wsProtoColor(p.proto);
    const dstPortMap  = { TCP:[80,443,22,8080,3389], UDP:[53,123,514,161], TLS:[443], HTTP:[80,8080], BGP:[179], MODBUS:[502], DHCP:[67], ICMP:[], OSPF:[], ARP:[], DNP3:[20000], 'EtherNet/IP':[44818], 'OPC-UA':[4840], 'IEC 61850':[] };
    const dstPortPool = dstPortMap[p.proto] || [0];
    const dstPort = dstPortPool[rnd(dstPortPool.length)] || 0;

    if (p.proto === 'MODBUS') {
      const fc = p.isThreat ? 'Write Single Coil (6)' : 'Read Holding Registers (3)';
      const ref = p.isThreat ? '0x7530 (30000)' : '0x9C41 (40001)';
      const val = p.isThreat
        ? `<span style="color:#ef4444;font-family:var(--font-mono);">0xFF00 [FORCE OPEN — ROGUE]</span>`
        : `<span style="font-family:var(--font-mono);">0x0002 (2 registers)</span>`;
      const mbPduFields = field('Function Code', fc) + field('Reference Number', ref) +
        `<div style="display:flex;gap:8px;font-size:0.63rem;padding:1px 0;"><span style="color:#475569;min-width:130px;flex-shrink:0;">Value:</span>${val}</div>`;
      const tcpFields =
        field('Source Port', String(srcPort)) + field('Destination Port', '502 (Modbus/TCP)') +
        field('Sequence Number', String(rnd(0xFFFFFFFF))) + field('Acknowledgment', String(rnd(0xFFFFFFFF))) +
        field('Flags', '[ACK PSH]') + field('Window Size', '65535') +
        field('Transaction ID', String(p.no)) + field('Protocol ID', '0 (Modbus/TCP)') +
        field('Length', '6 bytes') + field('Unit ID', '1') +
        section('#f59e0b', 'Modbus PDU', fc, mbPduFields, true);
      transportSection = section(protoColor, 'Modbus/TCP', `Port 502  ${p.info.substring(0, 50)}`, tcpFields, true);

    } else if (p.proto === 'OSPF') {
      const ospfFields =
        field('Version', '2') + field('Message Type', '1 (Hello)') +
        field('Packet Length', String(p.len)) + field('Router ID', safeSrc) +
        field('Area ID', '0.0.0.0') + field('Checksum', `0x${rnd(65535).toString(16).padStart(4,'0')}`) +
        field('Auth Type', '0 (None)') + field('Network Mask', '255.255.255.252') +
        field('Hello Interval', '10 seconds') + field('Options', '0x12') +
        field('Router Priority', '1') + field('Dead Interval', '40 seconds') +
        field('Designated Router', safeSrc) + field('Backup DR', '0.0.0.0');
      transportSection = section(protoColor, 'Open Shortest Path First', `Hello  RouterID=${safeSrc}  Area=0.0.0.0`, ospfFields, true);

    } else if (p.proto === 'BGP') {
      const bgpType = p.info.includes('KEEPALIVE') ? '4 (KEEPALIVE)' : p.info.includes('UPDATE') ? '2 (UPDATE)' : '1 (OPEN)';
      const nlriMatch = p.info.match(/NLRI=([^\s]+)/);
      const bgpFields =
        field('Source Port', String(srcPort)) + field('Destination Port', '179 (BGP)') +
        field('Marker', 'ffffffffffffffffffffffffffffffff') +
        field('Length', String(p.len)) + field('Type', bgpType) +
        (nlriMatch ? field('NLRI Prefix', nlriMatch[1]) + field('Next Hop', safeSrc) : '') +
        field('Hold Time', '90 seconds') + field('BGP Identifier', safeSrc);
      transportSection = section(protoColor, 'Border Gateway Protocol', `${bgpType}  ${p.info.substring(0,50)}`, bgpFields, true);

    } else if (p.proto === 'TLS') {
      const contentType = p.info.includes('Application') ? '23 (Application Data)' : '22 (Handshake)';
      const hsType = p.info.includes('Client Hello') ? 'Client Hello (1)' : p.info.includes('Server Hello') ? 'Server Hello (2)' : p.info.includes('Certificate') ? 'Certificate (11)' : 'Encrypted Handshake';
      const tlsFields =
        field('Source Port', String(srcPort)) + field('Destination Port', '443 (HTTPS)') +
        field('Content Type', contentType) + field('Version', '0x0303 (TLS 1.2 record layer)') +
        field('Length', String(p.len)) + field('Handshake Type', hsType) +
        field('Cipher Suite', 'TLS_AES_256_GCM_SHA384') + field('Compression', 'null');
      transportSection = section(protoColor, 'Transport Layer Security', `TLSv1.3  ${p.info.substring(0,50)}`, tlsFields, true);

    } else if (p.proto === 'HTTP') {
      const httpFields =
        field('Source Port', String(srcPort)) + field('Destination Port', String(dstPort)) +
        field('Request Line', p.info.replace(/</g,'&lt;').replace(/>/g,'&gt;')) +
        field('Host', safeDst) + field('Connection', 'keep-alive') +
        field('Accept-Encoding', 'gzip, deflate, br') + field('User-Agent', 'AETHERIS-NetSim/1.0');
      transportSection = section(protoColor, 'Hypertext Transfer Protocol', p.info.substring(0,50), httpFields, true);

    } else if (p.proto === 'DHCP') {
      const msgType = p.info.includes('Discover') ? '1 (Discover)' : p.info.includes('Request') ? '3 (Request)' : '5 (ACK)';
      const dhcpFields =
        field('Source Port', '68 (DHCP Client)') + field('Destination Port', '67 (DHCP Server)') +
        field('Message Type', msgType) + field('Transaction ID', `0x${rnd(0xFFFF).toString(16).padStart(4,'0')}`) +
        field('Client IP', '0.0.0.0') + field('Your IP', '0.0.0.0') +
        field('Server IP', '0.0.0.0') + field('Client MAC', srcMac);
      transportSection = section(protoColor, 'Dynamic Host Configuration Protocol', `DHCP ${msgType}`, dhcpFields, true);

    } else if (p.proto === 'DNP3') {
      const fcMatch = p.info.match(/FC=(0x[0-9a-f]+)/i);
      const fcVal = fcMatch ? fcMatch[1] : '0x01';
      const fcLabel = fcVal === '0x01' ? 'Read (0x01)' : fcVal === '0x02' ? 'Write (0x02)' : fcVal === '0x03' ? 'Direct Operate (0x03)' : 'Unsolicited Response (0x82)';
      const dnp3Hdr =
        field('Source Port', String(srcPort)) + field('Destination Port', '20000 (DNP3)') +
        field('Start Bytes', '0x0564') +
        field('Length', String(p.len)) +
        field('Control', '0x44 (DIR=1, PRM=1, FIR=1, FIN=1)') +
        field('Destination Address', `0x${rnd(0xFF).toString(16).padStart(2,'0')}`) +
        field('Source Address', `0x${rnd(0xFF).toString(16).padStart(2,'0')}`);
      const dnp3App =
        field('Application Control', '0xC0 (FIR=1, FIN=1, SEQ=0)') +
        field('Function Code', fcLabel) +
        field('Object Header', 'Group=30 Variation=1 (Analog Input 32-bit)') +
        field('Object Count', String(1 + rnd(8))) +
        field('Value', `${Math.floor(Math.random()*65535)} (0x${Math.floor(Math.random()*0xFFFF).toString(16).padStart(4,'0')})`);
      transportSection = section(protoColor, 'Distributed Network Protocol 3 (DNP3)',
        `${fcLabel.split('(')[0].trim()}  Src=0x${rnd(0xFF).toString(16).padStart(2,'0')} Dst=0x${rnd(0xFF).toString(16).padStart(2,'0')}`,
        dnp3Hdr + section('#fb923c', 'DNP3 Application Layer', fcLabel, dnp3App, true), true);

    } else if (p.proto === 'EtherNet/IP') {
      const svcMatch = p.info.match(/Service=(0x[0-9a-f]+)/i);
      const svcVal = svcMatch ? svcMatch[1] : '0x0E';
      const svcLabel = svcVal === '0x0E' ? 'Get_Attribute_Single' : svcVal === '0x10' ? 'Set_Attribute_Single' : svcVal === '0x4C' ? 'Read' : 'Write';
      const enipHdr =
        field('Source Port', String(srcPort)) + field('Destination Port', '44818 (EtherNet/IP)') +
        field('Command', '0x0065 (Register Session)') +
        field('Length', String(p.len)) +
        field('Session Handle', `0x${rnd(0xFFFFFFFF).toString(16).padStart(8,'0')}`) +
        field('Status', '0x00000000 (Success)') +
        field('Sender Context', `0x${rnd(0xFFFF).toString(16).padStart(4,'0')}`);
      const cipPdu =
        field('Service', `0x${svcVal.replace('0x','')} (${svcLabel})`) +
        field('Request Path Size', '2 words') +
        field('Request Path', '20 04 24 01 (Class=0x04, Instance=1)') +
        field('Attribute ID', `0x${rnd(0x20).toString(16).padStart(2,'0')}`) +
        field('Data Length', String(4 + rnd(12))) +
        field('Data', `0x${rnd(0xFFFFFFFF).toString(16).padStart(8,'0')}`);
      transportSection = section(protoColor, 'EtherNet/IP (CIP)',
        `CIP ${svcLabel}  Port=44818`,
        enipHdr + section('#e879f9', 'Common Industrial Protocol (CIP)', `${svcLabel} Service`, cipPdu, true), true);

    } else if (p.proto === 'IEC 61850') {
      // GOOSE is Ethertype 0x88B8 — multicast, no IP layer
      const appIdMatch = p.info.match(/AppID=0x([0-9a-f]+)/i);
      const appId = appIdMatch ? appIdMatch[1] : rnd(0xFFFF).toString(16).padStart(4,'0');
      const stNum = rnd(100);
      const sqNum = rnd(1000);
      const isTest = Math.random() < 0.1;
      const gooseEth =
        field('Destination', '01:0C:CD:01:00:01 (GOOSE Multicast)') +
        field('Source', srcMac) +
        field('Type', '0x88B8 (IEC 61850 GOOSE)');
      const goosePdu =
        field('AppID', `0x${appId}`) +
        field('Length', String(p.len)) +
        field('Reserved1', '0x0000') + field('Reserved2', '0x0000') +
        field('GoCBRef', `LLN0$GO$gcb${rnd(4)}`) +
        field('TimeAllowedToLive', '2000 ms') +
        field('DataSet', `LLN0$GO$dataSet${rnd(4)}`) +
        field('GoID', `GOOSE_${safeSrc.replace(/\./g,'_')}`) +
        field('T (Timestamp)', new Date().toISOString()) +
        field('StNum (State Number)', String(stNum)) +
        field('SqNum (Sequence Number)', String(sqNum)) +
        field('Test', isTest ? '<span style="color:#ef4444;font-weight:700;">TRUE — TEST MESSAGE</span>' : 'FALSE') +
        field('ConfRev', '1') +
        field('NdsCom', 'FALSE') +
        field('NumDatSetEntries', String(2 + rnd(6))) +
        field('Data Entry[0]', `boolean: ${Math.random() < 0.5 ? 'TRUE' : 'FALSE'}`) +
        field('Data Entry[1]', `float32: ${(Math.random() * 100).toFixed(3)}`);
      transportSection = section(protoColor, 'IEC 61850 / GOOSE',
        `AppID=0x${appId}  StNum=${stNum}  SqNum=${sqNum}${isTest ? '  [TEST]' : ''}`,
        gooseEth + section('#38bdf8', 'Generic Object Oriented Substation Events (GOOSE)', `StNum=${stNum}`, goosePdu, true), true);

    } else if (p.proto === 'OPC-UA') {
      const isMsgRead = p.info.includes('Read');
      const msgType = p.info.includes('Request') ? 'MSG' : 'MSG';
      const opcFields =
        field('Source Port', String(srcPort)) + field('Destination Port', '4840 (OPC-UA)') +
        field('Message Type', isMsgRead ? 'ReadRequest (0x0277)' : 'WriteRequest (0x0279)') +
        field('Chunk Type', 'F (Final)') +
        field('Message Size', String(p.len)) +
        field('Secure Channel ID', `0x${rnd(0xFFFF).toString(16).padStart(4,'0')}`) +
        field('Security Token ID', `0x${rnd(0xFFFF).toString(16).padStart(4,'0')}`) +
        field('Sequence Number', String(rnd(0xFFFFFF))) +
        field('Request ID', String(rnd(10000))) +
        field('Node ID (Class)', 'ns=2;s=PLC.AnalogInput.Value') +
        field('Attribute ID', 'Value (13)') +
        field('Value', `${(Math.random() * 100).toFixed(3)} (Double)`) +
        field('Source Timestamp', new Date().toISOString());
      transportSection = section(protoColor, 'OPC Unified Architecture', `${p.info.split(' ')[0]}  SecChannel`, opcFields, true);

    } else if (p.proto === 'ICMP') {
      const icmpFields =
        field('Type', '8 (Echo Request)') + field('Code', '0') +
        field('Checksum', `0x${rnd(65535).toString(16).padStart(4,'0')}`) +
        field('Identifier', `0x${rnd(65535).toString(16).padStart(4,'0')}`) +
        field('Sequence Number', String(rnd(100))) +
        field('Data Length', String(Math.max(0, p.len - 28)));
      transportSection = section(protoColor, 'Internet Control Message Protocol', `Echo Request  ${safeSrc} → ${safeDst}`, icmpFields, true);

    } else if (p.proto === 'UDP') {
      const udpFields =
        field('Source Port', String(srcPort)) + field('Destination Port', String(dstPort)) +
        field('Length', String(p.len)) + field('Checksum', `0x${rnd(65535).toString(16).padStart(4,'0')}`);
      transportSection = section(protoColor, 'User Datagram Protocol', `Src Port: ${srcPort}  Dst Port: ${dstPort}`, udpFields, true);

    } else if (!isArp) {
      // TCP (default, covers TCP/HTTP/BGP without explicit handler above)
      const tcpFlags = p.isThreat ? '[SYN]' : ['[ACK]','[PSH, ACK]','[SYN, ACK]','[FIN, ACK]'][rnd(4)];
      const tcpFields =
        field('Source Port', String(srcPort)) + field('Destination Port', String(dstPort)) +
        field('Sequence Number', String(rnd(0xFFFFFFFF))) +
        field('Acknowledgment Number', String(rnd(0xFFFFFFFF))) +
        field('Header Length', '20 bytes') + field('Flags', tcpFlags) +
        field('Window Size', '65535') + field('Checksum', `0x${rnd(65535).toString(16).padStart(4,'0')}`) +
        field('Urgent Pointer', '0') + field('Payload Length', String(Math.max(0, p.len - 54)));
      transportSection = section(protoColor, 'Transmission Control Protocol', `Src Port: ${srcPort}  Dst Port: ${dstPort}  ${tcpFlags}`, tcpFields, true);
    }

    // ── Assemble tree ─────────────────────────────────────────────────────────
    tree.innerHTML = `
      <div style="color:#6b9fe4;font-weight:700;margin-bottom:8px;font-family:var(--font-mono);font-size:0.68rem;">
        Frame ${p.no}: ${p.len} bytes on wire
      </div>
      <div style="font-size:0.63rem;font-family:var(--font-mono);">
        ${section('#64748b', 'Ethernet II', `Src: ${srcMac}  Dst: ${dstMac}`, ethFields)}
        ${isArp ? netSection : netSection}
        ${transportSection}
        <div style="margin-top:8px;padding:4px 8px;border-radius:4px;
                    background:${p.isThreat ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.08)'};
                    color:${p.isThreat ? '#ef4444' : '#10b981'};font-weight:700;font-size:0.63rem;">
          ${p.isThreat ? '⚠ THREAT SIGNATURE DETECTED' : '✓ Benign traffic'}
        </div>
      </div>`;

    // ── Hex dump ──────────────────────────────────────────────────────────────
    const hexRows = [];
    const bytes = p.rawHex;
    for (let i = 0; i < bytes.length; i += 16) {
      const chunk   = bytes.slice(i, i + 16);
      const offset  = i.toString(16).padStart(4, '0');
      const hexPart = chunk.join(' ').padEnd(47, ' ');
      const ascii   = chunk.map(b => { const c = parseInt(b, 16); if (c < 32 || c >= 127) return '.'; const ch = String.fromCharCode(c); return ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch; }).join('');
      hexRows.push(`<div style="display:flex;gap:12px;"><span style="color:#475569;">${offset}</span><span style="color:#34d399;">${hexPart}</span><span style="color:#64748b;">${ascii}</span></div>`);
    }
    hex.innerHTML = `<div style="font-size:0.58rem;line-height:1.6;font-family:var(--font-mono);">${hexRows.join('')}</div>`;
  }

  _wsExport() {
    const lines = ['No.,Time,Source,Destination,Protocol,Length,Info'];
    this.state.filtered.forEach(p => {
      lines.push(`${p.no},${p.time},${p.src},${p.dst},${p.proto},${p.len},"${p.info}"`);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `aetheris_capture_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.app.showToast('Packet capture exported as CSV.', 'success');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FEATURE 2: CANVAS PNG EXPORT
  // ═══════════════════════════════════════════════════════════════════════
}
