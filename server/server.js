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
app.use(express.json({ limit: '1mb' })); // 퀘스트 동기화 페이로드(최대 1000개)를 담기 위해 여유를 둠

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

let users, msgs, diaryRooms, diaryRoomEntries;

const auth = (req, res, next) => {
  try {
    req.uid = new ObjectId(jwt.verify((req.get('authorization') || '').replace('Bearer ', ''), JWT_SECRET).uid);
    next();
  } catch { bad(res, '로그인이 필요해요', 401); }
};
const token = (u) => jwt.sign({ uid: u._id.toString() }, JWT_SECRET, { expiresIn: '60d' });
const byNick = (n) => users.findOne({ nk: String(n || '').trim().toLowerCase() });
const meAndTarget = (req, nick) => Promise.all([users.findOne({ _id: req.uid }), byNick(nick)]);

// 알림은 보내기만 하고 기다리지 않으므로, 어떤 오류도 밖으로 새지 않게 모두 잡는다 (처리하지 않은 Promise 거부는 서버를 종료시킨다)
async function notify(userId, payload) {
  try {
    const u = await users.findOne({ _id: userId }, { projection: { push: 1 } });
    for (const sub of (u && u.push) || []) {
      webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high' }).catch((e) => {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) users.updateOne({ _id: userId }, { $pull: { push: { endpoint: sub.endpoint } } }).catch(() => {});
      });
    }
  } catch (e) { console.error('notify failed', e && e.message); }
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
  if (/[<>"'&`\\\u0000-\u001f]/.test(c.nick)) return bad(res, '닉네임에 쓸 수 없는 문자가 있어요');
  const doc = { nick: c.nick, nk: c.nick.toLowerCase(), hash: await bcrypt.hash(c.pw, 10), xp: 0, cls: '',
    friends: [], reqIn: [], reqOut: [], push: [], diary: [], at: new Date() };
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

// ---- 퀘스트 동기화 ----
// ponytail: same trust model as the score endpoint above -- fields are sanitized/
// truncated but not deeply verified. Fine for a personal/friends planner.
function sanitizeQuests(arr) {
  if (!Array.isArray(arr) || arr.length > 1000) return null;
  const out = [];
  for (const q of arr) {
    if (!q || typeof q !== 'object' || !q.id) continue;
    out.push({
      id: String(q.id).slice(0, 60),
      title: String(q.title || '').slice(0, 200),
      type: q.type === 'dated' ? 'dated' : 'daily',
      category: String(q.category || '').slice(0, 20),
      difficulty: String(q.difficulty || '').slice(0, 20),
      xp: Math.max(0, Math.min(1e5, Math.floor(Number(q.xp)) || 0)),
      gold: Math.max(0, Math.min(1e5, Math.floor(Number(q.gold)) || 0)),
      status: q.status === 'done' ? 'done' : 'active',
      lastDoneDate: q.lastDoneDate ? String(q.lastDoneDate).slice(0, 10) : null,
      completedDate: q.completedDate ? String(q.completedDate).slice(0, 10) : null,
      dueDate: q.dueDate ? String(q.dueDate).slice(0, 10) : null,
      weekdays: Array.isArray(q.weekdays) ? q.weekdays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6).slice(0, 7) : [],
      createdAt: q.createdAt ? String(q.createdAt).slice(0, 30) : null,
    });
  }
  return out;
}
app.get('/api/quests', auth, wrap(async (req, res) => {
  const u = await users.findOne({ _id: req.uid }, { projection: { quests: 1, questsAt: 1 } });
  res.json({ quests: (u && u.quests) || [], updatedAt: u && u.questsAt ? u.questsAt.getTime() : 0 });
}));
app.put('/api/quests', auth, wrap(async (req, res) => {
  const quests = sanitizeQuests(req.body.quests);
  if (!quests) return bad(res, '잘못된 퀘스트 데이터');
  // 기기 시계가 크게 앞서 있어도 항상 이기지 않도록, 미래 시각은 내일까지로 제한한다
  const at = Math.max(0, Math.min(Date.now() + 86400e3, Number(req.body.updatedAt) || Date.now()));
  await users.updateOne({ _id: req.uid }, { $set: { quests, questsAt: new Date(at) } });
  res.json({ ok: true });
}));

// ---- 랭킹 ----
// ponytail: score is client-reported (no anti-cheat). Fine for friends; validate server-side if strangers compete.
app.put('/api/score', auth, wrap(async (req, res) => {
  const xp = Math.floor(Number(req.body.xp)), cls = String(req.body.cls || '').slice(0, 20);
  if (!(xp >= 0 && xp <= 1e8)) return bad(res, '잘못된 값');
  const update = { $set: { xp, cls } };
  // profile: 객체면 저장(랭킹을 보는 모든 사용자에게 공개), null이면 공개를 끈 것으로 보고 지운다, 없으면 그대로 둔다
  if ('profile' in req.body) {
    if (req.body.profile === null) update.$unset = { profile: '', profileAt: '' };
    else {
      const profile = sanitizeProfile(req.body.profile);
      if (!profile) return bad(res, '잘못된 프로필');
      update.$set.profile = profile; update.$set.profileAt = new Date();
    }
  }
  await users.updateOne({ _id: req.uid }, update);
  res.json({ ok: true });
}));

// ---- 프로필 (랭킹 전체 공개) ----
// ponytail: 프로필도 점수와 같은 신뢰 수준(앱이 알려 주는 값). 허용한 필드만 저장하고 길이·범위를 제한한다.
// 골드·퀘스트 제목 같은 개인 정보는 받지도 저장하지도 않는다.
const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v)) || 0));
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const STAT_KEYS = ['힘', '체력', '지능', '민첩', '의지', '창의력', '사회성'];
const REGION_KEYS = ['공부', '운동', '창작', '생활', '기타', '사회'];
function sanitizeProfile(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const stats = {}; for (const k of STAT_KEYS) stats[k] = num(p.stats && p.stats[k], 0, 99999);
  const regions = {}; for (const k of REGION_KEYS) regions[k] = num(p.regions && p.regions[k], 1, 10);
  const eq = (p.equipped && typeof p.equipped === 'object') ? p.equipped : {};
  return {
    title: str(p.title, 20),
    stats, regions,
    equipped: { weapon: str(eq.weapon, 30) || null, armor: str(eq.armor, 30) || null, accessory: str(eq.accessory, 30) || null },
    pets: (Array.isArray(p.pets) ? p.pets : []).slice(0, 2).map((x) => ({ id: str(x && x.id, 20), lv: num(x && x.lv, 1, 5) })).filter((x) => x.id),
    skin: str(p.skin, 20) || null, theme: str(p.theme, 20) || null,
    achv: num(p.achv, 0, 999), streak: num(p.streak, 0, 99999), cleared: num(p.cleared, 0, 1e7), dungeonDays: num(p.dungeonDays, 0, 31),
  };
}
app.get('/api/profile/:nick', auth, wrap(async (req, res) => {
  if (!limit('prof:' + req.uid, 120, 60e3)) return bad(res, '잠시 후 다시 시도해 주세요', 429);
  const [me, t] = await Promise.all([users.findOne({ _id: req.uid }, { projection: { friends: 1 } }), byNick(req.params.nick)]);
  if (!t) return bad(res, '그 닉네임의 모험가가 없어요', 404);
  res.json({ ...pub(t), profile: t.profile || null, me: t._id.equals(req.uid), friend: !!(me && me.friends.some((f) => f.equals(t._id))) });
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
  const [me, t] = await meAndTarget(req, req.body.nick);
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
  const [me, t] = await meAndTarget(req, req.body.nick);
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
  const [me, t] = await meAndTarget(req, nick);
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
  msgs.updateMany({ from: f.t._id, to: req.uid, read: false }, { $set: { read: true } }).catch(() => {});
  res.json(list.map((m) => ({ id: m._id, mine: m.from.equals(req.uid), text: m.text, at: m.at })));
}));

// ---- 일기 (개인용, 날짜당 1개, 항상 비공개 -- 다른 사람과 나누려면 아래 '일기장(방)'을 쓴다) ----
// ponytail: 퀘스트 동기화와 같은 신뢰 수준 -- 필드는 다듬지만 깊이 검증하진 않는다.
const DIARY_MOODS = new Set(['good', 'ok', 'normal', 'hard', 'angry']);
function sanitizeDiary(arr) {
  if (!Array.isArray(arr) || arr.length > 366) return null;
  const out = [];
  for (const d of arr) {
    if (!d || typeof d !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) continue;
    const tags = Array.isArray(d.tags) ? d.tags.map((t) => String(t).trim().slice(0, 20)).filter(Boolean).slice(0, 7) : [];
    out.push({
      date: String(d.date),
      title: String(d.title || '').slice(0, 60),
      text: String(d.text || '').slice(0, 1000),
      mood: DIARY_MOODS.has(d.mood) ? d.mood : null,
      tags,
      updatedAt: Number(d.updatedAt) || Date.now(),
    });
  }
  return out;
}
app.get('/api/diary', auth, wrap(async (req, res) => {
  const u = await users.findOne({ _id: req.uid }, { projection: { diary: 1 } });
  res.json({ entries: (u && u.diary) || [] });
}));
app.put('/api/diary', auth, wrap(async (req, res) => {
  const entries = sanitizeDiary(req.body.entries);
  if (!entries) return bad(res, '잘못된 일기 데이터');
  await users.updateOne({ _id: req.uid }, { $set: { diary: entries } });
  res.json({ ok: true });
}));

// ---- 일기장(방): 코드를 공유해 여러 명이 함께 쓰는 공동 일기 (셋로그 방식) ----
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I/L은 뺀다
function genRoomCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  return c;
}
function sanitizeRoomName(n) { const s = String(n || '').trim().slice(0, 30); return s || null; }
async function roomMemberCheck(req, res, roomId) {
  let _id;
  try { _id = new ObjectId(String(roomId)); } catch { bad(res, '잘못된 일기장이에요', 404); return null; }
  const room = await diaryRooms.findOne({ _id });
  if (!room || !room.members.some((m) => m.equals(req.uid))) { bad(res, '일기장을 찾을 수 없어요', 404); return null; }
  return room;
}
app.post('/api/diary-rooms', auth, wrap(async (req, res) => {
  const name = sanitizeRoomName(req.body.name);
  if (!name) return bad(res, '일기장 이름을 입력하세요');
  const memberOf = await diaryRooms.countDocuments({ members: req.uid });
  if (memberOf >= 20) return bad(res, '참여 중인 일기장은 최대 20개까지예요');
  let code = null;
  for (let i = 0; i < 8 && !code; i++) {
    const tryCode = genRoomCode();
    if (!(await diaryRooms.findOne({ code: tryCode }))) code = tryCode;
  }
  if (!code) return bad(res, '코드를 만들지 못했어요. 다시 시도해주세요', 500);
  const doc = { code, name, ownerId: req.uid, members: [req.uid], createdAt: new Date() };
  doc._id = (await diaryRooms.insertOne(doc)).insertedId;
  res.json({ id: doc._id, name, code });
}));
app.post('/api/diary-rooms/join', auth, wrap(async (req, res) => {
  if (!limit('roomjoin:' + req.uid, 15, 60e3)) return bad(res, '너무 빨라요. 잠시 후 다시', 429);
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!code) return bad(res, '코드를 입력하세요');
  const room = await diaryRooms.findOne({ code });
  if (!room) return bad(res, '그 코드의 일기장을 찾을 수 없어요', 404);
  if (!room.members.some((m) => m.equals(req.uid))) {
    if (room.members.length >= 30) return bad(res, '이 일기장은 인원이 가득 찼어요');
    await diaryRooms.updateOne({ _id: room._id }, { $addToSet: { members: req.uid } });
  }
  res.json({ id: room._id, name: room.name, code: room.code });
}));
app.get('/api/diary-rooms', auth, wrap(async (req, res) => {
  const rooms = await diaryRooms.find({ members: req.uid }).sort({ createdAt: -1 }).toArray();
  res.json({ rooms: rooms.map((r) => ({ id: r._id, name: r.name, code: r.code, memberCount: r.members.length, isOwner: r.ownerId.equals(req.uid) })) });
}));
app.get('/api/diary-rooms/:id', auth, wrap(async (req, res) => {
  const room = await roomMemberCheck(req, res, req.params.id); if (!room) return;
  const members = await users.find({ _id: { $in: room.members } }, { projection: { nick: 1 } }).toArray();
  const entries = await diaryRoomEntries.find({ roomId: room._id }).sort({ date: -1, updatedAt: -1 }).limit(500).toArray();
  res.json({
    id: room._id, name: room.name, code: room.code, isOwner: room.ownerId.equals(req.uid),
    members: members.map((m) => ({ nick: m.nick })),
    entries: entries.map((e) => ({
      authorNick: e.authorNick, mine: e.authorId.equals(req.uid), date: e.date, title: e.title, text: e.text, mood: e.mood, tags: e.tags, updatedAt: e.updatedAt,
      notes: (e.notes || []).map((n) => ({ from: n.from, text: n.text, at: n.at })),
      stickers: (e.stickers || []).map((s) => ({ emoji: s.emoji, from: s.from, at: s.at })),
    })),
  });
}));
app.put('/api/diary-rooms/:id/entry', auth, wrap(async (req, res) => {
  const room = await roomMemberCheck(req, res, req.params.id); if (!room) return;
  const date = String(req.body.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad(res, '잘못된 날짜');
  const text = String(req.body.text || '').trim().slice(0, 1000);
  if (!text) return bad(res, '내용을 입력하세요');
  const title = String(req.body.title || '').slice(0, 60);
  const mood = DIARY_MOODS.has(req.body.mood) ? req.body.mood : null;
  const tags = Array.isArray(req.body.tags) ? req.body.tags.map((t) => String(t).trim().slice(0, 20)).filter(Boolean).slice(0, 5) : [];
  const me = await users.findOne({ _id: req.uid }, { projection: { nick: 1 } });
  await diaryRoomEntries.updateOne(
    { roomId: room._id, authorId: req.uid, date },
    { $set: { title, text, mood, tags, authorNick: me.nick, updatedAt: Date.now() } },
    { upsert: true }
  );
  res.json({ ok: true });
}));
app.post('/api/diary-rooms/:id/entry/delete', auth, wrap(async (req, res) => {
  const room = await roomMemberCheck(req, res, req.params.id); if (!room) return;
  const date = String(req.body.date || '');
  await diaryRoomEntries.deleteOne({ roomId: room._id, authorId: req.uid, date });
  res.json({ ok: true });
}));
// ---- 방 안의 글에 메모/스티커 남기기 (같은 방 멤버끼리만, 자기 글에도 남길 수 있다) ----
async function roomEntryTarget(req, res, roomId, authorNick, date) {
  const room = await roomMemberCheck(req, res, roomId); if (!room) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) { bad(res, '잘못된 날짜'); return null; }
  const target = await byNick(authorNick);
  if (!target || !room.members.some((m) => m.equals(target._id))) { bad(res, '그 글을 찾을 수 없어요', 404); return null; }
  return { room, targetId: target._id };
}
function sanitizeRoomNoteText(t) { return String(t || '').trim().slice(0, 200); }
function sanitizeStickerEmoji(s) { const v = String(s || '').trim().slice(0, 16); return v || null; }
app.post('/api/diary-rooms/:id/entry/note', auth, wrap(async (req, res) => {
  const text = sanitizeRoomNoteText(req.body.text);
  if (!text) return bad(res, '메모 내용을 입력하세요');
  if (!limit('roomnote:' + req.uid, 30, 60e3)) return bad(res, '너무 빨라요. 잠시 후 다시', 429);
  const ctx = await roomEntryTarget(req, res, req.params.id, req.body.authorNick, req.body.date); if (!ctx) return;
  const me = await users.findOne({ _id: req.uid }, { projection: { nick: 1 } });
  const note = { from: me.nick, text, at: Date.now() };
  const r = await diaryRoomEntries.updateOne(
    { roomId: ctx.room._id, authorId: ctx.targetId, date: String(req.body.date) },
    { $push: { notes: { $each: [note], $slice: -50 } } }
  );
  if (!r.matchedCount) return bad(res, '그 글을 찾을 수 없어요', 404);
  res.json({ ok: true, note });
}));
app.post('/api/diary-rooms/:id/entry/sticker', auth, wrap(async (req, res) => {
  const emoji = sanitizeStickerEmoji(req.body.emoji);
  if (!emoji) return bad(res, '스티커를 선택하세요');
  if (!limit('roomsticker:' + req.uid, 40, 60e3)) return bad(res, '너무 빨라요. 잠시 후 다시', 429);
  const ctx = await roomEntryTarget(req, res, req.params.id, req.body.authorNick, req.body.date); if (!ctx) return;
  const me = await users.findOne({ _id: req.uid }, { projection: { nick: 1 } });
  const sticker = { emoji, from: me.nick, at: Date.now() };
  const r = await diaryRoomEntries.updateOne(
    { roomId: ctx.room._id, authorId: ctx.targetId, date: String(req.body.date) },
    { $push: { stickers: { $each: [sticker], $slice: -60 } } }
  );
  if (!r.matchedCount) return bad(res, '그 글을 찾을 수 없어요', 404);
  res.json({ ok: true, sticker });
}));
app.post('/api/diary-rooms/:id/leave', auth, wrap(async (req, res) => {
  const room = await roomMemberCheck(req, res, req.params.id); if (!room) return;
  await diaryRooms.updateOne({ _id: room._id }, { $pull: { members: req.uid } });
  await diaryRoomEntries.deleteMany({ roomId: room._id, authorId: req.uid }); // 내가 쓴 글은 함께 들고 나간다
  const after = await diaryRooms.findOne({ _id: room._id });
  if (after && after.members.length === 0) {
    await diaryRooms.deleteOne({ _id: room._id });
    await diaryRoomEntries.deleteMany({ roomId: room._id });
  }
  res.json({ ok: true });
}));
app.post('/api/diary-rooms/:id/delete', auth, wrap(async (req, res) => {
  const room = await roomMemberCheck(req, res, req.params.id); if (!room) return;
  if (!room.ownerId.equals(req.uid)) return bad(res, '방장만 삭제할 수 있어요', 403);
  await diaryRooms.deleteOne({ _id: room._id });
  await diaryRoomEntries.deleteMany({ roomId: room._id });
  res.json({ ok: true });
}));

// ---- 푸시 구독 ----
// 서버가 이 주소로 요청을 보내므로, 알려진 브라우저 푸시 서비스만 허용한다 (임의 주소로의 요청 방지)
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
function isPushHost(endpoint) {
  try { const u = new URL(endpoint); return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname)); } catch { return false; }
}
app.post('/api/push', auth, wrap(async (req, res) => {
  const s = req.body.sub;
  if (!s || typeof s.endpoint !== 'string' || !s.endpoint.startsWith('https://') || !s.keys) return bad(res, '잘못된 구독');
  if (!isPushHost(s.endpoint)) return bad(res, '지원하지 않는 푸시 서비스예요');
  const sub = { endpoint: s.endpoint, keys: { p256dh: String(s.keys.p256dh), auth: String(s.keys.auth) } };
  // 같은 기기 구독이 다른 계정에 남아 있으면 그 계정의 알림이 계속 오므로 먼저 지운다
  await users.updateMany({ _id: { $ne: req.uid } }, { $pull: { push: { endpoint: sub.endpoint } } });
  await users.updateOne({ _id: req.uid }, { $pull: { push: { endpoint: sub.endpoint } } });
  await users.updateOne({ _id: req.uid }, { $push: { push: { $each: [sub], $slice: -5 } } });
  res.json({ ok: true });
}));

MongoClient.connect(MONGODB_URI).then(async (client) => {
  const db = client.db(process.env.DB_NAME || 'questplanner');
  users = db.collection('users'); msgs = db.collection('msgs');
  diaryRooms = db.collection('diaryRooms'); diaryRoomEntries = db.collection('diaryRoomEntries');
  await users.createIndex({ nk: 1 }, { unique: true });
  await users.createIndex({ xp: -1 });
  await msgs.createIndex({ to: 1, read: 1 });
  await msgs.createIndex({ from: 1, to: 1, _id: 1 });
  await diaryRooms.createIndex({ code: 1 }, { unique: true });
  await diaryRooms.createIndex({ members: 1 });
  await diaryRoomEntries.createIndex({ roomId: 1, authorId: 1, date: 1 }, { unique: true });
  await diaryRoomEntries.createIndex({ roomId: 1, date: -1 });
  app.listen(PORT, () => console.log('quest-planner server on ' + PORT));
}).catch((e) => { console.error(e); process.exit(1); });
