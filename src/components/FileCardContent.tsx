import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { findArtwork, parseFileName, type Artwork } from '../api/artwork';
import { colors, isTV } from '../theme';
import { cardImageStyle } from './FocusCard';

type Props = {
  fileName: string;
  detail?: string; // e.g. the file size
};

// Inside of a TorBox card: the title's artwork once found, with a tidy name under it.
export function FileCardContent({ fileName, detail }: Props) {
  const [art, setArt] = useState<Artwork | null>(null);

  useEffect(() => {
    let cancelled = false;
    findArtwork(fileName)
      .then((a) => !cancelled && setArt(a))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fileName]);

  const parsed = parseFileName(fileName);
  const label = art ? art.title : parsed.title;
  const year = art?.year ?? parsed.year;

  return (
    <>
      {art ? (
        <Image source={{ uri: art.image }} style={cardImageStyle} resizeMode="cover" />
      ) : (
        <View style={[cardImageStyle, styles.placeholder]}>
          <Text style={styles.placeholderText} numberOfLines={3}>
            {parsed.title}
          </Text>
        </View>
      )}
      <View style={styles.caption}>
        <Text style={styles.title} numberOfLines={1}>
          {label}
          {year ? ` (${year})` : ''}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {detail ?? fileName}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: '#1f2533', justifyContent: 'center', padding: 12 },
  placeholderText: { color: colors.text, fontSize: isTV ? 18 : 15, fontWeight: '700' },
  caption: { padding: 8, height: isTV ? 52 : 50, justifyContent: 'center' },
  title: { color: colors.text, fontSize: isTV ? 14 : 13, fontWeight: '700' },
  detail: { color: colors.muted, fontSize: isTV ? 12 : 11, marginTop: 2 },
});
