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
 * Foreground service — the floating bubble. Starts WITHOUT any projection
 * (specialUse FGS type), so opening the app puts the bubble up with zero
 * dialogs. The screen-share consent is deferred to the FIRST bubble tap
 * of each session (ProjectionConsentActivity relays the grant back with
 * ACTION_GRANT_AND_CAPTURE, and the tap's capture runs right after);
 * subsequent taps reuse the live projection silently.
 */
class FloatingBubbleService : Service() {

    companion object {
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"
        const val ACTION_STOP = "solutions.aicon.nodx.STOP"
        const val ACTION_GRANT_AND_CAPTURE = "solutions.aicon.nodx.GRANT_AND_CAPTURE"
        private const val CHANNEL_ID = "nodx_bubble"
        private const val NOTIF_ID = 1001

        /** Lets MainActivity skip auto-start when the bubble already runs. */
        @Volatile var isRunning = false
            private set
    }

    private lateinit var windowManager: WindowManager
    private var bubble: View? = null
    private var projection: MediaProjection? = null
    private var capture: ScreenCaptureManager? = null
    private val main = android.os.Handler(android.os.Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            // 通知栏「停止」/ 主界面停止按钮 → 结束录屏会话。
            stopSelf()
            return START_NOT_STICKY
        }
        val code = intent?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0
        @Suppress("DEPRECATION")
        val data = intent?.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)

        if (projection == null && code != 0 && data != null) {
            // Consent just granted. Order matters on 14+: upgrade to the
            // mediaProjection FGS type BEFORE getMediaProjection, and
            // registerCallback BEFORE any capture.
            startAsForeground(withProjection = true)
            val mgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            projection = mgr.getMediaProjection(code, data)
            projection!!.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() { detachProjection() }
            }, null)
            capture = ScreenCaptureManager(this, projection!!)
            if (intent.action == ACTION_GRANT_AND_CAPTURE) {
                // Run the capture the user's tap asked for, after the
                // consent dialog has left the screen.
                main.postDelayed({ onBubbleTap() }, 400)
            }
        } else {
            // Plain start (app open / sticky revive): bubble only, no
            // projection — consent comes on first tap.
            startAsForeground(withProjection = projection != null)
        }
        if (bubble == null) addBubble()
        isRunning = true
        return START_STICKY
    }

    /** Projection gone (stopped/revoked/expired) — keep the bubble, re-ask next tap. */
    private fun detachProjection() {
        capture?.release(); capture = null
        projection = null
        // Drop the mediaProjection FGS type — holding it without a live
        // projection is what the 14+ policy complains about.
        runCatching { startAsForeground(withProjection = false) }
    }

    private fun startAsForeground(withProjection: Boolean) {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW)
            )
        }
        val stopPending = android.app.PendingIntent.getService(
            this, 0,
            Intent(this, FloatingBubbleService::class.java).setAction(ACTION_STOP),
            android.app.PendingIntent.FLAG_IMMUTABLE
        )
        val notif: Notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(getString(R.string.notif_text))
            .setSmallIcon(R.drawable.ic_bubble)
            .addAction(
                Notification.Action.Builder(null, getString(R.string.notif_stop), stopPending).build()
            )
            .build()
        when {
            Build.VERSION.SDK_INT >= 34 -> {
                val type = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or
                    (if (withProjection) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION else 0)
                startForeground(NOTIF_ID, notif, type)
            }
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && withProjection ->
                startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
            else ->
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
        val cap = capture
        if (cap == null) {
            // First tap of this session — ask for screen share now; the
            // grant flows back as ACTION_GRANT_AND_CAPTURE and finishes
            // this very capture. (SYSTEM_ALERT_WINDOW exempts us from the
            // background-activity-start restriction.)
            startActivity(
                Intent(this, ProjectionConsentActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            return
        }
        // Hide the bubble so it isn't in the screenshot, grab one frame, show overlay.
        bubble?.visibility = View.INVISIBLE
        cap.captureOnce { bmp ->
            bubble?.visibility = View.VISIBLE
            if (bmp != null) {
                SelectionOverlayView.show(this, windowManager, bmp)
            } else {
                // Dead grant — detach so the next tap re-asks instead of
                // failing forever.
                detachProjection()
                android.widget.Toast.makeText(
                    this, getString(R.string.projection_expired),
                    android.widget.Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    override fun onDestroy() {
        isRunning = false
        bubble?.let { runCatching { windowManager.removeView(it) } }
        capture?.release(); projection?.stop()
        super.onDestroy()
    }
}
