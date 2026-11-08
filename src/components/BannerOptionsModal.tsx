import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsAdmin } from '../chat/store';
import { shareOnLongPress } from '../chat/share';
import { cleanTitle } from './VideoRow';
import { colors, isTV, sz, RADIUS } from '../theme';

type Props = {
  visible: boolean;
  video: { id: string; title: string; channel?: string } | null;
  onClose: () => void;
  onHideForMe: (video: { id: string; title: string; channel?: string }) => void;
  onBlockForEveryone: (video: { id: string; title: string; channel?: string }) => void;
};

export function BannerOptionsModal({
  visible,
  video,
  onClose,
  onHideForMe,
  onBlockForEveryone,
}: Props) {
  const isAdmin = useIsAdmin();
  const [confirmAdminBlock, setConfirmAdminBlock] = useState(false);

  if (!video) return null;

  const displayTitle = cleanTitle(video.title);

  const handleClose = () => {
    setConfirmAdminBlock(false);
    onClose();
  };

  const handleHideForMe = () => {
    onHideForMe(video);
    handleClose();
  };

  const handleBlockForEveryone = () => {
    onBlockForEveryone(video);
    handleClose();
  };

  const handleShare = () => {
    const fn = shareOnLongPress(video.id, video.title);
    handleClose();
    if (fn) {
      setTimeout(() => {
        fn();
      }, 150);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handleBar} />

          <View style={styles.header}>
            <Text style={styles.badge}>BANNER PREFERENCES</Text>
            <Text style={styles.title} numberOfLines={2}>
              {displayTitle}
            </Text>
            {video.channel && (
              <Text style={styles.channel} numberOfLines={1}>
                {video.channel}
              </Text>
            )}
          </View>

          {confirmAdminBlock ? (
            <View style={styles.confirmBox}>
              <View style={styles.warningIconBox}>
                <Ionicons name="shield-outline" size={sz(28, 36)} color="#ff6b6b" />
              </View>
              <Text style={styles.confirmHeading}>Remove For All Users?</Text>
              <Text style={styles.confirmBody}>
                This banner will be blocked globally and disappear from the home screen for all users worldwide.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  style={[styles.btn, styles.confirmBtn]}
                  onPress={handleBlockForEveryone}
                >
                  <Text style={styles.confirmBtnText}>Yes, Block Globally</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.cancelBtn]}
                  onPress={() => setConfirmAdminBlock(false)}
                >
                  <Text style={styles.cancelBtnText}>Back</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.menu}>
              <Pressable
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                onPress={handleHideForMe}
              >
                <View style={[styles.itemIcon, styles.iconHide]}>
                  <Ionicons name="eye-off-outline" size={sz(20, 24)} color="#fff" />
                </View>
                <View style={styles.itemContent}>
                  <Text style={styles.itemTitle}>Not Interested / Hide For Me</Text>
                  <Text style={styles.itemSubtitle}>Do not recommend this movie on this device</Text>
                </View>
              </Pressable>

              {isAdmin && (
                <Pressable
                  style={({ pressed }) => [styles.item, styles.adminItem, pressed && styles.itemPressed]}
                  onPress={() => setConfirmAdminBlock(true)}
                >
                  <View style={[styles.itemIcon, styles.iconAdmin]}>
                    <Ionicons name="globe-outline" size={sz(20, 24)} color="#ff6b6b" />
                  </View>
                  <View style={styles.itemContent}>
                    <View style={styles.adminTitleRow}>
                      <Text style={[styles.itemTitle, styles.adminTitleText]}>
                        Block For All Users
                      </Text>
                      <View style={styles.adminTag}>
                        <Text style={styles.adminTagText}>ADMIN</Text>
                      </View>
                    </View>
                    <Text style={styles.itemSubtitle}>
                      {"Remove this banner globally from every user's feed"}
                    </Text>
                  </View>
                </Pressable>
              )}

              <Pressable
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                onPress={handleShare}
              >
                <View style={[styles.itemIcon, styles.iconShare]}>
                  <Ionicons name="paper-plane-outline" size={sz(20, 24)} color="#fff" />
                </View>
                <View style={styles.itemContent}>
                  <Text style={styles.itemTitle}>Share With Friends</Text>
                  <Text style={styles.itemSubtitle}>Send title directly in chat</Text>
                </View>
              </Pressable>

              <Pressable
                style={[styles.btn, styles.closeBtn]}
                onPress={handleClose}
              >
                <Text style={styles.closeBtnText}>Cancel</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: isTV ? 'center' : 'flex-end',
    alignItems: isTV ? 'center' : 'stretch',
  },
  sheet: {
    backgroundColor: '#1d172a',
    borderTopLeftRadius: isTV ? RADIUS + 8 : 24,
    borderTopRightRadius: isTV ? RADIUS + 8 : 24,
    borderRadius: isTV ? RADIUS + 8 : 0,
    width: isTV ? sz(480, 540) : '100%',
    paddingHorizontal: sz(20, 28),
    paddingBottom: sz(32, 40),
    paddingTop: 12,
    borderWidth: isTV ? 1 : 0,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 16,
    display: isTV ? 'none' : 'flex',
  },
  header: {
    marginBottom: sz(18, 22),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 16,
  },
  badge: {
    color: colors.accent,
    fontSize: sz(11, 13),
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    color: colors.text,
    fontSize: sz(18, 22),
    fontWeight: '700',
    lineHeight: sz(24, 28),
  },
  channel: {
    color: colors.muted,
    fontSize: sz(13, 15),
    marginTop: 4,
  },
  menu: {
    gap: sz(10, 14),
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: sz(14, 18),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  itemPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  adminItem: {
    borderColor: 'rgba(255, 107, 107, 0.3)',
    backgroundColor: 'rgba(255, 107, 107, 0.06)',
  },
  itemIcon: {
    width: sz(42, 48),
    height: sz(42, 48),
    borderRadius: sz(21, 24),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: sz(14, 18),
  },
  iconHide: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  iconAdmin: {
    backgroundColor: 'rgba(255, 107, 107, 0.18)',
  },
  iconShare: {
    backgroundColor: 'rgba(125, 63, 240, 0.3)',
  },
  itemContent: {
    flex: 1,
  },
  adminTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adminTitleText: {
    color: '#ff8585',
  },
  adminTag: {
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adminTagText: {
    color: '#fff',
    fontSize: sz(10, 11),
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  itemTitle: {
    color: colors.text,
    fontSize: sz(15, 17),
    fontWeight: '700',
  },
  itemSubtitle: {
    color: colors.muted,
    fontSize: sz(12, 14),
    marginTop: 2,
  },
  btn: {
    borderRadius: 14,
    paddingVertical: sz(12, 16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 8,
  },
  closeBtnText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: sz(15, 17),
    fontWeight: '600',
  },
  confirmBox: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  warningIconBox: {
    width: sz(60, 72),
    height: sz(60, 72),
    borderRadius: sz(30, 36),
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmHeading: {
    color: colors.text,
    fontSize: sz(20, 24),
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmBody: {
    color: colors.muted,
    fontSize: sz(13.5, 16),
    textAlign: 'center',
    lineHeight: sz(19, 22),
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  confirmActions: {
    width: '100%',
    gap: 10,
  },
  confirmBtn: {
    backgroundColor: '#e03131',
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: sz(15, 17),
    fontWeight: '700',
  },
  cancelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cancelBtnText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: sz(15, 17),
    fontWeight: '600',
  },
});
