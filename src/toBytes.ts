// SPDX-License-Identifier: MPL-2.0

import DataItem from "./DataItem.ts"
import { argumentToAdditional } from "./internals/argumentToAdditional.ts"

/**
 * Encodes the data item into bytes.
 */
const toBytes = async (dataItem: DataItem, options: toBytes.Options = {}): Promise<Uint8Array> => {
	const { selfDescribed } = options
	if (selfDescribed) dataItem = DataItem.Tag(55799n, dataItem)
	const chunks: Uint8Array<ArrayBuffer>[] = []
	const stream = new WritableStream<Uint8Array<ArrayBuffer>>({
		write: async chunk => void chunks.push(chunk),
	})
	const writer = stream.getWriter()
	await encodeDataItem(writer, dataItem, options)
	return await new Blob(chunks).bytes()
}

namespace toBytes {
	export type Options = {
		/**
		 * Whether to wrap within the [self-described CBOR](https://www.rfc-editor.org/rfc/rfc8949.html#name-self-described-cbor) tag automatically. Specifying `true` is equivalent to manually wrapping the data item with a tag of number `55799`.
		 *
		 * @default false
		 */
		selfDescribed?: boolean | undefined

		/**
		 * Whether to enforce the [core deterministic encoding requirements](https://www.rfc-editor.org/rfc/rfc8949.html#name-core-deterministic-encoding), regardless of the original encoding variation stored in the given data items.
		 *
		 * @default false
		 */
		deterministic?: boolean | undefined

		/**
		 * How to sort map keys when `deterministic` option is `true`.
		 *
		 * - `"default"` — [default lexicographic sorting](https://www.rfc-editor.org/rfc/rfc8949.html#section-4.2.1-2.3.1) in RFC8949
		 * - `"length-first"` — [length-first lexicographic sorting](https://www.rfc-editor.org/rfc/rfc8949.html#section-4.2.3-2) a.k.a. “Canonical CBOR” in RFC7049
		 *
		 * @default "default"
		 */
		sort?: "length-first" | "default" | undefined
	}
}

const encodeDataItem = async (
	writer: WritableStreamDefaultWriter<Uint8Array>,
	dataItem: DataItem,
	options: toBytes.Options,
): Promise<void> => {
	const { type, value, head } = dataItem
	const { deterministic = false, sort = "default" } = options
	switch (type) {
		case "int":
			await encodeHead(writer, head, options)
			break
		case "bstr":
			if (DataItem.Indefinite.isIndefinite(value)) {
				if (deterministic) {
					const chunks = await Array.fromAsync(value.chunks)
					const blob = new Blob(chunks.map(({ value }) => value))
					const argument = BigInt(blob.size)
					const additional = argumentToAdditional(argument)
					await encodeHead(writer, Object.freeze({ majorType: 2, argument, additional }), options)
					await writer.write(await blob.bytes())
				} else {
					await encodeHead(writer, head, options)
					for await (const chunk of value.chunks) await encodeDataItem(writer, chunk, options)
					await encodeHead(writer, breakStop, options)
				}
			} else {
				await encodeHead(writer, head, options)
				await writer.write(await value.bytes())
			}
			break
		case "tstr":
			if (DataItem.Indefinite.isIndefinite(value)) {
				if (deterministic) {
					const chunks = await Array.fromAsync(value.chunks)
					const string = chunks.map(({ value }) => value).join("")
					const argument = BigInt(string.length)
					const additional = argumentToAdditional(argument)
					const head: DataItem.Head = Object.freeze({ majorType: 3, argument, additional })
					await encodeHead(writer, head, options)
					await writer.write(textEncoder.encode(string))
				} else {
					await encodeHead(writer, head, options)
					for await (const chunk of value.chunks) await encodeDataItem(writer, chunk, options)
					await encodeHead(writer, breakStop, options)
				}
			} else {
				const bytes = new Uint8Array(textEncoder.encode(value))
				await encodeHead(writer, head, options)
				await writer.write(bytes)
			}
			break
		case "array":
			if (DataItem.Indefinite.isIndefinite(value)) {
				if (deterministic) {
					const elements = await Array.fromAsync(value.chunks)
					const argument = BigInt(elements.length)
					const additional = argumentToAdditional(argument)
					const head: DataItem.Head = Object.freeze({ majorType: 4, argument, additional })
					await encodeHead(writer, head, options)
					for (const element of elements) await encodeDataItem(writer, element, options)
				} else {
					await encodeHead(writer, head, options)
					for await (const element of value.chunks) await encodeDataItem(writer, element, options)
					await encodeHead(writer, breakStop, options)
				}
			} else {
				await encodeHead(writer, head, options)
				for (const dataItem of value) await encodeDataItem(writer, dataItem, options)
			}
			break
		case "map":
			if (DataItem.Indefinite.isIndefinite(value)) {
				if (deterministic) {
					const sorter = sort === "length-first" ? sortPairsLengthFirst : sortPairsDefault
					const pairs = await sorter(await Array.fromAsync(value.chunks))
					const argument = BigInt(pairs.length)
					const additional = argumentToAdditional(argument)
					const head: DataItem.Head = Object.freeze({ majorType: 5, argument, additional })
					await encodeHead(writer, head, options)
					for (const [key, value] of pairs) {
						await writer.write(key)
						await writer.write(value)
					}
				} else {
					const pairs = value.chunks
					await encodeHead(writer, head, options)
					for await (const [key, value] of pairs) {
						await encodeDataItem(writer, key, options)
						await encodeDataItem(writer, value, options)
					}
					await encodeHead(writer, breakStop, options)
				}
			} else {
				if (deterministic) {
					const sorter = sort === "length-first" ? sortPairsLengthFirst : sortPairsDefault
					const pairs = await sorter(value)
					await encodeHead(writer, head, options)
					for (const [key, value] of pairs) {
						await writer.write(key)
						await writer.write(value)
					}
				} else {
					const pairs = value
					await encodeHead(writer, head, options)
					for (const [key, value] of pairs) {
						await encodeDataItem(writer, key, options)
						await encodeDataItem(writer, value, options)
					}
				}
			}
			break
		case "float":
			await encodeHead(writer, head, options)
			break
		case "simple":
			await encodeHead(writer, head, options)
			break
		default: // number i.e. tag
			await encodeHead(writer, head, options)
			await encodeDataItem(writer, value, options)
			break
	}
}

const encodeHead = async (
	writer: WritableStreamDefaultWriter<Uint8Array>,
	{ majorType, additional: { information, bytes } }: DataItem.Head,
	options: toBytes.Options,
): Promise<void> => {
	await writer.write(Uint8Array.of((majorType << 5) + information))
	await writer.write(await bytes.bytes())
}

const breakStop = Object.freeze({
	majorType: 7,
	argument: undefined,
	additional: Object.freeze({
		information: 31,
		bytes: new Blob([]),
	}),
} as const satisfies DataItem.Head)

const sortPairsDefault = async (
	pairs: readonly (readonly [DataItem, DataItem])[],
): Promise<readonly (readonly [Uint8Array, Uint8Array])[]> =>
	(
		await Promise.all(
			pairs.map(
				async ([key, value]) =>
					[
						await toBytes(key, { deterministic: true }),
						await toBytes(value, { deterministic: true }),
					] as const,
			),
		)
	).toSorted(([keyA], [keyB]) => {
		const length = Math.min(keyA.length, keyB.length)
		for (let i = 0; i < length; i++) {
			const diff = keyA[i]! - keyB[i]!
			if (diff) return diff
		}
		return keyA.length - keyB.length
	})

const sortPairsLengthFirst = async (
	pairs: readonly (readonly [DataItem, DataItem])[],
): Promise<readonly (readonly [Uint8Array, Uint8Array])[]> =>
	(
		await Promise.all(
			pairs.map(
				async ([key, value]) =>
					[
						await toBytes(key, { deterministic: true }),
						await toBytes(value, { deterministic: true }),
					] as const,
			),
		)
	).toSorted(([keyA], [keyB]) => {
		const length = Math.min(keyA.length, keyB.length)
		const diff = keyA.length - keyB.length
		if (diff) return diff
		for (let i = 0; i < length; i++) {
			const diff = keyA[i]! - keyB[i]!
			if (diff) return diff
		}
		return 0
	})

const textEncoder = new TextEncoder()

export default toBytes