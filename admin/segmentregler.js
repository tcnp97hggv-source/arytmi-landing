/* =============================================================
   SEGMENTREGLER — delt af Kontakter (segmenter, 0093) og
   Automatiseringer (trinet "betingelse", 0094)
   =============================================================
   Et sæt regler er { alle: true|false, betingelser: [{felt, op, vaerdi,
   noegle?, med_test?}] }. Samme liste som segment_regler_ok() i 0093 -
   databasen er dommer og afviser resten. Rettes den ene, rettes den anden.

   Flyttet ud af kontakter.js 10/11, så et forløbs betingelse bruger
   præcis de samme felter, tekster og tjek som et segment.

   kilder = { formularer:[{noegle,navn}], produkter:[{id,navn}],
              tagListe:'<datalist-id>', feltListe:'<datalist-id>' }
   ============================================================= */
(function(){
  'use strict';

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
  function feltNavn(n){ var t = String(n || '').replace(/^arytmi_/, '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); }

  var TEKST_OPS = [['er', 'er'], ['er_ikke', 'er ikke'], ['indeholder', 'indeholder'], ['indeholder_ikke', 'indeholder ikke'], ['udfyldt', 'er udfyldt'], ['tom', 'er tomt']];
  var DAGE_OPS = [['sidste_dage', 'inden for de sidste (dage)'], ['aeldre_end_dage', 'for mere end (dage) siden']];
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  /* felt -> navn, regler (ops) og hvilket værdifelt der hører til (slags). */
  var FELTER = {
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

  function udenVærdi(b){ var d = FELTER[b.felt]; return !d || d.slags === 'ingen' || b.op === 'udfyldt' || b.op === 'tom'; }
  function betingelseFejl(b){
    var d = FELTER[b.felt];
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
  /* Første betingelse, der mangler noget: 'Betingelse 2 mangler noget: …' eller ''. */
  function førsteFejl(regler){
    var ud = '';
    if(((regler && regler.betingelser) || []).length > 20) return 'Højst 20 betingelser.';
    ((regler && regler.betingelser) || []).some(function(b, i){
      var h = betingelseFejl(b);
      if(h) ud = 'Betingelse ' + (i + 1) + ' mangler noget: ' + h;
      return !!h;
    });
    return ud;
  }
  /* Det, databasen får: kun de felter, reglen bruger. */
  function rens(regler){
    return { alle: regler.alle !== false, betingelser:(regler.betingelser || []).map(function(b){
      var d = FELTER[b.felt] || {}, ud = { felt:b.felt, op:b.op, vaerdi: udenVærdi(b) ? '' : String(b.vaerdi || '').trim() };
      if(d.nøgle) ud.noegle = b.noegle;
      if(d.test && b.med_test) ud.med_test = true;
      return ud;
    }) };
  }
  function opNavn(d, op){ var o = d.ops.filter(function(x){ return x[0] === op; })[0]; return o ? o[1] : '?'; }
  function betingelseTekst(b, kilder){
    kilder = kilder || {};
    var d = FELTER[b.felt]; if(!d) return 'ukendt betingelse';
    var op = opNavn(d, b.op), v = String(b.vaerdi || ''), test = d.test && b.med_test ? ' (også testkøb)' : '', t;
    if(d.slags === 'ingen') t = d.navn + ': ' + op + test;
    else if(d.slags === 'tag') t = op + ' "' + v + '"';
    else if(d.slags === 'formular'){
      var fm = (kilder.formularer || []).filter(function(x){ return x.noegle === v; })[0];
      t = op + (v ? ' formularen "' + ((fm && fm.navn) || v) + '"' : ' en formular');
    }
    else if(d.slags === 'produkt'){
      var p = (kilder.produkter || []).filter(function(x){ return x.id === v; })[0];
      t = op + ' ' + (v ? '"' + (p ? p.navn : 'et slettet produkt') + '"' : 'noget') + test;
    }
    else if(d.slags === 'tid') t = d.navn + ' ' + (b.op === 'fra' || b.op === 'foer' ? op + ' ' + v : op.replace('(dage)', v + ' dage'));
    else t = (d.nøgle === 'felt' ? feltNavn(b.noegle || '?') : d.nøgle ? (b.noegle || '?') : d.navn) + ' ' + op + (udenVærdi(b) ? '' : ' "' + v + '"');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function reglerTekst(regler, kilder){
    var b = (regler && regler.betingelser) || [];
    if(!b.length) return 'Alle kontakter';
    return b.map(function(x){ return betingelseTekst(x, kilder); }).join(regler.alle === false ? ' ELLER ' : ' OG ');
  }

  /* Tegner betingelserne som rækker i `rod` og retter `regler` direkte.
     `ændret()` kaldes ved hver rettelse. `tomTekst` vises uden betingelser. */
  function tegnRækker(rod, regler, kilder, ændret, præfiks, tomTekst){
    kilder = kilder || {}; ændret = ændret || function(){}; præfiks = præfiks || 'sr';
    regler.betingelser = regler.betingelser || [];
    function igen(){ tegnRækker(rod, regler, kilder, ændret, præfiks, tomTekst); }
    tøm(rod);
    if(!regler.betingelser.length) rod.appendChild(el('p', { klasse:'hint', tekst: tomTekst || 'Ingen betingelser endnu.' }));
    regler.betingelser.forEach(function(b, i){
      var d = FELTER[b.felt], dele = [];
      var felt = el('select', { 'aria-label':'Betingelse ' + (i + 1) + ': handler om' });
      Object.keys(FELTER).forEach(function(n){ felt.appendChild(new Option(FELTER[n].navn, n)); });
      felt.value = b.felt;
      felt.addEventListener('change', function(){
        var ny = FELTER[felt.value];
        b.felt = felt.value; b.op = ny.ops[0][0]; b.vaerdi = ''; delete b.med_test;
        if(ny.nøgle === 'utm') b.noegle = UTM[0]; else delete b.noegle;
        igen(); ændret();
      });
      dele.push(felt);
      if(!d){ rod.appendChild(el('div', { klasse:'kt-seg-række' }, dele)); return; }
      if(d.nøgle === 'utm'){
        var u = el('select', { 'aria-label':'UTM-felt' });
        UTM.forEach(function(n){ u.appendChild(new Option(n.replace('utm_', ''), n)); });
        u.value = b.noegle || UTM[0]; b.noegle = u.value;
        u.addEventListener('change', function(){ b.noegle = u.value; ændret(); });
        dele.push(u);
      } else if(d.nøgle === 'felt'){
        var fn = el('input', { 'aria-label':'Feltets navn', list:kilder.feltListe || null, placeholder:'feltets navn' });
        fn.value = b.noegle || '';
        fn.addEventListener('input', function(){ b.noegle = fn.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'); ændret(); });
        dele.push(fn);
      }
      var op = el('select', { 'aria-label':'Regel' });
      d.ops.forEach(function(o){ op.appendChild(new Option(o[1], o[0])); });
      op.value = b.op;
      op.addEventListener('change', function(){
        var før = b.op; b.op = op.value;
        if(d.slags === 'tid' && ((før === 'fra' || før === 'foer') !== (b.op === 'fra' || b.op === 'foer'))) b.vaerdi = '';
        igen(); ændret();
      });
      dele.push(op);

      var v = null;
      if(d.slags === 'formular'){
        v = el('select', { 'aria-label':'Formular' });
        v.appendChild(new Option('en hvilken som helst formular', ''));
        (kilder.formularer || []).forEach(function(fm){ v.appendChild(new Option(fm.navn || fm.noegle, fm.noegle)); });
        if(b.vaerdi && !(kilder.formularer || []).some(function(fm){ return fm.noegle === b.vaerdi; })) v.appendChild(new Option(b.vaerdi + ' (findes ikke længere)', b.vaerdi));
      } else if(d.slags === 'produkt'){
        v = el('select', { 'aria-label':'Produkt' });
        v.appendChild(new Option('et hvilket som helst produkt', ''));
        (kilder.produkter || []).forEach(function(p){ v.appendChild(new Option(p.navn, p.id)); });
        if(b.vaerdi && !(kilder.produkter || []).some(function(p){ return p.id === b.vaerdi; })) v.appendChild(new Option('et slettet produkt', b.vaerdi));
      } else if(d.slags === 'tag'){
        v = el('input', { 'aria-label':'Tag', list:kilder.tagListe || null, placeholder:'tagget' });
      } else if(d.slags === 'tid'){
        v = (b.op === 'fra' || b.op === 'foer') ? el('input', { type:'date', 'aria-label':'Dato' })
          : el('input', { type:'number', min:'0', max:'9999', step:'1', 'aria-label':'Antal dage', placeholder:'dage' });
      } else if(d.slags === 'tekst' && !udenVærdi(b)){
        v = el('input', { 'aria-label':'Tekst', placeholder:'tekst', maxlength:'200' });
      }
      if(v){
        v.value = b.vaerdi || '';
        v.addEventListener(v.tagName === 'SELECT' ? 'change' : 'input', function(){ b.vaerdi = v.value; ændret(); });
        dele.push(v);
      }
      if(d.test){
        var t = el('input', { type:'checkbox', id:præfiks + '-test-' + i }); t.checked = !!b.med_test;
        t.addEventListener('change', function(){ b.med_test = t.checked; ændret(); });
        dele.push(el('span', { klasse:'afkryds kt-seg-test' }, [t, el('label', { for:t.id, tekst:'Tæl også testkøb' })]));
      }
      dele.push(el('button', { type:'button', klasse:'knap lille rolig', tekst:'Fjern', klik:function(){ regler.betingelser.splice(i, 1); igen(); ændret(); } }));
      rod.appendChild(el('div', { klasse:'kt-seg-række' }, dele));
    });
  }

  window.ArytmiSegmentregler = {
    FELTER:FELTER, UTM:UTM, feltNavn:feltNavn, udenVærdi:udenVærdi,
    betingelseFejl:betingelseFejl, førsteFejl:førsteFejl, rens:rens,
    betingelseTekst:betingelseTekst, reglerTekst:reglerTekst, tegnRækker:tegnRækker,
    ny:function(){ return { felt:'tag', op:'har', vaerdi:'' }; }
  };
})();
