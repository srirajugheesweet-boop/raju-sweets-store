import React, { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import PortalLayout from '../Shared/PortalLayout';
import { 
  BarChart3, 
  ShoppingBag, 
  ClipboardList, 
  CheckCircle2, 
  User, 
  Clock, 
  ArrowRight, 
  Eye, 
  ChevronDown, 
  ChevronUp,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, onSnapshot, query, doc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './MUnitPortal.css';

const MUnitPortal = () => {
  const { id, tab } = useParams();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState([]);

  // Today Worksheet states
  const [worksheetSubTab, setWorksheetSubTab] = useState('pending'); // 'pending' or 'completed'
  const [worksheetDate, setWorksheetDate] = useState(new Date().toISOString().split('T')[0]); // defaults to today's YYYY-MM-DD

  useEffect(() => {
    const q = query(collection(db, 'orders'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(allOrders);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Subscribe Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const links = [
    { label: 'Today Worksheet', icon: <ClipboardList size={20} />, path: `/munit-portal/${id}/worksheet` },
    { label: 'Orders', icon: <ShoppingBag size={20} />, path: `/munit-portal/${id}/orders` },
    { label: 'Analytics', icon: <BarChart3 size={20} />, path: `/munit-portal/${id}/analytics` }
  ];

  if (!tab) return <Navigate to={`/munit-portal/${id}/worksheet`} replace />;

  // Helper function to match dates across local format variations securely
  const isSameDay = (orderDateStr, selectedDateStr) => {
    if (!orderDateStr || !selectedDateStr) return false;
    
    // selectedDateStr is always YYYY-MM-DD
    const [selYear, selMonth, selDay] = selectedDateStr.split('-').map(Number);
    
    try {
      // 1. Slash format (DD/MM/YYYY or MM/DD/YYYY)
      if (orderDateStr.includes('/')) {
        const parts = orderDateStr.split('/');
        if (parts.length === 3) {
          const d = Number(parts[0]);
          const m = Number(parts[1]) - 1; // 0-indexed month
          const y = Number(parts[2]);
          if (y === selYear && m === (selMonth - 1) && d === selDay) {
            return true;
          }
          // fallback to check MM/DD/YYYY
          const dAlt = Number(parts[1]);
          const mAlt = Number(parts[0]) - 1;
          const yAlt = Number(parts[2]);
          if (yAlt === selYear && mAlt === (selMonth - 1) && dAlt === selDay) {
            return true;
          }
        }
      }
      
      // 2. Dash format (YYYY-MM-DD)
      if (orderDateStr.includes('-')) {
        const parts = orderDateStr.split('-');
        if (parts.length === 3) {
          const y = Number(parts[0]);
          const m = Number(parts[1]) - 1;
          const d = Number(parts[2]);
          if (y === selYear && m === (selMonth - 1) && d === selDay) {
            return true;
          }
        }
      }

      // 3. Fallback date parse
      const parsed = new Date(orderDateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.getFullYear() === selYear && 
               parsed.getMonth() === (selMonth - 1) && 
               parsed.getDate() === selDay;
      }
    } catch (e) {
      console.error("Error parsing order date:", e);
    }
    return false;
  };

  // Group & Aggregate items for the worksheet based on tab (pending/completed) and worksheetDate
  const getWorksheetItems = (statusType) => {
    const groups = {};
    orders.forEach(order => {
      // Filter orders matching the selected date
      const orderDateStr = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : '';
      if (!isSameDay(orderDateStr, worksheetDate)) return;

      if (order.items) {
        order.items.forEach((item, index) => {
          if (item.mUnitId === id) {
            const isPending = item.status === 'preparation_started' || !item.status;
            const isCompleted = item.status === 'preparation_complete' || 
                                item.status === 'moved_to_packing' || 
                                item.status === 'packing_complete' || 
                                item.status === 'moved_to_store' || 
                                item.status === 'delivered';

            const match = (statusType === 'pending' && isPending) || (statusType === 'completed' && isCompleted);

            if (match) {
              const key = item.name + '_' + (item.unit || 'Pieces');
              if (!groups[key]) {
                groups[key] = {
                  name: item.name,
                  unit: item.unit,
                  totalQty: 0,
                  description: item.description || '',
                  status: item.status,
                  linkedOrders: []
                };
              }
              groups[key].totalQty += Number(item.quantity || 0);
              groups[key].linkedOrders.push({
                orderDocId: order.id,
                orderId: order.orderId,
                itemIndex: index,
                quantity: item.quantity,
                customerName: order.customerName,
                createdAt: order.createdAt
              });
            }
          }
        });
      }
    });
    return Object.values(groups);
  };

  // Mark grouped item as done
  const handleMarkItemDone = async (groupedItem) => {
    try {
      const promises = groupedItem.linkedOrders.map(async (link) => {
        const orderRef = doc(db, 'orders', link.orderDocId);
        const order = orders.find(o => o.id === link.orderDocId);
        if (!order) return;
        
        const newItems = [...order.items];
        if (newItems[link.itemIndex]) {
          newItems[link.itemIndex].status = 'preparation_complete';
        }
        return updateDoc(orderRef, { items: newItems });
      });

      await Promise.all(promises);
      toast.success(`Successfully completed ${groupedItem.name}!`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update items status");
    }
  };

  // Filter orders assigned to this manufacturing unit
  const getAssignedOrders = () => {
    return orders.filter(order => 
      order.items && order.items.some(item => item.mUnitId === id)
    );
  };

  const handleUpdateSingleItemStatus = async (orderDocId, itemIndex, newStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderDocId);
      const order = orders.find(o => o.id === orderDocId);
      if (!order) return;

      const newItems = [...order.items];
      if (newItems[itemIndex]) {
        newItems[itemIndex].status = newStatus;
      }
      await updateDoc(orderRef, { items: newItems });
      toast.success("Item status updated successfully");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    }
  };

  const toggleOrderAccordion = (orderDocId) => {
    setExpandedOrders(prev => 
      prev.includes(orderDocId) ? prev.filter(oId => oId !== orderDocId) : [...prev, orderDocId]
    );
  };

  const pendingWorksheetItems = getWorksheetItems('pending');
  const completedWorksheetItems = getWorksheetItems('completed');
  const activeWorksheetItems = worksheetSubTab === 'pending' ? pendingWorksheetItems : completedWorksheetItems;
  const assignedOrders = getAssignedOrders();

  return (
    <PortalLayout title="Manufacturing Portal" links={links}>
      <div className="mu-portal-content">
        {loading ? (
          <div className="mu-loading-container">
            <div className="loader"></div>
            <p>Loading manufacturing dashboard...</p>
          </div>
        ) : (
          <>
            {/* --- TODAY WORKSHEET TAB --- */}
            {tab === 'worksheet' && (
              <div className="mu-worksheet-view animate-fade-in">
                
                {/* Header with Sub tabs and Date picker */}
                <div className="mu-view-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                    <div>
                      <h2>Today Worksheet</h2>
                      <p className="mu-subtitle">Aggregated list of sweet items to prepare</p>
                    </div>
                    
                    {/* Pending vs Completed Sub tabs */}
                    <div className="mu-sub-tabs">
                      <button 
                        className={`mu-sub-tab-btn ${worksheetSubTab === 'pending' ? 'active' : ''}`}
                        onClick={() => setWorksheetSubTab('pending')}
                      >
                        <Clock size={16} /> Pending ({pendingWorksheetItems.length})
                      </button>
                      <button 
                        className={`mu-sub-tab-btn ${worksheetSubTab === 'completed' ? 'active' : ''}`}
                        onClick={() => setWorksheetSubTab('completed')}
                      >
                        <CheckCircle2 size={16} /> Completed ({completedWorksheetItems.length})
                      </button>
                    </div>
                  </div>

                  {/* Worksheet Date Selector */}
                  <div className="mu-date-filter-bar">
                    <div className="mu-filter-left">
                      <Calendar size={18} className="mu-filter-cal-icon" />
                      <span className="mu-filter-label">Filter Worksheet Date:</span>
                      <input 
                        type="date" 
                        className="mu-date-picker-input"
                        value={worksheetDate} 
                        onChange={(e) => setWorksheetDate(e.target.value)} 
                      />
                    </div>
                    <button 
                      className="mu-today-reset-btn"
                      onClick={() => setWorksheetDate(new Date().toISOString().split('T')[0])}
                    >
                      Select Today
                    </button>
                  </div>
                </div>

                {activeWorksheetItems.length === 0 ? (
                  <div className="mu-empty-state">
                    {worksheetSubTab === 'pending' ? (
                      <>
                        <CheckCircle2 size={48} className="mu-empty-icon" />
                        <h3>All Tasks Done!</h3>
                        <p>No pending sweet items for preparation on {new Date(worksheetDate).toLocaleDateString()}.</p>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={48} className="mu-empty-icon" style={{ color: '#94a3b8' }} />
                        <h3>No Completed Sweets</h3>
                        <p>No sweets have been marked done for {new Date(worksheetDate).toLocaleDateString()} yet.</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mu-worksheet-grid">
                    {activeWorksheetItems.map((groupedItem, idx) => (
                      <motion.div 
                        key={idx} 
                        className={`mu-worksheet-card ${worksheetSubTab === 'completed' ? 'completed-card' : ''}`}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                      >
                        <div className="mu-card-body">
                          <div className="mu-card-main-info">
                            <h3 className="mu-item-title">{groupedItem.name}</h3>
                            <span className="mu-item-qty">
                              {groupedItem.totalQty} {groupedItem.unit === 'Weight' ? 'kg' : 'pcs'}
                            </span>
                          </div>

                          {groupedItem.description && (
                            <p className="mu-item-description">💡 {groupedItem.description}</p>
                          )}

                          <div className="mu-card-orders-breakdown">
                            <span className="mu-breakdown-title">Source Orders:</span>
                            <div className="mu-breakdown-pills">
                              {groupedItem.linkedOrders.map((link, lIdx) => (
                                <div key={lIdx} className="mu-breakdown-pill" title={`Customer: ${link.customerName}`}>
                                  <span className="bold">#{link.orderId}</span> - {link.quantity} {groupedItem.unit === 'Weight' ? 'kg' : 'pcs'}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="mu-card-footer">
                          {worksheetSubTab === 'pending' ? (
                            <button 
                              className="mu-btn-complete"
                              onClick={() => handleMarkItemDone(groupedItem)}
                            >
                              <CheckCircle2 size={16} /> Mark as Done
                            </button>
                          ) : (
                            <div className="mu-completed-stamp">
                              <CheckCircle2 size={16} /> Preparation Completed
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* --- ASSIGNED ORDERS TAB --- */}
            {tab === 'orders' && (
              <div className="mu-orders-view animate-fade-in">
                <div className="mu-view-header">
                  <div>
                    <h2>Assigned Orders</h2>
                    <p className="mu-subtitle">All orders containing items assigned to your unit</p>
                  </div>
                  <span className="mu-badge">{assignedOrders.length} Total Orders</span>
                </div>

                {assignedOrders.length === 0 ? (
                  <div className="mu-empty-state">
                    <ShoppingBag size={48} className="mu-empty-icon" />
                    <h3>No Assigned Orders</h3>
                    <p>There are no orders assigned to this manufacturing unit yet.</p>
                  </div>
                ) : (
                  <div className="mu-orders-table-wrapper">
                    <table className="mu-orders-table">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Customer</th>
                          <th>My Items</th>
                          <th>Date</th>
                          <th style={{ textAlign: 'center' }}>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignedOrders.map(order => {
                          const myItemsCount = order.items.filter(i => i.mUnitId === id).length;
                          const isExpanded = expandedOrders.includes(order.id);

                          return (
                            <React.Fragment key={order.id}>
                              <tr className={isExpanded ? "row-expanded" : ""}>
                                <td className="mu-order-id-cell" onClick={() => toggleOrderAccordion(order.id)}>
                                  <div className="mu-id-wrapper">
                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    <span>#{order.orderId}</span>
                                  </div>
                                </td>
                                <td>
                                  <div className="mu-customer-info">
                                    <span className="name">{order.customerName}</span>
                                    <span className="phone">{order.customerPhone}</span>
                                  </div>
                                </td>
                                <td style={{ fontWeight: '700', color: 'var(--primary-color)' }}>
                                  {myItemsCount} / {order.items.length} items
                                </td>
                                <td style={{ fontSize: '13px', color: '#64748b' }}>
                                  {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'Pending'}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <button className="mu-btn-toggle" onClick={() => toggleOrderAccordion(order.id)}>
                                    <Eye size={16} /> {isExpanded ? 'Hide' : 'View'}
                                  </button>
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr className="mu-accordion-row">
                                  <td colSpan="5">
                                    <div className="mu-accordion-content">
                                      <h4>My Assigned Items to Prepare</h4>
                                      <table className="mu-subtable">
                                        <thead>
                                          <tr>
                                            <th>Item Name</th>
                                            <th>Description</th>
                                            <th>Quantity</th>
                                            <th>Status</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {order.items.map((item, idx) => {
                                            if (item.mUnitId !== id) return null;

                                            return (
                                              <tr key={idx}>
                                                <td style={{ fontWeight: '700' }}>{item.name}</td>
                                                <td style={{ fontSize: '12px', color: '#64748b' }}>{item.description || '-'}</td>
                                                <td>{item.unit === 'Weight' ? `${item.quantity} kg` : `${item.quantity} pcs`}</td>
                                                <td>
                                                  <select
                                                    className="mu-select-status"
                                                    value={item.status || 'preparation_started'}
                                                    onChange={(e) => handleUpdateSingleItemStatus(order.id, idx, e.target.value)}
                                                  >
                                                    <option value="preparation_started">Preparation Started</option>
                                                    <option value="preparation_complete">Preparation Completed</option>
                                                    <option value="moved_to_packing">Moved to Packing</option>
                                                    <option value="packing_complete">Packing Completed</option>
                                                    <option value="moved_to_store">Moved to Store</option>
                                                    <option value="delivered">Delivered</option>
                                                  </select>
                                                </td>
                                              </tr>
                                            );
                                          })}
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
                )}
              </div>
            )}

            {tab === 'analytics' && (
              <div className="mu-analytics-view animate-fade-in">
                <h2>Manufacturing Analytics</h2>
                <div className="mu-placeholder-card">
                  Analytics dashboard for manufacturing unit: <b>{id}</b> is currently under development.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
};

export default MUnitPortal;
