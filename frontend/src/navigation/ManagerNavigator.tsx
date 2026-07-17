import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../theme/colors';

function ManagerDashboardStub({ navigation }: any) {
  const { user, logout } = useAuthStore();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Branch Manager Dashboard</Text>
      <Text style={styles.sub}>Welcome back, {user?.full_name}</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardText}>Today's sales submission is required.</Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={() => navigation.navigate('UploadReport')}
        >
          <Text style={styles.btnText}>Submit Daily Report</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

function UploadReportStub({ navigation }: any) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Submit Daily Operational Metrics</Text>
      <Text style={styles.sub}>Enter sales, attendance, and attach raw files.</Text>
      <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
        <Text style={styles.btnText}>Save metrics</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background, padding: 24 },
  title: { color: COLORS.text, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  sub: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 32 },
  card: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, padding: 24, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 40 },
  cardText: { color: COLORS.text, fontSize: 15, marginBottom: 16 },
  button: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: COLORS.textOnPrimary, fontWeight: '700' },
  logout: { marginTop: 20 },
  logoutText: { color: COLORS.error, fontWeight: '600' }
});

const Stack = createStackNavigator();

export default function ManagerNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.surface,
          borderBottomWidth: 1,
          borderColor: COLORS.border,
        },
        headerTintColor: COLORS.text,
        cardStyle: { flex: 1, backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen
        name="ManagerDashboard"
        component={ManagerDashboardStub}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="UploadReport"
        component={UploadReportStub}
        options={{ title: 'Daily Report Upload' }}
      />
    </Stack.Navigator>
  );
}
