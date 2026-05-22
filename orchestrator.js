class AIOrchestrator {
  constructor(appInstance) {
    this.app = appInstance;
    this.autoMitigate = true;
    this.microsegMode = false;
    
    // Diagnostic alert buffer
    this.alerts = [];
    
    // Command Parser registry (AETHERIS compatibility placeholders)
    this.terminalOutput = null;
    this.terminalInput = null;
    
    // Register UI toggles
    this.setupToggles();
  }

  setupToggles() {
    const chkAuto = document.getElementById('chkAutoMitigate');
    const chkMicro = document.getElementById('chkMicroseg');
    const btnMitigate = document.getElementById('btnMitigateNow');

    if (chkAuto) {
      chkAuto.checked = this.autoMitigate;
      chkAuto.onchange = (e) => {
        this.autoMitigate = e.target.checked;
        this.logSystem(`Auto-Mitigation Engine state updated to: ${this.autoMitigate ? 'ENABLED' : 'DISABLED'}`, 'info');
      };
    }

    if (chkMicro) {
      chkMicro.checked = this.microsegMode;
      chkMicro.onchange = (e) => {
        this.microsegMode = e.target.checked;
        this.executeMicrosegmentation(this.microsegMode);
      };
    }

    if (btnMitigate) {
      btnMitigate.onclick = () => {
        this.logSystem("User triggered manual threat mitigation scan...", "info");
        this.remediateThreats();
      };
    }
  }

  logTerminal(text, type = 'info') {
    const cliOutput = document.getElementById('cliOutput');
    if (cliOutput) {
      const line = document.createElement('div');
      line.className = `cli-line comment-line`;
      if (type === 'danger' || type === 'error') {
        line.className = `cli-line error-line`;
      } else if (type === 'success') {
        line.className = `cli-line success-line`;
      }
      
      const timeStr = document.getElementById('simTimeTicker')?.textContent || "00:00:00.00";
      line.innerHTML = `<span style="color: #53647c;">[${timeStr}] # [SYS-LOG]</span> ${text}`;
      
      cliOutput.appendChild(line);
      cliOutput.scrollTop = cliOutput.scrollHeight;
    }

    // Append critical alert cards to chat feed
    if ((type === 'danger' || type === 'error') && this.app && this.app.appendChatBubble) {
      if (!text.includes('!!!') && !text.includes('PROMPT:')) {
        this.app.appendChatBubble('SYSTEM WARNING', `⚠️ **Anomaly Detected**: ${text}`, 'agent-bubble');
      }
    }
  }

  logSystem(text, type = 'info') {
    this.logTerminal(`[ORCHESTRATOR] ${text}`, type);
  }

  addAlert(title, message, severity = 'warning') {
    // Prevent duplicate alert spam
    if (this.alerts.some(a => a.title === title && !a.resolved)) return;

    const alertId = 'alert_' + Date.now();
    const alertObj = {
      id: alertId,
      title,
      message,
      severity,
      time: document.getElementById('simTimeTicker')?.textContent || '00:00:00.00',
      resolved: false
    };

    this.alerts.unshift(alertObj); // newer alerts first
    this.logTerminal(`[ANOMALY ALERT] ${title}: ${message}`, severity === 'danger' ? 'danger' : 'warning');
    this.renderAlertBoard();
    // Cross-log serious alerts to the Incident Timeline
    if (severity === 'danger' || severity === 'warning') {
      window.appInstance?.logIncident?.(`${title}: ${message}`, severity === 'danger' ? 'critical' : 'warning');
    }
  }

  resolveAlerts() {
    this.alerts.forEach(a => a.resolved = true);
    this.renderAlertBoard();
  }

  renderAlertBoard() {
    const board = document.getElementById('alertBoard');
    board.innerHTML = '';

    const activeAlerts = this.alerts.filter(a => !a.resolved);

    if (activeAlerts.length === 0) {
      board.innerHTML = `
        <div class="alert-placeholder">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="placeholder-icon text-glow-green"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          <span>ALL SYSTEMS STABLE // NO ACTIVE THREATS</span>
        </div>
      `;
      return;
    }

    activeAlerts.forEach(a => {
      const card = document.createElement('div');
      card.className = `alert-item ${a.severity === 'danger' ? 'danger' : 'warning'}`;
      
      card.innerHTML = `
        <div class="alert-item-header">
          <span class="title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg>
            ${a.title}
          </span>
          <span class="time">${a.time}</span>
        </div>
        <div class="alert-item-body">${a.message}</div>
      `;

      board.appendChild(card);
    });
  }

  evaluateState() {
    // 1. Check for physical telemetry anomalies
    const pressure = this.app.sim.pressure;
    const temp = this.app.sim.temp;

    if (pressure > 2.0) {
      this.addAlert('REACTOR OVERPRESSURE', `Pressure peaked at ${pressure.toFixed(2)} MPa. Risk of valve/gasket structural rupture!`, 'danger');
      
      // Feature 9: PLC Safety Instrumented System (SIS) Interlock
      if (this.app.sim.sisInterlock && !this.app.sim.reliefValve) {
        this.logSystem("Actuating PLC Safety Instrumented System (SIS) Interlock Policy IP-99: Excessive pressure detected. Actuating XV-103 vent valve...", "warning");
        this.app.sim.reliefValve = true;
        const statusValve3 = document.getElementById('statusValve3');
        if (statusValve3) {
          statusValve3.textContent = 'OPEN (SIS ACTIVE)';
          statusValve3.className = 'valve-status font-mono text-green';
        }
      }
      
      // Auto-remediation safety policy
      if (this.autoMitigate && !this.app.sim.reliefValve) {
        this.logSystem("Applying Safety Policy IP-09: Excessive pressure vector detected. Depressurizing...", "warning");
        this.app.sim.reliefValve = true;
        const sv3 = document.getElementById('statusValve3');
        if (sv3) { sv3.textContent = 'OPEN (AUTO AI)'; sv3.className = 'valve-status font-mono text-green'; }
        this.logSystem("Emergency Vent Valve XV-103 actuated successfully.", "success");
      }
    }

    if (temp > 80.0) {
      this.addAlert('THERMAL RUNAWAY WARNING', `Reactor temperature critical: ${temp.toFixed(1)} °C. High exothermic speed!`, 'danger');
    }

    // 2. Check for network device compromise
    const engWs = this.app.canvas.nodes.find(n => n.id === 'ENG-WS');
    const plc101 = this.app.canvas.nodes.find(n => n.id === 'PLC-101');
    const plc102 = this.app.canvas.nodes.find(n => n.id === 'PLC-102');

    if (engWs && engWs.status === 'compromised') {
      this.addAlert('LATERAL MOVEMENT THREAT', 'Host ENG-WS displaying unauthorized outbound Modbus commands.', 'warning');
      
      if (this.autoMitigate) {
        this.logSystem('Deploying Containment Playbook (AI-CP-14): Host ENG-WS showing threat markers.', 'warning');
        this.isolateNode('ENG-WS');
      }
    }

    if (plc101 && plc101.status === 'compromised') {
      this.addAlert('PLC FIRMWARE TAMPERING', 'PLC-101 inlet actuator control values overridden by rogue IP.', 'danger');
      if (this.autoMitigate && !this.microsegMode) {
        this.logSystem('Autonomous Response: Isolating network links adjacent to PLC-101.', 'warning');
        const chkMicro = document.getElementById('chkMicroseg');
        if (chkMicro) chkMicro.checked = true;
        this.executeMicrosegmentation(true);
      }
    }
  }

  isolateNode(nodeId) {
    const node = this.app.canvas.nodes.find(n => n.id === nodeId);
    if (!node) return;

    node.status = 'isolated';
    
    // Sever adjacent links visually
    this.app.canvas.links.forEach(link => {
      if (link.sourceId === nodeId || link.targetId === nodeId) {
        link.status = 'isolated';
      }
    });

    this.logSystem(`Asset [${node.name}] successfully segmented and isolated. Firewall rules modified.`, 'success');
    this.app.updateSidebarProfile();
  }

  remediateThreats() {
    let cleaned = false;
    
    this.app.canvas.nodes.forEach(n => {
      if (n.status === 'compromised' || n.status === 'isolated') {
        n.status = 'stable';
        n.vulnerable = false;
        
        // Restore links
        this.app.canvas.links.forEach(l => {
          if (l.sourceId === n.id || l.targetId === n.id) {
            l.status = 'normal';
          }
        });
        
        this.logSystem(`Firmware restored & vulnerability patched for: [${n.name}]`, 'success');
        cleaned = true;
      }
    });

    // Reset physics compromises
    this.app.sim.inletValve = 52;
    this.app.sim.outletValve = 45;
    this.app.sim.reliefValve = false;

    const vs1 = document.getElementById('valveSlider1');
    const vs2 = document.getElementById('valveSlider2');
    const sv1 = document.getElementById('statusValve1');
    const sv2 = document.getElementById('statusValve2');
    const sv3 = document.getElementById('statusValve3');
    if (vs1) vs1.value = 52;
    if (vs2) vs2.value = 45;
    if (sv1) sv1.textContent = 'OPEN (52%)';
    if (sv2) sv2.textContent = 'OPEN (45%)';
    if (sv3) { sv3.textContent = 'CLOSED'; sv3.className = 'valve-status font-mono text-red'; }

    if (cleaned) {
      this.resolveAlerts();
      this.logSystem("All detected threat signatures remediated. Network integrity check: OK.", "success");
    } else {
      this.logSystem("No threat vectors active. Systems clean.", "info");
    }
    
    this.app.updateSidebarProfile();
  }

  executeMicrosegmentation(enable) {
    this.microsegMode = enable;
    
    // Sever/Restore bridge links between IT zone boundary and OT switch
    const borderLink = this.app.canvas.links.find(l => 
      (l.sourceId === 'FW-01' && l.targetId === 'OT-SW') ||
      (l.sourceId === 'OT-SW' && l.targetId === 'FW-01')
    );

    if (borderLink) {
      borderLink.status = enable ? 'isolated' : 'normal';
    }

    // Sever/Restore PLC engineering channels, preserving sensor telemetry
    this.app.canvas.nodes.forEach(n => {
      if (n.type === 'plc') {
        this.app.canvas.links.forEach(link => {
          if ((link.sourceId === n.id || link.targetId === n.id) && 
              (link.sourceId === 'OT-SW' || link.targetId === 'OT-SW')) {
            link.status = enable ? 'isolated' : 'normal';
          }
        });
      }
    });

    this.logSystem(`ICS Boundary Microsegmentation rules: ${enable ? 'ENGAGED (IT-OT bridge decoupled)' : 'DISENGAGED'}`, enable ? 'warning' : 'info');
  }

  // Parses interactive text prompt submissions in bottom console
  handleCommand(cmdText) {
    const raw = cmdText.trim();
    if (!raw) return;

    this.logTerminal(`AETHERIS > ${raw}`, 'user');
    
    const parts = raw.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts[1];

    switch (cmd) {
      case 'help':
        this.logTerminal("Available commands:");
        this.logTerminal("  status             - Output full cyber-physical twin vectors");
        this.logTerminal("  isolate [node]     - Sever firewall connections to specified host (e.g. ENG-WS)");
        this.logTerminal("  mitigate           - Execute manual firmware patching and link repairs");
        this.logTerminal("  playbook [id]      - Run playbook: 'microseg' / 'vent' / 'reset'");
        this.logTerminal("  actuate [v] [val]  - Modify valve parameters: 'v101' / 'v102' / 'xv103' [0-100]");
        this.logTerminal("  clear              - Wipe console history logs");
        break;

      case 'status':
        this.logTerminal(`Twin State Vector:`);
        this.logTerminal(`  - Reactor Temp: ${this.app.sim.temp.toFixed(1)} °C`);
        this.logTerminal(`  - Pressure: ${this.app.sim.pressure.toFixed(2)} MPa`);
        this.logTerminal(`  - Water Level: ${this.app.sim.level.toFixed(1)} %`);
        
        const compromisedNodes = this.app.canvas.nodes.filter(n => n.status === 'compromised');
        this.logTerminal(`  - Compromised nodes: ${compromisedNodes.length > 0 ? compromisedNodes.map(n => n.id).join(', ') : 'None'}`);
        break;

      case 'isolate':
        if (!arg) {
          this.logTerminal("Usage: isolate [Device ID] (e.g., isolate ENG-WS)", "warning");
        } else {
          this.isolateNode(arg);
        }
        break;

      case 'mitigate':
        this.remediateThreats();
        break;

      case 'clear':
        if (this.terminalOutput) this.terminalOutput.innerHTML = '';
        const cliOutput = document.getElementById('cliOutput');
        if (cliOutput) cliOutput.innerHTML = '';
        break;

      case 'playbook':
        if (arg === 'microseg') {
          const _cm = document.getElementById('chkMicroseg');
          if (_cm) _cm.checked = true;
          this.executeMicrosegmentation(true);
        } else if (arg === 'vent') {
          this.app.sim.reliefValve = true;
          const _sv3 = document.getElementById('statusValve3');
          if (_sv3) _sv3.textContent = 'OPEN (MANUAL CLI)';
          this.logSystem("Venting process triggered via terminal actuate mandate.", "success");
        } else if (arg === 'reset') {
          this.app.resetTwin();
        } else {
          this.logTerminal("Unknown playbook identifier. Try 'microseg' or 'vent'.", "warning");
        }
        break;

      case 'actuate':
        if (parts.length < 3) {
          this.logTerminal("Usage: actuate [v101|v102] [0-100]  OR  actuate xv103 [open|close]", "warning");
          break;
        }
        const val = parseInt(parts[2]);
        if (parts[1].toLowerCase() === 'v101') {
          this.app.sim.inletValve = Math.max(0, Math.min(100, val));
          const _vs1 = document.getElementById('valveSlider1');
          const _sv1 = document.getElementById('statusValve1');
          if (_vs1) _vs1.value = this.app.sim.inletValve;
          if (_sv1) _sv1.textContent = `OPEN (${this.app.sim.inletValve}%)`;
          this.logTerminal(`Actuator command: Inlet Valve V-101 configured to ${this.app.sim.inletValve}%`);
        } else if (parts[1].toLowerCase() === 'v102') {
          this.app.sim.outletValve = Math.max(0, Math.min(100, val));
          const _vs2 = document.getElementById('valveSlider2');
          const _sv2 = document.getElementById('statusValve2');
          if (_vs2) _vs2.value = this.app.sim.outletValve;
          if (_sv2) _sv2.textContent = `OPEN (${this.app.sim.outletValve}%)`;
          this.logTerminal(`Actuator command: Outlet Valve V-102 configured to ${this.app.sim.outletValve}%`);
        } else if (parts[1].toLowerCase() === 'xv103') {
          const actState = parts[2].toLowerCase() === 'open';
          this.app.sim.reliefValve = actState;
          const _sv3 = document.getElementById('statusValve3');
          if (_sv3) { _sv3.textContent = actState ? 'OPEN (CLI)' : 'CLOSED'; _sv3.className = actState ? 'valve-status font-mono text-green' : 'valve-status font-mono text-red'; }
          this.logTerminal(`Actuator command: Relief Solenoid Valve XV-103 ${actState ? 'OPENED' : 'CLOSED'}`);
        }
        break;

      default:
        this.app.queryAI(raw);
    }
  }
}
