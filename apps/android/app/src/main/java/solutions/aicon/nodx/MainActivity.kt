package solutions.aicon.nodx

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

/**
 * Entry screen. Two one-time setup steps, then everything lives in the
 * floating bubble service:
 *   1) SYSTEM_ALERT_WINDOW (draw over other apps)
 *   2) MediaProjection consent (system screen-capture dialog)
 * After both, we start FloatingBubbleService; the user can minimise the
 * app and the bubble stays on top of every screen.
 */
class MainActivity : AppCompatActivity() {

    private val projectionManager by lazy {
        getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    }
    private lateinit var keyInput: EditText

    // Android 13+: without this the foreground-service notification is
    // silently hidden (the service itself still runs). Result is not
    // blocking — we just ask once on startup.
    private val notifPermLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private val projectionLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == Activity.RESULT_OK && result.data != null) {
                startBubble(result.resultCode, result.data!!)
            } else {
                toast("需要屏幕录制授权才能截屏")
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(64, 140, 64, 64)
        }
        root.addView(TextView(this).apply {
            text = "nodx · 系统级思考助手"; textSize = 20f
        })
        // Saved key stays collapsed to a masked status line — the field only
        // reappears when the user explicitly asks to change it.
        val saved = Prefs.anthropicKey(this)
        keyInput = EditText(this).apply {
            hint = "Anthropic API key (sk-ant-...)"
            setText(saved)
            visibility = if (saved.isBlank()) View.VISIBLE else View.GONE
        }
        val keyStatus = TextView(this).apply {
            text = "🔑 API key 已保存（…${saved.takeLast(4)}）— 点此修改"
            visibility = if (saved.isBlank()) View.GONE else View.VISIBLE
            setPadding(0, 24, 0, 24)
            setOnClickListener { visibility = View.GONE; keyInput.visibility = View.VISIBLE }
        }
        root.addView(keyStatus)
        root.addView(keyInput)
        val start = Button(this).apply { text = "启动 nodx 悬浮球" }
        start.setOnClickListener {
            if (keyInput.visibility == View.VISIBLE) {
                Prefs.setAnthropicKey(this, keyInput.text.toString().trim())
            }
            if (Prefs.anthropicKey(this).isBlank()) {
                toast("请先填 Anthropic key")
                return@setOnClickListener
            }
            ensureOverlayThenProjection()
        }
        root.addView(start)
        root.addView(Button(this).apply {
            text = "📁 收集库（已保存的截图）"
            setOnClickListener { startActivity(Intent(this@MainActivity, GalleryActivity::class.java)) }
        })
        root.addView(TextView(this).apply {
            text = "步骤：① 授予“显示在其他应用上层” ② 允许屏幕录制 → 悬浮球出现，点它截屏 → 框选 → 动作轮（🔍解释/搜索 · 💡保存 · 🛒购物 · 🎨生成）。"
            setPadding(0, 40, 0, 0)
        })
        setContentView(root)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun ensureOverlayThenProjection() {
        if (!Settings.canDrawOverlays(this)) {
            startActivity(
                Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
            )
            toast("请授予“显示在其他应用上层”，回来再点一次")
            return
        }
        projectionLauncher.launch(projectionManager.createScreenCaptureIntent())
    }

    private fun startBubble(resultCode: Int, data: Intent) {
        val svc = Intent(this, FloatingBubbleService::class.java).apply {
            putExtra(FloatingBubbleService.EXTRA_RESULT_CODE, resultCode)
            putExtra(FloatingBubbleService.EXTRA_RESULT_DATA, data)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(svc)
        else startService(svc)
        toast("悬浮球已启动，可最小化本页")
        moveTaskToBack(true)
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
}
