package solutions.aicon.nodx

import android.content.Context
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager

/**
 * Wraps MediaProjection + ImageReader + VirtualDisplay to grab ONE
 * full-screen frame as a Bitmap. MVP: one-shot capture per call.
 */
class ScreenCaptureManager(
    context: Context,
    private val projection: MediaProjection,
) {
    private val metrics = DisplayMetrics().also {
        @Suppress("DEPRECATION")
        (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.getRealMetrics(it)
    }
    private val width = metrics.widthPixels
    private val height = metrics.heightPixels
    private val density = metrics.densityDpi
    private var reader: ImageReader? = null
    private var display: VirtualDisplay? = null
    private val main = Handler(Looper.getMainLooper())

    fun captureOnce(onResult: (Bitmap?) -> Unit) {
        val ir = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
        reader = ir
        display = projection.createVirtualDisplay(
            "nodx-capture", width, height, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            ir.surface, null, main
        )
        ir.setOnImageAvailableListener({ r ->
            val image = r.acquireLatestImage() ?: return@setOnImageAvailableListener
            val plane = image.planes[0]
            val pixelStride = plane.pixelStride
            val rowPadding = plane.rowStride - pixelStride * width
            val padded = Bitmap.createBitmap(width + rowPadding / pixelStride, height, Bitmap.Config.ARGB_8888)
            padded.copyPixelsFromBuffer(plane.buffer)
            val cropped = Bitmap.createBitmap(padded, 0, 0, width, height)
            image.close(); cleanup()
            main.post { onResult(cropped) }
        }, main)
    }

    private fun cleanup() { display?.release(); display = null; reader?.close(); reader = null }
    fun release() { cleanup() }
}
