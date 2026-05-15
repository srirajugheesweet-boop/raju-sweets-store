import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { 
  ChevronDown, 
  LogOut, 
  Star, 
  Zap,
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
import logo from '../../assets/logo.png';
import './Header.css';

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard />, path: '/dashboard' },
  { id: 'orders', label: 'Orders', icon: <ShoppingBag />, path: '/orders' },
  { id: 'customers', label: 'Customers', icon: <Users />, path: '/customers' },
  { id: 'items', label: 'Items', icon: <Box />, path: '/items' },
  { id: 'categories', label: 'Categories', icon: <Tag />, path: '/categories' },
  { id: 'stores', label: 'Stores', icon: <Store />, path: '/stores' },
  { id: 'manufacturing', label: 'Manufacturing Units', icon: <Factory />, path: '/manufacturing' },
  { id: 'packing', label: 'Packing Units', icon: <Package />, path: '/packing' },
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

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      toast.error('Error logging out');
    }
  };

  // Find active menu item
  const activeItem = menuItems.find(item => {
    if (item.path === '/') return location.pathname === '/';
    return location.pathname.startsWith(item.path);
  });

  return (
    <header className="header">
      <div className="header-left">
        <Link to="/" className="header-logo">
          <img src={logo} alt="Raju Ghee Sweets" className="header-logo-img" />
        </Link>
        <div className="admin-badge">
          <Star size={12} fill="currentColor" />
          <span>Super Admin</span>
        </div>
      </div>

      <div className="header-right">
        <div className="dropdown-container">
          <button className="dropdown-trigger">
            <Zap size={18} fill="currentColor" style={{ color: '#F9D423' }} />
            <span>{activeItem ? activeItem.label : 'Quick Access'}</span>
            <ChevronDown size={18} />
          </button>
          <div className="dropdown-menu">
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {menuItems.map((item) => (
                <Link 
                  key={item.id} 
                  to={item.path} 
                  className={`dropdown-item ${location.pathname.startsWith(item.path) ? 'active' : ''}`}
                >
                  {React.cloneElement(item.icon, { size: 18 })}
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
            <button onClick={handleLogout} className="logout-btn">
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
