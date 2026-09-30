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

  // 퀘스트 동기화
  assert.deepEqual((await call('/quests', { tok: a })).data, { quests: [], updatedAt: 0 }, 'no quests yet');
  const questsPayload = [
    { id: 'q1', title: '아침 운동', type: 'daily', category: '운동', difficulty: 'easy', xp: 20, gold: 4, status: 'active', weekdays: [1, 3, 5] },
    { id: 'q2', title: '<script>evil</script>', type: 'dated', category: '공부', difficulty: 'hard', xp: 999999, gold: -5, status: 'done', dueDate: '2026-01-01' },
    { title: '아이디 없음(무시됨)' },
  ];
  assert.equal((await call('/quests', { method: 'PUT', tok: a, body: { quests: questsPayload, updatedAt: 1234 } })).status, 200, 'save quests');
  const saved = (await call('/quests', { tok: a })).data;
  assert.equal(saved.quests.length, 2, 'id 없는 항목은 저장에서 제외');
  assert.equal(saved.quests[1].title, '<script>evil</script>', '텍스트는 그대로, 이스케이프는 클라이언트 책임');
  assert.equal(saved.quests[1].xp, 1e5, 'xp 상한 적용');
  assert.equal(saved.quests[1].gold, 0, 'gold 음수는 0으로 clamp');
  assert.equal(saved.updatedAt, 1234, 'updatedAt 반영');
  assert.equal((await call('/quests', { method: 'PUT', tok: b })).status, 400, 'quests 배열 없으면 거부');
  assert.equal((await call('/quests', { tok: c })).data.quests.length, 0, '다른 유저 데이터는 분리됨');

  // 프로필 (랭킹 전체 공개)
  assert.equal((await call('/profile/Alice')).status, 401, '프로필도 로그인 필요');
  assert.equal((await call('/profile/nobody', { tok: a })).status, 404, '없는 닉네임');
  const noProf = (await call('/profile/Alice', { tok: c })).data;
  assert.equal(noProf.profile, null, '아직 프로필 없음'); assert.equal(noProf.level, 3); assert.equal(noProf.friend, false);
  const profBody = { stats: { 힘: 30, 체력: 25, 지능: 12345678, 해킹: 9 }, equipped: { weapon: 'wpn_iron', armor: null, accessory: 'x'.repeat(99) },
    pets: [{ id: 'dragon', lv: 9 }, { id: 'horse', lv: 2 }, { id: 'golem', lv: 1 }], skin: 'gold', theme: 'cyber', achv: 7, streak: 12, cleared: 88, dungeonDays: 40,
    regions: { 공부: 4, 운동: 99 }, title: '견습 마도사', gold: 99999, quests: [{ title: '비밀' }] };
  assert.equal((await call('/score', { method: 'PUT', tok: a, body: { xp: 2500, cls: 'warrior', profile: profBody } })).status, 200, '프로필 저장');
  const pf = (await call('/profile/alice', { tok: c })).data; // 낯선 사람(랭킹 전체 공개)도 열람, 대소문자 무관
  assert.equal(pf.nick, 'Alice'); assert.equal(pf.friend, false); assert.equal(pf.me, false);
  assert.equal(pf.profile.stats.힘, 30); assert.equal(pf.profile.stats.지능, 99999, '스탯 상한'); assert.equal(pf.profile.stats.민첩, 0, '없는 스탯은 0'); assert.equal(pf.profile.stats.해킹, undefined, '허용하지 않은 키 제거');
  assert.equal(pf.profile.equipped.weapon, 'wpn_iron'); assert.equal(pf.profile.equipped.accessory.length, 30, '길이 제한');
  assert.deepEqual(pf.profile.pets, [{ id: 'dragon', lv: 5 }, { id: 'horse', lv: 2 }], '펫 2마리·Lv.5 상한');
  assert.equal(pf.profile.dungeonDays, 31); assert.equal(pf.profile.regions.운동, 10); assert.equal(pf.profile.regions.마을, undefined);
  assert.equal(pf.profile.gold, undefined, '골드는 저장하지 않음'); assert.equal(pf.profile.quests, undefined, '퀘스트는 저장하지 않음');
  assert.equal((await call('/profile/Alice', { tok: a })).data.me, true, '내 프로필 표시');
  assert.equal((await call('/profile/Bob', { tok: a })).data.friend, true, '친구 표시');
  await call('/score', { method: 'PUT', tok: a, body: { xp: 2600, cls: 'warrior' } }); // profile 필드가 없으면 유지
  assert.equal((await call('/profile/Alice', { tok: c })).data.profile.achv, 7, 'profile 미전송 시 유지');
  assert.equal((await call('/score', { method: 'PUT', tok: a, body: { xp: 2600, cls: 'warrior', profile: 'bad' } })).status, 400, '잘못된 프로필 거부');
  await call('/score', { method: 'PUT', tok: a, body: { xp: 2600, cls: 'warrior', profile: null } }); // 공개 끄기
  assert.equal((await call('/profile/Alice', { tok: c })).data.profile, null, '공개를 끄면 프로필 삭제');

  // 삭제
  await call('/friends/remove', { method: 'POST', tok: a, body: { nick: 'Bob' } });
  assert.equal((await call('/msgs', { method: 'POST', tok: b, body: { to: 'Alice', text: 'x' } })).status, 403, 'removed friend blocked');

  console.log('ALL TESTS PASSED');
})().catch((e) => { console.error('FAIL:', e.message); process.exitCode = 1; })
  .finally(async () => {
    srv.kill();
    try { const cl = await MongoClient.connect(URI); await cl.db(DB).dropDatabase(); await cl.close(); } catch {}
  });
