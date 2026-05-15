import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  X, 
  UserPlus, 
  Phone, 
  MapPin, 
  Briefcase, 
  Home, 
  ShieldAlert,
  Search,
  MoreVertical,
  Trash2,
  Calendar
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './Employees.css';

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    acceptedLeaves: '',
    address: '',
    city: '',
    state: '',
    emergencyContact: {
      relation: '',
      name: '',
      mobile: ''
    }
  });

  const fetchEmployees = async () => {
    try {
      const q = query(collection(db, 'employees'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const emps = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(emps);
    } catch (error) {
      console.error("Error fetching employees: ", error);
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('emergency_')) {
      const field = name.split('_')[1];
      setFormData(prev => ({
        ...prev,
        emergencyContact: {
          ...prev.emergencyContact,
          [field]: value
        }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.firstName || !formData.phone) {
      toast.error('First name and Phone are required');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'employees'), {
        ...formData,
        createdAt: new Date().toISOString()
      });
      toast.success('Employee added successfully!');
      setIsFormOpen(false);
      setFormData({
        firstName: '', lastName: '', phone: '', acceptedLeaves: '', address: '', city: '', state: '',
        emergencyContact: { relation: '', name: '', mobile: '' }
      });
      fetchEmployees();
    } catch (error) {
      console.error("Error adding employee: ", error);
      toast.error('Failed to add employee');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this employee?')) {
      try {
        await deleteDoc(doc(db, 'employees', id));
        toast.success('Employee removed');
        fetchEmployees();
      } catch (error) {
        toast.error('Failed to delete');
      }
    }
  };

  return (
    <div className="employees-container">
      <div className="employees-header">
        <div>
          <h1 className="employees-title">Employee Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            {employees.length} Total Employees
          </p>
        </div>
        <button className="add-btn" onClick={() => setIsFormOpen(!isFormOpen)}>
          {isFormOpen ? <><X size={18} /> Close Form</> : <><UserPlus size={18} /> Add Employee</>}
        </button>
      </div>

      <div className="employees-layout">
        <div className="list-section">
          <div className="employees-table-container">
            {loading ? (
              <div className="empty-state"><div className="loader"></div></div>
            ) : employees.length === 0 ? (
              <div className="empty-state">
                <ShieldAlert size={48} style={{ opacity: 0.2, marginBottom: '15px' }} />
                <p>No employees found. Click "Add Employee" to get started.</p>
              </div>
            ) : (
              <table className="employees-table">
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>Phone</th>
                    <th>Leaves</th>
                    <th>Location</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id}>
                      <td>
                        <div className="emp-name">
                          <div className="emp-avatar">{emp.firstName[0]}{emp.lastName[0]}</div>
                          <div>
                            <div style={{ fontWeight: '700' }}>{emp.firstName} {emp.lastName}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>EMP-{emp.id.slice(0, 5).toUpperCase()}</div>
                          </div>
                        </div>
                      </td>
                      <td>{emp.phone}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={14} color="#06D6A0" />
                          <span>{emp.acceptedLeaves || 0} Days</span>
                        </div>
                      </td>
                      <td>{emp.city}, {emp.state}</td>
                      <td>
                        <button onClick={() => handleDelete(emp.id)} style={{ color: 'var(--error-color)', background: 'transparent' }}>
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <AnimatePresence>
          {isFormOpen && (
            <motion.div 
              className="form-section"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="form-header">
                <h3>Add New Employee</h3>
                <button className="close-btn" onClick={() => setIsFormOpen(false)}><X size={18} /></button>
              </div>

              <form onSubmit={handleSubmit} className="employee-form">
                <div className="section-label">Personal Information</div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">First Name</label>
                    <input type="text" name="firstName" className="form-input" value={formData.firstName} onChange={handleInputChange} placeholder="John" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Last Name</label>
                    <input type="text" name="lastName" className="form-input" value={formData.lastName} onChange={handleInputChange} placeholder="Doe" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input type="tel" name="phone" className="form-input" value={formData.phone} onChange={handleInputChange} placeholder="+91 00000 00000" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Accepted Leaves</label>
                    <input type="number" name="acceptedLeaves" className="form-input" value={formData.acceptedLeaves} onChange={handleInputChange} placeholder="12" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input type="text" name="address" className="form-input" value={formData.address} onChange={handleInputChange} placeholder="Street, Area" />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <input type="text" name="city" className="form-input" value={formData.city} onChange={handleInputChange} placeholder="Hyderabad" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">State</label>
                    <input type="text" name="state" className="form-input" value={formData.state} onChange={handleInputChange} placeholder="Telangana" />
                  </div>
                </div>

                <div className="section-label">Emergency Contact</div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Contact Name</label>
                    <input type="text" name="emergency_name" className="form-input" value={formData.emergencyContact.name} onChange={handleInputChange} placeholder="Relation Name" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Relation</label>
                    <input type="text" name="emergency_relation" className="form-input" value={formData.emergencyContact.relation} onChange={handleInputChange} placeholder="e.g. Spouse" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Contact Mobile</label>
                  <input type="tel" name="emergency_mobile" className="form-input" value={formData.emergencyContact.mobile} onChange={handleInputChange} placeholder="+91 00000 00000" />
                </div>

                <button type="submit" className="login-button" disabled={submitting} style={{ marginTop: '10px' }}>
                  {submitting ? <div className="loader" style={{ width: '20px', height: '20px' }}></div> : <><UserPlus size={18} /> Save Employee</>}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Employees;
