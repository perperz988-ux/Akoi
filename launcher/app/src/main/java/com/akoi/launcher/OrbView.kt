package com.akoi.launcher

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.SweepGradient
import android.util.AttributeSet
import android.view.View
import android.view.animation.LinearInterpolator
import kotlin.math.PI
import kotlin.math.min
import kotlin.math.sin

/** Orbe animado de la IA: gira y "respira" en azul y anaranjado. */
class OrbView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private val blue = context.getColor(R.color.blue_glow)
    private val blueDark = context.getColor(R.color.blue_dark)
    private val orange = context.getColor(R.color.orange)

    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val corePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val depthPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val shinePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f * resources.displayMetrics.density
    }
    private val rotation = Matrix()
    private var sweep: SweepGradient? = null

    private var cx = 0f
    private var cy = 0f
    private var radius = 0f
    private var phase = 0f
    private var listening = false

    private val animator = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = IDLE_MS
        repeatCount = ValueAnimator.INFINITE
        interpolator = LinearInterpolator()
        addUpdateListener {
            phase = it.animatedValue as Float
            invalidate()
        }
    }

    /** Más rápido y con más pulso mientras escucha la voz. */
    fun setListening(on: Boolean) {
        listening = on
        animator.duration = if (on) LISTEN_MS else IDLE_MS
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        cx = w / 2f
        cy = h / 2f
        radius = min(w, h) / 2f
        val core = radius * CORE
        glowPaint.shader = RadialGradient(
            cx, cy, radius,
            intArrayOf(alpha(blue, 150), alpha(orange, 45), 0),
            floatArrayOf(0.35f, 0.72f, 1f),
            Shader.TileMode.CLAMP,
        )
        sweep = SweepGradient(
            cx, cy,
            intArrayOf(blueDark, orange, blue, blueDark, orange, blueDark),
            null,
        )
        corePaint.shader = sweep
        depthPaint.shader = RadialGradient(
            cx, cy, core,
            intArrayOf(0x00000000, 0x00000000, 0x99000000.toInt()),
            floatArrayOf(0f, 0.55f, 1f),
            Shader.TileMode.CLAMP,
        )
        shinePaint.shader = RadialGradient(
            cx - core * 0.3f, cy - core * 0.35f, core * 0.7f,
            intArrayOf(0x77FFFFFF, 0x00FFFFFF),
            null,
            Shader.TileMode.CLAMP,
        )
    }

    override fun onDraw(canvas: Canvas) {
        if (radius <= 0f) return
        val t = phase * 2f * PI.toFloat()
        val amount = if (listening) 0.09f else 0.04f
        val pulse = 1f + amount * sin(t * if (listening) 4f else 2f)

        canvas.save()
        canvas.scale(pulse, pulse, cx, cy)
        canvas.drawCircle(cx, cy, radius, glowPaint)

        rotation.setRotate(phase * 360f, cx, cy)
        sweep?.setLocalMatrix(rotation)
        val core = radius * CORE
        canvas.drawCircle(cx, cy, core, corePaint)
        canvas.drawCircle(cx, cy, core, depthPaint)
        canvas.drawCircle(cx, cy, core, shinePaint)

        ringPaint.color = alpha(orange, (130 + 90 * sin(t * 2f)).toInt())
        canvas.drawCircle(cx, cy, core + ringPaint.strokeWidth * 2.5f, ringPaint)
        canvas.restore()
    }

    override fun onWindowVisibilityChanged(visibility: Int) {
        super.onWindowVisibilityChanged(visibility)
        if (visibility == VISIBLE && isAttachedToWindow) start() else animator.pause()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        start()
    }

    override fun onDetachedFromWindow() {
        animator.cancel()
        super.onDetachedFromWindow()
    }

    private fun start() {
        if (!animator.isStarted) animator.start() else if (animator.isPaused) animator.resume()
    }

    private fun alpha(color: Int, a: Int): Int =
        (color and 0x00FFFFFF) or (a.coerceIn(0, 255) shl 24)

    companion object {
        private const val CORE = 0.56f
        private const val IDLE_MS = 6000L
        private const val LISTEN_MS = 1500L
    }
}
