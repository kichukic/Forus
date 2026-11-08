import { memo } from 'react';
import { ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { CARD_GAP, CARD_HEIGHT, CARD_WIDTH, GUTTER, RADIUS, colors, sz } from '../theme';

// A row's heading, with an optional small line under it.
export const SectionHeader = memo(function SectionHeader({
  title,
  subtitle,
  style,
}: {
  title: string;
  subtitle?: string;
  // For when the heading sits inside something that already has a gutter.
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.header, style]}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
});

// Grey stand-in cards while a row loads.
export function SkeletonRow() {
  return (
    <ScrollView horizontal scrollEnabled={false} contentContainerStyle={styles.skeletons}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width: CARD_WIDTH, marginRight: CARD_GAP }}>
          <View style={styles.skeletonPicture} />
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, styles.skeletonShort]} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: GUTTER, marginBottom: sz(10, 12) },
  title: { color: colors.text, fontSize: sz(19, 24), fontWeight: '800', letterSpacing: 0.2 },
  subtitle: { color: colors.muted, fontSize: sz(12.5, 14), marginTop: 2 },
  skeletons: { paddingHorizontal: GUTTER, paddingVertical: 4 },
  skeletonPicture: { height: CARD_HEIGHT, borderRadius: RADIUS, backgroundColor: colors.surface },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: colors.surface, marginTop: 10, width: '85%' },
  skeletonShort: { width: '50%', marginTop: 6 },
});
