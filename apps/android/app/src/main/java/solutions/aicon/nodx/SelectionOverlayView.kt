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
import android.util.Base64
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import solutions.aicon.nodx.ai.AnthropicClient
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min

/**
 * Full-screen overlay: shows the captured screenshot dimmed, lets the user
 * drag a selection rectangle, then (MVP) runs ONE action — 解释 — by
 * cropping the selection and sending it to Sonnet/Haiku vision.
 *
 * NEXT STEP: replace the single action with the radial menu
 * (解释/搜索/购物/生成) that mirrors the browser extension.
 */
@SuppressLint("ViewConstructor")
class SelectionOverlayView(
    context: Context,
    private val screenshot: Bitmap,
    private val onClose: () -> Unit,
) : View(context) {

    private val dim = Paint().apply { color = Color.argb(120, 0, 0, 0) }
    private val stroke = Paint().apply {
        color = Color.parseColor("#F59E0B"); style = Paint.Style.STROKE
        strokeWidth = 6f; isAntiAlias = true
    }
    private var sx = 0f; private var sy = 0f; private var ex = 0f; private var ey = 0f
    private var dragging = false

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawBitmap(screenshot, 0f, 0f, null)
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), dim)
        if (dragging || (ex != sx && ey != sy)) canvas.drawRect(rect(), stroke)
    }

    private fun rect(): Rect = Rect(
        min(sx, ex).toInt(), min(sy, ey).toInt(), max(sx, ex).toInt(), max(sy, ey).toInt()
    )

    override fun onTouchEvent(e: MotionEvent): Boolean {
        when (e.action) {
            MotionEvent.ACTION_DOWN -> { sx = e.x; sy = e.y; ex = e.x; ey = e.y; dragging = true; invalidate() }
            MotionEvent.ACTION_MOVE -> { ex = e.x; ey = e.y; invalidate() }
            MotionEvent.ACTION_UP -> {
                dragging = false
                val r = rect()
                if (r.width() > 24 && r.height() > 24) runExplain(r) else onClose()
            }
        }
        return true
    }

    private fun runExplain(r: Rect) {
        Toast.makeText(context, "识别中…", Toast.LENGTH_SHORT).show()
        val left = r.left.coerceIn(0, screenshot.width - 1)
        val top = r.top.coerceIn(0, screenshot.height - 1)
        val w = r.width().coerceIn(1, screenshot.width - left)
        val h = r.height().coerceIn(1, screenshot.height - top)
        val crop = Bitmap.createBitmap(screenshot, left, top, w, h)
        val baos = ByteArrayOutputStream()
        crop.compress(Bitmap.CompressFormat.PNG, 100, baos)
        val b64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)

        CoroutineScope(Dispatchers.IO).launch {
            val apiKey = Prefs.anthropicKey(context)
            if (apiKey.isBlank()) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(context, "请先在主界面填 Anthropic key", Toast.LENGTH_LONG).show(); onClose()
                }
                return@launch
            }
            val answer = runCatching { AnthropicClient.explain(apiKey, b64) }
                .getOrElse { "调用失败: ${it.message}" }
            withContext(Dispatchers.Main) {
                Toast.makeText(context, answer.take(300), Toast.LENGTH_LONG).show(); onClose()
            }
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
                type, 0, PixelFormat.TRANSLUCENT
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
