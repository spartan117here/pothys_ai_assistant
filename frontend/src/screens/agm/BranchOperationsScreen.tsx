import React, { useEffect, useRef } from 'react';
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
import { COLORS } from '../../theme/colors';
import { getShortBranchName } from '../../utils/branchHelper';

export default function BranchOperationsScreen({ navigation }: any) {
  const { data: branches, isLoading, refetch } = useBranchesDashboard();
  const [refreshing, setRefreshing] = React.useState(false);

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

  const submittedCount = branches?.filter(b => b.status === 'SUBMITTED').length || 0;
  const pendingCount = branches?.filter(b => b.status === 'PENDING').length || 0;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Summary strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{branches?.length || 0}</Text>
          <Text style={styles.summaryLabel}>TOTAL</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: COLORS.success }]}>{submittedCount}</Text>
          <Text style={styles.summaryLabel}>SUBMITTED</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: COLORS.warning }]}>{pendingCount}</Text>
          <Text style={styles.summaryLabel}>PENDING</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={styles.loadingText}>Loading branch data...</Text>
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
                  style={[styles.branchCard, isSubmitted && styles.branchCardSubmitted]}
                  onPress={() => navigation.navigate('BranchDetail', { branch })}
                  activeOpacity={0.85}
                >
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleGroup}>
                      <Text style={styles.branchName}>{shortName}</Text>
                      <Text style={styles.branchCode}>{branch.code}</Text>
                    </View>
                    <View style={[styles.statusBadge, isSubmitted ? styles.statusSubmitted : styles.statusPending]}>
                      <View style={[styles.statusDot, { backgroundColor: isSubmitted ? COLORS.success : COLORS.warning }]} />
                      <Text style={[styles.statusText, { color: isSubmitted ? COLORS.success : COLORS.warning }]}>
                        {isSubmitted ? 'SUBMITTED' : 'PENDING'}
                      </Text>
                    </View>
                  </View>

                  {/* Metrics Row */}
                  {isSubmitted && branch.report ? (
                    <View style={styles.metricsRow}>
                      <View style={styles.metric}>
                        <Text style={styles.metricValue}>
                          ₹{((branch.report.sales_amount || 0) / 100000).toFixed(2)}L
                        </Text>
                        <Text style={styles.metricLabel}>Sales</Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metric}>
                        <Text style={[styles.metricValue, { color: COLORS.primary }]}>
                          {salesPercent}%
                        </Text>
                        <Text style={styles.metricLabel}>Target</Text>
                      </View>
                      <View style={styles.metricDivider} />
                      <View style={styles.metric}>
                        <Text style={styles.metricValue}>
                          {branch.report.attendance_count || 0}
                        </Text>
                        <Text style={styles.metricLabel}>Staff</Text>
                      </View>
                      {hasIssues && (
                        <>
                          <View style={styles.metricDivider} />
                          <View style={styles.metric}>
                            <Text style={[styles.metricValue, { color: COLORS.error }]}>⚠</Text>
                            <Text style={[styles.metricLabel, { color: COLORS.error }]}>Alert</Text>
                          </View>
                        </>
                      )}
                    </View>
                  ) : (
                    <View style={styles.pendingRow}>
                      <Text style={styles.pendingMsg}>Awaiting today's report submission</Text>
                    </View>
                  )}

                  {/* Progress bar for submitted */}
                  {isSubmitted && salesPercent && (
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          { width: `${Math.min(100, Number(salesPercent))}%` as any },
                        ]}
                      />
                    </View>
                  )}

                  {/* Arrow */}
                  <Text style={styles.cardArrow}>›</Text>
                </TouchableOpacity>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.border,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 2,
    marginTop: 2,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    paddingTop: 80,
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: 12,
    fontSize: 14,
  },
  branchCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginBottom: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  branchCardSubmitted: {
    borderColor: '#1E2E1E',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitleGroup: {
    flex: 1,
  },
  branchName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  branchCode: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    letterSpacing: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  statusSubmitted: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  statusPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  metricLabel: {
    fontSize: 9,
    color: COLORS.textSecondary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  metricDivider: {
    width: 1,
    height: 26,
    backgroundColor: COLORS.border,
  },
  pendingRow: {
    paddingVertical: 8,
    marginBottom: 4,
  },
  pendingMsg: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  progressBarTrack: {
    height: 2,
    backgroundColor: COLORS.border,
    borderRadius: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBarFill: {
    height: 2,
    backgroundColor: COLORS.primary,
    borderRadius: 1,
  },
  cardArrow: {
    position: 'absolute',
    right: 14,
    top: '50%',
    fontSize: 22,
    color: COLORS.textMuted,
    fontWeight: '300',
  },
});
