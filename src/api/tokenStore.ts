import * as Keychain from 'react-native-keychain';

// Refresh token lives in the iOS Keychain / Android Keystore; the access token only in memory
const SERVICE = 'chess-platform.refresh-token';

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export async function saveRefreshToken(token: string): Promise<void> {
  await Keychain.setGenericPassword('refresh', token, { service: SERVICE });
}

export async function loadRefreshToken(): Promise<string | null> {
  const creds = await Keychain.getGenericPassword({ service: SERVICE });
  return creds ? creds.password : null;
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  await Keychain.resetGenericPassword({ service: SERVICE });
}
