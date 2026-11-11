import React, { useState, useEffect, useRef } from 'react';
import { 
  Receipt, 
  Search, 
  Store as StoreIcon, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  Printer, 
  Eye, 
  X,
  Filter,
  CreditCard,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { db } from '../../config/firebase';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  onSnapshot, 
  limit, 
  startAfter, 
  getCountFromServer 
} from 'firebase/firestore';
import { generateReceiptHTML } from '../../utils/printReceiptHelper';
import { formatPaymentModeDisplay } from '../../components/SplitPaymentSelector/SplitPaymentSelector';
import logo from '../../assets/logo.png';
import { usePrinter } from '../../context/PrinterContext';
import A4InvoiceModal from '../../components/A4InvoiceModal/A4InvoiceModal';
import './WalkInSales.css';

const DEFAULT_ITEM_IMAGE = logo;
const PAGE_SIZE = 24;

const WalkInSales = () => {
  const [bills, setBills] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalBillsCount, setTotalBillsCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all'); // 'all', 'settled', 'saved'
  const [filterDate, setFilterDate] = useState('');
  const [previewBill, setPreviewBill] = useState(null);
  const [a4InvoiceBill, setA4InvoiceBill] = useState(null);
  const [expandedBills, setExpandedBills] = useState([]);

  const pageCursorsRef = useRef({});
  const pageCacheRef = useRef({});

  const toggleBillAccordion = (billId) => {
    setExpandedBills(prev => 
      prev.includes(billId) 
        ? prev.filter(id => id !== billId) 
        : [...prev, billId]
    );
  };

  // Fetch Outlets / Stores List for Filter
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

  // Fetch Total Bills Count from server for accurate pagination metrics
  useEffect(() => {
    const fetchTotalCount = async () => {
      try {
        const countSnap = await getCountFromServer(collection(db, 'bills'));
        if (countSnap && typeof countSnap.data().count === 'number') {
          setTotalBillsCount(countSnap.data().count);
        }
      } catch (err) {
        console.warn("Could not fetch total count of bills:", err);
      }
    };
    fetchTotalCount();
  }, []);

  // Page 1: Real-time subscription with limit(24)
  useEffect(() => {
    if (currentPage !== 1) return;

    setLoading(true);
    const q = query(
      collection(db, 'bills'), 
      orderBy('createdAt', 'desc'), 
      limit(PAGE_SIZE)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedBills = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBills(fetchedBills);
      pageCacheRef.current[1] = fetchedBills;
      if (snapshot.docs.length > 0) {
        pageCursorsRef.current[1] = snapshot.docs[snapshot.docs.length - 1];
      }
      setHasMore(snapshot.docs.length === PAGE_SIZE);
      setLoading(false);
    }, (err) => {
      console.error("Error subscribing to root bills:", err);
      fetchBillsFromSubcollections();
    });

    return () => unsubscribe();
  }, [currentPage]);

  // Page > 1: Paginated fetching using startAfter cursor with limit(24)
  useEffect(() => {
    if (currentPage <= 1) return;

    const fetchPage = async () => {
      // If already cached, show instantly
      if (pageCacheRef.current[currentPage]) {
        setBills(pageCacheRef.current[currentPage]);
        return;
      }

      const prevCursor = pageCursorsRef.current[currentPage - 1];
      if (!prevCursor) {
        setCurrentPage(1);
        return;
      }

      setPageLoading(true);
      try {
        const q = query(
          collection(db, 'bills'),
          orderBy('createdAt', 'desc'),
          startAfter(prevCursor),
          limit(PAGE_SIZE)
        );
        const snapshot = await getDocs(q);
        const fetchedBills = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        setBills(fetchedBills);
        pageCacheRef.current[currentPage] = fetchedBills;
        if (snapshot.docs.length > 0) {
          pageCursorsRef.current[currentPage] = snapshot.docs[snapshot.docs.length - 1];
        }
        setHasMore(snapshot.docs.length === PAGE_SIZE);
      } catch (err) {
        console.error(`Error fetching page ${currentPage}:`, err);
      } finally {
        setPageLoading(false);
      }
    };

    fetchPage();
  }, [currentPage]);

  const fetchBillsFromSubcollections = async () => {
    try {
      const storeSnap = await getDocs(collection(db, 'stores'));
      let allBills = [];

      for (const sDoc of storeSnap.docs) {
        const storeId = sDoc.id;
        const storeName = sDoc.data().name || 'Store';
        const bSnap = await getDocs(
          query(
            collection(db, 'stores', storeId, 'bills'),
            orderBy('createdAt', 'desc'),
            limit(PAGE_SIZE)
          )
        );
        bSnap.docs.forEach(bDoc => {
          allBills.push({
            id: bDoc.id,
            storeId,
            storeName,
            status: 'settled',
            ...bDoc.data()
          });
        });
      }

      allBills.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      const paged = allBills.slice(0, PAGE_SIZE);
      setBills(paged);
      setTotalBillsCount(allBills.length);
      setHasMore(allBills.length > PAGE_SIZE);
    } catch (err) {
      console.error("Fallback subcollection bills fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedStore, selectedStatus, filterDate]);

  // Total pages calculation
  const totalPages = totalBillsCount > 0 
    ? Math.ceil(totalBillsCount / PAGE_SIZE) 
    : (hasMore ? currentPage + 1 : currentPage);

  // Jump to page with sequential cursor resolution
  const goToPage = async (targetPage) => {
    if (targetPage < 1 || targetPage === currentPage || loading || pageLoading) return;
    if (totalPages > 0 && targetPage > totalPages && !hasMore) return;

    if (pageCacheRef.current[targetPage] || pageCursorsRef.current[targetPage - 1]) {
      setCurrentPage(targetPage);
      return;
    }

    setPageLoading(true);
    try {
      let currentCursor = pageCursorsRef.current[1];
      for (let p = 2; p < targetPage; p++) {
        if (!pageCursorsRef.current[p]) {
          const q = query(
            collection(db, 'bills'),
            orderBy('createdAt', 'desc'),
            startAfter(currentCursor),
            limit(PAGE_SIZE)
          );
          const snap = await getDocs(q);
          if (snap.docs.length === 0) break;
          currentCursor = snap.docs[snap.docs.length - 1];
          pageCursorsRef.current[p] = currentCursor;
          pageCacheRef.current[p] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
          currentCursor = pageCursorsRef.current[p];
        }
      }
      setCurrentPage(targetPage);
    } catch (err) {
      console.error("Error jumping to page:", err);
    } finally {
      setPageLoading(false);
    }
  };

  // Page Numbers with Ellipsis
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 2) {
        end = 4;
      } else if (currentPage >= totalPages - 1) {
        start = totalPages - 3;
      }

      if (start > 2) pages.push('...');
      for (let i = start; i <= end; i++) {
        if (i > 1 && i < totalPages) pages.push(i);
      }
      if (end < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  // Filter Logic
  const filteredBills = bills.filter(bill => {
    const queryLower = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      (bill.billId || '').toLowerCase().includes(queryLower) ||
      (bill.customerName || '').toLowerCase().includes(queryLower) ||
      (bill.customerPhone || '').toLowerCase().includes(queryLower) ||
      (bill.storeName || '').toLowerCase().includes(queryLower);

    const matchesStore = selectedStore === 'all' || bill.storeId === selectedStore;
    const matchesStatus = selectedStatus === 'all' || (bill.status || 'settled') === selectedStatus;
    const matchesDate = !filterDate || bill.date === new Date(filterDate).toLocaleDateString('en-IN') || (bill.date || '').includes(filterDate);

    return matchesSearch && matchesStore && matchesStatus && matchesDate;
  });

  // Calculate High-Level Metrics
  const settledBills = bills.filter(b => (b.status || 'settled') === 'settled');
  const savedBills = bills.filter(b => b.status === 'saved');

  const totalWalkInRevenue = settledBills.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
  const todayStr = new Date().toLocaleDateString('en-IN');
  const todaySales = settledBills
    .filter(b => b.date === todayStr)
    .reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);

  const {
    printHTMLContent,
    bluetoothConnected,
    qzConnected,
    selectedQZPrinter,
    printRawBLE,
    printRawUSB,
    webUsbConnected,
    webSerialConnected,
  } = usePrinter();

  const handlePrintReceipt = async (bill) => {
    const printContent = generateReceiptHTML(bill);
    // Pass bill object as 2nd arg so smartPrint uses buildReceiptESCPOS for direct printers
    await printHTMLContent(printContent, bill);
  };


  return (
    <div className="walkin-sales-container">
      {/* Header Bar */}
      <div className="walkin-header-bar">
        <div className="walkin-title-group">
          <div className="walkin-title-icon">
            <Receipt size={22} />
          </div>
          <div>
            <h1 className="walkin-page-title">Walk-In Sales History</h1>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--polaris-text-subdued)' }}>
              Real-time POS invoice records and sales analytics across all store outlets
            </p>
          </div>
        </div>
      </div>

      {/* High-Level Metrics Summary Cards */}
      <div className="walkin-metrics-grid">

        <div className="walkin-metric-card">
          <div className="walkin-metric-label">Settled Bills</div>
          <div className="walkin-metric-value">{settledBills.length}</div>
          <div className="walkin-metric-subtext" style={{ color: '#0284c7' }}>Completed & Paid</div>
        </div>

        <div className="walkin-metric-card">
          <div className="walkin-metric-label">Saved / Draft Bills</div>
          <div className="walkin-metric-value">{savedBills.length}</div>
          <div className="walkin-metric-subtext" style={{ color: '#d97706' }}>Parked (Not in calculations)</div>
        </div>

        <div className="walkin-metric-card">
          <div className="walkin-metric-label">Today's Revenue</div>
          <div className="walkin-metric-value">₹{todaySales.toLocaleString('en-IN')}</div>
          <div className="walkin-metric-subtext">Settled today ({todayStr})</div>
        </div>
      </div>

      {/* Filter Card & Toolbar */}
      <div className="walkin-filter-card">
        <div className="walkin-filter-left">
          <div className="walkin-search-box">
            <Search size={15} color="#6b7280" />
            <input 
              type="text" 
              placeholder="Search by Bill ID, Customer, Phone, or Store..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select 
            className="walkin-select-filter"
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
          >
            <option value="all">🏬 All Outlets & Stores</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select 
            className="walkin-select-filter"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="all">⚡ All Statuses</option>
            <option value="settled">✅ Settled & Paid</option>
            <option value="saved">⏳ Saved / Parked</option>
          </select>

          <input 
            type="date"
            className="walkin-date-input"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />

          {filterDate && (
            <button 
              className="polaris-btn polaris-btn-secondary"
              style={{ height: '36px', padding: '0 10px', fontSize: '12px' }}
              onClick={() => setFilterDate('')}
            >
              Clear Date
            </button>
          )}
        </div>
      </div>

      {/* Main Data Table */}
      <div className="polaris-card">
        <div className="polaris-table-wrapper">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div className="loader"></div>
            </div>
          ) : filteredBills.length > 0 ? (
            <table className="polaris-table">
              <thead>
                <tr>
                  <th>Bill ID</th>
                  <th>Store Outlet</th>
                  <th>Customer Name</th>
                  <th>Customer Phone</th>
                  <th>Total Amount</th>
                  <th>Payment Mode</th>
                  <th>Status</th>
                  <th>Bill Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.map(bill => {
                  const billStatus = bill.status || 'settled';
                  const isExpanded = expandedBills.includes(bill.id);
                  const itemsList = bill.items || [];

                  return (
                    <React.Fragment key={bill.id}>
                      <tr className={`walkin-data-row ${isExpanded ? 'walkin-row-expanded' : ''}`}>
                        <td style={{ fontWeight: '700', color: 'var(--primary-color)' }}>
                          <div className="walkin-bill-id-cell">
                            <button
                              type="button"
                              className={`walkin-accordion-btn ${isExpanded ? 'expanded' : ''}`}
                              onClick={() => toggleBillAccordion(bill.id)}
                              title={isExpanded ? "Collapse Items" : "Expand Items"}
                              aria-label={isExpanded ? "Collapse Items" : "Expand Items"}
                            >
                              {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </button>
                            <span 
                              className="walkin-bill-id-text"
                              onClick={() => toggleBillAccordion(bill.id)}
                              title="Click to toggle product details"
                            >
                              {bill.billId}
                            </span>
                          </div>
                        </td>
                        <td style={{ fontWeight: '600' }}>
                          <div>{bill.storeName || 'Outlet Store'}</div>
                          {bill.tradeName && bill.tradeName !== bill.storeName && (
                            <div style={{ fontSize: '11px', color: 'var(--primary-color)', fontWeight: '700' }}>{bill.tradeName}</div>
                          )}
                          {bill.storeGstNumber && (
                            <div style={{ fontSize: '10px', color: '#1e3a8a', fontWeight: '700' }}>GST: {bill.storeGstNumber}</div>
                          )}
                        </td>
                        <td>{bill.customerName || 'Walk-in Customer'}</td>
                        <td style={{ color: '#4b5563' }}>{bill.customerPhone || '—'}</td>
                        <td style={{ fontWeight: '700', fontSize: '14px' }}>₹{Number(bill.totalAmount || 0).toFixed(2)}</td>
                        <td>
                          <span className="polaris-badge" style={{ background: '#f3f4f6', color: '#1f2937', fontWeight: '700' }}>
                            {formatPaymentModeDisplay(bill)}
                          </span>
                        </td>
                        <td>
                          <span className={`walkin-status-badge ${billStatus}`}>
                            {billStatus === 'settled' ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                            {billStatus === 'settled' ? 'Settled' : 'Saved (Draft)'}
                          </span>
                        </td>
                        <td style={{ color: '#6b7280', fontSize: '12px' }}>{bill.date || '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                            <button 
                              className="polaris-btn" 
                              style={{ 
                                height: '30px', 
                                padding: '0 9px', 
                                fontSize: '12px',
                                fontWeight: '700',
                                background: '#ecfdf5',
                                color: '#065f46',
                                border: '1px solid #a7f3d0',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              onClick={() => setA4InvoiceBill(bill)}
                              title="A4 Tax Invoice Preview, Download PDF & WhatsApp"
                            >
                              <FileText size={13} /> A4
                            </button>
                            <button 
                              className="polaris-btn polaris-btn-secondary" 
                              style={{ height: '30px', padding: '0 8px', fontSize: '12px' }}
                              onClick={() => setPreviewBill(bill)}
                              title="View Bill Details"
                            >
                              <Eye size={14} /> View
                            </button>
                            <button 
                              className="polaris-btn polaris-btn-secondary" 
                              style={{ height: '30px', padding: '0 8px', fontSize: '12px' }}
                              onClick={() => handlePrintReceipt(bill)}
                              title="Print Thermal Receipt"
                            >
                              <Printer size={14} /> Print
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Accordion Sub-row: Products list in this bill */}
                      {isExpanded && (
                        <tr className="walkin-accordion-row">
                          <td colSpan={9} className="walkin-accordion-td">
                            <div className="walkin-accordion-content">
                              <div className="walkin-accordion-header">
                                <div className="walkin-acc-title">
                                  <ShoppingBag size={15} />
                                  <span>Products in this Bill ({itemsList.length} {itemsList.length === 1 ? 'item' : 'items'})</span>
                                </div>
                                {Number(bill.discount || 0) > 0 && (
                                  <div className="walkin-acc-discount">
                                    Discount Applied: ₹{Number(bill.discount).toFixed(2)}
                                  </div>
                                )}
                              </div>

                              {itemsList.length > 0 ? (
                                <div className="walkin-items-table-wrapper">
                                  <table className="walkin-items-subtable">
                                    <thead>
                                      <tr>
                                        <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                                        <th>Product Name</th>
                                        <th style={{ textAlign: 'right', width: '120px' }}>Unit Rate</th>
                                        <th style={{ textAlign: 'center', width: '130px' }}>Quantity</th>
                                        <th style={{ textAlign: 'right', width: '130px' }}>Item Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {itemsList.map((item, idx) => {
                                        const itemQty = Number(item.quantity || 1);
                                        const itemPrice = Number(item.price || 0);
                                        const itemTotal = Number(item.total != null ? item.total : (itemQty * itemPrice));
                                        const isWeight = item.unit === 'Weight' || item.weightUnit;
                                        const formattedQty = isWeight ? `${itemQty} kg` : `${itemQty} ${item.unit || 'pcs'}`;

                                        return (
                                          <tr key={idx}>
                                            <td style={{ color: '#9ca3af', fontWeight: '600', textAlign: 'center' }}>{idx + 1}</td>
                                            <td>
                                              <div style={{ fontWeight: '600', color: '#1f2937' }}>
                                                {item.name || 'Unnamed Product'}
                                              </div>
                                              {item.category && (
                                                <span className="walkin-item-cat-badge">{item.category}</span>
                                              )}
                                            </td>
                                            <td style={{ textAlign: 'right', color: '#4b5563' }}>₹{itemPrice.toFixed(2)}</td>
                                            <td style={{ textAlign: 'center' }}>
                                              <span className="walkin-qty-badge">{formattedQty}</span>
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: '700', color: '#111827' }}>
                                              ₹{itemTotal.toFixed(2)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr>
                                        <td colSpan={4} style={{ textAlign: 'right', fontWeight: '700', color: '#4b5563' }}>
                                          Grand Total:
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--primary-color, #0A2A1B)', fontSize: '13px' }}>
                                          ₹{Number(bill.totalAmount || 0).toFixed(2)}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              ) : (
                                <div className="walkin-acc-empty">
                                  No product items recorded for this bill.
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <Receipt size={36} color="#9ca3af" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 4px' }}>No POS Bills Found</h3>
              <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>Try adjusting your search criteria or store selection.</p>
            </div>
          )}
        </div>

        {/* Pagination Bar */}
        {bills.length > 0 && (
          <div className="walkin-pagination-bar">
            <div className="walkin-pagination-info">
              <span>
                Showing <b>{((currentPage - 1) * PAGE_SIZE) + (filteredBills.length > 0 ? 1 : 0)}</b> to{' '}
                <b>{((currentPage - 1) * PAGE_SIZE) + filteredBills.length}</b> of{' '}
                <b>{totalBillsCount > 0 ? totalBillsCount : bills.length}</b> bills
              </span>
              {filteredBills.length !== bills.length && (
                <span className="walkin-pagination-badge">
                  {filteredBills.length} matching filters
                </span>
              )}
              {pageLoading && (
                <span className="walkin-page-spinner" title="Loading page..."></span>
              )}
            </div>

            <div className="walkin-pagination-controls">
              {/* First Page Button */}
              <button 
                className="walkin-page-btn"
                disabled={currentPage === 1 || loading || pageLoading}
                onClick={() => goToPage(1)}
                title="First Page"
              >
                <ChevronsLeft size={15} />
              </button>

              {/* Previous Button */}
              <button 
                className="walkin-page-btn"
                disabled={currentPage === 1 || loading || pageLoading}
                onClick={() => goToPage(currentPage - 1)}
                title="Previous Page"
              >
                <ChevronLeft size={15} /> Prev
              </button>

              {/* Page Number Buttons */}
              {getPageNumbers().map((p, idx) => (
                p === '...' ? (
                  <span key={`ellipsis-${idx}`} className="walkin-page-ellipsis">…</span>
                ) : (
                  <button
                    key={`page-${p}`}
                    className={`walkin-page-btn ${currentPage === p ? 'active' : ''}`}
                    disabled={loading || pageLoading}
                    onClick={() => goToPage(p)}
                    title={`Page ${p}`}
                  >
                    {p}
                  </button>
                )
              ))}

              {/* Next Button */}
              <button 
                className="walkin-page-btn"
                disabled={(!hasMore && currentPage >= totalPages) || loading || pageLoading}
                onClick={() => goToPage(currentPage + 1)}
                title="Next Page"
              >
                Next <ChevronRight size={15} />
              </button>

              {/* Last Page Button */}
              {totalPages > 1 && (
                <button 
                  className="walkin-page-btn"
                  disabled={currentPage >= totalPages || loading || pageLoading}
                  onClick={() => goToPage(totalPages)}
                  title="Last Page"
                >
                  <ChevronsRight size={15} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bill Preview Modal */}
      {previewBill && (
        <div className="walkin-modal-overlay">
          <div className="walkin-modal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700' }}>Bill #{previewBill.billId}</h3>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>
                  {previewBill.tradeName || previewBill.storeName} {previewBill.storeName && previewBill.tradeName !== previewBill.storeName ? `(${previewBill.storeName})` : ''} • {previewBill.date}
                </span>
              </div>
              <button 
                onClick={() => setPreviewBill(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', marginBottom: '16px' }}>
              {previewBill.tradeName && <div><b>Store Trade Name:</b> {previewBill.tradeName}</div>}
              {previewBill.storeGstNumber && (
                <div style={{ color: '#047857', fontWeight: '700' }}>
                  <b>Store GSTIN:</b> {previewBill.storeGstNumber}
                </div>
              )}
              {previewBill.storeAddress && <div><b>Store Address:</b> {previewBill.storeAddress}</div>}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '6px', marginTop: '2px' }}><b>Customer Name:</b> {previewBill.customerName || 'Walk-in Customer'}</div>
              <div><b>Customer Phone:</b> {previewBill.customerPhone || '—'}</div>
              {previewBill.companyName && <div><b>B2B Company:</b> {previewBill.companyName}</div>}
              {(previewBill.customerGst || previewBill.gstNumber) && (
                <div style={{ color: '#1e3a8a', fontWeight: '700' }}>
                  <b>Customer GSTIN:</b> {previewBill.customerGst || previewBill.gstNumber}
                </div>
              )}
              <div><b>Payment Mode:</b> {formatPaymentModeDisplay(previewBill)}</div>
              {previewBill.isIGST && (
                <div>
                  <span style={{ display: 'inline-block', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '800' }}>
                    IGST ({previewBill.igstRate || 5}%)
                  </span>
                </div>
              )}

              <div>
                <b>Bill Status:</b>{' '}
                <span className={`walkin-status-badge ${previewBill.status || 'settled'}`}>
                  {previewBill.status === 'saved' ? 'Saved (Draft)' : 'Settled & Paid'}
                </span>
              </div>
            </div>

            <div style={{ borderTop: '1px dashed #d1d5db', borderBottom: '1px dashed #d1d5db', padding: '12px 0', marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: '700' }}>Purchased Items</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(previewBill.items || []).map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <div>
                      <div style={{ fontWeight: '600' }}>{item.name}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>
                        ₹{item.price} x {item.unit === 'Weight' ? `${item.quantity}kg` : item.quantity}
                      </div>
                    </div>
                    <div style={{ fontWeight: '700' }}>₹{Number(item.total).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', marginBottom: '20px' }}>
              {previewBill.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                  <span>Discount</span>
                  <span>-₹{previewBill.discount}</span>
                </div>
              )}
              {previewBill.isIGST && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0284c7', fontWeight: '600' }}>
                  <span>IGST ({previewBill.igstRate || 5}%)</span>
                  <span>+₹{Number(previewBill.igstAmount || 0).toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '15px' }}>
                <span>Grand Total</span>
                <span>₹{Number(previewBill.totalAmount || 0).toFixed(2)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="polaris-btn" 
                style={{ 
                  flex: 1, 
                  justifyContent: 'center',
                  background: '#047857',
                  color: '#ffffff',
                  fontWeight: '700',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                onClick={() => {
                  const b = previewBill;
                  setPreviewBill(null);
                  setA4InvoiceBill(b);
                }}
                title="Open A4 Tax Invoice Preview"
              >
                <FileText size={15} /> A4 Invoice
              </button>
              <button 
                className="polaris-btn polaris-btn-primary" 
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => {
                  handlePrintReceipt(previewBill);
                  setPreviewBill(null);
                }}
              >
                <Printer size={15} /> Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* A4 Invoice Preview Modal */}
      {a4InvoiceBill && (
        <A4InvoiceModal 
          bill={a4InvoiceBill} 
          onClose={() => setA4InvoiceBill(null)} 
        />
      )}
    </div>
  );
};

export default WalkInSales;
