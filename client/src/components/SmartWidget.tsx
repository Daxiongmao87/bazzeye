
import React, { useEffect, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { Activity, AlertTriangle, CheckCircle } from 'lucide-react';

interface SmartData {
    device: string;
    model: string;
    passed: boolean;
    temp: number;
    powerOnHours: number;
}

const SmartWidget: React.FC = () => {
    const socket = useSocket();
    const [drives, setDrives] = useState<SmartData[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastScan, setLastScan] = useState<string>('Never');

    const scan = () => {
        setLoading(true);
        socket?.emit('system:request-smart');
    };

    useEffect(() => {
        if (!socket) return;

        // Initial request
        socket.emit('system:request-smart-status');

        socket.on('system:smart-status-update', (data: SmartData[]) => {
            setDrives(data);
            setLoading(false);
            setLastScan(new Date().toLocaleTimeString());
        });

        return () => { socket.off('system:smart-status-update'); };
    }, [socket]);

    return (
        <div className="h-full flex flex-col p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Activity size={20} className="text-green-500" /> Drive Health
                </h2>
                <button
                    onClick={scan}
                    disabled={loading}
                    className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded border border-gray-700 transition"
                >
                    {loading ? 'Scanning...' : 'Scan Now'}
                </button>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar space-y-3">
                {drives.length === 0 && !loading && (
                    <div className="text-gray-500 text-sm text-center italic mt-10">No drive data available.</div>
                )}

                {drives.map((drive, idx) => (
                    <div key={idx} className="bg-gray-900/50 border border-gray-700 rounded p-3 flex flex-col gap-1">
                        <div className="flex justify-between items-start">
                            <span className="font-semibold text-sm text-gray-200">{drive.model}</span>
                            {drive.passed ? (
                                <span className="flex items-center gap-1 text-green-400 text-xs bg-green-900/20 px-1.5 py-0.5 rounded"><CheckCircle size={10} /> OK</span>
                            ) : (
                                <span className="flex items-center gap-1 text-red-400 text-xs bg-red-900/20 px-1.5 py-0.5 rounded"><AlertTriangle size={10} /> FAIL</span>
                            )}
                        </div>
                        <div className="text-xs text-gray-500">{drive.device}</div>

                        <div className="flex justify-between mt-2 text-xs text-gray-400">
                            <span>Temp: <span className={drive.temp > 50 ? 'text-yellow-400' : 'text-blue-300'}>{drive.temp}°C</span></span>
                            <span>Hours: {drive.powerOnHours}h</span>
                        </div>
                    </div>
                ))}
            </div>
            <div className="text-[10px] text-gray-600 mt-2 text-right">
                Last Clean Scan: {lastScan}
            </div>
        </div>
    );
};

export default SmartWidget;
