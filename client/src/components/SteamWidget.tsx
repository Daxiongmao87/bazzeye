import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../contexts/SocketContext';
import { Gamepad2, Settings, X, Plus, FolderOpen } from 'lucide-react';

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

    const [pathSuggestions, setPathSuggestions] = useState<any[]>([]);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
    const [pathInputFocus, setPathInputFocus] = useState<number>(-1);
    const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

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
                setPathSuggestions(dirs);
            } else {
                setPathSuggestions([]);
            }
        });

        return () => {
            socket.off('steam:games');
            socket.off('steam:now-playing');
            socket.off('steam:library-paths');
            socket.off('files:list-data');
        };
    }, [socket]);

    // Update dropdown position when focus changes or window scrolls/resizes
    useEffect(() => {
        if (pathInputFocus !== -1 && inputRefs.current[pathInputFocus]) {
            const updatePosition = () => {
                const el = inputRefs.current[pathInputFocus];
                if (el) {
                    const rect = el.getBoundingClientRect();
                    setDropdownRect({
                        top: rect.bottom + window.scrollY,
                        left: rect.left + window.scrollX,
                        width: rect.width
                    });
                }
            };

            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);

            return () => {
                window.removeEventListener('scroll', updatePosition, true);
                window.removeEventListener('resize', updatePosition);
            };
        } else {
            setDropdownRect(null);
        }
    }, [pathInputFocus, showConfig]);

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

    const requestSuggestions = (inputPath: string) => {
        if (!socket) return;
        const dir = inputPath.endsWith('/') ? inputPath : inputPath.substring(0, inputPath.lastIndexOf('/')) || '/';
        socket.emit('files:list', dir);
    };

    const handlePathChange = (index: number, value: string) => {
        const newPaths = [...editingPaths];
        newPaths[index] = value;
        setEditingPaths(newPaths);

        // Debounce requests
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (value.includes('/')) {
            debounceRef.current = setTimeout(() => {
                requestSuggestions(value);
            }, 300);
        } else {
            setPathSuggestions([]);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (pathInputFocus !== index || pathSuggestions.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveSuggestionIndex(prev => (prev + 1) % pathSuggestions.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveSuggestionIndex(prev => (prev - 1 + pathSuggestions.length) % pathSuggestions.length);
        } else if (e.key === 'Tab' || e.key === 'Enter') {
            if (activeSuggestionIndex >= 0 && pathSuggestions[activeSuggestionIndex]) {
                e.preventDefault();
                const selected = pathSuggestions[activeSuggestionIndex];
                const currentVal = editingPaths[index];
                // Replace basename with selection
                const dir = currentVal.endsWith('/') ? currentVal : currentVal.substring(0, currentVal.lastIndexOf('/')) || '/';
                const newPath = (dir.endsWith('/') ? dir : dir + '/') + selected.name + '/';

                const newPaths = [...editingPaths];
                newPaths[index] = newPath;
                setEditingPaths(newPaths);

                setActiveSuggestionIndex(-1);
                requestSuggestions(newPath);
            }
        } else if (e.key === 'Escape') {
            setPathSuggestions([]);
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
                        <img
                            src={nowPlaying.imageUrl}
                            alt={nowPlaying.name}
                            className="w-full h-full object-cover"
                        />
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
                        {games.length === 0 && !loading && (
                            <div className="col-span-full text-center text-gray-500 py-10">
                                No Steam games found.
                            </div>
                        )}
                        {games.map((game) => (
                            <div key={game.appid} className="group relative aspect-[600/900] bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all hover:scale-105">
                                <img
                                    src={game.imageUrl}
                                    alt={game.name}
                                    loading="lazy"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        // Fallback if image fails
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                    }}
                                />
                                {/* Fallback Title if Image Breaks */}
                                <div className="hidden absolute inset-0 flex items-center justify-center p-2 text-center bg-gray-800">
                                    <span className="text-xs font-semibold text-gray-300">{game.name}</span>
                                </div>

                                {/* Hover Overlay */}
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
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto custom-scrollbar shadow-2xl relative">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold flex items-center gap-2">
                                <FolderOpen size={20} className="text-indigo-400" />
                                Steam Library Paths
                            </h3>
                            <button
                                onClick={() => setShowConfig(false)}
                                className="p-1 hover:bg-gray-800 rounded-lg transition-colors"
                            >
                                <X size={20} className="text-gray-400" />
                            </button>
                        </div>

                        <p className="text-sm text-gray-400 mb-4">
                            Configure the paths where your Steam library folders are located.
                            These should point to the root Steam library directories (e.g., /mnt/games/SteamLibrary).
                            Leave empty to use auto-detection.
                        </p>

                        <div className="space-y-3 mb-4">
                            {editingPaths.length === 0 ? (
                                <div className="text-gray-500 text-sm italic p-4 bg-gray-800/50 rounded-lg text-center">
                                    No paths configured. Using auto-detection.
                                </div>
                            ) : (
                                editingPaths.map((path, index) => (
                                    <div key={index} className="flex gap-2 relative">
                                        <input
                                            ref={el => { inputRefs.current[index] = el }}
                                            type="text"
                                            value={path}
                                            onChange={(e) => handlePathChange(index, e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, index)}
                                            onFocus={() => setPathInputFocus(index)}
                                            onBlur={() => setTimeout(() => setPathInputFocus(-1), 200)}
                                            placeholder="/home/user/.local/share/Steam"
                                            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                                        />
                                        <button
                                            onClick={() => handleRemovePath(index)}
                                            className="p-2 bg-red-900/30 hover:bg-red-900/50 border border-red-700 rounded-lg transition-colors"
                                            title="Remove path"
                                        >
                                            <X size={18} className="text-red-400" />
                                        </button>
                                    </div>
                                ))
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
                            <button
                                onClick={() => setShowConfig(false)}
                                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSavePaths}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                            >
                                Save & Rescan
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {pathInputFocus !== -1 && pathSuggestions.length > 0 && dropdownRect && createPortal(
                <div
                    className="fixed z-[9999] bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto"
                    style={{
                        top: dropdownRect.top + 4,
                        left: dropdownRect.left,
                        width: dropdownRect.width
                    }}
                >
                    {pathSuggestions.filter(p => {
                        const currentVal = editingPaths[pathInputFocus] || '';
                        const dir = currentVal.endsWith('/') ? currentVal : currentVal.substring(0, currentVal.lastIndexOf('/')) || '/';
                        const basename = currentVal.replace(dir, '').replace(/^\//, '');
                        return p.name.startsWith(basename);
                    }).map((suggestion, i) => (
                        <div
                            key={suggestion.name}
                            className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 ${i === activeSuggestionIndex ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                const index = pathInputFocus;
                                const currentVal = editingPaths[index];
                                const dir = currentVal.endsWith('/') ? currentVal : currentVal.substring(0, currentVal.lastIndexOf('/')) || '/';
                                const newPath = (dir.endsWith('/') ? dir : dir + '/') + suggestion.name + '/';

                                const newPaths = [...editingPaths];
                                newPaths[index] = newPath;
                                setEditingPaths(newPaths);

                                setActiveSuggestionIndex(-1);
                                requestSuggestions(newPath);
                            }}
                        >
                            <FolderOpen size={14} className="text-gray-500" />
                            {suggestion.name}
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};

export default SteamWidget;
