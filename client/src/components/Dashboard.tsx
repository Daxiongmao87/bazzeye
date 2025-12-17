
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Shield, ShieldAlert, Plus, X, Settings } from 'lucide-react';

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
import { BazzeyeLogo } from './BazzeyeLogo';

const Dashboard: React.FC = () => {
    const { isSudo, toggleSudo } = useAuth();
    const [isDraggable, setIsDraggable] = useState(false);

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
        { i: 'terminal', x: 0, y: 18, w: 12, h: 8, minW: 4, minH: 4 },
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
    const [layouts, setLayouts] = useState<{ lg: RGL_Layout, md: RGL_Layout, sm: RGL_Layout }>(() => {
        const saved = localStorage.getItem('bazzeye-layout');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                return {
                    lg: migrateLayout(parsed.lg || []),
                    md: migrateLayout(parsed.md || []),
                    sm: migrateLayout(parsed.sm || [])
                };
            } catch (e) {
                console.error("Layout load error", e);
            }
        }
        return { lg: defaultLayout, md: defaultLayout, sm: defaultLayout };
    });

    const [extraTerminals, setExtraTerminals] = useState<string[]>(() => {
        const savedExtras = localStorage.getItem('bazzeye-extras');
        if (savedExtras) {
            try {
                return JSON.parse(savedExtras);
            } catch (e) { console.error("Extras load error", e); }
        }
        // Fallback: infer from initial layouts
        return layouts.lg
            .filter((item: any) => item.i.startsWith('terminal-extra-'))
            .map((item: any) => item.i);
    });

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

    const onLayoutChange = (_currentLayout: RGL_Layout, allLayouts: any) => {
        setLayouts(allLayouts);
        localStorage.setItem('bazzeye-layout', JSON.stringify(allLayouts));
    };

    const toggleLayoutLock = () => {
        setIsDraggable(!isDraggable);
    };

    const removeTerminalWidget = (id: string) => {
        setExtraTerminals(prev => {
            const next = prev.filter(t => t !== id);
            localStorage.setItem('bazzeye-extras', JSON.stringify(next));
            return next;
        });
        setLayouts(prev => {
            const nextLayouts = {
                lg: prev.lg.filter(i => i.i !== id),
                md: prev.md.filter(i => i.i !== id),
                sm: prev.sm.filter(i => i.i !== id)
            };
            localStorage.setItem('bazzeye-layout', JSON.stringify(nextLayouts));
            return nextLayouts;
        });
    };

    const addTerminalWidget = () => {
        const newId = `terminal-extra-${Date.now()}`;
        setExtraTerminals(prev => {
            const next = [...prev, newId];
            localStorage.setItem('bazzeye-extras', JSON.stringify(next));
            return next;
        });

        // We need to calculate the new layout immediately to save it
        setLayouts(prev => {
            const newItem = { i: newId, x: 0, y: Infinity, w: 6, h: 8, minW: 4, minH: 4 };
            const nextLayouts = {
                lg: [...prev.lg, newItem],
                md: [...prev.md, { ...newItem, w: 5 }],
                sm: [...prev.sm, newItem]
            };
            // Save immediately to persistence to avoid race conditions
            localStorage.setItem('bazzeye-layout', JSON.stringify(nextLayouts));
            return nextLayouts;
        });
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
                    {isDraggable && (
                        <button onClick={addTerminalWidget} className="bg-green-700 hover:bg-green-600 px-3 py-1 rounded border border-green-500 text-sm flex items-center gap-1">
                            <Plus size={16} /> Add Terminal Card
                        </button>
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
                <div ref={containerRef} className="w-full min-h-screen">
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
        </div>
    );
};
export default Dashboard;
