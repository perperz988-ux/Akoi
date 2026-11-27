package com.akoi.launcher

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.view.View
import android.widget.TextView
import androidx.core.graphics.ColorUtils
import kotlin.math.roundToInt

/** Utilidades de dibujo del estilo "losa": colores sólidos, sin degradados ni sombras. */
object Ui {
    var HEAVY: Typeface = Typeface.create("sans-serif-black", Typeface.NORMAL)
    var BOLD: Typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)

    /** Escala de los títulos según la fuente (las pixeladas son muy anchas). */
    var headScale: Float = 1f

    private const val DARK_TEXT = 0xFF141414.toInt()
    private const val LIGHT_TEXT = 0xFFF5F3EE.toInt()

    /** Texto legible encima de un color. */
    fun onColor(color: Int): Int =
        if (ColorUtils.calculateLuminance(color) > 0.42) DARK_TEXT else LIGHT_TEXT

    fun alpha(color: Int, a: Int): Int = (color and 0x00FFFFFF) or (a.coerceIn(0, 255) shl 24)

    /** Losa con esquinas superiores redondeadas (o todas). */
    fun slab(color: Int, radius: Float, topOnly: Boolean = true): GradientDrawable =
        GradientDrawable().apply {
            setColor(color)
            cornerRadii = if (topOnly) {
                floatArrayOf(radius, radius, radius, radius, 0f, 0f, 0f, 0f)
            } else {
                FloatArray(8) { radius }
            }
        }

    /** Losa con esquinas inferiores redondeadas (la del reloj, pegada a la barra de arriba). */
    fun slabBottom(color: Int, radius: Float): GradientDrawable =
        GradientDrawable().apply {
            setColor(color)
            cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, radius, radius, radius, radius)
        }

    /** Recuadro con borde (las "teclas" de apps dentro de un cajón). */
    fun outline(stroke: Int, strokePx: Int, radius: Float, fill: Int = 0): Drawable {
        val shape = GradientDrawable().apply {
            setColor(fill)
            cornerRadius = radius
            setStroke(strokePx, stroke)
        }
        val mask = GradientDrawable().apply {
            setColor(0xFFFFFFFF.toInt())
            cornerRadius = radius
        }
        return RippleDrawable(ColorStateList.valueOf(alpha(stroke, 0x33)), shape, mask)
    }

    fun ripple(color: Int, radius: Float, content: Drawable?): Drawable {
        val mask = GradientDrawable().apply {
            setColor(0xFFFFFFFF.toInt())
            cornerRadius = radius
        }
        return RippleDrawable(ColorStateList.valueOf(alpha(color, 0x33)), content, mask)
    }
}

fun Context.dp(v: Number): Int = (v.toFloat() * resources.displayMetrics.density).roundToInt()
fun View.dp(v: Number): Int = context.dp(v)

fun TextView.style(sizeSp: Float, color: Int, face: Typeface = Ui.BOLD, spacing: Float = 0f): TextView {
    textSize = if (face == Ui.HEAVY) sizeSp * Ui.headScale else sizeSp
    setTextColor(color)
    typeface = face
    letterSpacing = spacing
    includeFontPadding = false
    return this
}
