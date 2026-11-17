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

## 🛠️ 3. How to Fix: "WinUSB Turned My Scope into a USB Device, Not a COM Port"

### Why This Happened
If you used **Zadig** and selected **WinUSB**, Zadig installed `WinUSB.sys` instead of a serial COM driver (`usbser.sys`). 
* **WinUSB** is a raw USB bulk-transfer driver.
* When WinUSB is active, Windows **hides the device from "Ports (COM & LPT)"** and moves it under **"Universal Serial Bus devices"**.
* This is why it stopped appearing as a COM port!

---

### Step-by-Step: Restore Back to a COM Port (Under 30 Seconds)

You do **not** need to download anything. Windows 11 already has the correct serial driver built in.

#### Option 1: Switch Driver in Device Manager (Instant)
1. Open **Device Manager** (`Win + X` → **Device Manager**, or click **Open Device Manager** in this app).
2. Look under **Universal Serial Bus devices** (or **USB Devices**).
3. Find your oscilloscope or the device you replaced with WinUSB (e.g. `USB Serial Device`, `WinUSB Device`, `STM32`, `Tenma`).
4. **Right-click** it → select **Update driver**.
5. Click **"Browse my computer for drivers"**.
6. Click **"Let me pick from a list of available drivers on my computer"**.
7. In the list, look for:
   * **`USB Serial Device`** (Standard Microsoft CDC driver — ⭐ Pick this!)
   * Or **`STMicroelectronics Virtual COM Port`**
   * Or **`CH340 / CH341 USB to Serial`**
8. Select it and click **Next**.
9. The device will **immediately move back to "Ports (COM & LPT)"** with a COM port number (e.g. `COM3`).
10. In Tenma Scope Studio, click **↻ Refresh Ports**, select your COM port, and click **CONNECT**.

#### Option 2: Remove the WinUSB Driver Override
If "USB Serial Device" does not show up in the list:
1. In Device Manager, right-click the device under **Universal Serial Bus devices**.
2. Select **Uninstall device**.
3. ⚠️ **CRITICAL:** Check the box: **"Attempt to remove the driver for this device"** (or *"Delete the driver software for this device"*). This deletes Zadig's WinUSB file.
4. Click **Uninstall**.
5. Unplug the USB cable from your PC, wait 3 seconds, and plug it back in.
6. Windows 11 will automatically re-detect the hardware and assign the default **`usbser.sys`** serial driver under **Ports (COM & LPT)**.

---

## 📦 4. Which Driver Does Your Oscilloscope Actually Need?

Depending on the internal microcontroller / USB bridge chip used in your Tenma / Uni-T model:

| Internal Chip / Hardware ID | Driver Name | How to Get It |
| :--- | :--- | :--- |
| **Standard CDC-ACM** (`VID_0483&PID_5740` or similar) | **Microsoft USB Serial Device (`usbser.sys`)** | Built into Windows 11 automatically (no download needed). |
| **STMicroelectronics STM32 VCP** | **STSW-STM32102 Virtual COM Port Driver** | Download from [st.com](https://www.st.com/en/development-tools/stsw-stm32102.html) or use Microsoft `usbser.sys`. |
| **WCH QinHeng CH340 / CH341** (`VID_1A86&PID_7523`) | **CH341SER Driver** | Standard WCH serial driver from [wch.cn](https://www.wch-ic.com/downloads/CH341SER_EXE.html). |
| **Silicon Labs CP2102 / CP2104** (`VID_10C4&PID_EA60`) | **CP210x Universal Windows Driver** | From Silicon Labs. |
| **Uni-Trend UTD Legacy** (`VID_4348&PID_5537` / `CH372`) | **Uni-T USBDRV / CH372 Driver** | Included on the original Uni-T / Tenma utility disc. |

### How to Find Your Exact Hardware ID (10 Seconds)
1. In Device Manager, right-click the device → click **Properties**.
2. Go to the **Details** tab.
3. In the Property dropdown, select **Hardware Ids**.
4. You will see something like `USB\VID_0483&PID_5740` or `USB\VID_1A86&PID_7523`. The 4 characters after `VID_` and `PID_` tell you the exact chip inside.

---

## 🧪 5. Can't Test Right Now? Use Hardware Simulator Mode!

If you are away from your test bench or don't have the physical scope connected:
1. Open the app and click **`CONNECT`**.
2. Select **`Built-in Hardware Simulator`** $\rightarrow$ click **`ACTIVATE`**.
3. The app simulates real hardware signals (ShiroFPV DSHOT motor telemetry, gyro SPI bus noise, calibration square waves, and sine waves).
4. You can test all 4 channel knobs, timebases, edge triggers, cursors, FFT spectrum, and CSV exports immediately.
