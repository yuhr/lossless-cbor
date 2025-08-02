// SPDX-License-Identifier: MPL-2.0

import DataItem from "./DataItem.ts"
import { blobToBigint } from "./internals/blobToBigint.ts"

/**
 * Transforms the data item into a bare value.
 *
 * Default transformations are as follows:
 *
 * - Integer → `bigint`
 * - Byte string → `ArrayBuffer`
 * - Text string → `string`
 * - Array → `unknown[]`
 * - Map → `Map`
 * - Float → `number`
 * - Boolean → `boolean`
 * - Null → `null`
 * - Undefined → `undefined`
 * - Tag #0 and #1 → `Date`
 * - Tag #2 and #3 → `bigint`
 */
const toValue = async (dataItem: DataItem, options: toValue.Options = {}): Promise<unknown> => {
	let transformer: toValue.Transformer | undefined
	try {
		transformer = options.transformers?.get(dataItem.type)
		if (transformer) return await transformer(dataItem, options)
	} catch (error) {
		if (error !== undefined) throw error
	}
	try {
		transformer = transformersDefault.get(dataItem.type)
		if (transformer) return await transformer(dataItem, options)
	} catch (error) {
		if (error !== undefined) throw error
	}
	return dataItem
}

namespace toValue {
	export type Options = {
		/**
		 * A map from the types of data items to corresponding transformers. If not found or threw `undefined`, it falls back to the default implementation: see {@link transformersDefault|`transformersDefault`}.
		 */
		transformers?: Map<DataItem.Type, toValue.Transformer> | undefined
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export type Transformer<T extends DataItem = any> = (
		dataItem: T,
		options: toValue.Options,
	) => unknown | Promise<unknown>
}

const transformersDefault = new Map<DataItem.Type, toValue.Transformer>([
	["int", async ({ value }: DataItem.Integer, options): Promise<bigint> => value],
	[
		"bstr",
		async ({ value }: DataItem.ByteString, options): Promise<ArrayBuffer> =>
			await (DataItem.Indefinite.isIndefinite(value)
				? new Blob((await Array.fromAsync(value.chunks)).map(({ value }) => value))
				: value
			).arrayBuffer(),
	],
	[
		"tstr",
		async ({ value }: DataItem.TextString, options): Promise<string> =>
			DataItem.Indefinite.isIndefinite(value)
				? (await Array.fromAsync(value.chunks)).map(({ value }) => value).join("")
				: value,
	],
	[
		"array",
		async ({ value }: DataItem.Array, options): Promise<unknown[]> =>
			await Promise.all(
				(DataItem.Indefinite.isIndefinite(value) ? await Array.fromAsync(value.chunks) : value).map(
					async dataItem => await toValue(dataItem, options),
				),
			),
	],
	[
		"map",
		async ({ value }: DataItem.Map, options): Promise<Map<unknown, unknown>> =>
			new Map(
				await Promise.all(
					(DataItem.Indefinite.isIndefinite(value)
						? await Array.fromAsync(value.chunks)
						: value
					).map(
						async ([key, value]) =>
							[await toValue(key, options), await toValue(value, options)] as const,
					),
				),
			),
	],
	["float", async ({ value }: DataItem.Float, options): Promise<number> => value],
	[
		"simple",
		async ({ value }: DataItem.Simple, options): Promise<boolean | null | undefined> => {
			if (typeof value === "bigint") throw new Error("Invalid simple value.")
			else return value
		},
	],
	[
		0n,
		async ({ value }: DataItem.Tag<0n, DataItem.TextString>, options): Promise<Date> => {
			const string = await toValue(value, options)
			if (typeof string !== "string") throw new Error("Incorrect content for tag number 0.")
			return new Date(string)
		},
	],
	[
		1n,
		async (
			{ value }: DataItem.Tag<1n, DataItem.Integer | DataItem.Float>,
			options,
		): Promise<Date> => {
			const seconds = await toValue(value, options)
			if (typeof seconds !== "bigint" && typeof seconds !== "number")
				throw new Error("Incorrect content for tag number 1.")
			return new Date(Number(seconds) * 1000)
		},
	],
	[
		2n,
		async ({ value }: DataItem.Tag<2n, DataItem.ByteString>, options): Promise<bigint> => {
			const content = await toValue(value, options)
			if (!(content instanceof ArrayBuffer)) throw new Error("Incorrect content for tag number 2.")
			return await blobToBigint(new Blob([content]))
		},
	],
	[
		3n,
		async ({ value }: DataItem.Tag<3n, DataItem.ByteString>, options): Promise<bigint> => {
			const content = await toValue(value, options)
			if (!(content instanceof ArrayBuffer)) throw new Error("Incorrect content for tag number 3.")
			return -1n - (await blobToBigint(new Blob([content])))
		},
	],
] as const)

export default toValue