/**
 * Business · CSV Bulk Upload — preview + confirm flow.
 *
 * Spec V8 §⑬ schema. Two-step UX:
 *   1. Pick file → POST to /business/deliveries/csv → backend parses,
 *      geocodes every address, validates each row, groups rows by
 *      booking_ref, prices each booking. Returns a preview.
 *   2. User reviews the preview: per-row errors flagged in red, valid
 *      bookings show their price. User taps Confirm.
 *   3. Frontend iterates valid bookings and calls businessApi.create-
 *      Delivery for each (the same endpoint as the in-app new-delivery
 *      form). Wallet debit + Delivery + DeliveryStop rows created
 *      atomically per booking.
 *
 * Nothing is charged before the user explicitly confirms. Invalid
 * bookings are shown as warnings — the user can fix locally and
 * re-upload, OR proceed to create only the valid ones.
 */
import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Icon } from '@/components/Icon';
import { businessApi } from '@/services/api';

// Shape of the backend preview response — mirrors what
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
  walletBalance: number;
  canAfford:     boolean;
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

  const [file,     setFile]     = useState<{ name: string; uri: string } | null>(null);
  const [preview,  setPreview]  = useState<CsvPreviewResponse | null>(null);
  const [step,     setStep]     = useState<'pick' | 'preview' | 'creating' | 'done'>('pick');
  const [progress, setProgress] = useState({ done: 0, failed: 0, total: 0 });
  const [error,    setError]    = useState('');

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
    const valid = preview.bookings.filter(b => b.valid);
    if (valid.length === 0) {
      Alert.alert('Nothing to create', 'There are no valid bookings in this CSV. Fix the errors and re-upload.');
      return;
    }
    if (!preview.canAfford) {
      Alert.alert(
        'Insufficient wallet balance',
        `This batch costs ₦${preview.grandTotal.toLocaleString()} but your wallet has ₦${preview.walletBalance.toLocaleString()}. Top up first.`,
      );
      return;
    }
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
        });
        done++;
      } catch {
        failed++;
      }
      setProgress({ done, failed, total: valid.length });
    }
    setStep('done');
  };

  const downloadTemplate = () => {
    Alert.alert(
      'CSV Template',
      `Column headers (in order):\n\n${TEMPLATE_HEADERS.join(', ')}\n\nGroup multiple rows into one multi-stop booking by giving them the same booking_ref. Empty booking_ref = standalone single-stop delivery.\n\nFull example:\n\n${TEMPLATE_CSV}`,
    );
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F0' }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()}>
          <Icon name="ArrowLeft" size={22} color="#0F2B4C" />
        </Pressable>
        <Text style={styles.headerTitle}>CSV Bulk Upload</Text>
        <Pressable onPress={downloadTemplate}>
          <Icon name="FileText" size={20} color="#3A7BD5" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 160 }}>

        {/* Instructions */}
        <View style={styles.infoBox}>
          <Icon name="Info" size={16} color="#3A7BD5" />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>How it works</Text>
            <Text style={styles.infoText}>
              1. Pick your CSV file (template available via the icon top-right).{'\n'}
              2. We geocode addresses and price every booking on the server.{'\n'}
              3. Review the preview below — fix any flagged rows.{'\n'}
              4. Tap Confirm to create the deliveries (wallet debited then).{'\n\n'}
              <Text style={styles.bold}>Group multi-stop bookings</Text> by giving rows the same{' '}
              <Text style={styles.bold}>booking_ref</Text>. Empty booking_ref = standalone single-stop.
            </Text>
          </View>
        </View>

        {/* Upload zone */}
        <Pressable style={styles.dropzone} onPress={pickFile}>
          <View style={styles.dropIcon}>
            <Icon name="Upload" size={28} color={file ? '#16A34A' : '#3A7BD5'} />
          </View>
          {file ? (
            <>
              <Text style={styles.dropTitle}>{file.name}</Text>
              <Text style={styles.dropSub}>Tap to change file</Text>
            </>
          ) : (
            <>
              <Text style={styles.dropTitle}>Select CSV file</Text>
              <Text style={styles.dropSub}>Tap to browse your device</Text>
            </>
          )}
        </Pressable>

        {error !== '' && (
          <View style={styles.errorBox}>
            <Icon name="AlertCircle" size={16} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Step: pick → fetch preview button */}
        {file && step === 'pick' && (
          <Pressable style={styles.primaryBtn} onPress={fetchPreview}>
            <Icon name="Upload" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Upload &amp; Preview</Text>
          </Pressable>
        )}

        {/* Step: preview (server-side response) */}
        {step === 'preview' && !preview && (
          <View style={styles.spinnerCard}>
            <ActivityIndicator color="#3A7BD5" />
            <Text style={styles.spinnerText}>Validating + geocoding + pricing every row…</Text>
          </View>
        )}

        {preview && (
          <PreviewView preview={preview} />
        )}

        {/* Step: creating */}
        {step === 'creating' && (
          <View style={styles.spinnerCard}>
            <ActivityIndicator color="#3A7BD5" />
            <Text style={styles.spinnerText}>
              Creating {progress.done + progress.failed} / {progress.total} bookings…
            </Text>
            {progress.failed > 0 && (
              <Text style={[styles.spinnerText, { color: '#DC2626' }]}>
                {progress.failed} failed so far
              </Text>
            )}
          </View>
        )}

        {/* Step: done */}
        {step === 'done' && (
          <View style={styles.doneCard}>
            <Icon name="CheckCircle2" size={32} color="#16A34A" />
            <Text style={styles.doneTitle}>Done</Text>
            <Text style={styles.doneSub}>
              Created {progress.done} bookings.
              {progress.failed > 0 ? ` ${progress.failed} failed.` : ''}
            </Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.replace('/(business)/(tabs)/deliveries' as any)}>
              <Text style={styles.primaryBtnText}>View Deliveries</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Confirm CTA — sticky at bottom when preview is ready */}
      {preview && step === 'preview' && (
        <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={[styles.ctaBtn, !preview.canAfford && styles.ctaBtnDisabled]}
            onPress={confirmCreate}
          >
            <Icon name="Check" size={18} color="#fff" />
            <Text style={styles.ctaBtnText}>
              Confirm — ₦{Math.round(preview.grandTotal).toLocaleString()} ({preview.bookings.filter(b => b.valid).length} bookings)
            </Text>
          </Pressable>
          {!preview.canAfford && (
            <Text style={styles.affordWarn}>
              Wallet has ₦{preview.walletBalance.toLocaleString()} — top up before confirming.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── Preview rendering ────────────────────────────────────────────────────
function PreviewView({ preview }: { preview: CsvPreviewResponse }) {
  const validCount   = preview.bookings.filter(b => b.valid).length;
  const invalidCount = preview.bookings.length - validCount;

  return (
    <View style={{ marginTop: 8, gap: 12 }}>
      {/* Summary card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Bookings</Text>
          <Text style={styles.summaryValue}>{preview.bookings.length}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Valid (ready to create)</Text>
          <Text style={[styles.summaryValue, { color: '#16A34A' }]}>{validCount}</Text>
        </View>
        {invalidCount > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Need fixes</Text>
            <Text style={[styles.summaryValue, { color: '#DC2626' }]}>{invalidCount}</Text>
          </View>
        )}
        {preview.bulkDiscountApplied && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Bulk discount</Text>
            <Text style={[styles.summaryValue, { color: '#16A34A' }]}>−{preview.bulkDiscountPercent}%</Text>
          </View>
        )}
        <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8, marginTop: 4 }]}>
          <Text style={[styles.summaryLabel, { fontWeight: '700' }]}>Total</Text>
          <Text style={[styles.summaryValue, { fontWeight: '700' }]}>₦{Math.round(preview.grandTotal).toLocaleString()}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Wallet</Text>
          <Text style={[styles.summaryValue, { color: preview.canAfford ? '#16A34A' : '#DC2626' }]}>
            ₦{Math.round(preview.walletBalance).toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Per-booking cards */}
      {preview.bookings.map((b, idx) => (
        <BookingCard key={idx} booking={b} index={idx + 1} />
      ))}
    </View>
  );
}

function BookingCard({ booking, index }: { booking: BookingPreview; index: number }) {
  const isMulti = booking.rows.length > 1;
  return (
    <View style={[styles.bookingCard, !booking.valid && styles.bookingCardError]}>
      <View style={styles.bookingHeader}>
        <Text style={styles.bookingTitle}>
          {booking.bookingRef ? `Booking ${booking.bookingRef}` : `Booking ${index}`}
          {' '}
          <Text style={styles.bookingSub}>
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

      {/* Errors */}
      {booking.errors.length > 0 && (
        <View style={styles.bookingErrors}>
          {booking.errors.map((e, i) => (
            <Text key={i} style={styles.bookingErrorText}>• {e}</Text>
          ))}
        </View>
      )}

      {/* Rows */}
      {booking.rows.map((row, i) => (
        <View key={i} style={styles.rowMeta}>
          <Text style={styles.rowLine}>
            <Text style={styles.rowLabel}>Line {row.lineNumber}: </Text>
            {row.recipientName} → {row.drop.address || '(no address)'}
          </Text>
          <Text style={styles.rowDetails}>
            {row.category} · {row.weightKg} kg · {row.recipientPhone}
          </Text>
          {row.errors.length > 0 && row.errors.map((e, j) => (
            <Text key={j} style={styles.rowError}>⚠ {e}</Text>
          ))}
        </View>
      ))}

      {/* Price preview */}
      {booking.pricePreview && (
        <View style={styles.bookingFooter}>
          <Text style={styles.bookingFooterLabel}>This booking:</Text>
          <Text style={styles.bookingFooterValue}>
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
    paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  headerTitle:  { fontSize: 16, fontWeight: '700', color: '#0F2B4C' },

  infoBox:      {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#EBF3FF', borderRadius: 12, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  infoTitle:    { fontSize: 13, fontWeight: '700', color: '#0F2B4C', marginBottom: 4 },
  infoText:     { fontSize: 12, color: '#374151', lineHeight: 18 },
  bold:         { fontWeight: '700' },

  dropzone:     {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 40,
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderStyle: 'dashed',
    borderColor: '#D1D5DB', marginBottom: 16,
  },
  dropIcon:     {
    width: 64, height: 64, borderRadius: 18, backgroundColor: '#F0F5FF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  dropTitle:    { fontSize: 15, fontWeight: '700', color: '#0F2B4C', marginBottom: 4 },
  dropSub:      { fontSize: 13, color: '#6B7280' },

  errorBox:     {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  errorText:    { color: '#DC2626', fontSize: 13, flex: 1 },

  primaryBtn:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0F2B4C', borderRadius: 12, paddingVertical: 14, marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  spinnerCard:  {
    backgroundColor: '#fff', borderRadius: 12, padding: 24, marginTop: 16,
    borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', gap: 12,
  },
  spinnerText:  { fontSize: 13, color: '#6B7280' },

  doneCard:     {
    backgroundColor: '#fff', borderRadius: 12, padding: 24, marginTop: 16,
    borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', gap: 6,
  },
  doneTitle:    { fontSize: 18, fontWeight: '700', color: '#0F2B4C' },
  doneSub:      { fontSize: 13, color: '#6B7280', marginBottom: 16 },

  // Summary
  summaryCard:  {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 6,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 13, color: '#374151' },
  summaryValue: { fontSize: 13, color: '#0F2B4C', fontVariant: ['tabular-nums'] },

  // Booking cards
  bookingCard:  {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  bookingCardError: { borderColor: '#FECACA', backgroundColor: '#FFFBFB' },
  bookingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bookingTitle: { fontSize: 14, fontWeight: '700', color: '#0F2B4C' },
  bookingSub:   { fontSize: 12, fontWeight: '400', color: '#6B7280' },
  validPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  errorPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  pillText:     { fontSize: 11, fontWeight: '700' },

  bookingErrors: { backgroundColor: '#FEF2F2', borderRadius: 8, padding: 8, marginBottom: 8 },
  bookingErrorText: { fontSize: 11, color: '#DC2626', lineHeight: 16 },

  rowMeta: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  rowLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '700' },
  rowLine:  { fontSize: 12, color: '#0F2B4C' },
  rowDetails: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  rowError: { fontSize: 11, color: '#DC2626', marginTop: 2 },

  bookingFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: 8, marginTop: 6, borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  bookingFooterLabel: { fontSize: 12, color: '#6B7280' },
  bookingFooterValue: { fontSize: 14, fontWeight: '700', color: '#0F2B4C' },

  // CTA
  cta:          {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  ctaBtn:       {
    backgroundColor: '#0F2B4C', borderRadius: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  ctaBtnDisabled: { opacity: 0.4 },
  ctaBtnText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
  affordWarn:   { fontSize: 11, color: '#DC2626', textAlign: 'center', marginTop: 6 },
});
