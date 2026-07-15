package solutions.aicon.nodx

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.PixelFormat
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import kotlin.math.abs

/**
 * Foreground service — the floating bubble.
 *
 * TAP  → runs the current bubble mode (Prefs.bubbleMode): screenshot /
 *        clipboard-text / camera. Factory default is screenshot.
 * LONG-PRESS → fans out a mode wheel (ModeWheelView): slide onto a spoke
 *        and release to run it once, or release near centre then tap a
 *        spoke to make it the new default. The bubble icon shows a small
 *        badge for non-default modes so the user can tell them apart.
 * DRAG → repositions the bubble (unchanged).
 *
 * Starts WITHOUT projection (specialUse FGS); the screen-share consent is
 * deferred to the first screenshot of each session.
 */
class FloatingBubbleService : Service() {

    companion object {
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"
        const val ACTION_STOP = "solutions.aicon.nodx.STOP"
        const val ACTION_GRANT_AND_CAPTURE = "solutions.aicon.nodx.GRANT_AND_CAPTURE"
        const val ACTION_SHOW_CAPTURE = "solutions.aicon.nodx.SHOW_CAPTURE"
        const val EXTRA_CAPTURE_PATH = "capture_path"
        private const val CHANNEL_ID = "nodx_bubble"
        private const val NOTIF_ID = 1001
        private const val LONG_PRESS_MS = 380L

        @Volatile var isRunning = false
            private set
    }

    private lateinit var windowManager: WindowManager
    private var bubble: FrameLayout? = null
    private var badge: TextView? = null
    private var projection: MediaProjection? = null
    private var capture: ScreenCaptureManager? = null
    private val main = android.os.Handler(android.os.Looper.getMainLooper())

    // Mode wheel (long-press) state.
    private var modeWheel: ModeWheelView? = null
    private var wheelSticky = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> { stopSelf(); return START_NOT_STICKY }
            ACTION_SHOW_CAPTURE -> {
                // Camera bridge: a photo was saved; show the selection overlay.
                if (bubble == null) { ensureWindowManager(); addBubble() }
                startAsForeground(withProjection = projection != null)
                isRunning = true
                val path = intent.getStringExtra(EXTRA_CAPTURE_PATH)
                if (path != null) {
                    val bmp = runCatching { BitmapFactory.decodeFile(path) }.getOrNull()
                    java.io.File(path).delete()
                    if (bmp != null) SelectionOverlayView.show(this, windowManager, bmp)
                }
                return START_STICKY
            }
        }
        val code = intent?.getIntExtra(EXTRA_RESULT_CODE, 0) ?: 0
        @Suppress("DEPRECATION")
        val data = intent?.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)

        if (projection == null && code != 0 && data != null) {
            startAsForeground(withProjection = true)
            val mgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            projection = mgr.getMediaProjection(code, data)
            projection!!.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() { detachProjection() }
            }, null)
            capture = ScreenCaptureManager(this, projection!!)
            if (intent.action == ACTION_GRANT_AND_CAPTURE) {
                main.postDelayed({ screenshotMode() }, 400)
            }
        } else {
            startAsForeground(withProjection = projection != null)
        }
        if (bubble == null) { ensureWindowManager(); addBubble() }
        isRunning = true
        return START_STICKY
    }

    private fun detachProjection() {
        capture?.release(); capture = null
        projection = null
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

    private fun ensureWindowManager() {
        if (!::windowManager.isInitialized) {
            windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        }
    }

    private fun addBubble() {
        val container = FrameLayout(this)
        val icon = ImageView(this).apply { setImageResource(R.drawable.ic_bubble) }
        container.addView(icon, FrameLayout.LayoutParams(dp(56), dp(56)))
        // Mode badge — small glyph bottom-right; hidden for the default screen mode.
        val bd = TextView(this).apply {
            textSize = 11f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(Color.argb(230, 24, 24, 27))
            }
        }
        container.addView(bd, FrameLayout.LayoutParams(dp(20), dp(20)).apply {
            gravity = Gravity.BOTTOM or Gravity.END
        })
        badge = bd

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        val lp = WindowManager.LayoutParams(
            dp(56), dp(56), type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.START; x = dp(16); y = dp(220) }

        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var moved = false
        val longPress = Runnable { if (!moved) openModeWheel() }

        container.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY; startX = lp.x; startY = lp.y; moved = false
                    main.postDelayed(longPress, LONG_PRESS_MS); true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (e.rawX - downX).toInt(); val dy = (e.rawY - downY).toInt()
                    if (abs(dx) > 12 || abs(dy) > 12) moved = true
                    if (modeWheel != null) {
                        // Wheel open, finger still down → track the highlight.
                        modeWheel?.updateHighlight(e.rawX, e.rawY)
                    } else {
                        if (moved) main.removeCallbacks(longPress)
                        lp.x = startX + dx; lp.y = startY + dy
                        windowManager.updateViewLayout(container, lp)
                    }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    main.removeCallbacks(longPress)
                    val wheel = modeWheel
                    when {
                        wheel != null -> {
                            val spoke = wheel.spokeAt(e.rawX, e.rawY)
                            when {
                                spoke != null -> { closeModeWheel(); runMode(spoke.mode) }
                                wheel.nearCentre(e.rawX, e.rawY) -> makeWheelSticky()
                                else -> closeModeWheel()
                            }
                        }
                        !moved -> runMode(Prefs.bubbleMode(this))
                        // else: was a drag reposition — nothing to do.
                    }
                    true
                }
                else -> false
            }
        }
        bubble = container
        windowManager.addView(container, lp)
        refreshBadge()
    }

    /** Badge glyph reflects the current default mode (screen = none). */
    private fun refreshBadge() {
        val b = badge ?: return
        when (Prefs.bubbleMode(this)) {
            Prefs.MODE_TEXT -> { b.text = "📋"; b.visibility = View.VISIBLE }
            Prefs.MODE_CAMERA -> { b.text = "📷"; b.visibility = View.VISIBLE }
            else -> b.visibility = View.GONE
        }
    }

    // ── Mode wheel (long-press) ────────────────────────────────────────

    private fun openModeWheel() {
        if (modeWheel != null) return
        val b = bubble ?: return
        val loc = IntArray(2); b.getLocationOnScreen(loc)
        val cx = loc[0] + b.width / 2f
        val cy = loc[1] + b.height / 2f
        val wheel = ModeWheelView(this, cx, cy)
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            // NOT_TOUCHABLE so the in-flight gesture stays with the bubble;
            // NO_LIMITS + LAYOUT_IN_SCREEN so canvas coords == rawX/rawY.
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        )
        modeWheel = wheel
        wheelSticky = false
        windowManager.addView(wheel, lp)
    }

    /** Released near centre → keep the wheel up and make it tap-selectable. */
    private fun makeWheelSticky() {
        val wheel = modeWheel ?: return
        wheelSticky = true
        val lp = wheel.layoutParams as WindowManager.LayoutParams
        lp.flags = lp.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
        runCatching { windowManager.updateViewLayout(wheel, lp) }
        wheel.setOnTouchListener { _, e ->
            if (e.action == MotionEvent.ACTION_UP) {
                val spoke = wheel.spokeAt(e.rawX, e.rawY)
                if (spoke != null) {
                    Prefs.setBubbleMode(this, spoke.mode)  // tap = set default
                    refreshBadge()
                    closeModeWheel()
                    runMode(spoke.mode)
                } else {
                    closeModeWheel()  // tap outside = dismiss
                }
            } else if (e.action == MotionEvent.ACTION_MOVE) {
                wheel.updateHighlight(e.rawX, e.rawY)
            }
            true
        }
    }

    private fun closeModeWheel() {
        modeWheel?.let { runCatching { windowManager.removeView(it) } }
        modeWheel = null
        wheelSticky = false
    }

    // ── Mode dispatch ──────────────────────────────────────────────────

    private fun runMode(mode: String) {
        when (mode) {
            Prefs.MODE_TEXT -> startActivity(
                Intent(this, ProcessTextActivity::class.java)
                    .putExtra(ProcessTextActivity.EXTRA_FROM_BUBBLE, true)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            Prefs.MODE_CAMERA -> startActivity(
                Intent(this, CameraCaptureActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            else -> screenshotMode()
        }
    }

    /** MediaProjection path — per-session consent, lock ends the grant. */
    private fun screenshotMode() {
        val cap = capture
        if (cap == null) {
            startActivity(
                Intent(this, ProjectionConsentActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
            return
        }
        bubble?.visibility = View.INVISIBLE
        cap.captureOnce { bmp ->
            bubble?.visibility = View.VISIBLE
            if (bmp != null) {
                SelectionOverlayView.show(this, windowManager, bmp)
            } else {
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
        closeModeWheel()
        bubble?.let { runCatching { windowManager.removeView(it) } }
        capture?.release(); projection?.stop()
        super.onDestroy()
    }
}
