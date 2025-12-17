
import React from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { Power, ActivitySquare, AlertTriangle, RefreshCw } from 'lucide-react';

const SystemControlWidget: React.FC = () => {
    const socket = useSocket();
    const { isSudo } = useAuth();
    const [updateAvailable, setUpdateAvailable] = React.useState(false);
    const [updateStatus, setUpdateStatus] = React.useState<'idle' | 'started' | 'complete' | 'error'>('idle');

    React.useEffect(() => {
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
                setUpdateStatus('idle'); // allow retry
            }
        });

        return () => {
            socket.off('system:update-available');
            socket.off('system:update-status');
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

    return (
        <div className="h-full flex flex-col p-4">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <ActivitySquare size={20} className="text-red-400" /> System Controls
            </h2>

            <div className="flex flex-col gap-4">
                <button
                    onClick={handleReboot}
                    disabled={!isSudo}
                    className={`w-full py-4 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 transition-transform active:scale-95 ${isSudo
                        ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/20'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
                        }`}
                >
                    <Power size={24} /> REBOOT SYSTEM
                </button>
                <button
                    onClick={handleShutdown}
                    disabled={!isSudo}
                    className={`w-full py-4 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 transition-transform active:scale-95 ${isSudo
                        ? 'bg-red-900 hover:bg-red-950 text-white shadow-lg shadow-red-900/30 ring-1 ring-red-700'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
                        }`}
                >
                    <Power size={24} /> SHUTDOWN SYSTEM
                </button>
                <button
                    onClick={handleUpdate}
                    disabled={!isSudo || updateStatus === 'started' || !updateAvailable}
                    className={`w-full py-4 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 transition-transform active:scale-95 ${isSudo && updateAvailable
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20'
                            : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                        }`}
                >
                    <RefreshCw size={24} className={updateStatus === 'started' ? 'animate-spin' : ''} />
                    {updateStatus === 'started' ? 'UPDATING...' : updateAvailable ? 'UPDATE SYSTEM' : 'NO UPDATES'}
                </button>
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
