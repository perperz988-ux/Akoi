package com.akoi.launcher

import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.LauncherApps
import android.graphics.Rect
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.UserHandle
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.ImageButton
import android.widget.PopupMenu
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.text.Collator
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {

    /** Qué está mostrando la pantalla principal. */
    private sealed class Mode {
        object Letters : Mode()
        object All : Mode()
        data class Letter(val letter: String) : Mode()
        data class Search(val query: String) : Mode()
    }

    private lateinit var launcherApps: LauncherApps
    private lateinit var search: EditText
    private lateinit var clearSearch: TextView
    private lateinit var sectionTitle: TextView
    private lateinit var actionButton: TextView
    private lateinit var lettersGrid: RecyclerView
    private lateinit var appsList: RecyclerView
    private lateinit var emptyView: TextView

    private val letterAdapter = LetterAdapter { letter -> setMode(Mode.Letter(letter)) }
    private val appAdapter = AppAdapter(::launch, ::showAppMenu)

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    private var apps: List<AppItem> = emptyList()
    private var mode: Mode = Mode.Letters

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

        search = findViewById(R.id.search)
        clearSearch = findViewById(R.id.clearSearch)
        sectionTitle = findViewById(R.id.sectionTitle)
        actionButton = findViewById(R.id.actionButton)
        lettersGrid = findViewById(R.id.lettersGrid)
        appsList = findViewById(R.id.appsList)
        emptyView = findViewById(R.id.emptyView)

        lettersGrid.layoutManager = GridLayoutManager(this, 5)
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
                // Enter abre el primer resultado
                appAdapter.rows.firstNotNullOfOrNull { it as? Row.App }?.let { launch(it.app, search) }
                true
            } else {
                false
            }
        }
        clearSearch.setOnClickListener { search.setText("") }

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

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Pulsar "Inicio" estando en el launcher vuelve a las letras.
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
        when (val m = mode) {
            Mode.Letters -> {
                sectionTitle.text = getString(R.string.letters_title)
                actionButton.text = getString(R.string.all_apps)
                letterAdapter.submit(apps.groupingBy { it.letter }.eachCount())
                show(letters = true, empty = false)
            }
            Mode.All -> {
                sectionTitle.text = getString(R.string.all_apps_title)
                actionButton.text = getString(R.string.back)
                appAdapter.submit(withHeaders(apps))
                show(letters = false, empty = apps.isEmpty())
            }
            is Mode.Letter -> {
                val list = apps.filter { it.letter == m.letter }
                sectionTitle.text = getString(R.string.letter_title, m.letter)
                actionButton.text = getString(R.string.back)
                appAdapter.submit(list.map { Row.App(it) })
                show(letters = false, empty = list.isEmpty())
            }
            is Mode.Search -> {
                val q = AppItem.normalize(m.query)
                val list = apps.filter { it.searchKey.contains(q) }
                    .sortedBy { if (it.searchKey.startsWith(q)) 0 else 1 } // estable: mantiene A–Z
                sectionTitle.text = getString(R.string.results_title) + " (${list.size})"
                actionButton.text = getString(R.string.back)
                appAdapter.submit(list.map { Row.App(it) })
                show(letters = false, empty = list.isEmpty())
            }
        }
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

    private fun launch(app: AppItem, source: View) {
        val bounds = Rect().also { source.getGlobalVisibleRect(it) }
        try {
            launcherApps.startMainActivity(app.component, app.user, bounds, null)
            // Al volver al launcher, empezar limpio.
            mainHandler.postDelayed({ goHome() }, 400)
        } catch (e: Exception) {
            Toast.makeText(this, R.string.cant_open, Toast.LENGTH_SHORT).show()
        }
    }

    private fun showAppMenu(app: AppItem, anchor: View) {
        PopupMenu(this, anchor).apply {
            menu.add(0, 1, 0, R.string.app_info)
            menu.add(0, 2, 1, R.string.uninstall)
            setOnMenuItemClickListener { item ->
                when (item.itemId) {
                    1 -> launcherApps.startAppDetailsActivity(app.component, app.user, null, null)
                    2 -> safeStart(
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
                    1 -> safeStart(Intent(Settings.ACTION_HOME_SETTINGS))
                    2 -> safeStart(Intent(Settings.ACTION_SETTINGS))
                }
                true
            }
            show()
        }
    }

    private fun safeStart(intent: Intent) {
        try {
            startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, R.string.cant_open, Toast.LENGTH_SHORT).show()
        }
    }

    private fun hideKeyboard() {
        getSystemService(InputMethodManager::class.java)
            ?.hideSoftInputFromWindow(search.windowToken, 0)
    }

    companion object {
        private const val APP_COLUMNS = 4
    }
}
