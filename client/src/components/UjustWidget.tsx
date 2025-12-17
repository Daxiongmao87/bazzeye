
import React, { useEffect, useState } from 'react';
import { socket } from '../socket';
import { Terminal, Activity } from 'lucide-react';

export const UjustWidget: React.FC = () => {
    const [recipes, setRecipes] = useState<Record<string, string[]>>({});
    const [status, setStatus] = useState<{ recipe: string, status: string, error?: string } | null>(null);

    useEffect(() => {
        socket.emit('ujust:list');

        const handleList = (data: Record<string, string[]>) => {
            setRecipes(data);
        };

        const handleStatus = (data: { recipe: string, status: string, error?: string }) => {
            setStatus(data);
            // Clear status after 3s
            setTimeout(() => setStatus(null), 3000);
        };

        socket.on('ujust:list-data', handleList);
        socket.on('ujust:status', handleStatus);

        return () => {
            socket.off('ujust:list-data', handleList);
            socket.off('ujust:status', handleStatus);
        };
    }, []);

    const execute = (recipe: string) => {
        socket.emit('ujust:execute', { recipe });
    };

    return (
        <div className="h-full flex flex-col p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2 text-zinc-100">
                    <Terminal size={20} className="text-blue-400" />
                    Ujust Commands
                </h2>
                {status && (
                    <div className={`px-2 py-0.5 rounded text-xs ${status.status === 'error' ? 'bg-red-900/50 text-red-200' : 'bg-green-900/50 text-green-200'}`}>
                        {status.status === 'error' ? 'Error' : 'Sent'}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                {Object.entries(recipes).map(([category, items]) => (
                    <div key={category} className="mb-4">
                        <h3 className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-2 sticky top-0 bg-gray-900/95 py-1 z-10 backdrop-blur-sm">
                            {category}
                        </h3>
                        <div className="grid grid-cols-1 gap-2">
                            {items.map(recipe => (
                                <button
                                    key={recipe}
                                    className="flex items-center justify-between text-left px-3 py-2 rounded border border-zinc-800 bg-zinc-800/30 hover:bg-zinc-800 hover:text-white text-zinc-300 text-sm transition-colors group"
                                    onClick={() => execute(recipe)}
                                >
                                    <span className="truncate">{recipe}</span>
                                    <Activity size={14} className="opacity-0 group-hover:opacity-100 text-blue-400 transition-opacity" />
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
                {Object.keys(recipes).length === 0 && (
                    <div className="text-zinc-500 text-center py-8 text-sm">Loading recipes...</div>
                )}
            </div>
        </div>
    );
};
