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

    const builtInCards = [
        { id: 'info', label: 'System Information' },
        { id: 'cpu', label: 'CPU & Memory' },
        { id: 'storage', label: 'Storage' },
        { id: 'smart', label: 'SMART Health' },
        { id: 'steam', label: 'Steam' },
        { id: 'terminal', label: 'Terminal' },
        { id: 'cleaner', label: 'Cleaner' },
        { id: 'packages', label: 'Packages' },
        { id: 'controls', label: 'System Controls' },
        { id: 'files', label: 'File Browser' }
    ];

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

        socket.on('layout:data', (data: { layouts: any, extras: string[], disabledCards?: string[] }) => {
            if (data && data.layouts) {
                // Merge/Migrate if needed, but for now trust backend
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
            // Received update from another client
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

        // Request initial data only after listeners are ready for the response.
        socket.emit('layout:get');

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
        const mergeDisabledItems = (layout: RGL_Layout, previousLayout: RGL_Layout) => [
            ...layout,
            ...previousLayout.filter(item =>
                disabledCardsRef.current.includes(item.i) && !layout.some(nextItem => nextItem.i === item.i)
            )
        ];
        const nextLayouts = {
            lg: mergeDisabledItems(allLayouts.lg, layoutsRef.current.lg),
            md: mergeDisabledItems(allLayouts.md, layoutsRef.current.md),
            sm: mergeDisabledItems(allLayouts.sm, layoutsRef.current.sm)
        };

        layoutsRef.current = nextLayouts;
        setLayouts(nextLayouts);
        // Don't save until initial data is loaded from server
        if (!layoutLoaded) return;
        // Save to backend - use refs to avoid stale callback state
        socket?.emit('layout:save', {
            layouts: nextLayouts,
            extras: extraTerminalsRef.current,
            disabledCards: disabledCardsRef.current
        });
    };

    const toggleLayoutLock = () => {
        const wasEditing = isDraggable;
        setIsDraggable(!isDraggable);

        // Save layout when EXITING edit mode - use refs for current values
        if (wasEditing) {
            socket?.emit('layout:save', {
                layouts: layoutsRef.current,
                extras: extraTerminalsRef.current,
                disabledCards: disabledCardsRef.current
            });
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

        socket?.emit('layout:save', {
            layouts: nextLayouts,
            extras: nextExtras,
            disabledCards: disabledCardsRef.current
        });

        // Also remove the saved terminal configuration and stop its process.
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

        socket?.emit('layout:save', {
            layouts: nextLayouts,
            extras: nextExtras,
            disabledCards: disabledCardsRef.current
        });
    };

    const disableCard = (id: string) => {
        const nextDisabledCards = [...disabledCardsRef.current, id];
        disabledCardsRef.current = nextDisabledCards;
        setDisabledCards(nextDisabledCards);
        socket?.emit('layout:save', {
            layouts: layoutsRef.current,
            extras: extraTerminalsRef.current,
            disabledCards: nextDisabledCards
        });
    };

    const enableCard = (id: string) => {
        const nextDisabledCards = disabledCardsRef.current.filter(cardId => cardId !== id);
        disabledCardsRef.current = nextDisabledCards;
        const defaultItem = defaultLayout.find(item => item.i === id);
        const ensureItem = (layout: RGL_Layout) => (
            defaultItem && !layout.some(item => item.i === id) ? [...layout, { ...defaultItem }] : layout
        );
        const nextLayouts = {
            lg: ensureItem(layoutsRef.current.lg),
            md: ensureItem(layoutsRef.current.md),
            sm: ensureItem(layoutsRef.current.sm)
        };

        layoutsRef.current = nextLayouts;
        setDisabledCards(nextDisabledCards);
        setLayouts(nextLayouts);
        socket?.emit('layout:save', {
            layouts: nextLayouts,
            extras: extraTerminalsRef.current,
            disabledCards: nextDisabledCards
        });
    };

    // Cast Responsive to any to avoid strict prop typing issues with isDraggable in some versions
    const ResponsiveGrid = Responsive as any;

    // Hidden cards retain their stored positions while being omitted from the active grid.
    const activeLayouts = {
        lg: layouts.lg.filter(i => !disabledCards.includes(i.i)).map(i => ({ ...i, static: !isDraggable })),
        md: layouts.md.filter(i => !disabledCards.includes(i.i)).map(i => ({ ...i, static: !isDraggable })),
        sm: layouts.sm.filter(i => !disabledCards.includes(i.i)).map(i => ({ ...i, static: !isDraggable }))
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
                            {disabledCards.length > 0 && (
                                <select
                                    aria-label="Enable card"
                                    value=""
                                    onChange={(event) => enableCard(event.target.value)}
                                    className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm text-gray-200"
                                >
                                    <option value="" disabled>Enable Card...</option>
                                    {builtInCards
                                        .filter(card => disabledCards.includes(card.id))
                                        .map(card => <option key={card.id} value={card.id}>{card.label}</option>)}
                                </select>
                            )}
                        </>
                    )}
                    <button
                        onClick={toggleLayoutLock}
                        disabled={!layoutLoaded}
                        className={`p-2 rounded-full border transition-all ${isDraggable ? 'bg-blue-600 border-blue-400 text-white rotate-180' : 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-400'} ${!layoutLoaded ? 'cursor-not-allowed opacity-50' : ''}`}
                        title={!layoutLoaded ? "Loading Layout" : isDraggable ? "Lock Layout" : "Edit Layout"}
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
                                <div key="info" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md relative group">
                                    {isDraggable && <button onMouseDown={event => event.stopPropagation()} onClick={() => disableCard('info')} className="absolute top-2 right-2 z-50 bg-red-600 text-white rounded-full p-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100" title="Disable System Information card"><X size={12} /></button>}
                                    <SystemInfoWidget />
                                </div>
                            )}

                            {!disabledCards.includes('cpu') && (
                                <div key="cpu" className="bg-gray-800/80 rounded-xl border border-gray-700 overflow-hidden backdrop-blur-sm shadow-xl relative group">
                                    {isDraggable && <button onMouseDown={event => event.stopPropagation()} onClick={() => disableCard('cpu')} className="absolute top-2 right-2 z-50 bg-red-600 text-white rounded-full p-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100" title="Disable CPU & Memory card"><X size={12} /></button>}
                                    <CpuWidget />
                                </div>
                            )}
                            {!disabledCards.includes('storage') && (
                                <div key="storage" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md relative group">
                                    {isDraggable && <button onMouseDown={event => event.stopPropagation()} onClick={() => disableCard('storage')} className="absolute top-2 right-2 z-50 bg-red-600 text-white rounded-full p-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100" title="Disable Storage card"><X size={12} /></button>}
                                    <StorageWidget />
                                </div>
                            )}
                            {!disabledCards.includes('smart') && (
                                <div key="smart" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md relative group">
                                    {isDraggable && <button onMouseDown={event => event.stopPropagation()} onClick={() => disableCard('smart')} className="absolute top-2 right-2 z-50 bg-red-600 text-white rounded-full p-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100" title="Disable SMART Health card"><X size={12} /></button>}
                                    <SmartWidget />
                                </div>
                            )}

                            {!disabledCards.includes('steam') && (
                                <div key="steam" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md relative group">
                                    {isDraggable && <button onMouseDown={event => event.stopPropagation()} onClick={() => disableCard('steam')} className="absolute top-2 right-2 z-50 bg-red-600 text-white rounded-full p-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100" title="Disable Steam card"><X size={12} /></button>}
                                    <SteamWidget />
                                </div>
                            )}

                            {!disabledCards.includes('terminal') && (
                                <div key="terminal" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md relative group">
                                    {isDraggable && <button onMouseDown={event => event.stopPropagation()} onClick={() => disableCard('terminal')} className="absolute top-2 right-2 z-50 bg-red-600 text-white rounded-full p-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100" title="Disable Terminal card"><X size={12} /></button>}
                                    <TerminalWidget widgetId="terminal" isEditing={isDraggable} />
                                </div>
                            )}

                            {!disabledCards.includes('cleaner') && (
                                <div key="cleaner" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md relative group">
                                    {isDraggable && <button onMouseDown={event => event.stopPropagation()} onClick={() => disableCard('cleaner')} className="absolute top-2 right-2 z-50 bg-red-600 text-white rounded-full p-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100" title="Disable Cleaner card"><X size={12} /></button>}
                                    <CleanerWidget />
                                </div>
                            )}

                            {!disabledCards.includes('packages') && (
                                <div key="packages" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md relative group">
                                    {isDraggable && <button onMouseDown={event => event.stopPropagation()} onClick={() => disableCard('packages')} className="absolute top-2 right-2 z-50 bg-red-600 text-white rounded-full p-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100" title="Disable Packages card"><X size={12} /></button>}
                                    <PackageWidget />
                                </div>
                            )}

                            {extraTerminals.map(id => (
                                <div key={id} className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md relative group">
                                    {isDraggable && (
                                        <button
                                            onClick={() => removeTerminalWidget(id)}
                                            className="absolute top-2 right-2 z-50 bg-red-600 text-white rounded-full p-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
                                            title="Remove Widget"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                    <TerminalWidget widgetId={id} isEditing={isDraggable} />
                                </div>
                            ))}

                            {!disabledCards.includes('controls') && (
                                <div key="controls" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md relative group">
                                    {isDraggable && <button onMouseDown={event => event.stopPropagation()} onClick={() => disableCard('controls')} className="absolute top-2 right-2 z-50 bg-red-600 text-white rounded-full p-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100" title="Disable System Controls card"><X size={12} /></button>}
                                    <SystemControlWidget />
                                </div>
                            )}

                            {!disabledCards.includes('files') && (
                                <div key="files" className="bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden shadow-lg backdrop-blur-md relative group">
                                    {isDraggable && <button onMouseDown={event => event.stopPropagation()} onClick={() => disableCard('files')} className="absolute top-2 right-2 z-50 bg-red-600 text-white rounded-full p-1 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100" title="Disable File Browser card"><X size={12} /></button>}
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
