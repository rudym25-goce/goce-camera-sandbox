export interface DeviceMotionData {
  acceleration: {
    x: number;
    y: number;
    z: number;
    timestamp: number;
  } | null;
  accelerationIncludingGravity: {
    x: number;
    y: number;
    z: number;
    timestamp: number;
  };
  rotation: {
    alpha: number;
    beta: number;
    gamma: number;
    timestamp: number;
  };
  orientation: number;
}

export default interface MotionCallbacks {
  onRotation: (motionData: DeviceMotionData) => void;
  setCanCapture: (value: boolean) => void;
  setCanUndo: (value: boolean) => void;
  setCaptureComplete: (value: boolean) => void;
  setShowingStitchedImage: (value: boolean) => void;
}