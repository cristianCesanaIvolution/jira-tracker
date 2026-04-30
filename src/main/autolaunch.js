const path = require('node:path');
const { app } = require('electron');

function getOptions() {
  const opts = {
    openAsHidden: true,
    args: ['--hidden'],
  };
  if (!app.isPackaged) {
    opts.path = process.execPath;
    opts.args = [path.resolve(process.cwd(), app.getAppPath()), '--hidden'];
  }
  return opts;
}

function setEnabled(enabled) {
  const opts = getOptions();
  app.setLoginItemSettings({
    openAtLogin: !!enabled,
    openAsHidden: opts.openAsHidden,
    path: opts.path,
    args: opts.args,
  });
}

function isEnabled() {
  const opts = getOptions();
  return app.getLoginItemSettings({ path: opts.path, args: opts.args }).openAtLogin;
}

module.exports = { setEnabled, isEnabled };
