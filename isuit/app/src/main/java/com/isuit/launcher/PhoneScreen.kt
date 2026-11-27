package com.isuit.launcher

import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import kotlin.math.roundToInt

/**
 * Base de las apps propias de iSuit: mismo fondo (el tuyo), tarjetas de vidrio oscuro,
 * cabecera con ícono redondo y botón para volver.
 */
abstract class PhoneScreen : ComponentActivity() {

    protected lateinit var body: LinearLayout

    protected abstract val screenTitle: String
    protected abstract val screenIcon: Drawable

    /** Construye el contenido de la app dentro de [body]. */
    protected abstract fun buildContent()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        body = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(12), dp(18), dp(28))
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(14))
        }
        header.addView(TextView(this).apply {
            text = "‹"
            textSize = 34f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setOnClickListener { finish() }
        }, LinearLayout.LayoutParams(dp(40), dp(48)))
        header.addView(ImageView(this).apply { setImageDrawable(screenIcon) }, LinearLayout.LayoutParams(dp(40), dp(40)))
        header.addView(TextView(this).apply {
            text = screenTitle
            textSize = 28f
            setTextColor(Color.WHITE)
            typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
            shadow()
            setPadding(dp(12), 0, 0, 0)
        })
        body.addView(header)
        buildContent()
        val root = android.widget.FrameLayout(this)
        Backdrop.applyTo(root)
        root.addView(ScrollView(this).apply {
            fitsSystemWindows = true
            isFillViewport = true
            addView(body)
        }, android.widget.FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        body.translationY = dp(60).toFloat()
        body.alpha = 0f
        body.animate().translationY(0f).alpha(1f).setDuration(260).start()
    }

    // ------------------------------------------------------------- Ayudas

    fun dp(v: Number) = (v.toFloat() * resources.displayMetrics.density).roundToInt()

    fun TextView.shadow() = setShadowLayer(dp(5).toFloat(), 0f, dp(1).toFloat(), 0xAA000000.toInt())

    fun glass(radius: Int = 22, alpha: Int = 0x88): GradientDrawable = GradientDrawable().apply {
        setColor(Color.argb(alpha, 0, 0, 0))
        cornerRadius = dp(radius).toFloat()
    }

    fun pill(color: Int, radius: Int = 22): GradientDrawable = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radius).toFloat()
    }

    /** Tarjeta de vidrio con un título pequeño. */
    fun card(title: String? = null): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = glass()
        setPadding(dp(18), dp(16), dp(18), dp(16))
        if (title != null) addView(label(title.uppercase(), 11f, 0xBBFFFFFF.toInt()).apply { letterSpacing = 0.12f })
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(12) }
    }

    fun label(text: String, size: Float = 15f, color: Int = Color.WHITE, bold: Boolean = false) = TextView(this).apply {
        this.text = text
        textSize = size
        setTextColor(color)
        if (bold) typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
    }

    fun button(text: String, color: Int, onClick: () -> Unit) = TextView(this).apply {
        this.text = text
        textSize = 15f
        setTextColor(Color.WHITE)
        typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
        gravity = Gravity.CENTER
        background = pill(color)
        setPadding(dp(18), dp(12), dp(18), dp(12))
        setOnClickListener { onClick() }
    }

    fun row(vararg views: View) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        views.forEachIndexed { i, v ->
            addView(v, LinearLayout.LayoutParams(0, -2, 1f).apply { if (i > 0) marginStart = dp(10) })
        }
    }

    fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
