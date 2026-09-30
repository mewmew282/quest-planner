/* 캘린더 월드맵: 월간 캘린더 · 테마/날짜 장식/이펙트/스킨 · 일정 아이템 · 휴식 · 미래 일정 투자 · 보물상자 · 보관함.
   하단 '캘린더' 탭(#screen-calendar)에 그려진다.
   index.html의 전역(state, saveState, trackGold, todayStr, catIcon, escapeHtml, toast, renderAll, awardCoin, logGain, CLASSES)을 사용한다. */
(function(){
const $ = (id)=>document.getElementById(id);

// 가격은 퀘스트 골드(XP÷5: 보통 20G, 하루 5개 약 100G) 기준
const THEMES = [
  {id:'kingdom',   name:'기본 왕국',   icon:'🏰', price:0,    accent:'#E7B549', bg:'#221C3B', line:'#372C55', desc:'기본 월드맵'},
  {id:'forest',    name:'숲속 마을',   icon:'🌲', price:300,  accent:'#6FCF97', bg:'#16281F', line:'#2C4A38', desc:'초록빛 숲속 지도'},
  {id:'halloween', name:'할로윈 마을', icon:'🎃', price:500,  accent:'#FF9F43', bg:'#241408', line:'#5A3210', desc:'호박등이 켜진 밤 마을'},
  {id:'winter',    name:'겨울 왕국',   icon:'❄️', price:600,  accent:'#9AD7FF', bg:'#101E2E', line:'#2A4A66', desc:'눈 덮인 얼음 성'},
  {id:'pirate',    name:'해적 항구',   icon:'🏴‍☠️', price:700,  accent:'#3FB8AF', bg:'#0E2230', line:'#1F4B5E', desc:'파도치는 항구 도시'},
  {id:'academy',   name:'마법 학교',   icon:'🔮', price:800,  accent:'#B58CFF', bg:'#24173F', line:'#4A3479', desc:'보랏빛 마법진 지도'},
  {id:'cyber',     name:'사이버 도시', icon:'🌆', price:1500, accent:'#4FE0F0', bg:'#0F1B2B', line:'#1F4A66', desc:'네온 불빛 도시 지도'},
];
const DECORS = [ // 선택한 날짜 한 칸에 적용 (같은 날짜는 덮어쓰기)
  {id:'star',  name:'별 테두리',   icon:'⭐', price:50,  color:'#F5D76E'},
  {id:'flame', name:'불꽃 테두리', icon:'🔥', price:100, color:'#FF8A4C'},
  {id:'gem',   name:'보석 테두리', icon:'💎', price:200, color:'#5CE1E6'},
  {id:'rune',  name:'룬 테두리',   icon:'ᚱ',  price:300, color:'#C79BFF'},
  {id:'ic_sword',  name:'검 아이콘',     icon:'⚔️', price:80, color:'#C0C8D8'},
  {id:'ic_shield', name:'방패 아이콘',   icon:'🛡', price:80, color:'#8FB4E8'},
  {id:'ic_book',   name:'책 아이콘',     icon:'📚', price:80, color:'#E8B98F'},
  {id:'ic_potion', name:'포션 아이콘',   icon:'🧪', price:80, color:'#7DE3A8'},
  {id:'ic_chest',  name:'보물상자 아이콘', icon:'🎁', price:80, color:'#F0A0C0'},
  {id:'stamp', name:'캐릭터 스탬프', icon:'', price:150, color:'#F4EFEA', stamp:true},
  {id:'bg',    name:'특별 배경',     icon:'🌌', price:250, color:'#7C5CFF', bg:true},
];
const EFFECTS = [ // 캘린더 전체에 적용되는 애니메이션
  {id:'sparkle', name:'반짝임', icon:'✨', price:400,  desc:'오늘 칸이 반짝입니다'},
  {id:'flame',   name:'불꽃',   icon:'🔥', price:800,  desc:'꾸민 날짜가 타오릅니다'},
  {id:'magic',   name:'마법진', icon:'🌀', price:1200, desc:'캘린더 테두리가 빛납니다'},
];
const SKINS = {
  char: [ // 홈 캐릭터 오라 색
    {id:'gold',  name:'황금 오라',   icon:'🟡', price:1000, color:'#FFD700'},
    {id:'moon',  name:'월광 오라',   icon:'🔵', price:2000, color:'#9FB8FF'},
    {id:'flame', name:'화염 오라',   icon:'🟠', price:3000, color:'#FF6A3D'},
    {id:'royal', name:'왕가의 오라', icon:'🟣', price:5000, color:'#C77DFF'},
  ],
  npc: [ // 홈 NPC 말풍선 아이콘
    {id:'dragon', name:'드래곤 NPC', icon:'🐉', price:1500},
    {id:'robot',  name:'로봇 NPC',   icon:'🤖', price:2500},
    {id:'fairy',  name:'요정 NPC',   icon:'🧚', price:3500},
  ],
};
const TICKETS = {
  change:  {name:'일정 변경권',   icon:'📜', price:50,   desc:'마감 전 퀘스트의 날짜를 바꿉니다 (보상 50%)'},
  keep:    {name:'일정 보존권',   icon:'🛡', price:150,  desc:'놓친 퀘스트를 내일로 옮깁니다 (보상 50%)'},
  time:    {name:'시간 연장권',   icon:'⏳', price:120,  desc:'오늘 마감 퀘스트를 내일까지 연장합니다 (보상 75%)'},
  revive:  {name:'부활권',        icon:'✨', price:1000, desc:'놓친 퀘스트를 오늘로 되살립니다 (보상 유지, 보스 가능)'},
  rest:    {name:'휴식권',        icon:'🏨', price:500,  desc:'오늘 하루 쉬기: 스트레스 해소·HP 회복·연속 출석 보호'},
  boost:   {name:'퀘스트 부스터', icon:'⚔️', price:250,  desc:'다음 퀘스트 1개 완료 보상 +50%'},
};
const INVEST = [ // 미래 일정 투자: 완료해야 보상, 미완료 시 소멸 (게임 내 골드만 사용)
  {tier:1, name:'미래 보급품', price:300,  desc:'완료 시 XP +100%'},
  {tier:2, name:'전투 자금',   price:500,  desc:'완료 시 XP·골드 +100%'},
  {tier:3, name:'왕의 하사품', price:1000, desc:'XP·골드 +100% + 황금 보물상자 1개'},
];
const REGION = {'공부':['📚','지식 던전'], '운동':['🏋️','훈련소'], '창작':['🎨','제작소'], '사회':['🎉','축제 지역'], '생활':['🏘','마을'], '기타':['💼','상업 도시']};
const MOVE_RATE = {change:0.5, keep:0.5, time:0.75, revive:1};
const GOLDEN_CHEST_PRICE = 300;
const DAILY_BUY_CAP = 2;        // 꾸미기(테마·장식·이펙트·스킨)·황금 상자 하루 구매 한도
const WEEKLY_TICKET_CAP = 2;    // 변경권·보존권·시간 연장권 사용: 주 2회
const MONTH_CLEAR_GOAL = 10;    // 월간 보물상자: 이달 던전 클리어 일수

const now = new Date();
let ym = {y:now.getFullYear(), m:now.getMonth()}, sel = null, panel = null, shopTab = 'theme', previewId = null;
let act = null;     // 진행 중인 아이템 사용 {id, mode}
let pending = null; // 확인 대기 {desc, price, run, verb}

const pad = (n)=> String(n).padStart(2,'0');
const ymd = (y,m,d)=> `${y}-${pad(m+1)}-${pad(d)}`;
const dateStr = (dt)=> ymd(dt.getFullYear(), dt.getMonth(), dt.getDate());
const addDays = (ds, n)=>{ const d = new Date(ds+'T00:00:00'); d.setDate(d.getDate()+n); return dateStr(d); };
const weekKey = (ds)=>{ const d = new Date(ds+'T00:00:00'); d.setDate(d.getDate()-((d.getDay()+6)%7)); return dateStr(d); }; // 월요일 시작
const rnd = (a,b)=> a + Math.floor(Math.random()*(b-a+1));

// 저장 상태 보정: 이전 버전 저장본에도 새 필드를 채운다 (항상 같은 객체를 돌려준다)
function S(){
  const c = state.calendar || (state.calendar = {});
  const fill = (o, k, v)=>{ if(o[k]===undefined || o[k]===null) o[k] = v; };
  fill(c,'themes',['kingdom']); fill(c,'active','kingdom'); fill(c,'buyDate',null); fill(c,'buyCount',0);
  fill(c,'decor',{}); fill(c,'effects',[]); fill(c,'effect',null);
  fill(c,'tickets',{}); Object.keys(TICKETS).forEach(k=>fill(c.tickets,k,0));
  fill(c,'usage',{}); fill(c.usage,'week',null); fill(c.usage,'n',0);
  fill(c,'moved',{}); fill(c,'revived',{}); fill(c,'invest',{});
  fill(c,'chests',{}); fill(c.chests,'normal',0); fill(c.chests,'golden',0);
  fill(c,'clearDays',{}); fill(c,'monthClaimed',null);
  fill(c,'restDays',{}); fill(c,'boostActive',false);
  fill(c,'skinOwned',[]); fill(c,'skinChar',null); fill(c,'skinNpc',null);
  return c;
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
const rIcon = (q)=> (REGION[q.category]||['✨'])[0];
const rName = (q)=> (REGION[q.category]||['','기타 지역'])[1];
const decIcon = (d)=> d.stamp ? ((typeof CLASSES!=='undefined' && state.character && CLASSES[state.character.cls]) ? CLASSES[state.character.cls].icon : '⭐') : d.icon;

// HP·스트레스 게이지: 놓친 퀘스트와 오늘 남은 퀘스트로 계산하고, 휴식하면 0/100으로 회복
function gauges(){
  const c = S(), today = todayStr();
  if(c.restDays[today]) return {hp:100, stress:0, rest:true};
  const over = state.quests.filter(q=>q.type==='dated' && q.status!=='done' && q.dueDate<today).length;
  const left = questsOn(today).filter(q=>!isDone(q, today)).length;
  const stress = Math.min(100, over*20 + left*5);
  return {hp:100-stress, stress, rest:false};
}

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
.cal-day.dbg{background:linear-gradient(135deg,var(--dc),rgba(0,0,0,.25))}
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
.cal-top{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap}
.cal-top .g{font-size:11.5px;color:var(--text-dim)}
.cal-tabs{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap}
.cal-act{width:100%;display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--text-dim);padding:4px 0}
.cal-act input{background:var(--card);color:var(--text);border:1px solid var(--cl);border-radius:8px;padding:6px}
.cal-prev{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;padding:8px;border:1px dashed var(--ca);border-radius:10px;font-size:12px}
.cal-prev span{flex:1;min-width:0}.cal-prev button{padding:6px 10px;border-radius:8px;border:1px solid var(--cl);background:var(--card-hi);color:var(--text);font-size:12px}
.cal-bar{height:8px;border-radius:6px;background:rgba(255,255,255,.1);overflow:hidden;flex:1;min-width:80px}.cal-bar i{display:block;height:100%}
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
  const icons = dated.slice(0,2).map(q=> isBoss(q) ? '👑' : rIcon(q)).join('');
  const more = dated.length>2 ? `+${dated.length-2}` : '';
  const rep = qs.length-dated.length>0 ? '·' : '';
  const dec = DECORS.find(x=>x.id===c.decor[ds]);
  const style = dec ? ` style="--dc:${dec.color}"` : '';
  const cls = `${ds===today?' today':''}${ds===sel?' sel':''}${dec?(dec.bg?' dbg':' dc'):''}`;
  return `<button class="cal-day${cls}"${style} onclick="calSelect('${ds}')"><span class="n"><span>${d}</span><span>${dec&&!dec.bg?decIcon(dec):''}${c.clearDays[ds]?'🏆':''}${c.restDays[ds]?'🏨':''}</span></span><span class="ic">${icons}${more}${rep}</span></button>`;
}

// ---- 일정 아이템 규칙 ----
function moveBlock(q, mode){
  const c = S(), today = todayStr();
  if(q.type!=='dated') return '마감일 퀘스트에만 쓸 수 있어요';
  if(q.status==='done') return '이미 완료한 퀘스트예요';
  if(c.invest[q.id] && !c.invest[q.id].used) return '투자한 일정에는 쓸 수 없어요';
  if(mode==='revive'){
    if(q.dueDate>=today) return '놓친 퀘스트에만 쓸 수 있어요';
    if(c.revived[q.id]) return '같은 일정에는 1회만 쓸 수 있어요';
    return null;
  }
  if(isBoss(q)) return '보스(중요 마감) 일정에는 쓸 수 없어요';
  if(c.moved[q.id]) return '같은 일정에는 1회만 쓸 수 있어요';
  const wk = weekKey(today);
  if(c.usage.week===wk && c.usage.n>=WEEKLY_TICKET_CAP) return `이번 주 사용 횟수(${WEEKLY_TICKET_CAP}회)를 모두 썼어요`;
  if(mode==='keep' && q.dueDate>=today) return '놓친 퀘스트에만 쓸 수 있어요';
  if(mode==='change' && q.dueDate<today) return '놓친 퀘스트에는 보존권을 써 주세요';
  if(mode==='time' && q.dueDate!==today) return '오늘 마감인 퀘스트에만 쓸 수 있어요';
  return null;
}
async function applyMove(q, mode, newDate){
  const c = S(), today = todayStr();
  const why = moveBlock(q, mode);
  if(why){ toast(why); return; }
  if(!c.tickets[mode]){ toast(`${TICKETS[mode].name}이 없어요. 상점의 아이템 탭에서 살 수 있어요.`); return; }
  if(mode==='keep' || mode==='time') newDate = addDays(today, 1);
  if(mode==='revive') newDate = today;
  if(mode==='change' && (!newDate || newDate < today || newDate===q.dueDate)){ toast('오늘 이후의 다른 날짜를 골라 주세요'); return; }
  if(mode==='revive'){ c.revived[q.id] = true; }
  else {
    const wk = weekKey(today);
    if(c.usage.week!==wk) c.usage = {week:wk, n:0};
    c.usage.n++; c.moved[q.id] = true;
  }
  c.tickets[mode]--;
  q.dueDate = newDate;
  const rate = MOVE_RATE[mode];
  q.xp = Math.round(q.xp*rate); q.gold = Math.round(q.gold*rate);
  state.questsUpdatedAt = Date.now();
  act = null; sel = newDate;
  const d = new Date(newDate+'T00:00:00'); ym = {y:d.getFullYear(), m:d.getMonth()};
  await saveState();
  toast(`${TICKETS[mode].icon} ${newDate}로 옮겼어요${rate<1?` (보상 ${Math.round(rate*100)}%)`:''}`);
  renderAll(); render();
}

function investBlock(q){
  const c = S();
  if(q.type!=='dated' || q.status==='done') return '마감일 퀘스트만 투자할 수 있어요';
  if(q.dueDate <= todayStr()) return '미래 일정에만 투자할 수 있어요';
  if(c.invest[q.id]) return '이미 투자한 일정이에요';
  if(c.moved[q.id]) return '일정을 바꾼 퀘스트에는 투자할 수 없어요';
  return null;
}

function actBox(q){
  if(!act || act.id!==q.id) return '';
  const today = todayStr(), m = act.mode;
  const btns = `<button onclick="calConfirmMove()">확인</button><button onclick="calCancelMove()">취소</button>`;
  if(m==='invest') return `<div class="cal-act"><span>완료하면 보상이 커져요. 미완료 시 골드는 사라지고, 마감일까지 완료해야 해요.</span>${INVEST.map(t=>`<button onclick="calInvest('${q.id}',${t.tier})">${t.name} 🪙${t.price}<br><small>${t.desc}</small></button>`).join('')}<button onclick="calCancelMove()">취소</button></div>`;
  if(m==='keep' || m==='time') return `<div class="cal-act"><span>내일(${addDays(today,1)})로 옮기고 보상이 ${Math.round(MOVE_RATE[m]*100)}%가 돼요.</span>${btns}</div>`;
  if(m==='revive') return `<div class="cal-act"><span>오늘로 되살려요. 보상은 그대로예요.</span>${btns}</div>`;
  return `<div class="cal-act"><input type="date" id="cal-move-date" min="${today}" value="${addDays(today,1)}"><span>보상이 50%가 돼요.</span>${btns}</div>`;
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
      const modes = q.dueDate<today ? ['keep','revive'] : q.dueDate===today ? ['change','time'] : ['change'];
      const shown = modes.filter(m=>!moveBlock(q, m));
      btn = shown.map(m=>`<button onclick="calStartMove('${q.id}','${m}')">${TICKETS[m].icon} ${TICKETS[m].name} (${c.tickets[m]})</button>`).join('');
      if(!investBlock(q)) btn += `<button onclick="calStartMove('${q.id}','invest')">💰 투자</button>`;
      if(!btn) btn = `<span class="s" title="${moveBlock(q, modes[0])||''}">🔒</span>`;
    }
    const inv = c.invest[q.id];
    const tag = q.type==='dated' ? (isBoss(q)?'👑 보스':(q.dueDate<today&&q.status!=='done'?'놓친 퀘스트':'마감 퀘스트')) : '반복 퀘스트';
    return `<div class="cal-row"><span>${isBoss(q)?'👑':rIcon(q)}</span><span class="t">${escapeHtml(q.title)}<div class="s">${rIcon(q)} ${rName(q)} · ${tag} · +${q.xp}XP${q.gold>0?` · +${q.gold}G`:''}${c.moved[q.id]?' · 일정 변경됨':''}${inv&&!inv.used?` · 💰투자 ${inv.tier}단계`:''}</div></span>${btn}<span>${isDone(q, sel)?'✅':''}</span>${actBox(q)}</div>`;
  }).join('');
  return `<div class="cal-panel"><h3>${head}</h3>${rows}<div style="color:var(--text-faint);font-size:11px;margin-top:6px">완료 체크는 홈 또는 전체 퀘스트에서 합니다. 변경권·보존권·시간 연장권은 주 ${WEEKLY_TICKET_CAP}회, 같은 일정 1회, 보스 일정 불가.</div></div>`;
}

// ---- 상점 ----
const capLeft = ()=>{ const c = S(); return DAILY_BUY_CAP - (c.buyDate===todayStr() ? c.buyCount : 0); };
function shopPanel(){
  const c = S();
  const tabs = [['theme','테마'],['decor','날짜 장식'],['fx','이펙트'],['skin','스킨'],['item','아이템'],['chest','상자']]
    .map(([k,l])=>`<button class="${shopTab===k?'on':''}" onclick="calShopTab('${k}')">${l}</button>`).join('');
  let body = '';
  if(shopTab==='theme') body = THEMES.map(t=>{
    const own = c.themes.includes(t.id), on = c.active===t.id;
    const btn = on ? `<button class="on" disabled>사용 중</button>` : own ? `<button onclick="calApply('${t.id}')">적용</button>` : `<button onclick="calBuy('${t.id}')">🪙${t.price}</button>`;
    return `<div class="cal-row"><span style="font-size:20px">${t.icon}</span><span class="t">${t.name}<div class="s">${t.desc}</div></span><button onclick="calPreview('${t.id}')">미리보기</button>${btn}</div>`;
  }).join('');
  if(shopTab==='decor'){
    const cur = c.decor[sel];
    body = `<div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">선택한 날짜 <b>${sel}</b>에 적용됩니다. (날짜 전용 이펙트는 이펙트 탭의 '불꽃')</div>` + DECORS.map(d=>{
      const on = cur===d.id;
      return `<div class="cal-row"><span style="font-size:20px">${decIcon(d)||'🌌'}</span><span class="t">${d.name}</span>${on?`<button class="on" disabled>적용됨</button>`:`<button onclick="calBuyDecor('${d.id}')">🪙${d.price}</button>`}</div>`;
    }).join('') + (cur?`<div class="cal-row"><span class="t">장식 제거 (무료)</span><button onclick="calClearDecor()">제거</button></div>`:'');
  }
  if(shopTab==='fx') body = EFFECTS.map(e=>{
    const own = c.effects.includes(e.id), on = c.effect===e.id;
    const btn = on ? `<button onclick="calSetEffect(null)">끄기</button>` : own ? `<button onclick="calSetEffect('${e.id}')">적용</button>` : `<button onclick="calBuyEffect('${e.id}')">🪙${e.price}</button>`;
    return `<div class="cal-row"><span style="font-size:20px">${e.icon}</span><span class="t">${e.name}<div class="s">${e.desc}${on?' · 사용 중':''}</div></span>${btn}</div>`;
  }).join('');
  if(shopTab==='skin') body = ['char','npc'].map(kind=>{
    const key = kind==='char' ? 'skinChar' : 'skinNpc';
    return `<div style="font-size:12px;color:var(--text-dim);margin:6px 0 2px">${kind==='char'?'캐릭터 스킨 (홈 캐릭터 오라)':'NPC 스킨 (홈 NPC 아이콘)'}</div>` + SKINS[kind].map(s=>{
      const sid = kind+':'+s.id, own = c.skinOwned.includes(sid), on = c[key]===s.id;
      const btn = on ? `<button onclick="calSetSkin('${kind}',null)">해제</button>` : own ? `<button onclick="calSetSkin('${kind}','${s.id}')">적용</button>` : `<button onclick="calBuySkin('${kind}','${s.id}')">🪙${s.price}</button>`;
      return `<div class="cal-row"><span style="font-size:20px">${s.icon}</span><span class="t">${s.name}${on?' · 사용 중':''}</span>${btn}</div>`;
    }).join('');
  }).join('');
  if(shopTab==='item'){
    const wk = weekKey(todayStr()), used = c.usage.week===wk ? c.usage.n : 0;
    body = `<div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">변경·보존·시간 연장권 이번 주 사용 ${used}/${WEEKLY_TICKET_CAP}회</div>` + Object.entries(TICKETS).map(([k,t])=>
      `<div class="cal-row"><span style="font-size:20px">${t.icon}</span><span class="t">${t.name} <b>×${c.tickets[k]}</b><div class="s">${t.desc}</div></span><button onclick="calBuyTicket('${k}')">🪙${t.price}</button></div>`).join('');
  }
  if(shopTab==='chest') body = `<div class="cal-row"><span style="font-size:20px">🎁</span><span class="t">황금 보물상자<div class="s">골드로 개봉: 골드·코인·경험치·퀘스트 부스터 중 랜덤 (평균 가치는 구매가 이하)</div></span><button onclick="calBuyChest()">🪙${GOLDEN_CHEST_PRICE}</button></div>`;
  const capped = !['item'].includes(shopTab);
  return `<div class="cal-panel"><h3>🎨 캘린더 상점${capped?` (오늘 꾸미기 구매 ${Math.max(0,capLeft())}회 남음)`:''}</h3><div class="cal-tabs">${tabs}</div>${body}</div>`;
}

// ---- 보관함 ----
function bagPanel(){
  const c = S(), g = gauges();
  const bar = (v,col)=>`<span class="cal-bar"><i style="width:${v}%;background:${col}"></i></span>`;
  const rows = Object.entries(TICKETS).map(([k,t])=>{
    let btn = `<span class="s">일정 카드에서 사용</span>`;
    if(k==='rest') btn = `<button ${c.tickets.rest?'':'disabled'} onclick="calUseRest()">사용</button>`;
    if(k==='boost') btn = c.boostActive ? `<button class="on" disabled>활성 중</button>` : `<button ${c.tickets.boost?'':'disabled'} onclick="calUseBoost()">활성화</button>`;
    return `<div class="cal-row"><span style="font-size:20px">${t.icon}</span><span class="t">${t.name} <b>×${c.tickets[k]}</b><div class="s">${t.desc}</div></span>${btn}</div>`;
  }).join('');
  const inv = Object.entries(c.invest).filter(([,v])=>!v.used).length;
  return `<div class="cal-panel"><h3>🎒 아이템 보관함</h3>
    <div class="cal-row"><span>❤️ HP</span>${bar(g.hp,'#5EE08A')}<span>${g.hp}</span></div>
    <div class="cal-row"><span>😣 스트레스</span>${bar(g.stress,'#FF6A6A')}<span>${g.stress}</span>${g.rest?'<span class="s">🏨 휴식 중</span>':''}</div>
    ${rows}
    <div class="cal-row"><span style="font-size:20px">🎁</span><span class="t">황금 보물상자 <b>×${c.chests.golden}</b></span></div>
    <div class="cal-row"><span class="t">보유 꾸미기<div class="s">테마 ${c.themes.length}/${THEMES.length} · 이펙트 ${c.effects.length}/${EFFECTS.length} · 스킨 ${c.skinOwned.length}/${SKINS.char.length+SKINS.npc.length} · 진행 중 투자 ${inv}건</div></span></div></div>`;
}

// ---- 보물상자 ----
function monthKey(){ return `${ym.y}-${pad(ym.m+1)}`; }
function monthClears(){ const c = S(), k = monthKey(); return Object.keys(c.clearDays).filter(d=>d.startsWith(k)).length; }
function chestPanel(){
  const c = S(), mc = monthClears();
  const claimed = c.monthClaimed===monthKey(), ready = mc>=MONTH_CLEAR_GOAL && !claimed;
  return `<div class="cal-panel"><h3>📦 보물상자</h3>
    <div class="cal-row"><span style="font-size:20px">🎁</span><span class="t">일반 보물상자 <b>×${c.chests.normal}</b><div class="s">오늘의 던전을 클리어하면 1개 (무료)</div></span><button ${c.chests.normal?'':'disabled'} onclick="calOpenChest('normal')">열기</button></div>
    ${c.chests.golden?`<div class="cal-row"><span style="font-size:20px">🔒</span><span class="t">황금 보물상자 <b>×${c.chests.golden}</b><div class="s">투자 보상으로 받은 상자</div></span><button onclick="calOpenChest('golden')">열기</button></div>`:''}
    <div class="cal-row"><span style="font-size:20px">👑</span><span class="t">월간 보물상자<div class="s">이달 던전 클리어 ${Math.min(mc,MONTH_CLEAR_GOAL)}/${MONTH_CLEAR_GOAL}일 · 희귀 테마·이펙트</div></span><button ${ready?'':'disabled'} onclick="calClaimMonth()">${claimed?'수령함':'받기'}</button></div></div>`;
}

function render(){
  const wrap = $('cal-wrap');
  if(!wrap || !state) return;
  if(!sel) sel = todayStr();
  const c = S(), th = previewId ? (THEMES.find(t=>t.id===previewId)||theme()) : theme(), g = gauges();
  wrap.className = c.effect ? `fx-${c.effect}` : '';
  wrap.style.setProperty('--ca', th.accent); wrap.style.setProperty('--cb', th.bg); wrap.style.setProperty('--cl', th.line);
  const first = new Date(ym.y, ym.m, 1).getDay(), days = new Date(ym.y, ym.m+1, 0).getDate(), today = todayStr();
  let cells = '';
  for(let i=0;i<first;i++) cells += `<div class="cal-day blank"></div>`;
  for(let d=1; d<=days; d++) cells += dayCell(d, today);
  const own = previewId && c.themes.includes(previewId);
  const prev = previewId ? `<div class="cal-prev"><span>👀 ${th.icon} ${th.name} 미리보기 중</span>${own?`<button onclick="calApply('${previewId}')">적용</button>`:`<button onclick="calBuy('${previewId}')">🪙${th.price} 구매</button>`}<button onclick="calClosePreview()">닫기</button></div>` : '';
  wrap.innerHTML = `
    <div class="cal-top"><span class="g">❤️ ${g.hp} · 😣 ${g.stress}${g.rest?' · 🏨 휴식 중':''}</span><span><button class="chip" onclick="calTogglePanel('bag')">🎒 보관함</button> <button class="chip" onclick="calTogglePanel('shop')">🎨 상점</button></span></div>
    ${prev}
    <div class="cal-box">
      <div class="cal-head"><button onclick="calMove(-1)">‹</button><span class="ttl">${th.icon} ${ym.y}년 ${ym.m+1}월</span><button onclick="calMove(1)">›</button></div>
      <div class="cal-grid">${['일','월','화','수','목','금','토'].map(w=>`<div class="cal-dow">${w}</div>`).join('')}${cells}</div>
    </div>
    ${panel==='shop' ? shopPanel() : panel==='bag' ? bagPanel() : ''}${dayPanel()}${chestPanel()}${pending ? confirmModal() : ''}`;
}

// 구매·사용 확인: 실수로 누르지 않도록 모든 소비는 확인 창을 거친다
function ask(desc, price, run, verb){ pending = {desc, price, run, verb: verb||'구매'}; render(); }
function confirmModal(){
  const hasPrice = pending.price!=null, g = state.gold, after = g - (pending.price||0), ok = after >= 0;
  return `<div class="cal-modal" onclick="if(event.target===this)calAskNo()"><div class="box" role="dialog" aria-modal="true"><div><b>${pending.desc}</b></div><div>${hasPrice?`🪙${pending.price}에 ${pending.verb}할까요?`:`${pending.verb}할까요?`}</div><div class="s">${hasPrice?(ok?`보유 🪙${g} → ${pending.verb} 후 🪙${after}`:`골드가 부족해요. (보유 🪙${g})`):'&nbsp;'}</div><div class="btns"><button onclick="calAskNo()">취소</button><button class="go" ${ok?'':'disabled'} onclick="calAskYes()">${pending.verb}</button></div></div></div>`;
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
async function done(msg){ await saveState(); if(msg) toast(msg); renderAll(); render(); applySkins(); }

// ---- 스킨 적용: 홈 캐릭터 오라 색, NPC 아이콘 ----
function applySkins(){
  if(!state || !state.character) return;
  const c = S();
  const cs = SKINS.char.find(s=>s.id===c.skinChar), ns = SKINS.npc.find(s=>s.id===c.skinNpc);
  if(cs) document.querySelectorAll('.char-aura').forEach(el=>el.style.setProperty('--class-color', cs.color));
  if(ns) document.querySelectorAll('.npc-bubble .npc-ic').forEach(el=>{ el.textContent = ns.icon; });
}
['renderCharacterVisual','showNpcBubble'].forEach(fn=>{ // 캐릭터/NPC가 다시 그려질 때 스킨을 덮어쓴다
  const orig = window[fn];
  if(typeof orig==='function') window[fn] = function(){ const r = orig.apply(this, arguments); try{ applySkins(); }catch(e){} return r; };
});

window.calRender = render;
window.calMove = (dm)=>{ const d = new Date(ym.y, ym.m+dm, 1); ym = {y:d.getFullYear(), m:d.getMonth()}; render(); };
window.calSelect = (ds)=>{ sel = ds; act = null; render(); };
window.calTogglePanel = (k)=>{ panel = panel===k ? null : k; render(); };
window.calShopTab = (k)=>{ shopTab = k; render(); };
window.calPreview = (id)=>{ previewId = id; render(); };
window.calClosePreview = ()=>{ previewId = null; render(); };
window.calApply = async (id)=>{ const c = S(); if(!c.themes.includes(id)) return; c.active = id; previewId = null; await saveState(); render(); };
window.calBuy = (id)=>{
  const t = THEMES.find(x=>x.id===id), c = S();
  if(!t || c.themes.includes(id)) return;
  ask(`${t.icon} ${t.name} 테마`, t.price, async ()=>{
    if(!(await pay(t.price, true))) return;
    c.themes.push(id); c.active = id; previewId = null;
    await done(`${t.icon} ${t.name} 테마를 구매했어요!`);
  });
};
window.calBuyDecor = (id)=>{
  const d = DECORS.find(x=>x.id===id), c = S();
  if(!d || !sel) return;
  const day = sel;
  ask(`${decIcon(d)} ${d.name} (${day})`, d.price, async ()=>{
    if(!(await pay(d.price, true))) return;
    c.decor[day] = id;
    await done(`${day}을 꾸몄어요!`);
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
window.calBuySkin = (kind, id)=>{
  const s = SKINS[kind].find(x=>x.id===id), c = S(), sid = kind+':'+id;
  if(!s || c.skinOwned.includes(sid)) return;
  ask(`${s.icon} ${s.name}`, s.price, async ()=>{
    if(!(await pay(s.price, true))) return;
    c.skinOwned.push(sid); c[kind==='char'?'skinChar':'skinNpc'] = id;
    await done(`${s.icon} ${s.name}을 적용했어요!`);
  });
};
window.calSetSkin = async (kind, id)=>{
  const c = S(); if(id && !c.skinOwned.includes(kind+':'+id)) return;
  c[kind==='char'?'skinChar':'skinNpc'] = id;
  await saveState(); renderAll(); render();
  if(!id){ toast('스킨을 해제했어요. 화면을 새로 열면 기본 모습으로 돌아와요.'); if(kind==='npc') document.querySelectorAll('.npc-bubble .npc-ic').forEach(el=>{ el.textContent = '🧙'; }); }
  applySkins();
};
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
  if(mode==='invest'){ const why = investBlock(q); if(why){ toast(why); return; } act = {id, mode}; render(); return; }
  const why = moveBlock(q, mode); if(why){ toast(why); return; }
  if(!S().tickets[mode]){ toast(`${TICKETS[mode].name}이 없어요. 상점의 아이템 탭에서 살 수 있어요.`); panel = 'shop'; shopTab = 'item'; render(); return; }
  act = {id, mode}; render();
};
window.calCancelMove = ()=>{ act = null; render(); };
window.calConfirmMove = async ()=>{
  if(!act) return;
  const q = state.quests.find(x=>x.id===act.id); if(!q){ act = null; render(); return; }
  const el = $('cal-move-date');
  await applyMove(q, act.mode, el ? el.value : null);
};
window.calInvest = (id, tier)=>{
  const q = state.quests.find(x=>x.id===id), t = INVEST.find(x=>x.tier===tier), c = S();
  if(!q || !t) return;
  const why = investBlock(q); if(why){ toast(why); return; }
  act = null;
  ask(`💰 ${t.name} 투자 (${q.title})`, t.price, async ()=>{
    if(investBlock(q) || !(await pay(t.price, false))) return;
    c.invest[q.id] = {tier, used:false};
    await done(`💰 ${q.title}에 ${t.name}을 투자했어요. ${q.dueDate}까지 완료하면 보상이 커져요!`);
  });
};

// 휴식권: 오늘 하루 쉬기 (연속 사용 불가). 연속 출석이 끊기지 않도록 보호한다.
window.calUseRest = ()=>{
  const c = S(), today = todayStr();
  if(!c.tickets.rest){ toast('휴식권이 없어요.'); return; }
  if(c.restDays[today]){ toast('오늘은 이미 쉬고 있어요.'); return; }
  if(c.restDays[addDays(today,-1)]){ toast('휴식은 이틀 연속으로 쓸 수 없어요.'); return; }
  ask('🏨 휴식권', null, async ()=>{
    c.tickets.rest--; c.restDays[today] = true;
    await done('🏨 여관에서 푹 쉬었어요. 스트레스가 풀리고 HP가 회복됐어요.');
  }, '사용');
};
window.calUseBoost = ()=>{
  const c = S();
  if(c.boostActive){ toast('이미 부스터가 켜져 있어요.'); return; }
  if(!c.tickets.boost){ toast('퀘스트 부스터가 없어요.'); return; }
  ask('⚔️ 퀘스트 부스터', null, async ()=>{
    c.tickets.boost--; c.boostActive = true;
    await done('⚔️ 부스터 ON! 다음 퀘스트 완료 보상이 +50%예요.');
  }, '사용');
};
// 출석 스트릭 보호: 마지막 출석 다음 날부터 어제까지 모두 휴식일이면 이어진 것으로 본다 (index.html doCheckIn에서 호출)
window.calRestCovers = (last, yStr)=>{
  if(!state || !last || last>=yStr) return false;
  const c = S(); let d = addDays(last, 1);
  while(d<=yStr){ if(!c.restDays[d]) return false; d = addDays(d, 1); }
  return true;
};

// 퀘스트 완료 보너스: 부스터(다음 1회) + 미래 일정 투자. 완료한 퀘스트마다 index.html의 toggleQuest에서 호출한다.
window.calQuestBonus = (q, xp, gold)=>{
  let bx = 0, bg = 0;
  if(!state || !state.character) return {xp:0, gold:0};
  const c = S(), today = todayStr(), notes = [];
  if(c.boostActive){ bx += Math.round(xp*0.5); bg += Math.round(gold*0.5); c.boostActive = false; notes.push('⚔️ 부스터'); }
  const inv = c.invest[q.id];
  if(inv && !inv.used){
    inv.used = true; // 한 번만 정산 (완료 취소 후 다시 완료해도 중복 지급 없음)
    if(q.dueDate && today<=q.dueDate){
      bx += q.xp; if(inv.tier>=2) bg += q.gold; if(inv.tier>=3){ c.chests.golden++; }
      notes.push('💰 투자');
    } else notes.push('💰 투자 소멸(마감 경과)');
  }
  if(notes.length) setTimeout(()=>toast(notes.join(' · ')+(bx||bg?` +${bx}XP${bg?` +${bg}G`:''}`:'')), 400);
  return {xp:bx, gold:bg};
};

// 상자
async function giveChestReward(kind){
  const c = S();
  let icon = '🎁', text = '';
  const r = Math.random();
  if(kind==='normal'){
    if(r<0.6){ const g = rnd(10,30); state.gold += g; trackGold(g); text = `+${g}G`; }
    else if(r<0.9){ const x = rnd(15,40); state.totalXP += x; text = `+${x}XP`; }
    else { const {coin, isNew} = awardCoin(); text = `${coin.icon} ${coin.name}${isNew?' (NEW)':''}`; }
  } else { // 황금 보물상자: 평균 가치가 구매가보다 낮게 유지
    icon = '🔒';
    if(r<0.45){ const g = rnd(100,300); state.gold += g; trackGold(g); text = `+${g}G`; }
    else if(r<0.70){ const {coin, isNew} = awardCoin(); text = `${coin.icon} ${coin.name}${isNew?' (NEW)':''}`; }
    else if(r<0.85){ const x = rnd(60,140); state.totalXP += x; text = `+${x}XP`; }
    else { c.tickets.boost++; text = '⚔️ 퀘스트 부스터'; }
  }
  if(window.logGain) logGain(icon, kind==='normal'?'일반 보물상자':'황금 보물상자', text);
  return text;
}
window.calOpenChest = async (kind)=>{
  const c = S(), key = kind==='golden' ? 'golden' : 'normal';
  if(c.chests[key]<1) return;
  c.chests[key]--;
  const t = await giveChestReward(kind);
  await done(`🎁 ${kind==='golden'?'황금':'일반'} 보물상자: ${t}`);
};
window.calBuyChest = ()=>{
  ask('🎁 황금 보물상자', GOLDEN_CHEST_PRICE, async ()=>{
    if(!(await pay(GOLDEN_CHEST_PRICE, true))) return;
    const t = await giveChestReward('golden');
    await done(`🎁 황금 보물상자: ${t}`);
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
    toast('🏆 오늘의 던전 클리어! 일반 보물상자 +1');
    if($('cal-wrap') && !$('screen-calendar').classList.contains('hidden')) render();
  }
};

try{ applySkins(); }catch(e){} // 스크립트가 늦게 로드돼 첫 렌더가 이미 끝난 경우를 보정
})();
