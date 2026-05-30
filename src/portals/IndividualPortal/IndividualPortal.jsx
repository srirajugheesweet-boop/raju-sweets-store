import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  IndianRupee,
  Clock,
  FileText,
  CreditCard,
  History,
  Briefcase,
  ChevronDown
} from 'lucide-react';
import PortalLayout from '../Shared/PortalLayout';
import { db, auth } from '../../config/firebase';
import { 
  doc, 
  collection, 
  getDocs,
  query, 
  where, 
  onSnapshot, 
  orderBy 
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './IndividualPortal.css';

const IndividualPortal = () => {
  const { tab } = useParams();
  const navigate = useNavigate();
  const activeTab = tab || 'info';

  const [employee, setEmployee] = useState(null);
  const [employeeId, setEmployeeId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Attendance, Leaves, & Advances States
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [leaveRecords, setLeaveRecords] = useState([]);
  const [advances, setAdvances] = useState([]);

  // Expanded state for advance inline history
  const [expandedAdv, setExpandedAdv] = useState(null);
  const [instalments, setInstalments] = useState([]);
  const [loadingInstalments, setLoadingInstalments] = useState(false);

  // Sidebar Links
  const links = [
    { label: 'My Profile', icon: <User size={20} />, path: '/individual-portal' }
  ];

  useEffect(() => {
    const phone = localStorage.getItem('userPhone') || auth.currentUser?.phoneNumber;
    if (!phone) {
      setLoading(false);
      return;
    }
    const normalizedPhone = phone.startsWith('+91') ? phone.slice(3) : phone;

    let unsubEmployee = null;
    let unsubAdvances = null;
    let unsubAttendance = null;
    let unsubLeaves = null;

    const setupSubscriptions = async () => {
      try {
        const q = query(
          collection(db, 'employees'),
          where('phone', 'in', [phone, normalizedPhone])
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const empDoc = snap.docs[0];
          const empId = empDoc.id;
          setEmployeeId(empId);

          // Real-time employee info
          unsubEmployee = onSnapshot(doc(db, 'employees', empId), (docSnap) => {
            if (docSnap.exists()) {
              setEmployee({ id: empId, ...docSnap.data() });
            }
          });

          // Real-time advances
          const qAdv = query(collection(db, 'advances'), where('employeeId', '==', empId));
          unsubAdvances = onSnapshot(qAdv, (snapshot) => {
            const advs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            advs.sort((a, b) => {
              const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
              const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
              return dateB - dateA;
            });
            setAdvances(advs);
          });

          // Real-time attendance
          const qAtt = query(collection(db, 'attendance'), where('employeeId', '==', empId));
          unsubAttendance = onSnapshot(qAtt, (snapshot) => {
            const records = snapshot.docs.map(doc => doc.data());
            records.sort((a, b) => new Date(b.date) - new Date(a.date));
            setAttendanceRecords(records);
          });

          // Real-time leaves
          const qLeaves = query(collection(db, 'leaves'), where('employeeId', '==', empId));
          unsubLeaves = onSnapshot(qLeaves, (snapshot) => {
            const records = snapshot.docs.map(doc => doc.data());
            records.sort((a, b) => new Date(b.date) - new Date(a.date));
            setLeaveRecords(records);
          });
        } else {
          toast.error("Employee profile not found matching your credentials");
        }
      } catch (err) {
        console.error("Error setting up employee subscriptions:", err);
        toast.error("Failed to load employee records");
      } finally {
        setLoading(false);
      }
    };

    setupSubscriptions();

    return () => {
      if (unsubEmployee) unsubEmployee();
      if (unsubAdvances) unsubAdvances();
      if (unsubAttendance) unsubAttendance();
      if (unsubLeaves) unsubLeaves();
    };
  }, []);

  const toggleExpand = async (advId) => {
    if (expandedAdv === advId) {
      setExpandedAdv(null);
    } else {
      setExpandedAdv(advId);
      setLoadingInstalments(true);
      try {
        const q = query(
          collection(db, `advances/${advId}/instalments`),
          orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const insts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setInstalments(insts);
      } catch (err) {
        console.error("Error fetching instalments: ", err);
      } finally {
        setLoadingInstalments(false);
      }
    }
  };

  const getAdvStats = (type) => {
    const filtered = advances.filter(a => a.type === type);
    const totalTaken = filtered.reduce((acc, curr) => acc + curr.amount, 0);
    const balanceDue = filtered.reduce((acc, curr) => acc + curr.balance, 0);
    return { totalTaken, balanceDue };
  };

  const tabs = [
    { id: 'info', label: 'Employee Info', mobileLabel: 'Profile', icon: <User size={20} /> },
    { id: 'timesheet', label: 'Timesheet', mobileLabel: 'Timesheet', icon: <Clock size={20} /> },
    { id: 'leaves', label: 'Leaves', mobileLabel: 'Leaves', icon: <Calendar size={20} /> },
    { id: 'advance', label: 'Advance', mobileLabel: 'Advance', icon: <CreditCard size={20} /> },
  ];

  if (loading) {
    return (
      <PortalLayout title="Employee Portal" links={links}>
        <div className="ind-loader-container">
          <div className="loader"></div>
          <p>Fetching your personal records...</p>
        </div>
      </PortalLayout>
    );
  }

  if (!employee) {
    return (
      <PortalLayout title="Employee Portal" links={links}>
        <div className="ind-error-container animate-fade-in">
          <h2>No Associated Employee Found</h2>
          <p>Please contact the system administrator to verify your registered mobile number in the employee directory.</p>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Employee Portal" links={links}>
      <div className="ind-container animate-fade-in">
        {/* Dynamic Greeting Row */}
        <div className="ind-header-row">
          <div>
            <h1 className="ind-greeting-title">Hello, {employee.firstName}!</h1>
            <p className="ind-greeting-subtitle">Secure personal self-service portal (View-Only)</p>
          </div>
          <div className="ind-profile-badge">
            <div className="ind-avatar">
              {employee.firstName[0]}{employee.lastName ? employee.lastName[0] : ''}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div className="ind-badge-name">{employee.firstName} {employee.lastName || ''}</div>
              <div className="ind-badge-id">EMP-{employee.id.slice(0, 8).toUpperCase()}</div>
            </div>
          </div>
        </div>

        {/* Custom Premium Tabs Navigation */}
        <div className="ind-tabs-wrapper">
          <div className="ind-tabs">
            {tabs.map(tabItem => (
              <button
                key={tabItem.id}
                className={`ind-tab-btn ${activeTab === tabItem.id ? 'active' : ''}`}
                onClick={() => navigate(`/individual-portal/${tabItem.id}`)}
              >
                <span className="ind-tab-icon">{React.cloneElement(tabItem.icon, { size: 16 })}</span>
                <span className="ind-tab-label">{tabItem.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Card with Elegant Styling */}
        <div className="ind-content-card">
          
          {/* TAB 1: EMPLOYEE INFO */}
          {activeTab === 'info' && (
            <div className="ind-tab-section animate-fade-in">
              <div className="ind-section-header">
                <h2>Personal & Professional Information</h2>
                <span className="ind-view-only-badge">View Only</span>
              </div>

              <div className="ind-info-grid">
                <div className="ind-info-item">
                  <label>First Name</label>
                  <div className="val">{employee.firstName}</div>
                </div>
                <div className="ind-info-item">
                  <label>Last Name</label>
                  <div className="val">{employee.lastName || 'N/A'}</div>
                </div>
                <div className="ind-info-item">
                  <label>Phone Connection</label>
                  <div className="val">{employee.phone}</div>
                </div>
                <div className="ind-info-item">
                  <label>Monthly Base Salary</label>
                  <div className="val" style={{ fontWeight: '700', color: 'var(--text-primary)' }}>₹ {employee.salary || '0'}</div>
                </div>
                <div className="ind-info-item">
                  <label>Allowed Leaves Limit</label>
                  <div className="val">{employee.acceptedLeaves || '0'} Days / Year</div>
                </div>
                <div className="ind-info-item">
                  <label>City</label>
                  <div className="val">{employee.city || 'N/A'}</div>
                </div>
                <div className="ind-info-item">
                  <label>State</label>
                  <div className="val">{employee.state || 'N/A'}</div>
                </div>
                <div className="ind-info-item" style={{ gridColumn: 'span 2' }}>
                  <label>Full Residential Address</label>
                  <div className="val">{employee.address || 'No address provided'}</div>
                </div>
              </div>

              <div className="ind-group-divider">
                <span>Emergency Contact details</span>
              </div>

              <div className="ind-info-grid">
                <div className="ind-info-item">
                  <label>Contact Name</label>
                  <div className="val">{employee.emergencyContact?.name || 'N/A'}</div>
                </div>
                <div className="ind-info-item">
                  <label>Relation</label>
                  <div className="val">{employee.emergencyContact?.relation || 'N/A'}</div>
                </div>
                <div className="ind-info-item">
                  <label>Mobile Connection</label>
                  <div className="val">{employee.emergencyContact?.mobile || 'N/A'}</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TIMESHEET */}
          {activeTab === 'timesheet' && (
            <div className="ind-tab-section animate-fade-in">
              <div className="ind-section-header">
                <h2>Attendance Timesheet Records</h2>
                <span className="ind-view-only-badge">View Only</span>
              </div>
              
              {attendanceRecords.length === 0 ? (
                <div className="ind-empty-state">
                  <Clock size={48} className="ind-empty-icon" />
                  <h3>No Attendance Logged</h3>
                  <p>Your chronological attendance history will display here once recorded.</p>
                </div>
              ) : (
                <div className="ind-table-wrapper">
                  <table className="ind-table-element">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Logged Status</th>
                        <th>Last Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceRecords.map((record, index) => (
                        <tr key={index}>
                          <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{record.date}</td>
                          <td>
                            <span className={`ind-badge-status ${record.status}`}>
                              {record.status.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                            {new Date(record.updatedAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LEAVES */}
          {activeTab === 'leaves' && (
            <div className="ind-tab-section animate-fade-in">
              <div className="ind-section-header">
                <h2>Employee Leave History</h2>
                <span className="ind-view-only-badge">View Only</span>
              </div>
              
              {leaveRecords.length === 0 ? (
                <div className="ind-empty-state">
                  <Calendar size={48} className="ind-empty-icon" />
                  <h3>No Leaves Registered</h3>
                  <p>No previous or accepted leave applications found on file.</p>
                </div>
              ) : (
                <div className="ind-table-wrapper">
                  <table className="ind-table-element">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Leave Type</th>
                        <th>Reason for Absence</th>
                        <th>Approval Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaveRecords.map((record, index) => (
                        <tr key={index}>
                          <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{record.date}</td>
                          <td style={{ fontWeight: '600' }}>{record.type}</td>
                          <td>{record.reason}</td>
                          <td>
                            <span className="ind-badge-status approved">
                              {record.status.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ADVANCE */}
          {activeTab === 'advance' && (
            <div className="ind-tab-section animate-fade-in">
              <div className="ind-section-header">
                <h2>Salary Advances Summary</h2>
                <span className="ind-view-only-badge">View Only</span>
              </div>

              {/* Advance Cards Display */}
              <div className="ind-adv-cards-container">
                {/* Short Term */}
                <div className="ind-adv-stat-card short-term">
                  <h3><CreditCard size={18} /> Short Term Advance</h3>
                  <div className="ind-adv-stats-row">
                    <div className="stat-item">
                      <label>Total Taken</label>
                      <div className="amt">₹ {getAdvStats('short_term').totalTaken}</div>
                    </div>
                    <div className="stat-item">
                      <label>Balance Due</label>
                      <div className="amt due">₹ {getAdvStats('short_term').balanceDue}</div>
                    </div>
                  </div>
                </div>

                {/* Long Term */}
                <div className="ind-adv-stat-card long-term">
                  <h3><Briefcase size={18} /> Long Term Advance</h3>
                  <div className="ind-adv-stats-row">
                    <div className="stat-item">
                      <label>Total Taken</label>
                      <div className="amt">₹ {getAdvStats('long_term').totalTaken}</div>
                    </div>
                    <div className="stat-item">
                      <label>Balance Due</label>
                      <div className="amt due">₹ {getAdvStats('long_term').balanceDue}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Symmetrical Lists for Short/Long term histories */}
              <div className="ind-adv-columns">
                
                {/* Column 1: Short Term History */}
                <div className="ind-adv-column">
                  <h4 className="ind-column-title"><CreditCard size={16} /> Short Term Logs</h4>
                  
                  <div className="ind-mini-table-container">
                    <table className="ind-mini-table">
                      <thead>
                        <tr>
                          <th style={{ width: '30px' }}></th>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Balance Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {advances.filter(a => a.type === 'short_term').map(adv => (
                          <React.Fragment key={adv.id}>
                            <tr 
                              className={`ind-clickable-row ${expandedAdv === adv.id ? 'expanded' : ''}`}
                              onClick={() => toggleExpand(adv.id)}
                            >
                              <td>
                                <ChevronDown 
                                  size={14} 
                                  style={{ 
                                    transform: expandedAdv === adv.id ? 'rotate(180deg)' : 'rotate(0)', 
                                    transition: '0.3s',
                                    color: 'var(--text-secondary)'
                                  }} 
                                />
                              </td>
                              <td style={{ fontWeight: '500' }}>{adv.date}</td>
                              <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>₹ {adv.amount}</td>
                              <td style={{ fontWeight: '700', color: adv.balance > 0 ? 'var(--error-color)' : '#059669' }}>
                                ₹ {adv.balance}
                              </td>
                            </tr>
                            
                            {/* Instalment expanded inline */}
                            {expandedAdv === adv.id && (
                              <tr className="ind-expanded-detail-row">
                                <td colSpan="4">
                                  <div className="ind-inline-history animate-fade-in">
                                    <div className="ind-inline-history-header">
                                      <span>Instalment Breakdown</span>
                                    </div>
                                    <div className="ind-inline-hist-list">
                                      {loadingInstalments ? (
                                        <div className="ind-inline-loading"><div className="loader" style={{ width: '16px', height: '16px' }}></div></div>
                                      ) : instalments.map(inst => (
                                        <div className="ind-inline-hist-item" key={inst.id}>
                                          <div className="hist-main">
                                            <span className="hist-amt">₹ {inst.amount}</span>
                                            <span className="hist-dt">{inst.date} • {inst.time}</span>
                                          </div>
                                        </div>
                                      ))}
                                      {!loadingInstalments && instalments.length === 0 && (
                                        <div className="ind-inline-no-data">No instalment records paid yet</div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                        {advances.filter(a => a.type === 'short_term').length === 0 && (
                          <tr>
                            <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
                              No short term advance history on file.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Column 2: Long Term History */}
                <div className="ind-adv-column">
                  <h4 className="ind-column-title"><Briefcase size={16} /> Long Term Logs</h4>
                  
                  <div className="ind-mini-table-container">
                    <table className="ind-mini-table">
                      <thead>
                        <tr>
                          <th style={{ width: '30px' }}></th>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Balance Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {advances.filter(a => a.type === 'long_term').map(adv => (
                          <React.Fragment key={adv.id}>
                            <tr 
                              className={`ind-clickable-row ${expandedAdv === adv.id ? 'expanded' : ''}`}
                              onClick={() => toggleExpand(adv.id)}
                            >
                              <td>
                                <ChevronDown 
                                  size={14} 
                                  style={{ 
                                    transform: expandedAdv === adv.id ? 'rotate(180deg)' : 'rotate(0)', 
                                    transition: '0.3s',
                                    color: 'var(--text-secondary)'
                                  }} 
                                />
                              </td>
                              <td style={{ fontWeight: '500' }}>{adv.date}</td>
                              <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>₹ {adv.amount}</td>
                              <td style={{ fontWeight: '700', color: adv.balance > 0 ? 'var(--error-color)' : '#059669' }}>
                                ₹ {adv.balance}
                              </td>
                            </tr>
                            
                            {/* Instalment expanded inline */}
                            {expandedAdv === adv.id && (
                              <tr className="ind-expanded-detail-row">
                                <td colSpan="4">
                                  <div className="ind-inline-history animate-fade-in">
                                    <div className="ind-inline-history-header">
                                      <span>Instalment Breakdown</span>
                                    </div>
                                    <div className="ind-inline-hist-list">
                                      {loadingInstalments ? (
                                        <div className="ind-inline-loading"><div className="loader" style={{ width: '16px', height: '16px' }}></div></div>
                                      ) : instalments.map(inst => (
                                        <div className="ind-inline-hist-item" key={inst.id}>
                                          <div className="hist-main">
                                            <span className="hist-amt">₹ {inst.amount}</span>
                                            <span className="hist-dt">{inst.date} • {inst.time}</span>
                                          </div>
                                        </div>
                                      ))}
                                      {!loadingInstalments && instalments.length === 0 && (
                                        <div className="ind-inline-no-data">No instalment records paid yet</div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                        {advances.filter(a => a.type === 'long_term').length === 0 && (
                          <tr>
                            <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
                              No long term advance history on file.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="ind-mobile-bottom-nav">
        {tabs.map(tabItem => (
          <button
            key={tabItem.id}
            className={`ind-mobile-nav-btn ${activeTab === tabItem.id ? 'active' : ''}`}
            onClick={() => navigate(`/individual-portal/${tabItem.id}`)}
          >
            <span className="ind-mobile-nav-icon">{React.cloneElement(tabItem.icon, { size: 20 })}</span>
            <span className="ind-mobile-nav-label">{tabItem.mobileLabel}</span>
          </button>
        ))}
      </div>
    </PortalLayout>
  );
};

export default IndividualPortal;
