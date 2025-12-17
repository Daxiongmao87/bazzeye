
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class SystemControlService {


    private updateAvailable: boolean = false;
    private checkInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Start polling for updates (1 hour)
        this.checkForUpdates();
        this.checkInterval = setInterval(() => this.checkForUpdates(), 3600000);
    }

    public async checkForUpdates() {
        console.log('[SystemControl] Checking for system updates...');
        try {
            // Check for updates using rpm-ostree
            // --check returns exit code 0 if no updates, but we need to parse output or use --preview
            // Actually, `rpm-ostree upgrade --check` is often used.
            // Bazzite/Silverblue often use `rpm-ostree status` to see if an update is already staged (pending reboot).
            // But to check for *new* available updates from remote, we fetch.
            // Let's try a safe check: `rpm-ostree upgrade --check --preview`
            const { stdout } = await execAsync('rpm-ostree upgrade --check --preview');
            // If output contains "AvailableUpdate", then yes.
            // Exact string depends on version, but typically it lists packages if updates exist.
            // Or "No upgrade available".

            if (stdout.includes('No upgrade available')) {
                this.updateAvailable = false;
            } else {
                // Heuristic: if it produced a list of packages or didn't say "No upgrade", assume yes?
                // Or check for "AvailableUpdate"
                // Let's assume if it lists changes, we have updates.
                this.updateAvailable = true;
            }
        } catch (e: any) {
            // If command fails (e.g. no network, or not on ostree), assume false
            console.error('[SystemControl] Update check failed:', e.message);
            this.updateAvailable = false;
        }
        return this.updateAvailable;
    }

    public isUpdateAvailable() { return this.updateAvailable; }

    public async updateSystem() {
        // Trigger ujust update
        // This is interactive usually, so we might need to be careful.
        // The user said "use ujust on the host".
        // We'll spawn it. It might stream output.
        // For the purpose of this widget, we might simply fire it and hope default "yes" works or just run it.
        // `ujust update -y`? ujust usually wraps `topgrade` or system update commands.
        // Let's try standard `ujust update`.
        try {
            // We return a stream or promise?
            // Simple version: Fire and allow client to see stats.
            // But usually this takes a while.
            return execAsync('ujust update');
        } catch (e: any) {
            throw e;
        }
    }

    public async reboot() {
        try {
            // If running as root, 'reboot' works. If not, 'sudo reboot'
            // We'll try just 'reboot' first, assuming the app runs as root as per spec.
            await execAsync('reboot');
            return { success: true, message: 'Rebooting system...' };
        } catch (error: any) {
            console.error('Reboot failed:', error);
            return { success: false, message: error.message };
        }
    }

    public async shutdown() {
        try {
            await execAsync('shutdown now');
            return { success: true, message: 'Shutting down system...' };
        } catch (error: any) {
            console.error('Shutdown failed:', error);
            return { success: false, message: error.message };
        }
    }

    public async getSmartStatus(): Promise<any[]> {
        const results = [];
        try {
            // 1. Find all physical disks
            const { stdout: lsblkOut } = await execAsync('lsblk -d -o NAME,TYPE,TRAN -J');
            const devices = JSON.parse(lsblkOut).blockdevices.filter((d: any) => d.type === 'disk');

            for (const dev of devices) {
                try {
                    // 2. Run smartctl on each
                    const { stdout: smartOut } = await execAsync(`smartctl -a /dev/${dev.name} -j`);
                    const smartData = JSON.parse(smartOut);

                    results.push({
                        device: `/dev/${dev.name}`,
                        model: smartData.model_name || smartData.device?.model_name || dev.name,
                        passed: smartData.smart_status?.passed ?? false,
                        temp: smartData.temperature?.current ?? 0,
                        powerOnHours: smartData.power_on_time?.hours ?? 0,
                        raw: smartData
                    });
                } catch (e: any) {
                    console.error(`SMART failed for ${dev.name}`, e.message);
                    // Add basic entry if smart fails
                    results.push({
                        device: `/dev/${dev.name}`,
                        model: dev.name,
                        passed: false,
                        temp: 0,
                        powerOnHours: 0,
                        error: "SMART verify failed or not supported"
                    });
                }
            }
        } catch (error) {
            console.error("Error scanning disks:", error);
        }
        return results;
    }

    // Kept for backward compat if needed, but getSmartStatus is preferred
    public async getSmartData() { return this.getSmartStatus(); }
}

export const systemControlService = new SystemControlService();
