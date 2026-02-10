// Declare module type for prompt text imports, enabling direct text import in TS.
declare module '*.md' {
    const content: string
    export default content
}
