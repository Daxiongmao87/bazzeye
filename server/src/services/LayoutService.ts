
import fs from 'fs';
import path from 'path';

class LayoutService {
    private layoutFile: string;
    private layouts: any = null;
    private extras: string[] = [];
    private disabledCards: string[] = [];

    constructor() {
        // Use app's storage directory instead of $HOME (service user may not have a home dir)
        const dataDir = path.join(__dirname, '../../storage');
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
                this.disabledCards = data.disabledCards || [];
            }
        } catch (e) {
            console.error('Failed to load layout:', e);
        }
    }

    public getLayout() {
        return { layouts: this.layouts, extras: this.extras, disabledCards: this.disabledCards };
    }

    public saveLayout(layouts: any, extras: string[], disabledCards: string[] = this.disabledCards) {
        this.layouts = layouts;
        this.extras = extras;
        this.disabledCards = disabledCards;
        try {
            fs.writeFileSync(this.layoutFile, JSON.stringify({ layouts, extras, disabledCards }, null, 2));
            return true;
        } catch (e) {
            console.error('Failed to save layout:', e);
            return false;
        }
    }
}

export const layoutService = new LayoutService();
