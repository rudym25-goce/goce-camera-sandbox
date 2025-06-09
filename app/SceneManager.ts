//our imports
import { capturePointsManager } from './CapturePointManager';
import CapturePoint from "./interfaces/CapturePoint";

import { Asset } from "expo-asset";
import { TextureLoader, THREE } from "expo-three";
import { Dimensions, Image } from "react-native";
import { instance } from "./Instance";
import { threeCamera } from "./ThreeCamera";

const { width, height } = Dimensions.get('window');

class SceneManager {
  public textureLoader: TextureLoader;
  private textureCache: Map<string, THREE.Texture>;
  private geometryCache: THREE.PlaneGeometry | null = null;
  arrow: THREE.ArrowHelper | null;
  scene: any;
  sphere: THREE.Mesh | null = null;
  plateWidth: number | undefined;
  plateHeight: number | undefined;
  showingStitchedImage: boolean = false;
  private currentModel: THREE.Group | null = null;

  constructor() {
    this.scene = new THREE.Scene();
    this.textureLoader = new TextureLoader();
    this.textureCache = new Map();
    this.setPlateDimensions();
  }

  public async reset() {
    // Reset scene-specific properties
    this.showingStitchedImage = false;
    
    // Clean up capture points
    for (const point of capturePointsManager.capturePoints) {
        try {
            // Clean up THREE.js objects
            if (point.marker) {
                this.removeThreeElement(point.marker);
                point.marker = null;
            }

            if (point.plate) {
                this.disposePlate(point);
                point.plate = null;
            }

            // Clean up image data
            if (point.photo?.path) {
                await FileSystem.unlink(point.photo.path);
                point.photo = null;
            }

            // Clear other references
            point.rotation = null;
            point.url = undefined;
            point.deleteID = undefined;
            point.plateIsVisible = false;
            point.complete = false;
            point.position = undefined;
        } catch (error) {
            console.error('Error cleaning up capture point:', error);
        }
    }

    // Clear the capture points array
    capturePointsManager.capturePoints = [];
    capturePointsManager.currentPoint = null;

    // Force garbage collection in development
    if (__DEV__ && global.gc) {
        global.gc();
    }
  }

  // TODO: type these arguments. need to import @types/three if it exists
  public addArrow(
    direction: any,
    origin: any,
    length: any,
    BASE_COLOR: number,
    // don't know if these should actually be called x and y
    x: number = 0,
    y: number = 0,
  ) {
    this.arrow = new THREE.ArrowHelper(
      direction,
      origin,
      length,
      BASE_COLOR,
      x,
      y,
    );
    this.arrow.renderOrder = 1
    // Add the ArrowHelper to your scene
    this.scene.add(this.arrow);
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

  public addSphere() {
    if (!this.sphere) {
      const radius = 25;
      const widthSegments = 12;
      const heightSegments = 12;
      const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
      const material = new THREE.MeshBasicMaterial({
        color: 0xff8c00,
        wireframe: false,
        transparent: true,
      });

      this.sphere = new THREE.Mesh(geometry, material);
      this.sphere.renderOrder = -1;
      this.sphere.rotation.x = Math.PI / 2;
      this.scene.add(this.sphere);
    }
  }

  public addGridToSphere() {
    if (this.sphere) {
      this.removeTexturesFromSphere();
      this.sphere.geometry.dispose()
      const radius = 25; // Adjust this value to change the size of the sphere
      const widthSegments = 12; // Adjust this to change the density of the grid
      const heightSegments = 12; // Adjust this to change the density of the grid
      this.sphere.geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
      this.sphere.material = new THREE.MeshBasicMaterial({
        color: 0xff8c00,
        wireframe: true,
        transparent: false,
      });
    }
  }

  public removeGridFromSphere() {
    if (this.sphere && this.sphere.material instanceof THREE.MeshBasicMaterial) {
      this.sphere.material.wireframe = false;
    }
  }

  public async addImageTextureToSphere(imageUri: string) {
    try {
        if (!this.sphere) {
           this.addSphere();
            //console.warn("No sphere found");
            //return;
        }

        // Clean up existing textures first
        this.removeTexturesFromSphere();
        
        // Load the new texture
        const sphereTexture = await new Promise<THREE.Texture>((resolve, reject) => {
            this.textureLoader.load(
                imageUri,
                (texture) => {
                    texture.minFilter = THREE.LinearMipMapLinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    texture.needsUpdate = true;
                    resolve(texture);
                },
                undefined,
                reject
            );
        });

        // Update geometry and material
        const { width, height } = await this.loadImageDimensions(imageUri);
        const radius = Math.max(width, height) / 2;

        threeCamera.camera.far = radius < 100 ? 200 : radius + 100; 
        threeCamera.camera.updateProjectionMatrix();
        
        // Dispose of old geometry
        if (this.sphere.geometry) {
            this.sphere.geometry.dispose();
        }

        // Create new geometry
        this.sphere.geometry = new THREE.SphereGeometry(radius, 64, 64);

        // Create and assign new material
        const newMaterial = new THREE.MeshBasicMaterial({
            map: sphereTexture,
            side: THREE.DoubleSide,
            transparent: true,
        });

        // Dispose of old material if it exists
        if (this.sphere.material instanceof THREE.Material) {
            this.sphere.material.dispose();
        }

        this.sphere.material = newMaterial;
        this.showingStitchedImage = true;
    } catch (error) {
        console.error("Error adding image texture:", error);
        throw error;
    }
  }

  public removeTexturesFromSphere() {
    if (this.sphere) {
        // Handle single material
        if (this.sphere.material instanceof THREE.MeshBasicMaterial) {
            if (this.sphere.material.map) {
                this.sphere.material.map.dispose();
                this.sphere.material.map = null;
            }
            this.sphere.material.dispose();
        }
        
        // Handle material array
        else if (Array.isArray(this.sphere.material)) {
            this.sphere.material.forEach((material: THREE.Material) => {
                if (material instanceof THREE.MeshBasicMaterial && material.map) {
                    material.map.dispose();
                    material.map = null;
                }
                material.dispose();
            });
        }

        // Clear texture cache
        this.textureCache.forEach(texture => {
            texture.dispose();
        });
        this.textureCache.clear();

        // Force update material
        this.sphere.material.needsUpdate = true;
    }

    // Force garbage collection in development
    if (__DEV__ && global.gc) {
        global.gc();
    }
  }

  public async addImage(capturePoint: CapturePoint): Promise<void> {
    if (!capturePoint.photo?.path) {
      console.log('No photo URI provided for capture point');
      return;
    }

    try {
      // Calculate the aspect ratio of the image
      const imageAspectRatio = width / height;

      // Calculate new dimensions that fit the screen while maintaining aspect ratio
      let newWidth, newHeight;
      if (imageAspectRatio > width / height) {
        newWidth = width;
        newHeight = width / imageAspectRatio;
      } else {
        newHeight = height;
        newWidth = height * imageAspectRatio;
      }

      // Use cached geometry if available
      if (!this.geometryCache) {
        this.geometryCache = new THREE.PlaneGeometry(newWidth / 100, newHeight / 100);
      }

      // Use cached texture if available, otherwise load and cache
      let texture: THREE.Texture;
      if (this.textureCache.has(capturePoint.photo.path)) {
        texture = this.textureCache.get(capturePoint.photo.path)!;
      } else {
        const [{ localUri }] = await Asset.loadAsync(capturePoint.photo.path);
        if (localUri) {
          texture = await this.loadTexture(localUri);
          // Apply texture settings
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.format = THREE.RGBAFormat;
          texture.generateMipmaps = false;
          
          // Fix for sideways images - set the center and rotation
          texture.center.set(0.5, 0.5); // Set center for rotation
          texture.rotation = -Math.PI / 2; // Rotate 90 degrees counterclockwise
          texture.flipY = true; // Flip the Y-axis if needed
          
          texture.needsUpdate = true;
          this.textureCache.set(capturePoint.photo.path, texture);
        }
      }

      // Create a material with the texture
      const plateMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true
      });

      // Create the mesh
      const newPlate = new THREE.Mesh(this.geometryCache, plateMaterial);
      newPlate.renderOrder = 0;
      
      // Set rotation
      if (capturePoint.rotation) {
        newPlate.rotation.copy(capturePoint.rotation);
        
        // Add additional rotation to correct orientation if needed
        // Uncomment the line below if the image still needs rotation adjustment
        // newPlate.rotateZ(Math.PI / 2);
      }
      
      // Set position
      newPlate.position.set(
        capturePoint.position?.x || 0,
        capturePoint.position?.y || 0,
        capturePoint.position?.z || 0
      );

      // Mark capture point as complete
      capturePoint.plateIsVisible = true;
      capturePoint.plate = newPlate.uuid;
      capturePoint.complete = true;

      // Add to scene
      this.scene.add(newPlate);
      
      console.log(`Image added to scene with rotation: ${texture.rotation} radians`);
    } catch (error) {
      console.error('Error loading texture:', error);
    }
  }

  private loadImageDimensions = async (uri: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      Image.getSize(
        uri,
        (width, height) => resolve({ width, height }),
        (error) => reject(error)
      );
    });
  };


  public removeLoadingMarkers = () =>{
    // Remove loading markers
    capturePointsManager.capturePoints.forEach((point) => {
      if (point.marker) {
        point.marker = sceneManager.removeThreeElement(point.marker);
      }
    });
  }


  private loadTexture(uri: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(uri, resolve, undefined, reject);
    });
  }
  

  public removeArrow() {
    if (this.arrow) {
        this.scene.remove(this.arrow);
        this.arrow = null;
    }
}

  public disposePlate(capturePoint: CapturePoint): void {
    if (!capturePoint.plate) {
      return;
    }
  
    const mesh = this.scene.getObjectByProperty('uuid', capturePoint.plate) as THREE.Mesh | undefined;
    
    if (!mesh) {
      console.warn(`Mesh with UUID ${capturePoint.plate} not found in scene`);
      capturePoint.plate = null;
      return;
    }
  
    // Remove from parent
    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }
    
    // Dispose of geometry
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    
    // Dispose of material(s)
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(this.disposeMaterial);
      } else {
        this.disposeMaterial(mesh.material);
      }
    }
    
    // Recursively dispose of children
    while (mesh.children.length > 0) {
      const child = mesh.children[0];
      if (child instanceof THREE.Mesh) {
        this.disposePlate(child);
      } else {
        mesh.remove(child);
      }
    }
    
    // Clear any remaining references
    mesh.clear();
  
    // Clear the reference in capturePoint
    capturePoint.plate = null;
  
    // Force a garbage collection cycle in development
    if (__DEV__ && global.gc) {
      global.gc();
    }
  }

  public flipStitchedImage = () => {
    
    if (this.sphere && this.sphere.material instanceof THREE.MeshBasicMaterial) {
      const material = this.sphere.material;
      if (material.map) {
        
        // Set the center point for rotation
        material.map.center.set(0.5, 0.5);
        
        // Rotate 180 degrees (π radians)
        material.map.rotation += Math.PI;
        
        // Ensure updates are applied
        material.map.needsUpdate = true;
        material.needsUpdate = true;
        
        if(instance.goceImage){
          instance.goceImage.flipY = !instance.goceImage.flipY
        }
      } else {
        //console.log("No texture map found on material");
      }
    } else {
      //console.log("Either griddedSphere doesn't exist or material is not MeshBasicMaterial");
    }
  }

  public disposeMaterial(material: THREE.Material): void {
      // Dispose of textures
      if (material instanceof THREE.MeshBasicMaterial || 
          material instanceof THREE.MeshStandardMaterial) {
          if (material.map) material.map.dispose();
          if (material.lightMap) material.lightMap.dispose();
          if (material.bumpMap) material.bumpMap.dispose();
          if (material.normalMap) material.normalMap.dispose();
          if (material.specularMap) material.specularMap.dispose();
          if (material.envMap) material.envMap.dispose();
          if (material.alphaMap) material.alphaMap.dispose();
          if (material.aoMap) material.aoMap.dispose();
          if (material.displacementMap) material.displacementMap.dispose();
          if (material.emissiveMap) material.emissiveMap.dispose();
          if (material.gradientMap) material.gradientMap.dispose();
          if (material.metalnessMap) material.metalnessMap.dispose();
          if (material.roughnessMap) material.roughnessMap.dispose();
      }
      
      // Dispose the material itself
      material.dispose();
  }

  public removeThreeElement(object: THREE.Object3D) {
    if(!object){return}

    // Remove all children recursively
    while (object.children.length > 0) {
        this.removeThreeElement(object.children[0]);
    }
  
    // Dispose of geometries and materials
    if (object instanceof THREE.Mesh) {
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((material: THREE.Material) => this.disposeMaterial(material));
        } else {
          this.disposeMaterial(object.material);
        }
      }
    }
  
    // Recursively remove children
    while (object.children.length > 0) {
      this.removeThreeElement(object.children[0]);
    }

    // Remove from parent
    if (object.parent) {
      object.parent.remove(object);
    }
  
    // Clear any references
    object.clear();

    return null
  }

  public async clearScene() {
    try {
        
        // Remove arrow if it exists
        this.removeArrow();
        
        // Remove all capture points
        for (const point of capturePointsManager.capturePoints) {
            if (point.marker) {
                this.removeThreeElement(point.marker);
            }
            if (point.plate) {
                this.disposePlate(point);
            }
        }
        
        // Clear capture points array
        capturePointsManager.capturePoints = [];
        
        // Reset sphere if it exists
        if (this.sphere) {
            if (this.sphere.material instanceof THREE.Material) {
                this.disposeMaterial(this.sphere.material);
            }
            if (this.sphere.geometry) {
                this.sphere.geometry.dispose();
            }
            this.scene.remove(this.sphere);
            this.sphere = null;
        }
        
        // Add new sphere
        //this.addSphere();
    } catch (error) {
        console.error("Error clearing scene:", error);
        throw error;
    }
  }
  
  // Helper to invert normals for viewing from inside
  private invertNormals(object: THREE.Object3D): void {
    object.traverse((child: { scale: { set: (arg0: number, arg1: number, arg2: number) => void; }; material: any; }) => {
      if (child instanceof THREE.Mesh) {
        // Flip normals by scaling with negative value
        child.scale.set(-1, 1, 1);
        
        // Update material to handle backface visibility
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((material: { side: any; needsUpdate: boolean; }) => {
            material.side = THREE.DoubleSide; // Render both sides
            material.needsUpdate = true;
          });
        }
      }
    });
  }

  // Process materials to ensure they render correctly
  private processMaterials(object: THREE.Object3D): void {
    object.traverse((child: { material: any; }) => {
      if (child instanceof THREE.Mesh) {
        // Process materials
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach((material: { transparent: boolean; opacity: number; side: any; map: { needsUpdate: boolean; }; color: { set: (arg0: number) => void; }; roughness: number; metalness: number; needsUpdate: boolean; }) => {
          // Ensure materials are visible
          material.transparent = false; 
          material.opacity = 1.0;
          material.side = THREE.DoubleSide;
          
          // For basic materials, ensure color is set
          if (material instanceof THREE.MeshBasicMaterial && !material.map) {
            material.color.set(0xCCCCCC); // Light grey
          }
          
          // For standard materials, ensure reasonable defaults
          if (material instanceof THREE.MeshStandardMaterial) {
            material.roughness = 0.7;
            material.metalness = 0.3;
            
            // Force texture updates
            if (material.map) {
              material.map.needsUpdate = true;
            }
          }
          
          material.needsUpdate = true;
        });
      }
    });
  }

  // Helper to debug scene structure 
  private logSceneStructure(object: THREE.Object3D, depth = 0): string {
    let structure = '';
    const indent = '  '.repeat(depth);
    const type = object.type;
    const name = object.name || '[unnamed]';
    
    structure += `${indent}${type} "${name}" (${object.children.length} children)\n`;
    
    if (object instanceof THREE.Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material: { type: any; color: { getHexString: () => any; }; map: any; }, index: any) => {
        structure += `${indent}  Material[${index}]: ${material.type}, `;
        if (material instanceof THREE.MeshBasicMaterial) {
          structure += `color: ${material.color.getHexString()}, `;
        }
        structure += `map: ${material.map ? 'yes' : 'no'}\n`;
      });
    }
    
    object.children.forEach((child: any) => {
      structure += this.logSceneStructure(child, depth + 1);
    });
    
    return structure;
  }

  // Add proper lighting for 3D models
  private setupModelLighting(): void {
    // Remove existing lights
    this.scene.children.forEach((child: THREE.Object3D) => {
      if (child instanceof THREE.Light) {
        this.scene.remove(child);
      }
    });
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    // Add directional lights from multiple angles
    const createDirectionalLight = (x: number, y: number, z: number, intensity: number = 0.8) => {
      const light = new THREE.DirectionalLight(0xffffff, intensity);
      light.position.set(x, y, z);
      light.castShadow = true;
      this.scene.add(light);
    };
    
    createDirectionalLight(1, 1, 1);    // Top-right-front
    createDirectionalLight(-1, 1, 1);   // Top-left-front
    createDirectionalLight(0, -1, 0);   // Bottom
    
    // Add hemisphere light for better ambient lighting
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x404040, 0.8);
    this.scene.add(hemisphereLight);
  }

  // Call this from your UI for debugging
  public adjustCameraPosition(x: number, y: number, z: number): void {
    if (!this.currentModel) return;
    
    // Get the center of the model
    const box = new THREE.Box3().setFromObject(this.currentModel);
    const center = box.getCenter(new THREE.Vector3());
    
    // Set new camera position relative to center
    threeCamera.camera.position.set(
      center.x + x,
      center.y + y,
      center.z + z
    );
    
    // Look toward center
    threeCamera.camera.lookAt(center);
    threeCamera.camera.updateProjectionMatrix();
    
    console.log('Camera position updated:', {
      x: threeCamera.camera.position.x,
      y: threeCamera.camera.position.y,
      z: threeCamera.camera.position.z
    });
  }

  // Add to SceneManager.ts
public scaleModel(factor: number): void {
  if (!this.currentModel) return;
  
  const currentScale = this.currentModel.scale.x;
  const newScale = currentScale * factor;
  
  this.currentModel.scale.set(newScale, newScale, newScale);
  console.log(`Model scaled from ${currentScale} to ${newScale}`);
}

  public useBasicMaterialForAllMeshes(): void {
    if (!this.currentModel) return;
    
    console.log('Applying basic materials to all meshes');
    
    this.currentModel.traverse((node: { material: string | any[]; name: any; }) => {
      if (node instanceof THREE.Mesh) {
        // Create a bright, visible material
        const newMaterial = new THREE.MeshBasicMaterial({
          color: 0x00ff00, // Bright green for visibility
          wireframe: true,  // Show as wireframe
          side: THREE.DoubleSide
        });
        
        // Replace all materials
        if (Array.isArray(node.material)) {
          for (let i = 0; i < node.material.length; i++) {
            node.material[i] = newMaterial;
          }
        } else {
          node.material = newMaterial;
        }
        
        console.log(`Applied basic material to mesh: ${node.name || 'unnamed'}`);
      }
    });
  }

  public loadModelStandard(modelPath: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // Clear scene first
        await this.clearScene();
        
        console.log(`Loading GLB model from path: ${modelPath}`);
        
        
        // Add model to scene
        this.scene.add(this.currentModel);
        
        // Center the model (as your partner does)
        const box = new THREE.Box3().setFromObject(this.currentModel);
        const center = box.getCenter(new THREE.Vector3());
        this.currentModel.position.x = -center.x;
        this.currentModel.position.y = -center.y;
        this.currentModel.position.z = -center.z;
        
        // Calculate size for camera positioning
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        // Position camera to view the model properly (not inside)
        threeCamera.camera.position.set(0, 0, maxDim * 2);
        threeCamera.camera.lookAt(0, 0, 0);
        
        // Set standard camera parameters
        threeCamera.camera.fov = 75;
        threeCamera.camera.near = 0.1;
        threeCamera.camera.far = 1000;
        threeCamera.camera.updateProjectionMatrix();
        
        // Setup standard lighting (as your partner does)
        this.setupStandardLighting();
        
        this.showingStitchedImage = true;
        console.log('GLB model loaded successfully with standard setup');
        
        // Process materials to ensure textures load correctly
        gltf.scene.traverse((node: { material: any; name: any; }) => {
          if (node instanceof THREE.Mesh) {
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            
            materials.forEach((material: { map: { minFilter: any; magFilter: any; anisotropy: number; needsUpdate: boolean; encoding: any; image: { width: any; height: any; }; format: any; }; side: any; transparent: boolean; opacity: number; needsUpdate: boolean; roughness: number; metalness: number; }) => {
              if (material.map) {
                // Set texture parameters for better appearance
                material.map.minFilter = THREE.LinearFilter;
                material.map.magFilter = THREE.LinearFilter;
                material.map.anisotropy = 16; // Higher anisotropy for sharper textures
                material.map.needsUpdate = true;
                material.map.encoding = THREE.sRGBEncoding; // Proper color encoding
                
                // Log texture info
                console.log(`Processing texture for ${node.name}:`, {
                  size: material.map.image ? `${material.map.image.width}x${material.map.image.height}` : 'unknown',
                  format: material.map.format
                });
              }
              
              // Set material parameters
              material.side = THREE.DoubleSide;
              material.transparent = false;
              material.opacity = 1.0;
              material.needsUpdate = true;
              
              if (material instanceof THREE.MeshStandardMaterial) {
                material.roughness = 0.7;
                material.metalness = 0.3;
              }
            });
          }
        });
        
        resolve();
      } catch (error) {
        console.error('Error loading GLB model:', error);
        reject(error);
      }
    });
  }

  private setupStandardLighting(): void {
    // Remove existing lights
    this.scene.children.forEach((child: THREE.Object3D) => {
      if (child instanceof THREE.Light) {
        this.scene.remove(child);
      }
    });
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    // Add directional light (as your partner does)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);
  }

  // Add this function to SceneManager.ts
  public debugTextures(): void {
    if (!this.currentModel) {
      console.log('No model loaded to debug textures for');
      return;
    }
    
    console.log('=== TEXTURE DEBUGGING ===');
    
    let textureCount = 0;
    let materialCount = 0;
    
    // First, check if any textures exist in the model
    this.currentModel.traverse((node: { material: any; name: any; }) => {
      if (node instanceof THREE.Mesh) {
        materialCount++;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        
        materials.forEach((material: { map: { source: { data: { currentSrc: any; }; }; image: { width: any; height: any; }; format: any; encoding: any; needsUpdate: boolean; }; }, index: any) => {
          if (material.map) {
            textureCount++;
            console.log(`Found texture on ${node.name || 'unnamed mesh'}, material #${index}:`, {
              url: material.map.source?.data?.currentSrc || 'unknown',
              size: material.map.image ? `${material.map.image.width}x${material.map.image.height}` : 'unknown',
              format: material.map.format,
              encoding: material.map.encoding,
              loaded: material.map.image ? 'yes' : 'no'
            });
            
            // Debug image data if available
            if (material.map.image) {
              console.log('Image data exists');
            } else {
              console.log('No image data in texture');
            }
            
            // Force texture update
            material.map.needsUpdate = true;
          } else {
            console.log(`No texture on ${node.name || 'unnamed mesh'}, material #${index}`);
          }
        });
      }
    });
    
    console.log(`Found ${textureCount} textures across ${materialCount} materials.`);
    
    // Apply a checker pattern to all materials to test UV mapping
    this.currentModel.traverse((node: { material: { [x: string]: any; }; name: any; }) => {
      if (node instanceof THREE.Mesh) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        
        materials.forEach((material: any, index: string | number) => {
          // Create a checker pattern texture for testing
          const canvas = document.createElement('canvas');
          canvas.width = 512;
          canvas.height = 512;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            // Draw checker pattern
            const tileSize = 64;
            for (let y = 0; y < canvas.height; y += tileSize) {
              for (let x = 0; x < canvas.width; x += tileSize) {
                ctx.fillStyle = (x / tileSize + y / tileSize) % 2 === 0 ? '#ff4444' : '#4444ff';
                ctx.fillRect(x, y, tileSize, tileSize);
              }
            }
            
            // Create texture from canvas
            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            
            // Create new material with this texture
            const newMaterial = new THREE.MeshBasicMaterial({
              map: texture,
              side: THREE.DoubleSide
            });
            
            // Replace the material
            if (Array.isArray(node.material)) {
              node.material[Number(index)] = newMaterial;
            } else {
              node.material = newMaterial;
            }
            console.log(`Applied checker texture to ${node.name || 'unnamed mesh'}, material #${index}`);
          }
        });
      }
    });
    
    console.log('Applied checker textures to test UV mapping');
    console.log('=== END TEXTURE DEBUGGING ===');
  }

  // Add a function to forcibly enable textures
  public forceTexturesVisible(): void {
    if (!this.currentModel) return;
    
    console.log('Forcing textures to be visible...');
    
    // Update renderer settings if needed
    // renderer.outputEncoding = THREE.sRGBEncoding;
    
    this.currentModel.traverse((node: { material: any; }) => {
      if (node instanceof THREE.Mesh) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        
        materials.forEach((material: { wireframe: boolean; map: { needsUpdate: boolean; minFilter: any; magFilter: any; anisotropy: number; }; needsUpdate: boolean; color: { setHex: (arg0: number) => void; }; transparent: boolean; opacity: number; roughness: number; metalness: number; emissive: { setHex: (arg0: number) => void; }; }) => {
          // Make sure material is not wireframe
          if (material.wireframe) {
            material.wireframe = false;
          }
          
          // Enable texture if it exists
          if (material.map) {
            // Force texture to be visible
            material.map.needsUpdate = true;
            material.needsUpdate = true;
            
            // Set texture parameters that might help visibility
            material.map.minFilter = THREE.LinearFilter;
            material.map.magFilter = THREE.LinearFilter;
            material.map.anisotropy = 16;
          } else {
            // If no texture exists, set a bright color to make the mesh visible
            material.color.setHex(0xFF9900); // Orange
          }
          
          // Make sure opacity is correct
          material.transparent = false;
          material.opacity = 1.0;
          
          // Handle specific material types
          if (material instanceof THREE.MeshStandardMaterial) {
            // Make sure material is visible in basic lighting
            material.roughness = 0.5;
            material.metalness = 0.5;
            material.emissive.setHex(0x111111); // Slight emission to ensure visibility
          }
        });
      }
    });
    
    console.log('Textures forced to be visible');
  }

  // Add function to completely reset material settings to defaults
  public resetMaterialsToDefault(): void {
    if (!this.currentModel) return;
    
    console.log('Resetting all materials to defaults...');
    
    this.currentModel.traverse((node: { material: { [x: string]: any; }; }) => {
      if (node instanceof THREE.Mesh) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        
        materials.forEach((material: any[]) => {
          // Create a new default material based on the type
          let newMaterial;
          
          if (material instanceof THREE.MeshStandardMaterial) {
            newMaterial = new THREE.MeshStandardMaterial({
              map: material.map,
              color: 0xCCCCCC,
              roughness: 0.7,
              metalness: 0.3,
              side: THREE.DoubleSide
            });
          } else {
            newMaterial = new THREE.MeshBasicMaterial({
              map: material.map,
              color: 0xCCCCCC,
              side: THREE.DoubleSide
            });
          }
          
          // Replace the material
          if (Array.isArray(node.material)) {
            const index = materials.indexOf(material);
            node.material[index] = newMaterial;
          } else {
            node.material = newMaterial;
          }
        });
      }
    });
    
    console.log('Materials reset to defaults');
  }

  public focusCameraOnPosition(x: number, y: number, z: number): void {
    try {
      if (!this.currentModel) {
        console.warn('No model loaded to focus camera on');
        return;
      }
    
      // Position camera to focus on this point
      const lookAtPosition = new THREE.Vector3(x, y, z);
      
      // Calculate camera position a bit back from the target
      const cameraOffset = new THREE.Vector3(-2, 0, 0); // Back up a bit
      const cameraPosition = lookAtPosition.clone().add(cameraOffset);
      
      // Position and point camera
      threeCamera.camera.position.copy(cameraPosition);
      threeCamera.camera.lookAt(lookAtPosition);
      threeCamera.camera.updateProjectionMatrix();
      
      console.log(`Camera focused on position (${x}, ${y}, ${z})`);
    } catch (error) {
      console.error('Error focusing camera on position:', error);
    }
  }

  public rotateEquirectangularView(yaw: number, pitch: number): void {
    try {
      if (!this.sphere || !this.sphere.material) {
        console.warn('No sphere or material to rotate view');
        return;
      }
      
      console.log(`Attempting to rotate equirectangular view to yaw: ${yaw}°, pitch: ${pitch}°`);
      
      // If we have an equirectangular image on a sphere, rotate it
      // The texture mapping controls the viewport position
      const material = this.sphere.material instanceof THREE.Material ? 
                      this.sphere.material : this.sphere.material[0];
      
      if (material instanceof THREE.MeshBasicMaterial && material.map) {
        // Set center for rotation
        material.map.center.set(0.5, 0.5);
        
        // Convert from degrees to radians if needed
        const yawRadians = typeof yaw === 'number' ? THREE.MathUtils.degToRad(yaw) : 0;
        const pitchRadians = typeof pitch === 'number' ? THREE.MathUtils.degToRad(pitch) : 0;
        
        // For equirectangular images, we need to convert panorama coordinates properly
        // Yaw: 0-360 degrees maps to 0-1 texture offset.x
        // Pitch: -90 to 90 degrees maps to 0-1 texture offset.y
        const normalizedYaw = (yawRadians / (2 * Math.PI)) % 1;
        const normalizedPitch = (pitchRadians / Math.PI) % 1;
        
        // Apply rotation to texture
        material.map.offset.x = normalizedYaw;
        material.map.offset.y = normalizedPitch;
        
        material.map.needsUpdate = true;
        material.needsUpdate = true;
        
        console.log(`Successfully rotated view to yaw: ${yaw}°, pitch: ${pitch}°`);
        console.log(`Texture offsets: x=${material.map.offset.x.toFixed(2)}, y=${material.map.offset.y.toFixed(2)}`);
      } else {
        console.warn('Material not suitable for equirectangular rotation');
      }
    } catch (error) {
      console.error('Error rotating equirectangular view:', error);
    }
  }

  // Add a helper function to focus on detected objects
  public focusOnDetectedObject(objectName: string): boolean {
    try {
      if (!instance.detectedObjects) {
        console.warn('No detected objects available');
        return false;
      }
      
      // Find the object by name
      const object = Object.values(instance.detectedObjects).find(obj => 
        obj.name.toLowerCase() === objectName.toLowerCase()
      );
      
      if (!object) {
        console.warn(`Object with name "${objectName}" not found`);
        return false;
      }
      
      console.log(`Found object: ${object.name}`);
      
      // If we have rotation data, use it for image mode
      if (object.rotation) {
        console.log(`Rotating to yaw: ${object.rotation.yaw}, pitch: ${object.rotation.pitch}`);
        this.rotateEquirectangularView(
          object.rotation.yaw || 0,
          object.rotation.pitch || 0
        );
        return true;
      }
      // If we have position data, use it for model mode (less reliable)
      else if (object.position) {
        console.log(`Focusing on position: ${object.position.x}, ${object.position.y}, ${object.position.z}`);
        this.focusCameraOnPosition(
          object.position.x,
          object.position.y,
          object.position.z
        );
        return true;
      }
      
      console.warn(`Object ${object.name} has no position or rotation data`);
      return false;
    } catch (error) {
      console.error('Error focusing on detected object:', error);
      return false;
    }
  }
}

export const sceneManager = new SceneManager();



  
