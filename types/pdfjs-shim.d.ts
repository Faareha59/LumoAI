declare module 'pdfjs-dist/build/pdf.worker.mjs?url' {
  const url: string;
  export default url;
}

declare module 'pdfjs-dist' {
  // Minimal surface used by our code
  export const GlobalWorkerOptions: any;
  export function getDocument(src: any): { promise: Promise<any> };
  export type PDFDocumentProxy = any;
}
