var express = require('express');
var router = express.Router();

/*
 * Order Fulfillment Dashboard — data layer.
 *
 * This module generates a realistic day of commercial orders (a few hundred)
 * and exposes them as JSON so the dashboard can show, at end of day, exactly
 * which orders are still open (not yet shipped) and *why* they are stuck.
 *
 * Pending reasons we model:
 *   NEW               - just received (a few hours ago), normal queue
 *   OUT_OF_STOCK      - no available stock, held back from shipping
 *   AT_WAREHOUSE      - already dispatched to the warehouse, awaiting pick/pack/ship
 *   WAREHOUSE_NEGLECT - sitting at the warehouse far too long, nobody actioned it
 *   OTHER             - address / payment / customs holds, etc.
 *
 * Alert level is derived from how long an order has been open:
 *   normal  (< 6h)   ok
 *   watch   (6-24h)  keep an eye on it
 *   high    (> 24h)  high alert — escalate
 */

var HOUR = 60 * 60 * 1000;
var DAY = 24 * HOUR;

var CUSTOMERS = [
  'Acme Retail Group', 'Northwind Traders', 'Globex Distribution',
  'Initech Supplies', 'Umbrella Wholesale', 'Stark Industrial',
  'Wayne Commercial', 'Soylent Foods Co.', 'Hooli Logistics',
  'Vandelay Imports', 'Pied Piper Markets', 'Cyberdyne Systems',
  'Wonka Confections', 'Tyrell Goods', 'Gekko Mercantile'
];

var PRODUCTS = [
  { sku: 'WID-1001', name: 'Industrial Widget' },
  { sku: 'GZM-2200', name: 'Gizmo Pro' },
  { sku: 'CMP-3050', name: 'Composite Panel' },
  { sku: 'BRG-4710', name: 'Bearing Assembly' },
  { sku: 'PMP-5520', name: 'Hydraulic Pump' },
  { sku: 'CBL-6300', name: 'Cable Harness' },
  { sku: 'FST-7100', name: 'Fastener Kit' },
  { sku: 'SNS-8420', name: 'Sensor Module' },
  { sku: 'VLV-9010', name: 'Control Valve' },
  { sku: 'MTR-1200', name: 'Drive Motor' }
];

var CARRIERS = ['UPS Freight', 'FedEx Ground', 'DHL Express', 'XPO Logistics', 'Old Dominion'];
var WAREHOUSES = ['DC-East (NJ)', 'DC-West (CA)', 'DC-Central (TX)', 'DC-South (GA)'];
var OTHER_HOLDS = ['Address verification', 'Payment review', 'Customs paperwork', 'Credit hold'];

// Simple seeded PRNG so the day's data is stable across page refreshes.
var seed = 20260611;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function between(min, max) { return min + rand() * (max - min); }

function buildOrders(now) {
  var orders = [];
  var total = 280 + Math.floor(rand() * 60); // a few hundred orders today

  for (var i = 0; i < total; i++) {
    var id = 'SO-' + (104000 + i);
    var customer = pick(CUSTOMERS);
    var lineCount = 1 + Math.floor(rand() * 4);
    var lines = [];
    var value = 0;
    for (var l = 0; l < lineCount; l++) {
      var p = pick(PRODUCTS);
      var qty = 1 + Math.floor(rand() * 40);
      var price = Math.round(between(8, 240) * 100) / 100;
      value += qty * price;
      lines.push({ sku: p.sku, name: p.name, qty: qty, price: price });
    }

    // Orders arrive across the last ~30 hours (covers "uploaded a few hours ago"
    // through to ones that have been sitting since yesterday).
    var ageHours = between(0.2, 30);
    var createdAt = now - ageHours * HOUR;

    var roll = rand();
    var status, reason, dispatchedAt = null, warehouse = null, stockAvail, shippedAt = null, carrier = null, tracking = null;

    if (roll < 0.55) {
      // Fulfilled & shipped earlier today — the healthy majority.
      status = 'SHIPPED';
      reason = null;
      stockAvail = 'in_stock';
      warehouse = pick(WAREHOUSES);
      dispatchedAt = createdAt + between(0.5, 3) * HOUR;
      shippedAt = dispatchedAt + between(0.5, 4) * HOUR;
      carrier = pick(CARRIERS);
      tracking = '1Z' + Math.floor(between(100000000, 999999999));
    } else if (roll < 0.70) {
      // Brand new, still in the normal processing queue.
      status = 'PENDING';
      reason = 'NEW';
      stockAvail = rand() < 0.85 ? 'in_stock' : 'low';
      ageHours = between(0.2, 5);
      createdAt = now - ageHours * HOUR;
    } else if (roll < 0.82) {
      // No available stock — held back from shipping.
      status = 'PENDING';
      reason = 'OUT_OF_STOCK';
      stockAvail = 'out_of_stock';
    } else if (roll < 0.92) {
      // Already dispatched to the warehouse, awaiting pick/pack/ship.
      status = 'PENDING';
      reason = 'AT_WAREHOUSE';
      stockAvail = 'in_stock';
      warehouse = pick(WAREHOUSES);
      dispatchedAt = createdAt + between(0.5, 3) * HOUR;
    } else if (roll < 0.97) {
      // Dispatched to the warehouse but sitting there far too long — neglected.
      status = 'PENDING';
      reason = 'WAREHOUSE_NEGLECT';
      stockAvail = 'in_stock';
      warehouse = pick(WAREHOUSES);
      ageHours = between(20, 30);
      createdAt = now - ageHours * HOUR;
      dispatchedAt = createdAt + between(1, 4) * HOUR;
    } else {
      // Other holds.
      status = 'PENDING';
      reason = 'OTHER';
      stockAvail = rand() < 0.5 ? 'in_stock' : 'low';
    }

    var openHours = (now - createdAt) / HOUR;
    var alert = 'normal';
    if (status === 'PENDING') {
      if (reason === 'WAREHOUSE_NEGLECT' || openHours > 24) alert = 'high';
      else if (openHours > 6) alert = 'watch';
    }

    orders.push({
      id: id,
      customer: customer,
      lines: lines,
      units: lines.reduce(function (s, x) { return s + x.qty; }, 0),
      value: Math.round(value * 100) / 100,
      status: status,
      reason: reason,
      stock: stockAvail,
      warehouse: warehouse,
      carrier: carrier,
      tracking: tracking,
      createdAt: new Date(createdAt).toISOString(),
      dispatchedAt: dispatchedAt ? new Date(dispatchedAt).toISOString() : null,
      shippedAt: shippedAt ? new Date(shippedAt).toISOString() : null,
      openHours: Math.round(openHours * 10) / 10,
      alert: alert
    });
  }
  return orders;
}

// Build once at startup so the figures are consistent for the session.
var DATA = buildOrders(Date.now());

function summarize(orders) {
  var pending = orders.filter(function (o) { return o.status === 'PENDING'; });
  var byReason = {};
  ['NEW', 'OUT_OF_STOCK', 'AT_WAREHOUSE', 'WAREHOUSE_NEGLECT', 'OTHER'].forEach(function (r) {
    byReason[r] = pending.filter(function (o) { return o.reason === r; }).length;
  });

  var byCustomer = {};
  pending.forEach(function (o) {
    if (!byCustomer[o.customer]) {
      byCustomer[o.customer] = { customer: o.customer, open: 0, units: 0, value: 0, highAlert: 0, oldestHours: 0 };
    }
    var c = byCustomer[o.customer];
    c.open += 1;
    c.units += o.units;
    c.value += o.value;
    if (o.alert === 'high') c.highAlert += 1;
    if (o.openHours > c.oldestHours) c.oldestHours = o.openHours;
  });
  var customers = Object.keys(byCustomer).map(function (k) {
    var c = byCustomer[k];
    c.value = Math.round(c.value * 100) / 100;
    c.oldestHours = Math.round(c.oldestHours * 10) / 10;
    return c;
  }).sort(function (a, b) { return b.open - a.open; });

  // Aging buckets for pending orders.
  var aging = { '0-6h': 0, '6-12h': 0, '12-24h': 0, '24h+': 0 };
  pending.forEach(function (o) {
    if (o.openHours <= 6) aging['0-6h']++;
    else if (o.openHours <= 12) aging['6-12h']++;
    else if (o.openHours <= 24) aging['12-24h']++;
    else aging['24h+']++;
  });

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      orders: orders.length,
      shipped: orders.length - pending.length,
      pending: pending.length,
      highAlert: pending.filter(function (o) { return o.alert === 'high'; }).length,
      outOfStock: byReason.OUT_OF_STOCK,
      atWarehouse: byReason.AT_WAREHOUSE,
      neglected: byReason.WAREHOUSE_NEGLECT,
      openValue: Math.round(pending.reduce(function (s, o) { return s + o.value; }, 0) * 100) / 100
    },
    byReason: byReason,
    aging: aging,
    customers: customers
  };
}

/* GET /api/orders -> raw order list (supports ?status=&reason=&customer=&alert=) */
router.get('/api/orders', function (req, res) {
  var out = DATA.slice();
  var q = req.query;
  if (q.status) out = out.filter(function (o) { return o.status === q.status; });
  if (q.reason) out = out.filter(function (o) { return o.reason === q.reason; });
  if (q.alert) out = out.filter(function (o) { return o.alert === q.alert; });
  if (q.customer) out = out.filter(function (o) { return o.customer === q.customer; });
  res.json({ orders: out, count: out.length });
});

/* GET /api/summary -> KPIs, reason breakdown, aging, per-customer open orders */
router.get('/api/summary', function (req, res) {
  res.json(summarize(DATA));
});

module.exports = router;
