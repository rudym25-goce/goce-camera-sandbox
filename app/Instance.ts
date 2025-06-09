//our imports
import Environment from "../enums/Environment";
import GoCeImage from "./interfaces/GoCeImage";


class Instance {
    environment: Environment = Environment.EXTERIOR_LOCATION
    goceImage: GoCeImage | null = null;        
}

export const instance = new Instance()