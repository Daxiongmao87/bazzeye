
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';

class AuthService {
    private sudoMode: boolean = false;
    private authFile: string;
    private passwordHash: string | null = null;
    private sessionExpiry: NodeJS.Timeout | null = null;

    constructor() {
        const dataDir = path.join(process.env.HOME || '.', '.bazzeye-data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.authFile = path.join(dataDir, 'auth.json');
        this.load();

        // Auto-enable sudo if no password is set? Or just treat as 'no password protected'
        // If no password set, we might want to prompt user.
    }

    private load() {
        try {
            if (fs.existsSync(this.authFile)) {
                const data = JSON.parse(fs.readFileSync(this.authFile, 'utf-8'));
                this.passwordHash = data.passwordHash || null;
            }
        } catch (e) {
            console.error('Failed to load auth config:', e);
        }
    }

    private save() {
        try {
            fs.writeFileSync(this.authFile, JSON.stringify({ passwordHash: this.passwordHash }, null, 2));
        } catch (e) {
            console.error('Failed to save auth config:', e);
        }
    }

    public isSudo(): boolean {
        return this.sudoMode;
    }

    public hasPassword(): boolean {
        return !!this.passwordHash;
    }

    public async setPassword(password: string) {
        if (!password) {
            this.passwordHash = null;
        } else {
            this.passwordHash = await bcrypt.hash(password, 10);
        }
        this.save();
    }

    public async verifyPassword(password: string): Promise<boolean> {
        if (!this.passwordHash) return true; // No password = access granted
        return bcrypt.compare(password, this.passwordHash);
    }

    // Attempt to toggle sudo. Returns true if successful, false if password required
    public requestToggleSudo(): { success: boolean, requiresPassword: boolean } {
        if (this.sudoMode) {
            // Turning off is always allowed
            this.setSudo(false);
            return { success: true, requiresPassword: false };
        } else {
            // Turning on
            if (!this.passwordHash) {
                // No password, allow immediately but maybe warn?
                this.setSudo(true);
                return { success: true, requiresPassword: false };
            } else {
                // Requires password
                return { success: false, requiresPassword: true };
            }
        }
    }

    public setSudo(enable: boolean): void {
        this.sudoMode = enable;
        console.log(`[AuthService] Sudo Mode set to: ${this.sudoMode}`);

        // Auto-logout after 15 mins?
        if (enable) {
            if (this.sessionExpiry) clearTimeout(this.sessionExpiry);
            this.sessionExpiry = setTimeout(() => {
                this.setSudo(false);
                // We'd need to emit this change, handled in index via polling/event or callback? 
                // We'll leave auto-logout for now or handle via socket broadcast if we had ref to it.
            }, 15 * 60 * 1000);
        } else {
            if (this.sessionExpiry) clearTimeout(this.sessionExpiry);
        }
    }
}

export const authService = new AuthService();
