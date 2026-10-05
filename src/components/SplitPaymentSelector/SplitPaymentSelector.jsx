import React, { useState, useMemo, useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, Layers, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import './SplitPaymentSelector.css';

/**
 * Helper to format payment mode for displays, tables, and receipts.
 * e.g., if Split: "Split (Cash: ₹200, UPI: ₹300)"
 */
export const formatPaymentModeDisplay = (item) => {
  if (!item) return 'Cash';
  const mode = item.paymentMode || item.paymentType || 'Cash';
  if (mode !== 'Split') return mode;

  const splits = item.splitPayments || {};
  const parts = [];
  if (Number(splits.Cash) > 0) parts.push(`Cash: ₹${Number(splits.Cash).toFixed(0)}`);
  if (Number(splits.UPI) > 0) parts.push(`UPI: ₹${Number(splits.UPI).toFixed(0)}`);
  if (Number(splits.Card) > 0) parts.push(`Card: ₹${Number(splits.Card).toFixed(0)}`);
  if (Number(splits.NetBanking) > 0) parts.push(`NetBanking: ₹${Number(splits.NetBanking).toFixed(0)}`);

  return parts.length > 0 ? `Split (${parts.join(', ')})` : 'Split';
};

/**
 * Validates whether the split payment amounts match the target total.
 */
export const validateSplitPayment = (mode, splitPayments, targetTotal = 0) => {
  if (mode !== 'Split') return { valid: true };

  const cash = parseFloat(splitPayments?.Cash) || 0;
  const upi = parseFloat(splitPayments?.UPI) || 0;
  const card = parseFloat(splitPayments?.Card) || 0;
  const netBanking = parseFloat(splitPayments?.NetBanking) || 0;
  const totalAllocated = cash + upi + card + netBanking;

  const target = parseFloat(targetTotal) || 0;
  const diff = Math.abs(totalAllocated - target);

  if (target <= 0) {
    if (totalAllocated <= 0) return { valid: true, totalAllocated: 0, target: 0 };
  }

  if (diff > 0.05) {
    if (totalAllocated < target) {
      return {
        valid: false,
        totalAllocated,
        target,
        remaining: target - totalAllocated,
        error: `Split sum (₹${totalAllocated.toFixed(2)}) is less than required total (₹${target.toFixed(2)}). ₹${(target - totalAllocated).toFixed(2)} remaining.`
      };
    } else {
      return {
        valid: false,
        totalAllocated,
        target,
        exceeded: totalAllocated - target,
        error: `Split sum (₹${totalAllocated.toFixed(2)}) exceeds required total (₹${target.toFixed(2)}) by ₹${(totalAllocated - target).toFixed(2)}.`
      };
    }
  }

  return { valid: true, totalAllocated, target };
};

/**
 * SplitPaymentSelector Component with Split Modal
 */
export const SplitPaymentSelector = ({
  paymentMode = 'Cash',
  setPaymentMode,
  splitPayments = { Cash: '', UPI: '', Card: '' },
  setSplitPayments,
  totalAmount = 0,
  label = 'Payment Mode',
  availableModes = ['Cash', 'UPI', 'Card', 'Split'],
  splitMethods = ['Cash', 'UPI', 'Card'],
  onSplitTotalChange,
  compact = false
}) => {
  const currentTotal = parseFloat(totalAmount) || 0;
  const [showModal, setShowModal] = useState(false);
  const [draftSplits, setDraftSplits] = useState(splitPayments || { Cash: '', UPI: '', Card: '' });

  // Sync draft when splitPayments change from outside
  useEffect(() => {
    setDraftSplits(splitPayments || { Cash: '', UPI: '', Card: '' });
  }, [splitPayments]);

  // Compute stats on draft splits
  const { totalAllocated, diff, isExact, isUnder, isOver } = useMemo(() => {
    let sum = 0;
    splitMethods.forEach(method => {
      sum += parseFloat(draftSplits?.[method]) || 0;
    });
    const d = currentTotal - sum;
    const absDiff = Math.abs(d);
    return {
      totalAllocated: sum,
      diff: d,
      isExact: absDiff <= 0.05,
      isUnder: d > 0.05,
      isOver: d < -0.05
    };
  }, [draftSplits, splitMethods, currentTotal]);

  const handleDraftChange = (method, rawValue) => {
    setDraftSplits(prev => ({
      ...prev,
      [method]: rawValue
    }));
  };

  const handleFillRemaining = (method) => {
    let sumOther = 0;
    splitMethods.forEach(m => {
      if (m !== method) {
        sumOther += parseFloat(draftSplits?.[m]) || 0;
      }
    });
    const rem = Math.max(0, currentTotal - sumOther);
    setDraftSplits(prev => ({
      ...prev,
      [method]: rem > 0 ? rem.toFixed(2).replace(/\.00$/, '') : '0'
    }));
  };

  const handleSelectMode = (mode) => {
    if (mode === 'Split') {
      // Open modal to configure split
      setDraftSplits(splitPayments || { Cash: '', UPI: '', Card: '' });
      setShowModal(true);
    } else {
      setPaymentMode(mode);
    }
  };

  const handleApplySplit = (e) => {
    if (e) e.preventDefault();

    // If currentTotal > 0, check if draft equals total
    if (currentTotal > 0) {
      const validation = validateSplitPayment('Split', draftSplits, currentTotal);
      if (!validation.valid) {
        toast.error(validation.error);
        return;
      }
    } else {
      // If total was 0 (like in order creation with blank advance)
      if (totalAllocated <= 0) {
        toast.error("Please enter at least one payment amount");
        return;
      }
    }

    if (setSplitPayments) {
      setSplitPayments(draftSplits);
    }
    setPaymentMode('Split');

    if (onSplitTotalChange) {
      onSplitTotalChange(totalAllocated, draftSplits);
    }

    toast.success("Split payment breakdown applied!");
    setShowModal(false);
  };

  const handleCloseModal = () => {
    // If paymentMode was not Split yet, don't change
    setShowModal(false);
  };

  // Format short breakdown summary for the pill chip
  const breakdownSummary = useMemo(() => {
    const parts = [];
    splitMethods.forEach(m => {
      const v = parseFloat(splitPayments?.[m]) || 0;
      if (v > 0) parts.push(`${m}: ₹${v.toFixed(0)}`);
    });
    return parts.length > 0 ? parts.join(' + ') : 'Configure split';
  }, [splitPayments, splitMethods]);

  return (
    <div className={`split-pay-container ${compact ? 'compact' : ''}`}>
      {label && <label className="split-pay-label">{label}</label>}

      {/* Mode selection buttons */}
      <div className="split-pay-modes-grid">
        {availableModes.map(mode => {
          const isActive = paymentMode === mode;
          return (
            <button
              key={mode}
              type="button"
              className={`split-mode-pill ${isActive ? 'active' : ''} ${mode === 'Split' ? 'is-split' : ''}`}
              onClick={() => handleSelectMode(mode)}
            >
              {mode === 'Split' && <span className="split-icon-indicator">⚡</span>}
              {mode}
            </button>
          );
        })}
      </div>

      {/* When Split mode is active, display a clean status pill with an Edit button */}
      {paymentMode === 'Split' && (
        <div className="split-active-banner">
          <div className="split-active-left">
            <span className="split-active-badge">Split Active</span>
            <span className="split-active-text">{breakdownSummary}</span>
          </div>
          <button
            type="button"
            className="split-edit-trigger-btn"
            onClick={() => {
              setDraftSplits(splitPayments || { Cash: '', UPI: '', Card: '' });
              setShowModal(true);
            }}
          >
            <Edit2 size={12} /> Edit
          </button>
        </div>
      )}

      {/* Modal Popup for Split Payment */}
      {showModal && (
        <div className="split-modal-overlay">
          <div className="split-modal-dialog">
            <div className="split-modal-header">
              <div className="split-modal-title-wrap">
                <div className="split-modal-icon">
                  <Layers size={20} />
                </div>
                <div>
                  <h3 className="split-modal-title">Split Payment</h3>
                  <p className="split-modal-subtitle">Specify how much was received in each method</p>
                </div>
              </div>
              <button
                type="button"
                className="split-modal-close-btn"
                onClick={handleCloseModal}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleApplySplit} className="split-modal-body">
              {/* Financial Target Box */}
              <div className="split-modal-overview">
                <div className="split-overview-card target">
                  <span className="split-card-label">Required Total</span>
                  <span className="split-card-val">₹{currentTotal.toFixed(2)}</span>
                </div>
                <div className="split-overview-card allocated">
                  <span className="split-card-label">Total Allocated</span>
                  <span className="split-card-val">₹{totalAllocated.toFixed(2)}</span>
                </div>
                <div className="split-overview-card balance">
                  <span className="split-card-label">
                    {isOver ? 'Exceeding By' : 'Remaining'}
                  </span>
                  <span className={`split-card-val ${isExact ? 'exact' : isOver ? 'over' : 'under'}`}>
                    ₹{Math.abs(diff).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Status Badge */}
              <div className="split-modal-status-badge-wrap">
                {currentTotal > 0 && isExact && (
                  <div className="split-modal-pill exact">
                    <CheckCircle2 size={14} /> Total Matched Perfectly (₹{currentTotal.toFixed(2)})
                  </div>
                )}
                {currentTotal > 0 && isUnder && (
                  <div className="split-modal-pill under">
                    <AlertTriangle size={14} /> ₹{diff.toFixed(2)} remaining to allocate
                  </div>
                )}
                {currentTotal > 0 && isOver && (
                  <div className="split-modal-pill over">
                    <AlertTriangle size={14} /> Exceeds total by ₹{Math.abs(diff).toFixed(2)}
                  </div>
                )}
              </div>

              {/* Input Fields for Each Method */}
              <div className="split-modal-inputs">
                {splitMethods.map(method => {
                  const val = draftSplits?.[method] ?? '';
                  return (
                    <div key={method} className="split-modal-row">
                      <div className="split-modal-method-label">
                        <span className="split-method-bullet"></span>
                        <span>{method} Amount</span>
                      </div>
                      <div className="split-modal-input-group">
                        <span className="split-modal-curr">₹</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          placeholder="0.00"
                          className="split-modal-input"
                          value={val}
                          onChange={(e) => handleDraftChange(method, e.target.value)}
                          autoFocus={method === 'Cash' || method === splitMethods[0]}
                        />
                        {currentTotal > 0 && (
                          <button
                            type="button"
                            className="split-modal-fill-btn"
                            title="Fill remaining unallocated balance to this method"
                            onClick={() => handleFillRemaining(method)}
                          >
                            Fill Remainder
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Modal Actions */}
              <div className="split-modal-footer">
                <button
                  type="button"
                  className="split-modal-btn cancel"
                  onClick={handleCloseModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="split-modal-btn confirm"
                >
                  Confirm & Apply Split
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SplitPaymentSelector;
