/* =============================================================
   NUMMERPLADERNE SLØRES, FØR BILLEDET LÆGGES OP (24/9)
   =============================================================

   Kennet 24/9: "Du skal sløre nummerplader på billederne så folk ikke kan
   se vores nummerplade. Hvis du kan lave en automatik så den selv gør det
   fremadrettet kunne det være fedt." Alle plader, ikke kun vores egen.

   HER, OG IKKE PÅ SERVEREN BAGEFTER. `stedbilleder` er offentlig. Et
   billede, der blev sløret af et job en time efter uploaden, har ligget
   derude en time med pladen skarp. Det skal aldrig nå at ligge der.

   MODELLEN er `yolo-v9-t-640-license-plates-end2end.onnx` fra
   github.com/ankandrew/open-image-models (MIT). Motoren er ONNX Runtime
   Web 1.30.0 (Microsoft, MIT). Begge ligger i `vendor/` og hentes FØRST,
   når nogen lægger et billede op — 22 MB, som ingen andre skal betale for.

   ⚠️ DEN SAMME LOGIK STÅR I `vaerktoej/sloer-nummerplader.mjs` i
   app-repoet, der slørede de 220 billeder, der lå deroppe 24/9. Tallene
   herunder skal være de samme begge steder. Grundene til hvert af dem står
   dér — de er målt på de 220 billeder og set efter i hånden.

   Ét sted er det bevidst anderledes: sløringen. Scriptet pixelerer og
   slører med sharp. Her skaleres stykket ned til en håndfuld pixels og op
   igen MED udjævning — det giver en blød plet uden blokke og uden
   `ctx.filter`, som ikke kan regnes med i alle Safari-udgaver.
   ============================================================= */
(function(){
  'use strict';

  var STR = 640;
  var SIKKERHED = 0.2;
  var KANT = 0.25;
  var MAKS_BREDDE = 0.33, MAKS_HOEJDE = 0.25, MAKS_SMAL = 0.04;
  var KVALITET = 0.82;

  var MODEL = 'vendor/nummerplader/yolo-v9-t-640-license-plates-end2end.onnx';
  var ORT = 'vendor/ort/ort.wasm.min.js';

  var session = null;

  /* Hentes én gang, og kun når der skal bruges. Går det galt, glemmes
     løftet igen, så næste forsøg prøver forfra i stedet for at arve
     fejlen for evigt. */
  function hent(){
    if(session) return session;
    session = new Promise(function(ok, nej){
      if(window.ort) return ok();
      var s = document.createElement('script');
      s.src = ORT;
      s.onload = function(){ ok(); };
      s.onerror = function(){ nej(new Error('Motoren til nummerpladerne kunne ikke hentes. Tjek forbindelsen og prøv igen.')); };
      document.head.appendChild(s);
    }).then(function(){
      /* Én tråd. Flere kræver, at siden er "cross-origin isolated", og det
         kan GitHub Pages ikke sætte. Uden linjen prøver motoren alligevel
         og falder lydløst tilbage — med en advarsel i konsollen, som ligner
         en fejl. */
      window.ort.env.wasm.numThreads = 1;
      window.ort.env.wasm.wasmPaths = new URL('vendor/ort/', location.href).href;
      return window.ort.InferenceSession.create(new URL(MODEL, location.href).href);
    });
    session.catch(function(){ session = null; });
    return session;
  }

  function lignerEnPlade(k, B, H){
    var b = k.x2 - k.x1, h = k.y2 - k.y1;
    if(!(b > 0 && h > 0 && b <= B * MAKS_BREDDE && h <= H * MAKS_HOEJDE)) return false;
    return b >= h || b <= B * MAKS_SMAL;
  }

  function overlap(a, b){
    var x = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
    var y = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
    var mindst = Math.min((a.x2 - a.x1) * (a.y2 - a.y1), (b.x2 - b.x1) * (b.y2 - b.y1));
    return mindst > 0 ? (x * y) / mindst : 0;
  }

  /* Ét kig på et udsnit. Letterbox til 640 med grå (114) kant, RGB, 0-1,
     CHW — modellens egen forbehandling. Svarer i HELE billedets koordinater. */
  function kig(s, kilde, ux, uy, ub, uh){
    var r = Math.min(STR / ub, STR / uh);
    var nb = Math.round(ub * r), nh = Math.round(uh * r);
    var dw = (STR - nb) / 2, dh = (STR - nh) / 2;
    var c = document.createElement('canvas');
    c.width = STR; c.height = STR;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = 'rgb(114,114,114)';
    x.fillRect(0, 0, STR, STR);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(kilde, ux, uy, ub, uh, Math.round(dw - 0.1), Math.round(dh - 0.1), nb, nh);
    var d = x.getImageData(0, 0, STR, STR).data;
    var N = STR * STR, t = new Float32Array(3 * N);
    for(var i = 0; i < N; i++){
      t[i] = d[i * 4] / 255;
      t[N + i] = d[i * 4 + 1] / 255;
      t[2 * N + i] = d[i * 4 + 2] / 255;
    }
    var ind = {};
    ind[s.inputNames[0]] = new window.ort.Tensor('float32', t, [1, 3, STR, STR]);
    return s.run(ind).then(function(ud){
      var p = ud[s.outputNames[0]], n = p.dims[0], v = p.data, kasser = [];
      for(var k = 0; k < n; k++){
        var sk = v[k * 7 + 6];
        if(sk < SIKKERHED) continue;
        kasser.push({
          x1: ux + (v[k * 7 + 1] - dw) / r, y1: uy + (v[k * 7 + 2] - dh) / r,
          x2: ux + (v[k * 7 + 3] - dw) / r, y2: uy + (v[k * 7 + 4] - dh) / r,
          sikkerhed: sk
        });
      }
      return kasser;
    });
  }

  /* Hele billedet og fire overlappende fliser på 60 %. Uden fliserne ser
     modellen ikke pladen på en bil tyve meter væk — målt 24/9: 21 plader
     uden, 33 med, på de samme 220 billeder. */
  function find(s, kilde, B, H){
    var fb = Math.round(B * 0.6), fh = Math.round(H * 0.6);
    var udsnit = [[0, 0, B, H], [0, 0, fb, fh], [B - fb, 0, fb, fh], [0, H - fh, fb, fh], [B - fb, H - fh, fb, fh]];
    var alle = [];
    return udsnit.reduce(function(kæde, u){
      return kæde.then(function(){
        return kig(s, kilde, u[0], u[1], u[2], u[3]).then(function(k){ alle = alle.concat(k); });
      });
    }, Promise.resolve()).then(function(){
      var kasser = [];
      alle.filter(function(k){ return lignerEnPlade(k, B, H); })
        .sort(function(a, b){ return b.sikkerhed - a.sikkerhed; })
        .forEach(function(k){
          var samme = null;
          for(var i = 0; i < kasser.length; i++) if(overlap(kasser[i], k) > 0.3){ samme = kasser[i]; break; }
          if(!samme){ kasser.push(k); return; }
          samme.x1 = Math.min(samme.x1, k.x1); samme.y1 = Math.min(samme.y1, k.y1);
          samme.x2 = Math.max(samme.x2, k.x2); samme.y2 = Math.max(samme.y2, k.y2);
        });
      return kasser;
    });
  }

  function slør(lær, kasser){
    var c = lær.getContext('2d');
    var B = lær.width, H = lær.height;
    kasser.forEach(function(k){
      var kb = k.x2 - k.x1, kh = k.y2 - k.y1;
      var left = Math.max(0, Math.floor(k.x1 - kb * KANT));
      var top = Math.max(0, Math.floor(k.y1 - kh * KANT));
      var w = Math.min(B - left, Math.ceil(kb * (1 + 2 * KANT)));
      var h = Math.min(H - top, Math.ceil(kh * (1 + 2 * KANT)));
      if(w < 2 || h < 2) return;
      // Ned til cirka tre pixels på den korte led: der er ikke plads til et bogstav.
      var blok = Math.max(1, Math.round(Math.min(w, h) / 3));
      var lille = document.createElement('canvas');
      lille.width = Math.max(1, Math.round(w / blok));
      lille.height = Math.max(1, Math.round(h / blok));
      var lc = lille.getContext('2d');
      lc.imageSmoothingEnabled = true;
      lc.imageSmoothingQuality = 'high';
      lc.drawImage(lær, left, top, w, h, 0, 0, lille.width, lille.height);
      c.save();
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(lille, 0, 0, lille.width, lille.height, left, top, w, h);
      c.restore();
    });
  }

  /* Svarer med { data, antal }. `data` er et nyt JPEG, hvis der var plader,
     og ellers det, der kom ind — et billede uden plader skal ikke kodes om
     en gang til for ingenting. */
  window.sloerPlader = function(blob){
    return hent().then(function(s){
      return createImageBitmap(blob, { imageOrientation: 'from-image' }).then(function(bm){
        var lær = document.createElement('canvas');
        lær.width = bm.width; lær.height = bm.height;
        lær.getContext('2d').drawImage(bm, 0, 0);
        bm.close();
        return find(s, lær, lær.width, lær.height).then(function(kasser){
          if(!kasser.length) return { data: blob, antal: 0, kasser: [] };
          slør(lær, kasser);
          return new Promise(function(ok, nej){
            lær.toBlob(function(ny){
              if(!ny) return nej(new Error('Billedet kunne ikke gemmes efter sløringen.'));
              ok({ data: ny, antal: kasser.length, kasser: kasser });
            }, 'image/jpeg', KVALITET);
          });
        });
      });
    });
  };
})();
