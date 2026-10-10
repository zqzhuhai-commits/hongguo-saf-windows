# 红果短剧SAF版

独立 Windows 桌面客户端，适用于 Windows 10 / 11 x64，无需安卓模拟器。

完整源码位于 [`desktop/`](desktop/)，使用说明、功能差异与验证范围见 [desktop/README.md](desktop/README.md)。

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
