/**
 * pdf-parse 模块类型声明
 * @description pdf-parse 已从 dependencies 移除（Node-only），此声明仅用于
 *              pdf-parser.ts 中变量形式动态导入的编译期类型检查。
 */
declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string;
    pages: number;
    metadata: {
      info?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    };
    version: string;
  }
  const pdfParse: (buffer: Buffer) => Promise<PdfParseResult>;
  export default pdfParse;
}