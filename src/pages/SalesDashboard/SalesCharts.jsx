import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  BarChart3, 
  PieChart as PieChartIcon, 
  Layers, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  Percent, 
  Smartphone, 
  CreditCard, 
  ShoppingBag, 
  Receipt,
  Store,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { extractRecordDate } from './SalesDashboard';

/**
 * Helper to build smooth cubic Bézier SVG path from array of [x, y] coordinates
 */
const getSvgPath = (points, closeBottom = false, height = 220) => {
  if (points.length === 0) return '';
  if (points.length === 1) {
    return closeBottom 
      ? `M ${points[0][0]} ${points[0][1]} L ${points[0][0]} ${height} Z`
      : `M ${points[0][0]} ${points[0][1]} L ${points[0][0] + 1} ${points[0][1]}`;
  }

  let d = `M ${points[0][0]} ${points[0][1]}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : p2;

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }

  if (closeBottom) {
    d += ` L ${points[points.length - 1][0]} ${height} L ${points[0][0]} ${height} Z`;
  }

  return d;
};

/**
 * Aggregates time-series buckets from orders and walk-in bills based on active date filter
 */
export const buildTimeSeriesBuckets = (orders, bills, dateFilter, dateRange) => {
  let mode = 'daily';
  if (dateFilter === 'today' || dateFilter === 'yesterday') {
    mode = 'hourly';
  } else if (dateFilter === 'this_year' || dateFilter === 'last_year') {
    mode = 'monthly';
  } else if (dateFilter === 'custom') {
    const diffDays = Math.ceil((dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24));
    if (diffDays <= 2) mode = 'hourly';
    else if (diffDays > 60) mode = 'monthly';
    else mode = 'daily';
  }

  const buckets = [];

  if (mode === 'hourly') {
    // 8 AM to 10 PM (in 2-hour increments)
    const hours = [8, 10, 12, 14, 16, 18, 20, 22];
    hours.forEach(h => {
      const label = h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
      buckets.push({
        id: `h-${h}`,
        hour: h,
        label,
        ordersSales: 0,
        walkInSales: 0,
        totalSales: 0,
        ordersCount: 0,
        walkInCount: 0,
        totalCount: 0
      });
    });

    // Populate hourly
    orders.forEach(o => {
      const d = extractRecordDate(o);
      if (!d) return;
      const h = d.getHours();
      // Find closest bucket
      let target = buckets[0];
      for (const b of buckets) {
        if (Math.abs(h - b.hour) < Math.abs(h - target.hour)) {
          target = b;
        }
      }
      const val = Number(o.totalAmount || 0);
      target.ordersSales += val;
      target.totalSales += val;
      target.ordersCount += 1;
      target.totalCount += 1;
    });

    bills.forEach(b => {
      if ((b.status || 'settled') !== 'settled') return;
      const d = extractRecordDate(b);
      if (!d) return;
      const h = d.getHours();
      let target = buckets[0];
      for (const bck of buckets) {
        if (Math.abs(h - bck.hour) < Math.abs(h - target.hour)) {
          target = bck;
        }
      }
      const val = Number(b.totalAmount || 0);
      target.walkInSales += val;
      target.totalSales += val;
      target.walkInCount += 1;
      target.totalCount += 1;
    });

  } else if (mode === 'daily') {
    if (dateFilter === 'this_week' || dateFilter === 'last_week') {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      days.forEach((dayName, idx) => {
        buckets.push({
          id: `day-${idx}`,
          dayIdx: idx,
          label: dayName,
          ordersSales: 0,
          walkInSales: 0,
          totalSales: 0,
          ordersCount: 0,
          walkInCount: 0,
          totalCount: 0
        });
      });

      orders.forEach(o => {
        const d = extractRecordDate(o);
        if (!d) return;
        const dayIdx = (d.getDay() + 6) % 7;
        const target = buckets[dayIdx];
        if (target) {
          const val = Number(o.totalAmount || 0);
          target.ordersSales += val;
          target.totalSales += val;
          target.ordersCount += 1;
          target.totalCount += 1;
        }
      });

      bills.forEach(b => {
        if ((b.status || 'settled') !== 'settled') return;
        const d = extractRecordDate(b);
        if (!d) return;
        const dayIdx = (d.getDay() + 6) % 7;
        const target = buckets[dayIdx];
        if (target) {
          const val = Number(b.totalAmount || 0);
          target.walkInSales += val;
          target.totalSales += val;
          target.walkInCount += 1;
          target.totalCount += 1;
        }
      });

    } else {
      // Month days (1 to 31 or custom date span)
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      const temp = new Date(startDate);

      while (temp <= endDate) {
        const dateKey = temp.toISOString().split('T')[0];
        const dayNum = temp.getDate();
        buckets.push({
          id: dateKey,
          dateKey,
          label: dayNum % 3 === 1 || dayNum === 1 ? `${dayNum} ${temp.toLocaleDateString('en-IN', { month: 'short' })}` : `${dayNum}`,
          dayNum,
          ordersSales: 0,
          walkInSales: 0,
          totalSales: 0,
          ordersCount: 0,
          walkInCount: 0,
          totalCount: 0
        });
        temp.setDate(temp.getDate() + 1);
      }

      orders.forEach(o => {
        const d = extractRecordDate(o);
        if (!d) return;
        const key = d.toISOString().split('T')[0];
        const target = buckets.find(b => b.dateKey === key);
        if (target) {
          const val = Number(o.totalAmount || 0);
          target.ordersSales += val;
          target.totalSales += val;
          target.ordersCount += 1;
          target.totalCount += 1;
        }
      });

      bills.forEach(b => {
        if ((b.status || 'settled') !== 'settled') return;
        const d = extractRecordDate(b);
        if (!d) return;
        const key = d.toISOString().split('T')[0];
        const target = buckets.find(b => b.dateKey === key);
        if (target) {
          const val = Number(b.totalAmount || 0);
          target.walkInSales += val;
          target.totalSales += val;
          target.walkInCount += 1;
          target.totalCount += 1;
        }
      });
    }

  } else if (mode === 'monthly') {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    months.forEach((m, idx) => {
      buckets.push({
        id: `m-${idx}`,
        monthIdx: idx,
        label: m,
        ordersSales: 0,
        walkInSales: 0,
        totalSales: 0,
        ordersCount: 0,
        walkInCount: 0,
        totalCount: 0
      });
    });

    orders.forEach(o => {
      const d = extractRecordDate(o);
      if (!d) return;
      const mIdx = d.getMonth();
      const target = buckets[mIdx];
      if (target) {
        const val = Number(o.totalAmount || 0);
        target.ordersSales += val;
        target.totalSales += val;
        target.ordersCount += 1;
        target.totalCount += 1;
      }
    });

    bills.forEach(b => {
      if ((b.status || 'settled') !== 'settled') return;
      const d = extractRecordDate(b);
      if (!d) return;
      const mIdx = d.getMonth();
      const target = buckets[mIdx];
      if (target) {
        const val = Number(b.totalAmount || 0);
        target.walkInSales += val;
        target.totalSales += val;
        target.walkInCount += 1;
        target.totalCount += 1;
      }
    });
  }

  return { mode, buckets };
};

/**
 * Main Sales Charts Suite Component
 */
const SalesCharts = ({ orders, bills, analytics, dateFilter, dateRange }) => {
  // Chart Display Toggles
  const [chartMode, setChartMode] = useState('area'); // 'area' | 'line' | 'bar'
  const [metricType, setMetricType] = useState('revenue'); // 'revenue' | 'volume'
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [hoveredSlice, setHoveredSlice] = useState(null);

  // Compute Time Series Data
  const { mode: timeMode, buckets } = useMemo(() => {
    return buildTimeSeriesBuckets(orders, bills, dateFilter, dateRange);
  }, [orders, bills, dateFilter, dateRange]);

  // Scaled Data for SVG Area/Line Chart
  const svgWidth = 720;
  const svgHeight = 220;
  const paddingX = 40;
  const paddingY = 30;

  const chartData = useMemo(() => {
    if (buckets.length === 0) return { totalPoints: [], walkInPoints: [], orderPoints: [], maxVal: 1 };

    const maxVal = Math.max(
      ...buckets.map(b => (metricType === 'revenue' ? b.totalSales : b.totalCount)),
      100
    );

    const stepX = (svgWidth - paddingX * 2) / Math.max(buckets.length - 1, 1);

    const totalPoints = [];
    const walkInPoints = [];
    const orderPoints = [];

    buckets.forEach((b, i) => {
      const x = paddingX + i * stepX;
      const totVal = metricType === 'revenue' ? b.totalSales : b.totalCount;
      const walkVal = metricType === 'revenue' ? b.walkInSales : b.walkInCount;
      const ordVal = metricType === 'revenue' ? b.ordersSales : b.ordersCount;

      const yTot = svgHeight - paddingY - (totVal / maxVal) * (svgHeight - paddingY * 2);
      const yWalk = svgHeight - paddingY - (walkVal / maxVal) * (svgHeight - paddingY * 2);
      const yOrd = svgHeight - paddingY - (ordVal / maxVal) * (svgHeight - paddingY * 2);

      totalPoints.push([x, yTot, b]);
      walkInPoints.push([x, yWalk, b]);
      orderPoints.push([x, yOrd, b]);
    });

    return { totalPoints, walkInPoints, orderPoints, maxVal, stepX };
  }, [buckets, metricType]);

  // Donut Pie Slices for Payment Methods
  const paymentSlices = useMemo(() => {
    const total = analytics.totalReceived || 1;
    const items = [
      { id: 'upi', label: 'UPI / Digital', amount: analytics.upiTotal, color: '#8b5cf6', percent: analytics.upiPercent },
      { id: 'cash', label: 'Cash Currency', amount: analytics.cashTotal, color: '#10b981', percent: analytics.cashPercent },
      { id: 'card', label: 'Credit/Debit Card', amount: analytics.cardTotal, color: '#3b82f6', percent: analytics.cardPercent },
    ];
    if (analytics.otherTotal > 0) {
      items.push({
        id: 'other',
        label: 'Other Methods',
        amount: analytics.otherTotal,
        color: '#f59e0b',
        percent: (analytics.otherTotal / total) * 100
      });
    }

    let cumulativeAngle = 0;
    return items.map(it => {
      const sliceAngle = (it.amount / total) * 360;
      const startAngle = cumulativeAngle;
      cumulativeAngle += sliceAngle;
      return {
        ...it,
        startAngle,
        endAngle: cumulativeAngle,
        sliceAngle
      };
    });
  }, [analytics]);

  // Donut Pie Slices for Channel Share (Walk-in vs Orders)
  const channelSlices = useMemo(() => {
    const total = analytics.totalSales || 1;
    const walkInPercent = (analytics.walkInGross / total) * 100;
    const orderPercent = (analytics.orderSalesGross / total) * 100;

    return [
      { id: 'walkin', label: 'Walk-In POS', amount: analytics.walkInGross, color: '#f59e0b', percent: walkInPercent },
      { id: 'orders', label: 'Advance Orders', amount: analytics.orderSalesGross, color: '#8b5cf6', percent: orderPercent }
    ];
  }, [analytics]);

  return (
    <div className="sd-charts-container">
      {/* ==================================================== */}
      {/* ROW 1: PRIMARY SALES TREND CHART (AREA / LINE / BAR) */}
      {/* ==================================================== */}
      <div className="sd-card sd-main-trend-card">
        <div className="sd-card-header" style={{ flexWrap: 'wrap', gap: '14px' }}>
          <div className="sd-card-header-left">
            <div className="sd-icon-badge green">
              <TrendingUp size={20} />
            </div>
            <div>
              <h3 className="sd-card-title">
                Sales Trend & Velocity ({timeMode.toUpperCase()} BREAKDOWN)
              </h3>
              <span className="sd-card-desc">
                Interactive timeline comparing Walk-In POS vs Advance Orders across {dateRange.label}
              </span>
            </div>
          </div>

          {/* Controls: Area vs Line vs Bar, Revenue vs Volume */}
          <div className="sd-chart-controls">
            <div className="sd-metric-toggle">
              <button 
                className={`sd-metric-btn ${metricType === 'revenue' ? 'active' : ''}`}
                onClick={() => setMetricType('revenue')}
              >
                ₹ Revenue
              </button>
              <button 
                className={`sd-metric-btn ${metricType === 'volume' ? 'active' : ''}`}
                onClick={() => setMetricType('volume')}
              >
                Count / Volume
              </button>
            </div>

            <div className="sd-type-toggle">
              <button 
                className={`sd-type-btn ${chartMode === 'area' ? 'active' : ''}`}
                onClick={() => setChartMode('area')}
                title="Area Graph"
              >
                Area
              </button>
              <button 
                className={`sd-type-btn ${chartMode === 'line' ? 'active' : ''}`}
                onClick={() => setChartMode('line')}
                title="Line Graph"
              >
                Line
              </button>
              <button 
                className={`sd-type-btn ${chartMode === 'bar' ? 'active' : ''}`}
                onClick={() => setChartMode('bar')}
                title="Bar Graph"
              >
                Bar
              </button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="sd-chart-legend-bar">
          <div className="legend-item">
            <span className="legend-line total"></span>
            <span>Total Sales ({metricType === 'revenue' ? `₹${analytics.totalSales.toLocaleString('en-IN')}` : `${analytics.totalTransactions} tx`})</span>
          </div>
          <div className="legend-item">
            <span className="legend-line walkin"></span>
            <span>Walk-In POS ({metricType === 'revenue' ? `₹${analytics.walkInGross.toLocaleString('en-IN')}` : `${analytics.walkInCount} tx`})</span>
          </div>
          <div className="legend-item">
            <span className="legend-line orders"></span>
            <span>Advance Orders ({metricType === 'revenue' ? `₹${analytics.orderSalesGross.toLocaleString('en-IN')}` : `${analytics.orderCount} tx`})</span>
          </div>
        </div>

        {/* Chart View (SVG Area / Line / Grouped Bars) */}
        <div className="sd-svg-chart-wrapper">
          {chartMode === 'bar' ? (
            /* ================= BAR GRAPH MODE ================= */
            <div className="sd-bar-chart-container">
              {buckets.map((b, i) => {
                const maxVal = chartData.maxVal || 1;
                const walkVal = metricType === 'revenue' ? b.walkInSales : b.walkInCount;
                const ordVal = metricType === 'revenue' ? b.ordersSales : b.ordersCount;
                const walkH = Math.max(4, (walkVal / maxVal) * 160);
                const ordH = Math.max(4, (ordVal / maxVal) * 160);

                return (
                  <div 
                    key={b.id || i} 
                    className="sd-bar-group"
                    onMouseEnter={() => setHoveredPoint(b)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  >
                    <div className="sd-bars-holder">
                      {/* Walk-in Bar */}
                      <div 
                        className="sd-bar-col walkin" 
                        style={{ height: `${walkH}px` }}
                        title={`Walk-in: ₹${b.walkInSales.toFixed(0)}`}
                      ></div>
                      {/* Order Bar */}
                      <div 
                        className="sd-bar-col orders" 
                        style={{ height: `${ordH}px` }}
                        title={`Orders: ₹${b.ordersSales.toFixed(0)}`}
                      ></div>
                    </div>
                    <span className="sd-bar-label">{b.label}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ================= AREA & LINE GRAPH MODE ================= */
            <svg 
              viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
              className="sd-svg-chart"
              preserveAspectRatio="none"
            >
              <defs>
                {/* Total Area Gradient */}
                <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
                </linearGradient>

                {/* Walk-in Area Gradient */}
                <linearGradient id="walkInGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                </linearGradient>

                {/* Orders Area Gradient */}
                <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              <line x1={paddingX} y1={paddingY} x2={svgWidth - paddingX} y2={paddingY} stroke="#f3f4f6" strokeDasharray="3 3" />
              <line x1={paddingX} y1={svgHeight / 2} x2={svgWidth - paddingX} y2={svgHeight / 2} stroke="#f3f4f6" strokeDasharray="3 3" />
              <line x1={paddingX} y1={svgHeight - paddingY} x2={svgWidth - paddingX} y2={svgHeight - paddingY} stroke="#e5e7eb" strokeWidth="1.5" />

              {/* Area Fills if Area mode */}
              {chartMode === 'area' && (
                <>
                  <path 
                    d={getSvgPath(chartData.totalPoints, true, svgHeight - paddingY)} 
                    fill="url(#totalGradient)" 
                  />
                  <path 
                    d={getSvgPath(chartData.walkInPoints, true, svgHeight - paddingY)} 
                    fill="url(#walkInGradient)" 
                  />
                  <path 
                    d={getSvgPath(chartData.orderPoints, true, svgHeight - paddingY)} 
                    fill="url(#ordersGradient)" 
                  />
                </>
              )}

              {/* Smooth Spline Lines */}
              {/* 1. Walk-In Line (Amber) */}
              <path 
                d={getSvgPath(chartData.walkInPoints, false)} 
                fill="none" 
                stroke="#f59e0b" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
              />

              {/* 2. Order Line (Purple) */}
              <path 
                d={getSvgPath(chartData.orderPoints, false)} 
                fill="none" 
                stroke="#8b5cf6" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
              />

              {/* 3. Total Line (Forest Emerald) */}
              <path 
                d={getSvgPath(chartData.totalPoints, false)} 
                fill="none" 
                stroke="#059669" 
                strokeWidth="3.5" 
                strokeLinecap="round" 
              />

              {/* Interactive Data Dots */}
              {chartData.totalPoints.map(([x, y, b], idx) => (
                <g key={idx}>
                  <circle 
                    cx={x} 
                    cy={y} 
                    r="4.5" 
                    fill="#ffffff" 
                    stroke="#059669" 
                    strokeWidth="2.5"
                    className="sd-chart-dot"
                    onMouseEnter={() => setHoveredPoint(b)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                </g>
              ))}
            </svg>
          )}

          {/* X Axis Labels for SVG */}
          {chartMode !== 'bar' && (
            <div className="sd-svg-x-axis">
              {buckets.map((b, idx) => (
                <span key={idx} style={{ flex: 1, textAlign: 'center' }}>
                  {b.label}
                </span>
              ))}
            </div>
          )}

          {/* Hover Tooltip Popup */}
          {hoveredPoint && (
            <div className="sd-chart-hover-card">
              <div className="hover-head">
                <b>{hoveredPoint.label}</b>
                <span className="badge">{hoveredPoint.totalCount} transactions</span>
              </div>
              <div className="hover-row">
                <span className="dot" style={{ background: '#059669' }}></span>
                <span>Total:</span>
                <b>₹{hoveredPoint.totalSales.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
              </div>
              <div className="hover-row">
                <span className="dot" style={{ background: '#f59e0b' }}></span>
                <span>Walk-in:</span>
                <b>₹{hoveredPoint.walkInSales.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
              </div>
              <div className="hover-row">
                <span className="dot" style={{ background: '#8b5cf6' }}></span>
                <span>Orders:</span>
                <b>₹{hoveredPoint.ordersSales.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================================================== */}
      {/* ROW 2: PIE CHARTS & COLLECTION HEALTH GAUGE */}
      {/* ==================================================== */}
      <div className="sd-charts-row-dual">
        {/* PIE CHART 1: Payment Method Distribution Donut */}
        <div className="sd-card sd-pie-card">
          <div className="sd-card-header">
            <div className="sd-card-header-left">
              <div className="sd-icon-badge blue">
                <PieChartIcon size={18} />
              </div>
              <div>
                <h3 className="sd-card-title">Payment Method Share (Pie / Donut)</h3>
                <span className="sd-card-desc">UPI, Cash, Cards collected funds breakdown</span>
              </div>
            </div>
          </div>

          <div className="sd-donut-content-layout">
            {/* SVG Donut Chart */}
            <div className="sd-donut-svg-box">
              <svg viewBox="0 0 160 160" className="sd-donut-svg">
                {/* Background Ring */}
                <circle 
                  cx="80" 
                  cy="80" 
                  r="56" 
                  fill="transparent" 
                  stroke="#f3f4f6" 
                  strokeWidth="24" 
                />

                {/* Slices using SVG strokeDasharray */}
                {paymentSlices.map((slice, i) => {
                  const circumference = 2 * Math.PI * 56;
                  const strokeLength = (slice.percent / 100) * circumference;
                  const strokeOffset = circumference - ((slice.startAngle / 360) * circumference);

                  return (
                    <circle
                      key={slice.id || i}
                      cx="80"
                      cy="80"
                      r="56"
                      fill="transparent"
                      stroke={slice.color}
                      strokeWidth={hoveredSlice === slice.id ? "28" : "24"}
                      strokeDasharray={`${strokeLength} ${circumference}`}
                      strokeDashoffset={strokeOffset}
                      className="sd-donut-slice"
                      onMouseEnter={() => setHoveredSlice(slice.id)}
                      onMouseLeave={() => setHoveredSlice(null)}
                      transform="rotate(-90 80 80)"
                      style={{ transition: 'all 0.3s ease' }}
                    />
                  );
                })}
              </svg>

              {/* Center Metrics in Donut */}
              <div className="sd-donut-center-info">
                <span className="center-lbl">Collected</span>
                <span className="center-val">
                  ₹{(analytics.totalReceived >= 100000 
                    ? `${(analytics.totalReceived / 100000).toFixed(1)}L` 
                    : (analytics.totalReceived / 1000).toFixed(0) + 'k')}
                </span>
                <span className="center-pct">100%</span>
              </div>
            </div>

            {/* Custom Interactive Legend */}
            <div className="sd-donut-legend">
              {paymentSlices.map((slice) => (
                <div 
                  key={slice.id} 
                  className={`sd-donut-legend-item ${hoveredSlice === slice.id ? 'active' : ''}`}
                  onMouseEnter={() => setHoveredSlice(slice.id)}
                  onMouseLeave={() => setHoveredSlice(null)}
                >
                  <div className="legend-left">
                    <span className="color-swatch" style={{ background: slice.color }}></span>
                    <span className="slice-label">{slice.label}</span>
                  </div>
                  <div className="legend-right">
                    <span className="slice-amt">₹{slice.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    <span className="slice-badge" style={{ color: slice.color }}>
                      {slice.percent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PIE CHART 2: Channel Revenue Share (Walk-in vs Orders) */}
        <div className="sd-card sd-pie-card">
          <div className="sd-card-header">
            <div className="sd-card-header-left">
              <div className="sd-icon-badge amber">
                <Layers size={18} />
              </div>
              <div>
                <h3 className="sd-card-title">Channel Share: Walk-in vs Orders</h3>
                <span className="sd-card-desc">Comparative gross revenue split across sales channels</span>
              </div>
            </div>
          </div>

          <div className="sd-donut-content-layout">
            <div className="sd-donut-svg-box">
              <svg viewBox="0 0 160 160" className="sd-donut-svg">
                <circle cx="80" cy="80" r="56" fill="transparent" stroke="#f3f4f6" strokeWidth="24" />
                {channelSlices.map((slice, i) => {
                  const circumference = 2 * Math.PI * 56;
                  const strokeLength = (slice.percent / 100) * circumference;
                  const startAngle = i === 0 ? 0 : (channelSlices[0].percent / 100) * 360;
                  const strokeOffset = circumference - ((startAngle / 360) * circumference);

                  return (
                    <circle
                      key={slice.id}
                      cx="80"
                      cy="80"
                      r="56"
                      fill="transparent"
                      stroke={slice.color}
                      strokeWidth="24"
                      strokeDasharray={`${strokeLength} ${circumference}`}
                      strokeDashoffset={strokeOffset}
                      className="sd-donut-slice"
                      transform="rotate(-90 80 80)"
                    />
                  );
                })}
              </svg>

              <div className="sd-donut-center-info">
                <span className="center-lbl">Gross Sales</span>
                <span className="center-val">
                  ₹{(analytics.totalSales >= 100000 
                    ? `${(analytics.totalSales / 100000).toFixed(1)}L` 
                    : (analytics.totalSales / 1000).toFixed(0) + 'k')}
                </span>
                <span className="center-pct">{analytics.totalTransactions} Tx</span>
              </div>
            </div>

            <div className="sd-donut-legend">
              {channelSlices.map(slice => (
                <div key={slice.id} className="sd-donut-legend-item">
                  <div className="legend-left">
                    <span className="color-swatch" style={{ background: slice.color }}></span>
                    <span className="slice-label">{slice.label}</span>
                  </div>
                  <div className="legend-right">
                    <span className="slice-amt">₹{slice.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    <span className="slice-badge" style={{ color: slice.color }}>
                      {slice.percent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}

              <div className="sd-channel-ratio-bar">
                <div 
                  className="ratio-fill walkin" 
                  style={{ width: `${(analytics.walkInGross / (analytics.totalSales || 1)) * 100}%` }}
                ></div>
                <div 
                  className="ratio-fill orders" 
                  style={{ width: `${(analytics.orderSalesGross / (analytics.totalSales || 1)) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* ROW 3: PROGRESS METERS & COMPLIANCE GAUGES */}
      {/* ==================================================== */}
      <div className="sd-charts-row-triple">
        {/* Progress Gauge 1: Collection vs Credit Recovery */}
        <div className="sd-card sd-gauge-card">
          <div className="sd-card-header">
            <h4 className="sd-card-title-sm">
              <CheckCircle2 size={16} color="#059669" /> Collection Realization Meter
            </h4>
          </div>

          <div className="sd-semi-gauge-box">
            <svg viewBox="0 0 160 90" className="sd-semi-gauge">
              {/* Semi-circle track */}
              <path 
                d="M 20 80 A 60 60 0 0 1 140 80" 
                fill="none" 
                stroke="#e5e7eb" 
                strokeWidth="16" 
                strokeLinecap="round" 
              />
              {/* Semi-circle filled progress */}
              <path 
                d="M 20 80 A 60 60 0 0 1 140 80" 
                fill="none" 
                stroke={analytics.collectionRate >= 80 ? "#10b981" : analytics.collectionRate >= 50 ? "#f59e0b" : "#ef4444"} 
                strokeWidth="16" 
                strokeLinecap="round" 
                strokeDasharray={`${(analytics.collectionRate / 100) * 188.5} 188.5`}
                style={{ transition: 'stroke-dasharray 0.8s ease' }}
              />
            </svg>
            <div className="sd-gauge-center-val">
              <b>{analytics.collectionRate.toFixed(1)}%</b>
              <span>Settled in Hand</span>
            </div>
          </div>

          <div className="sd-progress-legend-row">
            <div className="sub-stat">
              <span className="dot" style={{ background: '#10b981' }}></span>
              <span>Received: ₹{analytics.totalReceived.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="sub-stat">
              <span className="dot" style={{ background: '#ef4444' }}></span>
              <span>Credit Due: ₹{analytics.totalCredit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        </div>

        {/* Progress Gauge 2: Multi-segmented Payment Gateway Split Bar */}
        <div className="sd-card sd-gauge-card">
          <div className="sd-card-header">
            <h4 className="sd-card-title-sm">
              <DollarSign size={16} color="#2563eb" /> Multi-Gateway Share Progress
            </h4>
          </div>

          <div className="sd-segmented-progress-wrap">
            <div className="sd-segmented-bar">
              <div 
                className="seg upi" 
                style={{ width: `${analytics.upiPercent}%` }} 
                title={`UPI: ${analytics.upiPercent.toFixed(1)}%`}
              ></div>
              <div 
                className="seg cash" 
                style={{ width: `${analytics.cashPercent}%` }} 
                title={`Cash: ${analytics.cashPercent.toFixed(1)}%`}
              ></div>
              <div 
                className="seg card" 
                style={{ width: `${analytics.cardPercent}%` }} 
                title={`Card: ${analytics.cardPercent.toFixed(1)}%`}
              ></div>
            </div>

            <div className="sd-seg-labels-grid">
              <div className="seg-lbl">
                <span className="swatch upi"></span>
                <span>UPI: <b>{analytics.upiPercent.toFixed(0)}%</b></span>
              </div>
              <div className="seg-lbl">
                <span className="swatch cash"></span>
                <span>Cash: <b>{analytics.cashPercent.toFixed(0)}%</b></span>
              </div>
              <div className="seg-lbl">
                <span className="swatch card"></span>
                <span>Cards: <b>{analytics.cardPercent.toFixed(0)}%</b></span>
              </div>
            </div>
          </div>

          <div className="sd-progress-hint">
            Cashless Digital Ratio: <b>{(analytics.upiPercent + analytics.cardPercent).toFixed(1)}%</b> of revenue
          </div>
        </div>

        {/* Progress Gauge 3: GST Composition Breakdown Bar */}
        <div className="sd-card sd-gauge-card">
          <div className="sd-card-header">
            <h4 className="sd-card-title-sm">
              <Percent size={16} color="#0284c7" /> GST Tax Structure Composition
            </h4>
          </div>

          <div className="sd-gst-composition-wrap">
            <div className="sd-gst-progress-bar">
              <div className="gst-seg base" style={{ width: '95.24%' }} title="Net Base Turnover: 95.24%">
                <span className="gst-bar-text">Net Sales: 95.2%</span>
              </div>
              <div className="gst-seg cgst" style={{ width: '2.38%' }} title="CGST: 2.38%"></div>
              <div className="gst-seg sgst" style={{ width: '2.38%' }} title="SGST: 2.38%"></div>
            </div>

            <div className="sd-gst-legend-grid">
              <div className="gst-leg-item">
                <span className="lbl">Base Taxable Turnover:</span>
                <b>₹{analytics.totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
              </div>
              <div className="gst-leg-item highlight">
                <span className="lbl">CGST (2.5%) + SGST (2.5%):</span>
                <b>₹{analytics.totalGST.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
              </div>
            </div>
          </div>

          <div className="sd-progress-hint">
            Standard Sweet & Savoury statutory rate: <b>5% GST</b>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesCharts;
