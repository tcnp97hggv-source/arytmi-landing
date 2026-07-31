/* =========================================================
   ARYTMI · REKOGNOSCERING
   Feltværktøj til at teste destinationer til Arytmis destinationsbank.

   GRUNDREGEL: alt gemmes lokalt i IndexedDB i samme øjeblik det tastes.
   Stederne uden dækning er præcis dem hvor data er mest værd — derfor
   må intet afhænge af netværket. Drive-eksport er et lag ovenpå.
   ========================================================= */

/* ---------------- lager ---------------- */
const DB_NAVN = 'arytmi-recon', DB_VER = 1;
let db;

function åbnDB(){
  return new Promise((ok, fejl) => {
    const r = indexedDB.open(DB_NAVN, DB_VER);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if(!d.objectStoreNames.contains('steder'))   d.createObjectStore('steder', {keyPath:'id'});
      if(!d.objectStoreNames.contains('billeder')) d.createObjectStore('billeder', {keyPath:'id'});
      if(!d.objectStoreNames.contains('fliser'))   d.createObjectStore('fliser');
    };
    r.onsuccess = e => { db = e.target.result; ok(db); };
    r.onerror = () => fejl(r.error);
  });
}
function tx(butik, tilstand='readonly'){ return db.transaction(butik, tilstand).objectStore(butik); }
function put(butik, værdi, nøgle){
  return new Promise((ok, fejl) => {
    const r = nøgle === undefined ? tx(butik,'readwrite').put(værdi) : tx(butik,'readwrite').put(værdi, nøgle);
    r.onsuccess = () => ok(r.result); r.onerror = () => fejl(r.error);
  });
}
function hent(butik, nøgle){
  return new Promise((ok, fejl) => {
    const r = tx(butik).get(nøgle);
    r.onsuccess = () => ok(r.result); r.onerror = () => fejl(r.error);
  });
}
function alle(butik){
  return new Promise((ok, fejl) => {
    const r = tx(butik).getAll();
    r.onsuccess = () => ok(r.result || []); r.onerror = () => fejl(r.error);
  });
}
function slet(butik, nøgle){
  return new Promise((ok, fejl) => {
    const r = tx(butik,'readwrite').delete(nøgle);
    r.onsuccess = () => ok(); r.onerror = () => fejl(r.error);
  });
}

/* ---------------- tilstand ---------------- */
let steder = {};        // id -> registrering
let skærm = 'rute';
let aktivtId = null;
let kort = null, markør = null;
let gemTimer = null;

const TOM = id => ({
  id, punkt:null, dom:null, hvorfor:'', oplevelse:'',
  ønsker:{lys:null, natur:null, stemning:null},
  faciliteter:{toilet:'', handel:'', aftensmad:'', morgen:''},
  tjek:{}, videomærker:[], billeder:[], opdateret:null
});

function katalog(){
  const ud = [];
  for(const wk of ['weekend1','weekend2'])
    for(const s of RUTE[wk]) ud.push({...s, weekend: wk});
  for(const id in steder)
    if(steder[id].egetSted) ud.push({...steder[id].egetSted, id, weekend:'eget'});
  return ud;
}
const findStop = id => katalog().find(s => s.id === id);

/* ---------------- hjælpere ---------------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = s => document.querySelector(s);

function flash(besked, ms=2600){
  document.querySelectorAll('.flash').forEach(e => e.remove());
  const d = document.createElement('div');
  d.className = 'flash'; d.textContent = besked;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ms);
}

function afstand(a, b){
  const R = 6371000, r = Math.PI/180;
  const p1 = a.lat*r, p2 = b.lat*r, dp = (b.lat-a.lat)*r, dl = (b.lon-a.lon)*r;
  const h = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

async function gem(id){
  const s = steder[id];
  if(!s) return;
  s.opdateret = new Date().toISOString();
  await put('steder', s);
}
function gemSnart(id){
  clearTimeout(gemTimer);
  gemTimer = setTimeout(() => gem(id), 400);
}
function reg(id){
  if(!steder[id]) steder[id] = TOM(id);
  return steder[id];
}
const erRørt = s => !!(s && (s.dom || s.oplevelse || s.punkt || s.billeder?.length ||
  Object.values(s.faciliteter||{}).some(Boolean) || Object.values(s.ønsker||{}).some(Boolean)));

/* ---------------- offline korttiles ---------------- */
const FliseLag = L.TileLayer.extend({
  createTile(koord, done){
    const img = document.createElement('img');
    img.alt = '';
    const url = this.getTileUrl(koord);
    const nøgle = `${koord.z}/${koord.x}/${koord.y}`;
    img.onload  = () => done(null, img);
    img.onerror = () => done(null, img);   // blank flise er bedre end et brækket kort
    hent('fliser', nøgle).then(blob => {
      img.src = blob ? URL.createObjectURL(blob) : url;
    }).catch(() => { img.src = url; });
    return img;
  }
});

function fliseURL(z, x, y){ return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`; }
const lon2x = (lon, z) => Math.floor((lon+180)/360 * 2**z);
const lat2y = (lat, z) => {
  const r = lat*Math.PI/180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1/Math.cos(r))/Math.PI)/2 * 2**z);
};

async function hentKortTilTuren(knap){
  const zoom = [12,13,14,15,16], radius = 0.014;   // ca. 1,5 km i grader
  const nøgler = new Set();
  for(const s of katalog())
    for(const z of zoom)
      for(let x = lon2x(s.lon-radius*1.8, z); x <= lon2x(s.lon+radius*1.8, z); x++)
        for(let y = lat2y(s.lat+radius, z); y <= lat2y(s.lat-radius, z); y++)
          nøgler.add(`${z}/${x}/${y}`);

  const liste = [...nøgler];
  let hentet = 0, sprunget = 0, fejlet = 0;
  knap.disabled = true;
  for(const n of liste){
    if(await hent('fliser', n)){ sprunget++; continue; }
    try{
      const [z,x,y] = n.split('/');
      const svar = await fetch(fliseURL(z,x,y));
      if(!svar.ok) throw new Error(svar.status);
      await put('fliser', await svar.blob(), n);
      hentet++;
      await new Promise(r => setTimeout(r, 45));   // vær pæn ved OSM's servere
    }catch{ fejlet++; }
    if((hentet+sprunget+fejlet) % 25 === 0)
      knap.textContent = `Henter kort … ${hentet+sprunget+fejlet} / ${liste.length}`;
  }
  knap.disabled = false;
  knap.textContent = 'Hent kort til turen igen';
  flash(`Kort klar: ${hentet} nye, ${sprunget} havde du. ${fejlet ? fejlet+' fejlede.' : ''}`, 5000);
}

/* ---------------- billeder ---------------- */
function komprimér(fil, maks=1600, kvalitet=.75){
  return new Promise((ok, fejl) => {
    const læser = new FileReader();
    læser.onload = () => {
      const img = new Image();
      img.onload = () => {
        const skala = Math.min(1, maks/Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width*skala); c.height = Math.round(img.height*skala);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => b ? ok(b) : fejl(new Error('kunne ikke komprimere')), 'image/jpeg', kvalitet);
      };
      img.onerror = () => fejl(new Error('kunne ikke læse billedet'));
      img.src = læser.result;
    };
    læser.onerror = () => fejl(læser.error);
    læser.readAsDataURL(fil);
  });
}

async function tilføjBilleder(id, filer){
  const s = reg(id);
  for(const f of filer){
    try{
      const blob = await komprimér(f);
      const bid = `${id}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      await put('billeder', {id:bid, blob, sted:id, tid:new Date().toISOString()});
      s.billeder.push(bid);
    }catch(e){ flash('Et billede kunne ikke gemmes'); }
  }
  await gem(id);
  tegn();
}

/* ---------------- eksport ---------------- */
const blobTilBase64 = blob => new Promise(ok => {
  const l = new FileReader(); l.onload = () => ok(l.result); l.readAsDataURL(blob);
});

async function byggEksport(){
  const billeder = await alle('billeder');
  const medData = [];
  for(const b of billeder){
    if(!b.blob) continue;
    medData.push({id:b.id, sted:b.sted, tid:b.tid, data: await blobTilBase64(b.blob)});
  }
  const rørte = Object.values(steder).filter(erRørt);
  return {
    værktøj:'arytmi-rekognoscering', version:1,
    eksporteret:new Date().toISOString(),
    antalSteder:rørte.length, antalBilleder:medData.length,
    steder:rørte.map(s => ({...s, stop: findStop(s.id) || null})),
    billeder:medData
  };
}

async function gemTilDrive(){
  flash('Samler data …', 1500);
  const pakke = await byggEksport();
  if(!pakke.antalSteder){ flash('Der er ikke registreret noget endnu'); return; }
  const blob = new Blob([JSON.stringify(pakke, null, 1)], {type:'application/json'});
  const navn = `arytmi-recon-${new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')}.json`;
  const fil = new File([blob], navn, {type:'application/json'});

  // Delearket lader dig vælge "Gem i Filer" → Google Drive → recon
  if(navigator.canShare?.({files:[fil]})){
    try{
      await navigator.share({files:[fil], title:'Arytmi rekognoscering'});
      flash(`${pakke.antalSteder} steder og ${pakke.antalBilleder} billeder delt`);
      return;
    }catch(e){ if(e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = navn; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  flash(`Hentet: ${navn}`, 4000);
}

/* ---------------- skærm: ruten ---------------- */
const MÆRKE = {egnet:['m-egnet','Egnet'], maaske:['m-maaske','Måske'], uegnet:['m-uegnet','Uegnet']};

function tegnRute(){
  const stop = katalog();
  const rørte = stop.filter(s => erRørt(steder[s.id])).length;
  const grupper = [
    ['weekend1','Weekend 1 · Hvide Sande-korridoren','Fredag 31/7 – søndag 2/8'],
    ['weekend2','Weekend 2 · Thy og nordvest','Fredag 7/8 – søndag 9/8'],
    ['eget','Egne fund','Steder I selv faldt over undervejs']
  ];

  let h = `<div class="fremdrift">${rørte} af ${stop.length} steder besøgt</div>`;
  for(const [nøgle, titel, under] of grupper){
    const i = stop.filter(s => s.weekend === nøgle);
    if(!i.length && nøgle === 'eget') continue;
    h += `<div class="side"><div class="etiket">${esc(under)}</div>
          <h2 style="margin:5px 0 12px">${esc(titel)}</h2>`;
    for(const s of i){
      const r = steder[s.id];
      const [kl, tekst] = MÆRKE[r?.dom] || ['m-ny','Ikke set'];
      const n = s.naer || {};
      const dele = [];
      if(n.toilet)  dele.push(`toilet ${n.toilet.m} m`);
      if(n.udsigt)  dele.push(`udsigt ${n.udsigt.m} m`);
      if(n.vand)    dele.push(`vand ${n.vand.m} m`);
      if(s.kyst_km != null) dele.push(`${s.kyst_km} km fra havet`);
      h += `<button class="stop" data-gå="${esc(s.id)}" ${r?.dom ? `data-dom="${r.dom}"` : ''}>
        <div class="krop">
          <div class="navn">${esc(s.navn)}</div>
          <div class="meta">${esc(dele.join(' · ') || 'Eget fund')}</div>
        </div><span class="mærke ${kl}">${tekst}</span></button>`;
    }
    h += `</div>`;
  }

  h += `<div class="skel"></div>
    <div class="knap-rk"><a class="knap sekundær" href="turplan.html">Læs turplanen</a></div>
    <div class="felt"><button class="knap sekundær" data-handling="hent-kort">Hent kort til turen</button>
    <div class="hint" style="margin-top:7px">Tryk mens I har wifi. Så virker kortet også uden dækning ude ved kysten.</div></div>
    <div class="advarsel"><b>Husk reglen</b>Bilen skal bruges som bil — ikke som campingplads.
      Intet bord, stole eller markise udenfor. Så er I lovligt parkeret de fleste steder.
      Kig altid efter skilte om natparkering, og efter bomme der lukker om aftenen.</div>`;
  return h;
}

/* ---------------- skærm: stedet ---------------- */
const TJEKPUNKTER = [
  ['skilt',    'Forbudsskilt mod overnatning?', 'Kryds af hvis der ER et skilt'],
  ['bom',      'Bom der lukker om natten?',     'Kryds af hvis der ER en bom'],
  ['fast',     'Fast underlag',                 'Grus eller asfalt — ikke sand'],
  ['plan',     'Bilen står plant',              'Vigtigt for at kunne sove'],
  ['stille',   'Stille om natten',              'Ingen vej, havn eller natklub tæt på'],
  ['moerkt',   'Mørkt',                         'Ingen lygte lige over bilen'],
  ['daekning', 'Mobildækning'],
];
const ØNSKER = [
  ['lys',      'Lyset',    [['solopgang','Solopgang'],['solnedgang','Solnedgang']]],
  ['natur',    'Naturen',  [['vand','Vand'],['land','Land']]],
  ['stemning', 'Stemning', [['isoleret','Isoleret'],['livligt','Livligt']]],
];
const FACILITETER = [
  ['toilet',    'Toilet',      'Fx: Offentligt toilet ved slusen, 600 m, åbent hele døgnet'],
  ['handel',    'Indkøb',      'Fx: SuperBrugsen, 1,2 km, 8–20'],
  ['aftensmad', 'Aftensmad',   'Fx: Fiskehuset ved havnen, 11–19.30'],
  ['morgen',    'Morgenkaffe', 'Fx: Bageriet, 900 m, åbner 6.30'],
];

function tegnSted(){
  const s = findStop(aktivtId);
  const r = reg(aktivtId);
  if(!s) return `<div class="tom">Stedet findes ikke længere.</div>`;

  const p = r.punkt;
  let h = `<div id="kort"></div>
    <div class="koord">
      <span>${p ? `<b>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</b>` : 'Intet punkt sat endnu'}</span>
      <span class="noejagtig">${p ? (p.sat === 'gps' ? `GPS ±${Math.round(p.nøjagtighed || 0)} m` : 'sat på kortet') : ''}</span>
    </div>
    <div class="kort-hjælp">Tryk på kortet dér hvor bilen skal holde — eller træk prikken. Det er punktet der ryger i databanken, ikke hvor du står.</div>
    ${!p ? `<div class="advarsel"><b>Punktet mangler</b>${s.kilde === 'eget'
      ? 'Kortet står midt på ruten, ikke hvor I er. Find stedet og tryk på det — eller prøv "Brug min position" igen.'
      : 'Sæt punktet dér hvor bilen holder, så koordinaten passer med virkeligheden.'}</div>` : ''}
    <div class="knap-rk">
      <button class="knap sekundær" data-handling="gps">Brug min position</button>
      <a class="knap sekundær" href="https://maps.apple.com/?daddr=${s.lat},${s.lon}&dirflg=d" target="_blank" rel="noopener">Naviger hertil</a>
    </div>`;

  if(s.beskrivelse || s.org){
    h += `<div class="felt"><div class="hint" style="margin:0">
      ${s.beskrivelse ? esc(s.beskrivelse) + '<br>' : ''}
      ${s.org ? '<span style="opacity:.75">Ansvarlig: ' + esc(s.org) + (s.betaling ? ' · betaling: ' + esc(s.betaling) : '') + '</span>' : ''}
    </div></div>`;
  }

  h += `<div class="felt"><label>Kan man sove her?</label>
    <div class="valg dom">${['egnet','maaske','uegnet'].map(v =>
      `<button data-ønske="dom" data-v="${v}" aria-pressed="${r.dom === v}">${MÆRKE[v][1]}</button>`).join('')}</div></div>

    <div class="felt"><label for="hvorfor">Hvorfor?</label>
      <div class="hint">Én linje. Det er den I husker stedet på.</div>
      <input type="text" id="hvorfor" data-tekst="hvorfor" value="${esc(r.hvorfor)}" placeholder="Fx: Klitten dækker for vinden, og der er frit mod vest"></div>

    <div class="felt"><label>Tjek på stedet</label><div class="tjek">
      ${TJEKPUNKTER.map(([k, t, n]) => `<button data-tjek="${k}" aria-pressed="${!!r.tjek[k]}">
        <span class="boks"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span>
        <span class="t">${esc(t)}${n ? `<br><span class="n">${esc(n)}</span>` : ''}</span></button>`).join('')}
    </div></div>

    <div class="felt"><label for="oplevelse">Oplevelsen</label>
      <div class="hint">Skriv frit. Det her bliver til destinationsteksten, når I kommer hjem — så tag lyden, lyset og hvad I lavede med.</div>
      <textarea id="oplevelse" data-tekst="oplevelse" placeholder="Hvad så, hørte og mærkede I?">${esc(r.oplevelse)}</textarea></div>`;

  h += `<div class="felt"><label>Billeder</label>
    <div class="hint">Gemmes på telefonen med det samme. Video: optag med det almindelige kamera og tryk på knappen nedenfor — så finder vi optagelsen bagefter.</div>
    <div class="billeder" id="billeder"></div>
    <input type="file" id="filvælger" accept="image/*" multiple hidden></div>
    <div class="knap-rk"><button class="knap sekundær" data-handling="videomærke">Sæt videomærke${r.videomærker.length ? ` (${r.videomærker.length})` : ''}</button></div>`;

  h += ØNSKER.map(([nøgle, titel, valg]) => `<div class="felt"><label>${esc(titel)}</label>
    <div class="valg">${valg.map(([v, t]) =>
      `<button data-ønske="${nøgle}" data-v="${v}" aria-pressed="${r.ønsker[nøgle] === v}">${esc(t)}</button>`).join('')}</div></div>`).join('');

  h += `<div class="skel"></div><div class="felt"><label>Hvad er der i nærheden?</label>
    <div class="hint">De fire felter appen viser, når nogen vælger stedet. Lad stå tomt hvis I ikke nåede at tjekke.</div></div>`
    + FACILITETER.map(([k, t, ph]) => `<div class="felt"><label for="f-${k}">${esc(t)}</label>
      <input type="text" id="f-${k}" data-fac="${k}" value="${esc(r.faciliteter[k])}" placeholder="${esc(ph)}"></div>`).join('');

  h += `<div class="skel"></div><div class="knap-rk"><button class="knap sekundær" data-handling="til-rute">Tilbage til ruten</button></div>`;
  return h;
}

/* ---------------- skærm: nyt sted ---------------- */
function tegnNyt(){
  return `<div class="side"><h1>Nyt sted</h1>
    <p class="dæmpet" style="margin-top:8px">Til de pladser I selv falder over. Giv det et navn — resten udfylder I på selve stedet.</p></div>
    <div class="felt"><label for="nytnavn">Hvad skal vi kalde det?</label>
      <input type="text" id="nytnavn" placeholder="Fx: Molen ved Thorsminde" autocomplete="off"></div>
    <div class="felt"><div class="hint">Positionen tages fra din GPS nu og kan rettes på kortet bagefter.</div></div>
    <div class="knap-rk"><button class="knap rav" data-handling="opret">Opret her hvor jeg står</button></div>
    <div class="knap-rk"><button class="knap sekundær" data-handling="til-rute">Fortryd</button></div>`;
}

/* ---------------- tegning og navigation ---------------- */
function tegn(){
  if(kort){ kort.remove(); kort = null; markør = null; }
  const s = skærm === 'sted' ? findStop(aktivtId) : null;

  $('#top').innerHTML = skærm === 'rute'
    ? `<div style="flex:1"><div class="etiket">Arytmi</div><h1>Rekognoscering</h1></div>`
    : `<button class="tilbage" data-handling="til-rute" aria-label="Tilbage">
         <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>
       <h1>${esc(skærm === 'nyt' ? 'Nyt sted' : (s ? s.navn : ''))}</h1>`;

  $('#indhold').innerHTML = skærm === 'rute' ? tegnRute() : skærm === 'nyt' ? tegnNyt() : tegnSted();
  $('#indhold').scrollTop = 0;

  $('#bundnav').innerHTML = `
    <button class="knap sekundær" data-handling="til-rute" style="flex:1">Ruten</button>
    <button class="knap sekundær" data-handling="nyt" style="flex:1">Nyt sted</button>
    <button class="knap rav" data-handling="drive" style="flex:1.3">Gem til Drive</button>`;

  if(skærm === 'sted'){ opsætKort(); visBilleder(); }
  if(skærm === 'nyt') setTimeout(() => $('#nytnavn')?.focus(), 60);
}

function opsætKort(){
  const s = findStop(aktivtId), r = reg(aktivtId);
  const start = r.punkt || {lat:s.lat, lon:s.lon};
  kort = L.map('kort', {zoomControl:true, attributionControl:false}).setView([start.lat, start.lon], 16);
  new FliseLag('', {maxZoom:19, minZoom:10}).setUrl('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(kort);

  const ikon = L.divIcon({className:'', html:'<div class="punkt-markoer"></div>', iconSize:[22,22], iconAnchor:[11,11]});
  markør = L.marker([start.lat, start.lon], {icon:ikon, draggable:true}).addTo(kort);
  markør.on('dragend', () => sætPunkt(markør.getLatLng().lat, markør.getLatLng().lng, 'kort'));
  kort.on('click', e => { markør.setLatLng(e.latlng); sætPunkt(e.latlng.lat, e.latlng.lng, 'kort'); });
  setTimeout(() => kort && kort.invalidateSize(), 120);
}

function sætPunkt(lat, lon, sat, nøjagtighed){
  const r = reg(aktivtId);
  r.punkt = {lat, lon, sat, nøjagtighed: nøjagtighed ?? null, tid:new Date().toISOString()};
  gem(aktivtId);
  const k = document.querySelector('.koord');
  if(k) k.innerHTML = `<span><b>${lat.toFixed(5)}, ${lon.toFixed(5)}</b></span>
    <span class="noejagtig">${sat === 'gps' ? `GPS ±${Math.round(nøjagtighed || 0)} m` : 'sat på kortet'}</span>`;
}

/* GPS i to forsøg. Høj nøjagtighed først; timer den ud (indendørs, eller når iOS
   strømbesparing struber positionstjenesten), prøves der igen med lavere krav,
   længere frist og en accepteret cachet position. Ét stramt forsøg var årsagen
   til "Kunne ikke finde positionen" på en telefon med tændt GPS. */
function findPosition(){
  return new Promise((ok, fejl) => {
    if(!navigator.geolocation){ fejl({code:0}); return; }
    navigator.geolocation.getCurrentPosition(ok, første => {
      if(første.code === 1){ fejl(første); return; }   // afvist — flere forsøg hjælper ikke
      navigator.geolocation.getCurrentPosition(ok, fejl,
        {enableHighAccuracy:false, timeout:30000, maximumAge:120000});
    }, {enableHighAccuracy:true, timeout:12000, maximumAge:0});
  });
}

const gpsFejlTekst = e =>
  e.code === 1 ? 'Safari har ikke adgang til din position. Indstillinger → Safari → Placering' :
  e.code === 3 ? 'Positionen tog for lang tid. Prøv udenfor, eller slå strømbesparing fra' :
  e.code === 0 ? 'Telefonen giver ikke adgang til position' :
                 'Positionen er ikke tilgængelig lige nu';

async function brugGPS(){
  flash('Finder din position …', 2500);
  try{
    const p = await findPosition();
    const {latitude:lat, longitude:lon, accuracy:nøj} = p.coords;
    sætPunkt(lat, lon, 'gps', nøj);
    if(kort && markør){ markør.setLatLng([lat, lon]); kort.setView([lat, lon], 17); }
    flash(`Position sat — nøjagtighed ±${Math.round(nøj)} m`);
  }catch(e){
    flash(gpsFejlTekst(e) + '. Du kan sætte punktet på kortet i stedet.', 6000);
  }
}

async function visBilleder(){
  const r = reg(aktivtId), boks = $('#billeder');
  if(!boks) return;
  let h = '';
  for(const bid of r.billeder){
    const b = await hent('billeder', bid);
    if(!b?.blob) continue;
    h += `<figure><img src="${URL.createObjectURL(b.blob)}" alt="">
      <button class="slet" data-slet-billede="${esc(bid)}" aria-label="Slet billede">×</button></figure>`;
  }
  h += `<button class="tilfoej-bil" data-handling="tilføj-billede">
    <svg viewBox="0 0 24 24"><path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.4"/></svg>
    Tag billede</button>`;
  boks.innerHTML = h;
}

function gåTil(s, id){ skærm = s; if(id) aktivtId = id; tegn(); }

/* ---------------- hændelser ---------------- */
document.addEventListener('click', async e => {
  const g = e.target.closest('[data-gå]');
  if(g){ gåTil('sted', g.dataset.gå); return; }

  const b = e.target.closest('[data-handling]');
  if(b){
    const h = b.dataset.handling;
    if(h === 'til-rute') gåTil('rute');
    else if(h === 'nyt') gåTil('nyt');
    else if(h === 'gps') brugGPS();
    else if(h === 'drive') gemTilDrive();
    else if(h === 'hent-kort') hentKortTilTuren(b);
    else if(h === 'tilføj-billede') $('#filvælger')?.click();
    else if(h === 'videomærke'){
      const r = reg(aktivtId);
      r.videomærker.push(new Date().toISOString());
      await gem(aktivtId);
      flash(`Videomærke sat kl. ${new Date().toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit'})}`);
      b.textContent = `Sæt videomærke (${r.videomærker.length})`;
    }
    else if(h === 'opret') opretEget();
    return;
  }

  const ø = e.target.closest('[data-ønske]');
  if(ø){
    const r = reg(aktivtId), felt = ø.dataset.ønske, v = ø.dataset.v;
    if(felt === 'dom') r.dom = r.dom === v ? null : v;
    else r.ønsker[felt] = r.ønsker[felt] === v ? null : v;
    await gem(aktivtId);
    ø.parentElement.querySelectorAll('[data-ønske]').forEach(k =>
      k.setAttribute('aria-pressed', String(felt === 'dom' ? r.dom === k.dataset.v : r.ønsker[felt] === k.dataset.v)));
    return;
  }

  const t = e.target.closest('[data-tjek]');
  if(t){
    const r = reg(aktivtId), k = t.dataset.tjek;
    r.tjek[k] = !r.tjek[k];
    await gem(aktivtId);
    t.setAttribute('aria-pressed', String(!!r.tjek[k]));
    return;
  }

  const sb = e.target.closest('[data-slet-billede]');
  if(sb){
    const bid = sb.dataset.sletBillede, r = reg(aktivtId);
    r.billeder = r.billeder.filter(x => x !== bid);
    await slet('billeder', bid);
    await gem(aktivtId);
    visBilleder();
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if(t.dataset.tekst){ reg(aktivtId)[t.dataset.tekst] = t.value; gemSnart(aktivtId); }
  else if(t.dataset.fac){ reg(aktivtId).faciliteter[t.dataset.fac] = t.value; gemSnart(aktivtId); }
});

document.addEventListener('change', e => {
  if(e.target.id === 'filvælger' && e.target.files?.length){
    tilføjBilleder(aktivtId, [...e.target.files]);
    e.target.value = '';
  }
});

/* Midt i kandidatfeltet — bruges kun som startudsnit, når GPS ikke svarer,
   så kortet åbner et sted man kan genkende i stedet for midt i Atlanterhavet. */
function ruteMidte(){
  const alle = [...RUTE.weekend1, ...RUTE.weekend2];
  return { lat: alle.reduce((s,x)=>s+x.lat,0)/alle.length,
           lon: alle.reduce((s,x)=>s+x.lon,0)/alle.length };
}

/* GPS er en bekvemmelighed, ikke en betingelse. Stedet oprettes uanset —
   ellers kan en telefon uden signal spærre for at registrere det fund,
   man står midt i. Punktet kan altid sættes på kortet bagefter. */
async function opretEget(){
  const navn = ($('#nytnavn')?.value || '').trim();
  if(!navn){ flash('Giv stedet et navn først'); return; }

  const id = `eget-${Date.now()}`;
  const r = reg(id);
  flash('Finder din position …', 2500);
  try{
    const p = await findPosition();
    const {latitude:lat, longitude:lon, accuracy:nøj} = p.coords;
    r.egetSted = {id, navn, lat, lon, kilde:'eget'};
    r.punkt = {lat, lon, sat:'gps', nøjagtighed:nøj, tid:new Date().toISOString()};
    await gem(id);
    gåTil('sted', id);
    flash(`Stedet er oprettet — nøjagtighed ±${Math.round(nøj)} m`);
  }catch(e){
    const m = ruteMidte();
    r.egetSted = {id, navn, lat:m.lat, lon:m.lon, kilde:'eget', udenGPS:true};
    await gem(id);
    gåTil('sted', id);
    flash(gpsFejlTekst(e) + '. Stedet er oprettet — tryk på kortet dér hvor I står.', 7000);
  }
}

/* ---------------- start ---------------- */
(async function start(){
  await åbnDB();
  navigator.storage?.persist?.();          // bed iOS om ikke at smide data væk
  for(const s of await alle('steder')) steder[s.id] = s;
  tegn();
  if('serviceWorker' in navigator){
    // Når en ny udgave overtager, genindlæs ÉN gang — ellers ville man se den
    // gamle app indtil næste åbning, og det er svært at gennemskue i felten.
    let genindlæser = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(genindlæser) return;
      genindlæser = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
