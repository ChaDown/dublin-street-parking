# Deployment Guide — Dublin Street Parking

This guide takes you from zero (no git, no domain) to a live site with auto-deploy on every save.

---

## Part 1 — One-time setup

### 1.1 Install Git (if not already installed)

Open Terminal and run:
```sh
git --version
```
If you see a version number, you're good. If not, macOS will prompt you to install Xcode Command Line Tools — click Install and wait.

### 1.2 Configure Git with your name and email

```sh
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### 1.3 Create a GitHub account

Go to https://github.com and sign up for a free account if you don't have one.

---

## Part 2 — Initialise the local repository

Run these commands from your project folder:

```sh
cd ~/Desktop/parking-app

# Initialise git
git init -b main

# Stage all files (respects .gitignore automatically)
git add .

# Check what's been staged — make sure nothing sensitive appears
git status

# Make the first commit
git commit -m "Initial commit — Dublin Street Parking"
```

To confirm what's being committed and what's excluded, run `git status` after `git add .`. You should NOT see `.claude/`, any `*_raw*.json` files, or `*.xls` files in the list.

---

## Part 3 — Create the GitHub repository and push

### 3.1 Create a new repo on GitHub

1. Go to https://github.com/new
2. **Repository name:** `dublin-parking-finder` (or whatever you like)
3. **Visibility:** Public ← required for free GitHub Pages
4. **Do NOT** tick "Add a README", "Add .gitignore", or "Choose a license" — the repo must be empty
5. Click **Create repository**

### 3.2 Connect and push

GitHub will show you the commands — they'll look like this (replace `yourusername`):

```sh
git remote add origin https://github.com/yourusername/dublin-parking-finder.git
git push -u origin main
```

After this your code is on GitHub.

---

## Part 4 — Enable GitHub Pages with auto-deploy

### 4.1 Enable Pages via GitHub Actions

1. On your repo page, click **Settings** (top tab)
2. In the left sidebar click **Pages**
3. Under **Source**, select **GitHub Actions**
4. That's it — no further config needed

### 4.2 Trigger the first deploy

The workflow file (`.github/workflows/deploy.yml`) is already in your repo. Push anything to `main` and it runs automatically. To trigger it right now without making a change:

1. Go to your repo on GitHub
2. Click the **Actions** tab
3. Click **Deploy to GitHub Pages** in the left list
4. Click **Run workflow → Run workflow**

### 4.3 Find your live URL

Once the green tick appears in Actions, your site is live at:
```
https://yourusername.github.io/dublin-parking-finder/
```

> **Note:** The site uses `fetch()` calls for the JSON data files. These work fine over HTTPS on GitHub Pages — no server needed.

---

## Part 5 — Getting a custom domain

### 5.1 Recommended registrars

| Registrar | Why |
|-----------|-----|
| **Cloudflare** (cloudflare.com/products/registrar) | At-cost pricing (~€9/yr for .ie), free DNS, free SSL, best performance |
| **Namecheap** | Cheap, simple, good UX |
| **Google Domains** (now Squarespace) | Straightforward but slightly pricier |

For an Irish site, `.ie` domains are managed by IEDR and require proof of Irish connection. If that's a barrier, `.com` or `.app` work just as well for SEO.

### 5.2 Add the domain to your repo

Create a file called `CNAME` in the project root containing just your domain (no `https://`):

```
dublinstreetparking.ie
```

Commit and push it:
```sh
git add CNAME
git commit -m "Add custom domain"
git push
```

### 5.3 Configure DNS at your registrar

Add these DNS records (exact steps vary by registrar — look for "DNS Management"):

**For an apex domain (e.g. `dublinstreetparking.ie`)** — add four A records:
```
Type  Name  Value
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
```

**For `www` subdomain** — add a CNAME:
```
Type   Name  Value
CNAME  www   yourusername.github.io.
```

DNS changes can take up to 24 hours to propagate, but usually takes under 30 minutes.

### 5.4 Configure the domain in GitHub Pages settings

1. Go to **Settings → Pages**
2. Under **Custom domain**, enter your domain (e.g. `dublinstreetparking.ie`)
3. Click Save
4. Tick **Enforce HTTPS** once the green tick appears (may take a few minutes)

### 5.5 Update placeholder URLs in the codebase

Once your domain is confirmed, replace every occurrence of `https://dublinstreetparking.ie` across these files:

```sh
# Find all occurrences
grep -r "dublinstreetparking.ie" .

# Files to update manually:
# - index.html      (canonical, og:url, og:image, twitter:image, JSON-LD)
# - robots.txt      (Sitemap URL)
# - sitemap.xml     (loc URL)
# - manifest.json   (start_url is already /, no change needed)
```

---

## Part 6 — Daily edit workflow

Once everything is set up, making changes is three commands:

```sh
# 1. Stage your changes
git add .

# 2. Commit with a message describing what you changed
git commit -m "Update parking data for Dundrum"

# 3. Push — this triggers auto-deploy
git push
```

The GitHub Actions pipeline runs in about 30–60 seconds. You can watch it live under the **Actions** tab on GitHub. When the green tick appears, the site is updated.

### Useful git commands

```sh
git status              # see what files have changed
git log --oneline       # see commit history
git diff                # see exact changes before committing
```

---

## Part 7 — Manual deploy (if needed)

If you ever need to force a redeploy without making a code change:

1. GitHub → **Actions** tab
2. Click **Deploy to GitHub Pages**
3. Click **Run workflow → Run workflow**

---

## Part 8 — Troubleshooting

| Problem | Fix |
|---------|-----|
| Site loads but map is blank | Open browser DevTools (F12) → Console — look for 404 errors on JSON files. Make sure the `data/` folder was committed. |
| GitHub Pages shows 404 | Repo must be **Public**. Check Settings → Pages → Source is set to **GitHub Actions**. |
| Custom domain not working | DNS can take up to 24 hrs. Check with `dig yourdomain.ie` in Terminal. |
| Actions workflow fails | Click the failed run in Actions tab for full logs. Most common cause: workflow syntax error. |
| Changes not showing after push | Hard-refresh the browser (`Cmd+Shift+R`) to bypass cache. |
