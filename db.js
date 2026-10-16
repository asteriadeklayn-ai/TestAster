// Ma'lumotlar ombori: MONGODB_URI berilsa MongoDB, aks holda data/db.json fayli.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const newId = () => crypto.randomBytes(8).toString('hex');
const clone = (o) => JSON.parse(JSON.stringify(o));
const match = (doc, q) => Object.entries(q || {}).every(([k, v]) => doc[k] === v);

class FileStore {
  constructor(file) {
    this.file = file;
    this.data = {};
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { this.data = {}; }
    }
    this.timer = null;
    this.dirty = false;
    const bye = () => { this.flush(); process.exit(0); };
    process.on('SIGTERM', bye);
    process.on('SIGINT', bye);
  }
  flush() {
    clearTimeout(this.timer);
    if (!this.dirty) return;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
    this.dirty = false;
  }
  save() {
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 150);
  }
  col(name) {
    const self = this;
    const arr = () => (self.data[name] = self.data[name] || []);
    return {
      async find(q) { return arr().filter((d) => match(d, q)).map(clone); },
      async findOne(q) { const d = arr().find((d) => match(d, q)); return d ? clone(d) : null; },
      async count(q) { return arr().filter((d) => match(d, q)).length; },
      async insert(doc) { doc = { id: newId(), ...doc }; arr().push(clone(doc)); self.save(); return doc; },
      async insertMany(docs) {
        const out = docs.map((d) => ({ id: newId(), ...d }));
        arr().push(...out.map(clone)); self.save(); return out;
      },
      async update(id, patch) {
        const d = arr().find((d) => d.id === id);
        if (!d) return null;
        Object.assign(d, clone(patch)); self.save(); return clone(d);
      },
      async remove(q) {
        const before = arr().length;
        self.data[name] = arr().filter((d) => !match(d, q));
        self.save(); return before - self.data[name].length;
      },
    };
  }
}

class MongoStore {
  constructor(db) { this.db = db; }
  col(name) {
    const c = this.db.collection(name);
    const P = { projection: { _id: 0 } };
    return {
      async find(q) { return c.find(q || {}, P).toArray(); },
      async findOne(q) { return c.findOne(q || {}, P); },
      async count(q) { return c.countDocuments(q || {}); },
      async insert(doc) { doc = { id: newId(), ...doc }; await c.insertOne({ ...doc }); return doc; },
      async insertMany(docs) {
        const out = docs.map((d) => ({ id: newId(), ...d }));
        if (out.length) await c.insertMany(out.map((d) => ({ ...d })));
        return out;
      },
      async update(id, patch) {
        await c.updateOne({ id }, { $set: patch });
        return c.findOne({ id }, P);
      },
      async remove(q) { return (await c.deleteMany(q || {})).deletedCount; },
    };
  }
}

async function createStore() {
  if (process.env.MONGODB_URI) {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'test_platformasi');
    await Promise.all([
      db.collection('users').createIndex({ id: 1 }, { unique: true }),
      db.collection('users').createIndex({ loginLower: 1 }),
      db.collection('questions').createIndex({ subjectId: 1 }),
      db.collection('attempts').createIndex({ userId: 1 }),
    ]);
    console.log('Ombor: MongoDB');
    return new MongoStore(db);
  }
  // Railway'da Volume ulangan bo'lsa, ma'lumotlar o'sha yerda saqlanadi (qayta ishga tushganda yo'qolmaydi)
  const vol = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  const file = process.env.DATA_FILE || (vol ? path.join(vol, 'db.json') : path.join(__dirname, '..', 'data', 'db.json'));
  console.log('Ombor: fayl (' + file + ')');
  return new FileStore(file);
}

module.exports = { createStore };
