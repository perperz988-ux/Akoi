package com.akoi.launcher

import android.animation.LayoutTransition
import android.app.AlarmManager
import android.app.SearchManager
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.app.role.RoleManager
import android.content.pm.LauncherApps
import android.content.pm.PackageManager
import android.os.Build
import android.content.res.ColorStateList
import android.graphics.Rect
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.UserHandle
import android.provider.Settings
import android.speech.RecognizerIntent
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.text.format.DateFormat
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.TextClock
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.text.Collator
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : ComponentActivity(), AssistantHost {

    /** Las vistas de una losa/cajón. */
    private class DrawerViews(
        val drawer: Drawer,
        val container: LinearLayout,
        val meta: TextView,
        val icons: LinearLayout,
        val color: Int,
    )

    private lateinit var palette: Palette
    private lateinit var launcherApps: LauncherApps
    private lateinit var usage: UsageStore
    private lateinit var search: EditText
    private lateinit var clearSearch: TextView
    private lateinit var infoText: TextView
    private lateinit var drawersColumn: LinearLayout
    private lateinit var resultsSlab: LinearLayout
    private lateinit var drawerList: RecyclerView
    private lateinit var resultsList: RecyclerView
    private var cover: CoverView? = null

    private val drawerViews = LinkedHashMap<Drawer, DrawerViews>()
    private val assistant = Assistant(this)
    private val drawerAdapter = TileAdapter({ a, v -> launch(a, v) }, { a, v -> showAppMenu(a, v) }, { openLetter(it) })
    private val resultsAdapter = TileAdapter({ a, v -> launch(a, v) }, { a, v -> showAppMenu(a, v) }, { openLetter(it) })

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    private var apps: List<AppItem> = emptyList()
    private var openDrawer: Drawer = Drawer.JUEGOS
    private var azLetter: String? = null
    private var query: String = ""
    private var actions: List<AssistantAction> = emptyList()
    private var torchOn = false
    private var themeStamp = 0L

    private val voiceLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val text = result.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
                ?: return@registerForActivityResult
            search.setText(text)
            search.setSelection(text.length)
            runBest()
        }

    private val packageCallback = object : LauncherApps.Callback() {
        override fun onPackageRemoved(packageName: String?, user: UserHandle?) = reload()
        override fun onPackageAdded(packageName: String?, user: UserHandle?) = reload()
        override fun onPackageChanged(packageName: String?, user: UserHandle?) = reload()
        override fun onPackagesAvailable(p: Array<out String>?, u: UserHandle?, r: Boolean) = reload()
        override fun onPackagesUnavailable(p: Array<out String>?, u: UserHandle?, r: Boolean) = reload()
    }

    /** Al apagar la pantalla vuelve a aparecer la portada. */
    private val screenOff = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (Themes.coverEnabled(this@MainActivity)) {
                resetHome()
                showCover()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        palette = Themes.load(this)
        GameFont.apply(this)
        themeStamp = Themes.stamp(this)
        launcherApps = getSystemService(LauncherApps::class.java)
        usage = UsageStore(this)
        openDrawer = Drawer.entries.getOrNull(prefs().getInt("open", 0)) ?: Drawer.JUEGOS

        setContentView(buildUi())

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            // Un launcher nunca se cierra con "atrás".
            override fun handleOnBackPressed() {
                when {
                    query.isNotEmpty() -> search.setText("")
                    azLetter != null -> openLetter(null)
                }
            }
        })

        launcherApps.registerCallback(packageCallback, mainHandler)
        ContextCompat.registerReceiver(
            this, screenOff, IntentFilter(Intent.ACTION_SCREEN_OFF), ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        if (savedInstanceState == null && Themes.coverEnabled(this)) showCover() else hideCover()
        reload()
        // La primera vez, ofrece hacer ZperOS la pantalla de inicio.
        if (savedInstanceState == null && !isDefaultHome() && !prefs().getBoolean("asked_home", false)) {
            prefs().edit().putBoolean("asked_home", true).apply()
            mainHandler.postDelayed({ requestDefaultHome() }, 800)
        }
    }

    override fun onResume() {
        super.onResume()
        if (Themes.stamp(this) != themeStamp) {
            recreate() // cambiaron los colores en "Personalizar"
            return
        }
        updateInfo()
        GameBooster.endSession(this) // quita el "No molestar" del turbo al volver
        defaultBanner.visibility = if (isDefaultHome()) View.GONE else View.VISIBLE
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (Intent.ACTION_MAIN == intent.action) {
            if (cover?.visibility == View.VISIBLE) cover?.dismiss() else resetHome()
        }
    }

    override fun onDestroy() {
        launcherApps.unregisterCallback(packageCallback)
        unregisterReceiver(screenOff)
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun prefs() = getSharedPreferences("home", Context.MODE_PRIVATE)

    // ------------------------------------------------------------- Interfaz

    private fun buildUi(): View {
        val root = FrameLayout(this).also { rootView = it }.apply {
            setBackgroundColor(palette.bg)
            fitsSystemWindows = true
        }
        val home = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(home, FrameLayout.LayoutParams(-1, -1))

        home.addView(buildHeader())
        home.addView(buildDefaultBanner())
        home.addView(buildSearch())

        val content = FrameLayout(this)
        home.addView(content, LinearLayout.LayoutParams(-1, 0, 1f))

        drawersColumn = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutTransition = LayoutTransition().apply {
                enableTransitionType(LayoutTransition.CHANGING)
                setDuration(260)
            }
        }
        content.addView(drawersColumn, FrameLayout.LayoutParams(-1, -1))

        drawerList = makeList(drawerAdapter)

        val resultsColor = palette.slab(Drawer.AZ)
        resultsList = makeList(resultsAdapter)
        resultsSlab = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Ui.slab(resultsColor, dp(30).toFloat())
            setPadding(dp(12), dp(14), dp(12), 0)
            visibility = View.GONE
            addView(resultsList, LinearLayout.LayoutParams(-1, -1))
        }
        content.addView(resultsSlab, FrameLayout.LayoutParams(-1, -1))

        cover = CoverView(this, palette) { hideCover() }
        root.addView(cover, FrameLayout.LayoutParams(-1, -1))
        return root
    }

    private lateinit var defaultBanner: View

    /** Aviso para poner ZperOS como pantalla de inicio (se oculta cuando ya lo es). */
    private fun buildDefaultBanner(): View {
        val color = palette.slab(Drawer.JUEGOS)
        val fg = Ui.onColor(color)
        defaultBanner = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = Ui.ripple(fg, dp(20).toFloat(), Ui.slab(color, dp(20).toFloat(), topOnly = false))
            setPadding(dp(16), dp(12), dp(16), dp(12))
            addView(TextView(context).apply {
                text = "⌂"
                style(22f, fg, Ui.HEAVY)
            })
            addView(TextView(context).apply {
                text = "Hacer ZperOS mi pantalla de inicio"
                style(14f, fg, Ui.BOLD)
                setPadding(dp(12), 0, dp(8), 0)
            }, LinearLayout.LayoutParams(0, -2, 1f))
            addView(TextView(context).apply {
                text = "ACTIVAR"
                style(12f, Ui.onColor(fg), Ui.HEAVY, 0.08f)
                background = Ui.slab(fg, dp(14).toFloat(), topOnly = false)
                setPadding(dp(12), dp(7), dp(12), dp(7))
            })
            setOnClickListener { requestDefaultHome() }
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { setMargins(dp(14), dp(12), dp(14), 0) }
            visibility = if (isDefaultHome()) View.GONE else View.VISIBLE
        }
        return defaultBanner
    }

    private fun isDefaultHome(): Boolean {
        val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val info = packageManager.resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY)
        return info?.activityInfo?.packageName == packageName
    }

    /** Abre el diálogo del sistema para elegir ZperOS como pantalla de inicio. */
    private fun requestDefaultHome() {
        if (isDefaultHome()) {
            toast("ZperOS ya es tu pantalla de inicio")
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val rm = getSystemService(RoleManager::class.java)
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME) && !rm.isRoleHeld(RoleManager.ROLE_HOME)) {
                try {
                    homeRoleLauncher.launch(rm.createRequestRoleIntent(RoleManager.ROLE_HOME))
                    return
                } catch (e: Exception) {
                    // sigue con los ajustes
                }
            }
        }
        startSafe(Intent(Settings.ACTION_HOME_SETTINGS))
    }

    private val homeRoleLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            if (isDefaultHome()) {
                toast("¡Listo! ZperOS es tu pantalla de inicio")
            } else {
                // Algunos teléfonos (p. ej. Samsung) solo lo permiten desde Ajustes.
                startSafe(Intent(Settings.ACTION_HOME_SETTINGS))
            }
            defaultBanner.visibility = if (isDefaultHome()) View.GONE else View.VISIBLE
        }

    private fun makeList(adapter: TileAdapter) = RecyclerView(this).apply {
        layoutManager = GridLayoutManager(context, TileAdapter.SPANS).apply {
            spanSizeLookup = adapter.spanLookup
        }
        this.adapter = adapter
        clipToPadding = false
        setPadding(0, 0, 0, dp(16))
        overScrollMode = View.OVER_SCROLL_NEVER
        isVerticalScrollBarEnabled = false
    }

    /** La losa del reloj: mismo color que la barra de arriba del teléfono. */
    private fun buildHeader(): View {
        val fg = Ui.onColor(palette.top)
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.BOTTOM
            background = Ui.slabBottom(palette.top, dp(30).toFloat())
            setPadding(dp(18), dp(6), dp(16), dp(14))
        }
        row.addView(TextClock(this).apply {
            format24Hour = "HH:mm"
            format12Hour = "h:mm"
            style(74f, palette.clock, Ui.HEAVY, -0.03f)
            setOnClickListener { showCover() }
        }, LinearLayout.LayoutParams(0, -2, 1f))

        val side = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.END
        }
        side.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(TextView(context).apply {
                text = "🤖"
                textSize = 22f
                setPadding(dp(10), dp(4), dp(6), dp(8))
                contentDescription = "Zper AI"
                setOnClickListener { openZperAi() }
            })
            addView(TextView(context).apply {
                text = "🎨"
                textSize = 22f
                setPadding(dp(6), dp(4), dp(4), dp(8))
                contentDescription = "Personalizar colores"
                setOnClickListener { openThemes() }
            })
        })
        side.addView(TextClock(this).apply {
            format24Hour = "EEE d MMM"
            format12Hour = "EEE d MMM"
            style(15f, fg, Ui.HEAVY)
            gravity = Gravity.END
        })
        infoText = TextView(this).apply {
            style(12f, Ui.alpha(fg, 0xAA), Ui.BOLD)
            gravity = Gravity.END
            setPadding(0, dp(4), 0, dp(8))
        }
        side.addView(infoText)
        row.addView(side)
        return row
    }

    private fun buildSearch(): View {
        val bg = palette.search
        val fg = Ui.onColor(bg)
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = Ui.slab(bg, dp(28).toFloat(), topOnly = false)
            setPadding(dp(18), 0, dp(6), 0)
            layoutParams = LinearLayout.LayoutParams(-1, dp(56)).apply {
                setMargins(dp(14), dp(10), dp(14), dp(14))
            }
        }
        bar.addView(ImageView(this).apply {
            setImageResource(R.drawable.ic_search)
            imageTintList = ColorStateList.valueOf(fg)
        }, LinearLayout.LayoutParams(dp(22), dp(22)))

        search = EditText(this).apply {
            background = null
            hint = "Busca apps o pregúntale a Zper…"
            setHintTextColor(Ui.alpha(fg, 0x88))
            setTextColor(fg)
            textSize = 16f
            typeface = Ui.BOLD
            maxLines = 1
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            imeOptions = EditorInfo.IME_ACTION_GO or EditorInfo.IME_FLAG_NO_EXTRACT_UI
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
            setPadding(dp(12), 0, 0, 0)
        }
        bar.addView(search, LinearLayout.LayoutParams(0, -1, 1f))

        clearSearch = TextView(this).apply {
            text = "✕"
            gravity = Gravity.CENTER
            style(16f, fg, Ui.HEAVY)
            visibility = View.GONE
            setOnClickListener { search.setText("") }
        }
        bar.addView(clearSearch, LinearLayout.LayoutParams(dp(40), dp(40)))

        bar.addView(ImageView(this).apply {
            setImageResource(R.drawable.ic_mic)
            imageTintList = ColorStateList.valueOf(fg)
            scaleType = ImageView.ScaleType.CENTER
            background = Ui.ripple(fg, dp(21).toFloat(), null)
            contentDescription = "Hablar"
            setOnClickListener { startVoice() }
        }, LinearLayout.LayoutParams(dp(42), dp(42)))

        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) {
                query = s?.toString().orEmpty()
                clearSearch.visibility = if (query.isEmpty()) View.GONE else View.VISIBLE
                renderSearch()
            }
        })
        search.setOnEditorActionListener { _, id, _ ->
            if (id == EditorInfo.IME_ACTION_GO || id == EditorInfo.IME_ACTION_DONE) {
                runBest(); true
            } else {
                false
            }
        }
        return bar
    }

    /** Crea las losas apiladas. Solo se muestran las que tienen apps (Juegos, Sistema y A–Z siempre). */
    private fun buildDrawers() {
        drawersColumn.removeAllViews()
        drawerViews.clear()
        val visible = Drawer.entries.filter { d ->
            d == Drawer.JUEGOS || d == Drawer.SISTEMA || d == Drawer.AZ || apps.any { it.drawer == d }
        }
        if (openDrawer !in visible) openDrawer = Drawer.JUEGOS
        val overlap = dp(26)
        visible.forEachIndexed { i, d ->
            val color = palette.slab(d)
            val fg = Ui.onColor(color)
            val last = i == visible.lastIndex
            val container = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                background = Ui.slab(color, dp(30).toFloat())
                setPadding(dp(12), 0, dp(12), if (last) 0 else overlap)
                elevation = 0f
            }
            val header = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(10), dp(18), dp(6), dp(14))
                isClickable = true
                setOnClickListener { selectDrawer(d) }
            }
            header.addView(TextView(this).apply {
                text = d.title
                style(23f, fg, Ui.HEAVY, -0.02f)
            }, LinearLayout.LayoutParams(0, -2, 1f))
            val meta = TextView(this).apply { style(12f, Ui.alpha(fg, 0xCC), Ui.BOLD) }
            header.addView(meta)
            val icons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            header.addView(icons)
            container.addView(header)
            drawersColumn.addView(container, LinearLayout.LayoutParams(-1, -2).apply {
                if (i > 0) topMargin = -overlap
            })
            drawerViews[d] = DrawerViews(d, container, meta, icons, color)
        }
    }

    private fun selectDrawer(d: Drawer) {
        if (d == openDrawer) {
            if (d == Drawer.AZ && azLetter != null) openLetter(null)
            drawerList.smoothScrollToPosition(0)
            return
        }
        drawersColumn.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        openDrawer = d
        azLetter = null
        prefs().edit().putInt("open", d.ordinal).apply()
        layoutDrawers()
    }

    /** La losa abierta ocupa el espacio libre; las demás quedan como bandas. */
    private fun layoutDrawers() {
        (drawerList.parent as? ViewGroup)?.removeView(drawerList)
        for ((d, v) in drawerViews) {
            val lp = v.container.layoutParams as LinearLayout.LayoutParams
            val open = d == openDrawer
            lp.height = if (open) 0 else ViewGroup.LayoutParams.WRAP_CONTENT
            lp.weight = if (open) 1f else 0f
            v.container.layoutParams = lp
            if (open) {
                v.container.addView(drawerList, LinearLayout.LayoutParams(-1, 0, 1f))
                drawerAdapter.submit(tilesFor(d), Ui.onColor(v.color))
                drawerList.scrollToPosition(0)
            }
            fillHeader(v)
        }
    }

    private fun fillHeader(v: DrawerViews) {
        val list = appsIn(v.drawer)
        v.meta.text = when (v.drawer) {
            Drawer.JUEGOS -> (if (list.isEmpty()) "sin juegos" else "🎮 ${list.size}") + " · " + GameBooster.thermalLabel(this)
            Drawer.AZ -> azLetter?.let { "letra $it" } ?: "${apps.size} apps"
            else -> "${list.size}"
        }
        v.icons.removeAllViews()
        if (v.drawer == openDrawer) return
        for (app in list.take(3)) {
            v.icons.addView(ImageView(this).apply { setImageDrawable(app.icon) },
                LinearLayout.LayoutParams(dp(24), dp(24)).apply { marginStart = dp(8) })
        }
    }

    private fun appsIn(d: Drawer): List<AppItem> = when (d) {
        Drawer.AZ -> apps
        Drawer.JUEGOS -> apps.filter { it.drawer == d }.sortedByDescending { usage.count(it) }
        else -> apps.filter { it.drawer == d }
    }

    private fun tilesFor(d: Drawer): List<Tile> = when (d) {
        Drawer.JUEGOS -> listOf<Tile>(
            Tile.Card("🤖", "Zper AI", "Tu compa gamer con Claude: tips, builds y retos") { openZperAi() },
        ) + turboTiles() + gameTiles()
        else -> tilesForOther(d)
    }

    /** Botones del ⚡ Modo Turbo dentro de la losa Juegos. */
    private fun turboTiles(): List<Tile> {
        val tiles = ArrayList<Tile>()
        tiles += Tile.Action("⚡", "Turbo ahora") { runTurbo(null) }
        if (!GameBooster.canUseDnd(this)) {
            tiles += Tile.Action("🔕", "Permitir No molestar") { startSafe(GameBooster.dndPermissionIntent()) }
        }
        GameBooster.samsungGameLauncherIntent(this)?.let { intent ->
            tiles += Tile.Action("🚀", "Game Booster") { startSafe(intent) }
        }
        if (getSystemService(android.os.PowerManager::class.java)?.isPowerSaveMode == true) {
            tiles += Tile.Action("🔋", "Quitar ahorro") { startSafe(Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS)) }
        }
        return tiles
    }

    private fun gameTiles(): List<Tile> {
        val games = appsIn(Drawer.JUEGOS)
        return if (games.isEmpty()) {
                listOf<Tile>(
                    Tile.Header("Aún no hay juegos instalados"),
                    Tile.Action("🛒", "Buscar juegos") {
                        startSafe(Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=juegos&c=apps")))
                    },
                )
            } else {
                games.map { g ->
                    val n = usage.count(g)
                    Tile.App(g, if (n > 0) "▶ $n ${if (n == 1) "PARTIDA" else "PARTIDAS"}" else "NUEVO")
                }
            }
    }

    private fun tilesForOther(d: Drawer): List<Tile> = when (d) {
        Drawer.SISTEMA -> listOf<Tile>(
            Tile.Header("Rápido"),
            Tile.Action("🔦", "Linterna") { setTorch(null) },
            Tile.Action("📶", "Wi‑Fi") { startSafe(Intent(Settings.ACTION_WIFI_SETTINGS)) },
            Tile.Action("ᛒ", "Bluetooth") { startSafe(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)) },
            Tile.Action("☀", "Brillo") { startSafe(Intent(Settings.ACTION_DISPLAY_SETTINGS)) },
            Tile.Action("🎮", "Modo juego") { startSafe(Intent("android.settings.ZEN_MODE_SETTINGS")) },
            Tile.Action("🤖", "Zper AI") { openZperAi() },
            Tile.Action("🎨", "Colores") { openThemes() },
            Tile.Action("🏠", "Predeterminado") { requestDefaultHome() },
            Tile.Action("⚙", "Ajustes") { startSafe(Intent(Settings.ACTION_SETTINGS)) },
            Tile.Action("🔒", "Portada") { showCover() },
        ) + appsIn(d).let { list ->
            if (list.isEmpty()) emptyList<Tile>() else listOf<Tile>(Tile.Header("Apps del sistema")) + list.map { Tile.App(it) }
        }
        Drawer.AZ -> {
            val letter = azLetter
            if (letter == null) {
                val counts = apps.groupingBy { it.letter }.eachCount()
                AppItem.LETTERS.map { Tile.Letter(it, counts[it] ?: 0) }
            } else {
                listOf<Tile>(Tile.Action("‹", "Letras") { openLetter(null) }) +
                    apps.filter { it.letter == letter }.map { Tile.App(it) }
            }
        }
        else -> appsIn(d).map { Tile.App(it) }
    }

    private fun openLetter(letter: String?) {
        azLetter = letter
        if (openDrawer != Drawer.AZ) {
            openDrawer = Drawer.AZ
        }
        layoutDrawers()
    }

    private fun renderSearch() {
        val searching = query.isNotBlank()
        drawersColumn.visibility = if (searching) View.GONE else View.VISIBLE
        resultsSlab.visibility = if (searching) View.VISIBLE else View.GONE
        if (!searching) {
            actions = emptyList()
            return
        }
        val q = Assistant.appQuery(query)
        val found = apps.filter { it.searchKey.contains(q) }
            .sortedBy { if (it.searchKey.startsWith(q)) 0 else 1 }
        actions = assistant.suggest(query, apps, found.isNotEmpty())
        val tiles = ArrayList<Tile>()
        actions.forEach { a -> tiles += Tile.Card(a.icon, a.title, a.subtitle) { runAction(a) } }
        val question = query.trim()
        tiles += Tile.Card("🤖", "Preguntar a Zper AI", "“$question”") {
            openZperAi(question)
            mainHandler.postDelayed({ resetHome() }, 400)
        }
        tiles += Tile.Header(if (found.isEmpty()) "Sin apps con ese nombre" else "Apps · ${found.size}")
        found.forEach { tiles += Tile.App(it) }
        resultsAdapter.submit(tiles, Ui.onColor(palette.slab(Drawer.AZ)))
        resultsList.scrollToPosition(0)
    }

    private fun resetHome() {
        hideKeyboard()
        search.clearFocus()
        if (search.text.isNotEmpty()) search.setText("")
        if (azLetter != null) openLetter(null)
        drawerList.scrollToPosition(0)
    }

    private fun showCover() {
        val c = cover ?: return
        hideKeyboard()
        c.setInfo(infoLine())
        c.reset()
        setBars(palette.slab(Drawer.JUEGOS), palette.slab(Drawer.VER))
    }

    private fun hideCover() {
        cover?.visibility = View.GONE
        setBars(palette.top, palette.slab(drawerViews.keys.lastOrNull() ?: Drawer.AZ))
    }

    private fun setBars(top: Int, bottom: Int) {
        @Suppress("DEPRECATION")
        window.statusBarColor = top
        @Suppress("DEPRECATION")
        window.navigationBarColor = bottom
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = Ui.onColor(top) != Ui.onColor(0xFF000000.toInt())
            isAppearanceLightNavigationBars = Ui.onColor(bottom) != Ui.onColor(0xFF000000.toInt())
        }
    }

    private fun updateInfo() {
        infoText.text = infoLine().replace(" · ", "\n")
        cover?.setInfo(infoLine())
    }

    private fun infoLine(): String {
        val bm = getSystemService(BatteryManager::class.java)
        val level = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        val charging = bm?.isCharging == true
        val battery = if (level in 0..100) "${if (charging) "⚡" else "🔋"} $level%" else ""
        val next = getSystemService(AlarmManager::class.java)?.nextAlarmClock?.triggerTime
        val alarm = if (next != null) "⏰ " + DateFormat.getTimeFormat(this).format(Date(next)) else "Sin alarmas"
        return listOf(battery, alarm).filter { it.isNotEmpty() }.joinToString(" · ")
    }

    // ---------------------------------------------------------------- Datos

    private fun reload() {
        executor.execute {
            val loaded = loadApps()
            mainHandler.post {
                apps = loaded
                buildDrawers()
                layoutDrawers()
                if (cover?.visibility != View.VISIBLE) hideCover()
                renderSearch()
            }
        }
    }

    private fun loadApps(): List<AppItem> {
        val density = resources.displayMetrics.densityDpi
        val result = ArrayList<AppItem>()
        for (user in launcherApps.profiles) {
            for (info in launcherApps.getActivityList(null, user)) {
                if (info.componentName.packageName == packageName) continue
                val icon = try {
                    info.getBadgedIcon(density)
                } catch (e: Exception) {
                    info.getIcon(density)
                }
                val label = info.label.toString()
                val pkgName = info.componentName.packageName
                val drawer = if (hasOverride(pkgName)) drawerOverride(pkgName)
                    else Drawer.classify(info.applicationInfo, pkgName, label)
                result += AppItem(label, info.componentName, user, icon, drawer)
            }
        }
        val collator = Collator.getInstance(Locale("es")).apply { strength = Collator.PRIMARY }
        result.sortWith { a, b -> collator.compare(a.label, b.label) }
        return result
    }

    // --------------------------------------------------------------- Acciones

    private fun runBest() {
        actions.firstOrNull()?.let { runAction(it); return }
        resultsAdapter.items.firstNotNullOfOrNull { it as? Tile.App }?.let { launch(it.app, search) }
    }

    private fun runAction(action: AssistantAction) {
        action.run()
        if (!action.keepOpen) mainHandler.postDelayed({ resetHome() }, 400)
    }

    private fun launch(app: AppItem, source: View) {
        if (app.drawer == Drawer.JUEGOS && GameBooster.autoTurbo(this) && !turboRunning) {
            runTurbo(app, source)
            return
        }
        startApp(app, source)
    }

    private lateinit var rootView: FrameLayout
    private var turboRunning = false

    /**
     * ⚡ Turbo: pantalla gamer de 1 segundo mientras prepara el teléfono;
     * luego abre el juego (si hay uno).
     */
    private fun runTurbo(game: AppItem?, source: View? = null) {
        if (turboRunning) return
        turboRunning = true
        hideKeyboard()
        val color = palette.slab(Drawer.JUEGOS)
        val fg = Ui.onColor(color)
        val title = TextView(this).apply {
            text = "⚡ TURBO"
            style(64f, fg, Ui.HEAVY, -0.02f)
        }
        val sub = TextView(this).apply {
            text = game?.let { "Preparando ${it.label}…" } ?: "Optimizando…"
            style(16f, fg, Ui.HEAVY)
            setPadding(0, dp(10), 0, dp(18))
        }
        val stats = TextView(this).apply {
            style(15f, Ui.alpha(fg, 0xDD), Ui.BOLD)
            setLineSpacing(0f, 1.3f)
        }
        val overlay = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(color)
            setPadding(dp(28), 0, dp(28), 0)
            isClickable = true
            addView(title)
            addView(sub)
            addView(stats)
            alpha = 0f
        }
        rootView.addView(overlay, FrameLayout.LayoutParams(-1, -1))
        overlay.animate().alpha(1f).setDuration(150).start()
        overlay.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)

        val others = apps.filter { it.drawer != Drawer.JUEGOS }.map { it.component.packageName }
        val ctx = applicationContext
        executor.execute {
            val report = GameBooster.boost(ctx, game?.component?.packageName, others)
            mainHandler.post {
                stats.text = buildString {
                    append("🧠 RAM libre: ${report.freeRamMb} MB de ${report.totalRamMb} MB\n")
                    if (report.closedApps > 0) append("🧹 ${report.closedApps} apps en segundo plano cerradas\n")
                    append(if (report.dndOn) "🔕 No molestar: ACTIVADO\n" else "🔔 No molestar: sin permiso (actívalo en la losa Juegos)\n")
                    append("🌡️ Temperatura: ${GameBooster.thermalLabel(ctx)}\n")
                    report.warnings.forEach { append("$it\n") }
                    if (report.warnings.isEmpty()) append("✅ Todo listo para jugar")
                }
                sub.text = game?.let { "¡${it.label} listo! GG 🎮" } ?: "Turbo aplicado"
                mainHandler.postDelayed({
                    if (game != null) startApp(game, source ?: rootView)
                    mainHandler.postDelayed({
                        rootView.removeView(overlay)
                        turboRunning = false
                    }, if (game != null) 700L else 1800L)
                }, if (game != null) 1100L else 0L)
            }
        }
    }

    private fun startApp(app: AppItem, source: View) {
        val bounds = Rect().also { source.getGlobalVisibleRect(it) }
        try {
            launcherApps.startMainActivity(app.component, app.user, bounds, null)
            usage.record(app)
            mainHandler.postDelayed({
                resetHome()
                if (openDrawer == Drawer.JUEGOS) layoutDrawers() // actualiza las partidas
            }, 400)
        } catch (e: Exception) {
            toast("No se pudo abrir la app")
        }
    }

    private fun openThemes() = startActivity(Intent(this, ThemeActivity::class.java))

    private fun startVoice() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_PROMPT, "Habla con Zper…")
        try {
            voiceLauncher.launch(intent)
        } catch (e: ActivityNotFoundException) {
            toast("El reconocimiento de voz no está disponible")
        }
    }

    private fun showAppMenu(app: AppItem, anchor: View) {
        PopupMenu(this, anchor).apply {
            if (app.drawer != Drawer.JUEGOS) menu.add(0, 10, 0, "🎮 Mover a Juegos")
            val sub = menu.addSubMenu(0, 11, 1, "📂 Mover a otra losa…")
            Drawer.entries.filter { it != Drawer.AZ && it != app.drawer && it != Drawer.JUEGOS }
                .forEachIndexed { i, d -> sub.add(0, 100 + d.ordinal, i, "${d.glyph} ${d.title}") }
            if (app.drawer != null) sub.add(0, 99, 99, "Quitar de ${app.drawer.title} (solo A–Z)")
            menu.add(0, 1, 2, "Información de la app")
            menu.add(0, 2, 3, "Desinstalar")
            setOnMenuItemClickListener { item ->
                val pkg = app.component.packageName
                when (item.itemId) {
                    1 -> launcherApps.startAppDetailsActivity(app.component, app.user, null, null)
                    2 -> startSafe(Intent(Intent.ACTION_DELETE, Uri.parse("package:$pkg")))
                    10 -> setDrawerOverride(pkg, Drawer.JUEGOS)
                    99 -> setDrawerOverride(pkg, null)
                    in 100..199 -> Drawer.entries.getOrNull(item.itemId - 100)?.let { setDrawerOverride(pkg, it) }
                }
                true
            }
            show()
        }
    }

    // ------------------------------------------------ Losa elegida a mano

    private fun overrides() = getSharedPreferences("drawer_overrides", Context.MODE_PRIVATE)

    /** Losa que el usuario eligió a mano para una app (o null si no eligió). "NONE" = solo A–Z. */
    private fun drawerOverride(pkg: String): Drawer? {
        val v = overrides().getString(pkg, null) ?: return null
        return Drawer.entries.firstOrNull { it.name == v }
    }

    private fun hasOverride(pkg: String) = overrides().contains(pkg)

    private fun setDrawerOverride(pkg: String, drawer: Drawer?) {
        overrides().edit().putString(pkg, drawer?.name ?: "NONE").apply()
        toast(if (drawer != null) "Movida a ${drawer.title} ${drawer.glyph}" else "Ahora solo aparece en Todas A–Z")
        reload()
    }

    private fun hideKeyboard() {
        getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(search.windowToken, 0)
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    // ------------------------------------------------------- AssistantHost

    override fun launchApp(app: AppItem) = launch(app, search)

    override fun startSafe(intent: Intent) {
        try {
            startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            toast("No se pudo abrir")
        } catch (e: SecurityException) {
            toast("No se pudo abrir")
        }
    }

    override fun setTorch(on: Boolean?) {
        val cm = getSystemService(CameraManager::class.java)
        try {
            val id = cm.cameraIdList.firstOrNull {
                cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            } ?: run {
                toast("Este teléfono no tiene linterna")
                return
            }
            val target = on ?: !torchOn
            cm.setTorchMode(id, target)
            torchOn = target
        } catch (e: Exception) {
            toast("No se pudo usar la linterna")
        }
    }

    override fun copyText(text: String) {
        getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("ZperOS", text))
        toast("Copiado")
    }

    override fun webSearch(text: String) {
        try {
            startActivity(
                Intent(Intent.ACTION_WEB_SEARCH)
                    .putExtra(SearchManager.QUERY, text)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } catch (e: ActivityNotFoundException) {
            startSafe(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=" + Uri.encode(text))))
        }
    }
}
