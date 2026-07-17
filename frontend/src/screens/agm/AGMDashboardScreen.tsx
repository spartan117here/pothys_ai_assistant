import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBranchesDashboard } from '../../hooks/useDashboard';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../theme/colors';
import { getShortBranchName } from '../../utils/branchHelper';


function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getMrPrefix(fullName?: string): string {
  if (!fullName) return 'Executive';
  // Extract first name for greeting
  const firstName = fullName.split(' ')[0];
  return `Mr. ${firstName}`;
}

interface KPICardProps {
  label: string;
  value: string;
  sub: string;
  delay: number;
  valueColor?: string;
  accent?: boolean;
}

function KPICard({ label, value, sub, delay, valueColor, accent }: KPICardProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 500,
      delay,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.kpiCard,
        accent && styles.kpiCardAccent,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        },
      ]}
    >
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
      <Text style={styles.kpiSub}>{sub}</Text>
    </Animated.View>
  );
}

export default function AGMDashboardScreen({ navigation }: any) {
  const { user, logout } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const fabPulse = useRef(new Animated.Value(1)).current;
  const fabGlow = useRef(new Animated.Value(0)).current;
  const headerFade = useRef(new Animated.Value(0)).current;

  const { data: branches, isLoading, error, refetch } = useBranchesDashboard();

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // FAB gentle pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(fabPulse, { toValue: 1.06, duration: 1800, useNativeDriver: true }),
        Animated.timing(fabPulse, { toValue: 1.0, duration: 1800, useNativeDriver: true }),
      ])
    );
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(fabGlow, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(fabGlow, { toValue: 0.4, duration: 1800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    glow.start();
    return () => { pulse.stop(); glow.stop(); };
  }, []);

  // Header entrance animation
  useEffect(() => {
    Animated.timing(headerFade, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  if (isLoading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.loadingText}>Initializing Console...</Text>
      </View>
    );
  }

  // Aggregated stats
  const totalSales = branches?.reduce((sum, b) => sum + (b.report?.sales_amount || 0), 0) || 0;
  const submittedCount = branches?.filter(b => b.status === 'SUBMITTED').length || 0;
  const pendingCount = branches?.filter(b => b.status === 'PENDING').length || 0;
  const targetTotal = branches?.reduce((sum, b) => sum + b.monthly_sales_target, 0) || 1;
  const dailyRunRate = targetTotal / 30;
  const targetProgress = dailyRunRate > 0 ? ((totalSales / dailyRunRate) * 100).toFixed(1) : '0.0';
  const activeAlerts = branches?.filter(b => b.report?.issues && b.report.issues.trim().length > 0) || [];

  const greeting = getGreeting();
  const mrName = getMrPrefix(user?.full_name);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Premium Header */}
      <Animated.View style={[styles.header, { opacity: headerFade }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.brandMark}>POTHYS</Text>
          <Text style={styles.headerGreeting}>{greeting},</Text>
          <Text style={styles.headerName}>{mrName}</Text>
          <Text style={styles.headerDesignation}>AGM Executive · Swarna Mahal</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.7}>
          <Text style={styles.logoutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </Animated.View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* Date strip */}
        <Text style={styles.dateStrip}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>

        {/* Critical Alert Banner */}
        {activeAlerts.length > 0 && (
          <Animated.View style={[styles.alertBanner, { opacity: headerFade }]}>
            <View style={styles.alertBannerHeader}>
              <Text style={styles.alertBannerIcon}>⚠️</Text>
              <Text style={styles.alertBannerTitle}>OPERATIONAL ALERTS</Text>
              <View style={styles.alertBannerBadge}>
                <Text style={styles.alertBannerBadgeText}>{activeAlerts.length}</Text>
              </View>
            </View>
            {activeAlerts.slice(0, 2).map((alert, idx) => (
              <Text key={idx} style={styles.alertBannerItem}>
                {getShortBranchName(alert.name)}: {alert.report?.issues}
              </Text>
            ))}
          </Animated.View>
        )}

        {/* KPI Section Header */}
        <Text style={styles.sectionHeading}>TODAY'S PERFORMANCE</Text>

        {/* KPI Row 1 */}
        <View style={styles.kpiRow}>
          <KPICard
            label="TOTAL SALES"
            value={`₹${(totalSales / 100000).toFixed(2)}L`}
            sub="across all branches"
            delay={100}
            accent
          />
          <KPICard
            label="TARGET RATE"
            value={`${targetProgress}%`}
            sub="of daily run-rate"
            delay={200}
            valueColor={
              Number(targetProgress) >= 100 ? COLORS.success :
                Number(targetProgress) >= 70 ? COLORS.primary : COLORS.warning
            }
          />
        </View>

        {/* KPI Row 2 */}
        <View style={styles.kpiRow}>
          <KPICard
            label="SUBMISSIONS"
            value={`${submittedCount} / ${branches?.length || 8}`}
            sub={pendingCount > 0 ? `${pendingCount} still pending` : 'All reports in'}
            delay={300}
            valueColor={submittedCount === (branches?.length || 8) ? COLORS.success : undefined}
          />
          <KPICard
            label="ACTIVE ALERTS"
            value={String(activeAlerts.length)}
            sub={activeAlerts.length > 0 ? 'Issues reported' : 'No issues today'}
            delay={400}
            valueColor={activeAlerts.length > 0 ? COLORS.error : COLORS.success}
          />
        </View>

        {/* Branch Operations Card */}
        <Text style={styles.sectionHeading}>OPERATIONS</Text>

        <TouchableOpacity
          style={styles.branchNavCard}
          onPress={() => navigation.navigate('BranchOperations')}
          activeOpacity={0.85}
        >
          <View style={styles.branchNavCardLeft}>
            <Text style={styles.branchNavCardIcon}>🏬</Text>
            <View>
              <Text style={styles.branchNavCardTitle}>Branch Operations</Text>
              <Text style={styles.branchNavCardSub}>
                View and monitor all {branches?.length || 8} store locations
              </Text>
              <View style={styles.branchNavCardPills}>
                <View style={[styles.pill, styles.pillSuccess]}>
                  <Text style={[styles.pillText, { color: COLORS.success }]}>{submittedCount} In</Text>
                </View>
                {pendingCount > 0 && (
                  <View style={[styles.pill, styles.pillWarning]}>
                    <Text style={[styles.pillText, { color: COLORS.warning }]}>{pendingCount} Pending</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
          <Text style={styles.branchNavCardArrow}>›</Text>
        </TouchableOpacity>

        {/* Quick Summaries */}
        {branches && branches.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>QUICK STATUS</Text>
            <View style={styles.quickStatusRow}>
              {branches.slice(0, 4).map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={styles.quickStatusChip}
                  onPress={() => navigation.navigate('BranchDetail', { branch: b })}
                  activeOpacity={0.8}
                >
                  <View style={[styles.quickStatusDot, {
                    backgroundColor: b.status === 'SUBMITTED' ? COLORS.success : COLORS.warning
                  }]} />
                  <Text style={styles.quickStatusName} numberOfLines={1}>
                    {getShortBranchName(b.name)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {branches.length > 4 && (
              <View style={styles.quickStatusRow}>
                {branches.slice(4).map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.quickStatusChip}
                    onPress={() => navigation.navigate('BranchDetail', { branch: b })}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.quickStatusDot, {
                      backgroundColor: b.status === 'SUBMITTED' ? COLORS.success : COLORS.warning
                    }]} />
                    <Text style={styles.quickStatusName} numberOfLines={1}>
                      {getShortBranchName(b.name)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {/* Bottom spacer for FAB */}
        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Floating AI Assistant Button */}
      <View style={styles.fabContainer} pointerEvents="box-none">
        <Animated.View style={[styles.fabGlow, { opacity: fabGlow }]} />
        <Animated.View style={{ transform: [{ scale: fabPulse }] }}>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => navigation.navigate('AICopilot')}
            activeOpacity={0.85}
          >
            <Text style={styles.fabIcon}>✨</Text>
            <Text style={styles.fabLabel}>AI</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: 12,
    fontSize: 14,
    letterSpacing: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  headerLeft: {
    flex: 1,
  },
  brandMark: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 5,
    marginBottom: 6,
  },
  headerGreeting: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  headerName: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  headerDesignation: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  logoutBtn: {
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  logoutBtnText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  dateStrip: {
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 20,
  },
  alertBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
  },
  alertBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  alertBannerIcon: {
    fontSize: 14,
  },
  alertBannerTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.error,
    letterSpacing: 2,
    flex: 1,
  },
  alertBannerBadge: {
    backgroundColor: COLORS.error,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBannerBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  alertBannerItem: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
    paddingLeft: 22,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 3,
    marginBottom: 14,
    marginTop: 4,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
  },
  kpiCardAccent: {
    borderColor: COLORS.primary + '40',
    backgroundColor: COLORS.surface,
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  kpiSub: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 6,
    lineHeight: 14,
  },
  branchNavCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  branchNavCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  branchNavCardIcon: {
    fontSize: 32,
  },
  branchNavCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 3,
  },
  branchNavCardSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  branchNavCardPills: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  pillSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  pillWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  pillText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  branchNavCardArrow: {
    fontSize: 28,
    color: COLORS.primary,
    fontWeight: '300',
  },
  quickStatusRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  quickStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  quickStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  quickStatusName: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: '500',
  },
  fabContainer: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabGlow: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    opacity: 0.25,
    transform: [{ scale: 1.35 }],
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
  },
  fabIcon: {
    fontSize: 18,
    marginBottom: -2,
  },
  fabLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.textOnPrimary,
    letterSpacing: 1,
  },
});
