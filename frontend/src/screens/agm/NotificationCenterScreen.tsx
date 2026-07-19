import React, { useMemo, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, NotificationItem } from '../../hooks/useNotifications';
import { useBranchesDashboard } from '../../hooks/useDashboard';
import { useThemeStore } from '../../store/themeStore';

type FilterType = 'ALL' | 'ACTION_REQUIRED' | 'UPDATES';
type GroupLabel = 'Today' | 'Yesterday' | 'Earlier';

function getGroupLabel(dateStr: string): GroupLabel {
  const now = new Date();
  const created = new Date(dateStr);

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);

  if (created >= todayStart) return 'Today';
  if (created >= yesterdayStart) return 'Yesterday';
  return 'Earlier';
}

function formatNotificationTime(dateStr: string): string {
  const dateObj = new Date(dateStr);
  
  let hours = dateObj.getHours();
  const minutes = dateObj.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minStr = minutes < 10 ? '0' + minutes : minutes;
  const timeStr = `${hours}:${minStr} ${ampm}`;
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  
  if (dateObj >= todayStart) {
    return `Today • ${timeStr}`;
  } else if (dateObj >= yesterdayStart) {
    return `Yesterday • ${timeStr}`;
  } else {
    const day = dateObj.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[dateObj.getMonth()];
    return `${day} ${month} • ${timeStr}`;
  }
}

export default function NotificationCenterScreen({ navigation }: any) {
  const { colors } = useThemeStore();
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [refreshing, setRefreshing] = useState(false);

  const { data: notifications, isLoading, refetch } = useNotifications();
  const { data: branches } = useBranchesDashboard();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Map types to Colors, Icons & Category
  const getThemeDetails = (type: string) => {
    switch (type) {
      // Action Required
      case 'Report Pending':
        return {
          color: colors.warning,
          bgColor: colors.warningBg || 'rgba(245, 158, 11, 0.1)',
          icon: '⏳',
          category: 'ACTION_REQUIRED',
        };
      case 'Operational Issue':
      case 'Operational Issues':
        return {
          color: colors.error,
          bgColor: colors.errorBg || 'rgba(239, 68, 68, 0.1)',
          icon: '🚨',
          category: 'ACTION_REQUIRED',
        };
      case 'Customer Complaint':
      case 'Customer Complaints':
        return {
          color: colors.error,
          bgColor: colors.errorBg || 'rgba(239, 68, 68, 0.1)',
          icon: '👤',
          category: 'ACTION_REQUIRED',
        };
      case 'Attendance Alert':
      case 'Attendance Alerts':
        return {
          color: colors.warning,
          bgColor: colors.warningBg || 'rgba(245, 158, 11, 0.1)',
          icon: '📊',
          category: 'ACTION_REQUIRED',
        };
      case 'Target Below Threshold':
        return {
          color: colors.error,
          bgColor: colors.errorBg || 'rgba(239, 68, 68, 0.1)',
          icon: '📉',
          category: 'ACTION_REQUIRED',
        };

      // Updates
      case 'Report Submitted':
        return {
          color: colors.success,
          bgColor: colors.successBg || 'rgba(16, 185, 129, 0.1)',
          icon: '✅',
          category: 'UPDATES',
        };
      case 'Highest Performing Branch':
        return {
          color: colors.success,
          bgColor: colors.successBg || 'rgba(16, 185, 129, 0.1)',
          icon: '🏆',
          category: 'UPDATES',
        };
      case 'Highest Performing Executive':
        return {
          color: colors.success,
          bgColor: colors.successBg || 'rgba(16, 185, 129, 0.1)',
          icon: '🏅',
          category: 'UPDATES',
        };
      case 'AI Insights':
      case 'AI Recommendation':
      case 'AI RAG Insight':
      default:
        return {
          color: colors.info,
          bgColor: colors.infoBg || 'rgba(59, 130, 246, 0.1)',
          icon: '💡',
          category: 'UPDATES',
        };
    }
  };

  // Filter and sort notifications (newest first)
  const filteredNotifications = useMemo(() => {
    if (!notifications) return [];
    
    const sorted = [...notifications].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    if (activeFilter === 'ALL') return sorted;
    return sorted.filter(n => {
      const details = getThemeDetails(n.type);
      return details.category === activeFilter;
    });
  }, [notifications, activeFilter]);

  // Group notifications into Today, Yesterday, Earlier
  const groupedNotifications = useMemo(() => {
    const groups: { Today: NotificationItem[]; Yesterday: NotificationItem[]; Earlier: NotificationItem[] } = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };
    filteredNotifications.forEach(n => {
      const group = getGroupLabel(n.created_at);
      groups[group].push(n);
    });
    return groups;
  }, [filteredNotifications]);

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  const handleMarkAllRead = useCallback(() => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        Alert.alert('Success', 'All notifications marked as read.');
      },
    });
  }, [markAllRead]);

  const handleNotificationPress = useCallback((notification: NotificationItem) => {
    // Mark as read in DB
    if (!notification.is_read) {
      markRead.mutate(notification.id);
    }

    // Navigate based on notification type
    switch (notification.type) {
      case 'Operational Issue': {
        // Find the matching branch from the branches list to pass as nav param
        if (notification.branch_id && branches) {
          const branch = branches.find(b => b.id === notification.branch_id);
          if (branch) {
            navigation.navigate('BranchDetail', { branch });
            return;
          }
        }
        // Fallback: go to BranchOperations
        navigation.navigate('BranchOperations');
        return;
      }
      case 'Report Pending': {
        navigation.navigate('BranchOperations');
        return;
      }
      case 'Highest Performing Executive': {
        navigation.navigate('BranchOperations');
        return;
      }
      default: {
        // For all other types, show detail alert
        Alert.alert(
          notification.title,
          `${notification.message}\n\nType: ${notification.type}`,
          [{ text: 'OK' }]
        );
      }
    }
  }, [markRead, branches, navigation]);

  if (isLoading && !refreshing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading notifications...</Text>
      </View>
    );
  }

  const renderGroup = (title: string, list: NotificationItem[]) => {
    if (list.length === 0) return null;
    return (
      <View style={styles.groupContainer}>
        <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>{title}</Text>
        {list.map(item => {
          const isRead = item.is_read;
          const details = getThemeDetails(item.type);
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderLeftColor: details.color,
                },
                !isRead && styles.unreadCard,
              ]}
              onPress={() => handleNotificationPress(item)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrapper, { backgroundColor: details.bgColor }]}>
                <Text style={styles.icon}>{details.icon}</Text>
              </View>
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <Text
                    style={[
                      styles.cardTitle,
                      { color: colors.text },
                      !isRead && styles.unreadTitleText,
                    ]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  {!isRead && <View style={[styles.unreadDot, { backgroundColor: details.color }]} />}
                </View>
                <Text style={[styles.cardMessage, { color: colors.textSecondary }]} numberOfLines={2}>
                  {item.message}
                </Text>
                <Text style={[styles.cardTime, { color: colors.textMuted }]}>
                  {formatNotificationTime(item.created_at)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const tabs: { label: string; value: FilterType; color: string }[] = [
    { label: 'All', value: 'ALL', color: colors.primary },
    { label: 'Action Required', value: 'ACTION_REQUIRED', color: colors.error },
    { label: 'Updates', value: 'UPDATES', color: colors.success },
  ];

  const isEmpty =
    groupedNotifications.Today.length === 0 &&
    groupedNotifications.Yesterday.length === 0 &&
    groupedNotifications.Earlier.length === 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      {/* Action Header Strip */}
      <View style={[styles.actionHeader, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.unreadStatusText, { color: colors.textSecondary }]}>
          {unreadCount === 0 ? 'No unread notifications' : `${unreadCount} unread notification(s)`}
        </Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={[styles.markReadBtn, { borderColor: colors.primary }]}
            onPress={handleMarkAllRead}
            activeOpacity={0.7}
          >
            <Text style={[styles.markReadText, { color: colors.primary }]}>Mark all as read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs Filter Bar */}
      <View style={[styles.tabsWrapper, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {tabs.map(tab => {
            const isActive = activeFilter === tab.value;
            return (
              <TouchableOpacity
                key={tab.value}
                style={[
                  styles.tabButton,
                  { borderColor: colors.border },
                  isActive && {
                    backgroundColor: tab.color + '15',
                    borderColor: tab.color,
                  },
                ]}
                onPress={() => setActiveFilter(tab.value)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { color: colors.textSecondary },
                    isActive && { color: tab.color, fontWeight: '700' },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Notification List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {isEmpty ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No notifications found in this category.
            </Text>
          </View>
        ) : (
          <>
            {renderGroup('Today', groupedNotifications.Today)}
            {renderGroup('Yesterday', groupedNotifications.Yesterday)}
            {renderGroup('Earlier', groupedNotifications.Earlier)}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
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
    fontWeight: '600',
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  unreadStatusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  markReadBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  markReadText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabsWrapper: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  tabsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabButton: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  groupContainer: {
    marginBottom: 20,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 10,
  },
  unreadCard: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 18,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  unreadTitleText: {
    fontWeight: '800',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  cardMessage: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  cardTime: {
    fontSize: 11,
    fontWeight: '500',
    alignSelf: 'flex-start',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
