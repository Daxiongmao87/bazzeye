# Bazzeye 👁️🎮

**Bazzeye** is a lightweight, responsive web dashboard designed for Bazzite/Linux handhelds and gaming systems. It provides system monitoring, steam game integration, and administrative controls in a sleek interface.

![Bazzeye Dashboard](client/public/favicon.svg)

## Features

-   **System Monitoring**: Real-time stats for CPU, Memory, Disk Usage, Network activity, and SMART health status.
-   **Steam Integration**: 
    -   **Now Playing**: Detects currently running Steam games and displays artwork/details.
    -   **Library**: View installed games.
-   **Web Terminal**: 
    -   Full XTerm.js integration.
    -   Multiple Tabs support.
    -   Renaming capabilities.
    -   Transparency toggle for overlay-style look.
    -   Session persistence and restart.
-   **File Browser**: 
    -   Explorer-like interface for navigating the host filesystem.
    -   Address bar and history support.
-   **System Controls**:
    -   **Update System**: Triggers `ujust update` (Bazzite specific) to keep your system fresh.
    -   **Power**: Reboot and Shutdown controls.
-   **Modes**:
    -   **User Mode**: Read-only view for safety.
    -   **SUDO Mode**: Toggle in the UI to enable dangerous actions (Terminal input, File deletion, System updates).

## Installation

### Prerequisites
-   Node.js (v18+)
-   Linux Host (Designed for Bazzite/Fedora Atomic, but works on generic Linux)

### Manual Setup

1.  Clone the repository:
    ```bash
    git clone https://github.com/Daxiongmao87/bazzeye.git
    cd bazzeye
    ```

2.  Install Dependencies:
    ```bash
    cd server && npm install
    cd ../client && npm install
    ```

3.  Build:
    ```bash
    # Build both client and server
    cd client && npm run build
    cd ../server && npm run build
    ```

4.  Run:
    ```bash
    cd server
    sudo node dist/index.js
    ```
    *   **Note**: Running as `root` (sudo) is recommended to allow System Updates (`rpm-ostree`), Power Controls (`shutdown`), and binding to Port 80.

## Running as a Service

### Root Service (Recommended for full features)

1.  Edit `bazzeye.service` to match your paths.
2.  Copy to system directory:
    ```bash
    sudo cp bazzeye.service /etc/systemd/system/
    ```
3.  Enable and Start:
    ```bash
    sudo systemctl daemon-reload
    sudo systemctl enable --now bazzeye
    ```

### User Service (Limited features)

If you prefer not to run as root:

1.  Edit `bazzeye-user.service` to match your paths.
2.  Copy to user directory:
    ```bash
    mkdir -p ~/.config/systemd/user/
    cp bazzeye-user.service ~/.config/systemd/user/bazzeye.service
    ```
3.  Enable and Start:
    ```bash
    systemctl --user daemon-reload
    systemctl --user enable --now bazzeye
    ```
    *   **Note**: Power controls and System Updates may fail without passwordless sudo rules. Port 80 will not be available (defaulting to 8080).

## Usage

Access the dashboard at `http://<your-ip-address>`.

-   **Edit Mode**: Click the Cog icon to move/resize widgets.
-   **Lock Layout**: Click the Cog again to freeze widgets.
-   **Sudo Mode**: Click the Shield icon to enable/disable write access.

## License

MIT
