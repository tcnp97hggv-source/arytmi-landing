/* =============================================================
   SIDER & FUNNELS — ARYTMIS EGEN SIDEBYGGER (9/11)
   =============================================================

   Kennet 9/11: ClickFunnels skal erstattes af Arytmis egen platform i
   bagrummet. Planen: `docs/egen-funnel-platform.md` i app-repoet.

   OPBYGNING (Kennet 9/11, "sådan noget her" med skærmbilleder af
   ClickFunnels): samme arbejdsgang - en LISTE over funnels med tal, en
   FUNNEL som en lodret række trin med "+" imellem, og en EDITOR med trinene
   til venstre, siden i midten og et dansk panel til højre for det, der er
   valgt, med det tekniske under "Avanceret". Udseendet er Arytmis eget;
   intet er taget fra ClickFunnels' kode eller design.

   EDITOREN er GrapesJS 0.23.8 (BSD-3) i `vendor/grapesjs/`, hentet først,
   når en side åbnes. Ikke fra et CDN (`script-src 'self'`).

   DATA: `funnel`, `side`, `side_version` (0079), tallene fra
   `sidernes_tal()` (0080). Kun bekræftet admin; serveren afgør det.

   Siden bygger DOM med textContent og createElement, ikke innerHTML, som
   resten af bagrummet. Miniaturerne er iframes med `sandbox` (intet script).
   ============================================================= */
(function(){
  'use strict';

  var api = null;            /* json, rpc, kaldRaa, PROJEKT_URL, forklar */
  var startet = false;
  var funnels = [], sider = [], tal = {};
  var domæner = [], splitTal = [];   /* 0084: domæner med forside/404/kode, visninger pr. variant */
  var STANDARD = 'afsted.arytmi.com';
  var visning = { hvad:'liste', fane:'alle', søg:'', funnel:null };
  var editor = null, åbenSide = null, ændret = false;
  var SPAND = 'sidebilleder';
  var GRAPES = 'vendor/grapesjs/';

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
  var SVGNS = 'http://www.w3.org/2000/svg';
  function ikon(d, str){
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', 'sf-ik');
    if(str) s.setAttribute('style', 'width:' + str + 'px;height:' + str + 'px');
    [].concat(d).forEach(function(x){
      var p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', x); s.appendChild(p);
    });
    return s;
  }
  var IK = {
    tilbage:'M15 5l-7 7 7 7', plus:'M12 5v14M5 12h14', øje:['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z','M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
    kopi:['M9 9h10v10H9z','M5 15V5h10'], tandhjul:['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z','M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z'],
    arkiv:['M4 7h16v13H4z','M3 3h18v4H3z','M10 11h4'], prikker:['M12 5h.01','M12 12h.01','M12 19h.01'],
    computer:['M3 5h18v11H3z','M8 20h8','M12 16v4'], tablet:['M6 3h12v18H6z','M11 18h2'], mobil:['M8 3h8v18H8z','M11 18h2'],
    fortryd:'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3', gentag:'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
    tal:['M4 20V10','M10 20V4','M16 20v-7','M22 20H2'], flag:['M5 21V4','M5 4h11l-2 4 2 4H5'], tragt:'M3 4h18l-7 9v6l-4 2v-8Z',
    op:'M12 19V5M6 11l6-6 6 6', ned:'M12 5v14M6 13l6 6 6-6', skrald:['M4 7h16','M9 7V4h6v3','M6 7l1 13h10l1-13'],
    blyant:'M4 20l1-4L16 5l3 3L8 19Z', lag:['M12 3 3 8l9 5 9-5-9-5Z','M3 13l9 5 9-5'], tilføj:['M4 4h7v7H4z','M13 4h7v7h-7z','M4 13h7v7H4z','M16.5 13v7M13 16.5h7']
  };
  function dato(t){
    if(!t) return '';
    var d = new Date(t);
    return d.toLocaleDateString('da-DK', { day:'numeric', month:'short' }) + ' ' +
           d.toLocaleTimeString('da-DK', { hour:'2-digit', minute:'2-digit' });
  }
  function siden(t){
    if(!t) return '';
    var s = (Date.now() - new Date(t).getTime()) / 1000;
    if(s < 90) return 'lige nu';
    if(s < 3600) return Math.round(s / 60) + ' min. siden';
    if(s < 86400) return Math.round(s / 3600) + ' timer siden';
    var d = Math.round(s / 86400);
    return d === 1 ? 'i går' : d + ' dage siden';
  }
  function heltal(n){ return (n || 0).toLocaleString('da-DK'); }

  /* Stien må kun have a-z, 0-9, bindestreg og skråstreg (0079). Æ, ø og å
     skrives om - ClickFunnels' "/arytmi-efterårsferie-page" viste hvorfor. */
  function tilSti(t){
    t = String(t || '').toLowerCase()
      .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9/]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return '/' + t.replace(/^\/+/, '');
  }

  function status(tekst, slags){
    var s = $('sider-status'); if(!s) return;
    s.className = 'status' + (slags ? ' ' + slags : '');
    s.textContent = tekst || '';
  }
  function fejl(f){
    if(f && f.kode === '23505') return status('Adressen bruges allerede af en anden side.', 'fejl');
    status(api.forklar(f), 'fejl');
  }

  /* ---------- Miniaturen: siden selv, skaleret ned ----------
     Et billede af siden ville kræve, at nogen tog et skærmbillede. En iframe
     med sidens egen html viser altid den aktuelle kladde. `sandbox` uden
     tilladelser: intet script, ingen formularer, ingen navigation. */
  function miniature(s, bredde){
    bredde = bredde || 120;
    var boks = el('div', { klasse:'sf-mini', style:'width:' + bredde + 'px;height:' + Math.round(bredde * .66) + 'px' });
    var html = s && (s.kladde_html || s.udgivet_html);
    if(!html){ boks.appendChild(el('span', { klasse:'sf-mini-tom', tekst:'Tom side' })); return boks; }
    var skala = bredde / 1280;
    var f = el('iframe', { sandbox:'', tabindex:'-1', 'aria-hidden':'true', title:'' });
    f.style.width = '1280px'; f.style.height = Math.round(1280 * .66) + 'px';
    f.style.transform = 'scale(' + skala + ')';
    f.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>' + RUNTIME_CSS + (s.kladde_css || s.udgivet_css || '') +
               'body{overflow:hidden}</style></head><body>' + html + '</body></html>';
    boks.appendChild(f);
    /* Skaleres efter den bredde, miniaturen faktisk får på skærmen. */
    if(window.ResizeObserver){
      new ResizeObserver(function(p){ var w = p[0].contentRect.width; if(w > 0) f.style.transform = 'scale(' + (w / 1280) + ')'; }).observe(boks);
    }
    return boks;
  }

  /* ---------- Modalen: i stedet for browserens prompt() ---------- */
  /* Felttyper: text (standard), number, url, textarea, kode, afkryds, valg,
     billede (adresse + upload), skabelon, overskrift (kun en titel). */
  function modal(titel, felter, knaptekst, ekstra, bred){
    return new Promise(function(ja){
      var d = el('dialog', { klasse:'sf-modal' + (bred ? ' sf-modal-bred' : '') });
      var form = el('form', { method:'dialog' });
      form.appendChild(el('h3', { tekst:titel }));
      var input = {};
      felter.forEach(function(f){
        if(f.type === 'overskrift'){
          form.appendChild(el('h4', { klasse:'sf-m-overskrift', tekst:f.label }));
          if(f.hjælp) form.appendChild(el('p', { klasse:'sf-m-hjælp', tekst:f.hjælp }));
          return;
        }
        var id = 'sfm-' + f.navn;
        var felt;
        if(f.type === 'afkryds'){
          felt = el('input', { id:id, type:'checkbox' }); felt.checked = !!f.værdi;
          input[f.navn] = felt;
          form.appendChild(el('div', { klasse:'sf-m-felt sf-m-afkryds' }, [
            el('label', { for:id }, [ felt, el('span', { tekst:f.label }) ]), f.hjælp ? el('small', { tekst:f.hjælp }) : null ]));
          return;
        }
        if(f.type === 'billede'){
          felt = el('input', { id:id, type:'url', placeholder:'https://…', autocomplete:'off' });
          felt.value = f.værdi || '';
          var fil = el('input', { type:'file', accept:'image/png,image/jpeg,image/webp,image/svg+xml,image/gif', hidden:true });
          var vis = el('img', { klasse:'sf-m-billede', alt:'' });
          var opdater = function(){ vis.hidden = !felt.value; if(felt.value) vis.src = felt.value; };
          fil.addEventListener('change', function(){
            if(!fil.files[0]) return;
            uploadFil(fil.files[0]).then(function(u){ felt.value = u; opdater(); }).catch(function(e){ alert(e.message); });
          });
          felt.addEventListener('input', opdater);
          input[f.navn] = felt;
          form.appendChild(el('div', { klasse:'sf-m-felt' }, [ el('label', { for:id, tekst:f.label }),
            el('div', { klasse:'sf-m-billedrække' }, [ vis, felt,
              el('button', { type:'button', klasse:'knap rolig lille', tekst:'Læg op …', klik:function(){ fil.click(); } }), fil ]),
            f.hjælp ? el('small', { tekst:f.hjælp }) : null ]));
          opdater();
          return;
        }
        if(f.type === 'valg'){
          felt = el('select', { id:id });
          f.muligheder.forEach(function(m){
            var o = el('option', { value:m[0], tekst:m[1] });
            if(String(f.værdi) === String(m[0])) o.selected = true;
            felt.appendChild(o);
          });
          input[f.navn] = felt;
          form.appendChild(el('div', { klasse:'sf-m-felt' }, [ el('label', { for:id, tekst:f.label }), felt, f.hjælp ? el('small', { tekst:f.hjælp }) : null ]));
          return;
        }
        if(f.type === 'kode') felt = el('textarea', { id:id, rows:f.rader || 6, spellcheck:'false', klasse:'sf-kode', wrap:'off' });
        else if(f.type === 'textarea') felt = el('textarea', { id:id, rows:f.rader || 4, spellcheck:'false' });
        else if(f.type === 'skabelon'){
          felt = el('div', { klasse:'sf-skabeloner', role:'radiogroup' });
          SKABELONER.forEach(function(sk, i){
            var r = el('label', { klasse:'sf-skabelon' }, [
              el('input', { type:'radio', name:'skabelon', value:sk.id, checked: i === (f.valgt || 0) }),
              el('span', { klasse:'sf-sk-billede' }, [ miniature({ kladde_html:sk.html, kladde_css:BASIS_CSS + sk.css }, 150) ]),
              el('b', { tekst:sk.navn }), el('small', { tekst:sk.om })
            ]);
            felt.appendChild(r);
          });
        }
        else felt = el('input', { id:id, type:f.type || 'text', autocomplete:'off', spellcheck:'false' });
        if(f.værdi !== undefined && felt.value !== undefined) felt.value = f.værdi;
        input[f.navn] = felt;
        form.appendChild(el('div', { klasse:'sf-m-felt' }, [
          f.type === 'skabelon' ? el('span', { klasse:'sf-m-label', tekst:f.label }) : el('label', { for:id, tekst:f.label }),
          felt, f.hjælp ? el('small', { tekst:f.hjælp }) : null
        ]));
      });
      if(ekstra) ekstra(input, form);
      var fejlLinje = el('p', { klasse:'sf-m-fejl', role:'alert' });
      form.appendChild(fejlLinje);
      var ok = el('button', { type:'submit', klasse:'knap', value:'ok', tekst:knaptekst || 'Gem' });
      form.appendChild(el('div', { klasse:'sf-m-knapper' }, [
        el('button', { type:'button', klasse:'knap rolig', tekst:'Annullér', klik:function(){ d.close(''); } }), ok
      ]));
      d.appendChild(form);
      document.body.appendChild(d);
      d.addEventListener('close', function(){
        var v = null;
        if(d.returnValue === 'ok'){
          v = {};
          for(var k in input){
            if(input[k].classList && input[k].classList.contains('sf-skabeloner')){
              var r = input[k].querySelector('input:checked'); v[k] = r ? r.value : 'tom';
            } else if(input[k].type === 'checkbox') v[k] = input[k].checked;
            else v[k] = input[k].value;
          }
        }
        d.remove(); ja(v);
      });
      d.showModal();
      var første = form.querySelector('input:not([type=radio]),textarea'); if(første) første.focus();
    });
  }

  /* =============================================================
     DATA
     ============================================================= */
  function hent(){
    status('Henter …');
    return Promise.all([
      api.json('/rest/v1/funnel?select=*&order=arkiveret.asc,opdateret.desc'),
      api.json('/rest/v1/side?select=id,funnel_id,variant_af,split_vaegt,raekkefoelge,navn,sti,seo_titel,seo_beskrivelse,custom_css,kladde_html,kladde_css,udgivet_version,udgivet_kl,opdateret&order=raekkefoelge.asc,oprettet.asc'),
      api.rpc('sidernes_tal', { p_dage:30 }).catch(function(){ return []; }),
      /* 0084. Mangler migrationen endnu, er listerne bare tomme. */
      api.json('/rest/v1/domaene?select=*&order=navn.asc').catch(function(){ return []; }),
      api.rpc('split_tal', { p_dage:30 }).catch(function(){ return []; }),
      /* 0085: produkterne til ordreformularens valg (sider-elementer.js). */
      api.json('/rest/v1/produkt?select=id,navn&arkiveret=eq.false&order=navn.asc').catch(function(){ return []; })
    ]).then(function(r){
      window.ArytmiProduktValg = (r[5] || []).map(function(p){ return [p.id, p.navn]; });
      funnels = r[0] || []; sider = r[1] || [];
      domæner = r[3] || []; splitTal = r[4] || [];
      tal = {}; (r[2] || []).forEach(function(x){ tal[x.sti] = Number(x.visninger) || 0; });
      status('');
      tegn();
    }).catch(fejl);
  }
  /* Et trins B-variant (split-test, 0083) er en side for sig, men ikke et trin i rækken. */
  function trinI(f){ return sider.filter(function(s){ return !s.variant_af && (f ? s.funnel_id === f.id : !s.funnel_id); }); }
  function variantAf(s){ return sider.filter(function(x){ return x.variant_af === s.id; })[0] || null; }
  function erLive(trin){ return trin.some(function(s){ return s.udgivet_version > 0; }); }
  function visninger(trin){ return trin.reduce(function(n, s){ return n + (tal[s.sti] || 0); }, 0); }

  function tegn(){
    var rod = $('sider-liste'); tøm(rod);
    if(visning.hvad === 'skabeloner') return rod.appendChild(skabelonVisning());
    if(visning.hvad === 'domæner') return rod.appendChild(domæneVisning());
    if(visning.hvad === 'indstillinger'){
      var fi = funnels.filter(function(x){ return x.id === visning.funnel; })[0];
      if(fi) return rod.appendChild(indstillingsVisning(fi));
      visning.hvad = 'liste';
    }
    if(visning.hvad === 'funnel'){
      var f = funnels.filter(function(x){ return x.id === visning.funnel; })[0];
      if(f || visning.funnel === 'løse') return rod.appendChild(funnelVisning(f || null));
      visning.hvad = 'liste';
    }
    rod.appendChild(listeVisning());
  }

  /* =============================================================
     LISTEN OVER FUNNELS
     ============================================================= */
  function listeVisning(){
    var boks = el('div', { klasse:'sf-liste' });
    var top = el('div', { klasse:'sf-liste-top' }, [
      el('div', { klasse:'sf-faner', role:'tablist' }, [
        el('button', { type:'button', role:'tab', 'aria-selected':String(visning.fane === 'alle'), tekst:'Alle', klik:function(){ visning.fane = 'alle'; tegn(); } }),
        el('button', { type:'button', role:'tab', 'aria-selected':String(visning.fane === 'arkiv'), tekst:'Arkiveret', klik:function(){ visning.fane = 'arkiv'; tegn(); } })
      ]),
      el('div', { klasse:'sf-knaprække' }, [
        el('button', { type:'button', klasse:'knap rolig', klik:function(){ visning.hvad = 'domæner'; tegn(); window.scrollTo(0, 0); } }, [ ikon(IK.tandhjul, 16), ' Domæner' ]),
        el('button', { type:'button', klasse:'knap rolig', klik:importér }, [ ikon(IK.kopi, 16), ' Hent funnel fra fil' ]),
        el('button', { type:'button', klasse:'knap', klik:nyFunnel }, [ ikon(IK.plus, 16), ' Opret funnel' ])
      ])
    ]);
    boks.appendChild(top);
    var søg = el('input', { type:'search', klasse:'sf-søg', placeholder:'Søg i funnels …', 'aria-label':'Søg i funnels' });
    søg.value = visning.søg;
    søg.addEventListener('input', function(){ visning.søg = søg.value; tegnRækker(); });
    boks.appendChild(søg);

    var tabel = el('table', { klasse:'sf-tabel' });
    tabel.appendChild(el('thead', {}, [ el('tr', {}, [
      el('th', { colspan:'2', tekst:'Navn' }), el('th', { tekst:'Trin' }), el('th', { tekst:'Sidevisninger', title:'Seneste 30 dage' }),
      el('th', { tekst:'Tilmeldinger', title:'Kommer med formularerne' }), el('th', { tekst:'Salg', title:'Kommer med egen checkout' }),
      el('th', { tekst:'Ordrer', title:'Kommer med egen checkout' }), el('th', {})
    ]) ]));
    var tb = el('tbody'); tabel.appendChild(tb);
    boks.appendChild(el('div', { klasse:'sf-rulle' }, [ tabel ]));
    var fod = el('p', { klasse:'sf-fod' });
    boks.appendChild(fod);

    function tegnRækker(){
      tøm(tb);
      var q = visning.søg.trim().toLowerCase();
      var vis = funnels.filter(function(f){
        return (visning.fane === 'arkiv') === !!f.arkiveret && (!q || f.navn.toLowerCase().indexOf(q) >= 0);
      });
      vis.forEach(function(f){ tb.appendChild(funnelRække(f)); });
      var løse = trinI(null);
      if(visning.fane === 'alle' && løse.length && (!q || 'løse sider'.indexOf(q) >= 0)) tb.appendChild(funnelRække(null));
      if(!tb.firstChild) tb.appendChild(el('tr', {}, [ el('td', { colspan:'8', klasse:'tomt',
        tekst: visning.fane === 'arkiv' ? 'Ingen arkiverede funnels.' : (q ? 'Ingen funnels passer på søgningen.' : 'Ingen funnels endnu. Tryk "Opret funnel".') }) ]));
      fod.textContent = 'Sidevisninger er de seneste 30 dage fra Arytmis egen tæller. Tilmeldinger, salg og ordrer kommer med formularerne og den egne checkout.';
    }
    tegnRækker();
    return boks;
  }

  function funnelRække(f){
    var trin = trinI(f);
    var live = erLive(trin);
    var åbn = function(){ visning.hvad = 'funnel'; visning.funnel = f ? f.id : 'løse'; tegn(); window.scrollTo(0, 0); };
    var adresse = f ? 'https://' + f.domaene + (trin[0] ? trin[0].sti : '') : 'Sider uden funnel';
    var r = el('tr', { klasse:'sf-række' }, [
      el('td', { klasse:'sf-t-mini' }, [ el('button', { type:'button', klasse:'sf-mini-knap', 'aria-label':'Åbn', klik:åbn }, [ miniature(trin[0], 96) ]) ]),
      el('td', { klasse:'sf-t-navn' }, [
        el('div', {}, [
          el('button', { type:'button', klasse:'sf-link', tekst: f ? f.navn : 'Løse sider', klik:åbn }),
          el('span', { klasse:'sf-maerke' + (live ? ' god' : ''), tekst: live ? 'Live' : 'Kladde' })
        ]),
        el('div', { klasse:'sf-url', tekst:adresse }),
        f ? el('div', { klasse:'sf-dato', tekst:'Opdateret ' + siden(f.opdateret) }) : null
      ]),
      el('td', { 'data-l':'Trin' }, [ ikon(IK.lag, 14), ' ' + trin.length ]),
      el('td', { 'data-l':'Sidevisninger' }, [ ikon(IK.øje, 14), ' ' + heltal(visninger(trin)) ]),
      el('td', { 'data-l':'Tilmeldinger', klasse:'sf-svag', tekst:'–' }),
      el('td', { 'data-l':'Salg', klasse:'sf-svag', tekst:'–' }),
      el('td', { 'data-l':'Ordrer', klasse:'sf-svag', tekst:'–' }),
      el('td', { klasse:'sf-t-greb' }, f ? [
        el('button', { type:'button', klasse:'sf-ikonknap', title:'Åbn funnel', 'aria-label':'Åbn funnel', klik:åbn }, [ ikon(IK.tragt) ]),
        el('button', { type:'button', klasse:'sf-ikonknap', title:'Kopiér funnel', 'aria-label':'Kopiér funnel', klik:function(){ kopiérFunnel(f); } }, [ ikon(IK.kopi) ]),
        el('button', { type:'button', klasse:'sf-ikonknap', title: f.arkiveret ? 'Hent frem fra arkivet' : 'Arkivér', 'aria-label':'Arkivér', klik:function(){ arkivér(f); } }, [ ikon(IK.arkiv) ]),
        el('button', { type:'button', klasse:'sf-ikonknap', title:'Indstillinger', 'aria-label':'Indstillinger', klik:function(){ funnelIndstillinger(f); } }, [ ikon(IK.tandhjul) ])
      ] : [])
    ]);
    return r;
  }

  /* =============================================================
     EN FUNNEL: TRINENE I EN LODRET RÆKKE
     ============================================================= */
  function funnelVisning(f){
    var trin = trinI(f);
    var boks = el('div', { klasse:'sf-fv' });
    boks.appendChild(el('div', { klasse:'sf-fv-top' }, [
      el('button', { type:'button', klasse:'knap rolig lille', klik:function(){ visning.hvad = 'liste'; tegn(); } }, [ ikon(IK.tilbage, 14), ' Funnels' ]),
      el('h3', { tekst: f ? f.navn : 'Løse sider' }),
      el('span', { klasse:'sf-maerke' + (erLive(trin) ? ' god' : ''), tekst: erLive(trin) ? 'Live' : 'Kladde' }),
      f ? el('span', { klasse:'sf-maerke' + (f.live_betaling ? ' god' : ''), tekst: f.live_betaling ? 'Rigtige betalinger' : 'Testbetalinger' }) : null,
      f ? funnelFaner(f, 'trin') : null
    ]));

    var flow = el('div', { klasse:'sf-flow' });
    if(f){
      var url = 'https://' + f.domaene + (trin[0] ? trin[0].sti : '/');
      flow.appendChild(el('div', { klasse:'sf-start' }, [
        el('div', { klasse:'sf-start-titel' }, [ ikon(IK.tragt, 16), ' Start på funnelen' ]),
        el('div', { klasse:'sf-url-felt', tekst:url }),
        el('div', { klasse:'sf-start-knapper' }, [
          el('button', { type:'button', klasse:'knap rolig lille', disabled: !trin[0], klik:function(){ forhåndsvisSide(trin[0]); } }, [ ikon(IK.øje, 14), ' Forhåndsvis' ]),
          el('button', { type:'button', klasse:'knap rolig lille', klik:function(e){ kopiérTekst(url, e.currentTarget); } }, [ ikon(IK.kopi, 14), ' Kopiér adresse' ]),
          el('button', { type:'button', klasse:'knap rolig lille', klik:function(){ funnelIndstillinger(f); } }, [ ikon(IK.tandhjul, 14), ' Domæne' ])
        ])
      ]));
    }
    flow.appendChild(plusKnap(f, 0));
    trin.forEach(function(s, i){
      flow.appendChild(trinKort(f, s, i, trin));
      flow.appendChild(plusKnap(f, i + 1));
    });
    flow.appendChild(el('div', { klasse:'sf-slut' }, [ ikon(IK.flag, 14), f ? ' Slut på funnelen' : ' Slut' ]));
    boks.appendChild(flow);
    return boks;
  }

  function plusKnap(f, plads){
    return el('div', { klasse:'sf-plus' }, [
      el('button', { type:'button', title:'Tilføj et trin her', 'aria-label':'Tilføj et trin her', klik:function(){ nySide(f, plads); } }, [ ikon(IK.plus, 16) ])
    ]);
  }

  function trinKort(f, s, i, trin){
    var menu = el('div', { klasse:'sf-menu', hidden:true }, [
      el('button', { type:'button', klik:function(){ åbn(s.id); } }, [ ikon(IK.blyant, 14), ' Rediger side' ]),
      el('button', { type:'button', klik:function(){ sideIndstillinger(s); } }, [ ikon(IK.tandhjul, 14), ' Navn, adresse og Google' ]),
      el('button', { type:'button', klik:function(){ forhåndsvisSide(s); } }, [ ikon(IK.øje, 14), ' Forhåndsvis' ]),
      s.udgivet_version ? el('button', { type:'button', klik:function(){ lukMenuer(); window.open(udgivetAdresse(f, s), '_blank', 'noopener'); } }, [ ikon(IK.øje, 14), ' Åbn den udgivne side' ]) : null,
      variantAf(s) ? null : el('button', { type:'button', klik:function(){ startSplit(s); } }, [ ikon(IK.kopi, 14), ' Start split-test (A/B)' ]),
      i > 0 ? el('button', { type:'button', klik:function(){ flyt(trin, i, -1); } }, [ ikon(IK.op, 14), ' Flyt op' ]) : null,
      i < trin.length - 1 ? el('button', { type:'button', klik:function(){ flyt(trin, i, 1); } }, [ ikon(IK.ned, 14), ' Flyt ned' ]) : null,
      el('button', { type:'button', klasse:'sf-farlig', klik:function(){ sletSide(s); } }, [ ikon(IK.skrald, 14), ' Slet' ])
    ]);
    var menuKnap = el('button', { type:'button', klasse:'sf-ikonknap sf-menuknap', 'aria-label':'Flere valg', 'aria-expanded':'false' }, [ ikon(IK.prikker) ]);
    menuKnap.addEventListener('click', function(e){
      e.stopPropagation();
      var vis = menu.hidden; lukMenuer(); menu.hidden = !vis; menuKnap.setAttribute('aria-expanded', String(vis));
    });
    var b = variantAf(s);
    if(b) return splitKort(f, s, b, menuKnap, menu);
    return el('div', { klasse:'sf-trinkort' }, [
      el('div', { klasse:'sf-tk-top' }, [
        el('button', { type:'button', klasse:'sf-mini-knap', 'aria-label':'Rediger ' + s.navn, klik:function(){ åbn(s.id); } }, [ miniature(s, 120) ]),
        el('div', { klasse:'sf-tk-navn' }, [
          el('button', { type:'button', klasse:'sf-link', tekst:s.navn, klik:function(){ åbn(s.id); } }),
          el('span', { klasse:'sf-sti', tekst:s.sti }),
          el('span', { klasse:'sf-maerke' + (s.udgivet_version ? ' god' : ''), tekst: s.udgivet_version ? 'Udgivet v' + s.udgivet_version : 'Kladde' })
        ]),
        menuKnap, menu
      ]),
      el('div', { klasse:'sf-tk-tal' }, [
        el('div', {}, [ el('small', { tekst:'Sidevisninger' }), el('b', { tekst:heltal(tal[s.sti]) }) ]),
        el('div', {}, [ el('small', { tekst:'Tilmeldinger' }), el('b', { klasse:'sf-svag', tekst:'–' }) ]),
        el('p', { klasse:'sf-tk-fod' }, [ ikon(IK.tal, 12), ' Seneste 30 dage' ])
      ])
    ]);
  }
  function lukMenuer(){
    var m = document.querySelectorAll('.sf-menu'); for(var i = 0; i < m.length; i++) m[i].hidden = true;
  }

  function kopiérTekst(t, knap){
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function(){
      var gl = knap.lastChild.textContent; knap.lastChild.textContent = ' Kopieret';
      setTimeout(function(){ knap.lastChild.textContent = gl; }, 1500);
    }).catch(function(){ window.prompt('Kopiér adressen:', t); });
  }

  /* =============================================================
     SPLIT-TEST (punkt 4, 0083)
     =============================================================
     B er en kopi af A, der rettes for sig. Vægten er B's andel af de
     besøgende. Udgivelsen fordeler og husker valget pr. enhed. */
  function startSplit(s){
    lukMenuer();
    status('Laver variant B …');
    api.json('/rest/v1/side?select=kladde,kladde_html,kladde_css,custom_css,head_kode,footer_kode,seo_titel,seo_beskrivelse&id=eq.' + encodeURIComponent(s.id)).then(function(r){
      var x = JSON.parse(JSON.stringify(r[0]));
      x.funnel_id = s.funnel_id; x.variant_af = s.id; x.split_vaegt = 50; x.raekkefoelge = s.raekkefoelge;
      x.navn = s.navn; x.sti = tilSti(s.sti + '-b-' + Date.now().toString(36).slice(-4));
      return api.json('/rest/v1/side', { method:'POST', headers:{ Prefer:'return=minimal' }, body:x });
    }).then(hent).then(function(){ status('Variant B er lavet som en kopi af A. Ret den, og udgiv begge.', 'god'); }).catch(fejl);
  }
  function splitKort(f, a, b, menuKnap, menu){
    var vægt = el('input', { type:'range', min:0, max:100, step:5, 'aria-label':'Andel til B' }); vægt.value = b.split_vaegt;
    var tekst = el('span', { klasse:'sf-split-tal', tekst:'A ' + (100 - b.split_vaegt) + ' % · B ' + b.split_vaegt + ' %' });
    vægt.addEventListener('input', function(){ tekst.textContent = 'A ' + (100 - vægt.value) + ' % · B ' + vægt.value + ' %'; });
    vægt.addEventListener('change', function(){
      api.json('/rest/v1/side?id=eq.' + encodeURIComponent(b.id), { method:'PATCH', body:{ split_vaegt:+vægt.value }, headers:{ Prefer:'return=minimal' } })
        .then(function(){ b.split_vaegt = +vægt.value; }).catch(fejl);
    });
    function variant(s, bogstav){
      return el('div', { klasse:'sf-split-var' }, [
        el('span', { klasse:'sf-split-bogstav', tekst:bogstav }),
        el('button', { type:'button', klasse:'sf-mini-knap', 'aria-label':'Rediger variant ' + bogstav, klik:function(){ åbn(s.id); } }, [ miniature(s, 150) ]),
        el('span', { klasse:'sf-maerke' + (s.udgivet_version ? ' god' : ''), tekst: s.udgivet_version ? 'Udgivet v' + s.udgivet_version : 'Kladde' }),
        el('div', { klasse:'sf-knaprække' }, [
          el('button', { type:'button', klasse:'knap rolig lille', tekst:'Rediger', klik:function(){ åbn(s.id); } }),
          el('button', { type:'button', klasse:'knap rolig lille', tekst:'Vælg som vinder', klik:function(){ vælgVinder(a, bogstav.toLowerCase()); } })
        ])
      ]);
    }
    return el('div', { klasse:'sf-trinkort sf-split' }, [
      el('div', { klasse:'sf-tk-top' }, [
        el('div', { klasse:'sf-tk-navn' }, [
          el('button', { type:'button', klasse:'sf-link', tekst:a.navn, klik:function(){ åbn(a.id); } }),
          el('span', { klasse:'sf-sti', tekst:a.sti }),
          el('span', { klasse:'sf-maerke sf-maerke-split', tekst:'Split-test kører' })
        ]),
        menuKnap, menu
      ]),
      el('div', { klasse:'sf-split-rækker' }, [ variant(a, 'A'), variant(b, 'B') ]),
      el('div', { klasse:'sf-split-vægt' }, [ el('label', { tekst:'Fordeling af besøgende' }), vægt, tekst,
        el('small', { tekst:'Samme kunde ser altid samme variant (husket i en cookie, der kun rummer bogstavet).' }) ]),
      splitTalBoks(f, a),
      el('div', { klasse:'sf-knaprække sf-split-bund' }, [
        el('button', { type:'button', klasse:'knap rolig lille', tekst:'Stop testen (behold A)', klik:function(){ vælgVinder(a, 'a'); } })
      ])
    ]);
  }
  /* Tal pr. variant (0084): visninger af trinnet, og hvor mange af dem der
     gik videre til næste trin. Kun sidevisninger - ingen personer. */
  function splitTalBoks(f, a){
    var trin = trinI(f), i = trin.indexOf(a), næste = trin[i + 1];
    function tæl(variant, sti){
      return splitTal.filter(function(x){ return x.split_sti === a.sti && x.variant === variant && x.sti === sti; })
        .reduce(function(n, x){ return n + (Number(x.visninger) || 0); }, 0);
    }
    var rækker = ['a', 'b'].map(function(v){
      var vist = tæl(v, a.sti), videre = næste ? tæl(v, næste.sti) : 0;
      return el('div', {}, [
        el('small', { tekst:'Variant ' + v.toUpperCase() }),
        el('b', { tekst:heltal(vist) + ' visninger' }),
        næste ? el('span', { klasse:'sf-svag', tekst:heltal(videre) + ' videre til ' + næste.navn + (vist ? ' (' + (videre / vist * 100).toLocaleString('da-DK', { maximumFractionDigits:1 }) + ' %)' : '') }) : null
      ]);
    });
    return el('div', { klasse:'sf-tk-tal sf-split-resultat' }, rækker.concat([
      el('p', { klasse:'sf-tk-fod' }, [ ikon(IK.tal, 12), ' Seneste 30 dage, fra den udgivne side. Vælg først en vinder, når begge har nogle hundrede visninger.' ])
    ]));
  }
  function vælgVinder(a, hvem){
    var tekst = hvem === 'b'
      ? 'Vælg B som vinder?\n\nB-variantens indhold bliver trinnets kladde, og variant B slettes. Trinnet beholder sin adresse. Udgiv bagefter, så kunderne ser vinderen.'
      : 'Behold A og stop testen?\n\nVariant B slettes. Det kan ikke fortrydes.';
    if(!confirm(tekst)) return;
    api.rpc('vaelg_split_vinder', { p_trin:a.id, p_vinder:hvem }).then(hent)
      .then(function(){ status(hvem === 'b' ? 'B er nu trinnets kladde. Husk at udgive.' : 'Testen er stoppet. A er tilbage alene.', 'god'); })
      .catch(fejl);
  }

  /* =============================================================
     SKABELONGALLERIET (punkt 3)
     =============================================================
     Arytmis egne funnel-skabeloner - ikke ClickFunnels'. Filtre som i
     kortlægningen: formål, funnel-type og kategori, plus søgning. */
  var galleri = { søg:'', formål:[], type:[], kategori:[] };
  function skabelonVisning(){
    var boks = el('div', { klasse:'sf-galleri' });
    boks.appendChild(el('div', { klasse:'sf-fv-top' }, [
      el('button', { type:'button', klasse:'knap rolig lille', klik:function(){ visning.hvad = 'liste'; tegn(); } }, [ ikon(IK.tilbage, 14), ' Funnels' ]),
      el('h3', { tekst:'Funnel-skabeloner' }),
      el('div', { klasse:'sf-knaprække sf-skub' }, [
        el('button', { type:'button', klasse:'knap rolig', disabled:true, title:'Kommer med MCP-serveren: byg med din egen Claude eller ChatGPT' }, [ ikon(IK.blyant, 14), ' Opret med AI' ]),
        el('button', { type:'button', klasse:'knap', klik:function(){ nyTomFunnel(null); } }, [ ikon(IK.plus, 14), ' Start fra bunden' ])
      ])
    ]));
    var filtre = el('aside', { klasse:'sf-g-filtre' });
    var gitter = el('div', { klasse:'sf-g-gitter' });
    var tæller = el('p', { klasse:'sf-fod' });
    function gruppeFiltre(titel, nøgle){
      var alle = []; FUNNEL_SKABELONER.forEach(function(sk){ [].concat(sk[nøgle]).forEach(function(v){ if(alle.indexOf(v) < 0) alle.push(v); }); });
      return el('fieldset', { klasse:'sf-g-gruppe' }, [ el('legend', { tekst:titel }) ].concat(alle.map(function(v){
        var i = el('input', { type:'checkbox' }); i.checked = galleri[nøgle].indexOf(v) >= 0;
        i.addEventListener('change', function(){
          var l = galleri[nøgle], p = l.indexOf(v);
          if(i.checked && p < 0) l.push(v);
          if(!i.checked && p >= 0) l.splice(p, 1);
          tegnGitter();
        });
        return el('label', {}, [ i, el('span', { tekst:v }) ]);
      })));
    }
    filtre.appendChild(gruppeFiltre('Formål', 'formål'));
    filtre.appendChild(gruppeFiltre('Funnel-type', 'type'));
    filtre.appendChild(gruppeFiltre('Kategori', 'kategori'));
    var søg = el('input', { type:'search', klasse:'sf-søg', placeholder:'Søg i skabeloner …', 'aria-label':'Søg i skabeloner' });
    søg.value = galleri.søg;
    søg.addEventListener('input', function(){ galleri.søg = søg.value; tegnGitter(); });
    function passer(sk){
      var q = galleri.søg.trim().toLowerCase();
      if(q && (sk.navn + ' ' + sk.om).toLowerCase().indexOf(q) < 0) return false;
      return ['formål', 'type', 'kategori'].every(function(n){
        return !galleri[n].length || [].concat(sk[n]).some(function(v){ return galleri[n].indexOf(v) >= 0; });
      });
    }
    function tegnGitter(){
      tøm(gitter);
      var vis = FUNNEL_SKABELONER.filter(passer);
      vis.forEach(function(sk){
        gitter.appendChild(el('button', { type:'button', klasse:'sf-g-kort', klik:function(){ visSkabelon(sk); } }, [
          miniature({ kladde_html:sk.trin[0].html, kladde_css:BASIS_CSS + sk.trin[0].css }, 260),
          el('b', { tekst:sk.navn }), el('span', { klasse:'sf-g-om', tekst:sk.om }),
          el('span', { klasse:'sf-g-trin' }, [ ikon(IK.lag, 13), ' ' + sk.trin.length + ' trin' ])
        ]));
      });
      if(!vis.length) gitter.appendChild(el('p', { klasse:'tomt', tekst:'Ingen skabeloner passer. Fjern et filter.' }));
      tæller.textContent = 'Viser ' + vis.length + ' af ' + FUNNEL_SKABELONER.length + ' skabeloner.';
    }
    boks.appendChild(el('div', { klasse:'sf-g-krop' }, [ filtre, el('div', { klasse:'sf-g-højre' }, [ søg, gitter, tæller ]) ]));
    tegnGitter();
    return boks;
  }
  /* Forhåndsvisning af alle trin, før skabelonen tages i brug. */
  function visSkabelon(sk){
    var d = el('dialog', { klasse:'sf-modal sf-modal-bred sf-g-vis' });
    var form = el('form', { method:'dialog' }, [
      el('h3', { tekst:sk.navn }), el('p', { klasse:'sf-m-hjælp', tekst:sk.om }),
      el('div', { klasse:'sf-g-vis-trin' }, sk.trin.map(function(t, i){
        return el('div', {}, [ miniature({ kladde_html:t.html, kladde_css:BASIS_CSS + t.css }, 220), el('small', { tekst:(i + 1) + '. ' + t.navn }),
          el('button', { type:'button', klasse:'knap rolig lille', tekst:'Se i stort', klik:function(){ åbnVindue(t.html, BASIS_CSS + t.css, t.navn); } }) ]);
      })),
      el('div', { klasse:'sf-m-knapper' }, [
        el('button', { type:'button', klasse:'knap rolig', tekst:'Tilbage', klik:function(){ d.close(); } }),
        el('button', { type:'button', klasse:'knap', tekst:'Brug skabelonen', klik:function(){ d.close(); nyTomFunnel(sk); } })
      ])
    ]);
    d.appendChild(form); document.body.appendChild(d);
    d.addEventListener('close', function(){ d.remove(); });
    d.showModal();
  }

  /* ---------- Funnels ---------- */
  function nyFunnel(){ visning.hvad = 'skabeloner'; tegn(); window.scrollTo(0, 0); }
  function nyTomFunnel(skabelon){
    modal(skabelon ? 'Opret funnel fra "' + skabelon.navn + '"' : 'Opret funnel', [
      { navn:'navn', label:'Navn', hjælp:'Kun til jer, fx "Jul 2026" eller "Main efterår/vinter".' },
      { navn:'domaene', label:'Domæne', værdi:'afsted.arytmi.com' }
    ], 'Opret').then(function(v){
      if(!v || !v.navn.trim()) return;
      status('Opretter …');
      return api.json('/rest/v1/funnel', { method:'POST', body:{ navn:v.navn.trim(), domaene:v.domaene.trim().toLowerCase() || 'afsted.arytmi.com' },
        headers:{ Prefer:'return=representation' } }).then(function(r){
        var nyF = r[0], endelse = Date.now().toString(36).slice(-3);
        /* Skabelonens trin oprettes i rækkefølge. Stierne får en kort endelse,
           så de aldrig rammer en adresse, der allerede er i brug. */
        return (skabelon ? skabelon.trin : []).reduce(function(p, t, n){
          return p.then(function(){ return api.json('/rest/v1/side', { method:'POST', headers:{ Prefer:'return=minimal' }, body:{
            funnel_id:nyF.id, raekkefoelge:n, navn:t.navn, sti:tilSti(t.sti + '-' + endelse), kladde_html:t.html, kladde_css:BASIS_CSS + t.css,
            seo_indekser: n === 0 } }); });
        }, Promise.resolve()).then(function(){ return hent(); }).then(function(){ visning.hvad = 'funnel'; visning.funnel = nyF.id; tegn(); });
      });
    }).catch(fejl);
  }

  function funnelIndstillinger(f){
    lukMenuer();
    visning.hvad = 'indstillinger'; visning.funnel = f.id;
    tegn(); window.scrollTo(0, 0);
  }

  function funnelFaner(f, aktiv){
    return el('div', { klasse:'sf-faner sf-skub', role:'tablist' }, [
      el('button', { type:'button', role:'tab', 'aria-selected':String(aktiv === 'trin'), klik:function(){ visning.hvad = 'funnel'; visning.funnel = f.id; tegn(); } }, [ ikon(IK.tragt, 14), ' Trin' ]),
      el('button', { type:'button', role:'tab', 'aria-selected':String(aktiv === 'indstillinger'), klik:function(){ funnelIndstillinger(f); } }, [ ikon(IK.tandhjul, 14), ' Indstillinger' ])
    ]);
  }

  /* =============================================================
     FUNNELENS INDSTILLINGER - en hel side, som hos ClickFunnels
     =============================================================
     Felterne er kortlagt i REA/clickfunnels-migration/paritet-sidebygger.md
     (afsnit A). Intet gemmes, før der trykkes "Gem funnel"; "Fortryd
     ændringer" tegner siden forfra fra databasen. */
  function indstillingsVisning(f){
    var boks = el('div', { klasse:'sf-fv' });
    var trin = trinI(f);
    boks.appendChild(el('div', { klasse:'sf-fv-top' }, [
      el('button', { type:'button', klasse:'knap rolig lille', klik:function(){ visning.hvad = 'liste'; tegn(); } }, [ ikon(IK.tilbage, 14), ' Funnels' ]),
      el('h3', { tekst:f.navn }), funnelFaner(f, 'indstillinger')
    ]));

    var ny = JSON.parse(JSON.stringify(f));
    ny.stil = ny.stil || {}; ny.tags = ny.tags || [];
    var gemKnap = el('button', { type:'button', klasse:'knap', disabled:true, tekst:'Gem funnel' });
    var fortrydKnap = el('button', { type:'button', klasse:'knap rolig', disabled:true, tekst:'Fortryd ændringer' });
    var meld = el('span', { klasse:'status', role:'status' });
    function rørt(){ gemKnap.disabled = false; fortrydKnap.disabled = false; meld.textContent = ''; }
    function felt(navn, label, input, hjælp){
      input.addEventListener('input', function(){ ny[navn] = input.type === 'checkbox' ? input.checked : input.value; rørt(); });
      input.addEventListener('change', function(){ ny[navn] = input.type === 'checkbox' ? input.checked : input.value; rørt(); });
      return el('div', { klasse:'sf-i-felt' }, [ el('label', { tekst:label }), input, hjælp ? el('small', { tekst:hjælp }) : null ]);
    }
    function tekst(navn, ph){ var i = el('input', { type:'text', placeholder:ph || '', spellcheck:'false' }); i.value = ny[navn] || ''; return i; }
    function kode(navn){ var t = el('textarea', { rows:5, spellcheck:'false', wrap:'off', klasse:'sf-kode' }); t.value = ny[navn] || ''; return t; }
    function kort(titel, om, børn){
      return el('section', { klasse:'sf-i-kort' }, [
        el('div', { klasse:'sf-i-om' }, [ el('h4', { tekst:titel }), el('p', { tekst:om }) ]),
        el('div', { klasse:'sf-i-felter' }, børn)
      ]);
    }

    /* Domæne: dem vi kender fra funnelerne + afsted.arytmi.com. Et nyt
       domæne skal også pege på udgivelsen (Cloudflare), før det virker. */
    var kendte = [STANDARD];
    domæner.forEach(function(x){ if(kendte.indexOf(x.navn) < 0) kendte.push(x.navn); });
    funnels.forEach(function(x){ if(kendte.indexOf(x.domaene) < 0) kendte.push(x.domaene); });
    var domæne = el('select');
    kendte.forEach(function(d){ var o = el('option', { value:d, tekst:d }); if(d === ny.domaene) o.selected = true; domæne.appendChild(o); });
    domæne.appendChild(el('option', { value:'__nyt', tekst:'+ Tilføj nyt domæne …' }));
    domæne.addEventListener('change', function(){
      if(domæne.value !== '__nyt') return;
      var d = (prompt('Nyt domæne (fx kampagne.arytmi.com):', '') || '').trim().toLowerCase();
      if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)){ domæne.value = ny.domaene; if(d) alert('Det ligner ikke et domæne.'); return; }
      var o = el('option', { value:d, tekst:d }); domæne.insertBefore(o, domæne.lastChild); domæne.value = d; ny.domaene = d; rørt();
    });

    var sti = tekst('sti', '/jul');
    sti.addEventListener('blur', function(){ if(sti.value) { sti.value = tilSti(sti.value); ny.sti = sti.value; } });
    var stiRække = el('div', { klasse:'sf-i-sti' }, [ el('span', { tekst:'https://' + ny.domaene }), sti ]);
    domæne.addEventListener('change', function(){ stiRække.firstChild.textContent = 'https://' + domæne.value; });

    var live = el('input', { type:'checkbox', role:'switch' }); live.checked = !!ny.live_betaling;
    live.addEventListener('change', function(){
      if(live.checked && !confirm('Slå RIGTIGE betalinger til?\n\nKunder bliver trukket rigtige penge, og testkort virker ikke længere.')){ live.checked = false; return; }
    });
    var gemBetaling = el('div', { klasse:'sf-seg', role:'group' });
    [['arv','Som standard'],['ja','Ja'],['nej','Nej']].forEach(function(m){
      var b = el('button', { type:'button', 'aria-pressed':String(ny.gem_betalingsmetode === m[0]), tekst:m[1] });
      b.addEventListener('click', function(){
        ny.gem_betalingsmetode = m[0]; rørt();
        gemBetaling.querySelectorAll('button').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); });
      });
      gemBetaling.appendChild(b);
    });

    var favicon = el('div', { klasse:'sf-i-billede' });
    function tegnFavicon(){
      tøm(favicon);
      if(ny.favicon_url) favicon.appendChild(el('img', { src:ny.favicon_url, alt:'' }));
      var fil = el('input', { type:'file', accept:'image/png,image/svg+xml,image/x-icon,image/webp', hidden:true });
      fil.addEventListener('change', function(){
        if(fil.files[0]) uploadFil(fil.files[0]).then(function(u){ ny.favicon_url = u; rørt(); tegnFavicon(); }).catch(function(e){ meld.textContent = e.message; });
      });
      favicon.appendChild(fil);
      favicon.appendChild(el('button', { type:'button', klasse:'knap rolig lille', tekst: ny.favicon_url ? 'Skift billede' : 'Vælg billede', klik:function(){ fil.click(); } }));
      if(ny.favicon_url) favicon.appendChild(el('button', { type:'button', klasse:'knap rolig lille', tekst:'Fjern', klik:function(){ ny.favicon_url = null; rørt(); tegnFavicon(); } }));
      favicon.appendChild(el('small', { tekst:'PNG eller SVG, gerne 32 × 32 px. Vises på fanebladet i browseren.' }));
    }
    tegnFavicon();

    var stilBoks = el('div', { klasse:'sf-i-stil' });
    function tegnStil(){
      tøm(stilBoks);
      var s = ny.stil || {};
      var prøve = el('div', { klasse:'sf-stilprøve' }, [
        el('b', { tekst:'Overskrift', style:'font-family:' + (s.skrift_overskrift || '"Bodoni Moda",Georgia,serif') + ';color:' + (s.tekst || '#4A2417') }),
        el('span', { tekst:'Brødtekst', style:'font-family:' + (s.skrift_broed || 'Manrope,Arial,sans-serif') + ';color:' + (s.tekst || '#4A2417') }),
        el('span', { klasse:'sf-stilknap', tekst:'Knap', style:'background:' + (s.knap || '#DE854A') + ';color:' + (s.knaptekst || '#fff') + ';border-radius:' + (s.knap_rund != null ? s.knap_rund + 'px' : '999px') })
      ]);
      prøve.style.background = s.baggrund || '#FAF6EF';
      stilBoks.appendChild(prøve);
      stilBoks.appendChild(el('button', { type:'button', klasse:'knap rolig lille', tekst:'Rediger stilguide', klik:function(){
        stilguide(ny.stil).then(function(v){ if(v){ ny.stil = v; rørt(); tegnStil(); } });
      } }));
      stilBoks.appendChild(el('small', { tekst:'Farver, skrifter og knapper for alle funnelens sider. Rettes ét sted og slår igennem overalt.' }));
    }
    tegnStil();

    var tags = el('div', { klasse:'sf-tags' });
    function tegnTags(){
      tøm(tags);
      ny.tags.forEach(function(t, i){
        tags.appendChild(el('span', { klasse:'sf-tag' }, [ t, el('button', { type:'button', 'aria-label':'Fjern ' + t, tekst:'×', klik:function(){ ny.tags.splice(i, 1); rørt(); tegnTags(); } }) ]));
      });
      var i = el('input', { type:'text', placeholder: ny.tags.length ? '' : 'Ingen. Skriv og tryk Enter …' });
      i.addEventListener('keydown', function(e){
        if(e.key !== 'Enter' && e.key !== ',') return;
        e.preventDefault();
        var t = i.value.trim(); if(!t || ny.tags.indexOf(t) >= 0 || ny.tags.length >= 30) return;
        ny.tags.push(t.slice(0, 40)); rørt(); tegnTags(); tags.querySelector('input').focus();
      });
      tags.appendChild(i);
    }
    tegnTags();

    boks.appendChild(kort('Generelt', 'Oplysninger om funnelen.', [
      felt('navn', 'Navn', tekst('navn')),
      el('div', { klasse:'sf-i-felt' }, [ el('label', { tekst:'Domæne' }), domæne,
        el('small', { tekst:'Et nyt domæne skal også pege på Arytmis udgivelse, før det virker (se Domæner).' }) ]),
      el('div', { klasse:'sf-i-felt' }, [ el('label', { tekst:'Funnelens adresse' }), stiRække,
        el('small', { tekst:'Adressen, der fører til første trin' + (trin[0] ? ' (' + trin[0].sti + ')' : '') + '. Lad den være tom, hvis første trins egen adresse er nok.' }) ]),
      felt('live_betaling', 'Rigtige betalinger', live, 'Slået fra: funnelen tager kun testbetalinger. Virker, når Arytmis egen checkout er bygget.'),
      el('div', { klasse:'sf-i-felt' }, [ el('label', { tekst:'Gem kundens betalingskort ved engangskøb?' }), gemBetaling,
        el('small', { tekst:'Kortet gemmes normalt, så 1-klik-tilkøb virker. Slås det fra ved engangskøb, kan Stripe vise flere betalingsmåder (fx MobilePay).' }) ]),
      el('div', { klasse:'sf-i-felt' }, [ el('label', { tekst:'Favicon' }), favicon ]),
      el('div', { klasse:'sf-i-felt' }, [ el('label', { tekst:'Stil' }), stilBoks ]),
      el('div', { klasse:'sf-i-felt' }, [ el('label', { tekst:'Tags' }), tags ])
    ]));
    boks.appendChild(kort('Kode', 'Kode på alle funnelens sider. Til tælleren, samtykkebjælken og andre scripts.', [
      felt('head_kode', 'Kode i <head>', kode('head_kode'), 'Sættes før </head> på alle sider (docs/funnel-taeller.md, docs/meta-pixel.md).'),
      felt('footer_kode', 'Kode i bunden', kode('footer_kode'), 'Sættes før </body> på alle sider. JavaScript skal stå i <script>-tags.')
    ]));
    boks.appendChild(kort('Del funnelen', 'Gem funnelen som en fil, der kan hentes ind igen som en kopi.', [
      el('div', { klasse:'sf-i-felt' }, [
        el('button', { type:'button', klasse:'knap rolig', klik:function(){ eksportér(f); } }, [ ikon(IK.kopi, 14), ' Hent som fil' ]),
        el('small', { tekst:'Filen indeholder sider, indstillinger og stil - ingen kundedata. Hentes ind med "Hent funnel fra fil" på oversigten.' })
      ])
    ]));

    gemKnap.addEventListener('click', function(){
      var krop = {
        navn: (ny.navn || '').trim() || f.navn, domaene: ny.domaene, sti: ny.sti ? tilSti(ny.sti) : null,
        live_betaling: !!live.checked, gem_betalingsmetode: ny.gem_betalingsmetode, favicon_url: ny.favicon_url || null,
        stil: ny.stil || {}, tags: ny.tags, head_kode: ny.head_kode || '', footer_kode: ny.footer_kode || ''
      };
      meld.textContent = 'Gemmer …';
      nytDomæne(krop.domaene).then(function(){
        return api.json('/rest/v1/funnel?id=eq.' + encodeURIComponent(f.id), { method:'PATCH', body:krop, headers:{ Prefer:'return=minimal' } });
      })
        .then(hent).then(function(){ var m = document.querySelector('.sf-i-bund .status'); if(m) m.textContent = 'Gemt'; })
        .catch(function(e){ meld.textContent = e && e.kode === '23505' ? 'Den adresse bruges allerede på domænet.' : api.forklar(e); });
    });
    fortrydKnap.addEventListener('click', function(){ tegn(); });
    boks.appendChild(el('div', { klasse:'sf-i-bund' }, [
      el('button', { type:'button', klasse:'knap sf-farligknap', tekst: f.arkiveret ? 'Hent frem fra arkivet' : 'Arkivér funnel', klik:function(){ arkivér(f); } }),
      el('button', { type:'button', klasse:'knap rolig', tekst:'Duplikér funnel', klik:function(){ kopiérFunnel(f); } }),
      el('span', { klasse:'sf-skub' }), meld, fortrydKnap, gemKnap
    ]));
    return boks;
  }

  /* =============================================================
     DOMÆNER (punkt 5, 0084)
     =============================================================
     Et domæne har en forside ("/"), en 404-side og kode på hele sitet.
     Siderne serveres af Cloudflare (udgivelse/ i app-repoet,
     docs/udgivelse.md); domænet skal pege dertil (CNAME) for at virke. */
  function domæneAf(f){ return f ? f.domaene : STANDARD; }
  function udgivetAdresse(f, s){
    var a = sider.filter(function(x){ return x.id === s.variant_af; })[0] || s;
    return 'https://' + domæneAf(f || funnels.filter(function(x){ return x.id === a.funnel_id; })[0]) + a.sti;
  }
  function nytDomæne(navn){
    if(!navn || domæner.some(function(d){ return d.navn === navn; })) return Promise.resolve();
    return api.json('/rest/v1/domaene', { method:'POST', body:{ navn:navn }, headers:{ Prefer:'return=minimal,resolution=ignore-duplicates' } });
  }
  /* Udgivne sider, der kan vises på domænet: trin i domænets funnels
     (ikke arkiverede) og - på standarddomænet - løse sider. */
  function siderPå(navn){
    return sider.filter(function(s){
      if(s.variant_af || !s.udgivet_version) return false;
      var f = funnels.filter(function(x){ return x.id === s.funnel_id; })[0];
      return f ? (f.domaene === navn && !f.arkiveret) : navn === STANDARD;
    });
  }
  function domæneVisning(){
    var boks = el('div', { klasse:'sf-fv' });
    boks.appendChild(el('div', { klasse:'sf-fv-top' }, [
      el('button', { type:'button', klasse:'knap rolig lille', klik:function(){ visning.hvad = 'liste'; tegn(); } }, [ ikon(IK.tilbage, 14), ' Funnels' ]),
      el('h3', { tekst:'Domæner' }),
      el('span', { klasse:'sf-skub' }),
      el('button', { type:'button', klasse:'knap rolig', klik:function(){
        var d = (prompt('Nyt domæne (fx kampagne.arytmi.com):', '') || '').trim().toLowerCase();
        if(!d) return;
        if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)){ alert('Det ligner ikke et domæne.'); return; }
        nytDomæne(d).then(hent).then(function(){ visning.hvad = 'domæner'; tegn(); }).catch(fejl);
      } }, [ ikon(IK.plus, 14), ' Tilføj domæne' ])
    ]));
    if(!domæner.length){
      boks.appendChild(el('p', { klasse:'sf-hint', tekst:'Domænerne kommer, når migration 0084 er kørt på databasen.' }));
      return boks;
    }
    boks.appendChild(el('p', { klasse:'sf-hint', tekst:'Et domæne virker først, når det i DNS peger på Arytmis udgivelse (CNAME til arytmi-sider.pages.dev) og er tilføjet i Cloudflare. Ændringer her slår igennem på siderne inden for et halvt minut.' }));
    domæner.forEach(function(d){ boks.appendChild(domæneKort(d)); });
    return boks;
  }
  function domæneKort(d){
    var ny = { forside_id:d.forside_id || '', ikke_fundet_id:d.ikke_fundet_id || '', head_kode:d.head_kode || '', footer_kode:d.footer_kode || '' };
    var meld = el('span', { klasse:'status', role:'status' });
    var gemKnap = el('button', { type:'button', klasse:'knap', disabled:true, tekst:'Gem' });
    function rørt(){ gemKnap.disabled = false; meld.textContent = ''; }
    var mulige = siderPå(d.navn);
    function vælger(navn, tom){
      var v = el('select');
      v.appendChild(el('option', { value:'', tekst:tom }));
      mulige.forEach(function(s){
        var o = el('option', { value:s.id, tekst:s.navn + ' (' + s.sti + ')' }); if(s.id === ny[navn]) o.selected = true; v.appendChild(o);
      });
      v.addEventListener('change', function(){ ny[navn] = v.value; rørt(); });
      return v;
    }
    function kode(navn){
      var t = el('textarea', { rows:4, spellcheck:'false', wrap:'off', klasse:'sf-kode' }); t.value = ny[navn];
      t.addEventListener('input', function(){ ny[navn] = t.value; rørt(); });
      return t;
    }
    var brugt = funnels.filter(function(f){ return f.domaene === d.navn; }).length;
    gemKnap.addEventListener('click', function(){
      meld.textContent = 'Gemmer …';
      api.json('/rest/v1/domaene?navn=eq.' + encodeURIComponent(d.navn), { method:'PATCH', headers:{ Prefer:'return=minimal' },
        body:{ forside_id:ny.forside_id || null, ikke_fundet_id:ny.ikke_fundet_id || null, head_kode:ny.head_kode, footer_kode:ny.footer_kode } })
        .then(hent).then(function(){ visning.hvad = 'domæner'; tegn(); status('Domænet ' + d.navn + ' er gemt.', 'god'); })
        .catch(function(e){ meld.textContent = api.forklar(e); });
    });
    return el('section', { klasse:'sf-i-kort' }, [
      el('div', { klasse:'sf-i-om' }, [
        el('h4', { tekst:d.navn }),
        el('p', { tekst: brugt ? brugt + (brugt === 1 ? ' funnel' : ' funnels') + ' bruger domænet.' : 'Ingen funnels bruger domænet endnu.' }),
        el('p', {}, [ el('a', { href:'https://' + d.navn + '/', target:'_blank', rel:'noopener', tekst:'Åbn ' + d.navn }) ])
      ]),
      el('div', { klasse:'sf-i-felter' }, [
        el('div', { klasse:'sf-i-felt' }, [ el('label', { tekst:'Forside (' + d.navn + '/)' }), vælger('forside_id', 'Ingen - "/" viser 404-siden'),
          el('small', { tekst:'Siden, der vises, når nogen skriver domænet uden sti. Kun udgivne sider på domænet kan vælges.' }) ]),
        el('div', { klasse:'sf-i-felt' }, [ el('label', { tekst:'404-side' }), vælger('ikke_fundet_id', 'Arytmis standard ("Siden findes ikke")'),
          el('small', { tekst:'Vises med status 404 for adresser, der ikke findes.' }) ]),
        el('div', { klasse:'sf-i-felt' }, [ el('label', { tekst:'Kode i <head> på hele domænet' }), kode('head_kode'),
          el('small', { tekst:'Før funnelens og sidens egen head-kode. Tælleren er bygget ind og skal IKKE stå her.' }) ]),
        el('div', { klasse:'sf-i-felt' }, [ el('label', { tekst:'Kode i bunden på hele domænet' }), kode('footer_kode') ]),
        el('div', { klasse:'sf-knaprække' }, [
          brugt || d.navn === STANDARD ? null : el('button', { type:'button', klasse:'knap sf-farligknap', tekst:'Slet domænet', klik:function(){
            if(!confirm('Slet ' + d.navn + '?')) return;
            api.json('/rest/v1/domaene?navn=eq.' + encodeURIComponent(d.navn), { method:'DELETE', headers:{ Prefer:'return=minimal' } })
              .then(hent).then(function(){ visning.hvad = 'domæner'; tegn(); }).catch(fejl);
          } }),
          el('span', { klasse:'sf-skub' }), meld, gemKnap
        ])
      ])
    ]);
  }

  /* ---------- Stilguiden ----------
     Én stil pr. funnel. Den lægges oven på blokkenes egne farver som CSS
     (stilCss), i editoren, i forhåndsvisningen og på den udgivne side. */
  var SKRIFTER = [
    ['', 'Standard'], ['"Bodoni Moda",Georgia,serif', 'Bodoni Moda'], ['Manrope,Arial,sans-serif', 'Manrope'],
    ['Fraunces,Georgia,serif', 'Fraunces'], ['Inter,Arial,sans-serif', 'Inter'], ['"Playfair Display",Georgia,serif', 'Playfair Display'],
    ['"DM Serif Display",Georgia,serif', 'DM Serif Display'], ['"Cormorant Garamond",Georgia,serif', 'Cormorant Garamond'],
    ['Merriweather,Georgia,serif', 'Merriweather'], ['"Libre Baskerville",Georgia,serif', 'Libre Baskerville'],
    ['Montserrat,Arial,sans-serif', 'Montserrat'], ['Poppins,Arial,sans-serif', 'Poppins'], ['Lato,Arial,sans-serif', 'Lato'],
    ['"Open Sans",Arial,sans-serif', 'Open Sans'], ['"Work Sans",Arial,sans-serif', 'Work Sans'], ['Nunito,Arial,sans-serif', 'Nunito'],
    ['Oswald,Arial,sans-serif', 'Oswald'], ['"Bebas Neue",Arial,sans-serif', 'Bebas Neue'], ['Georgia,serif', 'Georgia (system)'], ['Arial,sans-serif', 'Arial (system)']
  ];
  function stilguide(s){
    s = s || {};
    return modal('Stilguide', [
      { type:'overskrift', label:'Farver' },
      { navn:'baggrund', label:'Baggrund', type:'color', værdi:s.baggrund || '#FAF6EF' },
      { navn:'tekst', label:'Tekst', type:'color', værdi:s.tekst || '#4A2417' },
      { navn:'accent', label:'Accent (små overskrifter, links)', type:'color', værdi:s.accent || '#8F4333' },
      { type:'overskrift', label:'Skrifter', hjælp:'Alle skrifter ligger hos Arytmi selv (ingen Google Fonts) og ses i editoren, forhåndsvisningen og på den udgivne side.' },
      { navn:'skrift_overskrift', label:'Overskrifter', type:'valg', muligheder:SKRIFTER, værdi:s.skrift_overskrift || '' },
      { navn:'skrift_broed', label:'Brødtekst', type:'valg', muligheder:SKRIFTER, værdi:s.skrift_broed || '' },
      { type:'overskrift', label:'Knapper' },
      { navn:'knap', label:'Knapfarve', type:'color', værdi:s.knap || '#DE854A' },
      { navn:'knaptekst', label:'Tekst på knapper', type:'color', værdi:s.knaptekst || '#FFFFFF' },
      { navn:'knap_rund', label:'Rund kant på knapper (px, 999 = helt rund)', type:'number', værdi:s.knap_rund != null ? String(s.knap_rund) : '999' }
    ], 'Brug stilen').then(function(v){
      if(!v) return null;
      var r = parseInt(v.knap_rund, 10);
      return { baggrund:v.baggrund, tekst:v.tekst, accent:v.accent, skrift_overskrift:v.skrift_overskrift, skrift_broed:v.skrift_broed,
               knap:v.knap, knaptekst:v.knaptekst, knap_rund: isNaN(r) ? 999 : Math.max(0, Math.min(999, r)) };
    });
  }
  function stilCss(s){
    if(!s || !Object.keys(s).length) return '';
    var c = '';
    if(s.baggrund || s.tekst || s.skrift_broed) c += 'html body{' + (s.baggrund ? 'background:' + s.baggrund + ';' : '') + (s.tekst ? 'color:' + s.tekst + ';' : '') + (s.skrift_broed ? 'font-family:' + s.skrift_broed + ';' : '') + '}';
    if(s.skrift_overskrift || s.tekst) c += 'html body h1,html body h2,html body h3{' + (s.skrift_overskrift ? 'font-family:' + s.skrift_overskrift + ';' : '') + '}';
    if(s.accent) c += 'html body .a-over,html body .a-citat cite{color:' + s.accent + '}';
    if(s.knap || s.knaptekst || s.knap_rund != null) c += 'html body .a-knap{' + (s.knap ? 'background:' + s.knap + ';' : '') + (s.knaptekst ? 'color:' + s.knaptekst + ';' : '') + (s.knap_rund != null ? 'border-radius:' + s.knap_rund + 'px;' : '') + '}';
    return c;
  }

  /* ---------- Del: funnelen som fil ---------- */
  function eksportér(f){
    var trin = trinI(f);
    status('Henter siderne …');
    Promise.all(trin.map(function(s){
      return api.json('/rest/v1/side?select=raekkefoelge,navn,sti,seo_titel,seo_beskrivelse,seo_indekser,head_kode,footer_kode,custom_css,beskrivelse,social_billede,bloker_ai_traening,bloker_ai_soegning,bloker_ai_assistent,kladde,kladde_html,kladde_css&id=eq.' + encodeURIComponent(s.id))
        .then(function(r){ return r[0]; });
    })).then(function(s){
      var fil = { format:'arytmi-funnel', version:1, eksporteret:new Date().toISOString(),
        funnel:{ navn:f.navn, domaene:f.domaene, head_kode:f.head_kode, footer_kode:f.footer_kode, stil:f.stil, tags:f.tags, favicon_url:f.favicon_url, gem_betalingsmetode:f.gem_betalingsmetode },
        sider:s };
      var a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(fil, null, 1)], { type:'application/json' })),
        download: tilSti(f.navn).slice(1) + '.arytmi-funnel.json' });
      document.body.appendChild(a); a.click(); a.remove();
      status('');
    }).catch(fejl);
  }
  function importér(){
    var i = el('input', { type:'file', accept:'.json,application/json' });
    i.addEventListener('change', function(){
      var fil = i.files[0]; if(!fil) return;
      fil.text().then(function(t){
        var d = JSON.parse(t);
        if(d.format !== 'arytmi-funnel' || !d.funnel || !Array.isArray(d.sider)) throw new Error('Det er ikke en Arytmi-funnelfil.');
        var ext = Date.now().toString(36).slice(-4);
        return medBilleder(d).then(function(){ return api.json('/rest/v1/funnel', { method:'POST', headers:{ Prefer:'return=representation' }, body:{
          navn:String(d.funnel.navn || 'Importeret') + ' (importeret)', domaene:d.funnel.domaene || 'afsted.arytmi.com',
          head_kode:d.funnel.head_kode || '', footer_kode:d.funnel.footer_kode || '', stil:d.funnel.stil || {}, tags:d.funnel.tags || [],
          favicon_url:d.funnel.favicon_url || null,
          /* Ligesom Duplikér. live_betaling kommer med vilje IKKE med: en
             importeret funnel starter altid med testbetalinger. */
          gem_betalingsmetode:['arv', 'ja', 'nej'].indexOf(d.funnel.gem_betalingsmetode) >= 0 ? d.funnel.gem_betalingsmetode : 'arv' } }).then(function(r){
          var nyF = r[0];
          return Promise.all(d.sider.map(function(s){
            var krop = {}; ['raekkefoelge','navn','seo_titel','seo_beskrivelse','seo_indekser','head_kode','footer_kode','custom_css','beskrivelse','social_billede','bloker_ai_traening','bloker_ai_soegning','bloker_ai_assistent','kladde','kladde_html','kladde_css']
              .forEach(function(k){ if(s[k] !== undefined && s[k] !== null) krop[k] = s[k]; });
            krop.funnel_id = nyF.id; krop.sti = tilSti((s.sti || s.navn) + '-' + ext);
            return api.json('/rest/v1/side', { method:'POST', headers:{ Prefer:'return=minimal' }, body:krop });
          })).then(function(){ return hent().then(function(){ status(''); visning.hvad = 'funnel'; visning.funnel = nyF.id; tegn(); }); });
        }); });
      }).catch(function(e){ status(e.message || api.forklar(e), 'fejl'); });
    });
    i.click();
  }

  /* En funnelfil kan have billederne med (`billeder`: gammel adresse ->
     { type, data } i base64) - fx en side flyttet fra ClickFunnels, hvis
     billeder forsvinder med abonnementet. De lægges i spanden ét ad gangen,
     og den gamle adresse skiftes ud overalt i filen, før noget gemmes. */
  function medBilleder(d){
    var liste = Object.keys(d.billeder || {});
    if(!liste.length) return Promise.resolve();
    var nye = {}, n = 0;
    return liste.reduce(function(kæde, gammel){
      return kæde.then(function(){
        status('Lægger billeder op … ' + (++n) + ' af ' + liste.length);
        var b = d.billeder[gammel], bin = atob(b.data), bytes = new Uint8Array(bin.length);
        for(var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return uploadFil(new Blob([bytes], { type:b.type })).then(function(ny){ nye[gammel] = ny; });
      });
    }, Promise.resolve()).then(function(){
      function skift(t){ return typeof t === 'string' ? liste.reduce(function(s, g){ return s.split(g).join(nye[g]); }, t) : t; }
      ['head_kode', 'footer_kode', 'favicon_url'].forEach(function(k){ d.funnel[k] = skift(d.funnel[k]); });
      d.sider.forEach(function(s){
        ['kladde_html', 'kladde_css', 'head_kode', 'footer_kode', 'custom_css', 'social_billede'].forEach(function(k){ s[k] = skift(s[k]); });
        if(s.kladde && typeof s.kladde === 'object') s.kladde = JSON.parse(skift(JSON.stringify(s.kladde)));
      });
    });
  }

  function arkivér(f){
    api.json('/rest/v1/funnel?id=eq.' + encodeURIComponent(f.id), { method:'PATCH', body:{ arkiveret: !f.arkiveret }, headers:{ Prefer:'return=minimal' } })
      .then(hent).catch(fejl);
  }

  /* En kopi får "-kopi" på alle stier, så den aldrig tager adressen fra den
     levende funnel. Kun kladderne kopieres - kopien er ikke udgivet. */
  function kopiérFunnel(f){
    var trin = trinI(f);
    status('Kopierer …');
    api.json('/rest/v1/funnel', { method:'POST', body:{ navn:'Kopi af ' + f.navn, domaene:f.domaene, head_kode:f.head_kode || '',
      footer_kode:f.footer_kode || '', stil:f.stil || {}, tags:f.tags || [], favicon_url:f.favicon_url || null, gem_betalingsmetode:f.gem_betalingsmetode || 'arv' },
      headers:{ Prefer:'return=representation' } }).then(function(r){
      var ny = r[0];
      return Promise.all(trin.map(function(s){
        return api.json('/rest/v1/side?select=kladde,kladde_html,kladde_css,seo_titel,seo_beskrivelse,seo_indekser,head_kode,footer_kode,custom_css,beskrivelse,social_billede,bloker_ai_traening,bloker_ai_soegning,bloker_ai_assistent&id=eq.' + encodeURIComponent(s.id)).then(function(fuld){
          var x = JSON.parse(JSON.stringify(fuld[0]));
          x.funnel_id = ny.id; x.raekkefoelge = s.raekkefoelge; x.navn = s.navn;
          x.sti = tilSti(s.sti + '-kopi-' + Date.now().toString(36).slice(-4));
          return api.json('/rest/v1/side', { method:'POST', headers:{ Prefer:'return=minimal' }, body:x });
        });
      }));
    }).then(hent).catch(fejl);
  }

  /* ---------- Sider ---------- */
  function nySide(f, plads){
    modal('Nyt trin', [
      { navn:'skabelon', label:'Start fra', type:'skabelon', valgt: plads === 0 ? 1 : 0 },
      { navn:'navn', label:'Navn på siden', hjælp:'Fx Salgsside, Betaling eller Tak.' },
      { navn:'sti', label:'Adresse', hjælp:'Kun små bogstaver, tal og bindestreg. Udfyldes ud fra navnet.' }
    ], 'Opret trin', function(inp, form){
      var rørt = false;
      inp.sti.addEventListener('input', function(){ rørt = true; });
      inp.navn.addEventListener('input', function(){ if(!rørt) inp.sti.value = tilSti(inp.navn.value); });
      form.addEventListener('change', function(e){
        if(e.target.name !== 'skabelon' || inp.navn.value) return;
        var sk = SKABELONER.filter(function(x){ return x.id === e.target.value; })[0];
        if(sk && sk.id !== 'tom'){ inp.navn.value = sk.navn; if(!rørt) inp.sti.value = tilSti(sk.sti); }
      });
    }).then(function(v){
      if(!v || !v.navn.trim()) return;
      var sk = SKABELONER.filter(function(x){ return x.id === v.skabelon; })[0] || SKABELONER[0];
      var trin = trinI(f);
      /* Rækkefølgen skrives om, så det nye trin lander, hvor der blev trykket. */
      var flyttes = trin.slice(plads);
      return Promise.all(flyttes.map(function(s, n){
        return api.json('/rest/v1/side?id=eq.' + encodeURIComponent(s.id), { method:'PATCH', body:{ raekkefoelge: plads + n + 1 }, headers:{ Prefer:'return=minimal' } });
      })).then(function(){
        return api.json('/rest/v1/side', { method:'POST', headers:{ Prefer:'return=representation' }, body:{
          funnel_id: f ? f.id : null, raekkefoelge: plads, navn: v.navn.trim(), sti: tilSti(v.sti || v.navn),
          kladde_html: sk.html, kladde_css: sk.html ? BASIS_CSS + sk.css : '' } });
      }).then(function(r){ return hent().then(function(){ if(r && r[0]) åbn(r[0].id); }); });
    }).catch(fejl);
  }

  /* SIDENS INDSTILLINGER - alle felter fra kortlægningen (afsnit D). Hele
     rækken hentes først, så intet felt overskrives med en tom værdi. */
  var SIDE_FELTER = 'id,navn,sti,beskrivelse,seo_titel,seo_beskrivelse,seo_indekser,social_billede,bloker_ai_traening,bloker_ai_soegning,bloker_ai_assistent,head_kode,footer_kode,custom_css';
  function sideIndstillinger(s, efter){
    lukMenuer();
    api.json('/rest/v1/side?select=' + SIDE_FELTER + '&id=eq.' + encodeURIComponent(s.id)).then(function(r){
      var x = r[0];
      return modal('Sidens indstillinger · ' + x.navn, [
        { type:'overskrift', label:'Generelt' },
        { navn:'navn', label:'Navn', værdi:x.navn },
        { navn:'sti', label:'Adresse', værdi:x.sti, hjælp:'Ændres adressen på en udgivet side, virker gamle links ikke længere.' },
        { navn:'beskrivelse', label:'Intern note', type:'textarea', rader:2, værdi:x.beskrivelse || '', hjælp:'Kun til jer. Højst 1.000 tegn.' },
        { type:'overskrift', label:'Google og deling' },
        { navn:'seo_titel', label:'Titel i Google og på fanebladet', værdi:x.seo_titel || '', hjælp:'Højst ca. 60 tegn ses i Google.' },
        { navn:'seo_beskrivelse', label:'Beskrivelse i Google', type:'textarea', rader:3, værdi:x.seo_beskrivelse || '', hjælp:'1-2 sætninger, højst ca. 155 tegn ses i Google.' },
        { navn:'seo_indekser', label:'Må vises i Google', type:'afkryds', værdi:x.seo_indekser, hjælp:'Slået fra: siden beder søgemaskiner om ikke at vise den (fx tak- og betalingssider).' },
        { navn:'social_billede', label:'Billede ved deling (Facebook, Messenger m.fl.)', type:'billede', værdi:x.social_billede || '', hjælp:'1200 × 630 px er bedst.' },
        { type:'overskrift', label:'AI-tjenester', hjælp:'Overholdes af de store AI-firmaer via robots.txt. Det er en anmodning, ikke en lås.' },
        { navn:'bloker_ai_traening', label:'Bloker AI-træning (GPTBot, ClaudeBot, Google-Extended …)', type:'afkryds', værdi:x.bloker_ai_traening },
        { navn:'bloker_ai_soegning', label:'Bloker AI-søgning (ChatGPT-søgning, Perplexity …)', type:'afkryds', værdi:x.bloker_ai_soegning, hjælp:'Slå kun til, hvis siden ikke må nævnes i AI-svar. Det koster synlighed.' },
        { navn:'bloker_ai_assistent', label:'Bloker AI-assistenter, der åbner siden for en person', type:'afkryds', værdi:x.bloker_ai_assistent },
        { type:'overskrift', label:'Kode', hjælp:'Kun for denne side. Funnelens fælles kode ligger under funnelens indstillinger.' },
        { navn:'head_kode', label:'Kode i <head>', type:'kode', rader:4, værdi:x.head_kode || '' },
        { navn:'footer_kode', label:'Kode i bunden (før </body>)', type:'kode', rader:4, værdi:x.footer_kode || '' },
        { navn:'custom_css', label:'Egen CSS', type:'kode', rader:8, værdi:x.custom_css || '', hjælp:'Ses straks i editoren. Uden <style>.' }
      ], 'Gem', null, true).then(function(v){
        if(!v) return;
        var krop = {
          navn:v.navn.trim() || x.navn, sti:tilSti(v.sti), beskrivelse:v.beskrivelse.slice(0, 1000),
          seo_titel:v.seo_titel.trim().slice(0, 200), seo_beskrivelse:v.seo_beskrivelse.trim().slice(0, 500), seo_indekser:!!v.seo_indekser,
          social_billede: /^https:\/\//.test(v.social_billede.trim()) ? v.social_billede.trim() : null,
          bloker_ai_traening:!!v.bloker_ai_traening, bloker_ai_soegning:!!v.bloker_ai_soegning, bloker_ai_assistent:!!v.bloker_ai_assistent,
          head_kode:v.head_kode, footer_kode:v.footer_kode, custom_css:v.custom_css
        };
        return api.json('/rest/v1/side?id=eq.' + encodeURIComponent(x.id), { method:'PATCH', body:krop, headers:{ Prefer:'return=minimal' } })
          .then(function(){ for(var k in krop) s[k] = krop[k]; if(efter) efter(); else hent(); });
      });
    }).catch(function(f){ if(efter) editorStatus(f && f.kode === '23505' ? 'Adressen bruges allerede.' : api.forklar(f), 'fejl'); else fejl(f); });
  }

  function flyt(trin, i, retning){
    lukMenuer();
    var ny = trin.slice(), a = ny[i]; ny[i] = ny[i + retning]; ny[i + retning] = a;
    Promise.all(ny.map(function(s, n){
      return api.json('/rest/v1/side?id=eq.' + encodeURIComponent(s.id), { method:'PATCH', body:{ raekkefoelge:n }, headers:{ Prefer:'return=minimal' } });
    })).then(hent).catch(fejl);
  }

  function sletSide(s){
    lukMenuer();
    if(!confirm('Slet "' + s.navn + '" (' + s.sti + ')?\n\nKladden og alle udgivne versioner forsvinder. Det kan ikke fortrydes.')) return;
    api.json('/rest/v1/side?id=eq.' + encodeURIComponent(s.id), { method:'DELETE', headers:{ Prefer:'return=minimal' } }).then(hent).catch(fejl);
  }

  function forhåndsvisSide(s){
    if(!s) return;
    lukMenuer();
    åbnUrl(kædeUrl(s));
  }
  /* "Næste trin"-knapperne skal virke i forhåndsvisningen som på den
     udgivne side. Derfor bygges også de efterfølgende trin, bagfra, og hvert
     trin får det næstes adresse - det samme, udgivelsen gør med
     <meta name="arytmi-naeste">. `forside` erstatter trinets egen kladde,
     når editoren har nyere, ugemte ændringer. */
  function kædeUrl(s, forside){
    var f = funnels.filter(function(x){ return x.id === s.funnel_id; })[0];
    var trin = f ? trinI(f) : [s], i = trin.indexOf(s), url = null;
    if(i < 0){ trin = [s]; i = 0; }
    for(var j = trin.length - 1; j >= i; j--){
      var t = trin[j], egen = j === i && forside;
      url = vindueUrl(egen ? forside.html : (t.kladde_html || t.udgivet_html || ''),
        egen ? forside.css : (t.kladde_css || t.udgivet_css || '') + SYNLIG_CSS + stilCss(f && f.stil) + (t.custom_css || ''),
        t.seo_titel || t.navn, url);
    }
    return url;
  }
  function åbnVindue(html, css, titel){ åbnUrl(vindueUrl(html, css, titel)); }
  function åbnUrl(url){ window.open(url, '_blank', 'noopener'); }
  /* Nyt vindue via en blob: samme html og css som Udgiv tager. noopener,
     så vinduet ikke kan røre bagrummet. Adressen lever en halv time, så
     man kan nå at klikke sig gennem funnelen. */
  function vindueUrl(html, css, titel, naeste){
    var her = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    html = String(html || '').replace(/^<body[^>]*>|<\/body>$/g, '')
      .replace(/<div data-a-sektion="([^"]*)"[^>]*><\/div>/g, function(_, id){ var x = sektioner.filter(function(y){ return y.id === id; })[0]; return x ? x.html + (x.css ? '<style>' + x.css + '</style>' : '') : ''; });
    var doc = '<!doctype html><html lang="da"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
      String(titel || 'Forhåndsvisning').replace(/[<&]/g, '') + '</title>' +
      (naeste ? '<meta name="arytmi-naeste" content="' + naeste + '">' : '') +
      '<link rel="stylesheet" href="' + her + 'skrifter/skrifter.css"><link rel="stylesheet" href="' + her + 'side-runtime.css?v=' + RUNTIME_V + '"><style>' + css + '</style></head><body>' + html +
      '<script src="' + her + 'side-runtime.js?v=' + RUNTIME_V + '"><\/script></body></html>';
    var url = URL.createObjectURL(new Blob([doc], { type:'text/html' }));
    setTimeout(function(){ URL.revokeObjectURL(url); }, 30 * 60000);
    return url;
  }

  /* =============================================================
     EDITOREN
     ============================================================= */
  var grapesHentet = null;
  function hentGrapes(){
    if(window.grapesjs) return Promise.resolve();
    if(grapesHentet) return grapesHentet;
    grapesHentet = new Promise(function(ja, nej){
      document.head.appendChild(el('link', { rel:'stylesheet', href: GRAPES + 'grapes.min.css?v=0.23.8' }));
      var s = el('script', { src: GRAPES + 'grapes.min.js?v=0.23.8' });
      s.onload = function(){ ja(); };
      s.onerror = function(){ grapesHentet = null; nej(new Error('Editoren kunne ikke hentes. Prøv igen.')); };
      document.head.appendChild(s);
    });
    return grapesHentet;
  }

  function åbn(id){
    lukMenuer();
    var skift = editor && ændret ? gem() : Promise.resolve();
    status('Åbner editoren …');
    skift.then(function(){
      return Promise.all([ hentGrapes(), api.json('/rest/v1/side?select=*&id=eq.' + encodeURIComponent(id)), hentSektioner() ]);
    }).then(function(r){
      var s = r[1] && r[1][0];
      if(!s) throw new Error('Siden findes ikke længere.');
      åbenSide = s;
      status('');
      visEditor(s);
    }).catch(function(f){ if(editor) editorStatus(api.forklar(f), 'fejl'); else fejl(f); });
  }

  /* ---------- Gemte og universelle sektioner (0082) ---------- */
  var sektioner = [];
  function hentSektioner(){
    return api.json('/rest/v1/sektion?select=id,navn,universel,html,css,opdateret&order=navn.asc')
      .then(function(r){ sektioner = r || []; }).catch(function(){ sektioner = []; });
  }
  function sektionBlokke(){
    if(!editor) return;
    var bm = editor.Blocks;
    bm.getAll().filter(function(b){ return /^gemt-/.test(b.id); }).forEach(function(b){ bm.remove(b.id); });
    sektioner.forEach(function(x){
      bm.add('gemt-' + x.id, {
        label: x.navn + (x.universel ? ' (universel)' : ''), category: 'Gemte sektioner',
        media: '<svg viewBox="0 0 120 80" class="sf-skitse"><rect width="120" height="80" rx="6" fill="' + (x.universel ? '#eef3ec' : '#FAF6EF') + '" stroke="' + (x.universel ? '#4f6b4a' : '#D9CFC2') + '"/><text x="60" y="46" text-anchor="middle" font-size="12" fill="#4A2417" font-family="Arial">' + (x.universel ? '↻ universel' : 'gemt') + '</text></svg>',
        content: x.universel ? { type:'a-universel', attributes:{ 'data-a-sektion':x.id } } : x.html + (x.css ? '<style>' + x.css + '</style>' : '')
      });
    });
    tegnSektionsliste();
  }
  function tegnSektionsliste(){
    var l = $('sf-sektionsliste'); if(!l) return;
    tøm(l);
    if(!sektioner.length){ l.appendChild(el('p', { klasse:'sf-hint', tekst:'Ingen gemte sektioner endnu. Vælg en sektion på siden og tryk "Gem som sektion".' })); return; }
    sektioner.forEach(function(x){
      l.appendChild(el('div', { klasse:'sf-sektion-række' }, [
        el('span', {}, [ el('b', { tekst:x.navn }), el('small', { tekst: x.universel ? 'Universel · rettes ét sted' : 'Gemt · indsættes som kopi' }) ]),
        el('button', { type:'button', klasse:'knap rolig lille', tekst:'Rediger', klik:function(){ åbnSektion(x.id); } }),
        el('button', { type:'button', klasse:'knap rolig lille sf-farlig', tekst:'Slet', 'aria-label':'Slet ' + x.navn, klik:function(){ sletSektion(x); } })
      ]));
    });
  }
  function gemSomSektion(k){
    modal('Gem som sektion', [
      { navn:'navn', label:'Navn', hjælp:'Fx "Sidefod", "Anmeldelser" eller "Garanti".' },
      { navn:'universel', label:'Universel: ret ét sted, opdatér overalt', type:'afkryds', værdi:false,
        hjælp:'Til fx sidefod og garanti, der skal være ens på alle sider. Ellers indsættes den som en kopi, der kan rettes for sig.' }
    ], 'Gem sektion').then(function(v){
      if(!v || !v.navn.trim()) return;
      var css = ''; try { css = editor.getCss({ component:k }); } catch(e){}
      return api.json('/rest/v1/sektion', { method:'POST', headers:{ Prefer:'return=representation' },
        body:{ navn:v.navn.trim(), universel:!!v.universel, html:k.toHTML(), css:css } }).then(function(r){
        var ny = r[0];
        sektioner.push(ny); sektionBlokke();
        if(ny.universel){
          var p = k.parent(), i = k.index();
          k.remove();
          var u = p.components().add({ type:'a-universel', attributes:{ 'data-a-sektion':ny.id } }, { at:i });
          editor.select(u);
        }
        editorStatus('Sektionen er gemt', 'god');
      });
    }).catch(function(e){ editorStatus(api.forklar(e), 'fejl'); });
  }
  function sletSektion(x){
    if(!confirm('Slet "' + x.navn + '"?' + (x.universel ? '\n\nSider, der bruger den, viser "findes ikke længere", til den fjernes fra dem.' : ''))) return;
    api.json('/rest/v1/sektion?id=eq.' + encodeURIComponent(x.id), { method:'DELETE', headers:{ Prefer:'return=minimal' } })
      .then(function(){ sektioner = sektioner.filter(function(y){ return y.id !== x.id; }); sektionBlokke(); })
      .catch(function(e){ editorStatus(api.forklar(e), 'fejl'); });
  }
  /* En sektion redigeres i den samme editor. "Gem" gemmer den i tabellen
     sektion; "Udgiv" findes ikke for en sektion. */
  function åbnSektion(id){
    var skift = editor && ændret ? gem() : Promise.resolve();
    skift.then(function(){ return api.json('/rest/v1/sektion?select=*&id=eq.' + encodeURIComponent(id)); }).then(function(r){
      var x = r[0]; if(!x) return;
      tilbageTil = åbenSide && !åbenSide.erSektion ? åbenSide.id : tilbageTil;
      åbenSide = { erSektion:true, id:x.id, navn:x.navn, sti:'(sektion)', funnel_id:null, kladde:x.kladde, kladde_html:x.html, kladde_css:x.css, universel:x.universel, custom_css:'' };
      visEditor(åbenSide);
    }).catch(function(e){ editorStatus(api.forklar(e), 'fejl'); });
  }
  var tilbageTil = null;

  function visEditor(s){
    $('sider-editor').hidden = false;
    document.body.classList.add('sf-redigerer');
    var f = funnels.filter(function(x){ return x.id === s.funnel_id; })[0];
    $('sf-titel').textContent = s.erSektion ? (s.universel ? 'Universel sektion' : 'Gemt sektion') : f ? f.navn : 'Løs side';
    $('sf-adresse').textContent = s.erSektion ? s.navn : s.navn + ' · ' + s.sti;
    $('sf-udgiv').hidden = !!s.erSektion;
    $('sider-editor').classList.toggle('sf-sektionstilstand', !!s.erSektion);
    tegnTrinListe(s);

    /* Runtime-scriptet og dets CSS indlæses i lærredet, så popup, video,
       nedtælling m.m. ser ud som på den udgivne side. */
    var her = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    if(editor){ editor.destroy(); editor = null; }
    editor = window.grapesjs.init({
      canvas: { styles:[ her + 'skrifter/skrifter.css', her + 'side-runtime.css?v=' + RUNTIME_V, her + 'ordreformular.css?v=' + RUNTIME_V ], scripts:[ her + 'side-runtime.js?v=' + RUNTIME_V, her + 'ordreformular.js?v=' + RUNTIME_V ] },
      container: '#sf-laerred',
      height: '100%', width: 'auto',
      fromElement: false,
      storageManager: false,
      cssIcons: '',          /* ellers hentes Font Awesome fra et CDN */
      noticeOnUnload: false,
      deviceManager: { devices: [
        { id:'computer', name:'Computer', width:'' },
        { id:'tablet', name:'Tablet', width:'768px', widthMedia:'992px' },
        { id:'mobil', name:'Mobil', width:'375px', widthMedia:'480px' }
      ] },
      assetManager: { upload:false, uploadFile:uploadBilleder, assets:[] },
      blockManager: { appendTo:'#sf-blokke', blocks: [] },
      styleManager: { appendTo:'#sf-avanceret-stil' },
      layerManager: { appendTo:'#sf-lag' },
      traitManager: { appendTo:'#sf-avanceret-egenskaber' },
      selectorManager: { appendTo:'#sf-avanceret-stil', componentFirst:true },
      panels: { defaults: [] },
      i18n: { locale:'da', detectLocale:false, messagesAdd:{ da:DANSK } }
    });

    /* Elementerne (sider-elementer.js) først, så de færdige sektioner og
       de gemte. Rækkefølgen bestemmer kategoriernes rækkefølge. */
    window.ArytmiElementer.registrer(editor, { plads:PLADS, sektion:function(id){ return sektioner.filter(function(x){ return x.id === id; })[0]; } });
    BLOKKE.forEach(function(b){ if(SKJULTE_BLOKKE.indexOf(b.id) < 0) editor.Blocks.add(b.id, { label:b.label, category:'Færdige sektioner', media:b.media, content:b.content }); });
    sektionBlokke();

    if(s.kladde && s.kladde.pages) editor.loadProjectData(s.kladde);
    else if(s.kladde_html){ editor.setComponents(s.kladde_html); editor.setStyle(s.kladde_css || BASIS_CSS); }
    else editor.setStyle(BASIS_CSS);
    editor.Css.addRules(SYNLIG_CSS);
    editor.on('load', lærredsStil);
    /* Stiplede omrids om alle bokse, så tomme kolonner og rækker kan ses og
       rammes, når man trækker noget ind. Vises ikke på den udgivne side. */
    editor.on('load', function(){ editor.runCommand('core:component-outline'); });
    lærredsStil();

    ændret = false;
    editorStatus(s.udgivet_version ? 'Udgivet v' + s.udgivet_version : 'Ikke udgivet', 'svag');
    /* AUTOMATISK GEM: 3 sekunder efter sidste rettelse. Bedre end at skulle
       huske det; Gem-knappen og Ctrl+S findes stadig. */
    editor.on('update', function(){
      ændret = true; editorStatus('Ikke gemt', 'advar');
      clearTimeout(autogem);
      autogem = setTimeout(function(){ if(ændret && editor) gem().catch(function(){}); }, 3000);
    });
    editor.on('component:selected component:deselected component:update:attributes', function(){ tegnPanel(); });
    editor.on('component:styleUpdate', function(){ tegnPanel(true); });
    editor.on('canvas:drop', function(){ visVenstre('trin'); });
    /* Nye nedtællinger m.m. skal startes af runtime-scriptet i lærredet. */
    var genstartVent = null;
    editor.on('component:add', function(){
      clearTimeout(genstartVent);
      genstartVent = setTimeout(function(){ var w = editor && editor.Canvas.getWindow(); if(w && w.ArytmiRuntime) w.ArytmiRuntime.genstart(); }, 150);
    });
    hentBilleder();
    visVenstre(s.kladde_html || (s.kladde && s.kladde.pages) ? 'trin' : 'tilføj');
    visHøjre('indstillinger');
    vælgEnhed('computer');
    tegnPanel();
  }

  function tegnTrinListe(aktiv){
    var liste = $('sf-trinliste'); tøm(liste);
    if(aktiv.erSektion){ liste.appendChild(el('p', { klasse:'sf-hint', tekst:'Du retter en ' + (aktiv.universel ? 'universel' : 'gemt') + ' sektion. Tryk ← for at gå tilbage til siden.' })); return; }
    var trin = [];
    sider.filter(function(x){ return x.funnel_id === aktiv.funnel_id && !x.variant_af; }).forEach(function(x){ trin.push(x); var v = variantAf(x); if(v) trin.push(v); });
    trin.forEach(function(s){
      liste.appendChild(el('button', { type:'button', klasse:'sf-tl' + (s.id === aktiv.id ? ' aktiv' : ''), 'aria-current': s.id === aktiv.id ? 'page' : null,
        klik:function(){ if(s.id !== aktiv.id) åbn(s.id); } }, [
        miniature(s.id === aktiv.id ? aktiv : s, 56),
        el('span', {}, [ el('b', { tekst: s.variant_af ? 'B · ' + s.navn : (variantAf(s) ? 'A · ' : '') + s.navn }), el('small', { tekst: s.variant_af ? 'split-test, ' + s.split_vaegt + ' %' : s.sti }) ])
      ]));
    });
  }

  /* Funnelens stilguide og sidens egen CSS lægges i lærredet som et
     separat <style>, så de ses straks, men aldrig blandes ind i kladdens
     egen CSS. Samme CSS kommer med i forhåndsvisningen og udgivelsen. */
  var autogem = null;
  function ekstraCss(){
    if(!åbenSide) return '';
    var f = funnels.filter(function(x){ return x.id === åbenSide.funnel_id; })[0];
    return stilCss(f && f.stil) + (åbenSide.custom_css || '');
  }
  function lærredsStil(){
    if(!editor) return;
    var doc = editor.Canvas.getDocument();
    if(!doc || !doc.head) return;
    var st = doc.getElementById('arytmi-ekstra');
    if(!st){ st = doc.createElement('style'); st.id = 'arytmi-ekstra'; doc.head.appendChild(st); }
    st.textContent = ekstraCss();
  }

  function sideIndstillingerIEditor(){
    if(!åbenSide) return;
    if(åbenSide.erSektion){ editorStatus('En sektion har ingen sideindstillinger.', 'advar'); return; }
    sideIndstillinger(åbenSide, function(){
      $('sf-adresse').textContent = åbenSide.navn + ' · ' + åbenSide.sti;
      lærredsStil();
      editorStatus('Indstillinger gemt', 'god');
    });
  }
  /* Stilguiden kan rettes direkte fra editoren og ses med det samme. */
  function stilIEditor(){
    var f = åbenSide && funnels.filter(function(x){ return x.id === åbenSide.funnel_id; })[0];
    if(!f){ editorStatus('Løse sider har ingen funnel-stil.', 'advar'); return; }
    stilguide(f.stil).then(function(v){
      if(!v) return;
      return api.json('/rest/v1/funnel?id=eq.' + encodeURIComponent(f.id), { method:'PATCH', body:{ stil:v }, headers:{ Prefer:'return=minimal' } })
        .then(function(){ f.stil = v; lærredsStil(); editorStatus('Stilen er gemt for hele funnelen', 'god'); });
    }).catch(function(e){ editorStatus(api.forklar(e), 'fejl'); });
  }

  function lukEditor(){
    clearTimeout(autogem);
    if(åbenSide && åbenSide.erSektion){
      var tilbage = tilbageTil; tilbageTil = null;
      (ændret ? gem() : Promise.resolve()).then(function(){ if(tilbage){ ændret = false; åbn(tilbage); } else { ændret = false; lukEditor(); } }).catch(function(){});
      if(tilbage) return;
    }
    if(ændret && !confirm('Du har ændringer, der ikke er gemt. Luk alligevel?')) return;
    if(editor){ editor.destroy(); editor = null; }
    åbenSide = null; ændret = false;
    $('sider-editor').hidden = true;
    document.body.classList.remove('sf-redigerer');
    hent();
  }

  function editorStatus(t, slags){
    var s = $('sf-tilstand');
    s.textContent = t;
    s.className = 'sf-tilstand' + (slags ? ' ' + slags : '');
  }

  function gem(){
    if(!editor || !åbenSide) return Promise.resolve();
    editorStatus('Gemmer …', 'svag');
    if(åbenSide.erSektion){
      var sid = åbenSide.id, sk = { kladde: editor.getProjectData(), html: editor.getHtml().replace(/^<body[^>]*>|<\/body>$/g, ''), css: editor.getCss() };
      return api.json('/rest/v1/sektion?id=eq.' + encodeURIComponent(sid), { method:'PATCH', body:sk, headers:{ Prefer:'return=minimal' } })
        .then(function(){
          ændret = false;
          sektioner.forEach(function(x){ if(x.id === sid){ x.html = sk.html; x.css = sk.css; } });
          editorStatus(åbenSide.universel ? 'Gemt - slår igennem ved næste udgivelse af siderne' : 'Gemt', 'god');
        }).catch(function(f){ editorStatus(api.forklar(f), 'fejl'); throw f; });
    }
    var krop = { kladde: editor.getProjectData(), kladde_html: editor.getHtml(), kladde_css: editor.getCss() };
    var id = åbenSide.id;
    return api.json('/rest/v1/side?id=eq.' + encodeURIComponent(id), { method:'PATCH', body:krop, headers:{ Prefer:'return=minimal' } })
      .then(function(){
        ændret = false;
        sider.forEach(function(x){ if(x.id === id){ x.kladde_html = krop.kladde_html; x.kladde_css = krop.kladde_css; } });
        editorStatus('Gemt', 'god');
      }).catch(function(f){ editorStatus(api.forklar(f), 'fejl'); throw f; });
  }

  function udgiv(){
    if(!åbenSide) return;
    var døde = dødeTing();
    var liste = døde.length ? '\n\nDette virker ikke på den udgivne side:\n• ' + døde.slice(0, 12).join('\n• ') +
      (døde.length > 12 ? '\n• … og ' + (døde.length - 12) + ' mere' : '') + '\n\nTryk Annuller for at rette det først.' : '';
    if(!confirm('Udgiv "' + åbenSide.navn + '"' + (døde.length ? ' alligevel' : '') + '?\n\nKladden bliver den version, kunderne får, og den gemmes, så den kan hentes frem igen.' + liste)) return;
    gem().then(function(){ return api.rpc('udgiv_side', { p_side: åbenSide.id }); })
      .then(function(v){ åbenSide.udgivet_version = v; editorStatus('Udgivet v' + v, 'god'); })
      .catch(function(f){ editorStatus(api.forklar(f), 'fejl'); });
  }

  function versioner(){
    var s = åbenSide;
    api.json('/rest/v1/side_version?select=version,udgivet_kl&side_id=eq.' + encodeURIComponent(s.id) + '&order=version.desc&limit=20')
      .then(function(v){
        if(!v || !v.length){ alert('Siden er ikke udgivet endnu, så der er ingen versioner.'); return; }
        return modal('Hent en tidligere version', [
          { navn:'version', label:'Version', type:'number', værdi:String(v[0].version),
            hjælp: v.map(function(x){ return 'v' + x.version + ' · ' + dato(x.udgivet_kl); }).join('   ') + '. Versionen bliver kladden; den udgives først, når du trykker Udgiv.' }
        ], 'Hent som kladde').then(function(svar){
          var n = svar && parseInt(svar.version, 10);
          if(!n) return;
          if(ændret && !confirm('Kladden har ændringer, der ikke er gemt. De bliver overskrevet. Fortsæt?')) return;
          return api.rpc('hent_sideversion_som_kladde', { p_side:s.id, p_version:n }).then(function(){ ændret = false; åbn(s.id); });
        });
      }).catch(function(f){ editorStatus(api.forklar(f), 'fejl'); });
  }

  /* ---------- Venstre: trin og "Tilføj" ---------- */
  function visVenstre(hvad){
    ['trin', 'tilføj', 'lag', 'gemte'].forEach(function(p){
      $('sf-v-' + p).hidden = p !== hvad;
      var k = document.querySelector('#sf-venstre-faner [data-v="' + p + '"]');
      if(k) k.setAttribute('aria-selected', String(p === hvad));
    });
  }
  function visHøjre(hvad){
    ['indstillinger', 'avanceret'].forEach(function(p){
      $('sf-h-' + p).hidden = p !== hvad;
      var k = document.querySelector('#sf-højre-faner [data-h="' + p + '"]');
      if(k) k.setAttribute('aria-selected', String(p === hvad));
    });
  }

  /* ---------- Billeder ---------- */
  var TYPER = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/svg+xml':'svg', 'image/gif':'gif' };
  function billedURL(navn){ return api.PROJEKT_URL + '/storage/v1/object/public/' + SPAND + '/' + navn; }
  function hentBilleder(){
    api.json('/storage/v1/object/list/' + SPAND, { method:'POST', body:{ prefix:'', limit:200, sortBy:{ column:'created_at', order:'desc' } } })
      .then(function(liste){
        if(!editor) return;
        editor.AssetManager.add((liste || []).filter(function(f){ return f.id; }).map(function(f){ return { src:billedURL(f.name), name:f.name }; }));
      }).catch(function(){ /* biblioteket er en bekvemmelighed - upload virker stadig */ });
  }
  /* Én fil op i spanden. Giver den offentlige adresse. Bruges af editoren,
     favicon og delingsbilledet. */
  function uploadFil(fil){
    var ext = TYPER[fil.type];
    if(!ext) return Promise.reject(new Error('Kun JPG, PNG, WebP, SVG og GIF.'));
    if(fil.size > 5 * 1024 * 1024) return Promise.reject(new Error('Billedet er over 5 MB.'));
    var navn = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    return api.kaldRaa('/storage/v1/object/' + SPAND + '/' + navn, 'POST', fil, fil.type).then(function(r){
      if(!r.ok) throw new Error('Billedet blev afvist (' + r.status + ').');
      if(editor) editor.AssetManager.add({ src:billedURL(navn), name:navn });
      return billedURL(navn);
    });
  }
  function uploadBilleder(e){
    var filer = (e.dataTransfer ? e.dataTransfer.files : e.target.files) || [];
    Array.prototype.forEach.call(filer, function(fil){
      editorStatus('Lægger billedet op …', 'svag');
      uploadFil(fil).then(function(){ editorStatus('Billedet er lagt op', 'god'); })
        .catch(function(f){ editorStatus(f.message || api.forklar(f), 'fejl'); });
    });
  }
  function vælgBillede(komp){
    editor.AssetManager.open({
      select: function(asset, færdig){
        komp.set('src', asset.getSrc());
        if(færdig !== false) editor.AssetManager.close();
      }
    });
  }

  /* ---------- Enheder ---------- */
  function vælgEnhed(id){
    if(editor) editor.setDevice(id === 'computer' ? 'Computer' : id === 'tablet' ? 'Tablet' : 'Mobil');
    var k = document.querySelectorAll('#sf-enheder [data-enhed]');
    for(var i = 0; i < k.length; i++) k[i].setAttribute('aria-pressed', String(k[i].getAttribute('data-enhed') === id));
  }

  /* =============================================================
     HØJRE PANEL: DET VALGTE, PÅ DANSK
     =============================================================
     Grupperne følger elementkataloget i paritetslisten (afsnit E):
     egenskaber, tekst/skrift, knap, billede, baggrund, ramme, afstand,
     animation, vis på og element. Det tekniske ligger under "Avanceret".

     SKÆRMSTØRRELSE: står editoren på Tablet eller Mobil, gælder
     rettelserne KUN den skærmstørrelse (som en @media-regel). Det står
     øverst i panelet, så det aldrig sker ved et uheld. */
  var TYPE_NAVNE = {
    'a-sektion':'Sektion', 'a-raekke':'Række', 'a-kolonne':'Kolonne', 'a-flexboks':'Flex-boks', 'a-popup':'Popup',
    'a-overskrift':'Overskrift', 'a-knap':'Knap', 'a-video':'Video', 'a-videopopup':'Video-popup', 'a-lyd':'Lyd',
    'a-formular':'Formular', 'a-felt':'Formularfelt', 'a-afkrydsning':'Afkrydsning', 'a-ikonliste':'Liste',
    'a-nedtaelling':'Nedtælling', 'a-ikon':'Ikon', 'a-bjaelke':'Fremskridtsbjælke', 'a-egen-html':'Egen HTML',
    'a-universel':'Universel sektion', image:'Billede', link:'Link', text:'Tekst', wrapper:'Side'
  };
  function slags(k){
    if(!k) return '';
    var t = k.get('type'), tag = (k.get('tagName') || '').toLowerCase();
    if(t === 'image' || tag === 'img') return 'billede';
    if(t === 'a-knap' || t === 'link' || tag === 'button') return 'knap';
    if(t === 'a-overskrift' || /^h[1-6]$/.test(tag)) return 'overskrift';
    if(t === 'text' || tag === 'p' || tag === 'span' || tag === 'li' || tag === 'summary' || tag === 'cite' || tag === 'blockquote') return 'tekst';
    if(t === 'a-sektion' || t === 'a-popup' || tag === 'section' || tag === 'footer' || tag === 'header') return 'sektion';
    return 'boks';
  }
  function navnPå(k){
    if(!k) return 'Siden';
    var t = k.get('type');
    if(TYPE_NAVNE[t]) return TYPE_NAVNE[t];
    var tag = (k.get('tagName') || '').toLowerCase();
    if(tag === 'details') return 'Spørgsmål';
    if(tag === 'ul' || tag === 'ol') return 'Liste';
    if(tag === 'nav') return 'Menu';
    if((k.getClasses() || []).indexOf('a-wrap') >= 0) return 'Indhold';
    return { billede:'Billede', knap:'Knap / link', overskrift:'Overskrift', tekst:'Tekst', sektion:'Sektion', boks:'Boks' }[slags(k)] || 'Element';
  }

  /* ---------- Stil pr. skærmstørrelse ---------- */
  function enhed(){ var d = editor.Devices.getSelected(); return d ? d.id : 'computer'; }
  function mediaFor(){ var d = editor.Devices.getSelected(); var w = d && d.get('widthMedia'); return w ? '(max-width: ' + w + ')' : ''; }
  function regel(k, tilstand){
    var id = k.getId();
    if(!k.getAttributes().id) k.addAttributes({ id:id });
    var m = mediaFor(), sel = '#' + id + (tilstand ? ':' + tilstand : '');
    return { sel:sel, m:m };
  }
  function stilAf(k, tilstand){
    var r = regel(k, tilstand);
    if(!r.m && !tilstand) return k.getStyle();
    var rule = editor.Css.getRule(r.sel, r.m ? { atRuleType:'media', atRuleParams:r.m } : {});
    return rule ? rule.getStyle() : {};
  }
  function sætStil(k, o, tilstand){
    var r = regel(k, tilstand);
    if(!r.m && !tilstand){ k.addStyle(o); return; }
    var nu = stilAf(k, tilstand), ny = {};
    for(var x in nu) ny[x] = nu[x];
    for(var y in o){ if(o[y] === '' || o[y] === null) delete ny[y]; else ny[y] = o[y]; }
    editor.Css.setRule(r.sel, ny, r.m ? { atRuleType:'media', atRuleParams:r.m } : {});
    ændret = true; editor.trigger('update');
  }
  function fjernStil(k, prop, tilstand){ var o = {}; [].concat(prop).forEach(function(p){ o[p] = ''; });
    if(!mediaFor() && !tilstand) [].concat(prop).forEach(function(p){ k.removeStyle(p); }); else sætStil(k, o, tilstand); }

  /* Panelet kan få et element til at skifte attributter (fx få et id), og
     det udløser en ny tegning midt i den første. Den indre springes over. */
  var tegner = false;
  function tegnPanel(kunVærdier){
    if(tegner) return;
    tegner = true;
    try { tegnPanelNu(kunVærdier); } finally { tegner = false; }
  }
  function tegnPanelNu(kunVærdier){
    var boks = $('sf-h-indstillinger');
    if(!editor) return;
    var k = editor.getSelected();
    tegnSti(k);
    if(kunVærdier && boks.getAttribute('data-for') === (k && k.getId())) return;
    tøm(boks);
    $('sf-valgt').textContent = navnPå(k);
    boks.setAttribute('data-for', k ? k.getId() : '');
    if(!k){
      boks.appendChild(el('div', { klasse:'sf-tip' }, [
        el('b', { tekst:'Klik på noget i siden for at rette det.' }),
        el('p', { tekst:'Tekst skrives ved at dobbeltklikke i siden. Markér ord for fed, kursiv, link, farve og fremhævning. Byggeklodser hentes under "+ Tilføj".' })
      ]));
      gruppe(boks, 'Siden', [
        knapRække([ ['Sidens indstillinger', sideIndstillingerIEditor], ['Stilguide', stilIEditor] ]),
        knapRække([ ['Tidligere versioner', versioner], ['Indsæt fra udklip', function(){ indsæt(null); }] ])
      ]);
      return;
    }
    var s = slags(k), t = k.get('type');
    var st = stilAf(k);
    if(enhed() !== 'computer'){
      boks.appendChild(el('p', { klasse:'sf-enhedsbesked', tekst:'Du retter for ' + (enhed() === 'mobil' ? 'MOBIL' : 'TABLET') + '. Ændringerne gælder kun den skærmstørrelse.' }));
    }

    /* Elementets egne egenskaber (traits), tegnet på dansk */
    var traits = k.getTraits().filter(function(tr){ return tr.get('name') !== 'id' || t.indexOf('a-') === 0; });
    if(t === 'a-egen-html'){
      gruppe(boks, 'Kode', [
        el('p', { klasse:'sf-hint', tekst:'HTML, CSS og JavaScript. Køres ikke i editoren - kun i forhåndsvisningen og på den udgivne side.' }),
        knapRække([ ['Rediger koden', function(){
          modal('Egen HTML', [ { navn:'kode', label:'Kode', type:'kode', rader:16, værdi:k.get('kode') || '' } ], 'Brug koden', null, true)
            .then(function(v){ if(v){ k.set('kode', v.kode); k.view.render(); ændret = true; editor.trigger('update'); } });
        }] ])
      ]);
    } else if(traits.length && (t.indexOf('a-') === 0)){
      gruppe(boks, 'Egenskaber', traits.map(traitFelt));
    }

    if(s === 'tekst' || s === 'overskrift' || s === 'knap' || t === 'a-ikonliste' || t === 'a-felt'){
      gruppe(boks, 'Skrift', [
        s === 'knap' ? null : el('p', { klasse:'sf-hint', tekst:'Dobbeltklik i siden for at skrive.' }),
        vælgFelt('Skrifttype', 'font-family', k, st, SKRIFTER),
        farve('Farve', 'color', k, st),
        talFelt('Størrelse', 'font-size', k, st, 'px', 10, 120),
        vælgFelt('Tykkelse', 'font-weight', k, st, [['', 'Standard'], ['300', 'Tynd'], ['400', 'Normal'], ['500', 'Medium'], ['600', 'Halvfed'], ['700', 'Fed'], ['800', 'Ekstra fed'], ['900', 'Sort']]),
        talFelt('Linjehøjde (%)', 'line-height', k, st, '%', 80, 250),
        talFelt('Bogstavafstand', 'letter-spacing', k, st, 'px', -3, 12),
        valg('Store bogstaver', 'text-transform', k, st, [['none', 'Nej'], ['uppercase', 'STORE'], ['capitalize', 'Hvert Ord']]),
        valg('Justering', 'text-align', k, st, [['left', 'Venstre'], ['center', 'Midt'], ['right', 'Højre']])
      ]);
    }
    if(s === 'knap'){
      var hover = stilAf(k, 'hover');
      gruppe(boks, 'Knap', [
        k.components().length <= 2 && !k.find('img').length
          ? tekstFelt('Tekst på knappen', stripTags((k.components().filter(function(c){ return c.get('type') === 'textnode'; })[0] || { get:function(){ return ''; } }).get('content')),
              function(v){ var tn = k.components().filter(function(c){ return c.get('type') === 'textnode'; })[0]; if(tn) tn.set('content', v); else k.components(v); })
          : null,
        t === 'a-knap' ? null : tekstFelt('Link', k.getAttributes().href || '', function(v){ k.addAttributes({ href:v }); }, 'https://… eller #sektion'),
        farve('Baggrund', 'background-color', k, st),
        farve('Baggrund, når musen er over', 'background-color', k, hover, 'hover'),
        farve('Tekst, når musen er over', 'color', k, hover, 'hover'),
        talFelt('Indre luft (op/ned)', ['padding-top', 'padding-bottom'], k, st, 'px', 0, 60),
        talFelt('Indre luft (sider)', ['padding-left', 'padding-right'], k, st, 'px', 0, 120)
      ]);
    }
    if(s === 'billede'){
      gruppe(boks, 'Billede', [
        el('div', { klasse:'sf-billede-vis' }, [ el('img', { src:k.get('src'), alt:'' }) ]),
        knapRække([ ['Skift billede', function(){ vælgBillede(k); }] ]),
        tekstFelt('Beskrivelse (alt-tekst)', k.getAttributes().alt || '', function(v){ k.addAttributes({ alt:v }); }, 'Hvad viser billedet? Læses op for blinde.'),
        talFelt('Bredde (%)', 'width', k, st, '%', 5, 100),
        talFelt('Største bredde', 'max-width', k, st, 'px', 40, 2000),
        talFelt('Fast højde', 'height', k, st, 'px', 40, 1200),
        vælgFelt('Beskæring', 'object-fit', k, st, [['', 'Standard'], ['cover', 'Fyld (beskær)'], ['contain', 'Hele billedet'], ['fill', 'Stræk']]),
        valg('Placering', 'margin', k, st, [['0 auto 0 0', 'Venstre'], ['0 auto', 'Midt'], ['0 0 0 auto', 'Højre']])
      ]);
    }
    if(s === 'sektion' || s === 'boks' || t === 'a-kolonne' || t === 'a-raekke'){
      gruppe(boks, 'Baggrund', [
        farve('Baggrundsfarve', 'background-color', k, st),
        vælgFelt('Gradient', 'background-image', k, st, GRADIENTER),
        knapRække([ ['Baggrundsbillede', function(){
          editor.AssetManager.open({ select:function(a){ sætStil(k, { 'background-image':'url("' + a.getSrc() + '")', 'background-size':'cover', 'background-position':'center' }); editor.AssetManager.close(); tegnPanel(); } });
        }], ['Fjern', function(){ fjernStil(k, ['background-image', 'background-size', 'background-position']); tegnPanel(); }] ]),
        farve('Tekstfarve indeni', 'color', k, st)
      ]);
    }
    gruppe(boks, 'Ramme og skygge', [
      talFelt('Kantens tykkelse', 'border-width', k, st, 'px', 0, 20),
      farve('Kantens farve', 'border-color', k, st),
      vælgFelt('Kantens stil', 'border-style', k, st, [['', 'Ingen'], ['solid', 'Hel'], ['dashed', 'Stiplet'], ['dotted', 'Prikket']]),
      talFelt('Rund kant', 'border-radius', k, st, 'px', 0, 999),
      vælgFelt('Skygge', 'box-shadow', k, st, [['', 'Ingen'], ['0 1px 3px rgba(74,36,23,.12)', 'Lille'], ['0 8px 24px rgba(74,36,23,.14)', 'Mellem'], ['0 24px 60px rgba(74,36,23,.22)', 'Stor']]),
      talFelt('Gennemsigtighed (%)', 'opacity', k, st, '', 0, 100, function(v){ return v === '' ? '' : String(v / 100); }, function(v){ return v === undefined || v === '' ? '' : Math.round(parseFloat(v) * 100); })
    ]);
    gruppe(boks, 'Afstand', [
      talFelt('Luft over (indeni)', 'padding-top', k, st, 'px', 0, 400),
      talFelt('Luft under (indeni)', 'padding-bottom', k, st, 'px', 0, 400),
      talFelt('Luft i siderne (indeni)', ['padding-left', 'padding-right'], k, st, 'px', 0, 200),
      talFelt('Afstand over', 'margin-top', k, st, 'px', -200, 400),
      talFelt('Afstand under', 'margin-bottom', k, st, 'px', -200, 400),
      talFelt('Største bredde', 'max-width', k, st, 'px', 100, 2000)
    ]);
    gruppe(boks, 'Animation', [ animationFelter(k) ]);
    gruppe(boks, 'Vis på', [ synlighed(k) ]);
    gruppe(boks, 'Element', [
      knapRække([
        ['Vælg det udenom', function(){ var p = k.parent(); if(p && p.get('type') !== 'wrapper') editor.select(p); }],
        ['Duplikér', function(){ var c = k.clone(); k.parent().components().add(c, { at: k.index() + 1 }); editor.select(c); }]
      ]),
      knapRække([ ['Kopiér', function(){ kopiér(k); }], ['Indsæt efter', function(){ indsæt(k); }] ]),
      s === 'sektion' && t !== 'a-popup' ? knapRække([ ['Gem som sektion', function(){ gemSomSektion(k); }] ]) : null,
      knapRække([
        ['Flyt op', function(){ flytKomp(k, -1); }], ['Flyt ned', function(){ flytKomp(k, 1); }],
        ['Slet', function(){ k.remove(); editor.select(null); }, 'sf-farlig']
      ])
    ]);
  }
  function stripTags(h){
    return String(h || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim(); }
  function flytKomp(k, r){
    var p = k.parent(); if(!p) return;
    var i = k.index(), ny = i + r;
    if(ny < 0 || ny >= p.components().length) return;
    p.components().remove(k, { temporary:true });
    p.components().add(k, { at: ny });
    editor.select(k);
  }

  var GRADIENTER = [
    ['', 'Ingen'],
    ['linear-gradient(135deg,#4A2417 0%,#8F4333 100%)', 'Bark → kobber'],
    ['linear-gradient(180deg,#FAF6EF 0%,#efe5d8 100%)', 'Creme'],
    ['linear-gradient(135deg,#1f2a3a 0%,#3d5a73 100%)', 'Nat'],
    ['linear-gradient(135deg,#DE854A 0%,#f2b56b 100%)', 'Solnedgang'],
    ['linear-gradient(135deg,#2f4a3a 0%,#6f8f6a 100%)', 'Skov'],
    ['linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,.55) 100%)', 'Mørkt nedad (over billede)']
  ];

  /* ---------- Udklip: kopiér mellem sider ----------
     Gemmes på enheden (localStorage), så det kan sættes ind på en anden
     side eller i en anden funnel. Kun html og css - ingen persondata. */
  var UDKLIP = 'arytmi-udklip';
  function kopiér(k){
    var css = '';
    try { css = editor.getCss({ component:k }); } catch(e){ css = ''; }
    try { localStorage.setItem(UDKLIP, JSON.stringify({ html:k.toHTML(), css:css })); editorStatus('Kopieret', 'god'); }
    catch(e){ editorStatus('Kunne ikke kopiere på denne enhed.', 'fejl'); }
  }
  function indsæt(efter){
    var u = null;
    try { u = JSON.parse(localStorage.getItem(UDKLIP) || 'null'); } catch(e){}
    if(!u){ editorStatus('Udklipsholderen er tom. Vælg et element og tryk Kopiér.', 'advar'); return; }
    var nye = efter ? efter.parent().components().add(u.html, { at: efter.index() + 1 }) : editor.addComponents(u.html);
    if(u.css) editor.Css.addRules(u.css);
    var første = [].concat(nye)[0]; if(første) editor.select(første);
  }

  /* ---------- Egenskaber (traits) som danske felter ---------- */
  function traitFelt(tr){
    var type = tr.get('type'), label = tr.get('label') || tr.get('name'), v = tr.getValue();
    var sæt = function(x){ tr.setValue(x); ændret = true; };
    if(type === 'checkbox'){
      return afkryds(label, !!v && v !== 'false', function(ja){ sæt(ja); });
    }
    if(type === 'produktliste'){
      /* Ordreformularens produkter (egen checkout): en liste i rækkefølge,
         gemt som id'er adskilt med komma. Navnene fra bagrummets Produkter. */
      var alle = window.ArytmiProduktValg || [];
      var navn = function(id){ var p = alle.filter(function(x){ return x[0] === id; })[0]; return p ? p[1] : 'Ukendt produkt'; };
      var liste = String(v || '').split(',').filter(Boolean);
      var boks = el('div', { klasse:'sf-produktliste' }, [ el('span', { klasse:'sf-produktliste-titel', tekst:label }) ]);
      var gem = function(){ sæt(liste.join(',')); tegnPanel(); };
      liste.forEach(function(id, i){
        boks.appendChild(el('div', { klasse:'sf-produkt' }, [
          el('span', { tekst:(i + 1) + '. ' + navn(id) }),
          i ? el('button', { type:'button', klasse:'knap rolig lille', tekst:'↑', 'aria-label':'Flyt op', klik:function(){ liste.splice(i - 1, 0, liste.splice(i, 1)[0]); gem(); } }) : null,
          el('button', { type:'button', klasse:'knap rolig lille', tekst:'Fjern', klik:function(){ liste.splice(i, 1); gem(); } })
        ]));
      });
      var ledige = alle.filter(function(p){ return liste.indexOf(p[0]) < 0; });
      if(ledige.length){
        var tilføj = el('select', { klasse:'sf-vælg', 'aria-label':'Tilføj produkt' });
        tilføj.appendChild(el('option', { value:'', tekst: liste.length ? '+ Tilføj et produkt mere' : '+ Tilføj produkt' }));
        ledige.forEach(function(p){ tilføj.appendChild(el('option', { value:p[0], tekst:p[1] })); });
        tilføj.addEventListener('change', function(){ if(tilføj.value){ liste.push(tilføj.value); gem(); } });
        boks.appendChild(tilføj);
      }
      if(!alle.length) boks.appendChild(el('p', { klasse:'sf-hint', tekst:'Ingen produkter endnu. Opret dem under fanen Produkter.' }));
      else boks.appendChild(el('p', { klasse:'sf-hint', tekst:'Kunden vælger mellem dem i den rækkefølge. Bilmodel og pris hentes fra produktet.' }));
      return boks;
    }
    if(type === 'select'){
      var s = el('select', { klasse:'sf-vælg' });
      (tr.get('options') || []).forEach(function(o){
        var id = o.id !== undefined ? o.id : o.value;
        var opt = el('option', { value:id, tekst:o.name || o.label || id }); if(String(v) === String(id)) opt.selected = true; s.appendChild(opt);
      });
      s.addEventListener('change', function(){ sæt(s.value); });
      return el('label', { klasse:'sf-r lodret' }, [ el('span', { tekst:label }), s ]);
    }
    var i = el('input', { type: type === 'number' ? 'number' : type === 'color' ? 'color' : 'text' });
    i.value = v === undefined || v === null ? '' : v;
    var slags = tr.get('adresse');
    if(!slags){
      i.addEventListener('change', function(){ sæt(i.value); });
      return el('label', { klasse:'sf-r lodret' }, [ el('span', { tekst:label }), i ]);
    }
    /* Adressefelter tjekkes, før de gemmes (9/11): en forkert værdi gemmes
       ikke, og feltet siger hvorfor. Samme tjek som før Udgiv. */
    var fejlTekst = el('small', { klasse:'sf-felt-fejl', role:'alert' });
    var vis = function(f){ fejlTekst.textContent = f; fejlTekst.hidden = !f; i.setAttribute('aria-invalid', f ? 'true' : 'false'); };
    vis(window.ArytmiElementer.tjekAdresse(i.value, slags));
    i.addEventListener('input', function(){ if(i.getAttribute('aria-invalid') === 'true') vis(window.ArytmiElementer.tjekAdresse(i.value, slags)); });
    i.addEventListener('change', function(){
      var f = window.ArytmiElementer.tjekAdresse(i.value, slags);
      vis(f);
      if(!f) sæt(i.value.trim());
    });
    return el('label', { klasse:'sf-r lodret' }, [ el('span', { tekst:label }), i, fejlTekst ]);
  }

  /* ---------- Tjek før Udgiv (9/11) ----------
     K's regel: intet på den udgivne side må se ud til at virke uden at
     gøre det. Fundet ved gennemprøvningen: knapper og links uden mål,
     felter uden formular, adressefelter med vrøvl, billeder uden alt-tekst.
     Ser på siden, som editoren har tegnet den. Giver en liste på dansk. */
  function dødeTing(){
    var doc = editor && editor.Canvas.getDocument();
    if(!doc || !doc.body) return [];
    var ud = [], tjek = window.ArytmiElementer.tjekAdresse;
    var alle = function(sel){ return Array.prototype.slice.call(doc.body.querySelectorAll(sel)); };
    var navn = function(e){ var t = (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim(); return t ? '"' + (t.length > 40 ? t.slice(0, 40) + '…' : t) + '"' : (e.getAttribute('aria-label') ? '"' + e.getAttribute('aria-label') + '"' : 'uden tekst'); };
    var trin = sider.filter(function(x){ return x.funnel_id === åbenSide.funnel_id && !x.variant_af; })
      .sort(function(a, b){ return (a.raekkefoelge || 0) - (b.raekkefoelge || 0); });
    var sidsteTrin = !åbenSide.variant_af && trin.length && trin[trin.length - 1].id === åbenSide.id;
    var harPopup = !!doc.body.querySelector('[data-a-popup]');
    alle('a').forEach(function(a){
      if(a.hasAttribute('data-a-video') || a.hasAttribute('data-a-videopopup')) return;
      var h = a.getAttribute('data-a-handling'), href = (a.getAttribute('href') || '').trim();
      if(h === 'rul'){
        var m = a.getAttribute('data-a-maal');
        if(!m) ud.push('Knappen ' + navn(a) + ' skal rulle, men har intet sted at rulle til.');
        else if(!doc.getElementById(m)) ud.push('Knappen ' + navn(a) + ' ruller til "' + m + '", som ikke findes på siden.');
      } else if(h === 'naeste'){ if(sidsteTrin) ud.push('Knappen ' + navn(a) + ' går til næste trin, men siden er funnelens sidste trin.'); }
      else if(h === 'aaben-popup'){ if(!harPopup) ud.push('Knappen ' + navn(a) + ' åbner popuppen, men siden har ingen popup.'); }
      else if(h === 'send'){ if(!a.closest('form')) ud.push('Knappen ' + navn(a) + ' sender en formular, men står ikke i en formular.'); }
      else if(h === 'luk-popup'){ /* altid i orden */ }
      else if(!href || href === '#') ud.push('Linket ' + navn(a) + ' går ingen steder hen.');
      else if(href.charAt(0) === '#' && !doc.getElementById(href.slice(1))) ud.push('Linket ' + navn(a) + ' går til "' + href + '", som ikke findes på siden.');
      else if(tjek(href, 'link')) ud.push('Linket ' + navn(a) + ' har en adresse, der ikke virker: ' + href);
    });
    var løse = alle('input,select,textarea').filter(function(f){ return !f.closest('[data-a-ordreformular]') && !f.closest('form'); })
      .map(function(f){ return f.name || f.type; });
    if(løse.length) ud.push(løse.length + (løse.length === 1 ? ' felt står' : ' felter står') + ' uden for en formular, så det, kunden skriver, sendes ikke (' + løse.join(', ') + ').');
    alle('form').forEach(function(f){
      if(!f.closest('[data-a-ordreformular]') && !f.getAttribute('data-arytmi-formular')) ud.push('En formular har intet navn, så den gemmer ikke kontakter (sæt "Formularens navn").');
      var e = f.getAttribute('data-a-efter');
      if(e && tjek(e, 'link,naeste')) ud.push('Formularen "' + (f.getAttribute('data-arytmi-formular') || '') + '" går efter afsendelse til noget, der ikke virker: ' + e);
      else if(e && /^n(æ|ae)ste$/i.test(e) && sidsteTrin) ud.push('Formularen går efter afsendelse til næste trin, men siden er funnelens sidste trin.');
    });
    alle('[data-a-ordreformular]').forEach(function(o){ var e = o.getAttribute('data-a-efter'); if(e && tjek(e, 'link')) ud.push('Ordreformularen går efter betaling til noget, der ikke virker: ' + e); else if(!e && sidsteTrin) ud.push('Ordreformularen går efter betaling til næste trin, men siden er funnelens sidste trin (sæt "Efter betaling").'); });
    alle('[data-a-nedtaelling]').forEach(function(n){
      var e = n.getAttribute('data-a-ved-slut'); if(e && tjek(e, 'link,skjul')) ud.push('Nedtællingen gør ved slut noget, der ikke virker: ' + e);
      if(!n.getAttribute('data-a-evergreen') && tjek(n.getAttribute('data-a-slut') || '', 'dato')) ud.push('Nedtællingen har ingen gyldig slutdato.');
      else if(!n.getAttribute('data-a-evergreen') && !n.getAttribute('data-a-slut')) ud.push('Nedtællingen har ingen slutdato.');
    });
    alle('[data-a-video]').forEach(function(v){ var u = v.getAttribute('data-a-video'); if(!u || tjek(u, 'video')) ud.push('En video har ingen gyldig adresse' + (u ? ': ' + u : '.')); });
    alle('[data-a-videopopup]').forEach(function(v){ var u = v.getAttribute('data-a-videopopup'); if(!u || tjek(u, 'video')) ud.push('En video-popup har ingen gyldig adresse' + (u ? ': ' + u : '.')); });
    alle('audio').forEach(function(l){ var u = l.getAttribute('src'); if(!u || tjek(u, 'fil')) ud.push('En lydafspiller har ingen gyldig fil' + (u ? ': ' + u : '.')); });
    var udenAlt = alle('img').filter(function(b){ return !(b.getAttribute('alt') || '').trim(); }).length;
    if(udenAlt) ud.push(udenAlt + (udenAlt === 1 ? ' billede' : ' billeder') + ' uden alt-tekst (svagsynede og Google ser intet).');
    return ud;
  }

  /* ---------- Animation ----------
     Attributter, som side-runtime.js læser. Respekterer "reducer
     bevægelse" i kundens styresystem. */
  var ANIMATIONER = [['', 'Ingen'], ['fade', 'Ton frem'], ['glid', 'Glid op'], ['glid-venstre', 'Glid ind fra venstre'], ['glid-hoejre', 'Glid ind fra højre'],
    ['voks', 'Voks'], ['hop', 'Hop'], ['fold', 'Fold ud'], ['pust', 'Pust (sløret)'], ['drej', 'Drej'], ['afslor', 'Afslør'], ['vend', 'Vend'], ['svaev', 'Svæv ned']];
  function animationFelter(k){
    var a = k.getAttributes();
    var boks = el('div', { klasse:'sf-anim' });
    var type = el('select', { klasse:'sf-vælg' });
    ANIMATIONER.forEach(function(m){ var o = el('option', { value:m[0], tekst:m[1] }); if((a['data-a-anim'] || '') === m[0]) o.selected = true; type.appendChild(o); });
    type.addEventListener('change', function(){
      if(type.value) k.addAttributes({ 'data-a-anim':type.value }); else k.removeAttributes(['data-a-anim', 'data-a-anim-ved', 'data-a-anim-tid', 'data-a-anim-forsinkelse']);
      tegnPanel();
    });
    boks.appendChild(el('label', { klasse:'sf-r lodret' }, [ el('span', { tekst:'Type' }), type ]));
    if(a['data-a-anim']){
      var ved = el('select', { klasse:'sf-vælg' });
      [['', 'Når den rulles frem'], ['indlaes', 'Når siden åbnes']].forEach(function(m){ var o = el('option', { value:m[0], tekst:m[1] }); if((a['data-a-anim-ved'] || '') === m[0]) o.selected = true; ved.appendChild(o); });
      ved.addEventListener('change', function(){ if(ved.value) k.addAttributes({ 'data-a-anim-ved':ved.value }); else k.removeAttributes('data-a-anim-ved'); });
      boks.appendChild(el('label', { klasse:'sf-r lodret' }, [ el('span', { tekst:'Starter' }), ved ]));
      [['data-a-anim-tid', 'Varighed (ms)', 100, 2000, 600], ['data-a-anim-forsinkelse', 'Forsinkelse (ms)', 0, 2000, 0]].forEach(function(f){
        var n = el('input', { type:'number', min:f[2], max:f[3], step:50, klasse:'sf-tal', placeholder:String(f[4]) }); n.value = a[f[0]] || '';
        n.addEventListener('change', function(){ if(n.value) k.addAttributes(JSON.parse('{"' + f[0] + '":"' + Math.max(f[2], Math.min(f[3], +n.value)) + '"}')); else k.removeAttributes(f[0]); });
        boks.appendChild(el('div', { klasse:'sf-r' }, [ el('span', { tekst:f[1] }), n ]));
      });
      boks.appendChild(el('p', { klasse:'sf-hint', tekst:'Animationer vises i forhåndsvisningen og på den udgivne side, ikke i editoren.' }));
    }
    return boks;
  }

  /* Felterne i panelet */
  function gruppe(boks, titel, børn){ boks.appendChild(el('fieldset', { klasse:'sf-gruppe-felt' }, [ el('legend', { tekst:titel }) ].concat(børn))); }
  function knapRække(knapper){
    return el('div', { klasse:'sf-knaprække' }, knapper.map(function(k){
      return el('button', { type:'button', klasse:'knap rolig lille' + (k[2] ? ' ' + k[2] : ''), tekst:k[0], klik:k[1] });
    }));
  }
  function tekstFelt(label, værdi, sæt, ph){
    var i = el('input', { type:'text', placeholder:ph || '' }); i.value = værdi;
    i.addEventListener('change', function(){ sæt(i.value.trim()); });
    return el('label', { klasse:'sf-r lodret' }, [ el('span', { tekst:label }), i ]);
  }
  function afkryds(label, ja, sæt){
    var i = el('input', { type:'checkbox' }); i.checked = ja;
    i.addEventListener('change', function(){ sæt(i.checked); });
    return el('label', { klasse:'sf-r sf-afkryds' }, [ i, el('span', { tekst:label }) ]);
  }
  function farve(label, prop, k, st, tilstand){
    var v = st[prop] || '';
    var i = el('input', { type:'color' }); i.value = /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff';
    var nul = el('button', { type:'button', klasse:'sf-nul', title:'Fjern', 'aria-label':'Fjern ' + label.toLowerCase(), tekst:'×' });
    i.addEventListener('input', function(){ var o = {}; o[prop] = i.value; sætStil(k, o, tilstand); });
    nul.addEventListener('click', function(){ fjernStil(k, prop, tilstand); i.value = '#ffffff'; });
    return el('div', { klasse:'sf-r' }, [ el('span', { tekst:label + (v ? '' : ' (standard)') }), el('span', { klasse:'sf-farve' }, [ i, nul ]) ]);
  }
  /* ind/ud omregner værdien (fx gennemsigtighed 0-100 % ↔ 0-1). */
  function talFelt(label, prop, k, st, enhed, min, max, ud, ind){
    var props = [].concat(prop);
    var rå = st[props[0]];
    var v = ind ? ind(rå) : parseFloat(rå);
    if(v === '' || v === undefined) v = NaN;
    var sl = el('input', { type:'range', min:min, max:max, step:1 });
    var n = el('input', { type:'number', min:min, max:max, klasse:'sf-tal' });
    sl.value = isNaN(v) ? min : v; n.value = isNaN(v) ? '' : v; n.placeholder = 'auto';
    function sæt(x){
      if(x === ''){ fjernStil(k, props); return; }
      var o = {}, værdi = ud ? ud(x) : x + enhed;
      props.forEach(function(p){ o[p] = værdi; });
      sætStil(k, o);
    }
    sl.addEventListener('input', function(){ n.value = sl.value; sæt(sl.value); });
    n.addEventListener('change', function(){ if(n.value !== '') sl.value = n.value; sæt(n.value); });
    return el('div', { klasse:'sf-r' }, [ el('span', { tekst:label }), el('span', { klasse:'sf-skyder' }, [ sl, n ]) ]);
  }
  function valg(label, prop, k, st, valgmuligheder){
    var g = el('div', { klasse:'sf-seg', role:'group', 'aria-label':label });
    valgmuligheder.forEach(function(m){
      var b = el('button', { type:'button', 'aria-pressed':String(st[prop] === m[0]), tekst:m[1] });
      b.addEventListener('click', function(){ var o = {}; o[prop] = m[0]; sætStil(k, o); tegnPanel(); });
      g.appendChild(b);
    });
    return el('div', { klasse:'sf-r lodret' }, [ el('span', { tekst:label }), g ]);
  }
  function vælgFelt(label, prop, k, st, muligheder){
    var s = el('select', { klasse:'sf-vælg' });
    var nu = st[prop] || '';
    var fundet = false;
    muligheder.forEach(function(m){ var o = el('option', { value:m[0], tekst:m[1] }); if(m[0] === nu){ o.selected = true; fundet = true; } s.appendChild(o); });
    if(!fundet && nu){ var o = el('option', { value:nu, tekst:'Egen: ' + nu.slice(0, 30) }); o.selected = true; s.appendChild(o); }
    s.addEventListener('change', function(){ if(s.value) { var o = {}; o[prop] = s.value; sætStil(k, o); } else fjernStil(k, prop); });
    return el('label', { klasse:'sf-r lodret' }, [ el('span', { tekst:label }), s ]);
  }
  /* Synlighed med to klasser fra side-runtime.css. Ingen JavaScript. */
  function synlighed(k){
    var kl = k.getClasses();
    var nu = kl.indexOf('a-kun-computer') >= 0 ? 'computer' : kl.indexOf('a-kun-mobil') >= 0 ? 'mobil' : 'alle';
    var g = el('div', { klasse:'sf-seg', role:'group', 'aria-label':'Vis på' });
    [['alle','Alle'],['computer','Kun computer'],['mobil','Kun mobil']].forEach(function(m){
      var b = el('button', { type:'button', 'aria-pressed':String(nu === m[0]), tekst:m[1] });
      b.addEventListener('click', function(){
        k.removeClass('a-kun-computer'); k.removeClass('a-kun-mobil');
        if(m[0] !== 'alle') k.addClass('a-kun-' + m[0]);
        tegnPanel();
      });
      g.appendChild(b);
    });
    return g;
  }

  /* ---------- Stien nederst: hvor i siden er jeg? ---------- */
  function tegnSti(k){
    var sti = $('sf-sti'); tøm(sti);
    var kæde = [];
    for(var x = k; x; x = x.parent()) kæde.unshift(x);
    if(!kæde.length){ sti.appendChild(el('span', { tekst:'Intet valgt' })); return; }
    kæde.forEach(function(x, i){
      if(i) sti.appendChild(el('span', { klasse:'sf-pil', 'aria-hidden':'true', tekst:'›' }));
      sti.appendChild(el('button', { type:'button', klasse: x === k ? 'aktiv' : '', tekst:navnPå(x),
        klik:function(){ if(x.get('type') === 'wrapper') editor.select(null); else editor.select(x); } }));
    });
  }

  /* =============================================================
     ARYTMIS BLOKKE OG SKABELONER
     =============================================================
     Brandets farver (docs/checkout-css.md): bark #4A2417, kobber #8F4333,
     creme #FAF6EF, kant #D9CFC2, knap #DE854A. Overskrifter i Bodoni Moda,
     brødtekst i Manrope, som på funnelen i dag. "a-"-præfiks på alle
     klasser, og alt bryder pænt om på en telefon. */
  var BASIS_CSS =
    '*{box-sizing:border-box}' +
    'body{margin:0;font-family:Manrope,"Helvetica Neue",Arial,sans-serif;color:#4A2417;background:#FAF6EF;line-height:1.6}' +
    'h1,h2,h3{font-family:"Bodoni Moda",Georgia,serif;font-weight:600;line-height:1.15;margin:0 0 .5em}' +
    'img{max-width:100%;height:auto;display:block}' +
    '.a-wrap{max-width:1080px;margin:0 auto;padding:0 20px}' +
    '.a-knap{display:inline-block;background:#DE854A;color:#fff;text-decoration:none;font-weight:700;padding:16px 28px;border-radius:999px;border:0;font-size:17px;cursor:pointer}' +
    '.a-knap:hover{background:#c9733b}';
  /* De simple blokke herunder findes nu som rigtige elementer (sider-elementer.js).
     De bliver i BLOKKE, fordi skabelonerne bygges af dem, men vises ikke to gange. */
  var SKJULTE_BLOKKE = ['a-knap', 'a-billede', 'a-tekst', 'a-mellemrum', 'a-linje', 'a-to-kolonner', 'a-tre-kolonner'];
  var RUNTIME_V = '20261110b';
  var SYNLIG_CSS = '@media (max-width:768px){.a-kun-computer{display:none!important}}@media (min-width:769px){.a-kun-mobil{display:none!important}}';

  /* Pladsholderbilledet ligger i siden selv (data:). Et billede fra en
     fremmed server ville blive afvist af indholdspolitikken. */
  var PLADS = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">' +
    '<rect width="640" height="480" fill="#D9CFC2"/>' +
    '<text x="320" y="248" font-family="Arial" font-size="28" fill="#4A2417" text-anchor="middle">Vælg et billede</text></svg>');

  /* Små skitser af blokkene, så man kan se, hvad man trækker ind. */
  function skitse(indhold){
    return '<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" class="sf-skitse">' +
      '<rect width="120" height="80" rx="6" fill="#FAF6EF" stroke="#D9CFC2"/>' + indhold + '</svg>';
  }
  var L = function(x, y, w, h, f){ return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (h || 4) + '" rx="2" fill="' + (f || '#B9A99A') + '"/>'; };
  var B = function(x, y, w, h){ return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4" fill="#D9CFC2"/>'; };
  var K = function(x, y, w){ return '<rect x="' + x + '" y="' + y + '" width="' + (w || 30) + '" height="9" rx="4.5" fill="#DE854A"/>'; };
  var T = function(x, y, w){ return L(x, y, w || 40, 6, '#4A2417'); };

  function blok(id, navn, kategori, media, html){ return { id:id, label:navn, category:kategori, media:media, content:html }; }

  var BLOKKE = [
    blok('a-hero', 'Hero', 'Sektioner', skitse(T(10,18,44) + T(10,27,36) + L(10,38,46) + L(10,45,40) + K(10,55) + B(66,14,44,52)),
      '<section class="a-hero"><div class="a-wrap a-hero-in">' +
      '<div class="a-hero-tekst"><p class="a-over">Små eventyr i bilen</p>' +
      '<h1>Fra idé til afsted på en eftermiddag</h1>' +
      '<p class="a-ingress">Skriv en kort tekst om, hvad kunden får, og hvorfor det er nu.</p>' +
      '<a class="a-knap" href="#">Se madrasserne</a></div>' +
      '<div class="a-hero-billede"><img src="' + PLADS + '" alt=""></div>' +
      '</div></section>' +
      '<style>.a-hero{padding:64px 0;background:#FAF6EF}.a-hero-in{display:flex;gap:40px;align-items:center;flex-wrap:wrap}' +
      '.a-hero-tekst{flex:1 1 380px}.a-hero-billede{flex:1 1 380px}.a-hero-billede img{border-radius:18px}' +
      '.a-over{text-transform:uppercase;letter-spacing:.12em;font-size:13px;color:#8F4333;margin:0 0 8px}' +
      '.a-hero h1{font-size:clamp(34px,5vw,56px)}.a-ingress{font-size:19px;margin:0 0 28px}</style>'),

    blok('a-hero-billede', 'Hero med baggrund', 'Sektioner',
      skitse('<rect x="1" y="1" width="118" height="78" rx="6" fill="#8F4333" opacity=".55"/>' + L(40,22,40,6,'#fff') + L(34,31,52,6,'#fff') + L(36,42,48,3,'#fff') + K(45,52)),
      '<section class="a-hb"><div class="a-wrap a-hb-in"><p class="a-over">Små eventyr. Store øjeblikke.</p>' +
      '<h1>Du har allerede bilen.<br>Vi har eventyret.</h1>' +
      '<p class="a-ingress">En kort tekst, der får lyst til at læse videre.</p>' +
      '<a class="a-knap" href="#">Se, hvordan I kommer afsted</a></div></section>' +
      '<style>.a-hb{padding:120px 0;background:#4A2417 center/cover no-repeat;color:#FAF6EF;text-align:center}' +
      '.a-hb .a-over{color:#FAF6EF}.a-hb h1{font-size:clamp(36px,5.5vw,64px)}.a-hb .a-ingress{max-width:640px;margin:0 auto 28px}</style>'),

    blok('a-tekst-billede', 'Tekst + billede', 'Sektioner', skitse(B(10,14,46,52) + T(66,22,40) + L(66,33,44) + L(66,40,38) + L(66,47,42)),
      '<section class="a-tb"><div class="a-wrap a-tb-in">' +
      '<div class="a-tb-billede"><img src="' + PLADS + '" alt=""></div>' +
      '<div class="a-tb-tekst"><h2>Overskrift</h2><p>Brødtekst. Fortæl én ting godt.</p></div>' +
      '</div></section>' +
      '<style>.a-tb{padding:56px 0}.a-tb-in{display:flex;gap:40px;align-items:center;flex-wrap:wrap}' +
      '.a-tb-billede,.a-tb-tekst{flex:1 1 360px}.a-tb-billede img{border-radius:16px}.a-tb h2{font-size:clamp(28px,3.5vw,40px)}</style>'),

    blok('a-billede-tekst', 'Billede + tekst (spejlet)', 'Sektioner', skitse(T(12,22,40) + L(12,33,44) + L(12,40,38) + L(12,47,42) + B(64,14,46,52)),
      '<section class="a-tb"><div class="a-wrap a-tb-in a-spejl">' +
      '<div class="a-tb-billede"><img src="' + PLADS + '" alt=""></div>' +
      '<div class="a-tb-tekst"><h2>Overskrift</h2><p>Brødtekst. Fortæl én ting godt.</p></div>' +
      '</div></section>' +
      '<style>.a-tb{padding:56px 0}.a-tb-in{display:flex;gap:40px;align-items:center;flex-wrap:wrap}.a-spejl{flex-direction:row-reverse}' +
      '.a-tb-billede,.a-tb-tekst{flex:1 1 360px}.a-tb-billede img{border-radius:16px}.a-tb h2{font-size:clamp(28px,3.5vw,40px)}</style>'),

    blok('a-fordele', 'Tre fordele', 'Sektioner', skitse(T(40,10,40) + B(8,24,32,46) + B(44,24,32,46) + B(80,24,32,46)),
      '<section class="a-fordele"><div class="a-wrap"><h2>Derfor Arytmi</h2><div class="a-f-raekke">' +
      '<div class="a-f"><h3>Klar på et minut</h3><p>Kort forklaring.</p></div>' +
      '<div class="a-f"><h3>Passer til bilen</h3><p>Kort forklaring.</p></div>' +
      '<div class="a-f"><h3>Appen med</h3><p>Kort forklaring.</p></div>' +
      '</div></div></section>' +
      '<style>.a-fordele{padding:56px 0;background:#fff}.a-fordele h2{text-align:center;font-size:clamp(28px,3.5vw,40px)}' +
      '.a-f-raekke{display:flex;gap:20px;flex-wrap:wrap;margin-top:24px}' +
      '.a-f{flex:1 1 260px;border:1.5px solid #D9CFC2;border-radius:16px;padding:24px;background:#FAF6EF}.a-f h3{font-size:22px}</style>'),

    blok('a-anmeldelser', 'Anmeldelser', 'Sektioner', skitse(T(40,10,40) + B(8,26,50,40) + B(62,26,50,40) + L(14,34,36,3,'#4A2417') + L(68,34,36,3,'#4A2417')),
      '<section class="a-anm"><div class="a-wrap"><h2>Det siger de</h2><div class="a-anm-raekke">' +
      '<blockquote class="a-citat"><p>"Citat fra en kunde."</p><cite>Navn, by</cite></blockquote>' +
      '<blockquote class="a-citat"><p>"Citat fra en kunde."</p><cite>Navn, by</cite></blockquote>' +
      '</div></div></section>' +
      '<style>.a-anm{padding:56px 0}.a-anm h2{text-align:center}.a-anm-raekke{display:flex;gap:20px;flex-wrap:wrap}' +
      '.a-citat{flex:1 1 320px;margin:0;background:#fff;border-radius:16px;padding:24px;border:1.5px solid #D9CFC2}' +
      '.a-citat p{font-family:"Bodoni Moda",Georgia,serif;font-size:20px;margin:0 0 12px}.a-citat cite{font-style:normal;color:#8F4333;font-size:14px}</style>'),

    blok('a-faq', 'Spørgsmål og svar', 'Sektioner', skitse(T(36,10,48) + L(14,26,92,3,'#4A2417') + L(14,32,92,1) + L(14,42,92,3,'#4A2417') + L(14,48,92,1) + L(14,58,92,3,'#4A2417') + L(14,64,92,1)),
      '<section class="a-faq"><div class="a-wrap"><h2>Spørgsmål og svar</h2>' +
      '<details><summary>Spørgsmål?</summary><p>Svar.</p></details>' +
      '<details><summary>Spørgsmål?</summary><p>Svar.</p></details>' +
      '<details><summary>Spørgsmål?</summary><p>Svar.</p></details>' +
      '</div></section>' +
      '<style>.a-faq{padding:56px 0}.a-faq .a-wrap{max-width:760px}.a-faq h2{text-align:center}' +
      '.a-faq details{border-bottom:1px solid #D9CFC2;padding:16px 0}.a-faq summary{cursor:pointer;font-weight:700;font-size:18px}' +
      '.a-faq details p{margin:10px 0 0}</style>'),

    blok('a-overskrift', 'Overskrift + tekst', 'Tekst', skitse(T(30,26,60) + L(20,40,80) + L(28,47,64)),
      '<section class="a-ot"><div class="a-wrap"><h2>Overskrift</h2><p>Skriv teksten her.</p></div></section>' +
      '<style>.a-ot{padding:48px 0;text-align:center}.a-ot h2{font-size:clamp(28px,3.5vw,40px)}.a-ot p{max-width:680px;margin:0 auto;font-size:18px}</style>'),
    blok('a-tekst', 'Tekstafsnit', 'Tekst', skitse(L(14,22,92) + L(14,30,88) + L(14,38,92) + L(14,46,70)),
      '<p style="max-width:760px;margin:16px auto;padding:0 20px;font-size:18px">Skriv teksten her.</p>'),
    blok('a-knap', 'Knap', 'Tekst', skitse(K(35,35,50)), '<div style="text-align:center;padding:16px 0"><a class="a-knap" href="#">Køb nu</a></div>'),
    blok('a-billede', 'Billede', 'Medier', skitse(B(20,12,80,56)), { type:'image', src:PLADS, style:{ 'max-width':'100%', 'border-radius':'16px' }, activate:true }),

    blok('a-pris', 'Priskort', 'Salg', skitse('<rect x="34" y="8" width="52" height="64" rx="6" fill="#fff" stroke="#D9CFC2"/>' + T(46,15,28) + L(44,26,32,7,'#4A2417') + L(42,38,36,2) + L(42,43,36,2) + L(42,48,36,2) + K(45,57)),
      '<section class="a-pris"><div class="a-wrap"><div class="a-pris-kort">' +
      '<h3>Produktnavn</h3><p class="a-pris-beloeb">2.995 kr.</p>' +
      '<ul><li>Det får kunden</li><li>Det får kunden</li><li>Det får kunden</li></ul>' +
      '<a class="a-knap" href="#">Vælg</a></div></div></section>' +
      '<style>.a-pris{padding:48px 0}.a-pris-kort{max-width:420px;margin:0 auto;background:#fff;border:1.5px solid #D9CFC2;border-radius:18px;padding:32px;text-align:center}' +
      '.a-pris-beloeb{font-family:"Bodoni Moda",Georgia,serif;font-size:40px;margin:0 0 16px}' +
      '.a-pris-kort ul{text-align:left;margin:0 0 24px;padding-left:20px}</style>'),

    /* Formularen gemmer først noget, når formularmodulet er bygget. Samtykket
       til nyhedsmails er et AKTIVT flueben (markedsføringsloven § 10). */
    blok('a-formular', 'Tilmeldingsformular', 'Salg', skitse('<rect x="30" y="8" width="60" height="64" rx="6" fill="#fff" stroke="#D9CFC2"/>' + T(40,14,40) + B(38,26,44,8) + B(38,38,44,8) + L(38,50,44,2) + K(45,58)),
      '<section class="a-form"><div class="a-wrap"><form class="a-form-kort" data-arytmi-formular="tilmelding">' +
      '<h3>Få besked først</h3>' +
      '<label>Fornavn<input type="text" name="fornavn" autocomplete="given-name"></label>' +
      '<label>Mail<input type="email" name="email" required autocomplete="email"></label>' +
      '<label class="a-samtykke"><input type="checkbox" name="samtykke_nyheder" value="ja"> Ja tak, send mig nyheder og tilbud fra Arytmi på mail. Jeg kan altid afmelde mig.</label>' +
      '<button class="a-knap" type="submit">Tilmeld</button></form></div></section>' +
      '<style>.a-form{padding:48px 0}.a-form-kort{max-width:460px;margin:0 auto;background:#fff;border:1.5px solid #D9CFC2;border-radius:18px;padding:28px;display:flex;flex-direction:column;gap:14px}' +
      '.a-form-kort label{display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:15px}' +
      '.a-form-kort input[type=text],.a-form-kort input[type=email]{font:inherit;padding:12px 14px;border:1.5px solid #D9CFC2;border-radius:10px}' +
      '.a-form-kort .a-samtykke{flex-direction:row;align-items:flex-start;gap:10px;font-weight:400;font-size:14px}</style>'),

    blok('a-to-kolonner', 'To kolonner', 'Layout', skitse(B(10,14,48,52) + B(62,14,48,52)),
      '<div class="a-wrap a-2k"><div class="a-k"><p>Venstre</p></div><div class="a-k"><p>Højre</p></div></div>' +
      '<style>.a-2k{display:flex;gap:24px;flex-wrap:wrap;padding:24px 20px}.a-k{flex:1 1 320px;min-height:60px}</style>'),
    blok('a-tre-kolonner', 'Tre kolonner', 'Layout', skitse(B(8,14,32,52) + B(44,14,32,52) + B(80,14,32,52)),
      '<div class="a-wrap a-2k"><div class="a-k"><p>Første</p></div><div class="a-k"><p>Anden</p></div><div class="a-k"><p>Tredje</p></div></div>' +
      '<style>.a-2k{display:flex;gap:24px;flex-wrap:wrap;padding:24px 20px}.a-k{flex:1 1 240px;min-height:60px}</style>'),
    blok('a-mellemrum', 'Mellemrum', 'Layout', skitse('<path d="M60 22v36M52 30l8-8 8 8M52 50l8 8 8-8" stroke="#B9A99A" stroke-width="2" fill="none"/>'), '<div style="height:48px"></div>'),
    blok('a-linje', 'Skillelinje', 'Layout', skitse(L(14,39,92,2)), '<hr style="border:0;border-top:1px solid #D9CFC2;margin:32px auto;max-width:1080px">'),
    blok('a-sidefod', 'Sidefod', 'Layout', skitse('<rect x="1" y="50" width="118" height="29" rx="0" fill="#4A2417"/>' + L(34,58,52,3,'#FAF6EF') + L(42,66,36,3,'#FAF6EF')),
      '<footer class="a-fod"><div class="a-wrap">' +
      '<p>Arytmi · Alveni ApS · <a href="mailto:kundeservice@arytmi.com">kundeservice@arytmi.com</a></p>' +
      '<p><a href="https://arytmi.com/handelsbetingelser">Handelsbetingelser</a> · <a href="https://arytmi.com/privatliv">Privatlivspolitik</a></p>' +
      '</div></footer>' +
      '<style>.a-fod{padding:32px 0;background:#4A2417;color:#FAF6EF;font-size:14px;text-align:center}.a-fod a{color:#FAF6EF}.a-fod p{margin:4px 0}</style>')
  ];

  /* Skabelonerne er blokkene sat sammen til en hel side. html og css holdes
     adskilt, så miniaturen i "Nyt trin" kan vise dem. */
  function delt(ids){
    var html = '', css = '';
    ids.forEach(function(id){
      var b = BLOKKE.filter(function(x){ return x.id === id; })[0];
      if(!b || typeof b.content !== 'string') return;
      html += b.content.replace(/<style>([\s\S]*?)<\/style>/g, function(_, c){ css += c; return ''; });
    });
    return { html:html, css:css };
  }
  function sk(id, navn, om, sti, ids){ var d = delt(ids); return { id:id, navn:navn, om:om, sti:sti, html:d.html, css:d.css }; }
  var SKABELONER = [
    { id:'tom', navn:'Tom side', om:'Start helt fra bunden.', sti:'', html:'', css:'' },
    sk('salg', 'Salgsside', 'Hero, fordele, billede, anmeldelser, spørgsmål og knap.', 'salg',
       ['a-hero-billede', 'a-fordele', 'a-tekst-billede', 'a-anmeldelser', 'a-faq', 'a-knap', 'a-sidefod']),
    sk('tilmelding', 'Tilmelding', 'Kort hero og en tilmeldingsformular.', 'tilmeld', ['a-hero', 'a-formular', 'a-sidefod']),
    sk('pris', 'Betaling', 'Priskort og knap. Rigtig checkout kommer senere.', 'betaling', ['a-overskrift', 'a-pris', 'a-faq', 'a-sidefod']),
    sk('tak', 'Tak', 'Tak for købet og hvad der sker nu.', 'tak', ['a-overskrift', 'a-tekst-billede', 'a-sidefod'])
  ];

  /* =============================================================
     FUNNEL-SKABELONER (punkt 3) - Arytmis egne
     =============================================================
     Hvert trin er sat sammen af blokkene ovenfor (id) og de stykker
     herunder, som bruger elementerne fra sider-elementer.js. Teksterne er
     pladsholdere, der fortæller, hvad der skal stå. */
  var STK = {
    nedtaelling: { html:'<section class="a-sek" style="padding:40px 0;text-align:center"><div class="a-wrap"><h2>Tilbuddet slutter om</h2>' +
      '<div class="a-nedtaelling" data-a-nedtaelling="" data-a-slut="2026-12-14T23:59"><div class="a-nt-del"><b data-a-d>00</b><span>dage</span></div>' +
      '<div class="a-nt-del"><b data-a-t>00</b><span>timer</span></div><div class="a-nt-del"><b data-a-m>00</b><span>min</span></div><div class="a-nt-del"><b data-a-s>00</b><span>sek</span></div></div></div></section>', css:'' },
    tilmelding: { html:'<section class="a-sek" id="tilmeld"><div class="a-wrap"><form class="a-form-kort" data-arytmi-formular="tilmelding" style="max-width:480px;margin:0 auto;background:#fff;border:1.5px solid #D9CFC2;border-radius:18px;padding:28px">' +
      '<h3 style="text-align:center">Skriv dig op</h3>' +
      '<label class="a-felt">Fornavn<input type="text" name="first_name" autocomplete="given-name"></label>' +
      '<label class="a-felt">Mail<input type="email" name="email" required autocomplete="email"></label>' +
      '<label class="a-felt a-afkryds"><input type="checkbox" name="samtykke_nyheder" value="ja"> Ja tak, send mig nyheder og tilbud fra Arytmi på mail. Jeg kan altid afmelde mig.</label>' +
      '<a class="a-knap a-bred" href="#" data-a-handling="send">Send mig det</a></form></div></section>', css:'' },
    pasform: { html:'<section class="a-sek"><div class="a-wrap"><form class="a-form-kort" data-arytmi-formular="pasform" style="max-width:560px;margin:0 auto;background:#fff;border:1.5px solid #D9CFC2;border-radius:18px;padding:28px">' +
      '<h3>Passer det til jeres bil?</h3><p>Svar på tre ting, så vender vi tilbage inden for et døgn.</p>' +
      '<label class="a-felt">Bilmodel<select name="bilmodel" required><option value="">Vælg …</option><option>Model Y Juniper</option><option>Model Y (2021–2025)</option><option>Model X</option><option>Anden bil</option></select></label>' +
      '<label class="a-felt">Fortæl lidt om bilen<textarea name="biloplysninger"></textarea></label>' +
      '<label class="a-felt">Mail<input type="email" name="email" required autocomplete="email"></label>' +
      '<a class="a-knap a-bred" href="#" data-a-handling="send">Send spørgsmålet</a></form></div></section>', css:'' },
    kommer: { html:'<section class="a-sek" style="padding:110px 0;background:#4A2417;color:#FAF6EF;text-align:center"><div class="a-wrap"><p class="a-over" style="color:#FAF6EF">Kommer snart</p>' +
      '<h1 style="font-size:clamp(36px,5vw,60px)">Noget nyt er på vej</h1><p style="max-width:620px;margin:0 auto 24px">Skriv dig op og vær blandt de første, der får besked.</p>' +
      '<a class="a-knap" href="#tilmeld" data-a-handling="rul" data-a-maal="tilmeld">Skriv mig op</a></div></section>', css:'' },
    tak: { html:'<section class="a-sek" style="text-align:center"><div class="a-wrap" style="max-width:720px"><h1>Tak!</h1>' +
      '<p style="font-size:19px">Skriv kort, hvad der sker nu, og hvornår kunden hører fra jer.</p>' +
      '<ul class="a-ikonliste" style="text-align:left;display:inline-block;margin-top:16px"><li>Du får en mail med det samme</li><li>Næste skridt …</li><li>Har du spørgsmål, så skriv til kundeservice@arytmi.com</li></ul></div></section>', css:'' },
    video: { html:'<section class="a-sek"><div class="a-wrap" style="max-width:900px"><div class="a-video" data-a-video="https://www.youtube.com/watch?v=" role="button" aria-label="Afspil video"><span class="a-video-tekst">Tryk for at afspille</span></div>' +
      '<p style="text-align:center;margin-top:18px">Én sætning om, hvad videoen viser.</p></div></section>', css:'' },
    popup: { html:'<div class="a-popup" data-a-popup="" data-a-popup-trigger="forlad"><div class="a-popup-boks">' +
      '<button type="button" class="a-popup-luk" data-a-handling="luk-popup" aria-label="Luk">×</button>' +
      '<section class="a-sek" style="padding:44px 0;text-align:center"><div class="a-wrap"><h2>Vent lidt!</h2><p>Brug koden <b>EVENTYR10</b> og få 10 % i dag.</p>' +
      '<a class="a-knap" href="#" data-a-handling="luk-popup">Tag mig tilbage</a></div></section></div></div>', css:'' }
  };
  function trin(navn, sti, dele){
    var html = '', css = '';
    dele.forEach(function(d){
      if(typeof d === 'string'){ var x = delt([d]); html += x.html; css += x.css; }
      else { html += d.html; css += d.css || ''; }
    });
    return { navn:navn, sti:sti, html:html, css:css };
  }
  function BETALING(){ return trin('Betaling', 'betaling', ['a-overskrift', 'a-pris', 'a-faq', 'a-sidefod']); }
  function TAK(){ return trin('Tak', 'tak', [STK.tak, 'a-sidefod']); }
  var FUNNEL_SKABELONER = [
    { id:'tilmelding', navn:'Tilmelding med gave', om:'Giv noget værdifuldt (fx en tjekliste eller e-bog) for en mail. Tilmelding og tak.',
      formål:'Få flere kontakter', type:'Tilmeldingsfunnel', kategori:'Alle brancher',
      trin:[ trin('Tilmelding', 'tilmeld', ['a-hero', STK.tilmelding, 'a-fordele', 'a-sidefod']), TAK() ] },
    { id:'fysisk', navn:'Sælg et fysisk produkt', om:'Salgsside med fordele, billeder, anmeldelser og spørgsmål, derefter betaling og tak.',
      formål:'Sælg et fysisk produkt', type:'Produktfunnel', kategori:'Rejse & friluftsliv',
      trin:[ trin('Salgsside', 'salg', ['a-hero-billede', 'a-fordele', 'a-tekst-billede', 'a-anmeldelser', 'a-faq', 'a-knap', 'a-sidefod']), BETALING(), TAK() ] },
    { id:'gave', navn:'Gave til en anden', om:'Gavevinkel med nedtælling til sidste købsdag. Gaveside, betaling og tak.',
      formål:'Sælg et fysisk produkt', type:'Kampagnefunnel', kategori:'Rejse & friluftsliv',
      trin:[ trin('Gaveside', 'gave', ['a-hero-billede', STK.nedtaelling, 'a-fordele', 'a-anmeldelser', 'a-knap', 'a-sidefod']), BETALING(), TAK() ] },
    { id:'pasform', navn:'Pasformstjek før køb', om:'Kunden svarer på bilmodel og spørgsmål, I vender tilbage. Godt til dyre køb, hvor tvivl stopper salget.',
      formål:['Få flere kontakter', 'Hjælp kunden med at vælge'], type:'Spørgeskemafunnel', kategori:'Rejse & friluftsliv',
      trin:[ trin('Spørgsmål', 'passer-det', ['a-overskrift', STK.pasform, 'a-sidefod']), TAK() ] },
    { id:'venteliste', navn:'Venteliste til lancering', om:'"Kommer snart" med nedtælling og tilmelding. Byg forventning før lanceringen.',
      formål:'Få flere kontakter', type:'Lanceringsfunnel', kategori:'Alle brancher',
      trin:[ trin('Kommer snart', 'snart', [STK.kommer, STK.nedtaelling, STK.tilmelding, 'a-sidefod']), TAK() ] },
    { id:'video', navn:'Videosalgsside', om:'Videoen gør arbejdet: video øverst, anmeldelser og knap. Video indlæses først ved klik.',
      formål:['Sælg et fysisk produkt', 'Sælg et digitalt produkt'], type:'Præsentationsfunnel', kategori:'Alle brancher',
      trin:[ trin('Video', 'se-videoen', ['a-overskrift', STK.video, 'a-knap', 'a-anmeldelser', 'a-sidefod']), BETALING(), TAK() ] },
    { id:'app', navn:'Abonnement eller app', om:'Til et digitalt produkt med årlig betaling: fordele, billede og tekst, spørgsmål og betaling.',
      formål:'Sælg et digitalt produkt', type:'Produktfunnel', kategori:'Digitalt',
      trin:[ trin('Salgsside', 'appen', ['a-hero', 'a-fordele', 'a-billede-tekst', 'a-faq', 'a-knap', 'a-sidefod']), BETALING(), TAK() ] },
    { id:'begivenhed', navn:'Tilmelding til en begivenhed', om:'Til en fællestur, workshop eller et webinar: nedtælling, program og tilmelding.',
      formål:'Fyld en begivenhed', type:'Begivenhedsfunnel', kategori:'Begivenheder',
      trin:[ trin('Begivenhed', 'begivenhed', ['a-hero-billede', STK.nedtaelling, 'a-tekst-billede', STK.tilmelding, 'a-faq', 'a-sidefod']), trin('Bekræftelse', 'bekraeftelse', [STK.tak, 'a-sidefod']) ] },
    { id:'kampagne', navn:'Kampagne med rabat-popup', om:'Salgsside med pris og en popup, når kunden vil forlade siden. Rabatkoden er en pladsholder.',
      formål:'Sælg et fysisk produkt', type:'Kampagnefunnel', kategori:'Alle brancher',
      trin:[ trin('Kampagne', 'kampagne', ['a-hero-billede', 'a-fordele', 'a-pris', 'a-sidefod', STK.popup]), TAK() ] }
  ];

  /* GrapesJS' egne tekster på dansk - kun dem, der ses. */
  var DANSK = {
    assetManager: { addButton:'Tilføj billede', inputPlh:'https://adresse/til/billede.jpg', modalTitle:'Vælg billede', uploadTitle:'Træk et billede hertil, eller klik for at vælge' },
    blockManager: { labels:{}, categories:{} },
    domComponents: { names:{ '':'Boks', wrapper:'Side', text:'Tekst', comment:'Kommentar', image:'Billede', video:'Video', label:'Etiket', link:'Link', map:'Kort', tfoot:'Tabelfod', tbody:'Tabelkrop', thead:'Tabelhoved', table:'Tabel', row:'Række', cell:'Celle' } },
    deviceManager: { device:'Enhed', devices:{ computer:'Computer', tablet:'Tablet', mobil:'Mobil' } },
    panels: { buttons:{ titles:{} } },
    selectorManager: { label:'Klasser', selected:'Valgt', emptyState:'- Tilstand -', states:{ hover:'Mus over', active:'Klik', 'nth-of-type(2n)':'Lige' } },
    styleManager: { empty:'Vælg et element for at rette stilen', layer:'Lag', fileButton:'Billeder', sectors:{ general:'Generelt', layout:'Layout', typography:'Skrift', decorations:'Pynt', extra:'Ekstra', flex:'Flex', dimension:'Størrelse' }, properties:{} },
    traitManager: { empty:'Vælg et element for at se egenskaberne', label:'Egenskaber', traits:{ labels:{ id:'Id', alt:'Alt-tekst', title:'Titel', href:'Link', target:'Åbn i', placeholder:'Pladsholder', name:'Navn', type:'Type', required:'Påkrævet' }, options:{ target:{ false:'Samme vindue', _blank:'Nyt vindue' } } } }
  };

  /* =============================================================
     INDGANG FRA BAGRUMMET
     ============================================================= */
  function bind(){
    $('sf-luk').addEventListener('click', lukEditor);
    $('sf-gem').addEventListener('click', function(){ gem().catch(function(){}); });
    $('sf-udgiv').addEventListener('click', udgiv);
    $('sf-vis').addEventListener('click', function(){ if(!editor) return;
      var her = { html:editor.getHtml(), css:editor.getCss() + ekstraCss() };
      var s = åbenSide && sider.filter(function(x){ return x.id === åbenSide.id; })[0];
      if(s && !åbenSide.erSektion) åbnUrl(kædeUrl(s, her));
      else åbnVindue(her.html, her.css, åbenSide && (åbenSide.seo_titel || åbenSide.navn)); });
    $('sf-sideindstillinger').addEventListener('click', sideIndstillingerIEditor);
    $('sf-stil').addEventListener('click', stilIEditor);
    $('sf-fortryd').addEventListener('click', function(){ if(editor) editor.UndoManager.undo(); });
    $('sf-gentag').addEventListener('click', function(){ if(editor) editor.UndoManager.redo(); });
    $('sf-venstre-faner').addEventListener('click', function(e){ var k = e.target.closest('[data-v]'); if(k) visVenstre(k.getAttribute('data-v')); });
    $('sf-højre-faner').addEventListener('click', function(e){ var k = e.target.closest('[data-h]'); if(k) visHøjre(k.getAttribute('data-h')); });
    $('sf-enheder').addEventListener('click', function(e){ var k = e.target.closest('[data-enhed]'); if(k) vælgEnhed(k.getAttribute('data-enhed')); });
    document.addEventListener('click', function(e){ if(!e.target.closest('.sf-menu, .sf-menuknap')) lukMenuer(); });
    document.addEventListener('keydown', function(e){
      if(editor && (e.ctrlKey || e.metaKey) && e.key === 's'){ e.preventDefault(); gem().catch(function(){}); }
      if(e.key === 'Escape') lukMenuer();
    });
    window.addEventListener('beforeunload', function(e){ if(editor && ændret){ e.preventDefault(); e.returnValue = ''; } });
  }

  /* Runtime-stilen (side-runtime.css) lægges ind i miniaturerne som tekst:
     de er sandboxede og må ikke selv hente filer. */
  var RUNTIME_CSS = '';
  function hentRuntimeCss(){
    if(RUNTIME_CSS) return Promise.resolve();
    return fetch('side-runtime.css?v=' + RUNTIME_V).then(function(r){ return r.ok ? r.text() : ''; })
      .then(function(t){ RUNTIME_CSS = t || ''; }).catch(function(){});
  }

  window.ArytmiSider = {
    vis: function(a){
      api = a;
      if(!startet){ startet = true; bind(); }
      visning.hvad = visning.hvad || 'liste';
      hentRuntimeCss().then(hent);
    },
    /* Til tests uden en browser. */
    _tilSti: tilSti, _blokke: BLOKKE, _skabeloner: SKABELONER
  };
})();
