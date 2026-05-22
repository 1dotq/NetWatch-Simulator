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
    
    // Data history for high fidelity charts (last 60 frames)
    this.historyLength = 60;
    this.history = {
      level: Array(this.historyLength).fill(this.level),
      pressure: Array(this.historyLength).fill(this.pressure),
      temp: Array(this.historyLength).fill(this.temp)
    };

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
    // P * V = n * R * T -> equilibrium pressure is proportional to temp and
    // inversely proportional to headspace (101 - Level).
    const headSpace = 101 - this.level;
    const pressureMultiplier = 2.0;
    const targetPressure = (this.temp * 0.015) * (60 / headSpace) * pressureMultiplier;

    // Pressure is an integrated state, not a per-frame snapshot: relax it toward
    // the gas-law equilibrium with a first-order lag so transient actuator
    // effects (relief venting) persist instead of being overwritten each tick.
    const pressureApproachRate = 0.8; // per second
    this.pressure += (targetPressure - this.pressure) * Math.min(1, pressureApproachRate * t);

    // Relief Valve Venting dynamic: subtracts from the integrated state, so an
    // open valve holds pressure down against the heat source across ticks.
    if (this.reliefValve) {
      const ventFactor = 4.8 * t;
      this.pressure = Math.max(0.12, this.pressure - ventFactor);
      this.temp = Math.max(20, this.temp - 8.0 * t);
      this.level = Math.max(5, this.level - 1.8 * t); // liquid escaping as gas/vapor
    }

    this.pressure = Math.max(0.05, Math.min(4.0, this.pressure));

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

    // Draw Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const isEco = document.body.classList.contains('perf-mode-eco');
    // Plot helper
    const drawLine = (data, minVal, maxVal, color, shadowColor) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (!isEco) {
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = 6;
      }
      ctx.beginPath();

      const dx = w / (this.historyLength - 1);
      for (let i = 0; i < data.length; i++) {
        const val = data[i];
        // Map value to canvas height
        const norm = (val - minVal) / (maxVal - minVal);
        const y = h - 5 - norm * (h - 10);
        const x = i * dx;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.restore();
    };

    // Draw telemetry flows (scaled for comparison in single panel)
    // 1. Level (Blue) - scaled 0 to 100 %
    drawLine(this.history.level, 0, 100, '#3b82f6', 'rgba(59, 130, 246, 0.4)');

    // 2. Pressure (Amber/Crimson depending on danger)
    let pColor = '#ffaa00';
    let pGlow = 'rgba(255, 170, 0, 0.3)';
    if (this.pressure > this.criticalPressure) {
      pColor = '#ff0055';
      pGlow = 'rgba(255, 0, 85, 0.4)';
    }
    drawLine(this.history.pressure, 0, 3.5, pColor, pGlow);

    // 3. Temp (Cyan) - scaled 10 to 110 °C
    drawLine(this.history.temp, 10, 110, '#00f0ff', 'rgba(0, 240, 255, 0.4)');

    // Render tiny glowing state labels in corner
    ctx.font = '600 8px var(--font-sans), sans-serif';
    ctx.textAlign = 'right';
    
    ctx.fillStyle = '#3b82f6';
    ctx.fillText('LEVEL %', w - 10, 15);
    
    ctx.fillStyle = pColor;
    ctx.fillText('PRESS MPa', w - 10, 25);
    
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('TEMP °C', w - 10, 35);
  }
}
