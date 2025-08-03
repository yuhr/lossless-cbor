// SPDX-License-Identifier: MPL-2.0

import type ByteSource from "./ByteSource.ts"
import fromBytes from "./fromBytes.ts"
import toValue from "./toValue.ts"

/**
 * Decodes a CBOR representation into a corresponding bare value.
 *
 * `await decode(source)` is equivalent to `await toValue(await fromBytes(source, { allowEmpty: false }))`.
 */
const decode = async (source: ByteSource, options: decode.Options = {}): Promise<unknown> => {
	const specifiedAllowEmptyAsUndefined =
		options.fromBytes !== undefined &&
		"allowEmpty" in options.fromBytes &&
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		options.fromBytes.allowEmpty === undefined
	if (specifiedAllowEmptyAsUndefined)
		throw new Error("Setting `allowEmpty` to `undefined` is unsupported in `decode`.")

	const dataItem = await fromBytes(source, {
		...options.fromBytes,
		allowEmpty: options.fromBytes?.allowEmpty ?? false,
	})
	if (!dataItem) return undefined
	return await toValue(dataItem, options.toValue)
}

namespace decode {
	export type Options = {
		toValue?: toValue.Options
		fromBytes?: fromBytes.Options & { allowEmpty?: boolean }
	}
}

export default decode