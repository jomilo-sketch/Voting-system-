/* care.js — Bouesti customer care for the public site.
 *   • floating "Chat with us" assistant (talks to /api/care/chat)
 *   • complaint form (POST /api/care/complaints) — usable inside the chat and in the Customer Care section
 *   • "Track a complaint" box (reference + phone/email) showing the team's replies
 * Include with: <script src="care.js" defer></script>
 * In a page, drop <div data-bmc="complaint-form"></div> and/or <div data-bmc="tracker"></div> where you want them,
 * and any element with data-bmc-open opens the chat.
 */
(function () {
  'use strict';
  if (window.BMCare) return;

  var API = '/api';
  var CATS = [
    ['not_delivered', 'Order not delivered'], ['late_delivery', 'Late delivery'], ['wrong_item', 'Wrong item, weight or breed'],
    ['poor_quality', 'Poor quality / spoiled produce'], ['livestock_issue', 'Livestock problem'], ['wrong_charge', 'Wrong charge / refund'],
    ['payment', 'Payment problem'], ['account', 'Account or login'], ['website', 'Website problem'], ['other', 'Something else']
  ];
  var STATUS_LABEL = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' };

  // ---------------------------------------------------------------- helpers
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(text) {
    var h = esc(text);
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/\b(sell\.html|track\.html)\b/g, '<a href="$1">$1</a>');
    return h.replace(/\n/g, '<br>');
  }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function token() { try { return localStorage.getItem('bm_token') || ''; } catch (e) { return ''; } }
  function me() { try { var u = JSON.parse(localStorage.getItem('bm_session') || 'null'); return u && typeof u === 'object' ? u : null; } catch (e) { return null; } }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } return null; }
  function serverApi(path, method, body) {
    var headers = { 'Content-Type': 'application/json' };
    var t = token(); if (t) headers.Authorization = 'Bearer ' + t;
    return fetch(API + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().then(function (data) { return { r: r, data: data, json: true }; }, function () { return { r: r, data: {}, json: false }; }).then(function (x) {
        // No server behind this page (e.g. VS Code Live Server / a plain file host): 404/405, an HTML page, or a non-JSON answer.
        if (!x.json && (!x.r.ok || x.r.status === 404 || x.r.status === 405)) { var e1 = new Error('offline'); e1.offline = true; throw e1; }
        if (!x.r.ok && (x.r.status === 404 || x.r.status === 405) && !x.data.error) { var e2 = new Error('offline'); e2.offline = true; throw e2; }
        if (!x.r.ok) throw new Error(x.data.error || 'Something went wrong. Please try again.');
        return x.data;
      });
    }, function () { var e = new Error('offline'); e.offline = true; throw e; });
  }

  // ---------------------------------------------------------------- offline / demo backend
  // Used automatically when no Bouesti server answers. Everything is kept in this browser (localStorage key
  // bm_care_offline_v1) and the admin dashboard's demo mode reads the same key, so complaints still reach "the admin".
  var LKEY = 'bm_care_offline_v1';
  function ldb() { try { var d = JSON.parse(localStorage.getItem(LKEY) || 'null'); if (d && d.complaints) return d; } catch (e) { /* ignore */ } return { seq: 0, complaints: [], messages: [], chats: {} }; }
  function lsave(d) { try { localStorage.setItem(LKEY, JSON.stringify(d)); } catch (e) { /* storage blocked */ } }
  function pad(n) { return String(n).padStart(2, '0'); }
  function phoneKey(p) { return String(p || '').replace(/\D/g, '').slice(-10); }
  function catLabel(k) { for (var i = 0; i < CATS.length; i++) if (CATS[i][0] === k) return CATS[i][1]; return 'Something else'; }
  function guard(cond, msg) { if (cond) throw new Error(msg); }

  function offlineFacts() {
    var snap = window.BM_KB_SNAPSHOT || { products: [], states: [] };
    var products = [];
    try {
      if (typeof PRODUCE !== 'undefined' && typeof LIVESTOCK !== 'undefined' && PRODUCE.length) {
        var conv = function (list, kind) {
          return list.map(function (p) {
            var modes = p.modes ? Object.keys(p.modes) : [];
            return { sku: p.id, name: p.name, kind: kind, sub: p.category, desc: p.desc || '', price: p.price, unit: p.unit, stock: p.stock, measures: p.measures || [], modes: modes, processedPrice: p.modes && p.modes.processed ? p.modes.processed : null };
          });
        };
        products = conv(PRODUCE, 'produce').concat(conv(LIVESTOCK, 'livestock'));
      }
    } catch (e) { products = []; }
    if (!products.length) products = snap.products;
    var states = snap.states;
    try { if (typeof DELIVERY_STATES !== 'undefined' && DELIVERY_STATES.length) states = DELIVERY_STATES.map(function (s) { return { name: s.name, fee: s.fee }; }); } catch (e) { /* keep snapshot */ }
    return { name: 'Bouesti Marketplace', phone: '07086087995', email: 'successjomiloju@gmail.com', address: 'Ado-Ekiti, Ekiti State', feePct: 5, products: products, states: states, announcements: [] };
  }
  function offlineLookupOrder(ref) {
    try {
      var rc = (JSON.parse(localStorage.getItem('bm_receipts') || '{}') || {})[ref];
      var adm = JSON.parse(localStorage.getItem('bm_admin_offline_db_v1') || 'null');
      var ao = adm && adm.orders ? adm.orders.filter(function (o) { return o.ref === ref; })[0] : null;
      if (!rc && !ao) return null;
      return { status: (ao && ao.status) || (rc && rc.status) || 'pending', paymentStatus: rc && rc.paymentStatus, deliveryDate: rc && rc.deliveryDate };
    } catch (e) { return null; }
  }
  // The offline chat brain (about 100 KB) is fetched the first time it is needed, not on every page load.
  var engineLoading = null;
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
  function loadEngine() {
    if (window.BMChatEngine) return Promise.resolve();
    if (!engineLoading) engineLoading = (window.BMUnits ? Promise.resolve() : loadScript('units.js')).then(function () { return window.BM_KB_SNAPSHOT ? null : loadScript('knowledge-data.js'); }).then(function () { return loadScript('chat-engine.js'); });
    return engineLoading;
  }
  var engine = null;
  function getEngine() {
    if (!engine && window.BMChatEngine) engine = window.BMChatEngine.createEngine({ getFacts: offlineFacts, lookupOrder: offlineLookupOrder });
    return engine;
  }
  function pushAdminNotice(title, message) {
    try {
      var a = JSON.parse(localStorage.getItem('bm_admin_offline_db_v1') || 'null');
      if (a && a.notifications) { a.notifications.unshift({ id: 'n' + Date.now(), type: 'system', title: title, message: message, createdAt: new Date().toISOString(), read: false }); localStorage.setItem('bm_admin_offline_db_v1', JSON.stringify(a)); }
    } catch (e) { /* admin demo not initialised yet: fine */ }
  }
  function lthread(d, c) { return d.messages.filter(function (m) { return m.complaintId === c.id; }).map(function (m) { return { id: m.id, sender: m.sender, senderName: m.senderName || (m.sender === 'staff' ? 'Bouesti team' : 'You'), body: m.body, createdAt: m.createdAt }; }); }
  function lfind(d, ref, contact) {
    var c = d.complaints.filter(function (x) { return x.ref === String(ref || '').trim().toUpperCase(); })[0];
    var raw = String(contact || '').trim(), ok = false;
    if (c && raw) ok = raw.indexOf('@') >= 0 ? (!!c.email && c.email.toLowerCase() === raw.toLowerCase()) : (phoneKey(raw).length >= 7 && phoneKey(c.phone) === phoneKey(raw));
    guard(!c || !ok, 'We could not find a complaint with that reference and phone number / email. Please check both and try again.');
    return c;
  }
  function cout(c) { var o = JSON.parse(JSON.stringify(c)); o.categoryLabel = catLabel(c.category); return o; }

  function localRoute(path, method, body) {
    var d, m;
    return new Promise(function (resolve, reject) {
      try {
        if (path === '/care/info') {
          var f = offlineFacts();
          return resolve({ categories: CATS.map(function (c) { return { key: c[0], label: c[1] }; }), contact: { phone: f.phone, email: f.email, address: f.address, hours: 'Mon–Sat, 7am–7pm (WAT)' }, aiEnabled: false, offline: true });
        }
        if (path === '/care/complaints' && method === 'POST') {
          d = ldb();
          var u = me() || {};
          var name = String(body.name || u.name || '').trim().slice(0, 100), phone = String(body.phone || u.phone || '').trim().slice(0, 30), email = String(body.email || u.email || '').trim().slice(0, 150), message = String(body.message || '').trim().slice(0, 2000);
          guard(name.length < 2, 'Please enter your name');
          guard(!phone && !email, 'Please give a phone number or an email so we can reply to you');
          guard(phone && phoneKey(phone).length < 7, 'That phone number does not look right');
          guard(email && !/\S+@\S+\.\S+/.test(email), 'That email address does not look right');
          guard(message.length < 10, 'Please describe the problem in a few words (at least 10 characters)');
          var category = CATS.some(function (c) { return c[0] === body.category; }) ? body.category : 'other';
          var orderRef = String(body.orderRef || '').trim().toUpperCase().slice(0, 30);
          var priority = ['livestock_issue', 'not_delivered', 'wrong_charge', 'payment'].indexOf(category) >= 0 ? 'high' : 'normal';
          if (/\b(urgent|emergency|asap|immediately)\b/i.test(message)) priority = 'urgent';
          var dt = new Date(), day = dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()), ref;
          do { ref = 'CC-' + day + '-' + (1000 + Math.floor(Math.random() * 9000)); } while (d.complaints.some(function (c) { return c.ref === ref; }));
          var now = new Date().toISOString(), sid = /^[a-z0-9]{16,40}$/.test(body.chatSession || '') ? body.chatSession : '';
          d.seq += 1;
          var comp = { id: d.seq, ref: ref, name: name, phone: phone, email: email, orderRef: orderRef, category: category, subject: String(body.subject || '').trim().slice(0, 150) || (catLabel(category) + (orderRef ? ' — ' + orderRef : '')), message: message, priority: priority, status: 'open', source: sid ? 'chat' : 'form', chatSession: sid || null, createdAt: now, updatedAt: now };
          d.complaints.unshift(comp);
          d.seq += 1; d.messages.push({ id: d.seq, complaintId: comp.id, sender: 'customer', senderName: name, body: message, createdAt: now });
          if (sid && d.chats[sid]) d.chats[sid].complaintRef = ref;
          lsave(d);
          pushAdminNotice('New customer complaint ' + ref, name + ' — ' + catLabel(category) + (orderRef ? ' (' + orderRef + ')' : '') + ': ' + message.slice(0, 140));
          return resolve({ ok: true, ref: ref, offline: true, message: 'Your complaint has been saved. Keep your reference: ' + ref });
        }
        if (path === '/care/complaints/lookup' && method === 'POST') {
          d = ldb(); var c1 = lfind(d, body.ref, body.contact);
          return resolve({ complaint: cout(c1), messages: lthread(d, c1) });
        }
        m = path.match(/^\/care\/complaints\/([^/]+)\/reply$/);
        if (m && method === 'POST') {
          d = ldb(); var c2 = lfind(d, decodeURIComponent(m[1]), body.contact);
          var msg = String(body.message || '').trim().slice(0, 2000); guard(msg.length < 2, 'Please type your message');
          d.seq += 1; d.messages.push({ id: d.seq, complaintId: c2.id, sender: 'customer', senderName: c2.name, body: msg, createdAt: new Date().toISOString() });
          if (c2.status === 'resolved' || c2.status === 'closed') c2.status = 'open';
          c2.updatedAt = new Date().toISOString(); lsave(d);
          pushAdminNotice('Customer follow-up on ' + c2.ref, c2.name + ': ' + msg.slice(0, 140));
          return resolve({ complaint: cout(c2), messages: lthread(d, c2) });
        }
        if (path === '/care/chat' && method === 'POST') {
          loadEngine().then(function () {
            try {
          d = ldb();
          var sid2 = String(body.sessionId || ''), text = String(body.message || '').trim().slice(0, 1000);
          guard(!/^[a-z0-9]{16,40}$/.test(sid2), 'Invalid chat session'); guard(!text, 'Please type a message');
          var ch = d.chats[sid2] || (d.chats[sid2] = { id: sid2, who: (me() && me().name) || 'Visitor', complaintRef: '', messages: [], createdAt: new Date().toISOString(), updatedAt: '' });
          var hist = ch.messages.slice(-12).map(function (x) { return { role: x.role, body: x.body }; });
          var eng = getEngine();
          var res = eng ? eng.answer(text, hist) : { reply: 'The assistant is still loading. Please refresh the page and try again.', chips: [] };
          var ts = new Date().toISOString();
          ch.messages.push({ role: 'user', body: text, createdAt: ts }, { role: 'bot', body: res.reply, source: 'local', createdAt: ts });
          ch.updatedAt = ts;
          var ids = Object.keys(d.chats); if (ids.length > 40) { ids.sort(function (a, b) { return (d.chats[a].updatedAt || '') < (d.chats[b].updatedAt || '') ? -1 : 1; }).slice(0, ids.length - 40).forEach(function (k) { delete d.chats[k]; }); }
          lsave(d);
          return resolve({ reply: res.reply, action: res.action || null, category: res.category || null, chips: res.chips || [], source: 'local' });
                    } catch (e) { reject(e); }
          }, reject);
          return;
        }
        return reject(new Error('This action is not available in demo mode.'));
      } catch (e) { reject(e); }
    });
  }

  // Server first; if no server answers, quietly switch to the offline backend for the rest of the page's life.
  var mode = null;           // 'server' | 'local'
  var onModeChange = function () {};
  function api(path, method, body) {
    method = method || 'GET';
    if (mode === 'local') return localRoute(path, method, body || {});
    return serverApi(path, method, body).then(function (r) { if (mode !== 'server') { mode = 'server'; onModeChange(); } return r; }, function (e) {
      if (e && e.offline) { mode = 'local'; onModeChange(); return localRoute(path, method, body || {}); }
      throw e;
    });
  }
  function when(iso) { try { return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
  function randomId() {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789', s = '';
    var a = new Uint8Array(24); (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < a.length; i++) s += chars[a[i] % chars.length];
    return s;
  }

  // ---------------------------------------------------------------- styles
  var css = '' +
    '.bmc-fab{position:fixed;right:18px;bottom:18px;z-index:9000;display:flex;align-items:center;gap:8px;padding:12px 18px;border-radius:999px;border:0;cursor:pointer;background:var(--mint,#02f5a1);color:var(--ink,#07191e);font:700 14px var(--body,system-ui,sans-serif);box-shadow:0 8px 28px rgba(0,0,0,.35)}' +
    '.bmc-fab:hover{transform:translateY(-2px)}.bmc-fab svg{flex:none}' +
    '.bmc-panel{position:fixed;right:18px;bottom:76px;width:384px;max-width:calc(100vw - 24px);height:580px;max-height:calc(100vh - 96px);z-index:9001;display:none;flex-direction:column;background:var(--dark-2,#0d2830);color:var(--text,#e8f8f5);border:1px solid var(--line,rgba(2,245,161,.2));border-radius:16px;overflow:hidden;box-shadow:0 18px 60px rgba(0,0,0,.5);font:14px/1.5 var(--body,system-ui,sans-serif)}' +
    '.bmc-panel.open{display:flex}' +
    '@media(max-width:520px){.bmc-panel{right:0;bottom:0;width:100vw;max-width:100vw;height:100vh;height:100dvh;max-height:100dvh;border-radius:0}.bmc-fab span{display:none}.bmc-fab{padding:14px}}' +
    '.bmc-head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--dark-3,#122f38);border-bottom:1px solid var(--line-dim,rgba(255,255,255,.08))}' +
    '.bmc-head img{width:34px;height:34px;border-radius:50%;background:#fff;object-fit:contain;padding:1px}' +
    '.bmc-head .t{flex:1;min-width:0}.bmc-head b{display:block;font-size:14px}.bmc-head small{color:var(--text-dim,rgba(232,248,245,.6));font-size:11.5px}' +
    '.bmc-ico{background:none;border:0;color:var(--text-dim,#9bb);cursor:pointer;padding:6px;border-radius:8px;font-size:18px;line-height:1}.bmc-ico:hover{background:var(--dark-4,#1a3d48);color:var(--text,#fff)}' +
    '.bmc-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}' +
    '.bmc-msg{max-width:86%;padding:9px 12px;border-radius:14px;word-wrap:break-word;overflow-wrap:anywhere}' +
    '.bmc-msg a{color:inherit;text-decoration:underline}' +
    '.bmc-msg.bot{align-self:flex-start;background:var(--dark-3,#122f38);border-bottom-left-radius:4px}' +
    '.bmc-msg.user{align-self:flex-end;background:var(--mint,#02f5a1);color:var(--ink,#07191e);border-bottom-right-radius:4px;font-weight:500}' +
    '.bmc-act{display:inline-block;margin-top:8px;padding:8px 12px;border-radius:9px;border:0;background:var(--mint,#02f5a1);color:var(--ink,#07191e);font:700 13px var(--body,system-ui);cursor:pointer}' +
    '.bmc-sugg{display:flex;flex-wrap:wrap;gap:6px;margin:-2px 0 4px}' +
    '.bmc-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px}' +
    '.bmc-chip{padding:6px 11px;border-radius:999px;border:1px solid var(--line,rgba(2,245,161,.25));background:transparent;color:var(--text,#e8f8f5);font:600 12.5px var(--body,system-ui);cursor:pointer}.bmc-chip:hover{background:var(--mint-glow,rgba(2,245,161,.15))}' +
    '.bmc-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:var(--dark-3,#122f38);border-radius:14px}' +
    '.bmc-typing i{width:6px;height:6px;border-radius:50%;background:var(--text-dim,#9bb);animation:bmcb 1.2s infinite}.bmc-typing i:nth-child(2){animation-delay:.15s}.bmc-typing i:nth-child(3){animation-delay:.3s}' +
    '@keyframes bmcb{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}' +
    '.bmc-input{display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line-dim,rgba(255,255,255,.08));background:var(--dark-2,#0d2830)}' +
    '.bmc-input input{flex:1;min-width:0;padding:11px 13px;border-radius:10px;border:1px solid var(--line-dim,rgba(255,255,255,.12));background:var(--dark-3,#122f38);color:var(--text,#fff);font:inherit;outline:0}.bmc-input input:focus{border-color:var(--mint,#02f5a1)}' +
    '.bmc-send{width:42px;border:0;border-radius:10px;background:var(--mint,#02f5a1);color:var(--ink,#07191e);cursor:pointer;display:grid;place-items:center}.bmc-send:disabled{opacity:.5;cursor:default}' +
    '.bmc-foot{padding:0 14px 8px;font-size:11px;color:var(--text-faint,rgba(232,248,245,.4));text-align:center}' +
    /* forms (used in the chat panel and on the page) */
    '.bmc-form{display:flex;flex-direction:column;gap:10px}.bmc-form label{font:600 12px var(--body,system-ui);color:var(--text-dim,rgba(232,248,245,.65));display:flex;flex-direction:column;gap:5px}' +
    '.bmc-form input,.bmc-form select,.bmc-form textarea{padding:10px 12px;border-radius:9px;border:1px solid var(--line-dim,rgba(255,255,255,.14));background:var(--dark-3,#122f38);color:var(--text,#fff);font:400 14px var(--body,system-ui);outline:0;width:100%;box-sizing:border-box}' +
    '.bmc-form input:focus,.bmc-form select:focus,.bmc-form textarea:focus{border-color:var(--mint,#02f5a1)}.bmc-form textarea{resize:vertical;min-height:96px}' +
    '.bmc-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:520px){.bmc-row{grid-template-columns:1fr}}' +
    '.bmc-btn{padding:12px 16px;border-radius:10px;border:0;background:var(--mint,#02f5a1);color:var(--ink,#07191e);font:700 14px var(--body,system-ui);cursor:pointer}.bmc-btn:disabled{opacity:.6;cursor:default}' +
    '.bmc-btn.ghost{background:transparent;color:var(--text,#fff);border:1px solid var(--line,rgba(2,245,161,.3))}' +
    '.bmc-err{color:var(--danger,#ff4d6d);font-size:13px;min-height:0}.bmc-note{font-size:12px;color:var(--text-faint,rgba(232,248,245,.5))}' +
    '.bmc-ok{padding:14px;border-radius:12px;border:1px solid var(--line,rgba(2,245,161,.3));background:var(--mint-glow2,rgba(2,245,161,.08));text-align:center}' +
    '.bmc-ok .ref{display:block;margin:8px 0;font:700 20px var(--mono,monospace);color:var(--mint,#02f5a1);letter-spacing:.5px;user-select:all}' +
    '.bmc-panel .bmc-form{padding:14px;overflow-y:auto;flex:1}' +
    /* tracker */
    '.bmc-chipst{display:inline-block;padding:3px 10px;border-radius:999px;font:700 11.5px var(--body,system-ui);background:var(--dark-4,#1a3d48)}' +
    '.bmc-chipst.open{background:rgba(255,201,71,.2);color:var(--gold,#ffc947)}.bmc-chipst.in_progress{background:rgba(56,189,248,.2);color:var(--sky,#38bdf8)}.bmc-chipst.resolved,.bmc-chipst.closed{background:var(--mint-glow,rgba(2,245,161,.18));color:var(--mint,#02f5a1)}' +
    '.bmc-thread{display:flex;flex-direction:column;gap:8px;margin:12px 0}.bmc-bub{padding:9px 12px;border-radius:12px;max-width:90%;font-size:14px}' +
    '.bmc-bub.customer{align-self:flex-end;background:var(--dark-4,#1a3d48)}.bmc-bub.staff{align-self:flex-start;background:var(--mint-glow,rgba(2,245,161,.14));border:1px solid var(--line,rgba(2,245,161,.25))}' +
    '.bmc-bub small{display:block;color:var(--text-faint,rgba(232,248,245,.5));font-size:11px;margin-top:3px}';
  var style = el('style'); style.textContent = css; document.head.appendChild(style);

  // ---------------------------------------------------------------- complaint form
  function buildComplaintForm(opts) {
    opts = opts || {};
    var u = me() || {};
    var wrap = el('div');
    var form = el('form', { class: 'bmc-form', novalidate: '' });
    form.innerHTML =
      '<div class="bmc-row"><label>Your name *<input name="name" maxlength="100" autocomplete="name" required></label>' +
      '<label>Phone number<input name="phone" maxlength="30" inputmode="tel" autocomplete="tel" placeholder="0803 000 0000"></label></div>' +
      '<div class="bmc-row"><label>Email<input name="email" type="email" maxlength="150" autocomplete="email" placeholder="you@example.com"></label>' +
      '<label>Order reference<input name="orderRef" maxlength="30" placeholder="BM-20261006-1234"></label></div>' +
      '<label>What is it about?<select name="category">' + CATS.map(function (c) { return '<option value="' + c[0] + '">' + esc(c[1]) + '</option>'; }).join('') + '</select></label>' +
      '<label>Tell us what happened *<textarea name="message" maxlength="2000" placeholder="Describe the problem. For claims, report within 24 hours of delivery and include what was wrong."></textarea></label>' +
      '<div class="bmc-note">Give a phone number or an email so we can reply. Photos can be sent on WhatsApp quoting your reference.</div>' +
      '<div class="bmc-err" role="alert"></div>' +
      '<button class="bmc-btn" type="submit">Submit complaint</button>';
    var f = form.elements;
    f.name.value = u.name || ''; f.phone.value = u.phone || ''; f.email.value = u.email || '';
    if (opts.category) f.category.value = opts.category;
    if (opts.message) f.message.value = opts.message;
    var err = form.querySelector('.bmc-err'), btn = form.querySelector('button[type=submit]');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); err.textContent = '';
      var name = f.name.value.trim(), phone = f.phone.value.trim(), email = f.email.value.trim(), message = f.message.value.trim();
      if (name.length < 2) { err.textContent = 'Please enter your name.'; f.name.focus(); return; }
      if (!phone && !email) { err.textContent = 'Please add a phone number or an email so we can reply.'; f.phone.focus(); return; }
      if (message.length < 10) { err.textContent = 'Please describe the problem in a few words.'; f.message.focus(); return; }
      btn.disabled = true; btn.textContent = 'Sending…';
      api('/care/complaints', 'POST', { name: name, phone: phone, email: email, orderRef: f.orderRef.value.trim(), category: f.category.value, message: message, chatSession: opts.chatSession || '' })
        .then(function (res) {
          store('bm_last_complaint', JSON.stringify({ ref: res.ref, contact: phone || email }));
          wrap.innerHTML = '<div class="bmc-ok"><strong>Complaint received</strong><span class="ref">' + esc(res.ref) + '</span>' +
            '<div class="bmc-note" style="font-size:13px">Keep this reference. The team will reply — check it any time under <b>Track a complaint</b> in the Support section using this reference and your ' + (phone ? 'phone number' : 'email') + '.' + (res.offline ? '<br><br><b>Demo mode:</b> no server is running, so this complaint is saved in this browser and shows in the admin dashboard on this same browser.' : '') + '</div></div>';
          if (opts.onDone) opts.onDone(res);
        })
        .catch(function (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = 'Submit complaint'; });
    });
    wrap.appendChild(form);
    return wrap;
  }

  // ---------------------------------------------------------------- tracker
  function buildTracker() {
    var root = el('div');
    var last = {}; try { last = JSON.parse(store('bm_last_complaint') || '{}'); } catch (e) { last = {}; }
    root.innerHTML =
      '<form class="bmc-form" novalidate><div class="bmc-row"><label>Complaint reference<input name="ref" placeholder="CC-20261008-1234" maxlength="30" autocapitalize="characters"></label>' +
      '<label>Your phone or email<input name="contact" maxlength="150" placeholder="The one you used"></label></div>' +
      '<div class="bmc-err" role="alert"></div><button class="bmc-btn ghost" type="submit">Check status</button></form><div class="bmc-result"></div>';
    var form = root.querySelector('form'), err = root.querySelector('.bmc-err'), out = root.querySelector('.bmc-result');
    form.elements.ref.value = last.ref || ''; form.elements.contact.value = last.contact || '';
    var current = null;

    function render(data) {
      var c = data.complaint;
      var h = '<div style="margin-top:14px"><span class="bmc-chipst ' + esc(c.status) + '">' + esc(STATUS_LABEL[c.status] || c.status) + '</span> ' +
        '<strong style="margin-left:6px">' + esc(c.subject) + '</strong><div class="bmc-note">' + esc(c.ref) + ' · logged ' + esc(when(c.createdAt)) + '</div></div><div class="bmc-thread">';
      data.messages.forEach(function (m) {
        h += '<div class="bmc-bub ' + m.sender + '">' + fmt(m.body) + '<small>' + esc(m.sender === 'staff' ? m.senderName + ' (Bouesti team)' : 'You') + ' · ' + esc(when(m.createdAt)) + '</small></div>';
      });
      h += '</div><form class="bmc-form bmc-reply" novalidate><label>Add a message<textarea name="msg" maxlength="2000" style="min-height:70px"></textarea></label>' +
        '<div class="bmc-err" role="alert"></div><button class="bmc-btn" type="submit">Send</button></form>';
      out.innerHTML = h;
      var rf = out.querySelector('.bmc-reply'), re = rf.querySelector('.bmc-err');
      rf.addEventListener('submit', function (ev) {
        ev.preventDefault(); re.textContent = '';
        var msg = rf.elements.msg.value.trim(); if (msg.length < 2) { re.textContent = 'Please type your message.'; return; }
        api('/care/complaints/' + encodeURIComponent(current.ref) + '/reply', 'POST', { contact: current.contact, message: msg })
          .then(render).catch(function (e) { re.textContent = e.message; });
      });
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault(); err.textContent = ''; out.innerHTML = '';
      var ref = form.elements.ref.value.trim().toUpperCase(), contact = form.elements.contact.value.trim();
      if (!ref || !contact) { err.textContent = 'Enter your complaint reference and the phone number or email you used.'; return; }
      api('/care/complaints/lookup', 'POST', { ref: ref, contact: contact }).then(function (data) {
        current = { ref: ref, contact: contact }; store('bm_last_complaint', JSON.stringify(current)); render(data);
      }).catch(function (e) { err.textContent = e.message; });
    });
    return root;
  }

  // ---------------------------------------------------------------- chat widget
  var sessionId = store('bm_chat_session');
  if (!sessionId || !/^[a-z0-9]{16,40}$/.test(sessionId)) { sessionId = randomId(); store('bm_chat_session', sessionId); }
  var log = []; try { log = JSON.parse(store('bm_chat_log') || '[]'); if (!Array.isArray(log)) log = []; } catch (e) { log = []; }
  var panel, body, input, sendBtn, chips, titleSmall, formView, busy = false, lastUserText = '';

  function saveLog() { store('bm_chat_log', JSON.stringify(log.slice(-40))); }
  function scrollDown() { body.scrollTop = body.scrollHeight; }

  function addBubble(role, text, opts) {
    var b = el('div', { class: 'bmc-msg ' + role }, fmt(text));
    if (opts && opts.action === 'complaint') {
      var a = el('button', { class: 'bmc-act', type: 'button' }, 'Log this complaint');
      a.addEventListener('click', function () { showForm({ category: opts.category, message: opts.prefill }); });
      b.appendChild(a);
    }
    body.appendChild(b);
    if (opts && opts.chips && opts.chips.length) {
      var row = el('div', { class: 'bmc-sugg' });
      opts.chips.slice(0, 4).forEach(function (c) {
        var cb = el('button', { class: 'bmc-chip', type: 'button' }, esc(c));
        cb.addEventListener('click', function () { if (c === 'Log a complaint') showForm({}); else send(c); });
        row.appendChild(cb);
      });
      body.appendChild(row);
    }
    scrollDown();
  }
  function welcome() {
    addBubble('bot', 'Hi! I am the Bouesti Assistant. Ask me about prices, delivery fees, payments, tracking or buyer protection — or tell me about a problem with an order and I will help you log a complaint.');
  }
  function renderLog() {
    body.innerHTML = ''; welcome();
    log.forEach(function (m, i) { addBubble(m.role, m.body, { action: m.action || '', category: m.category, prefill: m.prefill, chips: i === log.length - 1 ? m.chips : null }); });
  }
  function typing(on) {
    var t = body.querySelector('.bmc-typing');
    if (on && !t) { body.appendChild(el('div', { class: 'bmc-typing' }, '<i></i><i></i><i></i>')); scrollDown(); }
    if (!on && t) t.remove();
  }
  function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true; input.value = ''; chips.style.display = 'none';
    lastUserText = text;
    body.querySelectorAll('.bmc-sugg').forEach(function (n) { n.remove(); });
    log.push({ role: 'user', body: text }); addBubble('user', text); typing(true);
    api('/care/chat', 'POST', { sessionId: sessionId, message: text }).then(function (res) {
      typing(false);
      var entry = { role: 'bot', body: res.reply, action: res.action || '', category: res.category || '', prefill: res.action ? text : '', chips: res.chips || [] };
      log.push(entry); addBubble('bot', res.reply, { action: res.action || '', category: res.category, prefill: text, chips: res.chips || [] });
    }).catch(function (e) {
      typing(false);
      addBubble('bot', e.message + ' Please try again in a moment.');
    }).then(function () { busy = false; sendBtn.disabled = false; saveLog(); input.focus(); });
  }

  function showForm(opts) {
    if (formView) formView.remove();
    formView = el('div', { class: 'bmc-formview', style: 'position:absolute;inset:0;background:var(--dark-2,#0d2830);display:flex;flex-direction:column;z-index:2' });
    var head = el('div', { class: 'bmc-head' }, '<button class="bmc-ico" type="button" aria-label="Back">←</button><div class="t"><b>Log a complaint</b><small>The team replies on this site</small></div>');
    head.querySelector('button').addEventListener('click', function () { formView.remove(); formView = null; });
    formView.appendChild(head);
    var holder = el('div', { style: 'flex:1;overflow-y:auto' });
    holder.appendChild(buildComplaintForm({
      category: opts && opts.category, message: opts && opts.message, chatSession: sessionId,
      onDone: function (res) {
        var msg = 'Your complaint is logged. Your reference is **' + res.ref + '**. Keep it — use "Track a complaint" in the Customer Care section to see the team\'s replies.';
        log.push({ role: 'bot', body: msg }); saveLog(); renderLog();
        setTimeout(function () { if (formView) { formView.remove(); formView = null; } }, 3500);
      }
    }));
    formView.appendChild(holder);
    panel.appendChild(formView);
  }

  function build() {
    var fab = el('button', { class: 'bmc-fab', type: 'button', 'aria-label': 'Chat with Bouesti Assistant' },
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.8A8 8 0 1 1 21 12z"/></svg><span>Chat with us</span>');
    panel = el('div', { class: 'bmc-panel', role: 'dialog', 'aria-label': 'Bouesti Assistant' });
    panel.innerHTML =
      '<div class="bmc-head"><img src="images/bouesti-logo.jpg" alt=""><div class="t"><b>Bouesti Assistant</b><small class="bmc-sub">Ask about prices, delivery, orders</small></div>' +
      '<button class="bmc-ico bmc-form-btn" type="button" title="Log a complaint" aria-label="Log a complaint">📝</button>' +
      '<button class="bmc-ico bmc-new" type="button" title="New chat" aria-label="New chat">↺</button>' +
      '<button class="bmc-ico bmc-close" type="button" aria-label="Close">✕</button></div>' +
      '<div class="bmc-body"></div>' +
      '<div class="bmc-chips"><button class="bmc-chip" type="button">What do you sell?</button><button class="bmc-chip" type="button">Delivery fees</button>' +
      '<button class="bmc-chip" type="button">Buyer protection</button><button class="bmc-chip" type="button">How do I track my order?</button><button class="bmc-chip" data-complaint="1" type="button">Log a complaint</button></div>' +
      '<form class="bmc-input"><input type="text" maxlength="1000" placeholder="Type your question…" aria-label="Message"><button class="bmc-send" type="submit" aria-label="Send">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg></button></form>' +
      '<div class="bmc-foot">Automated assistant · for urgent matters use WhatsApp</div>';
    body = panel.querySelector('.bmc-body'); input = panel.querySelector('.bmc-input input'); sendBtn = panel.querySelector('.bmc-send'); chips = panel.querySelector('.bmc-chips');
    titleSmall = panel.querySelector('.bmc-sub');
    document.body.appendChild(panel); document.body.appendChild(fab);

    function open() { panel.classList.add('open'); fab.style.display = 'none'; if (!body.children.length) renderLog(); if (log.length) chips.style.display = 'none'; setTimeout(function () { input.focus(); scrollDown(); }, 50); }
    function close() { panel.classList.remove('open'); fab.style.display = ''; }
    fab.addEventListener('click', open);
    panel.querySelector('.bmc-close').addEventListener('click', close);
    panel.querySelector('.bmc-form-btn').addEventListener('click', function () { showForm({ message: '' }); });
    panel.querySelector('.bmc-new').addEventListener('click', function () {
      log = []; saveLog(); sessionId = randomId(); store('bm_chat_session', sessionId); renderLog(); chips.style.display = '';
    });
    panel.querySelector('.bmc-input').addEventListener('submit', function (ev) { ev.preventDefault(); send(input.value); });
    chips.addEventListener('click', function (ev) {
      var c = ev.target.closest('.bmc-chip'); if (!c) return;
      if (c.getAttribute('data-complaint')) showForm({}); else send(c.textContent);
    });
    document.addEventListener('click', function (ev) { var t = ev.target.closest('[data-bmc-open]'); if (t) { ev.preventDefault(); open(); } });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && panel.classList.contains('open')) close(); });
    window.BMCare.open = open;

    onModeChange = function () { if (titleSmall && mode === 'local') titleSmall.textContent = 'Demo mode · answers from the site\'s built-in knowledge'; };
    api('/care/info').then(function (info) {
      if (info && Array.isArray(info.categories) && info.categories.length) CATS = info.categories.map(function (c) { return [c.key, c.label]; });
      if (titleSmall && info) titleSmall.textContent = info.offline ? 'Demo mode · answers from the site\'s built-in knowledge' : (info.aiEnabled ? 'AI assistant · answers from the Bouesti site' : 'Ask about prices, delivery, orders');
    }).catch(function () { /* the widget still opens */ });
  }

  window.BMCare = { open: function () {}, mountComplaintForm: function (host) { host.innerHTML = ''; host.appendChild(buildComplaintForm({})); }, mountTracker: function (host) { host.innerHTML = ''; host.appendChild(buildTracker()); } };

  function init() {
    build();
    document.querySelectorAll('[data-bmc="complaint-form"]').forEach(function (h) { window.BMCare.mountComplaintForm(h); });
    document.querySelectorAll('[data-bmc="tracker"]').forEach(function (h) { window.BMCare.mountTracker(h); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
