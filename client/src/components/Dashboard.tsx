import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { Shield, ShieldAlert, Plus, X, Settings, Lock, Key } from 'lucide-react';

// Using named exports which are definitely available in index.mjs
import { Responsive } from 'react-grid-layout';
import type { Layout as RGL_Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { CpuWidget, StorageWidget, SystemInfoWidget, SystemDataProvider } from './SystemWidgets';
// import type { AlertSettings } from './SystemWidgets'; // Removed
import SteamWidget from './SteamWidget';
import TerminalWidget from './TerminalWidget';
import SystemControlWidget from './SystemControlWidget';
import FileBrowserWidget from './FileBrowserWidget';
import SmartWidget from './SmartWidget';
import { PackageWidget } from './PackageWidget';
import { CleanerWidget } from './CleanerWidget';
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
        { i: 'info', x: 0, y: 0, w: 3, h: 10, minW: 1, minH: 5 },
        { i: 'cpu', x: 3, y: 0, w: 6, h: 8, minW: 3, minH: 6 },
        { i: 'storage', x: 9, y: 0, w: 3, h: 4, minW: 1, minH: 3 },
        { i: 'smart', x: 9, y: 4, w: 3, h: 4, minW: 1, minH: 3 },
        { i: 'controls', x: 9, y: 8, w: 3, h: 10, minW: 1, minH: 7 },
        { i: 'steam', x: 3, y: 8, w: 6, h: 8, minW: 3, minH: 5 },
        { i: 'files', x: 0, y: 10, w: 6, h: 8, minW: 3, minH: 5 },
        { i: 'cleaner', x: 0, y: 18, w: 4, h: 8, minW: 2, minH: 5 },
        { i: 'packages', x: 4, y: 18, w: 4, h: 8, minW: 2, minH: 5 },
        { i: 'terminal', x: 0, y: 26, w: 12, h: 8, minW: 3, minH: 3 },
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
    const [disabledCards, setDisabledCards] = useState<string[]>([]);

    // Flag to prevent saving until server data is loaded
    const [layoutLoaded, setLayoutLoaded] = useState(false);

    // Refs to track current values for callbacks (avoids stale closure)
    const extraTerminalsRef = useRef<string[]>([]);
    const disabledCardsRef = useRef<string[]>([]);
    const layoutsRef = useRef(layouts);

    // Keep refs in sync with state
    useEffect(() => {
        extraTerminalsRef.current = extraTerminals;
    }, [extraTerminals]);

    useEffect(() => {
        disabledCardsRef.current = disabledCards;
    }, [disabledCards]);

    useEffect(() => {
        layoutsRef.current = layouts;
    }, [layouts]);

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

        socket.on('layout:data', (data: { layouts: any, extras: string[], disabledCards?: string[] }) => {
            if (data && data.layouts) {
                const nextLayouts = {
                    lg: migrateLayout(data.layouts.lg || []),
                    md: migrateLayout(data.layouts.md || []),
                    sm: migrateLayout(data.layouts.sm || [])
                };
                layoutsRef.current = nextLayouts;
                setLayouts(nextLayouts);
            }
            if (data && data.extras) {
                extraTerminalsRef.current = data.extras;
                setExtraTerminals(data.extras);
            }
            const nextDisabledCards = data?.disabledCards || [];
            disabledCardsRef.current = nextDisabledCards;
            setDisabledCards(nextDisabledCards);
            // Mark as loaded - now safe to save
            setLayoutLoaded(true);
        });

        socket.on('layout:updated', (data: { layouts: any, extras: string[], disabledCards?: string[] }) => {
            // Update refs before state so grid reconciliation cannot re-save stale visibility.
            if (data && data.layouts) {
                layoutsRef.current = data.layouts;
                setLayouts(data.layouts);
            }
            if (data && data.extras) {
                extraTerminalsRef.current = data.extras;
                setExtraTerminals(data.extras);
            }
            const nextDisabledCards = data?.disabledCards || [];
            disabledCardsRef.current = nextDisabledCards;
            setDisabledCards(nextDisabledCards);
        });

        // Auth Events
        socket.on('auth:needs-setup', () => setShowSetupModal(true));
        socket.on('auth:require-password', () => setShowUnlockModal(true)); // Challenge

        // Session check - show password prompt if sudo was previously enabled
        socket.on('auth:session-check', (data: { needsPassword: boolean; sudoWasEnabled: boolean }) => {
            if (data.needsPassword) {
                setShowUnlockModal(true);
            }
        });

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
            socket.off('auth:session-check');
            socket.off('auth:verify-success');
            socket.off('auth:verify-fail');
            socket.off('auth:set-password-success');
            socket.off('auth:set-password-error');
        };
    }, [socket]);

    const onLayoutChange = (_currentLayout: RGL_Layout, allLayouts: any) => {
        const mergeHiddenCards = (previous: RGL_Layout, updated: RGL_Layout = []) => [
            ...updated,
            ...previous.filter(item => disabledCardsRef.current.includes(item.i))
        ];
        const nextLayouts = {
            lg: mergeHiddenCards(layoutsRef.current.lg, allLayouts.lg),
            md: mergeHiddenCards(layoutsRef.current.md, allLayouts.md),
            sm: mergeHiddenCards(layoutsRef.current.sm, allLayouts.sm)
        };
        setLayouts(nextLayouts);
        // Don't save until initial data is loaded from server
        if (!layoutLoaded) return;
        socket?.emit('layout:save', { layouts: nextLayouts, extras: extraTerminalsRef.current, disabledCards: disabledCardsRef.current });
    };

    const toggleLayoutLock = () => {
        const wasEditing = isDraggable;
        setIsDraggable(!isDraggable);

        // Save layout when EXITING edit mode - use refs for current values
        if (wasEditing) {
            socket?.emit('layout:save', { layouts: layoutsRef.current, extras: extraTerminalsRef.current, disabledCards: disabledCardsRef.current });
        }
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

        socket?.emit('layout:save', { layouts: nextLayouts, extras: nextExtras, disabledCards: disabledCardsRef.current });

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

        socket?.emit('layout:save', { layouts: nextLayouts, extras: nextExtras, disabledCards: disabledCardsRef.current });
    };

    const cardOptions = [
        { id: 'info', label: 'System Info' },
        { id: 'cpu', label: 'CPU & Memory' },
        { id: 'storage', label: 'Storage' },
        { id: 'smart', label: 'SMART Health' },
        { id: 'steam', label: 'Steam' },
        { id: 'terminal', label: 'Terminal' },
        { id: 'cleaner', label: 'Cleaner' },
        { id: 'packages', label: 'Packages' },
        { id: 'controls', label: 'System Controls' },
        { id: 'files', label: 'Files' }
    ];

    const toggleCard = (id: string) => {
        if (!layoutLoaded || !socket) return;

        const previousDisabledCards = disabledCardsRef.current;
        const nextDisabledCards = previousDisabledCards.includes(id)
            ? previousDisabledCards.filter(cardId => cardId !== id)
            : [...previousDisabledCards, id];

        // Update optimistically, but wait for the server acknowledgement before treating
        // the change as durable. The identity check prevents a late response from
        // overwriting a newer local or peer update.
        disabledCardsRef.current = nextDisabledCards;
        setDisabledCards(nextDisabledCards);
        socket.timeout(5000).emit('layout:save', {
            layouts: layoutsRef.current,
            extras: extraTerminalsRef.current,
            disabledCards: nextDisabledCards
        }, (error: Error | null, response?: { success: boolean; layout?: { layouts: { lg: RGL_Layout; md: RGL_Layout; sm: RGL_Layout }; extras: string[]; disabledCards?: string[] } }) => {
            if (disabledCardsRef.current !== nextDisabledCards) return;

            if (error || !response?.success || !response.layout) {
                disabledCardsRef.current = previousDisabledCards;
                setDisabledCards(previousDisabledCards);
                return;
            }

            const savedLayout = response.layout;
            if (savedLayout.layouts) {
                layoutsRef.current = savedLayout.layouts;
                setLayouts(savedLayout.layouts);
            }
            if (savedLayout.extras) {
                extraTerminalsRef.current = savedLayout.extras;
                setExtraTerminals(savedLayout.extras);
            }
            const savedDisabledCards = savedLayout.disabledCards || [];
            disabledCardsRef.current = savedDisabledCards;
            setDisabledCards(savedDisabledCards);
        });
    };

    // Cast Responsive to any to avoid strict prop typing issues with isDraggable in some versions
    const ResponsiveGrid = Responsive as any;

    // Hidden cards remain in the persisted layouts so enabling one restores its previous position and size.
    const visibleLayout = (layout: RGL_Layout) => layout
        .filter(item => !disabledCards.includes(item.i))
        .map(item => ({ ...item, static: !isDraggable }));
    const activeLayouts = {
        lg: visibleLayout(layouts.lg),
        md: visibleLayout(layouts.md),
        sm: visibleLayout(layouts.sm)
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
                        <div className="flex flex-wrap justify-end gap-2">
                            {cardOptions.map(card => {
                                const isEnabled = !disabledCards.includes(card.id);
                                return (
                                    <button
                                        key={card.id}
                                        onClick={() => toggleCard(card.id)}
                                        disabled={!layoutLoaded}
                                        className={`px-3 py-1 rounded border text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isEnabled
                                            ? 'bg-blue-700 hover:bg-blue-600 border-blue-500 text-white'
                                            : 'bg-gray-900 hover:bg-gray-800 border-gray-700 text-gray-400'
                                            }`}
                                        title={layoutLoaded
                                            ? `${isEnabled ? 'Disable' : 'Enable'} ${card.label} card`
                                            : 'Waiting for saved layout to load'}
                                    >
                                        {isEnabled ? 'Disable' : 'Enable'} {card.label}
                                    </button>
                                );
                            })}
                            <button onClick={addTerminalWidget} className="bg-green-700 hover:bg-green-600 px-3 py-1 rounded border border-green-500 text-sm flex items-center gap-1">
                                <Plus size={16} /> Add Terminal Card
                            </button>
                        </div>
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
                            {!disabledCards.includes('info') && (
                                <div key="info" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                    <SystemInfoWidget />
                                </div>
                            )}

                            {!disabledCards.includes('cpu') && (
                                <div key="cpu" className="bg-gray-800/80 rounded-xl border border-gray-700 overflow-hidden backdrop-blur-sm shadow-xl">
                                    <CpuWidget />
                                </div>
                            )}
                            {!disabledCards.includes('storage') && (
                                <div key="storage" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                    <StorageWidget />
                                </div>
                            )}
                            {!disabledCards.includes('smart') && (
                                <div key="smart" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                    <SmartWidget />
                                </div>
                            )}

                            {!disabledCards.includes('steam') && (
                                <div key="steam" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                    <SteamWidget />
                                </div>
                            )}

                            <div
                                key="terminal"
                                className={`bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md${disabledCards.includes('terminal') ? ' hidden' : ''}`}
                            >
                                <TerminalWidget widgetId="terminal" isEditing={isDraggable} />
                            </div>

                            {!disabledCards.includes('cleaner') && (
                                <div key="cleaner" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                    <CleanerWidget />
                                </div>
                            )}

                            {!disabledCards.includes('packages') && (
                                <div key="packages" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                    <PackageWidget />
                                </div>
                            )}

                            {extraTerminals.map(id => (
                                <div
                                    key={id}
                                    className={`bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md relative group${disabledCards.includes(id) ? ' hidden' : ''}`}
                                >
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

                            {!disabledCards.includes('controls') && (
                                <div key="controls" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                    <SystemControlWidget />
                                </div>
                            )}

                            {!disabledCards.includes('files') && (
                                <div key="files" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md">
                                    <FileBrowserWidget />
                                </div>
                            )}
                        </ResponsiveGrid>
                    )}
                </div>
            </SystemDataProvider>

            {/* Auth Modals */}

            {/* 1. Setup Modal (First Run or Reset) */}
            {
                showSetupModal && (
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
                )
            }

            {/* 2. Unlock Modal (Challenge) */}
            {
                showUnlockModal && (
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
                )
            }

            {/* 3. Settings Modal (Password Mgmt) */}
            {
                showSettingsModal && (
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

                            </div> {/* Corrected closing div for space-y-4 */}

                            {/* Temperature Alert Settings */}


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
                )
            }
        </div>
    );
};

export default Dashboard;
