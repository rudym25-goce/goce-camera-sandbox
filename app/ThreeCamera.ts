//our imports
import Rotation from "../types/Rotation";

//third-paty imports
import { THREE } from "expo-three";

class ThreeCamera {

  camera: THREE.Camera | null = null;

  public setUpCamera(near: number){
    this.camera = new THREE.PerspectiveCamera(
      65,
      near,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.order = 'ZXY'; // Set the rotation order
  }

  public setRotation(rotation: Rotation) {
    this.camera.rotation.x = rotation.beta; // Tilt forward/backward
    this.camera.rotation.y = rotation.gamma; // Tilt left/right
    this.camera.rotation.z = rotation.alpha; // Yaw
  }

}

export const threeCamera = new ThreeCamera()