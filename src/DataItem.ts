// SPDX-License-Identifier: MPL-2.0

import { argumentToAdditional } from "./internals/argumentToAdditional.ts"

const defineInternals = (object: object, properties: Record<PropertyKey, unknown>): object =>
	Object.defineProperties(
		object,
		Object.fromEntries(
			Reflect.ownKeys(properties).map(key => [
				key,
				{
					value: properties[key],
					configurable: false,
					enumerable: false,
					writable: false,
				},
			]),
		),
	)

const defineEnumerables = (object: object, properties: Record<PropertyKey, unknown>): object =>
	Object.defineProperties(
		object,
		Object.fromEntries(
			Reflect.ownKeys(properties).map(key => [
				key,
				{
					value: properties[key],
					configurable: false,
					enumerable: true,
					writable: false,
				},
			]),
		),
	)

/**
 * <https://www.rfc-editor.org/rfc/rfc8949.html#section-1.2-4.2>
 */
type DataItem = Readonly<
	(
		| { type: "int"; value: bigint }
		| {
				type: "bstr"
				value: Blob | DataItem.Indefinite<DataItem.ByteString.Chunk>
		  }
		| {
				type: "tstr"
				value: string | DataItem.Indefinite<DataItem.TextString.Chunk>
		  }
		| { type: "array"; value: readonly DataItem[] | DataItem.Indefinite<DataItem> }
		| {
				type: "map"
				value:
					| readonly (readonly [DataItem, DataItem])[]
					| DataItem.Indefinite<readonly [DataItem, DataItem]>
		  }
		| { type: bigint; value: DataItem }
		| { type: "simple"; value?: false | true | null | undefined }
		| { type: "float"; value: number }
	) & { head: DataItem.Head }
>

const symbolDataItem = Symbol.for("DataItem")

// eslint-disable-next-line prefer-arrow-functions/prefer-arrow-functions
function DataItem<
	Type extends DataItem.Type,
	Value extends (DataItem & Readonly<{ type: Type }>)["value"],
>(
	parts: DataItem & Readonly<{ type: Type; value?: Value }>,
): DataItem & Readonly<{ type: Type; value?: Value }> {
	if (DataItem.isDataItem(parts)) return parts
	const { head, type, value } = parts as DataItem & Readonly<{ type: Type; value?: Value }>
	const dataItem = {} as DataItem & Readonly<{ type: Type; value: Value }>
	defineInternals(dataItem, { [symbolDataItem]: undefined })
	defineEnumerables(dataItem, { type })
	if ("value" in parts) defineEnumerables(dataItem, { value })
	defineEnumerables(dataItem, { head })
	if (!Object.isFrozen(head.additional)) Object.freeze(head.additional)
	if (!Object.isFrozen(head)) Object.freeze(head)
	Object.freeze(dataItem)
	return dataItem as DataItem & Readonly<{ type: Type; value?: Value }>
}

namespace DataItem {
	/**
	 * Ensures the value is a data item object.
	 */
	export const isDataItem = (value: unknown): value is DataItem =>
		typeof value === "object" && value !== null && symbolDataItem in value

	export type Integer = DataItem & Readonly<{ type: "int" }>
	export type ByteString = DataItem & Readonly<{ type: "bstr" }>
	export type TextString = DataItem & Readonly<{ type: "tstr" }>
	export type Array = DataItem & Readonly<{ type: "array" }>
	export type Map = DataItem & Readonly<{ type: "map" }>
	export type Tag<Number extends bigint, Content extends DataItem = DataItem> = DataItem &
		Readonly<{ type: Number; value: Content }>
	export type Simple = DataItem & Readonly<{ type: "simple" }>
	export type Float = DataItem & Readonly<{ type: "float" }>

	export const Tag = <Number extends bigint, Content extends DataItem = DataItem>(
		number: Number,
		content: Content,
	): DataItem.Tag<Number, Content> =>
		DataItem({
			type: number,
			value: content,
			head: { majorType: 6, argument: number, additional: argumentToAdditional(number) },
		})

	export type Type = DataItem["type"]

	export type Indefinite<T> = { chunks: Indefinite.Chunks<T> }

	const symbolIndefinite = Symbol.for("DataItem.Indefinite")

	// eslint-disable-next-line prefer-arrow-functions/prefer-arrow-functions
	export function Indefinite<T>(chunks: Indefinite.Chunks<T>): Indefinite<T> {
		const indefinite = {} as Indefinite<T>
		defineInternals(indefinite, { [symbolIndefinite]: undefined })
		defineEnumerables(indefinite, { chunks })
		if (!Object.isFrozen(chunks)) Object.freeze(chunks)
		Object.freeze(indefinite)
		return indefinite
	}

	export namespace Indefinite {
		/**
		 * Ensures the value is meant to be the content of an indefinite-length data item.
		 */
		export const isIndefinite = <X, T>(value: X | Indefinite<T>): value is Indefinite<T> =>
			typeof value === "object" && value !== null && symbolIndefinite in value

		export type Chunks<T> = AsyncIterable<T> | Iterable<T>
	}

	export namespace ByteString {
		export type Chunk = DataItem.ByteString & Readonly<{ value: Blob }>
	}

	export namespace TextString {
		export type Chunk = DataItem.TextString & Readonly<{ value: string }>
	}

	export type Head = Readonly<
		(
			| { majorType: 0; argument: bigint }
			| { majorType: 1; argument: bigint }
			| { majorType: 2; argument: bigint | undefined }
			| { majorType: 3; argument: bigint | undefined }
			| { majorType: 4; argument: bigint | undefined }
			| { majorType: 5; argument: bigint | undefined }
			| { majorType: 6; argument: bigint }
			| { majorType: 7; argument: number } // float
			| { majorType: 7; argument: bigint } // simple
			| { majorType: 7; argument: undefined } // reserved, not well-formed
		) & { additional: DataItem.Head.Additional }
	>

	export namespace Head {
		/** The 3-bit information of a data item head. */
		export type MajorType = DataItem.Head["majorType"]

		export type Additional = Readonly<{
			information: DataItem.Head.Additional.Information
			bytes: DataItem.Head.Additional.Bytes
		}>

		export namespace Additional {
			/** The 5-bit information of a data item head. */
			export type Information = number

			/** The following 1, 2, 4, or 8 bytes after a data item head, corresponding to the 5-bit information 24, 25, 26, or 27 respectively. */
			export type Bytes = Blob
		}

		/** The parsed argument value of a data item. */
		export type Argument = DataItem.Head["argument"]
	}
}

export default DataItem