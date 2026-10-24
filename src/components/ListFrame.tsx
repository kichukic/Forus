// Room for a vertical list that fills the space it is given.
//
// On TV, react-native-tvos wraps every vertical FlatList in a TVFocusGuideView
// that has no style. A list that fills its parent (flex: 1) then has nothing
// to fill: the wrapper has no height of its own, so the list collapses to a
// sliver and the page looks empty. Here the space is measured first and the
// list is handed that exact height. On a phone there is no wrapper, so the
// list is drawn as it is and `height` is undefined.
import { useState, type ReactNode } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { isTV } from '../theme';

type Props = {
  children: (height: number | undefined) => ReactNode;
};

export function ListFrame({ children }: Props) {
  const windowHeight = Dimensions.get('window').height;
  const initialHeight = isTV ? Math.max(300, windowHeight - 140) : 0;
  const [height, setHeight] = useState(initialHeight);

  if (!isTV) return <>{children(undefined)}</>;

  return (
    <View
      style={styles.fill}
      onLayout={(e) => {
        const measured = Math.round(e.nativeEvent.layout.height);
        // Avoid collapsing into an incomplete intermediate layout glitch
        if (measured >= 200) {
          setHeight(measured);
        }
      }}
    >
      {children(height)}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
});
