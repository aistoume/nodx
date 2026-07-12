package solutions.aicon.nodx

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/**
 * AI-answer card shown as a system overlay (works over any app, like the
 * bubble). Replaces the old Toast which truncated at 300 chars and
 * auto-vanished — this one scrolls the FULL text and only leaves when the
 * user closes it (✕, scrim tap) — plus 📋 copy.
 */
object ResultCard {
    private var current: FrameLayout? = null

    fun show(context: Context, wm: WindowManager, title: String, body: String) {
        dismiss(wm)
        val d = context.resources.displayMetrics.density
        fun dp(v: Int) = (v * d).toInt()

        val card = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable().apply {
                setColor(Color.argb(242, 24, 24, 27))
                cornerRadius = 16 * d
            }
            setPadding(dp(20), dp(16), dp(20), dp(12))
        }

        // Header: title + ✕
        card.addView(LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(TextView(context).apply {
                text = title
                setTextColor(Color.argb(255, 245, 158, 11))
                textSize = 14f
                layoutParams =
                    LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            addView(TextView(context).apply {
                text = "✕"
                setTextColor(Color.LTGRAY)
                textSize = 18f
                setPadding(dp(12), 0, dp(4), dp(4))
                setOnClickListener { dismiss(wm) }
            })
        })

        // Scrollable full answer — capped at ~55% of the screen height.
        val maxBody = (context.resources.displayMetrics.heightPixels * 0.55f).toInt()
        card.addView(
            object : ScrollView(context) {
                override fun onMeasure(w: Int, h: Int) {
                    super.onMeasure(
                        w, MeasureSpec.makeMeasureSpec(maxBody, MeasureSpec.AT_MOST),
                    )
                }
            }.apply {
                isVerticalScrollBarEnabled = true
                addView(TextView(context).apply {
                    text = body
                    setTextColor(Color.WHITE)
                    textSize = 15f
                    setLineSpacing(0f, 1.25f)
                    setTextIsSelectable(false) // overlay windows can't take focus
                    setPadding(0, dp(10), 0, dp(10))
                })
            },
        )

        card.addView(Button(context).apply {
            text = context.getString(R.string.result_copy)
            setOnClickListener {
                val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("nodx", body))
                Toast.makeText(context, R.string.result_copied, Toast.LENGTH_SHORT).show()
            }
        })

        // Dim scrim; tapping outside the card also closes (still user-initiated).
        val scrim = FrameLayout(context).apply {
            setBackgroundColor(Color.argb(90, 0, 0, 0))
            setOnClickListener { dismiss(wm) }
            addView(
                card,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.CENTER,
                ).apply { leftMargin = dp(16); rightMargin = dp(16) },
            )
        }
        card.isClickable = true // eat taps so they don't fall through to the scrim

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT,
        )
        current = scrim
        wm.addView(scrim, lp)
    }

    fun dismiss(wm: WindowManager) {
        current?.let { runCatching { wm.removeView(it) } }
        current = null
    }
}
