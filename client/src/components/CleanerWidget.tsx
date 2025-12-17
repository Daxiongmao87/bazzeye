import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import { Clock, Calendar, Settings } from 'lucide-react';

interface ScheduleConfig {
    enabled: boolean;
    intervalHours: number;
    lastRun: string | null;
    nextRun: string | null;
}

const INTERVAL_OPTIONS = [
    { label: 'Every 6 hours', value: 6 },
    { label: 'Daily (24h)', value: 24 },
    { label: 'Weekly (168h)', value: 168 },
    { label: 'Monthly (720h)', value: 720 },
];

export const CleanerWidget: React.FC = () => {
    const socket = useSocket();
    const { isSudo } = useAuth();
    const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [output, setOutput] = useState<string>('');
    const [lastClean, setLastClean] = useState<string>('');

    // Schedule state
    const [schedule, setSchedule] = useState<ScheduleConfig>({
        enabled: false,
        intervalHours: 24,
        lastRun: null,
        nextRun: null
    });
    const [showScheduleConfig, setShowScheduleConfig] = useState(false);

    useEffect(() => {
        if (!socket) return;

        // Request schedule on mount
        socket.emit('cleaner:get-schedule');

        socket.on('system:clean-status', (data: { status: string, output?: string, scheduled?: boolean }) => {
            if (data.status === 'running') setStatus('running');
            else if (data.status === 'success') {
                setStatus('success');
                setOutput(String(data.output || 'Complete'));
                setLastClean(new Date().toLocaleTimeString());
            } else if (data.status === 'error') {
                setStatus('error');
                setOutput(String(data.output || 'Error'));
            }
        });

        socket.on('cleaner:schedule-status', (data: ScheduleConfig) => {
            setSchedule(data);
        });

        return () => {
            socket.off('system:clean-status');
            socket.off('cleaner:schedule-status');
        };
    }, [socket]);

    const runClean = () => {
        if (!isSudo) return;
        socket?.emit('system:clean');
    };

    const updateSchedule = (enabled: boolean, intervalHours: number) => {
        if (!isSudo) return;
        socket?.emit('cleaner:set-schedule', { enabled, intervalHours });
    };

    const formatDateTime = (isoString: string | null) => {
        if (!isoString) return 'Never';
        const date = new Date(isoString);
        return date.toLocaleString();
    };

    return (
        <div className="h-full flex flex-col p-4">
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-semibold text-white">System Cleaner</h2>
                {isSudo && (
                    <button
                        onClick={() => setShowScheduleConfig(!showScheduleConfig)}
                        className={`p-1.5 rounded transition-colors ${showScheduleConfig ? 'bg-teal-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
                        title="Schedule Settings"
                    >
                        <Settings size={16} />
                    </button>
                )}
            </div>

            {/* Schedule Config Panel */}
            {showScheduleConfig && isSudo && (
                <div className="mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-gray-300 flex items-center gap-2">
                            <Clock size={14} />
                            Auto Clean Schedule
                        </span>
                        <button
                            onClick={() => updateSchedule(!schedule.enabled, schedule.intervalHours)}
                            className={`relative w-10 h-5 rounded-full transition-colors ${schedule.enabled ? 'bg-teal-600' : 'bg-gray-600'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${schedule.enabled ? 'translate-x-5' : ''}`} />
                        </button>
                    </div>

                    {schedule.enabled && (
                        <>
                            <div className="mb-3">
                                <label className="text-xs text-gray-500 uppercase mb-1 block">Interval</label>
                                <select
                                    value={schedule.intervalHours}
                                    onChange={(e) => updateSchedule(true, parseInt(e.target.value))}
                                    className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-teal-500 focus:outline-none"
                                >
                                    {INTERVAL_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="text-xs text-gray-400 space-y-1">
                                <div className="flex justify-between">
                                    <span className="flex items-center gap-1"><Calendar size={10} /> Next Run:</span>
                                    <span className="text-teal-400">{formatDateTime(schedule.nextRun)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Last Run:</span>
                                    <span className="text-gray-500">{formatDateTime(schedule.lastRun)}</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                {status === 'idle' && (
                    <>
                        <p className="text-gray-400 text-sm text-center">Clean system cache & unused files.</p>
                        {schedule.enabled && (
                            <div className="text-xs text-teal-500/80 flex items-center gap-1">
                                <Clock size={12} />
                                Next: {formatDateTime(schedule.nextRun)}
                            </div>
                        )}
                        {lastClean && <p className="text-xs text-gray-500">Last: {lastClean}</p>}
                        <button
                            onClick={runClean}
                            disabled={!isSudo}
                            className={`px-4 py-2 rounded font-bold ${isSudo ? 'bg-teal-600 hover:bg-teal-500 text-white' : 'bg-gray-700 text-gray-500'}`}
                        >
                            {isSudo ? 'Clean Now' : 'Sudo Required'}
                        </button>
                    </>
                )}
                {status === 'running' && (
                    <div className="text-teal-400 animate-pulse">Cleaning...</div>
                )}
                {(status === 'success' || status === 'error') && (
                    <div className="flex flex-col w-full h-full">
                        <div className={`font-bold text-center ${status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                            {status === 'success' ? 'Done' : 'Failed'}
                        </div>
                        <pre className="flex-1 bg-black/30 p-2 text-xs text-gray-400 overflow-auto whitespace-pre-wrap mt-2 font-mono">
                            {output}
                        </pre>
                        <button onClick={() => setStatus('idle')} className="mt-2 text-xs bg-gray-800 p-2 rounded text-gray-300">Back</button>
                    </div>
                )}
            </div>
        </div>
    );
};
