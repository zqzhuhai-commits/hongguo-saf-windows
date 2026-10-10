# 红果短剧Mac客户端SAF版 0.8.1

独立 macOS 应用，无需安卓模拟器、Java、Node.js 或外部服务。沿用用户提供的应用图标。

## 安装

- Apple 芯片（M 系列）：下载 `Hongguo-Mac-SAF-0.8.1-arm64.dmg`。
- Intel 芯片：下载 `Hongguo-Mac-SAF-0.8.1-x64.dmg`。

打开 DMG，将「红果短剧Mac客户端SAF版.app」拖到「应用程序」，然后从应用程序启动。
ZIP 版本完整解压后同样将 `.app` 放入应用程序。

应用采用本地 ad-hoc 签名，未配置 Apple Developer ID 和 Apple 公证。首次打开如果被
macOS 拦截，请在「系统设置 → 隐私与安全性」中对本应用选择「仍要打开」。
不需要关闭系统的安全检查。

收藏、片单及播放进度保存在 `~/Library/Application Support/HongguoTV/`。
可以在设置中导出 JSON 备份并导入其他设备；没有红果账号同步。

键盘：空格播放 / 暂停，左右方向键跳转 10 秒，Esc 返回，Control + Command + F 全屏。
Command + Q 退出；菜单支持标准文本复制和粘贴。

## 构建与验证

在 macOS 上安装 Node.js 22 或以上：

```sh
cd desktop
npm ci
npm test
npm run build:mac
python3 verify-mac.py arm64
python3 verify-mac.py x64
```

输出位于 `outputs/macos/`。两个芯片版本分别使用原生 macOS 构建环境，检查应用名称、
版本、ICNS 图标、Mach-O 架构、本地签名及应用启动后的窗口标题。
自动检查和启动检查不代表真实剧集播放验收；真实播放及硬件解码仍需目标设备验证。
来源、功能范围与 GPL-3.0-only 许可证见 README.md、NOTICE.md、LICENSE 和 vendor/。
