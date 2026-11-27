package com.akoi.launcher

import android.content.ComponentName
import android.graphics.drawable.Drawable
import android.os.UserHandle
import java.text.Normalizer
import java.util.Locale

/** Una app instalada que se puede abrir desde el launcher. */
class AppItem(
    val label: String,
    val component: ComponentName,
    val user: UserHandle,
    val icon: Drawable,
    /** Cajón temático (Juegos, Social…) o null si solo aparece en "Todas A–Z". */
    val drawer: Drawer?,
) {
    /** Etiqueta sin acentos y en minúsculas, para buscar. */
    val searchKey: String = normalize(label)

    /** Letra a la que pertenece la app (A–Z, Ñ o #). */
    val letter: String = letterOf(label)

    companion object {
        /** Letras que se muestran como "ventanas" en la pantalla de inicio. */
        val LETTERS: List<String> =
            listOf("#") + ('A'..'N').map { it.toString() } + "Ñ" + ('O'..'Z').map { it.toString() }

        fun normalize(text: String): String =
            Normalizer.normalize(text, Normalizer.Form.NFD)
                .replace(Regex("\\p{Mn}+"), "")
                .lowercase(Locale.ROOT)
                .trim()

        fun letterOf(label: String): String {
            val first = label.trim().firstOrNull { !it.isWhitespace() } ?: return "#"
            val upper = first.uppercaseChar()
            if (upper == 'Ñ') return "Ñ"
            val base = normalize(upper.toString()).uppercase(Locale.ROOT).firstOrNull() ?: return "#"
            return if (base in 'A'..'Z') base.toString() else "#"
        }
    }
}
