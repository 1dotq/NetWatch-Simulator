// ═══════════════════════════════════════════════════════════════════════════════
// AETHERIS — Evolutionary Attack Discovery Engine
//
// Uses a genetic algorithm to evolve red-team strategies across thousands of
// headless battles, surfacing novel attack paths, technique chains, and
// topology blind spots that no human enumerated.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Genome ────────────────────────────────────────────────────────────────────

class AttackGenome {
  static TARGET_KEYS = ['plc', 'hmi', 'ot', 'boundary', 'server', 'workstation', 'field'];
  static TECH_KEYS   = ['exploit', 'credential', 'protocol', 'wmi', 'social'];

  constructor(src = null) {
    if (src) {
      this.targetW   = { ...src.targetW };
      this.techBias  = { ...src.techBias };
      this.aggression   = src.aggression;
      this.stealth      = src.stealth;
      this.otBias       = src.otBias;
      this.pivotBreadth = src.pivotBreadth;
      this.lateralDepth = src.lateralDepth;
    } else {
      this._rand();
    }
    this.fitness    = 0;
    this.lastResult = null;
    this.id         = Math.random().toString(36).slice(2, 8);
  }

  _rand() {
    const r = (a, b) => a + Math.random() * (b - a);
    this.targetW = {
      plc:         r(0, 100), hmi:        r(0, 80),
      ot:          r(0, 70),  boundary:   r(0, 60),
      server:      r(0, 50),  workstation: r(0, 30),
      field:       r(0, 40),
    };
    this.techBias = {
      exploit: r(0,1), credential: r(0,1), protocol: r(0,1),
      wmi:     r(0,1), social:     r(0,1),
    };
    this.aggression   = r(0.1, 1.0);
    this.stealth      = r(0.0, 1.0);
    this.otBias       = r(0.0, 1.0);
    this.pivotBreadth = r(0.0, 1.0);
    this.lateralDepth = r(1,   5);
  }

  clone() { return new AttackGenome(this); }

  crossover(other) {
    const c = new AttackGenome();
    const pick = (a, b) => Math.random() < 0.5 ? a : b;
    for (const k of AttackGenome.TARGET_KEYS) c.targetW[k]  = pick(this.targetW[k],  other.targetW[k]);
    for (const k of AttackGenome.TECH_KEYS)   c.techBias[k] = pick(this.techBias[k], other.techBias[k]);
    c.aggression   = pick(this.aggression,   other.aggression);
    c.stealth      = pick(this.stealth,      other.stealth);
    c.otBias       = pick(this.otBias,       other.otBias);
    c.pivotBreadth = pick(this.pivotBreadth, other.pivotBreadth);
    c.lateralDepth = pick(this.lateralDepth, other.lateralDepth);
    return c;
  }

  mutate(rate = 0.2) {
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const nudge = (v, s) => v + (Math.random() - 0.5) * s;
    for (const k of AttackGenome.TARGET_KEYS)
      if (Math.random() < rate) this.targetW[k]  = clamp(nudge(this.targetW[k], 45), -30, 130);
    for (const k of AttackGenome.TECH_KEYS)
      if (Math.random() < rate) this.techBias[k] = clamp(nudge(this.techBias[k], 0.4), 0, 1);
    if (Math.random() < rate) this.aggression   = clamp(nudge(this.aggression,   0.3), 0.05, 1);
    if (Math.random() < rate) this.stealth      = clamp(nudge(this.stealth,      0.3), 0,    1);
    if (Math.random() < rate) this.otBias       = clamp(nudge(this.otBias,       0.3), 0,    1);
    if (Math.random() < rate) this.pivotBreadth = clamp(nudge(this.pivotBreadth, 0.3), 0,    1);
    if (Math.random() < rate) this.lateralDepth = clamp(nudge(this.lateralDepth, 1.5), 1,    6);
    return this;
  }

  describe() {
    const t = [];
    if (this.aggression   > 0.7) t.push('aggressive');
    else if (this.aggression < 0.35) t.push('patient');
    if (this.stealth      > 0.7) t.push('ghost-mode');
    else if (this.stealth < 0.3) t.push('loud');
    if (this.otBias       > 0.7) t.push('OT-obsessed');
    if (this.pivotBreadth > 0.7) t.push('wide-spread');
    else if (this.pivotBreadth < 0.3) t.push('deep-drill');
    const topTarget = Object.entries(this.targetW).sort((a,b)=>b[1]-a[1])[0][0];
    const topTech   = Object.entries(this.techBias).sort((a,b)=>b[1]-a[1])[0][0];
    t.push(`${topTarget}-hunter`, `${topTech}-reliant`);
    return t.join(' · ');
  }

  toDisplayRows() {
    return [
      { label: 'Aggression',    value: this.aggression,   max: 1,   fmt: v => (v*100).toFixed(0)+'%' },
      { label: 'Stealth',       value: this.stealth,      max: 1,   fmt: v => (v*100).toFixed(0)+'%' },
      { label: 'OT Bias',       value: this.otBias,       max: 1,   fmt: v => (v*100).toFixed(0)+'%' },
      { label: 'Pivot Breadth', value: this.pivotBreadth, max: 1,   fmt: v => (v*100).toFixed(0)+'%' },
      { label: 'Lateral Depth', value: this.lateralDepth, max: 6,   fmt: v => v.toFixed(1) },
      { label: 'Top Target',    value: Object.entries(this.targetW).sort((a,b)=>b[1]-a[1])[0][0], raw: true },
      { label: 'Top Technique', value: Object.entries(this.techBias).sort((a,b)=>b[1]-a[1])[0][0], raw: true },
    ];
  }
}

// Known threat actor profiles as pre-configured genomes
AttackGenome.APT_PROFILES = {
  'Sandworm': {
    desc: 'Russian GRU unit. Industroyer/CrashOverride. IEC-61850 & grid disruption focus.',
    targetW:   { plc:30, hmi:80, ot:90, boundary:40, server:20, workstation:10, field:60 },
    techBias:  { exploit:0.3, credential:0.4, protocol:0.95, wmi:0.2, social:0.1 },
    aggression:0.6, stealth:0.8, otBias:0.95, pivotBreadth:0.3, lateralDepth:4,
  },
  'APT28 (Fancy Bear)': {
    desc: 'Russian GRU. Credential harvesting & spear-phishing into IT before OT pivot.',
    targetW:   { plc:50, hmi:60, ot:70, boundary:80, server:90, workstation:50, field:20 },
    techBias:  { exploit:0.5, credential:0.9, protocol:0.3, wmi:0.6, social:0.8 },
    aggression:0.5, stealth:0.75, otBias:0.6, pivotBreadth:0.5, lateralDepth:3,
  },
  'DarkSide (Colonial)': {
    desc: 'Ransomware-as-a-Service. Fast IT-side compromise, avoided OT direct contact.',
    targetW:   { plc:10, hmi:30, ot:20, boundary:70, server:95, workstation:80, field:5 },
    techBias:  { exploit:0.7, credential:0.8, protocol:0.1, wmi:0.7, social:0.5 },
    aggression:0.9, stealth:0.4, otBias:0.2, pivotBreadth:0.8, lateralDepth:2,
  },
  'TRITON/TRISIS': {
    desc: 'Targeted Safety Instrumented Systems (SIS). Patient, surgical, safety-focused.',
    targetW:   { plc:60, hmi:40, ot:80, boundary:30, server:20, workstation:30, field:90 },
    techBias:  { exploit:0.2, credential:0.3, protocol:0.85, wmi:0.3, social:0.15 },
    aggression:0.25, stealth:0.95, otBias:0.9, pivotBreadth:0.15, lateralDepth:5,
  },
  'Volt Typhoon': {
    desc: 'Chinese APT. Living-off-the-land, credential abuse, extreme patience.',
    targetW:   { plc:40, hmi:50, ot:60, boundary:90, server:70, workstation:40, field:30 },
    techBias:  { exploit:0.1, credential:0.95, protocol:0.4, wmi:0.9, social:0.05 },
    aggression:0.15, stealth:0.98, otBias:0.55, pivotBreadth:0.4, lateralDepth:4,
  },
};

// ── Blue Genome ───────────────────────────────────────────────────────────────

class BlueGenome {
  static KEYS = ['detectIT', 'detectOT', 'responseSpeed', 'containBias', 'honeyPots', 'segmentation'];

  constructor(src = null) {
    if (src) {
      this.detectIT      = src.detectIT;
      this.detectOT      = src.detectOT;
      this.responseSpeed = src.responseSpeed;
      this.containBias   = src.containBias;
      this.honeyPots     = src.honeyPots;
      this.segmentation  = src.segmentation;
    } else {
      const r = (a,b) => a + Math.random()*(b-a);
      this.detectIT      = r(0.2, 0.9);
      this.detectOT      = r(0.1, 0.7);
      this.responseSpeed = r(0.3, 1.0);
      this.containBias   = r(0.0, 1.0);
      this.honeyPots     = r(0.0, 1.0);
      this.segmentation  = r(0.0, 1.0);
    }
    this.fitness = 0;
    this.id = Math.random().toString(36).slice(2,8);
  }

  clone() { return new BlueGenome(this); }

  crossover(other) {
    const c = new BlueGenome();
    const pick = (a,b) => Math.random()<0.5?a:b;
    for (const k of BlueGenome.KEYS) c[k] = pick(this[k], other[k]);
    return c;
  }

  mutate(rate=0.2) {
    const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
    for (const k of BlueGenome.KEYS) {
      if (Math.random() < rate) this[k] = clamp(this[k] + (Math.random()-0.5)*0.3, 0, 1);
    }
    return this;
  }

  describe() {
    const t = [];
    if (this.detectOT > 0.6)      t.push('OT-aware');
    if (this.responseSpeed > 0.7)  t.push('rapid-response');
    if (this.honeyPots > 0.6)      t.push('deception-heavy');
    if (this.segmentation > 0.7)   t.push('well-segmented');
    if (this.containBias > 0.7)    t.push('OT-protect');
    return t.join(' · ') || 'balanced';
  }
}

// ── Headless Battle Simulator ─────────────────────────────────────────────────

class HeadlessBattle {
  static TECHNIQUES = {
    exploit:    ['CVE-2024-3400 (PAN-OS RCE)', 'EternalBlue (MS17-010)', 'Log4Shell (CVE-2021-44228)', 'ProxyShell (CVE-2021-34473)', 'CVE-2022-30190 (Follina)'],
    credential: ['Pass-the-Hash (NTLM relay)', 'Kerberoasting → TGS forged', 'LSASS credential dump', 'DCSync (replication abuse)', 'Token impersonation — SYSTEM'],
    protocol:   ['DNP3 unsolicited response injection', 'Modbus FC16 register write', 'EtherNet/IP CIP command forge', 'IEC-61850 GOOSE flood', 'OPC-UA session hijack'],
    wmi:        ['WMI remote code execution', 'PSExec lateral transfer', 'DCOM lateral movement', 'WinRM remote shell', 'Scheduled task persistence'],
    social:     ['Spear-phishing payload delivery', 'VPN split-tunnel exploit', 'Supply chain implant', 'Watering hole compromise', 'USB drop — HID emulation'],
  };
  static ENTRY_KEYWORDS    = ['gateway','firewall','vpn','internet','edge','dmz','border','gw','fw'];
  static OT_KEYWORDS       = ['plc','hmi','scada','ot ','field','rtu','historian','dcs','safety','actuator','sensor','valve','reactor','modbus'];
  static CRITICAL_KEYWORDS = ['plc','hmi','scada','safety','reactor','rtu','dcs'];

  constructor(nodes, links, genome, blueGenome = null) {
    this.nodes = nodes.map(n => ({
      id:     n.id,
      name:   (n.name  || n.id).toLowerCase(),
      role:   (n.role  || '').toLowerCase(),
      type:   (n.type  || '').toLowerCase(),
      status: 'stable',
    }));
    this.adj = {};
    for (const n of this.nodes) this.adj[n.id] = new Set();
    for (const l of links) {
      const s = l.sourceId || l.source?.id || l.source;
      const t = l.targetId || l.target?.id || l.target;
      if (this.adj[s] && this.adj[t]) {
        this.adj[s].add(t);
        this.adj[t].add(s);
      }
    }
    this.genome        = genome;
    this.blueGenome    = blueGenome;
    this.footholds     = new Set();
    this.contained     = new Set();
    this.detected      = new Set();
    this.path          = [];
    this.redScore      = 0;
    this.blueScore     = 0;
    this.tick          = 0;
    this.maxTicks      = 600;
    this.winner        = null;
    this.redNextTick   = 5;
    this.blueNextTick  = 10;
  }

  _str(n) { return n.name + ' ' + n.role + ' ' + n.type; }
  _isOT(n)       { return HeadlessBattle.OT_KEYWORDS.some(k => this._str(n).includes(k)); }
  _isCritical(n) { return HeadlessBattle.CRITICAL_KEYWORDS.some(k => this._str(n).includes(k)); }
  _isEntry(n)    { return HeadlessBattle.ENTRY_KEYWORDS.some(k => this._str(n).includes(k)); }

  _score(node) {
    const g = this.genome;
    let s = 10;
    const str = this._str(node);
    if (str.includes('plc'))            s += g.targetW.plc;
    if (str.includes('hmi') || str.includes('scada')) s += g.targetW.hmi;
    if (this._isOT(node))               s += g.targetW.ot + g.otBias * 55;
    if (this._isEntry(node))            s += g.targetW.boundary;
    if (str.includes('server') || str.includes('active directory')) s += g.targetW.server;
    if (str.includes('workstation') || str.includes('console'))     s += g.targetW.workstation;
    if (str.includes('actuator') || str.includes('sensor') || str.includes('valve')) s += g.targetW.field;
    if (this.footholds.has(node.id)) s -= 300;
    if (this.contained.has(node.id)) s -= 600;
    return s;
  }

  _tech(from, to) {
    const g = this.genome;
    const w = { ...g.techBias };
    if (this._isOT(to))             w.protocol   = (w.protocol || 0)   * 2.8;
    if (this._str(to).includes('server') || this._str(to).includes('active directory'))
                                    w.credential = (w.credential || 0) * 2.2;
    if (from && this._isEntry(from)) w.social     = (w.social || 0)    * 1.8;
    const total = Object.values(w).reduce((a,b) => a+b, 0.001);
    let r = Math.random() * total;
    for (const [cat, wt] of Object.entries(w)) {
      r -= wt; if (r <= 0) { const arr = HeadlessBattle.TECHNIQUES[cat]; return arr[Math.floor(Math.random()*arr.length)]; }
    }
    return HeadlessBattle.TECHNIQUES.exploit[0];
  }

  _redDelay() { return Math.max(2, Math.round(9 * (1.2 - this.genome.aggression))); }

  _stepRed() {
    if (this.tick < this.redNextTick) return;

    if (this.footholds.size === 0) {
      // Initial access — pick best entry point
      const entries = this.nodes.filter(n => this._isEntry(n));
      const pool    = entries.length ? entries : [this.nodes[0]];
      const target  = pool.reduce((b, n) => this._score(n) > this._score(b) ? n : b, pool[0]);
      target.status = 'compromised';
      this.footholds.add(target.id);
      this.path.push({ nodeId: target.id, nodeName: target.name, technique: this._tech(null, target), tick: this.tick, phase: 'INITIAL_ACCESS', fromId: null, fromName: null });
      this.redScore += 120;
      this.redNextTick = this.tick + this._redDelay();
      return;
    }

    // Lateral movement — score all reachable unowned nodes
    const candidates = [];
    for (const fid of this.footholds) {
      for (const nid of (this.adj[fid] || [])) {
        const n = this.nodes.find(x => x.id === nid);
        if (n && !this.footholds.has(nid) && !this.contained.has(nid) && n.status !== 'isolated') {
          const g = this.genome;
          const depthScore   = this._score(n);
          const breadthScore = (this.adj[nid]?.size || 0) * 14;
          candidates.push({ node: n, fromId: fid, score: depthScore * (1 - g.pivotBreadth * 0.5) + breadthScore * g.pivotBreadth });
        }
      }
    }
    if (!candidates.length) { this.winner = 'blue'; return; }

    candidates.sort((a,b) => b.score - a.score);
    const topN = Math.max(1, Math.round(this.genome.lateralDepth));
    const pick = candidates[Math.min(Math.floor(Math.random() * topN), candidates.length - 1)];
    const from = this.nodes.find(n => n.id === pick.fromId);
    const target = pick.node;

    target.status = 'compromised';
    this.footholds.add(target.id);

    const isOT   = this._isOT(target);
    const isCrit = this._isCritical(target);
    const phase  = isCrit ? 'OBJECTIVE' : isOT ? 'OT_PIVOT' : 'LATERAL_MOVE';
    this.path.push({ nodeId: target.id, nodeName: target.name, technique: this._tech(from, target), tick: this.tick, phase, fromId: pick.fromId, fromName: from?.name });
    this.redScore += isCrit ? 600 : isOT ? 320 : 160;

    // Blue detection probability (stealth gene reduces this, blue genome amplifies it)
    const detectMult = this.blueGenome ? (isOT ? this.blueGenome.detectOT : this.blueGenome.detectIT) : 1;
    const detP = (isOT ? 0.55 : 0.30) * detectMult * (1 - this.genome.stealth * 0.65);
    if (Math.random() < detP) this.detected.add(target.id);

    this.redNextTick = this.tick + this._redDelay();
  }

  _stepBlue() {
    if (this.tick < this.blueNextTick) return;
    if (this.detected.size > 0) {
      // If blue genome has containBias > 0.5, prioritize OT nodes
      let targetId;
      if (this.blueGenome && this.blueGenome.containBias > 0.5) {
        const sorted = [...this.detected].sort((a,b) => {
          const na = this.nodes.find(n=>n.id===a), nb = this.nodes.find(n=>n.id===b);
          return (this._isOT(nb)?1:0) - (this._isOT(na)?1:0);
        });
        targetId = sorted[0];
      } else {
        [targetId] = this.detected;
      }
      const n = this.nodes.find(x=>x.id===targetId);
      if (n) { n.status='isolated'; this.contained.add(targetId); this.footholds.delete(targetId); this.blueScore+=250; }
      this.detected.delete(targetId);
    }
    const speedMult = this.blueGenome ? this.blueGenome.responseSpeed : 1;
    this.blueNextTick = this.tick + Math.max(5, Math.round(12 * (1 - speedMult * 0.5)));
  }

  _checkWin() {
    const crits       = this.nodes.filter(n => this._isCritical(n));
    const compromised = crits.filter(n => this.footholds.has(n.id));
    const threshold   = Math.max(1, Math.ceil(crits.length * 0.4));
    if (compromised.length >= threshold) { this.winner = 'red'; return; }
    if (this.footholds.size === 0 && this.tick > 30) this.winner = 'blue';
  }

  run() {
    while (this.tick < this.maxTicks && !this.winner) {
      this._stepRed(); this._stepBlue(); this._checkWin(); this.tick++;
    }
    if (!this.winner) this.winner = this.redScore > this.blueScore ? 'red' : 'blue';
    return { winner: this.winner, ticks: this.tick, redScore: this.redScore, blueScore: this.blueScore, path: this.path, compromised: [...this.footholds], contained: [...this.contained] };
  }
}

// ── Fitness Function ──────────────────────────────────────────────────────────

function evalFitness(result) {
  if (!result) return 0;
  let s = result.redScore;
  if (result.winner === 'red') {
    s += 3000 + Math.max(0, (600 - result.ticks) * 5);
  }
  const otHits = result.path.filter(p => p.phase === 'OT_PIVOT' || p.phase === 'OBJECTIVE').length;
  s += otHits * 450;
  s += Math.max(0, 800 - result.contained.length * 200);
  const uniqueTechs = new Set(result.path.map(p => p.technique)).size;
  s += uniqueTechs * 90;
  if (result.path.length < 2) s *= 0.05;
  return Math.max(0, s);
}

// ── Evolution Engine ──────────────────────────────────────────────────────────

class EvolutionEngine {
  constructor(app) {
    this.app            = app;
    this.running        = false;
    this.generation     = 0;
    this.maxGenerations = 35;
    this.popSize        = 50;
    this.population     = [];
    this.history        = [];      // [{gen, best, mean, winRate}]
    this.nodeHeatMap    = {};      // nodeId → total hits across all winning battles
    this.edgeHeatMap    = {};      // "fromId→toId" → count
    this.techHeatMap    = {};      // technique → count
    this.topGenomes     = [];      // best 5 ever discovered
    this.allWinPaths    = [];      // every winning path
    this._stop          = false;
    this.onProgress     = null;    // (gen, stats, engine) => void
    this.onComplete     = null;    // (results) => void
    this._seedProfile   = null;    // APT profile name to seed with
    // Co-evolution
    this.coEvolveBlue   = false;
    this.bluePop        = [];
    this.topBlueGenomes = [];
  }

  _data() {
    return { nodes: this.app.canvas?.nodes || [], links: this.app.canvas?.links || [] };
  }

  _initPop() {
    this.population = Array.from({ length: this.popSize }, () => new AttackGenome());
    if (this.coEvolveBlue) {
      this.bluePop = Array.from({ length: this.popSize }, () => new BlueGenome());
    }
  }

  seedWithProfile(profileName) {
    const profile = AttackGenome.APT_PROFILES[profileName];
    if (!profile) return;
    const base = new AttackGenome(profile);
    base.fitness = 0; base.lastResult = null;
    const count = Math.floor(this.popSize * 0.4);
    for (let i = 0; i < count && i < this.population.length; i++) {
      const seeded = base.clone();
      seeded.mutate(0.1);
      this.population[i] = seeded;
    }
  }

  _eval(genome, blueGenome = null) {
    const { nodes, links } = this._data();
    if (!nodes.length) return null;
    const result  = new HeadlessBattle(nodes, links, genome, blueGenome).run();
    genome.fitness    = evalFitness(result);
    genome.lastResult = result;
    if (blueGenome) {
      blueGenome.fitness    = Math.max(0, 10000 - genome.fitness + result.blueScore * 2);
      blueGenome.lastResult = result;
    }
    if (result.winner === 'red') {
      this.allWinPaths.push(result.path);
      for (const step of result.path) {
        this.nodeHeatMap[step.nodeId] = (this.nodeHeatMap[step.nodeId] || 0) + 1;
        this.techHeatMap[step.technique] = (this.techHeatMap[step.technique] || 0) + 1;
        if (step.fromId) {
          const key = `${step.fromId}→${step.nodeId}`;
          this.edgeHeatMap[key] = (this.edgeHeatMap[key] || 0) + 1;
        }
      }
    }
    return result;
  }

  _evalAll() {
    for (let i = 0; i < this.population.length; i++) {
      const blueG = this.coEvolveBlue ? this.bluePop[i % this.bluePop.length] : null;
      this._eval(this.population[i], blueG);
    }
  }

  _select() {
    let best = null;
    for (let i = 0; i < 3; i++) {
      const c = this.population[Math.floor(Math.random() * this.population.length)];
      if (!best || c.fitness > best.fitness) best = c;
    }
    return best;
  }

  _advance() {
    this.population.sort((a,b) => b.fitness - a.fitness);

    // Maintain global top-5
    for (const g of this.population.slice(0, 3)) {
      if (!this.topGenomes.find(t => t.id === g.id)) {
        const clone = g.clone(); clone.fitness = g.fitness; clone.lastResult = g.lastResult;
        this.topGenomes.push(clone);
        this.topGenomes.sort((a,b) => b.fitness - a.fitness);
        this.topGenomes = this.topGenomes.slice(0, 5);
      }
    }

    const fits    = this.population.map(g => g.fitness);
    const winRate = this.population.filter(g => g.lastResult?.winner === 'red').length / this.popSize;
    const stats   = { generation: this.generation, best: fits[0], mean: fits.reduce((a,b)=>a+b,0)/fits.length, worst: fits.at(-1), winRate, topGenome: this.population[0] };
    this.history.push(stats);

    const next = this.population.slice(0, 5).map(g => g.clone()); // elites
    while (next.length < this.popSize) {
      next.push(this._select().crossover(this._select()).mutate(0.2));
    }
    this.population = next;
    this.generation++;

    // Co-evolve blue population
    if (this.coEvolveBlue && this.bluePop.length) {
      this.bluePop.sort((a,b) => b.fitness - a.fitness);
      for (const g of this.bluePop.slice(0,3)) {
        if (!this.topBlueGenomes.find(t=>t.id===g.id)) {
          const c=g.clone(); c.fitness=g.fitness; this.topBlueGenomes.push(c);
          this.topBlueGenomes.sort((a,b)=>b.fitness-a.fitness);
          this.topBlueGenomes=this.topBlueGenomes.slice(0,3);
        }
      }
      const nextBlue = this.bluePop.slice(0,5).map(g=>g.clone());
      while(nextBlue.length < this.popSize) {
        const p1=this.bluePop[Math.floor(Math.random()*Math.min(10,this.bluePop.length))];
        const p2=this.bluePop[Math.floor(Math.random()*Math.min(10,this.bluePop.length))];
        nextBlue.push(p1.crossover(p2).mutate(0.2));
      }
      this.bluePop = nextBlue;
    }

    return stats;
  }

  async start() {
    if (this.running) return;
    this.running = true; this._stop = false; this.generation = 0;
    this.history = []; this.allWinPaths = []; this.nodeHeatMap = {};
    this.edgeHeatMap = {}; this.techHeatMap = {}; this.topGenomes = [];
    this.topBlueGenomes = [];
    this._initPop();
    if (this._seedProfile && AttackGenome.APT_PROFILES[this._seedProfile]) {
      this.seedWithProfile(this._seedProfile);
    }

    for (let g = 0; g < this.maxGenerations; g++) {
      if (this._stop) break;
      this._evalAll();
      const stats = this._advance();
      if (this.onProgress) this.onProgress(g + 1, stats, this);
      await new Promise(r => setTimeout(r, 0)); // yield to UI
    }

    this.running = false;
    if (this.onComplete) this.onComplete(this._results());
  }

  stop() { this._stop = true; }

  // ── Top discovered chains ─────────────────────────────────────────────────
  _results() {
    // Find the most-travelled multi-hop technique sequences
    const chainCounts = {};
    for (const path of this.allWinPaths) {
      for (let i = 0; i < path.length - 1; i++) {
        const key = `${path[i].phase} via ${path[i].technique}  →  ${path[i+1].phase} via ${path[i+1].technique}`;
        chainCounts[key] = (chainCounts[key] || 0) + 1;
      }
    }
    const chains = Object.entries(chainCounts).sort((a,b) => b[1]-a[1]).slice(0, 10).map(([c,n]) => ({ chain: c, count: n }));

    // Most targeted nodes overall
    const hotNodes = Object.entries(this.nodeHeatMap).sort((a,b) => b[1]-a[1]).slice(0, 8);

    // Most used techniques
    const hotTechs = Object.entries(this.techHeatMap).sort((a,b) => b[1]-a[1]).slice(0, 8);

    // Most travelled edges
    const hotEdges = Object.entries(this.edgeHeatMap).sort((a,b) => b[1]-a[1]).slice(0, 8);

    return { topGenomes: this.topGenomes, chains, hotNodes, hotTechs, hotEdges, history: this.history, totalBattles: this.maxGenerations * this.popSize };
  }

  // Deploy champion genome as a live visible battle
  deployChampion() {
    const champ = this.topGenomes[0];
    if (!champ || !this.app.battle) return false;
    // Override the red agent's scoring with champion weights
    const red = this.app.battle.red;
    red._champGenome = champ;
    red._origScoreNode = red._scoreNode.bind(red);
    red._scoreNode = function(n) {
      let s = this._origScoreNode(n);
      const g = this._champGenome;
      const str = (n.name || '').toLowerCase();
      if (str.includes('plc'))    s += g.targetW.plc;
      if (str.includes('hmi') || str.includes('scada')) s += g.targetW.hmi;
      if (n.type === 'ot')        s += g.targetW.ot + g.otBias * 55;
      return s;
    };
    return true;
  }
}
