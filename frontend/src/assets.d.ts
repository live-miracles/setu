declare module '*.png' {
    const source: string;
    export default source;
}

declare module '*.avif' {
    const source: string;
    export default source;
}

declare module '*.wasm' {
    const source: Uint8Array;
    export default source;
}
