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
  /* forloeb === null: 0094 er ikke kørt endnu. */
  var data = { kontakter:[], formularer:[], segmenter:null, medlem:{}, produkter:[], forloeb:null };
  var visning = { fane:'kontakter', søg:'', tag:'', segment:'', åben:null, seg:null, valgt:{} };

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
  function feltNavn(n){ return window.ArytmiSegmentregler.feltNavn(n); }
  function liste(v){ return String(v || '').split(/[,\n]/).map(function(x){ return x.trim(); }).filter(Boolean); }

  function hent(){
    status('Henter …');
    return Promise.all([
      rest('kontakt?select=*&order=oprettet.desc&limit=2000'),
      rest('formular?select=*&order=noegle.asc'),
      rest('segment?select=*&order=navn.asc').catch(function(){ return null; }),
      rest('produkt?select=id,navn&order=navn.asc').catch(function(){ return []; }),
      rest('automatisering?select=id,navn,status,en_gang&order=navn.asc').catch(function(){ return null; })
    ]).then(function(r){
      data.kontakter = r[0] || []; data.formularer = r[1] || []; data.segmenter = r[2]; data.produkter = r[3] || []; data.forloeb = r[4];
      var findes = {}; data.kontakter.forEach(function(k){ findes[k.id] = 1; });
      Object.keys(visning.valgt).forEach(function(id){ if(!findes[id]) delete visning.valgt[id]; });
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
    var masse = el('div', { klasse:'kt-masse', role:'group', 'aria-label':'Handlinger for de valgte kontakter' });
    var alleBoks = el('input', { type:'checkbox', 'aria-label':'Vælg alle viste kontakter' });
    alleBoks.addEventListener('change', function(){
      filtreret().forEach(function(k){ if(alleBoks.checked) visning.valgt[k.id] = true; else delete visning.valgt[k.id]; });
      tegnRækker();
    });
    rod.appendChild(el('div', { klasse:'kt-top' }, [søg, tag, seg, antal,
      knap('+ Ny kontakt', 'knap lille', function(){ nyKontakt(); }),
      knap('Eksportér CSV', 'knap lille rolig', function(){ eksport(filtreret()); })]));
    rod.appendChild(masse);
    var tbody = el('tbody');
    rod.appendChild(el('div', { klasse:'rulle' }, [el('table', { klasse:'kt-tabel' }, [
      el('thead', {}, [el('tr', {}, [el('th', { klasse:'kt-vælg' }, [alleBoks])].concat(['Mail', 'Navn', 'Tags', 'Kilde', 'Oprettet'].map(function(t){ return el('th', { tekst:t }); })))]), tbody])]));
    /* Massehandlingen: start et LIVE forløb for de valgte (automatisering_start, 0094). */
    function tegnMasse(){
      tøm(masse);
      var ids = Object.keys(visning.valgt);
      masse.hidden = !ids.length;
      if(!ids.length) return;
      masse.appendChild(el('strong', { tekst:ids.length + (ids.length === 1 ? ' kontakt valgt' : ' kontakter valgt') }));
      var live = (data.forloeb || []).filter(function(a){ return a.status === 'live'; });
      if(data.forloeb === null) masse.appendChild(el('span', { klasse:'hint', tekst:'Forløb er ikke sat op endnu (migration 0094 mangler).' }));
      else if(!live.length) masse.appendChild(el('span', { klasse:'hint', tekst:'Der er ingen live forløb at starte. Sæt et forløb live under Automatiseringer.' }));
      else {
        var vælg = el('select', { 'aria-label':'Forløb, der skal startes' });
        live.forEach(function(a){ vælg.appendChild(new Option(a.navn + (a.en_gang ? '' : ' (kan køres flere gange)'), a.id)); });
        masse.appendChild(vælg);
        masse.appendChild(knap('Start forløb', 'knap lille', function(){
          var a = live.filter(function(x){ return x.id === vælg.value; })[0];
          if(!a || !confirm('Start forløbet "' + a.navn + '" for ' + ids.length + (ids.length === 1 ? ' kontakt' : ' kontakter') + '?\n\nMails i forløbet sendes rigtigt.')) return;
          rest('rpc/automatisering_start', { method:'POST', body:{ p_forloeb:a.id, p_kontakter:ids, p_segment:null } })
            .then(function(n){
              var sprunget = ids.length - (n || 0);
              status((n || 0) + (n === 1 ? ' kontakt er startet' : ' kontakter er startet') + ' i "' + a.navn + '".' + (sprunget ? ' ' + sprunget + ' blev sprunget over (har været i forløbet før).' : ''));
              visning.valgt = {}; tegnRækker();
            }).catch(fejl);
        }));
      }
      masse.appendChild(knap('Fravælg alle', 'knap lille rolig', function(){ visning.valgt = {}; tegnRækker(); }));
    }
    function tegnRækker(){
      tøm(tbody);
      var r = filtreret();
      antal.textContent = r.length + ' af ' + data.kontakter.length;
      alleBoks.checked = r.length > 0 && r.every(function(k){ return visning.valgt[k.id]; });
      tegnMasse();
      if(!r.length) tbody.appendChild(el('tr', {}, [el('td', { colspan:'6', klasse:'hint', tekst: data.kontakter.length ? 'Ingen kontakter passer.' : 'Ingen kontakter endnu. De kommer, når nogen sender en formular på jeres sider.' })]));
      r.forEach(function(k){
        var boks = el('input', { type:'checkbox', 'aria-label':'Vælg ' + k.email }); boks.checked = !!visning.valgt[k.id];
        boks.addEventListener('click', function(e){ e.stopPropagation(); });
        boks.addEventListener('keydown', function(e){ e.stopPropagation(); });
        boks.addEventListener('change', function(){
          if(boks.checked) visning.valgt[k.id] = true; else delete visning.valgt[k.id];
          alleBoks.checked = filtreret().every(function(x){ return visning.valgt[x.id]; });
          tegnMasse();
        });
        var vælgTd = el('td', { klasse:'kt-vælg' }, [boks]);
        vælgTd.addEventListener('click', function(e){ e.stopPropagation(); });
        var tr = el('tr', { klasse:'kt-række', tabindex:'0' }, [vælgTd,
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

    /* Forløb (0094): hvor står kontakten, og start et live forløb for hende. */
    if(data.forloeb !== null){
      var flListe = el('ul', { klasse:'kt-forloeb' });
      var flStart = el('div', { klasse:'kt-handlinger' });
      rod.appendChild(el('div', { klasse:'kort kt-kort' }, [el('h4', { tekst:'Forløb' }), flListe, flStart]));
      var STATUS = { venter:'venter', koerer:'kører nu', faerdig:'færdig', fejlet:'fejlet', stoppet:'stoppet' };
      var tegnForloeb = function(){
        tøm(flListe); flListe.appendChild(el('li', { klasse:'hint', tekst:'Henter …' }));
        rest('automatisering_koersel?select=id,status,trin_nr,naeste_kl,oprettet,automatisering(navn,trin)&kontakt_id=eq.' + encodeURIComponent(k.id) + '&order=oprettet.desc&limit=50')
          .then(function(r){
            tøm(flListe);
            if(!r || !r.length) flListe.appendChild(el('li', { klasse:'hint', tekst:'Kontakten har ikke været i et forløb.' }));
            (r || []).forEach(function(x){
              var a = x.automatisering || {}, antal = (a.trin || []).length;
              var hvor = x.status === 'venter' ? ' · trin ' + (x.trin_nr + 1) + ' af ' + antal + ' · fortsætter ' + dato(x.naeste_kl, true) : '';
              flListe.appendChild(el('li', {}, [el('strong', { tekst:a.navn || 'Slettet forløb' }),
                el('span', { klasse:'kt-tag kt-fl-' + x.status, tekst:STATUS[x.status] || x.status }),
                el('span', { klasse:'hint', tekst:'startet ' + dato(x.oprettet, true) + hvor }),
                x.status === 'venter' ? knap('Stop', 'knap lille rolig', function(){
                  if(!confirm('Stop forløbet "' + (a.navn || '') + '" for ' + k.email + '?')) return;
                  rest('rpc/automatisering_stop', { method:'POST', body:{ p_koersel:x.id } }).then(function(ok){
                    status(ok ? 'Stoppet.' : 'Kørslen ventede ikke længere - den er ikke stoppet.', ok ? '' : 'fejl'); tegnForloeb();
                  }).catch(fejl);
                }) : null]));
            });
          }).catch(function(f){ tøm(flListe); flListe.appendChild(el('li', { klasse:'status fejl', tekst:api.forklar(f) })); });
      };
      var liveFl = data.forloeb.filter(function(a){ return a.status === 'live'; });
      if(liveFl.length){
        var flVælg = el('select', { 'aria-label':'Forløb, der skal startes for kontakten' });
        liveFl.forEach(function(a){ flVælg.appendChild(new Option(a.navn, a.id)); });
        flStart.appendChild(flVælg);
        flStart.appendChild(knap('Start forløb', 'knap lille', function(){
          var a = liveFl.filter(function(x){ return x.id === flVælg.value; })[0];
          if(!a || !confirm('Start forløbet "' + a.navn + '" for ' + k.email + '?\n\nMails i forløbet sendes rigtigt.')) return;
          rest('rpc/automatisering_start', { method:'POST', body:{ p_forloeb:a.id, p_kontakter:[k.id], p_segment:null } })
            .then(function(n){ status(n ? 'Startet.' : 'Ikke startet: kontakten har været i forløbet før, og det kører kun én gang pr. kontakt.', n ? '' : 'fejl'); tegnForloeb(); })
            .catch(fejl);
        }));
      } else flStart.appendChild(el('span', { klasse:'hint', tekst:'Ingen live forløb at starte.' }));
      tegnForloeb();
    }

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
  /* Reglernes felter, tjek og tekster bor i segmentregler.js (delt med Automatiseringer). */
  var SR = window.ArytmiSegmentregler;
  function kilder(){ return { formularer:data.formularer, produkter:data.produkter, tagListe:'kt-seg-tags', feltListe:'kt-seg-felter' }; }
  function reglerTekst(regler){ return SR.reglerTekst(regler, kilder()); }
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
      SR.tegnRækker(rækker, kl, kilder(), forhånd, 'kt-seg', 'Ingen betingelser endnu - segmentet er alle kontakter.');
    }

    function forhånd(){
      clearTimeout(ur);
      var hvad = SR.førsteFejl(kl);
      if(hvad){
        tæller++; sidste = null; tøm(viser);
        viser.appendChild(el('span', { klasse:'hint', tekst:hvad }));
        return;
      }
      ur = setTimeout(function(){
        var mit = ++tæller;
        rest('rpc/segment_kontakter', { method:'POST', body:{ p_regler:SR.rens(kl) } }).then(function(r){
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
      var n = navnInp.value.trim(), galt = SR.førsteFejl(kl);
      if(!n){ status('Giv segmentet et navn.', 'fejl'); navnInp.focus(); return; }
      if(galt){ status(galt, 'fejl'); return; }
      var krop = { navn:n, beskrivelse:besk.value.trim(), regler:SR.rens(kl) };
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
      el('p', {}, [knap('+ Betingelse', 'knap lille rolig', function(){ kl.betingelser.push(SR.ny()); tegnRækker(); forhånd(); })]),
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
    rod.appendChild(el('p', { klasse:'hint', tekst:'Hver formular på siderne har en nøgle (feltet "Formularens navn" i editoren). Den oprettes her første gang, nogen sender den - eller når du gemmer dens indstillinger på selve formularen i sideeditoren ("Når formularen sendes"). Modtagerne får en mail med det, kunden skrev - kun adresser, der står her, kan få besked.' }));
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
