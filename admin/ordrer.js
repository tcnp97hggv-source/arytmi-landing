/* =============================================================
   ORDRER — DEN EGNE CHECKOUT (0087/0090, 9/11)
   =============================================================
   Erstatter ClickFunnels' Orders (docs/paritet-hele-clickfunnels.md §5):
   - Listen: søg, filtre (status, test/live, forsendelse, abonnement,
     funnel, tag, periode), gemte filtre (fælles), sum og CSV.
   - Ordren: kunde, adresse, varer, beløb, hvor den kom fra (funnel, side,
     split, utm), Stripe-links, tags og tidslinje med noter.
   - Handlinger gennem funktionen `ordre-handling` (admin + to-faktor):
     refundér (helt/delvist), annullér med årsag, opsig til periodens slut,
     fortryd opsigelse, skift pris på abonnement (pro rata eller ej),
     gensend kvittering, markér sendt (+ forsendelsesmail).
   Admin må kun rette tags direkte i databasen; alt andet går gennem
   serveren, så Stripe og ordren aldrig er uenige.
   ============================================================= */
(function(){
  'use strict';
  var api = null, startet = false;
  var data = { ordrer:[], filtre:[], funnels:{}, sider:{}, priser:[] };
  var TOM = { søg:'', status:'', tilstand:'', forsendelse:'', abonnement:'', funnel:'', tag:'', fra:'', til:'' };
  var visning = { åben:null, f:kopi(TOM), filterId:'' };
  var STATUS = { afventer:'Afventer betaling', betalt:'Betalt', fejlet:'Fejlet', annulleret:'Annulleret', refunderet:'Refunderet', delvist_refunderet:'Delvist refunderet' };
  var ABON = { aktiv:'Aktivt', opsagt:'Opsagt til periodens slut', ophoert:'Ophørt' };
  var INTERVAL = { dag:'dag', uge:'uge', maaned:'måned', kvartal:'kvartal', aar:'år' };

  function kopi(o){ return JSON.parse(JSON.stringify(o)); }
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
  function status(tekst, slags){ var s = $('or-status'); s.textContent = tekst || ''; s.className = 'status' + (slags ? ' ' + slags : ''); }
  function fejl(f){ status(f && f.kode === '42501' ? 'Serveren afviste det. Har din konto to-faktor, skal du have brugt den i den her session.' : api.forklar(f), 'fejl'); }
  function rest(sti, valg){ return api.json('/rest/v1/' + sti, valg); }
  function handling(krop){ return api.json('/functions/v1/ordre-handling', { method:'POST', body:krop }); }
  function dato(iso, tid){
    if(!iso) return '—';
    var d = new Date(iso);
    return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + d.getFullYear() + (tid ? ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '');
  }
  function kr(oere){ oere = oere || 0; var neg = oere < 0; oere = Math.abs(oere); var h = Math.floor(oere / 100), r = oere % 100; return (neg ? '−' : '') + String(h).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (r ? ',' + String(r).padStart(2, '0') : '') + ' kr.'; }
  function tilOere(tekst){ var t = String(tekst || '').trim().replace(/\./g, '').replace(',', '.').replace(/\s*kr\.?$/i, ''); var n = Math.round(parseFloat(t) * 100); return isFinite(n) ? n : NaN; }
  function navn(o){ return ((o.fornavn || '') + ' ' + (o.efternavn || '')).trim(); }
  /* Linjerne gemmer ikke "fysisk"; checkout beder kun om adresse og fragt, når noget skal sendes. */
  function fysisk(o){ return !!(o.adresse || o.fragtsats_id) || (o.linjer || []).some(function(l){ return l.fysisk; }); }
  function liste(v){ return String(v || '').split(/[,\n]/).map(function(x){ return x.trim(); }).filter(Boolean); }
  function netto(o){ return ['betalt', 'delvist_refunderet', 'refunderet'].indexOf(o.status) >= 0 ? o.total_oere - (o.refunderet_oere || 0) : 0; }
  function pris(l){
    if(l.slags === 'engang' || !l.interval) return '';
    return ' · ' + kr(l.loebende_oere != null ? l.loebende_oere : l.nu_oere) + ' pr. ' + (l.interval_antal > 1 ? l.interval_antal + ' ' : '') + (INTERVAL[l.interval] || l.interval);
  }
  function stripeLink(o, slags, id){
    if(!id) return null;
    var sti = { betaling: /^seti_/.test(id) ? 'setup_intents' : 'payments', abonnement:'subscriptions', kunde:'customers', faktura:'invoices' }[slags];
    return el('a', { href:'https://dashboard.stripe.com/' + (o.tilstand === 'test' ? 'test/' : '') + sti + '/' + encodeURIComponent(id), target:'_blank', rel:'noopener', tekst:slags.charAt(0).toUpperCase() + slags.slice(1) + ' ↗' });
  }

  function hent(){
    status('Henter …');
    return Promise.all([
      rest('checkout_ordre?select=*&order=oprettet.desc&limit=5000'),
      rest('ordre_filter?select=*&order=navn.asc'),
      rest('funnel?select=id,navn').catch(function(){ return []; }),
      rest('side?select=id,navn,sti').catch(function(){ return []; })
    ]).then(function(r){
      data.ordrer = r[0] || []; data.filtre = r[1] || [];
      data.funnels = {}; (r[2] || []).forEach(function(f){ data.funnels[f.id] = f.navn; });
      data.sider = {}; (r[3] || []).forEach(function(s){ data.sider[s.id] = s.navn + ' (' + s.sti + ')'; });
      status(''); tegn();
    }).catch(fejl);
  }

  function tegn(){
    var rod = $('or-indhold'); tøm(rod);
    if(visning.åben) return tegnOrdre(rod, visning.åben);
    tegnListe(rod);
  }

  /* ---------- Listen ---------- */
  function passer(o, f){
    if(f.status && o.status !== f.status) return false;
    if(f.tilstand && o.tilstand !== f.tilstand) return false;
    if(f.forsendelse === 'ikke_sendt' && !(fysisk(o) && !o.sendt_kl)) return false;
    if(f.forsendelse === 'sendt' && !o.sendt_kl) return false;
    if(f.forsendelse === 'ingen' && fysisk(o)) return false;
    if(f.abonnement === 'ingen' && o.stripe_abonnement) return false;
    if(f.abonnement && f.abonnement !== 'ingen' && o.abonnement_status !== f.abonnement) return false;
    if(f.funnel && o.funnel_id !== f.funnel) return false;
    if(f.tag && (o.tags || []).indexOf(f.tag) < 0) return false;
    if(f.fra && o.oprettet < f.fra) return false;
    if(f.til && o.oprettet.slice(0, 10) > f.til) return false;
    if(f.søg){
      var q = f.søg.toLowerCase();
      var tekst = [o.nummer, o.email, navn(o), o.telefon, o.rabatkode, o.tracking_nr, (o.tags || []).join(' '),
        (o.linjer || []).map(function(l){ return l.produkt + ' ' + (l.variant || ''); }).join(' ')].join(' ').toLowerCase();
      if(tekst.indexOf(q) < 0) return false;
    }
    return true;
  }
  function alleTags(){ var s = {}; data.ordrer.forEach(function(o){ (o.tags || []).forEach(function(t){ s[t] = 1; }); }); return Object.keys(s).sort(); }
  function vælg(label, felt, valg){
    var s = el('select', { 'aria-label':label });
    valg.forEach(function(v){ s.appendChild(new Option(v[1], v[0])); });
    s.value = visning.f[felt] || '';
    s.addEventListener('change', function(){ visning.f[felt] = s.value; visning.filterId = ''; tegn(); });
    return s;
  }

  function tegnListe(rod){
    var f = visning.f;
    /* Gemte filtre */
    var gemte = el('select', { 'aria-label':'Gemte filtre' });
    gemte.appendChild(new Option('Gemte filtre …', ''));
    data.filtre.forEach(function(g){ gemte.appendChild(new Option(g.navn, g.id)); });
    gemte.value = visning.filterId;
    gemte.addEventListener('change', function(){
      var g = data.filtre.filter(function(x){ return x.id === gemte.value; })[0];
      visning.filterId = gemte.value;
      visning.f = Object.assign(kopi(TOM), g ? g.filter : {});
      tegn();
    });
    var nytNavn = el('input', { type:'text', placeholder:'Navn på filteret', 'aria-label':'Navn på det nye filter', maxlength:'80' });
    var gemBoks = el('span', { klasse:'or-gem', hidden:true }, [nytNavn, knap('Gem', 'knap lille', function(){
      var n = nytNavn.value.trim(); if(!n){ nytNavn.focus(); return; }
      var filter = {}; Object.keys(f).forEach(function(k){ if(f[k]) filter[k] = f[k]; });
      rest('ordre_filter', { method:'POST', headers:{ Prefer:'return=representation' }, body:{ navn:n, filter:filter } })
        .then(function(r){ data.filtre.push(r[0]); data.filtre.sort(function(a, b){ return a.navn.localeCompare(b.navn, 'da'); }); visning.filterId = r[0].id; status('Filteret er gemt.'); tegn(); })
        .catch(function(e){ if(e && e.kode === '23505') status('Der findes allerede et filter med det navn.', 'fejl'); else fejl(e); });
    }), knap('Fortryd', 'knap lille rolig', function(){ gemBoks.hidden = true; })]);
    var filterKnapper = el('span', { klasse:'or-filterknapper' }, [
      knap('Gem som filter', 'knap lille rolig', function(){ gemBoks.hidden = false; nytNavn.focus(); }),
      visning.filterId ? knap('Slet filteret', 'knap lille rolig', function(){
        var g = data.filtre.filter(function(x){ return x.id === visning.filterId; })[0];
        if(!g || !confirm('Slet det gemte filter "' + g.navn + '"?')) return;
        rest('ordre_filter?id=eq.' + encodeURIComponent(g.id), { method:'DELETE' })
          .then(function(){ data.filtre = data.filtre.filter(function(x){ return x.id !== g.id; }); visning.filterId = ''; tegn(); }).catch(fejl);
      }) : null,
      knap('Nulstil', 'knap lille rolig', function(){ visning.f = kopi(TOM); visning.filterId = ''; tegn(); })]);

    var søg = el('input', { type:'search', placeholder:'Søg i nummer, mail, navn, vare, rabatkode, tracking …', 'aria-label':'Søg i ordrer' });
    søg.value = f.søg;
    søg.addEventListener('input', function(){ f.søg = søg.value; tegnRækker(); });
    var fra = el('input', { type:'date', 'aria-label':'Fra dato' }); fra.value = f.fra;
    var til = el('input', { type:'date', 'aria-label':'Til dato' }); til.value = f.til;
    fra.addEventListener('change', function(){ f.fra = fra.value; visning.filterId = ''; tegnRækker(); });
    til.addEventListener('change', function(){ f.til = til.value; visning.filterId = ''; tegnRækker(); });

    var funnelValg = [['', 'Alle funnels']].concat(Object.keys(data.funnels).map(function(id){ return [id, data.funnels[id]]; }).sort(function(a, b){ return a[1].localeCompare(b[1], 'da'); }));
    rod.appendChild(el('div', { klasse:'or-top' }, [søg, gemte, filterKnapper, gemBoks]));
    rod.appendChild(el('div', { klasse:'or-top' }, [
      vælg('Status', 'status', [['', 'Alle statusser']].concat(Object.keys(STATUS).map(function(k){ return [k, STATUS[k]]; }))),
      vælg('Test eller live', 'tilstand', [['', 'Test og live'], ['live', 'Kun live'], ['test', 'Kun test']]),
      vælg('Forsendelse', 'forsendelse', [['', 'Al forsendelse'], ['ikke_sendt', 'Skal sendes'], ['sendt', 'Sendt'], ['ingen', 'Intet at sende']]),
      vælg('Abonnement', 'abonnement', [['', 'Alle abonnementer'], ['aktiv', 'Aktivt'], ['opsagt', 'Opsagt'], ['ophoert', 'Ophørt'], ['ingen', 'Uden abonnement']]),
      vælg('Funnel', 'funnel', funnelValg),
      vælg('Tag', 'tag', [['', 'Alle tags']].concat(alleTags().map(function(t){ return [t, t]; }))),
      el('label', { klasse:'or-dato' }, ['Fra ', fra]), el('label', { klasse:'or-dato' }, ['til ', til])]));

    var sum = el('p', { klasse:'or-sum', role:'status' });
    var eksport = knap('Eksportér CSV', 'knap lille rolig', function(){ csv(data.ordrer.filter(function(o){ return passer(o, f); })); });
    rod.appendChild(el('div', { klasse:'or-top' }, [sum, eksport]));
    var tbody = el('tbody');
    rod.appendChild(el('div', { klasse:'rulle' }, [el('table', { klasse:'kt-tabel or-tabel' }, [
      el('thead', {}, [el('tr', {}, ['Ordre', 'Kunde', 'Varer', 'Total', 'Status', 'Dato'].map(function(t){ return el('th', { tekst:t }); }))]), tbody])]));

    function tegnRækker(){
      tøm(tbody);
      var r = data.ordrer.filter(function(o){ return passer(o, f); });
      var omsætning = r.reduce(function(s, o){ return s + netto(o); }, 0);
      sum.textContent = r.length + ' af ' + data.ordrer.length + ' ordrer · ' + kr(omsætning) + ' betalt (efter refusion)';
      if(!r.length) tbody.appendChild(el('tr', {}, [el('td', { colspan:'6', klasse:'hint', tekst: data.ordrer.length ? 'Ingen ordrer passer.' : 'Ingen ordrer endnu. De kommer, når nogen køber gennem en ordreformular.' })]));
      r.forEach(function(o){
        var varer = (o.linjer || []).map(function(l){ return (l.antal > 1 ? l.antal + ' × ' : '') + l.produkt + (l.variant ? ' · ' + l.variant : ''); }).join(', ');
        var mærker = [el('span', { klasse:'or-mærke or-' + o.status, tekst:STATUS[o.status] || o.status })];
        if(o.tilstand === 'test') mærker.push(el('span', { klasse:'kt-tag', tekst:'test' }));
        if(o.abonnement_status && o.abonnement_status !== 'aktiv') mærker.push(el('span', { klasse:'kt-tag', tekst:o.abonnement_status === 'opsagt' ? 'opsagt' : 'ophørt' }));
        if(fysisk(o) && ['betalt', 'delvist_refunderet'].indexOf(o.status) >= 0) mærker.push(el('span', { klasse:'kt-tag' + (o.sendt_kl ? '' : ' or-skal'), tekst:o.sendt_kl ? 'sendt' : 'skal sendes' }));
        (o.tags || []).forEach(function(t){ mærker.push(el('span', { klasse:'kt-tag', tekst:t })); });
        var tr = el('tr', { klasse:'kt-række', tabindex:'0' }, [
          el('td', {}, [el('strong', { tekst:o.nummer })]),
          el('td', {}, [navn(o), el('div', { klasse:'hint', tekst:o.email })]),
          el('td', { tekst:varer }),
          el('td', {}, [kr(o.total_oere), o.refunderet_oere ? el('div', { klasse:'hint', tekst:'refunderet ' + kr(o.refunderet_oere) }) : null]),
          el('td', {}, mærker),
          el('td', { tekst:dato(o.oprettet, true) })]);
        function åbn(){ visning.åben = o.id; tegn(); window.scrollTo(0, 0); }
        tr.addEventListener('click', åbn);
        tr.addEventListener('keydown', function(e){ if(e.key === 'Enter') åbn(); });
        tbody.appendChild(tr);
      });
    }
    tegnRækker();
  }

  /* ---------- Én ordre ---------- */
  function opdater(ny){ data.ordrer = data.ordrer.map(function(x){ return x.id === ny.id ? ny : x; }); }
  function kør(knp, krop, ok){
    knp.disabled = true; status('Arbejder …');
    return handling(krop).then(function(r){ if(r && r.ordre) opdater(r.ordre); status(ok); tegn(); })
      .catch(function(e){ knp.disabled = false; fejl(e); });
  }
  function kort(titel, børn, klasse){ return el('div', { klasse:'kort kt-kort ' + (klasse || '') }, [titel ? el('h4', { tekst:titel }) : null].concat(børn)); }
  function felt(label, input){ var id = 'or-f-' + Math.random().toString(36).slice(2, 8); input.id = id; return el('div', { klasse:'kt-felt' }, [el('label', { for:id, tekst:label }), input]); }
  function afkryds(label, checked){ var i = el('input', { type:'checkbox', id:'or-a-' + Math.random().toString(36).slice(2, 8) }); i.checked = !!checked; return { boks:i, el:el('div', { klasse:'afkryds' }, [i, el('label', { for:i.id, tekst:label })]) }; }

  function tegnOrdre(rod, id){
    var o = data.ordrer.filter(function(x){ return x.id === id; })[0];
    if(!o){ visning.åben = null; return tegn(); }
    var betalt = ['betalt', 'delvist_refunderet'].indexOf(o.status) >= 0;
    rod.appendChild(el('p', {}, [knap('← Alle ordrer', 'knap lille rolig', function(){ visning.åben = null; tegn(); })]));
    rod.appendChild(el('h3', { klasse:'kt-navn' }, [o.nummer + ' · ' + kr(o.total_oere) + ' ',
      el('span', { klasse:'or-mærke or-' + o.status, tekst:STATUS[o.status] || o.status }),
      o.tilstand === 'test' ? el('span', { klasse:'kt-tag', tekst:'test' }) : null]));

    /* Kunde + kilde */
    var a = o.adresse || {};
    var adr = [a.linje1 || a.adresse, a.linje2, [a.postnr, a.by].filter(Boolean).join(' '), a.land].filter(Boolean).join(', ');
    var utm = Object.keys(o.utm || {}).map(function(n){ return n.replace('utm_', '') + '=' + o.utm[n]; }).join(', ');
    rod.appendChild(el('div', { klasse:'or-to' }, [
      kort('Kunde', [
        el('p', {}, [el('strong', { tekst:navn(o) }), el('br'), el('a', { href:'mailto:' + o.email, tekst:o.email }), o.telefon ? el('br') : null, o.telefon || null]),
        adr ? el('p', { tekst:adr }) : el('p', { klasse:'hint', tekst:'Ingen leveringsadresse (intet fysisk).' }),
        el('p', {}, [knap('Åbn kontakten', 'knap lille rolig', function(){ visKontakt(o.email); })])]),
      kort('Ordren', [
        el('p', { klasse:'hint' }, ['Oprettet ' + dato(o.oprettet, true) + (o.betalt_kl ? ' · betalt ' + dato(o.betalt_kl, true) : '')]),
        el('p', { klasse:'hint', tekst:'Funnel: ' + (data.funnels[o.funnel_id] || '—') + ' · side: ' + (data.sider[o.side_id] || '—') + (o.variant ? ' · split ' + o.variant.toUpperCase() + (o.split_sti ? ' (' + o.split_sti + ')' : '') : '') }),
        utm ? el('p', { klasse:'hint', tekst:'UTM: ' + utm }) : null,
        o.stripe_abonnement ? el('p', { tekst:'Abonnement: ' + (ABON[o.abonnement_status] || 'ukendt') + (o.abonnement_slut ? ' · slutter ' + dato(o.abonnement_slut) : '') }) : null,
        o.annulleret_aarsag ? el('p', { tekst:'Årsag: ' + o.annulleret_aarsag + ' (' + dato(o.annulleret_kl, true) + ')' }) : null,
        el('p', { klasse:'or-stripe' }, [stripeLink(o, 'betaling', o.stripe_betaling), stripeLink(o, 'faktura', o.stripe_faktura), stripeLink(o, 'abonnement', o.stripe_abonnement), stripeLink(o, 'kunde', o.stripe_kunde)])])]));

    /* Varer og beløb */
    var linjer = el('tbody');
    (o.linjer || []).forEach(function(l){
      linjer.appendChild(el('tr', {}, [el('td', { tekst:(l.antal || 1) + ' ×' }), el('td', { tekst:l.produkt + (l.variant ? ' · ' + l.variant : '') + pris(l) }), el('td', { klasse:'or-tal', tekst:kr(l.nu_oere) })]));
    });
    function sumlinje(t, v, fed){ return el('tr', { klasse:fed ? 'or-fed' : null }, [el('td'), el('td', { tekst:t }), el('td', { klasse:'or-tal', tekst:v })]); }
    linjer.appendChild(sumlinje('Subtotal', kr(o.subtotal_oere)));
    if(o.rabat_oere) linjer.appendChild(sumlinje('Rabat' + (o.rabatkode ? ' (' + o.rabatkode + ')' : ''), kr(-o.rabat_oere)));
    if(fysisk(o) || o.fragt_oere) linjer.appendChild(sumlinje('Levering', o.fragt_oere ? kr(o.fragt_oere) : 'Gratis'));
    if(o.moms_oere != null) linjer.appendChild(sumlinje('Heraf moms', kr(o.moms_oere)));
    linjer.appendChild(sumlinje('Total', kr(o.total_oere), true));
    if(o.refunderet_oere) linjer.appendChild(sumlinje('Refunderet', kr(-o.refunderet_oere)));
    rod.appendChild(kort('Varer', [el('table', { klasse:'or-linjer' }, [linjer])]));

    /* Tags */
    var tags = el('input', { placeholder:'fx vip, reklamation' }); tags.value = (o.tags || []).join(', ');
    rod.appendChild(kort('Tags', [felt('Tags (adskil med komma)', tags), el('div', { klasse:'kt-handlinger' }, [knap('Gem tags', 'knap lille', function(){
      rest('checkout_ordre?id=eq.' + encodeURIComponent(o.id), { method:'PATCH', headers:{ Prefer:'return=representation' }, body:{ tags:liste(tags.value) } })
        .then(function(r){ if(!r || !r.length) throw new Error('Intet blev gemt.'); opdater(r[0]); status('Tags gemt.'); tegn(); }).catch(fejl);
    })])]));

    /* Handlinger */
    var handlinger = el('div', { klasse:'or-handlinger' });
    rod.appendChild(handlinger);

    if(betalt && /^pi_/.test(o.stripe_betaling || '')){
      var restOere = o.total_oere - (o.refunderet_oere || 0);
      var beløb = el('input', { inputmode:'decimal' }); beløb.value = (restOere / 100).toFixed(2).replace('.', ',');
      var årsagR = el('input', { maxlength:'500', placeholder:'fx fortrudt køb' });
      var stopOgså = o.stripe_abonnement && o.abonnement_status !== 'ophoert' ? afkryds('Stop også abonnementet med det samme', true) : null;
      var rk = knap('Refundér', 'knap lille fare', function(){
        var n = tilOere(beløb.value);
        if(!(n > 0) || n > restOere){ status('Beløbet skal være mellem 0,01 og ' + kr(restOere) + '.', 'fejl'); return; }
        if(!confirm('Refundér ' + kr(n) + ' til ' + o.email + '?\n\nPengene sendes tilbage via Stripe. Det kan ikke fortrydes.')) return;
        kør(rk, { handling:'refunder', id:o.id, beloeb_oere:n, aarsag:årsagR.value, annuller: !!(stopOgså && stopOgså.boks.checked) }, 'Refunderet.');
      });
      handlinger.appendChild(kort('Refundér', [el('div', { klasse:'kt-grid' }, [felt('Beløb i kr. (højst ' + kr(restOere) + ')', beløb), felt('Årsag', årsagR)]),
        stopOgså ? stopOgså.el : null, el('div', { klasse:'kt-handlinger' }, [rk])]));
    } else if(betalt){
      handlinger.appendChild(kort('Refundér', [el('p', { klasse:'hint', tekst:'Der er ingen betaling at refundere endnu (fx en prøveperiode). Stop abonnementet i stedet.' })]));
    }

    if(o.status === 'afventer' || o.status === 'fejlet'){
      var årsagA = el('input', { maxlength:'500', placeholder:'fx kunden fortrød' });
      var ak = knap('Annullér ordren', 'knap lille fare', function(){
        if(!årsagA.value.trim()){ status('Skriv en årsag.', 'fejl'); årsagA.focus(); return; }
        if(!confirm('Annullér ' + o.nummer + '? Betalingen i Stripe lukkes, så kunden ikke kan gennemføre den.')) return;
        kør(ak, { handling:'annuller', id:o.id, naar:'nu', aarsag:årsagA.value }, 'Ordren er annulleret.');
      });
      handlinger.appendChild(kort('Annullér', [felt('Årsag', årsagA), el('div', { klasse:'kt-handlinger' }, [ak])]));
    }

    if(o.stripe_abonnement && betalt && o.abonnement_status === 'aktiv'){
      var årsagS = el('input', { maxlength:'500', placeholder:'fx kunden har bedt om det' });
      var naar = el('select', {}, []); naar.appendChild(new Option('Ved periodens slut (kunden beholder adgangen perioden ud)', 'periodeslut')); naar.appendChild(new Option('Med det samme', 'nu'));
      var sk = knap('Stop abonnementet', 'knap lille fare', function(){
        if(!årsagS.value.trim()){ status('Skriv en årsag.', 'fejl'); årsagS.focus(); return; }
        if(!confirm(naar.value === 'nu' ? 'Stop abonnementet NU? Kunden får mailen om annullering.' : 'Opsig abonnementet til periodens slut?')) return;
        kør(sk, { handling:'annuller', id:o.id, naar:naar.value, aarsag:årsagS.value }, naar.value === 'nu' ? 'Abonnementet er stoppet.' : 'Abonnementet er opsagt til periodens slut.');
      });
      handlinger.appendChild(kort('Stop abonnementet', [el('div', { klasse:'kt-grid' }, [felt('Hvornår', naar), felt('Årsag', årsagS)]), el('div', { klasse:'kt-handlinger' }, [sk])]));

      var prisValg = el('select', {}); prisValg.appendChild(new Option('Henter priser …', ''));
      var proRata = afkryds('Pro rata: udlign forskellen for resten af perioden nu', true);
      var pk = knap('Skift pris', 'knap lille', function(){
        if(!prisValg.value){ status('Vælg en pris.', 'fejl'); return; }
        if(!confirm('Skift abonnementet til ' + prisValg.options[prisValg.selectedIndex].text + '?')) return;
        kør(pk, { handling:'skift_pris', id:o.id, pris_id:prisValg.value, pro_rata:proRata.boks.checked }, 'Prisen er skiftet.');
      });
      handlinger.appendChild(kort('Skift pris på abonnementet', [felt('Ny pris', prisValg), proRata.el, el('div', { klasse:'kt-handlinger' }, [pk])]));
      hentPriser().then(function(priser){
        tøm(prisValg); prisValg.appendChild(new Option('Vælg …', ''));
        var nu = ((o.linjer || []).filter(function(l){ return l.slags !== 'engang'; })[0] || {}).pris_id;
        priser.filter(function(p){ return p.id !== nu && p.stripe && p.stripe[o.tilstand] && p.stripe[o.tilstand].pris; }).forEach(function(p){
          var v = p.produkt_variant || {};
          prisValg.appendChild(new Option((v.produkt ? v.produkt.navn : '') + (v.er_standard ? '' : ' · ' + v.navn) + ' — ' + (p.navn ? p.navn + ', ' : '') + kr(p.beloeb_oere) + ' pr. ' + (p.interval_antal > 1 ? p.interval_antal + ' ' : '') + (INTERVAL[p.interval] || ''), p.id));
        });
        if(prisValg.options.length === 1) prisValg.options[0].text = 'Ingen andre abonnementspriser er sendt til Stripe (' + o.tilstand + ')';
      }).catch(fejl);
    }
    if(o.stripe_abonnement && o.abonnement_status === 'opsagt'){
      var gk = knap('Fortryd opsigelsen', 'knap lille', function(){ kør(gk, { handling:'genoptag', id:o.id }, 'Abonnementet fortsætter.'); });
      handlinger.appendChild(kort('Abonnementet er opsagt', [el('p', { tekst:'Slutter ' + dato(o.abonnement_slut) + '. Årsag: ' + (o.annulleret_aarsag || '—') }), el('div', { klasse:'kt-handlinger' }, [gk])]));
    }

    if(fysisk(o) && betalt){
      var nr = el('input', { maxlength:'80' }); nr.value = o.tracking_nr || '';
      var firma = el('input', { maxlength:'60', placeholder:'fx PostNord, GLS' }); firma.value = o.fragtfirma || '';
      var link = el('input', { type:'url', placeholder:'https://…' }); link.value = o.tracking_link || '';
      var mail = afkryds(o.tracking_mail_kl ? 'Send forsendelsesmailen igen (sendt ' + dato(o.tracking_mail_kl, true) + ')' : 'Send forsendelsesmail til kunden', !o.tracking_mail_kl);
      var fk = knap(o.sendt_kl ? 'Gem forsendelsen' : 'Markér som sendt', 'knap lille', function(){
        if(!nr.value.trim()){ status('Skriv et trackingnummer.', 'fejl'); nr.focus(); return; }
        kør(fk, { handling:'forsendelse', id:o.id, tracking_nr:nr.value, fragtfirma:firma.value, tracking_link:link.value, send_mail:mail.boks.checked }, 'Forsendelsen er gemt.');
      });
      handlinger.appendChild(kort('Forsendelse', [o.sendt_kl ? el('p', { klasse:'hint', tekst:'Sendt ' + dato(o.sendt_kl, true) }) : null,
        el('div', { klasse:'kt-grid' }, [felt('Trackingnummer', nr), felt('Fragtfirma', firma), felt('Sporingslink', link)]), mail.el, el('div', { klasse:'kt-handlinger' }, [fk])]));
    }

    if(betalt){
      var kk = knap('Gensend kvittering', 'knap lille rolig', function(){
        if(!confirm('Send ordrebekræftelsen igen til ' + o.email + '?')) return;
        kør(kk, { handling:'kvittering', id:o.id }, 'Kvitteringen er sendt igen.');
      });
      handlinger.appendChild(kort('Kvittering', [el('p', { klasse:'hint', tekst:'Sender samme ordrebekræftelse, som kunden fik ved købet.' }), el('div', { klasse:'kt-handlinger' }, [kk])]));
    }

    /* Tidslinje */
    var note = el('textarea', { rows:'3', placeholder:'Skriv en note …', 'aria-label':'Ny note', maxlength:'300' });
    var ol = el('ol', { klasse:'kt-tidslinje' });
    rod.appendChild(kort('Tidslinje', [note, el('p', {}, [knap('Tilføj note', 'knap lille', function(){
      if(!note.value.trim()) return;
      rest('checkout_ordre_haendelse', { method:'POST', body:{ ordre_id:o.id, slags:'note', titel:note.value.trim().slice(0, 300) } })
        .then(function(){ note.value = ''; tidslinje(); }).catch(fejl);
    })]), ol]));
    function tidslinje(){
      tøm(ol); ol.appendChild(el('li', { klasse:'hint', tekst:'Henter …' }));
      rest('checkout_ordre_haendelse?select=*&ordre_id=eq.' + encodeURIComponent(o.id) + '&order=oprettet.desc&limit=200').then(function(r){
        var poster = (r || []).slice();
        if(o.betalt_kl) poster.push({ slags:'status', titel:'Betalt', oprettet:o.betalt_kl });
        poster.push({ slags:'status', titel:'Ordren oprettet (' + (data.sider[o.side_id] || 'ordreformular') + ')', oprettet:o.oprettet });
        poster.sort(function(a, b){ return a.oprettet < b.oprettet ? 1 : -1; });
        tøm(ol);
        poster.forEach(function(h){
          var etiket = { note:'Note', refusion:'Refusion', annullering:'Abonnement/annullering', pris:'Pris', kvittering:'Kvittering', forsendelse:'Forsendelse', status:'Status' }[h.slags] || h.slags;
          var slet = h.slags === 'note' && h.id ? knap('Slet', 'knap lille rolig', function(){
            rest('checkout_ordre_haendelse?id=eq.' + encodeURIComponent(h.id), { method:'DELETE' }).then(tidslinje).catch(fejl);
          }) : null;
          var aarsag = h.data && h.data.aarsag ? el('div', { klasse:'hint', tekst:'Årsag: ' + h.data.aarsag }) : null;
          ol.appendChild(el('li', { klasse:'kt-post or-h-' + h.slags }, [el('span', { klasse:'kt-tid', tekst:dato(h.oprettet, true) + ' · ' + etiket }), el('strong', { tekst:h.titel }), aarsag, slet]));
        });
      }).catch(fejl);
    }
    tidslinje();
  }

  var priserLøfte = null;
  function hentPriser(){
    if(!priserLøfte) priserLøfte = rest('produkt_pris?select=id,navn,slags,beloeb_oere,interval,interval_antal,stripe,produkt_variant(navn,er_standard,produkt(navn))&slags=neq.engang&arkiveret=eq.false&order=beloeb_oere.asc')
      .catch(function(e){ priserLøfte = null; throw e; });
    return priserLøfte;
  }

  function visKontakt(mail){
    var k = document.querySelector('#faner button[data-fane="kontakter"]');
    if(k) k.click();
    status('');
    setTimeout(function(){ var s = document.querySelector('#kt-indhold input[type="search"]'); if(s){ s.value = mail; s.dispatchEvent(new Event('input')); } }, 600);
  }

  /* ---------- CSV ---------- */
  function csv(rækker){
    function c(v){ v = v === null || v === undefined ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    function b(oere){ return ((oere || 0) / 100).toFixed(2).replace('.', ','); }
    var hoved = ['nummer', 'dato', 'status', 'tilstand', 'email', 'fornavn', 'efternavn', 'telefon', 'adresse', 'varer', 'subtotal', 'rabat', 'rabatkode', 'fragt', 'moms', 'total', 'refunderet', 'abonnement', 'sendt', 'tracking', 'tags', 'funnel', 'utm'];
    var linjer = [hoved.join(';')].concat(rækker.map(function(o){
      var a = o.adresse || {};
      return [o.nummer, dato(o.oprettet, true), STATUS[o.status] || o.status, o.tilstand, o.email, o.fornavn, o.efternavn, o.telefon,
        [a.linje1 || a.adresse, a.linje2, a.postnr, a.by, a.land].filter(Boolean).join(', '),
        (o.linjer || []).map(function(l){ return (l.antal || 1) + ' x ' + l.produkt + (l.variant ? ' (' + l.variant + ')' : ''); }).join(', '),
        b(o.subtotal_oere), b(o.rabat_oere), o.rabatkode, b(o.fragt_oere), o.moms_oere == null ? '' : b(o.moms_oere), b(o.total_oere), b(o.refunderet_oere),
        o.abonnement_status ? ABON[o.abonnement_status] : '', o.sendt_kl ? dato(o.sendt_kl) : '', o.tracking_nr, (o.tags || []).join(', '),
        data.funnels[o.funnel_id] || '', Object.keys(o.utm || {}).map(function(n){ return n + '=' + o.utm[n]; }).join(' ')].map(c).join(';');
    }));
    var a = el('a', { href:URL.createObjectURL(new Blob(['﻿' + linjer.join('\n')], { type:'text/csv;charset=utf-8' })), download:'ordrer-' + new Date().toISOString().slice(0, 10) + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  window.ArytmiOrdrer = {
    vis: function(a){
      api = a;
      startet = true;
      hent();
    }
  };
})();
