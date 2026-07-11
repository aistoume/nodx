package solutions.aicon.nodx

import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Size
import java.io.File

/**
 * The gallery folder Pictures/nodx IS the collection store. This helper
 * reads it back (newest first) for both the main screen's recent strip
 * and the full GalleryActivity grid. Blocking; call from Dispatchers.IO.
 *
 * Without READ_MEDIA_IMAGES the MediaStore query silently narrows to the
 * app's own inserts — which is exactly our content, so the recent strip
 * works permission-free; GalleryActivity asks for the permission to also
 * survive reinstalls (where ownership of old rows is lost).
 */
object MediaLibrary {

    fun recentThumbs(context: Context, limit: Int, thumbPx: Int = 384): List<Pair<Uri?, Bitmap>> {
        val out = mutableListOf<Pair<Uri?, Bitmap>>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            runCatching {
                context.contentResolver.query(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    arrayOf(MediaStore.Images.Media._ID),
                    "${MediaStore.Images.Media.RELATIVE_PATH} LIKE ?",
                    arrayOf("${Environment.DIRECTORY_PICTURES}/nodx%"),
                    "${MediaStore.Images.Media.DATE_ADDED} DESC",
                )?.use { c ->
                    while (c.moveToNext() && out.size < limit) {
                        val uri = ContentUris.withAppendedId(
                            MediaStore.Images.Media.EXTERNAL_CONTENT_URI, c.getLong(0)
                        )
                        runCatching {
                            context.contentResolver.loadThumbnail(uri, Size(thumbPx, thumbPx), null)
                        }.getOrNull()?.let { out += uri to it }
                    }
                }
            }
        } else {
            // API 26–28: 保存 falls back to the app-private pictures dir.
            val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_PICTURES), "nodx")
            dir.listFiles { f -> f.extension == "png" }
                ?.sortedByDescending { it.lastModified() }
                ?.take(limit)
                ?.forEach { f ->
                    val opts = BitmapFactory.Options().apply { inSampleSize = 4 }
                    BitmapFactory.decodeFile(f.absolutePath, opts)?.let { out += null to it }
                }
        }
        return out
    }
}
