import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBranchesDashboard } from '../../hooks/useDashboard';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../theme/colors';

export default function AGMDashboardScreen({ navigation }: any) {
  const { user, logout } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  
  // Fetch branches live status for today
  const { data: branches, isLoading, error, refetch } = useBranchesDashboard();

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.loadingText}>Loading Executive Console...</Text>
      </View>
    );
  }

  // Calculate aggregated stats
  const totalSales = branches?.reduce((sum, b) => sum + (b.report?.sales_amount || 0), 0) || 0;
  const submittedCount = branches?.filter(b => b.status === 'SUBMITTED').length || 0;
  const pendingCount = branches?.filter(b => b.status === 'PENDING').length || 0;
  const targetTotal = branches?.reduce((sum, b) => sum + b.monthly_sales_target, 0) || 1;
  const targetProgress = ((totalSales / (targetTotal / 30)) * 100).toFixed(1); // daily target ratio

  // Gather active branch issues
  const activeAlerts = branches?.filter(b => b.report?.issues && b.report.issues.trim().length > 0) || [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome Back,</Text>
          <Text style={styles.profileName}>{user?.full_name || 'AGM Executive'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
      >
        {/* KPI Grid */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TODAY'S TOTAL SALES</Text>
            <Text style={styles.kpiValue}>₹{(totalSales / 100000).toFixed(2)}L</Text>
            <Text style={styles.kpiSub}>Across all branches</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TARGET ACHIEVEMENT</Text>
            <Text style={styles.kpiValue}>{targetProgress}%</Text>
            <Text style={styles.kpiSub}>Of expected daily run-rate</Text>
          </View>
        </View>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>SUBMISSIONS</Text>
            <Text style={[styles.kpiValue, { color: COLORS.success }]}>{submittedCount} / 8</Text>
            <Text style={styles.kpiSub}>{pendingCount} reports pending</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>OPERATIONAL ALERTS</Text>
            <Text style={[styles.kpiValue, { color: activeAlerts.length > 0 ? COLORS.error : COLORS.textSecondary }]}>
              {activeAlerts.length}
            </Text>
            <Text style={styles.kpiSub}>Issues requiring attention</Text>
          </View>
        </View>

        {/* Alert Banner if there are active issues */}
        {activeAlerts.length > 0 && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertBannerTitle}>CRITICAL OPERATIONAL ISSUES DETECTED</Text>
            {activeAlerts.slice(0, 2).map((alert, idx) => (
              <Text key={idx} style={styles.alertItem}>
                ⚠️ {alert.name}: {alert.report?.issues}
              </Text>
            ))}
          </View>
        )}

        {/* Quick Assistant Callout */}
        <TouchableOpacity 
          style={styles.copilotCard}
          onPress={() => navigation.navigate('AICopilot')}
        >
          <View style={styles.copilotContent}>
            <Text style={styles.copilotTitle}>Ask Pothys AGM Copilot</Text>
            <Text style={styles.copilotDesc}>
              "Compare sales performance between T. Nagar and Coimbatore yesterday"
            </Text>
          </View>
          <Text style={styles.copilotAction}>Ask AI →</Text>
        </TouchableOpacity>

        {/* Branch Submissions List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>BRANCH OPERATIONAL REAL-TIME STATUS</Text>
        </View>

        {branches?.map((branch) => (
          <TouchableOpacity
            key={branch.id}
            style={styles.branchRow}
            onPress={() => navigation.navigate('BranchDetail', { branchId: branch.id })}
          >
            <View style={styles.branchMain}>
              <Text style={styles.branchName}>{branch.name}</Text>
              <Text style={styles.branchCode}>{branch.code}</Text>
            </View>

            <View style={styles.branchMetrics}>
              {branch.status === 'SUBMITTED' ? (
                <View style={styles.statusSection}>
                  <Text style={styles.salesValue}>
                    ₹{((branch.report?.sales_amount || 0) / 1000).toFixed(0)}K
                  </Text>
                  <View style={styles.submittedBadge}>
                    <Text style={styles.submittedBadgeText}>SUBMITTED</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>PENDING</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  greeting: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoutText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 40,
  },
  kpiGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 6,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
  },
  kpiSub: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  alertBanner: {
    backgroundColor: COLORS.errorBg,
    borderWidth: 1,
    borderColor: COLORS.error,
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  alertBannerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.error,
    letterSpacing: 1,
    marginBottom: 8,
  },
  alertItem: {
    color: COLORS.text,
    fontSize: 13,
    marginBottom: 6,
  },
  copilotCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.primary,
    padding: 18,
    borderRadius: 12,
    marginBottom: 28,
  },
  copilotContent: {
    flex: 1,
    marginRight: 16,
  },
  copilotTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
  },
  copilotDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  copilotAction: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 2,
  },
  branchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  branchMain: {
    flex: 2,
  },
  branchName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  branchCode: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  branchMetrics: {
    flex: 1.5,
    alignItems: 'flex-end',
  },
  statusSection: {
    alignItems: 'flex-end',
  },
  salesValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  submittedBadge: {
    backgroundColor: COLORS.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  submittedBadgeText: {
    color: COLORS.success,
    fontSize: 10,
    fontWeight: '700',
  },
  pendingBadge: {
    backgroundColor: COLORS.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  pendingBadgeText: {
    color: COLORS.warning,
    fontSize: 10,
    fontWeight: '700',
  },
});
