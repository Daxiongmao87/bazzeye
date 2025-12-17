import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { Terminal, RefreshCw, Volume2, Activity, FileText, Zap } from 'lucide-react';

interface UjustAction {
    id: string;
    label: string;
    icon: React.ElementType;
    description: string;
    color: string;
}

const ACTIONS: UjustAction[] = [
    { id: 'update', label: 'Update System', icon: RefreshCw, description: 'Update system packages and flatpaks', color: 'text-blue-400' },
    { id: 'fix-proton-hang', label: 'Fix Hanging Game', icon: Zap, description: 'Kill Wine/Proton processes', color: 'text-yellow-400' },
    { id: 'restart-pipewire', label: 'Restart Audio', icon: Volume2, description: 'Fix audio issues (Pipewire)', color: 'text-green-400' },
    { id: 'benchmark', label: 'Benchmark', icon: Activity, description: 'Run 1-minute system benchmark', color: 'text-purple-400' },
    { id: 'changelogs', label: 'Changelogs', icon: FileText, description: 'View system changelogs', color: 'text-gray-400' },
];

export const UjustWidget: React.FC = () => {
    const socket = useSocket();
    const [status, setStatus] = useState<{ recipe: string, status: string, error?: string } | null>(null);

    useEffect(() => {
        if (!socket) return;

        const handleStatus = (data: { recipe: string, status: string, error?: string }) => {
            setStatus(data);
            if (data.status !== 'running') {
                setTimeout(() => setStatus(null), 5000);
            }
        };

        socket.on('ujust:status', handleStatus);
        return () => { socket.off('ujust:status', handleStatus); };
    }, [socket]);

    const execute = (recipe: string) => {
        if (confirm(`Run 'ujust ${recipe}'?`)) {
            socket?.emit('ujust:execute', { recipe });
        }
    };

    return (
        <div className="h-full flex flex-col p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2 text-zinc-100">
                    <Terminal size={20} className="text-blue-400" />
                    System Actions
                </h2>
                {status && (
                    <div className={`px-2 py-0.5 rounded text-xs flex items-center gap-2 ${status.status === 'error' ? 'bg-red-900/50 text-red-200' :
                        status.status === 'running' ? 'bg-blue-900/50 text-blue-200' : 'bg-green-900/50 text-green-200'
                        }`}>
                        {status.status === 'running' && <RefreshCw size={12} className="animate-spin" />}
                        <span className="truncate max-w-[150px]">
                            {status.recipe}: {status.status}
                        </span>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ACTIONS.map(action => (
                        <button
                            key={action.id}
                            onClick={() => execute(action.id)}
                            disabled={status?.status === 'running'}
                            className="flex flex-col items-start p-3 rounded-lg bg-zinc-800/40 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <action.icon size={18} className={`${action.color} group-hover:scale-110 transition-transform`} />
                                <span className="font-semibold text-sm text-zinc-200">{action.label}</span>
                            </div>
                            <span className="text-xs text-zinc-500 group-hover:text-zinc-400">{action.description}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
