// SPDX-License-Identifier: MPL-2.0

type ByteSource =
	| Blob
	| ArrayBufferView
	| ArrayBuffer
	| Promise<ByteSource>
	| ReadableStream<ByteSource>
	| AsyncIterable<ByteSource>
	| Iterable<ByteSource>
	| AsyncIterator<ByteSource>
	| Iterator<ByteSource>

export default ByteSource