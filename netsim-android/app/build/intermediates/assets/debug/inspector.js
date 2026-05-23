class DeviceInspector {
  constructor(app) {
    this.app = app;
  }

  openNote(node) {
    const existing = document.getElementById('noteEditorModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'noteEditorModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:28000;backdrop-filter:blur(6px);';
    modal.innerHTML = `
      <div class="dark-window" style="width:360px;border:1px solid rgba(68,119,212,0.32);">
        <div class="window-header" style="background:linear-gradient(90deg,#06111f,rgba(68,119,212,0.16));">
          <span class="window-title">📝 NODE NOTE — ${this.app.escapeHtml(node.name)}</span>
          <button id="noteCloseBtn" class="cyber-btn" style="padding:2px 8px;font-size:0.7rem;border-color:var(--brand-blue);color:var(--brand-blue);">✕</button>
        </div>
        <div style="padding:14px;display:flex;flex-direction:column;gap:10px;">
          <textarea id="noteTextarea" rows="5" placeholder="Enter engineering note, anomaly observation, or configuration remark..." style="width:100%;background:rgba(15,23,42,0.8);border:1px solid rgba(68,119,212,0.25);border-radius:6px;padding:8px;color:#f8fafc;font-size:0.75rem;font-family:var(--font-mono);resize:vertical;outline:none;">${this.app.escapeHtml(node.note || '')}</textarea>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="noteClearBtn" class="cyber-btn" style="padding:4px 10px;font-size:0.7rem;border-color:#ef4444;color:#ef4444;">Clear</button>
            <button id="noteSaveBtn" class="cyber-btn" style="padding:4px 12px;font-size:0.7rem;border-color:var(--brand-blue);color:var(--brand-blue);">Save Note</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('noteCloseBtn').onclick = () => modal.remove();
    document.getElementById('noteClearBtn').onclick = () => {
      node.note = ''; modal.remove();
      this.app.showToast('Note cleared.', 'info');
      this.app.saveState();
      this.app.canvas.draw();
    };
    document.getElementById('noteSaveBtn').onclick = () => {
      node.note = document.getElementById('noteTextarea').value;
      modal.remove();
      this.app.showToast(`Note saved for ${node.name}.`, 'success');
      this.app.saveState();
      this.app.canvas.draw();
    };
  }


  openPhysical(node) {
    const modal = document.getElementById('physicalInspectorModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    document.getElementById('physNodeTitle').textContent = `🔬 ${node.name} — Physical Inspector`;
    const statusEl = document.getElementById('physDeviceStatus');
    const statusMap = { stable: '● ONLINE', compromised: '⚠ COMPROMISED', isolated: '◉ ISOLATED' };
    statusEl.textContent = statusMap[node.status] || '● ONLINE';
    statusEl.style.color = node.status === 'compromised' ? '#ef4444' : node.status === 'isolated' ? '#f59e0b' : '#22c55e';

    // Device info grid
    const infoEl = document.getElementById('physDeviceInfo');
    const roleIcon = { Router:'🖧', Switch:'⊞', Firewall:'🔥', 'Modbus PLC':'🤖', 'SCADA HMI':'📺', Workstation:'🖥️', 'AD Server':'📁', 'IPS Sensor':'🔎', 'Packet Tap':'🦈' };
    infoEl.innerHTML = [
      ['Device ID', node.id],
      ['Hostname', node.name],
      ['IP Address', node.ip],
      ['Role', `${roleIcon[node.role] || '📦'} ${node.role}`],
      ['OS / Platform', node.os || '—'],
      ['Firmware', node.firmware || '—'],
      ['Segment', node.type?.toUpperCase() || '—'],
      ['Status', node.status?.toUpperCase() || 'STABLE']
    ].map(([k,v]) => `
      <div style="display:flex;flex-direction:column;gap:2px;">
        <span style="font-size:0.55rem;color:#475569;font-weight:700;letter-spacing:0.05em;">${k}</span>
        <span style="font-size:0.72rem;color:#f8fafc;">${this.app.escapeHtml(String(v))}</span>
      </div>
    `).join('');

    // Live telemetry gauges
    const gaugesEl = document.getElementById('physTelemetryGauges');
    const cpu   = 15 + Math.floor(Math.random() * 60);
    const mem   = 20 + Math.floor(Math.random() * 70);
    const temp  = 35 + Math.floor(Math.random() * 40);
    const uptime= `${Math.floor(Math.random()*100)}d ${Math.floor(Math.random()*24)}h`;
    const gauge = (label, val, max, unit, color) => `
      <div style="display:flex;flex-direction:column;gap:4px;">
        <div style="display:flex;justify-content:space-between;font-size:0.6rem;">
          <span style="color:#64748b;">${label}</span>
          <span style="color:${color};font-family:var(--font-mono);">${val}${unit}</span>
        </div>
        <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;">
          <div style="height:100%;width:${(val/max)*100}%;background:${color};border-radius:2px;"></div>
        </div>
      </div>
    `;
    gaugesEl.innerHTML =
      gauge('CPU LOAD', cpu, 100, '%', cpu > 70 ? '#ef4444' : '#10b981') +
      gauge('MEMORY', mem, 100, '%', mem > 80 ? '#f59e0b' : '#3b82f6') +
      gauge('TEMP', temp, 90, '°C', temp > 75 ? '#ef4444' : '#06b6d4') +
      `<div style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:0.6rem;color:#64748b;">UPTIME</span><span style="font-size:0.72rem;color:#f8fafc;font-family:var(--font-mono);">${uptime}</span></div>`;

    // Interface table
    const config = this.app.getNodeConfig(node);
    const ifaceEl = document.getElementById('physInterfaceTable');
    const _e = (s) => this.app.escapeHtml(String(s));
    ifaceEl.innerHTML = Object.keys(config.interfaces).map((ifName, i) => {
      const iface = config.interfaces[ifName];
      const up = !iface.shutdown;
      const speed = ['1000Base-T','10GBase-T','FastEthernet'][i % 3];
      return `<div style="display:grid;grid-template-columns:auto 1fr auto auto;gap:8px;padding:3px 0;border-bottom:1px solid rgba(30,41,59,0.5);align-items:center;">
        <span style="color:${up ? '#22c55e' : '#ef4444'};font-size:0.7rem;">●</span>
        <span>${_e(ifName)}</span>
        <span style="color:#64748b;font-size:0.62rem;">${_e(iface.ip)}</span>
        <span style="color:#475569;font-size:0.6rem;">${speed}</span>
      </div>`;
    }).join('');

    // Protocol stack
    const protoEl = document.getElementById('physProtocolStack');
    const protocols = this._getNodeProtocols(node);
    protoEl.innerHTML = protocols.map(p => {
      const colors = { 'OSPF':'#06b6d4','BGP':'#f97316','MODBUS':'#f59e0b','SSH':'#10b981','SNMP':'#8b5cf6','HTTPS':'#3b82f6','ARP':'#84cc16','DHCP':'#ec4899','DNP3':'#f59e0b','EtherNet/IP':'#f97316','OPC-UA':'#a78bfa','OPC-DA':'#a78bfa','RDP':'#ef4444','IEC 61850':'#06b6d4' };
      const c = colors[p] || '#64748b';
      return `<span style="padding:2px 7px;font-size:0.6rem;font-weight:700;border-radius:3px;border:1px solid ${c}44;background:${c}11;color:${c};">${p}</span>`;
    }).join('');

    // CVE vulnerability advisory
    const cveEl = document.getElementById('physCveList');
    if (cveEl) {
      const cves = this._getNodeCVEs(node);
      if (cves.length === 0) {
        cveEl.innerHTML = `<span style="font-size:0.65rem;color:var(--success-green);">No known critical CVEs for this firmware version.</span>`;
      } else {
        cveEl.innerHTML = cves.map(c => `
          <div style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:start;padding:5px 0;border-bottom:1px solid rgba(248,81,73,0.12);">
            <span style="font-family:var(--font-mono);font-size:0.62rem;font-weight:700;color:var(--danger-red);white-space:nowrap;">${this.app.escapeHtml(c.id)}</span>
            <span style="font-size:0.62rem;color:var(--text-secondary);">${this.app.escapeHtml(c.desc)}</span>
            <span style="font-size:0.6rem;font-weight:700;padding:1px 5px;border-radius:3px;white-space:nowrap;${c.cvss >= 9 ? 'background:rgba(248,81,73,0.15);color:#f85149;' : c.cvss >= 7 ? 'background:rgba(210,153,34,0.15);color:#d29922;' : 'background:rgba(99,102,241,0.15);color:#818cf8;'}">CVSS ${c.cvss}</span>
          </div>
        `).join('');
      }
    }

    // Draw chassis
    this._drawChassis(node);

    document.getElementById('physCloseBtn').onclick = () => modal.classList.add('hidden');
    const locateBtn = document.getElementById('physLocateBtn');
    if (locateBtn) {
      locateBtn.onclick = () => {
        modal.classList.add('hidden');
        this.app.animateCameraToNode(node.id);
      };
    }
  }

  _getNodeCVEs(node) {
    const role = (node.role || '').toLowerCase();
    const os   = (node.os   || '').toLowerCase();
    if (role.includes('plc') || role.includes('rtu') || role.includes('sis')) {
      return [
        { id: 'CVE-2019-13945', cvss: 9.8, desc: 'Siemens S7 PLC: unauthenticated remote code execution via PROFINET DCP' },
        { id: 'CVE-2021-37172', cvss: 7.5, desc: 'Rockwell Logix: denial of service via malformed EtherNet/IP packet' },
        { id: 'CVE-2022-34151', cvss: 8.1, desc: 'Modbus TCP: no authentication — arbitrary coil write from any host' },
      ];
    }
    if (role.includes('dcs')) {
      return [
        { id: 'CVE-2020-25815', cvss: 9.1, desc: 'Emerson DeltaV: hardcoded credentials in DeltaV admin interface' },
        { id: 'CVE-2021-44228', cvss: 10.0, desc: 'Log4Shell: remote code execution via JNDI in DeltaV logging component' },
      ];
    }
    if (role.includes('historian')) {
      return [
        { id: 'CVE-2023-31070', cvss: 8.8, desc: 'OSIsoft PI Server: authenticated RCE via crafted PI message' },
        { id: 'CVE-2022-26136', cvss: 7.5, desc: 'PI Web API: SSRF allowing internal OT network traversal' },
      ];
    }
    if (role.includes('hmi') || role.includes('scada')) {
      return [
        { id: 'CVE-2021-27041', cvss: 7.8, desc: 'Ignition Gateway: deserialization flaw in project import handler' },
        { id: 'CVE-2020-12542', cvss: 8.8, desc: 'SCADA HMI: path traversal in file download endpoint' },
      ];
    }
    if (role.includes('firewall')) {
      return [
        { id: 'CVE-2024-3400', cvss: 10.0, desc: 'PAN-OS: unauthenticated RCE in GlobalProtect gateway (Palo Alto)' },
        { id: 'CVE-2023-27997', cvss: 9.8, desc: 'FortiOS SSL-VPN: heap buffer overflow — pre-auth RCE' },
      ];
    }
    if (role.includes('router') || role.includes('gateway')) {
      return [
        { id: 'CVE-2023-20198', cvss: 10.0, desc: 'Cisco IOS XE Web UI: unauthenticated privilege escalation to root' },
        { id: 'CVE-2022-20842', cvss: 9.8, desc: 'Cisco RV Series: RCE via malformed HTTP request to management interface' },
      ];
    }
    if (role.includes('workstation') || role.includes('station') || role.includes('engineer')) {
      const osStr = (node.os || '').toLowerCase();
      const isLinux = osStr.includes('linux') || osStr.includes('ubuntu') || osStr.includes('centos') || osStr.includes('debian') || osStr.includes('kali') || osStr.includes('arch') || osStr.includes('fedora');
      if (isLinux) {
        return [
          { id: 'CVE-2022-0847', cvss: 7.8, desc: 'Dirty Pipe: Linux kernel privilege escalation via pipe write (v5.8+)' },
          { id: 'CVE-2021-4034', cvss: 7.8, desc: 'PwnKit: pkexec local privilege escalation in all major Linux distros' },
          { id: 'CVE-2023-0386', cvss: 7.8, desc: 'OverlayFS: unprivileged user LPE via SUID binary mount (kernel <6.2)' },
        ];
      }
      return [
        { id: 'CVE-2022-21999', cvss: 7.8, desc: 'Windows Print Spooler: LPE via crafted driver install (PrintNightmare)' },
        { id: 'CVE-2021-34527', cvss: 8.8, desc: 'Windows RDP: BlueKeep-class vulnerability in Remote Desktop Services' },
        { id: 'CVE-2023-28252', cvss: 7.8, desc: 'Windows CLFS: LPE via kernel driver heap overflow (exploited in-wild)' },
      ];
    }
    return [];
  }

  _getNodeProtocols(node) {
    const role = (node.role || '').toLowerCase();
    if (role.includes('router') || role.includes('gateway')) return ['OSPF', 'BGP', 'ARP', 'DHCP', 'SNMP', 'SSH'];
    if (role.includes('firewall')) return ['OSPF', 'HTTPS', 'SSH', 'SNMP', 'ARP'];
    if (role.includes('plc') || role.includes('rtu') || role.includes('sis')) return ['MODBUS', 'DNP3', 'EtherNet/IP', 'ARP', 'SNMP'];
    if (role.includes('dcs')) return ['OPC-UA', 'MODBUS', 'HTTPS', 'SSH', 'SNMP'];
    if (role.includes('historian')) return ['OPC-DA', 'OPC-UA', 'HTTPS', 'SSH', 'SNMP'];
    if (role.includes('workstation')) return ['RDP', 'SSH', 'HTTPS', 'SNMP', 'ARP'];
    if (role.includes('hmi') || role.includes('scada')) return ['MODBUS', 'OPC-UA', 'HTTPS', 'SSH', 'SNMP'];
    if (role.includes('switch')) return ['ARP', 'OSPF', 'SSH', 'SNMP'];
    if (role.includes('sensor') || role.includes('ips')) return ['OSPF', 'SNMP', 'SSH'];
    return ['ARP', 'DHCP', 'SSH', 'HTTPS'];
  }

  _drawChassis(node) {
    const canvas = document.getElementById('physChassisCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 300, H = 200;
    ctx.clearRect(0, 0, W, H);

    try {
      const role = (node.role || '').toLowerCase();
      const type = (node.type || '').toLowerCase();

    // Helper for circular gauges (used in valves and sensors)
    const drawGauge = (cx, cy, radius, valuePercent, title, unit) => {
      // Outer ring
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Gauge face
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
      ctx.fill();

      // Tick marks
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      for (let angle = Math.PI * 0.75; angle <= Math.PI * 2.25; angle += Math.PI * 0.15) {
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * (radius - 8), cy + Math.sin(angle) * (radius - 8));
        ctx.lineTo(cx + Math.cos(angle) * (radius - 4), cy + Math.sin(angle) * (radius - 4));
        ctx.stroke();
      }

      // Indicator needle
      const targetAngle = Math.PI * 0.75 + (Math.PI * 1.5) * (valuePercent / 100);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(targetAngle) * (radius - 10), cy + Math.sin(targetAngle) * (radius - 10));
      ctx.stroke();

      // Center pin
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();

      // Value label
      ctx.fillStyle = '#6b9fe4';
      ctx.font = 'bold 8px Fira Code, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(title, cx, cy + radius - 12);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '7px Fira Code, monospace';
      ctx.fillText(unit, cx, cy + radius - 4);
      ctx.textAlign = 'left'; // reset
    };

    if (role.includes('plc') || role.includes('controller') || role.includes('rtu')) {
      // ----------------------------------------------------
      // INDUSTRIAL DIN-RAIL MODULAR PLC CHASSIS
      // ----------------------------------------------------
      // Main background
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, W-8, H-8);

      // Aluminum DIN rail behind (top and bottom edges)
      ctx.fillStyle = '#475569';
      ctx.fillRect(10, 8, W-20, 10);
      ctx.fillStyle = '#334155';
      ctx.fillRect(10, 182, W-20, 10);

      // Modular block dividers (3 slots)
      const slotW = 86;
      const slotGap = 6;
      for (let s = 0; s < 3; s++) {
        const sx = 16 + s * (slotW + slotGap);
        const sy = 24;
        const sh = 152;

        // Slot module body
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(sx, sy, slotW, sh);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, sy, slotW, sh);

        // Modular header accent
        const isSis = role.includes('sis');
        ctx.fillStyle = isSis ? '#ea580c' : (s === 0 ? '#0284c7' : s === 1 ? '#059669' : '#d97706');
        ctx.fillRect(sx + 2, sy + 2, slotW - 4, 6);

        if (s === 0) {
          // CPU Module: draw screen
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(sx + 8, sy + 20, slotW - 16, 40);
          ctx.strokeStyle = isSis ? '#f97316' : '#6b9fe4';
          ctx.strokeRect(sx + 8, sy + 20, slotW - 16, 40);

          ctx.fillStyle = isSis ? '#ea580c' : '#22c55e';
          ctx.font = 'bold 7px Fira Code, monospace';
          ctx.fillText(isSis ? "SAFE" : "RUN", sx + 14, sy + 32);
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '6px Fira Code, monospace';
          ctx.fillText(node.id, sx + 14, sy + 44);
          ctx.fillText(isSis ? "SIS ACTIVE" : "MODBUS OK", sx + 14, sy + 52);

          // LED matrix
          for (let l = 0; l < 4; l++) {
            ctx.fillStyle = l === 3 ? (isSis ? '#22c55e' : '#374151') : (isSis ? '#ea580c' : '#22c55e');
            ctx.beginPath();
            ctx.arc(sx + 14 + l * 16, sy + 74, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#64748b';
            ctx.font = '5px Fira Code, monospace';
            ctx.fillText(isSis ? ['PWR','SYS','SIL','ESD'][l] : ['PWR','SYS','RUN','ALM'][l], sx + 8 + l * 16, sy + 84);
          }
        } else {
          // I/O Terminal Modules: draw screw terminals
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(sx + 6, sy + 15, slotW - 12, 122);

          // Terminals grid
          ctx.fillStyle = '#475569';
          for (let r = 0; r < 8; r++) {
            const ty = sy + 22 + r * 14;
            // Left screw terminal
            ctx.fillRect(sx + 12, ty, 10, 8);
            ctx.fillStyle = '#cbd5e1';
            ctx.beginPath();
            ctx.arc(sx + 17, ty + 4, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#475569';

            // Right screw terminal
            ctx.fillRect(sx + slotW - 22, ty, 10, 8);
            ctx.fillStyle = '#cbd5e1';
            ctx.beginPath();
            ctx.arc(sx + slotW - 17, ty + 4, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#475569';

            // IO labels
            ctx.fillStyle = '#64748b';
            ctx.font = '6px Fira Code, monospace';
            ctx.fillText(`I:${r}`, sx + 26, ty + 7);
            ctx.fillText(`O:${r}`, sx + slotW - 40, ty + 7);
          }
        }
      }

      // Brand labels
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 8px Fira Code, monospace';
      ctx.fillText(node.firmware || 'TIA PORTAL v18', 18, 192);

    } else if (role.includes('hmi') || role.includes('scada') || role.includes('workstation') || role.includes('server')) {
      // ----------------------------------------------------
      // DESKTOP HMI PANEL / INDUSTRIAL SERVER CONSOLE
      // ----------------------------------------------------
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, W-8, H-8);

      // Heavy bezel
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(10, 10, W-20, H-35);
      ctx.strokeStyle = '#6b9fe4';
      ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, W-20, H-35);

      // Screen area
      ctx.fillStyle = '#020617';
      ctx.fillRect(15, 15, W-30, H-45);

      // Grid background on the screen
      ctx.strokeStyle = 'rgba(56,189,248,0.06)';
      ctx.lineWidth = 1;
      for (let x = 15; x < W-15; x += 15) {
        ctx.beginPath();
        ctx.moveTo(x, 15);
        ctx.lineTo(x, H-30);
        ctx.stroke();
      }
      for (let y = 15; y < H-30; y += 15) {
        ctx.beginPath();
        ctx.moveTo(15, y);
        ctx.lineTo(W-15, y);
        ctx.stroke();
      }

      if (role.includes('hmi') || role.includes('scada')) {
        // HMI Screen drawing: reactor graphics
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 8px Fira Code, monospace';
        ctx.fillText("IGNITION INDUSTRIAL HMI", 25, 28);
        ctx.fillStyle = '#6b9fe4';
        ctx.fillText("PROCESS: OPERATIONAL", 25, 38);

        // Vessel graphics
        ctx.fillStyle = 'rgba(56,189,248,0.1)';
        ctx.fillRect(35, 60, 50, 70);
        ctx.strokeStyle = '#6b9fe4';
        ctx.strokeRect(35, 60, 50, 70);

        // Water level inside
        ctx.fillStyle = 'rgba(14,165,233,0.4)';
        ctx.fillRect(36, 85, 48, 44);

        // Temperature curve mini-plot
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(130, 95);
        ctx.lineTo(150, 80);
        ctx.lineTo(170, 90);
        ctx.lineTo(190, 70);
        ctx.lineTo(210, 105);
        ctx.lineTo(230, 85);
        ctx.lineTo(250, 90);
        ctx.stroke();

        ctx.strokeStyle = '#6b9fe4';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(130, 110);
        ctx.lineTo(150, 105);
        ctx.lineTo(170, 115);
        ctx.lineTo(190, 100);
        ctx.lineTo(210, 110);
        ctx.lineTo(230, 105);
        ctx.lineTo(250, 112);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = '7px Fira Code, monospace';
        ctx.fillText("TEMP TREND", 130, 58);
        ctx.fillText("PRESS TREND", 130, 130);
      } else {
        // Domain Controller / Server drawing: Command prompt logs
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 8px Fira Code, monospace';
        ctx.fillText("AETHERIS SECURITY SHELL: SECURE", 25, 28);
        
        ctx.fillStyle = '#94a3b8';
        ctx.font = '7px Fira Code, monospace';
        ctx.fillText("root@aetheris-host:~# systemctl status ldap", 25, 45);
        ctx.fillStyle = '#10b981';
        ctx.fillText("● slapd.service - LSB: FreeLDAP directory server", 25, 55);
        ctx.fillText("   Active: active (running) since Fri 2026-05-22", 25, 65);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText("root@aetheris-host:~# tail -n 3 /var/log/auth.log", 25, 80);
        ctx.fillText("May 22 16:34:01 sshd[4201]: Pam_unix(sshd:session) ok", 25, 90);
        ctx.fillText("May 22 16:34:10 sshd[4209]: Accepted publickey for root", 25, 100);
        ctx.fillStyle = '#6b9fe4';
        ctx.fillText("root@aetheris-host:~# _", 25, 115);
      }

      // Bottom bezel menu buttons
      ctx.fillStyle = '#334155';
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(30 + i * 24, H - 20, 14, 6);
      }
      ctx.fillStyle = '#22c55e'; // PWR LED
      ctx.beginPath();
      ctx.arc(W - 25, H - 17, 3, 0, Math.PI * 2);
      ctx.fill();

    } else if (role.includes('actuator') || role.includes('valve') || role.includes('pump') || role.includes('drive')) {
      // ----------------------------------------------------
      // HEAVY PROCESS ACTUATOR / AUTOMATED VALVE / DRIVE
      // ----------------------------------------------------
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, W-8, H-8);

      // Steel pipe running through background
      ctx.fillStyle = '#64748b';
      ctx.fillRect(10, H/2 - 15, W-20, 30);
      ctx.fillStyle = '#475569';
      ctx.fillRect(10, H/2 - 18, W-20, 3);
      ctx.fillRect(10, H/2 + 15, W-20, 3);

      // Heavy pipe flange bolts
      ctx.fillStyle = '#334155';
      ctx.fillRect(60, H/2 - 25, 12, 50);
      ctx.fillRect(W - 72, H/2 - 25, 12, 50);

      // Electric actuator motor housing on top
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(W/2 - 35, 15, 70, H/2 - 15);
      ctx.strokeStyle = '#6b9fe4';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(W/2 - 35, 15, 70, H/2 - 15);

      // Motor cooling fins
      ctx.fillStyle = '#0369a1';
      for (let f = 0; f < 5; f++) {
        ctx.fillRect(W/2 - 30, 24 + f * 10, 60, 4);
      }

      // Valve body enclosure
      ctx.fillStyle = '#d1d5db';
      ctx.beginPath();
      ctx.arc(W/2, H/2, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Mechanical angle needle indicator in valve center
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(W/2, H/2);
      ctx.lineTo(W/2 + 18, H/2 - 10);
      ctx.stroke();

      // Labels
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 8px Fira Code, monospace';
      ctx.fillText(String(node.name || node.id || 'Valve').toUpperCase(), 16, 26);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '7px Fira Code, monospace';
      ctx.fillText("VALVE ANGLE: 45°", 16, 38);
      ctx.fillText("FLOW RATE: 12.4 L/S", 16, 48);

    } else if (role.includes('sensor') || role.includes('meter')) {
      // ----------------------------------------------------
      // INDUSTRIAL TELEMETRY SENSOR / TRANSMITTER
      // ----------------------------------------------------
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, W-8, H-8);

      // Aluminum mounting bracket
      ctx.fillStyle = '#334155';
      ctx.fillRect(W/2 - 40, H - 40, 80, 20);

      // Transmitter circular body
      ctx.fillStyle = '#3b82f6'; // Bright safety blue enclosure
      ctx.beginPath();
      ctx.arc(W/2, H/2 - 10, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Inner LCD window
      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.arc(W/2, H/2 - 10, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.stroke();

      // Backlit screen
      ctx.fillStyle = '#0f766e';
      ctx.fillRect(W/2 - 28, H/2 - 32, 56, 44);

      // Sensor value
      let valueStr = "0.00";
      let unitStr = "UNITS";
      if (node.name.toLowerCase().includes('temp')) {
        valueStr = "42.5";
        unitStr = "DEG C";
      } else if (node.name.toLowerCase().includes('press')) {
        valueStr = "1.22";
        unitStr = "MPA";
      } else if (node.name.toLowerCase().includes('level')) {
        valueStr = "65.8";
        unitStr = "PERCENT";
      } else if (node.name.toLowerCase().includes('flow') || node.name.toLowerCase().includes('meter')) {
        valueStr = "12.40";
        unitStr = "L/S";
      } else {
        valueStr = "ONLINE";
        unitStr = node.id;
      }

      ctx.fillStyle = '#6b9fe4';
      ctx.font = 'bold 11px Fira Code, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(valueStr, W/2, H/2 - 15);
      
      ctx.fillStyle = '#22d3ee';
      ctx.font = '7px Fira Code, monospace';
      ctx.fillText(unitStr, W/2, H/2 + 2);
      ctx.textAlign = 'left';

      // Status indicator dots
      ctx.fillStyle = '#22c55e'; // Green stable status LED
      ctx.beginPath();
      ctx.arc(W/2 - 12, H/2 + 20, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '5px Fira Code, monospace';
      ctx.fillText("HART", W/2 - 6, H/2 + 22);

      // Field labels
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 8px Fira Code, monospace';
      ctx.fillText(String(node.name || node.id || 'Sensor').toUpperCase(), 16, 26);

      // ----------------------------------------------------
      // RACKMOUNT NETWORK INTERFACE / DATA DIODE / SWITCH
      // ----------------------------------------------------
      const isDiode = role.includes('diode');

      // Dark chassis background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = isDiode ? 'rgba(168,85,247,0.4)' : 'rgba(68,119,212,0.25)';
      ctx.lineWidth = 2;
      if (ctx.roundRect) {
        ctx.roundRect(4, 4, W-8, H-8, 6);
      } else {
        ctx.rect(4, 4, W-8, H-8);
      }
      ctx.stroke();

      if (isDiode) {
        // ── OWL DATA DIODE CHASSIS ──
        // Draw steel plate separator in the middle
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(W/2 - 4, 10, 8, H - 20);
        ctx.strokeStyle = '#475569';
        ctx.strokeRect(W/2 - 4, 10, 8, H - 20);

        // Left section: TX (Transmit Side)
        ctx.fillStyle = 'rgba(34,197,94,0.06)';
        ctx.fillRect(10, 10, W/2 - 14, H - 20);
        
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 8px Fira Code, monospace';
        ctx.fillText("TRANSMIT INTERFACE [TX]", 16, 24);
        ctx.fillStyle = '#64748b';
        ctx.font = '6px Fira Code, monospace';
        ctx.fillText("PHYSICAL OPTICAL INLET", 16, 34);

        // Right section: RX (Receive Side)
        ctx.fillStyle = 'rgba(239,68,68,0.04)';
        ctx.fillRect(W/2 + 4, 10, W/2 - 14, H - 20);

        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 8px Fira Code, monospace';
        ctx.fillText("RECEIVE INTERFACE [RX]", W/2 + 12, 24);
        ctx.fillStyle = '#64748b';
        ctx.font = '6px Fira Code, monospace';
        ctx.fillText("PHYSICAL OPTICAL OUTLET", W/2 + 12, 34);

        // Unidirectional Flow Arrows in the center
        ctx.fillStyle = '#a855f7';
        ctx.font = 'bold 20px Fira Code, monospace';
        ctx.textAlign = 'center';
        ctx.fillText("➜", W/2, H/2 + 6);
        ctx.font = 'bold 5px Fira Code, monospace';
        ctx.fillText("ONE-WAY", W/2, H/2 + 18);
        ctx.fillText("FLOW", W/2, H/2 + 25);
        ctx.textAlign = 'left';

        // Fiber optic port visuals on left (TX)
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(20, H/2 - 10, 30, 20);
        ctx.strokeStyle = '#22c55e';
        ctx.strokeRect(20, H/2 - 10, 30, 20);
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(35, H/2, 3, 0, Math.PI * 2);
        ctx.fill();

        // Fiber optic port visuals on right (RX)
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(W - 50, H/2 - 10, 30, 20);
        ctx.strokeStyle = '#ef4444';
        ctx.strokeRect(W - 50, H/2 - 10, 30, 20);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(W - 35, H/2, 3, 0, Math.PI * 2);
        ctx.fill();

        // Brand details at bottom
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 8px Fira Code, monospace';
        ctx.fillText("OWL CYBER DATA DIODE v8.3", 16, H - 20);
      } else {
        // Honeycomb/line ventilation slots on the left
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        for (let v = 0; v < 8; v++) {
          ctx.beginPath();
          ctx.moveTo(W - 45, 20 + v * 6);
          ctx.lineTo(W - 15, 20 + v * 6);
          ctx.stroke();
        }

        // Brand labels
        ctx.fillStyle = '#6b9fe4';
        ctx.font = 'bold 9px Fira Code, monospace';
        ctx.fillText(String(node.os || node.role || 'DEVICE').toUpperCase().substring(0, 20), 14, 22);

        ctx.fillStyle = '#64748b';
        ctx.font = '8px Fira Code, monospace';
        ctx.fillText(node.firmware || 'v1.0', 14, 35);
      }

      // Glowing multi-port Ethernet panel (Switch / Router style)
      const config = this.app.getNodeConfig(node) || {};
      const interfaces = config.interfaces || {};
      const ifNames = Object.keys(interfaces);
      const portCount = Math.max(ifNames.length, 6);
      const portW = 16, portH = 12, portGap = 6;
      const startX = 14, startY = 60;

      for (let i = 0; i < portCount; i++) {
        const iface = interfaces[ifNames[i]];
        const px = startX + i * (portW + portGap);
        const isUp = iface && !iface.shutdown;
        
        ctx.fillStyle = isUp ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.1)';
        ctx.fillRect(px, startY, portW, portH);
        ctx.strokeStyle = isUp ? '#22c55e' : '#ef4444';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, startY, portW, portH);

        // RJ45 core symbol
        ctx.fillStyle = isUp ? '#22c55e' : '#475569';
        ctx.fillRect(px + 4, startY + 3, 8, 6);

        // Port Link LED indicator
        ctx.fillStyle = isUp ? '#22c55e' : '#374151';
        ctx.beginPath();
        ctx.arc(px + portW/2, startY - 4, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#64748b';
        ctx.font = '6px Fira Code, monospace';
        ctx.fillText(`g${i}`, px + 2, startY + portH + 9);
      }

      // Blinking power and alarm LED Bank
      const ledLabels = ['PWR', 'SYS', 'ACT', 'ALM'];
      const ledColors = { stable: ['#22c55e','#22c55e','#3b82f6','#374151'], compromised: ['#22c55e','#ef4444','#ef4444','#f59e0b'], isolated: ['#22c55e','#f59e0b','#374151','#f59e0b'] };
      const leds = ledColors[node.status] || ledColors.stable;
      ledLabels.forEach((label, i) => {
        ctx.fillStyle = leds[i];
        ctx.beginPath();
        ctx.arc(16 + i * 22, 135, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.font = '6px Fira Code, monospace';
        ctx.fillText(label, 7 + i * 22, 148);
      });

      // Metal logo plate
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(W - 100, H - 40, 88, 28);
      ctx.strokeStyle = 'rgba(68,119,212,0.18)';
      ctx.strokeRect(W - 100, H - 40, 88, 28);
      ctx.fillStyle = '#64748b';
      ctx.font = '7px Fira Code, monospace';
      ctx.fillText('AETHERIS NET-ENG', W - 97, H - 26);
      ctx.fillStyle = '#6b9fe4';
      ctx.font = 'bold 8px Fira Code, monospace';
      ctx.fillText(String(node.id || 'SW').substring(0, 12), W - 97, H - 15);
    }
    } catch (err) {
      console.error("Physical chassis drawing failed, applying high-fidelity fallback:", err);
      // Beautiful high-fidelity fail-safe drawing
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#6b9fe4';
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, W - 8, H - 8);

      // Draw active status glow
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(30, 30, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 12px Fira Code, monospace';
      ctx.fillText(node.name || node.id, 45, 34);

      ctx.fillStyle = '#64748b';
      ctx.font = '9px Fira Code, monospace';
      ctx.fillText(node.role || 'Digital Twin Device', 45, 48);

      // Draw stylized diagnostic port grid
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(20, 70, W - 40, 60);
      ctx.strokeStyle = '#475569';
      ctx.strokeRect(20, 70, W - 40, 60);

      ctx.fillStyle = '#22c55e';
      for (let p = 0; p < 8; p++) {
        ctx.fillRect(30 + p * 30, 90, 16, 12);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '6px Fira Code, monospace';
        ctx.fillText(`g${p}`, 30 + p * 30, 115);
        ctx.fillStyle = '#22c55e';
      }

      // Interactive telemetry
      ctx.fillStyle = '#6b9fe4';
      ctx.font = '8px Fira Code, monospace';
      ctx.fillText("Uptime: 99d 3h", 30, 155);
      ctx.fillText("CPU: 32% | MEM: 64%", 30, 170);
    }
  }

  // FEATURE 12: PHASE 4 — ADVANCED CYBERSECURITY CLI TOOLS
}
