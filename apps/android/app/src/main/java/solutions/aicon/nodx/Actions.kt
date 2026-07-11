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
import kotlinx.coroutines.withContext
import solutions.aicon.nodx.ai.AnthropicClient
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

    fun run(context: Context, choice: RadialMenu.Choice, crop: Bitmap) {
        when (choice) {
            RadialMenu.Choice.EXPLAIN -> explain(context, crop)
            RadialMenu.Choice.SEARCH ->
                aiSearchOpen(context, crop, "https://www.google.com/search?udm=2&q=", "已在 Google 图片搜")
            RadialMenu.Choice.SHOPPING_GOOGLE ->
                aiSearchOpen(context, crop, "https://www.google.com/search?udm=28&q=", "已在 Google Shopping 搜")
            RadialMenu.Choice.SHOPPING_AMAZON ->
                aiSearchOpen(context, crop, "https://www.amazon.com/s?k=", "已在 Amazon 搜")
            RadialMenu.Choice.SAVE -> save(context, crop)
            RadialMenu.Choice.GENERATE ->
                toast(context, "🎨 生成暂未接入（需 Gemini 图像模型）")
        }
    }

    private fun explain(context: Context, crop: Bitmap) {
        val b64 = toBase64Png(crop)
        toast(context, "识别中…")
        CoroutineScope(Dispatchers.IO).launch {
            val apiKey = Prefs.anthropicKey(context)
            if (apiKey.isBlank()) { mainToast(context, "请先在主界面填 Anthropic key"); return@launch }
            val answer = runCatching { AnthropicClient.explain(apiKey, b64) }
                .getOrElse { "调用失败: ${it.message}" }
            mainToast(context, answer.take(300), long = true)
        }
    }

    /** Shared: Haiku names the image → open browser at `urlPrefix<query>`. */
    private fun aiSearchOpen(context: Context, crop: Bitmap, urlPrefix: String, okMsg: String) {
        val b64 = toBase64Png(crop)
        toast(context, "认图中…")
        CoroutineScope(Dispatchers.IO).launch {
            val apiKey = Prefs.anthropicKey(context)
            if (apiKey.isBlank()) { mainToast(context, "请先在主界面填 Anthropic key"); return@launch }
            val query = runCatching { AnthropicClient.identify(apiKey, b64) }.getOrNull()
            if (query.isNullOrBlank()) { mainToast(context, "没认出主体，换个框选试试"); return@launch }
            withContext(Dispatchers.Main) {
                openUrl(context, urlPrefix + URLEncoder.encode(query, "UTF-8"))
                toast(context, "$okMsg：$query")
            }
        }
    }

    /** 💡 保存：crop → 相册 Pictures/nodx（API 29+ 走 MediaStore，28- 存应用目录）。 */
    private fun save(context: Context, crop: Bitmap) {
        CoroutineScope(Dispatchers.IO).launch {
            val name = "nodx-${System.currentTimeMillis()}.png"
            val ok = runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = ContentValues().apply {
                        put(MediaStore.Images.Media.DISPLAY_NAME, name)
                        put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                        put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/nodx")
                    }
                    val uri = context.contentResolver.insert(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values
                    ) ?: error("MediaStore insert 失败")
                    context.contentResolver.openOutputStream(uri)!!.use {
                        crop.compress(Bitmap.CompressFormat.PNG, 100, it)
                    }
                } else {
                    val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_PICTURES), "nodx")
                    dir.mkdirs()
                    File(dir, name).outputStream().use { crop.compress(Bitmap.CompressFormat.PNG, 100, it) }
                }
            }.isSuccess
            mainToast(context, if (ok) "💡 已存入相册 Pictures/nodx（app 收集库可查看）" else "保存失败")
        }
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
            .onFailure { toast(context, "打不开浏览器: ${it.message}") }
    }

    private fun toBase64Png(bmp: Bitmap): String {
        val baos = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.PNG, 100, baos)
        return Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
    }

    private fun toast(context: Context, msg: String, long: Boolean = false) =
        Toast.makeText(context, msg, if (long) Toast.LENGTH_LONG else Toast.LENGTH_SHORT).show()

    private suspend fun mainToast(context: Context, msg: String, long: Boolean = false) =
        withContext(Dispatchers.Main) { toast(context, msg, long) }
}
