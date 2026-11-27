package com.isuit.launcher

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.Drawable
import android.net.Uri
import android.provider.Telephony
import android.text.InputType
import android.view.Gravity
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout

/**
 * 💬 Charla: todas tus apps de mensajes en un lugar, más
 * "escribir a un número" (SMS o WhatsApp sin guardar el contacto).
 */
class ChatHubActivity : PhoneScreen() {

    override val screenTitle = "Charla"
    override val screenIcon: Drawable = BuiltinIcon(intArrayOf(0xFF22C55E.toInt(), 0xFF0EA5E9.toInt()), "💬")

    override fun buildContent() {
        // ---- Escribir a un número
        val quick = card("Escribir a un número")
        val number = field("Número (con código de país, ej. 52155…)", InputType.TYPE_CLASS_PHONE)
        val message = field("Mensaje", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or InputType.TYPE_TEXT_FLAG_MULTI_LINE)
        quick.addView(number, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
        quick.addView(message, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
        val hasWhatsApp = isInstalled("com.whatsapp") || isInstalled("com.whatsapp.w4b")
        val buttons = mutableListOf(
            button("✉️ SMS", 0xFF0EA5E9.toInt()) { sendSms(number.text.toString(), message.text.toString()) },
        )
        if (hasWhatsApp) {
            buttons += button("🟢 WhatsApp", 0xFF22C55E.toInt()) { sendWhatsApp(number.text.toString(), message.text.toString()) }
        }
        quick.addView(row(*buttons.toTypedArray()), LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
        body.addView(quick)

        // ---- Mis apps de mensajes
        val list = card("Tus apps de mensajes")
        val apps = messagingApps()
        if (apps.isEmpty()) {
            list.addView(label("No encontré apps de mensajes instaladas.", 14f, 0xCCFFFFFF.toInt()).apply { setPadding(0, dp(8), 0, 0) })
        }
        for ((name, pkg) in apps) {
            val icon = try { packageManager.getApplicationIcon(pkg) } catch (e: Exception) { null }
            list.addView(LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, dp(12), 0, dp(4))
                addView(ImageView(context).apply { setImageDrawable(icon) }, LinearLayout.LayoutParams(dp(44), dp(44)))
                addView(label(name, 18f, Color.WHITE, bold = true).apply { setPadding(dp(14), 0, 0, 0) }, LinearLayout.LayoutParams(0, -2, 1f))
                addView(label("Abrir ›", 14f, 0xDDFFFFFF.toInt()))
                setOnClickListener {
                    packageManager.getLaunchIntentForPackage(pkg)?.let { safeStart(it) } ?: toast("No se pudo abrir $name")
                }
            })
        }
        body.addView(list)
    }

    private fun field(hintText: String, type: Int) = EditText(this).apply {
        hint = hintText
        inputType = type
        setTextColor(Color.WHITE)
        setHintTextColor(0x99FFFFFF.toInt())
        textSize = 16f
        background = glass(14, 0x55)
        setPadding(dp(14), dp(12), dp(14), dp(12))
    }

    private fun isInstalled(pkg: String) = packageManager.getLaunchIntentForPackage(pkg) != null

    /** Apps de mensajes conocidas que estén instaladas + la app de SMS predeterminada. */
    private fun messagingApps(): List<Pair<String, String>> {
        val known = listOf(
            "com.whatsapp", "com.whatsapp.w4b", "org.telegram.messenger", "org.thunderdog.challegram",
            "com.facebook.orca", "com.facebook.mlite", "org.thoughtcrime.securesms", "com.discord",
            "com.instagram.android", "com.snapchat.android", "jp.naver.line.android", "com.viber.voip",
            "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.zhiliaoapp.musically",
        )
        val sms = Telephony.Sms.getDefaultSmsPackage(this)
        return (listOfNotNull(sms) + known).distinct().filter { isInstalled(it) }.map { pkg ->
            val name = try {
                packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
            } catch (e: Exception) { pkg }
            name to pkg
        }
    }

    private fun cleanNumber(raw: String) = raw.filter { it.isDigit() || it == '+' }

    private fun sendSms(raw: String, text: String) {
        val n = cleanNumber(raw)
        if (n.count { it.isDigit() } < 6) return toast("Escribe un número válido")
        safeStart(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$n")).putExtra("sms_body", text))
    }

    private fun sendWhatsApp(raw: String, text: String) {
        val n = cleanNumber(raw).removePrefix("+")
        if (n.length < 8) return toast("Escribe el número con código de país")
        safeStart(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$n?text=" + Uri.encode(text))))
    }

    private fun safeStart(intent: Intent) {
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            toast("No hay una app para eso")
        }
    }
}
