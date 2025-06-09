import Environment from "../../enums/Environment";

export default interface GoceImage {
    request_id: string;
    environment: Environment;
    image_url: string;
    flipY: boolean;
    glb_data?: string;
    detected_objects?: Record<string, DetectedObject>;
    models?: {
        glb?: string;
        [key: string]: any;
    };
}

export interface DetectedObject {
    name: string;
    confidence: number;
    position?: {
        x: number;
        y: number;
        z: number;
    };
    rotation?: {
        pitch?: number;
        yaw?: number;
    };
    category?: string;
    [key: string]: any;
}