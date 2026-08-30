/**
 * Expo config, with the Google Maps key pulled out of source control.
 *
 * The key used to sit in app.json, which is committed. Anyone with repo
 * access had it, and it was the last open high-severity item from the
 * security review (fixed 2026-08-18).
 *
 * Be clear about what this does and does not achieve. A Maps key ships
 * INSIDE the app binary and can always be extracted from an installed
 * APK, whatever we do here. Moving it to an environment variable keeps
 * it out of the repository and out of git history going forward; it does
 * not make the key secret.
 *
 * The protection that actually matters is restriction in Google Cloud
 * Console: lock the Android key to the package name plus the release
 * SHA-1, lock the iOS key to the bundle id, and restrict both to only
 * the APIs this app calls. An unrestricted key is a billable resource
 * for whoever finds it.
 *
 * Local builds read .env (gitignored). EAS builds read the same name
 * from EAS secrets.
 */
const base = require('./app.json');

const mapsKey = process.env.GOOGLE_MAPS_API_KEY ?? '';

if (!mapsKey) {
  console.warn('[seirs] GOOGLE_MAPS_API_KEY is not set. Maps will fail to render.');
  console.warn('[seirs] Add it to .env in this app folder, or to EAS secrets for a cloud build.');
}

module.exports = () => {
  const expo = { ...base.expo };
  expo.ios = {
    ...expo.ios,
    config: { ...(expo.ios && expo.ios.config), googleMapsApiKey: mapsKey },
  };
  expo.android = {
    ...expo.android,
    config: { ...(expo.android && expo.android.config), googleMaps: { apiKey: mapsKey } },
  };

  // Google sign-in client ids. Kept out of the repo for the same reason as
  // the Maps key, and read at runtime from expoConfig.extra so that adding
  // the real values is a .env edit, NOT another native rebuild. The native
  // module itself is already linked, which is the part that needs one.
  expo.extra = {
    ...expo.extra,
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? '',
    googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID ?? '',
  };
  return { expo };
};
