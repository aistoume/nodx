package solutions.aicon.nodx

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import java.io.File

/**
 * CAMERA mode: fire the system camera (ACTION_IMAGE_CAPTURE — no CAMERA
 * permission needed, the camera app owns that), receive the full-res
 * photo into a FileProvider uri, then hand it to the same selection
 * overlay + action wheel used for screenshots.
 *
 * Transparent, no-history activity — launched from the bubble's mode
 * wheel. It only bridges "take a photo" → SelectionOverlayView.
 */
class CameraCaptureActivity : AppCompatActivity() {

    private var photoUri: Uri? = null
    private var photoFile: File? = null

    private val takePhoto =
        registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
            val uri = photoUri
            if (ok && uri != null) showOverlay(uri) else finish()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dir = File(cacheDir, "camera").apply { mkdirs() }
        val f = File(dir, "shot-${System.currentTimeMillis()}.jpg")
        photoFile = f
        photoUri = FileProvider.getUriForFile(this, "$packageName.fileprovider", f)
        runCatching { takePhoto.launch(photoUri) }
            .onFailure {
                Toast.makeText(this, getString(R.string.camera_unavailable), Toast.LENGTH_LONG).show()
                finish()
            }
    }

    private fun showOverlay(uri: Uri) {
        val bmp = runCatching { decodeUpright(uri) }.getOrNull()
        photoFile?.delete()
        if (bmp == null) {
            Toast.makeText(this, getString(R.string.camera_decode_failed), Toast.LENGTH_LONG).show()
            finish(); return
        }
        // The selection overlay must be owned by the long-lived service
        // (an activity that finishes can't hold a TYPE_APPLICATION_OVERLAY
        // window). Hand the photo over via a temp PNG + a service action.
        val f = File(cacheDir, "camera-shot.png")
        runCatching {
            f.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
            startService(
                Intent(this, FloatingBubbleService::class.java)
                    .setAction(FloatingBubbleService.ACTION_SHOW_CAPTURE)
                    .putExtra(FloatingBubbleService.EXTRA_CAPTURE_PATH, f.absolutePath)
            )
        }
        finish()
    }

    /** Decode with a sane downscale + EXIF-orientation applied. */
    private fun decodeUpright(uri: Uri): Bitmap {
        val bytes = contentResolver.openInputStream(uri)!!.use { it.readBytes() }
        // Downscale huge camera shots to ~2000px long edge to stay light.
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        val longest = maxOf(bounds.outWidth, bounds.outHeight)
        val sample = generateSequence(1) { it * 2 }.first { longest / it <= 2400 }
        val bmp = BitmapFactory.decodeByteArray(
            bytes, 0, bytes.size,
            BitmapFactory.Options().apply { inSampleSize = sample },
        ) ?: error("decode failed")
        val orient = ExifInterface(bytes.inputStream()).getAttributeInt(
            ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL,
        )
        val m = Matrix()
        when (orient) {
            ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
            else -> return bmp
        }
        return Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
    }
}
