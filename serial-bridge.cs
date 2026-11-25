using System;
using System.IO;
using System.IO.Ports;
using System.Text;
using System.Threading;

class SerialBridge {
    static SerialPort sp;
    static volatile bool running = true;

    static void Main(string[] args) {
        Console.OutputEncoding = Encoding.UTF8;
        Console.InputEncoding = Encoding.UTF8;

        if (args.Length < 1) {
            Console.WriteLine("OPEN_ERR:Missing COM port argument");
            return;
        }

        string port = args[0];
        int baud = 115200;
        if (args.Length > 1 && !int.TryParse(args[1], out baud)) {
            baud = 115200;
        }

        try {
            sp = new SerialPort(port, baud, Parity.None, 8, StopBits.One);
            sp.ReadTimeout = 200;
            sp.WriteTimeout = 500;
            sp.DtrEnable = true;
            sp.RtsEnable = true;
            sp.Open();
            Console.WriteLine("OPEN_OK:" + port);
            Console.Out.Flush();
        } catch (Exception ex) {
            Console.WriteLine("OPEN_ERR:" + ex.Message);
            Console.Out.Flush();
            return;
        }

        // Dedicated background thread: reads raw bytes from serial port and outputs as Base64 packets
        Thread rxThread = new Thread(() => {
            byte[] buffer = new byte[8192];
            while (running && sp != null && sp.IsOpen) {
                try {
                    int bytesToRead = sp.BytesToRead;
                    if (bytesToRead > 0) {
                        int count = sp.Read(buffer, 0, Math.Min(bytesToRead, buffer.Length));
                        if (count > 0) {
                            string b64 = Convert.ToBase64String(buffer, 0, count);
                            Console.WriteLine("B64:" + b64);
                            Console.Out.Flush();
                        }
                    } else {
                        Thread.Sleep(10);
                    }
                } catch (TimeoutException) {
                } catch (Exception) {
                    if (!running) break;
                    Thread.Sleep(25);
                }
            }
        });
        rxThread.IsBackground = true;
        rxThread.Start();

        // Main thread: reads commands from stdin and transmits to serial port
        try {
            string line;
            while (running && (line = Console.ReadLine()) != null) {
                line = line.Trim();
                if (line == "QUIT" || line == "EXIT") {
                    break;
                }
                if (string.IsNullOrEmpty(line)) continue;

                try {
                    sp.Write(line + "\r\n");
                } catch (Exception ex) {
                    Console.WriteLine("TX_ERR:" + ex.Message);
                    Console.Out.Flush();
                }
            }
        } catch (Exception) {
        } finally {
            running = false;
            try {
                if (sp != null && sp.IsOpen) {
                    sp.Close();
                }
            } catch {}
            Console.WriteLine("CLOSED");
            Console.Out.Flush();
        }
    }
}
