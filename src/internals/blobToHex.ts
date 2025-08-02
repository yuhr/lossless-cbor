// SPDX-License-Identifier: MPL-2.0

const blobToHex = async (blob: Blob): Promise<string> =>
	(await blob.bytes())
		.values()
		.map(byte => {
			let hex = byte.toString(16)
			if (hex.length % 2) hex = "0" + hex
			return hex
		})
		.toArray()
		.join("")

export {
	/**
	 * @internal
	 * @private
	 * @deprecated
	 */
	blobToHex,
}