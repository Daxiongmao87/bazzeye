import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { Gamepad2, Settings, X, Plus, FolderOpen, Folder } from 'lucide-react';

interface SteamGame {
    appid: string;
    name: string;
    installDir: string;
    sizeOnDisk: number;
    imageUrl: string;
}

const SteamWidget: React.FC = () => {
    const socket = useSocket();
    const [games, setGames] = useState<SteamGame[]>([]);
    const [nowPlaying, setNowPlaying] = useState<SteamGame | null>(null);
    const [loading, setLoading] = useState(true);
    const [showConfig, setShowConfig] = useState(false);
    const [libraryPaths, setLibraryPaths] = useState<string[]>([]);
    const [editingPaths, setEditingPaths] = useState<string[]>([]);

    // Simple suggestion state
    const [pathSuggestions, setPathSuggestions] = useState<{ path: string; items: any[] }>({ path: '', items: [] });
    const [pathInputFocus, setPathInputFocus] = useState<number>(-1);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!socket) return;

        socket.emit('steam:request-games');
        socket.emit('steam:get-library-paths');

        socket.on('steam:games', (data: SteamGame[]) => {
            setGames(data);
            setLoading(false);
        });

        socket.on('steam:now-playing', (game: SteamGame | null) => {
            setNowPlaying(game);
        });

        socket.on('steam:library-paths', (paths: string[]) => {
            setLibraryPaths(paths);
        });

        socket.on('files:list-data', (response: any) => {
            if (response.success && response.files) {
                const dirs = response.files.filter((f: any) => f.type === 'directory');
                setPathSuggestions({ path: response.currentPath || '', items: dirs });
            }
        });

        return () => {
            socket.off('steam:games');
            socket.off('steam:now-playing');
            socket.off('steam:library-paths');
            socket.off('files:list-data');
        };
    }, [socket]);

    const handleOpenConfig = () => {
        setEditingPaths([...libraryPaths]);
        setShowConfig(true);
    };

    const handleSavePaths = () => {
        if (socket) {
            socket.emit('steam:set-library-paths', editingPaths);
        }
        setShowConfig(false);
        setPathInputFocus(-1);
    };

    const handleAddPath = () => {
        setEditingPaths([...editingPaths, '']);
    };

    const handleRemovePath = (index: number) => {
        setEditingPaths(editingPaths.filter((_, i) => i !== index));
    };

    // Get directory path from input (everything up to and including last /)
    const getDirectoryPath = (inputPath: string): string => {
        if (inputPath === '/') return '/';
        if (inputPath.endsWith('/')) return inputPath.slice(0, -1);
        const lastSlash = inputPath.lastIndexOf('/');
        if (lastSlash === 0) return '/'; // Parent is root
        return lastSlash > 0 ? inputPath.substring(0, lastSlash) : '/';
    };

    // Get partial name being typed (after last /)
    const getPartialName = (inputPath: string): string => {
        if (inputPath.endsWith('/')) return '';
        const lastSlash = inputPath.lastIndexOf('/');
        return lastSlash >= 0 ? inputPath.substring(lastSlash + 1) : inputPath;
    };

    const requestSuggestions = (dir: string) => {
        if (!socket || !dir) return;
        socket.emit('files:list', { path: dir });
    };

    const handlePathChange = (index: number, value: string) => {
        const newPaths = [...editingPaths];
        newPaths[index] = value;
        setEditingPaths(newPaths);
        setActiveSuggestionIndex(-1);

        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (value.includes('/')) {
            debounceRef.current = setTimeout(() => {
                requestSuggestions(getDirectoryPath(value));
            }, 150);
        } else {
            setPathSuggestions({ path: '', items: [] });
        }
    };

    const handleSuggestionClick = (index: number, suggestion: any) => {
        const currentPath = editingPaths[index] || '';
        const currentDir = getDirectoryPath(currentPath);
        const prefix = currentDir.endsWith('/') ? currentDir : currentDir + '/';
        const newPath = prefix + suggestion.name + '/';

        const newPaths = [...editingPaths];
        newPaths[index] = newPath;
        setEditingPaths(newPaths);
        setActiveSuggestionIndex(-1);
        requestSuggestions(newPath);
    };

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        const currentVal = editingPaths[index] || '';
        const currentDir = getDirectoryPath(currentVal);
        const partial = getPartialName(currentVal);

        if (pathSuggestions.path !== currentDir || pathSuggestions.items.length === 0) return;

        const filteredItems = pathSuggestions.items.filter((p: any) =>
            p.name.toLowerCase().startsWith(partial.toLowerCase())
        );

        if (filteredItems.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveSuggestionIndex(prev => (prev + 1) % filteredItems.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveSuggestionIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
        } else if (e.key === 'Tab' || e.key === 'Enter') {
            if (activeSuggestionIndex >= 0 && filteredItems[activeSuggestionIndex]) {
                e.preventDefault();
                handleSuggestionClick(index, filteredItems[activeSuggestionIndex]);
            }
        } else if (e.key === 'Escape') {
            setPathSuggestions({ path: '', items: [] });
            setPathInputFocus(-1);
        }
    };

    return (
        <div className="h-full flex flex-col p-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Gamepad2 size={20} className="text-indigo-400" /> Steam Library ({games.length})
                </h2>
                <button
                    onClick={handleOpenConfig}
                    className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                    title="Configure Steam library paths"
                >
                    <Settings size={18} className="text-gray-400 hover:text-gray-200" />
                </button>
            </div>

            {nowPlaying && (
                <div className="mb-4 p-3 rounded-lg bg-indigo-900/50 border border-indigo-500/50 flex items-center gap-4 animate-pulse-slow">
                    <div className="relative w-16 h-24 flex-shrink-0 rounded overflow-hidden shadow-lg">
                        <img src={nowPlaying.imageUrl} alt={nowPlaying.name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                        <div className="text-xs text-indigo-300 font-bold uppercase tracking-wider mb-1">Now Playing</div>
                        <div className="text-lg font-bold text-white leading-tight">{nowPlaying.name}</div>
                        <div className="text-xs text-indigo-400 mt-1">Running on Steam</div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="text-gray-400">Scanning libraries...</div>
            ) : games.length === 0 ? (
                <div className="text-gray-500 italic">No games found in standard locations.</div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                        {games.map((game) => (
                            <div key={game.appid} className="group relative aspect-[600/900] bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all hover:scale-105">
                                <img
                                    src={game.imageUrl}
                                    alt={game.name}
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                    }}
                                />
                                <div className="hidden absolute inset-0 flex items-center justify-center p-2 text-center bg-gray-800">
                                    <span className="text-xs font-semibold text-gray-300">{game.name}</span>
                                </div>
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                    <div className="w-full">
                                        <div className="text-white text-xs font-bold truncate">{game.name}</div>
                                        <div className="text-gray-300 text-[10px]">{(game.sizeOnDisk / 1024 / 1024 / 1024).toFixed(1)} GB</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showConfig && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto custom-scrollbar shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold flex items-center gap-2">
                                <FolderOpen size={20} className="text-indigo-400" />
                                Steam Library Paths
                            </h3>
                            <button onClick={() => setShowConfig(false)} className="p-1 hover:bg-gray-800 rounded-lg transition-colors">
                                <X size={20} className="text-gray-400" />
                            </button>
                        </div>

                        <p className="text-sm text-gray-400 mb-4">
                            Configure the paths where your Steam library folders are located.
                        </p>

                        <div className="space-y-3 mb-4">
                            {editingPaths.length === 0 ? (
                                <div className="text-gray-500 text-sm italic p-4 bg-gray-800/50 rounded-lg text-center">
                                    No paths configured. Using auto-detection.
                                </div>
                            ) : (
                                editingPaths.map((path, index) => {
                                    const isFocused = pathInputFocus === index;
                                    const currentDir = getDirectoryPath(path);
                                    const partial = getPartialName(path);
                                    const pathMatch = pathSuggestions.path === currentDir;

                                    const filteredItems = pathSuggestions.items.filter((p: any) =>
                                        p.name.toLowerCase().startsWith(partial.toLowerCase())
                                    );

                                    const showDropdown = isFocused && pathMatch && filteredItems.length > 0;

                                    return (
                                        <div key={index} className="relative">
                                            <div className="flex gap-2">
                                                <input
                                                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                                                    type="text"
                                                    placeholder="/home/user/.local/share/Steam"
                                                    value={path}
                                                    onChange={(e) => handlePathChange(index, e.target.value)}
                                                    onKeyDown={(e) => handleKeyDown(e, index)}
                                                    onFocus={() => {
                                                        setPathInputFocus(index);
                                                        if (path.includes('/')) {
                                                            requestSuggestions(getDirectoryPath(path));
                                                        }
                                                    }}
                                                    onBlur={() => setTimeout(() => setPathInputFocus(-1), 200)}
                                                />
                                                <button
                                                    onClick={() => handleRemovePath(index)}
                                                    className="p-2 bg-red-900/30 hover:bg-red-900/50 border border-red-700 rounded-lg transition-colors"
                                                    title="Remove path"
                                                >
                                                    <X size={18} className="text-red-400" />
                                                </button>
                                            </div>

                                            {showDropdown && (
                                                <div className="absolute top-full left-0 right-10 z-50 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                                                    {filteredItems.map((suggestion: any, i: number) => (
                                                        <button
                                                            key={suggestion.name}
                                                            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${i === activeSuggestionIndex ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                handleSuggestionClick(index, suggestion);
                                                            }}
                                                        >
                                                            <Folder size={14} className="text-gray-500" />
                                                            {suggestion.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <button
                            onClick={handleAddPath}
                            className="w-full mb-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <Plus size={18} />
                            Add Path
                        </button>

                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setShowConfig(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSavePaths} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
                                Save & Rescan
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SteamWidget;
