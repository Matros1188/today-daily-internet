/* TODAY SOCIAL EVOLUTION V51 — profile route + selected community tools. */
(()=>{'use strict';
const VERSION='20261015190023';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateMoscow=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const localGet=(k,fallback)=>{try{const x=JSON.parse(localStorage.getItem(k)||'null');return x==null?fallback:x}catch{return fallback}};
const localSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}};
const logLocal=(event,detail='')=>{const key='today-v51-private-events';const arr=localGet(key,[]);arr.push({day:dateMoscow(),at:Date.now(),event:String(event).slice(0,48),detail:String(detail).slice(0,70)});localSet(key,arr.slice(-2000));};
const toast=msg=>{const node=$('#toast');if(node){node.textContent=msg;node.classList.add('show');clearTimeout(window.__todayV51Toast);window.__todayV51Toast=setTimeout(()=>node.classList.remove('show'),2800)}else console.info('[TODAY]',msg)};
const profileRoute=document.body.classList.contains('today-profile-route');
if(profileRoute){bootProfilePage();return;}
function navigateProfile(){location.href=new URL('./profile.html',location.href).href;}
function installProfileNavigation(){
 if(document.documentElement.dataset.todayV51ProfileNav==='1')return;
 document.documentElement.dataset.todayV51ProfileNav='1';
 document.addEventListener('click',e=>{
  const t=e.target instanceof Element?e.target.closest('#profileBtn,.bottom-nav button[data-nav="me"],[data-today-open-profile]'):null;
  if(!t)return;
  e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();
  logLocal('profile_open');navigateProfile();
 },true);
}
function makeTools(){
 if($('#todayV51Tools'))return;
 const top=$('.topbar')||$('.topbar-inner');if(!top)return;
 const bar=document.createElement('section');bar.id='todayV51Tools';bar.className='today-v51-tools';bar.innerHTML=`
 <div class="today-v51-search-wrap"><span aria-hidden="true">⌕</span><input id="todayV51Search" type="search" maxlength="100" placeholder="Поиск по TODAY — темы, авторы, публикации" autocomplete="off" aria-label="Поиск по публикациям TODAY"><button type="button" id="todayV51SearchClear" aria-label="Очистить поиск">×</button></div>
 <div id="todayV51SearchMeta" class="today-v51-search-meta">Поиск по загруженным публикациям и рубрикам дня</div>
 <div class="today-v51-quick-actions"><button type="button" data-v51-action="question">◈ Вопрос дня</button><button type="button" data-v51-action="challenge">✦ Испытание</button><button type="button" data-v51-action="drafts">▤ Черновики <b id="todayV51DraftCount">0</b></button><button type="button" data-v51-action="status">⌁ Состояние TODAY</button><button type="button" data-v51-action="analytics">↗ Моя активность</button></div>
 <div id="todayV51QuestionTrack" class="today-v51-question-track"></div><div id="todayV51Dialog" class="today-v51-dialog" hidden></div>`;
 top.insertAdjacentElement('afterend',bar);
 const input=$('#todayV51Search'),meta=$('#todayV51SearchMeta');
 const synonyms={
  'музыка':['песня','трек','артист','группа','альбом','концерт'], 'юмор':['смешно','прикол','мем','шутка'], 'игры':['игра','кристалл','уровень','пазл','головоломка'],
  'друзья':['друг','общение','чат','знакомство'], 'работа':['карьера','вакансия','деньги','профессия'], 'путешествия':['путешествие','город','море','поездка'],
  'факты':['интересное','наука','знание','необычное'], 'истории':['рассказ','случай','история','воспоминание'], 'еда':['рецепт','кухня','готовить'], 'спорт':['тренировка','футбол','бег']
 };
 const norm=x=>String(x||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}@_-]+/gu,' ').trim();
 const expand=q=>{const tokens=norm(q).split(/\s+/).filter(Boolean);const more=[...tokens];for(const [k,vals] of Object.entries(synonyms)){if(tokens.some(t=>t===norm(k)||vals.some(v=>norm(v)===t))){more.push(norm(k),...vals.map(norm));}}return [...new Set(more)];};
 let searchTimer=0;
 const cards=()=>$$('#communityFeed .today-post-card,#communityFeed .community-card,#communityFeed article,#dailyGrid .daily-card').filter((c,i,a)=>a.indexOf(c)===i);
 const applySearch=()=>{
  const q=input.value.trim();const list=cards();let shown=0;
  if(!q){list.forEach(c=>{c.classList.remove('today-v51-search-hidden');c.removeAttribute('data-v51-score')});meta.textContent='Поиск по загруженным публикациям и рубрикам дня';return;}
  const tokens=expand(q);list.forEach(c=>{const txt=norm(c.innerText||c.textContent||'');const score=tokens.reduce((n,t)=>n+(txt.includes(t)?(norm(q).includes(t)?3:1):0),0);const match=score>0;c.classList.toggle('today-v51-search-hidden',!match);if(match){shown++;c.dataset.v51Score=String(score)}else c.removeAttribute('data-v51-score')});
  const feed=$('#communityFeed'),daily=$('#dailyGrid');if(feed)tokens.length&&feed.querySelectorAll('.today-post-card,.community-card,article').forEach(c=>{if(!c.classList.contains('today-v51-search-hidden')&&c.parentElement===feed)c.parentElement.appendChild(c)});
  meta.textContent=`Найдено: ${shown} из ${list.length}. Поиск работает по уже загруженному контенту; старые и не загруженные посты не индексируются.`;logLocal('search',q.slice(0,60));
 };
 input.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(applySearch,100)});
 $('#todayV51SearchClear').addEventListener('click',()=>{input.value='';applySearch();input.focus()});
 const requestedAction=new URLSearchParams(location.search).get('open');if(requestedAction==='shop'){let shopTries=0;const openRequestedShop=()=>{shopTries++;if(typeof window.shopOpen==='function'){try{window.shopOpen();history.replaceState({},'',location.pathname+location.hash)}catch(err){console.warn('TODAY requested shop',err)}}else if(shopTries<24)setTimeout(openRequestedShop,250)};setTimeout(openRequestedShop,800)}
 const draftsKey='today-v51-offline-drafts';
 const countDrafts=()=>{const n=$('#todayV51DraftCount');if(n)n.textContent=String(localGet(draftsKey,[]).length)};
 const questionKey='today-v51-question-'+dateMoscow();
 const questionState=()=>localGet(questionKey,{seen:false,thought:false,answered:false});
 const renderQuestionTrack=()=>{const host=$('#todayV51QuestionTrack');if(!host)return;const state=questionState();host.innerHTML=`<div class="today-v51-q-head"><div><small>РИТМ СЕГОДНЯ</small><b>Один вопрос · три шага</b></div><span>${[state.seen,state.thought,state.answered].filter(Boolean).length}/3</span></div><div class="today-v51-q-steps">${[['seen','1','Прочитай'],['thought','2','Обдумай'],['answered','3','Ответь']].map(([key,n,label])=>`<button type="button" data-v51-qstep="${key}" class="${state[key]?'done':''}"><i>${state[key]?'✓':n}</i>${label}</button>`).join('')}</div><p>Отметки личные и сохраняются в этом браузере. Публичное голосование остаётся в самом вопросе дня.</p><button type="button" class="today-v51-link" data-v51-action="open-question">Открыть вопрос дня →</button>`;};
 renderQuestionTrack();countDrafts();
 const dialog=$('#todayV51Dialog');
 const openDialog=(title,body)=>{dialog.innerHTML=`<div class="today-v51-dialog-head"><div><small>TODAY COMMUNITY TOOLS</small><h3>${esc(title)}</h3></div><button type="button" data-v51-close aria-label="Закрыть">×</button></div><div class="today-v51-dialog-body">${body}</div>`;dialog.hidden=false;dialog.scrollIntoView({behavior:'smooth',block:'nearest'});};
 const dailyQuestion=()=>$('#dailyGrid .daily-card.kind-question');
 const challengeId=()=>{const d=dateMoscow();const h=Array.from(d).reduce((n,ch)=>(n*31+ch.charCodeAt(0))>>>0,17);return (h%220)+1;};
 async function statusView(){openDialog('Состояние TODAY',`<div class="today-v51-status-list"><div><span>Соединение браузера</span><b id="v51Network">Проверяю…</b></div><div><span>Основной интерфейс</span><b id="v51Index">Проверяю…</b></div><div><span>Лента и публикации</span><b id="v51Feed">Проверяю…</b></div><div><span>Слой общения</span><b id="v51Social">Проверяю…</b></div><div><span>Игровой центр</span><b id="v51Games">Проверяю…</b></div></div><p class="today-v51-note">Это диагностика текущего браузера, а не независимый мониторинг серверов.</p><button type="button" data-v51-action="status-refresh" class="today-v51-primary">Повторить проверки</button>`);$('#v51Network').textContent=navigator.onLine?'В сети':'Нет соединения';const checks=[['v51Index','./index.html'],['v51Feed','./app.js'],['v51Social','./social.js'],['v51Games','./today-evolution.js']];for(const [id,url] of checks){const el=$('#'+id);try{const resp=await fetch(url+'?v='+VERSION,{cache:'no-store'});el.textContent=resp.ok?'Доступен':'HTTP '+resp.status;el.className=resp.ok?'ok':'bad'}catch{el.textContent='Недоступен';el.className='bad'}}}
 function draftsView(){const drafts=localGet(draftsKey,[]);openDialog('Черновики и очередь офлайн',`<p>Сохраняй тексты на этом устройстве, если сеть нестабильна. Избегаем автоматической отправки вслепую, чтобы не создавать дубликаты.</p><label class="today-v51-label">Новый черновик<textarea id="v51DraftText" maxlength="5000" placeholder="Напиши текст публикации…"></textarea></label><div class="today-v51-button-row"><button type="button" data-v51-draft-save class="today-v51-primary">Сохранить черновик</button><button type="button" data-v51-action="drafts-export">Экспортировать все</button></div><div class="today-v51-draft-list">${drafts.map((d,i)=>`<article><small>${esc(d.day||'')} · ${esc(new Date(d.at||Date.now()).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))}</small><p>${esc(d.text.slice(0,500))}</p><div class="today-v51-button-row"><button type="button" data-v51-draft-copy="${i}">Копировать</button><button type="button" data-v51-draft-delete="${i}">Удалить</button></div></article>`).join('')||'<div class="today-v51-empty">Сохранённых черновиков пока нет.</div>'}</div><p class="today-v51-note">Черновики хранятся локально. Автоматическая отправка без подтверждения не выполняется.</p>`);}
 function analyticsView(){const ev=localGet('today-v51-private-events',[]),now=Date.now(),dayMs=86400000;const days=n=>new Set(ev.filter(x=>now-x.at<n*dayMs).map(x=>x.day)).size;const count=n=>ev.filter(x=>now-x.at<n*dayMs).length;openDialog('Моя активность',`<div class="today-v51-analytics-grid"><article><small>Событий за 1 день</small><b>${count(1)}</b></article><article><small>Активные дни за 7 дней</small><b>${days(7)}/7</b></article><article><small>Активные дни за 30 дней</small><b>${days(30)}/30</b></article><article><small>Записей на устройстве</small><b>${ev.length}</b></article></div><p class="today-v51-note">Это приватная аналитика браузера, не общая статистика пользователей TODAY. Содержимое переписки и токены не записываются.</p><div class="today-v51-button-row"><button type="button" data-v51-action="analytics-export" class="today-v51-primary">Экспорт JSON</button><button type="button" data-v51-action="analytics-clear">Удалить локальную статистику</button></div>`);}
 function questionView(){const q=dailyQuestion();if(q){q.scrollIntoView({behavior:'smooth',block:'center'});q.classList.add('today-v51-focus');setTimeout(()=>q.classList.remove('today-v51-focus'),1800);logLocal('question_open');}else{openDialog('Вопрос дня','<p>Рубрика вопроса сейчас не загружена. Обнови ленту и попробуй ещё раз.</p>')}}
 function challengeView(){const id=challengeId();openDialog('Ежедневное испытание',`<div class="today-v51-challenge-card"><div class="today-v51-challenge-mark">✦</div><small>ИСПЫТАНИЕ · ${esc(dateMoscow())}</small><h4>Crystal Chronicles · уровень ${id}</h4><p>Сегодня всем предлагается одинаковая цель уровня. В самой игре игровое поле пока генерируется игровым движком; общий фиксированный расклад и публичный серверный рейтинг потребуют отдельной поддержки в игре.</p><button type="button" data-v51-action="challenge-open" class="today-v51-primary">Открыть игровой центр →</button><button type="button" data-v51-action="challenge-copy">Скопировать вызов другу</button></div>`);logLocal('daily_challenge_open',id)}
 bar.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const action=b.dataset.v51Action;if(b.matches('[data-v51-close]')){dialog.hidden=true;return}if(b.matches('[data-v51-qstep]')){const key=b.dataset.v51Qstep,st=questionState();st[key]=!st[key];localSet(questionKey,st);logLocal('question_step',key);renderQuestionTrack();return}if(b.matches('[data-v51-draft-save]')){const input=$('#v51DraftText'),text=(input?.value||'').trim();if(!text)return toast('Сначала напиши текст черновика.');const arr=localGet(draftsKey,[]);arr.unshift({id:Date.now().toString(36),at:Date.now(),day:dateMoscow(),text});localSet(draftsKey,arr.slice(0,100));countDrafts();logLocal('draft_save');draftsView();toast('Черновик сохранён на этом устройстве.');return}if(b.dataset.v51DraftCopy!==undefined){const d=localGet(draftsKey,[])[Number(b.dataset.v51DraftCopy)];if(d){try{await navigator.clipboard.writeText(d.text);toast('Текст скопирован.')}catch{openDialog('Черновик',`<textarea class="today-v51-textarea" readonly>${esc(d.text)}</textarea>`);}}return}if(b.dataset.v51DraftDelete!==undefined){const arr=localGet(draftsKey,[]);arr.splice(Number(b.dataset.v51DraftDelete),1);localSet(draftsKey,arr);countDrafts();draftsView();return}if(action==='question')return renderQuestionTrack()||questionView();if(action==='open-question')return questionView();if(action==='challenge')return challengeView();if(action==='drafts')return draftsView();if(action==='status')return statusView();if(action==='status-refresh')return statusView();if(action==='challenge-open'){if(window.TODAY_SOCIAL?.openMiniGames)window.TODAY_SOCIAL.openMiniGames();else toast('Сначала открой раздел «ИГРЫ»');return}if(action==='challenge-copy'){const text=`Твой вызов TODAY: пройди Crystal Chronicles, испытание ${challengeId()}! ${location.origin}${location.pathname}`;try{await navigator.clipboard.writeText(text);toast('Вызов скопирован.')}catch{openDialog('Вызов',`<textarea class="today-v51-textarea" readonly>${esc(text)}</textarea>`)}return}if(action==='drafts-export'){const arr=localGet(draftsKey,[]);download('today-drafts-'+dateMoscow()+'.json',JSON.stringify(arr,null,2));return}if(action==='analytics')return analyticsView();if(action==='analytics-export'){download('today-activity-'+dateMoscow()+'.json',JSON.stringify(localGet('today-v51-private-events',[]),null,2));return}if(action==='analytics-clear'){if(confirm('Удалить личную статистику этого браузера?')){localSet('today-v51-private-events',[]);analyticsView()}return}});
 const queueObserver=new MutationObserver(()=>attachPostTools());queueObserver.observe(document.body,{childList:true,subtree:true});attachPostTools();logLocal('open_home');
}
function attachPostTools(){
 if(document.body.dataset.v51PostObserverBusy==='1')return;document.body.dataset.v51PostObserverBusy='1';
 try{$$('#communityFeed .today-post-card,#communityFeed .community-card,#communityFeed article').forEach(card=>{
  const actions=$('.today-post-actions',card)||card.querySelector('.community-copy')||card;
  if(!actions.querySelector(':scope > [data-v51-translate]')){const b=document.createElement('button');b.type='button';b.className='today-v51-post-tool';b.dataset.v51Translate='1';b.textContent='Перевести';actions.appendChild(b)}
  if(!actions.querySelector(':scope > [data-v51-thread-open]')){const b=document.createElement('button');b.type='button';b.className='today-v51-post-tool';b.dataset.v51ThreadOpen='1';b.textContent='Ответить';actions.appendChild(b)}
 });}finally{document.body.dataset.v51PostObserverBusy='0'}
}
function download(name,data){const u=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
function threadBox(card){let node=$('.today-v51-threadbox',card);if(node){node.remove();return}const key=String(card.dataset.likeId||card.dataset.postId||card.querySelector('[data-like-id]')?.dataset.likeId||card.querySelector('.today-post-name')?.textContent||'post');node=document.createElement('div');node.className='today-v51-threadbox';node.innerHTML=`<label>Ответ к публикации<textarea maxlength="3000" placeholder="Сформулируй ответ…"></textarea></label><div class="today-v51-button-row"><button type="button" data-v51-thread-save class="today-v51-primary">Сохранить черновик ответа</button><button type="button" data-v51-thread-copy>Копировать</button></div><small>Ветка ответов сохранится локально. Публичная синхронизация комментариев требует серверного API.</small>`;node.dataset.threadKey=key;(card.querySelector('.community-copy')||card).appendChild(node);}
document.addEventListener('click',async e=>{
 const tr=e.target.closest('[data-v51-translate]');if(tr){e.preventDefault();const card=tr.closest('.today-post-card,.community-card,article');const text=(card?.querySelector('.today-post-text,.community-copy p')?.innerText||card?.innerText||'').trim().slice(0,4500);if(!text)return toast('Не найден текст для перевода.');logLocal('translate');window.open('https://translate.google.com/?sl=auto&tl=ru&text='+encodeURIComponent(text)+'&op=translate','_blank','noopener,noreferrer');return}
 const th=e.target.closest('[data-v51-thread-open]');if(th){e.preventDefault();threadBox(th.closest('.today-post-card,.community-card,article'));return}
 const saveThread=e.target.closest('[data-v51-thread-save]');if(saveThread){const box=saveThread.closest('.today-v51-threadbox'),text=$('textarea',box)?.value.trim();if(!text)return toast('Ответ пустой.');const key='today-v51-thread-drafts';const list=localGet(key,[]);list.unshift({at:Date.now(),day:dateMoscow(),key:box.dataset.threadKey,text});localSet(key,list.slice(0,200));logLocal('thread_draft');toast('Черновик ответа сохранён на этом устройстве.');return}
 const copyThread=e.target.closest('[data-v51-thread-copy]');if(copyThread){const box=copyThread.closest('.today-v51-threadbox'),text=$('textarea',box)?.value||'';if(!text)return toast('Сначала напиши ответ.');try{await navigator.clipboard.writeText(text);toast('Ответ скопирован.')}catch{const input=$('textarea',box);input?.focus();input?.select();toast('Выдели текст и скопируй его.')}return}
},true);
/* TODAY PROFILE WALL V62 BEGIN */
function bootProfilePage(){
 const C=window.TODAY_CONFIG||{};const root=$('#todayProfilePage');const toastNode=$('#todayProfileToast');const esc2=esc;
 const showToast=m=>{if(toastNode){toastNode.textContent=m;toastNode.hidden=false;clearTimeout(showToast.t);showToast.t=setTimeout(()=>toastNode.hidden=true,3200)}else alert(m)};
 if(!window.supabase||!C.supabaseUrl||!C.supabaseKey){root.innerHTML='<div class="today-profile-error">Не удалось подключить аккаунт TODAY. Проверь config.js.</div>';return}
 const sb=window.supabase.createClient(C.supabaseUrl,C.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const profileKey=(id)=>'today-v51-profile-local-'+id;
 const moscowToday=dateMoscow;
 let currentSession=null,currentProfile=null,currentPosts=[],currentProfilePosts=[],currentItems=[],currentOwned=[],activeTab='posts';
 const kindLabels={question:'Вопрос дня',game:'Игра дня',song:'Песня',mystery:'Тайна дня',challenge:'Челлендж',debate:'Спор дня',duel:'Дуэль мнений',story:'История дня',fact:'Факт',trend:'Тренд',moment:'Момент',footprint:'След'};
 const signedOut=()=>{root.innerHTML=`<section class="today-profile-login"><div class="today-profile-login-mark">✦</div><small>ЛИЧНАЯ СТРАНИЦА TODAY</small><h1>Твоя страница ждёт тебя</h1><p>Войди в аккаунт, чтобы открыть профиль, публикации, коллекцию и достижения.</p><form id="todayProfileLoginForm"><label>Электронная почта<input id="todayProfileEmail" type="email" autocomplete="email" required placeholder="you@example.com"></label><label>Пароль<input id="todayProfilePassword" type="password" autocomplete="current-password" minlength="6" required placeholder="Минимум 6 символов"></label><div class="today-profile-actions"><button class="today-profile-primary" type="submit">Войти</button><button class="today-profile-secondary" type="button" id="todayProfileSignup">Создать аккаунт</button></div><p id="todayProfileAuthMessage" class="today-profile-note"></p></form></section>`;
 const form=$('#todayProfileLoginForm');form.addEventListener('submit',async e=>{e.preventDefault();const msg=$('#todayProfileAuthMessage');msg.textContent='Выполняю вход…';const {error}=await sb.auth.signInWithPassword({email:$('#todayProfileEmail').value.trim(),password:$('#todayProfilePassword').value});if(error)msg.textContent=error.message;else await loadPage()});$('#todayProfileSignup').addEventListener('click',async()=>{const msg=$('#todayProfileAuthMessage');msg.textContent='Создаю аккаунт…';const {data,error}=await sb.auth.signUp({email:$('#todayProfileEmail').value.trim(),password:$('#todayProfilePassword').value});if(error)msg.textContent=error.message;else msg.textContent=data.session?'Аккаунт создан. Загружаю профиль…':'Аккаунт создан. Если включено подтверждение, подтверди почту и затем войди.';if(data.session)await loadPage()});};
 /* TODAY PROFILE LAYOUT V63 BEGIN */
function renderShell(){
 const p=currentProfile||{},name=p.display_name||p.username||currentSession.user.email?.split('@')[0]||'Участник TODAY';
 const local=localGet(profileKey(currentSession.user.id),{bio:'',interests:['TODAY','Общение','Игры']});
 const username=p.username||'today';
 const avatar=p.avatar_url?`<img src="${esc2(p.avatar_url)}" alt="Фото профиля ${esc2(name)}">`:esc2(p.avatar_emoji||'✦');
 root.innerHTML=`<section class="today-profile-layout today-profile-layout-v63">
  <header class="today-profile-v63-identity">
   <button type="button" class="today-profile-v63-avatar ${p.avatar_url?'has-photo':''}" data-profile-action="edit" aria-label="Изменить фотографию профиля" title="Нажми, чтобы изменить фото">${avatar}<span class="today-profile-v63-avatar-edit" aria-hidden="true">✎</span></button>
   <small class="today-profile-v63-eyebrow">TODAY · ЛИЧНАЯ СТРАНИЦА</small>
   <h1>${esc2(name)}</h1>
   <p class="today-profile-v63-username">@${esc2(username)}</p>
   <div class="today-profile-v81-intro">
    <p>${esc2(String(local.bio||'Собери здесь свою историю. Это пространство остаётся с тобой.'))}</p>
    <div class="today-profile-v81-interest-tags">${(Array.isArray(local.interests)?local.interests:[]).map(tag=>String(tag||'').trim()).filter(Boolean).slice(0,5).map(tag=>`<span>${esc2(tag)}</span>`).join('')}</div>
    <div class="today-profile-v81-hero-actions">
     <button type="button" data-profile-action="edit">Настроить страницу</button>
     <button type="button" data-v81-copy-username data-v81-username="${esc2(username)}">Копировать ник ↗</button>
    </div>
   </div>
  </header>
  <section class="today-profile-v81-stats" aria-label="Статистика аккаунта">
   <article><small>УРОВЕНЬ</small><b>${Math.max(1,Number(p.level||1))}</b><span>Твой путь в TODAY</span></article>
   <article><small>ОПЫТ</small><b>${Math.max(0,Number(p.score_total||0)).toLocaleString('ru-RU')}</b><span>XP накоплено</span></article>
   <article><small>СЕРИЯ</small><b>${Math.max(0,Number(p.streak||0))}</b><span>дней подряд</span></article>
   <article><small>МОНЕТЫ</small><b>${Math.max(0,Number(p.coins||0)).toLocaleString('ru-RU')}</b><span>баланс аккаунта</span></article>
   <article><small>ЗАПИСИ</small><b>${currentProfilePosts.length}</b><span>личная стена</span></article>
  </section>
  <nav class="today-profile-v63-tabs" aria-label="Разделы личной страницы">
   ${[['posts','⌂','Моя стена'],['daily','◷','Сегодня'],['videos','▣','Мои видео'],['music','♫','Моя музыка'],['messages','▤','Мои сообщения']].map(([id,icon,label])=>`<button type="button" data-profile-tab="${id}" class="${activeTab===id?'active':''}" aria-pressed="${activeTab===id?'true':'false'}"><span aria-hidden="true">${icon}</span><b>${label}</b></button>`).join('')}
  </nav>
  <div id="todayProfileEdit" class="today-profile-edit" hidden><div class="today-profile-panel-head"><div><small>НАСТРОЙКИ ПРОФИЛЯ</small><h3>Покажи себя</h3></div><button type="button" data-profile-action="close-edit" aria-label="Закрыть">×</button></div><form id="todayProfileEditForm"><label>Отображаемое имя<input id="todayProfileNickname" required maxlength="32" value="${esc2(name)}" placeholder="Твой ник"></label><label class="today-profile-file">Фото профиля<input id="todayProfileAvatarFile" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG или WebP. Файл отправляется через защищённый user-write endpoint.</small></label><label>Интересы через запятую<input id="todayProfileInterests" maxlength="220" value="${esc2((local.interests||[]).join(', '))}" placeholder="Игры, музыка, кино"></label><label>Короткая подпись<textarea id="todayProfileBio" maxlength="180" placeholder="Что стоит знать о тебе?">${esc2(local.bio||'')}</textarea><small>Подпись хранится локально в этом браузере — это не поле базы аккаунта.</small></label><div class="today-profile-actions"><button type="submit" class="today-profile-primary">Сохранить профиль</button><button type="button" class="today-profile-secondary" data-profile-action="close-edit">Отмена</button></div><p id="todayProfileSaveMessage" class="today-profile-note"></p></form></div>
  <section id="todayProfileTabContent" class="today-profile-tab-content today-profile-v63-content">${renderTab()}</section>
  <nav class="today-profile-v63-more" aria-label="Дополнительные настройки профиля"><span>Профиль и аккаунт</span><button type="button" data-profile-tab="collection">Коллекция</button><button type="button" data-profile-tab="achievements">Достижения</button><button type="button" data-profile-tab="security">Безопасность</button><button type="button" data-profile-action="edit">Редактировать профиль</button></nav>
  <footer class="today-profile-footer"><span>Профиль TODAY · ${esc2(moscowToday())}</span><div><a href="./index.html">На главную TODAY</a><button type="button" data-profile-action="signout">Выйти</button></div></footer>
 </section>`;
 wireProfileShell();
}
function renderTab(){
 if(activeTab==='videos')return `<div class="today-profile-panel today-profile-v63-panel"><button type="button" class="today-profile-v63-back" data-profile-tab="posts">← Моя стена</button><div class="today-profile-v63-empty"><span class="today-profile-v63-empty-icon" aria-hidden="true">▶</span><small>ЛИЧНЫЙ РАЗДЕЛ</small><h2>Мои видео</h2><p>Здесь будут собраны видео из твоего профиля. Пока видеопубликации не подключены к хранилищу TODAY; записи и фотографии уже можно размещать на стене.</p><button type="button" class="today-profile-primary" data-profile-tab="posts">Создать запись на стене</button></div></div>`;
 if(activeTab==='music'){const songs=currentPosts.filter(p=>p.kind==='song'&&/^https?:\/\//i.test(String(p.body||'')));return `<div class="today-profile-panel today-profile-v63-panel"><button type="button" class="today-profile-v63-back" data-profile-tab="posts">← Моя стена</button><div class="today-profile-v63-section-head"><div><small>МУЗЫКАЛЬНЫЕ ПУБЛИКАЦИИ</small><h2>Моя музыка</h2><p>Песни, которыми ты поделился в сегодняшней ленте TODAY.</p></div><span aria-hidden="true">♫</span></div>${songs.length?`<div class="today-profile-v63-music-list">${songs.map(p=>`<article><span aria-hidden="true">♫</span><div><b>Музыкальная публикация</b><small>Добавлена сегодня · ссылка открывается отдельно</small></div><a href="${esc2(String(p.body))}" target="_blank" rel="noopener noreferrer">Слушать ↗</a></article>`).join('')}</div>`:'<div class="today-profile-v63-empty"><span class="today-profile-v63-empty-icon" aria-hidden="true">♫</span><h3>Пока без музыкальных ссылок</h3><p>Твои музыкальные публикации за сегодняшний день появятся здесь. Дневная лента TODAY обновляется каждый день.</p></div>'}</div>`;}
 if(activeTab==='messages')return `<div class="today-profile-panel today-profile-v63-panel"><button type="button" class="today-profile-v63-back" data-profile-tab="posts">← Моя стена</button><div class="today-profile-v63-empty"><span class="today-profile-v63-empty-icon" aria-hidden="true">▤</span><small>ЛИЧНОЕ ОБЩЕНИЕ</small><h2>Мои сообщения</h2><p>Здесь должен располагаться список личных диалогов. Серверный модуль переписки в текущей версии сайта не обнаружен, поэтому раздел не показывает выдуманные сообщения.</p></div></div>`;
if(activeTab==='collection')return `<div class="today-profile-panel"><div class="today-profile-panel-head"><div><small>ВИЗУАЛЬНАЯ КОЛЛЕКЦИЯ</small><h3>Твои предметы</h3></div><b>${currentOwned.length}</b></div><p class="today-profile-note">Здесь показаны предметы, которые сейчас есть в аккаунте. Даты прошлых покупок не выводятся, поскольку существующий клиентский контракт их не предоставляет.</p>${currentOwned.length?`<div class="today-profile-collection">${currentOwned.map(o=>{const item=currentItems.find(x=>String(x.id)===String(o.item_id));return `<article><div class="today-profile-item-icon">${esc2(item?.icon||'✦')}</div><div><b>${esc2(item?.title||String(o.item_id))}</b><small>${esc2(item?.description||'Предмет коллекции TODAY')}</small><span class="${o.equipped?'is-equipped':''}">${o.equipped?'АКТИВЕН':'В КОЛЛЕКЦИИ'}</span></div></article>`}).join('')}</div>`:'<div class="today-profile-empty"><b>Коллекция пока пуста</b><p>Загляни в магазин и выбери первое оформление.</p><a href="./index.html?open=shop" class="today-profile-primary">Открыть магазин</a></div>'}<div class="today-profile-panel-actions"><a href="./index.html?open=shop" class="today-profile-secondary">Открыть магазин</a></div></div>`;
 if(activeTab==='achievements'){const p=currentProfile||{},total=Number(p.score_total||0),streak=Number(p.streak||0),n=currentPosts.length;const achievements=[['✦','Первый след','Ты открыл свою страницу TODAY.',true],['✍','Автор дня','Есть публикация за сегодня.',n>0],['⚡','Серия','Заходи несколько дней подряд.',streak>=5],['◈','Путь хранителя','Набрано 1 000 XP.',total>=1000],['♕','Коллекционер','В коллекции есть предмет.',currentOwned.length>0]];return `<div class="today-profile-panel"><div class="today-profile-panel-head"><div><small>ТВОЙ ПУТЬ</small><h3>Достижения</h3></div><b>${achievements.filter(x=>x[3]).length}/${achievements.length}</b></div><div class="today-profile-achievements">${achievements.map(([icon,title,desc,earned])=>`<article class="${earned?'earned':''}"><span>${icon}</span><div><b>${title}</b><p>${desc}</p></div><small>${earned?'ОТКРЫТО':'ВПЕРЕДИ'}</small></article>`).join('')}</div><p class="today-profile-note">Эти значки вычисляются из доступных данных профиля и не записываются как отдельные серверные награды.</p></div>`}
 if(activeTab==='security')return `<div class="today-profile-panel"><div class="today-profile-panel-head"><div><small>КОНТРОЛЬ АККАУНТА</small><h3>Безопасность и устройства</h3></div><span class="today-profile-shield">⌑</span></div><p>Текущая сессия защищена Supabase Auth. Можно завершить другие сессии, если API проекта поддерживает этот запрос.</p><div class="today-profile-security-row"><div><b>Другие устройства</b><small>Выход из других сессий не затрагивает эту сессию.</small></div><button type="button" class="today-profile-secondary" data-profile-action="signout-others">Завершить другие сессии</button></div><div class="today-profile-security-row"><div><b>Все устройства</b><small>Завершит также текущий вход.</small></div><button type="button" class="today-profile-danger" data-profile-action="signout-all">Выйти везде</button></div><div class="today-profile-security-row"><div><b>Статус приложения</b><small>Проверка связи и основных ресурсов.</small></div><button type="button" class="today-profile-secondary" data-profile-action="status">Проверить TODAY</button></div><div id="todayProfileSecurityMessage" class="today-profile-note"></div></div>`;
 if(activeTab==='daily'){const list=currentPosts;return `<div class="today-profile-panel"><div class="today-profile-panel-head"><div><small>ДНЕВНАЯ ЛЕНТА</small><h3>Публикации дня</h3></div><b>${list.length}</b></div><p class="today-profile-note">Это публикации, отправленные в дневные рубрики TODAY. Они отдельно от личной стены и живут по правилам дневной ленты.</p>${list.length?`<div class="today-profile-posts">${list.map(p=>`<article class="today-profile-post"><div class="today-profile-post-head"><span>${esc2(kindLabels[p.kind]||p.kind||'Публикация')}</span><small>${esc2(new Date(p.created_at||Date.now()).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))}</small></div>${p.body?`<p>${esc2(p.body)}</p>`:''}${p.image_url?`<img src="${esc2(p.image_url)}" alt="Фото к публикации" loading="lazy">`:''}</article>`).join('')}</div>`:'<div class="today-profile-empty"><div>◷</div><b>Дневных публикаций пока нет</b><p>Личные посты создаются во вкладке «Моя стена» и не отправляются в главную ленту.</p></div>'}</div>`;}
 const list=currentProfilePosts;return `<div class="today-profile-panel today-profile-wall-v62 today-profile-wall-v63"><div class="today-profile-v63-create-head"><small>ТВОЯ ЛИЧНАЯ СТРАНИЦА</small><h2>Создать запись</h2><p>Поделись событием, мыслью или фотографией.</p></div><form id="todayProfilePostForm" class="today-profile-post-composer"><label for="todayProfilePostBody">Что хочешь рассказать?</label><textarea id="todayProfilePostBody" name="body" maxlength="5000" rows="4" placeholder="Поделись мыслью, историей или событием…"></textarea><div class="today-profile-post-compose-bottom"><label class="today-profile-post-file"><span aria-hidden="true">▧</span><span>Добавить фото</span><input id="todayProfilePostImage" type="file" accept="image/jpeg,image/png,image/webp"></label><small>До 5 000 символов · фото до 15 МБ</small></div><p id="todayProfilePostMessage" class="today-profile-note" aria-live="polite"></p><button type="submit" class="today-profile-primary today-profile-publish">Опубликовать запись</button></form><div class="today-profile-v63-wall-title"><h2>Записи</h2><span>${list.length}</span></div>${list.length?`<div class="today-profile-wall-posts">${list.map(p=>`<article class="today-profile-post today-profile-wall-post" data-profile-post-id="${esc2(p.id)}"><div class="today-profile-post-head"><span>МОЯ ПУБЛИКАЦИЯ</span><small>${esc2(new Date(p.created_at||Date.now()).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</small></div>${p.body?`<p>${esc2(p.body)}</p>`:''}${p.image_url?`<img src="${esc2(p.image_url)}" alt="Фото к личному посту" loading="lazy">`:''}<div class="today-profile-wall-post-footer"><small>Только твоя личная стена</small><button type="button" class="today-profile-post-delete" data-profile-action="delete-post" data-post-id="${esc2(p.id)}">Удалить</button></div></article>`).join('')}</div>`:'<div class="today-profile-empty today-profile-wall-empty"><div>✍</div><b>Пока нет записей</b><p>Твоя первая запись появится здесь и останется на личной странице, отдельно от дневной ленты.</p></div>'}</div>`;}
 function wireProfileShell(){
 if(root.dataset.v51Wired==='1')return;root.dataset.v51Wired='1';root.addEventListener('click',profileDelegated);root.addEventListener('submit',e=>{if(!e.target)return;if(e.target.id==='todayProfileEditForm')saveProfile(e);else if(e.target.id==='todayProfilePostForm')createProfilePost(e)},true);root.addEventListener('change',e=>{if(e.target&&e.target.id==='todayProfilePostImage'){const msg=$('#todayProfilePostMessage');if(msg)msg.textContent=e.target.files&&e.target.files[0]?`Выбрано фото: ${e.target.files[0].name}`:'';}},true);
 sb.auth.onAuthStateChange((_event,session)=>{currentSession=session;if(!session)signedOut()});
 }
 function profileDelegated(e){const b=e.target.closest('button');if(!b)return;if(b.dataset.profileTab){activeTab=b.dataset.profileTab;$('#todayProfileTabContent').innerHTML=renderTab();$$('[data-profile-tab]').forEach(x=>{x.classList.toggle('active',x===b);if(x.hasAttribute('aria-pressed'))x.setAttribute('aria-pressed',x===b?'true':'false')});return}const a=b.dataset.profileAction;if(a==='delete-post'){deleteProfilePost(b.dataset.postId);return}if(a==='edit'){const n=$('#todayProfileEdit');if(n)n.hidden=false;n?.scrollIntoView({behavior:'smooth',block:'center'});return}if(a==='close-edit'){const n=$('#todayProfileEdit');if(n)n.hidden=true;return}if(a==='signout'){sb.auth.signOut({scope:'local'}).then(()=>location.href='./index.html');return}if(a==='signout-others'){const n=$('#todayProfileSecurityMessage');n.textContent='Завершаю другие сессии…';sb.auth.signOut({scope:'others'}).then(({error})=>{n.textContent=error?`Не получилось завершить другие сессии: ${error.message}`:'Другие сессии завершены.'}).catch(err=>n.textContent=String(err.message||err));return}if(a==='signout-all'){if(confirm('Выйти из TODAY на всех устройствах?'))sb.auth.signOut({scope:'global'}).then(()=>location.href='./index.html');return}if(a==='status'){checkStatus();return}}
 async function profilePostImageBlob(file){
  if(!(file instanceof File)||!/^image\/(jpeg|png|webp)$/i.test(file.type))throw new Error('Выбери фото JPG, PNG или WebP.');
  if(file.size>15*1024*1024)throw new Error('Фото слишком большое: максимум 15 МБ.');
  let image=null;
  if(window.createImageBitmap){try{image=await createImageBitmap(file,{imageOrientation:'from-image'})}catch{}}
  if(!image){image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Не удалось прочитать фото.'));reader.onload=()=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Не удалось открыть фото.'));im.src=reader.result};reader.readAsDataURL(file)})}
  const w=Number(image.width||image.naturalWidth||0),h=Number(image.height||image.naturalHeight||0);if(!w||!h)throw new Error('У изображения не удалось определить размеры.');
  const scale=Math.min(1,1600/Math.max(w,h)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Не удалось подготовить изображение.');ctx.drawImage(image,0,0,canvas.width,canvas.height);if(typeof image.close==='function')try{image.close()}catch{}
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось сжать фото.')),'image/jpeg',.84));
 }
 async function createProfilePost(e){
  e.preventDefault();const form=e.target,msg=$('#todayProfilePostMessage'),button=form.querySelector('button[type="submit"]');const body=String($('#todayProfilePostBody')?.value||'').trim(),file=$('#todayProfilePostImage')?.files?.[0]||null;
  if(!currentSession?.user?.id){if(msg)msg.textContent='Сессия закончилась. Войди снова.';return}
  if(!body&&!file){if(msg)msg.textContent='Добавь текст или выбери фото.';return}
  if(body.length>5000){if(msg)msg.textContent='Максимум 5 000 символов.';return}
  if(button)button.disabled=true;if(msg)msg.textContent='Публикую на твоей странице…';let imagePath='',imageUrl='';
  try{
   if(file){try{const blob=await profilePostImageBlob(file);const uid=currentSession.user.id;const token=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2));imagePath=`${uid}/profile-posts/${token}.jpg`;const upload=await sb.storage.from('today-media-safe').upload(imagePath,blob,{contentType:'image/jpeg',cacheControl:'31536000',upsert:false});if(upload.error)throw upload.error;imageUrl=sb.storage.from('today-media-safe').getPublicUrl(imagePath).data.publicUrl||'';if(!imageUrl)throw new Error('Не удалось получить ссылку на фото.');}catch(imageError){if(imagePath)try{await sb.storage.from('today-media-safe').remove([imagePath])}catch{};imagePath='';imageUrl='';if(!body)throw new Error('Фото не загрузилось. Попробуй другой файл или добавь текст. '+String(imageError.message||imageError));if(msg)msg.textContent='Фото не загрузилось — публикую текст без фото…';showToast('Фото не загрузилось. Текст будет опубликован без фото.');}}
   const {data,error}=await sb.from('profile_posts').insert({user_id:currentSession.user.id,body,image_url:imageUrl||null,image_path:imagePath||null}).select('id,user_id,body,image_url,image_path,created_at,updated_at').single();
   if(error){if(imagePath)try{await sb.storage.from('today-media-safe').remove([imagePath])}catch{};throw error}
   currentProfilePosts=[data,...currentProfilePosts.filter(x=>String(x.id)!==String(data.id))];activeTab='posts';const content=$('#todayProfileTabContent');if(content)content.innerHTML=renderTab();$$('[data-profile-tab]').forEach(x=>x.classList.toggle('active',x.dataset.profileTab==='posts'));const count=$('.today-profile-stats article:first-child b');if(count)count.textContent=String(currentProfilePosts.length);logLocal('profile_post_created',data.id);showToast('Пост опубликован на твоей странице.');
  }catch(err){console.warn('TODAY profile wall post',err);if(msg)msg.textContent='Не удалось опубликовать: '+String(err.message||err).slice(0,250);}
  finally{if(button&&button.isConnected)button.disabled=false;}
 }
 async function deleteProfilePost(postId){
  const post=currentProfilePosts.find(x=>String(x.id)===String(postId));if(!post||!currentSession?.user?.id)return;if(!confirm('Удалить этот пост с личной страницы?'))return;
  try{const {error}=await sb.from('profile_posts').delete().eq('id',post.id).eq('user_id',currentSession.user.id);if(error)throw error;currentProfilePosts=currentProfilePosts.filter(x=>String(x.id)!==String(post.id));if(post.image_path)try{await sb.storage.from('today-media-safe').remove([post.image_path])}catch{};const content=$('#todayProfileTabContent');if(content)content.innerHTML=renderTab();const count=$('.today-profile-stats article:first-child b');if(count)count.textContent=String(currentProfilePosts.length);logLocal('profile_post_deleted',post.id);showToast('Пост удалён с личной страницы.');}catch(err){showToast('Не удалось удалить пост: '+String(err.message||err).slice(0,180));}
 }
 async function saveProfile(e){e.preventDefault();const msg=$('#todayProfileSaveMessage');const nickname=$('#todayProfileNickname')?.value.trim();if(!nickname){msg.textContent='Ник не может быть пустым.';return}const file=$('#todayProfileAvatarFile')?.files?.[0];try{msg.textContent='Сохраняю…';const fd=new FormData();fd.append('kind','profile');fd.append('nickname',nickname);if(file)fd.append('image',file,file.name);const session=(await sb.auth.getSession()).data.session;if(!session?.access_token){msg.textContent='Войди в аккаунт заново.';return}const response=await fetch(`${String(C.supabaseUrl).replace(/\/$/,'')}/functions/v1/user-write`,{method:'POST',headers:{apikey:C.supabaseKey,Authorization:`Bearer ${session.access_token}`},body:fd,cache:'no-store'});let data={};try{data=await response.json()}catch{}if(!response.ok||data.ok===false)throw new Error(data.message||data.detail||`HTTP ${response.status}`);currentProfile=data.profile||{...currentProfile,display_name:nickname};const local={bio:$('#todayProfileBio').value.trim(),interests:$('#todayProfileInterests').value.split(',').map(x=>x.trim()).filter(Boolean).slice(0,8)};localSet(profileKey(currentSession.user.id),local);await loadPage();showToast('Профиль сохранён.');}catch(err){msg.textContent='Не удалось сохранить: '+String(err.message||err)}}
 async function checkStatus(){const msg=$('#todayProfileSecurityMessage');if(msg)msg.textContent='Проверяю страницу, интерфейс и соединение…';const items=[['index.html','Основная страница'],['app.js','Основной интерфейс'],['social.js','Социальный слой'],['today-profile-page.js','Страница профиля']];const results=[];for(const [path,label] of items){try{const r=await fetch('./'+path+'?v='+VERSION,{cache:'no-store'});results.push([label,r.ok?'OK':'HTTP '+r.status,r.ok])}catch{results.push([label,'Недоступен',false])}}if(msg)msg.innerHTML=results.map(([n,v,ok])=>`<div>${esc2(n)}: <b class="${ok?'ok':'bad'}">${esc2(v)}</b></div>`).join('')+`<div>Соединение: <b>${navigator.onLine?'в сети':'нет сети'}</b></div>`;}

 async function loadPage(){
  const timed = (promise, milliseconds, label) => {
   let timer;
   const timeout = new Promise((_, reject) => {
    timer = setTimeout(
     () => reject(new Error(label + ': превышено время ожидания (' + Math.round(milliseconds/1000) + ' сек.)')),
     milliseconds
    );
   });

   return Promise.race([
    Promise.resolve(promise),
    timeout
   ]).finally(() => clearTimeout(timer));
  };

  const sessionResult = await timed(
   sb.auth.getSession(),
   10000,
   'Не удалось восстановить сессию Supabase'
  );

  currentSession = sessionResult?.data?.session || null;

  if(!currentSession){
   signedOut();
   return;
  }

  root.innerHTML='<div class="today-profile-loading"><div class="today-profile-spinner"></div><b>Собираем твою страницу…</b><p>Загружаем доступные данные TODAY.</p></div>';

  const day = moscowToday();

  const safeQuery = async (query, label) => {
   try {
    return await timed(query, 8000, label);
   } catch(error) {
    console.warn('[TODAY profile] Query timeout/error:', label, error);
    return {data: null, error};
   }
  };

  const [profile, posts, profilePosts, owned, items] = await Promise.all([
   safeQuery(
    sb.from('profiles')
     .select('id,display_name,username,avatar_emoji,avatar_url,streak,last_seen_date,coins,last_reward_date,score_total,level')
     .eq('id',currentSession.user.id)
     .maybeSingle(),
    'Профиль аккаунта'
   ),

   safeQuery(
    sb.from('today_publications')
     .select('id,user_id,kind,body,image_url,created_at,day_date')
     .eq('user_id',currentSession.user.id)
     .eq('day_date',day)
     .order('created_at',{ascending:false})
     .limit(40),
    'Публикации дня'
   ),

   safeQuery(
    sb.from('profile_posts')
     .select('id,user_id,body,image_url,image_path,created_at,updated_at')
     .eq('user_id',currentSession.user.id)
     .order('created_at',{ascending:false})
     .limit(100),
    'Личная стена'
   ),

   safeQuery(
    sb.from('user_shop_items')
     .select('item_id,equipped')
     .eq('user_id',currentSession.user.id),
    'Предметы аккаунта'
   ),

   safeQuery(
    sb.from('shop_items')
     .select('id,title,description,price_coins,icon,type,css_class,active')
     .order('price_coins',{ascending:true}),
    'Магазин'
   )
  ]);

  currentProfile = profile.data || {
   display_name: currentSession.user.email?.split('@')[0] || 'Участник TODAY',
   username: 'today',
   level: 1,
   score_total: 0,
   streak: 0,
   coins: 0,
   avatar_emoji: '✦'
  };

  currentPosts = posts.error ? [] : (posts.data || []);
  currentProfilePosts = profilePosts.error ? [] : (profilePosts.data || []);
  currentOwned = owned.error
   ? []
   : (owned.data || []).filter(x => String(x.item_id) !== 'rainbow-trace');
  currentItems = items.error ? [] : (items.data || []);

  // Главная цель — показать интерфейс даже при частичных проблемах БД.
  renderShell();

  const failed = [
   profile.error && 'профиль аккаунта',
   posts.error && 'публикации дня',
   profilePosts.error && 'личная стена',
   owned.error && 'коллекция',
   items.error && 'магазин'
  ].filter(Boolean);

  if(failed.length){
   showToast('Профиль открыт частично. Не загрузились: ' + failed.join(', ') + '.');
  }
 }

 loadPage().catch(err=>{root.innerHTML=`<div class="today-profile-error"><h2>Не удалось открыть профиль</h2><p>${esc2(err.message||String(err))}</p><button type="button" class="today-profile-primary" id="todayProfileRetry">Повторить</button></div>`;$('#todayProfileRetry')?.addEventListener('click',()=>loadPage().catch(()=>{}))});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{installProfileNavigation();makeTools()},{once:true});else{installProfileNavigation();makeTools()}
})();

/* TODAY PROFILE WALL V62 END */
