package solutions.aicon.nodx

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Build
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import kotlin.math.max
import kotlin.math.min

/**
 * Full-screen overlay: shows the captured screenshot dimmed, lets the user
 * drag a selection rectangle, then pops the radial menu (RadialMenu.kt —
 * mirrors the extension's 0.9 action wheel) centred on the selection.
 * The picked action runs via Actions.kt after the overlay dismisses.
 */
@SuppressLint("ViewConstructor")
class SelectionOverlayView(
    context: Context,
    private val screenshot: Bitmap,
    private val onClose: () -> Unit,
) : View(context) {

    private enum class Mode { SELECT, MENU }

    private val dim = Paint().apply { color = Color.argb(120, 0, 0, 0) }
    private val stroke = Paint().apply {
        color = Color.parseColor("#F59E0B"); style = Paint.Style.STROKE
        strokeWidth = 6f; isAntiAlias = true
    }
    private var sx = 0f; private var sy = 0f; private var ex = 0f; private var ey = 0f
    private var dragging = false
    private var mode = Mode.SELECT
    private var menu: RadialMenu? = null
    private var crop: Bitmap? = null

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawBitmap(screenshot, 0f, 0f, null)
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), dim)
        if (dragging || (ex != sx && ey != sy)) canvas.drawRect(rect(), stroke)
        menu?.draw(canvas)
    }

    private fun rect(): Rect = Rect(
        min(sx, ex).toInt(), min(sy, ey).toInt(), max(sx, ex).toInt(), max(sy, ey).toInt()
    )

    override fun onTouchEvent(e: MotionEvent): Boolean {
        if (mode == Mode.MENU) {
            if (e.action == MotionEvent.ACTION_UP) handleMenuTap(e.x, e.y)
            return true
        }
        when (e.action) {
            MotionEvent.ACTION_DOWN -> { sx = e.x; sy = e.y; ex = e.x; ey = e.y; dragging = true; invalidate() }
            MotionEvent.ACTION_MOVE -> { ex = e.x; ey = e.y; invalidate() }
            MotionEvent.ACTION_UP -> {
                dragging = false
                val r = rect()
                if (r.width() > 24 && r.height() > 24) openMenu(r) else onClose()
            }
        }
        return true
    }

    /** Crop the selection, then anchor the radial menu at its centre. */
    private fun openMenu(r: Rect) {
        val left = r.left.coerceIn(0, screenshot.width - 1)
        val top = r.top.coerceIn(0, screenshot.height - 1)
        val w = r.width().coerceIn(1, screenshot.width - left)
        val h = r.height().coerceIn(1, screenshot.height - top)
        crop = Bitmap.createBitmap(screenshot, left, top, w, h)
        menu = RadialMenu(context, width, height, r.exactCenterX(), r.exactCenterY())
        mode = Mode.MENU
        invalidate()
    }

    private fun handleMenuTap(x: Float, y: Float) {
        val m = menu ?: return
        when (val hit = m.onTap(x, y)) {
            is RadialMenu.Hit.Pick -> {
                val bmp = crop
                onClose()
                if (bmp != null) Actions.run(context, hit.action, bmp)
            }
            is RadialMenu.Hit.Cancel -> onClose()
            // Expanded / Back mutate the menu's level — just redraw.
            else -> invalidate()
        }
    }

    companion object {
        private var current: SelectionOverlayView? = null
        fun show(context: Context, wm: WindowManager, bmp: Bitmap) {
            dismiss(wm)
            val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
            val lp = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                type,
                // Cover the whole screen (status-bar area included) so view
                // coordinates line up 1:1 with the real-metrics screenshot.
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                    or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT
            )
            val v = SelectionOverlayView(context, bmp) { dismiss(wm) }
            current = v
            wm.addView(v, lp)
        }
        fun dismiss(wm: WindowManager) {
            current?.let { runCatching { wm.removeView(it) } }; current = null
        }
    }
}
