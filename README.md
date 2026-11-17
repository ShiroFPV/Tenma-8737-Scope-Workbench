# ShiroFPV // Tenma 8737 & 72-87XX DSO Workbench
> Native Windows 11 Desktop Application for controlling Tenma & Uni-Trend Digital Storage Oscilloscopes over wired USB.

Crafted in the exact design language of **[shirofpv.com](https://shirofpv.com)**:
- **Palette**: Stealth dark lab theme (`#1b1c1f` base, `#202124` elevated, `#2f3035` subtle borders)
- **Typography**: Inter Tight for controls + JetBrains Mono for telemetry & measurements
- **Traces**: High-FPS phosphor CRT canvas with antialiased glow, 8x10 reticle, and ground/trigger pointers

---

## ⚡ Quick Start (Windows 11)

### 1. Launch the Desktop App
Either:
- Double-click **`Launch-TenmaScope.bat`** in this folder, or
- Run in your terminal:
  ```bash
  npm start
  ```

### 2. Connect Your Tenma Oscilloscope
1. Connect a standard **USB-B to USB-A (or USB-C)** cable from the oscilloscope's rear USB Device port to your Windows 11 PC.
2. Power on the oscilloscope.
3. In the application, click **`CONNECT`** (top right) or the status pill:
   - **Direct USB (USBTMC / Bulk)**: Direct raw USB endpoint control.
   - **USB Virtual COM Port**: For scopes enumerating as CDC ACM serial.
   - **Hardware Simulator**: Test all controls, DSHOT telemetry, gyro noise, FFT, and measurements without physical hardware attached.

---

## 🎛️ Features & Capabilities

- **Full Vertical Subsystem**:
  - Independent 4-Channel Control (CH1, CH2, CH3, CH4)
  - Volts/Div (2 mV/div to 10 V/div)
  - Vertical Position / Offset (-4 to +4 div)
  - AC / DC / GND Coupling
  - 1X / 10X / 100X / 1000X Probe Attenuation
  - 20 MHz Hardware Bandwidth Limiter

- **Horizontal Timebase**:
  - 2 ns/div to 5 s/div
  - Horizontal Delay / Position shift
  - Normal, Peak Detect, Averaging, and High-Resolution acquisition modes

- **Trigger Subsystem**:
  - Auto, Normal, and Single-Shot sweep modes
  - Rising ↗, Falling ↘, and Either ↕ Edge Triggers
  - Real-time Trigger Level slider with 1-click **50% Auto-Level**
  - Trigger coupling filters (DC, AC, HF Reject, LF Reject)

- **Automated Measurements**:
  - $V_{pp}$, $V_{rms}$, $V_{max}$, $V_{min}$, $V_{avg}$
  - Real-time Frequency & Period counter
  - Rise Time & Duty Cycle

- **FFT Spectrum Analyzer**:
  - Real-time Fast Fourier Transform
  - Hanning, Flattop, and Rectangular window functions
  - Dominant harmonic peak tracking

- **Interactive Cursors & Math**:
  - Dual time cursors ($X_1, X_2, \Delta T, 1/\Delta T$)
  - Math trace subtraction ($CH1 - CH2$) for differential signals

- **SCPI Terminal & Automation**:
  - Interactive live command console
  - Direct `:AUTOSet`, `:RUN`, `:STOP`, `:MEAS:*`, `*IDN?`, `*RST` support
  - Standalone Python API driver (`tenma_scope_api.py`) for automated test fixtures

- **Native Windows 11 Integration**:
  - One-click high-resolution PNG screenshot capture
  - Full CSV waveform data export with native Windows Save As dialogs
  - Frameless modern window with custom titlebar controls

---

## 🔌 Windows 11 Driver Notes
If your Tenma scope shows up as an "Unknown USB Device" in Device Manager:
1. Tenma bench scopes generally use standard **USBTMC (Test and Measurement Class)** or **USB-Serial**.
2. If you are using raw USB bulk access, you can use **[Zadig](https://zadig.akeo.ie/)** to assign the standard **WinUSB** driver to the Tenma device.
3. For Virtual COM port mode, Windows 11 automatically loads `usbser.sys`.
