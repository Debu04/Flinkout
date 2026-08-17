import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type NativeStepReading = {
  steps: number;
  stepTimestamp: number;
  stepSensorAvailable: boolean;
  sensorType: 'STEP_COUNTER' | 'STEP_DETECTOR' | 'UNAVAILABLE';
  permission?: 'prompt' | 'granted' | 'denied';
};

interface FlinkoutStepCounterPlugin {
  getStatus(): Promise<NativeStepReading>;
  start(): Promise<NativeStepReading>;
  stop(): Promise<NativeStepReading>;
  addListener(eventName: 'stepUpdate', listener: (reading: NativeStepReading) => void): Promise<PluginListenerHandle>;
}

export const FlinkoutStepCounter = registerPlugin<FlinkoutStepCounterPlugin>('FlinkoutStepCounter');

export function hasNativeStepCounterBridge() {
  return Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('FlinkoutStepCounter');
}
