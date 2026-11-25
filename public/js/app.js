(() => {
  'use strict';

  // Standard 1-2-5 oscilloscope step tables
  const VOLT_STEPS = [
    0.001, 0.002, 0.005,
    0.01, 0.02, 0.05,
    0.1, 0.2, 0.5,
    1, 2, 5, 10
  ];

  const TIME_STEPS = [
    2e-9, 5e-9,
    1e-8, 2e-8, 5e-8,
    1e-7, 2e-7, 5e-7,
    1e-6, 2e-6, 5e-6,
    1e-5, 2e-5, 5e-5,
    1e-4, 2e-4, 5e-4,
    1e-3, 2e-3, 5e-3,
    1e-2, 2e-2, 5e-2,
    0.1, 0.2, 0.5,
    1, 2, 5, 10, 20, 50
  ];

  const HOLDOFF_STEPS = [
    1e-7, 2e-7, 5e-7,
    1e-6, 2e-6, 5e-6,
    1e-5, 2e-5, 5e-5,
    1e-4, 2e-4, 5e-4,
    1e-3, 5e-3, 1e-2, 0.1, 1
  ];

  const CH_COLORS = {
    1: '#f2c94c',
    2: '#2d9cdb',
    3: '#d95fd9',
    4: '#34c77b',
    M: '#a78bfa'
  };

  // Instrument state (real hardware only — no simulation)
  const state = {
    connected: false,
    connType: null, // 'serial' | 'usb' | null
    portLabel: '',
    idn: '',
    running: false,
    singleArmed: false,
    activeChannel: 1,
    measSource: 1,

    channels: {
      1: { enabled: true,  invert: false, vIdx: 9, offset: 0, coupling: 'DC', probe: 10, bwLimit: 'OFF' },
      2: { enabled: true,  invert: false, vIdx: 9, offset: 0, coupling: 'DC', probe: 10, bwLimit: 'OFF' },
      3: { enabled: false, invert: false, vIdx: 9, offset: 0, coupling: 'DC', probe: 10, bwLimit: 'OFF' },
      4: { enabled: false, invert: false, vIdx: 9, offset: 0, coupling: 'DC', probe: 10, bwLimit: 'OFF' }
    },

    horiz: {
      tIdx: 16, // 500 us/div
      posDiv: 0,
      format: 'YT'
    },

    trigger: {
      type: 'EDGE',
      source: 'CHAN1',
      sweep: 'AUTO',
      slope: 'POS',
      coupling: 'DC',
      level: 0.0,
      holdoffIdx: 0,
      status: 'OFFLINE' // OFFLINE | STOP | WAIT | RUN | TRIG'D
    },

    acq: {
      mode: 'NORM',
      memDepth: 10000,
      sampleRate: null,
      traceType: 'vectors',
      gridAlpha: 0.55,
      pollIntervalMs: 250
    },

    cursors: {
      mode: 'off', // off | x | y | xy
      source: 1,
      x1: 0.25, // normalized 0..1 across graticule width
      x2: 0.75,
      y1: 0.25, // normalized 0..1 across graticule height
      y2: 0.75
    },

    math: {
      enabled: false,
      op: 'sub',
      fftSrc: 1,
      fftWindow: 'hann',
      fftUnit: 'dbv'
    },

    // Real acquired waveform sample arrays (Float32Array of Volts, null when no data)
    waveforms: { 1: null, 2: null, 3: null, 4: null }
  };

  let usbDevice = null;
  let pollTimer = null;
  let pollChannelCursor = 1;
  let pendingWaveChannel = null;
  let scpiHistory = [];
  let scpiHistoryIdx = -1;

  // Interactive canvas drag state
  let dragTarget = null; // { type: 'ch'|'trig'|'hpos'|'x1'|'x2'|'y1'|'y2', ch?: number }
  let graticuleRect = { x: 28, y: 18, w: 600, h: 400 };

  const scopeCanvas = document.getElementById('scopeCanvas');
  const scopeCtx = scopeCanvas.getContext('2d');
  const fftCanvas = document.getElementById('fftCanvas');
  const fftCtx = fftCanvas.getContext('2d');

  // ============================================================
  // FORMATTING UTILITIES
  // ============================================================
  function formatEng(val, unit, decimals = 2) {
    if (val === null || val === undefined || !isFinite(val)) return '---';
    const abs = Math.abs(val);
    if (abs === 0) return `0.00 ${unit}`;
    if (abs >= 1e9) return `${(val / 1e9).toFixed(decimals)} G${unit}`;
    if (abs >= 1e6) return `${(val / 1e6).toFixed(decimals)} M${unit}`;
    if (abs >= 1e3) return `${(val / 1e3).toFixed(decimals)} k${unit}`;
    if (abs >= 1)   return `${val.toFixed(decimals)} ${unit}`;
    if (abs >= 1e-3) return `${(val * 1e3).toFixed(decimals)} m${unit}`;
    if (abs >= 1e-6) return `${(val * 1e6).toFixed(decimals)} µ${unit}`;
    if (abs >= 1e-9) return `${(val * 1e9).toFixed(decimals)} n${unit}`;
    return `${(val * 1e12).toFixed(decimals)} p${unit}`;
  }

  function formatVoltsDiv(v) {
    return v < 1 ? `${Math.round(v * 1000)} mV/div` : `${v < 10 ? v.toFixed(2) : v.toFixed(1)} V/div`;
  }

  function formatVoltsShort(v) {
    return v < 1 ? `${Math.round(v * 1000)}mV/` : `${v < 10 ? v.toFixed(2) : v.toFixed(1)}V/`;
  }

  function formatTimeDiv(t) {
    if (t >= 1) return `${t} s/div`;
    if (t >= 1e-3) return `${+(t * 1e3).toFixed(2)} ms/div`;
    if (t >= 1e-6) return `${+(t * 1e6).toFixed(2)} µs/div`;
    return `${+(t * 1e9).toFixed(2)} ns/div`;
  }

  function formatHoldoff(t) {
    if (t >= 1) return `${t} s`;
    if (t >= 1e-3) return `${+(t * 1e3).toFixed(1)} ms`;
    if (t >= 1e-6) return `${+(t * 1e6).toFixed(1)} µs`;
    return `${+(t * 1e9).toFixed(0)} ns`;
  }

  function currentVScale(chNum) {
    const ch = state.channels[chNum];
    return VOLT_STEPS[ch.vIdx] * (ch.probe / 10);
  }

  function currentTScale() {
    return TIME_STEPS[state.horiz.tIdx];
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================
  function init() {
    bindWindowControls();
    bindToolbar();
    bindSidebarControls();
    bindDockControls();
    bindModals();
    bindCanvasInteractions();
    bindSerialListeners();

    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);

    syncAllUI();
    renderMeasurements();
    drawScope();
    drawFFT();
    logScpi('SYS', 'Tenma 8737 Instrument Control initialized. Connect hardware via COM port or Direct USB.');
  }

  function resizeCanvases() {
    const dpr = window.devicePixelRatio || 1;
    const stage = document.getElementById('graticuleStage');
    if (stage) {
      const r = stage.getBoundingClientRect();
      scopeCanvas.width = Math.max(100, Math.floor(r.width * dpr));
      scopeCanvas.height = Math.max(100, Math.floor(r.height * dpr));
      scopeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const fftStage = fftCanvas.parentElement;
    if (fftStage) {
      const fr = fftStage.getBoundingClientRect();
      if (fr.width > 10 && fr.height > 10) {
        fftCanvas.width = Math.floor(fr.width * dpr);
        fftCanvas.height = Math.floor(fr.height * dpr);
        fftCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
    drawScope();
    drawFFT();
  }

  // ============================================================
  // WINDOW CONTROLS
  // ============================================================
  function bindWindowControls() {
    document.getElementById('winMin').addEventListener('click', () => {
      if (window.electronAPI) window.electronAPI.minimize();
    });
    document.getElementById('winMax').addEventListener('click', () => {
      if (window.electronAPI) window.electronAPI.maximize();
    });
    document.getElementById('winClose').addEventListener('click', () => {
      if (window.electronAPI) window.electronAPI.close();
    });
  }

  // ============================================================
  // TOOLBAR ACTIONS
  // ============================================================
  function bindToolbar() {
    document.getElementById('btnOpenConn').addEventListener('click', openConnModal);
    document.getElementById('btnDisconnectQuick').addEventListener('click', disconnectHardware);

    document.getElementById('btnRunStop').addEventListener('click', toggleRunStop);
    document.getElementById('btnSingle').addEventListener('click', triggerSingle);
    document.getElementById('btnAutoset').addEventListener('click', () => {
      sendScpi(':AUT');
      logScpi('SYS', 'Autoset command sent to instrument.');
    });
    document.getElementById('btnForceTrig').addEventListener('click', () => {
      sendScpi(':TFOR');
      if (state.connected) requestActiveWaveforms();
    });
    document.getElementById('btnClear').addEventListener('click', () => {
      state.waveforms = { 1: null, 2: null, 3: null, 4: null };
      renderMeasurements();
      drawScope();
      drawFFT();
      logScpi('SYS', 'Display waveform buffers cleared.');
    });

    document.getElementById('btnSavePng').addEventListener('click', exportPng);
    document.getElementById('btnSaveCsv').addEventListener('click', exportCsv);
    document.getElementById('btnSaveSetup').addEventListener('click', saveSetupFile);
    document.getElementById('btnLoadSetup').addEventListener('click', loadSetupFile);
    document.getElementById('btnDefaultSetup').addEventListener('click', resetDefaults);
    document.getElementById('btnOpenDrivers').addEventListener('click', () => {
      document.getElementById('driverModal').classList.add('open');
    });

    // Keyboard shortcut: Space toggles Run/Stop when not typing in an input
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
        e.preventDefault();
        toggleRunStop();
      }
    });
  }

  function toggleRunStop() {
    if (!state.connected) {
      logScpi('ERR', 'Cannot start acquisition: no oscilloscope connected.');
      openConnModal();
      return;
    }
    state.running = !state.running;
    state.singleArmed = false;
    state.trigger.status = state.running ? 'RUN' : 'STOP';
    sendScpi(state.running ? ':RUN' : ':STOP');
    if (state.running) startPolling();
    else stopPolling();
    syncAcquisitionUI();
  }

  function triggerSingle() {
    if (!state.connected) {
      logScpi('ERR', 'Cannot arm single sequence: no oscilloscope connected.');
      openConnModal();
      return;
    }
    state.running = false;
    state.singleArmed = true;
    state.trigger.status = 'WAIT';
    stopPolling();
    sendScpi(':SING');
    requestActiveWaveforms();
    syncAcquisitionUI();
  }

  function resetDefaults() {
    state.channels = {
      1: { enabled: true,  invert: false, vIdx: 9, offset: 0, coupling: 'DC', probe: 10, bwLimit: 'OFF' },
      2: { enabled: true,  invert: false, vIdx: 9, offset: 0, coupling: 'DC', probe: 10, bwLimit: 'OFF' },
      3: { enabled: false, invert: false, vIdx: 9, offset: 0, coupling: 'DC', probe: 10, bwLimit: 'OFF' },
      4: { enabled: false, invert: false, vIdx: 9, offset: 0, coupling: 'DC', probe: 10, bwLimit: 'OFF' }
    };
    state.horiz = { tIdx: 16, posDiv: 0, format: 'YT' };
    state.trigger = {
      type: 'EDGE', source: 'CHAN1', sweep: 'AUTO', slope: 'POS',
      coupling: 'DC', level: 0.0, holdoffIdx: 0,
      status: state.connected ? (state.running ? 'RUN' : 'STOP') : 'OFFLINE'
    };
    state.acq.mode = 'NORM';
    state.acq.memDepth = 10000;
    state.math.enabled = false;
    state.cursors.mode = 'off';

    if (state.connected) sendScpi('*RST');
    syncAllUI();
    drawScope();
    drawFFT();
    logScpi('SYS', 'Instrument configuration reset to factory defaults.');
  }

  // ============================================================
  // SIDEBAR CONTROLS
  // ============================================================
  function bindSidebarControls() {
    // Channel selector tabs & bottom channel tiles
    document.querySelectorAll('#vertChTabs .ch-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => selectChannel(parseInt(btn.dataset.ch, 10)));
    });

    document.querySelectorAll('#chStrip .ch-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        const ch = tile.dataset.ch;
        if (ch === 'M') {
          activateDockPane('math');
          return;
        }
        const chNum = parseInt(ch, 10);
        if (state.activeChannel === chNum) {
          toggleChannelEnable(chNum);
        } else {
          selectChannel(chNum);
        }
      });
    });

    // Vertical controls
    document.getElementById('btnChEnable').addEventListener('click', () => toggleChannelEnable(state.activeChannel));
    document.getElementById('btnChInvert').addEventListener('click', () => {
      const ch = state.channels[state.activeChannel];
      ch.invert = !ch.invert;
      sendScpi(`:CHAN${state.activeChannel}:INV ${ch.invert ? 'ON' : 'OFF'}`);
      syncVerticalUI();
      drawScope();
    });

    document.getElementById('btnVScaleDown').addEventListener('click', () => stepVScale(-1));
    document.getElementById('btnVScaleUp').addEventListener('click', () => stepVScale(1));

    const rngVOffset = document.getElementById('rngVOffset');
    rngVOffset.addEventListener('input', (e) => {
      const ch = state.channels[state.activeChannel];
      ch.offset = parseFloat(e.target.value);
      document.getElementById('valVOffset').textContent = `${ch.offset >= 0 ? '+' : ''}${ch.offset.toFixed(2)} div`;
      drawScope();
    });
    rngVOffset.addEventListener('change', () => {
      const ch = state.channels[state.activeChannel];
      const offsetVolts = (ch.offset * currentVScale(state.activeChannel)).toFixed(4);
      sendScpi(`:CHAN${state.activeChannel}:OFFS ${offsetVolts}`);
    });
    document.getElementById('btnVOffsetZero').addEventListener('click', () => {
      state.channels[state.activeChannel].offset = 0;
      sendScpi(`:CHAN${state.activeChannel}:OFFS 0`);
      syncVerticalUI();
      drawScope();
    });

    bindSegmented('segCoupling', (val) => {
      state.channels[state.activeChannel].coupling = val;
      sendScpi(`:CHAN${state.activeChannel}:COUP ${val}`);
      syncChannelStrip();
    });

    bindSegmented('segProbe', (val) => {
      state.channels[state.activeChannel].probe = parseInt(val, 10);
      sendScpi(`:CHAN${state.activeChannel}:PROB ${val}`);
      syncVerticalUI();
      syncChannelStrip();
      drawScope();
    });

    bindSegmented('segBwLimit', (val) => {
      state.channels[state.activeChannel].bwLimit = val;
      sendScpi(`:CHAN${state.activeChannel}:BWL ${val}`);
    });

    // Horizontal controls
    document.getElementById('btnHScaleDown').addEventListener('click', () => stepHScale(-1));
    document.getElementById('btnHScaleUp').addEventListener('click', () => stepHScale(1));

    const rngHPos = document.getElementById('rngHPos');
    rngHPos.addEventListener('input', (e) => {
      state.horiz.posDiv = parseFloat(e.target.value);
      syncHorizontalUI();
      drawScope();
    });
    rngHPos.addEventListener('change', () => {
      const sec = (state.horiz.posDiv * currentTScale()).toExponential(4);
      sendScpi(`:TIM:MAIN:OFFS ${sec}`);
    });
    document.getElementById('btnHPosZero').addEventListener('click', () => {
      state.horiz.posDiv = 0;
      sendScpi(':TIM:MAIN:OFFS 0');
      syncHorizontalUI();
      drawScope();
    });

    bindSegmented('segHFormat', (val) => {
      state.horiz.format = val;
      sendScpi(`:TIM:MODE ${val === 'YT' ? 'MAIN' : val}`);
      syncHorizontalUI();
      drawScope();
    });

    // Trigger controls
    document.getElementById('selTrigType').addEventListener('change', (e) => {
      state.trigger.type = e.target.value;
      sendScpi(`:TRIG:MODE ${state.trigger.type}`);
      syncTriggerUI();
    });

    document.getElementById('selTrigSrc').addEventListener('change', (e) => {
      state.trigger.source = e.target.value;
      sendScpi(`:TRIG:EDGE:SOUR ${state.trigger.source}`);
      syncTriggerUI();
      drawScope();
    });

    bindSegmented('segTrigSweep', (val) => {
      state.trigger.sweep = val;
      sendScpi(`:TRIG:SWE ${val}`);
      syncTriggerUI();
    });

    bindSegmented('segTrigSlope', (val) => {
      state.trigger.slope = val;
      sendScpi(`:TRIG:EDGE:SLOP ${val}`);
      syncTriggerUI();
    });

    document.getElementById('selTrigCoup').addEventListener('change', (e) => {
      state.trigger.coupling = e.target.value;
      sendScpi(`:TRIG:COUP ${state.trigger.coupling}`);
    });

    const rngTrigLevel = document.getElementById('rngTrigLevel');
    rngTrigLevel.addEventListener('input', (e) => {
      state.trigger.level = parseFloat(e.target.value);
      syncTriggerUI();
      drawScope();
    });
    rngTrigLevel.addEventListener('change', () => {
      sendScpi(`:TRIG:EDGE:LEV ${state.trigger.level.toFixed(4)}`);
    });

    document.getElementById('btnTrig50').addEventListener('click', () => {
      const srcNum = parseInt(state.trigger.source.replace('CHAN', ''), 10) || 1;
      const samples = state.waveforms[srcNum];
      if (samples && samples.length > 0) {
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < samples.length; i++) {
          if (samples[i] < min) min = samples[i];
          if (samples[i] > max) max = samples[i];
        }
        state.trigger.level = (min + max) * 0.5;
      } else {
        state.trigger.level = 0;
      }
      sendScpi(`:TRIG:EDGE:LEV ${state.trigger.level.toFixed(4)}`);
      syncTriggerUI();
      drawScope();
    });

    document.getElementById('btnHoldoffDown').addEventListener('click', () => stepHoldoff(-1));
    document.getElementById('btnHoldoffUp').addEventListener('click', () => stepHoldoff(1));

    // Acquisition & Display
    bindSegmented('segAcqMode', (val) => {
      state.acq.mode = val;
      sendScpi(`:ACQ:TYPE ${val}`);
    });

    document.getElementById('selMemDepth').addEventListener('change', (e) => {
      state.acq.memDepth = parseInt(e.target.value, 10);
      sendScpi(`:ACQ:MDEP ${state.acq.memDepth}`);
      syncHorizontalUI();
    });

    bindSegmented('segTraceType', (val) => {
      state.acq.traceType = val;
      drawScope();
    });

    document.getElementById('rngGridAlpha').addEventListener('input', (e) => {
      state.acq.gridAlpha = parseFloat(e.target.value);
      document.getElementById('valGridAlpha').textContent = `${Math.round(state.acq.gridAlpha * 100)}%`;
      drawScope();
    });
  }

  function bindSegmented(containerId, onSelect) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onSelect(btn.dataset.val);
      });
    });
  }

  function setSegmentedValue(containerId, val) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.querySelectorAll('.seg-btn').forEach(b => {
      b.classList.toggle('active', String(b.dataset.val) === String(val));
    });
  }

  function selectChannel(chNum) {
    state.activeChannel = chNum;
    document.querySelectorAll('#vertChTabs .ch-tab-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.ch, 10) === chNum);
    });
    document.querySelectorAll('#chStrip .ch-tile').forEach(t => {
      t.classList.toggle('selected', t.dataset.ch === String(chNum));
    });
    syncVerticalUI();
  }

  function toggleChannelEnable(chNum) {
    const ch = state.channels[chNum];
    ch.enabled = !ch.enabled;
    sendScpi(`:CHAN${chNum}:DISP ${ch.enabled ? 'ON' : 'OFF'}`);
    syncVerticalUI();
    syncChannelStrip();
    drawScope();
  }

  function stepVScale(delta) {
    const ch = state.channels[state.activeChannel];
    ch.vIdx = Math.max(0, Math.min(VOLT_STEPS.length - 1, ch.vIdx + delta));
    const v = currentVScale(state.activeChannel);
    sendScpi(`:CHAN${state.activeChannel}:SCAL ${v.toExponential(3)}`);
    syncVerticalUI();
    syncChannelStrip();
    updateCursorReadouts();
    drawScope();
  }

  function stepHScale(delta) {
    state.horiz.tIdx = Math.max(0, Math.min(TIME_STEPS.length - 1, state.horiz.tIdx + delta));
    sendScpi(`:TIM:MAIN:SCAL ${currentTScale().toExponential(3)}`);
    syncHorizontalUI();
    updateCursorReadouts();
    drawScope();
    drawFFT();
  }

  function stepHoldoff(delta) {
    state.trigger.holdoffIdx = Math.max(0, Math.min(HOLDOFF_STEPS.length - 1, state.trigger.holdoffIdx + delta));
    const h = HOLDOFF_STEPS[state.trigger.holdoffIdx];
    sendScpi(`:TRIG:HOLD ${h.toExponential(3)}`);
    syncTriggerUI();
  }

  // ============================================================
  // DOCK CONTROLS (MEASUREMENTS, CURSORS, MATH/FFT, SCPI)
  // ============================================================
  function bindDockControls() {
    document.querySelectorAll('.dock-tab').forEach(tab => {
      tab.addEventListener('click', () => activateDockPane(tab.dataset.pane));
    });

    document.getElementById('btnToggleDock').addEventListener('click', () => {
      const dock = document.getElementById('bottomDock');
      const collapsed = dock.classList.toggle('collapsed');
      document.getElementById('btnToggleDock').textContent = collapsed ? 'Show' : 'Hide';
      setTimeout(resizeCanvases, 20);
    });

    // Measurements source
    bindSegmented('measSourceGroup', (val) => {
      state.measSource = parseInt(val, 10);
      renderMeasurements();
    });

    document.getElementById('btnQueryMeas').addEventListener('click', () => {
      if (!state.connected) {
        logScpi('ERR', 'Connect oscilloscope before querying hardware measurements.');
        return;
      }
      const ch = `CHAN${state.measSource}`;
      sendScpi(`:MEAS:VPP? ${ch}`);
      sendScpi(`:MEAS:FREQ? ${ch}`);
      sendScpi(`:MEAS:VRMS? ${ch}`);
    });

    // Cursors
    bindSegmented('cursorModeGroup', (val) => {
      state.cursors.mode = val;
      updateCursorReadouts();
      drawScope();
    });
    document.getElementById('selCursorSrc').addEventListener('change', (e) => {
      state.cursors.source = parseInt(e.target.value, 10);
      updateCursorReadouts();
    });
    document.getElementById('btnResetCursors').addEventListener('click', () => {
      state.cursors.x1 = 0.25;
      state.cursors.x2 = 0.75;
      state.cursors.y1 = 0.25;
      state.cursors.y2 = 0.75;
      updateCursorReadouts();
      drawScope();
    });

    // Math / FFT
    document.getElementById('btnMathEnable').addEventListener('click', () => {
      state.math.enabled = !state.math.enabled;
      const btn = document.getElementById('btnMathEnable');
      btn.textContent = state.math.enabled ? 'ON' : 'OFF';
      btn.classList.toggle('on', state.math.enabled);
      syncChannelStrip();
      drawScope();
    });

    document.getElementById('selMathOp').addEventListener('change', (e) => {
      state.math.op = e.target.value;
      syncChannelStrip();
      drawScope();
    });
    document.getElementById('selFftSrc').addEventListener('change', (e) => {
      state.math.fftSrc = parseInt(e.target.value, 10);
      drawFFT();
    });
    document.getElementById('selFftWindow').addEventListener('change', (e) => {
      state.math.fftWindow = e.target.value;
      drawFFT();
    });
    document.getElementById('selFftUnit').addEventListener('change', (e) => {
      state.math.fftUnit = e.target.value;
      drawFFT();
    });

    // SCPI Console
    const scpiInput = document.getElementById('scpiInput');
    document.getElementById('btnScpiSend').addEventListener('click', submitScpiInput);
    scpiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        submitScpiInput();
      } else if (e.key === 'ArrowUp') {
        if (scpiHistory.length > 0 && scpiHistoryIdx < scpiHistory.length - 1) {
          scpiHistoryIdx++;
          scpiInput.value = scpiHistory[scpiHistory.length - 1 - scpiHistoryIdx];
        }
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        if (scpiHistoryIdx > 0) {
          scpiHistoryIdx--;
          scpiInput.value = scpiHistory[scpiHistory.length - 1 - scpiHistoryIdx];
        } else {
          scpiHistoryIdx = -1;
          scpiInput.value = '';
        }
        e.preventDefault();
      }
    });

    document.querySelectorAll('.scpi-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        sendScpi(chip.dataset.cmd, true);
      });
    });

    document.getElementById('btnClearScpi').addEventListener('click', () => {
      document.getElementById('scpiLog').innerHTML = '';
    });
  }

  function activateDockPane(paneName) {
    const dock = document.getElementById('bottomDock');
    if (dock.classList.contains('collapsed')) {
      dock.classList.remove('collapsed');
      document.getElementById('btnToggleDock').textContent = 'Hide';
    }
    document.querySelectorAll('.dock-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.pane === paneName);
    });
    document.querySelectorAll('.dock-pane').forEach(p => {
      p.classList.toggle('active', p.id === `pane-${paneName}`);
    });
    setTimeout(resizeCanvases, 20);
  }

  function submitScpiInput() {
    const input = document.getElementById('scpiInput');
    const cmd = input.value.trim();
    if (!cmd) return;
    scpiHistory.push(cmd);
    scpiHistoryIdx = -1;
    input.value = '';
    sendScpi(cmd, true);
  }

  // ============================================================
  // MODALS & HARDWARE CONNECTIVITY
  // ============================================================
  function bindModals() {
    document.getElementById('btnCloseConn').addEventListener('click', () => {
      document.getElementById('connModal').classList.remove('open');
    });
    document.getElementById('btnCloseDriver').addEventListener('click', () => {
      document.getElementById('driverModal').classList.remove('open');
    });
    document.getElementById('btnCloseDriverOk').addEventListener('click', () => {
      document.getElementById('driverModal').classList.remove('open');
    });

    document.getElementById('btnConnToDrivers').addEventListener('click', () => {
      document.getElementById('connModal').classList.remove('open');
      document.getElementById('driverModal').classList.add('open');
    });

    const launchDevMgr = () => {
      if (window.electronAPI && window.electronAPI.openDeviceManager) {
        window.electronAPI.openDeviceManager();
      }
    };
    document.getElementById('btnLaunchDevMgr').addEventListener('click', launchDevMgr);
    document.getElementById('btnOpenDevMgrFromConn').addEventListener('click', launchDevMgr);

    // Connection Modal Tabs
    document.querySelectorAll('.modal-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.ctab;
        document.getElementById('ctab-serial').style.display = target === 'serial' ? 'flex' : 'none';
        document.getElementById('ctab-usb').style.display = target === 'usb' ? 'flex' : 'none';
        document.getElementById('btnConnectSerial').style.display = target === 'serial' ? 'inline-flex' : 'none';
      });
    });

    document.getElementById('btnRefreshPorts').addEventListener('click', scanHardwarePorts);
    document.getElementById('btnConnectSerial').addEventListener('click', connectSerial);
    document.getElementById('btnConnectWebUsb').addEventListener('click', connectDirectUsb);
    document.getElementById('btnModalDisconnect').addEventListener('click', disconnectHardware);

    document.getElementById('selPollRate').addEventListener('change', (e) => {
      state.acq.pollIntervalMs = parseInt(e.target.value, 10);
      if (state.connected && state.running) {
        startPolling();
      }
    });
  }

  function openConnModal() {
    document.getElementById('connErrorMsg').style.display = 'none';
    document.getElementById('connModal').classList.add('open');
    scanHardwarePorts();
  }

  async function scanHardwarePorts() {
    const sel = document.getElementById('selComPort');
    const tbody = document.getElementById('hwTableBody');
    const lblCount = document.getElementById('lblHwCount');

    sel.innerHTML = '<option value="">Scanning Windows COM ports...</option>';
    tbody.innerHTML = '<tr><td colspan="3">Scanning PnP devices...</td></tr>';

    if (window.electronAPI && window.electronAPI.getComPortsDetailed) {
      try {
        const ports = await window.electronAPI.getComPortsDetailed();
        sel.innerHTML = '';
        if (ports && ports.length > 0) {
          ports.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.port;
            const statusTag = p.present ? 'Active' : 'Not Connected';
            opt.textContent = `${p.port} — ${p.name} [${statusTag}]`;
            sel.appendChild(opt);
          });
          // Prefer non-COM1 USB Serial port if present
          const preferred = ports.find(p => p.port !== 'COM1' && p.present) || ports.find(p => p.port !== 'COM1') || ports[0];
          if (preferred) sel.value = preferred.port;
        } else {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No COM ports detected — enter manually below or check Drivers';
          sel.appendChild(opt);
        }
      } catch (e) {
        sel.innerHTML = '<option value="">Scan error — enter COM port manually</option>';
      }
    }

    if (window.electronAPI && window.electronAPI.getAllUsbDevices) {
      try {
        const devices = await window.electronAPI.getAllUsbDevices();
        const filtered = (devices || []).filter(d =>
          d.FriendlyName &&
          !/Root Hub|Host Controller|Input Device|HID|Keyboard|Mouse|Microphone|Audio/i.test(d.FriendlyName)
        );
        lblCount.textContent = `${filtered.length} device${filtered.length === 1 ? '' : 's'}`;
        if (filtered.length === 0) {
          tbody.innerHTML = '<tr><td colspan="3">No USB instruments or serial bridges detected</td></tr>';
        } else {
          tbody.innerHTML = filtered.map(d => `
            <tr>
              <td style="color: var(--text-primary);">${escapeHtml(d.FriendlyName)}</td>
              <td>${escapeHtml(d.Class || '-')}</td>
              <td>${escapeHtml(d.InstanceId || '-')}</td>
            </tr>
          `).join('');
        }
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3">Unable to enumerate PnP hardware</td></tr>';
      }
    }
  }

  async function connectSerial() {
    const errBox = document.getElementById('connErrorMsg');
    errBox.style.display = 'none';

    const manual = document.getElementById('txtManualPort').value.trim();
    const selected = document.getElementById('selComPort').value;
    let port = manual || selected;
    if (/^\d+$/.test(port)) port = `COM${port}`;
    port = port.toUpperCase();

    const baudRate = parseInt(document.getElementById('selBaudRate').value, 10) || 115200;
    state.acq.pollIntervalMs = parseInt(document.getElementById('selPollRate').value, 10);

    if (!port) {
      errBox.textContent = 'Select a detected COM port or enter a manual port (e.g. COM3).';
      errBox.style.display = 'block';
      return;
    }

    logScpi('SYS', `Opening ${port} at ${baudRate} bps (8N1)...`);

    if (window.electronAPI && window.electronAPI.serialConnect) {
      try {
        const res = await window.electronAPI.serialConnect(port, baudRate);
        if (res && res.success) {
          onConnected('serial', `${port} · ${baudRate}`);
          document.getElementById('connModal').classList.remove('open');
          sendScpi('*IDN?', true);
        } else {
          const msg = res && res.error ? res.error : `Failed to open ${port}. Ensure oscilloscope is powered on and port is free.`;
          errBox.textContent = msg;
          errBox.style.display = 'block';
          logScpi('ERR', msg);
        }
      } catch (err) {
        errBox.textContent = err.message;
        errBox.style.display = 'block';
        logScpi('ERR', `Serial open error: ${err.message}`);
      }
    }
  }

  async function connectDirectUsb() {
    const errBox = document.getElementById('connErrorMsg');
    errBox.style.display = 'none';

    if (!navigator.usb) {
      logScpi('ERR', 'WebUSB API unavailable in this runtime.');
      return;
    }

    try {
      logScpi('SYS', 'Scanning Direct USB / USBTMC endpoints...');
      const device = await navigator.usb.requestDevice({
        filters: [
          { vendorId: 0x5656 },
          { vendorId: 0x4348 },
          { vendorId: 0x0483 },
          { vendorId: 0x1a86 },
          { vendorId: 0x10c4 },
          { vendorId: 0x0403 }
        ]
      });

      await device.open();
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }
      await device.claimInterface(0);
      usbDevice = device;

      const label = device.productName || `USB ${device.vendorId.toString(16).toUpperCase()}:${device.productId.toString(16).toUpperCase()}`;
      onConnected('usb', label);
      document.getElementById('connModal').classList.remove('open');
      sendScpi('*IDN?', true);
    } catch (err) {
      logScpi('ERR', `Direct USB link failed: ${err.message}`);
      errBox.textContent = `Direct USB failed: ${err.message}`;
      errBox.style.display = 'block';
    }
  }

  function onConnected(type, label) {
    state.connected = true;
    state.connType = type;
    state.portLabel = label;
    state.running = true;
    state.trigger.status = 'RUN';
    syncConnectionUI();
    syncAcquisitionUI();
    startPolling();
    logScpi('SYS', `Connected via ${type.toUpperCase()} (${label}).`);
  }

  async function disconnectHardware() {
    stopPolling();
    if (state.connType === 'serial' && window.electronAPI && window.electronAPI.serialDisconnect) {
      await window.electronAPI.serialDisconnect();
    }
    if (usbDevice) {
      try { await usbDevice.close(); } catch (e) {}
      usbDevice = null;
    }
    state.connected = false;
    state.connType = null;
    state.portLabel = '';
    state.idn = '';
    state.running = false;
    state.singleArmed = false;
    state.trigger.status = 'OFFLINE';
    syncConnectionUI();
    syncAcquisitionUI();
    drawScope();
    logScpi('SYS', 'Instrument disconnected.');
  }

  // ============================================================
  // SERIAL / USB PROTOCOL & WAVEFORM PARSING
  // ============================================================
  let rxBuffer = '';
  let rxRawAccumulator = new Uint8Array(0);
  let expectedBinaryLength = -1;

  function bindSerialListeners() {
    if (!window.electronAPI) return;

    if (window.electronAPI.onSerialRawData) {
      window.electronAPI.onSerialRawData((raw) => {
        flashLed('ledRx', 'rx-flash');
        const uint8 = new Uint8Array(raw);
        handleIncomingRaw(uint8);
      });
    } else if (window.electronAPI.onSerialData) {
      window.electronAPI.onSerialData((payload) => {
        flashLed('ledRx', 'rx-flash');
        handleIncomingPayload(payload);
      });
    }

    if (window.electronAPI.onSerialDisconnected) {
      window.electronAPI.onSerialDisconnected(() => {
        if (state.connected && state.connType === 'serial') {
          disconnectHardware();
        }
      });
    }

    if (window.electronAPI.onComPortsChanged) {
      window.electronAPI.onComPortsChanged((ports) => {
        logScpi('SYS', `Hardware change detected: Ports [${ports.join(', ')}]`);
        scanHardwarePorts();
        if (!state.connected && ports && ports.length > 0) {
          const target = ports.find(p => p !== 'COM1') || ports[0];
          const sel = document.getElementById('selComPort');
          if (sel) sel.value = target;
          const lbl = document.getElementById('connLabel');
          if (lbl) lbl.textContent = `${target} (DETECTED)`;
        }
      });
    }
  }

  function handleIncomingRaw(chunk) {
    if (!chunk || chunk.length === 0) return;

    // Append to binary accumulator
    const prev = rxRawAccumulator;
    const combined = new Uint8Array(prev.length + chunk.length);
    combined.set(prev, 0);
    combined.set(chunk, prev.length);
    rxRawAccumulator = combined;

    // Check if starting an IEEE 488.2 binary block (#<n><digits><data>)
    if (rxRawAccumulator.length > 3 && rxRawAccumulator[0] === 35 /* '#' */) {
      const nDigits = rxRawAccumulator[1] - 48; // ASCII '0'..'9'
      if (nDigits > 0 && nDigits < 9 && rxRawAccumulator.length >= 2 + nDigits) {
        let lengthStr = '';
        for (let i = 0; i < nDigits; i++) {
          lengthStr += String.fromCharCode(rxRawAccumulator[2 + i]);
        }
        const totalBytes = parseInt(lengthStr, 10);
        const headerLen = 2 + nDigits;
        if (!isNaN(totalBytes)) {
          if (rxRawAccumulator.length >= headerLen + totalBytes) {
            // Full waveform payload received
            const targetCh = pendingWaveChannel || state.activeChannel;
            const vScale = currentVScale(targetCh);
            const samples = new Float32Array(totalBytes);
            for (let i = 0; i < totalBytes; i++) {
              const rawByte = rxRawAccumulator[headerLen + i];
              samples[i] = ((rawByte - 128) / 25.0) * vScale;
            }
            rxRawAccumulator = rxRawAccumulator.slice(headerLen + totalBytes);
            ingestWaveform(targetCh, samples);
            return;
          } else {
            // Still receiving frames
            return;
          }
        }
      }
    }

    // Try text interpretation
    const text = new TextDecoder('utf-8', { fatal: false }).decode(chunk);
    handleIncomingPayload(text, chunk);
  }

  function handleIncomingPayload(text, rawBytes = null) {
    if (!text) return;
    rxBuffer += text;

    // Process all complete lines terminated by \n or \r
    while (rxBuffer.includes('\n') || rxBuffer.includes('\r')) {
      let idx = rxBuffer.indexOf('\n');
      if (idx === -1 || (rxBuffer.indexOf('\r') !== -1 && rxBuffer.indexOf('\r') < idx)) {
        idx = rxBuffer.indexOf('\r');
      }
      const line = rxBuffer.slice(0, idx).trim();
      rxBuffer = rxBuffer.slice(idx + 1).replace(/^[\r\n]+/, '');

      if (!line) continue;
      processIncomingLine(line);
    }
  }

  function processIncomingLine(trimmed) {
    // 1. Identify *IDN? response
    if (/^[A-Za-z0-9\-_\s]+,[^,]+,[^,]+/.test(trimmed)) {
      state.idn = trimmed;
      document.getElementById('idnReadout').textContent = trimmed;
      logScpi('RX', trimmed);
      return;
    }

    // 2. Measure responses (e.g. :MEAS:VPP? CHAN1 -> "3.000" or "3.00V" or ":MEAS:VPP 3.000")
    const numMatch = trimmed.match(/([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*V?/i);
    if (/VPP/i.test(trimmed) && numMatch) {
      logScpi('RX', `Vpp = ${numMatch[1]} V`);
      return;
    }
    if (/FREQ/i.test(trimmed) && numMatch) {
      logScpi('RX', `Freq = ${numMatch[1]} Hz`);
      return;
    }

    // 3. Comma-separated ASCII waveform points (e.g., 100+ comma-separated values)
    if (trimmed.includes(',')) {
      const parts = trimmed.split(',');
      if (parts.length >= 16 && !isNaN(parseFloat(parts[0]))) {
        const targetCh = pendingWaveChannel || state.activeChannel;
        const samples = new Float32Array(parts.length);
        for (let i = 0; i < parts.length; i++) {
          const val = parseFloat(parts[i]);
          samples[i] = isNaN(val) ? 0 : val;
        }
        ingestWaveform(targetCh, samples);
        return;
      }
    }

    logScpi('RX', trimmed);
  }

  function ingestWaveform(chNum, samples) {
    state.waveforms[chNum] = samples;
    const totalTime = currentTScale() * 10;
    state.acq.sampleRate = samples.length / totalTime;
    if (state.singleArmed) {
      state.singleArmed = false;
      state.trigger.status = 'STOP';
      syncAcquisitionUI();
    } else if (state.running) {
      state.trigger.status = "TRIG'D";
      syncAcquisitionUI();
    }
    syncHorizontalUI();
    renderMeasurements();
    drawScope();
    drawFFT();
  }

  function startPolling() {
    stopPolling();
    if (state.acq.pollIntervalMs <= 0) return;
    pollTimer = setInterval(() => {
      if (!state.connected || !state.running) return;
      requestNextEnabledChannel();
    }, state.acq.pollIntervalMs);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function requestActiveWaveforms() {
    for (let ch = 1; ch <= 4; ch++) {
      if (state.channels[ch].enabled) {
        pendingWaveChannel = ch;
        sendScpi(`:WAV:SOUR CHAN${ch}`);
        sendScpi(':WAV:DATA?');
        break;
      }
    }
  }

  function requestNextEnabledChannel() {
    for (let i = 0; i < 4; i++) {
      const ch = ((pollChannelCursor - 1 + i) % 4) + 1;
      if (state.channels[ch].enabled) {
        pollChannelCursor = (ch % 4) + 1;
        pendingWaveChannel = ch;
        sendScpi(`:WAV:SOUR CHAN${ch}`);
        sendScpi(':WAV:DATA?');
        return;
      }
    }
  }

  // ============================================================
  // OSCILLOSCOPE GRATICULE & TRACE RENDERING
  // ============================================================
  function drawScope() {
    const dpr = window.devicePixelRatio || 1;
    const width = scopeCanvas.width / dpr;
    const height = scopeCanvas.height / dpr;
    if (width <= 0 || height <= 0) return;

    const padL = 28;
    const padR = 26;
    const padT = 18;
    const padB = 14;
    const gx = padL;
    const gy = padT;
    const gw = Math.max(40, width - padL - padR);
    const gh = Math.max(40, height - padT - padB);
    graticuleRect = { x: gx, y: gy, w: gw, h: gh };

    // Background
    scopeCtx.fillStyle = '#111215';
    scopeCtx.fillRect(0, 0, width, height);

    // Graticule frame fill
    scopeCtx.fillStyle = '#131418';
    scopeCtx.fillRect(gx, gy, gw, gh);

    const alpha = state.acq.gridAlpha;

    // Major divisions (10 horizontal x 8 vertical)
    scopeCtx.strokeStyle = `rgba(110, 114, 128, ${0.28 * alpha})`;
    scopeCtx.lineWidth = 1;
    scopeCtx.beginPath();
    for (let i = 1; i < 10; i++) {
      const x = Math.round(gx + (gw * i) / 10) + 0.5;
      scopeCtx.moveTo(x, gy);
      scopeCtx.lineTo(x, gy + gh);
    }
    for (let j = 1; j < 8; j++) {
      const y = Math.round(gy + (gh * j) / 8) + 0.5;
      scopeCtx.moveTo(gx, y);
      scopeCtx.lineTo(gx + gw, y);
    }
    scopeCtx.stroke();

    // Center crosshairs with 5 sub-ticks per division (real DSO graticule)
    const cx = Math.round(gx + gw / 2) + 0.5;
    const cy = Math.round(gy + gh / 2) + 0.5;
    scopeCtx.strokeStyle = `rgba(145, 150, 165, ${0.48 * alpha})`;
    scopeCtx.beginPath();
    scopeCtx.moveTo(gx, cy);
    scopeCtx.lineTo(gx + gw, cy);
    scopeCtx.moveTo(cx, gy);
    scopeCtx.lineTo(cx, gy + gh);

    for (let i = 0; i <= 50; i++) {
      const x = gx + (gw * i) / 50;
      const tick = i % 5 === 0 ? 4 : 2.5;
      scopeCtx.moveTo(x, cy - tick);
      scopeCtx.lineTo(x, cy + tick);
    }
    for (let j = 0; j <= 40; j++) {
      const y = gy + (gh * j) / 40;
      const tick = j % 5 === 0 ? 4 : 2.5;
      scopeCtx.moveTo(cx - tick, y);
      scopeCtx.lineTo(cx + tick, y);
    }
    scopeCtx.stroke();

    // Outer graticule border
    scopeCtx.strokeStyle = '#2d2f36';
    scopeCtx.lineWidth = 1;
    scopeCtx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);

    // Clip trace rendering strictly to graticule interior
    scopeCtx.save();
    scopeCtx.beginPath();
    scopeCtx.rect(gx + 1, gy + 1, gw - 2, gh - 2);
    scopeCtx.clip();

    // Render acquired hardware traces
    if (state.horiz.format === 'XY') {
      drawXYTrace(gx, gy, gw, gh);
    } else {
      for (let chNum = 1; chNum <= 4; chNum++) {
        const ch = state.channels[chNum];
        if (!ch.enabled) continue;
        const samples = state.waveforms[chNum];
        if (samples && samples.length > 0) {
          drawChannelWaveform(chNum, samples, gx, gy, gw, gh);
        }
      }
      if (state.math.enabled) {
        drawMathWaveform(gx, gy, gw, gh);
      }
    }

    // Trigger level reference line (subtle dashed line while dragging or connected)
    const trigY = getTriggerY(gy, gh);
    if (dragTarget && dragTarget.type === 'trig') {
      scopeCtx.strokeStyle = 'rgba(249, 115, 22, 0.75)';
      scopeCtx.setLineDash([4, 4]);
      scopeCtx.beginPath();
      scopeCtx.moveTo(gx, trigY);
      scopeCtx.lineTo(gx + gw, trigY);
      scopeCtx.stroke();
      scopeCtx.setLineDash([]);
    }

    // Cursors overlay
    drawCursors(gx, gy, gw, gh);

    scopeCtx.restore();

    // Margin markers: Channel Ground Tags (left)
    for (let chNum = 1; chNum <= 4; chNum++) {
      const ch = state.channels[chNum];
      if (!ch.enabled) continue;
      const y = clamp(gy + gh / 2 - (ch.offset * gh) / 8, gy + 6, gy + gh - 6);
      drawLeftFlag(gx, y, String(chNum), CH_COLORS[chNum], chNum === state.activeChannel);
    }

    // Margin marker: Trigger Level Tag (right)
    drawRightFlag(gx + gw, clamp(trigY, gy + 6, gy + gh - 6), 'T', '#f97316');

    // Margin marker: Horizontal Trigger Position (top)
    const hPosX = clamp(gx + gw / 2 + (state.horiz.posDiv * gw) / 10, gx + 6, gx + gw - 6);
    drawTopMarker(hPosX, gy, '#f97316');
  }

  function drawChannelWaveform(chNum, samples, gx, gy, gw, gh) {
    const ch = state.channels[chNum];
    const vScale = currentVScale(chNum);
    const pxPerDivY = gh / 8;
    const baseY = gy + gh / 2 - ch.offset * pxPerDivY;
    const sign = ch.invert ? -1 : 1;

    scopeCtx.strokeStyle = CH_COLORS[chNum];
    scopeCtx.fillStyle = CH_COLORS[chNum];
    scopeCtx.lineWidth = 1.5;

    const len = samples.length;
    if (state.acq.traceType === 'dots') {
      const step = Math.max(1, Math.floor(len / gw));
      for (let i = 0; i < len; i += step) {
        const x = gx + (i / (len - 1 || 1)) * gw;
        const y = baseY - (sign * samples[i] / vScale) * pxPerDivY;
        scopeCtx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
    } else {
      scopeCtx.beginPath();
      for (let i = 0; i < len; i++) {
        const x = gx + (i / (len - 1 || 1)) * gw;
        const y = baseY - (sign * samples[i] / vScale) * pxPerDivY;
        if (i === 0) scopeCtx.moveTo(x, y);
        else scopeCtx.lineTo(x, y);
      }
      scopeCtx.stroke();
    }
  }

  function drawMathWaveform(gx, gy, gw, gh) {
    const s1 = state.waveforms[1];
    const s2 = state.waveforms[2];
    if (!s1 || !s2) return;
    const len = Math.min(s1.length, s2.length);
    if (len === 0) return;

    const vScale = currentVScale(1);
    const pxPerDivY = gh / 8;
    const baseY = gy + gh / 2;

    scopeCtx.strokeStyle = CH_COLORS.M;
    scopeCtx.lineWidth = 1.3;
    scopeCtx.beginPath();
    for (let i = 0; i < len; i++) {
      let val = 0;
      if (state.math.op === 'sub') val = s1[i] - s2[i];
      else if (state.math.op === 'add') val = s1[i] + s2[i];
      else if (state.math.op === 'mul') val = s1[i] * s2[i];
      const x = gx + (i / (len - 1 || 1)) * gw;
      const y = baseY - (val / vScale) * pxPerDivY;
      if (i === 0) scopeCtx.moveTo(x, y);
      else scopeCtx.lineTo(x, y);
    }
    scopeCtx.stroke();
  }

  function drawXYTrace(gx, gy, gw, gh) {
    const sx = state.waveforms[1];
    const sy = state.waveforms[2];
    if (!sx || !sy) return;
    const len = Math.min(sx.length, sy.length);
    const vx = currentVScale(1);
    const vy = currentVScale(2);

    scopeCtx.strokeStyle = CH_COLORS[1];
    scopeCtx.lineWidth = 1.4;
    scopeCtx.beginPath();
    for (let i = 0; i < len; i++) {
      const x = gx + gw / 2 + (sx[i] / vx) * (gw / 10);
      const y = gy + gh / 2 - (sy[i] / vy) * (gh / 8);
      if (i === 0) scopeCtx.moveTo(x, y);
      else scopeCtx.lineTo(x, y);
    }
    scopeCtx.stroke();
  }

  function drawCursors(gx, gy, gw, gh) {
    const mode = state.cursors.mode;
    if (mode === 'off') return;

    scopeCtx.lineWidth = 1;
    scopeCtx.font = '600 10px "JetBrains Mono", monospace';

    if (mode === 'x' || mode === 'xy') {
      const x1 = Math.round(gx + state.cursors.x1 * gw) + 0.5;
      const x2 = Math.round(gx + state.cursors.x2 * gw) + 0.5;
      scopeCtx.strokeStyle = 'rgba(236, 236, 239, 0.75)';
      scopeCtx.setLineDash([4, 3]);
      scopeCtx.beginPath();
      scopeCtx.moveTo(x1, gy); scopeCtx.lineTo(x1, gy + gh);
      scopeCtx.moveTo(x2, gy); scopeCtx.lineTo(x2, gy + gh);
      scopeCtx.stroke();
      scopeCtx.setLineDash([]);

      scopeCtx.fillStyle = '#ececef';
      scopeCtx.fillText('X1', x1 + 4, gy + 12);
      scopeCtx.fillText('X2', x2 + 4, gy + 12);
    }

    if (mode === 'y' || mode === 'xy') {
      const y1 = Math.round(gy + state.cursors.y1 * gh) + 0.5;
      const y2 = Math.round(gy + state.cursors.y2 * gh) + 0.5;
      scopeCtx.strokeStyle = 'rgba(45, 156, 219, 0.8)';
      scopeCtx.setLineDash([4, 3]);
      scopeCtx.beginPath();
      scopeCtx.moveTo(gx, y1); scopeCtx.lineTo(gx + gw, y1);
      scopeCtx.moveTo(gx, y2); scopeCtx.lineTo(gx + gw, y2);
      scopeCtx.stroke();
      scopeCtx.setLineDash([]);

      scopeCtx.fillStyle = '#2d9cdb';
      scopeCtx.fillText('Y1', gx + 5, y1 - 4);
      scopeCtx.fillText('Y2', gx + 5, y2 - 4);
    }
  }

  function drawLeftFlag(xRight, y, label, color, isActive) {
    const w = 18, h = 13;
    scopeCtx.fillStyle = color;
    scopeCtx.beginPath();
    scopeCtx.moveTo(xRight - 1, y);
    scopeCtx.lineTo(xRight - 6, y - h / 2);
    scopeCtx.lineTo(xRight - w - 4, y - h / 2);
    scopeCtx.lineTo(xRight - w - 4, y + h / 2);
    scopeCtx.lineTo(xRight - 6, y + h / 2);
    scopeCtx.closePath();
    scopeCtx.fill();

    if (isActive) {
      scopeCtx.strokeStyle = '#ffffff';
      scopeCtx.lineWidth = 1;
      scopeCtx.stroke();
    }

    scopeCtx.fillStyle = '#111215';
    scopeCtx.font = '700 9.5px "JetBrains Mono", monospace';
    scopeCtx.textAlign = 'center';
    scopeCtx.textBaseline = 'middle';
    scopeCtx.fillText(label, xRight - 13, y + 0.5);
    scopeCtx.textAlign = 'left';
    scopeCtx.textBaseline = 'alphabetic';
  }

  function drawRightFlag(xLeft, y, label, color) {
    const w = 17, h = 13;
    scopeCtx.fillStyle = color;
    scopeCtx.beginPath();
    scopeCtx.moveTo(xLeft + 1, y);
    scopeCtx.lineTo(xLeft + 6, y - h / 2);
    scopeCtx.lineTo(xLeft + w + 3, y - h / 2);
    scopeCtx.lineTo(xLeft + w + 3, y + h / 2);
    scopeCtx.lineTo(xLeft + 6, y + h / 2);
    scopeCtx.closePath();
    scopeCtx.fill();

    scopeCtx.fillStyle = '#111215';
    scopeCtx.font = '700 9.5px "JetBrains Mono", monospace';
    scopeCtx.textAlign = 'center';
    scopeCtx.textBaseline = 'middle';
    scopeCtx.fillText(label, xLeft + 12, y + 0.5);
    scopeCtx.textAlign = 'left';
    scopeCtx.textBaseline = 'alphabetic';
  }

  function drawTopMarker(x, yBottom, color) {
    scopeCtx.fillStyle = color;
    scopeCtx.beginPath();
    scopeCtx.moveTo(x, yBottom - 1);
    scopeCtx.lineTo(x - 5, yBottom - 10);
    scopeCtx.lineTo(x + 5, yBottom - 10);
    scopeCtx.closePath();
    scopeCtx.fill();
  }

  function getTriggerY(gy, gh) {
    const srcNum = parseInt(state.trigger.source.replace('CHAN', ''), 10) || 1;
    const ch = state.channels[srcNum] || state.channels[1];
    const vScale = currentVScale(srcNum);
    const pxPerDivY = gh / 8;
    const zeroY = gy + gh / 2 - ch.offset * pxPerDivY;
    return zeroY - (state.trigger.level / vScale) * pxPerDivY;
  }

  // ============================================================
  // DIRECT CANVAS INTERACTION (DRAG MARKERS & CURSORS, WHEEL ZOOM)
  // ============================================================
  function bindCanvasInteractions() {
    scopeCanvas.addEventListener('mousedown', (e) => {
      const rect = scopeCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { x: gx, y: gy, w: gw, h: gh } = graticuleRect;

      // 1. Check left channel flags
      if (mx <= gx + 4) {
        for (let chNum = 1; chNum <= 4; chNum++) {
          const ch = state.channels[chNum];
          if (!ch.enabled) continue;
          const cy = clamp(gy + gh / 2 - (ch.offset * gh) / 8, gy + 6, gy + gh - 6);
          if (Math.abs(my - cy) <= 10) {
            selectChannel(chNum);
            dragTarget = { type: 'ch', ch: chNum };
            return;
          }
        }
      }

      // 2. Check right trigger flag
      if (mx >= gx + gw - 4) {
        const ty = clamp(getTriggerY(gy, gh), gy + 6, gy + gh - 6);
        if (Math.abs(my - ty) <= 12) {
          dragTarget = { type: 'trig' };
          drawScope();
          return;
        }
      }

      // 3. Check top horizontal trigger marker
      if (my <= gy + 4) {
        const hx = clamp(gx + gw / 2 + (state.horiz.posDiv * gw) / 10, gx + 6, gx + gw - 6);
        if (Math.abs(mx - hx) <= 12) {
          dragTarget = { type: 'hpos' };
          return;
        }
      }

      // 4. Check cursors
      const cm = state.cursors.mode;
      if (cm === 'x' || cm === 'xy') {
        const x1 = gx + state.cursors.x1 * gw;
        const x2 = gx + state.cursors.x2 * gw;
        if (Math.abs(mx - x1) <= 8) { dragTarget = { type: 'x1' }; return; }
        if (Math.abs(mx - x2) <= 8) { dragTarget = { type: 'x2' }; return; }
      }
      if (cm === 'y' || cm === 'xy') {
        const y1 = gy + state.cursors.y1 * gh;
        const y2 = gy + state.cursors.y2 * gh;
        if (Math.abs(my - y1) <= 8) { dragTarget = { type: 'y1' }; return; }
        if (Math.abs(my - y2) <= 8) { dragTarget = { type: 'y2' }; return; }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragTarget) return;
      const rect = scopeCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { x: gx, y: gy, w: gw, h: gh } = graticuleRect;

      if (dragTarget.type === 'ch') {
        const ch = state.channels[dragTarget.ch];
        ch.offset = clamp(((gy + gh / 2) - my) / (gh / 8), -4, 4);
        syncVerticalUI();
        drawScope();
      } else if (dragTarget.type === 'trig') {
        const srcNum = parseInt(state.trigger.source.replace('CHAN', ''), 10) || 1;
        const ch = state.channels[srcNum] || state.channels[1];
        const vScale = currentVScale(srcNum);
        const zeroY = gy + gh / 2 - ch.offset * (gh / 8);
        state.trigger.level = clamp(((zeroY - my) / (gh / 8)) * vScale, -4 * vScale, 4 * vScale);
        syncTriggerUI();
        drawScope();
      } else if (dragTarget.type === 'hpos') {
        state.horiz.posDiv = clamp((mx - (gx + gw / 2)) / (gw / 10), -5, 5);
        syncHorizontalUI();
        drawScope();
      } else if (dragTarget.type === 'x1') {
        state.cursors.x1 = clamp((mx - gx) / gw, 0, 1);
        updateCursorReadouts();
        drawScope();
      } else if (dragTarget.type === 'x2') {
        state.cursors.x2 = clamp((mx - gx) / gw, 0, 1);
        updateCursorReadouts();
        drawScope();
      } else if (dragTarget.type === 'y1') {
        state.cursors.y1 = clamp((my - gy) / gh, 0, 1);
        updateCursorReadouts();
        drawScope();
      } else if (dragTarget.type === 'y2') {
        state.cursors.y2 = clamp((my - gy) / gh, 0, 1);
        updateCursorReadouts();
        drawScope();
      }
    });

    window.addEventListener('mouseup', () => {
      if (!dragTarget) return;
      if (dragTarget.type === 'ch') {
        const chNum = dragTarget.ch;
        const volts = (state.channels[chNum].offset * currentVScale(chNum)).toFixed(4);
        sendScpi(`:CHAN${chNum}:OFFS ${volts}`);
      } else if (dragTarget.type === 'trig') {
        sendScpi(`:TRIG:EDGE:LEV ${state.trigger.level.toFixed(4)}`);
      } else if (dragTarget.type === 'hpos') {
        const sec = (state.horiz.posDiv * currentTScale()).toExponential(4);
        sendScpi(`:TIM:MAIN:OFFS ${sec}`);
      }
      dragTarget = null;
      drawScope();
    });

    scopeCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      if (e.shiftKey) stepVScale(dir);
      else stepHScale(dir);
    }, { passive: false });
  }

  // ============================================================
  // REAL MEASUREMENTS ENGINE (COMPUTED FROM ACQUIRED SAMPLES)
  // ============================================================
  function computeMeasurements(samples) {
    if (!samples || samples.length < 4) {
      return {
        vpp: null, vmax: null, vmin: null, vamp: null, vavg: null, vrms: null,
        freq: null, period: null, dutyPos: null, dutyNeg: null, rise: null, fall: null
      };
    }

    const n = samples.length;
    let min = Infinity, max = -Infinity, sum = 0, sumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = samples[i];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      sumSq += v * v;
    }

    const vpp = max - min;
    const vavg = sum / n;
    const vrms = Math.sqrt(sumSq / n);
    const mid = (max + min) * 0.5;
    const dt = (currentTScale() * 10) / n;

    // Rising & falling zero-crossings around mid
    const risingIdx = [];
    let highCount = 0;
    for (let i = 0; i < n; i++) {
      if (samples[i] >= mid) highCount++;
      if (i > 0 && samples[i - 1] < mid && samples[i] >= mid) {
        const frac = (mid - samples[i - 1]) / (samples[i] - samples[i - 1] || 1);
        risingIdx.push((i - 1) + frac);
      }
    }

    let period = null, freq = null;
    if (risingIdx.length >= 2 && vpp > 1e-4) {
      const avgPeriodSamples = (risingIdx[risingIdx.length - 1] - risingIdx[0]) / (risingIdx.length - 1);
      period = avgPeriodSamples * dt;
      freq = period > 0 ? 1 / period : null;
    }

    const dutyPos = vpp > 1e-4 ? (highCount / n) * 100 : null;
    const dutyNeg = dutyPos !== null ? 100 - dutyPos : null;

    // 10%-90% Rise and Fall time
    const low10 = min + 0.1 * vpp;
    const high90 = min + 0.9 * vpp;
    let rise = null, fall = null;
    if (vpp > 1e-4) {
      let rStart = -1, fStart = -1;
      for (let i = 1; i < n; i++) {
        if (rise === null) {
          if (samples[i - 1] < low10 && samples[i] >= low10) rStart = i;
          else if (rStart >= 0 && samples[i] >= high90) rise = (i - rStart) * dt;
        }
        if (fall === null) {
          if (samples[i - 1] > high90 && samples[i] <= high90) fStart = i;
          else if (fStart >= 0 && samples[i] <= low10) fall = (i - fStart) * dt;
        }
        if (rise !== null && fall !== null) break;
      }
    }

    return { vpp, vmax: max, vmin: min, vamp: vpp, vavg, vrms, freq, period, dutyPos, dutyNeg, rise, fall };
  }

  function renderMeasurements() {
    const chNum = state.measSource;
    const m = computeMeasurements(state.waveforms[chNum]);
    const color = CH_COLORS[chNum];

    const items = [
      { label: 'Vpp', value: formatEng(m.vpp, 'V') },
      { label: 'Vmax', value: formatEng(m.vmax, 'V') },
      { label: 'Vmin', value: formatEng(m.vmin, 'V') },
      { label: 'Vavg', value: formatEng(m.vavg, 'V') },
      { label: 'Vrms', value: formatEng(m.vrms, 'V') },
      { label: 'Vamp', value: formatEng(m.vamp, 'V') },
      { label: 'Freq', value: formatEng(m.freq, 'Hz') },
      { label: 'Period', value: formatEng(m.period, 's') },
      { label: 'Duty +', value: m.dutyPos !== null ? `${m.dutyPos.toFixed(1)} %` : '---' },
      { label: 'Duty -', value: m.dutyNeg !== null ? `${m.dutyNeg.toFixed(1)} %` : '---' },
      { label: 'Rise', value: formatEng(m.rise, 's') },
      { label: 'Fall', value: formatEng(m.fall, 's') }
    ];

    const grid = document.getElementById('measGrid');
    grid.innerHTML = items.map(it => `
      <div class="meas-cell" style="border-left-color: ${color};">
        <span class="meas-label">${it.label}</span>
        <span class="meas-value">${it.value}</span>
      </div>
    `).join('');
  }

  function updateCursorReadouts() {
    const mode = state.cursors.mode;
    if (mode === 'off') {
      ['curX1', 'curX2', 'curDX', 'curFreq', 'curY1', 'curY2', 'curDY'].forEach(id => {
        document.getElementById(id).textContent = '---';
      });
      return;
    }

    const totalT = currentTScale() * 10;
    const tOffset = state.horiz.posDiv * currentTScale();
    const x1t = (state.cursors.x1 - 0.5) * totalT - tOffset;
    const x2t = (state.cursors.x2 - 0.5) * totalT - tOffset;
    const dxt = Math.abs(x2t - x1t);

    if (mode === 'x' || mode === 'xy') {
      document.getElementById('curX1').textContent = formatEng(x1t, 's');
      document.getElementById('curX2').textContent = formatEng(x2t, 's');
      document.getElementById('curDX').textContent = formatEng(dxt, 's');
      document.getElementById('curFreq').textContent = dxt > 0 ? formatEng(1 / dxt, 'Hz') : '---';
    } else {
      ['curX1', 'curX2', 'curDX', 'curFreq'].forEach(id => document.getElementById(id).textContent = '---');
    }

    const ch = state.channels[state.cursors.source];
    const vScale = currentVScale(state.cursors.source);
    const y1v = ((0.5 - state.cursors.y1) * 8 - ch.offset) * vScale;
    const y2v = ((0.5 - state.cursors.y2) * 8 - ch.offset) * vScale;
    const dyv = Math.abs(y2v - y1v);

    if (mode === 'y' || mode === 'xy') {
      document.getElementById('curY1').textContent = formatEng(y1v, 'V');
      document.getElementById('curY2').textContent = formatEng(y2v, 'V');
      document.getElementById('curDY').textContent = formatEng(dyv, 'V');
    } else {
      ['curY1', 'curY2', 'curDY'].forEach(id => document.getElementById(id).textContent = '---');
    }
  }

  // ============================================================
  // REAL RADIX-2 FFT SPECTRUM RENDERER
  // ============================================================
  function drawFFT() {
    const dpr = window.devicePixelRatio || 1;
    const w = fftCanvas.width / dpr;
    const h = fftCanvas.height / dpr;
    if (w < 20 || h < 20) return;

    fftCtx.fillStyle = '#111215';
    fftCtx.fillRect(0, 0, w, h);

    // Spectrum Grid
    fftCtx.strokeStyle = 'rgba(110, 114, 128, 0.22)';
    fftCtx.lineWidth = 1;
    fftCtx.beginPath();
    for (let i = 1; i < 10; i++) {
      const x = Math.round((w * i) / 10) + 0.5;
      fftCtx.moveTo(x, 0); fftCtx.lineTo(x, h);
    }
    for (let j = 1; j < 4; j++) {
      const y = Math.round((h * j) / 4) + 0.5;
      fftCtx.moveTo(0, y); fftCtx.lineTo(w, y);
    }
    fftCtx.stroke();

    const samples = state.waveforms[state.math.fftSrc];
    if (!samples || samples.length < 32) {
      fftCtx.fillStyle = '#5c5f68';
      fftCtx.font = '11px "JetBrains Mono", monospace';
      fftCtx.fillText('NO ACQUIRED DATA — CONNECT INSTRUMENT TO COMPUTE FFT', 12, h / 2 + 4);
      return;
    }

    // Power-of-2 FFT size
    let N = 1;
    while (N * 2 <= samples.length && N < 2048) N *= 2;
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    const winType = state.math.fftWindow;

    for (let i = 0; i < N; i++) {
      let win = 1;
      if (winType === 'hann') win = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
      else if (winType === 'hamming') win = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
      else if (winType === 'blackman') win = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (N - 1));
      re[i] = samples[i] * win;
    }

    radix2FFT(re, im);

    const half = N / 2;
    const mags = new Float64Array(half);
    let maxMag = 1e-6;
    for (let k = 0; k < half; k++) {
      const m = (2 * Math.hypot(re[k], im[k])) / N;
      mags[k] = m;
      if (m > maxMag) maxMag = m;
    }

    fftCtx.strokeStyle = CH_COLORS.M;
    fftCtx.lineWidth = 1.3;
    fftCtx.beginPath();
    for (let k = 0; k < half; k++) {
      const x = (k / (half - 1)) * w;
      let norm = 0;
      if (state.math.fftUnit === 'dbv') {
        const db = 20 * Math.log10(Math.max(mags[k], 1e-5));
        norm = clamp((db + 80) / 100, 0, 1);
      } else {
        norm = clamp(mags[k] / maxMag, 0, 1);
      }
      const y = h - 6 - norm * (h - 14);
      if (k === 0) fftCtx.moveTo(x, y);
      else fftCtx.lineTo(x, y);
    }
    fftCtx.stroke();
  }

  function radix2FFT(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wlenRe = Math.cos(ang);
      const wlenIm = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let wRe = 1, wIm = 0;
        for (let j = 0; j < len / 2; j++) {
          const uRe = re[i + j], uIm = im[i + j];
          const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
          const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
          re[i + j] = uRe + vRe;
          im[i + j] = uIm + vIm;
          re[i + j + len / 2] = uRe - vRe;
          im[i + j + len / 2] = uIm - vIm;
          const nextWRe = wRe * wlenRe - wIm * wlenIm;
          wIm = wRe * wlenIm + wIm * wlenRe;
          wRe = nextWRe;
        }
      }
    }
  }

  // ============================================================
  // FILE EXPORT & SETUP SAVE / RECALL
  // ============================================================
  async function exportPng() {
    const dataUrl = scopeCanvas.toDataURL('image/png');
    const name = `tenma8737_capture_${Date.now()}.png`;
    if (window.electronAPI && window.electronAPI.saveImage) {
      const res = await window.electronAPI.saveImage(dataUrl, name);
      if (res && res.success) logScpi('SYS', `Saved PNG capture: ${res.filePath}`);
    }
  }

  async function exportCsv() {
    const activeChannels = [1, 2, 3, 4].filter(c => state.waveforms[c] && state.waveforms[c].length > 0);
    if (activeChannels.length === 0) {
      logScpi('ERR', 'No acquired waveform data available to export.');
      return;
    }
    const maxLen = Math.max(...activeChannels.map(c => state.waveforms[c].length));
    const dt = (currentTScale() * 10) / maxLen;
    let csv = `Time_s,${activeChannels.map(c => `CH${c}_V`).join(',')}\n`;
    for (let i = 0; i < maxLen; i++) {
      const t = (i * dt).toExponential(6);
      const vals = activeChannels.map(c => {
        const arr = state.waveforms[c];
        return i < arr.length ? arr[i].toFixed(6) : '';
      });
      csv += `${t},${vals.join(',')}\n`;
    }
    const name = `tenma8737_waveform_${Date.now()}.csv`;
    if (window.electronAPI && window.electronAPI.saveCSV) {
      const res = await window.electronAPI.saveCSV(csv, name);
      if (res && res.success) logScpi('SYS', `Exported CSV (${maxLen} samples): ${res.filePath}`);
    }
  }

  async function saveSetupFile() {
    const payload = JSON.stringify({
      instrument: 'Tenma 8737',
      channels: state.channels,
      horiz: state.horiz,
      trigger: state.trigger,
      acq: state.acq
    }, null, 2);

    if (window.electronAPI && window.electronAPI.saveSetup) {
      const res = await window.electronAPI.saveSetup(payload, 'tenma8737_setup.json');
      if (res && res.success) logScpi('SYS', `Setup saved: ${res.filePath}`);
    }
  }

  async function loadSetupFile() {
    if (window.electronAPI && window.electronAPI.loadSetup) {
      const res = await window.electronAPI.loadSetup();
      if (res && res.success && res.data) {
        try {
          const parsed = JSON.parse(res.data);
          if (parsed.channels) state.channels = parsed.channels;
          if (parsed.horiz) state.horiz = parsed.horiz;
          if (parsed.trigger) state.trigger = { ...state.trigger, ...parsed.trigger };
          if (parsed.acq) state.acq = { ...state.acq, ...parsed.acq };
          syncAllUI();
          drawScope();
          logScpi('SYS', `Setup recalled: ${res.filePath}`);
        } catch (err) {
          logScpi('ERR', `Invalid setup file: ${err.message}`);
        }
      }
    }
  }

  // ============================================================
  // UI SYNCHRONIZATION
  // ============================================================
  function syncAllUI() {
    syncConnectionUI();
    syncAcquisitionUI();
    syncVerticalUI();
    syncHorizontalUI();
    syncTriggerUI();
    syncChannelStrip();
    updateCursorReadouts();
  }

  function syncConnectionUI() {
    const led = document.getElementById('connLed');
    const lbl = document.getElementById('connLabel');
    const quickDisc = document.getElementById('btnDisconnectQuick');
    const modalDisc = document.getElementById('btnModalDisconnect');
    const banner = document.getElementById('offlineBanner');
    const statusText = document.getElementById('statusConnText');

    if (state.connected) {
      led.className = 'led online';
      lbl.textContent = state.portLabel;
      quickDisc.style.display = 'inline-flex';
      modalDisc.style.display = 'inline-flex';
      banner.classList.add('hidden');
      statusText.textContent = `Interface: ${state.portLabel}`;
    } else {
      led.className = 'led';
      lbl.textContent = 'OFFLINE';
      quickDisc.style.display = 'none';
      modalDisc.style.display = 'none';
      banner.classList.remove('hidden');
      document.getElementById('idnReadout').textContent = 'No Instrument Connected';
      statusText.textContent = 'Interface: Disconnected';
    }
  }

  function syncAcquisitionUI() {
    const btn = document.getElementById('btnRunStop');
    const lbl = document.getElementById('runStopLabel');
    const singleBtn = document.getElementById('btnSingle');
    const badge = document.getElementById('acqStateBadge');

    if (state.running) {
      btn.className = 'tb-btn run-active';
      lbl.textContent = 'STOP';
    } else {
      btn.className = 'tb-btn stop-active';
      lbl.textContent = 'RUN';
    }
    singleBtn.classList.toggle('armed', state.singleArmed);

    badge.textContent = state.trigger.status;
    badge.className = 'acq-badge';
    if (state.trigger.status === 'RUN' || state.trigger.status === "TRIG'D") badge.classList.add('run');
    else if (state.trigger.status === 'STOP') badge.classList.add('stop');
    else if (state.trigger.status === 'WAIT') badge.classList.add('wait');
  }

  function syncVerticalUI() {
    const chNum = state.activeChannel;
    const ch = state.channels[chNum];
    document.getElementById('vertHeaderSub').textContent = `CH${chNum}`;
    document.getElementById('vertHeaderSub').style.color = CH_COLORS[chNum];

    const enBtn = document.getElementById('btnChEnable');
    enBtn.textContent = ch.enabled ? 'ON' : 'OFF';
    enBtn.classList.toggle('on', ch.enabled);

    const invBtn = document.getElementById('btnChInvert');
    invBtn.classList.toggle('on', ch.invert);

    document.getElementById('valVScale').textContent = formatVoltsDiv(currentVScale(chNum));
    document.getElementById('rngVOffset').value = ch.offset;
    document.getElementById('valVOffset').textContent = `${ch.offset >= 0 ? '+' : ''}${ch.offset.toFixed(2)} div`;

    setSegmentedValue('segCoupling', ch.coupling);
    setSegmentedValue('segProbe', ch.probe);
    setSegmentedValue('segBwLimit', ch.bwLimit);
  }

  function syncHorizontalUI() {
    const tbText = formatTimeDiv(currentTScale());
    document.getElementById('valHScale').textContent = tbText;
    document.getElementById('hudTimebase').textContent = tbText;

    document.getElementById('rngHPos').value = state.horiz.posDiv;
    document.getElementById('valHPos').textContent = `${state.horiz.posDiv >= 0 ? '+' : ''}${state.horiz.posDiv.toFixed(2)} div`;
    document.getElementById('hudHPos').textContent = formatEng(state.horiz.posDiv * currentTScale(), 's');
    document.getElementById('hudFormat').textContent = state.horiz.format === 'YT' ? 'Y-T' : (state.horiz.format === 'XY' ? 'X-Y' : 'ROLL');
    document.getElementById('hudSampleRate').textContent = state.acq.sampleRate ? formatEng(state.acq.sampleRate, 'Sa/s') : '---';

    const md = state.acq.memDepth;
    document.getElementById('hudMemDepth').textContent = md >= 1e6 ? `${md / 1e6} Mpts` : `${md / 1e3} kpts`;
    setSegmentedValue('segHFormat', state.horiz.format);
  }

  function syncTriggerUI() {
    const t = state.trigger;
    document.getElementById('trigHeaderSub').textContent = t.type;
    document.getElementById('selTrigType').value = t.type;
    document.getElementById('selTrigSrc').value = t.source;
    document.getElementById('selTrigCoup').value = t.coupling;
    setSegmentedValue('segTrigSweep', t.sweep);
    setSegmentedValue('segTrigSlope', t.slope);

    document.getElementById('rngTrigLevel').value = clamp(t.level, -4, 4);
    document.getElementById('valTrigLevel').textContent = formatEng(t.level, 'V');
    document.getElementById('valHoldoff').textContent = formatHoldoff(HOLDOFF_STEPS[t.holdoffIdx]);

    const srcShort = t.source.replace('CHAN', 'CH');
    const slopeShort = t.slope === 'POS' ? 'Rising' : (t.slope === 'NEG' ? 'Falling' : 'Either');
    document.getElementById('hudTrigger').textContent = `${srcShort} ${slopeShort} ${formatEng(t.level, 'V')} [${t.sweep}]`;
  }

  function syncChannelStrip() {
    for (let chNum = 1; chNum <= 4; chNum++) {
      const ch = state.channels[chNum];
      const tile = document.querySelector(`#chStrip .ch-tile[data-ch="${chNum}"]`);
      if (!tile) continue;
      tile.classList.toggle('enabled', ch.enabled);
      tile.classList.toggle('selected', state.activeChannel === chNum);
      document.getElementById(`stripCh${chNum}Scale`).textContent = ch.enabled ? formatVoltsShort(currentVScale(chNum)) : 'OFF';
      document.getElementById(`stripCh${chNum}Info`).textContent = `${ch.coupling} · ${ch.probe}X${ch.invert ? ' · INV' : ''}`;
    }

    const mathTile = document.querySelector('#chStrip .ch-tile[data-ch="M"]');
    if (mathTile) {
      mathTile.classList.toggle('enabled', state.math.enabled);
      document.getElementById('stripMathInfo').textContent = state.math.enabled ? 'ON' : 'OFF';
      const opLabel = state.math.op === 'sub' ? 'CH1 - CH2' : (state.math.op === 'add' ? 'CH1 + CH2' : 'CH1 * CH2');
      document.getElementById('stripMathOp').textContent = opLabel;
    }
  }

  // ============================================================
  // SCPI LOGGING & LED HELPERS
  // ============================================================
  function logScpi(dir, msg) {
    const log = document.getElementById('scpiLog');
    if (!log) return;
    const now = new Date();
    const ts = now.toTimeString().slice(0, 8);
    const row = document.createElement('div');
    row.className = 'scpi-line';
    const dirClass = dir.toLowerCase();
    row.innerHTML = `<span class="scpi-ts">${ts}</span><span class="scpi-dir ${dirClass}">${dir.padEnd(3, ' ')}</span><span>${escapeHtml(msg)}</span>`;
    log.appendChild(row);
    while (log.children.length > 200) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }

  function flashLed(id, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add(cls);
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove(cls), 140);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
  }

  window.addEventListener('DOMContentLoaded', init);
})();
