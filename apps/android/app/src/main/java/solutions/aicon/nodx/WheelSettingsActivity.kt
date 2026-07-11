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
        val param = EditText(this@WheelSettingsActivity)

        init {
            val row = LinearLayout(this@WheelSettingsActivity).apply { orientation = LinearLayout.HORIZONTAL }
            row.addView(emoji, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            row.addView(label, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 2f))
            root.addView(row)
            root.addView(kind)
            root.addView(param)
            kind.setSelection(
                when (prefill?.action) {
                    is WheelAction.Search -> Kind.SEARCH.ordinal
                    WheelAction.Save -> Kind.SAVE.ordinal
                    WheelAction.Generate -> Kind.GENERATE.ordinal
                    else -> Kind.PROMPT.ordinal
                }
            )
            param.setText(
                when (val a = prefill?.action) {
                    is WheelAction.Prompt -> a.prompt
                    is WheelAction.Search -> a.urlPrefix
                    else -> ""
                }
            )
            kind.onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long) =
                    syncParam()
                override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
            }
            syncParam()
        }

        private fun syncParam() {
            if (kind.visibility != View.VISIBLE) { param.visibility = View.GONE; return }
            when (Kind.entries[kind.selectedItemPosition]) {
                Kind.PROMPT -> { param.visibility = View.VISIBLE; param.hint = getString(R.string.wheel_param_prompt_hint) }
                Kind.SEARCH -> { param.visibility = View.VISIBLE; param.hint = getString(R.string.wheel_param_url_hint) }
                else -> param.visibility = View.GONE
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
            if (children.isNotEmpty()) return WheelItem(e, label.text.toString().trim(), null, children)
            val p = param.text.toString().trim()
            val action = when (Kind.entries[kind.selectedItemPosition]) {
                Kind.PROMPT -> { if (p.isEmpty()) { toast(getString(R.string.wheel_err_param)); return null }; WheelAction.Prompt(p) }
                Kind.SEARCH -> { if (p.isEmpty()) { toast(getString(R.string.wheel_err_param)); return null }; WheelAction.Search(p) }
                Kind.SAVE -> WheelAction.Save
                Kind.GENERATE -> WheelAction.Generate
            }
            return WheelItem(e, label.text.toString().trim(), action)
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
                    if (childEditors.size > 1) { childEditors.remove(editor); childrenBox.removeView(wrap) }
                    else toast(getString(R.string.wheel_err_child))
                }
            })
            childEditors.add(editor)
            childrenBox.addView(wrap)
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
        val titles = listOf(
            R.string.wheel_pos_up, R.string.wheel_pos_right,
            R.string.wheel_pos_down, R.string.wheel_pos_left,
        )
        spokeEditors = config.mapIndexed { i, spoke -> SpokeEditor(list, titles[i], spoke) }
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
