/* =============================================================
   ARYTMIS SIDE-RUNTIME (9/11)
   =============================================================
   Det lille script, der får elementerne fra "Sider & funnels" til at
   virke: popup, knaphandlinger, nedtælling, video, video-popup,
   animationer og menuen på mobil. Det samme script kører i editorens
   lærred (uden animationer og autostart) og på de udgivne sider.

   Alt styres af data-attributter, som editoren skriver. Ingen
   afhængigheder, ingen cookies, intet sendes nogen steder hen.

   VIDEO indlæses FØRST, når kunden trykker afspil. Indtil da er det
   et billede med en knap, så YouTube og Vimeo hverken sætter cookies
   eller ser besøget, før kunden selv vælger det.
   ============================================================= */
(function(){
  'use strict';
  var d = document;
  var iEditor = false;
  try { iEditor = !!(window.frameElement && window.parent && window.parent.grapesjs); } catch(e){}
  if(iEditor) d.documentElement.classList.add('a-editor');

  function alle(sel, rod){ return Array.prototype.slice.call((rod || d).querySelectorAll(sel)); }
  function meta(navn){ var m = d.querySelector('meta[name="' + navn + '"]'); return m ? m.getAttribute('content') : ''; }

  /* ---------- Popup ---------- */
  var popup = null;
  function åbnPopup(){ if(!popup || iEditor) return; popup.classList.add('a-aaben'); d.body.classList.add('a-popup-aaben'); var f = popup.querySelector('input,button,a'); if(f) f.focus(); }
  function lukPopup(){ if(!popup) return; popup.classList.remove('a-aaben'); d.body.classList.remove('a-popup-aaben'); }
  function startPopup(){
    popup = d.querySelector('[data-a-popup]');
    if(!popup || iEditor) return;
    popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-modal', 'true');
    popup.addEventListener('click', function(e){ if(e.target === popup) lukPopup(); });
    d.addEventListener('keydown', function(e){ if(e.key === 'Escape') lukPopup(); });
    var trig = popup.getAttribute('data-a-popup-trigger') || 'klik';
    var vist = false;
    var engang = function(){ if(!vist){ vist = true; åbnPopup(); } };
    if(trig === 'indlaes') setTimeout(engang, parseInt(popup.getAttribute('data-a-popup-forsinkelse') || '0', 10) || 0);
    if(trig === 'forlad'){
      d.addEventListener('mouseout', function(e){ if(!e.relatedTarget && e.clientY <= 0) engang(); });
      /* På telefon findes "musen forlader siden" ikke. Der vises den,
         når kunden ruller hurtigt op igen efter at have læst lidt. */
      var sidst = 0, maks = 0;
      window.addEventListener('scroll', function(){
        var y = window.scrollY; maks = Math.max(maks, y);
        if(maks > 600 && sidst - y > 120) engang();
        sidst = y;
      }, { passive:true });
    }
  }

  /* ---------- Knappernes handlinger ---------- */
  d.addEventListener('click', function(e){
    var k = e.target.closest && e.target.closest('[data-a-handling]');
    if(!k || iEditor) return;
    var h = k.getAttribute('data-a-handling');
    if(h === 'rul'){
      var maal = d.getElementById(k.getAttribute('data-a-maal') || '');
      if(maal){ e.preventDefault(); maal.scrollIntoView({ behavior:'smooth', block:'start' }); }
    } else if(h === 'aaben-popup'){ e.preventDefault(); åbnPopup(); }
    else if(h === 'luk-popup'){ e.preventDefault(); lukPopup(); }
    else if(h === 'naeste'){
      var n = meta('arytmi-naeste');
      if(n){ e.preventDefault(); location.href = n + location.search; }
    } else if(h === 'send'){
      var form = k.closest('form');
      if(form){ e.preventDefault(); if(form.reportValidity()) form.dispatchEvent(new Event('submit', { cancelable:true, bubbles:true })); }
    }
  });

  /* ---------- Nedtælling ---------- */
  function startNedtaelling(el){
    /* Kun én tæller pr. element - genstart() kaldes, når editoren tilføjer nye. */
    if(el.__aStartet) return;
    el.__aStartet = true;
    var slut;
    var ever = parseInt(el.getAttribute('data-a-evergreen') || '0', 10);
    if(ever > 0){
      /* Evergreen: hver besøgende får sin egen frist, husket på enheden. */
      var nøgle = 'a-nedtaelling-' + (el.id || location.pathname);
      try { slut = parseInt(localStorage.getItem(nøgle) || '0', 10); } catch(e){}
      if(!slut){ slut = Date.now() + ever * 60000; try { localStorage.setItem(nøgle, String(slut)); } catch(e){} }
    } else slut = Date.parse(el.getAttribute('data-a-slut') || '');
    if(!slut) return;
    var felter = { dage:el.querySelector('[data-a-d]'), timer:el.querySelector('[data-a-t]'), min:el.querySelector('[data-a-m]'), sek:el.querySelector('[data-a-s]') };
    function to(n){ return (n < 10 ? '0' : '') + n; }
    function tik(){
      var r = Math.max(0, Math.floor((slut - Date.now()) / 1000));
      if(felter.dage) felter.dage.textContent = to(Math.floor(r / 86400));
      if(felter.timer) felter.timer.textContent = to(Math.floor(r % 86400 / 3600));
      if(felter.min) felter.min.textContent = to(Math.floor(r % 3600 / 60));
      if(felter.sek) felter.sek.textContent = to(r % 60);
      if(r === 0 && !iEditor){
        var ved = el.getAttribute('data-a-ved-slut') || '';
        if(ved === 'skjul') el.style.display = 'none';
        else if(/^(https?:\/\/|\/)/.test(ved)) location.href = ved;
        return;
      }
      if(el.isConnected !== false) setTimeout(tik, 1000);
    }
    tik();
  }

  /* ---------- Video ---------- */
  function indlejring(url, auto){
    url = String(url || '');
    var m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
    if(m) return { type:'iframe', src:'https://www.youtube-nocookie.com/embed/' + m[1] + '?rel=0' + (auto ? '&autoplay=1' : '') };
    m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if(m) return { type:'iframe', src:'https://player.vimeo.com/video/' + m[1] + '?dnt=1' + (auto ? '&autoplay=1' : '') };
    m = url.match(/wistia\.(?:com|net)\/(?:medias|embed\/iframe)\/(\w+)/);
    if(m) return { type:'iframe', src:'https://fast.wistia.net/embed/iframe/' + m[1] + (auto ? '?autoPlay=true' : '') };
    if(/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return { type:'video', src:url };
    return null;
  }
  function spil(boks, url){
    var v = indlejring(url, true);
    if(!v) return;
    var el;
    if(v.type === 'video'){ el = d.createElement('video'); el.src = v.src; el.controls = true; el.autoplay = true; el.playsInline = true; }
    else { el = d.createElement('iframe'); el.src = v.src; el.allow = 'autoplay; fullscreen; picture-in-picture'; el.allowFullscreen = true; el.title = 'Video'; }
    el.className = 'a-video-afspiller';
    while(boks.firstChild) boks.removeChild(boks.firstChild);
    boks.appendChild(el);
  }
  d.addEventListener('click', function(e){
    if(iEditor) return;
    var v = e.target.closest && e.target.closest('[data-a-video]');
    if(v && !v.querySelector('.a-video-afspiller')){ e.preventDefault(); spil(v, v.getAttribute('data-a-video')); return; }
    var p = e.target.closest && e.target.closest('[data-a-videopopup]');
    if(p){
      e.preventDefault();
      var lys = d.createElement('div'); lys.className = 'a-lysboks'; lys.setAttribute('role', 'dialog');
      var ramme = d.createElement('div'); ramme.className = 'a-lysboks-ramme';
      var luk = d.createElement('button'); luk.type = 'button'; luk.className = 'a-lysboks-luk'; luk.setAttribute('aria-label', 'Luk'); luk.textContent = '×';
      lys.appendChild(ramme); lys.appendChild(luk); d.body.appendChild(lys);
      spil(ramme, p.getAttribute('data-a-videopopup'));
      var væk = function(){ lys.remove(); d.removeEventListener('keydown', esc); };
      var esc = function(ev){ if(ev.key === 'Escape') væk(); };
      lys.addEventListener('click', function(ev){ if(ev.target === lys || ev.target === luk) væk(); });
      d.addEventListener('keydown', esc);
    }
  });

  /* ---------- Animationer ---------- */
  function startAnimationer(){
    var el = alle('[data-a-anim]');
    if(!el.length) return;
    if(iEditor || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      el.forEach(function(x){ x.classList.add('a-vist'); }); return;
    }
    el.forEach(function(x){
      var t = x.getAttribute('data-a-anim-tid'), f = x.getAttribute('data-a-anim-forsinkelse');
      if(t) x.style.animationDuration = t + 'ms';
      if(f) x.style.animationDelay = f + 'ms';
    });
    var obs = new IntersectionObserver(function(poster){
      poster.forEach(function(p){ if(p.isIntersecting){ p.target.classList.add('a-vist'); obs.unobserve(p.target); } });
    }, { threshold:0.15 });
    el.forEach(function(x){ if(x.getAttribute('data-a-anim-ved') === 'indlaes') x.classList.add('a-vist'); else obs.observe(x); });
  }

  /* ---------- Menuen på mobil ---------- */
  d.addEventListener('click', function(e){
    var k = e.target.closest && e.target.closest('.a-nav-knap');
    if(!k) return;
    var nav = k.closest('.a-nav');
    var å = nav.classList.toggle('a-aaben');
    k.setAttribute('aria-expanded', String(å));
  });

  function start(){
    startPopup();
    alle('[data-a-nedtaelling]').forEach(startNedtaelling);
    startAnimationer();
  }
  if(d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
  /* Editoren tegner elementer om; den kalder denne for at starte nye. */
  window.ArytmiRuntime = { genstart: function(){ alle('[data-a-nedtaelling]').forEach(startNedtaelling); startAnimationer(); }, indlejring: indlejring };
})();
