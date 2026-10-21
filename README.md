# Chess Platform

Online chess platform: a player app for Android and iOS, an admin web portal, and the backend that runs the API,
live games, payments, coins and tournaments.

| Folder | What it is | Stack | Details |
|---|---|---|---|
| [`backend/`](backend/) | REST API + Socket.IO game server | Node.js 22, Express, MongoDB (replica set), Socket.IO | [backend/README.md](backend/README.md) |
| [`admin/`](admin/) | Admin web portal | React 19, Vite, TypeScript | [admin/README.md](admin/README.md) |
| [`mobile/`](mobile/) | Player app | React Native 0.88 (CLI, no Expo), TypeScript | [mobile/README.md](mobile/README.md) |
| [`backend/postman/`](backend/postman/) | Postman collection (74 requests) + environments | Postman v2.1 | Import all three JSON files |

## Quick start (local)

```bash
# 1. Backend (needs MongoDB running as a replica set, e.g. rs0)
cd backend
cp .env.example .env        # set JWT_ACCESS_SECRET; PAYMENT_PROVIDER=mock for testing without Razorpay
npm install
npm run seed                # indexes, coin packages, admin account, sample data
npm run dev                 # http://localhost:4000
npm test                    # 48 tests

# 2. Admin portal
cd ../admin
npm install
npm run dev                 # http://localhost:5173 (proxies /api to the backend)

# 3. Mobile app
cd ../mobile
npm install
cd ios && pod install && cd ..   # iOS only
npm start                   # Metro
npm run android             # or: npm run ios
```

Set the backend address the app uses in `mobile/src/config.ts`, and the admin proxy target in `admin/netlify.toml`
(production) or `admin/vite.config.ts` (local).

## Features

- Accounts with rotating refresh tokens, role-based admin access, audit log of sensitive actions
- Live online chess (server-validated moves, clocks, Elo), play vs computer
- Two coin types (play + tournament), coin packages via Razorpay, coin entry for games with a platform fee
- Knockout tournaments, KYC, withdrawals (built, off by default until legally cleared)
- Admin dashboard, players, payments, tournaments, KYC review, withdrawals, revenue logs, reports, settings

## Not in this repository

Secrets and machine-specific files are git-ignored: `backend/.env`, the Android release keystore
(`mobile/android/app/*.keystore`, passwords in `~/.gradle/gradle.properties`), `node_modules`, iOS `Pods`, build output.
