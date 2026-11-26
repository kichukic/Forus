import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, isTV } from '../theme';

export type TVRailId =
  | 'moviebox'
  | 'search'
  | 'history'
  | 'favorites'
  | 'settings';

export type TVRailItem = {
  id: TVRailId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
};

export const TV_RAIL_ITEMS: TVRailItem[] = [
  { id: 'moviebox', label: 'MovieBox', icon: 'film-outline', activeIcon: 'film' },
  { id: 'search', label: 'Search', icon: 'search-outline', activeIcon: 'search' },
  { id: 'history', label: 'History', icon: 'time-outline', activeIcon: 'time' },
  { id: 'favorites', label: 'Favorites', icon: 'heart-outline', activeIcon: 'heart' },
  { id: 'settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
];

export const TV_RAIL_COLLAPSED_WIDTH = 72;
export const TV_RAIL_EXPANDED_WIDTH = 236;

type Props = {
  active: TVRailId;
  onSelect: (id: TVRailId) => void;
};

export const TVNavigationRail = memo(function TVNavigationRail({ active, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);
  const animWidth = useRef(new Animated.Value(TV_RAIL_COLLAPSED_WIDTH)).current;
  const animScrim = useRef(new Animated.Value(0)).current;
  const animLabel = useRef(new Animated.Value(0)).current;
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expand = useCallback(() => {
    if (blurTimeout.current) {
      clearTimeout(blurTimeout.current);
      blurTimeout.current = null;
    }
    setExpanded(true);
    Animated.parallel([
      Animated.timing(animWidth, {
        toValue: TV_RAIL_EXPANDED_WIDTH,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(animScrim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(animLabel, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [animWidth, animScrim, animLabel]);

  const collapse = useCallback(() => {
    blurTimeout.current = setTimeout(() => {
      setExpanded(false);
      Animated.parallel([
        Animated.timing(animWidth, {
          toValue: TV_RAIL_COLLAPSED_WIDTH,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(animScrim, {
          toValue: 0,
          duration: 150,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(animLabel, {
          toValue: 0,
          duration: 120,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }, 70);
  }, [animWidth, animScrim, animLabel]);

  useEffect(() => {
    return () => {
      if (blurTimeout.current) clearTimeout(blurTimeout.current);
    };
  }, []);

  if (!isTV) return null;

  return (
    <>
      {/* Background scrim dimming content while rail is expanded */}
      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={[
          styles.scrim,
          {
            opacity: animScrim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.65],
            }),
          },
        ]}
      />

      {/* Persistent Left Navigation Rail */}
      <Animated.View style={[styles.rail, { width: animWidth }]}>
        <LinearGradient
          colors={['rgba(15, 12, 22, 0.98)', 'rgba(10, 8, 15, 0.99)']}
          style={StyleSheet.absoluteFill}
        />

        {/* Top Logo / App Badge */}
        <View style={styles.brandContainer}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>F</Text>
          </View>
          <Animated.View
            style={[
              styles.brandTextWrapper,
              {
                opacity: animLabel,
                transform: [
                  {
                    translateX: animLabel.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.brandTitle}>
              For<Text style={styles.brandAccent}>Us</Text>
            </Text>
          </Animated.View>
        </View>

        {/* Navigation Items List */}
        <TVFocusGuideView autoFocus style={styles.list}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {TV_RAIL_ITEMS.map((item) => (
              <RailButton
                key={item.id}
                item={item}
                isActive={active === item.id}
                animLabel={animLabel}
                onFocus={expand}
                onBlur={collapse}
                onPress={() => {
                  onSelect(item.id);
                }}
              />
            ))}
          </ScrollView>
        </TVFocusGuideView>
      </Animated.View>
    </>
  );
});

type RailButtonProps = {
  item: TVRailItem;
  isActive: boolean;
  animLabel: Animated.Value;
  onFocus: () => void;
  onBlur: () => void;
  onPress: () => void;
};

const RailButton = memo(function RailButton({
  item,
  isActive,
  animLabel,
  onFocus,
  onBlur,
  onPress,
}: RailButtonProps) {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const handleFocus = () => {
    setFocused(true);
    Animated.timing(scale, {
      toValue: 1.05,
      duration: 100,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    onFocus();
  };

  const handleBlur = () => {
    setFocused(false);
    Animated.timing(scale, {
      toValue: 1,
      duration: 100,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    onBlur();
  };

  return (
    <Pressable
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPress={onPress}
      style={({ pressed }) => [
        styles.buttonWrapper,
        pressed && styles.buttonPressed,
      ]}
    >
      <Animated.View
        style={[
          styles.buttonContent,
          isActive && styles.buttonActive,
          focused && styles.buttonFocused,
          { transform: [{ scale }] },
        ]}
      >
        <View style={styles.iconContainer}>
          <Ionicons
            name={isActive || focused ? item.activeIcon : item.icon}
            size={22}
            color={focused ? '#ffffff' : isActive ? colors.accent : colors.muted}
          />
        </View>

        <Animated.View
          style={[
            styles.labelContainer,
            {
              opacity: animLabel,
              transform: [
                {
                  translateX: animLabel.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.labelText,
              isActive && styles.labelActive,
              focused && styles.labelFocused,
            ]}
          >
            {item.label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 998,
  },
  rail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 999,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 16,
  },
  brandContainer: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  brandBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  brandBadgeText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
  },
  brandTextWrapper: {
    marginLeft: 14,
    overflow: 'hidden',
  },
  brandTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  brandAccent: {
    color: colors.accent,
  },
  list: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 4,
  },
  buttonWrapper: {
    borderRadius: 12,
    marginVertical: 2,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  buttonActive: {
    backgroundColor: 'rgba(155, 92, 255, 0.16)',
  },
  buttonFocused: {
    borderColor: '#ffffff',
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
  },
  iconContainer: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    marginLeft: 10,
    overflow: 'hidden',
    flex: 1,
  },
  labelText: {
    color: colors.muted,
    fontSize: 14.5,
    fontWeight: '600',
  },
  labelActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  labelFocused: {
    color: '#ffffff',
    fontWeight: '900',
  },
});
