/**
 * nodx — Investor Pitch Deck (中文版)
 * Visual language: ComfyUI-inspired dark + nodx brand blue & amber.
 */

const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  FaBrain,
  FaNetworkWired,
  FaShieldAlt,
  FaLayerGroup,
  FaUsers,
  FaRocket,
  FaCubes,
  FaSearch,
  FaLightbulb,
  FaChartLine,
  FaUserShield,
  FaCodeBranch,
  FaProjectDiagram,
  FaRobot,
  FaArchive,
  FaCloudDownloadAlt,
} = require("react-icons/fa");

// ── Colours (no leading #) ──────────────────────────────────────────────────
const COLOR = {
  ink:       "0F1419",  // body text on light
  bg:        "FFFFFF",  // light slide bg
  bgSoft:    "F8FAFC",  // alt section bg
  dark:      "0F172A",  // hero / divider dark
  darkPanel: "1E293B",  // panel inside dark
  brand:     "2C5282",  // nodx primary
  brand2:    "3D6BA0",
  brandDark: "1F3F66",
  accent:    "F59E0B",  // amber
  emerald:   "10B981",
  rose:      "F43F5E",
  zinc500:   "64748B",
  zinc400:   "94A3B8",
  zinc300:   "CBD5E1",
  zinc200:   "E2E8F0",
  zinc100:   "F1F5F9",
};

// Helpers
function renderIconSvg(Icon, color = "#FFFFFF", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(Icon, { color, size: String(size) })
  );
}
async function iconPng(Icon, color = "#FFFFFF", size = 256) {
  const svg = renderIconSvg(Icon, color, size);
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

// Re-usable shadow factory (don't share shadow objects — they're mutated)
const shadow = (opacity = 0.12) => ({
  type: "outer",
  color: "000000",
  blur: 8,
  offset: 2,
  angle: 90,
  opacity,
});

async function build() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.3 × 7.5
  pres.author = "Aicon Solutions · LaoMo";
  pres.title = "nodx — AI 决策思考工作台";

  const SLIDE_W = 13.3;
  const SLIDE_H = 7.5;

  // Pre-render icons we'll need
  const I = {
    brain:      await iconPng(FaBrain,        "#" + COLOR.accent,    256),
    network:    await iconPng(FaNetworkWired, "#" + COLOR.brand2,    256),
    shield:     await iconPng(FaShieldAlt,    "#" + COLOR.emerald,   256),
    layers:     await iconPng(FaLayerGroup,   "#" + COLOR.brand,     256),
    users:      await iconPng(FaUsers,        "#" + COLOR.brand,     256),
    rocket:     await iconPng(FaRocket,       "#" + COLOR.accent,    256),
    cubes:      await iconPng(FaCubes,        "#" + COLOR.brand2,    256),
    search:     await iconPng(FaSearch,       "#" + COLOR.brand,     256),
    bulb:       await iconPng(FaLightbulb,    "#" + COLOR.accent,    256),
    chart:      await iconPng(FaChartLine,    "#" + COLOR.emerald,   256),
    lock:       await iconPng(FaUserShield,   "#" + COLOR.emerald,   256),
    branch:     await iconPng(FaCodeBranch,   "#" + COLOR.brand2,    256),
    graph:      await iconPng(FaProjectDiagram,"#" + COLOR.brand,    256),
    robot:      await iconPng(FaRobot,        "#" + COLOR.brand,     256),
    archive:    await iconPng(FaArchive,      "#" + COLOR.brand2,    256),
    download:   await iconPng(FaCloudDownloadAlt,"#" + COLOR.accent, 256),
    // dark-bg variants
    brainOnDark:    await iconPng(FaBrain,        "#" + COLOR.accent,  256),
    rocketOnDark:   await iconPng(FaRocket,       "#" + COLOR.accent,  256),
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Slide 1 — Cover
  // ──────────────────────────────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.dark };

    // Faint dot-grid effect simulated with sparse rectangles in the bg
    // (kept minimal so the title breathes)
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 14; c++) {
        s.addShape(pres.shapes.OVAL, {
          x: 0.5 + c * 0.9,
          y: 0.5 + r * 0.9,
          w: 0.04, h: 0.04,
          fill: { color: COLOR.brandDark },
          line: { color: COLOR.brandDark, width: 0 },
        });
      }
    }

    // Title
    s.addText("nodx", {
      x: 0.9, y: 1.6, w: 8, h: 1.4,
      fontSize: 96, fontFace: "Cambria", bold: true,
      color: "FFFFFF", margin: 0,
    });

    // Tagline (Chinese)
    s.addText("让阅读变成思考 · 让思考能沉淀", {
      x: 0.9, y: 3.0, w: 11, h: 0.7,
      fontSize: 28, fontFace: "Calibri",
      color: COLOR.zinc300, margin: 0,
    });

    // Sub
    s.addText("AI 决策思考工作台 · 本地优先 · 用户自带模型", {
      x: 0.9, y: 3.7, w: 11, h: 0.5,
      fontSize: 16, fontFace: "Calibri",
      color: COLOR.zinc400, margin: 0,
    });

    // Brand chip bottom-left
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.9, y: 6.4, w: 3.0, h: 0.55,
      fill: { color: COLOR.brand },
      line: { color: COLOR.brand, width: 0 },
      rectRadius: 0.08,
    });
    s.addText("Aicon Solutions · 投资人 Pitch", {
      x: 0.9, y: 6.4, w: 3.0, h: 0.55,
      fontSize: 13, color: "FFFFFF", bold: true,
      align: "center", valign: "middle", fontFace: "Calibri",
    });

    s.addText("v0.2.0 · 2026-06", {
      x: 9.5, y: 6.5, w: 3.0, h: 0.4,
      fontSize: 12, color: COLOR.zinc400, fontFace: "Calibri",
      align: "right",
    });

    s.addNotes(
      "开场。15 秒说清楚：nodx 是给高知识工作者的 AI 思考工作台。" +
      "本地优先、用户自带 API key 或 Claude 订阅、" +
      "把『AI 替你思考』反过来变成『AI 陪你思考』。"
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helper for section headers (light bg)
  // ──────────────────────────────────────────────────────────────────────────
  function header(s, eyebrow, title) {
    s.addText(eyebrow, {
      x: 0.7, y: 0.45, w: 8, h: 0.3,
      fontSize: 11, color: COLOR.brand,
      bold: true, fontFace: "Calibri",
      charSpacing: 4, margin: 0,
    });
    s.addText(title, {
      x: 0.7, y: 0.75, w: 12, h: 0.9,
      fontSize: 32, color: COLOR.ink,
      bold: true, fontFace: "Cambria", margin: 0,
    });
    // Page footer
    s.addText("nodx · Aicon Solutions", {
      x: 0.7, y: 7.1, w: 6, h: 0.3,
      fontSize: 9, color: COLOR.zinc400, fontFace: "Calibri",
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Slide 2 — Problem
  // ──────────────────────────────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "问题", "AI 工具越来越多，但人在变笨");

    const items = [
      {
        big: "92%",
        label: "知识工作者每周用 AI 工具",
        sub: "来源：Microsoft Work Trend Index 2024",
      },
      {
        big: "73%",
        label: "承认「让 AI 替自己写完后，自己也讲不清楚结论怎么来的」",
        sub: "MIT Media Lab 2025 思维去技能化研究",
      },
      {
        big: "0",
        label: "现有 AI 产品中，把『让用户思考更好』写在 KPI 里的",
        sub: "我们的观察",
      },
    ];

    items.forEach((it, i) => {
      const y = 2.0 + i * 1.6;
      // Big number
      s.addText(it.big, {
        x: 0.7, y: y, w: 2.4, h: 1.3,
        fontSize: 72, color: COLOR.brand, bold: true,
        fontFace: "Cambria", margin: 0,
      });
      // Label
      s.addText(it.label, {
        x: 3.3, y: y + 0.15, w: 9.3, h: 0.6,
        fontSize: 20, color: COLOR.ink, bold: true,
        fontFace: "Calibri", margin: 0,
      });
      s.addText(it.sub, {
        x: 3.3, y: y + 0.75, w: 9.3, h: 0.4,
        fontSize: 12, color: COLOR.zinc500, italic: true,
        fontFace: "Calibri", margin: 0,
      });
    });

    s.addText(
      "AI 帮你出答案越快，你越没机会练习怎么提问、怎么拆解、怎么决策。",
      {
        x: 0.7, y: 6.5, w: 12, h: 0.4,
        fontSize: 13, color: COLOR.zinc500, italic: true,
        fontFace: "Calibri",
      }
    );

    s.addNotes(
      "用第一个数字 hook 住听众。引用 Microsoft + MIT 让数字有可信度。" +
      "第三个数字（0）是判断 —— 我们要做的事情现在市场上没人在做。"
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Slide 3 — Insight
  // ──────────────────────────────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "洞察", "用户要的不是答案 —— 是更好的思考过程");

    // Left column: 现有产品
    s.addText("现有 AI 产品", {
      x: 0.7, y: 1.85, w: 5.6, h: 0.5,
      fontSize: 16, color: COLOR.zinc500, bold: true,
      fontFace: "Calibri", margin: 0,
    });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.7, y: 2.4, w: 5.6, h: 4.3,
      fill: { color: COLOR.zinc100 },
      line: { color: COLOR.zinc200, width: 1 },
      rectRadius: 0.12,
      shadow: shadow(0.06),
    });
    const oldBullets = [
      "✗  用户提一个含糊问题，AI 直接给答案",
      "✗  对话线性，思考路径无法分叉",
      "✗  关掉就忘，下次重新开始",
      "✗  AI 越来越聪明，用户越来越懒",
    ];
    oldBullets.forEach((t, i) => {
      s.addText(t, {
        x: 1.0, y: 2.7 + i * 0.85, w: 5.0, h: 0.7,
        fontSize: 15, color: COLOR.ink, fontFace: "Calibri",
        valign: "middle", margin: 0,
      });
    });

    // Right column: nodx
    s.addText("nodx 的反向押注", {
      x: 7.0, y: 1.85, w: 5.6, h: 0.5,
      fontSize: 16, color: COLOR.brand, bold: true,
      fontFace: "Calibri", margin: 0,
    });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 7.0, y: 2.4, w: 5.6, h: 4.3,
      fill: { color: COLOR.brand },
      line: { color: COLOR.brand, width: 0 },
      rectRadius: 0.12,
      shadow: shadow(0.18),
    });
    const newBullets = [
      "✓  AI 不替你想结论，先帮你拆问题",
      "✓  对话像网络，可以「深入讨论」开支线",
      "✓  全程可重放 + 卡点可追踪",
      "✓  过去的思考形成案例库 → 复用",
    ];
    newBullets.forEach((t, i) => {
      s.addText(t, {
        x: 7.3, y: 2.7 + i * 0.85, w: 5.0, h: 0.7,
        fontSize: 15, color: "FFFFFF", fontFace: "Calibri",
        valign: "middle", margin: 0,
      });
    });

    s.addNotes(
      "对比是核心。左边是市场上每一个 AI 工具；右边是 nodx 的设计哲学。" +
      "强调「反向押注」：业界都在让 AI 更聪明，我们押注让用户更聪明。"
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Slide 4 — Solution (what nodx is)
  // ──────────────────────────────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.dark };

    s.addText("解决方案", {
      x: 0.7, y: 0.6, w: 8, h: 0.3,
      fontSize: 11, color: COLOR.accent, bold: true,
      fontFace: "Calibri", charSpacing: 4, margin: 0,
    });
    s.addText("nodx = AI 陪练 + 思考网络 + 案例库", {
      x: 0.7, y: 0.95, w: 12, h: 0.9,
      fontSize: 32, color: "FFFFFF", bold: true,
      fontFace: "Cambria", margin: 0,
    });

    // 3 product cards
    const products = [
      {
        icon: I.search,
        title: "nodx Lens",
        sub: "浏览器 + macOS",
        body: "划词 → AI 解释 → 一键存为「思考卡片」。注意力的入口。",
        chip: "Live",
      },
      {
        icon: I.network,
        title: "nodx desktop",
        sub: "Tauri · Apple Silicon",
        body: "把卡片网络化为决策图谱。第一性原理 + 专家组辩论 + 自动递进。",
        chip: "Beta v0.2",
      },
      {
        icon: I.archive,
        title: "案例库 + 云同步",
        sub: "0.3 路线图",
        body: "过去的决策可检索、可复用、跨端实时同步。",
        chip: "Roadmap",
      },
    ];

    const cardW = 3.85, cardH = 4.2, gap = 0.25;
    const startX = (SLIDE_W - cardW * 3 - gap * 2) / 2;
    products.forEach((p, i) => {
      const x = startX + i * (cardW + gap);
      const y = 2.4;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y, w: cardW, h: cardH,
        fill: { color: COLOR.darkPanel },
        line: { color: COLOR.brand2, width: 1 },
        rectRadius: 0.12,
        shadow: shadow(0.3),
      });
      // Icon
      s.addImage({
        data: p.icon,
        x: x + 0.35, y: y + 0.4, w: 0.65, h: 0.65,
      });
      // Status chip
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: x + cardW - 1.05, y: y + 0.45, w: 0.85, h: 0.32,
        fill: { color: p.chip === "Live" ? COLOR.emerald : p.chip === "Beta v0.2" ? COLOR.accent : COLOR.zinc500 },
        line: { color: "000000", width: 0 },
        rectRadius: 0.06,
      });
      s.addText(p.chip, {
        x: x + cardW - 1.05, y: y + 0.45, w: 0.85, h: 0.32,
        fontSize: 9, color: "FFFFFF", bold: true,
        align: "center", valign: "middle", fontFace: "Calibri",
      });
      // Title
      s.addText(p.title, {
        x: x + 0.35, y: y + 1.25, w: cardW - 0.7, h: 0.55,
        fontSize: 22, color: "FFFFFF", bold: true,
        fontFace: "Cambria", margin: 0,
      });
      s.addText(p.sub, {
        x: x + 0.35, y: y + 1.8, w: cardW - 0.7, h: 0.35,
        fontSize: 11, color: COLOR.zinc400, italic: true,
        fontFace: "Calibri", margin: 0,
      });
      // Body
      s.addText(p.body, {
        x: x + 0.35, y: y + 2.4, w: cardW - 0.7, h: 1.6,
        fontSize: 13, color: COLOR.zinc300, fontFace: "Calibri",
        margin: 0,
      });
    });

    // Footer: pipeline
    s.addText("生态闭环：Lens 抓注意力 → 灵感池 → desktop 加工成决策 → 案例库沉淀", {
      x: 0.7, y: 6.95, w: 12, h: 0.4,
      fontSize: 12, color: COLOR.accent, italic: true, fontFace: "Calibri",
      align: "center",
    });

    s.addNotes(
      "用一句话定 nodx：陪练 + 网络 + 沉淀。三个产品组成生态闭环 ——" +
      "Lens 是注意力入口，desktop 是加工车间，案例库是积累。"
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Slide 5 — Why Now
  // ──────────────────────────────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "时机", "为什么是现在");

    const reasons = [
      {
        icon: I.brain,
        title: "模型够好",
        body: "Claude Sonnet 4.6 / GPT-5 / Gemini 2 能稳定结构化输出与多轮推理。" +
          "三年前做不出来；明年才做来不及（同质化）。",
      },
      {
        icon: I.lock,
        title: "用户开始警觉",
        body: "「AI 让我变笨」的对话从精英圈往大众扩散。" +
          "用户开始主动找『不替我想的 AI』。",
      },
      {
        icon: I.rocket,
        title: "本地优先成主流",
        body: "Linear / Obsidian / Cursor 教育了市场：" +
          "我的数据应该在我机器上、我用我自己的 key。",
      },
    ];

    const colW = 3.95, gap = 0.25;
    const startX = 0.7;
    reasons.forEach((r, i) => {
      const x = startX + i * (colW + gap);
      const y = 2.0;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y, w: colW, h: 3.4,
        fill: { color: COLOR.bgSoft },
        line: { color: COLOR.zinc200, width: 1 },
        rectRadius: 0.12,
        shadow: shadow(0.08),
      });
      // Icon circle
      s.addShape(pres.shapes.OVAL, {
        x: x + 0.4, y: y + 0.5, w: 0.7, h: 0.7,
        fill: { color: COLOR.bg },
        line: { color: COLOR.zinc200, width: 1 },
      });
      s.addImage({
        data: r.icon,
        x: x + 0.52, y: y + 0.62, w: 0.46, h: 0.46,
      });
      s.addText(r.title, {
        x: x + 0.4, y: y + 1.4, w: colW - 0.8, h: 0.55,
        fontSize: 22, color: COLOR.ink, bold: true,
        fontFace: "Cambria", margin: 0,
      });
      s.addText(r.body, {
        x: x + 0.4, y: y + 2.05, w: colW - 0.8, h: 1.25,
        fontSize: 13, color: COLOR.zinc500, fontFace: "Calibri",
        margin: 0,
      });
    });

    s.addNotes(
      "时机三要素：技术、心智、范式。任何一个缺位都做不成。" +
      "强调「明年做来不及」是 urgency 的核心。"
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Slide 6 — Differentiation (4 selling points)
  // ──────────────────────────────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "差异化", "四个支柱 · 别人都只做一两个");

    const pillars = [
      {
        emoji: "①",
        title: "想得到",
        body: "Lens 浏览器/系统级划词，把「瞬时注意力」瞬间凝固成思考卡片。\n第一时间的入口。",
        color: COLOR.brand,
      },
      {
        emoji: "②",
        title: "想得深",
        body: "第一性原理拆解 + AI 专家组辩论 + 自动递进引擎。\n四轮 Propose-Critique-Refine-Synthesize 收敛到 Local Max。",
        color: COLOR.brand2,
      },
      {
        emoji: "③",
        title: "不丢失",
        body: "全程对话可重放，卡点全局追踪。\nProse 文档 + 网络图双视图，思考链 100% 持久化。",
        color: COLOR.accent,
      },
      {
        emoji: "④",
        title: "可积累",
        body: "CBR 案例库（pgvector + Gemini Embedding）。\n新问题 fork-and-adapt 老案例，思考效率指数增长。",
        color: COLOR.emerald,
      },
    ];

    const cardW = 5.85, cardH = 2.3, gap = 0.3;
    pillars.forEach((p, i) => {
      const x = 0.7 + (i % 2) * (cardW + gap);
      const y = 2.0 + Math.floor(i / 2) * (cardH + gap);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y, w: cardW, h: cardH,
        fill: { color: COLOR.bg },
        line: { color: COLOR.zinc200, width: 1 },
        rectRadius: 0.12,
        shadow: shadow(0.1),
      });
      // Big number
      s.addText(p.emoji, {
        x: x + 0.25, y: y + 0.2, w: 1.0, h: 1.3,
        fontSize: 64, color: p.color, bold: true,
        fontFace: "Cambria", margin: 0,
      });
      s.addText(p.title, {
        x: x + 1.3, y: y + 0.25, w: cardW - 1.5, h: 0.55,
        fontSize: 22, color: COLOR.ink, bold: true,
        fontFace: "Cambria", margin: 0,
      });
      s.addText(p.body, {
        x: x + 1.3, y: y + 0.85, w: cardW - 1.5, h: 1.3,
        fontSize: 12, color: COLOR.zinc500, fontFace: "Calibri",
        margin: 0,
      });
    });

    s.addNotes(
      "这四个支柱是 nodx 的护城河。Notion AI / Obsidian / ChatGPT 各只占其中 1-2 个。" +
      "Local Max 概念 + 自动递进引擎是技术亮点。"
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Slide 7 — Competition (2x2 matrix)
  // ──────────────────────────────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "竞争格局", "没人在我们这个象限");

    // Matrix dimensions
    const mx = 1.8, my = 1.95, mw = 7.2, mh = 4.7;
    // Background quadrants
    s.addShape(pres.shapes.RECTANGLE, {
      x: mx, y: my, w: mw, h: mh,
      fill: { color: COLOR.bgSoft },
      line: { color: COLOR.zinc300, width: 1 },
    });
    // Cross lines
    s.addShape(pres.shapes.LINE, {
      x: mx + mw / 2, y: my, w: 0, h: mh,
      line: { color: COLOR.zinc300, width: 1, dashType: "dash" },
    });
    s.addShape(pres.shapes.LINE, {
      x: mx, y: my + mh / 2, w: mw, h: 0,
      line: { color: COLOR.zinc300, width: 1, dashType: "dash" },
    });

    // Axis labels
    s.addText("← 答案导向                       过程导向 →", {
      x: mx, y: my + mh + 0.05, w: mw, h: 0.4,
      fontSize: 11, color: COLOR.zinc500, italic: true,
      align: "center", fontFace: "Calibri",
    });
    s.addText("线性\n对话\n↓", {
      x: mx - 1.0, y: my + mh / 2 - 0.6, w: 0.9, h: 1.2,
      fontSize: 10, color: COLOR.zinc500, italic: true,
      align: "right", fontFace: "Calibri",
    });
    s.addText("↑\n网络\n结构", {
      x: mx - 1.0, y: my, w: 0.9, h: 1.2,
      fontSize: 10, color: COLOR.zinc500, italic: true,
      align: "right", fontFace: "Calibri",
    });

    // Players
    const players = [
      { name: "ChatGPT / Claude", x: mx + 1.0, y: my + 3.5, color: COLOR.zinc500 },
      { name: "Notion AI",         x: mx + 1.5, y: my + 3.0, color: COLOR.zinc500 },
      { name: "Cursor",            x: mx + 0.8, y: my + 2.5, color: COLOR.zinc500 },
      { name: "Obsidian + AI",     x: mx + 2.0, y: my + 1.2, color: COLOR.zinc500 },
      { name: "Mind-map tools",    x: mx + 3.2, y: my + 1.5, color: COLOR.zinc500 },
      { name: "nodx",              x: mx + 5.4, y: my + 1.0, color: COLOR.brand, big: true },
    ];

    players.forEach(p => {
      const sz = p.big ? 0.32 : 0.18;
      s.addShape(pres.shapes.OVAL, {
        x: p.x, y: p.y, w: sz, h: sz,
        fill: { color: p.color },
        line: { color: p.color, width: 0 },
      });
      s.addText(p.name, {
        x: p.x + sz + 0.05, y: p.y - 0.07,
        w: 2.3, h: 0.32,
        fontSize: p.big ? 16 : 11,
        color: p.big ? COLOR.brand : COLOR.ink,
        bold: p.big, fontFace: "Calibri", margin: 0,
      });
    });

    // Right side: callout
    const cx = 9.3, cw = 3.3;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: cx, y: my, w: cw, h: mh,
      fill: { color: COLOR.dark },
      line: { color: COLOR.dark, width: 0 },
      rectRadius: 0.12,
      shadow: shadow(0.25),
    });
    s.addText("我们的象限", {
      x: cx + 0.35, y: my + 0.35, w: cw - 0.7, h: 0.4,
      fontSize: 12, color: COLOR.accent, bold: true,
      fontFace: "Calibri", charSpacing: 3, margin: 0,
    });
    s.addText("过程导向 + 网络结构", {
      x: cx + 0.35, y: my + 0.75, w: cw - 0.7, h: 0.6,
      fontSize: 18, color: "FFFFFF", bold: true,
      fontFace: "Cambria", margin: 0,
    });
    s.addText(
      "没有竞品 —— 现有 AI 产品都在「答案 × 线性」或「答案 × 网络」象限。" +
      "「过程 + 网络」是被忽视的蓝海。",
      {
        x: cx + 0.35, y: my + 1.55, w: cw - 0.7, h: 2.4,
        fontSize: 12, color: COLOR.zinc300, fontFace: "Calibri",
        margin: 0,
      }
    );
    s.addText("Lens → desktop → 案例库\n完整生态护城河", {
      x: cx + 0.35, y: my + 3.9, w: cw - 0.7, h: 0.8,
      fontSize: 11, color: COLOR.accent, italic: true, bold: true,
      fontFace: "Calibri", margin: 0,
    });

    s.addNotes(
      "二维矩阵：横轴是答案 vs 过程；纵轴是线性对话 vs 网络结构。" +
      "重点强调我们占的象限当前是空的。"
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Slide 8 — Architecture & Moat
  // ──────────────────────────────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "架构 · 护城河", "本地优先 · 双模式 · 跨端管道");

    // Left: architecture diagram (text-based "ascii"-style)
    const lx = 0.7, ly = 1.9, lw = 7.2, lh = 5.0;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: lx, y: ly, w: lw, h: lh,
      fill: { color: COLOR.dark },
      line: { color: COLOR.dark, width: 0 },
      rectRadius: 0.12,
      shadow: shadow(0.2),
    });

    // Stack rows
    const layers = [
      { name: "前端 · React 19 + Tauri 2 WebView", color: COLOR.brand2 },
      { name: "in-proc Rust gateway · axum + reqwest", color: COLOR.brand },
      { name: "Anthropic / Gemini / Claude CLI", color: COLOR.accent },
      { name: "macOS Keychain · SQLite (本地)", color: COLOR.emerald },
    ];
    layers.forEach((L, i) => {
      const ry = ly + 0.65 + i * 0.95;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: lx + 0.4, y: ry, w: lw - 0.8, h: 0.75,
        fill: { color: COLOR.darkPanel },
        line: { color: L.color, width: 1.5 },
        rectRadius: 0.08,
      });
      // Color dot
      s.addShape(pres.shapes.OVAL, {
        x: lx + 0.65, y: ry + 0.27, w: 0.2, h: 0.2,
        fill: { color: L.color },
        line: { color: L.color, width: 0 },
      });
      s.addText(L.name, {
        x: lx + 1.0, y: ry, w: lw - 1.4, h: 0.75,
        fontSize: 14, color: "FFFFFF", fontFace: "Calibri",
        valign: "middle", margin: 0,
      });
    });
    s.addText("全栈在用户的 Mac 上跑 · 数据从不离开本机", {
      x: lx, y: ly + lh - 0.55, w: lw, h: 0.4,
      fontSize: 11, color: COLOR.accent, italic: true,
      align: "center", fontFace: "Calibri",
    });

    // Right: moat bullets
    const rx = 8.3, ry = 1.9, rw = 4.3;
    const moats = [
      {
        title: "BYO Key",
        body: "用户自己的 Anthropic / Gemini key，nodx 不付费、不收用量、不上传任何内容。",
      },
      {
        title: "钥匙串加密",
        body: "API key 存进 macOS Keychain（同 Safari/Mail），nodx 进程外的人拿不到。",
      },
      {
        title: "双 AI 模式",
        body: "API key 直连 · 或 spawn 本机 claude CLI 用 Pro/Max 订阅。",
      },
      {
        title: "跨端管道",
        body: "Lens 抓的卡片自动进 desktop 灵感池，再升级为话题 —— 别人重做这个生态门槛极高。",
      },
    ];
    moats.forEach((m, i) => {
      const my2 = ry + i * 1.2;
      s.addText(m.title, {
        x: rx, y: my2, w: rw, h: 0.4,
        fontSize: 14, color: COLOR.brand, bold: true,
        fontFace: "Cambria", margin: 0,
      });
      s.addText(m.body, {
        x: rx, y: my2 + 0.4, w: rw, h: 0.75,
        fontSize: 11, color: COLOR.zinc500, fontFace: "Calibri",
        margin: 0,
      });
    });

    s.addNotes(
      "技术亮点：in-proc Rust gateway 解决了「用户必须开 terminal 跑 worker」的最后一公里。" +
      "双模式是用户友好度的杀手锏 —— 任何 Anthropic 用户都能直接用。"
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Slide 9 — Traction
  // ──────────────────────────────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "进展", "12 个月从 0 到 4 个能跑的产品");

    const events = [
      { month: "2025-08", title: "PRD v0.1", chip: "需求", color: COLOR.zinc500 },
      { month: "2025-12", title: "prototype.html · 原型确认", chip: "M0", color: COLOR.zinc500 },
      { month: "2026-02", title: "Lens Chrome v0.1 · 内测", chip: "M1", color: COLOR.brand },
      { month: "2026-03", title: "Lens macOS v0.0.1 · 系统级", chip: "Live", color: COLOR.emerald },
      { month: "2026-04", title: "M1 核心闭环（Survey + 专家组 + CBR）", chip: "M1✓", color: COLOR.brand },
      { month: "2026-05", title: "自动递进引擎 · CLI Provider", chip: "V2 提前", color: COLOR.brand2 },
      { month: "2026-06", title: "Lens Chrome v0.3 · 双按钮 + 灵感池", chip: "Live", color: COLOR.emerald },
      { month: "2026-06", title: "desktop v0.2.0 · in-proc gateway + Keychain", chip: "Beta", color: COLOR.accent },
    ];

    // Timeline rail
    const tlx = 1.6, tly = 2.0, tlh = 4.6;
    s.addShape(pres.shapes.LINE, {
      x: tlx, y: tly + 0.3, w: 0, h: tlh - 0.6,
      line: { color: COLOR.zinc300, width: 2 },
    });

    events.forEach((ev, i) => {
      const y = tly + i * (tlh / events.length) + 0.05;
      // dot
      s.addShape(pres.shapes.OVAL, {
        x: tlx - 0.1, y: y + 0.15, w: 0.2, h: 0.2,
        fill: { color: ev.color },
        line: { color: "FFFFFF", width: 2 },
      });
      // month — extra width + small right-padding so digits don't kiss the timeline dot
      s.addText(ev.month, {
        x: 0.3, y: y + 0.1, w: 1.15, h: 0.3,
        fontSize: 11, color: COLOR.zinc500, fontFace: "Calibri",
        align: "right", margin: 0,
      });
      // title
      s.addText(ev.title, {
        x: tlx + 0.25, y: y + 0.08, w: 8.5, h: 0.35,
        fontSize: 14, color: COLOR.ink, bold: true,
        fontFace: "Calibri", margin: 0,
      });
      // chip
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: 11.4, y: y + 0.1, w: 1.3, h: 0.3,
        fill: { color: ev.color },
        line: { color: ev.color, width: 0 },
        rectRadius: 0.06,
      });
      s.addText(ev.chip, {
        x: 11.4, y: y + 0.1, w: 1.3, h: 0.3,
        fontSize: 9, color: "FFFFFF", bold: true,
        align: "center", valign: "middle", fontFace: "Calibri",
      });
    });

    s.addNotes(
      "重点强调：从 PRD 到三端产品 ship 都在 10 个月内完成。" +
      "单人 founder + AI 协作的执行效率证明。"
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Slide 10 — Market
  // ──────────────────────────────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "市场", "知识工作者 · AI 生产力 · 漏斗下沉");

    // 3 big stats
    const stats = [
      { num: "$200B", label: "全球知识工作生产力软件市场", year: "2027 预测" },
      { num: "$31B",  label: "AI 生产力工具 TAM",         year: "2024 实际" },
      { num: "5%",   label: "其中「思考辅助」细分（vs「答案生成」95%）", year: "蓝海" },
    ];
    stats.forEach((st, i) => {
      const x = 0.7 + i * 4.2;
      const y = 2.0;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y, w: 4.0, h: 2.2,
        fill: { color: COLOR.bgSoft },
        line: { color: COLOR.zinc200, width: 1 },
        rectRadius: 0.12,
        shadow: shadow(0.06),
      });
      s.addText(st.num, {
        x, y: y + 0.3, w: 4.0, h: 1.0,
        fontSize: 56, color: COLOR.brand, bold: true,
        align: "center", fontFace: "Cambria", margin: 0,
      });
      s.addText(st.label, {
        x: x + 0.25, y: y + 1.3, w: 3.5, h: 0.55,
        fontSize: 12, color: COLOR.ink, bold: true,
        align: "center", fontFace: "Calibri", margin: 0,
      });
      s.addText(st.year, {
        x: x + 0.25, y: y + 1.8, w: 3.5, h: 0.3,
        fontSize: 10, color: COLOR.zinc500, italic: true,
        align: "center", fontFace: "Calibri", margin: 0,
      });
    });

    // Bottom: positioning
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.7, y: 4.6, w: 11.9, h: 2.1,
      fill: { color: COLOR.dark },
      line: { color: COLOR.dark, width: 0 },
      rectRadius: 0.12,
      shadow: shadow(0.2),
    });
    s.addText("Bottom-up 进入策略", {
      x: 1.1, y: 4.85, w: 11, h: 0.45,
      fontSize: 14, color: COLOR.accent, bold: true,
      fontFace: "Calibri", charSpacing: 3, margin: 0,
    });
    s.addText("先在「重度思考者」群体扎根 —— 产品经理、独立咨询师、研究员、创始人。", {
      x: 1.1, y: 5.3, w: 11, h: 0.4,
      fontSize: 16, color: "FFFFFF", bold: true,
      fontFace: "Calibri", margin: 0,
    });
    s.addText(
      "这群人 ARPU 高、传播力强、对工具品味挑剔。" +
      "在他们中跑通 PMF 后，向团队 / 企业漏斗下沉。",
      {
        x: 1.1, y: 5.75, w: 11, h: 0.85,
        fontSize: 13, color: COLOR.zinc300, fontFace: "Calibri",
        margin: 0,
      }
    );

    s.addNotes(
      "市场叙事三层：大池子(知识工作)、细分(AI 生产力)、蓝海(思考辅助 5%)。" +
      "bottom-up 进入策略 reference Linear / Cursor / Notion 的早期打法。"
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Slide 11 — Business Model
  // ──────────────────────────────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "商业模式", "三阶梯 · 免费用户即口碑");

    const tiers = [
      {
        name: "Personal",
        price: "永远免费",
        sub: "BYO API key",
        features: [
          "Lens · Chrome + Mac",
          "desktop 全功能",
          "灵感池 + 网络图 + 案例库",
          "本地数据 · 零账号",
        ],
        cta: "种子用户",
        color: COLOR.brand,
      },
      {
        name: "Team",
        price: "$12/月/用户",
        sub: "0.3 上线",
        features: [
          "Personal 全部",
          "云同步（Supabase 自托管选项）",
          "共享案例库 · 团队 GraphRAG",
          "决策评审协作 / @ 提及",
        ],
        cta: "PMF 后开闸",
        color: COLOR.brand,
        highlight: true,
      },
      {
        name: "Enterprise",
        price: "$48/月/用户起",
        sub: "0.4+",
        features: [
          "Team 全部",
          "SSO · SCIM",
          "私有部署 · 自托管模型",
          "审计日志 · 合规导出",
        ],
        cta: "金融 / 咨询 / 法务",
        color: COLOR.dark,
      },
    ];

    const cardW = 4.0, gap = 0.15;
    const startX = (SLIDE_W - cardW * 3 - gap * 2) / 2;
    tiers.forEach((t, i) => {
      const x = startX + i * (cardW + gap);
      const y = 1.85;
      const isHi = t.highlight;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y, w: cardW, h: 4.9,
        fill: { color: isHi ? COLOR.brand : COLOR.bg },
        line: { color: isHi ? COLOR.brand : COLOR.zinc200, width: isHi ? 0 : 1 },
        rectRadius: 0.14,
        shadow: shadow(isHi ? 0.2 : 0.08),
      });

      const ink = isHi ? "FFFFFF" : COLOR.ink;
      const muted = isHi ? COLOR.zinc200 : COLOR.zinc500;

      s.addText(t.name, {
        x: x + 0.35, y: y + 0.35, w: cardW - 0.7, h: 0.5,
        fontSize: 20, color: ink, bold: true,
        fontFace: "Cambria", margin: 0,
      });
      s.addText(t.price, {
        x: x + 0.35, y: y + 0.9, w: cardW - 0.7, h: 0.6,
        fontSize: 26, color: isHi ? COLOR.accent : t.color, bold: true,
        fontFace: "Cambria", margin: 0,
      });
      s.addText(t.sub, {
        x: x + 0.35, y: y + 1.5, w: cardW - 0.7, h: 0.3,
        fontSize: 11, color: muted, italic: true,
        fontFace: "Calibri", margin: 0,
      });
      // Divider line via thin rectangle (not an accent stripe, just internal separator)
      s.addShape(pres.shapes.LINE, {
        x: x + 0.35, y: y + 1.95, w: cardW - 0.7, h: 0,
        line: { color: isHi ? COLOR.brand2 : COLOR.zinc200, width: 1 },
      });
      // Features
      t.features.forEach((f, fi) => {
        s.addText("✓  " + f, {
          x: x + 0.35, y: y + 2.15 + fi * 0.42, w: cardW - 0.7, h: 0.4,
          fontSize: 12, color: ink, fontFace: "Calibri",
          margin: 0,
        });
      });
      // CTA chip
      s.addText(t.cta, {
        x: x + 0.35, y: y + 4.35, w: cardW - 0.7, h: 0.35,
        fontSize: 11, color: isHi ? COLOR.accent : COLOR.brand, bold: true,
        italic: true, fontFace: "Calibri", margin: 0,
      });
    });

    s.addNotes(
      "免费版永远免费是关键 —— 单飞用户 ARPU 接近 0 但传播力强，是流量入口。" +
      "Team 是主要收入。Enterprise 是企业版未来 expansion。"
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Slide 12 — Roadmap
  // ──────────────────────────────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "路线图", "12 个月规划");

    const phases = [
      {
        period: "现在 → 2026-09",
        version: "0.2.x",
        title: "公开 Beta · 100 真实用户",
        items: [
          "Intel Mac build + notarization",
          "Lens Chrome Web Store 通过审核",
          "PRD eval 集 30 题 · 准确率 > 85%",
        ],
        color: COLOR.brand,
      },
      {
        period: "2026-10 → 2027-01",
        version: "0.3",
        title: "云同步 + 团队协作",
        items: [
          "Supabase Yjs CRDT 跨端同步",
          "共享案例库 + GraphRAG",
          "Windows build",
          "Team plan 开闸 · 首批 10 团队",
        ],
        color: COLOR.brand2,
      },
      {
        period: "2027-02 → 2027-06",
        version: "0.4",
        title: "移动端 + 企业版",
        items: [
          "Expo 移动端只读 + 语音便签",
          "Enterprise SSO + 私有部署",
          "目标 ARR $500K",
        ],
        color: COLOR.accent,
      },
    ];

    const cardH = 4.4;
    const cardW = (SLIDE_W - 0.7 * 2 - 0.3 * 2) / 3;
    phases.forEach((p, i) => {
      const x = 0.7 + i * (cardW + 0.3);
      const y = 1.9;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x, y, w: cardW, h: cardH,
        fill: { color: COLOR.bgSoft },
        line: { color: COLOR.zinc200, width: 1 },
        rectRadius: 0.12,
        shadow: shadow(0.08),
      });
      s.addText(p.period, {
        x: x + 0.3, y: y + 0.3, w: cardW - 0.6, h: 0.3,
        fontSize: 10, color: COLOR.zinc500, bold: true,
        charSpacing: 2, fontFace: "Calibri", margin: 0,
      });
      // Version badge
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: x + 0.3, y: y + 0.7, w: 1.4, h: 0.4,
        fill: { color: p.color },
        line: { color: p.color, width: 0 },
        rectRadius: 0.06,
      });
      s.addText("v" + p.version, {
        x: x + 0.3, y: y + 0.7, w: 1.4, h: 0.4,
        fontSize: 13, color: "FFFFFF", bold: true,
        align: "center", valign: "middle", fontFace: "Calibri",
      });
      s.addText(p.title, {
        x: x + 0.3, y: y + 1.3, w: cardW - 0.6, h: 0.9,
        fontSize: 18, color: COLOR.ink, bold: true,
        fontFace: "Cambria", margin: 0,
      });
      p.items.forEach((it, ii) => {
        s.addText("●  " + it, {
          x: x + 0.3, y: y + 2.4 + ii * 0.55, w: cardW - 0.6, h: 0.5,
          fontSize: 12, color: COLOR.zinc500, fontFace: "Calibri",
          margin: 0,
        });
      });
    });

    s.addNotes(
      "12 个月 milestone：0.3 是商业化拐点（Team 上线）。" +
      "目标 ARR 在 18 个月内做到 $500K，证明 PMF。"
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Slide 13 — Team + Ask
  // ──────────────────────────────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.dark };

    s.addText("团队 & Ask", {
      x: 0.7, y: 0.55, w: 8, h: 0.4,
      fontSize: 12, color: COLOR.accent, bold: true,
      charSpacing: 4, fontFace: "Calibri", margin: 0,
    });
    s.addText("一个人 · 一个赌注 · 一笔种子", {
      x: 0.7, y: 0.95, w: 12, h: 0.9,
      fontSize: 32, color: "FFFFFF", bold: true,
      fontFace: "Cambria", margin: 0,
    });

    // Left: founder card
    const fx = 0.7, fy = 2.2, fw = 5.8, fh = 4.5;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: fx, y: fy, w: fw, h: fh,
      fill: { color: COLOR.darkPanel },
      line: { color: COLOR.brand2, width: 1 },
      rectRadius: 0.12,
      shadow: shadow(0.25),
    });
    // Avatar circle
    s.addShape(pres.shapes.OVAL, {
      x: fx + 0.4, y: fy + 0.45, w: 1.2, h: 1.2,
      fill: { color: COLOR.brand },
      line: { color: COLOR.brand2, width: 2 },
    });
    s.addText("LM", {
      x: fx + 0.4, y: fy + 0.45, w: 1.2, h: 1.2,
      fontSize: 36, color: "FFFFFF", bold: true,
      align: "center", valign: "middle", fontFace: "Cambria",
    });
    s.addText("LaoMo (Youbin Mo)", {
      x: fx + 1.8, y: fy + 0.55, w: fw - 2.2, h: 0.5,
      fontSize: 22, color: "FFFFFF", bold: true,
      fontFace: "Cambria", margin: 0,
    });
    s.addText("Founder · Aicon Solutions · 𝕏 @LaoMo9394", {
      x: fx + 1.8, y: fy + 1.1, w: fw - 2.2, h: 0.4,
      fontSize: 12, color: COLOR.zinc400, fontFace: "Calibri", margin: 0,
    });

    const bio = [
      "● 10 年产品 + 工程跨界经验",
      "● 上一段：LaoMOS · Still Employed? 两个独立产品作品",
      "● 痛点亲历者 —— 自己就是 ChatGPT 重度用户却越来越不会想问题",
      "● 单人 + AI 协作，10 个月做出 4 个能 ship 的产品",
    ];
    bio.forEach((b, i) => {
      s.addText(b, {
        x: fx + 0.4, y: fy + 2.0 + i * 0.55, w: fw - 0.8, h: 0.5,
        fontSize: 13, color: COLOR.zinc300, fontFace: "Calibri",
        margin: 0,
      });
    });

    // Right: Ask card
    const ax = 6.85, aw = 5.8;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: ax, y: fy, w: aw, h: fh,
      fill: { color: COLOR.brand },
      line: { color: COLOR.brand, width: 0 },
      rectRadius: 0.12,
      shadow: shadow(0.3),
    });
    s.addText("Ask", {
      x: ax + 0.4, y: fy + 0.45, w: aw - 0.8, h: 0.4,
      fontSize: 12, color: COLOR.accent, bold: true,
      charSpacing: 4, fontFace: "Calibri", margin: 0,
    });
    s.addText("种子轮 · $800K", {
      x: ax + 0.4, y: fy + 0.85, w: aw - 0.8, h: 0.8,
      fontSize: 32, color: "FFFFFF", bold: true,
      fontFace: "Cambria", margin: 0,
    });
    s.addText("用于 18 个月内做到 PMF", {
      x: ax + 0.4, y: fy + 1.75, w: aw - 0.8, h: 0.4,
      fontSize: 14, color: COLOR.zinc200, italic: true,
      fontFace: "Calibri", margin: 0,
    });
    const useOfFunds = [
      "40% · 第 2 名工程师（云同步 + Windows）",
      "30% · 增长（KOL 合作 + Product Hunt）",
      "20% · Anthropic / Gemini token 储备",
      "10% · 法务 / 合规 / 运营",
    ];
    useOfFunds.forEach((u, i) => {
      s.addText(u, {
        x: ax + 0.4, y: fy + 2.4 + i * 0.5, w: aw - 0.8, h: 0.45,
        fontSize: 13, color: "FFFFFF", fontFace: "Calibri",
        margin: 0,
      });
    });

    // Contact strip — aligned with cards above (founder card left to ask card right)
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: fx, y: 6.85, w: (ax + aw) - fx, h: 0.5,
      fill: { color: COLOR.darkPanel },
      line: { color: COLOR.brand2, width: 0 },
      rectRadius: 0.06,
    });
    s.addText("contact@aicon.solutions  ·  aicon.solutions  ·  𝕏 @LaoMo9394", {
      x: fx, y: 6.85, w: (ax + aw) - fx, h: 0.5,
      fontSize: 13, color: "FFFFFF", bold: true,
      align: "center", valign: "middle", fontFace: "Calibri",
    });

    s.addNotes(
      "Ask 部分要直接：金额、用途、时间。" +
      "$800K 是合理种子轮规模，给 18 个月跑道做到 PMF。"
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Save
  // ──────────────────────────────────────────────────────────────────────────
  await pres.writeFile({
    fileName: "/sessions/lucid-keen-pasteur/mnt/outputs/pitch/nodx-pitch-zh.pptx",
  });
  console.log("✓ Wrote nodx-pitch-zh.pptx");
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
