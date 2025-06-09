import { apiManager } from "./ApiManager"
import { deviceCamera } from "./DeviceCamera"
import { marker } from "./Marker"
import { sceneManager } from "./SceneManager"

class ResetManager{
    public hasBeenReset: boolean = true

    public async resetCaptureVariables() {
        if(!this.hasBeenReset){
            await sceneManager.reset()

            apiManager.reset()
            deviceCamera.reset()
            marker.reset()
            
            this.hasBeenReset = true
        }
    }
}

export const resetManager = new ResetManager()