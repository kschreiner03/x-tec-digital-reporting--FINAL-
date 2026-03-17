"use strict";const{contextBridge:n,ipcRenderer:t}=require("electron");n.exposeInMainWorld("helpAPI",{openPdf:e=>t.invoke("open-pdf",e),getAssetPath:e=>t.invoke("get-asset-path",e)});
