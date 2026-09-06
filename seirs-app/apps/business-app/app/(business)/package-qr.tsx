/**
 * Show package QR, business app.
 *
 * Built 2026-08-24 (work order item 6). The driver app's scan screen has
 * been telling riders to "ask the customer to open their tracking screen
 * and tap Show package QR" while no such button existed in any sender
 * app, so the rider was sent to ask for a thing that could not be
 * produced. This screen is that thing, for the business side.
 *
 * WHY BUSINESS IS NOT JUST THE CUSTOMER SCREEN AGAIN. A business run
 * carries several packages and every package gets its own public
 * tracking code. A sender dispatching five parcels needs five separate
 * codes to send to five separate receivers, so a single QR for the run
 * would be useless to all five of them. This screen is therefore per
 * package, and it pages between the packages of one run so a sender can
 * work down the list in one sitting instead of walking back out to the
 * delivery and in again five times.
 *
 * Two design constraints, both founder, both 2026-08-24:
 *
 * 1. It has to be worth screenshotting. "its asthticaly pleasing to
 *    people and that alone would make more people want to use our apps
 *    ... humans like to show off". That is an adoption argument, so this
 *    is laid out as a ticket, not a bare square on a blank page.
 *
 * 2. The receiver is usually NOT the sender and usually has no SEIRS
 *    account. On SRS-9CJ7LJP2 the sender was in Berlin and the receiver
 *    was at a gate in Akobo. So the screenshot has to survive being sent
 *    over WhatsApp to a stranger's phone, and the plain-text code has to
 *    be shareable on its own for receivers whose phone or connection
 *    cannot deal with an image.
 *
 * THE QR ENCODES THE TRACKING CODE AND NOTHING ELSE. No name, no
 * address, no phone. A code designed to be forwarded carries everything
 * embedded in it to everyone it reaches, and on a multi-package run that
 * would mean receiver two's details travelling in receiver one's
 * WhatsApp. The names PRINTED beside the QR are the sender's own
 * deliberate choice to send, which is a different thing.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Share,
  StatusBar, useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Icon } from '@/components/Icon';
import { SeirsMarkBold, SeirsWordmark, NAVY_REFINED, YELLOW } from '@/components/SeirsLogoV2';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadows } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { businessApi } from '@/services/api';
import { trackUrl } from '@/constants/config';
import { tx } from '@/i18n/tx';

/**
 * The ticket is deliberately the same paper white in both themes.
 *
 * Two reasons, and neither is an oversight. Scanners read dark-on-light
 * far more reliably than the inverse, and a cheap Android phone reading
 * a compressed WhatsApp screenshot is exactly the hard case this has to
 * survive. And the sender's own theme should not decide what the
 * receiver's copy looks like: every screenshot of this screen should be
 * the same object, whichever way the sender's phone is set.
 */
const PAPER      = '#FFFFFF';
const PAPER_LINE = '#E5E7EB';
const PAPER_TEXT = NAVY_REFINED;
const PAPER_MUTE = '#6B7280';

interface Sibling {
  code:        string;
  description: string;
  receiver:    string;
}

export default function BusinessPackageQrScreen() {
  const params = useLocalSearchParams<{
    /** The delivery (run) this package belongs to. Optional: without it
     *  the screen still renders, it just cannot page to the siblings. */
    id?:          string;
    code?:        string;
    description?: string;
    receiver?:    string;
  }>();
  const router     = useRouter();
  const { isDark } = useTheme();
  const colors     = Colors[isDark ? 'dark' : 'light'];
  const insets     = useSafeAreaInsets();
  const { width }  = useWindowDimensions();
  const { user }   = useAuth() as any;

  const [copied, setCopied] = useState(false);

  /**
   * Which package of the run is on screen. Seeded from the route param
   * so the first paint is instant and correct even offline, then the
   * sibling list arrives and enables paging.
   */
  const [activeCode, setActiveCode] = useState(
    String(params.code ?? '').trim().toUpperCase(),
  );
  const [siblings, setSiblings] = useState<Sibling[]>([]);

  /**
   * Refetch the run purely to learn what the OTHER packages are.
   *
   * Passing the whole list through route params was the alternative and
   * it is worse: a five-package run puts five receivers' names into a
   * URL, and expo-router params are strings, so it would have meant
   * JSON in a query string. One cheap read of an endpoint this app
   * already calls is cleaner, and if it fails the screen simply loses
   * the pager rather than breaking.
   */
  useEffect(() => {
    const id = String(params.id ?? '').trim();
    if (!id) return;
    let cancelled = false;
    businessApi.delivery(id)
      .then((d: any) => {
        if (cancelled) return;
        const stops: any[] = Array.isArray(d?.stops) ? d.stops : [];
        const list: Sibling[] = stops
          .filter(s => !!s?.packageTrackingCode)
          .map((s, i) => ({
            code: String(s.packageTrackingCode).toUpperCase(),
            description: String(s.packageDescription ?? '').trim()
              || `Package ${s.sequenceOrder ?? i + 1}`,
            receiver: [s.receiverFirstName, s.receiverLastName]
              .filter(Boolean).join(' ') || String(s.recipientName ?? '').trim(),
          }));
        setSiblings(list);
      })
      .catch(() => { /* pager stays hidden, the ticket still works */ });
    return () => { cancelled = true; };
  }, [params.id]);

  const activeIndex = useMemo(
    () => siblings.findIndex(s => s.code === activeCode),
    [siblings, activeCode],
  );
  const active = activeIndex >= 0 ? siblings[activeIndex] : undefined;

  const code        = activeCode;
  const description = (active?.description ?? String(params.description ?? '')).trim();
  const receiver    = (active?.receiver ?? String(params.receiver ?? '')).trim();
  // The sender's own name, which they are choosing to send. A receiver
  // holding a forwarded screenshot needs to know who this is from.
  const sender      = String(user?.companyName ?? user?.name ?? '').trim();

  const total = siblings.length;
  const showPager = total > 1 && activeIndex >= 0;

  // Big enough to scan off a screen held at arm's length across a gate,
  // capped so it does not swallow the ticket on a large phone.
  const qrSize = Math.max(180, Math.min(width - 2 * Spacing.md - 2 * Spacing.lg - 24, 264));

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard denied: Send code is the other path */ }
  };

  /**
   * Plain text, no image.
   *
   * A receiver on a slow connection, a data-saver WhatsApp, or a phone
   * that will not open the screenshot still needs the code, and the code
   * alone is enough for the rider to type in at the door. Deliberately
   * carries no arrival time: Lagos traffic, NEPA and checkpoints make
   * any such promise a refund magnet.
   */
  const shareCode = async () => {
    if (!code) return;
    const hi = receiver ? `Hi ${receiver.split(' ')[0]}, ` : '';
    try {
      await Share.share({
        message:
          `${hi}a SEIRS package is on its way to you` +
          (sender ? ` from ${sender}` : '') + `.\n\n` +
          `Tracking code: ${code}\n` +
          (description ? `Package: ${description}\n` : '') +
          `\nShow this code to the driver at handover, or let them scan the ` +
          `QR image. Follow it here: ${trackUrl(code)}`,
      });
    } catch { /* the share sheet was dismissed */ }
  };

  const goTo = (i: number) => {
    const next = siblings[i];
    if (!next) return;
    setCopied(false);
    setActiveCode(next.code);
  };

  const header = (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={[styles.backBtn, { backgroundColor: colors.surfaceSecond }]}>
        <Icon name="ArrowLeft" size={20} color={colors.text} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{tx('auto.packageQr.packageQr', 'Package QR')}</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  if (!code) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        {header}
        <View style={styles.empty}>
          <Icon name="QrCode" size={34} color={colors.textThird} />
          <Text style={{ color: colors.text, fontSize: FontSize.base, fontWeight: FontWeight.bold }}>
            No tracking code
          </Text>
          <Text style={{ color: colors.textSecond, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 19 }}>
            Open this from a package inside a delivery and its code comes
            with it.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {header}

      <ScrollView
        contentContainerStyle={{
          padding: Spacing.md,
          gap: Spacing.md,
          paddingBottom: Math.max(insets.bottom + Spacing.lg, 48),
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Multi-package pager. Hidden entirely on a single-package run,
            where it would be three dead controls. */}
        {showPager && (
          <View style={[styles.pager, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Pressable
              onPress={() => goTo(activeIndex - 1)}
              disabled={activeIndex <= 0}
              hitSlop={8}
              style={({ pressed }) => [
                styles.pagerBtn,
                { backgroundColor: colors.surfaceSecond, opacity: activeIndex <= 0 ? 0.35 : pressed ? 0.7 : 1 },
              ]}
            >
              <Icon name="ChevronLeft" size={18} color={colors.text} />
            </Pressable>

            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[styles.pagerLabel, { color: colors.textThird }]}>
                PACKAGE {activeIndex + 1} OF {total}
              </Text>
              <Text style={[styles.pagerName, { color: colors.text }]} numberOfLines={1}>
                {receiver || description}
              </Text>
            </View>

            <Pressable
              onPress={() => goTo(activeIndex + 1)}
              disabled={activeIndex >= total - 1}
              hitSlop={8}
              style={({ pressed }) => [
                styles.pagerBtn,
                { backgroundColor: colors.surfaceSecond, opacity: activeIndex >= total - 1 ? 0.35 : pressed ? 0.7 : 1 },
              ]}
            >
              <Icon name="ChevronRight" size={18} color={colors.text} />
            </Pressable>
          </View>
        )}

        {/* The ticket. Everything a screenshot needs sits inside this one
            rectangle, so a crop of it is still a complete, branded
            object rather than a stray square. */}
        <View style={[styles.ticket, Shadows.md]}>
          <View style={styles.brandRow}>
            <SeirsMarkBold size={44} color={PAPER_TEXT} hubColor={PAPER} />
            <SeirsWordmark size={78} color={PAPER_TEXT} />
          </View>

          <View style={styles.kicker}>
            <View style={styles.kickerDot} />
            <Text style={styles.kickerText}>
              {showPager ? `PACKAGE ${activeIndex + 1} OF ${total}` : 'PACKAGE QR'}
            </Text>
            <View style={styles.kickerDot} />
          </View>

          {/* Black on white, never theme colours: this is the pattern a
              scanner actually has to resolve, off a compressed
              screenshot, in a dark doorway. */}
          <View style={styles.qrPlate}>
            <QRCode
              value={code}
              size={qrSize}
              color="#000000"
              backgroundColor={PAPER}
              ecl="M"
            />
          </View>

          <Text style={styles.codeLabel}>TRACKING CODE</Text>
          <Text style={styles.code} selectable>{code}</Text>

          {(!!description || !!receiver || !!sender) && (
            <>
              <View style={styles.perforation} />
              {!!description && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>PACKAGE</Text>
                  <Text style={styles.metaValue} numberOfLines={2}>{description}</Text>
                </View>
              )}
              {!!receiver && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>FOR</Text>
                  <Text style={styles.metaValue} numberOfLines={2}>{receiver}</Text>
                </View>
              )}
              {!!sender && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>FROM</Text>
                  <Text style={styles.metaValue} numberOfLines={2}>{sender}</Text>
                </View>
              )}
            </>
          )}

          <View style={styles.perforation} />
          <Text style={styles.footprint}>
            Show this to your SEIRS driver at handover
          </Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={copyCode}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Icon name={copied ? 'Check' : 'Copy'} size={17} color={copied ? colors.success : colors.primary} />
            <Text style={[styles.actionText, { color: copied ? colors.success : colors.primary }]}>
              {copied ? 'Copied' : 'Copy code'}
            </Text>
          </Pressable>

          {/* Text, not the image. Some receivers cannot handle a picture
              at all, and the code alone completes the handover. */}
          <Pressable
            onPress={shareCode}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: colors.primary, borderColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Icon name="Share2" size={17} color={colors.textOnPrimary} />
            <Text style={[styles.actionText, { color: colors.textOnPrimary }]}>{tx('auto.packageQr.sendCode', 'Send code')}</Text>
          </Pressable>
        </View>

        <View style={[styles.note, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.noteRow}>
            <Icon name="Camera" size={16} color={colors.primary} />
            <Text style={[styles.noteText, { color: colors.textSecond }]}>
              Screenshot this and send it to whoever is receiving this package.
              They do not need the SEIRS app: the driver scans it off their
              screen, or types the code in.
            </Text>
          </View>
          {showPager && (
            <View style={styles.noteRow}>
              <Icon name="Package" size={16} color={colors.primary} />
              <Text style={[styles.noteText, { color: colors.textSecond }]}>
                Every package in this run has its own code. Use the arrows above
                to move to the next one and send each receiver only theirs.
              </Text>
            </View>
          )}
          <View style={styles.noteRow}>
            <Icon name="ShieldCheck" size={16} color={colors.success} />
            <Text style={[styles.noteText, { color: colors.textSecond }]}>
              Safe to forward. The code is all this QR carries: no name,
              address or phone number travels inside it.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:     { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl },

  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  pagerBtn:   { width: 36, height: 36, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  pagerLabel: { fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.2 },
  pagerName:  { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginTop: 1 },

  ticket: {
    backgroundColor: PAPER,
    borderRadius: Radius.xxl,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: PAPER_LINE,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },

  kicker:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 2 },
  kickerDot:  { width: 5, height: 5, borderRadius: 3, backgroundColor: YELLOW },
  kickerText: { fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 2, color: PAPER_MUTE },

  qrPlate: {
    backgroundColor: PAPER,
    padding: 12,
    borderRadius: Radius.lg,
    marginTop: Spacing.xs,
  },

  codeLabel: { fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.4, color: PAPER_MUTE, marginTop: Spacing.xs },
  code:      { fontSize: 26, fontWeight: FontWeight.black, letterSpacing: 2.5, color: PAPER_TEXT, textAlign: 'center' },

  perforation: { height: 1, alignSelf: 'stretch', backgroundColor: PAPER_LINE, marginVertical: Spacing.sm },

  metaRow:   { flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'stretch', gap: Spacing.md },
  metaLabel: { width: 68, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1, color: PAPER_MUTE, paddingTop: 3 },
  metaValue: { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: PAPER_TEXT },

  footprint: { fontSize: FontSize.xs, color: PAPER_MUTE, textAlign: 'center' },

  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  action: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: 14, borderRadius: Radius.lg, borderWidth: 1,
  },
  actionText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },

  note:     { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  noteRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  noteText: { flex: 1, fontSize: FontSize.sm, lineHeight: 19 },
});
