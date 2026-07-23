package solutions.aicon.nodx

import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.speech.RecognizerIntent
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

/**
 * 🎤 Voice → instruct. Translucent trampoline that fires the SYSTEM speech
 * dialog (RecognizerIntent — no RECORD_AUDIO permission, auto-stops on
 * silence) and pipes the transcript straight into the instruct pipeline
 * (auto-run: the point of voice is speed; corrections go via a new run).
 *
 * Two callers:
 *  - text flow  (TextActions.instruct dialog 🎤): selected text rides the
 *    intent; the answer dialogs are hosted on THIS translucent activity.
 *  - vision flow (Actions.instructOverlay 🎤): the crop Bitmap is too big
 *    for an Intent — parked in [pendingCrop]; the result shows as the
 *    usual ResultCard overlay, independent of this activity.
 */
class VoiceInputActivity : AppCompatActivity() {
    companion object {
        const val EXTRA_MODE = "mode" // "text" | "vision"
        const val EXTRA_TEXT = "text"
        /** Vision payload hand-off (Bitmaps don't fit in Intents). */
        var pendingCrop: Bitmap? = null
        private const val REQ_SPEECH = 71
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val speech = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
            )
            putExtra(RecognizerIntent.EXTRA_PROMPT, getString(R.string.instruct_hint))
        }
        runCatching { startActivityForResult(speech, REQ_SPEECH) }.onFailure {
            Toast.makeText(this, R.string.voice_unavailable, Toast.LENGTH_SHORT).show()
            pendingCrop = null
            finish()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_SPEECH) return
        val spoken = data
            ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            ?.firstOrNull()
            ?.trim()
        if (resultCode != RESULT_OK || spoken.isNullOrEmpty()) {
            // CANCELED included: a silent vanish reads as a bug — always explain.
            Toast.makeText(this, R.string.voice_no_speech, Toast.LENGTH_SHORT).show()
            pendingCrop = null
            finish()
            return
        }
        when (intent.getStringExtra(EXTRA_MODE)) {
            "vision" -> {
                val crop = pendingCrop
                pendingCrop = null
                if (crop != null) Actions.instructVision(applicationContext, crop, spoken)
                finish()
            }
            else -> {
                val text = intent.getStringExtra(EXTRA_TEXT) ?: ""
                // Spinner + answer dialogs live on this translucent activity;
                // finish when the pipeline signals done.
                TextActions.runInstruction(this, spoken, text) { finish() }
            }
        }
    }
}
