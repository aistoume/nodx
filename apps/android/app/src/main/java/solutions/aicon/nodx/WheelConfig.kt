package solutions.aicon.nodx

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * User-customizable action wheel — the shared "wheel-config v1" JSON schema
 * (same shape as the Chrome extension's wheelConfig so configs stay
 * portable):
 *
 * { "version": 1, "spokes": [ <up>, <right>, <down>, <left> ] }
 * spoke/child: { "emoji": "🔍", "label": "", "action": {..}|null, "children": [..] }
 * action: { "kind": "prompt", "prompt": "…" }
 *       | { "kind": "search", "urlPrefix": "https://…q=" }
 *       | { "kind": "save" } | { "kind": "generate" }
 *
 * Exactly 4 spokes (up/right/down/left). A spoke either carries an action
 * or 1–3 children. Colours stay fixed per position (blue/amber/green/purple).
 */
sealed class WheelAction {
    class Prompt(val prompt: String) : WheelAction()
    class Search(val urlPrefix: String) : WheelAction()
    object Save : WheelAction()

    /**
     * layout: "single" | "grid"; stylePrompt is a template where {subject}
     * is replaced by the AI's description of the crop.
     */
    class Generate(val layout: String, val stylePrompt: String) : WheelAction()

    fun toJson(): JSONObject = when (this) {
        is Prompt -> JSONObject().put("kind", "prompt").put("prompt", prompt)
        is Search -> JSONObject().put("kind", "search").put("urlPrefix", urlPrefix)
        Save -> JSONObject().put("kind", "save")
        is Generate -> JSONObject().put("kind", "generate")
            .put("layout", layout).put("stylePrompt", stylePrompt)
    }

    companion object {
        const val LAYOUT_SINGLE = "single"
        const val LAYOUT_GRID = "grid"

        const val DEFAULT_EXPLAIN_PROMPT =
            "What is this? Answer concisely (2\u20134 sentences), quoting key numbers/text exactly."
        const val DEFAULT_SEARCH_PREFIX = "https://www.google.com/search?udm=2&q="

        const val DEFAULT_GRID_STYLE_PROMPT = """Create ONE single image composed as a clean 2×2 grid of four equal quadrants. Each quadrant shows the SAME subject rendered in a different visual style. Keep the subject identical across all four quadrants.

Subject: {subject}

- Top-left quadrant: a realistic e-commerce PRODUCT PHOTOGRAPH of the subject as a physical, purchasable object on a plain seamless white studio background, soft even lighting, sharp focus, realistic materials.
- Top-right quadrant: a hand-drawn ink-and-watercolour illustration.
- Bottom-left quadrant: a polished 3D render with soft global illumination and subtle reflections.
- Bottom-right quadrant: minimalist black line art on a plain white background, a few clean strokes, no shading.

Lay the four quadrants out as an even, clearly separated 2×2 grid. Keep it a small, compact graphic."""

        const val DEFAULT_SINGLE_STYLE_PROMPT = """Create ONE single, polished image of the subject below. Clean composition, soft lighting, simple uncluttered background, sharp focus. Keep it a small, compact graphic.

Subject: {subject}"""

        fun fromJson(o: JSONObject?): WheelAction? = when (o?.optString("kind")) {
            "prompt" -> Prompt(o.optString("prompt"))
            "search" -> Search(o.optString("urlPrefix"))
            "save" -> Save
            "generate" -> {
                // Older configs stored a bare {kind:"generate"} — fill gaps.
                val layout = if (o.optString("layout") == LAYOUT_SINGLE) LAYOUT_SINGLE else LAYOUT_GRID
                val style = o.optString("stylePrompt").trim().ifEmpty {
                    if (layout == LAYOUT_SINGLE) DEFAULT_SINGLE_STYLE_PROMPT else DEFAULT_GRID_STYLE_PROMPT
                }
                Generate(layout, style)
            }
            else -> null
        }
    }
}

class WheelItem(
    val emoji: String,
    val label: String,
    val action: WheelAction?,
    val children: List<WheelItem> = emptyList(),
    /** Custom button colour "#rrggbb"; null → position default (children
     *  inherit their parent spoke's colour). Same field as the extension. */
    val color: String? = null,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("emoji", emoji)
        put("label", label)
        if (color != null) put("color", color)
        put("action", action?.toJson() ?: JSONObject.NULL)
        put("children", JSONArray().also { arr -> children.forEach { arr.put(it.toJson()) } })
    }

    companion object {
        fun fromJson(o: JSONObject): WheelItem {
            val kids = mutableListOf<WheelItem>()
            o.optJSONArray("children")?.let { arr ->
                for (i in 0 until arr.length()) kids += fromJson(arr.getJSONObject(i))
            }
            // Old default labels renamed in place — only exact matches
            // (i.e. the user never touched them) are migrated.
            val label = when (val l = o.optString("label")) {
                "Shopping" -> "Google shop"
                else -> l
            }
            return WheelItem(
                o.optString("emoji", "❓"),
                label,
                WheelAction.fromJson(o.optJSONObject("action")),
                kids,
                o.optString("color").takeIf { it.isNotBlank() },
            )
        }
    }
}

/**
 * Common search/shopping destinations for the "AI identify → open URL"
 * action — mirrors the extension's shared/search-presets.ts so ordinary
 * users pick from a list; hand-editing the URL prefix stays available as
 * the advanced path ("Custom URL…").
 */
object SearchPresets {
    val ITEMS: List<Pair<String, String>> = listOf(
        "Google Search" to "https://www.google.com/search?q=",
        "Google Images" to "https://www.google.com/search?udm=2&q=",
        "Google Shopping" to "https://www.google.com/search?udm=28&q=",
        "Amazon" to "https://www.amazon.com/s?k=",
        "eBay" to "https://www.ebay.com/sch/i.html?_nkw=",
        "Taobao 淘宝" to "https://s.taobao.com/search?q=",
        "JD 京东" to "https://search.jd.com/Search?keyword=",
        "Xiaohongshu 小红书" to "https://www.xiaohongshu.com/search_result?keyword=",
        "Bing" to "https://www.bing.com/search?q=",
        "YouTube" to "https://www.youtube.com/results?search_query=",
        "X (Twitter)" to "https://x.com/search?q=",
        "Wikipedia" to "https://en.wikipedia.org/w/index.php?search=",
        "Perplexity" to "https://www.perplexity.ai/search?q=",
    )
    val LABELS = ITEMS.map { it.first }
    val URLS = ITEMS.map { it.second }
}

object WheelConfig {
    private const val FILE = "nodx"
    private const val KEY = "wheel_config_v1"

    /** The stock wheel — mirrors Lens 0.9. Defaults are plain English on
     *  every locale (same as the extension); users customize from there. */
    fun defaults(@Suppress("UNUSED_PARAMETER") c: Context): List<WheelItem> = listOf(
        WheelItem("🔍", "", null, listOf(
            WheelItem("📖", "Explain", WheelAction.Prompt(WheelAction.DEFAULT_EXPLAIN_PROMPT)),
            WheelItem("🔎", "Search", WheelAction.Search(WheelAction.DEFAULT_SEARCH_PREFIX)),
        )),
        WheelItem("💡", "", WheelAction.Save),
        WheelItem("🛒", "", null, listOf(
            WheelItem("🏷", "Google shop", WheelAction.Search("https://www.google.com/search?udm=28&q=")),
            WheelItem("📦", "Amazon", WheelAction.Search("https://www.amazon.com/s?k=")),
        )),
        WheelItem("🎨", "",
            WheelAction.Generate(WheelAction.LAYOUT_GRID, WheelAction.DEFAULT_GRID_STYLE_PROMPT)),
    )

    fun load(c: Context): List<WheelItem> {
        val raw = c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, null)
            ?: return defaults(c)
        return runCatching {
            val spokes = JSONObject(raw).getJSONArray("spokes")
            require(spokes.length() == 4)
            (0 until 4).map { WheelItem.fromJson(spokes.getJSONObject(it)) }
        }.getOrElse { defaults(c) }
    }

    fun save(c: Context, spokes: List<WheelItem>) {
        require(spokes.size == 4)
        val json = JSONObject().put("version", 1)
            .put("spokes", JSONArray().also { arr -> spokes.forEach { arr.put(it.toJson()) } })
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putString(KEY, json.toString()).apply()
    }

    fun reset(c: Context) {
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().remove(KEY).apply()
    }
}
