import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Trash2,
  Calendar,
  Search,
  Filter,
  AlertTriangle,
  CheckSquare,
  Square,
  RefreshCw,
  Layers,
  User,
  Phone
} from 'lucide-react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  writeBatch
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import toast from 'react-hot-toast';
import './BulkOrderCleanupModal.css';

export default function BulkOrderCleanupModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters: strictly Created From/To Date, Order Status, and Order ID Search
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [orderIdSearch, setOrderIdSearch] = useState('');

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Buffer and timestamps for shortcut: "Ctrl + 244273"
  const bufferRef = useRef([]);
  const lastCtrlTimeRef = useRef(0);

  // Global Keyboard Listener for "Ctrl + 244273"
  useEffect(() => {
    const handleKeyDown = (e) => {
      const now = Date.now();

      // If escape key is pressed and modal is open, close it (unless deleting)
      if (e.key === 'Escape' && isOpen && !isDeleting) {
        if (showConfirmModal) {
          setShowConfirmModal(false);
        } else {
          setIsOpen(false);
        }
        return;
      }

      if (e.key === 'Control') {
        lastCtrlTimeRef.current = now;
        return;
      }

      const isCtrlActive = e.ctrlKey || (now - lastCtrlTimeRef.current < 6000);

      // Digits 0-9
      if (/^[0-9]$/.test(e.key)) {
        // Prevent default browser tab switching on Windows (Ctrl+1, Ctrl+2, etc.)
        if (e.ctrlKey) {
          e.preventDefault();
        }

        if (isCtrlActive) {
          bufferRef.current.push(e.key);
          if (bufferRef.current.length > 10) {
            bufferRef.current.shift();
          }

          const sequence = bufferRef.current.join('');
          if (sequence.endsWith('244273')) {
            e.preventDefault();
            setIsOpen(true);
            bufferRef.current = [];
            lastCtrlTimeRef.current = 0;
            toast.success("Bulk Order Cleanup Console Activated", {
              icon: '🛡️',
              duration: 3500
            });
          }
        }
      } else if (!['Shift', 'Alt', 'Meta'].includes(e.key)) {
        // Non-modifier, non-digit: reset buffer if Ctrl is not held
        if (!e.ctrlKey && (now - lastCtrlTimeRef.current > 6000)) {
          bufferRef.current = [];
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isDeleting, showConfirmModal]);

  // Real-time Firestore sync with orders collection when modal is opened
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const orderList = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));
        setOrders(orderList);
        setLoading(false);
      },
      (err) => {
        console.error("Failed to fetch orders for cleanup:", err);
        toast.error("Failed to load orders");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen]);

  // Helper to parse order createdAt to Date
  const parseOrderDate = (order) => {
    if (order.createdAt?.toDate) return order.createdAt.toDate();
    if (order.createdAt?.seconds) return new Date(order.createdAt.seconds * 1000);
    if (order.createdAt) {
      const d = new Date(order.createdAt);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };

  const hasActiveFilter = Boolean(fromDate || toDate || statusFilter !== 'All' || orderIdSearch.trim());

  // Filtered orders strictly based on Created Date (from/to), Status, and Order ID
  const filteredOrders = useMemo(() => {
    if (!hasActiveFilter) return [];

    return orders.filter((order) => {
      // 1. Created From Date filter
      const orderDate = parseOrderDate(order);
      if (fromDate) {
        if (!orderDate) return false;
        const fromStart = new Date(fromDate + 'T00:00:00');
        if (orderDate < fromStart) return false;
      }

      // 2. Created To Date filter
      if (toDate) {
        if (!orderDate) return false;
        const toEnd = new Date(toDate + 'T23:59:59.999');
        if (orderDate > toEnd) return false;
      }

      // 3. Order Status filter
      if (statusFilter !== 'All') {
        const currentStatus = (order.status || 'new').toLowerCase().trim();
        const targetStatus = statusFilter.toLowerCase().trim();
        if (currentStatus !== targetStatus) return false;
      }

      // 4. Search by Order ID
      if (orderIdSearch.trim()) {
        const search = orderIdSearch.trim().toLowerCase();
        const idMatch = (order.orderId || '').toLowerCase().includes(search);
        const docIdMatch = (order.id || '').toLowerCase().includes(search);
        const serialMatch = String(order.serialNumber || '').toLowerCase().includes(search);
        if (!idMatch && !docIdMatch && !serialMatch) return false;
      }

      return true;
    });
  }, [orders, fromDate, toDate, statusFilter, orderIdSearch, hasActiveFilter]);

  // Clean up selected IDs if they are no longer in filtered orders
  const filteredIdsSet = useMemo(() => new Set(filteredOrders.map(o => o.id)), [filteredOrders]);

  const selectedFilteredCount = useMemo(() => {
    let count = 0;
    for (const id of selectedIds) {
      if (filteredIdsSet.has(id)) count++;
    }
    return count;
  }, [selectedIds, filteredIdsSet]);

  const isAllSelected = filteredOrders.length > 0 && selectedFilteredCount === filteredOrders.length;
  const isIndeterminate = selectedFilteredCount > 0 && selectedFilteredCount < filteredOrders.length;

  // Toggle single order selection
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Toggle Select All filtered orders
  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      // Deselect all filtered
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredOrders.forEach(o => next.delete(o.id));
        return next;
      });
    } else {
      // Select all filtered
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredOrders.forEach(o => next.add(o.id));
        return next;
      });
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setFromDate('');
    setToDate('');
    setStatusFilter('All');
    setOrderIdSearch('');
  };

  // Permanent Delete Execution in Chunks
  const handleExecuteDelete = async () => {
    const idsToDelete = Array.from(selectedIds).filter(id => filteredIdsSet.has(id));
    if (idsToDelete.length === 0) {
      toast.error("No orders selected for deletion");
      setShowConfirmModal(false);
      return;
    }

    setIsDeleting(true);
    const toastId = toast.loading(`Deleting ${idsToDelete.length} orders...`);

    try {
      // Firestore batch size limit is 500 operations
      const CHUNK_SIZE = 400;
      for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
        const chunk = idsToDelete.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((id) => {
          const docRef = doc(db, 'orders', id);
          batch.delete(docRef);
        });
        await batch.commit();
      }

      toast.success(`Permanently deleted ${idsToDelete.length} orders`, { id: toastId });

      // Clear deleted IDs from selection
      setSelectedIds((prev) => {
        const next = new Set(prev);
        idsToDelete.forEach(id => next.delete(id));
        return next;
      });
      setShowConfirmModal(false);
    } catch (err) {
      console.error("Bulk delete failed:", err);
      toast.error("Failed to delete selected orders", { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  // Format Status Badge
  const getStatusBadge = (status) => {
    const s = (status || 'new').toLowerCase().trim();
    if (s === 'delivered') return <span className="boc-badge delivered">Delivered</span>;
    if (s.includes('ready')) return <span className="boc-badge ready">Ready</span>;
    if (s.includes('moved')) return <span className="boc-badge moved">Moved</span>;
    if (s.includes('progress')) return <span className="boc-badge in-progress">In Progress</span>;
    if (s === 'cancelled') return <span className="boc-badge cancelled">Cancelled</span>;
    return <span className="boc-badge new">New</span>;
  };

  if (!isOpen) return null;

  return (
    <div className="boc-overlay animate-fade-in" role="dialog" aria-modal="true">
      <div className="boc-container">

        {/* Full Screen Modal Header */}
        <header className="boc-header">
          <div className="boc-header-left">
            <div className="boc-header-badge">
              <AlertTriangle size={16} />
              <span>Admin Cleanup</span>
            </div>
            <h1 className="boc-title">Order Management & Cleanup</h1>
            <p className="boc-subtitle">
              Filter orders by creation date, order status, and Order ID. Use Select All to delete multiple orders.
            </p>
          </div>
          <div className="boc-header-right">
            {/* <div className="boc-key-hint">
              <span>Shortcut:</span> <kbd>Ctrl</kbd> + <kbd>244273</kbd>
            </div> */}
            <button
              type="button"
              className="boc-close-btn"
              onClick={() => setIsOpen(false)}
              title="Close (Esc)"
              disabled={isDeleting}
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Filters Section: Strictly From Date, To Date, Order Status, Search Order ID */}
        <section className="boc-filters-panel">
          <div className="boc-filter-item">
            <label htmlFor="boc-from-date">
              <Calendar size={14} /> From Date (Created)
            </label>
            <input
              id="boc-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="boc-input"
            />
          </div>

          <div className="boc-filter-item">
            <label htmlFor="boc-to-date">
              <Calendar size={14} /> To Date (Created)
            </label>
            <input
              id="boc-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="boc-input"
            />
          </div>

          <div className="boc-filter-item">
            <label htmlFor="boc-status">
              <Filter size={14} /> Order Status
            </label>
            <select
              id="boc-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="boc-select"
            >
              <option value="All">All Statuses</option>
              <option value="new">New</option>
              <option value="In Progress">In Progress</option>
              <option value="Partially Moved to Store">Partially Moved to Store</option>
              <option value="Moved to Store">Moved to Store</option>
              <option value="Partially Ready for Delivery">Partially Ready</option>
              <option value="Ready for Delivery">Ready for Delivery</option>
              <option value="Delivered">Delivered</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div className="boc-filter-item boc-filter-search">
            <label htmlFor="boc-search-id">
              <Search size={14} /> Search Order ID
            </label>
            <div className="boc-input-icon-wrap">
              <input
                id="boc-search-id"
                type="text"
                placeholder="Search by Order ID..."
                value={orderIdSearch}
                onChange={(e) => setOrderIdSearch(e.target.value)}
                className="boc-input"
              />
              {orderIdSearch && (
                <button
                  type="button"
                  className="boc-input-clear"
                  onClick={() => setOrderIdSearch('')}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {(fromDate || toDate || statusFilter !== 'All' || orderIdSearch) && (
            <div className="boc-filter-actions">
              <button
                type="button"
                className="boc-reset-btn"
                onClick={handleResetFilters}
              >
                Reset Filters
              </button>
            </div>
          )}
        </section>

        {/* Selection Summary & Action Bar - Only displayed when filters are selected */}
        {hasActiveFilter && (
          <div className="boc-action-bar animate-fade-in">
            <div className="boc-action-bar-left">
              <button
                type="button"
                className="boc-select-toggle-btn"
                onClick={handleToggleSelectAll}
                disabled={filteredOrders.length === 0}
              >
                {isAllSelected ? (
                  <>
                    <CheckSquare size={16} className="text-active" /> Deselect All
                  </>
                ) : (
                  <>
                    <Square size={16} /> Select All ({filteredOrders.length})
                  </>
                )}
              </button>

              <span className="boc-selection-counter">
                Showing <strong>{filteredOrders.length}</strong> matching orders | Selected: <strong>{selectedFilteredCount}</strong>
              </span>
            </div>

            <div className="boc-action-bar-right">
              <button
                type="button"
                className="boc-delete-btn"
                disabled={selectedFilteredCount === 0 || isDeleting}
                onClick={() => setShowConfirmModal(true)}
              >
                <Trash2 size={16} />
                <span>Delete All Selected ({selectedFilteredCount})</span>
              </button>
            </div>
          </div>
        )}

        {/* Orders Table Display */}
        <div className="boc-table-container">
          {!hasActiveFilter ? (
            <div className="boc-no-filter-state animate-fade-in">
              <div className="boc-no-filter-icon-box">
                <Filter size={36} />
              </div>
              <h3>Select Filters to View Orders</h3>
              <p>
                Orders will be loaded once you select a <strong>Created Date range</strong>, an <strong>Order Status</strong>, or search with an <strong>Order ID</strong> above.
              </p>
            </div>
          ) : loading ? (
            <div className="boc-loading-state">
              <RefreshCw size={28} className="boc-spin" />
              <p>Loading orders from database...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="boc-empty-state animate-fade-in">
              <Layers size={40} />
              <h3>No orders match your filter criteria</h3>
              <p>Try adjusting the date range, status, or Order ID search term.</p>
              {(fromDate || toDate || statusFilter !== 'All' || orderIdSearch) && (
                <button type="button" className="boc-btn-secondary" onClick={handleResetFilters}>
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <table className="boc-table">
              <thead>
                <tr>
                  <th style={{ width: '48px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isIndeterminate;
                      }}
                      onChange={handleToggleSelectAll}
                      className="boc-checkbox"
                      title="Select all filtered orders"
                    />
                  </th>
                  <th>Order ID</th>
                  <th>Created Date & Time</th>
                  <th>Customer Info</th>
                  <th>Items Summary</th>
                  <th style={{ textAlign: 'right' }}>Total Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const isSelected = selectedIds.has(order.id);
                  const orderDate = parseOrderDate(order);
                  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
                  const itemNames = Array.isArray(order.items)
                    ? order.items.map(i => i.name || i.itemName || 'Item').slice(0, 3).join(', ') + (order.items.length > 3 ? '...' : '')
                    : 'No items';

                  return (
                    <tr
                      key={order.id}
                      className={isSelected ? 'boc-row-selected' : ''}
                      onClick={() => handleToggleSelect(order.id)}
                    >
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(order.id)}
                          className="boc-checkbox"
                        />
                      </td>
                      <td>
                        <div className="boc-order-id">
                          <strong>#{order.orderId || order.serialNumber || order.id.slice(0, 8)}</strong>
                          {order.storeName && (
                            <span className="boc-store-subtext">{order.storeName}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="boc-date-cell">
                          <span className="boc-date-primary">
                            {orderDate ? orderDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown Date'}
                          </span>
                          <span className="boc-date-time">
                            {orderDate ? orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="boc-customer-cell">
                          <div className="boc-cust-name">
                            <User size={13} /> {order.customerName || order.businessName || 'Walk-in Customer'}
                          </div>
                          {order.customerPhone && (
                            <div className="boc-cust-phone">
                              <Phone size={12} /> {order.customerPhone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="boc-items-cell" title={itemNames}>
                          <span className="boc-item-count">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                          <span className="boc-item-preview">{itemNames}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="boc-amount-cell">
                          ₹{Number(order.totalAmount || 0).toLocaleString('en-IN')}
                        </div>
                      </td>
                      <td>
                        {getStatusBadge(order.status)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Confirmation Modal before permanent deletion */}
        {showConfirmModal && (
          <div className="boc-confirm-overlay animate-fade-in" onClick={() => !isDeleting && setShowConfirmModal(false)}>
            <div className="boc-confirm-card" onClick={(e) => e.stopPropagation()}>
              <div className="boc-confirm-icon-box">
                <Trash2 size={32} />
              </div>
              <h2>Confirm Permanent Deletion</h2>
              <p className="boc-confirm-warning">
                Are you sure you want to permanently delete <strong>{selectedFilteredCount}</strong> {selectedFilteredCount === 1 ? 'order' : 'orders'}?
              </p>
              <div className="boc-confirm-notice">
                <AlertTriangle size={16} />
                <span>This action is destructive and cannot be undone. All selected orders will be permanently removed from the database.</span>
              </div>
              <div className="boc-confirm-actions">
                <button
                  type="button"
                  className="boc-btn-cancel"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="boc-btn-delete-confirm"
                  onClick={handleExecuteDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw size={16} className="boc-spin" /> Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} /> Yes, Delete All Selected
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
