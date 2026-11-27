package com.akoi.launcher

import android.content.Context
import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.errors.AnthropicIoException
import com.anthropic.errors.AnthropicServiceException
import com.anthropic.errors.BadRequestException
import com.anthropic.errors.OverloadedException
import com.anthropic.errors.PaymentRequiredException
import com.anthropic.errors.PermissionDeniedException
import com.anthropic.errors.RateLimitException
import com.anthropic.errors.UnauthorizedException
import com.anthropic.models.beta.messages.BetaOutputConfig
import com.anthropic.models.beta.messages.BetaStopReason
import com.anthropic.models.beta.messages.MessageCreateParams

/**
 * Zper AI: la IA gamer de ZperOS.
 * Funciona con Gemini (Google AI Studio, plan gratis) o con Claude (Anthropic, de pago).
 *
 * ── DÓNDE SE EDITA ──────────────────────────────────────────────
 *  • La IA a usar, las API keys y la personalidad se cambian DENTRO de la app:
 *    🎨 Personalizar → "Zper AI".
 *  • La personalidad por defecto está aquí abajo en [DEFAULT_PERSONALITY].
 *  • El modelo de Claude está en [MODEL]; el de Gemini se elige solo (GeminiClient.kt).
 * ────────────────────────────────────────────────────────────────
 */
object ZperAi {

    /** Modelo de Claude que usa Zper AI. */
    const val MODEL = "claude-opus-5-5"

    /** Personalidad por defecto (editable en la app). */
    val DEFAULT_PERSONALITY = """
        Eres Zper AI, la inteligencia artificial gamer integrada en ZperOS, un launcher de Android.
        Hablas en español latino, con energía de streamer y jerga gamer (GG, OP, nerf, buff, meta,
        tryhard, clutch, farmear, carry, lag, noob, pro, F, EZ), pero siempre se te entiende.
        Eres el compa del jugador: das tips, estrategias, builds, combos, rutas de speedrun,
        recomendaciones de juegos y retos; también ayudas con cualquier otra cosa.
        Respuestas cortas y al grano (máximo unas 6 líneas salvo que pidan detalle),
        con algún emoji gamer (🎮🔥⚔️🏆💀) sin exagerar. Nunca inventes datos de juegos:
        si no estás seguro, dilo. No ayudes con trampas que arruinen partidas de otros (hacks, cheats online).
    """.trimIndent()

    private const val PREFS = "zper_ai"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Qué IA usar. */
    enum class Provider(val title: String) { GEMINI("Gemini (gratis)"), CLAUDE("Claude") }

    fun provider(ctx: Context): Provider =
        if (prefs(ctx).getString("provider", "gemini") == "claude") Provider.CLAUDE else Provider.GEMINI

    fun setProvider(ctx: Context, p: Provider) =
        prefs(ctx).edit().putString("provider", if (p == Provider.CLAUDE) "claude" else "gemini").apply()

    /** Key de la IA elegida. */
    fun apiKey(ctx: Context): String = keyFor(ctx, provider(ctx))
    fun setApiKey(ctx: Context, key: String) = setKeyFor(ctx, provider(ctx), key)

    fun keyFor(ctx: Context, p: Provider): String =
        prefs(ctx).getString(if (p == Provider.CLAUDE) "key" else "gemini_key", "").orEmpty().trim()

    fun setKeyFor(ctx: Context, p: Provider, key: String) =
        prefs(ctx).edit().putString(if (p == Provider.CLAUDE) "key" else "gemini_key", key.trim()).apply()

    /** Dónde conseguir la key de la IA elegida. */
    fun keyUrl(ctx: Context) = if (provider(ctx) == Provider.CLAUDE)
        "https://console.anthropic.com/settings/keys" else "https://aistudio.google.com/apikey"

    fun keyHint(ctx: Context) = if (provider(ctx) == Provider.CLAUDE) "sk-ant-…" else "AIza…"

    fun personality(ctx: Context): String =
        prefs(ctx).getString("personality", null)?.takeIf { it.isNotBlank() } ?: DEFAULT_PERSONALITY

    fun setPersonality(ctx: Context, text: String) =
        prefs(ctx).edit().putString("personality", text.trim()).apply()

    private var client: AnthropicClient? = null
    private var clientKey: String? = null

    @Synchronized
    private fun client(key: String): AnthropicClient {
        val c = client
        if (c != null && clientKey == key) return c
        return AnthropicOkHttpClient.builder().apiKey(key).build().also {
            client = it
            clientKey = key
        }
    }

    /** Un mensaje del chat. */
    data class Turn(val fromUser: Boolean, val text: String)

    /**
     * Envía la conversación a Claude y va entregando el texto en vivo con [onText].
     * Se llama desde un hilo de fondo. Devuelve un mensaje de error en español, o null si todo bien.
     */
    fun chat(ctx: Context, history: List<Turn>, games: List<String>, onText: (String) -> Unit): String? {
        val provider = provider(ctx)
        val key = apiKey(ctx)
        if (key.isEmpty()) return "Falta tu API key de ${provider.title}. Ponla en 🎨 Personalizar → Zper AI."

        val system = buildString {
            append(personality(ctx))
            if (games.isNotEmpty()) {
                append("\n\nJuegos instalados en el teléfono del jugador: ")
                append(games.take(40).joinToString(", "))
                append(".")
            }
        }

        if (provider == Provider.GEMINI) return GeminiClient.chat(ctx, key, system, history, onText)
        return chatClaude(key, system, history, onText, withFallbacks = true)
    }

    private fun chatClaude(
        key: String,
        system: String,
        history: List<Turn>,
        onText: (String) -> Unit,
        withFallbacks: Boolean,
    ): String? {
        val builder = MessageCreateParams.builder()
            .model(MODEL)
            .maxTokens(4096L)
            .system(system)
            // Chat rápido: poco "pensar", respuestas al momento.
            .outputConfig(BetaOutputConfig.builder().effort(BetaOutputConfig.Effort.LOW).build())
        // Si Claude rechaza una petición por seguridad, el servidor reintenta con otro modelo.
        if (withFallbacks) builder.addBeta("server-side-fallback-2026-07-01").fallbacksDefault()
        // La conversación debe empezar con el jugador.
        history.dropWhile { !it.fromUser }.forEach { t ->
            if (t.fromUser) builder.addUserMessage(t.text) else builder.addAssistantMessage(t.text)
        }

        return try {
            var refused = false
            val stream = client(key).beta().messages().createStreaming(builder.build())
            try {
                for (event in stream) {
                    event.contentBlockDelta()
                        .flatMap { it.delta().text() }
                        .ifPresent { onText(it.text()) }
                    event.messageDelta()
                        .flatMap { it.delta().stopReason() }
                        .ifPresent { if (it == BetaStopReason.REFUSAL) refused = true }
                }
            } finally {
                stream.close()
            }
            if (refused) "Zper AI no puede ayudar con eso. Prueba con otra pregunta." else null
        } catch (e: BadRequestException) {
            val msg = e.apiMessage().orElse("")
            when {
                "credit balance" in msg.lowercase() ->
                    "Tu cuenta de Claude no tiene saldo. Usa Gemini (gratis) en 🎨 Personalizar → Zper AI."
                withFallbacks -> chatClaude(key, system, history, onText, withFallbacks = false)
                else -> "Claude rechazó la petición: ${msg.take(160)}"
            }
        } catch (e: UnauthorizedException) {
            "API key inválida. Revísala en 🎨 Personalizar → Zper AI."
        } catch (e: PermissionDeniedException) {
            "Tu API key no tiene permiso para usar este modelo."
        } catch (e: PaymentRequiredException) {
            "Tu cuenta de Claude no tiene saldo. Recarga en console.anthropic.com."
        } catch (e: RateLimitException) {
            "Demasiadas preguntas seguidas. Espera un momento y vuelve a intentar."
        } catch (e: OverloadedException) {
            "Claude está saturado ahora mismo. Intenta en unos segundos."
        } catch (e: AnthropicServiceException) {
            "Error de Claude (${e.statusCode()}). Intenta de nuevo."
        } catch (e: AnthropicIoException) {
            "Sin conexión a internet. Revisa tu Wi‑Fi o datos."
        } catch (e: Exception) {
            "Algo falló: ${e.message ?: e.javaClass.simpleName}"
        }
    }
}
