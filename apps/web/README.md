# aicon.solutions — company + project site

Static site for **Aicon Solutions**, containing the company landing page and embedded project sub-sites.

```
apps/web/
├── index.html              # Company landing       → aicon.solutions/
├── nodx/
│   ├── index.html          # nodx project hub      → aicon.solutions/nodx/
│   └── lens/
│       └── index.html      # nodx Lens detail      → aicon.solutions/nodx/lens/
├── styles.css              # shared site styles
├── privacy.html            # Lens privacy redirect → aicon.solutions/privacy.html
├── robots.txt
├── sitemap.xml
├── icons/                  # /icons/icon-*.png         (absolute paths in HTML)
├── promo/                  # /promo/small-tile.png
└── screenshots/            # /screenshots/*.png
```

Adding a new project later? Make a new folder (`apps/web/<project>/`) with its own `index.html`. Link it from `index.html`'s projects section.

---

## Push to its own GitHub repo

This folder needs to live in its own repo so Cloudflare Pages can deploy it.

```bash
# 1. Pick a name (suggested: aicon-web)
mkdir /Users/youbinmo/Develop/aicon-web
cd /Users/youbinmo/Develop/aicon-web

# 2. Copy this directory into the repo root
cp -R /Users/youbinmo/Develop/nodx/nodx/apps/web/* .
cp /Users/youbinmo/Develop/nodx/nodx/apps/web/.* . 2>/dev/null || true

# 3. Init git + push
git init
git add .
git commit -m "feat: aicon.solutions v1 — company + nodx + nodx Lens"

# Then on github.com create an empty repo "aicon-web"
git remote add origin git@github.com:<your-username>/aicon-web.git
git branch -M main
git push -u origin main
```

---

## Deploy to Cloudflare Pages (free)

### 1. Create the Pages project

```
dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git
```

- Select the `aicon-web` repo you just pushed.
- Build settings:
  - **Framework preset:** None
  - **Build command:** (leave empty)
  - **Build output directory:** `/`
- Save and Deploy.

First deploy lands in ~60 seconds. You get a free URL like `aicon-web.pages.dev`.

Test it: open `https://aicon-web.pages.dev/` (should show the Aicon landing) and `https://aicon-web.pages.dev/nodx/` (should show nodx hub).

### 2. Connect your custom domain `aicon.solutions`

**Case A — `aicon.solutions` is already at Cloudflare** (your DNS is managed there):

1. In the Cloudflare Pages project → **Custom domains** → **Set up a custom domain**.
2. Enter `aicon.solutions` (apex / root) → Continue → Activate.
3. Cloudflare auto-creates a CNAME pointing the domain to your Pages project and waits for SSL (~1-3 minutes).
4. Repeat for `www.aicon.solutions` if you also want the `www` subdomain to work.

**Case B — domain is at another registrar** (GoDaddy / Namecheap / Squarespace / etc.):

Two options:

- **Option B1: transfer the DNS to Cloudflare** (recommended, free, gets you better DDoS / cache):
  1. Add `aicon.solutions` to Cloudflare → Cloudflare gives you 2 nameservers.
  2. At your registrar, set the nameservers to those 2 Cloudflare values.
  3. Wait 5 min to several hours for DNS to propagate.
  4. Then follow Case A above.

- **Option B2: keep DNS at the registrar, just add records**:
  1. In Cloudflare Pages → Custom domains → Set up custom domain → enter `aicon.solutions` → it gives you a target like `aicon-web.pages.dev`.
  2. At your registrar's DNS panel, add a CNAME for `@` (or apex) pointing to `aicon-web.pages.dev`.
     - Most registrars don't allow CNAME on `@` (apex). If yours doesn't, use **ALIAS / ANAME** instead.
     - If neither exists, you must use B1.
  3. SSL provisions automatically.

### 3. Replace your existing site

If `aicon.solutions` currently points to a different host, the moment Cloudflare's DNS records take effect, the old host is bypassed. Old host doesn't need uninstall — just stops receiving traffic.

If you want to keep the old site as a backup (in case the new one breaks):
- Move the old DNS record to a subdomain like `old.aicon.solutions`.
- Or keep the old site at the host but don't point DNS there anymore.

### 4. Iterate

Every `git push` to `main` auto-deploys. PR branches get preview URLs (`pr-3.aicon-web.pages.dev`).

Sub-pages live at the file paths you'd expect:
- `aicon.solutions/` → `index.html`
- `aicon.solutions/nodx/` → `nodx/index.html`
- `aicon.solutions/nodx/lens/` → `nodx/lens/index.html`

---

## Update before going live

- [ ] `nodx/lens/index.html` — replace `https://chrome.google.com/webstore/` (3 places) with the real Chrome Web Store URL once the extension is approved
- [ ] `nodx/lens/index.html` `#install-mac` — replace the X follow link with the real DMG download URL once you upload it
- [ ] `privacy.html` — confirm the Gist URL is correct
- [ ] Optionally tighten the company copy in `index.html` (tagline, "Three things we believe") to your voice
- [ ] Optional: replace the `A` brand mark with a real logo SVG when you have one

---

## Local preview before pushing

```bash
cd /Users/youbinmo/Develop/nodx/nodx/apps/web
python3 -m http.server 8000
# open http://localhost:8000/
```

Or use any other static server (`npx serve`, `caddy file-server`, etc.).
