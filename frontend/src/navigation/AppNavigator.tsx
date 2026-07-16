import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuthStore } from '../store/authStore';
import AuthNavigator from './AuthNavigator';
import AGMNavigator from './AGMNavigator';
import ManagerNavigator from './ManagerNavigator';
import ExecutiveSetupScreen from '../screens/auth/ExecutiveSetupScreen';
import { AuthErrorBoundary } from '../components/AuthErrorBoundary';
import { COLORS } from '../theme/colors';

const Stack = createStackNavigator();

export default function AppNavigator() {
  const { isAuthenticated, user, isLoading, hasAgm, checkAuthStatus } = useAuthStore();

  // Validate session status on startup
  useEffect(() => {
    checkAuthStatus();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.splashContainer}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.splashText}>Authenticating Secure Link...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <AuthErrorBoundary>
        {hasAgm === false ? (
          <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { flex: 1, backgroundColor: COLORS.background } }}>
            <Stack.Screen name="ExecutiveSetup" component={ExecutiveSetupScreen} />
          </Stack.Navigator>
        ) : !isAuthenticated ? (
          <AuthNavigator />
        ) : user?.role === 'AGM' ? (
          <AGMNavigator />
        ) : (
          <ManagerNavigator />
        )}
      </AuthErrorBoundary>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  splashText: {
    color: COLORS.primary,
    fontSize: 14,
    marginTop: 16,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
