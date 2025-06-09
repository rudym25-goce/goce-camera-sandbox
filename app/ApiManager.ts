//our imports
import { capturePointsManager } from './CapturePointManager';
import CapturePoint from './interfaces/CapturePoint';

//third-party imports
import Constants from "expo-constants";
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { THREE } from "expo-three";
import { Platform, Share } from 'react-native';
import { zip } from 'react-native-zip-archive';
import { deviceCamera } from "./DeviceCamera";

class ApiManager {
    stitchingInProgress: boolean = false;
    stitchingDuration: number | null = null;
    stitchingEnd: Date | null = null;
    stitchingStart: Date | null = null;
    VERSION = "version-live/";
    private lastSavedPayloadPath: string | null = null;

    public reset(){
      this.stitchingInProgress = false;
      this.stitchingDuration= null;
      this.stitchingEnd = null;
      this.stitchingStart = null;
    }

    private handleApiError(error: any, message: string) {
      // Log the error but don't throw
      console.error(`${message}:`, {
        status: error.response?.status,
        data: error.response?.data.transparent,
        message: error.message
      });
    }

    public saveImage = async (capturePoint: CapturePoint) => {
      try {
        // For react-native-vision-camera PhotoFile
        const result = await fetch(`file://${capturePoint.photo?.path}`);
        const blob = await result.blob();
        
        // Convert blob to base64 string (required for Bubble.io file upload)
        const base64String = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            // The result includes the data URL prefix which we need to remove
            // Format: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA...
            const base64 = reader.result?.toString().split(',')[1] || '';
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        // 1. Upload the image - send base64 string as contents
        const jsonData = {
          file: {
            filename: `${new Date().getTime()}_${capturePoint.index}.jpg`,
            contents: base64String, // Using base64 string here instead of blob
          }
        };
        

        // 5. Check if all capture points have URLs and stitch if ready
        await this.checkAndTriggerStitching();

        // 6. Return success status
        return true;
      } catch (error) {
        this.handleApiError(error, "Error uploading image");
        return false;
      }
    };
    
    // Check if all captures are ready and trigger stitching if they are
    public async checkAndTriggerStitching(): Promise<void> {
      const allCapturePointsHaveImages = capturePointsManager.capturePoints.every(point => 
        point.photo !== null
      ) && capturePointsManager.capturePoints.length === 24;
      
      if (allCapturePointsHaveImages) {
        console.log('All capture points have Images. Triggering stitching...');
        await this.generateCaptureSessionData();
      } else {
        const pointsWithImages = capturePointsManager.capturePoints.filter(point => 
          point.photo !== null
        ).length;
        
        console.log(`Progress: ${pointsWithImages}/${capturePointsManager.capturePoints.length} capture points have images`);
      }
    }

    public generateCaptureSessionData = async () => {
      console.log('Generate Capture Session Data...');
      this.stitchingInProgress = true
      await activateKeepAwakeAsync();
      this.stitchingStart = new Date()
  
      try {          
          // Get device camera parameters based on actual metadata when available
          const cameraParams = (() => {
            // Get device model
            const deviceModel = Device.modelName.toLowerCase();
            
            // Initialize with null values to indicate no data available
            let focalLength = null;
            let sensorSize = null;
            let source = 'none';
            
            // Try to get a sample photo to extract camera parameters
            const samplePhoto = capturePointsManager.capturePoints[0]?.photo;
            
            // Check if we have a photo with intrinsics
            if (samplePhoto) {
              const intrinsics = deviceCamera.extractCameraIntrinsics(samplePhoto);
              
              // Use extracted values if available, otherwise leave as null
              if (intrinsics.focalLength > 0 && intrinsics.metadata.source !== 'default') {
                focalLength = intrinsics.focalLength;
                source = intrinsics.metadata.source;
              }
              
              if (intrinsics.sensorSize && 
                  intrinsics.sensorSize[0] > 0 && 
                  intrinsics.sensorSize[1] > 0 && 
                  intrinsics.metadata.source !== 'default') {
                sensorSize = intrinsics.sensorSize;
                if (!source || source === 'none') {
                  source = intrinsics.metadata.source;
                }
              }
            }
            
            // Log the extracted parameters
            if (focalLength !== null || sensorSize !== null) {
              console.log(`Using device camera parameters from ${source}:`);
              if (focalLength !== null) console.log(`- Focal length: ${focalLength}mm`);
              if (sensorSize !== null) console.log(`- Sensor size: ${sensorSize[0]}x${sensorSize[1]}mm`);
            } else {
              console.log('No actual camera parameters available from metadata');
            }
            
            return {
              focalLength,
              sensorSize,
              // Add metadata about how we determined these values
              meta: {
                deviceModel,
                source: source !== 'none' ? source : null,
                timestamp: new Date().toISOString()
              }
            };
          })();
          
          // Create images object according to the specification
          const images: { [key: string]: string } = {};
          capturePointsManager.capturePoints.forEach(point => {
            if (point.url) {
              images[point.index.toString()] = point.url;
            }
          });
          
          // Create capture points metadata according to the specification
          const capturePointsMetadata = capturePointsManager.capturePoints.map(point => {
            // Extract intrinsics for this point if available
            const intrinsics = point.photo ? 
              deviceCamera.extractCameraIntrinsics(point.photo) : null;
            
            // Determine row and angle based on index (per specification)
            const isUpperRow = point.index < 12;
            const captureRow = isUpperRow ? "upper" : "lower";
            const captureAngle = (point.index % 12) * 30; // 0, 30, 60, ..., 330
            
            // Convert Euler rotation to quaternion (required by spec)
            let quaternion = { x: 0, y: 0, z: 0, w: 1 };
            if (point.rotation) {
              // Create THREE.js quaternion from Euler rotation
              const threeQuat = new THREE.Quaternion().setFromEuler(point.rotation);
              quaternion = {
                x: threeQuat.x,
                y: threeQuat.y,
                z: threeQuat.z,
                w: threeQuat.w
              };
            }
            
            
            return {
              index: point.index,
              position: point.position ? {
                x: point.position.x,
                y: point.position.y,
                z: point.position.z
              } : { x: 0, y: 0, z: 0 },
              rotation: quaternion,
              captureRow,
              captureAngle,
              tiltAngle: point.photo?.deviceOrientation?.intuitivePitch || point.photo?.deviceOrientation?.pitch || 0,
              deviceOrientation: point.photo?.deviceOrientation || null,
              // Include principal point if available from intrinsics
              principalPoint: intrinsics?.principalPoint || null,
              // Include URL directly in metadata for convenience (not in spec but useful)
              image_name: `image_${point.index}.jpg`
            };
          });

          // Create processing options according to the specification
          const processingOptions = {
            panoramaOptions: {
              horizontalOverlap: 0.4,
              verticalOverlap: 0.2,
              outputWidth: 4096,
              outputHeight: 2048,
              infillMethod: "black"
            },
            lidarOptions: {
              pointCloudDensity: "medium",
              confidenceThreshold: 0.5,
              meshQuality: "medium",
              textureResolution: "high"
            },
            captureMethod: deviceCamera.hasLiDAR ? "iOS_LiDAR" : "Android_ARCore"
          };

          // Create the payload according to the specification
          const payload = {
            uuid: Date.now().toString(),
            images, // Map of indices to URLs
            capturePointsMetadata, // Array of detailed metadata
            processingOptions, // Processing options per spec
            // Additional fields not in spec but important for processing
            cameraParams, // Device camera parameters
            meta: {
              timestamp: new Date().toISOString(),
              deviceModel: Device.modelName.toLowerCase(),
              hasLiDAR: deviceCamera.hasLiDAR,
              appVersion: Constants.expoConfig?.version || "unknown"
            }
          };

          console.log('Payload:', JSON.stringify(payload, null, 2));
          
          // Save the payload to a JSON file
          await this.savePayloadToJsonFile(payload);
          
          // // Automatically show file location
          this.sharePayloadFile();
          
      } catch (error) {
          console.error("Error preparing stitching payload:", error);
      } finally {
          deactivateKeepAwake()
          this.stitchingInProgress = false;
      }
    }
    
    // Function to save the payload to a JSON file
    private async savePayloadToJsonFile(payload: any): Promise<string> {
      try {
        // Create a timestamp for unique filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        // Create directories
        const testfilesDir = `${FileSystem.documentDirectory}/testfiles`;
        const sessionDir = `${testfilesDir}/capture_${timestamp}`;
        const imagesDir = `${sessionDir}/images`;

        // Create directories
        await FileSystem.makeDirectoryAsync(testfilesDir, { intermediates: true });
        await FileSystem.makeDirectoryAsync(sessionDir, { intermediates: true });
        await FileSystem.makeDirectoryAsync(imagesDir, { intermediates: true });

        // Copy all images
        for (const point of capturePointsManager.capturePoints) {
          if (point.photo?.path) {
            const sourcePath = point.photo.path;
            const targetPath = `${imagesDir}/image_${point.index}.jpg`;
            
            // Copy the image file
            await FileSystem.copyAsync({
              from: sourcePath,
              to: targetPath
            });
          }
        }

        // Save the JSON payload
        const jsonPath = `${sessionDir}/metadata.json`;
        await FileSystem.writeAsStringAsync(jsonPath, JSON.stringify(payload));

        // Create zip file
        const zipPath = `${testfilesDir}/capture_${timestamp}.zip`;
        await zip(sessionDir, zipPath);

        // Store the latest file path
        this.lastSavedPayloadPath = zipPath;

        console.log(`✨ Capture data saved to: ${sessionDir}`);
        console.log(`📦 Zip file created at: ${zipPath}`);

        return zipPath;
      } catch (error) {
        console.error('Error saving payload and images:', error);
        throw error;
      }
    }
    
    // Get the simple path for the latest payload
    public getSimplePayloadPath(): string {
      return `${FileSystem.documentDirectory}/testfiles/latest_payload.json`;
    }
    
    // Add a new public function to get the most recent saved payload
    public async getLastSavedPayload(): Promise<{ filePath: string, content: any } | null> {
      try {
        if (this.lastSavedPayloadPath) {
          const fileInfo = await FileSystem.getInfoAsync(this.lastSavedPayloadPath);
          if (fileInfo.exists) {
            const content = await FileSystem.readAsStringAsync(this.lastSavedPayloadPath);
            return {
              filePath: this.lastSavedPayloadPath,
              content: JSON.parse(content)
            };
          }
        }
        
        // No payload found or file doesn't exist
        return null;
      } catch (error) {
        console.error('Error retrieving last saved payload:', error);
        return null;
      }
    }
    
    // Add a function to share the payload file
    public async sharePayloadFile(): Promise<void> {
      try {
        if (!this.lastSavedPayloadPath) {
          console.warn('No payload file has been saved yet');
          alert('No payload file has been generated yet. Please capture all images first.');
          return;
        }

        // Get the various directory paths
        const testfilesDir = `${FileSystem.documentDirectory}/testfiles`;
        const cachesDir = `${FileSystem.cacheDirectory}/testfiles`;
        const tempDir = FileSystem.cacheDirectory;
        const simplePath = this.getSimplePayloadPath();
        
        // Create a readable file size
        const fileSize = await this.getFileSize(simplePath);
        const fileSizeText = fileSize > 1024 
          ? `${(fileSize / 1024).toFixed(2)} MB` 
          : `${fileSize.toFixed(2)} KB`;
        
        // Print a prominent log message with ALL paths
        console.log('\n\n============================================================');
        console.log('✅ STITCHING PAYLOAD FILES CREATED SUCCESSFULLY');
        console.log('============================================================');
        console.log(`File size: ${fileSizeText}`);
        console.log(`\nPossible locations to find your files:\n`);
        console.log(`1. App documents: ${testfilesDir}/latest_payload.json`);
        console.log(`2. App caches: ${cachesDir}/latest_payload.json`);
        console.log(`3. Temp directory: ${tempDir}/goce_payload_to_share.json (after sharing)`);
        console.log('============================================================\n\n');
        
        // Show alert with file locations and prepare to share
        alert(
          `✅ JSON Files Saved Successfully (${fileSizeText})\n\nThe file has been saved to multiple locations. Tap OK to see access options.`
        );
        
        // Try to open the file with the share sheet
        await this.openPayloadFileWithShareSheet();
        
        // Display instructions for accessing on development computer
        console.log(`
ACCESSING FILES FROM YOUR DEVELOPMENT COMPUTER:

FOR iOS DEVELOPERS:
1. Connect your device to your Mac
2. Open Xcode
3. Go to Window > Devices and Simulators
4. Select your device
5. Click the "+" button below the "Installed Apps" section
6. Choose "Download Container" and save it
7. Right-click the downloaded .xcappdata file and select "Show Package Contents"
8. Find the files in the following paths:
   - AppData/Library/Caches/testfiles/latest_payload.json
   - AppData/Documents/testfiles/latest_payload.json

ALTERNATIVE (Terminal):
- Use scp command: scp 'devicename:/tmp/goce_payload_to_share.json' ~/Desktop/

FOR ANDROID DEVELOPERS:
- Use Android Studio's Device File Explorer
- Look in the app's cache directory: /data/data/your.package.name/cache/testfiles/
        `);
      } catch (error) {
        console.error('Error sharing payload file:', error);
        alert(`Error sharing file: ${error}`);
      }
    }
    
    // Helper to get file size in KB
    private async getFileSize(filePath: string): Promise<number> {
      try {
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        return fileInfo.size ? fileInfo.size / 1024 : 0; // Convert bytes to KB
      } catch (error) {
        console.error('Error getting file size:', error);
        return 0;
      }
    }

    // Manually trigger stitching for testing (can be called from console)
    public async manuallyTriggerStitching(): Promise<void> {
      try {
        console.log('Manually triggering stitching process...');
        await this.generateCaptureSessionData();
      } catch (error) {
        console.error('Error manually triggering stitching:', error);
      }
    }

    // Simple function to create and share capture data without stitching
    public async saveAndShareCaptureData(): Promise<void> {
      try {
        // Create image URLs mapping
        const allUrls: { [key: number]: string } = {};
        capturePointsManager.capturePoints.forEach(point => {
          if (point.index !== undefined && point.url) {
            allUrls[point.index] = point.url;
          }
        });
        
        // Create capture points metadata with enhanced depth data
        const capturePointsMetadata = capturePointsManager.capturePoints.map(point => {
          
          return {
            index: point.index,
            position: point.position,
            rotation: point.rotation ? {
              x: point.rotation.x,
              y: point.rotation.y,
              z: point.rotation.z
            } : null,
            photoInfo: point.photo ? {
              path: point.photo.path,
              width: point.photo.width,
              height: point.photo.height,
              hasMetadata: !!point.photo.metadata,
              metadataKeys: point.photo.metadata ? Object.keys(point.photo.metadata) : []
            } : null
          };
        });
        
        
        // Create payload with more debug info
        const payload = {
          "timestamp": new Date().toISOString(),
          "images": allUrls,
          "capturePointsCount": capturePointsManager.capturePoints.length,
          "capturePointsMetadata": capturePointsMetadata,
          "deviceInfo": {
            hasLiDAR: deviceCamera.hasLiDAR,
            platform: Platform.OS
          },
        };
        
        // Save to file with timestamp in name for uniqueness
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `capture_data_${timestamp}.json`;
        
        // Save in multiple locations for easier access
        const docDirPath = `${FileSystem.documentDirectory}/${fileName}`;
        const cacheDirPath = `${FileSystem.cacheDirectory}/${fileName}`;
        
        // Write the JSON data to files
        const jsonData = JSON.stringify(payload, null, 2);
        await FileSystem.writeAsStringAsync(docDirPath, jsonData);
        await FileSystem.writeAsStringAsync(cacheDirPath, jsonData);
        
        // Store the path for sharing
        this.lastSavedPayloadPath = docDirPath;
        
        console.log(`✅ Data saved to: ${docDirPath}`);
        console.log(`✅ Also saved to: ${cacheDirPath}`);
        
        alert(`✅ Capture data saved successfully!\nTap OK to share the file.`);
        
        // Share the file
        await this.openPayloadFileWithShareSheet();
        
      } catch (error) {
        console.error('Error saving and sharing capture data:', error);
        alert(`Error: ${error}`);
      }
    }

    // Share the payload file using system share sheet
    public async openPayloadFileWithShareSheet(): Promise<void> {
      try {
        if (!this.lastSavedPayloadPath) {
          this.lastSavedPayloadPath = this.getSimplePayloadPath();
          const fileInfo = await FileSystem.getInfoAsync(this.lastSavedPayloadPath);
          if (!fileInfo.exists) {
            alert('No capture data has been generated yet. Please capture all images first.');
            return;
          }
        }

        // For iOS, we need to use the file:// URL format
        const shareUrl = Platform.OS === 'ios' 
          ? `file://${this.lastSavedPayloadPath}`
          : this.lastSavedPayloadPath;

        console.log('Attempting to share file from:', shareUrl);

        try {
          const result = await Share.share({
            url: shareUrl,
            message: 'Here is the GoCe App capture data with images',
            title: 'GoCe App Capture Data',
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
    }
}

export const apiManager = new ApiManager()