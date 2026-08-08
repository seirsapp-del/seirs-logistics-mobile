// SVG-as-React-component imports (paired with react-native-svg-transformer
// in metro.config.js). Lets us write `import Foo from './foo.svg'` and use
// <Foo width={...} height={...} fill="..." /> like any other component.
declare module '*.svg' {
  import type { SvgProps } from 'react-native-svg';
  const content: React.FC<SvgProps>;
  export default content;
}
