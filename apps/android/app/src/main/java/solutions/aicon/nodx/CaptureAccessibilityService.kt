package solutions.aicon.nodx

import android.accessibilityservice.AccessibilityService
import android.graphics.Bitmap
import android.os.Build
import android.view.Display
import android.view.accessibility.AccessibilityEvent

/**
 * Long-lived screenshot permission. Android 14+ demands a fresh
 * MediaProjection consent per session (and kills the session on lock),
 * so the "authorize once" path is the accessibility takeScreenshot API:
 * the user flips nodx on under system Accessibility settings ONE time,
 * and bubble taps capture silently from then on — across locks and
 * reboots. MediaProjection stays as the fallback when this is off.
 *
 * Privacy: the service listens to no events (minimal event mask, no
 * window content access) — it exists solely for takeScreenshot(), which
 * only fires on an explicit bubble tap.
 */
class CaptureAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        instance = this
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}

    /** One full-screen shot → main-thread callback (null on failure). */
    fun grab(cb: (Bitmap?) -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            cb(null)
            return
        }
        takeScreenshot(
            Display.DEFAULT_DISPLAY,
            mainExecutor,
            object : TakeScreenshotCallback {
                override fun onSuccess(result: ScreenshotResult) {
                    val bmp = Bitmap.wrapHardwareBuffer(result.hardwareBuffer, result.colorSpace)
                        ?.copy(Bitmap.Config.ARGB_8888, false)
                    result.hardwareBuffer.close()
                    cb(bmp)
                }

                override fun onFailure(errorCode: Int) = cb(null)
            },
        )
    }

    companion object {
        /** Set while the user has the service enabled in system settings. */
        @Volatile
        var instance: CaptureAccessibilityService? = null
            private set
    }
}
