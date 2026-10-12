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
  async function currentUser(){let timer;try{const r=await Promise.race([sb.auth.getSession(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Проверка аккаунта заняла слишком много времени.')),8000)})]);viewerId=r?.data?.session?.user?.id||null;return viewerId}catch(e){console.warn('TODAY currentUser timeout/error',e);return null}finally{clearTimeout(timer)}}
  async function needUser(){const id=await currentUser();if(id)return id;try{if(typeof requireAuth==='function')requireAuth()}catch{}notify('Войди в аккаунт, чтобы пользоваться социальной частью TODAY.');return null}
  async function rpc(name,args={}){
    let timer;
    let result;
    try {
      result = await Promise.race([
        Promise.resolve().then(()=>sb.rpc(name,args)),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Запрос к серверу ('+String(name)+') не ответил за 15 секунд. Проверь соединение и повтори попытку.')),15000)})
      ]);
    } finally { clearTimeout(timer); }
    const {data,error}=result||{};
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
    const card = root.querySelector('.modal-card');
    const host = byId('modalContent');
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
    }
    if (card && bar.parentElement !== card) {
      if (host && host.parentElement === card) card.insertBefore(bar, host);
      else card.prepend(bar);
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

  /* TODAY_SOCIAL_RENDER_GUARD_V19 — ensure visible route content and show diagnostic instead of blank background. */
  /* TODAY_SOCIAL_MODAL_RENDER_V20_BEGIN — render social pages in the proven visible modal, not the blank full-screen route. */
  function renderSocialPage(page, restoreScroll = false) {
    const root = byId('modal');
    const host = byId('modalContent');
    if (!root || !host || !page) return;
    try { if (typeof stopTodayMiniGame === 'function') stopTodayMiniGame(); } catch (error) { console.warn('TODAY game cleanup', error); }
    try { if (typeof stopPoll === 'function') stopPoll(); } catch (error) { console.warn('TODAY polling cleanup', error); }
    try {
      // Disable V16/V19 full-screen mode. It was responsible for background-only rendering on affected clients.
      document.documentElement.classList.remove('today-social-page-mode');
      document.body.classList.remove('today-social-page-mode');
      root.classList.remove('hidden', 'today-social-page');
      root.classList.add('today-social-modal');
      const bar = ensureSocialPageBar();
      const titleNode = bar && bar.querySelector('#todaySocialPageTitle');
      if (titleNode) titleNode.textContent = page.title || 'TODAY SOCIAL';

      host.innerHTML = String(page.html || '').trim() || '<section class="ts-panel"><div class="ts-panel-head"><div><div class="ts-kicker">TODAY / SOCIAL</div><h2>Раздел пуст</h2><p>Не получено содержимое страницы. Нажми назад и попробуй ещё раз.</p></div></div></section>';
      if (page.chatId) host.dataset.chatId = page.chatId;
      else delete host.dataset.chatId;

      const card = root.querySelector('.modal-card');
      if (!card) throw new Error('Не найден контейнер .modal-card');
      // Remove inline full-screen styles left by older renderers before applying the modal layout.
      const clearStyle = (node, keys) => keys.forEach(key => node && node.style && node.style.removeProperty(key));
      clearStyle(root, ['display','visibility','opacity','position','inset','z-index','width','height','max-height','overflow','place-items','padding']);
      clearStyle(card, ['display','visibility','opacity','position','inset','z-index','width','min-width','max-width','height','max-height','overflow','overflow-x','overflow-y','margin']);
      clearStyle(host, ['display','visibility','opacity','position','inset','z-index','width','min-width','max-width','height','max-height','min-height','overflow','overflow-x','overflow-y','margin','padding','color']);

      // Keep the proven centered modal and make sure it and its actual content are visible.
      root.style.setProperty('display', 'grid', 'important');
      root.style.setProperty('position', 'fixed', 'important');
      root.style.setProperty('inset', '0', 'important');
      root.style.setProperty('z-index', '2147482000', 'important');
      root.style.setProperty('visibility', 'visible', 'important');
      root.style.setProperty('opacity', '1', 'important');
      card.style.setProperty('display', 'block', 'important');
      card.style.setProperty('position', 'relative', 'important');
      card.style.setProperty('visibility', 'visible', 'important');
      card.style.setProperty('opacity', '1', 'important');
      card.style.setProperty('width', 'min(980px, calc(100vw - 24px))', 'important');
      card.style.setProperty('max-width', '980px', 'important');
      card.style.setProperty('height', 'auto', 'important');
      card.style.setProperty('max-height', 'min(90dvh, 920px)', 'important');
      card.style.setProperty('overflow-y', 'auto', 'important');
      host.style.setProperty('display', 'block', 'important');
      host.style.setProperty('position', 'relative', 'important');
      host.style.setProperty('visibility', 'visible', 'important');
      host.style.setProperty('opacity', '1', 'important');
      host.style.setProperty('width', '100%', 'important');
      host.style.setProperty('max-width', 'none', 'important');
      host.style.setProperty('color', '#edf2fa', 'important');

      if (restoreScroll) card.scrollTop = Math.max(0, Number(page.scrollTop || 0));
      else card.scrollTop = 0;
      try { resumeChatPollingForCurrentPage(); } catch (error) { console.warn('TODAY chat refresh', error); }
    } catch (error) {
      console.error('[TODAY social modal render V20]', error);
      try {
        document.documentElement.classList.remove('today-social-page-mode');
        document.body.classList.remove('today-social-page-mode');
        root.classList.remove('hidden', 'today-social-page');
        root.classList.add('today-social-modal');
        const card = root.querySelector('.modal-card');
        if (card) { card.style.setProperty('display','block','important'); card.style.setProperty('position','relative','important'); card.style.setProperty('visibility','visible','important'); }
        host.style.setProperty('display','block','important');
        host.style.setProperty('visibility','visible','important');
        host.innerHTML = `<section class="ts-panel"><div class="ts-panel-head"><div><div class="ts-kicker">TODAY / SOCIAL</div><h2>Не удалось отобразить раздел</h2><p>Ошибка выведена вместо пустого фона.</p><code>${h(String(error && error.message || error || 'неизвестная ошибка').slice(0, 500))}</code></div></div></section>`;
      } catch (secondError) { console.error('[TODAY social modal fallback]', secondError); }
    }
  }
  /* TODAY_SOCIAL_MODAL_RENDER_V20_END */
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

  /* TODAY_SOCIAL_CLOSE_DIRECT_V22_BEGIN — close directly; never wait for history.back(). */
  function forceCloseSocialModal(event) {
    if (event) {
      try { event.preventDefault(); } catch (_) {}
      try { event.stopPropagation(); } catch (_) {}
      try { event.stopImmediatePropagation(); } catch (_) {}
    }
    const root = byId('modal');
    const host = byId('modalContent');
    const html = document.documentElement;
    const body = document.body;
    try { if (typeof stopPoll === 'function') stopPoll(); } catch (error) { console.warn('TODAY close polling cleanup', error); }
    try { if (typeof stopTodayMiniGame === 'function') stopTodayMiniGame(); } catch (error) { console.warn('TODAY close game cleanup', error); }

    const scrollValue = window.__todayModalScrollY;
    const savedScrollY = (typeof scrollValue === 'number' && Number.isFinite(scrollValue))
      ? scrollValue : Number(socialRouteOriginScrollY || 0);
    const savedBody = (window.__todayModalBodyStyle && typeof window.__todayModalBodyStyle === 'object')
      ? window.__todayModalBodyStyle
      : (socialRouteOriginBodyStyle && typeof socialRouteOriginBodyStyle === 'object' ? socialRouteOriginBodyStyle : {});

    const clearStyle = (node, keys) => {
      if (!node || !node.style) return;
      for (const key of keys) { try { node.style.removeProperty(key); } catch (_) {} }
    };
    if (root) {
      clearStyle(root, ['display','visibility','opacity','position','inset','z-index','width','height','max-height','overflow','place-items','padding']);
      const card = root.querySelector('.modal-card');
      clearStyle(card, ['display','visibility','opacity','position','inset','z-index','width','min-width','max-width','height','max-height','overflow','overflow-x','overflow-y','margin']);
      root.classList.add('hidden');
      root.classList.remove('today-social-modal', 'today-social-page');
      const bar = root.querySelector('#todaySocialPageBar');
      if (bar) bar.remove();
      for (const preview of root.querySelectorAll('[data-object-url]')) {
        try { URL.revokeObjectURL(preview.dataset.objectUrl); } catch (_) {}
        delete preview.dataset.objectUrl;
      }
    }
    if (host) {
      delete host.dataset.chatId;
      clearStyle(host, ['display','visibility','opacity','position','inset','z-index','width','min-width','max-width','height','max-height','min-height','overflow','overflow-x','overflow-y','margin','padding','color']);
    }
    body.style.position = savedBody.position || '';
    body.style.top = savedBody.top || '';
    body.style.left = savedBody.left || '';
    body.style.right = savedBody.right || '';
    body.style.width = savedBody.width || '';
    body.style.overflow = savedBody.overflow || '';
    html.classList.remove('today-modal-open', 'today-social-page-mode');
    body.classList.remove('today-social-page-mode');

    // Invalidate stale V16 history state in memory; closing must never call history.back().
    socialRouteActive = false;
    socialRouteSession = '';
    socialRoutePages = [];
    socialRouteDepth = 0;
    socialRouteOriginBodyStyle = null;
    socialRouteBodyRestored = false;
    window.__todayModalBodyStyle = null;
    window.__todayModalScrollY = null;
    try { window.scrollTo(0, Math.max(0, savedScrollY)); } catch (_) {}
  }
  /* TODAY_SOCIAL_CLOSE_DIRECT_V22_END */

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

  /* TODAY_SOCIAL_DIRECT_MODAL_V21_BEGIN — no full-screen route / no pushState. */
  function modal(html) {
    const root = byId('modal');
    const host = byId('modalContent');
    if (!root || !host) return;
    try { if (typeof stopPoll === 'function') stopPoll(); } catch (_) {}
    document.documentElement.classList.remove('today-social-page-mode');
    document.body.classList.remove('today-social-page-mode');
    root.classList.remove('today-social-page');
    root.classList.add('today-social-modal');

    const card = root.querySelector('.modal-card');
    const clearStyle = (node, keys) => keys.forEach(key => node && node.style && node.style.removeProperty(key));
    // Strip inline styles written by the previous V19 full-page renderer.
    clearStyle(root, ['display','visibility','opacity','position','inset','z-index','width','height','max-height','overflow','place-items','padding']);
    clearStyle(card, ['display','visibility','opacity','position','inset','z-index','width','min-width','max-width','height','max-height','overflow','overflow-x','overflow-y','margin']);
    clearStyle(host, ['display','visibility','opacity','position','inset','z-index','width','min-width','max-width','height','max-height','min-height','overflow','overflow-x','overflow-y','margin','padding','color']);

    // Keep the navigation bar inside the actual modal card. It doubles as a safe close control.
    const bar = ensureSocialPageBar();
    const title = socialPageTitle(html);
    const titleNode = bar && bar.querySelector('#todaySocialPageTitle');
    if (titleNode) titleNode.textContent = title;

    // The legacy route stack must not control the active view anymore.
    socialRouteActive = false;
    socialRoutePages = [];
    socialRouteDepth = 0;
    socialRouteBodyRestored = false;

    if (typeof openModal === 'function') openModal(String(html || ''));
    else { host.innerHTML = String(html || ''); root.classList.remove('hidden'); }
    root.classList.remove('today-social-page');
    root.classList.add('today-social-modal');
  }
  /* TODAY_SOCIAL_DIRECT_MODAL_V21_END */
  /* TODAY_SOCIAL_PAGES_V16_JS_END */
  function stopPoll(){if(chatPoll){clearInterval(chatPoll);chatPoll=null}activeChatId=null;}
  function panelShell(title,sub,content){return `<section class="ts-panel"><div class="ts-panel-head"><div><div class="ts-kicker">TODAY SOCIAL / ${VERSION}</div><h2>${h(title)}</h2>${sub?`<p>${h(sub)}</p>`:''}</div><span class="ts-orbit" aria-hidden="true">✦</span></div>${content}</section>`}
  function avatar(user,size=''){
    const url=String(user?.avatar_url||'');
    return `<span class="ts-avatar ${size}">${url?`<img src="${h(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:h((user?.name||user?.username||'✦').trim().slice(0,1).toUpperCase()||'✦')}</span>`;
  }
  function wireTopSocialNav(nav){
    if(!nav||nav.dataset.todayDirectActionsBound==='1')return;
    nav.dataset.todayDirectActionsBound='1';
    nav.addEventListener('click',event=>{
      const target=event.target&&typeof event.target.closest==='function'?event.target.closest('[data-social-act]'):null;
      if(!target||!nav.contains(target))return;
      event.preventDefault();event.stopPropagation();
      Promise.resolve().then(()=>handleClick(target)).catch(error=>{
        console.error('[TODAY social navigation]',error);
        notify('Не удалось открыть раздел: '+String(error&&error.message||error||'неизвестная ошибка').slice(0,120));
      });
    });
  }
  function injectNav(){
    const existing=byId('todaySocialNav');if(existing){wireTopSocialNav(existing);return;}
    const nav=document.createElement('nav');nav.id='todaySocialNav';nav.className='today-social-nav shell';nav.setAttribute('aria-label','Социальные разделы TODAY');
    nav.innerHTML=`<div class="ts-brand-chip"><span class="ts-live-dot"></span><span><b>YOUR SOCIAL SPACE</b><small>Люди остаются. День меняется.</small></span></div><div class="ts-nav-actions"><button data-social-act="chats"><span>◌</span>Сообщения</button><button data-social-act="friends"><span>♧</span>Друзья</button><button data-social-act="my-profile"><span>✦</span>Моя страница</button><button data-social-act="channels"><span>▤</span>Каналы</button><button data-social-act="settings"><span>⚙</span>Приватность и безопасность</button><button data-social-act="mini-games"><span>✦</span>Мини-игры</button></div>`;
    const top=document.querySelector('.topbar');if(top)top.insertAdjacentElement('afterend',nav);else document.body.prepend(nav);
    wireTopSocialNav(nav);
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
    let d;try{d=await rpc('today_social_list_chats')}catch(e){modal(panelShell('Сообщения','Не удалось загрузить диалоги.',`<div class="ts-error-panel"><strong>Соединение не ответило.</strong><p>${h(e.message||e)}</p><button class="ts-primary" data-social-act="chats">Повторить ↻</button></div>`));return}
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
    }catch(e){modal(panelShell('Друзья','Не удалось загрузить список друзей.',`<div class="ts-error-panel"><strong>Соединение не ответило.</strong><p>${h(e.message||e)}</p><button class="ts-primary" data-social-act="friends">Повторить ↻</button></div>`))}
  }
  async function openProfile(id){
    const uid=await currentUser();
    if(!id){if(!uid&&!await needUser())return;id=uid}
    let d;try{d=await rpc('today_social_profile_page',{p_user_id:id})}catch(e){modal(panelShell('Страница недоступна','',`<div class="ts-empty">${h(e.message)}</div>`));return}
    if(!d.ok||!d.profile){modal(panelShell('Страница недоступна','',`<div class="ts-empty">${h(d.message||'Эту страницу нельзя посмотреть.')}</div>`));return}
    const p=d.profile,own=!!d.is_self,rawPosts=Array.isArray(d.posts)?d.posts:[],friends=Array.isArray(d.friends)?d.friends:[];let posts=[];try{posts=await todayWithTimeout(signProfilePostPhotos(rawPosts),8000,'Загрузка фотографий заняла слишком много времени.')}catch(photoError){console.warn('TODAY profile photos timeout',photoError);posts=rawPosts.map(post=>({...post,image_url:''}))}const stories=await loadProfileStories(p.id);
    const friendshipAction=own?'':d.friend_status==='friends'?`<span class="ts-status-chip">✓ Вы друзья</span>`:d.friend_status==='outgoing'?`<span class="ts-status-chip">Заявка отправлена</span>`:d.friend_status==='incoming'?`<button class="ts-primary" data-social-act="accept-friend" data-id="${h(p.id)}">Принять заявку</button>`:`<button class="ts-primary" data-social-act="request-friend" data-username="${h(p.username)}">＋ Добавить в друзья</button>`;
    const mainAction=own?`<button class="ts-primary" data-social-act="settings">Настроить приватность</button>`:`<button class="ts-mini" data-social-act="direct" data-username="${h(p.username)}">Написать</button>${friendshipAction}`;
    const createPost=own?`<form class="ts-form-card ts-create-post" data-social-form="create-profile-post"><h3>Оставить запись на своей странице</h3><label>Заголовок <small>необязательно</small><input name="title" maxlength="140" placeholder="Коротко и по делу"></label><label>Текст публикации<textarea name="body" rows="4" maxlength="5000" placeholder="Это останется здесь и завтра…" required></textarea></label><label class="ts-photo-field"><span>Фотография <small>необязательно</small></span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" data-social-photo><small>JPG, PNG или WebP · до 15 МБ. Изображение будет автоматически сжато.</small></label><div class="ts-photo-preview" data-social-photo-preview hidden></div><label>Кто увидит<select name="visibility"><option value="public">Все пользователи</option><option value="friends">Только друзья</option><option value="private">Только я</option></select></label><button class="ts-primary" type="submit">Опубликовать на странице ↗</button><span class="ts-helper">Публикации профиля постоянные и не удаляются в полночь. Фото защищено настройками доступа.</span></form>`:'';
    const friendBlock=`<div class="ts-profile-friends"><div class="ts-list-head"><h3>Друзья</h3><span class="ts-count">${friends.length}</span></div>${friends.length?friends.slice(0,12).map(u=>`<button class="ts-friend-chip" data-social-act="open-profile" data-id="${h(u.id)}">${avatar(u,'small')}<span>${h(u.name||u.username)}</span></button>`).join(''):`<p class="ts-muted">${own?'Добавляй участников в друзья — они появятся здесь.':'Список друзей недоступен или пока пуст.'}</p>`}</div>`;
    const reportUser=!own?`<div class="ts-profile-tools"><button class="ts-text-button" data-social-act="block-user" data-id="${h(p.id)}">Заблокировать</button><button class="ts-text-button" data-social-act="report" data-kind="user" data-id="${h(p.id)}">Пожаловаться на профиль</button></div>`:'';const storiesMarkup=profileStoriesMarkup(stories,own,p.id);const profileBanner=`<section class="ts-profile-cover"><div class="ts-profile-cover-orbit" aria-hidden="true"></div><div class="ts-profile-cover-copy"><span>TODAY / PERSONAL SPACE</span><strong>${own?'ТВОЯ ИСТОРИЯ ПРОДОЛЖАЕТСЯ':'ПРОСТРАНСТВО УЧАСТНИКА'}</strong><small>Люди остаются. День меняется.</small></div><span class="ts-profile-cover-mark" aria-hidden="true">✦</span></section><div class="ts-profile-stats"><div><b>${posts.length}</b><span>ПУБЛИКАЦИИ</span></div><div><b>${friends.length}</b><span>ДРУЗЬЯ</span></div><div><b>${stories.length}</b><span>ИСТОРИИ</span></div></div>`;
    modal(panelShell(own?'Моя страница':p.name||p.username,own?'Твоя постоянная история в TODAY.':`Профиль @${String(p.username||'').replace(/^@/,'')}`,`<div class="ts-profile-hero">${avatar(p,'large')}<div><h3>${h(p.name||p.username||'Участник')}</h3><span>@${h(String(p.username||'').replace(/^@/,''))}</span><p>${h(p.bio||'Пока без описания.')}</p><div class="ts-profile-actions">${mainAction}</div></div></div>${profileBanner}${reportUser}${storiesMarkup}${createPost}<div class="ts-profile-content"><div class="ts-profile-wall"><div class="ts-list-head"><h3>Публикации</h3><span class="ts-count">${posts.length}</span></div>${posts.length?posts.map(q=>profilePostCard(q,own)).join(''):`<div class="ts-empty">${own?'Твоя страница готова к первой записи.':'Пока нет публикаций, доступных для просмотра.'}</div>`}</div>${friendBlock}</div>`));
  }
  async function openSettings(){
    const uid=await needUser();if(!uid)return;
    const pageTitle='Приватность и безопасность';
    modal(panelShell(pageTitle,'Загружаем твои настройки.','<div class="ts-loading-panel"><span class="ts-loading-spinner"></span>Проверяем настройки приватности…</div>'));
    let current={};try{const q=await todayWithTimeout(sb.from('today_social_settings').select('*').eq('user_id',uid).maybeSingle(),10000,'Настройки не ответили за 10 секунд.');if(q.error)throw q.error;current=q.data||{}}
    catch(e){modal(panelShell(pageTitle,'Не удалось загрузить настройки.',`<div class="ts-error-panel"><strong>Страница открыта, но сервер настроек не ответил.</strong>Проверь подключение и попробуй ещё раз.<code>${h(e.message||e)}</code><button class="ts-primary" type="button" data-social-act="retry-settings">Повторить ↻</button></div>`));return}
    const val=(k,d)=>current[k]===undefined||current[k]===null?d:current[k];
    modal(panelShell('Приватность и безопасность','Ты решаешь, кто может входить в твоё социальное пространство.',`<form class="ts-settings-form" data-social-form="save-settings"><div class="ts-settings-group"><div class="ts-settings-title"><h3>Сообщения и приглашения</h3><p>Эти правила проверяются сервером.</p></div><label class="ts-toggle-row"><span><b>Личные сообщения</b><small>Разрешить участникам начинать и продолжать диалоги</small></span><input type="checkbox" name="allow_direct_messages" ${val('allow_direct_messages',true)?'checked':''}><i></i></label><label class="ts-toggle-row"><span><b>Приглашения в группы</b><small>Разрешить добавлять тебя в групповые чаты</small></span><input type="checkbox" name="allow_group_invites" ${val('allow_group_invites',true)?'checked':''}><i></i></label><label class="ts-toggle-row"><span><b>Заявки в друзья</b><small>Разрешить другим отправлять запрос на дружбу</small></span><input type="checkbox" name="allow_friend_requests" ${val('allow_friend_requests',true)?'checked':''}><i></i></label></div><div class="ts-settings-group"><div class="ts-settings-title"><h3>Кто видит твою страницу</h3><p>Личные публикации дополнительно имеют собственную видимость.</p></div><label>Доступ к профилю<select name="profile_visibility"><option value="public" ${val('profile_visibility','public')==='public'?'selected':''}>Все пользователи</option><option value="friends" ${val('profile_visibility','public')==='friends'?'selected':''}>Только друзья</option><option value="private" ${val('profile_visibility','public')==='private'?'selected':''}>Закрытая страница</option></select></label><label class="ts-toggle-row"><span><b>Разрешить переход на страницу</b><small>Если выключить, даже публичный профиль будет недоступен другим</small></span><input type="checkbox" name="allow_profile_visits" ${val('allow_profile_visits',true)?'checked':''}><i></i></label><label>Кто видит список друзей<select name="friend_list_visibility"><option value="public" ${val('friend_list_visibility','public')==='public'?'selected':''}>Все пользователи</option><option value="friends" ${val('friend_list_visibility','public')==='friends'?'selected':''}>Только друзья</option><option value="private" ${val('friend_list_visibility','public')==='private'?'selected':''}>Только я</option></select></label></div><button class="ts-primary ts-save" type="submit">Сохранить настройки ↗</button><div class="ts-helper">В общем чате нельзя отправлять мат, оскорбления и политические высказывания. Нарушение создаёт общесайтовый запрет на публикации. Нужна осторожность: автоматический фильтр может ошибаться.</div></form>`));
  }
/* TODAY SOCIAL STORIES + MINI GAMES V17 BEGIN */
  const todayStoryCache = new Map();
  let todayMiniGameCleanup = null;
  let todayMiniGameRuntime = null;

  function todayWithTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), ms); })
    ]).finally(() => clearTimeout(timer));
  }

  function replaceCurrentSocialPage(html, restoreScroll = false) {
    if (!socialRouteActive || !Array.isArray(socialRoutePages) || !socialRouteDepth) return modal(html);
    const root = byId('modal'), host = byId('modalContent');
    const previous = socialRoutePages[socialRouteDepth - 1];
    if (previous) {
      const card = root?.querySelector('.modal-card');
      previous.scrollTop = card ? card.scrollTop : 0;
      previous.chatId = host?.dataset?.chatId || previous.chatId || null;
    }
    const page = {
      html: String(html || ''),
      title: socialPageTitle(html),
      scrollTop: restoreScroll && previous ? previous.scrollTop : 0,
      chatId: previous?.chatId || null
    };
    socialRoutePages[socialRouteDepth - 1] = page;
    history.replaceState(socialRouteState(socialRouteDepth), '', location.href);
    renderSocialPage(page, restoreScroll);
  }

  function stopTodayMiniGame() {
    if (typeof todayMiniGameCleanup === 'function') {
      try { todayMiniGameCleanup(); } catch (error) { console.warn('TODAY game cleanup', error); }
    }
    todayMiniGameCleanup = null;
    todayMiniGameRuntime = null;
  }

  function gameBest(gameId) {
    try { return Math.max(0, Number(localStorage.getItem('today-game-best-' + gameId) || 0)); }
    catch (_) { return 0; }
  }

  async function saveGameResult(gameId, score, durationSec) {
    const safeScore = Math.max(0, Math.floor(Number(score) || 0));
    const oldBest = gameBest(gameId);
    try { localStorage.setItem('today-game-best-' + gameId, String(Math.max(oldBest, safeScore))); } catch (_) {}
    const localNode = document.querySelector(`[data-local-best="${gameId}"]`);
    if (localNode) localNode.textContent = String(Math.max(oldBest, safeScore));
    if (safeScore <= 0) return;
    try {
      if (!await currentUser()) return;
      const result = await todayWithTimeout(
        rpc('today_mini_game_submit_score', {p_game_id: gameId, p_score: safeScore, p_duration_sec: Math.max(0, Math.floor(Number(durationSec) || 0))}),
        10000, 'Сохранение рекорда заняло слишком много времени.'
      );
      if (result?.ok) notify(`Результат сохранён · рекорд дня ${result.best_score}.`);
    } catch (error) { console.warn('TODAY game score save', error); notify('Рекорд сохранён на этом устройстве; онлайн-результат пока недоступен.'); }
  }

  const TODAY_GAMES = {
    match3: {title:'TODAY MATCH', subtitle:'Собирай линии из трёх и более кристаллов за 60 секунд.', label:'Три в ряд', symbol:'✦'},
    flappy: {title:'NIGHT FLIGHT', subtitle:'Одно касание — один взмах. Пролетай между воротами и побей рекорд.', label:'Полёт', symbol:'✈'},
    merge2048: {title:'MERGE 2048', subtitle:'Сдвигай числа, объединяй одинаковые плитки и доберись до 2048.', label:'Числа', symbol:'2048'},
    memory: {title:'REMEMBER', subtitle:'Открывай пары символов и заканчивай поле за минимальное число ходов.', label:'Память', symbol:'◈'}
  };


/* TODAY ARCADE EXPANSION V23 BEGIN — 10 self-contained local games + inline SVG covers. */
  const EXTRA_GAME_IDS = ['snake','pulse','breakout','ttt','word','colorsnap','stacker','laserdodge','quiz','starcatch'];
  const EXTRA_GAME_META = {
    snake:{title:'NEON SNAKE',subtitle:'Собирай светящиеся ядра, не врезайся в стены и собственный хвост.',label:'Змейка',symbol:'〰'},
    pulse:{title:'PULSE REACTION',subtitle:'Дождись зелёного сигнала и нажми как можно быстрее. Не торопись.',label:'Реакция',symbol:'ϟ'},
    breakout:{title:'NEON BREAKOUT',subtitle:'Отбивай шар платформой, разбивай все блоки и не теряй жизни.',label:'Арканоид',symbol:'▥'},
    ttt:{title:'X / O DUEL',subtitle:'Сыграй крестиками против компьютера. Он блокирует опасные линии.',label:'Крестики',symbol:'×○'},
    word:{title:'WORD SHIFT',subtitle:'Расшифровывай перемешанные русские слова за 45 секунд.',label:'Слова',symbol:'Aa'},
    colorsnap:{title:'COLOR SNAP',subtitle:'Выбирай настоящий цвет букв, а не слово. Сколько успеешь за 30 секунд?',label:'Цвета',symbol:'●'},
    stacker:{title:'SKY STACKER',subtitle:'Останавливай движущийся блок максимально точно. Каждый этаж ускоряет игру.',label:'Башня',symbol:'▤'},
    laserdodge:{title:'LASER DODGE',subtitle:'Уклоняйся от лазерных импульсов, меняя полосу. Продержись 30 секунд.',label:'Лазеры',symbol:'⌁'},
    quiz:{title:'QUICK QUIZ',subtitle:'10 быстрых вопросов на логику, природу, технологии и общие знания.',label:'Викторина',symbol:'?'},
    starcatch:{title:'STAR CATCHER',subtitle:'Лови падающие звёзды корзиной, уворачивайся от тёмных осколков.',label:'Звёзды',symbol:'✦'}
  };
  Object.assign(TODAY_GAMES, EXTRA_GAME_META);

  function gameArtwork(id) {
    const art = {
      match3:`<path d="M48 86 67 48 86 86 67 104Z" fill="#bca2ff"/><path d="M99 65 117 29 136 65 117 84Z" fill="#79d9ff"/><path d="M126 100 146 60 166 100 146 119Z" fill="#80f1d6"/><path d="M180 73 197 39 214 73 197 91Z" fill="#ffd59a"/><path d="M219 101 236 68 253 101 236 119Z" fill="#ff9dc6"/>`,
      flappy:`<circle cx="252" cy="29" r="15" fill="#b2c9ff" opacity=".85"/><path d="M253 17a14 14 0 1 0 13 22A16 16 0 0 1 253 17Z" fill="#182546"/><path d="M238 45V101H255V45Z" fill="#71e5d5"/><path d="M230 45H263V54H230Z" fill="#c8fff5"/><path d="M238 88H255V133H238Z" fill="#71e5d5"/><path d="M45 77q16-17 32 0q-16-7-32 0Z" fill="#fff"/><ellipse cx="91" cy="72" rx="24" ry="18" fill="#8bf1dc"/><path d="M87 68q-23-25-29 1q14 1 29-1Z" fill="#d2fff8"/><circle cx="100" cy="67" r="3" fill="#172942"/><path d="M112 72 127 78 112 82Z" fill="#ffd18a"/>`,
      merge2048:`<g transform="rotate(-10 100 68)"><rect x="48" y="30" width="67" height="67" rx="13" fill="#29496a" stroke="#86c8ff"/><text x="81" y="73" font-size="25" text-anchor="middle" fill="#e9f7ff" font-weight="800">2</text></g><g transform="rotate(8 166 62)"><rect x="130" y="21" width="72" height="72" rx="14" fill="#327e8a" stroke="#91ffdf"/><text x="166" y="65" font-size="27" text-anchor="middle" fill="#eafffa" font-weight="800">8</text></g><g transform="rotate(-4 221 91)"><rect x="191" y="61" width="64" height="64" rx="12" fill="#7762bd" stroke="#d8c4ff"/><text x="223" y="101" font-size="21" text-anchor="middle" fill="#fff" font-weight="800">16</text></g>`,
      memory:`<g transform="rotate(-10 102 74)"><rect x="62" y="31" width="72" height="91" rx="12" fill="#172746" stroke="#a4c6ff" stroke-width="2"/><text x="98" y="91" font-size="34" text-anchor="middle" fill="#8ff2d5">✦</text></g><g transform="rotate(9 204 67)"><rect x="168" y="22" width="72" height="91" rx="12" fill="#26365d" stroke="#b4a1ff" stroke-width="2"/><text x="204" y="81" font-size="30" text-anchor="middle" fill="#d9cdff">◈</text></g>`,
      snake:`<path d="M48 105H91Q112 105 112 84V53Q112 35 132 35H167Q185 35 185 54V72Q185 90 205 90H246" fill="none" stroke="#61f1d2" stroke-width="20" stroke-linecap="round"/><path d="M48 105H91Q112 105 112 84V53Q112 35 132 35H167" fill="none" stroke="#c1fff1" stroke-width="4" stroke-linecap="round" opacity=".85"/><circle cx="245" cy="90" r="13" fill="#ff87b1"/><path d="M245 77q0-10 10-10" fill="none" stroke="#9df6c6" stroke-width="4" stroke-linecap="round"/><circle cx="249" cy="88" r="2.2" fill="#142139"/>`,
      pulse:`<path d="M34 77H78L96 48L124 108L151 61L170 78H286" fill="none" stroke="#74ffe0" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 77H78L96 48L124 108L151 61L170 78H286" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/><circle cx="124" cy="108" r="6" fill="#e8fff8"/>`,
      breakout:`<g stroke="#e5edff" stroke-opacity=".36"><rect x="40" y="26" width="49" height="18" rx="5" fill="#9d8cff"/><rect x="95" y="26" width="49" height="18" rx="5" fill="#6edfd4"/><rect x="150" y="26" width="49" height="18" rx="5" fill="#87b9ff"/><rect x="205" y="26" width="49" height="18" rx="5" fill="#ff9fbd"/><rect x="67" y="50" width="49" height="18" rx="5" fill="#80c9ff"/><rect x="122" y="50" width="49" height="18" rx="5" fill="#f6d08d"/><rect x="177" y="50" width="49" height="18" rx="5" fill="#9b8dff"/></g><circle cx="164" cy="92" r="8" fill="#fff"/><path d="M115 119H211" stroke="#79f4da" stroke-width="10" stroke-linecap="round"/>`,
      ttt:`<rect x="83" y="21" width="154" height="112" rx="14" fill="#131e38" stroke="#667ba5"/><path d="M134 27V127M186 27V127M89 58H231M89 96H231" stroke="#6680ab" stroke-width="4" stroke-linecap="round"/><path d="M99 36 118 52M118 36 99 52M201 75 221 91M221 75 201 91" stroke="#8ff2d5" stroke-width="6" stroke-linecap="round"/><circle cx="160" cy="78" r="13" fill="none" stroke="#bb9dff" stroke-width="6"/>`,
      word:`<g transform="rotate(-8 92 70)"><rect x="48" y="34" width="57" height="72" rx="10" fill="#283f68" stroke="#a9c5ff"/><text x="76" y="80" font-size="31" font-weight="800" text-anchor="middle" fill="#f3f8ff">W</text></g><g transform="rotate(5 151 62)"><rect x="121" y="25" width="57" height="72" rx="10" fill="#317d80" stroke="#9affdf"/><text x="149" y="71" font-size="30" font-weight="800" text-anchor="middle" fill="#f3fff9">O</text></g><g transform="rotate(10 213 79)"><rect x="184" y="43" width="57" height="72" rx="10" fill="#6f5db5" stroke="#d7caff"/><text x="212" y="88" font-size="29" font-weight="800" text-anchor="middle" fill="#fff">R</text></g>`,
      colorsnap:`<circle cx="89" cy="70" r="35" fill="#ff668c"/><circle cx="151" cy="51" r="27" fill="#6da8ff"/><circle cx="203" cy="82" r="33" fill="#72efd2"/><circle cx="130" cy="108" r="14" fill="#ffd27a"/><circle cx="89" cy="70" r="17" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>`,
      stacker:`<path d="M61 119H259" stroke="#99b1d9" stroke-width="4" stroke-linecap="round"/><rect x="83" y="96" width="154" height="20" rx="4" fill="#4ab9b0" stroke="#b4fff0"/><rect x="105" y="72" width="111" height="20" rx="4" fill="#718df0" stroke="#d0d8ff"/><rect x="125" y="48" width="71" height="20" rx="4" fill="#a98cff" stroke="#e8dbff"/><rect x="137" y="25" width="45" height="18" rx="4" fill="#f4c781" stroke="#fff0c8"/>`,
      laserdodge:`<path d="M70 17V119M160 17V119M250 17V119" stroke="#7889af" stroke-width="2" stroke-dasharray="5 6"/><path d="M40 53H121M199 80H282" stroke="#ff658e" stroke-width="7" stroke-linecap="round"/><path d="M44 53H121M199 80H279" stroke="#ffdbe6" stroke-width="1.5"/><path d="M147 91 160 69 173 91 160 108Z" fill="#8ff2d5" stroke="#e3fff7" stroke-width="2"/><circle cx="160" cy="88" r="4" fill="#17324a"/>`,
      quiz:`<g transform="rotate(-5 160 69)"><rect x="81" y="20" width="158" height="102" rx="14" fill="#142340" stroke="#90b7ff" stroke-width="2"/><path d="M99 40H207M99 54H184" stroke="#7389ae" stroke-width="4" stroke-linecap="round"/><circle cx="128" cy="85" r="16" fill="#397c86" stroke="#9effe1"/><path d="m119 85 6 6 12-14" stroke="#f2fff9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><text x="188" y="96" font-size="35" font-weight="900" text-anchor="middle" fill="#c7b7ff">?</text></g>`,
      starcatch:`<path d="M47 29 52 41 65 42 55 50 58 63 47 56 36 63 39 50 29 42 42 41Z" fill="#ffda91"/><path d="M245 22 250 33 262 34 253 42 256 54 245 48 234 54 237 42 228 34 240 33Z" fill="#8ff2d5"/><path d="M145 35 150 45 161 46 153 53 155 64 145 58 135 64 137 53 129 46 140 45Z" fill="#c2a9ff"/><path d="M73 101Q160 125 247 101L233 126H87Z" fill="#4b7c95" stroke="#a1f5e5" stroke-width="3"/><path d="M77 103Q160 121 243 103" fill="none" stroke="#e4fff8" stroke-width="3"/>`
    };
    const palettes={match3:['#382e65','#122b4d'],flappy:['#122d55','#11142f'],merge2048:['#123b52','#28234f'],memory:['#19385b','#281b50'],snake:['#0b4248','#112548'],pulse:['#4c214c','#14213f'],breakout:['#422553','#142246'],ttt:['#1c315c','#32204f'],word:['#173f51','#2c2457'],colorsnap:['#432344','#18314b'],stacker:['#193c59','#332253'],laserdodge:['#4a2041','#111d3a'],quiz:['#20375d','#24244c'],starcatch:['#193d51','#25204d']};
    const colors=palettes[id]||palettes.match3;
    const body=art[id]||art.match3;
    return `<svg class="ts-game-svg ts-art-${id}" viewBox="0 0 320 140" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Иллюстрация игры ${h((TODAY_GAMES[id]||EXTRA_GAME_META[id]||{}).title||id)}"><defs><linearGradient id="ts-art-bg-${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient><radialGradient id="ts-art-glow-${id}"><stop stop-color="#9cf7e4" stop-opacity=".35"/><stop offset="1" stop-color="#8f9fff" stop-opacity="0"/></radialGradient></defs><rect width="320" height="140" rx="18" fill="url(#ts-art-bg-${id})"/><circle cx="260" cy="16" r="88" fill="url(#ts-art-glow-${id})"/><circle cx="40" cy="123" r="64" fill="#90aaff" opacity=".055"/><path d="M0 108Q78 76 153 112T320 98V140H0Z" fill="#030a19" opacity=".22"/>${body}</svg>`;
  }

  function extraGameBoard(id) {
    const hud = (left, right) => `<div class="ts-game-hud"><span>${left}<b id="todayExtraScore">0</b></span><span>${right}<b id="todayExtraTime">—</b></span></div>`;
    if (id === 'snake') return `${hud('ЯДРА','ДЛИНА')}<div id="todayExtraSnakeBoard" class="ts-extra-snake-board" role="application" aria-label="Поле змейки"></div><div class="ts-extra-controls"><button data-game-act="extra-snake-dir" data-dir="up">↑</button><div><button data-game-act="extra-snake-dir" data-dir="left">←</button><button data-game-act="extra-snake-dir" data-dir="down">↓</button><button data-game-act="extra-snake-dir" data-dir="right">→</button></div></div><p id="todayExtraStatus" class="ts-game-status">Собирай ядра. Управление — стрелками или кнопками.</p><button class="ts-mini" data-game-act="extra-restart" data-game="snake">Начать заново ↻</button>`;
    if (id === 'pulse') return `${hud('ПОПЫТКА','ЛУЧШЕЕ, МС')}<button id="todayExtraPulseTarget" class="ts-extra-pulse" data-game-act="extra-pulse"><span class="ts-pulse-core">ϟ</span><strong id="todayExtraPulseLabel">НАЧАТЬ</strong><small id="todayExtraPulseSmall">Нажми и дождись зелёного</small></button><p id="todayExtraStatus" class="ts-game-status">Не нажимай раньше сигнала — попытка сгорит.</p><button class="ts-mini" data-game-act="extra-restart" data-game="pulse">Ещё попытка ↻</button>`;
    if (id === 'breakout') return `${hud('ОЧКИ','ЖИЗНИ')}<div class="ts-extra-canvas-wrap"><canvas id="todayExtraCanvas" width="360" height="440" aria-label="NEON BREAKOUT: управляй платформой мышью, касанием или стрелками"></canvas></div><p id="todayExtraStatus" class="ts-game-status">Двигай платформу и отбивай шар. Коснись поля, чтобы запустить.</p><button class="ts-mini" data-game-act="extra-restart" data-game="breakout">Перезапустить ↻</button>`;
    if (id === 'ttt') return `${hud('ПОБЕДЫ','РАУНД')}<div id="todayExtraTttBoard" class="ts-extra-ttt-board">${Array.from({length:9},(_,i)=>`<button data-game-act="extra-ttt" data-i="${i}" aria-label="Клетка ${i+1}"></button>`).join('')}</div><p id="todayExtraStatus" class="ts-game-status">Ты играешь за ✕. Компьютер играет за ○.</p><button class="ts-mini" data-game-act="extra-restart" data-game="ttt">Новый раунд ↻</button>`;
    if (id === 'word') return `${hud('ОЧКИ','ОСТАЛОСЬ')}<div class="ts-extra-word-card"><span class="ts-kicker">РАСШИФРУЙ СЛОВО</span><strong id="todayExtraScramble">— — — —</strong><label for="todayExtraWordInput">Твой ответ</label><input id="todayExtraWordInput" type="text" maxlength="24" autocomplete="off" autocapitalize="none" placeholder="Напиши слово"><div class="ts-extra-word-actions"><button class="ts-primary" data-game-act="extra-word-submit">Проверить ↗</button><button class="ts-mini" data-game-act="extra-word-skip">Пропустить</button></div></div><p id="todayExtraStatus" class="ts-game-status">45 секунд на серию слов.</p><button class="ts-mini" data-game-act="extra-restart" data-game="word">Сначала ↻</button>`;
    if (id === 'colorsnap') return `${hud('ОЧКИ','ВРЕМЯ')}<div class="ts-extra-color-prompt"><span class="ts-kicker">НЕ ЧИТАЙ СЛОВО</span><strong id="todayExtraColorWord">СИНИЙ</strong><small>Выбери цвет букв ниже</small></div><div id="todayExtraColorChoices" class="ts-extra-color-choices"></div><p id="todayExtraStatus" class="ts-game-status">30 секунд. Смотри на цвет шрифта, а не на слово.</p><button class="ts-mini" data-game-act="extra-restart" data-game="colorsnap">Новая серия ↻</button>`;
    if (id === 'stacker') return `${hud('ЭТАЖИ','РЕКОРД')}<div class="ts-extra-canvas-wrap"><canvas id="todayExtraCanvas" width="360" height="420" aria-label="SKY STACKER: коснись экрана чтобы поставить блок"></canvas></div><p id="todayExtraStatus" class="ts-game-status">Касайся поля, когда блок стоит точно над предыдущим.</p><button class="ts-mini" data-game-act="extra-restart" data-game="stacker">Перестроить ↻</button>`;
    if (id === 'laserdodge') return `${hud('СЕКУНДЫ','ОСТАЛОСЬ')}<div class="ts-extra-canvas-wrap"><canvas id="todayExtraCanvas" width="360" height="420" aria-label="LASER DODGE: уклоняйся от лазеров"></canvas></div><div class="ts-extra-controls"><button data-game-act="extra-laser-move" data-dir="left">← ПОЛОСА</button><button data-game-act="extra-laser-move" data-dir="right">ПОЛОСА →</button></div><p id="todayExtraStatus" class="ts-game-status">Продержись 30 секунд. Стрелки тоже работают.</p><button class="ts-mini" data-game-act="extra-restart" data-game="laserdodge">Новая попытка ↻</button>`;
    if (id === 'quiz') return `${hud('ОЧКИ','ВОПРОС')}<div class="ts-extra-quiz-card"><div class="ts-kicker" id="todayExtraQuizCategory">TODAY QUIZ</div><h3 id="todayExtraQuizQuestion">Готов?</h3><div id="todayExtraQuizChoices" class="ts-extra-quiz-choices"></div><p id="todayExtraStatus" class="ts-game-status">10 вопросов. За правильный ответ +100.</p></div><button class="ts-mini" data-game-act="extra-restart" data-game="quiz">Пройти заново ↻</button>`;
    if (id === 'starcatch') return `${hud('ЗВЁЗДЫ','ВРЕМЯ')}<div class="ts-extra-canvas-wrap"><canvas id="todayExtraCanvas" width="360" height="420" aria-label="STAR CATCHER: двигай корзину и лови звёзды"></canvas></div><div class="ts-extra-controls"><button data-game-act="extra-star-move" data-dir="left">←</button><button data-game-act="extra-star-move" data-dir="right">→</button></div><p id="todayExtraStatus" class="ts-game-status">Лови золотые звёзды. Тёмные осколки отнимают очки.</p><button class="ts-mini" data-game-act="extra-restart" data-game="starcatch">Сыграть ещё ↻</button>`;
    return '';
  }

  function saveExtraGameResult(id, score, duration=0) {
    const value = Math.max(0, Math.floor(Number(score)||0));
    let best = 0;
    try { best = Math.max(0, Number(localStorage.getItem('today-game-best-'+id)||0)); localStorage.setItem('today-game-best-'+id, String(Math.max(best,value))); } catch (_) {}
    const node = document.querySelector(`[data-local-best="${id}"]`); if(node) node.textContent=String(Math.max(best,value));
    const scoreNode=byId('todayExtraScore'); if(scoreNode) scoreNode.textContent=String(value);
    return Math.max(best,value);
  }

  function handleExtraMiniGameAction(action, button) {
    if (action === 'extra-restart') { openMiniGame(button.dataset.game); return true; }
    if (action === 'extra-snake-dir') { todayMiniGameRuntime?.setDir?.(button.dataset.dir); return true; }
    if (action === 'extra-pulse') { todayMiniGameRuntime?.tap?.(); return true; }
    if (action === 'extra-breakout-restart') { openMiniGame('breakout'); return true; }
    if (action === 'extra-ttt') { todayMiniGameRuntime?.tap?.(Number(button.dataset.i)); return true; }
    if (action === 'extra-word-submit') { todayMiniGameRuntime?.submit?.(); return true; }
    if (action === 'extra-word-skip') { todayMiniGameRuntime?.skip?.(); return true; }
    if (action === 'extra-color-choice') { todayMiniGameRuntime?.choose?.(button.dataset.color); return true; }
    if (action === 'extra-stack-drop') { todayMiniGameRuntime?.drop?.(); return true; }
    if (action === 'extra-laser-move') { todayMiniGameRuntime?.moveLane?.(button.dataset.dir); return true; }
    if (action === 'extra-quiz-answer') { todayMiniGameRuntime?.answer?.(Number(button.dataset.i)); return true; }
    if (action === 'extra-star-move') { todayMiniGameRuntime?.moveBasket?.(button.dataset.dir); return true; }
    return false;
  }

  function initExtraGame(id) {
    const scoreNode=byId('todayExtraScore'), timeNode=byId('todayExtraTime'), status=byId('todayExtraStatus');
    let cleanup=()=>{}; const listeners=[]; const listen=(target,event,handler,opts)=>{if(target){target.addEventListener(event,handler,opts);listeners.push(()=>target.removeEventListener(event,handler,opts));}};
    const finish=(score,seconds=0,message='Раунд завершён.')=>{scoreNode&&(scoreNode.textContent=String(Math.max(0,Math.floor(score))));status&&(status.textContent=message);saveExtraGameResult(id,score,seconds);};
    const keyListen=handler=>listen(document,'keydown',handler);
    if(id==='snake'){
      const host=byId('todayExtraSnakeBoard'),N=12; if(!host)return;
      let snake=[{x:5,y:6},{x:4,y:6},{x:3,y:6}],dir='right',next='right',food={x:9,y:6},score=0,ended=false,ticks=0,timer=null;
      const placeFood=()=>{let tries=0;do{food={x:Math.floor(Math.random()*N),y:Math.floor(Math.random()*N)};tries++;}while(snake.some(p=>p.x===food.x&&p.y===food.y)&&tries<200)};
      const draw=()=>{host.innerHTML=Array.from({length:N*N},(_,i)=>{const x=i%N,y=Math.floor(i/N),head=snake[0].x===x&&snake[0].y===y,body=snake.some((p,j)=>j>0&&p.x===x&&p.y===y),fruit=food.x===x&&food.y===y;return `<span class="ts-extra-snake-cell ${head?'head':body?'body':fruit?'food':''}">${head?'◆':fruit?'✦':''}</span>`}).join('');const b=document.querySelector('[data-local-best="snake"]');if(b)b.textContent=String(Math.max(gameBest('snake'),score));};
      const setDir=d=>{const rev={left:'right',right:'left',up:'down',down:'up'};if(d in rev&&d!==rev[dir])next=d;};
      const tick=()=>{if(ended)return;dir=next;const head={x:snake[0].x+(dir==='right'?1:dir==='left'?-1:0),y:snake[0].y+(dir==='down'?1:dir==='up'?-1:0)};const eat=head.x===food.x&&head.y===food.y;const body=eat?snake:snake.slice(0,-1);if(head.x<0||head.x>=N||head.y<0||head.y>=N||body.some(p=>p.x===head.x&&p.y===head.y)){ended=true;clearInterval(timer);finish(score,Math.round(ticks*.16),`Змейка остановилась. Собрано ядер: ${score}.`);return;}snake.unshift(head);if(!eat)snake.pop();else{score+=10;ticks++;placeFood();}ticks++;scoreNode&&(scoreNode.textContent=String(score));if(timeNode)timeNode.textContent=String(snake.length);draw();};
      const key=e=>{const map={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',KeyA:'left',KeyD:'right',KeyW:'up',KeyS:'down'};if(map[e.code]&&byId('todayExtraSnakeBoard')){e.preventDefault();setDir(map[e.code]);}};keyListen(key);timer=setInterval(tick,175);draw();todayMiniGameRuntime={id,setDir};cleanup=()=>clearInterval(timer);
    } else if(id==='pulse'){
      const btn=byId('todayExtraPulseTarget'),label=byId('todayExtraPulseLabel'),small=byId('todayExtraPulseSmall');if(!btn)return;
      let state='idle',started=0,waitTimer=null,best=Infinity;
      const bestNode=document.querySelector('[data-local-best="pulse"]');try{best=Number(localStorage.getItem('today-game-best-pulse')||0)||Infinity;}catch(_){}
      if(bestNode)bestNode.textContent=Number.isFinite(best)?String(best):'—';
      const tap=()=>{if(state==='idle'||state==='done'){state='waiting';btn.className='ts-extra-pulse waiting';label.textContent='ЖДИ ЗЕЛЁНЫЙ';small.textContent='Не нажимай пока';if(status)status.textContent='Сигнал появится через случайный промежуток.';waitTimer=setTimeout(()=>{if(state!=='waiting')return;state='ready';started=performance.now();btn.className='ts-extra-pulse ready';label.textContent='ЖМИ!';small.textContent='СЕЙЧАС';},1000+Math.random()*2600);return;}if(state==='waiting'){clearTimeout(waitTimer);state='done';btn.className='ts-extra-pulse early';label.textContent='РАНО!';small.textContent='Попробуй ещё';status&&(status.textContent='Фальстарт. Подожди зелёный сигнал.');return;}if(state==='ready'){const ms=Math.round(performance.now()-started);state='done';btn.className='ts-extra-pulse';label.textContent=ms+' МС';small.textContent='Нажми ещё раз для повтора';const stored=Number(localStorage.getItem('today-game-best-pulse')||0);if(!stored||ms<stored){try{localStorage.setItem('today-game-best-pulse',String(ms));}catch(_){}best=ms;}if(bestNode)bestNode.textContent=Number.isFinite(best)?String(best):'—';scoreNode&&(scoreNode.textContent=String(ms));status&&(status.textContent=ms<230?'Молниеносно! Отличная реакция.':ms<330?'Хорошая реакция. Попробуй быстрее.':'Можно быстрее — ещё одна попытка?');}};
      todayMiniGameRuntime={id,tap};cleanup=()=>clearTimeout(waitTimer);
    } else if(id==='breakout'){
      const canvas=byId('todayExtraCanvas'),ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;
      const W=360,H=440,cols=7,rows=4;let paddle={x:140,w:80},ball={x:180,y:350,vx:150,vy:-205,r:7},bricks=[],lives=3,score=0,launched=false,ended=false,raf=0,last=0;
      const resetBricks=()=>{bricks=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)bricks.push({x:12+c*48,y:42+r*23,w:42,h:15,alive:true,color:['#9b8cff','#67d9d0','#84b9ff','#ff9dc6'][r]});};resetBricks();
      const draw=()=>{ctx.clearRect(0,0,W,H);const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#151d3b');bg.addColorStop(1,'#080e20');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);for(const b of bricks)if(b.alive){ctx.fillStyle=b.color;ctx.beginPath();ctx.roundRect(b.x,b.y,b.w,b.h,4);ctx.fill();ctx.fillStyle='rgba(255,255,255,.25)';ctx.fillRect(b.x+4,b.y+3,b.w-8,2);}ctx.fillStyle='#92f4df';ctx.beginPath();ctx.roundRect(paddle.x,H-28,paddle.w,9,5);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();if(!launched&&!ended){ctx.fillStyle='#eaf3ff';ctx.font='700 15px sans-serif';ctx.textAlign='center';ctx.fillText('КОСНИСЬ ДЛЯ СТАРТА',W/2,H-64);}if(ended){ctx.fillStyle='rgba(2,8,22,.76)';ctx.fillRect(35,185,W-70,76);ctx.fillStyle='#fff';ctx.font='800 20px sans-serif';ctx.textAlign='center';ctx.fillText(bricks.every(b=>!b.alive)?'ВСЕ БЛОКИ РАЗБИТЫ':'РАУНД ОКОНЧЕН',W/2,216);ctx.fillStyle='#95f5df';ctx.font='14px sans-serif';ctx.fillText('Нажми «Перезапустить»',W/2,241);}};
      const end=()=>{if(ended)return;ended=true;finish(score,0,bricks.every(b=>!b.alive)?`Победа! Разбито блоков: ${score/10}.`:`Жизни закончились. Очки: ${score}.`);draw();};
      const moveTo=x=>{const rect=canvas.getBoundingClientRect();paddle.x=Math.max(0,Math.min(W-paddle.w,(x-rect.left)/rect.width*W-paddle.w/2));};
      const launch=()=>{if(ended)return;if(!launched){launched=true;ball.vy=-Math.abs(ball.vy);}};
      const down=e=>{e.preventDefault();moveTo(e.clientX);launch();};listen(canvas,'pointerdown',down);listen(canvas,'pointermove',e=>{if(e.buttons||e.pointerType==='touch')moveTo(e.clientX)});
      keyListen(e=>{if(!byId('todayExtraCanvas')||ended)return;if(e.key==='ArrowLeft'||e.key==='a'){paddle.x=Math.max(0,paddle.x-28);e.preventDefault();}if(e.key==='ArrowRight'||e.key==='d'){paddle.x=Math.min(W-paddle.w,paddle.x+28);e.preventDefault();}if(e.code==='Space'){e.preventDefault();launch();}});
      const frame=now=>{if(!byId('todayExtraCanvas'))return;const dt=Math.min(.03,Math.max(0,(now-last)/1000||0));last=now;if(launched&&!ended){ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;if(ball.x<ball.r||ball.x>W-ball.r)ball.vx*=-1;if(ball.y<ball.r)ball.vy=Math.abs(ball.vy);if(ball.vy>0&&ball.y+ball.r>=H-28&&ball.x>=paddle.x&&ball.x<=paddle.x+paddle.w){ball.vy=-Math.abs(ball.vy);ball.vx+=((ball.x-(paddle.x+paddle.w/2))/(paddle.w/2))*65;ball.y=H-39;}for(const b of bricks){if(!b.alive)continue;if(ball.x+ball.r>b.x&&ball.x-ball.r<b.x+b.w&&ball.y+ball.r>b.y&&ball.y-ball.r<b.y+b.h){b.alive=false;ball.vy*=-1;score+=10;scoreNode&&(scoreNode.textContent=String(score));break;}}if(ball.y>H+ball.r){lives--;timeNode&&(timeNode.textContent=String(lives));if(lives<=0)end();else{launched=false;ball={x:180,y:350,vx:(Math.random()-.5)*180,vy:-205,r:7};}}if(bricks.every(b=>!b.alive))end();}draw();if(!ended)raf=requestAnimationFrame(frame);};raf=requestAnimationFrame(frame);todayMiniGameRuntime={id};cleanup=()=>cancelAnimationFrame(raf);
    } else if(id==='ttt'){
      const host=byId('todayExtraTttBoard');if(!host)return;let board=Array(9).fill(''),ended=false,wins=0,round=1;
      const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      const winner=b=>{for(const line of lines)if(b[line[0]]&&b[line[0]]===b[line[1]]&&b[line[1]]===b[line[2]])return b[line[0]];return b.every(Boolean)?'draw':null;};
      const draw=()=>{[...host.children].forEach((b,i)=>{b.textContent=board[i]==='X'?'×':board[i]==='O'?'○':'';b.classList.toggle('x',board[i]==='X');b.classList.toggle('o',board[i]==='O');b.disabled=ended||!!board[i];});};
      const finishRound=w=>{ended=true;wins+=w==='X'?1:0;scoreNode&&(scoreNode.textContent=String(wins));timeNode&&(timeNode.textContent=String(round));status&&(status.textContent=w==='X'?'Ты выиграл раунд!':w==='O'?'Компьютер выиграл.':'Ничья.');saveExtraGameResult(id,wins,0);draw();};
      const ai=()=>{const candidates=board.map((v,i)=>!v?i:-1).filter(i=>i>=0);for(const token of ['O','X'])for(const i of candidates){board[i]=token;const w=winner(board);board[i]='';if(w===token)return i;}if(!board[4])return 4;const corners=[0,2,6,8].filter(i=>!board[i]);if(corners.length)return corners[Math.floor(Math.random()*corners.length)];return candidates[0];};
      const tap=i=>{if(ended||board[i])return;board[i]='X';let w=winner(board);if(w){finishRound(w);return;}const move=ai();if(move!==undefined)board[move]='O';w=winner(board);if(w)finishRound(w);else draw();};
      const setNew=()=>{board=Array(9).fill('');ended=false;round++;timeNode&&(timeNode.textContent=String(round));draw();status&&(status.textContent='Твой ход — крестики.');};
      todayMiniGameRuntime={id,tap};draw();
      // Keep the round state inside this runtime; reset reopens the game cleanly.
      const runtime=todayMiniGameRuntime;runtime.restart=setNew;
    } else if(id==='word'){
      const words=['КОСМОС','РАДУГА','КОМЕТА','ПЛАНЕТА','РОБОТ','КОД','МОЛНИЯ','ОКЕАН','ЗВЕЗДА','ЭНЕРГИЯ','ТОРНАДО','КВАНТ'];let deck=[],idx=0,score=0,ended=false,left=45,timer=null;
      const input=byId('todayExtraWordInput'),scrambleNode=byId('todayExtraScramble');if(!input||!scrambleNode)return;
      const nextWord=()=>{if(!deck.length||idx>=deck.length){deck=[...words].sort(()=>Math.random()-.5);idx=0;}const word=deck[idx++];let scrambled=word.split('');for(let i=scrambled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[scrambled[i],scrambled[j]]=[scrambled[j],scrambled[i]];}if(scrambled.join('')===word)scrambled.push(scrambled.shift());scrambleNode.textContent=scrambled.join(' · ');input.value='';};
      const submit=()=>{if(ended)return;const answer=input.value.trim().toLocaleUpperCase('ru-RU');const word=deck[idx-1];if(answer===word){score+=10;scoreNode&&(scoreNode.textContent=String(score));status&&(status.textContent='Верно! +10 очков. Следующее слово готово.');nextWord();}else status&&(status.textContent='Пока не совпало. Попробуй ещё раз.');};
      const skip=()=>{if(!ended){status&&(status.textContent='Слово пропущено. Ответ: '+(deck[idx-1]||'—'));nextWord();}};
      const end=()=>{if(ended)return;ended=true;clearInterval(timer);input.disabled=true;finish(score,45-left,`Время вышло. Решено слов: ${Math.floor(score/10)}.`);};
      nextWord();timer=setInterval(()=>{if(!byId('todayExtraWordInput')||ended){clearInterval(timer);return;}left--;timeNode&&(timeNode.textContent=left+' c');if(left<=0)end();},1000);listen(input,'keydown',e=>{if(e.key==='Enter'){e.preventDefault();submit();}});todayMiniGameRuntime={id,submit,skip};cleanup=()=>clearInterval(timer);
    } else if(id==='colorsnap'){
      const names=['КРАСНЫЙ','СИНИЙ','ЗЕЛЁНЫЙ','ЖЁЛТЫЙ'],colors={КРАСНЫЙ:'#ff6388',СИНИЙ:'#73adff','ЗЕЛЁНЫЙ':'#69efc9','ЖЁЛТЫЙ':'#ffd477'};let score=0,left=30,ended=false,timer=null,correct='';const word=byId('todayExtraColorWord'),choices=byId('todayExtraColorChoices');if(!word||!choices)return;
      const round=()=>{const wordName=names[Math.floor(Math.random()*names.length)];correct=names[Math.floor(Math.random()*names.length)];word.textContent=wordName;word.style.color=colors[correct];choices.innerHTML=names.map(n=>`<button class="ts-extra-color-choice" data-game-act="extra-color-choice" data-color="${n}"><i style="--swatch:${colors[n]}"></i>${n}</button>`).sort(()=>Math.random()-.5).join('');};
      const choose=n=>{if(ended)return;if(n===correct){score+=10;status&&(status.textContent='Верно! +10. Смотри на цвет букв.');}else{score=Math.max(0,score-5);status&&(status.textContent='Не совпало: смотри на цвет шрифта. −5.');}scoreNode&&(scoreNode.textContent=String(score));round();};
      const end=()=>{if(ended)return;ended=true;clearInterval(timer);finish(score,30-left,`Раунд окончен. Итог: ${score} очков.`);choices.querySelectorAll('button').forEach(b=>b.disabled=true);};round();timer=setInterval(()=>{if(!byId('todayExtraColorChoices')||ended){clearInterval(timer);return;}left--;timeNode&&(timeNode.textContent=left+' c');if(left<=0)end();},1000);todayMiniGameRuntime={id,choose};cleanup=()=>clearInterval(timer);
    } else if(id==='stacker'){
      const canvas=byId('todayExtraCanvas'),ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;const W=360,H=420,blockH=18;let stack=[{x:75,y:370,w:210}],moving={x:0,y:346,w:210,dir:1},speed=112,score=0,ended=false,raf=0,last=0;
      const draw=()=>{ctx.clearRect(0,0,W,H);const grad=ctx.createLinearGradient(0,0,W,H);grad.addColorStop(0,'#13284a');grad.addColorStop(1,'#0c1328');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);for(let i=0;i<stack.length;i++){const b=stack[i];ctx.fillStyle=['#64dccc','#779bff','#b29bff','#ffd18e'][i%4];ctx.fillRect(b.x,b.y,b.w,blockH);ctx.fillStyle='rgba(255,255,255,.26)';ctx.fillRect(b.x,b.y,b.w,2);}ctx.fillStyle='#a8fff0';ctx.fillRect(moving.x,moving.y,moving.w,blockH);for(let y=20;y<H;y+=35){ctx.fillStyle='rgba(200,220,255,.12)';ctx.fillRect(0,y,W,1);}if(ended){ctx.fillStyle='rgba(4,9,25,.74)';ctx.fillRect(35,170,W-70,76);ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='800 22px sans-serif';ctx.fillText('БАШНЯ ОСТАНОВЛЕНА',W/2,202);ctx.fillStyle='#9cf7e4';ctx.font='14px sans-serif';ctx.fillText(`Этажей: ${score}`,W/2,226);}};
      const end=()=>{if(ended)return;ended=true;finish(score,0,`Башня из ${score} этажей. Можно попробовать точнее.`);draw();};
      const drop=()=>{if(ended)return;const prev=stack[stack.length-1],left=Math.max(moving.x,prev.x),right=Math.min(moving.x+moving.w,prev.x+prev.w),overlap=right-left;if(overlap<13){end();return;}score++;stack.push({x:left,y:moving.y,w:overlap});moving={x:moving.dir>0?0:W-overlap,y:moving.y-blockH,w:overlap,dir:moving.dir};speed=Math.min(250,speed+8);if(moving.y<20){end();return;}scoreNode&&(scoreNode.textContent=String(score));draw();};
      const frame=now=>{if(!byId('todayExtraCanvas'))return;const dt=Math.min(.03,Math.max(0,(now-last)/1000||0));last=now;if(!ended){moving.x+=moving.dir*speed*dt;if(moving.x<=0){moving.x=0;moving.dir=1;}if(moving.x+moving.w>=W){moving.x=W-moving.w;moving.dir=-1;}}draw();if(!ended)raf=requestAnimationFrame(frame);};
      listen(canvas,'pointerdown',e=>{e.preventDefault();drop();});keyListen(e=>{if(e.code==='Space'&&byId('todayExtraCanvas')){e.preventDefault();drop();}});raf=requestAnimationFrame(frame);todayMiniGameRuntime={id,drop};cleanup=()=>cancelAnimationFrame(raf);
    } else if(id==='laserdodge'){
      const canvas=byId('todayExtraCanvas'),ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;const W=360,H=420,laneX=[65,180,295];let lane=1,hazards=[],elapsed=0,spawn=0,ended=false,raf=0,last=0;
      const moveLane=d=>{lane=Math.max(0,Math.min(2,lane+(d==='left'?-1:1)));};
      const draw=()=>{ctx.clearRect(0,0,W,H);const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#231837');g.addColorStop(1,'#0b1327');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);for(const x of laneX){ctx.strokeStyle='rgba(142,175,231,.24)';ctx.setLineDash([6,8]);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}ctx.setLineDash([]);for(const z of hazards){ctx.shadowBlur=18;ctx.shadowColor='#ff547f';ctx.fillStyle='#ff5e8d';ctx.fillRect(laneX[z.lane]-27,z.y,54,z.h);ctx.fillStyle='#ffd9e3';ctx.fillRect(laneX[z.lane]-23,z.y+3,46,2);}ctx.shadowBlur=0;ctx.fillStyle='#8ff2d5';ctx.beginPath();ctx.moveTo(laneX[lane],H-24);ctx.lineTo(laneX[lane]-15,H-4);ctx.lineTo(laneX[lane]+15,H-4);ctx.closePath();ctx.fill();if(ended){ctx.fillStyle='rgba(3,7,18,.72)';ctx.fillRect(38,160,W-76,86);ctx.fillStyle='#fff';ctx.font='800 22px sans-serif';ctx.textAlign='center';ctx.fillText('ИМПУЛЬС ПОЙМАН',W/2,194);ctx.fillStyle='#9df4de';ctx.font='14px sans-serif';ctx.fillText(`Время: ${Math.floor(elapsed)} c`,W/2,220);}};
      const end=()=>{if(ended)return;ended=true;finish(Math.floor(elapsed),Math.floor(elapsed),`Столкновение. Ты продержался ${Math.floor(elapsed)} секунд.`);draw();};
      const frame=now=>{if(!byId('todayExtraCanvas'))return;const dt=Math.min(.035,Math.max(0,(now-last)/1000||0));last=now;if(!ended){elapsed+=dt;spawn+=dt;if(spawn>.62){spawn=0;hazards.push({lane:Math.floor(Math.random()*3),y:-24,h:24});}hazards.forEach(z=>z.y+=205*dt);hazards=hazards.filter(z=>z.y<H+28);timeNode&&(timeNode.textContent=Math.max(0,30-Math.floor(elapsed))+' c');if(hazards.some(z=>z.lane===lane&&z.y+z.h>=H-30&&z.y<=H-2)){end();}else if(elapsed>=30){ended=true;finish(30,30,'Супер! Ты избежал всех лазеров.');}}draw();if(!ended)raf=requestAnimationFrame(frame);};
      const key=e=>{if(!byId('todayExtraCanvas'))return;if(e.key==='ArrowLeft'||e.key==='a'){moveLane('left');e.preventDefault();}if(e.key==='ArrowRight'||e.key==='d'){moveLane('right');e.preventDefault();}};keyListen(key);listen(canvas,'pointerdown',e=>{const r=canvas.getBoundingClientRect();lane=Math.min(2,Math.max(0,Math.floor((e.clientX-r.left)/r.width*3)));});raf=requestAnimationFrame(frame);todayMiniGameRuntime={id,moveLane};cleanup=()=>cancelAnimationFrame(raf);
    } else if(id==='quiz'){
      const bank=[
        ['ПРИРОДА','Какая планета ближе всего к Солнцу?',['Венера','Меркурий','Марс','Земля'],1],
        ['ТЕХНОЛОГИИ','Что означает HTML?',['Язык разметки','База данных','Видеокодек','Операционная система'],0],
        ['КОСМОС','Как называется наша галактика?',['Андромеда','Млечный Путь','Сомбреро','Орион'],1],
        ['ГЕОГРАФИЯ','Какой океан самый большой?',['Атлантический','Индийский','Тихий','Северный Ледовитый'],2],
        ['ЖИВОТНЫЕ','Сколько ног у паука?',['6','8','10','12'],1],
        ['НАУКА','Какой газ нужен человеку для дыхания?',['Азот','Гелий','Кислород','Метан'],2],
        ['МАТЕМАТИКА','Сколько будет 12 × 8?',['86','92','96','108'],2],
        ['ИСКУССТВО','Сколько цветов в классической радуге?',['5','6','7','8'],2],
        ['ТЕХНОЛОГИИ','Какие цифры использует двоичная система?',['0 и 1','1 и 2','0–9','2 и 8'],0],
        ['ПРИРОДА','Какое животное — самое крупное на Земле?',['Слон','Синий кит','Жираф','Белая акула'],1]
      ];let order=bank.map((_,i)=>i).sort(()=>Math.random()-.5),idx=0,score=0,ended=false;const q=byId('todayExtraQuizQuestion'),cat=byId('todayExtraQuizCategory'),choices=byId('todayExtraQuizChoices');
      const draw=()=>{if(idx>=order.length){ended=true;finish(score,0,`Викторина завершена: ${score}/1000. Отличная работа!`);choices.innerHTML='<button class="ts-primary" data-game-act="extra-restart" data-game="quiz">Пройти ещё раз ↻</button>';q.textContent='Финиш!';cat.textContent='TODAY QUIZ · РЕЗУЛЬТАТ';return;}const item=bank[order[idx]];cat.textContent=item[0]+' · '+(idx+1)+'/10';q.textContent=item[1];timeNode&&(timeNode.textContent=(idx+1)+'/10');choices.innerHTML=item[2].map((a,i)=>`<button class="ts-extra-quiz-choice" data-game-act="extra-quiz-answer" data-i="${i}">${h(a)}</button>`).join('');};
      const answer=n=>{if(ended)return;const item=bank[order[idx]];if(n===item[3]){score+=100;status&&(status.textContent='Верно! +100 очков.');}else status&&(status.textContent='Не совсем. Правильный ответ: '+item[2][item[3]]);scoreNode&&(scoreNode.textContent=String(score));[...choices.children].forEach((b,i)=>{b.disabled=true;b.classList.toggle('correct',i===item[3]);b.classList.toggle('wrong',i===n&&n!==item[3]);});idx++;setTimeout(()=>{if(byId('todayExtraQuizChoices'))draw();},750);};
      todayMiniGameRuntime={id,answer};draw();cleanup=()=>{};
    } else if(id==='starcatch'){
      const canvas=byId('todayExtraCanvas'),ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;const W=360,H=420;let basketX=180,items=[],score=0,left=30,ended=false,raf=0,last=0,spawn=0;const moveBasket=d=>{basketX=Math.max(35,Math.min(W-35,basketX+(d==='left'?-28:28)));};
      const draw=()=>{ctx.clearRect(0,0,W,H);const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#142951');g.addColorStop(1,'#100d28');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);for(let i=0;i<40;i++){ctx.fillStyle=`rgba(219,233,255,${.16+(i%3)*.09})`;ctx.fillRect((i*83)%W,(i*47)%H,2,2);}items.forEach(o=>{ctx.fillStyle=o.bad?'#69758f':'#ffe18e';if(o.bad){ctx.save();ctx.translate(o.x,o.y);ctx.rotate(.6);ctx.fillRect(-7,-7,14,14);ctx.restore();}else{ctx.font='22px sans-serif';ctx.textAlign='center';ctx.fillText('✦',o.x,o.y+7);}});ctx.fillStyle='#72e4d3';ctx.beginPath();ctx.moveTo(basketX-31,H-33);ctx.lineTo(basketX+31,H-33);ctx.lineTo(basketX+23,H-8);ctx.lineTo(basketX-23,H-8);ctx.closePath();ctx.fill();ctx.strokeStyle='#e0fff7';ctx.lineWidth=2;ctx.stroke();if(ended){ctx.fillStyle='rgba(4,8,25,.76)';ctx.fillRect(30,164,W-60,82);ctx.fillStyle='#fff';ctx.font='800 22px sans-serif';ctx.textAlign='center';ctx.fillText('СБОР ЗАВЕРШЁН',W/2,196);ctx.fillStyle='#9df4de';ctx.font='14px sans-serif';ctx.fillText(`Звёзд: ${score}`,W/2,222);}};
      const frame=now=>{if(!byId('todayExtraCanvas'))return;const dt=Math.min(.035,Math.max(0,(now-last)/1000||0));last=now;if(!ended){left-=dt;spawn+=dt;if(spawn>.48){spawn=0;items.push({x:18+Math.random()*(W-36),y:-18,bad:Math.random()<.22,speed:105+Math.random()*100});}items.forEach(o=>o.y+=o.speed*dt);items=items.filter(o=>{if(o.y>H-36&&o.y<H-4&&Math.abs(o.x-basketX)<32){score=Math.max(0,score+(o.bad?-5:10));scoreNode&&(scoreNode.textContent=String(score));return false;}return o.y<H+25;});timeNode&&(timeNode.textContent=Math.ceil(Math.max(0,left))+' c');if(left<=0){ended=true;finish(score,30,'Время вышло. Лови золотые звёзды и избегай осколков.');}}draw();if(!ended)raf=requestAnimationFrame(frame);};
      listen(canvas,'pointermove',e=>{const r=canvas.getBoundingClientRect();basketX=Math.max(35,Math.min(W-35,(e.clientX-r.left)/r.width*W));});listen(canvas,'pointerdown',e=>{const r=canvas.getBoundingClientRect();basketX=Math.max(35,Math.min(W-35,(e.clientX-r.left)/r.width*W));});keyListen(e=>{if(!byId('todayExtraCanvas'))return;if(e.key==='ArrowLeft'){moveBasket('left');e.preventDefault();}if(e.key==='ArrowRight'){moveBasket('right');e.preventDefault();}});raf=requestAnimationFrame(frame);todayMiniGameRuntime={id,moveBasket};cleanup=()=>cancelAnimationFrame(raf);
    }
    todayMiniGameCleanup=()=>{try{cleanup();}catch(_){}listeners.splice(0).forEach(fn=>{try{fn();}catch(_){}});};
  }
/* TODAY ARCADE EXPANSION V23 END */

  function openMiniGames() {
    stopTodayMiniGame();
    const ids = Object.keys(TODAY_GAMES);
    const cards = ids.map(id => {
      const g = TODAY_GAMES[id];
      return `<article class="ts-game-card ts-game-${id}"><div class="ts-game-art" aria-hidden="true">${gameArtwork(id)}</div><div class="ts-game-card-copy"><span class="ts-kicker">TODAY ARCADE</span><h3>${h(g.title)}</h3><p>${h(g.subtitle)}</p><div class="ts-game-card-bottom"><small>Рекорд устройства: <b data-local-best="${id}">${gameBest(id)}</b></small><button class="ts-primary" data-social-act="play-game" data-game="${id}">Играть ↗</button></div></div></article>`;
    }).join('');
    const html = `<div class="ts-games-home"><div class="ts-games-hero"><span class="ts-kicker">МИКРОПЕРЕРЫВ · БОЛЬШИЕ РЕКОРДЫ</span><h3>Пять минут — только твои.</h3><p>Игры работают прямо в браузере, без установки и без звука по умолчанию. Начинай раунд одним касанием.</p></div><div class="ts-game-grid">${cards}</div><section class="ts-game-leaderboard"><div class="ts-list-head"><h3>Рекорды друзей</h3><span class="ts-count">СЕГОДНЯ</span></div><div class="ts-game-leaderboard-tabs">${ids.filter(id=>!EXTRA_GAME_IDS.includes(id)).map(id=>`<button class="ts-mini" data-game-act="leaderboard" data-game="${id}">${h(TODAY_GAMES[id].label)}</button>`).join('')}</div><div id="todayGameLeaderboard"><p class="ts-muted">Выбери игру, чтобы посмотреть рекорды друзей за сегодня. Личные рекорды доступны и без аккаунта.</p></div></section></div>`;
    modal(panelShell('Мини-игры','Короткие игры TODAY — для дороги, очереди и свободной минуты.',html));
  }

  function openMiniGame(gameId) {
    stopTodayMiniGame();
    const g = TODAY_GAMES[gameId];
    if (!g) return notify('Эта игра пока недоступна.');
    let board = '';
    if (gameId === 'merge2048') board = `<div class="ts-game-hud"><span>ОЧКИ <b id="todayMergeScore">0</b></span><span>ЛУЧШЕЕ <b id="todayMergeBest">${gameBest(gameId)}</b></span></div><div id="todayMergeBoard" class="ts-merge-board" role="application" aria-label="Поле 2048"></div><div class="ts-merge-controls"><button data-game-act="merge-move" data-dir="up">↑</button><div><button data-game-act="merge-move" data-dir="left">←</button><button data-game-act="merge-move" data-dir="down">↓</button><button data-game-act="merge-move" data-dir="right">→</button></div></div><p id="todayMergeStatus" class="ts-game-status">Объединяй одинаковые числа.</p><button class="ts-mini" data-game-act="merge-restart">Начать заново ↻</button>`;
    if (gameId === 'match3') board = `<div class="ts-game-hud"><span>ОЧКИ <b id="todayMatchScore">0</b></span><span>ВРЕМЯ <b id="todayMatchTimer">60</b> сек</span></div><div id="todayMatchBoard" class="ts-match-board" aria-label="Поле три в ряд"></div><p id="todayMatchStatus" class="ts-game-status">Выбери кристалл, затем соседний.</p><button class="ts-mini" data-game-act="match-restart">Перемешать / начать заново ↻</button>`;
    if (gameId === 'memory') board = `<div class="ts-game-hud"><span>ХОДЫ <b id="todayMemoryMoves">0</b></span><span>РЕЗУЛЬТАТ <b id="todayMemoryScore">1000</b></span></div><div id="todayMemoryBoard" class="ts-memory-board" aria-label="Карточки для запоминания"></div><p id="todayMemoryStatus" class="ts-game-status">Найди восемь пар.</p><button class="ts-mini" data-game-act="memory-restart">Новая игра ↻</button>`;
    if (gameId === 'flappy') board = `<div class="ts-game-hud"><span>ПРОЛЁТЫ <b id="todayFlappyScore">0</b></span><span>РЕКОРД <b id="todayFlappyBest">${gameBest(gameId)}</b></span></div><div class="ts-flappy-wrap"><canvas id="todayFlappyCanvas" width="360" height="520" aria-label="NIGHT FLIGHT; коснись экрана для взмаха"></canvas></div><p id="todayFlappyStatus" class="ts-game-status">Коснись поля для старта и каждого взмаха.</p><button class="ts-mini" data-game-act="flappy-restart">Начать заново ↻</button>`;
    if (EXTRA_GAME_IDS.includes(gameId)) board = extraGameBoard(gameId);
    modal(panelShell(g.title,g.subtitle,`<div class="ts-active-game" data-active-game="${gameId}"><div class="ts-game-toolbar"><button class="ts-mini" data-social-act="mini-games">← Все игры</button><span class="ts-game-record">Личный рекорд: <b data-local-best="${gameId}">${gameBest(gameId)}</b></span></div><div class="ts-game-stage">${board}</div></div>`));
    if (gameId === 'merge2048') initMergeGame();
    if (gameId === 'match3') initMatchGame();
    if (gameId === 'memory') initMemoryGame();
    if (gameId === 'flappy') initFlappyGame();
    if (EXTRA_GAME_IDS.includes(gameId)) initExtraGame(gameId);
  }

  async function loadMiniGameLeaderboard(gameId) {
    const host = byId('todayGameLeaderboard');
    if (!host) return;
    host.innerHTML = '<p class="ts-muted">Загружаем рекорды…</p>';
    try {
      const data = await todayWithTimeout(rpc('today_mini_game_leaderboard', {p_game_id:gameId,p_limit:10}), 10000, 'Загрузка рекордов заняла слишком много времени.');
      const rows = Array.isArray(data.scores) ? data.scores : [];
      host.innerHTML = rows.length ? rows.map((r,i)=>`<div class="ts-game-rank"><b>${i+1}</b><span class="ts-game-rank-avatar">${r.avatar_url?`<img src="${h(r.avatar_url)}" alt="">`:h((r.display_name||'✦').slice(0,1))}</span><span>${h(r.display_name||r.username||'Участник')}</span><strong>${Number(r.best_score||0).toLocaleString('ru-RU')}</strong></div>`).join('') : '<p class="ts-muted">За сегодня пока нет рекордов. Начни первым.</p>';
    } catch (error) {
      host.innerHTML = `<p class="ts-muted">${h(error.message||'Рейтинг временно недоступен.')}</p><p class="ts-helper">Для онлайн-рейтинга нужен аккаунт. Локальные рекорды продолжают работать.</p>`;
    }
  }

  function miniGameClick(button) {
    const action = button.dataset.gameAct;
    const game = button.dataset.game;
    if (handleExtraMiniGameAction(action, button)) return;
    if (action === 'leaderboard') { loadMiniGameLeaderboard(game); return; }
    if (action === 'merge-move') { todayMiniGameRuntime?.move?.(button.dataset.dir); return; }
    if (action === 'merge-restart') { openMiniGame('merge2048'); return; }
    if (action === 'match-tap') { todayMiniGameRuntime?.tap?.(Number(button.dataset.i)); return; }
    if (action === 'match-restart') { openMiniGame('match3'); return; }
    if (action === 'memory-flip') { todayMiniGameRuntime?.flip?.(Number(button.dataset.i)); return; }
    if (action === 'memory-restart') { openMiniGame('memory'); return; }
    if (action === 'flappy-restart') { openMiniGame('flappy'); return; }
  }

  function initMergeGame() {
    const host = byId('todayMergeBoard'); if (!host) return;
    let board = Array(16).fill(0), score = 0, over = false, finished = false;
    const addTile = () => { const empty = board.map((v,i)=>v===0?i:-1).filter(i=>i>=0); if (!empty.length) return; const i=empty[Math.floor(Math.random()*empty.length)]; board[i]=Math.random()<.9?2:4; };
    const draw = () => {
      host.innerHTML = board.map(v=>`<div class="ts-merge-tile v${v||0}">${v||''}</div>`).join('');
      const scoreNode=byId('todayMergeScore');if(scoreNode)scoreNode.textContent=score.toLocaleString('ru-RU');
      const bestNode=byId('todayMergeBest');if(bestNode)bestNode.textContent=Math.max(gameBest('merge2048'),score).toLocaleString('ru-RU');
    };
    const canMove = () => board.some(v=>!v) || board.some((v,i)=>v && ((i%4<3&&v===board[i+1])||(i<12&&v===board[i+4])));
    const move = dir => {
      if(over)return;
      const before=board.join(',');
      for(let n=0;n<4;n++){
        const ids=[];for(let k=0;k<4;k++){
          if(dir==='left')ids.push(n*4+k); if(dir==='right')ids.push(n*4+(3-k));
          if(dir==='up')ids.push(k*4+n); if(dir==='down')ids.push((3-k)*4+n);
        }
        const vals=ids.map(i=>board[i]).filter(Boolean), next=[];
        for(let k=0;k<vals.length;k++){if(vals[k]===vals[k+1]){next.push(vals[k]*2);score+=vals[k]*2;k++;}else next.push(vals[k]);}
        while(next.length<4)next.push(0);ids.forEach((idx,k)=>board[idx]=next[k]);
      }
      if(board.join(',')!==before)addTile(); draw();
      if(board.some(v=>v>=2048)&&!finished){finished=true;over=true;const status=byId('todayMergeStatus');if(status)status.textContent='2048! Ты выиграл — можно продолжить и набрать ещё.';saveGameResult('merge2048',score,0);return;}
      if(!canMove()&&!over){over=true;const status=byId('todayMergeStatus');if(status)status.textContent='Ходы закончились. Попробуй ещё раз.';if(!finished){finished=true;saveGameResult('merge2048',score,0);}}
    };
    addTile();addTile();draw();
    const keyHandler=e=>{if(!byId('todayMergeBoard'))return;const dirs={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};if(dirs[e.key]){e.preventDefault();move(dirs[e.key]);}};
    document.addEventListener('keydown',keyHandler);
    let start=null;
    const touchStart=e=>{const t=e.changedTouches?.[0];if(t)start={x:t.clientX,y:t.clientY};};
    const touchEnd=e=>{const t=e.changedTouches?.[0];if(!t||!start)return;const dx=t.clientX-start.x,dy=t.clientY-start.y;start=null;if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;move(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));};
    host.addEventListener('touchstart',touchStart,{passive:true});host.addEventListener('touchend',touchEnd,{passive:true});
    todayMiniGameRuntime={id:'merge2048',move};
    todayMiniGameCleanup=()=>{document.removeEventListener('keydown',keyHandler);host.removeEventListener('touchstart',touchStart);host.removeEventListener('touchend',touchEnd);};
  }

  function initMatchGame() {
    const host=byId('todayMatchBoard');if(!host)return;
    const n=7, colors=['✦','◆','●','⬟','✚','✧'];let grid=[],selected=-1,score=0,time=60,ended=false,finished=false,timer=null,startTime=Date.now();
    const random=()=>Math.floor(Math.random()*colors.length);
    const findMatches=()=>{const out=new Set();for(let r=0;r<n;r++)for(let c=0;c<n;c++){const i=r*n+c;let j=c+1;while(j<n&&grid[r*n+j]===grid[i])j++;if(j-c>=3)for(let k=c;k<j;k++)out.add(r*n+k);j=r+1;while(j<n&&grid[j*n+c]===grid[i])j++;if(j-r>=3)for(let k=r;k<j;k++)out.add(k*n+c);}return out;};
    const fill=()=>{grid=Array.from({length:n*n},()=>random());let guard=0;while(findMatches().size&&guard++<100)grid=Array.from({length:n*n},()=>random());};
    const draw=()=>{host.innerHTML=grid.map((v,i)=>`<button class="ts-match-cell c${v} ${i===selected?'selected':''}" data-game-act="match-tap" data-i="${i}" aria-label="Кристалл ${i+1}">${colors[v]}</button>`).join('');const s=byId('todayMatchScore');if(s)s.textContent=score.toLocaleString('ru-RU');const tm=byId('todayMatchTimer');if(tm)tm.textContent=String(time);};
    const resolve=()=>{let loops=0,matches=findMatches();while(matches.size&&loops++<10){score+=matches.size*10;for(const i of matches)grid[i]=-1;for(let c=0;c<n;c++){const vals=[];for(let r=n-1;r>=0;r--)if(grid[r*n+c]>=0)vals.push(grid[r*n+c]);for(let r=n-1;r>=0;r--)grid[r*n+c]=vals[n-1-r]===undefined?random():vals[n-1-r];}matches=findMatches();}draw();};
    const tap=i=>{if(ended||!Number.isInteger(i)||i<0||i>=n*n)return;if(selected<0){selected=i;draw();return;}if(selected===i){selected=-1;draw();return;}const a={r:Math.floor(selected/n),c:selected%n},b={r:Math.floor(i/n),c:i%n};if(Math.abs(a.r-b.r)+Math.abs(a.c-b.c)!==1){selected=i;draw();return;}[grid[selected],grid[i]]=[grid[i],grid[selected]];const m=findMatches();if(!m.size){[grid[selected],grid[i]]=[grid[i],grid[selected]];const st=byId('todayMatchStatus');if(st)st.textContent='Нужна линия от трёх одинаковых кристаллов.';}else resolve();selected=-1;draw();};
    fill();draw();todayMiniGameRuntime={id:'match3',tap};
    timer=setInterval(()=>{if(!byId('todayMatchBoard')||ended){clearInterval(timer);return;}time--;const tm=byId('todayMatchTimer');if(tm)tm.textContent=String(time);if(time<=0){ended=true;clearInterval(timer);const st=byId('todayMatchStatus');if(st)st.textContent=`Время! Результат: ${score} очков.`;if(!finished){finished=true;saveGameResult('match3',score,60);}}},1000);
    todayMiniGameCleanup=()=>clearInterval(timer);
  }

  function initMemoryGame() {
    const host=byId('todayMemoryBoard');if(!host)return;
    const symbols=['☾','✦','♜','♢','✿','◉','♫','⌁'];let deck=[...symbols,...symbols].sort(()=>Math.random()-.5),open=[],matched=new Set(),moves=0,locked=false,finished=false,timeout=null,startTime=Date.now();
    const score=()=>Math.max(0,1000-moves*15);
    const draw=()=>{host.innerHTML=deck.map((v,i)=>`<button class="ts-memory-card ${matched.has(i)?'matched':''} ${open.includes(i)?'revealed':''}" data-game-act="memory-flip" data-i="${i}" ${matched.has(i)||open.includes(i)?'disabled':''}>${matched.has(i)||open.includes(i)?v:'?'}</button>`).join('');const m=byId('todayMemoryMoves');if(m)m.textContent=String(moves);const s=byId('todayMemoryScore');if(s)s.textContent=String(score());};
    const flip=i=>{if(locked||finished||matched.has(i)||open.includes(i)||!Number.isInteger(i))return;open.push(i);draw();if(open.length<2)return;moves++;const [a,b]=open;if(deck[a]===deck[b]){matched.add(a);matched.add(b);open=[];draw();if(matched.size===deck.length){finished=true;const st=byId('todayMemoryStatus');if(st)st.textContent=`Все пары найдены за ${moves} ходов!`;saveGameResult('memory',score(),Math.round((Date.now()-startTime)/1000));}}else{locked=true;timeout=setTimeout(()=>{open=[];locked=false;draw();},650);}};
    draw();todayMiniGameRuntime={id:'memory',flip};todayMiniGameCleanup=()=>{if(timeout)clearTimeout(timeout);};
  }

  function initFlappyGame() {
    const canvas=byId('todayFlappyCanvas');if(!canvas)return;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const W=360,H=520,birdX=84,radius=11;let birdY=235,vy=0,pipes=[],score=0,started=false,ended=false,raf=0,last=0,spawn=0,elapsed=0,finished=false;
    const status=byId('todayFlappyStatus');
    const draw=()=>{
      const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#111d3b');bg.addColorStop(1,'#080d1b');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
      for(let i=0;i<24;i++){ctx.fillStyle=`rgba(198,220,255,${.18+(i%3)*.09})`;ctx.beginPath();ctx.arc((i*73)%W,(i*131)%H,1+(i%2),0,Math.PI*2);ctx.fill();}
      ctx.fillStyle='#8ff2d5';ctx.strokeStyle='rgba(255,255,255,.6)';ctx.lineWidth=1.5;
      pipes.forEach(p=>{const grad=ctx.createLinearGradient(p.x,0,p.x+52,0);grad.addColorStop(0,'#3bc8b5');grad.addColorStop(.6,'#8ff2d5');grad.addColorStop(1,'#318b9c');ctx.fillStyle=grad;ctx.fillRect(p.x,0,52,p.top);ctx.fillRect(p.x,p.top-13,52,13);ctx.fillRect(p.x,p.top+150,52,H-p.top-150);ctx.fillRect(p.x,p.top+150,52,13);});
      ctx.fillStyle='#7df0d1';ctx.beginPath();ctx.arc(birdX,birdY,radius,0,Math.PI*2);ctx.fill();ctx.fillStyle='#f6fdff';ctx.beginPath();ctx.arc(birdX+4,birdY-3,3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#14223a';ctx.beginPath();ctx.arc(birdX+5,birdY-3,1.3,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(93,218,234,.55)';ctx.fillRect(0,H-16,W,16);
      if(!started&&!ended){ctx.fillStyle='rgba(3,7,18,.54)';ctx.fillRect(26,198,W-52,92);ctx.textAlign='center';ctx.fillStyle='#f6fbff';ctx.font='700 19px sans-serif';ctx.fillText('КОСНИСЬ ДЛЯ СТАРТА',W/2,234);ctx.fillStyle='#bdcbe3';ctx.font='13px sans-serif';ctx.fillText('и взмахивай, чтобы лететь',W/2,259);}
      if(ended){ctx.fillStyle='rgba(3,7,18,.62)';ctx.fillRect(22,190,W-44,116);ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='800 26px sans-serif';ctx.fillText('ПОЛЁТ ОКОНЧЕН',W/2,233);ctx.fillStyle='#9ef5dd';ctx.font='16px sans-serif';ctx.fillText(`Результат: ${score}`,W/2,263);}
    };
    const end=()=>{if(ended)return;ended=true;if(status)status.textContent=`Полёт завершён: ${score} ворот. Нажми «Начать заново».`;if(!finished){finished=true;saveGameResult('flappy',score,Math.round(elapsed));}draw();};
    const jump=()=>{if(ended)return;if(!started){started=true;if(status)status.textContent='Лети!';}vy=-340;};
    const frame=now=>{if(ended||!byId('todayFlappyCanvas'))return;const dt=Math.min(.035,Math.max(0,(now-last)/1000||0));last=now;if(started){elapsed+=dt;vy+=920*dt;birdY+=vy*dt;spawn+=dt;if(spawn>1.38){spawn=0;pipes.push({x:W+2,top:80+Math.random()*220,passed:false});}pipes.forEach(p=>p.x-=128*dt);pipes=pipes.filter(p=>p.x>-62);for(const p of pipes){if(!p.passed&&p.x+52<birdX){p.passed=true;score++;const sc=byId('todayFlappyScore');if(sc)sc.textContent=String(score);const best=byId('todayFlappyBest');if(best)best.textContent=String(Math.max(gameBest('flappy'),score));}const overlap=birdX+radius>p.x&&birdX-radius<p.x+52;if(overlap&&(birdY-radius<p.top||birdY+radius>p.top+150)){end();break;}}if(birdY-radius<0||birdY+radius>H-16)end();}draw();if(!ended)raf=requestAnimationFrame(frame);};
    const pointer=e=>{e.preventDefault();jump();};canvas.addEventListener('pointerdown',pointer);const key=e=>{if(e.code==='Space'&&byId('todayFlappyCanvas')){e.preventDefault();jump();}};document.addEventListener('keydown',key);raf=requestAnimationFrame(frame);
    todayMiniGameRuntime={id:'flappy'};todayMiniGameCleanup=()=>{cancelAnimationFrame(raf);canvas.removeEventListener('pointerdown',pointer);document.removeEventListener('keydown',key);};
  }

  async function loadProfileStories(userId) {
    try {
      const data=await todayWithTimeout(rpc('today_social_list_profile_stories',{p_user_id:userId}),9000,'Загрузка историй заняла слишком много времени.');
      const rows=(Array.isArray(data.stories)?data.stories:[]).slice(-12);
      const signed=await Promise.all(rows.map(async story=>{
        let media_url='';
        if(story.media_path){try{const r=await todayWithTimeout(sb.storage.from('today-social-stories').createSignedUrl(story.media_path,600),4500,'Подготовка истории заняла слишком много времени.');if(!r.error)media_url=r.data?.signedUrl||'';}catch(_){}}
        const full={...story,media_url};todayStoryCache.set(String(story.id),full);return full;
      }));
      return signed;
    } catch(error) { console.warn('TODAY stories load',error); return []; }
  }

  function profileStoriesMarkup(stories, own, profileId) {
    const creator=own?`<details class="ts-story-composer"><summary>＋ Добавить историю <span>на 24 часа</span></summary><form class="ts-form-card" data-social-form="create-story"><label>Текст истории <small>необязательно, максимум 600 символов</small><textarea name="body" maxlength="600" rows="3" placeholder="Что происходит у тебя сегодня?"></textarea></label><label class="ts-photo-field"><span>Фото или короткое видео</span><input name="story_media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4"><small>JPG, PNG, WebP или MP4 · до 25 МБ · исчезает через 24 часа.</small></label><label>Кто увидит историю<select name="visibility"><option value="public">Все пользователи</option><option value="friends">Только друзья</option></select></label><button class="ts-primary" type="submit">Опубликовать историю ↗</button></form></details>`:'';
    const bubbles=stories.length?stories.map((story,i)=>{
      const thumb=story.media_url&&story.media_type==='image'?`<img src="${h(story.media_url)}" alt="" loading="lazy">`:story.media_type==='video'?'<span class="ts-story-play">▶</span>':`<span>${h((story.body||'✦').trim().slice(0,1).toUpperCase())}</span>`;
      return `<button class="ts-story-bubble" data-social-act="view-story" data-id="${h(story.id)}"><span class="ts-story-ring">${thumb}</span><b>${h(story.body||`История ${i+1}`.slice(0,22))}</b><small>${story.visibility==='friends'?'ДРУЗЬЯ':'24 ЧАСА'}</small></button>`;
    }).join(''):`<p class="ts-muted ts-story-empty">${own?'Твои истории появятся здесь и исчезнут через 24 часа.':'Свежих историй пока нет.'}</p>`;
    return `<section class="ts-stories"><div class="ts-list-head"><h3>Истории</h3><span class="ts-count">${stories.length} · 24 ЧАСА</span></div>${creator}<div class="ts-story-strip">${bubbles}</div></section>`;
  }

  async function viewStory(id) {
    const story=todayStoryCache.get(String(id));
    if(!story)return notify('История больше недоступна. Обнови страницу профиля.');
    const own=String(await currentUser()||'')===String(story.author_id||'');
    const media=story.media_url?(story.media_type==='video'?`<video class="ts-story-view-media" src="${h(story.media_url)}" controls playsinline preload="metadata"></video>`:`<img class="ts-story-view-media" src="${h(story.media_url)}" alt="История ${h(story.author_name||'TODAY')}">`):'';
    const remaining=Math.max(0,Math.ceil((new Date(story.expires_at).getTime()-Date.now())/3600000));
    const actions=own?`<button class="ts-text-button" data-social-act="delete-story" data-id="${h(story.id)}">Удалить историю</button><span class="ts-helper">Просмотров: ${Number(story.views_count||0)}</span>`:'';
    modal(panelShell('История',`${h(story.author_name||'Участник')} · исчезнет через ${remaining} ч`, `<article class="ts-story-viewer">${media}${story.body?`<p>${h(story.body).replace(/\n/g,'<br>')}</p>`:''}<div class="ts-story-view-footer"><span>@${h(story.username||'today')}</span>${actions}</div></article>`));
    if(!own)rpc('today_social_record_story_view',{p_story_id:story.id}).catch(error=>console.warn('TODAY story view',error));
  }

  async function deleteStory(id) {
    if(!window.confirm('Удалить эту историю? Она сразу исчезнет для всех.'))return;
    try{
      const result=await rpc('today_social_delete_story',{p_story_id:id});
      if(result.media_path)try{await sb.storage.from('today-social-stories').remove([result.media_path]);}catch(_){ }
      todayStoryCache.delete(String(id));notify('История удалена.');await openProfile(await currentUser());
    }catch(error){notify(error.message||'Не удалось удалить историю.');}
  }

  function openMiniGameHomeIfReady() { openMiniGames(); }
  /* TODAY SOCIAL STORIES + MINI GAMES V17 END */

  async function openChannels(){
    if(!await needUser())return;
    const pageTitle='Каналы';
    modal(panelShell(pageTitle,'Загружаем доступные сообщества.','<div class="ts-loading-panel"><span class="ts-loading-spinner"></span>Подключаемся к каналам TODAY…</div>'));
    let d;try{d=await todayWithTimeout(rpc('today_social_list_channels'),12000,'Список каналов не ответил за 12 секунд.')}catch(e){modal(panelShell(pageTitle,'Каналы временно не загрузились.',`<div class="ts-error-panel"><strong>Раздел открылся, но сервер не вернул список каналов.</strong><p>Чаще всего причина — не применена SQL-миграция социальной части или RPC недоступен.</p><code>${h(e.message||e)}</code><button class="ts-primary" type="button" data-social-act="retry-channels">Повторить ↻</button></div>`));return}
    const ch=Array.isArray(d.channels)?d.channels:[];
    modal(panelShell('Каналы','Отдельные сообщества со своей лентой. Посты канала не появляются в общей ленте TODAY.',`<form class="ts-form-card" data-social-form="create-channel"><h3>Создать канал</h3><label>Название<input name="title" maxlength="80" required placeholder="Название сообщества"></label><label>Описание<textarea name="description" maxlength="500" rows="2" placeholder="О чём этот канал?"></textarea></label><label>Доступ<select name="visibility"><option value="public">Публичный — можно найти и войти</option><option value="private">Закрытый — только по приглашению</option></select></label><button class="ts-primary" type="submit">Создать канал +</button></form><div class="ts-list-head"><h3>Открытые и твои каналы</h3><span class="ts-count">${ch.length}</span></div><div class="ts-channel-grid">${ch.length?ch.map(c=>`<article class="ts-channel-card"><div class="ts-channel-symbol">${c.visibility==='private'?'◈':'▤'}</div><div><h4>${h(c.title)}</h4><p>${h(c.description||'Тематическое пространство TODAY.')}</p><div class="ts-channel-meta"><span>${h(c.visibility==='private'?'ЗАКРЫТЫЙ':'ПУБЛИЧНЫЙ')}</span><span>${h(c.member_count)} участников</span></div></div><button class="ts-primary" data-social-act="open-channel" data-id="${h(c.id)}">${c.is_member?'Открыть ↗':'Войти ↗'}</button></article>`).join(''):`<div class="ts-empty">Пока каналов нет. Создай первый.</div>`}</div><div class="ts-helper">Внутри каждого канала — отдельная история, публикации и участники. Закрытый канал нельзя найти без приглашения.</div>`));
  }
  async function openChannel(id,retryExisting=false){
    if(!await needUser())return;
    const loading=panelShell('Открываем канал','Загружаем публикации и участников.','<div class="ts-loading-panel"><span class="ts-loading-spinner"></span>Открываем канал…</div>');
    if(retryExisting)replaceCurrentSocialPage(loading);else modal(loading);
    let d;try{d=await todayWithTimeout(rpc('today_social_get_channel_posts',{p_channel_id:id}),12000,'Канал не ответил за 12 секунд.')}catch(e){replaceCurrentSocialPage(panelShell('Канал недоступен','Не удалось загрузить канал.',`<div class="ts-error-panel"><strong>Канал пока недоступен.</strong><code>${h(e.message||e)}</code><button class="ts-primary" type="button" data-social-act="retry-channel" data-id="${h(id)}">Повторить ↻</button></div>`));return}
    const c=d.channel||{},posts=Array.isArray(d.posts)?d.posts:[];let actions='';
    if(!c.is_member&&c.visibility==='public')actions=`<button class="ts-primary" data-social-act="join-channel" data-id="${h(id)}">Вступить в канал ↗</button>`;
    const postForm=c.is_member?`<form class="ts-form-card ts-create-post" data-social-form="create-channel-post"><input type="hidden" name="channel_id" value="${h(id)}"><h3>Опубликовать внутри канала</h3><label>Заголовок<input name="title" maxlength="140" placeholder="Заголовок (необязательно)"></label><label>Текст<textarea name="body" rows="3" maxlength="5000" required placeholder="Сообщение участникам канала…"></textarea></label><button class="ts-primary" type="submit">Опубликовать ↗</button></form>`:'';
    const inviteForm=c.role==='owner'||c.role==='admin'?`<form class="ts-inline-invite" data-social-form="invite-channel"><input type="hidden" name="channel_id" value="${h(id)}"><input name="usernames" placeholder="Пригласить @никнеймы через запятую"><button class="ts-mini" type="submit">+ Пригласить</button></form>`:'';
    replaceCurrentSocialPage(panelShell(c.title||'Канал',`${c.visibility==='private'?'ЗАКРЫТЫЙ':'ПУБЛИЧНЫЙ'} · ${c.member_count||0} участников`,`${actions}<div class="ts-channel-toolbar"><button class="ts-mini" data-social-act="channels">← Все каналы</button><span>ПОСТЫ ТОЛЬКО ВНУТРИ КАНАЛА</span><button class="ts-text-button" data-social-act="report" data-kind="channel" data-id="${h(id)}">Пожаловаться</button></div>${postForm}${inviteForm}<div class="ts-channel-posts">${posts.length?posts.map(p=>`<article class="ts-post-card"><div class="ts-post-meta"><span class="ts-post-tag">${h(p.author_name||p.author_username||'Участник')}</span><time>${h(dateLabel(p.created_at))}</time></div>${p.title?`<h4>${h(p.title)}</h4>`:''}<p>${h(p.body).replace(/\n/g,'<br>')}</p><button class="ts-text-button" data-social-act="report" data-kind="channel_post" data-id="${h(p.id)}">Пожаловаться</button></article>`).join(''):`<div class="ts-empty">В канале пока нет публикаций.</div>`}</div>`));
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
      }else if(action==='create-story'){
        const uid=await currentUser();if(!uid)throw new Error('Войди в аккаунт, чтобы публиковать истории.');
        const body=String(fd.get('body')||'').trim();const input=form.querySelector('input[name="story_media"]');const file=input?.files?.[0]||null;
        if(!body&&!file)throw new Error('Добавь текст или фото/видео.');
        let path='';let storyCreated=false;
        try{
          if(file){
            const type=file.type==='video/mp4'?'video':(['image/jpeg','image/png','image/webp'].includes(file.type)?'image':'');
            if(!type)throw new Error('Поддерживаются JPG, PNG, WebP и MP4.');
            if(file.size>25*1024*1024)throw new Error('Файл истории должен быть не больше 25 МБ.');
            const ext=type==='video'?'mp4':({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type]);
            path=`stories/${uid}/${Date.now()}-${Math.random().toString(36).slice(2,10)}.${ext}`;
            if(btn){btn.disabled=true;btn.textContent='ЗАГРУЖАЮ МЕДИА…';}
            const up=await sb.storage.from('today-social-stories').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
            if(up.error)throw up.error;
            if(btn)btn.textContent='ПУБЛИКУЮ ИСТОРИЮ…';
            await rpc('today_social_create_story',{p_body:body,p_media_path:path,p_media_type:type,p_visibility:String(fd.get('visibility')||'public')});
          }else{
            await rpc('today_social_create_story',{p_body:body,p_media_path:null,p_media_type:null,p_visibility:String(fd.get('visibility')||'public')});
          }
          storyCreated=true;notify('История опубликована на 24 часа.');await openProfile(uid);
        }catch(error){if(path&&!storyCreated)try{await sb.storage.from('today-social-stories').remove([path]);}catch(_){}throw error;}
      }else if(action==='save-settings'){
        const uid=await currentUser();const payload={user_id:uid,allow_direct_messages:!!form.elements.allow_direct_messages.checked,allow_group_invites:!!form.elements.allow_group_invites.checked,allow_friend_requests:!!form.elements.allow_friend_requests.checked,allow_profile_visits:!!form.elements.allow_profile_visits.checked,profile_visibility:String(fd.get('profile_visibility')||'public'),friend_list_visibility:String(fd.get('friend_list_visibility')||'public'),updated_at:new Date().toISOString()};
        const r=await sb.from('today_social_settings').upsert(payload,{onConflict:'user_id'});if(r.error)throw r.error;notify('Настройки приватности сохранены.');
      }else if(action==='create-channel'){
        const d=await rpc('today_social_create_channel',{p_title:String(fd.get('title')||''),p_description:String(fd.get('description')||''),p_visibility:String(fd.get('visibility')||'public')});await openChannel(d.channel.id);
      }else if(action==='create-channel-post'){
        const d=await rpc('today_social_create_channel_post',{p_channel_id:String(fd.get('channel_id')),p_title:String(fd.get('title')||''),p_body:String(fd.get('body')||'')});notify(d.message||'Пост опубликован.');await openChannel(String(fd.get('channel_id')),true);
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
    const loadingTitles={chats:'Сообщения',friends:'Друзья','my-profile':'Моя страница',settings:'Приватность и безопасность',channels:'Каналы','open-profile':'Страница участника'};
    if(loadingTitles[a]){
      const label=loadingTitles[a];
      modal(panelShell(label,'Подключаемся к TODAY. Если сервер не ответит, здесь появится понятная ошибка.',`<div class="ts-loading-panel"><span class="ts-loading-spinner"></span><span>Загружаем раздел «${h(label)}»…</span></div>`));
    }
    if(a==='chats')return openChats();if(a==='friends')return openFriends();if(a==='my-profile')return openProfile();if(a==='settings')return openSettings();if(a==='channels')return openChannels();
    if(a==='mini-games'){const current=socialRoutePages[socialRouteDepth-1];if(socialRouteActive&&socialRouteDepth>1&&Object.values(TODAY_GAMES).some(g=>g.title===current?.title)){history.back();return;}return openMiniGames();}if(a==='play-game')return openMiniGame(btn.dataset.game);
    if(a==='retry-channels')return openChannels();if(a==='retry-settings')return openSettings();if(a==='retry-channel')return openChannel(id,true);
    if(a==='view-story')return viewStory(id);if(a==='delete-story')return deleteStory(id);
    if(a==='open-chat')return openChat(id,title,type);if(a==='refresh-chats')return openChats();if(a==='open-profile')return openProfile(id);if(a==='request-friend')return requestFriend(username);if(a==='direct'){try{const d=await rpc('today_social_create_direct_chat',{p_username:username});return openChat(d.chat.id,d.chat.title||username,d.chat.type)}catch(e){return notify(e.message)}}
    if(a==='accept-friend')return respondFriend(id,true);if(a==='reject-friend')return respondFriend(id,false);if(a==='promote-post')return promotePost(id);if(a==='report')return report(btn.dataset.kind,id);if(a==='block-user')return blockUser(id);
    if(a==='open-channel')return openChannel(id);
    if(a==='join-channel'){try{const d=await rpc('today_social_join_channel',{p_channel_id:id});notify(d.message||'Ты вступил в канал.');return openChannel(id,true)}catch(e){return notify(e.message)}}
  }
  function setup(){
    installModalSafety();
    injectNav();injectPromo();document.addEventListener('click',e=>{const b=e.target.closest('[data-social-act]');if(!b)return;e.preventDefault();handleClick(b)});document.addEventListener('click',e=>{const b=e.target.closest('[data-game-act]');if(!b)return;e.preventDefault();miniGameClick(b)});document.addEventListener('submit',onSubmit);
    document.addEventListener('change',e=>{const input=e.target;if(!(input instanceof HTMLInputElement)||input.name!=='photo'||!input.matches('[data-social-photo]'))return;const form=input.closest('form');const preview=form?.querySelector('[data-social-photo-preview]');if(!preview)return;const oldUrl=preview.dataset.objectUrl;if(oldUrl)try{URL.revokeObjectURL(oldUrl)}catch{};preview.replaceChildren();const file=input.files?.[0];if(!file){preview.hidden=true;delete preview.dataset.objectUrl;return;}if(file.size>15*1024*1024){input.value='';preview.hidden=true;notify('Фото слишком большое: максимум 15 МБ.');return;}if(!/^image\/(jpeg|png|webp)$/i.test(file.type)){input.value='';preview.hidden=true;notify('Выбери фото JPG, PNG или WebP.');return;}const url=URL.createObjectURL(file);preview.dataset.objectUrl=url;const img=document.createElement('img');img.src=url;img.alt='Предпросмотр выбранной фотографии';img.className='ts-post-image-preview';preview.append(img);const info=document.createElement('span');info.textContent=file.name;preview.append(info);preview.hidden=false;});
    const close=byId('modalClose');if(close)close.addEventListener('click',()=>{stopPoll();const m=byId('modal');if(m)m.classList.remove('today-social-modal')});
    const modalRoot=byId('modal');if(modalRoot){const mo=new MutationObserver(()=>{if(modalRoot.classList.contains('hidden')){stopPoll();modalRoot.classList.remove('today-social-modal');for(const preview of modalRoot.querySelectorAll('.ts-photo-preview[data-object-url]')){try{URL.revokeObjectURL(preview.dataset.objectUrl)}catch{}delete preview.dataset.objectUrl;preview.replaceChildren();preview.hidden=true;}}});mo.observe(modalRoot,{attributes:true,attributeFilter:['class']})}
    loadPromos();
  }
  window.TODAY_SOCIAL={version:VERSION,openChats,openFriends,openProfile,openSettings,openChannels,openMiniGames,loadPromos};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
