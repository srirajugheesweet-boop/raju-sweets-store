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
  CheckCircle2,
  Store,
  Tag,
  Sparkles,
  Box,
  FileText,
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
  // Firestore Data State
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stores, setStores] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isChangingItem, setIsChangingItem] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [selectedPackingDesc, setSelectedPackingDesc] = useState('all');
  const [descFilterQuery, setDescFilterQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'cards'

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

  // 3. Candidate Orders containing the selected item (filtered by date & store)
  const candidateOrders = useMemo(() => {
    if (!selectedItem) return [];

    return orders.filter(order => {
      // Store filter
      if (storeFilter !== 'all' && order.storeId !== storeFilter) {
        return false;
      }
      // Date filter
      if (selectedDate && order.deliveryDate !== selectedDate) {
        return false;
      }
      // Contains the selected item
      return (order.items || []).some(item => isItemMatch(item, selectedItem));
    });
  }, [selectedItem, orders, selectedDate, storeFilter]);

  // 4. Extract Unique Packing Descriptions from candidate orders with counts
  const uniquePackingDescriptions = useMemo(() => {
    if (!selectedItem || candidateOrders.length === 0) return [];
    const map = new Map();

    candidateOrders.forEach(order => {
      const set = new Set();
      const pDesc = (order.pUnitDescription || order.packingNotes || '').trim();
      if (pDesc) set.add(pDesc);

      const matchingItems = (order.items || []).filter(it => isItemMatch(it, selectedItem));
      matchingItems.forEach(it => {
        const iDesc = (it.description || '').trim();
        if (iDesc && iDesc.toLowerCase() !== pDesc.toLowerCase()) {
          set.add(iDesc);
        }
      });

      set.forEach(desc => {
        const key = desc.toLowerCase();
        if (map.has(key)) {
          map.get(key).count += 1;
        } else {
          map.set(key, { text: desc, count: 1 });
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [candidateOrders, selectedItem]);

  // Count of orders that have NO packing description
  const ordersWithoutPackingCount = useMemo(() => {
    if (!selectedItem) return 0;
    return candidateOrders.filter(order => {
      const pDesc = (order.pUnitDescription || order.packingNotes || '').trim();
      const matchingItems = (order.items || []).filter(it => isItemMatch(it, selectedItem));
      const hasItemDesc = matchingItems.some(it => (it.description || '').trim());
      return !pDesc && !hasItemDesc;
    }).length;
  }, [candidateOrders, selectedItem]);

  // Reset packing description filter when selected item or date changes
  useEffect(() => {
    setSelectedPackingDesc('all');
    setDescFilterQuery('');
  }, [selectedItem, selectedDate]);

  // 5. Final Filtered Orders List (applying Packing Description selection & text query)
  const itemOrdersAnalysis = useMemo(() => {
    if (!selectedItem) {
      return { ordersList: [], totalQty: 0, notesCount: 0 };
    }

    const queryText = descFilterQuery.trim().toLowerCase();
    let totalQty = 0;
    let notesCount = 0;
    const ordersList = [];

    candidateOrders.forEach(order => {
      const matchingItems = (order.items || []).filter(item => isItemMatch(item, selectedItem));
      if (matchingItems.length === 0) return;

      const pDesc = (order.pUnitDescription || order.packingNotes || '').trim();
      const mDesc = (order.mUnitDescription || '').trim();
      const gDesc = (order.globalDescription || '').trim();
      const itemNotes = matchingItems.map(it => (it.description || '').trim()).filter(Boolean);

      const hasAnyNote = Boolean(pDesc || mDesc || gDesc || itemNotes.length > 0);
      if (hasAnyNote) notesCount++;

      // 1. Packing Description Options Filter
      if (selectedPackingDesc !== 'all') {
        if (selectedPackingDesc === '__none__') {
          // Only orders with NO packing description
          if (pDesc || itemNotes.length > 0) return;
        } else {
          // Only orders matching the selected packing description
          const target = selectedPackingDesc.toLowerCase();
          const matchesP = pDesc.toLowerCase() === target;
          const matchesItem = itemNotes.some(n => n.toLowerCase() === target);
          if (!matchesP && !matchesItem) return;
        }
      }

      // 2. Optional text search in descriptions
      if (queryText) {
        const matchesP = pDesc.toLowerCase().includes(queryText);
        const matchesM = mDesc.toLowerCase().includes(queryText);
        const matchesG = gDesc.toLowerCase().includes(queryText);
        const matchesItem = itemNotes.some(n => n.toLowerCase().includes(queryText));
        if (!matchesP && !matchesM && !matchesG && !matchesItem) return;
      }

      const orderItemQty = matchingItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
      const orderItemTotal = matchingItems.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
      totalQty += orderItemQty;

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
        pUnitDescription: pDesc,
        mUnitDescription: mDesc,
        globalDescription: gDesc
      });
    });

    return { ordersList, totalQty, notesCount };
  }, [selectedItem, candidateOrders, selectedPackingDesc, descFilterQuery, storeMap]);

  // Export Analyzed Orders to Excel (without item revenue)
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
      'Item Note': entry.itemNotes.join('; ') || 'None',
      'Packing Description': entry.pUnitDescription || 'None',
      'Mfg Description': entry.mUnitDescription || 'None',
      'Order Note': entry.globalDescription || 'None',
      'Order Status': entry.status,
      'Payment Status': entry.paymentStatus
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Item Orders');
    const descLabel = selectedPackingDesc !== 'all' ? `_${selectedPackingDesc.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
    const fileName = `Item_Analysis_${selectedItem.name.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedDate || 'all'}${descLabel}.xlsx`;
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

  // Helper to highlight query or selected packing description
  const highlightMatch = (text, query, selectedDesc) => {
    if (!text) return null;
    const highlightTarget = query || (selectedDesc && selectedDesc !== 'all' && selectedDesc !== '__none__' ? selectedDesc : null);
    if (!highlightTarget) return text;

    const parts = text.split(new RegExp(`(${highlightTarget})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === highlightTarget.toLowerCase() ? (
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
              Search items by Product ID, Barcode, or Name to analyze order presence, dates, and packing descriptions.
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
            Use the search bar above to type any Product ID, Barcode ID, or Item Name. Once you pick an item, you will see its orders, date selection, and packing description options.
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

          {/* Filter Controls Toolbar: Date + Packing Description Options + Store */}
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

              {/* Column 2: Selection of Packing Description (User Requirement) */}
              <div className="ia-filter-col-item">
                <label className="ia-filter-col-label">
                  <Package size={13} /> Packing Description Options
                </label>
                <div className="ia-control-input-wrapper">
                  <select
                    className="ia-control-text-input"
                    value={selectedPackingDesc}
                    onChange={(e) => setSelectedPackingDesc(e.target.value)}
                  >
                    <option value="all">All Packing Descriptions ({candidateOrders.length})</option>
                    {uniquePackingDescriptions.map((desc) => (
                      <option key={desc.text} value={desc.text}>
                        {desc.text} ({desc.count})
                      </option>
                    ))}
                    {ordersWithoutPackingCount > 0 && (
                      <option value="__none__">
                        Standard / No Packing Note ({ordersWithoutPackingCount})
                      </option>
                    )}
                  </select>
                </div>

                {/* Quick Selection Chips for Packing Descriptions */}
                {/* <div className="ia-quick-chips-bar" style={{ maxHeight: '80px', overflowY: 'auto' }}>
                  <button
                    type="button"
                    className={`ia-chip-btn ${selectedPackingDesc === 'all' ? 'active' : ''}`}
                    onClick={() => setSelectedPackingDesc('all')}
                  >
                    All ({candidateOrders.length})
                  </button>

                  {uniquePackingDescriptions.map((desc) => (
                    <button
                      key={desc.text}
                      type="button"
                      className={`ia-chip-btn ${selectedPackingDesc === desc.text ? 'active' : ''}`}
                      onClick={() => setSelectedPackingDesc(desc.text)}
                      title={desc.text}
                    >
                      {desc.text} ({desc.count})
                    </button>
                  ))}

                  {ordersWithoutPackingCount > 0 && (
                    <button
                      type="button"
                      className={`ia-chip-btn ${selectedPackingDesc === '__none__' ? 'active' : ''}`}
                      onClick={() => setSelectedPackingDesc('__none__')}
                    >
                      No Note ({ordersWithoutPackingCount})
                    </button>
                  )}
                </div> */}
              </div>

              {/* Column 3: Store & Keyword Search */}
              <div className="ia-filter-col-item">
                <label className="ia-filter-col-label">
                  <Store size={13} /> Store & Keyword Filter
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

                {/* Optional description keyword filter */}
                <div className="ia-control-input-wrapper" style={{ marginTop: '2px' }}>
                  <Search size={13} className="ia-input-left-icon" />
                  <input
                    type="text"
                    className="ia-control-text-input has-left-icon"
                    placeholder="Search custom keyword..."
                    value={descFilterQuery}
                    onChange={(e) => setDescFilterQuery(e.target.value)}
                  />
                  {descFilterQuery && (
                    <button
                      className="ia-input-right-clear-btn"
                      onClick={() => setDescFilterQuery('')}
                      title="Clear keyword"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Analytics Summary Grid (Item Revenue removed as requested) */}
          <div className="ia-metrics-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {/* 1. Orders Count */}
            <div className="ia-metric-card">
              <div className="ia-metric-icon-circle green">
                <FileText size={20} />
              </div>
              <div className="ia-metric-data">
                <span className="ia-metric-label-text">Orders Count</span>
                <span className="ia-metric-val-text">{itemOrdersAnalysis.ordersList.length}</span>
                <span className="ia-metric-sub-text">
                  {selectedPackingDesc !== 'all' ? `Filter: "${selectedPackingDesc === '__none__' ? 'No Note' : selectedPackingDesc}"` : (selectedDate ? formatDate(selectedDate) : 'All Dates')}
                </span>
              </div>
            </div>

            {/* 2. Total Quantity */}
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
                <span className="ia-metric-sub-text">Sum across displayed orders</span>
              </div>
            </div>

            {/* 3. With Special Notes */}
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
                {selectedPackingDesc !== 'all' && (
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    (Packing: "<strong>{selectedPackingDesc === '__none__' ? 'No Packing Note' : selectedPackingDesc}</strong>")
                  </span>
                )}
                {descFilterQuery && (
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    (Keyword: "<strong>{descFilterQuery}</strong>")
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {selectedDate && (
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Delivery: <strong>{formatDate(selectedDate)}</strong>
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
                  No orders contain <strong>{selectedItem.name}</strong> for the selected criteria.
                  {selectedPackingDesc !== 'all' && ' Try selecting "All Packing Descriptions".'}
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
                      <th>Item Qty</th>
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

                        {/* Item Qty in this Order */}
                        <td>
                          <span style={{ fontWeight: 700, color: 'var(--primary-color)', fontSize: '13px' }}>
                            {entry.orderItemQty} {selectedItem.unit === 'Weight' ? 'kg' : 'pcs'}
                          </span>
                        </td>

                        {/* Descriptions / Instructions */}
                        <td>
                          <div className="ia-table-notes-container">
                            {/* Packing Unit Description */}
                            {entry.pUnitDescription && (
                              <div
                                className="ia-note-bubble packing-note"
                                style={{
                                  border: selectedPackingDesc && selectedPackingDesc.toLowerCase() === entry.pUnitDescription.toLowerCase() ? '1.5px solid #7c3aed' : undefined
                                }}
                                title="Packing Unit Note"
                              >
                                <span className="ia-note-tag-prefix">📦 Packing</span>
                                <span>{highlightMatch(entry.pUnitDescription, descFilterQuery, selectedPackingDesc)}</span>
                              </div>
                            )}

                            {/* Item Note */}
                            {entry.itemNotes.length > 0 && entry.itemNotes.map((note, idx) => (
                              <div
                                key={idx}
                                className="ia-note-bubble item-note"
                                style={{
                                  border: selectedPackingDesc && selectedPackingDesc.toLowerCase() === note.toLowerCase() ? '1.5px solid #d97706' : undefined
                                }}
                                title="Item Note"
                              >
                                <span className="ia-note-tag-prefix">💡 Item Note</span>
                                <span>{highlightMatch(note, descFilterQuery, selectedPackingDesc)}</span>
                              </div>
                            ))}

                            {/* Manufacturing Unit Description */}
                            {entry.mUnitDescription && (
                              <div className="ia-note-bubble mfg-note" title="Manufacturing Unit Note">
                                <span className="ia-note-tag-prefix">⚙️ Mfg</span>
                                <span>{highlightMatch(entry.mUnitDescription, descFilterQuery, selectedPackingDesc)}</span>
                              </div>
                            )}

                            {/* General Order Note */}
                            {entry.globalDescription && (
                              <div className="ia-note-bubble global-note" title="General Order Note">
                                <span className="ia-note-tag-prefix">📝 Note</span>
                                <span>{highlightMatch(entry.globalDescription, descFilterQuery, selectedPackingDesc)}</span>
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
                        <strong style={{ color: 'var(--primary-color)', fontSize: '13px' }}>
                          {entry.orderItemQty} {selectedItem.unit === 'Weight' ? 'kg' : 'pcs'}
                        </strong>
                      </div>
                    </div>

                    <div style={{ fontSize: '11.5px', color: '#475569' }}>
                      📅 Delivery: <strong>{formatDate(entry.deliveryDate)}</strong> {entry.deliveryTime && `(${entry.deliveryTime})`}
                    </div>

                    {/* Descriptions */}
                    {(entry.itemNotes.length > 0 || entry.pUnitDescription || entry.mUnitDescription) && (
                      <div className="ia-table-notes-container" style={{ maxWidth: '100%' }}>
                        {entry.pUnitDescription && (
                          <div className="ia-note-bubble packing-note">
                            <span className="ia-note-tag-prefix">📦 Pack</span>
                            <span>{highlightMatch(entry.pUnitDescription, descFilterQuery, selectedPackingDesc)}</span>
                          </div>
                        )}
                        {entry.itemNotes.map((note, idx) => (
                          <div key={idx} className="ia-note-bubble item-note">
                            <span className="ia-note-tag-prefix">💡 Item</span>
                            <span>{highlightMatch(note, descFilterQuery, selectedPackingDesc)}</span>
                          </div>
                        ))}
                        {entry.mUnitDescription && (
                          <div className="ia-note-bubble mfg-note">
                            <span className="ia-note-tag-prefix">⚙️ Mfg</span>
                            <span>{highlightMatch(entry.mUnitDescription, descFilterQuery, selectedPackingDesc)}</span>
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
                  <span className="ia-modal-meta-label">Payment</span>
                  <span className="ia-modal-meta-val">
                    <span className={`ia-status-pill ${getPaymentBadgeClass(viewingOrder.paymentStatus)}`}>
                      {viewingOrder.paymentStatus || 'Pending'}
                    </span>
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
