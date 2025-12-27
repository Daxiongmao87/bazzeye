import React from 'react';
import { SocketProvider } from './contexts/SocketContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Dashboard from './components/Dashboard';
import LoginScreen from './components/LoginScreen';
import './index.css';

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <Dashboard />;
};

const App: React.FC = () => {
  return (
    <SocketProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SocketProvider>
  );
};

export default App;
