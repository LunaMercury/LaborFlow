package com.laborflow.mobile

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val layout = LinearLayout(this).apply {
            gravity = Gravity.CENTER
            orientation = LinearLayout.VERTICAL
            setPadding(48, 48, 48, 48)
        }

        val title = TextView(this).apply {
            text = getString(R.string.app_name)
            textSize = 28f
        }
        val subtitle = TextView(this).apply {
            text = getString(R.string.health_message)
            gravity = Gravity.CENTER
            textSize = 16f
        }

        layout.addView(title)
        layout.addView(subtitle)
        setContentView(layout)
    }
}
