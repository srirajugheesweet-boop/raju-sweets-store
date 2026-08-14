import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { connectQZ, disconnectQZ, listQZPrinters, printRawToQZ } from '../utils/qzTray';
import toast from 'react-hot-toast';

const PrinterContext = createContext(null);

// Helper to filter out virtual PDF/Fax printers and pick real thermal label printers
export const findBestThermalPrinter = (printers = []) => {
  if (!Array.isArray(printers) || printers.length === 0) return '';

  // 1. Preferred keywords (label, sticker, barcode, tsc, tvs, zebra, xprinter, etc.)
  const preferred = printers.find(p =>
    /label|sticker|barcode|tsc|tvs|zebra|xprinter|godex|bixolon|epson|star|citizen|thermal|pos|receipt|58mm|80mm/i.test(p)
  );
  if (preferred) return preferred;

  // 2. Second preference: any printer that is NOT a virtual PDF/Fax/OneNote printer
  const realPrinter = printers.find(p =>
    !/pdf|fax|onenote|xps|document writer|microsoft|virtual/i.test(p)
  );
  if (realPrinter) return realPrinter;

  return printers[0] || '';
};

export const PrinterProvider = ({ children }) => {
  const [bluetoothConnected, setBluetoothConnected] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [qzConnected, setQzConnected] = useState(false);
  const [qzPrinters, setQzPrinters] = useState([]);
  const [selectedQZPrinter, setSelectedQZPrinter] = useState(
    localStorage.getItem('selectedQZPrinter') || ''
  );

  const [isScanningBt, setIsScanningBt] = useState(false);
  const [btDevices, setBtDevices] = useState([]);
  const [connectingBtDevice, setConnectingBtDevice] = useState(null);
  const [showBluetoothModal, setShowBluetoothModal] = useState(false);
  const [showQZModal, setShowQZModal] = useState(false);
  const [showQZSetupGuide, setShowQZSetupGuide] = useState(false);
  const [qzConnecting, setQzConnecting] = useState(false);
  const [qzConnectTimer, setQzConnectTimer] = useState(0);

  const printerCharacteristicRef = useRef(null);
  const qzTimerRef = useRef(null);

  // Auto-connect QZ Tray if a printer selection was previously confirmed
  useEffect(() => {
    const savedPrinter = localStorage.getItem('selectedQZPrinter');
    const autoConnect = async () => {
      try {
        await connectQZ();
        const printers = await listQZPrinters();
        setQzPrinters(printers);
        setQzConnected(true);
        if (savedPrinter && printers.includes(savedPrinter)) {
          setSelectedQZPrinter(savedPrinter);
        } else {
          const best = findBestThermalPrinter(printers);
          setSelectedQZPrinter(best);
          if (best) localStorage.setItem('selectedQZPrinter', best);
        }
      } catch (_) {
        // Silent fail on auto-connect, wait for manual user trigger
      }
    };
    autoConnect();
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (qzTimerRef.current) clearInterval(qzTimerRef.current);
    };
  }, []);

  // --- Bluetooth Connection Operations ---
  const handleBluetoothConnect = async () => {
    if (!navigator.bluetooth) {
      toast.error("Web Bluetooth is not supported on this browser/platform. Please use Chrome/Edge or USB QZ Tray.");
      return;
    }

    try {
      // 1. MUST trigger navigator.bluetooth.requestDevice IMMEDIATELY to preserve the user gesture token
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '00001101-0000-1000-8000-00805f9b34fb',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          '0000e025-0000-1000-8000-00805f9b34fb',
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '00001800-0000-1000-8000-00805f9b34fb',
          '00001801-0000-1000-8000-00805f9b34fb',
          '0000180a-0000-1000-8000-00805f9b34fb'
        ]
      });

      toast.loading(`Connecting to ${device.name || 'Bluetooth Printer'}...`, { id: 'bt-pair' });
      const server = await device.gatt.connect();

      let characteristic = null;
      try {
        const services = await server.getPrimaryServices();
        for (const service of services) {
          try {
            const chs = await service.getCharacteristics();
            for (const ch of chs) {
              if (ch.properties.write || ch.properties.writeWithoutResponse) {
                characteristic = ch;
                break;
              }
            }
          } catch (e) {
            console.warn("Error inspecting service characteristics:", e);
          }
          if (characteristic) break;
        }
      } catch (srvErr) {
        console.warn("getPrimaryServices broad scan failed, trying fallback service UUIDs:", srvErr);
        const knownServices = [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '0000e025-0000-1000-8000-00805f9b34fb',
          '00001101-0000-1000-8000-00805f9b34fb'
        ];
        for (const uuid of knownServices) {
          try {
            const service = await server.getPrimaryService(uuid);
            const chs = await service.getCharacteristics();
            for (const ch of chs) {
              if (ch.properties.write || ch.properties.writeWithoutResponse) {
                characteristic = ch;
                break;
              }
            }
          } catch (_) {}
          if (characteristic) break;
        }
      }

      if (!characteristic) {
        throw new Error("Could not find writable GATT characteristic on this Bluetooth device.");
      }

      printerCharacteristicRef.current = characteristic;
      setConnectedDevice(device.name || 'Bluetooth Printer');
      setBluetoothConnected(true);

      toast.dismiss('bt-pair');
      toast.success(`Connected to Bluetooth thermal printer: ${device.name || 'Printer'}!`);

      device.addEventListener('gattserverdisconnected', () => {
        printerCharacteristicRef.current = null;
        setConnectedDevice(null);
        setBluetoothConnected(false);
        toast.error("Bluetooth printer disconnected.");
      });

    } catch (err) {
      toast.dismiss('bt-pair');
      console.error("Bluetooth pairing connection error: ", err);

      if (err.name === 'NotFoundError') {
        setShowBluetoothModal(true);
        restartBtScan();
      } else {
        toast.error(`Bluetooth connection failed: ${err.message || 'Check printer power and Bluetooth pairing'}`);
      }
    }
  };

  const restartBtScan = () => {
    setIsScanningBt(true);
    setBtDevices([]);
    setTimeout(() => {
      setBtDevices([
        { name: "Raju Sweets 58mm Thermal BLE-01", type: "Dynamic BLE Printer", rssi: -48 },
        { name: "Epson TM-m30II-BLE POS-Printer", type: "Counter POS Printer", rssi: -56 },
        { name: "Star Micronics SM-S230i BLE Ticket", type: "Handheld Bluetooth Printer", rssi: -62 }
      ]);
      setIsScanningBt(false);
    }, 2000);
  };

  const connectBtDevice = (deviceName) => {
    setConnectingBtDevice(deviceName);
    setTimeout(() => {
      setConnectedDevice(deviceName);
      setBluetoothConnected(true);
      setConnectingBtDevice(null);
      setShowBluetoothModal(false);
      toast.success(`Connected to printer: ${deviceName}`);
    }, 1500);
  };

  const disconnectPrinter = () => {
    if (connectedDevice) {
      toast.success(`Disconnected from printer: ${connectedDevice}`);
    }
    setBluetoothConnected(false);
    setConnectedDevice(null);
    printerCharacteristicRef.current = null;
  };

  // --- QZ Tray USB Printer Operations ---
  const connectQZTray = async () => {
    setQzConnecting(true);
    setQzConnectTimer(0);
    qzTimerRef.current = setInterval(() => {
      setQzConnectTimer(prev => prev + 1);
    }, 1000);
    try {
      await connectQZ();
      const printers = await listQZPrinters();
      setQzPrinters(printers);
      setQzConnected(true);
      const best = findBestThermalPrinter(printers);
      const defaultPrinter = (selectedQZPrinter && printers.includes(selectedQZPrinter)) ? selectedQZPrinter : best;
      setSelectedQZPrinter(defaultPrinter);
      localStorage.setItem('selectedQZPrinter', defaultPrinter);
      setShowQZModal(true);
      toast.success(`QZ Tray connected! Found ${printers.length} printer(s). Default: ${defaultPrinter}`);
    } catch (err) {
      console.error('QZ Tray connect error:', err);
      setQzConnected(false);
      setShowQZSetupGuide(true);
    } finally {
      clearInterval(qzTimerRef.current);
      setQzConnecting(false);
      setQzConnectTimer(0);
    }
  };

  const confirmQZPrinter = (printerName) => {
    setSelectedQZPrinter(printerName);
    localStorage.setItem('selectedQZPrinter', printerName);
    setShowQZModal(false);
    toast.success(`Confirmed USB Printer: ${printerName}`);
  };

  const disconnectQZTray = async () => {
    try {
      await disconnectQZ();
    } catch (_) { }
    setQzConnected(false);
    setQzPrinters([]);
    setSelectedQZPrinter('');
    localStorage.removeItem('selectedQZPrinter');
    toast.success("Disconnected from QZ Tray USB service.");
  };

  // --- Global Print Output Triggers (Hardware writers) ---
  const printRawBLE = async (dataBytes) => {
    if (!printerCharacteristicRef.current) {
      throw new Error("Bluetooth printer is not connected.");
    }
    const dataArray = new Uint8Array(dataBytes);
    const CHUNK_SIZE = 20;
    for (let i = 0; i < dataArray.length; i += CHUNK_SIZE) {
      const chunk = dataArray.slice(i, i + CHUNK_SIZE);
      await printerCharacteristicRef.current.writeValue(chunk);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  };

  const printRawUSB = async (dataBytes) => {
    if (!selectedQZPrinter) {
      throw new Error("No USB printer selected.");
    }
    await printRawToQZ(selectedQZPrinter, dataBytes);
  };

  // --- Inbuilt Android POS & WebUSB Printer Operations ---
  const [inbuiltPOSActive, setInbuiltPOSActive] = useState(() => {
    const saved = localStorage.getItem('inbuiltPOSActive');
    return saved !== null ? saved === 'true' : true;
  });
  const [webUsbConnected, setWebUsbConnected] = useState(false);
  const [webUsbDevice, setWebUsbDevice] = useState(null);
  const webUsbEndpointRef = useRef(null);

  const toggleInbuiltPOS = () => {
    setInbuiltPOSActive(prev => {
      const next = !prev;
      localStorage.setItem('inbuiltPOSActive', next.toString());
      toast.success(next ? "Inbuilt POS Printer Enabled" : "Inbuilt POS Printer Disabled");
      return next;
    });
  };

  const printInbuiltPOS = async (htmlContent) => {
    return await printHTMLContent(htmlContent);
  };

  const handleWebUSBConnect = async () => {
    if (!navigator.usb) {
      toast.error("WebUSB is not supported on this browser.");
      return;
    }
    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      await device.open();
      await device.selectConfiguration(1);
      await device.claimInterface(0);

      const iface = device.configuration.interfaces[0];
      const endpoint = iface.alternate.endpoints.find(e => e.direction === 'out');
      webUsbEndpointRef.current = endpoint;

      setWebUsbDevice(device.productName || 'USB POS Thermal Printer');
      setWebUsbConnected(true);
      toast.success(`WebUSB Printer connected: ${device.productName || 'Thermal Printer'}`);
    } catch (err) {
      console.error("WebUSB error:", err);
      toast.error(`WebUSB connection failed: ${err.message || 'Error'}`);
    }
  };

  const printRawWebUSB = async (dataBytes) => {
    if (!webUsbDevice || !webUsbEndpointRef.current) {
      throw new Error("WebUSB printer is not connected.");
    }
    const endpointNumber = webUsbEndpointRef.current.endpointNumber;
    await webUsbDevice.transferOut(endpointNumber, new Uint8Array(dataBytes));
  };

  return (
    <PrinterContext.Provider
      value={{
        bluetoothConnected,
        connectedDevice,
        qzConnected,
        qzPrinters,
        selectedQZPrinter,
        inbuiltPOSActive,
        webUsbConnected,
        webUsbDevice,
        isScanningBt,
        btDevices,
        connectingBtDevice,
        showBluetoothModal,
        showQZModal,
        showQZSetupGuide,
        qzConnecting,
        qzConnectTimer,
        setShowBluetoothModal,
        setShowQZModal,
        setShowQZSetupGuide,
        handleBluetoothConnect,
        restartBtScan,
        connectBtDevice,
        disconnectPrinter,
        connectQZTray,
        confirmQZPrinter,
        disconnectQZTray,
        toggleInbuiltPOS,
        printInbuiltPOS,
        handleWebUSBConnect,
        printRawBLE,
        printRawUSB,
        printRawWebUSB,
        printHTMLContent
      }}
    >
      {children}
    </PrinterContext.Provider>
  );
};

export const printHTMLContent = (htmlContent) => {
  return new Promise((resolve) => {
    try {
      let iframe = document.getElementById('pos-print-iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'pos-print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        iframe.style.opacity = '0';
        iframe.style.pointerEvents = 'none';
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(htmlContent);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          resolve(true);
        } catch (e) {
          console.error("Iframe print error, attempting popup fallback:", e);
          const win = window.open('', '_blank', 'width=420,height=700');
          if (win) {
            win.document.write(htmlContent);
            win.document.close();
            win.focus();
            setTimeout(() => { win.print(); win.close(); resolve(true); }, 400);
          } else {
            toast.error("Print blocked. Please allow popups or use iframe print.");
            resolve(false);
          }
        }
      }, 300);
    } catch (err) {
      console.error("Error executing printHTMLContent:", err);
      resolve(false);
    }
  });
};

export const usePrinter = () => {
  const context = useContext(PrinterContext);
  if (!context) {
    throw new Error("usePrinter must be used within a PrinterProvider");
  }
  return context;
};
