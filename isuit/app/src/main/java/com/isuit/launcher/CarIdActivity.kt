package com.isuit.launcher

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.View
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import java.io.File
import java.util.concurrent.Executors

/**
 * 🚗 AutoID: toma o elige una foto de un carro y la IA (Gemini, gratis)
 * te dice marca, modelo, años aproximados y más.
 */
class CarIdActivity : PhoneScreen() {

    override val screenTitle = "AutoID"
    override val screenIcon: Drawable = BuiltinIcon(intArrayOf(0xFF6366F1.toInt(), 0xFFEC4899.toInt()), "🚗")

    private lateinit var keyCard: LinearLayout
    private lateinit var photo: ImageView
    private lateinit var result: TextView
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var busy = false
    private var photoUri: Uri? = null

    private val takePhoto = registerForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val uri = photoUri
        if (ok && uri != null) analyze(uri)
    }

    private val pickPhoto = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) analyze(uri)
    }

    override fun buildContent() {
        // ---- Key de Google AI Studio (si falta)
        keyCard = card("Conecta Google AI Studio (gratis)")
        val keyField = EditText(this).apply {
            hint = "AIza…"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            setTextColor(Color.WHITE)
            setHintTextColor(0x99FFFFFF.toInt())
            background = glass(14, 0x55)
            setPadding(dp(14), dp(12), dp(14), dp(12))
        }
        keyCard.addView(label("Crea tu API key gratis en aistudio.google.com/apikey y pégala aquí. Se guarda solo en este teléfono.",
            13f, 0xDDFFFFFF.toInt()).apply { setPadding(0, dp(6), 0, dp(10)) })
        keyCard.addView(keyField)
        keyCard.addView(row(
            button("Guardar", 0xFF6366F1.toInt()) {
                val k = keyField.text.toString().trim()
                if (k.length < 20) toast("Esa key se ve incompleta") else {
                    Gemini.setKey(this, k)
                    keyField.setText("")
                    refreshKey()
                    toast("¡Listo! AutoID conectado 🚗")
                }
            },
            button("Conseguir key", 0x55FFFFFF) {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://aistudio.google.com/apikey")))
                } catch (e: ActivityNotFoundException) {
                    toast("Abre aistudio.google.com/apikey en el navegador")
                }
            },
        ), LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
        body.addView(keyCard)

        // ---- Foto + botones
        val scan = card("Identifica un carro")
        photo = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            background = glass(18, 0x44)
            clipToOutline = true
            visibility = View.GONE
        }
        scan.addView(photo, LinearLayout.LayoutParams(-1, dp(220)).apply { topMargin = dp(10) })
        scan.addView(row(
            button("📷 Tomar foto", 0xFFEC4899.toInt()) { startCamera() },
            button("🖼️ Galería", 0xFF6366F1.toInt()) { if (!busy) pickPhoto.launch("image/*") },
        ), LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
        body.addView(scan)

        // ---- Resultado
        val res = card("Resultado")
        result = label("Toma una foto donde se vea bien el carro (de frente o de lado).", 16f, Color.WHITE).apply {
            setLineSpacing(0f, 1.2f)
            setTextIsSelectable(true)
            setPadding(0, dp(8), 0, 0)
        }
        res.addView(result)
        body.addView(res)

        refreshKey()
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun refreshKey() {
        keyCard.visibility = if (Gemini.key(this).isEmpty()) View.VISIBLE else View.GONE
    }

    private fun startCamera() {
        if (busy) return
        val file = File(cacheDir, "autoid/foto.jpg").apply { parentFile?.mkdirs() }
        val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
        photoUri = uri
        try {
            takePhoto.launch(uri)
        } catch (e: ActivityNotFoundException) {
            toast("No hay app de cámara")
        }
    }

    private fun analyze(uri: Uri) {
        if (Gemini.key(this).isEmpty()) {
            toast("Primero pega tu API key de Google AI Studio 🔑")
            return
        }
        busy = true
        result.text = "🔍 Analizando el carro…"
        val ctx = applicationContext
        executor.execute {
            val bmp = try {
                ImageDecoder.decodeBitmap(ImageDecoder.createSource(contentResolver, uri)) { decoder, info, _ ->
                    decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                    val max = maxOf(info.size.width, info.size.height)
                    if (max > 1600) decoder.setTargetSampleSize(max / 1600 + 1)
                }
            } catch (e: Exception) {
                null
            }
            if (bmp == null) {
                main.post {
                    result.text = "⚠️ No pude abrir esa foto."
                    busy = false
                }
                return@execute
            }
            main.post {
                photo.setImageBitmap(bmp)
                photo.visibility = View.VISIBLE
            }
            val r = Gemini.describeImage(ctx, bmp.copy(Bitmap.Config.ARGB_8888, false), PROMPT)
            main.post {
                result.text = when (r) {
                    is Gemini.Result.Ok -> r.text
                    is Gemini.Result.Error -> "⚠️ ${r.message}"
                }
                busy = false
                refreshKey()
            }
        }
    }

    companion object {
        private val PROMPT = """
            Eres AutoID, un experto en carros. Mira la foto y responde en español, corto y claro,
            con este formato exacto (una línea por dato):
            🚗 Marca y modelo:
            📅 Años aproximados (generación):
            🏷️ Tipo (sedán, SUV, pickup, deportivo…):
            ⚙️ Motor típico:
            💡 Dato curioso:
            🎯 Seguridad de la respuesta: (alta / media / baja)
            Si no hay ningún carro en la foto, dilo en una línea. Si no estás seguro, dilo; no inventes.
        """.trimIndent()
    }
}
