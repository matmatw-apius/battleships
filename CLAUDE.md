# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server at http://localhost:5173
npm run build     # Type-check + production build (tsc -b && vite build)
npm run lint      # ESLint on all TS/TSX files
npm run preview   # Preview production build locally
```

No test runner is configured yet.

## Stack

- **Vite 8** + **React 19** + **TypeScript 5.9**
- **Tailwind CSS v4** — configured via `@tailwindcss/vite` plugin (no `tailwind.config.js`; styles go in `src/index.css` with `@import "tailwindcss"`)
- **Supabase JS** (`@supabase/supabase-js`) — installed, not yet wired up

## Tailwind v4 note

Tailwind v4 uses a CSS-first config. All customizations (theme tokens, custom utilities) are defined in `src/index.css` using `@theme`, not in a JS config file. The Vite plugin handles everything — no PostCSS config needed.

## Supabase setup

The Supabase client is not initialized yet. When adding it, create a `src/lib/supabase.ts` that calls `createClient(url, anonKey)` and export a singleton from there.

## Project conventions

- Components go in `src/components/`
- Game state goes in `src/store/`
- Variable and file names in **English**
- Code comments in **Polish**
- Do not install new UI libraries without asking the user first

## Dependency note

`@tailwindcss/vite` requires Vite `^5–7` but this project uses Vite 8. It was installed with `--legacy-peer-deps`. This works at runtime but keep the flag in mind if adding more packages.
