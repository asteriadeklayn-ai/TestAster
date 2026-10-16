// Avtomatik tekshiruv: node server/selftest.js [docx fayl yo'li]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3917;
const BASE = `http://localhost:${PORT}`;
const DATA = path.join(os.tmpdir(), 'tp-selftest-' + Date.now() + '.json');
const DOCX = process.argv[2] || '/mnt/user-data/uploads/test_global_biznes.docx';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(p, { method = 'GET', body, token, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + '/api' + p, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const j = await r.json().catch(() => ({}));
  return { s: r.status, j };
}

(async () => {
  const srv = spawn('node', [path.join(__dirname, 'index.js')], { env: { ...process.env, PORT, DATA_FILE: DATA } });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + '/'); break; } catch (e) { await sleep(150); } }

  try {
    // kirish
    ok((await call('/login', { method: 'POST', body: { login: 'Asteria', password: 'xato' } })).s === 401, "noto'g'ri parol rad etildi");
    ok((await call('/subjects')).s === 401, 'tokensiz API yopiq');
    const a = await call('/login', { method: 'POST', body: { login: 'Asteria', password: 'Asteria1234' } });
    ok(a.s === 200 && a.j.user.role === 'admin', 'admin kirdi');
    const AT = a.j.token;

    // foydalanuvchi qo'shish
    const u = await call('/admin/users', { method: 'POST', token: AT, body: { fullName: 'Test Foydalanuvchi', login: 'ali', password: 'ali12345' } });
    ok(u.s === 200, "foydalanuvchi qo'shildi");
    ok((await call('/admin/users', { method: 'POST', token: AT, body: { fullName: 'X', login: 'ALI', password: 'abcdef' } })).s === 400, 'takroriy login rad etildi');
    const ul = await call('/login', { method: 'POST', body: { login: 'ali', password: 'ali12345' } });
    ok(ul.s === 200 && ul.j.user.role === 'user', 'foydalanuvchi kirdi');
    const UT = ul.j.token;
    ok((await call('/admin/users', { token: UT })).s === 403, 'foydalanuvchi admin yo\'llariga kira olmaydi');

    // fan + Word yuklash
    const sub = await call('/admin/subjects', { method: 'POST', token: AT, body: { name: 'Global biznes' } });
    ok(sub.s === 200, "fan qo'shildi");
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(DOCX)]), 'test_global_biznes.docx');
    const up = await call(`/admin/subjects/${sub.j.id}/upload`, { method: 'POST', token: AT, form: fd });
    ok(up.s === 200 && up.j.added > 150, `Word fayldan ${up.j.added} ta savol o'qildi (noto'g'ri shakldagi: ${up.j.skipped})`);
    const fd2 = new FormData();
    fd2.append('file', new Blob([fs.readFileSync(DOCX)]), 'test_global_biznes.docx');
    const up2 = await call(`/admin/subjects/${sub.j.id}/upload`, { method: 'POST', token: AT, form: fd2 });
    ok(up2.j.added === 0 && up2.j.duplicates === up.j.added, 'qayta yuklashda takrorlar qo\'shilmadi');

    // Excel namuna qaytadan yuklash
    const tpl = await fetch(BASE + '/api/admin/template.xlsx', { headers: { Authorization: 'Bearer ' + AT } });
    const xb = Buffer.from(await tpl.arrayBuffer());
    const fd3 = new FormData();
    fd3.append('file', new Blob([xb]), 'namuna.xlsx');
    const up3 = await call(`/admin/subjects/${sub.j.id}/upload`, { method: 'POST', token: AT, form: fd3 });
    ok(up3.s === 200 && up3.j.added === 1, 'Excel fayldan savol o\'qildi');

    // test
    const subs = await call('/subjects', { token: UT });
    ok(subs.j.length === 1, "foydalanuvchi fanlarni ko'radi");
    const st = await call('/tests/start', { method: 'POST', token: UT, body: { subjectId: sub.j.id } });
    ok(st.s === 200 && st.j.items.length === 25, '25 ta savol berildi');
    ok(!JSON.stringify(st.j).includes('correct'), "to'g'ri javob mijozga yuborilmaydi");
    ok(Math.abs(st.j.deadline - st.j.startedAt - 40 * 60000) < 1000, '40 daqiqa vaqt berildi');
    const again = await call('/tests/start', { method: 'POST', token: UT, body: { subjectId: sub.j.id } });
    ok(again.j.id === st.j.id, 'ikkinchi test boshlanmadi (davom ettiriladi)');

    // variantlar aralashganini tekshirish: ko'p test bo'yicha to'g'ri javob o'rni
    const posCount = [0, 0, 0, 0];
    let first = st.j;
    for (let k = 0; k < 12; k++) {
      const stt = k === 0 ? first : (await call('/tests/start', { method: 'POST', token: UT, body: { subjectId: sub.j.id } })).j;
      // admin ko'rinishi orqali to'g'ri javobni bilib olamiz: testni yakunlab natijani o'qiymiz
      const fin = await call(`/tests/${stt.id}/finish`, { method: 'POST', token: UT, body: { answers: [] } });
      const d = await call(`/attempts/${fin.j.id}`, { token: UT });
      d.j.items.forEach((it) => posCount[it.correct]++);
    }
    ok(posCount.every((c) => c > 40), `to'g'ri javob o'rinlari aralash: A=${posCount[0]} B=${posCount[1]} C=${posCount[2]} D=${posCount[3]}`);

    // aniq natija: barcha to'g'ri / barcha xato
    const t2 = await call('/tests/start', { method: 'POST', token: UT, body: { subjectId: sub.j.id } });
    const f2 = await call(`/tests/${t2.j.id}/finish`, { method: 'POST', token: UT, body: { answers: Array(25).fill(0) } });
    const d2 = (await call(`/attempts/${f2.j.id}`, { token: UT })).j;
    const expected = d2.items.filter((it) => it.correct === 0).length;
    ok(d2.correct === expected && d2.total === 25, `hisoblash to'g'ri (${d2.correct}/25)`);
    const t3 = await call('/tests/start', { method: 'POST', token: UT, body: { subjectId: sub.j.id } });
    const ans = [];
    for (let i = 0; i < 25; i++) ans.push(i < 5 ? 1 : -1);
    await call(`/tests/${t3.j.id}/answer`, { method: 'POST', token: UT, body: { index: 0, choice: 2 } });
    const f3 = await call(`/tests/${t3.j.id}/finish`, { method: 'POST', token: UT, body: { answers: ans } });
    const d3 = (await call(`/attempts/${f3.j.id}`, { token: UT })).j;
    ok(d3.items.slice(5).every((it) => it.chosen === null), 'javobsiz savollar xato hisoblanadi');

    const mis = await call('/mistakes', { token: UT });
    ok(mis.s === 200 && mis.j.length > 0 && mis.j[0].wrong.length > 0, '"Xato javoblar" ro\'yxati ishlaydi');

    // reyting va tahlil
    const rk = await call('/ranking', { token: UT });
    ok(rk.j.rows.length === 1 && rk.j.rows[0].tests >= 14 && rk.j.rows[0].rank === 1, 'reyting ishlaydi');
    const prof = await call(`/admin/users/${u.j.id}/profile`, { token: AT });
    ok(prof.s === 200 && prof.j.history.length >= 14 && prof.j.mostMissed.length > 0, 'admin foydalanuvchi profilini tahlil qila oladi');
    const other = await call('/admin/subjects', { method: 'POST', token: AT, body: { name: 'Boshqa' } });
    ok(other.s === 200, "ikkinchi fan qo'shildi");
    const o2 = await call('/admin/users', { method: 'POST', token: AT, body: { fullName: 'Ikkinchi', login: 'vali', password: 'vali1234' } });
    const vt = (await call('/login', { method: 'POST', body: { login: 'vali', password: 'vali1234' } })).j.token;
    const forbid = await call(`/attempts/${f2.j.id}`, { token: vt });
    ok(forbid.s === 404, 'boshqa foydalanuvchi natijasini ko\'ra olmaydi');

    // bloklash
    await call(`/admin/users/${o2.j.id}`, { method: 'PATCH', token: AT, body: { blocked: true } });
    ok((await call('/login', { method: 'POST', body: { login: 'vali', password: 'vali1234' } })).s === 403, 'bloklangan foydalanuvchi kira olmaydi');

    // PWA fayllar
    const man = await fetch(BASE + '/manifest.webmanifest');
    ok(man.ok && (await man.json()).display === 'standalone', 'manifest mavjud');
    ok((await fetch(BASE + '/sw.js')).ok && (await fetch(BASE + '/icon-512.png')).ok, 'service worker va ikonkalar mavjud');
  } catch (e) {
    console.error(e); fails++;
  }
  srv.kill();
  fs.rmSync(DATA, { force: true });
  console.log(fails ? `\n${fails} ta xatolik` : '\nHammasi muvaffaqiyatli');
  process.exit(fails ? 1 : 0);
})();
