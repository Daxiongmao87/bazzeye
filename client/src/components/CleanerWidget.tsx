import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { Sparkles, Play, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const CleanerWidget: React.FC = () => {
    const socket = useSocket();
    const { isSudo } = useAuth();
    const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [output, setOutput] = useState<string>('');

    // In a real app we'd load this from backend persistence
    const [autoClean, setAutoClean] = useState(false);
    const [lastClean, setLastClean] = useState<string | null>(null);

    useEffect(() => {
        if (!socket) return;

        socket.on('system:clean-status', (data: { status: string, output?: string }) => {
            if (data.status === 'running') {
                setStatus('running');
            } else if (data.status === 'success') {
                setStatus('success');
                setOutput(data.output || 'System clean completed.');
                setLastClean(new Date().toLocaleString());
            } else if (data.status === 'error') {
                setStatus('error');
                setOutput(data.output || 'Unknown error');
            }
        });

        return () => {
            socket.off('system:clean-status');
        };
    }, [socket]);

    const runClean = () => {
        if (!isSudo) return;
        socket?.emit('system:clean');
    };

    return (
        <div className="h-full flex flex-col p-4 bg-gray-900/50">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2 text-zinc-100">
                    <Sparkles size={20} className="text-teal-400" />
                    System Cleaner
                </h2>
                {isSudo && (
                    <button
                        onClick={() => setAutoClean(!autoClean)}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${autoClean ? 'bg-teal-900/50 border-teal-500 text-teal-300' : 'bg-gray-800 border-gray-700 text-gray-500'
                            }`}
                        title="Toggle Weekly Auto-Clean"
                    >
                        Auto-Clean: {autoClean ? 'ON' : 'OFF'}
                    </button>
                )}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                {status === 'idle' && (
                    <>
                        <div className="text-center text-gray-400 text-sm">
                            <p className="mb-2">Removes unused containers, flatpaks, and cache.</p>
                            {lastClean && <p className="text-xs text-gray-600">Last run: {lastClean}</p>}
                        </div>
                        <button
                            onClick={runClean}
                            disabled={!isSudo}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${isSudo
                                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:scale-105 shadow-lg shadow-teal-900/50 text-white'
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                                }`}
                        >
                            <Play size={18} fill="currentColor" />
                            {isSudo ? 'Clean System Now' : 'Sudo Required'}
                        </button>
                    </>
                )}

                {status === 'running' && (
                    <div className="text-center space-y-3">
                        <Loader2 size={40} className="animate-spin text-teal-500 mx-auto" />
                        <p className="text-teal-200 animate-pulse">Cleaning system...</p>
                        <p className="text-xs text-gray-500">This may take a minute</p>
                    </div>
                )}

                {(status === 'success' || status === 'error') && (
                    <div className="w-full h-full flex flex-col">
                        <div className={`text-center mb-2 flex flex-col items-center ${status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                            {status === 'success' ? <CheckCircle size={32} /> : <AlertTriangle size={32} />}
                            <span className="font-bold mt-1">{status === 'success' ? 'Clean Complete' : 'Clean Failed'}</span>
                        </div>
                        <div className="flex-1 bg-black/30 rounded p-2 text-xs font-mono text-gray-400 overflow-auto whitespace-pre-wrap custom-scrollbar">
                            {output}
                        </div>
                        <button
                            onClick={() => setStatus('idle')}
                            className="mt-3 w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded text-sm transition-colors"
                        >
                            Back
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
