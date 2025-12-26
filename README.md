# Social Hub

<p align="center">
  <img src="assets/icon.svg" width="120" alt="Social Hub Logo">
</p>

<p align="center">
  <strong>A unified desktop app for managing social media messaging and analytics in one place.</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#building">Building</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Features

- **🗂️ Tab-based Interface** — Organize multiple services in separate tabs
- **👥 Multi-account Support** — Run multiple accounts of the same service simultaneously
- **🔐 Isolated Sessions** — Each tab maintains its own login session
- **💾 Persistent Login** — Stay logged in across app restarts
- **🖥️ Cross-platform** — Works on Windows and Linux

### Supported Services

| Service | Type | Description |
|---------|------|-------------|
| **Messenger** | Chat | Facebook Messenger with full chat functionality |
| **Instagram Chat** | Chat | Direct messages and comment management |
| **Instagram Analytics** | Stats | Post insights, reach, and engagement metrics |
| **TikTok Analytics** | Stats | Video performance and analytics |

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or higher
- npm (comes with Node.js)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/mosshansson/social-hub.git
cd social-hub

# Install dependencies
npm install

# Run the app
npm start
```

## Usage

1. **Launch the app** — Run `npm start` or use the built executable
2. **Add a tab** — Click the `+` button in the sidebar
3. **Choose a service** — Select Messenger, Instagram, or TikTok
4. **Log in** — Each tab has its own session, so log in as needed
5. **Switch tabs** — Click the icons in the sidebar to navigate

### Tips

- **Multiple accounts**: Add the same service multiple times with different logins
- **Keyboard shortcuts**: Press `Esc` to close modals
- **Navigation**: Use the back/forward/reload buttons in each tab's toolbar

## Building

Build distributable packages for your platform:

```bash
# Build for your current platform
npm run build

# Build for Windows (.exe installer)
npm run build:win

# Build for Linux (AppImage + .deb)
npm run build:linux

# Build for both platforms
npm run build:all
```

Built packages will be output to the `dist/` folder.

### Linux Note

AppImages require FUSE to run. If you get a FUSE error:

```bash
# Arch Linux
sudo pacman -S fuse2

# Ubuntu/Debian
sudo apt install fuse
```

Or extract and run without FUSE:

```bash
./Social\ Hub-*.AppImage --appimage-extract
./squashfs-root/social-hub
```

## Project Structure

```
social-hub/
├── package.json          # Dependencies and build configuration
├── src/
│   ├── main.js          # Electron main process
│   ├── preload.js       # IPC bridge for secure communication
│   └── index.html       # UI and renderer logic
├── assets/
│   └── icon.svg         # Application icon
└── dist/                # Built packages (after running build)
```

## Customization

### Adding More Services

Edit the `services` object in `src/index.html`:

```javascript
const services = {
  'your-service': {
    name: 'Display Name',
    url: 'https://service-url.com',
    icon: `<svg>...</svg>`
  }
};
```

### Theming

All styles are in `src/index.html`. Key CSS variables:

```css
:root {
  --bg-deep: #08080c;
  --bg-primary: #0c0c12;
  --accent-messenger: #0084ff;
  --accent-instagram: #e1306c;
  /* ... */
}
```

## Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with ☕ and Electron
</p>
