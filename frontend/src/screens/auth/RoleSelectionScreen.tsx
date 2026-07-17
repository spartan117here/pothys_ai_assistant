import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../../theme/colors';

const { width } = Dimensions.get('window');
const CARD_WIDTH = Math.min(width - 48, 420);

export default function RoleSelectionScreen({ navigation }: any) {
  // Staggered entrance animations
  const logoOpacity  = useRef(new Animated.Value(0)).current;
  const logoY        = useRef(new Animated.Value(-20)).current;
  const card1Opacity = useRef(new Animated.Value(0)).current;
  const card1Y       = useRef(new Animated.Value(40)).current;
  const card2Opacity = useRef(new Animated.Value(0)).current;
  const card2Y       = useRef(new Animated.Value(40)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(logoY,       { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(card1Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(card1Y,       { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(card2Opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(card2Y,       { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.timing(footerOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Background decorative gradient rings */}
      <View style={styles.bgRing1} pointerEvents="none" />
      <View style={styles.bgRing2} pointerEvents="none" />

      <View style={styles.content}>
        {/* Brand Logo */}
        <Animated.View style={[styles.logoSection, { opacity: logoOpacity, transform: [{ translateY: logoY }] }]}>
          <View style={styles.emblem}>
            <Text style={styles.emblemLetter}>P</Text>
          </View>
          <Text style={styles.brandTitle}>POTHYS</Text>
          <Text style={styles.brandSub}>Swarna Mahal</Text>
          <View style={styles.divider} />
          <Text style={styles.systemLabel}>AI Executive Platform</Text>
          <Text style={styles.systemSub}>Select your access role to continue</Text>
        </Animated.View>

        {/* Role Cards */}
        <View style={styles.cardsWrapper}>
          {/* AGM Card */}
          <Animated.View style={{ opacity: card1Opacity, transform: [{ translateY: card1Y }], width: CARD_WIDTH }}>
            <TouchableOpacity
              style={styles.roleCard}
              onPress={() => navigation.navigate('AGMLogin')}
              activeOpacity={0.85}
            >
              {/* Gold top accent bar */}
              <View style={styles.cardAccentBar} />

              <View style={styles.cardInner}>
                <View style={styles.cardIconWrap}>
                  <Text style={styles.cardIcon}>👔</Text>
                </View>
                <View style={styles.cardTextBlock}>
                  <Text style={styles.cardRoleLabel}>AGM LOGIN</Text>
                  <Text style={styles.cardRoleTitle}>AGM</Text>
                  <Text style={styles.cardRoleDesc}>
                    Full executive dashboard — branch analytics, AI copilot, operations oversight
                  </Text>
                </View>
                <View style={styles.cardArrowWrap}>
                  <Text style={styles.cardArrow}>›</Text>
                </View>
              </View>

              {/* Subtle gold shimmer border */}
              <View style={styles.cardGlowBorder} />
            </TouchableOpacity>
          </Animated.View>

          {/* Manager Card */}
          <Animated.View style={{ opacity: card2Opacity, transform: [{ translateY: card2Y }], width: CARD_WIDTH, marginTop: 16 }}>
            <TouchableOpacity
              style={[styles.roleCard, styles.roleCardManager]}
              onPress={() => navigation.navigate('ManagerLogin')}
              activeOpacity={0.85}
            >
              <View style={[styles.cardAccentBar, styles.cardAccentBarManager]} />

              <View style={styles.cardInner}>
                <View style={[styles.cardIconWrap, styles.cardIconWrapManager]}>
                  <Text style={styles.cardIcon}>🏬</Text>
                </View>
                <View style={styles.cardTextBlock}>
                  <Text style={[styles.cardRoleLabel, styles.cardRoleLabelManager]}>MANAGER LOGIN</Text>
                  <Text style={styles.cardRoleTitle}>Branch Manager</Text>
                  <Text style={styles.cardRoleDesc}>
                    Daily report submission — upload branch operational data securely
                  </Text>
                </View>
                <View style={styles.cardArrowWrap}>
                  <Text style={[styles.cardArrow, styles.cardArrowManager]}>›</Text>
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Footer */}
        <Animated.View style={[styles.footer, { opacity: footerOpacity }]}>
          <View style={styles.footerLockRow}>
            <Text style={styles.footerLock}>🔒</Text>
            <Text style={styles.footerText}>Authorized Personnel Only</Text>
          </View>
          <Text style={styles.footerSub}>
            This is an internal enterprise system. All sessions are encrypted and activity is audited.
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  // Decorative background rings
  bgRing1: {
    position: 'absolute',
    width: 600,
    height: 600,
    borderRadius: 300,
    borderWidth: 1,
    borderColor: COLORS.primary + '08',
    top: -200,
    alignSelf: 'center',
  },
  bgRing2: {
    position: 'absolute',
    width: 400,
    height: 400,
    borderRadius: 200,
    borderWidth: 1,
    borderColor: COLORS.primary + '06',
    bottom: -100,
    alignSelf: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  // ── Logo ──
  logoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  emblem: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary + '15',
    borderWidth: 1.5,
    borderColor: COLORS.primary + '60',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  emblemLetter: {
    fontSize: 34,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 1,
  },
  brandTitle: {
    fontSize: 42,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 6,
  },
  brandSub: {
    fontSize: 16,
    fontWeight: '300',
    color: COLORS.text,
    letterSpacing: 6,
    textTransform: 'uppercase',
    marginTop: -2,
  },
  divider: {
    width: 48,
    height: 1,
    backgroundColor: COLORS.primary + '70',
    marginVertical: 14,
  },
  systemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  systemSub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
    letterSpacing: 0.2,
  },
  // ── Cards ──
  cardsWrapper: {
    alignItems: 'center',
    width: '100%',
  },
  roleCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  roleCardManager: {
    shadowColor: '#3B82F6',
    shadowOpacity: 0.12,
  },
  cardAccentBar: {
    height: 3,
    backgroundColor: COLORS.primary,
    width: '100%',
  },
  cardAccentBarManager: {
    backgroundColor: '#3B82F6',
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 22,
    gap: 16,
  },
  cardIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: COLORS.primary + '18',
    borderWidth: 1,
    borderColor: COLORS.primary + '35',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardIconWrapManager: {
    backgroundColor: '#3B82F6' + '18',
    borderColor: '#3B82F6' + '35',
  },
  cardIcon: {
    fontSize: 26,
  },
  cardTextBlock: {
    flex: 1,
  },
  cardRoleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  cardRoleLabelManager: {
    color: '#3B82F6',
  },
  cardRoleTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 5,
  },
  cardRoleDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  cardArrowWrap: {
    flexShrink: 0,
  },
  cardArrow: {
    fontSize: 32,
    color: COLORS.primary,
    fontWeight: '300',
    lineHeight: 36,
  },
  cardArrowManager: {
    color: '#3B82F6',
  },
  cardGlowBorder: {
    // subtle inner shine at bottom edge
    height: 1,
    backgroundColor: COLORS.primary + '20',
  },
  // ── Footer ──
  footer: {
    alignItems: 'center',
    marginTop: 36,
    paddingHorizontal: 16,
  },
  footerLockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  footerLock: {
    fontSize: 12,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  footerSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
