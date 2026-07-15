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
    const val PROVIDER_OPENAI = "openai"
    const val PROVIDER_OPENROUTER = "openrouter"
    private const val PROVIDER = "ai_provider"

    /** Which provider answers vision calls (explain/identify/prompt-writing). */
    fun provider(c: Context): String =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(PROVIDER, PROVIDER_ANTHROPIC)
            ?: PROVIDER_ANTHROPIC
    fun setProvider(c: Context, v: String) =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(PROVIDER, v).apply()

    fun openaiKey(c: Context): String =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString("openai_key", "") ?: ""
    fun setOpenaiKey(c: Context, k: String) =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString("openai_key", k).apply()

    fun openrouterKey(c: Context): String =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString("openrouter_key", "") ?: ""
    fun setOpenrouterKey(c: Context, k: String) =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString("openrouter_key", k).apply()

    /** The given provider's stored key (blank when unset). */
    fun keyFor(c: Context, provider: String): String = when (provider) {
        PROVIDER_GEMINI -> geminiKey(c)
        PROVIDER_OPENAI -> openaiKey(c)
        PROVIDER_OPENROUTER -> openrouterKey(c)
        else -> anthropicKey(c)
    }

    /** Google AI key — image generation, and all AI when provider=gemini (free tier). */
    fun geminiKey(c: Context): String =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(GEMINI, "") ?: ""
    fun setGeminiKey(c: Context, k: String) =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(GEMINI, k).apply()

    // ── Bubble tap mode (long-press wheel sets the default) ────────────
    const val MODE_SCREEN = "screen"   // 截屏 → 框选 → 动作轮（出厂默认）
    const val MODE_TEXT = "text"       // 剪贴板文字 → 文字轮盘
    const val MODE_CAMERA = "camera"   // 系统相机拍照 → 框选 → 动作轮
    private const val BUBBLE_MODE = "bubble_mode"

    fun bubbleMode(c: Context): String =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(BUBBLE_MODE, MODE_SCREEN)
            ?: MODE_SCREEN
    fun setBubbleMode(c: Context, m: String) =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(BUBBLE_MODE, m).apply()
}
