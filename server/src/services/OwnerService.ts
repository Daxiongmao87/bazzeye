
import fs from 'fs';
import { execSync } from 'child_process';

const CONFIG_FILE = '/etc/bazzeye.conf';

class OwnerService {
    private owner: string;
    private ownerHome: string;

    constructor() {
        this.owner = this.loadOwner();
        this.ownerHome = this.resolveHome();
        console.log(`[OwnerService] Initialized. Owner: ${this.owner}, Home: ${this.ownerHome}`);
    }

    private loadOwner(): string {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
                const match = content.match(/^BAZZEYE_OWNER=(.+)$/m);
                if (match && match[1]) {
                    return match[1].trim();
                }
            }
        } catch (e) {
            console.error('[OwnerService] Failed to read config:', e);
        }

        // Fallback: try to get the user who owns the current working directory
        // This helps during development when /etc/bazzeye.conf doesn't exist
        try {
            const stat = fs.statSync(process.cwd());
            const { stdout } = { stdout: execSync(`id -nu ${stat.uid}`, { encoding: 'utf-8' }) };
            const fallbackUser = stdout.trim();
            if (fallbackUser && fallbackUser !== 'root') {
                console.warn(`[OwnerService] Using fallback owner from cwd: ${fallbackUser}`);
                return fallbackUser;
            }
        } catch (e) {
            // Ignore
        }

        // Ultimate fallback
        const envUser = process.env.SUDO_USER || process.env.USER || 'root';
        console.warn(`[OwnerService] Using environment fallback: ${envUser}`);
        return envUser;
    }

    private resolveHome(): string {
        try {
            // Get home directory from passwd entry
            const { stdout } = { stdout: execSync(`getent passwd ${this.owner}`, { encoding: 'utf-8' }) };
            const parts = stdout.trim().split(':');
            if (parts.length >= 6) {
                return parts[5]; // Home directory is 6th field
            }
        } catch (e) {
            console.error('[OwnerService] Failed to resolve home:', e);
        }
        return `/home/${this.owner}`;
    }

    /**
     * Get the username of the original owner who set up Bazzeye
     */
    public getOwner(): string {
        return this.owner;
    }

    /**
     * Get the home directory of the original owner
     */
    public getOwnerHome(): string {
        return this.ownerHome;
    }

    /**
     * Execute a command as the original owner.
     * Returns a promise that resolves with stdout.
     */
    public execAsOwner(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                // Use sudo -u to run as the owner
                const fullCmd = `sudo -u ${this.owner} bash -c '${command.replace(/'/g, "'\\''")}'`;
                const output = execSync(fullCmd, { encoding: 'utf-8', timeout: 30000 });
                resolve(output);
            } catch (e: any) {
                reject(new Error(`Failed to execute as ${this.owner}: ${e.message}`));
            }
        });
    }

    /**
     * Get the sudo prefix for running commands as the owner
     * Useful for building command strings
     */
    public getSudoAsOwnerPrefix(): string {
        return `sudo -u ${this.owner}`;
    }
}

export const ownerService = new OwnerService();
