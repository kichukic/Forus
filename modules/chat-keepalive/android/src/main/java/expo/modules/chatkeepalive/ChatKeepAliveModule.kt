package expo.modules.chatkeepalive

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ChatKeepAliveModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ChatKeepAlive")

    /**
     * Starts the foreground service. Call it while the app is on screen: from
     * Android 12 a foreground service cannot be started from the background.
     */
    Function("start") {
      val context = appContext.reactContext ?: return@Function false
      try {
        ContextCompat.startForegroundService(context, Intent(context, ChatKeepAliveService::class.java))
        true
      } catch (e: Exception) {
        false
      }
    }

    Function("stop") {
      val context = appContext.reactContext ?: return@Function false
      context.stopService(Intent(context, ChatKeepAliveService::class.java))
      true
    }

    Function("isRunning") { ChatKeepAliveService.running }

    /** Whether Android is allowed to stop the app's background work. */
    Function("isIgnoringBatteryOptimizations") {
      val context = appContext.reactContext ?: return@Function false
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      power.isIgnoringBatteryOptimizations(context.packageName)
    }

    /**
     * Asks the phone to leave the app alone in the background. Opens the
     * system dialog on most phones; some makers hide it, in which case the
     * general battery-optimization list is shown instead.
     */
    Function("openBatterySettings") {
      val context = appContext.reactContext ?: return@Function false
      val request = Intent(
        Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        Uri.parse("package:${context.packageName}")
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(request)
        return@Function true
      } catch (e: Exception) {
        // Some vendors block the direct request dialog.
      }
      try {
        context.startActivity(
          Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
      } catch (e: Exception) {
        false
      }
    }

    /** The app's own settings page, where autostart lives on most Chinese phones. */
    Function("openAppSettings") {
      val context = appContext.reactContext ?: return@Function false
      try {
        context.startActivity(
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
      } catch (e: Exception) {
        false
      }
    }
  }
}
