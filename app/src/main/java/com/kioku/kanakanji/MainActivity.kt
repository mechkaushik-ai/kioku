package com.kioku.kanakanji

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import org.json.JSONObject
import java.util.Locale

/**
 * Hosts the offline study app (assets/www) in a WebView and adds the native
 * pieces a web page can't do well on Android: Japanese text-to-speech,
 * picking photos/backups, and saving a backup file.
 */
class MainActivity : Activity() {

    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSave: String? = null

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        root = FrameLayout(this)
        web = WebView(this)
        root.addView(
            web,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
        setContentView(root)
        setupEdgeToEdge()

        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.allowContentAccess = true
        s.mediaPlaybackRequiresUserGesture = true

        web.addJavascriptInterface(Bridge(), "KiokuNative")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url ?: return false
                if (url.scheme == "file") return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                } catch (e: Exception) {
                    // No app can open the link; ignore.
                }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                val intent = fileChooserParams?.createIntent() ?: return false
                return try {
                    startActivityForResult(intent, REQ_FILE)
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        tts = TextToSpeech(this) { status -> onTtsInit(status) }

        web.loadUrl("file:///android_asset/www/index.html")
    }

    private fun onTtsInit(status: Int) {
        if (status != TextToSpeech.SUCCESS) return
        val result = tts?.setLanguage(Locale.JAPAN) ?: TextToSpeech.LANG_NOT_SUPPORTED
        ttsReady = result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED
        tts?.setSpeechRate(0.85f)
    }

    /** Methods callable from JavaScript as window.KiokuNative.*. */
    inner class Bridge {
        @JavascriptInterface
        fun speak(text: String) {
            runOnUiThread {
                if (ttsReady) {
                    tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "kioku")
                } else {
                    Toast.makeText(
                        this@MainActivity,
                        "No Japanese voice found. Add one in Settings > System > Languages > Text-to-speech.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }

        @JavascriptInterface
        fun saveFile(name: String, text: String) {
            runOnUiThread {
                pendingSave = text
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/json")
                    .putExtra(Intent.EXTRA_TITLE, name)
                try {
                    startActivityForResult(intent, REQ_SAVE)
                } catch (e: Exception) {
                    pendingSave = null
                    jsToast("No app available to save files")
                }
            }
        }

        @JavascriptInterface
        fun setDark(dark: Boolean) {
            runOnUiThread { applyBars(dark) }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            REQ_FILE -> {
                fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
                fileCallback = null
            }
            REQ_SAVE -> {
                val uri = data?.data
                val text = pendingSave
                pendingSave = null
                if (resultCode == RESULT_OK && uri != null && text != null) {
                    try {
                        contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray(Charsets.UTF_8)) }
                        jsToast("Backup saved")
                    } catch (e: Exception) {
                        jsToast("Could not save the backup")
                    }
                }
            }
        }
    }

    private fun jsToast(msg: String) {
        web.evaluateJavascript("window.kiokuToast && window.kiokuToast(" + JSONObject.quote(msg) + ")", null)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        web.evaluateJavascript("(window.kiokuBack && window.kiokuBack()) ? 'yes' : 'no'") { result ->
            if (result == null || !result.contains("yes")) finish()
        }
    }

    // ---------------------------------------------------------------- system bars

    private fun setupEdgeToEdge() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
        } else {
            legacyLayoutFlags()
        }
        if (Build.VERSION.SDK_INT < 35) transparentBars()

        root.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val b = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                v.setPadding(b.left, b.top, b.right, b.bottom)
            } else {
                legacyPadding(v, insets)
            }
            insets
        }
        root.requestApplyInsets()
        applyBars(false)
    }

    private fun applyBars(dark: Boolean) {
        val color = if (dark) INK else PAPER
        root.setBackgroundColor(color)
        web.setBackgroundColor(color)
        if (Build.VERSION.SDK_INT >= 30) {
            val controller = window.insetsController
            if (controller != null) {
                val mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                    WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                controller.setSystemBarsAppearance(if (dark) 0 else mask, mask)
            }
        } else {
            legacyLightBars(!dark)
        }
    }

    @Suppress("DEPRECATION")
    private fun legacyLayoutFlags() {
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
    }

    @Suppress("DEPRECATION")
    private fun transparentBars() {
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
    }

    @Suppress("DEPRECATION")
    private fun legacyPadding(v: View, insets: WindowInsets) {
        v.setPadding(
            insets.systemWindowInsetLeft,
            insets.systemWindowInsetTop,
            insets.systemWindowInsetRight,
            insets.systemWindowInsetBottom
        )
    }

    @Suppress("DEPRECATION")
    private fun legacyLightBars(light: Boolean) {
        val flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        val d = window.decorView
        d.systemUiVisibility = if (light) d.systemUiVisibility or flags else d.systemUiVisibility and flags.inv()
    }

    override fun onDestroy() {
        tts?.shutdown()
        tts = null
        web.destroy()
        super.onDestroy()
    }

    companion object {
        private const val REQ_FILE = 41
        private const val REQ_SAVE = 42
        private val PAPER = Color.rgb(0xF6, 0xF1, 0xE7)
        private val INK = Color.rgb(0x17, 0x15, 0x13)
    }
}
