package com.fmalisani.gota;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import android.view.KeyEvent;

import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media.session.MediaButtonReceiver;

import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

public class GotaMediaService extends Service {
    public static final String ACTION_UPDATE = "com.fmalisani.gota.action.UPDATE_MEDIA";
    public static final String ACTION_REFRESH = "com.fmalisani.gota.action.REFRESH_MEDIA";
    public static final String ACTION_STOP = "com.fmalisani.gota.action.STOP_MEDIA";
    public static final String ACTION_PREVIOUS = "com.fmalisani.gota.action.PREVIOUS_TRACK";
    public static final String ACTION_TOGGLE_MUTE = "com.fmalisani.gota.action.TOGGLE_MUTE";
    public static final String ACTION_NEXT = "com.fmalisani.gota.action.NEXT_TRACK";
    public static final String ACTION_MEDIA_EVENT = "com.fmalisani.gota.action.MEDIA_EVENT";

    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BPM = "bpm";
    public static final String EXTRA_METER = "meter";
    public static final String EXTRA_IS_PLAYING = "isPlaying";
    public static final String EXTRA_MUTED = "muted";
    public static final String EXTRA_EVENT_NAME = "eventName";

    private static final String TAG = "GotaMediaService";
    private static final String CHANNEL_ID = "gota_media";
    private static final int NOTIFICATION_ID = 4107;
    private static final int SILENT_SAMPLE_RATE = 44100;
    private static final int SILENT_DURATION_MS = 250;

    private static volatile boolean serviceRunning = false;

    private MediaSessionCompat mediaSession;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private AudioTrack silentTrack;
    private String title = "Gota";
    private String meter = "";
    private int bpm = 0;
    private boolean isPlaying = false;
    private boolean muted = false;

    @Override
    public void onCreate() {
        super.onCreate();
        serviceRunning = true;
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        createNotificationChannel();
        createMediaSession();
        requestAudioFocus();
        startSilentLoop();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && Intent.ACTION_MEDIA_BUTTON.equals(intent.getAction())) {
            MediaButtonReceiver.handleIntent(mediaSession, intent);
            return START_STICKY;
        }

        String action = intent != null ? intent.getAction() : ACTION_UPDATE;

        if (ACTION_STOP.equals(action)) {
            stopMediaSession();
            return START_NOT_STICKY;
        }

        if (ACTION_PREVIOUS.equals(action)) {
            Log.d(TAG, "Previous requested");
            sendControlEvent("gotaNativePreviousTrack");
            return START_STICKY;
        }

        if (ACTION_NEXT.equals(action)) {
            Log.d(TAG, "Next requested");
            sendControlEvent("gotaNativeNextTrack");
            return START_STICKY;
        }

        if (ACTION_TOGGLE_MUTE.equals(action)) {
            handleToggleMute();
            return START_STICKY;
        }

        if (ACTION_REFRESH.equals(action)) {
            refreshMediaSession();
            return START_STICKY;
        }

        if (intent != null) {
            title = intent.getStringExtra(EXTRA_TITLE) != null
                ? intent.getStringExtra(EXTRA_TITLE)
                : "Gota";
            meter = intent.getStringExtra(EXTRA_METER) != null
                ? intent.getStringExtra(EXTRA_METER)
                : "";
            bpm = intent.getIntExtra(EXTRA_BPM, 0);
            isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false);
            muted = intent.getBooleanExtra(EXTRA_MUTED, false);
        }

        refreshMediaSession();
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        serviceRunning = false;
        stopSilentLoop();
        abandonAudioFocus();

        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }

        super.onDestroy();
    }

    public static boolean isServiceRunning() {
        return serviceRunning;
    }

    private void createMediaSession() {
        ComponentName mediaButtonReceiver = new ComponentName(this, MediaButtonReceiver.class);
        Intent mediaButtonIntent = new Intent(Intent.ACTION_MEDIA_BUTTON);
        mediaButtonIntent.setComponent(mediaButtonReceiver);
        PendingIntent mediaButtonPendingIntent = PendingIntent.getBroadcast(
            this,
            0,
            mediaButtonIntent,
            pendingIntentFlags(PendingIntent.FLAG_UPDATE_CURRENT)
        );

        mediaSession = new MediaSessionCompat(this, "Gota", mediaButtonReceiver, null);
        mediaSession.setFlags(
            MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );
        mediaSession.setPlaybackToLocal(AudioManager.STREAM_MUSIC);
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public boolean onMediaButtonEvent(Intent mediaButtonEvent) {
                KeyEvent keyEvent = mediaButtonEvent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
                if (keyEvent == null || keyEvent.getAction() != KeyEvent.ACTION_DOWN) {
                    return true;
                }

                switch (keyEvent.getKeyCode()) {
                    case KeyEvent.KEYCODE_MEDIA_NEXT:
                        sendControlEvent("gotaNativeNextTrack");
                        return true;
                    case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                        sendControlEvent("gotaNativePreviousTrack");
                        return true;
                    case KeyEvent.KEYCODE_MEDIA_PLAY:
                    case KeyEvent.KEYCODE_MEDIA_PAUSE:
                    case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                    case KeyEvent.KEYCODE_HEADSETHOOK:
                        handleToggleMute();
                        return true;
                    default:
                        return super.onMediaButtonEvent(mediaButtonEvent);
                }
            }

            @Override
            public void onPlay() {
                handleToggleMute();
            }

            @Override
            public void onPause() {
                handleToggleMute();
            }

            @Override
            public void onSkipToNext() {
                sendControlEvent("gotaNativeNextTrack");
            }

            @Override
            public void onSkipToPrevious() {
                sendControlEvent("gotaNativePreviousTrack");
            }
        });
        mediaSession.setMediaButtonReceiver(mediaButtonPendingIntent);
        mediaSession.setActive(true);
    }

    private void handleToggleMute() {
        muted = !muted;
        Log.d(TAG, "Toggle mute requested. muted=" + muted);
        refreshMediaSession();
        sendControlEvent("gotaNativeToggleMute");
    }

    private void refreshMediaSession() {
        if (mediaSession == null) {
            return;
        }

        requestAudioFocus();
        startSilentLoop();

        mediaSession.setMetadata(new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, mediaDescription())
            .build());

        long actions =
            PlaybackStateCompat.ACTION_PLAY |
                PlaybackStateCompat.ACTION_PAUSE |
                PlaybackStateCompat.ACTION_PLAY_PAUSE |
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS;
        int playbackState = isPlaying
            ? PlaybackStateCompat.STATE_PLAYING
            : PlaybackStateCompat.STATE_PAUSED;

        mediaSession.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(playbackState, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
            .build());
        mediaSession.setActive(true);

        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(mediaDescription())
            .setSubText(muted ? "Silenciado" : "Sonando")
            .setContentIntent(contentPendingIntent())
            .setDeleteIntent(servicePendingIntent(ACTION_STOP, 4))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .addAction(
                android.R.drawable.ic_media_previous,
                "Anterior",
                servicePendingIntent(ACTION_PREVIOUS, 1)
            )
            .addAction(
                muted ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause,
                muted ? "Activar sonido" : "Silenciar",
                servicePendingIntent(ACTION_TOGGLE_MUTE, 2)
            )
            .addAction(
                android.R.drawable.ic_media_next,
                "Siguiente",
                servicePendingIntent(ACTION_NEXT, 3)
            )
            .setStyle(new MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2))
            .build();
    }

    private String mediaDescription() {
        if (bpm <= 0) {
            return "Metronomo visual";
        }

        if (meter == null || meter.isEmpty()) {
            return bpm + " BPM";
        }

        return bpm + " BPM - " + meter;
    }

    private PendingIntent contentPendingIntent() {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent == null) {
            launchIntent = new Intent(this, MainActivity.class);
        }

        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            pendingIntentFlags(PendingIntent.FLAG_UPDATE_CURRENT)
        );
    }

    private PendingIntent servicePendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, GotaMediaService.class);
        intent.setAction(action);
        return PendingIntent.getService(
            this,
            requestCode,
            intent,
            pendingIntentFlags(PendingIntent.FLAG_UPDATE_CURRENT)
        );
    }

    private int pendingIntentFlags(int flags) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return flags | PendingIntent.FLAG_IMMUTABLE;
        }

        return flags;
    }

    private void requestAudioFocus() {
        AudioManager manager = audioManager;
        if (manager == null) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (audioFocusRequest == null) {
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(audioAttributes)
                    .setOnAudioFocusChangeListener(change ->
                        Log.d(TAG, "Audio focus change: " + change)
                    )
                    .build();
            }

            int result = manager.requestAudioFocus(audioFocusRequest);
            Log.d(TAG, "Audio focus requested: " + result);
            return;
        }

        int result = manager.requestAudioFocus(
            change -> Log.d(TAG, "Audio focus change: " + change),
            AudioManager.STREAM_MUSIC,
            AudioManager.AUDIOFOCUS_GAIN
        );
        Log.d(TAG, "Audio focus requested: " + result);
    }

    private void abandonAudioFocus() {
        AudioManager manager = audioManager;
        if (manager == null) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            int result = manager.abandonAudioFocusRequest(audioFocusRequest);
            Log.d(TAG, "Audio focus abandoned: " + result);
            return;
        }

        int result = manager.abandonAudioFocus(null);
        Log.d(TAG, "Audio focus abandoned: " + result);
    }

    private void startSilentLoop() {
        if (silentTrack != null && silentTrack.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) {
            return;
        }

        stopSilentLoop();

        int sampleCount = (SILENT_SAMPLE_RATE * SILENT_DURATION_MS) / 1000;
        byte[] silence = new byte[sampleCount * 2];

        try {
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();
            AudioFormat audioFormat = new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(SILENT_SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build();
            silentTrack = new AudioTrack.Builder()
                .setAudioAttributes(audioAttributes)
                .setAudioFormat(audioFormat)
                .setBufferSizeInBytes(silence.length)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build();

            int writtenBytes = silentTrack.write(silence, 0, silence.length);
            int writtenFrames = Math.max(1, writtenBytes / 2);
            silentTrack.setLoopPoints(0, writtenFrames, -1);
            silentTrack.setVolume(0f);
            silentTrack.play();
            Log.d(TAG, "Silent playback loop started");
        } catch (IllegalStateException | IllegalArgumentException error) {
            Log.w(TAG, "Unable to start silent playback loop", error);
            stopSilentLoop();
        }
    }

    private void stopSilentLoop() {
        if (silentTrack == null) {
            return;
        }

        try {
            silentTrack.pause();
            silentTrack.flush();
        } catch (IllegalStateException error) {
            Log.w(TAG, "Unable to pause silent playback loop", error);
        }

        silentTrack.release();
        silentTrack = null;
    }

    private void sendControlEvent(String eventName) {
        Intent intent = new Intent(ACTION_MEDIA_EVENT);
        intent.setPackage(getPackageName());
        intent.putExtra(EXTRA_EVENT_NAME, eventName);
        sendBroadcast(intent);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Gota",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Controles multimedia de Gota");
        channel.setShowBadge(false);

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private void stopMediaSession() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }

        stopSelf();
    }
}
