package solutions.aicon.nodx

import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

/**
 * Editor for the customizable action wheel (WheelConfig). Four fixed
 * spokes (up/right/down/left); each is either a single action or a
 * submenu of 1–3 sub-items. Every button's emoji/name/action/params are
 * editable. Pure-code form UI — spartan but complete.
 */
class WheelSettingsActivity : AppCompatActivity() {

    /** Action kinds in spinner order. */
    private enum class Kind { PROMPT, SEARCH, SAVE, GENERATE }

    private val kindLabels by lazy {
        listOf(
            getString(R.string.wheel_kind_prompt),
            getString(R.string.wheel_kind_search),
            getString(R.string.wheel_kind_save),
            getString(R.string.wheel_kind_generate),
        )
    }

    /** Ping the live preview whenever any form value changes. */
    private var onFormChanged: () -> Unit = {}

    private companion object {
        /** Same emoji library as the extension options page. */
        val PRESET_ICONS = listOf(
            "🔍", "🔎", "📖", "💡", "🛒", "🏷", "📦", "🎨",
            "🧠", "📝", "🌐", "🔤", "🖼️", "📷", "🎬", "🎵",
            "📊", "📈", "🧾", "💬", "❓", "✅", "⭐", "❤️",
            "🔥", "⚡", "🚀", "🛠️", "🔧", "🧪", "🩺", "⚖️",
            "🗺️", "🧭", "⏰", "💰", "🏠", "🍔", "👕", "🚗",
        )

        /** Preset swatches — first slot in the strip is "↺ 默认" (null). */
        val COLOR_PALETTE = listOf(
            "#3b82f6", "#d97706", "#10b981", "#a855f7",
            "#ef4444", "#ec4899", "#06b6d4", "#84cc16",
            "#f97316", "#8b5cf6", "#64748b", "#18181b",
        )
    }

    /** One emoji+label+kind+param row — used for spokes and children alike. */
    private inner class ItemEditor(prefill: WheelItem?) {
        val root = LinearLayout(this@WheelSettingsActivity).apply { orientation = LinearLayout.VERTICAL }

        /** Icon value (emoji or data:URL) — set via the icon-library dialog. */
        var iconValue: String = prefill?.emoji ?: ""
        private val iconBtn = TextView(this@WheelSettingsActivity).apply {
            textSize = 24f
            gravity = android.view.Gravity.CENTER
            setOnClickListener {
                showIconPicker(iconValue) { picked ->
                    iconValue = picked
                    refreshIconBtn()
                    onFormChanged()
                }
            }
        }

        private fun refreshIconBtn() {
            val d = resources.displayMetrics.density
            if (iconValue.startsWith("data:")) {
                val bmp = runCatching {
                    val bytes = android.util.Base64.decode(
                        iconValue.substringAfter("base64,", ""), android.util.Base64.DEFAULT,
                    )
                    android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                }.getOrNull()
                iconBtn.text = if (bmp == null) "❓" else ""
                iconBtn.background = bmp?.let {
                    android.graphics.drawable.BitmapDrawable(resources, it)
                } ?: iconBoxBg(d)
            } else {
                iconBtn.text = iconValue.ifEmpty { "❓" }
                iconBtn.background = iconBoxBg(d)
            }
        }

        private fun iconBoxBg(d: Float) = android.graphics.drawable.GradientDrawable().apply {
            setColor(Color.argb(18, 128, 128, 128))
            cornerRadius = 8 * d
            setStroke((1 * d).toInt(), Color.argb(60, 128, 128, 128))
        }

        val label = EditText(this@WheelSettingsActivity).apply {
            hint = getString(R.string.wheel_label_hint); setText(prefill?.label ?: "")
        }
        val kind = Spinner(this@WheelSettingsActivity).apply {
            adapter = ArrayAdapter(
                this@WheelSettingsActivity, android.R.layout.simple_spinner_dropdown_item, kindLabels
            )
        }

        /** Only for kind=GENERATE: single image vs 2×2 grid. */
        val layout = Spinner(this@WheelSettingsActivity).apply {
            adapter = ArrayAdapter(
                this@WheelSettingsActivity, android.R.layout.simple_spinner_dropdown_item,
                listOf(getString(R.string.wheel_layout_single), getString(R.string.wheel_layout_grid)),
            )
        }
        /**
         * Only for kind=SEARCH: common destinations so ordinary users never
         * hand-write a URL prefix; the last entry ("Custom URL…") reveals
         * the raw param field for advanced use.
         */
        val preset = Spinner(this@WheelSettingsActivity).apply {
            adapter = ArrayAdapter(
                this@WheelSettingsActivity, android.R.layout.simple_spinner_dropdown_item,
                SearchPresets.LABELS + getString(R.string.wheel_preset_custom),
            )
        }
        private val presetCustomIdx = SearchPresets.URLS.size

        val param = EditText(this@WheelSettingsActivity)

        /** Custom colour "#rrggbb"; null = position default. */
        var colorHex: String? = prefill?.color
        private val colorStrip = LinearLayout(this@WheelSettingsActivity).apply {
            orientation = LinearLayout.HORIZONTAL
        }

        /** Small tappable swatch row: 默认 dot + preset palette. */
        private fun renderColorStrip() {
            colorStrip.removeAllViews()
            val d = resources.displayMetrics.density
            val size = (32 * d).toInt()
            val gap = (8 * d).toInt()
            (listOf<String?>(null) + COLOR_PALETTE).forEach { hex ->
                val dot = TextView(this@WheelSettingsActivity).apply {
                    layoutParams = LinearLayout.LayoutParams(size, size).apply { rightMargin = gap }
                    gravity = android.view.Gravity.CENTER
                    text = if (hex == null) "↺" else ""
                    setTextColor(Color.DKGRAY)
                    background = android.graphics.drawable.GradientDrawable().apply {
                        shape = android.graphics.drawable.GradientDrawable.OVAL
                        setColor(
                            hex?.let { runCatching { Color.parseColor(it) }.getOrNull() }
                                ?: Color.argb(40, 128, 128, 128)
                        )
                        if (hex == colorHex) setStroke((3 * d).toInt(), Color.BLACK)
                    }
                    setOnClickListener {
                        colorHex = hex; renderColorStrip(); onFormChanged()
                    }
                }
                colorStrip.addView(dot)
            }
        }

        /** Per-kind param memory — switching kinds no longer wipes input. */
        private val stash = mutableMapOf<Kind, String>()
        private var lastKind = Kind.PROMPT

        private fun defaultParamFor(k: Kind): String = when (k) {
            Kind.PROMPT -> WheelAction.DEFAULT_EXPLAIN_PROMPT
            Kind.SEARCH -> WheelAction.DEFAULT_SEARCH_PREFIX
            Kind.GENERATE -> defaultStyleForLayout()
            Kind.SAVE -> ""
        }

        private fun isDefaultStyle(s: String) =
            s.isBlank() || s == WheelAction.DEFAULT_GRID_STYLE_PROMPT ||
                s == WheelAction.DEFAULT_SINGLE_STYLE_PROMPT

        private fun layoutValue() =
            if (layout.selectedItemPosition == 0) WheelAction.LAYOUT_SINGLE else WheelAction.LAYOUT_GRID

        private fun defaultStyleForLayout() =
            if (layoutValue() == WheelAction.LAYOUT_SINGLE) WheelAction.DEFAULT_SINGLE_STYLE_PROMPT
            else WheelAction.DEFAULT_GRID_STYLE_PROMPT

        init {
            val row = LinearLayout(this@WheelSettingsActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
            }
            val side = (48 * resources.displayMetrics.density).toInt()
            row.addView(iconBtn, LinearLayout.LayoutParams(side, side).apply {
                rightMargin = (8 * resources.displayMetrics.density).toInt()
            })
            refreshIconBtn()
            row.addView(label, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            root.addView(row)
            renderColorStrip()
            root.addView(android.widget.HorizontalScrollView(this@WheelSettingsActivity).apply {
                isHorizontalScrollBarEnabled = false
                setPadding(0, 8, 0, 8)
                addView(colorStrip)
            })
            root.addView(kind)
            root.addView(preset)
            root.addView(layout)
            root.addView(param)
            val prefillAction = prefill?.action
            kind.setSelection(
                when (prefillAction) {
                    is WheelAction.Search -> Kind.SEARCH.ordinal
                    WheelAction.Save -> Kind.SAVE.ordinal
                    is WheelAction.Generate -> Kind.GENERATE.ordinal
                    else -> Kind.PROMPT.ordinal
                }
            )
            layout.setSelection(
                if ((prefillAction as? WheelAction.Generate)?.layout == WheelAction.LAYOUT_SINGLE) 0 else 1
            )
            param.setText(
                when (prefillAction) {
                    is WheelAction.Prompt -> prefillAction.prompt
                    is WheelAction.Search -> prefillAction.urlPrefix
                    is WheelAction.Generate -> prefillAction.stylePrompt
                    else -> ""
                }
            )
            syncPresetFromParam()
            lastKind = Kind.entries[kind.selectedItemPosition]
            kind.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long) {
                    val newKind = Kind.entries[pos]
                    if (newKind != lastKind) {
                        // Stash the old kind's param and restore what the
                        // user last typed for the new kind (or a default).
                        stash[lastKind] = param.text.toString()
                        param.setText(stash[newKind] ?: defaultParamFor(newKind))
                        lastKind = newKind
                        if (newKind == Kind.SEARCH) syncPresetFromParam()
                    }
                    syncParam(); onFormChanged()
                }
                override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
            }
            preset.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long) {
                    // Picking a preset writes its URL into param (kept as the
                    // single source of truth); "Custom URL…" just reveals it.
                    if (pos < presetCustomIdx && param.text.toString().trim() != SearchPresets.URLS[pos]) {
                        param.setText(SearchPresets.URLS[pos])
                    }
                    syncParam(); onFormChanged()
                }
                override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
            }
            layout.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long) {
                    // Swap in the matching default unless the user customized it.
                    if (isDefaultStyle(param.text.toString())) param.setText(defaultStyleForLayout())
                    onFormChanged()
                }
                override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
            }
            val watcher = object : android.text.TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: android.text.Editable?) = onFormChanged()
            }
            label.addTextChangedListener(watcher)
            param.addTextChangedListener(watcher)
            syncParam()
        }

        /** Point the preset spinner at whatever URL param currently holds. */
        private fun syncPresetFromParam() {
            val idx = SearchPresets.URLS.indexOf(param.text.toString().trim())
            preset.setSelection(if (idx >= 0) idx else presetCustomIdx)
        }

        private fun syncParam() {
            if (kind.visibility != View.VISIBLE) {
                param.visibility = View.GONE; layout.visibility = View.GONE
                preset.visibility = View.GONE; return
            }
            when (Kind.entries[kind.selectedItemPosition]) {
                Kind.PROMPT -> {
                    param.visibility = View.VISIBLE; layout.visibility = View.GONE
                    preset.visibility = View.GONE
                    param.hint = getString(R.string.wheel_param_prompt_hint)
                }
                Kind.SEARCH -> {
                    preset.visibility = View.VISIBLE; layout.visibility = View.GONE
                    // URL field is the advanced path — hidden while a preset
                    // is selected, shown for "Custom URL…".
                    param.visibility =
                        if (preset.selectedItemPosition == presetCustomIdx) View.VISIBLE
                        else View.GONE
                    param.hint = getString(R.string.wheel_param_url_hint)
                }
                Kind.GENERATE -> {
                    param.visibility = View.VISIBLE; layout.visibility = View.VISIBLE
                    preset.visibility = View.GONE
                    param.hint = getString(R.string.wheel_param_style_hint)
                }
                else -> {
                    param.visibility = View.GONE; layout.visibility = View.GONE
                    preset.visibility = View.GONE
                }
            }
        }

        /** Submenu mode hides the spoke's own action UI (kind + param). */
        fun showActionUi(show: Boolean) {
            kind.visibility = if (show) View.VISIBLE else View.GONE
            syncParam()
        }

        /** null = validation failure (a toast was shown). */
        fun build(children: List<WheelItem> = emptyList()): WheelItem? {
            val e = iconValue.trim()
            if (e.isEmpty()) { toast(getString(R.string.wheel_err_emoji)); return null }
            if (children.isNotEmpty()) {
                return WheelItem(e, label.text.toString().trim(), null, children, colorHex)
            }
            val p = param.text.toString().trim()
            val action = when (Kind.entries[kind.selectedItemPosition]) {
                Kind.PROMPT -> { if (p.isEmpty()) { toast(getString(R.string.wheel_err_param)); return null }; WheelAction.Prompt(p) }
                Kind.SEARCH -> { if (p.isEmpty()) { toast(getString(R.string.wheel_err_param)); return null }; WheelAction.Search(p) }
                Kind.SAVE -> WheelAction.Save
                Kind.GENERATE ->
                    WheelAction.Generate(layoutValue(), p.ifEmpty { defaultStyleForLayout() })
            }
            return WheelItem(e, label.text.toString().trim(), action, color = colorHex)
        }

        /** No-toast variant for the live preview: never fails, fills gaps. */
        fun buildLenient(children: List<WheelItem> = emptyList()): WheelItem {
            val e = iconValue.trim().ifEmpty { "❓" }
            val l = label.text.toString().trim()
            if (children.isNotEmpty()) return WheelItem(e, l, null, children, colorHex)
            val p = param.text.toString().trim()
            val action = when (Kind.entries[kind.selectedItemPosition]) {
                Kind.PROMPT -> WheelAction.Prompt(p)
                Kind.SEARCH -> WheelAction.Search(p)
                Kind.SAVE -> WheelAction.Save
                Kind.GENERATE ->
                    WheelAction.Generate(layoutValue(), p.ifEmpty { defaultStyleForLayout() })
            }
            return WheelItem(e, l, action, color = colorHex)
        }
    }

    /** A spoke section: mode radio (single action / submenu) + editors. */
    private inner class SpokeEditor(container: LinearLayout, titleRes: Int, prefill: WheelItem) {
        private val self = ItemEditor(prefill)
        private val childEditors = mutableListOf<ItemEditor>()
        private val childrenBox = LinearLayout(this@WheelSettingsActivity).apply {
            orientation = LinearLayout.VERTICAL
        }
        private val modeGroup = RadioGroup(this@WheelSettingsActivity).apply {
            orientation = RadioGroup.HORIZONTAL
        }
        private val rbAction = RadioButton(this@WheelSettingsActivity).apply {
            text = getString(R.string.wheel_mode_action); id = View.generateViewId()
        }
        private val rbChildren = RadioButton(this@WheelSettingsActivity).apply {
            text = getString(R.string.wheel_mode_children); id = View.generateViewId()
        }
        private val addChildBtn = Button(this@WheelSettingsActivity).apply {
            text = getString(R.string.wheel_add_child)
            setOnClickListener { if (childEditors.size < 3) addChild(null) }
        }

        init {
            val section = LinearLayout(this@WheelSettingsActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(24, 32, 24, 32)
                setBackgroundColor(Color.argb(14, 128, 128, 128))
            }
            section.addView(TextView(this@WheelSettingsActivity).apply {
                text = getString(titleRes); textSize = 16f
            })
            section.addView(self.root)
            modeGroup.addView(rbAction); modeGroup.addView(rbChildren)
            section.addView(modeGroup)
            section.addView(childrenBox)
            section.addView(addChildBtn)
            container.addView(section)
            container.addView(View(this@WheelSettingsActivity).apply {
                layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 24)
            })

            modeGroup.setOnCheckedChangeListener { _, checked ->
                val sub = checked == rbChildren.id
                childrenBox.visibility = if (sub) View.VISIBLE else View.GONE
                addChildBtn.visibility = if (sub) View.VISIBLE else View.GONE
                self.showActionUi(!sub)
                if (sub && childEditors.isEmpty()) addChild(null)
                onFormChanged()
            }
            if (prefill.children.isNotEmpty()) {
                prefill.children.forEach { addChild(it) }
                modeGroup.check(rbChildren.id)
            } else {
                modeGroup.check(rbAction.id)
            }
        }

        private fun addChild(prefill: WheelItem?) {
            val editor = ItemEditor(prefill)
            val wrap = LinearLayout(this@WheelSettingsActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(32, 16, 0, 16)
            }
            wrap.addView(editor.root)
            wrap.addView(Button(this@WheelSettingsActivity).apply {
                text = getString(R.string.wheel_remove)
                setOnClickListener {
                    if (childEditors.size > 1) {
                        childEditors.remove(editor); childrenBox.removeView(wrap); onFormChanged()
                    } else toast(getString(R.string.wheel_err_child))
                }
            })
            childEditors.add(editor)
            childrenBox.addView(wrap)
            onFormChanged()
        }

        fun build(): WheelItem? {
            return if (modeGroup.checkedRadioButtonId == rbChildren.id) {
                if (childEditors.isEmpty()) { toast(getString(R.string.wheel_err_child)); return null }
                val kids = childEditors.map { it.build() ?: return null }
                self.build(kids)
            } else {
                self.build()
            }
        }

        fun buildLenient(): WheelItem =
            if (modeGroup.checkedRadioButtonId == rbChildren.id) {
                self.buildLenient(childEditors.map { it.buildLenient() })
            } else {
                self.buildLenient()
            }
    }

    /**
     * Live preview — literally the shipping RadialMenu rendered into a
     * small canvas from the form's current (lenient) state. Tapping a
     * submenu spoke fans it out; ↩ collapses; picks are inert here.
     */
    private inner class WheelPreviewView(context: android.content.Context) : View(context) {
        var provider: (() -> List<WheelItem>)? = null
        private var menu: RadialMenu? = null

        fun refresh() { menu = null; invalidate() }

        override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) { menu = null }

        override fun onDraw(canvas: android.graphics.Canvas) {
            super.onDraw(canvas)
            canvas.drawColor(android.graphics.Color.argb(14, 128, 128, 128))
            val items = provider?.invoke() ?: return
            if (menu == null && width > 0 && height > 0) {
                menu = RadialMenu(context, width, height, width / 2f, height / 2f, items)
            }
            menu?.draw(canvas)
        }

        @android.annotation.SuppressLint("ClickableViewAccessibility")
        override fun onTouchEvent(e: android.view.MotionEvent): Boolean {
            if (e.action == android.view.MotionEvent.ACTION_UP) {
                when (menu?.onTap(e.x, e.y)) {
                    is RadialMenu.Hit.Expanded, RadialMenu.Hit.Back -> invalidate()
                    else -> {}
                }
            }
            return true
        }
    }

    private lateinit var spokeEditors: List<SpokeEditor>

    /** Which icon button the in-flight gallery pick belongs to. */
    private var pendingIconSink: ((String) -> Unit)? = null

    private val pickIconImage = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        val sink = pendingIconSink
        pendingIconSink = null
        if (uri == null || sink == null) return@registerForActivityResult
        val dataUrl = runCatching { iconDataUrl(uri) }.getOrNull()
        if (dataUrl == null) toast(getString(R.string.icon_load_failed)) else sink(dataUrl)
    }

    /** Centre-crop → 64×64 PNG → data:URL (the wheel's portable icon format). */
    private fun iconDataUrl(uri: Uri): String {
        val bmp = contentResolver.openInputStream(uri)!!.use {
            android.graphics.BitmapFactory.decodeStream(it)
        } ?: error("decode failed")
        val side = minOf(bmp.width, bmp.height)
        val square = android.graphics.Bitmap.createBitmap(
            bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side,
        )
        val small = android.graphics.Bitmap.createScaledBitmap(square, 64, 64, true)
        val baos = java.io.ByteArrayOutputStream()
        small.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, baos)
        return "data:image/png;base64," +
            android.util.Base64.encodeToString(baos.toByteArray(), android.util.Base64.NO_WRAP)
    }

    /** Icon library dialog: preset emoji grid + gallery upload + manual entry. */
    private fun showIconPicker(current: String, sink: (String) -> Unit) {
        val d = resources.displayMetrics.density
        val cell = (44 * d).toInt()
        val grid = android.widget.GridLayout(this).apply {
            columnCount = 8
            setPadding((8 * d).toInt(), (8 * d).toInt(), (8 * d).toInt(), 0)
        }
        lateinit var dialog: androidx.appcompat.app.AlertDialog
        PRESET_ICONS.forEach { icon ->
            grid.addView(TextView(this).apply {
                text = icon
                textSize = 24f
                gravity = android.view.Gravity.CENTER
                layoutParams = android.widget.GridLayout.LayoutParams().apply {
                    width = cell; height = cell
                }
                setOnClickListener { sink(icon); dialog.dismiss() }
            })
        }
        dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(getString(R.string.icon_pick_title))
            .setView(ScrollView(this).apply { addView(grid) })
            .setNeutralButton(getString(R.string.icon_upload)) { _, _ ->
                pendingIconSink = sink
                pickIconImage.launch("image/*")
            }
            .setPositiveButton(getString(R.string.icon_manual)) { _, _ ->
                val input = EditText(this).apply {
                    hint = getString(R.string.icon_manual_hint)
                    if (!current.startsWith("data:")) setText(current)
                }
                androidx.appcompat.app.AlertDialog.Builder(this)
                    .setTitle(getString(R.string.icon_manual))
                    .setView(input)
                    .setPositiveButton(android.R.string.ok) { _, _ ->
                        val v = input.text.toString().trim()
                        if (v.isNotEmpty()) sink(v)
                    }
                    .setNegativeButton(android.R.string.cancel, null)
                    .show()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = getString(R.string.wheel_title)
        buildForm(WheelConfig.load(this))
    }

    private fun buildForm(config: List<WheelItem>) {
        val list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 64)
        }

        // ── 悬浮球点按模式：直接选默认(免依赖长按手势) ───────────────
        list.addView(TextView(this).apply {
            text = getString(R.string.bubble_mode_title); textSize = 16f
        })
        list.addView(TextView(this).apply {
            text = getString(R.string.bubble_mode_hint); textSize = 12f
            setPadding(0, 4, 0, 12)
        })
        val modeGroup = android.widget.RadioGroup(this).apply {
            orientation = android.widget.RadioGroup.VERTICAL
        }
        val modes = listOf(
            Prefs.MODE_SCREEN to R.string.bubble_mode_screen,
            Prefs.MODE_TEXT to R.string.bubble_mode_text,
            Prefs.MODE_CAMERA to R.string.bubble_mode_camera,
        )
        val cur = Prefs.bubbleMode(this)
        val ids = modes.map { (mode, label) ->
            val rb = android.widget.RadioButton(this).apply {
                text = getString(label); id = View.generateViewId()
                if (mode == cur) isChecked = true
            }
            modeGroup.addView(rb)
            rb.id to mode
        }.toMap()
        modeGroup.setOnCheckedChangeListener { _, checked ->
            ids[checked]?.let { Prefs.setBubbleMode(this@WheelSettingsActivity, it) }
        }
        list.addView(modeGroup)
        list.addView(View(this).apply {
            setBackgroundColor(android.graphics.Color.argb(30, 128, 128, 128))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 2).apply {
                topMargin = 24; bottomMargin = 24
            }
        })
        list.addView(TextView(this).apply {
            text = getString(R.string.wheel_action_section); textSize = 16f
            setPadding(0, 0, 0, 12)
        })

        // Live preview on top — the real RadialMenu drawn from form state.
        val preview = WheelPreviewView(this)
        list.addView(
            preview,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                (340 * resources.displayMetrics.density).toInt(),
            ),
        )
        list.addView(TextView(this).apply {
            text = getString(R.string.wheel_preview_hint)
            textSize = 12f
            setPadding(0, 12, 0, 24)
        })

        val titles = listOf(
            R.string.wheel_pos_up, R.string.wheel_pos_right,
            R.string.wheel_pos_down, R.string.wheel_pos_left,
        )
        spokeEditors = config.mapIndexed { i, spoke -> SpokeEditor(list, titles[i], spoke) }
        preview.provider = { spokeEditors.map { it.buildLenient() } }
        onFormChanged = { preview.refresh() }
        list.addView(Button(this).apply {
            text = getString(R.string.wheel_save)
            setOnClickListener {
                val spokes = spokeEditors.map { it.build() ?: return@setOnClickListener }
                WheelConfig.save(this@WheelSettingsActivity, spokes)
                toast(getString(R.string.wheel_saved))
                finish()
            }
        })
        list.addView(Button(this).apply {
            text = getString(R.string.wheel_reset)
            setOnClickListener {
                WheelConfig.reset(this@WheelSettingsActivity)
                buildForm(WheelConfig.defaults(this@WheelSettingsActivity))
            }
        })
        val scroll = ScrollView(this).apply { addView(list) }
        setContentView(scroll)
        // targetSdk 35 edge-to-edge: pad by the real system-bar insets so the
        // top (status bar) and bottom (nav bar) content isn't hidden behind
        // One UI's system chrome.
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(scroll) { v, insets ->
            val bars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars())
            v.setPadding(0, bars.top, 0, bars.bottom)
            insets
        }
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
}
