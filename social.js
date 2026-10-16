/* TODAY_SOCIAL_STORY_MOV_V69 */
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
  async function rpc(name,args={},timeoutMs=15000){
    let timer;
    let result;
    const requestedTimeout=Number(timeoutMs);
    const safeTimeout=Number.isFinite(requestedTimeout)
      ?Math.max(1000,Math.min(60000,requestedTimeout))
      :15000;
    try {
      result = await Promise.race([
        Promise.resolve().then(()=>sb.rpc(name,args)),
        new Promise((_,reject)=>{
          timer=setTimeout(
            ()=>reject(new Error(
              'Запрос к серверу ('+String(name)+') не ответил за '+
              Math.ceil(safeTimeout/1000)+
              ' секунд. Проверь соединение и повтори попытку.'
            )),
            safeTimeout
          );
        })
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
    if (bar.dataset.todayCloseBound !== 'v24') {
      bar.dataset.todayCloseBound = 'v24';
      for (const id of ['todaySocialBackTop','todaySocialExitTop']) {
        const button = bar.querySelector('#' + id);
        if (button) button.addEventListener('click', forceCloseSocialModal, true);
      }
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

  /* TODAY_SOCIAL_CLOSE_DIRECT_V24_BEGIN — idempotent synchronous close; no history, scroll jumps or DOM teardown. */
  function forceCloseSocialModal(event) {
    if (event) {
      try { event.preventDefault(); } catch (_) {}
      try { event.stopPropagation(); } catch (_) {}
      try { event.stopImmediatePropagation(); } catch (_) {}
    }
    const root=byId('modal'),host=byId('modalContent'),html=document.documentElement,body=document.body;
    try { if(typeof stopPoll==='function') stopPoll(); } catch (_) {}
    try { if(typeof stopTodayMiniGame==='function') stopTodayMiniGame(); } catch (_) {}
    const savedBody=(window.__todayModalBodyStyle&&typeof window.__todayModalBodyStyle==='object')?window.__todayModalBodyStyle:{};
    const clearStyle=(node,keys)=>{if(!node||!node.style)return;for(const key of keys){try{node.style.removeProperty(key)}catch(_){}}};
    if(root){
      // Remove inline overrides first, so .hidden can actually hide this overlay.
      clearStyle(root,['display','visibility','opacity','position','inset','z-index','width','height','max-height','overflow','place-items','padding']);
      const card=root.querySelector('.modal-card');
      clearStyle(card,['display','visibility','opacity','position','inset','z-index','width','min-width','max-width','height','max-height','overflow','overflow-x','overflow-y','margin']);
      root.classList.add('hidden');
      root.classList.remove('today-social-modal','today-social-page');
      // Keep the tiny nav bar in place. Reusing it avoids a teardown/mutation burst on every close.
    }
    if(host){delete host.dataset.chatId;clearStyle(host,['display','visibility','opacity','position','inset','z-index','width','min-width','max-width','height','max-height','min-height','overflow','overflow-x','overflow-y','margin','padding','color']);}
    body.style.position=savedBody.position||'';body.style.top=savedBody.top||'';body.style.left=savedBody.left||'';body.style.right=savedBody.right||'';body.style.width=savedBody.width||'';body.style.overflow=savedBody.overflow||'';
    html.classList.remove('today-modal-open','today-social-page-mode');body.classList.remove('today-social-page-mode');
    socialRouteActive=false;socialRouteSession='';socialRoutePages=[];socialRouteDepth=0;socialRouteOriginBodyStyle=null;socialRouteBodyRestored=false;
    window.__todayModalBodyStyle=null;window.__todayModalScrollY=null;
  }
  /* TODAY_SOCIAL_CLOSE_DIRECT_V24_END */

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
    return `<article class="ts-post-card ${own?'ts-own-post':''}" data-v65-content-type="profile" data-v65-content-id="${h(p.id)}"><div class="ts-post-meta"><span class="ts-post-tag">ЛИЧНАЯ СТРАНИЦА</span><time>${h(dateLabel(p.created_at))}</time><span>${h(vis)}</span></div>${p.title?`<h4>${h(p.title)}</h4>`:''}${photo}<p>${h(p.body).replace(/\n/g,'<br>')}</p>${own&&p.visibility==='public'?`<button class="ts-promo-button" data-social-act="promote-post" data-id="${h(p.id)}">✦ В «Что оставили сегодня» · 250 монет</button>`:''}<button class="ts-text-button" data-social-act="report" data-kind="profile_post" data-id="${h(p.id)}">Пожаловаться</button></article>`;
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
  async function loadPromos(options={}){
    const host=byId('todayPromotedList');
    if(!host)return;
    if(host.dataset.todayPromoLoading==='1')return;

    host.dataset.todayPromoLoading='1';

    const cacheKey='today-promoted-posts-cache-v97';

    const moscowDate=()=>{
      try{
        const parts=new Intl.DateTimeFormat('en-GB',{
          timeZone:'Europe/Moscow',
          year:'numeric',
          month:'2-digit',
          day:'2-digit'
        }).formatToParts(new Date());
        const get=t=>parts.find(p=>p.type===t)?.value||'';
        return get('year')+'-'+get('month')+'-'+get('day');
      }catch(_){
        return new Date().toISOString().slice(0,10);
      }
    };

    const readCache=()=>{
      try{
        const value=JSON.parse(localStorage.getItem(cacheKey)||'null');
        if(!value||value.day_date!==moscowDate()||!Array.isArray(value.posts))return null;
        return {day_date:value.day_date,posts:value.posts.slice(0,24)};
      }catch(_){
        return null;
      }
    };

    const saveCache=(day,posts)=>{
      try{
        localStorage.setItem(cacheKey,JSON.stringify({
          day_date:day,
          posts:(Array.isArray(posts)?posts:[]).slice(0,24)
        }));
      }catch(_){}
    };

    const cached=readCache();
    let cachedShown=false;

    const statusMarkup=(message,allowRetry=false)=>
      `<div class="ts-promo-v97-status" role="status" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:10px;padding:10px 12px;">
        <span>${h(shortText(message,220))}</span>
        ${allowRetry?'<button type="button" class="ts-mini" data-social-act="retry-promos">Повторить ↻</button>':''}
      </div>`;

    const renderPosts=async rawPosts=>{
      const source=Array.isArray(rawPosts)?rawPosts.slice(0,24):[];

      if(!source.length){
        host.innerHTML=`<div class="ts-empty">
          <b>Место для следа дня свободно.</b>
          <span>Создай пост на своей странице и выведи его в общую дневную ленту за 250 золотых монет. Доступно один раз в день.</span>
          <button class="ts-mini ts-mini-accent" data-social-act="my-profile">Создать пост</button>
        </div>`;
        return;
      }

      let signingTimer;
      let posts;

      try{
        posts=await Promise.race([
          signProfilePostPhotos(source),
          new Promise(resolve=>{
            signingTimer=setTimeout(
              ()=>resolve(source.map(p=>({...p,image_url:''}))),
              8000
            );
          })
        ]);
      }catch(photoError){
        console.warn('TODAY promoted photo signing',photoError);
        posts=source.map(p=>({...p,image_url:''}));
      }finally{
        clearTimeout(signingTimer);
      }

      host.innerHTML=posts.map(p=>`<article class="ts-promoted-card">
        <div class="ts-promoted-top">
          ${avatar({name:p.author_name,avatar_url:p.avatar_url})}
          <div class="ts-user-copy">
            <b>${h(p.author_name||p.username||'Участник')}</b>
            <span>@${h(String(p.username||'').replace(/^@/,''))} · след дня</span>
          </div>
          <span class="ts-promo-badge">FEATURED</span>
        </div>
        ${p.title?`<h4>${h(p.title)}</h4>`:''}
        ${p.image_url?`<a class="ts-post-image-link" href="${h(p.image_url)}" target="_blank" rel="noopener noreferrer" aria-label="Открыть фотографию"><img class="ts-post-image" src="${h(p.image_url)}" alt="Фото публикации" loading="lazy" decoding="async"></a>`:''}
        <p>${h(p.body||'').replace(/\n/g,'<br>')}</p>
        <div class="ts-promoted-foot">
          <span>В общей ленте до 00:00 МСК</span>
          <button class="ts-text-button" data-social-act="open-profile" data-id="${h(p.author_id||'')}">Открыть страницу ↗</button>
        </div>
      </article>`).join('');
    };

    const isRetryable=error=>{
      const message=String(error?.message||error||'');
      return /не ответил за|timeout|timed out|network|fetch|load failed|failed to fetch|502|503|504|temporarily unavailable/i.test(message);
    };

    try{
      // Show same-day cached posts immediately while the server refreshes.
      if(cached){
        await renderPosts(cached.posts);
        cachedShown=true;
        host.insertAdjacentHTML(
          'beforeend',
          statusMarkup('Показываем сохранённую витрину и проверяем свежие публикации…',false)
        );
      }else{
        host.innerHTML=`<div class="ts-empty">
          <b>Обновляем дневную витрину…</b>
          <span>Проверяем актуальные публикации TODAY. Это не блокирует остальные разделы.</span>
        </div>`;
      }

      let response;

      try{
        response=await rpc('today_social_get_promoted_posts',{},24000);
      }catch(firstError){
        if(!isRetryable(firstError))throw firstError;

        if(!cachedShown){
          host.innerHTML=`<div class="ts-empty">
            <b>Сервер отвечает дольше обычного.</b>
            <span>Повторяем подключение к дневной витрине. Остальные разделы сайта продолжают работать.</span>
          </div>`;
        }

        // One retry only. The SQL function is bounded to the latest
        // 24 public entries to prevent an unbounded JSON aggregation.
        response=await rpc('today_social_get_promoted_posts',{},24000);
      }

      if(!response||!Array.isArray(response.posts)){
        throw new Error('Сервер вернул неполный ответ дневной витрины.');
      }

      const posts=response.posts.slice(0,24);
      const day=String(response.day_date||moscowDate());

      saveCache(day,posts);

      await renderPosts(posts);
      cachedShown=false;

    }catch(error){
      console.warn('TODAY promoted posts feed',error);

      if(cached&&cachedShown){
        host.insertAdjacentHTML(
          'beforeend',
          statusMarkup(
            'Не удалось обновить витрину с сервера. Пока показываем сохранённые публикации за сегодняшний день.',
            true
          )
        );
      }else{
        host.innerHTML=`<div class="ts-empty">
          <b>Не удалось обновить блок продвижения.</b>
          <span>${h(shortText(error?.message||'Временная ошибка соединения.',180))}</span>
          <span>Публикации и игровой прогресс не затронуты. Можно повторить загрузку.</span>
          <button class="ts-mini ts-mini-accent" type="button" data-social-act="retry-promos">Повторить загрузку ↻</button>
        </div>`;
      }

    }finally{
      delete host.dataset.todayPromoLoading;
    }
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
    const createPost=own?`<form class="ts-form-card ts-create-post" data-social-form="create-profile-post"><h3>Оставить запись на своей странице</h3><label>Заголовок <small>необязательно</small><input name="title" maxlength="140" placeholder="Коротко и по делу"></label><label>Текст публикации<textarea name="body" rows="4" maxlength="5000" placeholder="Это останется здесь и завтра…" required></textarea></label><label class="today-v65-post-format">Формат публикации<select name="post_type" data-v65-post-type><option value="text">Запись / фото</option><option value="poll">Опрос</option></select></label><div class="today-v65-poll-fields" data-v65-poll-fields hidden><label>Варианты ответа <small>каждый вариант — с новой строки, от 2 до 6</small><textarea name="poll_options" rows="4" maxlength="500" placeholder="Первый вариант
Второй вариант
Третий вариант"></textarea></label></div><label class="ts-photo-field"><span>Фотография <small>необязательно</small></span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" data-social-photo><small>JPG, PNG или WebP · до 15 МБ. Изображение будет автоматически сжато.</small></label><div class="ts-photo-preview" data-social-photo-preview hidden></div><label>Кто увидит<select name="visibility"><option value="public">Все пользователи</option><option value="friends">Только друзья</option><option value="private">Только я</option></select></label><button class="ts-primary" type="submit">Опубликовать на странице ↗</button><span class="ts-helper">Публикации профиля постоянные и не удаляются в полночь. Фото защищено настройками доступа.</span></form>`:'';
    const friendBlock=`<div class="ts-profile-friends"><div class="ts-list-head"><h3>Друзья</h3><span class="ts-count">${friends.length}</span></div>${friends.length?friends.slice(0,12).map(u=>`<button class="ts-friend-chip" data-social-act="open-profile" data-id="${h(u.id)}">${avatar(u,'small')}<span>${h(u.name||u.username)}</span></button>`).join(''):`<p class="ts-muted">${own?'Добавляй участников в друзья — они появятся здесь.':'Список друзей недоступен или пока пуст.'}</p>`}</div>`;
    const reportUser=!own?`<div class="ts-profile-tools"><button class="ts-text-button" data-social-act="block-user" data-id="${h(p.id)}">Заблокировать</button><button class="ts-text-button" data-social-act="report" data-kind="user" data-id="${h(p.id)}">Пожаловаться на профиль</button></div>`:'';const storiesMarkup=profileStoriesMarkup(stories,own,p.id);const profileBanner=`<section class="ts-profile-cover"><div class="ts-profile-cover-orbit" aria-hidden="true"></div><div class="ts-profile-cover-copy"><span>TODAY / PERSONAL SPACE</span><strong>${own?'ТВОЯ ИСТОРИЯ ПРОДОЛЖАЕТСЯ':'ПРОСТРАНСТВО УЧАСТНИКА'}</strong><small>Люди остаются. День меняется.</small></div><span class="ts-profile-cover-mark" aria-hidden="true">✦</span></section><div class="ts-profile-stats"><div><b>${posts.length}</b><span>ПУБЛИКАЦИИ</span></div><div><b>${friends.length}</b><span>ДРУЗЬЯ</span></div><div><b>${stories.length}</b><span>ИСТОРИИ</span></div></div>`;
    modal(panelShell(own?'Моя страница':p.name||p.username,own?'Твоя постоянная история в TODAY.':`Профиль @${String(p.username||'').replace(/^@/,'')}`,`<div class="ts-profile-hero">${avatar(p,'large')}<div><h3>${h(p.name||p.username||'Участник')}</h3><span>@${h(String(p.username||'').replace(/^@/,''))}</span><p>${h(p.bio||'Пока без описания.')}</p><div class="ts-profile-actions">${mainAction}</div></div></div>${profileBanner}${reportUser}${storiesMarkup}${createPost}<div class="ts-profile-content" data-v65-profile-id="${h(p.id)}" data-v65-profile-own="${own?'true':'false'}"><div class="ts-profile-wall"><div class="ts-list-head"><h3>Публикации</h3><span class="ts-count">${posts.length}</span></div>${posts.length?posts.map(q=>profilePostCard(q,own)).join(''):`<div class="ts-empty">${own?'Твоя страница готова к первой записи.':'Пока нет публикаций, доступных для просмотра.'}</div>`}</div>${friendBlock}</div>`));
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
    match3: {title:'CRYSTAL CHRONICLES', subtitle:'220 сюжетных уровней, 11 глав, спасение принцессы Элары и коллекция из 220 реликвий.', label:'Кристаллы', symbol:'✦'},
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
      return `<article class="ts-game-card ts-game-${id} ${id==='match3'?'ts-game-card-featured':''}"><div class="ts-game-art" aria-hidden="true">${gameArtwork(id)}</div><div class="ts-game-card-copy"><span class="ts-kicker">TODAY ARCADE</span><h3>${h(g.title)}</h3><p>${h(g.subtitle)}</p><div class="ts-game-card-bottom"><small>Рекорд устройства: <b data-local-best="${id}">${gameBest(id)}</b></small><button class="ts-primary" data-social-act="play-game" data-game="${id}">Играть ↗</button></div></div></article>`;
    }).join('');
    const html = `<div class="ts-games-home"><div class="ts-games-hero"><span class="ts-kicker">TODAY ORIGINAL · 220 УРОВНЕЙ · ИСТОРИЯ СПАСЕНИЯ ЭЛАРЫ</span><h3>Собери историю из семи кристаллов.</h3><p>CRYSTAL CHRONICLES — главная аркада TODAY. Открывай главы, собирай комбо и возвращай сияние миру.</p><button type="button" class="ts-primary" data-social-act="play-game" data-game="match3">Продолжить кампанию ↗</button></div><div class="ts-game-grid">${cards}</div><section class="ts-game-leaderboard"><div class="ts-list-head"><h3>Рекорды друзей</h3><span class="ts-count">СЕГОДНЯ</span></div><div class="ts-game-leaderboard-tabs">${ids.filter(id=>!EXTRA_GAME_IDS.includes(id)).map(id=>`<button class="ts-mini" data-game-act="leaderboard" data-game="${id}">${h(TODAY_GAMES[id].label)}</button>`).join('')}</div><div id="todayGameLeaderboard"><p class="ts-muted">Выбери игру, чтобы посмотреть рекорды друзей за сегодня. Личные рекорды доступны и без аккаунта.</p></div></section></div>`;
    modal(panelShell('Мини-игры','Короткие игры TODAY — для дороги, очереди и свободной минуты.',html));
  }

  /* TODAY V26 CLEANUP BRIDGES BEGIN */
  window.__TODAY_STOP_ACTIVE_GAME_V26 = () => { try { if (typeof stopTodayMiniGame === 'function') stopTodayMiniGame(); } catch (_) {} };
  window.__TODAY_STOP_ACTIVE_POLL_V26 = () => { try { if (typeof stopPoll === 'function') stopPoll(); } catch (_) {} };
  /* TODAY V26 CLEANUP BRIDGES END */
  function openMiniGame(gameId) {
    stopTodayMiniGame();
    if (gameId === 'match3') return openMatch3Campaign();
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

/* TODAY CRYSTAL CHRONICLES V43 BEGIN — MOBILE-FIRST POLISH */
  const MATCH3_V43_LEVEL_STYLES={
    'первый след':'first-trail','разбитая печать':'broken-seal','письмо из света':'light-letter','тропа созвездий':'star-trail',
    'шёпот хранителей':'guardian-whisper','затерянный ключ':'lost-key','ступени надежды':'hope-steps','капля памяти':'memory-drop',
    'сторожевой огонь':'watch-fire','тайный проход':'secret-passage','песнь осколков':'shard-song','лунный отпечаток':'moon-mark',
    'паутина теней':'shadow-web','испытание сердца':'heart-trial','сломанные часы':'broken-clock','узник кристалла':'crystal-prisoner',
    'пробуждение руны':'rune-awakening','последний фонарь':'last-lantern','обет хранителя':'guardian-vow','дверь к рассвету':'dawn-door'
  };
  function match3V43LevelStyle(level){const title=String(level?.name||'').split(':').pop().trim().toLocaleLowerCase('ru-RU');return MATCH3_V43_LEVEL_STYLES[title]||'first-trail';}
  function match3V43FastMode(){try{return !!(window.matchMedia('(max-width:700px)').matches||window.matchMedia('(prefers-reduced-motion:reduce)').matches||navigator.connection?.saveData||(navigator.deviceMemory&&navigator.deviceMemory<=4));}catch(_){return true;}}
  function match3V43EnterGameShell(){const root=byId('modal');if(!root)return;root.classList.add('today-match3-fullscreen');document.body.classList.add('today-match3-active');try{if(window.matchMedia('(max-width:700px)').matches&&typeof root.requestFullscreen==='function'&&!document.fullscreenElement){const p=root.requestFullscreen({navigationUI:'hide'});if(p&&typeof p.catch==='function')p.catch(()=>{});}}catch(_){} }
  function match3V43LeaveGameShell(){const root=byId('modal');if(root)root.classList.remove('today-match3-fullscreen');document.body.classList.remove('today-match3-active');try{if(root&&document.fullscreenElement===root&&typeof document.exitFullscreen==='function'){const p=document.exitFullscreen();if(p&&typeof p.catch==='function')p.catch(()=>{});}}catch(_){} }
  if(!document.documentElement.dataset.todayV43CloseBound){document.documentElement.dataset.todayV43CloseBound='1';document.addEventListener('click',event=>{const close=event.target instanceof Element?event.target.closest('#modalClose,#todaySocialExitTop'):null;if(close)match3V43LeaveGameShell();},true);}
  /* TODAY CRYSTAL CHRONICLES V43 END */

  /* TODAY CRYSTAL CHRONICLES V45 BODY-LEVEL VICTORY BEGIN */
  function match3V45DismissResult(){
    const p=byId('todayMatch3Result');
    if(!p)return;
    p.hidden=true;
    p.removeAttribute('data-v44-force-visible');
    p.removeAttribute('data-v45-body-overlay');
    if(p.parentNode===document.body)p.remove();
    document.body.classList.remove('today-match3-result-open');
  }
  /* TODAY CRYSTAL CHRONICLES V44 VICTORY OVERLAY BEGIN */
  function miniGameClick(button) {
    const action = button.dataset.gameAct;
    if(action==='match3-level'||action==='match3-retry'||action==='match3-back')match3V45DismissResult();
    const game = button.dataset.game;
    if(action==='match3-v42-focus'){match3V42FocusAction();return;}
    if(action==='match3-v42-daily-claim'){match3V42ClaimDaily();return;}
    if(['match3-v42-sound','match3-v42-haptics','match3-v42-symbols','match3-v42-theme','match3-v42-motion'].includes(action)){match3V42UpdateOptions(action);return;}
    if(action==='match3-v42-journal'){match3V42OpenJournal();return;}
    if(action==='match3-v42-journal-close'){const j=byId('todayMatchV42Journal');if(j)j.hidden=true;return;}
    if(action==='match3-v42-pause'){match3V42TogglePause();return;}
    if(action==='match3-v42-resume'){if(match3ActiveRun){match3ActiveRun.paused=false;match3V42SyncHud(match3ActiveRun,match3ActiveRun.level);}return;}
    if (action === 'match3-level') { match3V43EnterGameShell(); startMatch3Level(Number(button.dataset.level)); return; }
    if (action === 'match3-retry') { match3V43EnterGameShell(); startMatch3Level(Number(button.dataset.level)); return; }
    if (action === 'match3-back') { match3V43LeaveGameShell(); openMatch3Campaign(); return; }
    if (action === 'match3-booster-buy') { match3BuyBooster(button.dataset.booster); return; }
    if (action === 'match3-booster-use') { match3ActivateBooster(button.dataset.booster); return; }
    if (action === 'match3-hint') { match3ShowHint(); return; }
    if (handleExtraMiniGameAction(action, button)) return;
    if (action === 'leaderboard') { loadMiniGameLeaderboard(game); return; }
    if (action === 'merge-move') { todayMiniGameRuntime?.move?.(button.dataset.dir); return; }
    if (action === 'merge-restart') { openMiniGame('merge2048'); return; }
    if (action === 'match-tap') { if(match3ActiveRun?.suppressClicksUntil>Date.now())return; todayMiniGameRuntime?.tap?.(Number(button.dataset.i)); return; }
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

/* TODAY CRYSTAL RESCUE V30 BEGIN — 220-level royal rescue campaign, layered tile mechanics and collectible vanity relics. */
  const MATCH3_CHAPTERS = [
    {name:'Сады забытых клятв',prefix:'Сады',place:'АКТ I · САДЫ ЗАБЫТЫХ КЛЯТВ',story:'В ночь Лунного затмения тень Морвена похитила принцессу Элару. Последний след ведёт в королевские сады, где хранитель Луми находит её разбитую корону и первую записку: «Не верь звёздам, которые не отражаются в воде». С этого начинается путешествие, в котором каждый восстановленный кристалл возвращает миру часть памяти.',short:'Найди первый след Элары и разбуди садовые маяки.',trophyPrefix:'Садовая реликвия',trophyMark:'❋',tone:'mint',beats:['Луми находит на влажной траве серебряную ленту с гербом Элары. Похищение произошло совсем недавно.','В корнях старого дерева спрятана записка принцессы: она успела оставить путь из светящихся крошек.','Садовый смотритель признаётся, что видел фигуру в плаще, но её отражение двигалось отдельно.','Первый маяк вспыхивает. На небе появляется тонкая линия света — направление к Мосту над Бездной.','За последними воротами Луми слышит голос Элары в кристалле: «Я жива. Не дай ему погасить Рассвет».']},
    {name:'Мост над Бездной',prefix:'Мост',place:'АКТ II · МОСТ НАД БЕЗДНОЙ',story:'Каменный мост расколот на парящие острова. Его мастер Орин когда-то создал королевские печати, но одна из них была подменена Морвеном. Чтобы переправиться, нужно восстановить опоры, найти верный ритм кристаллов и понять, почему тень боится простого солнечного отражения.',short:'Восстанови переправу и найди мастера королевских печатей.',trophyPrefix:'Реликвия переправы',trophyMark:'⌁',tone:'blue',beats:['Орин показывает, что мост держится не на камне, а на четырёх забытых гармониях.','Под одной опорой найден знак королевской стражи — кто-то из дворца помог Морвену.','Осколки моста поднимаются, когда три цвета соединяются в одном ритме.','Орин отдаёт Луми компас, стрелка которого указывает не на север, а на надежду.','Мост собирается в единый путь. На горизонте горят огни Лунной гавани.']},
    {name:'Лунная гавань',prefix:'Гавань',place:'АКТ III · ЛУННАЯ ГАВАНЬ',story:'В Лунной гавани приливы идут вспять, а корабли приходят из воспоминаний. Капитан Нера знает тайный маршрут к зеркальному лесу, но её судно заперто в ледяном отливе. На борту Луми находит первую настоящую улику: Элара изучала древние механизмы, способные закрыть врата Бездны.',short:'Освободи лунный флот и добудь маршрут через зеркальные воды.',trophyPrefix:'Морская реликвия',trophyMark:'☾',tone:'cyan',beats:['Капитан Нера просит погасить ледяные руны на причале, иначе флот не сдвинется.','В корабельном журнале Элара записала имя Морвена рядом со словом «страж», а не «враг».','Лунный маяк показывает две гавани. Только одна из них существует в настоящем мире.','Нера раскрывает тайный отсек с картой, нарисованной светом на прозрачном стекле.','Корабль выходит в обратный прилив. Зеркальный лес появляется там, где секунду назад было небо.']},
    {name:'Зеркальный лес',prefix:'Лес',place:'АКТ IV · ЗЕРКАЛЬНЫЙ ЛЕС',story:'В этом лесу каждый путь повторяется, а отражения способны спорить с тем, кто на них смотрит. Двойник Луми пытается завести команду в круг. Чтобы найти Элару, героям придётся научиться отличать настоящую память от той, которую Морвен подменил.',short:'Разгадай ложные отражения и пройди лес, меняющий прошлое.',trophyPrefix:'Зеркальная реликвия',trophyMark:'◇',tone:'violet',beats:['Отражение Луми произносит фразу, которой настоящий хранитель ещё не знает.','Среди ветвей найдено зеркало Элары. Оно показывает не её лицо, а место заточения.','Лесные духи объясняют: Морвен крадёт не жизнь, а имена — так люди забывают, кого любят.','Верная тропа открывается только после цепной реакции из трёх вспышек.','Зеркало раскалывается и оставляет направление к Архиву забытых имён.']},
    {name:'Архив забытых имён',prefix:'Архив',place:'АКТ V · АРХИВ ЗАБЫТЫХ ИМЁН',story:'В архиве хранятся имена каждого человека королевства. Морвен вычёркивает их из книг, чтобы стирать саму возможность сопротивляться. Среди тысяч страниц Луми находит историю самого злодея: когда-то он был королевским хранителем и пытался спасти свою сестру, но выбрал силу вместо доверия.',short:'Верни имена исчезнувших жителей и узнай правду о Морвене.',trophyPrefix:'Архивная реликвия',trophyMark:'▤',tone:'indigo',beats:['Архивариус Ивен подтверждает: Морвен служил короне задолго до рождения Элары.','Из книги вырвана страница с именем его сестры. Именно её память поддерживает Бездну.','Элара оставила на полях пометку: «Зло не исчезнет, если его просто запереть».','Живой свиток раскрывает координаты Кузницы комет, где были созданы печати заточения.','Луми понимает, что для спасения принцессы понадобится не уничтожить Морвена, а разрушить саму Бездну.']},
    {name:'Кузница комет',prefix:'Кузница',place:'АКТ VI · КУЗНИЦА КОМЕТ',story:'На краю вулканической долины кузнецы куют металл из упавших звёзд. Здесь команда должна восстановить семь печатей и защитить крошечный огонёк Феи — единственную силу, способную показать невидимые трещины в заклинании Морвена. Кристаллы становятся тяжелее, а ошибки дороже.',short:'Выкуй ключ к заточению, не позволив огню погаснуть.',trophyPrefix:'Кузнечная реликвия',trophyMark:'✦',tone:'ember',beats:['Мастер кузницы предупреждает: солнечная сталь рассыплется от случайного удара.','Фея искр дарит Луми крошечный свет, который не усиливает героя, а напоминает о тех, кого он спасает.','Среди раскалённых печатей обнаружена корона Элары — её намеренно оставили целой.','Кузница раскрывает скрытый рисунок: печати удерживают Морвена и принцессу в одном узле.','Ключ закалён. Вдали оживает Часовой город, где можно остановить обратный отсчёт.']},
    {name:'Часовой город',prefix:'Часовой город',place:'АКТ VII · ЧАСОВОЙ ГОРОД',story:'Часовой город живёт в нескольких мгновениях одновременно. Здесь можно увидеть следы будущего, но каждое видение исчезает, если за ним гнаться. Элара удаётся передать короткие сообщения через остановленные часы. Она просит команду не торопиться с финальным ударом: Морвен всё ещё может быть спасён.',short:'Собери механизмы времени и услышь послания Элары.',trophyPrefix:'Часовая реликвия',trophyMark:'⏳',tone:'gold',beats:['Главные часы отстают ровно на один удар — столько времени потерял Морвен в день падения сестры.','Послание Элары гласит: «Я не пленница его силы. Я — часть его печати».','Механик Тавен запускает шестерни, меняющие порядок рядов с кристаллами.','В разбитом циферблате Луми видит будущую башню и тень, которая держит ключ изнутри.','Время снова движется вперёд. Стеклянная пустыня открывает вход лишь на одну ночь.']},
    {name:'Стеклянная пустыня',prefix:'Пустыня',place:'АКТ VIII · СТЕКЛЯННАЯ ПУСТЫНЯ',story:'Пустыня родилась из тысяч расплавленных песчинок, когда звёзды упали на королевство. Ветер стирает следы, а стеклянные дюны скрывают подземный путь к Ноктюрнскому дворцу. В глубине песков команда обнаружит, что Элара сама вошла в ловушку, пытаясь удержать Морвена от полного превращения в Бездну.',short:'Пересечь стеклянные дюны и найти тайный вход во дворец.',trophyPrefix:'Пустынная реликвия',trophyMark:'❋',tone:'coral',beats:['Песчаная буря скрывает следы, зато каждый очищенный кристалл отражает настоящий север.','Скрижаль пустыни показывает Элару, добровольно входящую в портал за Морвеном.','Нера узнаёт на рисунке корабельную печать своей семьи — её предки охраняли тот же портал.','Стеклянные плиты начинают трескаться; надо собирать печати, пока дорога не исчезла.','Под последней дюной открывается тайный вход в Ноктюрнский дворец.']},
    {name:'Ноктюрнский дворец',prefix:'Дворец',place:'АКТ IX · НОКТЮРНСКИЙ ДВОРЕЦ',story:'Дворец полон музыки, которую слышно только во сне. Каждая комната хранит воспоминание о королевской семье — настоящие, болезненные и подменённые. Луми находит Элару за хрустальной завесой, но дворец не отпускает пленницу, пока его хозяин верит, что потеря сестры была напрасной.',short:'Пройди залы памяти, найди принцессу и разрушь ложные воспоминания.',trophyPrefix:'Дворцовая реликвия',trophyMark:'♜',tone:'rose',beats:['В бальном зале играет вальс, который Элара танцевала с отцом перед исчезновением короля.','Фрески подтверждают: Морвен спас королевство однажды, но не сумел пережить собственную утрату.','Элара отвечает Луми через хрусталь: «Не делай из него чудовище, даже если он им стал».','Дворцовая печать рушится, но за ней скрывается дверь в Цитадель тени.','Луми видит принцессу впервые — живую, уставшую, но не сломленную. До свободы осталась одна стена.']},
    {name:'Цитадель тени',prefix:'Цитадель',place:'АКТ X · ЦИТАДЕЛЬ ТЕНИ',story:'Цитадель построена из забвения. Здесь Морвен удерживает саму историю королевства, а Элара связана с сердцем печати. Чтобы освободить её, нужно разбить защитные руны, вернуть Морвену настоящее имя и доказать, что утрата не обязывает превращать весь мир в тюрьму.',short:'Сломай защитные руны и верни Морвену его утраченное имя.',trophyPrefix:'Реликвия цитадели',trophyMark:'⛨',tone:'shadow',beats:['Страж Бездны узнаёт компас Орина и пропускает Луми дальше — когда-то он тоже был хранителем.','В комнате теней найдено имя сестры Морвена: Аурелия. Его никто не произносил много лет.','Элара передаёт часть своей силы не как оружие, а как обещание помочь после освобождения.','Последняя руна требует цепочки из нескольких сочетаний: тьма питается разрозненностью.','Цитадель раскрывается. Морвен стоит у Башни последней звезды и впервые просит не победить его, а остановить.']},
    {name:'Башня последней звезды',prefix:'Башня',place:'АКТ XI · БАШНЯ ПОСЛЕДНЕЙ ЗВЕЗДЫ',story:'На вершине башни Элара удерживает последнюю звезду, а Морвен почти растворился в Бездне. Финал потребует всего, чему научились герои: точных комбинаций, смелости, памяти и сострадания. Спасти принцессу — значит вернуть её домой. Спасти королевство — значит не позволить боли стать его будущим.',short:'Освободи Элару, восстанови сердце королевства и реши судьбу Морвена.',trophyPrefix:'Звёздная реликвия',trophyMark:'★',tone:'prism',beats:['Луми понимает, что все 220 испытаний были частями одной великой печати освобождения.','Элара освобождает руки, но остаётся у сердца звезды: если уйти сразу, Бездна поглотит город.','Орин, Нера, Ивен и Тавен соединяют свои символы в новую печать — не тюрьму, а мост домой.','Морвен впервые произносит имя Аурелии без боли. Тень теряет власть, потому что память возвращается добровольно.','Башня вспыхивает рассветом. Элара возвращается к людям, а последний кристалл хранит уже не плен, а обещание нового начала.']}
  ];
  const MATCH3_GEMS = [
    {name:'Аметист',c1:'#f0ddff',c2:'#b18aff',c3:'#6744d9',line:'#eadcff',mark:'✦'},
    {name:'Сапфир',c1:'#d8f6ff',c2:'#66c8ff',c3:'#2360d5',line:'#d5f5ff',mark:'✧'},
    {name:'Изумруд',c1:'#d7ffe8',c2:'#4ce0b2',c3:'#16856f',line:'#d5fff0',mark:'✦'},
    {name:'Топаз',c1:'#fff2bf',c2:'#ffc56c',c3:'#d9752d',line:'#fff0c9',mark:'✧'},
    {name:'Рубин',c1:'#ffd9e5',c2:'#ff719e',c3:'#c72f68',line:'#ffe0eb',mark:'✦'},
    {name:'Лунный лёд',c1:'#f4f8ff',c2:'#aabde9',c3:'#667db9',line:'#ffffff',mark:'✧'},
    {name:'Солнечный кристалл',c1:'#fff9cb',c2:'#f5df65',c3:'#b98728',line:'#fff8cf',mark:'✦'}
  ];
  const MATCH3_BOOSTERS = [
    {id:'hammer',name:'Космический молот',desc:'Разрушает выбранный кристалл и соседей вокруг него.',price:90,icon:'⌁',button:'Молот'},
    {id:'shuffle',name:'Переплетение',desc:'Перемешивает кристаллы, не расходуя ход.',price:65,icon:'⤨',button:'Перемешать'},
    {id:'rainbow',name:'Радужный импульс',desc:'Удаляет все кристаллы выбранного цвета.',price:145,icon:'✦',button:'Радуга'},
    {id:'moves',name:'Временной осколок',desc:'Добавляет 5 ходов в текущем уровне.',price:120,icon:'＋',button:'+5 ходов'}
  ];
  const MATCH3_TITLE_PARTS = ['Первый след','Разбитая печать','Письмо из света','Тропа созвездий','Шёпот хранителей','Затерянный ключ','Ступени надежды','Капля памяти','Сторожевой огонь','Тайный проход','Песнь осколков','Лунный отпечаток','Паутина теней','Испытание сердца','Сломанные часы','Узник кристалла','Пробуждение руны','Последний фонарь','Обет хранителя','Дверь к рассвету'];
  const MATCH3_TROPHY_PARTS = ['Звезда надежды','Лепесток рассвета','Капля памяти','Серебряное перо','Сфера обещания','Рунный лист','Малый маяк','Осколок короны','Крыло феи','Лунная монета','Стеклянный цветок','Нить судьбы','Песчинка времени','Фрагмент мозаики','Искра отваги','Печатка хранителя','Нота древней песни','Миниатюрная комета','Сердце из хрусталя','Знак возвращения'];
  const MATCH3_TROPHY_GLYPHS = ['✧','❋','◈','♢','☼','⌘','☾','❄','✺','◉','✦','⟡','♜','⛨','⚝','❖','♧','☽','◇','✵'];
  const MATCH3_LEVELS = Array.from({length:220},(_,i)=>{
    const id=i+1,chapter=Math.floor(i/20),local=i%20;
    let objective='score';
    if(id<=30){if(id>=4&&id%4===0)objective='color';}
    else if(id%4===0)objective='color';else if(id%11===0)objective='relic';else if(id%7===0)objective='ice';else if(id%9===0)objective='chain';else if(id%13===0)objective='sigil';
    const d=id-30,target=id<=30?820+id*185:6370+d*22+Math.floor(d*d/200);
    const moves=id<=20?31:id<=60?30:id<=100?30:id<=140?29:id<=180?29:28;
    const colorGoal=objective==='color'?{color:(id*3+1)%MATCH3_GEMS.length,count:id<=30?Math.min(10,7+Math.floor(id/10)):Math.min(12,8+Math.floor((id-30)/40))}:null;
    const iceGoal=objective==='ice'?{count:Math.min(10,5+Math.floor(id/55))}:null;
    const relicGoal=objective==='relic'?{count:Math.min(3,2+Math.floor(id/90))}:null;
    const chainGoal=objective==='chain'?{count:Math.min(3,2+Math.floor(id/90))}:null;
    const sigilGoal=objective==='sigil'?{count:Math.min(4,2+Math.floor((id-31)/60))}:null;
    return {id,chapter,local,name:`${MATCH3_CHAPTERS[chapter].prefix}: ${MATCH3_TITLE_PARTS[local]}`,moves,target,scoreGate:objective==='score'||objective==='color'?Math.ceil(target*.68):Math.ceil(target*.45),objective,colorGoal,iceGoal,relicGoal,chainGoal,sigilGoal,stars:[1,1.23,1.52],trophy:match3TrophyForLevelSafe(id)};
  });
  function match3TrophyForLevelSafe(id){const c=MATCH3_CHAPTERS[Math.max(0,Math.min(10,Math.floor((id-1)/20)))];return {id,name:`${c.trophyPrefix} · ${MATCH3_TROPHY_PARTS[(id-1)%MATCH3_TROPHY_PARTS.length]}`,icon:MATCH3_TROPHY_GLYPHS[(id-1)%MATCH3_TROPHY_GLYPHS.length],tone:c.tone};}
  let match3Progress = null;
  let match3ServerReady = false;
  let match3ServerMessage = '';
  let match3ActiveRun = null;
  let match3GemUid = 1;
  let match3CurrentUserId = '';
  function match3StorageKey(){return 'today-crystal-chronicles-v25:'+(match3CurrentUserId||'guest');}
  function match3LocalDefault(){return {unlocked_level:1,coins:null,inventory:{hammer:0,shuffle:0,rainbow:0,moves:0},levels:{}};}
  function match3ReadLocal(){try{const raw=JSON.parse(localStorage.getItem(match3StorageKey())||'null');if(!raw||typeof raw!=='object')return match3LocalDefault();return {...match3LocalDefault(),...raw,inventory:{...match3LocalDefault().inventory,...(raw.inventory||{})},levels:{...(raw.levels||{})}};}catch(_){return match3LocalDefault();}}
  function match3SaveLocal(){if(!match3Progress)return;try{localStorage.setItem(match3StorageKey(),JSON.stringify(match3Progress));}catch(_){}}
  function match3ApplyCloud(data){
    const local=match3ReadLocal(),levels={...local.levels};
    for(const row of (Array.isArray(data.levels)?data.levels:[])){const id=Number(row.level_id);if(id<1||id>220)continue;levels[id]={completed:!!row.completed,best_score:Number(row.best_score||0),best_stars:Number(row.best_stars||0),best_moves:Number(row.best_moves||0),best_duration_sec:Number(row.best_duration_sec||0),trophy_collected:!!row.completed};}
    return {unlocked_level:Math.max(1,Math.min(221,Math.max(Number(data.unlocked_level||1),Number(local.unlocked_level||1)))),coins:Math.max(0,Number(data.coins||0)),inventory:{...match3LocalDefault().inventory,...(data.inventory||{})},levels};
  }
  async function match3RefreshProgress(){
    const uid=await currentUser();match3CurrentUserId=uid?String(uid):'';const local=match3ReadLocal();match3ServerReady=false;match3ServerMessage='';
    if(uid){try{const data=await todayWithTimeout(rpc('today_match3_get_progress'),9000,'Не удалось подключиться к хранилищу кампании за 9 секунд.');if(!data||data.ok===false)throw new Error(data?.message||'Сервер не подтвердил загрузку прогресса.');match3Progress=match3ApplyCloud(data);match3ServerReady=true;for(const [id,row] of Object.entries(local.levels||{})){if(!match3Progress.levels[id])match3Progress.levels[id]=row;else{match3Progress.levels[id].best_score=Math.max(Number(match3Progress.levels[id].best_score||0),Number(row.best_score||0));match3Progress.levels[id].best_stars=Math.max(Number(match3Progress.levels[id].best_stars||0),Number(row.best_stars||0));}}match3SaveLocal();return match3Progress;}catch(error){match3ServerMessage=String(error?.message||error||'Онлайн-сохранение временно недоступно.');console.warn('TODAY Crystal Chronicles progress',error);}}
    else match3ServerMessage='Войди в аккаунт, чтобы сохранять кампанию между устройствами и покупать усилители за монеты TODAY.';
    match3Progress=local;return match3Progress;
  }
  function match3Stars(level,score){return score>=level.target*level.stars[2]?3:score>=level.target*level.stars[1]?2:1;}
  function match3StoryForLevel(levelId){const level=MATCH3_LEVELS[Math.max(0,Math.min(219,levelId-1))];return MATCH3_CHAPTERS[level.chapter];}
  function match3ProgressLabel(id){const row=match3Progress?.levels?.[String(id)]||match3Progress?.levels?.[id];return row&&row.completed?'★'.repeat(Math.max(1,Number(row.best_stars||1))):'';}
  function match3GoalCode(level){return level.colorGoal?level.colorGoal.color:level.objective==='ice'?-2:level.objective==='relic'?-3:level.objective==='chain'?-4:level.objective==='sigil'?-5:-1;}
  function match3GoalCount(run,level){return level.colorGoal?Number(run.collectedByColor[level.colorGoal.color]||0):level.iceGoal?Number(run.iceCleared||0):level.relicGoal?Number(run.relicsCollected||0):level.chainGoal?Number(run.maxCascade||0):level.sigilGoal?Number(run.sigilsCleared||0):0;}
  function match3BoosterMarkup(inGame=false){
    return `<div class="ts-m3-booster-grid">${MATCH3_BOOSTERS.map(b=>{const quantity=Math.max(0,Number(match3Progress?.inventory?.[b.id]||0));if(inGame)return `<button type="button" class="ts-m3-booster-use" data-game-act="match3-booster-use" data-booster="${b.id}" ${quantity<1||!match3ServerReady?'disabled':''}><span class="ts-m3-booster-icon">${b.icon}</span><span><b>${b.button}</b><small>В наличии: ${quantity}</small></span></button>`;const priceLine=match3Progress?.coins===null?'Баланс аккаунта недоступен':`● ${b.price} монет`;const disabled=!match3ServerReady||!currentUserCached||Number(match3Progress?.coins||0)<b.price;return `<article class="ts-m3-booster-card"><span class="ts-m3-booster-icon">${b.icon}</span><div><b>${b.name}</b><p>${b.desc}</p><small>В наличии: ${quantity}</small></div><button type="button" class="ts-m3-buy" data-game-act="match3-booster-buy" data-booster="${b.id}" ${disabled?'disabled':''}>${priceLine}</button></article>`;}).join('')}</div>`;
  }
  let currentUserCached=false;
  async function openMatch3Campaign(){
    stopTodayMiniGame();await match3RefreshProgress();currentUserCached=!!(await currentUser());
    const unlocked=Math.max(1,Math.min(221,Number(match3Progress?.unlocked_level||1))),completedIds=new Set(Object.entries(match3Progress.levels||{}).filter(([,row])=>row?.completed).map(([id])=>Number(id))),completed=completedIds.size;
    const activeLevel=MATCH3_LEVELS[Math.min(219,unlocked-1)],activeChapter=MATCH3_CHAPTERS[activeLevel.chapter];
    const chapters=MATCH3_CHAPTERS.map((c,chapterIndex)=>{const start=chapterIndex*20+1,end=start+19,chapterUnlocked=unlocked>=start,chapterDone=unlocked>end,levels=MATCH3_LEVELS.filter(l=>l.chapter===chapterIndex).map(l=>{const row=match3Progress.levels?.[String(l.id)]||match3Progress.levels?.[l.id]||{},locked=l.id>unlocked,complete=!!row.completed;return `<button type="button" class="ts-m3-level ${locked?'is-locked':''} ${complete?'is-complete':''} ${l.id===unlocked?'is-current':''}" data-game-act="match3-level" data-level="${l.id}" ${locked?'disabled':''} aria-label="Уровень ${l.id}: ${h(l.name)}${locked?', закрыт':''}"><span class="ts-m3-level-number">${locked?'◇':l.id}</span><b>${h(l.name.replace(c.prefix+': ',''))}</b><small>${complete?('★'.repeat(Math.max(1,Number(row.best_stars||1)))):locked?'ЗАКРЫТ':'ИГРАТЬ'}</small>${complete?`<em>${Number(row.best_score||0).toLocaleString('ru-RU')}</em>`:''}</button>`;}).join('');return `<details class="ts-m3-chapter ${chapterUnlocked?'':'is-locked'}" ${chapterIndex===activeLevel.chapter?'open':''}><summary class="ts-m3-chapter-head"><span class="ts-m3-chapter-mark">${c.trophyMark}</span><div><small>${h(c.place)}</small><h3>${h(c.name)}</h3><p>${start}—${end} уровни · ${chapterDone?'ГЛАВА ПРОЙДЕНА':chapterUnlocked?'ДОСТУПНО':'СНАЧАЛА ОТКРОЙ ПРЕДЫДУЩУЮ'}</p></div><b>${chapterDone?'✓':String(chapterIndex+1).padStart(2,'0')}</b><span class="ts-m3-chapter-chevron">⌄</span></summary><p class="ts-m3-chapter-summary">${h(c.short)}</p><div class="ts-m3-level-grid">${levels}</div></details>`;}).join('');
    const trophyCards=MATCH3_LEVELS.map(l=>{const earned=completedIds.has(l.id),t=l.trophy;return `<div class="ts-m3-trophy ${earned?'is-earned':'is-locked'} tone-${t.tone}" title="${earned?h(t.name):'Сувенир уровня '+l.id+' — ещё не найден'}"><span>${earned?t.icon:'◇'}</span><b>${String(l.id).padStart(3,'0')}</b><small>${earned?h(t.name):'Скрытая реликвия'}</small></div>`;}).join('');
    const localNote=match3ServerReady?'Прогресс синхронизируется с аккаунтом.':'<em>'+h(match3ServerMessage||'Пока доступно локальное сохранение.')+'</em>',storeTitle=currentUserCached?'Усилители за монеты TODAY':'Усилители доступны после входа в аккаунт';
    const heroineStatus=unlocked<41?'След Элары':unlocked<81?'Послания найдены':unlocked<121?'Правда раскрыта':unlocked<181?'Принцесса найдена':'Последняя печать';
    const html=`<div class="ts-m3-campaign ts-m3-royal-campaign">
      <section class="ts-m3-hero ts-m3-royal-hero"><div class="ts-m3-hero-art" aria-hidden="true"><svg viewBox="0 0 620 270" role="presentation"><defs><linearGradient id="m3RescueGem" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e0f8ff"/><stop offset=".32" stop-color="#9b8cff"/><stop offset=".68" stop-color="#5e8dff"/><stop offset="1" stop-color="#5be7d2"/></linearGradient><linearGradient id="m3RescueDress" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffd5ee"/><stop offset=".52" stop-color="#bc91ff"/><stop offset="1" stop-color="#7369db"/></linearGradient><radialGradient id="m3RescueAura"><stop stop-color="#8ae9ff" stop-opacity=".46"/><stop offset="1" stop-color="#8ae9ff" stop-opacity="0"/></radialGradient><linearGradient id="m3RescueCastle" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#6978ba"/><stop offset="1" stop-color="#1b2448"/></linearGradient></defs><circle cx="330" cy="130" r="145" fill="url(#m3RescueAura)"/><g fill="url(#m3RescueCastle)" stroke="#bfcbff" stroke-opacity=".24"><path d="M80 253V151L112 112 144 151V253H80Z"/><path d="M130 253V111L170 72 210 111V253H130Z"/><path d="M180 253V169L219 126 258 169V253Z"/><path d="M340 253V132L379 93 418 132V253Z"/><path d="M407 253V108L446 67 485 108V253Z"/><path d="M465 253V154L503 114 541 154V253Z"/><path d="M98 151L112 94 126 151ZM149 111L170 43 191 111ZM200 169L219 107 238 169ZM360 132L379 72 398 132ZM426 108L446 34 466 108ZM483 154L503 97 522 154Z"/></g><g fill="#b9eaff" opacity=".78"><rect x="105" y="169" width="13" height="22" rx="6"/><rect x="163" y="129" width="14" height="25" rx="7"/><rect x="212" y="184" width="13" height="23" rx="6"/><rect x="373" y="147" width="13" height="26" rx="6"/><rect x="439" y="123" width="14" height="24" rx="7"/><rect x="497" y="171" width="13" height="21" rx="6"/></g><g transform="translate(310 126)"><circle cx="0" cy="-34" r="18" fill="#f7cbb7"/><path d="M-20 -37Q-22 -62 0 -63Q26 -59 20 -26L13 -15Q11 -39 -4 -39Q-14 -38 -20 -22Z" fill="#6f3b75"/><path d="M-20 -52L-27 -68L-8 -61L0 -77L8 -61L27 -68L20 -50Z" fill="#f0cd7f" stroke="#fff3c1" stroke-width="2"/><path d="M-12 -14L-36 10L-48 79Q0 101 48 79L36 10L12 -14Z" fill="url(#m3RescueDress)" stroke="#ffe2fb" stroke-opacity=".75" stroke-width="2"/><path d="M-12 -14L0 27L12 -14L20 3L0 87L-20 3Z" fill="#fff" fill-opacity=".38"/><path d="M-37 6L-57 42L-42 50L-24 22ZM37 6L57 42L42 50L24 22Z" fill="#f7cbb7"/><circle cx="0" cy="-33" r="23" fill="none" stroke="#ffde9f" stroke-width="2" stroke-dasharray="2 5" opacity=".8"/></g><g transform="translate(196 143)"><path d="M0 -74 34 -32 24 33 0 69 -24 33 -34 -32Z" fill="url(#m3RescueGem)" stroke="#f4ffff" stroke-width="2"/><path d="M0 -74V69L-24 33 -34 -32Z" fill="#fff" fill-opacity=".17"/><path d="M0 -74 34 -32 0 -13 -34 -32Z" fill="#fff" fill-opacity=".47"/><path d="M0 -13 24 33 0 69 -24 33Z" fill="#213c9a" fill-opacity=".18"/><circle r="83" fill="none" stroke="#bbceff" stroke-opacity=".28" stroke-dasharray="4 11"/><path d="M0 -98l5 14 14 5-14 5-5 14-5-14-14-5 14-5Z" fill="#fff2b5"/></g><g fill="#fff"><circle cx="75" cy="60" r="2"/><circle cx="252" cy="34" r="2.8"/><circle cx="551" cy="53" r="2"/><circle cx="535" cy="219" r="2.6"/><circle cx="272" cy="232" r="1.8"/></g></svg></div><div class="ts-m3-hero-copy"><span class="ts-m3-eyebrow">TODAY ORIGINAL · 220 УРОВНЕЙ · 11 ГЛАВ</span><h2>CRYSTAL<br><span>CHRONICLES</span></h2><p>Принцессу Элару забрала Бездна. Собери кристаллы, раскрой тайну Морвена и пройди путь от забытых садов до Башни последней звезды.</p><div class="ts-m3-hero-stats"><span><b>${Math.min(220,unlocked-1)}</b><small>/ 220 уровней</small></span><span><b>${completed}</b><small>побед</small></span><span><b>${completed}</b><small>реликвий собрано</small></span></div><div class="ts-m3-rescue-status"><span>♕</span><div><small>ПУТЬ ПРИНЦЕССЫ ЭЛАРЫ</small><b>${heroineStatus}</b><i><span style="width:${Math.min(100,Math.max(0,completed/220*100))}%"></span></i></div></div><div class="ts-m3-save-state"><span class="ts-m3-live-dot"></span>${localNote}</div></div></section>
      <section class="ts-m3-story ts-m3-royal-intro"><div class="ts-m3-section-label">ТВОЯ МИССИЯ</div><h3>Королевство забыло её имя. Ты должен вернуть его.</h3><p>Морвен запер принцессу в сердце Бездны, чтобы стереть собственную боль. 11 земель отделяют тебя от Элары. Каждая глава открывает новые правила, более сложные поля и фрагменты настоящей истории.</p><div class="ts-m3-royal-story-stats"><span>11 сюжетных глав</span><span>6 типов испытаний</span><span>220 сувениров</span></div></section>
      <section class="ts-m3-map"><div class="ts-m3-map-title"><div><span class="ts-m3-eyebrow">КАРТА КОРОЛЕВСТВА</span><h3>Путь к спасению</h3></div><span class="ts-m3-coin-pill">${completed}/220</span></div><div class="ts-m3-chapter-list">${chapters}</div></section>
      <details class="ts-m3-album"><summary><span><b>Альбом королевских реликвий</b><small>Коллекционные сувениры за прохождение каждого уровня</small></span><strong>${completed}/220</strong></summary><p>Каждая реликвия — только памятный знак в твоём альбоме. Она не добавляет очков, монет, усилений или преимуществ и никак не меняет игровой баланс.</p><div class="ts-m3-trophy-grid">${trophyCards}</div></details>
      <section class="ts-m3-store"><div class="ts-m3-map-title"><div><span class="ts-m3-eyebrow">СНАБЖЕНИЕ ХРАНИТЕЛЯ</span><h3>${storeTitle}</h3></div><span class="ts-m3-coin-pill">● ${match3Progress.coins===null?'—':Number(match3Progress.coins).toLocaleString('ru-RU')}</span></div><p>Усилители покупаются за золотые монеты TODAY. Сувениры за уровни не продаются и не дают игровых преимуществ.</p>${match3BoosterMarkup(false)}${!currentUserCached?'<p class="ts-m3-server-note">Войди в аккаунт, чтобы использовать монеты и переносить инвентарь между устройствами.</p>':''}</section>
    </div>`;
    modal(panelShell('CRYSTAL CHRONICLES','Спаси принцессу Элару · 220 уровней',html));match3V42EnhanceCampaign();
  }
  function chapterIndexText(n){return String(n).padStart(2,'0');}
/* TODAY CRYSTAL CHRONICLES V42 BEGIN — 100 upgrades: rendering, feel, systems, story, accessibility. */
  const MATCH3_V42_STORAGE='today-crystal-chronicles-v42';
  const MATCH3_V42_PALETTES=[{id:'cosmos',name:'Космос'},{id:'aurora',name:'Полярное сияние'},{id:'dawn',name:'Рассвет'}];
  const MATCH3_V42_MOTION=[{id:'low',name:'Тихие'},{id:'standard',name:'Стандарт'},{id:'cinematic',name:'Кино'}];
  const MATCH3_V42_IMPROVEMENTS=[
    'Глубокий космический фон поля','Динамическая атмосфера по главам','Слоистое стекло рамки','Переливчатая кромка поля','Мягкий внутренний свет','Адаптивная тень кристалла','Дополнительные грани самоцветов','Точный зеркальный блик','Радиальный свет за фишками','Пульсирующий контур выбора',
    'Читаемые метки для цветов','Контрастные метки льда','Пульс печатей тени','Золотое свечение реликвий','Осколки памяти на поле','Отдельная форма звёздного ядра','Стеклянная шкала цели','Градиент прогресса уровня','Выделение почти достигнутой цели','Премиальная панель хранителя',
    'Плавная посадка новых фишек','FLIP-анимация перемещения','Чистая вспышка совпадения','Усиление каскадной волны','Волна кристальной бомбы','След ракетной искры','Кольцо сверхновой','Анимация заряда резонанса','Дрожание рамки по силе события','Раскрытие награды',
    'Спокойная анимация кнопок','Мягкое наведение мыши','Отзывчивое нажатие','Аккуратное появление подсказки','Пульс завершения главы','Анимация ранения стража','Анимация нового осколка','Сверкание собранной реликвии','Перелистывание хроники','Отмена лишних движений при reduced-motion',
    'Накопление резонанса Lumi','Удар хранителя по строке и столбцу','Звёздное ядро за линию из шести','Осколки памяти как новый сбор','Страж в финале каждой главы','Полоса здоровья стража','Урон от каскадов','Бонус за активацию спецкристалла','Ежедневная миссия','Награда за ежедневную миссию',
    'Локальная серия ежедневных побед','Косметическая пыльца созвездия','Свайп для обмена фишек','Навигация стрелками клавиатуры','Синтезированные звуковые сигналы','Переключатель звука','Переключатель тактильного отклика','Переключатель символов на фишках','Три палитры поля','Три режима визуальных эффектов',
    'Пауза без потери поля','Возобновление из паузы','Журнал главы','Пять фрагментов каждой главы','Прозрачное описание механики уровня','Счётчик очищенных кристаллов','Счётчик каскадов','Счётчик использованных ходов','Счётчик осколков памяти','Личная сводка забега',
    'Постоянная косметическая коллекция','Защита от повторного получения награды','Сохранение настроек между сессиями','Ежедневная смена задания','Индикатор прогресса задания','Подсказка цели возле поля','Разделённые уровни по главам','Тематическая цветовая палитра глав','Адаптация панели под узкий экран','Безопасные зоны мобильного экрана',
    'Облегчённые эффекты для слабых устройств','Чёткий фокус клавиатуры','Тактильная область кнопок 44px','Отключение свайпа при overlay','Сохранение баланса монет','Никаких платных бонусов за локальную пыльцу','Никаких изменений Supabase','Никаких сетевых запросов из эффектов','Защита от двойного тапа','Защита от повторного запуска ввода',
    'Улучшенная типографика статуса','Одинаковая визуальная иерархия','Контрастные кнопки действия','Доступные подписи новых элементов','Улучшенная aria-метка поля','Уважение prefers-reduced-motion','Уважение prefers-color-scheme только эффектами','Сохранение существующих 220 уровней','Сохранение 11 актов сюжета','Новая оболочка CRYSTAL CHRONICLES V42'
  ];
  let match3V42Memory=null;
  function match3V42Read(){try{const raw=localStorage.getItem(MATCH3_V42_STORAGE);const d=raw?JSON.parse(raw):null;return d&&typeof d==='object'?d:{prefs:{sound:false,haptics:true,symbols:true,palette:0,motion:1},stardust:0,echoes:0,streak:0,lastClaim:'',daily:null,guardians:{}};}catch(_){return match3V42Memory||{prefs:{sound:false,haptics:true,symbols:true,palette:0,motion:1},stardust:0,echoes:0,streak:0,lastClaim:'',daily:null,guardians:{}};}}
  function match3V42Write(data){match3V42Memory=data;try{localStorage.setItem(MATCH3_V42_STORAGE,JSON.stringify(data));}catch(_){}return data;}
  function match3V42Today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function match3V42DailySpec(day=match3V42Today()){
    const tasks=[
      {icon:'✦',title:'Сияющий след',desc:'Очисти 45 кристаллов в любых уровнях.',metric:'clears',target:45},
      {icon:'⛓',title:'Цепная реакция',desc:'Запусти 4 каскада за день.',metric:'cascades',target:4},
      {icon:'✹',title:'Сила созвездия',desc:'Создай или активируй 3 особых кристалла.',metric:'specials',target:3},
      {icon:'◈',title:'Мастер ходов',desc:'Сделай 12 действительных обменов.',metric:'moves',target:12},
      {icon:'★',title:'Печать рассвета',desc:'Заверши один уровень победой.',metric:'wins',target:1},
      {icon:'✧',title:'Многоцветье',desc:'Набери 3 500 очков за день.',metric:'score',target:3500},
      {icon:'♕',title:'Возвращение света',desc:'Очисти 60 кристаллов за день.',metric:'clears',target:60}
    ];
    const n=Number(day.replace(/-/g,''))||0;return {...tasks[n%tasks.length],day};
  }
  function match3V42EnsureDaily(){const d=match3V42Read(),today=match3V42Today();let changed=false;if(!d.prefs){d.prefs={sound:false,haptics:true,symbols:true,palette:0,motion:1};changed=true;}if(!d.guardians){d.guardians={};changed=true;}if(!d.daily||d.daily.day!==today){const spec=match3V42DailySpec(today);d.daily={day:today,metric:spec.metric,stats:{clears:0,cascades:0,specials:0,moves:0,wins:0,score:0},claimed:false};changed=true;}return changed?match3V42Write(d):d;}
  function match3V42Settings(){const d=match3V42EnsureDaily();return d.prefs;}
  function match3V42TrackDaily(metric,amount=1){const d=match3V42EnsureDaily();if(!d.daily.stats[metric]&&d.daily.stats[metric]!==0)d.daily.stats[metric]=0;d.daily.stats[metric]=Math.max(0,Number(d.daily.stats[metric]||0)+Number(amount||0));return match3V42Write(d);}
  function match3V42DailyProgress(){const d=match3V42EnsureDaily(),spec=match3V42DailySpec(d.daily.day);return {data:d,spec,value:Number(d.daily.stats[spec.metric]||0),done:Number(d.daily.stats[spec.metric]||0)>=spec.target};}
  function match3V42DailyHtml(){const q=match3V42DailyProgress(),pct=Math.min(100,Math.round(q.value/q.spec.target*100));return `<section class="ts-m3-v42-daily"><div class="ts-m3-v42-daily-mark">${q.spec.icon}</div><div class="ts-m3-v42-daily-copy"><span>ЗАДАНИЕ ДНЯ · ${h(q.spec.day)}</span><h3>${h(q.spec.title)}</h3><p>${h(q.spec.desc)}</p><div class="ts-m3-v42-track"><i style="width:${pct}%"></i></div><small>${Math.min(q.spec.target,q.value).toLocaleString('ru-RU')} / ${q.spec.target.toLocaleString('ru-RU')} · ${q.data.streak||0} дней подряд</small></div><button type="button" class="ts-m3-v42-claim" data-game-act="match3-v42-daily-claim" ${!q.done||q.data.daily.claimed?'disabled':''}>${q.data.daily.claimed?'Забрано ✓':q.done?'Забрать +3 ✧':'+3 ✧'}</button></section>`;}
  function match3V42EnhanceCampaign(){const campaign=byId('modalContent')?.querySelector('.ts-m3-campaign');if(!campaign||campaign.dataset.v42Enhanced==='1')return;campaign.dataset.v42Enhanced='1';const map=campaign.querySelector('.ts-m3-map');const d=match3V42EnsureDaily();const constellation=document.createElement('section');const unlocked=Object.keys(d.guardians||{}).filter(k=>d.guardians[k]).length;const palette=MATCH3_V42_PALETTES[(d.prefs.palette||0)%MATCH3_V42_PALETTES.length];const features=MATCH3_V42_IMPROVEMENTS.length;const ledger=document.createElement('div');ledger.className='ts-m3-v42-constellation';ledger.innerHTML=`<div class="ts-m3-v42-constellation-orb">✧</div><div class="ts-m3-v42-constellation-copy"><small>АТЛАС ХРАНИТЕЛЯ · V42</small><b>Созвездие памяти</b><span>${d.stardust||0} пылинок сияния · ${d.echoes||0} осколков памяти · ${unlocked}/11 стражей побеждено</span><i><span style="width:${Math.min(100,Number(d.echoes||0)/220*100)}%"></span></i></div><div class="ts-m3-v42-chip">${features} улучшений</div>`;const daily=document.createElement('div');daily.innerHTML=match3V42DailyHtml();const content=daily.firstElementChild;if(map){map.parentNode.insertBefore(ledger,map);map.parentNode.insertBefore(content,map);}else campaign.prepend(content);campaign.classList.add('ts-m3-v42-campaign');}
  function match3V42ApplyPrefs(gameRoot){if(!gameRoot)return;const p=match3V42Settings();gameRoot.classList.toggle('v42-symbols',!!p.symbols);const classes=[...MATCH3_V42_PALETTES.map(x=>'v42-palette-'+x.id),...MATCH3_V42_MOTION.map(x=>'v42-motion-'+x.id)];const palette='v42-palette-'+MATCH3_V42_PALETTES[(p.palette||0)%MATCH3_V42_PALETTES.length].id,motion='v42-motion-'+MATCH3_V42_MOTION[(p.motion||0)%MATCH3_V42_MOTION.length].id;for(const name of classes)if(name!==palette&&name!==motion&&gameRoot.classList.contains(name))gameRoot.classList.remove(name);if(!gameRoot.classList.contains(palette))gameRoot.classList.add(palette);if(!gameRoot.classList.contains(motion))gameRoot.classList.add(motion);}
  function match3V42RefreshControls(gameRoot){if(!gameRoot)return;const p=match3V42Settings();const s=gameRoot.querySelector('[data-game-act="match3-v42-sound"]');if(s)s.innerHTML=(p.sound?'♫ Звук: ВКЛ':'♫ Звук: ВЫКЛ');const ha=gameRoot.querySelector('[data-game-act="match3-v42-haptics"]');if(ha)ha.innerHTML=(p.haptics?'⌁ Тактильный: ВКЛ':'⌁ Тактильный: ВЫКЛ');const sy=gameRoot.querySelector('[data-game-act="match3-v42-symbols"]');if(sy)sy.innerHTML=(p.symbols?'◈ Символы: ВКЛ':'◈ Символы: ВЫКЛ');const th=gameRoot.querySelector('[data-game-act="match3-v42-theme"]');if(th)th.innerHTML='◉ '+MATCH3_V42_PALETTES[(p.palette||0)%MATCH3_V42_PALETTES.length].name;const mo=gameRoot.querySelector('[data-game-act="match3-v42-motion"]');if(mo)mo.innerHTML='✧ Эффекты: '+MATCH3_V42_MOTION[(p.motion||0)%MATCH3_V42_MOTION.length].name;}
  function match3V42SyncHud(run,level){const gameRoot=byId('modalContent')?.querySelector('.ts-m3-game');if(!gameRoot)return;match3V42ApplyPrefs(gameRoot);const focus=Math.max(0,Math.min(100,Number(run.focus||0)));const bar=gameRoot.querySelector('#todayMatchV42FocusBar'),value=gameRoot.querySelector('#todayMatchV42FocusValue'),btn=gameRoot.querySelector('[data-game-act="match3-v42-focus"]');if(bar)bar.style.width=focus+'%';if(value)value.textContent=focus+'%';if(btn){btn.disabled=focus<100||run.busy||run.ended||run.introLocked||run.paused;btn.classList.toggle('is-charged',focus>=100);btn.textContent=focus>=100?'✦ Удар хранителя · ГОТОВ':'✦ Удар хранителя';}const stats=gameRoot.querySelector('#todayMatchV42Stats');if(stats)stats.textContent=`${run.collected||0} очищено · ${run.maxCascade||0} каскад · ${run.movesUsed||0} ходов`;const boss=gameRoot.querySelector('#todayMatchV42BossBar'),bossValue=gameRoot.querySelector('#todayMatchV42BossValue');if(boss&&run.guardianMax>0)boss.style.width=Math.max(0,Math.min(100,run.guardianHp/run.guardianMax*100))+'%';if(bossValue&&run.guardianMax>0)bossValue.textContent=Math.max(0,run.guardianHp)+' / '+run.guardianMax;const pause=gameRoot.querySelector('#todayMatchPauseOverlay');if(pause)pause.hidden=!run.paused;}
/* TODAY CRYSTAL CHRONICLES V42 LEVEL THEMES BEGIN */
  function match3V42LevelStyle(level){
    const title=String(level?.name||'').split(':').pop().trim().toLocaleLowerCase('ru-RU');
    const styles={
      'первый след':'first-trail','разбитая печать':'broken-seal','письмо из света':'light-letter',
      'тропа созвездий':'star-trail','шёпот хранителей':'guardian-whisper','затерянный ключ':'lost-key',
      'ступени надежды':'hope-steps','капля памяти':'memory-drop','сторожевой огонь':'watch-fire',
      'тайный проход':'secret-passage','песнь осколков':'shard-song','лунный отпечаток':'moon-mark',
      'паутина теней':'shadow-web','испытание сердца':'heart-trial','сломанные часы':'broken-clock',
      'узник кристалла':'crystal-prisoner','пробуждение руны':'rune-awakening','последний фонарь':'last-lantern',
      'обет хранителя':'guardian-vow','дверь к рассвету':'dawn-door'
    };
    return styles[title]||'first-trail';
  }
  /* TODAY CRYSTAL CHRONICLES V42 LEVEL THEMES END */
  function match3V42EnhanceGame(level,run,host){const gameRoot=host?.closest('.ts-m3-game');if(!gameRoot||gameRoot.dataset.v42Enhanced==='1')return;gameRoot.dataset.v42Enhanced='1';gameRoot.dataset.match3Chapter=String(level.chapter);gameRoot.dataset.match3Level=String(level.id);gameRoot.dataset.match3LevelStyle=match3V43LevelStyle(level);gameRoot.dataset.match3LevelName=String(level.name||'');gameRoot.classList.add('ts-m3-v42-game');match3V42ApplyPrefs(gameRoot);const tools=gameRoot.querySelector('.ts-m3-game-tools');if(tools){const consoleNode=document.createElement('section');consoleNode.className='ts-m3-v42-console';consoleNode.innerHTML=`<div class="ts-m3-v42-focus"><div class="ts-m3-v42-focus-top"><span>РЕЗОНАНС ЛУМИ</span><b id="todayMatchV42FocusValue">0%</b></div><div class="ts-m3-v42-focus-track"><i id="todayMatchV42FocusBar"></i></div><button type="button" data-game-act="match3-v42-focus" disabled>✦ Удар хранителя</button><small>Заряжается от собранных кристаллов и каскадов. Выбери клетку для удара по строке и столбцу.</small></div><div class="ts-m3-v42-quick-actions"><button type="button" data-game-act="match3-v42-sound">♫ Звук: ВЫКЛ</button><button type="button" data-game-act="match3-v42-haptics">⌁ Тактильный: ВКЛ</button><button type="button" data-game-act="match3-v42-symbols">◈ Символы: ВКЛ</button><button type="button" data-game-act="match3-v42-theme">◉ Космос</button><button type="button" data-game-act="match3-v42-motion">✧ Эффекты: Стандарт</button><button type="button" data-game-act="match3-v42-journal">▤ Хроника</button><button type="button" data-game-act="match3-v42-pause">Ⅱ Пауза</button></div><div class="ts-m3-v42-statline" id="todayMatchV42Stats">0 очищено · 0 каскад · 0 ходов</div><div class="ts-m3-v42-help">На телефоне проведи пальцем между соседними кристаллами. На компьютере выбери две соседние клетки мышью или перемещай фокус стрелками.</div></section>`;tools.insertAdjacentElement('afterend',consoleNode);}
    const wrap=gameRoot.querySelector('.ts-m3-board-wrap');if(wrap){if(run.guardianMax>0){const boss=document.createElement('section');boss.className='ts-m3-v42-boss';boss.innerHTML=`<div class="ts-m3-v42-boss-avatar" aria-hidden="true">♜</div><div class="ts-m3-v42-boss-copy"><small>СТРАЖ ГЛАВЫ · ДОПОЛНИТЕЛЬНОЕ ИСПЫТАНИЕ</small><b>${h(MATCH3_CHAPTERS[level.chapter].name)}</b><div class="ts-m3-v42-boss-track"><i id="todayMatchV42BossBar"></i></div></div><strong id="todayMatchV42BossValue">${run.guardianHp} / ${run.guardianMax}</strong></section>`;wrap.insertAdjacentElement('beforebegin',boss);}const pause=document.createElement('div');pause.className='ts-m3-v42-pause';pause.id='todayMatchPauseOverlay';pause.hidden=true;pause.innerHTML=`<div class="ts-m3-v42-pause-card"><span>Ⅱ</span><small>CRYSTAL CHRONICLES</small><h3>Пауза хранителя</h3><p>Поле сохранено. Можно спокойно вернуться к комбинации.</p><button type="button" data-game-act="match3-v42-resume">Продолжить игру</button><button type="button" class="secondary" data-game-act="match3-back">К карте кампании</button></div>`;wrap.appendChild(pause);}
    const journal=document.createElement('div');journal.className='ts-m3-v42-journal';journal.id='todayMatchV42Journal';journal.hidden=true;journal.innerHTML=`<div class="ts-m3-v42-journal-card"><button type="button" class="ts-m3-v42-journal-close" data-game-act="match3-v42-journal-close" aria-label="Закрыть хронику">×</button><span class="ts-m3-eyebrow">${h(MATCH3_CHAPTERS[level.chapter].place)}</span><h3>${h(MATCH3_CHAPTERS[level.chapter].name)}</h3><p>${h(MATCH3_CHAPTERS[level.chapter].story)}</p><div>${MATCH3_CHAPTERS[level.chapter].beats.map((b,i)=>`<article><b>ФРАГМЕНТ ${i+1}</b><p>${h(b)}</p></article>`).join('')}</div></div>`;gameRoot.appendChild(journal);
    const gesture={start:null};host.addEventListener('pointerdown',event=>{if(run.ended||run.busy||run.introLocked||run.paused)return;const cell=event.target instanceof Element?event.target.closest('.ts-m3-gem[data-i]'):null;if(!cell)return;gesture.start={i:Number(cell.dataset.i),x:event.clientX,y:event.clientY,id:event.pointerId};},{passive:true});
    host.addEventListener('pointerup',event=>{const start=gesture.start;gesture.start=null;if(!start||run.ended||run.busy||run.introLocked||run.paused)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)+Math.abs(dy)<28)return;const dest=document.elementFromPoint(event.clientX,event.clientY);const cell=dest instanceof Element?dest.closest('.ts-m3-gem[data-i]'):null;if(!cell||!host.contains(cell))return;const j=Number(cell.dataset.i);if(!Number.isInteger(j)||j===start.i)return;event.preventDefault();run.suppressClicksUntil=Date.now()+550;run.tap(start.i);setTimeout(()=>{if(!run.ended)run.tap(j);},45);},{passive:false});
    host.addEventListener('click',event=>{if(run.suppressClicksUntil>Date.now()&&event.target instanceof Element&&event.target.closest('.ts-m3-gem[data-i]')){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();}},{capture:true});
    host.addEventListener('keydown',event=>{const cell=event.target instanceof Element?event.target.closest('.ts-m3-gem[data-i]'):null;if(!cell||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;const i=Number(cell.dataset.i),r=Math.floor(i/8),c=i%8;const n=event.key==='ArrowLeft'&&c>0?i-1:event.key==='ArrowRight'&&c<7?i+1:event.key==='ArrowUp'&&r>0?i-8:event.key==='ArrowDown'&&r<7?i+8:i;if(n!==i){event.preventDefault();host.querySelector(`[data-i="${n}"]`)?.focus();}});
    match3V42RefreshControls(gameRoot);match3V42SyncHud(run,level);
  }
  function match3V42PlaySound(kind){const p=match3V42Settings();if(!p.sound)return;try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;const ctx=match3V42PlaySound.ctx||(match3V42PlaySound.ctx=new Ctx());if(ctx.state==='suspended')ctx.resume().catch(()=>{});const osc=ctx.createOscillator(),gain=ctx.createGain();const freq=kind==='win'?880:kind==='special'?740:kind==='combo'?620:kind==='echo'?1040:430;osc.type=kind==='special'||kind==='win'?'sine':'triangle';osc.frequency.setValueAtTime(freq,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(140,freq*.55),ctx.currentTime+.12);gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.06,ctx.currentTime+.012);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.16);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.17);}catch(_){} }
  function match3V42FocusAction(){const run=match3ActiveRun;if(!run||run.ended||run.busy||run.introLocked||run.paused)return;if(Number(run.focus||0)<100){notify('Резонанс ещё заряжается. Собирай кристаллы и каскады.');return;}run.pendingBooster='focus';const status=byId('todayMatchStatus');if(status)status.textContent='Резонанс Луми заряжен: выбери кристалл, чтобы очистить его строку и столбец.';const btn=byId('modalContent')?.querySelector('[data-game-act="match3-v42-focus"]');if(btn)btn.textContent='Выбери клетку ✦';}
  function match3V42OpenJournal(){const j=byId('todayMatchV42Journal');if(j)j.hidden=false;}
  function match3V42TogglePause(){const run=match3ActiveRun;if(!run||run.ended||run.busy||run.introLocked)return;run.paused=!run.paused;match3V42SyncHud(run,run.level);}
  function match3V42ClaimDaily(){const q=match3V42DailyProgress();if(!q.done||q.data.daily.claimed){notify(q.data.daily.claimed?'Награда за задание дня уже получена.':'Сначала выполни задание дня.');return;}const d=q.data;const today=q.spec.day;const old=d.lastClaim||'';const prev=new Date(today+'T12:00:00'),yesterday=new Date(prev.getTime()-86400000).toISOString().slice(0,10);d.stardust=Math.max(0,Number(d.stardust||0))+3;d.streak=old===yesterday?Number(d.streak||0)+1:1;d.lastClaim=today;d.daily.claimed=true;match3V42Write(d);match3V42PlaySound('win');notify('Задание выполнено! +3 пылинки сияния. Это косметическая награда, не игровые монеты.');openMatch3Campaign();}
  function match3V42DamageGuardian(run,cleared,specialCount,chain){if(!run||run.guardianMax<=0||run.guardianHp<=0)return;const damage=Math.max(1,Math.floor(cleared/4)+(specialCount?2:0)+(chain>1?1:0));const before=run.guardianHp;run.guardianHp=Math.max(0,run.guardianHp-damage);const root=byId('modalContent')?.querySelector('.ts-m3-v42-boss');if(root){root.classList.remove('is-hit');void root.offsetWidth;root.classList.add('is-hit');}if(before>0&&run.guardianHp===0&&!run.guardianDefeated){run.guardianDefeated=true;const d=match3V42EnsureDaily();d.guardians[String(run.level.chapter)]=true;d.stardust=Math.max(0,Number(d.stardust||0))+2;match3V42Write(d);run.score+=350;match3V42TrackDaily('score',350);const status=byId('todayMatchStatus');if(status)status.textContent='СТРАЖ ПОВЕРЖЕН! +350 очков и +2 пылинки сияния. Награда только косметическая.';match3V42PlaySound('win');}match3V42SyncHud(run,run.level);}
  function match3V42UpdateOptions(action){const d=match3V42EnsureDaily(),p=d.prefs;let note='';if(action==='match3-v42-sound')p.sound=!p.sound;else if(action==='match3-v42-haptics')p.haptics=!p.haptics;else if(action==='match3-v42-symbols')p.symbols=!p.symbols;else if(action==='match3-v42-theme')p.palette=((Number(p.palette)||0)+1)%MATCH3_V42_PALETTES.length;else if(action==='match3-v42-motion')p.motion=((Number(p.motion)||0)+1)%MATCH3_V42_MOTION.length;match3V42Write(d);const gameRoot=byId('modalContent')?.querySelector('.ts-m3-game');match3V42ApplyPrefs(gameRoot);match3V42RefreshControls(gameRoot);if(action==='match3-v42-haptics')note=p.haptics?'Тактильный отклик включён.':'Тактильный отклик выключен.';else if(action==='match3-v42-sound')note=p.sound?'Звук включён.':'Звук выключен.';if(note)notify(note);if(p.sound&&action==='match3-v42-sound')match3V42PlaySound('special');}
  function match3V42FeatureStats(level,run,isWin,stars){const grade=isWin?(stars>=3?'S':stars===2?'A':'B'):'—';const boss=run.guardianMax>0?(run.guardianDefeated?'Страж главы побеждён · бонус получен':`Страж остался: ${run.guardianHp}/${run.guardianMax} · дополнительная задача`):'Без дополнительного стража';return `<section class="ts-m3-v42-run-summary"><div><small>ОЦЕНКА ЗАБЕГА</small><b>${grade}</b></div><div><small>ОЧИЩЕНО</small><b>${run.collected||0}</b></div><div><small>МАКС. КАСКАД</small><b>×${run.maxCascade||0}</b></div><div><small>ОСКОЛКИ</small><b>${run.echoesCollected||0}</b></div><p>${h(boss)} · ${h(MATCH3_CHAPTERS[level.chapter].name)}</p></section>`;}
  /* TODAY CRYSTAL CHRONICLES V42 END */

    function match3GemSvg(color,uid){
    const g=MATCH3_GEMS[color]||MATCH3_GEMS[0],gid='m3g'+String(uid).replace(/[^a-zA-Z0-9_-]/g,'');
    const shapes=['<path d="M32 4 53 19 47 45 32 60 17 45 11 19Z"/>','<path d="M32 4 42 18 59 24 48 39 49 55 32 48 15 55 16 39 5 24 22 18Z"/>','<path d="M32 4 53 15 53 43 32 60 11 43 11 15Z"/>','<path d="M32 5 39 21 56 24 43 36 47 54 32 45 17 54 21 36 8 24 25 21Z"/>','<path d="M32 5 48 13 57 29 48 47 32 59 16 47 7 29 16 13Z"/>','<path d="M32 4 50 15 46 36 32 60 18 36 14 15Z"/>','<path d="M32 4 49 15 54 35 42 53 32 60 22 53 10 35 15 15Z"/>'];
    return `<svg class="ts-m3-gem-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="${gid}" x1=".1" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="${g.c1}"/><stop offset=".45" stop-color="${g.c2}"/><stop offset="1" stop-color="${g.c3}"/></linearGradient><linearGradient id="${gid}s" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><g filter="drop-shadow(0 3px 3px rgba(1,5,20,.25))">${shapes[color%shapes.length].replace('<path','<path fill="url(#'+gid+')" stroke="'+g.line+'" stroke-opacity=".8" stroke-width="1.7" stroke-linejoin="round"')}<path d="M32 4 32 60 17 45 11 19Z" fill="#fff" fill-opacity=".14"/><path d="M32 4 53 19 32 29 11 19Z" fill="url(#${gid}s)" fill-opacity=".65"/><path d="M32 29 47 45 32 60 17 45Z" fill="#091732" fill-opacity=".10"/><path d="M20 18 28 12" stroke="#fff" stroke-linecap="round" stroke-width="2.2" stroke-opacity=".9"/></g></svg>`;
  }
  function match3LevelById(id){return MATCH3_LEVELS[Math.max(0,Math.min(219,Number(id)-1))]||MATCH3_LEVELS[0];}
  function match3NewGem(color){return {uid:'g'+(match3GemUid++),color:Number.isInteger(color)?color:Math.floor(Math.random()*MATCH3_GEMS.length)};}
  function match3FindMatches(cells){const core=window.TODAY_CRYSTAL_ENGINE_V1;if(core&&typeof core.findMatches==='function'){try{return core.findMatches(cells);}catch(error){console.warn('[TODAY Crystal Engine] match3FindMatches fallback',error);}}
    const found=new Set(),groups=[],n=8;
    const addRun=(indices,axis,color)=>{if(indices.length<3)return;groups.push({indices:indices.slice(),axis,color,length:indices.length});for(const index of indices)found.add(index);};
    for(let r=0;r<n;r++){
      let c=0;
      while(c<n){const idx=r*n+c,col=cells[idx]?.color;if(!Number.isInteger(col)){c++;continue;}let end=c+1;while(end<n&&cells[r*n+end]?.color===col)end++;if(end-c>=3)addRun(Array.from({length:end-c},(_,k)=>r*n+c+k),'h',col);c=end;}
    }
    for(let c=0;c<n;c++){
      let r=0;
      while(r<n){const idx=r*n+c,col=cells[idx]?.color;if(!Number.isInteger(col)){r++;continue;}let end=r+1;while(end<n&&cells[end*n+c]?.color===col)end++;if(end-r>=3)addRun(Array.from({length:end-r},(_,k)=>(r+k)*n+c),'v',col);r=end;}
    }
    const result=[...found].sort((a,b)=>a-b);result.groups=groups;return result;
  }
  function match3SpecialPlan(matches,preferred=[]){const core=window.TODAY_CRYSTAL_ENGINE_V1;if(core&&typeof core.specialPlan==='function'){try{return core.specialPlan(matches,preferred);}catch(error){console.warn('[TODAY Crystal Engine] match3SpecialPlan fallback',error);}}
    const groups=Array.isArray(matches?.groups)?matches.groups:[];
    const horizontal=groups.filter(g=>g.axis==='h'),vertical=groups.filter(g=>g.axis==='v');
    for(const hGroup of horizontal){for(const vGroup of vertical){const crossing=hGroup.indices.find(i=>vGroup.indices.includes(i));if(crossing!==undefined){return {type:'bomb',index:crossing,indices:[...new Set([...hGroup.indices,...vGroup.indices])],label:'КРИСТАЛЛЬНАЯ БОМБА',glyph:'✹'};}}}
    const sorted=groups.slice().sort((a,b)=>b.length-a.length);
    const group=sorted.find(g=>g.length>=6)||sorted.find(g=>g.length>=5)||sorted.find(g=>g.length>=4);
    if(!group)return null;
    const type=group.length>=6?'nova':group.length>=5?'rainbow':(group.axis==='h'?'rocket-h':'rocket-v');
    const preferredIndex=preferred.find(i=>group.indices.includes(i));
    const index=preferredIndex!==undefined?preferredIndex:group.indices[Math.floor((group.indices.length-1)/2)];
    return {type,index,indices:group.indices.slice(),label:type==='nova'?'ЗВЁЗДНОЕ ЯДРО':type==='rainbow'?'ПРИЗМЕННОЕ СЕРДЦЕ':type==='rocket-h'?'ГОРИЗОНТАЛЬНАЯ РАКЕТА':'ВЕРТИКАЛЬНАЯ РАКЕТА',glyph:type==='nova'?'✹':type==='rainbow'?'✺':type==='rocket-h'?'➜':'⬆'};
  }
  function match3ExpandSpecialClear(cells,seeds,targetColor=null,superCombo=false,protectedIndex=-1){const core=window.TODAY_CRYSTAL_ENGINE_V1;if(core&&typeof core.expandSpecialClear==='function'){try{return core.expandSpecialClear(cells,seeds,targetColor,superCombo,protectedIndex);}catch(error){console.warn('[TODAY Crystal Engine] match3ExpandSpecialClear fallback',error);}}
    const clear=new Set(),queue=[];
    const add=(i)=>{if(i<0||i>=cells.length||i===protectedIndex||clear.has(i))return;clear.add(i);queue.push(i);};
    for(const i of seeds)add(i);
    if(superCombo)for(let i=0;i<cells.length;i++)add(i);
    let cursor=0;
    while(cursor<queue.length&&cursor<4096){
      const i=queue[cursor++],cell=cells[i];if(!cell?.special)continue;
      const row=Math.floor(i/8),col=i%8,type=cell.special;
      if(type==='rocket-h'){for(let c=0;c<8;c++)add(row*8+c);}
      else if(type==='rocket-v'){for(let r=0;r<8;r++)add(r*8+col);}
      else if(type==='bomb'){for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const rr=row+dr,cc=col+dc;if(rr>=0&&rr<8&&cc>=0&&cc<8)add(rr*8+cc);}}
      else if(type==='nova'){for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const rr=row+dr,cc=col+dc;if(rr>=0&&rr<8&&cc>=0&&cc<8)add(rr*8+cc);}for(let c=0;c<8;c++)add(row*8+c);for(let r=0;r<8;r++)add(r*8+col);}
      else if(type==='rainbow'){let color=Number.isInteger(targetColor)?targetColor:cell.color;for(let j=0;j<cells.length;j++)if(cells[j]&&cells[j].color===color)add(j);}
    }
    return [...clear];
  }
  function match3SpecialGlyph(type){return type==='nova'?'✹':type==='rocket-h'?'➜':type==='rocket-v'?'⬆':type==='bomb'?'✹':type==='rainbow'?'✺':'✦';}

  function match3HasValidMove(cells){const core=window.TODAY_CRYSTAL_ENGINE_V1;if(core&&typeof core.hasValidMove==='function'){try{return core.hasValidMove(cells);}catch(error){console.warn('[TODAY Crystal Engine] match3HasValidMove fallback',error);}}for(let i=0;i<64;i++){for(const j of [i%8<7?i+1:-1,i<56?i+8:-1]){if(j<0)continue;const first=cells[i],second=cells[j];cells[i]=second;cells[j]=first;const ok=match3FindMatches(cells).length>0;cells[i]=first;cells[j]=second;if(ok)return true;}}return false;}
  function match3FreshBoard(){let cells=Array.from({length:64},()=>match3NewGem()),tries=0;while((match3FindMatches(cells).length||!match3HasValidMove(cells))&&tries++<100)cells=Array.from({length:64},()=>match3NewGem());return cells;}
  function match3LevelObjective(level){
    if(level.colorGoal)return `Набери ${level.scoreGate.toLocaleString('ru-RU')} очков и собери ${level.colorGoal.count} кристаллов «${MATCH3_GEMS[level.colorGoal.color].name}».`;
    if(level.iceGoal)return `Разбей ${level.iceGoal.count} ледяных печатей и набери ${level.scoreGate.toLocaleString('ru-RU')} очков.`;
    if(level.relicGoal)return `Собери ${level.relicGoal.count} королевских реликвий и набери ${level.scoreGate.toLocaleString('ru-RU')} очков.`;
    if(level.chainGoal)return `Создай каскад из ${level.chainGoal.count} цепных комбинаций и набери ${level.scoreGate.toLocaleString('ru-RU')} очков.`;
    if(level.sigilGoal)return `Разбей ${level.sigilGoal.count} печатей тени и набери ${level.scoreGate.toLocaleString('ru-RU')} очков.`;
    return `Набери ${level.scoreGate.toLocaleString('ru-RU')} очков.`;
  }
  function match3RussianPlural(count,forms){const n=Math.abs(Number(count)||0),last100=n%100,last=n%10;if(last100>=11&&last100<=14)return forms[2];if(last===1)return forms[0];if(last>=2&&last<=4)return forms[1];return forms[2];}
  function match3MissionForLevel(level){
    if(level.colorGoal){const n=level.colorGoal.count,forms=[['аметист','аметиста','аметистов'],['сапфир','сапфира','сапфиров'],['изумруд','изумруда','изумрудов'],['топаз','топаза','топазов'],['рубин','рубина','рубинов'],['кристалл лунного льда','кристалла лунного льда','кристаллов лунного льда'],['солнечный кристалл','солнечных кристалла','солнечных кристаллов']][level.colorGoal.color]||['кристалл','кристалла','кристаллов'];return {title:`УНИЧТОЖЬ ${n} ${match3RussianPlural(n,forms).toLocaleUpperCase('ru-RU')}`,sub:`Собери ${MATCH3_GEMS[level.colorGoal.color].name.toLocaleLowerCase('ru-RU')} и набери ${level.scoreGate.toLocaleString('ru-RU')} очков.`,icon:'✦'};}
    if(level.iceGoal)return {title:`РАЗДРОБИ ${level.iceGoal.count} ЛЕДЯНЫХ ПЕЧАТЕЙ`,sub:`Осторожно: часть льда защищена двумя слоями.`,icon:'❄'};
    if(level.relicGoal)return {title:`СОБЕРИ ${level.relicGoal.count} КОРОЛЕВСКИХ РЕЛИКВИЙ`,sub:'Ищи золотые знаки на кристаллах и не упусти ни одной реликвии.',icon:'♕'};
    if(level.chainGoal)return {title:`СОЗДАЙ ${level.chainGoal.count} ЦЕПНЫХ КАСКАДА`,sub:'Запускай комбинации одну за другой — каждый каскад усиливает счёт.',icon:'⛓'};
    if(level.sigilGoal)return {title:`РАЗРУШЬ ${level.sigilGoal.count} ПЕЧАТЕЙ ТЕНИ`,sub:'Собирай кристаллы на клетках с рунами, чтобы снять защиту Бездны.',icon:'⛨'};
    return {title:`НАБЕРИ ${level.scoreGate.toLocaleString('ru-RU')} ОЧКОВ`,sub:'Создавай длинные линии и используй специальные кристаллы.',icon:'★'};
  }
  function match3PlaceIndices(count,avoid=[]){const blocked=new Set(avoid),pool=Array.from({length:64},(_,i)=>i).filter(i=>!blocked.has(i));for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}return pool.slice(0,Math.min(count,pool.length));}
  function match3PrepareMechanics(run){
    const level=run.level,used=[];
    if(level.relicGoal){const positions=match3PlaceIndices(level.relicGoal.count+3,used);for(const i of positions){run.cells[i].relic=true;used.push(i);}}
    if(level.iceGoal){const count=level.iceGoal.count+7,positions=match3PlaceIndices(count,used);for(let n=0;n<positions.length;n++){const i=positions[n];run.ice[i]=(level.id>=121&&n%3===0)?2:1;used.push(i);}}
    else if(level.id>=50&&level.id%6===0){for(const i of match3PlaceIndices(Math.min(7,2+Math.floor(level.id/65)),used)){run.ice[i]=1;used.push(i);}}
    if(level.sigilGoal){const positions=match3PlaceIndices(level.sigilGoal.count+4,used);for(let n=0;n<positions.length;n++){const i=positions[n];run.sigils[i]=(level.id>=151&&n%3===0)?2:1;used.push(i);}}
    else if(level.id>=75&&level.id%17===0){for(const i of match3PlaceIndices(3,used)){run.sigils[i]=1;used.push(i);}}
    if(level.id>=16&&level.id%5===0){for(const i of match3PlaceIndices(Math.min(8,2+Math.floor(level.id/36)),used)){if(run.cells[i])run.cells[i].echo=true;used.push(i);}}
  }
  function match3ShowHint(){
    const run=match3ActiveRun,host=byId('todayMatchBoard');if(!run||!host||run.ended||run.busy||run.introLocked)return;
    const now=Date.now();if(now<(run.hintCooldownUntil||0)){const status=byId('todayMatchStatus');if(status)status.textContent='Подсказка скоро восстановится — пока попробуй найти длинную линию.';return;}
    let pair=null;
    for(let i=0;i<64&&!pair;i++){for(const j of [i%8<7?i+1:-1,i<56?i+8:-1]){if(j<0)continue;const first=run.cells[i],second=run.cells[j];run.cells[i]=second;run.cells[j]=first;const ok=match3FindMatches(run.cells).length>0;run.cells[i]=first;run.cells[j]=second;if(ok){pair=[i,j];break;}}}
    if(!pair){const status=byId('todayMatchStatus');if(status)status.textContent='Перестраиваю поле без штрафа за ход…';return;}
    run.hintCooldownUntil=now+3500;const a=host.querySelector(`[data-i="${pair[0]}"]`),b=host.querySelector(`[data-i="${pair[1]}"]`);a?.classList.add('is-hint');b?.classList.add('is-hint');
    const button=host.closest('.ts-m3-game')?.querySelector('[data-game-act="match3-hint"]');if(button){button.disabled=true;button.innerHTML='✦ Подсказка <small>3 с</small>';}
    const status=byId('todayMatchStatus');if(status)status.textContent='Подсказка: попробуй поменять эти два кристалла местами.';
    if(run.hintTimer)clearTimeout(run.hintTimer);run.hintTimer=setTimeout(()=>{a?.classList.remove('is-hint');b?.classList.remove('is-hint');const current=host.closest('.ts-m3-game')?.querySelector('[data-game-act="match3-hint"]');if(current){current.disabled=false;current.textContent='✦ Подсказка';}},3500);
  }
  async function startMatch3Level(levelId){
    stopTodayMiniGame();if(!match3Progress){await match3RefreshProgress();}currentUserCached=!!match3CurrentUserId;
    const level=match3LevelById(levelId),unlocked=Math.max(1,Number(match3Progress?.unlocked_level||1));if(level.id>unlocked){notify('Сначала пройди предыдущие уровни кампании.');return openMatch3Campaign();}
    const story=match3StoryForLevel(level.id),beat=story.beats[Math.min(4,Math.floor(level.local/4))],trophy=level.trophy,mission=match3MissionForLevel(level);
    const objectiveHtml=`${level.colorGoal?`<span id="todayMatchColorGoal">${MATCH3_GEMS[level.colorGoal.color].mark} ${MATCH3_GEMS[level.colorGoal.color].name}: <b>0 / ${level.colorGoal.count}</b></span>`:''}${level.iceGoal?`<span id="todayMatchIceGoal">❄ Лёд: <b>0 / ${level.iceGoal.count}</b></span>`:''}${level.relicGoal?`<span id="todayMatchRelicGoal">✦ Реликвии: <b>0 / ${level.relicGoal.count}</b></span>`:''}${level.chainGoal?`<span id="todayMatchChainGoal">⛓ Каскад: <b>0 / ${level.chainGoal.count}</b></span>`:''}${level.sigilGoal?`<span id="todayMatchSigilGoal">⛨ Печати: <b>0 / ${level.sigilGoal.count}</b></span>`:''}`;
    const html=`<div class="ts-m3-game ts-m3-royal-game ts-m3-v42-game" data-match3-level="${level.id}" data-match3-chapter="${level.chapter}"><div class="ts-m3-level-toolbar"><button type="button" class="ts-mini" data-game-act="match3-back">← Карта кампании</button><span class="ts-m3-level-badge">ГЛАВА ${level.chapter+1} · УРОВЕНЬ ${String(level.id).padStart(3,'0')}</span></div><section class="ts-m3-level-intro"><span class="ts-m3-eyebrow">${h(story.place)}</span><h3>${h(level.name)}</h3><p>${h(match3LevelObjective(level))}</p></section><aside class="ts-m3-chronicle"><span class="ts-m3-chronicle-mark">♕</span><div><small>ХРОНИКА ЭЛАРЫ · ФРАГМЕНТ ${String(level.id).padStart(3,'0')}</small><p>${h(beat)}</p></div></aside><div class="ts-m3-game-hud"><div><small>ОЧКИ</small><b id="todayMatchScore">0</b></div><div><small>ЦЕЛЬ</small><b id="todayMatchTarget">${level.scoreGate.toLocaleString('ru-RU')}</b></div><div><small>ХОДЫ</small><b id="todayMatchMoves">${level.moves}</b></div><div><small>КОМБО</small><b id="todayMatchCombo">×1</b></div></div><div class="ts-m3-objectives"><div class="ts-m3-score-track"><i id="todayMatchScoreBar"></i></div><div class="ts-m3-objective-copy"><span id="todayMatchScoreLabel">0 / ${level.scoreGate.toLocaleString('ru-RU')} очков</span>${objectiveHtml}</div></div>${window.TODAY_CRYSTAL_BLOCKS_V1.hudMarkup()}<div class="ts-m3-board-wrap"><div id="todayMatchBoard" class="ts-match-board ts-m3-board" role="group" aria-label="Игровое поле 8 на 8"></div><div id="todayMatch3Fx" class="ts-m3-fx" aria-hidden="true"></div><div id="todayMatchMissionSplash" class="ts-m3-mission-splash" role="status" aria-live="assertive"><div class="ts-m3-mission-orbit" aria-hidden="true">${mission.icon}</div><span class="ts-m3-mission-kicker">МИССИЯ УРОВНЯ ${String(level.id).padStart(3,'0')}</span><h2>${h(mission.title)}</h2><p>${h(mission.sub)}</p><div class="ts-m3-mission-count"><b id="todayMatchMissionCountdown">3</b><span>СТАРТ</span></div><div class="ts-m3-mission-timer"><i></i></div></div></div><div class="ts-m3-status" id="todayMatchStatus" role="status">Меняй местами соседние кристаллы. Собирай линии из 4–5 кристаллов для создания специальных самоцветов.</div><div class="ts-m3-game-tools"><button type="button" class="ts-m3-hint-button" data-game-act="match3-hint">✦ Подсказка</button><span>Бесплатная подсказка · без расхода хода</span></div><div class="ts-m3-inventory"><div class="ts-m3-map-title"><div><span class="ts-m3-eyebrow">КАРМАН ХРАНИТЕЛЯ</span><h3>Усилители</h3></div><span class="ts-m3-coin-pill">● ${match3Progress.coins===null?'—':Number(match3Progress.coins).toLocaleString('ru-RU')}</span></div>${match3BoosterMarkup(true)}</div><div id="todayMatch3Result" class="ts-m3-result" hidden></div></div>`;
    modal(panelShell('CRYSTAL CHRONICLES',`Уровень ${level.id} · ${h(level.name)}`,html));const shell=byId('modal');if(shell){shell.classList.add('today-match3-fullscreen');document.body.classList.add('today-match3-active');}const scrollHost=byId('modalContent');if(scrollHost)scrollHost.scrollTop=0;const scrollCard=shell?.querySelector('.modal-card');if(scrollCard)scrollCard.scrollTop=0;initMatch3CampaignGame(level.id);match3V42EnhanceGame(level,match3ActiveRun,byId('todayMatchBoard'));
  }
  function initMatch3CampaignGame(levelId){
    const host=byId('todayMatchBoard');if(!host)return;const level=match3LevelById(levelId),run={level,cells:match3FreshBoard(),ice:Array(64).fill(0),sigils:Array(64).fill(0),selected:-1,score:0,moves:level.moves,movesUsed:0,combo:1,collected:0,collectedByColor:{},iceCleared:0,relicsCollected:0,maxCascade:0,sigilsCleared:0,startedAt:Date.now(),ended:false,busy:false,pendingBooster:'',serverReady:match3ServerReady,introLocked:true,missionTimer:null,missionInterval:null,hintTimer:null,hintCooldownUntil:0,lastSwap:null,pendingSpecialTargetColor:null,pendingSuperCombo:false,specialsCreated:0,focus:0,echoesCollected:0,guardianHp:level.id%20===0?12:0,guardianMax:level.id%20===0?12:0,guardianDefeated:false,paused:false,suppressClicksUntil:0};match3PrepareMechanics(run);window.TODAY_CRYSTAL_BLOCKS_V1.initRun(run);match3ActiveRun=run;
    const draw=(animate=true)=>{
      const useMotion=animate&&!match3V43FastMode();const oldRects=new Map();if(useMotion)for(const el of host.querySelectorAll('[data-gem-uid]'))oldRects.set(el.dataset.gemUid,el.getBoundingClientRect());
      host.innerHTML=run.cells.map((cell,i)=>{
        if(!cell)return '<span class="ts-m3-empty" aria-hidden="true"></span>';
        const overlays=`${run.ice[i]?`<i class="ts-m3-cell-overlay ts-m3-ice" aria-hidden="true">❄${run.ice[i]>1?run.ice[i]:''}</i>`:''}${run.sigils[i]?`<i class="ts-m3-cell-overlay ts-m3-sigil" aria-hidden="true">⛨${run.sigils[i]>1?run.sigils[i]:''}</i>`:''}${cell.relic?'<i class="ts-m3-relic-mark" aria-hidden="true">✦</i>':''}${cell.echo?'<i class="ts-m3-v42-echo" aria-hidden="true">✧</i>':''}${cell.special?`<i class="ts-m3-special-badge special-${cell.special}" aria-hidden="true">${match3SpecialGlyph(cell.special)}</i>`:''}`;const specialClass=cell.special?` has-special is-special-${cell.special}`:'';
        const specialName=cell.special?`, специальный кристалл: ${cell.special==='nova'?'звёздное ядро':cell.special==='bomb'?'бомба':cell.special==='rainbow'?'призматический':cell.special==='rocket-h'?'горизонтальная ракета':'вертикальная ракета'}`:'';
        return `<button type="button" class="ts-m3-gem gem-${cell.color}${specialClass} ${i===run.selected?'is-selected':''}" data-game-act="match-tap" data-i="${i}" data-gem-uid="${cell.uid}" aria-label="${h(MATCH3_GEMS[cell.color].name)}${specialName}${cell.relic?', королевская реликвия':''}${run.ice[i]?', лёд '+run.ice[i]:''}${run.sigils[i]?', печать тени '+run.sigils[i]:''}, клетка ${Math.floor(i/8)+1}-${i%8+1}">${match3GemSvg(cell.color,cell.uid)}${overlays}${window.TODAY_CRYSTAL_BLOCKS_V1.blockMarkup(run,i)}</button>`;
      }).join('');
      /* TODAY CRYSTAL PHASER V1 — RENDER BRIDGE */
      try { window.__TODAY_CRYSTAL_PHASER?.update?.(run, useMotion); } catch (phaserBridgeError) { console.warn('[TODAY Crystal Phaser] update skipped', phaserBridgeError); }
      if(useMotion)requestAnimationFrame(()=>{for(const el of host.querySelectorAll('[data-gem-uid]')){const before=oldRects.get(el.dataset.gemUid),after=el.getBoundingClientRect();if(before){const dx=before.left-after.left,dy=before.top-after.top;if(Math.abs(dx)+Math.abs(dy)>1)try{el.animate([{transform:`translate(${dx}px,${dy}px) scale(.86) rotate(-2deg)`},{transform:'translate(0,0) scale(1) rotate(0deg)'}],{duration:240,easing:'cubic-bezier(.18,.88,.22,1)'});}catch(_){}}else try{el.animate([{transform:'translateY(-42px) scale(.62) rotate(-8deg)',opacity:0,filter:'brightness(2.2)'},{transform:'translateY(0) scale(1) rotate(0deg)',opacity:1,filter:'brightness(1)'}],{duration:350,delay:Math.random()*90,easing:'cubic-bezier(.14,.84,.18,1)'});}catch(_){}}});updateHud();};
    const updateHud=()=>{const set=(id,value)=>{const el=byId(id);if(el)el.textContent=String(value);};set('todayMatchScore',run.score.toLocaleString('ru-RU'));set('todayMatchMoves',run.moves);set('todayMatchCombo','×'+run.combo);set('todayMatchTarget',level.scoreGate.toLocaleString('ru-RU'));const pct=Math.min(100,run.score/Math.max(1,level.scoreGate)*100),bar=byId('todayMatchScoreBar');if(bar)bar.style.width=pct+'%';const track=bar?.closest('.ts-m3-score-track');if(track)track.classList.toggle('is-near-goal',pct>=80);const gameRoot=host.closest('.ts-m3-game');if(gameRoot)gameRoot.classList.toggle('is-near-goal',pct>=80);const hint=gameRoot?.querySelector('[data-game-act="match3-hint"]');if(hint)hint.disabled=run.busy||run.ended||run.introLocked||Date.now()<(run.hintCooldownUntil||0);set('todayMatchScoreLabel',`${run.score.toLocaleString('ru-RU')} / ${level.scoreGate.toLocaleString('ru-RU')} очков`);if(level.colorGoal){const count=run.collectedByColor[level.colorGoal.color]||0;set('todayMatchColorGoal',`${MATCH3_GEMS[level.colorGoal.color].mark} ${MATCH3_GEMS[level.colorGoal.color].name}: ${count} / ${level.colorGoal.count}`);}if(level.iceGoal)set('todayMatchIceGoal',`❄ Лёд: ${run.iceCleared} / ${level.iceGoal.count}`);if(level.relicGoal)set('todayMatchRelicGoal',`✦ Реликвии: ${run.relicsCollected} / ${level.relicGoal.count}`);if(level.chainGoal)set('todayMatchChainGoal',`⛓ Каскад: ${run.maxCascade} / ${level.chainGoal.count}`);if(level.sigilGoal)set('todayMatchSigilGoal',`⛨ Печати: ${run.sigilsCleared} / ${level.sigilGoal.count}`);for(const b of MATCH3_BOOSTERS){const btn=host.parentElement?.parentElement?.querySelector(`[data-game-act="match3-booster-use"][data-booster="${b.id}"]`);if(btn){const qty=Number(match3Progress?.inventory?.[b.id]||0),small=btn.querySelector('small');if(small)small.textContent='В наличии: '+qty;btn.disabled=qty<1||!match3ServerReady||run.ended||run.busy||run.introLocked||run.paused;}}match3V42SyncHud(run,level);window.TODAY_CRYSTAL_BLOCKS_V1.updateHud(run);};
    const status=text=>{const el=byId('todayMatchStatus');if(el)el.textContent=text;};
    const won=()=>window.TODAY_CRYSTAL_BLOCKS_V1.isComplete(run)&&run.score>=level.scoreGate&&(!level.colorGoal||Number(run.collectedByColor[level.colorGoal.color]||0)>=level.colorGoal.count)&&(!level.iceGoal||run.iceCleared>=level.iceGoal.count)&&(!level.relicGoal||run.relicsCollected>=level.relicGoal.count)&&(!level.chainGoal||run.maxCascade>=level.chainGoal.count)&&(!level.sigilGoal||run.sigilsCleared>=level.sigilGoal.count);
    const clearAndResolve=async(startSet,initialBonus=1)=>{
      run.busy=true;let matches=startSet,chain=0;
      while(matches&&matches.length&&chain<14&&!run.ended){
        chain++;run.combo=chain;run.maxCascade=Math.max(run.maxCascade,chain);if(chain>1)match3V42TrackDaily('cascades',1);updateHud();
        const preferred=chain===1?(run.lastSwap||[]):[];
        let plan=run.pendingSuperCombo?null:match3SpecialPlan(matches,preferred);
        let keepIndex=plan?plan.index:-1;
        if(keepIndex>=0&&run.cells[keepIndex]?.special){const alternative=(plan.indices||[]).find(i=>!run.cells[i]?.special);if(alternative!==undefined)keepIndex=alternative;else{plan=null;keepIndex=-1;}}
        const base=[...new Set([...matches])];
        if(keepIndex>=0)for(let i=base.length-1;i>=0;i--)if(base[i]===keepIndex)base.splice(i,1);
        const expanded=match3ExpandSpecialClear(run.cells,base,run.pendingSpecialTargetColor,run.pendingSuperCombo,keepIndex);
        const toClear=new Set(expanded);if(keepIndex>=0)toClear.delete(keepIndex);
        const blockResult=window.TODAY_CRYSTAL_BLOCKS_V1.applyClear(run,[...toClear],chain);if(blockResult?.bonusScore){run.score+=blockResult.bonusScore;run.v42ScorePending=(run.v42ScorePending||0)+blockResult.bonusScore;}if(blockResult?.message)status(blockResult.message);
        for(const i of toClear){const el=host.querySelector(`[data-i="${i}"]`);if(el){el.classList.add('is-matching');if(run.cells[i]?.special)el.classList.add('is-special-trigger');}}
        const specialCount=[...toClear].filter(i=>!!run.cells[i]?.special).length;if(specialCount||plan)match3V42TrackDaily('specials',specialCount+(plan?1:0));match3V42DamageGuardian(run,toClear.size,specialCount,chain);match3V42PlaySound(plan||specialCount?'special':chain>1?'combo':'match');
        const fx=byId('todayMatch3Fx');
        if(fx&&(toClear.size>=4||chain>1||plan||specialCount)){
          const title=run.pendingSuperCombo&&chain===1?'СВЕРХНОВАЯ!':plan?.label||(specialCount?'ЦЕПНОЙ ВЗРЫВ':chain>1?'КАСКАД ×'+chain:toClear.size>=8?'МОЩНОЕ СОЧЕТАНИЕ':'ОТЛИЧНО!');
          fx.innerHTML=`<span class="ts-m3-combo-pop ${plan?'is-special-callout':''}">${title}</span>`;
          if(toClear.size>=5||specialCount){for(let p=0;p<Math.min(20,Math.max(10,Math.floor(toClear.size/2)));p++){const particle=document.createElement('i');particle.className='ts-m3-burst-particle';particle.style.setProperty('--burst-x',`${Math.round((Math.random()-.5)*280)}px`);particle.style.setProperty('--burst-y',`${Math.round((Math.random()-.5)*250)}px`);particle.style.setProperty('--burst-delay',`${Math.random()*.12}s`);particle.style.setProperty('--burst-hue',`${Math.floor(Math.random()*360)}deg`);fx.appendChild(particle);}}
          try{fx.firstElementChild?.animate([{transform:'translateY(15px) scale(.54) rotate(-3deg)',opacity:0,filter:'blur(5px)'},{transform:'translateY(-5px) scale(1.12) rotate(1deg)',opacity:1,filter:'blur(0)'},{transform:'translateY(-29px) scale(.96)',opacity:0}],{duration:790,easing:'cubic-bezier(.15,.8,.22,1)'});}catch(_){}
        }
        if(toClear.size>=7||specialCount||plan){const wrap=host.closest('.ts-m3-board-wrap');wrap?.classList.add('is-shaking');setTimeout(()=>wrap?.classList.remove('is-shaking'),380);try{if(match3V42Settings().haptics&&typeof navigator!=='undefined'&&navigator.vibrate)navigator.vibrate(toClear.size>=18?[18,35,28]:toClear.size>=8?[13,24,12]:8);}catch(_){}}
        await new Promise(resolve=>setTimeout(resolve,plan||specialCount?250:185));
        for(const i of toClear){const cell=run.cells[i];if(cell){const multiplier=Math.min(6,chain);const gained=Math.round(80*multiplier*initialBonus*(cell.special?1.35:1));run.score+=gained;run.v42ScorePending=(run.v42ScorePending||0)+gained;run.v42ClearsPending=(run.v42ClearsPending||0)+1;run.focus=Math.min(100,Number(run.focus||0)+2+(cell.special?2:0)+(chain>1?1:0)+(cell.echo?1:0));run.collectedByColor[cell.color]=(run.collectedByColor[cell.color]||0)+1;run.collected++;if(cell.echo){run.echoesCollected=(run.echoesCollected||0)+1;const v42=match3V42EnsureDaily();v42.echoes=Math.max(0,Number(v42.echoes||0))+1;v42.stardust=Math.max(0,Number(v42.stardust||0))+1;match3V42Write(v42);match3V42PlaySound('echo');}if(cell.relic){run.relicsCollected++;delete cell.relic;}}if(run.ice[i]>0){run.ice[i]--;if(run.ice[i]===0)run.iceCleared++;}if(run.sigils[i]>0){run.sigils[i]--;if(run.sigils[i]===0)run.sigilsCleared++;}run.cells[i]=null;}
        if((run.v42ClearsPending||0)>0)match3V42TrackDaily('clears',run.v42ClearsPending);if((run.v42ScorePending||0)>0)match3V42TrackDaily('score',run.v42ScorePending);run.v42ClearsPending=0;run.v42ScorePending=0;
        if(keepIndex>=0&&run.cells[keepIndex]&&!run.cells[keepIndex].special){run.cells[keepIndex].special=plan.type;run.cells[keepIndex].specialCreatedAt=Date.now();run.specialsCreated++;status(plan.type==='rainbow'?'Создано призматическое сердце! Меняй его местами с кристаллом, чтобы взорвать цвет.':plan.type==='bomb'?'Создана кристальная бомба! Обменяй её или включи в следующую комбинацию.':'Создана ракетная искра! Она очистит целую линию при следующем совпадении или обмене.');}
        run.pendingSpecialTargetColor=null;run.pendingSuperCombo=false;if(chain===1)run.lastSwap=null;
        collapseColumns(run.cells);draw(true);updateHud();await new Promise(resolve=>setTimeout(resolve,plan||specialCount?225:165));
        matches=match3FindMatches(run.cells);
      }
      run.combo=1;updateHud();
      if(!match3HasValidMove(run.cells)){
        const colors=run.cells.map(cell=>cell?.color??0);let valid=false;
        for(let attempt=0;attempt<80&&!valid;attempt++){const shuffled=colors.slice();for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}for(let i=0;i<64;i++)if(run.cells[i])run.cells[i].color=shuffled[i];valid=!match3FindMatches(run.cells).length&&match3HasValidMove(run.cells);}
        if(valid){host.classList.add('is-shuffling');setTimeout(()=>host.classList.remove('is-shuffling'),500);status('На поле не осталось ходов — кристаллы перестроены без штрафа.');draw(true);}
      }
      const blockTurn=window.TODAY_CRYSTAL_BLOCKS_V1.endTurn(run);if(blockTurn?.bonusScore){run.score+=blockTurn.bonusScore;run.v42ScorePending=(run.v42ScorePending||0)+blockTurn.bonusScore;}if(blockTurn?.message)status(blockTurn.message);if(blockTurn?.changed)draw(true);updateHud();if(won()){await match3Finish(true);return;}if(run.moves<=0){await match3Finish(false);return;}run.busy=false;updateHud();
    };
    const tap=async index=>{
      if(run.ended||run.busy||run.introLocked||run.paused||!Number.isInteger(index)||index<0||index>=64)return;
      if(run.pendingBooster){const b=run.pendingBooster;run.pendingBooster='';if(b==='focus'){if(Number(run.focus||0)<100){status('Резонанс ещё не готов.');return;}run.focus=0;run.moves--;run.movesUsed++;const rr=Math.floor(index/8),cc=index%8,remove=[];for(let k=0;k<8;k++){remove.push(rr*8+k,k*8+cc);}status('УДАР ХРАНИТЕЛЯ! Строка и столбец очищены резонансом.');run.pendingSpecialTargetColor=null;run.pendingSuperCombo=false;updateHud();await clearAndResolve([...new Set(remove)],1.32);return;}if(b==='hammer'){const r=Math.floor(index/8),c=index%8,remove=[];for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const rr=r+dr,cc=c+dc;if(rr>=0&&rr<8&&cc>=0&&cc<8)remove.push(rr*8+cc);}status('Космический молот разбил кристаллы!');run.pendingSpecialTargetColor=null;run.pendingSuperCombo=false;await clearAndResolve(remove,1.15);return;}if(b==='rainbow'){const color=run.cells[index]?.color;if(!Number.isInteger(color))return;const remove=run.cells.map((cell,i)=>cell?.color===color?i:-1).filter(i=>i>=0);status('Радужный импульс очистил цвет «'+MATCH3_GEMS[color].name+'»!');run.pendingSpecialTargetColor=color;run.pendingSuperCombo=false;await clearAndResolve(remove,1.25);return;}}
      if(run.selected<0){run.selected=index;draw(false);status('Выбери соседний кристалл для обмена. Линия из четырёх создаёт ракету, из пяти — призму.');return;}
      if(index===run.selected){run.selected=-1;draw(false);return;}
      const r1=Math.floor(run.selected/8),c1=run.selected%8,r2=Math.floor(index/8),c2=index%8;
      if(Math.abs(r1-r2)+Math.abs(c1-c2)!==1){run.selected=index;draw(false);status('Можно менять только соседние кристаллы.');return;}
      const first=run.selected,second=index;run.selected=-1;run.busy=true;const tmp=run.cells[first];run.cells[first]=run.cells[second];run.cells[second]=tmp;draw(true);await new Promise(resolve=>setTimeout(resolve,150));
      if(run.cells[first]?.special||run.cells[second]?.special){const firstSpecial=!!run.cells[first]?.special,secondSpecial=!!run.cells[second]?.special;run.moves--;run.movesUsed++;match3V42TrackDaily('moves',1);run.lastSwap=null;run.pendingSuperCombo=firstSpecial&&secondSpecial;run.pendingSpecialTargetColor=firstSpecial?run.cells[second]?.color:run.cells[first]?.color;status(run.pendingSuperCombo?'СОВМЕЩЕНИЕ СИЛ! Двойная вспышка очищает всё поле.':'Особый кристалл активирован — держись!');updateHud();await clearAndResolve([first,second],run.pendingSuperCombo?1.65:1.35);run.busy=false;if(!run.ended)draw(false);return;}
      const matches=match3FindMatches(run.cells);
      if(!matches.length){const back=run.cells[first];run.cells[first]=run.cells[second];run.cells[second]=back;draw(true);run.busy=false;status('Такой обмен не создаёт линию. Попробуй другой ход.');return;}
      run.moves--;run.movesUsed++;match3V42TrackDaily('moves',1);run.lastSwap=[first,second];run.pendingSpecialTargetColor=null;run.pendingSuperCombo=false;updateHud();status('Кристаллы резонируют — найди длинную линию для особого самоцвета!');await clearAndResolve(matches,1);run.busy=false;if(!run.ended){draw(false);status('Ход за тобой. Линии из 4–5 кристаллов создают специальные самоцветы.');}
    };
    run.tap=tap;/* TODAY CRYSTAL PHASER V2 — GAMEPLAY INPUT BRIDGE */window.__TODAY_CRYSTAL_GAMEPLAY_V2={version:'2.0.0',tap(index){if(match3ActiveRun!==run||run.ended||!host.isConnected||!host.closest('.ts-m3-game[data-match3-level]'))return false;const n=Number(index);if(!Number.isInteger(n)||n<0||n>=64)return false;return run.tap(n);},isActive(board){return match3ActiveRun===run&&!run.ended&&host.isConnected&&host===board&&!!host.closest('.ts-m3-game[data-match3-level]');},status(){return {version:'2.0.0',active:match3ActiveRun===run&&!run.ended,paused:!!run.paused,busy:!!run.busy,level:Number(run.level&&run.level.id)||0};}};host.innerHTML='';draw(false);todayMiniGameRuntime={id:'match3',tap};const missionSplash=byId('todayMatchMissionSplash');if(missionSplash)missionSplash.remove();run.introLocked=false;run.busy=false;updateHud();status('Уровень начался! Меняй местами соседние кристаллы.');todayMiniGameCleanup=()=>{clearTimeout(run.missionTimer);clearInterval(run.missionInterval);clearTimeout(run.hintTimer);run.ended=true;run.busy=true;};
    function collapseColumns(cells){for(let c=0;c<8;c++){const survivors=[];for(let r=7;r>=0;r--){const cell=cells[r*8+c];if(cell)survivors.push(cell);}for(let r=7;r>=0;r--){const offset=7-r;cells[r*8+c]=survivors[offset]||match3NewGem();}}}
    async function match3Finish(isWin){if(run.ended)return;run.ended=true;run.busy=true;run.combo=1;const seconds=Math.max(1,Math.round((Date.now()-run.startedAt)/1000)),stars=isWin?match3Stars(level,run.score):0,wasComplete=!!match3Progress.levels?.[String(level.id)]?.completed,trophy=level.trophy;if(isWin){match3V42TrackDaily('wins',1);match3V42PlaySound('win');const old=match3Progress.levels?.[String(level.id)]||{};match3Progress.levels[String(level.id)]={completed:true,best_score:Math.max(Number(old.best_score||0),run.score),best_stars:Math.max(Number(old.best_stars||0),stars),best_moves:run.moves,best_duration_sec:seconds,trophy_collected:true,trophy_name:trophy.name};match3Progress.unlocked_level=Math.max(Number(match3Progress.unlocked_level||1),Math.min(221,level.id+1));status('Уровень пройден! Реликвия добавлена в альбом.');}else status('Ходы закончились. Можно переиграть уровень или купить усилитель на карте.');try{match3SaveLocal();}catch(storageError){console.warn('TODAY Crystal Chronicles local result save',storageError);}const v45BackgroundSave=Promise.resolve().then(()=>saveGameResult('match3',run.score,seconds));v45BackgroundSave.catch(error=>console.warn('TODAY Crystal Chronicles deferred save',error));
      if(match3ServerReady&&await currentUser()){try{const result=await todayWithTimeout(rpc('today_match3_save_result',{p_level_id:level.id,p_score:run.score,p_stars:stars,p_moves_used:Math.max(0,run.movesUsed),p_duration_sec:seconds,p_won:!!isWin,p_goal_color:match3GoalCode(level),p_goal_count:match3GoalCount(run,level)}),8000,'Сервер не подтвердил результат уровня за 8 секунд.');if(result?.ok){match3Progress.unlocked_level=Math.max(match3Progress.unlocked_level,Number(result.unlocked_level||1));if(result.coins!==undefined)match3Progress.coins=Number(result.coins);match3ServerReady=true;match3SaveLocal();}else throw new Error(result?.message||'Результат не подтверждён.');}catch(error){console.warn('TODAY Crystal Chronicles result save',error);match3ServerMessage=String(error?.message||error);match3ServerReady=false;}}
      try{updateHud();}catch(hudError){console.warn('TODAY Crystal Chronicles HUD update',hudError);}let panel=byId('todayMatch3Result');const resultModal=byId('modal');const gameRoot=byId('todayMatchBoard')?.closest('.ts-m3-game');if(resultModal){resultModal.classList.add('today-match3-fullscreen');document.body.classList.add('today-match3-active');}if(!panel){panel=document.createElement('section');panel.id='todayMatch3Result';panel.className='ts-m3-result';panel.hidden=true;}if(panel.parentNode!==document.body)document.body.appendChild(panel);panel.dataset.v44ForceVisible='1';panel.hidden=false;panel.style.setProperty('display','flex','important');panel.style.setProperty('visibility','visible','important');panel.style.setProperty('opacity','1','important');panel.style.setProperty('pointer-events','auto','important');panel.style.setProperty('position','fixed','important');panel.style.setProperty('inset','max(9px, env(safe-area-inset-top)) 9px max(9px, env(safe-area-inset-bottom))','important');panel.style.setProperty('z-index','2147483647','important');panel.style.setProperty('flex-direction','column','important');panel.style.setProperty('align-items','center','important');panel.style.setProperty('justify-content','center','important');panel.style.setProperty('overflow','auto','important');panel.dataset.v45BodyOverlay='1';document.body.classList.add('today-match3-result-open');panel.innerHTML='<span class="ts-m3-eyebrow">'+(isWin?'УРОВЕНЬ ПРОЙДЕН':'УРОВЕНЬ ЗАВЕРШЁН')+'</span>'+'<h3>'+(isWin?'ПОЗДРАВЛЯЕМ!':'Попробуй ещё раз')+'</h3>'+'<p>'+(isWin?('Ты получил '+(Number(stars)||0)+' ★ за уровень '+level.id+'.'):('Условие уровня: '+h(match3LevelObjective(level))))+'</p>'+'<div class="ts-m3-result-stars">'+[1,2,3].map(n=>'<span class="'+(n<=stars?'earned':'')+'">★</span>').join('')+'</div>'+'<div class="ts-m3-result-actions">'+(isWin&&level.id<220?'<button type="button" class="ts-primary ts-m3-next" data-game-act="match3-level" data-level="'+(level.id+1)+'">СЛЕДУЮЩИЙ УРОВЕНЬ →</button>':'')+'<button type="button" class="ts-primary" data-game-act="match3-retry" data-level="'+level.id+'">'+(isWin?'Переиграть':'Попробовать снова')+' ↻</button>'+'<button type="button" class="ts-mini" data-game-act="match3-back">К карте кампании</button></div>';if(panel){panel.hidden=false;panel.dataset.v43Outcome=isWin?'win':'fail';panel.innerHTML=`${match3V42FeatureStats(level,run,isWin,stars)}${isWin?'<div class="ts-m3-v43-confetti" aria-hidden="true">✦　✧　✦　✧　✦</div>':''}<div class="ts-m3-result-symbol">${isWin?trophy.icon:'◇'}</div><span class="ts-m3-eyebrow">${isWin?'ПОБЕДА · УРОВЕНЬ ПРОЙДЕН':'ПОПРОБУЙ ЕЩЁ РАЗ'}</span><h3>${isWin?'ПОЗДРАВЛЯЕМ!':'Почти получилось'}</h3><p>${isWin?`Ты набрал ${run.score.toLocaleString('ru-RU')} очков и получил ${stars} ${stars===1?'звезду':stars<5?'звезды':'звёзд'}.`:`Нужно выполнить цель уровня: ${h(match3LevelObjective(level))}. Осталось блоков: ${Number(run.blocksRemaining||0)}.`}</p>${isWin?`<div class="ts-m3-earned-trophy tone-${trophy.tone}"><span>${trophy.icon}</span><div><small>${wasComplete?'РЕЛИКВИЯ УЖЕ В АЛЬБОМЕ':'НОВАЯ РЕЛИКВИЯ · ДОБАВЛЕНА В АЛЬБОМ'}</small><b>${h(trophy.name)}</b><p>Памятный сувенир. Не влияет на очки, монеты, усилители или сложность.</p></div></div>`:''}<div class="ts-m3-result-stars">${[1,2,3].map(n=>`<span class="${n<=stars?'earned':''}">★</span>`).join('')}</div><div class="ts-m3-result-actions"><button type="button" class="ts-primary" data-game-act="match3-retry" data-level="${level.id}">${isWin?'Переиграть ↻':'Попробовать снова ↻'}</button>${isWin&&level.id<220?`<button type="button" class="ts-primary ts-m3-next" data-game-act="match3-level" data-level="${level.id+1}" ${level.id+1>match3Progress.unlocked_level?'disabled':''}>СЛЕДУЮЩИЙ УРОВЕНЬ →</button>`:''}${isWin&&level.id===220?'<button type="button" class="ts-primary" data-game-act="match3-back">Вернуться к принцессе ♕</button>':''}<button type="button" class="ts-mini" data-game-act="match3-back">К карте кампании</button></div>${match3ServerMessage&&!match3ServerReady?`<small class="ts-m3-server-note">Результат сохранён на этом устройстве. Синхронизация: ${h(match3ServerMessage)}</small>`:''}</div>`;}}
  }
  async function match3BuyBooster(boosterId){const item=MATCH3_BOOSTERS.find(x=>x.id===boosterId);if(!item)return;if(!await currentUser()){notify('Войди в аккаунт, чтобы покупать усилители за монеты TODAY.');return;}if(!match3ServerReady){notify('Онлайн-магазин усилителей временно недоступен. Вернись на карту и попробуй обновить её.');return;}try{const result=await todayWithTimeout(rpc('today_match3_buy_booster',{p_booster_id:boosterId}),9000,'Покупка не подтвердилась за 9 секунд.');if(!result?.ok)throw new Error(result?.message||'Не удалось купить усилитель.');match3Progress.coins=Number(result.coins??match3Progress.coins);match3Progress.inventory[boosterId]=Number(result.quantity??(Number(match3Progress.inventory[boosterId]||0)+1));match3SaveLocal();notify(`${item.name} куплен. Баланс: ${match3Progress.coins} монет.`);await openMatch3Campaign();}catch(error){notify(String(error?.message||error||'Покупка не выполнена.'));}}
  async function match3ActivateBooster(boosterId){const run=match3ActiveRun,item=MATCH3_BOOSTERS.find(x=>x.id===boosterId);if(!run||run.ended||run.busy||run.introLocked||!item)return;if(!match3ServerReady||!await currentUser()){notify('Для использования купленных усилителей нужен вход в аккаунт и онлайн-сохранение.');return;}if(Number(match3Progress?.inventory?.[boosterId]||0)<1){notify('Этого усилителя нет в инвентаре. Открой карту кампании и купи его за монеты.');return;}try{const result=await todayWithTimeout(rpc('today_match3_use_booster',{p_booster_id:boosterId}),8000,'Сервер не подтвердил применение усилителя.');if(!result?.ok)throw new Error(result?.message||'Не удалось применить усилитель.');match3Progress.inventory[boosterId]=Number(result.quantity??Math.max(0,Number(match3Progress.inventory[boosterId]||0)-1));match3SaveLocal();if(boosterId==='moves'){run.moves+=5;const m=byId('todayMatchMoves');if(m)m.textContent=String(run.moves);const st=byId('todayMatchStatus');if(st)st.textContent='Временной осколок добавил пять ходов!';}else if(boosterId==='shuffle'){run.busy=true;const colors=run.cells.map(c=>c.color);let attempt=0;do{const shuffled=colors.slice().sort(()=>Math.random()-.5);run.cells.forEach((c,i)=>c.color=shuffled[i]);attempt++;}while((match3FindMatches(run.cells).length||!match3HasValidMove(run.cells))&&attempt<50);run.selected=-1;drawMatch3BoardFromRuntime(run,true);const board=byId('todayMatchBoard');board?.classList.add('is-shuffling');setTimeout(()=>board?.classList.remove('is-shuffling'),480);const st=byId('todayMatchStatus');if(st)st.textContent='Переплетение изменило расклад, ход сохранён.';await new Promise(resolve=>setTimeout(resolve,220));run.busy=false;}else if(boosterId==='hammer'||boosterId==='rainbow'){run.pendingBooster=boosterId;const st=byId('todayMatchStatus');if(st)st.textContent=boosterId==='hammer'?'Космический молот готов: выбери кристалл для удара.':'Радужный импульс готов: выбери цвет, который нужно очистить.';}const root=byId('todayMatchBoard')?.closest('.ts-m3-game');for(const b of MATCH3_BOOSTERS){const node=root?.querySelector(`[data-game-act="match3-booster-use"][data-booster="${b.id}"]`);if(node){const q=Number(match3Progress.inventory[b.id]||0),small=node.querySelector('small');if(small)small.textContent='В наличии: '+q;node.disabled=q<1||!match3ServerReady||run.ended;}}}catch(error){notify(String(error?.message||error||'Не удалось применить усилитель.'));}}
  function drawMatch3BoardFromRuntime(run, animate=true){
    const host=byId('todayMatchBoard'); if(!host)return;
    const oldRects=new Map();
    if(animate) for(const el of host.querySelectorAll('[data-gem-uid]')) oldRects.set(el.dataset.gemUid,el.getBoundingClientRect());
    host.innerHTML=run.cells.map((cell,i)=>{
      if(!cell)return '<span class="ts-m3-empty" aria-hidden="true"></span>';
      const overlays=`${run.ice?.[i]?`<i class="ts-m3-cell-overlay ts-m3-ice">❄${run.ice[i]>1?run.ice[i]:''}</i>`:''}${run.sigils?.[i]?`<i class="ts-m3-cell-overlay ts-m3-sigil">⛨${run.sigils[i]>1?run.sigils[i]:''}</i>`:''}${cell.relic?'<i class="ts-m3-relic-mark">✦</i>':''}${cell.echo?'<i class="ts-m3-v42-echo" aria-hidden="true">✧</i>':''}${cell.special?`<i class="ts-m3-special-badge special-${cell.special}" aria-hidden="true">${match3SpecialGlyph(cell.special)}</i>`:''}`;
      return `<button type="button" class="ts-m3-gem gem-${cell.color} ${i===run.selected?'is-selected':''}" data-game-act="match-tap" data-i="${i}" data-gem-uid="${cell.uid}">${match3GemSvg(cell.color,cell.uid)}${overlays}</button>`;
    }).join('');
    if(animate) requestAnimationFrame(()=>{
      for(const el of host.querySelectorAll('[data-gem-uid]')){
        const before=oldRects.get(el.dataset.gemUid),after=el.getBoundingClientRect();
        if(before){const dx=before.left-after.left,dy=before.top-after.top;if(Math.abs(dx)+Math.abs(dy)>1){try{el.animate([{transform:`translate(${dx}px,${dy}px) scale(.93)`},{transform:'translate(0,0) scale(1)'}],{duration:200,easing:'cubic-bezier(.2,.8,.25,1)'});}catch(_){}}}
      }
    });
  }
  function initMatchGame(){return startMatch3Level(1);}
  /* TODAY CRYSTAL RESCUE V30 END */

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
    const creator=own?`<details class="ts-story-composer"><summary>＋ Добавить историю <span>на 24 часа</span></summary><form class="ts-form-card" data-social-form="create-story"><label>Текст истории <small>необязательно, максимум 600 символов</small><textarea name="body" maxlength="600" rows="3" placeholder="Что происходит у тебя сегодня?"></textarea></label><label class="ts-photo-field"><span>Фото или короткое видео</span><input name="story_media" type="file" accept="image/*,video/*" capture="environment"><small>Фото/видео · JPG, PNG, WebP, MP4 или MOV · до 25 МБ · исчезает через 24 часа.</small></label><label>Кто увидит историю<select name="visibility"><option value="public">Все пользователи</option><option value="friends">Только друзья</option></select></label><button class="ts-primary" type="submit">Опубликовать историю ↗</button></form></details>`:'';
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
  async function openSearchUsers(initialQuery=''){
    if(!await needUser())return;
    const query=String(initialQuery||'').trim();
    const content=`<form class="ts-search-form" data-social-form="search-users"><label>Имя или никнейм<input name="query" minlength="2" maxlength="80" value="${h(query)}" placeholder="Имя или @nickname" required></label><button class="ts-primary" type="submit">Найти людей ↗</button></form><div id="todaySocialSearchResults">${query.length>=2?'<div class="ts-loading-panel">Ищем участников…</div>':'<p class="ts-muted">Введи имя или никнейм минимум из двух символов.</p>'}</div>`;
    modal(panelShell('Поиск людей','Найди участников TODAY по имени или никнейму.',content));
    if(query.length>=2){
      try{const d=await rpc('today_social_search_users',{p_query:query});const host=byId('todaySocialSearchResults');if(host){const users=Array.isArray(d.users)?d.users:[];host.innerHTML=`<div class="ts-list-head"><h3>Результаты поиска</h3><span class="ts-count">${users.length}</span></div>${users.length?users.map(u=>userCard(u)).join(''):`<p class="ts-muted">Никого не нашли. Проверь написание никнейма.</p>`}`;}}
      catch(e){const host=byId('todaySocialSearchResults');if(host)host.innerHTML=`<div class="ts-error-panel">Поиск временно недоступен. ${h(e.message||e)}</div>`;}
    }
  }
  async function openOwnStoryComposer(){
    await openProfile();
    const host=byId('modalContent');
    const composer=host?.querySelector('.ts-story-composer');
    if(!composer){notify('Чтобы добавить историю, войди в аккаунт и повтори попытку.');return;}
    composer.open=true;
    composer.scrollIntoView({behavior:'smooth',block:'center'});
    composer.querySelector('summary')?.focus({preventScroll:true});
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
            const fileName=String(file.name||'');
            const isVideo=/^video\/(mp4|quicktime|webm)$/i.test(file.type)||/\.(mp4|mov|webm)$/i.test(fileName);
            const type=isVideo?'video':(/^image\/(jpeg|png|webp)$/i.test(file.type)?'image':'');
            const videoExt=/^video\/quicktime$/i.test(file.type)||/\.mov$/i.test(fileName)?'mov':(/^video\/webm$/i.test(file.type)||/\.webm$/i.test(fileName)?'webm':'mp4');
            const normalizedMime=type==='video'?(videoExt==='mov'?'video/quicktime':videoExt==='webm'?'video/webm':'video/mp4'):file.type;
            if(!type)throw new Error('Поддерживаются JPG, PNG, WebP, MP4, MOV и WebM.');
            if(file.size>25*1024*1024)throw new Error('Файл истории должен быть не больше 25 МБ.');
            const ext=type==='video'?videoExt:({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type]);
            path=`stories/${uid}/${Date.now()}-${Math.random().toString(36).slice(2,10)}.${ext}`;
            if(btn){btn.disabled=true;btn.textContent='ЗАГРУЖАЮ МЕДИА…';}
            const up=await sb.storage.from('today-social-stories').upload(path,file,{contentType:normalizedMime,upsert:false,cacheControl:'3600'});
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
    if(a==='retry-promos')return loadPromos({retry:true});if(a==='chats')return openChats();if(a==='friends')return openFriends();if(a==='my-profile')return openProfile();if(a==='settings')return openSettings();if(a==='channels')return openChannels();
    if(a==='mini-games'){if(document.body.classList.contains('today-games-route')){stopTodayMiniGame();if(typeof closeModal==='function')closeModal();else{const gameModal=byId('modal');if(gameModal)gameModal.classList.add('hidden');}return;}location.href='./games.html';return;}if(a==='play-game')return openMiniGame(btn.dataset.game);
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
    const modalRoot=byId('modal');if(modalRoot){const mo=new MutationObserver(()=>{if(modalRoot.classList.contains('hidden')){stopPoll();/* TODAY_SOCIAL_MODAL_OBSERVER_GUARD_V41 */if(modalRoot.classList.contains('today-social-modal'))modalRoot.classList.remove('today-social-modal');for(const preview of modalRoot.querySelectorAll('.ts-photo-preview[data-object-url]')){try{URL.revokeObjectURL(preview.dataset.objectUrl)}catch{}delete preview.dataset.objectUrl;preview.replaceChildren();preview.hidden=true;}}});mo.observe(modalRoot,{attributes:true,attributeFilter:['class']})}
    loadPromos();
  }
  window.TODAY_SOCIAL={version:VERSION,openChats,openFriends,openProfile,openSettings,openChannels,openChannel,openMiniGames,openSearchUsers,openOwnStoryComposer,loadPromos,v65Rpc:rpc,v65CurrentUser:currentUser,getGameCatalogue:()=>Object.entries(TODAY_GAMES).map(([id,g])=>({id,title:g.title,subtitle:g.subtitle,label:g.label,symbol:g.symbol,best:gameBest(id),art:gameArtwork(id)})),openGame:(gameId)=>openMiniGame(gameId),close:()=>forceCloseSocialModal()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();


/* TODAY CRYSTAL CHRONICLES V44 VICTORY OVERLAY END */

/* TODAY CRYSTAL CHRONICLES V45 BODY-LEVEL VICTORY END */


/* TODAY CRYSTAL ENGINE V1 — DELEGATION BRIDGE — pure rules delegate, original fallback retained */
