// recovery.js — the "Forgot password?" window used by BOTH login screens (storefront and admin dashboard).
//
//   Step 1  enter your email or phone number        -> the server sends a 4-digit code
//   Step 2  type the 4-digit code                    -> the server checks it
//   Step 3  choose a new password                    -> done, go back and log in
//
// Use:  BMRecovery.open({ onDone: function (email) { ... } });

(function () {
  'use strict';

  var API = '/api/auth/forgot';
  var CSS = '' +
    '.bmr-back{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:100000;padding:14px}' +
    '.bmr-card{width:100%;max-width:400px;max-height:94vh;overflow:auto;border-radius:16px;padding:22px 22px 20px;font-family:inherit;' +
      'background:var(--dark-2,#0d2830);color:var(--text,#e8f8f5);border:1px solid var(--line,rgba(2,245,161,.2));box-shadow:0 20px 60px rgba(0,0,0,.5)}' +
    'html[data-theme="light"] .bmr-card{background:#fff;color:#12201a;border-color:#d9dfdb}' +
    '.bmr-card h3{margin:0 0 6px;font-size:20px}' +
    '.bmr-card p{margin:0 0 14px;font-size:14px;line-height:1.55;opacity:.8}' +
    '.bmr-card label{display:block;font-size:12.5px;margin:12px 0 5px;opacity:.75}' +
    '.bmr-card input[type=text],.bmr-card input[type=password],.bmr-card input[type=tel]{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;font:inherit;' +
      'border:1px solid var(--line,#234a56);background:var(--dark-3,#122f38);color:inherit;outline:none}' +
    'html[data-theme="light"] .bmr-card input{background:#f4f7f5;border-color:#cfd8d3}' +
    '.bmr-card input:focus{border-color:var(--mint,#02f5a1)}' +
    '.bmr-digits{display:flex;gap:10px;justify-content:center;margin:10px 0 6px}' +
    '.bmr-digits input{width:56px !important;height:62px;text-align:center;font-size:28px !important;font-weight:700;padding:0 !important;letter-spacing:0}' +
    '.bmr-btn{width:100%;margin-top:16px;padding:13px;border:0;border-radius:10px;font:inherit;font-weight:700;cursor:pointer;background:var(--mint,#02f5a1);color:#07191e}' +
    '.bmr-btn[disabled]{opacity:.55;cursor:default}' +
    '.bmr-link{background:none;border:0;color:var(--mint,#02f5a1);font:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:0}' +
    '.bmr-link[disabled]{opacity:.5;cursor:default}' +
    '.bmr-row{display:flex;justify-content:space-between;align-items:center;margin-top:12px}' +
    '.bmr-err{color:#ff4d6d;font-size:13px;min-height:18px;margin-top:8px}' +
    '.bmr-ok{color:var(--mint,#02f5a1)}' +
    '.bmr-x{float:right;background:none;border:0;color:inherit;font-size:24px;line-height:1;cursor:pointer;opacity:.7}' +
    '.bmr-pw{position:relative}.bmr-pw button{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;color:inherit;cursor:pointer;opacity:.7;font-size:15px}' +
    '.bmr-done{text-align:center}.bmr-done .tick{width:60px;height:60px;border-radius:50%;margin:6px auto 12px;display:flex;align-items:center;justify-content:center;font-size:30px;background:rgba(2,245,161,.15);color:var(--mint,#02f5a1)}';

  var state = null;

  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Talks to the server. { offline: true } means no server answered (the pages were opened without server.js).
  function post(path, body) {
    return fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) {
        if (res.status === 404 || res.status === 405) return { offline: true };
        return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
      })
      .catch(function () { return { offline: true }; });
  }

  var OFFLINE_TEXT = 'Password recovery needs the Bouesti server to be running (node server.js). Please start it and try again.';

  function close() {
    if (state && state.timer) clearInterval(state.timer);
    if (state && state.root) state.root.remove();
    state = null;
  }

  function shell(inner) {
    state.card.innerHTML = '<button type="button" class="bmr-x" aria-label="Close">×</button>' + inner;
    state.card.querySelector('.bmr-x').addEventListener('click', close);
  }

  function showError(text) { var box = state.card.querySelector('.bmr-err'); if (box) { box.className = 'bmr-err'; box.textContent = text || ''; } }

  // ---------- helpers for the countdowns ----------
  function clock(seconds) {
    seconds = Math.max(0, Math.ceil(seconds));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  function words(minutes) { return minutes + ' minute' + (minutes === 1 ? '' : 's'); }

  // ---------- step 1: who are you? ----------
  function stepIdentify(prefill) {
    shell('<h3>Forgot your password?</h3>' +
      '<p>Enter the email address or phone number on your account. We will send you a 4-digit code to confirm it is you, then you can choose a new password.</p>' +
      '<label for="bmr-id">Email or phone number</label>' +
      '<input id="bmr-id" type="text" inputmode="email" autocomplete="username" placeholder="you@example.com or 0803 123 4567" value="' + esc(prefill || '') + '">' +
      '<div class="bmr-err"></div>' +
      '<button type="button" class="bmr-btn" id="bmr-send">Send code</button>' +
      '<div class="bmr-row" style="justify-content:center"><button type="button" class="bmr-link" id="bmr-have">I already have a code</button></div>');
    var input = state.card.querySelector('#bmr-id');
    input.focus();
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
    state.card.querySelector('#bmr-send').addEventListener('click', send);
    state.card.querySelector('#bmr-have').addEventListener('click', function () {
      var id = input.value.trim();
      if (!id) { showError('Type your email or phone number first.'); return; }
      state.identifier = id; state.sentTo = id; state.channel = /@/.test(id) ? 'email' : 'phone';
      state.expiresAt = 0;                       // we do not know when that earlier code runs out
      state.resendAt = Date.now();
      stepCode();
    });

    function send() { requestCode(input.value.trim(), state.card.querySelector('#bmr-send')); }
  }

  // Asks the server for a code. A new code can only be requested after the waiting time (2 minutes).
  function requestCode(identifier, button) {
    if (!identifier) { showError('Enter your email address or phone number.'); return Promise.resolve(false); }
    if (button) button.disabled = true;
    return post('/request', { identifier: identifier }).then(function (r) {
      if (button) button.disabled = false;
      if (r.offline) { showError(OFFLINE_TEXT); return false; }
      if (r.status === 429) {                     // asked too soon
        if (r.data.retryAfter) state.resendAt = Date.now() + r.data.retryAfter * 1000;
        showError(r.data.error || 'Please wait before asking for another code.');
        return false;
      }
      if (!r.ok) { showError(r.data.error || 'Something went wrong. Please try again.'); return false; }
      state.identifier = identifier;
      state.sentTo = r.data.sentTo;
      state.channel = r.data.channel;
      state.minutes = r.data.expiresInMinutes || 2;
      state.expiresAt = Date.now() + state.minutes * 60000;
      state.resendAt = Date.now() + (r.data.resendSeconds || 120) * 1000;
      state.devCode = r.data.devCode || null;
      stepCode();
      return true;
    });
  }

  // ---------- step 2: the 4-digit code ----------
  function stepCode() {
    var where = state.channel === 'phone' ? 'phone number' : 'email';
    var intro = state.expiresAt
      ? 'If an account matches, we sent a code to your ' + where + ' <b>' + esc(state.sentTo) + '</b>. It works for ' + words(state.minutes) + '.'
      : 'Type the 4-digit code you received on your ' + where + '.';
    shell('<h3>Enter the 4-digit code</h3>' +
      '<p>' + intro + '</p>' +
      '<div class="bmr-digits">' +
        [0, 1, 2, 3].map(function (i) { return '<input type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code" data-i="' + i + '" aria-label="Digit ' + (i + 1) + '">'; }).join('') +
      '</div>' +
      '<div class="bmr-timer" id="bmr-life" style="text-align:center;font-size:13px;font-weight:600;min-height:18px"></div>' +
      (state.devCode ? '<p class="bmr-ok" style="text-align:center">Testing mode — your code is <b>' + esc(state.devCode) + '</b></p>' : '') +
      '<div class="bmr-err"></div>' +
      '<button type="button" class="bmr-btn" id="bmr-verify" disabled>Verify code</button>' +
      '<div class="bmr-row"><button type="button" class="bmr-link" id="bmr-resend" disabled>Resend code</button>' +
      '<button type="button" class="bmr-link" id="bmr-change">Use a different email or phone</button></div>');

    var boxes = [].slice.call(state.card.querySelectorAll('.bmr-digits input'));
    var verifyBtn = state.card.querySelector('#bmr-verify');
    var life = state.card.querySelector('#bmr-life');
    var resend = state.card.querySelector('#bmr-resend');
    boxes[0].focus();

    function value() { return boxes.map(function (b) { return b.value; }).join(''); }
    function expired() { return !!state.expiresAt && Date.now() >= state.expiresAt; }
    function refresh() { verifyBtn.disabled = expired() || !/^\d{4}$/.test(value()); }

    boxes.forEach(function (box, i) {
      box.addEventListener('input', function () {
        box.value = box.value.replace(/\D/g, '').slice(-1);
        if (box.value && boxes[i + 1]) boxes[i + 1].focus();
        refresh();
        if (/^\d{4}$/.test(value())) verify();
      });
      box.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !box.value && boxes[i - 1]) { boxes[i - 1].focus(); boxes[i - 1].value = ''; refresh(); }
        if (e.key === 'Enter') verify();
      });
      box.addEventListener('paste', function (e) {            // paste "1234" in one go
        var digits = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '').slice(0, 4);
        if (!digits) return;
        e.preventDefault();
        boxes.forEach(function (b, k) { b.value = digits[k] || ''; });
        (boxes[Math.min(digits.length, 3)]).focus();
        refresh();
        if (digits.length === 4) verify();
      });
    });

    var busy = false;
    function verify() {
      if (busy || expired() || !/^\d{4}$/.test(value())) return;
      busy = true; verifyBtn.disabled = true; showError('');
      post('/verify', { identifier: state.identifier, code: value() }).then(function (r) {
        busy = false;
        if (r.offline) { showError(OFFLINE_TEXT); refresh(); return; }
        if (!r.ok) {
          showError(r.data.error || 'That code is not right.');
          boxes.forEach(function (b) { b.value = ''; });
          boxes[0].focus();
          refresh();
          return;
        }
        state.resetToken = r.data.resetToken;
        state.staff = !!r.data.staff;
        stepPassword();
      });
    }
    verifyBtn.addEventListener('click', verify);

    // One clock drives both lines: "code works for ..." and "resend in ...".
    if (state.timer) clearInterval(state.timer);
    var wasExpired = false;
    function tick() {
      var now = Date.now();
      if (state.expiresAt) {
        if (now < state.expiresAt) {
          life.className = 'bmr-timer'; life.style.color = '';
          life.textContent = 'Code expires in ' + clock((state.expiresAt - now) / 1000);
        } else {
          life.style.color = '#ff4d6d';
          life.textContent = 'This code has expired. Ask for a new one.';
          if (!wasExpired) { wasExpired = true; boxes.forEach(function (b) { b.value = ''; b.disabled = true; }); refresh(); }
        }
      } else { life.textContent = ''; }
      var left = (state.resendAt - now) / 1000;
      resend.textContent = left > 0 ? 'Resend code in ' + clock(left) : 'Resend code';
      resend.disabled = left > 0;
    }
    tick();
    state.timer = setInterval(tick, 1000);

    resend.addEventListener('click', function () {
      resend.disabled = true;
      requestCode(state.identifier, null).then(function (sent) {
        if (!sent && state) { tick(); }          // too soon: the message and the countdown are already showing
      });
    });
    state.card.querySelector('#bmr-change').addEventListener('click', function () { clearInterval(state.timer); stepIdentify(state.identifier); });
  }

  // ---------- step 3: new password ----------
  function stepPassword() {
    if (state.timer) clearInterval(state.timer);
    var min = state.staff ? 8 : 6;
    shell('<h3>Choose a new password</h3>' +
      '<p>Your code is correct. Pick a new password of at least ' + min + ' characters.</p>' +
      '<label for="bmr-pw1">New password</label>' +
      '<div class="bmr-pw"><input id="bmr-pw1" type="password" autocomplete="new-password"><button type="button" id="bmr-eye" aria-label="Show password">👁</button></div>' +
      '<label for="bmr-pw2">Type it again</label>' +
      '<input id="bmr-pw2" type="password" autocomplete="new-password">' +
      '<div class="bmr-err"></div>' +
      '<button type="button" class="bmr-btn" id="bmr-save">Save new password</button>');
    var p1 = state.card.querySelector('#bmr-pw1');
    var p2 = state.card.querySelector('#bmr-pw2');
    var save = state.card.querySelector('#bmr-save');
    p1.focus();
    state.card.querySelector('#bmr-eye').addEventListener('click', function () {
      var type = p1.type === 'password' ? 'text' : 'password';
      p1.type = type; p2.type = type;
    });
    p2.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    save.addEventListener('click', submit);

    function submit() {
      if (p1.value.length < min) { showError('Password must be at least ' + min + ' characters.'); return; }
      if (p1.value !== p2.value) { showError('The two passwords do not match.'); return; }
      save.disabled = true;
      post('/reset', { resetToken: state.resetToken, newPassword: p1.value }).then(function (r) {
        save.disabled = false;
        if (r.offline) { showError(OFFLINE_TEXT); return; }
        if (!r.ok) { showError(r.data.error || 'Could not save the password.'); return; }
        stepDone(r.data.email);
      });
    }
  }

  // ---------- step 4: finished ----------
  function stepDone(email) {
    shell('<div class="bmr-done"><div class="tick">✓</div><h3>Password changed</h3>' +
      '<p>You can now log in with your new password. For your safety you were signed out of every device.</p>' +
      '<button type="button" class="bmr-btn" id="bmr-finish">Back to log in</button></div>');
    var onDone = state.onDone;
    state.card.querySelector('#bmr-finish').addEventListener('click', function () {
      close();
      if (onDone) onDone(email);
    });
  }

  function open(options) {
    options = options || {};
    if (state) close();
    if (!document.getElementById('bmr-css')) {
      var style = document.createElement('style');
      style.id = 'bmr-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    var root = el('<div class="bmr-back"><div class="bmr-card" role="dialog" aria-modal="true"></div></div>');
    document.body.appendChild(root);
    state = { root: root, card: root.firstChild, onDone: options.onDone, timer: null };
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    document.addEventListener('keydown', function onKey(e) {
      if (!state) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Escape') close();
    });
    stepIdentify(options.identifier);
  }

  window.BMRecovery = { open: open, close: close };
})();
