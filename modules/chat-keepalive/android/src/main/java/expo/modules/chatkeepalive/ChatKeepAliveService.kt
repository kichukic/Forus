package expo.modules.chatkeepalive

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Keeps the app's process alive after it leaves the screen.
 *
 * Android moves background apps to a cached state, where the system may kill
 * them at any time to reclaim memory. A foreground service lifts the process
 * out of that state, so the JavaScript runtime — and with it the chat's
 * Socket.IO connection — keeps running, and messages (and their notifications)
 * still arrive while the app is in the background.
 *
 * The notification is deliberately quiet: low importance, no sound, no
 * vibration, no badge. Swiping the app from the recent-apps list does not stop
 * it (`stopWithTask="false"`); signing out does.
 */
class ChatKeepAliveService : Service() {
  companion object {
    const val CHANNEL_ID = "forus-background"
    const val NOTIFICATION_ID = 4311

    @Volatile
    var running: Boolean = false
      private set
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
    } else {
      0
    }
    try {
      ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type)
      running = true
    } catch (e: Exception) {
      // Starting a foreground service is not allowed from the background on
      // Android 12+. The app only asks while it is on screen, so this is a
      // last-resort guard rather than an expected path.
      stopSelf()
      return START_NOT_STICKY
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Background connection",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Keeps ForUs connected so messages arrive while the app is in the background."
      setShowBadge(false)
      enableVibration(false)
      enableLights(false)
      setSound(null, null)
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = if (launch != null) {
      PendingIntent.getActivity(
        this,
        0,
        launch,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    } else {
      null
    }
    // The notification icon the expo-notifications plugin generated, falling
    // back to a system one if the drawable is ever renamed.
    val icon = resources.getIdentifier("notification_icon", "drawable", packageName)
      .takeIf { it != 0 } ?: android.R.drawable.stat_notify_chat

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("ForUs")
      .setContentText("Connected — messages arrive in the background.")
      .setSmallIcon(icon)
      .setOngoing(true)
      .setSilent(true)
      .setShowWhen(false)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .apply { contentIntent?.let { setContentIntent(it) } }
      .build()
  }
}
