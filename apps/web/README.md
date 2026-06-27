# nodx Lens — landing page

Static landing page for nodx Lens. Pure HTML + CSS, no build step, no JS framework — so it loads in <100ms and Cloudflare Pages serves it as cached HTML directly.

```
apps/web/
├── index.html         ← main landing page
├── privacy.html       ← privacy policy (auto-redirect to GitHub Gist for now)
├── styles.css
├── icons/             ← copied from extension/public/icons/
└── screenshots/       ← copied from extension/screenshot/store/
```

## Move to its own GitHub repo

To deploy to Cloudflare Pages, this needs to be its own repo.

```bash
# 1. Pick a name (suggested: nodx-lens-web or nodx-landing)
mkdir ~/dev/nodx-lens-web
cd ~/dev/nodx-lens-web

# 2. Copy these files in
cp -r /Users/youbinmo/Develop/nodx/nodx/apps/web/* .

# 3. Copy assets that index.html references
mkdir -p icons screenshots promo
cp /Users/youbinmo/Develop/nodx/nodx/apps/extension/public/icons/icon-{48,128}.png icons/
cp /Users/youbinmo/Develop/nodx/nodx/apps/extension/public/promo/small-tile.png promo/
cp /Users/youbinmo/Develop/nodx/nodx/apps/extension/screenshot/store/*.png screenshots/

# 4. Init git + push to a new repo
git init
git add .
git commit -m "feat: nodx Lens landing page v0.1"
gh repo create nodx-lens-web --public --source=. --remote=origin --push
# or manually: create repo on github.com, then:
#   git remote add origin git@github.com:<you>/nodx-lens-web.git
#   git push -u origin main
```

## Deploy to Cloudflare Pages

```
1. Open https://dash.cloudflare.com → Workers & Pages → Create → Pages
2. Connect to Git → select the repo you just pushed
3. Build settings:
     - Framework preset: None
     - Build command: (leave empty)
     - Build output directory: /
4. Save and Deploy
```

First deploy lands in 30-60 seconds.  Cloudflare gives you a free `*.pages.dev` URL like `nodx-lens.pages.dev`.

## Custom domain (later)

When you buy a real domain (e.g. `nodxlens.com`):

```
Cloudflare Pages project → Custom domains → Set up a custom domain → follow DNS setup
```

If you buy the domain at Cloudflare directly, DNS is auto-wired and HTTPS is free.

## What to update before launch

- [ ] `index.html` — replace `https://chrome.google.com/webstore/` with the **real** Chrome Web Store listing URL after approval
- [ ] Real Apple Developer link / TestFlight invite link for macOS section (or remove)
- [ ] Update privacy policy URL if you move it off Gist to a hosted URL
- [ ] Add real screenshots (already linked but verify paths after copy)
- [ ] Open Graph image — `promo/small-tile.png` already linked

## Iterate

Every `git push` to `main` auto-redeploys on Cloudflare Pages. Branches get preview URLs (`pr-3.nodx-lens.pages.dev`) so you can A/B copy without breaking prod.
