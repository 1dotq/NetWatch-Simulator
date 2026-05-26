// AETHERIS — Cross-machine Multiplayer via HTTP relay (server.py)
// Blue = Defender (hosts session), Red = Attacker (joins session)
// Polling: 600ms. Full AI state sync: every 3s from host to joiner.

class MultiplayerSession {
  constructor(app) {
    this.app             = app;
    this.role            = null;   // 'red' | 'blue'
    this.sessionId       = null;
    this.peerConnected   = false;
    this.onMessage           = null;
    this.onPeerConnected     = null;
    this.onPeerDisconnected  = null;
    this.onStateSync         = null;
    this._pollTimer          = null;
    this._heartbeatTimer     = null;
    this._syncTimer          = null;
    this._lastHeartbeat      = 0;
    this._POLL_MS            = 600;
    this._HEARTBEAT_MS       = 3000;
    this._PEER_TIMEOUT_MS    = 12000;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  _url(path) {
    const origin = location.origin;
    // file:// or opaque origins can't reach the relay — fall back to localhost
    if (!origin || origin === 'null' || origin.startsWith('file:')) {
      return `http://127.0.0.1:8080${path}`;
    }
    return `${origin}${path}`;
  }

  // ── Create session (caller = Blue / Defender) ──────────────────────────────
  async createSession() {
    const res = await fetch(this._url('/mp/create'), { method: 'POST' });
    const { id } = await res.json();
    this.sessionId = id;
    this.role = 'blue';
    this._startPolling();
    this._syncTimer = setInterval(() => this._pushBattleState(), 1000);
    return id;
  }

  // ── Join session (caller = Red / Attacker) ─────────────────────────────────
  async joinSession(rawId) {
    this.sessionId = rawId.toUpperCase().trim();
    this.role = 'red';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(this._url(`/mp/${this.sessionId}/join`), { method: 'POST' });
        const body = await res.json();
        if (body.error) throw new Error(body.error);
        this._startPolling();
        return this.sessionId;
      } catch (e) {
        if (attempt === 3) throw e;
        await new Promise(r => setTimeout(r, 400 * attempt));
      }
    }
  }

  // ── Teardown ───────────────────────────────────────────────────────────────
  disconnect() {
    clearInterval(this._pollTimer);
    clearInterval(this._heartbeatTimer);
    clearInterval(this._syncTimer);
    this._send({ type: 'PEER_LEAVE', role: this.role }).catch(() => {});
    this.role = null;
    this.sessionId = null;
    this.peerConnected = false;
  }

  // ── Outbound actions ───────────────────────────────────────────────────────
  sendAttack(nodeId) {
    this._send({ type: 'ATTACK_NODE', nodeId });
    this._applyAttack(nodeId);
  }

  sendDefend(nodeId) {
    this._send({ type: 'DEFEND_NODE', nodeId });
    this._applyDefend(nodeId);
  }

  syncFullState() {
    const nodeStates = this.app.canvas.nodes.map(n => ({
      id: n.id, status: n.status, x: n.x, y: n.y,
    }));
    this._send({ type: 'STATE_SYNC', nodeStates });
  }

  // ── Push live AI battle state (host only, every 3 s) ──────────────────────
  _pushBattleState() {
    if (!this.peerConnected || this.role !== 'blue') return;
    const b = this.app.battle;
    if (!b) return;
    const nodeStates = this.app.canvas.nodes.map(n => ({ id: n.id, status: n.status }));
    // Send last 30 log entries so joiner's log stays in sync
    const log = b.combinedLog ? b.combinedLog.slice(-30) : [];
    this._send({
      type:      'BATTLE_SYNC',
      active:    b.active,
      winner:    b.winner || null,
      redScore:  b.red  ? b.red.score  : 0,
      blueScore: b.blue ? b.blue.score : 0,
      redPhase:  b.red  ? b.red.phase  : 'idle',
      bluePhase: b.blue ? b.blue.phase : 'idle',
      elapsed:   b.elapsed || 0,
      nodeStates,
      log,
    });
  }

  // ── Private ────────────────────────────────────────────────────────────────
  _send(msg) {
    if (!this.sessionId) return Promise.resolve();
    return fetch(this._url(`/mp/${this.sessionId}/send`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: this.role, msg }),
    }).then(r => {
      if (r.status === 410) this._handle({ type: 'SESSION_GONE' });
    }).catch(() => {});
  }

  _startPolling() {
    this._pollTimer     = setInterval(() => this._poll(), this._POLL_MS);
    this._heartbeatTimer = setInterval(() => this._send({ type: 'HEARTBEAT' }), this._HEARTBEAT_MS);
  }

  async _poll() {
    if (!this.sessionId) return;
    let data;
    try {
      const res = await fetch(this._url(`/mp/${this.sessionId}/poll/${this.role}`));
      data = await res.json();
    } catch { return; }

    for (const msg of (data.events || [])) {
      this._handle(msg);
    }

    // Peer timeout check
    if (this.peerConnected && Date.now() - this._lastHeartbeat > this._PEER_TIMEOUT_MS) {
      this.peerConnected = false;
      if (this.onPeerDisconnected) this.onPeerDisconnected();
    }
  }

  _handle(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'PEER_JOIN':
        this.peerConnected = true;
        this._lastHeartbeat = Date.now();
        if (this.onPeerConnected) this.onPeerConnected(msg.role);
        if (this.role === 'blue') {
          setTimeout(() => this.syncFullState(), 300);
          setTimeout(() => this._pushBattleState(), 600);
          // Echo back so red also registers blue as connected
          this._send({ type: 'PEER_JOIN', role: this.role });
        }
        break;

      case 'PEER_LEAVE':
        this.peerConnected = false;
        if (this.onPeerDisconnected) this.onPeerDisconnected();
        break;

      case 'SESSION_GONE':
        // Server restarted and lost this session — tear down so user can recreate
        this.disconnect();
        if (this.onPeerDisconnected) this.onPeerDisconnected();
        if (this.app._mpLog) this.app._mpLog('Session expired (server restarted) — please create a new session');
        break;

      case 'HEARTBEAT':
        this._lastHeartbeat = Date.now();
        if (!this.peerConnected) {
          this.peerConnected = true;
          if (this.onPeerConnected) this.onPeerConnected(this.role === 'blue' ? 'red' : 'blue');
        }
        break;

      case 'ATTACK_NODE':
        this._applyAttack(msg.nodeId);
        if (this.app.canvas.flashBattleEffect) this.app.canvas.flashBattleEffect(msg.nodeId, 'red');
        if (this.onMessage) this.onMessage(msg);
        break;

      case 'DEFEND_NODE':
        this._applyDefend(msg.nodeId);
        if (this.app.canvas.flashBattleEffect) this.app.canvas.flashBattleEffect(msg.nodeId, 'blue');
        if (this.onMessage) this.onMessage(msg);
        break;

      case 'STATE_SYNC':
        if (msg.nodeStates && this.onStateSync) this.onStateSync(msg.nodeStates);
        break;

      case 'BATTLE_SYNC':
        this._applyBattleSync(msg);
        break;

      default:
        if (this.onMessage) this.onMessage(msg);
    }
  }

  _applyBattleSync(msg) {
    const b = this.app.battle;
    if (b) {
      if (msg.active    !== undefined) b.active    = msg.active;
      if (msg.winner    !== undefined) b.winner    = msg.winner;
      if (msg.elapsed   !== undefined) b.elapsed   = msg.elapsed;
      if (b.red  && msg.redScore  !== undefined) b.red.score  = msg.redScore;
      if (b.red  && msg.redPhase  !== undefined) b.red.phase  = msg.redPhase;
      if (b.blue && msg.blueScore !== undefined) b.blue.score = msg.blueScore;
      if (b.blue && msg.bluePhase !== undefined) b.blue.phase = msg.bluePhase;
      // Replace the log so the joiner sees exactly the host's events
      if (msg.log && Array.isArray(msg.log)) b.combinedLog = msg.log;
    }
    if (msg.nodeStates) {
      for (const ns of msg.nodeStates) {
        const node = this.app.canvas.nodes.find(n => n.id === ns.id);
        if (node) node.status = ns.status;
      }
    }
    if (this.app._updateBattleUI)  this.app._updateBattleUI();
    if (this.app._renderBattleLog) this.app._renderBattleLog();
  }

  _applyAttack(nodeId) {
    const node = this.app.canvas.nodes.find(n => n.id === nodeId);
    if (node && node.status !== 'isolated') node.status = 'compromised';
  }

  _applyDefend(nodeId) {
    const node = this.app.canvas.nodes.find(n => n.id === nodeId);
    if (node) node.status = node.status === 'compromised' ? 'stable' : 'isolated';
  }
}
