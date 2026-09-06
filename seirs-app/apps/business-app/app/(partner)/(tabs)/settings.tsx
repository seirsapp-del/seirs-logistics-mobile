import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Image,
  Switch, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { partnerApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useColors, useTheme } from '@/context/ThemeContext';

import { alertDialog } from '@/components/SeirsDialog';
import { tx } from '@/i18n/tx';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type DayId = typeof DAYS[number];

interface DaySchedule { enabled: boolean; start: string; end: string; }

/**
 * The UI says Mon, the server says mon.
 *
 * Exactly the mapping the rider schedule screen uses, and deliberately
 * the same shape end to end: one withinWorkingHours on the server reads
 * both, so a shop and a rider cannot drift into two different answers to
 * "are they open right now".
 */
const API_KEY: Record<DayId, string> = {
  Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun',
};
const toApi = (h: Record<DayId, DaySchedule>) =>
  Object.fromEntries(Object.entries(API_KEY).map(([ui, api]) => [api, h[ui as DayId]]));

/**
 * Half hours, not whole ones.
 *
 * The rider screen offers 24 whole hours because a shift starting at
 * 07:30 is unusual. A shop is the opposite: opening at 7:30 and closing
 * at 18:30 is ordinary in Lagos, and rounding a real trading day to the
 * hour is the kind of small lie that ends with somebody standing outside
 * a shut shutter holding a parcel.
 */
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2), m = i % 2 ? '30' : '00';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { value: `${String(h).padStart(2, '0')}:${m}`, label: `${h12}:${m} ${h < 12 ? 'AM' : 'PM'}` };
});

const fmtTime = (t: string) => TIME_OPTIONS.find(o => o.value === t)?.label ?? t;

interface StoreSettings {
  storeName:       string;
  storeAddress:    string;
  phone:           string;
  maxCapacity:     number;
  operatingDays:   string[];
  openTime:        string;
  closeTime:       string;
  notifyNewPackage: boolean;
  notifyPickup:    boolean;
  notifyPayout:    boolean;
  /**
   * Read-only, and already arriving.
   *
   * GET /partner/settings returns the whole store row, so both of these
   * have been in the response all along and were simply never typed or
   * used. Not in `allowed` on the server's update, so they cannot be
   * written from here, which is right: a store code is issued, not
   * chosen, and the storefront photo is a KYC document reviewed on its
   * own.
   */
  storeCode?:          string | null;
  storefrontPhotoUrl?: string | null;
  /**
   * The APPROVED storefront photo, which is not the same thing as the
   * column above. storefrontPhotoUrl is written the moment a file is
   * uploaded, so rendering it would put an unreviewed image up as the
   * shop own picture. This one has been through review.
   */
  approvedStorefrontPhotoUrl?: string | null;
}

export default function PartnerSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { isDark } = useTheme();
  const { user, logout } = useAuth();

  const [settings, setSettings] = useState<StoreSettings>({
    storeName:        user?.storeName ?? '',
    storeAddress:     '',
    phone:            '',
    maxCapacity:      50,
    operatingDays:    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    openTime:         '08:00',
    closeTime:        '18:00',
    notifyNewPackage: true,
    notifyPickup:     true,
    notifyPayout:     true,
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  /**
   * Per-day opening hours.
   *
   * null until the shop answers, and null is what gets SENT until they
   * do. That matters more than it looks: every store row was created
   * with Mon to Sat, 08:00 to 18:00 that no owner ever chose, so writing
   * those up as if they were an answer would tell the server this shop
   * is closed on Sundays on nobody's authority. A shop with no hours is
   * treated as always open, which at worst means a parcel it can refuse.
   */
  const [hours, setHours] = useState<Record<DayId, DaySchedule> | null>(null);
  const [pickerOpen, setPickerOpen] = useState<{ day: DayId; field: 'start' | 'end' } | null>(null);

  useEffect(() => {
    partnerApi.getSettings?.()
      .then((d: any) => {
        if (!d) return;
        setSettings((prev) => ({ ...prev, ...d }));
        if (d.workingHours) {
          setHours(Object.fromEntries(DAYS.map((ui) => [
            ui,
            d.workingHours[API_KEY[ui]] ?? { enabled: false, start: '08:00', end: '18:00' },
          ])) as Record<DayId, DaySchedule>);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof StoreSettings>(key: K, val: StoreSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: val }));

  const toggleDay = (day: string) => {
    setSettings((s) => ({
      ...s,
      operatingDays: s.operatingDays.includes(day)
        ? s.operatingDays.filter((d) => d !== day)
        : [...s.operatingDays, day],
    }));
  };

  /**
   * Ask our team for a new shop name. Never applies it.
   *
   * A modal with both fields rather than chained alerts: the reason is the
   * part a reviewer actually needs, and asking for it in a second popup
   * after the name is how it arrives empty every time.
   */
  const [nameAsk,    setNameAsk]    = useState(false);
  const [wantedName, setWantedName] = useState('');
  const [whyName,    setWhyName]    = useState('');
  const [askingName, setAskingName] = useState(false);

  const sendNameChange = async () => {
    if (!wantedName.trim()) return;
    setAskingName(true);
    try {
      const r = await partnerApi.requestFieldChange({
        field: 'storeName', requested: wantedName.trim(), reason: whyName.trim() || undefined,
      });
      setNameAsk(false); setWantedName(''); setWhyName('');
      alertDialog('Sent', r?.message ?? 'Our team will come back to you.');
    } catch (e: any) {
      alertDialog('Not sent', e?.message ?? 'Try again in a moment.');
    } finally { setAskingName(false); }
  };

  const handleSave = async () => {
    if (!settings.storeName.trim()) {
      alertDialog('Validation', 'Store name is required.');
      return;
    }
    setSaving(true);
    try {
      // workingHours goes only once the shop has actually set it, so an
      // untouched store stays null on the server rather than being
      // handed the seeded defaults as though it had chosen them.
      /**
       * The locked fields are not sent at all.
       *
       * The server refuses a storeName or storeAddress that differs from
       * what it holds, and this screen posts its whole state on save. So
       * leaving them in worked only for as long as they happened to match,
       * and any drift would have started failing every ordinary save with
       * a message about a field the shopkeeper never touched.
       */
      const { storeName: _n, storeAddress: _a, ...editable } = settings as any;
      await partnerApi.updateSettings(hours ? { ...editable, workingHours: toApi(hours) } : editable);
      alertDialog('Saved', 'Your store settings have been updated.');
    } catch (e: any) {
      alertDialog('Error', e.message ?? 'Could not save settings.');
    } finally { setSaving(false); }
  };

  if (loading) {
    return <View style={[styles.centered, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Text style={[styles.heading, { color: colors.text }]}>{tx('auto.settings.storeSettings', 'Store Settings')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecond }]}>{tx('auto.settings.storeInformation', 'Store Information')}</Text>

          <Text style={[styles.label, { color: colors.textSecond }]}>{tx('auto.settings.storeName', 'Store Name')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={settings.storeName}
            onChangeText={(v) => set('storeName', v)}
            placeholder="My Partner Store"
            placeholderTextColor={colors.textThird}
            {...({ editable: false } as any)}
          />
          {/* Locked, with a way through.

              The shop name is what a customer reads when choosing where to
              leave a parcel, and it is what an admin approved. A shop
              approved as one business quietly becoming another is a trust
              problem whether or not the building moved.

              But a lock with no route through it is not a safeguard, it is
              a dead end: the shopkeeper still needs it changed, so they
              ring somebody or they stop telling us, and either way the
              record gets worse rather than safer. */}
          <Pressable
            style={[styles.moveBtn, { borderColor: colors.primary }]}
            onPress={() => setNameAsk(true)}
          >
            <Icon name="MessageSquare" size={16} color={colors.primary} strokeWidth={1.75} />
            <Text style={[styles.moveBtnText, { color: colors.primary }]}>{tx('auto.settings.askToChangeTheShop', 'Ask to change the shop name')}</Text>
          </Pressable>

          {/* The address is READ-ONLY, and moving is a request.

              It used to be a typing box like the one above it, and that was
              the most damaging field on the screen. Changing the text did
              NOT move the map pin: the save does not even accept the pin
              fields. So a shop that relocated looked correct everywhere
              while customers and riders kept being sent to the building it
              had left, and nothing warned anyone.

              An address is not like a shop name. It decides where a person
              carrying a parcel actually walks, and it is what the premises
              photos were checked against. So it changes the way the rider
              vehicle change works: a request, reviewed by a person, with
              the new photos attached, and the live address untouched until
              it is approved. */}
          <Text style={[styles.label, { color: colors.textSecond }]}>{tx('auto.settings.storeAddress', 'Store Address')}</Text>
          <View style={[styles.readonlyBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.readonlyText, { color: colors.text }]}>
              {settings.storeAddress || 'No address on file'}
            </Text>
          </View>
          <Pressable
            style={[styles.moveBtn, { borderColor: colors.primary }]}
            onPress={() => router.push('/(partner)/move' as any)}
          >
            <Icon name="MapPin" size={16} color={colors.primary} strokeWidth={1.75} />
            <Text style={[styles.moveBtnText, { color: colors.primary }]}>{tx('auto.settings.movingToANewShop', 'Moving to a new shop?')}</Text>
          </Pressable>
          {/* Says what actually happens, which it did not.

              This read "You keep trading at this address until the new one
              is approved", written before the founder's override made
              filing a move pause new parcels immediately. So a shop read a
              promise of business as usual, filed a move, and their intake
              stopped with nothing on screen explaining it.

              Worse than a silent failure: the screen was actively telling
              them the opposite of what the code did. Found by the other
              session reading the screen on a phone, which is the only way
              this kind of contradiction ever shows up, because both halves
              are individually correct. */}
          <Text style={[styles.hoursHint, { color: colors.textSecond }]}>
            Customers and riders are sent here, so a change has to be checked by our team
            first. While we check it, new parcels stop coming to you, and you should keep
            handing back anything you are already holding.
          </Text>

          <Text style={[styles.label, { color: colors.textSecond }]}>{tx('auto.settings.phoneNumber', 'Phone Number')}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={settings.phone}
            onChangeText={(v) => set('phone', v)}
            placeholder="08012345678"
            placeholderTextColor={colors.textThird}
            keyboardType="phone-pad"
          />

          <Text style={[styles.label, { color: colors.textSecond }]}>Max Capacity (packages)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
            value={String(settings.maxCapacity)}
            onChangeText={(v) => set('maxCapacity', parseInt(v, 10) || 0)}
            keyboardType="number-pad"
            placeholder="50"
            placeholderTextColor={colors.textThird}
          />
        </View>

        {/* When this shop is open, one row per day.

            This was a row of day chips plus two free-text time boxes, so
            every open day shared a single window: a shop that closes at
            two on Saturday could not say so, and neither could one that
            opens in the evening. The boxes took any text at all, which
            meant "8am", "0800" and an empty string all saved happily and
            none of them parsed.

            Rows with a switch and two pickers is what the rider schedule
            screen does, and this sends the identical shape to the same
            server check, so a shop and a rider are read by one rule.

            The change is never blocked, but if this shop is holding
            parcels when it changes, support is told so someone can check
            those parcels can still be collected. That is the whole point
            of asking: a partner who shuts quietly while holding somebody
            else's package is the failure this exists to catch. */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecond }]}>{tx('auto.settings.openingHours', 'Opening Hours')}</Text>

          {!hours ? (
            <>
              <Text style={[styles.hoursHint, { color: colors.textSecond }]}>
                You have not set your opening hours yet, so your shop shows as open at all
                times. Set them and customers see exactly when they can reach you.
              </Text>
              <Pressable
                style={[styles.setHoursBtn, { borderColor: colors.primary }]}
                onPress={() => setHours(Object.fromEntries(DAYS.map((d) => [
                  d,
                  // Seeded from the shop's own saved times, not from a
                  // blank slate, so the first tap shows something close to
                  // the truth instead of asking them to start over.
                  {
                    enabled: settings.operatingDays.includes(d),
                    start:   settings.openTime  || '08:00',
                    end:     settings.closeTime || '18:00',
                  },
                ])) as Record<DayId, DaySchedule>)}
              >
                <Icon name="Clock" size={16} color={colors.primary} strokeWidth={1.75} />
                <Text style={[styles.setHoursBtnText, { color: colors.primary }]}>{tx('auto.settings.setYourOpeningHours', 'Set your opening hours')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              {DAYS.map((day, i) => (
                <View
                  key={day}
                  style={[
                    styles.dayRow,
                    i < DAYS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  ]}
                >
                  <Switch
                    value={hours[day].enabled}
                    onValueChange={() => setHours((h) => h && ({ ...h, [day]: { ...h[day], enabled: !h[day].enabled } }))}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                  <Text style={[styles.dayLabel, { color: hours[day].enabled ? colors.text : colors.textThird }]}>
                    {day}
                  </Text>

                  {hours[day].enabled ? (
                    <View style={styles.timePills}>
                      <Pressable
                        style={[styles.timePill, { backgroundColor: colors.background, borderColor: colors.border }]}
                        onPress={() => setPickerOpen({ day, field: 'start' })}
                      >
                        <Text style={[styles.timePillText, { color: colors.text }]}>{fmtTime(hours[day].start)}</Text>
                      </Pressable>
                      <Text style={[styles.timeSep, { color: colors.textThird }]}>to</Text>
                      <Pressable
                        style={[styles.timePill, { backgroundColor: colors.background, borderColor: colors.border }]}
                        onPress={() => setPickerOpen({ day, field: 'end' })}
                      >
                        <Text style={[styles.timePillText, { color: colors.text }]}>{fmtTime(hours[day].end)}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={[styles.closedText, { color: colors.textThird }]}>{tx('auto.settings.closed', 'Closed')}</Text>
                  )}
                </View>
              ))}

              <Text style={[styles.hoursHint, { color: colors.textSecond }]}>
                {/* Said plainly, because a closing time before an opening
                    time reads like a mistake and is not one: a shop open
                    from 6pm until 2am is a normal Lagos kiosk. */}
                A closing time earlier than the opening time means you stay open past
                midnight. Customers are never charged storage for days you are closed.
              </Text>
            </>
          )}
        </View>

        {/* One long list, not a wheel: a wheel needs a native picker per
            platform, and this screen already opens plain modals elsewhere. */}
        <Modal visible={nameAsk} transparent animationType="fade" onRequestClose={() => setNameAsk(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setNameAsk(false)}>
            <Pressable
              style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>{tx('auto.settings.askToChangeTheShop', 'Ask to change the shop name')}</Text>
              <Text style={[styles.hoursHint, { color: colors.textSecond, marginTop: 0 }]}>
                Our team checks it first, so customers keep seeing the name we approved. Nothing
                changes until they say so.
              </Text>

              <Text style={[styles.label, { color: colors.textSecond, marginTop: 12 }]}>{tx('auto.settings.newName', 'New name')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={wantedName}
                onChangeText={setWantedName}
                placeholder={settings.storeName}
                placeholderTextColor={colors.textThird}
              />

              <Text style={[styles.label, { color: colors.textSecond, marginTop: 10 }]}>{tx('auto.settings.whyIsItChanging', 'Why is it changing?')}</Text>
              <TextInput
                style={[styles.input, styles.multiline, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                value={whyName}
                onChangeText={setWhyName}
                placeholder="e.g. the business was renamed"
                placeholderTextColor={colors.textThird}
                multiline
              />

              <Pressable
                style={[styles.setHoursBtn, {
                  borderColor: wantedName.trim() ? colors.primary : colors.border,
                  marginTop: 14,
                }]}
                onPress={sendNameChange}
                disabled={!wantedName.trim() || askingName}
              >
                <Text style={[styles.setHoursBtnText, {
                  color: wantedName.trim() ? colors.primary : colors.textThird,
                }]}>
                  {askingName ? 'Sending...' : 'Send the request'}
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={!!pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(null)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(null)}>
            <Pressable
              style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {pickerOpen ? `${pickerOpen.day}: ${pickerOpen.field === 'start' ? 'opens at' : 'closes at'}` : ''}
              </Text>
              <ScrollView style={{ maxHeight: 320 }}>
                {TIME_OPTIONS.map((o) => {
                  const current = pickerOpen && hours ? hours[pickerOpen.day][pickerOpen.field] === o.value : false;
                  return (
                    <Pressable
                      key={o.value}
                      style={[styles.timeOption, current && { backgroundColor: colors.background }]}
                      onPress={() => {
                        if (!pickerOpen) return;
                        setHours((h) => h && ({
                          ...h,
                          [pickerOpen.day]: { ...h[pickerOpen.day], [pickerOpen.field]: o.value },
                        }));
                        setPickerOpen(null);
                      }}
                    >
                      <Text style={[styles.timeOptionText, { color: current ? colors.primary : colors.text }]}>
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* B-10.7: three per-event switches used to live here while the
            Profile tab had deliberately REMOVED its Notifications row on
            the grounds that everything always sends, and notifications.tsx
            records that push has not shipped. A partner could switch off
            "Payout Processed" and nothing changed. One position, stated
            once: put the switches back when there is something behind
            them. The notify* fields stay on StoreSettings so the saved
            record round-trips unchanged. */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecond }]}>{tx('auto.settings.notifications', 'Notifications')}</Text>
          <View style={[styles.notifRow, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.notifLabel, { color: colors.text }]}>{tx('auto.settings.everyStoreAlertIsOn', 'Every store alert is on')}</Text>
              <Text style={[styles.notifSub, { color: colors.textThird }]}>
                Package arrivals, pickups and payouts all reach you. There is nothing to switch off yet.
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.textSecond }]}>{tx('auto.settings.account', 'Account')}</Text>
          {/**
            * The SHOP, not the shopkeeper (founder, 2026-09-03).
            *
            * This read "Yusuf" over the owner's personal SEIRS ID, which
            * on a partner account is a CUST- code: the id of the person
            * who signed up, not of the store this screen configures. A
            * partner looking for their store code to read down a phone
            * line found somebody's customer number instead.
            *
            * The storefront photo doubles as the picture, which is the
            * one image every store already has and the one a partner
            * actually recognises as theirs.
            */}
          <View style={styles.accountRow}>
            {settings.approvedStorefrontPhotoUrl ? (
              <Image
                source={{ uri: settings.approvedStorefrontPhotoUrl }}
                style={styles.storeAvatar}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.storeAvatar, styles.storeAvatarEmpty, { backgroundColor: colors.surfaceSecond }]}>
                <Icon name="Store" size={20} color={colors.textThird} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.accountLabel, { color: colors.text }]} numberOfLines={1}>
                {settings.storeName || 'Your store'}
              </Text>
              {settings.storeCode ? (
                <Text style={{ fontSize: 12, color: colors.textThird, marginTop: 2, letterSpacing: 0.5 }}>
                  Store ID: {settings.storeCode}
                </Text>
              ) : null}
              {/* Kept because it is how they sign in, and subordinate
                  because this card is about the store now. */}
              <Text style={[styles.accountEmail, { color: colors.textSecond }]} numberOfLines={1}>
                {user?.email}
              </Text>
            </View>
          </View>
          {/* Messages and Language had NO entry point anywhere once they
              left the tab bar (founder 2026-08-16: "are you hiding the
              rest or organising it"). Hiding a screen without giving it a
              home is just orphaning it, so they live here, where a
              partner looks for account and preference settings. */}
          <Pressable
            style={[styles.linkRow, { borderTopColor: colors.border }]}
            onPress={() => router.push('/(partner)/messages' as any)}
          >
            <Icon name="MessageSquare" size={16} color={colors.textSecond} />
            <Text style={[styles.linkRowText, { color: colors.text }]}>Messages &amp; support</Text>
            <Icon name="ChevronRight" size={16} color={colors.textThird} />
          </Pressable>
          {/* Added with the payout rail (2026-09-03). A shop cannot be
              approved without an account, so this row is the way through
              that gate and must never be hard to find. */}
          <Pressable
            style={[styles.linkRow, { borderTopColor: colors.border }]}
            onPress={() => router.push('/(partner)/payout-account' as any)}
          >
            <Icon name="Banknote" size={16} color={colors.textSecond} />
            <Text style={[styles.linkRowText, { color: colors.text }]}>{tx('auto.settings.payoutAccount', 'Payout account')}</Text>
            <Icon name="ChevronRight" size={16} color={colors.textThird} />
          </Pressable>
          {/* The statement lives here as well as on Payout History
              (founder, 2026-09-03). Earnings is where you look when you
              are checking a number; Account is where you look when you
              want the document itself. */}
          <Pressable
            style={[styles.linkRow, { borderTopColor: colors.border }]}
            onPress={() => router.push('/(partner)/statement' as any)}
          >
            <Icon name="Receipt" size={16} color={colors.textSecond} />
            <Text style={[styles.linkRowText, { color: colors.text }]}>{tx('auto.settings.statement', 'Statement')}</Text>
            <Icon name="ChevronRight" size={16} color={colors.textThird} />
          </Pressable>
          {/* Two rows, because these were one row meaning two things.

              "Documents" opened the shop's own ID and CAC uploads, while the
              same word in the customer, driver and business apps means
              letters SEIRS sent YOU. The notification an admin's document
              fires says "is now in your Documents", so it pointed a partner
              at a screen showing the opposite, and the letter was invisible
              unless they wandered into the business side of the app.

              Now Documents means one thing in all four places, and the
              uploads have their own row. Called "Store verification" and not
              "KYC" deliberately: KYC is banking jargon a shopkeeper should
              not have to learn, and it does not translate into the six
              languages we ship. */}
          <Pressable
            style={[styles.linkRow, { borderTopColor: colors.border }]}
            onPress={() => router.push('/(partner)/documents' as any)}
          >
            <Icon name="FileText" size={16} color={colors.textSecond} />
            <Text style={[styles.linkRowText, { color: colors.text }]}>{tx('auto.settings.documents', 'Documents')}</Text>
            <Icon name="ChevronRight" size={16} color={colors.textThird} />
          </Pressable>
          <Pressable
            style={[styles.linkRow, { borderTopColor: colors.border }]}
            onPress={() => router.push('/(partner)/verification' as any)}
          >
            <Icon name="ShieldCheck" size={16} color={colors.textSecond} />
            <Text style={[styles.linkRowText, { color: colors.text }]}>{tx('auto.settings.storeVerification', 'Store verification')}</Text>
            <Icon name="ChevronRight" size={16} color={colors.textThird} />
          </Pressable>
          <Pressable
            style={[styles.linkRow, { borderTopColor: colors.border }]}
            onPress={() => router.push('/(partner)/language' as any)}
          >
            <Icon name="Globe" size={16} color={colors.textSecond} />
            <Text style={[styles.linkRowText, { color: colors.text }]}>{tx('auto.settings.language', 'Language')}</Text>
            <Icon name="ChevronRight" size={16} color={colors.textThird} />
          </Pressable>
        </View>

        <Pressable
          style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>{tx('auto.settings.saveChanges', 'Save Changes')}</Text>}
        </Pressable>

        {/* Sign out sits under Save Changes rather than inside the account
            card (founder, 2026-09-03). It is not a setting, so it does not
            belong in a list of them, and leaving the store is the last
            thing on the screen before the one genuinely destructive action.

            Its own outlined button now: as a card row it carried a top
            divider that only made sense with rows above it. */}
        <Pressable
          style={[styles.logoutBtn, SIGN_OUT_TINT(isDark, colors.error)]}
          onPress={logout}
        >
          <Icon name="LogOut" size={16} color={colors.error} />
          <Text style={[styles.logoutText, { color: colors.error }]}>{tx('auto.settings.signOut', 'Sign Out')}</Text>
        </Pressable>

        <ClosingSection storeId={user?.partnerStoreId ?? ''} />
      </ScrollView>
    </View>
  );
}

/**
 * The sign-out tint the founder picked, 2026-09-03.
 *
 * The light pair is the customer app's, verbatim: #FEF2F2 ground and
 * #FECACA edge, red-50 and red-200. He looked at both treatments and
 * chose that one, so the light theme gets exactly it rather than my
 * approximation of it.
 *
 * The dark pair exists because those two are LIGHT-MODE values and
 * nothing else. Used bare on his dark default they paint a near-white
 * slab under red text, which is the fault this app has already been
 * caught for three times in (auth). So dark mode gets the same idea
 * expressed against a dark ground: the palette error at low alpha,
 * which sits on ink900 the way #FEF2F2 sits on cloud.
 *
 * Both live here rather than in shared/theme because that file belongs
 * to the other session today. This is the right shape for two tokens,
 * errorSoft and errorSoftBorder, and it should move there when the
 * theme is free.
 */
const SIGN_OUT_TINT = (isDark: boolean, error: string) => (isDark
  ? { backgroundColor: error + '1F', borderColor: error + '66' }
  : { backgroundColor: '#FEF2F2',    borderColor: '#FECACA' });

const styles = StyleSheet.create({
  readonlyBox:   { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  readonlyText:  { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 21 },
  moveBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                   borderWidth: 1, borderRadius: 10, paddingVertical: 12, marginTop: 10 },
  moveBtnText:   { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  dayRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  dayLabel:      { fontSize: 15, fontFamily: 'Inter_600SemiBold', width: 44 },
  timePills:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  timePill:      { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  timePillText:  { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  timeSep:       { fontSize: 12, fontFamily: 'Inter_400Regular' },
  closedText:    { fontSize: 13, fontFamily: 'Inter_400Regular', marginLeft: 'auto' },
  hoursHint:     { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17, marginTop: 10 },
  setHoursBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                   borderWidth: 1, borderRadius: 10, paddingVertical: 12, marginTop: 12 },
  setHoursBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 32 },
  modalCard:     { borderRadius: 14, borderWidth: 1, padding: 16 },
  modalTitle:    { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 10 },
  timeOption:    { paddingVertical: 11, paddingHorizontal: 10, borderRadius: 8 },
  timeOptionText:{ fontSize: 14, fontFamily: 'Inter_500Medium' },

  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:        { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  heading:       { fontSize: 20, fontWeight: '800' },

  section:       { borderRadius: 14, padding: 16, borderWidth: 1, marginBottom: 12 },
  sectionTitle:  { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },

  label:         { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input:         {
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, fontSize: 15, marginBottom: 14,
  },
  multiline:     { height: 68, textAlignVertical: 'top', paddingTop: 12 },

  daysRow:       { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  dayBtn:        { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  dayBtnText:    { fontSize: 13, fontWeight: '600' },

  timeRow:       { flexDirection: 'row', gap: 12 },

  notifRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1 },
  notifLabel:    { fontSize: 15, fontWeight: '600' },
  notifSub:      { fontSize: 13, marginTop: 2 },

  accountRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  accountLabel:  { fontSize: 15, fontWeight: '700' },
  accountEmail:  { fontSize: 13, marginTop: 1 },

  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: 1,
  },
  linkRowText: { flex: 1, fontSize: 15, fontWeight: '600' },
  /**
   * Tinted, not filled.
   *
   * Filled solid #EF4444 made signing out the loudest thing on a screen
   * whose only irreversible action is Close This Store. This is the same
   * treatment the customer app uses, and the same one delete-account.tsx
   * already uses two folders away: error at 8% for the ground, error at
   * 33% for the edge, error at full strength for the text and icon.
   *
   * Derived from colors.error rather than copied from customer's literal
   * #FEF2F2 and #FECACA, which are in no palette and are light-mode
   * values: on a dark phone they render as a near-white slab, which is
   * the exact fault this app keeps being caught for.
   */
  logoutBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                   paddingVertical: 16, borderRadius: 14, borderWidth: 1.5, marginTop: 10 },
  // Colour comes from the theme. This was #DC2626, which is in no palette:
  // a fixed dark red that the dark theme never gets to lighten.
  logoutText:    { fontSize: 16, fontWeight: '700' },
  storeAvatar:      { width: 44, height: 44, borderRadius: 10 },
  storeAvatarEmpty: { alignItems: 'center', justifyContent: 'center' },

  saveBtn:       { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText:   { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Closing section. red semantic colors retained for destructive action
  closingSection: { backgroundColor: '#FFFBFB', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#FCA5A5', marginTop: 24 },
  closingTitle:   { fontSize: 15, fontWeight: '800', color: '#991B1B', marginBottom: 4 },
  closingSub:     { fontSize: 13, color: '#7F1D1D', lineHeight: 17, marginBottom: 12 },
  blockerCard:    { flexDirection: 'row', gap: 10, padding: 10, borderRadius: 10, backgroundColor: '#FEF3C7', marginBottom: 8, alignItems: 'flex-start' },
  blockerCount:   { fontSize: 12, fontWeight: '800', color: '#92400E', backgroundColor: '#FCD34D', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  blockerText:    { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 17 },
  closeBtn:       { backgroundColor: '#DC2626', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  closeBtnDisabled: { backgroundColor: '#F3F4F6' },
  closeBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  closeBtnTextDisabled: { color: '#9CA3AF' },
  readyTip:       { fontSize: 13, color: '#16A34A', marginBottom: 8, fontWeight: '600' },
});

// ── Closing flow ──────────────────────────────────────────────────────────
function ClosingSection({ storeId }: { storeId: string }) {
  const [readiness, setReadiness] = useState<{
    ready: boolean;
    blockers: Array<{ type: string; count: number; action: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    partnerApi.storeDeletionReadiness(storeId)
      .then(r => setReadiness({ ready: r.ready, blockers: r.blockers ?? [] }))
      .catch(() => setReadiness({ ready: false, blockers: [] }))
      .finally(() => setLoading(false));
  }, [storeId]);

  const handleClose = () => {
    if (!readiness?.ready) return;
    alertDialog(
      'Close partner store?',
      'This pauses incoming bookings, removes you from the customer map, and starts the offboarding workflow. Final wallet payout follows the next regular cycle.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:    'Close store',
          style:   'destructive',
          onPress: async () => {
            try {
              await partnerApi.storeSetStatus(storeId, 'paused');
              alertDialog('Store paused', 'Bookings are off. Contact ops to complete offboarding when ready.');
            } catch (e: any) {
              alertDialog('Could not close', e?.message ?? 'Try again.');
            }
          },
        },
      ],
    );
  };

  if (!storeId) return null;

  return (
    <View style={styles.closingSection}>
      <Text style={styles.closingTitle}>{tx('auto.settings.closeThisStore', 'Close This Store')}</Text>
      <Text style={styles.closingSub}>
        Permanently shut down this partner store. You cannot close while packages are still in your custody.
      </Text>

      {loading && <ActivityIndicator color="#DC2626" />}

      {readiness && readiness.ready && (
        <Text style={styles.readyTip}>✓ Store is empty. safe to close</Text>
      )}

      {readiness && !readiness.ready && readiness.blockers.length > 0 && (
        <>
          {readiness.blockers.map((b, i) => (
            <View key={i} style={styles.blockerCard}>
              <Text style={styles.blockerCount}>{b.count}</Text>
              <Text style={styles.blockerText}>{b.action}</Text>
            </View>
          ))}
        </>
      )}

      <Pressable
        style={[styles.closeBtn, !readiness?.ready && styles.closeBtnDisabled]}
        disabled={!readiness?.ready}
        onPress={handleClose}
      >
        <Text style={[styles.closeBtnText, !readiness?.ready && styles.closeBtnTextDisabled]}>
          {readiness?.ready ? 'Close store' : 'Resolve blockers first'}
        </Text>
      </Pressable>
    </View>
  );
}
