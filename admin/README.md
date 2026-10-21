# Chess Platform – Admin portal (web)

React 19 + Vite + TypeScript single-page app for ADMIN / SUPER_ADMIN accounts.

## Run

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api → http://localhost:4000 (backend)
npm run build    # type-check + production build into dist/
```

Sign in with the seeded super admin (`admin@example.com` / `ChangeMe123` — change it). Player accounts are refused.

## Pages

| Page | What it does |
|---|---|
| Dashboard | KPIs from real data (players, active players, revenue, paid/pending orders, matches), 30-day revenue chart, activity feed |
| Players | Search, filter by status/role, sort, paginate; detail page with stats, wallet, purchases; suspend/reactivate (with reason); change role (super admin) |
| Coin packages | Create, edit (price in ₹, stored as paise), enable/disable; price changes don't affect past orders |
| Payments | Search by order no. / payment ref / email, filter by status and date, detail with coin ledger, CSV export |
| Game activity | Match records with filters (status, mode, result, player, dates), PGN view |
| Reports | Date range + daily/monthly: revenue, new players, matches by result/mode/termination; CSV exports |
| Audit logs | Read-only list of sensitive actions with filters, details, CSV export |
| Settings | Maintenance mode, registration, starting rating, support email, min app version (edit: super admin) |

List filters live in the URL, so they survive reloads and can be shared as links.

## Auth

Login sends `X-Client-Type: web`, so the refresh token is an **httpOnly cookie** (never readable by JS) and the access
token stays in memory. A reload restores the session via `/auth/refresh`; logout revokes it on the server.

## Deploy

Serve `dist/` from the same site as the API (e.g. `admin.example.com` + `api.example.com`, or `/admin` behind the same
domain) and route `/api` to the backend, so the SameSite=Strict cookie is sent. Add the admin origin to the backend's
`CORS_ORIGINS` if it is on a different origin. Set `NODE_ENV=production` on the backend so the cookie is `Secure`.
