// SPDX-License-Identifier: MPL-2.0

import { blobToHex } from "./blobToHex.ts"

const blobToBigint = async (blob: Blob): Promise<bigint> => {
	return BigInt(`0x${await blobToHex(blob)}`)
}

export {
	/**
	 * @internal
	 * @private
	 * @deprecated
	 */
	blobToBigint,
}