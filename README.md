# Men's League MVP

This repo is a monorepo with:
- `apps/api`: FastAPI backend
- `apps/web`: React + Vite frontend

## Local Development

### API / Backend
```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### API / Backend on WIndows
'''PowerShell
cd E:\Projects\Mens-league-MVP\apps\api
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
'''

### Web / Frontend
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

Deployed as two Vercel projects so both frontend and backend are always reachable.

## Notes

- Do not use SQLite in Vercel production; serverless filesystem is not persistent.
- Uploaded images are written to `UPLOADS_DIR` and are ephemeral on Vercel unless replaced with external object storage.
