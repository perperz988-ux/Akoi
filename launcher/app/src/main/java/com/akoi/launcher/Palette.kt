package com.akoi.launcher

import android.content.Context

/**
 * Colores del launcher. Todo es editable desde "Personalizar".
 * [slabs] tiene un color por cajón (ver [Drawer]).
 */
data class Palette(
    val name: String,
    val bg: Int,
    val clock: Int,
    val search: Int,
    val slabs: List<Int>,
) {
    fun slab(drawer: Drawer): Int = slabs[drawer.ordinal]

    fun with(key: String, color: Int): Palette = when (key) {
        KEY_BG -> copy(bg = color, name = CUSTOM)
        KEY_CLOCK -> copy(clock = color, name = CUSTOM)
        KEY_SEARCH -> copy(search = color, name = CUSTOM)
        else -> {
            val i = key.removePrefix("slab").toIntOrNull() ?: return this
            copy(slabs = slabs.toMutableList().also { it[i] = color }, name = CUSTOM)
        }
    }

    fun get(key: String): Int = when (key) {
        KEY_BG -> bg
        KEY_CLOCK -> clock
        KEY_SEARCH -> search
        else -> slabs[key.removePrefix("slab").toInt()]
    }

    companion object {
        const val KEY_BG = "bg"
        const val KEY_CLOCK = "clock"
        const val KEY_SEARCH = "search"
        const val CUSTOM = "Personalizado"
        fun slabKey(d: Drawer) = "slab${d.ordinal}"
    }
}

object Themes {

    private fun c(hex: Long) = hex.toInt()

    //                         Juegos        Social        Ver           Crear         Sistema       A–Z
    val presets: List<Palette> = listOf(
        Palette("Akoi", c(0xFF050608), c(0xFF1546B8), c(0xFFEDEFF5),
            listOf(c(0xFFFF6A1A), c(0xFF2F6BFF), c(0xFFFFA24D), c(0xFF0F2A6E), c(0xFFE6EAF2), c(0xFF5B8CFF))),
        Palette("Neón gamer", c(0xFF07040F), c(0xFF00F0FF), c(0xFF1A1426),
            listOf(c(0xFFFF2E88), c(0xFF00F0FF), c(0xFFB6FF00), c(0xFF8A2BE2), c(0xFFFFE600), c(0xFF2B1B4D))),
        Palette("Atardecer", c(0xFF141414), c(0xFFF3F0E8), c(0xFFF3F0E8),
            listOf(c(0xFFFF6A2B), c(0xFFC8B8FF), c(0xFFDFFF5E), c(0xFF7FD4FF), c(0xFFF3F0E8), c(0xFFFFB38A))),
        Palette("Matrix", c(0xFF000000), c(0xFF00FF66), c(0xFF0B1A0F),
            listOf(c(0xFF00FF66), c(0xFF0B3D1E), c(0xFF7CFFB2), c(0xFF145C30), c(0xFFD6FFE4), c(0xFF00C853))),
        Palette("Lava", c(0xFF0C0505), c(0xFFFF3B1F), c(0xFFFFE3D6),
            listOf(c(0xFFFF3B1F), c(0xFFFFB000), c(0xFF8B0000), c(0xFFFF7A1A), c(0xFFFFE3D6), c(0xFF4A0E0E))),
        Palette("Hielo", c(0xFF060B14), c(0xFF9AD8FF), c(0xFFEAF6FF),
            listOf(c(0xFF9AD8FF), c(0xFFFFFFFF), c(0xFF3B82F6), c(0xFF1E3A5F), c(0xFFCFE8FF), c(0xFF60A5FA))),
        Palette("Mono", c(0xFF0E0E0E), c(0xFFFFFFFF), c(0xFFFFFFFF),
            listOf(c(0xFFFFFFFF), c(0xFFBDBDBD), c(0xFF7A7A7A), c(0xFF3A3A3A), c(0xFFE0E0E0), c(0xFF1F1F1F))),
    )

    val default: Palette get() = presets.first()

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("theme", Context.MODE_PRIVATE)

    fun load(ctx: Context): Palette {
        val p = prefs(ctx)
        if (!p.contains(Palette.KEY_BG)) return default
        val d = default
        return Palette(
            name = p.getString("name", d.name) ?: d.name,
            bg = p.getInt(Palette.KEY_BG, d.bg),
            clock = p.getInt(Palette.KEY_CLOCK, d.clock),
            search = p.getInt(Palette.KEY_SEARCH, d.search),
            slabs = d.slabs.indices.map { p.getInt("slab$it", d.slabs[it]) },
        )
    }

    fun save(ctx: Context, palette: Palette) {
        val e = prefs(ctx).edit()
            .putString("name", palette.name)
            .putInt(Palette.KEY_BG, palette.bg)
            .putInt(Palette.KEY_CLOCK, palette.clock)
            .putInt(Palette.KEY_SEARCH, palette.search)
            .putLong("stamp", System.nanoTime())
        palette.slabs.forEachIndexed { i, col -> e.putInt("slab$i", col) }
        e.apply()
    }

    /** Cambia cada vez que se guarda un tema: sirve para saber si hay que redibujar. */
    fun stamp(ctx: Context): Long = prefs(ctx).getLong("stamp", 0L)

    fun coverEnabled(ctx: Context) = prefs(ctx).getBoolean("cover", true)
    fun setCoverEnabled(ctx: Context, on: Boolean) =
        prefs(ctx).edit().putBoolean("cover", on).putLong("stamp", System.nanoTime()).apply()
}
