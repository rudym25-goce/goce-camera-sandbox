import { useIsFocused } from '@react-navigation/native';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { Gyroscope } from 'expo-sensors';
import { StatusBar } from 'expo-status-bar';
import { THREE } from 'expo-three';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { COLORS } from '../styles/constants';
import { capturePointsManager } from './CapturePointManager';
import { deviceCamera } from './DeviceCamera';
import { glManager } from './GLManager';
import { instance } from './Instance';
import { DeviceMotionData } from './interfaces/MotionCallbacks';
import { marker } from './Marker';
import { motionManager } from './MotionManager';
import { resetManager } from './ResetManager';
import { sceneManager } from './SceneManager';
import { threeCamera } from './ThreeCamera';



export default function PanoramaCamera() {
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const device = useCameraDevice('back');
  const isFocused = useIsFocused();
  const [subscription, setSubscription] = React.useState<any>(null);
  const rotationRef = useRef({ x: 0, y: 0, z: 0 });
  const [canCapture, setCanCapture] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [captureComplete, setCaptureComplete] = useState(false);
  const [showingStitchedImage, setShowingStitchedImage] = useState(false);
  const [intuitivePitch, setIntuitivePitch] = useState(0);
  const latestPitchRef = useRef(0);
  const latestRotationRef = useRef({ alpha: 0, beta: 0, gamma: 0 });
  const latestMotionDataRef = useRef<DeviceMotionData | null>(null);
  
  // Add logging to cancelCaptureProcess
  const cancelCaptureProcess = async () => {
    try {
        console.log('Cancel capture process');
        await resetManager.resetCaptureVariables()
    } catch(error) {
      console.error('Error cancelling capture:', error);
    }
  };

  const handleCapture = async () => {
    try {
      console.log('Capture image');
    } catch(error) {
      console.error('Error capturing image:', error);
    }
  };

  const submitStitchedImage = async () => {
    try {
      console.log('Submit stitched image');
    } catch (error) {
      console.error('Error submitting images:', error);
    }
  };

  useEffect(() => {
    console.log('🔍 PanoramaCamera mounted');
    checkPermission();
  }, []);

  useEffect(() => {
    console.log('📸 Camera device status:', device ? 'Available' : 'Not available');
  }, [device]);

  useEffect(() => {
    console.log('🔐 Camera permission status:', hasPermission ? 'Granted' : 'Not granted');
  }, [hasPermission]);
  

  const checkPermission = async () => {
    console.log('🔑 Requesting camera permission...');
    const cameraPermission = await Camera.requestCameraPermission();
    console.log('📝 Camera permission response:', cameraPermission);
    setHasPermission(cameraPermission === 'granted');
  };

  useEffect(() => {
    if (isFocused) {
      const sub = Gyroscope.addListener(({ x, y, z }) => {
        rotationRef.current = { x, y, z };
      });
      setSubscription(sub);
      Gyroscope.setUpdateInterval(16);
    } else {
      if (subscription) {
        subscription.unsubscribe();
      }
    }
  }, [isFocused]);

  // Function to calculate intuitive pitch angle
  const calculateIntuitivePitch = (beta: number, accelZ: number) => {
    // Convert beta to degrees if it's in radians
    const betaDegrees = THREE.MathUtils.radToDeg(beta);
    
    // Use acceleration to determine direction
    // If accelZ is positive, device is face down
    // If accelZ is negative, device is face up
    const direction = accelZ > 0 ? 1 : -1;
    
    // Calculate intuitive pitch
    let pitch = betaDegrees;
    
    // Normalize the angle to be between 0 and 360
    if (pitch < 0) {
      pitch += 360;
    }
    
    // When face down, we need to adjust the angle to continue the progression
    if (direction > 0) {
      pitch = 90 + (90 - pitch);
    }
    
    return pitch;
  };

  // Initialize device motion tracking if permission is granted
  useEffect(() => {
    const initMotion = async () => {
      if (hasPermission) {
        const success = await motionManager.startMotionTracking({
          onRotation: (motionData) => {
            if (threeCamera.camera) {
              latestMotionDataRef.current = motionData;
              
              if (motionData.rotation) {
                threeCamera.setRotation(motionData.rotation);
                latestRotationRef.current = motionData.rotation;
                
                if (motionData.accelerationIncludingGravity) {
                  const pitch = calculateIntuitivePitch(
                    motionData.rotation.beta,
                    motionData.accelerationIncludingGravity.z
                  );
                  latestPitchRef.current = pitch;
                }
              }
              
              if (marker.activeMarker) {
                const isCentered = marker.isMarkerCentered();
                if (isCentered !== deviceCamera.cameraIsCentered) {
                  deviceCamera.cameraIsCentered = isCentered;
                }
                
                if (isCentered && !deviceCamera.captureInProgress) {
                  deviceCamera.captureInProgress = true;
                  deviceCamera.captureAndStoreImage(latestMotionDataRef.current);
                }
              }
            }
          },
          setCanCapture: (value) => setCanCapture(prev => prev !== value ? value : prev),
          setCanUndo: (value) => setCanUndo(prev => prev !== value ? value : prev),
          setCaptureComplete: (value) => setCaptureComplete(prev => prev !== value ? value : prev),
          setShowingStitchedImage: (value) => setShowingStitchedImage(prev => prev !== value ? value : prev)
        });
      }
    };

    initMotion();
    return () => {
      motionManager.stopMotionTracking();
    };
  }, [hasPermission]);

  // Add this effect to handle the interval updates
  useEffect(() => {
    const interval = setInterval(() => {
      setIntuitivePitch(latestPitchRef.current);
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, []);

  /**
   * Initializes the WebGL context and handles 3D rendering setup for different modes:
   * - StartCapture: Sets up the capture interface for taking photos
   */
  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    try {
      console.log('==== CONTEXT CREATE STARTED ====');
      // Initialize the GL manager (loads the WebGL context)
      glManager.loadComplete = false;
      await glManager.onContextCreate(gl);
      
      console.log('onContextCreate - Context created successfully');
      sceneManager.removeTexturesFromSphere();
      if (capturePointsManager.capturePoints.length === 0) {
        // Capturing a 360° image
        // Sets up capture points for taking photos
        let rotation = threeCamera.camera.rotation.clone();
        let forward = new THREE.Vector3(0, 0, -1);
        forward.applyEuler(rotation);
        let forwardPosition = threeCamera.camera.position.clone().add(forward.multiplyScalar(5));
        capturePointsManager.add(marker.createCapturePoints(forwardPosition, instance.environment));
      }
      console.log('==== CONTEXT CREATE FINISHED ====');
    } catch (error) {
      console.error('ERROR in onContextCreate:', error);
    }
  };

  if (!hasPermission) {
    return (
      <View style={styles.mainContainer}>
        <Text style={styles.debugTextStyle}>No access to camera</Text>
      </View>
    );
  }

  if (!device) {
    console.log('🚫 Rendering no device view');
    return (
      <View style={styles.mainContainer}>
        <Text style={styles.debugTextStyle}>No camera device found</Text>
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar style="light" />
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        enableDepthData={true}
        photo={true}
        ref={(ref: any) => deviceCamera.deviceCamera = ref}
        onInitialized={() => {
          console.log('✅ CAMERA INITIALIZED: Camera has been initialized');
        }}
        onError={(error: any) => {
          console.error("Camera error:", error);
        }}
      />
      
      {/* GL Layer */}
      <GLView
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'transparent' }
        ]}
        onContextCreate={onContextCreate}
      />
      {/* Debug Overlay */}
      <View style={styles.debugOverlay}>
        <Text style={styles.debugTextStyle}>
          Intuitive Pitch: {intuitivePitch.toFixed(2)}°
        </Text>
      </View>
      {/* UI Layer - Always on top */}
      <View style={styles.uiContainer}>
        {/* Cancel Button */}
        {(!captureComplete || !showingStitchedImage) && (
          <TouchableOpacity  
            style={styles.cancelButton}
            onPress={cancelCaptureProcess}
          >
            <Text style={styles.undoButtonText}>
              {'Cancel'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Undo Button */}
        {((canUndo && !captureComplete)) && (
          <TouchableOpacity  
            style={styles.undoButton}
            onPress={deviceCamera.undoCapture}
          >
            <Text style={styles.undoButtonText}>
              {'Undo'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Capture Button */}
        {!captureComplete && (
          <TouchableOpacity
            style={[
              styles.captureButton,
              canCapture ? styles.captureButtonActive : styles.captureButtonInactive
            ]}
            onPress={handleCapture}
          />
        )}

        {/* Submit Button */}
        {showingStitchedImage && (
          <TouchableOpacity 
            style={styles.submitButton}
            onPress={submitStitchedImage}
          >
            <Text style={styles.submitButtonText}>
              Submit
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const { width, height } = Dimensions.get('window');
const buttonSize = Math.min(width, height) * 0.2; // 20% of the smaller dimension

const styles = StyleSheet.create({
  cancelButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 10,
    borderRadius: 5,
  },
  captureButton: {
    width: buttonSize,
    height: buttonSize,
    borderRadius: buttonSize / 2,
    borderWidth: 5,
    borderColor: 'white',
    backgroundColor: 'transparent',
  },
  captureButtonActive: {
    borderColor: COLORS.success.hex,
  },
  captureButtonInactive: {
    borderColor: COLORS.primary.hex,
  },
  capturedImage: {
    flex: 1,
    resizeMode: 'contain',
  },
  container: {
    flex: 1,
  },
  fullScreen: {
    ...StyleSheet.absoluteFillObject, // Fills the mainContainer
  },
  hidden: {
    opacity: 0,
  },
  hiddenView: {
    opacity: 0,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },
  mainContainer: {
    flex: 1,
    position: 'relative', // Explicit positioning context
  },
  submitButton: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: COLORS.global.hex,
    padding: 15,
    borderRadius: 10,
  },
  saveDataButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 15,
    borderRadius: 10,
  },
  saveDepthButton: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 15,
    borderRadius: 10,
  },
  submitButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  uiContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  undoButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 10,
    borderRadius: 5,
  },
  undoButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  toggleViewButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    padding: 12,
    elevation: 5, // Android
    shadowColor: '#000', // iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  flipImageButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    padding: 12,
    elevation: 5, // Android
    shadowColor: '#000', // iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  controlText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  testButton: {
    position: 'absolute',
    top: 40,
    left: 120,
    backgroundColor: 'rgba(255, 50, 50, 0.9)',
    padding: 15,
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
    zIndex: 1000,
  },
  testModeButton: {
    position: 'absolute',
    top: 100,
    right: 20,
    backgroundColor: 'rgba(200, 50, 50, 0.8)',
    padding: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center'
  },
  testButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  debugButton: {
    backgroundColor: 'rgba(0, 100, 200, 0.8)',
    padding: 8,
    borderRadius: 4,
    marginTop: 5,
    alignItems: 'center',
  },
  debugInfo: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 10,
    borderRadius: 5,
    zIndex: 1000,
  },
  debugText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: 4,
  },
  debugButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  debugOverlay: {
    position: 'absolute',
    top: 50,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 10,
    borderRadius: 5,
  },
  debugTextStyle: {
    color: 'white',
    fontSize: 12,
    marginBottom: 5,
  },
});