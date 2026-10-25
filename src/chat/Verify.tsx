// Verifying a phone number or an email with Phone.Email: their page, in a
// sheet, sends a code by SMS or email and checks it. When it's right the page
// hands over a result, which the chat server then confirms with Phone.Email;
// the app itself never decides that something is verified.
//
//   phone: the page's in-app-browser mode (auth_type 5) returns an access
//          token through `flutter_inappwebview.callHandler`
//   email: the page returns a result link through `window.opener.postMessage`,
//          as it does for its web button
// Both are provided here, forwarding the result to the app.
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Loader } from '../components/Loader';
import { colors } from '../theme';

// From admin.phone.email → Profile Details. Not a secret: it identifies ForUs
// to Phone.Email, and the server checks every result with them.
const CLIENT_ID = process.env.EXPO_PUBLIC_PHONE_EMAIL_CLIENT_ID ?? '15557258674807780720';
const PAGES = {
  phone: 'https://auth.phone.email/log-in',
  email: 'https://auth.phone.email/email-log-in',
};
const DEVICE_KEY = 'phone-email-device';

const BRIDGE = `
  (function () {
    function send(message) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }
    window.flutter_inappwebview = {
      callHandler: function (name, params) { send({ kind: 'phone', handler: name, params: params }); },
    };
    window.opener = {
      closed: false,
      postMessage: function (data) { send({ kind: 'email', data: data }); },
    };
  })();
  true;
`;

// Phone.Email keys a sign-in to a device id; a random one, kept for good.
async function deviceId(): Promise<string> {
  const saved = await AsyncStorage.getItem(DEVICE_KEY).catch(() => null);
  if (saved) return saved;
  const id = Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
  await AsyncStorage.setItem(DEVICE_KEY, id).catch(() => {});
  return id;
}

export type VerifyKind = 'phone' | 'email';

type Props = {
  // Which to verify, or null while the sheet is closed.
  kind: VerifyKind | null;
  title: string;
  // An access token for a phone, a result link for an email.
  onVerified: (kind: VerifyKind, result: string) => void;
  onClose: () => void;
};

export function Verify({ kind, title, onVerified, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [device, setDevice] = useState<string | null>(null);

  useEffect(() => {
    if (kind && !device) deviceId().then(setDevice);
  }, [kind, device]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (kind === 'phone' && message?.kind === 'phone' && message.handler === 'sendTokenToApp') {
        const token = message.params?.access_token;
        if (typeof token === 'string' && token) onVerified('phone', token);
      } else if (kind === 'email' && message?.kind === 'email' && message.data?.flag_email === '1') {
        const link = message.data.user_json_url;
        if (typeof link === 'string' && link) onVerified('email', link);
      }
    } catch {
      // Not a message from the verification page.
    }
  };

  const url =
    kind && device
      ? `${PAGES[kind]}?client_id=${encodeURIComponent(CLIENT_ID)}&auth_type=5&device=${encodeURIComponent(device)}`
      : null;

  return (
    <Modal visible={!!kind} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.bar}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close" style={styles.close}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{title}</Text>
        </View>
        {url ? (
          <WebView
            key={url}
            source={{ uri: url }}
            injectedJavaScriptBeforeContentLoaded={BRIDGE}
            onMessage={onMessage}
            startInLoadingState
            renderLoading={() => (
              <Loader label="Opening" icon={kind === 'email' ? 'mail-outline' : 'call-outline'} style={styles.loader} />
            )}
            style={styles.web}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  web: { flex: 1, backgroundColor: '#fff' },
  loader: { position: 'absolute', top: 60, alignSelf: 'center' },
});
