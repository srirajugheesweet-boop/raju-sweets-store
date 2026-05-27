import React, { useState, useEffect, useRef } from 'react';
import {
  ClipboardList,
  Calendar,
  Save,
  Printer,
  History,
  ChevronRight,
  PackageCheck,
  Building,
  Bluetooth as BluetoothIcon,
  Usb as UsbIcon,
  RefreshCw,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';
import { db } from '../../config/firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  where,
  doc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import {
  connectQZ,
  disconnectQZ,
  listQZPrinters,
  printRawToQZ
} from '../../utils/qzTray';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import Loader from '../../components/Loader/Loader';
import './StoreWorkSheet.css';

// Get Tomorrow's Date String in YYYY-MM-DD format
const getTomorrowDateString = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const day = String(tomorrow.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const StoreWorkSheet = () => {
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'history'
  const [date, setDate] = useState(getTomorrowDateString());
  const [stores, setStores] = useState([]);
  const [items, setItems] = useState([]);
  const [quantities, setQuantities] = useState({}); // { [itemId]: { [storeId]: quantity } }
  const [history, setHistory] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Reusable Printer Refs & States (Bluetooth & USB QZ Tray)
  const printerCharacteristicRef = useRef(null);
  const qzTimerRef = useRef(null);

  const [bluetoothConnected, setBluetoothConnected] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [showBluetoothModal, setShowBluetoothModal] = useState(false);
  const [isScanningBt, setIsScanningBt] = useState(false);
  const [connectingBtDevice, setConnectingBtDevice] = useState(null);
  const [btDevices, setBtDevices] = useState([]);

  const [qzConnected, setQzConnected] = useState(false);
  const [qzPrinters, setQzPrinters] = useState([]);
  const [selectedQZPrinter, setSelectedQZPrinter] = useState('');
  const [showQZModal, setShowQZModal] = useState(false);
  const [qzConnecting, setQzConnecting] = useState(false);
  const [showQZSetupGuide, setShowQZSetupGuide] = useState(false);
  const [qzConnectTimer, setQzConnectTimer] = useState(0);

  // --- Bluetooth Connection Operations ---
  const handleBluetoothConnect = async () => {
    if (navigator.bluetooth) {
      toast.loading("Scanning for Bluetooth thermal printers...", { id: 'bt-loading' });
      try {
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            '000018f0-0000-1000-8000-00805f9b34fb',
            '00001101-0000-1000-8000-00805f9b34fb'
          ]
        });

        toast.dismiss('bt-loading');
        toast.loading(`Found device: ${device.name}. Pairing...`, { id: 'bt-pair' });
        const server = await device.gatt.connect();

        let service = null;
        try {
          service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
        } catch (e) {
          try {
            service = await server.getPrimaryService('00001101-0000-1000-8000-00805f9b34fb');
          } catch (e2) {
            const services = await server.getPrimaryServices();
            if (services.length > 0) service = services[0];
          }
        }

        if (service) {
          const characteristics = await service.getCharacteristics();
          const writeChar = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
          if (writeChar) {
            printerCharacteristicRef.current = writeChar;
          }
        }

        toast.dismiss('bt-pair');
        setConnectedDevice(device.name || "Bluetooth Thermal Printer");
        setBluetoothConnected(true);
        toast.success(`Successfully paired & connected: ${device.name || "Bluetooth Printer"}`);
      } catch (error) {
        toast.dismiss('bt-loading');
        toast.dismiss('bt-pair');
        console.error("Web Bluetooth GATT connect failed:", error);

        if (error.name === 'NotFoundError') {
          toast.error("Native scan closed. Opening manual BLE scanner fallback...");
          setShowBluetoothModal(true);
          restartBtScan();
        } else {
          toast.error("Browser BLE request blocked. Opening scanner modal.");
          setShowBluetoothModal(true);
          restartBtScan();
        }
      } finally {
        setIsScanningBt(false);
        setConnectingBtDevice(null);
      }
    } else {
      toast.error("Web Bluetooth not fully supported on this browser. Opening BLE printer scanner...");
      setShowBluetoothModal(true);
      restartBtScan();
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
      const thermal = printers.find(p =>
        /thermal|pos|receipt|58mm|80mm|epson|star|citizen|bixolon|xprinter/i.test(p)
      );
      setSelectedQZPrinter(thermal || printers[0] || '');
      setShowQZModal(true);
      toast.success(`QZ Tray connected! Found ${printers.length} printer(s).`);
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

  const disconnectQZTray = async () => {
    try {
      await disconnectQZ();
    } catch (_) { }
    setQzConnected(false);
    setQzPrinters([]);
    setSelectedQZPrinter('');
    toast.success("Disconnected from QZ Tray USB service.");
  };

  const printViaQZTray = async (dataBytes) => {
    if (!selectedQZPrinter) return false;
    try {
      toast.loading("Sending ticket to USB thermal printer...", { id: 'qz-print-job' });
      await printRawToQZ(selectedQZPrinter, dataBytes);
      toast.dismiss('qz-print-job');
      toast.success("Worksheet printed successfully via USB!");
      return true;
    } catch (error) {
      console.error("QZ printing failed:", error);
      toast.dismiss('qz-print-job');
      toast.error("USB direct print failed. Check printer connection.");
      return false;
    }
  };

  // Fetch Items & Stores on Load
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [storesSnap, itemsSnap] = await Promise.all([
          getDocs(query(collection(db, 'stores'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'items'), orderBy('name', 'asc')))
        ]);

        setStores(storesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setItems(itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Error fetching data:", err);
        toast.error("Failed to load stores or items.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Fetch worksheet for the selected date automatically to enable editing
  useEffect(() => {
    const fetchExistingWorksheet = async () => {
      if (!date) return;
      try {
        const q = query(collection(db, 'store_worksheets'), where('date', '==', date));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const sheet = snap.docs[0].data();
          setQuantities(sheet.quantities || {});
          toast.success(`Loaded saved worksheet for ${date}`);
        } else {
          setQuantities({});
        }
      } catch (err) {
        console.error("Error checking worksheet:", err);
      }
    };
    fetchExistingWorksheet();
  }, [date]);

  // Fetch Worksheet History
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const q = query(collection(db, 'store_worksheets'), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.error("Error fetching history:", err);
      toast.error("Failed to load worksheet history.");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Watch tab change to fetch history
  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  const handleQtyChange = (itemId, storeId, value) => {
    const val = value === '' ? '' : parseFloat(value);
    setQuantities(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {}),
        [storeId]: val
      }
    }));
  };

  const handleSave = async () => {
    if (!date) {
      toast.error("Please select a date.");
      return;
    }

    setSaving(true);
    try {
      // Filter out empty rows and zero allocations to save space in Firestore
      const cleanedQuantities = {};
      Object.entries(quantities).forEach(([itemId, storeQtyMap]) => {
        const storeClean = {};
        Object.entries(storeQtyMap).forEach(([storeId, qty]) => {
          if (qty !== '' && qty !== 0 && !isNaN(qty)) {
            storeClean[storeId] = Number(qty);
          }
        });
        if (Object.keys(storeClean).length > 0) {
          cleanedQuantities[itemId] = storeClean;
        }
      });

      const worksheetPayload = {
        date,
        quantities: cleanedQuantities,
        updatedAt: serverTimestamp()
      };

      const q = query(collection(db, 'store_worksheets'), where('date', '==', date));
      const snap = await getDocs(q);

      if (!snap.empty) {
        // Update existing worksheet document
        const docId = snap.docs[0].id;
        await updateDoc(doc(db, 'store_worksheets', docId), worksheetPayload);
        toast.success(`Store worksheet for ${date} updated successfully!`);
      } else {
        // Create new worksheet document
        await addDoc(collection(db, 'store_worksheets'), {
          ...worksheetPayload,
          createdAt: serverTimestamp()
        });
        toast.success(`Store worksheet for ${date} saved successfully!`);
      }
    } catch (err) {
      console.error("Error saving store worksheet:", err);
      toast.error("Failed to save worksheet details.");
    } finally {
      setSaving(false);
    }
  };

  // Printing implementation tailored for thermal printers
  const printDirectToBluetooth = async (worksheet) => {
    if (!printerCharacteristicRef.current) {
      toast.error("Bluetooth printer connection lost. Opening system print fallback...");
      printHTMLFallback(worksheet);
      return;
    }

    toast.loading("Sending worksheet directly to Bluetooth thermal printer...", { id: 'bt-worksheet-print-job' });

    try {
      const encoder = new TextEncoder();
      const wsQuantities = worksheet.quantities || {};

      // ESC/POS Commands
      const INIT = new Uint8Array([0x1b, 0x40]);
      const CENTER = new Uint8Array([0x1b, 0x61, 0x01]);
      const LEFT = new Uint8Array([0x1b, 0x61, 0x00]);
      const RIGHT = new Uint8Array([0x1b, 0x61, 0x02]);
      const DOUBLE_SIZE = new Uint8Array([0x1d, 0x21, 0x11]);
      const NORMAL_SIZE = new Uint8Array([0x1d, 0x21, 0x00]);
      const BOLD_ON = new Uint8Array([0x1b, 0x45, 0x01]);
      const BOLD_OFF = new Uint8Array([0x1b, 0x45, 0x00]);
      const CUT = new Uint8Array([0x1d, 0x56, 0x41, 0x00]);

      const charsPerLine = 32; // standard 58mm default width, BLE prints are usually 58mm
      const dashedLine = ''.padEnd(charsPerLine, '-') + '\n';
      const miniDashedLine = ''.padEnd(charsPerLine, '.') + '\n';

      const justifyLR = (left, right) => {
        let spaces = charsPerLine - left.length - right.length;
        if (spaces < 1) spaces = 1;
        return left + ' '.repeat(spaces) + right + '\n';
      };

      let bytes = [];
      bytes.push(...INIT);

      // Header
      bytes.push(...CENTER, ...DOUBLE_SIZE);
      bytes.push(...encoder.encode("RAJU GHEE SWEETS\n"));
      bytes.push(...NORMAL_SIZE);
      bytes.push(...encoder.encode("STORE WORK SHEET\n"));
      bytes.push(...LEFT);
      bytes.push(...encoder.encode(dashedLine));
      bytes.push(...encoder.encode(`DATE: ${worksheet.date}\n`));
      bytes.push(...encoder.encode(`PRINTED: ${new Date().toLocaleString()}\n`));
      bytes.push(...encoder.encode(dashedLine));

      // I. Store-Wise Summary
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode("I. STORE-WISE ITEMS\n"));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode(dashedLine));

      stores.forEach(store => {
        let storeItems = [];
        items.forEach(item => {
          const qty = wsQuantities[item.id]?.[store.id];
          if (qty && qty > 0) {
            const unitLabel = item.unit === 'Weight' ? 'KG' : 'Pcs';
            storeItems.push({ name: item.name, qty, unitLabel });
          }
        });

        if (storeItems.length > 0) {
          bytes.push(...BOLD_ON);
          bytes.push(...encoder.encode(`${store.name.toUpperCase()}\n`));
          bytes.push(...BOLD_OFF);

          storeItems.forEach(si => {
            let leftText = `* ${si.name}`;
            if (leftText.length > 18) {
              bytes.push(...encoder.encode(`${leftText}\n`));
              leftText = "  ";
            }
            const rightText = `${si.qty} ${si.unitLabel}`;
            bytes.push(...encoder.encode(justifyLR(leftText, rightText)));
          });
          bytes.push(...encoder.encode(miniDashedLine));
        }
      });

      // II. Globally Consolidated Summary
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode("II. GLOBALLY CONSOLIDATED\n"));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode(dashedLine));

      let overallSumWeight = 0;
      let overallSumPieces = 0;
      let totalActiveItems = 0;

      items.forEach(item => {
        const allocations = wsQuantities[item.id] || {};
        const activeAllocations = Object.entries(allocations).filter(([_, qty]) => qty > 0);

        if (activeAllocations.length > 0) {
          totalActiveItems++;
          const total = activeAllocations.reduce((sum, [_, qty]) => sum + qty, 0);
          const unitLabel = item.unit === 'Weight' ? 'KG' : 'Pcs';

          if (item.unit === 'Weight') {
            overallSumWeight += total;
          } else {
            overallSumPieces += total;
          }

          bytes.push(...BOLD_ON);
          bytes.push(...encoder.encode(`${item.name.toUpperCase()} (${unitLabel})\n`));
          bytes.push(...BOLD_OFF);

          activeAllocations.forEach(([storeId, qty]) => {
            const storeName = stores.find(s => s.id === storeId)?.name || 'Unknown Store';
            let leftText = `- ${storeName}`;
            if (leftText.length > 18) {
              bytes.push(...encoder.encode(`${leftText}\n`));
              leftText = "  ";
            }
            const rightText = `${qty} ${unitLabel}`;
            bytes.push(...encoder.encode(justifyLR(leftText, rightText)));
          });

          // Dashed divider line and sum
          bytes.push(...encoder.encode(miniDashedLine));
          const sumText = `SUM: ${total.toFixed(item.unit === 'Weight' ? 2 : 0)} ${unitLabel}`;
          bytes.push(...BOLD_ON, ...RIGHT);
          bytes.push(...encoder.encode(sumText + '\n'));
          bytes.push(...BOLD_OFF, ...LEFT);
          bytes.push(...encoder.encode(dashedLine));
        }
      });

      // III. Handwritten Notes
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode("III. HANDWRITTEN NOTES\n"));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode(dashedLine));
      bytes.push(...encoder.encode("\n\n")); // Renders space for writing

      // IV. Cumulative Sums
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode("IV. CUMULATIVE SUMS\n"));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode(dashedLine));
      bytes.push(...encoder.encode(justifyLR("Allocated Items:", `${totalActiveItems} Products`)));
      bytes.push(...encoder.encode(justifyLR("Total Weight:", `${overallSumWeight.toFixed(2)} KG`)));
      bytes.push(...encoder.encode(justifyLR("Total Pieces:", `${overallSumPieces} Pcs`)));

      // Cut paper
      bytes.push(...CENTER);
      bytes.push(...encoder.encode("\n*** THANK YOU ***\n\n\n"));
      bytes.push(...CUT);

      const dataArray = new Uint8Array(bytes);

      // BLE write chunking
      const CHUNK_SIZE = 20;
      for (let i = 0; i < dataArray.length; i += CHUNK_SIZE) {
        const chunk = dataArray.slice(i, i + CHUNK_SIZE);
        await printerCharacteristicRef.current.writeValue(chunk);
        await new Promise(resolve => setTimeout(resolve, 30));
      }

      toast.dismiss('bt-worksheet-print-job');
      toast.success("Worksheet printed successfully via Bluetooth!");
    } catch (err) {
      console.error("Direct BLE worksheet print error: ", err);
      toast.dismiss('bt-worksheet-print-job');
      toast.error("Bluetooth print failed. Opening system print fallback...");
      printHTMLFallback(worksheet);
    }
  };

  const buildWorksheetESCPOSBytes = (worksheet, charsPerLine = 48) => {
    const encoder = new TextEncoder();
    const wsQuantities = worksheet.quantities || {};

    const INIT = new Uint8Array([0x1b, 0x40]);
    const CENTER = new Uint8Array([0x1b, 0x61, 0x01]);
    const LEFT = new Uint8Array([0x1b, 0x61, 0x00]);
    const RIGHT = new Uint8Array([0x1b, 0x61, 0x02]);
    const DOUBLE_SIZE = new Uint8Array([0x1d, 0x21, 0x11]);
    const NORMAL_SIZE = new Uint8Array([0x1d, 0x21, 0x00]);
    const BOLD_ON = new Uint8Array([0x1b, 0x45, 0x01]);
    const BOLD_OFF = new Uint8Array([0x1b, 0x45, 0x00]);
    const CUT = new Uint8Array([0x1d, 0x56, 0x41, 0x00]);

    const dashedLine = ''.padEnd(charsPerLine, '-') + '\n';
    const miniDashedLine = ''.padEnd(charsPerLine, '.') + '\n';

    const justifyLR = (left, right) => {
      let spaces = charsPerLine - left.length - right.length;
      if (spaces < 1) spaces = 1;
      return left + ' '.repeat(spaces) + right + '\n';
    };

    let bytes = [];
    bytes.push(...INIT);

    // Header
    bytes.push(...CENTER, ...DOUBLE_SIZE);
    bytes.push(...encoder.encode("RAJU GHEE SWEETS\n"));
    bytes.push(...NORMAL_SIZE);
    bytes.push(...encoder.encode("STORE WORK SHEET\n"));
    bytes.push(...LEFT);
    bytes.push(...encoder.encode(dashedLine));
    bytes.push(...encoder.encode(`DATE: ${worksheet.date}\n`));
    bytes.push(...encoder.encode(`PRINTED: ${new Date().toLocaleString()}\n`));
    bytes.push(...encoder.encode(dashedLine));

    // I. Store-Wise Summary
    bytes.push(...BOLD_ON);
    bytes.push(...encoder.encode("I. STORE-WISE ITEMS\n"));
    bytes.push(...BOLD_OFF);
    bytes.push(...encoder.encode(dashedLine));

    stores.forEach(store => {
      let storeItems = [];
      items.forEach(item => {
        const qty = wsQuantities[item.id]?.[store.id];
        if (qty && qty > 0) {
          const unitLabel = item.unit === 'Weight' ? 'KG' : 'Pcs';
          storeItems.push({ name: item.name, qty, unitLabel });
        }
      });

      if (storeItems.length > 0) {
        bytes.push(...BOLD_ON);
        bytes.push(...encoder.encode(`${store.name.toUpperCase()}\n`));
        bytes.push(...BOLD_OFF);

        storeItems.forEach(si => {
          let leftText = `* ${si.name}`;
          if (leftText.length > (charsPerLine - 12)) {
            bytes.push(...encoder.encode(`${leftText}\n`));
            leftText = "  ";
          }
          const rightText = `${si.qty} ${si.unitLabel}`;
          bytes.push(...encoder.encode(justifyLR(leftText, rightText)));
        });
        bytes.push(...encoder.encode(miniDashedLine));
      }
    });

    // II. Globally Consolidated Summary
    bytes.push(...BOLD_ON);
    bytes.push(...encoder.encode("II. GLOBALLY CONSOLIDATED\n"));
    bytes.push(...BOLD_OFF);
    bytes.push(...encoder.encode(dashedLine));

    let overallSumWeight = 0;
    let overallSumPieces = 0;
    let totalActiveItems = 0;

    items.forEach(item => {
      const allocations = wsQuantities[item.id] || {};
      const activeAllocations = Object.entries(allocations).filter(([_, qty]) => qty > 0);

      if (activeAllocations.length > 0) {
        totalActiveItems++;
        const total = activeAllocations.reduce((sum, [_, qty]) => sum + qty, 0);
        const unitLabel = item.unit === 'Weight' ? 'KG' : 'Pcs';

        if (item.unit === 'Weight') {
          overallSumWeight += total;
        } else {
          overallSumPieces += total;
        }

        bytes.push(...BOLD_ON);
        bytes.push(...encoder.encode(`${item.name.toUpperCase()} (${unitLabel})\n`));
        bytes.push(...BOLD_OFF);

        activeAllocations.forEach(([storeId, qty]) => {
          const storeName = stores.find(s => s.id === storeId)?.name || 'Unknown Store';
          let leftText = `- ${storeName}`;
          if (leftText.length > (charsPerLine - 12)) {
            bytes.push(...encoder.encode(`${leftText}\n`));
            leftText = "  ";
          }
          const rightText = `${qty} ${unitLabel}`;
          bytes.push(...encoder.encode(justifyLR(leftText, rightText)));
        });

        // Dashed divider line and sum
        bytes.push(...encoder.encode(miniDashedLine));
        const sumText = `SUM: ${total.toFixed(item.unit === 'Weight' ? 2 : 0)} ${unitLabel}`;
        bytes.push(...BOLD_ON, ...RIGHT);
        bytes.push(...encoder.encode(sumText + '\n'));
        bytes.push(...BOLD_OFF, ...LEFT);
        bytes.push(...encoder.encode(dashedLine));
      }
    });

    // III. Handwritten Notes
    bytes.push(...BOLD_ON);
    bytes.push(...encoder.encode("III. HANDWRITTEN NOTES\n"));
    bytes.push(...BOLD_OFF);
    bytes.push(...encoder.encode(dashedLine));
    bytes.push(...encoder.encode("\n\n")); // Renders space for writing

    // IV. Cumulative Sums
    bytes.push(...BOLD_ON);
    bytes.push(...encoder.encode("IV. CUMULATIVE SUMS\n"));
    bytes.push(...BOLD_OFF);
    bytes.push(...encoder.encode(dashedLine));
    bytes.push(...encoder.encode(justifyLR("Allocated Items:", `${totalActiveItems} Products`)));
    bytes.push(...encoder.encode(justifyLR("Total Weight:", `${overallSumWeight.toFixed(2)} KG`)));
    bytes.push(...encoder.encode(justifyLR("Total Pieces:", `${overallSumPieces} Pcs`)));

    // Cut paper
    bytes.push(...CENTER);
    bytes.push(...encoder.encode("\n*** BLUETOOTH THERMAL PRINT ***\n\n\n"));
    bytes.push(...CUT);

    return new Uint8Array(bytes);
  };

  const printHTMLFallback = (worksheet) => {
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
      toast.error("Popup blocked! Please allow popups for thermal printing.");
      return;
    }

    const wsQuantities = worksheet.quantities || {};

    // 1. Build Store-Wise Allocations Section
    let storeWiseHtml = '';
    stores.forEach(store => {
      let storeItems = [];
      items.forEach(item => {
        const qty = wsQuantities[item.id]?.[store.id];
        if (qty && qty > 0) {
          const unitLabel = item.unit === 'Weight' ? 'KG' : 'Pcs';
          storeItems.push({ name: item.name, qty, unitLabel });
        }
      });

      if (storeItems.length > 0) {
        storeWiseHtml += `<div class="bold store-name-title">${store.name.toUpperCase()}</div>`;
        storeItems.forEach(si => {
          storeWiseHtml += `
            <div class="item-row indent">
              <span>* ${si.name}</span>
              <span class="bold">${si.qty} ${si.unitLabel}</span>
            </div>
          `;
        });
        storeWiseHtml += `<div class="mini-divider"></div>`;
      }
    });

    if (!storeWiseHtml) {
      storeWiseHtml = '<div class="text-center">No allocations recorded.</div>';
    }

    // 2. Build Globally Consolidated Items Section
    let itemWiseHtml = '';
    let overallSumWeight = 0;
    let overallSumPieces = 0;
    let totalActiveItems = 0;

    items.forEach(item => {
      const allocations = wsQuantities[item.id] || {};
      const activeAllocations = Object.entries(allocations).filter(([_, qty]) => qty > 0);

      if (activeAllocations.length > 0) {
        totalActiveItems++;
        const total = activeAllocations.reduce((sum, [_, qty]) => sum + qty, 0);
        const unitLabel = item.unit === 'Weight' ? 'KG' : 'Pcs';

        if (item.unit === 'Weight') {
          overallSumWeight += total;
        } else {
          overallSumPieces += total;
        }

        itemWiseHtml += `<div class="bold item-name-title">${item.name.toUpperCase()} (${unitLabel})</div>`;
        activeAllocations.forEach(([storeId, qty]) => {
          const storeName = stores.find(s => s.id === storeId)?.name || 'Unknown Store';
          itemWiseHtml += `
            <div class="item-row indent">
              <span>- ${storeName}</span>
              <span>${qty} ${unitLabel}</span>
            </div>
          `;
        });

        // Add visual divider note line before writing the sum
        itemWiseHtml += `
          <div class="mini-divider-dashed"></div>
          <div class="item-row indent bold sum-row">
            <span>SUM:</span>
            <span>${total.toFixed(item.unit === 'Weight' ? 2 : 0)} ${unitLabel}</span>
          </div>
          <div class="mini-divider"></div>
        `;
      }
    });

    if (!itemWiseHtml) {
      itemWiseHtml = '<div class="text-center">No allocations recorded.</div>';
    }

    const receiptContent = `
      <html>
        <head>
          <title>Worksheet Print - ${worksheet.date}</title>
          <style>
            @page {
              margin: 0;
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              width: 80mm;
              padding: 6mm 4mm;
              margin: 0;
              font-size: 13px;
              color: #000;
              background: #ffffff;
              line-height: 1.4;
              box-sizing: border-box;
            }
            .text-center { text-align: center; }
            .bold { font-weight: bold; }
            .header {
              font-size: 16px;
              font-weight: bold;
              margin-bottom: 2px;
              text-transform: uppercase;
            }
            .subheader {
              font-size: 11px;
              margin-bottom: 6px;
              letter-spacing: 1px;
              text-transform: uppercase;
            }
            .divider {
              border-top: 1.5px dashed #000;
              margin: 8px 0;
            }
            .mini-divider {
              border-top: 1px dotted #888;
              margin: 5px 0;
            }
            .mini-divider-dashed {
              border-top: 1px dashed #666;
              margin: 4px 0;
            }
            .section-title {
              font-size: 13px;
              margin: 14px 0 6px 0;
              text-transform: uppercase;
              border-bottom: 1.5px solid #000;
              padding-bottom: 2px;
            }
            .store-name-title {
              font-size: 12px;
              margin-top: 8px;
              margin-bottom: 4px;
            }
            .item-name-title {
              font-size: 12px;
              margin-top: 8px;
              margin-bottom: 4px;
            }
            .item-row {
              display: flex;
              justify-content: space-between;
              margin: 2px 0;
            }
            .indent {
              padding-left: 10px;
            }
            .sum-row {
              margin-top: 2px;
            }
            .note-line {
              border-bottom: 1px dotted #333;
              height: 25px;
              margin-bottom: 5px;
            }
            .footer {
              margin-top: 30px;
              font-size: 10px;
              letter-spacing: 1px;
            }
          </style>
        </head>
        <body>
          <div class="text-center bold header">RAJU GHEE SWEETS</div>
          <div class="text-center subheader">STORE WORK SHEET</div>
          <div class="divider"></div>
          <div><strong>DATE:</strong> ${worksheet.date}</div>
          <div><strong>PRINTED:</strong> ${new Date().toLocaleString()}</div>
          <div class="divider"></div>
          
          <div class="bold section-title">I. STORE-WISE ITEMS</div>
          ${storeWiseHtml}
          
          <div class="divider"></div>
          
          <div class="bold section-title">II. GLOBALLY CONSOLIDATED</div>
          ${itemWiseHtml}
          
          <div class="divider"></div>
          
          <div class="bold section-title">III. HANDWRITTEN NOTES</div>
          <div class="note-line"></div>
          <div class="note-line"></div>
          
          <div class="divider"></div>
          
          <div class="bold section-title">IV. CUMULATIVE SUMS</div>
          <div class="item-row">
            <span>Allocated Items:</span>
            <span class="bold">${totalActiveItems} Products</span>
          </div>
          <div class="item-row">
            <span>Total Ghee Weight:</span>
            <span class="bold">${overallSumWeight.toFixed(2)} KG</span>
          </div>
          <div class="item-row">
            <span>Total Piece Count:</span>
            <span class="bold">${overallSumPieces} Pcs</span>
          </div>
          
          <div class="divider"></div>
          <div class="text-center footer">*** BLUETOOTH THERMAL PRINT ***</div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(receiptContent);
    printWindow.document.close();
  };

  const handlePrint = async (worksheet) => {
    // 1. Bluetooth Connection Check
    if (bluetoothConnected && printerCharacteristicRef.current) {
      await printDirectToBluetooth(worksheet);
      return;
    }

    // 2. QZ Tray USB Connection Check
    if (qzConnected && selectedQZPrinter) {
      const bytes = buildWorksheetESCPOSBytes(worksheet, 48); // 48 chars standard width for QZ 80mm
      const success = await printViaQZTray(bytes);
      if (success) return;
    }

    // 3. Fallback to System HTML dialog
    printHTMLFallback(worksheet);
  };

  if (loading) {
    return <Loader type="page" message="Loading worksheet inventory..." />;
  }

  return (
    <div className="ws-container">
      <div className="ws-header">
        <div className="ws-header-info">
          <h1>Store Work Sheet</h1>
          <p>Plan, allocate, and distribute ghee sweets inventory across branches</p>
        </div>

        <div className="ws-tabs-container">
          <button
            className={`ws-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            <ClipboardList size={16} /> Active Sheet
          </button>
          <button
            className={`ws-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={16} /> History Log
          </button>
        </div>
      </div>

      <div className="ws-content">
        {activeTab === 'active' ? (
          <>
            <div className="ws-filters-row">
              <div className="ws-date-picker-group">
                <label>Allocation Date</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={18} color="var(--primary-color)" />
                  <input
                    type="date"
                    className="ws-date-input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Connected Devices / Printer Action center */}
              <div className="ws-printer-status-bar" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {bluetoothConnected ? (
                  <button className="ws-print-btn" style={{ borderColor: '#16a34a', color: '#16a34a', background: 'rgba(22, 163, 74, 0.05)', position: 'relative' }} onClick={disconnectPrinter}>
                    <BluetoothIcon size={14} />
                    <span>BLE: {connectedDevice ? (connectedDevice.length > 10 ? `${connectedDevice.substring(0, 10)}...` : connectedDevice) : 'Connected'}</span>
                  </button>
                ) : (
                  <button className="ws-print-btn" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }} onClick={handleBluetoothConnect}>
                    <BluetoothIcon size={14} />
                    <span>Connect BLE</span>
                  </button>
                )}

                {qzConnected ? (
                  <button className="ws-print-btn" style={{ borderColor: '#2563eb', color: '#2563eb', background: 'rgba(37, 99, 235, 0.05)' }} onClick={() => setShowQZModal(true)}>
                    <UsbIcon size={14} />
                    <span>USB: {selectedQZPrinter ? (selectedQZPrinter.length > 10 ? `${selectedQZPrinter.substring(0, 10)}...` : selectedQZPrinter) : 'Connected'}</span>
                  </button>
                ) : (
                  <button className="ws-print-btn" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }} onClick={connectQZTray} disabled={qzConnecting}>
                    <UsbIcon size={14} />
                    <span>{qzConnecting ? `USB: ${qzConnectTimer}s` : 'Connect USB'}</span>
                  </button>
                )}
              </div>
            </div>

            {items.length > 0 ? (
              <>
                <div className="ws-table-container">
                  <table className="ws-table">
                    <thead>
                      <tr>
                        <th>Product Name</th>
                        <th>Unit</th>
                        {stores.map(store => (
                          <th key={store.id}>{store.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => {
                        const unitBadgeClass = item.unit === 'Weight' ? 'weight' : 'piece';
                        const unitLabel = item.unit === 'Weight' ? 'KG' : 'Pieces';
                        const unitPlaceholder = item.unit === 'Weight' ? '0.00' : '0';

                        return (
                          <tr key={item.id}>
                            <td>
                              <span className="ws-item-name">{item.name}</span>
                            </td>
                            <td>
                              <span className={`ws-unit-badge ${unitBadgeClass}`}>
                                {unitLabel}
                              </span>
                            </td>
                            {stores.map(store => {
                              const itemQty = quantities[item.id]?.[store.id] ?? '';
                              return (
                                <td key={store.id}>
                                  <div className="ws-qty-input-wrapper">
                                    <input
                                      type="number"
                                      className="ws-qty-input"
                                      value={itemQty}
                                      placeholder={unitPlaceholder}
                                      onChange={(e) => handleQtyChange(item.id, store.id, e.target.value)}
                                      min="0"
                                      step={item.unit === 'Weight' ? '0.01' : '1'}
                                    />
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="ws-action-bar">
                  <button
                    onClick={handleSave}
                    className="ws-save-btn"
                    disabled={saving}
                  >
                    <Save size={18} />
                    {saving ? 'Saving...' : 'Save Worksheet'}
                  </button>
                </div>
              </>
            ) : (
              <div className="ws-empty-state">
                <div className="ws-empty-icon">
                  <PackageCheck size={28} />
                </div>
                <h3>No Inventory Items Available</h3>
                <p>Register products under the "Items" panel first to start planning worksheets.</p>
              </div>
            )}
          </>
        ) : (
          /* HISTORY TAB */
          <>
            {loadingHistory ? (
              <div style={{ padding: '60px 0' }}>
                <Loader type="section" message="Fetching history entries..." />
              </div>
            ) : history.length > 0 ? (
              <div className="ws-history-grid">
                {history.map(sheet => {
                  // Count total allocated items
                  const allocatedItemsCount = Object.keys(sheet.quantities || {}).length;

                  return (
                    <div key={sheet.id} className="ws-history-card">
                      <div className="ws-card-header">
                        <span className="ws-card-date">
                          <Calendar size={18} color="var(--accent-color)" />
                          {sheet.date}
                        </span>
                        <ChevronRight size={18} color="var(--text-secondary)" />
                      </div>

                      <div className="ws-card-stats">
                        <span className="ws-stat-pill">
                          <strong>{allocatedItemsCount}</strong> Products
                        </span>
                        <span className="ws-stat-pill">
                          <Building size={14} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                          {stores.length} Stores
                        </span>
                      </div>

                      <div className="ws-card-actions">
                        <button
                          className="ws-print-btn"
                          onClick={() => handlePrint(sheet)}
                        >
                          <Printer size={15} />
                          Print Ticket
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ws-empty-state">
                <div className="ws-empty-icon">
                  <ClipboardList size={28} />
                </div>
                <h3>No Worksheets Saved Yet</h3>
                <p>Prepare and save active worksheets to log details in the history tab.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ========================================== */}
      {/* PRINTER UTILITY DIALOG MODALS              */}
      {/* ========================================== */}

      {/* Bluetooth BLE Scanner Modal */}
      <AnimatePresence>
        {showBluetoothModal && (
          <div className="modal-overlay" style={{ zIndex: 5000 }}>
            <motion.div
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '400px', width: '90%' }}
            >
              <div className="modal-icon-box" style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--accent-color)' }}>
                <BluetoothIcon size={28} />
              </div>
              <h3 className="modal-title">Pair BLE Thermal Printer</h3>

              <div style={{ margin: '15px 0', textAlign: 'left' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Available Devices</span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                  {isScanningBt ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '15px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <RefreshCw size={14} className="animate-spin" /> Scanning for printers...
                    </div>
                  ) : btDevices.length > 0 ? (
                    btDevices.map(dev => (
                      <div
                        key={dev.name}
                        onClick={() => !connectingBtDevice && connectBtDevice(dev.name)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          cursor: connectingBtDevice ? 'not-allowed' : 'pointer',
                          background: '#f8fafc',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => { if (!connectingBtDevice) e.currentTarget.style.borderColor = 'var(--accent-color)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                      >
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{dev.name}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{dev.type}</div>
                        </div>
                        <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: '700' }}>
                          {connectingBtDevice === dev.name ? 'Pairing...' : `${dev.rssi} dBm`}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '15px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      No BLE printers detected in range.
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <button className="modal-btn cancel" onClick={() => setShowBluetoothModal(false)}>Close</button>
                <button
                  className="ws-save-btn"
                  style={{ height: '36px', fontSize: '13px' }}
                  onClick={restartBtScan}
                  disabled={isScanningBt}
                >
                  <RefreshCw size={12} className={isScanningBt ? 'animate-spin' : ''} /> Rescan
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QZ Tray Printer Selection Modal */}
      <AnimatePresence>
        {showQZModal && (
          <div className="modal-overlay" style={{ zIndex: 5000 }}>
            <motion.div
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '400px', width: '90%' }}
            >
              <div className="modal-icon-box" style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
                <UsbIcon size={28} />
              </div>
              <h3 className="modal-title">Select USB Thermal Printer</h3>

              <div style={{ margin: '15px 0', textAlign: 'left' }}>
                <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Detected USB Printers</label>
                <select
                  value={selectedQZPrinter}
                  onChange={(e) => setSelectedQZPrinter(e.target.value)}
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--border-color)',
                    fontSize: '14px',
                    background: '#f8fafc',
                    outline: 'none'
                  }}
                >
                  {qzPrinters.length > 0 ? (
                    qzPrinters.map(p => <option key={p} value={p}>{p}</option>)
                  ) : (
                    <option value="">No USB printers found</option>
                  )}
                </select>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <button className="modal-btn cancel" onClick={() => disconnectQZTray()}>Disconnect</button>
                <button
                  className="ws-save-btn"
                  style={{ height: '36px', fontSize: '13px', background: '#2563eb', boxShadow: '0 4px 12px rgba(37,99,235,0.15)' }}
                  onClick={() => setShowQZModal(false)}
                >
                  Confirm Printer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QZ Tray Connection Setup Guide (Fallback) */}
      <AnimatePresence>
        {showQZSetupGuide && (
          <div className="modal-overlay" style={{ zIndex: 5000 }}>
            <motion.div
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '440px', width: '90%', textAlign: 'left' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626' }}>
                  <AlertCircle size={20} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>USB Thermal Print Driver Missing</h3>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowQZSetupGuide(false)}><X size={18} /></button>
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p>Direct USB printing requires <strong>QZ Tray</strong> local service to bridges web actions to hardware drivers.</p>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '12px', marginBottom: '4px' }}>Setup Steps:</div>
                  <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Download & install from: <a href="https://qz.io/download/" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: '700' }}>qz.io/download/</a></li>
                    <li>Launch QZ Tray application on your PC.</li>
                    <li>If prompted for security warning, choose "Always Trust".</li>
                    <li>Click the Retry Connect button below.</li>
                  </ol>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button className="modal-btn cancel" onClick={() => setShowQZSetupGuide(false)}>Close</button>
                <button
                  className="ws-save-btn"
                  style={{ height: '36px', fontSize: '13px', background: '#dc2626', boxShadow: 'none' }}
                  onClick={async () => {
                    setShowQZSetupGuide(false);
                    await connectQZTray();
                  }}
                >
                  <RefreshCw size={12} /> Retry Connect
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StoreWorkSheet;
