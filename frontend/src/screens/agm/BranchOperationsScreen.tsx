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
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBranchesDashboard } from '../../hooks/useDashboard';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { getShortBranchName } from '../../utils/branchHelper';
import { formatIndianCurrency } from '../../utils/currencyFormatter';
import { useQueryClient } from '@tanstack/react-query';
import apiClient from '../../services/api';
import { downloadAndShareReport } from '../../utils/pdfDownloadHelper';

export default function BranchOperationsScreen({ navigation }: any) {
  const { data: branches, isLoading, refetch } = useBranchesDashboard();
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);
  
  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Staggered fade-in animations for branch cards
  const fadeAnims = useRef<Animated.Value[]>([]).current;
  const slideAnims = useRef<Animated.Value[]>([]).current;

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  useEffect(() => {
    if (branches && branches.length > 0) {
      // Initialize animation values
      while (fadeAnims.length < branches.length) {
        fadeAnims.push(new Animated.Value(0));
        slideAnims.push(new Animated.Value(30));
      }

      // Stagger animations
      const animations = branches.map((_, i) =>
        Animated.parallel([
          Animated.timing(fadeAnims[i], {
            toValue: 1,
            duration: 400,
            delay: i * 70,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnims[i], {
            toValue: 0,
            duration: 400,
            delay: i * 70,
            useNativeDriver: true,
          }),
        ])
      );
      Animated.stagger(70, animations).start();
    }
  }, [branches]);

  const confirmDeleteReport = () => {
    if (!selectedBranch?.report?.id) return;
    Alert.alert(
      "Delete Report",
      "Are you sure you want to permanently delete today's report for this branch?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: handleDeleteReport 
        }
      ]
    );
  };

  const handleDeleteReport = async () => {
    if (!selectedBranch?.report?.id) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/reports/${selectedBranch.report.id}`);
      Alert.alert("Success", "Report deleted successfully.");
      
      // Instantly refresh Branch Operations and Dashboard KPIs
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['branches-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.detail || "Failed to delete the report.";
      Alert.alert("Error", msg);
    } finally {
      setDeleting(false);
      setSelectedBranch(null);
    }
  };

  const submittedCount = branches?.filter(b => b.status === 'SUBMITTED').length || 0;
  const pendingCount = branches?.filter(b => b.status === 'PENDING').length || 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      {/* Summary strip */}
      <View style={[styles.summaryStrip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{branches?.length || 0}</Text>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>TOTAL</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.success }]}>{submittedCount}</Text>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>SUBMITTED</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.warning }]}>{pendingCount}</Text>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>PENDING</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading branch data...</Text>
          </View>
        ) : (
          branches?.map((branch, index) => {
            const shortName = getShortBranchName(branch.name);
            const salesPercent = branch.report
              ? Math.min(100, ((branch.report.target_achievement || 0))).toFixed(0)
              : null;
            const isSubmitted = branch.status === 'SUBMITTED';
            const hasIssues = branch.report?.issues && branch.report.issues.trim().length > 0;

            const fadeAnim = fadeAnims[index] || new Animated.Value(1);
            const slideAnim = slideAnims[index] || new Animated.Value(0);

            return (
              <Animated.View
                key={branch.id}
                style={{
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.branchCard, 
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    isSubmitted && { borderColor: colors.primary + '30' }
                  ]}
                  onPress={() => navigation.navigate('BranchDetail', { branch })}
                  activeOpacity={0.85}
                >
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleGroup}>
                      <Text style={[styles.branchName, { color: colors.text }]}>{shortName}</Text>
                      <Text style={[styles.branchCode, { color: colors.textSecondary }]}>{branch.code}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[
                        styles.statusBadge, 
                        isSubmitted ? 
                          { backgroundColor: colors.success + '18', borderColor: colors.success + '40', borderWidth: 1 } : 
                          { backgroundColor: colors.warning + '18', borderColor: colors.warning + '40', borderWidth: 1 }
                      ]}>
                        <View style={[styles.statusDot, { backgroundColor: isSubmitted ? colors.success : colors.warning }]} />
                        <Text style={[styles.statusText, { color: isSubmitted ? colors.success : colors.warning }]}>
                          {isSubmitted ? 'SUBMITTED' : 'PENDING'}
                        </Text>
                      </View>
                      
                      {/* 3-dot Menu Trigger */}
                      <TouchableOpacity 
                        style={styles.threeDotButton}
                        onPress={() => {
                          setSelectedBranch(branch);
                          setMenuVisible(true);
                        }}
                        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                      >
                        <Text style={[styles.threeDotText, { color: colors.textSecondary }]}>⋮</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Metrics Row */}
                  {isSubmitted && branch.report ? (
                    <View style={styles.metricsRow}>
                      <View style={styles.metric}>
                        <Text style={[styles.metricValue, { color: colors.text }]}>
                          {formatIndianCurrency(branch.report.sales_amount || 0)}
                        </Text>
                        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Sales</Text>
                      </View>
                      <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.metric}>
                        <Text style={[styles.metricValue, { color: colors.primary }]}>
                          {salesPercent}%
                        </Text>
                        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Target</Text>
                      </View>
                      <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.metric}>
                        <Text style={[styles.metricValue, { color: colors.text }]}>
                          {branch.report.attendance_count || 0}
                        </Text>
                        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Staff</Text>
                      </View>
                      {hasIssues && (
                        <>
                          <View style={[styles.metricDivider, { backgroundColor: colors.border }]} />
                          <View style={styles.metric}>
                            <Text style={[styles.metricValue, { color: colors.error }]}>⚠</Text>
                            <Text style={[styles.metricLabel, { color: colors.error }]}>Alert</Text>
                          </View>
                        </>
                      )}
                    </View>
                  ) : (
                    <View style={styles.pendingRow}>
                      <Text style={[styles.pendingMsg, { color: colors.textMuted }]}>Awaiting today's report submission</Text>
                    </View>
                  )}

                  {/* Progress bar for submitted */}
                  {isSubmitted && salesPercent && (
                    <View style={[styles.progressBarTrack, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.progressBarFill,
                          { 
                            backgroundColor: colors.primary,
                            width: `${Math.min(100, Number(salesPercent))}%` as any 
                          },
                        ]}
                      />
                    </View>
                  )}

                  {/* Arrow */}
                  <Text style={[styles.cardArrow, { color: colors.textMuted }]}>›</Text>
                </TouchableOpacity>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {/* Popup Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={[styles.menuDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.menuHeader, { color: colors.textSecondary }]}>
              {selectedBranch ? getShortBranchName(selectedBranch.name) : 'Branch Options'}
            </Text>
            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
            
            {selectedBranch?.status !== 'SUBMITTED' && (
              <Text style={[styles.noReportText, { color: colors.textMuted }]}>
                Awaiting report submission for today.
              </Text>
            )}

            {/* Download Report */}
            {selectedBranch?.status === 'SUBMITTED' && user?.role === 'AGM' && (
              <TouchableOpacity 
                style={styles.menuItem}
                onPress={async () => {
                  setMenuVisible(false);
                  if (!selectedBranch?.report?.id) return;
                  try {
                    const shortName = getShortBranchName(selectedBranch.name);
                    const todayStr = selectedBranch.report.date || new Date().toISOString().split('T')[0];
                    await downloadAndShareReport(selectedBranch.report.id, shortName, todayStr);
                  } catch (e: any) {
                    Alert.alert("Error", "Failed to download PDF.");
                  }
                }}
              >
                <Text style={styles.menuItemIcon}>📥</Text>
                <Text style={[styles.menuItemText, { color: colors.text }]}>Download Report</Text>
              </TouchableOpacity>
            )}

            {/* Delete Report */}
            {selectedBranch?.status === 'SUBMITTED' && user?.role === 'AGM' && (
              <TouchableOpacity 
                style={[styles.menuItem, styles.deleteMenuItem]}
                onPress={() => {
                  setMenuVisible(false);
                  confirmDeleteReport();
                }}
              >
                <Text style={[styles.menuItemIcon, { color: colors.error }]}>🗑</Text>
                <Text style={[styles.menuItemText, { color: colors.error }]}>Delete Report</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryStrip: {
    flexDirection: 'row',
    paddingVertical: 20,
    paddingHorizontal: 28,
    borderBottomWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    height: 32,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 4,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  loadingContainer: {
    paddingTop: 80,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
  },
  branchCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardTitleGroup: {
    flex: 1,
  },
  branchName: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  branchCode: {
    fontSize: 13,
    marginTop: 3,
    letterSpacing: 1.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 13,
    marginTop: 3,
    letterSpacing: 0.5,
  },
  metricDivider: {
    width: 1,
    height: 28,
  },
  pendingRow: {
    paddingVertical: 10,
    marginBottom: 6,
  },
  pendingMsg: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  progressBarTrack: {
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: 3,
    borderRadius: 1.5,
  },
  cardArrow: {
    position: 'absolute',
    right: 16,
    top: '50%',
    fontSize: 26,
    fontWeight: '300',
    marginTop: -16,
  },
  threeDotButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  threeDotText: {
    fontSize: 22,
    fontWeight: 'bold',
    lineHeight: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  menuDropdown: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  menuHeader: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  menuDivider: {
    height: 1,
    width: '100%',
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  menuItemIcon: {
    fontSize: 18,
    marginRight: 12,
    width: 24,
    textAlign: 'center',
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
  },
  deleteMenuItem: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(239, 68, 68, 0.2)',
  },
  noReportText: {
    paddingVertical: 12,
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
