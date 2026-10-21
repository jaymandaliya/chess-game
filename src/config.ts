// Backend address. The backend runs on the developer Mac and is published over https through
// ngrok (fixed account domain), so phones work on any network without Local Network permission.
// When the backend is deployed (Railway), replace this with its https URL.
export const API_URL = 'https://kenisha-immortalisable-nonreducibly.ngrok-free.dev';

// Requests that take longer than this fail with a clear message instead of spinning forever
export const REQUEST_TIMEOUT_MS = 15000;

export const APP_NAME = 'Chess Platform';

// Pre-fills the login form with the seeded demo player for testing.
// Set to null before a Play Store / App Store release.
export const DEMO_LOGIN: { email: string; password: string } | null = {
  email: 'player1@example.com',
  password: 'Player123',
};
