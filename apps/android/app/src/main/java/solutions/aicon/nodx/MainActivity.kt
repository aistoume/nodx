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
    private lateinit var keyArea: LinearLayout
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
    ) {
        val input = EditText(this).apply {
            hint = hintText
            setText(saved)
        }
        input.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                val t = s?.toString()?.trim().orEmpty()
                if (t.isNotBlank()) persist(t)
            }
        })
        // Editable row = field + 📋 paste (typing a long key on a phone is
        // miserable — one tap pastes whatever was copied from the desktop).
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            visibility = if (saved.isBlank()) View.VISIBLE else View.GONE
        }
        row.addView(
            input,
            LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f),
        )
        row.addView(Button(this).apply {
            text = getString(R.string.btn_paste)
            setOnClickListener {
                val cm = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
                val clip = cm.primaryClip?.getItemAt(0)
                    ?.coerceToText(this@MainActivity)?.toString()?.trim()
                if (clip.isNullOrBlank()) toast(getString(R.string.toast_clipboard_empty))
                else input.setText(clip)
            }
        })
        root.addView(TextView(this).apply {
            text = getString(R.string.key_saved_fmt, label, saved.takeLast(4))
            visibility = if (saved.isBlank()) View.GONE else View.VISIBLE
            setPadding(0, 24, 0, 24)
            setOnClickListener { visibility = View.GONE; row.visibility = View.VISIBLE }
        })
        root.addView(row)
    }

    /** Only the ACTIVE provider's key row is shown — no more two stacked
     *  fields fighting for space on a 384dp screen. */
    private fun renderKeyArea() {
        keyArea.removeAllViews()
        if (Prefs.provider(this) == Prefs.PROVIDER_GEMINI) {
            addKeyRow(
                keyArea, getString(R.string.label_gemini_key), getString(R.string.hint_gemini_key),
                Prefs.geminiKey(this),
            ) { Prefs.setGeminiKey(this, it) }
        } else {
            addKeyRow(
                keyArea, getString(R.string.label_anthropic_key), getString(R.string.hint_anthropic_key),
                Prefs.anthropicKey(this),
            ) { Prefs.setAnthropicKey(this, it) }
        }
    }

    /** The selected provider's key — start/auto-start gate on THIS one. */
    private fun activeKey(): String =
        if (Prefs.provider(this) == Prefs.PROVIDER_GEMINI) Prefs.geminiKey(this)
        else Prefs.anthropicKey(this)

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
            text = getString(R.string.app_title); textSize = 20f
        })
        // Provider — a full-width dropdown (the old horizontal radio pair
        // wrapped/cramped on narrow screens). Gemini's AI-Studio tier is
        // free, so the whole app can run on just the Google key.
        root.addView(TextView(this).apply {
            text = getString(R.string.provider_label)
            setPadding(0, 32, 0, 8)
        })
        val providerSpinner = android.widget.Spinner(this).apply {
            adapter = android.widget.ArrayAdapter(
                this@MainActivity, android.R.layout.simple_spinner_dropdown_item,
                listOf(getString(R.string.provider_anthropic), getString(R.string.provider_gemini)),
            )
        }
        root.addView(providerSpinner)
        keyArea = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(keyArea)
        providerSpinner.setSelection(if (Prefs.provider(this) == Prefs.PROVIDER_GEMINI) 1 else 0)
        providerSpinner.onItemSelectedListener =
            object : android.widget.AdapterView.OnItemSelectedListener {
                override fun onItemSelected(
                    p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long,
                ) {
                    Prefs.setProvider(
                        this@MainActivity,
                        if (pos == 1) Prefs.PROVIDER_GEMINI else Prefs.PROVIDER_ANTHROPIC,
                    )
                    renderKeyArea()
                }
                override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
            }
        renderKeyArea()
        root.addView(Button(this).apply {
            text = getString(R.string.btn_start)
            setOnClickListener {
                if (activeKey().isBlank()) {
                    toast(getString(R.string.toast_need_key))
                    return@setOnClickListener
                }
                ensureOverlayThenProjection()
            }
        })
        root.addView(Button(this).apply {
            text = getString(R.string.btn_stop)
            setOnClickListener {
                if (FloatingBubbleService.isRunning) {
                    startService(
                        Intent(this@MainActivity, FloatingBubbleService::class.java)
                            .setAction(FloatingBubbleService.ACTION_STOP)
                    )
                    toast(getString(R.string.toast_stopped))
                } else {
                    toast(getString(R.string.toast_not_running))
                }
            }
        })

        root.addView(Button(this).apply {
            text = getString(R.string.btn_wheel)
            setOnClickListener {
                startActivity(Intent(this@MainActivity, WheelSettingsActivity::class.java))
            }
        })

        // ── 最近添加：横排预览，点图看大图；「收集库 ▸」进全量网格 ──
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 48, 0, 12)
        }
        header.addView(TextView(this).apply {
            text = getString(R.string.recent_title); textSize = 16f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        header.addView(TextView(this).apply {
            text = getString(R.string.recent_more); textSize = 14f
            setOnClickListener { startActivity(Intent(this@MainActivity, GalleryActivity::class.java)) }
        })
        root.addView(header)
        recentRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        root.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(recentRow)
        })
        recentEmpty = TextView(this).apply {
            text = getString(R.string.recent_empty)
            visibility = View.GONE
        }
        root.addView(recentEmpty)

        root.addView(TextView(this).apply {
            text = getString(R.string.main_instructions)
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
        if (activeKey().isBlank() || !Settings.canDrawOverlays(this)) return
        autoStartAttempted = true
        startBubbleService()
        toast(getString(R.string.toast_bubble_ready))
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
            toast(getString(R.string.toast_grant_overlay))
            autoStartAttempted = false // let onResume pick it up after the grant
            return
        }
        startBubbleService()
        toast(getString(R.string.toast_bubble_ready))
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
