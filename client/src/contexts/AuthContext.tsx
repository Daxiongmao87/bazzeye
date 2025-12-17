
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSocket } from './SocketContext';

interface AuthContextType {
    isSudo: boolean;
    toggleSudo: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const socket = useSocket();
    const [isSudo, setIsSudo] = useState(false);

    useEffect(() => {
        if (!socket) return;

        socket.on('auth:status', (status: boolean) => {
            setIsSudo(status);
        });

        return () => {
            socket.off('auth:status');
        };
    }, [socket]);

    const toggleSudo = () => {
        if (!socket) return;
        socket.emit('auth:request-toggle');
    };

    return (
        <AuthContext.Provider value={{ isSudo, toggleSudo }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};
