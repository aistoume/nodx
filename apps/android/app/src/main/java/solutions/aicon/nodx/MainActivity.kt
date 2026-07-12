package solutions.aicon.nodx

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
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
 * Entry screen, split into three tabs (bottom bar):
 *
 *   ▶ Run      — start/stop the bubble, long-lived capture consent
 *   🕘 History — recently added images + activity log
 *   ⚙ Settings — AI provider + key, action-wheel editor
 *
 * The bubble auto-starts on open once keys + overlay permission are in;
 * everything operational lives in the bubble itself.
 */
class MainActivity : AppCompatActivity() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var keyArea: LinearLayout
    private lateinit var recentRow: LinearLayout
    private lateinit var recentEmpty: TextView
    private lateinit var logBox: LinearLayout
    private lateinit var accBtn: Button

    private lateinit var tabs: List<View>
    private lateinit var navBtns: List<TextView>

    /** Auto-launch the projection consent at most once per app entry. */
    private var autoStartAttempted = false

    /** Spinner order — must match the adapter labels in buildSettingsTab. */
    private val providerIds = listOf(
        Prefs.PROVIDER_ANTHROPIC, Prefs.PROVIDER_OPENAI,
        Prefs.PROVIDER_GEMINI, Prefs.PROVIDER_OPENROUTER,
    )

    // Android 13+: without this the foreground-service notification is
    // silently hidden (the service itself still runs). Result is not
    // blocking — we just ask once on startup.
    private val notifPermLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val content = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f,
            )
        }
        val home = wrapTab(buildRunTab())
        val history = wrapTab(buildHistoryTab())
        val settings = wrapTab(buildSettingsTab())
        tabs = listOf(home, history, settings)
        tabs.forEach { content.addView(it) }

        // ── Bottom tab bar ────────────────────────────────────────────
        val nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.argb(16, 128, 128, 128))
            setPadding(0, 8, 0, 8)
        }
        navBtns = listOf(
            navButton(getString(R.string.tab_run)) { selectTab(0) },
            navButton(getString(R.string.tab_history)) { selectTab(1) },
            navButton(getString(R.string.tab_settings)) { selectTab(2) },
        )
        navBtns.forEach {
            nav.addView(it, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(content)
            addView(View(this@MainActivity).apply {
                setBackgroundColor(Color.argb(40, 128, 128, 128))
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 2)
            })
            addView(nav)
        }
        setContentView(root)
        // targetSdk 35 forces edge-to-edge: without this the bottom tab bar
        // sits under the system gesture/nav bar. Pad the root by the real
        // system-bar insets (top = status bar, bottom = nav bar).
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars())
            v.setPadding(0, bars.top, 0, bars.bottom)
            insets
        }
        selectTab(0)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notifPermLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun wrapTab(inner: View): ScrollView = ScrollView(this).apply {
        isFillViewport = true
        addView(inner)
    }

    private fun navButton(label: String, onTap: () -> Unit): TextView =
        TextView(this).apply {
            text = label
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, 28, 0, 28)
            setOnClickListener { onTap() }
        }

    private fun selectTab(i: Int) {
        tabs.forEachIndexed { j, v -> v.visibility = if (i == j) View.VISIBLE else View.GONE }
        navBtns.forEachIndexed { j, b ->
            b.setTextColor(if (i == j) Color.rgb(217, 119, 6) else Color.GRAY)
            b.paint.isFakeBoldText = i == j
        }
    }

    // ── Tab 1: Run ────────────────────────────────────────────────────

    private fun buildRunTab(): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(64, 48, 64, 64)
        }
        box.addView(TextView(this).apply {
            text = getString(R.string.app_title); textSize = 20f
            setPadding(0, 0, 0, 32)
        })
        box.addView(Button(this).apply {
            text = getString(R.string.btn_start)
            setOnClickListener {
                if (activeKey().isBlank()) {
                    toast(getString(R.string.toast_need_key))
                    selectTab(2) // key lives in Settings — take them there
                    return@setOnClickListener
                }
                ensureOverlayThenProjection()
            }
        })
        box.addView(Button(this).apply {
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
        accBtn = Button(this).apply {
            setOnClickListener {
                toast(getString(R.string.toast_access_howto))
                runCatching { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
            }
        }
        box.addView(accBtn)
        box.addView(TextView(this).apply {
            text = getString(R.string.main_instructions)
            setPadding(0, 40, 0, 0)
        })
        return box
    }

    // ── Tab 2: History (recent images + activity log) ─────────────────

    private fun buildHistoryTab(): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(64, 48, 64, 64)
        }
        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        header.addView(TextView(this).apply {
            text = getString(R.string.recent_title); textSize = 16f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        header.addView(TextView(this).apply {
            text = getString(R.string.recent_more); textSize = 14f
            setOnClickListener { startActivity(Intent(this@MainActivity, GalleryActivity::class.java)) }
        })
        box.addView(header)
        recentRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        box.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            setPadding(0, 12, 0, 0)
            addView(recentRow)
        })
        recentEmpty = TextView(this).apply {
            text = getString(R.string.recent_empty)
            visibility = View.GONE
        }
        box.addView(recentEmpty)

        box.addView(TextView(this).apply {
            text = getString(R.string.log_section); textSize = 16f
            setPadding(0, 48, 0, 12)
        })
        logBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        box.addView(logBox)
        box.addView(Button(this).apply {
            text = getString(R.string.btn_log_all)
            textSize = 16f
            setOnClickListener {
                startActivity(Intent(this@MainActivity, ActionLogActivity::class.java))
            }
        })
        return box
    }

    // ── Tab 3: Settings (provider + key + wheel) ──────────────────────

    private fun buildSettingsTab(): View {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(64, 48, 64, 64)
        }
        box.addView(TextView(this).apply {
            text = getString(R.string.provider_label)
            setPadding(0, 0, 0, 8)
        })
        val providerSpinner = android.widget.Spinner(this).apply {
            adapter = android.widget.ArrayAdapter(
                this@MainActivity, android.R.layout.simple_spinner_dropdown_item,
                listOf(
                    getString(R.string.provider_anthropic),
                    getString(R.string.provider_openai),
                    getString(R.string.provider_gemini),
                    getString(R.string.provider_openrouter),
                ),
            )
        }
        box.addView(providerSpinner)
        keyArea = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        box.addView(keyArea)
        providerSpinner.setSelection(providerIds.indexOf(Prefs.provider(this)).coerceAtLeast(0))
        providerSpinner.onItemSelectedListener =
            object : android.widget.AdapterView.OnItemSelectedListener {
                override fun onItemSelected(
                    p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long,
                ) {
                    Prefs.setProvider(this@MainActivity, providerIds[pos])
                    renderKeyArea()
                }
                override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
            }
        renderKeyArea()

        box.addView(Button(this).apply {
            text = getString(R.string.btn_wheel)
            setOnClickListener {
                startActivity(Intent(this@MainActivity, WheelSettingsActivity::class.java))
            }
        })
        return box
    }

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

    /** Only the ACTIVE provider's key row is shown. */
    private fun renderKeyArea() {
        keyArea.removeAllViews()
        when (Prefs.provider(this)) {
            Prefs.PROVIDER_GEMINI -> addKeyRow(
                keyArea, getString(R.string.label_gemini_key), getString(R.string.hint_gemini_key),
                Prefs.geminiKey(this),
            ) { Prefs.setGeminiKey(this, it) }
            Prefs.PROVIDER_OPENAI -> addKeyRow(
                keyArea, getString(R.string.label_openai_key), getString(R.string.hint_openai_key),
                Prefs.openaiKey(this),
            ) { Prefs.setOpenaiKey(this, it) }
            Prefs.PROVIDER_OPENROUTER -> addKeyRow(
                keyArea, getString(R.string.label_openrouter_key), getString(R.string.hint_openrouter_key),
                Prefs.openrouterKey(this),
            ) { Prefs.setOpenrouterKey(this, it) }
            else -> addKeyRow(
                keyArea, getString(R.string.label_anthropic_key), getString(R.string.hint_anthropic_key),
                Prefs.anthropicKey(this),
            ) { Prefs.setAnthropicKey(this, it) }
        }
    }

    /** The selected provider's key — start/auto-start gate on THIS one. */
    private fun activeKey(): String = Prefs.keyFor(this, Prefs.provider(this))

    override fun onResume() {
        super.onResume()
        accBtn.text = getString(
            if (CaptureAccessibilityService.instance != null) R.string.btn_access_on
            else R.string.btn_access
        )
        refreshRecent()
        refreshLog()
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

    private fun refreshLog() {
        scope.launch {
            val entries = withContext(Dispatchers.IO) {
                ActionLog.list(this@MainActivity).take(10)
            }
            val thumbs = withContext(Dispatchers.IO) {
                entries.associate { e ->
                    e.id to e.thumb?.let {
                        runCatching { android.graphics.BitmapFactory.decodeFile(it) }.getOrNull()
                    }
                }
            }
            logBox.removeAllViews()
            if (entries.isEmpty()) {
                logBox.addView(TextView(this@MainActivity).apply {
                    text = getString(R.string.log_empty); textSize = 12f
                })
                return@launch
            }
            entries.forEach { e -> logBox.addView(logRow(e, thumbs[e.id])) }
        }
    }

    /** Compact log row: thumb + badge/title/preview; tap = reopen/reread. */
    private fun logRow(e: ActionLog.Entry, thumb: android.graphics.Bitmap?): View {
        val d = resources.displayMetrics.density
        fun dpi(v: Int) = (v * d).toInt()
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dpi(8), dpi(8), dpi(8), dpi(8))
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.argb(12, 128, 128, 128))
                cornerRadius = dpi(10).toFloat()
            }
        }
        row.addView(ImageView(this).apply {
            layoutParams = LinearLayout.LayoutParams(dpi(56), dpi(56)).apply { rightMargin = dpi(10) }
            scaleType = ImageView.ScaleType.CENTER_CROP
            if (thumb != null) setImageBitmap(thumb)
            else setImageResource(android.R.drawable.ic_menu_gallery)
        })
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val badge = when (e.kind) {
            ActionLog.KIND_PROMPT -> getString(R.string.log_kind_prompt)
            ActionLog.KIND_SEARCH -> getString(R.string.log_kind_search)
            ActionLog.KIND_GENERATE -> getString(R.string.log_kind_generate)
            else -> getString(R.string.log_kind_save)
        }
        col.addView(TextView(this).apply {
            text = badge; textSize = 11f
            setTextColor(Color.GRAY)
        })
        val preview = e.title.ifBlank { e.detail }
        if (preview.isNotBlank()) col.addView(TextView(this).apply {
            text = preview; textSize = 13f; maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END
        })
        row.addView(col)
        row.setOnClickListener {
            when {
                e.url != null -> runCatching {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(e.url)))
                }
                e.detail.isNotBlank() -> LogDialogs.showDetail(this, badge, e, thumb)
                else -> startActivity(Intent(this, ActionLogActivity::class.java))
            }
        }
        // spacing wrapper
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(row)
            addView(View(this@MainActivity).apply {
                layoutParams = LinearLayout.LayoutParams(1, dpi(8))
            })
        }
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
