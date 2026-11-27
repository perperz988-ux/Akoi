package com.akoi.launcher

import android.content.Context
import java.util.Calendar

/**
 * Aprende qué apps usas y a qué hora, para sugerirlas.
 * Todo se guarda solo en el teléfono.
 */
class UsageStore(context: Context) {

    private val prefs = context.getSharedPreferences("usage", Context.MODE_PRIVATE)

    private fun key(app: AppItem) = app.component.flattenToShortString() + "|" + app.user.hashCode()

    /** Franja del día: 0 madrugada, 1 mañana, 2 tarde, 3 noche. */
    private fun slot() = Calendar.getInstance().get(Calendar.HOUR_OF_DAY) / 6

    fun record(app: AppItem) {
        val k = key(app)
        val s = slot()
        prefs.edit()
            .putInt("c:$k", prefs.getInt("c:$k", 0) + 1)
            .putInt("s$s:$k", prefs.getInt("s$s:$k", 0) + 1)
            .apply()
    }

    /** Veces que se ha abierto la app. */
    fun count(app: AppItem): Int = prefs.getInt("c:${key(app)}", 0)

    fun suggestions(apps: List<AppItem>, count: Int): List<AppItem> {
        val s = slot()
        val learned = apps
            .map { a ->
                val k = key(a)
                a to (prefs.getInt("c:$k", 0) + 3 * prefs.getInt("s$s:$k", 0))
            }
            .filter { it.second > 0 }
            .sortedByDescending { it.second }
            .map { it.first }
        if (learned.size >= count) return learned.take(count)

        // Mientras aprende: apps típicas del día a día.
        val defaults = listOf("dialer", "phone", "messag", "mms", "camera", "chrome", "browser", "photos", "gallery", "whatsapp")
        val typical = defaults.mapNotNull { kw -> apps.firstOrNull { it.component.packageName.contains(kw) } }
        return (learned + typical + apps).distinct().take(count)
    }
}
