import {MeterProcessor} from "./MeterProcessor"
import {EngineProcessor} from "./EngineProcessor"
import {RecordingProcessor} from "./RecordingProcessor"

registerProcessor("meter-processor", MeterProcessor)
registerProcessor("engine-processor", EngineProcessor)
registerProcessor("recording-processor", RecordingProcessor)