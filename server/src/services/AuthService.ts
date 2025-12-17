
export class AuthService {
    private sudoMode: boolean = false;

    constructor() {
        this.checkRoot();
    }

    private checkRoot() {
        // Warning: process.getuid is only available on POSIX platforms (Linux/macOS)
        if (process.getuid && process.getuid() === 0) {
            this.sudoMode = true;
            console.log(`[AuthService] Running as root. Sudo Mode enabled by default.`);
        } else {
            console.log(`[AuthService] Running as user. Sudo Mode disabled.`);
        }
    }

    public isSudo(): boolean {
        return this.sudoMode;
    }

    public setSudo(enable: boolean): void {
        this.sudoMode = enable;
        console.log(`[AuthService] Sudo Mode set to: ${this.sudoMode}`);
    }

    public toggleSudo(): boolean {
        this.sudoMode = !this.sudoMode;
        console.log(`[AuthService] Sudo Mode toggled to: ${this.sudoMode}`);
        return this.sudoMode;
    }
}

export const authService = new AuthService();
