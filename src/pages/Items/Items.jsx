import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Package, 
  Edit, 
  Trash2, 
  X,
  Image as ImageIcon,
  Scale,
  Factory,
  ChevronDown,
  Tag
} from 'lucide-react';
import { db } from '../../config/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { uploadToImageKit } from '../../config/imagekit';

import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './Items.css';
import logo from '../../assets/logo.png';

const DEFAULT_ITEM_IMAGE = logo;

// Premium Animated Custom Select Component
const CustomSelect = ({ label, options, value, onChange, placeholder, icon, required }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="items-input-group custom-select-container" ref={dropdownRef}>
      <label>{label} {required && <span>*</span>}</label>
      <div className="custom-select-wrapper">
        <button
          type="button"
          className={`custom-select-trigger ${isOpen ? 'active' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="custom-select-trigger-content">
            {icon && <span className="custom-select-icon">{icon}</span>}
            <span className={selectedOption ? 'selected-value' : 'placeholder-value'}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          </div>
          <ChevronDown size={16} className={`custom-select-chevron ${isOpen ? 'open' : ''}`} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.ul
              className="custom-select-options"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {options.map((option) => (
                <li
                  key={option.value}
                  className={`custom-select-option ${option.value === value ? 'selected' : ''}`}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                >
                  {option.label}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const Items = () => {
  const [items, setItems] = useState([]);
  const [mUnits, setMUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    unit: 'Weight', // 'Weight' or 'Piece'
    price: '',
    mUnitId: '',
    categoryId: '',
    image: ''
  });
  const [imageFile, setImageFile] = useState(null);

  // Fetch Manufacturing Units for Dropdown
  useEffect(() => {
    const fetchMUnits = async () => {
      const q = query(collection(db, 'manufacturing_units'), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      setMUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchMUnits();
  }, []);

  // Fetch Categories for Dropdown
  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  // Fetch Global Items
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'items'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(itemData);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (file) => {
    try {
      console.log("Starting upload to ImageKit...");
      const uploadedUrl = await uploadToImageKit(file);
      console.log("Upload successful:", uploadedUrl);
      return uploadedUrl;
    } catch (error) {
      console.error("ImageKit Upload Error:", error);
      toast.error(`Upload Error: ${error.message || 'Check ImageKit configuration'}`);
      return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.mUnitId) {
      toast.error("Please select a manufacturing unit");
      return;
    }

    setSubmitting(true);
    
    try {
      let finalImageUrl = DEFAULT_ITEM_IMAGE;

      // 1. Handle Image Upload (Priority: New File > Existing URL > Default)
      if (imageFile) {
        console.log("New file detected, uploading to ImageKit...");
        const uploadedUrl = await uploadImage(imageFile);
        if (uploadedUrl) {
          finalImageUrl = uploadedUrl;
        } else {
          // If upload fails, fallback to default
          finalImageUrl = DEFAULT_ITEM_IMAGE;
        }
      } else if (editingItem && editingItem.image) {
        // If editing and no new file, keep old URL
        finalImageUrl = editingItem.image;
      }

      // 2. Prepare Data (Clean out base64 preview string)
      const { image, ...restData } = formData;
      const finalData = {
        ...restData,
        price: Number(formData.price),
        image: finalImageUrl,
        updatedAt: serverTimestamp()
      };

      console.log("Saving to Firestore collection: items");
      if (editingItem) {
        await updateDoc(doc(db, 'items', editingItem.id), finalData);
        toast.success("Item updated successfully");
      } else {
        await addDoc(collection(db, 'items'), {
          ...finalData,
          createdAt: serverTimestamp()
        });
        toast.success("Item added successfully");
      }
      resetForm();
    } catch (error) {
      console.error("Firestore Save Error:", error);
      toast.error(`Save Error: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', unit: 'Weight', price: '', mUnitId: '', categoryId: '', image: '' });
    setImageFile(null);
    setShowAddForm(false);
    setEditingItem(null);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      unit: item.unit,
      price: item.price,
      mUnitId: item.mUnitId,
      categoryId: item.categoryId || '',
      image: item.image
    });
    setShowAddForm(true);
  };

  const handleDelete = async () => {
    if (!showDeleteModal) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'items', showDeleteModal));
      toast.success("Item removed successfully");
      setShowDeleteModal(null);
    } catch (error) {
      toast.error("Failed to delete item");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="items-container">
      <div className="items-header">
        <div className="items-header-info">
          <h1>Product Inventory</h1>
          <p>Manage sweets, snacks, and store essentials</p>
        </div>
        {!showAddForm && (
          <button className="items-add-btn" onClick={() => setShowAddForm(true)}>
            <Plus size={20} /> Add New Item
          </button>
        )}
      </div>

      <div className="items-content-layout">
        <div className={`items-list-section ${showAddForm ? 'shrink' : 'full'}`}>
          <div className="items-search-bar">
            <Search size={18} className="items-search-icon" />
            <input 
              type="text" 
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="items-grid">
            {loading ? (
              <div className="items-loader-container"><div className="loader"></div></div>
            ) : filteredItems.length > 0 ? (
              filteredItems.map(item => (
                <div key={item.id} className="item-card">
                  <div className="item-img-box">
                    <img 
                      src={(!item.image || item.image.includes('unsplash')) ? DEFAULT_ITEM_IMAGE : item.image} 
                      alt={item.name} 
                    />
                    <div className="item-card-actions">
                      <button onClick={() => handleEdit(item)} className="item-mini-btn edit"><Edit size={14} /></button>
                      <button onClick={() => setShowDeleteModal(item.id)} className="item-mini-btn delete"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="item-card-info">
                    <div className="item-meta-top">
                      <span className="item-unit-tag">{item.unit}</span>
                      <span className="item-price-tag">₹{item.price}</span>
                    </div>
                    <h3>{item.name}</h3>
                    <div className="item-munit-info">
                      <Factory size={12} />
                      <span>{mUnits.find(mu => mu.id === item.mUnitId)?.name || 'Unknown Unit'}</span>
                    </div>
                    <div className="item-card-cat-tag">
                      <Tag size={12} />
                      <span>{categories.find(cat => cat.id === item.categoryId)?.name || 'Uncategorized'}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="items-empty-state">
                <div className="empty-icon-circle">
                  <Package size={32} />
                </div>
                <h3>No Items Found</h3>
                <p>You haven't added any items yet. Click the button above to start building your inventory.</p>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showAddForm && (
            <motion.div 
              className="items-form-sidebar"
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
            >
              <div className="items-sidebar-header">
                <h2>{editingItem ? 'Edit Item' : 'Add New Item'}</h2>
                <button onClick={resetForm} className="items-close-btn"><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit} className="items-form">
                <div className="item-image-upload">
                  <div className="image-preview-box">
                    {formData.image && !formData.image.includes('unsplash') ? (
                      <img src={formData.image} alt="Preview" />
                    ) : (
                      <ImageIcon size={32} />
                    )}
                  </div>
                  <div className="image-upload-info">
                    <label htmlFor="item-img-input" className="image-upload-btn">
                      <Plus size={14} /> {formData.image ? 'Change Image' : 'Upload Image'}
                    </label>
                    <input id="item-img-input" type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                    <span>Optional: Item photo</span>
                  </div>
                </div>

                <div className="items-input-group">
                  <label>Item Name</label>
                  <input 
                    type="text" 
                    name="name" 
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g. Special Ghee Mysore Pak"
                    required 
                  />
                </div>

                <div className="items-form-row">
                  <CustomSelect
                    label="Unit Type"
                    options={[
                      { value: 'Weight', label: 'Weight (kg/gm)' },
                      { value: 'Piece', label: 'Piece (qty)' }
                    ]}
                    value={formData.unit}
                    onChange={(val) => setFormData(prev => ({ ...prev, unit: val }))}
                    placeholder="Select unit type"
                    icon={<Scale size={16} />}
                    required
                  />

                  <div className="items-input-group">
                    <label>Price (₹)</label>
                    <input 
                      type="number" 
                      name="price" 
                      value={formData.price}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      required 
                    />
                  </div>
                </div>

                <CustomSelect
                  label="Manufacturing Unit"
                  options={mUnits.map(mu => ({ value: mu.id, label: mu.name }))}
                  value={formData.mUnitId}
                  onChange={(val) => setFormData(prev => ({ ...prev, mUnitId: val }))}
                  placeholder="Select a unit"
                  icon={<Factory size={16} />}
                  required
                />

                <CustomSelect
                  label="Category"
                  options={categories.map(cat => ({ value: cat.id, label: cat.name }))}
                  value={formData.categoryId}
                  onChange={(val) => setFormData(prev => ({ ...prev, categoryId: val }))}
                  placeholder="Select category"
                  icon={<Tag size={16} />}
                />

                <div className="items-form-actions">
                  <button type="button" onClick={resetForm} className="items-btn-cancel">Cancel</button>
                  <button type="submit" className="items-btn-save" disabled={submitting}>
                    {submitting ? <div className="loader"></div> : 'Save Product'}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon-box delete"><Trash2 size={32} /></div>
            <h3 className="modal-title">Delete Item?</h3>
            <p className="modal-text">Are you sure you want to remove this item from your inventory?</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowDeleteModal(null)} disabled={isDeleting}>Cancel</button>
              <button className="modal-btn confirm delete" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div> : 'Yes, Delete'}
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Items;
