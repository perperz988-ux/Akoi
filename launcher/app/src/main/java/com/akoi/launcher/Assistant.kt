package com.akoi.launcher

import android.content.Intent
import android.net.Uri
import android.provider.AlarmClock
import android.provider.Settings
import java.text.DateFormat
import java.util.Date
import java.util.Locale

/** Lo que el asistente puede hacer desde el launcher. */
interface AssistantHost {
    fun launchApp(app: AppItem)
    fun startSafe(intent: Intent)
    fun setTorch(on: Boolean?)
    fun copyText(text: String)
    fun webSearch(text: String)
}

/** Una sugerencia del asistente (tarjeta tocable). */
class AssistantAction(
    val icon: String,
    val title: String,
    val subtitle: String,
    /** true si solo muestra información y no debe cerrar la búsqueda. */
    val keepOpen: Boolean = false,
    val run: () -> Unit,
)

/**
 * Asistente "Zper AI": entiende órdenes sencillas en español
 * (abrir apps, alarmas, temporizador, linterna, llamar, mapas, ajustes,
 * cálculos, hora y búsquedas web). Funciona sin internet, en el teléfono.
 */
class Assistant(private val host: AssistantHost) {

    fun suggest(raw: String, apps: List<AppItem>, hasAppResults: Boolean): List<AssistantAction> {
        val q = clean(raw)
        if (q.isEmpty()) return emptyList()
        val out = ArrayList<AssistantAction>()
        listOfNotNull(
            openApp(q, apps),
            torch(q),
            alarm(q),
            timer(q),
            call(q, raw),
            maps(q),
            timeInfo(q),
            math(q),
        ).forEach { out += it }
        settings(q)?.let { out += it }
        if (out.isEmpty() && (isQuestion(raw, q) || (!hasAppResults && q.length >= 2))) {
            out += web(raw)
        }
        return out.take(2)
    }

    // ------------------------------------------------------------ Órdenes

    private fun openApp(q: String, apps: List<AppItem>): AssistantAction? {
        val m = OPEN.find(q) ?: return null
        val target = m.groupValues[2]
            .removePrefix("la app ").removePrefix("app ")
            .removePrefix("el ").removePrefix("la ").trim()
        if (target.isEmpty()) return null
        val app = apps.firstOrNull { it.searchKey == target }
            ?: apps.firstOrNull { it.searchKey.startsWith(target) }
            ?: apps.firstOrNull { it.searchKey.contains(target) }
            ?: return null
        return AssistantAction("▶", "Abrir ${app.label}", "Aplicación") { host.launchApp(app) }
    }

    private fun torch(q: String): AssistantAction? {
        if (!Regex("\\b(linterna|flash|lampara)\\b").containsMatchIn(q)) return null
        val off = Regex("\\b(apaga|apagar|apagala|quita|desactiva)\\b").containsMatchIn(q)
        val on = Regex("\\b(enciende|encender|enciendela|prende|prender|activa|pon)\\b").containsMatchIn(q)
        val target: Boolean? = when {
            off -> false
            on -> true
            else -> null
        }
        val title = when (target) {
            true -> "Encender linterna"
            false -> "Apagar linterna"
            null -> "Encender / apagar linterna"
        }
        return AssistantAction("✦", title, "Zper AI") { host.setTorch(target) }
    }

    private fun alarm(q: String): AssistantAction? {
        if (!Regex("\\b(alarma|despiertame|despertador|despertar)\\b").containsMatchIn(q)) return null
        val m = TIME.find(q)
            ?: return AssistantAction("⏰", "Ver alarmas", "Reloj") {
                host.startSafe(Intent(AlarmClock.ACTION_SHOW_ALARMS))
            }
        var hour = m.groupValues[1].toInt()
        var minute = m.groupValues[2].toIntOrNull() ?: 0
        if (m.groupValues[2].isEmpty()) {
            if (q.contains("y media")) minute = 30
            if (q.contains("y cuarto")) minute = 15
        }
        val suffix = m.groupValues[3]
        val pm = suffix.startsWith("p") || suffix.contains("tarde") || suffix.contains("noche")
        val am = suffix.startsWith("a") || suffix.contains("manana") || suffix.contains("madrugada")
        if (pm && hour < 12) hour += 12
        if (am && hour == 12) hour = 0
        if (hour > 23 || minute > 59) return null
        val label = String.format(Locale.ROOT, "%02d:%02d", hour, minute)
        return AssistantAction("⏰", "Poner alarma a las $label", "Reloj") {
            host.startSafe(
                Intent(AlarmClock.ACTION_SET_ALARM)
                    .putExtra(AlarmClock.EXTRA_HOUR, hour)
                    .putExtra(AlarmClock.EXTRA_MINUTES, minute)
                    .putExtra(AlarmClock.EXTRA_MESSAGE, "ZperOS")
            )
        }
    }

    private fun timer(q: String): AssistantAction? {
        if (!Regex("\\b(temporizador|timer|cuenta atras|cronometro)\\b").containsMatchIn(q)) return null
        val m = Regex("(\\d+)\\s*(segundos?|seg|minutos?|min|horas?|h|s|m)?\\b").find(q)
            ?: return AssistantAction("⏱", "Abrir temporizador", "Reloj") {
                host.startSafe(Intent(AlarmClock.ACTION_SET_TIMER))
            }
        val n = m.groupValues[1].toIntOrNull() ?: return null
        val unit = m.groupValues[2]
        val seconds = when {
            unit.startsWith("s") -> n
            unit.startsWith("h") -> n * 3600
            else -> n * 60
        }.coerceIn(1, 86_400)
        return AssistantAction("⏱", "Temporizador de ${duration(seconds)}", "Reloj") {
            host.startSafe(
                Intent(AlarmClock.ACTION_SET_TIMER)
                    .putExtra(AlarmClock.EXTRA_LENGTH, seconds)
                    .putExtra(AlarmClock.EXTRA_MESSAGE, "ZperOS")
                    .putExtra(AlarmClock.EXTRA_SKIP_UI, false)
            )
        }
    }

    private fun call(q: String, raw: String): AssistantAction? {
        val m = Regex("^(llama|llamar|llamale|marca|marcar)( a| al)?\\s*(.*)$").find(q) ?: return null
        val who = m.groupValues[3].trim()
        val number = raw.filter { it.isDigit() || it == '+' }
        return if (number.count { it.isDigit() } >= 3) {
            AssistantAction("✆", "Llamar al $number", "Teléfono") {
                host.startSafe(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(number))))
            }
        } else {
            val title = if (who.isEmpty()) "Abrir teléfono" else "Llamar a $who"
            AssistantAction("✆", title, "Teléfono") { host.startSafe(Intent(Intent.ACTION_DIAL)) }
        }
    }

    private fun maps(q: String): AssistantAction? {
        val m = Regex(
            "^(como llego a|como llegar a|llevame a|navega a|navegar a|ruta a|mapa de|donde queda|donde esta|ubicacion de|mapa)\\s+(.+)$"
        ).find(q) ?: return null
        val place = m.groupValues[2].trim()
        return AssistantAction("⌖", "Ver en el mapa: $place", "Mapas") {
            host.startSafe(Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(place))))
        }
    }

    private fun settings(q: String): AssistantAction? {
        val match = SETTINGS.firstOrNull { (words, _, _) ->
            words.any { Regex("\\b$it\\b").containsMatchIn(q) }
        } ?: return null
        val (_, title, action) = match
        return AssistantAction("⚙", title, "Ajustes") { host.startSafe(Intent(action)) }
    }

    private fun timeInfo(q: String): AssistantAction? {
        val now = Date()
        return when {
            Regex("\\bque hora\\b").containsMatchIn(q) -> {
                val time = DateFormat.getTimeInstance(DateFormat.SHORT).format(now)
                AssistantAction("✦", "Son las $time", "Zper AI", keepOpen = true) {}
            }
            Regex("\\b(que dia|que fecha|fecha de hoy)\\b").containsMatchIn(q) -> {
                val date = DateFormat.getDateInstance(DateFormat.FULL).format(now)
                AssistantAction("✦", "Hoy es $date", "Zper AI", keepOpen = true) {}
            }
            else -> null
        }
    }

    private fun math(q: String): AssistantAction? {
        var e = " " + q.removePrefix("cuanto es ").removePrefix("calcula ").removePrefix("calcular ") + " "
        MATH_WORDS.forEach { (word, op) -> e = e.replace(word, op) }
        e = e.replace(Regex("(?<=\\d)\\s*x\\s*(?=\\d)"), "*").replace(',', '.').trim()
        if (!Regex("^[0-9+\\-*/().%\\s]+$").matches(e)) return null
        if (!Regex("\\d\\s*[+\\-*/%]\\s*[\\d(]").containsMatchIn(e)) return null
        val value = Calculator.eval(e) ?: return null
        val text = Calculator.format(value)
        return AssistantAction("=", "= $text", "Toca para copiar", keepOpen = true) { host.copyText(text) }
    }

    private fun web(raw: String): AssistantAction {
        val text = raw.trim()
            .replace(Regex("^(?i)(busca|buscar|googlea|google)\\s+(en\\s+(google|internet|la web)\\s+)?"), "")
            .ifBlank { raw.trim() }
        return AssistantAction("⌕", "Buscar en la web: $text", "Internet") { host.webSearch(text) }
    }

    private fun isQuestion(raw: String, q: String): Boolean =
        raw.contains('?') || QUESTION.containsMatchIn(q)

    // ---------------------------------------------------------- Utilidades

    private fun clean(raw: String): String =
        AppItem.normalize(raw)
            .replace(Regex("[¿?¡!]"), " ")
            .replace(Regex("^(oye |hey |zper |zperos |ok )+"), "")
            .replace(Regex("\\s+"), " ")
            .trim()
            .trimEnd('.')

    private fun duration(seconds: Int): String {
        val h = seconds / 3600
        val m = (seconds % 3600) / 60
        val s = seconds % 60
        return listOfNotNull(
            if (h > 0) "$h h" else null,
            if (m > 0) "$m min" else null,
            if (s > 0) "$s s" else null,
        ).joinToString(" ")
    }

    companion object {
        private val OPEN =
            Regex("^(abre|abrir|abreme|abrime|inicia|iniciar|lanza|ejecuta|open|entra a|entrar a|ir a|ve a)\\s+(.+)$")

        private val TIME = Regex(
            "(\\d{1,2})(?:[:.h](\\d{2}))?\\s*(am|pm|a\\.m|p\\.m|de la tarde|de la noche|de la manana|de la madrugada)?"
        )

        private val QUESTION = Regex(
            "^(busca|buscar|googlea|google|que es|que son|que significa|quien|como|cuando|donde|por que|porque|cual|cuanto|cuantos|define|significado|noticias|clima|tiempo en)\\b"
        )

        /** Quita el "abre …" para filtrar la lista de apps. */
        fun appQuery(raw: String): String {
            val q = AppItem.normalize(raw)
            return OPEN.find(q)?.groupValues?.get(2)?.trim() ?: q
        }

        private val MATH_WORDS = listOf(
            " dividido entre " to "/",
            " dividido por " to "/",
            " entre " to "/",
            " por " to "*",
            " mas " to "+",
            " menos " to "-",
        )

        private val SETTINGS = listOf(
            Triple(listOf("wifi", "wi fi"), "Ajustes de Wi‑Fi", Settings.ACTION_WIFI_SETTINGS),
            Triple(listOf("bluetooth"), "Ajustes de Bluetooth", Settings.ACTION_BLUETOOTH_SETTINGS),
            Triple(listOf("bateria", "ahorro"), "Batería", Intent.ACTION_POWER_USAGE_SUMMARY),
            Triple(listOf("brillo", "pantalla"), "Ajustes de pantalla", Settings.ACTION_DISPLAY_SETTINGS),
            Triple(listOf("sonido", "volumen", "tono"), "Ajustes de sonido", Settings.ACTION_SOUND_SETTINGS),
            Triple(listOf("ubicacion", "gps"), "Ajustes de ubicación", Settings.ACTION_LOCATION_SOURCE_SETTINGS),
            Triple(listOf("ajustes", "configuracion", "settings"), "Ajustes del sistema", Settings.ACTION_SETTINGS),
        )
    }
}

/** Calculadora pequeña: + - * / % y paréntesis. */
object Calculator {
    fun eval(expr: String): Double? = try {
        val p = Parser(expr.replace(" ", ""))
        val v = p.expression()
        if (p.pos != p.s.length || v.isNaN() || v.isInfinite()) null else v
    } catch (e: Exception) {
        null
    }

    fun format(v: Double): String =
        if (v == Math.rint(v) && kotlin.math.abs(v) < 1e15) v.toLong().toString()
        else String.format(Locale.ROOT, "%.6f", v).trimEnd('0').trimEnd('.')

    private class Parser(val s: String) {
        var pos = 0

        fun expression(): Double {
            var v = term()
            while (pos < s.length && (s[pos] == '+' || s[pos] == '-')) {
                v = if (s[pos++] == '+') v + term() else v - term()
            }
            return v
        }

        fun term(): Double {
            var v = factor()
            while (pos < s.length && (s[pos] == '*' || s[pos] == '/' || s[pos] == '%')) {
                when (s[pos++]) {
                    '*' -> v *= factor()
                    '/' -> v /= factor()
                    else -> v %= factor()
                }
            }
            return v
        }

        fun factor(): Double {
            if (pos < s.length && s[pos] == '-') { pos++; return -factor() }
            if (pos < s.length && s[pos] == '+') { pos++; return factor() }
            if (pos < s.length && s[pos] == '(') {
                pos++
                val v = expression()
                require(pos < s.length && s[pos] == ')')
                pos++
                return v
            }
            val start = pos
            while (pos < s.length && (s[pos].isDigit() || s[pos] == '.')) pos++
            return s.substring(start, pos).toDouble()
        }
    }
}
