package solutions.aicon.nodx

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.util.Date

/**
 * Browse the ActionLog: every wheel action with its thumbnail, the AI
 * answer / search query, and the jump link. Tap a record to reopen the
 * link or reread the full answer; long-press to delete it.
 */
class ActionLogActivity : AppCompatActivity() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var listBox: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = getString(R.string.log_title)
        listBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(32))
        }
        setContentView(ScrollView(this).apply { addView(listBox) })
        refresh()
    }

    private fun refresh() {
        scope.launch {
            val entries = withContext(Dispatchers.IO) { ActionLog.list(this@ActionLogActivity) }
            val thumbs = withContext(Dispatchers.IO) {
                entries.associate { e ->
                    e.id to e.thumb?.let { runCatching { BitmapFactory.decodeFile(it) }.getOrNull() }
                }
            }
            listBox.removeAllViews()
            if (entries.isEmpty()) {
                listBox.addView(TextView(this@ActionLogActivity).apply {
                    text = getString(R.string.log_empty)
                    setPadding(0, dp(40), 0, 0)
                    gravity = Gravity.CENTER
                })
                return@launch
            }
            entries.forEach { e -> listBox.addView(row(e, thumbs[e.id])) }
        }
    }

    private fun kindBadge(kind: String): String = when (kind) {
        ActionLog.KIND_PROMPT -> getString(R.string.log_kind_prompt)
        ActionLog.KIND_SEARCH -> getString(R.string.log_kind_search)
        ActionLog.KIND_GENERATE -> getString(R.string.log_kind_generate)
        else -> getString(R.string.log_kind_save)
    }

    private fun row(e: ActionLog.Entry, thumb: android.graphics.Bitmap?): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(10), dp(10), dp(10), dp(10))
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.argb(12, 128, 128, 128))
                cornerRadius = dp(10).toFloat()
            }
        }
        row.addView(ImageView(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(72), dp(72)).apply { rightMargin = dp(10) }
            scaleType = ImageView.ScaleType.CENTER_CROP
            if (thumb != null) setImageBitmap(thumb) else setImageResource(android.R.drawable.ic_menu_gallery)
        })
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        col.addView(TextView(this).apply {
            text = "${kindBadge(e.kind)} · ${DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(e.createdAt))}"
            textSize = 11f
            setTextColor(Color.GRAY)
        })
        if (e.title.isNotBlank()) col.addView(TextView(this).apply {
            text = e.title
            textSize = 14f
            maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END
        })
        if (e.detail.isNotBlank()) col.addView(TextView(this).apply {
            text = e.detail
            textSize = 12f
            setTextColor(Color.DKGRAY)
            maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END
        })
        if (e.url != null) col.addView(TextView(this).apply {
            text = getString(R.string.log_reopen)
            textSize = 12f
            setTextColor(Color.rgb(217, 119, 6))
        })
        row.addView(col)

        row.setOnClickListener {
            when {
                e.url != null -> runCatching {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(e.url)))
                }
                e.detail.isNotBlank() -> LogDialogs.showDetail(this, kindBadge(e.kind), e, thumb)
            }
        }
        row.setOnLongClickListener {
            AlertDialog.Builder(this)
                .setMessage(R.string.log_delete_confirm)
                .setPositiveButton(android.R.string.ok) { _, _ ->
                    scope.launch {
                        withContext(Dispatchers.IO) { ActionLog.delete(this@ActionLogActivity, e.id) }
                        refresh()
                    }
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
            true
        }

        // spacing wrapper
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(row)
            addView(View(this@ActionLogActivity).apply {
                layoutParams = LinearLayout.LayoutParams(1, dp(10))
            })
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
