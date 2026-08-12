/**
 * Driver Code of Conduct: in-app canonical copy.
 *
 * Forms part of the SEIRS Terms of Service (drivers accept both at
 * registration). If this text and the Terms of Service conflict, the
 * Terms of Service prevail. Content drafted 2026-08-09 for founder
 * review; run past Nigerian counsel before public launch.
 */
import { View, Text, ScrollView, Pressable, StyleSheet, StatusBar, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const LAST_UPDATED = '9 August 2026';
const TERMS_URL = 'https://seirs-website.vercel.app/terms-of-service';

interface Section {
  title: string;
  points: string[];
}

const SECTIONS: Section[] = [
  {
    title: '1. Who you are to SEIRS',
    points: [
      'You are an independent contractor. Nothing in this Code, the app, or your acceptance of jobs creates an employment, agency, or partnership relationship with SEIRS Logistics.',
      'You choose when to go online and which jobs to accept. In return, you are personally responsible for how you work while online.',
      'This Code forms part of the SEIRS Terms of Service. If they conflict, the Terms of Service prevail.',
    ],
  },
  {
    title: '2. Your account is you',
    points: [
      'One person, one account. Never share, rent, sell, or transfer your account or let anyone else drive under it.',
      'Keep your login credentials secret. Everything done on your account is treated as done by you.',
      'Impersonating another driver, or allowing yourself to be impersonated, ends your account permanently and may be reported to law enforcement.',
      'Keep your licence, vehicle papers, and insurance valid and current in the app. Expired documents can pause your ability to receive jobs.',
    ],
  },
  {
    title: '3. Road safety comes first',
    points: [
      'Obey all traffic laws and Federal Road Safety Corps (FRSC) regulations at all times.',
      'Riders must wear a certified helmet. Drivers must wear seat belts. No exceptions.',
      'Never handle your phone while the vehicle is moving. Stop safely before using the app.',
      'Never drive under the influence of alcohol, drugs, or any substance that impairs you.',
      'Keep your vehicle roadworthy. If it is not safe to carry a package, do not accept the job.',
      'In dangerous weather or road conditions, your safety beats any delivery. Pause, park, and inform the customer through the app.',
    ],
  },
  {
    title: '4. Every package, by the book',
    points: [
      'Verify the package code or scan the QR at every handoff: pickup, partner store, driver-to-driver transfer, and final delivery. No code, no handoff.',
      'Never open, unseal, or tamper with a package. If a package appears damaged or opened when you receive it, photograph it and report it in the app before moving it.',
      'Release a package only to the person who presents a valid delivery code. A name or a story is not a code.',
      'Report loss, theft, or damage immediately through the app. Late reporting may shift liability to you.',
    ],
  },
  {
    title: '5. Refuse prohibited items',
    points: [
      'You must refuse and report: illegal drugs, firearms and ammunition, stolen goods, hazardous or flammable materials, live animals without arrangement, cash shipments, and any item you reasonably suspect is unlawful.',
      'SEIRS never asks you to carry people as cargo or packages as passengers.',
      'If you knowingly transport a prohibited item, you do so entirely at your own risk: it means permanent deactivation and referral to law enforcement, and you alone answer for the legal consequences.',
    ],
  },
  {
    title: '6. Money moves through the app only',
    points: [
      'All delivery payments are processed inside SEIRS. Never collect cash from a customer for a delivery.',
      'Never solicit or accept off-platform deals with customers you met through SEIRS. It removes every protection the platform gives you.',
      'Never demand tips. A customer may offer one; you may not require one.',
      'Manipulating fares, staging deliveries, faking completions, or triggering fees dishonestly is fraud and ends your account.',
    ],
  },
  {
    title: '7. Honest location, honest work',
    points: [
      'Keep GPS on and accurate for the entire time you are online. Location powers your safety features as well as job matching.',
      'GPS spoofing tools, mock-location apps, or any manipulation of your reported position is treated as fraud.',
      'SEIRS monitors movement patterns for anomalies and investigates. Confirmed manipulation ends your account and forfeits related earnings.',
    ],
  },
  {
    title: '8. Respect every customer',
    points: [
      'Be professional and courteous. No harassment, threats, or abusive language, ever.',
      'No discrimination against any customer on the basis of ethnicity, religion, gender, disability, or anything else.',
      'Customer details (name, phone, address) are given to you for one purpose: completing that delivery. Using them for anything else, including contacting a customer after the delivery, is prohibited.',
      'Never share, photograph, or store customer information. Misuse of personal data can make you personally liable under the Nigeria Data Protection Act 2023, separate from anything SEIRS does.',
    ],
  },
  {
    title: '9. Communicate inside the app',
    points: [
      'Use in-app chat and calls for delivery matters. This protects you: conversations are logged and become evidence if there is ever a dispute.',
      'Chats close shortly after a delivery ends. Do not attempt to continue contact through personal channels.',
      'Abusive or inappropriate messages are reviewed on complaint and count against your account.',
    ],
  },
  {
    title: '10. Accidents and emergencies',
    points: [
      'If there is an accident: stop, secure yourself and others, and call emergency services if anyone is injured.',
      'Use the SOS button for immediate danger. It alerts SEIRS with your live location.',
      'Report every accident or security incident involving a SEIRS job through the app within one hour, even a minor one.',
      'Your insurance covers your vehicle and your liability on the road. Keep it current; SEIRS is not your insurer.',
    ],
  },
  {
    title: '11. Your responsibility and SEIRS liability',
    points: [
      'You are responsible for your own acts and omissions while using the platform, including fines, penalties, and third-party claims arising from your conduct.',
      'You agree to indemnify SEIRS Logistics against claims, losses, and costs caused by your breach of this Code, your negligence, or your unlawful acts.',
      'SEIRS is not liable for your loss of income during a suspension imposed in good faith while an investigation is ongoing.',
    ],
  },
  {
    title: '12. How this Code is enforced',
    points: [
      'Most issues follow three steps: a documented warning, then temporary suspension, then permanent deactivation.',
      'Zero-tolerance violations skip the steps and end the account immediately: violence or threats, theft, prohibited items, fraud, GPS manipulation, harassment, discrimination, impersonation, and driving under the influence.',
      'Earnings directly connected to confirmed fraud may be withheld or reversed pending investigation.',
      'SEIRS may report criminal conduct to the Nigeria Police Force or other authorities and will cooperate with lawful investigations.',
      'You may appeal any enforcement decision through in-app support within 14 days. Appeals are reviewed by a person, not an algorithm.',
    ],
  },
  {
    title: '13. Changes and governing law',
    points: [
      'SEIRS may update this Code as the service and the law evolve. Material changes are announced in-app; continuing to drive after a change means you accept it.',
      'This Code is governed by the laws of the Federal Republic of Nigeria.',
    ],
  },
];

export default function CodeOfConductScreen() {
  const router = useRouter();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];
  const isDark = cs === 'dark';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'bottom']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceSecond }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Driver Code of Conduct</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.updated, { color: theme.textThird }]}>Last updated: {LAST_UPDATED}</Text>
        <Text style={[styles.intro, { color: theme.textSecond }]}>
          This Code is the standard every SEIRS driver agrees to. It exists to keep you, your
          customers, and every package safe, and it is part of the Terms of Service you accepted
          when you registered.
        </Text>

        {SECTIONS.map((s) => (
          <View key={s.title} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{s.title}</Text>
            {s.points.map((p, i) => (
              <View key={i} style={styles.pointRow}>
                <View style={[styles.bullet, { backgroundColor: theme.primary }]} />
                <Text style={[styles.pointText, { color: theme.textSecond }]}>{p}</Text>
              </View>
            ))}
          </View>
        ))}

        <Pressable onPress={() => Linking.openURL(TERMS_URL)} style={styles.termsLink}>
          <Text style={[styles.termsLinkText, { color: theme.primary }]}>
            Read the full Terms of Service
          </Text>
          <Ionicons name="open-outline" size={15} color={theme.primary} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  title:   { fontSize: FontSize.md, fontWeight: FontWeight.bold },

  scroll:  { padding: Spacing.md, paddingBottom: Spacing.xl * 2, gap: Spacing.sm },
  updated: { fontSize: FontSize.xs },
  intro:   { fontSize: FontSize.sm, lineHeight: 21, marginBottom: Spacing.xs },

  card:         { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: 2 },
  pointRow:     { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  bullet:       { width: 5, height: 5, borderRadius: 3, marginTop: 8, flexShrink: 0 },
  pointText:    { flex: 1, fontSize: FontSize.sm, lineHeight: 20 },

  termsLink:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.md },
  termsLinkText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});
