# Bazzeye 👁️🎮

**Bazzeye** is a lightweight, responsive web dashboard designed for Bazzite/Linux handhelds and gaming systems. It provides system monitoring, steam game integration, and administrative controls in a sleek interface.

<img width="1080" height="917" alt="image" src="https://github.com/user-attachments/assets/f35e4244-538a-44db-9144-c4f498a8f79e" />

## Features

-   **System Monitoring**: Real-time stats for CPU, Memory, Disk Usage, Network activity, and SMART health status.
-   **Steam Integration**: 
    -   **Now Playing**: Detects currently running Steam games and displays artwork/details.
    -   **Library**: View installed games.
-   **Web Terminal**: 
    -   Full XTerm.js integration.
    -   Multiple Tabs support.
    -   **Persistent Layout**: Add/Remove terminal cards and save their positions.
-   **System Actions (Bazzite/Ujust)**:
    -   **One-click Actions**: Update System, Fix Proton Hangs, Restart Audio Services, and Run Benchmarks directly from the UI.
    -   Powered by Bazzite's `ujust` command.
-   **Package Manager**:
    -   Search and Install DNF packages (via `rpm-ostree`).
    -   View and remove layered packages.
-   **Zero-Config Deployment**:
    -   Dedicated build script for immutable OS environments.
    -   No manual hacking of `node_modules` required—uses **Distrobox** for clean builds.
-   **Security**:
    -   **Password Protected Sudo Mode**: Secure critical actions (reboot, terminal input, uninstalls) with a custom password.
    -   **Session Timeout**: Sudo mode auto-locks after inactivity.

## Installation on Bazzite

Bazzeye is designed to be built on Bazzite (an immutable/atomic OS) without modifying the base system. We use **Distrobox** to handle the build environment.

### 1. Clone the repository
```bash
git clone https://github.com/Daxiongmao87/bazzeye.git
cd bazzeye
```

### 2. Build with One Script
We provide a helper script that spins up a Fedora container, installs dependencies, and builds the project for you:

```bash
./bazzeye_setup.sh
```
*This will create a temporary distrobox container to build the app, then download a portable Node.js runtime for execution.*

### 3. Run Manually (Testing)
```bash
./bazzeye_start.sh
```
Access at `http://localhost:3000` (or your IP).

### 4. Install as System Service
To run automatically on boot:

To run automatically on boot, simply answer **"y"** when the setup script asks:
*"Do you want to install Bazzeye as a system service?"*

The script will automatically generate a valid Systemd service file for your specific user/path and install it.
**Note:** The service runs as your current user, not root. Privileged actions (like reboot) are handled via secure password-less sudo rules configured during setup.

## Updating Bazzeye

To update your installation to the latest version:

### Option A: Automatic Update Script
We include a helper script to automate the update process:

```bash
./bazzeye_update.sh
```

### Option B: Manual Update
If you prefer to do it manually:

1.  Pull the latest changes:
    ```bash
    git pull
    ```
2.  Install dependencies:
    ```bash
    npm run install:all
    ```
3.  Rebuild:
    ```bash
    npm run build
    ```
4.  Restart the service:
    ```bash
    systemctl --user restart bazzeye
    ```


## Usage

Access the dashboard at `http://<your-ip-address>:3000`.

*   **Edit Layout**: Click the **Settings (Cog)** icon to unlock the grid. You can then resize/move widgets or add new Terminal Cards (Plus icon).
*   **Security**: Click the **Key** icon to set/change your dashboard password.
*   **Sudo Mode**: Click the **Shield** icon to unlock administrative features (requires password if set).

## Uninstall

To remove the service and clean up all generated files:

```bash
./bazzeye_uninstall.sh
```

## Troubleshooting

-   **Build Fails?**: Ensure you have `distrobox` installed (standard on Bazzite). Run `./bazzeye_setup.sh` again to retry.
-   **"npm not found"?**: Do not run `npm install` directly on the host. Use the setup script.

## License

MIT
