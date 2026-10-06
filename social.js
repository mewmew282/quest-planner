/* 소셜: 랭킹 · 친구 · 대화 · 푸시 알림. 서버 주소는 API_URL (localStorage 'qp_api' 로 덮어쓰기 가능) */
(function(){
const API_URL = localStorage.getItem('qp_api') ||
  (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:4000' : 'https://quest-planner-api.onrender.com');
const $ = (id)=>document.getElementById(id);
let token = localStorage.getItem('qp_token'), myNick = localStorage.getItem('qp_nick');
let view = 'rank', chatWith = null, lastMsgId = null, pollTimer = null;

const css = document.createElement('style');
css.textContent = `
#screen-social input[type=text],#screen-social input[type=password]{width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:var(--radius-s);padding:12px 14px;font-size:16px;margin-bottom:10px}
.soc-tabs{display:flex;gap:6px;margin:12px 0}
.soc-tabs button{flex:1;padding:10px 0;border-radius:var(--radius-s);background:var(--card);color:var(--text-dim);border:1px solid var(--border);font-weight:700;font-size:13px}
.soc-tabs button.on{background:var(--card-hi);color:var(--gold);border-color:var(--gold-dim)}
.soc-row{display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:6px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-s)}
.soc-row.me{border-color:var(--gold-dim);background:var(--card-hi)}
.soc-row .rk{width:26px;text-align:center;font-weight:800;color:var(--gold)}
.soc-row .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.soc-row .sub{font-size:11.5px;color:var(--text-dim);white-space:nowrap}
.soc-row button{padding:7px 10px;border-radius:8px;background:var(--card-hi);color:var(--text);border:1px solid var(--border);font-size:12px}
.soc-badge{background:var(--danger);color:#fff;border-radius:999px;font-size:11px;padding:1px 7px;font-weight:800}
.soc-err{color:var(--danger);font-size:12.5px;min-height:18px;margin:4px 0}
.soc-chat{display:flex;flex-direction:column;gap:6px;height:48vh;overflow-y:auto;padding:8px;background:var(--bg-elev);border:1px solid var(--border);border-radius:var(--radius-s);margin:10px 0}
.soc-msg{max-width:80%;padding:8px 11px;border-radius:14px;font-size:14px;line-height:1.4;word-break:break-word;white-space:pre-wrap;background:var(--card-hi)}
.soc-msg.mine{align-self:flex-end;background:var(--gold-dim);color:#fff}
.soc-msg.pending{opacity:.55}
.soc-msg.fail{background:var(--danger);color:#fff;cursor:pointer}.soc-msg.fail::after{content:' ⚠ 탭해서 재시도';font-size:11px;opacity:.85}
#screen-social.chat{padding-bottom:12px}
.soc-send{display:flex;gap:8px}.soc-send input{margin:0!important}.soc-send .btn{padding:0 18px}`;
document.head.appendChild(css);
const css2 = document.createElement('style');
css2.textContent = `
.soc-share{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--text-dim);margin:0 0 10px}
.soc-prof{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:10000;display:flex;align-items:center;justify-content:center;padding:14px}
.soc-prof-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;width:100%;max-width:360px;max-height:86vh;overflow-y:auto;color:var(--text)}
.soc-prof-head{display:flex;gap:12px;align-items:center;margin-bottom:6px}
.soc-prof-ic{font-size:44px;width:64px;height:64px;border-radius:50%;border:2px solid var(--gold-dim);display:flex;align-items:center;justify-content:center;background:var(--card-hi)}
.soc-prof-head .sub,.soc-line .sub{font-size:11.5px;color:var(--text-dim)}
.soc-prof-card h4{margin:14px 0 6px;font-size:12px;letter-spacing:.04em;color:var(--text-dim)}
.soc-stat{display:grid;grid-template-columns:82px 1fr 34px;gap:8px;align-items:center;font-size:12px;margin:3px 0}
.soc-stat i{display:block;height:6px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden}.soc-stat b{display:block;height:100%;background:var(--gold)}
.soc-stat em{font-style:normal;text-align:right;color:var(--text-dim)}
.soc-line{font-size:13px;margin:3px 0;display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}
.soc-regions{display:flex;flex-wrap:wrap;gap:6px}.soc-regions span{font-size:11.5px;padding:4px 8px;border:1px solid var(--border);border-radius:8px}
.soc-prof-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}`;
document.head.appendChild(css2);

document.addEventListener('click', (e)=>{
  const el = e.target.closest('#screen-social [data-prof]');
  if(el && !e.target.closest('button')) openProfile(el.dataset.prof);
});
const sc = document.createElement('div');
sc.className = 'screen hidden'; sc.id = 'screen-social';
$('screen-settings').after(sc);

async function api(path, {method='GET', body}={}){
  const ctl = new AbortController(), to = setTimeout(()=>ctl.abort(), 45000); // Render 무료 서버 깨우는 시간
  try{
    const r = await fetch(API_URL+'/api'+path, {method, signal:ctl.signal,
      headers:{'content-type':'application/json', ...(token && {authorization:'Bearer '+token})},
      body: body && JSON.stringify(body)});
    const data = await r.json().catch(()=>({}));
    if(r.status===401 && token){ logout(); throw new Error('다시 로그인해 주세요'); }
    if(!r.ok) throw new Error(data.error || '요청 실패');
    return data;
  }catch(e){ throw e.name==='AbortError' ? new Error('서버 응답이 없어요. 잠시 후 다시 시도') : e; }
  finally{ clearTimeout(to); }
}
const STAT_ORDER_ = ['힘','체력','지능','민첩','의지','창의력','사회성'];
function profileHtml(u){
  const cls = (typeof CLASSES!=='undefined' && CLASSES[u.cls]) || null;
  const stage = cls && typeof evoStageFor==='function' ? evoStageFor(u.cls, u.level) : null;
  const head = `<div class="soc-prof-head"><div class="soc-prof-ic">${stage ? stage.emoji : clsIcon(u.cls)}</div><div><b>${esc(u.nick)}${u.me?' (나)':''}</b><div class="sub">Lv.${u.level} · ${cls ? esc(cls.name) : '모험가'}${stage ? ' · '+esc(stage.title) : ''}</div><div class="sub">${u.xp.toLocaleString()} XP</div></div></div>`;
  const foot = `<div class="soc-prof-foot">${!u.me && u.friend ? `<button class="btn btn-ghost" data-diary>📜 일기 보기</button>` : ''}${!u.me && !u.friend ? `<button class="btn btn-gold" data-add>친구 신청</button>` : ''}<button class="btn btn-ghost" data-x>닫기</button></div>`;
  const p = u.profile;
  if(!p) return head + `<div class="hint" style="margin:14px 0">이 모험가는 프로필을 공개하지 않았거나 아직 공유한 적이 없어요.</div>` + foot;
  const d = window.calDescribe ? window.calDescribe(p) : {pets:[], regions:[]};
  const max = Math.max(30, ...STAT_ORDER_.map(k=>p.stats[k]||0));
  const stats = STAT_ORDER_.map(k=>`<div class="soc-stat"><span>${(typeof STAT_ICON!=='undefined' && STAT_ICON[k]) || ''} ${k}</span><i><b style="width:${Math.round((p.stats[k]||0)/max*100)}%"></b></i><em>${p.stats[k]||0}</em></div>`).join('');
  const item = (id)=>{ const it = (typeof ALL_ITEMS!=='undefined') ? ALL_ITEMS.find(x=>x.id===id) : null; return it ? `${it.icon} ${esc(it.name)}` : '없음'; };
  const pets = d.pets.length ? d.pets.map(x=>`<div class="soc-line">${x.icon} ${esc(x.name)} Lv.${x.lv}<span class="sub">${esc(x.fx)}</span></div>`).join('') : '<div class="soc-line sub">함께 다니는 펫이 없어요</div>';
  return head + `<h4>능력치</h4>${stats}
    <h4>장비</h4><div class="soc-line">무기 · ${item(p.equipped.weapon)}</div><div class="soc-line">방어구 · ${item(p.equipped.armor)}</div><div class="soc-line">장신구 · ${item(p.equipped.accessory)}</div>
    <h4>동행 펫</h4>${pets}
    <h4>기록</h4><div class="soc-line">업적 ${p.achv}개 · 퀘스트 ${p.cleared}개 완료 · 연속 출석 ${p.streak}일</div><div class="soc-line">이달 던전 클리어 ${p.dungeonDays}일${d.theme ? ` · 테마 ${d.theme.icon} ${esc(d.theme.name)}` : ''}${d.skin ? ` · ${esc(d.skin)}` : ''}</div>
    <h4>지역 레벨</h4><div class="soc-regions">${d.regions.map(r=>`<span>${r.icon} ${esc(r.name)} Lv.${r.lv}</span>`).join('')}</div>` + foot;
}
async function openProfile(nick){
  const old = $('soc-prof'); if(old) old.remove();
  const box = document.createElement('div'); box.id = 'soc-prof'; box.className = 'soc-prof';
  box.innerHTML = '<div class="soc-prof-card"><div class="hint">불러오는 중…</div></div>';
  box.onclick = (e)=>{ if(e.target===box) box.remove(); };
  document.body.appendChild(box);
  const card = box.firstChild;
  try{
    const u = await api('/profile/'+encodeURIComponent(nick));
    card.innerHTML = profileHtml(u);
    card.querySelector('[data-x]').onclick = ()=>box.remove();
    const add = card.querySelector('[data-add]');
    if(add) add.onclick = async ()=>{ try{ await api('/friends/request', {method:'POST', body:{nick:u.nick}}); toast('친구 신청을 보냈어요'); add.disabled = true; }catch(e){ toast(e.message); } };
    const diaryBtn = card.querySelector('[data-diary]');
    if(diaryBtn) diaryBtn.onclick = ()=>openFriendDiary(u.nick);
  }catch(e){
    card.innerHTML = `<div class="soc-err">${esc(e.message)}</div><div class="soc-prof-foot"><button class="btn btn-ghost" data-x>닫기</button></div>`;
    card.querySelector('[data-x]').onclick = ()=>box.remove();
  }
}

/* ---------- 친구의 일기 보기 (그 친구가 나를 포함한 공개 범위로 올린 글만) + 메모 남기기 ---------- */
function diaryEntryHtml(e, nick){
  const notes = (e.notes||[]).map((n)=>`<div class="diary-note"><b>${esc(n.from)}</b> ${esc(n.text)}</div>`).join('');
  const mood = (typeof DIARY_MOODS!=='undefined' ? DIARY_MOODS : []).find((m)=>m.id===e.mood);
  const tags = (e.tags||[]).length ? `<div class="diary-entry-tags">${e.tags.map((t)=>`<span class="diary-tag-pill">#${esc(t)}</span>`).join('')}</div>` : '';
  return `<div class="diary-entry"><div class="diary-date">${mood ? mood.ic+' ' : ''}${esc(e.date)}</div>`
    + (e.title ? `<div class="diary-entry-title">${esc(e.title)}</div>` : '')
    + `<div class="diary-text">${esc(e.text)}</div>${tags}`
    + (notes ? `<div class="diary-notes">${notes}</div>` : '')
    + `<div class="diary-note-form"><input type="text" maxlength="200" placeholder="메모를 남겨보세요" data-note-input="${esc(e.date)}"><button data-note-send="${esc(e.date)}" data-note-nick="${esc(nick)}">남기기</button></div></div>`;
}
function wireNoteForms(card){
  card.querySelectorAll('[data-note-send]').forEach((b)=>{
    b.onclick = async ()=>{
      const date = b.dataset.noteSend, nick = b.dataset.noteNick;
      const input = card.querySelector(`[data-note-input="${CSS.escape(date)}"]`);
      const text = input.value.trim();
      if(!text) return;
      b.disabled = true;
      try{
        await api(`/diary/${encodeURIComponent(nick)}/note`, {method:'POST', body:{date, text}});
        openFriendDiary(nick); // 새로 불러와서 방금 남긴 메모를 바로 보여준다
      }catch(e){ toast(e.message); b.disabled = false; }
    };
  });
}
async function openFriendDiary(nick){
  const old = $('soc-fdiary'); if(old) old.remove();
  const box = document.createElement('div'); box.id = 'soc-fdiary'; box.className = 'soc-prof';
  box.innerHTML = '<div class="soc-prof-card"><div class="hint">불러오는 중…</div></div>';
  box.onclick = (e)=>{ if(e.target===box) box.remove(); };
  document.body.appendChild(box);
  const card = box.firstChild;
  try{
    const d = await api('/diary/'+encodeURIComponent(nick));
    const entries = [...d.entries].sort((a,b)=> b.date<a.date?-1:1);
    card.innerHTML = `<h4 style="margin-top:0">📜 ${esc(d.nick)}님의 모험 일지</h4>` +
      (entries.length ? entries.map((e)=>diaryEntryHtml(e, d.nick)).join('')
        : '<div class="hint">아직 나에게 공개된 일기가 없어요.</div>') +
      `<div class="soc-prof-foot"><button class="btn btn-ghost" data-x>닫기</button></div>`;
    card.querySelector('[data-x]').onclick = ()=>box.remove();
    wireNoteForms(card);
  }catch(e){
    card.innerHTML = `<div class="soc-err">${esc(e.message)}</div><div class="soc-prof-foot"><button class="btn btn-ghost" data-x>닫기</button></div>`;
    card.querySelector('[data-x]').onclick = ()=>box.remove();
  }
}
const clsIcon = (c)=> (typeof CLASSES!=="undefined" && CLASSES[c] && CLASSES[c].icon) || '🧑';
const esc = (s)=> String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

/* ---------- 프로필 공유 (랭킹을 보는 모든 사용자에게 공개, 끄면 서버에서 지움) ---------- */
const shareOn = ()=> localStorage.getItem('qp_prof_off')!=='1';
function profileSnapshot(){
  if(!shareOn() || !state.character) return null; // null이면 서버가 프로필을 삭제한다
  const ex = window.calProfile ? window.calProfile() : {};
  const lv = Math.floor(state.totalXP/1000)+1;
  const stage = typeof evoStageFor==='function' ? evoStageFor(state.character.cls, lv) : null;
  return {title:stage ? stage.title : '', stats:state.stats, equipped:state.equipped, pets:ex.pets||[], skin:ex.skin||null, theme:ex.theme||null,
    achv:(state.unlockedAchv||[]).length, streak:state.streak||0, cleared:state.totalCleared||0, dungeonDays:ex.dungeonDays||0, regions:ex.regions||{}};
}
function syncScore(){
  if(!token || !state.character) return Promise.resolve();
  return Promise.all([
    api('/score', {method:'PUT', body:{xp:state.totalXP, cls:state.character.cls, profile:profileSnapshot()}}).catch(()=>{}),
    pushQuests(),
  ]);
}
setInterval(syncScore, 60000);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) syncScore(); });

/* ---------- 퀘스트 동기화 (기기 간 백업/이어보기) ---------- */
let questSyncTimer = null;
function queueQuestSync(){ // saveState()가 호출될 때마다 불려서, 편집이 멎으면 잠시 후 한 번만 올린다
  if(!token) return;
  clearTimeout(questSyncTimer);
  questSyncTimer = setTimeout(pushQuests, 2000);
}
window.queueQuestSync = queueQuestSync;
let lastPushedQuestsAt = null; // saveState()는 퀘스트와 무관한 변화에도 자주 불리므로, 실제로 바뀐 시점에만 전송한다
let syncHold = false; // 서버에서 퀘스트를 가져오는 동안에는 올리지 않는다
function pushQuests(){
  if(!token || !state.character || syncHold) return Promise.resolve();
  if(!state.questsUpdatedAt) state.questsUpdatedAt = Date.now(); // 옛 저장본(0)은 한 번만 시각을 매긴다 (매번 새 시각이면 60초마다 서버를 덮어씀)
  const updatedAt = state.questsUpdatedAt;
  if(updatedAt === lastPushedQuestsAt) return Promise.resolve();
  return api('/quests', {method:'PUT', body:{quests:state.quests, updatedAt}})
    .then(()=>{ lastPushedQuestsAt = updatedAt; }).catch(()=>{});
}
async function pullQuestsIfNewer(){ // 로그인 직후 / 앱 시작 시: 서버가 더 최신이면 가져오고, 아니면 이 기기 것을 올린다
  if(!token) return;
  syncHold = true; let needPush = false;
  try{
    const d = await api('/quests');
    if(d.updatedAt > (state.questsUpdatedAt||0)){
      state.quests = d.quests || [];
      state.questsUpdatedAt = d.updatedAt;
      lastPushedQuestsAt = d.updatedAt;
      await saveState();
      if(typeof renderAll === 'function') renderAll();
      toast('다른 기기의 퀘스트를 불러왔어요');
    } else if(state.quests && state.quests.length){
      needPush = true;
    }
  }catch(e){}
  finally{ syncHold = false; }
  if(needPush) pushQuests();
}

/* ---------- 일기 동기화 (기기 간 백업/다른 사람에게 공개) ---------- */
let diarySyncTimer = null;
function queueDiarySync(){ // index.html의 saveDiaryEntry()가 저장할 때마다 불러서, 잠시 후 한 번만 올린다
  if(!token) return;
  clearTimeout(diarySyncTimer);
  diarySyncTimer = setTimeout(pushDiary, 1500);
}
window.queueDiarySync = queueDiarySync;
function pushDiary(){
  if(!token || !state.character) return Promise.resolve();
  // 사진은 기기 로컬에만 두는 값이라(용량이 커서 서버 문서 크기 한도를 금방 넘길 수 있음) 동기화 페이로드에서는 뺀다
  const entries = (state.diary||[]).map((e)=>{ const { images, ...rest } = e; return rest; });
  return api('/diary', {method:'PUT', body:{entries}}).catch(()=>{});
}
async function pullDiaryIfNewer(){ // 로그인 직후 / 앱 시작 시 / 주기적으로: 날짜별로 더 최근에 바뀐 쪽을 남긴다
  if(!token) return;
  try{
    const server = (await api('/diary')).entries || [];
    const local = state.diary || [];
    const byDate = new Map(local.map((e)=>[e.date, e]));
    let changed = false;
    for(const se of server){
      const le = byDate.get(se.date);
      if(!le || (se.updatedAt||0) > (le.updatedAt||0)){
        // 사진은 서버가 모르는 값이므로, 이 기기에 이미 있던 사진은 그대로 들고 간다
        byDate.set(se.date, le && le.images ? {...se, images: le.images} : se); changed = true;
      } else if(JSON.stringify(le.notes||[]) !== JSON.stringify(se.notes||[])){
        // 메모는 친구가 서버에만 남기는 값이라, 글 내용은 이 기기가 최신이어도 메모는 항상 서버 것을 따른다
        le.notes = se.notes||[]; changed = true;
      }
    }
    if(changed){
      state.diary = [...byDate.values()].sort((a,b)=> b.date<a.date?-1:1);
      await saveState();
      if(typeof renderGrowth==='function' && $('diary-list')) renderGrowth();
    }
  }catch(e){}
  pushDiary(); // 이 기기에만 있던 항목을 서버에도 올려 둔다
}
window.addEventListener('load', pullDiaryIfNewer); // 이미 로그인된 상태로 앱을 다시 열었을 때
setInterval(()=>{ if(!document.hidden) pullDiaryIfNewer(); }, 60000); // 친구가 남긴 새 메모를 주기적으로 받아온다

/* ---------- 친구 그룹 관리 (일기 공개 범위로 재사용) ---------- */
window.socGetFriendGroups = async function(){
  if(!token) return [];
  try{ const d = await api('/friend-groups'); return d.groups.map((g)=>({id:g.id, name:g.name})); }
  catch(e){ return []; }
};
window.socIsLoggedIn = ()=> !!token;
async function loadGroupManagerData(){
  const [g, f] = await Promise.all([api('/friend-groups'), api('/friends')]);
  return {groups: g.groups, friends: f.friends};
}
async function openGroupManager(){
  const old = $('soc-groups'); if(old) old.remove();
  const box = document.createElement('div'); box.id = 'soc-groups'; box.className = 'soc-prof';
  box.innerHTML = '<div class="soc-prof-card"><div class="hint">불러오는 중…</div></div>';
  box.onclick = (e)=>{ if(e.target===box) box.remove(); };
  document.body.appendChild(box);
  const card = box.firstChild;
  try{
    const {groups, friends} = await loadGroupManagerData();
    renderGroupManager(card, groups, friends, null, {modal:true, refresh:openGroupManager});
  }catch(e){
    card.innerHTML = `<div class="soc-err">${esc(e.message)}</div><div class="soc-prof-foot"><button class="btn btn-ghost" data-x>닫기</button></div>`;
    card.querySelector('[data-x]').onclick = ()=>box.remove();
  }
}
window.socOpenGroupManager = openGroupManager;
// 일기 탭 하단에 "일기장처럼" 늘 펼쳐 보이는 그룹 패널 (모달이 아니라 그 자리에 그대로 그린다)
async function renderGroupsPanel(containerId){
  const el = typeof containerId==='string' ? document.getElementById(containerId) : containerId;
  if(!el) return;
  if(!token){ el.innerHTML = '<div class="hint">로그인하면 친구를 그룹으로 묶어 일기를 공개할 수 있어요.</div>'; return; }
  if(!el.dataset.diaryGroupsLoaded) el.innerHTML = '<div class="hint">불러오는 중…</div>';
  try{
    const {groups, friends} = await loadGroupManagerData();
    el.dataset.diaryGroupsLoaded = '1';
    renderGroupManager(el, groups, friends, null, {modal:false, refresh:()=>renderGroupsPanel(containerId)});
  }catch(e){
    el.innerHTML = `<div class="soc-err">${esc(e.message)}</div>`;
  }
}
window.socRenderGroupsPanel = renderGroupsPanel;
function renderGroupManager(card, groups, friends, editingId, opts){
  opts = opts || {modal:true, refresh:openGroupManager};
  const editing = editingId ? groups.find((g)=>g.id===editingId) : null;
  const memberSet = new Set((editing ? editing.members : []).map((m)=>m.nick));
  const nameInputId = opts.modal ? 'grp-name' : 'grp-name-inline';
  card.innerHTML = `
    ${opts.modal ? `<h4 style="margin-top:0">👪 공개 그룹 관리</h4><div class="hint" style="margin-bottom:10px">일기를 쓸 때 공개 범위로 고를 수 있는, 이름 붙인 친구 묶음이에요.</div>` : ''}
    ${groups.map((g)=>`<div class="diary-group-card"><span class="diary-group-ic">📁</span><span class="nm">${esc(g.name)}</span><span class="sub">${g.members.length}명${g.members.length ? ' · '+g.members.map((m)=>esc(m.nick)).join(', ') : ''}</span><button data-edit-grp="${esc(g.id)}">수정</button><button data-del-grp="${esc(g.id)}">✕</button></div>`).join('') || '<div class="hint">아직 만든 그룹이 없어요.</div>'}
    <div class="diary-group-form">
      <h4 style="margin-top:12px">${editing ? '그룹 수정' : '새 그룹 만들기'}</h4>
      <input type="text" id="${nameInputId}" maxlength="20" placeholder="그룹 이름 (예: 친한 친구)" value="${editing ? esc(editing.name) : ''}">
      ${friends.length ? `<div class="hint" style="margin:4px 0 8px">포함할 친구를 선택하세요</div>` + friends.map((fr)=>`<label style="display:flex;align-items:center;gap:8px;padding:6px 0"><input type="checkbox" value="${esc(fr.nick)}" ${memberSet.has(fr.nick)?'checked':''}> ${esc(fr.nick)}</label>`).join('') : '<div class="hint">친구를 먼저 추가해 주세요.</div>'}
      <div class="soc-prof-foot" style="margin-top:12px;${opts.modal?'':'justify-content:flex-start;'}">
        <button class="btn btn-gold" data-grp-save="1">${editing ? '저장' : '만들기'}</button>
        ${editing ? `<button class="btn btn-ghost" data-grp-cancel="1">취소</button>` : ''}
        ${opts.modal ? `<button class="btn btn-ghost" data-x>닫기</button>` : ''}
      </div>
    </div>`;
  if(opts.modal){ card.querySelector('[data-x]').onclick = ()=>$('soc-groups').remove(); }
  const afterChange = ()=>{ opts.refresh(); diaryGroupsCache = []; if(typeof renderDiaryVisibilityPill==='function') renderDiaryVisibilityPill(); };
  const cancelBtn = card.querySelector('[data-grp-cancel]');
  if(cancelBtn) cancelBtn.onclick = ()=>renderGroupManager(card, groups, friends, null, opts);
  card.querySelectorAll('[data-edit-grp]').forEach((b)=>b.onclick = ()=>renderGroupManager(card, groups, friends, b.dataset.editGrp, opts));
  card.querySelectorAll('[data-del-grp]').forEach((b)=>b.onclick = async ()=>{
    if(!confirm('이 그룹을 삭제할까요? 이 그룹으로 공개했던 일기는 비공개로 바뀌어요.')) return;
    try{ await api('/friend-groups/delete', {method:'POST', body:{id:b.dataset.delGrp}}); toast('그룹을 삭제했어요'); afterChange(); }
    catch(e){ toast(e.message); }
  });
  card.querySelector('[data-grp-save]').onclick = async ()=>{
    const name = card.querySelector('#'+nameInputId).value.trim();
    if(!name){ toast('그룹 이름을 입력해주세요'); return; }
    const memberNicks = [...card.querySelectorAll('input[type=checkbox]:checked')].map((c)=>c.value);
    try{
      await api('/friend-groups', {method:'PUT', body:{id: editing ? editing.id : undefined, name, memberNicks}});
      toast(editing ? '그룹을 수정했어요' : '그룹을 만들었어요');
      afterChange();
    }catch(e){ toast(e.message); }
  };
}

function logout(){
  token = myNick = null; localStorage.removeItem('qp_token'); localStorage.removeItem('qp_nick');
  lastPushedQuestsAt = null; // 다음 로그인 때 새로 판단한다
  stopPoll(); render();
}
// 다른 계정으로 로그인하면 이 기기의 퀘스트 목록을 이전 계정용으로 보관하고, 새 계정의 것(보관해 둔 것 또는 서버 것)으로 바꾼다
function switchAccountQuests(prev, next){
  try{
    localStorage.setItem('qp_stash_'+prev.toLowerCase(), JSON.stringify({quests:state.quests||[], at:state.questsUpdatedAt||0}));
    const st = JSON.parse(localStorage.getItem('qp_stash_'+next.toLowerCase())||'null');
    state.quests = st ? st.quests : []; state.questsUpdatedAt = st ? st.at : 0; lastPushedQuestsAt = null;
    toast(`${next} 계정의 퀘스트로 바꿨어요. 이전 계정의 퀘스트는 보관돼 있어요.`);
  }catch(e){}
}
function stopPoll(){ clearInterval(pollTimer); pollTimer = null; }

/* ---------- 로그인 ---------- */
function renderLogin(msg){
  sc.innerHTML = `<div class="section-head" style="margin-top:4px"><h2>👥 소셜</h2></div>
  <div class="settings-card"><h3>로그인 / 가입</h3>
    <div class="hint">친구·랭킹·대화를 쓰려면 계정이 필요해요. 처음이면 "가입"을 눌러요.<br>서버가 잠들어 있으면 첫 요청이 30초쯤 걸릴 수 있어요.</div>
    <input type="text" id="soc-nick" maxlength="10" placeholder="닉네임 (2~10자)" value="${esc(myNick || (state.character && state.character.nickname) || '')}" autocomplete="username">
    <input type="password" id="soc-pw" placeholder="비밀번호 (6자 이상)" autocomplete="current-password">
    <div class="soc-err" id="soc-err">${esc(msg||'')}</div>
    <div style="display:flex;gap:8px"><button class="btn btn-gold" style="flex:1" id="soc-login">로그인</button><button class="btn" style="flex:1" id="soc-reg">가입</button></div>
  </div>`;
  const go = async (path)=>{
    const err = $('soc-err'), btns = [$('soc-login'), $('soc-reg')];
    err.textContent = '연결 중…'; btns.forEach(b=>b.disabled=true);
    try{
      const d = await api(path, {method:'POST', body:{nick:$('soc-nick').value, pw:$('soc-pw').value}});
      token = d.token; myNick = d.me.nick;
      localStorage.setItem('qp_token', token); localStorage.setItem('qp_nick', myNick);
      const prevNick = localStorage.getItem('qp_sync_nick');
      if(prevNick && prevNick.toLowerCase()!==myNick.toLowerCase()){ syncHold = true; switchAccountQuests(prevNick, myNick); }
      localStorage.setItem('qp_sync_nick', myNick);
      await pullQuestsIfNewer(); await pullDiaryIfNewer(); if(typeof renderAll==='function') renderAll(); await syncScore(); resubscribeIfAllowed(); view = 'rank'; render();
    }catch(e){ err.textContent = e.message; btns.forEach(b=>b.disabled=false); }
  };
  $('soc-login').onclick = ()=>go('/login'); $('soc-reg').onclick = ()=>go('/register');
}

/* ---------- 메인 ---------- */
function render(){
  stopPoll(); setChatMode(false);
  if(!token) return renderLogin();
  sc.innerHTML = `<div class="section-head" style="margin-top:4px"><h2>👥 소셜</h2><span class="pill">${esc(myNick)} · <a href="#" id="soc-out" style="color:inherit">로그아웃</a></span></div>
  <div class="soc-tabs">${[['rank','🏆 랭킹'],['friends','🤝 친구']].map(([k,l])=>`<button data-v="${k}" class="${view===k||(view==='chat'&&k==='friends')?'on':''}">${l}</button>`).join('')}</div>
  <div id="soc-body"><div class="hint">불러오는 중…</div></div>`;
  $('soc-out').onclick = (e)=>{ e.preventDefault(); logout(); };
  sc.querySelectorAll('.soc-tabs button').forEach(b=>b.onclick = ()=>{ view = b.dataset.v; render(); });
  ({rank:renderRank, friends:renderFriends, chat:renderChat}[view])().catch(e=>{ const b=$('soc-body'); if(b) b.innerHTML = `<div class="soc-err">${esc(e.message)}</div>`; });
}

async function renderRank(){
  await syncScore();
  const d = await api('/rank');
  $('soc-body').innerHTML = `<label class="soc-share"><input type="checkbox" id="soc-share" ${shareOn()?'checked':''}> 내 프로필을 랭킹에 공개 (이름을 누르면 프로필을 볼 수 있어요)</label><div class="soc-row me" data-prof="${esc(myNick)}" style="cursor:pointer"><span class="rk">${d.me.rank}</span><span class="nm">${clsIcon(d.me.cls)} 내 순위</span><span class="sub">Lv.${d.me.level} · ${d.me.xp.toLocaleString()} XP</span></div>` +
    d.top.map((u,i)=>`<div class="soc-row ${u.nick===myNick?'me':''}" data-prof="${esc(u.nick)}" style="cursor:pointer"><span class="rk">${i<3?['🥇','🥈','🥉'][i]:i+1}</span><span class="nm">${clsIcon(u.cls)} ${esc(u.nick)}</span><span class="sub">Lv.${u.level} · ${u.xp.toLocaleString()} XP</span></div>`).join('');
  $('soc-share').onchange = (e)=>{ localStorage.setItem('qp_prof_off', e.target.checked ? '0' : '1'); syncScore(); toast(e.target.checked ? '내 프로필을 공개해요' : '프로필 공개를 껐어요'); };
}

async function renderFriends(){
  const d = await api('/friends');
  $('soc-body').innerHTML = `
  <div class="soc-send" style="margin-bottom:14px"><input type="text" id="soc-add" maxlength="10" placeholder="친구 닉네임"><button class="btn btn-gold" id="soc-add-btn">신청</button></div>
  <div class="soc-err" id="soc-err"></div>
  <button class="btn btn-ghost btn-block" id="soc-push" style="margin-bottom:12px">🔔 푸시 알림 켜기</button>
  <button class="btn btn-ghost btn-block" id="soc-groups-btn" style="margin-bottom:12px">👪 일기 공개 그룹 관리</button>
  ${d.requests.length ? `<h3 style="font-size:13px;margin:6px 0">받은 친구 요청</h3>` + d.requests.map(u=>`<div class="soc-row"><span class="nm">${clsIcon(u.cls)} ${esc(u.nick)}</span><button data-acc="${esc(u.nick)}">수락</button><button data-rej="${esc(u.nick)}">거절</button></div>`).join('') : ''}
  <h3 style="font-size:13px;margin:10px 0 6px">친구 ${d.friends.length}명${d.sent?` · 신청 대기 ${d.sent}`:''}</h3>
  ${d.friends.map(u=>`<div class="soc-row"><span class="nm" data-prof="${esc(u.nick)}" style="cursor:pointer">${clsIcon(u.cls)} ${esc(u.nick)}</span><span class="sub">Lv.${u.level}</span>${u.unread?`<span class="soc-badge">${u.unread}</span>`:''}<button data-chat="${esc(u.nick)}">💬</button><button data-del="${esc(u.nick)}">✕</button></div>`).join('') || '<div class="hint">아직 친구가 없어요. 친구의 닉네임으로 신청해 보세요.</div>'}`;
  const act = async (path, body, ok)=>{ try{ const r = await api(path, {method:'POST', body}); toast(ok||'완료'); render(); return r; }catch(e){ $('soc-err').textContent = e.message; } };
  $('soc-add-btn').onclick = ()=>act('/friends/request', {nick:$('soc-add').value}, '친구 신청을 보냈어요');
  sc.querySelectorAll('[data-acc]').forEach(b=>b.onclick=()=>act('/friends/respond', {nick:b.dataset.acc, accept:true}, '친구가 됐어요'));
  sc.querySelectorAll('[data-rej]').forEach(b=>b.onclick=()=>act('/friends/respond', {nick:b.dataset.rej, accept:false}, '거절했어요'));
  sc.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ if(confirm(b.dataset.del+'님을 친구에서 삭제할까요?')) act('/friends/remove', {nick:b.dataset.del}, '삭제했어요'); });
  sc.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>{ chatWith = b.dataset.chat; view = 'chat'; render(); });
  const pb = $('soc-push'); pb.onclick = enablePush; refreshPushButton();
  $('soc-groups-btn').onclick = openGroupManager;
}

/* ---------- 대화 ---------- */
let seen = new Set(), polling = false, fitFn = null;
const pendingCount = ()=> sc.querySelectorAll('.soc-msg.pending').length;
function setChatMode(on){ // 대화 중엔 하단 메뉴를 숨겨 입력창이 가려지지 않게 한다
  const n = $('bottomnav'); if(n) n.style.display = on ? 'none' : '';
  sc.classList.toggle('chat', on);
  const vv = window.visualViewport;
  if(fitFn && vv){ vv.removeEventListener('resize', fitFn); vv.removeEventListener('scroll', fitFn); }
  fitFn = null;
  if(on && vv){ fitFn = ()=>{ const log = $('soc-log'); if(!log) return;
      log.style.height = Math.max(140, vv.offsetTop + vv.height - log.getBoundingClientRect().top - 84) + 'px'; };
    vv.addEventListener('resize', fitFn); vv.addEventListener('scroll', fitFn); }
}
async function renderChat(){
  lastMsgId = null; seen = new Set(); setChatMode(true);
  $('soc-body').innerHTML = `<div style="display:flex;align-items:center;gap:10px"><button class="btn btn-ghost" id="soc-back" style="padding:6px 12px">←</button><b>💬 ${esc(chatWith)}</b></div>
  <div class="soc-chat" id="soc-log"><div class="hint" id="soc-load">불러오는 중…</div></div><div class="soc-err" id="soc-err"></div>
  <div class="soc-send"><input type="text" id="soc-text" maxlength="300" placeholder="메시지를 입력하세요" autocomplete="off" enterkeyhint="send"><button class="btn btn-gold" id="soc-sendbtn" type="button">전송</button></div>`;
  if(fitFn) fitFn();
  const inp = $('soc-text');
  $('soc-back').onclick = ()=>{ view = 'friends'; render(); };
  const send = ()=>{
    const text = inp.value.trim(); if(!text) return;
    inp.value = ''; inp.focus(); // 전송해도 키보드가 내려가지 않게 포커스 유지
    post(addBubble({mine:true, text}, 'pending'), text);
  };
  $('soc-sendbtn').onpointerdown = (e)=>e.preventDefault(); // 버튼이 입력창의 포커스를 뺏지 못하게
  $('soc-sendbtn').onclick = send;
  inp.onkeydown = (e)=>{ if(e.key==='Enter' && !e.isComposing && e.keyCode!==229){ e.preventDefault(); send(); } };
  await poll();
  if(view!=='chat' || !$('soc-log')) return; // 첫 응답을 기다리는 사이 화면을 떠났으면 타이머를 만들지 않는다
  stopPoll();
  pollTimer = setInterval(()=>{ if(!document.hidden && !sc.classList.contains('hidden')) poll(); }, 2500);
}
function addBubble(m, cls=''){
  const log = $('soc-log'); if(!log) return null;
  const load = $('soc-load'); if(load) load.remove();
  const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80 || cls==='pending';
  const d = document.createElement('div'); d.className = 'soc-msg' + (m.mine?' mine':'') + (cls?' '+cls:''); d.textContent = m.text;
  log.appendChild(d); if(stick) log.scrollTop = log.scrollHeight;
  return d;
}
function post(bubble, text){ // 바로 화면에 띄우고, 서버 응답이 오면 확정 (서버가 자고 있어도 느리게 느껴지지 않게)
  bubble.className = bubble.className.replace(' fail','') + (bubble.classList.contains('pending') ? '' : ' pending');
  bubble.onclick = null;
  api('/msgs', {method:'POST', body:{to:chatWith, text}}).then((m)=>{
    seen.add(m.id); bubble.classList.remove('pending');
  }).catch((e)=>{
    bubble.classList.remove('pending'); bubble.classList.add('fail');
    const er = $('soc-err'); if(er) er.textContent = e.message;
    bubble.onclick = ()=>{ if(er) er.textContent = ''; post(bubble, text); };
  });
}
async function poll(){
  if(polling || view!=='chat' || !$('soc-log')) return;
  polling = true;
  try{
    const list = await api(`/msgs?with=${encodeURIComponent(chatWith)}` + (lastMsgId ? `&after=${lastMsgId}` : ''));
    if(view!=='chat') return;
    const load = $('soc-load'); if(load && !list.length) load.remove();
    for(const m of list){
      lastMsgId = m.id;
      if(seen.has(m.id)) continue;
      if(m.mine){ const pend = [...sc.querySelectorAll('.soc-msg.pending')].find(b=>b.textContent===m.text); if(pend) continue; } // 내가 방금 보낸 건 이미 화면에 있음 (같은 내용의 대기 중 말풍선이 있을 때만)
      seen.add(m.id); addBubble(m);
    }
  }catch(e){ const load = $('soc-load'); if(load) load.textContent = '서버를 깨우는 중이에요… 잠시만요'; } // 일시 오류는 조용히 재시도
  finally{ polling = false; }
}

/* ---------- 푸시 ---------- */
const pushOK = ()=> 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64 = (s)=>{ const p = '='.repeat((4 - s.length%4)%4), r = atob((s+p).replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from(r, c=>c.charCodeAt(0)); };
async function subscribe(){
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if(!sub) sub = await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64((await api('/vapid')).key)});
  await api('/push', {method:'POST', body:{sub:sub.toJSON()}}); // 계정 전환 시에도 이 기기를 현재 계정에 등록
}
async function enablePush(){
  const er = $('soc-err');
  if(!pushOK()){ er.textContent = '이 브라우저는 푸시를 지원하지 않아요. iPhone은 "홈 화면에 추가"한 앱에서만 돼요.'; return; }
  try{
    if(await Notification.requestPermission() !== 'granted'){ er.textContent = '알림 권한이 꺼져 있어요. 브라우저 설정에서 허용해 주세요.'; return; }
    await subscribe(); toast('🔔 푸시 알림을 켰어요'); refreshPushButton();
  }catch(e){ er.textContent = '알림을 켜지 못했어요: ' + e.message; }
}
function resubscribeIfAllowed(){ if(token && pushOK() && Notification.permission==='granted') subscribe().catch(()=>{}); }
async function refreshPushButton(){
  const b = $('soc-push'); if(!b) return;
  if(!pushOK()){ b.classList.add('hidden'); return; }
  const on = Notification.permission==='granted' && await navigator.serviceWorker.ready.then(r=>r.pushManager.getSubscription()).catch(()=>null);
  b.textContent = on ? '🔔 푸시 알림 켜짐' : '🔔 푸시 알림 켜기'; b.disabled = !!on;
}

/* ---------- 탭 연결 (index.html의 switchTab에서 호출) ---------- */
const fab = ()=>document.querySelector('.fab');
// 무료 서버는 15분 쉬면 잠들어서 첫 요청이 50초까지 걸린다 → 앱을 쓰는 동안 미리 깨워 둔다
const warm = ()=>{ if(token) fetch(API_URL+'/health', {mode:'no-cors'}).catch(()=>{}); };
setInterval(()=>{ if(!document.hidden) warm(); }, 600000);
window.addEventListener('load', warm);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) warm(); });
window.socialOpen = function(){ if(view==='chat') view = 'friends'; fab().style.display = 'none'; warm(); render(); };
window.socialClose = function(){ stopPoll(); setChatMode(false); fab().style.display = ''; };
window.addEventListener('load', resubscribeIfAllowed);
window.addEventListener('load', pullQuestsIfNewer); // 이미 로그인된 상태로 앱을 다시 열었을 때 다른 기기 변경사항 반영
})();
