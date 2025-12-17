
import fs from 'fs';
import path from 'path';

class LayoutService {
    private layoutFile: string;
    private layouts: any = null;
    private extras: string[] = [];

    constructor() {
        // Store in local directory or /var/lib/bazzeye? 
        // For simple deployment, let's use a data dir relative to server or HOME
        // User asked for "backend", implied persistence across restarts.
        const dataDir = path.join(process.env.HOME || '.', '.bazzeye-data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.layoutFile = path.join(dataDir, 'layout.json');
        this.load();
    }

    private load() {
        try {
            if (fs.existsSync(this.layoutFile)) {
                const data = JSON.parse(fs.readFileSync(this.layoutFile, 'utf-8'));
                this.layouts = data.layouts;
                this.extras = data.extras || [];
            }
        } catch (e) {
            console.error('Failed to load layout:', e);
        }
    }

    public getLayout() {
        return { layouts: this.layouts, extras: this.extras };
    }

    public saveLayout(layouts: any, extras: string[]) {
        this.layouts = layouts;
        this.extras = extras;
        try {
            fs.writeFileSync(this.layoutFile, JSON.stringify({ layouts, extras }, null, 2));
            return true;
        } catch (e) {
            console.error('Failed to save layout:', e);
            return false;
        }
    }
}

export const layoutService = new LayoutService();
