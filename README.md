# Tenma 8737 Oscilloscope Control — ShiroFPV

Native Windows 11 desktop application for controlling Tenma 8737 and 72-87XX (Uni-Trend UTD2000 series) Digital Storage Oscilloscopes over wired USB-B (Virtual COM / SCPI and Direct USB).

Built in the matte-dark hardware design language of [shirofpv.com](https://shirofpv.com) with no simulation mode—direct hardware instrument control only.

---

## Installation (Windows 11)

- **Signed Setup Installer**: Run `TenmaScopeStudio-Setup-1.0.0.exe` from [GitHub Releases](https://github.com/ShiroFPV/Tenma-8737-Scope-Workbench/releases).
- **Portable Executable**: Extract `TenmaScopeStudio-Standalone-win64.zip` and launch `TenmaScopeStudio.exe`.
- **Certificate Trust**: Run `Trust-ShiroFPV-Certificate.bat` once on a new machine to register the `ShiroFPV Hardware Labs` Authenticode certificate in Windows Trusted Publishers.

---

## Instrument Features

- **Connectivity**:
  - Automatic Windows 11 COM port enumeration (`Get-PnpDevice` + `SERIALCOMM` registry) with manual port override and selectable baud rates (`9600` to `921600 bps`).
  - Direct USB (USBTMC / WinUSB) pairing fallback.
  - Built-in Windows Device Manager launcher and driver reference (`DRIVER_GUIDE.md`).

- **Vertical System (CH1 – CH4)**:
  - Independent channel enable and polarity invert.
  - Standard 1-2-5 Volts/Div scaling (`1 mV/div` to `10 V/div`), vertical offset slider + direct graticule flag dragging.
  - Coupling (`DC`, `AC`, `GND`), probe attenuation (`1X`, `10X`, `100X`, `1000X`), and `20 MHz` bandwidth limiter.

- **Horizontal System**:
  - Timebase scaling (`2 ns/div` to `50 s/div`), horizontal delay/position dragging, and `Y-T` / `X-Y` / `Roll` display modes.

- **Trigger System**:
  - Types (`Edge`, `Pulse Width`, `Video`, `Slope`), Sources (`CH1`–`CH4`, `EXT`, `AC Line`), Sweep (`Auto`, `Normal`, `Single`), Slope (`Rising`, `Falling`, `Either`), Coupling (`DC`, `AC`, `HF Rej`, `LF Rej`), Trigger Level with `50%` level button, and adjustable Holdoff.

- **Acquisition & Analysis**:
  - `RUN / STOP`, `SINGLE`, `AUTOSET`, `FORCE`, `CLEAR`, Acquisition modes (`Normal`, `Average`, `Peak`), Memory depth selector (`1k` to `10M`), Vector/Dot rendering, and adjustable graticule intensity.
  - 12 live hardware waveform measurements (`Vpp`, `Vmax`, `Vmin`, `Vavg`, `Vrms`, `Vamp`, `Freq`, `Period`, `Duty+`, `Duty-`, `Rise`, `Fall`).
  - Interactive draggable `X1/X2` and `Y1/Y2` measurement cursors (`ΔX`, `1/ΔX`, `ΔY`).
  - Math traces (`CH1 - CH2`, `CH1 + CH2`, `CH1 * CH2`) and Radix-2 FFT spectrum analyzer (`Hanning`, `Hamming`, `Blackman`, `Rectangular`; `dBV` / `Vrms`).
  - Live SCPI command terminal with command history, TX/RX activity indicators, and hardware quick commands.
  - Native Windows dialogs for PNG display capture, CSV waveform export, and JSON setup save/recall.
