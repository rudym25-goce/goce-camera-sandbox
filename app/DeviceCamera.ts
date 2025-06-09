// our imports
import { apiManager } from './ApiManager';
import { capturePointsManager } from './CapturePointManager';
import { glManager } from './GLManager';
import { marker } from './Marker';
import { platform } from './PlatformManager';
import { sceneManager } from './SceneManager';
import { threeCamera } from './ThreeCamera';
import { DeviceMotionData } from './interfaces/MotionCallbacks';

// third-party imports
import * as Device from 'expo-device';
import { THREE } from 'expo-three';

// Define interfaces for camera intrinsics
interface CameraIntrinsics {
  focalLength: number;
  sensorSize: [number, number];
  principalPoint: [number, number];
  metadata: {
    source: string;
    deviceModel: string;
    isEstimated: boolean;
  };
}

class DeviceCamera {
    cameraIsCentered: boolean = false;
    capturingComplete: boolean = false;
    captureInProgress: boolean = false;
    // Store as any to avoid direct initialization
    deviceCamera: any = null;
    hasLiDAR: boolean = false;
    isAbove90Degrees: boolean = false;
    isUpright: boolean = false;
    showCamera: boolean = true;
    uprightTimeout: NodeJS.Timeout | null = null;
    isExtractingDepthData: boolean = false;
    private depthDataCache: Map<string, DepthData> = new Map();
    public hasDepthCapture: boolean = false;
        
    public reset() {
        this.cameraIsCentered = false;
        this.capturingComplete = false;
        this.captureInProgress = false;
        this.isAbove90Degrees = false;
        this.isUpright = false;
        this.showCamera = true;
        this.uprightTimeout = null;
        this.depthDataCache.clear();
        this.isExtractingDepthData = false;
    }

    public canCapture(): boolean {
        if (!threeCamera.camera) { return false; }
        if (this.showCamera) {
            const rotation = THREE.MathUtils.radToDeg(threeCamera.camera.rotation.x);
            this.isAbove90Degrees = rotation > 90;
            const withinTolerance = Math.abs(Math.abs(THREE.MathUtils.radToDeg(threeCamera.camera.rotation.x) - 90)) <= platform.betaTolerance;
            if (withinTolerance) {
                if (!this.uprightTimeout) {
                    this.uprightTimeout = setTimeout(() => {
                        this.isUpright = true;
                        this.uprightTimeout = null;
                    }, 300);
                }
            } else {
                if (this.uprightTimeout) {
                    clearTimeout(this.uprightTimeout);
                    this.uprightTimeout = null;
                }
                this.isUpright = false;
            }
        }
        return this.cameraIsCentered;
    }

    public handleCapture = () => {
        try {
            if (this.showCamera && this.isUpright && capturePointsManager.capturePoints.length === 0) {
                this.captureAndStoreImage();
            } else if (this.showCamera && this.cameraIsCentered) {
                this.captureAndStoreImage();
            }
        } catch (error) {
            console.error('Error capturing image:', error);
        }
    };

    // Extract depth data directly from photo metadata
    private extractDepthDataFromPhoto(photo: any): DepthData | null {
        try {
            if (!photo) {
                console.log('❌ No photo available for depth extraction');
                return null;
            }
            
            // Log basic photo metadata to help debug
            console.log(`📊 PHOTO INFO: Dimensions ${photo.width}x${photo.height}`);
            console.log(`📊 PHOTO KEYS: ${Object.keys(photo).join(', ')}`);
            
            // First check if we have direct depth data from our modified VisionCamera code
            if (photo.depthData) {
                console.log('✅ DEPTH DATA: Found direct depth data in photo object');
                
                
                
                // Create depth data object from the depth property
                const depthData: DepthData = {
                    hasDepthData: true,
                    path: photo.path,
                    photoPath: photo.path,
                    width: photo.depthData.width,
                    height: photo.depthData.height,
                    minDepth: photo.depthData.minDepth,
                    maxDepth: photo.depthData.maxDepth,
                    values: photo.depthData.values || [],
                    timestamp: Date.now(),
                    depthMapType: this.hasLiDAR ? 'lidar' : 'stereo',
                    metadata: photo.metadata
                };
                
                // Log success and detailed statistics
                if (depthData.values && Array.isArray(depthData.values)) {
                    const valueCount = depthData.values.length;
                    console.log(`📊 DEPTH VALUES: Successfully extracted ${valueCount.toLocaleString()} depth values`);
                    console.log(`📊 DEPTH RANGE: ${depthData.minDepth?.toFixed(3) ?? 'N/A'} to ${depthData.maxDepth?.toFixed(3) ?? 'N/A'} meters`);
                    
                    // Log a few sample values
                    if (valueCount > 0) {
                        const sampleValues = depthData.values.slice(0, 5).map(v => v.toFixed(3)).join(', ');
                        console.log(`📊 SAMPLE VALUES: [${sampleValues}, ...]`);
                        
                        // Count valid values
                        const validValues = depthData.values.filter(v => !isNaN(v) && v > 0 && v < 10).length;
                        console.log(`📊 VALID VALUES: ${validValues.toLocaleString()} (${((validValues/valueCount)*100).toFixed(2)}% of total)`);
                    }
                } else {
                    console.log(`⚠️ DEPTH WARNING: depth property exists but values array is empty or invalid`);
                }
                
                return depthData;
            }
            
            // Log that we couldn't find direct depth data
            console.log('⚠️ DEPTH WARNING: No direct depth data found in photo object');
            console.log('⚠️ DEPTH WARNING: Falling back to metadata extraction');
            
            // Fall back to metadata extraction if direct depth is not available
            if (!photo.metadata) {
                console.log('❌ DEPTH ERROR: No metadata available for depth extraction');
                return null;
            }
            
            console.log(`📊 METADATA KEYS: ${Object.keys(photo.metadata).join(', ')}`);
            
            // Check for Apple-specific depth data
            const makerApple = photo.metadata['{MakerApple}'];
            if (!makerApple) {
                console.log('❌ DEPTH ERROR: No {MakerApple} metadata found - depth data not available');
                return null;
            }
            
            console.log(`📊 MAKER APPLE KEYS: ${Object.keys(makerApple).join(', ')}`);
            
            // Process the raw depth data
            const rawDepthData: {
                hasDepthData: boolean;
                depthFields: Record<string, any>;
                path: string;
            } = {
                hasDepthData: false,
                depthFields: {},
                path: photo.path || ''
            };
            
            // Check for known depth-related fields in MakerApple metadata
            const potentialDepthKeys = [3, 8, 64, 78]; 
            let foundDepthInfo = false;
            
            for (const key of potentialDepthKeys) {
                if (makerApple[key] !== undefined) {
                    rawDepthData.depthFields[key] = makerApple[key];
                    rawDepthData.hasDepthData = true;
                    foundDepthInfo = true;
                    
                    console.log(`📊 DEPTH INFO: Found depth data in MakerApple[${key}]`);
                    
                    // Log structure of this depth data
                    if (typeof makerApple[key] === 'object') {
                        console.log(`📊 MAKER APPLE[${key}] KEYS: ${Object.keys(makerApple[key]).join(', ')}`);
                        
                        // Try to extract width/height if available
                        if (makerApple[key].Width && makerApple[key].Height) {
                            rawDepthData.depthFields.width = makerApple[key].Width;
                            rawDepthData.depthFields.height = makerApple[key].Height;
                            console.log(`📊 DEPTH DIMENSIONS: ${makerApple[key].Width}x${makerApple[key].Height} from key ${key}`);
                        }
                        
                        // Look for specific depth data fields
                        if (makerApple[key].Data || makerApple[key].DepthData) {
                            const depthData = makerApple[key].Data || makerApple[key].DepthData;
                            console.log(`📊 RAW DEPTH DATA: Found array with length: ${depthData?.length || 'unknown'}`);
                        }
                    }
                }
            }
            
            // Additional Apple-specific depth data
            if (makerApple.DepthData) {
                rawDepthData.depthFields.DepthData = makerApple.DepthData;
                rawDepthData.hasDepthData = true;
                foundDepthInfo = true;
                console.log(`📊 DEPTH DATA: Found DepthData in MakerApple root: ${typeof makerApple.DepthData}`);
            }
            
            if (!rawDepthData.hasDepthData) {
                console.log('❌ DEPTH ERROR: No depth data fields found in metadata');
                return null;
            }
            
            // Create a depth data object with the metadata we have
            const depthData: DepthData = {
                hasDepthData: true,
                path: photo.path,
                photoPath: photo.path,
                width: rawDepthData.depthFields.width || photo.width || 0,
                height: rawDepthData.depthFields.height || photo.height || 0,
                minDepth: 0,
                maxDepth: 1,
                timestamp: Date.now(),
                // Store raw depth fields for reference
                rawDepthData: rawDepthData.depthFields,
                // Store the photo metadata for potential future processing
                metadata: photo.metadata,
                // Add source information
                depthMapType: this.hasLiDAR ? 'lidar' : 'stereo'
            };
            
            console.log('⚠️ DEPTH LIMITATION: Successfully created depth data object from metadata (no actual depth values available)');
            console.log(`📊 DEPTH SUMMARY: Depth map dimensions: ${depthData.width}x${depthData.height}, source: ${depthData.depthMapType}`);
            
            return depthData;
            
        } catch (error) {
            console.error('❌ DEPTH ERROR: Error extracting depth data:', error);
            return null;
        }
    }
    
    // Create a synthetic depth map when real depth data is unavailable
    private createSyntheticDepthMap(width: number, height: number): number[] {
        try {
            // Reduce resolution even more to avoid stack overflow
            const downsampleFactor = 16; // Increased from 8 to 16
            const sampledWidth = Math.max(1, Math.floor(width / downsampleFactor));
            const sampledHeight = Math.max(1, Math.floor(height / downsampleFactor));
            
            // Pre-allocate array to avoid dynamic resizing
            const totalSize = sampledWidth * sampledHeight;
            
            // Use a more efficient approach with a pre-allocated array
            // and avoid repeatedly pushing to the array which can cause stack issues
            const depthValues = new Array(totalSize);
            
            // Calculate center once
            const centerX = sampledWidth / 2;
            const centerY = sampledHeight / 2;
            
            // Fill with simulated depth values
            for (let i = 0; i < totalSize; i++) {
                // Convert flat index to 2D coordinates
                const x = i % sampledWidth;
                const y = Math.floor(i / sampledWidth);
                
                // Calculate distance from center (normalized)
                const dx = (x - centerX) / centerX;
                const dy = (y - centerY) / centerY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Create depth value (closer in center, further at edges)
                // Clamp to reasonable range to avoid extreme values
                const depth = Math.min(5.0, Math.max(0.5, 1.0 + distance * 3.0));
                
                // Set value directly in the array
                depthValues[i] = depth;
            }
            
            console.log(`Created synthetic depth map ${sampledWidth}x${sampledHeight} with ${depthValues.length} values`);
            return depthValues;
            
        } catch (error) {
            console.error('Error creating synthetic depth map:', error);
            // Return a minimal depth map instead of empty array
            return [1.0, 2.0, 3.0, 4.0, 2.0, 1.0, 2.0, 3.0, 2.0];
        }
    }
    
    // Process extracted depth data for cloud processing - simplified version
    private prepareDepthDataForCloudProcessing(depthData: DepthData): DepthData {
        try {
            // If we already have a fully processed depth map with values, just return it
            if (depthData.values && depthData.values.length > 0) {
                return depthData;
            }
            
            // For now, just add cloud processing flags
            return {
                ...depthData,
                cloudProcessingReady: true,
                isCloudReady: true
            };
            
        } catch (error) {
            console.error('Error preparing depth data for cloud processing:', error);
            return depthData;
        }
    }

    private calculateIntuitivePitch = (beta: number, accelZ: number) => {
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

    // Capture and store image with depth data
    public captureAndStoreImage = async (motionData?: DeviceMotionData) => {
        try {
            if (this.deviceCamera !== null && threeCamera.camera) {
                let rotation = threeCamera.camera.rotation.clone();
                
                // Mark capture in progress to prevent multiple captures
                this.captureInProgress = true;
                
                // Take the photo
                const photo = await this.deviceCamera?.takePhoto();

                if (photo) {
                    console.log(`Photo captured successfully: ${photo.width}x${photo.height}`);
                    console.log(`Photo object keys: ${Object.keys(photo).join(', ')}`);
                    console.log(`PhotoFile: ${JSON.stringify(photo, (key, value) => {
                      if (key === 'depthData' || key === 'metadata') return undefined;
                      return value;
                    }, 2)}`);
                    
                    // Add the motion data to the photo if available
                    if (motionData) {
                        photo.deviceOrientation = {
                            pitch: motionData.rotation.beta,
                            roll: motionData.rotation.gamma,
                            yaw: motionData.rotation.alpha,
                            intuitivePitch: this.calculateIntuitivePitch(
                                motionData.rotation.beta,
                                motionData.accelerationIncludingGravity.z
                            )
                        };
                    }
                    
                    let capturePoint = capturePointsManager.currentPoint;
                    if (capturePoint) {
                        sceneManager.removeThreeElement(capturePoint.marker);
                        capturePoint.marker = null;
                        capturePoint.photo = photo;
                        capturePoint.rotation = rotation;
                        
                        // Only extract depth data if present, don't generate synthetic data
                        if (photo.depthData) {
                            console.log('📊 DEPTH DATA: Found depth data in photo');
                            capturePoint.depthData = this.extractDepthDataFromPhoto(photo);
                        } else {
                            capturePoint.depthData = null;
                        }
                        
                        // Continue with saving the image
                        apiManager.saveImage(capturePoint);
                    }

                    // Move to next capture point
                    capturePoint = capturePointsManager.nextPoint();
                    if (capturePoint) {
                        const { x, y, z } = capturePoint.position || { x: 0, y: 0, z: 0 };
                        capturePoint.marker = marker.createMarker(x, y, z);
                        marker.activeMarker = capturePoint.marker;
                        sceneManager.scene.add(marker.activeMarker);
                    } else {
                        marker.activeMarker = null;
                        this.capturingComplete = true;
                        glManager.resetGLView();
                    }
                    this.resetCaptureStates();
                } else {
                    console.error('Failed to capture photo');
                    this.captureInProgress = false;
                }
            } else {
                console.error('Cannot capture image - camera not initialized');
                this.captureInProgress = false;
            }
        } catch (error) {
            console.error('Error capturing image:', error);
            this.captureInProgress = false;
        }
    };

    public resetCaptureStates = () => {
        this.captureInProgress = false;
        sceneManager.removeArrow();
    };

    public undoCapture = async () => {
        let capturePoint = capturePointsManager.currentPoint;
        if (!capturePoint) { return; }
        capturePoint.marker.visible = false;
        capturePoint = capturePointsManager.previousPoint();
        if (!capturePoint) { return; }
        sceneManager.disposePlate(capturePoint);
        capturePoint.plate = null;
        capturePoint.complete = false;
        const { x, y, z } = capturePoint.position || { x: 0, y: 0, z: 0 };
        capturePoint.marker = marker.createMarker(x, y, z);
        
        // Clean up depth data
        if (capturePoint.depthData) {
            // Remove from cache
            const cacheKey = capturePoint.photo?.path;
            if (cacheKey) {
                this.depthDataCache.delete(cacheKey);
            }
            
            // Clear depth data
            capturePoint.depthData = null;
        }
        
        if (capturePoint.photo) {
            try {
                // Delete photo file
                if (capturePoint.photo.path) {
                    await FileSystem.unlink(`file://${capturePoint.photo.path}`);
                }
            } catch (error) {
                console.error('Error deleting photo file:', error);
            }
            capturePoint.photo = null;
        }
        sceneManager.scene.add(capturePoint.marker);
        marker.activeMarker = capturePoint.marker;
    };

    public validateDepthData = (depthData: any): boolean => {
        if (!depthData) return false;
        
        // Basic validation to ensure we have required fields
        if (!depthData.path || !depthData.hasDepthData) {
            return false;
        }
        
        // If we have depth values, perform more detailed validation
        if (depthData.values && depthData.values.length > 0) {
        // Check if depth range is too small
        if (depthData.maxDepth - depthData.minDepth < 0.1) {
            console.warn('Low depth range detected');
            return false;
        }
        
        // Check if too many values are at min/max (could indicate poor depth data)
        const values = depthData.values;
            let minCount = 0, maxCount = 0, nanCount = 0;
            
        for (const val of values) {
                if (isNaN(val)) nanCount++;
            if (val === depthData.minDepth) minCount++;
            if (val === depthData.maxDepth) maxCount++;
        }
            
            // Too many NaN values indicate bad depth data
            if (nanCount > values.length * 0.1) {
                console.warn('Too many NaN values in depth data');
                return false;
            }
        
        const threshold = values.length * 0.3; // 30% threshold
        if (minCount > threshold || maxCount > threshold) {
            console.warn('Depth data may be low quality (too many min/max values)');
            return false;
            }
        }
        
        return true;
    };

    

    
    
    
    
    // Check if camera is properly initialized and ready for depth capture
    public isCameraInitialized(): boolean {
        // Check if we have a camera reference
        const hasCamera = !!this.deviceCamera;
        
        // Check if the camera has the takePhoto method (key functionality)
        const canTakePhoto = hasCamera && typeof this.deviceCamera?.takePhoto === 'function';
        
        // Log detailed status
        console.log(`📊 CAMERA STATUS: Camera reference exists: ${hasCamera}`);
        if (hasCamera) {
            console.log(`📊 CAMERA STATUS: Camera can take photos: ${canTakePhoto}`);
            console.log(`📊 CAMERA STATUS: Camera object keys: ${Object.keys(this.deviceCamera || {}).join(', ')}`);
        }
        
        return hasCamera && canTakePhoto;
    }

    /**
     * Extracts camera intrinsics from the photo metadata in a type-safe manner.
     * This includes focal length, sensor size, and principal point, which are
     * required for the ARKit data payload.
     * 
     * @param photo The photo object from which to extract camera intrinsics
     * @returns A structured object with camera intrinsics or default values if extraction fails
     */
    public extractCameraIntrinsics(photo: any): CameraIntrinsics {
      // Default fallback values
      const defaultIntrinsics: CameraIntrinsics = {
        focalLength: 28.0,
        sensorSize: [36.0, 24.0],
        principalPoint: [18.0, 12.0],
        metadata: {
          source: 'default',
          deviceModel: Device.modelName || 'unknown',
          isEstimated: true
        }
      };

      // If no photo or metadata, return defaults
      if (!photo || !photo.metadata) {
        console.log('No photo or metadata available, using default camera intrinsics');
        return defaultIntrinsics;
      }

      try {
        // Initialize with the defaults (we'll override them if real data exists)
        const intrinsics: CameraIntrinsics = { ...defaultIntrinsics };
        intrinsics.metadata.isEstimated = false;
        
        const metadata = photo.metadata;
        let source = 'default';
        
        // 1. Try to extract focal length from different sources
        if (metadata['{Exif}']?.FocalLength !== undefined) {
          // Safely convert to number, handling both number and string types
          const focalLen = metadata['{Exif}'].FocalLength;
          intrinsics.focalLength = typeof focalLen === 'number' ? focalLen :
                                 typeof focalLen === 'string' ? parseFloat(focalLen) : defaultIntrinsics.focalLength;
          source = 'EXIF';
        } 
        else if (metadata['{Exif}']?.FocalLenIn35mmFilm !== undefined) {
          // Use 35mm equivalent with conversion
          const focalLen35mm = metadata['{Exif}'].FocalLenIn35mmFilm;
          const focalLen35 = typeof focalLen35mm === 'number' ? focalLen35mm :
                           typeof focalLen35mm === 'string' ? parseFloat(focalLen35mm) : 0;
          
          if (focalLen35 > 0) {
            // Apply a typical crop factor (varies by device)
            intrinsics.focalLength = focalLen35 / 1.5; // Approximate conversion from 35mm equiv.
            source = 'EXIF-35mm';
          }
        }
        
        // Check Apple-specific metadata for index 3
        const appleMetadata = metadata['{MakerApple}'] || {};
        const appleData = typeof appleMetadata === 'object' && appleMetadata !== null ? appleMetadata[3] : null;
        
        if (appleData && typeof appleData === 'object' && appleData !== null) {
          // 2. Try Apple's calibration data for sensor and principal point
          if ('CalibrationData' in appleData && appleData.CalibrationData) {
            const calibData = appleData.CalibrationData;
            
            // Extract sensor size if available
            if (calibData.SensorWidth && calibData.SensorHeight) {
              intrinsics.sensorSize = [
                typeof calibData.SensorWidth === 'number' ? calibData.SensorWidth : parseFloat(String(calibData.SensorWidth)),
                typeof calibData.SensorHeight === 'number' ? calibData.SensorHeight : parseFloat(String(calibData.SensorHeight))
              ];
              source = 'Apple-Calib';
            }
            
            // Extract principal point if available
            if (calibData.PrincipalPointX !== undefined && calibData.PrincipalPointY !== undefined) {
              intrinsics.principalPoint = [
                typeof calibData.PrincipalPointX === 'number' ? calibData.PrincipalPointX : parseFloat(String(calibData.PrincipalPointX)),
                typeof calibData.PrincipalPointY === 'number' ? calibData.PrincipalPointY : parseFloat(String(calibData.PrincipalPointY))
              ];
            } else {
              // If principal point isn't explicit, use the sensor center
              intrinsics.principalPoint = [
                intrinsics.sensorSize[0] / 2,
                intrinsics.sensorSize[1] / 2
              ];
            }
          }
          
          // 3. Try Apple's focal length data if we still don't have it
          if (intrinsics.focalLength === defaultIntrinsics.focalLength && 
              'FocalLengthIn35mmFilm' in appleData && 
              typeof appleData.FocalLengthIn35mmFilm !== 'undefined') {
            
            const focalLen35 = typeof appleData.FocalLengthIn35mmFilm === 'number' ? 
                             appleData.FocalLengthIn35mmFilm : 
                             parseFloat(String(appleData.FocalLengthIn35mmFilm));
            
            if (!isNaN(focalLen35) && focalLen35 > 0) {
              // Convert from 35mm equivalent to actual focal length
              intrinsics.focalLength = focalLen35 / 1.5; // Approximate conversion
              if (source === 'default') source = 'Apple-FocalLength';
            }
          }
        }
        
        // 4. Calculate from photo dimensions and FOV if available
        if (intrinsics.sensorSize[0] === defaultIntrinsics.sensorSize[0] && 
            photo.width && photo.height && 
            metadata['{Exif}']?.FocalLenIn35mmFilm) {
          
          const focalLength35mm = typeof metadata['{Exif}'].FocalLenIn35mmFilm === 'number' ? 
                              metadata['{Exif}'].FocalLenIn35mmFilm : 
                              parseFloat(String(metadata['{Exif}'].FocalLenIn35mmFilm));
          
          if (!isNaN(focalLength35mm) && focalLength35mm > 0) {
            const aspectRatio = photo.width / photo.height;
            
            // Standard 35mm film dimensions (36mm x 24mm)
            const standard35mmWidth = 36.0;
            // Calculate real sensor size based on 35mm equivalent
            const calculatedWidth = standard35mmWidth * (intrinsics.focalLength / focalLength35mm);
            const calculatedHeight = calculatedWidth / aspectRatio;
            
            // Update if we've produced reasonable values
            if (calculatedWidth > 0 && calculatedHeight > 0 && 
                calculatedWidth < standard35mmWidth) { // If smaller than 35mm film (reasonable)
              
              intrinsics.sensorSize = [calculatedWidth, calculatedHeight];
              intrinsics.principalPoint = [calculatedWidth/2, calculatedHeight/2];
              if (source === 'default') source = 'Calculated';
            }
          }
        }
        
        // 5. Use device-specific calibration data as a fallback
        const deviceModel = Device.modelName || '';
        if ((intrinsics.sensorSize[0] === defaultIntrinsics.sensorSize[0] || 
            intrinsics.principalPoint[0] === defaultIntrinsics.principalPoint[0]) && 
            deviceModel) {
          
          let deviceParams: { 
            sensorSize: [number, number]; 
            principalPoint: [number, number];
          } | null = null;
          
          // Lookup device-specific parameters
          if (deviceModel.includes('iPhone 13 Pro')) {
            deviceParams = {
              sensorSize: [7.73, 5.79], // in mm
              principalPoint: [3.86, 2.90] // in mm
            };
          } else if (deviceModel.includes('iPhone 14 Pro')) {
            deviceParams = {
              sensorSize: [8.2, 6.2], // in mm
              principalPoint: [4.1, 3.1] // in mm
            };
          } else if (deviceModel.includes('iPhone 12 Pro')) {
            deviceParams = {
              sensorSize: [7.3, 5.5], // in mm
              principalPoint: [3.65, 2.75] // in mm
            };
          } else if (deviceModel.includes('iPhone 15')) {
            deviceParams = {
              sensorSize: [8.2, 6.2], // in mm
              principalPoint: [4.1, 3.1] // in mm
            };
          } else if (deviceModel.includes('iPhone')) {
            // Generic iPhone parameters (recent models)
            deviceParams = {
              sensorSize: [7.5, 5.6], // in mm
              principalPoint: [3.75, 2.8] // in mm
            };
          } else if (deviceModel.includes('iPad Pro')) {
            // iPad Pro parameters
            deviceParams = {
              sensorSize: [8.0, 6.0], // in mm
              principalPoint: [4.0, 3.0] // in mm
            };
          }
          
          // Apply device-specific parameters if available
          if (deviceParams) {
            // Only override if we're still using defaults
            if (intrinsics.sensorSize[0] === defaultIntrinsics.sensorSize[0]) {
              intrinsics.sensorSize = deviceParams.sensorSize;
            }
            
            if (intrinsics.principalPoint[0] === defaultIntrinsics.principalPoint[0]) {
              intrinsics.principalPoint = deviceParams.principalPoint;
            }
            
            if (source === 'default') source = 'DeviceModel';
          }
        }
        
        // Update metadata
        intrinsics.metadata.source = source;
        intrinsics.metadata.isEstimated = source === 'default' || source === 'DeviceModel';
        
        // Validate the values
        if (isNaN(intrinsics.focalLength) || intrinsics.focalLength <= 0) {
          intrinsics.focalLength = defaultIntrinsics.focalLength;
          intrinsics.metadata.isEstimated = true;
        }
        
        if (isNaN(intrinsics.sensorSize[0]) || isNaN(intrinsics.sensorSize[1]) || 
            intrinsics.sensorSize[0] <= 0 || intrinsics.sensorSize[1] <= 0) {
          intrinsics.sensorSize = defaultIntrinsics.sensorSize;
          intrinsics.metadata.isEstimated = true;
        }
        
        if (isNaN(intrinsics.principalPoint[0]) || isNaN(intrinsics.principalPoint[1])) {
          intrinsics.principalPoint = defaultIntrinsics.principalPoint;
          intrinsics.metadata.isEstimated = true;
        }
        
        return intrinsics;
      } catch (error) {
        console.error('Error extracting camera intrinsics:', error);
        // Return defaults on error
        return defaultIntrinsics;
      }
    }
}
export const deviceCamera = new DeviceCamera();