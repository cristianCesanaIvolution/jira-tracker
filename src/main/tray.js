const path = require('path');
const fs = require('fs');
const { Tray, Menu, app, nativeImage } = require('electron');
const windows = require('./windows');

let tray = null;

function getIcon() {
  const candidate = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  if (fs.existsSync(candidate)) return nativeImage.createFromPath(candidate);
  // fallback: empty 16x16 image
  return nativeImage.createEmpty();
}

function build() {
  if (tray) return tray;
  tray = new Tray(getIcon());
  tray.setToolTip('Jira Time Tracker');

  const menu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => windows.openDashboard() },
    { label: 'Settings', click: () => windows.openSettings() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => windows.openDashboard());
  return tray;
}

module.exports = { build };
