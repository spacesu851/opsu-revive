# 续作项目约定

- Windows 打包统一更新固定的 `release` 目录，不创建 `release-版本号` 副本。
- 安装包固定为 `release/OPSU-Revive-x64-Setup.exe`，便携程序固定为 `release/win-unpacked/续作.exe`。
- 使用 `npm run package` 打包；需要复用本机 Electron 时通过 `-ElectronDist` 参数传入。
- 不为每次界面微调复制完整程序或创建按版本累积的程序备份。保留用户数据、已有快捷方式和自定义图标。
