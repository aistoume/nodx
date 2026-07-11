package solutions.aicon.nodx

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Entry screen. Once the keys are in and "draw over apps" is granted,
 * opening the app auto-launches the screen-capture consent — the only
 * tap the system still requires — then minimises itself; everything
 * else lives in the floating bubble. The screen also shows a "最近添加"
 * strip previewing the newest saves (full browse in GalleryActivity).
 */
class MainActivity : AppCompatActivity() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var keyInput: EditText
    private lateinit var geminiInput: EditText
    private lateinit var recentRow: LinearLayout
    private lateinit var recentEmpty: TextView

    /** Auto-launch the projection consent at most once per app entry. */
    private var autoStartAttempted = false

    /**
     * A collapsible BYOK row: masked "saved" status line ↔ editable field.
     * Persists on EVERY keystroke — saving must not depend on the user
     * remembering to hit the start button afterwards.
     */
    private fun addKeyRow(
        root: LinearLayout, label: String, hintText: String,
        saved: String, persist: (String) -> Unit,
    ): EditText {
        val input = EditText(this).apply {
            hint = hintText
            setText(saved)
            visibility = if (saved.isBlank()) View.VISIBLE else View.GONE
        }
        input.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                val t = s?.toString()?.trim().orEmpty()
                if (t.isNotBlank()) persist(t)
            }
        })
        root.addView(TextView(this).apply {
            text = "$label 已保存（…${saved.takeLast(4)}）— 点此修改"
            visibility = if (saved.isBlank()) View.GONE else View.VISIBLE
            setPadding(0, 24, 0, 24)
            setOnClickListener { visibility = View.GONE; input.visibility = View.VISIBLE }
        })
        root.addView(input)
        return input
    }

    // Android 13+: without this the foreground-service notification is
    // silently hidden (the service itself still runs). Result is not
    // blocking — we just ask once on startup.
    private val notifPermLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(64, 140, 64, 64)
        }
        root.addView(TextView(this).apply {
            text = "nodx · 系统级思考助手"; textSize = 20f
        })
        // Saved keys stay collapsed to a masked status line — the field only
        // reappears when the user explicitly asks to change it.
        keyInput = addKeyRow(
            root, "🔑 Anthropic key", "Anthropic API key (sk-ant-...)",
            Prefs.anthropicKey(this),
        ) { Prefs.setAnthropicKey(this, it) }
        geminiInput = addKeyRow(
            root, "🎨 Google AI key", "Google AI key（🎨生成用，AIza…，可留空）",
            Prefs.geminiKey(this),
        ) { Prefs.setGeminiKey(this, it) }
        root.addView(Button(this).apply {
            text = "启动 nodx 悬浮球"
            setOnClickListener {
                if (Prefs.anthropicKey(this@MainActivity).isBlank()) {
                    toast("请先填 Anthropic key")
                    return@setOnClickListener
                }
                ensureOverlayThenProjection()
            }
        })
        root.addView(Button(this).apply {
            text = "🛑 停止悬浮球（结束录屏）"
            setOnClickListener {
                if (FloatingBubbleService.isRunning) {
                    startService(
                        Intent(this@MainActivity, FloatingBubbleService::class.java)
                            .setAction(FloatingBubbleService.ACTION_STOP)
                    )
                    toast("已停止，录屏会话已结束")
                } else {
                    toast("悬浮球未在运行")
                }
            }
        })

        // ── 最近添加：横排预览，点图看大图；「收集库 ▸」进全量网格 ──
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 48, 0, 12)
        }
        header.addView(TextView(this).apply {
            text = "🖼 最近添加"; textSize = 16f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        header.addView(TextView(this).apply {
            text = "收集库 ▸"; textSize = 14f
            setOnClickListener { startActivity(Intent(this@MainActivity, GalleryActivity::class.java)) }
        })
        root.addView(header)
        recentRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        root.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(recentRow)
        })
        recentEmpty = TextView(this).apply {
            text = "还没有保存过 — 框选后点 💡 或 🎨"
            visibility = View.GONE
        }
        root.addView(recentEmpty)

        root.addView(TextView(this).apply {
            text = "打开本页悬浮球自动就位（零弹窗）。点悬浮球截屏 → 框选 → 动作轮（🔍解释/搜索 · 💡保存 · 🛒购物 · 🎨生成）。每个会话首次截屏时系统会弹一次「分享屏幕」，之后随便截。"
            setPadding(0, 40, 0, 0)
        })
        setContentView(root)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onResume() {
        super.onResume()
        refreshRecent()
        maybeAutoStart()
    }

    /**
     * Auto-start: keys ready + overlay granted + bubble not running →
     * start the bubble service directly. No dialogs here — the screen
     * share consent is deferred to the first bubble tap of the session.
     */
    private fun maybeAutoStart() {
        if (autoStartAttempted || FloatingBubbleService.isRunning) return
        if (Prefs.anthropicKey(this).isBlank() || !Settings.canDrawOverlays(this)) return
        autoStartAttempted = true
        startBubbleService()
        toast("悬浮球已就位 — 首次截屏时会请求屏幕分享")
    }

    private fun refreshRecent() {
        scope.launch {
            val items = withContext(Dispatchers.IO) { MediaLibrary.recentThumbs(this@MainActivity, 8) }
            recentRow.removeAllViews()
            recentEmpty.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE
            val cell = (96 * resources.displayMetrics.density).toInt()
            val gap = (8 * resources.displayMetrics.density).toInt()
            items.forEach { (uri, bmp) ->
                recentRow.addView(ImageView(this@MainActivity).apply {
                    layoutParams = LinearLayout.LayoutParams(cell, cell).apply { rightMargin = gap }
                    scaleType = ImageView.ScaleType.CENTER_CROP
                    setImageBitmap(bmp)
                    setOnClickListener {
                        if (uri != null && uri.scheme == "content") {
                            startActivity(
                                Intent(Intent.ACTION_VIEW).setDataAndType(uri, "image/*")
                                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            )
                        }
                    }
                })
            }
        }
    }

    private fun ensureOverlayThenProjection() {
        if (!Settings.canDrawOverlays(this)) {
            startActivity(
                Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
            )
            toast("请授予“显示在其他应用上层”，授完回来会自动继续")
            autoStartAttempted = false // let onResume pick it up after the grant
            return
        }
        startBubbleService()
        toast("悬浮球已启动 — 首次截屏时会请求屏幕分享")
    }

    private fun startBubbleService() {
        val svc = Intent(this, FloatingBubbleService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(svc)
        else startService(svc)
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
}
