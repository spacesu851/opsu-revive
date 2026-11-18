const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('revive',{
  call:(action,payload)=>ipcRenderer.invoke('revive:action',action,payload),
  subscribe:callback=>{const handler=(_e,data)=>callback(data);ipcRenderer.on('revive:state',handler);return ()=>ipcRenderer.removeListener('revive:state',handler);},
  paths:files=>Array.from(files).map(file=>webUtils.getPathForFile(file)).filter(Boolean),
});
