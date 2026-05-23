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

    // IMP-6: Flashing alarm banner if pressure or temp is critical
    if (this.alarmTriggered) {
      const flashAlpha = 0.12 + 0.1 * Math.sin(Date.now() / 180);
      ctx.fillStyle = `rgba(239,68,68,${flashAlpha})`;
      ctx.fillRect(0, 0, w, h);
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

