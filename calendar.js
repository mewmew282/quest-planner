/* 캘린더 월드맵: 월간 캘린더 · 테마/이펙트/스킨 · 일정 아이템 · 휴식 · 미래 일정 투자 · 보물상자 · 보관함.
   하단 '캘린더' 탭(#screen-calendar)에 그려진다.
   index.html의 전역(state, saveState, trackGold, todayStr, catIcon, escapeHtml, toast, renderAll, awardCoin, logGain, CLASSES)을 사용한다. */
(function(){
const $ = (id)=>document.getElementById(id);

// 가격은 퀘스트 골드(XP÷5: 보통 20G, 하루 5개 약 100G) 기준
const THEMES = [
  {id:'kingdom',   name:'기본 왕국',   icon:'🏰', price:0,    accent:'#E7B549', bg:'#1C1740', line:'#3A3170', desc:'성벽과 깃발이 있는 왕국 지도', cls:'th-kingdom'},
  {id:'forest',    name:'숲속 마을',   icon:'🌲', price:300,  accent:'#7BD389', bg:'#14261B', line:'#2F5A3F', desc:'이끼 낀 숲길과 오두막', cls:'th-forest'},
  {id:'winter',    name:'겨울 왕국',   icon:'❄️', price:600,  accent:'#2F8FD6', bg:'#E4F1FA', line:'#B7D7EC', desc:'눈 내리는 밝은 얼음 성', cls:'th-winter'},
  {id:'pirate',    name:'해적 항구',   icon:'🏴‍☠️', price:700,  accent:'#E0B25A', bg:'#3A2817', line:'#6B4A2B', desc:'낡은 항해 지도와 나무 부두', cls:'th-pirate'},
  {id:'academy',   name:'마법 학교',   icon:'🔮', price:800,  accent:'#C39BFF', bg:'#1B1038', line:'#4D3A85', desc:'별빛 아래 마법진 교실', cls:'th-academy'},
  {id:'cyber',     name:'사이버 도시', icon:'🌆', price:1500, accent:'#00F0FF', bg:'#05070F', line:'#1A2B4A', desc:'검은 밤과 네온 격자', cls:'th-cyber'},
];
const EFFECTS = [ // 캘린더 전체에 적용되는 애니메이션
  {id:'sparkle', name:'반짝임', icon:'✨', price:400,  desc:'오늘 칸이 반짝입니다'},
  {id:'flame',   name:'불꽃',   icon:'🔥', price:800,  desc:'오늘과 클리어한 날이 타오릅니다'},
  {id:'magic',   name:'마법진', icon:'🌀', price:1200, desc:'캘린더 테두리가 빛납니다'},
];
const SKINS = {
  char: [ // 홈 캐릭터 오라 색
    {id:'gold',  name:'황금 오라',   icon:'🟡', price:1000, color:'#FFD700'},
    {id:'moon',  name:'월광 오라',   icon:'🔵', price:2000, color:'#9FB8FF'},
    {id:'flame', name:'화염 오라',   icon:'🟠', price:3000, color:'#FF6A3D'},
    {id:'royal', name:'왕가의 오라', icon:'🟣', price:5000, color:'#C77DFF'},
  ],
};
// 펫: 한 마리를 골라 함께 다닌다. 함께한 동안 퀘스트를 완료하면 성장하고(10개당 1레벨, 최대 Lv.5), 레벨당 효과가 커진다.
const PETS = [
  {id:'horse',  name:'말',     icon:'🐴', price:1500, fx:[{k:'gold', per:2, u:'%',  t:'퀘스트 골드'}]},
  {id:'golem',  name:'골렘',   icon:'🗿', price:2500, fx:[{k:'hp', per:3, u:'%', t:'던전 최대 HP'}, {k:'red', per:1, u:'%', t:'던전 받는 피해 감소'}]},
  {id:'fairy',  name:'요정',   icon:'🧚', price:3500, fx:[{k:'xp', per:3, u:'%', t:'퀘스트 XP'}, {k:'heal', per:2, u:'', t:'매일 HP 정산 회복'}]},
  {id:'dragon', name:'드래곤', icon:'🐉', price:5000, fx:[{k:'atk', per:4, u:'%', t:'던전 공격력'}, {k:'crit', per:2, u:'%p', t:'던전 치명타 확률'}, {k:'dgr', per:4, u:'%', t:'던전 골드·XP 보상'}]},
];
const PET_STEP = 10, PET_MAX = 5, PET_SLOTS = 2; // 함께 다닐 수 있는 펫은 최대 2마리 (골라서 동행)
const petLv = (n)=> Math.min(PET_MAX, 1 + Math.floor((n||0)/PET_STEP));
const fxText = (pet, lv)=> pet.fx.map(f=>`${f.t} +${f.per*lv}${f.u}`).join(' · ');
const TICKETS = {
  change:  {name:'일정 변경권',   icon:'📜', price:50,   desc:'마감 전 퀘스트의 날짜를 바꿉니다 (보상 50%)'},
  keep:    {name:'일정 보존권',   icon:'🛡', price:150,  desc:'놓친 퀘스트를 내일로 옮깁니다 (보상 50%)'},
  time:    {name:'시간 연장권',   icon:'⏳', price:120,  desc:'오늘 마감 퀘스트를 내일까지 연장합니다 (보상 75%)'},
  revive:  {name:'부활권',        icon:'✨', price:1000, desc:'놓친 퀘스트를 오늘로 되살립니다 (보상 유지, 보스 가능)'},
  rest:    {name:'휴식권',        icon:'🏨', price:500,  desc:'오늘 하루 쉬기: HP 100 회복·스트레스 0·연속 출석 보호'},
  potion:  {name:'회복 포션',     icon:'🧪', price:100,  desc:'HP +30 회복'},
  tea:     {name:'진정 차',       icon:'🍵', price:100,  desc:'오늘 스트레스 −30'},
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
const DAILY_BUY_CAP = 3;        // 꾸미기(테마·이펙트·스킨)·황금 상자 하루 구매 한도(3회)
const WEEKLY_TICKET_CAP = 2;    // 변경권·보존권·시간 연장권 사용: 주 2회
const MONTH_CLEAR_GOAL = 10;    // 월간 보물상자: 이달 던전 클리어 일수
const DG_KEY_CAP = 8;           // 던전 열쇠: 퀘스트 완료로 하루 최대 8개 (+ 매일 무료 1개)
const DG_MONSTERS = [
  {n:'슬라임',        h:1.0, a:1.0},
  {n:'고블린 척후병', h:1.3, a:1.1},
  {n:'해골 병사',     h:1.7, a:1.25},
  {n:'오우거',        h:2.2, a:1.4},
  {n:'던전의 군주',   h:3.2, a:1.7, boss:true},
];

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
  fill(c,'effects',[]); fill(c,'effect',null);
  if(!Array.isArray(c.fxOn)) c.fxOn = c.effect ? [c.effect] : [];
  fill(c,'tickets',{}); Object.keys(TICKETS).forEach(k=>fill(c.tickets,k,0));
  fill(c,'usage',{}); fill(c.usage,'week',null); fill(c.usage,'n',0);
  fill(c,'moved',{}); fill(c,'revived',{}); fill(c,'invest',{});
  fill(c,'chests',{}); fill(c.chests,'normal',0); fill(c.chests,'golden',0);
  fill(c,'clearDays',{}); fill(c,'monthClaimed',null); fill(c,'monthsClaimed',{});
  if(c.monthClaimed){ c.monthsClaimed[c.monthClaimed] = true; c.monthClaimed = null; } // 이전의 '마지막 수령 달' 하나 -> 달별 기록
  fill(c,'dungeon',null);
  fill(c,'world',{}); fill(c.world,'regions',{}); fill(c.world,'counted',{}); fill(c.world,'date',null);
  fill(c,'restDays',{}); fill(c,'boostActive',false);
  fill(c,'cond',{}); fill(c.cond,'hp',100); fill(c.cond,'date',null); fill(c.cond,'dayStress',0); fill(c.cond,'relief',0);
  fill(c,'skinOwned',[]); fill(c,'skinChar',null); fill(c,'skinNpc',null);
  fill(c,'pets',{}); fill(c.pets,'owned',[]); fill(c.pets,'active',null); fill(c.pets,'exp',{}); fill(c,'petsMigrated',false);
  if(!c.petsMigrated){ // 이전 버전에서 산 NPC 스킨(드래곤·로봇·요정)은 같은 펫으로 이어준다 (로봇은 골렘)
    const map = {dragon:'dragon', robot:'golem', fairy:'fairy'};
    c.skinOwned.filter(x=>x.startsWith('npc:')).forEach(x=>{ const id = map[x.slice(4)]; if(id && !c.pets.owned.includes(id)) c.pets.owned.push(id); });
    if(c.skinNpc && map[c.skinNpc]) c.pets.active = map[c.skinNpc];
    c.skinOwned = c.skinOwned.filter(x=>!x.startsWith('npc:')); c.skinNpc = null; c.petsMigrated = true;
  }
  fill(c.pets,'party',[]); fill(c.pets,'partyMigrated',false);
  if(!c.pets.partyMigrated){ // 한 마리만 다니던 이전 방식(active) -> 동행 목록
    if(c.pets.active && c.pets.owned.includes(c.pets.active) && !c.pets.party.includes(c.pets.active)) c.pets.party.push(c.pets.active);
    c.pets.active = null; c.pets.partyMigrated = true;
  }
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

// ---- 컨디션 시스템 ----
// 스트레스(0~100, 하루 단위): 놓친 퀘스트×20 + 오늘 남은 퀘스트×5 − 진정 차 효과. 퀘스트를 끝내면 바로 내려가고, 휴식한 날은 0.
// HP(0~100, 저장): 매일 처음 열 때 전날의 스트레스로 정산한다. 60 이상 −20 / 30 이상 −10 / 그 미만 +10 / 휴식한 날 +20.
// 컨디션 등급이 퀘스트 완료 보상을 바꾼다: 최상 +10% / 보통 ±0 / 피곤 −10% / 탈진 −25% (휴식 중에는 변화 없음).
function settle(){
  const c = S(), k = c.cond, today = todayStr();
  if(k.date===today) return;
  if(k.date){
    const rested = !!c.restDays[k.date], sv = rested ? 0 : k.dayStress;
    const d = (rested ? 20 : sv>=60 ? -20 : sv>=30 ? -10 : 10) + petPct('heal');
    k.hp = Math.max(0, Math.min(100, k.hp + d));
  }
  k.date = today; k.relief = 0; k.dayStress = 0;
}
function gauges(){
  const c = S(), k = c.cond, today = todayStr();
  settle();
  const rest = !!c.restDays[today];
  let stress = 0;
  if(!rest){
    const over = state.quests.filter(q=>q.type==='dated' && q.status!=='done' && q.dueDate<today).length;
    const left = questsOn(today).filter(q=>!isDone(q, today)).length;
    stress = Math.max(0, Math.min(100, over*20 + left*5) - k.relief);
  }
  k.dayStress = stress;
  return {hp:k.hp, stress, rest};
}
function tier(){
  const g = gauges();
  let t = {name:'보통', mult:1};
  if(g.rest) t = {name:'휴식', mult:1};
  else if(g.hp<25 || g.stress>=85) t = {name:'탈진', mult:0.75};
  else if(g.hp<50 || g.stress>=60) t = {name:'피곤', mult:0.9};
  else if(g.hp>=90 && g.stress<30) t = {name:'최상', mult:1.1};
  t.eff = t.mult>1 ? `보상 +${Math.round((t.mult-1)*100)}%` : t.mult<1 ? `보상 −${Math.round((1-t.mult)*100)}%` : '보상 변화 없음';
  return {...t, g};
}
function renderHomeCond(){
  const el = $('home-cond');
  if(!el || !state || !state.character) return;
  const t = tier();
  el.style.display = '';
  el.textContent = `컨디션 ${t.name} · HP ${t.g.hp} · 스트레스 ${t.g.stress} · ${t.eff}`;
}

const css = document.createElement('style');
css.textContent = `
.cal-scope{--ca:#E7B549;--cb:#221C3B;--cl:#372C55;margin-bottom:14px}
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
.cal-prev{color:var(--text);display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;padding:8px;border:1px dashed var(--ca);border-radius:10px;font-size:12px}
.cal-prev span{flex:1;min-width:0}.cal-prev button{padding:6px 10px;border-radius:8px;border:1px solid var(--cl);background:var(--card-hi);color:var(--text);font-size:12px}
.cal-bar{height:8px;border-radius:6px;background:rgba(255,255,255,.1);overflow:hidden;flex:1;min-width:80px}.cal-bar i{display:block;height:100%}
.cal-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
.cal-modal .box{background:var(--cb);border:1px solid var(--ca);border-radius:14px;padding:18px;max-width:320px;width:100%;color:var(--text)}
.cal-modal .box b{color:var(--ca)}.cal-modal .box .s{font-size:12px;color:var(--text-dim);margin:6px 0 12px}
.cal-modal .btns{display:flex;gap:8px}.cal-modal .btns button{flex:1;padding:10px;border-radius:10px;border:1px solid var(--cl);background:var(--card-hi);color:var(--text);font-size:14px}
.cal-modal .btns button.go{background:var(--ca);color:#1B1300;border-color:var(--ca);font-weight:800}
.cal-modal .btns button:disabled{opacity:.5}
/* 테마별 질감: 색뿐 아니라 배경 무늬, 모서리, 글꼴을 다르게 한다 */
.cal-scope.th-winter{color:#17344D;--text:#17344D;--text-dim:#4D6F8A;--text-faint:#7C9AB0;--card:#F4FAFD;--card-hi:#D6EAF6}
.th-winter .cal-box,.th-winter .cal-panel{background-image:radial-gradient(circle at 20% 30%,#fff 0 1.5px,transparent 2.5px),radial-gradient(circle at 70% 60%,#fff 0 2px,transparent 3px),radial-gradient(circle at 45% 85%,#fff 0 1px,transparent 2px);background-size:56px 56px,84px 84px,44px 44px;border-radius:22px}
.th-winter .cal-day{border-radius:14px;background:rgba(255,255,255,.65)}
.th-winter .cal-day.sel{background:var(--ca);color:#fff}
.th-winter .cal-head .ttl{color:#2F8FD6;letter-spacing:.06em}
.cal-scope.th-pirate{font-family:Georgia,'Times New Roman',serif}
.th-pirate .cal-box{border:3px double var(--ca);border-radius:4px;background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 2px,transparent 2px 6px)}
.th-pirate .cal-panel{border:2px solid var(--cl);border-radius:3px;background-image:repeating-linear-gradient(90deg,rgba(0,0,0,.12) 0 2px,transparent 2px 9px)}
.th-pirate .cal-day{border-radius:2px;border-style:dashed;background:rgba(0,0,0,.22)}
.th-pirate .cal-day.sel{background:var(--ca);color:#1B1300}
.th-pirate .cal-head .ttl{font-style:italic;letter-spacing:.08em}
.th-pirate .cal-panel h3{font-variant:small-caps;letter-spacing:.08em}
.cal-scope.th-cyber{font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;--cx:#FF2BD6}
.th-cyber .cal-box{border:1px solid var(--ca);border-radius:0;box-shadow:0 0 14px rgba(0,240,255,.35),inset 0 0 18px rgba(0,240,255,.08);background-image:linear-gradient(rgba(0,240,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(0,240,255,.07) 1px,transparent 1px);background-size:22px 22px}
.th-cyber .cal-panel{border:1px solid var(--cl);border-left:3px solid var(--cx);border-radius:0}
.th-cyber .cal-day{border-radius:0;background:rgba(0,240,255,.04)}
.th-cyber .cal-day.today{border-color:var(--cx);box-shadow:0 0 8px var(--cx)}
.th-cyber .cal-day.sel{background:var(--ca);color:#001014}
.th-cyber .cal-head .ttl{text-shadow:0 0 8px var(--ca);letter-spacing:.14em;text-transform:uppercase}
.th-cyber .cal-panel h3{text-transform:uppercase;letter-spacing:.14em;color:var(--cx)}
.th-cyber .cal-row button,.th-cyber .cal-tabs button{border-radius:0}
.cal-scope.th-kingdom .cal-box{border:2px solid var(--ca);border-radius:3px;background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.05) 0 1px,transparent 1px 22px),repeating-linear-gradient(90deg,rgba(255,255,255,.04) 0 1px,transparent 1px 44px)}
.th-kingdom .cal-panel{border:1px solid var(--cl);border-top:3px solid var(--ca);border-radius:2px}
.th-kingdom .cal-day{border-radius:2px;border-bottom:3px solid var(--ca);background:rgba(255,255,255,.04)}
.th-kingdom .cal-day.sel{background:var(--ca);color:#1B1300}
.th-kingdom .cal-head .ttl{font-weight:800;letter-spacing:.16em;text-shadow:0 1px 0 #000}
.th-kingdom .cal-panel h3{letter-spacing:.12em}
.cal-scope.th-forest{font-family:'Trebuchet MS','Malgun Gothic',system-ui,sans-serif}
.th-forest .cal-box{border:2px dotted var(--ca);border-radius:26px 8px 26px 8px;background-image:radial-gradient(circle at 15% 20%,rgba(123,211,137,.22) 0 14px,transparent 15px),radial-gradient(circle at 85% 75%,rgba(123,211,137,.18) 0 22px,transparent 23px),radial-gradient(circle at 60% 10%,rgba(123,211,137,.12) 0 10px,transparent 11px)}
.th-forest .cal-panel{border:1px dotted var(--ca);border-radius:18px 6px 18px 6px}
.th-forest .cal-day{border-radius:14px 3px 14px 3px;background:rgba(123,211,137,.06);border-style:dotted}
.th-forest .cal-day.sel{background:var(--ca);color:#0E2415}
.th-forest .cal-head .ttl{letter-spacing:.04em}
.cal-scope.th-academy{font-family:'Palatino Linotype','Book Antiqua',Palatino,serif}
.th-academy .cal-box{border:1px solid var(--ca);border-radius:16px;outline:1px dashed rgba(195,155,255,.55);outline-offset:4px;box-shadow:0 0 22px rgba(195,155,255,.28);background-image:radial-gradient(circle at 12% 18%,#fff 0 1px,transparent 2px),radial-gradient(circle at 78% 32%,#fff 0 1.5px,transparent 2.5px),radial-gradient(circle at 40% 70%,#fff 0 1px,transparent 2px),radial-gradient(circle at 90% 88%,#fff 0 1px,transparent 2px);background-size:90px 90px,120px 120px,70px 70px,100px 100px}
.th-academy .cal-panel{border:1px solid var(--cl);border-radius:14px;box-shadow:inset 0 0 18px rgba(195,155,255,.12)}
.th-academy .cal-day{border-radius:50% 50% 6px 6px;background:rgba(195,155,255,.08);text-align:center;align-items:center}
.th-academy .cal-day .n{justify-content:center}
.th-academy .cal-day.sel{background:var(--ca);color:#1B1038}
.th-academy .cal-head .ttl{font-variant:small-caps;letter-spacing:.12em;text-shadow:0 0 10px var(--ca)}
.th-academy .cal-panel h3{font-variant:small-caps;letter-spacing:.1em}
/* 홈 펫 */
.home-pet{position:absolute;right:-14px;bottom:-6px;width:46px;height:46px;border-radius:50%;border:2px solid var(--border);background:var(--card);font-size:26px;line-height:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0;cursor:pointer}
.home-pet.p1{right:auto;left:-14px}
.home-pet small{font-size:9px;color:var(--text-dim);margin-top:1px}
/* 던전 카드·전투 창 */
.dg-card{margin:14px 0 4px;padding:12px 14px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-s,12px)}
.dg-top{display:flex;justify-content:space-between;align-items:center;font-size:13.5px;margin-bottom:8px}
.dg-top span{font-size:12px;color:var(--gold)}
.dg-floors{display:flex;gap:4px;margin-bottom:8px}
.dg-fl{flex:1;text-align:center;font-size:11px;padding:5px 0;border:1px solid var(--border);border-radius:6px;color:var(--text-dim)}
.dg-fl.done{background:var(--gold);color:#1B1300;border-color:var(--gold)}
.dg-fl.cur{border-color:var(--gold);color:var(--gold)}
.dg-note{font-size:12.5px;margin-bottom:6px}
.dg-sub{font-size:11.5px;color:var(--text-dim);margin-top:4px;line-height:1.5}
.dg-hp,.dg-bar{display:block;height:7px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden}
.dg-hp i,.dg-bar i{display:block;height:100%;background:#5EE08A;transition:width .3s}.dg-bar.m i{background:#FF6A6A}
.dg-go{display:block;width:100%;margin-top:10px;padding:10px;border-radius:8px;border:0;background:var(--gold);color:#1B1300;font-weight:700;font-size:14px}
.dg-go:disabled{opacity:.45}
.dg-modal{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px}
.dg-box{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;max-width:340px;width:100%;color:var(--text)}
.dg-box .dg-top button{padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text);font-size:12px}
.dg-side{display:grid;grid-template-columns:70px 1fr 64px;align-items:center;gap:8px;font-size:12px;margin:6px 0}
.dg-side em{font-style:normal;font-size:11px;color:var(--text-dim);text-align:right}
.dg-log{height:110px;overflow-y:auto;margin:10px 0;padding:8px;border-radius:8px;background:rgba(0,0,0,.25);font-size:12px;line-height:1.6}
.dg-res{font-size:13px;font-weight:700;color:var(--gold);min-height:20px}
/* 캘린더 상점: 장비 상점과 같은 카드 목록 + 토글 스위치 */
#shop-cal-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-items:stretch}
#shop-cal-list .shop-shelf-label{grid-column:1/-1}
.shop-actions{display:flex;gap:6px}.shop-actions>button{flex:1;min-width:0}
.shop-toggle{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10.5px;color:var(--text-faint);padding:2px 2px 0}
.shop-item .tgl{position:relative;width:44px;height:24px;padding:0;flex:none;border-radius:12px;border:1px solid var(--border);background:var(--card-hi);cursor:pointer}
.shop-item .tgl::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--text-faint);transition:left .15s,background .15s}
.shop-item .tgl[aria-checked="true"]{background:var(--gold);border-color:var(--gold)}
.shop-item .tgl[aria-checked="true"]::after{left:22px;background:#1c1530}
@media (prefers-reduced-motion:reduce){.shop-item .tgl::after{transition:none}}
/* 인벤토리 */
.inv-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.inv-slot{position:relative;aspect-ratio:1;min-width:0;border:1px solid var(--cl);border-radius:10px;background:rgba(0,0,0,.2);color:var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px}
.inv-slot .inv-ic{font-size:24px;line-height:1}
.inv-slot .inv-nm{font-size:9.5px;color:var(--text-dim);line-height:1.15;text-align:center;word-break:keep-all}
.inv-slot .inv-cnt{position:absolute;right:5px;bottom:3px;font-size:12px;font-weight:800}
.inv-slot.empty{opacity:.4}.inv-slot.empty .inv-cnt{font-weight:600}
.inv-slot.sel{border-color:var(--ca);box-shadow:0 0 0 1px var(--ca) inset}
.inv-detail{display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--cl);font-size:13px}
.inv-detail .t{flex:1;min-width:0}.inv-detail .s{font-size:11.5px;color:var(--text-dim);margin-top:2px}
.inv-detail button{padding:7px 12px;border-radius:8px;border:1px solid var(--cl);background:var(--card-hi);color:var(--text);font-size:12px}
.inv-detail button:disabled{opacity:.5}.inv-detail button.on{background:var(--ca);color:#1B1300;border-color:var(--ca)}
@keyframes calPulse{0%,100%{box-shadow:0 0 0 1px var(--ca) inset,0 0 0 rgba(255,255,255,0)}50%{box-shadow:0 0 0 1px var(--ca) inset,0 0 10px 2px var(--ca)}}
@keyframes calFlick{from{box-shadow:0 0 4px 0 #FF8A4C}to{box-shadow:0 0 12px 3px #FFB347}}
@keyframes calGlow{from{box-shadow:0 0 4px 0 var(--ca)}to{box-shadow:0 0 16px 3px var(--ca)}}
.fx-sparkle .cal-day.today{animation:calPulse 1.6s ease-in-out infinite}
.fx-flame .cal-day.today,.fx-flame .cal-day.clr{animation:calFlick .9s ease-in-out infinite alternate}
.fx-magic .cal-box{animation:calGlow 2s ease-in-out infinite alternate}
@media (prefers-reduced-motion:reduce){.fx-sparkle .cal-day.today,.fx-flame .cal-day.today,.fx-flame .cal-day.clr,.fx-magic .cal-box{animation:none}}
`;
document.head.appendChild(css);

function dayCell(d, today){
  const c = S(), ds = ymd(ym.y, ym.m, d), qs = questsOn(ds);
  const dated = qs.filter(q=>q.type==='dated');
  const icons = dated.slice(0,2).map(q=> isBoss(q) ? '👑' : rIcon(q)).join('');
  const more = dated.length>2 ? `+${dated.length-2}` : '';
  const rep = qs.length-dated.length>0 ? '·' : '';
  const cls = `${ds===today?' today':''}${ds===sel?' sel':''}${c.clearDays[ds]?' clr':''}`;
  return `<button class="cal-day${cls}" onclick="calSelect('${ds}')"><span class="n"><span>${d}</span><span>${c.clearDays[ds]?'🏆':''}${c.restDays[ds]?'🏨':''}</span></span><span class="ic">${icons}${more}${rep}</span></button>`;
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
  const head = sel===today ? `📋 오늘의 퀘스트 ${done}/${qs.length}` : `📅 ${sel} 일정 ${qs.length}개`;
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

// ---- 상점 (장비 상점과 같은 카드·탭 디자인) ----
const capLeft = ()=>{ const c = S(); return DAILY_BUY_CAP - (c.buyDate===todayStr() ? c.buyCount : 0); };
const shopCard = (o)=>`<div class="shop-item${o.own?' owned':''}"><span class="ic">${o.ic}</span><div class="info"><div class="nm">${o.nm}${o.badge?`<span class="shop-badge equipped">${o.badge}</span>`:''}</div><div class="sub"${o.full?' style="-webkit-line-clamp:unset;display:block"':''}>${o.sub}</div>${o.price!=null?`<div class="price">🪙 ${o.price}</div>`:''}</div>${o.foot}</div>`;
const buyBtn = (price, fn)=>{ const ok = state.gold>=price; return `<button class="btn btn-gold" ${ok?`onclick="${fn}"`:'disabled'}>${ok?'구매':'부족'}</button>`; };
const toggleRow = (on, fn, label)=>`<div class="shop-toggle"><span>${label}</span><button class="tgl" role="switch" aria-checked="${on}" aria-label="${label}" onclick="${fn}"></button></div>`;
function shopPanel(){
  const c = S();
  const tabs = [['theme','테마'],['fx','이펙트'],['skin','스킨'],['pet','펫'],['item','아이템'],['chest','상자']]
    .map(([k,l])=>`<button class="shop-tab${shopTab===k?' active':''}" onclick="calShopTab('${k}')">${l}</button>`).join('');
  let label = '', cards = '';
  if(shopTab==='theme'){
    label = `테마 · ${THEMES.length}종 (켜면 적용, 끄면 기본 왕국)`;
    cards = THEMES.map(t=>{
      const own = c.themes.includes(t.id), on = c.active===t.id;
      let foot;
      if(t.price===0) foot = on ? `<button class="btn btn-ghost" disabled>사용 중</button>` : `<button class="btn btn-ghost" onclick="calToggleTheme('kingdom')">기본으로</button>`;
      else foot = own ? `<button class="btn btn-ghost" onclick="calPreview('${t.id}')">미리보기</button>${toggleRow(on, `calToggleTheme('${t.id}')`, on?'사용 중':'사용')}`
        : `<div class="shop-actions"><button class="btn btn-ghost" onclick="calPreview('${t.id}')">미리보기</button>${buyBtn(t.price, `calBuy('${t.id}')`)}</div>`;
      return shopCard({ic:t.icon, nm:t.name, badge:on?'★ 사용 중':(own&&t.price?'보유중':''), own:own&&t.price>0, sub:t.desc, price:own?null:t.price, foot});
    }).join('');
  }
  if(shopTab==='fx'){
    label = `이펙트 · ${EFFECTS.length}종 (각각 켜고 끌 수 있어요)`;
    cards = EFFECTS.map(e=>{
      const own = c.effects.includes(e.id), on = c.fxOn.includes(e.id);
      return shopCard({ic:e.icon, nm:e.name, badge:on?'★ 켜짐':(own?'보유중':''), own, sub:e.desc, price:own?null:e.price,
        foot: own ? toggleRow(on, `calToggleFx('${e.id}')`, on?'켜짐':'꺼짐') : buyBtn(e.price, `calBuyEffect('${e.id}')`)});
    }).join('');
  }
  if(shopTab==='skin'){
    label = '캐릭터 스킨 · 홈 캐릭터 오라 색';
    cards = SKINS.char.map(x=>{
      const own = c.skinOwned.includes('char:'+x.id), on = c.skinChar===x.id;
      return shopCard({ic:x.icon, nm:x.name, badge:on?'★ 사용 중':(own?'보유중':''), own, sub:'홈 캐릭터 오라 색이 바뀌어요', price:own?null:x.price,
        foot: own ? toggleRow(on, `calSetSkin('char',${on?'null':`'${x.id}'`})`, on?'사용 중':'사용') : buyBtn(x.price, `calBuySkin('char','${x.id}')`)});
    }).join('');
  }
  if(shopTab==='pet'){
    label = `펫 · 동행 ${c.pets.party.length}/${PET_SLOTS}마리 (${PET_STEP}개당 1레벨, 최대 Lv.${PET_MAX})`;
    cards = PETS.map(pt=>{
      const own = c.pets.owned.includes(pt.id), on = c.pets.party.includes(pt.id), n = c.pets.exp[pt.id]||0, lv = petLv(n);
      const sub = own ? `Lv.${lv} · ${fxText(pt, lv)}` : `Lv.1 ${fxText(pt,1)} → Lv.${PET_MAX} ${fxText(pt,PET_MAX)}`;
      return shopCard({ic:pt.icon, nm:pt.name, badge:on?'★ 동행 중':(own?'보유중':''), own, sub, full:true, price:own?null:pt.price,
        foot: own ? `<button class="btn btn-ghost" onclick="calTogglePet('${pt.id}')">${on?'쉬게 하기':'함께하기'}</button>` : buyBtn(pt.price, `calBuyPet('${pt.id}')`)});
    }).join('');
  }
  if(shopTab==='item'){
    const wk = weekKey(todayStr()), used = c.usage.week===wk ? c.usage.n : 0;
    label = `일정 아이템 · 변경·보존·시간 연장권 이번 주 ${used}/${WEEKLY_TICKET_CAP}회 사용`;
    cards = Object.entries(TICKETS).map(([k,t])=>shopCard({ic:t.icon, nm:`${t.name} ×${c.tickets[k]}`, sub:t.desc, price:t.price, own:c.tickets[k]>0, foot:buyBtn(t.price, `calBuyTicket('${k}')`)})).join('');
  }
  if(shopTab==='chest'){
    label = '보물상자';
    cards = shopCard({ic:'🎁', nm:'황금 보물상자', sub:'골드·코인·경험치·퀘스트 부스터 중 랜덤 (평균 가치는 구매가 이하)', price:GOLDEN_CHEST_PRICE, foot:buyBtn(GOLDEN_CHEST_PRICE, 'calBuyChest()')});
  }
  const capNote = shopTab==='item' ? '' : ` · 오늘 꾸미기 구매 ${Math.max(0,capLeft())}회 남음`;
  return `<div class="shop-tabs" id="shop-cal-tabs">${tabs}</div><div id="shop-cal-list"><div class="shop-shelf-label">${label}${capNote}</div>${cards}</div>`;
}

// ---- 보관함 ----
// ---- 보관함 (인벤토리): 보유 수만 간략하게 보여주고, 칸을 누르면 설명과 사용 버튼이 나온다 ----
let bagSel = null;
function bagItems(){
  const c = S();
  const items = Object.entries(TICKETS).map(([k,t])=>({key:k, icon:t.icon, name:t.name, n:c.tickets[k], desc:t.desc}));
  items.push({key:'chestN', icon:'🎁', name:'일반 보물상자', n:c.chests.normal, desc:'오늘의 던전 보스를 쓰러뜨리면 얻어요'});
  items.push({key:'chestG', icon:'🔒', name:'황금 보물상자', n:c.chests.golden, desc:'투자 보상이나 상점에서 얻어요'});
  return items;
}
function bagAction(it){
  const c = S();
  if(it.key==='rest') return `<button ${it.n?'':'disabled'} onclick="calUseRest()">사용</button>`;
  if(it.key==='potion') return `<button ${it.n?'':'disabled'} onclick="calUsePotion()">사용</button>`;
  if(it.key==='tea') return `<button ${it.n?'':'disabled'} onclick="calUseTea()">사용</button>`;
  if(it.key==='boost') return c.boostActive ? `<button class="on" disabled>활성 중</button>` : `<button ${it.n?'':'disabled'} onclick="calUseBoost()">활성화</button>`;
  if(it.key==='chestN') return `<button ${it.n?'':'disabled'} onclick="calOpenChest('normal')">열기</button>`;
  if(it.key==='chestG') return `<button ${it.n?'':'disabled'} onclick="calOpenChest('golden')">열기</button>`;
  return `<span class="s">일정 카드에서 사용</span>`;
}
window.calBagSel = (k)=>{ bagSel = bagSel===k ? null : k; render(); };
function bagPanel(){
  const items = bagItems(), total = items.reduce((a,x)=>a+x.n, 0);
  const slots = items.map(it=>`<button class="inv-slot${it.n?'':' empty'}${bagSel===it.key?' sel':''}" onclick="calBagSel('${it.key}')" aria-label="${it.name} ${it.n}개"><span class="inv-ic">${it.icon}</span><span class="inv-nm">${it.name}</span><span class="inv-cnt">${it.n}</span></button>`).join('');
  const cur = items.find(x=>x.key===bagSel);
  const detail = cur ? `<div class="inv-detail"><span class="t"><b>${cur.name}</b> ×${cur.n}<div class="s">${cur.desc}</div></span>${bagAction(cur)}</div>` : '';
  return `<div class="cal-panel"><h3>인벤토리 · 아이템 ${total}개</h3><div class="inv-grid">${slots}</div>${detail}</div>`;
}

// ---- 보물상자 ----
function monthKey(){ return `${ym.y}-${pad(ym.m+1)}`; }
function monthClears(){ const c = S(), k = monthKey(); return Object.keys(c.clearDays).filter(d=>d.startsWith(k)).length; }
function chestPanel(){
  const c = S(), mc = monthClears();
  const claimed = !!c.monthsClaimed[monthKey()], ready = mc>=MONTH_CLEAR_GOAL && !claimed;
  return `<div class="cal-panel"><h3>📦 보물상자</h3>
    <div class="cal-row"><span style="font-size:20px">🎁</span><span class="t">일반 보물상자 <b>×${c.chests.normal}</b><div class="s">오늘의 던전 보스를 쓰러뜨리면 1개 (무료)</div></span><button ${c.chests.normal?'':'disabled'} onclick="calOpenChest('normal')">열기</button></div>
    ${c.chests.golden?`<div class="cal-row"><span style="font-size:20px">🔒</span><span class="t">황금 보물상자 <b>×${c.chests.golden}</b><div class="s">투자 보상으로 받은 상자</div></span><button onclick="calOpenChest('golden')">열기</button></div>`:''}
    <div class="cal-row"><span style="font-size:20px">👑</span><span class="t">월간 보물상자<div class="s">이달 던전 클리어 ${Math.min(mc,MONTH_CLEAR_GOAL)}/${MONTH_CLEAR_GOAL}일 · 희귀 테마·이펙트</div></span><button ${ready?'':'disabled'} onclick="calClaimMonth()">${claimed?'수령함':'받기'}</button></div></div>`;
}

function render(){
  const wrap = $('cal-wrap');
  if(!wrap || !state) return;
  if(!sel) sel = todayStr();
  const c = S(), th = previewId ? (THEMES.find(t=>t.id===previewId)||theme()) : theme(), tr = tier(), g = tr.g;
  renderHomeCond();
  wrap.className = ['cal-scope', th.cls, ...c.fxOn.map(x=>'fx-'+x)].filter(Boolean).join(' ');
  wrap.style.setProperty('--ca', th.accent); wrap.style.setProperty('--cb', th.bg); wrap.style.setProperty('--cl', th.line);
  const first = new Date(ym.y, ym.m, 1).getDay(), days = new Date(ym.y, ym.m+1, 0).getDate(), today = todayStr();
  let cells = '';
  for(let i=0;i<first;i++) cells += `<div class="cal-day blank"></div>`;
  for(let d=1; d<=days; d++) cells += dayCell(d, today);
  const own = previewId && c.themes.includes(previewId);
  const prev = previewId ? `<div class="cal-prev"><span>👀 ${th.icon} ${th.name} 미리보기 중</span>${own?`<button onclick="calApply('${previewId}')">적용</button>`:`<button onclick="calBuy('${previewId}')">🪙${th.price} 구매</button>`}<button onclick="calClosePreview()">닫기</button></div>` : '';
  wrap.innerHTML = `
    <div class="cal-top"><span class="g">❤️ ${g.hp} · 😣 ${g.stress} · 컨디션 ${tr.name}</span><span><button class="chip" onclick="calTogglePanel('bag')">🎒 보관함</button></span></div>
    ${prev}
    <div class="cal-box">
      <div class="cal-head"><button onclick="calMove(-1)">‹</button><span class="ttl">${th.icon} ${ym.y}년 ${ym.m+1}월</span><button onclick="calMove(1)">›</button></div>
      <div class="cal-grid">${['일','월','화','수','목','금','토'].map(w=>`<div class="cal-dow">${w}</div>`).join('')}${cells}</div>
    </div>
    ${panel==='bag' ? bagPanel() : ''}${dayPanel()}${chestPanel()}${pending ? confirmModal() : ''}`;
  renderShopCal(); // 상점 탭의 캘린더 상점도 같은 상태로 다시 그린다
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
  const cs = SKINS.char.find(s=>s.id===c.skinChar);
  if(cs) document.querySelectorAll('.char-aura').forEach(el=>el.style.setProperty('--class-color', cs.color));
}
['renderCharacterVisual','showNpcBubble','renderHome'].forEach(fn=>{ // 캐릭터/NPC/홈이 다시 그려질 때 스킨·컨디션 표시를 덮어쓴다
  const orig = window[fn];
  if(typeof orig==='function') window[fn] = function(){ const r = orig.apply(this, arguments); try{ applySkins(); renderHomePet(); renderHomeCond(); renderDungeonCard(); }catch(e){} return r; };
});

window.calRender = render;
window.calMove = (dm)=>{ const d = new Date(ym.y, ym.m+dm, 1); ym = {y:d.getFullYear(), m:d.getMonth()}; render(); };
window.calSelect = (ds)=>{ sel = ds; act = null; render(); };
window.calTogglePanel = (k)=>{ panel = panel===k ? null : k; render(); };
window.calShopTab = (k)=>{ shopTab = k; render(); };
// ---- 캘린더 상점: 상점 탭의 '캘린더' 대분류에 그린다 ----
function miniCal(th){
  const first = new Date(ym.y, ym.m, 1).getDay(), days = new Date(ym.y, ym.m+1, 0).getDate(), today = todayStr();
  let cells = '';
  for(let i=0;i<first;i++) cells += `<div class="cal-day blank"></div>`;
  for(let d=1; d<=days; d++) cells += `<div class="cal-day${ymd(ym.y, ym.m, d)===today?' today':''}"><span class="n"><span>${d}</span></span></div>`;
  const vars = `--ca:${th.accent};--cb:${th.bg};--cl:${th.line}`;
  const cls = ['cal-scope', th.cls, ...S().fxOn.map(x=>'fx-'+x)].filter(Boolean).join(' ');
  return `<div class="${cls}" style="${vars};margin:0 0 10px"><div class="cal-box"><div class="cal-head"><span class="ttl">${th.icon} ${ym.y}년 ${ym.m+1}월</span></div><div class="cal-grid">${['일','월','화','수','목','금','토'].map(w=>`<div class="cal-dow">${w}</div>`).join('')}${cells}</div></div></div>`;
}
function renderShopCal(){
  const wrap = $('shop-cal-wrap');
  if(!wrap || !state || !state.character) return;
  const c = S();
  let prev = '';
  if(previewId){
    const th = THEMES.find(t=>t.id===previewId) || theme(), own = c.themes.includes(th.id);
    prev = `<div class="shop-shelf-label" style="margin-top:0">미리보기 · ${th.name}</div>${miniCal(th)}<div class="shop-actions" style="margin-bottom:10px">${own ? `<button class="btn btn-gold" onclick="calToggleTheme('${th.id}')">적용</button>` : buyBtn(th.price, `calBuy('${th.id}')`)}<button class="btn btn-ghost" onclick="calClosePreview()">닫기</button></div>`;
  }
  wrap.innerHTML = `${prev}${shopPanel()}${pending ? confirmModal() : ''}`;
}
window.renderShopCal = renderShopCal;
window.calGoShop = (tab)=>{ if(tab) shopTab = tab; switchTab('shop'); setShopMain('cal'); };
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
window.calBuyEffect = (id)=>{
  const e = EFFECTS.find(x=>x.id===id), c = S();
  if(!e || c.effects.includes(id)) return;
  ask(`${e.icon} ${e.name} 이펙트`, e.price, async ()=>{
    if(!(await pay(e.price, true))) return;
    c.effects.push(id); c.fxOn.push(id);
    await done(`${e.icon} ${e.name} 이펙트를 구매했어요!`);
  });
};
window.calToggleFx = async (id)=>{
  const c = S(); if(!c.effects.includes(id)) return;
  const k = c.fxOn.indexOf(id);
  if(k>=0) c.fxOn.splice(k,1); else c.fxOn.push(id);
  await saveState(); render();
};
// 테마: 켜면 그 테마를 적용하고, 끄면 기본 왕국으로 돌아간다
window.calToggleTheme = async (id)=>{
  const c = S(); if(!c.themes.includes(id)) return;
  c.active = c.active===id ? 'kingdom' : id; previewId = null;
  await saveState(); render();
};
window.calBuySkin = (kind, id)=>{
  const s = SKINS[kind].find(x=>x.id===id), c = S(), sid = kind+':'+id;
  if(!s || c.skinOwned.includes(sid)) return;
  ask(`${s.icon} ${s.name}`, s.price, async ()=>{
    if(!(await pay(s.price, true))) return;
    c.skinOwned.push(sid); c.skinChar = id;
    await done(`${s.icon} ${s.name}을 적용했어요!`);
  });
};
window.calSetSkin = async (kind, id)=>{
  const c = S(); if(id && !c.skinOwned.includes(kind+':'+id)) return;
  c.skinChar = id;
  await saveState(); renderAll(); render();
  if(!id) toast('스킨을 해제했어요. 화면을 새로 열면 기본 모습으로 돌아와요.');
  applySkins();
};
window.calBuyPet = (id)=>{
  const pt = PETS.find(x=>x.id===id), c = S();
  if(!pt || c.pets.owned.includes(id)) return;
  ask(`${pt.icon} ${pt.name} 펫`, pt.price, async ()=>{
    if(!(await pay(pt.price, true))) return;
    c.pets.owned.push(id);
    const joined = c.pets.party.length<PET_SLOTS;
    if(joined) c.pets.party.push(id);
    await done(joined ? `${pt.name}이(가) 함께하게 됐어요.` : `${pt.name}을(를) 얻었어요. 동행 자리가 가득 차서 함께하기로 골라 주세요.`);
  });
};
// 교체가 아니라 선택: 동행 중이면 쉬게 하고, 아니면 자리가 있을 때 함께 다닌다
window.calTogglePet = async (id)=>{
  const c = S(); if(!c.pets.owned.includes(id)) return;
  const i = c.pets.party.indexOf(id);
  if(i>=0) c.pets.party.splice(i,1);
  else if(c.pets.party.length>=PET_SLOTS){ toast(`함께 다닐 수 있는 펫은 최대 ${PET_SLOTS}마리예요. 한 마리를 먼저 쉬게 해 주세요.`); return; }
  else c.pets.party.push(id);
  await saveState(); renderAll(); render(); renderHomePet();
};
window.petTap = (idx, e)=>{
  if(e) e.stopPropagation();
  const pi = petParty()[idx]; if(!pi) return;
  toast(`${pi.pet.name} Lv.${pi.lv} · ${fxText(pi.pet, pi.lv)}`);
};
// 홈 화면: 캐릭터 옆에 함께 다니는 펫들을 보여준다 (첫째는 오른쪽, 둘째는 왼쪽)
function renderHomePet(){
  const aura = $('home-char-aura');
  if(!aura || !state || !state.character) return;
  aura.querySelectorAll('.home-pet').forEach(el=>el.remove());
  petParty().forEach((pi, idx)=>{
    const el = document.createElement('button');
    el.className = 'home-pet p'+idx; el.id = 'home-pet-'+idx; el.setAttribute('aria-label', pi.pet.name+' 정보');
    el.addEventListener('click', (e)=>petTap(idx, e)); el.addEventListener('pointerdown', e=>e.stopPropagation());
    el.innerHTML = `${pi.pet.icon}<small>Lv.${pi.lv}</small>`;
    aura.appendChild(el);
  });
}
window.renderHomePet = renderHomePet;
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
  if(!S().tickets[mode]){ toast(`${TICKETS[mode].name}이 없어요. 상점의 아이템 탭에서 살 수 있어요.`); shopTab = 'item'; calGoShop(); return; }
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
    c.tickets.rest--; c.restDays[today] = true; c.cond.hp = 100;
    await done('🏨 여관에서 푹 쉬었어요. HP가 100으로 회복되고 스트레스가 풀렸어요.');
  }, '사용');
};
window.calUsePotion = ()=>{
  const c = S(); gauges();
  if(!c.tickets.potion){ toast('회복 포션이 없어요.'); return; }
  if(c.cond.hp>=100){ toast('HP가 이미 가득해요.'); return; }
  ask('🧪 회복 포션', null, async ()=>{
    c.tickets.potion--; c.cond.hp = Math.min(100, c.cond.hp+30);
    await done(`HP가 회복됐어요. (${c.cond.hp})`);
  }, '사용');
};
window.calUseTea = ()=>{
  const c = S(), g = gauges();
  if(!c.tickets.tea){ toast('진정 차가 없어요.'); return; }
  if(g.stress<=0){ toast('지금은 스트레스가 없어요.'); return; }
  ask('🍵 진정 차', null, async ()=>{
    c.tickets.tea--; c.cond.relief += 30;
    await done('차를 마시니 마음이 가라앉아요. 오늘 스트레스 −30');
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
  if(dungeonEarn(q)){ notes.push('던전 열쇠 +1'); renderDungeonCard(); }
  worldCount(q, notes);
  const gp = petPct('gold');
  if(gp){ bg += Math.round(gold*gp/100); notes.push(`펫 골드 +${gp}%`); }
  const xpp = petPct('xp');
  if(xpp){ bx += Math.round(xp*xpp/100); notes.push(`펫 XP +${xpp}%`); }
  const tr = tier();
  if(tr.mult!==1){ bx += Math.round(xp*(tr.mult-1)); bg += Math.round(gold*(tr.mult-1)); notes.push(`컨디션 ${tr.name} ${tr.eff.replace('보상 ','')}`); }
  if(c.boostActive){ bx += Math.round(xp*0.5); bg += Math.round(gold*0.5); c.boostActive = false; notes.push('⚔️ 부스터'); }
  const inv = c.invest[q.id];
  if(inv && !inv.used){
    inv.used = true; // 한 번만 정산 (완료 취소 후 다시 완료해도 중복 지급 없음)
    if(q.dueDate && today<=q.dueDate){
      bx += q.xp; if(inv.tier>=2) bg += q.gold; if(inv.tier>=3){ c.chests.golden++; }
      notes.push('💰 투자');
    } else notes.push('💰 투자 소멸(마감 경과)');
  }
  if(notes.length) setTimeout(()=>toast(notes.join(' · ')+(bx||bg?` ${bx>=0?'+':''}${bx}XP${bg?` ${bg>=0?'+':''}${bg}G`:''}`:'')), 400);
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
  if(c.monthsClaimed[k] || monthClears()<MONTH_CLEAR_GOAL) return;
  const pool = [...THEMES.filter(t=>t.price>0 && !c.themes.includes(t.id)).map(t=>({kind:'theme',o:t})), ...EFFECTS.filter(e=>!c.effects.includes(e.id)).map(e=>({kind:'fx',o:e}))];
  let text;
  if(pool.length){
    const p = pool[rnd(0, pool.length-1)];
    if(p.kind==='theme'){ c.themes.push(p.o.id); c.active = p.o.id; } else { c.effects.push(p.o.id); c.fxOn.push(p.o.id); }
    text = `${p.o.icon} ${p.o.name} ${p.kind==='theme'?'테마':'이펙트'}`;
  } else { state.gold += 300; trackGold(300); text = '+300G'; }
  c.monthsClaimed[k] = true;
  if(window.logGain) logGain('👑', '월간 보물상자', text);
  await done(`👑 월간 보물상자: ${text}`);
};

// ---- 오늘의 던전 (자동 전투) ----
// 퀘스트를 완료하면 열쇠를 얻고(퀘스트당 하루 1개), 열쇠 1개로 한 층씩 자동 전투를 벌인다. 5층 보스를 쓰러뜨리면 클리어.
// 전투력은 레벨·스탯(힘·지능=공격, 체력=최대 HP, 민첩=치명타, 의지=피해 감소)과 컨디션 등급으로 정해진다.
function dg(){
  const c = S(), t = todayStr();
  if(!c.dungeon || c.dungeon.date!==t) c.dungeon = {date:t, floor:0, keys:1, earned:0, earnedIds:{}, hp:null, cleared:false};
  return c.dungeon;
}
function petParty(){
  const c = S();
  return c.pets.party.map(id=>PETS.find(x=>x.id===id)).filter(Boolean).map(pet=>{ const n = c.pets.exp[pet.id]||0; return {pet, n, lv:petLv(n)}; });
}
// 동행 중인 펫들의 효과를 모두 더한다
const petPct = (kind)=> petParty().reduce((sum,pi)=> sum + pi.pet.fx.filter(f=>f.k===kind).reduce((a,f)=>a+f.per*pi.lv, 0), 0);
function pStats(){
  const st = state.stats || {}, lv = Math.floor(state.totalXP/1000)+1, cm = tier().mult;
  const g = (k)=> st[k]||10;
  return {lv, atk:Math.round((8 + lv*2 + (g('힘')+g('지능'))/2)*cm*(1+petPct('atk')/100)), maxHp:Math.round((60 + lv*4 + g('체력')*2)*(1+petPct('hp')/100)), crit:Math.min(0.5, g('민첩')/200 + petPct('crit')/100), red:Math.min(0.5, Math.min(0.3, g('의지')/300) + petPct('red')/100)};
}
function mStats(f, lv){
  const m = DG_MONSTERS[f];
  return {name:m.n, hp:Math.round((34 + lv*5.7)*m.h), atk:(5 + lv*1.1)*m.a, boss:!!m.boss};
}
function simulate(p, m, hp0){
  let ph = hp0, mh = m.hp; const steps = [];
  for(let r=0; r<40 && ph>0 && mh>0; r++){
    const crit = Math.random()<p.crit;
    const dm = Math.max(1, Math.round(p.atk*(0.85+Math.random()*0.3)*(crit?1.8:1)));
    mh = Math.max(0, mh-dm); steps.push({who:'p', dmg:dm, crit, ph, mh});
    if(mh<=0) break;
    const da = Math.max(1, Math.round(m.atk*(0.85+Math.random()*0.3)*(1-p.red)));
    ph = Math.max(0, ph-da); steps.push({who:'m', dmg:da, ph, mh});
  }
  return {win:mh<=0, steps, hpEnd:ph};
}
function dungeonEarn(q){
  const d = dg();
  if(d.earnedIds[q.id] || d.earned>=DG_KEY_CAP) return false;
  d.earnedIds[q.id] = 1; d.earned++; d.keys++;
  return true;
}
function renderDungeonCard(){
  const el = $('dungeon-card');
  if(!el || !state || !state.character) return;
  const d = dg(), p = pStats(), f = Math.min(d.floor, 4), m = mStats(f, p.lv);
  if(d.hp==null) d.hp = p.maxHp;
  const floors = DG_MONSTERS.map((mo,i)=>`<span class="dg-fl${i<d.floor?' done':''}${i===d.floor&&!d.cleared?' cur':''}">${mo.boss?'보스':(i+1)+'층'}</span>`).join('');
  const hpPct = Math.round(Math.min(100, d.hp/p.maxHp*100));
  el.innerHTML = `<div class="dg-card">
    <div class="dg-top"><b>오늘의 던전</b><span>열쇠 ${d.keys}개</span></div>
    <div class="dg-floors">${floors}</div>
    ${d.cleared ? `<div class="dg-note">보스를 쓰러뜨렸어요! 내일 새 던전이 열려요.</div>` : `<div class="dg-note">${f+1}층 · ${m.name}${m.boss?' (보스)':''} · 몬스터 HP ${m.hp}</div>
    <div class="dg-hp"><i style="width:${hpPct}%"></i></div><div class="dg-sub">내 HP ${d.hp}/${p.maxHp} · 공격력 ${p.atk}</div>
    <button class="dg-go" ${d.keys>0?'':'disabled'} onclick="dgAdvance()">${d.keys>0?'진격 (열쇠 1개)':'열쇠가 없어요'}</button>
    <div class="dg-sub">퀘스트를 완료하면 열쇠를 1개 얻어요. (하루 최대 ${DG_KEY_CAP}개, 매일 무료 1개)</div>`}
  </div>`;
}
function showBattle(p, m, r, floorNo, summary){
  const old = $('dg-modal'); if(old) old.remove();
  const box = document.createElement('div'); box.id = 'dg-modal'; box.className = 'dg-modal';
  box.innerHTML = `<div class="dg-box"><div class="dg-top"><b>${floorNo}층 · ${m.name}</b><button onclick="dgClose()">닫기</button></div>
    <div class="dg-side">나<span class="dg-bar"><i id="dg-pbar" style="width:100%"></i></span><em id="dg-ptxt"></em></div>
    <div class="dg-side">${m.name}<span class="dg-bar m"><i id="dg-mbar" style="width:100%"></i></span><em id="dg-mtxt"></em></div>
    <div class="dg-log" id="dg-log"></div><div class="dg-res" id="dg-res"></div>
    <button class="dg-go" onclick="dgSkip()">건너뛰기</button></div>`;
  document.body.appendChild(box);
  const log = $('dg-log'); let i = 0;
  const show = (st, last)=>{
    const phv = st.who==='m' ? st.ph : st.ph, mhv = st.mh;
    $('dg-pbar').style.width = Math.round(st.ph/p.maxHp*100)+'%'; $('dg-mbar').style.width = Math.round(st.mh/m.hp*100)+'%';
    $('dg-ptxt').textContent = st.ph+'/'+p.maxHp; $('dg-mtxt').textContent = st.mh+'/'+m.hp;
    const line = document.createElement('div');
    line.textContent = st.who==='p' ? `내 공격! ${st.dmg} 피해${st.crit?' (치명타)':''}` : `${m.name}의 공격! ${st.dmg} 피해`;
    log.appendChild(line); log.scrollTop = log.scrollHeight;
  };
  const finish = ()=>{ clearInterval(window._dgTimer); window._dgTimer = null; $('dg-res').textContent = summary; box.querySelector('.dg-go').remove(); };
  window._dgSkip = ()=>{ while(i<r.steps.length){ show(r.steps[i++]); } finish(); };
  window._dgTimer = setInterval(()=>{ if(i>=r.steps.length){ finish(); return; } show(r.steps[i++]); }, 420);
}
window.dgSkip = ()=>{ if(window._dgSkip) window._dgSkip(); };
window.dgClose = ()=>{ clearInterval(window._dgTimer); const m = $('dg-modal'); if(m) m.remove(); renderAll(); render(); if(typeof renderWorld==='function' && $('screen-world') && !$('screen-world').classList.contains('hidden')) renderWorld(); };
window.dgAdvance = async ()=>{
  const c = S(), d = dg(), today = todayStr();
  if(d.cleared){ toast('오늘의 던전은 이미 클리어했어요.'); return; }
  if(d.keys<1){ toast('열쇠가 없어요. 퀘스트를 완료하면 열쇠를 얻어요.'); return; }
  const p = pStats(), f = d.floor, m = mStats(f, p.lv), floorNo = f+1;
  if(d.hp==null) d.hp = p.maxHp;
  d.keys--;
  const r = simulate(p, m, d.hp);
  let summary;
  if(r.win){
    d.floor++; d.hp = Math.min(p.maxHp, r.hpEnd + Math.round(p.maxHp*0.2));
    const dgm = 1 + petPct('dgr')/100;
    const g = Math.round((m.boss ? 60 : 10 + floorNo*5)*dgm), x = Math.round((m.boss ? 50 : 10 + floorNo*5)*dgm);
    const before = Math.floor(state.totalXP/1000)+1;
    state.gold += g; trackGold(g); state.totalXP += x;
    summary = `${floorNo}층 돌파! +${g}G +${x}XP`;
    if(m.boss){
      d.cleared = true; c.clearDays[today] = true; c.chests.normal++;
      summary += ' · 보스 격파! 일반 보물상자 +1';
      if(Math.random()<0.3){ const {coin, isNew} = awardCoin(); summary += ` · ${coin.name}${isNew?' (새 코인)':''}`; }
    }
    if(window.logGain) logGain('⚔️', `던전 ${floorNo}층`, `+${g}G +${x}XP`);
    if(window.maybeShowLevelUp) setTimeout(()=>maybeShowLevelUp(before), 1500);
  } else {
    d.hp = Math.round(p.maxHp*0.5);
    if(!c.restDays[today]) c.cond.hp = Math.max(0, c.cond.hp-10);
    summary = `${floorNo}층에서 패배했어요. 열쇠 1개를 잃고 HP가 반으로 회복돼요. 컨디션 HP −10`;
  }
  await saveState();
  renderDungeonCard(); renderHomeCond();
  showBattle(p, m, r, floorNo, summary);
};


// ---- 월드맵: 지역 성장 + 이번 달 여정 (탐험 GPS 화면은 이 탭의 하위 화면) ----
// 지역: 카테고리별 퀘스트를 5개 완료할 때마다 지역 레벨이 오르고(최대 Lv.10) 새 장소가 열린다.
// 여정: 이번 달 던전을 클리어한 날 수만큼 캐릭터가 길을 나아가고, 끝에서 월간 보물상자를 얻는다.
const REGION_INFO = {
  '공부':{name:'지식 던전',   icon:'📚', spots:['도서관 탑','현자의 서고','별 관측대'], pos:[62,60]},
  '운동':{name:'훈련소',     icon:'🏋️', spots:['연무장','폭포 수련장','투기장'],       pos:[170,42]},
  '창작':{name:'제작소',     icon:'🎨', spots:['공방','유리 온실','예술가의 언덕'],    pos:[278,60]},
  '생활':{name:'마을',       icon:'🏘', spots:['우물가','시장 골목','풍차 언덕'],      pos:[62,176]},
  '기타':{name:'상업 도시',  icon:'💼', spots:['항구 시장','환전소','대상 숙소'],      pos:[170,194]},
  '사회':{name:'축제 지역',  icon:'🎉', spots:['중앙 광장','등불 거리','대극장'],      pos:[278,176]},
};
const REGION_ORDER = ['공부','운동','창작','생활','기타','사회'];
const REGION_STEP = 5;   // 지역 레벨 1개당 필요한 퀘스트 수
const REGION_MAX = 10;
const regionLv = (n)=> Math.min(REGION_MAX, 1 + Math.floor(n/REGION_STEP));
let wRegion = '공부', worldPaneName = 'map';

// 퀘스트 완료 시 해당 카테고리 지역 진행도를 올린다 (같은 퀘스트는 하루 1번만 셈)
function petGrow(notes){
  const c = S();
  c.pets.party.forEach(id=>{
    const pet = PETS.find(x=>x.id===id); if(!pet) return;
    const before = petLv(c.pets.exp[id]||0);
    c.pets.exp[id] = (c.pets.exp[id]||0) + 1;
    const after = petLv(c.pets.exp[id]);
    if(after>before) notes.push(`${pet.name} Lv.${after}`);
  });
}
function worldCount(q, notes){
  const w = S().world, t = todayStr();
  if(w.date!==t){ w.date = t; w.counted = {}; }
  if(w.counted[q.id]) return;
  w.counted[q.id] = 1;
  petGrow(notes);
  const cat = REGION_INFO[q.category] ? q.category : '기타';
  const before = regionLv(w.regions[cat]||0);
  w.regions[cat] = (w.regions[cat]||0) + 1;
  const after = regionLv(w.regions[cat]);
  if(after>before) notes.push(`${REGION_INFO[cat].name} Lv.${after}`);
}

function worldMap(){
  const c = S(), w = c.world;
  const ring = 2*Math.PI*30;
  const roads = [['공부','운동'],['운동','창작'],['생활','기타'],['기타','사회'],['공부','생활'],['운동','기타'],['창작','사회']]
    .map(([a,b])=>`<line x1="${REGION_INFO[a].pos[0]}" y1="${REGION_INFO[a].pos[1]}" x2="${REGION_INFO[b].pos[0]}" y2="${REGION_INFO[b].pos[1]}" style="stroke:var(--cl)" stroke-width="3" stroke-dasharray="6 6"/>`).join('');
  const nodes = REGION_ORDER.map(cat=>{
    const r = REGION_INFO[cat], n = w.regions[cat]||0, lv = regionLv(n);
    const frac = lv>=REGION_MAX ? 1 : (n%REGION_STEP)/REGION_STEP;
    const sel = cat===wRegion;
    return `<g onclick="worldSel('${cat}')" style="cursor:pointer">
      <circle cx="${r.pos[0]}" cy="${r.pos[1]}" r="30" style="fill:var(--cb);stroke:${sel?'var(--ca)':'var(--cl)'}" stroke-width="${sel?3:2}"/>
      <circle cx="${r.pos[0]}" cy="${r.pos[1]}" r="30" fill="none" style="stroke:var(--ca)" stroke-width="4" stroke-dasharray="${(ring*frac).toFixed(1)} ${ring.toFixed(1)}" transform="rotate(-90 ${r.pos[0]} ${r.pos[1]})" stroke-linecap="round"/>
      <text x="${r.pos[0]}" y="${r.pos[1]-3}" text-anchor="middle" font-size="18">${r.icon}</text>
      <text x="${r.pos[0]}" y="${r.pos[1]+15}" text-anchor="middle" font-size="11" font-weight="700" style="fill:var(--text)">Lv.${lv}</text>
      <text x="${r.pos[0]}" y="${r.pos[1]+46}" text-anchor="middle" font-size="11" style="fill:var(--text-dim)">${r.name}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 340 262" width="100%" role="img" aria-label="지역 월드맵">${roads}${nodes}</svg>`;
}
function regionDetail(){
  const w = S().world, r = REGION_INFO[wRegion], n = w.regions[wRegion]||0, lv = regionLv(n);
  const need = lv>=REGION_MAX ? '최대 레벨' : `다음 레벨까지 ${REGION_STEP - n%REGION_STEP}개`;
  const spots = r.spots.map((sp,i)=>{ const nd = 2+i*2; return `<div class="cal-row"><span class="t">${lv>=nd?sp:'잠긴 장소'}<div class="s">${lv>=nd?'해방됨':`${wRegion} 퀘스트로 지역 Lv.${nd}에 해방`}</div></span></div>`; }).join('');
  return `<div class="cal-panel"><h3>${r.icon} ${r.name} · Lv.${lv}</h3><div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">'${wRegion}' 카테고리 퀘스트를 ${n}개 완료했어요. ${need}</div>${spots}</div>`;
}
function journey(){
  const c = S(), k = monthKey(), days = Object.keys(c.clearDays).filter(d=>d.startsWith(k)).sort();
  const goal = MONTH_CLEAR_GOAL, lit = Math.min(days.length, goal);
  const pts = [];
  for(let i=0;i<goal;i++){ const row = i<5?0:1, col = row===0 ? i : 9-i; pts.push([34+col*68, row===0?36:110]); }
  const boss = [34, 186];
  const line = pts.map(p=>p.join(',')).join(' ') + ' ' + boss.join(',');
  const claimed = !!c.monthsClaimed[k], ready = lit>=goal && !claimed;
  const nodes = pts.map((p,i)=>{
    const on = i<lit;
    return `<circle cx="${p[0]}" cy="${p[1]}" r="14" style="fill:${on?'var(--ca)':'var(--cb)'};stroke:var(--${on?'ca':'cl'})" stroke-width="2"/><text x="${p[0]}" y="${p[1]+4}" text-anchor="middle" font-size="11" font-weight="700" style="fill:${on?'#1B1300':'var(--text-faint)'}">${on?Number(days[i].slice(8)):'·'}</text>`;
  }).join('');
  const hero = lit>0 ? pts[lit-1] : pts[0];
  const cls = (typeof CLASSES!=='undefined' && state.character && CLASSES[state.character.cls]) ? CLASSES[state.character.cls].icon : '⚔️';
  return `<svg viewBox="0 0 340 226" width="100%" role="img" aria-label="이번 달 여정">
    <polyline points="${line}" fill="none" style="stroke:var(--cl)" stroke-width="4" stroke-dasharray="7 6"/>
    ${nodes}
    <g onclick="worldBoss()" style="cursor:pointer"><circle cx="${boss[0]}" cy="${boss[1]}" r="22" style="fill:var(--cb);stroke:var(--ca)" stroke-width="${ready?4:2}"/><text x="${boss[0]}" y="${boss[1]+6}" text-anchor="middle" font-size="20">${claimed?'🎁':'👑'}</text><text x="${boss[0]+34}" y="${boss[1]-2}" font-size="12" font-weight="700" style="fill:var(--text)">월간 보스</text><text x="${boss[0]+34}" y="${boss[1]+14}" font-size="11" style="fill:var(--text-dim)">${claimed?'보상 수령 완료':ready?'눌러서 보상 받기':`던전 ${lit}/${goal}일 클리어`}</text></g>
    <text x="${hero[0]}" y="${hero[1]-20}" text-anchor="middle" font-size="20">${cls}</text></svg>`;
}
function renderWorld(){
  const wrap = $('world-wrap');
  if(!wrap || !state || !state.character) return;
  const c = S(), th = theme(), d = dg(), p = pStats();
  wrap.className = ['cal-scope', th.cls, ...c.fxOn.map(x=>'fx-'+x)].filter(Boolean).join(' ');
  wrap.style.setProperty('--ca', th.accent); wrap.style.setProperty('--cb', th.bg); wrap.style.setProperty('--cl', th.line);
  const f = Math.min(d.floor, 4), m = mStats(f, p.lv);
  const dgLine = d.cleared ? '오늘의 던전 클리어! 내일 새 던전이 열려요.' : `${f+1}층 · ${m.name}${m.boss?' (보스)':''} · 열쇠 ${d.keys}개`;
  wrap.innerHTML = `
    <div class="cal-box">
      <div class="cal-head"><button onclick="worldMove(-1)">‹</button><span class="ttl">${th.icon} ${ym.y}년 ${ym.m+1}월 월드맵</span><button onclick="worldMove(1)">›</button></div>
      ${worldMap()}
    </div>
    ${regionDetail()}
    <div class="cal-panel"><h3>이번 달 여정</h3>${journey()}</div>
    <div class="cal-panel"><h3>오늘의 던전</h3><div class="cal-row"><span class="t">${dgLine}<div class="s">퀘스트를 완료하면 열쇠를 얻고, 던전을 클리어하면 여정이 한 칸 나아가요.</div></span><button ${d.cleared||d.keys<1?'disabled':''} onclick="dgAdvance()">진격</button></div></div>${pending ? confirmModal() : ''}`;
}
window.worldSel = (cat)=>{ wRegion = cat; renderWorld(); };
window.worldMove = (dm)=>{ const d = new Date(ym.y, ym.m+dm, 1); ym = {y:d.getFullYear(), m:d.getMonth()}; renderWorld(); };
window.worldBoss = ()=>{
  const c = S(), k = monthKey();
  if(c.monthsClaimed[k]){ toast('이 달의 보상은 이미 받았어요.'); return; }
  if(monthClears()<MONTH_CLEAR_GOAL){ toast(`던전을 ${MONTH_CLEAR_GOAL}일 클리어하면 열려요. (${monthClears()}/${MONTH_CLEAR_GOAL})`); return; }
  calClaimMonth().then(()=>renderWorld());
};
window.renderWorld = renderWorld;
// 랭킹 프로필 공유용 요약 (social.js가 서버로 올린다). 골드·퀘스트 제목 같은 개인 정보는 넣지 않는다.
window.calProfile = ()=>{
  const c = S(), k = todayStr().slice(0,7), regions = {};
  REGION_ORDER.forEach(cat=>{ regions[cat] = regionLv(c.world.regions[cat]||0); });
  return {pets:petParty().map(pi=>({id:pi.pet.id, lv:pi.lv})), skin:c.skinChar, theme:c.active,
    dungeonDays:Object.keys(c.clearDays).filter(d=>d.startsWith(k)).length, regions};
};
// 서버에서 받은 프로필의 id를 화면용 이름·아이콘으로 바꾼다
window.calDescribe = (pr)=>{
  const th = THEMES.find(t=>t.id===pr.theme), sk = SKINS.char.find(x=>x.id===pr.skin);
  return {
    pets:(pr.pets||[]).map(x=>{ const pt = PETS.find(y=>y.id===x.id); return pt ? {icon:pt.icon, name:pt.name, lv:x.lv, fx:fxText(pt, x.lv)} : null; }).filter(Boolean),
    theme: th ? {name:th.name, icon:th.icon} : null, skin: sk ? sk.name : null,
    regions: REGION_ORDER.map(cat=>({name:REGION_INFO[cat].name, icon:REGION_INFO[cat].icon, lv:(pr.regions||{})[cat]||1})),
  };
};
// 월드맵 탭 표시: 월드맵(worldPaneName='map') 또는 탐험(GPS) 화면 중 하나를 보여준다
window.worldShow = ()=>{
  const w = $('screen-world'), e = $('screen-explore');
  if(!w || !e) return;
  const onExplore = worldPaneName==='explore';
  w.classList.toggle('hidden', onExplore); e.classList.toggle('hidden', !onExplore);
  document.querySelectorAll('#screen-world .chip-row .chip').forEach((b,i)=>b.classList.toggle('active', (i===0)===!onExplore));
  if(onExplore){ if(typeof initExploreScreen==='function') initExploreScreen(); }
  else { if(typeof walkTracking!=='undefined' && !walkTracking && typeof stopWatchingPosition==='function') stopWatchingPosition(); renderWorld(); }
};
window.worldPane = (name)=>{ worldPaneName = name; worldShow(); };

// 퀘스트 완료/취소 때마다 index.html에서 호출한다: 컨디션 표시를 새로 고친다
window.renderDungeonCard = renderDungeonCard;
window.calPStats = pStats;
window.calOnQuestChange = ()=>{
  if(!state || !state.character) return;
  gauges(); renderHomeCond(); renderDungeonCard();
  if($('cal-wrap') && !$('screen-calendar').classList.contains('hidden')) render();
};

try{ applySkins(); renderHomePet(); renderHomeCond(); renderDungeonCard(); }catch(e){} // 스크립트가 늦게 로드돼 첫 렌더가 이미 끝난 경우를 보정
})();
