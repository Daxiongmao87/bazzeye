
import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import {
    Folder, File, ArrowLeft, ArrowRight, ArrowUp,
    Loader, Upload, Download, Trash2, Home, HardDrive,
    Monitor, FileText, FolderOpen
} from 'lucide-react';

interface FileEntry {
    name: string;
    type: 'file' | 'directory';
    size: number;
    path: string;
}

const FileBrowserWidget: React.FC = () => {
    const socket = useSocket();

    // History Management
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const [currentPath, setCurrentPath] = useState<string>('');
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [addressBar, setAddressBar] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial Load
    useEffect(() => {
        if (!socket) return;
        navigateTo('/root'); // Default start

        socket.on('files:list-data', (data) => {
            setLoading(false);
            if (data.success) {
                setFiles(data.files);
                const normalizedPath = data.currentPath || '';
                setCurrentPath(normalizedPath);
                setAddressBar(normalizedPath);

                // Update History only if it's a new navigation (not just a refresh)
                setHistory(prev => {
                    const current = prev[historyIndex];
                    if (current !== normalizedPath) {
                        // Truncate future if we branched
                        const newHistory = prev.slice(0, historyIndex + 1);
                        newHistory.push(normalizedPath);
                        return newHistory;
                    }
                    return prev;
                });

            } else {
                setError(data.error);
                // If error, maybe don't update path?
            }
        });

        return () => { socket.off('files:list-data'); };
    }, [socket]);

    // Update history index when history changes (if length increased)
    useEffect(() => {
        if (history.length > 0 && history[history.length - 1] === currentPath) {
            setHistoryIndex(history.length - 1);
        }
    }, [history]);


    const navigateTo = (path: string, isHistoryNav = false) => {
        if (!path) return;
        setLoading(true);
        setError(null);
        socket?.emit('files:list', path);
        if (!isHistoryNav) {
            // We'll handle history update in the response to ensure path is valid
        }
    };

    const handleBack = () => {
        if (historyIndex > 0) {
            const prevPath = history[historyIndex - 1];
            setHistoryIndex(historyIndex - 1);
            navigateTo(prevPath, true);
        }
    };

    const handleForward = () => {
        if (historyIndex < history.length - 1) {
            const nextPath = history[historyIndex + 1];
            setHistoryIndex(historyIndex + 1);
            navigateTo(nextPath, true);
        }
    };

    const handleUp = () => {
        if (!currentPath || currentPath === '/') return;
        const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
        navigateTo(parent);
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const handleUploadClick = () => fileInputRef.current?.click();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentPath) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', currentPath);

        try {
            const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
            const res = await fetch(`${baseUrl}/api/files/upload`, {
                method: 'POST',
                body: formData
            });
            const json = await res.json();
            if (json.success) {
                navigateTo(currentPath, true); // Refresh
            } else {
                alert('Upload failed: ' + json.message);
            }
        } catch (err: any) {
            alert('Upload error: ' + err.message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Sidebar Items
    const places = [
        { name: 'Root', path: '/', icon: <HardDrive size={16} /> },
        { name: 'Home', path: '/root', icon: <Home size={16} /> },
        { name: 'Downloads', path: '/root/Downloads', icon: <Download size={16} /> },
        { name: 'Documents', path: '/root/Documents', icon: <FileText size={16} /> },
        { name: 'Projects', path: '/home/patrick/projects', icon: <Monitor size={16} /> },
    ];

    return (
        <div className="h-full flex flex-col bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
            {/* Header / Toolbar */}
            <div className="bg-gray-800 p-2 flex items-center gap-2 border-b border-gray-700">
                <div className="flex items-center gap-1">
                    <button onClick={handleBack} disabled={historyIndex <= 0} className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent">
                        <ArrowLeft size={16} />
                    </button>
                    <button onClick={handleForward} disabled={historyIndex >= history.length - 1} className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent">
                        <ArrowRight size={16} />
                    </button>
                    <button onClick={handleUp} disabled={!currentPath || currentPath === '/'} className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent">
                        <ArrowUp size={16} />
                    </button>
                </div>

                <div className="flex-1 bg-gray-900 rounded border border-gray-700 flex items-center px-2">
                    <FolderOpen size={14} className="text-gray-500 mr-2" />
                    <input
                        className="bg-transparent border-none w-full text-sm py-1.5 focus:outline-none text-gray-200"
                        value={addressBar}
                        onChange={(e) => setAddressBar(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && navigateTo(addressBar)}
                    />
                </div>

                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                <button onClick={handleUploadClick} disabled={uploading} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
                    {uploading ? <Loader size={16} className="animate-spin" /> : <Upload size={16} />}
                </button>
            </div>

            <div className="flex-1 flex min-h-0">
                {/* Sidebar */}
                <div className="w-48 bg-gray-800/50 border-r border-gray-700 flex flex-col p-2 gap-1 overflow-y-auto">
                    <div className="text-xs font-bold text-gray-500 px-2 py-1 uppercase tracking-wider">Places</div>
                    {places.map(p => (
                        <button
                            key={p.name}
                            onClick={() => navigateTo(p.path)}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${currentPath === p.path ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
                        >
                            {p.icon} {p.name}
                        </button>
                    ))}
                </div>

                {/* Main Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/20 p-2">
                    {loading ? (
                        <div className="flex items-center justify-center h-full text-gray-500 gap-2">
                            <Loader size={20} className="animate-spin" /> Reading directory...
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-full text-red-400 gap-2">
                            <div className="text-lg font-semibold">Access Error</div>
                            <div className="text-sm opacity-80">{error}</div>
                            <button onClick={handleUp} className="mt-4 px-4 py-2 bg-gray-800 rounded hover:bg-gray-700 text-white text-sm">Go Up</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-0.5">
                            {/* Header Row */}
                            <div className="grid grid-cols-[auto_1fr_100px_40px] gap-4 px-3 py-2 text-xs font-bold text-gray-500 border-b border-gray-800 uppercase tracking-wider sticky top-0 bg-gray-900/90 backdrop-blur z-10">
                                <span className="w-5"></span>
                                <span>Name</span>
                                <span className="text-right">Size</span>
                                <span></span>
                            </div>

                            {files.length === 0 && (
                                <div className="p-8 text-center text-gray-500 italic">Empty folder</div>
                            )}

                            {files.map(file => (
                                <div
                                    key={file.name}
                                    onClick={() => file.type === 'directory' && navigateTo(file.path)}
                                    className="grid grid-cols-[auto_1fr_100px_40px] items-center gap-4 px-3 py-2 rounded hover:bg-gray-800/80 cursor-pointer group transition-colors text-sm"
                                >
                                    <div className="w-5 flex justify-center">
                                        {file.type === 'directory' ? <Folder size={16} className="text-yellow-500 fill-yellow-500/20" /> : <File size={16} className="text-blue-400" />}
                                    </div>
                                    <div className="truncate text-gray-300 group-hover:text-white font-medium">{file.name}</div>
                                    <div className="text-right text-gray-500 font-mono text-xs">{file.type === 'file' ? formatSize(file.size) : '--'}</div>
                                    <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                        {file.type === 'file' && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    window.open(`http://${window.location.hostname}:3000/api/files/download?path=${encodeURIComponent(file.path)}`, '_blank');
                                                }}
                                                className="p-1 hover:text-blue-400 text-gray-500"
                                            >
                                                <Download size={14} />
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (confirm(`Delete ${file.name}?`)) socket?.emit('files:delete', { path: file.path });
                                            }}
                                            className="p-1 hover:text-red-400 text-gray-500"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FileBrowserWidget;
