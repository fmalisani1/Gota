package com.fmalisani.gota;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 7102;

    private boolean mediaReceiverRegistered = false;
    private final BroadcastReceiver mediaEventReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || !GotaMediaService.ACTION_MEDIA_EVENT.equals(intent.getAction())) {
                return;
            }

            String eventName = intent.getStringExtra(GotaMediaService.EXTRA_EVENT_NAME);
            if (eventName != null) {
                triggerGotaEvent(eventName);
            }
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GotaMediaPlugin.class);
        super.onCreate(savedInstanceState);
        registerMediaEventReceiver();
        requestNotificationPermission();
    }

    @Override
    public void onDestroy() {
        if (mediaReceiverRegistered) {
            unregisterReceiver(mediaEventReceiver);
            mediaReceiverRegistered = false;
        }

        super.onDestroy();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN && handleMediaKey(event.getKeyCode())) {
            return true;
        }

        return super.dispatchKeyEvent(event);
    }

    private boolean handleMediaKey(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                triggerGotaEvent("gotaNativeNextTrack");
                return true;
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                triggerGotaEvent("gotaNativePreviousTrack");
                return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_HEADSETHOOK:
                triggerGotaEvent("gotaNativeToggleMute");
                return true;
            default:
                return false;
        }
    }

    private void triggerGotaEvent(String eventName) {
        if (getBridge() != null) {
            getBridge().triggerWindowJSEvent(eventName);
        }
    }

    private void registerMediaEventReceiver() {
        IntentFilter filter = new IntentFilter(GotaMediaService.ACTION_MEDIA_EVENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(mediaEventReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(mediaEventReceiver, filter);
        }

        mediaReceiverRegistered = true;
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return;
        }

        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return;
        }

        requestPermissions(
            new String[] { Manifest.permission.POST_NOTIFICATIONS },
            NOTIFICATION_PERMISSION_REQUEST_CODE
        );
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (
            requestCode == NOTIFICATION_PERMISSION_REQUEST_CODE &&
                grantResults.length > 0 &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED
        ) {
            startDefaultMediaService();
        }
    }

    private void startDefaultMediaService() {
        Intent intent = new Intent(this, GotaMediaService.class);
        intent.setAction(GotaMediaService.ACTION_REFRESH);
        ContextCompat.startForegroundService(this, intent);
    }
}
