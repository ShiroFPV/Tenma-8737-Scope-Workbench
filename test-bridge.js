const { spawn } = require('child_process');

const csCode = `
using System;
using System.IO.Ports;
using System.Threading;

class SerialBridge {
    static SerialPort sp;
    static bool running = true;

    static void Main(string[] args) {
        if (args.Length < 1) {
            Console.WriteLine("OPEN_ERR: Missing port");
            return;
        }
        string port = args[0];
        int baud = args.Length > 1 ? int.Parse(args[1]) : 115200;

        try {
            sp = new SerialPort(port, baud, Parity.None, 8, StopBits.One);
            sp.ReadTimeout = 500;
            sp.WriteTimeout = 500;
            sp.DtrEnable = true;
            sp.RtsEnable = true;
            sp.Open();
            Console.WriteLine("OPEN_OK");
        } catch (Exception ex) {
            Console.WriteLine("OPEN_ERR: " + ex.Message);
            return;
        }

        // Background reader thread: constantly reads serial bytes and flushes to STDOUT
        Thread readerThread = new Thread(() => {
            byte[] buf = new byte[4096];
            while (running && sp.IsOpen) {
                try {
                    int n = sp.Read(buf, 0, buf.Length);
                    if (n > 0) {
                        string s = System.Text.Encoding.UTF8.GetString(buf, 0, n);
                        Console.Write("RX:" + s + "\\n");
                    }
                } catch (TimeoutException) {
                } catch {
                    break;
                }
            }
        });
        readerThread.IsBackground = true;
        readerThread.Start();

        // Main thread: reads commands from stdin and writes to serial port
        string line;
        while (running && (line = Console.ReadLine()) != null) {
            if (line == "QUIT") break;
            try {
                sp.WriteLine(line);
            } catch (Exception ex) {
                Console.WriteLine("TX_ERR: " + ex.Message);
            }
        }

        running = false;
        try { sp.Close(); } catch {}
    }
}
`;

console.log("C# code ready.");
