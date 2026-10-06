import type { Material } from "./schema";
export const seeds: Material[] = [
  {
    schemaVersion: 1,
    id: "sunzi-jipian",
    version: 1,
    title: "兵者，国之大事",
    author: "孙子 · 计篇",
    source: "《孙子兵法·计篇》开头，公版原文；现代释义为本项目说明",
    modules: ["bei"],
    visibility: "shareable",
    segments: [
      {
        id: "s1",
        text: "孙子曰：兵者，国之大事，死生之地，存亡之道，不可不察也。",
        translation: "战争是国家的大事，关系生死与存亡，不能不认真考察。",
        uncertain: false,
      },
      {
        id: "s2",
        text: "故经之以五事，校之以计，而索其情：一曰道，二曰天，三曰地，四曰将，五曰法。",
        translation:
          "从道、天、地、将、法五个方面衡量，比较双方条件，了解实际情况。",
        uncertain: false,
      },
      {
        id: "s3",
        text: "道者，令民与上同意也，故可以与之死，可以与之生，而不畏危。",
        uncertain: false,
      },
    ],
  },
  {
    schemaVersion: 1,
    id: "zeng-zhuan",
    version: 1,
    title: "求业之精，曰专而已",
    author: "曾国藩 · 致诸弟",
    source:
      "《曾国藩家书·述求学之方法》选段；释义为本项目说明。请以所用版本校核",
    modules: ["song", "bei"],
    visibility: "shareable",
    segments: [
      {
        id: "z1",
        text: "业之精不精，由我作主。",
        translation: "学业或本领是否精通，由我自己决定。",
        uncertain: false,
      },
      {
        id: "z2",
        text: "然则特患业之不精耳。求业之精，别无他法，曰专而已矣。",
        translation:
          "所以只应担心自己的本领不够精。要练精，别无他法，只有专心。",
        uncertain: false,
      },
      {
        id: "z3",
        text: "吾掘井多而无泉可饮，不专之咎也！",
        translation: "我挖了很多井，却没有泉水可喝，这是不专心的过失。",
        note: "选段并非整封信。完整原文、注释、译文可经材料包导入。",
        uncertain: false,
      },
    ],
  },
];
export const localAudio: Material = {
  schemaVersion: 1,
  id: "xiaolai-expression-local",
  version: 1,
  title: "提高自身的表达清晰度",
  author: "李笑来 · 2026.08.19",
  source: "用户本地课程音频；前五分钟试用片段，未核对字幕",
  modules: ["gen"],
  visibility: "private",
  audioFile: "xiaolai-expression-5min.mp3",
  segments: [
    {
      id: "audio",
      text: "先听几秒，找到气口，再跟着原声说。跟不上时，先跟住节奏。",
      note: "这段是练习提示，不是音频逐字稿。字幕尚未校对。",
      uncertain: true,
    },
  ],
};
