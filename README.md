# Le Corti Bianche

Sito del caseificio Le Corti Bianche (La Riviera Soc. Agr.): Astro + Supabase, pubblicato su Netlify.

## Avvio in locale

```sh
cp .env.example .env   # inserisci URL e chiave anon/publishable di Supabase
npm install
npm run dev            # http://localhost:4321
```

## Pagine

| Percorso    | Cosa c'è |
| :---------- | :------- |
| `/`         | Scena video guidata dallo scroll, storia, anteprima prodotti, galleria, apertura |
| `/prodotti` | Catalogo completo raggruppato per categoria (dati letti da Supabase) |
| `/admin`    | Pannello per la famiglia: accesso, prodotti, prezzi, foto, categorie |

## Struttura

```text
public/frames/{latte,cagliata,forma}/NN.webp   fotogrammi della scena iniziale
public/img/la-riviera.webp                     logo della società (piè di pagina)
src/components/                                sezioni della home, header, footer
src/scripts/hero.ts                            animazione allo scroll (clip, dissolvenze)
src/scripts/admin.ts                           logica del pannello
src/lib/supabase.ts                            client, tipi, formattazione prezzi
src/lib/products.ts                            lettura catalogo e schede prodotto
src/lib/image.ts                               ridimensionamento foto prima dell'upload
supabase/schema.sql                            schema di riferimento (tabelle, RLS, storage)
```

## Pannello admin

1. In Supabase crea l'utente (Authentication → Users → Add user).
2. Aggiungilo agli admin: `insert into public.admins (user_id) values ('UUID');`
3. Registrazioni pubbliche e accessi anonimi devono restare disattivati.

Le modifiche fatte nel pannello compaiono subito sul sito: le pagine leggono i dati da Supabase a ogni visita, senza ripubblicare.

## Sostituire i video della scena iniziale

Da ogni clip si estraggono i fotogrammi (uno ogni due), larghi 1024 px, in WebP:

```sh
ffmpeg -i clip.mp4 -an -vf "select=not(mod(n\,2)),scale=1024:-2" -vsync vfr -c:v libwebp -quality 60 %02d.webp
```

Mettili in `public/frames/<clip>/` e, se il numero cambia, aggiorna `count` in `src/scripts/hero.ts`.

## Netlify

Build: `npm run build`, cartella `dist` (già in `netlify.toml`).
Variabili d'ambiente: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_KEY`.
