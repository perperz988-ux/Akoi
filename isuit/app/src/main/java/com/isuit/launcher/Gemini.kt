package com.isuit.launcher

import android.content.Context
import android.graphics.Bitmap
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Gemini (Google AI Studio, plan gratis) para analizar fotos.
 * La API key se crea gratis en aistudio.google.com/apikey y se guarda solo en el teléfono.
 */
object Gemini {

    private const val BASE = "https://generativelanguage.googleapis.com/v1beta"
    private val FALLBACK_MODELS = listOf("gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite")

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("isuit_ai", Context.MODE_PRIVATE)

    fun key(ctx: Context) = prefs(ctx).getString("key", "").orEmpty().trim()
    fun setKey(ctx: Context, k: String) = prefs(ctx).edit().putString("key", k.trim()).apply()

    /** Resultado: texto o error en español. */
    sealed class Result {
        class Ok(val text: String) : Result()
        class Error(val message: String) : Result()
    }

    /** Envía una foto + instrucción. Llamar desde un hilo de fondo. */
    fun describeImage(ctx: Context, image: Bitmap, prompt: String): Result {
        val key = key(ctx)
        if (key.isEmpty()) return Result.Error("Falta tu API key de Google AI Studio.")

        val jpeg = ByteArrayOutputStream().also { scaled(image).compress(Bitmap.CompressFormat.JPEG, 85, it) }.toByteArray()
        val body = JSONObject().put(
            "contents", JSONArray().put(
                JSONObject().put("role", "user").put(
                    "parts", JSONArray()
                        .put(JSONObject().put("inline_data", JSONObject()
                            .put("mime_type", "image/jpeg")
                            .put("data", Base64.encodeToString(jpeg, Base64.NO_WRAP))))
                        .put(JSONObject().put("text", prompt))
                )
            )
        ).put("generationConfig", JSONObject().put("maxOutputTokens", 1024).put("temperature", 0.4)).toString()

        var last = "Gemini no respondió."
        for ((i, model) in candidates(ctx, key).take(5).withIndex()) {
            if (i > 0) Thread.sleep(700L * i)
            try {
                val conn = (URL("$BASE/models/$model:generateContent").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("x-goog-api-key", key)
                    connectTimeout = 20_000
                    readTimeout = 60_000
                }
                conn.outputStream.use { it.write(body.toByteArray()) }
                val code = conn.responseCode
                if (code == 200) {
                    val json = JSONObject(conn.inputStream.bufferedReader().readText())
                    val parts = json.optJSONArray("candidates")?.optJSONObject(0)
                        ?.optJSONObject("content")?.optJSONArray("parts")
                    val text = buildString {
                        if (parts != null) for (j in 0 until parts.length()) {
                            val p = parts.getJSONObject(j)
                            if (!p.optBoolean("thought")) append(p.optString("text"))
                        }
                    }.trim()
                    if (text.isNotEmpty()) {
                        prefs(ctx).edit().putString("model", model).apply()
                        return Result.Ok(text)
                    }
                    last = "Gemini no pudo analizar esa foto. Prueba con otra."
                    continue
                }
                val err = conn.errorStream?.bufferedReader()?.readText().orEmpty()
                val msg = runCatching { JSONObject(err).getJSONObject("error").optString("message") }.getOrNull().orEmpty()
                val m = msg.lowercase()
                when {
                    "api key not valid" in m || code == 401 -> return Result.Error("API key de Google inválida. Revísala.")
                    "location" in m && "not supported" in m -> return Result.Error("Gemini no está disponible en tu país con esta cuenta.")
                    code == 403 -> return Result.Error("Tu key no tiene permiso para Gemini: $msg")
                    code == 404 -> last = "Modelo no disponible."
                    code == 429 -> last = "Llegaste al límite gratis de Gemini. Espera un minuto."
                    code >= 500 -> last = "Gemini está saturado ($code). Intenta en un minuto."
                    else -> return Result.Error("Error de Gemini ($code): ${msg.take(180)}")
                }
            } catch (e: java.net.UnknownHostException) {
                return Result.Error("Sin conexión a internet.")
            } catch (e: Exception) {
                last = "Problema de conexión: ${e.message ?: "intenta de nuevo"}"
            }
        }
        return Result.Error(last)
    }

    /** Fotos de máximo 1280 px: más rápido y gasta menos cupo gratis. */
    private fun scaled(b: Bitmap): Bitmap {
        val max = 1280
        if (b.width <= max && b.height <= max) return b
        val ratio = max.toFloat() / maxOf(b.width, b.height)
        return Bitmap.createScaledBitmap(b, (b.width * ratio).toInt(), (b.height * ratio).toInt(), true)
    }

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
                    val name = m.optString("name").removePrefix("models/")
                    val methods = m.optJSONArray("supportedGenerationMethods")?.toString().orEmpty()
                    name.takeIf {
                        "generateContent" in methods && it.startsWith("gemini") && "flash" in it &&
                            listOf("image", "tts", "audio", "live", "thinking", "embedding", "exp").none { bad -> bad in it }
                    }
                }
            }
        } catch (e: Exception) {
            emptyList()
        }
        val sorted = listed.sortedWith(compareBy<String>(
            { if ("preview" in it) 2 else if ("lite" in it) 1 else 0 },
            { -(Regex("gemini-(\\d+(?:\\.\\d+)?)").find(it)?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0) },
            { it.length },
        ))
        return (listOfNotNull(prefs(ctx).getString("model", null)) + sorted + FALLBACK_MODELS).distinct()
    }
}
