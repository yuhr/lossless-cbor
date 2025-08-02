// SPDX-License-Identifier: MPL-2.0

import type ByteSource from "./ByteSource.ts"
import DataItem from "./DataItem.ts"
import { ByteStream } from "./internals/ByteStream.ts"

/**
 * Decodes the bytes into data items.
 *
 * By default, this API returns an `AsyncIterableIterator` that decodes a [CBOR Sequence](https://www.rfc-editor.org/rfc/rfc8742.html). If you only expect a single data item, set `allowEmpty: false` in the options so it returns a `Promise`.
 */
const fromBytes = <Options extends fromBytes.Options>(
	source: ByteSource,
	options: Options = {} as Options,
): AsyncIterableIteratorOrPromise<DataItem, Options> => {
	const stream = new ByteStream(source).terminate()
	if (options.allowEmpty === undefined) {
		return (async function* () {
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			while (true) {
				try {
					yield await readDataItem(stream, { allowBreak: false })
				} catch (error) {
					if (error === symbolEmpty) return undefined
					else throw error
				}
			}
		})() as any // eslint-disable-line @typescript-eslint/no-explicit-any
	} else {
		return (async () => {
			try {
				return await readDataItem(stream, { allowBreak: false })
			} catch (error) {
				if (error === symbolEmpty)
					if (options.allowEmpty) return undefined as UndefinedForEmpty<Options>
					else throw new Error("Unexpected end of input.")
				else throw error
			}
		})() as any // eslint-disable-line @typescript-eslint/no-explicit-any
	}
}

namespace fromBytes {
	export type Options = {
		/**
		 * If `boolean`, it returns a `Promise` instead of an `AsyncIterableIterator`. If `true`, it resolves `undefined` instead of throw, when no input can be read. Note that it still throws when unexpected end of input is met after a data item head.
		 *
		 * @default undefined
		 */
		allowEmpty?: boolean | undefined
	}
}

const readDataItem = async <Options extends readDataItem.Options>(
	stream: ByteStream,
	options: Options,
): Promise<DataItem | UndefinedForBreak<Options>> => {
	const value = await stream.read(1)
	if (!value) throw symbolEmpty
	const initialByte = value![0]!
	const majorType = (initialByte >> 5) as DataItem.Head.MajorType
	const additionalInformation = initialByte & 0b11111
	let argument: DataItem.Head.Argument | undefined = undefined
	let additionalBytes: Blob | undefined = undefined
	if (additionalInformation < 24) {
		argument = BigInt(additionalInformation)
	} else if (additionalInformation < 28) {
		const exponent = (additionalInformation - 24) as 0 | 1 | 2 | 3
		const value = await stream.read(2 ** exponent)
		if (!value) throw new Error("Unexpected end of input.")
		const buffer = value.buffer
		const dataView = new DataView(buffer)
		const number = dataView[(majorType === 7 ? methodsFloat : methodsInteger)[exponent]](0)
		argument = majorType === 7 && exponent !== 0 ? number : BigInt(number)
		additionalBytes = new Blob([value])
	} else if (additionalInformation < 31) {
		// reserved, not well-formed
	} /* additionalInformation === 31 */ else {
		switch (majorType) {
			case 0:
			case 1:
			case 6:
				// not well-formed
				break
			case 2:
			case 3:
			case 4:
			case 5:
				// indefinite
				break
			case 7:
				if (options.allowBreak) return undefined as UndefinedForBreak<Options>
				else throw new Error("Unexpected break stop code.")
		}
	}
	const information = additionalInformation
	const bytes = additionalBytes ?? new Blob([])
	const additional = Object.freeze({ information, bytes }) satisfies DataItem.Head.Additional
	const head = Object.freeze({ majorType, argument, additional })
	// @ts-expect-error: too complex
	return await dataItemTransformers[head.majorType](head, stream, options)
}

namespace readDataItem {
	export type Options = {
		allowBreak: boolean
	}
}

const dataItemTransformers = [
	// unsinged integers
	async head => DataItem({ type: "int", value: head.argument, head }),

	// negative integers
	async head => DataItem({ type: "int", value: -1n - head.argument, head }),

	// byte strings
	async (head, stream, options) => {
		let value: DataItem.ByteString["value"]
		if (head.argument === undefined) {
			const chunks: DataItem.ByteString.Chunk[] = []
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			while (true) {
				const chunk = await readDataItem(stream, {
					...options,
					allowBreak: true,
				})
				if (!chunk) break
				switch (chunk.type) {
					case "bstr":
						if (DataItem.Indefinite.isIndefinite(chunk.value))
							throw new Error("Nested indefinite-length byte string is not allowed.")
						chunks.push(chunk as DataItem.ByteString.Chunk)
						continue
					default:
						throw new Error(
							"Data item other than byte string is not allowed during indefinite-length byte string.",
						)
				}
			}
			value = DataItem.Indefinite(chunks)
		} else {
			const length = Number(head.argument)
			if (Number.isSafeInteger(length) && 0 <= length) {
				if (length === 0) value = new Blob([])
				else {
					const buffer = await stream.read(length)
					if (!buffer) throw new Error("Coudn't read byte string content from stream.")
					value = new Blob([buffer])
				}
			} else throw new Error(`Unsupported length of bytes: ${head.argument}`)
		}
		return DataItem({ type: "bstr", value, head })
	},

	// text strings
	async (head, stream, options) => {
		let value: DataItem.TextString["value"]
		if (head.argument === undefined) {
			const chunks: DataItem.TextString.Chunk[] = []
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			while (true) {
				const chunk = await readDataItem(stream, {
					...options,
					allowBreak: true,
				})
				if (!chunk) break
				switch (chunk.type) {
					case "tstr":
						if (DataItem.Indefinite.isIndefinite(chunk.value))
							throw new Error("Nested indefinite-length text string is not allowed.")
						chunks.push(chunk as DataItem.TextString.Chunk)
						continue
					default:
						throw new Error(
							"Data item other than text string is allowed during indefinite-length text string.",
						)
				}
			}
			value = DataItem.Indefinite(chunks)
		} else {
			const length = Number(head.argument)
			if (Number.isSafeInteger(length) && 0 <= length) {
				if (length === 0) value = ""
				else {
					const buffer = await stream.read(length)
					if (!buffer) throw new Error("Coudn't read text string content from stream.")
					value = textDecoder.decode(buffer)
				}
			} else throw new Error(`Unsupported length of bytes: ${head.argument}`)
		}
		return DataItem({ type: "tstr", value, head })
	},

	// arrays
	async (head, stream, options) => {
		const elements: DataItem[] = []
		const indefinite = head.argument === undefined
		for (let i = 0; indefinite || i < head.argument; i++) {
			const element = await readDataItem(stream, {
				...options,
				allowBreak: indefinite,
			})
			if (!element) break
			elements.push(element)
		}
		const value = indefinite ? DataItem.Indefinite(elements) : Object.freeze(elements)
		return DataItem({ type: "array", value, head })
	},

	// maps
	async (head, stream, options) => {
		const pairs: (readonly [DataItem, DataItem])[] = []
		const indefinite = head.argument === undefined
		for (let i = 0; indefinite || i < head.argument; i++) {
			const key = await readDataItem(stream, {
				...options,
				allowBreak: indefinite,
			})
			if (!key) break
			const value = (await readDataItem(stream, {
				...options,
				allowBreak: false,
			}))!
			pairs.push(Object.freeze([key, value]))
		}
		const value = indefinite ? DataItem.Indefinite(pairs) : Object.freeze(pairs)
		return DataItem({ type: "map", value, head })
	},

	// tags
	async (head, stream, options) => {
		const content = await readDataItem(stream, {
			...options,
			allowBreak: false,
		})
		return DataItem({ type: head.argument, value: content, head })
	},

	// float or simple values
	async head => {
		const { argument } = head
		if (typeof argument === "number") {
			return DataItem({ type: "float", value: argument, head })
		} else if (typeof argument === "bigint") {
			if (argument < 20n) return DataItem({ type: "simple", head }) // unassigned
			else if (argument === 20n) return DataItem({ type: "simple", value: false, head })
			else if (argument === 21n) return DataItem({ type: "simple", value: true, head })
			else if (argument === 22n) return DataItem({ type: "simple", value: null, head })
			else if (argument === 23n) return DataItem({ type: "simple", value: undefined, head })
			else if (argument < 32n) return DataItem({ type: "simple", head }) // reserved
			/* argument < 256n */ else return DataItem({ type: "simple", head }) // unassigned
		} else {
			throw new Error("Data item head is not well-formed.")
		}
	},
] as const satisfies {
	[MajorType in DataItem.Head.MajorType]: (
		head: DataItem.Head & { majorType: MajorType },
		stream: ByteStream,
		options: readDataItem.Options,
	) => Promise<DataItem>
}

const methodsFloat = ["getUint8", "getFloat16", "getFloat32", "getFloat64"] as const
const methodsInteger = ["getUint8", "getUint16", "getUint32", "getBigUint64"] as const
const textDecoder = new TextDecoder()
const symbolEmpty = Symbol()

type AsyncIterableIteratorOrPromise<T, Options extends fromBytes.Options> = Unspecified<
	Options,
	fromBytes.Options
> extends true
	? AsyncIterableIterator<T>
	: Options["allowEmpty"] extends undefined
		? AsyncIterableIterator<T>
		:
				| (undefined extends Options["allowEmpty"] ? AsyncIterableIterator<T> : never)
				| Promise<T | UndefinedForEmpty<Options>>

type UndefinedForEmpty<Options extends fromBytes.Options> = Unspecified<
	Options,
	fromBytes.Options
> extends true
	? never
	: true extends Options["allowEmpty"]
		? undefined
		: never

type UndefinedForBreak<Options extends readDataItem.Options> = true extends Options["allowBreak"]
	? undefined
	: never

type Unspecified<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
	? true
	: false

export default fromBytes