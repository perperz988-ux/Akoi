package com.akoi.launcher

import android.annotation.SuppressLint
import android.content.Context
import android.view.Gravity
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextClock
import android.widget.TextView
import androidx.dynamicanimation.animation.DynamicAnimation
import androidx.dynamicanimation.animation.SpringAnimation
import androidx.dynamicanimation.animation.SpringForce

/**
 * Portada: la hora y los minutos gigantes se salen por los bordes,
 * y la losa de abajo se empuja hacia arriba para entrar.
 * Las bandas la siguen como hojas de papel apiladas.
 */
@SuppressLint("ViewConstructor")
class CoverView(context: Context, palette: Palette, private val onOpened: () -> Unit) : FrameLayout(context) {

    private val hourSlab: FrameLayout
    private val minuteSlab: FrameLayout
    private val bottomSlab: LinearLayout
    private val info: TextView
    private val bands: List<View>

    private var startY = 0f
    private var tracker: VelocityTracker? = null
    private var dismissing = false

    init {
        isClickable = true
        val cHour = palette.slab(Drawer.JUEGOS)
        val cMin = palette.slab(Drawer.SOCIAL)
        val cBottom = palette.slab(Drawer.VER)

        val column = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        addView(column, LayoutParams(-1, -1))

        hourSlab = FrameLayout(context).apply {
            background = Ui.slab(cHour, 0f)
            addView(TextView(context).apply {
                text = context.getString(R.string.app_name).substringBefore(' ').lowercase()
                style(14f, Ui.onColor(cHour), Ui.HEAVY)
            }, LayoutParams(-2, -2).apply { setMargins(dp(20), dp(14), 0, 0) })
            addView(giant(cHour, "HH", "h"), LayoutParams(-2, -2, Gravity.START or Gravity.BOTTOM).apply {
                marginStart = -dp(22)
                bottomMargin = -dp(18)
            })
        }
        column.addView(hourSlab, LinearLayout.LayoutParams(-1, 0, 1f))

        minuteSlab = FrameLayout(context).apply {
            background = Ui.slab(cMin, 0f)
            addView(giant(cMin, "mm", "mm"), LayoutParams(-2, -2, Gravity.END or Gravity.CENTER_VERTICAL).apply {
                marginEnd = -dp(26)
            })
        }
        column.addView(minuteSlab, LinearLayout.LayoutParams(-1, 0, 1f))

        val fg = Ui.onColor(cBottom)
        info = TextView(context).apply { style(14f, fg, Ui.BOLD) }
        bottomSlab = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            background = Ui.slab(cBottom, dp(30).toFloat())
            setPadding(dp(22), dp(12), dp(22), dp(26))
            addView(View(context).apply {
                background = Ui.slab(Ui.alpha(fg, 0xAA), dp(3).toFloat(), topOnly = false)
            }, LinearLayout.LayoutParams(dp(44), dp(5)).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                bottomMargin = dp(18)
            })
            addView(TextClock(context).apply {
                format12Hour = "EEE d MMM"
                format24Hour = "EEE d MMM"
                style(30f, fg, Ui.HEAVY, -0.02f)
            })
            addView(View(context).apply { setBackgroundColor(Ui.alpha(fg, 0x55)) },
                LinearLayout.LayoutParams(-1, dp(2)).apply { setMargins(0, dp(14), 0, dp(14)) })
            addView(info)
            addView(TextView(context).apply {
                text = "↑  EMPUJA ESTA LOSA PARA ENTRAR"
                style(12f, fg, Ui.HEAVY, 0.12f)
            }, LinearLayout.LayoutParams(-2, -2).apply { topMargin = dp(28) })
        }
        column.addView(bottomSlab, LinearLayout.LayoutParams(-1, -2).apply { topMargin = -dp(30) })

        bands = listOf(bottomSlab, minuteSlab, hourSlab)
    }

    private fun giant(bg: Int, format: String, format12: String) = TextClock(context).apply {
        format24Hour = format
        format12Hour = format12
        style(230f, Ui.onColor(bg), Ui.HEAVY, -0.07f)
        maxLines = 1
    }

    fun setInfo(text: String) {
        info.text = text
    }

    /** Vuelve a mostrar la portada en su sitio. */
    fun reset() {
        dismissing = false
        bands.forEach { it.translationY = 0f }
        alpha = 1f
        visibility = View.VISIBLE
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        if (dismissing) return true
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                startY = e.rawY
                tracker?.recycle()
                tracker = VelocityTracker.obtain().also { it.addMovement(e) }
            }
            MotionEvent.ACTION_MOVE -> {
                tracker?.addMovement(e)
                val dy = (e.rawY - startY).coerceAtMost(0f)
                // Abajo se mueve primero; las de arriba la siguen con retraso.
                bands.forEachIndexed { i, band -> band.translationY = dy * (1f - i * 0.18f) }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                tracker?.addMovement(e)
                tracker?.computeCurrentVelocity(1000)
                val vy = tracker?.yVelocity ?: 0f
                tracker?.recycle()
                tracker = null
                val dy = e.rawY - startY
                if (dy < -height * 0.22f || vy < -1800f) dismiss(vy) else springBack()
            }
        }
        return true
    }

    override fun performClick(): Boolean = super.performClick()

    fun dismiss(velocity: Float = -3000f) {
        dismissing = true
        performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY)
        val target = -height.toFloat() * 1.15f
        bands.forEachIndexed { i, band ->
            SpringAnimation(band, DynamicAnimation.TRANSLATION_Y, target).apply {
                spring.stiffness = SpringForce.STIFFNESS_LOW + i * 120f
                spring.dampingRatio = SpringForce.DAMPING_RATIO_NO_BOUNCY
                setStartVelocity(velocity)
                if (i == bands.lastIndex) {
                    addEndListener { _, _, _, _ ->
                        visibility = View.GONE
                        onOpened()
                    }
                }
                start()
            }
        }
    }

    private fun springBack() {
        bands.forEach { band ->
            SpringAnimation(band, DynamicAnimation.TRANSLATION_Y, 0f).apply {
                spring.stiffness = SpringForce.STIFFNESS_MEDIUM
                spring.dampingRatio = SpringForce.DAMPING_RATIO_MEDIUM_BOUNCY
                start()
            }
        }
    }
}
