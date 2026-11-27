package com.akoi.launcher

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.LauncherApps
import android.content.res.ColorStateList
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.speech.RecognizerIntent
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.util.concurrent.Executors

/** Chat con Zper AI (Claude), con estilo gamer de losas. */
class AiActivity : ComponentActivity() {

    private lateinit var palette: Palette
    private lateinit var list: RecyclerView
    private lateinit var input: EditText
    private lateinit var status: TextView
    private lateinit var keyCard: View

    private val turns = ArrayList<ZperAi.Turn>()
    private val adapter = ChatAdapter()
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var busy = false
    private var games: List<String> = emptyList()

    private val voice = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        r.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.let { send(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        palette = Themes.load(this)
        GameFont.apply(this)
        setContentView(buildUi())
        loadGames()
        intent.getStringExtra(EXTRA_QUESTION)?.takeIf { it.isNotBlank() }?.let { send(it) }
        if (turns.isEmpty()) {
            turns += ZperAi.Turn(false, "¡Qué onda, jugador! 🎮 Soy Zper AI. Pídeme tips, builds, " +
                "estrategias o recomendaciones de juegos. ¿A qué le damos hoy? 🔥")
            adapter.notifyDataSetChanged()
        }
    }

    override fun onResume() {
        super.onResume()
        refreshKeyState()
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    // ------------------------------------------------------------- Interfaz

    private fun buildUi(): View {
        val bg = palette.bg
        val fg = Ui.onColor(bg)
        @Suppress("DEPRECATION")
        window.statusBarColor = palette.top
        @Suppress("DEPRECATION")
        window.navigationBarColor = bg
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = Ui.onColor(palette.top) == Ui.onColor(0xFFFFFFFF.toInt())
            isAppearanceLightNavigationBars = fg == Ui.onColor(0xFFFFFFFF.toInt())
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(bg)
            fitsSystemWindows = true
        }

        // ---- Cabecera
        val topFg = Ui.onColor(palette.top)
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = Ui.slabBottom(palette.top, dp(30).toFloat())
            setPadding(dp(10), dp(6), dp(14), dp(16))
        }
        header.addView(TextView(this).apply {
            text = "‹"
            gravity = Gravity.CENTER
            style(34f, topFg, Ui.BOLD)
            setOnClickListener { finish() }
        }, LinearLayout.LayoutParams(dp(44), dp(52)))
        header.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(TextView(context).apply {
                text = "ZPER AI"
                style(34f, palette.clock, Ui.HEAVY, 0.02f)
            })
            status = TextView(context).apply {
                style(11f, Ui.alpha(topFg, 0xCC), Ui.HEAVY, 0.12f)
                setPadding(0, dp(4), 0, 0)
            }
            addView(status)
        }, LinearLayout.LayoutParams(0, -2, 1f))
        header.addView(TextView(this).apply {
            text = "🗑"
            textSize = 22f
            gravity = Gravity.CENTER
            contentDescription = "Borrar chat"
            setOnClickListener {
                if (!busy) {
                    turns.clear()
                    turns += ZperAi.Turn(false, "Chat limpio. ¡Nueva partida! 🎮")
                    adapter.notifyDataSetChanged()
                }
            }
        }, LinearLayout.LayoutParams(dp(44), dp(44)))
        root.addView(header)

        // ---- Tarjeta para poner la API key (si falta)
        keyCard = buildKeyCard()
        root.addView(keyCard)

        // ---- Mensajes
        list = RecyclerView(this).apply {
            layoutManager = LinearLayoutManager(context).apply { stackFromEnd = true }
            adapter = this@AiActivity.adapter
            clipToPadding = false
            setPadding(dp(12), dp(12), dp(12), dp(8))
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        root.addView(list, LinearLayout.LayoutParams(-1, 0, 1f))

        // ---- Atajos gamer
        val chips = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(10), 0, dp(10), 0)
        }
        QUICK.forEachIndexed { i, q ->
            val c = palette.slabs[i % palette.slabs.size]
            chips.addView(TextView(this).apply {
                text = q
                style(13f, Ui.onColor(c), Ui.HEAVY)
                background = Ui.ripple(Ui.onColor(c), dp(18).toFloat(), Ui.slab(c, dp(18).toFloat(), topOnly = false))
                setPadding(dp(14), dp(10), dp(14), dp(10))
                setOnClickListener { send(q.substringAfter(' ')) }
            }, LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(8) })
        }
        root.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(chips)
        }, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) })

        // ---- Barra para escribir
        val barColor = palette.search
        val barFg = Ui.onColor(barColor)
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = Ui.slab(barColor, dp(28).toFloat(), topOnly = false)
            setPadding(dp(16), dp(4), dp(6), dp(4))
        }
        input = EditText(this).apply {
            background = null
            hint = "Pregúntale a Zper AI…"
            setHintTextColor(Ui.alpha(barFg, 0x88))
            setTextColor(barFg)
            textSize = 15f
            typeface = Ui.BOLD
            maxLines = 4
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            imeOptions = EditorInfo.IME_ACTION_SEND
            setOnEditorActionListener { _, id, _ ->
                if (id == EditorInfo.IME_ACTION_SEND) { send(text.toString()); true } else false
            }
        }
        bar.addView(input, LinearLayout.LayoutParams(0, -2, 1f))
        bar.addView(ImageView(this).apply {
            setImageResource(R.drawable.ic_mic)
            imageTintList = ColorStateList.valueOf(barFg)
            scaleType = ImageView.ScaleType.CENTER
            background = Ui.ripple(barFg, dp(21).toFloat(), null)
            contentDescription = "Hablar"
            setOnClickListener { startVoice() }
        }, LinearLayout.LayoutParams(dp(42), dp(42)))
        val sendColor = palette.slab(Drawer.JUEGOS)
        bar.addView(TextView(this).apply {
            text = "▶"
            gravity = Gravity.CENTER
            style(18f, Ui.onColor(sendColor), Ui.HEAVY)
            background = Ui.ripple(Ui.onColor(sendColor), dp(22).toFloat(), Ui.slab(sendColor, dp(22).toFloat(), topOnly = false))
            contentDescription = "Enviar"
            setOnClickListener { send(input.text.toString()) }
        }, LinearLayout.LayoutParams(dp(44), dp(44)).apply { marginStart = dp(4) })
        root.addView(bar, LinearLayout.LayoutParams(-1, -2).apply { setMargins(dp(12), 0, dp(12), dp(12)) })
        return root
    }

    private fun buildKeyCard(): View {
        val c = palette.slab(Drawer.SOCIAL)
        val fg = Ui.onColor(c)
        val keyField = EditText(this).apply {
            hint = "sk-ant-…"
            setHintTextColor(Ui.alpha(fg, 0x88))
            setTextColor(fg)
            textSize = 14f
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            background = Ui.outline(fg, dp(2), dp(14).toFloat())
            setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Ui.slab(c, dp(24).toFloat(), topOnly = false)
            setPadding(dp(16), dp(14), dp(16), dp(14))
            addView(TextView(context).apply {
                text = "🔑 Conecta tu Claude"
                style(18f, fg, Ui.HEAVY)
            })
            addView(TextView(context).apply {
                text = "Pega tu API key de Anthropic. Se guarda solo en este teléfono."
                style(12f, Ui.alpha(fg, 0xCC), Ui.BOLD)
                setPadding(0, dp(6), 0, dp(10))
            })
            addView(keyField)
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(10), 0, 0)
                addView(TextView(context).apply {
                    text = "GUARDAR"
                    gravity = Gravity.CENTER
                    style(13f, Ui.onColor(fg), Ui.HEAVY, 0.1f)
                    background = Ui.slab(fg, dp(16).toFloat(), topOnly = false)
                    setPadding(dp(18), dp(10), dp(18), dp(10))
                    setOnClickListener {
                        val k = keyField.text.toString().trim()
                        if (k.length < 20) {
                            toast("Esa key se ve incompleta")
                        } else {
                            ZperAi.setApiKey(this@AiActivity, k)
                            keyField.setText("")
                            refreshKeyState()
                            toast("¡Listo! Zper AI conectado 🎮")
                        }
                    }
                })
                addView(TextView(context).apply {
                    text = "Conseguir key ›"
                    style(13f, fg, Ui.HEAVY)
                    setPadding(dp(16), dp(10), 0, dp(10))
                    setOnClickListener {
                        try {
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://console.anthropic.com/settings/keys")))
                        } catch (e: ActivityNotFoundException) {
                            toast("Abre console.anthropic.com en el navegador")
                        }
                    }
                })
            })
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { setMargins(dp(12), dp(12), dp(12), 0) }
        }
    }

    private fun refreshKeyState() {
        val hasKey = ZperAi.apiKey(this).isNotEmpty()
        keyCard.visibility = if (hasKey) View.GONE else View.VISIBLE
        status.text = if (hasKey) "● EN LÍNEA · CLAUDE" else "● SIN API KEY"
    }

    // ---------------------------------------------------------------- Chat

    private fun send(raw: String) {
        val text = raw.trim()
        if (text.isEmpty() || busy) return
        if (ZperAi.apiKey(this).isEmpty()) {
            toast("Primero pega tu API key de Claude 🔑")
            refreshKeyState()
            return
        }
        input.setText("")
        busy = true
        turns += ZperAi.Turn(true, text)
        turns += ZperAi.Turn(false, "")
        val replyIndex = turns.lastIndex
        adapter.notifyDataSetChanged()
        list.scrollToPosition(turns.lastIndex)

        // Lo que se envía: todo menos el saludo inicial y la respuesta vacía.
        val history = turns.subList(0, replyIndex).filter { it.text.isNotBlank() && !it.text.startsWith("⚠️") }.toList()
        val ctx = applicationContext
        val buffer = StringBuilder()
        executor.execute {
            val error = ZperAi.chat(ctx, history, games) { delta ->
                synchronized(buffer) { buffer.append(delta) }
                main.post {
                    turns[replyIndex] = ZperAi.Turn(false, synchronized(buffer) { buffer.toString() })
                    adapter.notifyItemChanged(replyIndex)
                    list.scrollToPosition(replyIndex)
                }
            }
            main.post {
                val soFar = synchronized(buffer) { buffer.toString() }
                if (error != null) {
                    turns[replyIndex] = ZperAi.Turn(false, if (soFar.isBlank()) "⚠️ $error" else "$soFar\n\n⚠️ $error")
                }
                adapter.notifyItemChanged(replyIndex)
                busy = false
            }
        }
    }

    private fun startVoice() {
        try {
            voice.launch(
                Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_PROMPT, "Habla con Zper AI…")
            )
        } catch (e: ActivityNotFoundException) {
            toast("El reconocimiento de voz no está disponible")
        }
    }

    /** Lista de juegos instalados: Zper AI la usa para dar consejos a tu medida. */
    private fun loadGames() {
        executor.execute {
            val la = getSystemService(LauncherApps::class.java)
            val found = try {
                la.getActivityList(null, Process.myUserHandle())
                    .filter { Drawer.classify(it.applicationInfo, it.componentName.packageName) == Drawer.JUEGOS }
                    .map { it.label.toString() }
                    .distinct()
            } catch (e: Exception) {
                emptyList()
            }
            main.post { games = found }
        }
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    // ------------------------------------------------------------- Burbujas

    private inner class ChatAdapter : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
        override fun getItemCount() = turns.size

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
            val ctx = parent.context
            val row = FrameLayout(ctx).apply {
                layoutParams = RecyclerView.LayoutParams(-1, -2).apply { setMargins(0, ctx.dp(5), 0, ctx.dp(5)) }
            }
            val bubble = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(ctx.dp(16), ctx.dp(12), ctx.dp(16), ctx.dp(12))
                addView(TextView(ctx).apply { id = ID_WHO })
                addView(TextView(ctx).apply {
                    id = ID_TEXT
                    setTextIsSelectable(true)
                    setLineSpacing(0f, 1.15f)
                })
            }
            row.addView(bubble, FrameLayout.LayoutParams(-2, -2))
            return object : RecyclerView.ViewHolder(row) {}
        }

        override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
            val t = turns[position]
            val row = holder.itemView as FrameLayout
            val bubble = row.getChildAt(0) as LinearLayout
            val color = if (t.fromUser) palette.slab(Drawer.JUEGOS) else palette.slab(Drawer.SOCIAL)
            val fg = Ui.onColor(color)
            val r = row.dp(22).toFloat()
            val small = row.dp(6).toFloat()
            bubble.background = android.graphics.drawable.GradientDrawable().apply {
                setColor(color)
                // Esquina "de cola" más chica: del lado de quien habla.
                cornerRadii = if (t.fromUser) floatArrayOf(r, r, small, small, r, r, r, r)
                else floatArrayOf(small, small, r, r, r, r, r, r)
            }
            val lp = bubble.layoutParams as FrameLayout.LayoutParams
            lp.gravity = if (t.fromUser) Gravity.END else Gravity.START
            lp.marginStart = if (t.fromUser) row.dp(48) else 0
            lp.marginEnd = if (t.fromUser) 0 else row.dp(48)
            bubble.layoutParams = lp
            bubble.findViewById<TextView>(ID_WHO).apply {
                text = if (t.fromUser) "TÚ" else "ZPER AI ▸"
                style(10f, Ui.alpha(fg, 0xBB), Ui.HEAVY, 0.14f)
                setPadding(0, 0, 0, row.dp(4))
            }
            bubble.findViewById<TextView>(ID_TEXT).apply {
                text = t.text.ifEmpty { "▮▮▮" }
                style(15f, fg, Ui.BOLD)
            }
        }
    }

    companion object {
        const val EXTRA_QUESTION = "q"
        private val ID_WHO = View.generateViewId()
        private val ID_TEXT = View.generateViewId()
        private val QUICK = listOf(
            "🎮 Recomiéndame un juego para hoy",
            "⚔️ Dame tips para mejorar en mi juego",
            "🔥 Arma un build OP",
            "🏆 Hazme un reto gamer",
            "🧠 Trivia gamer",
            "😂 Cuéntame un chiste gamer",
        )
    }
}

/** Abre el chat de Zper AI (opcionalmente con una pregunta ya escrita). */
fun android.content.Context.openZperAi(question: String? = null) {
    startActivity(
        Intent(this, AiActivity::class.java)
            .putExtra(AiActivity.EXTRA_QUESTION, question)
    )
}
