# Local setup (new machine)

## First run

```powershell
git clone <repo-url>
cd just-dance-web
npm install
npm run dev:test
```

Open **http://localhost:3000/dc/** (the `/dc/` path is required).

Or double-click **`start-local.bat`**.

## After git pull

```powershell
git pull
npm install
npm run dev:test
```

## Song list empty?

1. Complete **phone pairing** (QR scan) — the list loads only after pairing.
2. Run diagnostics:

```powershell
npm run verify:catalog
```

3. In the browser (DevTools):
   - **Console:** look for `[VIDEO_CATALOG] Loaded N videos`
   - **Network:** filter `getVideoCatalog`
   - **Application → Local Storage:** delete `dc_video_catalog_v2:*`, then hard refresh

## Do not use

- `npm run dev` alone (may miss env — use `dev:test`)
- `npx serve out` (wrong path for `/dc/` assets — use `npm run preview`)

## Production preview locally

```powershell
npm run preview:test
```

Then open **http://localhost:3000/dc/**
