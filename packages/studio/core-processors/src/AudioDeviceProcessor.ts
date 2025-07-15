import {DeviceProcessor} from "./DeviceProcessor"
import {AudioGenerator} from "./processing"

export interface AudioDeviceProcessor extends DeviceProcessor, AudioGenerator {}