/* TODAY_PROFILE_POST_PHOTOS_V1 — private, visibility-aware profile images */
/* TODAY SOCIAL LAYER V1 · persistent profiles, friends, 3 chat types and channels */
(function(){
  'use strict';
  const VERSION='TODAY-SOCIAL-V1.3';
  let activeChatId=null,activeChatTitle='',chatPoll=null,viewerId=null;
  const byId=id=>document.getElementById(id);
  const h=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const dateLabel=v=>{try{return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(new Date(v))}catch{return ''}};
  const shortText=(v,n=110)=>{const s=String(v??'');return s.length>n?s.slice(0,n-1)+'…':s};
  const notify=msg=>{if(typeof toast==='function')toast(msg);else console.log(msg)};
  async function currentUser(){try{const r=await sb.auth.getSession();viewerId=r?.data?.session?.user?.id||null;return viewerId}catch{return null}}
  async function needUser(){const id=await currentUser();if(id)return id;try{if(typeof requireAuth==='function')requireAuth()}catch{}notify('Войди в аккаунт, чтобы пользоваться социальной частью TODAY.');return null}
  async function rpc(name,args={}){
    const {data,error}=await sb.rpc(name,args);
    if(error)throw new Error(String(error.message||error).slice(0,260));
    let v=Array.isArray(data)&&data.length===1?data[0]:data;
    if(typeof v==='string'){try{v=JSON.parse(v)}catch{}}
    if(v&&typeof v==='object'&&v.ok===false)throw new Error(v.message||'Операция не выполнена.');
    return v||{};
  }
  /* TODAY_SOCIAL_CLOSE_HOTFIX_V14 — reliable click-based close handling */
  /* TODAY_SOCIAL_MODAL_CLOSE_V15 — hard close path + scroll unlock */

  /* TODAY_SOCIAL_PAGES_V16_JS_BEGIN */
  let socialRouteActive = false;
  let socialRouteSession = '';
  let socialRoutePages = [];
  let socialRouteDepth = 0;
  let socialRouteOriginScrollY = 0;
  let socialRouteOriginBodyStyle = null;
  let socialRouteBodyRestored = false;

  function socialPageTitle(html) {
    const holder = document.createElement('div');
    holder.innerHTML = String(html || '');
    const node = holder.querySelector('.ts-panel-head h2, h2, h3');
    return String(node?.textContent || 'TODAY SOCIAL').trim().replace(/\s+/g, ' ').slice(0, 100) || 'TODAY SOCIAL';
  }

  function socialRouteState(depth) {
    const oldState = history.state && typeof history.state === 'object' ? { ...history.state } : {};
    oldState.__todaySocialRouteV16 = { session: socialRouteSession, depth };
    return oldState;
  }

  function ensureSocialPageBar() {
    const root = byId('modal');
    if (!root) return null;
    let bar = byId('todaySocialPageBar');
    if (!bar) {
      bar = document.createElement('header');
      bar.id = 'todaySocialPageBar';
      bar.setAttribute('aria-label', 'Навигация по разделу TODAY');
      bar.innerHTML = `
        <button type="button" id="todaySocialBackTop" aria-label="Вернуться на предыдущую страницу">
          <span class="today-social-back-arrow" aria-hidden="true">←</span><span>НАЗАД</span>
        </button>
        <div class="today-social-route-title"><span>TODAY <i>/</i> SOCIAL</span><strong id="todaySocialPageTitle">TODAY SOCIAL</strong></div>
        <button type="button" id="todaySocialExitTop" aria-label="Вернуться на предыдущую страницу">×</button>`;
      root.appendChild(bar);
    }
    return bar;
  }

  function restorePageOriginScrollAndBody() {
    const body = document.body;
    const html = document.documentElement;
    const saved = socialRouteOriginBodyStyle || {};
    body.style.position = saved.position || '';
    body.style.top = saved.top || '';
    body.style.left = saved.left || '';
    body.style.right = saved.right || '';
    body.style.width = saved.width || '';
    body.style.overflow = saved.overflow || '';
    html.classList.remove('today-modal-open');
    window.__todayModalBodyStyle = null;
    window.__todayModalScrollY = null;
    try { window.scrollTo(0, socialRouteOriginScrollY); } catch (_) {}
  }

  function resumeChatPollingForCurrentPage() {
    if (!socialRouteActive) return;
    const host = byId('modalContent');
    const chatId = host?.dataset?.chatId || '';
    if (!chatId || !host?.querySelector('#todayChatMessages')) return;
    if (chatPoll) clearInterval(chatPoll);
    activeChatId = chatId;
    chatPoll = setInterval(() => {
      const currentHost = byId('modalContent');
      if (socialRouteActive && activeChatId === chatId && currentHost?.dataset?.chatId === chatId && currentHost.querySelector('#todayChatMessages')) {
        renderMessages(chatId, false);
      }
    }, 2800);
  }

  function renderSocialPage(page, restoreScroll = false) {
    const root = byId('modal');
    const host = byId('modalContent');
    if (!root || !host || !page) return;
    try { stopPoll(); } catch (_) {}
    root.classList.remove('hidden');
    root.classList.add('today-social-modal', 'today-social-page');
    document.documentElement.classList.add('today-social-page-mode');
    document.body.classList.add('today-social-page-mode');
    const bar = ensureSocialPageBar();
    const titleNode = bar?.querySelector('#todaySocialPageTitle');
    if (titleNode) titleNode.textContent = page.title || 'TODAY SOCIAL';
    host.innerHTML = page.html;
    if (page.chatId) host.dataset.chatId = page.chatId;
    else delete host.dataset.chatId;
    const card = root.querySelector('.modal-card');
    if (card) card.scrollTop = restoreScroll ? Math.max(0, Number(page.scrollTop || 0)) : 0;
    if (!socialRouteBodyRestored) {
      restorePageOriginScrollAndBody();
      socialRouteBodyRestored = true;
    }
    resumeChatPollingForCurrentPage();
  }

  function exitSocialPageRoute() {
    const root = byId('modal');
    const host = byId('modalContent');
    try { stopPoll(); } catch (_) {}
    if (root) {
      root.classList.add('hidden');
      root.classList.remove('today-social-modal', 'today-social-page');
      root.querySelector('#todaySocialPageBar')?.remove();
      for (const preview of root.querySelectorAll('.ts-photo-preview[data-object-url]')) {
        try { URL.revokeObjectURL(preview.dataset.objectUrl); } catch (_) {}
        delete preview.dataset.objectUrl;
        preview.replaceChildren();
        preview.hidden = true;
      }
    }
    if (host) delete host.dataset.chatId;
    document.documentElement.classList.remove('today-social-page-mode', 'today-modal-open');
    document.body.classList.remove('today-social-page-mode');
    restorePageOriginScrollAndBody();
    // Keep the in-memory page stack for browser Forward. A new social navigation
    // starts a fresh session and replaces this cache before creating its own history entries.
    socialRouteActive = false;
    socialRouteDepth = 0;
    socialRouteBodyRestored = false;
  }

  function forceCloseSocialModal(event) {
    if (event) {
      event.preventDefault?.();
      event.stopPropagation?.();
    }
    if (socialRouteActive) {
      const state = history.state?.__todaySocialRouteV16;
      if (state && state.session === socialRouteSession && Number(state.depth) === socialRouteDepth) {
        history.back();
      } else {
        exitSocialPageRoute();
      }
      return;
    }
    const modalRoot = byId('modal');
    if (!modalRoot) return;
    try { stopPoll(); } catch (_) {}
    modalRoot.classList.add('hidden');
    modalRoot.classList.remove('today-social-modal', 'today-social-page');
    const htmlRoot = document.documentElement;
    const body = document.body;
    const saved = window.__todayModalBodyStyle || {};
    body.style.position = saved.position || '';
    body.style.top = saved.top || '';
    body.style.left = saved.left || '';
    body.style.right = saved.right || '';
    body.style.width = saved.width || '';
    body.style.overflow = saved.overflow || '';
    htmlRoot.classList.remove('today-modal-open', 'today-social-page-mode');
    body.classList.remove('today-social-page-mode');
    const savedScrollY = Number(window.__todayModalScrollY || 0);
    window.__todayModalBodyStyle = null;
    window.__todayModalScrollY = null;
    try { window.scrollTo(0, savedScrollY); } catch (_) {}
  }

  function installModalSafety() {
    const modalRoot = byId('modal');
    if (modalRoot && modalRoot.dataset.todaySocialPagesSafetyV16 !== '1') {
      modalRoot.dataset.todaySocialPagesSafetyV16 = '1';
      modalRoot.addEventListener('click', function (event) {
        const target = event.target instanceof Element ? event.target : null;
        if (!target || modalRoot.classList.contains('hidden')) return;
        const backButton = target.closest('#todaySocialBackTop, #todaySocialExitTop, #todaySocialCloseTop, #modalClose, .ts-panel-close');
        const backdrop = target === modalRoot.querySelector('.modal-backdrop');
        if (socialRouteActive) {
          if (backButton) forceCloseSocialModal(event);
          // In page mode the background is not a dismiss target. Only explicit Back controls navigate.
          return;
        }
        if (!backButton && !backdrop) return;
        forceCloseSocialModal(event);
      }, true);
    }
    if (!window.__TODAY_SOCIAL_ESCAPE_CLOSE_V16) {
      window.__TODAY_SOCIAL_ESCAPE_CLOSE_V16 = true;
      document.addEventListener('keydown', function (event) {
        const modalRoot = byId('modal');
        if (event.key !== 'Escape' || !modalRoot || modalRoot.classList.contains('hidden')) return;
        forceCloseSocialModal(event);
      }, true);
    }
    if (!window.__TODAY_SOCIAL_PAGES_POPSTATE_V16) {
      window.__TODAY_SOCIAL_PAGES_POPSTATE_V16 = true;
      window.addEventListener('popstate', function (event) {
        const route = event.state?.__todaySocialRouteV16;
        if (!socialRouteActive) {
          // Browser Forward may return to a social page after Back had restored TODAY.
          if (route && route.session === socialRouteSession) {
            const forwardDepth = Number(route.depth);
            const forwardPage = socialRoutePages[forwardDepth - 1];
            if (Number.isInteger(forwardDepth) && forwardDepth >= 1 && forwardPage) {
              socialRouteActive = true;
              socialRouteDepth = forwardDepth;
              socialRouteBodyRestored = false;
              renderSocialPage(forwardPage, true);
            }
          }
          return;
        }
        if (route && route.session === socialRouteSession) {
          const depth = Number(route.depth);
          const page = socialRoutePages[depth - 1];
          if (Number.isInteger(depth) && depth >= 1 && page) {
            socialRouteDepth = depth;
            renderSocialPage(page, true);
            return;
          }
        }
        // Returning to the history entry that preceded the first social page restores TODAY.
        exitSocialPageRoute();
      });
    }
  }

  installModalSafety();

  function modal(html) {
    const root = byId('modal');
    const host = byId('modalContent');
    if (!root || !host) return;
    const title = socialPageTitle(html);

    if (!socialRouteActive) {
      if (typeof openModal !== 'function') return;
      openModal(html); // Reuse the existing container, then release the old dialog body lock.
      socialRouteOriginScrollY = Number(window.__todayModalScrollY || 0);
      socialRouteOriginBodyStyle = { ...(window.__todayModalBodyStyle || {}) };
      socialRouteSession = `today-social-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      socialRoutePages = [{ html: String(html), title, scrollTop: 0, chatId: null }];
      socialRouteDepth = 1;
      socialRouteActive = true;
      socialRouteBodyRestored = false;
      history.pushState(socialRouteState(1), '', location.href);
      try { stopPoll(); } catch (_) {}
      renderSocialPage(socialRoutePages[0], false);
      return;
    }

    const card = root.querySelector('.modal-card');
    const current = socialRoutePages[socialRouteDepth - 1];
    if (current) {
      current.scrollTop = card ? card.scrollTop : 0;
      current.chatId = host.dataset.chatId || current.chatId || null;
    }
    try { stopPoll(); } catch (_) {}

    if (current && current.title === title) {
      // Same page refreshed after an action: update in place instead of adding a duplicate history stop.
      socialRoutePages[socialRouteDepth - 1] = { html: String(html), title, scrollTop: current.scrollTop, chatId: current.chatId };
      history.replaceState(socialRouteState(socialRouteDepth), '', location.href);
      renderSocialPage(socialRoutePages[socialRouteDepth - 1], true);
      return;
    }

    socialRoutePages = socialRoutePages.slice(0, socialRouteDepth);
    socialRouteDepth += 1;
    socialRoutePages[socialRouteDepth - 1] = { html: String(html), title, scrollTop: 0, chatId: null };
    history.pushState(socialRouteState(socialRouteDepth), '', location.href);
    renderSocialPage(socialRoutePages[socialRouteDepth - 1], false);
  }
  /* TODAY_SOCIAL_PAGES_V16_JS_END */
  function stopPoll(){if(chatPoll){clearInterval(chatPoll);chatPoll=null}activeChatId=null;}
  function panelShell(title,sub,content){return `<section class="ts-panel"><div class="ts-panel-head"><div><div class="ts-kicker">TODAY SOCIAL / ${VERSION}</div><h2>${h(title)}</h2>${sub?`<p>${h(sub)}</p>`:''}</div><span class="ts-orbit" aria-hidden="true">✦</span></div>${content}</section>`}
  function avatar(user,size=''){
    const url=String(user?.avatar_url||'');
    return `<span class="ts-avatar ${size}">${url?`<img src="${h(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:h((user?.name||user?.username||'✦').trim().slice(0,1).toUpperCase()||'✦')}</span>`;
  }
  function injectNav(){
    if(byId('todaySocialNav'))return;
    const nav=document.createElement('nav');nav.id='todaySocialNav';nav.className='today-social-nav shell';nav.setAttribute('aria-label','Социальные разделы TODAY');
    nav.innerHTML=`<div class="ts-brand-chip"><span class="ts-live-dot"></span><span><b>YOUR SOCIAL SPACE</b><small>Люди остаются. День меняется.</small></span></div><div class="ts-nav-actions"><button data-social-act="chats"><span>◌</span>Сообщения</button><button data-social-act="friends"><span>♧</span>Друзья</button><button data-social-act="my-profile"><span>✦</span>Моя страница</button><button data-social-act="channels"><span>▤</span>Каналы</button><button data-social-act="settings"><span>⚙</span>Приватность</button></div>`;
    const top=document.querySelector('.topbar');if(top)top.insertAdjacentElement('afterend',nav);else document.body.prepend(nav);
  }
  function injectPromo(){
    if(byId('todayPromotedBlock'))return;
    const intro=document.querySelector('.community-intro');
    if(!intro)return;
    const section=document.createElement('section');section.id='todayPromotedBlock';section.className='ts-promo-wrap';section.innerHTML=`<div class="ts-promo-head"><div><span class="ts-kicker">ТОЛЬКО ДО ПОЛУНОЧИ · 250 ◈</span><h3>ЧТО ОСТАВИЛИ СЕГОДНЯ</h3><p>Один пост в день может выйти на главную дневную сцену.</p></div><span class="ts-promo-mark">TODAY<br>✦</span></div><div id="todayPromotedList" class="ts-promoted-list"><div class="ts-empty">Загружаем следы сообщества…</div></div>`;
    intro.insertAdjacentElement('afterend',section);
  }
  function userCard(u,extra=''){
    return `<article class="ts-user-card">${avatar(u)}<div class="ts-user-copy"><b>${h(u.name||u.username||'Участник')}</b><span>@${h(String(u.username||'').replace(/^@/,''))}</span></div><div class="ts-user-actions"><button class="ts-mini" data-social-act="open-profile" data-id="${h(u.id)}">Страница</button><button class="ts-mini" data-social-act="request-friend" data-username="${h(u.username)}">+ Друг</button><button class="ts-mini ts-mini-accent" data-social-act="direct" data-username="${h(u.username)}">Написать</button>${extra}</div></article>`;
  }
  function profilePostCard(p,own){
    const vis=p.visibility==='private'?'Только ты':p.visibility==='friends'?'Друзья':'Публично';
    const photo=p.image_url?`<a class="ts-post-image-link" href="${h(p.image_url)}" target="_blank" rel="noopener noreferrer" aria-label="Открыть фотографию в полном размере"><img class="ts-post-image" src="${h(p.image_url)}" alt="Фото в публикации" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`:'';
    return `<article class="ts-post-card"><div class="ts-post-meta"><span class="ts-post-tag">ЛИЧНАЯ СТРАНИЦА</span><time>${h(dateLabel(p.created_at))}</time><span>${h(vis)}</span></div>${p.title?`<h4>${h(p.title)}</h4>`:''}${photo}<p>${h(p.body).replace(/\n/g,'<br>')}</p>${own&&p.visibility==='public'?`<button class="ts-promo-button" data-social-act="promote-post" data-id="${h(p.id)}">✦ В «Что оставили сегодня» · 250 монет</button>`:''}<button class="ts-text-button" data-social-act="report" data-kind="profile_post" data-id="${h(p.id)}">Пожаловаться</button></article>`;
  }
  async function signProfilePostPhotos(posts){
    return Promise.all((posts||[]).map(async p=>{
      if(!p.image_path)return {...p,image_url:''};
      try{const {data,error}=await sb.storage.from('today-profile-media').createSignedUrl(p.image_path,3600);return {...p,image_url:error?'':(data?.signedUrl||'')}}
      catch(e){console.warn('TODAY profile photo URL',e);return {...p,image_url:''}}
    }));
  }
  async function uploadProfilePostPhoto(file){
    if(!file) return '';
    const uid=await currentUser();if(!uid)throw new Error('Войди в аккаунт, чтобы добавлять фотографии.');
    if(!/^image\/(jpeg|png|webp)$/i.test(String(file.type||'')))throw new Error('Поддерживаются JPG, PNG и WebP.');
    if(file.size>15*1024*1024)throw new Error('Фото слишком большое: максимум 15 МБ.');
    if(typeof imageBlob!=='function')throw new Error('Не удалось запустить обработку фото. Обнови страницу.');
    const blob=await imageBlob(file,1800,.84);
    const token=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2));
    const path=`profile-posts/${uid}/${token}.jpg`;
    const {error}=await sb.storage.from('today-profile-media').upload(path,blob,{contentType:'image/jpeg',cacheControl:'31536000',upsert:false});
    if(error)throw new Error('Не удалось загрузить фото: '+String(error.message||error).slice(0,180));
    return path;
  }
  async function loadPromos(){
    const host=byId('todayPromotedList');if(!host)return;
    try{
      const d=await rpc('today_social_get_promoted_posts');const rawPosts=Array.isArray(d.posts)?d.posts:[];const posts=await signProfilePostPhotos(rawPosts);
      if(!posts.length){host.innerHTML=`<div class="ts-empty"><b>Место для следа дня свободно.</b><span>Создай пост на своей странице и выведи его в общую дневную ленту за 250 золотых монет. Доступно один раз в день.</span><button class="ts-mini ts-mini-accent" data-social-act="my-profile">Создать пост</button></div>`;return;}
      host.innerHTML=posts.map(p=>`<article class="ts-promoted-card"><div class="ts-promoted-top">${avatar({name:p.author_name,avatar_url:p.avatar_url})}<div class="ts-user-copy"><b>${h(p.author_name||p.username)}</b><span>@${h(String(p.username||'').replace(/^@/,''))} · след дня</span></div><span class="ts-promo-badge">FEATURED</span></div>${p.title?`<h4>${h(p.title)}</h4>`:''}${p.image_url?`<a class="ts-post-image-link" href="${h(p.image_url)}" target="_blank" rel="noopener noreferrer" aria-label="Открыть фотографию"><img class="ts-post-image" src="${h(p.image_url)}" alt="Фото публикации" loading="lazy" decoding="async"></a>`:''}<p>${h(p.body).replace(/\n/g,'<br>')}</p><div class="ts-promoted-foot"><span>В общей ленте до 00:00 МСК</span><button class="ts-text-button" data-social-act="open-profile" data-id="${h(p.author_id)}">Открыть страницу ↗</button></div></article>`).join('');
    }catch(e){host.innerHTML=`<div class="ts-empty">Блок продвижения временно недоступен. ${h(shortText(e.message,100))}</div>`;}
  }
  async function openChats(){
    if(!await needUser())return;
    let d;try{d=await rpc('today_social_list_chats')}catch(e){notify(e.message);return}
    const chats=Array.isArray(d.chats)?d.chats:[];
    const content=`<div class="ts-chat-create-grid"><form class="ts-form-card" data-social-form="start-direct"><h3>Личный диалог</h3><p>Напиши любому участнику, если он разрешил входящие сообщения.</p><label>Никнейм пользователя<input name="username" placeholder="@nickname" required></label><button class="ts-primary" type="submit">Открыть диалог ↗</button></form><form class="ts-form-card" data-social-form="create-group"><h3>Новая группа</h3><p>Добавь любое количество участников — у группы нет встроенного лимита.</p><label>Название<input name="title" maxlength="100" placeholder="Например, Ночной клуб" required></label><label>Никнеймы через запятую<textarea name="usernames" rows="2" placeholder="@alex, @maria, @max" required></textarea></label><button class="ts-primary" type="submit">Создать группу +</button></form></div><div class="ts-list-head"><h3>Твои диалоги</h3><button class="ts-mini" data-social-act="refresh-chats">Обновить</button></div><div class="ts-chat-list">${chats.length?chats.map(c=>`<button class="ts-chat-row" data-social-act="open-chat" data-id="${h(c.id)}" data-title="${h(c.title)}" data-type="${h(c.type)}"><span class="ts-chat-icon">${c.type==='global'?'◎':c.type==='group'?'♧':'↗'}</span><span class="ts-chat-row-copy"><b>${h(c.title||'Диалог')}</b><small>${h(shortText(c.last_body|| (c.type==='global'?'Общение со всем сообществом':c.type==='group'?'Групповая переписка':'Начни разговор'),95))}</small></span><span class="ts-chat-row-meta">${c.unread_count?`<i>${h(c.unread_count)}</i>`:''}<small>${c.last_at?h(dateLabel(c.last_at)):c.type==='global'?'ВСЕ':'НОВЫЙ'}</small></span><span class="ts-arrow">↗</span></button>`).join(''):`<div class="ts-empty">Пока нет диалогов. Общий чат уже ждёт тебя.</div>`}</div><div class="ts-moderation-note"><b>Правила общего чата</b><span>Мат, оскорбления и политические высказывания запрещены. Первое нарушение — 30 минут, второе — 24 часа, далее — 7 суток без сообщений и публикаций во всей TODAY.</span></div>`;
    modal(panelShell('Сообщения','Три пространства общения — каждый выбирает свой формат.',content));
  }
  function messageMarkup(m,own){return `<article class="ts-message ${own?'is-own':''}"><div class="ts-message-meta"><b>${h(m.sender_name||m.sender_username||(own?'Ты':'Участник'))}</b><time>${h(dateLabel(m.created_at))}</time></div><p>${h(m.body).replace(/\n/g,'<br>')}</p>${!own?`<button class="ts-text-button" data-social-act="report" data-kind="chat_message" data-id="${h(m.id)}">Пожаловаться</button>`:''}</article>`}
  async function renderMessages(chatId,scroll=true){
    const host=byId('todayChatMessages');if(!host)return;
    let d;try{d=await rpc('today_social_get_chat_messages',{p_chat_id:chatId})}catch(e){host.innerHTML=`<div class="ts-empty">${h(e.message)}</div>`;return}
    const messages=Array.isArray(d.messages)?d.messages:[];const nearBottom=host.scrollHeight-host.scrollTop-host.clientHeight<100;
    host.innerHTML=messages.map(m=>messageMarkup(m,m.sender_id===viewerId)).join('')||`<div class="ts-empty">Здесь пока тихо. Оставь первое сообщение.</div>`;
    if(scroll||nearBottom)host.scrollTop=host.scrollHeight;
  }
  async function openChat(id,title,type){
    if(!await needUser())return;
    stopPoll();activeChatTitle=title||'Чат';
    modal(panelShell(activeChatTitle,type==='global'?'ОБЩИЙ ЧАТ · правила действуют на публикации во всей TODAY':type==='group'?'ГРУППОВОЙ ЧАТ · приглашения контролируются настройками участников':'ЛИЧНЫЙ ДИАЛОГ',`<div class="ts-chat-toolbar"><button class="ts-mini" data-social-act="chats">← Все диалоги</button><span>${type==='global'?'ПУБЛИЧНОЕ ПРОСТРАНСТВО':type==='group'?'ГРУППА':'1 НА 1'}</span></div><div id="todayChatMessages" class="ts-chat-messages"><div class="ts-empty">Загружаем сообщения…</div></div><form class="ts-message-compose" data-social-form="send-message"><textarea name="body" maxlength="3000" rows="2" placeholder="Напиши сообщение…" required></textarea><button class="ts-primary" type="submit">Отправить ↗</button></form>${type==='group'?`<form class="ts-inline-invite" data-social-form="invite-group"><input type="hidden" name="chat_id" value="${h(id)}"><input name="usernames" placeholder="Добавить @никнеймы через запятую"><button class="ts-mini" type="submit">+ Пригласить</button></form>`:''}<div class="ts-chat-footnote">Не публикуй личные данные. Неуместный контент можно пожаловаться модерации.</div>`));
    activeChatId=id;const host=byId('modalContent');if(host)host.dataset.chatId=id;await renderMessages(id,true);
    chatPoll=setInterval(()=>{if(activeChatId===id&&document.querySelector('#modal:not(.hidden) #todayChatMessages'))renderMessages(id,false)},2800);
  }
  async function openFriends(){
    if(!await needUser())return;
    try{
      const d=await rpc('today_social_list_friend_requests');const incoming=d.incoming||[],outgoing=d.outgoing||[],friends=d.friends||[];
      modal(panelShell('Друзья','Люди, с которыми твой TODAY продолжается и после полуночи.',`<form class="ts-search-form" data-social-form="search-users"><label>Найти человека<input name="query" placeholder="Никнейм или имя · минимум 2 символа" required></label><button class="ts-primary" type="submit">Найти людей ↗</button></form><div id="todaySocialSearchResults"></div><div class="ts-columns"><div><div class="ts-list-head"><h3>Входящие <span class="ts-count">${incoming.length}</span></h3></div>${incoming.length?incoming.map(u=>`<article class="ts-user-card">${avatar(u)}<div class="ts-user-copy"><b>${h(u.name)}</b><span>@${h(u.username)}</span></div><div class="ts-user-actions"><button class="ts-mini ts-mini-accent" data-social-act="accept-friend" data-id="${h(u.id)}">Принять</button><button class="ts-mini" data-social-act="reject-friend" data-id="${h(u.id)}">Отклонить</button></div></article>`).join(''):`<p class="ts-muted">Новых заявок нет.</p>`}</div><div><div class="ts-list-head"><h3>Твои друзья <span class="ts-count">${friends.length}</span></h3></div>${friends.length?friends.map(u=>userCard(u)).join(''):`<p class="ts-muted">Здесь появятся принятые друзья.</p>`}</div></div><div class="ts-list-head"><h3>Отправленные заявки</h3></div>${outgoing.length?outgoing.map(u=>`<div class="ts-outgoing">${avatar(u,'small')}<span>@${h(u.username)}</span><i>Ожидает ответа</i></div>`).join(''):`<p class="ts-muted">Нет ожидающих заявок.</p>`}`));
    }catch(e){notify(e.message)}
  }
  async function openProfile(id){
    const uid=await currentUser();
    if(!id){if(!uid&&!await needUser())return;id=uid}
    let d;try{d=await rpc('today_social_profile_page',{p_user_id:id})}catch(e){modal(panelShell('Страница недоступна','',`<div class="ts-empty">${h(e.message)}</div>`));return}
    if(!d.ok||!d.profile){modal(panelShell('Страница недоступна','',`<div class="ts-empty">${h(d.message||'Эту страницу нельзя посмотреть.')}</div>`));return}
    const p=d.profile,own=!!d.is_self,rawPosts=Array.isArray(d.posts)?d.posts:[],friends=Array.isArray(d.friends)?d.friends:[];const posts=await signProfilePostPhotos(rawPosts);
    const friendshipAction=own?'':d.friend_status==='friends'?`<span class="ts-status-chip">✓ Вы друзья</span>`:d.friend_status==='outgoing'?`<span class="ts-status-chip">Заявка отправлена</span>`:d.friend_status==='incoming'?`<button class="ts-primary" data-social-act="accept-friend" data-id="${h(p.id)}">Принять заявку</button>`:`<button class="ts-primary" data-social-act="request-friend" data-username="${h(p.username)}">＋ Добавить в друзья</button>`;
    const mainAction=own?`<button class="ts-primary" data-social-act="settings">Настроить приватность</button>`:`<button class="ts-mini" data-social-act="direct" data-username="${h(p.username)}">Написать</button>${friendshipAction}`;
    const createPost=own?`<form class="ts-form-card ts-create-post" data-social-form="create-profile-post"><h3>Оставить запись на своей странице</h3><label>Заголовок <small>необязательно</small><input name="title" maxlength="140" placeholder="Коротко и по делу"></label><label>Текст публикации<textarea name="body" rows="4" maxlength="5000" placeholder="Это останется здесь и завтра…" required></textarea></label><label class="ts-photo-field"><span>Фотография <small>необязательно</small></span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" data-social-photo><small>JPG, PNG или WebP · до 15 МБ. Изображение будет автоматически сжато.</small></label><div class="ts-photo-preview" data-social-photo-preview hidden></div><label>Кто увидит<select name="visibility"><option value="public">Все пользователи</option><option value="friends">Только друзья</option><option value="private">Только я</option></select></label><button class="ts-primary" type="submit">Опубликовать на странице ↗</button><span class="ts-helper">Публикации профиля постоянные и не удаляются в полночь. Фото защищено настройками доступа.</span></form>`:'';
    const friendBlock=`<div class="ts-profile-friends"><div class="ts-list-head"><h3>Друзья</h3><span class="ts-count">${friends.length}</span></div>${friends.length?friends.slice(0,12).map(u=>`<button class="ts-friend-chip" data-social-act="open-profile" data-id="${h(u.id)}">${avatar(u,'small')}<span>${h(u.name||u.username)}</span></button>`).join(''):`<p class="ts-muted">${own?'Добавляй участников в друзья — они появятся здесь.':'Список друзей недоступен или пока пуст.'}</p>`}</div>`;
    const reportUser=!own?`<div class="ts-profile-tools"><button class="ts-text-button" data-social-act="block-user" data-id="${h(p.id)}">Заблокировать</button><button class="ts-text-button" data-social-act="report" data-kind="user" data-id="${h(p.id)}">Пожаловаться на профиль</button></div>`:'';
    modal(panelShell(own?'Моя страница':p.name||p.username,own?'Твоя постоянная история в TODAY.':`Профиль @${String(p.username||'').replace(/^@/,'')}`,`<div class="ts-profile-hero">${avatar(p,'large')}<div><h3>${h(p.name||p.username||'Участник')}</h3><span>@${h(String(p.username||'').replace(/^@/,''))}</span><p>${h(p.bio||'Пока без описания.')}</p><div class="ts-profile-actions">${mainAction}</div></div></div>${reportUser}${createPost}<div class="ts-profile-content"><div class="ts-profile-wall"><div class="ts-list-head"><h3>Публикации</h3><span class="ts-count">${posts.length}</span></div>${posts.length?posts.map(q=>profilePostCard(q,own)).join(''):`<div class="ts-empty">${own?'Твоя страница готова к первой записи.':'Пока нет публикаций, доступных для просмотра.'}</div>`}</div>${friendBlock}</div>`));
  }
  async function openSettings(){
    const uid=await needUser();if(!uid)return;
    let current={};try{const q=await sb.from('today_social_settings').select('*').eq('user_id',uid).maybeSingle();if(q.error)throw q.error;current=q.data||{}}catch(e){notify('Не удалось прочитать настройки: '+e.message);return}
    const val=(k,d)=>current[k]===undefined||current[k]===null?d:current[k];
    modal(panelShell('Приватность и безопасность','Ты решаешь, кто может входить в твоё социальное пространство.',`<form class="ts-settings-form" data-social-form="save-settings"><div class="ts-settings-group"><div class="ts-settings-title"><h3>Сообщения и приглашения</h3><p>Эти правила проверяются сервером.</p></div><label class="ts-toggle-row"><span><b>Личные сообщения</b><small>Разрешить участникам начинать и продолжать диалоги</small></span><input type="checkbox" name="allow_direct_messages" ${val('allow_direct_messages',true)?'checked':''}><i></i></label><label class="ts-toggle-row"><span><b>Приглашения в группы</b><small>Разрешить добавлять тебя в групповые чаты</small></span><input type="checkbox" name="allow_group_invites" ${val('allow_group_invites',true)?'checked':''}><i></i></label><label class="ts-toggle-row"><span><b>Заявки в друзья</b><small>Разрешить другим отправлять запрос на дружбу</small></span><input type="checkbox" name="allow_friend_requests" ${val('allow_friend_requests',true)?'checked':''}><i></i></label></div><div class="ts-settings-group"><div class="ts-settings-title"><h3>Кто видит твою страницу</h3><p>Личные публикации дополнительно имеют собственную видимость.</p></div><label>Доступ к профилю<select name="profile_visibility"><option value="public" ${val('profile_visibility','public')==='public'?'selected':''}>Все пользователи</option><option value="friends" ${val('profile_visibility','public')==='friends'?'selected':''}>Только друзья</option><option value="private" ${val('profile_visibility','public')==='private'?'selected':''}>Закрытая страница</option></select></label><label class="ts-toggle-row"><span><b>Разрешить переход на страницу</b><small>Если выключить, даже публичный профиль будет недоступен другим</small></span><input type="checkbox" name="allow_profile_visits" ${val('allow_profile_visits',true)?'checked':''}><i></i></label><label>Кто видит список друзей<select name="friend_list_visibility"><option value="public" ${val('friend_list_visibility','public')==='public'?'selected':''}>Все пользователи</option><option value="friends" ${val('friend_list_visibility','public')==='friends'?'selected':''}>Только друзья</option><option value="private" ${val('friend_list_visibility','public')==='private'?'selected':''}>Только я</option></select></label></div><button class="ts-primary ts-save" type="submit">Сохранить настройки ↗</button><div class="ts-helper">В общем чате нельзя отправлять мат, оскорбления и политические высказывания. Нарушение создаёт общесайтовый запрет на публикации. Нужна осторожность: автоматический фильтр может ошибаться.</div></form>`));
  }
  async function openChannels(){
    if(!await needUser())return;
    let d;try{d=await rpc('today_social_list_channels')}catch(e){notify(e.message);return}
    const ch=Array.isArray(d.channels)?d.channels:[];
    modal(panelShell('Каналы','Отдельные сообщества со своей лентой. Посты канала не появляются в общей ленте TODAY.',`<form class="ts-form-card" data-social-form="create-channel"><h3>Создать канал</h3><label>Название<input name="title" maxlength="80" required placeholder="Название сообщества"></label><label>Описание<textarea name="description" maxlength="500" rows="2" placeholder="О чём этот канал?"></textarea></label><label>Доступ<select name="visibility"><option value="public">Публичный — можно найти и войти</option><option value="private">Закрытый — только по приглашению</option></select></label><button class="ts-primary" type="submit">Создать канал +</button></form><div class="ts-list-head"><h3>Открытые и твои каналы</h3><span class="ts-count">${ch.length}</span></div><div class="ts-channel-grid">${ch.length?ch.map(c=>`<article class="ts-channel-card"><div class="ts-channel-symbol">${c.visibility==='private'?'◈':'▤'}</div><div><h4>${h(c.title)}</h4><p>${h(c.description||'Тематическое пространство TODAY.')}</p><div class="ts-channel-meta"><span>${h(c.visibility==='private'?'ЗАКРЫТЫЙ':'ПУБЛИЧНЫЙ')}</span><span>${h(c.member_count)} участников</span></div></div><button class="ts-primary" data-social-act="open-channel" data-id="${h(c.id)}">${c.is_member?'Открыть ↗':'Войти ↗'}</button></article>`).join(''):`<div class="ts-empty">Пока каналов нет. Создай первый.</div>`}</div><div class="ts-helper">Внутри каждого канала — отдельная история, публикации и участники. Закрытый канал нельзя найти без приглашения.</div>`));
  }
  async function openChannel(id){
    if(!await needUser())return;
    let d;try{d=await rpc('today_social_get_channel_posts',{p_channel_id:id})}catch(e){notify(e.message);return}
    const c=d.channel||{},posts=Array.isArray(d.posts)?d.posts:[];let actions='';
    if(!c.is_member&&c.visibility==='public')actions=`<button class="ts-primary" data-social-act="join-channel" data-id="${h(id)}">Вступить в канал ↗</button>`;
    const postForm=c.is_member?`<form class="ts-form-card ts-create-post" data-social-form="create-channel-post"><input type="hidden" name="channel_id" value="${h(id)}"><h3>Опубликовать внутри канала</h3><label>Заголовок<input name="title" maxlength="140" placeholder="Заголовок (необязательно)"></label><label>Текст<textarea name="body" rows="3" maxlength="5000" required placeholder="Сообщение участникам канала…"></textarea></label><button class="ts-primary" type="submit">Опубликовать ↗</button></form>`:'';
    const inviteForm=c.role==='owner'||c.role==='admin'?`<form class="ts-inline-invite" data-social-form="invite-channel"><input type="hidden" name="channel_id" value="${h(id)}"><input name="usernames" placeholder="Пригласить @никнеймы через запятую"><button class="ts-mini" type="submit">+ Пригласить</button></form>`:'';
    modal(panelShell(c.title||'Канал',`${c.visibility==='private'?'ЗАКРЫТЫЙ':'ПУБЛИЧНЫЙ'} · ${c.member_count||0} участников`,`${actions}<div class="ts-channel-toolbar"><button class="ts-mini" data-social-act="channels">← Все каналы</button><span>ПОСТЫ ТОЛЬКО ВНУТРИ КАНАЛА</span><button class="ts-text-button" data-social-act="report" data-kind="channel" data-id="${h(id)}">Пожаловаться</button></div>${postForm}${inviteForm}<div class="ts-channel-posts">${posts.length?posts.map(p=>`<article class="ts-post-card"><div class="ts-post-meta"><span class="ts-post-tag">${h(p.author_name||p.author_username||'Участник')}</span><time>${h(dateLabel(p.created_at))}</time></div>${p.title?`<h4>${h(p.title)}</h4>`:''}<p>${h(p.body).replace(/\n/g,'<br>')}</p><button class="ts-text-button" data-social-act="report" data-kind="channel_post" data-id="${h(p.id)}">Пожаловаться</button></article>`).join(''):`<div class="ts-empty">В канале пока нет публикаций.</div>`}</div>`));
  }
  async function handleSearch(form){
    const query=new FormData(form).get('query')||'';let d;
    try{d=await rpc('today_social_search_users',{p_query:String(query)})}catch(e){notify(e.message);return}
    const host=byId('todaySocialSearchResults');if(!host)return;const users=Array.isArray(d.users)?d.users:[];
    host.innerHTML=`<div class="ts-list-head"><h3>Результаты поиска</h3><span class="ts-count">${users.length}</span></div>${users.length?users.map(u=>userCard(u)).join(''):`<p class="ts-muted">Никого не нашли. Проверь написание никнейма.</p>`}`;
  }
  function parseHandles(raw){return [...new Set(String(raw||'').split(/[\n,;\s]+/).map(s=>s.trim().replace(/^@/,'' )).filter(Boolean))]}
  async function onSubmit(e){
    const form=e.target.closest('form[data-social-form]');if(!form)return;
    e.preventDefault();const action=form.dataset.socialForm;const fd=new FormData(form);const btn=form.querySelector('button[type="submit"]');if(btn)btn.disabled=true;
    try{
      if(action==='start-direct'){
        const d=await rpc('today_social_create_direct_chat',{p_username:String(fd.get('username')||'').trim()});await openChat(d.chat.id,d.chat.title||String(fd.get('username')),d.chat.type);
      }else if(action==='create-group'){
        const users=parseHandles(fd.get('usernames'));const d=await rpc('today_social_create_group_chat',{p_title:String(fd.get('title')||'').trim(),p_usernames:users});await openChat(d.chat.id,d.chat.title,d.chat.type);
      }else if(action==='send-message'){
        const body=String(fd.get('body')||'').trim();if(!body)return;
        const d=await rpc('today_social_send_chat_message',{p_chat_id:activeChatId,p_body:body});const box=form.querySelector('[name="body"]');if(box)box.value='';await renderMessages(activeChatId,true);
      }else if(action==='invite-group'){
        const users=parseHandles(fd.get('usernames'));if(!users.length)throw new Error('Укажи хотя бы один никнейм.');const d=await rpc('today_social_invite_group_members',{p_chat_id:String(fd.get('chat_id')),p_usernames:users});notify(`Добавлено участников: ${d.added||0}.`);form.querySelector('[name="usernames"]').value='';
      }else if(action==='search-users'){
        await handleSearch(form);
      }else if(action==='create-profile-post'){
        const imageFile=form.querySelector('input[name="photo"]')?.files?.[0]||null;let imagePath='';let postCreated=false;
        try{
          if(imageFile){if(btn){btn.disabled=true;btn.textContent='ЗАГРУЖАЮ ФОТО…'}imagePath=await uploadProfilePostPhoto(imageFile);}
          if(btn)btn.textContent='СОХРАНЯЮ ПУБЛИКАЦИЮ…';
          const d=await rpc('today_social_create_profile_post',{p_title:String(fd.get('title')||''),p_body:String(fd.get('body')||''),p_visibility:String(fd.get('visibility')||'public'),p_image_path:imagePath||null});
          postCreated=true;notify(d.message||'Публикация добавлена.');await openProfile(await currentUser());
        }catch(e){if(imagePath&&!postCreated)try{await sb.storage.from('today-profile-media').remove([imagePath])}catch{}if(btn)btn.textContent='Опубликовать на странице ↗';throw e;}
      }else if(action==='save-settings'){
        const uid=await currentUser();const payload={user_id:uid,allow_direct_messages:!!form.elements.allow_direct_messages.checked,allow_group_invites:!!form.elements.allow_group_invites.checked,allow_friend_requests:!!form.elements.allow_friend_requests.checked,allow_profile_visits:!!form.elements.allow_profile_visits.checked,profile_visibility:String(fd.get('profile_visibility')||'public'),friend_list_visibility:String(fd.get('friend_list_visibility')||'public'),updated_at:new Date().toISOString()};
        const r=await sb.from('today_social_settings').upsert(payload,{onConflict:'user_id'});if(r.error)throw r.error;notify('Настройки приватности сохранены.');
      }else if(action==='create-channel'){
        const d=await rpc('today_social_create_channel',{p_title:String(fd.get('title')||''),p_description:String(fd.get('description')||''),p_visibility:String(fd.get('visibility')||'public')});await openChannel(d.channel.id);
      }else if(action==='create-channel-post'){
        const d=await rpc('today_social_create_channel_post',{p_channel_id:String(fd.get('channel_id')),p_title:String(fd.get('title')||''),p_body:String(fd.get('body')||'')});notify(d.message||'Пост опубликован.');await openChannel(String(fd.get('channel_id')));
      }else if(action==='invite-channel'){
        const users=parseHandles(fd.get('usernames'));if(!users.length)throw new Error('Укажи хотя бы один никнейм.');const d=await rpc('today_social_invite_channel_members',{p_channel_id:String(fd.get('channel_id')),p_usernames:users});notify(`Приглашения обработаны. Добавлено: ${d.added||0}.`);form.querySelector('[name="usernames"]').value='';
      }
    }catch(err){notify(String(err.message||err).replace(/^Error:\s*/,'').slice(0,240))}finally{if(btn)btn.disabled=false;}
  }
  async function requestFriend(username){try{const d=await rpc('today_social_send_friend_request',{p_username:String(username||'')});notify(d.message||'Заявка обработана.');if(byId('modalContent')?.textContent.includes('Друзья'))await openFriends();else if(byId('modalContent')?.textContent.includes('Моя страница'))await openProfile();}catch(e){notify(e.message)}}
  async function respondFriend(id,accept){try{const d=await rpc('today_social_respond_friend_request',{p_requester_id:id,p_accept:accept});notify(d.message||'Заявка обработана.');await openFriends()}catch(e){notify(e.message)}}
  async function promotePost(id){try{const d=await rpc('today_social_promote_profile_post',{p_post_id:id});notify(d.message||'Продвижение выполнено.');await loadPromos();if(byId('coinCount')&&d.coins!==undefined)byId('coinCount').textContent=String(d.coins);await openProfile()}catch(e){notify(e.message)}}
  async function report(kind,id){const reason=window.prompt('Коротко опиши причину жалобы:');if(!reason)return;try{const d=await rpc('today_social_report_item',{p_content_type:kind,p_content_id:String(id),p_reason:reason});notify(d.message||'Жалоба отправлена.')}catch(e){notify(e.message)}}
  async function blockUser(id){if(!window.confirm('Заблокировать пользователя? Он не сможет начать или продолжить личный диалог с тобой.'))return;try{const d=await rpc('today_social_block_user',{p_user_id:id});notify(d.message||'Пользователь заблокирован.');if(typeof closeModal==='function')closeModal()}catch(e){notify(e.message)}}
  async function handleClick(btn){
    const a=btn.dataset.socialAct,id=btn.dataset.id,username=btn.dataset.username,title=btn.dataset.title,type=btn.dataset.type;
    if(a==='chats')return openChats();if(a==='friends')return openFriends();if(a==='my-profile')return openProfile();if(a==='settings')return openSettings();if(a==='channels')return openChannels();
    if(a==='open-chat')return openChat(id,title,type);if(a==='refresh-chats')return openChats();if(a==='open-profile')return openProfile(id);if(a==='request-friend')return requestFriend(username);if(a==='direct'){try{const d=await rpc('today_social_create_direct_chat',{p_username:username});return openChat(d.chat.id,d.chat.title||username,d.chat.type)}catch(e){return notify(e.message)}}
    if(a==='accept-friend')return respondFriend(id,true);if(a==='reject-friend')return respondFriend(id,false);if(a==='promote-post')return promotePost(id);if(a==='report')return report(btn.dataset.kind,id);if(a==='block-user')return blockUser(id);
    if(a==='open-channel'){
      try{const d=await rpc('today_social_get_channel_posts',{p_channel_id:id});if(!d.channel.is_member&&d.channel.visibility==='public'){const joined=await rpc('today_social_join_channel',{p_channel_id:id});notify(joined.message||'Ты вступил в канал.')}return openChannel(id)}catch(e){notify(e.message);return}
    }
    if(a==='join-channel'){try{const d=await rpc('today_social_join_channel',{p_channel_id:id});notify(d.message||'Ты вступил в канал.');return openChannel(id)}catch(e){return notify(e.message)}}
  }
  function setup(){
    installModalSafety();
    injectNav();injectPromo();document.addEventListener('click',e=>{const b=e.target.closest('[data-social-act]');if(!b)return;e.preventDefault();handleClick(b)});document.addEventListener('submit',onSubmit);
    document.addEventListener('change',e=>{const input=e.target;if(!(input instanceof HTMLInputElement)||input.name!=='photo'||!input.matches('[data-social-photo]'))return;const form=input.closest('form');const preview=form?.querySelector('[data-social-photo-preview]');if(!preview)return;const oldUrl=preview.dataset.objectUrl;if(oldUrl)try{URL.revokeObjectURL(oldUrl)}catch{};preview.replaceChildren();const file=input.files?.[0];if(!file){preview.hidden=true;delete preview.dataset.objectUrl;return;}if(file.size>15*1024*1024){input.value='';preview.hidden=true;notify('Фото слишком большое: максимум 15 МБ.');return;}if(!/^image\/(jpeg|png|webp)$/i.test(file.type)){input.value='';preview.hidden=true;notify('Выбери фото JPG, PNG или WebP.');return;}const url=URL.createObjectURL(file);preview.dataset.objectUrl=url;const img=document.createElement('img');img.src=url;img.alt='Предпросмотр выбранной фотографии';img.className='ts-post-image-preview';preview.append(img);const info=document.createElement('span');info.textContent=file.name;preview.append(info);preview.hidden=false;});
    const close=byId('modalClose');if(close)close.addEventListener('click',()=>{stopPoll();const m=byId('modal');if(m)m.classList.remove('today-social-modal')});
    const modalRoot=byId('modal');if(modalRoot){const mo=new MutationObserver(()=>{if(modalRoot.classList.contains('hidden')){stopPoll();modalRoot.classList.remove('today-social-modal');for(const preview of modalRoot.querySelectorAll('.ts-photo-preview[data-object-url]')){try{URL.revokeObjectURL(preview.dataset.objectUrl)}catch{}delete preview.dataset.objectUrl;preview.replaceChildren();preview.hidden=true;}}});mo.observe(modalRoot,{attributes:true,attributeFilter:['class']})}
    loadPromos();
  }
  window.TODAY_SOCIAL={version:VERSION,openChats,openFriends,openProfile,openSettings,openChannels,loadPromos};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
