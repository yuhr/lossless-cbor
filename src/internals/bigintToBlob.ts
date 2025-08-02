// SPDX-License-Identifier: MPL-2.0

const bigintToBlob = (bigint: bigint): Blob => {
	if (bigint < 0n) bigint = -1n - bigint
	let hex = bigint.toString(16)
	if (hex.length % 2) hex = "0" + hex
	const length = hex.length / 2
	const buffer = new Uint8Array(length)
	for (let i = 0; i < length; i++) buffer[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
	return new Blob([buffer])
}

export {
	/**
	 * @internal
	 * @private
	 * @deprecated
	 */
	bigintToBlob,
}