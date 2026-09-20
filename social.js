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
.soc-send{display:flex;gap:8px}.soc-send input{margin:0!important}.soc-send .btn{padding:0 18px}`;
document.head.appendChild(css);

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
const clsIcon = (c)=> (typeof CLASSES!=="undefined" && CLASSES[c] && CLASSES[c].icon) || '🧑';
const esc = (s)=> escapeHtml(String(s));

function syncScore(){
  if(!token || !state.character) return Promise.resolve();
  return api('/score', {method:'PUT', body:{xp:state.totalXP, cls:state.character.cls}}).catch(()=>{});
}
setInterval(syncScore, 60000);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) syncScore(); });

function logout(){
  token = myNick = null; localStorage.removeItem('qp_token'); localStorage.removeItem('qp_nick');
  stopPoll(); render();
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
      await syncScore(); resubscribeIfAllowed(); view = 'rank'; render();
    }catch(e){ err.textContent = e.message; btns.forEach(b=>b.disabled=false); }
  };
  $('soc-login').onclick = ()=>go('/login'); $('soc-reg').onclick = ()=>go('/register');
}

/* ---------- 메인 ---------- */
function render(){
  stopPoll();
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
  $('soc-body').innerHTML = `<div class="soc-row me"><span class="rk">${d.me.rank}</span><span class="nm">${clsIcon(d.me.cls)} 내 순위</span><span class="sub">Lv.${d.me.level} · ${d.me.xp.toLocaleString()} XP</span></div>` +
    d.top.map((u,i)=>`<div class="soc-row ${u.nick===myNick?'me':''}"><span class="rk">${i<3?['🥇','🥈','🥉'][i]:i+1}</span><span class="nm">${clsIcon(u.cls)} ${esc(u.nick)}</span><span class="sub">Lv.${u.level} · ${u.xp.toLocaleString()} XP</span></div>`).join('');
}

async function renderFriends(){
  const d = await api('/friends');
  $('soc-body').innerHTML = `
  <div class="soc-send" style="margin-bottom:14px"><input type="text" id="soc-add" maxlength="10" placeholder="친구 닉네임"><button class="btn btn-gold" id="soc-add-btn">신청</button></div>
  <div class="soc-err" id="soc-err"></div>
  <button class="btn btn-ghost btn-block" id="soc-push" style="margin-bottom:12px">🔔 푸시 알림 켜기</button>
  ${d.requests.length ? `<h3 style="font-size:13px;margin:6px 0">받은 친구 요청</h3>` + d.requests.map(u=>`<div class="soc-row"><span class="nm">${clsIcon(u.cls)} ${esc(u.nick)}</span><button data-acc="${esc(u.nick)}">수락</button><button data-rej="${esc(u.nick)}">거절</button></div>`).join('') : ''}
  <h3 style="font-size:13px;margin:10px 0 6px">친구 ${d.friends.length}명${d.sent?` · 신청 대기 ${d.sent}`:''}</h3>
  ${d.friends.map(u=>`<div class="soc-row"><span class="nm">${clsIcon(u.cls)} ${esc(u.nick)}</span><span class="sub">Lv.${u.level}</span>${u.unread?`<span class="soc-badge">${u.unread}</span>`:''}<button data-chat="${esc(u.nick)}">💬</button><button data-del="${esc(u.nick)}">✕</button></div>`).join('') || '<div class="hint">아직 친구가 없어요. 친구의 닉네임으로 신청해 보세요.</div>'}`;
  const act = async (path, body, ok)=>{ try{ const r = await api(path, {method:'POST', body}); toast(ok||'완료'); render(); return r; }catch(e){ $('soc-err').textContent = e.message; } };
  $('soc-add-btn').onclick = ()=>act('/friends/request', {nick:$('soc-add').value}, '친구 신청을 보냈어요');
  sc.querySelectorAll('[data-acc]').forEach(b=>b.onclick=()=>act('/friends/respond', {nick:b.dataset.acc, accept:true}, '친구가 됐어요'));
  sc.querySelectorAll('[data-rej]').forEach(b=>b.onclick=()=>act('/friends/respond', {nick:b.dataset.rej, accept:false}, '거절했어요'));
  sc.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ if(confirm(b.dataset.del+'님을 친구에서 삭제할까요?')) act('/friends/remove', {nick:b.dataset.del}, '삭제했어요'); });
  sc.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>{ chatWith = b.dataset.chat; view = 'chat'; render(); });
  const pb = $('soc-push'); pb.onclick = enablePush; refreshPushButton();
}

/* ---------- 대화 ---------- */
async function renderChat(){
  lastMsgId = null;
  $('soc-body').innerHTML = `<div style="display:flex;align-items:center;gap:10px"><button class="btn btn-ghost" id="soc-back" style="padding:6px 12px">←</button><b>💬 ${esc(chatWith)}</b></div>
  <div class="soc-chat" id="soc-log"></div><div class="soc-err" id="soc-err"></div>
  <div class="soc-send"><input type="text" id="soc-text" maxlength="300" placeholder="메시지를 입력하세요" autocomplete="off"><button class="btn btn-gold" id="soc-sendbtn">전송</button></div>`;
  $('soc-back').onclick = ()=>{ view = 'friends'; render(); };
  const send = async ()=>{
    const inp = $('soc-text'), text = inp.value.trim(); if(!text) return;
    inp.value = '';
    try{ appendMsgs([await api('/msgs', {method:'POST', body:{to:chatWith, text}})]); }
    catch(e){ $('soc-err').textContent = e.message; inp.value = text; }
  };
  $('soc-sendbtn').onclick = send;
  $('soc-text').onkeydown = (e)=>{ if(e.key==='Enter' && !e.isComposing) send(); };
  await poll();
  pollTimer = setInterval(()=>{ if(!document.hidden && !sc.classList.contains('hidden')) poll(); }, 4000);
}
async function poll(){
  const log = $('soc-log'); if(!log || view!=='chat') return;
  try{ appendMsgs(await api(`/msgs?with=${encodeURIComponent(chatWith)}` + (lastMsgId ? `&after=${lastMsgId}` : ''))); }
  catch(e){ const er = $('soc-err'); if(er) er.textContent = e.message; }
}
function appendMsgs(list){
  const log = $('soc-log'); if(!log || !list.length) return;
  const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 60 || !lastMsgId;
  for(const m of list){
    if(m.id === lastMsgId) continue;
    const d = document.createElement('div'); d.className = 'soc-msg' + (m.mine?' mine':''); d.textContent = m.text; log.appendChild(d);
    lastMsgId = m.id;
  }
  if(stick) log.scrollTop = log.scrollHeight;
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
window.socialOpen = function(){ if(view==='chat') view = 'friends'; fab().style.display = 'none'; render(); };
window.socialClose = function(){ stopPoll(); fab().style.display = ''; };
window.addEventListener('load', resubscribeIfAllowed);
})();
