import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Building2, 
  ShoppingBag, 
  Receipt, 
  Search, 
  Calendar, 
  Store as StoreIcon, 
  Printer, 
  FileText, 
  Filter, 
  Download, 
  ChevronDown, 
  ChevronUp, 
  User, 
  Phone, 
  MapPin, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  CreditCard, 
  X, 
  Check,
  ExternalLink,
  DollarSign,
  ArrowUpDown,
  RefreshCw
} from 'lucide-react';
import { db } from '../../config/firebase';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { usePrinter } from '../../context/PrinterContext';
import { generateGSTInvoice, getInvoiceHtml } from '../../utils/invoice';
import { generateReceiptHTML, generateOrderReceiptHTML } from '../../utils/printReceiptHelper';
import { formatPaymentModeDisplay } from '../../components/SplitPaymentSelector/SplitPaymentSelector';
import './B2BInvoices.css';

// Helper to normalize phone numbers for robust matching
const normalizePhone = (phone) => {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '').slice(-10);
};

// Robust record date extractor (Timestamp, billDate, date string, deliveryDate)
const getRecordDate = (record) => {
  if (!record) return null;

  // 1. Firestore Timestamp
  if (record.createdAt) {
    if (typeof record.createdAt.toDate === 'function') {
      return record.createdAt.toDate();
    }
    if (record.createdAt.seconds) {
      return new Date(record.createdAt.seconds * 1000);
    }
  }

  // 2. ISO or YYYY-MM-DD in billDate or date
  if (record.billDate && typeof record.billDate === 'string') {
    const parts = record.billDate.split('-').map(Number);
    if (parts.length === 3) {
      return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    }
  }

  // 3. Date string (DD/MM/YYYY or YYYY-MM-DD)
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

// Format date helper
const formatDisplayDate = (record) => {
  const d = getRecordDate(record);
  if (!d || isNaN(d.getTime())) return record.date || record.deliveryDate || '-';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const formatDisplayTime = (record) => {
  if (record.deliveryTime) return record.deliveryTime;
  const d = getRecordDate(record);
  if (!d || isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

// Custom Searchable Dropdown for B2B Customers
const CustomerSearchDropdown = ({ 
  customers, 
  selectedCustomerId, 
  onSelectCustomer, 
  onClearCustomer 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close on click outside or Escape key
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 50);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectedCustomer = useMemo(() => {
    if (selectedCustomerId === 'all') return null;
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [selectedCustomerId, customers]);

  // Filter options by search term (name, phone, business, gst)
  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) return customers;
    const q = searchTerm.toLowerCase().trim();
    const qDigits = q.replace(/\D/g, '');

    return customers.filter(c => {
      const name = `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase();
      const biz = (c.businessName || c.companyName || '').toLowerCase();
      const phone = String(c.mobileNumber || c.phone || '').toLowerCase();
      const gst = String(c.gstNumber || c.gst || '').toLowerCase();

      return (
        name.includes(q) ||
        biz.includes(q) ||
        gst.includes(q) ||
        phone.includes(q) ||
        (qDigits && phone.replace(/\D/g, '').includes(qDigits))
      );
    });
  }, [customers, searchTerm]);

  return (
    <div className="b2b-cust-dd-container" ref={dropdownRef}>
      {/* Trigger Button */}
      <div 
        className={`b2b-cust-dd-trigger ${isOpen ? 'active' : ''} ${selectedCustomer ? 'has-selection' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Select B2B Customer"
      >
        <div className="b2b-cust-dd-trigger-left">
          <Building2 size={14} className="b2b-cust-dd-icon" />
          <span className="b2b-cust-dd-label">
            {selectedCustomer ? (
              <>
                <strong className="b2b-cust-dd-selected-biz">
                  {selectedCustomer.businessName || `${selectedCustomer.firstName} ${selectedCustomer.lastName || ''}`}
                </strong>
                {selectedCustomer.mobileNumber && (
                  <span className="b2b-cust-dd-selected-phone">
                    • {selectedCustomer.mobileNumber}
                  </span>
                )}
              </>
            ) : (
              `All B2B Customers (${customers.length})`
            )}
          </span>
        </div>

        <div className="b2b-cust-dd-trigger-right">
          {selectedCustomer && (
            <span
              className="b2b-cust-dd-clear-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClearCustomer();
              }}
              title="Clear customer filter"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} className={`b2b-cust-dd-chevron ${isOpen ? 'open' : ''}`} />
        </div>
      </div>

      {/* Popover */}
      {isOpen && (
        <div className="b2b-cust-dd-popover">
          {/* Popover Search Bar */}
          <div className="b2b-cust-dd-search-header">
            <Search size={14} className="b2b-cust-dd-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="b2b-cust-dd-search-input"
              placeholder="Search customer name or mobile number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            {searchTerm && (
              <button
                className="b2b-cust-dd-search-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchTerm('');
                  if (searchInputRef.current) searchInputRef.current.focus();
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="b2b-cust-dd-list">
            {/* "All Customers" Option */}
            <div
              className={`b2b-cust-dd-item all-option ${selectedCustomerId === 'all' ? 'selected' : ''}`}
              onClick={() => {
                onSelectCustomer('all');
                setIsOpen(false);
                setSearchTerm('');
              }}
            >
              <div className="b2b-cust-dd-item-info">
                <span className="b2b-cust-dd-name">🏢 All B2B Customers</span>
                <span className="b2b-cust-dd-phone">Show orders and sales from all {customers.length} B2B accounts</span>
              </div>
              {selectedCustomerId === 'all' && (
                <Check size={14} className="b2b-cust-dd-check" />
              )}
            </div>

            <div className="b2b-cust-dd-divider"></div>

            {/* Filtered Customer Options */}
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map(cust => {
                const isSelected = cust.id === selectedCustomerId;
                return (
                  <div
                    key={cust.id}
                    className={`b2b-cust-dd-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      onSelectCustomer(cust.id);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                  >
                    <div className="b2b-cust-dd-item-info">
                      <div className="b2b-cust-dd-item-top">
                        <span className="b2b-cust-dd-name">
                          {cust.businessName || `${cust.firstName} ${cust.lastName || ''}`}
                        </span>
                        <span className="b2b-cust-dd-badge">B2B</span>
                      </div>
                      <div className="b2b-cust-dd-item-sub">
                        <span>{cust.firstName} {cust.lastName || ''}</span>
                        {cust.mobileNumber && (
                          <>
                            <span>•</span>
                            <span className="b2b-cust-dd-phone-highlight">📞 {cust.mobileNumber}</span>
                          </>
                        )}
                        {cust.gstNumber && (
                          <>
                            <span>•</span>
                            <span className="b2b-cust-dd-gst">GST: {cust.gstNumber}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check size={14} className="b2b-cust-dd-check" />
                    )}
                  </div>
                );
              })
            ) : (
              <div className="b2b-cust-dd-empty">
                <span>No customer found matching "{searchTerm}"</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const B2BInvoices = () => {
  // State for raw data
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [bills, setBills] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Tab: 'orders' | 'walkin'
  const [activeTab, setActiveTab] = useState('orders');

  // Customer Filtering
  const [selectedCustomerId, setSelectedCustomerId] = useState('all');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Date Filtering: 'this-month' (DEFAULT) | 'last-month' | 'custom' | 'all'
  const [dateFilterMode, setDateFilterMode] = useState('this-month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Outlet / Store Filter
  const [selectedStoreId, setSelectedStoreId] = useState('all');

  // Status Filter
  const [orderPaymentStatusFilter, setOrderPaymentStatusFilter] = useState('all'); // all, Done, Partial, Pending
  const [walkinStatusFilter, setWalkinStatusFilter] = useState('all'); // all, settled, saved

  // UI accordion & preview
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [previewInvoiceModal, setPreviewInvoiceModal] = useState(null); // { type: 'order'|'walkin', data: record }

  const { printHTMLContent } = usePrinter();

  // 1. Fetch Customers
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const qCust = query(collection(db, 'customers'), orderBy('firstName', 'asc'));
        const unsubscribe = onSnapshot(qCust, (snapshot) => {
          const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setCustomers(list);
        });
        return () => unsubscribe();
      } catch (err) {
        console.error("Error fetching customers:", err);
      }
    };
    fetchCustomers();
  }, []);

  // 2. Fetch Stores
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'stores'), orderBy('name', 'asc')));
        setStores(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Error fetching stores:", err);
      }
    };
    fetchStores();
  }, []);

  // 3. Fetch Orders (real-time)
  useEffect(() => {
    const qOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(qOrders, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(list);
    }, (err) => {
      console.error("Orders subscription error:", err);
    });
    return () => unsubscribe();
  }, []);

  // 4. Fetch Bills (root + subcollection fallback)
  useEffect(() => {
    setLoading(true);
    const qBills = query(collection(db, 'bills'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(qBills, async (snapshot) => {
      let rootBills = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Also merge any store subcollection bills that might not be in root
      try {
        const storeSnap = await getDocs(collection(db, 'stores'));
        const subBills = [];
        for (const sDoc of storeSnap.docs) {
          const sId = sDoc.id;
          const sName = sDoc.data().name || 'Store';
          const bSnap = await getDocs(collection(db, 'stores', sId, 'bills'));
          bSnap.docs.forEach(bDoc => {
            subBills.push({
              id: bDoc.id,
              storeId: sId,
              storeName: sName,
              status: 'settled',
              ...bDoc.data()
            });
          });
        }

        // Merge and deduplicate by billId or id
        const billMap = new Map();
        rootBills.forEach(b => {
          const key = b.billId || b.id;
          if (key) billMap.set(key, b);
        });
        subBills.forEach(b => {
          const key = b.billId || b.id;
          if (key && !billMap.has(key)) {
            billMap.set(key, b);
          }
        });

        const allMerged = Array.from(billMap.values());
        allMerged.sort((a, b) => {
          const dateA = getRecordDate(a)?.getTime() || 0;
          const dateB = getRecordDate(b)?.getTime() || 0;
          return dateB - dateA;
        });

        setBills(allMerged);
      } catch (err) {
        console.error("Error fetching subcollection bills:", err);
        setBills(rootBills);
      } finally {
        setLoading(false);
      }
    }, (err) => {
      console.error("Bills subscription error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Create B2B Customer lookup sets and maps
  const { b2bCustomers, b2bCustomerIds, b2bCustomerPhones, customerLookup } = useMemo(() => {
    const b2bList = [];
    const ids = new Set();
    const phones = new Set();
    const lookup = new Map();

    customers.forEach(c => {
      lookup.set(c.id, c);
      const isB2B = Boolean(
        c.isB2B === true || 
        c.isB2B === 'true' || 
        c.businessName || 
        c.gstNumber || 
        c.companyName
      );

      if (isB2B) {
        b2bList.push(c);
        ids.add(c.id);
        const normPhone = normalizePhone(c.mobileNumber || c.phone);
        if (normPhone) phones.add(normPhone);
      }
    });

    return {
      b2bCustomers: b2bList,
      b2bCustomerIds: ids,
      b2bCustomerPhones: phones,
      customerLookup: lookup
    };
  }, [customers]);

  // Determine if a record belongs to B2B
  const isB2BRecord = (record) => {
    if (!record) return false;

    // Direct flag
    if (record.isB2B === true || record.isB2B === 'true') return true;

    // Direct B2B fields
    if (record.businessName || record.companyName || record.gstNumber || record.customerGst) return true;

    // Customer ID match with known B2B customers
    if (record.customerId && b2bCustomerIds.has(record.customerId)) return true;

    // Customer Phone match with known B2B customers
    const phone = normalizePhone(record.customerPhone || record.phone || record.customerMobile);
    if (phone && b2bCustomerPhones.has(phone)) return true;

    return false;
  };

  // Calculate Date Boundaries
  const dateRange = useMemo(() => {
    const now = new Date();

    if (dateFilterMode === 'this-month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }

    if (dateFilterMode === 'last-month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }

    if (dateFilterMode === 'custom') {
      const start = customStartDate ? new Date(`${customStartDate}T00:00:00`) : null;
      const end = customEndDate ? new Date(`${customEndDate}T23:59:59.999`) : null;
      return { start, end };
    }

    // 'all'
    return { start: null, end: null };
  }, [dateFilterMode, customStartDate, customEndDate]);

  // Check if a record falls within the active date range
  const matchesDateRange = (record) => {
    if (dateFilterMode === 'all') return true;
    const rDate = getRecordDate(record);
    if (!rDate || isNaN(rDate.getTime())) {
      // If date is unparseable and filtering is active, include if no date boundaries set
      return !dateRange.start && !dateRange.end;
    }

    if (dateRange.start && rDate < dateRange.start) return false;
    if (dateRange.end && rDate > dateRange.end) return false;
    return true;
  };

  // Selected customer object (if a single customer is picked from dropdown)
  const activeCustomerObj = useMemo(() => {
    if (selectedCustomerId === 'all') return null;
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [selectedCustomerId, customers]);

  // Filter B2B Orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // 1. Must be B2B
      if (!isB2BRecord(order)) return false;

      // 2. Date Filter
      if (!matchesDateRange(order)) return false;

      // 3. Store Filter
      if (selectedStoreId !== 'all' && order.storeId !== selectedStoreId) return false;

      // 4. Payment Status Filter
      if (orderPaymentStatusFilter !== 'all') {
        const pStatus = (order.paymentStatus || 'Pending').toLowerCase();
        if (orderPaymentStatusFilter.toLowerCase() !== pStatus) return false;
      }

      // 5. Selected Customer Dropdown Filter
      if (selectedCustomerId !== 'all') {
        const matchesId = order.customerId === selectedCustomerId;
        const custPhone = normalizePhone(activeCustomerObj?.mobileNumber);
        const orderPhone = normalizePhone(order.customerPhone);
        const matchesPhone = custPhone && orderPhone && custPhone === orderPhone;
        if (!matchesId && !matchesPhone) return false;
      }

      // 6. Free-text Customer Search (Name, Phone, Business Name, GST)
      if (customerSearchQuery.trim()) {
        const query = customerSearchQuery.toLowerCase().trim();
        const normQueryDigits = query.replace(/\D/g, '');

        const custName = (order.customerName || '').toLowerCase();
        const bizName = (order.businessName || order.companyName || '').toLowerCase();
        const phone = (order.customerPhone || '').toLowerCase();
        const gst = (order.gstNumber || order.customerGst || '').toLowerCase();
        const ordId = (order.orderId || '').toLowerCase();
        const serialNo = String(order.serialNumber || '');

        const matchesQuery = 
          custName.includes(query) ||
          bizName.includes(query) ||
          gst.includes(query) ||
          ordId.includes(query) ||
          serialNo.includes(query) ||
          phone.includes(query) ||
          (normQueryDigits && phone.replace(/\D/g, '').includes(normQueryDigits));

        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [
    orders, 
    b2bCustomerIds, 
    b2bCustomerPhones, 
    dateFilterMode, 
    dateRange, 
    selectedStoreId, 
    orderPaymentStatusFilter, 
    selectedCustomerId, 
    activeCustomerObj, 
    customerSearchQuery
  ]);

  // Filter B2B Walk-In Sales (Bills)
  const filteredBills = useMemo(() => {
    return bills.filter(bill => {
      // 1. Must be B2B
      if (!isB2BRecord(bill)) return false;

      // 2. Date Filter
      if (!matchesDateRange(bill)) return false;

      // 3. Store Filter
      if (selectedStoreId !== 'all' && bill.storeId !== selectedStoreId) return false;

      // 4. Walk-in Status Filter (settled, saved)
      if (walkinStatusFilter !== 'all') {
        const bStatus = (bill.status || 'settled').toLowerCase();
        if (walkinStatusFilter.toLowerCase() !== bStatus) return false;
      }

      // 5. Selected Customer Dropdown Filter
      if (selectedCustomerId !== 'all') {
        const matchesId = bill.customerId === selectedCustomerId;
        const custPhone = normalizePhone(activeCustomerObj?.mobileNumber);
        const billPhone = normalizePhone(bill.customerPhone);
        const matchesPhone = custPhone && billPhone && custPhone === billPhone;
        if (!matchesId && !matchesPhone) return false;
      }

      // 6. Free-text Customer Search (Name, Phone, Business Name, GST, Bill ID)
      if (customerSearchQuery.trim()) {
        const query = customerSearchQuery.toLowerCase().trim();
        const normQueryDigits = query.replace(/\D/g, '');

        const custName = (bill.customerName || '').toLowerCase();
        const bizName = (bill.companyName || bill.businessName || '').toLowerCase();
        const phone = (bill.customerPhone || '').toLowerCase();
        const gst = (bill.customerGst || bill.gstNumber || '').toLowerCase();
        const billId = (bill.billId || '').toLowerCase();

        const matchesQuery = 
          custName.includes(query) ||
          bizName.includes(query) ||
          gst.includes(query) ||
          billId.includes(query) ||
          phone.includes(query) ||
          (normQueryDigits && phone.replace(/\D/g, '').includes(normQueryDigits));

        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [
    bills, 
    b2bCustomerIds, 
    b2bCustomerPhones, 
    dateFilterMode, 
    dateRange, 
    selectedStoreId, 
    walkinStatusFilter, 
    selectedCustomerId, 
    activeCustomerObj, 
    customerSearchQuery
  ]);

  // High-Level Aggregate Metrics
  const metrics = useMemo(() => {
    // Orders
    const totalOrdersCount = filteredOrders.length;
    const totalOrdersAmount = filteredOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const totalOrdersReceived = filteredOrders.reduce((sum, o) => sum + (Number(o.receivedAmount) || 0), 0);
    const totalOrdersDue = Math.max(0, totalOrdersAmount - totalOrdersReceived);

    // Walk-In Bills (settled)
    const settledBills = filteredBills.filter(b => (b.status || 'settled') === 'settled');
    const totalWalkinCount = settledBills.length;
    const totalWalkinAmount = settledBills.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);

    // Combined
    const totalCombinedRevenue = totalOrdersAmount + totalWalkinAmount;
    const totalTransactions = totalOrdersCount + totalWalkinCount;

    return {
      totalOrdersCount,
      totalOrdersAmount,
      totalOrdersReceived,
      totalOrdersDue,
      totalWalkinCount,
      totalWalkinAmount,
      totalCombinedRevenue,
      totalTransactions
    };
  }, [filteredOrders, filteredBills]);

  // Customer Profile Statistics (if a customer is selected or typed)
  const singleCustomerStats = useMemo(() => {
    if (!activeCustomerObj) return null;

    const custOrders = filteredOrders;
    const custBills = filteredBills;

    const ordTotal = custOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const ordDue = custOrders.reduce((sum, o) => sum + Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.receivedAmount) || 0)), 0);
    const billTotal = custBills.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);

    return {
      customer: activeCustomerObj,
      ordersCount: custOrders.length,
      ordersTotal: ordTotal,
      ordersDue: ordDue,
      billsCount: custBills.length,
      billsTotal: billTotal,
      grandTotal: ordTotal + billTotal
    };
  }, [activeCustomerObj, filteredOrders, filteredBills]);

  // Toggle Accordion Rows
  const toggleRow = (id) => {
    setExpandedRowId(prev => prev === id ? null : id);
  };

  // Convert Walk-In Bill to GST invoice format
  const adaptBillToInvoiceOrder = (bill) => {
    return {
      orderId: bill.billId || bill.id,
      serialNumber: '',
      createdAt: bill.createdAt,
      customerName: bill.customerName || 'B2B Customer',
      customerPhone: bill.customerPhone || '',
      businessName: bill.companyName || bill.businessName || '',
      gstNumber: bill.customerGst || bill.gstNumber || '',
      address: bill.customerAddress || bill.address || '',
      city: bill.customerCity || bill.city || '',
      state: bill.customerState || bill.state || 'Andhra Pradesh',
      storeName: bill.storeName || 'Raju Ghee Sweets',
      tradeName: bill.tradeName || 'Raju Ghee Sweets',
      storeAddress: bill.storeAddress || '',
      storePhone: bill.storePhone || '',
      storeGstNumber: bill.storeGstNumber || bill.storeGst || '37DFJPK6083N1ZO',
      items: (bill.items || []).map(item => ({
        name: item.name,
        unit: item.unit || 'Kg',
        hsnCode: item.hsnCode || '2106',
        quantity: item.unit === 'Weight' ? (parseFloat(item.quantity) || 1) : (parseInt(item.quantity) || 1),
        price: parseFloat(item.price) || (Number(item.total || 0) / Math.max(1, Number(item.quantity || 1))),
        total: parseFloat(item.total) || 0,
        taxRate: item.taxRate || 5
      })),
      totalAmount: Number(bill.totalAmount) || 0,
      discount: Number(bill.discount) || 0,
      receivedAmount: Number(bill.totalAmount) || 0
    };
  };

  // Trigger Print GST Tax Invoice
  const handlePrintGSTInvoice = (record, type) => {
    try {
      if (type === 'order') {
        generateGSTInvoice(record);
      } else {
        const adapted = adaptBillToInvoiceOrder(record);
        generateGSTInvoice(adapted);
      }
      toast.success("Printing GST Tax Invoice...");
    } catch (err) {
      console.error("GST Invoice error:", err);
      toast.error("Failed to generate GST invoice");
    }
  };

  // Trigger Print Thermal Receipt Slip
  const handlePrintThermalSlip = async (record, type) => {
    try {
      if (type === 'order') {
        const html = generateOrderReceiptHTML(record);
        await printHTMLContent(html, record);
      } else {
        const html = generateReceiptHTML(record);
        await printHTMLContent(html, record);
      }
      toast.success("Printing receipt slip...");
    } catch (err) {
      console.error("Thermal print error:", err);
      toast.error("Failed to print thermal slip");
    }
  };

  // Export current list to Excel
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      if (activeTab === 'orders') {
        const rows = [
          ['B2B ORDERS INVOICE REPORT - RAJU GHEE SWEETS'],
          [`Generated on: ${new Date().toLocaleString('en-IN')}`],
          [`Date Filter: ${dateFilterMode} | Customer Filter: ${activeCustomerObj ? activeCustomerObj.firstName : 'All'}`],
          [],
          [
            'Order #',
            'Serial #',
            'Date',
            'Delivery Date',
            'Customer Name',
            'Business Name',
            'Mobile Number',
            'GSTIN',
            'Store / Outlet',
            'Items Count',
            'Gross Total (₹)',
            'Discount (₹)',
            'Net Amount (₹)',
            'Advance Paid (₹)',
            'Balance Due (₹)',
            'Payment Status',
            'Order Status'
          ]
        ];

        filteredOrders.forEach(o => {
          rows.push([
            o.orderId || o.id,
            o.serialNumber || '',
            formatDisplayDate(o),
            o.deliveryDate || '-',
            o.customerName || '',
            o.businessName || '',
            o.customerPhone || '',
            o.gstNumber || '',
            o.storeName || '',
            (o.items || []).length,
            (Number(o.totalAmount || 0) + Number(o.discount || 0)).toFixed(2),
            Number(o.discount || 0).toFixed(2),
            Number(o.totalAmount || 0).toFixed(2),
            Number(o.receivedAmount || 0).toFixed(2),
            Math.max(0, Number(o.totalAmount || 0) - Number(o.receivedAmount || 0)).toFixed(2),
            o.paymentStatus || 'Pending',
            o.status || 'New'
          ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'B2B Orders');
        XLSX.writeFile(wb, `B2B_Orders_Invoices_${dateFilterMode}_${new Date().toISOString().split('T')[0]}.xlsx`);
      } else {
        const rows = [
          ['B2B WALK-IN POS SALES REPORT - RAJU GHEE SWEETS'],
          [`Generated on: ${new Date().toLocaleString('en-IN')}`],
          [`Date Filter: ${dateFilterMode} | Customer Filter: ${activeCustomerObj ? activeCustomerObj.firstName : 'All'}`],
          [],
          [
            'Bill #',
            'Date',
            'Time',
            'Customer Name',
            'Business Name',
            'Mobile Number',
            'Customer GSTIN',
            'Store Outlet',
            'Payment Mode',
            'Items Count',
            'Gross Total (₹)',
            'Discount (₹)',
            'Net Amount (₹)',
            'Status'
          ]
        ];

        filteredBills.forEach(b => {
          rows.push([
            b.billId || b.id,
            formatDisplayDate(b),
            formatDisplayTime(b),
            b.customerName || 'Walk-in Customer',
            b.companyName || b.businessName || '',
            b.customerPhone || '',
            b.customerGst || b.gstNumber || '',
            b.storeName || '',
            formatPaymentModeDisplay(b.paymentMode, b.splitPayments),
            (b.items || []).length,
            (Number(b.totalAmount || 0) + Number(b.discount || 0)).toFixed(2),
            Number(b.discount || 0).toFixed(2),
            Number(b.totalAmount || 0).toFixed(2),
            b.status || 'settled'
          ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'B2B Walk-In Sales');
        XLSX.writeFile(wb, `B2B_WalkIn_Invoices_${dateFilterMode}_${new Date().toISOString().split('T')[0]}.xlsx`);
      }

      toast.success("Excel report downloaded successfully!");
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Failed to export Excel report");
    }
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSelectedCustomerId('all');
    setCustomerSearchQuery('');
    setDateFilterMode('this-month');
    setCustomStartDate('');
    setCustomEndDate('');
    setSelectedStoreId('all');
    setOrderPaymentStatusFilter('all');
    setWalkinStatusFilter('all');
  };

  const hasActiveFilters = 
    selectedCustomerId !== 'all' || 
    customerSearchQuery.trim() !== '' || 
    dateFilterMode !== 'this-month' || 
    selectedStoreId !== 'all' || 
    orderPaymentStatusFilter !== 'all' || 
    walkinStatusFilter !== 'all';

  return (
    <div className="b2b-page-container">
      {/* Top Header */}
      <div className="b2b-header-bar">
        <div className="b2b-header-left">
          <div className="b2b-header-icon-box">
            <Building2 size={22} />
          </div>
          <div>
            <div className="b2b-title-row">
              <h1 className="b2b-page-title">B2B Invoices</h1>
              <span className="b2b-badge-corporate">Corporate & Bulk</span>
            </div>
            <p className="b2b-header-subtext">
              GST compliant invoices, order billings, and POS counter transactions for verified B2B customers
            </p>
          </div>
        </div>

        <div className="b2b-header-actions">
          <button 
            className="b2b-btn b2b-btn-secondary"
            onClick={handleExportExcel}
            title="Download Excel spreadsheet of currently filtered records"
          >
            <Download size={14} />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Metrics Summary Bar */}
      <div className="b2b-metrics-grid">
        <div className="b2b-metric-card primary">
          <div className="b2b-metric-label">Total B2B Revenue</div>
          <div className="b2b-metric-value">₹{metrics.totalCombinedRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="b2b-metric-subtext">
            Across {metrics.totalTransactions} total B2B transactions
          </div>
        </div>

        <div className="b2b-metric-card">
          <div className="b2b-metric-label">B2B Orders Revenue</div>
          <div className="b2b-metric-value text-blue">₹{metrics.totalOrdersAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="b2b-metric-subtext">
            {metrics.totalOrdersCount} booked orders in period
          </div>
        </div>

        <div className="b2b-metric-card">
          <div className="b2b-metric-label">Walk-In Sales Revenue</div>
          <div className="b2b-metric-value text-green">₹{metrics.totalWalkinAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className="b2b-metric-subtext">
            {metrics.totalWalkinCount} counter POS bills settled
          </div>
        </div>

        <div className="b2b-metric-card">
          <div className="b2b-metric-label">Outstanding Balance Due</div>
          <div className={`b2b-metric-value ${metrics.totalOrdersDue > 0 ? 'text-amber' : 'text-green'}`}>
            ₹{metrics.totalOrdersDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="b2b-metric-subtext">
            Pending receivable from B2B orders
          </div>
        </div>
      </div>

      {/* Main Filter & Navigation Panel */}
      <div className="b2b-filter-panel">
        {/* Row 1: Tab Navigation & Quick Counts */}
        <div className="b2b-tabs-row">
          <div className="b2b-tab-pill-group">
            <button
              className={`b2b-tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              <ShoppingBag size={15} />
              <span>B2B Orders</span>
              <span className="b2b-tab-counter">{filteredOrders.length}</span>
            </button>

            <button
              className={`b2b-tab-btn ${activeTab === 'walkin' ? 'active' : ''}`}
              onClick={() => setActiveTab('walkin')}
            >
              <Receipt size={15} />
              <span>Walk-In Sales</span>
              <span className="b2b-tab-counter">{filteredBills.length}</span>
            </button>
          </div>

          {/* Quick Date Presets */}
          <div className="b2b-date-preset-group">
            <span className="b2b-filter-label-prefix">
              <Calendar size={13} />
              Period:
            </span>
            <button
              className={`b2b-chip-btn ${dateFilterMode === 'this-month' ? 'active' : ''}`}
              onClick={() => setDateFilterMode('this-month')}
            >
              This Month
            </button>
            <button
              className={`b2b-chip-btn ${dateFilterMode === 'last-month' ? 'active' : ''}`}
              onClick={() => setDateFilterMode('last-month')}
            >
              Last Month
            </button>
            <button
              className={`b2b-chip-btn ${dateFilterMode === 'custom' ? 'active' : ''}`}
              onClick={() => setDateFilterMode('custom')}
            >
              Custom Range
            </button>
            <button
              className={`b2b-chip-btn ${dateFilterMode === 'all' ? 'active' : ''}`}
              onClick={() => setDateFilterMode('all')}
            >
              All Time
            </button>
          </div>
        </div>

        {/* Row 2: Customer Filter & Input Controls */}
        <div className="b2b-filter-controls-row">
          {/* Customer Search Bar (Name or Mobile) */}
          <div className="b2b-search-box">
            <Search size={15} className="b2b-search-icon" />
            <input
              type="text"
              placeholder="Filter by customer name, mobile number, GSTIN, or invoice #..."
              value={customerSearchQuery}
              onChange={(e) => setCustomerSearchQuery(e.target.value)}
              className="b2b-search-input"
            />
            {customerSearchQuery && (
              <button 
                className="b2b-search-clear-btn" 
                onClick={() => setCustomerSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Custom Searchable Customer Dropdown */}
          <CustomerSearchDropdown
            customers={b2bCustomers}
            selectedCustomerId={selectedCustomerId}
            onSelectCustomer={(id) => setSelectedCustomerId(id)}
            onClearCustomer={() => setSelectedCustomerId('all')}
          />

          {/* Store / Outlet Selector */}
          <div className="b2b-select-wrapper">
            <StoreIcon size={14} className="b2b-select-icon" />
            <select
              className="b2b-select"
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
            >
              <option value="all">🏬 All Outlets / Stores</option>
              {stores.map(st => (
                <option key={st.id} value={st.id}>{st.name}</option>
              ))}
            </select>
          </div>

          {/* Contextual Status Filter */}
          {activeTab === 'orders' ? (
            <div className="b2b-select-wrapper">
              <CreditCard size={14} className="b2b-select-icon" />
              <select
                className="b2b-select"
                value={orderPaymentStatusFilter}
                onChange={(e) => setOrderPaymentStatusFilter(e.target.value)}
              >
                <option value="all">⚡ All Payment Statuses</option>
                <option value="done">✅ Fully Paid (Done)</option>
                <option value="partial">⏳ Partially Paid</option>
                <option value="pending">⚠️ Pending (Unpaid)</option>
              </select>
            </div>
          ) : (
            <div className="b2b-select-wrapper">
              <CheckCircle2 size={14} className="b2b-select-icon" />
              <select
                className="b2b-select"
                value={walkinStatusFilter}
                onChange={(e) => setWalkinStatusFilter(e.target.value)}
              >
                <option value="all">⚡ All Statuses</option>
                <option value="settled">✅ Settled & Paid</option>
                <option value="saved">⏳ Saved / Parked</option>
              </select>
            </div>
          )}

          {hasActiveFilters && (
            <button
              className="b2b-btn b2b-btn-ghost"
              onClick={handleResetFilters}
              title="Reset all active filters"
            >
              <RefreshCw size={13} />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Custom Date Range Picker Row (shown when 'custom' is active) */}
        {dateFilterMode === 'custom' && (
          <div className="b2b-custom-date-row">
            <div className="b2b-date-input-group">
              <label>Start Date:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="b2b-date-input"
              />
            </div>
            <div className="b2b-date-input-group">
              <label>End Date:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="b2b-date-input"
              />
            </div>
            {(customStartDate || customEndDate) && (
              <button
                className="b2b-btn b2b-btn-secondary"
                onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
              >
                Clear Dates
              </button>
            )}
          </div>
        )}
      </div>

      {/* Selected Customer Highlight Card (when a single customer is picked) */}
      {singleCustomerStats && (
        <div className="b2b-customer-highlight-card">
          <div className="b2b-cust-highlight-left">
            <div className="b2b-cust-avatar">
              <Building2 size={20} />
            </div>
            <div className="b2b-cust-info">
              <div className="b2b-cust-title-line">
                <span className="b2b-cust-biz-name">
                  {singleCustomerStats.customer.businessName || `${singleCustomerStats.customer.firstName} ${singleCustomerStats.customer.lastName || ''}`}
                </span>
                <span className="b2b-cust-pill-b2b">Verified B2B</span>
              </div>
              <div className="b2b-cust-meta-row">
                <span className="b2b-cust-meta-item">
                  <User size={13} />
                  {singleCustomerStats.customer.firstName} {singleCustomerStats.customer.lastName || ''}
                </span>
                <span className="b2b-cust-meta-item">
                  <Phone size={13} />
                  {singleCustomerStats.customer.mobileNumber || 'N/A'}
                </span>
                {singleCustomerStats.customer.gstNumber && (
                  <span className="b2b-cust-meta-item">
                    <strong>GSTIN:</strong> {singleCustomerStats.customer.gstNumber}
                  </span>
                )}
                {singleCustomerStats.customer.city && (
                  <span className="b2b-cust-meta-item">
                    <MapPin size={13} />
                    {singleCustomerStats.customer.city}, {singleCustomerStats.customer.state || 'AP'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="b2b-cust-highlight-stats">
            <div className="b2b-cust-stat-col">
              <span className="stat-label">Orders</span>
              <span className="stat-value">{singleCustomerStats.ordersCount} (₹{singleCustomerStats.ordersTotal.toFixed(0)})</span>
            </div>
            <div className="b2b-cust-stat-col">
              <span className="stat-label">Walk-In POS</span>
              <span className="stat-value">{singleCustomerStats.billsCount} (₹{singleCustomerStats.billsTotal.toFixed(0)})</span>
            </div>
            <div className="b2b-cust-stat-col">
              <span className="stat-label">Balance Due</span>
              <span className={`stat-value ${singleCustomerStats.ordersDue > 0 ? 'text-amber' : 'text-green'}`}>
                ₹{singleCustomerStats.ordersDue.toFixed(0)}
              </span>
            </div>
            <button
              className="b2b-btn b2b-btn-secondary b2b-cust-clear-btn"
              onClick={() => setSelectedCustomerId('all')}
              title="Remove customer filter"
            >
              <X size={14} />
              <span>Show All</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Table / Invoices View */}
      <div className="b2b-table-container">
        {loading ? (
          <div className="b2b-empty-state">
            <div className="b2b-spinner"></div>
            <p>Loading B2B Invoices & Sales Records...</p>
          </div>
        ) : activeTab === 'orders' ? (
          /* ========================================================== */
          /* TAB 1: B2B ORDERS                                          */
          /* ========================================================== */
          filteredOrders.length === 0 ? (
            <div className="b2b-empty-state">
              <ShoppingBag size={40} className="b2b-empty-icon" />
              <h3>No B2B Customer Orders Found</h3>
              <p>
                No orders match your active filter criteria for this period. Try clearing filters or expanding date range.
              </p>
              {hasActiveFilters && (
                <button className="b2b-btn b2b-btn-primary" onClick={handleResetFilters}>
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="b2b-table-wrapper">
              <table className="b2b-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Invoice / Order</th>
                    <th>Date & Time</th>
                    <th>Customer & Business</th>
                    <th>Outlet</th>
                    <th className="text-right">Items</th>
                    <th className="text-right">Total Amount</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Balance Due</th>
                    <th className="text-center">Payment</th>
                    <th className="text-center">Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(order => {
                    const isExpanded = expandedRowId === order.id;
                    const totalAmt = Number(order.totalAmount || 0);
                    const recAmt = Number(order.receivedAmount || 0);
                    const dueAmt = Math.max(0, totalAmt - recAmt);
                    const pStatus = (order.paymentStatus || 'Pending').toLowerCase();

                    return (
                      <React.Fragment key={order.id}>
                        <tr className={`b2b-row ${isExpanded ? 'expanded' : ''}`}>
                          <td className="text-center">
                            <button
                              className="b2b-accordion-toggle-btn"
                              onClick={() => toggleRow(order.id)}
                              aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </td>

                          {/* Order / Invoice Number */}
                          <td>
                            <div className="b2b-inv-number-cell">
                              <span className="b2b-inv-number">
                                #{order.orderId || order.id?.substring(0, 8)}
                              </span>
                              {order.serialNumber && (
                                <span className="b2b-serial-pill">
                                  S-{order.serialNumber}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Date & Delivery Date */}
                          <td>
                            <div className="b2b-date-cell">
                              <span className="b2b-date-main">{formatDisplayDate(order)}</span>
                              <span className="b2b-date-sub">
                                {formatDisplayTime(order)}
                                {order.deliveryDate ? ` • Del: ${order.deliveryDate}` : ''}
                              </span>
                            </div>
                          </td>

                          {/* Customer & Business */}
                          <td>
                            <div className="b2b-cust-cell">
                              <span className="b2b-cust-biz">
                                {order.businessName || order.customerName || 'B2B Customer'}
                              </span>
                              <div className="b2b-cust-sub">
                                <span>{order.customerName}</span>
                                {order.customerPhone && (
                                  <>
                                    <span>•</span>
                                    <span>{order.customerPhone}</span>
                                  </>
                                )}
                                {order.gstNumber && (
                                  <>
                                    <span>•</span>
                                    <span className="b2b-gst-text">GST: {order.gstNumber}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Store Outlet */}
                          <td>
                            <span className="b2b-outlet-name">
                              {order.storeName || 'Main Store'}
                            </span>
                          </td>

                          {/* Items Count */}
                          <td className="text-right">
                            <span className="b2b-items-count">
                              {(order.items || []).length} items
                            </span>
                          </td>

                          {/* Total Amount */}
                          <td className="text-right">
                            <span className="b2b-amt-total">
                              ₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {Number(order.discount || 0) > 0 && (
                              <div className="b2b-disc-sub">
                                Disc: -₹{Number(order.discount).toFixed(2)}
                              </div>
                            )}
                          </td>

                          {/* Advance Paid */}
                          <td className="text-right">
                            <span className="b2b-amt-paid text-green">
                              ₹{recAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </td>

                          {/* Due */}
                          <td className="text-right">
                            <span className={`b2b-amt-due ${dueAmt > 0 ? 'text-amber' : 'text-green'}`}>
                              ₹{dueAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </td>

                          {/* Payment Status */}
                          <td className="text-center">
                            <span className={`b2b-status-pill ${pStatus === 'done' ? 'paid' : pStatus === 'partial' ? 'partial' : 'pending'}`}>
                              {pStatus === 'done' ? 'Fully Paid' : pStatus === 'partial' ? 'Partial' : 'Pending'}
                            </span>
                          </td>

                          {/* Order Status */}
                          <td className="text-center">
                            <span className="b2b-status-pill neutral">
                              {order.status || 'New'}
                            </span>
                          </td>

                          {/* Action Buttons */}
                          <td className="text-right">
                            <div className="b2b-action-btn-group">
                              <button
                                className="b2b-action-btn primary"
                                onClick={() => handlePrintGSTInvoice(order, 'order')}
                                title="Print GST Tax Invoice"
                              >
                                <FileText size={13} />
                                <span>GST Invoice</span>
                              </button>

                              <button
                                className="b2b-action-btn secondary"
                                onClick={() => handlePrintThermalSlip(order, 'order')}
                                title="Print 80mm Thermal Slip"
                              >
                                <Printer size={13} />
                                <span>Thermal</span>
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Accordion Expansion: Itemized Details */}
                        {isExpanded && (
                          <tr className="b2b-expanded-row">
                            <td colSpan={12}>
                              <div className="b2b-expanded-panel">
                                <div className="b2b-expanded-header">
                                  <h4>Order #{order.orderId} Item Breakdown & Tax Specifications</h4>
                                  <div className="b2b-expanded-meta">
                                    {order.address && <span>📍 Delivery: {order.address}, {order.city}</span>}
                                    {order.paymentMode && <span>💳 Mode: {formatPaymentModeDisplay(order.paymentMode, order.splitPayments)}</span>}
                                  </div>
                                </div>

                                <table className="b2b-subtable">
                                  <thead>
                                    <tr>
                                      <th>#</th>
                                      <th>Item Description</th>
                                      <th>HSN</th>
                                      <th>Unit</th>
                                      <th className="text-right">Quantity / Weight</th>
                                      <th className="text-right">Rate (₹)</th>
                                      <th className="text-right">GST Rate</th>
                                      <th className="text-right">Total Amount (₹)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(order.items || []).map((item, idx) => (
                                      <tr key={idx}>
                                        <td>{idx + 1}</td>
                                        <td>
                                          <strong>{item.name}</strong>
                                          {item.description && (
                                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                                              {item.description}
                                            </div>
                                          )}
                                        </td>
                                        <td>{item.hsnCode || '2106'}</td>
                                        <td>{item.unit || 'Kg'}</td>
                                        <td className="text-right">
                                          {item.unit === 'Weight' ? `${item.quantity} KG` : item.quantity}
                                        </td>
                                        <td className="text-right">
                                          ₹{Number(item.price || (Number(item.total || 0) / Math.max(1, Number(item.quantity || 1)))).toFixed(2)}
                                        </td>
                                        <td className="text-right">{item.taxRate || 5}%</td>
                                        <td className="text-right font-medium">
                                          ₹{Number(item.total || 0).toFixed(2)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* ========================================================== */
          /* TAB 2: B2B WALK-IN POS SALES                               */
          /* ========================================================== */
          filteredBills.length === 0 ? (
            <div className="b2b-empty-state">
              <Receipt size={40} className="b2b-empty-icon" />
              <h3>No B2B Walk-In Counter Sales Found</h3>
              <p>
                No POS sales match your active filter criteria for this period. Try clearing filters or expanding date range.
              </p>
              {hasActiveFilters && (
                <button className="b2b-btn b2b-btn-primary" onClick={handleResetFilters}>
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="b2b-table-wrapper">
              <table className="b2b-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Bill Number</th>
                    <th>Date & Time</th>
                    <th>Customer & Business</th>
                    <th>Outlet / Store</th>
                    <th>Payment Mode</th>
                    <th className="text-right">Items</th>
                    <th className="text-right">Total Amount</th>
                    <th className="text-center">Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBills.map(bill => {
                    const isExpanded = expandedRowId === bill.id;
                    const totalAmt = Number(bill.totalAmount || 0);
                    const bStatus = (bill.status || 'settled').toLowerCase();

                    return (
                      <React.Fragment key={bill.id}>
                        <tr className={`b2b-row ${isExpanded ? 'expanded' : ''}`}>
                          <td className="text-center">
                            <button
                              className="b2b-accordion-toggle-btn"
                              onClick={() => toggleRow(bill.id)}
                              aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </td>

                          {/* Bill ID */}
                          <td>
                            <div className="b2b-inv-number-cell">
                              <span className="b2b-inv-number">
                                #{bill.billId || bill.id?.substring(0, 8)}
                              </span>
                            </div>
                          </td>

                          {/* Date & Time */}
                          <td>
                            <div className="b2b-date-cell">
                              <span className="b2b-date-main">{formatDisplayDate(bill)}</span>
                              <span className="b2b-date-sub">{formatDisplayTime(bill)}</span>
                            </div>
                          </td>

                          {/* Customer & Business */}
                          <td>
                            <div className="b2b-cust-cell">
                              <span className="b2b-cust-biz">
                                {bill.companyName || bill.businessName || bill.customerName || 'B2B Customer'}
                              </span>
                              <div className="b2b-cust-sub">
                                <span>{bill.customerName}</span>
                                {bill.customerPhone && (
                                  <>
                                    <span>•</span>
                                    <span>{bill.customerPhone}</span>
                                  </>
                                )}
                                {(bill.customerGst || bill.gstNumber) && (
                                  <>
                                    <span>•</span>
                                    <span className="b2b-gst-text">GST: {bill.customerGst || bill.gstNumber}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Store Name */}
                          <td>
                            <span className="b2b-outlet-name">
                              {bill.storeName || 'Store Outlet'}
                            </span>
                          </td>

                          {/* Payment Mode */}
                          <td>
                            <span className="b2b-paymode-badge">
                              {formatPaymentModeDisplay(bill.paymentMode, bill.splitPayments)}
                            </span>
                          </td>

                          {/* Items Count */}
                          <td className="text-right">
                            <span className="b2b-items-count">
                              {(bill.items || []).length} items
                            </span>
                          </td>

                          {/* Total Bill Amount */}
                          <td className="text-right">
                            <span className="b2b-amt-total">
                              ₹{totalAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {Number(bill.discount || 0) > 0 && (
                              <div className="b2b-disc-sub">
                                Disc: -₹{Number(bill.discount).toFixed(2)}
                              </div>
                            )}
                          </td>

                          {/* Status */}
                          <td className="text-center">
                            <span className={`b2b-status-pill ${bStatus === 'settled' ? 'paid' : 'pending'}`}>
                              {bStatus === 'settled' ? 'Settled & Paid' : 'Draft / Saved'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="text-right">
                            <div className="b2b-action-btn-group">
                              <button
                                className="b2b-action-btn primary"
                                onClick={() => handlePrintGSTInvoice(bill, 'walkin')}
                                title="Print GST Tax Invoice"
                              >
                                <FileText size={13} />
                                <span>GST Invoice</span>
                              </button>

                              <button
                                className="b2b-action-btn secondary"
                                onClick={() => handlePrintThermalSlip(bill, 'walkin')}
                                title="Print 80mm POS Thermal Receipt"
                              >
                                <Printer size={13} />
                                <span>Thermal</span>
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Accordion Expansion: Bill Items */}
                        {isExpanded && (
                          <tr className="b2b-expanded-row">
                            <td colSpan={10}>
                              <div className="b2b-expanded-panel">
                                <div className="b2b-expanded-header">
                                  <h4>Bill #{bill.billId || bill.id} Itemized POS Counter Receipt</h4>
                                  <div className="b2b-expanded-meta">
                                    <span>🏬 Outlet: {bill.storeName}</span>
                                    <span>💳 Mode: {formatPaymentModeDisplay(bill.paymentMode, bill.splitPayments)}</span>
                                  </div>
                                </div>

                                <table className="b2b-subtable">
                                  <thead>
                                    <tr>
                                      <th>#</th>
                                      <th>Product Name</th>
                                      <th>Unit</th>
                                      <th className="text-right">Quantity / Weight</th>
                                      <th className="text-right">Price (₹)</th>
                                      <th className="text-right">Amount (₹)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(bill.items || []).map((item, idx) => (
                                      <tr key={idx}>
                                        <td>{idx + 1}</td>
                                        <td>
                                          <strong>{item.name}</strong>
                                        </td>
                                        <td>{item.unit || 'Kg'}</td>
                                        <td className="text-right">
                                          {item.unit === 'Weight' ? `${item.quantity} KG` : item.quantity}
                                        </td>
                                        <td className="text-right">
                                          ₹{Number(item.price || (Number(item.total || 0) / Math.max(1, Number(item.quantity || 1)))).toFixed(2)}
                                        </td>
                                        <td className="text-right font-medium">
                                          ₹{Number(item.total || 0).toFixed(2)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default B2BInvoices;
