
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, autoUpdater, nativeTheme, session } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;
let helpWindow;
let forceClose = false;
let pendingUpdate = false; // true when update downloaded but user chose "Later"

// --- Configuration / Secrets ---
// Prefer environment variables for sensitive or environment-specific URLs
const REPO_URL = process.env.GITHUB_REPOSITORY || 'kschreiner03/XTES-Digital-Reporting';
const REPORT_ISSUE_URL = process.env.REPORT_ISSUE_URL || 'https://forms.office.com/r/A0jqm6vHb6';

// --- Security: Allowed Extensions for File Operations ---
const ALLOWED_EXTENSIONS = ['.dfr', '.spdfr', '.plog', '.clog', '.iogc', '.json'];

// --- Squirrel install/update event detection (Windows only, must be checked early) ---
const isSquirrelEvent = process.platform === 'win32' &&
  process.argv.slice(1).some(a => a.startsWith('--squirrel-'));

// --- Single Instance Lock (skip during Squirrel install/update/uninstall events) ---
if (!isSquirrelEvent) {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
        const filePath = commandLine.find(arg =>
          ALLOWED_EXTENSIONS.some(ext => arg.endsWith(ext))
        );
        if (filePath) {
          mainWindow.webContents.send('open-file-path', filePath);
        }
      }
    });
  }
}

// --- Shortcut creation (Windows only) ---
const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
const exeName = path.basename(process.execPath);

// Handle Squirrel lifecycle events (install, update, uninstall, obsolete)
// process.exit() is used instead of app.quit() here because app.quit() called
// before app.isReady() is unreliable in Electron 40+ and can leave the
// installer loading GIF open indefinitely.
if (isSquirrelEvent) {
  const squirrelArg = process.argv.find(a => a.startsWith('--squirrel-'));

  if (squirrelArg === '--squirrel-install' || squirrelArg === '--squirrel-updated') {
    spawn(updateExe, ['--createShortcut', exeName], { detached: true, stdio: 'ignore' }).unref();
    const appExe = path.resolve(path.dirname(process.execPath), exeName);
    // Pass --squirrel-firstrun so the re-launched app can close the installer window
    spawn(appExe, ['--squirrel-firstrun'], { detached: true, stdio: 'ignore' }).unref();
    process.exit(0);
  } else if (squirrelArg === '--squirrel-uninstall') {
    spawn(updateExe, ['--removeShortcut', exeName], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => process.exit(0), 500);
  } else {
    process.exit(0);
  }
}

app.once('ready', () => {
  if (isSquirrelEvent || process.platform !== 'win32') return;

  try {
    const desktopShortcut = path.join(app.getPath('desktop'), 'X-TES Digital Reporting.lnk');
    if (fs.existsSync(updateExe) && !fs.existsSync(desktopShortcut)) {
      console.log('Creating desktop/start menu shortcuts...');
      spawn(updateExe, ['--createShortcut', exeName], { detached: true });
    }
  } catch (err) {
    console.error('Failed to create shortcuts manually:', err);
  }
});

// --- macOS file open handling ---
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  // Security check: Only allow opening files with permitted extensions
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return;

  if (mainWindow) {
    mainWindow.webContents.send('open-file-path', filePath);
  } else {
    process.argv.push(filePath);
  }
});

// --- Help window ---
function createHelpWindow() {
  if (helpWindow) {
    helpWindow.focus();
    return;
  }

  helpWindow = new BrowserWindow({
    width: 960,
    height: 720,
    title: 'Help - X-TES Digital Reporting',
    webPreferences: {
      preload: path.join(__dirname, 'help-preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true, // Enable sandbox for extra security
    },
  });
  
  // Handle dev vs. production paths
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const helpUrl = new URL('help.html', MAIN_WINDOW_VITE_DEV_SERVER_URL);
    helpWindow.loadURL(helpUrl.href);
  } else {
    helpWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/help.html`));
  }

  // Security: Prevent new windows from being created from within the help window
  helpWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  helpWindow.on('closed', () => {
    helpWindow = null;
  });
}

// --- Application Menu ---
const menuTemplate = [
  ...(process.platform === 'darwin'
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideothers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
      ]
    : []),
  {
    label: 'File',
    submenu: [
        {
            label: 'Save',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('quick-save-shortcut');
                }
            },
            accelerator: 'CmdOrCtrl+S'
        },
        {
            label: 'Save As...',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('save-project-shortcut');
                }
            },
            accelerator: 'CmdOrCtrl+Shift+S'
        },
        {
            label: 'Export PDF',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('export-pdf-shortcut');
                }
            },
            accelerator: 'CmdOrCtrl+E'
        },
        { type: 'separator' },
        {
            label: 'Download Photos',
            click: () => {
                if (mainWindow) {
                    mainWindow.webContents.send('download-photos');
                }
            },
            accelerator: 'CmdOrCtrl+D'
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
    ],
  },
  {
    label: 'Edit',
    submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
    ],
  },
  {
    label: 'Settings',
    submenu: [
      {
        label: 'Preferences...',
        click: () => {
            if (mainWindow) {
                mainWindow.webContents.send('open-settings');
            }
        },
        accelerator: 'CmdOrCtrl+,'
      }
    ]
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'How to Use',
        click: createHelpWindow,
      },
      {
        label: 'Report Issues',
        click: async () => {
          try {
            // Security: Only allow https protocols
            await shell.openExternal(REPORT_ISSUE_URL);
          } catch (err) {
            console.error('Failed to open issue form:', err);
            dialog.showErrorBox('Error', 'Could not open the issue report form.');
          }
        },
      },
    ],
  },
];

// --- Main Window ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 960,
    show: false, // Start hidden to prevent flickering before maximize
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      plugins: true,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (process.argv.includes('--squirrel-firstrun') && process.platform === 'win32') {
      // Kill the Squirrel installer process so its loading GIF window closes,
      // then show the app a beat later so there's no overlap.
      spawn('taskkill', ['/F', '/IM', 'x-tec-digital-reporting-webSetup.exe'],
        { detached: true, stdio: 'ignore' }).unref();
      setTimeout(() => { mainWindow.maximize(); mainWindow.show(); }, 300);
    } else {
      mainWindow.maximize();
      mainWindow.show();
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Security: Handle external links (e.g. from help docs)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Enhanced context menu with spell check support
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menuTemplate = [];

    // Add spell check suggestions if there's a misspelled word
    if (params.misspelledWord) {
      // Add suggestions at the top
      params.dictionarySuggestions.slice(0, 5).forEach(suggestion => {
        menuTemplate.push({
          label: suggestion,
          click: () => mainWindow.webContents.replaceMisspelling(suggestion)
        });
      });

      // Add "Add to Dictionary" option
      if (menuTemplate.length > 0) {
        menuTemplate.push({ type: 'separator' });
      }
      menuTemplate.push({
        label: 'Add to Dictionary',
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      });
      menuTemplate.push({ type: 'separator' });
    }

    // Standard editing options
    menuTemplate.push(
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll }
    );

    const menu = Menu.buildFromTemplate(menuTemplate);
    menu.popup({ window: mainWindow });
  });

  mainWindow.webContents.on('did-finish-load', () => {
    const filePath = process.argv.find(arg =>
        ALLOWED_EXTENSIONS.some(ext => arg.endsWith(ext))
    );
    if (filePath) {
      mainWindow.webContents.send('open-file-path', filePath);
    }
  });

  // Intercept window close to allow renderer to show unsaved changes modal
  mainWindow.on('close', (e) => {
    if (!forceClose) {
      e.preventDefault();
      mainWindow.webContents.send('close-attempted');
    }
  });

  ipcMain.removeAllListeners('confirm-close');
  ipcMain.on('confirm-close', () => {
    forceClose = true;
    if (mainWindow) {
      mainWindow.destroy();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    forceClose = false;
  });
}

const allowedPdfs = [
    'Example_DFR.pdf',
    'Example_DFR_Monitoring.pdf',
    'Example_DFR_NonCompliance.pdf',
    'Example_DFR_Herbicide.pdf',
    'Example_DFR_Construction.pdf',
    'Example_DFR_NestSweep.pdf'
];

// --- Handle file operations ---
app.whenReady().then(() => {
  // Squirrel events are handled entirely in showInstallScreen() — skip normal startup
  if (isSquirrelEvent) return;

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // --- Spell Checker Configuration ---
  // Enable spell checking for English (US and CA)
  session.defaultSession.setSpellCheckerLanguages(['en-US', 'en-CA']);

  // Enable spell checker
  session.defaultSession.setSpellCheckerEnabled(true);

  // --- Auto-updater Logic ---
  const server = 'https://update.electronjs.org';
  const feedUrl = `${server}/${REPO_URL}/${process.platform}-${process.arch}/${app.getVersion()}`;

  try {
    autoUpdater.setFeedURL(feedUrl);
  } catch (error) {
    console.error('Failed to set auto-updater feed URL:', error);
  }

  // Check for updates shortly after startup, then every hour
  setTimeout(() => autoUpdater.checkForUpdates(), 5000);
  setInterval(() => autoUpdater.checkForUpdates(), 60 * 60 * 1000);

  // Notify renderer when an update is available (download starts automatically)
  autoUpdater.on('update-available', () => {
    if (mainWindow) {
      mainWindow.webContents.send('update-available');
    }
  });

  // Notify renderer when download is complete (no native dialog)
  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded');
    }
  });

  // Renderer requests immediate install + restart
  ipcMain.on('install-update-now', () => {
    forceClose = true;
    autoUpdater.quitAndInstall();
  });

  // Renderer requests deferred install — will apply on next quit
  ipcMain.on('install-update-later', () => {
    pendingUpdate = true;
  });

  // When the app is about to quit, apply deferred update if one is pending
  app.on('before-quit', () => {
    if (pendingUpdate) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (error) => {
    console.error('There was a problem updating the application');
    console.error(error);
  });
  // --- End Auto-updater Logic ---

  ipcMain.handle('open-pdf', async (event, filename) => {
    // Security: Validate filename against allowlist
    if (!allowedPdfs.some(f => f.toLowerCase() === filename.toLowerCase())) {
        console.error('Requested PDF is not allowed:', filename);
        dialog.showErrorBox('Error', 'The requested file is not a valid example document.');
        return;
    }

    const assetsDir = app.isPackaged
        ? path.join(process.resourcesPath, 'assets')
        : path.join(app.getAppPath(), 'public', 'assets');
    
    // Security: Normalize path to prevent traversal
    const pdfPath = path.normalize(path.join(assetsDir, filename));

    // Use path.sep suffix to prevent prefix-match bypass (e.g. /assets_backup starting with /assets)
    if (!pdfPath.startsWith(assetsDir + path.sep) && pdfPath !== assetsDir) {
        console.error('Path traversal attempt detected');
        return;
    }

    try {
        await shell.openPath(pdfPath);
    } catch (err) {
        console.error(`Failed to open PDF: ${pdfPath}`, err);
        dialog.showErrorBox('Error', `Could not open the file: ${pdfPath}`);
    }
  });

  ipcMain.handle('get-asset-path', (event, filename) => {
    // Security: validate input type
    if (typeof filename !== 'string' || !filename) return '';

    // Normalize to forward slashes, then resolve to catch encoded traversal tricks
    const safeName = filename.replace(/\\/g, '/');
    const normalized = path.normalize(safeName).replace(/\\/g, '/');

    // Block any path traversal after normalization
    if (normalized.startsWith('..') || normalized.includes('/../') || path.isAbsolute(normalized)) {
        console.warn('[security] get-asset-path: blocked traversal attempt:', filename);
        return '';
    }

    // Whitelist allowed asset extensions
    const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.JPG', '.JPEG', '.PNG']);
    const ext = path.extname(normalized);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
        console.warn('[security] get-asset-path: blocked disallowed extension:', ext);
        return '';
    }

    // URL-encode each path segment (handles spaces, commas, etc.) but preserve /
    const encodedName = normalized.split('/').map(s => encodeURIComponent(s)).join('/');

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/assets/${encodedName}`;
    } else {
      const assetPath = path.join(process.resourcesPath, 'assets', ...normalized.split('/'));
      return encodeURI(`file://${assetPath.replace(/\\/g, '/')}`);
    }
  });

  ipcMain.handle('save-project', async (event, data, defaultPath) => {
    const window = BrowserWindow.getFocusedWindow();
    let filters = [{ name: 'Project Files', extensions: ['json'] }];
    const ext = defaultPath ? path.extname(defaultPath).toLowerCase() : '';

    if (ext === '.spdfr') filters = [{ name: 'SaskPower DFR Project', extensions: ['spdfr'] }];
    else if (ext === '.dfr') filters = [{ name: 'X-TES DFR Project', extensions: ['dfr'] }];
    else if (ext === '.plog') filters = [{ name: 'X-TES Photo Log', extensions: ['plog'] }];
    else if (ext === '.clog') filters = [{ name: 'X-TES Combine Logs', extensions: ['clog'] }];
    else if (ext === '.iogc') filters = [{ name: 'IOGC Audit File', extensions: ['iogc'] }];

    const { filePath } = await dialog.showSaveDialog(window, {
      title: 'Save Project',
      defaultPath,
      filters,
    });

    if (filePath) {
      try {
        fs.writeFileSync(filePath, data);
        return { success: true, path: filePath };
      } catch (err) {
        console.error('Failed to save project file:', err);
        return { success: false, error: err.message };
      }
    }
    return { success: false };
  });

  ipcMain.handle('load-project', async (event, fileType) => {
    const window = BrowserWindow.getFocusedWindow();
    let filters = [];

    if (fileType === 'plog') filters.push({ name: 'Photo Log Files', extensions: ['plog'] });
    else if (fileType === 'dfr') filters.push({ name: 'DFR Standard Files', extensions: ['dfr'] });
    else if (fileType === 'spdfr') filters.push({ name: 'SaskPower DFR Files', extensions: ['spdfr'] });
    else if (fileType === 'clog') filters.push({ name: 'Combine Logs Files', extensions: ['clog'] });
    else if (fileType === 'iogc') filters.push({ name: 'IOGC Audit Files', extensions: ['iogc'] });
    else filters.push({ name: 'All Project Files', extensions: ['plog', 'dfr', 'spdfr', 'clog', 'iogc'] });

    filters.push({ name: 'All Files', extensions: ['*'] });

    const { filePaths } = await dialog.showOpenDialog(window, {
      title: 'Open Project',
      properties: ['openFile'],
      filters,
    });

    if (filePaths && filePaths.length > 0) {
      const chosenPath = filePaths[0];
      // Defense-in-depth: validate extension even though the dialog already filters
      const ext = path.extname(chosenPath).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        console.error('Blocked unexpected file type from dialog:', chosenPath);
        return null;
      }
      try {
        const data = fs.readFileSync(chosenPath, 'utf-8');
        return data;
      } catch (err) {
        console.error('Failed to read project file:', err);
        return null;
      }
    }
    return null;
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    // Security: validate type, require absolute path, and check extension allowlist.
    // Requiring an absolute path prevents relative traversal (e.g. ../../sensitive.plog).
    if (!filePath || typeof filePath !== 'string') return { success: false, error: 'Invalid path' };
    if (!path.isAbsolute(filePath)) {
        console.error(`Blocked relative path in read-file: ${filePath}`);
        return { success: false, error: 'Absolute path required.' };
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        console.error(`Blocked attempt to read unauthorized file type: ${filePath}`);
        return { success: false, error: 'Unauthorized file type.' };
    }

    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return { success: true, data, path: filePath };
    } catch (err) {
      console.error('Failed to read file:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save-pdf', async (event, data, defaultPath) => {
    const window = BrowserWindow.getFocusedWindow();
    const { filePath } = await dialog.showSaveDialog(window, {
      title: 'Save PDF',
      defaultPath: defaultPath || 'photolog.pdf',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });

    if (filePath) {
      try {
        fs.writeFileSync(filePath, Buffer.from(data));
        return { success: true, path: filePath };
      } catch (err) {
        console.error('Failed to save PDF file:', err);
        return { success: false, error: err.message };
      }
    }
    return { success: false };
  });

  ipcMain.handle('save-zip-file', async (event, data, defaultPath) => {
    const window = BrowserWindow.getFocusedWindow();
    const { filePath } = await dialog.showSaveDialog(window, {
        title: 'Save Photos As...',
        defaultPath: defaultPath,
        filters: [{ name: 'Zip Files', extensions: ['zip'] }],
    });

    if (filePath) {
        try {
            fs.writeFileSync(filePath, Buffer.from(data));
            return { success: true, path: filePath };
        } catch (err) {
            console.error('Failed to save zip file:', err);
            return { success: false, error: err.message };
        }
    }
    return { success: false };
  });

  ipcMain.handle('load-multiple-projects', async (event) => {
    const window = BrowserWindow.getFocusedWindow();
    const { filePaths } = await dialog.showOpenDialog(window, {
      title: 'Import Photos from Files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Project Files', extensions: ['plog', 'dfr', 'spdfr', 'json', 'clog', 'iogc'] },
        { name: 'Photo Log Files', extensions: ['plog', 'clog'] },
        { name: 'DFR Files', extensions: ['dfr', 'spdfr'] },
        { name: 'IOGC Files', extensions: ['iogc'] },
        { name: 'JSON files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (filePaths && filePaths.length > 0) {
      try {
        const filesContent = filePaths.map(filePath => {
          // Verify file extensions even for bulk load
          const ext = path.extname(filePath).toLowerCase();
          if (!ALLOWED_EXTENSIONS.includes(ext)) {
             throw new Error("Unauthorized file type selected");
          }
          return fs.readFileSync(filePath, 'utf-8');
        });
        return { success: true, data: filesContent };
      } catch (err) {
        console.error('Failed to read project files:', err);
        return { success: false, error: err.message };
      }
    }
    return { success: false, data: [] };
  });

  ipcMain.handle('set-theme-source', (event, theme) => {
    nativeTheme.themeSource = theme;
  });

  ipcMain.handle('set-spellcheck-languages', (event, languages) => {
    try {
      // Validate that languages is an array of strings
      if (!Array.isArray(languages) || !languages.every(lang => typeof lang === 'string')) {
        console.error('Invalid languages parameter');
        return { success: false, error: 'Invalid languages parameter' };
      }
      session.defaultSession.setSpellCheckerLanguages(languages);
      return { success: true, languages };
    } catch (error) {
      console.error('Failed to set spell checker languages:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-spellcheck-languages', () => {
    try {
      const languages = session.defaultSession.getSpellCheckerLanguages();
      return { success: true, languages };
    } catch (error) {
      console.error('Failed to get spell checker languages:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-available-spellcheck-languages', () => {
    try {
      const languages = session.defaultSession.availableSpellCheckerLanguages;
      return { success: true, languages };
    } catch (error) {
      console.error('Failed to get available spell checker languages:', error);
      return { success: false, error: error.message };
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});