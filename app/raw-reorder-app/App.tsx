import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

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

function PublicStack() {
  return (
    <Stack.Navigator>
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
      <AccountMenuProvider>
        <NavigationContainer>
          <AppNavigator />
          <AccountMenuOverlay />
        </NavigationContainer>
      </AccountMenuProvider>
    </AuthProvider>
  );
}
