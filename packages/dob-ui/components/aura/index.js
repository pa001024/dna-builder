import aura from './object.js';
import { addPrefix } from '../../functions/addPrefix.js';

export default ({ addComponents, prefix = '' }) => {
  const prefixedaura = addPrefix(aura, prefix);
  addComponents({ ...prefixedaura });
};
