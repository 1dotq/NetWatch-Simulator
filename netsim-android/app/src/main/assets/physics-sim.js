class ReactorPhysicsSim {
  constructor(chartCanvasId) {
    this.canvas = document.getElementById(chartCanvasId);
    this.ctx = this.canvas.getContext('2d');
    
    // Core physical state variables
    this.level = 65.8; // %
    this.pressure = 1.22; // MPa
    this.temp = 42.5; // °C
    
    // Physical actuators control states (0-100)
    this.inletValve = 52;
    this.outletValve = 45;
    this.reliefValve = false; // XV-103
    
    // Constants & Limits
    this.nominalTemp = 42.5;
    this.nominalPressure = 1.22;
    this.nominalLevel = 65.8;
    this.criticalPressure = 2.5; // MPa
    this.criticalTemp = 90.0; // °C

    // Diagnostics / Attack vectors
    this.integrityBreached = false;
    this.compromisedSensorReadings = false; // Stuxnet mode

    // SIS interlock tracking
    this.sisInterlock = true;
    
    // Data history for high fidelity charts (last 60 frames)
    this.historyLength = 60;
    this.history = {
      level: Array(this.historyLength).fill(this.level),
      pressure: Array(this.historyLength).fill(this.pressure),
      temp: Array(this.historyLength).fill(this.temp)
    };

    // IMP-1: Track peak values for alarm telemetry
    this.peakPressure = this.pressure;
    this.peakTemp = this.temp;
    this.alarmTriggered = false;

    this.resize();
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.resize();
        this.drawChart();
      }, 100);
    });
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  reset() {
    this.level    = this.nominalLevel;
    this.pressure = this.nominalPressure;
    this.temp     = this.nominalTemp;
    this.inletValve  = 52;
    this.outletValve = 45;
    this.reliefValve = false;
    this.integrityBreached = false;
    this.compromisedSensorReadings = false;
    this.peakPressure = this.nominalPressure;
    this.peakTemp = this.nominalTemp;
    this.alarmTriggered = false;
    this.history = {
      level:    Array(this.historyLength).fill(this.nominalLevel),
      pressure: Array(this.historyLength).fill(this.nominalPressure),
      temp:     Array(this.historyLength).fill(this.nominalTemp)
    };
  }

  step(dt, speedDilation) {
    // Time scaling coefficient
    const t = dt * speedDilation * 0.001;

    // Mass Balance Differential Equations:
    // Flow Rate (Q_in & Q_out)
    const qIn = (this.inletValve / 100) * 8.5; // Max 8.5 L/s
    const qOut = (this.outletValve / 100) * 7.8 * Math.sqrt(this.level / 50); // Max 7.8 L/s, Torricelli's law

    // Change in volume (liquid level %)
    const dLevel = (qIn - qOut) * 0.5 * t;
    this.level = Math.max(2, Math.min(99, this.level + dLevel));

    // Thermal Balance Equations:
    // Reactor heat generation is related to internal reactions (nominal 12kW)
    let reactionHeat = 14.5;
    
    // If pressure increases, reaction rate increases (positive thermal feedback loop)
    if (this.pressure > 1.8) {
      reactionHeat += (this.pressure - 1.8) * 12.0;
    }

    // Feature 45: Exothermic reaction acceleration coefficient (positive feedback)
    if (this.temp > 70.0) {
      reactionHeat += (this.temp - 70.0) * 1.5;
    }
    
    // Cooling is proportional to water volume/level
    const coolingRate = 0.22 * this.level;
    const dTemp = (reactionHeat - coolingRate) * 0.3 * t;
    this.temp = Math.max(15, Math.min(130, this.temp + dTemp));

    // Gas-Law Thermodynamic Pressure calculations:
    const headSpace = 101 - this.level;
    const pressureMultiplier = 2.0;
    const targetPressure = (this.temp * 0.015) * (60 / headSpace) * pressureMultiplier;

    const pressureApproachRate = 0.8;
    this.pressure += (targetPressure - this.pressure) * Math.min(1, pressureApproachRate * t);

    // Relief Valve Venting
    if (this.reliefValve) {
      const ventFactor = 4.8 * t;
      this.pressure = Math.max(0.12, this.pressure - ventFactor);
      this.temp = Math.max(20, this.temp - 8.0 * t);
      this.level = Math.max(5, this.level - 1.8 * t); // liquid escaping as gas/vapor
    }

    this.pressure = Math.max(0.05, Math.min(4.0, this.pressure));

    // IMP-1: Track running peak values
    if (this.pressure > this.peakPressure) this.peakPressure = this.pressure;
    if (this.temp > this.peakTemp) this.peakTemp = this.temp;

    // IMP-2: Alarm triggered flag
    if (this.pressure > this.criticalPressure || this.temp > this.criticalTemp) {
      this.alarmTriggered = true;
    }

    // Capture telemetry history
    this.history.level.push(this.level);
    this.history.pressure.push(this.pressure);
    this.history.temp.push(this.temp);

    // Shift arrays to maintain constant length
    if (this.history.level.length > this.historyLength) {
      this.history.level.shift();
      this.history.pressure.shift();
      this.history.temp.shift();
    }
  }

  drawChart() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    ctx.clearRect(0, 0, w, h);

    // IMP-3: Subtle dot-grid background for chart area
    ctx.fillStyle = 'rgba(56, 189, 248, 0.04)';
    for (let gx = 8; gx < w; gx += 16) {
      for (let gy = 8; gy < h; gy += 16) {
        ctx.beginPath();
        ctx.arc(gx, gy, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // IMP-4: Draw critical pressure alarm threshold line
    const critPressY = h - 5 - ((this.criticalPressure / 3.5)) * (h - 10);
    ctx.save();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, critPressY);
    ctx.lineTo(w, critPressY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.font = '600 6px Fira Code';
    ctx.textAlign = 'left';
    ctx.fillText('CRIT', 4, critPressY - 2);
    ctx.restore();

    const isEco = document.body.classList.contains('perf-mode-eco');
    const dx = w / (this.historyLength - 1);

    // IMP-5: Gradient area fill helper for visual depth
    const drawAreaLine = (data, minVal, maxVal, lineColor, gradTop, gradBot) => {
      ctx.save();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      if (!isEco) {
        ctx.shadowColor = lineColor;
        ctx.shadowBlur = 5;
      }

      // Build path
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const norm = (data[i] - minVal) / (maxVal - minVal);
        const y = h - 5 - norm * (h - 10);
        const x = i * dx;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Gradient fill underneath the line
      if (!isEco) {
        const fillPath = new Path2D();
        for (let i = 0; i < data.length; i++) {
          const norm = (data[i] - minVal) / (maxVal - minVal);
          const y = h - 5 - norm * (h - 10);
          const x = i * dx;
          if (i === 0) fillPath.moveTo(x, y);
          else fillPath.lineTo(x, y);
        }
        fillPath.lineTo((data.length - 1) * dx, h);
        fillPath.lineTo(0, h);
        fillPath.closePath();

        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, gradTop);
        grad.addColorStop(1, gradBot);
        ctx.fillStyle = grad;
        ctx.fill(fillPath);
      }
      ctx.restore();
    };

    // Draw telemetry flows (scaled for comparison in single panel)
    // 1. Level (Blue) - scaled 0 to 100 %
    drawAreaLine(this.history.level, 0, 100, '#3b82f6', 'rgba(59,130,246,0.18)', 'rgba(59,130,246,0.0)');

    // 2. Pressure (Amber/Crimson depending on danger)
    let pColor = '#ffaa00';
    let pGlow = 'rgba(255, 170, 0, 0.3)';
    if (this.pressure > this.criticalPressure) {
      pColor = '#ff0055';
      pGlow = 'rgba(255, 0, 85, 0.4)';
    }
    drawAreaLine(this.history.pressure, 0, 3.5, pColor, `rgba(255,170,0,0.15)`, `rgba(255,170,0,0.0)`);

    // 3. Temp (Cyan) - scaled 10 to 110 °C
    drawAreaLine(this.history.temp, 10, 110, '#00f0ff', 'rgba(0,240,255,0.12)', 'rgba(0,240,255,0.0)');

    // IMP-6: Flashing alarm banner - Deactivated/Neutered for neutral theme
    if (this.alarmTriggered) {
      // Clean static non-intrusive border styling
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, w, h);
    }

    // Render tiny glowing state labels in corner
    ctx.font = '600 8px var(--font-sans), sans-serif';
    ctx.textAlign = 'right';
    
    ctx.fillStyle = '#3b82f6';
    ctx.fillText('LEVEL %', w - 10, 15);
    
    ctx.fillStyle = pColor;
    ctx.fillText('PRESS MPa', w - 10, 25);
    
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('TEMP °C', w - 10, 35);

    // IMP-7: Mini live readout numerics at bottom left
    ctx.textAlign = 'left';
    ctx.font = '700 7px Fira Code';
    ctx.fillStyle = '#3b82f6';
    ctx.fillText(`LVL ${this.level.toFixed(1)}%`, 6, h - 18);
    ctx.fillStyle = pColor;
    ctx.fillText(`PRS ${this.pressure.toFixed(2)}M`, 6, h - 10);
    ctx.fillStyle = '#00f0ff';
    ctx.fillText(`TMP ${this.temp.toFixed(1)}°C`, 60, h - 10);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TASK-11: Water Treatment Plant Physics Twin
// ═══════════════════════════════════════════════════════════════════════
class WaterTreatmentSim {
  constructor() {
    // Nominal operating state
    this.rawFlow      = 45.0;  // L/s intake from source
    this.turbidity    = 3.2;   // NTU (< 1 = clear)
    this.chlorineLevel = 1.8;  // mg/L residual (target 0.5–2.0)
    this.reservoirLevel = 72.0; // % full
    this.pH           = 7.4;   // target 7.0–7.6

    // Actuator states
    this.pumpSpeed    = 70;    // % (0–100)
    this.dosePump     = 60;    // % chlorine dosing pump (0–100)
    this.filterBackwash = false; // backwash cycle active

    // Attack/fault flags
    this.chlorineAttack    = false; // attacker raising dose to toxic level
    this.pumpSabotaged     = false; // pump RPM locked to 0
    this.sensorSpoofed     = false; // SCADA sees false low chlorine

    // History for charting (60 frames)
    this.historyLength = 60;
    this.history = {
      turbidity:     Array(this.historyLength).fill(this.turbidity),
      chlorine:      Array(this.historyLength).fill(this.chlorineLevel),
      reservoir:     Array(this.historyLength).fill(this.reservoirLevel),
    };
  }

  reset() {
    this.rawFlow       = 45.0;
    this.turbidity     = 3.2;
    this.chlorineLevel = 1.8;
    this.reservoirLevel = 72.0;
    this.pH            = 7.4;
    this.pumpSpeed     = 70;
    this.dosePump      = 60;
    this.filterBackwash = false;
    this.chlorineAttack = false;
    this.pumpSabotaged  = false;
    this.sensorSpoofed  = false;
    this.history = {
      turbidity: Array(this.historyLength).fill(this.turbidity),
      chlorine:  Array(this.historyLength).fill(this.chlorineLevel),
      reservoir: Array(this.historyLength).fill(this.reservoirLevel),
    };
  }

  step(dt, speedDilation) {
    const t = dt * speedDilation * 0.001;

    // Effective pump speed (sabotage locks it to 0)
    const effectivePump = this.pumpSabotaged ? 0 : this.pumpSpeed;

    // Reservoir dynamics: pump fills it, consumption drains it
    const fillRate   = (effectivePump / 100) * this.rawFlow * 0.04;
    const drainRate  = 1.2 + Math.random() * 0.4; // municipal demand
    const dReservoir = (fillRate - drainRate) * t;
    this.reservoirLevel = Math.max(0, Math.min(100, this.reservoirLevel + dReservoir));

    // Turbidity drops during filtration; backwash temporarily spikes it
    if (this.filterBackwash) {
      this.turbidity = Math.min(18, this.turbidity + 3.5 * t);
    } else {
      const filterEff = (effectivePump > 10) ? 0.6 : 0.05;
      this.turbidity = Math.max(0.2, this.turbidity - filterEff * t + (Math.random() - 0.5) * 0.08 * t);
    }

    // Chlorine dosing — attack drives dose to dangerous level
    const targetCl = this.chlorineAttack ? 8.5 : (this.dosePump / 100) * 3.0;
    this.chlorineLevel += (targetCl - this.chlorineLevel) * 0.15 * t;
    this.chlorineLevel = Math.max(0, Math.min(12, this.chlorineLevel));

    // pH drifts with chlorine changes
    const targetPh = 7.4 - (this.chlorineLevel - 1.8) * 0.08;
    this.pH += (targetPh - this.pH) * 0.1 * t;
    this.pH = Math.max(5.5, Math.min(9.5, this.pH));

    // Record history
    this.history.turbidity.push(this.turbidity);
    this.history.chlorine.push(this.chlorineLevel);
    this.history.reservoir.push(this.reservoirLevel);
    if (this.history.turbidity.length > this.historyLength) {
      this.history.turbidity.shift();
      this.history.chlorine.shift();
      this.history.reservoir.shift();
    }
  }

  isChlorineAlarm() { return this.chlorineLevel > 4.0 || this.chlorineLevel < 0.2; }
  isReservoirAlarm() { return this.reservoirLevel < 15 || this.reservoirLevel > 97; }
  isTurbidityAlarm() { return this.turbidity > 5.0; }
}


// ═══════════════════════════════════════════════════════════════════════
// Power Grid Substation Physics Twin
// Models a 138 kV transmission substation with swing-equation frequency
// dynamics, reactive power voltage control, and protection relay logic.
// ═══════════════════════════════════════════════════════════════════════
class PowerGridSim {
  constructor() {
    // Nominal operating point
    this.frequency    = 60.00;  // Hz (NERC limit: 59.95–60.05)
    this.voltage      = 138.0;  // kV at HV bus (nominal 138 kV)
    this.loadMW       = 85.0;   // MW demand
    this.genOutputMW  = 90.0;   // MW generation dispatch
    this.powerFactor  = 0.92;   // lagging
    this.reactiveMVAR = 12.0;   // MVAR generated

    // Inertia constant H (MWs/MVA) — governs how fast freq swings
    this.inertiaH = 4.5;
    this.ratedMVA = 150.0;

    // Circuit breaker states (true = closed / energised)
    this.cb1 = true;   // Feeder A
    this.cb2 = true;   // Feeder B
    this.cb3 = true;   // Bus-tie
    this.tapPosition = 0; // transformer tap (-3 to +3, each step ±1.5 kV)

    // Protection relay state
    this.protectionEnabled = true;
    this.underFreqRelay    = true;   // UFR trips load at <59.5 Hz
    this.overVoltRelay     = true;   // OVR trips at >145 kV

    // Brownout / blackout thresholds
    this.brownoutFreq  = 59.3;  // Hz
    this.blackoutFreq  = 58.5;  // Hz
    this.brownoutVolt  = 124.0; // kV
    this.blackoutVolt  = 110.0; // kV

    // Attack / fault flags
    this.falseDataInjection = false; // FDI: SCADA sees spoofed readings
    this.breakerSabotage    = false; // CrashOverride: auto-trips CB1+CB2
    this.protectionDisabled = false; // disables all relay protection
    this.loadSheddingActive = false;

    // Running state flags
    this.brownout  = false;
    this.blackout  = false;
    this.alarmLog  = [];

    // History for chart (60 frames)
    this.historyLength = 60;
    this.history = {
      frequency: Array(this.historyLength).fill(this.frequency),
      voltage:   Array(this.historyLength).fill(this.voltage),
      loadMW:    Array(this.historyLength).fill(this.loadMW),
    };
  }

  reset() {
    this.frequency    = 60.00;
    this.voltage      = 138.0;
    this.loadMW       = 85.0;
    this.genOutputMW  = 90.0;
    this.powerFactor  = 0.92;
    this.reactiveMVAR = 12.0;
    this.cb1 = true; this.cb2 = true; this.cb3 = true;
    this.tapPosition = 0;
    this.protectionEnabled   = true;
    this.underFreqRelay      = true;
    this.overVoltRelay       = true;
    this.falseDataInjection  = false;
    this.breakerSabotage     = false;
    this.protectionDisabled  = false;
    this.loadSheddingActive  = false;
    this.brownout = false;
    this.blackout = false;
    this.alarmLog = [];
    this.history = {
      frequency: Array(this.historyLength).fill(this.frequency),
      voltage:   Array(this.historyLength).fill(this.voltage),
      loadMW:    Array(this.historyLength).fill(this.loadMW),
    };
  }

  step(dt, speedDilation) {
    const t = dt * speedDilation * 0.001;

    // CrashOverride attack: randomly trip breakers every ~5s
    if (this.breakerSabotage && Math.random() < 0.008 * speedDilation) {
      if (this.cb1) { this.cb1 = false; this._addAlarm('CB-1 TRIPPED — CrashOverride attack', 'critical'); }
      if (this.cb2) { this.cb2 = false; this._addAlarm('CB-2 TRIPPED — CrashOverride attack', 'critical'); }
    }

    // Count energised feeders
    const feedersOnline = (this.cb1 ? 1 : 0) + (this.cb2 ? 1 : 0);
    const busConnected  = this.cb3;

    // Load available through open breakers
    const loadFraction = feedersOnline === 0 ? 0 : feedersOnline === 1 ? 0.55 : 1.0;
    const effectiveLoad = this.loadMW * loadFraction * (busConnected ? 1 : 0.5);

    // Load shedding reduces demand
    const demand = this.loadSheddingActive ? effectiveLoad * 0.65 : effectiveLoad;

    // Small random demand fluctuation (±2 MW)
    const demandNoise = (Math.random() - 0.5) * 2.0 * t;

    // Swing equation: df/dt = (Pm - Pe) * f0 / (2H * S_rated)
    // Simplified: df = (gen - demand) / (2 * H) * t * scaleFactor
    const imbalance = this.genOutputMW - (demand + demandNoise);
    const dFreq = imbalance / (2.0 * this.inertiaH) * t * 1.5;
    this.frequency = Math.max(57.0, Math.min(62.5, this.frequency + dFreq));

    // Governor response: generator ramps to close freq error slowly
    const freqError = 60.0 - this.frequency;
    this.genOutputMW += freqError * 3.0 * t;
    this.genOutputMW = Math.max(0, Math.min(this.ratedMVA, this.genOutputMW));

    // Voltage: driven by reactive power balance + tap changer
    const tapVoltageDelta = this.tapPosition * 1.5; // kV per tap step
    const reactiveDeficit = this.reactiveMVAR - demand * 0.15;
    const targetVoltage = 138.0 + tapVoltageDelta + reactiveDeficit * 0.3;
    this.voltage += (targetVoltage - this.voltage) * 0.25 * t;

    // Voltage collapses when feeders are offline
    if (feedersOnline === 0) {
      this.voltage = Math.max(0, this.voltage - 15.0 * t);
    }
    this.voltage = Math.max(0, Math.min(160.0, this.voltage));

    // Power factor drifts slightly
    this.powerFactor += ((0.92 - this.powerFactor) * 0.1 + (Math.random() - 0.5) * 0.005) * t;
    this.powerFactor = Math.max(0.7, Math.min(1.0, this.powerFactor));

    // ── Protection relay actions ──────────────────────────────────────────
    if (!this.protectionDisabled) {
      if (this.underFreqRelay && this.frequency < 59.3 && !this.loadSheddingActive) {
        this.loadSheddingActive = true;
        this._addAlarm('UFR OPERATED — Automatic load shedding initiated', 'warning');
      }
      if (this.overVoltRelay && this.voltage > 145.0) {
        if (this.cb3) { this.cb3 = false; this._addAlarm('OVR OPERATED — Bus-tie CB-3 tripped (overvoltage)', 'warning'); }
      }
    }

    // ── Brownout / blackout state ─────────────────────────────────────────
    this.brownout = this.frequency < this.brownoutFreq || this.voltage < this.brownoutVolt;
    this.blackout = this.frequency < this.blackoutFreq  || this.voltage < this.blackoutVolt;

    if (this.blackout) this._addAlarm('BLACKOUT — Bus voltage/frequency collapsed', 'critical');

    // History
    this.history.frequency.push(this.frequency);
    this.history.voltage.push(this.voltage);
    this.history.loadMW.push(demand);
    if (this.history.frequency.length > this.historyLength) {
      this.history.frequency.shift();
      this.history.voltage.shift();
      this.history.loadMW.shift();
    }
  }

  _addAlarm(msg, level) {
    // Deduplicate within 3-second window
    const now = Date.now();
    if (this.alarmLog.length && this.alarmLog[this.alarmLog.length - 1].msg === msg && now - this.alarmLog[this.alarmLog.length - 1].ts < 3000) return;
    this.alarmLog.push({ msg, level, ts: now });
    if (this.alarmLog.length > 20) this.alarmLog.shift();
  }

  isFreqAlarm()    { return this.frequency < 59.5 || this.frequency > 60.5; }
  isVoltageAlarm() { return this.voltage < 124.0  || this.voltage > 145.0; }
  isBlackout()     { return this.blackout; }

  // SCADA-visible readings — spoofed when FDI active
  scadaFreq()    { return this.falseDataInjection ? 60.01 : this.frequency; }
  scadaVoltage() { return this.falseDataInjection ? 138.3 : this.voltage; }
  scadaLoad()    { return this.falseDataInjection ? 85.0  : this.history.loadMW[this.history.loadMW.length - 1] || this.loadMW; }
}

