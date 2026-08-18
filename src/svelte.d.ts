/**
 * Gör att tsc accepterar import av .svelte-filer.
 * Faktisk typning av Svelte-komponenter hanteras av @sveltejs/vite-plugin-svelte
 * och svelte-check — detta är en stub för tsc-passet i build.
 */
declare module '*.svelte' {
  import type { Component } from 'svelte';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: Component<any, any>;
  export default component;
}
