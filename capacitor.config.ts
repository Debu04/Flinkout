import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.flinkout.app',
  appName: 'Flinkout',
  webDir: 'native-shell',
  ...(serverUrl ? {
    server: {
      url: serverUrl,
      cleartext: false,
      allowNavigation: [new URL(serverUrl).hostname],
    },
  } : {}),
};

export default config;
