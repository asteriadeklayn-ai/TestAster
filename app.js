(() => {
'use strict';

// ======================= yordamchilar =======================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { token: localStorage.getItem('tp_token'), user: null, config: { perTest: 25, minutes: 40 }, run: null, cleanup: null, installEvt: null };
const fmtDate = (t) => (t ? new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtPct = (v) => (Math.round(v * 10) / 10) + '%';
const LET = ['A', 'B', 'C', 'D'];
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const installBtn = (cls) => (isStandalone() ? '' : `<button type="button" class="btn ${cls}" data-install>Ilovani o'rnatish</button>`);
const installBanner = () => (isStandalone() ? '' : `<div class="banner" style="border-color:var(--line);background:var(--surface)"><div><b>Ilovani o'rnating</b><div class="muted">Telefon yoki kompyuterga alohida ilova sifatida</div></div>${installBtn('primary')}</div>`);
const genPw = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const a = new Uint32Array(9); crypto.getRandomValues(a); return [...a].map((x) => c[x % c.length]).join(''); };

const ICON = {
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  test: '<path d="M9 4h6l1 2h3v14H5V6h3z"/><path d="M9 13l2 2 4-4"/>',
  rank: '<path d="M5 20V11M12 20V4M19 20v-7"/>',
  miss: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.3-5 6.5-5s5.7 1.5 6.5 5"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 15.5c2 .6 3.2 2.2 3.5 4.5"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

async function api(path, { method = 'GET', body, form, raw } = {}) {
  const headers = {};
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api' + path, { method, headers, body: payload }); }
  catch (e) { throw new Error("Server bilan aloqa yo'q. Internetni tekshiring"); }
  if (res.status === 401 && path !== '/login') { logout(); throw new Error('Qayta kiring'); }
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Xatolik yuz berdi');
  return data;
}

// ---------- oynalar ----------
function dialog(html) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.innerHTML = html;
    document.body.appendChild(d);
    d.addEventListener('close', () => { const v = d.returnValue; d.remove(); resolve(v); });
    d.showModal();
  });
}
async function confirmBox({ title, text, ok = 'Tasdiqlash', danger = false }) {
  const v = await dialog(`<form method="dialog"><h3>${esc(title)}</h3><p class="muted" style="margin:0">${esc(text)}</p>
    <div class="actions"><button class="btn ghost" value="no">Bekor qilish</button><button class="btn ${danger ? 'danger' : 'primary'}" value="yes" autofocus>${esc(ok)}</button></div></form>`);
  return v === 'yes';
}
async function infoBox(title, html) {
  await dialog(`<form method="dialog"><h3>${esc(title)}</h3><div>${html}</div><div class="actions"><button class="btn primary" value="ok">Yopish</button></div></form>`);
}
function formBox({ title, fields, ok = 'Saqlash' }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.innerHTML = `<form><h3>${esc(title)}</h3>${fields.map((f) => `
      <label class="field"><span>${esc(f.label)}</span><input class="input" name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" autocomplete="off" ${f.required === false ? '' : 'required'}></label>`).join('')}
      <div class="err" id="fe"></div>
      <div class="actions"><button type="button" class="btn ghost" data-x>Bekor qilish</button><button class="btn primary">${esc(ok)}</button></div></form>`;
    document.body.appendChild(d);
    const done = (v) => { d.close(); d.remove(); resolve(v); };
    $('[data-x]', d).onclick = () => done(null);
    d.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    $('form', d).onsubmit = (e) => {
      e.preventDefault();
      const out = {};
      fields.forEach((f) => { out[f.name] = $(`[name=${f.name}]`, d).value.trim(); });
      done(out);
    };
    d.showModal();
  });
}

async function installApp() {
  if (S.installEvt) {
    S.installEvt.prompt();
    const c = await S.installEvt.userChoice;
    S.installEvt = null;
    if (c.outcome === 'accepted') toast("Ilova o'rnatilmoqda", 'ok');
    return;
  }
  const ua = navigator.userAgent;
  const steps = /iphone|ipad|ipod/i.test(ua) ? "Safari'da «Ulashish» tugmasi → «Bosh ekranga qo'shish»."
    : /android/i.test(ua) ? "Chrome menyusi ⋮ → «Ilovani o'rnatish» (yoki «Bosh ekranga qo'shish»)."
    : "Chrome yoki Edge'da manzil qatoridagi o'rnatish belgisini bosing yoki menyu → «Ilovani o'rnatish». Firefox bu imkoniyatni qo'llamaydi.";
  await infoBox("Ilovani o'rnatish", `<p class="muted" style="margin-top:0">${steps}</p><p class="muted">Agar ilova bu qurilmaga allaqachon o'rnatilgan bo'lsa, brauzer uni qayta taklif qilmaydi. Uni Start menyusi yoki ish stolidagi yorliqdan oching.</p><p class="muted" style="margin-bottom:0">O'rnatish tugmasi chiqishi uchun sayt HTTPS manzilda (yoki localhost'da) ochilgan bo'lishi kerak.</p>`);
}
const bindInstall = (root) => $$('[data-install]', root).forEach((b) => (b.onclick = installApp));

// ======================= kirish =======================
function renderLogin() {
  if (S.cleanup) { S.cleanup(); S.cleanup = null; }
  $('#app').innerHTML = `
  <div class="login"><div class="login-card">
    <svg class="login-mark" viewBox="0 0 52 52" fill="none" stroke="#cfd8d2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="26" cy="26" r="22"/><path d="M17 27l6 6 12-13"/></svg>
    <h1>Test platformasi</h1>
    <p>Hisobingizga kiring</p>
    <form id="lf" autocomplete="on">
      <label class="field"><span>Login</span><input class="input" id="lg" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus></label>
      <label class="field"><span>Parol</span><div class="pw"><input class="input" id="pw" name="password" type="password" autocomplete="current-password" required><button type="button" class="toggle" id="tg">Ko'rsatish</button></div></label>
      <div class="err" id="le"></div>
      <button class="btn primary block" id="lb">Kirish</button>
    </form>
    <p class="note muted">Login va parolni administrator beradi.</p>
    <div style="margin-top:26px;padding-top:22px;border-top:1px solid #16191d">${installBtn('block')}</div>
  </div></div>`;
  bindInstall($('#app'));
  $('#tg').onclick = () => { const p = $('#pw'); const show = p.type === 'password'; p.type = show ? 'text' : 'password'; $('#tg').textContent = show ? 'Yashirish' : "Ko'rsatish"; };
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    $('#le').textContent = '';
    $('#lb').disabled = true;
    try {
      const r = await api('/login', { method: 'POST', body: { login: $('#lg').value, password: $('#pw').value } });
      S.token = r.token; localStorage.setItem('tp_token', r.token);
      S.user = r.user;
      const me = await api('/me'); S.config = me.config;
      location.hash = '#/';
      renderShell();
    } catch (err) { $('#le').textContent = err.message; $('#lb').disabled = false; }
  };
}

function logout() {
  S.token = null; S.user = null; S.run = null;
  localStorage.removeItem('tp_token');
  location.hash = '#/';
  renderLogin();
}

// ======================= qobiq va yo'naltirish =======================
function navItems() {
  return S.user.role === 'admin'
    ? [['', 'Boshqaruv', 'home'], ['users', 'Foydalanuvchilar', 'users'], ['subjects', 'Fanlar', 'book'], ['ranking', 'Reyting', 'rank'], ['profile', 'Profil', 'user']]
    : [['', 'Bosh sahifa', 'home'], ['test', 'Test yechish', 'test'], ['ranking', 'Reyting', 'rank'], ['mistakes', 'Xato javoblar', 'miss'], ['profile', 'Profil', 'user']];
}
function renderShell() {
  $('#app').innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="brand"><img src="/icons/icon-192.png" alt="">Test platformasi</div>
      <nav class="nav">${navItems().map(([h, t, i]) => `<a href="#/${h}" data-r="${h}">${icon(i)}<span>${t}</span></a>`).join('')}</nav>
      ${installBtn('sm install-btn')}
      <div class="who"><b>${esc(S.user.fullName)}</b><span class="muted">${S.user.role === 'admin' ? 'Administrator' : 'Foydalanuvchi'}</span></div>
    </aside>
    <main class="main" id="view"></main>
  </div>`;
  bindInstall($('.side'));
  route();
}

async function route() {
  if (!S.user) return renderLogin();
  if (!$('#view')) return renderShell();
  if (S.cleanup) { S.cleanup(); S.cleanup = null; }
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  const name = parts[0] || '';
  const arg = parts[1];
  $$('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === (name === 'result' ? (S.user.role === 'admin' ? 'users' : '') : name === 'run' ? 'test' : name)));
  const v = $('#view');
  v.innerHTML = '';
  window.scrollTo(0, 0);
  const admin = S.user.role === 'admin';
  const views = {
    '': admin ? viewAdminHome : viewHome,
    ranking: viewRanking, profile: viewProfile, result: viewResult,
    ...(admin ? { users: arg ? viewAdminUser : viewAdminUsers, subjects: arg ? viewAdminSubject : viewAdminSubjects }
      : { test: viewTest, run: viewRun, mistakes: viewMistakes }),
  };
  const fn = views[name];
  if (!fn) { location.hash = '#/'; return; }
  try { await fn(v, arg); } catch (e) { v.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', route);

// ======================= umumiy komponentlar =======================
function spark(vals) {
  if (vals.length < 2) return '<div class="empty" style="padding:22px">Grafik uchun kamida 2 ta test kerak</div>';
  const W = 300, H = 90, n = vals.length;
  const pts = vals.map((v, i) => [(i / (n - 1)) * W, H - 6 - (v / 100) * (H - 12)]);
  const line = pts.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Natijalar dinamikasi">
    <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="#20242a" stroke-dasharray="3 4"/>
    <polygon points="0,${H} ${line} ${W},${H}" fill="rgba(207,216,210,.08)"/>
    <polyline points="${line}" fill="none" stroke="#cfd8d2" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
const stat = (v, l) => `<div class="card stat"><div class="v num">${v}</div><div class="l">${l}</div></div>`;
const bar = (p) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`;
const head = (title, sub, extra = '') => `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${extra}</div>`;

function reviewList(items, { onlyWrong, who }) {
  const list = items.map((it, i) => ({ ...it, n: i + 1 })).filter((it) => !onlyWrong || it.chosen !== it.correct);
  if (!list.length) return `<div class="card empty">${onlyWrong ? "Xato javob yo'q. Barakalla!" : "Savollar yo'q"}</div>`;
  return `<div class="review">${list.map((it) => {
    const ok = it.chosen === it.correct;
    return `<div class="rev"><div class="qt"><span class="muted">${it.n}.</span> ${esc(it.text)}</div>
      ${ok ? '' : `<div class="ans bad"><small>${who}</small>${it.chosen === null ? 'Javob berilmagan' : esc(it.options[it.chosen])}</div>`}
      <div class="ans ok"><small>To'g'ri javob</small>${esc(it.options[it.correct])}</div></div>`;
  }).join('')}</div>`;
}
function attemptsTable(rows, { withUser } = {}) {
  if (!rows.length) return '<div class="card empty">Hali natijalar yo\'q</div>';
  return `<div class="card scroll" style="padding:6px"><table class="table"><thead><tr>${withUser ? '<th>Foydalanuvchi</th>' : ''}<th>Fan</th><th>Natija</th><th class="hide-m">Sana</th></tr></thead><tbody>
    ${rows.map((a) => `<tr class="click" data-att="${a.id}">${withUser ? `<td>${esc(a.userName)}</td>` : ''}<td>${esc(a.subjectName)}</td>
      <td class="num"><span class="pill ${a.percent >= 70 ? 'ok' : a.percent < 40 ? 'bad' : ''}">${fmtPct(a.percent)}</span> <span class="muted">${a.correct}/${a.total}</span></td>
      <td class="muted hide-m">${fmtDate(a.finishedAt)}</td></tr>`).join('')}</tbody></table></div>`;
}
const bindAttempts = (root) => $$('[data-att]', root).forEach((tr) => (tr.onclick = () => (location.hash = '#/result/' + tr.dataset.att)));

// ======================= foydalanuvchi: bosh sahifa =======================
async function viewHome(v) {
  const [st, act] = await Promise.all([api('/me/stats'), api('/tests/active')]);
  const first = S.user.fullName.split(' ')[0];
  v.innerHTML = head(`Salom, ${first}`, "O'zlashtirish ko'rsatkichlaringiz") +
    installBanner() + (act ? `<div class="banner"><div><b>Tugallanmagan test bor</b><div class="muted">${esc(act.subjectName)}</div></div><a class="btn primary" href="#/run">Davom ettirish</a></div>` : '') +
    `<div class="grid g4">${stat(st.tests, 'Yechilgan testlar')}${stat(st.tests ? fmtPct(st.avg) : '—', "O'rtacha natija")}${stat(st.tests ? fmtPct(st.best) : '—', 'Eng yaxshi natija')}${stat(st.rank ? `${st.rank}<span class="muted" style="font-size:1rem">/${st.participants}</span>` : '—', "Reytingdagi o'rin")}</div>
    <div class="section"><h3>Natijalar dinamikasi</h3><div class="card">${spark(st.history.map((h) => h.percent))}</div></div>
    <div class="section"><div class="row between" style="margin-bottom:12px"><h3>So'nggi testlar</h3><a class="btn sm" href="#/test">Test yechish</a></div>${attemptsTable(st.history.slice(-8).reverse())}</div>`;
  bindAttempts(v); bindInstall(v);
}

// ======================= foydalanuvchi: fan tanlash =======================
async function viewTest(v) {
  const [subs, act] = await Promise.all([api('/subjects'), api('/tests/active')]);
  v.innerHTML = head('Test yechish', `Har safar ${S.config.perTest} ta aralash savol, ${S.config.minutes} daqiqa vaqt`) +
    (act ? `<div class="banner"><div><b>Tugallanmagan test bor</b><div class="muted">${esc(act.subjectName)}</div></div><a class="btn primary" href="#/run">Davom ettirish</a></div>` : '') +
    (subs.length ? `<div class="list">${subs.map((s) => `<div class="item"><div class="t"><b>${esc(s.name)}</b><span class="muted">${s.questionCount} ta savol bazada</span></div>
      <button class="btn primary" data-s="${s.id}" ${s.questionCount ? '' : 'disabled'}>Boshlash</button></div>`).join('')}</div>` : '<div class="card empty">Hozircha fanlar qo\'shilmagan</div>');
  $$('[data-s]', v).forEach((b) => (b.onclick = async () => {
    const name = subs.find((s) => s.id === b.dataset.s).name;
    if (!act && !(await confirmBox({ title: name, text: `${S.config.perTest} ta savol, ${S.config.minutes} daqiqa. Vaqt boshlangach to'xtamaydi. Boshlaysizmi?`, ok: 'Boshlash' }))) return;
    b.disabled = true;
    try { S.run = await api('/tests/start', { method: 'POST', body: { subjectId: act ? act.subjectId : b.dataset.s } }); location.hash = '#/run'; }
    catch (e) { toast(e.message, 'bad'); b.disabled = false; }
  }));
}

// ======================= test jarayoni =======================
async function viewRun(v) {
  const att = S.run || (await api('/tests/active'));
  if (!att) { location.hash = '#/test'; return; }
  S.run = att;
  const offset = att.serverNow - Date.now();
  const answers = att.answers.slice();
  let idx = 0, finishing = false;

  v.innerHTML = `<div class="test-bar"><div class="muted hide-m" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(att.subjectName)}</div>
    <div class="progress"><i id="pg"></i></div><span class="muted num" id="cnt"></span><div class="timer" id="tm">--:--</div></div>
    <div id="qbox"></div><div class="qgrid" id="qg"></div>
    <div class="row" style="margin-top:26px"><button class="btn" id="fin">Testni yakunlash</button></div>`;

  const answered = () => answers.filter((a) => a !== null && a !== undefined).length;
  function draw() {
    const q = att.items[idx];
    $('#qbox').innerHTML = `<div class="muted" style="font-size:.86rem">${idx + 1}-savol</div><div class="q-text">${esc(q.text)}</div>
      <div class="opts">${q.options.map((o, i) => `<button class="opt ${answers[idx] === i ? 'sel' : ''}" data-i="${i}"><span class="k">${LET[i]}</span><span class="tx">${esc(o)}</span></button>`).join('')}</div>
      <div class="nav-row"><button class="btn" id="pv" ${idx === 0 ? 'disabled' : ''}>Oldingi</button>
      ${idx === att.items.length - 1 ? '<button class="btn primary" id="nx2">Yakunlash</button>' : '<button class="btn primary" id="nx">Keyingi</button>'}</div>`;
    $$('.opt', $('#qbox')).forEach((b) => (b.onclick = () => pick(Number(b.dataset.i))));
    $('#pv').onclick = () => go(idx - 1);
    if ($('#nx')) $('#nx').onclick = () => go(idx + 1);
    if ($('#nx2')) $('#nx2').onclick = () => finish(false);
    $('#qg').innerHTML = att.items.map((_, i) => `<button class="${i === idx ? 'cur' : ''} ${answers[i] !== null && answers[i] !== undefined ? 'done' : ''}" data-g="${i}">${i + 1}</button>`).join('');
    $$('[data-g]', $('#qg')).forEach((b) => (b.onclick = () => go(Number(b.dataset.g))));
    $('#cnt').textContent = `${answered()}/${att.items.length}`;
    $('#pg').style.width = (answered() / att.items.length) * 100 + '%';
  }
  function go(i) { if (i >= 0 && i < att.items.length) { idx = i; draw(); } }
  function pick(c) {
    answers[idx] = c;
    draw();
    api(`/tests/${att.id}/answer`, { method: 'POST', body: { index: idx, choice: c } }).catch(() => {});
  }
  async function finish(auto) {
    if (finishing) return;
    if (!auto) {
      const left = att.items.length - answered();
      if (!(await confirmBox({ title: 'Testni yakunlaysizmi?', text: left ? `${left} ta savolga javob berilmagan. Ular xato hisoblanadi.` : 'Barcha savollarga javob berilgan.', ok: 'Yakunlash' }))) return;
    }
    finishing = true;
    try {
      const r = await api(`/tests/${att.id}/finish`, { method: 'POST', body: { answers: answers.map((a) => (a === null || a === undefined ? -1 : a)) } });
      S.run = null;
      if (auto) toast('Vaqt tugadi. Test yakunlandi', 'ok');
      location.hash = '#/result/' + r.id;
    } catch (e) { toast(e.message, 'bad'); finishing = false; if (auto) setTimeout(() => finish(true), 3000); }
  }
  const tick = () => {
    const left = att.deadline - (Date.now() + offset);
    if (left <= 0) { $('#tm').textContent = '00:00'; finish(true); return; }
    const s = Math.ceil(left / 1000);
    $('#tm').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    $('#tm').className = 'timer' + (left < 60000 ? ' crit' : left < 300000 ? ' warn' : '');
  };
  const key = (e) => {
    if (e.target.closest('dialog')) return;
    const k = e.key.toLowerCase();
    if (['1', '2', '3', '4'].includes(k)) pick(Number(k) - 1);
    else if (['a', 'b', 'c', 'd'].includes(k)) pick('abcd'.indexOf(k));
    else if (k === 'arrowright') go(idx + 1);
    else if (k === 'arrowleft') go(idx - 1);
  };
  $('#fin').onclick = () => finish(false);
  document.addEventListener('keydown', key);
  const iv = setInterval(tick, 500);
  S.cleanup = () => { clearInterval(iv); document.removeEventListener('keydown', key); };
  draw(); tick();
}

// ======================= natija =======================
async function viewResult(v, id) {
  const d = await api('/attempts/' + id);
  const own = d.userId === S.user.id;
  const wrong = d.items.filter((it) => it.chosen !== it.correct).length;
  let tab = 'wrong';
  const paint = () => {
    $('#rv').innerHTML = reviewList(d.items, { onlyWrong: tab === 'wrong', who: own ? 'Sizning javobingiz' : 'Foydalanuvchi javobi' });
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
  };
  v.innerHTML = head(own ? 'Test natijasi' : `${d.userName} natijasi`, `${d.subjectName} · ${fmtDate(d.finishedAt)}`,
    `<div class="row">${own ? '<a class="btn" href="#/test">Yana test yechish</a>' : `<a class="btn" href="#/users/${d.userId}">Profilga qaytish</a>`}</div>`) +
    `<div class="card score"><div class="ring" style="--p:${d.percent}"><span class="num">${fmtPct(d.percent)}</span></div>
      <div><div style="font-size:1.2rem;font-weight:600" class="num">${d.correct} / ${d.total} to'g'ri</div>
      <div class="muted">${wrong} ta xato ${d.timedOut ? '· <span class="pill bad">vaqt tugadi</span>' : ''}</div></div></div>
    <div class="section"><div class="row between"><h3>${own ? 'Xato javoblar' : 'Javoblar tahlili'}</h3></div>
    <div class="tabs" id="tabs" style="margin-top:12px"><button data-t="wrong">Xato javoblar (${wrong})</button><button data-t="all">Barcha savollar</button></div><div id="rv"></div></div>`;
  $$('#tabs button').forEach((b) => (b.onclick = () => { tab = b.dataset.t; paint(); }));
  paint();
}

// ======================= xato javoblar oynasi =======================
async function viewMistakes(v) {
  const groups = await api('/mistakes');
  const subjects = [...new Set(groups.map((g) => g.subjectName))];
  const paint = (f) => {
    const list = groups.filter((g) => !f || g.subjectName === f);
    $('#mg').innerHTML = list.length ? list.map((g, i) => `<details class="group" ${i === 0 ? 'open' : ''}><summary><b>${esc(g.subjectName)}</b>
      <span class="pill bad">${g.wrong.length} ta xato</span><span class="pill">${fmtPct(g.percent)}</span><span class="muted sp" style="text-align:right">${fmtDate(g.finishedAt)}</span></summary>
      ${reviewList(g.wrong, { onlyWrong: false, who: 'Sizning javobingiz' })}</details>`).join('') : '<div class="card empty">Xato javoblar yo\'q</div>';
  };
  v.innerHTML = head('Xato javoblar', "Oxirgi testlaringizda xato qilgan savollar") +
    (groups.length ? `<div class="row" style="margin-bottom:16px"><select class="input" id="sf"><option value="">Barcha fanlar</option>${subjects.map((s) => `<option>${esc(s)}</option>`).join('')}</select></div>` : '') + '<div id="mg"></div>';
  if (groups.length) $('#sf').onchange = (e) => paint(e.target.value);
  paint('');
}

// ======================= reyting =======================
async function viewRanking(v) {
  const subs = await api('/subjects');
  const load = async (sid) => {
    const r = await api('/ranking' + (sid ? '?subjectId=' + sid : ''));
    const admin = S.user.role === 'admin';
    $('#rk').innerHTML = r.rows.length ? `<div class="card scroll" style="padding:6px"><table class="table"><thead><tr><th></th><th>Ism</th><th>Testlar</th><th>O'rtacha</th><th class="hide-m">Eng yaxshi</th><th class="hide-m" style="width:140px"></th></tr></thead><tbody>
      ${r.rows.map((x) => `<tr class="${x.userId === r.me ? 'me' : ''} ${admin ? 'click' : ''}" data-u="${x.userId}">
        <td class="rank-no ${x.rank && x.rank <= 3 ? 'top' : ''}">${x.rank || '—'}</td><td>${esc(x.fullName)}${x.userId === r.me ? ' <span class="pill">siz</span>' : ''}</td>
        <td class="num">${x.tests}</td><td class="num">${x.tests ? fmtPct(x.avg) : '—'}</td><td class="num hide-m">${x.tests ? fmtPct(x.best) : '—'}</td><td class="hide-m">${x.tests ? bar(x.avg) : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="card empty">Hali reyting uchun natijalar yo\'q</div>';
    if (admin) $$('[data-u]', $('#rk')).forEach((tr) => (tr.onclick = () => (location.hash = '#/users/' + tr.dataset.u)));
  };
  v.innerHTML = head('Reyting', "O'rtacha natija (%) bo'yicha tuziladi") +
    `<div class="row" style="margin-bottom:16px"><select class="input" id="rs"><option value="">Umumiy (barcha fanlar)</option>${subs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div><div id="rk"></div>`;
  $('#rs').onchange = (e) => load(e.target.value);
  await load('');
}

// ======================= profil =======================
function installBlock() {
  return isStandalone() ? '<div class="card" style="margin-top:14px"><h3>Ilova o\'rnatilgan</h3><p class="muted" style="margin:6px 0 0">Siz ilovadan alohida oyna sifatida foydalanyapsiz.</p></div>'
    : `<div class="card" style="margin-top:14px"><h3 style="margin-bottom:6px">Ilovani o'rnatish</h3><p class="muted" style="margin:0 0 12px">Kompyuter yoki telefonga alohida ilova sifatida o'rnating.</p>${installBtn('primary')}</div>`;
}
async function viewProfile(v) {
  v.innerHTML = head('Profil', '') + `<div class="card"><div class="row between"><div><h3>${esc(S.user.fullName)}</h3><div class="muted">Login: ${esc(S.user.login)} · ${S.user.role === 'admin' ? 'Administrator' : 'Foydalanuvchi'}</div></div>
    <button class="btn danger" id="lo">Chiqish</button></div></div>
    <div class="card" style="margin-top:14px"><h3 style="margin-bottom:12px">Parolni almashtirish</h3>
    <form id="pf" style="max-width:340px"><label class="field"><span>Joriy parol</span><input class="input" type="password" id="op" autocomplete="current-password" required></label>
    <label class="field"><span>Yangi parol (kamida 6 ta belgi)</span><input class="input" type="password" id="np" autocomplete="new-password" minlength="6" required></label>
    <button class="btn">Saqlash</button></form></div>` + installBlock();
  $('#lo').onclick = logout;
  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/me/password', { method: 'POST', body: { oldPassword: $('#op').value, newPassword: $('#np').value } }); toast("Parol o'zgartirildi", 'ok'); e.target.reset(); }
    catch (err) { toast(err.message, 'bad'); }
  };
  bindInstall(v);
}

// ======================= admin: boshqaruv =======================
async function viewAdminHome(v) {
  const o = await api('/admin/overview');
  v.innerHTML = head('Boshqaruv', "Platforma bo'yicha umumiy ko'rinish") + installBanner() +
    `<div class="grid g4">${stat(o.users, 'Foydalanuvchilar')}${stat(o.subjects, 'Fanlar')}${stat(o.questions, 'Savollar bazasi')}${stat(o.tests, 'Yechilgan testlar')}${stat(o.tests ? fmtPct(o.avg) : '—', "O'rtacha natija")}</div>
    <div class="section"><h3>So'nggi natijalar</h3>${attemptsTable(o.recent, { withUser: true })}</div>`;
  bindAttempts(v); bindInstall(v);
}

// ======================= admin: foydalanuvchilar =======================
async function viewAdminUsers(v) {
  const users = await api('/admin/users');
  v.innerHTML = head('Foydalanuvchilar', 'Login va parolni siz berasiz', '<button class="btn primary" id="add">Foydalanuvchi qo\'shish</button>') +
    (users.length ? `<div class="card scroll" style="padding:6px"><table class="table"><thead><tr><th>Ism</th><th class="hide-m">Login</th><th>Testlar</th><th>O'rtacha</th><th class="hide-m">Oxirgi kirish</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr class="click" data-u="${u.id}"><td>${esc(u.fullName)}</td><td class="muted hide-m">${esc(u.login)}</td><td class="num">${u.tests}</td><td class="num">${u.tests ? fmtPct(u.avg) : '—'}</td>
        <td class="muted hide-m">${fmtDate(u.lastLoginAt)}</td><td>${u.blocked ? '<span class="pill bad">bloklangan</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="card empty">Hali foydalanuvchilar yo\'q. Birinchisini qo\'shing.</div>');
  $$('[data-u]', v).forEach((tr) => (tr.onclick = () => (location.hash = '#/users/' + tr.dataset.u)));
  $('#add').onclick = async () => {
    const f = await formBox({ title: "Yangi foydalanuvchi", ok: "Qo'shish", fields: [
      { name: 'fullName', label: 'Ism-familiya' }, { name: 'login', label: 'Login (lotin harflari)' }, { name: 'password', label: 'Parol', value: genPw() }] });
    if (!f) return;
    try { await api('/admin/users', { method: 'POST', body: f }); await infoBox("Foydalanuvchi qo'shildi", `<p class="muted">Ma'lumotlarni foydalanuvchiga bering:</p><div class="card num" style="margin-top:8px">Login: <b>${esc(f.login)}</b><br>Parol: <b>${esc(f.password)}</b></div>`); route(); }
    catch (e) { toast(e.message, 'bad'); }
  };
}

async function viewAdminUser(v, id) {
  const p = await api(`/admin/users/${id}/profile`);
  const u = p.user;
  v.innerHTML = head(u.fullName, `Login: ${u.login} · Oxirgi kirish: ${fmtDate(u.lastLoginAt)}`,
    `<div class="row"><a class="btn ghost" href="#/users">Ortga</a><button class="btn" id="rp">Parolni yangilash</button><button class="btn" id="bl">${u.blocked ? 'Faollashtirish' : 'Bloklash'}</button><button class="btn danger" id="dl">O'chirish</button></div>`) +
    (u.blocked ? '<div class="banner" style="border-color:#5a3a3a;background:var(--bad-bg)">Bu hisob bloklangan — tizimga kira olmaydi.</div>' : '') +
    `<div class="grid g4">${stat(p.tests, 'Yechilgan testlar')}${stat(p.tests ? fmtPct(p.avg) : '—', "O'rtacha natija")}${stat(p.tests ? fmtPct(p.best) : '—', 'Eng yaxshi')}${stat(p.rank ? '#' + p.rank : '—', 'Reytingdagi o\'rni')}</div>
    <div class="section"><h3>Natijalar dinamikasi</h3><div class="card">${spark(p.trend)}</div></div>
    <div class="grid g2 section">
      <div><h3 style="margin-bottom:12px">Fanlar bo'yicha</h3>${p.subjects.length ? `<div class="card scroll" style="padding:6px"><table class="table"><thead><tr><th>Fan</th><th>Testlar</th><th>O'rtacha</th></tr></thead><tbody>${p.subjects.map((s) => `<tr><td>${esc(s.name)}</td><td class="num">${s.tests}</td><td class="num">${fmtPct(s.avg)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="card empty">Ma\'lumot yo\'q</div>'}</div>
      <div><h3 style="margin-bottom:12px">Eng ko'p xato qilingan savollar</h3>${p.mostMissed.length ? `<div class="list">${p.mostMissed.map((m) => `<div class="item"><div class="t"><b>${esc(m.text)}</b><span class="muted">${esc(m.subjectName)}</span></div><span class="pill bad">${m.count}×</span></div>`).join('')}</div>` : '<div class="card empty">Ma\'lumot yo\'q</div>'}</div>
    </div>
    <div class="section"><h3>Testlar tarixi</h3>${attemptsTable(p.history)}</div>`;
  bindAttempts(v);
  $('#rp').onclick = async () => {
    const f = await formBox({ title: 'Yangi parol', fields: [{ name: 'password', label: 'Yangi parol (kamida 6 ta belgi)', value: genPw() }] });
    if (!f) return;
    try { await api('/admin/users/' + id, { method: 'PATCH', body: { password: f.password } }); await infoBox('Parol yangilandi', `<div class="card num">Login: <b>${esc(u.login)}</b><br>Parol: <b>${esc(f.password)}</b></div>`); }
    catch (e) { toast(e.message, 'bad'); }
  };
  $('#bl').onclick = async () => {
    try { await api('/admin/users/' + id, { method: 'PATCH', body: { blocked: !u.blocked } }); toast(u.blocked ? 'Faollashtirildi' : 'Bloklandi', 'ok'); route(); } catch (e) { toast(e.message, 'bad'); }
  };
  $('#dl').onclick = async () => {
    if (!(await confirmBox({ title: "Foydalanuvchini o'chirish", text: `${u.fullName} va uning barcha natijalari o'chiriladi. Bu amalni qaytarib bo'lmaydi.`, ok: "O'chirish", danger: true }))) return;
    try { await api('/admin/users/' + id, { method: 'DELETE' }); toast("O'chirildi", 'ok'); location.hash = '#/users'; } catch (e) { toast(e.message, 'bad'); }
  };
}

// ======================= admin: fanlar =======================
async function viewAdminSubjects(v) {
  const subs = await api('/subjects');
  v.innerHTML = head('Fanlar', "Fan qo'shing va savollar faylini yuklang") +
    `<form class="row" id="sf" style="margin-bottom:18px"><input class="input" id="sn" placeholder="Yangi fan nomi" style="max-width:340px" required><button class="btn primary">Fan qo'shish</button></form>` +
    (subs.length ? `<div class="list">${subs.map((s) => `<div class="item"><div class="t"><b>${esc(s.name)}</b><span class="muted">${s.questionCount} ta savol</span></div>
      <a class="btn sm" href="#/subjects/${s.id}">Ochish</a><button class="btn sm ghost" data-rn="${s.id}">Nomini o'zgartirish</button><button class="btn sm danger ghost" data-dl="${s.id}">O'chirish</button></div>`).join('')}</div>` : '<div class="card empty">Hali fanlar yo\'q</div>');
  $('#sf').onsubmit = async (e) => {
    e.preventDefault();
    try { const s = await api('/admin/subjects', { method: 'POST', body: { name: $('#sn').value } }); location.hash = '#/subjects/' + s.id; } catch (err) { toast(err.message, 'bad'); }
  };
  $$('[data-rn]', v).forEach((b) => (b.onclick = async () => {
    const cur = subs.find((s) => s.id === b.dataset.rn);
    const f = await formBox({ title: "Fan nomini o'zgartirish", fields: [{ name: 'name', label: 'Nomi', value: cur.name }] });
    if (!f) return;
    try { await api('/admin/subjects/' + cur.id, { method: 'PATCH', body: { name: f.name } }); route(); } catch (e) { toast(e.message, 'bad'); }
  }));
  $$('[data-dl]', v).forEach((b) => (b.onclick = async () => {
    const cur = subs.find((s) => s.id === b.dataset.dl);
    if (!(await confirmBox({ title: "Fanni o'chirish", text: `«${cur.name}» va uning ${cur.questionCount} ta savoli o'chiriladi.`, ok: "O'chirish", danger: true }))) return;
    try { await api('/admin/subjects/' + cur.id, { method: 'DELETE' }); route(); } catch (e) { toast(e.message, 'bad'); }
  }));
}

async function viewAdminSubject(v, id) {
  const { subject, questions } = await api(`/admin/subjects/${id}/questions`);
  const paint = (term) => {
    const t = (term || '').toLowerCase();
    const list = questions.filter((q) => !t || q.text.toLowerCase().includes(t));
    $('#ql').innerHTML = list.length ? list.map((q) => `<div class="rev"><div class="row between" style="align-items:flex-start;flex-wrap:nowrap"><div class="qt">${esc(q.text)}</div><button class="btn sm danger ghost" data-q="${q.id}">O'chirish</button></div>
      <div class="ans ok"><small>To'g'ri javob</small>${esc(q.options[0])}</div>${q.options.slice(1).map((o) => `<div class="ans muted" style="background:var(--surface2)">${esc(o)}</div>`).join('')}</div>`).join('') : '<div class="card empty">Savollar topilmadi</div>';
    $$('[data-q]', $('#ql')).forEach((b) => (b.onclick = async () => {
      try { await api('/admin/questions/' + b.dataset.q, { method: 'DELETE' }); const i = questions.findIndex((q) => q.id === b.dataset.q); questions.splice(i, 1); $('#qc').textContent = questions.length; paint($('#qs').value); } catch (e) { toast(e.message, 'bad'); }
    }));
  };
  v.innerHTML = head(subject.name, '', '<a class="btn ghost" href="#/subjects">Ortga</a>') +
    `<div class="card drop"><h3 style="margin-bottom:6px">Savollarni yuklash</h3>
      <p class="muted" style="margin:0 0 12px">Word (.docx) yoki Excel (.xlsx). Har bir savolda <b>birinchi variant to'g'ri javob</b> hisoblanadi; test paytida variantlar avtomatik aralashtiriladi.</p>
      <div class="row"><input type="file" id="fl" accept=".docx,.xlsx" class="input" style="max-width:320px"><button class="btn primary" id="up">Yuklash</button>
      <label class="row" style="gap:6px"><input type="checkbox" id="rp"> <span class="muted">Eskilarini almashtirish</span></label>
      <button class="btn sm ghost" id="tpl">Excel namunasi</button></div></div>
    <details class="card" style="margin-top:14px"><summary style="cursor:pointer">Savolni qo'lda qo'shish</summary><form id="mf" style="margin-top:14px">
      <label class="field"><span>Savol</span><input class="input" name="text" required></label>
      ${LET.map((l, i) => `<label class="field"><span>${l} variant</span><div class="row" style="flex-wrap:nowrap"><input class="input" name="o${i}" required><label style="white-space:nowrap" class="muted"><input type="radio" name="c" value="${i}" ${i === 0 ? 'checked' : ''}> to'g'ri</label></div></label>`).join('')}
      <button class="btn primary">Qo'shish</button></form></details>
    <div class="section"><div class="row between" style="margin-bottom:12px"><h3>Savollar bazasi: <span id="qc" class="num">${questions.length}</span> ta</h3><input class="input" id="qs" placeholder="Qidirish" style="max-width:240px"></div><div class="review" id="ql"></div></div>`;
  paint('');
  $('#qs').oninput = (e) => paint(e.target.value);
  $('#tpl').onclick = async () => {
    try { const r = await api('/admin/template.xlsx', { raw: true }); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'savollar-namuna.xlsx'; a.click(); URL.revokeObjectURL(a.href); }
    catch (e) { toast(e.message, 'bad'); }
  };
  $('#up').onclick = async () => {
    const file = $('#fl').files[0];
    if (!file) return toast('Avval fayl tanlang', 'bad');
    if ($('#rp').checked && !(await confirmBox({ title: 'Eski savollarni almashtirish', text: "Fandagi hozirgi barcha savollar o'chirilib, yangilari yuklanadi.", ok: 'Almashtirish', danger: true }))) return;
    const fd = new FormData(); fd.append('file', file); fd.append('replace', $('#rp').checked);
    $('#up').disabled = true; $('#up').textContent = "Yuklanmoqda…";
    try {
      const r = await api(`/admin/subjects/${id}/upload`, { method: 'POST', form: fd });
      await infoBox('Yuklash yakunlandi', `<div class="card num">Qo'shildi: <b>${r.added}</b><br>Takroriy (o'tkazib yuborildi): <b>${r.duplicates}</b><br>Noto'g'ri shakldagi: <b>${r.skipped}</b><br>Fandagi jami savollar: <b>${r.total}</b></div>
        ${r.warnings.length ? `<ul class="warnlist">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`);
      route();
    } catch (e) { toast(e.message, 'bad'); $('#up').disabled = false; $('#up').textContent = 'Yuklash'; }
  };
  $('#mf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api(`/admin/subjects/${id}/questions`, { method: 'POST', body: { text: f.get('text'), options: [0, 1, 2, 3].map((i) => f.get('o' + i)), correct: Number(f.get('c')) } });
      toast("Savol qo'shildi", 'ok'); route();
    } catch (err) { toast(err.message, 'bad'); }
  };
}

// ======================= ishga tushirish =======================
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; });
window.addEventListener('appinstalled', () => { S.installEvt = null; $$('[data-install]').forEach((b) => b.closest('.banner') ? b.closest('.banner').remove() : b.remove()); toast("Ilova o'rnatildi", 'ok'); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

(async function init() {
  if (!S.token) return renderLogin();
  try {
    const me = await api('/me');
    S.user = me.user; S.config = me.config;
    renderShell();
  } catch (e) {
    if (S.token) { $('#app').innerHTML = `<div class="login"><div class="login-card"><h1>Ulanib bo'lmadi</h1><p>${esc(e.message)}</p><button class="btn primary block" onclick="location.reload()">Qayta urinish</button></div></div>`; }
    else renderLogin();
  }
})();
})();
