package solutions.aicon.nodx

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * Radial (pie) menu drawn on a Canvas — mirrors the browser extension's
 * radial-menu.ts (Lens 0.9) one-for-one:
 *
 *     up    = 🔍  → 📖 解释 / 🔎 搜索
 *     right = 💡  保存（存入相册）
 *     down  = 🛒  → 🏷 Shopping / 📦 Amazon
 *     left  = 🎨  生成
 *
 * Leaf spokes resolve immediately; branch spokes expand their two children
 * further out with a dashed connector. Centre button is ✕ (cancel) at level
 * 1 and ↩ (back) at level 2. Pure model+draw+hit-test — the owning View
 * routes touches and invalidates.
 */
class RadialMenu(context: Context, screenW: Int, screenH: Int, wantX: Float, wantY: Float) {

    enum class Choice { EXPLAIN, SEARCH, SAVE, SHOPPING_GOOGLE, SHOPPING_AMAZON, GENERATE }

    class Option(
        val emoji: String,
        val label: String,
        val angleDeg: Float,
        val color: Int,
        val choice: Choice? = null,
        val children: List<Option>? = null,
    )

    sealed class Hit {
        class Pick(val choice: Choice) : Hit()
        object Expanded : Hit()   // tapped a branch spoke → menu re-rendered
        object Back : Hit()       // centre ↩ at level 2
        object Cancel : Hit()     // centre ✕ or scrim tap
    }

    private val density = context.resources.displayMetrics.density
    private fun dp(v: Float) = v * density

    // Design sizes assume a ~420dp-wide screen. On narrower/denser screens
    // (e.g. Galaxy A16 is 384dp wide) the full wheel wouldn't fit and the
    // centre clamp range inverts — scale everything down to fit instead.
    private val scale: Float = run {
        val wantPad = dp(150f + 32f + 12f)              // subRadius + buttonR + margin
        minOf(1f, minOf(screenW, screenH) / 2f / wantPad)
    }
    private fun sdp(v: Float) = dp(v) * scale

    private val outerRadius = sdp(88f)
    private val subRadius = sdp(150f)
    private val buttonR = sdp(32f)  // 64dp button
    private val centreR = sdp(20f)  // 40dp centre
    private val subSpread = 32f     // ± degrees children fan from parent

    // Colours match the extension's rgba(...,0.95) spokes.
    private val options = listOf(
        Option("🔍", "", 0f, 0xF23B82F6.toInt(), children = listOf(
            Option("📖", "解释", 0f, 0xF23B82F6.toInt(), Choice.EXPLAIN),
            Option("🔎", "搜索", 0f, 0xF23B82F6.toInt(), Choice.SEARCH),
        )),
        Option("💡", "", 90f, 0xF2D97706.toInt(), Choice.SAVE),
        Option("🛒", "", 180f, 0xF210B981.toInt(), children = listOf(
            Option("🏷", "Shopping", 0f, 0xF210B981.toInt(), Choice.SHOPPING_GOOGLE),
            Option("📦", "Amazon", 0f, 0xF210B981.toInt(), Choice.SHOPPING_AMAZON),
        )),
        Option("🎨", "", 270f, 0xF2A855F7.toInt(), Choice.GENERATE),
    )

    /** Menu centre, clamped so level-2 children always stay on screen. */
    val cx: Float
    val cy: Float

    init {
        // Never let the clamp range invert, whatever the screen/rounding.
        val pad = minOf(subRadius + buttonR + sdp(12f), screenW / 2f, screenH / 2f)
        cx = wantX.coerceIn(pad, screenW - pad)
        cy = wantY.coerceIn(pad, screenH - pad)
    }

    /** null → level 1 (four spokes); a branch option → its children view. */
    private var expanded: Option? = null

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = dp(2f); color = Color.argb(128, 255, 255, 255)
    }
    private val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = dp(1f)
        color = Color.argb(90, 24, 24, 27)
        pathEffect = DashPathEffect(floatArrayOf(dp(4f), dp(5f)), 0f)
    }
    private val connector = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = dp(2f)
        color = Color.argb(102, 24, 24, 27)
        pathEffect = DashPathEffect(floatArrayOf(dp(4f), dp(4f)), 0f)
    }
    private val emojiPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER; textSize = sdp(24f)
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER; textSize = sdp(10f); color = Color.WHITE; isFakeBoldText = true
    }
    private val centrePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(230, 24, 24, 27) }
    private val centreGlyph = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER; textSize = sdp(16f); color = Color.WHITE
    }

    private fun posOf(angleDeg: Float, radius: Float): Pair<Float, Float> {
        val rad = Math.toRadians(angleDeg.toDouble())
        return Pair(cx + (sin(rad) * radius).toFloat(), cy - (cos(rad) * radius).toFloat())
    }

    private fun childPos(parent: Option, i: Int, count: Int): Pair<Float, Float> {
        val offset = if (count == 1) 0f else (i - (count - 1) / 2f) * 2f * subSpread
        return posOf(parent.angleDeg + offset, subRadius)
    }

    fun draw(canvas: Canvas) {
        canvas.drawCircle(cx, cy, outerRadius, ring)
        val exp = expanded
        if (exp == null) {
            for (opt in options) {
                val (x, y) = posOf(opt.angleDeg, outerRadius)
                drawButton(canvas, x, y, opt, dimmed = false)
            }
        } else {
            val (px, py) = posOf(exp.angleDeg, outerRadius)
            val kids = exp.children ?: emptyList()
            kids.forEachIndexed { i, kid ->
                val (x, y) = childPos(exp, i, kids.size)
                canvas.drawLine(px, py, x, y, connector)
                drawButton(canvas, x, y, kid, dimmed = false)
            }
            drawButton(canvas, px, py, exp, dimmed = true)
        }
        // Centre: ✕ cancel at level 1, ↩ back at level 2.
        canvas.drawCircle(cx, cy, centreR, centrePaint)
        canvas.drawText(if (exp == null) "✕" else "↩", cx, cy - (centreGlyph.ascent() + centreGlyph.descent()) / 2f, centreGlyph)
    }

    private fun drawButton(canvas: Canvas, x: Float, y: Float, opt: Option, dimmed: Boolean) {
        fill.color = opt.color
        fill.alpha = if (dimmed) 120 else Color.alpha(opt.color)
        canvas.drawCircle(x, y, buttonR, fill)
        canvas.drawCircle(x, y, buttonR, border)
        if (opt.label.isEmpty()) {
            canvas.drawText(opt.emoji, x, y - (emojiPaint.ascent() + emojiPaint.descent()) / 2f, emojiPaint)
        } else {
            canvas.drawText(opt.emoji, x, y - sdp(4f), emojiPaint)
            canvas.drawText(opt.label, x, y + sdp(14f), labelPaint)
        }
    }

    /** Route a tap. Returns what happened; owner invalidates on Expanded/Back. */
    fun onTap(x: Float, y: Float): Hit {
        if (hypot((x - cx).toDouble(), (y - cy).toDouble()) <= centreR + dp(6f)) {
            return if (expanded == null) Hit.Cancel else { expanded = null; Hit.Back }
        }
        val exp = expanded
        if (exp == null) {
            for (opt in options) {
                val (bx, by) = posOf(opt.angleDeg, outerRadius)
                if (hypot((x - bx).toDouble(), (y - by).toDouble()) <= buttonR) {
                    return if (opt.children != null) { expanded = opt; Hit.Expanded }
                    else Hit.Pick(opt.choice!!)
                }
            }
        } else {
            val kids = exp.children ?: emptyList()
            kids.forEachIndexed { i, kid ->
                val (bx, by) = childPos(exp, i, kids.size)
                if (hypot((x - bx).toDouble(), (y - by).toDouble()) <= buttonR) {
                    return Hit.Pick(kid.choice!!)
                }
            }
        }
        return Hit.Cancel // scrim tap = cancel outright (matches extension)
    }
}
