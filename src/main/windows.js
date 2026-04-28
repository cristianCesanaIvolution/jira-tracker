const path = require('path');
const fs = require('fs');
const { BrowserWindow, nativeImage } = require('electron');

let dashboardWin = null;
let settingsWin = null;
let popupWin = null;

const PRELOAD = path.join(__dirname, 'preload.js');
const APP_ICON_PATH = path.join(__dirname, '..', '..', 'assets', 'app-icon.png');

function getAppIcon() {
  if (fs.existsSync(APP_ICON_PATH)) return nativeImage.createFromPath(APP_ICON_PATH);
  return undefined;
}

function baseWindowOptions() {
  return {
    autoHideMenuBar: true,
    icon: getAppIcon(),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };
}

function openDashboard() {
  if (dashboardWin && !dashboardWin.isDestroyed()) {
    dashboardWin.show();
    dashboardWin.focus();
    return dashboardWin;
  }
  dashboardWin = new BrowserWindow({
    ...baseWindowOptions(),
    width: 1100,
    height: 720,
    title: 'Jira Time Tracker',
  });
  dashboardWin.loadFile(path.join(__dirname, '..', 'renderer', 'dashboard', 'index.html'));
  dashboardWin.on('closed', () => { dashboardWin = null; });
  return dashboardWin;
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return settingsWin;
  }
  settingsWin = new BrowserWindow({
    ...baseWindowOptions(),
    width: 600,
    height: 540,
    title: 'Settings',
    resizable: false,
    minimizable: false,
    maximizable: false,
  });
  settingsWin.loadFile(path.join(__dirname, '..', 'renderer', 'settings', 'index.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
  return settingsWin;
}

function openPopup({ allowIgnore }) {
  return new Promise((resolve) => {
    if (popupWin && !popupWin.isDestroyed()) {
      popupWin.focus();
      return resolve({ kind: 'ignore-already-open' });
    }
    popupWin = new BrowserWindow({
      ...baseWindowOptions(),
      width: 480,
      height: 540,
      title: 'What are you working on?',
      alwaysOnTop: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: false,
    });
    popupWin.loadFile(path.join(__dirname, '..', 'renderer', 'popup', 'index.html'), {
      query: { allowIgnore: allowIgnore ? '1' : '0' },
    });

    let answered = false;
    const finish = (result) => {
      if (answered) return;
      answered = true;
      resolve(result);
      if (popupWin && !popupWin.isDestroyed()) popupWin.close();
    };

    popupWin._finishPrompt = finish;
    popupWin.on('closed', () => {
      popupWin = null;
      // closing the window without an answer = "ignore"
      if (!answered) finish({ kind: 'ignore' });
    });
  });
}

function getPopupWindow() {
  return popupWin;
}

module.exports = { openDashboard, openSettings, openPopup, getPopupWindow };
