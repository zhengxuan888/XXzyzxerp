/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("node:path");

const ERP_URL = process.env.ERP_DESKTOP_URL || "http://43.134.91.39";
const ERP_ORIGIN = new URL(ERP_URL).origin;

let mainWindow;
let failureDialogOpen = false;

function isInternalUrl(targetUrl) {
  try {
    return new URL(targetUrl).origin === ERP_ORIGIN;
  } catch {
    return false;
  }
}

function openExternal(targetUrl) {
  if (/^https?:\/\//i.test(targetUrl)) {
    void shell.openExternal(targetUrl);
  }
}

async function showConnectionFailure() {
  if (!mainWindow || mainWindow.isDestroyed() || failureDialogOpen) return;

  failureDialogOpen = true;
  const result = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    title: "暂时无法连接 ERP",
    message: "无法连接 ERP 服务器，请检查网络后重试。",
    detail: ERP_URL,
    buttons: ["重新连接", "退出"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  failureDialogOpen = false;

  if (result.response === 0 && mainWindow && !mainWindow.isDestroyed()) {
    void mainWindow.loadURL(ERP_URL);
  } else {
    app.quit();
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    title: "择优臻选 ERP",
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f5f7fa",
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) {
      void mainWindow.loadURL(url);
    } else {
      openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, _description, _url, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      void showConnectionFailure();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  void mainWindow.loadURL(ERP_URL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId("com.zeyouzhenxuan.erp");
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
}

app.on("window-all-closed", () => app.quit());
