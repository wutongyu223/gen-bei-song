# 材料包格式 v1

一份 UTF-8 JSON 对应一个不可变版本的材料。导入须预览确认。

```json
{
  "schemaVersion": 1,
  "id": "my-story",
  "version": 1,
  "title": "我选的段落",
  "author": "原作者",
  "source": "原始文件名或来源链接",
  "modules": ["gen"],
  "visibility": "private",
  "audioFile": "my-story-v1.mp3",
  "segments": [
    {
      "id": "s1",
      "text": "与原声吻合的这一句。",
      "start": 0,
      "end": 3.8,
      "uncertain": false
    }
  ]
}
```

- `id` 与段落 `id` 使用英文字母、数字、短横线、下划线，不随标题变化；同包段落 ID 唯一。
- 模块：`gen` 跟、`bei` 背、`song` 诵；文字材料省略音频与时间戳。
- 每个段落宜是能独立背准的短句；语义完整优先于机械字符数。长段落请在准备阶段拆成短句，以便记录局部背准。
- `translation`、`note` 可选。整篇译文尚未逐句对齐时，要明确注明，不能伪装为单句译文。
- `start`、`end` 为对应音频内的秒数；从源音频裁剪后必须相应平移，只保留完整落在片段内的句子。
- `uncertain:true` 表示待校核；不自动更改疑字。只有原声或出处校核后才设为 false。
- 纯音频可留一个空文本段落，没有时间戳时不显示伪字幕。
- `visibility` 是材料权限说明，不是自动发布开关。所有上传材料当前都需鉴权；没有任何自动公开上传路径。
- 音频导入另选文件，限制 50 MB；声音文件名在元数据中，实际对象按 ID/版本保存，不使用源文件路径。
- 改文本、段落顺序或音频内容时增加 `version`；旧版记录保留但不迁移掌握状态。
- 支持 MP3/M4A 等浏览器可播放格式；FFmpeg 准备脚本默认输出 MP3。上传音频不带原始磁盘路径。

参考实现：`src/schema.ts`；可下载示例位于 `public/material-example.json`。

长段落导入后，“背”会按标点显示小句；连续无标点的内容每 40 个 Unicode 字符拆一个练习单元。这只是显示与确认范围，材料的原文、ID 和版本不变。“诵”仍按原段落阅读。

练习记录向后兼容原来的 `confirmed` / `revoked` 整段 ID，增加可选 `confirmedRanges` / `revokedRanges`，例如 `{ "segmentId": "s1", "start": 0, "end": 12 }`。范围以 Unicode code point 为单位，起点含、终点不含；相邻/重叠范围合并，撤销只移除指定文字。`positionOffset` 记录段内续练字符位置。Agent 的只读进度接口也返回 `masteredRanges` 与 `positionOffset`；旧整段确认会按该版本原文展开为范围。
