
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { Shield, ShieldAlert, Plus, X, Settings, Lock, Key } from 'lucide-react';

// Using named exports which are definitely available in index.mjs
import { Responsive } from 'react-grid-layout';
import type { Layout as RGL_Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { CpuWidget, StorageWidget, NetworkWidget, SystemInfoWidget, SystemDataProvider } from './SystemWidgets';
import SteamWidget from './SteamWidget';
import TerminalWidget from './TerminalWidget';
import SystemControlWidget from './SystemControlWidget';
import FileBrowserWidget from './FileBrowserWidget';
import SmartWidget from './SmartWidget';
import { UjustWidget } from './UjustWidget';
import { PackageWidget } from './PackageWidget';
import { CleanerWidget } from './CleanerWidget'; // [NEW]
import { BazzeyeLogo } from './BazzeyeLogo';

const Dashboard: React.FC = () => {
    const { isSudo, toggleSudo } = useAuth();
    const socket = useSocket();
    const [isDraggable, setIsDraggable] = useState(false);

    // Auth Modals State
    const [showSetupModal, setShowSetupModal] = useState(false);
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);

    // Auth Input State
    const [passwordInput, setPasswordInput] = useState('');
    const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
    const [oldPasswordInput, setOldPasswordInput] = useState('');
    const [authError, setAuthError] = useState<string | null>(null);
    const [authSuccess, setAuthSuccess] = useState<string | null>(null);

    // Layout configuration
    const defaultLayout: RGL_Layout = [
        { i: 'info', x: 0, y: 0, w: 3, h: 10, minW: 2, minH: 6 },
        { i: 'cpu', x: 3, y: 0, w: 3, h: 8, minW: 3, minH: 6 },
        { i: 'storage', x: 6, y: 0, w: 3, h: 4, minW: 2, minH: 4 },
        { i: 'smart', x: 6, y: 4, w: 3, h: 4, minW: 2, minH: 4 },
        { i: 'network', x: 9, y: 0, w: 3, h: 4, minW: 2, minH: 4 },
        { i: 'controls', x: 9, y: 4, w: 3, h: 6, minW: 2, minH: 6 },
        { i: 'steam', x: 6, y: 8, w: 6, h: 8, minW: 4, minH: 6 },
        { i: 'files', x: 0, y: 10, w: 6, h: 8, minW: 4, minH: 6 },
        { i: 'ujust', x: 0, y: 18, w: 4, h: 8, minW: 3, minH: 6 },
        { i: 'cleaner', x: 4, y: 18, w: 4, h: 8, minW: 3, minH: 6 }, // [NEW]
        { i: 'packages', x: 8, y: 18, w: 4, h: 8, minW: 3, minH: 6 },
        { i: 'terminal', x: 0, y: 26, w: 12, h: 8, minW: 4, minH: 4 },
    ];

    // Helper for migrating layouts
    const migrateLayout = (layout: RGL_Layout) => {
        return layout.map(item => {
            // STRIP any existing lock/static properties from storage so global state rules
            // We destructure to remove them, then return the clean item
            const { static: _s, isDraggable: _d, isResizable: _r, ...cleanItem } = item as any;

            const def = defaultLayout.find(d => d.i === item.i);
            if (def) {
                return {
                    ...cleanItem,
                    minW: def.minW,
                    minH: def.minH,
                    w: Math.max(cleanItem.w, def.minW || 0),
                    h: Math.max(cleanItem.h, def.minH || 0)
                };
            }
            if (item.i.startsWith('terminal-extra-')) {
                return { ...cleanItem, minW: 4, minH: 4 };
            }
            return cleanItem;
        });
    };

    // Lazy load state to prevent layout jump on mount
    const [layouts, setLayouts] = useState<{ lg: RGL_Layout, md: RGL_Layout, sm: RGL_Layout }>({ lg: defaultLayout, md: defaultLayout, sm: defaultLayout });
    const [extraTerminals, setExtraTerminals] = useState<string[]>([]);

    // Width tracking - Start at 0 to prevent "Wrong Width" jump
    const [width, setWidth] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        // Immediate check
        if (containerRef.current.offsetWidth > 0) {
            setWidth(containerRef.current.offsetWidth);
        }

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setWidth(entry.contentRect.width);
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        if (!socket) return;

        // Request initial data
        socket.emit('layout:get');

        socket.on('layout:data', (data: { layouts: any, extras: string[] }) => {
            if (data && data.layouts) {
                // Merge/Migrate if needed, but for now trust backend
                setLayouts({
                    lg: migrateLayout(data.layouts.lg || []),
                    md: migrateLayout(data.layouts.md || []),
                    sm: migrateLayout(data.layouts.sm || [])
                });
            }
            if (data && data.extras) {
                setExtraTerminals(data.extras);
            }
        });

        socket.on('layout:updated', (data: { layouts: any, extras: string[] }) => {
            // Received update from another client
            if (data && data.layouts) setLayouts(data.layouts);
            if (data && data.extras) setExtraTerminals(data.extras);
        });

        // Auth Events
        socket.on('auth:needs-setup', () => setShowSetupModal(true));
        socket.on('auth:require-password', () => setShowUnlockModal(true)); // Challenge

        socket.on('auth:verify-success', () => {
            setShowUnlockModal(false);
            setAuthError(null);
        });
        socket.on('auth:verify-fail', () => {
            setAuthError('Incorrect password');
        });

        socket.on('auth:set-password-success', () => {
            setShowSetupModal(false);
            setShowSettingsModal(false);
            setAuthSuccess('Password updated successfully');
            setTimeout(() => setAuthSuccess(null), 3000);
            setPasswordInput('');
            setConfirmPasswordInput('');
            setOldPasswordInput('');
        });
        socket.on('auth:set-password-error', (msg: string) => {
            setAuthError(msg);
        });

        return () => {
            socket.off('layout:data');
            socket.off('layout:updated');
            socket.off('auth:needs-setup');
            socket.off('auth:require-password');
            socket.off('auth:verify-success');
            socket.off('auth:verify-fail');
            socket.off('auth:set-password-success');
            socket.off('auth:set-password-error');
        };
    }, [socket]);

    const onLayoutChange = (_currentLayout: RGL_Layout, allLayouts: any) => {
        setLayouts(allLayouts);
        // Save to backend
        socket?.emit('layout:save', { layouts: allLayouts, extras: extraTerminals });
    };

    const toggleLayoutLock = () => {
        setIsDraggable(!isDraggable);
    };

    const removeTerminalWidget = (id: string) => {
        const nextExtras = extraTerminals.filter(t => t !== id);
        setExtraTerminals(nextExtras);

        const nextLayouts = {
            lg: layouts.lg.filter(i => i.i !== id),
            md: layouts.md.filter(i => i.i !== id),
            sm: layouts.sm.filter(i => i.i !== id)
        };
        setLayouts(nextLayouts);

        socket?.emit('layout:save', { layouts: nextLayouts, extras: nextExtras });

        // Also tell server to stop that terminal process if we tracked it?
        // Actually terminal service persists configs, we should remove them there too?
        // Yes, let's remove the widget config
        socket?.emit('term:remove', { id });
    };

    const addTerminalWidget = () => {
        const newId = `terminal-extra-${Date.now()}`;
        const nextExtras = [...extraTerminals, newId];
        setExtraTerminals(nextExtras);

        // Calculate new layout
        const newItem = { i: newId, x: 0, y: Infinity, w: 6, h: 8, minW: 4, minH: 4 };
        const nextLayouts = {
            lg: [...layouts.lg, newItem],
            md: [...layouts.md, { ...newItem, w: 5 }],
            sm: [...layouts.sm, newItem]
        };
        setLayouts(nextLayouts);

        socket?.emit('layout:save', { layouts: nextLayouts, extras: nextExtras });
    };

    // Cast Responsive to any to avoid strict prop typing issues with isDraggable in some versions
    const ResponsiveGrid = Responsive as any;

    // Dynamically enforce static property based on isDraggable state
    // This ensures that even if local storage has 'static: false', we override it when locked.
    const activeLayouts = {
        lg: layouts.lg.map(i => ({ ...i, static: !isDraggable })),
        md: layouts.md.map(i => ({ ...i, static: !isDraggable })),
        sm: layouts.sm.map(i => ({ ...i, static: !isDraggable }))
    };

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 font-sans p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600 flex items-center gap-3">
                    <span className="text-blue-500"><BazzeyeLogo size={40} /></span>
                    Bazzeye
                </h1>
                <div className="flex gap-4">
                    <button onClick={() => setShowSettingsModal(true)} className="bg-gray-800 hover:bg-gray-700 p-2 rounded border border-gray-700 text-gray-300" title="Security Settings">
                        <Key size={16} />
                    </button>
                    {isDraggable && (
                        <>
                            <button onClick={addTerminalWidget} className="bg-green-700 hover:bg-green-600 px-3 py-1 rounded border border-green-500 text-sm flex items-center gap-1">
                                <Plus size={16} /> Add Terminal Card
                            </button>
                        </>
                    )}
                    <button
                        onClick={toggleLayoutLock}
                        className={`p-2 rounded-full border transition-all ${isDraggable ? 'bg-blue-600 border-blue-400 text-white rotate-180' : 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-400'}`}
                        title={isDraggable ? "Lock Layout" : "Edit Layout"}
                    >
                        <Settings size={20} />
                    </button>
                    <button onClick={toggleSudo} className={`px-3 py-1 rounded border flex items-center gap-2 text-sm font-semibold transition-colors ${isSudo ? 'bg-red-900/50 border-red-500 text-red-200' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                        {isSudo ? <ShieldAlert size={16} /> : <Shield size={16} />}
                        {isSudo ? 'SUDO MODE' : 'User Mode'}
                    </button>
                </div>
            </div>

            <SystemDataProvider>
                <div ref={containerRef} className="w-full min-h-screen pb-20"> {/* Added pb-20 for scrolling space */}
                    {width > 0 && (
                        <ResponsiveGrid
                            className="layout"
                            layouts={activeLayouts}
                            width={width}
                            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                            rowHeight={30}
                            isDraggable={isDraggable}
                            isResizable={isDraggable}
                            onLayoutChange={(currentLayout: any, allLayouts: any) => onLayoutChange(currentLayout, allLayouts)}
                            margin={[24, 24]}
                            containerPadding={[24, 24]}
                            useCSSTransforms={width > 0}
                        >
                            <div key="info" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                <SystemInfoWidget />
                            </div>

                            <div key="cpu" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                <CpuWidget />
                            </div>
                            <div key="storage" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                <StorageWidget />
                            </div>
                            <div key="smart" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                <SmartWidget />
                            </div>
                            <div key="network" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                <NetworkWidget />
                            </div>

                            <div key="steam" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                <SteamWidget />
                            </div>

                            <div key="terminal" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                <TerminalWidget widgetId="terminal" isEditing={isDraggable} />
                            </div>

                            {/* [NEW] Ujust Widget */}
                            <div key="ujust" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                <UjustWidget />
                            </div>

                            {/* [NEW] Cleaner Widget */}
                            <div key="cleaner" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                <CleanerWidget />
                            </div>

                            <div key="packages" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                <PackageWidget />
                            </div>

                            {extraTerminals.map(id => (
                                <div key={id} className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md relative group">
                                    {isDraggable && (
                                        <button
                                            onClick={() => removeTerminalWidget(id)}
                                            className="absolute top-2 right-2 z-50 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Remove Widget"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                    <TerminalWidget widgetId={id} isEditing={isDraggable} />
                                </div>
                            ))}

                            <div key="controls" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                <SystemControlWidget />
                            </div>

                            <div key="files" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                <FileBrowserWidget />
                            </div>
                        </ResponsiveGrid>
                    )}
                </div>
            </SystemDataProvider>

            {/* Auth Modals */}

            {/* 1. Setup Modal (First Run or Reset) */}
            {showSetupModal && (
                <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center backdrop-blur-md">
                    <div className="bg-gray-900 border border-gray-700 p-8 rounded-2xl shadow-2xl max-w-md w-full">
                        <div className="flex justify-center mb-6 text-blue-500"><Shield size={64} /></div>
                        <h2 className="text-2xl font-bold text-center mb-2 text-white">Secure Your Dashboard</h2>
                        <p className="text-gray-400 text-center mb-6">Set a password to protect Sudo actions (Reboot, Terminal, etc.).</p>

                        {authError && <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4 text-center text-sm">{authError}</div>}

                        <input
                            type="password"
                            className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 mb-3 text-white focus:border-blue-500 outline-none"
                            placeholder="Data Password"
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                        />
                        <input
                            type="password"
                            className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-3 mb-6 text-white focus:border-blue-500 outline-none"
                            placeholder="Confirm Password"
                            value={confirmPasswordInput}
                            onChange={(e) => setConfirmPasswordInput(e.target.value)}
                        />

                        <button
                            onClick={() => {
                                if (passwordInput !== confirmPasswordInput) {
                                    setAuthError("Passwords do not match");
                                    return;
                                }
                                if (!passwordInput) {
                                    setAuthError("Password cannot be empty");
                                    return;
                                }
                                socket?.emit('auth:set-password', { password: passwordInput });
                            }}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors mb-3"
                        >
                            <span className="flex items-center justify-center gap-2"><Lock size={18} /> Set Password</span>
                        </button>

                        <button
                            onClick={() => {
                                if (confirm("Running without a password is NOT recommended. Anyone on the network can control this server. Are you sure?")) {
                                    socket?.emit('auth:set-password', { password: '' });
                                }
                            }}
                            className="w-full text-gray-500 hover:text-gray-300 text-sm py-2"
                        >
                            Skip (Not Recommended)
                        </button>
                    </div>
                </div>
            )}

            {/* 2. Unlock Modal (Challenge) */}
            {showUnlockModal && (
                <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-gray-900 border border-gray-700 p-6 rounded-xl shadow-2xl max-w-sm w-full">
                        <div className="flex justify-center mb-4 text-yellow-500"><Lock size={48} /></div>
                        <h2 className="text-xl font-bold text-center mb-4 text-white">Password Required</h2>

                        {authError && <div className="bg-red-900/50 text-red-200 p-2 rounded mb-4 text-center text-sm">{authError}</div>}

                        <input
                            type="password"
                            autoFocus
                            className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 mb-4 text-white focus:border-yellow-500 outline-none"
                            placeholder="Password..."
                            value={passwordInput}
                            onChange={(e) => { setPasswordInput(e.target.value); setAuthError(null); }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    socket?.emit('auth:verify-password', passwordInput);
                                    setPasswordInput('');
                                }
                            }}
                        />
                        <div className="flex gap-2">
                            <button onClick={() => { setShowUnlockModal(false); setPasswordInput(''); setAuthError(null); }} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded">Cancel</button>
                            <button onClick={() => { socket?.emit('auth:verify-password', passwordInput); setPasswordInput(''); }} className="flex-1 bg-yellow-600 hover:bg-yellow-500 text-white py-2 rounded">Unlock</button>
                        </div>
                    </div>
                </div>
            )}

            {/* 3. Settings Modal (Password Mgmt) */}
            {showSettingsModal && (
                <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-gray-900 border border-gray-700 p-6 rounded-xl shadow-2xl max-w-md w-full relative">
                        <button onClick={() => setShowSettingsModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white"><X size={20} /></button>
                        <h2 className="text-xl font-bold mb-6 text-white flex items-center gap-2"><Settings size={24} /> Security Settings</h2>

                        {authSuccess && <div className="bg-green-900/50 text-green-200 p-3 rounded mb-4 text-center text-sm">{authSuccess}</div>}
                        {authError && <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4 text-center text-sm">{authError}</div>}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-gray-400 text-xs uppercase font-bold mb-2">Change Password</label>
                                <input
                                    type="password"
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:border-blue-500 outline-none mb-2"
                                    placeholder="Old Password (if set)"
                                    value={oldPasswordInput}
                                    onChange={(e) => setOldPasswordInput(e.target.value)}
                                />
                                <input
                                    type="password"
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:border-blue-500 outline-none mb-2"
                                    placeholder="New Password"
                                    value={passwordInput}
                                    onChange={(e) => setPasswordInput(e.target.value)}
                                />
                                <input
                                    type="password"
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:border-blue-500 outline-none"
                                    placeholder="Confirm New Password"
                                    value={confirmPasswordInput}
                                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                                />
                            </div>

                            <button
                                onClick={() => {
                                    if (passwordInput !== confirmPasswordInput) { setAuthError('Passwords do not match'); return; }
                                    socket?.emit('auth:set-password', { password: passwordInput, oldPassword: oldPasswordInput });
                                }}
                                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 rounded"
                            >
                                Update Password
                            </button>

                            <div className="border-t border-gray-800 my-4"></div>

                            <button
                                onClick={() => {
                                    if (confirm("Remove password protection? This is not safe.")) {
                                        socket?.emit('auth:set-password', { password: '', oldPassword: oldPasswordInput });
                                    }
                                }}
                                className="w-full bg-red-900/30 hover:bg-red-900/50 text-red-300 font-semibold py-2 rounded border border-red-900/50"
                            >
                                Remove Password Protection
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
export default Dashboard;
