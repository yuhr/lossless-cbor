// SPDX-License-Identifier: MPL-2.0

import { bigintToBlob } from "./bigintToBlob.ts"
import type DataItem from "../DataItem.ts"

const toAdditionalFromArgument = (argument: bigint | number): DataItem.Head.Additional => {
	if (typeof argument === "bigint") {
		if (argument < 0n) {
			throw new Error("Data item argument less than 0 is invalid.")
		} else if (argument < 24n) {
			return Object.freeze({ information: Number(argument), bytes: new Blob([]) })
		} else if (argument < (2n ** 8n) ** 1n) {
			return Object.freeze({ information: 24, bytes: bigintToBlob(argument) })
		} else if (argument < (2n ** 8n) ** 2n) {
			return Object.freeze({ information: 25, bytes: bigintToBlob(argument) })
		} else if (argument < (2n ** 8n) ** 4n) {
			return Object.freeze({ information: 26, bytes: bigintToBlob(argument) })
		} else if (argument < (2n ** 8n) ** 8n) {
			return Object.freeze({ information: 27, bytes: bigintToBlob(argument) })
		} else {
			throw new Error("Data item argument greater than 2⁶⁴-1 is invalid.")
		}
	} else {
		if (Number.isNaN(argument))
			return Object.freeze({ information: 25, bytes: new Blob([Uint8Array.of(0x7e, 0x00)]) })

		const buffer64 = new ArrayBuffer(64 / 8)
		const dataView64 = new DataView(buffer64)
		dataView64.setFloat64(0, argument)

		const buffer32 = new ArrayBuffer(32 / 8)
		const dataView32 = new DataView(buffer32)
		dataView32.setFloat32(0, argument)
		if (!Object.is(argument, dataView32.getFloat32(0)))
			return Object.freeze({ information: 27, bytes: new Blob([buffer64]) })

		const buffer16 = new ArrayBuffer(16 / 8)
		const dataView16 = new DataView(buffer16)
		dataView16.setFloat16(0, argument)
		if (!Object.is(argument, dataView16.getFloat16(0)))
			return Object.freeze({ information: 26, bytes: new Blob([buffer32]) })

		return Object.freeze({ information: 25, bytes: new Blob([buffer16]) })
	}
}

export {
	/**
	 * @internal
	 * @private
	 * @deprecated
	 */
	toAdditionalFromArgument,
}