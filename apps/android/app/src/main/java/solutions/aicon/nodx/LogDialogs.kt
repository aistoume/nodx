package solutions.aicon.nodx

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog

/**
 * Detail dialog for an ActionLog entry — shared by the main page's inline
 * rows and ActionLogActivity. Generate records show image-on-top +
 * prompt-below; text-only records (explain answers) show just the text.
 */
object LogDialogs {
    fun showDetail(a: Activity, badge: String, e: ActionLog.Entry, thumb: Bitmap?) {
        val d = a.resources.displayMetrics.density
        fun dp(v: Int) = (v * d).toInt()

        val box = LinearLayout(a).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
        }
        // 🎨 生成：上图下 prompt。
        if (e.kind == ActionLog.KIND_GENERATE && thumb != null) {
            box.addView(
                ImageView(a).apply {
                    adjustViewBounds = true
                    scaleType = ImageView.ScaleType.FIT_CENTER
                    setImageBitmap(thumb)
                },
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ),
            )
        }
        if (e.detail.isNotBlank()) {
            box.addView(TextView(a).apply {
                text = e.detail
                textSize = 14f
                setLineSpacing(0f, 1.2f)
                setTextIsSelectable(true)
                setPadding(0, dp(12), 0, dp(8))
            })
        }
        AlertDialog.Builder(a)
            .setTitle(badge)
            .setView(ScrollView(a).apply { addView(box) })
            .setPositiveButton(R.string.result_copy) { _, _ ->
                val cm = a.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("nodx", e.detail))
                Toast.makeText(a, R.string.result_copied, Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }
}
