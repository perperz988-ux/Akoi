package com.isuit.launcher

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Shader
import android.graphics.drawable.Drawable

/** Ícono redondo con degradado y un emoji: para las apps propias de iSuit. */
class BuiltinIcon(private val colors: IntArray, private val emoji: String) : Drawable() {

    private val bg = Paint(Paint.ANTI_ALIAS_FLAG)
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }

    override fun draw(canvas: Canvas) {
        val b = bounds
        val w = b.width().toFloat()
        val h = b.height().toFloat()
        bg.shader = LinearGradient(b.left.toFloat(), b.top.toFloat(), b.right.toFloat(), b.bottom.toFloat(), colors, null, Shader.TileMode.CLAMP)
        canvas.drawOval(b.left.toFloat(), b.top.toFloat(), b.right.toFloat(), b.bottom.toFloat(), bg)
        text.textSize = h * 0.48f
        val y = b.exactCenterY() - (text.descent() + text.ascent()) / 2f
        canvas.drawText(emoji, b.exactCenterX(), y, text)
        if (w <= 0) return
    }

    override fun setAlpha(alpha: Int) {
        bg.alpha = alpha
        text.alpha = alpha
    }

    override fun setColorFilter(colorFilter: ColorFilter?) {
        bg.colorFilter = colorFilter
    }

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}
