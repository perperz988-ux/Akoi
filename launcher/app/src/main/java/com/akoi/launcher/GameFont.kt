package com.akoi.launcher

import android.content.Context
import android.graphics.Typeface

/**
 * Letras del launcher. Las fuentes van dentro de la app (assets/fonts, licencia SIL OFL).
 * [scale] ajusta los títulos para fuentes muy anchas.
 */
enum class GameFont(val title: String, val file: String?, val scale: Float) {
    GAMER("Gamer", "orbitron.ttf", 0.86f),
    ARCADE("Arcade", "pressstart2p.ttf", 0.58f),
    BLOQUE("Bloque", "russoone.ttf", 0.95f),
    RETRO("Retro", "audiowide.ttf", 0.9f),
    SISTEMA("Sistema", null, 1f);

    /** Fuente de títulos y números gigantes. */
    fun heavy(ctx: Context): Typeface = load(ctx, 900) ?: Typeface.create("sans-serif-black", Typeface.NORMAL)

    /** Fuente de textos pequeños. */
    fun body(ctx: Context): Typeface = when (this) {
        // Arcade es pixelada: en textos pequeños se lee mejor la del sistema.
        ARCADE, SISTEMA -> Typeface.create("sans-serif-medium", Typeface.BOLD)
        else -> load(ctx, 600) ?: Typeface.create("sans-serif-medium", Typeface.BOLD)
    }

    private fun load(ctx: Context, weight: Int): Typeface? {
        val f = file ?: return null
        return try {
            Typeface.Builder(ctx.assets, "fonts/$f")
                .setFontVariationSettings("'wght' $weight")
                .build()
        } catch (e: Exception) {
            null
        }
    }

    companion object {
        /** Aplica la fuente elegida a todo el launcher. */
        fun apply(ctx: Context) {
            val font = Themes.font(ctx)
            Ui.HEAVY = font.heavy(ctx)
            Ui.BOLD = font.body(ctx)
            Ui.headScale = font.scale
        }
    }
}
