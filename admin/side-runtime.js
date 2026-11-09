/* =============================================================
   ARYTMIS SIDE-RUNTIME (9/11)
   =============================================================
   Det lille script, der får elementerne fra "Sider & funnels" til at
   virke: popup, knaphandlinger, nedtælling, video, video-popup,
   animationer og menuen på mobil. Det samme script kører i editorens
   lærred (uden animationer og autostart) og på de udgivne sider.

   Alt styres af data-attributter, som editoren skriver. Ingen
   afhængigheder, ingen cookies. Det eneste, der sendes, er en formular,
   kunden selv sender (til funktionen `formular`, 0089).

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

  /* ---------- Formularer -> kontakter (0089) ----------
     form[data-arytmi-formular="nøgle"] sendes til funktionen `formular`,
     der opretter eller opdaterer kontakten og giver formularens modtagere
     besked. Afkrydsninger, der hedder samtykke_*, gemmes som samtykke med
     den tekst, kunden så. Bagefter: data-a-efter (en adresse eller
     "næste") eller en tak i stedet for formularen (data-a-tak). */
  var FORMULAR_URL = 'https://vxleyvtumbwtkejoiaev.supabase.co/functions/v1/formular';
  function honningkrukke(form){
    if(form.querySelector('[name="_hp"]')) return;
    var hp = d.createElement('input');
    hp.type = 'text'; hp.name = '_hp'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true');
    hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
    form.appendChild(hp);
  }
  function sendFormular(form){
    if(form.__sender) return;
    var felter = {}, samtykker = [], hp = '';
    alle('input,select,textarea', form).forEach(function(f){
      if(!f.name || f.disabled) return;
      if(f.name === '_hp'){ hp = f.value; return; }
      if(f.type === 'checkbox'){
        if(!f.checked) return;
        if(/^samtykke_/.test(f.name)){
          var l = f.closest('label');
          samtykker.push({ noegle:f.name, tekst:(l ? l.textContent : f.name).replace(/\s+/g, ' ').trim().slice(0, 300) });
          return;
        }
        felter[f.name] = f.value || 'ja'; return;
      }
      if(f.type === 'radio' && !f.checked) return;
      felter[f.name] = f.value;
    });
    var q = new URLSearchParams(location.search), utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function(n){ if(q.get(n)) utm[n] = q.get(n); });
    var knap = form.querySelector('[data-a-handling="send"], button[type="submit"]');
    var fejl = form.querySelector('.a-form-fejl');
    if(!fejl){ fejl = d.createElement('p'); fejl.className = 'a-form-fejl'; fejl.setAttribute('role', 'alert'); fejl.hidden = true; form.appendChild(fejl); }
    fejl.hidden = true;
    form.__sender = true;
    if(knap) knap.setAttribute('aria-busy', 'true');
    fetch(FORMULAR_URL, { method:'POST', headers:{ 'Content-Type':'text/plain' },
      body:JSON.stringify({ formular:form.getAttribute('data-arytmi-formular'), felter:felter, samtykker:samtykker, side:location.pathname, utm:utm, _hp:hp }) })
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if(!r.ok) throw new Error(j.error || 'Det gik ikke igennem. Prøv igen.'); return j; }); })
      .then(function(){
        var efter = form.getAttribute('data-a-efter') || '';
        if(efter === 'næste' || efter === 'naeste') efter = meta('arytmi-naeste');
        if(efter){ location.href = efter + location.search; return; }
        var tak = d.createElement('p');
        tak.className = 'a-form-tak'; tak.setAttribute('role', 'status');
        tak.textContent = form.getAttribute('data-a-tak') || 'Tak! Vi har modtaget det.';
        form.parentNode.replaceChild(tak, form);
      })
      .catch(function(e){ fejl.textContent = e.message || 'Det gik ikke igennem. Prøv igen.'; fejl.hidden = false; })
      .then(function(){ form.__sender = false; if(knap) knap.removeAttribute('aria-busy'); });
  }
  d.addEventListener('submit', function(e){
    var form = e.target.closest && e.target.closest('form[data-arytmi-formular]');
    if(!form || iEditor) return;
    e.preventDefault();
    if(form.reportValidity && !form.reportValidity()) return;
    sendFormular(form);
  });
  function startFormularer(){ if(!iEditor) alle('form[data-arytmi-formular]').forEach(honningkrukke); }

  /* Ordreformularen (egen checkout) hentes kun på sider, der har en - fra
     samme sted som dette script (/_a/ på de udgivne sider). */
  function startOrdreformular(){
    if(iEditor || !d.querySelector('[data-a-ordreformular],[data-a-kvittering]') || window.__aoHentet) return;
    window.__aoHentet = true;
    var mig = alle('script[src*="side-runtime.js"]')[0];
    var src = mig ? mig.getAttribute('src') : '/_a/side-runtime.js';
    var base = src.replace(/side-runtime\.js.*$/, '');
    var v = (src.match(/\?v=[^&]+/) || [''])[0];
    var l = d.createElement('link'); l.rel = 'stylesheet'; l.href = base + 'ordreformular.css' + v; d.head.appendChild(l);
    var s = d.createElement('script'); s.src = base + 'ordreformular.js' + v; s.defer = true; d.body.appendChild(s);
  }

  function start(){
    startOrdreformular();
    startFormularer();
    startPopup();
    alle('[data-a-nedtaelling]').forEach(startNedtaelling);
    startAnimationer();
  }
  if(d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
  /* Editoren tegner elementer om; den kalder denne for at starte nye. */
  window.ArytmiRuntime = { genstart: function(){ alle('[data-a-nedtaelling]').forEach(startNedtaelling); startAnimationer(); }, indlejring: indlejring };
})();
