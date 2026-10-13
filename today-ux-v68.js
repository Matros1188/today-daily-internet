/* TODAY UX V68 — keyboard support and browser diagnostics */
(()=>{'use strict';
if(window.TODAY_UX_V68)return;
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const errors=[];
let lastOpener=null,sectionObserver=null;
const focusables='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function visible(el){
  if(!el)return false;
  const s=getComputedStyle(el);
  return s.display!=='none'&&s.visibility!=='hidden'&&el.getClientRects().length>0;
}
function activeDialog(){
  const candidates=$$('[role="dialog"][aria-modal="true"],.today-v67-dialog,.today-v66-media-dialog,.today-v65-dialog,.modal-card');
  return candidates.filter(visible).slice(-1)[0]||null;
}
function addSkipLink(){
  if($('.today-v68-skip-link'))return;
  const a=document.createElement('a');
  a.className='today-v68-skip-link';
  a.href='#homeSection';
  a.textContent='Перейти к основному содержимому';
  document.body.prepend(a);
}
function toast(message){
  const t=$('#toast');
  if(!t)return;
  t.textContent=message;t.classList.add('show');
  clearTimeout(window.__todayV68Toast);
  window.__todayV68Toast=setTimeout(()=>t.classList.remove('show'),3300);
}
function closeTopDialog(){
  const d=activeDialog();
  if(!d)return false;
  const own=d.closest('.today-v68-audit-overlay,.today-v67-overlay,.today-v66-media-modal,.today-v65-overlay,.today-social-modal')||d;
  const close=$('[data-v68-audit-close],[data-v67-close],.today-v66-media-close,.today-v65-close,.modal-close,#modalClose,button[aria-label="Закрыть"]',own);
  if(close){close.click();return true;}
  return false;
}
function onKeydown(e){
  if((e.key==='Enter'||e.key===' ')&&e.target?.closest){
    const trigger=e.target.closest('button,a,[role="button"]');
    if(trigger&&!trigger.closest('.today-v68-audit-overlay,.today-v67-overlay,.today-v66-media-modal,.today-v65-overlay,.modal-card'))lastOpener=trigger;
  }
  const d=activeDialog();
  if(e.key==='Escape'&&d){
    e.preventDefault();e.stopImmediatePropagation();
    if(closeTopDialog()&&lastOpener?.isConnected)requestAnimationFrame(()=>lastOpener.focus({preventScroll:true}));
    return;
  }
  if(e.key!=='Tab'||!d)return;
  const nodes=$$(focusables,d).filter(visible);
  if(!nodes.length){e.preventDefault();d.focus?.();return;}
  const first=nodes[0],last=nodes[nodes.length-1];
  if(!d.contains(document.activeElement)){e.preventDefault();first.focus();return;}
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
}
function setActiveNav(key){
  if(activeDialog())return;
  const btn=$(`.bottom-nav [data-nav="${key}"]`);
  if(!btn)return;
  $$('.bottom-nav [data-nav]').forEach(n=>{
    n.classList.toggle('active',n===btn);
    if(n===btn)n.setAttribute('aria-current','page');
    else n.removeAttribute('aria-current');
  });
}
function setupSectionNav(){
  if(!('IntersectionObserver'in window))return;
  const map=new Map([[$('#homeSection'),'home'],[$('#peopleSection'),'people']].filter(x=>x[0]));
  if(!map.size)return;
  sectionObserver=new IntersectionObserver(entries=>{
    if(activeDialog())return;
    const item=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(item)setActiveNav(map.get(item.target));
  },{root:null,rootMargin:'-20% 0px -58% 0px',threshold:[0,.12,.3,.55]});
  map.forEach((_,el)=>sectionObserver.observe(el));
}
function onClick(e){
  const target=e.target?.closest?.('button,a,[role="button"]');
  if(!target)return;
  if(target.matches('#todayV67NotificationBell,[data-v67-search-open],[data-v67-open-prefs],.today-v66-media-launch,.today-v66-media-open,.today-v65-open'))lastOpener=target;
}
function onError(e){
  if(errors.length>=12)errors.shift();
  const target=e.target&&e.target!==window?e.target:null;
  errors.push({
    type:target?'resource-load':'error',
    message:String(e.message||(target?'Не удалось загрузить ресурс':'Script error')).slice(0,180),
    file:(String(e.filename||target?.currentSrc||target?.src||target?.href||'').split('?')[0].split('/').pop()||'').slice(0,100),
    line:Number(e.lineno)||0
  });
}
function onReject(e){
  if(errors.length>=12)errors.shift();
  const r=e.reason;
  errors.push({type:'unhandledrejection',message:String(r?.message||r||'Unhandled promise rejection').slice(0,180)});
}
function networkEvents(){
  window.addEventListener('offline',()=>toast('Нет соединения. Проверь интернет; несохранённые действия могут не отправиться.'));
  window.addEventListener('online',()=>toast('Соединение восстановлено.'));
}
async function diagnose(){
  let storage='unknown',sw='not supported';
  try{
    const k='__today_v68_test__';
    localStorage.setItem(k,'1');localStorage.removeItem(k);storage='available';
  }catch(e){storage='blocked';}
  try{
    if('serviceWorker'in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      sw=regs.length?`registered (${regs.length})`:'not registered';
    }
  }catch(e){sw='error';}
  const required=['app','homeSection','dailyGrid','communityFeed','rankSection','modal','modalContent','toast','coinCount','profileBtn','todayThemeToggle'];
  const ids=Object.fromEntries(required.map(id=>[id,!!document.getElementById(id)]));
  const vw=window.innerWidth||document.documentElement.clientWidth;
  const clickable=$$('button,a[href],[role="button"]').filter(n=>{
    const r=n.getBoundingClientRect(),s=getComputedStyle(n);
    return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';
  });
  const undersized=clickable.filter(n=>{
    const r=n.getBoundingClientRect();return r.width<40||r.height<40;
  }).slice(0,15).map(n=>({
    element:n.tagName.toLowerCase(),
    label:String(n.getAttribute('aria-label')||n.title||n.innerText||n.textContent||'').trim().replace(/\s+/g,' ').slice(0,60),
    width:Math.round(n.getBoundingClientRect().width),
    height:Math.round(n.getBoundingClientRect().height)
  }));
  const css=window.CSS;
  return {
    version:'V68',time:new Date().toISOString(),browser:navigator.userAgent,platform:navigator.platform||'',
    viewport:{
      width:vw,height:window.innerHeight,screenWidth:screen.width,
      screenHeight:screen.height,devicePixelRatio:devicePixelRatio||1,
      orientation:screen.orientation?.type||''
    },
    layout:{
      documentWidth:document.documentElement.scrollWidth,
      bodyWidth:document.body?.scrollWidth||0,
      horizontalOverflow:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0)>vw+2,
      visibleClickableCount:clickable.length,undersizedTargets:undersized
    },
    storage,serviceWorker:sw,online:navigator.onLine,
    standalone:!!(matchMedia('(display-mode: standalone)').matches||navigator.standalone),
    capabilities:{
      backdropFilter:!!(css?.supports?.('backdrop-filter','blur(1px)')||css?.supports?.('-webkit-backdrop-filter','blur(1px)')),
      dynamicViewport:!!css?.supports?.('height','100dvh'),
      intersectionObserver:'IntersectionObserver'in window,
      mutationObserver:'MutationObserver'in window,
      resizeObserver:'ResizeObserver'in window
    },
    requiredElements:ids,
    missingRequired:Object.keys(ids).filter(k=>!ids[k]),
    recentErrors:errors.slice(-12)
  };
}
function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function auditMarkup(report){
  return `<div class="today-v68-audit-overlay" role="presentation">
    <section class="today-v68-audit-dialog" role="dialog" aria-modal="true" aria-labelledby="todayV68AuditTitle" tabindex="-1">
      <div class="today-v68-audit-head"><div>
        <h2 id="todayV68AuditTitle">Диагностика TODAY</h2>
        <p>Отчёт формируется только в этом браузере и не отправляется на сервер.</p>
      </div><button type="button" class="today-v68-audit-close" data-v68-audit-close aria-label="Закрыть диагностику">×</button></div>
      <div class="today-v68-audit-actions">
        <button type="button" class="primary" data-v68-audit-refresh>Проверить снова</button>
        <button type="button" data-v68-audit-copy>Скопировать отчёт</button>
      </div>
      <div class="today-v68-audit-status">${report.missingRequired.length?'Проверить недостающие элементы':'Базовые элементы найдены'}</div>
      <pre class="today-v68-audit-report">${escapeHtml(JSON.stringify(report,null,2))}</pre>
      <p class="today-v68-audit-hint">Проверка описывает текущее устройство и ошибки после загрузки. Она не подтверждает успешность входа, записи в Supabase или оплат.</p>
    </section></div>`;
}
async function openAudit(){
  const old=$('.today-v68-audit-overlay');if(old)old.remove();
  const report=await diagnose();
  document.body.insertAdjacentHTML('beforeend',auditMarkup(report));
  document.body.classList.add('today-v68-overlay-open');
  $('.today-v68-audit-dialog')?.focus({preventScroll:true});
}
async function copyAudit(){
  const report=await diagnose(),text=JSON.stringify(report,null,2);
  try{await navigator.clipboard.writeText(text);toast('Отчёт скопирован.');}
  catch(e){
    const area=document.createElement('textarea');area.value=text;
    area.style.cssText='position:fixed;opacity:0;left:0;top:0';
    document.body.append(area);area.select();
    const ok=document.execCommand('copy');area.remove();
    toast(ok?'Отчёт скопирован.':'Не удалось скопировать. Выдели отчёт вручную.');
  }
}
function addAuditEntryPoint(){
  if(new URLSearchParams(location.search).get('diagnostics')!=='1')return;
  const button=document.createElement('button');
  button.type='button';button.className='today-v68-audit-launch';
  button.textContent='Проверить браузер';
  button.setAttribute('aria-label','Открыть диагностику браузера TODAY');
  button.style.cssText='position:fixed;right:12px;top:calc(12px + env(safe-area-inset-top,0px));z-index:110000;min-height:44px;padding:10px 13px;border:1px solid #789bff;border-radius:12px;background:#1a2b58;color:#fff;font-weight:800;box-shadow:0 8px 25px #0005';
  button.addEventListener('click',openAudit);
  document.body.append(button);openAudit();
}
function bindAuditActions(){
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-v68-audit-close]')){
      e.preventDefault();$('.today-v68-audit-overlay')?.remove();
      document.body.classList.remove('today-v68-overlay-open');
      if(lastOpener?.isConnected)lastOpener.focus({preventScroll:true});return;
    }
    if(e.target.closest('[data-v68-audit-refresh]')){e.preventDefault();openAudit();return;}
    if(e.target.closest('[data-v68-audit-copy]')){e.preventDefault();copyAudit();return;}
    if(e.target.closest('.today-v68-audit-overlay')&&e.target.classList.contains('today-v68-audit-overlay')){
      $('.today-v68-audit-overlay')?.remove();document.body.classList.remove('today-v68-overlay-open');
    }
  },true);
}
function init(){
  if(document.body.dataset.todayV68==='ready')return;
  document.body.dataset.todayV68='ready';
  addSkipLink();bindAuditActions();
  document.addEventListener('keydown',onKeydown,true);
  document.addEventListener('click',onClick,true);
  window.addEventListener('error',onError,true);
  window.addEventListener('unhandledrejection',onReject);
  networkEvents();setupSectionNav();addAuditEntryPoint();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
window.TODAY_UX_V68={version:'V68',diagnose,openAudit,refresh:diagnose};
})();
