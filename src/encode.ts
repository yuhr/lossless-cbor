// SPDX-License-Identifier: MPL-2.0

import fromValue from "./fromValue.ts"
import toBytes from "./toBytes.ts"

/**
 * Encodes a bare value into a corresponding CBOR representation.
 *
 * `await encode(value)` is equivalent to `await toBytes(await fromValue(value))`.
 */
const encode = async (value: unknown, options: encode.Options = {}): Promise<Uint8Array> =>
	await toBytes(await fromValue(value, options.fromValue), options.toBytes)

namespace encode {
	export type Options = {
		toBytes?: toBytes.Options
		fromValue?: fromValue.Options
	}
}

export default encode