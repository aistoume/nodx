package solutions.aicon.nodx

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.MotionEvent
import android.view.View
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * The bubble's LONG-PRESS wheel: three fixed modes fanned around the
 * bubble. A robust TAP model — long-press pops this wheel, the user lifts
 * their finger, then TAPS a spoke to switch the bubble to that mode (and
 * run it once). Tapping outside dismisses. (The earlier slide-while-held
 * model was too finicky — spokes were easy to miss.)
 *
 *   📱 Screen  — screenshot → select → action wheel
 *   📋 Text    — clipboard text → text wheel
 *   📷 Camera  — system camera → photo → select → action wheel
 */
@SuppressLint("ViewConstructor")
class ModeWheelView(
    context: Context,
    /** Bubble centre in screen coords (wheel fans around it). */
    private val cx: Float,
    private val cy: Float,
    /** Tapped a spoke → switch to this mode + run it once. */
    private val onSelect: (String) -> Unit,
    /** Tapped outside any spoke → dismiss. */
    private val onDismiss: () -> Unit,
) : View(context) {

    data class Spoke(val mode: String, val glyph: String, val label: String, val color: Int)

    private val density = context.resources.displayMetrics.density
    private fun dp(v: Float) = v * density

    private val radius = dp(104f)
    private val buttonR = dp(38f)

    private val spokes: List<Pair<Spoke, Pair<Float, Float>>>

    init {
        isFocusableInTouchMode = true
        val sw = context.resources.displayMetrics.widthPixels
        val sh = context.resources.displayMetrics.heightPixels
        val toCenterX = sw / 2f - cx
        val toCenterY = sh / 2f - cy
        val base = Math.toDegrees(Math.atan2(toCenterX.toDouble(), -toCenterY.toDouble())).toFloat()
        val defs = listOf(
            Spoke(Prefs.MODE_SCREEN, "📱", context.getString(R.string.bubble_mode_screen_short), 0xF23B82F6.toInt()),
            Spoke(Prefs.MODE_TEXT, "📋", context.getString(R.string.bubble_mode_text_short), 0xF2D97706.toInt()),
            Spoke(Prefs.MODE_CAMERA, "📷", context.getString(R.string.bubble_mode_camera_short), 0xF210B981.toInt()),
        )
        spokes = defs.mapIndexed { i, sp ->
            val ang = base + (i - 1) * 46f
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
    private val connector = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = dp(2f); color = Color.argb(120, 255, 255, 255)
        pathEffect = android.graphics.DashPathEffect(floatArrayOf(dp(4f), dp(4f)), 0f)
    }
    private val glyphPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER; textSize = dp(26f)
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER; textSize = dp(11f)
        color = Color.WHITE; isFakeBoldText = true
    }
    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER; textSize = dp(13f); color = Color.WHITE
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawColor(Color.argb(90, 0, 0, 0))
        val cur = Prefs.bubbleMode(context)
        for ((sp, pos) in spokes) {
            val (x, y) = pos
            canvas.drawLine(cx, cy, x, y, connector)
        }
        for ((sp, pos) in spokes) {
            val (x, y) = pos
            fill.color = sp.color
            canvas.drawCircle(x, y, buttonR, fill)
            if (sp.mode == highlight) canvas.drawCircle(x, y, buttonR + dp(3f), glow)
            canvas.drawCircle(x, y, buttonR, border)
            canvas.drawText(sp.glyph, x, y - dp(6f) - (glyphPaint.ascent() + glyphPaint.descent()) / 2f, glyphPaint)
            canvas.drawText(sp.label, x, y + dp(20f), labelPaint)
            if (sp.mode == cur) canvas.drawText("●", x, y + buttonR + dp(20f), dotPaint)
        }
    }

    private fun spokeAt(sx: Float, sy: Float): Spoke? {
        for ((sp, pos) in spokes) {
            if (hypot((sx - pos.first).toDouble(), (sy - pos.second).toDouble()) <= buttonR + dp(10f)) return sp
        }
        return null
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        when (e.action) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
                highlight = spokeAt(e.x, e.y)?.mode
                invalidate()
            }
            MotionEvent.ACTION_UP -> {
                val sp = spokeAt(e.x, e.y)
                if (sp != null) onSelect(sp.mode) else onDismiss()
            }
            MotionEvent.ACTION_CANCEL -> onDismiss()
        }
        return true
    }
}
