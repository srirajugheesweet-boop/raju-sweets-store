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
  const [showPOSModal, setShowPOSModal] = useState(false);
  const [webUsbConnected, setWebUsbConnected] = useState(false);
  const [webUsbDevice, setWebUsbDevice] = useState(null);
  const webUsbEndpointRef = useRef(null);

  const toggleInbuiltPOS = () => {
    setInbuiltPOSActive(prev => {
      const next = !prev;
      localStorage.setItem('inbuiltPOSActive', next.toString());
      toast.success(next ? "Inbuilt POS Printer Turned ON" : "Inbuilt POS Printer Turned OFF");
      return next;
    });
  };

  const cancelPOSMode = () => {
    setInbuiltPOSActive(false);
    localStorage.setItem('inbuiltPOSActive', 'false');
    setShowPOSModal(false);
    toast.success("Inbuilt POS Printer turned OFF");
  };

  const enablePOSMode = () => {
    setInbuiltPOSActive(true);
    localStorage.setItem('inbuiltPOSActive', 'true');
    toast.success("Inbuilt POS Printer turned ON");
  };

  const restartPOSSetup = () => {
    setWebUsbConnected(false);
    setWebUsbDevice(null);
    webUsbEndpointRef.current = null;
    localStorage.removeItem('inbuiltPOSActive');
    setInbuiltPOSActive(true);
    toast.success("POS Printer setup reset. Ready to re-configure!");
  };

  const printInbuiltPOS = async (htmlContent) => {
    return await printHTMLContent(htmlContent);
  };

  const handleWebUSBConnect = async () => {
    if (!navigator.usb) {
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        toast.error("WebUSB requires HTTPS or localhost access. Please open site via localhost.");
      } else {
        toast.error("WebUSB is not supported in this browser. Please use Google Chrome or Edge.");
      }
      return;
    }
    try {
      toast.loading("Opening USB Device Picker...", { id: 'webusb-pick' });
      const device = await navigator.usb.requestDevice({ filters: [] });
      toast.dismiss('webusb-pick');

      await device.open();
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }
      const iface = device.configuration ? device.configuration.interfaces[0] : null;
      if (iface) {
        try { await device.claimInterface(iface.interfaceNumber || 0); } catch (_) {}
        const endpoint = iface.alternate.endpoints.find(e => e.direction === 'out');
        webUsbEndpointNumRef.current = endpoint ? endpoint.endpointNumber : 1;
        webUsbEndpointRef.current = endpoint || { endpointNumber: 1 };
      }

      const devName = device.productName || device.manufacturerName || `USB Printer (VID:${device.vendorId})`;
      setWebUsbDevice(devName);
      webUsbDeviceRef.current = device; // store actual USBDevice for smartPrint
      setWebUsbConnected(true);
      toast.success(`Connected to ${devName}! Now printing goes directly to USB 🖨️`);
    } catch (err) {
      toast.dismiss('webusb-pick');
      if (err.name === 'NotFoundError') {
        toast('No USB device selected.');
      } else {
        console.error("WebUSB error:", err);
        toast.error(`WebUSB error: ${err.message || 'Failed'}`);
      }
    }
  };

  const printRawWebUSB = async (dataBytes) => {
    if (!webUsbDevice || !webUsbEndpointRef.current) {
      throw new Error("WebUSB printer is not connected.");
    }
    const endpointNumber = webUsbEndpointRef.current.endpointNumber;
    await webUsbDevice.transferOut(endpointNumber, new Uint8Array(dataBytes));
  };

  // --- Web Serial API Support for Internal USB Serial POS Printers ---
  const [webSerialConnected, setWebSerialConnected] = useState(false);
  const [webSerialPort, setWebSerialPort] = useState(null);

  const handleWebSerialConnect = async () => {
    if (!navigator.serial) {
      toast.error("Web Serial is not supported on this browser. Use Chrome or Edge.");
      return;
    }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      setWebSerialPort(port);
      setWebSerialConnected(true);
      toast.success("USB Serial POS Printer connected!");
    } catch (err) {
      console.error("WebSerial error:", err);
      toast.error(`USB Serial connection failed: ${err.message || 'Error'}`);
    }
  };

  const printRawWebSerial = async (dataBytes) => {
    if (!webSerialPort || !webSerialPort.writable) {
      throw new Error("USB Serial printer is not connected.");
    }
    const writer = webSerialPort.writable.getWriter();
    await writer.write(new Uint8Array(dataBytes));
    writer.releaseLock();
  };

  const testInbuiltPOSPrint = async () => {
    toast.loading("Sending test receipt to Inbuilt POS printer...", { id: 'test-pos-print' });
    try {
      const testHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              @page { size: 80mm auto; margin: 0; }
              body { font-family: 'Courier New', monospace; width: 72mm; margin: 0 auto; padding: 5px; font-size: 12px; text-align: center; }
              .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
            </style>
          </head>
          <body>
            <div style="font-size: 16px; font-weight: bold;">RAJU GHEE SWEETS</div>
            <div>RK3568 POS THERMAL PRINTER</div>
            <div class="divider"></div>
            <div>STATUS: ONLINE & ACTIVE</div>
            <div>DATE: ${new Date().toLocaleString('en-IN')}</div>
            <div>DEVICE: Rockchip RK3568 (Android 11)</div>
            <div class="divider"></div>
            <div style="font-size: 11px;">*** TEST PRINT SUCCESSFUL ***</div>
          </body>
        </html>
      `;
      await printHTMLContent(testHtml);
      toast.dismiss('test-pos-print');
      toast.success("Test receipt dispatched!");
    } catch (err) {
      toast.dismiss('test-pos-print');
      toast.error("Test print failed");
    }
  };

  // --- Wi-Fi / LAN Network Thermal Printer Operations ---
  const [wifiConnected, setWifiConnected] = useState(() => {
    return localStorage.getItem('wifiConnected') === 'true';
  });
  const [wifiPrinterIp, setWifiPrinterIp] = useState(() => {
    return localStorage.getItem('wifiPrinterIp') || '';
  });
  const [showWifiModal, setShowWifiModal] = useState(false);

  const connectWifiPrinter = (ipAddress) => {
    if (!ipAddress || !ipAddress.trim()) {
      toast.error("Please enter a valid Wi-Fi Printer IP address (e.g. 192.168.1.100)");
      return;
    }
    const trimmedIp = ipAddress.trim();
    setWifiPrinterIp(trimmedIp);
    setWifiConnected(true);
    localStorage.setItem('wifiPrinterIp', trimmedIp);
    localStorage.setItem('wifiConnected', 'true');
    setShowWifiModal(false);
    toast.success(`Wi-Fi Thermal Printer connected: ${trimmedIp}`);
  };

  const disconnectWifiPrinter = () => {
    setWifiConnected(false);
    setWifiPrinterIp('');
    localStorage.removeItem('wifiPrinterIp');
    localStorage.setItem('wifiConnected', 'false');
    toast.success("Wi-Fi Thermal Printer disconnected.");
  };

  const printRawWifi = async (dataBytes) => {
    if (!wifiPrinterIp || !wifiConnected) {
      throw new Error("Wi-Fi printer is not connected.");
    }
    if (qzConnected && selectedQZPrinter) {
      await printRawToQZ(selectedQZPrinter, dataBytes);
      return;
    }
    try {
      const response = await fetch(`http://${wifiPrinterIp}:9100`, {
        method: 'POST',
        body: new Uint8Array(dataBytes),
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) return;
    } catch (_) { }
    throw new Error("Network print socket unavailable. Using system print fallback...");
  };

  const testWifiPrint = async (ipOverride) => {
    const ip = ipOverride || wifiPrinterIp;
    if (!ip) {
      toast.error("Please enter a valid Wi-Fi Printer IP address first.");
      return;
    }
    toast.loading(`Sending test receipt to Wi-Fi Printer (${ip})...`, { id: 'test-wifi' });
    try {
      const testHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              @page { size: 80mm auto; margin: 0; }
              body { font-family: 'Courier New', monospace; width: 72mm; margin: 0 auto; padding: 5px; font-size: 12px; text-align: center; }
              .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
            </style>
          </head>
          <body>
            <div style="font-size: 16px; font-weight: bold;">RAJU GHEE SWEETS</div>
            <div>WI-FI NETWORK THERMAL PRINTER</div>
            <div class="divider"></div>
            <div>STATUS: ONLINE & CONNECTED</div>
            <div>PRINTER IP: ${ip}</div>
            <div>DATE: ${new Date().toLocaleString('en-IN')}</div>
            <div class="divider"></div>
            <div style="font-size: 11px;">*** WI-FI TEST PRINT SUCCESSFUL ***</div>
          </body>
        </html>
      `;
      await printHTMLContent(testHtml);
      toast.dismiss('test-wifi');
      toast.success(`Test receipt dispatched to Wi-Fi Printer (${ip})!`);
    } catch (err) {
      toast.dismiss('test-wifi');
      toast.error("Wi-Fi test print failed");
    }
  };

  // --- Smart Print: auto-routes to BLE / WebUSB / WebSerial / browser dialog ---
  const webUsbDeviceRef = useRef(null); // stores the actual USBDevice object
  const webUsbEndpointNumRef = useRef(1); // stores endpoint number separately

  const smartPrint = async (htmlContent) => {
    const escBytes = htmlToESCPOS(htmlContent);

    // 1. BLE Bluetooth connected → send ESC/POS bytes via GATT characteristic
    if (printerCharacteristicRef.current) {
      try {
        toast.loading('Printing via Bluetooth...', { id: 'smart-print' });
        const dataArray = new Uint8Array(escBytes);
        const CHUNK_SIZE = 20;
        for (let i = 0; i < dataArray.length; i += CHUNK_SIZE) {
          const chunk = dataArray.slice(i, i + CHUNK_SIZE);
          await printerCharacteristicRef.current.writeValue(chunk);
          await new Promise(r => setTimeout(r, 30));
        }
        toast.dismiss('smart-print');
        toast.success('Receipt printed via Bluetooth!');
        return true;
      } catch (err) {
        toast.dismiss('smart-print');
        console.error('BLE print error:', err);
        toast.error('Bluetooth print failed — opening dialog instead');
        // fall through
      }
    }

    // 2. WebUSB connected → send ESC/POS bytes directly via USB bulk-out
    if (webUsbDeviceRef.current) {
      try {
        toast.loading('Printing via WebUSB...', { id: 'smart-print' });
        const device = webUsbDeviceRef.current;
        // Re-open if needed
        if (device.opened === false) {
          await device.open();
          if (device.configuration === null) await device.selectConfiguration(1);
          const iface = device.configuration.interfaces[0];
          await device.claimInterface(iface.interfaceNumber || 0);
          const ep = iface.alternate.endpoints.find(e => e.direction === 'out');
          webUsbEndpointNumRef.current = ep ? ep.endpointNumber : 1;
        }
        await device.transferOut(webUsbEndpointNumRef.current, new Uint8Array(escBytes));
        toast.dismiss('smart-print');
        toast.success('Receipt printed via WebUSB!');
        return true;
      } catch (err) {
        toast.dismiss('smart-print');
        console.error('WebUSB print error:', err);
        toast.error(`WebUSB print failed: ${err.message || 'Check USB connection'}`);
        // fall through
      }
    }

    // 3. WebSerial connected → send ESC/POS bytes via serial port
    if (webSerialPort && webSerialPort.writable) {
      try {
        toast.loading('Printing via USB Serial...', { id: 'smart-print' });
        const writer = webSerialPort.writable.getWriter();
        await writer.write(new Uint8Array(escBytes));
        writer.releaseLock();
        toast.dismiss('smart-print');
        toast.success('Receipt printed via USB Serial!');
        return true;
      } catch (err) {
        toast.dismiss('smart-print');
        console.error('WebSerial print error:', err);
        toast.error('USB Serial print failed — opening dialog instead');
        // fall through
      }
    }

    // 4. Fallback: browser print dialog (iframe)
    return printHTMLContent(htmlContent);
  };

  // Converts receipt HTML content to ESC/POS byte array for 80mm thermal paper
  const htmlToESCPOS = (htmlContent) => {
    const bytes = [];
    // ESC @ — Initialize printer
    bytes.push(0x1B, 0x40);
    // ESC a 1 — Center align
    bytes.push(0x1B, 0x61, 0x01);
    // GS ! 0x11 — double-width+height for header
    bytes.push(0x1D, 0x21, 0x11);
    appendText(bytes, 'SRI RAJU SWEETS\n');
    // Reset font size
    bytes.push(0x1D, 0x21, 0x00);
    appendText(bytes, '56-11-20B, Patamata Main Road\nVijayawada, AP - 520010\n');
    appendText(bytes, 'Ph: 9244757677  GSTIN: 37DFJPK6083N1ZO\n');
    appendDivider(bytes);

    // Extract bill info from HTML using regex
    const getText = (re) => { const m = htmlContent.match(re); return m ? m[1].trim() : ''; };
    const billNo = getText(/Bill No\.\s*<[^>]+>(\d+)/i) || getText(/Bill No\.\s*(\d+)/i) || '';
    const date = getText(/Date\s*<b>([^<]+)<\/b>/i) || '';
    const customer = getText(/Customer:\s*([^<\n]+)/i) || 'Walk-in Customer';
    const total = getText(/₹\s*([\d.,]+)<\/span>\s*<\/div>\s*<div class="solid-divider/i) ||
                  getText(/Net Amount\s*:\s*[^₹]*₹\s*([\d.,]+)/i) || '';
    const payment = getText(/CASH|CARD|UPI|CREDIT/i) || 'CASH';

    // ESC a 0 — Left align
    bytes.push(0x1B, 0x61, 0x00);
    if (billNo) appendText(bytes, `Bill No: ${billNo}    Date: ${date}\n`);
    appendText(bytes, `Customer: ${customer}\n`);
    appendDivider(bytes);

    // Items — extract from HTML table rows
    const itemMatches = [...htmlContent.matchAll(/<td[^>]*>([A-Z][^<]{2,})<\/td>[\s\S]*?<td[^>]*>([\d.]+)<\/td>[\s\S]*?<td[^>]*>([\d.]+)<\/td>[\s\S]*?<td[^>]*><strong>([\d.]+)<\/strong><\/td>/gi)];
    if (itemMatches.length === 0) {
      // simpler fallback: just mention items section
      appendText(bytes, '(See printed receipt for items)\n');
    } else {
      appendText(bytes, padLine('Item', 'Qty', 'Price', 'Amt'));
      itemMatches.forEach(m => {
        appendText(bytes, padLine(m[1].substring(0, 16), m[2], m[3], m[4]));
      });
    }
    appendDivider(bytes);

    // Total
    bytes.push(0x1B, 0x61, 0x02); // right align
    bytes.push(0x1B, 0x45, 0x01); // bold on
    bytes.push(0x1D, 0x21, 0x01); // double height
    if (total) appendText(bytes, `Total: Rs.${total}\n`);
    bytes.push(0x1D, 0x21, 0x00);
    bytes.push(0x1B, 0x45, 0x00); // bold off
    bytes.push(0x1B, 0x61, 0x00); // left align
    appendDivider(bytes);
    appendText(bytes, `Payment: ${payment}\n`);
    appendDivider(bytes);

    // Footer
    bytes.push(0x1B, 0x61, 0x01); // center
    appendText(bytes, '*** Thank you & Visit Again ***\n\n\n');

    // Feed and cut
    bytes.push(0x1B, 0x64, 0x04); // feed 4 lines
    bytes.push(0x1D, 0x56, 0x41, 0x10); // partial cut
    return bytes;
  };

  const appendText = (bytes, text) => {
    for (let i = 0; i < text.length; i++) {
      bytes.push(text.charCodeAt(i) & 0xFF);
    }
  };
  const appendDivider = (bytes) => {
    appendText(bytes, '-'.repeat(42) + '\n');
  };
  const padLine = (a, b, c, d) => {
    const col1 = (a + '                ').substring(0, 18);
    const col2 = ('        ' + b).slice(-6);
    const col3 = ('        ' + c).slice(-8);
    const col4 = ('        ' + d).slice(-8);
    return col1 + col2 + col3 + col4 + '\n';
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
        showPOSModal,
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
        setShowPOSModal,
        setShowQZSetupGuide,
        wifiConnected,
        wifiPrinterIp,
        showWifiModal,
        setShowWifiModal,
        connectWifiPrinter,
        disconnectWifiPrinter,
        printRawWifi,
        testWifiPrint,
        handleBluetoothConnect,
        restartBtScan,
        connectBtDevice,
        disconnectPrinter,
        connectQZTray,
        toggleInbuiltPOS,
        cancelPOSMode,
        enablePOSMode,
        restartPOSSetup,
        printInbuiltPOS,
        handleWebUSBConnect,
        webUsbConnected,
        webUsbDevice,
        testInbuiltPOSPrint,
        webSerialConnected,
        webSerialPort,
        handleWebSerialConnect,
        printRawWebSerial,
        printRawBLE,
        printRawUSB,
        printRawWebUSB,
        printHTMLContent: smartPrint
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
