import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from './src/screens/LoginScreen';
import ReorderScreen from './src/screens/ReorderScreen';
import HomeScreen from './src/screens/HomeScreen';

import { AuthProvider, useAuth } from './src/api/auth/AuthContext';
import {
  HeaderAccountButton,
  AccountMenuProvider,
  AccountMenuOverlay,
} from './src/components/AccountMenu';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Reorder: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/* ────────────────────────────────────────────────
   Public (ej inloggad)
──────────────────────────────────────────────── */
function PublicStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

/* ────────────────────────────────────────────────
   Private (inloggad)
──────────────────────────────────────────────── */
function PrivateStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerRight: () => <HeaderAccountButton />,
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Start' }}
      />
      <Stack.Screen
        name="Reorder"
        component={ReorderScreen}
        options={{ title: 'Beställningar' }}
      />
    </Stack.Navigator>
  );
}

/* ────────────────────────────────────────────────
   Switch mellan login / app
──────────────────────────────────────────────── */
function AppNavigator() {
  const { user } = useAuth();
  return user ? <PrivateStack /> : <PublicStack />;
}

/* ────────────────────────────────────────────────
   App root
──────────────────────────────────────────────── */
export default function App() {
  return (
    <AuthProvider>
      <AccountMenuProvider>
        <NavigationContainer>
          <AppNavigator />
          <AccountMenuOverlay />
        </NavigationContainer>
      </AccountMenuProvider>
    </AuthProvider>
  );
}