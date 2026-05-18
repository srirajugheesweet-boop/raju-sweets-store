import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import PortalLayout from '../Shared/PortalLayout';
import { BarChart3, ShoppingBag } from 'lucide-react';
import './PUnitPortal.css';

const PUnitPortal = () => {
  const { id, tab } = useParams();

  const links = [
    { label: 'Analytics', icon: <BarChart3 size={20} />, path: `/punit-portal/${id}/analytics` },
    { label: 'Orders', icon: <ShoppingBag size={20} />, path: `/punit-portal/${id}/orders` }
  ];

  if (!tab) return <Navigate to={`/punit-portal/${id}/analytics`} replace />;

  return (
    <PortalLayout title="Packing Portal" links={links}>
      <div className="pu-portal-content">
        {tab === 'analytics' && (
          <div className="pu-analytics-view">
             <h2>Packing Analytics</h2>
             <div className="pu-placeholder-card">Analytics data for unit: {id} will appear here.</div>
          </div>
        )}
        {tab === 'orders' && (
          <div className="pu-orders-view">
             <h2>Packing Orders</h2>
             <div className="pu-placeholder-card">Order management for unit: {id} will appear here.</div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default PUnitPortal;
