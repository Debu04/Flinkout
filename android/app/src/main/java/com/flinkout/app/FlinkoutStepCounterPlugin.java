package com.flinkout.app;

import android.Manifest;
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.SystemClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "FlinkoutStepCounter",
    permissions = {
        @Permission(alias = "activityRecognition", strings = { Manifest.permission.ACTIVITY_RECOGNITION })
    }
)
public class FlinkoutStepCounterPlugin extends Plugin implements SensorEventListener {
    private SensorManager sensorManager;
    private Sensor activeSensor;
    private Float counterBaseline;
    private int detectorSteps;
    private int lastSteps;
    private boolean listening;

    @Override
    public void load() {
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
    }

    private Sensor findSensor() {
        if (sensorManager == null) return null;
        Sensor counter = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        return counter != null ? counter : sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);
    }

    private JSObject reading(int steps, long timestamp) {
        JSObject result = new JSObject();
        result.put("steps", steps);
        result.put("stepTimestamp", timestamp);
        result.put("stepSensorAvailable", activeSensor != null || findSensor() != null);
        result.put("sensorType", activeSensor == null ? "UNAVAILABLE" : activeSensor.getType() == Sensor.TYPE_STEP_COUNTER ? "STEP_COUNTER" : "STEP_DETECTOR");
        return result;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Sensor sensor = findSensor();
        activeSensor = listening ? activeSensor : sensor;
        JSObject result = reading(lastSteps, System.currentTimeMillis());
        result.put("permission", getPermissionState("activityRecognition").toString().toLowerCase());
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        activeSensor = findSensor();
        if (activeSensor == null) {
            call.resolve(reading(0, System.currentTimeMillis()));
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("activityRecognition") != PermissionState.GRANTED) {
            requestPermissionForAlias("activityRecognition", call, "activityRecognitionCallback");
            return;
        }
        startListening(call);
    }

    @PermissionCallback
    private void activityRecognitionCallback(PluginCall call) {
        if (getPermissionState("activityRecognition") == PermissionState.GRANTED) {
            startListening(call);
        } else {
            call.reject("Physical activity permission was denied.", "ACTIVITY_RECOGNITION_DENIED");
        }
    }

    private void startListening(PluginCall call) {
        stopListening();
        activeSensor = findSensor();
        counterBaseline = null;
        detectorSteps = 0;
        lastSteps = 0;
        listening = activeSensor != null && sensorManager.registerListener(this, activeSensor, SensorManager.SENSOR_DELAY_NORMAL);
        if (!listening) {
            activeSensor = null;
            call.reject("The Android step sensor could not be started.", "STEP_SENSOR_START_FAILED");
            return;
        }
        call.resolve(reading(0, System.currentTimeMillis()));
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopListening();
        call.resolve(reading(lastSteps, System.currentTimeMillis()));
    }

    private void stopListening() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        listening = false;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!listening || activeSensor == null || event.sensor.getType() != activeSensor.getType()) return;
        if (event.sensor.getType() == Sensor.TYPE_STEP_COUNTER) {
            float total = event.values[0];
            if (counterBaseline == null || total < counterBaseline) counterBaseline = total;
            lastSteps = Math.max(0, Math.round(total - counterBaseline));
        } else {
            detectorSteps += Math.max(1, Math.round(event.values[0]));
            lastSteps = detectorSteps;
        }
        long timestamp = System.currentTimeMillis() - Math.max(0L, (SystemClock.elapsedRealtimeNanos() - event.timestamp) / 1_000_000L);
        notifyListeners("stepUpdate", reading(lastSteps, timestamp));
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // Android's step sensors do not require accuracy handling.
    }

    @Override
    protected void handleOnDestroy() {
        stopListening();
    }
}
