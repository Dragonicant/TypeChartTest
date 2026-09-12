# Porting TypeChart to Claude Code + GitHub Pages

## What's in this folder

This is a real, tested Vite + React project, not just a component file with instructions
attached. Everything here was actually built and verified before being handed off:

```
typechart-site/
├── package.json              # React + Vite dependencies
├── vite.config.js            # relative base path, see note below
├── index.html                # Vite's entry point
├── .gitignore                # excludes node_modules/ and dist/ from version control
├── src/
│   ├── main.jsx               # mounts <TypeChart /> into #root
│   └── TypeChart.jsx           # the actual component -- unmodified from the working version
└── .github/workflows/deploy.yml  # auto-builds and deploys to GitHub Pages on every push to main
```

`src/TypeChart.jsx` is a straight copy of the component as it stands after this whole design
session -- 21 tunable sliders, 12 color pickers (3 class + 9 affinity), the reset-to-defaults
button, the settings-delta download, the full strength/weakness relationship display (both
affinity-level and class-level, each showing green for what it beats and red for what beats it),
and the Wark badge. It was already written in normal ES module syntax (`import React from
"react"`, `export default function TypeChart()`), so nothing needed to change to make it work
here -- the standalone HTML versions built earlier in this project needed to strip that syntax
out specifically because they ran Babel in the browser instead of using a real bundler; this
setup doesn't have that constraint.

## Why this setup instead of the standalone HTML file

Two working versions of this exist by now, and they're for different jobs:

- **The standalone HTML file** (built earlier) embeds React, ReactDOM, and a full JSX compiler
  directly in one file, so it can be opened by double-clicking with zero setup. That's great for
  quickly sharing a build for feedback, but it ships a ~2.5MB file and recompiles JSX in the
  browser on every load.
- **This Vite setup** compiles everything ahead of time. The production build comes out to
  **160KB (51KB gzipped)** -- a real, measured number from an actual build run, not an estimate.
  This is the version worth using for anything meant to stay live and get iterated on through
  Claude Code, since it's what a normal React project actually looks like day to day (`npm run
  dev` for local development with hot reload, `npm run build` for production).

## Verifying it actually works (already done once, here's how to repeat it)

```bash
npm install
npm run build
npm run preview   # serves the production build locally so you can click through it
```

One thing worth knowing about if you ever try to test this build's output programmatically
(rather than by opening it in a real browser): **jsdom does not execute `<script type="module">`
tags at all**, even with script execution otherwise enabled -- this is a real, documented jsdom
limitation, not a bug in the build. It was confirmed directly during this handoff: the exact same
compiled bundle, loaded as a plain non-module script instead, mounted and rendered correctly
immediately, including all 21 sliders, all 12 color pickers, and click interactivity. If an
automated test of this project ever shows a blank page with no errors, check whether the test
tool actually supports ES module scripts before assuming the build itself is broken.

## Setting up GitHub Pages

1. **Push this folder to a new GitHub repository** (a normal `git init`, `git add`, `git commit`,
   then push to a new repo on GitHub -- `node_modules/` and `dist/` are already excluded via
   `.gitignore`, so only source files get committed).
2. **In the repo's Settings tab, go to Pages**, and under "Build and deployment," set the
   **Source to "GitHub Actions"** (not "Deploy from a branch" -- the included workflow handles
   the build itself, so Pages just needs to know to use it).
3. **Push to `main`.** The included `.github/workflows/deploy.yml` will automatically install
   dependencies, run `npm run build`, and deploy the `dist/` output to Pages on every push. You
   can also trigger a redeploy manually from the repo's Actions tab without a new commit
   (`workflow_dispatch` is enabled for this).
4. The site will be live at `https://<your-username>.github.io/<repo-name>/`.

**Why `vite.config.js` uses `base: "./"`** instead of an absolute path: GitHub Pages serves a
normal repo at a subpath (`/repo-name/`), not the domain root, unless the repo happens to be
named exactly `<username>.github.io`. A relative base makes every built asset path resolve
correctly regardless of what that subpath turns out to be, so nothing needs updating if the repo
gets renamed later.

## Continuing development through Claude Code

Once this is in a real repo, normal Claude Code workflow applies -- `npm run dev` for a local dev
server with hot reload while editing `src/TypeChart.jsx`, commit and push to deploy. Nothing about
the component itself needs to change to keep working here; this setup was built around the
existing file, not the other way around.
