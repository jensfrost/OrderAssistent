import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './src/i18n/i18n';
import i18n from './src/i18n/i18n';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ReorderScreen from './src/screens/ReorderScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import HelpScreen from './src/screens/HelpScreen';
import InstallAppScreen from './src/screens/InstallAppScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import UsersScreen from './src/screens/UsersScreen';

import { AuthProvider, useAuth } from './src/api/auth/AuthContext';
import {
  HeaderAccountButton,
  AccountMenuProvider,
  AccountMenuOverlay,
} from './src/components/AccountMenu';
import EnvRibbon from './src/components/EnvRibbon';

export type RootStackParamList = {
  Login: undefined;
  ResetPassword: { token?: string } | undefined;
  Home: undefined;
  Reorder: undefined;
  ChangePassword: undefined;
  Help: undefined;
  InstallApp: undefined;
  Users: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking = {
  config: {
    screens: {
      ResetPassword: 'reset',
    },
  },
};

function isResetPasswordUrl() {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  return path === 'reset';
}

function PublicStack() {
  return (
    <Stack.Navigator initialRouteName={isResetPasswordUrl() ? 'ResetPassword' : 'Login'}>
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={{ title: i18n.t('nav.resetPassword') || 'Återställ lösenord' }}
      />
    </Stack.Navigator>
  );
}

function PrivateStack() {
  const { can } = useAuth();

  return (
    <Stack.Navigator
      screenOptions={{
        headerRight: () => <HeaderAccountButton />,
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: i18n.t('mainMenu.title') || 'Start' }}
      />
      <Stack.Screen
        name="Reorder"
        component={ReorderScreen}
        options={{ title: i18n.t('mainMenu.reorderAssist') || 'Beställningar' }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ title: i18n.t('nav.changePassword') || 'Byt lösenord' }}
      />
      <Stack.Screen
        name="Help"
        component={HelpScreen}
        options={{ title: i18n.t('nav.help') || 'Hjälp' }}
      />
      <Stack.Screen
        name="InstallApp"
        component={InstallAppScreen}
        options={{ title: i18n.t('app.installApp') || 'Installera appen' }}
      />
      {can('users:manage') && (
        <Stack.Screen
          name="Users"
          component={UsersScreen}
          options={{ title: i18n.t('mainMenu.users') || 'Användare' }}
        />
      )}
    </Stack.Navigator>
  );
}

function AppNavigator() {
  const { user } = useAuth();
  return user ? <PrivateStack /> : <PublicStack />;
}

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaProvider style={{ flex: 1 }}>
        <AccountMenuProvider>
          <View style={{ flex: 1, position: 'relative', backgroundColor: '#fff' }}>
            <NavigationContainer linking={linking}>
              <AppNavigator />
              <AccountMenuOverlay />
            </NavigationContainer>
            <EnvRibbon
              position="top-right"
              offsetWeb={-100}
              offsetNative={-90}
              box={250}
              bandWidth={620}
              thickness={28}
              angleDeg={35}
              labelShiftWeb={50}
              labelShiftNative={10}
              zIndex={100000}
            />
          </View>
        </AccountMenuProvider>
      </SafeAreaProvider>
    </AuthProvider>
  );
}
