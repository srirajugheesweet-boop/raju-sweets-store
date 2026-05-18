import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { 
  LogOut,
  LayoutDashboard, 
  ShoppingBag, 
  Users, 
  Box, 
  Tag, 
  Store, 
  Factory, 
  Package, 
  UserCog, 
  UserCircle, 
  Clock, 
  BarChart3, 
  ShieldCheck, 
  CreditCard, 
  Settings,
  Bell,
  FileText,
  LifeBuoy
} from 'lucide-react';
import toast from 'react-hot-toast';
import './Sidebar.css';

export const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard />, path: '/dashboard' },
  { id: 'orders', label: 'Orders', icon: <ShoppingBag />, path: '/orders' },
  { id: 'customers', label: 'Customers', icon: <Users />, path: '/customers' },
  { id: 'items', label: 'Items', icon: <Box />, path: '/items' },
  { id: 'categories', label: 'Categories', icon: <Tag />, path: '/categories' },
  { id: 'stores', label: 'Stores', icon: <Store />, path: '/stores' },
  { id: 'manufacturing', label: 'Manufacturing', icon: <Factory />, path: '/manufacturing' },
  { id: 'packing', label: 'Packing', icon: <Package />, path: '/packing' },
  { id: 'users', label: 'Users & Roles', icon: <UserCog />, path: '/users' },
  { id: 'employees', label: 'Employees', icon: <UserCircle />, path: '/employees' },
  { id: 'timesheet', label: 'Timesheet', icon: <Clock />, path: '/timesheet' },
  { id: 'reports', label: 'Reports', icon: <BarChart3 />, path: '/reports' },
  { id: 'audit', label: 'Audit Logs', icon: <ShieldCheck />, path: '/audit' },
  { id: 'payments', label: 'Payments', icon: <CreditCard />, path: '/payments' },
  { id: 'settings', label: 'Settings', icon: <Settings />, path: '/settings' },
  { id: 'notifications', label: 'Notifications', icon: <Bell />, path: '/notifications' },
  { id: 'documents', label: 'Documents', icon: <FileText />, path: '/documents' },
  { id: 'support', label: 'Support', icon: <LifeBuoy />, path: '/support' },
];

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      toast.error('Error logging out');
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-menu">
        {menuItems.map((item) => (
          <Link 
            key={item.id} 
            to={item.path} 
            className={`sidebar-item ${location.pathname.startsWith(item.path) && item.path !== '/' ? 'active' : ''}`}
          >
            {React.cloneElement(item.icon, { size: 24, className: 'sidebar-icon' })}
            <span className="sidebar-label">{item.label}</span>
          </Link>
        ))}
      </div>
      <div className="sidebar-footer">
        <button onClick={handleLogout} className="sidebar-logout-btn">
          <LogOut size={24} />
          <span className="sidebar-label">Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
