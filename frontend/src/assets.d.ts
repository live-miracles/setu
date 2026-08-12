declare module '*.png' {
    const source: string;
    export default source;
}

type BarcodeDetection = {
    rawValue: string;
};

type BarcodeDetectorLike = {
    detect: (source: ImageBitmapSource) => Promise<BarcodeDetection[]>;
};

declare class BarcodeDetector {
    constructor(options?: { formats?: string[] });
    static getSupportedFormats(): Promise<string[]>;
    detect(source: ImageBitmapSource): Promise<BarcodeDetection[]>;
}
