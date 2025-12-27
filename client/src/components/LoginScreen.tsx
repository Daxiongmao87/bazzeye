import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const LoginScreen: React.FC = () => {
    const { login } = useAuth();
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        login(password);
        // Login result handled by AuthContext event listeners.
        // We can just reset loading after a timeout to allow retry if it fails (AuthContext alert)
        setTimeout(() => setLoading(false), 1000);
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            backgroundColor: '#0a0a0a',
            color: '#00ff00',
            fontFamily: 'monospace'
        }}>
            <div style={{
                border: '1px solid #333',
                padding: '2rem',
                borderRadius: '8px',
                textAlign: 'center',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
            }}>
                <h1 style={{ marginBottom: '2rem', fontSize: '1.5rem' }}>SYSTEM LOCKED</h1>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter Password..."
                        style={{
                            background: '#111',
                            border: '1px solid #333',
                            color: '#00ff00',
                            padding: '0.8rem',
                            borderRadius: '4px',
                            width: '250px',
                            outline: 'none',
                            textAlign: 'center'
                        }}
                        autoFocus
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            background: '#00cc00',
                            color: '#000',
                            border: 'none',
                            padding: '0.8rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            opacity: loading ? 0.7 : 1
                        }}
                    >
                        {loading ? 'AUTHENTICATING...' : 'UNLOCK'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginScreen;
