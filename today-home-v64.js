/* TODAY HOME V64 — unified premium home layer. Existing modules remain the source of truth. */
(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
let overlay=null, searchResults=[], activeFilter='all', homeObserver=null;
const contentKinds={
  songs:{label:'Песни',match:['песн']},stories:{label:'Истории',match:['истор']},facts:{label:'Факты',match:['факт']},
  trends:{label:'Тренды',match:['тренд']},moments:{label:'Моменты',match:['момент']},footprints:{label:'Следы',match:['след']},
  questions:{label:'Вопросы',match:['вопрос','дуэль','спор','челлендж']}
};
function closeOverlay(){if(overlay){overlay.remove();overlay=null;}document.body.classList.remove('today-v64-overlay-open');}
function overlayShell(kind,title,subtitle,body){
 closeOverlay();const node=document.createElement('div');node.className='today-v64-overlay';node.dataset.v64Overlay=kind;
 node.innerHTML=`<div class="today-v64-overlay-backdrop" data-v64-close></div><section class="today-v64-dialog" role="dialog" aria-modal="true" aria-labelledby="todayV64DialogTitle"><header class="today-v64-dialog-head"><div><span class="today-v64-eyebrow">TODAY · ТВОЁ ПРОСТРАНСТВО</span><h2 id="todayV64DialogTitle">${esc(title)}</h2><p>${esc(subtitle||'')}</p></div><button class="today-v64-close" type="button" data-v64-close aria-label="Закрыть">×</button></header><div class="today-v64-dialog-body">${body}</div></section>`;
 document.body.append(node);overlay=node;document.body.classList.add('today-v64-overlay-open');node.querySelector('.today-v64-dialog')?.focus({preventScroll:true});return node;
}
function toast(message){const t=$('#toast');if(t){t.textContent=message;t.classList.add('show');window.setTimeout(()=>t.classList.remove('show'),2600)}else console.info('[TODAY V64]',message)}
function showSearch(){
 const body=`<form class="today-v64-search-form" id="todayV64SearchForm"><label for="todayV64Query">Что ищем в TODAY?</label><div class="today-v64-search-field"><span aria-hidden="true">⌕</span><input id="todayV64Query" name="query" type="search" maxlength="100" autocomplete="off" placeholder="Песня, история, факт или тема…" required><button type="submit">Найти</button></div><div class="today-v64-search-hint">Сначала ищем в доступной ленте сегодняшнего дня. Для поиска людей есть отдельный переход.</div><div class="today-v64-search-people"><button type="button" class="today-v64-secondary" data-v64-search-people>Найти людей по имени или никнейму ↗</button></div></form><div id="todayV64SearchResults" class="today-v64-search-results"><div class="today-v64-empty">Начни вводить запрос — найду совпадения в загруженных публикациях и рубриках.</div></div>`;
 const node=overlayShell('search','Поиск по TODAY','Находи сегодняшние публикации и переходи к нужным разделам.',body);
 const input=$('#todayV64Query',node);input?.focus({preventScroll:true});
}
function searchContent(query){
 const q=query.trim().toLocaleLowerCase('ru');if(q.length<2)return [];
 const roots=['#dailyGrid .daily-card','#communityFeed .community-card','#todayPromotedList .ts-promoted-card'];const nodes=[];
 roots.forEach(sel=>$$ (sel).forEach(n=>{if(!nodes.includes(n))nodes.push(n)}));
 return nodes.map(node=>({node,text:(node.innerText||node.textContent||'').replace(/\s+/g,' ').trim()})).filter(x=>x.text.toLocaleLowerCase('ru').includes(q)).slice(0,30);
}
function renderSearchResults(query){
 const host=$('#todayV64SearchResults');if(!host)return;searchResults=searchContent(query);
 if(!searchResults.length){host.innerHTML=`<div class="today-v64-empty"><b>Совпадений пока нет</b><span>Попробуй другое слово или поищи участника по имени.</span></div>`;return;}
 host.innerHTML=`<div class="today-v64-results-caption">Найдено: ${searchResults.length}</div>${searchResults.map((r,i)=>`<button type="button" class="today-v64-result" data-v64-result-index="${i}"><span class="today-v64-result-icon">${r.node.matches('.daily-card')?'◈':r.node.matches('.ts-promoted-card')?'✦':'◎'}</span><span><b>${esc(r.text.slice(0,94))}${r.text.length>94?'…':''}</b><small>${r.node.matches('.daily-card')?'Рубрика дня':r.node.matches('.ts-promoted-card')?'След сообщества':'Публикация дня'}</small></span><span class="today-v64-result-arrow">↗</span></button>`).join('')}`;
}
function showActivity(){
 const daily=$$('#dailyGrid .daily-card').length,posts=$$('#communityFeed .community-card').length;
 const notificationsAvailable='Notification'in window;
 const permission=!notificationsAvailable?'Не поддерживается':Notification.permission==='granted'?'Разрешены':Notification.permission==='denied'?'Запрещены в браузере':'Не подключены';
 const notificationButtonLabel=!notificationsAvailable?'Недоступно':Notification.permission==='granted'?'Проверить статус':'Подключить';
 const body=`<div class="today-v64-activity-stats"><article><span>Рубрики</span><b>${daily}/12</b></article><article><span>Публикации дня</span><b>${posts}</b></article><article><span>До полуночи</span><b>${esc($('#countdown')?.textContent||'--:--:--')}</b></article></div><div class="today-v64-activity-section"><div class="today-v64-section-label">БЫСТРЫЕ ПЕРЕХОДЫ</div><div class="today-v64-shortcuts"><button data-v64-go="chats"><span>◌</span><b>Сообщения</b><small>Личные и групповые диалоги</small></button><button data-v64-go="friends"><span>♧</span><b>Друзья</b><small>Заявки и поиск людей</small></button><button data-v64-go="channels"><span>▤</span><b>Каналы</b><small>Тематические пространства</small></button><button data-v64-go="games"><span>✧</span><b>Мини-игры</b><small>Продолжить игру TODAY</small></button><button data-v64-go="rank"><span>♜</span><b>TOP дня</b><small>Рейтинг сегодняшнего дня</small></button><button data-v64-go="settings"><span>⌑</span><b>Приватность</b><small>Управление безопасностью</small></button></div></div><div class="today-v64-notification-setting"><div><b>Уведомления браузера</b><p>Разрешение браузера — отдельная настройка. Персональная история уведомлений появится после подключения серверного центра активности.</p><small>Текущий статус: ${esc(permission)}</small></div><button type="button" class="today-v64-primary" data-v64-browser-notify>${notificationButtonLabel}</button></div>`;
 overlayShell('activity','Центр активности','Быстрые разделы и состояние сегодняшней ленты.',body);
}
function showCreateChoices(){
 const body=`<div class="today-v64-create-grid"><button data-v64-create="wall"><span>✍</span><b>Запись на стене</b><small>Останется в твоём профиле</small></button><button data-v64-create="day"><span>◈</span><b>Публикация дня</b><small>Выбери рубрику сегодняшней ленты</small></button><button data-v64-create="story"><span>◉</span><b>История</b><small>Короткий формат на время</small></button></div><p class="today-v64-create-note">Перед публикацией TODAY покажет, где останется контент: в дневной ленте, в истории или на личной стене.</p>`;
 overlayShell('create','Создать в TODAY','Выбери формат публикации.',body);
}
function goSocial(action,argument){closeOverlay();const api=window.TODAY_SOCIAL;if(!api){toast('Социальные разделы ещё загружаются. Обнови страницу.');return;}
 const map={chats:'openChats',friends:'openFriends',channels:'openChannels',games:'openMiniGames',settings:'openSettings',searchPeople:'openSearchUsers',profile:'openProfile',story:'openOwnStoryComposer'};
 const method=map[action];if(method&&typeof api[method]==='function'){Promise.resolve(api[method](argument)).catch(e=>toast('Не удалось открыть раздел: '+String(e?.message||e).slice(0,120)));return;}
 toast('Этот раздел сейчас недоступен. Попробуй обновить страницу.');
}
function openStories(){goSocial('story');}
function addHeaderButtons(){
 const top=$('.top-actions');if(!top)return;
 if(!$('#todayHomeSearch')){const b=document.createElement('button');b.type='button';b.id='todayHomeSearch';b.className='today-v64-icon-btn';b.title='Поиск по TODAY';b.setAttribute('aria-label','Поиск по TODAY');b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m15.5 15.5 5 5"></path></svg>';b.addEventListener('click',showSearch);const coin=$('#coinBadge',top);top.insertBefore(b,coin||top.firstChild);}
 if(!$('#todayHomeActivity')){const b=document.createElement('button');b.type='button';b.id='todayHomeActivity';b.className='today-v64-icon-btn';b.title='Центр активности';b.setAttribute('aria-label','Центр активности');b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg>';b.addEventListener('click',showActivity);const coin=$('#coinBadge',top);top.insertBefore(b,coin||top.firstChild);}
}
function addFeedTools(){
 const feed=$('#communityFeed');if(!feed||$('#todayV64FeedTools'))return;
 const bar=document.createElement('div');bar.id='todayV64FeedTools';bar.className='today-v64-feed-tools';bar.innerHTML=`<div class="today-v64-feed-tools-top"><div><span class="today-v64-eyebrow">ОДНА ЛЕНТА · РАЗНЫЕ ГОЛОСА</span><b>Выбери, что хочешь читать</b></div><button type="button" class="today-v64-create-btn" data-v64-create-open>＋ Создать</button></div><div class="today-v64-filter-row" role="group" aria-label="Фильтры публикаций"><button class="active" data-v64-filter="all" type="button">Все</button>${Object.entries(contentKinds).map(([id,v])=>`<button data-v64-filter="${id}" type="button">${v.label}</button>`).join('')}</div><div class="today-v64-filter-status" aria-live="polite">Показываем все типы сегодняшних публикаций.</div>`;
 feed.parentElement.insertBefore(bar,feed);
}
function setFeedFilter(id){
 activeFilter=id;const def=contentKinds[id];const feed=$('#communityFeed');
 $$('#todayV64FeedTools [data-v64-filter]').forEach(b=>b.classList.toggle('active',b.dataset.v64Filter===id));
 if(feed){$$('.community-card',feed).forEach(card=>{const label=($('.community-kind',card)?.textContent||'').toLocaleLowerCase('ru');const visible=id==='all'||(def&&def.match.some(term=>label.includes(term)));card.classList.toggle('today-v64-filter-hidden',!visible);});}
 const status=$('.today-v64-filter-status');if(status)status.textContent=id==='all'?'Показываем все типы сегодняшних публикаций.':`Фильтр: ${def?.label||'публикации'}.`;
}
function makeStoryBubble(card,index){
 const button=document.createElement('button');button.type='button';button.className='today-v64-story';button.dataset.v64StoryIndex=String(index);button.setAttribute('aria-label','Перейти к публикации автора');
 const src=card.querySelector('.today-post-avatar');const avatar=src?src.cloneNode(true):document.createElement('span');avatar.classList.add('today-v64-story-avatar');
 const name=(card.querySelector('.today-post-name')?.textContent||'Участник').trim();const kind=(card.querySelector('.community-kind')?.textContent||'Сегодня').trim();
 const ring=document.createElement('span');ring.className='today-v64-story-ring';ring.append(avatar);
 const label=document.createElement('b');label.textContent=name.length>15?name.slice(0,14)+'…':name;
 const meta=document.createElement('small');meta.textContent=kind;
 button.append(ring,label,meta);button.__v64Target=card;return button;
}
function updateStories(){
 const host=$('#todayHomeStoriesList');if(!host)return;
 const cards=$$('.today-post-card.is-human', $('#communityFeed')||document).slice(0,12);const seen=new Set();const unique=[];
 for(const card of cards){const name=(card.querySelector('.today-post-name')?.textContent||'').trim().toLocaleLowerCase('ru');if(!name||seen.has(name))continue;seen.add(name);unique.push(card);if(unique.length>=8)break;}
 host.replaceChildren();unique.forEach((card,i)=>host.append(makeStoryBubble(card,i)));
 if(!unique.length){const empty=document.createElement('div');empty.className='today-v64-story-empty';empty.textContent='Первые люди появятся здесь вместе с публикациями дня.';host.append(empty);}
 host.dataset.v64StoryCount=String(unique.length);
}
function addPeopleRail(){
 if($('#todayHomePeopleRail'))return;
 const activity=$('.activity-strip');if(!activity)return;
 const section=document.createElement('section');section.id='todayHomePeopleRail';section.className='today-v64-people-rail shell';section.innerHTML=`<div class="today-v64-rail-head"><div><span class="today-v64-eyebrow">СЕГОДНЯ ВМЕСТЕ</span><h2>Люди дня</h2><p>Новые голоса и следы сообщества — без лишних переходов.</p></div><button type="button" class="today-v64-text-btn" data-v64-go="friends">Найти людей ↗</button></div><div class="today-v64-stories"><button type="button" class="today-v64-story today-v64-story-add" data-v64-create="story"><span class="today-v64-story-ring"><span class="today-v64-add-glyph">＋</span></span><b>Моя история</b><small>Поделиться</small></button><div class="today-v64-stories-list" id="todayHomeStoriesList"><div class="today-v64-story-empty">Загружаем людей дня…</div></div></div>`;
 activity.insertAdjacentElement('afterend',section);
}
function addCreateButton(){
 const head=$('.community-section .section-head');if(!head||$('#todayV64CreateMain'))return;
 const actions=document.createElement('div');actions.className='today-v64-section-actions';actions.innerHTML=`<button id="todayV64CreateMain" type="button" class="today-v64-create-btn" data-v64-create-open>＋ Создать запись</button>`;
 const refresh=$('#peopleRefresh',head);if(refresh){head.append(actions);actions.append(refresh);refresh.classList.add('today-v64-refresh-btn');}else head.append(actions);
}
function installActivityRoutes(){
 document.addEventListener('click',event=>{
  const close=event.target.closest('[data-v64-close]');if(close&&overlay?.contains(close)){closeOverlay();return;}
  const search=event.target.closest('[data-v64-open="search"]');if(search){event.preventDefault();showSearch();return;}
  const activity=event.target.closest('[data-v64-open="activity"]');if(activity){event.preventDefault();showActivity();return;}
  const createOpen=event.target.closest('[data-v64-create-open]');if(createOpen){event.preventDefault();showCreateChoices();return;}
  const create=event.target.closest('[data-v64-create]');if(create){event.preventDefault();const action=create.dataset.v64Create;closeOverlay();if(action==='day'){$('#dailyGrid')?.scrollIntoView({behavior:'smooth',block:'start'});toast('Выбери рубрику дня и нажми действие в её карточке.');return;}if(action==='wall'){location.href='./profile.html';return;}openStories();return;}
  const filter=event.target.closest('[data-v64-filter]');if(filter){event.preventDefault();setFeedFilter(filter.dataset.v64Filter);return;}
  const findPeople=event.target.closest('[data-v64-search-people]');if(findPeople){const q=$('#todayV64Query')?.value.trim()||'';closeOverlay();goSocial('searchPeople',q);return;}
  const result=event.target.closest('[data-v64-result-index]');if(result){const item=searchResults[Number(result.dataset.v64ResultIndex)];closeOverlay();if(item?.node){setFeedFilter('all');item.node.scrollIntoView({behavior:'smooth',block:'center'});item.node.classList.add('today-v64-search-hit');window.setTimeout(()=>item.node.classList.remove('today-v64-search-hit'),1800);}return;}
  const go=event.target.closest('[data-v64-go]');if(go){event.preventDefault();const action=go.dataset.v64Go;closeOverlay();if(action==='rank')$('#rankSection')?.scrollIntoView({behavior:'smooth',block:'start'});else if(action==='profile')location.href='./profile.html';else if(action==='browser-notify'){enableBrowserNotifications();}else goSocial(action);return;}
  const notify=event.target.closest('[data-v64-browser-notify]');if(notify){enableBrowserNotifications();return;}
  const story=event.target.closest('[data-v64-story-index]');if(story){const card=story.__v64Target||null;if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.classList.add('today-v64-search-hit');window.setTimeout(()=>card.classList.remove('today-v64-search-hit'),1800);}return;}
  const navChats=event.target.closest('.bottom-nav [data-nav="chats"]');if(navChats){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();goSocial('chats');return;}
 },true);
 document.addEventListener('submit',event=>{const form=event.target.closest('#todayV64SearchForm');if(!form)return;event.preventDefault();const q=$('#todayV64Query',form)?.value.trim()||'';if(q.length<2){$('#todayV64Query',form)?.focus();return;}renderSearchResults(q);});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay)closeOverlay();});
}
function enableBrowserNotifications(){
 if(!('Notification'in window)){toast('Этот браузер не поддерживает уведомления.');return;}
 if(Notification.permission==='granted'){toast('Разрешение на уведомления уже включено.');if(overlay)showActivity();return;}
 if(Notification.permission==='denied'){toast('Разрешение отключено в настройках браузера для этого сайта.');return;}
 Notification.requestPermission().then(permission=>{toast(permission==='granted'?'Разрешение браузера включено. Для персональных push-событий нужен отдельный серверный центр уведомлений.':'Разрешение не выдано.');if(overlay)showActivity();}).catch(()=>toast('Не удалось запросить разрешение браузера.'));
}
function patchBottomNav(){
 const nav=$('.bottom-nav');if(!nav)return;
 const rank=$('[data-nav="rank"]',nav);if(rank){rank.dataset.nav='chats';rank.innerHTML='<span>◌</span><small>ЧАТЫ</small>';rank.setAttribute('aria-label','Сообщения');rank.title='Сообщения';}
}
function installObservers(){
 const feed=$('#communityFeed');if(feed){const mo=new MutationObserver(()=>{updateStories();setFeedFilter(activeFilter);});mo.observe(feed,{childList:true});homeObserver=mo;}
}
function init(){
 if(document.body.dataset.todayHomeV64==='ready')return;document.body.dataset.todayHomeV64='ready';
 addHeaderButtons();addPeopleRail();addFeedTools();addCreateButton();patchBottomNav();installActivityRoutes();installObservers();updateStories();
 const oldNav=$('#todaySocialNav');if(oldNav)oldNav.setAttribute('aria-hidden','true');
 document.documentElement.classList.add('today-home-v64');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.TODAY_HOME_V64={version:'V64',openSearch:showSearch,openActivity:showActivity,openCreate:showCreateChoices,refreshStories:updateStories,close:closeOverlay};
})();
