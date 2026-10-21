# Chess Platform – Backend API

Node.js (Express 5) + MongoDB (Mongoose). Implements the "Chess Platform API Requirements" document for the
admin web portal and the player app. Live gameplay (matchmaking, moves, clocks) is not part of this service yet.

## Run locally

```bash
cp .env.example .env          # set JWT_ACCESS_SECRET to a long random string
npm install
npm run seed                  # super admin + coin packages (+ sample players/matches if SEED_SAMPLE_DATA=true)
npm run dev                   # http://localhost:4000
npm test                      # 31 API tests on an in-memory MongoDB replica set
```

MongoDB **must run as a replica set** (wallet credits use transactions). Use `?replicaSet=rs0` in `MONGO_URI`;
MongoDB Atlas is always a replica set.

Seeded logins: `admin@example.com / ChangeMe123` (SUPER_ADMIN), `player1..6@example.com / Player123`.

## Conventions

- Base path `/api/v1`, JSON, ISO 8601 UTC timestamps, money in integer **paise**.
- Success: `{ "success": true, "data": ... }`
- Error: `{ "success": false, "message": "...", "code": "UNAUTHORIZED", "details"?: [...] }`
- Lists: `?page=1&limit=20&search=&sortBy=&sortOrder=desc&from=&to=` → `data.items` + `data.pagination`
- Status codes: 400, 401 (no/expired token), 403 (role), 404, 409 (duplicate/conflict), 422 (validation), 429, 503 (maintenance).
- Roles: `PLAYER`, `ADMIN`, `SUPER_ADMIN`.

## Auth flow

| Client | Login | Refresh token |
|---|---|---|
| React Native app | `POST /auth/login` | returned in body → store in Keychain/SecureStore, send as `{ refreshToken }` |
| Admin web portal | `POST /auth/login` with header `X-Client-Type: web` and `"portal": "admin"` | set as httpOnly cookie `rt`; call `/auth/refresh` with `credentials: 'include'` |

Access tokens last 15 minutes. On `401 TOKEN_EXPIRED` call `/auth/refresh` once, then retry.
Refresh tokens rotate on every use; replaying an old one revokes all sessions in that login family.
Suspending a player, changing a role, or resetting a password revokes their sessions immediately.

## Endpoints

**Auth**: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me`,
`POST /auth/forgot-password`, `POST /auth/reset-password`

**Player** (role PLAYER): `GET|PATCH /player/profile`, `GET|PATCH /player/settings`, `GET /player/game-history`,
`GET /player/stats`, `GET /player/wallet`, `GET /player/transactions`, `GET /player/coin-packages`,
`POST /player/coin-orders`, `GET /player/coin-orders`, `GET /player/coin-orders/:id`

**Payments**: `POST /payments/verify` (player), `POST /payments/webhook` (Razorpay, signed)

**Admin** (ADMIN / SUPER_ADMIN):
`GET /admin/dashboard`, `GET /admin/dashboard/revenue?from&to&groupBy=day|month`, `GET /admin/dashboard/activity`,
`GET /admin/players`, `GET /admin/players/:id`, `PATCH /admin/players/:id/status`, `PATCH /admin/players/:id/role` (super admin),
`GET|POST /admin/coin-packages`, `PATCH /admin/coin-packages/:id`, `PATCH /admin/coin-packages/:id/status`,
`GET /admin/payments`, `GET /admin/payments/:id`, `GET /admin/game-activity`, `GET /admin/game-activity/:id`,
`GET /admin/audit-logs`, `GET /admin/audit-logs/:id`, `GET /admin/settings`, `PATCH /admin/settings` (super admin),
`GET /admin/reports?type=overview|revenue|players|matches`, `GET /admin/reports/export?type=payments|players|matches|audit-logs` (CSV)

## Metric definitions

- **totalRevenuePaise** – sum of `amountPaise` of orders with status `PAID`. PENDING, FAILED and REFUNDED are excluded.
- **totalOrders** – number of `PAID` orders. **pendingPayments** – orders still `PENDING`.
- **activePlayers** – players with status ACTIVE who used the app in the last 30 days.
- **newPlayersToday** – players registered since 00:00 IST today.
- **completedMatches** – matches with status `COMPLETED`.
- Daily/monthly report buckets use the Asia/Kolkata timezone.

## Coin purchase flow

1. App: `POST /player/coin-orders { packageId }` → server creates a Razorpay order from the **stored** package price
   and returns `checkout { keyId, providerOrderId, amountPaise, currency }`.
2. App opens Razorpay checkout (`react-native-razorpay`).
3. App: `POST /payments/verify { providerOrderId, providerPaymentId, signature }` → server checks the HMAC signature,
   fetches the payment from Razorpay, checks order id, amount and currency, and credits coins only once it is `captured`.
4. Razorpay webhook `payment.captured` / `order.paid` does the same, so coins arrive even if the app is closed.
   `payment.failed` marks the order FAILED; a full `refund.processed` marks it REFUNDED and takes back the coins still in the wallet.

Crediting happens in one MongoDB transaction (order → PAID, wallet `$inc`, ledger row with unique
`idempotencyKey`), so concurrent verify + webhook calls credit exactly once. Ledger and audit records cannot be updated or deleted.

Configure in the Razorpay dashboard: webhook URL `https://<api>/api/v1/payments/webhook`, events `payment.captured`,
`order.paid`, `payment.failed`, `refund.processed`, and put its secret in `RAZORPAY_WEBHOOK_SECRET`.
`PAYMENT_PROVIDER=mock` is for local development only and refused in production.

## Not done yet

- Email delivery for password reset (`src/services/mailer.js` only logs the link outside production).
- Game server (Socket.IO matchmaking, server-validated moves with chess.js, clocks, Elo). It will write `Match` records,
  which the history/stats/reporting APIs above already read.
