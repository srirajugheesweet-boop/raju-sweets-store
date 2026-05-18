import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSession } from '@descope/react-sdk';

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const { isAuthenticated, isSessionLoading } = useSession();
  const location = useLocation();

  if (loading || isSessionLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: '#F7FAFC',
        color: '#0A2A1B'
      }}>
        <div className="loader">Loading...</div>
      </div>
    );
  }

  // Allow access if either Firebase user is present or Descope session is authenticated
  if (!currentUser && !isAuthenticated) {
    // Redirect to login but save the current location they were trying to go to
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
