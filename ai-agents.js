// AETHERIS — AI Red/Blue Team Battle Engine
// Fully autonomous adversarial agents with phase-driven decision trees

class RedTeamAgent {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.phase = 'idle'; // idle|recon|initial_access|lateral_move|privilege_esc|objective
    this.foothold = new Set();   // node IDs currently owned
    this.score = 0;
    this.actionLog = [];
    this.nextAction = 0;
    this.speed = 1.0;
    this.onAction = null; // callback(tag, msg, nodeId)
    this.attackVector = null; // current target being pursued
  }

  get nodes() { return this.app.canvas.nodes; }
  get links() { return this.app.canvas.links; }

  start(speed = 1.0) {
    this.active = true;
    this.speed = speed;
    this.phase = 'recon';
    this.foothold.clear();
    this.score = 0;
    this.actionLog = [];
    this.attackVector = null;
    this._schedule(2500);
    this._log('RECON', `Initializing network intelligence sweep... ${this.nodes.length} hosts enumerated.`);
  }

  stop() { this.active = false; this.phase = 'idle'; }

  _schedule(baseMs) {
    const jitter = 0.8 + Math.random() * 0.4; // ±20% jitter
    this.nextAction = Date.now() + (baseMs * jitter / this.speed);
  }

  _log(tag, msg, nodeId = null) {
    const entry = { ts: Date.now(), tag, msg, nodeId, team: 'red' };
    this.actionLog.unshift(entry);
    if (this.actionLog.length > 120) this.actionLog.pop();
    if (this.onAction) this.onAction(tag, msg, nodeId);
  }

  tick() {
    if (!this.active || Date.now() < this.nextAction) return;
    this._execute();
  }

  _execute() {
    switch (this.phase) {
      case 'recon':            this._doRecon();          break;
      case 'initial_access':   this._doInitialAccess();  break;
      case 'lateral_move':     this._doLateralMove();    break;
      case 'privilege_esc':    this._doPrivEsc();        break;
      case 'objective':        this._doObjective();      break;
    }
  }

  _doRecon() {
    const topTargets = [...this.nodes]
      .filter(n => n.status !== 'isolated')
      .sort((a, b) => this._priority(b) - this._priority(a))
      .slice(0, 4)
      .map(n => n.name || n.id);

    this._log('RECON', `Passive enumeration complete. Priority targets: ${topTargets.join(' → ')}`);
    this.phase = 'initial_access';
    this._schedule(3500);
  }

  _doInitialAccess() {
    // Prefer already-compromised nodes (pre-owned), then internet-facing IT, then any IT
    let entry = this.nodes.find(n => n.status === 'compromised' && !this.foothold.has(n.id));
    if (!entry) entry = this.nodes.find(n =>
      !this.foothold.has(n.id) && n.status !== 'isolated' &&
      n.type === 'it' && /(firewall|router|vpn|web|dmz)/i.test(n.role || '')
    );
    if (!entry) entry = this.nodes.find(n =>
      !this.foothold.has(n.id) && n.status !== 'isolated' && n.type === 'it'
    );

    if (!entry) {
      this._log('INITIAL_ACCESS', 'No perimeter entry points reachable. Awaiting phishing callback...');
      this._schedule(6000);
      return;
    }

    const exploits = [
      'CVE-2024-3400 (PAN-OS RCE)',
      'CVE-2023-46805 (Ivanti auth bypass)',
      'Spear-phishing payload — user credential harvest',
      'Default credential spray — success on admin:admin123',
      'VPN split-tunnel exploit — unauthenticated access',
    ];
    const exploit = exploits[Math.floor(Math.random() * exploits.length)];
    entry.status = 'compromised';
    this.foothold.add(entry.id);
    this.score += 120;
    this._log('INITIAL_ACCESS', `${entry.name || entry.id} PWNED — ${exploit}. C2 beacon established.`, entry.id);
    this.phase = 'lateral_move';
    this._schedule(4000);
  }

  _doLateralMove() {
    if (this.foothold.size === 0) { this.phase = 'initial_access'; this._schedule(2000); return; }

    const candidates = [];
    for (const fid of this.foothold) {
      this._adjacent(fid)
        .filter(n => !this.foothold.has(n.id) && n.status !== 'isolated')
        .forEach(n => candidates.push({ node: n, via: fid }));
    }

    if (candidates.length === 0) {
      this._log('LATERAL_MOVE', 'No reachable adjacent hosts. Reconsolidating — dumping credentials from memory...');
      this._schedule(7000);
      return;
    }

    candidates.sort((a, b) => this._priority(b.node) - this._priority(a.node));
    const { node: target, via: viaId } = candidates[0];
    const viaNode = this.nodes.find(n => n.id === viaId);
    const techniques = [
      'Pass-the-Hash (NTLM relay)',
      'Kerberoasting → ticket forged',
      'WMI remote execution',
      'Modbus FC16 register write',
      'EternalBlue SMB exploit',
      'DNP3 unsolicited response injection',
    ];
    const tech = techniques[Math.floor(Math.random() * techniques.length)];

    target.status = 'compromised';
    this.foothold.add(target.id);
    const isOT = target.type === 'plc' || target.type === 'ot' || target.type === 'field';
    this.score += isOT ? 350 : 100;
    this._log(
      'LATERAL_MOVE',
      `Pivoted ${viaNode?.name || viaId} → ${target.name || target.id} via ${tech}.${isOT ? ' ⚠ OT BOUNDARY CROSSED.' : ''}`,
      target.id
    );

    const ownedCritical = [...this.foothold].map(id => this.nodes.find(n => n.id === id))
      .filter(n => n && (n.type === 'plc' || /(scada|hmi)/i.test(n.role || ''))).length;
    if (ownedCritical >= 1) { this.phase = 'privilege_esc'; }

    this._schedule(4500);
  }

  _doPrivEsc() {
    const criticalOwned = [...this.foothold].map(id => this.nodes.find(n => n.id === id))
      .filter(n => n && (n.type === 'plc' || /(scada|hmi)/i.test(n.role || '')));

    if (criticalOwned.length === 0) { this.phase = 'lateral_move'; this._schedule(2000); return; }

    const target = criticalOwned[0];
    const privTech = [
      'Token impersonation — SYSTEM privileges acquired',
      'DLL injection into SCADA service process',
      'Modbus master role seized — full register R/W access',
      'Engineering workstation backdoor — PLC ladder logic upload enabled',
    ];
    this.score += 200;
    this._log(
      'PRIV_ESC',
      `Privilege escalation on ${target.name || target.id}: ${privTech[Math.floor(Math.random() * privTech.length)]}`,
      target.id
    );
    this.phase = 'objective';
    this._schedule(4000);
  }

  _doObjective() {
    const targets = [...this.foothold]
      .map(id => this.nodes.find(n => n.id === id))
      .filter(n => n && (n.type === 'plc' || /(scada|hmi|sensor|actuator)/i.test(n.role || '')));

    if (targets.length === 0) { this.phase = 'lateral_move'; this._schedule(2000); return; }

    const target = targets[Math.floor(Math.random() * targets.length)];
    const payloads = [
      'Destructive wiper deployed — PLC logic overwritten with CRASHOVERRIDE stub',
      'Setpoint manipulation — process variable spoofed +340% over safety threshold',
      'GOOSE message flood — IEC-61850 relay tripped, substation islanded',
      'Safety interlock bypass — SIS forced to permissive state',
      'Data exfiltration — 2.4 GB historian records staged at C2 dropzone',
    ];
    this.score += 500;
    this._log(
      'OBJECTIVE',
      `CRITICAL IMPACT: ${target.name || target.id} — ${payloads[Math.floor(Math.random() * payloads.length)]}`,
      target.id
    );

    // Keep hunting for more
    this._schedule(8000);
    const more = [...this.foothold].map(id => this.nodes.find(n => n.id === id))
      .filter(n => n && !targets.includes(n) && (n.type === 'plc' || /(scada|hmi)/i.test(n.role || '')));
    if (more.length > 0) this.phase = 'objective';
    else this.phase = 'lateral_move';
  }

  _adjacent(nodeId) {
    return this.links
      .filter(l => l.sourceId === nodeId || l.targetId === nodeId)
      .map(l => l.sourceId === nodeId ? l.targetId : l.sourceId)
      .map(id => this.nodes.find(n => n.id === id))
      .filter(Boolean);
  }

  _priority(node) {
    if (!node) return 0;
    let s = 10;
    if (node.type === 'plc')    s += 90;
    if (node.type === 'ot')     s += 60;
    if (node.type === 'field')  s += 40;
    const r = (node.role || '').toLowerCase();
    if (r.includes('scada'))    s += 55;
    if (r.includes('hmi'))      s += 35;
    if (r.includes('firewall')) s += 25;
    if (r.includes('router'))   s += 18;
    if (node.status === 'compromised') s = 0;
    if (node.status === 'isolated')    s = 0;
    return s;
  }
}


class BlueTeamAgent {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.phase = 'monitor'; // monitor|detect|investigate|contain|recover
    this.score = 0;
    this.detected = new Set();
    this.contained = new Set();
    this.actionLog = [];
    this.nextAction = 0;
    this.speed = 1.0;
    this.onAction = null;
    this.huntTarget = null;
  }

  get nodes() { return this.app.canvas.nodes; }
  get links() { return this.app.canvas.links; }

  start(speed = 1.0) {
    this.active = true;
    this.speed = speed;
    this.phase = 'monitor';
    this.detected.clear();
    this.contained.clear();
    this.score = 0;
    this.actionLog = [];
    this.huntTarget = null;
    this._schedule(5000); // SOC slower to spin up
    this._log('MONITOR', 'SOC watchboard online. Baselining network traffic — all segments nominal.');
  }

  stop() { this.active = false; this.phase = 'monitor'; }

  _schedule(baseMs) {
    const jitter = 0.85 + Math.random() * 0.3;
    this.nextAction = Date.now() + (baseMs * jitter / this.speed);
  }

  _log(tag, msg, nodeId = null) {
    const entry = { ts: Date.now(), tag, msg, nodeId, team: 'blue' };
    this.actionLog.unshift(entry);
    if (this.actionLog.length > 120) this.actionLog.pop();
    if (this.onAction) this.onAction(tag, msg, nodeId);
  }

  tick() {
    if (!this.active || Date.now() < this.nextAction) return;
    this._execute();
  }

  _execute() {
    switch (this.phase) {
      case 'monitor':     this._doMonitor();     break;
      case 'detect':      this._doDetect();      break;
      case 'investigate': this._doInvestigate(); break;
      case 'contain':     this._doContain();     break;
      case 'recover':     this._doRecover();     break;
    }
  }

  _doMonitor() {
    const threats = this.nodes.filter(n =>
      n.status === 'compromised' && !this.detected.has(n.id) && !this.contained.has(n.id)
    );

    if (threats.length === 0) {
      const tools = [
        'SIEM correlation — no rule hits in past 60s',
        'Zeek IDS: packet capture baseline clean',
        'EDR telemetry sweep — endpoints nominal',
        'NetFlow analysis — no anomalous lateral movement',
        'OT protocol monitor — Modbus/DNP3 traffic within bounds',
      ];
      this._log('MONITOR', tools[Math.floor(Math.random() * tools.length)]);
      this._schedule(5500);
      return;
    }

    this.huntTarget = threats[Math.floor(Math.random() * threats.length)];
    this.phase = 'detect';
    this._schedule(2500);
  }

  _doDetect() {
    if (!this.huntTarget || this.huntTarget.status !== 'compromised') {
      this.phase = 'monitor'; this._schedule(3000); return;
    }

    const n = this.huntTarget;
    // OT nodes harder to detect (less telemetry)
    const detRate = (n.type === 'plc' || n.type === 'field') ? 0.55 : 0.82;

    if (Math.random() < detRate) {
      this.detected.add(n.id);
      this.score += 200;
      const iocs = [
        'Unusual outbound connection to unknown C2 (port 4444)',
        'Authentication anomaly — credential spike from single host',
        'Lateral SMB movement pattern detected by SIEM rule SEC-147',
        'Anomalous Modbus FC16 writes to safety register',
        'DNS beaconing detected — DGA domain queried 47×',
        'Memory anomaly: injected DLL in process lsass.exe',
      ];
      const ioc = iocs[Math.floor(Math.random() * iocs.length)];
      this._log('DETECT', `THREAT CONFIRMED — ${n.name || n.id}: ${ioc}. Escalating to IR.`, n.id);
      this.phase = 'investigate';
    } else {
      this._log('DETECT', `Suspicious telemetry on ${n.name || n.id} — confidence LOW. Widening sensor coverage.`, n.id);
      this.phase = 'monitor';
    }
    this._schedule(3000);
  }

  _doInvestigate() {
    const pending = [...this.detected].filter(id => !this.contained.has(id));
    if (pending.length === 0) { this.phase = 'recover'; this._schedule(2000); return; }

    const nodeId = pending[0];
    const node = this.nodes.find(n => n.id === nodeId);
    const tools = [
      'Velociraptor forensic artifact collection — IOC chain confirmed',
      'Memory dump analyzed — Cobalt Strike beacon found in heap',
      'Process tree audit — malicious child processes mapped',
      'Registry diff — persistence mechanism identified at HKCU Run key',
      'Network connection graph — full C2 infrastructure mapped',
    ];
    this._log('INVESTIGATE', `Forensics on ${node?.name || nodeId}: ${tools[Math.floor(Math.random() * tools.length)]}`, nodeId);
    this.score += 100;
    this.phase = 'contain';
    this._schedule(2800);
  }

  _doContain() {
    const toContain = [...this.detected].filter(id => !this.contained.has(id));
    if (toContain.length === 0) { this.phase = 'recover'; this._schedule(2000); return; }

    const nodeId = toContain[0];
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) {
      node.status = 'isolated';
      this.contained.add(nodeId);
      this.score += 350;
      const actions = [
        'Host isolated — firewall ACLs pushed, all inbound/outbound blocked',
        'Network microsegmentation deployed — VLAN quarantine enforced',
        'C2 channel severed — BGP null-route injected for threat actor IPs',
        'OT firewall rule inserted — DNP3/Modbus traffic from host denied',
      ];
      this._log('CONTAIN', `${node.name || nodeId} CONTAINED — ${actions[Math.floor(Math.random() * actions.length)]}`, nodeId);
    }

    // Hunt for more
    this.phase = 'monitor';
    this._schedule(3500);
  }

  _doRecover() {
    const toRecover = [...this.contained].filter(id => {
      const n = this.nodes.find(n => n.id === id);
      return n && n.status === 'isolated';
    });

    if (toRecover.length === 0) { this.phase = 'monitor'; this._schedule(4000); return; }

    const nodeId = toRecover[0];
    const node = this.nodes.find(n => n.id === nodeId);
    if (node) {
      node.status = 'stable';
      this.contained.delete(nodeId);
      this.detected.delete(nodeId);
      this.score += 175;
      const steps = [
        'Malware removed, firmware re-flashed from golden image, host restored',
        'PLC ladder logic re-pushed from verified backup, safety tests passed',
        'Credentials rotated, EDR re-enrolled, host returned to production',
      ];
      this._log('RECOVER', `${node.name || nodeId} restored: ${steps[Math.floor(Math.random() * steps.length)]}`, nodeId);
    }

    this.phase = 'monitor';
    this._schedule(5000);
  }
}


class BattleSimulator {
  constructor(app) {
    this.app = app;
    this.red  = new RedTeamAgent(app);
    this.blue = new BlueTeamAgent(app);
    this.active  = false;
    this.paused  = false;
    this.speed   = 1.0;
    this.winner  = null; // null | 'red' | 'blue' | 'draw'
    this.startTs = 0;
    this.onUpdate = null;

    this.red.onAction = (tag, msg, nodeId) => {
      if (nodeId && this.app.canvas.flashBattleEffect) this.app.canvas.flashBattleEffect(nodeId, 'red');
      if (this.onUpdate) this.onUpdate();
    };
    this.blue.onAction = (tag, msg, nodeId) => {
      if (nodeId && this.app.canvas.flashBattleEffect) this.app.canvas.flashBattleEffect(nodeId, 'blue');
      if (this.onUpdate) this.onUpdate();
    };
  }

  start(speed = 1.0) {
    this.speed  = speed;
    this.active = true;
    this.paused = false;
    this.winner = null;
    this.startTs = Date.now();

    // Restore any stale statuses from prior battles
    this.app.canvas.nodes.forEach(n => {
      if (n.status === 'compromised' || n.status === 'isolated') n.status = 'stable';
    });

    this.red.start(speed);
    this.blue.start(speed);
    if (this.onUpdate) this.onUpdate();
  }

  pause() {
    this.paused = !this.paused;
    if (this.onUpdate) this.onUpdate();
  }

  stop() {
    this.active = false;
    this.paused = false;
    this.red.stop();
    this.blue.stop();
    if (this.onUpdate) this.onUpdate();
  }

  setSpeed(s) {
    this.speed = s;
    this.red.speed  = s;
    this.blue.speed = s;
  }

  tick() {
    if (!this.active || this.paused || this.winner) return;
    this.red.tick();
    this.blue.tick();
    this._checkWin();
  }

  get elapsedSec() {
    return this.startTs ? Math.floor((Date.now() - this.startTs) / 1000) : 0;
  }

  get elapsedLabel() {
    const s = this.elapsedSec;
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }

  _checkWin() {
    const nodes = this.app.canvas.nodes;
    const critical = nodes.filter(n => n.type === 'plc' || /(scada|hmi)/i.test(n.role || ''));
    if (critical.length === 0) return;

    const pwned = critical.filter(n => n.status === 'compromised').length;
    const allContained = nodes.every(n => n.status !== 'compromised') && this.red.foothold.size >= 2;

    if (pwned >= Math.ceil(critical.length * 0.5)) {
      this.winner = 'red';
      this.stop();
    } else if (allContained && this.blue.contained.size >= 2) {
      this.winner = 'blue';
      this.stop();
    }
  }

  // Combined chronological log for feed
  get combinedLog() {
    const all = [...this.red.actionLog, ...this.blue.actionLog];
    return all.sort((a, b) => b.ts - a.ts).slice(0, 60);
  }
}
