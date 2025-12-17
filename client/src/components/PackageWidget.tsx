import React, { useEffect, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { Package, Search, Trash2, Download, CheckCircle, AlertTriangle } from 'lucide-react';

interface PackageInfo {
    name: string;
    summary: string;
    arch?: string;
}

export const PackageWidget: React.FC = () => {
    const socket = useSocket();
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<PackageInfo[]>([]);
    const [layeredPkgs, setLayeredPkgs] = useState<string[]>([]);
    const [currentAction, setCurrentAction] = useState<{ pkg: string, status: string } | null>(null);
    const [activeTab, setActiveTab] = useState<'search' | 'installed'>('search');

    useEffect(() => {
        if (!socket) return;
        socket.emit('package:list-layered');

        const handleResults = (data: PackageInfo[]) => setSearchResults(data);
        const handleLayered = (data: string[]) => setLayeredPkgs(data);
        const handleStatus = (data: { pkg: string, status: string, error?: string }) => {
            setCurrentAction(data);
            if (data.status === 'installed' || data.status === 'uninstalled' || data.status === 'error') {
                setTimeout(() => setCurrentAction(null), 5000);
            }
        };

        socket.on('package:search-results', handleResults);
        socket.on('package:layered-list', handleLayered);
        socket.on('package:status', handleStatus);

        return () => {
            socket.off('package:search-results', handleResults);
            socket.off('package:layered-list', handleLayered);
            socket.off('package:status', handleStatus);
        };
    }, [socket]);

    const search = () => {
        if (!query) return;
        setSearchResults([]); // clear prev
        socket.emit('package:search', query);
    };

    const install = (pkg: string) => {
        if (confirm(`Install ${pkg}? This may take a while.`)) {
            socket.emit('package:install', pkg);
        }
    };

    const uninstall = (pkg: string) => {
        if (confirm(`Uninstall ${pkg}? This requires reboot to finish.`)) {
            socket.emit('package:uninstall', pkg);
        }
    };

    return (
        <div className="h-full flex flex-col p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2 text-zinc-100">
                    <Package size={20} className="text-purple-400" />
                    Packages
                </h2>
                <div className="flex bg-zinc-800 rounded p-1">
                    <button
                        onClick={() => setActiveTab('search')}
                        className={`text-xs px-3 py-1 rounded transition-colors ${activeTab === 'search' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                        Search
                    </button>
                    <button
                        onClick={() => setActiveTab('installed')}
                        className={`text-xs px-3 py-1 rounded transition-colors ${activeTab === 'installed' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                        Installed ({layeredPkgs.length})
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {activeTab === 'search' ? (
                    <>
                        <div className="flex gap-2 mb-4">
                            <input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && search()}
                                placeholder="Search dnf..."
                                className="flex-1 h-9 bg-zinc-800 border border-zinc-700 rounded px-3 text-sm text-zinc-200 focus:outline-none focus:border-purple-500 placeholder-zinc-500"
                            />
                            <button onClick={search} className="bg-purple-600 hover:bg-purple-700 text-white h-9 px-3 rounded flex items-center justify-center transition-colors">
                                <Search size={16} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                            {currentAction && (
                                <div className="mb-2 p-2 rounded bg-blue-900/50 border border-blue-800 text-blue-200 text-xs flex items-center gap-2">
                                    <CheckCircle size={14} />
                                    <span>{currentAction.pkg}: {currentAction.status}</span>
                                </div>
                            )}
                            <div className="flex flex-col gap-2">
                                {searchResults.map(pkg => (
                                    <div key={pkg.name} className="p-3 rounded bg-zinc-800/40 border border-zinc-800/60 flex flex-col gap-1 hover:border-zinc-700 transition-colors">
                                        <div className="flex justify-between items-start">
                                            <span className="font-mono text-sm text-purple-300 font-bold">{pkg.name}</span>
                                            <button
                                                disabled={currentAction !== null}
                                                onClick={() => install(pkg.name)}
                                                className="px-2 py-1 text-xs bg-zinc-700 hover:bg-green-600 text-zinc-200 hover:text-white rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                                            >
                                                <Download size={12} /> Install
                                            </button>
                                        </div>
                                        <span className="text-xs text-zinc-500 truncate">{pkg.summary}</span>
                                    </div>
                                ))}
                                {searchResults.length === 0 && query && (
                                    <div className="text-zinc-500 text-xs text-center py-8">
                                        {query ? "No results found." : "Search for packages..."}
                                    </div>
                                )}
                                {!query && (
                                    <div className="text-zinc-500 text-xs text-center py-8">
                                        Enter a search term to find packages.
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                        <div className="flex flex-col gap-1">
                            {layeredPkgs.map(pkg => (
                                <div key={pkg} className="group flex justify-between items-center p-2 hover:bg-zinc-800/50 rounded border border-transparent hover:border-zinc-800 transition-all">
                                    <span className="font-mono text-sm text-zinc-300">{pkg}</span>
                                    <button
                                        onClick={() => uninstall(pkg)}
                                        className="h-6 w-6 flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded opacity-0 group-hover:opacity-100 transition-all"
                                        title="Uninstall"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                            {layeredPkgs.length === 0 && (
                                <div className="text-zinc-500 text-sm text-center py-8 flex flex-col items-center gap-2">
                                    <AlertTriangle size={24} className="text-zinc-600" />
                                    No layered packages found.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
