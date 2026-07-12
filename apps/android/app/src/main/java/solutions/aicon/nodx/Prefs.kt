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

    const val PROVIDER_ANTHROPIC = "anthropic"
    const val PROVIDER_GEMINI = "gemini"
    private const val PROVIDER = "ai_provider"

    /** Which provider answers vision calls (explain/identify/prompt-writing). */
    fun provider(c: Context): String =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(PROVIDER, PROVIDER_ANTHROPIC)
            ?: PROVIDER_ANTHROPIC
    fun setProvider(c: Context, v: String) =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(PROVIDER, v).apply()

    /** Google AI key — image generation, and all AI when provider=gemini (free tier). */
    fun geminiKey(c: Context): String =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(GEMINI, "") ?: ""
    fun setGeminiKey(c: Context, k: String) =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(GEMINI, k).apply()
}
