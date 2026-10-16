const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { createStore } = require('./db');
const { parseUpload, buildTemplate } = require('./parser');

const PORT = process.env.PORT || 3000;
const Q_PER_TEST = Number(process.env.QUESTIONS_PER_TEST) || 25;
const TEST_MINUTES = Number(process.env.TEST_MINUTES) || 40;
const GRACE_MS = 20 * 1000;
const TOKEN_DAYS = 30;

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pct = (c, t) => (t ? Math.round((c / t) * 1000) / 10 : 0);

async function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await new Promise((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k.toString('hex')))));
  return salt + ':' + hash;
}
async function checkPw(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const k = await new Promise((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));
  const h = Buffer.from(hash, 'hex');
  return h.length === k.length && crypto.timingSafeEqual(h, k);
}

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

(async () => {
  const store = await createStore();
  const Users = store.col('users');
  const Subjects = store.col('subjects');
  const Questions = store.col('questions');
  const Attempts = store.col('attempts');
  const Meta = store.col('meta');

  // --- maxfiy kalit (tokenlar uchun) ---
  let secretDoc = await Meta.findOne({ key: 'secret' });
  if (!secretDoc) secretDoc = await Meta.insert({ key: 'secret', value: crypto.randomBytes(32).toString('hex') });
  const SECRET = process.env.SECRET || secretDoc.value;

  // --- boshlang'ich admin ---
  if (!(await Users.findOne({ role: 'admin' }))) {
    const login = process.env.ADMIN_LOGIN || 'Asteria';
    const password = process.env.ADMIN_PASSWORD || 'Asteria1234';
    await Users.insert({
      fullName: 'Administrator', login, loginLower: login.toLowerCase(),
      password: await hashPw(password), role: 'admin', blocked: false, createdAt: Date.now(), lastLoginAt: null,
    });
    console.log(`Admin yaratildi: ${login}`);
  }

  const sign = (payload) => {
    const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return b + '.' + crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
  };
  const verify = (t) => {
    const [b, s] = String(t || '').split('.');
    if (!b || !s) return null;
    const e = crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
    if (s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null;
    try {
      const p = JSON.parse(Buffer.from(b, 'base64url').toString());
      return p.exp > Date.now() ? p : null;
    } catch (e2) { return null; }
  };
  const publicUser = (u) => ({ id: u.id, fullName: u.fullName, login: u.login, role: u.role, blocked: !!u.blocked });

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  // --- login urinishlarini cheklash ---
  const tries = new Map();
  const tooMany = (key) => {
    const now = Date.now();
    const rec = (tries.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
    tries.set(key, rec);
    return rec.length >= 8;
  };
  const addTry = (key) => tries.set(key, [...(tries.get(key) || []), Date.now()]);

  app.post('/api/login', wrap(async (req, res) => {
    const login = String(req.body.login || '').trim();
    const password = String(req.body.password || '');
    const key = req.ip + '|' + login.toLowerCase();
    if (tooMany(key)) throw new HttpError(429, "Juda ko'p urinish. 10 daqiqadan keyin qayta urinib ko'ring");
    const user = login ? await Users.findOne({ loginLower: login.toLowerCase() }) : null;
    if (!user || !(await checkPw(password, user.password))) {
      addTry(key);
      throw new HttpError(401, "Login yoki parol noto'g'ri");
    }
    if (user.blocked) throw new HttpError(403, 'Hisobingiz bloklangan. Administrator bilan bog\'laning');
    tries.delete(key);
    await Users.update(user.id, { lastLoginAt: Date.now() });
    const token = sign({ uid: user.id, exp: Date.now() + TOKEN_DAYS * 86400000 });
    res.json({ token, user: publicUser(user) });
  }));

  const auth = wrap(async (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
    const p = m && verify(m[1]);
    if (!p) throw new HttpError(401, 'Kirish talab qilinadi');
    const user = await Users.findOne({ id: p.uid });
    if (!user) throw new HttpError(401, 'Kirish talab qilinadi');
    if (user.blocked) throw new HttpError(403, 'Hisobingiz bloklangan');
    req.user = user;
    next();
  });
  const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : next(new HttpError(403, 'Faqat administrator uchun')));

  // =================== statistika yordamchilari ===================
  const statsOf = (atts) => {
    const tests = atts.length;
    const correct = atts.reduce((s, a) => s + a.correct, 0);
    const questions = atts.reduce((s, a) => s + a.total, 0);
    return {
      tests, correct, questions,
      avg: tests ? Math.round((atts.reduce((s, a) => s + a.percent, 0) / tests) * 10) / 10 : 0,
      best: tests ? Math.max(...atts.map((a) => a.percent)) : 0,
    };
  };
  const brief = (a) => ({
    id: a.id, subjectId: a.subjectId, subjectName: a.subjectName, correct: a.correct, total: a.total,
    percent: a.percent, finishedAt: a.finishedAt, startedAt: a.startedAt, timedOut: !!a.timedOut,
  });
  const finishedOf = async (q) => (await Attempts.find({ ...q, status: 'finished' })).sort((a, b) => a.finishedAt - b.finishedAt);

  async function buildRanking(subjectId) {
    const users = (await Users.find({ role: 'user' })).filter((u) => !u.blocked);
    const q = subjectId ? { subjectId } : {};
    const atts = await finishedOf(q);
    const by = {};
    atts.forEach((a) => (by[a.userId] = by[a.userId] || []).push(a));
    const rows = users.map((u) => {
      const s = statsOf(by[u.id] || []);
      return { userId: u.id, fullName: u.fullName, ...s };
    });
    rows.sort((a, b) => (b.tests > 0) - (a.tests > 0) || b.avg - a.avg || b.tests - a.tests || a.fullName.localeCompare(b.fullName));
    let rank = 0;
    rows.forEach((r) => { r.rank = r.tests ? ++rank : null; });
    return rows;
  }

  // =================== testni yakunlash ===================
  async function finalize(att, timedOut) {
    if (att.status === 'finished') return att;
    const correct = att.items.reduce((s, it, i) => s + (att.answers[i] === it.correct ? 1 : 0), 0);
    return Attempts.update(att.id, {
      status: 'finished', finishedAt: Math.min(Date.now(), att.deadline), correct,
      percent: pct(correct, att.items.length), timedOut: !!timedOut,
    });
  }
  async function activeAttempt(userId) {
    const act = await Attempts.findOne({ userId, status: 'active' });
    if (!act) return null;
    if (Date.now() > act.deadline + GRACE_MS) { await finalize(act, true); return null; }
    return act;
  }
  const clientAttempt = (a) => ({
    id: a.id, subjectId: a.subjectId, subjectName: a.subjectName, startedAt: a.startedAt, deadline: a.deadline,
    serverNow: Date.now(), total: a.items.length, answers: a.answers,
    items: a.items.map((it) => ({ text: it.text, options: it.options })),
  });
  const detail = (a) => ({
    ...brief(a),
    userId: a.userId, userName: a.userName,
    items: a.items.map((it, i) => ({
      text: it.text, options: it.options, correct: it.correct,
      chosen: a.answers[i] === undefined || a.answers[i] === null ? null : a.answers[i],
    })),
  });

  // =================== umumiy yo'llar ===================
  app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user), config: { perTest: Q_PER_TEST, minutes: TEST_MINUTES } }));

  app.post('/api/me/password', auth, wrap(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!(await checkPw(String(oldPassword || ''), req.user.password))) throw new HttpError(400, "Joriy parol noto'g'ri");
    if (String(newPassword || '').length < 6) throw new HttpError(400, "Yangi parol kamida 6 ta belgidan iborat bo'lsin");
    await Users.update(req.user.id, { password: await hashPw(String(newPassword)) });
    res.json({ ok: true });
  }));

  app.get('/api/me/stats', auth, wrap(async (req, res) => {
    const atts = await finishedOf({ userId: req.user.id });
    const ranking = await buildRanking();
    const mine = ranking.find((r) => r.userId === req.user.id);
    res.json({
      ...statsOf(atts), rank: mine ? mine.rank : null, participants: ranking.filter((r) => r.tests).length,
      history: atts.slice(-30).map(brief),
    });
  }));

  app.get('/api/subjects', auth, wrap(async (req, res) => {
    const subs = await Subjects.find();
    const out = [];
    for (const s of subs) out.push({ id: s.id, name: s.name, questionCount: await Questions.count({ subjectId: s.id }) });
    out.sort((a, b) => a.name.localeCompare(b.name));
    res.json(out);
  }));

  app.get('/api/ranking', auth, wrap(async (req, res) => {
    res.json({ rows: await buildRanking(req.query.subjectId || null), me: req.user.id });
  }));

  // --- test ---
  app.get('/api/tests/active', auth, wrap(async (req, res) => {
    const a = await activeAttempt(req.user.id);
    res.json(a ? clientAttempt(a) : null);
  }));

  app.post('/api/tests/start', auth, wrap(async (req, res) => {
    const existing = await activeAttempt(req.user.id);
    if (existing) return res.json(clientAttempt(existing));
    const subject = await Subjects.findOne({ id: String(req.body.subjectId || '') });
    if (!subject) throw new HttpError(404, 'Fan topilmadi');
    const all = await Questions.find({ subjectId: subject.id });
    if (!all.length) throw new HttpError(400, "Bu fanda hali savollar yo'q");
    const picked = shuffle(all).slice(0, Q_PER_TEST);
    const items = picked.map((q) => {
      const order = shuffle(q.options.map((text, i) => ({ text, ok: i === 0 })));
      return { qid: q.id, text: q.text, options: order.map((o) => o.text), correct: order.findIndex((o) => o.ok) };
    });
    const now = Date.now();
    const att = await Attempts.insert({
      userId: req.user.id, userName: req.user.fullName, subjectId: subject.id, subjectName: subject.name,
      status: 'active', startedAt: now, deadline: now + TEST_MINUTES * 60000, items,
      answers: items.map(() => null), correct: 0, total: items.length, percent: 0,
    });
    res.json(clientAttempt(att));
  }));

  app.post('/api/tests/:id/answer', auth, wrap(async (req, res) => {
    const att = await Attempts.findOne({ id: req.params.id, userId: req.user.id });
    if (!att) throw new HttpError(404, 'Test topilmadi');
    if (att.status !== 'active') throw new HttpError(400, 'Test yakunlangan');
    if (Date.now() > att.deadline + GRACE_MS) { await finalize(att, true); throw new HttpError(400, 'Vaqt tugagan'); }
    const i = Number(req.body.index);
    const c = Number(req.body.choice);
    if (!Number.isInteger(i) || i < 0 || i >= att.items.length || !Number.isInteger(c) || c < 0 || c > 3) throw new HttpError(400, "Noto'g'ri ma'lumot");
    att.answers[i] = c;
    await Attempts.update(att.id, { answers: att.answers });
    res.json({ ok: true });
  }));

  app.post('/api/tests/:id/finish', auth, wrap(async (req, res) => {
    const att = await Attempts.findOne({ id: req.params.id, userId: req.user.id });
    if (!att) throw new HttpError(404, 'Test topilmadi');
    // kechikib yetib kelgan javoblar (muddat + qisqa imkoniyat ichida) hisobga olinadi
    if (att.status === 'active' && Array.isArray(req.body.answers) && Date.now() <= att.deadline + GRACE_MS) {
      req.body.answers.forEach((c, i) => {
        if (i < att.items.length && Number.isInteger(c) && c >= 0 && c <= 3) att.answers[i] = c;
      });
    }
    const fin = await finalize(att, Date.now() > att.deadline);
    res.json({ id: fin.id });
  }));

  app.get('/api/attempts/:id', auth, wrap(async (req, res) => {
    const att = await Attempts.findOne({ id: req.params.id });
    if (!att || (att.userId !== req.user.id && req.user.role !== 'admin')) throw new HttpError(404, 'Natija topilmadi');
    if (att.status !== 'finished') throw new HttpError(400, 'Test hali yakunlanmagan');
    res.json(detail(att));
  }));

  app.get('/api/mistakes', auth, wrap(async (req, res) => {
    const atts = (await finishedOf({ userId: req.user.id })).reverse().slice(0, 20);
    const out = [];
    for (const a of atts) {
      const d = detail(a);
      const wrong = d.items.filter((it) => it.chosen !== it.correct);
      if (wrong.length) out.push({ ...brief(a), wrong });
    }
    res.json(out);
  }));

  // =================== admin ===================
  const admin = express.Router();
  admin.use(auth, adminOnly);

  admin.get('/overview', wrap(async (req, res) => {
    const users = await Users.find({ role: 'user' });
    const atts = await finishedOf({});
    const recent = atts.slice(-8).reverse().map((a) => ({ ...brief(a), userName: a.userName, userId: a.userId }));
    let qTotal = 0;
    for (const s of await Subjects.find()) qTotal += await Questions.count({ subjectId: s.id });
    res.json({
      users: users.length, subjects: await Subjects.count(), questions: qTotal,
      ...statsOf(atts), recent,
    });
  }));

  admin.get('/users', wrap(async (req, res) => {
    const users = await Users.find({ role: 'user' });
    const atts = await finishedOf({});
    const by = {};
    atts.forEach((a) => (by[a.userId] = by[a.userId] || []).push(a));
    res.json(users.map((u) => ({
      ...publicUser(u), createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, ...statsOf(by[u.id] || []),
      lastTestAt: (by[u.id] || []).length ? by[u.id][by[u.id].length - 1].finishedAt : null,
    })).sort((a, b) => a.fullName.localeCompare(b.fullName)));
  }));

  admin.post('/users', wrap(async (req, res) => {
    const fullName = String(req.body.fullName || '').trim();
    const login = String(req.body.login || '').trim();
    const password = String(req.body.password || '');
    if (!fullName) throw new HttpError(400, 'Ism-familiyani kiriting');
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(login)) throw new HttpError(400, "Login 3-32 ta belgi: lotin harflari, raqam, nuqta, tire yoki pastki chiziq");
    if (password.length < 6) throw new HttpError(400, "Parol kamida 6 ta belgidan iborat bo'lsin");
    if (await Users.findOne({ loginLower: login.toLowerCase() })) throw new HttpError(400, 'Bu login band');
    const u = await Users.insert({
      fullName, login, loginLower: login.toLowerCase(), password: await hashPw(password),
      role: 'user', blocked: false, createdAt: Date.now(), lastLoginAt: null,
    });
    res.json(publicUser(u));
  }));

  admin.patch('/users/:id', wrap(async (req, res) => {
    const u = await Users.findOne({ id: req.params.id, role: 'user' });
    if (!u) throw new HttpError(404, 'Foydalanuvchi topilmadi');
    const patch = {};
    if (req.body.fullName !== undefined) {
      const n = String(req.body.fullName).trim();
      if (!n) throw new HttpError(400, 'Ism-familiyani kiriting');
      patch.fullName = n;
    }
    if (req.body.password !== undefined) {
      if (String(req.body.password).length < 6) throw new HttpError(400, "Parol kamida 6 ta belgidan iborat bo'lsin");
      patch.password = await hashPw(String(req.body.password));
    }
    if (req.body.blocked !== undefined) patch.blocked = !!req.body.blocked;
    res.json(publicUser(await Users.update(u.id, patch)));
  }));

  admin.delete('/users/:id', wrap(async (req, res) => {
    const u = await Users.findOne({ id: req.params.id, role: 'user' });
    if (!u) throw new HttpError(404, 'Foydalanuvchi topilmadi');
    await Attempts.remove({ userId: u.id });
    await Users.remove({ id: u.id });
    res.json({ ok: true });
  }));

  admin.get('/users/:id/profile', wrap(async (req, res) => {
    const u = await Users.findOne({ id: req.params.id, role: 'user' });
    if (!u) throw new HttpError(404, 'Foydalanuvchi topilmadi');
    const atts = await finishedOf({ userId: u.id });
    const perSubject = {};
    atts.forEach((a) => (perSubject[a.subjectName] = perSubject[a.subjectName] || []).push(a));
    const missed = {};
    atts.forEach((a) => a.items.forEach((it, i) => {
      if (a.answers[i] !== it.correct) {
        const k = a.subjectName + '|' + it.text;
        missed[k] = missed[k] || { subjectName: a.subjectName, text: it.text, count: 0 };
        missed[k].count++;
      }
    }));
    const ranking = await buildRanking();
    const mine = ranking.find((r) => r.userId === u.id);
    res.json({
      user: { ...publicUser(u), createdAt: u.createdAt, lastLoginAt: u.lastLoginAt },
      ...statsOf(atts), rank: mine ? mine.rank : null,
      subjects: Object.entries(perSubject).map(([name, list]) => ({ name, ...statsOf(list) })).sort((a, b) => b.avg - a.avg),
      history: atts.slice().reverse().slice(0, 50).map(brief),
      trend: atts.slice(-30).map((a) => a.percent),
      mostMissed: Object.values(missed).sort((a, b) => b.count - a.count).slice(0, 10),
    });
  }));

  // --- fanlar ---
  admin.post('/subjects', wrap(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) throw new HttpError(400, 'Fan nomini kiriting');
    if ((await Subjects.find()).some((s) => norm(s.name) === norm(name))) throw new HttpError(400, 'Bunday fan mavjud');
    res.json(await Subjects.insert({ name, createdAt: Date.now() }));
  }));
  admin.patch('/subjects/:id', wrap(async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) throw new HttpError(400, 'Fan nomini kiriting');
    const s = await Subjects.update(req.params.id, { name });
    if (!s) throw new HttpError(404, 'Fan topilmadi');
    res.json(s);
  }));
  admin.delete('/subjects/:id', wrap(async (req, res) => {
    await Questions.remove({ subjectId: req.params.id });
    await Subjects.remove({ id: req.params.id });
    res.json({ ok: true });
  }));

  admin.get('/subjects/:id/questions', wrap(async (req, res) => {
    const subject = await Subjects.findOne({ id: req.params.id });
    if (!subject) throw new HttpError(404, 'Fan topilmadi');
    const qs = await Questions.find({ subjectId: subject.id });
    res.json({ subject, questions: qs.map((q) => ({ id: q.id, text: q.text, options: q.options })) });
  }));

  admin.post('/subjects/:id/questions', wrap(async (req, res) => {
    const subject = await Subjects.findOne({ id: req.params.id });
    if (!subject) throw new HttpError(404, 'Fan topilmadi');
    const text = String(req.body.text || '').trim();
    const options = (req.body.options || []).map((o) => String(o || '').trim());
    const correct = Number(req.body.correct);
    if (!text || options.length !== 4 || options.some((o) => !o) || ![0, 1, 2, 3].includes(correct)) throw new HttpError(400, "Savol va 4 ta variantni to'ldiring, to'g'ri javobni belgilang");
    const [c] = options.splice(correct, 1);
    options.unshift(c);
    res.json(await Questions.insert({ subjectId: subject.id, text, options }));
  }));

  admin.delete('/questions/:id', wrap(async (req, res) => {
    await Questions.remove({ id: req.params.id });
    res.json({ ok: true });
  }));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
  admin.post('/subjects/:id/upload', upload.single('file'), wrap(async (req, res) => {
    const subject = await Subjects.findOne({ id: req.params.id });
    if (!subject) throw new HttpError(404, 'Fan topilmadi');
    if (!req.file) throw new HttpError(400, 'Fayl tanlanmagan');
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    let parsed;
    try { parsed = await parseUpload(name, req.file.buffer); } catch (e) {
      throw new HttpError(400, e.message.includes('Faqat') ? e.message : "Faylni o'qib bo'lmadi. Namunadagi shaklda ekanini tekshiring");
    }
    if (!parsed.questions.length) throw new HttpError(400, "Faylda bironta ham savol topilmadi. Namunadagi shaklda ekanini tekshiring");
    if (String(req.body.replace) === 'true') await Questions.remove({ subjectId: subject.id });
    const have = new Set((await Questions.find({ subjectId: subject.id })).map((q) => norm(q.text)));
    const fresh = [];
    let duplicates = 0;
    for (const q of parsed.questions) {
      const k = norm(q.text);
      if (have.has(k)) { duplicates++; continue; }
      have.add(k);
      fresh.push({ subjectId: subject.id, text: q.text, options: q.options });
    }
    await Questions.insertMany(fresh);
    res.json({
      added: fresh.length, duplicates, skipped: parsed.warnings.length, warnings: parsed.warnings.slice(0, 20),
      total: await Questions.count({ subjectId: subject.id }),
    });
  }));

  admin.get('/template.xlsx', wrap(async (req, res) => {
    const buf = await buildTemplate();
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', 'attachment; filename="savollar-namuna.xlsx"');
    res.send(Buffer.from(buf));
  }));

  app.use('/api/admin', admin);

  // =================== statik fayllar (PWA) ===================
  app.use('/api', (req, res) => res.status(404).json({ error: 'Topilmadi' }));
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    setHeaders: (res, file) => {
      if (file.endsWith('sw.js')) res.set('Cache-Control', 'no-cache');
      if (file.endsWith('.webmanifest')) res.set('Content-Type', 'application/manifest+json');
    },
  }));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

  app.use((err, req, res, next) => { // eslint-disable-line
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Fayl juda katta (15 MB gacha)' : err.message });
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Serverda xatolik yuz berdi' : err.message });
  });

  app.listen(PORT, () => console.log(`Test platformasi: http://localhost:${PORT}`));
})().catch((e) => { console.error(e); process.exit(1); });
