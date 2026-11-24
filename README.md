# Resonance

A bilingual (DE / EN) deep-conversation card web app with six curated stacks, Ruhi Book 1 & general wisdom quotes, live QR group question piles, per-card vote-to-advance analytics, offline PWA support, and an admin curation studio.

## Local Development

```bash
npm install
npm run dev
```

Resonance works out of the box in **Local Mode** (saving card edits, favorites, ratings, and QR room submissions locally and syncing across tabs via `BroadcastChannel`).

## Production Deployment (GitHub + Vercel + Supabase)

1. **Create a Supabase project** (free tier).
2. Open the Supabase **SQL Editor** and run `supabase/schema.sql`.
3. In **Authentication → Users**, create your admin user (email + password) for `/admin`.
4. Copy `.env.example` to `.env` (or add these variables in Vercel Project Settings):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Push this repository to GitHub and import into **Vercel** (`vercel.json` is already configured for SPA routes).
6. Visit `/admin` on your live site, sign in, and click **Seed Supabase with Curated Deck** under **Setup & Export** to populate all curated questions & quotes.

## Verification

```bash
npm test
npm run build
```
