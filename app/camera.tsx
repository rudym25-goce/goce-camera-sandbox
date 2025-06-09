import { BlurView } from 'expo-blur';
import * as FileSystem from 'expo-file-system';
import { DeviceMotion, Gyroscope } from 'expo-sensors';
import { StatusBar } from 'expo-status-bar';
import { THREE } from 'expo-three';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { zip } from 'react-native-zip-archive';

interface DeviceMotionData {
  rotation?: {
    alpha: number;
    beta: number;
    gamma: number;
  };
  accelerationIncludingGravity?: {
    x: number;
    y: number;
    z: number;
  };
}

interface PhotoWithMetadata {
  path: string;
  timestamp: string;
  motion: {
    rotation: { x: number; y: number; z: number };
    pitch: number;
    deviceOrientation?: {
      pitch: number;
      roll: number;
      yaw: number;
      intuitivePitch: number;
    };
  };
}

export default function CameraScreen() {
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [photo, setPhoto] = useState<PhotoWithMetadata | null>(null);
  const device = useCameraDevice('back');
  const camera = useRef<Camera>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [motionSubscription, setMotionSubscription] = useState<any>(null);
  const rotationRef = useRef({ x: 0, y: 0, z: 0 });
  const latestMotionDataRef = useRef<DeviceMotionData | null>(null);
  const [intuitivePitch, setIntuitivePitch] = useState(0);
  const latestPitchRef = useRef(0);
  const lastSavedPayloadPath = useRef<string | null>(null);
  const latestRotationRef = useRef({ alpha: 0, beta: 0, gamma: 0 });

  useEffect(() => {
    console.log('🔍 CameraScreen mounted');
    checkPermission();
  }, []);

  useEffect(() => {
    console.log('📸 Camera device status:', device ? 'Available' : 'Not available');
  }, [device]);

  useEffect(() => {
    console.log('🔐 Camera permission status:', hasPermission ? 'Granted' : 'Not granted');
  }, [hasPermission]);

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

  // Initialize motion tracking
  useEffect(() => {
    if (hasPermission) {
      // Set up device motion tracking
      const motionSub = DeviceMotion.addListener((motionData) => {
        latestMotionDataRef.current = {
          rotation: {
            alpha: motionData.rotation.alpha,
            beta: motionData.rotation.beta,
            gamma: motionData.rotation.gamma
          },
          accelerationIncludingGravity: {
            x: motionData.accelerationIncludingGravity.x,
            y: motionData.accelerationIncludingGravity.y,
            z: motionData.accelerationIncludingGravity.z
          }
        };

        // Calculate intuitive pitch
        const pitch = calculateIntuitivePitch(
          motionData.rotation.beta,
          motionData.accelerationIncludingGravity.z
        );
        latestPitchRef.current = pitch;
        setIntuitivePitch(pitch);
      });

      // Set up gyroscope tracking
      const gyroSub = Gyroscope.addListener(({ x, y, z }) => {
        rotationRef.current = { x, y, z };
      });

      setMotionSubscription(motionSub);
      setSubscription(gyroSub);
      
      // Set update intervals
      DeviceMotion.setUpdateInterval(16);
      Gyroscope.setUpdateInterval(16);

      return () => {
        if (motionSubscription) {
          motionSubscription.unsubscribe();
        }
        if (subscription) {
          subscription.unsubscribe();
        }
      };
    }
  }, [hasPermission]);

  const checkPermission = async () => {
    console.log('🔑 Requesting camera permission...');
    const cameraPermission = await Camera.requestCameraPermission();
    console.log('📝 Camera permission response:', cameraPermission);
    setHasPermission(cameraPermission === 'granted');
  };

  const savePhotoAndMetadata = async (photoPath: string, metadata: PhotoWithMetadata) => {
    try {
      // Create directories
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const captureDir = `${FileSystem.documentDirectory}/captures/capture_${timestamp}`;
      const imagesDir = `${captureDir}/images`;
      
      // Create directories if they don't exist
      await FileSystem.makeDirectoryAsync(captureDir, { intermediates: true });
      await FileSystem.makeDirectoryAsync(imagesDir, { intermediates: true });

      // Copy the photo to the images directory
      const targetPath = `${imagesDir}/image.jpg`;
      await FileSystem.copyAsync({
        from: photoPath,
        to: targetPath
      });

      // Save metadata
      const metadataPath = `${captureDir}/metadata.json`;
      await FileSystem.writeAsStringAsync(metadataPath, JSON.stringify(metadata, null, 2));

      // Create zip file
      const zipPath = `${FileSystem.documentDirectory}/captures/capture_${timestamp}.zip`;
      await zip(captureDir, zipPath);

      // Store the latest file path
      lastSavedPayloadPath.current = zipPath;

      console.log('✅ Photo and metadata saved to:', captureDir);
      console.log('📦 Zip file created at:', zipPath);

      // Show alert and share
      alert('✅ Photo and metadata saved successfully!\nTap OK to share the file.');
      await sharePayloadFile();

      return captureDir;
    } catch (error) {
      console.error('❌ Error saving photo and metadata:', error);
      throw error;
    }
  };

  const sharePayloadFile = async () => {
    try {
      if (!lastSavedPayloadPath.current) {
        console.warn('No payload file has been saved yet');
        alert('No payload file has been generated yet. Please take a photo first.');
        return;
      }

      // For iOS, we need to use the file:// URL format
      const shareUrl = Platform.OS === 'ios' 
        ? `file://${lastSavedPayloadPath.current}`
        : lastSavedPayloadPath.current;

      console.log('Attempting to share file from:', shareUrl);

      try {
        const result = await Share.share({
          url: shareUrl,
          message: 'Here is the camera capture data with metadata',
          title: 'Camera Capture Data',
        });

        if (result.action === Share.sharedAction) {
          console.log('Content shared successfully');
        } else if (result.action === Share.dismissedAction) {
          console.log('Share dialog dismissed');
        }
      } catch (shareError) {
        console.error('Error using Share API:', shareError);
        alert(`Files are ready to share. You can find them at: ${shareUrl}`);
      }
    } catch (error: any) {
      console.error('Error sharing files:', error);
      alert(`Error preparing files: ${error.message || error}`);
    }
  };

  const takePhoto = async () => {
    console.log('📸 Attempting to take photo...');
    if (camera.current) {
      try {
        const photo = await camera.current.takePhoto({
          flash: 'off',
        });
        console.log('✅ Photo taken successfully:', photo.path);
        
        // Create photo with metadata
        const photoWithMetadata: PhotoWithMetadata = {
          path: photo.path,
          timestamp: new Date().toISOString(),
          motion: {
            rotation: rotationRef.current,
            pitch: latestPitchRef.current,
            deviceOrientation: latestMotionDataRef.current?.rotation ? {
              pitch: latestMotionDataRef.current.rotation.beta,
              roll: latestMotionDataRef.current.rotation.gamma,
              yaw: latestMotionDataRef.current.rotation.alpha,
              intuitivePitch: latestPitchRef.current
            } : undefined
          }
        };
        
        // Save photo and metadata to files
        await savePhotoAndMetadata(photo.path, photoWithMetadata);
        
        // Use the photo with metadata for preview
        setPhoto(photoWithMetadata);
        
        // Log the metadata
        console.log('📊 Photo metadata:', {
          timestamp: photoWithMetadata.timestamp,
          motion: photoWithMetadata.motion
        });
      } catch (error) {
        console.error('❌ Failed to take photo:', error);
      }
    } else {
      console.warn('⚠️ Camera ref is not available');
    }
  };

  if (!hasPermission) {
    console.log('🚫 Rendering no permission view');
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No access to camera</Text>
      </View>
    );
  }

  if (!device) {
    console.log('🚫 Rendering no device view');
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No camera device found</Text>
      </View>
    );
  }

  console.log('🎥 Rendering camera view');
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
        enableDepthData={true}
        onError={(error) => {
          console.error('❌ Camera error:', error);
        }}
      />
      
      <View style={styles.controls}>
        <BlurView intensity={20} style={styles.blurContainer}>
          <TouchableOpacity
            style={styles.captureButton}
            onPress={takePhoto}
          >
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
        </BlurView>
      </View>

      {/* Debug Overlay */}
      <View style={styles.debugOverlay}>
        <Text style={styles.debugTextStyle}>
          Intuitive Pitch: {intuitivePitch.toFixed(2)}°
        </Text>
      </View>

      {photo && (
        <View style={styles.previewContainer}>
          <Image 
            source={{ uri: photo.path }} 
            style={styles.preview}
            onLoad={() => console.log('🖼️ Photo preview loaded')}
            onError={(error) => console.error('❌ Photo preview error:', error.nativeEvent)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  text: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  blurContainer: {
    padding: 20,
    borderRadius: 30,
    overflow: 'hidden',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'white',
  },
  previewContainer: {
    position: 'absolute',
    bottom: 120,
    right: 20,
    width: 100,
    height: 100,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'white',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  debugOverlay: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 10,
  },
  debugTextStyle: {
    color: 'white',
    fontSize: 14,
  },
});