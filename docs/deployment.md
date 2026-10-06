# 发布与同步配置

这是供个人使用的单用户应用。仓库中已实现完整接口，本地验证使用本地 D1/R2；线上配置使用 `production` 环境，网页来源已列入白名单。

## 线上地址

- 网站：https://wutongyu223.github.io/gen-bei-song/
- 代码与版本：https://github.com/wutongyu223/gen-bei-song
- 同步接口：https://gen-bei-song-api.gen-bei-song.workers.dev/api
- D1：`gen-bei-song`。云端仅有本人鉴权可读取的练习记录和材料。
- 当前 `production` 未绑定 R2：进度、文字和音频材料的练习位置均可同步。三段私人精选李笑来音频通过 Worker 的 `PRIVATE_AUDIO` 绑定提供，已连接设备可直接加载；其他音频仍需本地导入。以后本人开通 R2 并添加私有 bucket 绑定即可恢复通用音频上传。
- 静态网页只含公开的服务地址；连接密钥不在源码、构建、GitHub Actions 变量或 Release 文件中。

## 个人设备连接

私有连接 URL 存在部署机 `work/deploy/device.json` 中，未提交 Git。通过它打开网页会在本设备保存连接密钥，随后立即清除 URL 的凭据片段。不要将个人连接入口和二维码公开转发；普通网站 URL 可以分享。

现有浏览器未连接时也可在设置中填写服务地址与本人密钥；不要在共享设备保存连接。私有手机连接说明与二维码由部署机另行交付，不包含在 GitHub 仓库。

从主屏幕图标进入后若仍显示“连接同步”，打开设置，在“我的连接密钥或私人连接链接”中直接粘贴完整私人连接链接即可。应用只提取连接密钥，不会更换服务地址。音频在当前应用的材料页点击“附上本机音频”；文件名变化不会要求升级材料版本，也不会重置进度。Safari 与主屏幕应用是否共享存储仍需以真机为准。

## Cloudflare 服务

1. 在本人 Cloudflare 账号创建 D1 数据库和私有 R2 bucket。将实际数据库 ID、bucket 名填入 `wrangler.jsonc`。
2. 将 `ALLOWED_ORIGINS` 改为网页的实际 Origin，例如 `https://your-name.github.io`（不带项目路径）。不使用通配符。
3. 分别生成两枚随机密钥，使用 `wrangler secret put WRITE_TOKEN` 与 `wrangler secret put READ_TOKEN` 保存。不要将 `.dev.vars` 上传、提交或复制进静态前端。两枚密钥不可相同。
4. 经用户确认后执行迁移和发布：

```sh
npx wrangler d1 migrations apply DB --remote --env production
npx wrangler deploy --env production
```

5. 网页设置填 `https://your-worker.workers.dev/api` 和用户写入密钥。每台设备分别填写。Agent 单独配置只读密钥。

首版连接密钥保存在设备浏览器的本地存储中；不要在共享设备保存。服务不提供多人账号。服务端默认全部材料需鉴权，素材不进入公开前端。示例古文原文与项目自写释义可以随静态构建发布；本地课程音频与家书全文包保存在被忽略的 `media/`，精选音频另行部署至受鉴权保护的 Worker。

### 私人精选音频

`media/private-audio/` 只存放选定片段，路径为 `audio/<材料 ID>/<版本>.mp3`；材料 JSON、来源、裁剪时间和校对状态另存于 `media/prepared/`。两者都不提交 Git，也不进入 Pages 或 Release。重新部署 production 前必须恢复该目录中的全部片段，以免已有材料失去音频。

`run_worker_first: true` 让所有请求先进入 Worker。只有鉴权后的 `GET/HEAD /api/audio/<ID>/<版本>` 才调用音频绑定；原始 `/audio/...` 路径拒绝访问。音频返回 `private, no-store`，只读密钥可播放但不能替换。已准备的同一版本不能通过 PUT 覆盖。参见 [Cloudflare 绑定文档](https://developers.cloudflare.com/workers/static-assets/binding/) 和 [Worker 路由文档](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)。

`GET /api/health` 的 `preparedAudio` 仅表示精选播放能力，`audioSync` 仍为 false，表示通用音频上传未开通。当前三份精选仅用于跟读，机器字幕全部标为待校对，不作为逐字背诵原文。

## GitHub Pages 前端

1. 将项目代码放进用户确认的仓库；不要包括媒体、私有材料、记录、密钥。
2. 手动构建：`npm ci && npm run build`。默认相对路径适配项目子路径，主导航不依赖服务器路由。将 `dist/` 作为 Pages artifact 发布。
3. `.github/workflows/pages.yml` 提供手动启动的 Pages workflow，不会因提交自动发布。需在仓库 Settings → Pages 选择 GitHub Actions。
4. 打开 HTTPS 网页，配置同步服务。先预览导入材料，再明确选择是否上传。

未配置同步时仍可在此设备练习和保存记录；这不等于云同步已启用。

## Agent 读取

`GET /api/progress` 返回材料版本、模块、当前位置、累计时长、背准段落 ID、最近练习及每日时长；`GET /api/events?after=序号` 分页读取原始事件。请求头使用 `Authorization: Bearer 只读密钥`。写请求一律拒绝。

```sh
GBS_API_URL=https://your-worker.workers.dev/api \
GBS_READ_TOKEN=只读密钥 node scripts/read-progress.mjs
```

密钥宜从受保护环境变量加载，不放入命令历史、文档或项目文件。

部署机只读配置：

```sh
node scripts/read-progress.mjs work/deploy/agent.json
```

## 首次上线验收

真实手机 Safari 试听、拖动、A-B 循环；两台设备分别练后核对进度；暂停网络后练习，恢复后检查无重复记录。真机音频精度和 Wake Lock 仍待验证，手机尺寸模拟不替代真机结果。
