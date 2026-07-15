package solutions.aicon.nodx

import android.annotation.SuppressLint
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * The TEXT entry point — Android's counterpart of the extension's
 * text-selection wheel. Reached three ways:
 *
 *  1. ACTION_PROCESS_TEXT — "Nodx Lens" in ANY app's text-selection
 *     toolbar (the Google-Translate mechanism). Text arrives in the intent.
 *  2. ACTION_SEND (text/plain) — share sheet.
 *  3. From the bubble's TEXT mode (EXTRA_FROM_BUBBLE) — no text in the
 *     intent; we prefill from the clipboard (an焦点 activity may read it)
 *     and let the user edit/paste before continuing.
 *
 * A translucent activity hosts the SAME four-spoke wheel (WheelConfig)
 * over whatever the user was reading; picks run via TextActions.
 */
class ProcessTextActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_FROM_BUBBLE = "from_bubble"
    }

    private lateinit var root: FrameLayout
    private var pendingClipboardRead = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this)
        setContentView(root)

        val text = when {
            intent?.action == Intent.ACTION_PROCESS_TEXT ->
                intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
            intent?.action == Intent.ACTION_SEND ->
                intent.getStringExtra(Intent.EXTRA_TEXT)
            else -> null
        }?.trim()

        when {
            !text.isNullOrBlank() -> showWheel(text)
            intent?.getBooleanExtra(EXTRA_FROM_BUBBLE, false) == true -> {
                pendingClipboardRead = true
                showInputPanel(prefill = "")
            }
            else -> finish()
        }
    }

    /** Clipboard is readable only once this activity actually has focus. */
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && pendingClipboardRead) {
            pendingClipboardRead = false
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = cm.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString()?.trim()
            if (!clip.isNullOrBlank()) inputField?.setText(clip)
        }
    }

    // ── 剪贴板/手输面板（悬浮球文字模式入口） ─────────────────────────
    private var inputField: EditText? = null

    private fun showInputPanel(prefill: String) {
        root.removeAllViews()
        val d = resources.displayMetrics.density
        fun dp(v: Int) = (v * d).toInt()

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(16), dp(20), dp(16))
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.WHITE)
                cornerRadius = 14 * d
            }
        }
        card.addView(TextView(this).apply {
            text = getString(R.string.text_panel_title)
            textSize = 16f
            setTextColor(Color.rgb(26, 26, 26))
            setPadding(0, 0, 0, dp(10))
        })
        val input = EditText(this).apply {
            hint = getString(R.string.text_panel_hint)
            setText(prefill)
            minLines = 3
            maxLines = 8
        }
        inputField = input
        card.addView(input)
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(12), 0, 0)
        }
        row.addView(Button(this).apply {
            text = getString(android.R.string.cancel)
            setOnClickListener { finish() }
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        row.addView(View(this), LinearLayout.LayoutParams(dp(12), 1))
        row.addView(Button(this).apply {
            text = getString(R.string.text_panel_go)
            setOnClickListener {
                val t = input.text.toString().trim()
                if (t.isNotEmpty()) showWheel(t)
            }
        }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        card.addView(row)

        // dim scrim + centered card
        root.setBackgroundColor(Color.argb(90, 0, 0, 0))
        root.addView(card, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            android.view.Gravity.CENTER,
        ).apply { leftMargin = dp(24); rightMargin = dp(24) })
        root.setOnClickListener { finish() }
        card.isClickable = true
    }

    // ── 四向文字轮盘（复用 RadialMenu + 用户的 WheelConfig） ──────────
    private fun showWheel(text: String) {
        root.removeAllViews()
        root.setBackgroundColor(Color.TRANSPARENT)
        root.setOnClickListener(null)
        root.addView(WheelHostView(this, text), ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
        ))
    }

    @SuppressLint("ViewConstructor")
    private inner class WheelHostView(
        context: Context,
        private val text: String,
    ) : View(context) {
        private var menu: RadialMenu? = null

        override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) {
            menu = RadialMenu(context, w, h, w / 2f, h / 2f)
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            // 轻遮罩,让来源 app 内容仍可见(半透明 activity)
            canvas.drawColor(Color.argb(90, 0, 0, 0))
            menu?.draw(canvas)
        }

        @SuppressLint("ClickableViewAccessibility")
        override fun onTouchEvent(e: MotionEvent): Boolean {
            if (e.action == MotionEvent.ACTION_UP) {
                when (val hit = menu?.onTap(e.x, e.y)) {
                    is RadialMenu.Hit.Pick ->
                        TextActions.run(this@ProcessTextActivity, hit.action, text) { finish() }
                    is RadialMenu.Hit.Cancel -> finish()
                    else -> invalidate() // Expanded / Back → redraw
                }
            }
            return true
        }
    }
}
