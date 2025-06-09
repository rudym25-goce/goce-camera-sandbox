import { THREE } from 'expo-three';
import { Dimensions } from "react-native";
import CapturePoint from './interfaces/CapturePoint';
const { width, height } = Dimensions.get('window');

class CullingManager {
  private frustum: THREE.Frustum;
  private matrix: THREE.Matrix4;
  private plateWidth: number | undefined;
  private plateHeight: number | undefined;
  private bufferFactor: number = 0; // 20% buffer

  constructor() {
    this.frustum = new THREE.Frustum();
    this.matrix = new THREE.Matrix4();
    this.setPlateDimensions()
  }

  updateFrustum(camera: THREE.Camera) {
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix);
  }

  public setPlateDimensions(){
    const aspectRatio = width / height;

    // Assuming a default FOV of 75 degrees (you can adjust this)
    const fov = THREE.MathUtils.degToRad(75);

    // Distance at which to place the plate
    const distance = 5; // You can adjust this value

    // Calculate the plate height based on FOV and distance
    this.plateHeight = 2 * Math.tan(fov / 2) * distance;
    this.plateWidth = this.plateHeight * aspectRatio;
  }

  isInView(capturePoint: CapturePoint): boolean {
    if (!capturePoint.position) return false;
  
    const plateSize = Math.max(this.plateWidth || 3, this.plateHeight || 7);
    const radius = (plateSize / 2) * (1 + this.bufferFactor);
  
    const boundingSphere = new THREE.Sphere(
      new THREE.Vector3(capturePoint.position.x, capturePoint.position.y, capturePoint.position.z),
      radius
    );
  
    return this.frustum.intersectsSphere(boundingSphere);
  }
}

export const cullingManager = new CullingManager();