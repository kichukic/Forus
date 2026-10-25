// Friends: find someone by their exact email or phone number and send a
// request, answer requests that came in, and open a chat with a friend.
import { useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '../data/toasts';
import { GUTTER, colors } from '../theme';
import { lookUp, type ChatUser, type FriendEntry, type Relation } from './api';
import { acceptFriend, addFriend, dropRequest, removeFriend, useChat } from './store';
import { Avatar, Button, Field, Header, chatStyles } from './ui';

type Props = {
  onBack: () => void;
  onOpen: (user: ChatUser) => void;
  onContacts: () => void;
};

export function FriendsView({ onBack, onOpen, onContacts }: Props) {
  const insets = useSafeAreaInsets();
  const { friends } = useChat();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ user: ChatUser; status: Relation } | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setFound(null);
    try {
      setFound(await lookUp(query));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  // Runs a friend action, saying so if it fails.
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      showToast({ text: (e as Error).message });
    }
  };

  const confirmRemove = (user: ChatUser) =>
    Alert.alert(`Remove ${user.name}?`, "You won't be able to message each other until one of you adds the other again.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => act(() => removeFriend(user.id)) },
    ]);

  return (
    <KeyboardAvoidingView behavior="padding" style={[chatStyles.screen, { paddingTop: insets.top + 10 }]}>
      <Header title="Friends" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onContacts} style={({ pressed }) => [styles.contacts, pressed && styles.personPressed]}>
          <View style={styles.contactsIcon}>
            <Ionicons name="people" size={20} color={colors.accent} />
          </View>
          <View style={styles.personText}>
            <Text style={styles.name}>Find friends from contacts</Text>
            <Text style={styles.email}>See who in your phone is on ForUs</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.faint} />
        </Pressable>

        <Text style={styles.section}>Add a friend</Text>
        <View style={styles.searchRow}>
          <Field
            value={query}
            onChangeText={setQuery}
            placeholder="Email or phone number"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={search}
            returnKeyType="search"
            style={styles.searchField}
          />
          <Pressable
            onPress={search}
            accessibilityLabel="Find"
            style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
          >
            <Ionicons name="search" size={20} color="#fff" />
          </Pressable>
        </View>
        <Text style={[chatStyles.note, styles.hint]}>Use their full email, or their number with the country code.</Text>
        {searching && <Text style={chatStyles.note}>Looking…</Text>}
        {error && <Text style={chatStyles.error}>{error}</Text>}
        {found && (
          <Person user={found.user}>
            {found.status === 'friends' ? (
              <Button label="Message" onPress={() => onOpen(found.user)} />
            ) : found.status === 'requested' ? (
              <Text style={styles.status}>Request sent</Text>
            ) : (
              <Button
                label={found.status === 'incoming' ? 'Accept' : 'Add'}
                onPress={() =>
                  act(async () => setFound({ ...found, status: await addFriend(found.user.id) }))
                }
              />
            )}
          </Person>
        )}

        {(friends?.incoming.length ?? 0) > 0 && (
          <>
            <Text style={styles.section}>Requests</Text>
            {friends!.incoming.map((r: FriendEntry) => (
              <Person key={r.requestId} user={r.user}>
                <Button label="Accept" onPress={() => act(() => acceptFriend(r.requestId))} />
                <Button label="Decline" kind="plain" onPress={() => act(() => dropRequest(r.requestId))} />
              </Person>
            ))}
          </>
        )}

        <Text style={styles.section}>Your friends</Text>
        {friends === null ? (
          <Text style={chatStyles.note}>Loading…</Text>
        ) : friends.friends.length === 0 ? (
          <Text style={chatStyles.note}>No friends yet. Add someone above.</Text>
        ) : (
          friends.friends.map((f) => (
            <Person key={f.requestId} user={f.user} onPress={() => onOpen(f.user)} onLongPress={() => confirmRemove(f.user)}>
              <Ionicons name="chatbubble-outline" size={20} color={colors.accent} />
            </Person>
          ))
        )}

        {(friends?.outgoing.length ?? 0) > 0 && (
          <>
            <Text style={styles.section}>Waiting for them</Text>
            {friends!.outgoing.map((r) => (
              <Person key={r.requestId} user={r.user}>
                <Button label="Cancel" kind="plain" onPress={() => act(() => dropRequest(r.requestId))} />
              </Person>
            ))}
          </>
        )}
        {(friends?.friends.length ?? 0) > 0 && (
          <Text style={[chatStyles.note, styles.footnote]}>Press and hold a friend to remove them.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Person({
  user,
  children,
  onPress,
  onLongPress,
}: {
  user: ChatUser;
  children?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      style={({ pressed }) => [styles.person, pressed && styles.personPressed]}
    >
      <Avatar name={user.name} id={user.id} />
      <View style={styles.personText}>
        <Text style={styles.name} numberOfLines={1}>
          {user.name}
        </Text>
        <Text style={styles.email} numberOfLines={1}>
          {user.email ?? 'On ForUs'}
        </Text>
      </View>
      <View style={styles.actions}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 160 },
  section: {
    color: colors.muted,
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 10,
  },
  contacts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  contactsIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  searchRow: { flexDirection: 'row', gap: 10 },
  searchField: { flex: 1 },
  searchButton: {
    width: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  pressed: { opacity: 0.6 },
  hint: { fontSize: 12.5, marginTop: 8, marginBottom: 6 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  personPressed: { backgroundColor: colors.surfaceRaised },
  personText: { flex: 1 },
  name: { color: colors.text, fontSize: 15.5, fontWeight: '800' },
  email: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  footnote: { fontSize: 12, marginTop: 6, textAlign: 'center' },
});
