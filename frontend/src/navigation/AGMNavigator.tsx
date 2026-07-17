import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import AGMDashboardScreen from '../screens/agm/AGMDashboardScreen';
import AICopilotScreen from '../screens/agm/AICopilotScreen';
import BranchOperationsScreen from '../screens/agm/BranchOperationsScreen';
import BranchDetailScreen from '../screens/agm/BranchDetailScreen';
import { COLORS } from '../theme/colors';

const Stack = createStackNavigator();

export default function AGMNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.surface,
          borderBottomWidth: 1,
          borderColor: COLORS.border,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: COLORS.primary,
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 16,
          color: COLORS.text,
        },
        headerBackTitleVisible: false,
        cardStyle: { flex: 1, backgroundColor: COLORS.background },
        // Smooth slide transition
        cardStyleInterpolator: ({ current, layouts }) => ({
          cardStyle: {
            transform: [
              {
                translateX: current.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [layouts.screen.width, 0],
                }),
              },
            ],
            opacity: current.progress.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0, 0.8, 1],
            }),
          },
        }),
      }}
    >
      <Stack.Screen
        name="AGMDashboard"
        component={AGMDashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BranchOperations"
        component={BranchOperationsScreen}
        options={{
          title: 'Branch Operations',
          headerLeft: ({ onPress }) => (
            <TouchableOpacity onPress={onPress} style={styles.backBtn}>
              <Text style={styles.backBtnText}>‹</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen
        name="BranchDetail"
        component={BranchDetailScreen}
        options={({ route }: any) => ({
          title: route.params?.branch
            ? route.params.branch.name.replace(/Swarna\s+Mahal/i, '').trim()
            : 'Branch Detail',
          headerLeft: ({ onPress }) => (
            <TouchableOpacity onPress={onPress} style={styles.backBtn}>
              <Text style={styles.backBtnText}>‹</Text>
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen
        name="AICopilot"
        component={AICopilotScreen}
        options={{
          title: 'AI Copilot',
          headerLeft: ({ onPress }) => (
            <TouchableOpacity onPress={onPress} style={styles.backBtn}>
              <Text style={styles.backBtnText}>‹</Text>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View style={styles.aiHeaderBadge}>
              <View style={styles.aiHeaderDot} />
              <Text style={styles.aiHeaderBadgeText}>RAG Mode</Text>
            </View>
          ),
        }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 4,
  },
  backBtnText: {
    fontSize: 28,
    color: COLORS.primary,
    fontWeight: '300',
    lineHeight: 32,
  },
  aiHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    backgroundColor: COLORS.primary + '18',
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  aiHeaderDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  aiHeaderBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 1,
  },
});
