import React, { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import PortalLayout from '../Shared/PortalLayout';
import { BarChart3, ShoppingBag, ClipboardList, CheckCircle2, User, Clock, ArrowRight, Eye, ChevronDown, ChevronUp } from 'lucide-react';
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

  // 1. Group & Aggregate items for the worksheet
  // Only items where item.mUnitId === id and item.status === 'preparation_started'
  const getWorksheetItems = () => {
    const groups = {};
    orders.forEach(order => {
      // Skip if order is cancelled or completed globally if you have such logic, 
      // but usually we just process items based on item.status
      if (order.items) {
        order.items.forEach((item, index) => {
          if (item.mUnitId === id && item.status === 'preparation_started') {
            const key = item.name + '_' + (item.unit || 'Pieces');
            if (!groups[key]) {
              groups[key] = {
                name: item.name,
                unit: item.unit,
                totalQty: 0,
                description: item.description || '',
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
        });
      }
    });
    return Object.values(groups);
  };

  // 2. Mark grouped item as done
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

  // 3. Filter orders assigned to this manufacturing unit
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

  const worksheetItems = getWorksheetItems();
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
            {tab === 'worksheet' && (
              <div className="mu-worksheet-view animate-fade-in">
                <div className="mu-view-header">
                  <div>
                    <h2>Today Worksheet</h2>
                    <p className="mu-subtitle">Aggregated list of sweet items to prepare today</p>
                  </div>
                  <span className="mu-badge">{worksheetItems.length} Items Pending</span>
                </div>

                {worksheetItems.length === 0 ? (
                  <div className="mu-empty-state">
                    <CheckCircle2 size={48} className="mu-empty-icon" />
                    <h3>All Tasks Completed!</h3>
                    <p>No pending sweet items for preparation today.</p>
                  </div>
                ) : (
                  <div className="mu-worksheet-grid">
                    {worksheetItems.map((groupedItem, idx) => (
                      <motion.div 
                        key={idx} 
                        className="mu-worksheet-card"
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
                          <button 
                            className="mu-btn-complete"
                            onClick={() => handleMarkItemDone(groupedItem)}
                          >
                            <CheckCircle2 size={16} /> Mark as Done
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                                            // Only show the items belonging to this unit in the expanded view
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
