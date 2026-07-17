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
import { useBranchesDashboard, useDashboardSummary } from '../../hooks/useDashboard';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { getShortBranchName } from '../../utils/branchHelper';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getMrPrefix(fullName?: string): string {
  if (!fullName) return 'Executive';
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
  const { colors } = useThemeStore();
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
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        accent && {
          borderColor: colors.primary + '60',
          borderWidth: 1.5,
        },
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        },
      ]}
    >
      <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.kpiValue, { color: colors.text }, valueColor ? { color: valueColor } : {}]}>{value}</Text>
      <Text style={[styles.kpiSub, { color: colors.textMuted }]}>{sub}</Text>
    </Animated.View>
  );
}

export default function AGMDashboardScreen({ navigation }: any) {
  const { user, logout } = useAuthStore();
  const { theme, colors, toggleTheme } = useThemeStore();
  const [refreshing, setRefreshing] = useState(false);
  
  const fabPulse = useRef(new Animated.Value(1)).current;
  const fabGlow = useRef(new Animated.Value(0.15)).current;
  const headerFade = useRef(new Animated.Value(0)).current;

  const { data: branches, isLoading: branchesLoading, refetch: refetchBranches } = useBranchesDashboard();
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useDashboardSummary();

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchBranches(), refetchSummary()]);
    setRefreshing(false);
  };

  // FAB gentle pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(fabPulse, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
        Animated.timing(fabPulse, { toValue: 1.0, duration: 2000, useNativeDriver: true }),
      ])
    );
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(fabGlow, { toValue: 0.35, duration: 2000, useNativeDriver: true }),
        Animated.timing(fabGlow, { toValue: 0.15, duration: 2000, useNativeDriver: true }),
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

  if ((branchesLoading || summaryLoading) && !refreshing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Initializing Console...</Text>
      </View>
    );
  }

  // Aggregated stats from live database summary
  const totalRevenue = summary?.total_revenue || 0;
  const digiGoldCount = summary?.digigold_enrollments || 0;
  const digiSilverCount = summary?.digisilver_enrollments || 0;
  const empPresent = summary?.employees_present || 0;
  const empAbsent = summary?.employees_absent || 0;
  const complaintsCount = summary?.complaints_count || 0;
  const topBranch = summary?.top_performing_branch || "N/A";
  const topEmployee = summary?.top_performing_employee || "N/A";

  const submittedCount = branches?.filter(b => b.status === 'SUBMITTED').length || 0;
  const targetTotal = branches?.reduce((sum, b) => sum + b.monthly_sales_target, 0) || 1;
  const dailyRunRate = targetTotal / 30;
  const targetProgress = dailyRunRate > 0 ? ((totalRevenue / dailyRunRate) * 100).toFixed(1) : '0.0';
  const activeAlerts = branches?.filter(b => b.report?.issues && b.report.issues.trim().length > 0) || [];

  const greeting = getGreeting();
  const mrName = getMrPrefix(user?.full_name);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Premium Header */}
      <Animated.View style={[styles.header, { opacity: headerFade, backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.brandMark, { color: colors.primary }]}>POTHYS</Text>
          <Text style={[styles.headerGreeting, { color: colors.textSecondary }]}>{greeting},</Text>
          <Text style={[styles.headerName, { color: colors.text }]}>{mrName}</Text>
          <Text style={[styles.headerDesignation, { color: colors.textMuted }]}>AGM Executive</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={[styles.themeToggleBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} 
            onPress={toggleTheme} 
            activeOpacity={0.7}
          >
            <Text style={styles.themeToggleIcon}>{theme === 'dark' ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.logoutBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} 
            onPress={logout} 
            activeOpacity={0.7}
          >
            <Text style={[styles.logoutBtnText, { color: colors.textSecondary }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* Date strip */}
        <Text style={[styles.dateStrip, { color: colors.textMuted }]}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>

        {/* Critical Alert Banner */}
        {(activeAlerts.length > 0 || complaintsCount > 0) && (
          <Animated.View style={[styles.alertBanner, { opacity: headerFade, backgroundColor: colors.error + '0C', borderColor: colors.error + '40' }]}>
            <View style={styles.alertBannerHeader}>
              <Text style={styles.alertBannerIcon}>⚠️</Text>
              <Text style={[styles.alertBannerTitle, { color: colors.error }]}>OPERATIONAL NOTICES & ALERTS</Text>
              <View style={[styles.alertBannerBadge, { backgroundColor: colors.error }]}>
                <Text style={styles.alertBannerBadgeText}>{activeAlerts.length + complaintsCount}</Text>
              </View>
            </View>
            {activeAlerts.slice(0, 2).map((alert, idx) => (
              <Text key={idx} style={[styles.alertBannerItem, { color: colors.text }]}>
                {getShortBranchName(alert.name)}: {alert.report?.issues}
              </Text>
            ))}
            {summary?.complaints && summary.complaints.slice(0, 2).map((comp, idx) => (
              <Text key={`c-${idx}`} style={[styles.alertBannerItem, { color: colors.warning }]}>
                Complaint: "{comp}"
              </Text>
            ))}
          </Animated.View>
        )}

        {/* KPI Section Header */}
        <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>TODAY'S PERFORMANCE</Text>

        {/* KPI Row 1 - Total Revenue & Target Rate */}
        <View style={styles.kpiRow}>
          <KPICard
            label="TOTAL REVENUE"
            value={`₹${(totalRevenue / 100000).toFixed(2)}L`}
            sub="Across all branches today"
            delay={100}
            accent
          />
          <KPICard
            label="TARGET PROGRESS"
            value={`${targetProgress}%`}
            sub="Of daily target run-rate"
            delay={200}
            valueColor={
              Number(targetProgress) >= 100 ? colors.success :
                Number(targetProgress) >= 70 ? colors.primary : colors.warning
            }
          />
        </View>

        {/* KPI Row 2 - DigiGold & DigiSilver Enrollments */}
        <View style={styles.kpiRow}>
          <KPICard
            label="DIGIGOLD SCHEME"
            value={String(digiGoldCount)}
            sub="New enrollments today"
            delay={250}
            valueColor={colors.primary}
          />
          <KPICard
            label="DIGISILVER SCHEME"
            value={String(digiSilverCount)}
            sub="New enrollments today"
            delay={300}
            valueColor={colors.textSecondary}
          />
        </View>

        {/* KPI Row 3 - Attendance & Complaints */}
        <View style={styles.kpiRow}>
          <KPICard
            label="STAFF ATTENDANCE"
            value={`${empPresent} Present`}
            sub={`${empAbsent} Absent today`}
            delay={350}
            valueColor={colors.success}
          />
          <KPICard
            label="CUSTOMER COMPLAINTS"
            value={String(complaintsCount)}
            sub={complaintsCount > 0 ? "Complaints registered" : "All customers satisfied"}
            delay={400}
            valueColor={complaintsCount > 0 ? colors.error : colors.success}
          />
        </View>

        {/* KPI Row 4 - Top branch & Top Employee */}
        <View style={styles.kpiRow}>
          <KPICard
            label="TOP BRANCH"
            value={topBranch}
            sub="Highest revenue today"
            delay={450}
            valueColor={colors.success}
          />
          <KPICard
            label="TOP EXECUTIVE"
            value={topEmployee.split(" - ")[0]}
            sub={topEmployee.includes(" - ") ? topEmployee.split(" - ")[1] : "No sales logged"}
            delay={500}
            accent
          />
        </View>

        {/* KPI Row 5 - Submissions & Active Alerts */}
        <View style={styles.kpiRow}>
          <KPICard
            label="SUBMISSIONS"
            value={`${submittedCount} / ${branches?.length || 8}`}
            sub="Branches submitted today"
            delay={550}
            valueColor={submittedCount === (branches?.length || 8) ? colors.success : undefined}
          />
          <KPICard
            label="OPERATIONAL ALERTS"
            value={String(activeAlerts.length)}
            sub={activeAlerts.length > 0 ? 'Issues needing attention' : 'No critical issues reported'}
            delay={600}
            valueColor={activeAlerts.length > 0 ? colors.error : colors.success}
          />
        </View>

        {/* Branch Operations Card */}
        <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>OPERATIONS</Text>

        <TouchableOpacity
          style={[styles.branchNavCard, { backgroundColor: colors.surface, borderColor: colors.primary + '40' }]}
          onPress={() => navigation.navigate('BranchOperations')}
          activeOpacity={0.85}
        >
          <View style={styles.branchNavCardLeft}>
            <Text style={styles.branchNavCardIcon}>🏬</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.branchNavCardTitle, { color: colors.text }]}>Branch Operations</Text>
              <Text style={[styles.branchNavCardSub, { color: colors.textSecondary }]}>
                Monitor all branch operations
              </Text>
              <Text style={[styles.branchNavCardMeta, { color: colors.primary }]}>
                {branches?.length || 8} Branches →
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Bottom spacer for FAB */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Premium Floating AI Assistant Button */}
      <View style={styles.fabContainer} pointerEvents="box-none">
        <Animated.View style={[styles.fabGlow, { opacity: fabGlow, backgroundColor: colors.primary }]} />
        <Animated.View style={{ transform: [{ scale: fabPulse }] }}>
          <TouchableOpacity
            style={[
              styles.fab,
              {
                backgroundColor: theme === 'dark' ? '#121217' : '#FFFFFF',
                borderColor: colors.primary,
                shadowColor: colors.primary,
              }
            ]}
            onPress={() => navigation.navigate('AICopilot')}
            activeOpacity={0.85}
          >
            <Text style={[styles.fabIcon, { color: colors.primary }]}>✦</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 6,
    marginBottom: 10,
  },
  headerGreeting: {
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 26,
  },
  headerName: {
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
    letterSpacing: -0.5,
    marginVertical: 4,
  },
  headerDesignation: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  themeToggleBtn: {
    borderWidth: 1,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeToggleIcon: {
    fontSize: 18,
  },
  logoutBtn: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 140,
  },
  dateStrip: {
    fontSize: 15,
    letterSpacing: 0.5,
    marginBottom: 28,
  },
  alertBanner: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
  },
  alertBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  alertBannerIcon: {
    fontSize: 18,
  },
  alertBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.5,
    flex: 1,
  },
  alertBannerBadge: {
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBannerBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  alertBannerItem: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 6,
    paddingLeft: 28,
  },
  sectionHeading: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 20,
    marginTop: 12,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 18,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
  },
  kpiLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  kpiValue: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  kpiSub: {
    fontSize: 15,
    marginTop: 8,
    lineHeight: 20,
  },
  branchNavCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 26,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  branchNavCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  branchNavCardIcon: {
    fontSize: 36,
  },
  branchNavCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  branchNavCardSub: {
    fontSize: 15,
    marginBottom: 8,
    lineHeight: 20,
  },
  branchNavCardMeta: {
    fontSize: 16,
    fontWeight: '700',
  },
  fabContainer: {
    position: 'absolute',
    bottom: 28,
    right: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabGlow: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 22,
    fontWeight: '600',
  },
});
