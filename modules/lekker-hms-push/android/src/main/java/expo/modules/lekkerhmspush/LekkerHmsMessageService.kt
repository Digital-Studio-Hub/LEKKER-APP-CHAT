package expo.modules.lekkerhmspush

import android.content.Context
import android.util.Log
import com.huawei.hms.push.HmsMessageService

/**
 * Receives tokens Huawei issues after getToken returns empty, and tokens
 * Huawei rotates later. The value is stored until JS registers it.
 */
class LekkerHmsMessageService : HmsMessageService() {
  override fun onNewToken(token: String) {
    val value = token.trim()
    if (value.isEmpty()) return
    val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.edit().putString(KEY_TOKEN, value).apply()
    Log.i(TAG, "HMS token refreshed")
    LekkerHmsTokenEvents.emit?.invoke(value)
  }

  companion object {
    const val PREFS = "lekker_hms_push"
    const val KEY_TOKEN = "pending_token"
    private const val TAG = "LekkerHmsPush"
  }
}

internal object LekkerHmsTokenEvents {
  var emit: ((String) -> Unit)? = null
}
