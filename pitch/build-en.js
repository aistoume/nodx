/**
 * nodx — Investor Pitch Deck (English)
 * Mirror structure of build-zh.js. Visual language identical.
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

const COLOR = {
  ink:       "0F1419",
  bg:        "FFFFFF",
  bgSoft:    "F8FAFC",
  dark:      "0F172A",
  darkPanel: "1E293B",
  brand:     "2C5282",
  brand2:    "3D6BA0",
  brandDark: "1F3F66",
  accent:    "F59E0B",
  emerald:   "10B981",
  rose:      "F43F5E",
  zinc500:   "64748B",
  zinc400:   "94A3B8",
  zinc300:   "CBD5E1",
  zinc200:   "E2E8F0",
  zinc100:   "F1F5F9",
};

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
  pres.layout = "LAYOUT_WIDE";
  pres.author = "Aicon Solutions · LaoMo";
  pres.title = "nodx — AI thinking workspace";

  const SLIDE_W = 13.3;
  const SLIDE_H = 7.5;

  const I = {
    brain:      await iconPng(FaBrain,         "#" + COLOR.accent,  256),
    network:    await iconPng(FaNetworkWired,  "#" + COLOR.brand2,  256),
    shield:     await iconPng(FaShieldAlt,     "#" + COLOR.emerald, 256),
    layers:     await iconPng(FaLayerGroup,    "#" + COLOR.brand,   256),
    users:      await iconPng(FaUsers,         "#" + COLOR.brand,   256),
    rocket:     await iconPng(FaRocket,        "#" + COLOR.accent,  256),
    cubes:      await iconPng(FaCubes,         "#" + COLOR.brand2,  256),
    search:     await iconPng(FaSearch,        "#" + COLOR.brand,   256),
    bulb:       await iconPng(FaLightbulb,     "#" + COLOR.accent,  256),
    chart:      await iconPng(FaChartLine,     "#" + COLOR.emerald, 256),
    lock:       await iconPng(FaUserShield,    "#" + COLOR.emerald, 256),
    branch:     await iconPng(FaCodeBranch,    "#" + COLOR.brand2,  256),
    graph:      await iconPng(FaProjectDiagram,"#" + COLOR.brand,   256),
    robot:      await iconPng(FaRobot,         "#" + COLOR.brand,   256),
    archive:    await iconPng(FaArchive,       "#" + COLOR.brand2,  256),
    download:   await iconPng(FaCloudDownloadAlt,"#" + COLOR.accent,256),
  };

  function header(s, eyebrow, title) {
    s.addText(eyebrow, {
      x: 0.7, y: 0.45, w: 8, h: 0.3,
      fontSize: 11, color: COLOR.brand, bold: true,
      fontFace: "Calibri", charSpacing: 4, margin: 0,
    });
    s.addText(title, {
      x: 0.7, y: 0.75, w: 12, h: 0.9,
      fontSize: 32, color: COLOR.ink, bold: true,
      fontFace: "Cambria", margin: 0,
    });
    s.addText("nodx · Aicon Solutions", {
      x: 0.7, y: 7.1, w: 6, h: 0.3,
      fontSize: 9, color: COLOR.zinc400, fontFace: "Calibri",
    });
  }

  // ── Slide 1: Cover ─────────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.dark };
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 14; c++) {
        s.addShape(pres.shapes.OVAL, {
          x: 0.5 + c * 0.9, y: 0.5 + r * 0.9,
          w: 0.04, h: 0.04,
          fill: { color: COLOR.brandDark },
          line: { color: COLOR.brandDark, width: 0 },
        });
      }
    }
    s.addText("nodx", {
      x: 0.9, y: 1.6, w: 8, h: 1.4,
      fontSize: 96, fontFace: "Cambria", bold: true,
      color: "FFFFFF", margin: 0,
    });
    s.addText("Where reading becomes thinking,\nand thinking compounds.", {
      x: 0.9, y: 3.0, w: 11, h: 1.2,
      fontSize: 26, fontFace: "Calibri",
      color: COLOR.zinc300, margin: 0,
    });
    s.addText("AI thinking workspace · Local-first · Bring your own model", {
      x: 0.9, y: 4.3, w: 11, h: 0.5,
      fontSize: 16, fontFace: "Calibri",
      color: COLOR.zinc400, margin: 0,
    });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.9, y: 6.4, w: 3.2, h: 0.55,
      fill: { color: COLOR.brand },
      line: { color: COLOR.brand, width: 0 },
      rectRadius: 0.08,
    });
    s.addText("Aicon Solutions · Investor Pitch", {
      x: 0.9, y: 6.4, w: 3.2, h: 0.55,
      fontSize: 13, color: "FFFFFF", bold: true,
      align: "center", valign: "middle", fontFace: "Calibri",
    });
    s.addText("v0.2.0 · Jun 2026", {
      x: 9.5, y: 6.5, w: 3.0, h: 0.4,
      fontSize: 12, color: COLOR.zinc400, fontFace: "Calibri",
      align: "right",
    });
    s.addNotes(
      "Open in 15 seconds: nodx is an AI thinking workspace for knowledge workers. " +
      "Local-first, BYO key or Claude subscription. We flip the script — instead of " +
      "letting AI think FOR you, nodx lets AI think WITH you."
    );
  }

  // ── Slide 2: Problem ───────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "PROBLEM", "More AI tools, dumber knowledge workers");

    const items = [
      { big: "92%",
        label: "of knowledge workers use AI tools weekly",
        sub: "Microsoft Work Trend Index 2024" },
      { big: "73%",
        label: "admit they can't explain how the AI's conclusion was reached",
        sub: "MIT Media Lab 2025, cognitive de-skilling study" },
      { big: "0",
        label: "AI products today put \"make the user think better\" in their KPIs",
        sub: "Our observation" },
    ];
    items.forEach((it, i) => {
      const y = 2.0 + i * 1.6;
      s.addText(it.big, {
        x: 0.7, y: y, w: 2.4, h: 1.3,
        fontSize: 72, color: COLOR.brand, bold: true,
        fontFace: "Cambria", margin: 0,
      });
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
      "The faster AI gives you answers, the less you practice asking, decomposing, deciding.",
      { x: 0.7, y: 6.5, w: 12, h: 0.4,
        fontSize: 13, color: COLOR.zinc500, italic: true,
        fontFace: "Calibri" }
    );
    s.addNotes(
      "Hook with the 92% number. The MIT + Microsoft citations make this credible. " +
      "The third stat (0) is judgement — nobody is doing this."
    );
  }

  // ── Slide 3: Insight ──────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "INSIGHT", "Users don't need answers — they need a better thinking process");

    s.addText("Today's AI products", {
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
      "✗  User asks a fuzzy question → AI hands an answer",
      "✗  Linear chat — no branching of thought",
      "✗  Close the tab, lose the trail. Start over next time",
      "✗  AI gets smarter; users get lazier",
    ];
    oldBullets.forEach((t, i) => {
      s.addText(t, {
        x: 1.0, y: 2.7 + i * 0.85, w: 5.0, h: 0.7,
        fontSize: 15, color: COLOR.ink, fontFace: "Calibri",
        valign: "middle", margin: 0,
      });
    });

    s.addText("nodx's contrarian bet", {
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
      "✓  AI decomposes the question instead of jumping to answers",
      "✓  Conversations branch like a network, fork \"deep dives\"",
      "✓  Full replay + open-question tracker — nothing is lost",
      "✓  Past decisions become a searchable case library",
    ];
    newBullets.forEach((t, i) => {
      s.addText(t, {
        x: 7.3, y: 2.7 + i * 0.85, w: 5.0, h: 0.7,
        fontSize: 15, color: "FFFFFF", fontFace: "Calibri",
        valign: "middle", margin: 0,
      });
    });
    s.addNotes(
      "The contrast IS the pitch. Everyone in market is on the left. " +
      "We're betting on the right. Emphasise the bet: industry is making AI smarter, " +
      "we're making users smarter."
    );
  }

  // ── Slide 4: Solution ─────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.dark };
    s.addText("SOLUTION", {
      x: 0.7, y: 0.6, w: 8, h: 0.3,
      fontSize: 11, color: COLOR.accent, bold: true,
      fontFace: "Calibri", charSpacing: 4, margin: 0,
    });
    s.addText("nodx = AI sparring partner + thinking network + case library", {
      x: 0.7, y: 0.95, w: 12.2, h: 0.9,
      fontSize: 28, color: "FFFFFF", bold: true,
      fontFace: "Cambria", margin: 0,
    });

    const products = [
      { icon: I.search, title: "nodx Lens",
        sub: "Chrome + macOS", chip: "Live",
        body: "Highlight any text → AI explanation in place → save as a thinking card.\nThe attention entry point." },
      { icon: I.network, title: "nodx desktop",
        sub: "Tauri · Apple Silicon", chip: "Beta v0.2",
        body: "Cards become a decision graph. First-principles + expert-panel debate + auto-recursion." },
      { icon: I.archive, title: "Case library + sync",
        sub: "0.3 roadmap", chip: "Roadmap",
        body: "Past decisions are searchable, forkable, and sync across devices." },
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
      s.addImage({ data: p.icon, x: x + 0.35, y: y + 0.4, w: 0.65, h: 0.65 });
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: x + cardW - 1.1, y: y + 0.45, w: 0.9, h: 0.32,
        fill: { color: p.chip === "Live" ? COLOR.emerald : p.chip === "Beta v0.2" ? COLOR.accent : COLOR.zinc500 },
        line: { color: "000000", width: 0 },
        rectRadius: 0.06,
      });
      s.addText(p.chip, {
        x: x + cardW - 1.1, y: y + 0.45, w: 0.9, h: 0.32,
        fontSize: 9, color: "FFFFFF", bold: true,
        align: "center", valign: "middle", fontFace: "Calibri",
      });
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
      s.addText(p.body, {
        x: x + 0.35, y: y + 2.4, w: cardW - 0.7, h: 1.6,
        fontSize: 13, color: COLOR.zinc300, fontFace: "Calibri",
        margin: 0,
      });
    });
    s.addText(
      "The loop: Lens captures attention → Pool → desktop processes into decisions → case library compounds",
      { x: 0.7, y: 6.95, w: 12, h: 0.4,
        fontSize: 12, color: COLOR.accent, italic: true,
        fontFace: "Calibri", align: "center" }
    );
    s.addNotes(
      "One sentence: sparring + network + compounding. The three products form an " +
      "ecosystem loop — Lens is the entry, desktop is the workshop, library is the moat."
    );
  }

  // ── Slide 5: Why Now ──────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "TIMING", "Why now");

    const reasons = [
      { icon: I.brain, title: "Models are good enough",
        body: "Claude Sonnet 4.6 / GPT-5 / Gemini 2 reliably do structured reasoning and multi-turn dialogue. Three years ago: impossible. Next year: too late (commoditised)." },
      { icon: I.lock,  title: "Users are waking up",
        body: "\"AI is making me dumber\" is moving from elite circles to mainstream conversation. Users are starting to seek out AI that DOESN'T think for them." },
      { icon: I.rocket, title: "Local-first goes mainstream",
        body: "Linear, Obsidian, Cursor educated the market: my data should be on my machine, my keys, my control." },
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
      s.addShape(pres.shapes.OVAL, {
        x: x + 0.4, y: y + 0.5, w: 0.7, h: 0.7,
        fill: { color: COLOR.bg },
        line: { color: COLOR.zinc200, width: 1 },
      });
      s.addImage({ data: r.icon, x: x + 0.52, y: y + 0.62, w: 0.46, h: 0.46 });
      s.addText(r.title, {
        x: x + 0.4, y: y + 1.4, w: colW - 0.8, h: 0.55,
        fontSize: 19, color: COLOR.ink, bold: true,
        fontFace: "Cambria", margin: 0,
      });
      s.addText(r.body, {
        x: x + 0.4, y: y + 2.05, w: colW - 0.8, h: 1.25,
        fontSize: 12, color: COLOR.zinc500, fontFace: "Calibri",
        margin: 0,
      });
    });
    s.addNotes(
      "Timing trifecta: tech, mindset, paradigm. Any one missing kills the bet. " +
      "Emphasise 'too late next year' — that's the urgency."
    );
  }

  // ── Slide 6: Differentiation (4 pillars) ──────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "DIFFERENTIATION", "Four pillars — competitors only have one or two");

    const pillars = [
      { emoji: "①", title: "Trigger thought",
        body: "Lens captures attention the moment it strikes — browser, macOS, system-wide highlight → thinking card.\nThe first-mile entry point.",
        color: COLOR.brand },
      { emoji: "②", title: "Go deeper",
        body: "First-principles decomposition + AI expert-panel debate + auto-recursion engine.\nFour-round Propose-Critique-Refine-Synthesize converges to a Local Maximum.",
        color: COLOR.brand2 },
      { emoji: "③", title: "Lose nothing",
        body: "Full conversation replay, global open-question tracker.\nProse + network-graph dual view. 100% of the reasoning chain persists.",
        color: COLOR.accent },
      { emoji: "④", title: "Compound",
        body: "CBR case library (pgvector + Gemini Embedding).\nNew questions fork-and-adapt from old cases. Thinking velocity grows non-linearly.",
        color: COLOR.emerald },
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
      "Four-pillar moat. Notion AI / Obsidian / ChatGPT each cover 1-2. " +
      "Local Maximum + auto-recursion are the technical hooks."
    );
  }

  // ── Slide 7: Competition (2x2 matrix) ─────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "COMPETITION", "Nobody's in our quadrant");

    const mx = 1.8, my = 1.95, mw = 7.2, mh = 4.7;
    s.addShape(pres.shapes.RECTANGLE, {
      x: mx, y: my, w: mw, h: mh,
      fill: { color: COLOR.bgSoft },
      line: { color: COLOR.zinc300, width: 1 },
    });
    s.addShape(pres.shapes.LINE, {
      x: mx + mw / 2, y: my, w: 0, h: mh,
      line: { color: COLOR.zinc300, width: 1, dashType: "dash" },
    });
    s.addShape(pres.shapes.LINE, {
      x: mx, y: my + mh / 2, w: mw, h: 0,
      line: { color: COLOR.zinc300, width: 1, dashType: "dash" },
    });
    s.addText("← Answer-oriented                       Process-oriented →", {
      x: mx, y: my + mh + 0.05, w: mw, h: 0.4,
      fontSize: 11, color: COLOR.zinc500, italic: true,
      align: "center", fontFace: "Calibri",
    });
    s.addText("Linear\nchat\n↓", {
      x: mx - 1.0, y: my + mh / 2 - 0.6, w: 0.9, h: 1.2,
      fontSize: 10, color: COLOR.zinc500, italic: true,
      align: "right", fontFace: "Calibri",
    });
    s.addText("↑\nNetwork\nstructure", {
      x: mx - 1.0, y: my, w: 0.9, h: 1.2,
      fontSize: 10, color: COLOR.zinc500, italic: true,
      align: "right", fontFace: "Calibri",
    });

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

    const cx = 9.3, cw = 3.3;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: cx, y: my, w: cw, h: mh,
      fill: { color: COLOR.dark },
      line: { color: COLOR.dark, width: 0 },
      rectRadius: 0.12,
      shadow: shadow(0.25),
    });
    s.addText("OUR QUADRANT", {
      x: cx + 0.35, y: my + 0.35, w: cw - 0.7, h: 0.4,
      fontSize: 12, color: COLOR.accent, bold: true,
      fontFace: "Calibri", charSpacing: 3, margin: 0,
    });
    s.addText("Process + network", {
      x: cx + 0.35, y: my + 0.75, w: cw - 0.7, h: 0.6,
      fontSize: 18, color: "FFFFFF", bold: true,
      fontFace: "Cambria", margin: 0,
    });
    s.addText(
      "Empty. Today's AI products are clustered in \"answer × linear\" or \"answer × network\". \"Process + network\" is unexplored blue ocean.",
      { x: cx + 0.35, y: my + 1.55, w: cw - 0.7, h: 2.4,
        fontSize: 12, color: COLOR.zinc300, fontFace: "Calibri",
        margin: 0 }
    );
    s.addText("Lens → desktop → case library\nfull-ecosystem moat", {
      x: cx + 0.35, y: my + 3.9, w: cw - 0.7, h: 0.8,
      fontSize: 11, color: COLOR.accent, italic: true, bold: true,
      fontFace: "Calibri", margin: 0,
    });
    s.addNotes(
      "2D matrix: x-axis answer vs process, y-axis linear vs network. " +
      "Hammer on: our quadrant is empty."
    );
  }

  // ── Slide 8: Architecture & moat ──────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "ARCHITECTURE · MOAT", "Local-first · dual-mode · cross-product pipeline");

    const lx = 0.7, ly = 1.9, lw = 7.2, lh = 5.0;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: lx, y: ly, w: lw, h: lh,
      fill: { color: COLOR.dark },
      line: { color: COLOR.dark, width: 0 },
      rectRadius: 0.12,
      shadow: shadow(0.2),
    });
    const layers = [
      { name: "Frontend · React 19 + Tauri 2 WebView",  color: COLOR.brand2 },
      { name: "In-proc Rust gateway · axum + reqwest",   color: COLOR.brand },
      { name: "Anthropic / Gemini / Claude CLI",          color: COLOR.accent },
      { name: "macOS Keychain · local SQLite",           color: COLOR.emerald },
    ];
    layers.forEach((L, i) => {
      const ry = ly + 0.65 + i * 0.95;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
        x: lx + 0.4, y: ry, w: lw - 0.8, h: 0.75,
        fill: { color: COLOR.darkPanel },
        line: { color: L.color, width: 1.5 },
        rectRadius: 0.08,
      });
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
    s.addText("Full stack runs on the user's Mac. Data never leaves the device.", {
      x: lx, y: ly + lh - 0.55, w: lw, h: 0.4,
      fontSize: 11, color: COLOR.accent, italic: true,
      align: "center", fontFace: "Calibri",
    });

    const rx = 8.3, ry = 1.9, rw = 4.3;
    const moats = [
      { title: "BYO Key",
        body: "User's own Anthropic / Gemini key. nodx pays for nothing, collects nothing, uploads nothing." },
      { title: "Keychain encryption",
        body: "API keys live in macOS Keychain (same as Safari/Mail). No one outside the nodx process can read them." },
      { title: "Dual AI mode",
        body: "Direct API call · OR spawn local claude CLI to use Pro/Max subscription. Either works." },
      { title: "Cross-product pipeline",
        body: "Lens-captured cards flow into desktop's Pool. Copying this ecosystem is way harder than copying one feature." },
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
      "Technical hook: in-proc Rust gateway solved the 'user must run a terminal' last-mile. " +
      "Dual-mode is the friendliness killer feature — any Anthropic user can use nodx out of the box."
    );
  }

  // ── Slide 9: Traction ────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "TRACTION", "10 months · 0 → 4 shipping products");

    const events = [
      { month: "2025-08", title: "PRD v0.1",                             chip: "Spec",    color: COLOR.zinc500 },
      { month: "2025-12", title: "prototype.html — design confirmed",     chip: "M0",      color: COLOR.zinc500 },
      { month: "2026-02", title: "Lens Chrome v0.1 — closed beta",        chip: "M1",      color: COLOR.brand },
      { month: "2026-03", title: "Lens macOS v0.0.1 — system-wide",       chip: "Live",    color: COLOR.emerald },
      { month: "2026-04", title: "M1 core loop (Survey + Panel + CBR)",   chip: "M1✓",     color: COLOR.brand },
      { month: "2026-05", title: "Auto-recursion + CLI provider",         chip: "V2 early", color: COLOR.brand2 },
      { month: "2026-06", title: "Lens Chrome v0.3 — dual button + Pool", chip: "Live",    color: COLOR.emerald },
      { month: "2026-06", title: "desktop v0.2.0 — in-proc gateway + Keychain", chip: "Beta", color: COLOR.accent },
    ];
    const tlx = 1.6, tly = 2.0, tlh = 4.6;
    s.addShape(pres.shapes.LINE, {
      x: tlx, y: tly + 0.3, w: 0, h: tlh - 0.6,
      line: { color: COLOR.zinc300, width: 2 },
    });
    events.forEach((ev, i) => {
      const y = tly + i * (tlh / events.length) + 0.05;
      s.addShape(pres.shapes.OVAL, {
        x: tlx - 0.1, y: y + 0.15, w: 0.2, h: 0.2,
        fill: { color: ev.color },
        line: { color: "FFFFFF", width: 2 },
      });
      s.addText(ev.month, {
        x: 0.3, y: y + 0.1, w: 1.15, h: 0.3,
        fontSize: 11, color: COLOR.zinc500, fontFace: "Calibri",
        align: "right", margin: 0,
      });
      s.addText(ev.title, {
        x: tlx + 0.25, y: y + 0.08, w: 8.5, h: 0.35,
        fontSize: 14, color: COLOR.ink, bold: true,
        fontFace: "Calibri", margin: 0,
      });
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
      "Emphasise: spec → three shipping products in 10 months, solo founder + AI co-pilot. " +
      "This is the execution proof point."
    );
  }

  // ── Slide 10: Market ──────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "MARKET", "Knowledge workers · AI productivity · funnel down");

    const stats = [
      { num: "$200B", label: "Global knowledge-work productivity software",   year: "2027 forecast" },
      { num: "$31B",  label: "AI productivity tools TAM",                     year: "2024 actual" },
      { num: "5%",    label: "\"Thinking aid\" segment (vs 95% \"answer gen\")", year: "Blue ocean" },
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
        fontSize: 52, color: COLOR.brand, bold: true,
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
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 0.7, y: 4.6, w: 11.9, h: 2.1,
      fill: { color: COLOR.dark },
      line: { color: COLOR.dark, width: 0 },
      rectRadius: 0.12,
      shadow: shadow(0.2),
    });
    s.addText("BOTTOM-UP ENTRY STRATEGY", {
      x: 1.1, y: 4.85, w: 11, h: 0.45,
      fontSize: 13, color: COLOR.accent, bold: true,
      fontFace: "Calibri", charSpacing: 3, margin: 0,
    });
    s.addText("Land first with \"heavy thinkers\" — PMs, indie consultants, researchers, founders.", {
      x: 1.1, y: 5.3, w: 11, h: 0.5,
      fontSize: 15, color: "FFFFFF", bold: true,
      fontFace: "Calibri", margin: 0,
    });
    s.addText(
      "High ARPU, strong word-of-mouth, picky about tools. Prove PMF here, then funnel down to teams and enterprises.",
      { x: 1.1, y: 5.85, w: 11, h: 0.75,
        fontSize: 12, color: COLOR.zinc300, fontFace: "Calibri",
        margin: 0 }
    );
    s.addNotes(
      "Three-layer market: big pool (knowledge work), segment (AI productivity), " +
      "blue ocean (thinking aid 5%). Bottom-up reference: Linear / Cursor / Notion early playbook."
    );
  }

  // ── Slide 11: Business Model ─────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "BUSINESS MODEL", "Three tiers · free users are the marketing");

    const tiers = [
      { name: "Personal", price: "Free forever", sub: "BYO API key",
        features: ["Lens · Chrome + Mac",
                   "Full desktop",
                   "Pool + network graph + case library",
                   "Local data · no account"],
        cta: "Seed users", color: COLOR.brand },
      { name: "Team", price: "$12 /mo /user", sub: "Ships with 0.3",
        features: ["Everything in Personal",
                   "Cloud sync (Supabase, self-host option)",
                   "Shared case library · team GraphRAG",
                   "Decision-review collab · @ mentions"],
        cta: "Open after PMF", color: COLOR.brand, highlight: true },
      { name: "Enterprise", price: "From $48 /mo /user", sub: "0.4+",
        features: ["Everything in Team",
                   "SSO · SCIM",
                   "Private deploy · self-host models",
                   "Audit log · compliance export"],
        cta: "Finance / consulting / legal", color: COLOR.dark },
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
        fontSize: 22, color: isHi ? COLOR.accent : t.color, bold: true,
        fontFace: "Cambria", margin: 0,
      });
      s.addText(t.sub, {
        x: x + 0.35, y: y + 1.5, w: cardW - 0.7, h: 0.3,
        fontSize: 11, color: muted, italic: true,
        fontFace: "Calibri", margin: 0,
      });
      s.addShape(pres.shapes.LINE, {
        x: x + 0.35, y: y + 1.95, w: cardW - 0.7, h: 0,
        line: { color: isHi ? COLOR.brand2 : COLOR.zinc200, width: 1 },
      });
      t.features.forEach((f, fi) => {
        s.addText("✓  " + f, {
          x: x + 0.35, y: y + 2.15 + fi * 0.42, w: cardW - 0.7, h: 0.4,
          fontSize: 11, color: ink, fontFace: "Calibri",
          margin: 0,
        });
      });
      s.addText(t.cta, {
        x: x + 0.35, y: y + 4.35, w: cardW - 0.7, h: 0.35,
        fontSize: 11, color: isHi ? COLOR.accent : COLOR.brand, bold: true,
        italic: true, fontFace: "Calibri", margin: 0,
      });
    });
    s.addNotes(
      "Free-forever is the funnel. Personal ARPU ≈ $0 but virality is huge. " +
      "Team is revenue core. Enterprise is expansion."
    );
  }

  // ── Slide 12: Roadmap ────────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.bg };
    header(s, "ROADMAP", "12 months ahead");

    const phases = [
      { period: "Now → Sep 2026", version: "0.2.x",
        title: "Public beta · 100 real users",
        items: ["Intel Mac build + notarization",
                "Lens Chrome Web Store approval",
                "30-question PRD eval · accuracy > 85%"],
        color: COLOR.brand },
      { period: "Oct 2026 → Jan 2027", version: "0.3",
        title: "Cloud sync + team",
        items: ["Supabase + Yjs CRDT cross-device sync",
                "Shared case library + GraphRAG",
                "Windows build",
                "Team plan opens · first 10 teams"],
        color: COLOR.brand2 },
      { period: "Feb → Jun 2027", version: "0.4",
        title: "Mobile + enterprise",
        items: ["Expo mobile read-only + voice notes",
                "Enterprise SSO + private deploy",
                "Target ARR $500K"],
        color: COLOR.accent },
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
          x: x + 0.3, y: y + 2.4 + ii * 0.5, w: cardW - 0.6, h: 0.45,
          fontSize: 11, color: COLOR.zinc500, fontFace: "Calibri",
          margin: 0,
        });
      });
    });
    s.addNotes(
      "12-month milestone: 0.3 is the commercial inflection (Team launch). " +
      "$500K ARR within 18 months proves PMF."
    );
  }

  // ── Slide 13: Team + Ask ─────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: COLOR.dark };
    s.addText("TEAM & ASK", {
      x: 0.7, y: 0.55, w: 8, h: 0.4,
      fontSize: 12, color: COLOR.accent, bold: true,
      charSpacing: 4, fontFace: "Calibri", margin: 0,
    });
    s.addText("One person · One bet · One seed round", {
      x: 0.7, y: 0.95, w: 12, h: 0.9,
      fontSize: 30, color: "FFFFFF", bold: true,
      fontFace: "Cambria", margin: 0,
    });

    const fx = 0.7, fy = 2.2, fw = 5.8, fh = 4.5;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: fx, y: fy, w: fw, h: fh,
      fill: { color: COLOR.darkPanel },
      line: { color: COLOR.brand2, width: 1 },
      rectRadius: 0.12,
      shadow: shadow(0.25),
    });
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
      "● 10 years across product + engineering",
      "● Prior: LaoMOS · Still Employed? — two indie products shipped",
      "● Lived the problem — heavy ChatGPT user who got worse at framing questions",
      "● Solo + AI co-pilot · 4 shipping products in 10 months",
    ];
    bio.forEach((b, i) => {
      s.addText(b, {
        x: fx + 0.4, y: fy + 2.0 + i * 0.55, w: fw - 0.8, h: 0.5,
        fontSize: 13, color: COLOR.zinc300, fontFace: "Calibri",
        margin: 0,
      });
    });

    const ax = 6.85, aw = 5.8;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: ax, y: fy, w: aw, h: fh,
      fill: { color: COLOR.brand },
      line: { color: COLOR.brand, width: 0 },
      rectRadius: 0.12,
      shadow: shadow(0.3),
    });
    s.addText("THE ASK", {
      x: ax + 0.4, y: fy + 0.45, w: aw - 0.8, h: 0.4,
      fontSize: 12, color: COLOR.accent, bold: true,
      charSpacing: 4, fontFace: "Calibri", margin: 0,
    });
    s.addText("Seed round · $800K", {
      x: ax + 0.4, y: fy + 0.85, w: aw - 0.8, h: 0.8,
      fontSize: 30, color: "FFFFFF", bold: true,
      fontFace: "Cambria", margin: 0,
    });
    s.addText("18-month runway to PMF", {
      x: ax + 0.4, y: fy + 1.75, w: aw - 0.8, h: 0.4,
      fontSize: 14, color: COLOR.zinc200, italic: true,
      fontFace: "Calibri", margin: 0,
    });
    const useOfFunds = [
      "40% · Hire 2nd engineer (cloud sync + Windows)",
      "30% · Growth (KOL partnerships + Product Hunt)",
      "20% · Anthropic / Gemini token runway",
      "10% · Legal · compliance · ops",
    ];
    useOfFunds.forEach((u, i) => {
      s.addText(u, {
        x: ax + 0.4, y: fy + 2.4 + i * 0.5, w: aw - 0.8, h: 0.45,
        fontSize: 13, color: "FFFFFF", fontFace: "Calibri",
        margin: 0,
      });
    });

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
      "Be direct on the ask: amount, use, timeline. $800K seed gives 18 months " +
      "to prove PMF."
    );
  }

  await pres.writeFile({
    fileName: "/sessions/lucid-keen-pasteur/mnt/outputs/pitch/nodx-pitch-en.pptx",
  });
  console.log("✓ Wrote nodx-pitch-en.pptx");
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
