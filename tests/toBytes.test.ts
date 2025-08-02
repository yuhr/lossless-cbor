// SPDX-License-Identifier: CC0-1.0

import diagnose from ".../diagnose.ts"
import fromBytes from ".../fromBytes.ts"
import fromValue from ".../fromValue.ts"
import toBytes from ".../toBytes.ts"
import { assertEquals } from "@std/assert"
import { permutations as permute } from "@std/collections"

Deno.test("`toBytes`", async ({ step }) => {
	await step("`deterministic`", async ({ step }) => {
		const deterministic = [10n, 100n, -1n, "z", "aa", [100n], [-1n], false] as const
		const lengthFirst = [10n, -1n, false, 100n, "z", [-1n], "aa", [100n]] as const
		const dataItemDeterministic = await fromValue(new Set(deterministic))
		const dataItemLengthFirst = await fromValue(new Set(lengthFirst))
		const permutations = permute(deterministic)
		const index = Math.floor(Math.random() * permutations.length)
		const permutation = permutations[index]
		const dataItemPermutation = await fromValue(new Set(permutation))
		await step(`for a permutation #${index}`, async ({ step }) => {
			await step("omitted", async ({ step }) => {
				const encoded = await toBytes(dataItemPermutation)
				const decoded = await fromBytes(encoded, { allowEmpty: false })
				assertEquals(await diagnose(decoded), await diagnose(dataItemPermutation))
			})
			await step("`undefined`", async ({ step }) => {
				const encoded = await toBytes(dataItemPermutation, { deterministic: undefined })
				const decoded = await fromBytes(encoded, { allowEmpty: false })
				assertEquals(await diagnose(decoded), await diagnose(dataItemPermutation))
			})
			await step("`false`", async ({ step }) => {
				const encoded = await toBytes(dataItemPermutation, { deterministic: false })
				const decoded = await fromBytes(encoded, { allowEmpty: false })
				assertEquals(await diagnose(decoded), await diagnose(dataItemPermutation))
			})
			await step("`true`", async ({ step }) => {
				await step("`sort`", async ({ step }) => {
					await step("omitted", async ({ step }) => {
						const encoded = await toBytes(dataItemPermutation, { deterministic: true })
						const decoded = await fromBytes(encoded, { allowEmpty: false })
						assertEquals(await diagnose(decoded), await diagnose(dataItemDeterministic))
					})
					await step("`undefined`", async ({ step }) => {
						const encoded = await toBytes(dataItemPermutation, {
							deterministic: true,
							sort: undefined,
						})
						const decoded = await fromBytes(encoded, { allowEmpty: false })
						assertEquals(await diagnose(decoded), await diagnose(dataItemDeterministic))
					})
					await step('`"default"`', async ({ step }) => {
						const encoded = await toBytes(dataItemPermutation, {
							deterministic: true,
							sort: "default",
						})
						const decoded = await fromBytes(encoded, { allowEmpty: false })
						assertEquals(await diagnose(decoded), await diagnose(dataItemDeterministic))
					})
					await step('`"length-first"`', async ({ step }) => {
						const encoded = await toBytes(dataItemPermutation, {
							deterministic: true,
							sort: "length-first",
						})
						const decoded = await fromBytes(encoded, { allowEmpty: false })
						assertEquals(await diagnose(decoded), await diagnose(dataItemLengthFirst))
					})
				})
			})
		})
	})
})