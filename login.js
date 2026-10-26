/* ============================================================
   BOUESTI MARKETPLACE — login.js
   Dedicated login / sign-up page (Jumia-style: its own page,
   not a popup). Uses the exact same localStorage keys as the
   storefront (app.js) so a session created here carries over.
   ============================================================ */

'use strict';

const $ = id => document.getElementById(id);

let authTab = 'login'; // 'login' | 'signup'

/* ── helpers ─────────────────────────────────────────────────────── */
function esc(s){
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

let toastTimer;
function showToast(msg, type='success'){
  const t = $('toast');
  const dot = t.querySelector('.dot');
  $('toastMsg').textContent = msg;
  dot.style.background = type === 'error' ? 'var(--danger)' : 'var(--mint)';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

function animateShake(el){
  el.style.animation = 'none'; el.offsetHeight;
  el.style.animation = 'shake 0.4s ease';
  el.addEventListener('animationend', () => { el.style.animation = ''; }, { once:true });
}

/* ── session storage (same keys as the storefront) ──────────────── */
function saveSession(user){ localStorage.setItem('bm_session', JSON.stringify(user)); }
function getUsers(){
  try { return JSON.parse(localStorage.getItem('bm_users') || '[]'); } catch { return []; }
}
function saveUsers(users){ localStorage.setItem('bm_users', JSON.stringify(users)); }

/* ── theme toggle (shared bm_theme key with the storefront) ─────── */
function toggleTheme(){
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  try { localStorage.setItem('bm_theme', next); } catch {}
}

/* ── tabs + form rendering ───────────────────────────────────────── */
function switchAuthTab(tab){
  authTab = tab;
  $('tabLogin').classList.toggle('active', tab === 'login');
  $('tabSignup').classList.toggle('active', tab === 'signup');
  $('formTitle').textContent = tab === 'login' ? 'Welcome back' : 'Create your account';
  $('formSub').textContent = tab === 'login'
    ? 'Log in to continue to your Bouesti account.'
    : 'Join Bouesti to start ordering fresh produce and livestock.';
  renderForm();
}

function renderForm(){
  const body = $('formBody');
  if(authTab === 'login'){
    body.innerHTML = `
      <div class="field">
        <label for="li-email">Email address</label>
        <input id="li-email" type="email" required placeholder="you@example.com" autocomplete="email">
      </div>
      <div class="field">
        <label for="li-pass">Password</label>
        <input id="li-pass" type="password" required placeholder="••••••••" autocomplete="current-password">
        <div class="field-err" id="li-err">Incorrect email or password.</div>
        <div style="text-align:right;margin-top:6px;"><a href="#" id="goForgot" style="font-size:12.5px;color:var(--mint);">Forgot password?</a></div>
      </div>
      <button type="button" class="btn-auth" id="loginSubmit">Log in to Bouesti</button>
      <div class="demo-note">Demo: register any email + password via Sign up, then log in immediately.</div>
      <div class="am-switch">New to Bouesti? <a href="#" id="goSignup">Create an account</a></div>
    `;
    $('loginSubmit').addEventListener('click', handleLogin);
    $('li-pass').addEventListener('keydown', e => { if(e.key==='Enter') handleLogin(); });
    $('goSignup').addEventListener('click', e => { e.preventDefault(); switchAuthTab('signup'); });
    // Forgot password: a 4-digit code is sent to the email or phone number on the account.
    $('goForgot').addEventListener('click', e => {
      e.preventDefault();
      BMRecovery.open({
        identifier: $('li-email').value.trim(),
        onDone: email => {
          $('li-email').value = email || '';
          $('li-pass').value = '';
          $('li-pass').focus();
          showToast('Password changed. Log in with your new password.');
        }
      });
    });
    $('li-email').focus();
  } else {
    body.innerHTML = `
      <div class="field-row">
        <div class="field">
          <label for="su-fname">First name</label>
          <input id="su-fname" type="text" required placeholder="Ngozi" autocomplete="given-name">
        </div>
        <div class="field">
          <label for="su-lname">Last name</label>
          <input id="su-lname" type="text" required placeholder="Adeyemi" autocomplete="family-name">
        </div>
      </div>
      <div class="field">
        <label for="su-email">Email address</label>
        <input id="su-email" type="email" required placeholder="you@example.com" autocomplete="email">
        <div class="field-err" id="su-err-email"></div>
      </div>
      <div class="field">
        <label for="su-phone">Phone number</label>
        <input id="su-phone" type="tel" required placeholder="08012345678" autocomplete="tel">
      </div>
      <div class="field">
        <label for="su-pass">Password <span class="field-help">(at least 6 characters)</span></label>
        <input id="su-pass" type="password" required minlength="6" placeholder="Choose a password" autocomplete="new-password">
        <div class="field-err" id="su-err-pass"></div>
      </div>
      <button type="button" class="btn-auth" id="signupSubmit">Create my account</button>
      <div class="am-switch">Already have an account? <a href="#" id="goLogin">Log in</a></div>
    `;
    $('signupSubmit').addEventListener('click', handleSignup);
    $('goLogin').addEventListener('click', e => { e.preventDefault(); switchAuthTab('login'); });
    $('su-fname').focus();
  }
}

/* ── where to send the visitor after a successful sign-in ───────── */
function goBackAfterAuth(){
  let dest = 'index.html';
  try {
    dest = sessionStorage.getItem('bm_auth_return') || dest;
    sessionStorage.removeItem('bm_auth_return');
  } catch {}
  location.href = dest;
}

/* ── handlers ─────────────────────────────────────────────────────── */

// Talks to the server (server.js). Returns { offline: true } when no server answers, so the
// old browser-only accounts below still work if this page is opened without the server.
async function serverPost(path, body){
  try {
    const res = await fetch('/api' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if(res.status === 404 || res.status === 405) return { offline: true };
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch { return { offline: true }; }
}

function finishAuth(data, welcome){
  saveSession({ name: data.user.name, email: data.user.email, phone: data.user.phone, role: data.user.role });
  try { localStorage.setItem('bm_token', data.token); } catch {}
  showToast(welcome);
  goBackAfterAuth();
}

async function handleLogin(){
  const email = $('li-email').value.trim().toLowerCase();
  const pass  = $('li-pass').value;
  const errEl = $('li-err');

  let result = await serverPost('/auth/login', { email, password: pass });
  if(result.offline) return handleLoginLocal();

  // Account made before the server existed (browser-only)? Move it to the server once.
  if(!result.ok && result.status === 401){
    const old = getUsers().find(u => u.email === email && u.password === pass);
    if(old && pass.length >= 6){
      const moved = await serverPost('/auth/signup', { name: old.name, email, phone: old.phone, password: pass });
      if(moved.ok) result = moved;
    }
  }
  if(!result.ok){
    errEl.textContent = result.data.error || 'Incorrect email or password.';
    errEl.style.display = 'block';
    animateShake($('li-pass'));
    return;
  }
  errEl.style.display = 'none';
  finishAuth(result.data, `Welcome back, ${result.data.user.name.split(' ')[0]}! 🌿`);
}

async function handleSignup(){
  const fname = $('su-fname').value.trim();
  const lname = $('su-lname').value.trim();
  const email = $('su-email').value.trim().toLowerCase();
  const phone = $('su-phone').value.trim();
  const pass  = $('su-pass').value;
  const errEmail = $('su-err-email');
  const errPass  = $('su-err-pass');
  errEmail.style.display = 'none';
  errPass.style.display  = 'none';

  if(!fname || !lname){ showToast('Please enter your full name', 'error'); return; }
  if(!email || !/\S+@\S+\.\S+/.test(email)){
    errEmail.textContent = 'Please enter a valid email address.';
    errEmail.style.display = 'block';
    animateShake($('su-email'));
    return;
  }
  if(pass.length < 6){
    errPass.textContent = 'Password must be at least 6 characters.';
    errPass.style.display = 'block';
    animateShake($('su-pass'));
    return;
  }

  const result = await serverPost('/auth/signup', { name: `${fname} ${lname}`, email, phone, password: pass });
  if(result.offline) return handleSignupLocal(fname, lname, email, phone, pass);
  if(!result.ok){
    // One email = one account: the server answers 409 when the email is already used.
    errEmail.textContent = result.data.error || 'Could not create the account.';
    errEmail.style.display = 'block';
    animateShake($('su-email'));
    return;
  }
  finishAuth(result.data, `Account created! Welcome, ${fname}! 🎉`);
}

/* ── browser-only fallback (no server running) ──────────────────────── */
function handleLoginLocal(){
  const email = $('li-email').value.trim().toLowerCase();
  const pass  = $('li-pass').value;
  const match = getUsers().find(u => u.email === email && u.password === pass);
  const errEl = $('li-err');
  if(!match){
    errEl.style.display = 'block';
    animateShake($('li-pass'));
    return;
  }
  errEl.style.display = 'none';
  saveSession({ name: match.name, email: match.email, phone: match.phone });
  showToast(`Welcome back, ${match.name.split(' ')[0]}! 🌿`);
  goBackAfterAuth();
}

function handleSignupLocal(fname, lname, email, phone, pass){
  const errEmail = $('su-err-email');
  const users = getUsers();
  if(users.some(u => u.email === email)){
    errEmail.textContent = 'An account with this email already exists.';
    errEmail.style.display = 'block';
    animateShake($('su-email'));
    return;
  }
  const user = { name: `${fname} ${lname}`, email, phone, password: pass };
  users.push(user);
  saveUsers(users);
  saveSession({ name: user.name, email: user.email, phone: user.phone });
  showToast(`Account created! Welcome, ${fname}! 🎉`);
  goBackAfterAuth();
}

/* ── init ─────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  $('themeBtn')?.addEventListener('click', toggleTheme);
  renderForm();

  document.addEventListener('keydown', e => {
    if(e.key === 'Enter' && authTab === 'signup' && document.activeElement?.closest('#formBody')){
      handleSignup();
    }
  });

  // If already signed in, no need to be here — send them straight back.
  try {
    const s = localStorage.getItem('bm_session');
    if(s) goBackAfterAuth();
  } catch {}
});

window.switchAuthTab = switchAuthTab;