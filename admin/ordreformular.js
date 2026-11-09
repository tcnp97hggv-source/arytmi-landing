/* =============================================================
   ORDREFORMULAREN — ARYTMIS EGEN CHECKOUT (trin 3, 9/11)
   =============================================================
   Hentes af side-runtime.js, når en udgivet side har et element med
   data-a-ordreformular (sideeditoren → "Ordreformular"). Plan og regler:
   docs/egen-checkout.md i app-repoet.

   GANGEN: produkterne hentes fra checkout_katalog (offentlig, kun det,
   der alligevel står på siden). Kunden vælger madras, bilmodel og evt.
   tilvalget; hver ændring spørger funktionen checkout (handling "beregn"),
   som regner prisen ud på serveren. Payment Element (Stripe) ligger klar
   fra starten med det beregnede beløb. Ved "Betal" laver checkout ordren
   og Stripes betaling; Stripe gennemfører den og sender kunden videre til
   næste trin med ?ordre=A-xxxx.

   Ingen beløb fra browseren bruges til noget: serveren regner selv.
   ============================================================= */
(function(){
  'use strict';
  var SUPABASE = 'https://vxleyvtumbwtkejoiaev.supabase.co';
  var NOEGLE = 'sb_publishable_NQvNdYWs3PZrHGai2l0rgw_Vz1KCCLP';   /* den offentlige nøgle, som resten af siden */
  /* Stripes OFFENTLIGE nøgler. Live sættes, når live-betaling åbnes (trin 6). */
  var STRIPE_PK = {
    test: 'pk_test_51UJrFoBSJNGBtNnHVBiwgBlTvK2KhTAvcPQrf8N23Rp1HEaL0rBVlgfRI5DHxLPbnuGruBZ2Ye4oqGa7Yv6DsYuL00IDELg2qW',
    live: ''
  };
  var d = document;

  function el(tag, eg, børn){
    var e = d.createElement(tag);
    eg = eg || {};
    for(var n in eg){
      var v = eg[n];
      if(v === null || v === undefined || v === false) continue;
      if(n === 'tekst') e.textContent = v;
      else if(n === 'klasse') e.className = v;
      else if(n === 'klik') e.addEventListener('click', v);
      else e.setAttribute(n, v === true ? '' : v);
    }
    (børn || []).forEach(function(b){ if(b) e.appendChild(typeof b === 'string' ? d.createTextNode(b) : b); });
    return e;
  }
  function meta(n){ var m = d.querySelector('meta[name="' + n + '"]'); return m ? m.getAttribute('content') : ''; }
  function kr(oere){
    var hele = Math.floor(oere / 100), rest = oere % 100;
    return String(hele).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (rest ? ',' + (rest < 10 ? '0' : '') + rest : '') + ' kr.';
  }
  var IV = { dag:['dag','dage'], uge:['uge','uger'], maaned:['måned','måneder'], kvartal:['kvartal','kvartaler'], aar:['år','år'] };
  function iv(n, i){ return n === 1 ? IV[i][0] : n + ' ' + IV[i][1]; }
  function dato(iso){ var x = new Date(iso); return x.getDate() + '/' + (x.getMonth() + 1) + ' ' + x.getFullYear(); }
  /* Prisen, som kunden læser den ved valget. */
  function prisLinje(p){
    if(!p) return '';
    if(p.slags === 'engang') return kr(p.beloeb_oere);
    var lob = kr(p.beloeb_oere) + ' pr. ' + iv(p.interval_antal, p.interval);
    if(p.slags === 'afdrag') return p.antal_betalinger + ' × ' + lob;
    return (p.opstart_oere ? kr(p.opstart_oere) : (p.proeve_antal ? '0 kr.' : kr(p.beloeb_oere))) +
      (p.proeve_antal ? ' · derefter ' + lob + ' efter ' + iv(p.proeve_antal, p.proeve_interval) : (p.opstart_oere ? ' + ' + lob : ''));
  }

  function rpc(navn, krop){
    return fetch(SUPABASE + '/rest/v1/rpc/' + navn, {
      method:'POST', headers:{ apikey:NOEGLE, Authorization:'Bearer ' + NOEGLE, 'Content-Type':'application/json' }, body:JSON.stringify(krop)
    }).then(function(r){ if(!r.ok) throw new Error('Produkterne kunne ikke hentes.'); return r.json(); });
  }
  function checkout(krop){
    return fetch(SUPABASE + '/functions/v1/checkout', {
      method:'POST', headers:{ apikey:NOEGLE, 'Content-Type':'application/json' }, body:JSON.stringify(krop)
    }).then(function(r){ return r.json().then(function(j){ if(!r.ok){ var f = new Error(j && j.error || 'Noget gik galt.'); f.felt = j && j.felt; throw f; } return j; }); });
  }
  var stripeLoader = null;
  function hentStripe(){
    if(window.Stripe) return Promise.resolve(window.Stripe);
    if(!stripeLoader) stripeLoader = new Promise(function(ok, nej){
      var s = d.createElement('script'); s.src = 'https://js.stripe.com/v3/'; s.async = true;
      s.onload = function(){ ok(window.Stripe); }; s.onerror = function(){ nej(new Error('Betalingen kunne ikke indlæses. Tjek forbindelsen.')); };
      d.head.appendChild(s);
    });
    return stripeLoader;
  }

  function utm(){
    var q = new URLSearchParams(location.search), u = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function(n){ if(q.get(n)) u[n] = q.get(n); });
    return u;
  }

  /* visning: editorens lærred - samme formular, men uden Stripe og uden køb. */
  function start(rod, visning){
    var tilstand = rod.getAttribute('data-a-tilstand') === 'live' ? 'live' : 'test';
    var hoved = (rod.getAttribute('data-a-produkter') || '').split(',').filter(Boolean)
      .concat(['1', '2', '3'].map(function(n){ return rod.getAttribute('data-a-produkt-' + n); }).filter(Boolean));
    var tilvalgId = rod.getAttribute('data-a-tilvalg') || '';
    var knapTekst = rod.getAttribute('data-a-knaptekst') || 'Gennemfør købet';
    var efter = rod.getAttribute('data-a-efter') || meta('arytmi-naeste') || '';
    while(rod.firstChild) rod.removeChild(rod.firstChild);
    rod.classList.add('ao');
    var status = el('p', { klasse:'ao-status', role:'status', tekst:'Henter …' });
    rod.appendChild(status);
    if(!hoved.length){ status.textContent = 'Ordreformularen mangler et produkt (vælg det i editoren).'; return; }
    if(!visning && !STRIPE_PK[tilstand]){ status.textContent = 'Betalingen er ikke åbnet endnu.'; return; }

    var ids = hoved.concat(tilvalgId ? [tilvalgId] : []);
    Promise.all([rpc('checkout_katalog', { p_produkter: ids }), visning ? null : hentStripe()]).then(function(r){
      var katalog = r[0] || [];
      var produkter = hoved.map(function(id){ return katalog.filter(function(p){ return p.id === id; })[0]; }).filter(Boolean);
      var tilvalg = katalog.filter(function(p){ return p.id === tilvalgId; })[0] || null;
      if(!produkter.length){ status.textContent = 'Produktet sælges ikke lige nu.'; return; }
      byg(rod, status, tilstand, produkter, tilvalg, knapTekst, efter, r[1]);
    }).catch(function(e){ status.textContent = e.message; });
  }

  /* De varianter, kunden kan vælge (uden standardvarianten, hvis der er andre). */
  function valgbare(p){
    var vs = (p.varianter || []).filter(function(v){ return v.priser && v.priser.length; });
    var andre = vs.filter(function(v){ return !v.er_standard; });
    return andre.length ? andre : vs;
  }

  /* Produktets beskrivelse er HTML, som bagrummet har skrevet (fx
     fluebenslisten og "Passer madrassen i din bil?"). Den vises med en
     snæver hvidliste, så en fejl i et produkt aldrig kan køre kode på
     betalingssiden. */
  var TILLADT = { P:1, BR:1, B:1, STRONG:1, I:1, EM:1, U:1, SPAN:1, UL:1, OL:1, LI:1, DETAILS:1, SUMMARY:1, A:1, SMALL:1, H3:1, H4:1 };
  function renHtml(html){
    var kilde = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html').body.firstChild;
    var ud = d.createElement('div');
    (function kopi(fra, til){
      Array.prototype.forEach.call(fra.childNodes, function(n){
        if(n.nodeType === 3){ til.appendChild(d.createTextNode(n.nodeValue)); return; }
        if(n.nodeType !== 1) return;
        if(!TILLADT[n.tagName]){ kopi(n, til); return; }
        var ny = d.createElement(n.tagName);
        var stil = n.getAttribute('style'); if(stil && !/url\(|expression/i.test(stil)) ny.setAttribute('style', stil);
        if(n.tagName === 'A'){ var h = n.getAttribute('href') || ''; if(/^(https?:|mailto:|#)/i.test(h)) ny.setAttribute('href', h); ny.setAttribute('target', '_blank'); ny.setAttribute('rel', 'noopener'); }
        kopi(n, ny); til.appendChild(ny);
      });
    })(kilde, ud);
    return ud;
  }
  function trin(nr, titel){
    return el('div', { klasse:'ao-trin' }, [el('span', { klasse:'ao-trin-nr', tekst:String(nr) }), el('span', { klasse:'ao-trin-titel', tekst:titel }), el('span', { klasse:'ao-trin-linje' })]);
  }

  function byg(rod, status, tilstand, produkter, tilvalg, knapTekst, efter, Stripe){
    rod.removeChild(status);
    var valg = { produkt: produkter[0], variant: null, tilvalg: false };
    var form = el('form', { klasse:'ao-form', novalidate:true });
    var id = 'ao' + Math.random().toString(36).slice(2, 7);
    var flere = produkter.length > 1;

    /* 1. Madras og variant (fx bilmodel): hvert produkt sit kort, med
       beskrivelse, pris og sin egen vælger - som ClickFunnels' checkout. */
    var navn1 = (produkter[0].egenskaber || [])[0];
    form.appendChild(trin(1, flere ? 'Vælg madras' + (navn1 ? ' og din ' + navn1.toLowerCase() : '') : 'Din ordre'));
    var kortListe = [];
    produkter.forEach(function(p, i){
      var vs = valgbare(p);
      var pris = vs[0] && vs[0].priser[0];
      var r = el('input', { type:'radio', name:id + '-p', id:id + '-p' + i, value:p.id, 'aria-label':p.navn });
      if(i === 0) r.checked = true;
      if(!flere) r.hidden = true;
      var billede = (p.billeder || [])[0];
      var s = null;
      if(vs.length > 1){
        s = el('select', { klasse:'ao-vaelg', 'aria-label':(p.egenskaber || [])[0] || 'Vælg' });
        vs.forEach(function(v){ var o = new Option(v.navn + (v.udsolgt ? ' (udsolgt)' : ''), v.id); o.disabled = !!v.udsolgt; s.appendChild(o); });
        s.addEventListener('change', function(){ vælgProdukt(i); valg.variant = vs.filter(function(v){ return v.id === s.value; })[0]; beregn(); });
      }
      var kort = el('div', { klasse:'ao-kort' }, [
        el('div', { klasse:'ao-kort-top' }, [
          el('label', { klasse:'ao-radio', for:r.id }, [r]),
          billede ? el('img', { klasse:'ao-kort-billede', src:billede, alt:'', loading:'lazy' }) : null,
          el('div', { klasse:'ao-kort-tekst' }, [el('h3', { klasse:'ao-kort-titel', tekst:p.navn }), renHtml(p.beskrivelse)]),
          el('div', { klasse:'ao-kort-pris', tekst:prisLinje(pris).split(' · ')[0] })
        ]),
        s
      ]);
      kort.addEventListener('click', function(e){ if(!e.target.closest('select, details, a') && !r.checked){ r.checked = true; vælgProdukt(i); beregn(); } });
      r.addEventListener('change', function(){ vælgProdukt(i); beregn(); });
      kortListe.push({ kort:kort, radio:r, vælger:s, varianter:vs });
      form.appendChild(kort);
    });
    function vælgProdukt(i){
      var k = kortListe[i];
      valg.produkt = produkter[i]; k.radio.checked = true;
      valg.variant = k.vælger ? k.varianter.filter(function(v){ return v.id === k.vælger.value; })[0] : (k.varianter[0] || null);
      kortListe.forEach(function(x, j){ x.kort.classList.toggle('ao-valgt', j === i); });
    }
    vælgProdukt(0);

    /* 2. Leveringsadresse og kunden */
    var felter = {};
    function felt(navn, etiket, type, auto, krav, bred){
      var f = el('input', { id:id + '-' + navn, name:navn, type:type || 'text', autocomplete:auto || 'on', required:krav || null,
        placeholder: etiket + (krav ? '' : ' (valgfri)'), 'aria-label': etiket });
      felter[navn] = f;
      return el('div', { klasse:'ao-felt' + (bred ? ' ao-bred' : '') }, [f]);
    }
    form.appendChild(trin(2, 'Leveringsadresse'));
    form.appendChild(el('div', { klasse:'ao-felter' }, [
      felt('email', 'Mail', 'email', 'email', true, true), felt('fornavn', 'Fornavn', 'text', 'given-name', true),
      felt('efternavn', 'Efternavn', 'text', 'family-name', true), felt('adresse', 'Adresse', 'text', 'address-line1', true, true),
      felt('postnr', 'Postnummer', 'text', 'postal-code', true), felt('by', 'By', 'text', 'address-level2', true),
      felt('telefon', 'Telefon', 'tel', 'tel', false, true)]));
    felter.postnr.inputMode = 'numeric'; felter.postnr.maxLength = 4;

    /* 3. Levering: vises, når adressen er skrevet */
    form.appendChild(trin(3, 'Levering'));
    var levBoks = el('div', { klasse:'ao-levering' }, [el('span', { klasse:'ao-lev-ikon', 'aria-hidden':'true', tekst:'🚚' }), el('span', { tekst:'Leveringsmuligheder vises her, når du har skrevet din adresse.' })]);
    form.appendChild(levBoks);
    function tegnLevering(b){
      var klar = felter.adresse.value.trim() && /^\d{4}$/.test(felter.postnr.value.trim()) && felter.by.value.trim();
      while(levBoks.firstChild) levBoks.removeChild(levBoks.firstChild);
      if(!klar || !b){ levBoks.classList.remove('ao-lev-klar'); levBoks.appendChild(el('span', { klasse:'ao-lev-ikon', 'aria-hidden':'true', tekst:'🚚' })); levBoks.appendChild(el('span', { tekst:'Leveringsmuligheder vises her, når du har skrevet din adresse.' })); return; }
      levBoks.classList.add('ao-lev-klar');
      levBoks.appendChild(el('label', { klasse:'ao-lev-valg' }, [el('input', { type:'radio', checked:true, disabled:true }),
        el('span', { tekst:(b.fragt_navn || 'Levering') + ' · 5–7 hverdage' }), el('strong', { tekst: b.fragt_oere ? kr(b.fragt_oere) : 'Gratis' })]));
    }
    ['adresse', 'postnr', 'by'].forEach(function(n){ felter[n].addEventListener('input', function(){ tegnLevering(sidste); }); });

    /* 4. Betaling */
    form.appendChild(trin(4, 'Betaling'));
    var betalBoks = el('div', { klasse:'ao-betaling' });
    form.appendChild(betalBoks);

    /* Tilvalg (order bump) - eget kort med beskrivelse og "Tilføj" */
    var tilvalgPris = null;
    if(tilvalg){
      var tv = valgbare(tilvalg)[0];
      tilvalgPris = tv && tv.priser[0];
      if(tilvalgPris){
        var tb = (tilvalg.billeder || [])[0];
        var tilføj = el('button', { type:'button', klasse:'ao-tilfoej', 'aria-pressed':'false', tekst:'+ Tilføj' });
        var bump = el('div', { klasse:'ao-bump' }, [
          tb ? el('img', { klasse:'ao-bump-billede', src:tb, alt:'', loading:'lazy' }) : null,
          el('div', { klasse:'ao-bump-tekst' }, [
            el('div', { klasse:'ao-bump-hoved' }, [el('strong', { klasse:'ao-bump-titel', tekst:tilvalg.navn }), el('span', { klasse:'ao-bump-pris', tekst:prisLinje(tilvalgPris) })]),
            renHtml(tilvalg.beskrivelse)]),
          el('div', { klasse:'ao-bump-knap' }, [tilføj])
        ]);
        tilføj.addEventListener('click', function(){
          valg.tilvalg = !valg.tilvalg;
          tilføj.textContent = valg.tilvalg ? '✓ Tilføjet' : '+ Tilføj';
          tilføj.setAttribute('aria-pressed', String(valg.tilvalg));
          bump.classList.toggle('ao-bump-valgt', valg.tilvalg);
          beregn();
        });
        form.appendChild(bump);
      }
    }

    /* Ordreoversigt: foldet sammen med totalen ude til højre, som hos ClickFunnels */
    var kode = el('input', { id:id + '-r', type:'text', autocomplete:'off', placeholder:'Rabatkode', 'aria-label':'Rabatkode' });
    var kodeBesked = el('span', { klasse:'ao-lille', role:'status' });
    var brugtKode = '';
    var sum = el('div', { klasse:'ao-sum', 'aria-live':'polite' });
    var oversigtTotal = el('span', { klasse:'ao-oversigt-total', tekst:'Udfyld formularen for at se detaljerne' });
    form.appendChild(el('details', { klasse:'ao-oversigt' }, [
      el('summary', {}, [el('span', { klasse:'ao-oversigt-titel', tekst:'🧺 Ordreoversigt' }), oversigtTotal]),
      sum,
      el('div', { klasse:'ao-rabat' }, [kode,
        el('button', { type:'button', klasse:'ao-knap2', tekst:'Brug', klik:function(){ brugtKode = kode.value.trim().toUpperCase(); beregn(); } }),
        kodeBesked])
    ]));

    var vilkår = el('input', { type:'checkbox', id:id + '-vilk', required:true });
    form.appendChild(el('label', { klasse:'ao-vilkaar', for:vilkår.id }, [vilkår, el('span', {}, [
      'Jeg accepterer ', el('a', { href:'https://arytmi.com/handelsbetingelser', target:'_blank', rel:'noopener', tekst:'handelsbetingelserne' }),
      ' og har læst ', el('a', { href:'https://arytmi.com/privatliv', target:'_blank', rel:'noopener', tekst:'privatlivspolitikken' }), '.'])]));
    var fejl = el('p', { klasse:'ao-fejl', role:'alert', hidden:true });
    var knap = el('button', { type:'submit', klasse:'ao-betal', tekst:knapTekst });
    form.appendChild(fejl); form.appendChild(knap);
    form.appendChild(el('p', { klasse:'ao-lille ao-sikker', tekst:'Vi bruger kun dine oplysninger til at behandle din ordre. Betalingen sker sikkert hos Stripe.' }));
    rod.appendChild(form);

    var stripe = Stripe ? Stripe(STRIPE_PK[tilstand], { locale:'da' }) : null;
    var elements = null, betalEl = null, sidste = null, abonnement = false;

    function kurv(){
      var k = [];
      var p = valg.variant && valg.variant.priser[0];
      if(p) k.push({ pris_id:p.id });
      if(valg.tilvalg && tilvalgPris) k.push({ pris_id:tilvalgPris.id });
      return k;
    }
    var tæller = 0;
    function beregn(){
      var nr = ++tæller;
      sum.classList.add('ao-venter');
      return checkout({ handling:'beregn', tilstand:tilstand, kurv:kurv(), rabatkode:brugtKode || null }).then(function(b){
        if(nr !== tæller) return;
        sidste = b; kodeBesked.textContent = brugtKode ? (b.rabatkode ? 'Rabatkoden er brugt.' : '') : '';
        tegnSum(b); klargørBetaling(b);
      }).catch(function(e){
        if(nr !== tæller) return;
        if(e.felt === 'rabatkode'){ kodeBesked.textContent = e.message; brugtKode = ''; return beregn(); }
        visFejl(e.message);
      }).then(function(){ sum.classList.remove('ao-venter'); });
    }
    function række(tekst, beløb, klasse){ return el('div', { klasse:'ao-raekke' + (klasse ? ' ' + klasse : '') }, [el('span', { tekst:tekst }), el('span', { tekst:beløb })]); }
    function tegnSum(b){
      while(sum.firstChild) sum.removeChild(sum.firstChild);
      b.linjer.forEach(function(l){
        sum.appendChild(række(l.produkt + (l.variant ? ' · ' + l.variant : '') + (l.antal > 1 ? ' × ' + l.antal : ''), kr(l.nu_oere)));
      });
      if(b.rabat_oere) sum.appendChild(række('Rabat' + (b.rabatkode ? ' (' + b.rabatkode + ')' : ''), '− ' + kr(b.rabat_oere), 'ao-rabatlinje'));
      sum.appendChild(række(b.fragt_navn || 'Levering', b.fragt_oere ? kr(b.fragt_oere) : 'Gratis'));
      sum.appendChild(række('I alt i dag', kr(b.total_oere), 'ao-total'));
      sum.appendChild(el('p', { klasse:'ao-lille', tekst:'Inkl. 25 % moms.' }));
      if(b.abonnement){
        var a = b.abonnement;
        sum.appendChild(el('p', { klasse:'ao-abon', tekst: 'Derefter ' + kr(a.beloeb_oere) + ' pr. ' + iv(a.interval_antal, a.interval) +
          (a.proeve_slut ? ' fra ' + dato(a.proeve_slut) : '') + ' på samme kort. Kan opsiges når som helst.' }));
      }
      oversigtTotal.textContent = 'I alt ' + kr(b.total_oere);
      tegnLevering(b);
    }
    /* Payment Element ligger klar fra starten med beløbet; selve betalingen
       laves først ved "Betal" (Stripe: "deferred intent"). */
    function klargørBetaling(b){
      abonnement = !!b.abonnement;
      var opsætning = b.total_oere === 0;
      var valg2 = opsætning ? { mode:'setup', currency:'dkk' }
                            : { mode: abonnement ? 'subscription' : 'payment', amount: b.total_oere, currency:'dkk' };
      if(abonnement && !opsætning) valg2.setupFutureUsage = 'off_session';
      if(!stripe){
        if(!betalBoks.firstChild) betalBoks.appendChild(el('p', { klasse:'ao-status', tekst:'Her viser Stripe kortfelterne (kort, MobilePay, Klarna) på den udgivne side.' }));
        return;
      }
      if(!elements){
        valg2.appearance = { theme:'stripe', variables:{ colorPrimary:'#8e4333', borderRadius:'10px', fontFamily:'system-ui, sans-serif' } };
        /* Ingen Google Fonts (bagrummets regel): Stripes felter bruger systemets skrift. */
        elements = stripe.elements(valg2);
        betalEl = elements.create('payment', { layout:'tabs', fields:{ billingDetails:{ email:'never', name:'never' } } });
        betalEl.mount(betalBoks);
      } else {
        elements.update(valg2);
      }
    }
    function visFejl(t){ fejl.textContent = t; fejl.hidden = false; }

    form.addEventListener('input', function(){ fejl.hidden = true; });
    form.addEventListener('submit', function(e){
      e.preventDefault();
      if(!stripe) return;
      fejl.hidden = true;
      if(!form.reportValidity()) return;
      if(!sidste){ visFejl('Vent et øjeblik, prisen regnes ud.'); return; }
      knap.disabled = true; knap.textContent = 'Et øjeblik …';
      var k = {
        email:felter.email.value, fornavn:felter.fornavn.value, efternavn:felter.efternavn.value, telefon:felter.telefon.value,
        adresse:felter.adresse.value, postnr:felter.postnr.value, by:felter.by.value, land:'DK'
      };
      elements.submit().then(function(r){
        if(r.error) throw r.error;
        return checkout({ handling:'betal', tilstand:tilstand, kurv:kurv(), rabatkode:brugtKode || null, kunde:k,
          side_id: meta('arytmi-side') || null, variant: meta('arytmi-variant') || null, utm:utm() });
      }).then(function(o){
        var næste = efter ? new URL(efter, location.href) : new URL(location.href);
        næste.searchParams.set('ordre', o.nummer);
        new URLSearchParams(location.search).forEach(function(v, n){ if(/^utm_/.test(n)) næste.searchParams.set(n, v); });
        var params = { elements:elements, clientSecret:o.client_secret,
          confirmParams:{ return_url:næste.toString(), payment_method_data:{ billing_details:{ email:k.email, name:k.fornavn + ' ' + k.efternavn } } } };
        return o.slags === 'opsaetning' ? stripe.confirmSetup(params) : stripe.confirmPayment(params);
      }).then(function(r){
        /* Går betalingen igennem, sender Stripe kunden videre; kommer vi hertil, er der en fejl. */
        if(r && r.error) throw r.error;
      }).catch(function(e){
        if(e && e.felt && felter[e.felt]){ felter[e.felt].focus(); }
        visFejl((e && e.message) || 'Betalingen gik ikke igennem. Prøv igen.');
        knap.disabled = false; knap.textContent = knapTekst;
      });
    });

    beregn();
  }

  /* ---------- Kvitteringen (takkesiden, trin 5) ----------
     Stripe sender kunden hertil med ?ordre=A-xxxx&payment_intent=pi_...
     Kun med begge viser checkout_kvittering (0088) ordren. Står den som
     "afventer", venter vi lidt på Stripes besked (checkout-haendelser).
     Meta: KUN hvis kunden har sagt ja til cookies (arytmi-samtykke), og kun
     én gang pr. ordre - meta-koeb sender købet med det rigtige beløb (0072). */
  function startKvittering(rod){
    var q = new URLSearchParams(location.search);
    var nummer = q.get('ordre') || '', betaling = q.get('payment_intent') || q.get('setup_intent') || '';
    var tom = rod.getAttribute('data-a-tom') || 'Tak for din ordre. Du får en bekræftelse på mail.';
    while(rod.firstChild) rod.removeChild(rod.firstChild);
    rod.classList.add('ao', 'ao-kvittering');
    var status = el('p', { klasse:'ao-status', role:'status', tekst:'Henter din ordre …' });
    rod.appendChild(status);
    if(!nummer || !betaling){ status.textContent = tom; return; }
    var forsøg = 0;
    (function hent(){
      rpc('checkout_kvittering', { p_nummer:nummer, p_betaling:betaling }).then(function(o){
        if(!o){ status.textContent = tom; return; }
        if(o.status === 'afventer' && forsøg++ < 15){ status.textContent = 'Vi venter på bekræftelsen fra banken …'; setTimeout(hent, 2000); return; }
        tegnKvittering(rod, status, o);
        if(o.status === 'betalt') meldMeta(o.id);
      }).catch(function(){ status.textContent = tom; });
    })();
  }
  function tegnKvittering(rod, status, o){
    rod.removeChild(status);
    rod.appendChild(el('h2', { klasse:'ao-tak', tekst:'Tak, ' + o.fornavn + '!' }));
    rod.appendChild(el('p', { tekst: o.status === 'betalt'
      ? 'Din ordre ' + o.nummer + ' er betalt. Du får en ordrebekræftelse på mail om et øjeblik.'
      : 'Vi har modtaget din ordre ' + o.nummer + '. Du får en mail, så snart betalingen er bekræftet.' }));
    var sum = el('div', { klasse:'ao-sum' });
    function række(t, b, k){ sum.appendChild(el('div', { klasse:'ao-raekke' + (k ? ' ' + k : '') }, [el('span', { tekst:t }), el('span', { tekst:b })])); }
    (o.linjer || []).forEach(function(l){ række(l.produkt + (l.variant ? ' · ' + l.variant : '') + (l.antal > 1 ? ' × ' + l.antal : ''), kr(l.nu_oere)); });
    if(o.rabat_oere) række('Rabat' + (o.rabatkode ? ' (' + o.rabatkode + ')' : ''), '− ' + kr(o.rabat_oere), 'ao-rabatlinje');
    række('Levering', o.fragt_oere ? kr(o.fragt_oere) : 'Gratis');
    række('Betalt i alt', kr(o.total_oere), 'ao-total');
    var abon = (o.linjer || []).filter(function(l){ return l.slags !== 'engang'; })[0];
    if(abon && abon.interval){
      var tekst = 'Derefter ' + kr(abon.loebende_oere) + ' pr. ' + iv(abon.interval_antal, abon.interval);
      if(abon.proeve_antal && o.betalt_kl){
        var slut = new Date(o.betalt_kl), n = abon.proeve_antal, i = abon.proeve_interval;
        if(i === 'dag') slut.setDate(slut.getDate() + n);
        else if(i === 'uge') slut.setDate(slut.getDate() + 7 * n);
        else if(i === 'maaned') slut.setMonth(slut.getMonth() + n);
        else if(i === 'kvartal') slut.setMonth(slut.getMonth() + 3 * n);
        else slut.setFullYear(slut.getFullYear() + n);
        tekst += ' fra ' + dato(slut.toISOString());
      }
      sum.appendChild(el('p', { klasse:'ao-abon', tekst: tekst + '. Kan opsiges når som helst.' }));
    }
    rod.appendChild(sum);
    if(o.giver_app_adgang) rod.appendChild(el('p', { klasse:'ao-lille', tekst:'Din adgang til Arytmi-appen er klar. Se mailen "Velkommen til Arytmi" for at komme i gang.' }));
  }
  function samtykkeJa(){
    try { var v = JSON.parse(localStorage.getItem('arytmi-samtykke')); return !!(v && v.valg === 'ja'); } catch(e){ return false; }
  }
  function cookie(n){ var m = d.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; }
  function meldMeta(ordreId){
    if(!samtykkeJa() || !navigator.sendBeacon) return;
    try { if(sessionStorage.getItem('arytmi-meta-koeb-' + ordreId)) return; } catch(e){}
    var forsøg = 0;
    (function vent(){
      if(!cookie('_fbp') && forsøg++ < 25){ setTimeout(vent, 200); return; }
      var id = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      var data = JSON.stringify({ besoeg: ordreId, fbp: cookie('_fbp'), fbc: cookie('_fbc'), event_id: id });
      navigator.sendBeacon(SUPABASE + '/functions/v1/meta-koeb', new Blob([data], { type:'text/plain' }));
      try { sessionStorage.setItem('arytmi-meta-koeb-' + ordreId, '1'); } catch(e){}
    })();
  }

  function startAlle(){
    Array.prototype.forEach.call(d.querySelectorAll('[data-a-ordreformular]'), function(r){
      if(!r.__ao){ r.__ao = true; start(r); }
    });
    Array.prototype.forEach.call(d.querySelectorAll('[data-a-kvittering]'), function(r){
      if(!r.__ao){ r.__ao = true; startKvittering(r); }
    });
  }
  /* I sideeditorens lærred tegner editoren selv formularen via visning(). */
  var iEditor = false;
  try { iEditor = !!(window.frameElement && window.parent && window.parent.grapesjs); } catch(e){}
  window.ArytmiOrdreformular = { visning: function(rod){ start(rod, true); } };
  if(iEditor) return;
  if(d.readyState === 'loading') d.addEventListener('DOMContentLoaded', startAlle); else startAlle();
})();
