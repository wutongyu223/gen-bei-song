# 手机与小平板界面调整

2026-10-06。用户以 iPhone 17 Pro、OPPO Pad mini 的主屏幕图标打开应用。

## 问题与目标

原首页在 402×700 CSS 像素的窗口中高 1292 像素；三个练习入口分别结束于约 612、845、1075 像素。较大的宣传标题、重复说明和卡片底部按钮行占据了首屏。小平板使用三张窄长卡片和悬浮底部导航，缺少针对窗口形状的安排。

首页用于选择今天的练习，目标是让三个入口、当前材料和续练位置同时可见。阅读与材料列表继续按内容长度滚动。字号放大、特别长的材料名称或异常提示出现时，允许内容自然增长，保留滚动能力。

## 采用的设计原则

- [Apple Layout](https://developer.apple.com/design/human-interface-guidelines/layout)：依实际显示区域、方向和多任务窗口安排内容，避开系统安全区域。
- [Apple Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) 与 [Android 无障碍建议](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views)：原生平台分别建议至少 44 pt、48 dp 的触摸区域。本网页将首页主要控件设为至少 48×48 CSS 像素，并在实际页面检查其可点按区域；这些单位并非物理像素。
- [Android 自适应导航](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns)：窄窗口采用底部导航，较宽窗口采用侧边导航。这里按可用宽度与高度变化，兼顾平板分屏。
- [WebKit 主屏幕应用](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) 与 [安全区域](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)：配置独立显示的 manifest 和图标，并为状态栏、刘海及手势区留白。
- [WCAG 文字对比度](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)：提高浅色主题辅助文字和按钮文字的对比度。辅助灰色在页面背景上的计算对比度由约 3.59:1 提高至 4.63:1；本次没有声称完成全站无障碍审计。

## 实现

- 手机：收紧页头与标题，三个紧凑横向卡片同时呈现模块、材料、续练位置和开始按钮；每个入口保留至少 48 像素的触摸高度。较高窗口增加字号和卡片留白，较短窗口减少装饰说明。
- 小平板竖屏：侧边导航和宽列表；横屏的短窗口：侧边导航与三列卡片。横屏左右安全区域也进入内容宽度计算。
- 导航标记当前目的地；进入练习后继续采用专注阅读布局。
- 加入项目子路径内的 `manifest.webmanifest`、192/512 PNG 图标和 Apple 主屏幕图标，显示模式为 `standalone`。方向不锁定，缩放仍可使用。
- 所有调整根据窗口尺寸而变化；没有依赖设备型号或伪造屏幕尺寸。没有通过裁切页面或禁止滚动来实现首屏目标。

## 验证范围

浏览器验证包含 402×874（模拟上下安全区域）、402×700、390×664、360×640、600×900、768×1024、800×600、1024×530、874×402（模拟左右及底部安全区域）和 1280×720。检查页面溢出、九个主要控件的大小与命中区域，以及平板导航、进入/退出练习、manifest 和图标路径。

这些是代表性窗口和安全区域模拟，并非连接两台真实设备后的验收。实际视口仍受系统显示缩放、浏览器及主屏幕应用模式影响。
