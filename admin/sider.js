/* =============================================================
   SIDER & FUNNELS — ARYTMIS EGEN SIDEBYGGER (9/11)
   =============================================================

   Kennet 9/11: ClickFunnels skal erstattes af Arytmis egen platform i
   bagrummet, og første del er en visuel sideeditor. Planen ligger i
   `REA/clickfunnels-migration/plan-egen-funnel-platform.md`.

   EDITOREN er GrapesJS 0.23.8 (BSD-3), lagt i `vendor/grapesjs/` og ikke
   hentet fra et CDN — samme grund som Leaflet: `script-src 'self'`, og
   tredjepartskode i produktionsstien skal ikke kunne skiftes ud under os.
   Den er 1,1 MB og hentes FØRST, når nogen åbner en side.

   Ikke en kopi af ClickFunnels: blokkene herunder er Arytmis egne og
   bruger brandets farver. Intet er taget fra ClickFunnels' kode.

   DATA: tabellerne `funnel`, `side` og `side_version` (0079 i app-repoet).
   Kladden gemmes med brugerens eget token; RLS kræver en bekræftet admin.
   Udgiv går gennem `udgiv_side()`, som også gemmer en version.

   BEMÆRK: "Udgiv" gør siden klar i databasen. Den bliver først synlig for
   kunder, når udgivelsen til afsted.arytmi.com er bygget (næste skridt).

   Siden bygger DOM med textContent og createElement, ikke innerHTML,
   som resten af bagrummet.
   ============================================================= */
(function(){
  'use strict';

  var api = null;            /* json, rpc, kaldRaa, PROJEKT_URL, forklar */
  var startet = false;
  var funnels = [], sider = [];
  var editor = null, åbenSide = null, ændret = false;
  var SPAND = 'sidebilleder';
  var GRAPES = 'vendor/grapesjs/';

  /* ---------- Små hjælpere ---------- */
  function $(id){ return document.getElementById(id); }
  function el(tag, egenskaber, børn){
    var e = document.createElement(tag);
    egenskaber = egenskaber || {};
    for(var n in egenskaber){
      if(n === 'tekst') e.textContent = egenskaber[n];
      else if(n === 'klik') e.addEventListener('click', egenskaber[n]);
      else if(n === 'klasse') e.className = egenskaber[n];
      else if(egenskaber[n] !== null && egenskaber[n] !== undefined) e.setAttribute(n, egenskaber[n]);
    }
    (børn || []).forEach(function(b){ if(b) e.appendChild(typeof b === 'string' ? document.createTextNode(b) : b); });
    return e;
  }
  function tøm(e){ while(e.firstChild) e.removeChild(e.firstChild); }
  function status(tekst, slags){
    var s = $('sider-status');
    s.className = 'status' + (slags ? ' ' + slags : '');
    s.textContent = tekst || '';
  }
  function fejl(f){ status(api.forklar(f), 'fejl'); }
  function dato(t){
    if(!t) return '';
    var d = new Date(t);
    return d.toLocaleDateString('da-DK', { day:'numeric', month:'short' }) + ' ' +
           d.toLocaleTimeString('da-DK', { hour:'2-digit', minute:'2-digit' });
  }

  /* Stien må kun have a-z, 0-9, bindestreg og skråstreg (0079). Æ, ø og å
     skrives om i stedet for at blive fjernet - ClickFunnels' egen sti
     "/arytmi-efterårsferie-page" viste, hvad der sker ellers. */
  function tilSti(t){
    t = String(t || '').toLowerCase()
      .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9/]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return '/' + t.replace(/^\/+/, '');
  }

  /* ---------- Hent og tegn listen ---------- */
  function hent(){
    status('Henter …');
    return Promise.all([
      api.json('/rest/v1/funnel?select=*&order=arkiveret.asc,oprettet.desc'),
      api.json('/rest/v1/side?select=id,funnel_id,raekkefoelge,navn,sti,udgivet_version,udgivet_kl,opdateret&order=raekkefoelge.asc,oprettet.asc')
    ]).then(function(r){
      funnels = r[0] || []; sider = r[1] || [];
      status('');
      tegn();
    }).catch(fejl);
  }

  function tegn(){
    var liste = $('sider-liste');
    tøm(liste);
    if(!funnels.length && !sider.length){
      liste.appendChild(el('p', { klasse:'tomt', tekst:'Ingen funnels endnu. Opret den første med "+ Ny funnel".' }));
    }
    funnels.forEach(function(f){
      liste.appendChild(funnelKort(f, sider.filter(function(s){ return s.funnel_id === f.id; })));
    });
    var løse = sider.filter(function(s){ return !s.funnel_id; });
    if(løse.length) liste.appendChild(funnelKort(null, løse));
  }

  function funnelKort(f, trin){
    var kort = el('div', { klasse:'db-kort sf-funnel' + (f && f.arkiveret ? ' sf-arkiv' : '') });
    var hoved = el('div', { klasse:'sf-hoved' }, [
      el('h3', { tekst: f ? f.navn : 'Sider uden funnel' }),
      f ? el('span', { klasse:'sf-domaene', tekst: f.domaene }) : null
    ]);
    kort.appendChild(hoved);

    var ol = el('ol', { klasse:'sf-trin' });
    trin.forEach(function(s, i){
      var tilstand = s.udgivet_version
        ? el('span', { klasse:'sf-maerke god', tekst:'Udgivet v' + s.udgivet_version })
        : el('span', { klasse:'sf-maerke', tekst:'Kladde' });
      ol.appendChild(el('li', {}, [
        el('div', { klasse:'sf-navn' }, [ el('b', { tekst:s.navn }), el('span', { klasse:'sf-sti', tekst:s.sti }) ]),
        tilstand,
        el('div', { klasse:'sf-greb' }, [
          f && i > 0 ? el('button', { type:'button', klasse:'knap rolig lille', 'aria-label':'Flyt op', tekst:'↑', klik:function(){ flyt(trin, i, -1); } }) : null,
          f && i < trin.length - 1 ? el('button', { type:'button', klasse:'knap rolig lille', 'aria-label':'Flyt ned', tekst:'↓', klik:function(){ flyt(trin, i, 1); } }) : null,
          el('button', { type:'button', klasse:'knap lille', tekst:'Rediger', klik:function(){ åbn(s.id); } }),
          el('button', { type:'button', klasse:'knap rolig lille', tekst:'Slet', klik:function(){ sletSide(s); } })
        ])
      ]));
    });
    if(!trin.length) ol.appendChild(el('li', { klasse:'tomt', tekst:'Ingen sider endnu.' }));
    kort.appendChild(ol);

    if(f){
      kort.appendChild(el('div', { klasse:'sf-bund' }, [
        el('button', { type:'button', klasse:'knap rolig lille', tekst:'+ Ny side', klik:function(){ nySide(f, trin.length); } }),
        el('button', { type:'button', klasse:'knap rolig lille', tekst:'Indstillinger', klik:function(){ funnelIndstillinger(f); } })
      ]));
    }
    return kort;
  }

  /* ---------- Funnels ---------- */
  function nyFunnel(){
    var navn = prompt('Hvad skal funnelen hedde?', '');
    if(!navn) return;
    api.json('/rest/v1/funnel', { method:'POST', body:{ navn:navn.trim() }, headers:{ Prefer:'return=minimal' } })
      .then(hent).catch(fejl);
  }

  function funnelIndstillinger(f){
    var navn = prompt('Funnelens navn:', f.navn);
    if(navn === null) return;
    var domaene = prompt('Domæne (fx afsted.arytmi.com):', f.domaene);
    if(domaene === null) return;
    api.json('/rest/v1/funnel?id=eq.' + encodeURIComponent(f.id), {
      method:'PATCH', body:{ navn:navn.trim() || f.navn, domaene:domaene.trim().toLowerCase() || f.domaene },
      headers:{ Prefer:'return=minimal' }
    }).then(hent).catch(fejl);
  }

  /* ---------- Sider ---------- */
  function nySide(f, plads){
    var navn = prompt('Hvad skal siden hedde? (fx Salgsside, Betaling, Tak)', '');
    if(!navn) return;
    var sti = prompt('Adresse på siden:', tilSti(navn));
    if(!sti) return;
    api.json('/rest/v1/side', {
      method:'POST',
      body:{ funnel_id: f ? f.id : null, raekkefoelge: plads || 0, navn: navn.trim(), sti: tilSti(sti) },
      headers:{ Prefer:'return=representation' }
    }).then(function(r){ return hent().then(function(){ if(r && r[0]) åbn(r[0].id); }); })
      .catch(function(e){
        if(e && e.kode === '23505') status('Adressen ' + tilSti(sti) + ' bruges allerede af en anden side.', 'fejl');
        else fejl(e);
      });
  }

  function flyt(trin, i, retning){
    var a = trin[i], b = trin[i + retning];
    if(!a || !b) return;
    /* Rækkefølgen skrives som tallene 0..n, så to sider aldrig deler plads. */
    var ny = trin.slice();
    ny[i] = b; ny[i + retning] = a;
    Promise.all(ny.map(function(s, n){
      return api.json('/rest/v1/side?id=eq.' + encodeURIComponent(s.id), {
        method:'PATCH', body:{ raekkefoelge:n }, headers:{ Prefer:'return=minimal' }
      });
    })).then(hent).catch(fejl);
  }

  function sletSide(s){
    if(!confirm('Slet siden "' + s.navn + '" (' + s.sti + ')?\n\nKladden og alle udgivne versioner forsvinder. Det kan ikke fortrydes.')) return;
    api.json('/rest/v1/side?id=eq.' + encodeURIComponent(s.id), { method:'DELETE', headers:{ Prefer:'return=minimal' } })
      .then(hent).catch(fejl);
  }

  /* =============================================================
     EDITOREN
     ============================================================= */
  var grapesHentet = null;
  function hentGrapes(){
    if(window.grapesjs) return Promise.resolve();
    if(grapesHentet) return grapesHentet;
    grapesHentet = new Promise(function(ja, nej){
      var css = el('link', { rel:'stylesheet', href: GRAPES + 'grapes.min.css?v=0.23.8' });
      document.head.appendChild(css);
      var s = el('script', { src: GRAPES + 'grapes.min.js?v=0.23.8' });
      s.onload = function(){ ja(); };
      s.onerror = function(){ grapesHentet = null; nej(new Error('Editoren kunne ikke hentes. Prøv igen.')); };
      document.head.appendChild(s);
    });
    return grapesHentet;
  }

  function åbn(id){
    status('Åbner editoren …');
    Promise.all([
      hentGrapes(),
      api.json('/rest/v1/side?select=*&id=eq.' + encodeURIComponent(id))
    ]).then(function(r){
      var s = r[1] && r[1][0];
      if(!s) throw new Error('Siden findes ikke længere.');
      åbenSide = s;
      status('');
      visEditor(s);
    }).catch(fejl);
  }

  function visEditor(s){
    var boks = $('sider-editor');
    boks.hidden = false;
    document.body.classList.add('sf-redigerer');
    $('sf-titel').textContent = s.navn;
    $('sf-adresse').textContent = s.sti;
    editorStatus(s.udgivet_version ? 'Udgivet v' + s.udgivet_version + ' · ' + dato(s.udgivet_kl) : 'Ikke udgivet endnu');

    if(editor){ editor.destroy(); editor = null; }
    editor = window.grapesjs.init({
      container: '#sf-laerred',
      height: '100%',
      width: 'auto',
      fromElement: false,
      storageManager: false,
      /* GrapesJS henter ellers Font Awesome fra et CDN. Det må vi ikke
         (indholdspolitikken), og vi har ikke brug for det. */
      cssIcons: '',
      noticeOnUnload: false,
      deviceManager: {
        devices: [
          { id:'computer', name:'Computer', width:'' },
          { id:'tablet', name:'Tablet', width:'768px', widthMedia:'992px' },
          { id:'mobil', name:'Mobil', width:'375px', widthMedia:'480px' }
        ]
      },
      assetManager: {
        upload: false,
        uploadFile: uploadBilleder,
        assets: []
      },
      blockManager: { appendTo: '#sf-blokke', blocks: BLOKKE },
      styleManager: { appendTo: '#sf-stil' },
      layerManager: { appendTo: '#sf-lag' },
      traitManager: { appendTo: '#sf-egenskaber' },
      selectorManager: { appendTo: '#sf-stil', componentFirst: true },
      panels: { defaults: [] }
    });

    if(s.kladde && s.kladde.pages) editor.loadProjectData(s.kladde);
    else editor.setStyle(BASIS_CSS);

    ændret = false;
    editor.on('update', function(){ ændret = true; editorStatus('Ikke gemt'); });
    hentBilleder();
    visPanel('blokke');
    vælgEnhed('computer');
  }

  function lukEditor(){
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
    editorStatus('Gemmer …');
    var krop = {
      kladde: editor.getProjectData(),
      kladde_html: editor.getHtml(),
      kladde_css: editor.getCss()
    };
    return api.json('/rest/v1/side?id=eq.' + encodeURIComponent(åbenSide.id), {
      method:'PATCH', body:krop, headers:{ Prefer:'return=minimal' }
    }).then(function(){
      ændret = false;
      editorStatus('Gemt ' + dato(new Date()), 'god');
    }).catch(function(f){ editorStatus(api.forklar(f), 'fejl'); throw f; });
  }

  function udgiv(){
    if(!åbenSide) return;
    if(!confirm('Udgiv "' + åbenSide.navn + '"?\n\nKladden bliver den version, kunderne får, og den gemmes, så den kan hentes frem igen.')) return;
    gem().then(function(){
      return api.rpc('udgiv_side', { p_side: åbenSide.id });
    }).then(function(v){
      åbenSide.udgivet_version = v;
      editorStatus('Udgivet v' + v + ' · ' + dato(new Date()), 'god');
    }).catch(function(f){ editorStatus(api.forklar(f), 'fejl'); });
  }

  /* Forhåndsvisning i et nyt vindue: den samme html og css, som Udgiv ville
     tage. Vinduet får ingen adgang til bagrummet (noopener). */
  function forhåndsvis(){
    if(!editor) return;
    var html = '<!doctype html><html lang="da"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Forhåndsvisning</title><style>' + editor.getCss() + '</style></head><body>' +
      editor.getHtml() + '</body></html>';
    var url = URL.createObjectURL(new Blob([html], { type:'text/html' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
  }

  function sideIndstillinger(){
    var s = åbenSide;
    var navn = prompt('Sidens navn:', s.navn); if(navn === null) return;
    var sti = prompt('Adresse:', s.sti); if(sti === null) return;
    var titel = prompt('Titel i Google og fanebladet:', s.seo_titel || ''); if(titel === null) return;
    var beskr = prompt('Beskrivelse i Google (højst 500 tegn):', s.seo_beskrivelse || ''); if(beskr === null) return;
    var krop = { navn: navn.trim() || s.navn, sti: tilSti(sti), seo_titel: titel.trim(), seo_beskrivelse: beskr.trim().slice(0, 500) };
    api.json('/rest/v1/side?id=eq.' + encodeURIComponent(s.id), { method:'PATCH', body:krop, headers:{ Prefer:'return=minimal' } })
      .then(function(){
        for(var k in krop) s[k] = krop[k];
        $('sf-titel').textContent = s.navn;
        $('sf-adresse').textContent = s.sti;
        editorStatus('Indstillinger gemt', 'god');
      }).catch(function(f){
        editorStatus(f && f.kode === '23505' ? 'Adressen bruges allerede af en anden side.' : api.forklar(f), 'fejl');
      });
  }

  function versioner(){
    var s = åbenSide;
    api.json('/rest/v1/side_version?select=version,udgivet_kl&side_id=eq.' + encodeURIComponent(s.id) + '&order=version.desc&limit=20')
      .then(function(v){
        if(!v || !v.length){ alert('Siden er ikke udgivet endnu, så der er ingen versioner.'); return; }
        var liste = v.map(function(x){ return 'v' + x.version + ' · ' + dato(x.udgivet_kl); }).join('\n');
        var valg = prompt('Hent en tidligere version ind som kladde. Skriv nummeret:\n\n' + liste, '');
        var n = parseInt(valg, 10);
        if(!n) return;
        if(ændret && !confirm('Kladden har ændringer, der ikke er gemt. De bliver overskrevet. Fortsæt?')) return;
        return api.rpc('hent_sideversion_som_kladde', { p_side: s.id, p_version: n }).then(function(){
          ændret = false;
          åbn(s.id);
        });
      }).catch(function(f){ editorStatus(api.forklar(f), 'fejl'); });
  }

  /* ---------- Billeder ----------
     Filnavnet er VORES: tidsstempel + tilfældigt, og filtypen. Et navn fra
     en telefon kan indeholde mellemrum, æøå og skråstreger (se stedbilleder). */
  var TYPER = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/svg+xml':'svg', 'image/gif':'gif' };
  function billedURL(navn){ return api.PROJEKT_URL + '/storage/v1/object/public/' + SPAND + '/' + navn; }

  function hentBilleder(){
    api.json('/storage/v1/object/list/' + SPAND, {
      method:'POST', body:{ prefix:'', limit:200, sortBy:{ column:'created_at', order:'desc' } }
    }).then(function(liste){
      if(!editor) return;
      editor.AssetManager.add((liste || []).filter(function(f){ return f.id; }).map(function(f){
        return { src: billedURL(f.name), name: f.name };
      }));
    }).catch(function(){ /* biblioteket er en bekvemmelighed - upload virker stadig */ });
  }

  function uploadBilleder(e){
    var filer = (e.dataTransfer ? e.dataTransfer.files : e.target.files) || [];
    Array.prototype.forEach.call(filer, function(fil){
      var ext = TYPER[fil.type];
      if(!ext){ editorStatus('Kun JPG, PNG, WebP, SVG og GIF.', 'fejl'); return; }
      if(fil.size > 5 * 1024 * 1024){ editorStatus('Billedet er over 5 MB.', 'fejl'); return; }
      var navn = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      editorStatus('Lægger billedet op …');
      api.kaldRaa('/storage/v1/object/' + SPAND + '/' + navn, 'POST', fil, fil.type).then(function(r){
        if(!r.ok) throw new Error('Billedet blev afvist (' + r.status + ').');
        editor.AssetManager.add({ src: billedURL(navn), name: navn });
        editorStatus('Billedet er lagt op', 'god');
      }).catch(function(f){ editorStatus(f.message || api.forklar(f), 'fejl'); });
    });
  }

  /* ---------- Paneler og enheder ---------- */
  function visPanel(navn){
    ['blokke', 'stil', 'egenskaber', 'lag'].forEach(function(p){
      $('sf-' + p).hidden = p !== navn;
      var k = document.querySelector('#sf-paneler [data-panel="' + p + '"]');
      if(k) k.setAttribute('aria-pressed', String(p === navn));
    });
  }
  function vælgEnhed(id){
    if(editor) editor.setDevice(id === 'computer' ? 'Computer' : id === 'tablet' ? 'Tablet' : 'Mobil');
    var knapper = document.querySelectorAll('#sf-enheder [data-enhed]');
    for(var i = 0; i < knapper.length; i++) knapper[i].setAttribute('aria-pressed', String(knapper[i].getAttribute('data-enhed') === id));
  }

  /* =============================================================
     ARYTMIS BLOKKE
     =============================================================
     Brandets farver (docs/checkout-css.md): bark #4A2417, kobber #8F4333,
     creme #FAF6EF, kant #D9CFC2, knap #DE854A. Skrifterne er Bodoni Moda
     (overskrifter) og Manrope (brødtekst), som på funnelen i dag. Hver
     blok har sin egen klasse med "a-"-præfiks, så reglerne ikke rammer
     hinanden, og alle bryder pænt om på en telefon. */
  var BASIS_CSS =
    '*{box-sizing:border-box}' +
    'body{margin:0;font-family:Manrope,"Helvetica Neue",Arial,sans-serif;color:#4A2417;background:#FAF6EF;line-height:1.6}' +
    'h1,h2,h3{font-family:"Bodoni Moda",Georgia,serif;font-weight:600;line-height:1.15;margin:0 0 .5em}' +
    'img{max-width:100%;height:auto;display:block}' +
    '.a-wrap{max-width:1080px;margin:0 auto;padding:0 20px}' +
    '.a-knap{display:inline-block;background:#DE854A;color:#fff;text-decoration:none;font-weight:700;padding:16px 28px;border-radius:999px;border:0;font-size:17px;cursor:pointer}' +
    '.a-knap:hover{background:#c9733b}';

  /* Pladsholderbilledet ligger i selve siden (data:). Et billede fra en
     fremmed server ville blive afvist af indholdspolitikken i editoren. */
  var PLADS = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">' +
    '<rect width="640" height="480" fill="#D9CFC2"/>' +
    '<text x="320" y="248" font-family="Arial" font-size="28" fill="#4A2417" text-anchor="middle">Vælg et billede</text></svg>');

  function blok(id, navn, kategori, html){
    return { id:id, label:navn, category:kategori, content:html };
  }

  var BLOKKE = [
    blok('a-hero', 'Hero', 'Sektioner',
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

    blok('a-tekst-billede', 'Tekst + billede', 'Sektioner',
      '<section class="a-tb"><div class="a-wrap a-tb-in">' +
      '<div class="a-tb-billede"><img src="' + PLADS + '" alt=""></div>' +
      '<div class="a-tb-tekst"><h2>Overskrift</h2><p>Brødtekst. Fortæl én ting godt.</p></div>' +
      '</div></section>' +
      '<style>.a-tb{padding:56px 0}.a-tb-in{display:flex;gap:40px;align-items:center;flex-wrap:wrap}' +
      '.a-tb-billede,.a-tb-tekst{flex:1 1 360px}.a-tb-billede img{border-radius:16px}.a-tb h2{font-size:clamp(28px,3.5vw,40px)}</style>'),

    blok('a-overskrift', 'Overskrift + tekst', 'Tekst',
      '<section class="a-ot"><div class="a-wrap"><h2>Overskrift</h2><p>Skriv teksten her.</p></div></section>' +
      '<style>.a-ot{padding:48px 0;text-align:center}.a-ot h2{font-size:clamp(28px,3.5vw,40px)}.a-ot p{max-width:680px;margin:0 auto;font-size:18px}</style>'),

    blok('a-knap', 'Knap', 'Tekst', '<div style="text-align:center;padding:16px 0"><a class="a-knap" href="#">Køb nu</a></div>'),

    blok('a-billede', 'Billede', 'Medier',
      { type:'image', style:{ 'max-width':'100%', 'border-radius':'16px' }, activate:true }),

    blok('a-fordele', 'Tre fordele', 'Sektioner',
      '<section class="a-fordele"><div class="a-wrap"><h2>Derfor Arytmi</h2><div class="a-f-raekke">' +
      '<div class="a-f"><h3>Klar på et minut</h3><p>Kort forklaring.</p></div>' +
      '<div class="a-f"><h3>Passer til bilen</h3><p>Kort forklaring.</p></div>' +
      '<div class="a-f"><h3>Appen med</h3><p>Kort forklaring.</p></div>' +
      '</div></div></section>' +
      '<style>.a-fordele{padding:56px 0;background:#fff}.a-fordele h2{text-align:center;font-size:clamp(28px,3.5vw,40px)}' +
      '.a-f-raekke{display:flex;gap:20px;flex-wrap:wrap;margin-top:24px}' +
      '.a-f{flex:1 1 260px;border:1.5px solid #D9CFC2;border-radius:16px;padding:24px;background:#FAF6EF}.a-f h3{font-size:22px}</style>'),

    blok('a-anmeldelser', 'Anmeldelser', 'Sektioner',
      '<section class="a-anm"><div class="a-wrap"><h2>Det siger de</h2><div class="a-anm-raekke">' +
      '<blockquote class="a-citat"><p>"Citat fra en kunde."</p><cite>Navn, by</cite></blockquote>' +
      '<blockquote class="a-citat"><p>"Citat fra en kunde."</p><cite>Navn, by</cite></blockquote>' +
      '</div></div></section>' +
      '<style>.a-anm{padding:56px 0}.a-anm h2{text-align:center}.a-anm-raekke{display:flex;gap:20px;flex-wrap:wrap}' +
      '.a-citat{flex:1 1 320px;margin:0;background:#fff;border-radius:16px;padding:24px;border:1.5px solid #D9CFC2}' +
      '.a-citat p{font-family:"Bodoni Moda",Georgia,serif;font-size:20px;margin:0 0 12px}.a-citat cite{font-style:normal;color:#8F4333;font-size:14px}</style>'),

    blok('a-faq', 'Spørgsmål og svar', 'Sektioner',
      '<section class="a-faq"><div class="a-wrap"><h2>Spørgsmål og svar</h2>' +
      '<details><summary>Spørgsmål?</summary><p>Svar.</p></details>' +
      '<details><summary>Spørgsmål?</summary><p>Svar.</p></details>' +
      '<details><summary>Spørgsmål?</summary><p>Svar.</p></details>' +
      '</div></section>' +
      '<style>.a-faq{padding:56px 0}.a-faq .a-wrap{max-width:760px}.a-faq h2{text-align:center}' +
      '.a-faq details{border-bottom:1px solid #D9CFC2;padding:16px 0}.a-faq summary{cursor:pointer;font-weight:700;font-size:18px}' +
      '.a-faq details p{margin:10px 0 0}</style>'),

    blok('a-pris', 'Priskort', 'Salg',
      '<section class="a-pris"><div class="a-wrap"><div class="a-pris-kort">' +
      '<h3>Produktnavn</h3><p class="a-pris-beloeb">2.995 kr.</p>' +
      '<ul><li>Det får kunden</li><li>Det får kunden</li><li>Det får kunden</li></ul>' +
      '<a class="a-knap" href="#">Vælg</a></div></div></section>' +
      '<style>.a-pris{padding:48px 0}.a-pris-kort{max-width:420px;margin:0 auto;background:#fff;border:1.5px solid #D9CFC2;border-radius:18px;padding:32px;text-align:center}' +
      '.a-pris-beloeb{font-family:"Bodoni Moda",Georgia,serif;font-size:40px;margin:0 0 16px}' +
      '.a-pris-kort ul{text-align:left;margin:0 0 24px;padding-left:20px}</style>'),

    /* Formularen gemmer først noget, når formularmodulet er bygget (fase B).
       Indtil da er den kun design. Samtykket til nyhedsmails er et AKTIVT
       flueben (markedsføringsloven § 10) - aldrig sat på forhånd. */
    blok('a-formular', 'Tilmeldingsformular', 'Salg',
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

    blok('a-mellemrum', 'Mellemrum', 'Layout', '<div style="height:48px"></div>'),
    blok('a-linje', 'Skillelinje', 'Layout', '<hr style="border:0;border-top:1px solid #D9CFC2;margin:32px auto;max-width:1080px">'),
    blok('a-to-kolonner', 'To kolonner', 'Layout',
      '<div class="a-wrap a-2k"><div class="a-k"><p>Venstre</p></div><div class="a-k"><p>Højre</p></div></div>' +
      '<style>.a-2k{display:flex;gap:24px;flex-wrap:wrap;padding:24px 20px}.a-k{flex:1 1 320px;min-height:60px}</style>'),

    blok('a-sidefod', 'Sidefod', 'Layout',
      '<footer class="a-fod"><div class="a-wrap">' +
      '<p>Arytmi · Alveni ApS · <a href="mailto:kundeservice@arytmi.com">kundeservice@arytmi.com</a></p>' +
      '<p><a href="https://arytmi.com/handelsbetingelser">Handelsbetingelser</a> · <a href="https://arytmi.com/privatliv">Privatlivspolitik</a></p>' +
      '</div></footer>' +
      '<style>.a-fod{padding:32px 0;background:#4A2417;color:#FAF6EF;font-size:14px;text-align:center}.a-fod a{color:#FAF6EF}.a-fod p{margin:4px 0}</style>')
  ];

  /* =============================================================
     INDGANG FRA BAGRUMMET
     ============================================================= */
  function bind(){
    $('sider-ny-funnel').addEventListener('click', nyFunnel);
    $('sider-ny-side').addEventListener('click', function(){ nySide(null, 0); });
    $('sf-luk').addEventListener('click', lukEditor);
    $('sf-gem').addEventListener('click', function(){ gem().catch(function(){}); });
    $('sf-udgiv').addEventListener('click', udgiv);
    $('sf-vis').addEventListener('click', forhåndsvis);
    $('sf-indstillinger').addEventListener('click', sideIndstillinger);
    $('sf-versioner').addEventListener('click', versioner);
    $('sf-fortryd').addEventListener('click', function(){ if(editor) editor.UndoManager.undo(); });
    $('sf-gentag').addEventListener('click', function(){ if(editor) editor.UndoManager.redo(); });
    $('sf-paneler').addEventListener('click', function(e){
      var k = e.target.closest('[data-panel]'); if(k) visPanel(k.getAttribute('data-panel'));
    });
    $('sf-enheder').addEventListener('click', function(e){
      var k = e.target.closest('[data-enhed]'); if(k) vælgEnhed(k.getAttribute('data-enhed'));
    });
    /* Ctrl/Cmd+S gemmer, mens editoren er åben. */
    document.addEventListener('keydown', function(e){
      if(editor && (e.ctrlKey || e.metaKey) && e.key === 's'){ e.preventDefault(); gem().catch(function(){}); }
    });
    window.addEventListener('beforeunload', function(e){
      if(editor && ændret){ e.preventDefault(); e.returnValue = ''; }
    });
  }

  window.ArytmiSider = {
    vis: function(a){
      api = a;
      if(!startet){ startet = true; bind(); }
      hent();
    },
    /* Til tests: stien og blokkene uden en browser. */
    _tilSti: tilSti,
    _blokke: BLOKKE
  };
})();
