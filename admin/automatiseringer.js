/* =============================================================
   AUTOMATISERINGER — FORLØB (0094, omgang B, 10/11)
   =============================================================
   Erstatter ClickFunnels' Workflows/Automations. Et forløb er ÉN udløser
   og en liste af trin. Databasen (0094) og motoren (`automatisering-koer`,
   hvert minut) gør arbejdet - her bygger, starter og følger man forløbene.

   - Listen: alle forløb med udløser, trin, status og hvor mange der står hvor.
   - Opsætning: navn, udløser, trin (mail, besked, vent, tag, felt, webhook,
     betingelse), "kun én gang pr. kontakt", kladde/live/arkiveret.
   - Kørsler: hvem står hvor, loggen pr. kontakt, stop en ventende kørsel,
     start forløbet for et segment eller udvalgte kontakter.

   Reglerne for, hvad en udløser og et trin må indeholde, står TRE steder:
   her (danske forklaringer, før der gemmes), i _shared/automatisering.ts
   (motoren) og i databasen (check på tabellen). Databasen er dommer;
   rettes den ene, rettes de andre.

   Betingelsen bruger de samme regler som segmenterne (segmentregler.js).
   DOM bygges med textContent og createElement som resten af bagrummet.
   ============================================================= */
(function(){
  'use strict';
  var api = null, SR = window.ArytmiSegmentregler;
  /* forloeb === null: 0094 er ikke kørt (eller kaldet fejlede). */
  var data = { forloeb:null, tal:{}, formularer:[], produkter:[], segmenter:[], tags:[], felter:[] };
  var visning = { åben:null, fane:'opsaetning', arkiv:false, filter:'' };
  /* Kladden i editoren - overlever, at man kigger på Kørsler og tilbage. */
  var kladde = null, rettet = false;

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
  function status(tekst, slags){ var s = $('au-status'); s.textContent = tekst || ''; s.className = 'status' + (slags ? ' ' + slags : ''); }
  function fejl(f){ status(f && f.kode === '42501' ? 'Serveren afviste det. Har din konto to-faktor, skal du have brugt den i den her session.' : api.forklar(f), 'fejl'); }
  function rest(sti, valg){ return api.json('/rest/v1/' + sti, valg); }
  function dato(iso){
    if(!iso) return '—';
    var d = new Date(iso);
    return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + d.getFullYear() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function kopi(o){ return JSON.parse(JSON.stringify(o)); }
  function liste(v){ return String(v || '').split(/[,;\n]/).map(function(x){ return x.trim(); }).filter(Boolean); }
  function kilder(){ return { formularer:data.formularer, produkter:data.produkter, tagListe:'au-tags', feltListe:'au-felter' }; }

  // -------------------------------------------------------------
  // Udløsere og trin: navne, standardværdier, tjek
  // -------------------------------------------------------------
  var UDL = [
    ['formular', 'En formular bliver sendt'],
    ['tag_sat', 'Kontakten får et tag'],
    ['tag_fjernet', 'Et tag bliver fjernet fra kontakten'],
    ['ordre_betalt', 'En ordre bliver betalt'],
    ['ordre_annulleret', 'En ordre bliver annulleret (før betaling)'],
    ['ordre_refunderet', 'En ordre bliver refunderet (hele beløbet)'],
    ['abonnement_opsagt', 'Et abonnement bliver opsagt (løber perioden ud)'],
    ['abonnement_ophoert', 'Et abonnement ophører'],
    ['kontakt_oprettet', 'En ny kontakt bliver oprettet'],
    ['manuel', 'Kun når I selv starter det']
  ];
  function harTest(slags){ return /^(ordre_|abonnement_)/.test(slags); }
  var TRIN = [
    ['mail', 'Send mail til kontakten'],
    ['besked', 'Send besked til teamet'],
    ['vent', 'Vent'],
    ['tag_saet', 'Sæt tag'],
    ['tag_fjern', 'Fjern tag'],
    ['felt', 'Sæt eget felt'],
    ['webhook', 'Kald webhook'],
    ['betingelse', 'Betingelse (fortsæt kun, hvis …)']
  ];
  function trinNavn(s){ var t = TRIN.filter(function(x){ return x[0] === s; })[0]; return t ? t[1] : s; }
  var ENHED_MAKS = { minutter:525600, timer:8760, dage:365 };
  var MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, HTTPS = /^https:\/\/[^\s]{1,500}$/;
  var FLET = 'Flettefelter: {fornavn} {efternavn} {email} {telefon} {ordre} og kontaktens egne felter ved navn, fx {bilmodel}. Et tomt felt forsvinder af sig selv.';

  function nytTrin(s){
    if(s === 'mail') return { slags:s, emne:'', overskrift:'', tekst:'', knap_tekst:'', knap_link:'', kraev_samtykke:true };
    if(s === 'besked') return { slags:s, til:[], emne:'', tekst:'' };
    if(s === 'vent') return { slags:s, antal:1, enhed:'dage' };
    if(s === 'tag_saet' || s === 'tag_fjern') return { slags:s, tag:'' };
    if(s === 'felt') return { slags:s, noegle:'', vaerdi:'' };
    if(s === 'webhook') return { slags:s, url:'' };
    return { slags:'betingelse', regler:{ alle:true, betingelser:[SR.ny()] } };
  }
  /* Det, databasen får: kun de felter, trinet bruger. */
  function rensTrin(t){
    var s = t.slags, x = function(n){ return String(t[n] === undefined || t[n] === null ? '' : t[n]).trim(); };
    if(s === 'mail'){
      var m = { slags:s, emne:x('emne'), tekst:x('tekst') };
      if(x('overskrift')) m.overskrift = x('overskrift');
      if(x('knap_tekst')) m.knap_tekst = x('knap_tekst');
      if(x('knap_link')) m.knap_link = x('knap_link');
      if(t.kraev_samtykke === false) m.kraev_samtykke = false;
      return m;
    }
    if(s === 'besked') return { slags:s, til:(Array.isArray(t.til) ? t.til : liste(t.til)).map(function(a){ return String(a).trim().toLowerCase(); }), emne:x('emne'), tekst:x('tekst') };
    if(s === 'vent') return { slags:s, antal:Number(t.antal), enhed:x('enhed') };
    if(s === 'tag_saet' || s === 'tag_fjern') return { slags:s, tag:x('tag') };
    if(s === 'felt') return { slags:s, noegle:x('noegle'), vaerdi:x('vaerdi') };
    if(s === 'webhook') return { slags:s, url:x('url') };
    if(s === 'betingelse') return { slags:s, regler:SR.rens(t.regler || { alle:true, betingelser:[] }) };
    return { slags:s };
  }
  function webhookTilladt(adresse){
    var u;
    try { u = new URL(adresse); } catch(e){ return false; }
    if(u.protocol !== 'https:' || u.username || u.password) return false;
    if(u.port && u.port !== '443') return false;
    var h = u.hostname.toLowerCase();
    if(h.indexOf('.') < 0 || h.charAt(0) === '[' || h.indexOf(':') >= 0) return false;
    if(/^[0-9.]+$/.test(h) || /^0x/i.test(h)) return false;
    if(/(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(h)) return false;
    return true;
  }
  function mellem(v, min, max){ return typeof v === 'string' && v.trim().length >= min && v.trim().length <= max; }
  /* Samme regler som tjekEtTrin i _shared/automatisering.ts. '' = i orden. */
  function trinFejl(t, rå){
    switch(t.slags){
      case 'mail':
        if(!mellem(t.emne, 1, 200)) return 'Skriv et emne (højst 200 tegn).';
        if(!mellem(t.tekst, 1, 10000)) return 'Skriv mailens tekst (højst 10.000 tegn).';
        if((t.overskrift || '').length > 120) return 'Overskriften er for lang (højst 120 tegn).';
        if((t.knap_tekst || '').length > 80) return 'Knappens tekst er for lang (højst 80 tegn).';
        if(t.knap_link && !HTTPS.test(t.knap_link)) return 'Knappens link skal begynde med https://';
        if(!!t.knap_link !== !!t.knap_tekst) return 'En knap skal have både tekst og link.';
        return '';
      case 'besked':
        if(!t.til.length || t.til.length > 10) return 'Skriv 1-10 modtagere i teamet.';
        for(var i = 0; i < t.til.length; i++) if(t.til[i].length > 254 || !MAIL.test(t.til[i])) return '"' + t.til[i].slice(0, 60) + '" er ikke en mailadresse.';
        if(!mellem(t.emne, 1, 200)) return 'Skriv et emne (højst 200 tegn).';
        if(!mellem(t.tekst, 1, 10000)) return 'Skriv beskedens tekst (højst 10.000 tegn).';
        return '';
      case 'vent':
        if(!ENHED_MAKS[t.enhed]) return 'Vælg minutter, timer eller dage.';
        if(!Number.isInteger(t.antal) || t.antal < 1) return 'Skriv, hvor længe der skal ventes (et helt tal over 0).';
        if(t.antal > ENHED_MAKS[t.enhed]) return 'Der kan højst ventes et år.';
        return '';
      case 'tag_saet': case 'tag_fjern':
        return mellem(t.tag, 1, 60) ? '' : 'Skriv tagget (højst 60 tegn).';
      case 'felt':
        if(!/^[a-z0-9_]{1,60}$/.test(t.noegle)) return 'Feltets navn må kun have små bogstaver, tal og _.';
        if(t.vaerdi.length > 1000) return 'Værdien er for lang (højst 1.000 tegn).';
        return '';
      case 'webhook':
        if(!HTTPS.test(t.url)) return 'Adressen skal begynde med https://';
        return webhookTilladt(t.url) ? '' : 'Den adresse kan ikke bruges (kun offentlige https-adresser).';
      case 'betingelse':
        if(!rå.regler || !(rå.regler.betingelser || []).length) return 'Tilføj mindst én betingelse.';
        return SR.førsteFejl(rå.regler);
      default:
        return 'Ukendt slags trin.';
    }
  }
  function rensUdloeser(u){
    var ud = { slags:u.slags }, v = String(u.vaerdi || '').trim();
    if(u.slags === 'formular' || u.slags === 'ordre_betalt'){ if(v) ud.vaerdi = v; }
    else if(u.slags === 'tag_sat' || u.slags === 'tag_fjernet') ud.vaerdi = v;
    if(harTest(u.slags) && u.med_test) ud.med_test = true;
    return ud;
  }
  function udloeserFejl(u){
    var v = u.vaerdi || '';
    if(!UDL.some(function(x){ return x[0] === u.slags; })) return 'Vælg, hvad der starter forløbet.';
    if(u.slags === 'formular' && v && !/^[a-z0-9_-]{1,60}$/.test(v)) return 'Vælg en formular (eller alle formularer).';
    if((u.slags === 'tag_sat' || u.slags === 'tag_fjernet') && !mellem(v, 1, 60)) return 'Skriv det tag, forløbet skal starte på.';
    if(u.slags === 'ordre_betalt' && v && !UUID.test(v)) return 'Vælg et produkt (eller alle ordrer).';
    return '';
  }

  /* Korte tekster til listen og kørslerne. */
  function udloeserTekst(u){
    u = u || {};
    var v = u.vaerdi || '', test = u.med_test ? ' (også testkøb)' : '', t;
    if(u.slags === 'formular'){
      var fm = data.formularer.filter(function(x){ return x.noegle === v; })[0];
      t = v ? 'Formularen "' + ((fm && fm.navn) || v) + '" bliver sendt' : 'En formular bliver sendt (alle)';
    } else if(u.slags === 'tag_sat') t = 'Kontakten får tagget "' + v + '"';
    else if(u.slags === 'tag_fjernet') t = 'Tagget "' + v + '" bliver fjernet';
    else if(u.slags === 'ordre_betalt'){
      var p = data.produkter.filter(function(x){ return x.id === v; })[0];
      t = v ? 'En ordre med "' + (p ? p.navn : 'et slettet produkt') + '" bliver betalt' : 'En ordre bliver betalt (alle)';
    } else {
      var n = UDL.filter(function(x){ return x[0] === u.slags; })[0];
      t = n ? n[1] : 'Ukendt udløser';
    }
    return t + test;
  }
  function trinKort(t){
    if(t.slags === 'mail') return 'Mail: ' + (t.emne || '');
    if(t.slags === 'besked') return 'Besked til ' + (t.til || []).join(', ');
    if(t.slags === 'vent'){ var en = { minutter:'minut', timer:'time', dage:'dag' }; return 'Vent ' + t.antal + ' ' + (t.antal === 1 ? en[t.enhed] : t.enhed); }
    if(t.slags === 'tag_saet') return 'Sæt tag "' + t.tag + '"';
    if(t.slags === 'tag_fjern') return 'Fjern tag "' + t.tag + '"';
    if(t.slags === 'felt') return t.vaerdi ? 'Sæt feltet ' + t.noegle : 'Ryd feltet ' + t.noegle;
    if(t.slags === 'webhook'){ try { return 'Webhook til ' + new URL(t.url).hostname; } catch(e){ return 'Webhook'; } }
    if(t.slags === 'betingelse') return 'Kun hvis: ' + SR.reglerTekst(t.regler, kilder());
    return t.slags;
  }
  var STATUS = { kladde:'Kladde', live:'Live', arkiveret:'Arkiveret' };
  var KSTATUS = { venter:'Venter', koerer:'Kører nu', faerdig:'Færdig', fejlet:'Fejlet', stoppet:'Stoppet' };
  function mærke(st){ return el('span', { klasse:'au-status au-' + st, tekst:STATUS[st] || KSTATUS[st] || st }); }

  // -------------------------------------------------------------
  // Hent
  // -------------------------------------------------------------
  function hent(){
    status('Henter …');
    return Promise.all([
      rest('automatisering?select=*&order=navn.asc').catch(function(f){ return { fejl:f }; }),
      rest('formular?select=noegle,navn&order=noegle.asc').catch(function(){ return []; }),
      rest('produkt?select=id,navn&order=navn.asc').catch(function(){ return []; }),
      rest('segment?select=id,navn&order=navn.asc').catch(function(){ return []; }),
      rest('kontakt?select=tags,felter&limit=2000').catch(function(){ return []; })
    ]).then(function(r){
      data.formularer = r[1] || []; data.produkter = r[2] || []; data.segmenter = r[3] || [];
      var tags = {}, felter = {};
      (r[4] || []).forEach(function(k){
        (k.tags || []).forEach(function(t){ tags[t] = 1; });
        Object.keys(k.felter || {}).forEach(function(n){ felter[n] = 1; });
      });
      data.tags = Object.keys(tags).sort(); data.felter = Object.keys(felter).sort();
      if(r[0] && r[0].fejl){ data.forloeb = null; fejl(r[0].fejl); tegn(); return; }
      data.forloeb = r[0] || [];
      return hentTal().then(function(){ status(''); tegn(); });
    }).catch(fejl);
  }
  /* Hvor mange står hvor - pr. forløb. */
  function hentTal(){
    return rest('automatisering_koersel?select=automatisering_id,status&limit=20000').then(function(r){
      data.tal = {};
      (r || []).forEach(function(k){
        var t = data.tal[k.automatisering_id] = data.tal[k.automatisering_id] || { venter:0, koerer:0, faerdig:0, fejlet:0, stoppet:0 };
        t[k.status] = (t[k.status] || 0) + 1;
      });
    }).catch(function(){ data.tal = {}; });
  }
  function talFor(id){ return data.tal[id] || { venter:0, koerer:0, faerdig:0, fejlet:0, stoppet:0 }; }
  function forloeb(id){ return (data.forloeb || []).filter(function(x){ return x.id === id; })[0] || null; }

  function tegn(){
    var rod = $('au-indhold'); tøm(rod);
    if(data.forloeb === null){
      rod.appendChild(el('p', { klasse:'hint', tekst:'Forløbene kunne ikke hentes. Er migration 0094 kørt, og har du brugt din to-faktor i den her session?' }));
      return;
    }
    if(visning.åben) return tegnForloeb(rod);
    tegnListe(rod);
  }
  function forlad(){
    if(rettet && !confirm('Du har rettelser, der ikke er gemt. Vil du forlade forløbet uden at gemme?')) return false;
    kladde = null; rettet = false; return true;
  }

  // -------------------------------------------------------------
  // Listen
  // -------------------------------------------------------------
  function tegnListe(rod){
    rod.appendChild(el('p', { klasse:'hint', tekst:'Et forløb starter på én udløser - fx en formular, et tag eller et køb - og kører så sine trin for kontakten: mail, vent, tag, besked til teamet. Motoren kigger hvert minut. Kun forløb, der er live, starter og kører; en kladde står stille.' }));
    var arkiv = el('input', { type:'checkbox', id:'au-arkiv' }); arkiv.checked = visning.arkiv;
    arkiv.addEventListener('change', function(){ visning.arkiv = arkiv.checked; tegn(); });
    var gemte = data.forloeb.filter(function(a){ return a.status === 'arkiveret'; }).length;
    rod.appendChild(el('div', { klasse:'au-top' }, [
      knap('+ Nyt forløb', 'knap lille', function(){ visning.åben = 'ny'; visning.fane = 'opsaetning'; kladde = null; rettet = false; tegn(); }),
      gemte ? el('span', { klasse:'afkryds au-arkiv' }, [arkiv, el('label', { for:'au-arkiv', tekst:'Vis arkiverede (' + gemte + ')' })]) : null,
      knap('Opdatér', 'knap lille rolig', function(){ hent(); })]));
    var vis = data.forloeb.filter(function(a){ return visning.arkiv || a.status !== 'arkiveret'; });
    var tbody = el('tbody');
    rod.appendChild(el('div', { klasse:'rulle' }, [el('table', { klasse:'kt-tabel au-tabel' }, [
      el('thead', {}, [el('tr', {}, ['Forløb', 'Starter, når', 'Trin', 'Status', 'I gang', 'Færdige', 'Fejlet'].map(function(t){ return el('th', { tekst:t }); }))]), tbody])]));
    if(!vis.length) tbody.appendChild(el('tr', {}, [el('td', { colspan:'7', klasse:'hint', tekst: data.forloeb.length ? 'Ingen forløb at vise.' : 'Ingen forløb endnu. Lav det første med "+ Nyt forløb".' })]));
    vis.forEach(function(a){
      var t = talFor(a.id);
      var tr = el('tr', { klasse:'kt-række', tabindex:'0' }, [
        el('td', {}, [el('strong', { tekst:a.navn }), a.beskrivelse ? el('div', { klasse:'hint', tekst:a.beskrivelse }) : null]),
        el('td', { tekst:udloeserTekst(a.udloeser) }),
        el('td', { klasse:'hint', tekst:(a.trin || []).length ? (a.trin || []).map(function(x){ return trinNavn(x.slags).replace(/ \(.*/, ''); }).join(' → ') : 'ingen trin' }),
        el('td', {}, [mærke(a.status)]),
        el('td', { tekst:String(t.venter + t.koerer) }),
        el('td', { tekst:String(t.faerdig) }),
        el('td', {}, [t.fejlet ? el('strong', { klasse:'au-fejltal', tekst:String(t.fejlet) }) : '0'])]);
      function åbn(){ visning.åben = a.id; visning.fane = 'opsaetning'; kladde = null; rettet = false; tegn(); window.scrollTo(0, 0); }
      tr.addEventListener('click', åbn);
      tr.addEventListener('keydown', function(e){ if(e.key === 'Enter') åbn(); });
      tbody.appendChild(tr);
    });
  }

  // -------------------------------------------------------------
  // Et forløb: Opsætning | Kørsler
  // -------------------------------------------------------------
  function tegnForloeb(rod){
    var gemt = visning.åben === 'ny' ? null : forloeb(visning.åben);
    if(visning.åben !== 'ny' && !gemt){ visning.åben = null; return tegn(); }
    if(!kladde){
      kladde = gemt
        ? { navn:gemt.navn, beskrivelse:gemt.beskrivelse || '', en_gang:gemt.en_gang, udloeser:kopi(gemt.udloeser), trin:kopi(gemt.trin || []) }
        : { navn:'', beskrivelse:'', en_gang:true, udloeser:{ slags:'formular', vaerdi:'' }, trin:[] };
      rettet = false;
    }
    rod.appendChild(el('p', {}, [knap('← Alle forløb', 'knap lille rolig', function(){ if(!forlad()) return; visning.åben = null; hent(); })]));
    rod.appendChild(el('h3', { klasse:'kt-navn' }, [gemt ? gemt.navn : 'Nyt forløb', ' ', gemt ? mærke(gemt.status) : null]));
    if(gemt){
      var t = talFor(gemt.id);
      var faner = el('div', { klasse:'underfaner', role:'tablist' }, [
        el('button', { type:'button', role:'tab', 'aria-selected':String(visning.fane === 'opsaetning'), tekst:'Opsætning', klik:function(){ visning.fane = 'opsaetning'; tegn(); } }),
        el('button', { type:'button', role:'tab', 'aria-selected':String(visning.fane === 'koersler'), tekst:'Kørsler (' + (t.venter + t.koerer + t.faerdig + t.fejlet + t.stoppet) + ')', klik:function(){ visning.fane = 'koersler'; tegn(); } })]);
      rod.appendChild(faner);
    }
    if(gemt && visning.fane === 'koersler') return tegnKoersler(rod, gemt);
    tegnOpsaetning(rod, gemt);
  }

  // ---------- Opsætning ----------
  function tegnOpsaetning(rod, gemt){
    var kl = kladde;
    function ret(){ rettet = true; }
    function felt(id, navn, værdi, eg, sæt){
      var i = el(eg && eg.rækker ? 'textarea' : 'input', { id:id });
      if(eg){ for(var n in eg){ if(n !== 'rækker') i.setAttribute(n, eg[n]); } if(eg.rækker) i.setAttribute('rows', eg.rækker); }
      i.value = værdi === undefined || værdi === null ? '' : værdi;
      i.addEventListener('input', function(){ sæt(i.value); ret(); });
      return el('div', { klasse:'kt-felt' }, [el('label', { for:id, tekst:navn }), i]);
    }

    /* Navn og beskrivelse */
    var enGang = el('input', { type:'checkbox', id:'au-engang' }); enGang.checked = kl.en_gang !== false;
    enGang.addEventListener('change', function(){ kl.en_gang = enGang.checked; ret(); });
    rod.appendChild(el('div', { klasse:'kort kt-kort' }, [
      el('div', { klasse:'kt-grid' }, [
        felt('au-navn', 'Navn', kl.navn, { maxlength:'120' }, function(v){ kl.navn = v; }),
        felt('au-besk', 'Beskrivelse (kun til jer selv)', kl.beskrivelse, { maxlength:'500' }, function(v){ kl.beskrivelse = v; })]),
      el('div', { klasse:'afkryds' }, [enGang, el('label', { for:'au-engang', tekst:'Kun én gang pr. kontakt' }),
        el('span', { klasse:'hint', tekst:'Slået fra kan samme kontakt komme ind igen - dog højst 5 gange i timen, og samme ordre starter kun forløbet én gang.' })])]));

    /* Udløseren */
    var udlBoks = el('div', { klasse:'au-udl' });
    function tegnUdl(){
      tøm(udlBoks);
      var u = kl.udloeser, dele = [];
      var slags = el('select', { id:'au-udl-slags', 'aria-label':'Hvad starter forløbet' });
      UDL.forEach(function(x){ slags.appendChild(new Option(x[1], x[0])); });
      slags.value = u.slags;
      slags.addEventListener('change', function(){ kl.udloeser = { slags:slags.value, vaerdi:'' }; ret(); tegnUdl(); });
      dele.push(slags);
      var v = null;
      if(u.slags === 'formular'){
        v = el('select', { 'aria-label':'Formular' });
        v.appendChild(new Option('alle formularer', ''));
        data.formularer.forEach(function(fm){ v.appendChild(new Option(fm.navn || fm.noegle, fm.noegle)); });
        if(u.vaerdi && !data.formularer.some(function(fm){ return fm.noegle === u.vaerdi; })) v.appendChild(new Option(u.vaerdi + ' (findes ikke længere)', u.vaerdi));
      } else if(u.slags === 'ordre_betalt'){
        v = el('select', { 'aria-label':'Produkt' });
        v.appendChild(new Option('alle ordrer', ''));
        data.produkter.forEach(function(p){ v.appendChild(new Option(p.navn, p.id)); });
        if(u.vaerdi && !data.produkter.some(function(p){ return p.id === u.vaerdi; })) v.appendChild(new Option('et slettet produkt', u.vaerdi));
      } else if(u.slags === 'tag_sat' || u.slags === 'tag_fjernet'){
        v = el('input', { 'aria-label':'Tag', list:'au-tags', placeholder:'tagget', maxlength:'60' });
      }
      if(v){
        v.value = u.vaerdi || '';
        v.addEventListener(v.tagName === 'SELECT' ? 'change' : 'input', function(){ u.vaerdi = v.value; ret(); });
        dele.push(v);
      }
      if(harTest(u.slags)){
        var t = el('input', { type:'checkbox', id:'au-udl-test' }); t.checked = !!u.med_test;
        t.addEventListener('change', function(){ u.med_test = t.checked; ret(); });
        dele.push(el('span', { klasse:'afkryds kt-seg-test' }, [t, el('label', { for:'au-udl-test', tekst:'Også testkøb' })]));
      }
      udlBoks.appendChild(el('div', { klasse:'kt-seg-række' }, dele));
      var hint = {
        manuel:'Forløbet starter kun, når I vælger kontakter eller et segment - under Kørsler her eller i kontaktlisten.',
        ordre_betalt:'Kontakten findes ud fra ordrens mail (og oprettes, hvis hun mangler). Gælder også eksterne ordrer fra bagrummet.',
        kontakt_oprettet:'Gælder alle nye kontakter - fra formularer, checkout, import og bagrummet.',
        tag_sat:'Store og små bogstaver er ligegyldige. Et forløb starter aldrig sig selv med sit eget tag-trin.',
        formular:'Starter, efter kontakten og hendes samtykker er gemt.'
      }[u.slags];
      if(hint) udlBoks.appendChild(el('p', { klasse:'hint', tekst:hint }));
    }
    tegnUdl();
    rod.appendChild(el('div', { klasse:'kort kt-kort' }, [el('h4', { tekst:'Forløbet starter, når' }), udlBoks]));

    /* Trinene */
    var trinBoks = el('div', { klasse:'au-trin-liste' });
    function tegnTrin(){
      tøm(trinBoks);
      if(!kl.trin.length) trinBoks.appendChild(el('p', { klasse:'hint', tekst:'Ingen trin endnu. Tilføj det første herunder.' }));
      kl.trin.forEach(function(t, i){
        var p = 'au-t' + i, krop = [];
        function f(n, navn, eg){ return felt(p + '-' + n, navn, t[n], eg, function(v){ t[n] = v; }); }
        if(t.slags === 'mail'){
          var samtykke = el('input', { type:'checkbox', id:p + '-samtykke' }); samtykke.checked = t.kraev_samtykke !== false;
          samtykke.addEventListener('change', function(){ t.kraev_samtykke = samtykke.checked; ret(); });
          krop = [
            f('emne', 'Emne', { maxlength:'200' }),
            f('overskrift', 'Overskrift i mailen (valgfri)', { maxlength:'120' }),
            f('tekst', 'Tekst (en tom linje giver et nyt afsnit)', { rækker:'7', maxlength:'10000' }),
            el('div', { klasse:'kt-grid' }, [
              f('knap_tekst', 'Knappens tekst (valgfri)', { maxlength:'80' }),
              f('knap_link', 'Knappens link', { type:'url', placeholder:'https://', maxlength:'500' })]),
            el('div', { klasse:'afkryds' }, [samtykke, el('label', { for:p + '-samtykke', tekst:'Kun til dem, der har sagt ja til nyhedsmails' })]),
            el('p', { klasse:'hint', tekst:'Slå kun fluebenet fra for servicemails (fx svar på en formular eller noget om et køb) - markedsføring kræver samtykke. Afmeldte får aldrig mailen. Afmeldingslinket sættes altid nederst. ' + FLET })];
        } else if(t.slags === 'besked'){
          if(!Array.isArray(t.til)) t.til = liste(t.til);
          krop = [
            felt(p + '-til', 'Til (mailadresser i teamet, komma imellem)', t.til.join(', '), { placeholder:'fx oliivia@arytmi.com' }, function(v){ t.til = liste(v); }),
            f('emne', 'Emne', { maxlength:'200' }),
            f('tekst', 'Tekst', { rækker:'5', maxlength:'10000' }),
            el('p', { klasse:'hint', tekst:'Kontaktens navn, mail og telefon sættes nederst, og svar går til kontakten. ' + FLET })];
        } else if(t.slags === 'vent'){
          var antal = el('input', { id:p + '-antal', type:'number', min:'1', step:'1', 'aria-label':'Antal' }); antal.value = t.antal;
          antal.addEventListener('input', function(){ t.antal = antal.value === '' ? NaN : Number(antal.value); ret(); });
          var enhed = el('select', { 'aria-label':'Enhed' });
          [['minutter', 'minutter'], ['timer', 'timer'], ['dage', 'dage']].forEach(function(x){ enhed.appendChild(new Option(x[1], x[0])); });
          enhed.value = t.enhed;
          enhed.addEventListener('change', function(){ t.enhed = enhed.value; ret(); });
          krop = [el('div', { klasse:'kt-seg-række au-vent' }, [el('label', { for:p + '-antal', tekst:'Vent i' }), antal, enhed]),
            i === kl.trin.length - 1 ? el('p', { klasse:'hint', tekst:'Et "vent" som sidste trin gør ingenting - forløbet er færdigt, når der ikke er flere trin.' }) : null];
        } else if(t.slags === 'tag_saet' || t.slags === 'tag_fjern'){
          krop = [f('tag', 'Tag', { list:'au-tags', maxlength:'60' })];
        } else if(t.slags === 'felt'){
          krop = [el('div', { klasse:'kt-grid' }, [
            felt(p + '-noegle', 'Feltets navn', t.noegle, { list:'au-felter', maxlength:'60', placeholder:'fx bilmodel' }, function(v){ t.noegle = v.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'); }),
            f('vaerdi', 'Værdi (tom = ryd feltet)', { maxlength:'1000' })]),
            el('p', { klasse:'hint', tekst:FLET })];
        } else if(t.slags === 'webhook'){
          krop = [f('url', 'Adresse', { type:'url', placeholder:'https://', maxlength:'500' }),
            el('p', { klasse:'hint', tekst:'Adressen får et POST med JSON: forløbet, kontakten (mail, navn, telefon, felter, tags) og det, der udløste forløbet. Kun offentlige https-adresser; svarer den ikke inden 10 sekunder, prøves der igen efter 5 og 10 minutter.' })];
        } else if(t.slags === 'betingelse'){
          t.regler = t.regler || { alle:true, betingelser:[] };
          var alle = el('select', { id:p + '-alle' });
          alle.appendChild(new Option('alle betingelserne', 'ja')); alle.appendChild(new Option('mindst én af betingelserne', 'nej'));
          alle.value = t.regler.alle === false ? 'nej' : 'ja';
          alle.addEventListener('change', function(){ t.regler.alle = alle.value === 'ja'; ret(); });
          var rk = el('div', { klasse:'kt-seg-rækker' });
          SR.tegnRækker(rk, t.regler, kilder(), ret, p + '-b', 'Ingen betingelser endnu.');
          krop = [
            el('p', { klasse:'kt-seg-alle' }, [el('label', { for:p + '-alle', tekst:'Fortsæt kun, hvis kontakten passer på ' }), alle]),
            rk,
            el('p', {}, [knap('+ Betingelse', 'knap lille rolig', function(){ t.regler.betingelser.push(SR.ny()); ret(); tegnTrin(); })]),
            el('p', { klasse:'hint', tekst:'Tjekkes i det øjeblik, kontakten når hertil. Passer hun ikke, stopper forløbet for hende.' })];
        }
        trinBoks.appendChild(el('div', { klasse:'au-trin', 'data-slags':t.slags }, [
          el('div', { klasse:'au-trin-hoved' }, [
            el('span', { klasse:'au-nr', tekst:String(i + 1) }),
            el('strong', { tekst:trinNavn(t.slags) }),
            el('span', { klasse:'au-trin-knapper' }, [
              i > 0 ? knap('↑', 'knap lille rolig', function(){ kl.trin.splice(i - 1, 0, kl.trin.splice(i, 1)[0]); ret(); tegnTrin(); }) : null,
              i < kl.trin.length - 1 ? knap('↓', 'knap lille rolig', function(){ kl.trin.splice(i + 1, 0, kl.trin.splice(i, 1)[0]); ret(); tegnTrin(); }) : null,
              knap('Kopiér', 'knap lille rolig', function(){ kl.trin.splice(i + 1, 0, kopi(t)); ret(); tegnTrin(); }),
              knap('Fjern', 'knap lille rolig', function(){ kl.trin.splice(i, 1); ret(); tegnTrin(); })])]),
          el('div', { klasse:'au-trin-krop' }, krop)]));
        var op = trinBoks.lastChild.querySelectorAll('.au-trin-knapper button');
        if(op[0] && op[0].textContent === '↑') op[0].setAttribute('aria-label', 'Flyt trin ' + (i + 1) + ' op');
        Array.prototype.forEach.call(op, function(b){ if(b.textContent === '↓') b.setAttribute('aria-label', 'Flyt trin ' + (i + 1) + ' ned'); });
      });
    }
    tegnTrin();
    var tilføj = el('div', { klasse:'au-tilfoej' }, [el('span', { klasse:'hint', tekst:'Tilføj trin: ' })].concat(TRIN.map(function(x){
      return knap('+ ' + x[1].replace(/ \(.*/, ''), 'knap lille rolig', function(){
        if(kl.trin.length >= 30){ status('Et forløb kan højst have 30 trin.', 'fejl'); return; }
        kl.trin.push(nytTrin(x[0])); ret(); tegnTrin();
        var sidste = trinBoks.lastChild; if(sidste && sidste.scrollIntoView) sidste.scrollIntoView({ block:'nearest' });
      });
    })));
    var iGang = gemt ? talFor(gemt.id).venter + talFor(gemt.id).koerer : 0;
    rod.appendChild(el('div', { klasse:'kort kt-kort' }, [
      el('h4', { tekst:'Trin' }),
      iGang ? el('p', { klasse:'hint au-advarsel', tekst:iGang + (iGang === 1 ? ' kontakt står' : ' kontakter står') + ' midt i forløbet. De fortsætter fra samme trinnummer - flytter eller fjerner du trin, kan de springe et trin over eller få et to gange.' }) : null,
      el('datalist', { id:'au-tags' }, data.tags.map(function(t){ return el('option', { value:t }); })),
      el('datalist', { id:'au-felter' }, data.felter.map(function(t){ return el('option', { value:t }); })),
      trinBoks, tilføj]));

    /* Gem, status, slet */
    function gem(nyStatus){
      var n = kl.navn.trim();
      if(!n){ status('Giv forløbet et navn.', 'fejl'); $('au-navn').focus(); return; }
      var u = rensUdloeser(kl.udloeser), galt = udloeserFejl(u);
      if(galt){ status('Udløseren: ' + galt, 'fejl'); return; }
      var trin = [];
      for(var i = 0; i < kl.trin.length; i++){
        var ren = rensTrin(kl.trin[i]), h = trinFejl(ren, kl.trin[i]);
        if(h){
          status('Trin ' + (i + 1) + ' (' + trinNavn(ren.slags).replace(/ \(.*/, '') + '): ' + h, 'fejl');
          var boks = trinBoks.children[i]; if(boks && boks.scrollIntoView) boks.scrollIntoView({ block:'center' });
          return;
        }
        trin.push(ren);
      }
      var st = nyStatus || (gemt ? gemt.status : 'kladde');
      if(st === 'live' && !trin.length){ status('Et forløb uden trin kan ikke sættes live.', 'fejl'); return; }
      if(nyStatus === 'live' && !confirm('Sæt "' + n + '" live?\n\nFra nu af starter det, når udløseren rammer en kontakt, og mails i forløbet sendes rigtigt.' + (iGang ? '\n\n' + iGang + ' ventende kørsler fortsætter.' : ''))) return;
      var krop = { navn:n, beskrivelse:kl.beskrivelse.trim(), en_gang:kl.en_gang !== false, udloeser:u, trin:trin, status:st };
      var kald = gemt
        ? rest('automatisering?id=eq.' + encodeURIComponent(gemt.id), { method:'PATCH', headers:{ Prefer:'return=representation' }, body:krop })
        : rest('automatisering', { method:'POST', headers:{ Prefer:'return=representation' }, body:krop });
      kald.then(function(r){
        if(!r || !r.length) throw new Error('Intet blev gemt.');
        data.forloeb = data.forloeb.filter(function(x){ return x.id !== r[0].id; }).concat([r[0]])
          .sort(function(a, b){ return a.navn.localeCompare(b.navn, 'da'); });
        visning.åben = r[0].id; kladde = null; rettet = false;
        status(nyStatus === 'live' ? 'Gemt - forløbet er live.' : nyStatus === 'kladde' ? 'Gemt - forløbet er sat på pause (kladde).' : nyStatus === 'arkiveret' ? 'Gemt - forløbet er arkiveret.' : 'Gemt.');
        tegn();
      }).catch(function(f){
        if(f && f.kode === '23505') status('Der findes allerede et forløb med det navn.', 'fejl');
        else if(f && f.kode === '23514') status('Databasen afviste forløbet. Tjek udløseren og trinene.', 'fejl');
        else fejl(f);
      });
    }
    var st = gemt ? gemt.status : 'kladde';
    rod.appendChild(el('div', { klasse:'kort kt-kort' }, [
      el('h4', { tekst:'Status: ' + STATUS[st] }),
      el('p', { klasse:'hint', tekst: st === 'live'
        ? 'Forløbet er live: det starter på udløseren, og motoren kører trinene. Rettelser gælder med det samme, når du gemmer.'
        : st === 'arkiveret' ? 'Forløbet er arkiveret: intet starter, og ventende kørsler står stille.'
        : 'Kladde = pause: intet starter, og kontakter midt i forløbet står stille, til det er live igen.' }),
      el('div', { klasse:'kt-handlinger' }, [
        knap(st === 'live' ? 'Gem' : 'Gem som ' + STATUS[st].toLowerCase(), 'knap', function(){ gem(); }),
        st !== 'live' ? knap('Gem og sæt live', 'knap lille', function(){ gem('live'); }) : null,
        st === 'live' ? knap('Sæt på pause (kladde)', 'knap lille rolig', function(){ gem('kladde'); }) : null,
        gemt && st !== 'arkiveret' ? knap('Arkivér', 'knap lille rolig', function(){ gem('arkiveret'); }) : null,
        gemt && st === 'arkiveret' ? knap('Tag ud af arkivet (kladde)', 'knap lille rolig', function(){ gem('kladde'); }) : null,
        gemt ? knap('Kopiér forløbet', 'knap lille rolig', function(){
          if(!forlad()) return;
          var nr = 1, nyt = function(){ return gemt.navn.slice(0, 105) + ' (kopi' + (nr > 1 ? ' ' + nr : '') + ')'; };
          while(data.forloeb.some(function(a){ return a.navn.trim().toLowerCase() === nyt().toLowerCase(); })) nr++;
          kladde = { navn:nyt(), beskrivelse:gemt.beskrivelse || '', en_gang:gemt.en_gang, udloeser:kopi(gemt.udloeser), trin:kopi(gemt.trin || []) };
          rettet = true; visning.åben = 'ny'; visning.fane = 'opsaetning'; status('Kopien er en kladde - giv den et navn og gem.'); tegn(); window.scrollTo(0, 0);
        }) : null,
        gemt ? knap('Slet forløbet', 'knap lille fare', function(){
          var t = talFor(gemt.id), alle = t.venter + t.koerer + t.faerdig + t.fejlet + t.stoppet;
          if(!confirm('Slet forløbet "' + gemt.navn + '"?\n\n' + (alle ? 'Dets ' + alle + ' kørsler og deres log slettes med' + (t.venter + t.koerer ? ' - ' + (t.venter + t.koerer) + ' er stadig i gang' : '') + '. ' : '') + 'Det kan ikke fortrydes. Arkivér i stedet, hvis historikken skal blive.')) return;
          rest('automatisering?id=eq.' + encodeURIComponent(gemt.id), { method:'DELETE', headers:{ Prefer:'return=representation' } })
            .then(function(r){
              if(!r || !r.length) throw new Error('Intet blev slettet.');
              data.forloeb = data.forloeb.filter(function(x){ return x.id !== gemt.id; });
              delete data.tal[gemt.id];
              visning.åben = null; kladde = null; rettet = false; status('Slettet.'); tegn();
            }).catch(fejl);
        }) : null])]));
  }

  // ---------- Kørsler ----------
  function tegnKoersler(rod, a){
    /* Start */
    var start = el('div', { klasse:'kort kt-kort' }, [el('h4', { tekst:'Start forløbet' })]);
    if(a.status !== 'live'){
      start.appendChild(el('p', { klasse:'hint', tekst:'Forløbet er ikke live. Sæt det live under Opsætning, før det kan startes.' }));
    } else {
      var seg = el('select', { id:'au-start-seg', 'aria-label':'Segment' });
      seg.appendChild(new Option('vælg et segment …', ''));
      data.segmenter.forEach(function(s){ seg.appendChild(new Option(s.navn, s.id)); });
      var mails = el('input', { id:'au-start-mails', placeholder:'fx anna@eksempel.dk, bo@eksempel.dk' });
      function startet(n, hvem){
        status(n + (n === 1 ? ' kontakt er startet' : ' kontakter er startet') + (hvem || '') + '.' + (a.en_gang ? ' Kontakter, der har været i forløbet før, springes over.' : ''));
        return hentTal().then(function(){ tegn(); });
      }
      start.appendChild(el('div', { klasse:'kt-grid' }, [
        el('div', { klasse:'kt-felt' }, [el('label', { for:'au-start-seg', tekst:'For alle i et segment' }), seg,
          el('p', {}, [knap('Start for segmentet', 'knap lille', function(){
            var s = data.segmenter.filter(function(x){ return x.id === seg.value; })[0];
            if(!s){ status('Vælg et segment.', 'fejl'); return; }
            if(!confirm('Start "' + a.navn + '" for alle i segmentet "' + s.navn + '"?\n\nMails i forløbet sendes rigtigt.')) return;
            rest('rpc/automatisering_start', { method:'POST', body:{ p_forloeb:a.id, p_kontakter:[], p_segment:s.id } })
              .then(function(n){ return startet(n || 0, ' fra segmentet "' + s.navn + '"'); }).catch(fejl);
          })])]),
        el('div', { klasse:'kt-felt' }, [el('label', { for:'au-start-mails', tekst:'For bestemte kontakter (mail, komma imellem)' }), mails,
          el('p', {}, [knap('Start for kontakterne', 'knap lille', function(){
            var m = liste(mails.value).map(function(x){ return x.toLowerCase(); });
            if(!m.length){ status('Skriv mindst én mailadresse.', 'fejl'); return; }
            if(m.length > 100){ status('Højst 100 ad gangen - brug et segment til flere.', 'fejl'); return; }
            var dårlig = m.filter(function(x){ return !MAIL.test(x) || /[",()]/.test(x); })[0];
            if(dårlig){ status('"' + dårlig + '" ligner ikke en mailadresse.', 'fejl'); return; }
            rest('kontakt?select=id,email&email=in.(' + m.map(function(x){ return encodeURIComponent('"' + x + '"'); }).join(',') + ')')
              .then(function(r){
                var fundet = {}; (r || []).forEach(function(k){ fundet[String(k.email).toLowerCase()] = k.id; });
                var mangler = m.filter(function(x){ return !fundet[x]; });
                if(mangler.length){ status('Findes ikke som kontakt: ' + mangler.join(', ') + '. Intet er startet.', 'fejl'); return; }
                if(!confirm('Start "' + a.navn + '" for ' + m.length + (m.length === 1 ? ' kontakt' : ' kontakter') + '?\n\nMails i forløbet sendes rigtigt.')) return;
                return rest('rpc/automatisering_start', { method:'POST', body:{ p_forloeb:a.id, p_kontakter:m.map(function(x){ return fundet[x]; }), p_segment:null } })
                  .then(function(n){ mails.value = ''; return startet(n || 0); });
              }).catch(fejl);
          })])])]));
      if(a.udloeser && a.udloeser.slags !== 'manuel') start.appendChild(el('p', { klasse:'hint', tekst:'Forløbet starter også af sig selv: ' + udloeserTekst(a.udloeser).toLowerCase() + '.' }));
    }
    rod.appendChild(start);

    /* Listen */
    var filter = el('select', { 'aria-label':'Vis kørsler med status' });
    filter.appendChild(new Option('Alle', ''));
    Object.keys(KSTATUS).forEach(function(s){ filter.appendChild(new Option(KSTATUS[s], s)); });
    filter.value = visning.filter;
    var antal = el('span', { klasse:'hint' });
    var tbody = el('tbody');
    var rækker = null, åbne = {};
    filter.addEventListener('change', function(){ visning.filter = filter.value; tegnRækker(); });
    rod.appendChild(el('div', { klasse:'au-top' }, [filter, antal, knap('Opdatér', 'knap lille rolig', function(){ hentKoersler(); hentTal(); })]));
    rod.appendChild(el('div', { klasse:'rulle' }, [el('table', { klasse:'kt-tabel au-tabel' }, [
      el('thead', {}, [el('tr', {}, ['Kontakt', 'Status', 'Står ved', 'Fortsætter', 'Startet', 'Udløst af', ''].map(function(t){ return el('th', { tekst:t }); }))]), tbody])]));

    function udløst(d){
      d = d || {};
      if(d.manuel) return 'Startet i bagrummet';
      if(d.ordre) return 'Ordre ' + d.ordre + (d.tilstand === 'test' ? ' (test)' : '');
      if(d.formular) return 'Formularen ' + d.formular;
      if(d.tag) return 'Tagget ' + d.tag;
      if('kilde' in d) return 'Ny kontakt';
      return '—';
    }
    function hvor(k){
      var trin = a.trin || [];
      if(k.status === 'faerdig') return 'Alle ' + trin.length + ' trin kørt';
      var t = trin[k.trin_nr];
      return 'Trin ' + (k.trin_nr + 1) + ' af ' + trin.length + (t ? ': ' + trinKort(t) : '') + (k.forsoeg ? ' · forsøg ' + (k.forsoeg + 1) : '');
    }
    function tegnRækker(){
      tøm(tbody);
      if(rækker === null){ tbody.appendChild(el('tr', {}, [el('td', { colspan:'7', klasse:'hint', tekst:'Henter …' })])); return; }
      var r = rækker.filter(function(k){ return !visning.filter || k.status === visning.filter; });
      antal.textContent = r.length + ' af ' + rækker.length + (rækker.length >= 500 ? ' (de 500 nyeste)' : '');
      if(!r.length) tbody.appendChild(el('tr', {}, [el('td', { colspan:'7', klasse:'hint', tekst: rækker.length ? 'Ingen kørsler med den status.' : 'Ingen kontakter har været i forløbet endnu.' })]));
      r.forEach(function(k){
        var ko = k.kontakt || {}, navn = ((ko.fornavn || '') + ' ' + (ko.efternavn || '')).trim();
        var tr = el('tr', { klasse:'kt-række', tabindex:'0', 'aria-expanded':String(!!åbne[k.id]) }, [
          el('td', {}, [el('strong', { tekst:ko.email || 'slettet kontakt' }), navn ? el('div', { klasse:'hint', tekst:navn }) : null]),
          el('td', {}, [mærke(k.status)]),
          el('td', { tekst:hvor(k) }),
          el('td', { tekst:k.status === 'venter' ? (a.status === 'live' ? dato(k.naeste_kl) : 'står stille (ikke live)') : '—' }),
          el('td', { tekst:dato(k.oprettet) }),
          el('td', { klasse:'hint', tekst:udløst(k.data) }),
          el('td', {}, [k.status === 'venter' ? (function(){
            var b = knap('Stop', 'knap lille rolig', function(e){
              e.stopPropagation();
              if(!confirm('Stop forløbet for ' + (ko.email || 'kontakten') + '?\n\nHun får ikke resten af trinene.')) return;
              rest('rpc/automatisering_stop', { method:'POST', body:{ p_koersel:k.id } }).then(function(ok){
                status(ok ? 'Stoppet.' : 'Kørslen ventede ikke længere - den er ikke stoppet.', ok ? '' : 'fejl');
                hentKoersler(); hentTal();
              }).catch(fejl);
            });
            return b;
          })() : null])]);
        var logTr = el('tr', { klasse:'au-log-række', hidden: !åbne[k.id] }, [el('td', { colspan:'7' })]);
        function visLog(){
          var td = logTr.firstChild; tøm(td); td.appendChild(el('span', { klasse:'hint', tekst:'Henter loggen …' }));
          rest('automatisering_log?select=*&koersel_id=eq.' + encodeURIComponent(k.id) + '&order=id.asc&limit=500').then(function(l){
            tøm(td);
            if(!l || !l.length){ td.appendChild(el('span', { klasse:'hint', tekst:'Intet i loggen endnu - motoren har ikke rørt kørslen.' })); return; }
            td.appendChild(el('ol', { klasse:'au-log' }, l.map(function(x){
              return el('li', { klasse:'au-l-' + x.resultat }, [
                el('span', { klasse:'kt-tid', tekst:dato(x.oprettet) + ' · trin ' + (x.trin_nr + 1) + (x.slags ? ' · ' + trinNavn(x.slags).replace(/ \(.*/, '') : '') }),
                el('strong', { tekst:{ ok:'OK', sprunget:'Sprunget over', fejl:'Fejl', stop:'Stoppet' }[x.resultat] || x.resultat }),
                ' ', x.besked || '']);
            })));
          }).catch(function(f){ tøm(td); td.appendChild(el('span', { klasse:'status fejl', tekst:api.forklar(f) })); });
        }
        function skift(){
          åbne[k.id] = !åbne[k.id]; logTr.hidden = !åbne[k.id]; tr.setAttribute('aria-expanded', String(!!åbne[k.id]));
          if(åbne[k.id]) visLog();
        }
        tr.addEventListener('click', skift);
        tr.addEventListener('keydown', function(e){ if(e.key === 'Enter' && e.target === tr) skift(); });
        tbody.appendChild(tr); tbody.appendChild(logTr);
        if(åbne[k.id]) visLog();
      });
    }
    function hentKoersler(){
      return rest('automatisering_koersel?select=*,kontakt(email,fornavn,efternavn)&automatisering_id=eq.' + encodeURIComponent(a.id) + '&order=oprettet.desc&limit=500')
        .then(function(r){ rækker = r || []; tegnRækker(); })
        .catch(function(f){ rækker = []; tegnRækker(); fejl(f); });
    }
    tegnRækker(); hentKoersler();
    rod.appendChild(el('p', { klasse:'hint', tekst:'Tryk på en række for at se loggen trin for trin. En fejl prøves igen efter 5 og 10 minutter; tredje fejl standser kørslen, og teamet får besked.' }));
  }

  window.ArytmiAutomatiseringer = {
    vis: function(a){
      api = a;
      if(rettet && visning.åben) { tegn(); return; }   /* en kladde med rettelser bliver stående */
      hent();
    }
  };
})();
