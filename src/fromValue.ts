// SPDX-License-Identifier: MPL-2.0

import DataItem from "./DataItem.ts"
import { argumentToAdditional } from "./internals/argumentToAdditional.ts"
import { bigintToBlob } from "./internals/bigintToBlob.ts"

/**
 * Transforms the bare value into an object that represents a CBOR data item in the [preferred](https://www.rfc-editor.org/rfc/rfc8949.html#name-preferred-serialization) way.
 *
 * Default transformations are as follows:
 *
 * - `bigint` -> Integer, tag #2 or #3
 * - `Blob`, `TypedArray`, and `ArrayBuffer` -> Byte string
 * - `string` -> Text string
 * - `unknown[]` -> Array
 * - plain object, `Set`, `Map` -> Map (`Set<T>` is equivalent to `Map<T, undefined>`)
 * - `number` -> Float
 * - `boolean` -> Boolean
 * - `null` -> Null
 * - `undefined` -> Undefined
 * - `Date` -> Tag #0 or #1
 */
const fromValue = async (value: unknown, options: fromValue.Options = {}): Promise<DataItem> => {
	const type = typeof value
	let transformer: fromValue.Transformer | undefined
	try {
		transformer = options.transformers?.get(type)
		if (transformer) return await transformer(value, options)
	} catch (error) {
		if (error !== undefined) throw error
	}
	try {
		transformer = transformersDefault.get(type)
		if (transformer) return await transformer(value, options)
	} catch (error) {
		if (error !== undefined) throw error
	}
	throw new Error("unreachable")
}

namespace fromValue {
	export type Options = {
		/**
		 * A map from the string values of `typeof` operator to corresponding transformers. If not found or threw `undefined`, it falls back to the default implementation: see {@link transformersDefault|`transformersDefault`}.
		 */
		transformers?: Map<Type, fromValue.Transformer> | undefined

		/**
		 * A map from prototypes to corresponding transformers, used in the default transformer for objects. If not found or threw `undefined`, it falls back to the default implementation: see {@link objectTransformersDefault|`objectTransformersDefault`}. It also traverses up the prototype chain until a transformer is found and returns a `DataItem`.
		 */
		objectTransformers?: Map<null | object, fromValue.Transformer> | undefined

		/**
		 * How to represent `Date`s in the resulting data item.
		 *
		 * - "standard" — [tag number 0](https://www.rfc-editor.org/rfc/rfc8949.html#name-standard-date-time-string), string in the standard format described by the [`date-time` production in RFC3339](https://www.rfc-editor.org/rfc/rfc3339.html#section-5.6)
		 * - "epoch-based" — [tag number 1](https://www.rfc-editor.org/rfc/rfc8949.html#name-epoch-based-date-time), number of seconds from `1970-01-01T00:00Z` in UTC
		 *
		 * @default "epoch-based"
		 */
		date?: "date-time" | "epoch-based" | undefined
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export type Transformer<T = any> = (
		value: T,
		options: fromValue.Options,
	) => DataItem | Promise<DataItem>
}

fromValue.fromNumber = (async (value, options = {}): Promise<DataItem.Float> => {
	return DataItem({
		type: "float",
		value,
		head: {
			majorType: 7,
			argument: value,
			additional: argumentToAdditional(value),
		},
	})
}) satisfies fromValue.Transformer<number>

fromValue.fromBigInt = (async (
	value,
	options = {},
): Promise<DataItem.Integer | DataItem.Tag<2n | 3n, DataItem.ByteString>> => {
	let negative = false
	let argument = value
	if (argument < 0n) {
		argument = -1n - argument
		negative = true
	}
	if (argument < 2n ** 64n) {
		return DataItem({
			type: "int",
			value,
			head: {
				majorType: negative ? 1 : 0,
				argument,
				additional: argumentToAdditional(argument),
			},
		})
	} else {
		const type = negative ? (3n as const) : (2n as const)
		return DataItem({
			type,
			value: await fromValue.fromBlob(bigintToBlob(argument), options),
			head: {
				majorType: 6,
				argument: type,
				additional: argumentToAdditional(type),
			},
		})
	}
}) satisfies fromValue.Transformer<bigint>

fromValue.fromBlob = (async (blob, options = {}): Promise<DataItem.ByteString> => {
	const argument = BigInt(blob.size)
	return DataItem({
		type: "bstr",
		value: blob,
		head: {
			majorType: 2,
			argument,
			additional: argumentToAdditional(argument),
		},
	})
}) satisfies fromValue.Transformer<Blob>

const objectTransformersDefault = new Map() as NonNullable<fromValue.Options["objectTransformers"]>

objectTransformersDefault.set(null, async (object: object, options): Promise<DataItem.Map> => {
	const keysOwnEnumerable = (Reflect.ownKeys(object) as (string | symbol)[]).filter(key =>
		Object.prototype.propertyIsEnumerable.call(object, key),
	)
	const value = Object.freeze(
		await Promise.all(
			keysOwnEnumerable.map(async key =>
				Object.freeze([
					await fromValue(key, options),
					await fromValue(object[key as keyof typeof object], options),
				] as const),
			),
		),
	)
	const argument = BigInt(value.length)
	return DataItem({
		type: "map" as const,
		value,
		head: {
			majorType: 5,
			argument,
			additional: argumentToAdditional(argument),
		},
	})
})

objectTransformersDefault.set(Object.prototype, objectTransformersDefault.get(null)!)

objectTransformersDefault.set(Number.prototype, async (object: number, options) => {
	return await fromValue.fromNumber(object.valueOf(), options)
})

objectTransformersDefault.set(BigInt.prototype, async (object: bigint, options) => {
	return await fromValue.fromBigInt(object.valueOf(), options)
})

objectTransformersDefault.set(String.prototype, async (object: string, options) => {
	return await fromValue.fromString(object.valueOf(), options)
})

objectTransformersDefault.set(Boolean.prototype, async (object: boolean, options) => {
	return await fromValue.fromBoolean(object.valueOf(), options)
})

objectTransformersDefault.set(Symbol.prototype, async (object: symbol, options) => {
	return await fromValue.fromSymbol(object.valueOf(), options)
})

objectTransformersDefault.set(Array.prototype, async (object: unknown[], options) => {
	const value = Object.freeze(
		await Promise.all(object.map(async key => await fromValue(key, options))),
	)
	const argument = BigInt(value.length)
	return DataItem({
		type: "array" as const,
		value,
		head: {
			majorType: 4,
			argument,
			additional: argumentToAdditional(argument),
		},
	})
})

objectTransformersDefault.set(Set.prototype, async (object: Set<unknown>, options) => {
	const keys = [...object.keys()]
	const value = Object.freeze(
		await Promise.all(
			keys.map(
				async key => [await fromValue(key, options), await fromValue(undefined, options)] as const,
			),
		),
	)
	const argument = BigInt(value.length)
	return DataItem({
		type: "map" as const,
		value,
		head: {
			majorType: 5,
			argument,
			additional: argumentToAdditional(argument),
		},
	})
})

objectTransformersDefault.set(Map.prototype, async (object: Map<unknown, unknown>, options) => {
	const entries = [...object.entries()]
	const value = Object.freeze(
		await Promise.all(
			entries.map(async ([key, value]) =>
				Object.freeze([await fromValue(key, options), await fromValue(value, options)] as const),
			),
		),
	)
	const argument = BigInt(value.length)
	return DataItem({
		type: "map" as const,
		value,
		head: {
			majorType: 5,
			argument,
			additional: argumentToAdditional(argument),
		},
	})
})

objectTransformersDefault.set(ArrayBuffer.prototype, async (object: ArrayBuffer, options) => {
	return await fromValue.fromBlob(new Blob([object]), options)
})

const TypedArray = Object.getPrototypeOf(Object.getPrototypeOf(Uint8Array.of()))
objectTransformersDefault.set(TypedArray, objectTransformersDefault.get(ArrayBuffer.prototype)!)

objectTransformersDefault.set(Blob.prototype, async (object: Blob, options) => {
	return await fromValue.fromBlob(object, options)
})

objectTransformersDefault.set(Date.prototype, async (object: Date, options) => {
	const { date = "epoch-based" } = options
	if (date === "epoch-based") {
		const type = 1n
		const value = await fromValue.fromNumber(object.getTime() / 1000, options)
		return DataItem({
			type,
			value,
			head: {
				majorType: 6,
				argument: type,
				additional: argumentToAdditional(type),
			},
		})
	} else {
		const type = 0n
		const value = await fromValue.fromString(object.toISOString(), options)
		return DataItem({
			type,
			value,
			head: {
				majorType: 6,
				argument: type,
				additional: argumentToAdditional(type),
			},
		})
	}
})

const enumerateObjectTransformerFor = function* (
	object: object,
	objectTransformers: NonNullable<
		fromValue.Options["objectTransformers"]
	> = objectTransformersDefault,
): Generator<fromValue.Transformer<object>> {
	let prototype: null | object = object
	while (prototype) {
		prototype = Object.getPrototypeOf(prototype)
		const objectTransformer = objectTransformers.get(prototype)
		if (objectTransformer) yield objectTransformer
		const objectTransformerDefault = objectTransformersDefault.get(prototype)
		if (objectTransformerDefault) yield objectTransformerDefault
	}
	throw new Error("unreachable")
}

fromValue.fromObject = (async (value, options = {}) => {
	if (value === null) return await fromValue.fromNull(value, options)
	const objectTransformers = enumerateObjectTransformerFor(value, options.objectTransformers)
	for (const objectTransformer of objectTransformers) return await objectTransformer(value, options)
	throw new Error("unreachable")
}) satisfies fromValue.Transformer<object | null>

const textEncoder = new TextEncoder()

fromValue.fromString = (async (value, options = {}) => {
	const bytes = textEncoder.encode(value)
	const argument = BigInt(bytes.length)
	return DataItem({
		type: "tstr",
		value,
		head: {
			majorType: 3,
			argument,
			additional: argumentToAdditional(argument),
		},
	})
}) satisfies fromValue.Transformer<string>

fromValue.fromBoolean = (async (value, options = {}) => {
	const argument = value ? 21n : 20n
	return DataItem({
		type: "simple",
		value,
		head: {
			majorType: 7,
			argument,
			additional: argumentToAdditional(argument),
		},
	})
}) satisfies fromValue.Transformer<boolean>

fromValue.fromNull = (async (value, options = {}) => {
	const argument = 22n
	return DataItem({
		type: "simple",
		value,
		head: {
			majorType: 7,
			argument,
			additional: argumentToAdditional(argument),
		},
	})
}) satisfies fromValue.Transformer<null>

fromValue.fromUndefined = (async (value, options = {}) => {
	const argument = 23n
	return DataItem({
		type: "simple",
		value,
		head: {
			majorType: 7,
			argument,
			additional: argumentToAdditional(argument),
		},
	})
}) satisfies fromValue.Transformer<undefined>

fromValue.fromSymbol = (async (value, options = {}) => {
	throw new Error("There's no defined way to transform `Symbol` to data item.")
}) satisfies fromValue.Transformer<symbol>

fromValue.fromFunction = (async (value, options = {}) => {
	return fromValue.fromObject(value, options)
}) satisfies fromValue.Transformer<Function>

fromValue.tag = <Number extends bigint>(number: Number) =>
	(async (value, options = {}) =>
		DataItem.Tag(number, await fromValue(value, options))) satisfies fromValue.Transformer<unknown>

const transformersDefault = new Map<Type, fromValue.Transformer>([
	["number", fromValue.fromNumber],
	["bigint", fromValue.fromBigInt],
	["object", fromValue.fromObject],
	["string", fromValue.fromString],
	["boolean", fromValue.fromBoolean],
	["undefined", fromValue.fromUndefined],
	["symbol", fromValue.fromSymbol],
	["function", fromValue.fromFunction],
])

const typeOf = (value: unknown) => typeof value
type Type = ReturnType<typeof typeOf>

export default fromValue