// End-to-end smoke test: node test.js  (needs a local MongoDB on 27017; uses a throwaway DB and drops it)
const { spawn } = require('child_process');
const assert = require('assert');
const webpush = require('web-push');
const { MongoClient } = require('mongodb');

const PORT = 4100 + Math.floor(Math.random() * 500), DB = 'qp_test_' + Date.now();
const URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017';
const vapid = webpush.generateVAPIDKeys();
const srv = spawn(process.execPath, ['server.js'], { stdio: 'inherit', env: { ...process.env, PORT, DB_NAME: DB, MONGODB_URI: URI,
  JWT_SECRET: 'test-secret', VAPID_PUBLIC: vapid.publicKey, VAPID_PRIVATE: vapid.privateKey } });

const call = async (path, { method = 'GET', body, tok } = {}) => {
  const r = await fetch(`http://127.0.0.1:${PORT}/api${path}`, { method, headers: { 'content-type': 'application/json', ...(tok && { authorization: 'Bearer ' + tok }) }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
};

(async () => {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/health`); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }

  const a = (await call('/register', { method: 'POST', body: { nick: 'Alice', pw: 'secret1' } })).data.token;
  const b = (await call('/register', { method: 'POST', body: { nick: 'Bob', pw: 'secret2' } })).data.token;
  const c = (await call('/register', { method: 'POST', body: { nick: 'Carol', pw: 'secret3' } })).data.token;
  assert(a && b && c, 'register');
  assert.equal((await call('/register', { method: 'POST', body: { nick: 'alice', pw: 'secret9' } })).status, 409, 'duplicate nick (case-insensitive)');
  assert.equal((await call('/login', { method: 'POST', body: { nick: 'Alice', pw: 'wrong!!' } })).status, 401, 'bad password');
  assert.equal((await call('/login', { method: 'POST', body: { nick: 'ALICE', pw: 'secret1' } })).status, 200, 'login');
  assert.equal((await call('/friends')).status, 401, 'auth required');

  await call('/score', { method: 'PUT', tok: a, body: { xp: 2500, cls: 'warrior' } });
  await call('/score', { method: 'PUT', tok: b, body: { xp: 9000, cls: 'mage' } });
  assert.equal((await call('/score', { method: 'PUT', tok: c, body: { xp: -5 } })).status, 400, 'reject negative xp');
  const rank = (await call('/rank', { tok: a })).data;
  assert.deepEqual(rank.top.map((u) => u.nick), ['Bob', 'Alice', 'Carol'], 'rank order');
  assert.equal(rank.me.rank, 2); assert.equal(rank.me.level, 3);

  // 친구 아님 → 대화 불가
  assert.equal((await call('/msgs', { method: 'POST', tok: a, body: { to: 'Bob', text: 'hi' } })).status, 403, 'non-friend msg blocked');
  assert.equal((await call('/friends/request', { method: 'POST', tok: a, body: { nick: 'Alice' } })).status, 400, 'self add');
  assert.equal((await call('/friends/request', { method: 'POST', tok: a, body: { nick: 'nobody' } })).status, 404);
  assert.equal((await call('/friends/request', { method: 'POST', tok: a, body: { nick: 'bob' } })).status, 200);
  assert.deepEqual((await call('/friends', { tok: b })).data.requests.map((u) => u.nick), ['Alice'], 'request visible');
  assert.equal((await call('/friends/respond', { method: 'POST', tok: c, body: { nick: 'Alice', accept: true } })).status, 404, 'no request for carol');
  assert.equal((await call('/friends/respond', { method: 'POST', tok: b, body: { nick: 'Alice', accept: true } })).status, 200);
  assert.equal((await call('/friends', { tok: a })).data.friends[0].nick, 'Bob');

  // 대화
  await call('/msgs', { method: 'POST', tok: a, body: { to: 'Bob', text: '안녕!' } });
  await call('/msgs', { method: 'POST', tok: a, body: { to: 'Bob', text: '<b>x</b>' } });
  assert.equal((await call('/friends', { tok: b })).data.friends[0].unread, 2, 'unread badge');
  const conv = (await call('/msgs?with=Alice', { tok: b })).data;
  assert.deepEqual(conv.map((m) => [m.mine, m.text]), [[false, '안녕!'], [false, '<b>x</b>']]);
  assert.equal((await call('/friends', { tok: b })).data.friends[0].unread, 0, 'read clears badge');
  await call('/msgs', { method: 'POST', tok: b, body: { to: 'Alice', text: '반가워' } });
  const more = (await call(`/msgs?with=Alice&after=${conv[1].id}`, { tok: b })).data;
  assert.deepEqual(more.map((m) => [m.mine, m.text]), [[true, '반가워']], 'incremental fetch');
  assert.equal((await call('/msgs', { method: 'POST', tok: c, body: { to: 'Alice', text: 'yo' } })).status, 403, 'stranger blocked');
  assert.equal((await call('/msgs?with=Alice', { tok: c })).status, 403, 'stranger cannot read');

  // 푸시 구독 저장
  assert.equal((await call('/push', { method: 'POST', tok: a, body: { sub: { endpoint: 'http://bad', keys: {} } } })).status, 400, 'reject non-https endpoint');
  assert.equal((await call('/push', { method: 'POST', tok: a, body: { sub: { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } } } })).status, 200);
  assert.equal((await call('/vapid')).data.key, vapid.publicKey);

  // 삭제
  await call('/friends/remove', { method: 'POST', tok: a, body: { nick: 'Bob' } });
  assert.equal((await call('/msgs', { method: 'POST', tok: b, body: { to: 'Alice', text: 'x' } })).status, 403, 'removed friend blocked');

  console.log('ALL TESTS PASSED');
})().catch((e) => { console.error('FAIL:', e.message); process.exitCode = 1; })
  .finally(async () => {
    srv.kill();
    try { const cl = await MongoClient.connect(URI); await cl.db(DB).dropDatabase(); await cl.close(); } catch {}
  });
