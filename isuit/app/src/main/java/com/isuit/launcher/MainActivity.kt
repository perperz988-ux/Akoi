package com.isuit.launcher

import android.app.AlarmManager
import android.app.role.RoleManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.LauncherApps
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Rect
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.UserHandle
import android.provider.AlarmClock
import android.provider.Settings
import android.text.format.DateFormat
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.animation.OvershootInterpolator
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
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.text.Collator
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import kotlin.math.roundToInt

/**
 * iSuit: launcher estilo "teléfono de videojuego".
 * - Usa el fondo de pantalla que tengas puesto.
 * - Íconos redondos en cuadrícula, burbuja con el nombre de la app elegida.
 * - Botones de VOLUMEN: subir/bajar = moverte entre apps · mantener = abrir.
 */
class MainActivity : ComponentActivity() {

    class App(
        val label: String,
        val component: ComponentName,
        val user: UserHandle,
        val icon: Drawable,
    )

    /** Algo que se muestra en la cuadrícula: una app propia de iSuit o una app instalada. */
    class Entry(val label: String, val icon: Drawable, val app: App?, val screen: Class<*>?)

    private lateinit var launcherApps: LauncherApps
    private lateinit var phone: LinearLayout
    private lateinit var grid: RecyclerView
    private lateinit var namePill: TextView
    private lateinit var battery: TextView
    private lateinit var todayLine: TextView
    private lateinit var hint: TextView
    private lateinit var defaultBanner: TextView

    private val adapter = IconAdapter()
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    private var installed: List<App> = emptyList()
    private var apps: List<Entry> = emptyList()
    private lateinit var modeButton: TextView

    /** true = apps de iSuit primero; false = tus apps instaladas. */
    private var isuitMode: Boolean
        get() = prefs().getBoolean("isuit_mode", true)
        set(v) { prefs().edit().putBoolean("isuit_mode", v).apply() }
    private var selected = 0
    private var longPressed = false

    private val packageCallback = object : LauncherApps.Callback() {
        override fun onPackageRemoved(p: String?, u: UserHandle?) = reload()
        override fun onPackageAdded(p: String?, u: UserHandle?) = reload()
        override fun onPackageChanged(p: String?, u: UserHandle?) = reload()
        override fun onPackagesAvailable(p: Array<out String>?, u: UserHandle?, r: Boolean) = reload()
        override fun onPackagesUnavailable(p: Array<out String>?, u: UserHandle?, r: Boolean) = reload()
    }

    private val homeRole = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (!isDefaultHome()) safeStart(Intent(Settings.ACTION_HOME_SETTINGS))
        updateBanner()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        launcherApps = getSystemService(LauncherApps::class.java)
        setContentView(buildUi())
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = select(0)
        })
        launcherApps.registerCallback(packageCallback, main)
        reload()
        if (savedInstanceState == null && !isDefaultHome() && !prefs().getBoolean("asked_home", false)) {
            prefs().edit().putBoolean("asked_home", true).apply()
            main.postDelayed({ requestDefaultHome() }, 900)
        }
    }

    override fun onResume() {
        super.onResume()
        updateInfo()
        updateBanner()
        slideUp()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (Intent.ACTION_MAIN == intent.action) {
            select(0)
            grid.scrollToPosition(0)
        }
    }

    override fun onDestroy() {
        launcherApps.unregisterCallback(packageCallback)
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun prefs() = getSharedPreferences("isuit", Context.MODE_PRIVATE)
    private fun dp(v: Number) = (v.toFloat() * resources.displayMetrics.density).roundToInt()

    // ------------------------------------------------------------- Interfaz

    private fun shadow(tv: TextView) = tv.setShadowLayer(dp(6).toFloat(), 0f, dp(1).toFloat(), 0xAA000000.toInt())

    private fun glass(radius: Int, alpha: Int = 0x66) = GradientDrawable().apply {
        setColor(Color.argb(alpha, 0, 0, 0))
        cornerRadius = dp(radius).toFloat()
    }

    private fun buildUi(): View {
        val root = FrameLayout(this)
        Backdrop.applyTo(root)

        phone = LinearLayout(this).apply {
            fitsSystemWindows = true
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), dp(14), dp(22), dp(18))
        }
        root.addView(phone, FrameLayout.LayoutParams(-1, -1))

        // ---- Hora (izquierda) y batería (derecha)
        val top = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        top.addView(TextClock(this).apply {
            format12Hour = "h:mm a"
            format24Hour = "HH:mm"
            textSize = 30f
            setTextColor(Color.WHITE)
            typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
            shadow(this)
            setOnClickListener { safeStart(Intent(AlarmClock.ACTION_SHOW_ALARMS)) }
            // Mantener presionada la hora: cambia entre el fondo de iSuit y el del teléfono.
            setOnLongClickListener {
                val own = !Backdrop.useOwnWallpaper(this@MainActivity)
                Backdrop.setUseOwnWallpaper(this@MainActivity, own)
                toast(if (own) "Usando tu fondo de pantalla" else "Usando el fondo de iSuit")
                recreate()
                true
            }
        }, LinearLayout.LayoutParams(0, -2, 1f))
        battery = TextView(this).apply {
            textSize = 22f
            setTextColor(Color.WHITE)
            shadow(this)
        }
        top.addView(battery)
        phone.addView(top)

        // ---- Tarjeta "Hoy"
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(4), dp(18), dp(4), dp(10))
            setOnClickListener { safeStart(Intent(AlarmClock.ACTION_SHOW_ALARMS)) }
        }
        card.addView(TextView(this).apply {
            text = "✦"
            gravity = Gravity.CENTER
            textSize = 16f
            setTextColor(Color.WHITE)
            background = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(0xFFFF5FA2.toInt(), 0xFF7B61FF.toInt(), 0xFF19C3B4.toInt()),
            ).apply { shape = GradientDrawable.OVAL }
        }, LinearLayout.LayoutParams(dp(30), dp(30)))
        card.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), 0, 0, 0)
            addView(TextClock(context).apply {
                format12Hour = "'Hoy' · EEE d MMM"
                format24Hour = "'Hoy' · EEE d MMM"
                textSize = 24f
                setTextColor(Color.WHITE)
                typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.BOLD)
                shadow(this)
            })
            todayLine = TextView(context).apply {
                textSize = 14f
                setTextColor(0xEEFFFFFF.toInt())
                shadow(this)
                setPadding(0, dp(2), 0, 0)
            }
            addView(todayLine)
        })
        phone.addView(card)

        // ---- Aviso para hacerlo predeterminado
        defaultBanner = TextView(this).apply {
            text = "⌂  Toca para usar iSuit como pantalla de inicio"
            textSize = 13f
            setTextColor(Color.WHITE)
            background = glass(16, 0x88)
            setPadding(dp(14), dp(10), dp(14), dp(10))
            setOnClickListener { requestDefaultHome() }
        }
        phone.addView(defaultBanner, LinearLayout.LayoutParams(-1, -2).apply { setMargins(0, dp(4), 0, dp(6)) })

        // ---- Botón: apps de iSuit ↔ mis apps
        modeButton = TextView(this).apply {
            textSize = 14f
            setTextColor(Color.WHITE)
            background = glass(18, 0x99)
            setPadding(dp(16), dp(8), dp(16), dp(8))
            setOnClickListener {
                isuitMode = !isuitMode
                selected = 0
                rebuildEntries()
                grid.scrollToPosition(0)
                performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
            }
        }
        phone.addView(modeButton, LinearLayout.LayoutParams(-2, -2).apply {
            gravity = Gravity.END
            topMargin = dp(8)
        })

        // ---- Cuadrícula de íconos redondos
        grid = RecyclerView(this).apply {
            layoutManager = GridLayoutManager(context, COLUMNS)
            adapter = this@MainActivity.adapter
            clipToPadding = false
            setPadding(0, dp(18), 0, dp(18))
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            itemAnimator = null
        }
        phone.addView(grid, LinearLayout.LayoutParams(-1, 0, 1f))

        // ---- Burbuja con el nombre de la app elegida
        namePill = TextView(this).apply {
            textSize = 16f
            setTextColor(Color.WHITE)
            background = glass(20, 0x99)
            setPadding(dp(18), dp(8), dp(18), dp(8))
            setOnClickListener { openSelected() }
        }
        phone.addView(namePill, LinearLayout.LayoutParams(-2, -2).apply { gravity = Gravity.CENTER_HORIZONTAL })

        hint = TextView(this).apply {
            text = "VOL ▲▼ moverte · mantén VOL para abrir"
            textSize = 11f
            setTextColor(0xCCFFFFFF.toInt())
            shadow(this)
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, 0)
        }
        phone.addView(hint, LinearLayout.LayoutParams(-1, -2))
        return root
    }

    /** El "teléfono" sube deslizándose al volver al inicio. */
    private fun slideUp() {
        phone.post {
            phone.translationY = phone.height * 0.35f
            phone.alpha = 0f
            phone.animate().translationY(0f).alpha(1f)
                .setInterpolator(OvershootInterpolator(0.9f))
                .setDuration(380).start()
        }
        hint.alpha = 1f
        hint.animate().alpha(0f).setStartDelay(4000).setDuration(600).start()
    }

    private fun updateInfo() {
        val bm = getSystemService(BatteryManager::class.java)
        val level = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        battery.text = if (level in 0..100) "${if (bm?.isCharging == true) "⚡" else "🔋"}$level%" else ""

        val next = getSystemService(AlarmManager::class.java)?.nextAlarmClock?.triggerTime
        val alarm = if (next != null) "⏰ ${DateFormat.getTimeFormat(this).format(Date(next))}" else "Sin alarmas"
        val fav = installed.firstOrNull { uses(it) > 0 }?.label
        todayLine.text = if (fav != null) "$alarm · Favorita: $fav" else alarm
    }

    // ---------------------------------------------------------------- Datos

    private fun key(a: App) = a.component.flattenToShortString()
    private fun uses(a: App) = prefs().getInt("u:${key(a)}", 0)

    private fun reload() {
        executor.execute {
            val density = resources.displayMetrics.densityDpi
            val list = ArrayList<App>()
            for (user in launcherApps.profiles) {
                for (info in launcherApps.getActivityList(null, user)) {
                    if (info.componentName.packageName == packageName) continue
                    val icon = try { info.getBadgedIcon(density) } catch (e: Exception) { info.getIcon(density) }
                    list += App(info.label.toString(), info.componentName, user, icon)
                }
            }
            val collator = Collator.getInstance(Locale("es")).apply { strength = Collator.PRIMARY }
            // Las que más usas primero; el resto en orden alfabético.
            val sorted = list.sortedWith { a, b ->
                val d = uses(b) - uses(a)
                if (d != 0) d else collator.compare(a.label, b.label)
            }
            main.post {
                installed = sorted
                rebuildEntries()
                updateInfo()
            }
        }
    }

    /** Apps propias de iSuit (salen primero en el modo iSuit). */
    private fun builtins(): List<Entry> = listOf(
        Entry("Pulso", BuiltinIcon(intArrayOf(0xFFFF5F6D.toInt(), 0xFFFFC371.toInt()), "💪"), null, FitnessActivity::class.java),
        Entry("Charla", BuiltinIcon(intArrayOf(0xFF22C55E.toInt(), 0xFF0EA5E9.toInt()), "💬"), null, ChatHubActivity::class.java),
        Entry("AutoID", BuiltinIcon(intArrayOf(0xFF6366F1.toInt(), 0xFFEC4899.toInt()), "🚗"), null, CarIdActivity::class.java),
    )

    /** Apps básicas del teléfono que acompañan a las de iSuit. */
    private val ESSENTIALS = listOf("dialer", "phone", "camera", "photos", "gallery", "contacts", "settings", "chrome", "browser", "maps", "music", "clock")

    private fun rebuildEntries() {
        apps = if (isuitMode) {
            val extras = ESSENTIALS.mapNotNull { kw -> installed.firstOrNull { it.component.packageName.contains(kw) } }.distinct()
            builtins() + extras.map { Entry(it.label, it.icon, it, null) }
        } else {
            installed.map { Entry(it.label, it.icon, it, null) }
        }
        modeButton.text = if (isuitMode) "📱 Mis apps" else "🎮 iSuit"
        selected = selected.coerceIn(0, (apps.size - 1).coerceAtLeast(0))
        adapter.notifyDataSetChanged()
        updatePill()
    }

    // ------------------------------------------------------------- Selección

    private fun select(index: Int) {
        if (apps.isEmpty()) return
        val old = selected
        selected = ((index % apps.size) + apps.size) % apps.size
        adapter.notifyItemChanged(old)
        adapter.notifyItemChanged(selected)
        grid.smoothScrollToPosition(selected)
        updatePill()
    }

    private fun updatePill() {
        val app = apps.getOrNull(selected)
        namePill.visibility = if (app == null) View.INVISIBLE else View.VISIBLE
        namePill.text = app?.label.orEmpty()
    }

    private fun openSelected() {
        apps.getOrNull(selected)?.let { open(it, grid.findViewHolderForAdapterPosition(selected)?.itemView ?: grid) }
    }

    private fun open(e: Entry, source: View) {
        val screen = e.screen
        if (screen != null) {
            startActivity(Intent(this, screen))
        } else {
            e.app?.let { launch(it, source) }
        }
    }

    private fun launch(app: App, source: View) {
        val bounds = Rect().also { source.getGlobalVisibleRect(it) }
        try {
            launcherApps.startMainActivity(app.component, app.user, bounds, null)
            prefs().edit().putInt("u:${key(app)}", uses(app) + 1).apply()
        } catch (e: Exception) {
            toast("No se pudo abrir ${app.label}")
        }
    }

    // ---------------------------------------- Botones de volumen = control

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            if (event.repeatCount == 0) {
                event.startTracking()
                longPressed = false
            }
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onKeyLongPress(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            longPressed = true
            grid.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            openSelected()
            return true
        }
        return super.onKeyLongPress(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            if (!longPressed && !event.isCanceled) {
                select(if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) selected + 1 else selected - 1)
                grid.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
            }
            longPressed = false
            return true
        }
        return super.onKeyUp(keyCode, event)
    }

    // ------------------------------------------------------ Predeterminado

    private fun isDefaultHome(): Boolean {
        val info = packageManager.resolveActivity(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY,
        )
        return info?.activityInfo?.packageName == packageName
    }

    private fun updateBanner() {
        defaultBanner.visibility = if (isDefaultHome()) View.GONE else View.VISIBLE
    }

    private fun requestDefaultHome() {
        if (isDefaultHome()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val rm = getSystemService(RoleManager::class.java)
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME) && !rm.isRoleHeld(RoleManager.ROLE_HOME)) {
                try {
                    homeRole.launch(rm.createRequestRoleIntent(RoleManager.ROLE_HOME))
                    return
                } catch (e: Exception) {
                    // sigue con los ajustes
                }
            }
        }
        safeStart(Intent(Settings.ACTION_HOME_SETTINGS))
    }

    private fun safeStart(intent: Intent) {
        try {
            startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            toast("No se pudo abrir")
        }
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    private fun showAppMenu(app: App, anchor: View) {
        PopupMenu(this, anchor).apply {
            menu.add(0, 1, 0, "Información de la app")
            menu.add(0, 2, 1, "Desinstalar")
            setOnMenuItemClickListener { item ->
                when (item.itemId) {
                    1 -> launcherApps.startAppDetailsActivity(app.component, app.user, null, null)
                    2 -> safeStart(Intent(Intent.ACTION_DELETE, Uri.parse("package:${app.component.packageName}")))
                }
                true
            }
            show()
        }
    }

    // --------------------------------------------------------- Íconos redondos

    private inner class IconAdapter : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
        override fun getItemCount() = apps.size

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
            val size = dp(62)
            val cell = FrameLayout(parent.context).apply {
                layoutParams = RecyclerView.LayoutParams(-1, dp(84))
            }
            val ring = View(parent.context).apply {
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.TRANSPARENT)
                    setStroke(dp(3), Color.WHITE)
                }
            }
            cell.addView(ring, FrameLayout.LayoutParams(size + dp(10), size + dp(10), Gravity.CENTER))
            val icon = ImageView(parent.context).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                outlineProvider = object : ViewOutlineProvider() {
                    override fun getOutline(view: View, outline: Outline) = outline.setOval(0, 0, view.width, view.height)
                }
                clipToOutline = true
                elevation = dp(4).toFloat()
            }
            cell.addView(icon, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
            return object : RecyclerView.ViewHolder(cell) {}
        }

        override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
            val entry = apps[position]
            val cell = holder.itemView as FrameLayout
            val ring = cell.getChildAt(0)
            val icon = cell.getChildAt(1) as ImageView
            icon.setImageDrawable(entry.icon)
            icon.contentDescription = entry.label
            val isSel = position == selected
            ring.visibility = if (isSel) View.VISIBLE else View.INVISIBLE
            val scale = if (isSel) 1.08f else 1f
            icon.animate().scaleX(scale).scaleY(scale).setDuration(140).start()
            cell.setOnClickListener {
                select(position)
                open(entry, it)
            }
            cell.setOnLongClickListener {
                select(position)
                entry.app?.let { a -> showAppMenu(a, it) }
                true
            }
        }
    }

    companion object {
        private const val COLUMNS = 4
    }
}
