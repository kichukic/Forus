import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { ErrorPanel } from './ErrorPanel';

type Props = {
  children: ReactNode;
  // Says where the error happened, e.g. "Movie Catalog".
  label?: string;
  // Runs when the user asks to try again, e.g. to remount the screen.
  onReset?: () => void;
};

type State = { error: Error | null };

/**
 * Catches a screen that fails while it renders. React unmounts the whole tree
 * when nothing catches the error, which in a built app means the app closes.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label ?? 'screen'}] ${error.message}`, error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.fill}>
        <ErrorPanel
          title="Something went wrong"
          label={this.props.label}
          message={error.message}
          action="Try again"
          onAction={this.reset}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
});
