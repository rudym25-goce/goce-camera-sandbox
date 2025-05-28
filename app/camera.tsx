import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-camera-vision-sandbox';

export default function CameraScreen() {
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const device = useCameraDevice('back');
  const camera = useRef<Camera>(null);

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

  const checkPermission = async () => {
    console.log('🔑 Requesting camera permission...');
    const cameraPermission = await Camera.requestCameraPermission();
    console.log('📝 Camera permission response:', cameraPermission);
    setHasPermission(cameraPermission === 'granted');
  };

  const takePhoto = async () => {
    console.log('📸 Attempting to take photo...');
    if (camera.current) {
      try {
        const photo = await camera.current.takePhoto({
          qualityPrioritization: 'quality',
          flash: 'off',
        });
        console.log('✅ Photo taken successfully:', photo.path);
        console.log('📷 Photo:', JSON.stringify(photo, (key, value) => {
          if (Array.isArray(value)) {
            if (value.length > 100) {
              return `[${value.slice(0, 100).join(',')}... and ${value.length - 100} more]`;
            }
            return `[${value.join(',')}]`;
          }
          return value;
        }, 2));
        setPhoto(`file://${photo.path}`);
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

      {photo && (
        <View style={styles.previewContainer}>
          <Image 
            source={{ uri: photo }} 
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
});