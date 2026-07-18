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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBranchesDashboard, useDashboardSummary } from '../../hooks/useDashboard';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { useUnreadCount } from '../../hooks/useNotifications';
import { getShortBranchName } from '../../utils/branchHelper';
import { formatIndianCurrency } from '../../utils/currencyFormatter';

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
  value?: string;
  sub?: string;
  delay: number;
  valueColor?: string;
  accent?: boolean;
  children?: React.ReactNode;
}

function KPICard({ label, value, sub, delay, valueColor, accent, children }: KPICardProps) {
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
      {children ? children : (
        <>
          <Text style={[styles.kpiValue, { color: colors.text }, valueColor ? { color: valueColor } : {}]}>{value}</Text>
          <Text style={[styles.kpiSub, { color: colors.textMuted }]}>{sub}</Text>
        </>
      )}
    </Animated.View>
  );
}

interface ExecInfoCardProps {
  icon: string;
  title: string;
  name: string;
  roleOrSub?: string;
  metricLabel?: string;
  metricValue?: string;
  actionText: string;
  onPress: () => void;
  delay: number;
}

function ExecInfoCard({ icon, title, name, roleOrSub, metricLabel, metricValue, actionText, onPress, delay }: ExecInfoCardProps) {
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
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
      <TouchableOpacity
        style={[styles.execCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <View style={styles.execCardHeader}>
          <Text style={styles.execCardIcon}>{icon}</Text>
          <Text style={[styles.execCardTitle, { color: colors.textSecondary }]}>{title}</Text>
        </View>
        <Text style={[styles.execCardName, { color: colors.text }]}>{name}</Text>
        {roleOrSub ? <Text style={[styles.execCardRole, { color: colors.textSecondary }]}>{roleOrSub}</Text> : null}
        
        {metricLabel && metricValue ? (
          <View style={styles.execCardMetricRow}>
            <Text style={[styles.execCardMetricLabel, { color: colors.textMuted }]}>{metricLabel}</Text>
            <Text style={[styles.execCardMetricValue, { color: colors.text }]}>{metricValue}</Text>
          </View>
        ) : null}

        <View style={[styles.execCardActionRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.execCardActionText, { color: colors.primary }]}>{actionText}</Text>
        </View>
      </TouchableOpacity>
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

  // Bell badge: driven by the backend unread count API
  const { data: unreadData } = useUnreadCount();
  const unreadCount = unreadData?.count ?? 0;

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
            onPress={() => navigation.navigate('NotificationCenter')} 
            activeOpacity={0.7}
          >
            <Text style={styles.themeToggleIcon}>🔔</Text>
            {unreadCount > 0 && (
              <View style={[styles.bellBadge, { backgroundColor: colors.error }]}>
                <Text style={styles.bellBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
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



        {/* KPI Section Header */}
        <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>TODAY'S PERFORMANCE</Text>

        {/* KPI Row 1 - Total Revenue & Target Rate */}
        <View style={styles.kpiRow}>
          <KPICard
            label="TOTAL REVENUE"
            value={formatIndianCurrency(totalRevenue)}
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

        {/* KPI Row 2 - Schemes & Attendance */}
        <View style={styles.kpiRow}>
          <KPICard
            label="SCHEMES"
            delay={250}
          >
            <View style={{ marginTop: 6, gap: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                DigiGold: <Text style={{ color: colors.primary }}>{digiGoldCount}</Text>
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                DigiSilver: <Text style={{ color: colors.textSecondary }}>{digiSilverCount}</Text>
              </Text>
            </View>
          </KPICard>
          <KPICard
            label="ATTENDANCE"
            value={String(empPresent)}
            sub={`${empAbsent} Absent today`}
            delay={350}
            valueColor={colors.success}
          />
        </View>

        {/* Executive Info Cards - Top branch & Top Employee */}
        <ExecInfoCard
          icon="🏆"
          title="Top Performing Branch"
          name={topBranch.split(" - ")[0] || "N/A"}
          metricLabel={topBranch.includes(" - ") ? "Today's Metric" : undefined}
          metricValue={topBranch.includes(" - ") ? topBranch.split(" - ")[1] : undefined}
          actionText="Tap to view complete branch analytics →"
          onPress={() => navigation.navigate('BranchOperations')}
          delay={450}
        />
        <ExecInfoCard
          icon="👤"
          title="Top Performing Executive"
          name={topEmployee.split(" - ")[0] || "N/A"}
          roleOrSub={topEmployee.includes(" - ") ? topEmployee.split(" - ")[1] : undefined}
          actionText="Tap to view employee performance →"
          onPress={() => navigation.navigate('BranchOperations')}
          delay={500}
        />

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
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
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
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 5,
    marginBottom: 4,
  },
  headerGreeting: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 20,
  },
  headerName: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    letterSpacing: -0.5,
    marginVertical: 2,
  },
  headerDesignation: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  themeToggleBtn: {
    borderWidth: 1,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeToggleIcon: {
    fontSize: 16,
  },
  logoutBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  logoutBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  dateStrip: {
    fontSize: 13,
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  alertBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  alertBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  alertBannerIcon: {
    fontSize: 16,
  },
  alertBannerTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    flex: 1,
  },
  alertBannerBadge: {
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBannerBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  alertBannerItem: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
    paddingLeft: 24,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 12,
    marginTop: 8,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1,
  },
  kpiSub: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 16,
  },
  execCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    marginBottom: 8,
  },
  execCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  execCardIcon: {
    fontSize: 12,
  },
  execCardTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  execCardName: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  execCardRole: {
    fontSize: 12,
    marginBottom: 8,
  },
  execCardMetricRow: {
    marginTop: 4,
    marginBottom: 12,
  },
  execCardMetricLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  execCardMetricValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  execCardActionRow: {
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 2,
  },
  execCardActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  branchNavCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  branchNavCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  branchNavCardIcon: {
    fontSize: 28,
  },
  branchNavCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  branchNavCardSub: {
    fontSize: 13,
    marginBottom: 6,
    lineHeight: 18,
  },
  branchNavCardMeta: {
    fontSize: 14,
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
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
});
