# Android tracking wrapper

Flinkout's browser/PWA build continues to use browser geolocation and labels
DeviceMotion step values as estimates. The Android wrapper adds the platform
step counter/detector and the Android physical-activity permission without
changing the recorder UI.

## Prerequisites

- Node.js 22
- Android Studio with its bundled JDK and Android SDK
- USB debugging enabled on the test phone, or an Android emulator
- The deployed Flinkout HTTPS URL

## Configure and open the Android project

Run these commands from `C:\Users\medeb\Documents\Flinkout` in PowerShell:

```powershell
$env:CAPACITOR_SERVER_URL = 'https://YOUR-FLINKOUT-DOMAIN'
npm install
npm run native:sync
npm run native:open
```

The server URL is intentionally supplied at build time so the native wrapper
loads the same deployed Next.js app and `/api/v1` backend. Without it, the app
shows a local setup message instead of silently loading the wrong environment.

## Device validation

Use a physical Android phone for the final check:

1. Start a walk and accept Location and Physical activity permissions.
2. Walk outdoors until several accurate GPS samples arrive.
3. Confirm the real route is drawn, distance increases, and native steps count.
4. Disable location temporarily and confirm steps continue while estimated
   distance, pace, and calories are prefixed with `~`; the map must not draw a
   straight fake segment.
5. Re-enable location and confirm the route begins a new segment without a
   distance jump or duplicate steps.
6. Pause and resume once, then confirm paused time/steps are not added.

Raw accelerometer and Android step-counter events stay on the device. The
existing user-controlled review/sync flow sends only the route and derived
activity record; raw sensor events are not included.
