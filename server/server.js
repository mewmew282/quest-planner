const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');
const { MongoClient, ObjectId } = require('mongodb');

const { MONGODB_URI, JWT_SECRET, VAPID_PUBLIC, VAPID_PRIVATE, PORT = 4000,
  ALLOWED_ORIGINS = 'https://mewmew282.github.io,http://localhost:8080,http://127.0.0.1:8080' } = process.env;
for (const k of ['MONGODB_URI', 'JWT_SECRET', 'VAPID_PUBLIC', 'VAPID_PRIVATE']) {
  if (!process.env[k]) { console.error('missing env ' + k); process.exit(1); }
}
webpush.setVapidDetails('mailto:noreply@quest-planner.invalid', VAPID_PUBLIC, VAPID_PRIVATE);

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: ALLOWED_ORIGINS.split(',') }));
app.use(express.json({ limit: '10kb' }));

const levelOf = (xp) => Math.floor(xp / 1000) + 1;
const pub = (u) => ({ nick: u.nick, xp: u.xp, level: levelOf(u.xp), cls: u.cls });
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: '서버 오류' }); });
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

// ponytail: in-memory limiter, per instance. Move to Mongo/Redis if the server ever runs >1 instance.
const hits = new Map();
const limit = (key, max, ms) => {
  const now = Date.now(), h = (hits.get(key) || []).filter((t) => now - t < ms);
  h.push(now); hits.set(key, h);
  return h.length <= max;
};
setInterval(() => hits.clear(), 3600e3).unref();

let users, msgs;

const auth = (req, res, next) => {
  try {
    req.uid = new ObjectId(jwt.verify((req.get('authorization') || '').replace('Bearer ', ''), JWT_SECRET).uid);
    next();
  } catch { bad(res, '로그인이 필요해요', 401); }
};
const token = (u) => jwt.sign({ uid: u._id.toString() }, JWT_SECRET, { expiresIn: '60d' });
const byNick = (n) => users.findOne({ nk: String(n || '').trim().toLowerCase() });

async function notify(userId, payload) {
  const u = await users.findOne({ _id: userId }, { projection: { push: 1 } });
  for (const sub of (u && u.push) || []) {
    webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600 }).catch((e) => {
      if (e.statusCode === 404 || e.statusCode === 410) users.updateOne({ _id: userId }, { $pull: { push: { endpoint: sub.endpoint } } });
    });
  }
}

app.get('/health', (_, res) => res.send('ok'));
app.get('/api/vapid', (_, res) => res.json({ key: VAPID_PUBLIC }));

// ---- 계정 ----
async function credentials(req, res) {
  const nick = String(req.body.nick || '').trim(), pw = String(req.body.pw || '');
  if (!limit('auth:' + req.ip, 20, 600e3)) { bad(res, '잠시 후 다시 시도해 주세요', 429); return null; }
  if (nick.length < 2 || nick.length > 10) { bad(res, '닉네임은 2~10자'); return null; }
  if (pw.length < 6 || pw.length > 72) { bad(res, '비밀번호는 6자 이상'); return null; }
  return { nick, pw };
}
app.post('/api/register', wrap(async (req, res) => {
  const c = await credentials(req, res); if (!c) return;
  const doc = { nick: c.nick, nk: c.nick.toLowerCase(), hash: await bcrypt.hash(c.pw, 10), xp: 0, cls: '',
    friends: [], reqIn: [], reqOut: [], push: [], at: new Date() };
  try { doc._id = (await users.insertOne(doc)).insertedId; }
  catch (e) { if (e.code === 11000) return bad(res, '이미 있는 닉네임이에요', 409); throw e; }
  res.json({ token: token(doc), me: pub(doc) });
}));
app.post('/api/login', wrap(async (req, res) => {
  const c = await credentials(req, res); if (!c) return;
  const u = await byNick(c.nick);
  if (!u || !(await bcrypt.compare(c.pw, u.hash))) return bad(res, '닉네임 또는 비밀번호가 달라요', 401);
  res.json({ token: token(u), me: pub(u) });
}));

// ---- 랭킹 ----
// ponytail: score is client-reported (no anti-cheat). Fine for friends; validate server-side if strangers compete.
app.put('/api/score', auth, wrap(async (req, res) => {
  const xp = Math.floor(Number(req.body.xp)), cls = String(req.body.cls || '').slice(0, 20);
  if (!(xp >= 0 && xp <= 1e8)) return bad(res, '잘못된 값');
  await users.updateOne({ _id: req.uid }, { $set: { xp, cls } });
  res.json({ ok: true });
}));
app.get('/api/rank', auth, wrap(async (req, res) => {
  const me = await users.findOne({ _id: req.uid });
  const [top, ahead] = await Promise.all([
    users.find({}, { projection: { nick: 1, xp: 1, cls: 1 } }).sort({ xp: -1, _id: 1 }).limit(50).toArray(),
    users.countDocuments({ xp: { $gt: me.xp } }),
  ]);
  res.json({ top: top.map(pub), me: { ...pub(me), rank: ahead + 1 } });
}));

// ---- 친구 ----
app.get('/api/friends', auth, wrap(async (req, res) => {
  const me = await users.findOne({ _id: req.uid });
  const proj = { projection: { nick: 1, xp: 1, cls: 1 } };
  const [fr, rq, unread] = await Promise.all([
    users.find({ _id: { $in: me.friends } }, proj).toArray(),
    users.find({ _id: { $in: me.reqIn } }, proj).toArray(),
    msgs.aggregate([{ $match: { to: req.uid, read: false } }, { $group: { _id: '$from', n: { $sum: 1 } } }]).toArray(),
  ]);
  const n = Object.fromEntries(unread.map((x) => [x._id.toString(), x.n]));
  res.json({
    friends: fr.map((u) => ({ ...pub(u), unread: n[u._id.toString()] || 0 })).sort((a, b) => b.xp - a.xp),
    requests: rq.map(pub), sent: me.reqOut.length,
  });
}));
app.post('/api/friends/request', auth, wrap(async (req, res) => {
  const [me, t] = await Promise.all([users.findOne({ _id: req.uid }), byNick(req.body.nick)]);
  if (!t) return bad(res, '그 닉네임의 모험가가 없어요', 404);
  if (t._id.equals(me._id)) return bad(res, '나 자신은 친구로 추가할 수 없어요');
  if (me.friends.some((f) => f.equals(t._id))) return bad(res, '이미 친구예요');
  if (me.reqIn.some((f) => f.equals(t._id))) return accept(me, t, res); // 서로 신청 → 바로 친구
  await Promise.all([users.updateOne({ _id: t._id }, { $addToSet: { reqIn: me._id } }),
    users.updateOne({ _id: me._id }, { $addToSet: { reqOut: t._id } })]);
  notify(t._id, { title: '👥 친구 요청', body: `${me.nick}님이 친구 신청을 보냈어요`, tag: 'friend' });
  res.json({ ok: true });
}));
async function accept(me, t, res) {
  await Promise.all([
    users.updateOne({ _id: me._id }, { $addToSet: { friends: t._id }, $pull: { reqIn: t._id, reqOut: t._id } }),
    users.updateOne({ _id: t._id }, { $addToSet: { friends: me._id }, $pull: { reqIn: me._id, reqOut: me._id } }),
  ]);
  notify(t._id, { title: '🤝 친구 수락', body: `${me.nick}님과 친구가 됐어요`, tag: 'friend' });
  res.json({ ok: true, accepted: true });
}
app.post('/api/friends/respond', auth, wrap(async (req, res) => {
  const [me, t] = await Promise.all([users.findOne({ _id: req.uid }), byNick(req.body.nick)]);
  if (!t || !me.reqIn.some((f) => f.equals(t._id))) return bad(res, '받은 요청이 없어요', 404);
  if (req.body.accept) return accept(me, t, res);
  await Promise.all([users.updateOne({ _id: me._id }, { $pull: { reqIn: t._id } }),
    users.updateOne({ _id: t._id }, { $pull: { reqOut: me._id } })]);
  res.json({ ok: true });
}));
app.post('/api/friends/remove', auth, wrap(async (req, res) => {
  const t = await byNick(req.body.nick);
  if (!t) return bad(res, '없는 사용자', 404);
  await Promise.all([users.updateOne({ _id: req.uid }, { $pull: { friends: t._id } }),
    users.updateOne({ _id: t._id }, { $pull: { friends: req.uid } })]);
  res.json({ ok: true });
}));

// ---- 대화 (친구끼리만) ----
async function friendOf(req, res, nick) {
  const [me, t] = await Promise.all([users.findOne({ _id: req.uid }), byNick(nick)]);
  if (!t || !me.friends.some((f) => f.equals(t._id))) { bad(res, '친구에게만 보낼 수 있어요', 403); return null; }
  return { me, t };
}
app.post('/api/msgs', auth, wrap(async (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 300);
  if (!text) return bad(res, '내용을 입력하세요');
  if (!limit('msg:' + req.uid, 30, 60e3)) return bad(res, '너무 빨라요. 잠시 후 다시', 429);
  const f = await friendOf(req, res, req.body.to); if (!f) return;
  const m = { from: f.me._id, to: f.t._id, text, at: new Date(), read: false };
  m._id = (await msgs.insertOne(m)).insertedId;
  notify(f.t._id, { title: `💬 ${f.me.nick}`, body: text.slice(0, 100), tag: 'msg:' + f.me._id });
  res.json({ id: m._id, mine: true, text, at: m.at });
}));
app.get('/api/msgs', auth, wrap(async (req, res) => {
  const f = await friendOf(req, res, req.query.with); if (!f) return;
  const q = { $or: [{ from: req.uid, to: f.t._id }, { from: f.t._id, to: req.uid }] };
  if (req.query.after) { try { q._id = { $gt: new ObjectId(String(req.query.after)) }; } catch { return bad(res, '잘못된 값'); } }
  let list = await msgs.find(q).sort({ _id: req.query.after ? 1 : -1 }).limit(req.query.after ? 100 : 50).toArray();
  if (!req.query.after) list.reverse();
  msgs.updateMany({ from: f.t._id, to: req.uid, read: false }, { $set: { read: true } });
  res.json(list.map((m) => ({ id: m._id, mine: m.from.equals(req.uid), text: m.text, at: m.at })));
}));

// ---- 푸시 구독 ----
app.post('/api/push', auth, wrap(async (req, res) => {
  const s = req.body.sub;
  if (!s || typeof s.endpoint !== 'string' || !s.endpoint.startsWith('https://') || !s.keys) return bad(res, '잘못된 구독');
  const sub = { endpoint: s.endpoint, keys: { p256dh: String(s.keys.p256dh), auth: String(s.keys.auth) } };
  await users.updateOne({ _id: req.uid }, { $pull: { push: { endpoint: sub.endpoint } } });
  await users.updateOne({ _id: req.uid }, { $push: { push: { $each: [sub], $slice: -5 } } });
  res.json({ ok: true });
}));

MongoClient.connect(MONGODB_URI).then(async (client) => {
  const db = client.db(process.env.DB_NAME || 'questplanner');
  users = db.collection('users'); msgs = db.collection('msgs');
  await users.createIndex({ nk: 1 }, { unique: true });
  await users.createIndex({ xp: -1 });
  await msgs.createIndex({ to: 1, read: 1 });
  await msgs.createIndex({ from: 1, to: 1, _id: 1 });
  app.listen(PORT, () => console.log('quest-planner server on ' + PORT));
}).catch((e) => { console.error(e); process.exit(1); });
