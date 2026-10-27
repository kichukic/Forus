// Finding friends from the phone's contacts: with permission, the numbers and
// emails in the contact list are sent to the chat server, which says which of
// them belong to people on ForUs (matching only verified numbers and emails,
// and keeping nothing). They're shown under the name saved in the contacts.
import { useEffect, useState } from 'react';
import { FlatList, Linking, StyleSheet, Text, View } from 'react-native';
import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Loader } from '../components/Loader';
import { showToast } from '../data/toasts';
import { GUTTER, colors } from '../theme';
import { matchContacts, type ChatUser, type ContactMatch } from './api';
import { acceptFriend, addFriend, useChat } from './store';
import { Avatar, Button, Header, chatStyles } from './ui';

type Props = {
  onBack: () => void;
  onOpen: (user: ChatUser) => void;
};

type Phase = 'ask' | 'denied' | 'reading' | 'done' | 'error';
type Found = ContactMatch & { contactName?: string };

/** Every number and email in the contact list, with the contact's name for each. */
async function readContacts() {
  const contacts = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES, ContactField.EMAILS]);
  const names = new Map<string, string>();
  for (const c of contacts) {
    const name = c.fullName ?? '';
    for (const p of c.phones ?? []) if (p.number && !names.has(p.number)) names.set(p.number, name);
    for (const e of c.emails ?? []) if (e.address && !names.has(e.address)) names.set(e.address, name);
  }
  const values = [...names.keys()];
  return {
    phones: values.filter((v) => !v.includes('@')).slice(0, 3000),
    emails: values.filter((v) => v.includes('@')).slice(0, 3000),
    names,
  };
}

export function ContactsView({ onBack, onOpen }: Props) {
  const insets = useSafeAreaInsets();
  const { friends } = useChat();
  const [phase, setPhase] = useState<Phase>('ask');
  const [found, setFound] = useState<Found[]>([]);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setPhase('reading');
    setError(null);
    try {
      const { phones, emails, names } = await readContacts();
      const matches = await matchContacts(phones, emails);
      setFound(matches.map((m) => ({ ...m, contactName: names.get(m.matched) || undefined })));
      setPhase('done');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  };

  const allow = async () => {
    const { granted, canAskAgain } = await requestPermissionsAsync();
    if (granted) search();
    else setPhase(canAskAgain ? 'ask' : 'denied');
  };

  // Already allowed (from an earlier visit): look straight away.
  useEffect(() => {
    getPermissionsAsync().then(({ granted }) => {
      if (granted) search();
    });
  }, []);

  // Friend requests made here also update this list.
  const statusOf = (m: Found) => {
    if (friends?.friends.some((f) => f.user.id === m.user.id)) return 'friends';
    if (friends?.outgoing.some((f) => f.user.id === m.user.id)) return 'requested';
    const incoming = friends?.incoming.find((f) => f.user.id === m.user.id);
    if (incoming) return 'incoming';
    return friends ? 'none' : m.status;
  };

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      showToast({ text: (e as Error).message });
    }
  };

  return (
    <View style={[chatStyles.screen, { paddingTop: insets.top + 10 }]}>
      <Header title="From your contacts" onBack={onBack} />
      {phase === 'ask' || phase === 'denied' ? (
        <View style={styles.intro}>
          <View style={styles.mark}>
            <Ionicons name="people" size={34} color={colors.accent} />
          </View>
          <Text style={styles.title}>{"See who's on ForUs"}</Text>
          <Text style={[chatStyles.note, styles.center]}>
            {
              "ForUs checks the phone numbers and emails in your contacts to find friends who use it. They're only matched, never stored, and nobody is told you looked."
            }
          </Text>
          {phase === 'denied' ? (
            <>
              <Text style={[chatStyles.note, styles.center]}>
                {"Contacts access is turned off for ForUs. You can allow it in the phone's settings."}
              </Text>
              <Button label="Open settings" onPress={() => Linking.openSettings()} style={styles.button} />
            </>
          ) : (
            <Button label="Find friends in my contacts" onPress={allow} style={styles.button} />
          )}
        </View>
      ) : phase === 'reading' ? (
        <Loader label="Looking through your contacts" icon="people-outline" style={styles.loader} />
      ) : phase === 'error' ? (
        <View style={styles.intro}>
          <Text style={chatStyles.error}>{error}</Text>
          <Button label="Try again" onPress={search} style={styles.button} />
        </View>
      ) : (
        <FlatList
          data={found}
          keyExtractor={(m) => m.user.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            found.length ? (
              <Text style={styles.count}>
                {found.length === 1 ? '1 of your contacts is on ForUs' : `${found.length} of your contacts are on ForUs`}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.intro}>
              <Ionicons name="people-outline" size={48} color={colors.faint} />
              <Text style={styles.title}>No contacts on ForUs yet</Text>
              <Text style={[chatStyles.note, styles.center]}>
                {"When friends join with their phone number or email, they'll show up here."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const status = statusOf(item);
            const incoming = friends?.incoming.find((f) => f.user.id === item.user.id);
            return (
              <View style={styles.row}>
                <Avatar name={item.user.name} id={item.user.id} />
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.contactName || item.user.name}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {item.contactName && item.contactName !== item.user.name
                      ? `${item.user.name} on ForUs`
                      : 'On ForUs'}
                  </Text>
                </View>
                {status === 'friends' ? (
                  <Button label="Message" onPress={() => onOpen(item.user)} />
                ) : status === 'requested' ? (
                  <Text style={styles.status}>Requested</Text>
                ) : incoming ? (
                  <Button label="Accept" onPress={() => act(() => acceptFriend(incoming.requestId))} />
                ) : (
                  <Button label="Add" onPress={() => act(() => addFriend(item.user.id))} />
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { alignItems: 'center', gap: 12, paddingHorizontal: GUTTER + 8, paddingTop: 40 },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  center: { textAlign: 'center' },
  button: { marginTop: 8, alignSelf: 'stretch' },
  loader: { marginTop: 80, alignSelf: 'center' },
  list: { paddingHorizontal: GUTTER, paddingBottom: 160, flexGrow: 1 },
  count: { color: colors.muted, fontSize: 12.5, fontWeight: '800', marginTop: 8, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  rowText: { flex: 1 },
  name: { color: colors.text, fontSize: 15.5, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
  status: { color: colors.muted, fontSize: 13, fontWeight: '700' },
});
