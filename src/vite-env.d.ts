/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'sql.js/dist/sql-wasm.wasm?url' {
  const url: string
  export default url
}
