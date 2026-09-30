/* 캘린더 월드맵: 월간 캘린더 + 테마 상점 (1차 MVP). 퀘스트 화면의 '캘린더' 보기로 노출된다.
   index.html의 전역(state, saveState, trackGold, todayStr, catIcon, escapeHtml, toast, renderAll, questCardEl)을 사용한다. */
(function(){
const $ = (id)=>document.getElementById(id);
// 가격은 퀘스트 골드(XP÷5: 보통 20G, 하루 5개 약 100G) 기준으로 잡았다: 테마 3~15일치
const THEMES = [
  {id:'kingdom', name:'왕국',       icon:'🏰', price:0,    accent:'#E7B549', bg:'#221C3B', line:'#372C55', desc:'기본 월드맵'},
  {id:'forest',  name:'숲',         icon:'🌲', price:300,  accent:'#6FCF97', bg:'#16281F', line:'#2C4A38', desc:'초록빛 숲속 지도'},
  {id:'academy', name:'마법학교',   icon:'🔮', price:800,  accent:'#B58CFF', bg:'#24173F', line:'#4A3479', desc:'보랏빛 마법진 지도'},
  {id:'cyber',   name:'사이버 도시', icon:'🌆', price:1500, accent:'#4FE0F0', bg:'#0F1B2B', line:'#1F4A66', desc:'네온 불빛 도시 지도'},
];
const DAILY_BUY_CAP = 2; // 하루 구매 한도 (골드 소비 폭주 방지)
const now = new Date();
let ym = {y:now.getFullYear(), m:now.getMonth()}, sel = null, view = 'list', shopOpen = false;

const css = document.createElement('style');
css.textContent = `
#cal-wrap{--ca:#E7B549;--cb:#221C3B;--cl:#372C55;margin-bottom:14px}
.cal-box{background:var(--cb);border:1px solid var(--cl);border-radius:var(--radius-s,12px);padding:10px}
.cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-weight:800}
.cal-head button{background:none;border:1px solid var(--cl);color:var(--text);border-radius:8px;padding:6px 12px;font-size:15px}
.cal-head .ttl{color:var(--ca)}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.cal-dow{text-align:center;font-size:11px;color:var(--text-dim);padding:2px 0}
.cal-day{min-height:52px;border:1px solid var(--cl);border-radius:8px;padding:3px;font-size:11px;background:rgba(0,0,0,.15);color:var(--text);text-align:left;display:flex;flex-direction:column;gap:1px;cursor:pointer}
.cal-day.blank{visibility:hidden}
.cal-day.today{border-color:var(--ca);box-shadow:0 0 0 1px var(--ca) inset}
.cal-day.sel{background:var(--ca);color:#1B1300}
.cal-day .n{font-weight:800}
.cal-day .ic{font-size:11px;line-height:1.15;word-break:keep-all}
.cal-panel{margin-top:10px;background:var(--cb);border:1px solid var(--cl);border-radius:var(--radius-s,12px);padding:10px}
.cal-panel h3{margin:0 0 6px;font-size:14px;color:var(--ca)}
.cal-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--cl);font-size:13px}
.cal-row:last-child{border-bottom:0}
.cal-row .t{flex:1;min-width:0}.cal-row .s{font-size:11.5px;color:var(--text-dim)}
.cal-row button{padding:7px 12px;border-radius:8px;border:1px solid var(--cl);background:var(--card-hi);color:var(--text);font-size:12px}
.cal-row button.on{background:var(--ca);color:#1B1300;border-color:var(--ca)}
.cal-top{display:flex;justify-content:flex-end;margin-bottom:8px}
`;
document.head.appendChild(css);

const S = ()=> (state.calendar = Object.assign({themes:['kingdom'], active:'kingdom', buyDate:null, buyCount:0}, state.calendar||{}));
const theme = ()=> THEMES.find(t=>t.id===S().active) || THEMES[0];
const pad = (n)=> String(n).padStart(2,'0');
const ymd = (y,m,d)=> `${y}-${pad(m+1)}-${pad(d)}`;

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

function dayCell(d, today){
  const ds = ymd(ym.y, ym.m, d), qs = questsOn(ds);
  const dated = qs.filter(q=>q.type==='dated');
  const icons = dated.slice(0,2).map(q=> isBoss(q) ? '👑' : catIcon(q.category)).join('');
  const more = dated.length>2 ? `+${dated.length-2}` : '';
  const rep = qs.length-dated.length>0 ? '·' : '';
  return `<button class="cal-day${ds===today?' today':''}${ds===sel?' sel':''}" onclick="calSelect('${ds}')"><span class="n">${d}</span><span class="ic">${icons}${more}${rep}</span></button>`;
}

function dayPanel(){
  if(!sel) return '';
  const qs = questsOn(sel), today = todayStr();
  const done = qs.filter(q=>isDone(q, sel)).length;
  const head = sel===today ? `⚔️ 오늘의 던전 ${done}/${qs.length}` : `📅 ${sel} 일정 ${qs.length}개`;
  if(qs.length===0) return `<div class="cal-panel"><h3>${head}</h3><div class="s" style="color:var(--text-dim);font-size:12.5px">이 날의 퀘스트가 없습니다.</div></div>`;
  const rows = qs.map(q=>{
    return `<div class="cal-row"><span>${isBoss(q)?'👑':catIcon(q.category)}</span><span class="t">${escapeHtml(q.title)}<div class="s">${q.type==='dated'?(isBoss(q)?'보스 퀘스트':'마감 퀘스트'):'반복 퀘스트'} · +${q.xp}XP${q.gold>0?` · +${q.gold}G`:''}</div></span><span>${isDone(q, sel)?'✅':''}</span></div>`;
  }).join('');
  return `<div class="cal-panel"><h3>${head}</h3>${rows}<div class="s" style="color:var(--text-faint);font-size:11px;margin-top:6px">완료 체크는 홈 또는 목록 보기에서 합니다.</div></div>`;
}

function shopPanel(){
  const c = S(), today = todayStr();
  const left = DAILY_BUY_CAP - (c.buyDate===today ? c.buyCount : 0);
  const rows = THEMES.map(t=>{
    const own = c.themes.includes(t.id), on = c.active===t.id;
    const btn = on ? `<button class="on" disabled>사용 중</button>`
      : own ? `<button onclick="calApply('${t.id}')">적용</button>`
      : `<button onclick="calBuy('${t.id}')">🪙${t.price}</button>`;
    return `<div class="cal-row"><span style="font-size:20px">${t.icon}</span><span class="t">${t.name}<div class="s">${t.desc}</div></span>${btn}</div>`;
  }).join('');
  return `<div class="cal-panel"><h3>🎨 캘린더 테마 (오늘 구매 가능 ${Math.max(0,left)}회)</h3>${rows}</div>`;
}

function render(){
  const wrap = $('cal-wrap');
  if(!wrap || !state) return;
  const listEls = ['quest-filter-row','all-quest-list'].map($);
  document.querySelectorAll('#quest-view-row .chip').forEach(c=>c.classList.toggle('active', c.dataset.val===view));
  wrap.style.display = view==='cal' ? '' : 'none';
  listEls.forEach(el=>{ if(el) el.style.display = view==='cal' ? 'none' : ''; });
  if(view!=='cal') return;
  const th = theme();
  wrap.style.setProperty('--ca', th.accent); wrap.style.setProperty('--cb', th.bg); wrap.style.setProperty('--cl', th.line);
  const first = new Date(ym.y, ym.m, 1).getDay(), days = new Date(ym.y, ym.m+1, 0).getDate(), today = todayStr();
  let cells = '';
  for(let i=0;i<first;i++) cells += `<div class="cal-day blank"></div>`;
  for(let d=1; d<=days; d++) cells += dayCell(d, today);
  wrap.innerHTML = `
    <div class="cal-top"><button class="chip" onclick="calToggleShop()">🎨 테마 ${th.icon} ${th.name}</button></div>
    <div class="cal-box">
      <div class="cal-head"><button onclick="calMove(-1)">‹</button><span class="ttl">${th.icon} ${ym.y}년 ${ym.m+1}월</span><button onclick="calMove(1)">›</button></div>
      <div class="cal-grid">${['일','월','화','수','목','금','토'].map(w=>`<div class="cal-dow">${w}</div>`).join('')}${cells}</div>
    </div>
    ${shopOpen ? shopPanel() : ''}${dayPanel()}`;
}

window.calRender = render;
window.setQuestView = (v)=>{ view = v; if(v==='cal' && !sel) sel = todayStr(); render(); };
window.calMove = (dm)=>{ const d = new Date(ym.y, ym.m+dm, 1); ym = {y:d.getFullYear(), m:d.getMonth()}; render(); };
window.calSelect = (ds)=>{ sel = ds; render(); };
window.calToggleShop = ()=>{ shopOpen = !shopOpen; render(); };
window.calApply = async (id)=>{ const c = S(); if(!c.themes.includes(id)) return; c.active = id; await saveState(); render(); };
window.calBuy = async (id)=>{
  const t = THEMES.find(x=>x.id===id), c = S(), today = todayStr();
  if(!t || c.themes.includes(id)) return;
  if(c.buyDate!==today){ c.buyDate = today; c.buyCount = 0; }
  if(c.buyCount>=DAILY_BUY_CAP){ toast(`테마는 하루에 ${DAILY_BUY_CAP}개까지 살 수 있어요.`); return; }
  if(state.gold < t.price){ toast(`골드가 부족해요. (${state.gold}/${t.price}G)`); return; }
  state.gold -= t.price; trackGold(-t.price);
  c.themes.push(id); c.active = id; c.buyCount++;
  await saveState();
  toast(`${t.icon} ${t.name} 테마를 구매했어요!`);
  renderAll(); render();
};
})();
