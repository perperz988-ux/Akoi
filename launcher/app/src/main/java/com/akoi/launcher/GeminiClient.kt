package com.akoi.launcher

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * Gemini (Google AI Studio) por su API REST. Tiene plan gratis:
 * la API key se saca en aistudio.google.com/apikey.
 */
object GeminiClient {

    private const val BASE = "https://generativelanguage.googleapis.com/v1beta"

    /** Modelo por si no se puede consultar la lista de modelos. */
    const val FALLBACK_MODEL = "gemini-2.5-flash"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("zper_ai", Context.MODE_PRIVATE)

    /**
     * Elige el modelo "flash" más nuevo disponible para tu key (rápido y con plan gratis).
     * Se guarda para no consultarlo cada vez.
     */
    private fun model(ctx: Context, key: String, refresh: Boolean): String {
        val saved = prefs(ctx).getString("gemini_model", null)
        if (!refresh && !saved.isNullOrEmpty()) return saved
        val chosen = try {
            val conn = (URL("$BASE/models?pageSize=200").openConnection() as HttpURLConnection).apply {
                setRequestProperty("x-goog-api-key", key)
                connectTimeout = 15_000
                readTimeout = 15_000
            }
            if (conn.responseCode != 200) null else {
                val json = JSONObject(conn.inputStream.bufferedReader().readText())
                val models = json.optJSONArray("models") ?: JSONArray()
                val names = (0 until models.length()).mapNotNull { i ->
                    val m = models.getJSONObject(i)
                    val methods = m.optJSONArray("supportedGenerationMethods")?.toString().orEmpty()
                    val name = m.optString("name").removePrefix("models/")
                    name.takeIf {
                        "generateContent" in methods && "flash" in it &&
                            listOf("lite", "image", "tts", "audio", "live", "exp", "preview", "thinking", "embedding")
                                .none { bad -> bad in it }
                    }
                }
                // El de versión más alta (gemini-2.5-flash < gemini-3-flash …).
                names.maxWithOrNull(compareBy({ versionOf(it) }, { -it.length }))
            }
        } catch (e: Exception) {
            null
        } ?: FALLBACK_MODEL
        prefs(ctx).edit().putString("gemini_model", chosen).apply()
        return chosen
    }

    private fun versionOf(name: String): Double =
        Regex("gemini-(\\d+(?:\\.\\d+)?)").find(name)?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0

    /** Chat en vivo. Devuelve un error en español, o null si todo bien. */
    fun chat(
        ctx: Context,
        key: String,
        system: String,
        history: List<ZperAi.Turn>,
        onText: (String) -> Unit,
        retried: Boolean = false,
    ): String? {
        val model = model(ctx, key, refresh = retried)

        // Gemini usa roles "user" y "model"; se juntan mensajes seguidos del mismo lado.
        val contents = JSONArray()
        var lastRole: String? = null
        var lastParts: JSONArray? = null
        for (t in history.dropWhile { !it.fromUser }) {
            val role = if (t.fromUser) "user" else "model"
            if (role == lastRole && lastParts != null) {
                lastParts.put(JSONObject().put("text", t.text))
            } else {
                lastParts = JSONArray().put(JSONObject().put("text", t.text))
                contents.put(JSONObject().put("role", role).put("parts", lastParts))
                lastRole = role
            }
        }
        val body = JSONObject()
            .put("systemInstruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", system))))
            .put("contents", contents)
            .put("generationConfig", JSONObject().put("maxOutputTokens", 2048).put("temperature", 0.9))

        return try {
            val conn = (URL("$BASE/models/$model:streamGenerateContent?alt=sse").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("x-goog-api-key", key)
                connectTimeout = 20_000
                readTimeout = 60_000
            }
            conn.outputStream.use { it.write(body.toString().toByteArray()) }

            val code = conn.responseCode
            if (code != 200) {
                val err = conn.errorStream?.bufferedReader()?.readText().orEmpty()
                val msg = runCatching { JSONObject(err).getJSONObject("error").optString("message") }.getOrNull().orEmpty()
                // Modelo retirado: busca otro y reintenta una vez.
                if (code == 404 && !retried) return chat(ctx, key, system, history, onText, retried = true)
                return explain(code, msg)
            }

            var blocked = false
            BufferedReader(InputStreamReader(conn.inputStream)).use { reader ->
                while (true) {
                    val line = reader.readLine() ?: break
                    if (!line.startsWith("data:")) continue
                    val json = runCatching { JSONObject(line.removePrefix("data:").trim()) }.getOrNull() ?: continue
                    if (json.optJSONObject("promptFeedback")?.has("blockReason") == true) blocked = true
                    val cand = json.optJSONArray("candidates")?.optJSONObject(0) ?: continue
                    val parts = cand.optJSONObject("content")?.optJSONArray("parts")
                    if (parts != null) {
                        for (i in 0 until parts.length()) {
                            val p = parts.getJSONObject(i)
                            if (!p.optBoolean("thought")) p.optString("text").takeIf { it.isNotEmpty() }?.let(onText)
                        }
                    }
                    if (cand.optString("finishReason") == "SAFETY") blocked = true
                }
            }
            if (blocked) "Gemini no quiso responder eso. Prueba con otra pregunta." else null
        } catch (e: java.net.UnknownHostException) {
            "Sin conexión a internet. Revisa tu Wi‑Fi o datos."
        } catch (e: java.io.IOException) {
            "Problema de conexión: ${e.message ?: "intenta de nuevo"}"
        } catch (e: Exception) {
            "Algo falló: ${e.message ?: e.javaClass.simpleName}"
        }
    }

    private fun explain(code: Int, msg: String): String {
        val m = msg.lowercase()
        return when {
            "api key not valid" in m || "api_key_invalid" in m || code == 401 ->
                "API key de Google inválida. Revísala en 🎨 Personalizar → Zper AI."
            code == 403 -> "Tu key de Google no tiene permiso para Gemini. Crea una nueva en aistudio.google.com/apikey."
            code == 429 -> "Llegaste al límite gratis de Gemini por ahora. Espera un minuto y vuelve a intentar."
            "location" in m || "region" in m -> "Gemini no está disponible en tu país con esta cuenta."
            code >= 500 -> "Gemini está fallando ahora mismo. Intenta en unos segundos."
            else -> "Error de Gemini ($code): ${msg.take(160)}"
        }
    }
}
