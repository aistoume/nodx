package solutions.aicon.nodx

import android.content.Context

/** Tiny SharedPreferences wrapper for the user's BYOK keys. */
object Prefs {
    private const val FILE = "nodx"
    private const val KEY = "anthropic_key"
    private const val GEMINI = "gemini_key"

    fun anthropicKey(c: Context): String =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, "") ?: ""
    fun setAnthropicKey(c: Context, k: String) =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(KEY, k).apply()

    /** Google AI key — only needed for the 🎨 generate spoke. */
    fun geminiKey(c: Context): String =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(GEMINI, "") ?: ""
    fun setGeminiKey(c: Context, k: String) =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(GEMINI, k).apply()
}
