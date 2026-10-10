# 红果短剧SAF版

独立 Windows 桌面客户端，适用于 Windows 10 / 11 x64，无需安卓模拟器。

完整源码位于 [`desktop/`](desktop/)，使用说明、功能差异与验证范围见 [desktop/README.md](desktop/README.md)。

## 下载 Windows EXE

[下载红果短剧SAF版 0.8.0（Windows x64）](https://github.com/zqzhuhai-commits/hongguo-saf-windows/releases/download/v0.8.0/SAF.-0.8.0-Windows-x64.exe) · [发布页面](https://github.com/zqzhuhai-commits/hongguo-saf-windows/releases/tag/v0.8.0)

下载后双击 EXE。GitHub 附件会简化中文文件名，应用内名称仍为「红果短剧SAF版」。

EXE 由本仓库源码在 Windows GitHub Actions 上构建，自动测试通过。校验文件随发布包提供。

## 从源码运行和构建

安装 Node.js 22 或以上：

```sh
cd desktop
npm ci
npm test
npm start
npm run build:win
```

构建输出位于 `outputs/windows/`。发布包未配置 Authenticode 签名；真实 Windows 播放及硬件解码仍需实机验证。

## 来源与许可证

参考 [N3urda/hongguoTV](https://github.com/N3urda/hongguoTV)，桌面版以 GPL-3.0-only 发布。第三方代码来源及许可证见 [desktop/NOTICE.md](desktop/NOTICE.md)、`desktop/vendor/` 和 `desktop/licenses/`。
