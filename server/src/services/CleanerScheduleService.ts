import fs from 'fs';
import path from 'path';

interface CleanerScheduleConfig {
    enabled: boolean;
    intervalHours: number; // e.g., 24 for daily, 168 for weekly
    lastRun: string | null; // ISO timestamp
}

class CleanerScheduleService {
    private configFile: string;
    private config: CleanerScheduleConfig = {
        enabled: false,
        intervalHours: 24,
        lastRun: null
    };
    private timer: NodeJS.Timeout | null = null;
    private io: any = null;
    private cleanFn: (() => Promise<{ success: boolean; output: string }>) | null = null;

    constructor() {
        const dataDir = path.join(process.env.HOME || '.', '.bazzeye-data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.configFile = path.join(dataDir, 'cleaner-schedule.json');
        this.load();
    }

    public setSocket(io: any) {
        this.io = io;
    }

    public setCleanFunction(fn: () => Promise<{ success: boolean; output: string }>) {
        this.cleanFn = fn;
        // Start timer if enabled
        if (this.config.enabled) {
            this.startTimer();
        }
    }

    private load() {
        try {
            if (fs.existsSync(this.configFile)) {
                const data = JSON.parse(fs.readFileSync(this.configFile, 'utf-8'));
                this.config = { ...this.config, ...data };
            }
        } catch (e) {
            console.error('[CleanerSchedule] Failed to load config:', e);
        }
    }

    private save() {
        try {
            fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
        } catch (e) {
            console.error('[CleanerSchedule] Failed to save config:', e);
        }
    }

    public getSchedule(): CleanerScheduleConfig & { nextRun: string | null } {
        return {
            ...this.config,
            nextRun: this.getNextRunTime()
        };
    }

    public setSchedule(enabled: boolean, intervalHours: number): CleanerScheduleConfig & { nextRun: string | null } {
        this.config.enabled = enabled;
        this.config.intervalHours = intervalHours;
        this.save();

        // Restart timer with new settings
        this.stopTimer();
        if (enabled) {
            this.startTimer();
        }

        return this.getSchedule();
    }

    private getNextRunTime(): string | null {
        if (!this.config.enabled) return null;

        const lastRun = this.config.lastRun ? new Date(this.config.lastRun) : new Date();
        const nextRun = new Date(lastRun.getTime() + this.config.intervalHours * 60 * 60 * 1000);
        return nextRun.toISOString();
    }

    private startTimer() {
        if (this.timer) this.stopTimer();

        const intervalMs = this.config.intervalHours * 60 * 60 * 1000;
        console.log(`[CleanerSchedule] Starting timer, interval: ${this.config.intervalHours}h`);

        this.timer = setInterval(async () => {
            await this.runScheduledClean();
        }, intervalMs);
    }

    private stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            console.log('[CleanerSchedule] Timer stopped');
        }
    }

    private async runScheduledClean() {
        if (!this.cleanFn) {
            console.error('[CleanerSchedule] No clean function registered');
            return;
        }

        console.log('[CleanerSchedule] Running scheduled clean...');

        // Broadcast running status
        if (this.io) {
            this.io.emit('system:clean-status', { status: 'running', scheduled: true });
        }

        try {
            const result = await this.cleanFn();
            this.config.lastRun = new Date().toISOString();
            this.save();

            if (this.io) {
                this.io.emit('system:clean-status', {
                    status: result.success ? 'success' : 'error',
                    output: result.output,
                    scheduled: true
                });
                // Also broadcast updated schedule info
                this.io.emit('cleaner:schedule-status', this.getSchedule());
            }
        } catch (e) {
            console.error('[CleanerSchedule] Scheduled clean failed:', e);
            if (this.io) {
                this.io.emit('system:clean-status', {
                    status: 'error',
                    output: e instanceof Error ? e.message : String(e),
                    scheduled: true
                });
            }
        }
    }

    public destroy() {
        this.stopTimer();
    }
}

export const cleanerScheduleService = new CleanerScheduleService();
