"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TuyaWebPlatform = void 0;
const settings_1 = require("./settings");
const accessories_1 = require("./accessories");
const errors_1 = require("./errors");
const DeviceList_1 = require("./helpers/DeviceList");
const response_1 = require("./api/response");
const service_1 = require("./api/service");
const platform_1 = require("./api/platform");
const GarageDoorAccessory_1 = require("./accessories/GarageDoorAccessory");
const TemperatureSensorAccessory_1 = require("./accessories/TemperatureSensorAccessory");
const WindowAccessory_1 = require("./accessories/WindowAccessory");
/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
class TuyaWebPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        // this is used to track restored cached accessories
        this.accessories = new Map();
        this.failedToInitAccessories = new Map();
        this.log.debug("Finished initializing platform:", this.config.name);
        if (!config || !config.options) {
            this.log.info("No options found in configuration file, disabling plugin.");
            return;
        }
        const options = config.options;
        if (options.username === undefined ||
            options.password === undefined ||
            options.countryCode === undefined) {
            this.log.error("Missing required config parameter.");
            return;
        }
        if (options.platform !== undefined &&
            !platform_1.TuyaPlatforms.includes(options.platform)) {
            this.log.error("Invalid platform provided, received %s but must be one of %s", options.platform, platform_1.TuyaPlatforms);
        }
        // Set cloud polling interval
        this.pollingInterval = config.options.pollingInterval;
        // Create Tuya Web API instance
        this.tuyaWebApi = new service_1.TuyaWebApi(options.username, options.password, options.countryCode, options.platform, this.log);
        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on("didFinishLaunching", () => {
            void this.postLaunchSetup.bind(this)();
        });
    }
    async postLaunchSetup() {
        var _a;
        try {
            await this.tuyaWebApi.getOrRefreshToken();
            // run the method to discover / register your devices as accessories
            await this.discoverDevices();
            if (this.pollingInterval) {
                //Tuya will probably still complain if we fetch a new request on the exact second.
                const pollingInterval = Math.max(this.pollingInterval, settings_1.TUYA_DISCOVERY_TIMEOUT + 5);
                (_a = this.log) === null || _a === void 0 ? void 0 : _a.info("Enable cloud polling with interval %ss", pollingInterval);
                // Set interval for refreshing device states
                setInterval(() => {
                    this.refreshDeviceStates().catch((e) => {
                        if (e instanceof Error) {
                            this.log.error(e.message);
                            if (e.stack) {
                                this.log.debug(e.stack);
                            }
                        }
                    });
                }, pollingInterval * 1000);
            }
        }
        catch (e) {
            if (e instanceof errors_1.AuthenticationError) {
                this.log.error("Authentication error: %s", e.message);
                return;
            }
            if (e instanceof Error) {
                this.log.error(e.message);
                if (e.stack) {
                    this.log.debug(e.stack);
                }
                return;
            }
            this.log.error("Unknown error: %s", e);
        }
    }
    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to set up event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory) {
        this.log.info("Loading accessory from cache:", accessory.displayName);
        // add the restored accessory to the accessories cache, so we can track if it has already been registered
        this.accessories.set(accessory.UUID, accessory);
    }
    removeAccessory(accessory) {
        this.log.info("Removing accessory:", accessory.displayName);
        this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [
            accessory,
        ]);
        this.accessories.delete(accessory.UUID);
    }
    // Called from device classes
    registerPlatformAccessory(accessory) {
        this.log.debug("Register Platform Accessory (%s)", accessory.displayName);
        this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [
            accessory,
        ]);
        this.accessories.set(accessory.UUID, accessory);
    }
    async refreshDeviceStates(devices) {
        var _a, _b;
        devices =
            devices !== null && devices !== void 0 ? devices : this.filterDeviceList(await this.tuyaWebApi.getAllDeviceStates());
        if (!devices) {
            return;
        }
        // Refresh device states
        for (const device of devices) {
            const uuid = this.api.hap.uuid.generate(device.id);
            const homebridgeAccessory = this.accessories.get(uuid);
            if (homebridgeAccessory) {
                (_a = homebridgeAccessory.controller) === null || _a === void 0 ? void 0 : _a.updateAccessory(device);
            }
            else if (!((_b = this.failedToInitAccessories.get(device.dev_type)) === null || _b === void 0 ? void 0 : _b.includes(uuid))) {
                this.log.error("Could not find Homebridge device with UUID (%s) for Tuya device (%s)", uuid, device.name);
            }
        }
    }
    addAccessory(device) {
        var _a;
        const deviceType = (_a = device.dev_type) !== null && _a !== void 0 ? _a : "switch";
        const uuid = this.api.hap.uuid.generate(device.id);
        const homebridgeAccessory = this.accessories.get(uuid);
        // Construct new accessory
        switch (deviceType) {
            case "cover":
                new accessories_1.CoverAccessory(this, homebridgeAccessory, device);
                break;
            case "climate":
                new accessories_1.ClimateAccessory(this, homebridgeAccessory, device);
                break;
            case "dimmer":
                new accessories_1.DimmerAccessory(this, homebridgeAccessory, device);
                break;
            case "fan":
                new accessories_1.FanAccessory(this, homebridgeAccessory, device);
                break;
            case "garage":
                new GarageDoorAccessory_1.GarageDoorAccessory(this, homebridgeAccessory, device);
                break;
            case "light":
                new accessories_1.LightAccessory(this, homebridgeAccessory, device);
                break;
            case "outlet":
                new accessories_1.OutletAccessory(this, homebridgeAccessory, device);
                break;
            case "scene":
                new accessories_1.SceneAccessory(this, homebridgeAccessory, device);
                break;
            case "switch":
                new accessories_1.SwitchAccessory(this, homebridgeAccessory, device);
                break;
            case "temperature_sensor":
                new TemperatureSensorAccessory_1.TemperatureSensorAccessory(this, homebridgeAccessory, device);
                break;
            case "window":
                new WindowAccessory_1.WindowAccessory(this, homebridgeAccessory, device);
                break;
            default:
                if (!this.failedToInitAccessories.get(deviceType)) {
                    this.log.warn("Could not init class for device type [%s]", deviceType);
                    this.failedToInitAccessories.set(deviceType, []);
                }
                this.failedToInitAccessories.set(deviceType, [
                    uuid,
                    ...this.failedToInitAccessories.get(deviceType),
                ]);
                break;
        }
    }
    filterDeviceList(devices) {
        if (!devices) {
            return [];
        }
        const allowedSceneIds = this.getAllowedSceneIds(devices);
        const hiddenAccessoryIds = this.getHiddenAccessoryIds(devices);
        return devices
            .filter((d) => d.dev_type !== "scene" || allowedSceneIds.includes(d.id))
            .filter((d) => !hiddenAccessoryIds.includes(d.id));
    }
    async discoverDevices() {
        var _a;
        let devices = (_a = (await this.tuyaWebApi.discoverDevices())) !== null && _a !== void 0 ? _a : [];
        // Is device type overruled in config defaults?
        devices = this.applyConfigOverwrites(devices);
        devices.forEach((device) => {
            var _a;
            if (((_a = device.config) === null || _a === void 0 ? void 0 : _a.old_dev_type) &&
                device.config.old_dev_type.toLowerCase() !==
                    device.dev_type.toLowerCase()) {
                this.log.info('Device type for "%s" is overruled in config from %s to: "%s"', device.name, device.config.old_dev_type, device.dev_type);
            }
        });
        devices = this.filterDeviceList(devices);
        const cachedDeviceIds = [...this.accessories.keys()];
        const availableDeviceIds = devices.map((d) => this.generateUUID(d.id));
        for (const cachedDeviceId of cachedDeviceIds) {
            if (!availableDeviceIds.includes(cachedDeviceId)) {
                const device = this.accessories.get(cachedDeviceId);
                this.log.warn("Device: %s - is no longer available and will be removed", device.displayName);
                this.removeAccessory(device);
            }
        }
        // loop over the discovered devices and register each one if it has not already been registered
        for (const device of devices) {
            this.addAccessory(device);
        }
        await this.refreshDeviceStates(devices);
    }
    /**
     * Returns a validated set of defaults and their devices for which the type will need to be overridden.
     * @param devices
     * @private
     */
    applyConfigOverwrites(devices) {
        const configOverwriteData = this.config.defaults;
        if (!configOverwriteData) {
            return devices;
        }
        for (const configOverwrite of configOverwriteData) {
            if (!configOverwrite.id) {
                this.log.warn("Missing required `id` property on device configuration, received:\r\n%s", JSON.stringify(configOverwrite, undefined, 2));
                continue;
            }
            if (!configOverwrite.device_type) {
                this.log.warn("Missing required `device_type` property on device configuration, received:\r\n%s", JSON.stringify(configOverwrite, undefined, 2));
                continue;
            }
            configOverwrite.device_type =
                configOverwrite.device_type.toLowerCase();
            const device = devices.find((device) => device.id === configOverwrite.id ||
                device.name === configOverwrite.id);
            if (!device) {
                this.log.warn('Tried overwriting device config for: "%s" which is not a valid device-id or device-name.', configOverwrite.id);
                continue;
            }
            if (!response_1.TuyaDeviceTypes.includes(configOverwrite.device_type)) {
                this.log.warn('Tried overwriting device config for: "%s" - device-type "%s" is not a valid device-type.', device.name, configOverwrite.device_type);
                continue;
            }
            configOverwrite.old_dev_type = device.dev_type;
            device.dev_type = configOverwrite.device_type;
            delete configOverwrite.device_type;
            delete configOverwrite.id;
            device.config = configOverwrite;
        }
        return devices;
    }
    /**
     * Returns a list of all allowed scene Ids.
     * @param devices
     * @private
     */
    getAllowedSceneIds(devices) {
        if (!this.config.scenes) {
            return [];
        }
        const sceneList = new DeviceList_1.DeviceList(devices.filter((d) => d.dev_type === "scene"));
        if (!Array.isArray(this.config.scenesWhitelist) ||
            this.config.scenesWhitelist.length === 0) {
            return sceneList.all;
        }
        const allowedSceneIds = [];
        for (const toAllowSceneIdentifier of this.config
            .scenesWhitelist) {
            const deviceIdentifier = sceneList.find(toAllowSceneIdentifier);
            if (deviceIdentifier) {
                allowedSceneIds.push(deviceIdentifier);
                continue;
            }
            this.log.warn("Tried allowing non-existing scene %s", toAllowSceneIdentifier);
        }
        return [...new Set(allowedSceneIds)];
    }
    /**
     * Returns a list of all devices that are not supposed to be exposed.
     * @param devices
     * @private
     */
    getHiddenAccessoryIds(devices) {
        if (!this.config.hiddenAccessories) {
            return [];
        }
        if (!Array.isArray(this.config.hiddenAccessories) ||
            this.config.hiddenAccessories.length === 0) {
            return [];
        }
        const deviceList = new DeviceList_1.DeviceList(devices);
        const hiddenAccessoryIdentifiers = [];
        for (const toDisallowAccessoryIdentifier of this.config
            .hiddenAccessories) {
            const deviceIdentifier = deviceList.find(toDisallowAccessoryIdentifier);
            if (deviceIdentifier) {
                hiddenAccessoryIdentifiers.push(deviceIdentifier);
                continue;
            }
            this.log.warn("Tried disallowing non-existing device %s", toDisallowAccessoryIdentifier);
        }
        return [...new Set(hiddenAccessoryIdentifiers)];
    }
    get platformAccessory() {
        return this.api.platformAccessory;
    }
    get generateUUID() {
        return this.api.hap.uuid.generate;
    }
}
exports.TuyaWebPlatform = TuyaWebPlatform;
//# sourceMappingURL=platform.js.map