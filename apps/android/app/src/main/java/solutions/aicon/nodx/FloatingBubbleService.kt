package solutions.aicon.nodx

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import kotlin.math.abs

/**
 * Foreground service (mediaProjection type). Holds the MediaProjection
 * granted in MainActivity, draws a draggable floating bubble, and on tap
 * grabs one screen frame then shows the SelectionOverlayView.
 */
class FloatingBubbleService : Service() {

    companion object {
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"
        private const val CHANNEL_ID = "nodx_bubble"
        private const val NOTIF_ID = 1001
    }

    private lateinit var windowManager: WindowManager
    private var bubble: View? = null
    private var projection: MediaProjection? = null
    private var capture: ScreenCaptureManager? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground()
        if (intent != null && projection == null) {
            val code = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
            @Suppress("DEPRECATION")
            val data = intent.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
            if (code != 0 && data != null) {
                val mgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                projection = mgr.getMediaProjection(code, data)
                capture = ScreenCaptureManager(this, projection!!)
            }
        }
        if (bubble == null) addBubble()
        return START_STICKY
    }

    private fun startAsForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW)
            )
        }
        val notif: Notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setSmallIcon(R.drawable.ic_bubble)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            @Suppress("DEPRECATION") startForeground(NOTIF_ID, notif)
        }
    }

    private fun addBubble() {
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val iv = ImageView(this).apply { setImageResource(R.drawable.ic_bubble) }
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        val lp = WindowManager.LayoutParams(
            dp(56), dp(56), type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.START; x = dp(16); y = dp(220) }

        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var moved = false
        iv.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY; startX = lp.x; startY = lp.y; moved = false; true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (e.rawX - downX).toInt(); val dy = (e.rawY - downY).toInt()
                    if (abs(dx) > 8 || abs(dy) > 8) moved = true
                    lp.x = startX + dx; lp.y = startY + dy
                    windowManager.updateViewLayout(iv, lp); true
                }
                MotionEvent.ACTION_UP -> { if (!moved) onBubbleTap(); true }
                else -> false
            }
        }
        bubble = iv
        windowManager.addView(iv, lp)
    }

    private fun onBubbleTap() {
        val cap = capture ?: return
        // Hide the bubble so it isn't in the screenshot, grab one frame, show overlay.
        bubble?.visibility = View.INVISIBLE
        cap.captureOnce { bmp ->
            bubble?.visibility = View.VISIBLE
            if (bmp != null) SelectionOverlayView.show(this, windowManager, bmp)
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    override fun onDestroy() {
        bubble?.let { runCatching { windowManager.removeView(it) } }
        capture?.release(); projection?.stop()
        super.onDestroy()
    }
}
