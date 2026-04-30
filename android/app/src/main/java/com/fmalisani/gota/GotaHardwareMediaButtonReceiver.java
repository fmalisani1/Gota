package com.fmalisani.gota;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.view.KeyEvent;

import androidx.core.content.ContextCompat;

public class GotaHardwareMediaButtonReceiver extends BroadcastReceiver {
    private static final String TAG = "GotaHardwareMedia";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_MEDIA_BUTTON.equals(intent.getAction())) {
            return;
        }

        if (!GotaMediaService.isServiceRunning()) {
            Log.d(TAG, "Service not running; ignoring media button");
            return;
        }

        KeyEvent keyEvent = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
        if (keyEvent == null) {
            Log.d(TAG, "No media KeyEvent payload received");
            return;
        }

        if (keyEvent.getAction() != KeyEvent.ACTION_DOWN || keyEvent.getRepeatCount() != 0) {
            return;
        }

        String action = actionForKeyCode(keyEvent.getKeyCode());
        if (action == null) {
            Log.d(TAG, "Unhandled media key: " + keyEvent.getKeyCode());
            return;
        }

        Intent serviceIntent = new Intent(context, GotaMediaService.class);
        serviceIntent.setAction(action);
        ContextCompat.startForegroundService(context, serviceIntent);

        if (isOrderedBroadcast()) {
            abortBroadcast();
        }
    }

    private String actionForKeyCode(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                return GotaMediaService.ACTION_NEXT;
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                return GotaMediaService.ACTION_PREVIOUS;
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_HEADSETHOOK:
                return GotaMediaService.ACTION_TOGGLE_MUTE;
            default:
                return null;
        }
    }
}
