
import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useSocket } from '../contexts/SocketContext';
import { TerminalSquare, Plus, X, Ghost, RotateCcw } from 'lucide-react';

interface TerminalInstance {
    id: string;
    command: string;
    widgetId?: string;
    name?: string;
}

interface TerminalWidgetProps {
    widgetId?: string;
    isEditing?: boolean;
}

const TerminalWidget: React.FC<TerminalWidgetProps> = ({ widgetId = 'terminal', isEditing = false }) => {
    const socket = useSocket();
    const [terminals, setTerminals] = useState<TerminalInstance[]>([]);
    const [activeTermId, setActiveTermId] = useState<string>('');
    const [showNewTermModal, setShowNewTermModal] = useState(false);
    const [isTransparent, setIsTransparent] = useState(() => {
        return localStorage.getItem(`term-transparent-${widgetId}`) === 'true';
    });

    // Save persist
    useEffect(() => {
        localStorage.setItem(`term-transparent-${widgetId}`, String(isTransparent));
    }, [isTransparent, widgetId]);

    const [newCommand, setNewCommand] = useState('');
    const [editingGameId, setEditingGameId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    useEffect(() => {
        if (!socket) return;
        // Request saved terminals
        socket.emit('term:list');

        socket.on('term:list-data', (configs: any[]) => {
            // Filter configs for this widget
            const myConfigs = configs.filter((c: any) => {
                // If config has no widgetId, assume it belongs to default 'terminal'
                const cWidgetId = c.widgetId || 'terminal';
                return cWidgetId === widgetId;
            });

            if (myConfigs.length > 0) {
                setTerminals(myConfigs);
                if (!activeTermId) setActiveTermId(myConfigs[0].id);
            } else {
                // If we are 'terminal' (default), spawn default. 
                // If we are a secondary widget, we might want to start empty?
                // Let's start with a shell if empty.
                const defaultId = `${widgetId}-${Date.now()}`;
                const initial = { id: defaultId, command: '', widgetId };
                setTerminals([initial]);
                setActiveTermId(defaultId);
                socket.emit('term:create', initial);
            }
        });

        return () => { socket.off('term:list-data'); };
    }, [socket, widgetId]); // Re-run if widgetId changes

    const addTerminal = () => {
        const id = `${widgetId}-${Date.now()}`;
        const newTerm = { id, command: newCommand, widgetId };
        setTerminals(prev => [...prev, newTerm]);
        setActiveTermId(id);
        // This triggers backend creation AND saving
        socket?.emit('term:create', newTerm);
        setShowNewTermModal(false);
        setNewCommand('');
    };

    const removeTerminal = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        socket?.emit('term:remove', { id });
        setTerminals(prev => prev.filter(t => t.id !== id));
        if (activeTermId === id) {
            setActiveTermId(terminals[0]?.id || '');
        }
    };

    const startRenaming = (e: React.MouseEvent, term: TerminalInstance) => {
        e.stopPropagation(); // prevent tab switch if unnecessary, though we are double clicking
        setEditingGameId(term.id);
        setEditName(term.name || term.command || 'Terminal');
    };

    const saveName = (id: string) => {
        if (!socket) return;
        socket.emit('term:update', { id, updates: { name: editName } });
        setTerminals(prev => prev.map(t => t.id === id ? { ...t, name: editName } : t));
        setEditingGameId(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
        if (e.key === 'Enter') saveName(id);
        if (e.key === 'Escape') setEditingGameId(null);
    };

    const [widgetTitle, setWidgetTitle] = useState(() => {
        return localStorage.getItem(`term-widget-title-${widgetId}`) || '';
    });
    const [isEditingTitle, setIsEditingTitle] = useState(false);

    useEffect(() => {
        localStorage.setItem(`term-widget-title-${widgetId}`, widgetTitle);
    }, [widgetTitle, widgetId]);

    // ... existing socket effect ...

    const restartTerminal = () => {
        if (!activeTermId) return;
        const term = terminals.find(t => t.id === activeTermId);
        if (!term) return;

        // Kill and Respawn
        socket?.emit('term:remove', { id: term.id });
        // Small delay to ensure cleanup? Or just fire create immediately.
        // Backend key is ID, so removing should clear it.
        // We reuse the same ID to keep the UI state (selected tab) consistent.
        // Or should we generate a new ID? 
        // If we generate a new ID, we must update the state.

        // Let's use same ID for simplicity of UI, assuming backend handles the race or we wait a ms.
        // Actually, backend might need a moment. Safer to generate new ID and swap it in place.
        const newId = `${widgetId}-${Date.now()}`;

        // Update state first
        setTerminals(prev => prev.map(t => t.id === activeTermId ? { ...t, id: newId } : t));
        setActiveTermId(newId);

        // Emit create
        socket?.emit('term:create', { id: newId, command: term.command, widgetId });
    };

    const handleTitleSave = () => {
        setIsEditingTitle(false);
        // Persisted via effect
    };

    return (
        <div className="h-full flex flex-col p-4">
            <div className="flex justify-between items-center mb-2">
                <h2
                    className="text-xl font-semibold flex items-center gap-2 cursor-pointer group"
                    onDoubleClick={() => setIsEditingTitle(true)}
                    title="Double-click to rename widget"
                >
                    <TerminalSquare size={20} className="text-orange-400" />
                    {isEditingTitle ? (
                        <input
                            autoFocus
                            className="bg-transparent border-b border-blue-500 focus:outline-none w-48 text-white"
                            value={widgetTitle}
                            onChange={e => setWidgetTitle(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleTitleSave();
                                if (e.key === 'Escape') setIsEditingTitle(false);
                            }}
                            onBlur={handleTitleSave}
                            onClick={e => e.stopPropagation()}
                        />
                    ) : (
                        <div className="flex items-center gap-2">
                            <span>{widgetTitle || (widgetId === 'terminal' ? 'Terminals' : 'Extra Terminal')}</span>
                            <span className="opacity-0 group-hover:opacity-100 text-xs text-gray-500 font-normal transition-opacity">(Double-click to rename)</span>
                        </div>
                    )}
                </h2>

                <div className="flex items-center gap-1">
                    {/* Controls */}
                    <button
                        onClick={restartTerminal}
                        className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors mr-2"
                        title="Restart Active Terminal Session"
                    >
                        <RotateCcw size={16} />
                    </button>

                    {isEditing && (
                        <button
                            onClick={() => setIsTransparent(!isTransparent)}
                            className={`p-1.5 rounded transition-colors mr-2 ${isTransparent ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-400'}`}
                            title="Toggle Transparency"
                        >
                            <Ghost size={16} />
                        </button>
                    )}
                    <button
                        onClick={() => setShowNewTermModal(true)}
                        className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                        title="New Terminal Tab"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            {/* Tabs - Only show if > 1 terminal */}
            {
                terminals.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto border-b border-gray-700 pb-2 mb-2 custom-scrollbar">
                        {terminals.map(term => (
                            <div
                                key={term.id}
                                onClick={() => setActiveTermId(term.id)}
                                onDoubleClick={(e) => startRenaming(e, term)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg cursor-pointer text-sm font-medium transition-colors ${activeTermId === term.id
                                    ? 'bg-gray-700 text-white'
                                    : 'bg-gray-900 text-gray-400 hover:bg-gray-700/50'
                                    }`}
                            >
                                {editingGameId === term.id ? (
                                    <input
                                        autoFocus
                                        className="bg-transparent border-b border-blue-500 focus:outline-none w-24 text-white"
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        onKeyDown={e => handleKeyDown(e, term.id)}
                                        onBlur={() => saveName(term.id)}
                                        onClick={e => e.stopPropagation()}
                                    />
                                ) : (
                                    <span>{term.name || 'Terminal'}</span>
                                )}

                                <button onClick={(e) => removeTerminal(e, term.id)} className="hover:text-red-400">
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )
            }

            {/* Active Terminal View */}
            <div className={`rounded-lg p-2 flex-1 min-h-0 relative ${isTransparent ? 'bg-transparent' : 'bg-black'}`}>
                {terminals.map(term => (
                    <div key={term.id} className={activeTermId === term.id ? 'h-full' : 'hidden'}>
                        <XTermWrapper
                            id={term.id}
                            command={term.command}
                            widgetId={widgetId}
                            socket={socket}
                            transparent={isTransparent}
                        />
                    </div>
                ))}
            </div>

            {/* Modal */}
            {
                showNewTermModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 w-96">
                            <h3 className="text-lg font-semibold mb-4">New Terminal</h3>
                            <div className="mb-4">
                                <label className="block text-sm text-gray-400 mb-1">Command (Optional)</label>
                                <input
                                    type="text"
                                    value={newCommand}
                                    onChange={(e) => setNewCommand(e.target.value)}
                                    placeholder="e.g. htop"
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">If set, command runs in loop (auto-restart).</p>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setShowNewTermModal(false)}
                                    className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={addTerminal}
                                    className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500"
                                >
                                    Create
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

// Isolated Xterm wrapper to handle lifecycle
const XTermWrapper: React.FC<{ id: string, command: string, widgetId: string, socket: any, transparent: boolean }> = ({ id, command, widgetId, socket, transparent }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    // Handle transparency updates
    useEffect(() => {
        if (xtermRef.current) {
            xtermRef.current.options.theme = {
                background: transparent ? '#00000000' : '#030712',
            };
            xtermRef.current.options.allowTransparency = transparent;
            // Force refresh?
            xtermRef.current.refresh(0, xtermRef.current.rows - 1);
        }
    }, [transparent]);

    useEffect(() => {
        if (!terminalRef.current || !socket) return;

        // Init XTerm
        const term = new Terminal({
            cursorBlink: true,
            allowTransparency: transparent,
            theme: {
                background: transparent ? '#00000000' : '#030712', // transparent or gray-950
                foreground: '#e5e7eb', // gray-200
            },
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 14
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(terminalRef.current);
        fitAddon.fit();

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // Create terminal on backend
        socket.emit('term:create', { id, command: command || null, widgetId });

        // Input
        term.onData((data) => {
            socket.emit('term:input', { id, data });
        });

        // Output listener setup
        const handleOutput = ({ id: termId, data }: { id: string, data: string }) => {
            if (termId === id) {
                term.write(data);
            }
        };
        socket.on('term:output', handleOutput);

        // Resize observer
        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit();
            socket.emit('term:resize', { id, cols: term.cols, rows: term.rows });
        });
        resizeObserver.observe(terminalRef.current);

        // Initial resize emit
        socket.emit('term:resize', { id, cols: term.cols, rows: term.rows });

        return () => {
            resizeObserver.disconnect();
            socket.off('term:output', handleOutput);
            term.dispose();
        };
    }, []);

    // Re-fit when visible (a bit hacky, relies on parent re-rendering)
    useEffect(() => {
        if (fitAddonRef.current) {
            setTimeout(() => fitAddonRef.current?.fit(), 100);
        }
    }, [id]); // Refit on mount

    return <div ref={terminalRef} className="h-full w-full overflow-hidden" />;
};

export default TerminalWidget;
