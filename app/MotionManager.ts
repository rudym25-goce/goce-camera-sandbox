import { capturePointsManager } from './CapturePointManager';
import { deviceCamera } from './DeviceCamera';
import MotionCallbacks from './interfaces/MotionCallbacks';
import { sceneManager } from './SceneManager';

class MotionManager {
    private DeviceMotion: any = null;
    public deviceMotionSubscription: ReturnType<typeof this.DeviceMotion.addListener> | null = null;
    private isActive: boolean = false;

    private async initializeDeviceMotion(){
        if (!this.DeviceMotion) {
            const sensors = require('expo-sensors');
            this.DeviceMotion = sensors.DeviceMotion;
        }
    }

    async checkPermissions() {
        try {
            await this.initializeDeviceMotion()
            const { status: existingStatus } = await this.DeviceMotion.getPermissionsAsync();
            return existingStatus === 'granted';
        } catch (error) {
            console.error('Error checking motion permissions:', error);
            return false;
        }
    }

    async requestPermissions() {
        try {
            await this.initializeDeviceMotion()
            const { status } = await this.DeviceMotion.requestPermissionsAsync();
            return status === 'granted';
        } catch (error) {
            console.error('Error requesting motion permissions:', error);
            return false;
        }
    }

    async startMotionTracking(callbacks: MotionCallbacks) {

        await this.initializeDeviceMotion()
        
        // Check permissions first
        const hasPermission = await this.checkPermissions();
        if (!hasPermission) {
            const granted = await this.requestPermissions();
            if (!granted) {
                return false;
            }
        }

        if (this.isActive) {
            return true;
        }

        try {
            this.deviceMotionSubscription = this.DeviceMotion.addListener((event: any) => {
                callbacks.onRotation(event);

                // Update other states using the passed callbacks
                const cameraReady = deviceCamera.canCapture();
                callbacks.setCanCapture(cameraReady);

                callbacks.setCanUndo(!!capturePointsManager.currentPoint);
                
                callbacks.setCaptureComplete(deviceCamera.capturingComplete);
                
                callbacks.setShowingStitchedImage(sceneManager.showingStitchedImage);
            });
            
            this.isActive = true;
            return true;
        } catch (error) {
            console.error('Error starting motion tracking:', error);
            return false;
        }
    }

    stopMotionTracking() {
        if (this.deviceMotionSubscription) {
            this.deviceMotionSubscription.remove();
            this.deviceMotionSubscription = null;
            this.isActive = false;
        }
    }
}

export const motionManager = new MotionManager();