package solutions.aicon.nodx

import android.content.Context

/** Tiny SharedPreferences wrapper for the user's Anthropic API key (BYOK). */
object Prefs {
    private const val FILE = "nodx"
    private const val KEY = "anthropic_key"
    fun anthropicKey(c: Context): String =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, "") ?: ""
    fun setAnthropicKey(c: Context, k: String) =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(KEY, k).apply()
}
