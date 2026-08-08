import { useMemo } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Renders an article body from a flat string array. Each string is one
 * "block" with an optional markdown-style prefix that controls how it
 * renders. Adjacent list items are grouped into one list automatically.
 *
 * Supported prefixes:
 *   "## Heading"          → h2 heading
 *   "### Subheading"      → h3 heading
 *   "- bullet"            → unordered list item (consecutive lines group)
 *   "1. item" (or any N.) → ordered list item (consecutive lines group)
 *   "> Quote text"        → pull quote
 *   "![caption](url)"     → inline image (caption optional, can be "")
 *   anything else         → paragraph
 *
 * The parser is intentionally tiny — easy to extend by adding another
 * prefix case here. This keeps article authoring readable in i18n files
 * (no JSX, no JSON nesting) and gives translators a familiar mental
 * model (markdown).
 */

type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'ulist'; items: string[] }
  | { kind: 'olist'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'image'; url: string; caption: string };

const IMG_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const OL_RE  = /^\d+\.\s+/;

function parse(lines: string[]): Block[] {
  const out: Block[] = [];
  let pendingU: string[] | null = null;
  let pendingO: string[] | null = null;

  const flushLists = () => {
    if (pendingU && pendingU.length) {
      out.push({ kind: 'ulist', items: pendingU });
      pendingU = null;
    }
    if (pendingO && pendingO.length) {
      out.push({ kind: 'olist', items: pendingO });
      pendingO = null;
    }
  };

  for (const raw of lines) {
    const line = String(raw ?? '').trim();
    if (!line) { flushLists(); continue; }

    if (line.startsWith('## ')) {
      flushLists();
      out.push({ kind: 'h2', text: line.slice(3).trim() });
    } else if (line.startsWith('### ')) {
      flushLists();
      out.push({ kind: 'h3', text: line.slice(4).trim() });
    } else if (line.startsWith('- ')) {
      if (pendingO) flushLists();
      pendingU = pendingU ?? [];
      pendingU.push(line.slice(2).trim());
    } else if (OL_RE.test(line)) {
      if (pendingU) flushLists();
      pendingO = pendingO ?? [];
      pendingO.push(line.replace(OL_RE, '').trim());
    } else if (line.startsWith('> ')) {
      flushLists();
      out.push({ kind: 'quote', text: line.slice(2).trim() });
    } else {
      const m = IMG_RE.exec(line);
      if (m) {
        flushLists();
        out.push({ kind: 'image', caption: m[1] ?? '', url: m[2] });
      } else {
        flushLists();
        out.push({ kind: 'paragraph', text: line });
      }
    }
  }
  flushLists();
  return out;
}

interface Props {
  body: string[];
}

export function ArticleBody({ body }: Props) {
  const cs    = useColorScheme();
  const theme = Colors[cs ?? 'light'];

  const blocks = useMemo(() => parse(body), [body]);

  return (
    <View style={styles.wrap}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h2':
            return (
              <Text key={i} style={[styles.h2, { color: theme.text }]}>
                {b.text}
              </Text>
            );
          case 'h3':
            return (
              <Text key={i} style={[styles.h3, { color: theme.text }]}>
                {b.text}
              </Text>
            );
          case 'paragraph':
            return (
              <Text key={i} style={[styles.paragraph, { color: theme.text }]}>
                {b.text}
              </Text>
            );
          case 'ulist':
            return (
              <View key={i} style={styles.list}>
                {b.items.map((item, j) => (
                  <View key={j} style={styles.listRow}>
                    <Text style={[styles.bullet, { color: theme.primary }]}>{'•'}</Text>
                    <Text style={[styles.listText, { color: theme.text }]}>{item}</Text>
                  </View>
                ))}
              </View>
            );
          case 'olist':
            return (
              <View key={i} style={styles.list}>
                {b.items.map((item, j) => (
                  <View key={j} style={styles.listRow}>
                    <Text style={[styles.olNumber, { color: theme.primary }]}>{j + 1}.</Text>
                    <Text style={[styles.listText, { color: theme.text }]}>{item}</Text>
                  </View>
                ))}
              </View>
            );
          case 'quote':
            return (
              <View key={i} style={[styles.quoteWrap, { borderLeftColor: theme.primary, backgroundColor: theme.surfaceSecond }]}>
                <Text style={[styles.quoteText, { color: theme.text }]}>{`“${b.text}”`}</Text>
              </View>
            );
          case 'image':
            return (
              <View key={i} style={styles.imageWrap}>
                <Image
                  source={{ uri: b.url }}
                  style={[styles.image, { backgroundColor: theme.surfaceSecond }]}
                  resizeMode="cover"
                />
                {b.caption ? (
                  <Text style={[styles.caption, { color: theme.textSecond }]}>{b.caption}</Text>
                ) : null}
              </View>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:      { gap: Spacing.md },

  h2:        { fontSize: FontSize.xl, fontWeight: FontWeight.bold, lineHeight: 28, marginTop: Spacing.sm },
  h3:        { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, lineHeight: 24, marginTop: Spacing.xs },
  paragraph: { fontSize: FontSize.base, lineHeight: 24 },

  list:      { gap: 8, paddingLeft: Spacing.xs },
  listRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  bullet:    { fontSize: FontSize.lg, lineHeight: 24, width: 14, textAlign: 'center' },
  olNumber:  { fontSize: FontSize.base, lineHeight: 24, fontWeight: FontWeight.bold, width: 18 },
  listText:  { flex: 1, fontSize: FontSize.base, lineHeight: 24 },

  quoteWrap: {
    borderLeftWidth: 4,
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginVertical: Spacing.xs,
  },
  quoteText: {
    fontSize: FontSize.md,
    fontStyle: 'italic',
    lineHeight: 26,
    fontWeight: FontWeight.medium,
  },

  imageWrap: { gap: 6 },
  image:     { width: '100%', height: 200, borderRadius: Radius.lg },
  caption:   { fontSize: FontSize.xs, fontStyle: 'italic', textAlign: 'center' },
});
