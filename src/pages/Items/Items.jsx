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
  Tag,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  Barcode,
  Star,
  Eye,
  Check,
  Store
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
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { uploadToImageKit } from '../../config/imagekit';
import * as XLSX from 'xlsx';

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

  // Bulk Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [fallbackMUnitId, setFallbackMUnitId] = useState('');
  const [dragActive, setDragActive] = useState(false);

  // View / Edit / Add OffCanvas mode
  const [offcanvasMode, setOffcanvasMode] = useState('add'); // 'add' | 'edit' | 'view'
  const [viewingItem, setViewingItem] = useState(null);

  // Weight Roundoff Modal State
  const [roundOffModalItem, setRoundOffModalItem] = useState(null);
  const [roundOffRules, setRoundOffRules] = useState([]);
  const [roundOffStores, setRoundOffStores] = useState([]);
  const [stores, setStores] = useState([]);
  const [savingRoundOff, setSavingRoundOff] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    unit: 'Weight', // 'Weight' or 'Piece'
    price: '',
    mUnitId: '',
    categoryId: '',
    image: '',
    showInWorksheet: true,
    isFavourite: false
  });
  const [imageFile, setImageFile] = useState(null);

  // Lock body scroll and listen for Escape key when offcanvas is open
  useEffect(() => {
    if (showAddForm) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') resetForm();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [showAddForm]);

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

  // Fetch Stores for Round-off applicable store selection
  useEffect(() => {
    const q = query(collection(db, 'stores'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStores(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
        barcode: (formData.barcode || '').trim(),
        price: Number(formData.price),
        image: finalImageUrl,
        isFavourite: Boolean(formData.isFavourite),
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
    setFormData({ name: '', barcode: '', unit: 'Weight', price: '', mUnitId: '', categoryId: '', image: '', showInWorksheet: true, isFavourite: false });
    setImageFile(null);
    setShowAddForm(false);
    setEditingItem(null);
    setViewingItem(null);
    setOffcanvasMode('add');
  };

  const handleView = (item) => {
    setViewingItem(item);
    setEditingItem(null);
    setOffcanvasMode('view');
    setShowAddForm(true);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setViewingItem(null);
    setOffcanvasMode('edit');
    setFormData({
      name: item.name,
      barcode: item.barcode || item.barcodeId || '',
      unit: item.unit,
      price: item.price,
      mUnitId: item.mUnitId,
      categoryId: item.categoryId || '',
      image: item.image,
      showInWorksheet: item.showInWorksheet !== false,
      isFavourite: Boolean(item.isFavourite)
    });
    setShowAddForm(true);
  };

  const openRoundOffModal = (item) => {
    setRoundOffModalItem(item);
    const existingRules = Array.isArray(item.weightRoundOffRules)
      ? item.weightRoundOffRules.map((r, i) => ({
        id: r.id || Date.now() + i,
        from: r.from ?? '',
        to: r.to ?? '',
        roundOffValue: r.roundOffValue ?? ''
      }))
      : [];
    setRoundOffRules(existingRules.length > 0 ? existingRules : [
      { id: Date.now(), from: '', to: '', roundOffValue: '' }
    ]);
    if (Array.isArray(item.weightRoundOffStores)) {
      setRoundOffStores(item.weightRoundOffStores);
    } else {
      // Default to all active stores
      setRoundOffStores(stores.map(s => s.id));
    }
  };

  const handleToggleStore = (storeId) => {
    setRoundOffStores(prev =>
      prev.includes(storeId) ? prev.filter(id => id !== storeId) : [...prev, storeId]
    );
  };

  const handleSelectAllStores = () => {
    if (roundOffStores.length === stores.length) {
      setRoundOffStores([]);
    } else {
      setRoundOffStores(stores.map(s => s.id));
    }
  };

  const handleAddRule = () => {
    setRoundOffRules(prev => [...prev, { id: Date.now() + Math.random(), from: '', to: '', roundOffValue: '' }]);
  };

  const handleRemoveRule = (ruleId) => {
    setRoundOffRules(prev => prev.filter(r => r.id !== ruleId));
  };

  const handleRuleChange = (ruleId, field, val) => {
    setRoundOffRules(prev => prev.map(r => r.id === ruleId ? { ...r, [field]: val } : r));
  };

  const handleLoadStandardPresets = () => {
    setRoundOffRules([
      { id: Date.now() + 1, from: '0.230', to: '0.270', roundOffValue: '0.250' },
      { id: Date.now() + 2, from: '0.480', to: '0.520', roundOffValue: '0.500' },
      { id: Date.now() + 3, from: '0.730', to: '0.770', roundOffValue: '0.750' },
      { id: Date.now() + 4, from: '0.980', to: '1.020', roundOffValue: '1.000' }
    ]);
    toast.success('Loaded common 250g, 500g, 750g, 1kg sweet roundoff tiers');
  };

  const handleSaveRoundOff = async () => {
    if (!roundOffModalItem) return;

    const validRules = [];
    for (let i = 0; i < roundOffRules.length; i++) {
      const r = roundOffRules[i];
      if (r.from === '' && r.to === '' && r.roundOffValue === '') continue;
      const fromVal = parseFloat(r.from);
      const toVal = parseFloat(r.to);
      const roundVal = parseFloat(r.roundOffValue);

      if (isNaN(fromVal) || isNaN(toVal) || isNaN(roundVal)) {
        return toast.error(`Rule #${i + 1}: Please enter valid numbers for From, To, and Round-Off value.`);
      }
      if (fromVal <= 0 || toVal <= 0 || roundVal <= 0) {
        return toast.error(`Rule #${i + 1}: Weight values must be greater than 0.`);
      }
      if (fromVal >= toVal) {
        return toast.error(`Rule #${i + 1}: 'From' weight must be less than 'To' weight.`);
      }
      validRules.push({
        id: r.id || Date.now() + i,
        from: Number(fromVal.toFixed(3)),
        to: Number(toVal.toFixed(3)),
        roundOffValue: Number(roundVal.toFixed(3))
      });
    }

    setSavingRoundOff(true);
    try {
      await updateDoc(doc(db, 'items', roundOffModalItem.id), {
        weightRoundOffRules: validRules,
        weightRoundOffStores: roundOffStores,
        updatedAt: serverTimestamp()
      });
      if (viewingItem && viewingItem.id === roundOffModalItem.id) {
        setViewingItem(prev => ({
          ...prev,
          weightRoundOffRules: validRules,
          weightRoundOffStores: roundOffStores
        }));
      }
      toast.success(`Weight roundoff rules saved for "${roundOffModalItem.name}"`);
      setRoundOffModalItem(null);
    } catch (err) {
      console.error("Failed to save roundoff rules:", err);
      toast.error("Failed to save roundoff rules");
    } finally {
      setSavingRoundOff(false);
    }
  };

  const handleToggleFavourite = async (item, e) => {
    if (e) e.stopPropagation();
    try {
      const nextFav = !item.isFavourite;
      await updateDoc(doc(db, 'items', item.id), {
        isFavourite: nextFav,
        updatedAt: serverTimestamp()
      });
      toast.success(nextFav ? `Added "${item.name}" to favourites` : `Removed "${item.name}" from favourites`);
    } catch (err) {
      console.error("Failed to update favourite:", err);
      toast.error("Failed to update favourite status");
    }
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

  const handleToggleWorksheetVisibility = async (item, checked) => {
    try {
      await updateDoc(doc(db, 'items', item.id), {
        showInWorksheet: checked,
        updatedAt: serverTimestamp()
      });
      toast.success(`${item.name} ${checked ? 'enabled' : 'disabled'} in store worksheet`);
    } catch (error) {
      console.error("Failed to toggle item visibility:", error);
      toast.error("Failed to update item visibility");
    }
  };

  // Bulk Import Helper Functions
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file) => {
    const fileExt = file.name.split('.').pop().toLowerCase();
    if (fileExt !== 'xlsx' && fileExt !== 'xls' && fileExt !== 'csv') {
      toast.error("Please upload only Excel (.xlsx, .xls) or CSV files");
      return;
    }

    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (rows.length === 0) {
          toast.error("The selected file is empty");
          return;
        }

        // Header matching logic
        const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
        const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('item') || h.includes('title'));
        const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('cost') || h.includes('rate') || h.includes('amount'));
        const unitIdx = headers.findIndex(h => h.includes('unit') || h.includes('type') || h.includes('measure'));
        const mUnitIdx = headers.findIndex(h => h.includes('manufacturing') || h.includes('munit') || h.includes('kitchen') || h.includes('factory'));
        const categoryIdx = headers.findIndex(h => h.includes('category') || h.includes('cat') || h.includes('group'));

        if (nameIdx === -1 || priceIdx === -1) {
          toast.error("Could not find standard columns for 'Name' and 'Price' in your file. Please download and use the template.");
          return;
        }

        const parsed = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length === 0) continue;

          const name = String(row[nameIdx] || '').trim();
          if (!name) continue; // Skip blank lines

          const priceVal = parseFloat(String(row[priceIdx] || '').replace(/[^\d.-]/g, ''));

          const rawUnit = String(row[unitIdx] || '').trim().toLowerCase();
          let unit = 'Weight';
          if (rawUnit.includes('pc') || rawUnit.includes('piece') || rawUnit.includes('qty') || rawUnit.includes('count')) {
            unit = 'Piece';
          }

          const rawMUnit = String(row[mUnitIdx] || '').trim();
          const rawCategory = String(row[categoryIdx] || '').trim();

          const errors = [];
          if (!name) errors.push("Item name is empty");
          if (isNaN(priceVal) || priceVal <= 0) errors.push("Price must be a valid positive number");

          let mUnitId = '';
          let mUnitWarning = false;
          if (rawMUnit) {
            const foundMU = mUnits.find(mu => mu.name.trim().toLowerCase() === rawMUnit.toLowerCase());
            if (foundMU) {
              mUnitId = foundMU.id;
            }
          } else {
            mUnitWarning = true;
          }

          let categoryId = '';
          if (rawCategory) {
            const foundCat = categories.find(cat => cat.name.trim().toLowerCase() === rawCategory.toLowerCase());
            if (foundCat) {
              categoryId = foundCat.id;
            }
          }

          parsed.push({
            name,
            price: isNaN(priceVal) ? '' : priceVal,
            unit,
            rawMUnit,
            rawCategory,
            mUnitId,
            categoryId,
            errors,
            warning: mUnitWarning,
            status: errors.length > 0 ? 'invalid' : (mUnitWarning ? 'warning' : 'valid')
          });
        }

        if (parsed.length === 0) {
          toast.error("No valid data rows found in the file.");
          return;
        }

        setParsedData(parsed);
        toast.success(`Successfully parsed ${parsed.length} rows!`);
      } catch (err) {
        console.error("Error reading spreadsheet file:", err);
        toast.error("Failed to parse sheet: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    try {
      const headers = ['Name', 'Price (INR)', 'Unit Type (Weight / Piece)', 'Manufacturing Unit', 'Category (Optional)'];
      const examples = [
        ['Special Ghee Mysore Pak', '650', 'Weight', mUnits[0]?.name || 'Main Kitchen', categories[0]?.name || 'Sweets'],
        ['Kaju Katli', '900', 'Weight', mUnits[0]?.name || 'Main Kitchen', categories[0]?.name || 'Sweets'],
        ['Special Kara Boondi', '50', 'Piece', mUnits[1]?.name || mUnits[0]?.name || 'Savories Kitchen', categories[1]?.name || 'Snacks']
      ];

      let csvContent = headers.join(',') + '\n';
      examples.forEach(row => {
        csvContent += row.map(v => {
          const str = String(v);
          return str.includes(',') ? `"${str}"` : str;
        }).join(',') + '\n';
      });

      // Add information about valid names
      csvContent += '\n';
      csvContent += '--- HELP & DIRECTIONS ---\n';
      csvContent += `"Available Manufacturing Units (Match exactly): ${mUnits.map(mu => mu.name).join(' | ')}"\n`;
      csvContent += `"Available Categories (Match exactly): ${categories.map(cat => cat.name).join(' | ')}"\n`;
      csvContent += 'Unit Type must be either: Weight (default) or Piece\n';

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "item_bulk_import_template.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("CSV Template downloaded successfully");
    } catch (err) {
      console.error("Error generating CSV template:", err);
      toast.error("Failed to download template");
    }
  };

  const handleBulkImport = async () => {
    const importable = parsedData.filter(item => {
      if (item.status === 'invalid') return false;
      if (item.status === 'warning' && !item.mUnitId && !fallbackMUnitId) return false;
      return true;
    });

    if (importable.length === 0) {
      toast.error("No valid items to import. Please resolve validation errors or select a fallback manufacturing unit.");
      return;
    }

    setIsImporting(true);
    try {
      const batch = writeBatch(db);
      const itemsCollection = collection(db, 'items');
      const categoriesCollection = collection(db, 'categories');
      const mUnitsCollection = collection(db, 'manufacturing_units');

      // Keep track of newly created categories and manufacturing units in this batch to avoid duplicates
      const newCategoryRefsByName = {};
      const newMUnitRefsByName = {};

      // First pass: identify and create new categories and manufacturing units
      importable.forEach(row => {
        // Category creation
        if (row.rawCategory && !row.categoryId) {
          const cleanName = row.rawCategory.trim();
          const key = cleanName.toLowerCase();

          if (!newCategoryRefsByName[key]) {
            // Generate a new category reference with auto-ID
            const newCatRef = doc(categoriesCollection);
            batch.set(newCatRef, {
              name: cleanName,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            newCategoryRefsByName[key] = newCatRef.id;
          }
        }

        // Manufacturing Unit creation
        if (row.rawMUnit && !row.mUnitId) {
          const cleanName = row.rawMUnit.trim();
          const key = cleanName.toLowerCase();

          if (!newMUnitRefsByName[key]) {
            // Generate a new manufacturing unit reference with auto-ID
            const newMUnitRef = doc(mUnitsCollection);
            batch.set(newMUnitRef, {
              name: cleanName,
              address: 'Unspecified Address',
              city: 'Unspecified City',
              state: 'Unspecified State',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            newMUnitRefsByName[key] = newMUnitRef.id;
          }
        }
      });

      // Second pass: add items referencing matched or newly created IDs
      importable.forEach(row => {
        const itemDocRef = doc(itemsCollection);

        let finalCategoryId = row.categoryId || '';
        if (row.rawCategory && !finalCategoryId) {
          const key = row.rawCategory.trim().toLowerCase();
          finalCategoryId = newCategoryRefsByName[key] || '';
        }

        let finalMUnitId = row.mUnitId || '';
        if (row.rawMUnit && !finalMUnitId) {
          const key = row.rawMUnit.trim().toLowerCase();
          finalMUnitId = newMUnitRefsByName[key] || '';
        }

        // Fallback if rawMUnit is empty
        if (!finalMUnitId) {
          finalMUnitId = fallbackMUnitId;
        }

        batch.set(itemDocRef, {
          name: row.name,
          price: Number(row.price),
          unit: row.unit,
          mUnitId: finalMUnitId,
          categoryId: finalCategoryId,
          image: DEFAULT_ITEM_IMAGE,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();
      toast.success(`Successfully imported ${importable.length} items and created missing categories & manufacturing units!`);
      resetImport();
    } catch (err) {
      console.error("Failed to commit batch writes:", err);
      toast.error("Import failed: " + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setParsedData([]);
    setFallbackMUnitId('');
    setShowImportModal(false);
  };

  const sortedItems = [...items].sort((a, b) => {
    const favA = a.isFavourite ? 1 : 0;
    const favB = b.isFavourite ? 1 : 0;
    if (favB !== favA) return favB - favA;
    const timeA = a.createdAt?.seconds || 0;
    const timeB = b.createdAt?.seconds || 0;
    return timeB - timeA;
  });

  const filteredItems = sortedItems.filter(item => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const nameMatch = (item.name || '').toLowerCase().includes(q);
    const barcodeMatch = (item.barcode || item.barcodeId || '').toLowerCase().includes(q);
    const priceMatch = String(item.price || '').includes(q);
    return nameMatch || barcodeMatch || priceMatch;
  });

  return (
    <div className="polaris-page-container">
      {/* Polaris Header Bar */}
      <div className="polaris-header-bar">
        <div className="polaris-page-title-group">
          <div className="polaris-page-title-icon">
            <Package size={24} />
          </div>
          <h1 className="polaris-page-title">Products</h1>
        </div>
        <div className="polaris-header-actions">
          <button className="polaris-btn polaris-btn-secondary" onClick={downloadTemplate}>
            <Download size={14} /> Export
          </button>
          <button className="polaris-btn polaris-btn-secondary" onClick={() => setShowImportModal(true)}>
            <Upload size={14} /> Import
          </button>
          <button className="polaris-btn polaris-btn-primary" onClick={() => { resetForm(); setShowAddForm(true); }}>
            <Plus size={16} /> Add product
          </button>
        </div>
      </div>

      {/* Polaris Top Metrics Summary Card */}
      <div className="polaris-metrics-card">
        <div className="polaris-metric-item">
          <div className="polaris-metric-label">Total Products</div>
          <div className="polaris-metric-value">{items.length}</div>
          <div className="polaris-metric-subtext">Active catalog items</div>
        </div>
        <div className="polaris-metric-item">
          <div className="polaris-metric-label">Categories</div>
          <div className="polaris-metric-value">{categories.length}</div>
          <div className="polaris-metric-subtext">Assigned product groups</div>
        </div>
        <div className="polaris-metric-item">
          <div className="polaris-metric-label">Manufacturing Units</div>
          <div className="polaris-metric-value">{mUnits.length}</div>
          <div className="polaris-metric-subtext">Kitchens & factories</div>
        </div>
        <div className="polaris-metric-item">
          <div className="polaris-metric-label">Average Price</div>
          <div className="polaris-metric-value">
            ₹{items.length > 0 ? (items.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0) / items.length).toFixed(0) : '0'}
          </div>
          <div className="polaris-metric-subtext">Per unit price</div>
        </div>
      </div>

      <div className="items-content-layout">
        <div className="items-list-section full">
          {/* Polaris Card Panel containing Table */}
          <div className="polaris-card">
            {/* Filter Toolbar */}
            <div className="polaris-table-toolbar">
              <div className="polaris-table-search">
                <Search size={14} style={{ color: 'var(--polaris-text-subdued)' }} />
                <input
                  type="text"
                  placeholder="Search by name, barcode ID, price..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Polaris Data Table */}
            <div className="polaris-table-wrapper">
              {loading ? (
                <div className="items-loader-container" style={{ padding: '40px', textAlign: 'center' }}>
                  <div className="loader"></div>
                </div>
              ) : filteredItems.length > 0 ? (
                <table className="polaris-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}><input type="checkbox" /></th>
                      <th>Product</th>
                      <th>Barcode ID</th>
                      <th>Status</th>
                      <th>Unit Type</th>
                      <th>Price</th>
                      <th>Category</th>
                      <th>Kitchen / Unit</th>
                      <th>Worksheet</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => {
                      const catName = categories.find(cat => cat.id === item.categoryId)?.name || 'Uncategorized';
                      const mUnitName = mUnits.find(mu => mu.id === item.mUnitId)?.name || 'Main Kitchen';
                      const imgSrc = (!item.image || typeof item.image !== 'string' || item.image.trim() === "" || item.image.toLowerCase() === "none" || item.image.toLowerCase() === "null" || item.image.includes('unsplash')) ? DEFAULT_ITEM_IMAGE : item.image;
                      const barcodeVal = item.barcode || item.barcodeId || '';

                      return (
                        <tr key={item.id}>
                          <td><input type="checkbox" /></td>
                          <td>
                            <div className="polaris-item-cell">
                              <img
                                src={imgSrc}
                                alt={item.name}
                                className="polaris-item-img"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.src = DEFAULT_ITEM_IMAGE;
                                }}
                              />
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <button
                                    type="button"
                                    onClick={(e) => handleToggleFavourite(item, e)}
                                    title={item.isFavourite ? "Remove from favourites" : "Add to favourites"}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      padding: '0',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: item.isFavourite ? '#eab308' : '#94a3b8'
                                    }}
                                  >
                                    <Star size={15} fill={item.isFavourite ? "#eab308" : "none"} strokeWidth={item.isFavourite ? 2 : 1.5} />
                                  </button>
                                  <span className="polaris-item-title">{item.name}</span>
                                </div>
                                {item.isFavourite && (
                                  <span style={{ width: 'fit-content', fontSize: '10px', background: '#fef9c3', color: '#854d0e', border: '1px solid #fde047', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                    ★ FAVOURITE
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            {barcodeVal ? (
                              <span className="polaris-badge" style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '11px', letterSpacing: '0.5px', background: '#f1f2f4', border: '1px solid #d1d5db', color: '#374151' }}>
                                {barcodeVal}
                              </span>
                            ) : (
                              <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>
                            )}
                          </td>
                          <td>
                            <span className="polaris-badge polaris-badge-active">Active</span>
                          </td>
                          <td>
                            <span className="polaris-in-stock">{item.unit}</span>
                          </td>
                          <td style={{ fontWeight: '700' }}>₹{item.price}</td>
                          <td style={{ color: 'var(--polaris-text-subdued)' }}>{catName}</td>
                          <td style={{ color: 'var(--polaris-text-subdued)' }}>{mUnitName}</td>
                          <td>
                            <label className="switch" style={{ transform: 'scale(0.8)' }}>
                              <input
                                type="checkbox"
                                checked={item.showInWorksheet !== false}
                                onChange={(e) => handleToggleWorksheetVisibility(item, e.target.checked)}
                              />
                              <span className="slider round"></span>
                            </label>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                              <button onClick={() => handleView(item)} className="polaris-btn polaris-btn-secondary" style={{ height: '28px', padding: '0 8px' }} title="View Details">
                                <Eye size={12} />
                              </button>
                              <button
                                onClick={() => openRoundOffModal(item)}
                                className="polaris-btn polaris-btn-secondary"
                                style={{
                                  height: '28px',
                                  padding: '0 8px',
                                  color: (item.weightRoundOffRules && item.weightRoundOffRules.length > 0) ? '#0A2A1B' : '#64748b',
                                  background: (item.weightRoundOffRules && item.weightRoundOffRules.length > 0) ? '#e6f4ea' : undefined,
                                  borderColor: (item.weightRoundOffRules && item.weightRoundOffRules.length > 0) ? '#86efac' : undefined
                                }}
                                title={`Weight Roundoff Logic (${(item.weightRoundOffRules || []).length} rules)`}
                              >
                                <Scale size={12} />
                                {item.weightRoundOffRules && item.weightRoundOffRules.length > 0 && (
                                  <span style={{ fontSize: '10px', fontWeight: '800', marginLeft: '3px' }}>{item.weightRoundOffRules.length}</span>
                                )}
                              </button>
                              <button onClick={() => handleEdit(item)} className="polaris-btn polaris-btn-secondary" style={{ height: '28px', padding: '0 8px' }} title="Edit Product">
                                <Edit size={12} />
                              </button>
                              <button onClick={() => setShowDeleteModal(item.id)} className="polaris-btn polaris-btn-secondary" style={{ height: '28px', padding: '0 8px', color: '#dc2626' }} title="Delete Product">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="items-empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
                  <div className="empty-icon-circle" style={{ margin: '0 auto 16px' }}>
                    <Package size={32} />
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '4px' }}>No Products Found</h3>
                  <p style={{ color: 'var(--polaris-text-subdued)', fontSize: '13px' }}>Try adjusting your search query or add a new product.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right-Side OffCanvas Drawer */}
      <AnimatePresence>
        {showAddForm && (
          <div className="offcanvas-portal">
            {/* Dimmed Blurred Backdrop */}
            <motion.div
              className="offcanvas-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={resetForm}
            />

            {/* Slide-over Drawer Panel */}
            <motion.div
              className="offcanvas-drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <div className="offcanvas-header">
                <div className="offcanvas-header-left">
                  <div className="offcanvas-header-icon">
                    {offcanvasMode === 'view' ? <Eye size={20} /> : <Package size={20} />}
                  </div>
                  <div className="offcanvas-header-text">
                    <h2>
                      {offcanvasMode === 'view'
                        ? 'Product Details'
                        : editingItem
                          ? 'Edit Product'
                          : 'Add New Product'}
                    </h2>
                    <p>
                      {offcanvasMode === 'view'
                        ? 'Comprehensive catalog overview, production & weight roundoff rules'
                        : editingItem
                          ? 'Update product specifications and pricing'
                          : 'Fill in the details below to add a new product item'}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={resetForm} className="offcanvas-close-btn" title="Close (Esc)">
                  <X size={18} />
                </button>
              </div>

              <div className="offcanvas-body">
                {offcanvasMode === 'view' && viewingItem ? (
                  <div className="product-view-details">
                    {/* Hero Card */}
                    <div className="pvd-hero-card">
                      <div className="pvd-img-box">
                        <img
                          src={(!viewingItem.image || typeof viewingItem.image !== 'string' || viewingItem.image.trim() === "" || viewingItem.image.toLowerCase() === "none" || viewingItem.image.toLowerCase() === "null" || viewingItem.image.includes('unsplash')) ? DEFAULT_ITEM_IMAGE : viewingItem.image}
                          alt={viewingItem.name}
                          onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_ITEM_IMAGE; }}
                        />
                      </div>
                      <div className="pvd-hero-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h3 className="pvd-title">{viewingItem.name}</h3>
                          {viewingItem.isFavourite && (
                            <span className="pvd-fav-badge">★ FAVOURITE</span>
                          )}
                        </div>
                        <div className="pvd-badge-row">
                          <span className="polaris-badge polaris-badge-active">Active</span>
                          <span className="polaris-badge" style={{ background: '#f1f5f9', color: '#334155' }}>{viewingItem.unit} Unit</span>
                          <span className="pvd-price-badge">₹{viewingItem.price} / {viewingItem.unit === 'Weight' ? 'kg' : 'pc'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Specifications Grid */}
                    <div className="pvd-section">
                      <h4 className="pvd-section-title">Catalog Information</h4>
                      <div className="pvd-grid">
                        <div className="pvd-info-box">
                          <span className="pvd-label">Item Name</span>
                          <span className="pvd-val">{viewingItem.name}</span>
                        </div>
                        <div className="pvd-info-box">
                          <span className="pvd-label">Barcode ID / SKU</span>
                          <span className="pvd-val mono">{viewingItem.barcode || viewingItem.barcodeId || '—'}</span>
                        </div>
                        <div className="pvd-info-box">
                          <span className="pvd-label">Base Price</span>
                          <span className="pvd-val highlight">₹{viewingItem.price}</span>
                        </div>
                        <div className="pvd-info-box">
                          <span className="pvd-label">Unit Type</span>
                          <span className="pvd-val">{viewingItem.unit}</span>
                        </div>
                        <div className="pvd-info-box">
                          <span className="pvd-label">Category</span>
                          <span className="pvd-val">{categories.find(c => c.id === viewingItem.categoryId)?.name || 'Uncategorized'}</span>
                        </div>
                        <div className="pvd-info-box">
                          <span className="pvd-label">Manufacturing Unit</span>
                          <span className="pvd-val">{mUnits.find(u => u.id === viewingItem.mUnitId)?.name || 'Main Kitchen'}</span>
                        </div>
                        <div className="pvd-info-box">
                          <span className="pvd-label">Store Worksheet</span>
                          <span className="pvd-val">
                            {viewingItem.showInWorksheet !== false ? '✓ Visible in worksheet' : '✗ Hidden from worksheet'}
                          </span>
                        </div>
                        <div className="pvd-info-box">
                          <span className="pvd-label">Priority Order</span>
                          <span className="pvd-val">{viewingItem.isFavourite ? '★ High (Favourite)' : 'Standard'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Weight Roundoff Rules */}
                    <div className="pvd-section">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 className="pvd-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Scale size={16} style={{ color: 'var(--primary-color)' }} /> Weight Roundoff Rules
                        </h4>
                        <button
                          type="button"
                          onClick={() => openRoundOffModal(viewingItem)}
                          className="pvd-btn-link"
                        >
                          {viewingItem.weightRoundOffRules && viewingItem.weightRoundOffRules.length > 0 ? 'Edit Rules' : '+ Configure Rules'}
                        </button>
                      </div>

                      {viewingItem.weightRoundOffRules && viewingItem.weightRoundOffRules.length > 0 ? (
                        <>
                          <div className="pvd-roundoff-table-wrapper">
                            <table className="pvd-roundoff-table">
                              <thead>
                                <tr>
                                  <th>From Weight</th>
                                  <th>To Weight</th>
                                  <th>Round-Off Value</th>
                                </tr>
                              </thead>
                              <tbody>
                                {viewingItem.weightRoundOffRules.map((rule, idx) => (
                                  <tr key={idx}>
                                    <td><strong>{rule.from} kg</strong></td>
                                    <td><strong>{rule.to} kg</strong></td>
                                    <td className="pvd-round-target">
                                      <span className="pvd-round-chip">⚡ {rule.roundOffValue} kg</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Applicable Stores in View Drawer */}
                          <div style={{ marginTop: '8px', fontSize: '11px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <Store size={13} color="var(--primary-color)" />
                            <strong>Active in Stores:</strong>
                            {viewingItem.weightRoundOffStores && viewingItem.weightRoundOffStores.length > 0 ? (
                              viewingItem.weightRoundOffStores.length === stores.length ? (
                                <span style={{ background: '#e6f4ea', color: '#166534', padding: '2px 7px', borderRadius: '4px', fontSize: '10.5px', fontWeight: '700' }}>
                                  All Stores ({stores.length})
                                </span>
                              ) : (
                                viewingItem.weightRoundOffStores.map(sId => {
                                  const st = stores.find(s => s.id === sId);
                                  return st ? (
                                    <span key={sId} style={{ background: '#f1f5f9', color: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: '600' }}>
                                      {st.name}
                                    </span>
                                  ) : null;
                                })
                              )
                            ) : (
                              <span style={{ color: '#ef4444', fontStyle: 'italic', fontSize: '10.5px' }}>
                                No stores selected
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="pvd-empty-roundoff">
                          <p>No roundoff intervals configured for this item yet.</p>
                          <button type="button" onClick={() => openRoundOffModal(viewingItem)} className="polaris-btn polaris-btn-secondary" style={{ height: '32px', fontSize: '12px' }}>
                            <Scale size={14} /> Configure Roundoff Rules
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <form id="item-offcanvas-form" onSubmit={handleSubmit} className="items-form">
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
                      <label>Item Name *</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="e.g. Special Ghee Mysore Pak"
                        required
                      />
                    </div>

                    <div className="items-input-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Barcode size={15} style={{ color: 'var(--primary-color)' }} /> Barcode ID / SKU Code
                      </label>
                      <input
                        type="text"
                        name="barcode"
                        value={formData.barcode}
                        onChange={handleInputChange}
                        placeholder="e.g. 890123456789 or ITEM-101 (used in billing & POS)"
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

                    <div className="items-input-group" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', marginTop: '5px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <label style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Show in Worksheet</label>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Enable to list in store worksheet</span>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={formData.showInWorksheet}
                          onChange={(e) => setFormData(prev => ({ ...prev, showInWorksheet: e.target.checked }))}
                        />
                        <span className="slider round"></span>
                      </label>
                    </div>

                    <div className="items-input-group" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', marginTop: '5px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <label style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Star size={15} fill={formData.isFavourite ? "#eab308" : "none"} color={formData.isFavourite ? "#eab308" : "var(--text-primary)"} />
                          Add to Favourite
                        </label>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Display this product first in product lists</span>
                      </div>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={formData.isFavourite || false}
                          onChange={(e) => setFormData(prev => ({ ...prev, isFavourite: e.target.checked }))}
                        />
                        <span className="slider round"></span>
                      </label>
                    </div>
                  </form>
                )}
              </div>

              <div className="offcanvas-footer">
                {offcanvasMode === 'view' && viewingItem ? (
                  <>
                    <button type="button" onClick={resetForm} className="items-btn-cancel">
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => openRoundOffModal(viewingItem)}
                      className="items-btn-cancel"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Scale size={15} /> Configure Roundoff
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(viewingItem)}
                      className="items-btn-save"
                    >
                      <Edit size={15} /> Edit Product
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={resetForm} className="items-btn-cancel">Cancel</button>
                    <button type="submit" form="item-offcanvas-form" className="items-btn-save" disabled={submitting}>
                      {submitting ? <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff', borderRightColor: '#fff' }}></div> : (editingItem ? 'Save Changes' : 'Create Product')}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Weight Roundoff Configuration Modal */}
      {roundOffModalItem && (
        <div className="roundoff-modal-overlay" onClick={() => setRoundOffModalItem(null)}>
          <div className="roundoff-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="roundoff-modal-header">
              <div className="roundoff-modal-header-left">
                <div className="roundoff-modal-icon">
                  <Scale size={18} />
                </div>
                <div>
                  <h3 className="roundoff-modal-title">Weight Roundoff Logic</h3>
                  <p className="roundoff-modal-subtitle">
                    Product: <strong>{roundOffModalItem.name}</strong> (₹{roundOffModalItem.price}/kg)
                  </p>
                </div>
              </div>
              <button onClick={() => setRoundOffModalItem(null)} className="roundoff-modal-close" aria-label="Close modal">
                <X size={16} />
              </button>
            </div>

            <div className="roundoff-modal-body">
              <div className="roundoff-info-alert">
                <Info size={15} className="roundoff-alert-icon" />
                <p>
                  Define weight ranges that automatically round to standard sales packages in POS billing (e.g. 0.230kg to 0.270kg rounds to 0.250kg).
                </p>
              </div>

              {/* Store Selection with Checkboxes */}
              <div className="roundoff-store-section">
                <div className="roundoff-store-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Store size={13} color="var(--primary-color)" />
                    <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)' }}>
                      Applicable Stores ({roundOffStores.length}/{stores.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectAllStores}
                    className="roundoff-store-toggle-btn"
                  >
                    {roundOffStores.length === stores.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div className="roundoff-stores-grid">
                  {stores.length === 0 ? (
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>Loading stores...</span>
                  ) : (
                    stores.map(st => {
                      const isChecked = roundOffStores.includes(st.id);
                      return (
                        <label
                          key={st.id}
                          className={`roundoff-store-chip ${isChecked ? 'checked' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleStore(st.id)}
                          />
                          <span title={st.name}>{st.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                {roundOffStores.length === 0 && (
                  <span style={{ fontSize: '10px', color: '#DC2626', fontWeight: '600' }}>
                    ⚠️ No stores selected. Round-off will not apply in POS billing for any store.
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '2px 0 4px', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  Configured Weight Ranges ({roundOffRules.length})
                </span>
                {/* <button
                  type="button"
                  onClick={handleLoadStandardPresets}
                  className="polaris-btn polaris-btn-secondary"
                  style={{ height: '24px', padding: '0 8px', fontSize: '10.5px', fontWeight: '700' }}
                >
                  ⚡ Load Standard Tiers (250g, 500g, 1kg)
                </button> */}
              </div>

              <div className="roundoff-rules-list">
                <div className="roundoff-rules-header">
                  <span>From Weight</span>
                  <span>To Weight</span>
                  <span>Round-Off Value</span>
                  <span></span>
                </div>

                {roundOffRules.map((rule, idx) => (
                  <div key={rule.id || idx} className="roundoff-rule-row">
                    <div className="roundoff-input-wrap">
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        placeholder="e.g. 0.230"
                        value={rule.from}
                        onChange={(e) => handleRuleChange(rule.id, 'from', e.target.value)}
                      />
                      <span className="unit-tag">kg</span>
                    </div>

                    <div className="roundoff-input-wrap">
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        placeholder="e.g. 0.270"
                        value={rule.to}
                        onChange={(e) => handleRuleChange(rule.id, 'to', e.target.value)}
                      />
                      <span className="unit-tag">kg</span>
                    </div>

                    <div className="roundoff-input-wrap highlight">
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        placeholder="e.g. 0.250"
                        value={rule.roundOffValue}
                        onChange={(e) => handleRuleChange(rule.id, 'roundOffValue', e.target.value)}
                      />
                      <span className="unit-tag">kg</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveRule(rule.id)}
                      className="roundoff-delete-btn"
                      title="Remove range"
                      disabled={roundOffRules.length === 1 && rule.from === '' && rule.to === '' && rule.roundOffValue === ''}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddRule}
                className="roundoff-add-row-btn"
              >
                <Plus size={14} /> Add Another Weight Range
              </button>
            </div>

            <div className="roundoff-modal-footer">
              <button
                type="button"
                onClick={() => setRoundOffModalItem(null)}
                className="polaris-btn polaris-btn-secondary"
                style={{ height: '32px', padding: '0 14px', fontSize: '12px', fontWeight: '600' }}
                disabled={savingRoundOff}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRoundOff}
                className="polaris-btn polaris-btn-primary"
                style={{ height: '32px', padding: '0 16px', fontSize: '12px', fontWeight: '700' }}
                disabled={savingRoundOff}
              >
                {savingRoundOff ? (
                  <div className="loader" style={{ width: '14px', height: '14px', borderTopColor: '#fff', borderRightColor: '#fff' }}></div>
                ) : (
                  'Save Roundoff Rules'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="import-modal-overlay">
          <div className="import-modal-card">
            <div className="import-modal-header">
              <div className="import-modal-header-info">
                <h2>Bulk Import Items</h2>
                <p>Upload an Excel (.xlsx, .xls) or CSV file containing item records</p>
              </div>
              <button className="import-modal-close-btn" onClick={resetImport}>
                <X size={20} />
              </button>
            </div>

            <div className="import-modal-body">
              <div className="import-template-box">
                <div className="import-template-text">
                  <h4>Need a template?</h4>
                  <p>Download our pre-formatted template with guidance and active category names.</p>
                </div>
                <button className="import-template-download-btn" onClick={downloadTemplate}>
                  <Download size={16} /> Download Template
                </button>
              </div>

              <div
                className={`import-dropzone ${dragActive ? 'active' : ''}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById('bulk-file-input').click()}
              >
                <input
                  id="bulk-file-input"
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <div className="import-dropzone-icon-circle">
                  <FileSpreadsheet size={28} />
                </div>
                {importFile ? (
                  <div>
                    <h3>Selected File: {importFile.name}</h3>
                    <p>{(importFile.size / 1024).toFixed(2)} KB - Click or drag new file to replace</p>
                  </div>
                ) : (
                  <div>
                    <h3>Drag & Drop your spreadsheet here</h3>
                    <p>Supports .xlsx, .xls, and .csv files</p>
                  </div>
                )}
              </div>

              {parsedData.length > 0 && (
                <div className="import-preview-section">
                  <div className="import-preview-header">
                    <h3>Parsed Preview</h3>
                    <div className="import-preview-summary">
                      <span className="import-summary-pill ready">
                        Ready: {parsedData.filter(r => r.status === 'valid').length}
                      </span>
                      <span className="import-summary-pill warning">
                        Warnings: {parsedData.filter(r => r.status === 'warning').length}
                      </span>
                      <span className="import-summary-pill errors">
                        Errors: {parsedData.filter(r => r.status === 'invalid').length}
                      </span>
                    </div>
                  </div>

                  <div className="import-table-wrapper">
                    <table className="import-table">
                      <thead>
                        <tr>
                          <th>Item Name</th>
                          <th>Unit</th>
                          <th>Price</th>
                          <th>Manufacturing Unit</th>
                          <th>Category</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedData.map((row, idx) => (
                          <tr key={idx} className={row.status === 'invalid' ? 'row-invalid' : ''}>
                            <td>
                              <div style={{ fontWeight: '600' }}>{row.name}</div>
                              {row.errors.includes("Item name is empty") && (
                                <div className="import-row-error">Name cannot be empty</div>
                              )}
                            </td>
                            <td>{row.unit}</td>
                            <td>
                              <div>₹{row.price || '-'}</div>
                              {row.errors.includes("Price must be a valid positive number") && (
                                <div className="import-row-error">Invalid price</div>
                              )}
                            </td>
                            <td>
                              {row.mUnitId ? (
                                <span style={{ color: '#137333', fontWeight: '500' }}>
                                  {mUnits.find(mu => mu.id === row.mUnitId)?.name}
                                </span>
                              ) : row.rawMUnit ? (
                                <span style={{ color: '#3182ce', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <Factory size={12} style={{ color: '#3182ce' }} />
                                  {row.rawMUnit}
                                  <span style={{ fontSize: '9px', background: '#ebf8ff', color: '#2b6cb0', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>NEW</span>
                                </span>
                              ) : (
                                <div>
                                  {fallbackMUnitId ? (
                                    <span style={{ color: '#137333', fontWeight: '500' }}>
                                      {mUnits.find(mu => mu.id === fallbackMUnitId)?.name}
                                      <span style={{ fontSize: '9px', background: '#e6f4ea', color: '#137333', padding: '1px 4px', borderRadius: '4px', marginLeft: '4px' }}>FALLBACK</span>
                                    </span>
                                  ) : (
                                    <div className="import-row-error" style={{ color: '#B06000' }}>
                                      Requires fallback unit
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td>
                              {row.categoryId ? (
                                <span style={{ fontWeight: '500' }}>
                                  {categories.find(cat => cat.id === row.categoryId)?.name}
                                </span>
                              ) : row.rawCategory ? (
                                <span style={{ color: '#3182ce', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <Tag size={12} style={{ color: '#3182ce' }} />
                                  {row.rawCategory}
                                  <span style={{ fontSize: '9px', background: '#ebf8ff', color: '#2b6cb0', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>NEW</span>
                                </span>
                              ) : (
                                <span style={{ color: '#718096', fontStyle: 'italic' }}>Uncategorized</span>
                              )}
                            </td>
                            <td>
                              <span className={`import-badge ${row.status === 'valid' ? 'success' : (row.status === 'warning' ? 'warn' : 'error')}`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {parsedData.some(r => r.status === 'warning' && !r.mUnitId) && (
                    <div className="import-fallback-section">
                      <div className="import-fallback-header">
                        <AlertCircle size={18} />
                        <span>Map Missing Manufacturing Units</span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Some items have unspecified or unmatched manufacturing units. Choose a default fallback manufacturing unit to apply to these items so they can be imported:
                      </p>
                      <div className="import-fallback-controls">
                        <label>Fallback Unit:</label>
                        <select
                          value={fallbackMUnitId}
                          onChange={(e) => setFallbackMUnitId(e.target.value)}
                          className="items-select"
                          style={{ maxWidth: '280px', height: '38px' }}
                        >
                          <option value="">-- Select Fallback --</option>
                          {mUnits.map(mu => (
                            <option key={mu.id} value={mu.id}>{mu.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="import-modal-footer">
              <button className="import-btn-cancel" onClick={resetImport} disabled={isImporting}>
                Cancel
              </button>
              <button
                className="import-btn-submit"
                onClick={handleBulkImport}
                disabled={
                  isImporting ||
                  parsedData.length === 0 ||
                  parsedData.filter(item => {
                    if (item.status === 'invalid') return false;
                    if (item.status === 'warning' && !item.mUnitId && !fallbackMUnitId) return false;
                    return true;
                  }).length === 0
                }
              >
                {isImporting ? (
                  <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Import {
                      parsedData.filter(item => {
                        if (item.status === 'invalid') return false;
                        if (item.status === 'warning' && !item.mUnitId && !fallbackMUnitId) return false;
                        return true;
                      }).length
                    } Items
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
