/* =============================================================
   EDITORENS ELEMENTER (9/11) - punkt 2 i paritetslisten
   =============================================================
   Alle byggeklodser fra kortlægningen af ClickFunnels' editor
   (REA/clickfunnels-migration/paritet-sidebygger.md, afsnit E), som
   Arytmis egne GrapesJS-komponenter. Adfærden (popup, nedtælling,
   video, animationer, menu, knaphandlinger) ligger i side-runtime.js,
   som både editoren og de udgivne sider indlæser.

   Hver komponent har "egenskaber" (traits). Højre panel i sider.js
   tegner dem på dansk under "Indstillinger".

   Indgang: window.ArytmiElementer.registrer(editor, { plads }).
   ============================================================= */
(function(){
  'use strict';

  /* ---------- Små skitser til blokkene ---------- */
  function skitse(indhold){
    return '<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" class="sf-skitse">' +
      '<rect width="120" height="80" rx="6" fill="#FAF6EF" stroke="#D9CFC2"/>' + indhold + '</svg>';
  }
  function L(x, y, w, h, f){ return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + (h || 4) + '" rx="2" fill="' + (f || '#B9A99A') + '"/>'; }
  function B(x, y, w, h, f){ return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4" fill="' + (f || '#D9CFC2') + '"/>'; }
  function K(x, y, w){ return '<rect x="' + x + '" y="' + y + '" width="' + (w || 30) + '" height="9" rx="4.5" fill="#DE854A"/>'; }
  function T(x, y, w){ return L(x, y, w || 40, 6, '#4A2417'); }
  function kolSkitse(n){
    var s = '', b = (104 - (n - 1) * 4) / n;
    for(var i = 0; i < n; i++) s += B(8 + i * (b + 4), 20, b, 40);
    return skitse(s);
  }

  /* ---------- Ikonerne (enkle stier, egne) ---------- */
  var IKONER = {
    flueben:'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
    stjerne:'M12 17.3 18.2 21l-1.6-7L22 9.2l-7.2-.6L12 2 9.2 8.6 2 9.2 7.4 14l-1.6 7z',
    hjerte:'M12 21.4 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5z',
    pil:'M12 4l-1.4 1.4 5.6 5.6H4v2h12.2l-5.6 5.6L12 20l8-8z',
    lyn:'M7 2v11h3v9l7-12h-4l4-8z',
    bil:'M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11h1a1 1 0 0 1 1 1v5h-2v2h-3v-2H8v2H5v-2H3v-5a1 1 0 0 1 1-1zm2.1 0h9.8l-1.1-3.4a.6.6 0 0 0-.6-.4H8.8a.6.6 0 0 0-.6.4zM7 15.5A1.5 1.5 0 1 0 7 12.5a1.5 1.5 0 0 0 0 3zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    maane:'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
    sol:'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4zM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1zM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1z',
    telt:'M12 3 2 21h7l3-5 3 5h7z',
    kort:'M15 4 9 2 3 4v18l6-2 6 2 6-2V2zm0 15.8-6-2V4.2l6 2z',
    skjold:'M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5z',
    gave:'M20 7h-2.2A3 3 0 0 0 12 4.4 3 3 0 0 0 6.2 7H4a1 1 0 0 0-1 1v4h1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8h1V8a1 1 0 0 0-1-1zM9 5a1 1 0 0 1 1 1v1H8V6a1 1 0 0 1 1-1zm6 0a1 1 0 0 1 1 1v1h-2V6a1 1 0 0 1 1-1zM11 19H6v-7h5zm0-9H5V9h6zm7 9h-5v-7h5zm1-9h-6V9h6z',
    ur:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.4 3.5 2-1 1.7L11 13V6h2z',
    mail:'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z',
    telefon:'M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1z',
    tommel:'M1 21h4V9H1zM23 10a2 2 0 0 0-2-2h-6.3l1-4.6v-.3a1.5 1.5 0 0 0-.4-1L14.2 1 7.6 7.6A2 2 0 0 0 7 9v10a2 2 0 0 0 2 2h9a2 2 0 0 0 1.8-1.2l3-7.1a2 2 0 0 0 .2-.7z',
    plus:'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z'
  };
  function ikonSvg(navn){ return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (IKONER[navn] || IKONER.flueben) + '"/></svg>'; }

  var LANDE = ['Danmark','Sverige','Norge','Finland','Island','Tyskland','Holland','Belgien','Frankrig','Storbritannien','Irland','Spanien','Italien','Østrig','Schweiz','Polen'];

  function registrer(editor, valg){
    var DC = editor.DomComponents;
    var PLADS = valg.plads;

    /* ---------- Fælles egenskaber ---------- */
    var ANKER = { type:'text', name:'id', label:'Anker-id (til "rul til")', changeProp:false };

    /* ---------- Struktur ---------- */
    DC.addType('a-sektion', {
      isComponent: function(el){ return el.classList && el.classList.contains('a-sek'); },
      model: { defaults: { name:'Sektion', tagName:'section', traits:[ANKER] } }
    });
    DC.addType('a-raekke', {
      isComponent: function(el){ return el.classList && el.classList.contains('a-raekke'); },
      model: {
        defaults: { name:'Række', traits:[
          { type:'select', name:'kolonner', label:'Kolonner', changeProp:true, options:[1,2,3,4,5,6].map(function(n){ return { id:String(n), name:String(n) }; }) },
          { type:'select', name:'hoejde', label:'Kolonnernes højde', changeProp:true, options:[{ id:'fuld', name:'Lige høje' }, { id:'auto', name:'Efter indhold' }] }
        ] },
        init: function(){
          this.set('kolonner', String(this.components().length || 1), { silent:true });
          this.set('hoejde', this.getClasses().indexOf('a-auto') >= 0 ? 'auto' : 'fuld', { silent:true });
          this.on('change:kolonner', this.nyeKolonner);
          this.on('change:hoejde', function(){ if(this.get('hoejde') === 'auto') this.addClass('a-auto'); else this.removeClass('a-auto'); });
        },
        nyeKolonner: function(){
          var n = Math.max(1, Math.min(6, parseInt(this.get('kolonner'), 10) || 1));
          var k = this.components();
          while(k.length < n) k.add('<div class="a-kol"></div>');
          /* Overskydende kolonner fjernes kun, hvis de er tomme - ellers flyttes indholdet over i den sidste, der bliver. */
          while(k.length > n){
            var sidst = k.at(k.length - 1), før = k.at(n - 1);
            sidst.components().models.slice().forEach(function(c){ før.components().add(c); });
            sidst.remove();
          }
          this.addStyle({ '--a-kol': String(n) });
        }
      }
    });
    DC.addType('a-kolonne', {
      isComponent: function(el){ return el.classList && el.classList.contains('a-kol'); },
      model: { defaults: { name:'Kolonne', traits:[
        { type:'text', name:'bredde', label:'Bredde (fx 30% eller 2fr; tom = lige)', changeProp:true }
      ] }, init: function(){
        this.set('bredde', (this.getAttributes()['data-a-bredde'] || ''), { silent:true });
        this.on('change:bredde', function(){
          var b = (this.get('bredde') || '').trim().replace(/[^0-9a-z%.]/gi, '');
          if(b) this.addAttributes({ 'data-a-bredde':b }); else this.removeAttributes('data-a-bredde');
          var r = this.parent(); if(!r) return;
          var dele = r.components().map(function(c){ return c.getAttributes()['data-a-bredde'] || '1fr'; });
          if(dele.every(function(x){ return x === '1fr'; })) r.removeStyle('grid-template-columns');
          else r.addStyle({ 'grid-template-columns':dele.map(function(x){ return /%$/.test(x) ? 'minmax(0,' + x + ')' : 'minmax(0,' + x + ')'; }).join(' ') });
        });
      } }
    });
    DC.addType('a-flexboks', {
      isComponent: function(el){ return el.classList && el.classList.contains('a-flex'); },
      model: { defaults: { name:'Flex-boks', traits:[
        { type:'select', name:'retning', label:'Retning', changeProp:true, options:[{ id:'row', name:'Vandret' }, { id:'column', name:'Lodret' }] },
        { type:'select', name:'placering', label:'Placering', changeProp:true, options:[{ id:'flex-start', name:'Start' }, { id:'center', name:'Midt' }, { id:'flex-end', name:'Slut' }, { id:'space-between', name:'Spredt' }] },
        { type:'checkbox', name:'stak', label:'Stak lodret på mobil', changeProp:true }
      ] }, init: function(){
        this.on('change:retning', function(){ this.addStyle({ 'flex-direction':this.get('retning') }); });
        this.on('change:placering', function(){ this.addStyle({ 'justify-content':this.get('placering') }); });
        this.on('change:stak', function(){ if(this.get('stak')) this.addClass('a-stak'); else this.removeClass('a-stak'); });
      } }
    });

    /* ---------- Popup ---------- */
    DC.addType('a-popup', {
      isComponent: function(el){ return el.hasAttribute && el.hasAttribute('data-a-popup'); },
      model: { defaults: { name:'Popup', attributes:{ 'data-a-popup':'', 'data-a-popup-trigger':'klik' }, traits:[
        { type:'select', name:'data-a-popup-trigger', label:'Åbner', options:[{ id:'klik', name:'Når der klikkes på en knap' }, { id:'forlad', name:'Når kunden vil forlade siden' }, { id:'indlaes', name:'Når siden åbnes' }] },
        { type:'number', name:'data-a-popup-forsinkelse', label:'Forsinkelse ved åbning (ms)', min:0, max:20000 },
        { type:'text', name:'bredde', label:'Bredde (fx 600px eller 60%)', changeProp:true }
      ] }, init: function(){ this.on('change:bredde', function(){ this.addStyle({ '--a-bredde':this.get('bredde') || '600px' }); }); } }
    });

    /* ---------- Tekst ---------- */
    DC.addType('a-overskrift', {
      extend:'text',
      isComponent: function(el){ return el.tagName && /^H[1-4]$/.test(el.tagName) ? { type:'a-overskrift', tagName:el.tagName.toLowerCase() } : false; },
      model: { defaults: { name:'Overskrift', traits:[
        { type:'select', name:'niveau', label:'Niveau (til Google)', changeProp:true, options:[{ id:'h1', name:'H1 - sidens hovedoverskrift' }, { id:'h2', name:'H2' }, { id:'h3', name:'H3' }, { id:'h4', name:'H4' }] }, ANKER
      ] }, init: function(){ this.set('niveau', this.get('tagName'), { silent:true }); this.on('change:niveau', function(){ this.set('tagName', this.get('niveau')); }); } }
    });

    /* ---------- Knap ---------- */
    DC.addType('a-knap', {
      extend:'link',
      isComponent: function(el){ return el.classList && el.classList.contains('a-knap') && el.tagName === 'A'; },
      model: {
        defaults: { name:'Knap', traits:[
          { type:'select', name:'handling', label:'Når der klikkes', changeProp:true, options:[
            { id:'link', name:'Gå til en adresse' }, { id:'naeste', name:'Gå til næste trin i funnelen' }, { id:'rul', name:'Rul til et sted på siden' },
            { id:'send', name:'Send formularen' }, { id:'aaben-popup', name:'Åbn popuppen' }, { id:'luk-popup', name:'Luk popuppen' } ] },
          { type:'text', name:'href', label:'Adresse' },
          { type:'text', name:'maal', label:'Rul til (anker-id)', changeProp:true },
          { type:'checkbox', name:'nytvindue', label:'Åbn i nyt vindue', changeProp:true },
          { type:'select', name:'udseende', label:'Udseende', changeProp:true, options:[{ id:'1', name:'Fyldt' }, { id:'2', name:'Kant' }, { id:'3', name:'Kun tekst' }] },
          { type:'checkbox', name:'bred', label:'Fuld bredde', changeProp:true },
          { type:'text', name:'undertekst', label:'Lille tekst under', changeProp:true }
        ] },
        init: function(){
          var a = this.getAttributes(), k = this.getClasses();
          this.set({ handling:a['data-a-handling'] || 'link', maal:a['data-a-maal'] || '', nytvindue:a.target === '_blank',
                     udseende: k.indexOf('a-knap-2') >= 0 ? '2' : k.indexOf('a-knap-3') >= 0 ? '3' : '1', bred:k.indexOf('a-bred') >= 0 }, { silent:true });
          this.on('change:handling change:maal', function(){
            var h = this.get('handling');
            if(h === 'link') this.removeAttributes(['data-a-handling', 'data-a-maal']);
            else this.addAttributes({ 'data-a-handling':h });
            if(h === 'rul') this.addAttributes({ 'data-a-maal':this.get('maal') || '', href:'#' + (this.get('maal') || '') });
            else this.removeAttributes('data-a-maal');
            if(h !== 'link' && h !== 'rul') this.addAttributes({ href:'#' });
          });
          this.on('change:nytvindue', function(){ if(this.get('nytvindue')) this.addAttributes({ target:'_blank', rel:'noopener' }); else this.removeAttributes(['target', 'rel']); });
          this.on('change:udseende', function(){ this.removeClass('a-knap-2'); this.removeClass('a-knap-3'); if(this.get('udseende') !== '1') this.addClass('a-knap-' + this.get('udseende')); });
          this.on('change:bred', function(){ if(this.get('bred')) this.addClass('a-bred'); else this.removeClass('a-bred'); });
          this.on('change:undertekst', function(){
            var u = this.get('undertekst'), lille = this.find('small')[0];
            if(!u){ if(lille) lille.remove(); return; }
            if(lille) lille.components(u); else this.append('<small>' + u.replace(/[<>&]/g, '') + '</small>');
          });
        }
      }
    });

    /* ---------- Medier ---------- */
    DC.addType('a-video', {
      isComponent: function(el){ return el.hasAttribute && el.hasAttribute('data-a-video'); },
      model: { defaults: { name:'Video', droppable:false, attributes:{ 'data-a-video':'' }, traits:[
        { type:'text', name:'data-a-video', label:'Videoens adresse (YouTube, Vimeo, Wistia eller .mp4)' },
        { type:'text', name:'forside', label:'Forsidebillede (adresse, tom = sort)', changeProp:true }
      ] }, init: function(){
        var bg = (this.getStyle()['background-image'] || '').replace(/^url\(["']?|["']?\)$/g, '');
        this.set('forside', bg, { silent:true });
        this.on('change:forside', function(){ var f = this.get('forside'); if(f) this.addStyle({ 'background-image':'url("' + f + '")' }); else this.removeStyle('background-image'); });
      } }
    });
    DC.addType('a-videopopup', {
      isComponent: function(el){ return el.hasAttribute && el.hasAttribute('data-a-videopopup'); },
      model: { defaults: { name:'Video-popup', droppable:false, traits:[
        { type:'text', name:'data-a-videopopup', label:'Videoens adresse' }
      ] } }
    });
    DC.addType('a-lyd', {
      isComponent: function(el){ return el.tagName === 'AUDIO'; },
      model: { defaults: { name:'Lyd', tagName:'audio', droppable:false, attributes:{ controls:'', preload:'none' }, traits:[
        { type:'text', name:'src', label:'Lydfilens adresse (.mp3)' }, { type:'checkbox', name:'loop', label:'Gentag' }
      ] } }
    });

    /* ---------- Formular ---------- */
    DC.addType('a-formular', {
      isComponent: function(el){ return el.tagName === 'FORM' && el.hasAttribute('data-arytmi-formular'); },
      model: { defaults: { name:'Formular', tagName:'form', traits:[
        { type:'text', name:'data-arytmi-formular', label:'Formularens navn (til kontakter)' },
        { type:'text', name:'data-a-efter', label:'Efter afsendelse: gå til (tom = næste trin)' }
      ] } }
    });
    DC.addType('a-felt', {
      isComponent: function(el){ return el.classList && el.classList.contains('a-felt') && !el.classList.contains('a-afkryds'); },
      model: {
        defaults: { name:'Formularfelt', traits:[
          { type:'text', name:'etiket', label:'Tekst over feltet', changeProp:true },
          { type:'select', name:'felttype', label:'Gemmes som', changeProp:true, options:[
            { id:'name', name:'Fulde navn' }, { id:'first_name', name:'Fornavn' }, { id:'last_name', name:'Efternavn' }, { id:'email', name:'Mail' },
            { id:'phone', name:'Telefon' }, { id:'address', name:'Adresse' }, { id:'zip', name:'Postnummer' }, { id:'city', name:'By' },
            { id:'country', name:'Land' }, { id:'egen', name:'Eget felt' } ] },
          { type:'text', name:'noegle', label:'Eget felts navn (fx bilmodel)', changeProp:true },
          { type:'text', name:'hint', label:'Hjælpetekst i feltet', changeProp:true },
          { type:'checkbox', name:'paakraevet', label:'Skal udfyldes', changeProp:true }
        ] },
        init: function(){
          var inp = this.find('input,textarea,select')[0];
          var lab = this.components().filter(function(c){ return c.get('type') === 'textnode'; })[0];
          var a = inp ? inp.getAttributes() : {};
          var navn = a.name || '';
          var faste = ['name','first_name','last_name','email','phone','address','zip','city','country'];
          this.set({ etiket: lab ? lab.get('content') : '', felttype: faste.indexOf(navn) >= 0 ? navn : 'egen', noegle: faste.indexOf(navn) >= 0 ? '' : navn,
                     hint:a.placeholder || '', paakraevet: a.required !== undefined }, { silent:true });
          this.on('change:etiket', function(){ var l = this.components().filter(function(c){ return c.get('type') === 'textnode'; })[0]; if(l) l.set('content', this.get('etiket')); });
          this.on('change:felttype change:noegle', function(){
            if(!inp) return;
            var t = this.get('felttype');
            var n = t === 'egen' ? (this.get('noegle') || 'felt').toLowerCase().replace(/[^a-z0-9_]+/g, '_') : t;
            var typer = { email:'email', phone:'tel' };
            var auto = { name:'name', first_name:'given-name', last_name:'family-name', email:'email', phone:'tel', address:'street-address', zip:'postal-code', city:'address-level2', country:'country-name' };
            inp.addAttributes({ name:n });
            if(inp.get('tagName') === 'input'){ inp.addAttributes({ type:typer[t] || 'text' }); if(auto[t]) inp.addAttributes({ autocomplete:auto[t] }); else inp.removeAttributes('autocomplete'); }
          });
          this.on('change:hint', function(){ if(inp) inp.addAttributes({ placeholder:this.get('hint') }); });
          this.on('change:paakraevet', function(){ if(!inp) return; if(this.get('paakraevet')) inp.addAttributes({ required:'' }); else inp.removeAttributes('required'); });
        }
      }
    });
    DC.addType('a-afkrydsning', {
      isComponent: function(el){ return el.classList && el.classList.contains('a-afkryds'); },
      model: { defaults: { name:'Afkrydsning', traits:[
        { type:'text', name:'noegle', label:'Gemmes som (fx samtykke_nyheder)', changeProp:true },
        { type:'checkbox', name:'paakraevet', label:'Skal krydses af', changeProp:true }
      ] }, init: function(){
        var inp = this.find('input')[0], a = inp ? inp.getAttributes() : {};
        this.set({ noegle:a.name || '', paakraevet:a.required !== undefined }, { silent:true });
        this.on('change:noegle', function(){ if(inp) inp.addAttributes({ name:(this.get('noegle') || 'afkrydsning').toLowerCase().replace(/[^a-z0-9_]+/g, '_') }); });
        this.on('change:paakraevet', function(){ if(!inp) return; if(this.get('paakraevet')) inp.addAttributes({ required:'' }); else inp.removeAttributes('required'); });
      } }
    });

    /* ---------- Komplekse ---------- */
    DC.addType('a-ikonliste', {
      isComponent: function(el){ return el.classList && (el.classList.contains('a-ikonliste') || el.classList.contains('a-talliste')); },
      model: { defaults: { name:'Liste', traits:[
        { type:'select', name:'ikon', label:'Ikon', changeProp:true, options:[{ id:'flueben', name:'Flueben' }, { id:'stjerne', name:'Stjerne' }, { id:'hjerte', name:'Hjerte' }, { id:'pil', name:'Pil' }, { id:'plus', name:'Plus' }, { id:'lyn', name:'Lyn' }, { id:'prik', name:'Prik' }, { id:'kryds', name:'Kryds' }, { id:'tal', name:'Tal (1, 2, 3)' }] },
        { type:'color', name:'ikonfarve', label:'Ikonets farve', changeProp:true }
      ] }, init: function(){
        var k = this.getClasses(), i = this.get('tagName') === 'ol' ? 'tal' : 'flueben';
        ['stjerne','hjerte','pil','plus','lyn','prik','kryds'].forEach(function(x){ if(k.indexOf('a-i-' + x) >= 0) i = x; });
        this.set('ikon', i, { silent:true });
        this.on('change:ikon', function(){
          var nyt = this.get('ikon'), self = this;
          ['stjerne','hjerte','pil','plus','lyn','prik','kryds'].forEach(function(x){ self.removeClass('a-i-' + x); });
          if(nyt === 'tal'){ this.set('tagName', 'ol'); this.removeClass('a-ikonliste'); this.addClass('a-talliste'); }
          else { this.set('tagName', 'ul'); this.removeClass('a-talliste'); this.addClass('a-ikonliste'); if(nyt !== 'flueben') this.addClass('a-i-' + nyt); }
        });
        this.on('change:ikonfarve', function(){ this.addStyle({ '--a-ikonfarve':this.get('ikonfarve') }); });
      } }
    });
    DC.addType('a-nedtaelling', {
      isComponent: function(el){ return el.hasAttribute && el.hasAttribute('data-a-nedtaelling'); },
      model: { defaults: { name:'Nedtælling', droppable:false, traits:[
        { type:'select', name:'nt-type', label:'Type', changeProp:true, options:[{ id:'fast', name:'Til en fast dato' }, { id:'evergreen', name:'Evergreen (fra kundens første besøg)' }] },
        { type:'text', name:'data-a-slut', label:'Slutter (åååå-mm-ddTtt:mm, dansk tid)' },
        { type:'number', name:'data-a-evergreen', label:'Evergreen: minutter', min:1 },
        { type:'text', name:'data-a-ved-slut', label:'Når den er slut ("skjul" eller en adresse)' },
        { type:'checkbox', name:'vis-dage', label:'Vis dage', changeProp:true }
      ] }, init: function(){
        this.set({ 'nt-type': this.getAttributes()['data-a-evergreen'] ? 'evergreen' : 'fast', 'vis-dage': !!this.find('[data-a-d]').length }, { silent:true });
        this.on('change:nt-type', function(){ if(this.get('nt-type') === 'fast') this.removeAttributes('data-a-evergreen'); else this.removeAttributes('data-a-slut'); });
        this.on('change:vis-dage', function(){ var d = this.find('[data-a-d]')[0]; if(d && !this.get('vis-dage')) d.parent().remove(); });
        this.on('change:attributes', function(){ var w = editor.Canvas.getWindow(); if(w && w.ArytmiRuntime) setTimeout(function(){ w.ArytmiRuntime.genstart(); }, 50); });
      } }
    });
    DC.addType('a-ikon', {
      isComponent: function(el){ return el.classList && el.classList.contains('a-ikon'); },
      model: { defaults: { name:'Ikon', droppable:false, traits:[
        { type:'select', name:'ikon', label:'Ikon', changeProp:true, options:Object.keys(IKONER).map(function(k){ return { id:k, name:k.charAt(0).toUpperCase() + k.slice(1) }; }) },
        { type:'text', name:'href', label:'Link (valgfrit)', changeProp:true }
      ] }, init: function(){
        this.on('change:ikon', function(){ this.components(ikonSvg(this.get('ikon'))); });
      } }
    });
    DC.addType('a-bjaelke', {
      isComponent: function(el){ return el.classList && el.classList.contains('a-bjaelke'); },
      model: { defaults: { name:'Fremskridtsbjælke', droppable:false, traits:[
        { type:'number', name:'procent', label:'Procent', min:0, max:100, changeProp:true },
        { type:'text', name:'tekst', label:'Tekst på bjælken', changeProp:true }
      ] }, init: function(){
        var fyld = this.find('.a-bjaelke-fyld')[0];
        this.set({ procent: parseInt((this.getStyle()['--a-fyld'] || '60').replace('%', ''), 10), tekst: fyld ? fyld.getInnerHTML() : '' }, { silent:true });
        this.on('change:procent', function(){ this.addStyle({ '--a-fyld':Math.max(0, Math.min(100, +this.get('procent') || 0)) + '%' }); });
        this.on('change:tekst', function(){ if(fyld) fyld.components(String(this.get('tekst') || '').replace(/[<>&]/g, '')); });
      } }
    });
    /* Egen HTML: koden gemmes som den er og vises KUN i forhåndsvisningen og
       på den udgivne side - i editoren er det en pladsholder, så et script
       aldrig kører inde i bagrummet. */
    DC.addType('a-egen-html', {
      isComponent: function(el){ return el.hasAttribute && el.hasAttribute('data-a-egen-html') ? { type:'a-egen-html', kode:el.innerHTML, components:[] } : false; },
      model: {
        defaults: { name:'Egen HTML', droppable:false, kode:'', attributes:{ 'data-a-egen-html':'' } },
        toHTML: function(){ return '<div data-a-egen-html="">' + (this.get('kode') || '') + '</div>'; }
      },
      view: {
        onRender: function(){
          var e = this.el; e.innerHTML = '';
          var p = document.createElement('div');
          p.style.cssText = 'padding:18px;border:1.5px dashed #8F4333;border-radius:10px;font:13px/1.4 Arial,sans-serif;color:#4A2417;background:#fff8ef;text-align:center';
          var kode = this.model.get('kode') || '';
          p.textContent = 'Egen HTML · ' + (kode ? kode.length + ' tegn' : 'tom') + ' · vises i forhåndsvisningen. Rediger under Indstillinger.';
          e.appendChild(p);
        }
      }
    });
    /* Universel sektion: en pladsholder, der henter sit indhold fra tabellen
       `sektion` (0082). Rettes ét sted og slår igennem på alle sider. */
    DC.addType('a-universel', {
      isComponent: function(el){ return el.hasAttribute && el.hasAttribute('data-a-sektion'); },
      model: {
        defaults: { name:'Universel sektion', droppable:false, editable:false, attributes:{ 'data-a-sektion':'' } },
        toHTML: function(){ return '<div data-a-sektion="' + (this.getAttributes()['data-a-sektion'] || '') + '"></div>'; }
      },
      view: {
        onRender: function(){
          var id = this.model.getAttributes()['data-a-sektion'];
          var s = valg.sektion && valg.sektion(id);
          var e = this.el; e.innerHTML = '';
          if(!s){ e.textContent = 'Universel sektion findes ikke længere'; return; }
          var mærke = document.createElement('div');
          mærke.textContent = 'UNIVERSEL · ' + s.navn + ' · rettes under Gemte sektioner';
          mærke.style.cssText = 'position:absolute;top:6px;left:8px;z-index:5;font:700 10px/1 Arial,sans-serif;letter-spacing:.06em;color:#fff;background:#4f6b4a;padding:5px 7px;border-radius:4px;pointer-events:none';
          var indhold = document.createElement('div');
          indhold.innerHTML = s.html;
          var st = document.createElement('style'); st.textContent = s.css || '';
          e.style.position = 'relative'; e.style.outline = '2px dashed #4f6b4a'; e.style.outlineOffset = '-2px';
          e.appendChild(st); e.appendChild(mærke); e.appendChild(indhold);
        }
      }
    });

    /* ---------- Rich text: farve og fremhævning ---------- */
    var rte = editor.RichTextEditor;
    rte.add('farve', {
      icon:'<b style="color:#c0392b">A</b>', attributes:{ title:'Tekstfarve' },
      result: function(r){ var f = prompt('Farve (fx #8F4333):', '#8F4333'); if(f) r.insertHTML('<span style="color:' + f.replace(/[^#0-9a-zA-Z(),. %]/g, '') + '">' + String(r.selection()) + '</span>'); }
    });
    rte.add('fremhaev', {
      icon:'<span style="background:#fde68a;padding:0 3px">H</span>', attributes:{ title:'Fremhæv' },
      result: function(r){ r.insertHTML('<span style="background:#fde68a">' + String(r.selection()) + '</span>'); }
    });

    /* =============================================================
       BLOKKENE
       ============================================================= */
    var bm = editor.Blocks;
    function blok(id, navn, kat, media, indhold){ bm.add(id, { label:navn, category:kat, media:media, content:indhold }); }

    /* Struktur */
    blok('e-sektion', 'Sektion', 'Struktur', skitse(B(4, 14, 112, 52, '#efe5d8')),
      '<section class="a-sek"><div class="a-wrap"><div class="a-raekke" style="--a-kol:1"><div class="a-kol"></div></div></div></section>');
    [1, 2, 3, 4, 5, 6].forEach(function(n){
      var k = ''; for(var i = 0; i < n; i++) k += '<div class="a-kol"></div>';
      blok('e-raekke-' + n, n + (n === 1 ? ' kolonne' : ' kolonner'), 'Struktur', kolSkitse(n), '<div class="a-raekke" style="--a-kol:' + n + '">' + k + '</div>');
    });
    blok('e-flex', 'Flex-boks', 'Struktur', skitse(B(10, 30, 30, 20) + B(45, 30, 30, 20) + B(80, 30, 30, 20)), '<div class="a-flex"><div style="min-width:60px;min-height:40px"></div></div>');
    blok('e-popup', 'Popup', 'Struktur', skitse('<rect x="1" y="1" width="118" height="78" rx="6" fill="#4A2417" opacity=".35"/>' + B(25, 14, 70, 52, '#FAF6EF') + T(40, 24, 40) + L(36, 36, 48) + K(45, 50)),
      '<div class="a-popup" data-a-popup="" data-a-popup-trigger="klik"><div class="a-popup-boks">' +
      '<button type="button" class="a-popup-luk" data-a-handling="luk-popup" aria-label="Luk">×</button>' +
      '<section class="a-sek" style="padding:40px 0"><div class="a-wrap" style="text-align:center"><h2>Vent lidt!</h2><p>Skriv tilbuddet her.</p>' +
      '<a class="a-knap" href="#" data-a-handling="luk-popup">Nej tak</a></div></section></div></div>');

    /* Tekst */
    blok('e-h1', 'Overskrift', 'Tekst', skitse(T(20, 34, 80)), '<h1>Overskrift</h1>');
    blok('e-h2', 'Underoverskrift', 'Tekst', skitse(L(25, 36, 70, 5, '#8F4333')), '<h2>Underoverskrift</h2>');
    blok('e-p', 'Afsnit', 'Tekst', skitse(L(14, 26, 92) + L(14, 34, 88) + L(14, 42, 92) + L(14, 50, 60)), '<p>Skriv teksten her.</p>');
    blok('e-ikonliste', 'Ikonliste', 'Tekst', skitse('<path d="M14 22l3 3 5-6" stroke="#8F4333" stroke-width="2" fill="none"/>' + L(28, 21, 70) + '<path d="M14 38l3 3 5-6" stroke="#8F4333" stroke-width="2" fill="none"/>' + L(28, 37, 60) + '<path d="M14 54l3 3 5-6" stroke="#8F4333" stroke-width="2" fill="none"/>' + L(28, 53, 66)),
      '<ul class="a-ikonliste"><li>Første fordel</li><li>Anden fordel</li><li>Tredje fordel</li></ul>');
    blok('e-citat', 'Citat', 'Tekst', skitse('<text x="12" y="40" font-size="34" fill="#8F4333">“</text>' + L(34, 28, 70, 4, '#4A2417') + L(34, 36, 60, 4, '#4A2417') + L(34, 50, 30)),
      '<blockquote style="margin:24px 0;padding-left:20px;border-left:3px solid #8F4333;font-size:20px;font-style:italic">"Citat."<br><small style="font-style:normal;font-size:14px">Navn</small></blockquote>');

    /* Medier */
    blok('e-billede', 'Billede', 'Medier', skitse(B(20, 12, 80, 56)), { type:'image', src:PLADS, style:{ 'max-width':'100%', 'border-radius':'16px' }, activate:true });
    blok('e-video', 'Video', 'Medier', skitse(B(14, 12, 92, 56, '#2b2723') + '<circle cx="60" cy="40" r="12" fill="#DE854A"/><path d="M56 34v12l10-6z" fill="#fff"/>'),
      '<div class="a-video" data-a-video="https://www.youtube.com/watch?v=" role="button" aria-label="Afspil video"><span class="a-video-tekst">Tryk for at afspille</span></div>');
    blok('e-videopopup', 'Video-popup', 'Medier', skitse(B(14, 12, 92, 56) + '<circle cx="60" cy="40" r="12" fill="#DE854A"/><path d="M56 34v12l10-6z" fill="#fff"/>'),
      '<a class="a-videopopup" href="#" data-a-videopopup="https://www.youtube.com/watch?v="><img src="' + PLADS + '" alt="Se videoen"></a>');
    blok('e-lyd', 'Lyd', 'Medier', skitse(B(14, 30, 92, 20, '#efe5d8') + '<path d="M22 36v8h5l6 5V31l-6 5z" fill="#4A2417"/>' + L(42, 39, 56, 2)), '<audio controls preload="none" src=""></audio>');
    blok('e-linje', 'Skillelinje', 'Medier', skitse(L(14, 39, 92, 2)), '<hr class="a-linje">');
    blok('e-mellemrum', 'Mellemrum', 'Medier', skitse('<path d="M60 22v36M52 30l8-8 8 8M52 50l8 8 8-8" stroke="#B9A99A" stroke-width="2" fill="none"/>'), '<div style="height:48px"></div>');
    blok('e-ikon', 'Ikon', 'Medier', skitse('<g transform="translate(46 26) scale(1.2)"><path fill="#8F4333" d="' + IKONER.stjerne + '"/></g>'),
      '<div class="a-ikon-boks"><span class="a-ikon">' + ikonSvg('stjerne') + '</span></div>');

    /* Knapper og formular */
    blok('e-knap', 'Knap', 'Knapper og formular', skitse(K(35, 35, 50)), '<a class="a-knap" href="#">Køb nu</a>');
    blok('e-knap-rul', 'Knap: rul ned', 'Knapper og formular', skitse(K(35, 30, 50) + '<path d="M60 46v10M55 52l5 5 5-5" stroke="#4A2417" stroke-width="2" fill="none"/>'),
      '<a class="a-knap" href="#" data-a-handling="rul" data-a-maal="">Se hvordan</a>');
    blok('e-knap-naeste', 'Knap: næste trin', 'Knapper og formular', skitse(K(30, 35, 60) + '<path d="M84 39h6M88 37l2 2-2 2" stroke="#fff" stroke-width="1.5" fill="none"/>'),
      '<a class="a-knap" href="#" data-a-handling="naeste">Videre<small>Det tager kun et minut</small></a>');
    blok('e-formular', 'Formular', 'Knapper og formular', skitse('<rect x="30" y="8" width="60" height="64" rx="6" fill="#fff" stroke="#D9CFC2"/>' + B(38, 18, 44, 8) + B(38, 30, 44, 8) + K(45, 50)),
      '<form class="a-form-kort" data-arytmi-formular="tilmelding" style="max-width:460px;margin:0 auto">' +
      '<label class="a-felt">Mail<input type="email" name="email" required autocomplete="email" placeholder="din@mail.dk"></label>' +
      '<a class="a-knap a-bred" href="#" data-a-handling="send">Send</a></form>');
    function feltBlok(id, navn, label, attr){
      blok(id, navn, 'Knapper og formular', skitse(L(30, 26, 40, 4, '#4A2417') + B(30, 34, 60, 12, '#fff') + '<rect x="30" y="34" width="60" height="12" rx="4" fill="none" stroke="#D9CFC2"/>'),
        '<label class="a-felt">' + label + '<input ' + attr + '></label>');
    }
    feltBlok('e-felt-navn', 'Felt: navn', 'Navn', 'type="text" name="name" autocomplete="name"');
    feltBlok('e-felt-fornavn', 'Felt: fornavn', 'Fornavn', 'type="text" name="first_name" autocomplete="given-name"');
    feltBlok('e-felt-mail', 'Felt: mail', 'Mail', 'type="email" name="email" required autocomplete="email"');
    feltBlok('e-felt-telefon', 'Felt: telefon', 'Telefon', 'type="tel" name="phone" autocomplete="tel"');
    feltBlok('e-felt-adresse', 'Felt: adresse', 'Adresse', 'type="text" name="address" autocomplete="street-address"');
    feltBlok('e-felt-egen', 'Felt: eget', 'Hvilken bil har I?', 'type="text" name="bilmodel"');
    blok('e-tekstfelt', 'Tekstfelt (flere linjer)', 'Knapper og formular', skitse(L(30, 18, 40, 4, '#4A2417') + '<rect x="30" y="26" width="60" height="36" rx="4" fill="#fff" stroke="#D9CFC2"/>'),
      '<label class="a-felt">Besked<textarea name="besked"></textarea></label>');
    blok('e-afkryds', 'Afkrydsning', 'Knapper og formular', skitse('<rect x="20" y="32" width="12" height="12" rx="2" fill="#fff" stroke="#8F4333"/>' + L(38, 34, 64, 4)),
      '<label class="a-felt a-afkryds"><input type="checkbox" name="samtykke_nyheder" value="ja"> Ja tak, send mig nyheder og tilbud fra Arytmi på mail. Jeg kan altid afmelde mig.</label>');
    blok('e-rulleliste', 'Rulleliste', 'Knapper og formular', skitse(L(30, 26, 40, 4, '#4A2417') + '<rect x="30" y="34" width="60" height="12" rx="4" fill="#fff" stroke="#D9CFC2"/><path d="M80 38l3 3 3-3" stroke="#4A2417" fill="none"/>'),
      '<label class="a-felt">Bilmodel<select name="bilmodel"><option value="">Vælg …</option><option>Model Y Juniper</option><option>Model Y (2021–2025)</option><option>Model X</option></select></label>');
    blok('e-land', 'Land', 'Knapper og formular', skitse(L(30, 26, 40, 4, '#4A2417') + '<rect x="30" y="34" width="60" height="12" rx="4" fill="#fff" stroke="#D9CFC2"/>'),
      '<label class="a-felt">Land<select name="country" autocomplete="country-name">' + LANDE.map(function(l){ return '<option>' + l + '</option>'; }).join('') + '</select></label>');

    /* Komplekse */
    blok('e-nedtaelling', 'Nedtælling', 'Komplekse', skitse(B(12, 28, 22, 24, '#4A2417') + B(37, 28, 22, 24, '#4A2417') + B(62, 28, 22, 24, '#4A2417') + B(87, 28, 22, 24, '#4A2417')),
      '<div class="a-nedtaelling" data-a-nedtaelling="" data-a-slut="2026-12-14T23:59">' +
      '<div class="a-nt-del"><b data-a-d>00</b><span>dage</span></div><div class="a-nt-del"><b data-a-t>00</b><span>timer</span></div>' +
      '<div class="a-nt-del"><b data-a-m>00</b><span>min</span></div><div class="a-nt-del"><b data-a-s>00</b><span>sek</span></div></div>');
    blok('e-faq', 'Spørgsmål (harmonika)', 'Komplekse', skitse(L(14, 24, 92, 3, '#4A2417') + L(14, 30, 92, 1) + L(14, 42, 92, 3, '#4A2417') + L(14, 48, 92, 1)),
      '<details class="a-faq-punkt" style="border-bottom:1px solid #D9CFC2;padding:14px 0"><summary style="cursor:pointer;font-weight:700">Spørgsmål?</summary><p>Svar.</p></details>');
    blok('e-bjaelke', 'Fremskridtsbjælke', 'Komplekse', skitse(B(14, 34, 92, 12, '#efe5d8') + B(14, 34, 60, 12, '#8F4333')),
      '<div class="a-bjaelke" style="--a-fyld:60%"><div class="a-bjaelke-fyld">Næsten færdig …</div></div>');
    blok('e-menu', 'Menu', 'Komplekse', skitse(L(10, 36, 22, 8, '#4A2417') + L(56, 38, 12, 3) + L(74, 38, 12, 3) + L(92, 38, 12, 3)),
      '<nav class="a-nav a-wrap"><a class="a-nav-logo" href="https://arytmi.com"><img src="https://arytmi.com/logo-2026.svg" alt="Arytmi"></a>' +
      '<button type="button" class="a-nav-knap" aria-expanded="false" aria-label="Menu">☰</button>' +
      '<ul class="a-nav-links"><li><a href="#">Madrasserne</a></li><li><a href="#">Appen</a></li><li><a href="#">Spørgsmål</a></li></ul></nav>');
    blok('e-egen-html', 'Egen HTML / kode', 'Komplekse', skitse('<text x="36" y="46" font-family="monospace" font-size="16" fill="#8F4333">&lt;/&gt;</text>'),
      { type:'a-egen-html', kode:'<!-- Indsæt koden her -->' });

    /* Sektioner og layout fra sider.js står allerede i BLOKKE; de
       ligger i kategorierne Sektioner, Salg og Layout. */
  }

  window.ArytmiElementer = { registrer:registrer, ikoner:IKONER };
})();
