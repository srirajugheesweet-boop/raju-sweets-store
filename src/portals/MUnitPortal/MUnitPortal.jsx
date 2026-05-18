import React from 'react';
import { useParams, useLocation, Navigate } from 'react-router-dom';
import PortalLayout from '../Shared/PortalLayout';
import { BarChart3, ShoppingBag, ClipboardList } from 'lucide-react';
import './MUnitPortal.css';

const MUnitPortal = () => {
  const { id, tab } = useParams();

  const links = [
    { label: 'Today Worksheet', icon: <ClipboardList size={20} />, path: `/munit-portal/${id}/worksheet` },
    { label: 'Orders', icon: <ShoppingBag size={20} />, path: `/munit-portal/${id}/orders` },
    { label: 'Analytics', icon: <BarChart3 size={20} />, path: `/munit-portal/${id}/analytics` }
  ];

  if (!tab) return <Navigate to={`/munit-portal/${id}/worksheet`} replace />;

  return (
    <PortalLayout title="Manufacturing Portal" links={links}>
      <div className="mu-portal-content">
        {tab === 'worksheet' && (
          <div className="mu-worksheet-view">
             <h2>Today Worksheet</h2>
             <div className="mu-placeholder-card">Today's manufacturing tasks and worksheet for unit: {id} will appear here.</div>
          </div>
        )}
        {tab === 'analytics' && (
          <div className="mu-analytics-view">
             <h2>Manufacturing Analytics</h2>
             <div className="mu-placeholder-card">Analytics data for unit: {id} will appear here.</div>
          </div>
        )}
        {tab === 'orders' && (
          <div className="mu-orders-view">
             <h2>Manufacturing Orders</h2>
             <div className="mu-placeholder-card">Order management for unit: {id} will appear here.</div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default MUnitPortal;
