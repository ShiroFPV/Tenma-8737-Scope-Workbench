using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

class TenmaBridge {
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct WINUSB_SETUP_PACKET {
        public byte RequestType;
        public byte Request;
        public ushort Value;
        public ushort Index;
        public ushort Length;
    }

    [DllImport("winusb.dll", SetLastError = true)]
    public static extern bool WinUsb_Initialize(SafeFileHandle DeviceHandle, out IntPtr InterfaceHandle);

    [DllImport("winusb.dll", SetLastError = true)]
    public static extern bool WinUsb_Free(IntPtr InterfaceHandle);

    [DllImport("winusb.dll", SetLastError = true)]
    public static extern bool WinUsb_ControlTransfer(IntPtr InterfaceHandle, WINUSB_SETUP_PACKET SetupPacket, byte[] Buffer, uint BufferLength, out uint LengthTransferred, IntPtr Overlapped);

    [DllImport("winusb.dll", SetLastError = true)]
    public static extern bool WinUsb_ReadPipe(IntPtr InterfaceHandle, byte PipeID, byte[] Buffer, uint BufferLength, out uint LengthTransferred, IntPtr Overlapped);

    [DllImport("winusb.dll", SetLastError = true)]
    public static extern bool WinUsb_SetPipePolicy(IntPtr InterfaceHandle, byte PipeID, uint PolicyType, uint ValueLength, byte[] Value);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern SafeFileHandle CreateFile(string lpFileName, uint dwDesiredAccess, uint dwShareMode, IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

    static void Main(string[] args) {
        string devPath = @"\\?\usb#vid_5656&pid_0834#6&3365fbaf&0&5#{fc89ef9f-fb0d-4cbb-9cbe-14d43a3db10b}";
        SafeFileHandle handle = CreateFile(devPath, 0xC0000000, 3, IntPtr.Zero, 3, 0x40000000, IntPtr.Zero);
        if (handle.IsInvalid) {
            Console.Error.WriteLine("ERR:OPEN_FAILED:" + Marshal.GetLastWin32Error());
            return;
        }

        IntPtr h;
        if (!WinUsb_Initialize(handle, out h)) {
            Console.Error.WriteLine("ERR:INIT_FAILED:" + Marshal.GetLastWin32Error());
            handle.Close();
            return;
        }

        WinUsb_SetPipePolicy(h, 0x82, 0x05, 1, new byte[] { 1 }); // AUTO_CLEAR_STALL
        WinUsb_SetPipePolicy(h, 0x82, 0x07, 1, new byte[] { 1 }); // ALLOW_PARTIAL_READS
        WinUsb_SetPipePolicy(h, 0x82, 0x03, 4, BitConverter.GetBytes((uint)200)); // 200ms timeout

        WINUSB_SETUP_PACKET pkt;
        uint transferred;

        Console.WriteLine("READY");
        while (true) {
            string line = Console.ReadLine();
            if (line == null || line == "quit") break;

            if (line.StartsWith("cmd:")) {
                ushort val = Convert.ToUInt16(line.Substring(4), 16);
                pkt = new WINUSB_SETUP_PACKET { RequestType = 0x40, Request = 0xb1, Value = val, Index = 0, Length = 0 };
                WinUsb_ControlTransfer(h, pkt, null, 0, out transferred, IntPtr.Zero);
                Console.WriteLine("OK:CMD");
            } else if (line == "sample") {
                // 1. Send GET_WAVE (0x06)
                pkt = new WINUSB_SETUP_PACKET { RequestType = 0x40, Request = 0xb1, Value = 0x06, Index = 0, Length = 0 };
                WinUsb_ControlTransfer(h, pkt, null, 0, out transferred, IntPtr.Zero);
                System.Threading.Thread.Sleep(15);

                // 2. Try bulk read directly
                byte[] wave = new byte[2560];
                bool ok = WinUsb_ReadPipe(h, 0x82, wave, (uint)wave.Length, out transferred, IntPtr.Zero);
                
                if (!ok || transferred == 0) {
                    // Try with 0xb0 arm
                    pkt = new WINUSB_SETUP_PACKET { RequestType = 0x40, Request = 0xb0, Value = 1, Index = 2, Length = 0 };
                    WinUsb_ControlTransfer(h, pkt, null, 0, out transferred, IntPtr.Zero);
                    System.Threading.Thread.Sleep(15);
                    ok = WinUsb_ReadPipe(h, 0x82, wave, (uint)wave.Length, out transferred, IntPtr.Zero);
                }

                if (ok && transferred > 0) {
                    Console.WriteLine("DATA:" + Convert.ToBase64String(wave, 0, (int)transferred));
                } else {
                    // Also check control transfer 0xb2 for 8 status / params bytes
                    byte[] ctrlBuf = new byte[64];
                    pkt = new WINUSB_SETUP_PACKET { RequestType = 0xc0, Request = 0xb2, Value = 0, Index = 0, Length = 64 };
                    if (WinUsb_ControlTransfer(h, pkt, ctrlBuf, 64, out transferred, IntPtr.Zero) && transferred > 0) {
                        Console.WriteLine("STATUS:" + Convert.ToBase64String(ctrlBuf, 0, (int)transferred));
                    } else {
                        Console.WriteLine("NODATA");
                    }
                }
            }
        }

        WinUsb_Free(h);
        handle.Close();
    }
}
