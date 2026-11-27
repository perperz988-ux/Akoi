package com.akoi.launcher

import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView

/** Elementos que se muestran dentro de una losa abierta. */
sealed class Tile {
    /** Ocupa 1/3 del ancho. */
    class App(val app: AppItem, val note: String? = null) : Tile()

    /** Botón rápido (linterna, colores…). Ocupa 1/3 del ancho. */
    class Action(val glyph: String, val label: String, val run: () -> Unit) : Tile()

    /** Ventana de letra (A–Z). Ocupa 1/7 del ancho. */
    class Letter(val letter: String, val count: Int) : Tile()

    /** Respuesta del asistente: tarjeta ancha. */
    class Card(val glyph: String, val title: String, val subtitle: String, val run: () -> Unit) : Tile()

    /** Título de sección: ancho completo. */
    class Header(val text: String) : Tile()
}

/**
 * Un solo adaptador para todo lo que va dentro de las losas.
 * La cuadrícula tiene [SPANS] columnas: apps = 7, letras = 3, títulos/tarjetas = 21.
 */
class TileAdapter(
    private val onApp: (AppItem, View) -> Unit,
    private val onAppLong: (AppItem, View) -> Unit,
    private val onLetter: (String) -> Unit,
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    var items: List<Tile> = emptyList()
        private set

    /** Color del texto y los bordes (contrasta con la losa). */
    private var fg: Int = 0xFF141414.toInt()

    fun submit(newItems: List<Tile>, foreground: Int) {
        items = newItems
        fg = foreground
        notifyDataSetChanged()
    }

    val spanLookup = object : GridLayoutManager.SpanSizeLookup() {
        override fun getSpanSize(position: Int): Int = when (items.getOrNull(position)) {
            is Tile.Letter -> 3
            is Tile.App, is Tile.Action -> 7
            else -> SPANS
        }
    }

    override fun getItemCount() = items.size

    override fun getItemViewType(position: Int) = when (items[position]) {
        is Tile.App, is Tile.Action -> TYPE_SQUARE
        is Tile.Letter -> TYPE_LETTER
        is Tile.Card -> TYPE_CARD
        is Tile.Header -> TYPE_HEADER
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val ctx = parent.context
        val view: View = when (viewType) {
            TYPE_SQUARE -> FrameLayout(ctx).apply {
                layoutParams = RecyclerView.LayoutParams(-1, ctx.dp(104)).apply {
                    setMargins(ctx.dp(4), ctx.dp(4), ctx.dp(4), ctx.dp(4))
                }
                setPadding(ctx.dp(12), ctx.dp(12), ctx.dp(10), ctx.dp(10))
                addView(ImageView(ctx).apply { id = ID_ICON }, FrameLayout.LayoutParams(ctx.dp(38), ctx.dp(38)))
                addView(TextView(ctx).apply { id = ID_GLYPH }, FrameLayout.LayoutParams(-2, -2))
                addView(LinearLayout(ctx).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(TextView(ctx).apply {
                        id = ID_NOTE
                        maxLines = 1
                    })
                    addView(TextView(ctx).apply {
                        id = ID_LABEL
                        maxLines = 1
                        ellipsize = TextUtils.TruncateAt.END
                    })
                }, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
            }
            TYPE_LETTER -> TextView(ctx).apply {
                id = ID_LABEL
                gravity = Gravity.CENTER
                layoutParams = RecyclerView.LayoutParams(-1, ctx.dp(50)).apply {
                    setMargins(ctx.dp(3), ctx.dp(3), ctx.dp(3), ctx.dp(3))
                }
            }
            TYPE_CARD -> LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                layoutParams = RecyclerView.LayoutParams(-1, -2).apply {
                    setMargins(ctx.dp(4), ctx.dp(4), ctx.dp(4), ctx.dp(4))
                }
                setPadding(ctx.dp(14), ctx.dp(14), ctx.dp(14), ctx.dp(14))
                addView(TextView(ctx).apply {
                    id = ID_GLYPH
                    gravity = Gravity.CENTER
                }, LinearLayout.LayoutParams(ctx.dp(40), ctx.dp(40)))
                addView(LinearLayout(ctx).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(ctx.dp(12), 0, 0, 0)
                    addView(TextView(ctx).apply { id = ID_LABEL; maxLines = 2 })
                    addView(TextView(ctx).apply { id = ID_NOTE })
                }, LinearLayout.LayoutParams(0, -2, 1f))
            }
            else -> TextView(ctx).apply {
                id = ID_LABEL
                layoutParams = RecyclerView.LayoutParams(-1, -2)
                setPadding(ctx.dp(6), ctx.dp(14), ctx.dp(6), ctx.dp(6))
            }
        }
        return object : RecyclerView.ViewHolder(view) {}
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val v = holder.itemView
        val r = v.dp(18).toFloat()
        when (val t = items[position]) {
            is Tile.App -> {
                bindSquare(v, r, label = t.app.label, note = t.note, glyph = null)
                v.findViewById<ImageView>(ID_ICON).setImageDrawable(t.app.icon)
                v.contentDescription = t.app.label
                v.setOnClickListener { onApp(t.app, it) }
                v.setOnLongClickListener { onAppLong(t.app, it); true }
            }
            is Tile.Action -> {
                bindSquare(v, r, label = t.label, note = null, glyph = t.glyph)
                v.findViewById<ImageView>(ID_ICON).setImageDrawable(null)
                v.contentDescription = t.label
                v.setOnClickListener { t.run() }
                v.setOnLongClickListener(null)
            }
            is Tile.Letter -> {
                val tv = v as TextView
                val enabled = t.count > 0
                tv.text = t.letter
                tv.style(20f, if (enabled) fg else Ui.alpha(fg, 0x44), Ui.HEAVY)
                tv.background = Ui.outline(
                    if (enabled) fg else Ui.alpha(fg, 0x33), v.dp(if (enabled) 2 else 1),
                    v.dp(14).toFloat(),
                )
                tv.isEnabled = enabled
                tv.contentDescription = "${t.letter}, ${t.count} apps"
                tv.setOnClickListener { onLetter(t.letter) }
            }
            is Tile.Card -> {
                v.background = Ui.outline(fg, v.dp(2), r)
                v.findViewById<TextView>(ID_GLYPH).apply {
                    text = t.glyph
                    style(18f, Ui.onColor(fg), Ui.HEAVY)
                    background = Ui.slab(fg, v.dp(20).toFloat(), topOnly = false)
                }
                v.findViewById<TextView>(ID_LABEL).apply { text = t.title; style(16f, fg, Ui.HEAVY) }
                v.findViewById<TextView>(ID_NOTE).apply {
                    text = t.subtitle
                    style(12f, Ui.alpha(fg, 0xAA))
                    setPadding(0, v.dp(3), 0, 0)
                }
                v.setOnClickListener { t.run() }
            }
            is Tile.Header -> (v as TextView).apply {
                text = t.text.uppercase()
                style(11f, Ui.alpha(fg, 0xBB), Ui.BOLD, 0.12f)
            }
        }
    }

    private fun bindSquare(v: View, r: Float, label: String, note: String?, glyph: String?) {
        v.background = Ui.outline(fg, v.dp(2), r)
        v.findViewById<TextView>(ID_LABEL).apply { text = label; style(13f, fg, Ui.HEAVY) }
        v.findViewById<TextView>(ID_NOTE).apply {
            text = note.orEmpty()
            visibility = if (note.isNullOrEmpty()) View.GONE else View.VISIBLE
            style(10f, Ui.alpha(fg, 0xAA), Ui.BOLD, 0.05f)
            setPadding(0, 0, 0, v.dp(2))
        }
        v.findViewById<TextView>(ID_GLYPH).apply {
            text = glyph.orEmpty()
            visibility = if (glyph == null) View.GONE else View.VISIBLE
            style(26f, fg, Ui.HEAVY)
        }
    }

    companion object {
        const val SPANS = 21
        private const val TYPE_SQUARE = 0
        private const val TYPE_LETTER = 1
        private const val TYPE_CARD = 2
        private const val TYPE_HEADER = 3

        private val ID_ICON = View.generateViewId()
        private val ID_LABEL = View.generateViewId()
        private val ID_NOTE = View.generateViewId()
        private val ID_GLYPH = View.generateViewId()
    }
}
