/**
 * SeirsDialog: the themed replacement for Alert.alert.
 *
 * WHY this exists. `Alert.alert()` is not a component anyone designed.
 * It is React Native asking Android to draw its own AlertDialog, so the
 * surface is the OS grey, the buttons are the OS teal uppercase, and
 * React Native exposes no control over background, font, corner radius,
 * button colour or layout. The SEIRS design system simply stopped at
 * the edge of that box on every screen. The founder found it on device
 * 2026-08-24 on the Report a problem dialog: "why does this have this
 * grayish unstylied background and the green words, seems like less
 * effort design, and i have seen it around the entire app". He was
 * right, and business-app alone had 87 of them.
 *
 * WHY it also fixes a real bug, not just a look. Android's AlertDialog
 * renders only the first THREE buttons and silently discards the rest.
 * No warning, no crash, no ellipsis: the fourth option is simply not
 * there. Three live instances were found on 2026-08-24. The Appearance
 * dialog in business (tabs)/profile.tsx shipped with four, so its Cancel
 * was never drawn and the dialog could not be dismissed at all. The
 * customer travel-buddy seat picker built up to five, so no Android
 * customer could ever buy more than two seats. Customer rewards
 * redemption hid a third active delivery. This component renders every
 * button it is given, in a list that scrolls if it has to, so an option
 * can no longer disappear because of a platform limit nobody at the
 * call site knew about.
 *
 * ── WHY THIS FILE IS THE SAME IN TWO APPS (2026-08-25) ──────────────
 *
 * It was written twice on 2026-08-24, once in customer-app and once in
 * business-app, at the same relative path, because three agents were
 * editing at once and could not share. The two arrived at different
 * APIs for the same job, so a fix to one reached neither the other app
 * nor the founder.
 *
 * They are now ONE file, kept byte-identical in both apps, and it
 * carries BOTH entry points so no call site in either app had to
 * change:
 *
 *   showDialog({ title, message, actions })   <- customer's, imperative
 *   useSeirsDialog().alert(title, msg, btns)  <- business's, Alert-shaped
 *
 * Neither is deprecated. `showDialog` needs no hook, so it works from a
 * plain function outside a component; `useSeirsDialog` mirrors
 * Alert.alert's exact signature, so migrating a call site is a rename.
 * Both feed the same queue and render the same dialog.
 *
 * It deliberately does NOT live in shared/: shared is a separate
 * package with its own barrel whitelist in three apps, and an export
 * that is not whitelisted resolves to undefined and red-screens at
 * runtime. Copying the file is the cheaper correctness.
 *
 * IF YOU EDIT THIS FILE, COPY IT TO THE OTHER APP IN THE SAME PASS.
 * The two paths are:
 *   apps/customer-app/components/SeirsDialog.tsx
 *   apps/business-app/components/SeirsDialog.tsx
 *
 * ────────────────────────────────────────────────────────────────────
 *
 * Money passed in here must already have been through utils/money.ts
 * `naira()`. This component prints strings, it does not format, and the
 * house rule is two decimals, always, to the kobo.
 *
 * Never write copy here that promises an arrival time.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View, Text, Modal, Pressable, StyleSheet, ScrollView, Platform, Alert,
} from 'react-native';
import { Colors, Radius, Spacing, FontSize, FontWeight } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { Icon } from '@/components/Icon';

/**
 * The three styles Alert.alert accepts, so business call sites port
 * unchanged, plus 'primary' from the customer API for a call site that
 * wants to name the affirmative action explicitly rather than let it be
 * inferred from position.
 */
export type SeirsDialogButtonStyle = 'default' | 'cancel' | 'destructive' | 'primary';

export interface SeirsDialogButton {
  text:     string;
  style?:   SeirsDialogButtonStyle;
  onPress?: () => void | Promise<void>;
}

export type SeirsDialogTone = 'default' | 'danger' | 'success' | 'warning';

export interface SeirsDialogOptions {
  /** Matches Alert.alert's fourth-argument options bag. */
  cancelable?: boolean;
  /**
   * Tone drives the icon badge above the title. Left unset it is
   * inferred: a destructive button makes it 'danger', otherwise
   * 'default'. Set it explicitly for a success or a warning.
   */
  tone?: SeirsDialogTone;
}

// ── Customer-app aliases ──────────────────────────────────────────────
// Same shapes under the names customer call sites already import.
// travel-buddy.tsx imports `type DialogAction` by name.

export type DialogActionStyle = SeirsDialogButtonStyle;
export type DialogAction      = SeirsDialogButton;

export interface DialogRequest {
  title: string;
  message?: string;
  actions?: DialogAction[];
  /**
   * Whether tapping the backdrop or the Android back button closes it.
   * Defaults to true. Set false only where a choice genuinely has to be
   * made, and always give the user an explicit way out in that case.
   */
  dismissable?: boolean;
}

const TONE_ICON: Record<SeirsDialogTone, 'Info' | 'AlertTriangle' | 'CheckCircle2'> = {
  default: 'Info',
  danger:  'AlertTriangle',
  warning: 'AlertTriangle',
  success: 'CheckCircle2',
};

/**
 * A dialog is a decision, so its buttons need a real target for a thumb
 * in a glove on a phone held one-handed at a gate. 48 is the Android
 * accessibility floor and this is deliberately above it.
 */
const BUTTON_MIN_HEIGHT = 52;

/**
 * Two short labels sit side by side, which is what a yes/no decision
 * should look like. Anything longer or more numerous stacks, because a
 * row of three squeezes "Pay with card ending 4242" down to two
 * characters and an ellipsis.
 */
const ROW_LAYOUT_MAX_LABEL = 14;

function shouldStack(buttons: SeirsDialogButton[]): boolean {
  if (buttons.length !== 2) return true;
  return buttons.some(b => (b.text ?? '').length > ROW_LAYOUT_MAX_LABEL);
}

function inferTone(buttons: SeirsDialogButton[]): SeirsDialogTone {
  return buttons.some(b => b.style === 'destructive') ? 'danger' : 'default';
}

/**
 * Index of the affirmative action. An explicit style: 'primary' wins;
 * otherwise it is the last button that is neither a cancel nor a
 * destructive, so the common two-button confirm gets its affirmative
 * filled in without every call site having to say so. Returns -1 when
 * there is none.
 */
function primaryIndex(buttons: SeirsDialogButton[]): number {
  const explicit = buttons.findIndex(b => b.style === 'primary');
  if (explicit !== -1) return explicit;
  for (let i = buttons.length - 1; i >= 0; i--) {
    const s = buttons[i].style;
    if (s !== 'cancel' && s !== 'destructive') return i;
  }
  return -1;
}

// ── Controlled primitive ──────────────────────────────────────────────
// Exported for the rare screen that wants to own the open/closed state
// itself. Most callers want one of the two imperative APIs below.

export interface SeirsDialogProps {
  visible:     boolean;
  title:       string;
  message?:    string;
  buttons?:    SeirsDialogButton[];
  cancelable?: boolean;
  tone?:       SeirsDialogTone;
  /**
   * `viaButton` is true when one of the buttons was tapped and false
   * when the backdrop or the Android back button closed it. The
   * difference matters: a promise-based confirm() must resolve false on
   * a dismissal but must NOT also resolve false when the user actually
   * chose something.
   */
  onClose: (viaButton: boolean) => void;
}

export function SeirsDialog({
  visible, title, message, buttons, cancelable = true, tone, onClose,
}: SeirsDialogProps) {
  const { isDark } = useTheme();
  const theme = Colors[isDark ? 'dark' : 'light'];

  const list: SeirsDialogButton[] = buttons && buttons.length > 0
    ? buttons
    : [{ text: 'OK' }];

  const resolvedTone = tone ?? inferTone(list);
  const stacked      = shouldStack(list);
  const primaryAt    = primaryIndex(list);

  const toneColor =
    resolvedTone === 'danger'  ? theme.error   :
    resolvedTone === 'success' ? theme.success :
    resolvedTone === 'warning' ? theme.warning :
    theme.primary;

  const press = (b: SeirsDialogButton) => {
    // Close first, then run. A handler that navigates or opens the share
    // sheet while the modal is still mounted leaves the backdrop sitting
    // on top of whatever it opened.
    onClose(true);
    if (b.onPress) {
      setTimeout(() => {
        try {
          const r = b.onPress!();
          if (r && typeof (r as Promise<void>).catch === 'function') {
            (r as Promise<void>).catch(() => { /* the handler owns its own errors */ });
          }
        } catch { /* a throwing handler must not take the host down */ }
      }, Platform.OS === 'android' ? 0 : 120);
    }
  };

  const dismiss = () => { if (cancelable) onClose(false); };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android hardware back. Without this the OS closes nothing and
      // the user is trapped behind a non-cancelable dialog.
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={dismiss}>
        {/* Inner Pressable with an empty handler swallows taps, so a
            press on the card itself does not fall through to the
            backdrop and dismiss the dialog. */}
        <Pressable
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => {}}
        >
          {/* The badge fill is a solid theme token, never a low-alpha
              hex. Those hexes were each picked while looking at one
              theme: green at 8% alpha is a subtle glow over near-black
              and grey-green sludge over the cream light background. */}
          <View style={[styles.badge, { backgroundColor: theme.surfaceSecond }]}>
            <Icon name={TONE_ICON[resolvedTone]} size={20} color={toneColor} />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

          {!!message && (
            // A long message (the return quote lists four money lines)
            // has to scroll rather than push the buttons off screen.
            <ScrollView
              style={styles.messageScroll}
              contentContainerStyle={{ paddingBottom: 2 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.message, { color: theme.textSecond }]}>{message}</Text>
            </ScrollView>
          )}

          {/* The list SCROLLS rather than being truncated. The whole
              point of this component is that nothing gets dropped, so a
              long list has to stay reachable (customer travel-buddy can
              raise five). */}
          <ScrollView
            style={styles.actionsScroll}
            contentContainerStyle={[styles.actions, stacked ? styles.actionsStacked : styles.actionsRow]}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {list.map((b, i) => {
              const destructive = b.style === 'destructive';
              const cancel      = b.style === 'cancel';
              const isPrimary   = i === primaryAt;

              const bg =
                destructive ? theme.error :
                isPrimary   ? theme.primary :
                cancel      ? 'transparent' :
                theme.surfaceSecond;

              const fg =
                destructive || isPrimary ? '#FFFFFF' :
                cancel                   ? theme.textSecond :
                theme.text;

              return (
                <Pressable
                  key={`${b.text}-${i}`}
                  onPress={() => press(b)}
                  android_ripple={{ color: theme.border }}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    stacked ? styles.buttonStacked : styles.buttonRow,
                    {
                      backgroundColor: bg,
                      borderColor: cancel ? theme.border : 'transparent',
                      borderWidth:  cancel ? 1 : 0,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.buttonText, { color: fg }]} numberOfLines={2}>
                    {b.text}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Shared queue ──────────────────────────────────────────────────────

interface DialogState {
  title:      string;
  message?:   string;
  buttons:    SeirsDialogButton[];
  cancelable: boolean;
  tone:       SeirsDialogTone;
  /** Runs only when the dialog closed WITHOUT a button being tapped. */
  onDismissed?: () => void;
}

/**
 * Queue, because a handler can raise a second dialog from inside the
 * first one's onPress ("Card declined" straight after "Pay with card
 * ending 4242"). Without a queue the second call lands while the modal
 * is still animating out and Android drops it with no error, which is
 * one of the things Alert.alert also gets wrong.
 */
function useDialogQueue() {
  const [state, setState] = useState<DialogState | null>(null);

  const queue    = useRef<DialogState[]>([]);
  const openRef  = useRef(false);
  const stateRef = useRef<DialogState | null>(null);

  const show = useCallback((next: DialogState) => {
    if (openRef.current) { queue.current.push(next); return; }
    openRef.current  = true;
    stateRef.current = next;
    setState(next);
  }, []);

  const handleClose = useCallback((viaButton: boolean) => {
    const current = stateRef.current;
    if (current && !viaButton) current.onDismissed?.();

    const next = queue.current.shift();
    if (next) {
      openRef.current  = true;
      stateRef.current = next;
      setState(next);
    } else {
      openRef.current  = false;
      stateRef.current = null;
      setState(null);
    }
  }, []);

  return { state, show, handleClose };
}

function toState(
  title: string,
  message?: string,
  buttons?: SeirsDialogButton[],
  options?: SeirsDialogOptions,
): DialogState {
  const list = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
  return {
    title,
    message,
    buttons: list,
    cancelable: options?.cancelable !== false,
    tone: options?.tone ?? inferTone(list),
  };
}

// ── Imperative bridge: showDialog / DialogHost ────────────────────────
// The host registers itself here on mount. One host per app.

let hostPush: ((s: DialogState) => void) | null = null;

/**
 * Turn a customer-style DialogRequest into buttons.
 *
 * On a list of THREE OR MORE, cancel is moved last whatever order the
 * call site declared. Those render as a vertical stack, call sites
 * habitually write cancel first because that is where Android puts it,
 * and reading a list of real choices with "Cancel" at the top is
 * backwards going down a page.
 *
 * A pair is left exactly as written, because a pair of short labels
 * renders as a ROW, and in a row the Android convention is cancel on
 * the left with the affirmative on the right. Reordering there would
 * put "Delete account" under the reader's thumb where Cancel belongs.
 *
 * `alert()` below never reorders at all: it is a drop-in for
 * Alert.alert, and a drop-in that silently reshuffles is not one.
 */
function requestToButtons(req: DialogRequest): SeirsDialogButton[] {
  const raw = req.actions?.length ? req.actions : [{ text: 'OK', style: 'primary' as const }];
  if (raw.length <= 2) return [...raw];
  const cancels = raw.filter(a => a.style === 'cancel');
  const others  = raw.filter(a => a.style !== 'cancel');
  return [...others, ...cancels];
}

export function showDialog(req: DialogRequest): void {
  const buttons = requestToButtons(req);
  if (hostPush) {
    hostPush(toState(req.title, req.message, buttons, { cancelable: req.dismissable !== false }));
    return;
  }
  // Fallback. Note this can lose actions past the third on Android,
  // which is the exact bug this component exists to fix, so reaching
  // here at all means neither DialogHost nor SeirsDialogProvider is
  // mounted in the root layout. A dialog that never appears is worse
  // than an ugly one, so it still gets shown.
  if (__DEV__) {
    console.warn(
      `[SeirsDialog] "${req.title}" fell back to Alert.alert: no DialogHost ` +
      `or SeirsDialogProvider is mounted. Check app/_layout.tsx.`,
    );
  }
  Alert.alert(
    req.title,
    req.message,
    buttons.map(a => ({
      text: a.text,
      onPress: a.onPress as (() => void) | undefined,
      style: a.style === 'cancel' ? 'cancel' : a.style === 'destructive' ? 'destructive' : 'default',
    })),
  );
}

/**
 * Alert.alert's EXACT positional signature, without the hook.
 *
 * This is the migration tool. `Alert.alert(a, b, [...])` becomes
 * `alertDialog(a, b, [...])` and nothing else on the line changes, so
 * moving a screen off the Android system dialog is a rename and an
 * import rather than a reshaped call, and the diff stays reviewable.
 *
 * It does not reorder buttons, because a drop-in that silently
 * reshuffles is not one. Order the array the way it should read: two
 * short labels render as a row (cancel left, affirmative right, the
 * Android convention), three or more stack vertically, where cancel
 * belongs at the BOTTOM.
 *
 * Prefer `useSeirsDialog().alert` inside a component that already has
 * the hook. Reach for this one from a plain function, a module-scope
 * helper, or a screen where adding a hook is the only change the
 * migration would otherwise need.
 */
export function alertDialog(
  title: string,
  message?: string,
  buttons?: SeirsDialogButton[],
  options?: SeirsDialogOptions,
): void {
  const state = toState(title, message, buttons, options);
  if (hostPush) { hostPush(state); return; }
  if (__DEV__) {
    console.warn(
      `[SeirsDialog] "${title}" fell back to Alert.alert: no DialogHost ` +
      `or SeirsDialogProvider is mounted. Check app/_layout.tsx.`,
    );
  }
  Alert.alert(
    title,
    message,
    state.buttons.map(a => ({
      text: a.text,
      onPress: a.onPress as (() => void) | undefined,
      style: a.style === 'cancel' ? 'cancel' : a.style === 'destructive' ? 'destructive' : 'default',
    })),
    { cancelable: state.cancelable },
  );
}

/**
 * Mount once, at the root, as a SIBLING of the navigator. This is the
 * customer app's entry point: it makes showDialog() work and needs no
 * context, so a plain function outside a component can raise a dialog.
 *
 * An app that also wants the useSeirsDialog() hook should mount
 * SeirsDialogProvider instead, which registers this same bridge.
 */
export function DialogHost() {
  const { state, show, handleClose } = useDialogQueue();

  useEffect(() => {
    hostPush = show;
    return () => { if (hostPush === show) hostPush = null; };
  }, [show]);

  return (
    <SeirsDialog
      visible={state !== null}
      title={state?.title ?? ''}
      message={state?.message}
      buttons={state?.buttons}
      cancelable={state?.cancelable ?? true}
      tone={state?.tone}
      onClose={handleClose}
    />
  );
}

// ── Context bridge: SeirsDialogProvider / useSeirsDialog ──────────────

export interface ConfirmArgs {
  title:        string;
  message?:     string;
  confirmText?: string;
  cancelText?:  string;
  destructive?: boolean;
}

interface SeirsDialogContextValue {
  /** Alert.alert's signature, exactly. */
  alert: (
    title: string,
    message?: string,
    buttons?: SeirsDialogButton[],
    options?: SeirsDialogOptions,
  ) => void;
  /** Yes/no as a promise, for handlers that read better awaited. */
  confirm: (args: ConfirmArgs) => Promise<boolean>;
}

/**
 * Default context, used only when the provider is missing.
 *
 * It must not throw, because a screen rendered outside the provider
 * should still mount. But it must not fail SILENTLY either: a dialog
 * that never appears takes a decision away from the user with no error
 * anywhere, and these carry "Cancel delivery?" and "Pay NGN 2,609.06".
 * A booking would simply stop with nothing on screen to explain it, so
 * the dev build says so loudly.
 */
const noop: SeirsDialogContextValue = {
  alert: (title: string) => {
    if (__DEV__) {
      console.error(
        `[SeirsDialog] "${title}" was swallowed: no SeirsDialogProvider above ` +
        `this screen. Check that app/_layout.tsx still wraps the tree in ` +
        `<SeirsDialogProvider>.`,
      );
    }
  },
  confirm: async (args: ConfirmArgs) => {
    if (__DEV__) {
      console.error(
        `[SeirsDialog] confirm("${args.title}") was swallowed and answered no: ` +
        `no SeirsDialogProvider above this screen.`,
      );
    }
    return false;
  },
};

const SeirsDialogContext = createContext<SeirsDialogContextValue>(noop);

export function SeirsDialogProvider({ children }: { children: React.ReactNode }) {
  const { state, show, handleClose } = useDialogQueue();

  // Register the module-level bridge too, so showDialog() works in an
  // app that mounts the provider and never mounts DialogHost. One queue,
  // two doors into it.
  useEffect(() => {
    hostPush = show;
    return () => { if (hostPush === show) hostPush = null; };
  }, [show]);

  const alert = useCallback((
    title: string,
    message?: string,
    buttons?: SeirsDialogButton[],
    options?: SeirsDialogOptions,
  ) => {
    show(toState(title, message, buttons, options));
  }, [show]);

  const confirm = useCallback((args: ConfirmArgs) => new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (v: boolean) => { if (!settled) { settled = true; resolve(v); } };
    const list: SeirsDialogButton[] = [
      { text: args.cancelText ?? 'Not now', style: 'cancel', onPress: () => done(false) },
      {
        text: args.confirmText ?? 'Confirm',
        style: args.destructive ? 'destructive' : 'default',
        onPress: () => done(true),
      },
    ];
    show({
      title: args.title,
      message: args.message,
      buttons: list,
      cancelable: true,
      tone: inferTone(list),
      // Backdrop or hardware back is a no, not a promise that hangs
      // forever holding whatever the caller awaited it for.
      onDismissed: () => done(false),
    });
  }), [show]);

  const value = useMemo(() => ({ alert, confirm }), [alert, confirm]);

  return (
    <SeirsDialogContext.Provider value={value}>
      {children}
      <SeirsDialog
        visible={state !== null}
        title={state?.title ?? ''}
        message={state?.message}
        buttons={state?.buttons}
        cancelable={state?.cancelable ?? true}
        tone={state?.tone}
        onClose={handleClose}
      />
    </SeirsDialogContext.Provider>
  );
}

/**
 * Drop-in for Alert.alert:
 *
 *   const dialog = useSeirsDialog();
 *   dialog.alert('Cancel delivery?', 'This cannot be undone.', [...]);
 *
 * Outside the provider this is a no-op rather than a crash, so a screen
 * rendered in isolation does not explode. If a dialog does not appear on
 * device, the provider is missing from app/_layout.tsx.
 */
export function useSeirsDialog(): SeirsDialogContextValue {
  return useContext(SeirsDialogContext);
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    // No Shadows.* here on purpose. The card is opaque but the backdrop
    // behind it is not, and an Android elevation under a translucent
    // parent draws its shadow through the scrim and reads as a second
    // box behind the card: the phantom-nested-box artifact found on the
    // driver ACTIVE JOB card. The border carries the separation.
    gap: Spacing.sm,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    lineHeight: 23,
  },
  messageScroll: {
    maxHeight: 260,
  },
  message: {
    fontSize: FontSize.base,
    lineHeight: 21,
  },
  // Roughly four full-height buttons before it starts scrolling, which
  // keeps the title and message on screen with a long option list.
  actionsScroll: {
    maxHeight: BUTTON_MIN_HEIGHT * 4 + Spacing.sm * 4,
    flexGrow: 0,
  },
  actions: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  actionsRow:     { flexDirection: 'row' },
  actionsStacked: { flexDirection: 'column' },
  button: {
    minHeight: BUTTON_MIN_HEIGHT,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    overflow: 'hidden',
  },
  buttonRow:     { flex: 1 },
  buttonStacked: { width: '100%' },
  buttonText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
});
