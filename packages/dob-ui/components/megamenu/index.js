import megamenu from './object.js';
import { addPrefix } from '../../functions/addPrefix.js';

export default ({ addComponents, prefix = '' }) => {
  const prefixedmegamenu = addPrefix(megamenu, prefix);
  addComponents({ ...prefixedmegamenu });
};
