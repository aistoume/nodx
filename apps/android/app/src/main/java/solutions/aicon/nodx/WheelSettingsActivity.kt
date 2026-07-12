package solutions.aicon.nodx

import android.graphics.Color
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
        val emoji = EditText(this@WheelSettingsActivity).apply {
            hint = getString(R.string.wheel_emoji_hint); setText(prefill?.emoji ?: "")
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
            val row = LinearLayout(this@WheelSettingsActivity).apply { orientation = LinearLayout.HORIZONTAL }
            row.addView(emoji, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            row.addView(label, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 2f))
            root.addView(row)
            renderColorStrip()
            root.addView(android.widget.HorizontalScrollView(this@WheelSettingsActivity).apply {
                isHorizontalScrollBarEnabled = false
                setPadding(0, 8, 0, 8)
                addView(colorStrip)
            })
            root.addView(kind)
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
            emoji.addTextChangedListener(watcher)
            label.addTextChangedListener(watcher)
            param.addTextChangedListener(watcher)
            syncParam()
        }

        private fun syncParam() {
            if (kind.visibility != View.VISIBLE) {
                param.visibility = View.GONE; layout.visibility = View.GONE; return
            }
            when (Kind.entries[kind.selectedItemPosition]) {
                Kind.PROMPT -> {
                    param.visibility = View.VISIBLE; layout.visibility = View.GONE
                    param.hint = getString(R.string.wheel_param_prompt_hint)
                }
                Kind.SEARCH -> {
                    param.visibility = View.VISIBLE; layout.visibility = View.GONE
                    param.hint = getString(R.string.wheel_param_url_hint)
                }
                Kind.GENERATE -> {
                    param.visibility = View.VISIBLE; layout.visibility = View.VISIBLE
                    param.hint = getString(R.string.wheel_param_style_hint)
                }
                else -> { param.visibility = View.GONE; layout.visibility = View.GONE }
            }
        }

        /** Submenu mode hides the spoke's own action UI (kind + param). */
        fun showActionUi(show: Boolean) {
            kind.visibility = if (show) View.VISIBLE else View.GONE
            syncParam()
        }

        /** null = validation failure (a toast was shown). */
        fun build(children: List<WheelItem> = emptyList()): WheelItem? {
            val e = emoji.text.toString().trim()
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
            val e = emoji.text.toString().trim().ifEmpty { "❓" }
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
        setContentView(ScrollView(this).apply { addView(list) })
    }

    private fun toast(m: String) = Toast.makeText(this, m, Toast.LENGTH_SHORT).show()
}
