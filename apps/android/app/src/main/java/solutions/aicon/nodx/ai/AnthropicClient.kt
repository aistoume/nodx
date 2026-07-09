package solutions.aicon.nodx.ai

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Minimal Anthropic Messages call with a vision (image) input — mirrors
 * the browser extension's callAnthropic. Blocking; call from Dispatchers.IO.
 */
object AnthropicClient {
    private val client = OkHttpClient.Builder().callTimeout(60, TimeUnit.SECONDS).build()
    private val JSON = "application/json".toMediaType()

    fun explain(apiKey: String, imageBase64: String, model: String = "claude-haiku-4-5"): String {
        val content = JSONArray()
            .put(JSONObject().put("type", "image").put("source",
                JSONObject().put("type", "base64").put("media_type", "image/png").put("data", imageBase64)))
            .put(JSONObject().put("type", "text").put("text",
                "这是什么？简洁回答（2-4 句），关键数字/文字精确引用。"))
        val payload = JSONObject()
            .put("model", model)
            .put("max_tokens", 400)
            .put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", content)))
        val req = Request.Builder()
            .url("https://api.anthropic.com/v1/messages")
            .addHeader("x-api-key", apiKey)
            .addHeader("anthropic-version", "2023-06-01")
            .addHeader("content-type", "application/json")
            .post(payload.toString().toRequestBody(JSON))
            .build()
        client.newCall(req).execute().use { resp ->
            val txt = resp.body?.string() ?: return "空响应"
            if (!resp.isSuccessful) return "Anthropic ${resp.code}: ${txt.take(160)}"
            val arr = JSONObject(txt).optJSONArray("content") ?: return "无内容"
            val sb = StringBuilder()
            for (i in 0 until arr.length()) {
                val b = arr.getJSONObject(i)
                if (b.optString("type") == "text") sb.append(b.optString("text"))
            }
            return sb.toString().ifBlank { "（无文本）" }
        }
    }
}
