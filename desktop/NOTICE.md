# 红果短剧SAF版

本桌面版基于 https://github.com/N3urda/hongguoTV 的提交
`eea73e6a45569a2cbbb9440f7cd5290c459b0b70` 制作，目标功能参考 Kotlin 0.8.0。
这是独立移植客户端，不运行或模拟 APK，也不代表红果官方。

新增桌面界面、Electron 主进程、片单持久化、媒体连接层及接口适配按
GPL-3.0-only 提供；完整许可证见 LICENSE。

vendor/hongguo.cjs 保留原源码未修改，来源为 drpys 固定提交
22261adfa31435e3b3ef5a730b8a2a75bcaf1715；其 GPL-3.0 许可证和来源记录见
vendor/NOTICE.md、vendor/LICENSE.drpys。
漫剧榜单解析和视频编码适配参考原项目 Kotlin core。

Electron 与其附带的 Chromium / Node.js，以及 axios、cheerio、sm-crypto
保留各自许可证。运行包中的 LICENSE.electron.txt、LICENSES.chromium.html
及 resources/app.asar 中的依赖 LICENSE 文件属于本发行包。

请将此文件及完整对应源码与软件一起分发。对应源码包包含 desktop/ 全部源文件、
固定依赖锁文件和构建说明。未配置 Windows Authenticode 发布签名。
