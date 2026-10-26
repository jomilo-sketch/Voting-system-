// bm-api.js — tiny client for the Bouesti server.
// Add this line to index.html, login.html and admin.html BEFORE the page's own script:
//   <script src="bm-api.js"></script>
// Then call window.BM_API from login.js, app.js and admin.js (examples below).

(function () {
  var TOKEN_KEY = 'bm_token';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* storage blocked — ignore */ }
  }

  // Core request helper. Resolves with parsed JSON, rejects with an Error whose message
  // is the server's friendly error text.
  function request(method, url, body) {
    var headers = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    return fetch(url, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error(data.error || 'Request failed');
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  }

  function qs(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (key) {
      if (params[key] !== undefined && params[key] !== '') {
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
      }
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  window.BM_API = {
    getToken: getToken,
    request: request,

    // ---- auth (login.html / admin.html) ----
    login: function (email, password, remember) {
      return request('POST', '/api/auth/login', { email: email, password: password, remember: !!remember })
        .then(function (data) { setToken(data.token); return data.user; });
    },
    signup: function (fields) {
      // fields: { name, email, password, phone?, lga?, address? }
      // From the admin page add: adminPanel: true, role: 'admin' | 'manager' | 'staff'
      return request('POST', '/api/auth/signup', fields).then(function (data) {
        if (data.token) setToken(data.token);
        return data;
      });
    },
    logout: function () {
      return request('POST', '/api/auth/logout').then(function () { setToken(''); });
    },
    me: function () { return request('GET', '/api/auth/me').then(function (d) { return d.user; }); },
    changePassword: function (currentPassword, newPassword) {
      return request('POST', '/api/auth/change-password', { currentPassword: currentPassword, newPassword: newPassword });
    },
    forgotPassword: function (email) { return request('POST', '/api/auth/forgot', { email: email }); },

    // ---- storefront (index.html) ----
    config: function () { return request('GET', '/api/config'); },
    products: function (params) { return request('GET', '/api/products' + qs(params)).then(function (d) { return d.items; }); },
    placeOrder: function (order) {
      // order: { items: [{ productId, qty }], lga, address, phone, paymentRef }
      return request('POST', '/api/orders', order).then(function (d) { return d.order; });
    },
    myOrders: function () { return request('GET', '/api/orders/mine').then(function (d) { return d.items; }); },
    trackVisit: function () { return request('POST', '/api/visit'); },

    // ---- admin dashboard (admin.html) ----
    stats: function () { return request('GET', '/api/admin/stats'); },
    users: function (params) { return request('GET', '/api/admin/users' + qs(params)); },
    saveUser: function (id, fields) {
      return id ? request('PUT', '/api/admin/users/' + id, fields) : request('POST', '/api/admin/users', fields);
    },
    deleteUser: function (id) { return request('DELETE', '/api/admin/users/' + id); },
    adminProducts: function (params) { return request('GET', '/api/admin/products' + qs(params)).then(function (d) { return d.items; }); },
    saveProduct: function (id, fields) {
      return id ? request('PUT', '/api/admin/products/' + id, fields) : request('POST', '/api/admin/products', fields);
    },
    deleteProduct: function (id) { return request('DELETE', '/api/admin/products/' + id); },
    banners: function () { return request('GET', '/api/admin/banners').then(function (d) { return d.items; }); },
    addBanner: function (title, subtitle) { return request('POST', '/api/admin/banners', { title: title, subtitle: subtitle }); },
    deleteBanner: function (id) { return request('DELETE', '/api/admin/banners/' + id); },
    orders: function (params) { return request('GET', '/api/admin/orders' + qs(params)); },
    setOrderStatus: function (id, status) { return request('PATCH', '/api/admin/orders/' + id, { status: status }); },
    notifications: function () { return request('GET', '/api/admin/notifications').then(function (d) { return d.items; }); },
    sendNotification: function (type, title, message) {
      return request('POST', '/api/admin/notifications', { type: type, title: title, message: message });
    },
    settings: function () { return request('GET', '/api/admin/settings').then(function (d) { return d.settings; }); },
    saveSettings: function (fields) { return request('PUT', '/api/admin/settings', fields); },
    backup: function () { return request('POST', '/api/admin/backup'); },
    logs: function (params) { return request('GET', '/api/admin/logs' + qs(params)); },
    loginHistory: function () { return request('GET', '/api/auth/login-history').then(function (d) { return d.items; }); },

    // Live updates (replaces Socket.IO). handlers: { order: fn, 'order-status': fn, notification: fn }
    listen: function (handlers) {
      if (!window.EventSource) return null;
      var source = new EventSource('/api/events?token=' + encodeURIComponent(getToken()));
      Object.keys(handlers || {}).forEach(function (name) {
        source.addEventListener(name, function (event) {
          var data = {};
          try { data = JSON.parse(event.data); } catch (e) { /* ignore */ }
          handlers[name](data);
        });
      });
      return source;
    }
  };
})();
