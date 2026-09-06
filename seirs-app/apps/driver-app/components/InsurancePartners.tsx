/**
 * Where to buy cover, shown next to the certificate we ask for.
 *
 * Moved out of the old KYC screen when the two screens merged. It belongs
 * beside the insurance upload, not three sections away from it: the rider
 * who cannot produce a certificate is exactly the rider who needs this, and
 * they meet the request and the answer in the same breath.
 *
 * Collapsed by default. Most riders already have cover and do not need a
 * list of insurers between them and the upload button.
 *
 * The rows now open. They carried an external-link glyph and no handler, so
 * every one of them was a link that did nothing.
 */
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { tx } from '@/i18n/tx';
import { tx as tr } from '@/i18n/tx';
import { tx as tx9 } from '@/i18n/tx';

const PARTNERS = () => [
  { name: 'AXA Mansard',          desc: tx9('auto.insurancepartners.vehicleAndThirdPartyCover', 'Vehicle and third-party cover'),   url: 'https://axamansard.com' },
  { name: 'Leadway Assurance',    desc: tx9('auto.insurancepartners.motorcycleAndAutoInsurance', 'Motorcycle and auto insurance'),   url: 'https://leadway.com' },
  { name: 'Aiico Insurance',      desc: tx9('auto.insurancepartners.affordableRiderPolicies', 'Affordable rider policies'),       url: 'https://aiicoplc.com' },
  { name: 'Cornerstone Insurance', desc: tx9('auto.insurancepartners.motorAndLiabilityCover', 'Motor and liability cover'),      url: 'https://cornerstoneinsuranceplc.com' },
];

export function InsurancePartners() {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: Spacing.sm }}>
      <Pressable
        style={[styles.header, { borderColor: theme.border, backgroundColor: theme.background }]}
        onPress={() => setOpen(v => !v)}
      >
        <Ionicons name="shield-outline" size={18} color={theme.primary} />
        <Text style={[styles.headerText, { color: theme.text }]}>{tx('auto.InsurancePartners.doYouNeedInsurance', 'Do you need insurance?')}</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={theme.textThird}
        />
      </Pressable>

      {open && (
        <View style={[styles.list, { borderColor: theme.border }]}>
          {PARTNERS().map((p, i) => (
            <Pressable
              key={p.name}
              onPress={() => Linking.openURL(p.url).catch(() => {})}
              style={[
                styles.row,
                i < PARTNERS().length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: theme.text }]}>{p.name}</Text>
                <Text style={[styles.desc, { color: theme.textThird }]}>{p.desc}</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={theme.primary} />
            </Pressable>
          ))}
          <Text style={[styles.note, { color: theme.textThird }]}>
            {tr('auto.insurancepartners.seirsEarnsAReferralFee', 'SEIRS earns a referral fee when you buy through a partner. It does not change what you pay.')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
  headerText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold as any },
  list:       { borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  row:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm },
  name:       { fontSize: FontSize.sm, fontWeight: FontWeight.bold as any },
  desc:       { fontSize: FontSize.xs, marginTop: 1 },
  note:       { fontSize: 11, lineHeight: 16, padding: Spacing.sm },
});
