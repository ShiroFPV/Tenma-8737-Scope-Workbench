# Tenma 8737 / 72-87XX USB & COM Driver Reference

Technical reference for configuring Windows 11 USB and Virtual COM drivers for Tenma 8737 / 72-87XX (Uni-Trend UTD2000 series) oscilloscopes.

---

## 1. Interface Modes

### Virtual COM Port (Serial over USB)
- Enumerates under **Ports (COM & LPT)** in Windows Device Manager (e.g., `USB Serial Device (COM3)`).
- Uses Microsoft's built-in CDC-ACM serial driver (`usbser.sys`) or a bridge-specific VCP driver (STM32, WCH CH340, Silicon Labs CP210x, FTDI).
- Default communication framing: `115200 bps, 8-N-1`.

### Direct USB (USBTMC / WinUSB)
- Enumerates under **Universal Serial Bus devices** or **USB Test and Measurement Devices**.
- Communicates directly over raw USB bulk IN/OUT endpoints without creating a COM port.

---

## 2. Restoring a WinUSB Device Back to a COM Port

`WinUSB.sys` is a raw USB bulk-transfer driver and does not create a Virtual COM port. If WinUSB was installed (for example via Zadig), Windows moves the oscilloscope out of **Ports (COM & LPT)** and into **Universal Serial Bus devices**.

### Method A: Reassign Driver in Device Manager
1. Open **Device Manager** (`Win + X` -> **Device Manager**).
2. Expand **Universal Serial Bus devices** and locate the oscilloscope.
3. Right-click the device -> **Update driver** -> **Browse my computer for drivers**.
4. Select **Let me pick from a list of available drivers on my computer**.
5. Choose **USB Serial Device** (`usbser.sys`) and click **Next**.
6. The oscilloscope will immediately move back under **Ports (COM & LPT)** with an assigned `COM` number.

### Method B: Remove WinUSB Driver Override
1. In Device Manager, right-click the device under **Universal Serial Bus devices**.
2. Click **Uninstall device**.
3. Check **Attempt to remove the driver for this device** (or *Delete the driver software for this device*) and click **Uninstall**.
4. Unplug the USB-B cable, wait 3 seconds, and reconnect it. Windows 11 will automatically bind the native serial driver.

---

## 3. Driver Mapping by Hardware ID

To inspect the exact Hardware ID: **Device Manager** -> Right-click device -> **Properties** -> **Details** tab -> **Hardware Ids**.

| Hardware ID | Internal USB Bridge | Windows 11 Driver |
| :--- | :--- | :--- |
| `VID_0483&PID_5740` | STMicroelectronics STM32 CDC | Built-in `usbser.sys` or STSW-STM32102 |
| `VID_1A86&PID_7523` | WCH QinHeng CH340 / CH341 | WCH `CH341SER.EXE` |
| `VID_10C4&PID_EA60` | Silicon Labs CP2102 / CP2104 | Silicon Labs CP210x Universal Windows Driver |
| `VID_0403&PID_6001` | FTDI FT232R | FTDI VCP Driver |
| `VID_4348&PID_5537` | WCH CH372 / Legacy Uni-T | Uni-Trend `USBDRV` / Direct USB |
