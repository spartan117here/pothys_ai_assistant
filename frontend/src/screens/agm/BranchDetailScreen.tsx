import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Animated,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBranchAnalytics } from '../../hooks/useDashboard';
import { useThemeStore } from '../../store/themeStore';
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
  const { colors } = useThemeStore();
  return (
    <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      {children}
    </View>
  );
}

function MetricRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.metricRow, { borderColor: colors.border }]}>
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.text }, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

function ProgressBar({ percent, color }: { percent: number; color?: string }) {
  const { colors } = useThemeStore();
  const animWidth = useRef(new Animated.Value(0)).current;
  const activeColor = color || colors.primary;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: Math.min(100, percent),
      duration: 800,
      delay: 300,
      useNativeDriver: false,
    }).start();
  }, [percent]);

  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
      <Animated.View
        style={[
          styles.progressFill,
          {
            backgroundColor: activeColor,
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

export default function BranchDetailScreen({ navigation, route }: any) {
  const { branch } = route.params;
  const { data: analyticsData, isLoading, refetch } = useBranchAnalytics(branch.id);
  const analytics = analyticsData as any;
  const { colors, theme } = useThemeStore();
  const [refreshing, setRefreshing] = React.useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const safeToFixed = (val: any, precision: number = 1): string => {
    const num = Number(val);
    return isNaN(num) ? '0.0' : num.toFixed(precision);
  };

  const shortName = getShortBranchName(branch.name);
  const report = branch.report as any;
  const isSubmitted = branch.status === 'SUBMITTED';
  const targetAchievement = Number(report?.target_achievement || 0);
  const hasIssues = report?.issues && report.issues.trim().length > 0;

  // Additional template metrics
  const goldSales = report?.gold_sales || 0;
  const silverSales = report?.silver_sales || 0;
  const platinumSales = report?.platinum_sales || 0;
  const diamondSales = report?.diamond_sales || 0;
  const totalRevenue = report?.total_revenue || report?.sales_amount || 0;
  
  const digiGoldCount = report?.digigold_enrollments || 0;
  const digiSilverCount = report?.digisilver_enrollments || 0;
  
  const empPresent = report?.employees_present || report?.attendance_count || 0;
  const empAbsent = report?.employees_absent || 0;
  const complaintsText = report?.customer_complaints || "None";
  const opsIssuesText = report?.operational_issues || "None";

  // Extracted employee details from analytics payload
  const empPerformances = analytics?.today_report_details?.employee_performances || [];
  const topPerformer = analytics?.today_report_details?.top_performer || "N/A";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      {/* Back navigation header */}
      <View style={[styles.customHeader, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity style={styles.backHeaderBtn} onPress={() => navigation.goBack()}>
          <Text style={[styles.backHeaderArrow, { color: colors.primary }]}>‹</Text>
          <Text style={[styles.backHeaderText, { color: colors.text }]}>Branch Operations</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Branch Hero Header */}
          <View style={styles.heroSection}>
            <View style={[styles.heroIcon, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Text style={styles.heroIconText}>🏬</Text>
            </View>
            <Text style={[styles.heroName, { color: colors.text }]}>{shortName}</Text>
            <Text style={[styles.heroCode, { color: colors.textSecondary }]}>{branch.code} · Swarna Mahal</Text>
            <View style={[
              styles.heroBadge,
              isSubmitted ? 
                { backgroundColor: colors.success + '18', borderColor: colors.success + '40', borderWidth: 1 } : 
                { backgroundColor: colors.warning + '18', borderColor: colors.warning + '40', borderWidth: 1 }
            ]}>
              <View style={[styles.heroBadgeDot, { backgroundColor: isSubmitted ? colors.success : colors.warning }]} />
              <Text style={[styles.heroBadgeText, { color: isSubmitted ? colors.success : colors.warning }]}>
                {isSubmitted ? 'Report Submitted' : 'Awaiting Submission'}
              </Text>
            </View>
          </View>

          {/* Today's Sales */}
          {isSubmitted && report ? (
            <>
              {/* Branch Summary Metrics */}
              <SectionCard title="BRANCH SUMMARY">
                <View style={styles.summaryTopRow}>
                  <View>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>TOTAL REVENUE</Text>
                    <Text style={[styles.bigSalesNumber, { color: colors.text }]}>
                      ₹{(totalRevenue / 100000).toFixed(2)}
                      <Text style={[styles.bigSalesUnit, { color: colors.textSecondary }]}> L</Text>
                    </Text>
                  </View>
                  <View style={styles.targetStatusBadge}>
                    <Text style={[styles.targetPercentText, {
                      color: targetAchievement >= 100 ? colors.success :
                        targetAchievement >= 70 ? colors.primary : colors.warning
                    }]}>
                      {safeToFixed(targetAchievement, 1)}% Achieved
                    </Text>
                  </View>
                </View>

                <View style={styles.progressRow}>
                  <ProgressBar
                    percent={targetAchievement}
                    color={
                      targetAchievement >= 100 ? colors.success :
                        targetAchievement >= 70 ? colors.primary : colors.warning
                    }
                  />
                </View>

                {/* Sales Breakdown by Category */}
                <Text style={[styles.subSectionTitle, { color: colors.primary, marginTop: 16 }]}>SALES BREAKDOWN</Text>
                <MetricRow
                  label="Gold Sales"
                  value={`₹${(goldSales / 100000).toFixed(2)}L`}
                />
                <MetricRow
                  label="Silver Sales"
                  value={`₹${(silverSales / 100000).toFixed(2)}L`}
                />
                <MetricRow
                  label="Platinum Sales"
                  value={`₹${(platinumSales / 100000).toFixed(2)}L`}
                />
                <MetricRow
                  label="Diamond Sales"
                  value={`₹${(diamondSales / 100000).toFixed(2)}L`}
                />
              </SectionCard>

              {/* Digital Scheme Enrollments */}
              <SectionCard title="DIGITAL SCHEMES">
                <MetricRow
                  label="DigiGold Enrollments"
                  value={String(digiGoldCount)}
                  valueColor={colors.primary}
                />
                <MetricRow
                  label="DigiSilver Enrollments"
                  value={String(digiSilverCount)}
                  valueColor={colors.textSecondary}
                />
              </SectionCard>

              {/* Attendance & HR */}
              <SectionCard title="ATTENDANCE">
                <MetricRow
                  label="Employees Present"
                  value={String(empPresent)}
                  valueColor={colors.success}
                />
                <MetricRow
                  label="Employees Absent"
                  value={String(empAbsent)}
                  valueColor={empAbsent > 0 ? colors.error : colors.textMuted}
                />
              </SectionCard>

              {/* Customer Complaints & Operations */}
              <SectionCard title="OPERATIONAL AUDIT">
                <View style={styles.auditColumn}>
                  <Text style={[styles.auditLabel, { color: colors.textSecondary }]}>Customer Complaints</Text>
                  <Text style={[styles.auditText, { color: complaintsText !== "None" ? colors.warning : colors.text }]}>
                    {complaintsText}
                  </Text>
                </View>
                <View style={[styles.auditColumn, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 12, paddingTop: 12 }]}>
                  <Text style={[styles.auditLabel, { color: colors.textSecondary }]}>Operational Issues</Text>
                  <Text style={[styles.auditText, { color: opsIssuesText !== "None" ? colors.error : colors.text }]}>
                    {opsIssuesText}
                  </Text>
                </View>
              </SectionCard>

              {/* Manager Remarks */}
              {report.remarks && report.remarks.trim().length > 0 && (
                <SectionCard title="MANAGER REMARKS">
                  <Text style={[styles.remarksText, { color: colors.text }]}>"{report.remarks}"</Text>
                </SectionCard>
              )}

              {/* Top Performer Banner */}
              <View style={[styles.topPerformerCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.primary + '60', borderWidth: 1.5 }]}>
                <Text style={styles.topPerformerIcon}>👑</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.topPerformerLabel, { color: colors.primary }]}>TOP PERFORMING EXECUTIVE</Text>
                  <Text style={[styles.topPerformerValue, { color: colors.text }]}>{topPerformer}</Text>
                </View>
              </View>

              {/* Employee Performance Table */}
              {empPerformances.length > 0 && (
                <SectionCard title="EMPLOYEE PERFORMANCE LEDGER">
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableColName, { color: colors.textSecondary, flex: 2 }]}>Employee</Text>
                    <Text style={[styles.tableColName, { color: colors.textSecondary, flex: 1.5, textAlign: 'right' }]}>Sales</Text>
                    <Text style={[styles.tableColName, { color: colors.textSecondary, flex: 1, textAlign: 'right' }]}>Schemes</Text>
                  </View>
                  {empPerformances.map((emp: any, idx: number) => {
                    const totalSales = emp.gold_amount + emp.silver_amount + emp.platinum_amount + emp.diamond_amount;
                    const totalSchemes = emp.digigold + emp.digisilver;
                    return (
                      <View key={idx} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                        <View style={{ flex: 2 }}>
                          <Text style={[styles.empTableName, { color: colors.text }]}>{emp.employee_name}</Text>
                          <Text style={[styles.empTableDesc, { color: colors.textMuted }]}>{emp.designation}</Text>
                        </View>
                        <Text style={[styles.empTableSales, { color: colors.text, flex: 1.5, textAlign: 'right' }]}>
                          ₹{(totalSales / 1000).toFixed(0)}k
                        </Text>
                        <Text style={[styles.empTableSchemes, { color: colors.primary, flex: 1, textAlign: 'right' }]}>
                          {totalSchemes}
                        </Text>
                      </View>
                    );
                  })}
                </SectionCard>
              )}

              {/* 30-Day Trend Summary */}
              {isLoading ? (
                <View style={styles.analyticsLoading}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={[styles.analyticsLoadingText, { color: colors.textSecondary }]}>Loading analytics...</Text>
                </View>
              ) : analytics && (
                <SectionCard title="30-DAY OPERATIONAL SUMMARY">
                  <MetricRow
                    label="Total Sales (30 Days)"
                    value={`₹${((analytics.summary.total_sales || 0) / 100000).toFixed(2)}L`}
                  />
                  <MetricRow
                    label="Reports Submitted"
                    value={String(analytics.summary.reports_count || 0)}
                  />
                  <MetricRow
                    label="Avg. Achievement Rate"
                    value={`${safeToFixed(analytics.summary.average_target_achievement, 1)}%`}
                    valueColor={colors.primary}
                  />
                  <MetricRow
                    label="Avg. Daily Attendance"
                    value={`${Math.round(analytics.summary.average_attendance || 0)} staff`}
                  />
                  {analytics.summary.issues_count > 0 && (
                    <MetricRow
                      label="Issues Logged"
                      value={String(analytics.summary.issues_count)}
                      valueColor={colors.error}
                    />
                  )}
                </SectionCard>
              )}
            </>
          ) : (
            <View style={styles.pendingState}>
              <Text style={styles.pendingStateIcon}>📋</Text>
              <Text style={[styles.pendingStateTitle, { color: colors.text }]}>Report Not Yet Submitted</Text>
              <Text style={[styles.pendingStateDesc, { color: colors.textSecondary }]}>
                The branch manager has not submitted today's operational report yet.
                Check back after submission.
              </Text>
            </View>
          )}

          {/* AI Copilot Drilldown Button */}
          <TouchableOpacity
            style={[styles.aiCard, { backgroundColor: colors.surfaceAlt, borderColor: colors.primary + '33', borderWidth: 1 }]}
            onPress={() => navigation.navigate('AICopilot')}
            activeOpacity={0.8}
          >
            <View style={styles.aiHeaderRow}>
              <Text style={[styles.aiCardTitle, { color: colors.primary }]}>✨ Ask Branch AI Assistant</Text>
              <Text style={styles.aiArrow}>→</Text>
            </View>
            <Text style={[styles.aiCardDesc, { color: colors.textSecondary }]}>
              Analyze performance gaps, target achievements, or employee sales trends for {shortName} using the copilot.
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  customHeader: {
    height: 56,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  backHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backHeaderArrow: {
    fontSize: 28,
    lineHeight: 28,
    fontWeight: '300',
  },
  backHeaderText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 60,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 12,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroIconText: {
    fontSize: 36,
  },
  heroName: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroCode: {
    fontSize: 14,
    marginTop: 4,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 14,
    gap: 8,
  },
  heroBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 16,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  targetStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  targetPercentText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressRow: {
    marginTop: 14,
    marginBottom: 12,
  },
  subSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  bigSalesNumber: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  bigSalesUnit: {
    fontSize: 22,
    fontWeight: '400',
  },
  sectionNote: {
    fontSize: 14,
    marginTop: 6,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  targetPercent: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  targetLabel: {
    fontSize: 14,
    flexShrink: 1,
    lineHeight: 20,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  metricLabel: {
    fontSize: 14,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  auditColumn: {
    flexDirection: 'column',
    gap: 4,
  },
  auditLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  auditText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  alertBox: {
    borderRadius: 12,
    padding: 16,
  },
  alertText: {
    fontSize: 15,
    lineHeight: 22,
  },
  remarksText: {
    fontSize: 15,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  topPerformerCard: {
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  topPerformerIcon: {
    fontSize: 32,
  },
  topPerformerLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  topPerformerValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    marginBottom: 8,
  },
  tableColName: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    alignItems: 'center',
  },
  empTableName: {
    fontSize: 14,
    fontWeight: '700',
  },
  empTableDesc: {
    fontSize: 12,
  },
  empTableSales: {
    fontSize: 14,
    fontWeight: '600',
  },
  empTableSchemes: {
    fontSize: 14,
    fontWeight: '700',
  },
  analyticsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  analyticsLoadingText: {
    fontSize: 14,
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
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  pendingStateDesc: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  aiCard: {
    borderRadius: 20,
    padding: 22,
    marginTop: 6,
    marginBottom: 12,
  },
  aiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  aiArrow: {
    fontSize: 20,
    fontWeight: '700',
  },
  aiCardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  aiCardDesc: {
    fontSize: 14,
    lineHeight: 22,
  },
});
