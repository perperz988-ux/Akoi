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
 *
 * Si un modelo está saturado (error 5xx) o se acabó su cupo gratis (429),
 * prueba solo con otro modelo de Gemini.
 */
object GeminiClient {

    private const val BASE = "https://generativelanguage.googleapis.com/v1beta"

    /** Modelos de respaldo por si no se puede consultar la lista. */
    private val FALLBACK_MODELS = listOf("gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite")

    private const val MAX_TRIES = 5

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("zper_ai", Context.MODE_PRIVATE)

    /** Último modelo que funcionó (para usarlo primero). */
    private fun lastGood(ctx: Context) = prefs(ctx).getString("gemini_model", null)

    /**
     * Modelos a probar, en orden: el último que funcionó, luego los "flash" más nuevos
     * disponibles para tu key, luego los "flash-lite" y por último los de respaldo.
     */
    private fun candidates(ctx: Context, key: String): List<String> {
        val listed = try {
            val conn = (URL("$BASE/models?pageSize=200").openConnection() as HttpURLConnection).apply {
                setRequestProperty("x-goog-api-key", key)
                connectTimeout = 15_000
                readTimeout = 15_000
            }
            if (conn.responseCode != 200) emptyList() else {
                val models = JSONObject(conn.inputStream.bufferedReader().readText()).optJSONArray("models") ?: JSONArray()
                (0 until models.length()).mapNotNull { i ->
                    val m = models.getJSONObject(i)
                    val methods = m.optJSONArray("supportedGenerationMethods")?.toString().orEmpty()
                    val name = m.optString("name").removePrefix("models/")
                    name.takeIf {
                        "generateContent" in methods && it.startsWith("gemini") && "flash" in it &&
                            listOf("image", "tts", "audio", "live", "thinking", "embedding", "exp")
                                .none { bad -> bad in it }
                    }
                }
            }
        } catch (e: Exception) {
            emptyList()
        }
        // Flash normales primero (más nuevos antes), luego lite, luego preview.
        val sorted = listed.sortedWith(
            compareBy<String>({ if ("preview" in it) 2 else if ("lite" in it) 1 else 0 }, { -versionOf(it) }, { it.length })
        )
        return (listOfNotNull(lastGood(ctx)) + sorted + FALLBACK_MODELS).distinct()
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
    ): String? {
        val body = requestBody(system, history)
        var lastError = "Gemini no respondió."
        for ((attempt, model) in candidates(ctx, key).take(MAX_TRIES).withIndex()) {
            if (attempt > 0) Thread.sleep(700L * attempt)
            when (val r = streamOnce(key, model, body, onText)) {
                is Result.Ok -> {
                    prefs(ctx).edit().putString("gemini_model", model).apply()
                    return null
                }
                is Result.Fatal -> return r.message
                is Result.TryNext -> {
                    lastError = r.message
                    if (r.alreadyWrote) return r.message // ya mostró parte de la respuesta: no repetir
                }
            }
        }
        return lastError
    }

    private sealed class Result {
        object Ok : Result()
        class Fatal(val message: String) : Result()
        class TryNext(val message: String, val alreadyWrote: Boolean = false) : Result()
    }

    private fun requestBody(system: String, history: List<ZperAi.Turn>): String {
        // Gemini usa roles "user" y "model"; se juntan mensajes seguidos del mismo lado.
        val contents = JSONArray()
        var lastRole: String? = null
        var lastParts: JSONArray? = null
        for (t in history.dropWhile { !it.fromUser }) {
            val role = if (t.fromUser) "user" else "model"
            val parts = lastParts
            if (role == lastRole && parts != null) {
                parts.put(JSONObject().put("text", t.text))
            } else {
                val newParts = JSONArray().put(JSONObject().put("text", t.text))
                contents.put(JSONObject().put("role", role).put("parts", newParts))
                lastParts = newParts
                lastRole = role
            }
        }
        return JSONObject()
            .put("systemInstruction", JSONObject().put("parts", JSONArray().put(JSONObject().put("text", system))))
            .put("contents", contents)
            .put("generationConfig", JSONObject().put("maxOutputTokens", 2048).put("temperature", 0.9))
            .toString()
    }

    private fun streamOnce(key: String, model: String, body: String, onText: (String) -> Unit): Result {
        var wrote = false
        return try {
            val conn = (URL("$BASE/models/$model:streamGenerateContent?alt=sse").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("x-goog-api-key", key)
                connectTimeout = 20_000
                readTimeout = 60_000
            }
            conn.outputStream.use { it.write(body.toByteArray()) }

            val code = conn.responseCode
            if (code != 200) {
                val err = conn.errorStream?.bufferedReader()?.readText().orEmpty()
                val msg = runCatching { JSONObject(err).getJSONObject("error").optString("message") }.getOrNull().orEmpty()
                return classify(code, msg)
            }

            var blocked = false
            BufferedReader(InputStreamReader(conn.inputStream)).use { reader ->
                while (true) {
                    val line = reader.readLine() ?: break
                    if (!line.startsWith("data:")) continue
                    val json = runCatching { JSONObject(line.removePrefix("data:").trim()) }.getOrNull() ?: continue
                    json.optJSONObject("error")?.let { e ->
                        val r = classify(e.optInt("code", 500), e.optString("message"))
                        return if (r is Result.TryNext) Result.TryNext(r.message, wrote) else r
                    }
                    if (json.optJSONObject("promptFeedback")?.has("blockReason") == true) blocked = true
                    val cand = json.optJSONArray("candidates")?.optJSONObject(0) ?: continue
                    val parts = cand.optJSONObject("content")?.optJSONArray("parts")
                    if (parts != null) {
                        for (i in 0 until parts.length()) {
                            val p = parts.getJSONObject(i)
                            if (p.optBoolean("thought")) continue
                            val text = p.optString("text")
                            if (text.isNotEmpty()) {
                                wrote = true
                                onText(text)
                            }
                        }
                    }
                    if (cand.optString("finishReason") == "SAFETY") blocked = true
                }
            }
            when {
                blocked && !wrote -> Result.Fatal("Gemini no quiso responder eso. Prueba con otra pregunta.")
                !wrote -> Result.TryNext("Gemini respondió vacío.")
                else -> Result.Ok
            }
        } catch (e: java.net.UnknownHostException) {
            Result.Fatal("Sin conexión a internet. Revisa tu Wi‑Fi o datos.")
        } catch (e: java.io.IOException) {
            Result.TryNext("Problema de conexión con Gemini: ${e.message ?: "intenta de nuevo"}", wrote)
        } catch (e: Exception) {
            Result.Fatal("Algo falló: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    /** Errores que se arreglan probando otro modelo vs. errores que hay que contar al jugador. */
    private fun classify(code: Int, msg: String): Result {
        val m = msg.lowercase()
        return when {
            "api key not valid" in m || "api_key_invalid" in m || code == 401 ->
                Result.Fatal("API key de Google inválida. Revísala en 🎨 Personalizar → Zper AI.")
            "location" in m && "not supported" in m ->
                Result.Fatal("Gemini no está disponible en tu país con esta cuenta.")
            code == 403 ->
                Result.Fatal("Tu key no tiene permiso para Gemini ($msg). Crea una nueva en aistudio.google.com/apikey.")
            code == 404 -> Result.TryNext("Modelo de Gemini no disponible.")
            code == 429 -> Result.TryNext("Llegaste al límite gratis de Gemini por ahora. Espera un minuto y vuelve a intentar.")
            code >= 500 -> Result.TryNext("Gemini está saturado ahora mismo ($code). Intenta en un minuto.")
            else -> Result.Fatal("Error de Gemini ($code): ${msg.take(180)}")
        }
    }
}
