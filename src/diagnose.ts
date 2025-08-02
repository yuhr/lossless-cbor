// SPDX-License-Identifier: MPL-2.0

import DataItem from "./DataItem.ts"
import { blobToBigint } from "./internals/blobToBigint.ts"
import { blobToHex } from "./internals/blobToHex.ts"

/**
 * Translates a data item into its [diagnostic notation](https://www.rfc-editor.org/rfc/rfc8949.html#name-diagnostic-notation).
 */
const diagnose = async (dataItem: DataItem, options: diagnose.Options = {}): Promise<string> => {
	const {
		type,
		value,
		head: {
			additional: { information },
		},
	} = dataItem
	const { indent = false, asciiSafe = false, encodingIndicator = false } = options
	const t = indent === true ? "\t" : indent === false ? undefined : indent
	const p /* for “pretty” */ = t !== undefined
	const ei =
		encodingIndicator && (encodingIndicator === true || (encodingIndicator.indefinite ?? false))
	const ef = encodingIndicator && (encodingIndicator === true || (encodingIndicator.float ?? false))
	switch (type) {
		case "int":
			return `${value}`
		case "bstr":
			if (ei && DataItem.Indefinite.isIndefinite(value)) {
				return `(_ ${(
					await Promise.all(
						(await Array.fromAsync(value.chunks)).map(async chunk => await diagnose(chunk)),
					)
				).join(", ")})`
			} else {
				const blob = DataItem.Indefinite.isIndefinite(value)
					? new Blob((await Array.fromAsync(value.chunks)).map(({ value }) => value))
					: value
				return `h'${await blobToHex(blob)}'`
			}
		case "tstr":
			if (ei && DataItem.Indefinite.isIndefinite(value)) {
				return `(_ ${(
					await Promise.all(
						(await Array.fromAsync(value.chunks)).map(async chunk => await diagnose(chunk)),
					)
				).join(", ")})`
			} else {
				const stringify = asciiSafe ? stringifyAsciiSafe : JSON.stringify
				return stringify(
					DataItem.Indefinite.isIndefinite(value)
						? (await Array.fromAsync(value.chunks)).map(({ value }) => value).join("")
						: value,
				)
			}
		case "array": {
			const elements = DataItem.Indefinite.isIndefinite(value)
				? await Array.fromAsync(value.chunks)
				: value
			const i = ei && DataItem.Indefinite.isIndefinite(value)
			return !elements.length
				? `[${i ? "_ " : ""}]`
				: `[${i ? (p ? "_" : "_ ") : ""}${p ? "\n" + t : ""}${(
						await Promise.all(
							elements.map(async element => {
								let e = await diagnose(element, options)
								if (p) e = e.replaceAll("\n", "\n" + t)
								return e
							}),
						)
					).join(p ? ",\n" + t : ", ")}${p ? "\n" : ""}]`
		}
		case "map": {
			const pairs = DataItem.Indefinite.isIndefinite(value)
				? await Array.fromAsync(value.chunks)
				: value
			const i = ei && DataItem.Indefinite.isIndefinite(value)
			return !pairs.length
				? `{${i ? "_ " : ""}}`
				: `{${i ? (p ? "_" : "_ ") : ""}${p ? "\n" + t : ""}${(
						await Promise.all(
							pairs.map(async ([key, value]) => {
								let k = await diagnose(key, options)
								let v = await diagnose(value, options)
								if (p) {
									k = k.replaceAll("\n", "\n" + t)
									v = v.replaceAll("\n", "\n" + t)
								}
								return `${k}: ${v}`
							}),
						)
					).join(p ? ",\n" + t : ", ")}${p ? "\n" : ""}}`
		}
		case "float": {
			const i = ef ? `_${information - 24}` : ""
			if (Object.is(value, NaN)) return "NaN" + i
			else if (Object.is(value, Infinity)) return "Infinity" + i
			else if (Object.is(value, -Infinity)) return "-Infinity" + i
			else if (Object.is(value, 0)) return "0.0" + i
			else if (Object.is(value, -0)) return "-0.0" + i
			else if (Number.isInteger(value))
				return `${value}`.replace(/^(-?\d+)(e[+-]\d+)?$/, "$1.0$2") + i
			else return `${value}` + i
		}
		case "simple":
			if (!("value" in dataItem)) return `simple(${dataItem.head.argument})`
			else return `${value}`
		case 2n:
			if (value.type === "bstr") {
				const blob = DataItem.Indefinite.isIndefinite(value.value)
					? new Blob((await Array.fromAsync(value.value.chunks)).map(({ value }) => value))
					: value.value
				return `${await blobToBigint(blob)}`
			} else throw new Error("Incorrect content for tag number 2.")
		case 3n:
			if (value.type === "bstr") {
				const blob = DataItem.Indefinite.isIndefinite(value.value)
					? new Blob((await Array.fromAsync(value.value.chunks)).map(({ value }) => value))
					: value.value
				return `${-1n - (await blobToBigint(blob))}`
			} else throw new Error("Incorrect content for tag number 3.")
		default:
			return `${type}(${await diagnose(value, options)})`
	}
}

namespace diagnose {
	export type Options = {
		/**
		 * Whether to indent. If a string is given, it is used for each level of indentation. Specifying `true` is equivalent to `"\t"`.
		 *
		 * @default false
		 */
		indent?: boolean | string | undefined

		/**
		 * Whether to escape non-ASCII characters in text strings.
		 *
		 * @default false
		 */
		asciiSafe?: boolean | undefined

		/**
		 * Whether to include encoding indicators.
		 *
		 * @default false
		 */
		encodingIndicator?:
			| boolean
			| {
					indefinite?: boolean | undefined
					float?: boolean | undefined
			  }
			| undefined
	}
}

const stringifyAsciiSafe = (value: unknown): string =>
	JSON.stringify(value).replace(
		/[\u007F-\uFFFF]/g,
		chr => "\\u" + ("0000" + chr.charCodeAt(0).toString(16)).slice(-4),
	)

export default diagnose