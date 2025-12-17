import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';

export const CleanerWidget: React.FC = () => {
    const socket = useSocket();
    const { isSudo } = useAuth();
    const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
    const [output, setOutput] = useState<string>('');
    const [lastClean, setLastClean] = useState<string>('');

    useEffect(() => {
        if (!socket) return;
        socket.on('system:clean-status', (data: { status: string, output?: string }) => {
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
        return () => { socket.off('system:clean-status'); };
    }, [socket]);

    const runClean = () => {
        if (!isSudo) return;
        socket?.emit('system:clean');
    };

    return (
        <div className="h-full flex flex-col p-4">
            <h2 className="text-xl font-semibold mb-2 text-white">System Cleaner</h2>
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                {status === 'idle' && (
                    <>
                        <p className="text-gray-400 text-sm text-center">Clean system cache & unused files.</p>
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
