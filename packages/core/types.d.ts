// 声明 XML 导入的模块类型，便于在 TS 中直接 import XML 文本。
declare module "*.xml" {
    const content: string
    export default content
}
