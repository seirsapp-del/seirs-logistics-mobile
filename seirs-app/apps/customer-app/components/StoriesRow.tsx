/**
 * Instagram-style horizontal stories row for the customer-app home.
 *
 * Combines four content types into one feed (per user spec):
 *   1. Featured driver of the week — photo + brief story, builds trust
 *   2. Daily/weekly promo announcements — tap-through to claim
 *   3. Ship tips (educational) — "How to pack fragile items" etc.
 *   4. Customer success stories — real photos + consented blurb
 *
 * Data source: stub feed via `useStories()` for now; replace with
 * backend `GET /stories/active` once the content service ships.
 *
 * Image source: Unsplash open-license URLs as placeholders. Swap to
 * branded SEIRS assets when the illustrator delivers (see memory rule
 * feedback_app_visual_aliveness.md).
 *
 * UX pattern: 64px circular thumbs with a 2px ring (filled when unseen,
 * grey when seen). Tap opens a modal story-viewer (deferred — for now
 * tap routes to the relevant target screen / external link).
 */

import { useMemo, useState, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Modal, Image, StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

export type StoryKind = 'driver' | 'promo' | 'tip' | 'success';

export interface Story {
  id:       string;
  kind:     StoryKind;
  /** Short label shown under the circle (max ~10 chars to fit). */
  label:    string;
  /** Square thumbnail URL for the circle. */
  thumbUrl: string;
  /** Larger image shown in the viewer modal. */
  heroUrl:  string;
  title:    string;
  body:     string;
  /** Optional CTA inside the viewer. */
  cta?: { label: string; route?: string; href?: string };
}

const SEEN_KEY = 'seirs.stories.seen';

// Initial stub feed — replace with backend GET /stories/active later.
// Image URLs are Unsplash open-license placeholders categorised so they
// roughly match each story kind even before branded assets land.
const STUB_STORIES: Story[] = [
  {
    id:    'tip-fragile-2026-05',
    kind:  'tip',
    label: 'Pack fragile',
    thumbUrl: 'https://images.unsplash.com/photo-1601984438973-46c4dcfafff5?w=160&h=160&fit=crop',
    heroUrl:  'https://images.unsplash.com/photo-1601984438973-46c4dcfafff5?w=800&h=1200&fit=crop',
    title: 'How to pack fragile items',
    body:  '1) Wrap each piece in bubble wrap.\n2) Use a box at least 5cm larger than the item.\n3) Fill empty space with newspaper.\n4) Mark "Fragile" on top + sides.\n\nOur drivers handle marked-fragile boxes with extra care.',
  },
  {
    id:    'promo-welcome-2026-05',
    kind:  'promo',
    label: '₦300 off',
    thumbUrl: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=160&h=160&fit=crop',
    heroUrl:  'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&h=1200&fit=crop',
    title: '₦300 off your first delivery',
    body:  'New here? Use code WELCOME at checkout to save ₦300 on your first send. One per account.',
    cta:   { label: 'Send a package', route: '/(customer)/send' },
  },
  {
    id:    'driver-amaka-2026-05',
    kind:  'driver',
    label: 'Amaka',
    thumbUrl: 'https://images.unsplash.com/photo-1545167622-3a6ac756afa4?w=160&h=160&fit=crop',
    heroUrl:  'https://images.unsplash.com/photo-1545167622-3a6ac756afa4?w=800&h=1200&fit=crop',
    title: 'Driver of the week: Amaka',
    body:  'Amaka has completed 312 deliveries in Surulere with a 4.96★ rating. She specialises in fragile electronics and has zero damage claims this quarter.',
  },
  {
    id:    'success-wedding-cake-2026-05',
    kind:  'success',
    label: 'Cake run',
    thumbUrl: 'https://images.unsplash.com/photo-1535254973040-607b474cb50d?w=160&h=160&fit=crop',
    heroUrl:  'https://images.unsplash.com/photo-1535254973040-607b474cb50d?w=800&h=1200&fit=crop',
    title: '"My wedding cake made it"',
    body:  '"I needed a 3-tier wedding cake from Lekki to Ikeja during Friday traffic. Booked a fragile-rated van at 10am, it arrived by 11:30am perfectly intact. Saved my wedding." — Chioma A.',
  },
  {
    id:    'tip-cheapest-time-2026-05',
    kind:  'tip',
    label: 'Best times',
    thumbUrl: 'https://images.unsplash.com/photo-1567333190316-21a07920ff10?w=160&h=160&fit=crop',
    heroUrl:  'https://images.unsplash.com/photo-1567333190316-21a07920ff10?w=800&h=1200&fit=crop',
    title: 'Cheapest time to send',
    body:  'Avoid 10pm–5am (night surcharge +25%) and 5–7pm weekdays (peak +15%). Weekend mid-morning is usually cheapest.',
  },
];

function useStories() {
  // Stable list for now. Backend hook lands later; same return shape.
  return useMemo(() => STUB_STORIES, []);
}

function useSeenIds(): { seen: Set<string>; markSeen: (id: string) => void } {
  const [seen, setSeen] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY)
      .then(raw => { if (raw) setSeen(new Set(JSON.parse(raw))); })
      .catch(() => { /* ignore */ });
  }, []);

  const markSeen = (id: string) => {
    setSeen(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev); next.add(id);
      AsyncStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(next))).catch(() => { /* best-effort */ });
      return next;
    });
  };

  return { seen, markSeen };
}

// Tints + icon per story kind — gives the ring a hint of what's inside
// even before the user opens it.
const KIND_RING: Record<StoryKind, string> = {
  driver:  '#3A86FF',
  promo:   '#FF6B00',
  tip:     '#22C55E',
  success: '#FFBE0B',
};
const KIND_ICON: Record<StoryKind, keyof typeof Ionicons.glyphMap> = {
  driver:  'person-circle',
  promo:   'gift',
  tip:     'bulb',
  success: 'heart',
};

export function StoriesRow() {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];
  const stories = useStories();
  const { seen, markSeen } = useSeenIds();
  const [open, setOpen] = useState<Story | null>(null);

  if (stories.length === 0) return null;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {stories.map(story => {
          const isSeen   = seen.has(story.id);
          const ringClr  = isSeen ? theme.border : KIND_RING[story.kind];
          return (
            <Pressable
              key={story.id}
              style={styles.item}
              onPress={() => { markSeen(story.id); setOpen(story); }}
            >
              <View style={[styles.ring, { borderColor: ringClr }]}>
                <Image source={{ uri: story.thumbUrl }} style={styles.thumb} />
                <View style={[styles.kindBadge, { backgroundColor: KIND_RING[story.kind] }]}>
                  <Ionicons name={KIND_ICON[story.kind]} size={10} color="#fff" />
                </View>
              </View>
              <Text
                style={[styles.label, { color: isSeen ? theme.textSecond : theme.text }]}
                numberOfLines={1}
              >
                {story.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {open && <StoryViewer story={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function StoryViewer({ story, onClose }: { story: Story; onClose: () => void }) {
  const router = useRouter();
  const { t }  = useTranslation();
  const cs     = useColorScheme();
  const theme  = Colors[cs ?? 'light'];

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.viewerBg}>
        <Image source={{ uri: story.heroUrl }} style={styles.viewerHero} resizeMode="cover" />
        <View style={styles.viewerOverlay} />

        <Pressable style={styles.viewerClose} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        <View style={styles.viewerKindRow}>
          <View style={[styles.kindChip, { backgroundColor: KIND_RING[story.kind] }]}>
            <Ionicons name={KIND_ICON[story.kind]} size={12} color="#fff" />
            <Text style={styles.kindChipText}>{story.kind}</Text>
          </View>
        </View>

        <View style={styles.viewerBody}>
          <Text style={styles.viewerTitle}>{story.title}</Text>
          <Text style={styles.viewerText}>{story.body}</Text>

          {story.cta && (
            <Pressable
              style={[styles.viewerCta, { backgroundColor: theme.primary }]}
              onPress={() => {
                onClose();
                if (story.cta?.route) router.push(story.cta.route as any);
              }}
            >
              <Text style={styles.viewerCtaText}>{story.cta.label}</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row:      { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.md },
  item:     { width: 64, alignItems: 'center', gap: 4 },
  ring:     { width: 62, height: 62, borderRadius: 31, borderWidth: 2.5, padding: 2, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  thumb:    { width: 52, height: 52, borderRadius: 26 },
  kindBadge:{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  label:    { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  viewerBg:    { flex: 1, backgroundColor: '#000' },
  viewerHero:  { ...StyleSheet.absoluteFillObject as object },
  viewerOverlay: { ...StyleSheet.absoluteFillObject as object, backgroundColor: 'rgba(0,0,0,0.45)' },
  viewerClose: { position: 'absolute', top: 60, right: 20, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  viewerKindRow:{ position: 'absolute', top: 60, left: 20, zIndex: 2 },
  kindChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  kindChipText:{ color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },

  viewerBody:  { position: 'absolute', bottom: 0, left: 0, right: 0, padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },
  viewerTitle: { color: '#fff', fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  viewerText:  { color: 'rgba(255,255,255,0.9)', fontSize: FontSize.base, lineHeight: 22 },
  viewerCta:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.lg, marginTop: Spacing.sm },
  viewerCtaText:{ color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.bold },
});
