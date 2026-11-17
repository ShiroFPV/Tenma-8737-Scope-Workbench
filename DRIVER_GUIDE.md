# Tenma 8737 & 72-87XX DSO Hardware & Driver Guide
> Comprehensive guide for connecting and controlling Tenma & Uni-Trend Digital Storage Oscilloscopes over wired USB on Windows 11.

---

## 🔍 1. Direct USB vs. Virtual COM Port (Explained)

Benchtop oscilloscopes from manufacturers like Tenma and Uni-Trend use the rear/front **USB-B** port to communicate with a PC. Depending on the firmware and USB controller inside your unit, it will communicate in one of two modes:

### Mode A: USB Virtual COM Port (Serial) — ⭐ Recommended
* **How it works:** The oscilloscope presents itself to Windows as a standard serial device over USB.
* **In Windows:** Shows up under **Ports (COM & LPT)** as `USB Serial Device (COM3)` or `CH340 (COMx)`.
* **Why it's great:** Windows 11 has native built-in drivers (`usbser.sys`) for this mode. You simply select the COM port number from the dropdown in the application and click **Connect**.
* **Baud rate:** Default is usually **`115200`** (or `9600`).

### Mode B: Direct USB (USBTMC / Raw Bulk Transfer)
* **How it works:** The scope registers as a dedicated **USB Test and Measurement Class (USBTMC)** or raw USB vendor endpoint device. This is the protocol traditionally used by lab software suites (NI-VISA, LabVIEW, Keysight Connection Expert).
* **In Windows:** Shows up under **Universal Serial Bus devices** or **Test and Measurement Devices** (often with vendor ID `0x5656`, `0x4348`, or `0x0483`).
* **When to use it:** Use this mode if your scope does not create a virtual COM port. It allows direct packet communication over USB bulk endpoints using standard WinUSB or VISA drivers.

---

## 🖥️ 2. How to Check Your Scope in Windows Device Manager

1. Connect the **USB-B** cable from the back of the Tenma oscilloscope to your PC.
2. Turn the oscilloscope power **ON**.
3. Open Windows Device Manager:
   * Press `Win + X` $\rightarrow$ click **Device Manager** (or click the **"Open Device Manager"** button directly inside the app's Driver Guide modal).
4. Look under these three categories:

| Category in Device Manager | What You See | Meaning & Action |
| :--- | :--- | :--- |
| **Ports (COM & LPT)** | `USB Serial Device (COMx)` or `CH340 (COMx)` | **Ready to go!** Note the COM number (e.g. `COM3`), select it in the app's dropdown, and click Connect. |
| **Universal Serial Bus devices** | `USB Test and Measurement Device` or `Uni-Trend DSO` | **USBTMC Ready!** In the app, choose "Direct USB (USBTMC)" and click Pair USB. |
| **Other devices (⚠️ Yellow Mark)** | `Unknown USB Device`, `CH372`, `UTD`, or `USB-Serial` | **Driver needed.** Windows does not know which driver to assign. Follow Section 3 below. |

---

## 🛠️ 3. Universal 60-Second Driver Fix (Zadig / WinUSB)

If your scope shows up with a yellow exclamation mark ⚠️ under **Other devices**, you do not need slow, bloated manufacturer software discs. You can assign Microsoft's standard **WinUSB** driver in 60 seconds:

1. Download the free, open-source tool **Zadig** from [zadig.akeo.ie](https://zadig.akeo.ie/).
2. Plug your Tenma oscilloscope into the PC and turn it on.
3. Open **Zadig**:
   * Click **Options** in the top menu $\rightarrow$ check **List All Devices**.
   * In the main dropdown, select your oscilloscope (it will appear as `Tenma`, `Uni-Trend`, `UTD`, or `USB Test and Measurement`).
   * On the right-hand driver box, select **`WinUSB`**.
   * Click **`Replace Driver`** (or `Install Driver`).
4. Windows will now recognize the oscilloscope immediately with zero errors!

---

## 🧪 4. Can't Test Right Now? Use Hardware Simulator Mode!

If you are away from your test bench or don't have the physical scope connected:
1. Open the app and click **`CONNECT`**.
2. Select **`Built-in Hardware Simulator`** $\rightarrow$ click **`ACTIVATE`**.
3. The app simulates real hardware signals (ShiroFPV DSHOT motor telemetry, gyro SPI bus noise, calibration square waves, and sine waves).
4. You can test all 4 channel knobs, timebases, edge triggers, cursors, FFT spectrum, and CSV exports immediately.
