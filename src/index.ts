import { API } from "homebridge";

import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";
import { TuyaWebPlatform } from "./platform";

/**
 * This method registers the platform with Homebridge
 */
export default (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, TuyaWebPlatform);
};

// Export plugin information for Homebridge v2 compatibility
export const pluginName = PLUGIN_NAME;
export const platformName = PLATFORM_NAME;
