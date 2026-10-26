/* units.js — the measurement techniques used across the Bouesti website (shop, cart, receipts, admin, chat assistant, server).
 *
 * Every product has ONE primary unit (what the price is "per") and optionally several MEASURES: other ways to buy it.
 *   product = { unit: 'derica', price: 3400, stock: 430,
 *               measures: [ { unit: 'derica', qty: 1 }, { unit: 'paint_rubber', qty: 2.5, kg: 4 }, { unit: 'bag', qty: 31, kg: 50 } ] }
 *   measure.qty = how many PRIMARY units it contains (price = product price x qty), measure.kg = its weight when that is useful to show.
 *
 * To add a measurement technique: add a line to UNITS below (key, name, plural, group, approx, aliases). Nothing else is needed:
 * the admin unit list, the shop, receipts and the chat assistant all read from here.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMUnits = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GROUPS = ['Weight', 'Volume', 'Local measures', 'Bundles and heaps', 'Containers and packs', 'Counts', 'Groups and lots'];

  // key: [name, plural, group, approx(local sizes vary a little), aliases...]
  var RAW = {
    // ---- Weight
    kg: ['kg', 'kg', 'Weight', false, 'kilo', 'kilos', 'kilogram', 'kilograms', 'kgs'],
    g: ['g', 'g', 'Weight', false, 'gram', 'grams', 'gm', 'gms'],
    tonne: ['tonne', 'tonnes', 'Weight', false, 'ton', 'tons', 'tonnes', 'metric ton'],
    // ---- Volume
    litre: ['litre', 'litres', 'Volume', false, 'liter', 'liters', 'ltr', 'ltrs', 'litres'],
    ml: ['mL', 'mL', 'Volume', false, 'ml', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters'],
    // ---- Local measures (the sizes Nigerian markets actually use)
    derica: ['derica', 'dericas', 'Local measures', true, 'deriica', 'derrica', 'derika', 'dericas'],
    mudu: ['mudù', 'mudùs', 'Local measures', true, 'mudu', 'mudus', 'mudù', 'mudùs'],
    paint_rubber: ['paint rubber', 'paint rubbers', 'Local measures', true, 'paint bucket', 'paint buckets', 'paint', 'rubber', 'rubbers', 'painter'],
    tin: ['tin', 'tins', 'Local measures', true, 'milk tin', 'tomato tin', 'tins'],
    bowl: ['bowl', 'bowls', 'Local measures', true, 'bowls'],
    basin: ['basin', 'basins', 'Local measures', true, 'basins'],
    bucket: ['bucket', 'buckets', 'Local measures', true, 'buckets'],
    basket: ['basket', 'baskets', 'Local measures', true, 'baskets'],
    // ---- Bundles and heaps
    bunch: ['bunch', 'bunches', 'Bundles and heaps', true, 'bunches'],
    bundle: ['bundle', 'bundles', 'Bundles and heaps', true, 'bundles'],
    heap: ['heap', 'heaps', 'Bundles and heaps', true, 'heaps', 'pile', 'piles'],
    hand: ['hand', 'hands', 'Bundles and heaps', true, 'hands'],
    bale: ['bale', 'bales', 'Bundles and heaps', true, 'bales'],
    // ---- Containers and packs
    bag: ['bag', 'bags', 'Containers and packs', false, 'bags'],
    sack: ['sack', 'sacks', 'Containers and packs', false, 'sacks'],
    crate: ['crate', 'crates', 'Containers and packs', false, 'crates'],
    tray: ['tray', 'trays', 'Containers and packs', false, 'trays'],
    carton: ['carton', 'cartons', 'Containers and packs', false, 'cartons', 'box', 'boxes'],
    packet: ['packet', 'packets', 'Containers and packs', false, 'packets'],
    pack: ['pack', 'packs', 'Containers and packs', false, 'packs'],
    sachet: ['sachet', 'sachets', 'Containers and packs', false, 'sachets'],
    bottle: ['bottle', 'bottles', 'Containers and packs', false, 'bottles'],
    jerrycan: ['jerrycan', 'jerrycans', 'Containers and packs', false, 'jerry can', 'jerry cans', 'jerrycans', 'gallon', 'gallons'],
    tank: ['tank', 'tanks', 'Containers and packs', false, 'tanks'],
    // ---- Counts
    piece: ['piece', 'pieces', 'Counts', false, 'pieces', 'pc', 'pcs'],
    tuber: ['tuber', 'tubers', 'Counts', false, 'tubers'],
    cob: ['cob', 'cobs', 'Counts', false, 'cobs'],
    head: ['head', 'heads', 'Counts', false, 'heads'],
    bird: ['bird', 'birds', 'Counts', false, 'birds'],
    pair: ['pair', 'pairs', 'Counts', false, 'pairs'],
    dozen: ['dozen', 'dozens', 'Counts', false, 'dozens', 'doz'],
    fingerling: ['fingerling', 'fingerlings', 'Counts', false, 'fingerlings'],
    seedling: ['seedling', 'seedlings', 'Counts', false, 'seedlings'],
    plant: ['plant', 'plants', 'Counts', false, 'plants'],
    carcass: ['carcass', 'carcasses', 'Counts', false, 'carcasses'],
    // ---- Groups and lots
    flock: ['flock', 'flocks', 'Groups and lots', false, 'flocks'],
    herd: ['herd', 'herds', 'Groups and lots', false, 'herds'],
    colony: ['colony', 'colonies', 'Groups and lots', false, 'colonies', 'hive', 'hives'],
    pond: ['pond', 'ponds', 'Groups and lots', false, 'ponds']
  };

  var UNITS = {};
  Object.keys(RAW).forEach(function (k) {
    var r = RAW[k];
    UNITS[k] = { key: k, name: r[0], plural: r[1], group: r[2], approx: r[3], aliases: r.slice(4) };
  });

  function info(u) { return UNITS[u] || { key: u, name: String(u || ''), plural: String(u || ''), group: 'Other', approx: false, aliases: [] }; }
  function isUnit(u) { return Object.prototype.hasOwnProperty.call(UNITS, u); }
  function fmt(n) { n = Number(n); if (!isFinite(n)) return '0'; return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100); }
  function name(u, qty) { var i = info(u); return qty === undefined || Number(qty) === 1 ? i.name : i.plural; }
  function cap(s) { s = String(s); return s.charAt(0).toUpperCase() + s.slice(1); }
  function qtyText(qty, u) { return fmt(qty) + ' ' + name(u, qty); }

  // The text shown for one way of buying a product, e.g. "Derica (≈1.8 kg)", "Pair (2 tubers)", "5 kg", "Jerrycan (25 litres)".
  function measureLabel(primary, m) {
    if (m.label) return m.label;
    var i = info(m.unit);
    var kg = m.kg != null ? Number(m.kg) : (primary === 'kg' ? Number(m.qty) : null);
    if (m.unit === 'kg') return fmt(kg != null ? kg : m.qty) + ' kg';
    if (m.unit === 'g') return fmt((kg != null ? kg : m.qty / 1000) * 1000) + ' g';
    if (m.unit === 'tonne') return fmt(kg != null ? kg / 1000 : m.qty) + (((kg != null ? kg / 1000 : m.qty) === 1) ? ' tonne' : ' tonnes');
    if (m.unit === 'ml') return fmt(primary === 'litre' ? m.qty * 1000 : m.qty) + ' mL';
    if (m.unit === primary) return fmt(m.qty) + ' ' + name(primary, m.qty);
    if (kg != null) return cap(i.name) + ' (' + (i.approx ? '≈' : '') + fmt(kg) + ' kg)';
    return cap(i.name) + ' (' + fmt(m.qty) + ' ' + name(primary, m.qty) + ')';
  }
  function measureKey(m) { return m.unit + '-' + fmt(m.kg != null ? m.kg : m.qty); }

  // Fill in key + label on a raw measure list. Drops junk, keeps order.
  function normalizeMeasures(primary, list) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).forEach(function (raw) {
      if (!raw || !isUnit(raw.unit)) return;
      var qty = Number(raw.qty);
      if (!isFinite(qty) || qty <= 0) return;
      var m = { unit: raw.unit, qty: Math.round(qty * 1000) / 1000 };
      if (raw.kg != null && isFinite(Number(raw.kg)) && Number(raw.kg) > 0) m.kg = Number(raw.kg);
      if (raw.label) m.label = String(raw.label).slice(0, 60);
      m.key = measureKey(m);
      if (seen[m.key]) return;
      seen[m.key] = 1;
      m.label = measureLabel(primary, m);
      out.push(m);
    });
    return out;
  }

  // Price of ONE of a measure. Whole-naira, tidied to the nearest ₦10 once it is ₦100 or more (so a 1.8 kg derica is not ₦5,043).
  function priceFor(unitPrice, qty) {
    var raw = Number(unitPrice) * Number(qty);
    if (Number(qty) === 1) return Math.round(Number(unitPrice));
    return raw >= 100 ? Math.round(raw / 10) * 10 : Math.round(raw);
  }

  // "2 dericas" / "1 paint rubber" / "3 kg" / "tin" typed by a customer -> unit key (or null)
  var aliasIndex = null;
  function unitFromWord(word) {
    if (!aliasIndex) {
      aliasIndex = {};
      Object.keys(UNITS).forEach(function (k) {
        [UNITS[k].name, UNITS[k].plural, k].concat(UNITS[k].aliases).forEach(function (a) { aliasIndex[String(a).toLowerCase()] = k; });
      });
    }
    return aliasIndex[String(word || '').toLowerCase().trim()] || null;
  }
  function aliasPattern() {
    unitFromWord('kg');
    return Object.keys(aliasIndex).filter(function (a) { return a.length >= 2 || a === 'g'; }).sort(function (a, b) { return b.length - a.length; })
      .map(function (a) { return a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|');
  }

  function unitsByGroup() {
    return GROUPS.map(function (g) { return { group: g, units: Object.keys(UNITS).filter(function (k) { return UNITS[k].group === g; }).map(function (k) { return UNITS[k]; }) }; });
  }

  return { UNITS: UNITS, GROUPS: GROUPS, info: info, isUnit: isUnit, name: name, fmt: fmt, cap: cap, qtyText: qtyText, measureLabel: measureLabel, measureKey: measureKey,
    normalizeMeasures: normalizeMeasures, priceFor: priceFor, unitFromWord: unitFromWord, aliasPattern: aliasPattern, unitsByGroup: unitsByGroup };
});
