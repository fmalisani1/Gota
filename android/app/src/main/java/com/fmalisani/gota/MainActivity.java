package com.fmalisani.gota;

import com.getcapacitor.BridgeActivity;
import android.view.KeyEvent;

public class MainActivity extends BridgeActivity {
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
}
