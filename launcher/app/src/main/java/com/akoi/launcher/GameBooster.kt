package com.akoi.launcher

import android.app.ActivityManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager

/**
 * ⚡ Modo Turbo: prepara el teléfono antes de abrir un juego.
 *
 * Solo hace lo que Android permite a una app normal (sin root):
 *  - Activa "No molestar" mientras juegas (si diste el permiso) y lo quita al volver.
 *  - Cierra apps en segundo plano (solo funciona hasta Android 13).
 *  - Avisa si el teléfono está caliente o con ahorro de batería (bajan los FPS).
 *  - Abre Game Launcher / Game Booster de Samsung si lo tienes.
 */
object GameBooster {

    private const val PREFS = "turbo"
    private const val SAMSUNG_GAME_LAUNCHER = "com.samsung.android.game.gamehome"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun autoTurbo(ctx: Context) = prefs(ctx).getBoolean("auto", true)
    fun setAutoTurbo(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("auto", on).apply()

    fun dndWhilePlaying(ctx: Context) = prefs(ctx).getBoolean("dnd", true)
    fun setDndWhilePlaying(ctx: Context, on: Boolean) = prefs(ctx).edit().putBoolean("dnd", on).apply()

    /** Resultado del turbo, para mostrarlo en pantalla. */
    data class Report(
        val freeRamMb: Long,
        val totalRamMb: Long,
        val closedApps: Int,
        val dndOn: Boolean,
        val warnings: List<String>,
    )

    fun canUseDnd(ctx: Context): Boolean =
        ctx.getSystemService(NotificationManager::class.java)?.isNotificationPolicyAccessGranted == true

    /** Abre la pantalla del sistema para dar permiso de "No molestar". */
    fun dndPermissionIntent() = Intent(android.provider.Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)

    fun hasSamsungGameLauncher(ctx: Context): Boolean =
        ctx.packageManager.getLaunchIntentForPackage(SAMSUNG_GAME_LAUNCHER) != null

    fun samsungGameLauncherIntent(ctx: Context): Intent? =
        ctx.packageManager.getLaunchIntentForPackage(SAMSUNG_GAME_LAUNCHER)

    /** Prepara el teléfono para jugar [gamePackage]. Llamar desde un hilo de fondo. */
    fun boost(ctx: Context, gamePackage: String?, otherPackages: List<String>): Report {
        val am = ctx.getSystemService(ActivityManager::class.java)

        // 1) Cerrar apps en segundo plano (Android 13 o menos; en 14+ el sistema no lo permite).
        var closed = 0
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            for (pkg in otherPackages.distinct()) {
                if (pkg == gamePackage || pkg == ctx.packageName) continue
                try {
                    @Suppress("DEPRECATION")
                    am.killBackgroundProcesses(pkg)
                    closed++
                } catch (e: Exception) {
                    // sin permiso o app protegida: se ignora
                }
            }
        }

        // 2) No molestar mientras juegas.
        var dnd = false
        if (dndWhilePlaying(ctx) && canUseDnd(ctx)) {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            if (nm.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALL) {
                nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
                prefs(ctx).edit().putBoolean("dnd_set_by_us", true).apply()
            }
            dnd = true
        }

        // 3) Memoria y avisos reales.
        val mem = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        return Report(
            freeRamMb = mem.availMem / (1024 * 1024),
            totalRamMb = mem.totalMem / (1024 * 1024),
            closedApps = closed,
            dndOn = dnd,
            warnings = warnings(ctx),
        )
    }

    /** Al volver al launcher: quita el "No molestar" que puso el turbo. */
    fun endSession(ctx: Context) {
        val p = prefs(ctx)
        if (!p.getBoolean("dnd_set_by_us", false)) return
        p.edit().putBoolean("dnd_set_by_us", false).apply()
        if (canUseDnd(ctx)) {
            ctx.getSystemService(NotificationManager::class.java)
                .setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL)
        }
    }

    /** Cosas que bajan el rendimiento y que el jugador puede arreglar. */
    fun warnings(ctx: Context): List<String> {
        val out = ArrayList<String>()
        val pm = ctx.getSystemService(PowerManager::class.java)
        if (pm?.isPowerSaveMode == true) out += "🔋 Ahorro de batería activado: baja los FPS"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pm != null) {
            when (pm.currentThermalStatus) {
                PowerManager.THERMAL_STATUS_MODERATE -> out += "🌡️ Teléfono tibio: puede bajar un poco el rendimiento"
                PowerManager.THERMAL_STATUS_SEVERE,
                PowerManager.THERMAL_STATUS_CRITICAL,
                PowerManager.THERMAL_STATUS_EMERGENCY,
                PowerManager.THERMAL_STATUS_SHUTDOWN -> out += "🔥 Teléfono caliente: déjalo enfriar o quítale la funda"
            }
        }
        val am = ctx.getSystemService(ActivityManager::class.java)
        val mem = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        if (mem.lowMemory) out += "🧠 Poca RAM libre: cierra apps desde Recientes"
        return out
    }

    /** Estado de temperatura en texto corto. */
    fun thermalLabel(ctx: Context): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "—"
        return when (ctx.getSystemService(PowerManager::class.java)?.currentThermalStatus) {
            PowerManager.THERMAL_STATUS_NONE, PowerManager.THERMAL_STATUS_LIGHT -> "FRÍO ❄️"
            PowerManager.THERMAL_STATUS_MODERATE -> "TIBIO 🌡️"
            null -> "—"
            else -> "CALIENTE 🔥"
        }
    }
}
