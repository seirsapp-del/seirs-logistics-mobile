/**
 * The standard Google and Apple sign-in buttons (founder 2026-09-05:
 * "add the standard google and apple sign in button for all the apps").
 *
 * ONE FILE, three apps, byte-identical. What differs between them is the
 * `role` prop, and that difference matters: the customer app may CREATE
 * an account from a social sign-in, the other two may not. A driver's
 * signup also creates a Driver row and a business signup a
 * BusinessAccount, so a social button there would leave somebody inside
 * an app built around a vehicle or a company they never registered, and
 * the customer path would have filed them as a CUSTOMER on the way in.
 * The server enforces it; this only says which app is asking.
 *
 * BUTTON SHAPE is deliberately the platform standard rather than our own
 * house style. Both companies publish branding rules, people recognise
 * these two buttons on sight, and a login screen is the wrong place to be
 * inventive: white with a hairline border and the G mark for Google,
 * black with the Apple glyph for Apple.
 *
 * WHAT SHOWS WHERE:
 *   Google  only when a client id is configured, so an unconfigured build
 *           shows nothing rather than a button that cannot work.
 *   Apple   iOS only, and only when expo-apple-authentication is actually
 *           in the binary. It is not installed yet and there is no iOS
 *           build, so today it renders on nothing. That is correct rather
 *           than a stub: Apple sign-in does not exist on Android, and
 *           guideline 4.8 makes it mandatory on iOS precisely BECAUSE
 *           Google is offered, so the two ship together or not at all.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { GoogleIcon } from '@/components/GoogleIcon';
import { getGoogleIdToken, isGoogleConfigured, GoogleCancelled } from '@/lib/googleAuth';
import { authApi } from '@/services/api';

/** Apple's glyph, drawn rather than shipped as an asset. */
function AppleGlyph({ size = 18, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M16.365 1.43c0 1.14-.42 2.2-1.25 3.03-.9.9-1.99 1.42-3.06 1.34-.13-1.1.42-2.24 1.2-3.02.85-.87 2.2-1.5 3.11-1.35zM20.8 17.1c-.5 1.16-.74 1.68-1.39 2.71-.9 1.44-2.18 3.24-3.76 3.25-1.4.01-1.77-.92-3.68-.91-1.9.01-2.3.93-3.71.92-1.58-.01-2.79-1.63-3.7-3.07C1.99 16.09 1.72 11.4 3.3 8.9c1.1-1.76 2.85-2.79 4.49-2.79 1.67 0 2.72.92 4.1.92 1.34 0 2.16-.92 4.09-.92 1.46 0 3.01.8 4.11 2.17-3.61 1.98-3.03 7.14.71 8.82z"
      />
    </Svg>
  );
}

interface Props {
  /** Which app is asking. Decides whether the server may create an account. */
  role: 'customer' | 'driver' | 'business';
  /** Called with the server's auth response once a provider has verified. */
  onSignedIn: (res: { token: string; user: any }) => void | Promise<void>;
  /** Surfaced by the host screen in its own error slot. */
  onError: (message: string) => void;
  theme: any;
  /** The host's own busy flag, so the buttons grey out during a form login. */
  disabled?: boolean;
}

export function SocialSignIn({ role, onSignedIn, onError, theme, disabled }: Props) {
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [appleReady, setAppleReady] = useState(false);

  useEffect(() => {
    // Ask the registry rather than importing: a build made before the
    // module was added would throw at evaluation and take the router with
    // it, which is exactly how the document picker took the app down on
    // 2026-08-31.
    if (Platform.OS !== 'ios') return;
    if (!requireOptionalNativeModule('ExpoAppleAuthentication')) return;
    let alive = true;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const AppleAuthentication = require('expo-apple-authentication');
        const ok = await AppleAuthentication.isAvailableAsync();
        if (alive) setAppleReady(!!ok);
      } catch { /* older device or missing module: leave it hidden */ }
    })();
    return () => { alive = false; };
  }, []);

  const googleVisible = isGoogleConfigured();
  if (!googleVisible && !appleReady) return null;

  const handleGoogle = async () => {
    setBusy('google');
    try {
      const idToken = await getGoogleIdToken();
      const res = await authApi.googleLogin(idToken, role);
      await onSignedIn(res as any);
    } catch (e: any) {
      // Backing out is a decision, not a failure. Say nothing.
      if (e instanceof GoogleCancelled) return;
      onError(e?.message ?? 'Could not sign in with Google. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleApple = async () => {
    setBusy('apple');
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AppleAuthentication = require('expo-apple-authentication');
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential?.identityToken) throw new Error('Apple did not return a token.');
      const res = await authApi.appleLogin(credential.identityToken, role);
      await onSignedIn(res as any);
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      onError(e?.message ?? 'Could not sign in with Apple. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const off = !!disabled || busy !== null;

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={[styles.rule, { backgroundColor: theme.border }]} />
        <Text style={[styles.or, { color: theme.textThird }]}>or</Text>
        <View style={[styles.rule, { backgroundColor: theme.border }]} />
      </View>

      {googleVisible && (
        <Pressable
          onPress={handleGoogle}
          disabled={off}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          style={({ pressed }) => [
            styles.btn,
            styles.google,
            { opacity: pressed || off ? 0.7 : 1 },
          ]}
        >
          {busy === 'google'
            ? <ActivityIndicator color="#3C4043" />
            : (
              <>
                <GoogleIcon size={18} />
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
        </Pressable>
      )}

      {appleReady && (
        <Pressable
          onPress={handleApple}
          disabled={off}
          accessibilityRole="button"
          accessibilityLabel="Sign in with Apple"
          style={({ pressed }) => [
            styles.btn,
            styles.apple,
            { opacity: pressed || off ? 0.7 : 1 },
          ]}
        >
          {busy === 'apple'
            ? <ActivityIndicator color="#FFFFFF" />
            : (
              <>
                <AppleGlyph size={18} />
                <Text style={styles.appleText}>Sign in with Apple</Text>
              </>
            )}
        </Pressable>
      )}
    </View>
  );
}

/**
 * Both buttons are 48 high with the same radius and the same gap, so they
 * read as one pair rather than two borrowed widgets. The colours are the
 * two companies' published values and are deliberately NOT theme tokens:
 * a Google button that changes colour with our palette stops being the
 * button people recognise.
 */
const styles = StyleSheet.create({
  wrap:       { gap: 10, marginTop: 18 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  rule:       { flex: 1, height: StyleSheet.hairlineWidth },
  or:         { fontSize: 12, fontWeight: '600' },
  btn:        { height: 48, borderRadius: 12, flexDirection: 'row', alignItems: 'center',
                justifyContent: 'center', gap: 10 },
  google:     { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DADCE0' },
  googleText: { color: '#3C4043', fontSize: 15, fontWeight: '600' },
  apple:      { backgroundColor: '#000000' },
  appleText:  { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
