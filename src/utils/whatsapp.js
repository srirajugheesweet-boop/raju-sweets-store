import toast from 'react-hot-toast';

/**
 * Sends a WhatsApp notification to the customer when the order status is "Ready for Delivery"
 * @param {Object} order - The order document from Firestore
 */
export const triggerWhatsAppOrderReady = async (order) => {
  try {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    
    const to = order.customerPhone || '';
    const customerName = order.customerName || 'Customer';
    const boxes = order.boxes?.length || 1;
    const totalAmt = Number(order.totalAmount || 0);
    const recAmt = Number(order.receivedAmount || 0);
    const balance = Math.max(0, totalAmt - recAmt);
    const pendingAmount = `Rs.${balance.toFixed(2)}`;
    
    let paymentStatus = 'Pending';
    if (order.paymentStatus) {
      const ps = order.paymentStatus.toLowerCase();
      if (ps === 'done' || ps === 'paid') {
        paymentStatus = 'Paid';
      } else if (ps === 'partial' || ps === 'partially paid') {
        paymentStatus = 'Partially Paid';
      }
    } else {
      if (recAmt > 0) {
        paymentStatus = recAmt >= totalAmt ? 'Paid' : 'Partially Paid';
      }
    }

    const payload = {
      to,
      customerName,
      boxes,
      pendingAmount,
      paymentStatus
    };

    console.log("Sending WhatsApp template notification:", payload);

    const response = await fetch(`${apiUrl}/whatsapp/send-order-ready`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'API request failed');
    }
    
    toast.success(`WhatsApp notification sent to ${customerName}!`);
    return true;
  } catch (err) {
    console.error("WhatsApp trigger error:", err);
    toast.error(`WhatsApp notification failed: ${err.message}`);
    return false;
  }
};
