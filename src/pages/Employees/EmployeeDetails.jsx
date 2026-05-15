import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  IndianRupee, 
  ShieldAlert,
  Edit
} from 'lucide-react';
import { db } from '../../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import './EmployeeDetails.css';

const EmployeeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEmployee = async () => {
      try {
        const docRef = doc(db, 'employees', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setEmployee(docSnap.data());
        }
      } catch (error) {
        console.error("Error fetching employee details:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchEmployee();
  }, [id]);

  if (loading) return <div className="details-loader"><div className="loader"></div></div>;
  if (!employee) return <div className="details-error">Employee not found</div>;

  return (
    <div className="details-container">
      <div className="details-header">
        <button className="back-btn" onClick={() => navigate('/employees')}>
          <ArrowLeft size={20} /> Back to List
        </button>
        <div className="header-actions">
          <button className="edit-details-btn">
            <Edit size={18} /> Edit Profile
          </button>
        </div>
      </div>

      <div className="details-card">
        <div className="profile-section">
          <div className="profile-avatar">
            {employee.firstName[0]}{employee.lastName ? employee.lastName[0] : ''}
          </div>
          <div className="profile-info">
            <h1>{employee.firstName} {employee.lastName}</h1>
            <p>EMP-{id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>

        <div className="details-grid">
          <div className="info-block">
            <label><Phone size={16} /> Phone Number</label>
            <span>{employee.phone}</span>
          </div>
          <div className="info-block">
            <label><IndianRupee size={16} /> Monthly Salary</label>
            <span>₹ {employee.salary || '0'}</span>
          </div>
          <div className="info-block">
            <label><Calendar size={16} /> Accepted Leaves</label>
            <span>{employee.acceptedLeaves || '0'} Days / Year</span>
          </div>
          <div className="info-block">
            <label><MapPin size={16} /> Location</label>
            <span>{employee.city}, {employee.state}</span>
          </div>
        </div>

        <div className="address-section">
          <label>Full Address</label>
          <p>{employee.address || 'No address provided'}</p>
        </div>

        <div className="emergency-section">
          <h3><ShieldAlert size={18} /> Emergency Contact</h3>
          <div className="emergency-grid">
            <div className="info-block">
              <label>Contact Name</label>
              <span>{employee.emergencyContact?.name || 'N/A'}</span>
            </div>
            <div className="info-block">
              <label>Relation</label>
              <span>{employee.emergencyContact?.relation || 'N/A'}</span>
            </div>
            <div className="info-block">
              <label>Mobile Number</label>
              <span>{employee.emergencyContact?.mobile || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeDetails;
