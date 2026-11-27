package com.isuit.launcher

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.CountDownTimer
import android.os.VibrationEffect
import android.os.Vibrator
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import java.time.LocalDate
import java.util.Locale

/**
 * 💪 Pulso: pasos de hoy (sensor del teléfono), meta diaria, km, calorías
 * y un entrenamiento rápido de 7 minutos con temporizador.
 */
class FitnessActivity : PhoneScreen(), SensorEventListener {

    override val screenTitle = "Pulso"
    override val screenIcon: Drawable = BuiltinIcon(intArrayOf(0xFFFF5F6D.toInt(), 0xFFFFC371.toInt()), "💪")

    private lateinit var ring: RingView
    private lateinit var stepsText: TextView
    private lateinit var statsText: TextView
    private lateinit var sensorNote: TextView
    private lateinit var workoutTitle: TextView
    private lateinit var workoutTimer: TextView
    private lateinit var workoutButton: TextView

    private var sensorManager: SensorManager? = null
    private var timer: CountDownTimer? = null
    private var step = -1

    private val askPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) startSensor() else sensorNote.text = "Sin permiso de actividad física no puedo contar tus pasos."
    }

    private fun prefs() = getSharedPreferences("pulso", Context.MODE_PRIVATE)
    private var goal: Int
        get() = prefs().getInt("goal", 6000)
        set(v) { prefs().edit().putInt("goal", v).apply() }

    override fun buildContent() {
        // ---- Anillo de pasos
        val stepsCard = card("Pasos de hoy")
        ring = RingView(this)
        val ringBox = android.widget.FrameLayout(this)
        ringBox.addView(ring, android.widget.FrameLayout.LayoutParams(dp(210), dp(210), Gravity.CENTER))
        stepsText = label("0", 44f, Color.WHITE, bold = true).apply { gravity = Gravity.CENTER }
        ringBox.addView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            addView(stepsText)
            addView(label("pasos", 14f, 0xCCFFFFFF.toInt()).apply { gravity = Gravity.CENTER })
        }, android.widget.FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
        stepsCard.addView(ringBox, LinearLayout.LayoutParams(-1, dp(230)))
        statsText = label("", 15f, Color.WHITE).apply { gravity = Gravity.CENTER }
        stepsCard.addView(statsText)
        sensorNote = label("", 12f, 0xBBFFFFFF.toInt()).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(6), 0, 0)
        }
        stepsCard.addView(sensorNote)
        stepsCard.addView(button("🎯 Cambiar meta", 0x55FFFFFF) { editGoal() }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
        body.addView(stepsCard)

        // ---- Entrenamiento rápido
        val w = card("Entrenamiento rápido · 7 min")
        workoutTitle = label("12 ejercicios de 30 s con 5 s de descanso.", 16f, Color.WHITE, bold = true)
        workoutTimer = label("", 56f, Color.WHITE, bold = true).apply {
            gravity = Gravity.CENTER
            visibility = View.GONE
        }
        workoutButton = button("▶  Empezar", 0xFFFF5F6D.toInt()) { toggleWorkout() }
        w.addView(workoutTitle)
        w.addView(workoutTimer)
        w.addView(workoutButton, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
        body.addView(w)

        // ---- Racha
        val streak = card("Racha")
        streak.addView(label(streakText(), 16f, Color.WHITE))
        body.addView(streak)

        refresh(stepsToday())
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED
        ) {
            askPermission.launch(Manifest.permission.ACTIVITY_RECOGNITION)
        } else {
            startSensor()
        }
    }

    override fun onDestroy() {
        sensorManager?.unregisterListener(this)
        timer?.cancel()
        super.onDestroy()
    }

    // --------------------------------------------------------------- Pasos

    private fun startSensor() {
        val sm = getSystemService(SensorManager::class.java)
        val counter = sm?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        if (counter == null) {
            sensorNote.text = "Este teléfono no tiene contador de pasos."
            return
        }
        sensorManager = sm
        sm.registerListener(this, counter, SensorManager.SENSOR_DELAY_UI)
        sensorNote.text = "Cuenta los pasos desde la primera vez que abres Pulso cada día."
    }

    /**
     * El sensor da los pasos desde que se encendió el teléfono.
     * Guardamos el valor del inicio del día para restar.
     */
    override fun onSensorChanged(event: SensorEvent) {
        val total = event.values[0].toInt()
        val today = LocalDate.now().toString()
        val p = prefs()
        var base = p.getInt("base", -1)
        if (p.getString("day", "") != today || base < 0 || total < base) {
            // Día nuevo o el teléfono se reinició: guarda lo de hoy y vuelve a empezar desde aquí.
            if (p.getString("day", "") == today && total < base) {
                p.edit().putInt("carry", p.getInt("carry", 0) + p.getInt("last", 0)).apply()
            } else if (p.getString("day", "") != today) {
                saveYesterday(p.getString("day", "").orEmpty(), p.getInt("last", 0) + p.getInt("carry", 0))
                p.edit().putInt("carry", 0).apply()
            }
            base = total
            p.edit().putString("day", today).putInt("base", base).apply()
        }
        val steps = total - base
        p.edit().putInt("last", steps).apply()
        refresh(stepsToday())
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun stepsToday(): Int {
        val p = prefs()
        if (p.getString("day", "") != LocalDate.now().toString()) return 0
        return p.getInt("last", 0) + p.getInt("carry", 0)
    }

    private fun saveYesterday(day: String, steps: Int) {
        if (day.isEmpty()) return
        val p = prefs()
        val met = steps >= goal
        val streak = if (met) p.getInt("streak", 0) + 1 else 0
        p.edit().putInt("streak", streak).apply()
    }

    private fun streakText(): String {
        val s = prefs().getInt("streak", 0)
        return if (s == 0) "Cumple tu meta hoy para empezar una racha 🔥" else "🔥 $s ${if (s == 1) "día" else "días"} seguidos cumpliendo la meta"
    }

    private fun refresh(steps: Int) {
        stepsText.text = String.format(Locale.getDefault(), "%,d", steps)
        ring.progress = (steps.toFloat() / goal).coerceIn(0f, 1f)
        val km = steps * 0.75 / 1000.0
        val kcal = (steps * 0.04).toInt()
        statsText.text = String.format(Locale.getDefault(), "🎯 Meta %,d  ·  📏 %.2f km  ·  🔥 %d kcal", goal, km, kcal)
    }

    private fun editGoal() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            setText(goal.toString())
        }
        android.app.AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Meta de pasos diaria")
            .setView(input)
            .setPositiveButton("Guardar") { _, _ ->
                input.text.toString().toIntOrNull()?.takeIf { it in 500..100_000 }?.let {
                    goal = it
                    refresh(stepsToday())
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    // ------------------------------------------------ Entrenamiento rápido

    private fun toggleWorkout() {
        if (step >= 0) {
            timer?.cancel()
            step = -1
            workoutTitle.text = "Entrenamiento detenido."
            workoutTimer.visibility = View.GONE
            workoutButton.text = "▶  Empezar"
        } else {
            workoutTimer.visibility = View.VISIBLE
            workoutButton.text = "■  Detener"
            runStep(0, rest = false)
        }
    }

    private fun runStep(index: Int, rest: Boolean) {
        if (index >= EXERCISES.size) {
            step = -1
            workoutTitle.text = "🏆 ¡Entrenamiento completo! Buen trabajo."
            workoutTimer.visibility = View.GONE
            workoutButton.text = "▶  Otra vez"
            buzz(600)
            return
        }
        step = index
        val seconds = if (rest) 5L else 30L
        workoutTitle.text = if (rest) "Descansa… sigue: ${EXERCISES[index]}"
            else "${index + 1}/${EXERCISES.size} · ${EXERCISES[index]}"
        buzz(if (rest) 80 else 250)
        timer?.cancel()
        timer = object : CountDownTimer(seconds * 1000, 250) {
            override fun onTick(ms: Long) {
                workoutTimer.text = ((ms + 999) / 1000).toString()
            }
            override fun onFinish() {
                if (rest) runStep(index, rest = false) else runStep(index + 1, rest = true)
            }
        }.start()
    }

    private fun buzz(ms: Long) {
        val v = getSystemService(Vibrator::class.java) ?: return
        v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
    }

    companion object {
        private val EXERCISES = listOf(
            "Saltos de tijera", "Sentadilla en pared", "Flexiones", "Abdominales",
            "Subir a una silla", "Sentadillas", "Fondos en silla", "Plancha",
            "Rodillas arriba", "Zancadas", "Flexiones con giro", "Plancha lateral",
        )
    }
}

/** Anillo de progreso con degradado. */
class RingView(context: Context) : View(context) {
    var progress = 0f
        set(v) { field = v; invalidate() }

    private val track = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = 0x33FFFFFF
        strokeCap = Paint.Cap.ROUND
    }
    private val arc = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private val oval = RectF()

    override fun onDraw(canvas: Canvas) {
        val stroke = width * 0.08f
        track.strokeWidth = stroke
        arc.strokeWidth = stroke
        arc.shader = android.graphics.SweepGradient(width / 2f, height / 2f,
            intArrayOf(0xFFFFC371.toInt(), 0xFFFF5F6D.toInt(), 0xFFFFC371.toInt()), null)
        oval.set(stroke, stroke, width - stroke, height - stroke)
        canvas.drawArc(oval, 0f, 360f, false, track)
        canvas.drawArc(oval, -90f, 360f * progress, false, arc)
        if (progress >= 1f) {
            val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                textSize = width * 0.09f
                textAlign = Paint.Align.CENTER
                typeface = Typeface.DEFAULT_BOLD
            }
            canvas.drawText("¡META! 🏆", width / 2f, height - stroke * 2.2f, p)
        }
    }
}
