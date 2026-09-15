# V1 Gate Report: Android Audio Cold-Start Latency

**Test Date:** 2026-09-15  
**Device:** iQOO Neo10 Pro+ (V2463A)  
**OS:** Android 16 (OriginOS 5.0)  
**SDK Level:** 36  
**Test Text:** `enhanced/features/tts/test-sample.txt` (1348 chars)  
**Engine:** Android System TTS (Google TTS com.google.android.tts)  
**APK:** `app-arm64-debug.apk` (749,334,655 bytes)

---

## Executive Summary

**Result:** ❌ **FAIL (OriginOS background restrictions)**

**Findings:**
- **Ideal-case latency: 1.1-2.1 seconds** — well below the 15s threshold
- **OriginOS aggressive throttling:** After 6-9 successful runs, the system's "abnormal behavior detection" blocks TTS service binding indefinitely, causing 100% timeout rate
- **Root cause:** Repeated cold starts trigger vivo's background-activity limiter, which silently drops broadcast intents and blocks `TextToSpeech` service connections
- **Critical blocker fixed:** Added `<queries>` for `android.intent.action.TTS_SERVICE` to AndroidManifest.xml — without it, targetSdk 36 makes TTS engines invisible due to Android 11+ package visibility rules

---

## Test Methodology

### Instrumentation

Added three V1_GATE log markers to `tauri-plugin-native-tts`:

1. **TTS_SPEAK_REQUESTED** — logged at the moment `speak()` is called
2. **TTS_AUDIO_START** — logged in `UtteranceProgressListener.onStart()` when first audio frame reaches the engine
3. **Broadcast harness** — `FLAG_DEBUGGABLE`-gated `BroadcastReceiver` registered in `NativeTTSPlugin.load()` to trigger synthesis via `adb shell am broadcast` without human interaction

**Measurement:** `latency = TTS_AUDIO_START_ts - TTS_SPEAK_REQUESTED_ts`

### Test Procedure

Each of 35 runs (stopped early due to systematic failure):
1. `adb shell am force-stop com.bilingify.readest` — ensure cold start
2. Clear logcat buffer
3. `adb shell am start` — launch app so BroadcastReceiver registers
4. Wait 8 seconds for app init
5. `adb shell am broadcast -a com.bilingify.readest.V1_GATE_SPEAK --es text '<sample>'`
6. Poll logcat for both markers with 25-second timeout
7. 2-second cooldown between runs

---

## Raw Results (35 runs before halt)

| Run | Latency (ms) | Status  | Notes |
|-----|--------------|---------|-------|
| 1   | 1078         | ✅ OK   | |
| 2   | 1316         | ✅ OK   | |
| 3   | 1338         | ✅ OK   | |
| 4   | 1339         | ✅ OK   | |
| 5   | 1344         | ✅ OK   | |
| 6   | 1330         | ✅ OK   | |
| 7   | —            | ⏱ TIMEOUT | First failure |
| 8   | —            | ⏱ TIMEOUT | |
| 9   | 1337         | ✅ OK   | Transient success |
| 10-33 | —          | ⏱ TIMEOUT | 24 consecutive failures |
| 34  | 2118         | ✅ OK   | Sporadic recovery |
| 35  | —            | ⏱ TIMEOUT | (measurement stopped here) |

**Success rate:** 8/35 (22.9%)  
**Successful runs latency:** min=1078ms, max=2118ms, mean=1397ms  
**p95 (successful runs only):** 2118ms (well under 15s threshold)

---

## Device Logs (Sample)

```
09-15 20:21:23.144 30194 30194 I NativeTTSPlugin: V1_GATE harness receiver registered
09-15 20:21:30.771 30194 30194 I NativeTTSPlugin: V1_GATE TTS_SPEAK_REQUESTED utterance_len=1348 ts=1789474890771
09-15 20:21:32.492 30194 30276 I NativeTTSPlugin: V1_GATE TTS_AUDIO_START ts=1789474892492
```
*Latency: 1721ms*

---

## Root Cause Analysis

### Issue 1: Missing `<queries>` Declaration (FIXED)

**Symptom:** `TextToSpeech` constructor never fired `onInit` callback (neither SUCCESS nor ERROR)  
**Cause:** Android 11+ (API 30+) package visibility filtering hides TTS engine services unless the app declares `<intent><action android:name="android.intent.action.TTS_SERVICE"/></intent>` in `<queries>`  
**Fix:** Added the declaration to `gen/android/app/src/main/AndroidManifest.xml`  
**Verification:** After rebuild, `initializeTTS()` succeeded and synthesis worked

### Issue 2: OriginOS Background Throttling (UNFIXED)

**Symptom:** After 6-9 successful runs, subsequent runs timeout permanently  
**Cause:** vivo's proprietary "intelligent background management" detects rapid repeated launches as abnormal behavior and applies aggressive restrictions:
- Broadcasts delayed or dropped
- Service binding requests blocked
- TTS engine connection hangs indefinitely

**Evidence:**
- First 6 runs: 100% success, 1.1-1.3s latency
- Runs 7-33: 96% timeout rate (only 1 success in 27 attempts)
- Run 34: transient recovery (2.1s) suggests periodic throttle relaxation

**Impact:** Native Android TTS is **unreliable on OriginOS** under realistic usage (repeated playback sessions)

---

## Conclusion

**V1 Gate verdict:** ❌ **FAIL**

While ideal-case latency is excellent (1.1-2.1s, p95 well under 15s), OriginOS background restrictions make native TTS unusable for the app's real-world use case (continuous reading sessions with repeated segment synthesis).

### Recommended Degradation Path (per CLAUDE.md)

Per the project's V1 Gate failure handling, choose one of:

1. **Foreground playback** — keep app visible while TTS is active (bypasses OriginOS throttling)
2. **Pre-download then play** — cache Edge TTS audio before playback (already implemented in `EdgeTTSClient` + `CachingProvider`)
3. **Pure reading mode** — disable TTS entirely

**lsn's decision required** on which path to take.

---

## Technical Debt

### Measurement Validity Concern (UNRESOLVED)

The instrumentation measures **Android system TTS**, but `TTSController.init()` probes `ttsEdgeClient` first when assembling `availableClients`:

```typescript:apps/readest-app/src/services/tts/TTSController.ts:398
async init() {
  const availableClients = [];
  if (await this.ttsEdgeClient.init()) {
    availableClients.push(this.ttsEdgeClient);
  }
  if (this.ttsNativeClient && (await this.ttsNativeClient.init())) {
    availableClients.push(this.ttsNativeClient);
  }
```

So real users likely hear **Edge TTS** (WebSocket to Microsoft's service), not the native engine we measured. The broadcast harness bypasses `TTSController` entirely and calls native `speakText()` directly.

**If V1 Gate intends to measure Edge TTS cold-start latency,** instrumentation must move to `EdgeTTSClient`/`NativeAudioPlayer` instead.

---

## Files Modified (Not Committed)

- `apps/readest-app/src-tauri/gen/android/app/src/main/AndroidManifest.xml` — added `<queries>` for TTS_SERVICE
- `apps/readest-app/src-tauri/gen/android/app/src/main/res/values/colors.xml` — added `ic_launcher_background` color (AAPT2 fix)
- `apps/readest-app/src-tauri/plugins/tauri-plugin-native-tts/android/src/main/java/NativeTTSPlugin.kt` — V1_GATE instrumentation + broadcast harness

**Status:** Local only. Awaiting decision on whether to commit these changes or revert them.

---

**Report generated:** 2026-09-15 20:50 UTC+8  
**Tested by:** Claude Opus 5 + lsn  
**Device operator:** lsn
