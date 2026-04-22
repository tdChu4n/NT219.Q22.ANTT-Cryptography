declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

// Shaka Player compiled bundle dùng `declare namespace shaka` (global) —
// runtime là 1 object default export, types sẽ được cast `as any` trong hook.
declare module 'shaka-player/dist/shaka-player.compiled' {
  const shaka: unknown;
  export default shaka;
}
