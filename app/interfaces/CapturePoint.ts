//our imports

//third-party imports
import { THREE } from 'expo-three';


export default interface CapturePoint {
  position?: {x: number, y: number, z: number};
  marker: THREE.Mesh | null;
  photo: object | null;
  complete: boolean;
  plate: THREE.Mesh | null;
  url?: string;
  index: number;
  deleteID?: string;
  rotation: THREE.Euler | null;
  plateIsVisible: boolean;
}