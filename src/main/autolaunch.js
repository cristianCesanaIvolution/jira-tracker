const { app } = require('electron');

function setEnabled(enabled) {
  app.setLoginItemSettings({
    openAtLogin: !!enabled,
    openAsHidden: true,
    args: ['--hidden'],
  });
}

function isEnabled() {
  return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
}

module.exports = { setEnabled, isEnabled };
