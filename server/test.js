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
  assert.equal((await call('/push', { method: 'POST', tok: a, body: { sub: { endpoint: 'https://internal.service/abc', keys: { p256dh: 'k', auth: 'a' } } } })).status, 400, '알려지지 않은 주소(SSRF) 거부');
  assert.equal((await call('/push', { method: 'POST', tok: a, body: { sub: { endpoint: 'https://fcm.googleapis.com.evil.example/x', keys: { p256dh: 'k', auth: 'a' } } } })).status, 400, '비슷한 이름의 가짜 주소 거부');
  assert.equal((await call('/push', { method: 'POST', tok: a, body: { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'k', auth: 'a' } } } })).status, 200);
  assert.equal((await call('/push', { method: 'POST', tok: b, body: { sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'k', auth: 'a' } } } })).status, 200, '같은 기기를 다른 계정이 구독');
  const mc = await MongoClient.connect(URI); const pushOf = async (nick) => (await mc.db(DB).collection('users').findOne({ nick })).push.length; // 같은 구독은 한 계정에만 남는다
  assert.equal(await pushOf('Alice'), 0, '이전 계정의 구독은 정리됨'); assert.equal(await pushOf('Bob'), 1); await mc.close();
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
  const d = (await call('/register', { method: 'POST', body: { nick: 'Dave', pw: 'secret4' } })).data.token; // 대량 저장 시험용 별도 사용자
  const many = (n) => Array.from({ length: n }, (_, i) => ({ id: 'm' + i, title: '긴 한글 제목 '.repeat(8), type: 'daily', category: '공부', difficulty: 'easy', xp: 5, gold: 1, status: 'active' }));
  assert.equal((await call('/quests', { method: 'PUT', tok: d, body: { quests: many(400), updatedAt: 1 } })).status, 200, '300개를 넘어도 저장(최대 1000개, 큰 한글 제목도 본문 제한 안)');
  assert.equal((await call('/quests', { tok: d })).data.quests.length, 400);
  assert.equal((await call('/quests', { method: 'PUT', tok: d, body: { quests: many(1001), updatedAt: 1 } })).status, 400, '1000개 초과는 거부');
  await call('/quests', { method: 'PUT', tok: d, body: { quests: many(1), updatedAt: 9e15 } });
  assert((await call('/quests', { tok: d })).data.updatedAt <= Date.now() + 86400e3 + 5000, '먼 미래 시각은 내일로 제한');
  assert.equal((await call('/register', { method: 'POST', body: { nick: 'a"onclick=x', pw: 'secret9' } })).status, 400, '닉네임의 따옴표·꺾쇠 거부');
  assert.equal((await call('/register', { method: 'POST', body: { nick: '<b>hi', pw: 'secret9' } })).status, 400, '닉네임의 HTML 문자 거부');
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

  // 개인 일기 (항상 비공개, 다듬기만 검증)
  await call('/friends/request', { method: 'POST', tok: a, body: { nick: 'Carol' } });
  await call('/friends/respond', { method: 'POST', tok: c, body: { nick: 'Alice', accept: true } });
  const diaryPayload = [
    { date: '2026-01-01', title: '제목', text: '비공개 일기', mood: 'bogus', tags: Array.from({ length: 10 }, (_, i) => 't' + i), updatedAt: 1 },
  ];
  assert.equal((await call('/diary', { method: 'PUT', tok: a, body: { entries: diaryPayload } })).status, 200, 'save diary');
  const ownEntries = (await call('/diary', { tok: a })).data.entries;
  assert.equal(ownEntries.length, 1, '개인 일기 저장됨');
  assert.equal(ownEntries[0].mood, null, '알 수 없는 mood 값은 null로 정제됨');
  assert.equal(ownEntries[0].tags.length, 7, 'tags는 최대 7개로 잘림');

  // 일기장(방): 코드를 공유해 함께 쓰는 공동 일기
  const roomRes = (await call('/diary-rooms', { method: 'POST', tok: a, body: { name: '우리들의 기록' } })).data;
  assert(roomRes.id && /^[A-Z0-9]{6}$/.test(roomRes.code), 'create room with a 6-char code');
  assert.equal((await call('/diary-rooms', { method: 'POST', tok: a, body: { name: '' } })).status, 400, '이름 없는 방 거부');
  assert.equal((await call('/diary-rooms/join', { method: 'POST', tok: b, body: { code: 'ZZZZZZ' } })).status, 404, '없는 코드 거부');
  assert.equal((await call('/diary-rooms/join', { method: 'POST', tok: b, body: { code: roomRes.code } })).status, 200, 'Bob joins by code');
  const roomListA = (await call('/diary-rooms', { tok: a })).data.rooms;
  assert.equal(roomListA.length, 1, 'Alice sees the room she created');
  assert.equal(roomListA[0].isOwner, true, 'Alice is owner');
  assert.equal((await call('/diary-rooms/' + roomRes.id, { tok: c })).status, 404, '멤버가 아니면 방에 접근 못 함');

  assert.equal((await call('/diary-rooms/' + roomRes.id + '/entry', { method: 'PUT', tok: a, body: { date: '2026-02-01', title: '첫 글', text: 'Alice의 하루', mood: 'good', tags: ['여행'] } })).status, 200, 'Alice writes an entry');
  assert.equal((await call('/diary-rooms/' + roomRes.id + '/entry', { method: 'PUT', tok: b, body: { date: '2026-02-01', text: 'Bob의 하루' } })).status, 200, 'Bob writes an entry the same day');
  assert.equal((await call('/diary-rooms/' + roomRes.id + '/entry', { method: 'PUT', tok: c, body: { date: '2026-02-01', text: '나도 쓸래' } })).status, 404, '멤버가 아니면 못 씀');
  const roomDetail = (await call('/diary-rooms/' + roomRes.id, { tok: b })).data;
  assert.equal(roomDetail.members.length, 2, '방 멤버 2명');
  assert.equal(roomDetail.entries.length, 2, '같은 날 두 멤버의 글이 모두 보임');
  const bobsOwnEntry = roomDetail.entries.find((e) => e.authorNick === 'Bob');
  assert.equal(bobsOwnEntry.mine, true, '본인 글은 mine=true');
  const alicesEntryFromBobView = roomDetail.entries.find((e) => e.authorNick === 'Alice');
  assert.equal(alicesEntryFromBobView.mine, false, '남의 글은 mine=false');
  assert.equal(alicesEntryFromBobView.title, '첫 글', '멤버는 다른 사람 글의 제목도 봄');

  // 같은 날 다시 PUT하면 새 글이 아니라 내 글이 덮어써진다 (방+작성자+날짜 유니크)
  await call('/diary-rooms/' + roomRes.id + '/entry', { method: 'PUT', tok: a, body: { date: '2026-02-01', title: '수정됨', text: '고친 내용' } });
  const afterEdit = (await call('/diary-rooms/' + roomRes.id, { tok: a })).data.entries;
  assert.equal(afterEdit.length, 2, '같은 날 재저장은 새 글이 아니라 덮어쓰기');
  assert.equal(afterEdit.find((e) => e.authorNick === 'Alice').title, '수정됨', '수정 내용 반영');

  // 방 안에서 서로 메모/스티커로 꾸미기
  assert.equal((await call('/diary-rooms/' + roomRes.id + '/entry/note', { method: 'POST', tok: b, body: { authorNick: 'Alice', date: '2026-02-01', text: '' } })).status, 400, '빈 메모 거부');
  assert.equal((await call('/diary-rooms/' + roomRes.id + '/entry/note', { method: 'POST', tok: c, body: { authorNick: 'Alice', date: '2026-02-01', text: '나도 볼래' } })).status, 404, '멤버가 아니면 메모 못 남김');
  assert.equal((await call('/diary-rooms/' + roomRes.id + '/entry/note', { method: 'POST', tok: b, body: { authorNick: 'Alice', date: '2026-02-01', text: '멋진 하루였겠다!' } })).status, 200, '멤버는 서로의 글에 메모 남김');
  assert.equal((await call('/diary-rooms/' + roomRes.id + '/entry/sticker', { method: 'POST', tok: b, body: { authorNick: 'Alice', date: '2026-02-01', emoji: '' } })).status, 400, '빈 스티커 거부');
  assert.equal((await call('/diary-rooms/' + roomRes.id + '/entry/sticker', { method: 'POST', tok: b, body: { authorNick: 'Alice', date: '2026-02-01', emoji: '❤️' } })).status, 200, '멤버는 서로의 글에 스티커 남김');
  assert.equal((await call('/diary-rooms/' + roomRes.id + '/entry/note', { method: 'POST', tok: a, body: { authorNick: 'Alice', date: '2026-01-01', text: '없는 날짜' } })).status, 404, '없는 날짜의 글에는 메모 못 남김');
  const afterDecorate = (await call('/diary-rooms/' + roomRes.id, { tok: a })).data.entries.find((e) => e.authorNick === 'Alice');
  assert.deepEqual(afterDecorate.notes.map((n) => [n.from, n.text]), [['Bob', '멋진 하루였겠다!']], '메모가 반영됨');
  assert.deepEqual(afterDecorate.stickers.map((s) => [s.from, s.emoji]), [['Bob', '❤️']], '스티커가 반영됨');

  await call('/diary-rooms/' + roomRes.id + '/entry/delete', { method: 'POST', tok: b, body: { date: '2026-02-01' } });
  const afterBobDelete = (await call('/diary-rooms/' + roomRes.id, { tok: a })).data.entries;
  assert.equal(afterBobDelete.length, 1, 'Bob이 자기 글을 지우면 1개만 남음');

  assert.equal((await call('/diary-rooms/' + roomRes.id + '/delete', { method: 'POST', tok: b })).status, 403, '방장만 방을 삭제할 수 있음');
  await call('/diary-rooms/' + roomRes.id + '/leave', { method: 'POST', tok: b });
  const roomListBAfterLeave = (await call('/diary-rooms', { tok: b })).data.rooms;
  assert.equal(roomListBAfterLeave.length, 0, '나간 뒤에는 목록에서 사라짐');
  assert.equal((await call('/diary-rooms/' + roomRes.id, { tok: b })).status, 404, '나간 방에는 더 이상 접근 못 함');
  await call('/diary-rooms/' + roomRes.id + '/delete', { method: 'POST', tok: a });
  assert.equal((await call('/diary-rooms/' + roomRes.id, { tok: a })).status, 404, '방장이 삭제하면 방 자체가 사라짐');

  // 삭제
  await call('/friends/remove', { method: 'POST', tok: a, body: { nick: 'Bob' } });
  assert.equal((await call('/msgs', { method: 'POST', tok: b, body: { to: 'Alice', text: 'x' } })).status, 403, 'removed friend blocked');

  console.log('ALL TESTS PASSED');
})().catch((e) => { console.error('FAIL:', e.message); process.exitCode = 1; })
  .finally(async () => {
    srv.kill();
    try { const cl = await MongoClient.connect(URI); await cl.db(DB).dropDatabase(); await cl.close(); } catch {}
  });
