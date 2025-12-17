
import React from 'react';
import { SocketProvider } from './contexts/SocketContext';
import { AuthProvider } from './contexts/AuthContext';
import Dashboard from './components/Dashboard';
import './index.css';

const App: React.FC = () => {
  return (
    <SocketProvider>
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    </SocketProvider>
  );
};

export default App;
