const path = require('path');
const fs = require('fs');
const { Tray, Menu, app, nativeImage } = require('electron');
const windows = require('./windows');

let tray = null;

function getIcon() {
  const base = path.join(__dirname, '..', '..', 'assets', 'tray-icon.png');
  const hd = path.join(__dirname, '..', '..', 'assets', 'tray-icon@2x.png');
  if (fs.existsSync(base)) {
    const img = nativeImage.createFromPath(base);
    if (fs.existsSync(hd)) {
      img.addRepresentation({ scaleFactor: 2.0, buffer: fs.readFileSync(hd) });
    }
    img.setTemplateImage(false);
    return img;
  }
  return nativeImage.createEmpty();
}

function build() {
  if (tray) return tray;
  tray = new Tray(getIcon());
  tray.setToolTip('Jira Time Tracker');

  const menu = Menu.buildFromTemplate([
    { label: 'Apri Dashboard', click: () => windows.openDashboard() },
    { label: 'Settings', click: () => windows.openSettings() },
    { type: 'separator' },
    { label: 'Esci', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => windows.openDashboard());
  tray.on('click', () => windows.openDashboard());
  return tray;
}

module.exports = { build };
