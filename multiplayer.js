// AETHERIS — Multiplayer Battle Session via BroadcastChannel (zero-server)
// Two browser tabs share a session ID and sync topology state in real-time

class MultiplayerSession {
  constructor(app) {
    this.app = app;
    this.role      = null;       // 'red' | 'blue'
    this.sessionId = null;
    this.channel   = null;
    this.peerConnected = false;
    this.onMessage          = null; // (msg) => void
    this.onPeerConnected    = null; // (role) => void
    this.onPeerDisconnected = null; // () => void
    this.onStateSync        = null; // (nodeStates) => void
    this._heartbeatTimer    = null;
    this._peerTimeout       = null;
  }

  // ── Create a new session (caller becomes Blue / Defender) ──────────────────
  createSession() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    this.sessionId = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    this.role = 'blue';
    this._connect();
    return this.sessionId;
  }

  // ── Join an existing session (joiner becomes Red / Attacker) ───────────────
  joinSession(id) {
    this.sessionId = id.toUpperCase().trim();
    this.role = 'red';
    this._connect();
    this.broadcast({ type: 'PEER_JOIN', role: this.role });
    return this.sessionId;
  }

  // ── Teardown ───────────────────────────────────────────────────────────────
  disconnect() {
    clearInterval(this._heartbeatTimer);
    clearTimeout(this._peerTimeout);
    if (this.channel) {
      this.broadcast({ type: 'PEER_LEAVE', role: this.role });
      this.channel.close();
      this.channel = null;
    }
    this.role = null;
    this.sessionId = null;
    this.peerConnected = false;
  }

  // ── Broadcast helpers ──────────────────────────────────────────────────────
  broadcast(msg) {
    if (this.channel) this.channel.postMessage({ ...msg, _sender: this.role });
  }

  // Attack a node (Red team sends this)
  sendAttack(nodeId) {
    this.broadcast({ type: 'ATTACK_NODE', nodeId });
    this._applyAttack(nodeId);
  }

  // Defend a node (Blue team sends this)
  sendDefend(nodeId) {
    this.broadcast({ type: 'DEFEND_NODE', nodeId });
    this._applyDefend(nodeId);
  }

  // Push full topology state to peer (host sends after layout load)
  syncFullState() {
    const nodeStates = this.app.canvas.nodes.map(n => ({
      id: n.id, status: n.status, x: n.x, y: n.y,
    }));
    this.broadcast({ type: 'STATE_SYNC', nodeStates });
  }

  // ── Private ────────────────────────────────────────────────────────────────
  _connect() {
    this.channel = new BroadcastChannel(`aetheris_battle_${this.sessionId}`);

    this.channel.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || msg._sender === this.role) return; // Ignore own echoes

      switch (msg.type) {
        case 'PEER_JOIN':
          this.peerConnected = true;
          clearTimeout(this._peerTimeout);
          this.broadcast({ type: 'PEER_JOIN', role: this.role }); // Echo back
          if (this.onPeerConnected) this.onPeerConnected(msg._sender);
          if (this.role === 'blue') setTimeout(() => this.syncFullState(), 300);
          break;

        case 'PEER_LEAVE':
          this.peerConnected = false;
          if (this.onPeerDisconnected) this.onPeerDisconnected();
          break;

        case 'HEARTBEAT':
          clearTimeout(this._peerTimeout);
          this._resetPeerTimeout();
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

        default:
          if (this.onMessage) this.onMessage(msg);
      }
    };

    // Heartbeat every 3 s so peer knows we are alive
    this._heartbeatTimer = setInterval(() => this.broadcast({ type: 'HEARTBEAT' }), 3000);
    this._resetPeerTimeout();
  }

  _resetPeerTimeout() {
    clearTimeout(this._peerTimeout);
    this._peerTimeout = setTimeout(() => {
      if (this.peerConnected) {
        this.peerConnected = false;
        if (this.onPeerDisconnected) this.onPeerDisconnected();
      }
    }, 12000); // 12 s without heartbeat = peer gone
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
