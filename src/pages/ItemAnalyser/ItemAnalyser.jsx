import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Calendar,
  Package,
  Factory,
  Eye,
  X,
  Download,
  RefreshCw,
  Filter,
  CheckCircle2,
  Clock,
  Store,
  Tag,
  Sparkles,
  FileSpreadsheet,
  Box,
  Layers,
  FileText,
  TrendingUp,
  AlertCircle,
  LayoutGrid,
  Table as TableIcon
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import logo from '../../assets/logo.png';
import './ItemAnalyser.css';

// Helper to extract clean numeric Barcode ID (e.g. 1004)
const extractNumericBarcodeId = (item) => {
  if (!item) return '';
  const raw = (item.barcode || item.barcodeId || item.code || item.itemCode || '').toString().trim();
  if (raw && !/^[a-zA-Z0-9]{15,30}$/.test(raw)) {
    return raw;
  }
  const digits = (raw || item.id || '').replace(/[^0-9]/g, '');
  if (digits.length >= 4) {
    return digits.substring(0, 4);
  }
  return raw || '';
};

const getTodayStr = () => new Date().toISOString().split('T')[0];
const getTomorrowStr = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
};
const getYesterdayStr = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
};

const ItemAnalyser = () => {
  // Navigation / Mode Tab: 'item' or 'packing'
  const [activeTab, setActiveTab] = useState('item');

  // Firestore Data State
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stores, setStores] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter State for Item-Centric Analysis
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isChangingItem, setIsChangingItem] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [descFilterQuery, setDescFilterQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'cards'

  // Search & Filter State for Standalone Packing / Mfg Explorer
  const [standalonePackingQuery, setStandalonePackingQuery] = useState('');
  const [packingDate, setPackingDate] = useState(getTodayStr());

  // Modal State for Full Order View
  const [viewingOrder, setViewingOrder] = useState(null);

  // 1. Subscribe to Firestore Collections
  useEffect(() => {
    setLoading(true);

    const unsubItems = onSnapshot(
      query(collection(db, 'items'), orderBy('name', 'asc')),
      (snapshot) => {
        setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => {
        console.error('Error fetching items:', error);
        toast.error('Failed to load items');
      }
    );

    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching orders:', error);
        setLoading(false);
        toast.error('Failed to load orders');
      }
    );

    const unsubStores = onSnapshot(
      query(collection(db, 'stores'), orderBy('name', 'asc')),
      (snapshot) => {
        setStores(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    const unsubCategories = onSnapshot(
      query(collection(db, 'categories'), orderBy('name', 'asc')),
      (snapshot) => {
        setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );

    return () => {
      unsubItems();
      unsubOrders();
      unsubStores();
      unsubCategories();
    };
  }, []);

  // Category lookup map
  const categoryMap = useMemo(() => {
    const map = {};
    categories.forEach(c => {
      map[c.id] = c.name;
    });
    return map;
  }, [categories]);

  // Store lookup map
  const storeMap = useMemo(() => {
    const map = {};
    stores.forEach(s => {
      map[s.id] = s.name;
    });
    return map;
  }, [stores]);

  // 2. Search Matching Products (Only when search query is typed; no default list)
  const matchingProducts = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase();
    if (!q) return [];

    return items.filter(item => {
      const name = (item.name || '').toLowerCase();
      const barcode = (item.barcode || item.barcodeId || item.code || item.itemCode || '').toString().toLowerCase();
      const numBarcode = extractNumericBarcodeId(item).toLowerCase();
      const id = (item.id || '').toLowerCase();

      return name.includes(q) || barcode.includes(q) || numBarcode.includes(q) || id.includes(q);
    }).slice(0, 24); // Show top 24 matches
  }, [items, itemSearchQuery]);

  // Helper to determine if an orderItem matches the selectedItem
  const isItemMatch = (orderItem, targetItem) => {
    if (!orderItem || !targetItem) return false;

    // Check ID match
    if (orderItem.id && targetItem.id && String(orderItem.id) === String(targetItem.id)) return true;
    if (orderItem.itemId && targetItem.id && String(orderItem.itemId) === String(targetItem.id)) return true;
    if (orderItem.productId && targetItem.id && String(orderItem.productId) === String(targetItem.id)) return true;

    // Check Barcode match
    const targetBarcode = (targetItem.barcode || targetItem.barcodeId || targetItem.code || '').toString().trim().toLowerCase();
    const orderBarcode = (orderItem.barcode || orderItem.barcodeId || orderItem.code || '').toString().trim().toLowerCase();
    if (targetBarcode && orderBarcode && targetBarcode === orderBarcode) return true;

    // Check exact name match fallback
    const targetName = (targetItem.name || '').toString().trim().toLowerCase();
    const orderName = (orderItem.name || '').toString().trim().toLowerCase();
    if (targetName && orderName && targetName === orderName) return true;

    return false;
  };

  // 3. Filtered Orders for the Selected Item
  const itemOrdersAnalysis = useMemo(() => {
    if (!selectedItem) {
      return { ordersList: [], totalQty: 0, totalAmount: 0, notesCount: 0 };
    }

    const descQ = descFilterQuery.trim().toLowerCase();

    let totalQty = 0;
    let totalAmount = 0;
    let notesCount = 0;
    const ordersList = [];

    orders.forEach(order => {
      // Check Store Filter
      if (storeFilter !== 'all' && order.storeId !== storeFilter) {
        return;
      }

      // Check Date Filter (Delivery Date is primary standard)
      if (selectedDate && order.deliveryDate !== selectedDate) {
        return;
      }

      // Check if order contains the selected item
      const matchingItems = (order.items || []).filter(item => isItemMatch(item, selectedItem));
      if (matchingItems.length === 0) return;

      // Extract specific item metrics for this order
      const orderItemQty = matchingItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
      const orderItemTotal = matchingItems.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
      const itemNotes = matchingItems
        .map(it => it.description)
        .filter(Boolean);

      const hasItemNote = itemNotes.length > 0;
      const hasPackingNote = Boolean(order.pUnitDescription || order.packingNotes || order.packingInstructions);
      const hasMfgNote = Boolean(order.mUnitDescription);
      const hasGlobalNote = Boolean(order.globalDescription);

      if (hasItemNote || hasPackingNote || hasMfgNote || hasGlobalNote) {
        notesCount++;
      }

      // Check Packing & Manufacturing Description Search Filter
      if (descQ) {
        const matchesItemNote = itemNotes.some(n => n.toLowerCase().includes(descQ));
        const matchesPacking = (order.pUnitDescription || '').toLowerCase().includes(descQ) ||
          (order.packingNotes || '').toLowerCase().includes(descQ) ||
          (order.packingInstructions || '').toLowerCase().includes(descQ);
        const matchesMfg = (order.mUnitDescription || '').toLowerCase().includes(descQ);
        const matchesGlobal = (order.globalDescription || '').toLowerCase().includes(descQ);

        // Also check if any other item in this order has the description
        const matchesAnyItemDesc = (order.items || []).some(it => (it.description || '').toLowerCase().includes(descQ));

        if (!matchesItemNote && !matchesPacking && !matchesMfg && !matchesGlobal && !matchesAnyItemDesc) {
          return;
        }
      }

      totalQty += orderItemQty;
      totalAmount += orderItemTotal;

      ordersList.push({
        order,
        orderId: order.orderId || order.serialNumber || order.id?.substring(0, 8),
        customerName: order.customerName || `${order.customerFirstName || ''} ${order.customerLastName || ''}`.trim() || 'Walk-in Customer',
        customerPhone: order.customerPhone || order.customerMobile || '-',
        storeName: order.storeName || storeMap[order.storeId] || 'Store',
        deliveryDate: order.deliveryDate || '-',
        deliveryTime: order.deliveryTime || '-',
        status: order.status || 'new',
        paymentStatus: order.paymentStatus || 'Pending',
        matchingItems,
        orderItemQty,
        orderItemTotal,
        itemNotes,
        pUnitDescription: order.pUnitDescription || order.packingNotes || '',
        mUnitDescription: order.mUnitDescription || '',
        globalDescription: order.globalDescription || ''
      });
    });

    return { ordersList, totalQty, totalAmount, notesCount };
  }, [selectedItem, orders, selectedDate, descFilterQuery, storeFilter, storeMap]);

  // 4. Standalone Packing & Manufacturing Explorer Results
  const standalonePackingResults = useMemo(() => {
    const q = standalonePackingQuery.trim().toLowerCase();

    let totalOrders = 0;
    const matchingOrdersList = [];

    orders.forEach(order => {
      // Date filter
      if (packingDate && order.deliveryDate !== packingDate) {
        return;
      }

      const pDesc = (order.pUnitDescription || order.packingNotes || order.packingInstructions || '').toLowerCase();
      const mDesc = (order.mUnitDescription || '').toLowerCase();
      const gDesc = (order.globalDescription || '').toLowerCase();

      // Check item notes in order
      const itemsWithNotes = (order.items || []).filter(it => it.description && it.description.trim() !== '');
      const hasAnyItemDesc = itemsWithNotes.some(it => it.description.toLowerCase().includes(q));

      // If search query is empty, show all orders that HAVE at least one packing or mfg note
      if (!q) {
        if (!pDesc && !mDesc && !gDesc && itemsWithNotes.length === 0) return;
      } else {
        const matchesP = pDesc.includes(q);
        const matchesM = mDesc.includes(q);
        const matchesG = gDesc.includes(q);
        if (!matchesP && !matchesM && !matchesG && !hasAnyItemDesc) return;
      }

      totalOrders++;
      matchingOrdersList.push({
        order,
        orderId: order.orderId || order.serialNumber || order.id?.substring(0, 8),
        customerName: order.customerName || 'Customer',
        customerPhone: order.customerPhone || '-',
        storeName: order.storeName || storeMap[order.storeId] || 'Store',
        deliveryDate: order.deliveryDate || '-',
        deliveryTime: order.deliveryTime || '-',
        status: order.status || 'new',
        pUnitDescription: order.pUnitDescription || order.packingNotes || '',
        mUnitDescription: order.mUnitDescription || '',
        globalDescription: order.globalDescription || '',
        items: order.items || [],
        itemsWithNotes
      });
    });

    return { matchingOrdersList, totalOrders };
  }, [orders, standalonePackingQuery, packingDate, storeMap]);

  // Export Analyzed Orders to Excel
  const handleExportExcel = () => {
    if (!selectedItem || itemOrdersAnalysis.ordersList.length === 0) {
      toast.error('No orders available to export');
      return;
    }

    const dataRows = itemOrdersAnalysis.ordersList.map(entry => ({
      'Order ID': entry.orderId,
      'Delivery Date': entry.deliveryDate,
      'Delivery Time': entry.deliveryTime,
      'Customer Name': entry.customerName,
      'Customer Phone': entry.customerPhone,
      'Store': entry.storeName,
      'Item Name': selectedItem.name,
      'Item Barcode ID': extractNumericBarcodeId(selectedItem),
      'Quantity': `${entry.orderItemQty} ${selectedItem.unit === 'Weight' ? 'kg' : 'pcs'}`,
      'Item Amount (₹)': entry.orderItemTotal,
      'Item Note / Instructions': entry.itemNotes.join('; ') || 'None',
      'Packing Unit Description': entry.pUnitDescription || 'None',
      'Mfg Unit Description': entry.mUnitDescription || 'None',
      'Order Note': entry.globalDescription || 'None',
      'Order Status': entry.status,
      'Payment Status': entry.paymentStatus
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Item Orders');
    const fileName = `Item_Analysis_${selectedItem.name.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedDate || 'all'}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success('Orders exported to Excel successfully!');
  };

  // Status Badge Class
  const getStatusBadgeClass = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('delivered')) return 'delivered';
    if (s.includes('ready')) return 'ready';
    if (s.includes('progress') || s.includes('started')) return 'progress';
    return 'new';
  };

  const getPaymentBadgeClass = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'paid') return 'paid';
    if (s === 'partial') return 'partial';
    return 'pending';
  };

  // Helper to highlight search query inside text
  const highlightMatch = (text, query) => {
    if (!text) return null;
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <span key={index} className="ia-highlight-span">{part}</span>
      ) : (
        part
      )
    );
  };

  return (
    <div className="ia-root item-analyser-container">
      {/* Page Header Bar */}
      <div className="ia-header-bar">
        <div className="ia-header-title-group">
          <div className="ia-header-icon-box">
            <Package size={22} />
          </div>
          <div>
            <h1 className="ia-page-title">Item Analyser</h1>
            <p className="ia-page-subtitle">
              Search items by Product ID, Barcode, or Name to analyze order presence, manufacturing instructions, and packing notes across dates.
            </p>
          </div>
        </div>

        <div className="ia-header-actions-group">
          {selectedItem && itemOrdersAnalysis.ordersList.length > 0 && (
            <button className="ia-action-button success" onClick={handleExportExcel} title="Download Excel Report">
              <Download size={14} /> Export to Excel
            </button>
          )}
        </div>
      </div>

      {/* Mode Navigation Tabs */}
      <div className="ia-mode-tabs-wrapper">
        <button
          className={`ia-mode-tab-button ${activeTab === 'item' ? 'active' : ''}`}
          onClick={() => setActiveTab('item')}
        >
          <Layers size={14} /> Item-Based Analysis
        </button>
        <button
          className={`ia-mode-tab-button ${activeTab === 'packing' ? 'active' : ''}`}
          onClick={() => setActiveTab('packing')}
        >
          <Package size={14} /> Packing & Mfg Notes Explorer
        </button>
      </div>

      {/* ================= TAB 1: ITEM-BASED ANALYSIS ================= */}
      {activeTab === 'item' && (
        <>
          {/* SEARCH SECTION: Shown when NO item is selected OR when user clicks "Change Item" */}
          {(!selectedItem || isChangingItem) && (
            <div className="ia-search-panel-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {selectedItem ? 'Search to Change Product' : 'Search Product to Analyze'}
                </span>
                {isChangingItem && selectedItem && (
                  <button
                    className="ia-action-button outline"
                    style={{ height: '28px', padding: '0 10px', fontSize: '11.5px' }}
                    onClick={() => {
                      setIsChangingItem(false);
                      setItemSearchQuery('');
                    }}
                  >
                    Keep "{selectedItem.name}"
                  </button>
                )}
              </div>

              <div className="ia-search-bar-row">
                <Search size={18} style={{ color: '#94a3b8', marginRight: '6px' }} />
                <input
                  type="text"
                  className="ia-search-field-input"
                  placeholder="Type Product Name, Barcode ID (e.g. 1004), or Item ID..."
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  autoFocus
                />
                {itemSearchQuery && (
                  <button
                    className="ia-search-clear-icon-btn"
                    onClick={() => setItemSearchQuery('')}
                    title="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="ia-search-guide-hints">
                <span>Quick search by:</span>
                <span className="ia-guide-pill">Name (e.g. Kaju Katli)</span>
                <span className="ia-guide-pill">Barcode ID (e.g. 1004)</span>
                <span className="ia-guide-pill">Item ID</span>
              </div>

              {/* Display Matching Products only when query is entered */}
              {itemSearchQuery.trim().length > 0 && (
                <div className="ia-products-results-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
                      Found {matchingProducts.length} related product{matchingProducts.length === 1 ? '' : 's'}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      Click an item below to select and view orders
                    </span>
                  </div>

                  {matchingProducts.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      No products found matching "<strong>{itemSearchQuery}</strong>". Try a different name or barcode ID.
                    </div>
                  ) : (
                    <div className="ia-products-grid-list">
                      {matchingProducts.map((item) => {
                        const isSelected = selectedItem?.id === item.id;
                        const numericBarcode = extractNumericBarcodeId(item);
                        return (
                          <div
                            key={item.id}
                            className="ia-product-pick-card"
                            onClick={() => {
                              setSelectedItem(item);
                              setIsChangingItem(false);
                              setItemSearchQuery('');
                              toast.success(`Selected ${item.name}`);
                            }}
                          >
                            <img
                              src={item.image || logo}
                              alt={item.name}
                              className="ia-product-thumb"
                              onError={(e) => { e.target.src = logo; }}
                            />
                            <div className="ia-product-meta-wrap">
                              <div className="ia-product-title-text" title={item.name}>{item.name}</div>
                              <div className="ia-product-sub-badges">
                                {numericBarcode && (
                                  <span className="ia-tag-barcode">#{numericBarcode}</span>
                                )}
                                <span className="ia-tag-price">₹{item.price || 0}</span>
                                <span className="ia-tag-unit">{item.unit || 'Weight'}</span>
                                {item.categoryId && categoryMap[item.categoryId] && (
                                  <span className="ia-tag-unit">{categoryMap[item.categoryId]}</span>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <CheckCircle2 size={18} color="var(--primary-color)" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Initial Clean Prompt (when no item is selected and no search typed) */}
          {!selectedItem && itemSearchQuery.trim().length === 0 && (
            <div className="ia-empty-search-prompt">
              <div className="ia-empty-icon-circle">
                <Search size={24} />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937', marginBottom: '4px' }}>
                No Item Selected Yet
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '460px', margin: '0 auto' }}>
                Use the search bar above to type any Product ID, Barcode ID, or Item Name. Once you pick an item, you will see all its orders, dates, and packing/manufacturing instructions.
              </p>
            </div>
          )}

          {/* ================= ACTIVE SELECTED PRODUCT SHOWCASE ================= */}
          {selectedItem && (
            <>
              {/* Product Showcase Banner */}
              <div className="ia-active-item-banner">
                <div className="ia-active-item-left">
                  <img
                    src={selectedItem.image || logo}
                    alt={selectedItem.name}
                    className="ia-active-item-img"
                    onError={(e) => { e.target.src = logo; }}
                  />
                  <div className="ia-active-item-details">
                    <h2 className="ia-active-item-name">{selectedItem.name}</h2>
                    <div className="ia-active-item-tags-row">
                      <span className="ia-item-spec-chip">
                        Barcode ID: {extractNumericBarcodeId(selectedItem) || selectedItem.barcode || selectedItem.barcodeId || 'N/A'}
                      </span>
                      <span className="ia-item-spec-chip">
                        Unit: {selectedItem.unit || 'Weight'}
                      </span>
                      <span className="ia-item-spec-chip">
                        Price: ₹{selectedItem.price || 0}
                      </span>
                      {selectedItem.categoryId && categoryMap[selectedItem.categoryId] && (
                        <span className="ia-item-spec-chip">
                          Category: {categoryMap[selectedItem.categoryId]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="ia-active-item-actions">
                  <button
                    className="ia-banner-btn"
                    onClick={() => setIsChangingItem(prev => !prev)}
                    title="Search and switch to a different product"
                  >
                    <RefreshCw size={13} /> {isChangingItem ? 'Hide Search' : 'Change Product'}
                  </button>
                  <button
                    className="ia-banner-btn"
                    onClick={() => {
                      setSelectedItem(null);
                      setIsChangingItem(false);
                      setItemSearchQuery('');
                    }}
                    title="Clear selection"
                  >
                    <X size={13} /> Clear
                  </button>
                </div>
              </div>

              {/* Filter Controls Toolbar: Date + Packing Description + Store */}
              <div className="ia-filters-toolbar-card">
                <div className="ia-filters-three-cols">
                  {/* Column 1: Date Filter */}
                  <div className="ia-filter-col-item">
                    <label className="ia-filter-col-label">
                      <Calendar size={13} /> Delivery Date
                    </label>
                    <div className="ia-control-input-wrapper">
                      <input
                        type="date"
                        className="ia-control-text-input"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                      />
                      {selectedDate && (
                        <button
                          className="ia-input-right-clear-btn"
                          onClick={() => setSelectedDate('')}
                          title="Clear date"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    {/* Date Quick Chips */}
                    <div className="ia-quick-chips-bar">
                      <button
                        type="button"
                        className={`ia-chip-btn ${selectedDate === getTodayStr() ? 'active' : ''}`}
                        onClick={() => setSelectedDate(getTodayStr())}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        className={`ia-chip-btn ${selectedDate === getTomorrowStr() ? 'active' : ''}`}
                        onClick={() => setSelectedDate(getTomorrowStr())}
                      >
                        Tomorrow
                      </button>
                      <button
                        type="button"
                        className={`ia-chip-btn ${selectedDate === getYesterdayStr() ? 'active' : ''}`}
                        onClick={() => setSelectedDate(getYesterdayStr())}
                      >
                        Yesterday
                      </button>
                      <button
                        type="button"
                        className={`ia-chip-btn ${!selectedDate ? 'active' : ''}`}
                        onClick={() => setSelectedDate('')}
                      >
                        All Dates
                      </button>
                    </div>
                  </div>

                  {/* Column 2: Packing & Manufacturing Description Search */}
                  <div className="ia-filter-col-item">
                    <label className="ia-filter-col-label">
                      <Factory size={13} /> Packing & Mfg Description Search
                    </label>
                    <div className="ia-control-input-wrapper">
                      <Search size={14} className="ia-input-left-icon" />
                      <input
                        type="text"
                        className="ia-control-text-input has-left-icon"
                        placeholder="Filter by packing note, box notes, sweetness..."
                        value={descFilterQuery}
                        onChange={(e) => setDescFilterQuery(e.target.value)}
                      />
                      {descFilterQuery && (
                        <button
                          className="ia-input-right-clear-btn"
                          onClick={() => setDescFilterQuery('')}
                          title="Clear description filter"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      Filters orders by item note, packing unit note, or mfg note
                    </span>
                  </div>

                  {/* Column 3: Store Filter */}
                  <div className="ia-filter-col-item">
                    <label className="ia-filter-col-label">
                      <Store size={13} /> Store / Branch
                    </label>
                    <div className="ia-control-input-wrapper">
                      <select
                        className="ia-control-text-input"
                        value={storeFilter}
                        onChange={(e) => setStoreFilter(e.target.value)}
                      >
                        <option value="all">All Stores</option>
                        {stores.map(st => (
                          <option key={st.id} value={st.id}>{st.name}</option>
                        ))}
                      </select>
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      Showing orders across selected branch
                    </span>
                  </div>
                </div>
              </div>

              {/* Analytics Summary Grid */}
              <div className="ia-metrics-cards-grid">
                <div className="ia-metric-card">
                  <div className="ia-metric-icon-circle green">
                    <FileText size={20} />
                  </div>
                  <div className="ia-metric-data">
                    <span className="ia-metric-label-text">Orders Count</span>
                    <span className="ia-metric-val-text">{itemOrdersAnalysis.ordersList.length}</span>
                    <span className="ia-metric-sub-text">
                      {selectedDate ? formatDate(selectedDate) : 'All Dates'}
                    </span>
                  </div>
                </div>

                <div className="ia-metric-card">
                  <div className="ia-metric-icon-circle blue">
                    <Box size={20} />
                  </div>
                  <div className="ia-metric-data">
                    <span className="ia-metric-label-text">Total Quantity</span>
                    <span className="ia-metric-val-text">
                      {itemOrdersAnalysis.totalQty.toFixed(selectedItem.unit === 'Weight' ? 2 : 0)}{' '}
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>
                        {selectedItem.unit === 'Weight' ? 'kg' : 'pcs'}
                      </span>
                    </span>
                    <span className="ia-metric-sub-text">Sum across matching orders</span>
                  </div>
                </div>

                <div className="ia-metric-card">
                  <div className="ia-metric-icon-circle purple">
                    <TrendingUp size={20} />
                  </div>
                  <div className="ia-metric-data">
                    <span className="ia-metric-label-text">Item Revenue</span>
                    <span className="ia-metric-val-text">
                      ₹{itemOrdersAnalysis.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                    <span className="ia-metric-sub-text">From selected item sales</span>
                  </div>
                </div>

                <div className="ia-metric-card">
                  <div className="ia-metric-icon-circle amber">
                    <Sparkles size={20} />
                  </div>
                  <div className="ia-metric-data">
                    <span className="ia-metric-label-text">With Special Notes</span>
                    <span className="ia-metric-val-text">{itemOrdersAnalysis.notesCount}</span>
                    <span className="ia-metric-sub-text">Packing or Mfg instructions</span>
                  </div>
                </div>
              </div>

              {/* Orders Results Section */}
              <div className="ia-orders-section-card">
                <div className="ia-orders-section-topbar">
                  <div className="ia-orders-count-indicator">
                    <span>Orders containing <strong>{selectedItem.name}</strong></span>
                    <span className="ia-orders-pill-badge">{itemOrdersAnalysis.ordersList.length} Orders</span>
                    {descFilterQuery && (
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        (Description: "<strong>{descFilterQuery}</strong>")
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {selectedDate && (
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        Selected Date: <strong>{formatDate(selectedDate)}</strong>
                      </span>
                    )}
                    <div className="ia-view-toggle-group">
                      <button
                        className={`ia-view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                        onClick={() => setViewMode('table')}
                        title="Table View"
                      >
                        <TableIcon size={12} /> Table
                      </button>
                      <button
                        className={`ia-view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
                        onClick={() => setViewMode('cards')}
                        title="Cards View"
                      >
                        <LayoutGrid size={12} /> Cards
                      </button>
                    </div>
                  </div>
                </div>

                {itemOrdersAnalysis.ordersList.length === 0 ? (
                  <div className="ia-empty-orders-view">
                    <AlertCircle size={28} style={{ color: '#94a3b8' }} />
                    <h3>No Orders Found</h3>
                    <p style={{ fontSize: '12.5px', maxWidth: '420px', margin: '0 auto' }}>
                      No orders contain <strong>{selectedItem.name}</strong> for {selectedDate ? formatDate(selectedDate) : 'the selected criteria'}.
                      {descFilterQuery && ' Try clearing the packing/manufacturing description filter.'}
                    </p>
                  </div>
                ) : viewMode === 'table' ? (
                  /* Table View */
                  <div className="ia-table-scroll-container">
                    <table className="ia-orders-data-table">
                      <thead>
                        <tr>
                          <th>Order #</th>
                          <th>Customer</th>
                          <th>Store</th>
                          <th>Delivery Date & Time</th>
                          <th>Item Qty & Total</th>
                          <th>Packing & Mfg Descriptions</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemOrdersAnalysis.ordersList.map((entry) => (
                          <tr key={entry.order.id}>
                            {/* Order ID */}
                            <td>
                              <span
                                className="ia-cell-order-number"
                                onClick={() => setViewingOrder(entry.order)}
                                title="Click to view full order"
                              >
                                #{entry.orderId}
                              </span>
                            </td>

                            {/* Customer */}
                            <td>
                              <div className="ia-customer-details-block">
                                <span className="ia-cust-name">{entry.customerName}</span>
                                <span className="ia-cust-phone">{entry.customerPhone}</span>
                              </div>
                            </td>

                            {/* Store */}
                            <td>
                              <span style={{ fontWeight: 600 }}>{entry.storeName}</span>
                            </td>

                            {/* Delivery Date & Time */}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600 }}>{formatDate(entry.deliveryDate)}</span>
                                <span style={{ fontSize: '11px', color: '#64748b' }}>{entry.deliveryTime || 'Standard'}</span>
                              </div>
                            </td>

                            {/* Item Qty & Total in this Order */}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>
                                  {entry.orderItemQty} {selectedItem.unit === 'Weight' ? 'kg' : 'pcs'}
                                </span>
                                <span style={{ fontSize: '11px', color: '#64748b' }}>
                                  ₹{entry.orderItemTotal}
                                </span>
                              </div>
                            </td>

                            {/* Descriptions / Instructions */}
                            <td>
                              <div className="ia-table-notes-container">
                                {/* Item Note */}
                                {entry.itemNotes.length > 0 && entry.itemNotes.map((note, idx) => (
                                  <div key={idx} className="ia-note-bubble item-note" title="Item Note">
                                    <span className="ia-note-tag-prefix">💡 Item Note</span>
                                    <span>{highlightMatch(note, descFilterQuery)}</span>
                                  </div>
                                ))}

                                {/* Packing Unit Description */}
                                {entry.pUnitDescription && (
                                  <div className="ia-note-bubble packing-note" title="Packing Unit Note">
                                    <span className="ia-note-tag-prefix">📦 Packing</span>
                                    <span>{highlightMatch(entry.pUnitDescription, descFilterQuery)}</span>
                                  </div>
                                )}

                                {/* Manufacturing Unit Description */}
                                {entry.mUnitDescription && (
                                  <div className="ia-note-bubble mfg-note" title="Manufacturing Unit Note">
                                    <span className="ia-note-tag-prefix">⚙️ Mfg</span>
                                    <span>{highlightMatch(entry.mUnitDescription, descFilterQuery)}</span>
                                  </div>
                                )}

                                {/* General Order Note */}
                                {entry.globalDescription && (
                                  <div className="ia-note-bubble global-note" title="General Order Note">
                                    <span className="ia-note-tag-prefix">📝 Note</span>
                                    <span>{highlightMatch(entry.globalDescription, descFilterQuery)}</span>
                                  </div>
                                )}

                                {!entry.itemNotes.length && !entry.pUnitDescription && !entry.mUnitDescription && !entry.globalDescription && (
                                  <span style={{ fontSize: '11.5px', color: '#94a3b8', fontStyle: 'italic' }}>
                                    Standard preparation
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Status */}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <span className={`ia-status-pill ${getStatusBadgeClass(entry.status)}`}>
                                  {entry.status}
                                </span>
                                <span className={`ia-status-pill ${getPaymentBadgeClass(entry.paymentStatus)}`}>
                                  {entry.paymentStatus}
                                </span>
                              </div>
                            </td>

                            {/* Action */}
                            <td>
                              <button
                                className="ia-action-button outline"
                                style={{ height: '30px', padding: '0 8px', fontSize: '11.5px' }}
                                onClick={() => setViewingOrder(entry.order)}
                                title="View entire order"
                              >
                                <Eye size={12} /> View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Cards View */
                  <div className="ia-cards-view-grid">
                    {itemOrdersAnalysis.ordersList.map((entry) => (
                      <div key={entry.order.id} className="ia-order-tile-card">
                        <div className="ia-order-tile-top">
                          <div>
                            <span
                              className="ia-cell-order-number"
                              onClick={() => setViewingOrder(entry.order)}
                            >
                              #{entry.orderId}
                            </span>
                            <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '6px' }}>
                              • {entry.storeName}
                            </span>
                          </div>
                          <span className={`ia-status-pill ${getStatusBadgeClass(entry.status)}`}>
                            {entry.status}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
                          <div>
                            <strong>{entry.customerName}</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{entry.customerPhone}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong style={{ color: 'var(--primary-color)' }}>
                              {entry.orderItemQty} {selectedItem.unit === 'Weight' ? 'kg' : 'pcs'}
                            </strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>₹{entry.orderItemTotal}</div>
                          </div>
                        </div>

                        <div style={{ fontSize: '11.5px', color: '#475569' }}>
                          📅 Delivery: <strong>{formatDate(entry.deliveryDate)}</strong> {entry.deliveryTime && `(${entry.deliveryTime})`}
                        </div>

                        {/* Descriptions */}
                        {(entry.itemNotes.length > 0 || entry.pUnitDescription || entry.mUnitDescription) && (
                          <div className="ia-table-notes-container" style={{ maxWidth: '100%' }}>
                            {entry.itemNotes.map((note, idx) => (
                              <div key={idx} className="ia-note-bubble item-note">
                                <span className="ia-note-tag-prefix">💡 Item</span>
                                <span>{highlightMatch(note, descFilterQuery)}</span>
                              </div>
                            ))}
                            {entry.pUnitDescription && (
                              <div className="ia-note-bubble packing-note">
                                <span className="ia-note-tag-prefix">📦 Pack</span>
                                <span>{highlightMatch(entry.pUnitDescription, descFilterQuery)}</span>
                              </div>
                            )}
                            {entry.mUnitDescription && (
                              <div className="ia-note-bubble mfg-note">
                                <span className="ia-note-tag-prefix">⚙️ Mfg</span>
                                <span>{highlightMatch(entry.mUnitDescription, descFilterQuery)}</span>
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                          <button
                            className="ia-action-button outline"
                            style={{ height: '28px', padding: '0 10px', fontSize: '11.5px' }}
                            onClick={() => setViewingOrder(entry.order)}
                          >
                            <Eye size={12} /> Inspect Order
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ================= TAB 2: PACKING & MFG NOTES EXPLORER ================= */}
      {activeTab === 'packing' && (
        <div className="ia-standalone-explorer-view">
          {/* Controls Bar for Standalone Packing Search */}
          <div className="ia-filters-toolbar-card">
            <div className="ia-filters-three-cols">
              {/* Search by Packing / Mfg Note */}
              <div className="ia-filter-col-item" style={{ gridColumn: 'span 2' }}>
                <label className="ia-filter-col-label">
                  <Package size={13} /> Search by Packing or Manufacturing Description
                </label>
                <div className="ia-control-input-wrapper">
                  <Search size={14} className="ia-input-left-icon" />
                  <input
                    type="text"
                    className="ia-control-text-input has-left-icon"
                    placeholder="Search packing note or instruction (e.g. gift box, ribbon, extra packing, less sweet)..."
                    value={standalonePackingQuery}
                    onChange={(e) => setStandalonePackingQuery(e.target.value)}
                    autoFocus
                  />
                  {standalonePackingQuery && (
                    <button
                      className="ia-input-right-clear-btn"
                      onClick={() => setStandalonePackingQuery('')}
                      title="Clear search"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Searches packing unit notes, manufacturing notes, and item-level packing instructions across all orders
                </span>
              </div>

              {/* Date Filter */}
              <div className="ia-filter-col-item">
                <label className="ia-filter-col-label">
                  <Calendar size={13} /> Delivery Date
                </label>
                <div className="ia-control-input-wrapper">
                  <input
                    type="date"
                    className="ia-control-text-input"
                    value={packingDate}
                    onChange={(e) => setPackingDate(e.target.value)}
                  />
                  {packingDate && (
                    <button
                      className="ia-input-right-clear-btn"
                      onClick={() => setPackingDate('')}
                      title="Clear date"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div className="ia-quick-chips-bar">
                  <button
                    type="button"
                    className={`ia-chip-btn ${packingDate === getTodayStr() ? 'active' : ''}`}
                    onClick={() => setPackingDate(getTodayStr())}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className={`ia-chip-btn ${packingDate === getTomorrowStr() ? 'active' : ''}`}
                    onClick={() => setPackingDate(getTomorrowStr())}
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    className={`ia-chip-btn ${!packingDate ? 'active' : ''}`}
                    onClick={() => setPackingDate('')}
                  >
                    All Dates
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Results Header with Required Orders Count */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div className="ia-orders-count-indicator">
              <span>Orders with Packing / Mfg Instructions</span>
              <span className="ia-orders-pill-badge">{standalonePackingResults.totalOrders} Orders Found</span>
              {standalonePackingQuery && (
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Matching: "<strong>{standalonePackingQuery}</strong>"
                </span>
              )}
            </div>

            {packingDate && (
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Delivery Date: <strong>{formatDate(packingDate)}</strong>
              </span>
            )}
          </div>

          {/* Orders List */}
          {standalonePackingResults.matchingOrdersList.length === 0 ? (
            <div className="ia-empty-orders-view" style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e1e3e5' }}>
              <Package size={28} style={{ color: '#94a3b8' }} />
              <h3>No Orders Matching Packing Description</h3>
              <p style={{ fontSize: '12.5px', maxWidth: '420px', margin: '0 auto' }}>
                {standalonePackingQuery
                  ? `No orders found matching "${standalonePackingQuery}" for ${packingDate ? formatDate(packingDate) : 'all dates'}.`
                  : `No orders recorded with special packing or manufacturing instructions for ${packingDate ? formatDate(packingDate) : 'all dates'}.`}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {standalonePackingResults.matchingOrdersList.map((entry) => (
                <div key={entry.order.id} className="ia-packing-entry-tile">
                  <div className="ia-packing-tile-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span
                        className="ia-cell-order-number"
                        onClick={() => setViewingOrder(entry.order)}
                        title="Click to view full order"
                      >
                        #{entry.orderId}
                      </span>
                      <strong style={{ color: '#1f2937' }}>{entry.customerName}</strong>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>{entry.customerPhone}</span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>• Store: <strong>{entry.storeName}</strong></span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', color: '#475569' }}>
                        📅 Delivery: <strong>{formatDate(entry.deliveryDate)}</strong> {entry.deliveryTime && `(${entry.deliveryTime})`}
                      </span>
                      <span className={`ia-status-pill ${getStatusBadgeClass(entry.status)}`}>
                        {entry.status}
                      </span>
                      <button
                        className="ia-action-button outline"
                        style={{ height: '28px', padding: '0 8px', fontSize: '11px' }}
                        onClick={() => setViewingOrder(entry.order)}
                      >
                        <Eye size={12} /> View
                      </button>
                    </div>
                  </div>

                  {/* Packing & Mfg Descriptions Highlight */}
                  <div className="ia-table-notes-container" style={{ maxWidth: '100%' }}>
                    {entry.pUnitDescription && (
                      <div className="ia-note-bubble packing-note">
                        <span className="ia-note-tag-prefix">📦 Packing Unit Instruction</span>
                        <span>{highlightMatch(entry.pUnitDescription, standalonePackingQuery)}</span>
                      </div>
                    )}

                    {entry.mUnitDescription && (
                      <div className="ia-note-bubble mfg-note">
                        <span className="ia-note-tag-prefix">⚙️ Mfg Unit Instruction</span>
                        <span>{highlightMatch(entry.mUnitDescription, standalonePackingQuery)}</span>
                      </div>
                    )}

                    {entry.globalDescription && (
                      <div className="ia-note-bubble global-note">
                        <span className="ia-note-tag-prefix">📝 Order Note</span>
                        <span>{highlightMatch(entry.globalDescription, standalonePackingQuery)}</span>
                      </div>
                    )}
                  </div>

                  {/* Items inside this order */}
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>
                      Order Items:
                    </span>
                    <div className="ia-packing-items-chips">
                      {entry.items.map((it, idx) => (
                        <div key={idx} className="ia-packing-item-pill">
                          <span>{it.name}</span>
                          <strong style={{ color: 'var(--primary-color)' }}>
                            {it.quantity} {it.unit === 'Weight' ? 'kg' : 'pcs'}
                          </strong>
                          {it.description && (
                            <span style={{ background: '#fffbeb', color: '#92400e', padding: '1px 5px', borderRadius: '3px', fontSize: '11px', fontWeight: 600 }}>
                              💡 {highlightMatch(it.description, standalonePackingQuery)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= VIEW FULL ORDER DETAILS MODAL ================= */}
      {viewingOrder && (
        <div className="ia-details-modal-overlay" onClick={() => setViewingOrder(null)}>
          <div className="ia-details-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ia-modal-header-bar">
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#1f2937' }}>
                Order #{viewingOrder.orderId || viewingOrder.serialNumber || viewingOrder.id?.substring(0, 8)} Details
              </h2>
              <button
                className="ia-modal-close-icon-btn"
                onClick={() => setViewingOrder(null)}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="ia-modal-content-body">
              {/* Info Grid */}
              <div className="ia-modal-info-metrics">
                <div className="ia-modal-meta-entry">
                  <span className="ia-modal-meta-label">Customer</span>
                  <span className="ia-modal-meta-val">
                    {viewingOrder.customerName || `${viewingOrder.customerFirstName || ''} ${viewingOrder.customerLastName || ''}`.trim() || 'N/A'}
                  </span>
                </div>
                <div className="ia-modal-meta-entry">
                  <span className="ia-modal-meta-label">Phone</span>
                  <span className="ia-modal-meta-val">{viewingOrder.customerPhone || viewingOrder.customerMobile || 'N/A'}</span>
                </div>
                <div className="ia-modal-meta-entry">
                  <span className="ia-modal-meta-label">Store</span>
                  <span className="ia-modal-meta-val">{viewingOrder.storeName || storeMap[viewingOrder.storeId] || 'Main'}</span>
                </div>
                <div className="ia-modal-meta-entry">
                  <span className="ia-modal-meta-label">Delivery Date</span>
                  <span className="ia-modal-meta-val">{formatDate(viewingOrder.deliveryDate)} ({viewingOrder.deliveryTime || 'Standard'})</span>
                </div>
                <div className="ia-modal-meta-entry">
                  <span className="ia-modal-meta-label">Status</span>
                  <span className="ia-modal-meta-val">
                    <span className={`ia-status-pill ${getStatusBadgeClass(viewingOrder.status)}`}>
                      {viewingOrder.status || 'new'}
                    </span>
                  </span>
                </div>
                <div className="ia-modal-meta-entry">
                  <span className="ia-modal-meta-label">Total Amount</span>
                  <span className="ia-modal-meta-val" style={{ color: 'var(--primary-color)', fontSize: '14px', fontWeight: 700 }}>
                    ₹{viewingOrder.totalAmount || 0}
                  </span>
                </div>
              </div>

              {/* Instructions */}
              {(viewingOrder.pUnitDescription || viewingOrder.mUnitDescription || viewingOrder.globalDescription) && (
                <div className="ia-table-notes-container" style={{ maxWidth: '100%' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#616467', textTransform: 'uppercase' }}>
                    Order Instructions & Packing Notes:
                  </span>
                  {viewingOrder.pUnitDescription && (
                    <div className="ia-note-bubble packing-note">
                      <span className="ia-note-tag-prefix">📦 Packing Unit Description</span>
                      <span>{viewingOrder.pUnitDescription}</span>
                    </div>
                  )}
                  {viewingOrder.mUnitDescription && (
                    <div className="ia-note-bubble mfg-note">
                      <span className="ia-note-tag-prefix">⚙️ Manufacturing Unit Description</span>
                      <span>{viewingOrder.mUnitDescription}</span>
                    </div>
                  )}
                  {viewingOrder.globalDescription && (
                    <div className="ia-note-bubble global-note">
                      <span className="ia-note-tag-prefix">📝 Order Note</span>
                      <span>{viewingOrder.globalDescription}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Order Items List */}
              <div>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#1f2937', marginBottom: '8px', display: 'block' }}>
                  All Items in this Order ({viewingOrder.items?.length || 0})
                </span>
                <table className="ia-orders-data-table" style={{ border: '1px solid #e1e3e5', borderRadius: '6px' }}>
                  <thead>
                    <tr>
                      <th>Item Name</th>
                      <th>Quantity</th>
                      <th>Price</th>
                      <th>Total</th>
                      <th>Manufacturing / Packing Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewingOrder.items || []).map((it, idx) => {
                      const isTarget = selectedItem && isItemMatch(it, selectedItem);
                      return (
                        <tr key={idx} style={{ background: isTarget ? '#f0fdf4' : 'transparent' }}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {isTarget && <CheckCircle2 size={13} color="var(--primary-color)" />}
                              <span style={{ fontWeight: isTarget ? 600 : 500 }}>{it.name}</span>
                            </div>
                          </td>
                          <td>
                            {it.quantity} {it.unit === 'Weight' ? 'kg' : 'pcs'}
                          </td>
                          <td>₹{it.price || 0}</td>
                          <td style={{ fontWeight: 600 }}>₹{it.total || 0}</td>
                          <td>
                            {it.description ? (
                              <span style={{ background: '#fffbeb', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                                💡 {it.description}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #e1e3e5', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
              <button
                className="ia-action-button outline"
                onClick={() => setViewingOrder(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemAnalyser;
