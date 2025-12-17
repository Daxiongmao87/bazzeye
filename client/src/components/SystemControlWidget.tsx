
import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { Power, ActivitySquare, AlertTriangle, RefreshCw, Zap, Volume2, Activity, FileText } from 'lucide-react';

interface UjustStatus {
    recipe: string;
    status: string;
    error?: string;
}

const SystemControlWidget: React.FC = () => {
    const socket = useSocket();
    const { isSudo } = useAuth();
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'started' | 'complete' | 'error'>('idle');
    const [ujustStatus, setUjustStatus] = useState<UjustStatus | null>(null);

    useEffect(() => {
        if (!socket) return;

        socket.emit('system:check-update');

        socket.on('system:update-available', (available: boolean) => {
            setUpdateAvailable(available);
        });

        socket.on('system:update-status', (data: { status: string, error?: string }) => {
            setUpdateStatus(data.status as any);
            if (data.status === 'complete') {
                alert('System update complete. Please reboot.');
                setUpdateAvailable(false);
            }
            if (data.status === 'error') {
                alert('Update failed: ' + data.error);
                setUpdateStatus('idle');
            }
        });

        socket.on('ujust:status', (data: UjustStatus) => {
            setUjustStatus(data);
            if (data.status !== 'running') {
                setTimeout(() => setUjustStatus(null), 5000);
            }
        });

        return () => {
            socket.off('system:update-available');
            socket.off('system:update-status');
            socket.off('ujust:status');
        };
    }, [socket]);

    const handleUpdate = () => {
        if (confirm('This will update the system using ujust. Proceed?')) {
            socket?.emit('system:control', { action: 'update' });
        }
    };
    const handleReboot = () => {
        if (confirm('Are you sure you want to REBOOT the system?')) {
            socket?.emit('system:control', { action: 'reboot' });
        }
    };
    const handleShutdown = () => {
        if (confirm('Are you sure you want to SHUTDOWN the system?')) {
            socket?.emit('system:control', { action: 'shutdown' });
        }
    };

    const executeUjust = (recipe: string, label: string) => {
        if (confirm(`Run '${label}'?`)) {
            socket?.emit('ujust:execute', { recipe });
        }
    };

    const isRunning = ujustStatus?.status === 'running' || updateStatus === 'started';

    return (
        <div className="h-full flex flex-col p-4 overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <ActivitySquare size={20} className="text-red-400" /> System Controls
                </h2>
                {ujustStatus && (
                    <div className={`px-2 py-0.5 rounded text-xs flex items-center gap-2 ${ujustStatus.status === 'error' ? 'bg-red-900/50 text-red-200' :
                            ujustStatus.status === 'running' ? 'bg-blue-900/50 text-blue-200' :
                                'bg-green-900/50 text-green-200'
                        }`}>
                        {ujustStatus.status === 'running' && <RefreshCw size={12} className="animate-spin" />}
                        <span className="truncate max-w-[100px]">{ujustStatus.recipe}: {ujustStatus.status}</span>
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-3">
                {/* Power Controls */}
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={handleReboot}
                        disabled={!isSudo}
                        className={`py-3 px-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-transform active:scale-95 text-sm ${isSudo
                            ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/20'
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'}`}
                    >
                        <Power size={18} /> Reboot
                    </button>
                    <button
                        onClick={handleShutdown}
                        disabled={!isSudo}
                        className={`py-3 px-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-transform active:scale-95 text-sm ${isSudo
                            ? 'bg-red-900 hover:bg-red-950 text-white ring-1 ring-red-700'
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'}`}
                    >
                        <Power size={18} /> Shutdown
                    </button>
                </div>

                {/* Update Button */}
                <button
                    onClick={handleUpdate}
                    disabled={!isSudo || updateStatus === 'started' || !updateAvailable}
                    className={`w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 transition-transform active:scale-95 ${isSudo && updateAvailable
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20'
                        : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'}`}
                >
                    <RefreshCw size={18} className={updateStatus === 'started' ? 'animate-spin' : ''} />
                    {updateStatus === 'started' ? 'Updating...' : updateAvailable ? 'Update System' : 'No Updates'}
                </button>

                {/* Divider */}
                <div className="border-t border-gray-700 my-1"></div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => executeUjust('fix-proton-hang', 'Fix Hanging Game')}
                        disabled={!isSudo || isRunning}
                        className="flex flex-col items-start p-2 rounded-lg bg-zinc-800/40 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex items-center gap-2 mb-0.5">
                            <Zap size={14} className="text-yellow-400" />
                            <span className="font-medium text-xs text-zinc-200">Fix Hang</span>
                        </div>
                        <span className="text-[10px] text-zinc-500">Kill Wine/Proton</span>
                    </button>
                    <button
                        onClick={() => executeUjust('restart-pipewire', 'Restart Audio')}
                        disabled={!isSudo || isRunning}
                        className="flex flex-col items-start p-2 rounded-lg bg-zinc-800/40 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex items-center gap-2 mb-0.5">
                            <Volume2 size={14} className="text-green-400" />
                            <span className="font-medium text-xs text-zinc-200">Audio</span>
                        </div>
                        <span className="text-[10px] text-zinc-500">Restart Pipewire</span>
                    </button>
                    <button
                        onClick={() => executeUjust('benchmark', 'Benchmark')}
                        disabled={!isSudo || isRunning}
                        className="flex flex-col items-start p-2 rounded-lg bg-zinc-800/40 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex items-center gap-2 mb-0.5">
                            <Activity size={14} className="text-purple-400" />
                            <span className="font-medium text-xs text-zinc-200">Benchmark</span>
                        </div>
                        <span className="text-[10px] text-zinc-500">1-min stress test</span>
                    </button>
                    <button
                        onClick={() => executeUjust('changelogs', 'View Changelogs')}
                        disabled={isRunning}
                        className="flex flex-col items-start p-2 rounded-lg bg-zinc-800/40 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex items-center gap-2 mb-0.5">
                            <FileText size={14} className="text-gray-400" />
                            <span className="font-medium text-xs text-zinc-200">Changelogs</span>
                        </div>
                        <span className="text-[10px] text-zinc-500">View updates</span>
                    </button>
                </div>
            </div>

            <div className="mt-auto pt-4 text-center">
                {!isSudo && (
                    <p className="text-xs text-yellow-500/80 flex items-center justify-center gap-1">
                        <AlertTriangle size={12} /> Sudo Mode required for actions
                    </p>
                )}
            </div>
        </div>
    );
};

export default SystemControlWidget;
