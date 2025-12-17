import React, { useEffect, useState, useContext, createContext } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Activity, HardDrive, Cpu, MemoryStick, CircuitBoard, Monitor } from 'lucide-react';

interface SystemStats {
    timestamp: string;
    os?: { distro: string, kernel: string, arch: string, uptime: number };
    ip?: { local: string };
    cpu: { load: number, temp: number };
    mem: { total: number, used: number };
    io?: { read_sec: number, write_sec: number };
    networkTotal?: { rx_sec: number, tx_sec: number };
    storage: { fs: string, size: number, used: number, use: number, mount?: string }[];
    network: { iface: string, rx_sec: number, tx_sec: number }[];
}

interface SysSpecs {
    cpu: { manufacturer: string, brand: string, cores: number, speed: number };
    gpu: { model: string, vram: number }[];
    ram: { size: number, type: string, clockSpeed: number }[];
    os: { platform: string, distro: string, release: string, kernel: string, arch: string };
    system: { manufacturer: string, model: string };
}

interface SystemData {
    stats: SystemStats | null;
    specs: SysSpecs | null;
    bios: { vendor: string, version: string, date: string, product: string } | null;
    history: any[];
}

const SystemDataContext = createContext<SystemData>({ stats: null, specs: null, bios: null, history: [] });

export const useSystemData = () => useContext(SystemDataContext);

export const SystemDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const socket = useSocket();
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [specs, setSpecs] = useState<SysSpecs | null>(null);
    const [bios, setBios] = useState<SystemData['bios']>(null);
    const [history, setHistory] = useState<any[]>([]);

    useEffect(() => {
        if (!socket) return;

        socket.emit('system:get-bios');
        socket.on('system:bios', (data: any) => {
            setBios(data);
        });

        socket.on('system-stats-history', (hist: SystemStats[]) => {
            const formatted = hist.map(data => ({
                time: new Date(data.timestamp).toLocaleTimeString(),
                cpu: data.cpu.load,
                mem: (data.mem.used / data.mem.total) * 100,
                temp: data.cpu.temp ?? 0,
                netMbps: ((data.networkTotal?.rx_sec ?? 0) + (data.networkTotal?.tx_sec ?? 0)) / 125000, // Convert to Mbps
                ioMBps: ((data.io?.read_sec ?? 0) + (data.io?.write_sec ?? 0)) / (1024 * 1024) // Convert to MB/s
            }));
            setHistory(formatted);
            // Also set latest stats from history if available
            if (hist.length > 0) {
                setStats(hist[hist.length - 1]);
            }
        });

        socket.on('system-stats', (data: SystemStats) => {
            setStats(data);
            setHistory(prev => {
                const newHistory = [...prev, {
                    time: new Date(data.timestamp).toLocaleTimeString(),
                    cpu: data.cpu.load,
                    mem: (data.mem.used / data.mem.total) * 100,
                    temp: data.cpu.temp ?? 0,
                    netMbps: ((data.networkTotal?.rx_sec ?? 0) + (data.networkTotal?.tx_sec ?? 0)) / 125000, // Convert to Mbps
                    ioMBps: ((data.io?.read_sec ?? 0) + (data.io?.write_sec ?? 0)) / (1024 * 1024) // Convert to MB/s
                }];
                return newHistory.slice(-60); // Keep last 60 points matches backend buffer
            });
        });

        // Request and listen for specs
        socket.emit('system:specs');
        socket.on('system:specs-data', (data: SysSpecs) => {
            setSpecs(data);
        });

        return () => {
            socket.off('system-stats');
            socket.off('system-stats-history');
            socket.off('system:specs-data');
            socket.off('system:bios');
        };
    }, [socket]);

    return (
        <SystemDataContext.Provider value={{ stats, specs, bios, history }}>
            {children}
        </SystemDataContext.Provider>
    );
};

export const SystemInfoWidget: React.FC = () => {
    const { stats, specs } = useSystemData();
    if (!stats?.os) return <div className="text-gray-400 p-4">Loading info...</div>;

    const formatUptime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    };

    const totalRam = specs ? specs.ram.reduce((acc, r) => acc + r.size, 0) / (1024 * 1024 * 1024) : 0;

    return (
        <div className="h-full flex flex-col p-4 overflow-y-auto custom-scrollbar">
            <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <CircuitBoard size={20} className="text-white" /> System Info
            </h2>

            <div className="space-y-4 text-sm">

                {/* Basic OS & Network */}
                <div className="bg-black/20 p-2 rounded">
                    <div className="text-xs text-gray-400 uppercase font-bold mb-1 flex items-center gap-1">
                        <Activity size={12} /> Status
                    </div>
                    <div className="flex justify-between border-b border-gray-700/50 pb-1 mb-1">
                        <span className="text-gray-400">Distro</span>
                        <span className="font-mono text-right">{stats.os.distro}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-700/50 pb-1 mb-1">
                        <span className="text-gray-400">Kernel</span>
                        <span className="font-mono text-right">{stats.os.kernel}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-700/50 pb-1 mb-1">
                        <span className="text-gray-400">Uptime</span>
                        <span className="font-mono text-green-400 text-right">{formatUptime(stats.os.uptime)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">IP</span>
                        <span className="font-mono text-blue-400 text-right">{stats.ip?.local || 'N/A'}</span>
                    </div>
                </div>

                {/* BIOS / Board Info */}
                <BiosSection />

                {/* Specs Section - conditional on specs loading */}
                {specs ? (
                    <>
                        {/* CPU */}
                        <div className="bg-black/20 p-2 rounded">
                            <div className="text-xs text-gray-400 uppercase font-bold mb-1 flex items-center gap-1">
                                <Cpu size={12} /> Processor
                            </div>
                            <div className="text-sm font-medium">{specs.cpu.brand}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{specs.cpu.cores} Cores @ {specs.cpu.speed}GHz</div>
                        </div>

                        {/* RAM */}
                        <div className="bg-black/20 p-2 rounded">
                            <div className="text-xs text-gray-400 uppercase font-bold mb-1 flex items-center gap-1">
                                <MemoryStick size={12} /> Memory
                            </div>
                            <div className="text-sm font-medium">{totalRam.toFixed(0)} GB Total</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                                {specs.ram.length} stick{specs.ram.length > 1 ? 's' : ''} • {specs.ram[0]?.type} @ {specs.ram[0]?.clockSpeed}MHz
                            </div>
                        </div>

                        {/* GPU */}
                        {specs.gpu.map((g, i) => (
                            <div key={i} className="bg-black/20 p-2 rounded">
                                <div className="text-xs text-gray-400 uppercase font-bold mb-1 flex items-center gap-1">
                                    <Monitor size={12} /> Graphics {i + 1}
                                </div>
                                <div className="text-sm font-medium">{g.model}</div>
                                {g.vram > 0 && <div className="text-xs text-gray-500 mt-0.5">{(g.vram / 1024).toFixed(1)} GB VRAM</div>}
                            </div>
                        ))}
                    </>
                ) : (
                    <div className="p-2 text-center text-gray-500 italic text-xs">
                        Loading hardware specs...
                    </div>
                )}

            </div>
        </div>
    );
};

const BiosSection: React.FC = () => {
    const { bios } = useSystemData();
    if (!bios) return null;
    return (
        <div className="bg-black/20 p-2 rounded">
            <div className="text-xs text-gray-400 uppercase font-bold mb-1 flex items-center gap-1">
                <CircuitBoard size={12} /> Hardware
            </div>
            <div className="flex justify-between border-b border-gray-700/50 pb-1 mb-1">
                <span className="text-gray-400">Product</span>
                <span className="font-mono text-right text-xs truncate max-w-[150px]" title={String(bios.product)}>{String(bios.product)}</span>
            </div>
            <div className="flex justify-between border-b border-gray-700/50 pb-1 mb-1">
                <span className="text-gray-400">Vendor</span>
                <span className="font-mono text-right text-xs truncate max-w-[150px]" title={String(bios.vendor)}>{String(bios.vendor)}</span>
            </div>
            <div className="flex justify-between">
                <span className="text-gray-400">BIOS</span>
                <span className="font-mono text-right text-xs">{String(bios.version)}</span>
            </div>
        </div>
    );
};


export interface AlertSettings {
    enabled: boolean;
    warningTemp: number;
    criticalTemp: number;
    sustainedSeconds: number;
}

// Breaking down for Grid
import { useAuth } from '../contexts/AuthContext';
import { Settings } from 'lucide-react';

export const CpuWidget: React.FC = () => {
    const { stats, history } = useSystemData();
    const socket = useSocket();
    const { isSudo } = useAuth();

    const [alertSettings, setAlertSettings] = useState<AlertSettings>({
        enabled: true, warningTemp: 80, criticalTemp: 95, sustainedSeconds: 60
    });
    const [showSettings, setShowSettings] = useState(false);

    const [alertLevel, setAlertLevel] = React.useState<'normal' | 'warning' | 'critical'>('normal');
    const warningStartTime = React.useRef<number | null>(null);
    const lastNotificationTime = React.useRef<number>(0);

    // Fetch Config on mount
    useEffect(() => {
        if (!socket) return;
        socket.emit('config:get');
        socket.on('config:data', (data: any) => {
            if (data && data.alerts) setAlertSettings(data.alerts);
        });
        socket.on('config:alerts-updated', (newAlerts: AlertSettings) => {
            setAlertSettings(newAlerts);
        });
        return () => {
            socket.off('config:data');
            socket.off('config:alerts-updated');
        }
    }, [socket]);

    const updateSettings = (updates: Partial<AlertSettings>) => {
        // Optimistic update
        const newVal = { ...alertSettings, ...updates };
        setAlertSettings(newVal);
        socket?.emit('config:update-alerts', updates);
    };

    // Alert Logic
    React.useEffect(() => {
        if (!stats || !alertSettings.enabled) {
            setAlertLevel('normal');
            warningStartTime.current = null;
            return;
        }

        const temp = stats.cpu.temp;
        const now = Date.now();

        // Check Critical
        if (temp >= alertSettings.criticalTemp) {
            setAlertLevel('critical');
            warningStartTime.current = null; // Reset warning timer

            if (now - lastNotificationTime.current > 60000) {
                if (Notification.permission === 'granted') {
                    new Notification('CRITICAL TEMPERATURE ALERT', {
                        body: `CPU Temperature is ${temp.toFixed(1)}°C!`,
                        icon: '/favicon.ico'
                    });
                    lastNotificationTime.current = now;
                }
            }
            return;
        }

        // Check Warning
        if (temp >= alertSettings.warningTemp) {
            if (warningStartTime.current === null) {
                warningStartTime.current = now;
            } else {
                const elapsedSeconds = (now - warningStartTime.current) / 1000;
                if (elapsedSeconds >= alertSettings.sustainedSeconds) {
                    setAlertLevel('warning');

                    if (now - lastNotificationTime.current > 300000) {
                        if (Notification.permission === 'granted') {
                            new Notification('Temperature Warning', {
                                body: `CPU Temperature sustained above ${alertSettings.warningTemp}°C for ${alertSettings.sustainedSeconds}s.`,
                            });
                            lastNotificationTime.current = now;
                        }
                    }
                }
            }
        } else {
            setAlertLevel('normal');
            warningStartTime.current = null;
        }

    }, [stats, alertSettings]);

    // Request notification permission on mount if enabled
    React.useEffect(() => {
        if (alertSettings.enabled && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, [alertSettings.enabled]);


    if (!stats) return <div className="text-gray-400 p-4">Loading stats...</div>;

    // Get latest values for display
    const latestNet = history.length > 0 ? history[history.length - 1].netMbps : 0;
    const latestIO = history.length > 0 ? history[history.length - 1].ioMBps : 0;

    // Calculate dynamic Y-axis max
    const calculateYMax = () => {
        if (history.length === 0) return 10;
        let maxVal = 0;
        for (const point of history) {
            maxVal = Math.max(maxVal, point.cpu ?? 0, point.mem ?? 0, point.temp ?? 0, point.netMbps ?? 0, point.ioMBps ?? 0);
        }
        return Math.max(10, Math.ceil(maxVal * 1.1));
    };
    const yMax = calculateYMax();

    const getBorderClass = () => {
        if (alertLevel === 'critical') return 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]';
        if (alertLevel === 'warning') return 'border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]';
        return '';
    };

    return (
        <div className={`h-full flex flex-col p-4 transition-all duration-300 rounded-xl ${getBorderClass()}`}>
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Activity size={20} className="text-blue-400" /> Performance
                </h2>
                <div className="flex items-center gap-4">
                    <div className="text-xs text-gray-400 flex gap-3">
                        <span>CPU: {stats.cpu.load.toFixed(1)}%</span>
                        <span>MEM: {((stats.mem.used / stats.mem.total) * 100).toFixed(1)}%</span>
                        {stats.cpu.temp > 0 && <span>Temp: {stats.cpu.temp.toFixed(0)}°C</span>}
                    </div>
                    {isSudo && (
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={`p-1 rounded transition-colors ${showSettings ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-400'}`}
                            title="Alert Settings"
                        >
                            <Settings size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* In-Context Settings Panel */}
            {showSettings && isSudo && (
                <div className="mb-4 p-3 bg-gray-800/80 rounded-lg border border-gray-700 text-xs backdrop-blur-sm relative z-10">
                    <div className="flex items-center justify-between mb-3">
                        <span className="font-bold text-gray-300">Temperature Alerts</span>
                        <label className="flex items-center cursor-pointer">
                            <div className="relative">
                                <input type="checkbox" className="sr-only" checked={alertSettings.enabled} onChange={e => updateSettings({ enabled: e.target.checked })} />
                                <div className={`block w-8 h-4 rounded-full transition-colors ${alertSettings.enabled ? 'bg-blue-600' : 'bg-gray-600'}`}></div>
                                <div className={`dot absolute left-1 top-0.5 bg-white w-3 h-3 rounded-full transition-transform ${alertSettings.enabled ? 'translate-x-4' : ''}`}></div>
                            </div>
                        </label>
                    </div>

                    {alertSettings.enabled && (
                        <div className="space-y-3">
                            <div>
                                <div className="flex justify-between text-gray-400 mb-1">
                                    <span>Warning Threshold</span>
                                    <span className="text-amber-400">{alertSettings.warningTemp}°C</span>
                                </div>
                                <input
                                    type="range" min="50" max="100" step="1"
                                    value={alertSettings.warningTemp}
                                    onChange={(e) => updateSettings({ warningTemp: parseInt(e.target.value) })}
                                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between text-gray-400 mb-1">
                                    <span>Critical Threshold</span>
                                    <span className="text-red-400">{alertSettings.criticalTemp}°C</span>
                                </div>
                                <input
                                    type="range" min="60" max="110" step="1"
                                    value={alertSettings.criticalTemp}
                                    onChange={(e) => updateSettings({ criticalTemp: parseInt(e.target.value) })}
                                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between text-gray-400 mb-1">
                                    <span>Sustained Duration</span>
                                    <span className="text-blue-400">{alertSettings.sustainedSeconds}s</span>
                                </div>
                                <input
                                    type="range" min="5" max="300" step="5"
                                    value={alertSettings.sustainedSeconds}
                                    onChange={(e) => updateSettings({ sustainedSeconds: parseInt(e.target.value) })}
                                    className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-2 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-1 rounded" style={{ backgroundColor: '#3b82f6' }}></span> CPU %</span>
                <span className="flex items-center gap-1"><span className="w-3 h-1 rounded" style={{ backgroundColor: '#10b981' }}></span> MEM %</span>
                <span className="flex items-center gap-1"><span className="w-3 h-1 rounded" style={{ backgroundColor: '#f59e0b' }}></span> Temp °C</span>
                <span className="flex items-center gap-1"><span className="w-3 h-1 rounded" style={{ backgroundColor: '#8b5cf6' }}></span> Net Mbps</span>
                <span className="flex items-center gap-1"><span className="w-3 h-1 rounded" style={{ backgroundColor: '#ec4899' }}></span> Disk MB/s</span>
            </div>
            <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="time" hide />
                        <YAxis domain={[0, yMax]} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151' }}
                            itemStyle={{ color: '#e5e7eb' }}
                            formatter={(value, name) => {
                                const v = typeof value === 'number' ? value : 0;
                                if (name === 'cpu' || name === 'mem') return [`${v.toFixed(1)}%`, name.toUpperCase()];
                                if (name === 'temp') return [`${v.toFixed(0)}°C`, 'Temp'];
                                if (name === 'netMbps') return [`${v.toFixed(2)} Mbps`, 'Network'];
                                if (name === 'ioMBps') return [`${v.toFixed(2)} MB/s`, 'Disk I/O'];
                                return [v, name];
                            }}
                        />
                        <Line type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="mem" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="temp" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="netMbps" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Line type="monotone" dataKey="ioMBps" stroke="#ec4899" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
            {/* Current values footer */}
            <div className="flex justify-between text-xs text-gray-500 mt-1 border-t border-gray-800 pt-1">
                <span>Net: {latestNet.toFixed(2)} Mbps</span>
                <span>Disk: {latestIO.toFixed(2)} MB/s</span>
            </div>
        </div>
    );
};

export const StorageWidget: React.FC = () => {
    const { stats } = useSystemData();
    if (!stats) return <div className="text-gray-400 p-4">Loading storage...</div>;
    return (
        <div className="h-full overflow-auto custom-scrollbar p-4">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <HardDrive size={20} className="text-purple-400" /> Storage
            </h2>
            <div className="space-y-4">
                {stats.storage.map((disk, i) => (
                    <div key={i}>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="truncate max-w-[48ch]" title={disk.mount || disk.fs}>{(disk.mount || disk.fs).slice(0, 48)}{(disk.mount || disk.fs).length > 48 ? '…' : ''}</span>
                            <span className="ml-2 flex-shrink-0">{disk.use.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                            <div
                                className="bg-purple-500 h-2 rounded-full"
                                style={{ width: `${disk.use}%` }}
                            ></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SystemDataProvider;
