package com.akoi.launcher

import android.app.SearchManager
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.LauncherApps
import android.graphics.Rect
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.UserHandle
import android.provider.Settings
import android.speech.RecognizerIntent
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.text.Collator
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : ComponentActivity(), AssistantHost {

    /** Qué está mostrando la pantalla principal. */
    private sealed class Mode {
        object Letters : Mode()
        object All : Mode()
        data class Letter(val letter: String) : Mode()
        data class Search(val query: String) : Mode()
    }

    private lateinit var launcherApps: LauncherApps
    private lateinit var usage: UsageStore
    private lateinit var search: EditText
    private lateinit var clearSearch: TextView
    private lateinit var greeting: TextView
    private lateinit var hero: View
    private lateinit var orb: OrbView
    private lateinit var assistantBox: LinearLayout
    private lateinit var suggestionsBox: View
    private lateinit var suggestionsRow: LinearLayout
    private lateinit var sectionTitle: TextView
    private lateinit var actionButton: TextView
    private lateinit var lettersGrid: RecyclerView
    private lateinit var appsList: RecyclerView
    private lateinit var emptyView: TextView

    private val assistant = Assistant(this)
    private val letterAdapter = LetterAdapter { letter -> setMode(Mode.Letter(letter)) }
    private val appAdapter = AppAdapter({ app, v -> launch(app, v) }, ::showAppMenu)

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    private var apps: List<AppItem> = emptyList()
    private var mode: Mode = Mode.Letters
    private var actions: List<AssistantAction> = emptyList()
    private var torchOn = false

    private val voiceLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            orb.setListening(false)
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        launcherApps = getSystemService(LauncherApps::class.java)
        usage = UsageStore(this)

        search = findViewById(R.id.search)
        clearSearch = findViewById(R.id.clearSearch)
        greeting = findViewById(R.id.greeting)
        hero = findViewById(R.id.hero)
        orb = findViewById(R.id.orb)
        assistantBox = findViewById(R.id.assistantBox)
        suggestionsBox = findViewById(R.id.suggestionsBox)
        suggestionsRow = findViewById(R.id.suggestionsRow)
        sectionTitle = findViewById(R.id.sectionTitle)
        actionButton = findViewById(R.id.actionButton)
        lettersGrid = findViewById(R.id.lettersGrid)
        appsList = findViewById(R.id.appsList)
        emptyView = findViewById(R.id.emptyView)

        lettersGrid.layoutManager = GridLayoutManager(this, LETTER_COLUMNS)
        lettersGrid.adapter = letterAdapter

        val appsLayout = GridLayoutManager(this, APP_COLUMNS)
        appsLayout.spanSizeLookup = object : GridLayoutManager.SpanSizeLookup() {
            override fun getSpanSize(position: Int): Int =
                if (appAdapter.getItemViewType(position) == AppAdapter.TYPE_HEADER) APP_COLUMNS else 1
        }
        appsList.layoutManager = appsLayout
        appsList.adapter = appAdapter

        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val q = s?.toString().orEmpty()
                clearSearch.visibility = if (q.isEmpty()) View.GONE else View.VISIBLE
                setMode(if (q.isBlank()) Mode.Letters else Mode.Search(q))
            }
        })
        search.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO || actionId == EditorInfo.IME_ACTION_DONE) {
                runBest()
                true
            } else {
                false
            }
        }
        clearSearch.setOnClickListener { search.setText("") }

        orb.setOnClickListener { startVoice() }
        findViewById<ImageButton>(R.id.micButton).setOnClickListener { startVoice() }

        actionButton.setOnClickListener {
            if (mode is Mode.Letters) setMode(Mode.All) else goHome()
        }
        findViewById<ImageButton>(R.id.menuButton).setOnClickListener(::showMainMenu)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            // Un launcher nunca se cierra con "atrás": solo vuelve al inicio.
            override fun handleOnBackPressed() = goHome()
        })

        launcherApps.registerCallback(packageCallback, mainHandler)
        render()
        reload()
    }

    override fun onResume() {
        super.onResume()
        updateGreeting()
        if (mode is Mode.Letters) renderSuggestions()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Pulsar "Inicio" estando en el launcher vuelve al inicio.
        if (Intent.ACTION_MAIN == intent.action) goHome()
    }

    override fun onDestroy() {
        launcherApps.unregisterCallback(packageCallback)
        executor.shutdownNow()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- Datos

    private fun reload() {
        executor.execute {
            val loaded = loadApps()
            mainHandler.post {
                apps = loaded
                render()
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
                result += AppItem(info.label.toString(), info.componentName, user, icon)
            }
        }
        val collator = Collator.getInstance(Locale("es")).apply { strength = Collator.PRIMARY }
        result.sortWith { a, b -> collator.compare(a.label, b.label) }
        return result
    }

    // -------------------------------------------------------------- Pantalla

    private fun setMode(newMode: Mode) {
        if (newMode == mode) return
        mode = newMode
        render()
        appsList.scrollToPosition(0)
    }

    private fun goHome() {
        hideKeyboard()
        search.clearFocus()
        if (search.text.isNotEmpty()) search.setText("") // dispara setMode(Letters)
        setMode(Mode.Letters)
    }

    private fun render() {
        val home = mode is Mode.Letters
        hero.visibility = if (home) View.VISIBLE else View.GONE
        suggestionsBox.visibility = if (home && apps.isNotEmpty()) View.VISIBLE else View.GONE
        actionButton.text = getString(if (home) R.string.all_apps else R.string.back)
        actions = emptyList()

        when (val m = mode) {
            Mode.Letters -> {
                sectionTitle.text = getString(R.string.letters_title)
                letterAdapter.submit(apps.groupingBy { it.letter }.eachCount())
                renderSuggestions()
                show(letters = true, empty = false)
            }
            Mode.All -> {
                sectionTitle.text = getString(R.string.all_apps_title)
                appAdapter.submit(withHeaders(apps))
                show(letters = false, empty = apps.isEmpty())
            }
            is Mode.Letter -> {
                val list = apps.filter { it.letter == m.letter }
                sectionTitle.text = getString(R.string.letter_title, m.letter)
                appAdapter.submit(list.map { Row.App(it) })
                show(letters = false, empty = list.isEmpty())
            }
            is Mode.Search -> {
                val q = Assistant.appQuery(m.query)
                val list = apps.filter { it.searchKey.contains(q) }
                    .sortedBy { if (it.searchKey.startsWith(q)) 0 else 1 } // estable: mantiene A–Z
                actions = assistant.suggest(m.query, apps, list.isNotEmpty())
                sectionTitle.text = getString(R.string.results_title) + " (${list.size})"
                appAdapter.submit(list.map { Row.App(it) })
                show(letters = false, empty = list.isEmpty() && actions.isEmpty())
            }
        }
        renderActions()
    }

    private fun renderActions() {
        assistantBox.removeAllViews()
        assistantBox.visibility = if (actions.isEmpty()) View.GONE else View.VISIBLE
        val inflater = LayoutInflater.from(this)
        for (action in actions) {
            val v = inflater.inflate(R.layout.item_action, assistantBox, false)
            v.findViewById<TextView>(R.id.actionIcon).text = action.icon
            v.findViewById<TextView>(R.id.actionTitle).text = action.title
            v.findViewById<TextView>(R.id.actionSubtitle).text = action.subtitle
            v.setOnClickListener { runAction(action) }
            assistantBox.addView(v)
        }
    }

    private fun renderSuggestions() {
        suggestionsRow.removeAllViews()
        val inflater = LayoutInflater.from(this)
        for (app in usage.suggestions(apps, SUGGESTIONS)) {
            val v = inflater.inflate(R.layout.item_app, suggestionsRow, false)
            v.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            v.findViewById<ImageView>(R.id.icon).setImageDrawable(app.icon)
            v.findViewById<TextView>(R.id.label).text = app.label
            v.contentDescription = app.label
            v.setOnClickListener { launch(app, it) }
            v.setOnLongClickListener { showAppMenu(app, it); true }
            suggestionsRow.addView(v)
        }
    }

    private fun updateGreeting() {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        greeting.text = getString(
            when (hour) {
                in 5..11 -> R.string.morning
                in 12..19 -> R.string.afternoon
                else -> R.string.night
            }
        )
    }

    private fun withHeaders(list: List<AppItem>): List<Row> {
        val rows = ArrayList<Row>(list.size + 30)
        var current: String? = null
        for (app in list) {
            if (app.letter != current) {
                current = app.letter
                rows += Row.Header(app.letter)
            }
            rows += Row.App(app)
        }
        return rows
    }

    private fun show(letters: Boolean, empty: Boolean) {
        lettersGrid.visibility = if (letters) View.VISIBLE else View.GONE
        appsList.visibility = if (!letters && !empty) View.VISIBLE else View.GONE
        emptyView.visibility = if (!letters && empty) View.VISIBLE else View.GONE
    }

    // --------------------------------------------------------------- Acciones

    /** Enter o voz: ejecuta la mejor respuesta del asistente, o abre la primera app. */
    private fun runBest() {
        val action = actions.firstOrNull()
        if (action != null) {
            runAction(action)
            return
        }
        appAdapter.rows.firstNotNullOfOrNull { it as? Row.App }?.let { launch(it.app, search) }
    }

    private fun runAction(action: AssistantAction) {
        action.run()
        if (!action.keepOpen) mainHandler.postDelayed({ goHome() }, 400)
    }

    private fun launch(app: AppItem, source: View) {
        val bounds = Rect().also { source.getGlobalVisibleRect(it) }
        try {
            launcherApps.startMainActivity(app.component, app.user, bounds, null)
            usage.record(app)
            // Al volver al launcher, empezar limpio.
            mainHandler.postDelayed({ goHome() }, 400)
        } catch (e: Exception) {
            toast(R.string.cant_open)
        }
    }

    private fun startVoice() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_PROMPT, getString(R.string.voice_prompt))
        try {
            orb.setListening(true)
            voiceLauncher.launch(intent)
        } catch (e: ActivityNotFoundException) {
            orb.setListening(false)
            toast(R.string.no_voice)
        }
    }

    private fun showAppMenu(app: AppItem, anchor: View) {
        PopupMenu(this, anchor).apply {
            menu.add(0, 1, 0, R.string.app_info)
            menu.add(0, 2, 1, R.string.uninstall)
            setOnMenuItemClickListener { item ->
                when (item.itemId) {
                    1 -> launcherApps.startAppDetailsActivity(app.component, app.user, null, null)
                    2 -> startSafe(
                        Intent(Intent.ACTION_DELETE, Uri.parse("package:${app.component.packageName}"))
                    )
                }
                true
            }
            show()
        }
    }

    private fun showMainMenu(anchor: View) {
        PopupMenu(this, anchor).apply {
            menu.add(0, 1, 0, R.string.set_default)
            menu.add(0, 2, 1, R.string.system_settings)
            setOnMenuItemClickListener { item ->
                when (item.itemId) {
                    1 -> startSafe(Intent(Settings.ACTION_HOME_SETTINGS))
                    2 -> startSafe(Intent(Settings.ACTION_SETTINGS))
                }
                true
            }
            show()
        }
    }

    private fun hideKeyboard() {
        getSystemService(InputMethodManager::class.java)
            ?.hideSoftInputFromWindow(search.windowToken, 0)
    }

    private fun toast(res: Int) = Toast.makeText(this, res, Toast.LENGTH_SHORT).show()

    // ------------------------------------------------------- AssistantHost

    override fun launchApp(app: AppItem) = launch(app, search)

    override fun startSafe(intent: Intent) {
        try {
            startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            toast(R.string.cant_open)
        } catch (e: SecurityException) {
            toast(R.string.cant_open)
        }
    }

    override fun setTorch(on: Boolean?) {
        val cm = getSystemService(CameraManager::class.java)
        try {
            val id = cm.cameraIdList.firstOrNull {
                cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            }
            if (id == null) {
                toast(R.string.no_torch)
                return
            }
            val target = on ?: !torchOn
            cm.setTorchMode(id, target)
            torchOn = target
        } catch (e: Exception) {
            toast(R.string.no_torch)
        }
    }

    override fun copyText(text: String) {
        getSystemService(ClipboardManager::class.java)
            ?.setPrimaryClip(ClipData.newPlainText("Akoi", text))
        toast(R.string.copied)
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

    companion object {
        private const val APP_COLUMNS = 4
        private const val LETTER_COLUMNS = 7
        private const val SUGGESTIONS = 4
    }
}
