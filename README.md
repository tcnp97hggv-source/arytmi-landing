# Arytmi — kommer snart-side

Simpel, statisk "kommer snart"-side til arytmi.com. Ingen build, bare index.html + billeder.
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

## Opdatere siden senere

Ret index.html, commit, push — Pages opdaterer automatisk inden for et par minutter.
