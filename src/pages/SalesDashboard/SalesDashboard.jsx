import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  ShoppingBag, 
  Receipt, 
  DollarSign, 
  CreditCard, 
  Calendar, 
  Store as StoreIcon, 
  ArrowUpRight, 
  ArrowDownRight, 
  Filter, 
  Search, 
  Download, 
  Printer, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Smartphone, 
  Building2, 
  Percent, 
  FileSpreadsheet, 
  RefreshCw, 
  ShieldCheck, 
  Eye, 
  ChevronRight, 
  User, 
  Phone, 
  Sparkles,
  Layers,
  HelpCircle,
  X
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import './SalesDashboard.css';

// Logo for invoice preview fallback
import logo from '../../assets/logo.png';
const DEFAULT_ITEM_IMAGE = logo;

/**
 * Robustly parses a record's transaction date across all formats in the database:
 * Firestore Timestamps, ISO strings, YYYY-MM-DD, and DD/MM/YYYY.
 */
export const extractRecordDate = (record) => {
  if (!record) return null;

  // 1. Firestore Timestamp
  if (record.createdAt?.toDate) {
    return record.createdAt.toDate();
  }
  if (record.createdAt?.seconds) {
    return new Date(record.createdAt.seconds * 1000);
  }

  // 2. billDate (YYYY-MM-DD)
  if (record.billDate && typeof record.billDate === 'string') {
    const parts = record.billDate.split('-').map(Number);
    if (parts.length === 3 && parts[0] > 1900) {
      return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    }
  }

  // 3. date string (DD/MM/YYYY or YYYY-MM-DD)
  if (record.date && typeof record.date === 'string') {
    if (record.date.includes('/')) {
      const parts = record.date.split('/').map(Number);
      if (parts.length === 3) {
        return new Date(parts[2], parts[1] - 1, parts[0], 12, 0, 0);
      }
    }
    if (record.date.includes('-')) {
      const parts = record.date.split('-').map(Number);
      if (parts.length === 3) {
        if (parts[0] > 1900) {
          return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
        } else {
          return new Date(parts[2], parts[1] - 1, parts[0], 12, 0, 0);
        }
      }
    }
  }

  // 4. Delivery date fallback for orders
  if (record.deliveryDate && typeof record.deliveryDate === 'string') {
    const parts = record.deliveryDate.split('-').map(Number);
    if (parts.length === 3 && parts[0] > 1900) {
      return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    }
  }

  return null;
};

/**
 * Calculates payment split distribution from a transaction record.
 * Handles single mode and split modes ('Split', splitPayments object).
 */
export const calculatePaymentSplits = (record, targetAmount) => {
  const amt = Number(targetAmount != null ? targetAmount : record.totalAmount) || 0;
  if (amt <= 0) return { cash: 0, upi: 0, card: 0, other: 0 };

  const mode = (record.paymentMode || record.paymentType || 'Cash').trim().toLowerCase();

  if (mode === 'split' && record.splitPayments) {
    const rawCash = Number(record.splitPayments.Cash) || 0;
    const rawUpi = Number(record.splitPayments.UPI) || 0;
    const rawCard = Number(record.splitPayments.Card) || 0;
    const rawNet = Number(record.splitPayments.NetBanking) || 0;
    const rawTotal = rawCash + rawUpi + rawCard + rawNet;

    if (rawTotal > 0) {
      const scale = amt / rawTotal;
      return {
        cash: rawCash * scale,
        upi: rawUpi * scale,
        card: rawCard * scale,
        other: rawNet * scale
      };
    }
  }

  if (mode === 'cash') return { cash: amt, upi: 0, card: 0, other: 0 };
  if (mode === 'upi' || mode === 'online' || mode === 'gpay' || mode === 'phonepe' || mode === 'paytm') {
    return { cash: 0, upi: amt, card: 0, other: 0 };
  }
  if (mode === 'card' || mode === 'credit card' || mode === 'debit card' || mode === 'pos') {
    return { cash: 0, upi: 0, card: amt, other: 0 };
  }

  return { cash: 0, upi: 0, card: 0, other: amt };
};

const SalesDashboard = () => {
  const { currentUser } = useAuth();

  // Primary Data Collections
  const [orders, setOrders] = useState([]);
  const [bills, setBills] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters State
  // Presets: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'custom'
  const [dateFilter, setDateFilter] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedStore, setSelectedStore] = useState('all');

  // Transactions Table State
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'orders' | 'walkin' | 'credit'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTx, setSelectedTx] = useState(null);

  // Load Real-time Data
  useEffect(() => {
    setLoading(true);

    // 1. Orders listener
    const ordersQ = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubOrders = onSnapshot(ordersQ, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("SalesDashboard: Error loading orders:", err);
      toast.error("Failed to sync orders data");
    });

    // 2. Stores listener
    const unsubStores = onSnapshot(collection(db, 'stores'), (snap) => {
      const sList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      sList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setStores(sList);
    });

    // 3. Bills root listener + subcollection resilience
    const billsQ = query(collection(db, 'bills'), orderBy('createdAt', 'desc'));
    const unsubBills = onSnapshot(billsQ, async (snap) => {
      let rootBills = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Also check store subcollections to guarantee zero lost bills
      try {
        const storeSnap = await getDocs(collection(db, 'stores'));
        const existingIds = new Set(rootBills.map(b => b.id || b.billId));

        for (const sDoc of storeSnap.docs) {
          const storeBillsSnap = await getDocs(collection(db, 'stores', sDoc.id, 'bills'));
          storeBillsSnap.docs.forEach(bDoc => {
            const data = bDoc.data();
            const identifier = bDoc.id || data.billId;
            if (!existingIds.has(identifier)) {
              rootBills.push({
                id: bDoc.id,
                storeId: sDoc.id,
                storeName: sDoc.data().name || 'Store',
                status: 'settled',
                ...data
              });
              existingIds.add(identifier);
            }
          });
        }
      } catch (subErr) {
        console.warn("Subcollection bill scan note:", subErr);
      }

      setBills(rootBills);
      setLoading(false);
    }, (err) => {
      console.error("SalesDashboard: Error loading bills:", err);
      toast.error("Failed to sync POS bills");
      setLoading(false);
    });

    return () => {
      unsubOrders();
      unsubStores();
      unsubBills();
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    toast.loading("Refreshed real-time sales data", { duration: 1200 });
    setTimeout(() => setRefreshing(false), 800);
  };

  // Compute Active Date Range Bounds
  const dateRange = useMemo(() => {
    const now = new Date();

    if (dateFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const label = `Today (${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})`;
      return { start, end, label, key: 'today' };
    }

    if (dateFilter === 'yesterday') {
      const yDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const start = new Date(yDate.getFullYear(), yDate.getMonth(), yDate.getDate(), 0, 0, 0, 0);
      const end = new Date(yDate.getFullYear(), yDate.getMonth(), yDate.getDate(), 23, 59, 59, 999);
      const label = `Yesterday (${yDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})`;
      return { start, end, label, key: 'yesterday' };
    }

    if (dateFilter === 'this_week') {
      const currentDay = now.getDay(); // 0 is Sunday
      const diffToMonday = (currentDay + 6) % 7;
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday + 6, 23, 59, 59, 999);
      const label = `This Week (${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})`;
      return { start, end, label, key: 'this_week' };
    }

    if (dateFilter === 'last_week') {
      const currentDay = now.getDay();
      const diffToMonday = (currentDay + 6) % 7;
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday - 7, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday - 1, 23, 59, 59, 999);
      const label = `Last Week (${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})`;
      return { start, end, label, key: 'last_week' };
    }

    if (dateFilter === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = `This Month (${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })})`;
      return { start, end, label, key: 'this_month' };
    }

    if (dateFilter === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const label = `Last Month (${lastMonthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })})`;
      return { start, end, label, key: 'last_month' };
    }

    if (dateFilter === 'this_year') {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      const label = `This Year (${now.getFullYear()})`;
      return { start, end, label, key: 'this_year' };
    }

    if (dateFilter === 'last_year') {
      const prevYear = now.getFullYear() - 1;
      const start = new Date(prevYear, 0, 1, 0, 0, 0, 0);
      const end = new Date(prevYear, 11, 31, 23, 59, 59, 999);
      const label = `Last Year (${prevYear})`;
      return { start, end, label, key: 'last_year' };
    }

    if (dateFilter === 'custom' && customStartDate && customEndDate) {
      const s = new Date(customStartDate);
      s.setHours(0, 0, 0, 0);
      const e = new Date(customEndDate);
      e.setHours(23, 59, 59, 999);
      const label = `Custom (${s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})`;
      return { start: s, end: e, label, key: 'custom' };
    }

    // Default fallback to Today
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { start, end, label: `Today`, key: 'today' };
  }, [dateFilter, customStartDate, customEndDate]);

  // Filter Orders by Date Range & Store
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (selectedStore !== 'all' && order.storeId !== selectedStore) return false;

      const d = extractRecordDate(order);
      if (!d) return false;

      const time = d.getTime();
      return time >= dateRange.start.getTime() && time <= dateRange.end.getTime();
    });
  }, [orders, selectedStore, dateRange]);

  // Filter Bills by Date Range & Store
  const filteredBills = useMemo(() => {
    return bills.filter(bill => {
      if (selectedStore !== 'all' && bill.storeId !== selectedStore) return false;

      const d = extractRecordDate(bill);
      if (!d) return false;

      const time = d.getTime();
      return time >= dateRange.start.getTime() && time <= dateRange.end.getTime();
    });
  }, [bills, selectedStore, dateRange]);

  // Separate Settled vs Draft/Saved Bills
  const settledBills = useMemo(() => {
    return filteredBills.filter(b => (b.status || 'settled') === 'settled');
  }, [filteredBills]);

  const savedBills = useMemo(() => {
    return filteredBills.filter(b => b.status === 'saved');
  }, [filteredBills]);

  // ==========================================
  // CORE FINANCIAL METRICS CALCULATIONS
  // ==========================================
  const analytics = useMemo(() => {
    // 1. Order Sales
    const orderSalesGross = filteredOrders.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0);
    const orderSalesReceived = filteredOrders.reduce((acc, o) => acc + (Number(o.receivedAmount) || 0), 0);
    const orderSalesCredit = filteredOrders.reduce((acc, o) => {
      const diff = (Number(o.totalAmount) || 0) - (Number(o.receivedAmount) || 0);
      return acc + (diff > 0 ? diff : 0);
    }, 0);
    const orderCount = filteredOrders.length;
    const orderAOV = orderCount > 0 ? orderSalesGross / orderCount : 0;

    // 2. Walk-in Sales (Settled POS Bills)
    const walkInGross = settledBills.reduce((acc, b) => acc + (Number(b.totalAmount) || 0), 0);
    const walkInReceived = walkInGross; // POS settled bills are paid in full
    const walkInCredit = 0;
    const walkInCount = settledBills.length;
    const walkInAOV = walkInCount > 0 ? walkInGross / walkInCount : 0;

    // Saved / Parked drafts
    const savedBillsCount = savedBills.length;
    const savedBillsGross = savedBills.reduce((acc, b) => acc + (Number(b.totalAmount) || 0), 0);

    // 3. Overall Totals
    const totalSales = orderSalesGross + walkInGross;
    const totalReceived = orderSalesReceived + walkInReceived;
    const totalCredit = orderSalesCredit + walkInCredit;
    const totalTransactions = orderCount + walkInCount;
    const collectionRate = totalSales > 0 ? (totalReceived / totalSales) * 100 : 0;

    // 4. GST Analytics (Standard 5% Inclusive GST)
    // Taxable turnover = totalSales / 1.05
    // Total GST = totalSales - Taxable turnover
    const totalTaxable = totalSales / 1.05;
    const totalGST = totalSales - totalTaxable;
    const cgst = totalGST / 2; // 2.5%
    const sgst = totalGST / 2; // 2.5%

    const orderGST = orderSalesGross - (orderSalesGross / 1.05);
    const walkInGST = walkInGross - (walkInGross / 1.05);

    // 5. Payment Methods Breakdown (UPI, Card, Cash)
    let cashTotal = 0;
    let upiTotal = 0;
    let cardTotal = 0;
    let otherTotal = 0;

    let orderCash = 0;
    let orderUpi = 0;
    let orderCard = 0;

    let walkInCash = 0;
    let walkInUpi = 0;
    let walkInCard = 0;

    let cashTxCount = 0;
    let upiTxCount = 0;
    let cardTxCount = 0;

    // Process Orders Collected
    filteredOrders.forEach(o => {
      const rec = Number(o.receivedAmount) || 0;
      if (rec > 0) {
        const splits = calculatePaymentSplits(o, rec);
        cashTotal += splits.cash;
        upiTotal += splits.upi;
        cardTotal += splits.card;
        otherTotal += splits.other;

        orderCash += splits.cash;
        orderUpi += splits.upi;
        orderCard += splits.card;

        if (splits.cash > 0) cashTxCount++;
        if (splits.upi > 0) upiTxCount++;
        if (splits.card > 0) cardTxCount++;
      }
    });

    // Process Walk-in Settled Bills
    settledBills.forEach(b => {
      const amt = Number(b.totalAmount) || 0;
      if (amt > 0) {
        const splits = calculatePaymentSplits(b, amt);
        cashTotal += splits.cash;
        upiTotal += splits.upi;
        cardTotal += splits.card;
        otherTotal += splits.other;

        walkInCash += splits.cash;
        walkInUpi += splits.upi;
        walkInCard += splits.card;

        if (splits.cash > 0) cashTxCount++;
        if (splits.upi > 0) upiTxCount++;
        if (splits.card > 0) cardTxCount++;
      }
    });

    const totalCollectedMethods = (cashTotal + upiTotal + cardTotal + otherTotal) || 1;
    const cashPercent = (cashTotal / totalCollectedMethods) * 100;
    const upiPercent = (upiTotal / totalCollectedMethods) * 100;
    const cardPercent = (cardTotal / totalCollectedMethods) * 100;

    // 6. Outlet Wise Breakdown
    const storeMap = {};
    stores.forEach(s => {
      storeMap[s.id] = {
        id: s.id,
        name: s.name,
        tradeName: s.tradeName || s.name,
        orderSales: 0,
        walkInSales: 0,
        totalSales: 0,
        received: 0,
        credit: 0,
        orderCount: 0,
        walkInCount: 0
      };
    });

    filteredOrders.forEach(o => {
      const sId = o.storeId || 'unknown';
      if (!storeMap[sId]) {
        storeMap[sId] = {
          id: sId,
          name: o.storeName || 'Unknown Store',
          tradeName: o.storeName || 'Unknown Store',
          orderSales: 0,
          walkInSales: 0,
          totalSales: 0,
          received: 0,
          credit: 0,
          orderCount: 0,
          walkInCount: 0
        };
      }
      const tot = Number(o.totalAmount) || 0;
      const rec = Number(o.receivedAmount) || 0;
      const cred = Math.max(0, tot - rec);
      storeMap[sId].orderSales += tot;
      storeMap[sId].totalSales += tot;
      storeMap[sId].received += rec;
      storeMap[sId].credit += cred;
      storeMap[sId].orderCount += 1;
    });

    settledBills.forEach(b => {
      const sId = b.storeId || 'unknown';
      if (!storeMap[sId]) {
        storeMap[sId] = {
          id: sId,
          name: b.storeName || 'Unknown Store',
          tradeName: b.storeName || 'Unknown Store',
          orderSales: 0,
          walkInSales: 0,
          totalSales: 0,
          received: 0,
          credit: 0,
          orderCount: 0,
          walkInCount: 0
        };
      }
      const tot = Number(b.totalAmount) || 0;
      storeMap[sId].walkInSales += tot;
      storeMap[sId].totalSales += tot;
      storeMap[sId].received += tot;
      storeMap[sId].walkInCount += 1;
    });

    const storePerformance = Object.values(storeMap)
      .filter(s => s.totalSales > 0 || s.orderCount > 0 || s.walkInCount > 0)
      .sort((a, b) => b.totalSales - a.totalSales);

    // 7. Credit Orders (Outstanding Balances)
    const creditOrders = filteredOrders
      .filter(o => {
        const bal = (Number(o.totalAmount) || 0) - (Number(o.receivedAmount) || 0);
        return bal > 0.5;
      })
      .map(o => ({
        ...o,
        balanceDue: (Number(o.totalAmount) || 0) - (Number(o.receivedAmount) || 0)
      }))
      .sort((a, b) => b.balanceDue - a.balanceDue);

    return {
      orderSalesGross,
      orderSalesReceived,
      orderSalesCredit,
      orderCount,
      orderAOV,
      walkInGross,
      walkInReceived,
      walkInCredit,
      walkInCount,
      walkInAOV,
      savedBillsCount,
      savedBillsGross,
      totalSales,
      totalReceived,
      totalCredit,
      totalTransactions,
      collectionRate,
      totalTaxable,
      totalGST,
      cgst,
      sgst,
      orderGST,
      walkInGST,
      cashTotal,
      upiTotal,
      cardTotal,
      otherTotal,
      orderCash,
      orderUpi,
      orderCard,
      walkInCash,
      walkInUpi,
      walkInCard,
      cashTxCount,
      upiTxCount,
      cardTxCount,
      cashPercent,
      upiPercent,
      cardPercent,
      storePerformance,
      creditOrders
    };
  }, [filteredOrders, settledBills, savedBills, stores]);

  // Combined Unified Transactions Feed
  const unifiedTransactions = useMemo(() => {
    const list = [];

    // Orders
    filteredOrders.forEach(o => {
      const d = extractRecordDate(o);
      const total = Number(o.totalAmount) || 0;
      const rec = Number(o.receivedAmount) || 0;
      const bal = Math.max(0, total - rec);
      const gst = total - (total / 1.05);

      list.push({
        id: o.id,
        recordId: o.orderId || o.id,
        type: 'Order',
        dateObj: d,
        dateFormatted: d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
        timeFormatted: d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
        customerName: o.customerName || 'Customer',
        customerPhone: o.customerPhone || '—',
        storeName: o.storeName || 'Main Store',
        totalAmount: total,
        receivedAmount: rec,
        balanceDue: bal,
        paymentMode: o.paymentMode || 'Cash',
        splitPayments: o.splitPayments,
        gstAmount: gst,
        status: o.status || 'Active',
        paymentStatus: o.paymentStatus || (bal <= 0 ? 'Done' : rec > 0 ? 'Partial' : 'Pending'),
        raw: o
      });
    });

    // Walk-in Bills
    filteredBills.forEach(b => {
      const d = extractRecordDate(b);
      const total = Number(b.totalAmount) || 0;
      const isSettled = (b.status || 'settled') === 'settled';
      const rec = isSettled ? total : 0;
      const bal = isSettled ? 0 : total;
      const gst = total - (total / 1.05);

      list.push({
        id: b.id,
        recordId: b.billId || b.id,
        type: 'Walk-In',
        dateObj: d,
        dateFormatted: d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : (b.date || '—'),
        timeFormatted: d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
        customerName: b.customerName || 'Walk-in Customer',
        customerPhone: b.customerPhone || '—',
        storeName: b.storeName || 'POS Outlet',
        totalAmount: total,
        receivedAmount: rec,
        balanceDue: bal,
        paymentMode: b.paymentMode || 'Cash',
        splitPayments: b.splitPayments,
        gstAmount: gst,
        status: isSettled ? 'Settled' : 'Draft / Saved',
        paymentStatus: isSettled ? 'Settled' : 'Unpaid',
        raw: b
      });
    });

    // Sort descending by date
    list.sort((a, b) => (b.dateObj?.getTime() || 0) - (a.dateObj?.getTime() || 0));

    // Tab Filtering
    let filtered = list;
    if (activeTab === 'orders') {
      filtered = filtered.filter(item => item.type === 'Order');
    } else if (activeTab === 'walkin') {
      filtered = filtered.filter(item => item.type === 'Walk-In');
    } else if (activeTab === 'credit') {
      filtered = filtered.filter(item => item.balanceDue > 0.5);
    }

    // Search Query Filtering
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(item => 
        item.recordId.toLowerCase().includes(q) ||
        item.customerName.toLowerCase().includes(q) ||
        item.customerPhone.includes(q) ||
        item.storeName.toLowerCase().includes(q) ||
        item.paymentMode.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [filteredOrders, filteredBills, activeTab, searchQuery]);

  // Export to Excel Spreadsheet (.xlsx)
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Executive KPI Summary
      const summaryRows = [
        ['SRI RAJU GHEE SWEETS - CONSOLIDATED SALES & REVENUE REPORT'],
        ['Generated On:', new Date().toLocaleString('en-IN')],
        ['Selected Date Range:', dateRange.label],
        ['Store Filter:', selectedStore === 'all' ? 'All Stores & Outlets' : (stores.find(s => s.id === selectedStore)?.name || selectedStore)],
        [],
        ['EXECUTIVE SALES & REVENUE KPIS', 'AMOUNT (INR)', 'DETAILS / COUNT'],
        ['Total Gross Sales', analytics.totalSales.toFixed(2), `${analytics.totalTransactions} Total Transactions`],
        ['Total Received Amount', analytics.totalReceived.toFixed(2), `${analytics.collectionRate.toFixed(1)}% Collection Efficiency`],
        ['Total In Credit (Outstanding)', analytics.totalCredit.toFixed(2), `${analytics.creditOrders.length} Pending Credit Invoices`],
        ['Total GST Collected (5%)', analytics.totalGST.toFixed(2), `Taxable Turnover: ₹${analytics.totalTaxable.toFixed(2)}`],
        ['CGST (2.5%)', analytics.cgst.toFixed(2), 'Central Goods & Services Tax'],
        ['SGST (2.5%)', analytics.sgst.toFixed(2), 'State Goods & Services Tax'],
        [],
        ['SALES CHANNEL BREAKDOWN', 'GROSS SALES (INR)', 'RECEIVED (INR)', 'CREDIT / DUE (INR)', 'TX COUNT'],
        ['Order Sales (Advance/Custom)', analytics.orderSalesGross.toFixed(2), analytics.orderSalesReceived.toFixed(2), analytics.orderSalesCredit.toFixed(2), analytics.orderCount],
        ['Walk-In Sales (POS Billing)', analytics.walkInGross.toFixed(2), analytics.walkInReceived.toFixed(2), '0.00', analytics.walkInCount],
        ['Parked / Saved Draft Bills', analytics.savedBillsGross.toFixed(2), '0.00', analytics.savedBillsGross.toFixed(2), analytics.savedBillsCount],
        [],
        ['PAYMENT METHODS REVENUE', 'TOTAL COLLECTED (INR)', 'SHARE (%)', 'TRANSACTIONS'],
        ['UPI / Digital Payments', analytics.upiTotal.toFixed(2), `${analytics.upiPercent.toFixed(1)}%`, analytics.upiTxCount],
        ['Cash Payments', analytics.cashTotal.toFixed(2), `${analytics.cashPercent.toFixed(1)}%`, analytics.cashTxCount],
        ['Credit/Debit Cards', analytics.cardTotal.toFixed(2), `${analytics.cardPercent.toFixed(1)}%`, analytics.cardTxCount],
        ['Other / NetBanking', analytics.otherTotal.toFixed(2), '—', '—']
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

      // Sheet 2: All Filtered Transactions
      const txRows = [
        ['Type', 'Invoice/Order ID', 'Date', 'Time', 'Customer Name', 'Phone', 'Outlet Store', 'Total (INR)', 'Received (INR)', 'Credit Balance (INR)', 'Payment Mode', 'GST 5% (INR)', 'Status']
      ];

      unifiedTransactions.forEach(tx => {
        txRows.push([
          tx.type,
          tx.recordId,
          tx.dateFormatted,
          tx.timeFormatted,
          tx.customerName,
          tx.customerPhone,
          tx.storeName,
          tx.totalAmount.toFixed(2),
          tx.receivedAmount.toFixed(2),
          tx.balanceDue.toFixed(2),
          tx.paymentMode,
          tx.gstAmount.toFixed(2),
          tx.status
        ]);
      });

      const wsTx = XLSX.utils.aoa_to_sheet(txRows);
      XLSX.utils.book_append_sheet(wb, wsTx, 'Transactions Data');

      // Sheet 3: Credit Orders Due
      const creditRows = [
        ['Order ID', 'Order Date', 'Customer Name', 'Phone', 'Store Outlet', 'Order Total (INR)', 'Received (INR)', 'Balance Due / Credit (INR)', 'Payment Status']
      ];
      analytics.creditOrders.forEach(o => {
        const d = extractRecordDate(o);
        creditRows.push([
          o.orderId || o.id,
          d ? d.toLocaleDateString('en-IN') : '—',
          o.customerName || 'Customer',
          o.customerPhone || '—',
          o.storeName || 'Main Store',
          Number(o.totalAmount || 0).toFixed(2),
          Number(o.receivedAmount || 0).toFixed(2),
          Number(o.balanceDue || 0).toFixed(2),
          o.paymentStatus || 'Pending'
        ]);
      });
      const wsCredit = XLSX.utils.aoa_to_sheet(creditRows);
      XLSX.utils.book_append_sheet(wb, wsCredit, 'Credit Receivables');

      const fileName = `RajuSweets_SalesReport_${dateFilter}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Excel report downloaded successfully!");
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to generate Excel file");
    }
  };

  // Print Executive Summary
  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="sd-loading-container">
        <div className="sd-spinner"></div>
        <p>Loading real-time sales intelligence...</p>
      </div>
    );
  }

  return (
    <div className="sales-dashboard-page">
      {/* Top Banner / Breadcrumb */}
      <div className="sd-header-bar">
        <div className="sd-title-section">
          <div className="sd-badge-superadmin">
            <ShieldCheck size={14} />
            <span>Super Admin Exclusive</span>
          </div>
          <h1 className="sd-page-title">
            <TrendingUp size={28} className="sd-title-icon" />
            Sales & Revenue Analytics
          </h1>
          <p className="sd-page-subtitle">
            Consolidated real-time intelligence on Order Sales, Walk-in POS, Payment Gateways, Credit Accounts & GST
          </p>
        </div>

        <div className="sd-header-actions">
          <button 
            className={`sd-btn sd-btn-secondary ${refreshing ? 'sd-refreshing' : ''}`}
            onClick={handleRefresh}
            title="Refresh Live Data"
          >
            <RefreshCw size={15} className={refreshing ? 'spin-icon' : ''} />
            <span>Refresh</span>
          </button>

          <button 
            className="sd-btn sd-btn-secondary"
            onClick={handlePrint}
            title="Print Executive Sales Summary"
          >
            <Printer size={15} />
            <span>Print Report</span>
          </button>

          <button 
            className="sd-btn sd-btn-primary"
            onClick={handleExportExcel}
            title="Download complete data as Excel"
          >
            <FileSpreadsheet size={15} />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Date Filter & Outlets Bar */}
      <div className="sd-controls-card">
        <div className="sd-date-filter-section">
          <div className="sd-filter-label-row">
            <span className="sd-control-label">
              <Calendar size={14} /> Date Range Filter:
            </span>
            <span className="sd-active-range-badge">
              {dateRange.label}
            </span>
          </div>

          {/* Preset Buttons requested by user: today, yesterday, this week, last week, this month, last month, this year, last year */}
          <div className="sd-date-pill-group">
            <button 
              className={`sd-date-pill ${dateFilter === 'today' ? 'active' : ''}`}
              onClick={() => setDateFilter('today')}
            >
              Today
            </button>
            <button 
              className={`sd-date-pill ${dateFilter === 'yesterday' ? 'active' : ''}`}
              onClick={() => setDateFilter('yesterday')}
            >
              Yesterday
            </button>
            <button 
              className={`sd-date-pill ${dateFilter === 'this_week' ? 'active' : ''}`}
              onClick={() => setDateFilter('this_week')}
            >
              This Week
            </button>
            <button 
              className={`sd-date-pill ${dateFilter === 'last_week' ? 'active' : ''}`}
              onClick={() => setDateFilter('last_week')}
            >
              Last Week
            </button>
            <button 
              className={`sd-date-pill ${dateFilter === 'this_month' ? 'active' : ''}`}
              onClick={() => setDateFilter('this_month')}
            >
              This Month
            </button>
            <button 
              className={`sd-date-pill ${dateFilter === 'last_month' ? 'active' : ''}`}
              onClick={() => setDateFilter('last_month')}
            >
              Last Month
            </button>
            <button 
              className={`sd-date-pill ${dateFilter === 'this_year' ? 'active' : ''}`}
              onClick={() => setDateFilter('this_year')}
            >
              This Year
            </button>
            <button 
              className={`sd-date-pill ${dateFilter === 'last_year' ? 'active' : ''}`}
              onClick={() => setDateFilter('last_year')}
            >
              Last Year
            </button>
            <button 
              className={`sd-date-pill ${dateFilter === 'custom' ? 'active' : ''}`}
              onClick={() => setDateFilter('custom')}
            >
              Custom Range
            </button>
          </div>

          {/* Custom Date Range Picker */}
          {dateFilter === 'custom' && (
            <motion.div 
              className="sd-custom-date-inputs"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="sd-date-input-group">
                <label>From Date:</label>
                <input 
                  type="date" 
                  value={customStartDate} 
                  onChange={(e) => setCustomStartDate(e.target.value)} 
                />
              </div>
              <div className="sd-date-input-group">
                <label>To Date:</label>
                <input 
                  type="date" 
                  value={customEndDate} 
                  onChange={(e) => setCustomEndDate(e.target.value)} 
                />
              </div>
              {(!customStartDate || !customEndDate) && (
                <span className="sd-custom-date-hint">Please choose start and end dates</span>
              )}
            </motion.div>
          )}
        </div>

        {/* Store / Outlet Selector */}
        <div className="sd-store-filter-section">
          <span className="sd-control-label">
            <StoreIcon size={14} /> Store / Outlet:
          </span>
          <select 
            className="sd-store-select"
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
          >
            <option value="all">🏬 All Stores & Outlets ({stores.length})</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name} {s.city ? `(${s.city})` : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ==================================================== */}
      {/* 4 HIGH IMPACT MASTER FINANCIAL METRIC TILES */}
      {/* ==================================================== */}
      <div className="sd-master-kpi-grid">
        {/* KPI 1: Gross Sales */}
        <motion.div 
          className="sd-kpi-card sd-kpi-primary"
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
        >
          <div className="sd-kpi-head">
            <div className="sd-kpi-icon-wrap primary">
              <DollarSign size={20} />
            </div>
            <span className="sd-kpi-tag">Gross Revenue</span>
          </div>
          <div className="sd-kpi-number">
            ₹{analytics.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="sd-kpi-sub">
            <span><b>{analytics.totalTransactions}</b> Total Transactions</span>
            <span className="sd-dot-sep">•</span>
            <span>Avg ₹{analytics.totalTransactions > 0 ? (analytics.totalSales / analytics.totalTransactions).toFixed(0) : '0'}</span>
          </div>
          <div className="sd-kpi-channel-pills">
            <span className="channel-pill walkin">Walk-in: ₹{analytics.walkInGross.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            <span className="channel-pill orders">Orders: ₹{analytics.orderSalesGross.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
        </motion.div>

        {/* KPI 2: Total Received / Collected */}
        <motion.div 
          className="sd-kpi-card sd-kpi-success"
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
        >
          <div className="sd-kpi-head">
            <div className="sd-kpi-icon-wrap success">
              <CheckCircle2 size={20} />
            </div>
            <span className="sd-kpi-tag success">Amount Received</span>
          </div>
          <div className="sd-kpi-number text-success">
            ₹{analytics.totalReceived.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="sd-kpi-sub">
            <span><b>{analytics.collectionRate.toFixed(1)}%</b> Realized Collection</span>
          </div>
          {/* Progress bar of collected vs total */}
          <div className="sd-kpi-bar-track">
            <div 
              className="sd-kpi-bar-fill success" 
              style={{ width: `${Math.min(100, analytics.collectionRate)}%` }}
            ></div>
          </div>
        </motion.div>

        {/* KPI 3: In Credit (Outstanding Dues) */}
        <motion.div 
          className="sd-kpi-card sd-kpi-danger"
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
        >
          <div className="sd-kpi-head">
            <div className="sd-kpi-icon-wrap danger">
              <Clock size={20} />
            </div>
            <span className="sd-kpi-tag danger">In Credit / Outstanding</span>
          </div>
          <div className="sd-kpi-number text-danger">
            ₹{analytics.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="sd-kpi-sub">
            <span><b>{analytics.creditOrders.length}</b> orders awaiting full settlement</span>
          </div>
          <div className="sd-kpi-channel-pills">
            <span className="channel-pill credit-note">
              {analytics.totalSales > 0 ? ((analytics.totalCredit / analytics.totalSales) * 100).toFixed(1) : 0}% of gross sales
            </span>
          </div>
        </motion.div>

        {/* KPI 4: GST Collected Amount */}
        <motion.div 
          className="sd-kpi-card sd-kpi-info"
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2 }}
        >
          <div className="sd-kpi-head">
            <div className="sd-kpi-icon-wrap info">
              <Percent size={20} />
            </div>
            <span className="sd-kpi-tag info">GST Collected (5%)</span>
          </div>
          <div className="sd-kpi-number text-info">
            ₹{analytics.totalGST.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="sd-kpi-sub">
            <span>Taxable Turnover: <b>₹{analytics.totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b></span>
          </div>
          <div className="sd-gst-breakdown-sub">
            <span>CGST (2.5%): <b>₹{analytics.cgst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b></span>
            <span>SGST (2.5%): <b>₹{analytics.sgst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b></span>
          </div>
        </motion.div>
      </div>

      {/* ==================================================== */}
      {/* SECTION 2: CHANNEL COMPARISON (ORDERS VS WALKIN SALES) */}
      {/* ==================================================== */}
      <div className="sd-channels-grid">
        {/* Card: Order Sales Deep Dive */}
        <div className="sd-card sd-channel-card">
          <div className="sd-card-header">
            <div className="sd-card-header-left">
              <div className="sd-icon-badge purple">
                <ShoppingBag size={18} />
              </div>
              <div>
                <h3 className="sd-card-title">Order Sales (Advance & Custom)</h3>
                <span className="sd-card-desc">Orders booked for catering, bulk events & advance pickup</span>
              </div>
            </div>
            <span className="sd-channel-count-badge">
              {analytics.orderCount} Orders
            </span>
          </div>

          <div className="sd-channel-stats-row">
            <div className="sd-channel-stat-item">
              <span className="label">Gross Booked Value</span>
              <span className="value">₹{analytics.orderSalesGross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="sd-channel-stat-item">
              <span className="label">Amount Received</span>
              <span className="value text-success">₹{analytics.orderSalesReceived.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="sd-channel-stat-item">
              <span className="label">In Credit (Balance)</span>
              <span className="value text-danger">₹{analytics.orderSalesCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="sd-channel-footer-metrics">
            <div className="footer-metric">
              <span>Average Order Value:</span>
              <b>₹{analytics.orderAOV.toFixed(0)}</b>
            </div>
            <div className="footer-metric">
              <span>GST Share (5%):</span>
              <b>₹{analytics.orderGST.toFixed(2)}</b>
            </div>
            <div className="footer-metric">
              <span>Channel Revenue Share:</span>
              <b>{analytics.totalSales > 0 ? ((analytics.orderSalesGross / analytics.totalSales) * 100).toFixed(1) : 0}%</b>
            </div>
          </div>
        </div>

        {/* Card: Walk-in Sales Deep Dive */}
        <div className="sd-card sd-channel-card">
          <div className="sd-card-header">
            <div className="sd-card-header-left">
              <div className="sd-icon-badge amber">
                <Receipt size={18} />
              </div>
              <div>
                <h3 className="sd-card-title">Walk-In Sales (POS Counter Billing)</h3>
                <span className="sd-card-desc">Direct counter sales across retail store outlets</span>
              </div>
            </div>
            <span className="sd-channel-count-badge amber">
              {analytics.walkInCount} Settled Bills
            </span>
          </div>

          <div className="sd-channel-stats-row">
            <div className="sd-channel-stat-item">
              <span className="label">Settled POS Revenue</span>
              <span className="value">₹{analytics.walkInGross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="sd-channel-stat-item">
              <span className="label">100% Received</span>
              <span className="value text-success">₹{analytics.walkInReceived.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="sd-channel-stat-item">
              <span className="label">Saved / Parked Drafts</span>
              <span className="value" style={{ color: '#d97706' }}>
                {analytics.savedBillsCount} bills (₹{analytics.savedBillsGross.toFixed(0)})
              </span>
            </div>
          </div>

          <div className="sd-channel-footer-metrics">
            <div className="footer-metric">
              <span>Average Bill Value:</span>
              <b>₹{analytics.walkInAOV.toFixed(0)}</b>
            </div>
            <div className="footer-metric">
              <span>GST Share (5%):</span>
              <b>₹{analytics.walkInGST.toFixed(2)}</b>
            </div>
            <div className="footer-metric">
              <span>Channel Revenue Share:</span>
              <b>{analytics.totalSales > 0 ? ((analytics.walkInGross / analytics.totalSales) * 100).toFixed(1) : 0}%</b>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* SECTION 3: PAYMENT METHOD ANALYTICS (UPI, CARD, CASH) */}
      {/* ==================================================== */}
      <div className="sd-card sd-payments-card">
        <div className="sd-card-header">
          <div className="sd-card-header-left">
            <div className="sd-icon-badge blue">
              <CreditCard size={18} />
            </div>
            <div>
              <h3 className="sd-card-title">Payment Method Analytics & Gateway Splits</h3>
              <span className="sd-card-desc">Collected funds distribution across UPI, Cash, Cards and Split payments</span>
            </div>
          </div>
          <div className="sd-total-collected-pill">
            Total Collected: <b>₹{analytics.totalReceived.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b>
          </div>
        </div>

        <div className="sd-payment-methods-grid">
          {/* Method 1: UPI Payments */}
          <div className="sd-method-box upi">
            <div className="sd-method-box-header">
              <div className="sd-method-icon-wrap upi">
                <Smartphone size={20} />
              </div>
              <div className="sd-method-title-wrap">
                <h4>UPI / QR / Digital</h4>
                <span>GPay, PhonePe, Paytm, BharatPe</span>
              </div>
              <span className="sd-method-percent-tag upi">
                {analytics.upiPercent.toFixed(1)}%
              </span>
            </div>

            <div className="sd-method-amount">
              ₹{analytics.upiTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>

            <div className="sd-method-bar">
              <div 
                className="sd-method-bar-fill upi" 
                style={{ width: `${analytics.upiPercent}%` }}
              ></div>
            </div>

            <div className="sd-method-sub-splits">
              <div className="sub-split">
                <span>Walk-in POS:</span>
                <b>₹{analytics.walkInUpi.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
              </div>
              <div className="sub-split">
                <span>Orders:</span>
                <b>₹{analytics.orderUpi.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
              </div>
              <div className="sub-split">
                <span>Tx Count:</span>
                <b>{analytics.upiTxCount}</b>
              </div>
            </div>
          </div>

          {/* Method 2: Cash Payments */}
          <div className="sd-method-box cash">
            <div className="sd-method-box-header">
              <div className="sd-method-icon-wrap cash">
                <DollarSign size={20} />
              </div>
              <div className="sd-method-title-wrap">
                <h4>Cash Currency</h4>
                <span>Physical store counter currency</span>
              </div>
              <span className="sd-method-percent-tag cash">
                {analytics.cashPercent.toFixed(1)}%
              </span>
            </div>

            <div className="sd-method-amount">
              ₹{analytics.cashTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>

            <div className="sd-method-bar">
              <div 
                className="sd-method-bar-fill cash" 
                style={{ width: `${analytics.cashPercent}%` }}
              ></div>
            </div>

            <div className="sd-method-sub-splits">
              <div className="sub-split">
                <span>Walk-in POS:</span>
                <b>₹{analytics.walkInCash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
              </div>
              <div className="sub-split">
                <span>Orders:</span>
                <b>₹{analytics.orderCash.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
              </div>
              <div className="sub-split">
                <span>Tx Count:</span>
                <b>{analytics.cashTxCount}</b>
              </div>
            </div>
          </div>

          {/* Method 3: Credit / Debit Cards */}
          <div className="sd-method-box card">
            <div className="sd-method-box-header">
              <div className="sd-method-icon-wrap card">
                <CreditCard size={20} />
              </div>
              <div className="sd-method-title-wrap">
                <h4>Credit & Debit Cards</h4>
                <span>EDC Swiping Machines / POS</span>
              </div>
              <span className="sd-method-percent-tag card">
                {analytics.cardPercent.toFixed(1)}%
              </span>
            </div>

            <div className="sd-method-amount">
              ₹{analytics.cardTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>

            <div className="sd-method-bar">
              <div 
                className="sd-method-bar-fill card" 
                style={{ width: `${analytics.cardPercent}%` }}
              ></div>
            </div>

            <div className="sd-method-sub-splits">
              <div className="sub-split">
                <span>Walk-in POS:</span>
                <b>₹{analytics.walkInCard.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
              </div>
              <div className="sub-split">
                <span>Orders:</span>
                <b>₹{analytics.orderCard.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
              </div>
              <div className="sub-split">
                <span>Tx Count:</span>
                <b>{analytics.cardTxCount}</b>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* SECTION 4: GST INTELLIGENCE & OUTLETS PERFORMANCE */}
      {/* ==================================================== */}
      <div className="sd-channels-grid">
        {/* GST Tax Compliance Summary */}
        <div className="sd-card">
          <div className="sd-card-header">
            <div className="sd-card-header-left">
              <div className="sd-icon-badge green">
                <Percent size={18} />
              </div>
              <div>
                <h3 className="sd-card-title">GST Tax Collection Details (5%)</h3>
                <span className="sd-card-desc">Statutory GST tax breakdown for filing & accounting compliance</span>
              </div>
            </div>
          </div>

          <div className="sd-gst-table-card">
            <div className="sd-gst-row">
              <span className="gst-label">Total Gross Sales Turnover (GST Incl.)</span>
              <span className="gst-val bold">₹{analytics.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="sd-gst-row">
              <span className="gst-label">Net Taxable Value (Base Turnover)</span>
              <span className="gst-val">₹{analytics.totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="sd-gst-row highlight">
              <span className="gst-label">Total GST Collected (5.0%)</span>
              <span className="gst-val bold text-info">₹{analytics.totalGST.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="sd-gst-subrow">
              <div className="sub-gst-item">
                <span>Central GST (CGST - 2.5%):</span>
                <b>₹{analytics.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b>
              </div>
              <div className="sub-gst-item">
                <span>State GST (SGST - 2.5%):</span>
                <b>₹{analytics.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b>
              </div>
            </div>
          </div>

          <div className="sd-gst-origin-row">
            <div className="gst-origin-box">
              <span>GST from Walk-in POS:</span>
              <b>₹{analytics.walkInGST.toFixed(2)}</b>
            </div>
            <div className="gst-origin-box">
              <span>GST from Order Advance:</span>
              <b>₹{analytics.orderGST.toFixed(2)}</b>
            </div>
          </div>
        </div>

        {/* Store / Outlet Sales Leaderboard */}
        <div className="sd-card">
          <div className="sd-card-header">
            <div className="sd-card-header-left">
              <div className="sd-icon-badge violet">
                <StoreIcon size={18} />
              </div>
              <div>
                <h3 className="sd-card-title">Outlet & Store Sales Leaderboard</h3>
                <span className="sd-card-desc">Comparative revenue and collection efficiency across locations</span>
              </div>
            </div>
          </div>

          <div className="sd-store-leaderboard-list">
            {analytics.storePerformance.length > 0 ? (
              analytics.storePerformance.map((st, idx) => {
                const share = analytics.totalSales > 0 ? (st.totalSales / analytics.totalSales) * 100 : 0;
                return (
                  <div key={st.id || idx} className="sd-store-rank-item">
                    <div className="store-rank-top">
                      <div className="store-name-group">
                        <span className="rank-num">#{idx + 1}</span>
                        <span className="store-name">{st.tradeName || st.name}</span>
                        <span className="store-counts">({st.orderCount} orders • {st.walkInCount} walk-in)</span>
                      </div>
                      <div className="store-sales-amt">
                        ₹{st.totalSales.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        <span className="share-pct">({share.toFixed(1)}%)</span>
                      </div>
                    </div>
                    <div className="store-progress-track">
                      <div 
                        className="store-progress-fill" 
                        style={{ width: `${Math.min(100, (st.totalSales / (analytics.storePerformance[0]?.totalSales || 1)) * 100)}%` }}
                      ></div>
                    </div>
                    <div className="store-rank-sub">
                      <span className="text-success">Received: ₹{st.received.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                      {st.credit > 0 && (
                        <span className="text-danger">Credit: ₹{st.credit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="sd-empty-state">
                <Building2 size={32} opacity={0.3} />
                <p>No sales recorded across outlets for the selected date range.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* SECTION 5: OUTSTANDING CREDIT RECEIVABLES TABLE */}
      {/* ==================================================== */}
      {analytics.creditOrders.length > 0 && (
        <div className="sd-card sd-credit-orders-card">
          <div className="sd-card-header">
            <div className="sd-card-header-left">
              <div className="sd-icon-badge danger">
                <Clock size={18} />
              </div>
              <div>
                <h3 className="sd-card-title text-danger">Outstanding Credit Receivables</h3>
                <span className="sd-card-desc">Orders pending settlement in the active date filter ({analytics.creditOrders.length} accounts)</span>
              </div>
            </div>
            <div className="sd-total-credit-badge">
              Total Outstanding: <b>₹{analytics.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b>
            </div>
          </div>

          <div className="sd-table-responsive">
            <table className="sd-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer Info</th>
                  <th>Outlet Store</th>
                  <th>Order Total</th>
                  <th>Received</th>
                  <th>Balance Due (Credit)</th>
                  <th>Payment Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {analytics.creditOrders.slice(0, 10).map(o => {
                  const d = extractRecordDate(o);
                  return (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 700, color: 'var(--primary-color)' }}>
                        #{o.orderId || o.id}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{o.customerName || 'Customer'}</div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>
                          <Phone size={10} style={{ display: 'inline', marginRight: '4px' }} />
                          {o.customerPhone || '—'}
                        </div>
                      </td>
                      <td>{o.storeName || 'Main Store'}</td>
                      <td style={{ fontWeight: 600 }}>₹{Number(o.totalAmount || 0).toFixed(2)}</td>
                      <td style={{ color: '#059669', fontWeight: 600 }}>₹{Number(o.receivedAmount || 0).toFixed(2)}</td>
                      <td style={{ color: '#dc2626', fontWeight: 700, fontSize: '14px' }}>
                        ₹{Number(o.balanceDue || 0).toFixed(2)}
                      </td>
                      <td>
                        <span className={`sd-status-pill ${o.paymentStatus?.toLowerCase() || 'pending'}`}>
                          {o.paymentStatus || 'Pending'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className="sd-btn-xs"
                          onClick={() => setSelectedTx({
                            type: 'Order',
                            recordId: o.orderId || o.id,
                            customerName: o.customerName,
                            customerPhone: o.customerPhone,
                            storeName: o.storeName,
                            totalAmount: o.totalAmount,
                            receivedAmount: o.receivedAmount,
                            balanceDue: o.balanceDue,
                            paymentMode: o.paymentMode,
                            paymentStatus: o.paymentStatus,
                            dateFormatted: d ? d.toLocaleDateString('en-IN') : '—',
                            raw: o
                          })}
                        >
                          <Eye size={12} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {analytics.creditOrders.length > 10 && (
            <div className="sd-table-footer-hint">
              Showing top 10 outstanding accounts out of {analytics.creditOrders.length} total. Switch to "Credit Only" tab below to search all.
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* SECTION 6: UNIFIED LIVE TRANSACTIONS DATA FEED */}
      {/* ==================================================== */}
      <div className="sd-card">
        <div className="sd-card-header" style={{ flexWrap: 'wrap', gap: '15px' }}>
          <div className="sd-card-header-left">
            <div className="sd-icon-badge purple">
              <Layers size={18} />
            </div>
            <div>
              <h3 className="sd-card-title">All Sales & Billing Transactions</h3>
              <span className="sd-card-desc">Combined searchable ledger of Orders and Walk-In POS Bills ({unifiedTransactions.length} records)</span>
            </div>
          </div>

          {/* Search & Tabs Toolbar */}
          <div className="sd-table-controls">
            <div className="sd-search-box">
              <Search size={14} color="#6b7280" />
              <input 
                type="text" 
                placeholder="Search by ID, Customer, Phone, Store..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="sd-clear-btn">
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="sd-tab-pills">
              <button 
                className={`sd-tab-pill ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                All ({filteredOrders.length + filteredBills.length})
              </button>
              <button 
                className={`sd-tab-pill ${activeTab === 'orders' ? 'active' : ''}`}
                onClick={() => setActiveTab('orders')}
              >
                Orders ({filteredOrders.length})
              </button>
              <button 
                className={`sd-tab-pill ${activeTab === 'walkin' ? 'active' : ''}`}
                onClick={() => setActiveTab('walkin')}
              >
                Walk-in ({filteredBills.length})
              </button>
              <button 
                className={`sd-tab-pill ${activeTab === 'credit' ? 'active' : ''}`}
                onClick={() => setActiveTab('credit')}
              >
                Credit Only ({analytics.creditOrders.length})
              </button>
            </div>
          </div>
        </div>

        {/* Unified Table */}
        <div className="sd-table-responsive">
          {unifiedTransactions.length > 0 ? (
            <table className="sd-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Invoice / Order ID</th>
                  <th>Date & Time</th>
                  <th>Customer Info</th>
                  <th>Outlet Store</th>
                  <th>Gross Total</th>
                  <th>Received</th>
                  <th>Credit / Due</th>
                  <th>Payment Mode</th>
                  <th>GST (5%)</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {unifiedTransactions.map((tx) => (
                  <tr key={`${tx.type}-${tx.id}`}>
                    <td>
                      <span className={`sd-type-badge ${tx.type === 'Order' ? 'order' : 'walkin'}`}>
                        {tx.type === 'Order' ? <ShoppingBag size={11} /> : <Receipt size={11} />}
                        {tx.type}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--primary-color)' }}>
                      #{tx.recordId}
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', fontWeight: 600 }}>{tx.dateFormatted}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>{tx.timeFormatted}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{tx.customerName}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>{tx.customerPhone}</div>
                    </td>
                    <td>{tx.storeName}</td>
                    <td style={{ fontWeight: 700 }}>₹{tx.totalAmount.toFixed(2)}</td>
                    <td style={{ color: '#059669', fontWeight: 600 }}>₹{tx.receivedAmount.toFixed(2)}</td>
                    <td>
                      {tx.balanceDue > 0 ? (
                        <span style={{ color: '#dc2626', fontWeight: 700 }}>₹{tx.balanceDue.toFixed(2)}</span>
                      ) : (
                        <span style={{ color: '#6b7280', fontSize: '12px' }}>Settled</span>
                      )}
                    </td>
                    <td>
                      <span className="sd-mode-badge">
                        {tx.paymentMode}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: '#4b5563' }}>
                      ₹{tx.gstAmount.toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        className="sd-btn-xs"
                        onClick={() => setSelectedTx(tx)}
                        title="View Details"
                      >
                        <Eye size={12} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="sd-empty-state">
              <Receipt size={36} opacity={0.3} />
              <h4>No transactions found</h4>
              <p>There are no orders or walk-in bills matching the current filters and date range.</p>
            </div>
          )}
        </div>
      </div>

      {/* ==================================================== */}
      {/* TRANSACTION PREVIEW MODAL */}
      {/* ==================================================== */}
      <AnimatePresence>
        {selectedTx && (
          <div className="sd-modal-overlay" onClick={() => setSelectedTx(null)}>
            <motion.div 
              className="sd-modal-card"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="sd-modal-header">
                <div>
                  <span className={`sd-type-badge ${selectedTx.type === 'Order' ? 'order' : 'walkin'}`}>
                    {selectedTx.type} Record
                  </span>
                  <h3 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800 }}>
                    #{selectedTx.recordId}
                  </h3>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>
                    {selectedTx.storeName} • {selectedTx.dateFormatted} {selectedTx.timeFormatted}
                  </span>
                </div>
                <button 
                  className="sd-modal-close"
                  onClick={() => setSelectedTx(null)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="sd-modal-body">
                {/* Customer Row */}
                <div className="sd-modal-meta-grid">
                  <div className="meta-box">
                    <span className="lbl">Customer Name</span>
                    <span className="val">{selectedTx.customerName || 'Walk-in'}</span>
                  </div>
                  <div className="meta-box">
                    <span className="lbl">Contact Phone</span>
                    <span className="val">{selectedTx.customerPhone || '—'}</span>
                  </div>
                  <div className="meta-box">
                    <span className="lbl">Payment Mode</span>
                    <span className="val">{selectedTx.paymentMode}</span>
                  </div>
                  <div className="meta-box">
                    <span className="lbl">Status</span>
                    <span className="val">{selectedTx.status || selectedTx.paymentStatus}</span>
                  </div>
                </div>

                {/* Items in this record */}
                {selectedTx.raw?.items && selectedTx.raw.items.length > 0 && (
                  <div className="sd-modal-items-section">
                    <h4 style={{ fontSize: '13px', margin: '0 0 8px', color: '#374151' }}>
                      Items in this {selectedTx.type} ({selectedTx.raw.items.length}):
                    </h4>
                    <table className="sd-items-subtable">
                      <thead>
                        <tr>
                          <th>Item Name</th>
                          <th style={{ textAlign: 'center' }}>Qty</th>
                          <th style={{ textAlign: 'right' }}>Price</th>
                          <th style={{ textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTx.raw.items.map((it, i) => (
                          <tr key={i}>
                            <td>{it.name || 'Product'}</td>
                            <td style={{ textAlign: 'center' }}>
                              {it.quantity} {it.unit || 'pcs'}
                            </td>
                            <td style={{ textAlign: 'right' }}>₹{Number(it.price || 0).toFixed(2)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                              ₹{Number(it.total != null ? it.total : (Number(it.price || 0) * Number(it.quantity || 1))).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Financial Summary Box */}
                <div className="sd-modal-totals">
                  <div className="tot-row">
                    <span>Gross Total:</span>
                    <b>₹{selectedTx.totalAmount.toFixed(2)}</b>
                  </div>
                  <div className="tot-row">
                    <span>Amount Received:</span>
                    <b style={{ color: '#059669' }}>₹{selectedTx.receivedAmount.toFixed(2)}</b>
                  </div>
                  <div className="tot-row">
                    <span>Credit / Balance Due:</span>
                    <b style={{ color: selectedTx.balanceDue > 0 ? '#dc2626' : '#6b7280' }}>
                      ₹{selectedTx.balanceDue.toFixed(2)}
                    </b>
                  </div>
                  <div className="tot-row gst">
                    <span>GST Included (5%):</span>
                    <b>₹{selectedTx.gstAmount.toFixed(2)}</b>
                  </div>
                </div>
              </div>

              <div className="sd-modal-footer">
                <button 
                  className="sd-btn sd-btn-secondary"
                  onClick={() => setSelectedTx(null)}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SalesDashboard;
