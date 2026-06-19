# 6van3 Capital — website

Landingspagina voor **www.6van3capital.nl**: foto-achtergrond, menubalk linksboven
(in kleine hoofdletters) en in het midden het logo met de naam *6van3 Capital*.

## Bestanden

```
6van3capital/
├── index.html          ← de landingspagina
├── assets/
│   └── logo.svg        ← logo (vervang door je eigen versie)
└── README.md           ← dit bestand
```

## Lokaal bekijken

Open `index.html` in je browser. Of start een mini-server:

```bash
cd 6van3capital
python3 -m http.server 8080
# open http://localhost:8080
```

## Aanpassen

- **Eigen achtergrondfoto:** zet je foto in `assets/` (bijv. `achtergrond.jpg`) en
  vervang in `index.html` de Unsplash-URL bij `.hero { background: ... }` door
  `url("assets/achtergrond.jpg")`. Gebruik een foto van minstens 2000px breed.
- **Eigen logo:** overschrijf `assets/logo.svg` (of gebruik een PNG en pas de
  `<img src=...>` aan).
- **Menu-items / teksten:** pas aan in `index.html` (zoek op `nav class="menu"`
  en op de `<h1>`).
- **Kleuren:** bovenin de CSS staan de variabelen `--gold`, `--ink`, `--paper`.

---

## 1. Domein registreren: www.6van3capital.nl

`.nl`-domeinen worden beheerd door **SIDN**. Je registreert ze niet direct bij
SIDN, maar via een **registrar** (een hostingprovider/domeinverkoper).

**Stappen:**

1. Kies een Nederlandse registrar, bijvoorbeeld:
   - TransIP, Versio, Antagonist, Hostnet, Vimexx, Mijndomein, of Cloudflare Registrar.
2. Zoek op hun site op `6van3capital.nl` en check of die vrij is.
3. Reken af (een `.nl` kost doorgaans ± **€8–15 per jaar**).
4. Vul je gegevens in als **domeinhouder** (dit wordt de officiële eigenaar —
   zet het op je eigen naam/bedrijf, niet op de provider).
5. Zet **automatisch verlengen** aan, zodat het domein niet per ongeluk verloopt.

> Tip: overweeg meteen `6van3capital.com` mee te registreren om de naam te beschermen.

**Privacy:** voor particulieren is je adres bij `.nl` standaard afgeschermd in de
WHOIS. Registreer je op bedrijfsnaam (KvK), dan zijn die gegevens wél openbaar.

---

## 2. Veilig hosten

Deze site is "statisch" (alleen HTML/CSS/JS), dus hosten is eenvoudig, goedkoop
en veilig. Twee goede routes:

### Optie A — Gratis & simpel: GitHub Pages, Netlify of Cloudflare Pages
1. Zet deze map in een Git-repository (dat is al gebeurd).
2. Koppel de repo aan **Cloudflare Pages**, **Netlify** of **GitHub Pages**.
3. Voeg je domein `6van3capital.nl` toe in het dashboard van die dienst.
4. Wijs bij je registrar de DNS naar de host (ze geven exacte records aan).
   - HTTPS (SSL-certificaat) wordt **automatisch en gratis** geregeld.

### Optie B — Klassieke webhosting
1. Neem een hostingpakket bij je registrar (TransIP, Versio, Antagonist…).
2. Upload de inhoud van deze map via het bedieningspaneel of (S)FTP naar de
   `public_html`/`www`-map.
3. Zet in het paneel een **gratis Let's Encrypt SSL-certificaat** aan.

### Beveiliging — checklist
- ✅ **HTTPS verplicht:** forceer dat `http://` doorstuurt naar `https://`.
- ✅ **SSL-certificaat** (Let's Encrypt is gratis en automatisch te verlengen).
- ✅ **DNSSEC** aanzetten bij je registrar (extra bescherming tegen DNS-vervalsing;
  `.nl` ondersteunt dit goed).
- ✅ **Sterke wachtwoorden + 2FA** op je registrar- en hosting-account
  (hier wordt je domein gestolen of niet).
- ✅ **Auto-verlengen** van domein én certificaat aan.
- ✅ **Security headers** toevoegen (HSTS, X-Content-Type-Options,
  Referrer-Policy). Bij Netlify/Cloudflare kan dit met een `_headers`-bestand.
- ✅ Overweeg **Cloudflare** ervoor als gratis CDN + basis-DDoS-bescherming.
- ✅ Houd alleen e-mail en software up-to-date als je later een CMS toevoegt.

> Voor een puur statische pagina als deze is er nauwelijks aanvalsoppervlak — de
> belangrijkste beveiliging is HTTPS + een goed beveiligd registrar-account.
