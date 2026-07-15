package solutions.aicon.nodx

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * The bubble's LONG-PRESS wheel: three fixed modes fanned around the
 * bubble. Distinct from RadialMenu (which drives WheelConfig actions) —
 * this one just picks the bubble's tap mode.
 *
 *   📱 Screen  — screenshot → select → action wheel (factory default)
 *   📋 Text    — clipboard text → text wheel
 *   📷 Camera  — system camera → photo → select → action wheel
 *
 * Two gestures (handled by the owner, which forwards screen-space points):
 *   • long-press then SLIDE onto a spoke and release → run that mode once
 *   • long-press, release near centre, then TAP a spoke → set it as the
 *     new default AND run it once
 * A highlighted spoke tracks the finger during the slide.
 */
@SuppressLint("ViewConstructor")
class ModeWheelView(
    context: Context,
    /** Bubble centre in screen coords (wheel fans around it). */
    private val cx: Float,
    private val cy: Float,
) : View(context) {

    data class Spoke(val mode: String, val glyph: String, val color: Int)

    private val density = context.resources.displayMetrics.density
    private fun dp(v: Float) = v * density

    private val radius = dp(96f)
    private val buttonR = dp(34f)

    // Fan the three modes toward screen centre so they never fall offscreen.
    private val spokes: List<Pair<Spoke, Pair<Float, Float>>>

    init {
        val toCenterX = context.resources.displayMetrics.widthPixels / 2f - cx
        val toCenterY = context.resources.displayMetrics.heightPixels / 2f - cy
        val base = Math.toDegrees(Math.atan2(toCenterX.toDouble(), -toCenterY.toDouble())).toFloat()
        val defs = listOf(
            Spoke(Prefs.MODE_SCREEN, "📱", 0xF23B82F6.toInt()),
            Spoke(Prefs.MODE_TEXT, "📋", 0xF2D97706.toInt()),
            Spoke(Prefs.MODE_CAMERA, "📷", 0xF210B981.toInt()),
        )
        spokes = defs.mapIndexed { i, sp ->
            val ang = base + (i - 1) * 50f  // 50° apart, centred on `base`
            val rad = Math.toRadians(ang.toDouble())
            val x = cx + (sin(rad) * radius).toFloat()
            val y = cy - (cos(rad) * radius).toFloat()
            sp to (x to y)
        }
    }

    private var highlight: String? = null

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = dp(2f); color = Color.argb(160, 255, 255, 255)
    }
    private val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = dp(4f); color = Color.WHITE
    }
    private val glyphPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER; textSize = dp(26f)
    }
    private val hint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER; textSize = dp(11f)
        color = Color.WHITE; isFakeBoldText = true
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawColor(Color.argb(70, 0, 0, 0))
        val cur = Prefs.bubbleMode(context)
        for ((sp, pos) in spokes) {
            val (x, y) = pos
            fill.color = sp.color
            canvas.drawCircle(x, y, buttonR, fill)
            if (sp.mode == highlight) canvas.drawCircle(x, y, buttonR + dp(3f), glow)
            canvas.drawCircle(x, y, buttonR, border)
            canvas.drawText(sp.glyph, x, y - (glyphPaint.ascent() + glyphPaint.descent()) / 2f, glyphPaint)
            // mark the current default with a dot
            if (sp.mode == cur) canvas.drawText("•", x, y + buttonR + dp(14f), hint)
        }
    }

    /** Update the highlighted spoke for a finger at screen (sx, sy). */
    fun updateHighlight(sx: Float, sy: Float) {
        highlight = spokeAt(sx, sy)?.mode
        invalidate()
    }

    /** Which mode is under screen point (sx, sy), or null. */
    fun spokeAt(sx: Float, sy: Float): Spoke? {
        for ((sp, pos) in spokes) {
            if (hypot((sx - pos.first).toDouble(), (sy - pos.second).toDouble()) <= buttonR) return sp
        }
        return null
    }

    /** True if the point is near the bubble centre (i.e. not on a spoke). */
    fun nearCentre(sx: Float, sy: Float): Boolean =
        hypot((sx - cx).toDouble(), (sy - cy).toDouble()) <= radius - buttonR
}
