# Evidence školení

Webová aplikace nad čtyřmi exporty z evidence povinných školení (stav k 1. 10. 2026). Ukazuje, jak
jsou zaměstnanci proškolení, komu co prošlo nebo brzy vyprší, co je potřeba řešit – a **doporučí,
koho na který vypsaný termín přihlásit**, aby se kapacita využila co nejlépe.

## Co aplikace umí

| Stránka            | K čemu je                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Přehled**        | Proškolenost celkem, podle školení a útvarů (matice útvar × školení), počty lidí podle stavu.                                                   |
| **Co řešit**       | Seznam prošlých, chybějících a brzy vypršujících školení seřazený podle naléhavosti; filtry útvar, vedoucí, školení, stav.                      |
| **Zaměstnanci**    | Seznam s vyhledáváním a detail osoby: všechna povinná školení, historie absolvování, stav a termín.                                             |
| **Plán přihlášek** | Pro každý termín koho přihlásit a proč (stav, nutné do, včas / pozdě), kde chybí místa a do kdy vypsat další termín, odhad nákladů, export CSV. |
| **Kvalita dat**    | Co import opravil, s jakým předpokladem a co vyřadil – řádek po řádku, se zdůvodněním.                                                          |

Referenční datum (výchozí je dnešek v Praze), okno „brzy vyprší“ (výchozí 90 dní) i filtry jsou
v URL, takže se pohled dá poslat odkazem.

## Spuštění lokálně

Potřeba: Node.js 24, npm. Zdrojová data **nejsou v repozitáři** (obsahují osobní údaje včetně
rodných čísel) – čtyři CSV soubory je nutné nakopírovat do `data/`:

```
data/zamestnanci.csv
data/absolvovana_skoleni.csv
data/katalog_skoleni.csv
data/terminy_skoleni.csv
```

```bash
npm ci
cp apps/api/.env.example apps/api/.env
npm run dev
```

API běží na <http://localhost:3000>, webové rozhraní na <http://localhost:5173> (Vite přeposílá
`/api` na API). Lokálně je Basic Auth volitelná, v produkci povinná.

| Příkaz                                        | Co dělá                                                       |
| --------------------------------------------- | ------------------------------------------------------------- |
| `npm test`                                    | testy všech balíčků (Vitest)                                  |
| `npm run lint` / `typecheck` / `format:check` | ESLint, TypeScript, Prettier                                  |
| `npm run build` && `npm start`                | produkční sestavení; API pak servíruje i SPA (`WEB_DIST_DIR`) |

### Docker

```bash
docker build -t evidence-skoleni .
docker run --rm -p 3000:3000 -v "$PWD/data:/etc/secrets:ro" -e BASIC_AUTH_USER=hr -e BASIC_AUTH_PASSWORD=dlouhe-heslo-12+ evidence-skoleni
```

Kontejner bez dat nebo bez přihlašovacích údajů nenastartuje (chyba konfigurace má být vidět hned,
ne až při prvním požadavku).

### Konfigurace (proměnné prostředí API)

| Proměnná                                 | Výchozí                   | Význam                                                              |
| ---------------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| `DATA_DIR`                               | `../../data`              | adresář se čtyřmi CSV (v image `/etc/secrets`)                      |
| `EXPORT_DATE`                            | `2026-10-01`              | datum exportu; záznamy s pozdějším datem jsou plány, ne absolvování |
| `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD` | –                         | přihlášení k celé aplikaci; heslo min. 12 znaků; povinné v produkci |
| `PORT`, `HOST`, `LOG_LEVEL`              | `3000`, `0.0.0.0`, `info` |                                                                     |
| `WEB_DIST_DIR`                           | –                         | sestavené SPA, které API servíruje (v image nastaveno)              |

Konfigurace se validuje při startu (Zod).

## Nasazení

Render (free plán, Docker) podle [`render.yaml`](render.yaml): deploy jen po zeleném CI, health
check na `/api/health`. CSV se nahrají jako **Secret Files** (Render je připojí do `/etc/secrets`),
`BASIC_AUTH_USER` se zadá v dashboardu, heslo Render vygeneruje. Free instance po nečinnosti
usíná – první požadavek pak trvá zhruba minutu.

CI (GitHub Actions): lint, kontrola formátování, typecheck, testy, build a sestavení Docker image.

## Architektura

```
packages/domain   čistý TypeScript bez I/O: import CSV, normalizace, pravidla, stavy, plánovač
apps/api          Fastify + Zod: načte data při startu, drží je v paměti, REST API, export CSV, servíruje SPA
apps/web          React + Vite + Ant Design + TanStack Query + React Router
```

- **Tok dat:** CSV → `importDataset` (dekódování, oprava a vyřazení řádků, report kvality) → model
  v paměti → `evaluateCompliance` (stav každého povinného školení k referenčnímu datu) →
  `buildOverview` / seznam úkolů / `planEnrollments`.
- **Bez databáze, záměrně.** Data jsou export jen pro čtení, výpočet je deterministický a pro ~170 lidí
  rychlý; výsledky pro dané referenční datum se cachují v paměti. Ukládání potvrzených
  přihlášek by databázi vyžadovalo – viz „Co dál“.
- **Doména je oddělená** od API i UI, takže se pravidla a plánovač testují bez serveru a typy
  sdílí všechny vrstvy.

### API

Vše pod `/api`, kromě `/api/health` za Basic Auth. Parametry `asOf` (YYYY-MM-DD) a `warningDays`.

`GET /health` · `/meta` · `/overview` · `/actions` · `/employees` · `/employees/:id` · `/plan` ·
`/plan.csv` · `/data-quality`

## Doporučení přihlášek (plánovač)

1. Každá potřeba (prošlé, chybí, brzy vyprší) má **termín, do kdy je nutná**: konec platnosti,
   u chybějícího školení referenční datum, u nově nastupujících den nástupu.
2. Potřeby se seřadí podle tohoto termínu (**earliest deadline first**); každá dostane
   **nejbližší termín s volným místem**, kterého se člověk může zúčastnit.
3. Omezení: volná místa = kapacita − obsazeno (nikdy záporně), jen budoucí, nezrušené
   a neduplicitní termíny, člověk max. jeden termín denně, nováček až od nástupu, odcházející jen
   do odchodu (a pokud mu školení vyprší až po odchodu, neřeší se), rodičovská se neplánuje
   (vedeno zvlášť – „po návratu“).
4. Výstup: přiřazení s příznakem _včas / pozdě / již po termínu / po nástupu_, a pro každé školení
   **nedostatek míst** – kolik lidí dostane místo až po vypršení a do kdy vypsat další termín.

Pro jednotkové požadavky se stejnými sloty je EDF optimální co do počtu lidí proškolených včas
a je deterministický (shoda se řeší naléhavostí a ID), takže plán jde reprodukovat a testovat.

## Předpoklady při čtení dat

- Platnost = datum absolvování + platnost z katalogu. Pokud export uvádí jinou platnost, použije
  se **dřívější** z obou (konzervativně) a rozpor je v reportu kvality.
- Školení s platností 0 (LEAD) je jednorázové, bez vypršení; `2 roky` = 24 měsíců.
- Nezapočítává se záznam s neznámým kódem, neznámým zaměstnancem, nesouhlasícím ID a jménem,
  zástupným datem (1900) nebo datem po exportu (zadáno předem) – vše je v reportu kvality.
- Duplicitní zaměstnanci (stejné rodné číslo) se sloučí i se svými záznamy; chybějící útvar se
  odvodí z organizační struktury (vedoucí / podřízení); varianty názvů útvarů a kódů se sjednotí.
  Kódy se neopravují „podobností“ – jen známý překlep `KYB3R`.
- Termíny: duplicitní řádek, nulová kapacita, zrušené a neplatné datum (31. 9.) se nepoužijí;
  přeplněný termín má 0 volných míst. Obsazenost se bere jako aktuální k datu exportu.

## Osobní údaje a bezpečnost

- CSV nejsou v gitu ani v Docker image (`.gitignore`, `.dockerignore`); v produkci jsou to Secret Files.
- Rodné číslo se použije jen při importu k sloučení duplicit a dál se neuchovává – žádná odpověď
  API ho neobsahuje (ověřeno testem nad syntetickými i reálnými daty).
- Celá aplikace (včetně SPA) za Basic Auth přes HTTPS, porovnání v konstantním čase; bezpečnostní
  hlavičky, `Cache-Control: no-store` pro API, `noindex`.
- API vrací jen pole, která UI potřebuje. Z importu se loguje jen souhrn (počty), nikdy obsah řádků;
  u požadavků jen metoda a cesta – bez query (vyhledávání podle jména), hlaviček a IP adresy.
- Export CSV neutralizuje hodnoty, které by Excel spustil jako vzorec (`=HYPERLINK(…)`, `@SUM`, `+1+1`);
  poznámky se v UI vykreslují jen jako text.

## Testy

Doména: parsery, import nad syntetickými fixtures (každý řádek napodobuje jednu anomálii
z reálných dat, `packages/domain/test/fixtures`), pravidla, stavy a plánovač včetně krajních případů.
Regresní testy nad reálnými daty se spustí jen tam, kde jsou data k dispozici (v CI ne).
API: testy přes `fastify.inject` (filtry, validace, Basic Auth, export, absence rodných čísel).
Web: pomocné funkce a render stránky s mockovaným API.

## Co dál

Databáze a ukládání potvrzených přihlášek (a jejich započtení do obsazenosti); nahrávání nových
exportů přes UI; přihlášení přes SSO univerzity a role (HR × vedoucí vidí jen své lidi);
upozornění e-mailem vedoucím; napojení na personální systém místo CSV; optimalizace plánu jako
min-cost flow (např. preference lokality); code-splitting webu.
