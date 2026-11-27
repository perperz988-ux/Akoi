package com.akoi.launcher

import android.app.AlertDialog
import android.graphics.Color
import android.os.Bundle
import android.text.Editable
import android.text.InputFilter
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.GridLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.view.WindowCompat

/** "Personalizar": temas listos y cada color editable a tu gusto. */
class ThemeActivity : ComponentActivity() {

    private lateinit var palette: Palette

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        palette = Themes.load(this)
        GameFont.apply(this)
        render()
    }

    private fun render() {
        val bg = palette.bg
        val fg = Ui.onColor(bg)
        @Suppress("DEPRECATION")
        window.statusBarColor = palette.top
        @Suppress("DEPRECATION")
        window.navigationBarColor = bg
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = Ui.onColor(palette.top) == Ui.onColor(Color.WHITE)
            isAppearanceLightNavigationBars = fg == Ui.onColor(Color.WHITE)
        }

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(18), dp(18), dp(28))
        }
        val scroll = ScrollView(this).apply {
            setBackgroundColor(bg)
            fitsSystemWindows = true
            addView(column)
        }

        column.addView(TextView(this).apply {
            text = "‹  Volver"
            style(14f, fg, Ui.HEAVY)
            setPadding(0, dp(6), 0, dp(14))
            setOnClickListener { finish() }
        })
        column.addView(TextView(this).apply {
            text = "Tus\ncolores"
            style(54f, palette.top, Ui.HEAVY, -0.02f)
            setLineSpacing(0f, 0.88f)
        })
        column.addView(TextView(this).apply {
            text = "Tema actual: ${palette.name}"
            style(13f, Ui.alpha(fg, 0xAA), Ui.BOLD)
            setPadding(0, dp(10), 0, dp(20))
        })

        // ---- Temas listos
        column.addView(sectionTitle("Temas", fg))
        val presetRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        Themes.presets.forEach { p -> presetRow.addView(presetCard(p, fg)) }
        column.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(presetRow)
        })

        // ---- Letra gamer
        column.addView(sectionTitle("Letra", fg).apply { setPadding(0, dp(26), 0, dp(10)) })
        val fontRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val chosen = Themes.font(this)
        GameFont.entries.forEach { f -> fontRow.addView(fontCard(f, f == chosen, fg)) }
        column.addView(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(fontRow)
        })

        // ---- Cada color
        column.addView(sectionTitle("Edita cada losa", fg).apply { setPadding(0, dp(26), 0, dp(10)) })
        val stack = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        Drawer.entries.forEachIndexed { i, d ->
            stack.addView(slabRow(d.title, Palette.slabKey(d), i > 0))
        }
        column.addView(stack)

        column.addView(sectionTitle("Básicos", fg).apply { setPadding(0, dp(26), 0, dp(10)) })
        column.addView(simpleRow("Barra de arriba", Palette.KEY_TOP, fg))
        column.addView(simpleRow("Fondo", Palette.KEY_BG, fg))
        column.addView(simpleRow("Reloj", Palette.KEY_CLOCK, fg))
        column.addView(simpleRow("Buscador", Palette.KEY_SEARCH, fg))

        // ---- Zper AI (Claude)
        column.addView(sectionTitle("Zper AI · Claude", fg).apply { setPadding(0, dp(26), 0, dp(10)) })
        column.addView(buildAiSection(fg))

        // ---- ⚡ Turbo gamer
        column.addView(sectionTitle("⚡ Turbo gamer", fg).apply { setPadding(0, dp(26), 0, dp(6)) })
        column.addView(Switch(this).apply {
            text = "Turbo automático al abrir un juego"
            setTextColor(fg)
            textSize = 15f
            isChecked = GameBooster.autoTurbo(this@ThemeActivity)
            setOnCheckedChangeListener { _, on -> GameBooster.setAutoTurbo(this@ThemeActivity, on) }
            setPadding(0, dp(8), 0, dp(8))
        })
        column.addView(Switch(this).apply {
            text = "No molestar mientras juegas"
            setTextColor(fg)
            textSize = 15f
            isChecked = GameBooster.dndWhilePlaying(this@ThemeActivity)
            setOnCheckedChangeListener { _, on ->
                GameBooster.setDndWhilePlaying(this@ThemeActivity, on)
                if (on && !GameBooster.canUseDnd(this@ThemeActivity)) {
                    try { startActivity(GameBooster.dndPermissionIntent()) } catch (e: Exception) { }
                }
            }
            setPadding(0, dp(8), 0, dp(8))
        })

        column.addView(sectionTitle("Portada", fg).apply { setPadding(0, dp(26), 0, dp(6)) })
        column.addView(Switch(this).apply {
            text = "Mostrar la portada al encender la pantalla"
            setTextColor(fg)
            textSize = 15f
            isChecked = Themes.coverEnabled(this@ThemeActivity)
            setOnCheckedChangeListener { _, on -> Themes.setCoverEnabled(this@ThemeActivity, on) }
            setPadding(0, dp(8), 0, dp(8))
        })

        column.addView(TextView(this).apply {
            text = "Restablecer colores"
            gravity = Gravity.CENTER
            style(15f, Ui.onColor(palette.slab(Drawer.JUEGOS)), Ui.HEAVY)
            background = Ui.ripple(fg, dp(28).toFloat(), Ui.slab(palette.slab(Drawer.JUEGOS), dp(28).toFloat(), false))
            setOnClickListener { apply(Themes.default) }
        }, LinearLayout.LayoutParams(-1, dp(56)).apply { topMargin = dp(28) })

        setContentView(scroll)
    }

    /** API key de Claude y personalidad de Zper AI, editables aquí. */
    private fun buildAiSection(fg: Int): View {
        val c = palette.slab(Drawer.SOCIAL)
        val on = Ui.onColor(c)
        fun field(hintText: String, multi: Boolean) = EditText(this).apply {
            hint = hintText
            setHintTextColor(Ui.alpha(on, 0x88))
            setTextColor(on)
            textSize = 14f
            background = Ui.outline(on, dp(2), dp(14).toFloat())
            setPadding(dp(12), dp(10), dp(12), dp(10))
            if (multi) {
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                    InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
                minLines = 5
                maxLines = 12
                gravity = Gravity.TOP or Gravity.START
            } else {
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
        }
        fun button(label: String, onClick: () -> Unit) = TextView(this).apply {
            text = label
            gravity = Gravity.CENTER
            style(12f, Ui.onColor(on), Ui.HEAVY, 0.08f)
            background = Ui.slab(on, dp(14).toFloat(), topOnly = false)
            setPadding(dp(14), dp(9), dp(14), dp(9))
            setOnClickListener { onClick() }
        }
        fun label(t: String) = TextView(this).apply {
            text = t
            style(13f, on, Ui.HEAVY)
            setPadding(0, dp(12), 0, dp(6))
        }

        val hasKey = ZperAi.apiKey(this).isNotEmpty()
        val keyField = field(if (hasKey) "•••••••• (guardada)" else "sk-ant-…", multi = false)
        val persona = field("Personalidad", multi = true).apply { setText(ZperAi.personality(this@ThemeActivity)) }

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Ui.slab(c, dp(24).toFloat(), topOnly = false)
            setPadding(dp(16), dp(8), dp(16), dp(16))
            addView(label("🔑 API key de Claude " + if (hasKey) "· ✅ conectada" else "· ❌ falta"))
            addView(keyField)
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(8), 0, 0)
                addView(button("GUARDAR KEY") {
                    val k = keyField.text.toString().trim()
                    if (k.length < 20) {
                        android.widget.Toast.makeText(context, "Esa key se ve incompleta", android.widget.Toast.LENGTH_SHORT).show()
                    } else {
                        ZperAi.setApiKey(this@ThemeActivity, k)
                        render()
                    }
                })
                if (hasKey) addView(button("BORRAR") {
                    ZperAi.setApiKey(this@ThemeActivity, "")
                    render()
                }, LinearLayout.LayoutParams(-2, -2).apply { marginStart = dp(8) })
            })
            addView(TextView(context).apply {
                text = "Consíguela en console.anthropic.com → API Keys. Se guarda solo en este teléfono."
                style(11f, Ui.alpha(on, 0xBB), Ui.BOLD)
                setPadding(0, dp(8), 0, 0)
            })
            addView(label("🎮 Personalidad de Zper AI"))
            addView(persona)
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, dp(8), 0, 0)
                addView(button("GUARDAR") {
                    ZperAi.setPersonality(this@ThemeActivity, persona.text.toString())
                    android.widget.Toast.makeText(context, "Personalidad guardada 🎮", android.widget.Toast.LENGTH_SHORT).show()
                })
                addView(button("ORIGINAL") {
                    ZperAi.setPersonality(this@ThemeActivity, "")
                    persona.setText(ZperAi.DEFAULT_PERSONALITY)
                }, LinearLayout.LayoutParams(-2, -2).apply { marginStart = dp(8) })
                addView(button("PROBAR ▶") { openZperAi() },
                    LinearLayout.LayoutParams(-2, -2).apply { marginStart = dp(8) })
            })
        }
    }

    private fun sectionTitle(text: String, fg: Int) = TextView(this).apply {
        this.text = text.uppercase()
        style(12f, Ui.alpha(fg, 0xBB), Ui.HEAVY, 0.14f)
        setPadding(0, 0, 0, dp(10))
    }

    private fun fontCard(font: GameFont, selected: Boolean, fg: Int): View {
        val heavy = font.heavy(this)
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = Ui.outline(
                if (selected) palette.top else Ui.alpha(fg, 0x44),
                dp(if (selected) 3 else 1), dp(18).toFloat(),
            )
            addView(TextView(context).apply {
                text = "12:45"
                typeface = heavy
                textSize = 30f * font.scale
                setTextColor(if (selected) palette.top else fg)
                includeFontPadding = false
            })
            addView(TextView(context).apply {
                text = font.title.uppercase()
                typeface = heavy
                textSize = 13f * font.scale
                setTextColor(Ui.alpha(fg, 0xCC))
                setPadding(0, dp(8), 0, 0)
            })
            setOnClickListener {
                Themes.setFont(this@ThemeActivity, font)
                GameFont.apply(this@ThemeActivity)
                render()
            }
            layoutParams = LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(10) }
        }
    }

    private fun presetCard(p: Palette, fg: Int): View {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(8), dp(8), dp(8), dp(10))
            val selected = p.name == palette.name
            background = Ui.outline(if (selected) fg else Ui.alpha(fg, 0x44), dp(if (selected) 3 else 1), dp(18).toFloat(), p.bg)
            setOnClickListener { apply(p) }
        }
        // Mini losas apiladas.
        val mini = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        p.slabs.take(4).forEachIndexed { i, c ->
            mini.addView(View(this).apply { background = Ui.slab(c, dp(10).toFloat()) },
                LinearLayout.LayoutParams(-1, dp(26)).apply { if (i > 0) topMargin = -dp(8) })
        }
        card.addView(mini, LinearLayout.LayoutParams(dp(96), -2))
        card.addView(TextView(this).apply {
            text = p.name
            style(13f, Ui.onColor(p.bg), Ui.HEAVY)
            setPadding(dp(2), dp(8), 0, 0)
        })
        return card.apply {
            layoutParams = LinearLayout.LayoutParams(-2, -2).apply { marginEnd = dp(10) }
        }
    }

    /** Fila con forma de losa: se ve igual que en la pantalla de inicio. */
    private fun slabRow(title: String, key: String, overlap: Boolean): View {
        val color = palette.get(key)
        val fg = Ui.onColor(color)
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = Ui.slab(color, dp(26).toFloat())
            setPadding(dp(20), dp(18), dp(18), dp(18 + 22))
            addView(TextView(context).apply { text = title; style(21f, fg, Ui.HEAVY, -0.02f) },
                LinearLayout.LayoutParams(0, -2, 1f))
            addView(TextView(context).apply { text = hex(color) + "  ✎"; style(12f, Ui.alpha(fg, 0xCC), Ui.BOLD) })
            setOnClickListener { pickColor(title, key) }
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { if (overlap) topMargin = -dp(22) }
        }
    }

    private fun simpleRow(title: String, key: String, fg: Int): View {
        val color = palette.get(key)
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(4), dp(10), dp(4), dp(10))
            addView(View(context).apply {
                background = Ui.outline(Ui.alpha(fg, 0x66), dp(2), dp(14).toFloat(), color)
            }, LinearLayout.LayoutParams(dp(44), dp(44)))
            addView(TextView(context).apply {
                text = title
                style(17f, fg, Ui.HEAVY)
                setPadding(dp(14), 0, 0, 0)
            }, LinearLayout.LayoutParams(0, -2, 1f))
            addView(TextView(context).apply { text = hex(color) + "  ✎"; style(12f, Ui.alpha(fg, 0xAA), Ui.BOLD) })
            setOnClickListener { pickColor(title, key) }
        }
    }

    private fun apply(p: Palette) {
        palette = p
        Themes.save(this, p)
        render()
    }

    // ------------------------------------------------------ Selector de color

    private fun pickColor(title: String, key: String) {
        var current = palette.get(key) or 0xFF000000.toInt()
        val hsv = FloatArray(3).also { Color.colorToHSV(current, it) }
        var updating = false

        val preview = TextView(this).apply {
            gravity = Gravity.CENTER
            text = title
        }
        val hexField = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
            filters = arrayOf(InputFilter.LengthFilter(7))
            setTextColor(Color.WHITE)
            textSize = 16f
            typeface = Ui.BOLD
        }
        val hue = seek(360)
        val sat = seek(100)
        val bri = seek(100)

        fun show(color: Int, fromHex: Boolean = false) {
            current = color
            preview.background = Ui.slab(color, dp(20).toFloat(), topOnly = false)
            preview.style(22f, Ui.onColor(color), Ui.HEAVY)
            updating = true
            Color.colorToHSV(color, hsv)
            hue.progress = hsv[0].toInt()
            sat.progress = (hsv[1] * 100).toInt()
            bri.progress = (hsv[2] * 100).toInt()
            if (!fromHex) hexField.setText(hex(color))
            updating = false
        }

        val listener = object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(s: SeekBar?, p: Int, fromUser: Boolean) {
                if (updating || !fromUser) return
                show(Color.HSVToColor(floatArrayOf(hue.progress.toFloat(), sat.progress / 100f, bri.progress / 100f)))
            }
            override fun onStartTrackingTouch(s: SeekBar?) {}
            override fun onStopTrackingTouch(s: SeekBar?) {}
        }
        listOf(hue, sat, bri).forEach { it.setOnSeekBarChangeListener(listener) }
        hexField.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) {
                if (updating) return
                val t = s?.toString()?.trim().orEmpty().let { if (it.startsWith("#")) it else "#$it" }
                if (t.length == 7) runCatching { Color.parseColor(t) }.onSuccess { show(it, fromHex = true) }
            }
        })

        val swatches = GridLayout(this).apply { columnCount = 6 }
        SWATCHES.forEach { c ->
            swatches.addView(View(this).apply {
                background = Ui.outline(0x55FFFFFF, dp(1), dp(10).toFloat(), c)
                setOnClickListener { show(c) }
            }, GridLayout.LayoutParams().apply {
                width = dp(38); height = dp(38)
                setMargins(dp(4), dp(4), dp(4), dp(4))
            })
        }

        val body = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(12), dp(20), 0)
            addView(preview, LinearLayout.LayoutParams(-1, dp(84)))
            addView(label("Tono")); addView(hue)
            addView(label("Saturación")); addView(sat)
            addView(label("Brillo")); addView(bri)
            addView(label("Colores rápidos"))
            addView(swatches)
            addView(label("Código (#RRGGBB)"))
            addView(hexField)
        }
        show(current)

        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle(title)
            .setView(ScrollView(this).apply { addView(body) })
            .setPositiveButton("Aplicar") { _, _ -> apply(palette.with(key, current)) }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun seek(max: Int) = SeekBar(this).apply {
        this.max = max
        setPadding(dp(8), dp(6), dp(8), dp(6))
    }

    private fun label(text: String) = TextView(this).apply {
        this.text = text.uppercase()
        style(11f, 0xAAFFFFFF.toInt(), Ui.HEAVY, 0.12f)
        setPadding(0, dp(14), 0, dp(4))
    }

    private fun hex(color: Int) = String.format("#%06X", color and 0xFFFFFF)

    companion object {
        private val SWATCHES = listOf(
            0xFFFF6A1A, 0xFFFF3B1F, 0xFFFF2E88, 0xFFFFE600, 0xFFDFFF5E, 0xFFB6FF00,
            0xFF00FF66, 0xFF00F0FF, 0xFF7FD4FF, 0xFF2F6BFF, 0xFF1546B8, 0xFF0F2A6E,
            0xFF8A2BE2, 0xFFC8B8FF, 0xFFF3F0E8, 0xFFFFFFFF, 0xFF7A7A7A, 0xFF050608,
        ).map { it.toInt() }
    }
}
