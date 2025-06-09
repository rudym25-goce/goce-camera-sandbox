//third-party imports
import { Platform } from "react-native";

class PlatformManager{

    betaTolerance: number;
    rotateImage: boolean;
    rotationOrder: string;

    constructor(){
        const ios = Platform.OS === 'ios';
        this.betaTolerance = ios ? 3 : 10;
        this.rotateImage = ios
        this.rotationOrder = ios ? 'ZXY' : 'ZXY'
    }
    
}

export const platform = new PlatformManager()