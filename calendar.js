/* 캘린더 월드맵: 월간 캘린더 · 테마/날짜 장식/이펙트 · 일정 변경권·보존권 · 보물상자 (1~2차).
   하단 '캘린더' 탭(#screen-calendar)에 그려진다.
   index.html의 전역(state, saveState, trackGold, todayStr, catIcon, escapeHtml, toast, renderAll, awardCoin, logGain)을 사용한다. */
(function(){
const $ = (id)=>document.getElementById(id);

// 가격은 퀘스트 골드(XP÷5: 보통 20G, 하루 5개 약 100G) 기준
const THEMES = [
  {id:'kingdom', name:'왕국',       icon:'🏰', price:0,    accent:'#E7B549', bg:'#221C3B', line:'#372C55', desc:'기본 월드맵'},
  {id:'forest',  name:'숲',         icon:'🌲', price:300,  accent:'#6FCF97', bg:'#16281F', line:'#2C4A38', desc:'초록빛 숲속 지도'},
  {id:'academy', name:'마법학교',   icon:'🔮', price:800,  accent:'#B58CFF', bg:'#24173F', line:'#4A3479', desc:'보랏빛 마법진 지도'},
  {id:'cyber',   name:'사이버 도시', icon:'🌆', price:1500, accent:'#4FE0F0', bg:'#0F1B2B', line:'#1F4A66', desc:'네온 불빛 도시 지도'},
];
const DECORS = [ // 선택한 날짜 한 칸에 적용 (같은 날짜는 덮어쓰기)
  {id:'star',  name:'별',   icon:'⭐', price:50,  color:'#F5D76E'},
  {id:'flame', name:'불꽃', icon:'🔥', price:100, color:'#FF8A4C'},
  {id:'gem',   name:'보석', icon:'💎', price:200, color:'#5CE1E6'},
  {id:'rune',  name:'룬',   icon:'ᚱ',  price:300, color:'#C79BFF'},
];
const EFFECTS = [ // 캘린더 전체에 적용되는 애니메이션
  {id:'sparkle', name:'반짝임', icon:'✨', price:400,  desc:'오늘 칸이 반짝입니다'},
  {id:'flame',   name:'불꽃',   icon:'🔥', price:800,  desc:'꾸민 날짜가 타오릅니다'},
  {id:'magic',   name:'마법진', icon:'🌀', price:1200, desc:'캘린더 테두리가 빛납니다'},
];
const TICKETS = {
  change: {name:'일정 변경권', icon:'📜', price:50,  desc:'마감일 퀘스트의 날짜를 바꿉니다'},
  keep:   {name:'일정 보존권', icon:'🛡', price:150, desc:'놓친 퀘스트를 내일로 옮깁니다'},
};
const LOCKED_CHEST_PRICE = 300;
const DAILY_BUY_CAP = 2;        // 꾸미기·잠긴 상자 하루 구매 한도 (골드 소비 폭주 방지)
const WEEKLY_TICKET_CAP = 2;    // 티켓 사용: 주 2회
const MOVE_REWARD_RATE = 0.5;   // 일정 변경/보존 시 보상 50%로 감액
const MONTH_CLEAR_GOAL = 10;    // 월간 보물상자: 이달 던전 클리어 일수

const now = new Date();
let ym = {y:now.getFullYear(), m:now.getMonth()}, sel = null, shopOpen = false, shopTab = 'theme';
let act = null; // 진행 중인 티켓 사용 {id, mode:'change'|'keep'}
let pending = null; // 구매 확인 대기 {desc, price, run}

const pad = (n)=> String(n).padStart(2,'0');
const ymd = (y,m,d)=> `${y}-${pad(m+1)}-${pad(d)}`;
const dateStr = (dt)=> ymd(dt.getFullYear(), dt.getMonth(), dt.getDate());
const addDays = (ds, n)=>{ const d = new Date(ds+'T00:00:00'); d.setDate(d.getDate()+n); return dateStr(d); };
const weekKey = (ds)=>{ const d = new Date(ds+'T00:00:00'); d.setDate(d.getDate()-((d.getDay()+6)%7)); return dateStr(d); }; // 월요일 시작
const rnd = (a,b)=> a + Math.floor(Math.random()*(b-a+1));

// 저장 상태 보정: 이전 버전 저장본에도 새 필드를 채운다
function S(){
  const c = state.calendar || (state.calendar = {});
  const fill = (o, k, v)=>{ if(o[k]===undefined || o[k]===null) o[k] = v; };
  fill(c,'themes',['kingdom']); fill(c,'active','kingdom'); fill(c,'buyDate',null); fill(c,'buyCount',0);
  fill(c,'decor',{}); fill(c,'effects',[]); fill(c,'effect',null);
  fill(c,'tickets',{}); fill(c.tickets,'change',0); fill(c.tickets,'keep',0);
  fill(c,'usage',{}); fill(c.usage,'week',null); fill(c.usage,'n',0);
  fill(c,'moved',{}); fill(c,'chests',{}); fill(c.chests,'normal',0);
  fill(c,'clearDays',{}); fill(c,'monthClaimed',null);
  return c; // 항상 같은 객체를 돌려줘야 호출부의 수정이 저장 상태에 반영된다
}
const theme = ()=> THEMES.find(t=>t.id===S().active) || THEMES[0];

// 해당 날짜에 표시할 퀘스트: 마감일 퀘스트 + 요일 반복/매일 퀘스트
function questsOn(ds){
  const dow = new Date(ds+'T00:00:00').getDay();
  return state.quests.filter(q=>{
    if(q.type==='dated') return q.dueDate===ds;
    if(q.type==='daily'){
      if(q.createdAt && ds < String(q.createdAt).slice(0,10)) return false;
      return !q.weekdays || q.weekdays.length===0 || q.weekdays.includes(dow);
    }
    return false;
  });
}
const isDone = (q, ds)=> q.type==='daily' ? q.lastDoneDate===ds : q.status==='done';
const isBoss = (q)=> q.type==='dated' && (q.difficulty==='hard' || q.difficulty==='veryhard'); // 중요 일정 = 보스

const css = document.createElement('style');
css.textContent = `
#cal-wrap{--ca:#E7B549;--cb:#221C3B;--cl:#372C55;margin-bottom:14px}
.cal-box{background:var(--cb);border:1px solid var(--cl);border-radius:var(--radius-s,12px);padding:10px}
.cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-weight:800}
.cal-head button{background:none;border:1px solid var(--cl);color:var(--text);border-radius:8px;padding:6px 12px;font-size:15px}
.cal-head .ttl{color:var(--ca)}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.cal-dow{text-align:center;font-size:11px;color:var(--text-dim);padding:2px 0}
.cal-day{min-height:52px;border:1px solid var(--cl);border-radius:8px;padding:3px;font-size:11px;background:rgba(0,0,0,.15);color:var(--text);text-align:left;display:flex;flex-direction:column;gap:1px;cursor:pointer;min-width:0}
.cal-day.blank{visibility:hidden}
.cal-day.today{border-color:var(--ca);box-shadow:0 0 0 1px var(--ca) inset}
.cal-day.sel{background:var(--ca);color:#1B1300}
.cal-day.dc{border-width:2px;border-color:var(--dc)}
.cal-day .n{font-weight:800;display:flex;justify-content:space-between;gap:2px}
.cal-day .ic{font-size:11px;line-height:1.15;word-break:keep-all}
.cal-panel{margin-top:10px;background:var(--cb);border:1px solid var(--cl);border-radius:var(--radius-s,12px);padding:10px}
.cal-panel h3{margin:0 0 6px;font-size:14px;color:var(--ca)}
.cal-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--cl);font-size:13px;flex-wrap:wrap}
.cal-row:last-child{border-bottom:0}
.cal-row .t{flex:1;min-width:0}.cal-row .s{font-size:11.5px;color:var(--text-dim)}
.cal-row button,.cal-tabs button,.cal-act button{padding:7px 12px;border-radius:8px;border:1px solid var(--cl);background:var(--card-hi);color:var(--text);font-size:12px}
.cal-row button.on,.cal-tabs button.on{background:var(--ca);color:#1B1300;border-color:var(--ca)}
.cal-row button:disabled{opacity:.5}
.cal-top{display:flex;justify-content:flex-end;margin-bottom:8px}
.cal-tabs{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap}
.cal-act{width:100%;display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--text-dim);padding:4px 0}
.cal-act input{background:var(--card);color:var(--text);border:1px solid var(--cl);border-radius:8px;padding:6px}
.cal-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
.cal-modal .box{background:var(--cb);border:1px solid var(--ca);border-radius:14px;padding:18px;max-width:320px;width:100%;color:var(--text)}
.cal-modal .box b{color:var(--ca)}.cal-modal .box .s{font-size:12px;color:var(--text-dim);margin:6px 0 12px}
.cal-modal .btns{display:flex;gap:8px}.cal-modal .btns button{flex:1;padding:10px;border-radius:10px;border:1px solid var(--cl);background:var(--card-hi);color:var(--text);font-size:14px}
.cal-modal .btns button.go{background:var(--ca);color:#1B1300;border-color:var(--ca);font-weight:800}
.cal-modal .btns button:disabled{opacity:.5}
@keyframes calPulse{0%,100%{box-shadow:0 0 0 1px var(--ca) inset,0 0 0 rgba(255,255,255,0)}50%{box-shadow:0 0 0 1px var(--ca) inset,0 0 10px 2px var(--ca)}}
@keyframes calFlick{from{box-shadow:0 0 4px 0 #FF8A4C}to{box-shadow:0 0 12px 3px #FFB347}}
@keyframes calGlow{from{box-shadow:0 0 4px 0 var(--ca)}to{box-shadow:0 0 16px 3px var(--ca)}}
.fx-sparkle .cal-day.today{animation:calPulse 1.6s ease-in-out infinite}
.fx-flame .cal-day.dc{animation:calFlick .9s ease-in-out infinite alternate}
.fx-magic .cal-box{animation:calGlow 2s ease-in-out infinite alternate}
@media (prefers-reduced-motion:reduce){.fx-sparkle .cal-day.today,.fx-flame .cal-day.dc,.fx-magic .cal-box{animation:none}}
`;
document.head.appendChild(css);

function dayCell(d, today){
  const c = S(), ds = ymd(ym.y, ym.m, d), qs = questsOn(ds);
  const dated = qs.filter(q=>q.type==='dated');
  const icons = dated.slice(0,2).map(q=> isBoss(q) ? '👑' : catIcon(q.category)).join('');
  const more = dated.length>2 ? `+${dated.length-2}` : '';
  const rep = qs.length-dated.length>0 ? '·' : '';
  const dec = DECORS.find(x=>x.id===c.decor[ds]);
  const style = dec ? ` style="--dc:${dec.color}"` : '';
  return `<button class="cal-day${ds===today?' today':''}${ds===sel?' sel':''}${dec?' dc':''}"${style} onclick="calSelect('${ds}')"><span class="n"><span>${d}</span><span>${dec?dec.icon:''}${c.clearDays[ds]?'🏆':''}</span></span><span class="ic">${icons}${more}${rep}</span></button>`;
}

// ---- 일정 변경권 · 보존권 규칙 ----
function moveBlock(q){
  const c = S();
  if(q.type!=='dated') return '마감일 퀘스트에만 쓸 수 있어요';
  if(q.status==='done') return '이미 완료한 퀘스트예요';
  if(isBoss(q)) return '보스(중요 마감) 일정에는 쓸 수 없어요';
  if(c.moved[q.id]) return '같은 일정에는 1회만 쓸 수 있어요';
  const wk = weekKey(todayStr());
  if(c.usage.week===wk && c.usage.n>=WEEKLY_TICKET_CAP) return `이번 주 사용 횟수(${WEEKLY_TICKET_CAP}회)를 모두 썼어요`;
  return null;
}
async function applyMove(q, mode, newDate){
  const c = S(), today = todayStr();
  const why = moveBlock(q);
  if(why){ toast(why); return; }
  if(!c.tickets[mode]){ toast(`${TICKETS[mode].name}이 없어요. 캘린더 상점의 아이템 탭에서 살 수 있어요.`); return; }
  const overdue = q.dueDate < today;
  if(mode==='keep' && !overdue){ toast('놓친 퀘스트에만 쓸 수 있어요'); return; }
  if(mode==='change' && overdue){ toast('놓친 퀘스트에는 보존권을 써 주세요'); return; }
  if(mode==='keep') newDate = addDays(today, 1);
  if(!newDate || newDate < today || newDate===q.dueDate){ toast('오늘 이후의 다른 날짜를 골라 주세요'); return; }
  const wk = weekKey(today);
  if(c.usage.week!==wk) c.usage = {week:wk, n:0};
  c.usage.n++; c.tickets[mode]--; c.moved[q.id] = true;
  q.dueDate = newDate;
  q.xp = Math.round(q.xp*MOVE_REWARD_RATE); q.gold = Math.round(q.gold*MOVE_REWARD_RATE);
  state.questsUpdatedAt = Date.now();
  act = null; sel = newDate;
  const d = new Date(newDate+'T00:00:00'); ym = {y:d.getFullYear(), m:d.getMonth()};
  await saveState();
  toast(`${TICKETS[mode].icon} ${newDate}로 옮겼어요 (보상 50%)`);
  renderAll(); render();
}

function actBox(q){
  if(!act || act.id!==q.id) return '';
  const today = todayStr();
  if(act.mode==='keep') return `<div class="cal-act"><span>내일(${addDays(today,1)})로 옮기고 보상이 50%가 돼요.</span><button onclick="calConfirmMove()">확인</button><button onclick="calCancelMove()">취소</button></div>`;
  return `<div class="cal-act"><input type="date" id="cal-move-date" min="${today}" value="${addDays(today,1)}"><span>보상이 50%가 돼요.</span><button onclick="calConfirmMove()">확인</button><button onclick="calCancelMove()">취소</button></div>`;
}

function dayPanel(){
  if(!sel) return '';
  const c = S(), qs = questsOn(sel), today = todayStr();
  const done = qs.filter(q=>isDone(q, sel)).length;
  const head = sel===today ? `⚔️ 오늘의 던전 ${done}/${qs.length}` : `📅 ${sel} 일정 ${qs.length}개`;
  if(qs.length===0) return `<div class="cal-panel"><h3>${head}</h3><div style="color:var(--text-dim);font-size:12.5px">이 날의 퀘스트가 없습니다.</div></div>`;
  const rows = qs.map(q=>{
    let btn = '';
    if(q.type==='dated' && q.status!=='done'){
      const mode = q.dueDate < today ? 'keep' : 'change';
      const why = moveBlock(q);
      const n = c.tickets[mode];
      btn = why ? `<span class="s" title="${why}">🔒</span>` : `<button onclick="calStartMove('${q.id}','${mode}')">${TICKETS[mode].icon} ${TICKETS[mode].name} (${n})</button>`;
    }
    return `<div class="cal-row"><span>${isBoss(q)?'👑':catIcon(q.category)}</span><span class="t">${escapeHtml(q.title)}<div class="s">${q.type==='dated'?(isBoss(q)?'보스 퀘스트':(q.dueDate<today&&q.status!=='done'?'놓친 퀘스트':'마감 퀘스트')):'반복 퀘스트'} · +${q.xp}XP${q.gold>0?` · +${q.gold}G`:''}${c.moved[q.id]?' · 일정 변경됨':''}</div></span>${btn}<span>${isDone(q, sel)?'✅':''}</span>${actBox(q)}</div>`;
  }).join('');
  return `<div class="cal-panel"><h3>${head}</h3>${rows}<div style="color:var(--text-faint);font-size:11px;margin-top:6px">완료 체크는 홈 또는 전체 퀘스트에서 합니다. 변경권·보존권은 주 ${WEEKLY_TICKET_CAP}회, 같은 일정 1회, 보스 일정 불가.</div></div>`;
}

// ---- 상점 ----
const capLeft = ()=>{ const c = S(); return DAILY_BUY_CAP - (c.buyDate===todayStr() ? c.buyCount : 0); };
function shopPanel(){
  const c = S();
  const tabs = [['theme','테마'],['decor','날짜 장식'],['fx','이펙트'],['item','아이템'],['chest','상자']]
    .map(([k,l])=>`<button class="${shopTab===k?'on':''}" onclick="calShopTab('${k}')">${l}</button>`).join('');
  let body = '';
  if(shopTab==='theme') body = THEMES.map(t=>{
    const own = c.themes.includes(t.id), on = c.active===t.id;
    const btn = on ? `<button class="on" disabled>사용 중</button>` : own ? `<button onclick="calApply('${t.id}')">적용</button>` : `<button onclick="calBuy('${t.id}')">🪙${t.price}</button>`;
    return `<div class="cal-row"><span style="font-size:20px">${t.icon}</span><span class="t">${t.name}<div class="s">${t.desc}</div></span>${btn}</div>`;
  }).join('');
  if(shopTab==='decor'){
    const cur = c.decor[sel];
    body = `<div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">선택한 날짜 <b>${sel}</b>에 적용됩니다.</div>` + DECORS.map(d=>{
      const on = cur===d.id;
      return `<div class="cal-row"><span style="font-size:20px">${d.icon}</span><span class="t">${d.name} 테두리</span>${on?`<button class="on" disabled>적용됨</button>`:`<button onclick="calBuyDecor('${d.id}')">🪙${d.price}</button>`}</div>`;
    }).join('') + (cur?`<div class="cal-row"><span class="t">장식 제거 (무료)</span><button onclick="calClearDecor()">제거</button></div>`:'');
  }
  if(shopTab==='fx') body = EFFECTS.map(e=>{
    const own = c.effects.includes(e.id), on = c.effect===e.id;
    const btn = on ? `<button onclick="calSetEffect(null)">끄기</button>` : own ? `<button onclick="calSetEffect('${e.id}')">적용</button>` : `<button onclick="calBuyEffect('${e.id}')">🪙${e.price}</button>`;
    return `<div class="cal-row"><span style="font-size:20px">${e.icon}</span><span class="t">${e.name}<div class="s">${e.desc}${on?' · 사용 중':''}</div></span>${btn}</div>`;
  }).join('');
  if(shopTab==='item'){
    const wk = weekKey(todayStr()), used = c.usage.week===wk ? c.usage.n : 0;
    body = `<div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">이번 주 사용 ${used}/${WEEKLY_TICKET_CAP}회 · 사용하면 해당 퀘스트 보상이 50%가 됩니다.</div>` + Object.entries(TICKETS).map(([k,t])=>
      `<div class="cal-row"><span style="font-size:20px">${t.icon}</span><span class="t">${t.name} <b>×${c.tickets[k]}</b><div class="s">${t.desc}</div></span><button onclick="calBuyTicket('${k}')">🪙${t.price}</button></div>`).join('');
  }
  if(shopTab==='chest') body = `<div class="cal-row"><span style="font-size:20px">🔒</span><span class="t">잠긴 상자<div class="s">골드·코인·경험치 중 랜덤 (평균 가치는 구매가 이하)</div></span><button onclick="calBuyChest()">🪙${LOCKED_CHEST_PRICE}</button></div>`;
  const capped = shopTab!=='item';
  return `<div class="cal-panel"><h3>🎨 캘린더 상점${capped?` (오늘 꾸미기 구매 ${Math.max(0,capLeft())}회 남음)`:''}</h3><div class="cal-tabs">${tabs}</div>${body}</div>`;
}

// ---- 보물상자 ----
function monthKey(){ return `${ym.y}-${pad(ym.m+1)}`; }
function monthClears(){ const c = S(), k = monthKey(); return Object.keys(c.clearDays).filter(d=>d.startsWith(k)).length; }
function chestPanel(){
  const c = S(), n = c.chests.normal, mc = monthClears();
  const claimed = c.monthClaimed===monthKey(), ready = mc>=MONTH_CLEAR_GOAL && !claimed;
  return `<div class="cal-panel"><h3>📦 보물상자</h3>
    <div class="cal-row"><span style="font-size:20px">🎁</span><span class="t">일반 상자 <b>×${n}</b><div class="s">오늘의 던전을 클리어하면 1개</div></span><button ${n?'':'disabled'} onclick="calOpenChest()">열기</button></div>
    <div class="cal-row"><span style="font-size:20px">👑</span><span class="t">월간 보물상자<div class="s">이달 던전 클리어 ${Math.min(mc,MONTH_CLEAR_GOAL)}/${MONTH_CLEAR_GOAL}일 · 희귀 테마·이펙트</div></span><button ${ready?'':'disabled'} onclick="calClaimMonth()">${claimed?'수령함':'받기'}</button></div></div>`;
}

function render(){
  const wrap = $('cal-wrap');
  if(!wrap || !state) return;
  if(!sel) sel = todayStr();
  const c = S(), th = theme();
  wrap.className = c.effect ? `fx-${c.effect}` : '';
  wrap.style.setProperty('--ca', th.accent); wrap.style.setProperty('--cb', th.bg); wrap.style.setProperty('--cl', th.line);
  const first = new Date(ym.y, ym.m, 1).getDay(), days = new Date(ym.y, ym.m+1, 0).getDate(), today = todayStr();
  let cells = '';
  for(let i=0;i<first;i++) cells += `<div class="cal-day blank"></div>`;
  for(let d=1; d<=days; d++) cells += dayCell(d, today);
  wrap.innerHTML = `
    <div class="cal-top"><button class="chip" onclick="calToggleShop()">🎨 상점 ${th.icon} ${th.name}</button></div>
    <div class="cal-box">
      <div class="cal-head"><button onclick="calMove(-1)">‹</button><span class="ttl">${th.icon} ${ym.y}년 ${ym.m+1}월</span><button onclick="calMove(1)">›</button></div>
      <div class="cal-grid">${['일','월','화','수','목','금','토'].map(w=>`<div class="cal-dow">${w}</div>`).join('')}${cells}</div>
    </div>
    ${shopOpen ? shopPanel() : ''}${dayPanel()}${chestPanel()}${pending ? confirmModal() : ''}`;
}

// 구매 확인: 실수로 누르지 않도록 모든 구매는 확인 창을 거친다
function ask(desc, price, run){ pending = {desc, price, run}; render(); }
function confirmModal(){
  const g = state.gold, after = g - pending.price, ok = after >= 0;
  return `<div class="cal-modal" onclick="if(event.target===this)calAskNo()"><div class="box" role="dialog" aria-modal="true"><div><b>${pending.desc}</b></div><div>🪙${pending.price}에 구매할까요?</div><div class="s">${ok?`보유 🪙${g} → 구매 후 🪙${after}`:`골드가 부족해요. (보유 🪙${g})`}</div><div class="btns"><button onclick="calAskNo()">취소</button><button class="go" ${ok?'':'disabled'} onclick="calAskYes()">구매</button></div></div></div>`;
}
window.calAskNo = ()=>{ pending = null; render(); };
window.calAskYes = async ()=>{ const r = pending; pending = null; render(); if(r) await r.run(); };

// 골드 지불 공통 처리: capped=true면 하루 구매 한도를 함께 소모한다
async function pay(price, capped){
  const c = S(), today = todayStr();
  if(capped){
    if(c.buyDate!==today){ c.buyDate = today; c.buyCount = 0; }
    if(c.buyCount>=DAILY_BUY_CAP){ toast(`꾸미기 구매는 하루에 ${DAILY_BUY_CAP}번까지예요.`); return false; }
  }
  if(state.gold < price){ toast(`골드가 부족해요. (${state.gold}/${price}G)`); return false; }
  state.gold -= price; trackGold(-price);
  if(capped) c.buyCount++;
  return true;
}
async function done(msg){ await saveState(); if(msg) toast(msg); renderAll(); render(); }

window.calRender = render;
window.calMove = (dm)=>{ const d = new Date(ym.y, ym.m+dm, 1); ym = {y:d.getFullYear(), m:d.getMonth()}; render(); };
window.calSelect = (ds)=>{ sel = ds; act = null; render(); };
window.calToggleShop = ()=>{ shopOpen = !shopOpen; render(); };
window.calShopTab = (k)=>{ shopTab = k; render(); };
window.calApply = async (id)=>{ const c = S(); if(!c.themes.includes(id)) return; c.active = id; await saveState(); render(); };
window.calBuy = (id)=>{
  const t = THEMES.find(x=>x.id===id), c = S();
  if(!t || c.themes.includes(id)) return;
  ask(`${t.icon} ${t.name} 테마`, t.price, async ()=>{
    if(!(await pay(t.price, true))) return;
    c.themes.push(id); c.active = id;
    await done(`${t.icon} ${t.name} 테마를 구매했어요!`);
  });
};
window.calBuyDecor = (id)=>{
  const d = DECORS.find(x=>x.id===id), c = S();
  if(!d || !sel) return;
  const day = sel;
  ask(`${d.icon} ${d.name} 장식 (${day})`, d.price, async ()=>{
    if(!(await pay(d.price, true))) return;
    c.decor[day] = id;
    await done(`${d.icon} ${day}을 꾸몄어요!`);
  });
};
window.calClearDecor = async ()=>{ const c = S(); delete c.decor[sel]; await saveState(); render(); };
window.calBuyEffect = (id)=>{
  const e = EFFECTS.find(x=>x.id===id), c = S();
  if(!e || c.effects.includes(id)) return;
  ask(`${e.icon} ${e.name} 이펙트`, e.price, async ()=>{
    if(!(await pay(e.price, true))) return;
    c.effects.push(id); c.effect = id;
    await done(`${e.icon} ${e.name} 이펙트를 구매했어요!`);
  });
};
window.calSetEffect = async (id)=>{ const c = S(); if(id && !c.effects.includes(id)) return; c.effect = id; await saveState(); render(); };
window.calBuyTicket = (k)=>{
  const t = TICKETS[k], c = S();
  if(!t) return;
  ask(`${t.icon} ${t.name}`, t.price, async ()=>{
    if(!(await pay(t.price, false))) return;
    c.tickets[k]++;
    await done(`${t.icon} ${t.name}을 샀어요! (${c.tickets[k]}개)`);
  });
};
window.calStartMove = (id, mode)=>{
  const q = state.quests.find(x=>x.id===id); if(!q) return;
  const why = moveBlock(q); if(why){ toast(why); return; }
  if(!S().tickets[mode]){ toast(`${TICKETS[mode].name}이 없어요. 상점의 아이템 탭에서 살 수 있어요.`); shopOpen = true; shopTab = 'item'; render(); return; }
  act = {id, mode}; render();
};
window.calCancelMove = ()=>{ act = null; render(); };
window.calConfirmMove = async ()=>{
  if(!act) return;
  const q = state.quests.find(x=>x.id===act.id); if(!q){ act = null; render(); return; }
  const el = $('cal-move-date');
  await applyMove(q, act.mode, el ? el.value : null);
};

// 상자
async function giveChestReward(kind){
  let icon = '🎁', text = '';
  const r = Math.random();
  if(kind==='normal'){
    if(r<0.6){ const g = rnd(10,30); state.gold += g; trackGold(g); text = `+${g}G`; }
    else if(r<0.9){ const x = rnd(15,40); state.totalXP += x; text = `+${x}XP`; }
    else { const {coin, isNew} = awardCoin(); text = `${coin.icon} ${coin.name}${isNew?' (NEW)':''}`; }
  } else { // 잠긴 상자: 평균 가치가 구매가보다 낮게 유지
    icon = '🔒';
    if(r<0.5){ const g = rnd(100,300); state.gold += g; trackGold(g); text = `+${g}G`; }
    else if(r<0.8){ const {coin, isNew} = awardCoin(); text = `${coin.icon} ${coin.name}${isNew?' (NEW)':''}`; }
    else { const x = rnd(60,140); state.totalXP += x; text = `+${x}XP`; }
  }
  if(window.logGain) logGain(icon, kind==='normal'?'일반 상자':'잠긴 상자', text);
  return text;
}
window.calOpenChest = async ()=>{
  const c = S(); if(c.chests.normal<1) return;
  c.chests.normal--;
  const t = await giveChestReward('normal');
  await done(`🎁 일반 상자: ${t}`);
};
window.calBuyChest = ()=>{
  ask('🔒 잠긴 상자', LOCKED_CHEST_PRICE, async ()=>{
    if(!(await pay(LOCKED_CHEST_PRICE, true))) return;
    const t = await giveChestReward('locked');
    await done(`🔒 잠긴 상자: ${t}`);
  });
};
window.calClaimMonth = async ()=>{
  const c = S(), k = monthKey();
  if(c.monthClaimed===k || monthClears()<MONTH_CLEAR_GOAL) return;
  const pool = [...THEMES.filter(t=>t.price>0 && !c.themes.includes(t.id)).map(t=>({kind:'theme',o:t})), ...EFFECTS.filter(e=>!c.effects.includes(e.id)).map(e=>({kind:'fx',o:e}))];
  let text;
  if(pool.length){
    const p = pool[rnd(0, pool.length-1)];
    if(p.kind==='theme'){ c.themes.push(p.o.id); c.active = p.o.id; } else { c.effects.push(p.o.id); c.effect = p.o.id; }
    text = `${p.o.icon} ${p.o.name} ${p.kind==='theme'?'테마':'이펙트'}`;
  } else { state.gold += 300; trackGold(300); text = '+300G'; }
  c.monthClaimed = k;
  if(window.logGain) logGain('👑', '월간 보물상자', text);
  await done(`👑 월간 보물상자: ${text}`);
};

// 오늘의 던전 클리어 판정: 퀘스트 완료/취소 때마다 index.html에서 호출한다 (하루 1회 일반 상자)
window.calOnQuestChange = ()=>{
  if(!state || !state.character) return;
  const c = S(), today = todayStr(), qs = questsOn(today);
  if(qs.length && qs.every(q=>isDone(q, today)) && !c.clearDays[today]){
    c.clearDays[today] = true; c.chests.normal++;
    saveState();
    toast('🏆 오늘의 던전 클리어! 일반 상자 +1');
    if($('cal-wrap') && !$('screen-calendar').classList.contains('hidden')) render();
  }
};
})();
