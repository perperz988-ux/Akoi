package com.akoi.launcher

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

/** Cuadrícula de "ventanas" con las letras del abecedario. */
class LetterAdapter(
    private val onClick: (String) -> Unit,
) : RecyclerView.Adapter<LetterAdapter.Holder>() {

    private var counts: Map<String, Int> = emptyMap()

    fun submit(newCounts: Map<String, Int>) {
        counts = newCounts
        notifyDataSetChanged()
    }

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        val letter: TextView = view.findViewById(R.id.letter)
        val count: TextView = view.findViewById(R.id.count)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder =
        Holder(LayoutInflater.from(parent.context).inflate(R.layout.item_letter, parent, false))

    override fun getItemCount(): Int = AppItem.LETTERS.size

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val letter = AppItem.LETTERS[position]
        val n = counts[letter] ?: 0
        val ctx = holder.itemView.context
        holder.letter.text = letter
        holder.count.text = if (n > 0) n.toString() else ""
        holder.itemView.isEnabled = n > 0
        holder.letter.setTextColor(
            ctx.getColor(if (n > 0) R.color.orange else R.color.disabled)
        )
        holder.itemView.contentDescription = "$letter, $n apps"
        holder.itemView.setOnClickListener { if (n > 0) onClick(letter) }
    }
}

/** Filas de la lista de apps: encabezado de letra o app. */
sealed class Row {
    data class Header(val letter: String) : Row()
    class App(val app: AppItem) : Row()
}

/** Lista/cuadrícula de apps con encabezados por letra. */
class AppAdapter(
    private val onClick: (AppItem, View) -> Unit,
    private val onLongClick: (AppItem, View) -> Unit,
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    var rows: List<Row> = emptyList()
        private set

    fun submit(newRows: List<Row>) {
        rows = newRows
        notifyDataSetChanged()
    }

    class AppHolder(view: View) : RecyclerView.ViewHolder(view) {
        val icon: ImageView = view.findViewById(R.id.icon)
        val label: TextView = view.findViewById(R.id.label)
    }

    class HeaderHolder(view: View) : RecyclerView.ViewHolder(view) {
        val letter: TextView = view.findViewById(R.id.headerLetter)
    }

    override fun getItemViewType(position: Int): Int =
        if (rows[position] is Row.Header) TYPE_HEADER else TYPE_APP

    override fun getItemCount(): Int = rows.size

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return if (viewType == TYPE_HEADER) {
            HeaderHolder(inflater.inflate(R.layout.item_header, parent, false))
        } else {
            AppHolder(inflater.inflate(R.layout.item_app, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val row = rows[position]) {
            is Row.Header -> (holder as HeaderHolder).letter.text = row.letter
            is Row.App -> {
                val h = holder as AppHolder
                h.icon.setImageDrawable(row.app.icon)
                h.label.text = row.app.label
                h.itemView.contentDescription = row.app.label
                h.itemView.setOnClickListener { onClick(row.app, it) }
                h.itemView.setOnLongClickListener { onLongClick(row.app, it); true }
            }
        }
    }

    companion object {
        const val TYPE_HEADER = 0
        const val TYPE_APP = 1
    }
}
