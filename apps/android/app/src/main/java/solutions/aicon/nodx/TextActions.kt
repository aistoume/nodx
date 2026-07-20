package solutions.aicon.nodx

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import solutions.aicon.nodx.ai.AnthropicClient
import solutions.aicon.nodx.ai.GeminiClient
import solutions.aicon.nodx.ai.OpenAIClient
import java.net.URLEncoder

/**
 * TEXT counterparts of Actions.kt — the same user wheel (WheelConfig)
 * reinterpreted for a piece of selected/clipboard text, mirroring the
 * extension's text-selection wheel:
 *
 *   prompt   → ask the AI about the text (answer dialog, logged)
 *   search   → open urlPrefix + encoded text (no AI-identify step needed)
 *   save     →记入操作记录
 *   generate → text IS the subject → Gemini renders (no describe step)
 *
 * Runners are hosted by ProcessTextActivity (dialogs need an Activity),
 * and every action lands in ActionLog like the image ones.
 */
object TextActions {

    /** Text-only AI call routed by the provider setting. Blocking — IO. */
    private fun aiText(context: Context, prompt: String): String =
        when (Prefs.provider(context)) {
            Prefs.PROVIDER_GEMINI ->
                GeminiClient.textOnly(Prefs.geminiKey(context), prompt)
            Prefs.PROVIDER_OPENAI ->
                OpenAIClient.textOnly(Prefs.openaiKey(context), prompt, model = "gpt-5.6-luna")
            Prefs.PROVIDER_OPENROUTER -> OpenAIClient.textOnly(
                Prefs.openrouterKey(context), prompt,
                model = "openrouter/free", baseUrl = OpenAIClient.OPENROUTER_BASE,
            )
            else -> AnthropicClient.textCall(Prefs.anthropicKey(context), prompt)
        }

    private fun ensureKey(context: Context): Boolean {
        val ok = Prefs.keyFor(context, Prefs.provider(context)).isNotBlank()
        if (!ok) Toast.makeText(context, R.string.toast_need_key, Toast.LENGTH_LONG).show()
        return ok
    }

    /**
     * Run one wheel action against [text]. [onDone] is invoked when the
     * activity may finish (immediately for fire-and-forget actions, after
     * the dialog closes for dialog-based ones).
     */
    fun run(activity: Activity, action: WheelAction, text: String, onDone: () -> Unit) {
        when (action) {
            is WheelAction.Prompt -> explain(
                activity,
                // The stock explain template is image-phrased ("What is
                // this?") — text runs swap it for the text variant. A
                // customized template runs verbatim (extension parity).
                if (action.prompt == WheelAction.DEFAULT_EXPLAIN_PROMPT)
                    WheelAction.DEFAULT_TEXT_EXPLAIN_PROMPT else action.prompt,
                text, onDone,
            )
            WheelAction.Instruct -> instruct(activity, text, onDone)
            is WheelAction.Search -> {
                // Image-search prefix (udm=2) makes no sense for a text
                // query — swap the stock one for plain Google web search.
                val prefix =
                    if (action.urlPrefix == WheelAction.DEFAULT_SEARCH_PREFIX)
                        WheelAction.TEXT_PLAIN_SEARCH_PREFIX else action.urlPrefix
                val url = prefix + URLEncoder.encode(text.take(200), "UTF-8")
                runCatching {
                    activity.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse(url))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                }
                CoroutineScope(Dispatchers.IO).launch {
                    ActionLog.append(
                        activity.applicationContext, ActionLog.KIND_SEARCH,
                        title = text.take(120), url = url,
                    )
                }
                onDone()
            }
            WheelAction.Save -> {
                CoroutineScope(Dispatchers.IO).launch {
                    ActionLog.append(
                        activity.applicationContext, ActionLog.KIND_SAVE,
                        title = text.take(120), detail = text,
                    )
                }
                Toast.makeText(activity, R.string.act_saved, Toast.LENGTH_SHORT).show()
                onDone()
            }
            is WheelAction.Generate -> generate(activity, action, text, onDone)
        }
    }

    // ── prompt: spinner dialog → answer dialog（可复制） ──────────────
    private fun explain(activity: Activity, prompt: String, text: String, onDone: () -> Unit) {
        if (!ensureKey(activity)) { onDone(); return }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        val waiting = spinnerDialog(activity, activity.getString(R.string.act_recognizing))
        scope.launch {
            val app = activity.applicationContext
            val answer = withContext(Dispatchers.IO) {
                runCatching { aiText(app, "$prompt\n\n---\n$text") }
                    .getOrElse { app.getString(R.string.act_call_failed, it.message) }
            }
            withContext(Dispatchers.IO) {
                ActionLog.append(
                    app, ActionLog.KIND_PROMPT,
                    title = text.take(120), detail = answer,
                )
            }
            waiting.dismiss()
            if (activity.isFinishing || activity.isDestroyed) return@launch
            answerDialog(activity, activity.getString(R.string.result_title_explain), answer, onDone)
        }
    }

    /** Scrollable, copyable answer dialog shared by explain / instruct. */
    private fun answerDialog(activity: Activity, title: String, answer: String, onDone: () -> Unit) {
        AlertDialog.Builder(activity)
            .setTitle(title)
            .setMessage(answer)
            .setPositiveButton(R.string.result_copy) { _, _ ->
                copy(activity, answer); onDone()
            }
            .setNegativeButton(R.string.act_close) { _, _ -> onDone() }
            .setOnCancelListener { onDone() }
            .show()
    }

    // ── instruct: 用时现输指令 → 意图路由(搜索类真开页)或普通回答 ──────

    /** A parsed open_url directive from the dispatch protocol. */
    internal class Directive(val url: String, val note: String?)

    /**
     * The dispatch protocol (port of the extension's buildDispatchProtocol):
     * search/open intents come back as one-line open_url JSON grounded in
     * the verified preset prefixes + the user's own wheel search prefixes;
     * anything else is answered directly.
     */
    internal fun dispatchProtocol(context: Context): String {
        val prefixes = LinkedHashMap<String, String>()
        SearchPresets.ITEMS.forEach { (label, url) -> prefixes[label] = url }
        WheelConfig.load(context).forEach { spoke ->
            (listOf(spoke) + spoke.children).forEach { item ->
                val a = item.action
                if (a is WheelAction.Search && a.urlPrefix.isNotBlank() && item.label.isNotBlank()) {
                    prefixes[item.label] = a.urlPrefix
                }
            }
        }
        val list = prefixes.entries.joinToString("\n") { "  ${it.key}: ${it.value}" }
        return """You can either ANSWER the instruction directly, OR execute an action:

When the instruction asks to SEARCH / look up / find / open something on a website or the web, reply with ONLY this one-line JSON and absolutely nothing else:
{"action":"open_url","url":"<search-results URL with the query filled in>","note":"<one short sentence describing what you opened, in the instruction's language>"}
CRITICAL: emitting this JSON is the ONLY way the page actually opens. Do not describe the action in prose, and never claim a page was opened unless your reply IS this JSON.

Known site search prefixes — when the target site matches one of these, you MUST use the exact prefix and append the URL-encoded query:
$list
For a site NOT in this list, use its real search URL only if you are certain; otherwise fall back to https://www.google.com/search?q=site%3A<domain>+<query>.
Make the query practical for that site's audience (translate/simplify when appropriate).

For every other kind of instruction (translate, explain, rewrite, extract, summarise, answer a question…), just do the task and output the result directly — no JSON."""
    }

    /**
     * Vision flavour of the protocol — the instruction applies to a
     * screenshot crop: identify the subject first, then build the query.
     */
    internal fun visionDispatchProtocol(context: Context): String =
        dispatchProtocol(context).replaceFirst(
            "When the instruction asks to SEARCH / look up / find / open something on a website or the web, reply with ONLY this one-line JSON and absolutely nothing else:",
            "You are looking at a screenshot region the user framed. When the instruction asks to SEARCH / find / buy / open something related to what is shown, first IDENTIFY the main subject in the image, turn it into a concise search query (brand + product + key attribute; 3-8 words), then reply with ONLY this one-line JSON and absolutely nothing else:",
        )

    /** Parse a directive: whole/fenced reply, or JSON embedded in prose. */
    internal fun parseDirective(raw: String): Directive? {
        fun tryParse(body: String): Directive? = runCatching {
            val o = org.json.JSONObject(body)
            if (o.optString("action") != "open_url") return@runCatching null
            val url = o.optString("url")
            val u = Uri.parse(url)
            if (u.scheme != "https" && u.scheme != "http") return@runCatching null
            Directive(url, o.optString("note").takeIf { it.isNotBlank() })
        }.getOrNull()

        var body = raw.trim()
        Regex("^```(?:json)?\\s*([\\s\\S]*?)\\s*```$").find(body)?.let { body = it.groupValues[1].trim() }
        tryParse(body)?.let { return it }
        for (m in Regex("\\{[^{}]*\"action\"\\s*:\\s*\"open_url\"[^{}]*\\}").findAll(raw)) {
            tryParse(m.value)?.let { return it }
        }
        return null
    }

    private fun instruct(activity: Activity, text: String, onDone: () -> Unit) {
        if (!ensureKey(activity)) { onDone(); return }
        val d = activity.resources.displayMetrics.density
        val input = android.widget.EditText(activity).apply {
            hint = activity.getString(R.string.instruct_hint)
        }
        val box = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding((20 * d).toInt(), (8 * d).toInt(), (20 * d).toInt(), 0)
            addView(input)
        }
        AlertDialog.Builder(activity)
            .setTitle(R.string.instruct_title)
            .setView(box)
            .setPositiveButton(R.string.instruct_run) { _, _ ->
                val instruction = input.text.toString().trim()
                if (instruction.isEmpty()) { onDone(); return@setPositiveButton }
                runInstruction(activity, instruction, text, onDone)
            }
            .setNegativeButton(R.string.act_close) { _, _ -> onDone() }
            .setOnCancelListener { onDone() }
            .show()
        input.requestFocus()
    }

    private fun runInstruction(
        activity: Activity, instruction: String, text: String, onDone: () -> Unit,
    ) {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        val waiting = spinnerDialog(activity, activity.getString(R.string.act_recognizing))
        scope.launch {
            val app = activity.applicationContext
            val prompt =
                dispatchProtocol(app) + "\n\n---\nInstruction: " + instruction + "\n\nText:\n" + text
            val raw = withContext(Dispatchers.IO) {
                runCatching { aiText(app, prompt) }
                    .getOrElse { app.getString(R.string.act_call_failed, it.message) }
            }
            val directive = parseDirective(raw)
            waiting.dismiss()
            if (directive != null) {
                runCatching {
                    activity.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse(directive.url))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                }
                withContext(Dispatchers.IO) {
                    ActionLog.append(
                        app, ActionLog.KIND_SEARCH,
                        title = instruction.take(120), url = directive.url,
                        detail = directive.note ?: "",
                    )
                }
                Toast.makeText(
                    app,
                    app.getString(R.string.instruct_opened, directive.note ?: directive.url),
                    Toast.LENGTH_LONG,
                ).show()
                onDone()
            } else {
                withContext(Dispatchers.IO) {
                    ActionLog.append(
                        app, ActionLog.KIND_PROMPT,
                        title = instruction.take(120), detail = raw,
                    )
                }
                if (activity.isFinishing || activity.isDestroyed) { onDone(); return@launch }
                answerDialog(activity, activity.getString(R.string.instruct_title), raw, onDone)
            }
        }
    }

    // ── generate: 文字即主体,直接出图（跳过描述步骤,比图片流程省一跳） ──
    private fun generate(
        activity: Activity, action: WheelAction.Generate, text: String, onDone: () -> Unit,
    ) {
        val gKey = Prefs.geminiKey(activity)
        if (gKey.isBlank()) {
            Toast.makeText(activity, R.string.gen_need_key, Toast.LENGTH_LONG).show()
            onDone(); return
        }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        val waiting = spinnerDialog(activity, activity.getString(R.string.gen_rendering))
        scope.launch {
            val app = activity.applicationContext
            val prompt = action.stylePrompt.replace("{subject}", text.take(500))
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val bytes = GeminiClient.generateImage(gKey, prompt)
                    val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        ?: error(app.getString(R.string.gen_decode_failed))
                    val uri = Actions.storeToGallery(app, bmp, "nodx-gen")
                    ActionLog.append(
                        app, ActionLog.KIND_GENERATE,
                        title = text.take(120), detail = prompt.take(500), image = bmp,
                    )
                    Pair(bmp, uri)
                }
            }
            waiting.dismiss()
            result.onFailure {
                Toast.makeText(app, app.getString(R.string.gen_failed, it.message), Toast.LENGTH_LONG).show()
                onDone()
            }.onSuccess { (bmp, _) ->
                if (activity.isFinishing || activity.isDestroyed) { onDone(); return@onSuccess }
                // 上图下 prompt,同记录详情的排版
                val d = activity.resources.displayMetrics.density
                val box = LinearLayout(activity).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding((20 * d).toInt(), (8 * d).toInt(), (20 * d).toInt(), 0)
                }
                box.addView(ImageView(activity).apply {
                    adjustViewBounds = true
                    scaleType = ImageView.ScaleType.FIT_CENTER
                    setImageBitmap(bmp)
                })
                AlertDialog.Builder(activity)
                    .setTitle(R.string.gen_done)
                    .setView(ScrollView(activity).apply { addView(box) })
                    .setPositiveButton(R.string.act_close) { _, _ -> onDone() }
                    .setOnCancelListener { onDone() }
                    .show()
            }
        }
    }

    private fun spinnerDialog(activity: Activity, msg: String): AlertDialog {
        val d = activity.resources.displayMetrics.density
        val row = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding((24 * d).toInt(), (24 * d).toInt(), (24 * d).toInt(), (24 * d).toInt())
            addView(ProgressBar(activity))
            addView(TextView(activity).apply {
                this.text = msg
                setPadding((16 * d).toInt(), (8 * d).toInt(), 0, 0)
            })
        }
        return AlertDialog.Builder(activity).setView(row).setCancelable(false).show()
    }

    private fun copy(context: Context, s: String) {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("nodx", s))
        Toast.makeText(context, R.string.result_copied, Toast.LENGTH_SHORT).show()
    }
}
