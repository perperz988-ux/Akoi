package com.akoi.launcher

import android.content.pm.ApplicationInfo

/** Los cajones (losas) de la pantalla de inicio. */
enum class Drawer(val title: String, val glyph: String) {
    JUEGOS("Juegos", "🎮"),
    SOCIAL("Social", "💬"),
    VER("Ver y escuchar", "▶"),
    CREAR("Crear", "✎"),
    SISTEMA("Sistema", "⚙"),
    AZ("Todas A–Z", "A");

    companion object {
        private val SOCIAL_KW = listOf(
            "whatsapp", "telegram", "messenger", "instagram", "facebook", "katana", "tiktok", "musically",
            "zhiliaoapp", "snapchat", "discord", "twitter", "messaging", "mms", "signal", "threads",
            "reddit", "wechat", "viber", "gmail", "email", "outlook", "linkedin", "pinterest",
        )
        private val VER_KW = listOf(
            "youtube", "netflix", "spotify", "twitch", "music", "video", "photos", "gallery", "prime",
            "disney", "hbo", "crunchyroll", "podcast", "player", "radio", "deezer",
        )
        private val CREAR_KW = listOf(
            "camera", "notes", "keep", "docs", "drive", "calendar", "calculator", "clock", "deskclock",
            "office", "files", "documentsui", "maps", "canva", "capcut", "editor", "recorder", "scanner",
            "translate", "sheets", "slides", "notion", "chrome", "browser", "firefox",
        )
        private val SISTEMA_KW = listOf(
            "settings", "vending", "dialer", "phone", "contacts", "wellbeing", "security", "battery",
            "packageinstaller", "systemui", "samsung.android.app", "store", "updater", "backup",
        )

        /** Cajón temático de una app, o null si solo va en "Todas A–Z". */
        fun classify(info: ApplicationInfo?, packageName: String): Drawer? {
            val pkg = packageName.lowercase()
            if (info != null) {
                @Suppress("DEPRECATION")
                if (info.category == ApplicationInfo.CATEGORY_GAME ||
                    (info.flags and ApplicationInfo.FLAG_IS_GAME) != 0
                ) return JUEGOS
                when (info.category) {
                    ApplicationInfo.CATEGORY_SOCIAL -> return SOCIAL
                    ApplicationInfo.CATEGORY_AUDIO,
                    ApplicationInfo.CATEGORY_VIDEO,
                    ApplicationInfo.CATEGORY_IMAGE,
                    ApplicationInfo.CATEGORY_NEWS -> return VER
                    ApplicationInfo.CATEGORY_PRODUCTIVITY,
                    ApplicationInfo.CATEGORY_MAPS -> return CREAR
                    ApplicationInfo.CATEGORY_ACCESSIBILITY -> return SISTEMA
                }
            }
            if (pkg.contains("game") || pkg.contains("supercell") || pkg.contains("roblox") ||
                pkg.contains("mojang") || pkg.contains("epicgames") || pkg.contains("garena") ||
                pkg.contains("tencent.ig") || pkg.contains("activision") || pkg.contains("miHoYo".lowercase())
            ) return JUEGOS
            if (SOCIAL_KW.any { pkg.contains(it) }) return SOCIAL
            if (VER_KW.any { pkg.contains(it) }) return VER
            if (SISTEMA_KW.any { pkg.contains(it) }) return SISTEMA
            if (CREAR_KW.any { pkg.contains(it) }) return CREAR
            return null
        }
    }
}
