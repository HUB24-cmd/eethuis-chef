# Eetcafé & Lunchroom Chef

Bestelsite voor Eetcafé & Lunchroom Chef, Leyweg 920 D, Den Haag. Draait op Netlify, gekoppeld aan deze GitHub-repository: elke wijziging op `main` staat binnen een minuut live.

## Wat waar staat
| Bestand | Wat |
|---|---|
| `index.html` | De website |
| `menu.js` | Menu en prijzen (ook de bestel-server rekent hiermee) |
| `shop.config.js` | Instellingen: openingstijden, afhalen, bezorgen, WhatsApp |
| `img/` | Foto's (WebP) |
| `netlify/functions/` | Bestel-server: `order`, `status`, `push` (Buckaroo) |
| `netlify/lib/shop.mjs` | Gedeelde code: Buckaroo, opslag, e-mail |

## Hoe bestellen werkt
- **Bezorgen**: via Thuisbezorgd (`delivery.mode: "thuisbezorgd"`). Met `"own"` loopt bezorgen via deze site.
- **Afhalen**: staat uit (`pickup.enabled: false`) tot Buckaroo is ingesteld. Daarna `true`: bestellen en betalen op de site.

## Netlify-instellingen (alleen voor online betalen)
Site configuration > Environment variables. Deze waarden komen nooit in de code.

| Variabele | Waarde |
|---|---|
| `BUCKAROO_WEBSITE_KEY` | uit Buckaroo Plaza |
| `BUCKAROO_SECRET_KEY` | uit Buckaroo Plaza |
| `BUCKAROO_LIVE` | `false` om te testen, `true` voor echt geld |
| `BUCKAROO_METHODS` | `ideal` of bv. `ideal,bancontactmrcash,creditcard` |
| `TOKEN_SECRET` | lange willekeurige tekst (min. 32 tekens) |
| `SITE_URL` | `https://www.eethuischef.nl` |
| `RESEND_API_KEY` | van resend.com, voor de bevestigingsmails |
| `MAIL_FROM` | `info@eethuischef.nl` (domein eerst verifiëren in Resend) |
| `MAIL_TO` | `info@eethuischef.nl` |

In Buckaroo Plaza de push-URL instellen op `https://www.eethuischef.nl/api/push`.

## Beveiliging
- Prijzen en opties komen op de server uit `menu.js`; de browser kan geen prijs doorgeven.
- Een bestelling telt pas als betaald als de server de status zelf bij Buckaroo ophaalt, met kloppend bedrag en bestelnummer. Een nagemaakte melding doet niets.
- Bevestigingsmails gaan maar één keer de deur uit.

## Nog te doen
- Telefoon/WhatsApp, KvK- en btw-nummer van het restaurant invullen.
- Privacyverklaring, algemene voorwaarden en allergeneninformatie.
- Fase 2: Buckaroo-account, testbetaling, daarna live.

## Domein (eethuischef.nl bij Strato)
De e-mail (info@eethuischef.nl) draait bij Strato, dus de DNS blijft bij Strato. Alleen de website wijst naar Netlify:
- `www` → CNAME naar `<sitenaam>.netlify.app`
- `@` (zonder www) → A-record naar `75.2.60.5`
De MX-records (mail) niet aanraken.
