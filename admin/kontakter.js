/* =============================================================
   KONTAKTER — FORMULARER -> KONTAKTER (0089, 9/11)
   =============================================================
   Kennet 9/11: "lav formularer -> kontakter nu". Erstatter ClickFunnels'
   Contacts og formularernes opt-ins.

   UNDERFANER: Kontakter · Segmenter · Formularer.
   - Kontakter: søgning, tagfilter, kontaktkort med egne felter, tags,
     tidslinje (formularer, samtykker, noter) og kundens køb fra den egne
     checkout (checkout_ordre på mailen). Noter, sletning (GDPR) og CSV.
   - Segmenter (0093, 10/11): navngivne målgrupper. Et segment er REGLER,
     ikke en liste - hvem der er med, regnes ud i databasen
     (segment_kontakter / segment_medlemskab), så bagrummet og en senere
     kampagne altid er enige. Reglerne tjekkes også her, før de sendes.
   - Formularer: én række pr. data-arytmi-formular på siderne - hvem der
     får besked, når den sendes, og hvilke tags kontakten får.

   Kontakterne skrives af funktionen `formular` (formular_indsend). Her
   retter man dem. DOM bygges med textContent og createElement som resten
   af bagrummet.
   ============================================================= */
(function(){
  'use strict';
  var api = null, startet = false;
  /* segmenter === null: 0093 er ikke kørt endnu. medlem: { segment-id: { kontakt-id: true } }. */
  var data = { kontakter:[], formularer:[], segmenter:null, medlem:{}, produkter:[] };
  var visning = { fane:'kontakter', søg:'', tag:'', segment:'', åben:null, seg:null };

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
  function status(tekst, slags){ var s = $('kt-status'); s.textContent = tekst || ''; s.className = 'status' + (slags ? ' ' + slags : ''); }
  function fejl(f){ status(f && f.kode === '42501' ? 'Serveren afviste det. Har din konto to-faktor, skal du have brugt den i den her session.' : api.forklar(f), 'fejl'); }
  function rest(sti, valg){ return api.json('/rest/v1/' + sti, valg); }
  function dato(iso, tid){
    if(!iso) return '—';
    var d = new Date(iso);
    return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + d.getFullYear() + (tid ? ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') : '');
  }
  function kr(oere){ var h = Math.floor(oere / 100), r = oere % 100; return String(h).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (r ? ',' + String(r).padStart(2, '0') : '') + ' kr.'; }
  function navn(k){ return ((k.fornavn || '') + ' ' + (k.efternavn || '')).trim() || '—'; }
  function feltNavn(n){ var t = n.replace(/^arytmi_/, '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); }
  function liste(v){ return String(v || '').split(/[,\n]/).map(function(x){ return x.trim(); }).filter(Boolean); }

  function hent(){
    status('Henter …');
    return Promise.all([
      rest('kontakt?select=*&order=oprettet.desc&limit=2000'),
      rest('formular?select=*&order=noegle.asc'),
      rest('segment?select=*&order=navn.asc').catch(function(){ return null; }),
      rest('produkt?select=id,navn&order=navn.asc').catch(function(){ return []; })
    ]).then(function(r){
      data.kontakter = r[0] || []; data.formularer = r[1] || []; data.segmenter = r[2]; data.produkter = r[3] || [];
      return hentMedlemskab();
    }).then(function(){ status(''); tegn(); }).catch(fejl);
  }
  function hentMedlemskab(){
    data.medlem = {};
    if(!data.segmenter) return Promise.resolve();
    return rest('rpc/segment_medlemskab', { method:'POST', body:{} }).then(function(r){
      (r || []).forEach(function(m){ (data.medlem[m.segment_id] = data.medlem[m.segment_id] || {})[m.kontakt_id] = true; });
    }).catch(function(){});
  }
  function antalI(id){ return Object.keys(data.medlem[id] || {}).length; }

  function tegn(){
    Array.prototype.forEach.call(document.querySelectorAll('#kt-faner [data-kf]'), function(b){ b.setAttribute('aria-selected', String(b.getAttribute('data-kf') === visning.fane)); });
    var rod = $('kt-indhold'); tøm(rod);
    if(visning.fane === 'formularer') return tegnFormularer(rod);
    if(visning.fane === 'segmenter') return visning.seg ? tegnSegment(rod, visning.seg) : tegnSegmenter(rod);
    if(visning.åben) return tegnKort(rod, visning.åben);
    tegnListe(rod);
  }

  /* ---------- Listen ---------- */
  function alleTags(){
    var s = {}; data.kontakter.forEach(function(k){ (k.tags || []).forEach(function(t){ s[t] = (s[t] || 0) + 1; }); });
    return Object.keys(s).sort();
  }
  function filtreret(){
    var q = visning.søg.toLowerCase();
    return data.kontakter.filter(function(k){
      if(visning.tag && (k.tags || []).indexOf(visning.tag) < 0) return false;
      if(visning.segment && !(data.medlem[visning.segment] || {})[k.id]) return false;
      if(!q) return true;
      return [k.email, k.fornavn, k.efternavn, k.telefon, JSON.stringify(k.felter || {})].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function tegnListe(rod){
    var søg = el('input', { type:'search', placeholder:'Søg i mail, navn, telefon og felter …', 'aria-label':'Søg i kontakter' });
    søg.value = visning.søg;
    søg.addEventListener('input', function(){ visning.søg = søg.value; tegnRækker(); });
    var tag = el('select', { 'aria-label':'Vis kun kontakter med tagget' });
    tag.appendChild(new Option('Alle tags', ''));
    alleTags().forEach(function(t){ tag.appendChild(new Option(t, t)); });
    tag.value = visning.tag;
    tag.addEventListener('change', function(){ visning.tag = tag.value; tegnRækker(); });
    var seg = null;
    if(data.segmenter && data.segmenter.length){
      seg = el('select', { 'aria-label':'Vis kun kontakter i segmentet' });
      seg.appendChild(new Option('Alle segmenter', ''));
      data.segmenter.forEach(function(x){ seg.appendChild(new Option(x.navn + ' (' + antalI(x.id) + ')', x.id)); });
      seg.value = visning.segment;
      if(seg.value !== visning.segment) visning.segment = '';
      seg.addEventListener('change', function(){ visning.segment = seg.value; tegnRækker(); });
    }
    var antal = el('span', { klasse:'hint' });
    rod.appendChild(el('div', { klasse:'kt-top' }, [søg, tag, seg, antal,
      knap('+ Ny kontakt', 'knap lille', function(){ nyKontakt(); }),
      knap('Eksportér CSV', 'knap lille rolig', function(){ eksport(filtreret()); })]));
    var tbody = el('tbody');
    rod.appendChild(el('div', { klasse:'rulle' }, [el('table', { klasse:'kt-tabel' }, [
      el('thead', {}, [el('tr', {}, ['Mail', 'Navn', 'Tags', 'Kilde', 'Oprettet'].map(function(t){ return el('th', { tekst:t }); }))]), tbody])]));
    function tegnRækker(){
      tøm(tbody);
      var r = filtreret();
      antal.textContent = r.length + ' af ' + data.kontakter.length;
      if(!r.length) tbody.appendChild(el('tr', {}, [el('td', { colspan:'5', klasse:'hint', tekst: data.kontakter.length ? 'Ingen kontakter passer.' : 'Ingen kontakter endnu. De kommer, når nogen sender en formular på jeres sider.' })]));
      r.forEach(function(k){
        var tr = el('tr', { klasse:'kt-række', tabindex:'0' }, [
          el('td', {}, [el('strong', { tekst:k.email }), k.afmeldt_kl ? el('span', { klasse:'kt-tag kt-afmeldt', tekst:'afmeldt' }) : null]),
          el('td', { tekst:navn(k) }),
          el('td', {}, (k.tags || []).map(function(t){ return el('span', { klasse:'kt-tag', tekst:t }); })),
          el('td', { klasse:'hint', tekst:k.kilde || '' }),
          el('td', { tekst:dato(k.oprettet) })]);
        function åbn(){ visning.åben = k.id; tegn(); window.scrollTo(0, 0); }
        tr.addEventListener('click', åbn);
        tr.addEventListener('keydown', function(e){ if(e.key === 'Enter') åbn(); });
        tbody.appendChild(tr);
      });
    }
    tegnRækker();
  }

  function nyKontakt(){
    var mail = prompt('Mailadresse på den nye kontakt:');
    if(!mail) return;
    rest('kontakt', { method:'POST', headers:{ Prefer:'return=representation' }, body:{ email:mail.trim().toLowerCase(), kilde:'oprettet i bagrummet' } })
      .then(function(r){ data.kontakter.unshift(r[0]); visning.åben = r[0].id; tegn(); })
      .catch(function(f){ if(f && f.kode === '23505') status('Den mail findes allerede.', 'fejl'); else if(f && f.kode === '23514') status('Det ligner ikke en mailadresse.', 'fejl'); else fejl(f); });
  }

  /* ---------- Kontaktkortet ---------- */
  function tegnKort(rod, id){
    var k = data.kontakter.filter(function(x){ return x.id === id; })[0];
    if(!k){ visning.åben = null; return tegn(); }
    rod.appendChild(el('p', {}, [knap('← Alle kontakter', 'knap lille rolig', function(){ visning.åben = null; tegn(); })]));
    rod.appendChild(el('h3', { klasse:'kt-navn', tekst:navn(k) !== '—' ? navn(k) : k.email }));

    var f = {};
    function felt(n, l, v, type){ var i = el('input', { id:'kt-' + n, type:type || 'text' }); i.value = v || ''; f[n] = i; return el('div', { klasse:'kt-felt' }, [el('label', { for:i.id, tekst:l }), i]); }
    var egne = el('div', { klasse:'kt-felter' });
    var feltRækker = Object.keys(k.felter || {}).map(function(n){ return [n, k.felter[n]]; });
    function tegnEgne(){
      tøm(egne);
      feltRækker.forEach(function(r, i){
        var nInp = el('input', { 'aria-label':'Feltets navn', value:r[0] }), vInp = el('input', { 'aria-label':'Værdi' });
        vInp.value = r[1];
        nInp.addEventListener('input', function(){ r[0] = nInp.value; }); vInp.addEventListener('input', function(){ r[1] = vInp.value; });
        egne.appendChild(el('div', { klasse:'kt-egen' }, [el('span', { klasse:'hint', tekst:feltNavn(r[0]) }), nInp, vInp,
          knap('Fjern', 'knap lille rolig', function(){ feltRækker.splice(i, 1); tegnEgne(); })]));
      });
      egne.appendChild(knap('+ Felt', 'knap lille rolig', function(){ feltRækker.push(['', '']); tegnEgne(); }));
    }
    tegnEgne();
    var tags = el('input', { id:'kt-tags', placeholder:'fx manuel kunde, pasform' }); tags.value = (k.tags || []).join(', ');
    var samtykke = el('input', { type:'checkbox', id:'kt-nyheder' }); samtykke.checked = !!k.nyheder_samtykke;

    rod.appendChild(el('div', { klasse:'kort kt-kort' }, [
      el('div', { klasse:'kt-grid' }, [felt('email', 'Mail', k.email, 'email'), felt('fornavn', 'Fornavn', k.fornavn), felt('efternavn', 'Efternavn', k.efternavn), felt('telefon', 'Telefon', k.telefon, 'tel')]),
      el('div', { klasse:'kt-felt' }, [el('label', { for:'kt-tags', tekst:'Tags (adskil med komma)' }), tags]),
      el('div', { klasse:'afkryds' }, [samtykke, el('label', { for:'kt-nyheder', tekst:'Har sagt ja til nyhedsmails' })]),
      (function(){
        var med = (data.segmenter || []).filter(function(x){ return (data.medlem[x.id] || {})[k.id]; });
        if(!data.segmenter) return null;
        return el('p', { klasse:'kt-isegment' }, [el('span', { klasse:'hint', tekst:'Segmenter: ' })].concat(
          med.length ? med.map(function(x){ return el('span', { klasse:'kt-tag', tekst:x.navn }); }) : [el('span', { klasse:'hint', tekst:'ingen' })]));
      })(),
      el('h4', { tekst:'Egne felter' }), egne,
      el('p', { klasse:'hint', tekst:'Kilde: ' + (k.kilde || '—') + ' · oprettet ' + dato(k.oprettet, true) + (Object.keys(k.utm || {}).length ? ' · ' + Object.keys(k.utm).map(function(n){ return n.replace('utm_', '') + '=' + k.utm[n]; }).join(', ') : '') }),
      el('div', { klasse:'kt-handlinger' }, [
        knap('Gem', 'knap', function(){
          var felter = {}; feltRækker.forEach(function(r){ var n = r[0].trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'); if(n && String(r[1]).trim()) felter[n] = String(r[1]).trim(); });
          rest('kontakt?id=eq.' + encodeURIComponent(k.id), { method:'PATCH', headers:{ Prefer:'return=representation' }, body:{
            email:f.email.value.trim().toLowerCase(), fornavn:f.fornavn.value.trim(), efternavn:f.efternavn.value.trim(), telefon:f.telefon.value.trim(),
            tags:liste(tags.value), nyheder_samtykke:samtykke.checked, felter:felter } })
            .then(function(r){ if(!r || !r.length) throw new Error('Intet blev gemt.'); data.kontakter = data.kontakter.map(function(x){ return x.id === k.id ? r[0] : x; }); return hentMedlemskab(); })
            .then(function(){ status('Gemt.'); tegn(); })
            .catch(fejl);
        }),
        knap(k.afmeldt_kl ? 'Tilmeld igen' : 'Afmeld mails', 'knap lille rolig', function(){
          rest('kontakt?id=eq.' + encodeURIComponent(k.id), { method:'PATCH', headers:{ Prefer:'return=representation' }, body:{ afmeldt_kl: k.afmeldt_kl ? null : new Date().toISOString(), nyheder_samtykke: k.afmeldt_kl ? k.nyheder_samtykke : false } })
            .then(function(r){ data.kontakter = data.kontakter.map(function(x){ return x.id === k.id ? r[0] : x; });
              return rest('kontakt_haendelse', { method:'POST', body:{ kontakt_id:k.id, slags:'afmeldt', titel: k.afmeldt_kl ? 'Tilmeldt igen i bagrummet' : 'Afmeldt i bagrummet' } }); })
            .then(function(){ tegn(); }).catch(fejl);
        }),
        knap('Slet kontakten (GDPR)', 'knap lille fare', function(){
          if(!confirm('Slet ' + k.email + ' og hele tidslinjen?\n\nDet kan ikke fortrydes. Ordrer fra checkouten bliver liggende (bogføring).')) return;
          rest('kontakt?id=eq.' + encodeURIComponent(k.id), { method:'DELETE', headers:{ Prefer:'return=representation' } })
            .then(function(r){ if(!r || !r.length) throw new Error('Intet blev slettet.'); data.kontakter = data.kontakter.filter(function(x){ return x.id !== k.id; }); visning.åben = null; status('Slettet.'); tegn(); })
            .catch(fejl);
        })])]));

    /* Note */
    var note = el('textarea', { rows:'3', placeholder:'Skriv en note …', 'aria-label':'Ny note' });
    rod.appendChild(el('div', { klasse:'kort kt-kort' }, [el('h4', { tekst:'Tidslinje' }), note,
      el('p', {}, [knap('Tilføj note', 'knap lille', function(){
        if(!note.value.trim()) return;
        rest('kontakt_haendelse', { method:'POST', body:{ kontakt_id:k.id, slags:'note', titel:note.value.trim().slice(0, 300), data:{ tekst:note.value.trim() } } })
          .then(function(){ note.value = ''; tegnTidslinje(); }).catch(fejl);
      })]), (function(){ var t = el('ol', { klasse:'kt-tidslinje', id:'kt-tidslinje' }); return t; })()]));
    function tegnTidslinje(){
      var ol = $('kt-tidslinje'); tøm(ol); ol.appendChild(el('li', { klasse:'hint', tekst:'Henter …' }));
      Promise.all([
        rest('kontakt_haendelse?select=*&kontakt_id=eq.' + encodeURIComponent(k.id) + '&order=oprettet.desc&limit=200'),
        rest('checkout_ordre?select=nummer,status,tilstand,total_oere,linjer,oprettet&email=ilike.' + encodeURIComponent(k.email) + '&order=oprettet.desc&limit=50').catch(function(){ return []; })
      ]).then(function(r){
        var poster = (r[0] || []).map(function(h){ return { t:h.oprettet, h:h }; }).concat((r[1] || []).map(function(o){ return { t:o.oprettet, o:o }; }))
          .sort(function(a, b){ return a.t < b.t ? 1 : -1; });
        tøm(ol);
        if(!poster.length) ol.appendChild(el('li', { klasse:'hint', tekst:'Intet endnu.' }));
        poster.forEach(function(p){
          if(p.o){
            var o = p.o, varer = (o.linjer || []).map(function(l){ return l.produkt + (l.variant ? ' · ' + l.variant : ''); }).join(', ');
            ol.appendChild(el('li', { klasse:'kt-post kt-koeb' }, [el('span', { klasse:'kt-tid', tekst:dato(o.oprettet, true) }),
              el('strong', { tekst:'Køb ' + o.nummer + ' · ' + kr(o.total_oere) + ' · ' + o.status + (o.tilstand === 'test' ? ' (test)' : '') }), el('div', { klasse:'hint', tekst:varer })]));
            return;
          }
          var h = p.h, slet = null;
          if(h.slags === 'note') slet = knap('Slet', 'knap lille rolig', function(){
            rest('kontakt_haendelse?id=eq.' + encodeURIComponent(h.id), { method:'DELETE' }).then(tegnTidslinje).catch(fejl);
          });
          var detaljer = null;
          if(h.slags === 'formular' && h.data && h.data.felter){
            detaljer = el('div', { klasse:'hint', tekst: Object.keys(h.data.felter).map(function(n){ return feltNavn(n) + ': ' + h.data.felter[n]; }).join(' · ') + (h.data.side ? ' · ' + h.data.side : '') });
          } else if(h.slags === 'note' && h.data && h.data.tekst && h.data.tekst !== h.titel){
            detaljer = el('div', { tekst:h.data.tekst });
          } else if(h.slags === 'samtykke'){
            detaljer = el('div', { klasse:'hint', tekst:'Fra formularen ' + ((h.data && h.data.formular) || '?') + ((h.data && h.data.side) ? ' på ' + h.data.side : '') });
          }
          var etiket = { formular:'Formular', samtykke:'Samtykke', note:'Note', import:'Import', tag:'Tag', afmeldt:'Mails' }[h.slags] || h.slags;
          ol.appendChild(el('li', { klasse:'kt-post kt-' + h.slags }, [el('span', { klasse:'kt-tid', tekst:dato(h.oprettet, true) + ' · ' + etiket }),
            el('strong', { tekst:h.titel }), detaljer, slet]));
        });
      }).catch(fejl);
    }
    tegnTidslinje();
  }

  /* ---------- CSV ---------- */
  function eksport(rækker){
    var nøgler = {}; rækker.forEach(function(k){ Object.keys(k.felter || {}).forEach(function(n){ nøgler[n] = 1; }); });
    var egne = Object.keys(nøgler).sort();
    var hoved = ['email', 'fornavn', 'efternavn', 'telefon', 'tags', 'nyheder_samtykke', 'afmeldt', 'kilde', 'oprettet'].concat(egne);
    function c(v){ v = v === null || v === undefined ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var linjer = [hoved.join(';')].concat(rækker.map(function(k){
      return [k.email, k.fornavn, k.efternavn, k.telefon, (k.tags || []).join(', '), k.nyheder_samtykke ? 'ja' : 'nej', k.afmeldt_kl ? dato(k.afmeldt_kl) : '', k.kilde, dato(k.oprettet)]
        .concat(egne.map(function(n){ return (k.felter || {})[n]; })).map(c).join(';');
    }));
    var a = el('a', { href:URL.createObjectURL(new Blob(['﻿' + linjer.join('\n')], { type:'text/csv;charset=utf-8' })), download:'kontakter-' + new Date().toISOString().slice(0, 10) + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- Segmenter (0093) ---------- */
  var TEKST_OPS = [['er', 'er'], ['er_ikke', 'er ikke'], ['indeholder', 'indeholder'], ['indeholder_ikke', 'indeholder ikke'], ['udfyldt', 'er udfyldt'], ['tom', 'er tomt']];
  var DAGE_OPS = [['sidste_dage', 'inden for de sidste (dage)'], ['aeldre_end_dage', 'for mere end (dage) siden']];
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  /* felt -> navn, regler (ops) og hvilket værdifelt der hører til (slags).
     Samme liste som segment_regler_ok() i 0093 - databasen afviser resten. */
  var SEG_FELTER = {
    tag:           { navn:'Tag', ops:[['har', 'har tagget'], ['har_ikke', 'har ikke tagget']], slags:'tag' },
    formular:      { navn:'Formular', ops:[['indsendt', 'har sendt'], ['ikke_indsendt', 'har ikke sendt']], slags:'formular' },
    formular_side: { navn:'Formular fra side', ops:[['indeholder', 'sendt fra en sti, der indeholder'], ['indeholder_ikke', 'ikke sendt fra en sti, der indeholder']], slags:'tekst' },
    koeb:          { navn:'Køb', ops:[['har_koebt', 'har købt'], ['har_ikke_koebt', 'har ikke købt']], slags:'produkt', test:true },
    abonnement:    { navn:'Abonnement', ops:[['aktiv', 'er aktivt'], ['opsagt', 'er opsagt, men løber endnu'], ['ophoert', 'er ophørt'], ['ingen', 'har intet løbende']], slags:'ingen', test:true },
    nyheder:       { navn:'Nyhedsmails', ops:[['ja', 'har sagt ja'], ['nej', 'har ikke sagt ja']], slags:'ingen' },
    afmeldt:       { navn:'Afmelding', ops:[['ja', 'har afmeldt mails'], ['nej', 'har ikke afmeldt mails']], slags:'ingen' },
    eget_felt:     { navn:'Eget felt', ops:TEKST_OPS, slags:'tekst', nøgle:'felt' },
    utm:           { navn:'Kom fra (UTM)', ops:TEKST_OPS, slags:'tekst', nøgle:'utm' },
    email:         { navn:'Mail', ops:TEKST_OPS, slags:'tekst' },
    fornavn:       { navn:'Fornavn', ops:TEKST_OPS, slags:'tekst' },
    efternavn:     { navn:'Efternavn', ops:TEKST_OPS, slags:'tekst' },
    telefon:       { navn:'Telefon', ops:TEKST_OPS, slags:'tekst' },
    kilde:         { navn:'Kilde', ops:TEKST_OPS, slags:'tekst' },
    oprettet:      { navn:'Oprettet', ops:DAGE_OPS.concat([['fra', 'fra og med datoen'], ['foer', 'før datoen']]), slags:'tid' },
    aktivitet:     { navn:'Sidste aktivitet', ops:DAGE_OPS, slags:'tid' }
  };
  function udenVærdi(b){ var d = SEG_FELTER[b.felt]; return !d || d.slags === 'ingen' || b.op === 'udfyldt' || b.op === 'tom'; }
  function betingelseFejl(b){
    var d = SEG_FELTER[b.felt];
    if(!d) return 'Vælg, hvad betingelsen handler om.';
    if(!d.ops.some(function(o){ return o[0] === b.op; })) return 'Vælg en regel.';
    var v = String(b.vaerdi || '').trim();
    if(d.nøgle && !/^[a-z0-9_]{1,60}$/.test(b.noegle || '')) return 'Vælg, hvilket felt det gælder.';
    if(v.length > 200) return 'Teksten er for lang.';
    if(d.slags === 'tag' && !v) return 'Skriv et tag.';
    if(d.slags === 'tekst' && !udenVærdi(b) && !v) return 'Skriv en tekst.';
    if(d.slags === 'tid'){
      if(b.op === 'fra' || b.op === 'foer'){ if(!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Vælg en dato.'; }
      else if(!/^\d{1,4}$/.test(v)) return 'Skriv et antal dage.';
    }
    return '';
  }
  /* Det, databasen får: kun de felter, reglen bruger. */
  function rens(regler){
    return { alle: regler.alle !== false, betingelser:(regler.betingelser || []).map(function(b){
      var d = SEG_FELTER[b.felt] || {}, ud = { felt:b.felt, op:b.op, vaerdi: udenVærdi(b) ? '' : String(b.vaerdi || '').trim() };
      if(d.nøgle) ud.noegle = b.noegle;
      if(d.test && b.med_test) ud.med_test = true;
      return ud;
    }) };
  }
  function opNavn(d, op){ var o = d.ops.filter(function(x){ return x[0] === op; })[0]; return o ? o[1] : '?'; }
  function betingelseTekst(b){
    var d = SEG_FELTER[b.felt]; if(!d) return 'ukendt betingelse';
    var op = opNavn(d, b.op), v = String(b.vaerdi || ''), test = d.test && b.med_test ? ' (også testkøb)' : '', t;
    if(d.slags === 'ingen') t = d.navn + ': ' + op + test;
    else if(d.slags === 'tag') t = op + ' "' + v + '"';
    else if(d.slags === 'formular'){
      var fm = data.formularer.filter(function(x){ return x.noegle === v; })[0];
      t = op + (v ? ' formularen "' + ((fm && fm.navn) || v) + '"' : ' en formular');
    }
    else if(d.slags === 'produkt'){
      var p = data.produkter.filter(function(x){ return x.id === v; })[0];
      t = op + ' ' + (v ? '"' + (p ? p.navn : 'et slettet produkt') + '"' : 'noget') + test;
    }
    else if(d.slags === 'tid') t = d.navn + ' ' + (b.op === 'fra' || b.op === 'foer' ? op + ' ' + v : op.replace('(dage)', v + ' dage'));
    else t = (d.nøgle === 'felt' ? feltNavn(b.noegle || '?') : d.nøgle ? (b.noegle || '?') : d.navn) + ' ' + op + (udenVærdi(b) ? '' : ' "' + v + '"');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function reglerTekst(regler){
    var b = (regler && regler.betingelser) || [];
    if(!b.length) return 'Alle kontakter';
    return b.map(betingelseTekst).join(regler.alle === false ? ' ELLER ' : ' OG ');
  }
  function kendteFelter(){
    var s = {}; data.kontakter.forEach(function(k){ Object.keys(k.felter || {}).forEach(function(n){ s[n] = 1; }); });
    return Object.keys(s).sort();
  }

  function tegnSegmenter(rod){
    if(!data.segmenter){
      rod.appendChild(el('p', { klasse:'hint', tekst:'Segmenter er ikke sat op endnu (migration 0093 mangler på databasen).' }));
      return;
    }
    rod.appendChild(el('p', { klasse:'hint', tekst:'Et segment er en navngiven målgruppe ud fra regler - fx alle med et tag, alle der har sendt en formular, eller alle der har købt. Hvem der er med, regnes ud hver gang, så nye kontakter kommer med af sig selv.' }));
    rod.appendChild(el('div', { klasse:'kt-top' }, [knap('+ Nyt segment', 'knap lille', function(){ visning.seg = 'ny'; tegn(); })]));
    var tbody = el('tbody');
    rod.appendChild(el('div', { klasse:'rulle' }, [el('table', { klasse:'kt-tabel' }, [
      el('thead', {}, [el('tr', {}, ['Segment', 'Regler', 'Kontakter'].map(function(t){ return el('th', { tekst:t }); }))]), tbody])]));
    if(!data.segmenter.length) tbody.appendChild(el('tr', {}, [el('td', { colspan:'3', klasse:'hint', tekst:'Ingen segmenter endnu.' })]));
    data.segmenter.forEach(function(s){
      var tr = el('tr', { klasse:'kt-række', tabindex:'0' }, [
        el('td', {}, [el('strong', { tekst:s.navn }), s.beskrivelse ? el('div', { klasse:'hint', tekst:s.beskrivelse }) : null]),
        el('td', { klasse:'hint', tekst:reglerTekst(s.regler) }),
        el('td', { tekst:String(antalI(s.id)) })]);
      function åbn(){ visning.seg = s.id; tegn(); window.scrollTo(0, 0); }
      tr.addEventListener('click', åbn);
      tr.addEventListener('keydown', function(e){ if(e.key === 'Enter') åbn(); });
      tbody.appendChild(tr);
    });
  }

  function tegnSegment(rod, id){
    var gemt = id === 'ny' ? null : (data.segmenter || []).filter(function(x){ return x.id === id; })[0];
    if(id !== 'ny' && !gemt){ visning.seg = null; return tegn(); }
    var kl = gemt ? JSON.parse(JSON.stringify(gemt.regler)) : { alle:true, betingelser:[] };
    kl.betingelser = kl.betingelser || [];

    rod.appendChild(el('p', {}, [knap('← Alle segmenter', 'knap lille rolig', function(){ visning.seg = null; tegn(); })]));
    rod.appendChild(el('h3', { klasse:'kt-navn', tekst: gemt ? gemt.navn : 'Nyt segment' }));

    var navnInp = el('input', { id:'kt-seg-navn', maxlength:'120' }); navnInp.value = gemt ? gemt.navn : '';
    var besk = el('input', { id:'kt-seg-besk', maxlength:'500' }); besk.value = gemt ? gemt.beskrivelse : '';
    var alle = el('select', { id:'kt-seg-alle' });
    alle.appendChild(new Option('alle betingelserne', 'ja')); alle.appendChild(new Option('mindst én af betingelserne', 'nej'));
    alle.value = kl.alle === false ? 'nej' : 'ja';
    alle.addEventListener('change', function(){ kl.alle = alle.value === 'ja'; forhånd(); });

    var tagListe = el('datalist', { id:'kt-seg-tags' }, alleTags().map(function(t){ return el('option', { value:t }); }));
    var feltListe = el('datalist', { id:'kt-seg-felter' }, kendteFelter().map(function(t){ return el('option', { value:t }); }));
    var rækker = el('div', { klasse:'kt-seg-rækker' });
    var viser = el('div', { klasse:'kt-seg-viser', role:'status' });
    var sidste = null, tæller = 0, ur = null;

    function tegnRækker(){
      tøm(rækker);
      if(!kl.betingelser.length) rækker.appendChild(el('p', { klasse:'hint', tekst:'Ingen betingelser endnu - segmentet er alle kontakter.' }));
      kl.betingelser.forEach(function(b, i){
        var d = SEG_FELTER[b.felt], dele = [];
        var felt = el('select', { 'aria-label':'Betingelse ' + (i + 1) + ': handler om' });
        Object.keys(SEG_FELTER).forEach(function(n){ felt.appendChild(new Option(SEG_FELTER[n].navn, n)); });
        felt.value = b.felt;
        felt.addEventListener('change', function(){
          var ny = SEG_FELTER[felt.value];
          b.felt = felt.value; b.op = ny.ops[0][0]; b.vaerdi = ''; delete b.med_test;
          if(ny.nøgle === 'utm') b.noegle = UTM[0]; else delete b.noegle;
          tegnRækker(); forhånd();
        });
        dele.push(felt);
        if(d.nøgle === 'utm'){
          var u = el('select', { 'aria-label':'UTM-felt' });
          UTM.forEach(function(n){ u.appendChild(new Option(n.replace('utm_', ''), n)); });
          u.value = b.noegle || UTM[0]; b.noegle = u.value;
          u.addEventListener('change', function(){ b.noegle = u.value; forhånd(); });
          dele.push(u);
        } else if(d.nøgle === 'felt'){
          var fn = el('input', { 'aria-label':'Feltets navn', list:'kt-seg-felter', placeholder:'feltets navn' });
          fn.value = b.noegle || '';
          fn.addEventListener('input', function(){ b.noegle = fn.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'); forhånd(); });
          dele.push(fn);
        }
        var op = el('select', { 'aria-label':'Regel' });
        d.ops.forEach(function(o){ op.appendChild(new Option(o[1], o[0])); });
        op.value = b.op;
        op.addEventListener('change', function(){
          var før = b.op; b.op = op.value;
          if(d.slags === 'tid' && ((før === 'fra' || før === 'foer') !== (b.op === 'fra' || b.op === 'foer'))) b.vaerdi = '';
          tegnRækker(); forhånd();
        });
        dele.push(op);

        var v = null;
        if(d.slags === 'formular'){
          v = el('select', { 'aria-label':'Formular' });
          v.appendChild(new Option('en hvilken som helst formular', ''));
          data.formularer.forEach(function(fm){ v.appendChild(new Option(fm.navn || fm.noegle, fm.noegle)); });
          if(b.vaerdi && !data.formularer.some(function(fm){ return fm.noegle === b.vaerdi; })) v.appendChild(new Option(b.vaerdi + ' (findes ikke længere)', b.vaerdi));
        } else if(d.slags === 'produkt'){
          v = el('select', { 'aria-label':'Produkt' });
          v.appendChild(new Option('et hvilket som helst produkt', ''));
          data.produkter.forEach(function(p){ v.appendChild(new Option(p.navn, p.id)); });
          if(b.vaerdi && !data.produkter.some(function(p){ return p.id === b.vaerdi; })) v.appendChild(new Option('et slettet produkt', b.vaerdi));
        } else if(d.slags === 'tag'){
          v = el('input', { 'aria-label':'Tag', list:'kt-seg-tags', placeholder:'tagget' });
        } else if(d.slags === 'tid'){
          v = (b.op === 'fra' || b.op === 'foer') ? el('input', { type:'date', 'aria-label':'Dato' })
            : el('input', { type:'number', min:'0', max:'9999', step:'1', 'aria-label':'Antal dage', placeholder:'dage' });
        } else if(d.slags === 'tekst' && !udenVærdi(b)){
          v = el('input', { 'aria-label':'Tekst', placeholder:'tekst', maxlength:'200' });
        }
        if(v){
          v.value = b.vaerdi || '';
          v.addEventListener(v.tagName === 'SELECT' ? 'change' : 'input', function(){ b.vaerdi = v.value; forhånd(); });
          dele.push(v);
        }
        if(d.test){
          var t = el('input', { type:'checkbox', id:'kt-seg-test-' + i }); t.checked = !!b.med_test;
          t.addEventListener('change', function(){ b.med_test = t.checked; forhånd(); });
          dele.push(el('span', { klasse:'afkryds kt-seg-test' }, [t, el('label', { for:t.id, tekst:'Tæl også testkøb' })]));
        }
        dele.push(knap('Fjern', 'knap lille rolig', function(){ kl.betingelser.splice(i, 1); tegnRækker(); forhånd(); }));
        rækker.appendChild(el('div', { klasse:'kt-seg-række' }, dele));
      });
    }

    function forhånd(){
      clearTimeout(ur);
      var nr = -1, hvad = '';
      kl.betingelser.some(function(b, i){ hvad = betingelseFejl(b); if(hvad){ nr = i; return true; } return false; });
      if(nr >= 0){
        tæller++; sidste = null; tøm(viser);
        viser.appendChild(el('span', { klasse:'hint', tekst:'Betingelse ' + (nr + 1) + ' mangler noget: ' + hvad }));
        return;
      }
      ur = setTimeout(function(){
        var mit = ++tæller;
        rest('rpc/segment_kontakter', { method:'POST', body:{ p_regler:rens(kl) } }).then(function(r){
          if(mit !== tæller) return;
          sidste = r || []; tøm(viser);
          viser.appendChild(el('strong', { tekst:sidste.length + (sidste.length === 1 ? ' kontakt passer lige nu' : ' kontakter passer lige nu') }));
          if(!kl.betingelser.length) viser.appendChild(el('span', { klasse:'hint', tekst:' — uden betingelser er det alle kontakter.' }));
          if(sidste.length){
            viser.appendChild(el('ul', { klasse:'kt-seg-liste' }, sidste.slice(0, 10).map(function(k){
              return el('li', { tekst:k.email + (navn(k) !== '—' ? ' · ' + navn(k) : '') });
            }).concat(sidste.length > 10 ? [el('li', { klasse:'hint', tekst:'… og ' + (sidste.length - 10) + ' flere' })] : [])));
          }
        }).catch(function(f){
          if(mit !== tæller) return;
          sidste = null; tøm(viser);
          viser.appendChild(el('span', { klasse:'status fejl', tekst:api.forklar(f) }));
        });
      }, 350);
    }

    function gem(){
      var n = navnInp.value.trim(), galt = '';
      if(!n){ status('Giv segmentet et navn.', 'fejl'); navnInp.focus(); return; }
      kl.betingelser.some(function(b, i){ var h = betingelseFejl(b); if(h) galt = 'Betingelse ' + (i + 1) + ' mangler noget: ' + h; return !!h; });
      if(galt){ status(galt, 'fejl'); return; }
      var krop = { navn:n, beskrivelse:besk.value.trim(), regler:rens(kl) };
      var kald = gemt
        ? rest('segment?id=eq.' + encodeURIComponent(gemt.id), { method:'PATCH', headers:{ Prefer:'return=representation' }, body:krop })
        : rest('segment', { method:'POST', headers:{ Prefer:'return=representation' }, body:krop });
      kald.then(function(r){
        if(!r || !r.length) throw new Error('Intet blev gemt.');
        data.segmenter = data.segmenter.filter(function(x){ return x.id !== r[0].id; }).concat([r[0]])
          .sort(function(a, b){ return a.navn.localeCompare(b.navn, 'da'); });
        visning.seg = r[0].id;
        return hentMedlemskab();
      }).then(function(){ status('Gemt.'); tegn(); })
        .catch(function(f){
          if(f && f.kode === '23505') status('Der findes allerede et segment med det navn.', 'fejl');
          else if(f && f.kode === '23514') status('Databasen afviste reglerne. Tjek betingelserne.', 'fejl');
          else fejl(f);
        });
    }

    rod.appendChild(el('div', { klasse:'kort kt-kort' }, [
      el('div', { klasse:'kt-grid' }, [
        el('div', { klasse:'kt-felt' }, [el('label', { for:'kt-seg-navn', tekst:'Navn' }), navnInp]),
        el('div', { klasse:'kt-felt' }, [el('label', { for:'kt-seg-besk', tekst:'Beskrivelse (kun til jer selv)' }), besk])]),
      el('h4', { tekst:'Hvem er med?' }),
      el('p', { klasse:'kt-seg-alle' }, [el('label', { for:'kt-seg-alle', tekst:'Kontakten skal passe på ' }), alle]),
      tagListe, feltListe, rækker,
      el('p', {}, [knap('+ Betingelse', 'knap lille rolig', function(){ kl.betingelser.push({ felt:'tag', op:'har', vaerdi:'' }); tegnRækker(); forhånd(); })]),
      viser,
      el('div', { klasse:'kt-handlinger' }, [
        knap('Gem', 'knap', gem),
        gemt ? knap('Vis i kontaktlisten', 'knap lille rolig', function(){
          visning.fane = 'kontakter'; visning.segment = gemt.id; visning.tag = ''; visning.søg = ''; visning.seg = null; visning.åben = null;
          tegn(); if(api.underfane) api.underfane('kontakter');
        }) : null,
        knap('Eksportér CSV', 'knap lille rolig', function(){
          if(!sidste){ status('Ret betingelserne først - så kan listen eksporteres.', 'fejl'); return; }
          eksport(sidste);
        }),
        gemt ? knap('Slet segmentet', 'knap lille fare', function(){
          if(!confirm('Slet segmentet "' + gemt.navn + '"?\n\nKontakterne bliver liggende - kun målgruppen slettes.')) return;
          rest('segment?id=eq.' + encodeURIComponent(gemt.id), { method:'DELETE', headers:{ Prefer:'return=representation' } })
            .then(function(r){
              if(!r || !r.length) throw new Error('Intet blev slettet.');
              data.segmenter = data.segmenter.filter(function(x){ return x.id !== gemt.id; });
              delete data.medlem[gemt.id];
              if(visning.segment === gemt.id) visning.segment = '';
              visning.seg = null; status('Slettet.'); tegn();
            }).catch(fejl);
        }) : null]),
      gemt ? el('p', { klasse:'hint', tekst:'"Vis i kontaktlisten" viser det gemte segment. Forhåndsvisningen og CSV-filen følger det, der står på skærmen nu.' }) : null]));

    tegnRækker(); forhånd();
  }

  /* ---------- Formularer ---------- */
  function tegnFormularer(rod){
    rod.appendChild(el('p', { klasse:'hint', tekst:'Hver formular på siderne har en nøgle (feltet "Formularens navn" i editoren). Den oprettes her første gang, nogen sender den. Modtagerne får en mail med det, kunden skrev - kun adresser, der står her, kan få besked.' }));
    if(!data.formularer.length) rod.appendChild(el('p', { klasse:'hint', tekst:'Ingen formularer endnu.' }));
    data.formularer.forEach(function(fm){
      var n = el('input', { 'aria-label':'Navn' }); n.value = fm.navn || '';
      var til = el('input', { 'aria-label':'Besked til', placeholder:'fx oliivia@arytmi.com' }); til.value = (fm.besked_til || []).join(', ');
      var tg = el('input', { 'aria-label':'Tags', placeholder:'fx pasform' }); tg.value = (fm.tags || []).join(', ');
      var akt = el('input', { type:'checkbox', id:'kt-akt-' + fm.noegle }); akt.checked = fm.aktiv;
      var antal = data.kontakter.filter(function(k){ return k.kilde === 'formular:' + fm.noegle; }).length;
      rod.appendChild(el('div', { klasse:'kort kt-kort' }, [
        el('h4', { tekst:fm.noegle }), el('p', { klasse:'hint', tekst:antal + ' kontakter er kommet ind via den' }),
        el('div', { klasse:'kt-grid' }, [
          el('div', { klasse:'kt-felt' }, [el('label', { tekst:'Navn' }), n]),
          el('div', { klasse:'kt-felt' }, [el('label', { tekst:'Besked til (mail, komma imellem)' }), til]),
          el('div', { klasse:'kt-felt' }, [el('label', { tekst:'Tags til kontakten' }), tg])]),
        el('div', { klasse:'afkryds' }, [akt, el('label', { for:akt.id, tekst:'Tager imod indsendelser' })]),
        el('div', { klasse:'kt-handlinger' }, [knap('Gem', 'knap lille', function(){
          var mails = liste(til.value);
          if(mails.some(function(m){ return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m); })){ status('En af modtagerne ligner ikke en mailadresse.', 'fejl'); return; }
          rest('formular?noegle=eq.' + encodeURIComponent(fm.noegle), { method:'PATCH', headers:{ Prefer:'return=representation' }, body:{ navn:n.value.trim(), besked_til:mails, tags:liste(tg.value), aktiv:akt.checked } })
            .then(function(r){ if(!r || !r.length) throw new Error('Intet blev gemt.'); status('Gemt.'); data.formularer = data.formularer.map(function(x){ return x.noegle === fm.noegle ? r[0] : x; }); })
            .catch(fejl);
        })])]));
    });
  }

  window.ArytmiKontakter = {
    vis: function(a, under){
      api = a;
      if(under === 'segmenter' || under === 'formularer' || under === 'kontakter'){ visning.fane = under; visning.åben = null; visning.seg = null; }
      if(!startet){
        startet = true;
        $('kt-faner').addEventListener('click', function(e){
          var b = e.target.closest('[data-kf]'); if(!b) return;
          visning.fane = b.getAttribute('data-kf'); visning.åben = null; visning.seg = null; tegn();
          if(api.underfane) api.underfane(visning.fane);
        });
      }
      hent();
    }
  };
})();
