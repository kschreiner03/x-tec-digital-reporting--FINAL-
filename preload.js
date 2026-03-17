"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");
const os = require("os");

contextBridge.exposeInMainWorld("electronAPI", {
  /* -----------------------------
     FILE / PROJECT OPERATIONS
  ----------------------------- */

  saveProject: (data, defaultPath) =>
    ipcRenderer.invoke("save-project", data, defaultPath),

  loadProject: (fileType) =>
    ipcRenderer.invoke("load-project", fileType),

  loadMultipleProjects: () =>
    ipcRenderer.invoke("load-multiple-projects"),

  savePdf: (data, defaultPath) =>
    ipcRenderer.invoke("save-pdf", data, defaultPath),

  saveZipFile: (data, defaultPath) =>
    ipcRenderer.invoke("save-zip-file", data, defaultPath),

  readFile: (filePath) =>
    ipcRenderer.invoke("read-file", filePath),

  /* -----------------------------
     MENU EVENTS (MAIN → RENDERER)
  ----------------------------- */

  onOpenFile: (callback) => {
    ipcRenderer.on("open-file-path", (_event, filePath) => callback(filePath));
  },

  onOpenSettings: (callback) => {
    ipcRenderer.on("open-settings", () => callback());
  },

  onDownloadPhotos: (callback) => {
    ipcRenderer.on("download-photos", () => callback());
  },

  onUpdateAvailable: (callback) => {
    ipcRenderer.on("update-available", () => callback());
  },

  onUpdateDownloaded: (callback) => {
    ipcRenderer.on("update-downloaded", () => callback());
  },

  installUpdateNow: () => {
    ipcRenderer.send("install-update-now");
  },

  installUpdateLater: () => {
    ipcRenderer.send("install-update-later");
  },

  onSaveProjectShortcut: (callback) => {
    ipcRenderer.on("save-project-shortcut", () => callback());
  },

  onQuickSaveShortcut: (callback) => {
    ipcRenderer.on("quick-save-shortcut", () => callback());
  },

  onExportPdfShortcut: (callback) => {
    ipcRenderer.on("export-pdf-shortcut", () => callback());
  },

  /* -----------------------------
     LISTENER CLEANUP
  ----------------------------- */

  removeDownloadPhotosListener: (callback) => {
    ipcRenderer.removeListener("download-photos", callback);
  },

  removeAllDownloadPhotosListeners: () => {
    ipcRenderer.removeAllListeners("download-photos");
  },

  removeOpenSettingsListener: () => {
    ipcRenderer.removeAllListeners("open-settings");
  },

  onOpenProjectsView: (callback) => {
    ipcRenderer.on("open-projects-view", () => callback());
  },

  removeOpenProjectsViewListener: () => {
    ipcRenderer.removeAllListeners("open-projects-view");
  },

  removeUpdateAvailableListener: () => {
    ipcRenderer.removeAllListeners("update-available");
  },

  removeUpdateDownloadedListener: () => {
    ipcRenderer.removeAllListeners("update-downloaded");
  },

  removeSaveProjectShortcutListener: () => {
    ipcRenderer.removeAllListeners("save-project-shortcut");
  },

  removeQuickSaveShortcutListener: () => {
    ipcRenderer.removeAllListeners("quick-save-shortcut");
  },

  removeExportPdfShortcutListener: () => {
    ipcRenderer.removeAllListeners("export-pdf-shortcut");
  },

  onCloseAttempted: (callback) => {
    ipcRenderer.on("close-attempted", () => callback());
  },

  removeCloseAttemptedListener: () => {
    ipcRenderer.removeAllListeners("close-attempted");
  },

  confirmClose: () => {
    ipcRenderer.send("confirm-close");
  },

  /* -----------------------------
     ASSETS
  ----------------------------- */

  getAssetPath: (filename) =>
    ipcRenderer.invoke("get-asset-path", filename),

  /* -----------------------------
     THEME CONTROL (FIXED)
  ----------------------------- */

  setThemeSource: (theme) =>
    ipcRenderer.invoke("set-theme-source", theme),

  /* -----------------------------
     SPELL CHECK
  ----------------------------- */

  setSpellCheckLanguages: (languages) =>
    ipcRenderer.invoke("set-spellcheck-languages", languages),

  getSpellCheckLanguages: () =>
    ipcRenderer.invoke("get-spellcheck-languages"),

  getAvailableSpellCheckLanguages: () =>
    ipcRenderer.invoke("get-available-spellcheck-languages"),

  /* -----------------------------
     USER INFO
  ----------------------------- */

  getUserInfo: () => {
    try {
      const userInfo = os.userInfo();
      return {
        username: userInfo.username,
        homedir: userInfo.homedir,
      };
    } catch (error) {
      console.error('Error getting user info:', error);
      return { username: 'User', homedir: '' };
    }
  },
});

/* --------------------------------
   HELP WINDOW API (SEPARATE)
--------------------------------- */

contextBridge.exposeInMainWorld("helpAPI", {
  openPdf: (filename) =>
    ipcRenderer.invoke("open-pdf", filename),

  getAssetPath: (filename) =>
    ipcRenderer.invoke("get-asset-path", filename),
});
