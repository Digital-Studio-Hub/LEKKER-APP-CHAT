package expo.modules.lekkerhmspush

import android.content.pm.PackageManager
import android.util.Log
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.huawei.hms.aaid.HmsInstanceId
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LekkerHmsPushModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LekkerHmsPush")

    AsyncFunction("googlePlayServicesStatus") {
      googlePlayServicesStatus()
    }

    AsyncFunction("getHmsToken") { appId: String? ->
      getHmsToken(appId)
    }
  }

  private fun googlePlayServicesStatus(): String {
    val context = appContext.reactContext ?: return "unknown"
    return try {
      val code = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
      if (code == ConnectionResult.SUCCESS) "available" else "unavailable"
    } catch (t: Throwable) {
      Log.w(TAG, "GMS check failed: ${t.javaClass.simpleName}")
      "unknown"
    }
  }

  private fun getHmsToken(explicitAppId: String?): String? {
    val context = appContext.reactContext ?: return null
    return try {
      val appId = explicitAppId?.trim()?.takeIf { it.isNotEmpty() } ?: readAppId(context)
      val instance = HmsInstanceId.getInstance(context)
      val token = if (appId != null) instance.getToken(appId, "HCM") else instance.getToken("HCM")
      token?.trim()?.takeIf { it.isNotEmpty() }
    } catch (t: Throwable) {
      Log.w(TAG, "HMS getToken failed: ${t.javaClass.simpleName}")
      null
    }
  }

  private fun readAppId(context: android.content.Context): String? {
    return try {
      val info = context.packageManager.getApplicationInfo(
        context.packageName,
        PackageManager.GET_META_DATA,
      )
      val raw = info.metaData?.getString("com.huawei.hms.client.appid") ?: return null
      raw.removePrefix("appid=").trim().takeIf { it.isNotEmpty() }
    } catch (t: Throwable) {
      null
    }
  }

  companion object {
    private const val TAG = "LekkerHmsPush"
  }
}
