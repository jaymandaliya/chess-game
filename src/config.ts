// Backend address. Right now the backend runs on the developer Mac, reached over Wi-Fi:
// the phone must be on the same network, and this IP changes if the Mac gets a new one
// (check with `ipconfig getifaddr en0`). When the backend is deployed, set this to its https URL.
const LOCAL_API_URL = 'http://192.168.31.221:4000';

export const API_URL = LOCAL_API_URL;
export const APP_NAME = 'Chess Platform';
