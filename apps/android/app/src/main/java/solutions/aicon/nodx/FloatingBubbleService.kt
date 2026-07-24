package solutions.aicon.nodx

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
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
 * LONG-PRESS → pops the mode wheel (ModeWheelView): tap a spoke to switch
 *        the bubble to that mode + run it once. A badge on the icon marks
 *        the current non-default mode.
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
                    // Camera shots can be tens of MP — decode downsampled to
                    // the display size instead of full resolution (Play rec).
                    val dm = resources.displayMetrics
                    val maxDim = maxOf(dm.widthPixels, dm.heightPixels)
                    val bmp = runCatching { BitmapIO.decodeFileSampled(path, maxDim) }.getOrNull()
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
        // Window is 72dp but the icon is 56dp, centred — the 8dp margin gives
        // room for the press/long-press scale-up (→ ~72dp) without the fixed
        // overlay window clipping it.
        val container = FrameLayout(this).apply { clipChildren = false }
        val icon = ImageView(this).apply { setImageResource(R.drawable.ic_bubble) }
        container.addView(icon, FrameLayout.LayoutParams(dp(56), dp(56), Gravity.CENTER))
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
            rightMargin = dp(6); bottomMargin = dp(6)
        })
        badge = bd

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        val lp = WindowManager.LayoutParams(
            dp(72), dp(72), type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.START; x = dp(10); y = dp(214) }

        // Platform GestureDetector handles the timing/slop reliably:
        //   long-press → pop the (touchable) mode wheel; the user lifts, then
        //               taps a spoke to switch mode (handled by the wheel itself)
        //   single tap → run the current default mode
        //   scroll     → drag the bubble
        var startX = 0; var startY = 0
        val gd = android.view.GestureDetector(this, object : android.view.GestureDetector.SimpleOnGestureListener() {
            override fun onDown(e: MotionEvent): Boolean { startX = lp.x; startY = lp.y; return true }
            override fun onLongPress(e: MotionEvent) {
                if (modeWheel == null) { growBubble(icon, 1.28f); vibrate(); openModeWheel() }
            }
            override fun onSingleTapUp(e: MotionEvent): Boolean {
                if (modeWheel == null) runMode(Prefs.bubbleMode(this@FloatingBubbleService))
                return true
            }
            override fun onScroll(e1: MotionEvent?, e2: MotionEvent, dX: Float, dY: Float): Boolean {
                if (modeWheel != null) return false      // wheel is up — ignore bubble drags
                lp.x = startX + (e2.rawX - (e1?.rawX ?: e2.rawX)).toInt()
                lp.y = startY + (e2.rawY - (e1?.rawY ?: e2.rawY)).toInt()
                runCatching { windowManager.updateViewLayout(container, lp) }
                return true
            }
        })

        container.setOnTouchListener { _, e ->
            gd.onTouchEvent(e)
            when (e.action) {
                MotionEvent.ACTION_DOWN -> growBubble(icon, 1.15f)
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> growBubble(icon, 1f)
            }
            true
        }
        bubble = container
        windowManager.addView(container, lp)
        refreshBadge()
    }

    /** Spring the bubble to [scale] — press/hold visual affordance. */
    private fun growBubble(v: View, scale: Float) {
        v.animate().scaleX(scale).scaleY(scale).setDuration(90).start()
    }

    private fun vibrate() {
        runCatching {
            val vib = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (getSystemService(Context.VIBRATOR_MANAGER_SERVICE)
                    as android.os.VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vib.vibrate(android.os.VibrationEffect.createOneShot(28, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION") vib.vibrate(28)
            }
        }
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
        val wheel = ModeWheelView(
            this, cx, cy,
            onSelect = { mode ->
                Prefs.setBubbleMode(this, mode)   // 点某格 = 切换默认 + 立即执行
                refreshBadge()
                closeModeWheel()
                runMode(mode)
            },
            onDismiss = { closeModeWheel() },      // 点空白处 = 关闭
        )
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        // Fully touchable + focusable full-screen scrim: the wheel owns all
        // taps (the earlier NOT_TOUCHABLE + bubble-forwarding model leaked
        // taps through to the bubble). Canvas coords == screen coords via
        // LAYOUT_IN_SCREEN + NO_LIMITS so hit-testing matches what's drawn.
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        )
        modeWheel = wheel
        windowManager.addView(wheel, lp)
    }

    private fun closeModeWheel() {
        modeWheel?.let { runCatching { windowManager.removeView(it) } }
        modeWheel = null
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
