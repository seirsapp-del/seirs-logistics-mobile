/**
 * Business · CSV Bulk Upload: preview + confirm flow.
 *
 * Spec V8 §⑬ schema. Two-step UX:
 *   1. Pick file → POST to /business/deliveries/csv → backend parses,
 *      geocodes every address, validates each row, groups rows by
 *      booking_ref, prices each booking. Returns a preview.
 *   2. User reviews the preview: per-row errors flagged in red, valid
 *      bookings show their price. User taps Confirm.
 *   3. Frontend iterates valid bookings and calls businessApi.create-
 *      Delivery for each (the same endpoint as the in-app new-delivery
 *      form). Delivery + DeliveryStop rows only: the wallet debit this
 *      comment used to describe was removed at 128-131, because senders
 *      hold no balance with SEIRS.
 *
 * Nothing is charged anywhere in this flow. Confirm creates UNPAID
 * bookings and each is paid per booking from Deliveries. Invalid
 * bookings are shown as warnings: the user can fix locally and
 * re-upload, OR proceed to create only the valid ones.
 */
import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Icon } from '@/components/Icon';
import { businessApi } from '@/services/api';
import { useColors, useTheme } from '@/context/ThemeContext';
import { TERMS_URL } from '@/constants/config';

// Shape of the backend preview response: mirrors what
// business.service.uploadCsvDeliveries() returns.
interface ParsedRow {
  lineNumber:    number;
  bookingRef:    string | null;
  pickup:        { address: string; lat?: number; lng?: number };
  drop:          { address: string; lat?: number; lng?: number };
  recipientName: string;
  recipientPhone: string;
  category:      string;
  weightKg:      number;
  quantity:      number;
  vehicleOverride?: string;
  stopOrder?:    number;
  notes?:        string;
  scheduledAt?:  string;
  errors:        string[];
}
interface BookingPreview {
  bookingRef:    string | null;
  rows:          ParsedRow[];
  valid:         boolean;
  errors:        string[];
  pricePreview:  any | null;
}
interface CsvPreviewResponse {
  totalRows:     number;
  bookings:      BookingPreview[];
  grandTotal:    number;
  // walletBalance / canAfford dropped 2026-08-23 (B-4.4): neither was ever
  // rendered after the balance check came out, and senders hold no balance
  // with SEIRS to check against.
  bulkDiscountApplied: boolean;
  bulkDiscountPercent: number;
}

const TEMPLATE_HEADERS = [
  'booking_ref', 'pickup_address', 'stop_order', 'recipient_name',
  'recipient_phone', 'dropoff_address', 'category', 'weight_kg',
  'quantity', 'vehicle_override', 'scheduled_at', 'notes',
];

const TEMPLATE_CSV =
  TEMPLATE_HEADERS.join(',') + '\n' +
  ',15 Adeola Odeku Lekki Lagos,,Adebayo Yusuf,08012345678,7 Marina Lagos Island,documents,2,1,,,\n' +
  ',15 Adeola Odeku Lekki Lagos,,Chioma Eze,08023456789,5 Allen Avenue Ikeja,fragile,3.5,1,,,Call before arrival\n' +
  'MULTI-A,15 Adeola Odeku Lekki Lagos,1,Tunde Bello,08045678901,18 Awolowo Rd Ikoyi,documents,2,1,,,\n' +
  'MULTI-A,15 Adeola Odeku Lekki Lagos,2,Adaeze Okeke,08056789012,3 Falomo Bridge Ikoyi,documents,2,1,,,\n';

export default function CsvUploadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { isDark } = useTheme();

  const [file,     setFile]     = useState<{ name: string; uri: string } | null>(null);
  const [preview,  setPreview]  = useState<CsvPreviewResponse | null>(null);
  const [step,     setStep]     = useState<'pick' | 'preview' | 'creating' | 'done'>('pick');
  const [progress, setProgress] = useState({ done: 0, failed: 0, total: 0 });
  const [error,    setError]    = useState('');
  /**
   * Bulk bookings used to call createDelivery with no termsAccepted at all,
   * so a batch of forty captured no consent to the failed-delivery terms
   * while the single-booking flow gates payment on exactly that (B-10.3).
   */
  const [tcAgreed, setTcAgreed] = useState(false);

  const pickFile = async () => {
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setFile({ name: result.assets[0].name, uri: result.assets[0].uri });
      setPreview(null);
      setStep('pick');
    } catch {
      setError('Could not read the file. Please check it is a valid CSV.');
    }
  };

  const fetchPreview = async () => {
    if (!file) return;
    setError('');
    setStep('preview');
    try {
      const res = await businessApi.uploadCsv(file.uri, file.name) as CsvPreviewResponse;
      setPreview(res);
    } catch (e: any) {
      setError(e?.message ?? 'Upload failed. Please try again.');
      setStep('pick');
    }
  };

  const confirmCreate = async () => {
    if (!preview) return;
    if (!tcAgreed) {
      Alert.alert('Agree to the terms', 'Tick the box to accept the SEIRS Terms of Service, including what happens if a delivery fails.');
      return;
    }
    const valid = preview.bookings.filter(b => b.valid);
    if (valid.length === 0) {
      Alert.alert('Nothing to create', 'There are no valid bookings in this CSV. Fix the errors and re-upload.');
      return;
    }
    // No balance check: senders do not hold funds with SEIRS, and each
    // booking is paid at checkout. This used to refuse the batch and tell
    // the sender to "top up", which would have blocked every bulk upload
    // once the legacy credit path was switched off (2026-08-16).
    setStep('creating');
    setProgress({ done: 0, failed: 0, total: valid.length });

    let done   = 0;
    let failed = 0;
    for (const booking of valid) {
      try {
        const sorted = [...booking.rows].sort((a, b) => (a.stopOrder ?? 0) - (b.stopOrder ?? 0));
        const first = sorted[0];
        const totalWeight = sorted.reduce((acc, r) => acc + (r.weightKg * (r.quantity ?? 1)), 0);
        await businessApi.createDelivery({
          pickupAddress: first.pickup.address,
          pickupLat:     first.pickup.lat!,
          pickupLng:     first.pickup.lng!,
          stops: sorted.map((r, idx) => ({
            address:        r.drop.address,
            lat:            r.drop.lat!,
            lng:            r.drop.lng!,
            recipientName:  r.recipientName,
            recipientPhone: r.recipientPhone,
            notes:          r.notes,
            sequenceOrder:  r.stopOrder ?? idx + 1,
          })),
          vehicleType:           booking.pricePreview?.vehicleType ?? 'motorcycle',
          categoryCode:          first.category,
          weightKg:              totalWeight,
          packageDescription:    sorted.map(r => r.notes).filter(Boolean).join(' · ') || undefined,
          km:                    booking.pricePreview?.km ?? 0,
          estimatedDriveMinutes: 0,
          scheduledAt:           first.scheduledAt,
          termsAccepted:         true,
          // NOTE: no quoteToken. The CSV preview endpoint prices each
          // booking but does not sign a quote pin, so the total on the
          // Create button is unpinned and the server may legitimately
          // charge something else (the other half of B-10.3). Signing a
          // pin per booking is a backend change.
        });
        done++;
      } catch {
        failed++;
      }
      setProgress({ done, failed, total: valid.length });
    }
    setStep('done');
  };

  /**
   * Hand over a real .csv file, not a wall of text.
   *
   * This used to open an Alert containing the headers and four example
   * rows. You cannot save an alert, open it in Excel, or hand it to
   * whoever keeps your spreadsheets: the one thing a template exists for
   * was the one thing it could not do (found on device 2026-08-19).
   *
   * Written to the cache and shared through the OS sheet, so it lands in
   * Drive, WhatsApp, email or Files like any other download.
   */
  const downloadTemplate = async () => {
    try {
      // expo-file-system's current API is Paths/File; the old
      // cacheDirectory + writeAsStringAsync helpers are gone.
      const file = new File(Paths.cache, 'seirs-bulk-template.csv');
      if (file.exists) file.delete();
      file.create();
      file.write(TEMPLATE_CSV);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: 'SEIRS bulk upload template',
          UTI: 'public.comma-separated-values-text',
        });
        return;
      }
      Alert.alert('Template saved', `Saved to ${file.uri}`);
    } catch (e: any) {
      Alert.alert(
        'Could not create the template',
        e?.message ?? 'Try again, or copy the column names from the help text above.',
      );
    }
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
      }]}>
        <Pressable onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>CSV Bulk Upload</Text>
        <Pressable onPress={downloadTemplate}>
          <Icon name="FileText" size={20} color={colors.accent} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 160 }}>

        {/* Instructions */}
        {/* Fixed #EBF3FF panel with #374151 body text. The old comment
            claimed it read cleanly against either background: it does not,
            it glares as a light card on a dark screen (B-10.8). */}
        <View style={[styles.infoBox, {
          backgroundColor: isDark ? '#3A7BD522' : '#EBF3FF',
          borderColor:     isDark ? '#3A7BD555' : '#BFDBFE',
        }]}>
          <Icon name="Info" size={16} color="#3A7BD5" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoTitle, { color: isDark ? '#93C5FD' : '#0F2B4C' }]}>How it works</Text>
            <Text style={[styles.infoText, { color: colors.text }]}>
              1. Pick your CSV file (template available via the icon top-right).{'\n'}
              2. We geocode addresses and price every booking on the server.{'\n'}
              3. Review the preview below: fix any flagged rows.{'\n'}
              {/* Said "wallet debited then". Senders hold no balance with
                  SEIRS: every booking is paid per booking through
                  Flutterwave, and only drivers and partner counters have
                  withdrawable earnings. */}
              4. Tap Create to book them. They land unpaid: pay for each from Deliveries.{'\n\n'}
              <Text style={styles.bold}>Group multi-stop bookings</Text> by giving rows the same{' '}
              <Text style={styles.bold}>booking_ref</Text>. Empty booking_ref = standalone single-stop.
            </Text>
          </View>
        </View>

        {/* Upload zone */}
        <Pressable style={[styles.dropzone, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={pickFile}>
          <View style={[styles.dropIcon, { backgroundColor: colors.primaryLight }]}>
            <Icon name="Upload" size={28} color={file ? '#16A34A' : colors.accent} />
          </View>
          {file ? (
            <>
              <Text style={[styles.dropTitle, { color: colors.text }]}>{file.name}</Text>
              <Text style={[styles.dropSub, { color: colors.textSecond }]}>Tap to change file</Text>
            </>
          ) : (
            <>
              <Text style={[styles.dropTitle, { color: colors.text }]}>Select CSV file</Text>
              <Text style={[styles.dropSub, { color: colors.textSecond }]}>Tap to browse your device</Text>
            </>
          )}
        </Pressable>

        {error !== '' && (
          <View style={styles.errorBox}>
            <Icon name="AlertCircle" size={16} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {file && step === 'pick' && (
          <Pressable style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={fetchPreview}>
            <Icon name="Upload" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Upload &amp; Preview</Text>
          </Pressable>
        )}

        {step === 'preview' && !preview && (
          <View style={[styles.spinnerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.spinnerText, { color: colors.textSecond }]}>Validating + geocoding + pricing every row…</Text>
          </View>
        )}

        {preview && <PreviewView preview={preview} />}

        {step === 'creating' && (
          <View style={[styles.spinnerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.spinnerText, { color: colors.textSecond }]}>
              Creating {progress.done + progress.failed} / {progress.total} bookings…
            </Text>
            {progress.failed > 0 && (
              <Text style={[styles.spinnerText, { color: '#DC2626' }]}>
                {progress.failed} failed so far
              </Text>
            )}
          </View>
        )}

        {step === 'done' && (
          <View style={[styles.doneCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Icon name="CheckCircle2" size={32} color="#16A34A" />
            <Text style={[styles.doneTitle, { color: colors.text }]}>Bookings created</Text>
            {/* This card said only "Created N bookings" and the word unpaid
                appeared nowhere on the screen (B-10.2). Nothing has been
                charged at this point: name the state and name where to pay. */}
            <Text style={[styles.doneSub, { color: colors.textSecond }]}>
              {progress.done} bookings created and awaiting payment.
              {progress.failed > 0 ? ` ${progress.failed} failed.` : ''}
              {' '}Nothing has been charged yet: pay for each one from Deliveries.
            </Text>
            <Pressable style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => router.replace('/(business)/(tabs)/deliveries' as any)}>
              <Text style={styles.primaryBtnText}>View Deliveries</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {preview && step === 'preview' && (
        <View style={[styles.cta, {
          paddingBottom: insets.bottom + 16,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        }]}>
          <Pressable style={styles.tcRow} onPress={() => setTcAgreed(v => !v)}>
            <View style={[styles.tcBox, {
              borderColor:     tcAgreed ? colors.primary : colors.textThird,
              backgroundColor: tcAgreed ? colors.primary : 'transparent',
            }]}>
              {tcAgreed && <Icon name="Check" size={12} color="#fff" />}
            </View>
            <Text style={[styles.tcText, { color: colors.textSecond }]}>
              I agree to the SEIRS Terms of Service for every booking in this file, including what happens if a delivery fails.{' '}
              <Text style={{ color: colors.primary, fontWeight: '600' }} onPress={() => Linking.openURL(TERMS_URL)}>
                Read them
              </Text>
            </Text>
          </Pressable>
          <Pressable
            style={[styles.ctaBtn, { backgroundColor: tcAgreed ? colors.primary : colors.border }]}
            onPress={confirmCreate}
            disabled={!tcAgreed}
          >
            <Icon name="Check" size={18} color="#fff" />
            {/* The button used to read "Confirm: N480,000" and charge nothing
                (B-10.2). A sender tapped a total and believed it settled. It
                creates unpaid bookings, so it says so, with the amount still
                shown as what will be owed. */}
            <Text style={styles.ctaBtnText}>
              Create {preview.bookings.filter(b => b.valid).length} bookings (₦{Math.round(preview.grandTotal).toLocaleString()} to pay)
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Preview rendering ────────────────────────────────────────────────────
function PreviewView({ preview }: { preview: CsvPreviewResponse }) {
  const colors = useColors();
  const validCount   = preview.bookings.filter(b => b.valid).length;
  const invalidCount = preview.bookings.length - validCount;

  return (
    <View style={{ marginTop: 8, gap: 12 }}>
      <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.text }]}>Bookings</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{preview.bookings.length}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.text }]}>Valid (ready to create)</Text>
          <Text style={[styles.summaryValue, { color: '#16A34A' }]}>{validCount}</Text>
        </View>
        {invalidCount > 0 && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.text }]}>Need fixes</Text>
            <Text style={[styles.summaryValue, { color: '#DC2626' }]}>{invalidCount}</Text>
          </View>
        )}
        {preview.bulkDiscountApplied && (
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.text }]}>Bulk discount</Text>
            <Text style={[styles.summaryValue, { color: '#16A34A' }]}>−{preview.bulkDiscountPercent}%</Text>
          </View>
        )}
        <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 }]}>
          <Text style={[styles.summaryLabel, { fontWeight: '700', color: colors.text }]}>Total</Text>
          <Text style={[styles.summaryValue, { fontWeight: '700', color: colors.text }]}>₦{Math.round(preview.grandTotal).toLocaleString()}</Text>
        </View>
        {/* No wallet row: the batch is paid at checkout, and senders
            hold no balance with SEIRS. */}
      </View>

      {preview.bookings.map((b, idx) => (
        <BookingCard key={idx} booking={b} index={idx + 1} />
      ))}
    </View>
  );
}

function BookingCard({ booking, index }: { booking: BookingPreview; index: number }) {
  const colors = useColors();
  const isMulti = booking.rows.length > 1;
  return (
    <View style={[
      styles.bookingCard,
      { backgroundColor: colors.surface, borderColor: colors.border },
      !booking.valid && { borderColor: '#FECACA', backgroundColor: colors.background },
    ]}>
      <View style={styles.bookingHeader}>
        <Text style={[styles.bookingTitle, { color: colors.text }]}>
          {booking.bookingRef ? `Booking ${booking.bookingRef}` : `Booking ${index}`}
          {' '}
          <Text style={[styles.bookingSub, { color: colors.textSecond }]}>
            {isMulti ? `${booking.rows.length}-stop` : 'single stop'}
          </Text>
        </Text>
        {booking.valid ? (
          <View style={styles.validPill}>
            <Icon name="Check" size={11} color="#16A34A" />
            <Text style={[styles.pillText, { color: '#16A34A' }]}>Ready</Text>
          </View>
        ) : (
          <View style={styles.errorPill}>
            <Icon name="AlertCircle" size={11} color="#DC2626" />
            <Text style={[styles.pillText, { color: '#DC2626' }]}>{booking.errors.length} issue{booking.errors.length === 1 ? '' : 's'}</Text>
          </View>
        )}
      </View>

      {booking.errors.length > 0 && (
        <View style={styles.bookingErrors}>
          {booking.errors.map((e, i) => (
            <Text key={i} style={styles.bookingErrorText}>• {e}</Text>
          ))}
        </View>
      )}

      {booking.rows.map((row, i) => (
        <View key={i} style={[styles.rowMeta, { borderTopColor: colors.border }]}>
          <Text style={[styles.rowLine, { color: colors.text }]}>
            <Text style={[styles.rowLabel, { color: colors.textThird }]}>Line {row.lineNumber}: </Text>
            {row.recipientName} → {row.drop.address || '(no address)'}
          </Text>
          <Text style={[styles.rowDetails, { color: colors.textSecond }]}>
            {row.category} · {row.weightKg} kg · {row.recipientPhone}
          </Text>
          {row.errors.length > 0 && row.errors.map((e, j) => (
            <Text key={j} style={styles.rowError}>⚠ {e}</Text>
          ))}
        </View>
      ))}

      {booking.pricePreview && (
        <View style={[styles.bookingFooter, { borderTopColor: colors.border }]}>
          <Text style={[styles.bookingFooterLabel, { color: colors.textSecond }]}>This booking:</Text>
          <Text style={[styles.bookingFooterValue, { color: colors.text }]}>
            ₦{Math.round(booking.pricePreview.customer.total).toLocaleString()}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:       {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1,
  },
  headerTitle:  { fontSize: 16, fontWeight: '700' },

  // Sky-blue still signals "informational", but the colours are chosen
  // per theme at the use site now: see B-10.8.
  infoBox:      {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1,
  },
  infoTitle:    { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  infoText:     { fontSize: 13, lineHeight: 18 },
  bold:         { fontWeight: '700' },

  dropzone:     {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 40,
    borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', marginBottom: 16,
  },
  dropIcon:     {
    width: 64, height: 64, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  dropTitle:    { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  dropSub:      { fontSize: 14 },

  errorBox:     {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorText:    { color: '#DC2626', fontSize: 14, flex: 1 },

  primaryBtn:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, paddingVertical: 14, marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  spinnerCard:  { borderRadius: 12, padding: 24, marginTop: 16, borderWidth: 1, alignItems: 'center', gap: 12 },
  spinnerText:  { fontSize: 14 },

  doneCard:     { borderRadius: 12, padding: 24, marginTop: 16, borderWidth: 1, alignItems: 'center', gap: 6 },
  doneTitle:    { fontSize: 18, fontWeight: '700' },
  doneSub:      { fontSize: 14, marginBottom: 16 },

  summaryCard:  { borderRadius: 12, padding: 14, gap: 6, borderWidth: 1 },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14, fontVariant: ['tabular-nums'] },

  bookingCard:  { borderRadius: 12, padding: 14, borderWidth: 1 },
  bookingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bookingTitle: { fontSize: 15, fontWeight: '700' },
  bookingSub:   { fontSize: 13, fontWeight: '400' },
  validPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  errorPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  pillText:     { fontSize: 12, fontWeight: '700' },

  bookingErrors: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 8, marginBottom: 8 },
  bookingErrorText: { fontSize: 12, color: '#DC2626', lineHeight: 16 },

  rowMeta: { paddingVertical: 6, borderTopWidth: 1 },
  rowLabel: { fontSize: 12, fontWeight: '700' },
  rowLine:  { fontSize: 13 },
  rowDetails: { fontSize: 12, marginTop: 2 },
  rowError: { fontSize: 12, color: '#DC2626', marginTop: 2 },

  bookingFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: 8, marginTop: 6, borderTopWidth: 1,
  },
  bookingFooterLabel: { fontSize: 13 },
  bookingFooterValue: { fontSize: 15, fontWeight: '700' },

  cta:          {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1,
  },
  ctaBtn:       {
    borderRadius: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  ctaBtnDisabled: { opacity: 0.4 },
  ctaBtnText:   { color: '#fff', fontWeight: '700', fontSize: 15 },
  tcRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  tcBox:        { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, marginTop: 1, alignItems: 'center', justifyContent: 'center' },
  tcText:       { flex: 1, fontSize: 12.5, lineHeight: 17 },
  affordWarn:   { fontSize: 12, color: '#DC2626', textAlign: 'center', marginTop: 6 },
});
