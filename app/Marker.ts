//our imports
import { COLORS } from '../styles/constants';
import CapturePoint from './interfaces/CapturePoint';
import { sceneManager } from './SceneManager';
import { threeCamera } from './ThreeCamera';


//third-party imports
import { THREE } from "expo-three";
import Environment from '../enums/Environment';
import MarkerMap from '../types/MarkerMap';
import { capturePointsManager } from './CapturePointManager';

class Marker {

    activeMarker: THREE.Mesh | null;
    MARKER_MAP: MarkerMap = {
      [Environment.EXTERIOR_LOCATION]: [
        { angle: 70, count: 12 },
        { angle: 110, count: 12 }
      ],
      [Environment.INTERIOR_LOCATION]: [
        { angle: 90, count: 13 },
        { angle: 135, count: 12 },
        { angle: 45, count: 12 },
        { angle: 0, count: 1 }
      ]
    };

    public reset() {
      if (this.activeMarker) {
        sceneManager.removeThreeElement(this.activeMarker);
        this.activeMarker = null;
      }
    }

    public isMarkerCentered = () => {

        if (!this.activeMarker || !threeCamera.camera) {
          return false;
        }
    
        // Calculate the direction from the camera to the marker
        const direction = new THREE.Vector3().subVectors(this.activeMarker.position, threeCamera.camera.position).normalize();
    
        // Define the arrow's origin at the camera's position
        const origin = threeCamera.camera.position;
    
        // Set the length of the arrow
        let length = origin.distanceTo(this.activeMarker.position);
    
        // Calculate angle between the camera's forward vector and the direction to the marker
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(threeCamera.camera.quaternion);
        const angleRadians = Math.acos(forward.dot(direction));
        const angleDegrees = THREE.MathUtils.radToDeg(angleRadians);
    
        // Update or create the arrow
        if (!sceneManager.arrow) {
          // Create the ArrowHelper
          sceneManager.addArrow(direction, origin, length, COLORS.primary.number, 0, 0);
        }
    
        // Position the arrow in front of the camera
        const newPosition = new THREE.Vector3(0, 0, -5).applyQuaternion(threeCamera.camera.quaternion).add(threeCamera.camera.position);
        sceneManager.arrow.position.copy(newPosition);
    
        // Orient the arrow towards the marker
        const newDirection = this.activeMarker.position.clone().sub(newPosition).normalize();
        sceneManager.arrow.setDirection(newDirection);
    
        length = newPosition.distanceTo(this.activeMarker.position)
    
        const arrowLength = length * 0.5 > 1.5 ? 1.5 : length * 0.5; // Example: making the arrow slightly shorter than the distance to avoid overlap
        let headLength = 0.25
        sceneManager.arrow.setLength(arrowLength, headLength, headLength * 0.75);
    
        // Determine if the marker is in view and centered
        const markerInView = angleDegrees < 7.5;
        const isCentered = angleDegrees < 1;
    
        // Update arrow visibility
        sceneManager.arrow.visible = !markerInView;
    
        if (isCentered){
          this.activeMarker.material.color.set(COLORS.success.number)
          this.activeMarker.scale.setScalar(1.2); // Increase size by 20%
        }
        else{
          this.activeMarker.material.color.set(COLORS.primary.number)
          this.activeMarker.scale.setScalar(1.0); // Reset to original size
        }

        return isCentered;
    };

    public createMarker = (x: number, y: number, z: number, logo?: THREE.MeshBasicMaterial) => {
        let geometry: THREE.BufferGeometry;
        let material: THREE.Material;

        if (logo) {
            // Create a circle geometry for loading marker
            geometry = new THREE.CircleGeometry(0.2, 32);
            material = logo;
        } else {
            // Create a sphere geometry for point marker
            geometry = new THREE.SphereGeometry(0.2, 32, 32);
            material = new THREE.MeshPhongMaterial({
                color: COLORS.primary,
                shininess: 100,
                specular: 0x444444
            });
        }

        // Create mesh
        let marker = new THREE.Mesh(geometry, material);
        marker.position.set(x, y, z);

        if (logo) {
            // Make the marker always face the camera for loading marker
            marker.onBeforeRender = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => {
                marker.quaternion.copy(camera.quaternion);
            };
        } else {
            // Add a point light to the marker for better visibility for point marker
            let pointLight = new THREE.PointLight(0xffffff, 1, 2);
            pointLight.position.set(0, 0, 0);
            marker.add(pointLight);
        }

        return marker;
    }

    
    public createCapturePoints = (forwardVector: THREE.Vector3, environment: string): CapturePoint[] => {
        const capturePoints: CapturePoint[] = []
        // Calculate distance from camera to marker
        let r = Math.sqrt(forwardVector.x ** 2 + forwardVector.y ** 2 + forwardVector.z ** 2);

        const angles = this.MARKER_MAP[environment as keyof MarkerMap].map(item => item.angle); // The angles in MARKER_MAP [90, 135, 55, 0]

        angles.forEach(angle => {
            const angleConfig = this.MARKER_MAP[environment as keyof MarkerMap].find(item => item.angle === angle);
            const totalMarkers = angleConfig ? angleConfig.count : 0;
            const thetaRad = THREE.MathUtils.degToRad(angle);

            // Calculate phi angle based on forward vector
            const phi = Math.atan2(forwardVector.y, forwardVector.x);

            // Calculate angle increment between markers
            const angleIncrement = (2 * Math.PI) / totalMarkers;

            for (let i = angle === 90 ? 1 : 0; i < totalMarkers; i++) {
              // Calculate azimuth angle for this marker
              const azimuth = phi - angleIncrement * i;

              // Convert spherical coordinates to Cartesian
              const x = r * Math.sin(thetaRad) * Math.cos(azimuth);
              const y = r * Math.sin(thetaRad) * Math.sin(azimuth);
              const z = r * Math.cos(thetaRad);

              const capturePoint = {
                  position: {x, y, z},
                  photo: null,
                  complete: false,
                  plate: null,
                  index: capturePoints.length,
                  marker: null,
                  rotation: null,
                  plateIsVisible: false,
                  depthData: null
              }

              // Create marker and add it to the scene
              if(angle === 70 && i === 0){
                  const marker = this.createMarker(x, y, z);
                  marker.visible = true
                  this.activeMarker = marker
                  capturePoint.marker = marker
                  capturePointsManager.currentPoint = capturePoint
                  sceneManager.scene.add(marker);
              }

              capturePoints.push(capturePoint);
            }
        });
        return capturePoints
    };  
    
}

export const marker = new Marker()