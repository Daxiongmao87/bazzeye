
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSocket } from './SocketContext';

interface AuthContextType {
    isSudo: boolean;
    isAuthenticated: boolean;
    toggleSudo: () => void;
    login: (password: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const socket = useSocket();
    const [isSudo, setIsSudo] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false); // Default logic: assume locked until server says otherwise

    useEffect(() => {
        if (!socket) return;

        socket.on('auth:status', (status: boolean) => {
            console.log('[AuthContext] Received auth:status:', status);
            setIsSudo(status);
        });

        // Backend says if we are authed or need password
        socket.on('auth:session-check', (data: { needsPassword: boolean, sudoWasEnabled: boolean, isAuthenticated: boolean }) => {
            console.log('[AuthContext] Session check:', data);

            // If needsPassword is false, it means NO password is set on server, so we are implicitly authenticated
            if (!data.needsPassword) {
                setIsAuthenticated(true);
            } else {
                // Password exists. Are we authed?
                setIsAuthenticated(data.isAuthenticated);
            }

            // Sync sudo state
            setIsSudo(data.sudoWasEnabled && data.isAuthenticated);
        });

        socket.on('auth:login-success', () => {
            console.log('[AuthContext] Login success');
            setIsAuthenticated(true);
        });

        socket.on('auth:login-fail', () => {
            console.log('[AuthContext] Login fail');
            setIsAuthenticated(false);
            alert('Incorrect password'); // Basic feedback for now
        });

        return () => {
            socket.off('auth:status');
            socket.off('auth:session-check');
            socket.off('auth:login-success');
            socket.off('auth:login-fail');
        };
    }, [socket]);

    const toggleSudo = () => {
        if (!socket) return;
        socket.emit('auth:request-toggle');
    };

    const login = (password: string) => {
        if (!socket) return;
        socket.emit('auth:login', password);
    };

    return (
        <AuthContext.Provider value={{ isSudo, isAuthenticated, toggleSudo, login }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};
