// The Chat tab: sign in, then the conversation list, friends, your profile
// and single conversations. Back steps out of a conversation (or friends, or
// the profile) before it leaves the tab.
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { ChatUser, SharedTitle } from '../chat/api';
import { AuthView } from '../chat/AuthView';
import { ContactsView } from '../chat/ContactsView';
import { ConversationListView } from '../chat/ConversationListView';
import { ConversationView } from '../chat/ConversationView';
import { FriendsView } from '../chat/FriendsView';
import { ProfileView } from '../chat/ProfileView';
import { onOpenChatRequest } from '../chat/push';
import { useChat } from '../chat/store';
import { Loader } from '../components/Loader';

type View =
  | { name: 'list' }
  | { name: 'friends' }
  | { name: 'contacts' }
  | { name: 'profile' }
  | { name: 'conversation'; user: ChatUser };

export type ChatHandle = {
  /** Steps back inside the tab; false when already on the list. */
  goBack: () => boolean;
};

type Props = {
  onPlay: (title: SharedTitle) => void;
  // A conversation fills the screen, so the bottom bar steps aside for it.
  onFullScreen: (full: boolean) => void;
  ref?: Ref<ChatHandle>;
};

export function ChatScreen({ onPlay, onFullScreen, ref }: Props) {
  const { status } = useChat();
  const [view, setViewState] = useState<View>({ name: 'list' });

  const setView = (next: View) => {
    setViewState(next);
    onFullScreen(next.name === 'conversation');
  };

  // A tapped message notification opens its conversation, once signed in.
  useEffect(() => {
    if (status !== 'signedIn') return;
    return onOpenChatRequest((user, take) => {
      take();
      setViewState({ name: 'conversation', user });
      onFullScreen(true);
    });
  }, [status, onFullScreen]);

  useImperativeHandle(ref, () => ({
    goBack: () => {
      if (status !== 'signedIn' || view.name === 'list') return false;
      setView(view.name === 'contacts' ? { name: 'friends' } : { name: 'list' });
      return true;
    },
  }));

  if (status === 'loading') return <Loader label="Opening chat" icon="chatbubbles-outline" style={{ marginTop: 120, alignSelf: 'center' }} />;
  if (status === 'signedOut') return <AuthView />;

  const open = (user: ChatUser) => setView({ name: 'conversation', user });
  switch (view.name) {
    case 'conversation':
      return <ConversationView user={view.user} onBack={() => setView({ name: 'list' })} onPlay={onPlay} />;
    case 'friends':
      return (
        <FriendsView
          onBack={() => setView({ name: 'list' })}
          onOpen={open}
          onContacts={() => setView({ name: 'contacts' })}
        />
      );
    case 'contacts':
      return <ContactsView onBack={() => setView({ name: 'friends' })} onOpen={open} />;
    case 'profile':
      return <ProfileView onBack={() => setView({ name: 'list' })} />;
    default:
      return (
        <ConversationListView
          onOpen={open}
          onFriends={() => setView({ name: 'friends' })}
          onProfile={() => setView({ name: 'profile' })}
        />
      );
  }
}
