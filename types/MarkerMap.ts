import Environment from "../enums/Environment";

type MarkerMap = {
    [key in Environment]: { angle: number; count: number }[];
};

export default MarkerMap;