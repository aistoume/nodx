package solutions.aicon.nodx

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import kotlin.math.max

/**
 * Two-pass BitmapFactory decoding with inSampleSize (Play performance
 * recommendation): read bounds first, then decode at the smallest power-of-2
 * sample so the longest side never lands far above [maxDim]. Keeps a 48MP
 * camera shot from inflating to ~190MB of ARGB just to be shown on a
 * ~2400px screen.
 */
object BitmapIO {
    private fun sampleSize(w: Int, h: Int, maxDim: Int): Int {
        var sample = 1
        while (max(w, h) / (sample * 2) >= maxDim) sample *= 2
        return sample
    }

    fun decodeFileSampled(path: String, maxDim: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val opts = BitmapFactory.Options().apply {
            inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, maxDim)
        }
        return BitmapFactory.decodeFile(path, opts)
    }

    fun decodeBytesSampled(bytes: ByteArray, maxDim: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val opts = BitmapFactory.Options().apply {
            inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, maxDim)
        }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
    }
}
