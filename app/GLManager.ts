//our imports
import { Asset } from 'expo-asset';
import { capturePointsManager } from './CapturePointManager';
import { cullingManager } from './CullingManager';
import { marker } from './Marker';
import { sceneManager } from './SceneManager';
import { threeCamera } from './ThreeCamera';

//third-party imports
import { ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, THREE } from "expo-three";

class GLManager {

    renderer: Renderer | null = null;
    isLoading: boolean = false
    loadComplete: boolean = false
    private animationFrameId: number | null = null;

    private disposeRenderer() {
        if (this.renderer) {
            //@ts-ignore
            this.cleanup(); // Clean up animation frame first
            //@ts-ignore
            this.renderer.dispose();
            //@ts-ignore
            this.renderer.forceContextLoss();
            this.renderer = null;
        }
    }

    public cleanup() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    // In your render function or useFrame hook
    private onRender = (gl: ExpoWebGLRenderingContext) => {
        if (!threeCamera.camera || capturePointsManager.allCapturePointsComplete()) return;
    
        cullingManager.updateFrustum(threeCamera.camera);
    
        capturePointsManager.capturePoints.forEach(capturePoint => {
            if (!capturePoint.complete) return;
            const isVisible = cullingManager.isInView(capturePoint);
            const wasVisible = capturePoint.plateIsVisible;
            if (isVisible && !wasVisible) {
                capturePoint.plateIsVisible = isVisible
                sceneManager.addImage(capturePoint);
            } else if (!isVisible && wasVisible) {
                capturePoint.plateIsVisible = isVisible
                sceneManager.disposePlate(capturePoint);
            }
        });
    
        //@ts-ignore
        this.renderer.render(sceneManager.scene, threeCamera.camera);
    };

    // WebGL context creation
    public onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
        try{
            this.isLoading = true

            //Properly dispose of previous renderer
            this.disposeRenderer()
            

            // removes the warning EXGL: gl.pixelStorei() doesn't support this parameter yet!
            const pixelStorei = gl.pixelStorei.bind(gl);
            gl.pixelStorei = function (...args) {
                const [parameter] = args;
                switch (parameter) {
                    case gl.UNPACK_FLIP_Y_WEBGL:
                    return pixelStorei(...args);
                }
            };

            // Initialize renderer with specific configuration
            this.renderer = new Renderer({ 
                gl,
                antialias: true,
                alpha: true,
                preserveDrawingBuffer: true,
                powerPreference: 'high-performance'
            });
            //@ts-ignore
            this.renderer.setPixelRatio(Math.min(2, gl.scale || 1));
            //@ts-ignore
            this.renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
            //@ts-ignore
            this.renderer.setClearColor(0x000000, 0);
            //@ts-ignore
            this.renderer.autoClear = true;
            //@ts-ignore

            // Only check shader errors in development
            //@ts-ignore
            this.renderer.debug = {
                checkShaderErrors: false // Disable shader error checking for now
            };


            // Setup scene
            await sceneManager.reset();
            threeCamera.setUpCamera(gl.drawingBufferWidth / gl.drawingBufferHeight);
            this.setupLights();
            //sceneManager.addSphere();

            // Start animation
            this.startAnimation(gl)

            this.isLoading = false;
            this.loadComplete = true;
        } catch(error){
            console.error("Error in GL context creation:", error);
            this.isLoading = false;
            this.loadComplete = false;
        }
        
    };

    private startAnimation(gl: ExpoWebGLRenderingContext) {
        const animate = () => {
            try {
                this.animationFrameId = requestAnimationFrame(animate);
                
                if (!this.renderer || !sceneManager.scene || !threeCamera.camera) {
                    return;
                }
    
                this.onRender(gl);
                this.updateMarkers();
                
                // Only render if we have valid objects
                if (this.renderer && sceneManager.scene && threeCamera.camera) {
                    //@ts-ignore
                    this.renderer.clear();
                    //@ts-ignore
                    this.renderer.render(sceneManager.scene, threeCamera.camera);
                    gl.endFrameEXP();
                }
            } catch (error) {
                console.error("Error in animation loop:", error);
                this.cleanup();
            }
        };
        animate();
    }
  
    // Separate light setup for clarity
    private setupLights = () => {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1).normalize();
        sceneManager.scene.add(ambientLight, directionalLight);
    };
  
    // Optimize marker updates
    private updateMarkers = () => {
        if (capturePointsManager.allCapturePointsComplete() && capturePointsManager.capturePoints.length > 1) {
            const now = Date.now() * 0.005;
            capturePointsManager.capturePoints.forEach((point, index) => {
                if (point.marker) {
                const scale = 1.5 + Math.sin(now + index * 0.5) * 0.2;
                point.marker.scale.setScalar(scale);
                }
            });
        }
    };
  
    // Separate render function
    private renderScene = (gl: ExpoWebGLRenderingContext) => {
        if (!this.renderer || !sceneManager.scene || !threeCamera.camera) {
            console.warn('Animation skipped: Missing required objects', {
                hasRenderer: !!this.renderer,
                hasScene: !!sceneManager.scene,
                hasCamera: !!threeCamera.camera
            });
            return;
        }
        //@ts-ignore
        this.renderer.clear();
        //@ts-ignore
        this.renderer.render(sceneManager.scene, threeCamera.camera);
        
        gl.endFrameEXP();
    };

    public resetGLView = async () => {

        //Pause animation
        this.cleanup()

        // Add this line to remove the arrow
        sceneManager.removeArrow();

        try{
            const [{ localUri }] = await Asset.loadAsync(require("../assets/loader_icon.png"));

            const markerTexture = await new Promise<THREE.Texture>((resolve, reject) => {
                sceneManager.textureLoader.load(localUri, resolve, undefined, reject);
            });

            let markerMaterial = new THREE.MeshBasicMaterial({
                map: markerTexture,
                side: THREE.DoubleSide, // Make the circle visible from both sides
                transparent: true,
            });

            capturePointsManager.capturePoints.forEach((point) => {
                sceneManager.disposePlate(point);
                point.plate = null;
                const { x, y, z } = point.position || { x: 0, y: 0, z: 0 };
                if (point.marker) {
                    sceneManager.removeThreeElement(point.marker);
                }
                point.marker = marker.createMarker(x, y, z, markerMaterial);
                sceneManager.scene.add(point.marker);
            });

            
            // @ts-ignore Force a re-render
            //this.renderer.render(sceneManager.scene, threeCamera.camera);

            // Resume animation if needed
            if (this.renderer && !this.animationFrameId) {
                //@ts-ignore
                this.startAnimation(this.renderer.getContext());
            }
            
        } catch(error){
            console.error("Error resetting GLView: ", error)
        }
    };

}

export const glManager = new GLManager()