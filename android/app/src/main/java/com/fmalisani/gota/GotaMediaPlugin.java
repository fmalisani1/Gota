package com.fmalisani.gota;

import android.content.Context;
import android.content.Intent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "GotaMedia")
public class GotaMediaPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, GotaMediaService.class);
        intent.setAction(GotaMediaService.ACTION_UPDATE);
        intent.putExtra(GotaMediaService.EXTRA_TITLE, call.getString("title", "Gota"));
        intent.putExtra(GotaMediaService.EXTRA_BPM, call.getInt("bpm", 0));
        intent.putExtra(GotaMediaService.EXTRA_METER, call.getString("meter", ""));
        intent.putExtra(GotaMediaService.EXTRA_IS_PLAYING, Boolean.TRUE.equals(call.getBoolean("isPlaying", false)));
        intent.putExtra(GotaMediaService.EXTRA_MUTED, Boolean.TRUE.equals(call.getBoolean("muted", false)));

        ContextCompat.startForegroundService(context, intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, GotaMediaService.class);
        intent.setAction(GotaMediaService.ACTION_STOP);
        context.startService(intent);
        call.resolve();
    }
}
