
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { systemControlService } from './SystemControlService'; // Reuse checking logic if needed? Nah.

const execAsync = promisify(exec);

export interface PackageInfo {
    name: string;
    summary: string;
    version?: string;
    arch?: string;
    isInstalled?: boolean; // If we can determine it easily
}

class PackageService {

    // Cache for layered packages
    private layeredPackages: string[] = [];
    private lastStatusCheck: number = 0;
    private CACHE_TTL = 30000; // 30s

    constructor() {
        this.refreshStatus();
    }

    private async refreshStatus() {
        try {
            // rpm-ostree status --json is ideal if available, but let's parse text for robustness if json fails or isn't perfect.
            // Actually, `rpm-ostree status` text output:
            // LayeredPackages: package1 package2 ...
            const { stdout } = await execAsync('rpm-ostree status');
            const lines = stdout.split('\n');
            const layeredLine = lines.find(l => l.trim().startsWith('LayeredPackages:'));
            if (layeredLine) {
                // "          LayeredPackages: antigravity zerotier-one"
                const parts = layeredLine.trim().split(':')[1].trim().split(/\s+/);
                this.layeredPackages = parts.filter(p => p.length > 0);
            } else {
                this.layeredPackages = [];
            }
            this.lastStatusCheck = Date.now();
        } catch (e) {
            console.error('[PackageService] Failed to get status:', e);
        }
    }

    public async getLayeredPackages(): Promise<string[]> {
        if (Date.now() - this.lastStatusCheck > this.CACHE_TTL) {
            await this.refreshStatus();
        }
        return this.layeredPackages;
    }

    public async search(query: string): Promise<PackageInfo[]> {
        if (!query || query.length < 2) return [];
        // Sanitize query to prevent injection
        const safeQuery = query.replace(/[^a-zA-Z0-9\-\_\.]/g, '');

        try {
            // dnf search -C (cache only) is faster but might be stale. 
            // dnf search is slow.
            // limit to 20
            const { stdout } = await execAsync(`dnf search "${safeQuery}" | head -n 40`);

            // Output format:
            // Last metadata expiration check: ...
            // ================= Name Matches =================
            // package.arch : Summary
            // package.noarch : Summary

            const results: PackageInfo[] = [];
            const lines = stdout.split('\n');

            for (const line of lines) {
                if (line.includes(': ')) {
                    const [pkgNameFull, summary] = line.split(': ');
                    // pkgNameFull might be "firefox.x86_64" or "firefox"
                    // clean it
                    const nameParts = pkgNameFull.trim().split('.');
                    const name = nameParts[0];
                    const arch = nameParts.length > 1 ? nameParts[1] : undefined;

                    // Filter out "Last metadata..."
                    if (line.startsWith('Last metadata')) continue;
                    if (line.startsWith('====')) continue;

                    results.push({
                        name,
                        summary: summary?.trim() || '',
                        arch
                    });
                }
            }

            // Deduplicate by name
            const unique = new Map();
            results.forEach(r => {
                if (!unique.has(r.name)) unique.set(r.name, r);
            });

            return Array.from(unique.values());

        } catch (e: any) {
            console.error('[PackageService] Search failed:', e.message);
            return [];
        }
    }

    // Installing/Uninstalling is LONG RUNNING.
    // We should probably spawn and return a process ID or socket event stream.
    // For MVP, we'll return a promise that resolves when done, but client might timeout?
    // Better to return "Started" and emit events.

    // But to match current pattern, let's keep it simple for now, maybe use systemControl pattern.

    public install(pkg: string) {
        return this.runTransaction(`rpm-ostree install ${pkg} -y`);
    }

    public uninstall(pkg: string) {
        return this.runTransaction(`rpm-ostree uninstall ${pkg} -y`);
    }

    private runTransaction(command: string) {
        // This returns a promise that resolves when the process exits.
        // We might want to stream stdout to the global socket if possible?
        // For now, let's just run it.
        console.log('[PackageService] Running:', command);
        return execAsync(command);
    }
}

export const packageService = new PackageService();
