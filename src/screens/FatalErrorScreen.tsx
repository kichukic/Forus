import { StyleSheet, View } from 'react-native';
import { ErrorPanel } from '../components/ErrorPanel';
import { colors } from '../theme';

type Props = {
  error: Error;
  onDismiss: () => void;
};

// The last resort: an error that nothing else caught. The app stays open and
// says what happened, instead of closing.
export function FatalErrorScreen({ error, onDismiss }: Props) {
  return (
    <View style={styles.screen}>
      <ErrorPanel
        title="The app ran into a problem"
        message={error.message}
        action="Go back"
        onAction={onDismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, backgroundColor: colors.background },
});
