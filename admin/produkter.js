/* =============================================================
   PRODUKTER — ARYTMIS EGEN BUTIK BAG ORDREFORMULAREN (0085, 9/11)
   =============================================================
   Kennet 9/11: produkterne skal kunne det samme som i ClickFunnels, "1:1,
   men på vores måde". Feltlisten og hvad der bevidst ikke er med:
   `docs/paritet-produkter.md` i app-repoet.

   OPBYGNING: underfanerne Produkter · Samlinger · Rabatter · Fragt · Tags.
   Et produkt åbnes som et kort med grundoplysninger, billeder, SEO og
   synlighed, og derunder varianterne (fx én pr. bilmodel), hver med sine
   priser (engang, abonnement, afdrag).

   STRIPE: "Send til Stripe" kalder funktionen stripe-priser, der laver eller
   retter Stripes objekter og gemmer deres id'er. Stripes id'er kan kun
   skrives af serveren. Testtilstand (sandkassen) indtil live er sat op.

   Siden bygger DOM med textContent og createElement, ikke innerHTML, som
   resten af bagrummet. Beløb vises i kroner og gemmes i øre, med moms.
   ============================================================= */
(function(){
  'use strict';
  var api = null;
  var startet = false;
  var TILSTAND = 'test';
  var BILLEDSPAND = 'sidebilleder', FILSPAND = 'produktfiler';
  var data = { produkter:[], varianter:[], priser:[], samlinger:[], rabatter:[], tags:[],
               profiler:[], zoner:[], satser:[], varer:[], funnels:[] };
  var visning = { fane:'produkter', produkt:null, søg:'', arkiv:false };

  /* ---------- Små hjælpere ---------- */
  function $(id){ return document.getElementById(id); }
  function el(tag, eg, børn){
    var e = document.createElement(tag);
    eg = eg || {};
    for(var n in eg){
      var v = eg[n];
      if(v === null || v === undefined || v === false) continue;
      if(n === 'tekst') e.textContent = v;
      else if(n === 'klik') e.addEventListener('click', v);
      else if(n === 'klasse') e.className = v;
      else e.setAttribute(n, v === true ? '' : v);
    }
    (børn || []).forEach(function(b){ if(b) e.appendChild(typeof b === 'string' ? document.createTextNode(b) : b); });
    return e;
  }
  function tøm(e){ while(e.firstChild) e.removeChild(e.firstChild); }
  function knap(tekst, klasse, klik){ return el('button', { type:'button', klasse:klasse || 'knap lille', tekst:tekst, klik:klik }); }
  function status(tekst, slags){
    var s = $('pr-status');
    s.textContent = tekst || '';
    s.className = 'status' + (slags ? ' ' + slags : '');
  }
  function fejltekst(f){
    if(f && f.kode === '23505') return 'Der findes allerede en med det navn, den sti, SKU eller kode.';
    if(f && f.kode === '23503') return 'Den bruges et andet sted (fx af en vare, en ordre eller en rabat) og kan ikke slettes. Arkivér den i stedet.';
    if(f && f.kode === '42501') return 'Serveren afviste det. Har din konto to-faktor, skal du have brugt den i den her session.';
    if(f && f.kode === '23514'){
      var m = String(f.message || '');
      if(m.indexOf('standardvarianten') >= 0) return 'Standardvarianten kan ikke slettes — den hører til produktet.';
      return 'Serveren afviste et felt. Tjek beløb, intervaller og adresser (billeder skal ligge på https://).';
    }
    return api.forklar(f);
  }
  function tusind(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function kr(oere){
    if(oere === null || oere === undefined) return '—';
    var hele = Math.floor(oere / 100), rest = oere % 100;
    return tusind(hele) + (rest ? ',' + (rest < 10 ? '0' : '') + rest : '') + ' kr.';
  }
  function læsKr(v){
    var s = String(v || '').replace(/kr\.?/i, '').replace(/\s/g, '');
    if(!s) return null;
    if(s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if(/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if(!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
    return Math.round(parseFloat(s) * 100);
  }
  function tilKrFelt(oere){
    if(oere === null || oere === undefined) return '';
    var rest = oere % 100;
    return Math.floor(oere / 100) + (rest ? ',' + (rest < 10 ? '0' : '') + rest : '');
  }
  function dato(iso){
    if(!iso) return '—';
    var d = new Date(iso);
    return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + d.getFullYear();
  }
  function rest(sti, valg){ return api.json('/rest/v1/' + sti, valg); }
  function gemRække(tabel, id, krop){
    return rest(id ? tabel + '?id=eq.' + encodeURIComponent(id) : tabel, {
      method: id ? 'PATCH' : 'POST', body: krop, headers: { Prefer:'return=representation' }
    }).then(function(rk){
      if(!rk || !rk.length) throw new Error('Serveren gemte ingenting. Har din konto to-faktor, skal du have brugt den i den her session.');
      return rk[0];
    });
  }
  function sletRække(tabel, id){
    return rest(tabel + '?id=eq.' + encodeURIComponent(id), { method:'DELETE', headers:{ Prefer:'return=representation' } })
      .then(function(rk){ if(!rk || !rk.length) throw new Error('Intet blev slettet.'); });
  }
  function harStripe(r){ return !!(r && r.stripe && (r.stripe.test || r.stripe.live)); }

  var INTERVAL = [['dag','dag(e)'], ['uge','uge(r)'], ['maaned','måned(er)'], ['kvartal','kvartal(er)'], ['aar','år']];
  var INTERVAL_NAVN = { dag:'dag', uge:'uge', maaned:'måned', kvartal:'kvartal', aar:'år' };
  function intervalTekst(n, i){ return n === 1 ? INTERVAL_NAVN[i] : n + ' ' + ({ dag:'dage', uge:'uger', maaned:'måneder', kvartal:'kvartaler', aar:'år' })[i]; }
  function prisTekst(p){
    var t = kr(p.beloeb_oere);
    if(p.slags === 'abonnement') t += ' pr. ' + intervalTekst(p.interval_antal, p.interval);
    if(p.slags === 'afdrag') t = p.antal_betalinger + ' × ' + kr(p.beloeb_oere) + ' pr. ' + intervalTekst(p.interval_antal, p.interval);
    if(p.opstart_oere) t = kr(p.opstart_oere) + ' nu · derefter ' + t;
    if(p.proeve_antal) t += ' · ' + intervalTekst(p.proeve_antal, p.proeve_interval) + (p.proeve_oere ? ' prøve til ' + kr(p.proeve_oere) : ' gratis først');
    return t;
  }

  /* ---------- Formularer ----------
     Én beskrivelse pr. felt: { n, t, l, h, valg, krav, maks, vis }.
     t: tekst, tekstfelt, kr, heltal, tal, valg, flueben, liste (én pr. linje),
        dato, farve, billeder, filer, flervalg. `vis(værdier)` skjuler et felt. */
  function formular(felter, start, id){
    var boks = el('div', { klasse:'pr-form' });
    var input = {}, rækker = {};
    var værdi = {};
    felter.forEach(function(f){ værdi[f.n] = start[f.n]; });

    felter.forEach(function(f){
      var fid = 'pr-' + id + '-' + f.n, w;
      if(f.t === 'overskrift'){ boks.appendChild(el('h4', { klasse:'pr-del', tekst:f.l })); return; }
      if(f.t === 'flueben'){
        var c = el('input', { type:'checkbox', id:fid });
        c.checked = !!start[f.n];
        w = el('div', { klasse:'afkryds' }, [c, el('label', { for:fid, tekst:f.l })]);
        if(f.h) w.appendChild(el('span', { klasse:'hint', tekst:' — ' + f.h }));
        input[f.n] = c;
      } else {
        var e;
        if(f.t === 'tekstfelt'){ e = el('textarea', { id:fid, rows:f.rækker || 4 }); e.value = start[f.n] || ''; }
        else if(f.t === 'rigtekst'){ e = rigtekst(fid, start[f.n] || ''); }
        else if(f.t === 'valg'){
          e = el('select', { id:fid });
          (typeof f.valg === 'function' ? f.valg() : f.valg).forEach(function(v){ e.appendChild(new Option(v[1], v[0])); });
          e.value = start[f.n] == null ? '' : String(start[f.n]);
        }
        else if(f.t === 'flervalg'){
          e = el('div', { id:fid, klasse:'pr-flervalg', role:'group' });
          var valgte = start[f.n] || [];
          (typeof f.valg === 'function' ? f.valg() : f.valg).forEach(function(v, i){
            var cid = fid + '-' + i;
            var c2 = el('input', { type:'checkbox', id:cid, 'data-v':v[0] });
            c2.checked = valgte.indexOf(v[0]) >= 0;
            /* Hver mulighed er én brik: feltet og navnet i samme <label>, så de
               aldrig skilles, og listen brydes over linjer i stedet for at rulle. */
            e.appendChild(el('label', { klasse:'pr-valg', for:cid }, [c2, el('span', { tekst:v[1] })]));
          });
          if(!e.firstChild) e.appendChild(el('span', { klasse:'hint', tekst:'Intet at vælge endnu.' }));
        }
        else if(f.t === 'billeder' || f.t === 'filer'){ e = mediefelt(fid, f.t, start[f.n] || []); }
        else {
          e = el('input', { id:fid, type: f.t === 'dato' ? 'date' : f.t === 'farve' ? 'color' : 'text', autocomplete:'off' });
          if(f.t === 'kr' || f.t === 'tal') e.inputMode = 'decimal';
          if(f.t === 'heltal') e.inputMode = 'numeric';
          if(f.maks) e.maxLength = f.maks;
          var s = start[f.n];
          e.value = f.t === 'kr' ? tilKrFelt(s)
                  : f.t === 'liste' ? (s || []).join(', ')
                  : f.t === 'dato' ? (s ? new Date(s).toISOString().slice(0, 10) : '')
                  : f.t === 'tal' && s != null ? String(s).replace('.', ',')
                  : (s == null ? '' : String(s));
          if(f.t === 'farve' && !e.value) e.value = '#8e4333';
        }
        w = el('div', { klasse:'pr-felt' + (f.bred ? ' bred' : '') }, [el('label', { for:fid, tekst:f.l + (f.krav ? ' *' : '') }), e]);
        if(f.h){ var hid = fid + '-h'; w.appendChild(el('p', { klasse:'hint', id:hid, tekst:f.h })); e.setAttribute('aria-describedby', hid); }
        input[f.n] = e;
      }
      rækker[f.n] = w;
      boks.appendChild(w);
    });

    function læsÉn(f){
      var e = input[f.n];
      if(!e) return { v: undefined };
      if(f.t === 'flueben') return { v: e.checked };
      if(f.t === 'flervalg') return { v: Array.prototype.map.call(e.querySelectorAll('input:checked'), function(c){ return c.getAttribute('data-v'); }) };
      if(f.t === 'billeder' || f.t === 'filer') return { v: e._liste.slice() };
      if(f.t === 'rigtekst') return { v: e._værdi() };
      var s = e.value.trim();
      if(f.t === 'kr'){ var k = læsKr(s); if(k !== null && isNaN(k)) return { fejl:'Skriv beløbet i kroner, fx 2.995 eller 675,50.' }; return { v:k }; }
      if(f.t === 'heltal'){ if(!s) return { v:null }; if(!/^-?\d+$/.test(s)) return { fejl:'Skriv et helt tal.' }; return { v:parseInt(s, 10) }; }
      if(f.t === 'tal'){ if(!s) return { v:null }; var t = parseFloat(s.replace(',', '.')); if(isNaN(t)) return { fejl:'Skriv et tal.' }; return { v:t }; }
      if(f.t === 'liste') return { v: s ? s.split(/[,\n]/).map(function(x){ return x.trim(); }).filter(Boolean) : [] };
      if(f.t === 'dato') return { v: s ? new Date(s + 'T23:59:59').toISOString() : null };
      if(f.t === 'valg') return { v: s === '' ? null : s };
      return { v: s === '' ? (f.tom === undefined ? null : f.tom) : s };
    }
    function opdaterSynlighed(){
      var v = {};
      felter.forEach(function(f){ if(input[f.n]) v[f.n] = læsÉn(f).v; });
      felter.forEach(function(f){ if(f.vis && rækker[f.n]) rækker[f.n].hidden = !f.vis(v); });
    }
    boks.addEventListener('input', opdaterSynlighed);
    boks.addEventListener('change', opdaterSynlighed);
    opdaterSynlighed();

    return {
      el: boks,
      læs: function(){
        var ud = {};
        for(var i = 0; i < felter.length; i++){
          var f = felter[i];
          if(!input[f.n]) continue;
          if(rækker[f.n].hidden){ ud[f.n] = f.skjult === undefined ? null : f.skjult; continue; }
          var r = læsÉn(f);
          if(r.fejl) return { fejl: f.l + ': ' + r.fejl, felt: input[f.n] };
          if(f.krav && (r.v === null || r.v === '' || (Array.isArray(r.v) && !r.v.length)))
            return { fejl: f.l + ' skal udfyldes.', felt: input[f.n] };
          ud[f.n] = r.v;
        }
        return { værdier: ud };
      }
    };
  }

  /* ---------- Teksteditoren (beskrivelser) ----------
     Visuel redigering som i ClickFunnels: det, man ser, er det, kunden ser.
     Værktøjslinje: fed, kursiv, overskrift, afsnit, punktliste, nummereret
     liste, link, fold-ud-boks og ryd formatering. Rå HTML kun under
     "Avanceret". Alt renses ved gem (renHtml): kun en tilladt liste af
     mærker; ingen script, ingen on*-attributter, kun https/mailto-links. */
  var TILLADTE = { P:1, BR:1, B:1, STRONG:1, I:1, EM:1, U:1, H3:1, H4:1, UL:1, OL:1, LI:1, A:1, DETAILS:1, SUMMARY:1, SPAN:1, DIV:1 };
  function renHtml(html){
    var doc = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html');
    function rens(n){
      Array.prototype.slice.call(n.childNodes).forEach(function(b){
        if(b.nodeType === 3) return;
        if(b.nodeType !== 1){ b.remove(); return; }
        if(!TILLADTE[b.tagName]){
          /* Ukendte mærker pakkes ud (teksten bliver), farlige fjernes helt. */
          if(/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|INPUT|BUTTON|TEXTAREA|SELECT|LINK|META|SVG|MATH|TEMPLATE)$/.test(b.tagName)){ b.remove(); return; }
          var far = b.parentNode;
          while(b.firstChild) far.insertBefore(b.firstChild, b);
          b.remove();
          rens(far);
          return;
        }
        Array.prototype.slice.call(b.attributes).forEach(function(a){
          var navn = a.name.toLowerCase();
          if(b.tagName === 'A' && navn === 'href'){
            if(!/^(https:\/\/|mailto:)/i.test(a.value.trim())) b.removeAttribute(a.name);
            return;
          }
          if(navn === 'style' && !/url\s*\(|expression|javascript:/i.test(a.value)) return;
          b.removeAttribute(a.name);
        });
        if(b.tagName === 'A'){ b.setAttribute('rel', 'noopener'); b.setAttribute('target', '_blank'); }
        rens(b);
      });
    }
    var rod = doc.body.firstChild;
    rens(rod);
    var ud = rod.innerHTML.replace(/<p>(\s|<br>)*<\/p>/g, '').trim();
    return ud === '<br>' ? '' : ud;
  }

  function rigtekst(fid, start){
    var boks = el('div', { id:fid, klasse:'pr-rigtekst' });
    var flade = el('div', { klasse:'pr-rt-flade', contenteditable:'true', role:'textbox', 'aria-multiline':'true', 'aria-label':'Beskrivelse' });
    flade.innerHTML = renHtml(start);
    var kilde = el('textarea', { klasse:'pr-rt-kilde', rows:'10', 'aria-label':'Beskrivelsen som HTML', hidden:true });
    var iKilde = false;
    function cmd(c, v){ flade.focus(); document.execCommand(c, false, v || null); }
    function blok(tag){ flade.focus(); document.execCommand('formatBlock', false, tag); }
    var linje = el('div', { klasse:'pr-rt-linje', role:'toolbar', 'aria-label':'Formatering' }, [
      knap('F', 'pr-rt-k pr-rt-fed', function(){ cmd('bold'); }),
      knap('K', 'pr-rt-k pr-rt-kursiv', function(){ cmd('italic'); }),
      knap('Overskrift', 'pr-rt-k', function(){ blok('H3'); }),
      knap('Afsnit', 'pr-rt-k', function(){ blok('P'); }),
      knap('• Liste', 'pr-rt-k', function(){ cmd('insertUnorderedList'); }),
      knap('1. Liste', 'pr-rt-k', function(){ cmd('insertOrderedList'); }),
      knap('Link', 'pr-rt-k', function(){
        var u = window.prompt('Linkets adresse (https://…)');
        if(u && /^(https:\/\/|mailto:)/i.test(u.trim())) cmd('createLink', u.trim());
      }),
      knap('Fold-ud', 'pr-rt-k', function(){
        var titel = window.prompt('Overskrift på fold-ud-boksen', 'Passer madrassen i din bil?');
        if(!titel) return;
        var d = document.createElement('details');
        var s = document.createElement('summary'); s.textContent = titel;
        var p = document.createElement('p'); p.textContent = 'Skriv teksten her.';
        d.appendChild(s); d.appendChild(p);
        flade.focus();
        var sel = window.getSelection();
        if(sel.rangeCount && flade.contains(sel.anchorNode)){ var r = sel.getRangeAt(0); r.collapse(false); r.insertNode(d); }
        else flade.appendChild(d);
        d.open = true;
      }),
      knap('Ryd formatering', 'pr-rt-k', function(){ cmd('removeFormat'); }),
      knap('Avanceret: HTML', 'pr-rt-k pr-rt-avanceret', function(){
        iKilde = !iKilde;
        if(iKilde){ kilde.value = renHtml(flade.innerHTML); }
        else { flade.innerHTML = renHtml(kilde.value); }
        kilde.hidden = !iKilde; flade.hidden = iKilde;
      })
    ]);
    /* Indsat tekst (fx fra Word) renses med det samme. */
    flade.addEventListener('paste', function(e){
      var html = e.clipboardData && e.clipboardData.getData('text/html');
      if(!html) return;
      e.preventDefault();
      document.execCommand('insertHTML', false, renHtml(html));
    });
    boks.appendChild(linje); boks.appendChild(flade); boks.appendChild(kilde);
    boks._værdi = function(){ return renHtml(iKilde ? kilde.value : flade.innerHTML); };
    return boks;
  }

  /* Billeder (offentlig billedspand) eller filer (privat spand) som en liste
     med op/ned/fjern og upload. Billeder kan også være en adresse. */
  var BILLEDTYPER = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif' };
  function mediefelt(fid, slags, liste){
    var boks = el('div', { id:fid, klasse:'pr-medier' });
    boks._liste = liste.slice();
    var rk = el('div', { klasse:'pr-medieliste' });
    function tegn(){
      tøm(rk);
      boks._liste.forEach(function(u, i){
        var r = el('div', { klasse:'pr-medie' });
        if(slags === 'billeder') r.appendChild(el('img', { src:u, alt:'', loading:'lazy' }));
        r.appendChild(el('span', { klasse:'pr-medienavn', tekst: slags === 'billeder' ? u.split('/').pop() : u }));
        r.appendChild(knap('↑', 'knap rolig lille', function(){ if(i){ var x = boks._liste.splice(i, 1)[0]; boks._liste.splice(i - 1, 0, x); tegn(); } }));
        r.appendChild(knap('Fjern', 'knap rolig lille', function(){ boks._liste.splice(i, 1); tegn(); }));
        rk.appendChild(r);
      });
      if(!boks._liste.length) rk.appendChild(el('p', { klasse:'hint', tekst: slags === 'billeder' ? 'Ingen billeder.' : 'Ingen filer.' }));
    }
    var fil = el('input', { type:'file', klasse:'pr-skjult', accept: slags === 'billeder' ? 'image/jpeg,image/png,image/webp,image/gif' : '' });
    if(slags === 'billeder') fil.multiple = true;
    var besked = el('span', { klasse:'hint' });
    fil.addEventListener('change', function(){
      Array.prototype.forEach.call(fil.files, function(f){
        besked.textContent = 'Lægger op …';
        lægOp(f, slags).then(function(u){ boks._liste.push(u); tegn(); besked.textContent = ''; })
          .catch(function(e){ besked.textContent = e.message; });
      });
      fil.value = '';
    });
    var linje = el('div', { klasse:'bb-linje' }, [knap(slags === 'billeder' ? 'Læg billede op' : 'Læg fil op', 'knap rolig lille', function(){ fil.click(); })]);
    if(slags === 'billeder'){
      linje.appendChild(knap('Tilføj adresse', 'knap rolig lille', function(){
        var u = window.prompt('Billedets adresse (https://…)');
        if(!u) return;
        if(!/^https:\/\//.test(u.trim())){ besked.textContent = 'Adressen skal starte med https://'; return; }
        boks._liste.push(u.trim()); tegn();
      }));
    }
    linje.appendChild(besked);
    boks.appendChild(rk); boks.appendChild(linje); boks.appendChild(fil);
    tegn();
    return boks;
  }
  function lægOp(fil, slags){
    var navn;
    if(slags === 'billeder'){
      var ext = BILLEDTYPER[fil.type];
      if(!ext) return Promise.reject(new Error('Kun JPG, PNG, WebP og GIF.'));
      if(fil.size > 5 * 1024 * 1024) return Promise.reject(new Error('Billedet er over 5 MB.'));
      navn = 'produkter/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    } else {
      if(fil.size > 100 * 1024 * 1024) return Promise.reject(new Error('Filen er over 100 MB.'));
      var ren = fil.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+/, '').slice(-80) || 'fil';
      navn = Date.now() + '-' + ren;
    }
    var spand = slags === 'billeder' ? BILLEDSPAND : FILSPAND;
    return api.kaldRaa('/storage/v1/object/' + spand + '/' + navn, 'POST', fil, fil.type || 'application/octet-stream').then(function(r){
      if(!r.ok) throw new Error('Filen blev afvist (' + r.status + ').');
      return slags === 'billeder' ? api.PROJEKT_URL + '/storage/v1/object/public/' + spand + '/' + navn : navn;
    });
  }

  /* ---------- Hent alt ---------- */
  function hent(){
    status('Henter …', 'svag');
    return Promise.all([
      rest('produkt?select=*&order=arkiveret.asc,navn.asc'),
      rest('produkt_variant?select=*&order=raekkefoelge.asc,oprettet.asc'),
      rest('produkt_pris?select=*&order=raekkefoelge.asc,oprettet.asc'),
      rest('produktsamling?select=*&order=navn.asc'),
      rest('rabat?select=*&order=udloebet.asc,oprettet.desc'),
      rest('produkt_tag?select=*&order=navn.asc'),
      rest('fragtprofil?select=*&order=standard.desc,navn.asc'),
      rest('fragtzone?select=*&order=oprettet.asc'),
      rest('fragtsats?select=*&order=raekkefoelge.asc,oprettet.asc'),
      rest('vare?select=id,navn,aktiv&order=navn.asc'),
      rest('funnel?select=id,navn&arkiveret=eq.false&order=navn.asc')
    ]).then(function(r){
      data.produkter = r[0] || []; data.varianter = r[1] || []; data.priser = r[2] || [];
      data.samlinger = r[3] || []; data.rabatter = r[4] || []; data.tags = r[5] || [];
      data.profiler = r[6] || []; data.zoner = r[7] || []; data.satser = r[8] || [];
      data.varer = r[9] || []; data.funnels = r[10] || [];
      status('');
      tegn();
    }).catch(function(f){
      status(f && f.status === 404 ? 'Produkterne er ikke sat op i databasen endnu (migration 0085).' : 'Kunne ikke hente produkterne: ' + fejltekst(f), 'fejl');
    });
  }

  function varianterAf(pid){ return data.varianter.filter(function(v){ return v.produkt_id === pid; }); }
  function priserAf(vid){ return data.priser.filter(function(p){ return p.variant_id === vid; }); }
  function produktAf(id){ return data.produkter.filter(function(p){ return p.id === id; })[0]; }

  /* ---------- Tegning ---------- */
  function tegn(){
    var rod = $('pr-indhold');
    tøm(rod);
    Array.prototype.forEach.call(document.querySelectorAll('#pr-faner [data-pf]'), function(k){
      k.setAttribute('aria-selected', String(k.getAttribute('data-pf') === visning.fane));
    });
    if(visning.fane === 'produkter') return visning.produkt ? tegnProduktkort(rod) : tegnProduktliste(rod);
    if(visning.fane === 'samlinger') return tegnSamlinger(rod);
    if(visning.fane === 'rabatter') return tegnRabatter(rod);
    if(visning.fane === 'fragt') return tegnFragt(rod);
    if(visning.fane === 'tags') return tegnTags(rod);
  }

  function stripeStatus(p){
    var vs = varianterAf(p.id);
    var mangler = vs.filter(function(v){ return !(v.stripe && v.stripe[TILSTAND] && v.stripe[TILSTAND].produkt); }).length;
    var priser = vs.reduce(function(a, v){ return a.concat(priserAf(v.id)); }, []);
    var usendte = priser.filter(function(x){ return !(x.stripe && x.stripe[TILSTAND] && x.stripe[TILSTAND].pris); }).length;
    if(!priser.length) return { tekst:'Ingen priser', god:false };
    if(mangler || usendte) return { tekst:'Ikke sendt til Stripe', god:false };
    return { tekst:'I Stripe (test)', god:true };
  }

  function tegnProduktliste(rod){
    var top = el('div', { klasse:'pr-top' });
    var søg = el('input', { type:'search', placeholder:'Søg i produkter', 'aria-label':'Søg i produkter' });
    søg.value = visning.søg;
    søg.addEventListener('input', function(){ visning.søg = søg.value; tegnListe(); });
    var arkiv = el('input', { type:'checkbox', id:'pr-vis-arkiv' }); arkiv.checked = visning.arkiv;
    arkiv.addEventListener('change', function(){ visning.arkiv = arkiv.checked; tegnListe(); });
    top.appendChild(søg);
    top.appendChild(el('span', { klasse:'afkryds' }, [arkiv, el('label', { for:'pr-vis-arkiv', tekst:'Vis arkiverede' })]));
    top.appendChild(knap('Opret produkt', 'knap lille', function(){ opretProdukt(nyPlads); }));
    rod.appendChild(top);
    var nyPlads = el('div');
    rod.appendChild(nyPlads);
    var tabel = el('table', { klasse:'pr-tabel' });
    tabel.appendChild(el('thead', {}, [el('tr', {}, ['', 'Produkt', 'Varianter', 'Pris', 'Stripe', ''].map(function(t){ return el('th', { tekst:t }); }))]));
    var tb = el('tbody');
    tabel.appendChild(tb);
    rod.appendChild(el('div', { klasse:'rulle' }, [tabel]));
    function tegnListe(){
      tøm(tb);
      var q = visning.søg.trim().toLowerCase();
      var liste = data.produkter.filter(function(p){
        return (visning.arkiv || !p.arkiveret) && (!q || p.navn.toLowerCase().indexOf(q) >= 0
          || varianterAf(p.id).some(function(v){ return (v.sku || '').toLowerCase().indexOf(q) >= 0; }));
      });
      if(!liste.length){
        tb.appendChild(el('tr', {}, [el('td', { colspan:'6', klasse:'tomt', tekst: data.produkter.length ? 'Ingen produkter passer.' : 'Ingen produkter endnu. Opret det første.' })]));
        return;
      }
      liste.forEach(function(p){
        var vs = varianterAf(p.id);
        var priser = vs.reduce(function(a, v){ return a.concat(priserAf(v.id).filter(function(x){ return !x.arkiveret; })); }, []);
        var billede = (p.billeder || [])[0];
        var st = stripeStatus(p);
        var tags = (p.tags || []).map(function(t){ return data.tags.filter(function(x){ return x.id === t; })[0]; }).filter(Boolean);
        var navn = el('td', { klasse:'pr-navn' }, [el('strong', { tekst:p.navn + (p.arkiveret ? ' (arkiveret)' : '') })]);
        if(tags.length) navn.appendChild(el('span', { klasse:'pr-tags' }, tags.map(function(t){ return el('span', { klasse:'pr-tag', style:'--tagfarve:' + t.farve, tekst:t.navn }); })));
        var r = el('tr', { klasse: p.arkiveret ? 'pr-arkiv' : null }, [
          el('td', { klasse:'pr-thumb' }, [billede ? el('img', { src:billede, alt:'', loading:'lazy' }) : el('span', { klasse:'pr-ingen' })]),
          navn,
          el('td', { tekst: String(vs.filter(function(v){ return !v.er_standard || vs.length === 1; }).length) }),
          el('td', { tekst: priser.length ? (priser.length > 1 ? 'fra ' : '') + prisTekst(priser.slice().sort(function(a, b){ return a.beloeb_oere + a.opstart_oere - b.beloeb_oere - b.opstart_oere; })[0]) : '—' }),
          el('td', { klasse: st.god ? 'pr-god' : 'pr-advar', tekst: st.tekst }),
          el('td', { klasse:'pr-greb' }, [knap('Åbn', 'knap rolig lille', function(){ visning.produkt = p.id; tegn(); })])
        ]);
        tb.appendChild(r);
      });
    }
    tegnListe();
  }

  /* Et navnefelt i siden (i stedet for browserens prompt(), der er grim og
     ikke virker overalt). ok(navn, besked) skal give et løfte. */
  function navnFelt(plads, etiket, knaptekst, ok){
    tøm(plads);
    var id = 'pr-navn-' + Math.random().toString(36).slice(2, 8);
    var felt = el('input', { type:'text', id:id, maxlength:'200', autocomplete:'off' });
    var besked = el('div', { klasse:'besked', hidden:true, role:'alert' });
    var gem = knap(knaptekst, 'knap lille', function(){
      var navn = felt.value.trim();
      if(!navn){ vis(besked, 'Skriv et navn.', 'fejl'); felt.focus(); return; }
      gem.disabled = true;
      vis(besked, 'Gemmer …');
      ok(navn, besked).then(function(){ tøm(plads); })
        .catch(function(f){ gem.disabled = false; vis(besked, fejltekst(f), 'fejl'); });
    });
    felt.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); gem.click(); } else if(e.key === 'Escape') tøm(plads); });
    plads.appendChild(el('div', { klasse:'brud-form' }, [
      el('div', { klasse:'pr-felt' }, [el('label', { for:id, tekst:etiket }), felt]),
      el('div', { klasse:'bb-linje' }, [gem, knap('Fortryd', 'knap rolig lille', function(){ tøm(plads); })]),
      besked
    ]));
    felt.focus();
  }

  function opretProdukt(plads){
    navnFelt(plads, 'Produktets navn', 'Opret produktet', function(navn){
      return gemRække('produkt', null, { navn: navn }).then(function(p){
        visning.produkt = p.id;
        return hent();
      });
    });
  }

  /* ---------- Produktkortet ---------- */
  var PRODUKTFELTER = [
    { n:'navn', t:'tekst', l:'Navn', krav:true, maks:200, bred:true },
    { n:'beskrivelse', t:'rigtekst', l:'Beskrivelse', h:'Vises på produktet og i ordreformularen, som du ser den her.', bred:true },
    { n:'billeder', t:'billeder', l:'Billeder', h:'Det første er hovedbilledet. Højst 30.', bred:true },
    { n:'egenskaber', t:'liste', l:'Egenskaber til varianter', h:'Fx "Bilmodel" eller "Størrelse, Farve". Højst 3, adskilt med komma.' },
    { n:'tags', t:'flervalg', l:'Tags', valg:function(){ return data.tags.map(function(t){ return [t.id, t.navn]; }); } },
    { t:'overskrift', l:'Synlighed og sider' },
    { n:'synlig_i_butik', t:'flueben', l:'Synlig i butikken' },
    { n:'synlig_i_kundecenter', t:'flueben', l:'Synlig i kundecenteret' },
    { n:'sti', t:'tekst', l:'Produktsidens sti', h:'Fx /auto-level-madras. Tom = ingen produktside.', maks:200 },
    { n:'funnel_id', t:'valg', l:'Omdiriger til funnel', valg:function(){ return [['', '— ingen —']].concat(data.funnels.map(function(f){ return [f.id, f.navn]; })); } },
    { n:'opsigelse_url', t:'tekst', l:'Opsigelsesside', h:'Hvor en kunde, der vil opsige, sendes hen (https://…).', maks:500 },
    { t:'overskrift', l:'Søgemaskiner og deling' },
    { n:'seo_titel', t:'tekst', l:'SEO-titel', maks:60, h:'Højst 60 tegn.' },
    { n:'seo_beskrivelse', t:'tekstfelt', l:'SEO-beskrivelse', h:'Højst 160 tegn.', rækker:2 },
    { n:'seo_billede', t:'tekst', l:'Delingsbillede (https://…)', maks:500 }
  ];

  function tegnProduktkort(rod){
    var p = produktAf(visning.produkt);
    if(!p){ visning.produkt = null; return tegn(); }
    var top = el('div', { klasse:'pr-top' }, [
      knap('← Alle produkter', 'knap rolig lille', function(){ visning.produkt = null; tegn(); }),
      el('h3', { tekst:p.navn + (p.arkiveret ? ' (arkiveret)' : '') })
    ]);
    rod.appendChild(top);

    var besked = el('div', { klasse:'besked', hidden:true, role:'alert' });
    var form = formular(PRODUKTFELTER, p, 'p');
    var kort = el('section', { klasse:'db-kort pr-kort' }, [el('h4', { tekst:'Produktet' }), form.el]);
    var greb = el('div', { klasse:'bb-linje pr-handlinger' });
    greb.appendChild(knap('Gem produktet', 'knap lille', function(){
      var r = form.læs();
      if(r.fejl){ vis(besked, r.fejl, 'fejl'); if(r.felt && r.felt.focus) r.felt.focus(); return; }
      var v = r.værdier;
      if(v.sti && !/^\/[a-z0-9][a-z0-9-]*$/.test(v.sti)) return vis(besked, 'Stien skal starte med / og kun have små bogstaver, tal og bindestreg.', 'fejl');
      if(v.egenskaber.length > 3) return vis(besked, 'Højst 3 egenskaber.', 'fejl');
      if(v.seo_beskrivelse && v.seo_beskrivelse.length > 160) return vis(besked, 'SEO-beskrivelsen er over 160 tegn.', 'fejl');
      gemRække('produkt', p.id, v).then(function(){ vis(besked, 'Produktet er gemt. Send det til Stripe, når priserne er på plads.', 'god'); return hent(); })
        .catch(function(f){ vis(besked, fejltekst(f), 'fejl'); });
    }));
    greb.appendChild(stripeKnap('produkt', p.id, besked));
    greb.appendChild(knap('Kopiér produktet', 'knap rolig lille', function(){ kopiérProdukt(p, besked); }));
    greb.appendChild(knap(p.arkiveret ? 'Genskab' : 'Arkivér', 'knap rolig lille', function(){
      gemRække('produkt', p.id, { arkiveret: !p.arkiveret }).then(hent).catch(function(f){ vis(besked, fejltekst(f), 'fejl'); });
    }));
    var sendt = varianterAf(p.id).some(harStripe);
    if(!sendt) greb.appendChild(knap('Slet', 'knap fare lille', function(){
      if(!window.confirm('Slette "' + p.navn + '" med alle varianter og priser?')) return;
      sletRække('produkt', p.id).then(function(){ visning.produkt = null; return hent(); }).catch(function(f){ vis(besked, fejltekst(f), 'fejl'); });
    }));
    kort.appendChild(greb);
    kort.appendChild(besked);
    rod.appendChild(kort);

    /* Varianterne */
    var vs = varianterAf(p.id);
    var vkort = el('section', { klasse:'db-kort pr-kort' }, [el('h4', { tekst:'Varianter og priser' }),
      el('p', { klasse:'hint', tekst: (p.egenskaber || []).length
        ? 'Én variant pr. ' + p.egenskaber.join(' / ').toLowerCase() + ', hver med egne priser. Standardvarianten er produktet selv.'
        : 'Et produkt uden egenskaber har kun standardvarianten. Tilføj en egenskab (fx Bilmodel) for at lave varianter.' })]);
    vs.forEach(function(v){ vkort.appendChild(variantBoks(p, v)); });
    var variantPlads = el('div');
    if((p.egenskaber || []).length) vkort.appendChild(el('div', { klasse:'bb-linje' }, [knap('Tilføj variant', 'knap rolig lille', function(){
      navnFelt(variantPlads, 'Variantens navn (fx Model Y Juniper)', 'Tilføj varianten', function(navn){
        var værdier = {}; værdier[p.egenskaber[0]] = navn;
        return gemRække('produkt_variant', null, { produkt_id:p.id, navn:navn, vaerdier:værdier, raekkefoelge: vs.length,
          fragtprofil_id: (data.profiler.filter(function(x){ return x.standard; })[0] || {}).id || null }).then(hent);
      });
    })]));
    vkort.appendChild(variantPlads);
    rod.appendChild(vkort);
  }

  function vis(boks, tekst, slags){ boks.textContent = tekst; boks.className = 'besked' + (slags ? ' ' + slags : ''); boks.hidden = false; }

  function stripeKnap(slags, id, besked){
    var k = knap('Send til Stripe (test)', 'knap lille', function(){
      k.disabled = true;
      vis(besked, 'Sender til Stripe …');
      api.json('/functions/v1/stripe-priser', { method:'POST', body:{ slags:slags, id:id, tilstand:TILSTAND } })
        .then(function(s){ vis(besked, 'Stripe er opdateret (testtilstand' + (s && s.antal ? ', ' + s.antal + ' objekter' : '') + ').', 'god'); return hent(); })
        .catch(function(f){ k.disabled = false; vis(besked, 'Stripe blev ikke opdateret: ' + ((f && f.message) || 'ukendt fejl'), 'fejl'); });
    });
    return k;
  }

  function variantFelter(p){
    var f = [
      { n:'navn', t:'tekst', l:'Navn', krav:true, maks:200 }
    ];
    (p.egenskaber || []).forEach(function(e){ f.push({ n:'egenskab:' + e, t:'tekst', l:e, maks:100 }); });
    return f.concat([
      { n:'sku', t:'tekst', l:'SKU (varenummer)', maks:100 },
      { n:'beskrivelse', t:'rigtekst', l:'Beskrivelse (valgfri)', h:'Tom = produktets beskrivelse.', bred:true },
      { n:'billeder', t:'billeder', l:'Billeder', h:'Tom = produktets billeder.', bred:true },
      { t:'overskrift', l:'Levering' },
      { n:'slags', t:'valg', l:'Slags', valg:[['fysisk', 'Fysisk vare'], ['digital', 'Digital']] },
      { n:'skal_sendes', t:'flueben', l:'Skal sendes', vis:function(v){ return v.slags === 'fysisk'; }, skjult:false },
      { n:'fragtprofil_id', t:'valg', l:'Fragtprofil', valg:function(){ return [['', '— ingen —']].concat(data.profiler.map(function(x){ return [x.id, x.navn + (x.standard ? ' (standard)' : '')]; })); }, vis:function(v){ return v.slags === 'fysisk'; } },
      { n:'vaegt', t:'tal', l:'Vægt', vis:function(v){ return v.slags === 'fysisk'; } },
      { n:'vaegt_enhed', t:'valg', l:'Enhed', valg:[['kg','kg'], ['g','g']], vis:function(v){ return v.slags === 'fysisk'; }, skjult:'kg' },
      { n:'laengde', t:'tal', l:'Længde', vis:function(v){ return v.slags === 'fysisk'; } },
      { n:'bredde', t:'tal', l:'Bredde', vis:function(v){ return v.slags === 'fysisk'; } },
      { n:'hoejde', t:'tal', l:'Højde', vis:function(v){ return v.slags === 'fysisk'; } },
      { n:'maal_enhed', t:'valg', l:'Enhed', valg:[['cm','cm'], ['mm','mm'], ['m','m']], vis:function(v){ return v.slags === 'fysisk'; }, skjult:'cm' },
      { n:'oprindelsesland', t:'tekst', l:'Fremstillingsland', h:'To bogstaver, fx CN eller DK.', maks:2 },
      { t:'overskrift', l:'Lager' },
      { n:'spor_lager', t:'flueben', l:'Hold styr på lageret' },
      { n:'lager', t:'heltal', l:'Antal på lager', vis:function(v){ return v.spor_lager; }, skjult:0 },
      { n:'saelg_uden_lager', t:'flueben', l:'Sælg, også når lageret er tomt', vis:function(v){ return v.spor_lager; }, skjult:false },
      { t:'overskrift', l:'Moms, omkostninger og indhold' },
      { n:'momspligtig', t:'flueben', l:'Momspligtig (25 % er inkluderet i prisen)' },
      { n:'momskode', t:'tekst', l:'Stripe-momskode (valgfri)', h:'Fx txcd_99999999 (almindelige varer). Tom = Stripes standard.', maks:13 },
      { n:'vare_id', t:'valg', l:'Vare (til omkostningerne)', valg:function(){ return [['', '— ingen —']].concat(data.varer.map(function(x){ return [x.id, x.navn + (x.aktiv ? '' : ' (sælges ikke)')]; })); } },
      { n:'giver_app_adgang', t:'flueben', l:'Køb giver adgang til Arytmi-appen' },
      { n:'filer', t:'filer', l:'Digitale filer', h:'Fx e-bogen. Kunden får et link efter købet. Ligger privat.', bred:true },
      { t:'overskrift', l:'Visning' },
      { n:'synlig', t:'flueben', l:'Synlig' },
      { n:'raekkefoelge', t:'heltal', l:'Rækkefølge', skjult:0 }
    ]);
  }

  function variantBoks(p, v){
    var åben = el('details', { klasse:'pr-variant' });
    var priser = priserAf(v.id);
    var sum = el('summary', {}, [
      el('strong', { tekst: v.er_standard ? 'Standardvarianten' + ((p.egenskaber || []).length ? '' : ' (produktet)') : v.navn }),
      el('span', { klasse:'hint', tekst: ' · ' + (v.sku ? 'SKU ' + v.sku + ' · ' : '') + priser.filter(function(x){ return !x.arkiveret; }).length + ' pris(er)' + (v.arkiveret ? ' · arkiveret' : '') })
    ]);
    åben.appendChild(sum);
    var start = Object.assign({}, v);
    (p.egenskaber || []).forEach(function(e){ start['egenskab:' + e] = (v.vaerdier || {})[e] || ''; });
    var form = formular(variantFelter(p), start, 'v' + v.id.slice(0, 8));
    var besked = el('div', { klasse:'besked', hidden:true, role:'alert' });
    åben.appendChild(form.el);
    var greb = el('div', { klasse:'bb-linje' }, [knap('Gem varianten', 'knap lille', function(){
      var r = form.læs();
      if(r.fejl){ vis(besked, r.fejl, 'fejl'); if(r.felt && r.felt.focus) r.felt.focus(); return; }
      var krop = {}, værdier = {};
      Object.keys(r.værdier).forEach(function(k){
        if(k.indexOf('egenskab:') === 0){ if(r.værdier[k]) værdier[k.slice(9)] = r.værdier[k]; }
        else krop[k] = r.værdier[k];
      });
      krop.vaerdier = værdier;
      if(krop.oprindelsesland){ krop.oprindelsesland = krop.oprindelsesland.toUpperCase(); if(!/^[A-Z]{2}$/.test(krop.oprindelsesland)) return vis(besked, 'Fremstillingslandet skal være to bogstaver, fx CN.', 'fejl'); }
      if(krop.momskode && !/^txcd_\d{8}$/.test(krop.momskode)) return vis(besked, 'Momskoden skal se sådan ud: txcd_99999999.', 'fejl');
      if(krop.slags === 'digital') krop.skal_sendes = false;
      gemRække('produkt_variant', v.id, krop).then(function(){ vis(besked, 'Varianten er gemt.', 'god'); return hent(); })
        .catch(function(f){ vis(besked, fejltekst(f), 'fejl'); });
    })]);
    if(!v.er_standard){
      greb.appendChild(knap(v.arkiveret ? 'Genskab' : 'Arkivér', 'knap rolig lille', function(){
        gemRække('produkt_variant', v.id, { arkiveret: !v.arkiveret }).then(hent).catch(function(f){ vis(besked, fejltekst(f), 'fejl'); });
      }));
      if(!harStripe(v)) greb.appendChild(knap('Slet', 'knap fare lille', function(){
        if(!window.confirm('Slette varianten "' + v.navn + '" og dens priser?')) return;
        sletRække('produkt_variant', v.id).then(hent).catch(function(f){ vis(besked, fejltekst(f), 'fejl'); });
      }));
    }
    åben.appendChild(greb);
    åben.appendChild(besked);

    /* Priserne */
    var pboks = el('div', { klasse:'pr-priser' }, [el('h5', { tekst:'Priser' })]);
    priser.forEach(function(pr){ pboks.appendChild(prisRække(pr)); });
    pboks.appendChild(knap('Tilføj pris', 'knap rolig lille', function(){ pboks.appendChild(prisForm(v, null)); }));
    åben.appendChild(pboks);
    return åben;
  }

  function prisRække(pr){
    var g = (pr.stripe || {})[TILSTAND];
    var r = el('div', { klasse:'pr-pris' + (pr.arkiveret ? ' pr-arkiv' : '') }, [
      el('span', { klasse:'pr-prisnavn', tekst:(pr.navn || 'Uden navn') + (pr.arkiveret ? ' (arkiveret)' : pr.synlig ? '' : ' (skjult)') }),
      el('span', { tekst: prisTekst(pr) + (pr.foer_oere ? ' · før ' + kr(pr.foer_oere) : '') }),
      el('span', { klasse: g && g.pris ? 'pr-god' : 'pr-advar', tekst: g && g.pris ? 'I Stripe' : 'Ikke sendt' }),
      knap('Ret', 'knap rolig lille', function(){ r.parentNode.insertBefore(prisForm(null, pr), r.nextSibling); })
    ]);
    return r;
  }

  var PRISFELTER = [
    { n:'navn', t:'tekst', l:'Navn i ordreformularen', h:'Fx "2.995 kr." eller "Månedlig".', maks:200 },
    { n:'slags', t:'valg', l:'Betaling', valg:[['engang', 'Engangsbeløb'], ['abonnement', 'Abonnement'], ['afdrag', 'Afdrag (et fast antal betalinger)']] },
    { n:'beloeb_oere', t:'kr', l:'Beløb med moms', krav:true, h:'For abonnement og afdrag: beløbet pr. træk.' },
    { n:'interval_antal', t:'heltal', l:'Hver', vis:function(v){ return v.slags !== 'engang'; }, skjult:null },
    { n:'interval', t:'valg', l:'Interval', valg:INTERVAL, vis:function(v){ return v.slags !== 'engang'; }, skjult:null },
    { n:'antal_betalinger', t:'heltal', l:'Antal betalinger', vis:function(v){ return v.slags === 'afdrag'; } },
    { n:'opstart_oere', t:'kr', l:'Opstartsbeløb (betales ved købet)', h:'Fx madrassen: 2.995 kr. nu, appen 299 kr./år bagefter.', vis:function(v){ return v.slags !== 'engang'; }, skjult:0 },
    { n:'proeve', t:'flueben', l:'Prøveperiode før første træk', vis:function(v){ return v.slags === 'abonnement'; }, skjult:false },
    { n:'proeve_antal', t:'heltal', l:'Prøvens længde', vis:function(v){ return v.slags === 'abonnement' && v.proeve; } },
    { n:'proeve_interval', t:'valg', l:'Enhed', valg:INTERVAL, vis:function(v){ return v.slags === 'abonnement' && v.proeve; } },
    { n:'proeve_oere', t:'kr', l:'Pris for prøven (0 = gratis)', vis:function(v){ return v.slags === 'abonnement' && v.proeve; }, skjult:0 },
    { n:'foer_oere', t:'kr', l:'"Før"-pris (valgfri)', h:'Vises overstreget.' },
    { n:'kost_oere', t:'kr', l:'Kostpris (valgfri)' },
    { n:'kunde_kan_opsige', t:'flueben', l:'Kunden kan selv opsige', vis:function(v){ return v.slags !== 'engang'; }, skjult:true },
    { n:'kunde_kan_genoptage', t:'flueben', l:'Kunden kan selv genoptage', vis:function(v){ return v.slags !== 'engang'; }, skjult:true },
    { n:'noegle', t:'tekst', l:'Nøgle (valgfri, til links)', h:'Små bogstaver, tal, - og _.', maks:60 },
    { n:'synlig', t:'flueben', l:'Synlig i ordreformularen' },
    { n:'raekkefoelge', t:'heltal', l:'Rækkefølge', skjult:0 }
  ];

  function prisForm(variant, pr){
    var ny = !pr;
    var start = pr ? Object.assign({ proeve: !!pr.proeve_antal }, pr)
                   : { slags:'engang', synlig:true, kunde_kan_opsige:true, kunde_kan_genoptage:true, interval_antal:1, interval:'aar',
                       proeve_interval:'maaned', opstart_oere:0, proeve_oere:0, raekkefoelge:0 };
    var form = formular(PRISFELTER, start, 'pris' + (pr ? pr.id.slice(0, 8) : 'ny'));
    var besked = el('div', { klasse:'besked', hidden:true, role:'alert' });
    var boks = el('div', { klasse:'brud-form pr-prisform' }, [el('h5', { tekst: ny ? 'Ny pris' : 'Ret prisen' }), form.el]);
    if(pr && harStripe(pr)) boks.appendChild(el('p', { klasse:'hint', tekst:'Stripe kan ikke rette et beløb eller et interval. Ændrer du dem, laves en ny pris i Stripe, når du sender igen, og den gamle slås fra. Kunder på den gamle pris beholder den.' }));
    var greb = el('div', { klasse:'bb-linje' }, [knap(ny ? 'Opret prisen' : 'Gem prisen', 'knap lille', function(){
      var r = form.læs();
      if(r.fejl){ vis(besked, r.fejl, 'fejl'); if(r.felt && r.felt.focus) r.felt.focus(); return; }
      var v = r.værdier;
      if(v.slags !== 'engang' && (!v.interval_antal || v.interval_antal < 1)) return vis(besked, 'Skriv hvor tit der trækkes, fx hver 1 år.', 'fejl');
      if(v.slags === 'afdrag' && (!v.antal_betalinger || v.antal_betalinger < 2)) return vis(besked, 'Et afdrag skal have mindst 2 betalinger.', 'fejl');
      if(v.proeve && (!v.proeve_antal || v.proeve_antal < 1)) return vis(besked, 'Skriv prøvens længde.', 'fejl');
      if(v.noegle && !/^[a-z0-9][a-z0-9_-]{0,59}$/.test(v.noegle)) return vis(besked, 'Nøglen må kun have små bogstaver, tal, - og _.', 'fejl');
      var krop = {
        navn: v.navn || '', slags: v.slags, beloeb_oere: v.beloeb_oere,
        interval: v.slags === 'engang' ? null : v.interval, interval_antal: v.slags === 'engang' ? null : v.interval_antal,
        antal_betalinger: v.slags === 'afdrag' ? v.antal_betalinger : null,
        proeve_interval: v.proeve ? v.proeve_interval : null, proeve_antal: v.proeve ? v.proeve_antal : null,
        proeve_oere: v.proeve ? (v.proeve_oere || 0) : 0,
        opstart_oere: v.slags === 'engang' ? 0 : (v.opstart_oere || 0),
        foer_oere: v.foer_oere || null, kost_oere: v.kost_oere, kunde_kan_opsige: v.kunde_kan_opsige,
        kunde_kan_genoptage: v.kunde_kan_genoptage, noegle: v.noegle, synlig: v.synlig, raekkefoelge: v.raekkefoelge || 0
      };
      if(ny) krop.variant_id = variant.id;
      gemRække('produkt_pris', ny ? null : pr.id, krop).then(hent).catch(function(f){ vis(besked, fejltekst(f), 'fejl'); });
    }), knap('Fortryd', 'knap rolig lille', function(){ boks.remove(); })]);
    if(pr){
      greb.appendChild(knap(pr.arkiveret ? 'Genskab' : 'Arkivér', 'knap rolig lille', function(){
        gemRække('produkt_pris', pr.id, { arkiveret: !pr.arkiveret }).then(hent).catch(function(f){ vis(besked, fejltekst(f), 'fejl'); });
      }));
      if(!harStripe(pr)) greb.appendChild(knap('Slet', 'knap fare lille', function(){
        sletRække('produkt_pris', pr.id).then(hent).catch(function(f){ vis(besked, fejltekst(f), 'fejl'); });
      }));
    }
    boks.appendChild(greb); boks.appendChild(besked);
    return boks;
  }

  /* Kopiér: produkt, varianter og priser - uden Stripe, sti og SKU (de er unikke). */
  function kopiérProdukt(p, besked){
    var krop = {};
    ['beskrivelse', 'billeder', 'seo_titel', 'seo_beskrivelse', 'seo_billede', 'synlig_i_butik', 'synlig_i_kundecenter',
     'egenskaber', 'tags', 'funnel_id', 'opsigelse_url'].forEach(function(k){ krop[k] = p[k]; });
    krop.navn = p.navn + ' (kopi)';
    vis(besked, 'Kopierer …');
    gemRække('produkt', null, krop).then(function(nyP){
      return rest('produkt_variant?select=*&produkt_id=eq.' + nyP.id).then(function(nyVs){
        var nyStd = nyVs.filter(function(x){ return x.er_standard; })[0];
        var kæde = Promise.resolve();
        varianterAf(p.id).forEach(function(v){
          kæde = kæde.then(function(){
            var vk = {};
            ['navn', 'beskrivelse', 'vaerdier', 'slags', 'skal_sendes', 'vaegt', 'vaegt_enhed', 'laengde', 'bredde', 'hoejde', 'maal_enhed',
             'oprindelsesland', 'billeder', 'synlig', 'arkiveret', 'spor_lager', 'lager', 'saelg_uden_lager', 'momspligtig', 'momskode',
             'vare_id', 'filer', 'giver_app_adgang', 'fragtprofil_id', 'raekkefoelge'].forEach(function(k){ vk[k] = v[k]; });
            var mål = v.er_standard ? gemRække('produkt_variant', nyStd.id, vk) : gemRække('produkt_variant', null, Object.assign({ produkt_id:nyP.id }, vk));
            return mål.then(function(nyV){
              return Promise.all(priserAf(v.id).map(function(pr){
                var pk = { variant_id:nyV.id };
                ['navn', 'slags', 'beloeb_oere', 'foer_oere', 'kost_oere', 'interval', 'interval_antal', 'antal_betalinger', 'proeve_interval',
                 'proeve_antal', 'proeve_oere', 'opstart_oere', 'kunde_kan_opsige', 'kunde_kan_genoptage', 'synlig', 'arkiveret', 'raekkefoelge']
                  .forEach(function(k){ pk[k] = pr[k]; });
                return gemRække('produkt_pris', null, pk);
              }));
            });
          });
        });
        return kæde.then(function(){ visning.produkt = nyP.id; return hent(); });
      });
    }).catch(function(f){ vis(besked, 'Kopien blev ikke færdig: ' + fejltekst(f), 'fejl'); hent(); });
  }

  /* ---------- Fælles liste + formular (samlinger, rabatter, tags) ---------- */
  var venterBesked = null;
  function listeMedForm(rod, o){
    var top = el('div', { klasse:'pr-top' }, [el('p', { klasse:'hint', tekst:o.hint }), knap(o.ny, 'knap lille', function(){ åbn(null); })]);
    var formPlads = el('div');
    var besked = el('div', { klasse:'besked', hidden:true, role:'alert' });
    var tabel = el('table', { klasse:'pr-tabel' });
    tabel.appendChild(el('thead', {}, [el('tr', {}, o.kolonner.map(function(k){ return el('th', { tekst:k[0] }); }).concat([el('th')]))]));
    var tb = el('tbody'); tabel.appendChild(tb);
    rod.appendChild(top); rod.appendChild(formPlads); rod.appendChild(besked); rod.appendChild(el('div', { klasse:'rulle' }, [tabel]));
    if(venterBesked){ vis(besked, venterBesked, 'god'); venterBesked = null; }
    if(!o.rækker.length) tb.appendChild(el('tr', {}, [el('td', { colspan:String(o.kolonner.length + 1), klasse:'tomt', tekst:o.tom })]));
    o.rækker.forEach(function(r){
      tb.appendChild(el('tr', { klasse: o.arkiv && o.arkiv(r) ? 'pr-arkiv' : null },
        o.kolonner.map(function(k){ var c = k[1](r); return typeof c === 'string' ? el('td', { tekst:c }) : el('td', {}, [c]); })
          .concat([el('td', { klasse:'pr-greb' }, [knap('Ret', 'knap rolig lille', function(){ åbn(r); })])])));
    });
    function åbn(r){
      tøm(formPlads);
      var form = formular(o.felter(r), r || o.start, o.id + (r ? r.id.slice(0, 8) : 'ny'));
      var fb = el('div', { klasse:'besked', hidden:true, role:'alert' });
      var boks = el('div', { klasse:'brud-form' }, [el('h4', { tekst: r ? 'Ret' : o.ny }), form.el]);
      if(o.advarsel && r) { var a = o.advarsel(r); if(a) boks.appendChild(el('p', { klasse:'hint', tekst:a })); }
      var gemKnap = knap('Gem', 'knap lille', function(){
        var l = form.læs();
        if(l.fejl){ vis(fb, l.fejl, 'fejl'); if(l.felt && l.felt.focus) l.felt.focus(); return; }
        var krop = o.krop ? o.krop(l.værdier, r) : l.værdier;
        if(typeof krop === 'string') return vis(fb, krop, 'fejl');
        gemKnap.disabled = true;
        vis(fb, 'Gemmer …');
        gemRække(o.tabel, r ? r.id : null, krop).then(function(gemt){
          tøm(formPlads);
          /* hent() tegner fanen forfra; beskeden vises i den nye tegning. */
          venterBesked = (r ? 'Gemt.' : 'Oprettet.') + (o.efterGem ? ' ' + o.efterGem : '');
          return hent();
        }).catch(function(f){ gemKnap.disabled = false; vis(fb, fejltekst(f), 'fejl'); });
      });
      var greb = el('div', { klasse:'bb-linje' }, [gemKnap, knap('Fortryd', 'knap rolig lille', function(){ tøm(formPlads); })]);
      if(r && o.stripe) greb.appendChild(stripeKnap(o.stripe, r.id, fb));
      if(r && (!o.kanSlette || o.kanSlette(r))) greb.appendChild(knap('Slet', 'knap fare lille', function(){
        if(!window.confirm('Slette den?')) return;
        sletRække(o.tabel, r.id).then(function(){ tøm(formPlads); return hent(); }).catch(function(f){ vis(fb, fejltekst(f), 'fejl'); });
      }));
      boks.appendChild(greb); boks.appendChild(fb);
      formPlads.appendChild(boks);
      var første = boks.querySelector('input,select,textarea'); if(første) første.focus();
    }
  }

  function produktValg(){ return data.produkter.filter(function(p){ return !p.arkiveret; }).map(function(p){ return [p.id, p.navn]; }); }

  function tegnSamlinger(rod){
    listeMedForm(rod, {
      id:'s', tabel:'produktsamling', ny:'Opret samling', tom:'Ingen samlinger endnu.',
      hint:'Grupper af produkter, fx til butikken eller en rabat ("alle madrasser").',
      rækker: data.samlinger, start:{ sortering:'manuelt', synlig_i_butik:true, produkter:[] },
      kolonner:[['Samling', function(s){ return s.navn; }], ['Produkter', function(s){ return String((s.produkter || []).length); }],
                ['Synlig', function(s){ return s.synlig_i_butik ? 'I butikken' : 'Skjult'; }]],
      felter:function(){ return [
        { n:'navn', t:'tekst', l:'Navn', krav:true, maks:200 },
        { n:'beskrivelse', t:'rigtekst', l:'Beskrivelse', bred:true },
        { n:'billede', t:'tekst', l:'Billede (https://…)', maks:500 },
        { n:'produkter', t:'flervalg', l:'Produkter', valg:produktValg },
        { n:'sortering', t:'valg', l:'Sortering', valg:[['manuelt','Manuelt'], ['navn_op','Navn A–Å'], ['navn_ned','Navn Å–A'], ['pris_op','Pris lav–høj'],
          ['pris_ned','Pris høj–lav'], ['tilfoejet_ny','Senest tilføjet først'], ['tilfoejet_gammel','Først tilføjet først'],
          ['oprettet_ny','Nyeste produkter først'], ['oprettet_gammel','Ældste produkter først']] },
        { n:'synlig_i_butik', t:'flueben', l:'Synlig i butikken' },
        { n:'seo_titel', t:'tekst', l:'SEO-titel', maks:60 },
        { n:'seo_beskrivelse', t:'tekstfelt', l:'SEO-beskrivelse', rækker:2 },
        { n:'seo_billede', t:'tekst', l:'Delingsbillede (https://…)', maks:500 }
      ]; }
    });
  }

  function rabatTekst(r){
    var t = r.metode === 'procent' ? String(Number(r.procent)).replace('.', ',') + ' %'
          : r.metode === 'beloeb' ? kr(r.beloeb_oere) : 'Fri fragt';
    return t + (r.gaelder === 'alle' ? '' : ' på udvalgte ' + ({ produkter:'produkter', varianter:'varianter', samlinger:'samlinger' })[r.gaelder]);
  }

  function tegnRabatter(rod){
    listeMedForm(rod, {
      id:'r', tabel:'rabat', ny:'Opret rabat', stripe:'rabat', tom:'Ingen rabatter endnu.',
      hint:'Rabatter gælder det, der betales ved købet (fx madrassen og tilvalg) — ikke abonnementets fornyelser. Send en rabat til Stripe, før den kan bruges.',
      efterGem:'Tryk "Ret" → "Send til Stripe (test)", så den virker på betalingssiden.',
      rækker: data.rabatter, start:{ slags:'kode', metode:'procent', gaelder:'alle', produkt_ids:[], variant_ids:[], samling_ids:[] },
      arkiv:function(r){ return r.udloebet || (r.til && Date.parse(r.til) < Date.now()); },
      kanSlette:function(r){ return !harStripe(r); },
      advarsel:function(r){ return harStripe(r) ? 'Stripe kan ikke rette en kode eller et beløb. Ændrer du andet end navn og "Udløbet", laves rabatten om i Stripe, når du sender igen.' : null; },
      kolonner:[['Rabat', function(r){ return r.navn + (r.kode ? ' · ' + r.kode : ''); }],
                ['Slags', function(r){ return ({ kode:'Kode', automatisk:'Automatisk', udsalg:'Udsalg' })[r.slags]; }],
                ['Rabat', rabatTekst],
                ['Periode', function(r){ return dato(r.fra) + ' – ' + (r.til ? dato(r.til) : 'ingen slut'); }],
                ['Stripe', function(r){ var g = (r.stripe || {})[TILSTAND]; return r.metode === 'fri_fragt' ? '—' : g && g.kupon ? 'I Stripe' : 'Ikke sendt'; }]],
      felter:function(){ return [
        { n:'navn', t:'tekst', l:'Internt navn', krav:true, maks:120 },
        { n:'slags', t:'valg', l:'Type', valg:[['kode','Kode, kunden skriver'], ['automatisk','Automatisk i ordreformularen'], ['udsalg','Udsalg (vises som nedsat pris)']] },
        { n:'kode', t:'tekst', l:'Kode', h:'Store bogstaver og tal, 3–30 tegn. Fx JUL25.', maks:30, vis:function(v){ return v.slags === 'kode'; } },
        { n:'metode', t:'valg', l:'Rabat', valg:[['procent','Procent'], ['beloeb','Fast beløb'], ['fri_fragt','Fri fragt']] },
        { n:'procent', t:'tal', l:'Procent', vis:function(v){ return v.metode === 'procent'; } },
        { n:'beloeb_oere', t:'kr', l:'Beløb med moms', vis:function(v){ return v.metode === 'beloeb'; } },
        { n:'gaelder', t:'valg', l:'Gælder', valg:[['alle','Alle produkter'], ['produkter','Bestemte produkter'], ['varianter','Bestemte varianter'], ['samlinger','Bestemte samlinger']] },
        { n:'produkt_ids', t:'flervalg', l:'Produkter', valg:produktValg, vis:function(v){ return v.gaelder === 'produkter'; }, skjult:[] },
        { n:'variant_ids', t:'flervalg', l:'Varianter', valg:function(){
            return data.varianter.filter(function(v){ return !v.arkiveret; }).map(function(v){ var p = produktAf(v.produkt_id); return [v.id, (p ? p.navn : '') + (v.er_standard ? '' : ' · ' + v.navn)]; }); },
          vis:function(v){ return v.gaelder === 'varianter'; }, skjult:[] },
        { n:'samling_ids', t:'flervalg', l:'Samlinger', valg:function(){ return data.samlinger.map(function(s){ return [s.id, s.navn]; }); }, vis:function(v){ return v.gaelder === 'samlinger'; }, skjult:[] },
        { n:'fra', t:'dato', l:'Gælder fra (tom = nu)' },
        { n:'til', t:'dato', l:'Gælder til og med (valgfri)' },
        { n:'min_koeb_oere', t:'kr', l:'Minimumskøb (valgfrit)' },
        { n:'maks_antal', t:'heltal', l:'Maks. antal brug i alt (valgfrit)' },
        { n:'en_pr_kunde', t:'flueben', l:'Én gang pr. kunde (mailadresse)' },
        { n:'udloebet', t:'flueben', l:'Udløbet (slået fra)' },
        { n:'note', t:'tekstfelt', l:'Note', rækker:2, tom:'' }
      ]; },
      krop:function(v){
        if(v.slags === 'kode'){ v.kode = (v.kode || '').toUpperCase(); if(!/^[A-Z0-9][A-Z0-9_-]{2,29}$/.test(v.kode)) return 'Koden skal være 3–30 tegn: store bogstaver, tal, - og _.'; }
        else v.kode = null;
        if(v.metode === 'procent' && !(v.procent > 0 && v.procent <= 100)) return 'Procenten skal være over 0 og højst 100.';
        if(v.metode === 'beloeb' && !(v.beloeb_oere > 0)) return 'Skriv beløbet i kroner.';
        if(v.metode !== 'procent') v.procent = null;
        if(v.metode !== 'beloeb') v.beloeb_oere = null;
        if(!v.fra) delete v.fra;
        else v.fra = new Date(new Date(v.fra).toISOString().slice(0, 10) + 'T00:00:00').toISOString();
        if(v.til && v.fra && Date.parse(v.til) <= Date.parse(v.fra)) return 'Slutdatoen skal ligge efter startdatoen.';
        if(v.maks_antal !== null && v.maks_antal < 1) return 'Maks. antal skal være over 0.';
        ['produkt_ids', 'variant_ids', 'samling_ids'].forEach(function(k){ if(!v[k]) v[k] = []; });
        if(v.gaelder !== 'alle' && !v[{ produkter:'produkt_ids', varianter:'variant_ids', samlinger:'samling_ids' }[v.gaelder]].length) return 'Vælg mindst én, rabatten gælder.';
        return v;
      }
    });
  }

  function tegnTags(rod){
    listeMedForm(rod, {
      id:'t', tabel:'produkt_tag', ny:'Opret tag', tom:'Ingen tags endnu.',
      hint:'Mærker til at holde styr på produkterne (fx "Madras", "Tilbehør", "Gave").',
      rækker: data.tags, start:{ farve:'#8e4333' },
      kolonner:[['Tag', function(t){ return el('span', { klasse:'pr-tag', style:'--tagfarve:' + t.farve, tekst:t.navn }); }],
                ['Produkter', function(t){ return String(data.produkter.filter(function(p){ return (p.tags || []).indexOf(t.id) >= 0; }).length); }]],
      felter:function(){ return [{ n:'navn', t:'tekst', l:'Navn', krav:true, maks:60 }, { n:'farve', t:'farve', l:'Farve' }]; }
    });
  }

  /* ---------- Fragt: profiler → zoner → satser ---------- */
  function tegnFragt(rod){
    rod.appendChild(el('div', { klasse:'pr-top' }, [
      el('p', { klasse:'hint', tekst:'En fragtprofil samler de varianter, der sendes på samme måde. Zonerne siger hvilke lande, satserne hvad det koster. Kunden ser satserne for sit land i ordreformularen.' }),
      knap('Opret fragtprofil', 'knap lille', function(){
        var n = window.prompt('Fragtprofilens navn'); if(!n || !n.trim()) return;
        gemRække('fragtprofil', null, { navn:n.trim() }).then(hent).catch(function(f){ status(fejltekst(f), 'fejl'); });
      })
    ]));
    data.profiler.forEach(function(pf){
      var antal = data.varianter.filter(function(v){ return v.fragtprofil_id === pf.id; }).length;
      var kort = el('section', { klasse:'db-kort pr-kort' }, [el('h4', { tekst: pf.navn + (pf.standard ? ' (standard)' : '') }),
        el('p', { klasse:'hint', tekst: antal + ' variant(er) bruger profilen.' })]);
      var besked = el('div', { klasse:'besked', hidden:true, role:'alert' });
      var greb = el('div', { klasse:'bb-linje' }, [
        knap('Omdøb', 'knap rolig lille', function(){ var n = window.prompt('Nyt navn', pf.navn); if(n && n.trim()) gemRække('fragtprofil', pf.id, { navn:n.trim() }).then(hent).catch(function(f){ vis(besked, fejltekst(f), 'fejl'); }); }),
        knap('Tilføj zone', 'knap rolig lille', function(){
          var n = window.prompt('Zonens navn (fx Danmark)'); if(!n || !n.trim()) return;
          var l = window.prompt('Lande, to bogstaver adskilt med komma (fx DK eller SE, NO, FI)', 'DK'); if(l === null) return;
          var lande = l.toUpperCase().split(/[,\s]+/).filter(Boolean);
          if(lande.some(function(x){ return !/^[A-Z]{2}$/.test(x); })) return vis(besked, 'Landene skal være to bogstaver, fx DK.', 'fejl');
          gemRække('fragtzone', null, { profil_id:pf.id, navn:n.trim(), lande:lande }).then(hent).catch(function(f){ vis(besked, fejltekst(f), 'fejl'); });
        })
      ]);
      if(!pf.standard && !antal) greb.appendChild(knap('Slet', 'knap fare lille', function(){
        if(window.confirm('Slette profilen "' + pf.navn + '"?')) sletRække('fragtprofil', pf.id).then(hent).catch(function(f){ vis(besked, fejltekst(f), 'fejl'); });
      }));
      kort.appendChild(greb); kort.appendChild(besked);
      data.zoner.filter(function(z){ return z.profil_id === pf.id; }).forEach(function(z){
        var zb = el('div', { klasse:'pr-zone' }, [el('h5', { tekst: z.navn + ' · ' + ((z.lande || []).join(', ') || (z.resten_af_verden ? 'resten af verden' : 'ingen lande')) })]);
        data.satser.filter(function(s){ return s.zone_id === z.id; }).forEach(function(s){
          zb.appendChild(el('div', { klasse:'pr-pris' }, [
            el('span', { klasse:'pr-prisnavn', tekst:s.navn }),
            el('span', { tekst: (s.pris_oere ? kr(s.pris_oere) : 'Gratis') + (s.gratis_over_oere ? ' · gratis over ' + kr(s.gratis_over_oere) : '') }),
            knap('Ret', 'knap rolig lille', function(){ satsForm(zb, z, s); })
          ]));
        });
        zb.appendChild(el('div', { klasse:'bb-linje' }, [
          knap('Tilføj sats', 'knap rolig lille', function(){ satsForm(zb, z, null); }),
          knap('Ret lande', 'knap rolig lille', function(){
            var l = window.prompt('Lande, to bogstaver adskilt med komma', (z.lande || []).join(', ')); if(l === null) return;
            var lande = l.toUpperCase().split(/[,\s]+/).filter(Boolean);
            if(lande.some(function(x){ return !/^[A-Z]{2}$/.test(x); })) return vis(besked, 'Landene skal være to bogstaver, fx DK.', 'fejl');
            gemRække('fragtzone', z.id, { lande:lande }).then(hent).catch(function(f){ vis(besked, fejltekst(f), 'fejl'); });
          }),
          knap('Slet zone', 'knap fare lille', function(){ if(window.confirm('Slette zonen "' + z.navn + '" og dens satser?')) sletRække('fragtzone', z.id).then(hent).catch(function(f){ vis(besked, fejltekst(f), 'fejl'); }); })
        ]));
        kort.appendChild(zb);
      });
      rod.appendChild(kort);
    });
  }
  function satsForm(holder, z, s){
    var form = formular([
      { n:'navn', t:'tekst', l:'Navn', krav:true, maks:120, h:'Fx "Gratis levering" eller "GLS til pakkeshop".' },
      { n:'pris_oere', t:'kr', l:'Pris med moms (0 = gratis)' },
      { n:'gratis_over_oere', t:'kr', l:'Gratis ved køb over (valgfrit)' },
      { n:'raekkefoelge', t:'heltal', l:'Rækkefølge' }
    ], s || { pris_oere:0, raekkefoelge:0 }, 'sats' + (s ? s.id.slice(0, 8) : 'ny'));
    var fb = el('div', { klasse:'besked', hidden:true, role:'alert' });
    var boks = el('div', { klasse:'brud-form' }, [form.el, fb]);
    var greb = el('div', { klasse:'bb-linje' }, [knap('Gem satsen', 'knap lille', function(){
      var l = form.læs();
      if(l.fejl) return vis(fb, l.fejl, 'fejl');
      var k = l.værdier; k.pris_oere = k.pris_oere || 0; k.raekkefoelge = k.raekkefoelge || 0;
      if(!s) k.zone_id = z.id;
      gemRække('fragtsats', s ? s.id : null, k).then(hent).catch(function(f){ vis(fb, fejltekst(f), 'fejl'); });
    }), knap('Fortryd', 'knap rolig lille', function(){ boks.remove(); })]);
    if(s) greb.appendChild(knap('Slet', 'knap fare lille', function(){ sletRække('fragtsats', s.id).then(hent).catch(function(f){ vis(fb, fejltekst(f), 'fejl'); }); }));
    boks.insertBefore(greb, fb);
    holder.appendChild(boks);
  }

  /* ---------- Start ---------- */
  function bind(){
    $('pr-faner').addEventListener('click', function(e){
      var k = e.target.closest('[data-pf]'); if(!k) return;
      visning.fane = k.getAttribute('data-pf');
      if(visning.fane !== 'produkter') visning.produkt = null;
      tegn();
    });
  }

  window.ArytmiProdukter = {
    vis: function(a){
      api = a;
      if(!startet){ startet = true; bind(); }
      hent();
    },
    /* Til tests uden en browser. */
    _prisTekst: prisTekst, _læsKr: læsKr
  };
})();
