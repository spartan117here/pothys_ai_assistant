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
import { useThemeStore } from '../../store/themeStore';
import { getShortBranchName } from '../../utils/branchHelper';

export default function BranchOperationsScreen({ navigation }: any) {
  const { data: branches, isLoading, refetch } = useBranchesDashboard();
  const { colors } = useThemeStore();
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
                  </View>

                  {/* Metrics Row */}
                  {isSubmitted && branch.report ? (
                    <View style={styles.metricsRow}>
                      <View style={styles.metric}>
                        <Text style={[styles.metricValue, { color: colors.text }]}>
                          ₹{((branch.report.sales_amount || 0) / 100000).toFixed(2)}L
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
});
