# Chess Platform – Player app (React Native CLI)

Bare React Native 0.88 + TypeScript (no Expo). Talks to `../backend` over REST and Socket.IO.

## Features

- Sign up, sign in, forgot password; session kept in the iOS Keychain / Android Keystore with automatic token refresh
- **Play online**: quick pairing by time control (1+0 … 15+10), rated, server clocks, draw offers, resign/abort,
  reconnect to a running game, opponent-disconnect notice, rating change at the end
- **Play vs computer**: Easy / Medium / Hard, choose your colour (unrated)
- Tap-to-move board with legal-move dots, last-move and check highlight, promotion picker or auto-queen, 4 board themes
- Wallet: coin balance, buy coin packages with Razorpay, transaction history (paginated)
- History: rating, peak, win rate, W/L/D, recent form, game list with rating change
- Profile (edit name, country, bio) and settings saved to the account

All rules, clocks, results, ratings and balances are decided by the server; the app only sends intentions.

## Run

```bash
npm install
cd ios && bundle install && bundle exec pod install && cd ..   # iOS only
npm start                 # Metro
npm run android           # or: npm run ios
npm test                  # board + client unit tests
```

The backend must be running (`cd ../backend && npm run dev`). API address is in `src/config.ts`:
Android emulator uses `http://10.0.2.2:4000`, iOS simulator `http://localhost:4000`; on a real phone use your
computer's LAN IP. Set `PROD_API_URL` before a release build.

Android builds need JDK 17–21 (Android Studio's bundled JDK works:
`JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`).

## Payments

- Backend with `PAYMENT_PROVIDER=mock`: "Buy" shows a *Test payment* dialog and completes through the backend's
  development-only route. No Razorpay account needed.
- Backend with `PAYMENT_PROVIDER=razorpay`: the native Razorpay checkout opens; the app sends the result to
  `/payments/verify`, and the webhook credits coins even if the app is closed mid-payment.

## Structure

```
src/
  api/          fetch client (401 → single refresh → retry), Keychain token store, types
  auth/         AuthContext: session, player settings
  game/         GameContext: Socket.IO connection, live game state, actions
  components/   ChessBoard, shared UI
  screens/      Play, Matchmaking, Game, History, Wallet, Profile, EditProfile, Settings, auth/*
  navigation/   stacks + tabs
```

## Not included yet

Sounds, push notifications and Hindi translations (the matching account settings exist on the backend).
Pieces are Unicode glyphs; swap in SVG/PNG piece sets for a polished release.
