import {EqBandType, EqualizerSchema, ParameterDecoder} from "@opendaw/lib-dawproject"
import {RevampDeviceBox} from "@opendaw/studio-boxes"
import {BoxGraph, Field} from "@opendaw/lib-box"
import {clamp, ifDefined, int, UUID} from "@opendaw/lib-std"
import {Pointers} from "@opendaw/studio-enums"
import {semitoneToHz} from "@opendaw/lib-dsp"

export namespace BuiltinDevices {
    const mapQ = (Qbw: number) => clamp(20 * Math.log10(Qbw), 0.01, 10)

    export const equalizer = (boxGraph: BoxGraph,
                              equalizer: EqualizerSchema,
                              field: Field<Pointers.MidiEffectHost> | Field<Pointers.AudioEffectHost>,
                              index: int): RevampDeviceBox => {
        return RevampDeviceBox.create(boxGraph, UUID.generate(), box => {
            box.host.refer(field)
            box.index.setValue(index)
            box.label.setValue(equalizer.deviceName ?? "Revamp")
            equalizer.bands.forEach((band) => {
                switch (band.type) {
                    case EqBandType.HIGH_PASS: {
                        const {order, frequency, q, enabled} = box.highPass
                        // TODO order.setValue((band.order ?? 1) - 1)
                        frequency.setValue(semitoneToHz(band.freq.value))
                        ifDefined(band.Q?.value, value => q.setValue(mapQ(value)))
                        ifDefined(band.enabled?.value === true, value => enabled.setValue(value))
                        return
                    }
                    case EqBandType.LOW_PASS: {
                        const {order, frequency, q, enabled} = box.lowPass
                        // TODO order.setValue((band.order ?? 1) - 1)
                        frequency.setValue(ParameterDecoder.readValue(band.freq))
                        ifDefined(band.Q?.value, value => q.setValue(mapQ(value)))
                        ifDefined(band.enabled?.value === true, value => enabled.setValue(value))
                        return
                    }
                    case EqBandType.HIGH_SHELF: {
                        const {frequency, gain, enabled} = box.highShelf
                        frequency.setValue(ParameterDecoder.readValue(band.freq))
                        ifDefined(band.gain?.value, value => gain.setValue(value))
                        ifDefined(band.enabled?.value === true, value => enabled.setValue(value))
                        return
                    }
                    case EqBandType.LOW_SHELF: {
                        const {frequency, gain, enabled} = box.lowShelf
                        frequency.setValue(ParameterDecoder.readValue(band.freq))
                        ifDefined(band.gain?.value, value => gain.setValue(value))
                        ifDefined(band.enabled?.value === true, value => enabled.setValue(value))
                        return
                    }
                    case EqBandType.BELL: {
                        const {frequency, gain, q, enabled} = box.lowBell // TODO use all 3 for each new node
                        frequency.setValue(ParameterDecoder.readValue(band.freq))
                        ifDefined(band.Q?.value, value => {
                            const mapped = mapQ(value)
                            console.debug(value, mapped)
                            q.setValue(mapped)
                        })
                        ifDefined(band.gain?.value, value => gain.setValue(value))
                        ifDefined(band.enabled?.value === true, value => enabled.setValue(value))
                        return
                    }
                }
            })
        })
    }
}