const C=window.TODAY_CONFIG;
const sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey);
const state={day:null,items:[],session:null,profile:null,deferred:null,guestId:null,voted:new Set(),played:new Set(),done:new Set(),posts:[],booted:false};
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const moscowParts=()=>{const d=new Date(Date.now()+3*3600000);return {y:d.getUTCFullYear(),m:d.getUTCMonth()+1,day:d.getUTCDate(),h:d.getUTCHours(),min:d.getUTCMinutes(),s:d.getUTCSeconds()}};
const moscowDate=()=>{const d=moscowParts();return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`};
const fmtDate=s=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Moscow'}).format(new Date(`${s}T12:00:00Z`));
const toast=m=>{const x=$('#toast');x.textContent=m;x.classList.add('show');clearTimeout(x._t);x._t=setTimeout(()=>x.classList.remove('show'),2400)};
const modal=(html)=>{$('#modalContent').innerHTML=html;$('#modal').classList.remove('hidden')};
const closeModal=()=>$('#modal').classList.add('hidden');
const requireAuth=(after)=>{if(state.session)return after();authModal(after)};

function authModal(after){
  modal(`<h3 id="authTitle">Войти в TODAY</h3><p>Сначала попробуй TODAY бесплатно. Аккаунт нужен, чтобы сохранить твои результаты, профиль и историю.</p><form class="auth-form" id="authForm"><input id="authEmail" type="email" required placeholder="Email"><input id="authPass" type="password" minlength="6" required placeholder="Пароль"><button class="primary-button" type="submit">ВОЙТИ</button></form><button class="auth-switch" id="signupSwitch">Нет аккаунта? Создать</button>`);
  let signup=false;
  $('#signupSwitch').onclick=()=>{signup=!signup;$('#authTitle').textContent=signup?'Создать TODAY':'Войти в TODAY';$('#authForm button').textContent=signup?'СОЗДАТЬ':'ВОЙТИ';$('#signupSwitch').textContent=signup?'Уже есть аккаунт? Войти':'Нет аккаунта? Создать'};
  $('#authForm').onsubmit=async e=>{e.preventDefault();const email=$('#authEmail').value.trim(),password=$('#authPass').value;let r=signup?await sb.auth.signUp({email,password,options:{data:{display_name:email.split('@')[0]}}}):await sb.auth.signInWithPassword({email,password});if(r.error)return toast(r.error.message);if(signup&&!r.data.session)return toast('Проверь почту для подтверждения аккаунта');closeModal();await refreshAuth();if(typeof after==='function')after()};
}

function applySkin(){document.documentElement.dataset.skin=state.profile?.skin||'mono'}
async function refreshAuth(){
  const r=await sb.auth.getSession();state.session=r.data.session||null;
  if(state.session){const p=await sb.from('profiles').select('*').eq('id',state.session.user.id).maybeSingle();state.profile=p.data||null;$('#guestComposer').classList.add('hidden');$('#userComposer').classList.remove('hidden');$('#profileAvatar').textContent=state.profile?.avatar_emoji||'✦';await touchPresence()}
  else{$('#guestComposer').classList.remove('hidden');$('#userComposer').classList.add('hidden');$('#profileAvatar').textContent='◉'}
  applySkin();renderProfile();
}
async function touchPresence(){if(!state.session)return;const tp=await sb.rpc('touch_my_profile');if(tp.data)state.profile={...(state.profile||{}),...tp.data};await sb.from('presence').upsert({user_id:state.session.user.id,day_date:state.day||moscowDate(),last_seen_at:new Date().toISOString()},{onConflict:'user_id'});const r=await sb.from('profiles').select('streak,score_total,level,avatar_emoji,display_name,username,skin,coins').eq('id',state.session.user.id).maybeSingle();if(r.data)state.profile={...(state.profile||{}),...r.data};applySkin();}

function cardClass(i){return i<2?'big':i<5?'mid':'small'}
const kindMeta={
 question:['🗳','ВОПРОС','hot'],game:['🎮','ИГРА','violet'],poll:['⚡','ГОЛОС','lime'],mystery:['🕵️','ТАЙНА','violet'],challenge:['🎯','ЧЕЛЛЕНДЖ','lime'],duel:['⚔️','ДУЭЛЬ','hot'],story:['❤️','ИСТОРИЯ','violet'],fact:['✦','ФАКТ','cyan'],trend:['🔥','ТРЕНД','hot'],moment:['◎','МОМЕНТ','cyan'],photo_prompt:['📸','ФОТО ДНЯ','hot'],people_prompt:['◉','ЛЮДИ','violet']};
function renderItem(item,i){
  const m=kindMeta[item.kind]||['✦',item.kind.toUpperCase(),''];const p=item.payload||{};let inner='';
  if(item.kind==='question'||item.kind==='poll'||item.kind==='duel'){
    const opts=Array.isArray(p.options)?p.options:[];inner+=`<div class="choice-grid" data-content="${item.id}" data-kind="${item.kind}">${opts.map((o,j)=>`<button class="choice-button" data-index="${j}">${escapeHtml(o)}</button>`).join('')}</div><div class="stat-row"><span id="statLabel-${item.id}">Голоса сегодня</span><b id="statTotal-${item.id}">—</b></div>`;
  } else if(item.kind==='game'){
    inner+=`<div class="result-box" id="gamePrompt-${item.id}">${escapeHtml(p.question||item.body)}</div><div class="choice-grid" data-content="${item.id}" data-kind="game">${(p.options||[]).map((o,j)=>`<button class="choice-button" data-index="${j}">${escapeHtml(o)}</button>`).join('')}</div>`;
  } else if(item.kind==='mystery'){
    const clues=Array.isArray(p.clues)?p.clues:[];inner+=`<div class="choice-grid">${clues.slice(0,3).map((c,j)=>`<button class="choice-button clue" data-i="${j}">Открыть подсказку ${j+1}</button>`).join('')}</div><div class="result-box hidden" id="mystery-${item.id}">${escapeHtml(p.answer||'Ответ спрятан здесь.')}</div>`;
  } else if(item.kind==='challenge'){
    inner+=`<button class="card-action alt" data-action="challenge" data-content="${item.id}">Я СДЕЛАЮ ЭТО СЕГОДНЯ</button><div class="stat-row"><span>Уже сделали</span><b id="challengeCount-${item.id}">—</b></div>`;
  } else if(item.kind==='photo_prompt'){
    inner+=`<button class="card-action" data-action="photo">УЧАСТВОВАТЬ</button><div class="result-box">${escapeHtml(p.prompt||'Покажи один момент сегодняшнего дня.')}</div>`;
  } else if(item.kind==='people_prompt'){
    inner+=`<button class="card-action" data-action="people">ОСТАВИТЬ СЛЕД</button>`;
  }
  const sources=(item.source_items||[]).slice(0,3).map(x=>x?.url?`<a href="${escapeHtml(x.url)}" target="_blank" rel="noopener">источник</a>`:'').join('');
  return `<article class="daily-card ${cardClass(i)}" data-kind="${item.kind}" id="item-${item.id}"><div class="card-head"><span class="kind-pill ${m[2]}">${m[0]} ${m[1]}</span><span class="expired">только сегодня</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p>${inner}${sources?`<div class="source-links">${sources}</div>`:''}<div class="card-footer"><span>${item.kind==='game'?'быстрая игра':item.kind==='question'||item.kind==='poll'?'голосуй':'TODAY'}</span><span>до 00:00</span></div></article>`;
}
async function loadDay(){
  state.day=moscowDate();$('#dateLabel').textContent=fmtDate(state.day);const r=await sb.from('days').select('*').eq('day_date',state.day).maybeSingle();
  if(!r.data){$('#dayTheme').textContent='НОВЫЙ ДЕНЬ СКОРО';return}
  $('#dayTheme').textContent=r.data.theme||'ТВОЙ ДЕНЬ В ИНТЕРНЕТЕ';document.documentElement.dataset.layout=r.data.layout_key||'layout_0';
  const c=await sb.from('content_items').select('*').eq('day_date',state.day).order('sort_order',{ascending:true});state.items=c.data||[];
  $('#dailyGrid').innerHTML=state.items.map(renderItem).join('');wireCards();loadStats();loadPosts();loadLeaderboard();
}
async function loadStats(){
  const q=await sb.rpc('today_interaction_stats',{p_day:state.day});if(q.data){for(const s of q.data){const total=document.getElementById(`statTotal-${s.content_id}`);if(total)total.textContent=String(s.total_votes||0);const cc=document.getElementById(`challengeCount-${s.content_id}`);if(cc)cc.textContent=String(s.total_actions||0)}}
  const pres=await sb.rpc('today_live_count',{p_day:state.day});const live=Number(pres.data||0);$('#liveCount').textContent=`${live} человек сейчас здесь`;$('#liveMeta').textContent='активны за последние 3 минуты';
}
function wireCards(){
  $$('.choice-grid[data-content]').forEach(grid=>grid.addEventListener('click',async e=>{const b=e.target.closest('.choice-button');if(!b)return;const content=state.items.find(x=>x.id===grid.dataset.content);if(!content)return;const idx=Number(b.dataset.index);
    if(content.kind==='game')return playGame(content,grid,idx);if(!state.session)return authModal(()=>submitVote(content,idx));submitVote(content,idx);
  }));
  $$('[data-action="challenge"]').forEach(b=>b.onclick=()=>{const item=state.items.find(x=>x.id===b.dataset.content);requireAuth(()=>submitChallenge(item,b))});
  $$('[data-action="people"]').forEach(b=>b.onclick=()=>scrollToSection('peopleSection'));
  $$('[data-action="photo"]').forEach(b=>b.onclick=()=>scrollToSection('peopleSection'));
  $$('.clue').forEach(b=>b.onclick=()=>{const card=b.closest('.daily-card');const box=card.querySelector('.result-box');const item=state.items.find(x=>x.id===card.id.replace('item-',''));const clue=(item?.payload?.clues||[])[Number(b.dataset.i)];b.textContent='✓ Подсказка открыта';b.disabled=true;let s=box.dataset.clues||'';s+=`<div style="margin-top:6px">${escapeHtml(clue||'')}</div>`;box.innerHTML=s;box.classList.remove('hidden')});
}
async function submitVote(item,idx){const key=`vote:${item.id}`;if(state.voted.has(key)||localStorage.getItem(key))return toast('Ты уже голосовал сегодня');const r=await sb.from('daily_votes').insert({day_date:state.day,user_id:state.session.user.id,content_id:item.id,option_index:idx});if(r.error){if(r.error.code==='23505')return toast('Ты уже голосовал сегодня');return toast(r.error.message)}state.voted.add(key);localStorage.setItem(key,'1');const stats=await sb.rpc('record_daily_action',{p_action:'vote',p_content_id:item.id});if(stats.error)console.warn(stats.error);const grid=document.querySelector(`.choice-grid[data-content="${item.id}"]`);grid?.querySelectorAll('.choice-button').forEach((b,i)=>{b.classList.toggle('selected',i===idx);b.disabled=true});loadStats();toast('Голос принят');}
async function playGame(item,grid,idx){if(grid.dataset.done)return;grid.dataset.done='1';const correct=Number(item.payload?.answer_index||0);grid.querySelectorAll('.choice-button').forEach((b,i)=>{b.disabled=true;if(i===correct)b.classList.add('correct');if(i===idx&&idx!==correct)b.classList.add('wrong')});const score=idx===correct?100:0;if(state.session){const r=await sb.from('game_attempts').insert({day_date:state.day,user_id:state.session.user.id,content_id:item.id,score});if(r.error?.code==='23505')return toast('Игра уже пройдена');if(r.error)return toast(r.error.message);await sb.rpc('record_daily_action',{p_action:'game',p_content_id:item.id})}localStorage.setItem(`game:${item.id}`,'1');toast(idx===correct?'Попал! +10':'Не угадал. Завтра новая игра');loadLeaderboard()}
async function submitChallenge(item,b){if(b.disabled)return;const r=await sb.from('challenge_submissions').insert({day_date:state.day,user_id:state.session.user.id,content_id:item.id});if(r.error?.code==='23505')return toast('Ты уже отметил этот челлендж');if(r.error)return toast(r.error.message);b.disabled=true;b.textContent='✓ СДЕЛАНО';await sb.rpc('record_daily_action',{p_action:'challenge',p_content_id:item.id});loadStats();toast('Челлендж засчитан')}

async function loadPosts(){const r=await sb.from('posts').select('id,body,image_path,like_count,report_count,created_at,user_id,profiles(display_name,username,avatar_emoji,streak)').eq('day_date',state.day).eq('hidden',false).order('created_at',{ascending:false}).limit(30);state.posts=r.data||[];$('#postsList').innerHTML=state.posts.map(p=>{const url=p.image_path?sb.storage.from('today-media').getPublicUrl(p.image_path).data.publicUrl:'';return `<article class="post-card"><div class="post-head"><div class="post-avatar">${escapeHtml(p.profiles?.avatar_emoji||'✦')}</div><div><div class="post-name">${escapeHtml(p.profiles?.display_name||'Anonymous')}</div><div class="post-streak">${p.profiles?.streak||0} дней подряд</div></div></div><div class="post-body">${escapeHtml(p.body)}</div>${url?`<img class="post-image" src="${escapeHtml(url)}" alt="Фото дня" loading="lazy">`:''}<div class="post-actions"><button class="reaction-button" data-like="${p.id}">❤️ ${p.like_count||0}</button><button class="reaction-button" data-react="🔥" data-post="${p.id}">🔥</button><button class="reaction-button" data-react="😂" data-post="${p.id}">😂</button><button class="reaction-button" data-report="${p.id}">⚑</button></div></article>`}).join('')||'<div class="composer-card"><b>Сегодня пока тихо.</b><p>Оставь первый след.</p></div>';wirePosts()}
function wirePosts(){$$('[data-like]').forEach(b=>b.onclick=()=>requireAuth(()=>toggleLike(b.dataset.like,b)));$$('[data-react]').forEach(b=>b.onclick=()=>requireAuth(()=>reactPost(b.dataset.post,b.dataset.react)));$$('[data-report]').forEach(b=>b.onclick=()=>requireAuth(()=>reportPost(b.dataset.report)))}
async function toggleLike(id,b){const r=await sb.from('post_likes').upsert({post_id:id,user_id:state.session.user.id},{onConflict:'post_id,user_id'});if(r.error)return toast(r.error.message);toast('❤️');loadPosts()}
async function reactPost(id,type){const r=await sb.from('post_reactions').upsert({post_id:id,user_id:state.session.user.id,reaction_type:type},{onConflict:'post_id,user_id,reaction_type'});if(r.error)return toast(r.error.message);toast(type);}
async function reportPost(id){const r=await sb.from('reports').insert({post_id:id,user_id:state.session.user.id});if(r.error?.code==='23505')return toast('Уже отправлено');if(r.error)return toast(r.error.message);toast('Спасибо, проверим');loadPosts()}

async function publish(){if(!state.session)return authModal();const body=$('#postText').value.trim();if(!body)return toast('Напиши хотя бы одну строку');if(body.length>280)return toast('Слишком длинно');let image_path=null;const f=$('#postImage').files?.[0];if(f){if(f.size>5*1024*1024)return toast('Фото больше 5 МБ');const ext=(f.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';image_path=`${state.session.user.id}/${state.day}-${crypto.randomUUID()}.${ext}`;const up=await sb.storage.from('today-media').upload(image_path,f,{upsert:false,contentType:f.type||'image/jpeg'});if(up.error)return toast(up.error.message)}const r=await sb.from('posts').insert({day_date:state.day,user_id:state.session.user.id,body,image_path});if(r.error){if(image_path)await sb.storage.from('today-media').remove([image_path]);if(r.error.code==='23505')return toast('Сегодня ты уже оставлял запись');return toast(r.error.message)}await sb.rpc('record_daily_action',{p_action:'post',p_content_id:null});$('#postText').value='';$('#postImage').value='';$('#charCount').textContent='0/280';toast('Твой день оставлен');loadPosts();renderProfile()}

async function loadLeaderboard(){const r=await sb.rpc('today_leaderboard',{p_day:state.day,p_limit:10});const data=r.data||[];$('#leaderboard').innerHTML=data.map((x,i)=>`<div class="leader-row"><div class="rank-number">${['🥇','🥈','🥉'][i]||i+1}</div><div class="rank-avatar">${escapeHtml(x.avatar_emoji||'✦')}</div><div class="rank-user"><b>${escapeHtml(x.display_name||'Anonymous')}</b><small>@${escapeHtml(x.username||'user')}</small></div><div class="rank-score">${x.score_total||0}</div><div class="rank-streak">🔥${x.streak||0}</div></div>`).join('')||'<div class="composer-card"><b>Пока никто не попал в рейтинг.</b><p>Сделай первое действие.</p></div>'}

function renderProfile(){if(!state.profile){$('#mySection').classList.add('hidden');return}$('#mySection').classList.remove('hidden');$('#profilePanel').innerHTML=`<div class="profile-panel"><div class="profile-top"><div class="profile-big">${escapeHtml(state.profile.avatar_emoji||'✦')}</div><div><h3>${escapeHtml(state.profile.display_name||'Anonymous')}</h3><p>@${escapeHtml(state.profile.username||'user')} · ${state.profile.streak||0} дней подряд</p></div><button id="logoutBtn" class="text-button">ВЫЙТИ</button></div><div class="profile-stats"><div class="pstat"><b>${state.profile.score_total||0}</b><span>очков TODAY</span></div><div class="pstat"><b>${state.profile.level||1}</b><span>уровень</span></div><div class="pstat"><b>${state.profile.streak||0}</b><span>серия дней</span></div><div class="pstat"><b>${state.profile.coins||0}</b><span>TODAY coins</span></div></div><div class="skin-shop"><h4>ТВОЙ СТИЛЬ · СЕГОДНЯ</h4><div class="skin-grid">${skins.map(s=>`<button class="skin" data-skin="${s.code}"><div class="skin-sample" style="background:${s.bg}"></div><b>${s.name}</b><small>${s.price} coins</small></button>`).join('')}</div></div></div>`;$('#logoutBtn').onclick=async()=>{await sb.auth.signOut();state.profile=null;toast('Вышел');await refreshAuth();};$$('[data-skin]').forEach(b=>b.onclick=()=>buySkin(b.dataset.skin))}
const skins=[{code:'neon',name:'NEON',price:60,bg:'linear-gradient(135deg,#7655ff,#61d9d2)'},{code:'fire',name:'FIRE',price:70,bg:'linear-gradient(135deg,#ff5c45,#ffd65a)'},{code:'acid',name:'ACID',price:80,bg:'linear-gradient(135deg,#c8f64a,#1e3610)'},{code:'mono',name:'MONO',price:40,bg:'linear-gradient(135deg,#151515,#777)'}];
async function buySkin(code){requireAuth(async()=>{const skin=skins.find(x=>x.code===code);if(!skin)return;const r=await sb.rpc('buy_cosmetic',{p_code:code});if(r.error)return toast(r.error.message);state.profile={...(state.profile||{}),...(r.data||{}),skin:code};applySkin();toast(`${skin.name} теперь твой`);renderProfile()})}

function msToMoscowMidnight(){const d=moscowParts();const next=Date.UTC(d.y,d.m-1,d.day+1)-3*3600000;return Math.max(0,next-Date.now())}
function tick(){const d=msToMoscowMidnight();const h=Math.floor(d/3600000),m=Math.floor(d%3600000/60000),s=Math.floor(d%60000/1000);$('#countdown').textContent=[h,m,s].map(v=>String(v).padStart(2,'0')).join(':');const pct=Math.min(100,Math.max(0,100-d/(24*3600000)*100));$('#dayProgress').textContent=`${Math.round(pct)}%`;if(d<1000)setTimeout(()=>location.reload(),1200)}
function scrollToSection(id){document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})}
function installInfo(){modal('<h3>Добавить TODAY на экран</h3><p><b>Android/Chrome:</b> нажми меню браузера → «Установить приложение» или «Добавить на главный экран».</p><p><b>iPhone:</b> Safari → «Поделиться» → «На экран Домой».</p><button class="primary-button" onclick="closeModal()">ПОНЯТНО</button>')}
function subscribeNotify(){installInfo()}
$('#postText').addEventListener('input',e=>$('#charCount').textContent=`${e.target.value.length}/280`);$('#postBtn').onclick=publish;$('#joinBtn').onclick=()=>authModal();$('#profileBtn').onclick=()=>state.session?scrollToSection('mySection'):authModal();$('#brandBtn').onclick=()=>scrollToSection('app');$('#modalClose').onclick=closeModal;$('.modal-backdrop').onclick=closeModal;$('#peopleRefresh').onclick=loadPosts;$('#notifyBtn').onclick=subscribeNotify;
$$('.bottom-nav button').forEach(b=>b.onclick=()=>{ $$('.bottom-nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');const n=b.dataset.nav;if(n==='home')scrollToSection('app');if(n==='people')scrollToSection('peopleSection');if(n==='rank')scrollToSection('leaderboard');if(n==='me')state.session?scrollToSection('mySection'):authModal() });
$('#installBtn').onclick=async()=>{if(state.deferred){state.deferred.prompt();await state.deferred.userChoice;state.deferred=null;$('#installBtn').classList.add('hidden')}else installInfo()};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferred=e;$('#installBtn').classList.remove('hidden')});
window.addEventListener('online',()=>toast('Соединение восстановлено'));
window.addEventListener('offline',()=>toast('Ты офлайн — показываю сохранённое'));
sb.auth.onAuthStateChange(()=>setTimeout(refreshAuth,0));
(async()=>{try{if('serviceWorker'in navigator)await navigator.serviceWorker.register('./sw.js')}catch(e){console.warn(e)}await refreshAuth();await loadDay();tick();setInterval(tick,1000);setInterval(async()=>{if(moscowDate()!==state.day)return location.reload();await touchPresence();loadStats()},60000)})();
