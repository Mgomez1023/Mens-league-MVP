# Men's League MVP

This repo is a monorepo with:
- `apps/api`: FastAPI backend
- `apps/web`: React + Vite frontend

## Local Development

### API
```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Web
```bash
cd apps/web
npm install
npm run dev
```

If needed, set `apps/web/.env`:
```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Vercel Deployment

Deploy as two Vercel projects so both frontend and backend are always reachable.

### 1) Deploy backend (`apps/api`)

1. Create a Vercel project with Root Directory set to `apps/api`.
2. Add environment variables in Vercel (Production, Preview, Development):
   - `DATABASE_URL` (use a persistent Postgres URL, not SQLite)
   - `JWT_SECRET`
   - `JWT_ALG=HS256`
   - `JWT_EXPIRES_MIN=720`
   - `CORS_ALLOW_ORIGINS=https://<your-web-domain>.vercel.app`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - Optional: `UPLOADS_DIR=/tmp/uploads`
3. Deploy and note API URL, e.g. `https://mens-league-api.vercel.app`.

The backend Vercel config is in `apps/api/vercel.json`.

### 2) Deploy frontend (`apps/web`)

1. Create a second Vercel project with Root Directory set to `apps/web`.
2. Add env var:
   - `VITE_API_BASE_URL=https://<your-api-domain>.vercel.app`
3. Deploy and open your web URL.

The frontend Vercel config is in `apps/web/vercel.json` and includes an SPA rewrite to `index.html`.

## Notes

- Do not use SQLite in Vercel production; serverless filesystem is not persistent.
- Uploaded images are written to `UPLOADS_DIR` and are ephemeral on Vercel unless replaced with external object storage.
