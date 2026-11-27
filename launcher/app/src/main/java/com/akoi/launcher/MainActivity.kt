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
import android.content.pm.LauncherApps
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
    }

    override fun onResume() {
        super.onResume()
        if (Themes.stamp(this) != themeStamp) {
            recreate() // cambiaron los colores en "Personalizar"
            return
        }
        updateInfo()
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
        val root = FrameLayout(this).apply {
            setBackgroundColor(palette.bg)
            fitsSystemWindows = true
        }
        val home = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(home, FrameLayout.LayoutParams(-1, -1))

        home.addView(buildHeader())
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

    private fun buildHeader(): View {
        val fg = Ui.onColor(palette.bg)
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.BOTTOM
            setPadding(dp(18), dp(10), dp(16), 0)
        }
        row.addView(TextClock(this).apply {
            format24Hour = "HH:mm"
            format12Hour = "h:mm"
            style(74f, palette.clock, Ui.HEAVY, -0.05f)
            setOnClickListener { showCover() }
        }, LinearLayout.LayoutParams(0, -2, 1f))

        val side = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.END
        }
        side.addView(TextView(this).apply {
            text = "🎨"
            textSize = 22f
            setPadding(dp(10), dp(4), dp(4), dp(8))
            contentDescription = "Personalizar colores"
            setOnClickListener { openThemes() }
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
            Drawer.JUEGOS -> if (list.isEmpty()) "sin juegos" else "🎮 ${list.size}"
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
        Drawer.JUEGOS -> {
            val games = appsIn(d)
            if (games.isEmpty()) {
                listOf(
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
        Drawer.SISTEMA -> listOf<Tile>(
            Tile.Header("Rápido"),
            Tile.Action("🔦", "Linterna") { setTorch(null) },
            Tile.Action("📶", "Wi‑Fi") { startSafe(Intent(Settings.ACTION_WIFI_SETTINGS)) },
            Tile.Action("ᛒ", "Bluetooth") { startSafe(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)) },
            Tile.Action("☀", "Brillo") { startSafe(Intent(Settings.ACTION_DISPLAY_SETTINGS)) },
            Tile.Action("🎮", "Modo juego") { startSafe(Intent("android.settings.ZEN_MODE_SETTINGS")) },
            Tile.Action("🎨", "Colores") { openThemes() },
            Tile.Action("🏠", "Launcher") { startSafe(Intent(Settings.ACTION_HOME_SETTINGS)) },
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
        setBars(palette.bg, palette.slab(drawerViews.keys.lastOrNull() ?: Drawer.AZ))
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
                val drawer = Drawer.classify(info.applicationInfo, info.componentName.packageName)
                result += AppItem(info.label.toString(), info.componentName, user, icon, drawer)
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
            menu.add(0, 1, 0, "Información de la app")
            menu.add(0, 2, 1, "Desinstalar")
            setOnMenuItemClickListener { item ->
                when (item.itemId) {
                    1 -> launcherApps.startAppDetailsActivity(app.component, app.user, null, null)
                    2 -> startSafe(Intent(Intent.ACTION_DELETE, Uri.parse("package:${app.component.packageName}")))
                }
                true
            }
            show()
        }
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
