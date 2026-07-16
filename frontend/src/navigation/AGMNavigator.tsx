import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import AGMDashboardScreen from '../screens/agm/AGMDashboardScreen';
import AICopilotScreen from '../screens/agm/AICopilotScreen';
import { COLORS } from '../theme/colors';

// Simple mock/stub for BranchDetail to prevent navigation errors
import { View, Text, StyleSheet } from 'react-native';
function BranchDetailStub() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Branch Metrics Detail Panel</Text>
      <Text style={styles.sub}>Analytics and sales charts are visible here.</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  text: { color: COLORS.primary, fontSize: 18, fontWeight: '700' },
  sub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4 }
});

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
        headerTintColor: COLORS.text,
        headerTitleStyle: {
          fontWeight: '700',
        },
        cardStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen
        name="AGMDashboard"
        component={AGMDashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AICopilot"
        component={AICopilotScreen}
        options={{ title: 'AI Copilot' }}
      />
      <Stack.Screen
        name="BranchDetail"
        component={BranchDetailStub}
        options={{ title: 'Branch Details' }}
      />
    </Stack.Navigator>
  );
}
