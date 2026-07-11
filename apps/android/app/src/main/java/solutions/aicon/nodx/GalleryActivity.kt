package solutions.aicon.nodx

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.AbsListView
import android.widget.BaseAdapter
import android.widget.GridView
import android.widget.ImageView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 收集库 — browses what 💡保存 dropped into the gallery. The photo album
 * (Pictures/nodx) IS the store; this screen just queries it back through
 * MediaStore, so nothing is duplicated and the system gallery sees the
 * same images. Tap a cell to open the full image in the system viewer.
 */
class GalleryActivity : AppCompatActivity() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var grid: GridView

    private val permLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { load() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = getString(R.string.gallery_title)
        val pad = (8 * resources.displayMetrics.density).toInt()
        grid = GridView(this).apply {
            numColumns = 3
            horizontalSpacing = pad; verticalSpacing = pad
            setPadding(pad, pad, pad, pad)
            clipToPadding = false
        }
        setContentView(grid)

        // Our own MediaStore inserts are readable without the permission,
        // but after a reinstall ownership is lost — so ask to be safe.
        val perm = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_IMAGES
        else Manifest.permission.READ_EXTERNAL_STORAGE
        if (checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED) load()
        else permLauncher.launch(perm)
    }

    private fun load() {
        scope.launch {
            val items = withContext(Dispatchers.IO) { queryThumbs() }
            if (items.isEmpty()) {
                Toast.makeText(this@GalleryActivity, getString(R.string.gallery_empty), Toast.LENGTH_LONG).show()
            }
            val cell = (resources.displayMetrics.widthPixels / 3) - (12 * resources.displayMetrics.density).toInt()
            grid.adapter = object : BaseAdapter() {
                override fun getCount() = items.size
                override fun getItem(position: Int) = items[position]
                override fun getItemId(position: Int) = position.toLong()
                override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
                    val iv = (convertView as? ImageView) ?: ImageView(this@GalleryActivity).apply {
                        layoutParams = AbsListView.LayoutParams(cell, cell)
                        scaleType = ImageView.ScaleType.CENTER_CROP
                    }
                    iv.setImageBitmap(items[position].second)
                    return iv
                }
            }
            grid.setOnItemClickListener { _, _, pos, _ ->
                items[pos].first?.let { uri ->
                    startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "image/*")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
                } ?: Toast.makeText(this@GalleryActivity, getString(R.string.gallery_private_file), Toast.LENGTH_SHORT).show()
            }
        }
    }

    /** Newest-first thumbnails of everything under Pictures/nodx. */
    private fun queryThumbs(): List<Pair<Uri?, Bitmap>> = MediaLibrary.recentThumbs(this, 200)

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
