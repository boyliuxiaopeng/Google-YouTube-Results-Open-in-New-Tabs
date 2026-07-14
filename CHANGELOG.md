# 更新日志

本文档记录 Simple Scrolling 用户脚本的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。


## [1.1.2] (2026-07-10)

### 新增
- @include 格式修改成多行
- 更新 namespace
- 修复 Google /search/ 路径，通过 normalizePathname() 统一去除尾部斜杠。
- 改进 Google 跳转链接解析，现在不仅能解析当前 Google 域名的 /url，还可以解析其他支持的 Google 国家或地区域名。
- 收紧 YouTube 频道路径，避免将以下无效路径当作频道：/@ & /channel/ & /user/ 同时继续支持频道子页面：/@channel/videos & /@channel/shorts & /@channel/community . 
- 加强 YouTube 移动网页版兼容，增加了移动端顶部导航和底部导航排除。 
- 更完整地尊重网页原始 target ，只有空 target 或 target="_self" 会被脚本接管。 
- 打开失败时保留原始导航，只有 GM_openInTab() 成功执行后，才调用：event.preventDefault(); & event.stopImmediatePropagation(); 如果打开新标签页发生异常，用户仍可在当前页面正常进入链接。


## [1.1.1] (2026-07-10)

### 新增
- mported from URL
- 更新错误的作者信息


## [1.1.0] (2026-07-10)

### 初始版本功能
- 基于[phathur](https://greasyfork.org/zh-CN/scripts/586344-google-youtube-results-open-in-new-tabs)版本重构
- 实现在新标签页中打开 Google 搜索结果和选定的 YouTube 内容链接
