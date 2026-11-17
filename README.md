# ShiroFPV // Tenma 8737 & 72-87XX DSO Workbench
> Native Windows 11 Desktop Application for controlling Tenma & Uni-Trend Digital Storage Oscilloscopes over wired USB.

Crafted in the exact design language of **[shirofpv.com](https://shirofpv.com)**:
- **Palette**: Stealth dark lab theme (`#1b1c1f` base, `#202124` elevated, `#2f3035` subtle borders)
- **Typography**: Inter Tight for controls + JetBrains Mono for telemetry & measurements
- **Traces**: High-FPS phosphor CRT canvas with antialiased glow, 8x10 reticle, and ground/trigger pointers
- **Code Signed**: Signed with **ShiroFPV Hardware Labs** Authenticode certificate & RFC 3161 DigiCert timestamp

---

## ⚡ Quick Start (Windows 11)

### Option 1: Signed NSIS Setup Installer
Run **`TenmaScopeStudio-Setup-1.0.0.exe`** from the [GitHub Releases](https://github.com/ShiroFPV/Tenma-8737-Scope-Workbench/releases) or the `dist/` directory.
It installs the application, creates Start Menu and Desktop shortcuts, and sets up the uninstaller.

### Option 2: Portable Standalone Executable
Directly launch **`TenmaScopeStudio.exe`** inside `dist/win-unpacked/` or extract `TenmaScopeStudio-Standalone-win64.zip`.

---

## 🛡️ Code Signing & Windows SmartScreen

The binaries and installer are digitally signed with the **ShiroFPV Hardware Labs** Authenticode certificate:
- **Signer**: `CN=ShiroFPV Hardware Labs, O=ShiroFPV, C=CH`
- **Timestamp Server**: DigiCert SHA256 RFC 3161

### 1-Click Trust Setup
If Windows Defender SmartScreen shows a prompt on a fresh PC:
1. Double-click **`Trust-ShiroFPV-Certificate.bat`** (or import `shirofpv-cert.cer`).
2. This installs the ShiroFPV certificate into your Windows **Trusted Publishers** store.
3. The installer and executable will now display **Verified Publisher: ShiroFPV Hardware Labs** with no unknown software warnings.

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
