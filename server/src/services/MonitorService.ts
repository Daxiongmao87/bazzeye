
import si from 'systeminformation';
import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';

class MonitorService {
    private logger: winston.Logger;
    private history: any[] = [];
    private readonly MAX_HISTORY = 60; // 2 minutes at 2s interval

    constructor() {
        const logDir = path.join(__dirname, '../../logs');

        const transport = new winston.transports.DailyRotateFile({
            filename: 'system-%DATE%.log',
            dirname: logDir,
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d'
        });

        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                transport
            ]
        });
    }

    public getHistory() {
        return this.history;
    }

    public async getStats() {
        try {
            const [cpu, mem, fsSize, networkStats, osInfo, networkInterfaces] = await Promise.all([
                si.currentLoad(),
                si.mem(),
                si.fsSize(),
                si.networkStats(),
                si.osInfo(),
                si.networkInterfaces()
            ]);

            // Helper to find IP
            let localIp = 'Unknown';
            if (Array.isArray(networkInterfaces)) {
                const iface = networkInterfaces.find(i => !i.internal && i.ip4 && i.ip4 !== '127.0.0.1');
                if (iface) localIp = iface.ip4;
            }

            const stats = {
                timestamp: new Date().toISOString(),
                os: {
                    distro: osInfo.distro,
                    kernel: osInfo.kernel,
                    arch: osInfo.arch,
                    uptime: si.time().uptime
                },
                ip: { local: localIp },
                cpu: {
                    load: cpu.currentLoad,
                    temp: 0 // sysinfo temp often requires root or specific sensors
                },
                mem: {
                    total: mem.total,
                    used: mem.active
                },
                storage: fsSize.map(fs => ({
                    fs: fs.fs,
                    size: fs.size,
                    used: fs.used,
                    use: fs.use,
                    mount: fs.mount
                })),
                network: networkStats.map(ns => ({
                    iface: ns.iface,
                    rx_sec: ns.rx_sec,
                    tx_sec: ns.tx_sec
                }))
            };

            // Add to history
            this.history.push(stats);
            if (this.history.length > this.MAX_HISTORY) {
                this.history.shift();
            }

            // Log stats
            this.logger.info(stats);

            return stats;
        } catch (error) {
            console.error("Error gathering stats:", error);
            return null;
        }
    }

    public async getSysSpecs() {
        try {
            const [cpu, graphics, memLayout, os, system] = await Promise.all([
                si.cpu(),
                si.graphics(),
                si.memLayout(),
                si.osInfo(),
                si.system()
            ]);
            return {
                cpu: {
                    manufacturer: cpu.manufacturer,
                    brand: cpu.brand,
                    cores: cpu.cores,
                    speed: cpu.speed,
                },
                gpu: graphics.controllers.map(c => ({
                    model: c.model,
                    vram: c.vram,
                })),
                ram: memLayout.map(m => ({
                    size: m.size,
                    type: m.type,
                    clockSpeed: m.clockSpeed
                })),
                os: {
                    platform: os.platform,
                    distro: os.distro,
                    release: os.release,
                    kernel: os.kernel,
                    arch: os.arch
                },
                system: {
                    manufacturer: system.manufacturer,
                    model: system.model
                }
            };
        } catch (e) {
            console.error("Error getting specs", e);
            return null;
        }
    }
}

export const monitorService = new MonitorService();
