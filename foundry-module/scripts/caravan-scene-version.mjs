// Native v14 levels must be marked as v14 data. Otherwise the server runs
// migrateLevels (14.353) and replaces them using the absent v13 background.
export const SCENE_CORE_VERSION = "14.364";
export const sceneStats = () => ({ coreVersion: SCENE_CORE_VERSION });
