// SPDX-License-Identifier: CC0-1.0

import DataItem from ".../DataItem.ts"
import diagnose from ".../diagnose.ts"
import fromValue from ".../fromValue.ts"
import toValue from ".../toValue.ts"
import { assert, assertEquals, assertFalse } from "@std/assert"

Deno.test("`DataItem`", async ({ step }) => {
	await step("`isDataItem`", async ({ step }) => {
		const dataItem = DataItem({
			head: { majorType: 2, argument: 1n, additional: { information: 0, bytes: new Blob([]) } },
			type: "int",
			value: 1n,
		})
		assert(DataItem.isDataItem(dataItem))
		assertFalse(DataItem.isDataItem({}))
	})

	await step("roundtrips", async ({ step }) => {
		type Roundtrip = [
			unknown,
			unknown,
			{
				fromValue?: fromValue.Options | undefined
				toValue?: toValue.Options | undefined
			}?,
		]
		const roundtrips: Roundtrip[] = [
			[0n, 0n],
			[1n, 1n],
			[-0n, -0n],
			[-1n, -1n],
			[0, 0],
			[1, 1],
			[-0, -0],
			[-1, -1],
			["foo", "foo"],
			[Uint8Array.of(0, 1, 2, 3), Uint8Array.of(0, 1, 2, 3).buffer],
			[new Set([42n]), new Map([[42n, undefined]])],
			[new Map(), new Map()],
			[{ hello: "world" }, new Map([["hello", "world"]])],
			[
				["hello", "world"],
				["hello", "world"],
			],
			[new Date(42), new Date(42)],
			[new Date(42), new Date(42), { fromValue: { date: "epoch-based" } }],
			[2n ** 64n, 2n ** 64n],
			[-(2n ** 64n), -(2n ** 64n)],
		]
		for (const [before, after, options] of roundtrips) {
			const dataItem = await fromValue(before, options?.fromValue)
			await step(await diagnose(dataItem), async ({ step }) => {
				const roundtrip = await toValue(dataItem, options?.toValue)
				if (typeof after === "object") assertEquals(roundtrip, after)
				else assert(Object.is(roundtrip, after))
			})
		}
	})
	await step("`Indefinite`", async ({ step }) => {
		await step("`isIndefinite`", async ({ step }) => {
			const indefinite = DataItem.Indefinite<true>([])
			assert(DataItem.Indefinite.isIndefinite(indefinite))
			assertFalse(DataItem.Indefinite.isIndefinite({}))
		})
	})
})