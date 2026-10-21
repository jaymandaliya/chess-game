import { Platform } from 'react-native';

// Android emulator reaches the host machine at 10.0.2.2. On a real phone, use your computer's LAN IP
// (e.g. http://192.168.1.20:4000) and run the backend with that host reachable.
const DEV_API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
const PROD_API_URL = 'https://api.example.com';

export const API_URL = __DEV__ ? DEV_API_URL : PROD_API_URL;
export const APP_NAME = 'Chess Platform';
