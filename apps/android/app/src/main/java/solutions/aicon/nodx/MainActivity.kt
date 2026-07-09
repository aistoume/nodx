package solutions.aicon.nodx

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
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
        keyInput = EditText(this).apply {
            hint = "Anthropic API key (sk-ant-...)"
            setText(Prefs.anthropicKey(this@MainActivity))
        }
        root.addView(keyInput)
        val start = Button(this).apply { text = "启动 nodx 悬浮球" }
        start.setOnClickListener {
            Prefs.setAnthropicKey(this, keyInput.text.toString().trim())
            ensureOverlayThenProjection()
        }
        root.addView(start)
        root.addView(TextView(this).apply {
            text = "步骤：① 授予“显示在其他应用上层” ② 允许屏幕录制 → 悬浮球出现，点它截屏、框选、解释。"
            setPadding(0, 40, 0, 0)
        })
        setContentView(root)
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
