import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import PortalLayout from '../Shared/PortalLayout';
import { ShoppingBag, Users } from 'lucide-react';
import './StorePortal.css';

const StorePortal = () => {
  const { id, tab } = useParams();

  const links = [
    { label: 'Orders', icon: <ShoppingBag size={20} />, path: `/store-portal/${id}/orders` },
    { label: 'Customers', icon: <Users size={20} />, path: `/store-portal/${id}/customers` }
  ];

  if (!tab) return <Navigate to={`/store-portal/${id}/orders`} replace />;

  return (
    <PortalLayout title="Store Portal" links={links}>
      <div className="st-portal-content">
        {tab === 'orders' && (
          <div className="st-orders-view">
             <h2>Store Orders</h2>
             <div className="st-placeholder-card">Order management for store: {id} will appear here.</div>
          </div>
        )}
        {tab === 'customers' && (
          <div className="st-customers-view">
             <h2>Store Customers</h2>
             <div className="st-placeholder-card">Customer management for store: {id} will appear here.</div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default StorePortal;
