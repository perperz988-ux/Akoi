package com.isuit.launcher

import android.content.Context
import android.widget.FrameLayout
import android.widget.ImageView

/**
 * Fondo de iSuit: la imagen verde que viene con la app, o el fondo de pantalla del teléfono.
 * Se cambia manteniendo presionada la hora en la pantalla principal.
 */
object Backdrop {
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("isuit", Context.MODE_PRIVATE)

    fun useOwnWallpaper(ctx: Context) = prefs(ctx).getBoolean("own_wallpaper", false)
    fun setUseOwnWallpaper(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("own_wallpaper", on).apply()

    /** Pone la imagen de iSuit como primera capa de [root] (si no se usa el fondo del teléfono). */
    fun applyTo(root: FrameLayout) {
        if (useOwnWallpaper(root.context)) return
        root.addView(ImageView(root.context).apply {
            setImageResource(R.drawable.isuit_bg)
            scaleType = ImageView.ScaleType.CENTER_CROP
            importantForAccessibility = ImageView.IMPORTANT_FOR_ACCESSIBILITY_NO
        }, 0, FrameLayout.LayoutParams(-1, -1))
    }
}
