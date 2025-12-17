import React, { useEffect, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { Gamepad2 } from 'lucide-react';

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

    useEffect(() => {
        if (!socket) return;

        socket.emit('steam:request-games');

        socket.on('steam:games', (data: SteamGame[]) => {
            setGames(data);
            setLoading(false);
        });

        socket.on('steam:now-playing', (game: SteamGame | null) => {
            setNowPlaying(game);
        });

        return () => {
            socket.off('steam:games');
            socket.off('steam:now-playing');
        };
    }, [socket]);

    return (
        <div className="h-full flex flex-col p-4">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Gamepad2 size={20} className="text-indigo-400" /> Steam Library ({games.length})
            </h2>

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
        </div>
    );
};

export default SteamWidget;
