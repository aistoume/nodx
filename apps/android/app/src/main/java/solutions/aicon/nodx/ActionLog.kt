package solutions.aicon.nodx

import android.content.Context
import android.graphics.Bitmap
import org.json.JSONObject
import java.io.File

/**
 * On-device activity log — the Android counterpart of the extension's
 * action history. Every wheel action leaves a record (crop thumbnail +
 * prompt/answer, search query + jump URL, …), not just the saved image.
 *
 * Storage: filesDir/action-log.jsonl (one JSON object per line, append
 * only) + filesDir/action-thumbs/<id>.png. Capped at [MAX] entries —
 * pruning rewrites the file and deletes orphaned thumbnails.
 */
object ActionLog {
    const val KIND_PROMPT = "prompt"
    const val KIND_SEARCH = "search"
    const val KIND_SAVE = "save"
    const val KIND_GENERATE = "generate"

    private const val MAX = 200

    class Entry(
        val id: String,
        val kind: String,
        /** Prompt (kind=prompt), search query, or generation subject. */
        val title: String,
        /** Full AI answer / generation prompt; "" when N/A. */
        val detail: String,
        /** Jump target for search-style actions. */
        val url: String?,
        /** Absolute path of the thumbnail PNG, if one was saved. */
        val thumb: String?,
        val createdAt: Long,
    )

    private fun logFile(c: Context) = File(c.filesDir, "action-log.jsonl")
    private fun thumbDir(c: Context) = File(c.filesDir, "action-thumbs").apply { mkdirs() }

    /** Blocking (file + bitmap IO) — call from Dispatchers.IO. */
    fun append(
        c: Context,
        kind: String,
        title: String = "",
        detail: String = "",
        url: String? = null,
        image: Bitmap? = null,
    ) {
        runCatching {
            val id = java.util.UUID.randomUUID().toString()
            var thumbPath: String? = null
            if (image != null) {
                val longest = maxOf(image.width, image.height)
                val scaled = if (longest <= 360) image else {
                    val s = 360f / longest
                    Bitmap.createScaledBitmap(
                        image, (image.width * s).toInt(), (image.height * s).toInt(), true,
                    )
                }
                val f = File(thumbDir(c), "$id.png")
                f.outputStream().use { scaled.compress(Bitmap.CompressFormat.PNG, 90, it) }
                thumbPath = f.absolutePath
            }
            // NOTE: absent keys, not JSONObject.NULL — optString() turns a
            // stored NULL into the literal string "null", which then looks
            // like a real URL/path on read.
            val o = JSONObject()
                .put("id", id)
                .put("kind", kind)
                .put("title", title)
                .put("detail", detail)
                .put("createdAt", System.currentTimeMillis())
            if (url != null) o.put("url", url)
            if (thumbPath != null) o.put("thumb", thumbPath)
            logFile(c).appendText(o.toString() + "\n")
            prune(c)
        }
    }

    /** Newest first. Blocking — call from Dispatchers.IO. */
    fun list(c: Context): List<Entry> {
        val f = logFile(c)
        if (!f.exists()) return emptyList()
        return f.readLines().mapNotNull { line ->
            runCatching {
                val o = JSONObject(line)
                Entry(
                    o.getString("id"),
                    o.getString("kind"),
                    o.optString("title"),
                    o.optString("detail"),
                    o.optString("url").takeIf { it.isNotBlank() && it != "null" },
                    o.optString("thumb").takeIf { it.isNotBlank() && it != "null" },
                    o.optLong("createdAt"),
                )
            }.getOrNull()
        }.asReversed()
    }

    fun delete(c: Context, id: String) {
        runCatching {
            val kept = logFile(c).takeIf { it.exists() }?.readLines().orEmpty()
                .filterNot { runCatching { JSONObject(it).getString("id") == id }.getOrDefault(false) }
            logFile(c).writeText(if (kept.isEmpty()) "" else kept.joinToString("\n") + "\n")
            File(thumbDir(c), "$id.png").delete()
        }
    }

    private fun prune(c: Context) {
        val lines = logFile(c).readLines()
        if (lines.size <= MAX) return
        val kept = lines.takeLast(MAX)
        logFile(c).writeText(kept.joinToString("\n") + "\n")
        val liveIds = kept.mapNotNull {
            runCatching { JSONObject(it).getString("id") }.getOrNull()
        }.toHashSet()
        thumbDir(c).listFiles()?.forEach {
            if (it.nameWithoutExtension !in liveIds) it.delete()
        }
    }
}
