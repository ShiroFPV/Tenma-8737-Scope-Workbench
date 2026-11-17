"""
ShiroFPV // Tenma 8737 & 72-87XX SCPI Oscilloscope Driver
Python Automation & Lab Verification API
"""

import time
import sys

class Tenma8737Scope:
    def __init__(self, resource_or_port=None):
        self.port = resource_or_port
        self.conn = None
        self.connected = False

    def connect(self):
        """Connects via PyVISA (USBTMC) or Serial COM port."""
        try:
            import pyvisa
            rm = pyvisa.ResourceManager()
            resources = rm.list_resources()
            scope_res = [r for r in resources if "USB" in r or "0x5656" in r or "0x4348" in r]
            target = self.port or (scope_res[0] if scope_res else None)
            if target:
                self.conn = rm.open_resource(target)
                self.connected = True
                print(f"[Tenma] Connected via VISA: {target}")
                return True
        except Exception:
            pass

        # Serial fallback
        try:
            import serial
            import serial.tools.list_ports
            ports = list(serial.tools.list_ports.comports())
            target_port = self.port or (ports[0].device if ports else None)
            if target_port:
                self.conn = serial.Serial(target_port, baudrate=115200, timeout=1.0)
                self.connected = True
                print(f"[Tenma] Connected via Serial: {target_port}")
                return True
        except Exception as e:
            print(f"[Tenma] Direct connection failed: {e}")

        print("[Tenma] Simulating Tenma 8737 Scope interface.")
        self.connected = True
        return True

    def write(self, cmd: str):
        """Send SCPI command."""
        print(f"[TX] {cmd}")
        if hasattr(self.conn, 'write'):
            if hasattr(self.conn, 'write_raw'):
                self.conn.write(cmd)
            else:
                self.conn.write((cmd + '\n').encode('utf-8'))

    def query(self, cmd: str) -> str:
        """Send SCPI query and return response string."""
        print(f"[TX?] {cmd}")
        if hasattr(self.conn, 'query'):
            return self.conn.query(cmd).strip()
        elif hasattr(self.conn, 'readline'):
            self.write(cmd)
            res = self.conn.readline().decode('utf-8', errors='ignore').strip()
            return res
        return "OK"

    def idn(self) -> str:
        """Get Instrument Identification."""
        return self.query("*IDN?")

    def run(self):
        self.write(":RUN")

    def stop(self):
        self.write(":STOP")

    def auto_set(self):
        self.write(":AUTOSet")

    def set_timebase(self, seconds_per_div: float):
        self.write(f":TIMebase:SCALe {seconds_per_div}")

    def set_channel(self, channel: int, volts_per_div: float, coupling: str = "DC"):
        self.write(f":CHANnel{channel}:SCALe {volts_per_div}")
        self.write(f":CHANnel{channel}:COUPling {coupling}")

    def set_trigger_edge(self, source: str = "CH1", level_volts: float = 0.5, slope: str = "RISING"):
        self.write(f":TRIGger:EDGe:SOURce {source}")
        self.write(f":TRIGger:EDGe:LEVel {level_volts}")
        self.write(f":TRIGger:EDGe:SLOPe {slope}")

    def measure_vpp(self, channel: int = 1) -> str:
        return self.query(f":MEASure:VOLTage:MAX? CHANnel{channel}")

    def measure_frequency(self, channel: int = 1) -> str:
        return self.query(f":MEASure:FREQuency? CHANnel{channel}")


if __name__ == "__main__":
    scope = Tenma8737Scope()
    scope.connect()
    print("IDN:", scope.idn())
    scope.auto_set()
    print("Vpp CH1:", scope.measure_vpp(1))
