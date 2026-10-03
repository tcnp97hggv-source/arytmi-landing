# Arytmi — forsiden og kundesiderne på arytmi.com

Statisk HTML til arytmi.com: forsiden (index.html), kundesiderne /aktiver, /nulstil,
/os og /liste og bagrummet i admin/. Ingen build.
Adskilt fra det private app-repo med vilje — den her skal være offentlig, appen skal ikke.

## Deploy (GitHub Pages)

1. Opret et NYT, offentligt GitHub-repo, fx `arytmi-landing`.
2. Læg de 6 filer i denne mappe (index.html, CNAME, logo.png, bil-streg.png,
   favicon-32.png, apple-touch-icon-180.png) i roden af det repo. Push til `main`.
3. Repo → Settings → Pages → Source: `main` / `/ (root)`.
4. Samme sted under "Custom domain": skriv `arytmi.com` (CNAME-filen har den allerede,
   men GitHub vil bekræfte det i UI'et). Vent til det grønne flueben for DNS/certifikat.

## DNS hos Simply.com

Tilføj disse (ved siden af de eksisterende MX/TXT-records til mail — ingen konflikt):

- A-records, Host `@`, fire stk:
  185.199.108.153
  185.199.109.153
  185.199.110.153
  185.199.111.153
- CNAME, Host `www`, Værdi: `tcnp97hggv-source.github.io`

Herefter virker både arytmi.com og www.arytmi.com. GitHub udsteder selv et gratis
SSL-certifikat, når DNS er slået igennem (kan tage op til et par timer).

## Forsiden og funnelen — 3. oktober 2026

Forsiden er Arytmis hjemmeside: den fortæller, hvad Arytmi er (ordet arytme, en tur
fra eftermiddag til morgen, madrassen og appen, stederne, hvem det er til) og sender
så kunden videre til funnelen. Den er **tidløs** — intet tema, ingen kampagne.

- **Funnelen skifter, forsiden gør ikke.** Alle knapper peger på `shop` (`shop.html`),
  som sender videre. **Skift funnel = ret adressen i `shop.html`** (to steder i filen).
  Rør ikke knapperne i index.html. `arytmi.com/shop` kan også bruges på tryk og i opslag.
- **Kunden lander i toppen af funnelen** (`https://shop.arytmi.com/`, Kennet 3/10), så
  hun ser det tema, der køres. Et anker som `#whatyouget` blev prøvet og fravalgt: det
  sprang temaet over og forsvandt lydløst, hvis sektionen blev omdøbt i ClickFunnels.
- **Ingen pris og intet købsord på forsiden.** Appens "Opret en konto" fører hertil,
  og Apple 3.1.1 / Googles external offers rammer links fra appen, der fører til et køb.
- **Ingen konto/login i toppen.** Hjælpen til eksisterende kunder står i footeren.
- Fotoene er fra appens egne ture, kun beskåret og skaleret (ingen metadata); opskriften
  står som kommentar i index.html. Vis aldrig et foto med en læsbar nummerplade.
- **Ingen stednavne** — ikke i tekst, alt-tekst eller filnavn (repoet er offentligt).
  Kortet over, hvilket foto der er hvilket sted, står i app-repoets Arytmi-status.md.
- Skrifterne i `fonts/` er kopieret uændret fra app-repoet med OFL-licenserne.

## Opdatere siden senere

Ret index.html, commit, push — Pages opdaterer automatisk inden for et par minutter.

## Indholdspolitik (CSP) — tilføjet 11. september 2026

Hver side har et `<meta http-equiv="Content-Security-Policy">` øverst i `<head>`.
Den siger, hvad browseren overhovedet må hente: alt er `none` som udgangspunkt,
og så åbnes præcis det, siden bruger — egne billeder, sit eget inline `<style>`
og `<script>`, og for de fire app-sider et kald til Supabase-projektet. Forsiden har
desuden `font-src 'self'` til sine egne skrifter i `fonts/`; uden den falder den lydløst
tilbage til systemskrift.

**Tre ting er værd at kende, hvis du retter i siderne:**

1. **`connect-src` peger på Supabase-projektets adresse.** Skiftes projektet —
   fx ved en genskabelse fra backup — skal den linje med i hver af de fire
   sider. Ellers kan siden ikke tale med serveren, og fejlen står kun i
   browserkonsollen.
2. **`form-action 'none'`** er med vilje. Formularerne sendes af JavaScript, som
   altid kalder `preventDefault()`. Uden linjen ville en formular uden
   JavaScript submitte til sig selv med GET — og på `aktiver.html` og
   `nulstil.html` ville kodeordet så stå i adresselinjen og i historikken.
3. **`frame-ancestors` virker ikke i et meta-tag.** Den ignoreres, og GitHub
   Pages kan ikke sætte HTTP-headers. Siderne kan altså stadig lægges i en
   iframe af en fremmed. Skal det lukkes, kræver det en vært, der kan sætte
   headers (Cloudflare Pages, Netlify).

Politikken bruger `'unsafe-inline'` frem for hashes. Hashes ville være
strengere, men de betyder også, at siden holder op med at virke — lydløst —
hver gang nogen retter et komma i scriptet og glemmer at regne hashen om.
Beskyttelsen mod indsprøjtet HTML ligger et andet sted og er reel: siderne
skriver **altid** med `textContent`, aldrig `innerHTML`.

Prøvet af 11/9: alle fem sider indlæst lokalt med politikken på — styling,
billeder, inline script og kaldet til Supabase virker, og der er ingen
CSP-overtrædelser i konsollen.
