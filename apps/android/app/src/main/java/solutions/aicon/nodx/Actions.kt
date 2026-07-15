package solutions.aicon.nodx

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import android.graphics.BitmapFactory
import kotlinx.coroutines.withContext
import solutions.aicon.nodx.ai.AnthropicClient
import solutions.aicon.nodx.ai.GeminiClient
import solutions.aicon.nodx.ai.OpenAIClient
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URLEncoder

/**
 * The radial menu's action runners — Android counterparts of the browser
 * extension's marquee.ts routes (Lens 0.9):
 *
 *   📖 解释      → Haiku vision「这是什么」→ Toast（结果卡片是下一步）
 *   🔎 搜索      → AI 认图 → 浏览器 Google 图片搜 (udm=2)
 *   💡 保存      → 移动端等价物：裁剪图存入相册 Pictures/nodx
 *   🏷 Shopping  → AI 认图 → Google Shopping (udm=28)
 *   📦 Amazon    → AI 认图 → amazon.com/s?k=
 *   🎨 生成      → 暂未接入（需 Gemini 图像模型，等 BYOK 第二个 key）
 *
 * All runners are fire-and-forget from the overlay: the overlay dismisses
 * itself first, then the action reports progress/result via Toast.
 */
object Actions {

    /**
     * Vision call routed by the provider setting — same four families as
     * the extension (nodx-local excluded: the phone can't reach a desktop
     * loopback gateway). Blocking — call from Dispatchers.IO.
     */
    private fun vision(context: Context, b64: String, prompt: String, quality: Boolean = false): String =
        when (Prefs.provider(context)) {
            Prefs.PROVIDER_GEMINI ->
                GeminiClient.visionText(Prefs.geminiKey(context), b64, prompt)
            Prefs.PROVIDER_OPENAI -> OpenAIClient.visionText(
                Prefs.openaiKey(context), b64, prompt,
                model = if (quality) "gpt-5.6-sol" else "gpt-5.6-luna",
            )
            Prefs.PROVIDER_OPENROUTER -> OpenAIClient.visionText(
                Prefs.openrouterKey(context), b64, prompt,
                // Auto-picks a vision-capable free model per request.
                model = "openrouter/free", baseUrl = OpenAIClient.OPENROUTER_BASE,
            )
            else -> AnthropicClient.explain(
                Prefs.anthropicKey(context), b64, prompt,
                model = if (quality) "claude-sonnet-5" else "claude-haiku-4-5",
            )
        }

    /** True when the active provider's key is present; toasts otherwise. */
    private fun ensureKey(context: Context): Boolean {
        val provider = Prefs.provider(context)
        val ok = Prefs.keyFor(context, provider).isNotBlank()
        if (!ok) {
            toast(
                context,
                context.getString(
                    if (provider == Prefs.PROVIDER_GEMINI) R.string.toast_need_gemini_key
                    else R.string.toast_need_key
                ),
                long = true,
            )
        }
        return ok
    }

    fun run(context: Context, action: WheelAction, crop: Bitmap) {
        when (action) {
            is WheelAction.Prompt -> explain(context, crop, action.prompt)
            is WheelAction.Search -> aiSearchOpen(context, crop, action.urlPrefix, R.string.act_searched)
            WheelAction.Save -> save(context, crop)
            is WheelAction.Generate -> generate(context, crop, action)
        }
    }

    /** kind=prompt：vision call with the (user-customizable) prompt →
     *  full-text overlay card (scrollable, copyable, user-dismissed). */
    private fun explain(context: Context, crop: Bitmap, prompt: String) {
        if (!ensureKey(context)) return
        val b64 = toBase64ForVision(crop)
        toast(context, context.getString(R.string.act_recognizing))
        CoroutineScope(Dispatchers.IO).launch {
            val answer = runCatching { vision(context, b64, prompt) }
                .getOrElse { context.getString(R.string.act_call_failed, it.message) }
            ActionLog.append(
                context, ActionLog.KIND_PROMPT,
                title = prompt.take(120), detail = answer, image = crop,
            )
            withContext(Dispatchers.Main) {
                val wm = context.getSystemService(Context.WINDOW_SERVICE)
                    as android.view.WindowManager
                ResultCard.show(
                    context, wm,
                    context.getString(R.string.result_title_explain), answer,
                )
            }
        }
    }

    /** kind=search: AI names the image → open browser at `urlPrefix<query>`. */
    private fun aiSearchOpen(context: Context, crop: Bitmap, urlPrefix: String, okMsgRes: Int) {
        if (!ensureKey(context)) return
        val b64 = toBase64ForVision(crop)
        toast(context, context.getString(R.string.act_identifying))
        CoroutineScope(Dispatchers.IO).launch {
            val query = runCatching {
                vision(context, b64, AnthropicClient.IDENTIFY_PROMPT)
                    .trim().removeSurrounding("\"").removeSurrounding("'")
                    .replace(Regex("\\s+"), " ").trim()
            }.getOrNull()
            if (query.isNullOrBlank()) { mainToast(context, context.getString(R.string.act_no_subject)); return@launch }
            val url = urlPrefix + URLEncoder.encode(query, "UTF-8")
            ActionLog.append(
                context, ActionLog.KIND_SEARCH,
                title = query, url = url, image = crop,
            )
            withContext(Dispatchers.Main) {
                openUrl(context, url)
                toast(context, context.getString(okMsgRes, query))
            }
        }
    }

    /** 💡 保存：crop → 相册 Pictures/nodx（API 29+ 走 MediaStore，28- 存应用目录）。 */
    private fun save(context: Context, crop: Bitmap) {
        CoroutineScope(Dispatchers.IO).launch {
            val uri = storeToGallery(context, crop, "nodx")
            if (uri != null) ActionLog.append(context, ActionLog.KIND_SAVE, image = crop)
            mainToast(
                context,
                context.getString(if (uri != null) R.string.act_saved else R.string.act_save_failed)
            )
        }
    }

    /**
     * 🎨 生成 — the extension's chain, ported: Sonnet writes a vivid subject
     * prompt from the crop → Gemini renders the 2×2 four-style grid →
     * downscale → gallery (= 收集库) → open in the system viewer.
     */
    private fun generate(context: Context, crop: Bitmap, action: WheelAction.Generate) {
        val gKey = Prefs.geminiKey(context)
        if (!ensureKey(context)) return
        if (gKey.isBlank()) {
            toast(context, context.getString(R.string.gen_need_key), long = true)
            return
        }
        val b64 = toBase64ForVision(crop)
        toast(context, context.getString(R.string.gen_writing_prompt), long = true)
        CoroutineScope(Dispatchers.IO).launch {
            val subject = runCatching {
                vision(context, b64, AnthropicClient.DESCRIBE_PROMPT, quality = true).trim()
            }.getOrElse { mainToast(context, context.getString(R.string.gen_prompt_failed, it.message), long = true); return@launch }
            mainToast(context, context.getString(R.string.gen_rendering), long = true)
            val bytes = runCatching {
                GeminiClient.generateImage(gKey, action.stylePrompt.replace("{subject}", subject))
            }
                .getOrElse { mainToast(context, context.getString(R.string.gen_failed, it.message), long = true); return@launch }
            val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                ?: run { mainToast(context, context.getString(R.string.gen_decode_failed)); return@launch }
            val uri = storeToGallery(context, downscale(bmp, 640), "nodx-gen")
            ActionLog.append(
                context, ActionLog.KIND_GENERATE,
                title = subject.take(160), detail = subject, image = downscale(bmp, 360),
            )
            withContext(Dispatchers.Main) {
                if (uri == null) { toast(context, context.getString(R.string.gen_saved_failed)); return@withContext }
                toast(context, context.getString(R.string.gen_done))
                if (uri.scheme == "content") runCatching {
                    context.startActivity(
                        Intent(Intent.ACTION_VIEW).setDataAndType(uri, "image/*")
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    )
                }
            }
        }
    }


    private fun downscale(b: Bitmap, maxEdge: Int): Bitmap {
        val longest = maxOf(b.width, b.height)
        if (longest <= maxEdge) return b
        val s = maxEdge.toFloat() / longest
        return Bitmap.createScaledBitmap(b, (b.width * s).toInt(), (b.height * s).toInt(), true)
    }

    /** Write a PNG into Pictures/nodx; returns its content Uri (file Uri on API <29). */
    fun storeToGallery(context: Context, bmp: Bitmap, prefix: String): android.net.Uri? {
        val name = "$prefix-${System.currentTimeMillis()}.png"
        return runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, name)
                    put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                    put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/nodx")
                }
                val uri = context.contentResolver.insert(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values
                ) ?: error("MediaStore insert failed")
                context.contentResolver.openOutputStream(uri)!!.use {
                    bmp.compress(Bitmap.CompressFormat.PNG, 100, it)
                }
                uri
            } else {
                val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_PICTURES), "nodx")
                dir.mkdirs()
                val f = File(dir, name)
                f.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
                Uri.fromFile(f)
            }
        }.getOrNull()
    }

    /**
     * Open a URL from the overlay-service context. Background activity
     * starts are allowed here because the app holds SYSTEM_ALERT_WINDOW.
     */
    private fun openUrl(context: Context, url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { context.startActivity(intent) }
            .onFailure { toast(context, context.getString(R.string.act_browser_failed, it.message)) }
    }

    /** Vision payloads: downscale to ~1.6k px + JPEG. Anthropic rejects
     *  images over 10 MB and models are capped around 1568 px anyway — a
     *  full-res 1440p PNG crop can blow past the limit. Saves to
     *  Pictures/nodx keep the original PNG (see savePng). */
    private fun toBase64ForVision(bmp: Bitmap): String {
        val longest = maxOf(bmp.width, bmp.height)
        val scaled = if (longest > 1568) {
            val s = 1568f / longest
            Bitmap.createScaledBitmap(
                bmp,
                (bmp.width * s).toInt().coerceAtLeast(1),
                (bmp.height * s).toInt().coerceAtLeast(1),
                true,
            )
        } else bmp
        val baos = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 82, baos)
        return Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
    }

    private fun toast(context: Context, msg: String, long: Boolean = false) =
        Toast.makeText(context, msg, if (long) Toast.LENGTH_LONG else Toast.LENGTH_SHORT).show()

    private suspend fun mainToast(context: Context, msg: String, long: Boolean = false) =
        withContext(Dispatchers.Main) { toast(context, msg, long) }
}
