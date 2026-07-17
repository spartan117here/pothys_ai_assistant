import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Animated,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBranchAnalytics } from '../../hooks/useDashboard';
import { COLORS } from '../../theme/colors';
import { getShortBranchName } from '../../utils/branchHelper';
import { BranchStatus } from '../../hooks/useDashboard';

interface BranchDetailScreenProps {
  navigation: any;
  route: {
    params: {
      branch: BranchStatus;
    };
  };
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MetricRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

function ProgressBar({ percent, color = COLORS.primary }: { percent: number; color?: string }) {
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: Math.min(100, percent),
      duration: 800,
      delay: 300,
      useNativeDriver: false,
    }).start();
  }, [percent]);

  return (
    <View style={styles.progressTrack}>
      <Animated.View
        style={[
          styles.progressFill,
          {
            backgroundColor: color,
            width: animWidth.interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}

export default function BranchDetailScreen({ navigation, route }: BranchDetailScreenProps) {
  const { branch } = route.params;
  const { data: analytics, isLoading, refetch } = useBranchAnalytics(branch.id);
  const [refreshing, setRefreshing] = React.useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  const shortName = getShortBranchName(branch.name);
  const report = branch.report;
  const isSubmitted = branch.status === 'SUBMITTED';
  const targetAchievement = report?.target_achievement || 0;
  const hasIssues = report?.issues && report.issues.trim().length > 0;

  const getTimeOfDayGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Morning';
    if (hour < 17) return 'Afternoon';
    return 'Evening';
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Branch Hero Header */}
          <View style={styles.heroSection}>
            <View style={styles.heroIcon}>
              <Text style={styles.heroIconText}>🏬</Text>
            </View>
            <Text style={styles.heroName}>{shortName}</Text>
            <Text style={styles.heroCode}>{branch.code} · Swarna Mahal</Text>
            <View style={[
              styles.heroBadge,
              isSubmitted ? styles.heroBadgeSubmitted : styles.heroBadgePending
            ]}>
              <View style={[styles.heroBadgeDot, { backgroundColor: isSubmitted ? COLORS.success : COLORS.warning }]} />
              <Text style={[styles.heroBadgeText, { color: isSubmitted ? COLORS.success : COLORS.warning }]}>
                {isSubmitted ? 'Report Submitted' : 'Awaiting Submission'}
              </Text>
            </View>
          </View>

          {/* Today's Sales */}
          {isSubmitted && report ? (
            <>
              <SectionCard title="TODAY'S SALES">
                <Text style={styles.bigSalesNumber}>
                  ₹{((report.sales_amount || 0) / 100000).toFixed(2)}
                  <Text style={styles.bigSalesUnit}> L</Text>
                </Text>
                <Text style={styles.sectionNote}>
                  Monthly target: ₹{((branch.monthly_sales_target || 0) / 100000).toFixed(2)}L
                </Text>
              </SectionCard>

              {/* Target Achievement */}
              <SectionCard title="TARGET ACHIEVEMENT">
                <View style={styles.targetRow}>
                  <Text style={[styles.targetPercent, {
                    color: targetAchievement >= 100 ? COLORS.success :
                      targetAchievement >= 70 ? COLORS.primary : COLORS.warning
                  }]}>
                    {targetAchievement.toFixed(1)}%
                  </Text>
                  <Text style={styles.targetLabel}>
                    {targetAchievement >= 100 ? '🎯 Target Achieved' :
                      targetAchievement >= 70 ? '📈 On Track' : '⚠️ Below Target'}
                  </Text>
                </View>
                <ProgressBar
                  percent={targetAchievement}
                  color={
                    targetAchievement >= 100 ? COLORS.success :
                      targetAchievement >= 70 ? COLORS.primary : COLORS.warning
                  }
                />
              </SectionCard>

              {/* Attendance */}
              <SectionCard title="ATTENDANCE">
                <MetricRow
                  label="Staff Present"
                  value={String(report.attendance_count || 0)}
                />
                {report.inventory_status && (
                  <MetricRow
                    label="Inventory Status"
                    value={report.inventory_status}
                  />
                )}
              </SectionCard>

              {/* Operational Issues */}
              {hasIssues && (
                <SectionCard title="OPERATIONAL ISSUES">
                  <View style={styles.alertBox}>
                    <Text style={styles.alertText}>⚠️ {report.issues}</Text>
                  </View>
                </SectionCard>
              )}

              {/* Manager Remarks */}
              {report.remarks && report.remarks.trim().length > 0 && (
                <SectionCard title="MANAGER REMARKS">
                  <Text style={styles.remarksText}>"{report.remarks}"</Text>
                </SectionCard>
              )}

              {/* Analytics Summary (from analytics endpoint) */}
              {isLoading ? (
                <View style={styles.analyticsLoading}>
                  <ActivityIndicator color={COLORS.primary} size="small" />
                  <Text style={styles.analyticsLoadingText}>Loading analytics...</Text>
                </View>
              ) : analytics && (
                <SectionCard title="30-DAY SUMMARY">
                  <MetricRow
                    label="Total Sales"
                    value={`₹${((analytics.summary.total_sales || 0) / 100000).toFixed(2)}L`}
                  />
                  <MetricRow
                    label="Reports Submitted"
                    value={String(analytics.summary.reports_count || 0)}
                  />
                  <MetricRow
                    label="Avg. Achievement"
                    value={`${(analytics.summary.average_target_achievement || 0).toFixed(1)}%`}
                    valueColor={COLORS.primary}
                  />
                  <MetricRow
                    label="Avg. Attendance"
                    value={`${Math.round(analytics.summary.average_attendance || 0)} staff/day`}
                  />
                  {analytics.summary.issues_count > 0 && (
                    <MetricRow
                      label="Issues Reported"
                      value={String(analytics.summary.issues_count)}
                      valueColor={COLORS.error}
                    />
                  )}
                </SectionCard>
              )}
            </>
          ) : (
            <View style={styles.pendingState}>
              <Text style={styles.pendingStateIcon}>📋</Text>
              <Text style={styles.pendingStateTitle}>Report Not Yet Submitted</Text>
              <Text style={styles.pendingStateDesc}>
                The branch manager has not submitted today's operational report yet.
                Check back after submission.
              </Text>
            </View>
          )}

          {/* AI Summary placeholder */}
          <View style={styles.aiCard}>
            <Text style={styles.aiCardTitle}>✨ AI Summary</Text>
            <Text style={styles.aiCardDesc}>
              Ask the AI Copilot for a contextual summary and insights about {shortName} branch.
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 8,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroIconText: {
    fontSize: 32,
  },
  heroName: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  heroCode: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
    gap: 6,
  },
  heroBadgeSubmitted: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  heroBadgePending: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  heroBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 2,
    marginBottom: 14,
  },
  bigSalesNumber: {
    fontSize: 38,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  bigSalesUnit: {
    fontSize: 20,
    fontWeight: '400',
    color: COLORS.textSecondary,
  },
  sectionNote: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  targetPercent: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  targetLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flexShrink: 1,
    lineHeight: 18,
  },
  progressTrack: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  metricLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  alertBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    padding: 14,
  },
  alertText: {
    color: COLORS.error,
    fontSize: 14,
    lineHeight: 20,
  },
  remarksText: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  analyticsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  analyticsLoadingText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  pendingState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  pendingStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  pendingStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  pendingStateDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  aiCard: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primary + '33',
    padding: 18,
    marginTop: 4,
    marginBottom: 8,
  },
  aiCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 6,
  },
  aiCardDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
});
