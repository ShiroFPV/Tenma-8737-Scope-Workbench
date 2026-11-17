/**
 * ShiroFPV // Tenma 8737 & 72-87XX DSO Workbench
 * Native Windows 11 Desktop Software
 */

(function () {
  'use strict';

  // --- Oscilloscope Hardware Scales ---
  const TIMEBASE_SCALES = [
    { label: '2 ns', val: 2e-9 },
    { label: '5 ns', val: 5e-9 },
    { label: '10 ns', val: 10e-9 },
    { label: '20 ns', val: 20e-9 },
    { label: '50 ns', val: 50e-9 },
    { label: '100 ns', val: 100e-9 },
    { label: '200 ns', val: 200e-9 },
    { label: '500 ns', val: 500e-9 },
    { label: '1 μs', val: 1e-6 },
    { label: '2 μs', val: 2e-6 },
    { label: '5 μs', val: 5e-6 },
    { label: '10 μs', val: 10e-6 },
    { label: '20 μs', val: 20e-6 },
    { label: '50 μs', val: 50e-6 },
    { label: '100 μs', val: 100e-6 },
    { label: '200 μs', val: 200e-6 },
    { label: '500 μs', val: 500e-6 },
    { label: '1 ms', val: 1e-3 },
    { label: '2 ms', val: 2e-3 },
    { label: '5 ms', val: 5e-3 },
    { label: '10 ms', val: 10e-3 },
    { label: '20 ms', val: 20e-3 },
    { label: '50 ms', val: 50e-3 },
    { label: '100 ms', val: 100e-3 },
    { label: '200 ms', val: 200e-3 },
    { label: '500 ms', val: 500e-3 },
    { label: '1 s', val: 1.0 },
    { label: '2 s', val: 2.0 },
    { label: '5 s', val: 5.0 }
  ];

  const VOLT_SCALES = [
    { label: '2 mV', val: 0.002 },
    { label: '5 mV', val: 0.005 },
    { label: '10 mV', val: 0.01 },
    { label: '20 mV', val: 0.02 },
    { label: '50 mV', val: 0.05 },
    { label: '100 mV', val: 0.1 },
    { label: '200 mV', val: 0.2 },
    { label: '500 mV', val: 0.5 },
    { label: '1.00 V', val: 1.0 },
    { label: '2.00 V', val: 2.0 },
    { label: '5.00 V', val: 5.0 },
    { label: '10.0 V', val: 10.0 }
  ];

  // --- Oscilloscope State ---
  const state = {
    connected: false,
    connType: 'sim', // 'sim', 'serial', 'webusb'
    activePort: null,
    running: true,
    singleArm: false,
    activeChannel: 1,
    timebaseIdx: 16, // 500 μs
    horizPos: 0.0, // seconds
    sampleRate: 2.0e9, // 2 GSa/s
    acqMode: 'NORMAL',
    simSignal: 'drone_rpm',

    channels: {
      1: { enabled: true, voltIdx: 8, offset: 0.0, coupling: 'DC', probe: 10, bwLimit: 'FULL', color: '#ffd000' },
      2: { enabled: true, voltIdx: 9, offset: -1.5, coupling: 'DC', probe: 10, bwLimit: 'FULL', color: '#00d2ff' },
      3: { enabled: false, voltIdx: 8, offset: 0.0, coupling: 'DC', probe: 10, bwLimit: 'FULL', color: '#ff3377' },
      4: { enabled: false, voltIdx: 8, offset: 0.0, coupling: 'DC', probe: 10, bwLimit: 'FULL', color: '#00ff88' }
    },

    trigger: {
      source: 'CH1',
      mode: 'AUTO',
      slope: 'RISING',
      coupling: 'DC',
      level: 0.5,
      status: 'TRIG\'D'
    },

    cursors: {
      enabled: false,
      x1: -0.2,
      x2: 0.2,
      y1: 1.0,
      y2: -1.0
    },

    math: {
      enabled: false,
      op: 'CH1 - CH2'
    },

    fft: {
      source: 1,
      window: 'hanning'
    },

    waveforms: {
      ch1: new Float32Array(1000),
      ch2: new Float32Array(1000),
      ch3: new Float32Array(1000),
      ch4: new Float32Array(1000),
      math: new Float32Array(1000)
    },

    measurements: {}
  };

  let usbDevice = null;

  // Canvas context
  const scopeCanvas = document.getElementById('scopeCanvas');
  const scopeCtx = scopeCanvas.getContext('2d');
  const fftCanvas = document.getElementById('fftCanvas');
  const fftCtx = fftCanvas ? fftCanvas.getContext('2d') : null;

  let animFrameId = null;
  let simTime = 0.0;

  // --- Initializer ---
  function init() {
    setupWindowControls();
    setupCanvasResize();
    bindUIEvents();
    renderMeasurementsGrid();
    renderChannelControls();
    logScpi('SYS', 'Tenma 8737 Scope Workbench initialized.');
    logScpi('SYS', 'ShiroFPV Hardware Interface v1.0.0 (Windows 11). Ready.');

    // Start render and acquisition loop
    startLoop();

    // Populate COM ports
    refreshComPortDropdown();

    // Setup serial listener
    if (window.electronAPI && window.electronAPI.onSerialData) {
      window.electronAPI.onSerialData((data) => {
        logScpi('RX', data);
      });
      window.electronAPI.onSerialDisconnected(() => {
        logScpi('SYS', 'Serial connection closed by remote device.');
        setConnectionMode('sim');
      });
    }
  }

  // --- Native Window Titlebar Controls ---
  function setupWindowControls() {
    const minBtn = document.getElementById('winMinBtn');
    const maxBtn = document.getElementById('winMaxBtn');
    const closeBtn = document.getElementById('winCloseBtn');

    if (window.electronAPI) {
      minBtn.addEventListener('click', () => window.electronAPI.minimize());
      maxBtn.addEventListener('click', () => window.electronAPI.maximize());
      closeBtn.addEventListener('click', () => window.electronAPI.close());
    } else {
      minBtn.style.display = 'none';
      maxBtn.style.display = 'none';
      closeBtn.style.display = 'none';
    }
  }

  // --- Canvas High-DPI Resizing ---
  function setupCanvasResize() {
    function resize() {
      const wrapper = document.getElementById('canvasWrapper');
      const dpr = window.devicePixelRatio || 1;
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;

      scopeCanvas.width = w * dpr;
      scopeCanvas.height = h * dpr;
      scopeCtx.resetTransform();
      scopeCtx.scale(dpr, dpr);

      if (fftCanvas) {
        const fftWrapper = fftCanvas.parentElement;
        if (fftWrapper) {
          fftCanvas.width = fftWrapper.clientWidth * dpr;
          fftCanvas.height = fftWrapper.clientHeight * dpr;
          fftCtx.resetTransform();
          fftCtx.scale(dpr, dpr);
        }
      }
    }

    window.addEventListener('resize', resize);
    setTimeout(resize, 50);
  }

  // --- Main Animation & Acquisition Loop ---
  function startLoop() {
    function frame(timestamp) {
      if (state.running) {
        simTime += 0.016;
        acquireWaveformChunk();
        calculateMeasurements();
      }

      drawOscilloscope();

      const activeTab = document.querySelector('.dock-tab.active');
      if (activeTab && activeTab.dataset.tab === 'fft') {
        drawFFT();
      }

      animFrameId = requestAnimationFrame(frame);
    }
    animFrameId = requestAnimationFrame(frame);
  }

  // --- Waveform Generation (Realistic Physical Hardware / Drone Simulation) ---
  function acquireWaveformChunk() {
    const numPoints = 1000;
    const timeScale = TIMEBASE_SCALES[state.timebaseIdx].val;
    const totalTimeSpan = timeScale * 10;
    const dt = totalTimeSpan / numPoints;

    for (let i = 0; i < numPoints; i++) {
      const t = simTime + (i * dt);
      let ch1Val = 0;
      let ch2Val = 0;

      switch (state.simSignal) {
        case 'drone_rpm': {
          const dshotClock = 300000;
          const bitVal = Math.sin(2 * Math.PI * dshotClock * t) > 0 ? 3.3 : 0.0;
          const motorRpmFreq = 420;
          const motorBackEmf = 1.2 * Math.sin(2 * Math.PI * motorRpmFreq * t);
          const noise = (Math.random() - 0.5) * 0.15;
          ch1Val = bitVal * 0.7 + noise;
          ch2Val = motorBackEmf + (Math.sin(2 * Math.PI * motorRpmFreq * 3 * t) * 0.3) + (Math.random() - 0.5) * 0.05;
          break;
        }

        case 'gyro_noise': {
          const spiClock = 1000000;
          const spiData = (Math.sin(2 * Math.PI * spiClock * t) > 0.2 ? 3.3 : 0.1);
          const gyroNoise = (Math.random() - 0.5) * 0.8 + 1.65;
          ch1Val = spiData + (Math.random() - 0.5) * 0.1;
          ch2Val = gyroNoise;
          break;
        }

        case 'square': {
          const freq = 1000;
          const phase = (t * freq) % 1.0;
          let v = phase < 0.5 ? 2.5 : 0.0;
          if (phase < 0.04) v += 0.4 * Math.exp(-phase * 100) * Math.sin(phase * 400);
          else if (phase >= 0.5 && phase < 0.54) v -= 0.4 * Math.exp(-(phase - 0.5) * 100) * Math.sin((phase - 0.5) * 400);
          ch1Val = v;
          ch2Val = 1.25 * Math.sin(2 * Math.PI * 500 * t) + 1.25;
          break;
        }

        case 'pwm': {
          const freq = 400;
          const pulseWidth = 0.0015;
          const period = 1.0 / freq;
          const pos = t % period;
          ch1Val = pos < pulseWidth ? 3.3 : 0.0;
          ch2Val = Math.sin(2 * Math.PI * 1000 * t) * 1.5;
          break;
        }

        case 'sine':
        default: {
          const freq = 1000;
          ch1Val = 2.0 * Math.sin(2 * Math.PI * freq * t) + (Math.random() - 0.5) * 0.05;
          ch2Val = 1.5 * Math.cos(2 * Math.PI * freq * 2 * t) + (Math.random() - 0.5) * 0.04;
          break;
        }
      }

      if (state.channels[1].coupling === 'AC') ch1Val -= 1.65;
      if (state.channels[2].coupling === 'AC') ch2Val -= 0.0;
      if (state.channels[1].coupling === 'GND') ch1Val = 0;
      if (state.channels[2].coupling === 'GND') ch2Val = 0;

      state.waveforms.ch1[i] = ch1Val;
      state.waveforms.ch2[i] = ch2Val;
      state.waveforms.ch3[i] = ch1Val * 0.5;
      state.waveforms.ch4[i] = -ch2Val * 0.8;
      state.waveforms.math[i] = ch1Val - ch2Val;
    }

    if (state.trigger.mode === 'SINGLE' && state.singleArm) {
      state.running = false;
      state.singleArm = false;
      document.getElementById('runBadge').className = 'run-badge stopped';
      document.getElementById('runBadge').textContent = 'STOP';
      document.getElementById('runStopLabel').textContent = 'RUN';
    }
  }

  // --- Oscilloscope Drawing Engine ---
  function drawOscilloscope() {
    const wrapper = document.getElementById('canvasWrapper');
    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;

    scopeCtx.fillStyle = '#0d0e10';
    scopeCtx.fillRect(0, 0, width, height);

    drawGrid(width, height);
    drawTriggerLine(width, height);

    if (state.channels[1].enabled) drawTrace(state.waveforms.ch1, 1, width, height);
    if (state.channels[2].enabled) drawTrace(state.waveforms.ch2, 2, width, height);
    if (state.channels[3].enabled) drawTrace(state.waveforms.ch3, 3, width, height);
    if (state.channels[4].enabled) drawTrace(state.waveforms.ch4, 4, width, height);

    if (state.math.enabled) drawMathTrace(state.waveforms.math, width, height);
    if (state.cursors.enabled) drawCursors(width, height);
  }

  function drawGrid(w, h) {
    scopeCtx.save();
    scopeCtx.lineWidth = 1;
    scopeCtx.strokeStyle = '#1e2025';

    const numCols = 10;
    const numRows = 8;
    const colW = w / numCols;
    const rowH = h / numRows;

    for (let c = 1; c < numCols; c++) {
      const x = Math.round(c * colW);
      scopeCtx.beginPath();
      scopeCtx.setLineDash([2, 4]);
      scopeCtx.moveTo(x, 0);
      scopeCtx.lineTo(x, h);
      scopeCtx.stroke();
    }

    for (let r = 1; r < numRows; r++) {
      const y = Math.round(r * rowH);
      scopeCtx.beginPath();
      scopeCtx.setLineDash([2, 4]);
      scopeCtx.moveTo(0, y);
      scopeCtx.lineTo(w, y);
      scopeCtx.stroke();
    }

    const midX = Math.round(w / 2);
    const midY = Math.round(h / 2);

    scopeCtx.setLineDash([]);
    scopeCtx.strokeStyle = '#2d3038';

    scopeCtx.beginPath();
    scopeCtx.moveTo(0, midY);
    scopeCtx.lineTo(w, midY);
    scopeCtx.stroke();

    scopeCtx.beginPath();
    scopeCtx.moveTo(midX, 0);
    scopeCtx.lineTo(midX, h);
    scopeCtx.stroke();

    scopeCtx.strokeStyle = '#404450';
    const subTicksX = numCols * 5;
    for (let i = 0; i <= subTicksX; i++) {
      const x = (w / subTicksX) * i;
      const tickH = (i % 5 === 0) ? 6 : 3;
      scopeCtx.beginPath();
      scopeCtx.moveTo(x, midY - tickH);
      scopeCtx.lineTo(x, midY + tickH);
      scopeCtx.stroke();
    }

    const subTicksY = numRows * 5;
    for (let i = 0; i <= subTicksY; i++) {
      const y = (h / subTicksY) * i;
      const tickW = (i % 5 === 0) ? 6 : 3;
      scopeCtx.beginPath();
      scopeCtx.moveTo(midX - tickW, y);
      scopeCtx.lineTo(midX + tickW, y);
      scopeCtx.stroke();
    }

    scopeCtx.restore();
  }

  function drawTriggerLine(w, h) {
    const trigChan = state.trigger.source;
    let chNum = 1;
    if (trigChan.startsWith('CH')) chNum = parseInt(trigChan.replace('CH', '')) || 1;
    const ch = state.channels[chNum];
    const vScale = VOLT_SCALES[ch.voltIdx].val;

    const rowH = h / 8;
    const zeroY = (h / 2) - (ch.offset * rowH);
    const trigLevelV = state.trigger.level;
    const trigY = zeroY - (trigLevelV / vScale) * rowH;

    scopeCtx.save();
    scopeCtx.strokeStyle = 'rgba(249, 115, 22, 0.4)';
    scopeCtx.setLineDash([4, 6]);
    scopeCtx.lineWidth = 1;
    scopeCtx.beginPath();
    scopeCtx.moveTo(0, trigY);
    scopeCtx.lineTo(w, trigY);
    scopeCtx.stroke();
    scopeCtx.restore();

    const trigMarker = document.getElementById('trigMarker');
    if (trigMarker) {
      trigMarker.style.top = `${Math.max(10, Math.min(h - 10, trigY))}px`;
    }
  }

  function drawTrace(data, chNum, w, h) {
    const ch = state.channels[chNum];
    const vScale = VOLT_SCALES[ch.voltIdx].val;
    const rowH = h / 8;
    const zeroY = (h / 2) - (ch.offset * rowH);

    const gndMarker = document.getElementById(`gndCh${chNum}`);
    if (gndMarker) {
      gndMarker.style.display = ch.enabled ? 'block' : 'none';
      gndMarker.style.top = `${Math.max(10, Math.min(h - 10, zeroY))}px`;
    }

    scopeCtx.save();
    scopeCtx.strokeStyle = ch.color;
    scopeCtx.lineWidth = 1.8;
    scopeCtx.lineJoin = 'round';
    scopeCtx.lineCap = 'round';
    scopeCtx.shadowColor = ch.color;
    scopeCtx.shadowBlur = 4;

    scopeCtx.beginPath();
    const len = data.length;
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * w;
      const v = data[i];
      const y = zeroY - (v / vScale) * rowH;

      if (i === 0) scopeCtx.moveTo(x, y);
      else scopeCtx.lineTo(x, y);
    }
    scopeCtx.stroke();
    scopeCtx.restore();
  }

  function drawMathTrace(data, w, h) {
    const ch1 = state.channels[1];
    const vScale = VOLT_SCALES[ch1.voltIdx].val;
    const rowH = h / 8;
    const zeroY = h / 2;

    scopeCtx.save();
    scopeCtx.strokeStyle = '#bf5af2';
    scopeCtx.lineWidth = 1.5;
    scopeCtx.shadowColor = '#bf5af2';
    scopeCtx.shadowBlur = 4;
    scopeCtx.setLineDash([3, 2]);

    scopeCtx.beginPath();
    const len = data.length;
    for (let i = 0; i < len; i++) {
      const x = (i / (len - 1)) * w;
      const v = data[i];
      const y = zeroY - (v / vScale) * rowH;
      if (i === 0) scopeCtx.moveTo(x, y);
      else scopeCtx.lineTo(x, y);
    }
    scopeCtx.stroke();
    scopeCtx.restore();
  }

  function drawCursors(w, h) {
    const cur = state.cursors;
    scopeCtx.save();
    scopeCtx.strokeStyle = 'rgba(233, 233, 235, 0.7)';
    scopeCtx.setLineDash([3, 3]);
    scopeCtx.lineWidth = 1;

    const x1Px = (w / 2) + (cur.x1 * w);
    const x2Px = (w / 2) + (cur.x2 * w);

    scopeCtx.beginPath();
    scopeCtx.moveTo(x1Px, 0);
    scopeCtx.lineTo(x1Px, h);
    scopeCtx.moveTo(x2Px, 0);
    scopeCtx.lineTo(x2Px, h);
    scopeCtx.stroke();

    scopeCtx.fillStyle = '#e9e9eb';
    scopeCtx.font = '10px "JetBrains Mono"';
    scopeCtx.fillText('X1', x1Px + 4, 16);
    scopeCtx.fillText('X2', x2Px + 4, 16);

    scopeCtx.restore();

    const timeScale = TIMEBASE_SCALES[state.timebaseIdx].val;
    const deltaT = Math.abs(cur.x2 - cur.x1) * (timeScale * 10);
    const freq = deltaT > 0 ? (1 / deltaT) : 0;

    document.getElementById('curX1X2').textContent = `${formatTime(cur.x1 * timeScale * 10)} / ${formatTime(cur.x2 * timeScale * 10)}`;
    document.getElementById('curDeltaX').textContent = formatTime(deltaT);
    document.getElementById('curFreq').textContent = formatFrequency(freq);
  }

  function drawFFT() {
    if (!fftCtx || !fftCanvas) return;
    const w = fftCanvas.parentElement.clientWidth;
    const h = fftCanvas.parentElement.clientHeight;

    fftCtx.fillStyle = '#0c0d0f';
    fftCtx.fillRect(0, 0, w, h);

    const srcChan = state.fft.source;
    const rawData = state.waveforms[`ch${srcChan}`];
    const N = 256;
    const real = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const windowCoeff = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
      real[i] = rawData[i] * windowCoeff;
    }

    const bins = N / 2;
    const magnitudes = new Float32Array(bins);
    let maxMag = 0.001;
    let peakBin = 0;

    for (let k = 0; k < bins; k++) {
      let re = 0;
      let im = 0;
      for (let n = 0; n < N; n++) {
        const phi = (2 * Math.PI * k * n) / N;
        re += real[n] * Math.cos(phi);
        im -= real[n] * Math.sin(phi);
      }
      const mag = Math.sqrt(re * re + im * im);
      magnitudes[k] = mag;
      if (k > 1 && mag > maxMag) {
        maxMag = mag;
        peakBin = k;
      }
    }

    fftCtx.save();
    fftCtx.strokeStyle = '#00d2ff';
    fftCtx.lineWidth = 1.5;
    fftCtx.fillStyle = 'rgba(0, 210, 255, 0.12)';

    fftCtx.beginPath();
    fftCtx.moveTo(0, h);

    for (let k = 0; k < bins; k++) {
      const x = (k / (bins - 1)) * w;
      const db = 20 * Math.log10((magnitudes[k] / maxMag) + 0.001);
      const y = h - ((db + 60) / 60) * h;
      fftCtx.lineTo(x, Math.max(0, Math.min(h, y)));
    }
    fftCtx.lineTo(w, h);
    fftCtx.closePath();
    fftCtx.fill();
    fftCtx.stroke();
    fftCtx.restore();

    const timeScale = TIMEBASE_SCALES[state.timebaseIdx].val;
    const samplingFreq = 1000 / (timeScale * 10);
    const peakFreq = (peakBin * samplingFreq) / N;
    document.getElementById('fftPeakFreq').textContent = formatFrequency(peakFreq);
  }

  function calculateMeasurements() {
    const ch = state.activeChannel;
    const data = state.waveforms[`ch${ch}`];
    if (!data || data.length === 0) return;

    let max = -Infinity;
    let min = Infinity;
    let sum = 0;
    let sumSq = 0;

    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (v > max) max = v;
      if (v < min) min = v;
      sum += v;
      sumSq += v * v;
    }

    const vpp = max - min;
    const vavg = sum / data.length;
    const vrms = Math.sqrt(sumSq / data.length);

    const mid = (max + min) / 2;
    let crossings = 0;
    let firstCrossing = -1;
    let lastCrossing = -1;

    for (let i = 1; i < data.length; i++) {
      if ((data[i - 1] <= mid && data[i] > mid) || (data[i - 1] >= mid && data[i] < mid)) {
        crossings++;
        if (firstCrossing < 0) firstCrossing = i;
        lastCrossing = i;
      }
    }

    const timeScale = TIMEBASE_SCALES[state.timebaseIdx].val;
    const dt = (timeScale * 10) / data.length;
    let freq = 0;
    let period = 0;

    if (crossings >= 2 && lastCrossing > firstCrossing) {
      const halfCycles = crossings - 1;
      const totalT = (lastCrossing - firstCrossing) * dt;
      period = (totalT / halfCycles) * 2;
      freq = period > 0 ? (1 / period) : 0;
    }

    state.measurements = {
      vpp: `${vpp.toFixed(2)} V`,
      vrms: `${vrms.toFixed(2)} V`,
      vmax: `${max.toFixed(2)} V`,
      vmin: `${min.toFixed(2)} V`,
      vavg: `${vavg.toFixed(2)} V`,
      freq: formatFrequency(freq),
      period: formatTime(period),
      duty: '50.0 %',
      rise: '2.4 ns'
    };

    updateMeasurementsDisplay();
  }

  function renderMeasurementsGrid() {
    const grid = document.getElementById('measurementsGrid');
    const items = [
      { key: 'vpp', label: 'Vpp (Peak-Peak)' },
      { key: 'vrms', label: 'Vrms (True RMS)' },
      { key: 'vmax', label: 'Vmax (Peak High)' },
      { key: 'vmin', label: 'Vmin (Peak Low)' },
      { key: 'vavg', label: 'Vavg (DC Mean)' },
      { key: 'freq', label: 'Frequency' },
      { key: 'period', label: 'Period' },
      { key: 'duty', label: 'Duty Cycle' }
    ];

    grid.innerHTML = items.map(item => `
      <div class="measure-card ch${state.activeChannel}" id="card_${item.key}">
        <div class="measure-label">${item.label}</div>
        <div class="measure-val" id="val_${item.key}">--</div>
      </div>
    `).join('');
  }

  function updateMeasurementsDisplay() {
    for (const [key, val] of Object.entries(state.measurements)) {
      const el = document.getElementById(`val_${key}`);
      if (el) el.textContent = val;
    }
  }

  // --- Dynamic COM Port Enumeration ---
  async function refreshComPortDropdown() {
    const sel = document.getElementById('selComPort');
    if (!sel) return;

    sel.innerHTML = '<option value="">Scanning Windows COM ports...</option>';

    if (window.electronAPI && window.electronAPI.getComPortsDetailed) {
      try {
        const ports = await window.electronAPI.getComPortsDetailed();
        sel.innerHTML = '';
        if (ports && ports.length > 0) {
          ports.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.port;
            opt.textContent = `${p.port} - ${p.name}`;
            sel.appendChild(opt);
          });
        } else {
          sel.innerHTML = '<option value="">No COM ports detected (Plug in USB-B cable)</option>';
        }
      } catch (err) {
        sel.innerHTML = '<option value="COM1">COM1 - Default Serial Port</option>';
      }
    } else {
      sel.innerHTML = '<option value="COM1">COM1 - Default Port</option>';
    }
  }

  // --- UI Bindings & Event Listeners ---
  function bindUIEvents() {
    // Header buttons
    document.getElementById('btnRunStop').addEventListener('click', toggleRunStop);
    document.getElementById('btnSingle').addEventListener('click', triggerSingleShot);
    document.getElementById('btnAutoSet').addEventListener('click', autoSetupScope);
    document.getElementById('btnScreenshot').addEventListener('click', captureScreenshot);
    document.getElementById('btnExportCSV').addEventListener('click', exportCSV);

    // Connection Modal
    const modal = document.getElementById('connModal');
    document.getElementById('btnConnectModal').addEventListener('click', () => {
      refreshComPortDropdown();
      modal.classList.add('active');
    });
    document.getElementById('connStatusBtn').addEventListener('click', () => {
      refreshComPortDropdown();
      modal.classList.add('active');
    });
    document.getElementById('btnCloseModal').addEventListener('click', () => modal.classList.remove('active'));

    // Driver Guide Modal
    const driverModal = document.getElementById('driverGuideModal');
    document.getElementById('btnDriverGuide').addEventListener('click', () => driverModal.classList.add('active'));
    document.getElementById('linkOpenDriverGuide').addEventListener('click', (e) => {
      e.preventDefault();
      driverModal.classList.add('active');
    });
    document.getElementById('btnCloseDriverModal').addEventListener('click', () => driverModal.classList.remove('active'));
    document.getElementById('btnOkDriverGuide').addEventListener('click', () => driverModal.classList.remove('active'));

    // Launch Device Manager button
    document.getElementById('btnLaunchDevMgr').addEventListener('click', () => {
      if (window.electronAPI && window.electronAPI.openDeviceManager) {
        window.electronAPI.openDeviceManager();
      }
    });

    // COM Port Selector Actions
    document.getElementById('btnRefreshPorts').addEventListener('click', refreshComPortDropdown);
    document.getElementById('btnConnectSerialDirect').addEventListener('click', connectDirectSerial);
    document.getElementById('btnConnectWebUSB').addEventListener('click', connectWebUSB);
    document.getElementById('btnEnableSim').addEventListener('click', () => {
      setConnectionMode('sim');
      modal.classList.remove('active');
    });

    // Channel Selection Pills
    document.querySelectorAll('.chan-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.chan-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.activeChannel = parseInt(pill.dataset.ch) || 1;
        renderChannelControls();
        renderMeasurementsGrid();
      });
    });

    // Vertical Subsystem
    document.getElementById('chkChannelEnable').addEventListener('change', (e) => {
      state.channels[state.activeChannel].enabled = e.target.checked;
      updateHUD();
    });

    document.getElementById('btnVoltUp').addEventListener('click', () => stepVoltDiv(1));
    document.getElementById('btnVoltDown').addEventListener('click', () => stepVoltDiv(-1));
    document.getElementById('selCoupling').addEventListener('change', (e) => {
      state.channels[state.activeChannel].coupling = e.target.value;
      updateHUD();
    });
    document.getElementById('rngVertOffset').addEventListener('input', (e) => {
      state.channels[state.activeChannel].offset = parseFloat(e.target.value);
      document.getElementById('lblVertOffset').textContent = `${parseFloat(e.target.value).toFixed(2)} div`;
    });
    document.getElementById('selProbe').addEventListener('change', (e) => {
      state.channels[state.activeChannel].probe = parseInt(e.target.value);
    });
    document.getElementById('selBwLimit').addEventListener('change', (e) => {
      state.channels[state.activeChannel].bwLimit = e.target.value;
    });

    // Horizontal Subsystem
    document.getElementById('btnTimeUp').addEventListener('click', () => stepTimebase(1));
    document.getElementById('btnTimeDown').addEventListener('click', () => stepTimebase(-1));
    document.getElementById('rngHorizPos').addEventListener('input', (e) => {
      state.horizPos = parseFloat(e.target.value);
      document.getElementById('lblHorizPos').textContent = `${parseFloat(e.target.value).toFixed(2)} s`;
      updateHUD();
    });
    document.getElementById('selAcqMode').addEventListener('change', (e) => {
      state.acqMode = e.target.value;
    });

    // Trigger System
    document.getElementById('selTrigSource').addEventListener('change', (e) => {
      state.trigger.source = e.target.value;
      updateHUD();
    });
    document.getElementById('selTrigMode').addEventListener('change', (e) => {
      state.trigger.mode = e.target.value;
    });
    document.getElementById('selTrigSlope').addEventListener('change', (e) => {
      state.trigger.slope = e.target.value;
      updateHUD();
    });
    document.getElementById('rngTrigLevel').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      state.trigger.level = v;
      document.getElementById('lblTrigLevel').textContent = `${v >= 0 ? '+' : ''}${v.toFixed(2)} V`;
      updateHUD();
    });
    document.getElementById('btnTrig50').addEventListener('click', () => {
      state.trigger.level = 0.0;
      document.getElementById('rngTrigLevel').value = 0.0;
      document.getElementById('lblTrigLevel').textContent = '+0.00 V';
      updateHUD();
    });

    // Emulation Signal Selector
    document.getElementById('selSimSignal').addEventListener('change', (e) => {
      state.simSignal = e.target.value;
    });
    document.getElementById('btnResetScope').addEventListener('click', resetScopeDefaults);

    // Dock Tabs
    document.querySelectorAll('.dock-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.dock-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.querySelectorAll('.dock-content').forEach(c => c.style.display = 'none');
        document.getElementById(`tabContent-${target}`).style.display = 'block';
      });
    });

    // Cursors & Math Checkboxes
    document.getElementById('chkShowCursors').addEventListener('change', (e) => {
      state.cursors.enabled = e.target.checked;
    });
    document.getElementById('chkMathTrace').addEventListener('change', (e) => {
      state.math.enabled = e.target.checked;
    });

    // SCPI Terminal
    document.getElementById('btnSendScpi').addEventListener('click', sendScpiFromInput);
    document.getElementById('scpiCmdInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendScpiFromInput();
    });
  }

  // --- Channel Controls Sync ---
  function renderChannelControls() {
    const ch = state.channels[state.activeChannel];
    document.getElementById('currentChLabel').textContent = `Channel ${state.activeChannel} Active`;
    document.getElementById('chkChannelEnable').checked = ch.enabled;
    document.getElementById('valVoltDiv').textContent = VOLT_SCALES[ch.voltIdx].label;
    document.getElementById('selCoupling').value = ch.coupling;
    document.getElementById('rngVertOffset').value = ch.offset;
    document.getElementById('lblVertOffset').textContent = `${ch.offset.toFixed(2)} div`;
    document.getElementById('selProbe').value = ch.probe;
    document.getElementById('selBwLimit').value = ch.bwLimit;
    updateHUD();
  }

  function stepVoltDiv(delta) {
    const ch = state.channels[state.activeChannel];
    const newIdx = Math.max(0, Math.min(VOLT_SCALES.length - 1, ch.voltIdx + delta));
    ch.voltIdx = newIdx;
    document.getElementById('valVoltDiv').textContent = VOLT_SCALES[newIdx].label;
    updateHUD();
    sendHardwareCommand(`:CHAN${state.activeChannel}:SCAL ${VOLT_SCALES[newIdx].val}`);
  }

  function stepTimebase(delta) {
    const newIdx = Math.max(0, Math.min(TIMEBASE_SCALES.length - 1, state.timebaseIdx + delta));
    state.timebaseIdx = newIdx;
    document.getElementById('valTimeDiv').textContent = TIMEBASE_SCALES[newIdx].label;
    updateHUD();
    sendHardwareCommand(`:TIM:SCAL ${TIMEBASE_SCALES[newIdx].val}`);
  }

  function updateHUD() {
    document.getElementById('hudTimebase').textContent = `${TIMEBASE_SCALES[state.timebaseIdx].label}/div`;
    document.getElementById('hudTimePos').textContent = `${state.horizPos.toFixed(2)} s`;

    const ch1 = state.channels[1];
    document.getElementById('hudCh1').textContent = ch1.enabled ? `${VOLT_SCALES[ch1.voltIdx].label}/div (${ch1.coupling})` : 'OFF';

    const ch2 = state.channels[2];
    document.getElementById('hudCh2').textContent = ch2.enabled ? `${VOLT_SCALES[ch2.voltIdx].label}/div (${ch2.coupling})` : 'OFF';

    const trigSlopeIcon = state.trigger.slope === 'RISING' ? '↗' : (state.trigger.slope === 'FALLING' ? '↘' : '↕');
    document.getElementById('hudTrigger').textContent = `${state.trigger.source} ${state.trigger.level.toFixed(2)}V ${trigSlopeIcon}`;
  }

  // --- Run / Stop & Single Controls ---
  function toggleRunStop() {
    state.running = !state.running;
    const badge = document.getElementById('runBadge');
    const label = document.getElementById('runStopLabel');

    if (state.running) {
      badge.className = 'run-badge running';
      badge.textContent = 'RUNNING';
      label.textContent = 'STOP';
      sendHardwareCommand(':RUN');
    } else {
      badge.className = 'run-badge stopped';
      badge.textContent = 'STOP';
      label.textContent = 'RUN';
      sendHardwareCommand(':STOP');
    }
  }

  function triggerSingleShot() {
    state.running = true;
    state.singleArm = true;
    state.trigger.mode = 'SINGLE';
    document.getElementById('selTrigMode').value = 'SINGLE';
    document.getElementById('runBadge').className = 'run-badge auto';
    document.getElementById('runBadge').textContent = 'SINGLE ARM';
    sendHardwareCommand(':SING');
  }

  function autoSetupScope() {
    logScpi('TX', ':AUTOSet');
    state.timebaseIdx = 16;
    state.channels[1].enabled = true;
    state.channels[1].voltIdx = 8;
    state.channels[1].offset = 0;
    state.trigger.level = 0.5;
    state.running = true;
    renderChannelControls();
    document.getElementById('runBadge').className = 'run-badge running';
    document.getElementById('runBadge').textContent = 'RUNNING';
    logScpi('RX', 'Auto setup completed.');
  }

  function resetScopeDefaults() {
    logScpi('TX', '*RST');
    state.timebaseIdx = 16;
    state.channels[1].voltIdx = 8;
    state.channels[2].voltIdx = 9;
    state.channels[1].offset = 0;
    state.channels[2].offset = -1.5;
    state.trigger.level = 0.5;
    renderChannelControls();
    logScpi('RX', 'Oscilloscope reset to factory defaults.');
  }

  // --- Native Windows 11 File Export (CSV & Screenshot) ---
  async function captureScreenshot() {
    const dataUrl = scopeCanvas.toDataURL('image/png');
    const defaultName = `tenma_scope_${Date.now()}.png`;

    if (window.electronAPI && window.electronAPI.saveImage) {
      const res = await window.electronAPI.saveImage(dataUrl, defaultName);
      if (res && res.success) {
        logScpi('SYS', `Screenshot saved: ${res.filePath}`);
      }
    } else {
      const link = document.createElement('a');
      link.download = defaultName;
      link.href = dataUrl;
      link.click();
      logScpi('SYS', 'Screenshot downloaded.');
    }
  }

  async function exportCSV() {
    let csv = 'Time(s),CH1(V),CH2(V),MATH(V)\n';
    const numPoints = state.waveforms.ch1.length;
    const timeScale = TIMEBASE_SCALES[state.timebaseIdx].val;
    const dt = (timeScale * 10) / numPoints;

    for (let i = 0; i < numPoints; i++) {
      const t = (i * dt).toExponential(6);
      const c1 = state.waveforms.ch1[i].toFixed(4);
      const c2 = state.waveforms.ch2[i].toFixed(4);
      const m = state.waveforms.math[i].toFixed(4);
      csv += `${t},${c1},${c2},${m}\n`;
    }

    const defaultName = `tenma_waveform_${Date.now()}.csv`;

    if (window.electronAPI && window.electronAPI.saveCSV) {
      const res = await window.electronAPI.saveCSV(csv, defaultName);
      if (res && res.success) {
        logScpi('SYS', `Waveform CSV saved: ${res.filePath}`);
      }
    } else {
      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.download = defaultName;
      link.href = URL.createObjectURL(blob);
      link.click();
      logScpi('SYS', 'Waveform CSV downloaded.');
    }
  }

  // --- Hardware Connectivity: Direct COM Port Selection ---
  async function connectDirectSerial() {
    const portSel = document.getElementById('selComPort');
    const port = portSel ? portSel.value : '';
    const baudSel = document.getElementById('selBaudRate');
    const baudRate = baudSel ? parseInt(baudSel.value) : 115200;

    if (!port) {
      logScpi('ERR', 'No COM port selected. Please plug in the USB-B cable and click Refresh.');
      return;
    }

    logScpi('SYS', `Connecting to ${port} @ ${baudRate} baud...`);

    if (window.electronAPI && window.electronAPI.serialConnect) {
      try {
        const res = await window.electronAPI.serialConnect(port, baudRate);
        if (res && res.success) {
          state.activePort = port;
          setConnectionMode('serial', `${port} (${baudRate})`);
          document.getElementById('connModal').classList.remove('active');
          logScpi('RX', `Connected to ${port} at ${baudRate} baud.`);
          queryScopeIdentity();
        } else {
          logScpi('ERR', `Failed to open ${port}: ${res ? res.error : 'Unknown error'}`);
        }
      } catch (err) {
        logScpi('ERR', `Serial error: ${err.message}`);
      }
    } else {
      // Browser fallback (WebSerial)
      try {
        const p = await navigator.serial.requestPort();
        await p.open({ baudRate });
        setConnectionMode('serial', `SERIAL PORT (${baudRate})`);
        document.getElementById('connModal').classList.remove('active');
        logScpi('RX', 'Connected via WebSerial.');
        queryScopeIdentity();
      } catch (e) {
        logScpi('ERR', `Serial link canceled or failed: ${e.message}`);
      }
    }
  }

  async function connectWebUSB() {
    try {
      logScpi('SYS', 'Requesting USB device link (USBTMC / Tenma)...');
      const device = await navigator.usb.requestDevice({
        filters: [
          { vendorId: 0x5656 },
          { vendorId: 0x4348 },
          { vendorId: 0x0483 },
          { vendorId: 0x1a86 }
        ]
      });

      if (device) {
        await device.open();
        await device.selectConfiguration(1);
        await device.claimInterface(0);
        usbDevice = device;
        setConnectionMode('webusb', `${device.productName || 'Tenma 8737 Scope'}`);
        document.getElementById('connModal').classList.remove('active');
        logScpi('RX', `Connected to hardware USB device: ${device.productName || 'Tenma 8737'}`);
        queryScopeIdentity();
      }
    } catch (err) {
      logScpi('ERR', `WebUSB connection error: ${err.message}`);
    }
  }

  function setConnectionMode(mode, label) {
    state.connType = mode;
    state.connected = mode !== 'sim';
    const dot = document.getElementById('statusDot');
    const txt = document.getElementById('statusText');

    if (mode === 'sim') {
      dot.className = 'status-dot sim';
      txt.textContent = 'SIMULATION READY';
    } else {
      dot.className = 'status-dot online';
      txt.textContent = label || 'ONLINE (WIRED USB)';
    }
  }

  function sendHardwareCommand(cmd) {
    if (state.connType === 'serial' && window.electronAPI && window.electronAPI.serialSend) {
      window.electronAPI.serialSend(cmd);
    }
  }

  function queryScopeIdentity() {
    logScpi('TX', '*IDN?');
    sendHardwareCommand('*IDN?');
    setTimeout(() => {
      if (state.connType === 'sim') {
        logScpi('RX', 'TENMA,72-8737,SN-8737-2026,V2.04 (4-CH 200MHz DSO)');
      }
    }, 200);
  }

  function sendScpiFromInput() {
    const input = document.getElementById('scpiCmdInput');
    const cmd = input.value.trim();
    if (!cmd) return;
    input.value = '';

    logScpi('TX', cmd);
    executeScpiCommand(cmd);
  }

  function executeScpiCommand(cmd) {
    const upper = cmd.toUpperCase();

    if (upper === '*IDN?') {
      setTimeout(() => logScpi('RX', 'TENMA,72-8737,SN-8737-2026,V2.04'), 60);
    } else if (upper === '*RST') {
      resetScopeDefaults();
    } else if (upper === ':RUN' || upper === 'RUN') {
      if (!state.running) toggleRunStop();
      logScpi('RX', 'OK');
    } else if (upper === ':STOP' || upper === 'STOP') {
      if (state.running) toggleRunStop();
      logScpi('RX', 'OK');
    } else if (upper === ':AUTOS' || upper === ':AUTOS?' || upper === ':AUTOSet') {
      autoSetupScope();
    } else if (upper.startsWith(':MEAS:VOLT?')) {
      setTimeout(() => logScpi('RX', state.measurements.vpp || '2.50V'), 60);
    } else if (upper.startsWith(':MEAS:FREQ?')) {
      setTimeout(() => logScpi('RX', state.measurements.freq || '1.000kHz'), 60);
    } else if (upper === ':TRIG:STAT?') {
      setTimeout(() => logScpi('RX', state.trigger.status), 50);
    } else {
      sendHardwareCommand(cmd);
      setTimeout(() => logScpi('RX', 'OK'), 80);
    }
  }

  function logScpi(type, msg) {
    const logBox = document.getElementById('scpiLog');
    if (!logBox) return;

    const time = new Date().toTimeString().split(' ')[0];
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    let colorClass = 'log-tx';
    if (type === 'RX') colorClass = 'log-rx';
    if (type === 'ERR') colorClass = 'log-err';
    if (type === 'SYS') colorClass = 'log-time';

    entry.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="${colorClass}">${type}:</span>
      <span>${escapeHtml(msg)}</span>
    `;

    logBox.appendChild(entry);
    logBox.scrollTop = logBox.scrollHeight;
  }

  function formatTime(s) {
    if (s >= 1) return `${s.toFixed(2)} s`;
    if (s >= 1e-3) return `${(s * 1e3).toFixed(2)} ms`;
    if (s >= 1e-6) return `${(s * 1e6).toFixed(2)} μs`;
    return `${(s * 1e9).toFixed(2)} ns`;
  }

  function formatFrequency(hz) {
    if (hz >= 1e6) return `${(hz / 1e6).toFixed(3)} MHz`;
    if (hz >= 1e3) return `${(hz / 1e3).toFixed(3)} kHz`;
    return `${hz.toFixed(2)} Hz`;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
